/**
 * Host half of the Gerrit workbench.
 *
 * Serves the browser half's read-only Gerrit API under one prefix route on the
 * Harness web server, so Gerrit credentials stay in the Host process and the
 * page calls its own origin instead of a cross-origin Gerrit. Also provides the
 * `gerritWorkbench` service for other Host plugins.
 */

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Credentials, Gerrit, GerritError, TtlCache, statusOf } from './gerrit.js'

/** Prefix of the read-only API route. */
export const API_PREFIX = '/gerrit-workbench/api'

/** Prefix of the write route (review publishing). */
export const WRITE_PREFIX = '/gerrit-workbench/write'

/** Largest request body the write route accepts. */
const MAX_BODY_BYTES = 1_000_000

/** Host services this bundle needs: the browser HTTP carrier for its read-only API. */
export const inject = ['webServer']

/** Resolved defaults; the Loader passes the row's `config` through unvalidated. */
const DEFAULTS = {
  // No default server: the bundle patch stays neutral, and the first run asks
  // for the address on the plugin card's configuration page.
  gerritUrl: '',
  credentialsFile: '~/.gerrit-http-credentials',
  cacheTtlMs: 20_000,
  defaultCwd: '',
  reviewCwd: '',
  sessionMatch: 'patchSet',
}

/**
 * Import the Harness schema library the settings domain generates a
 * configuration page from. This bundle is linked from outside a DSH profile,
 * so `@deepseek-ai/schemastery` is not resolvable from this directory; the
 * fallbacks resolve it through the installation that runs the plugin.
 * @returns {Promise<object | undefined>} the schema module, when found.
 */
async function loadSchema() {
  const bases = [import.meta.url]
  const entry = process.argv[1]
  if (typeof entry === 'string' && entry !== '') bases.push(pathToFileURL(resolve(entry)).href)
  bases.push(pathToFileURL(resolve('package.json')).href)
  for (const base of bases) {
    try {
      const { createRequire } = await import('node:module')
      const resolved = createRequire(base).resolve('@deepseek-ai/schemastery')
      const loaded = await import(pathToFileURL(resolved).href)
      const schema = loaded.default ?? loaded
      if (typeof schema.object === 'function') return schema
    } catch (_unresolved) { /* try the next resolution base */ }
  }
  return undefined
}

const schema = await loadSchema()

/**
 * Config schema. The volatile fields are the ones the generated configuration
 * page can edit: the settings domain only writes volatile fields, and the
 * Loader commits them into the running plugin without a remount, so a saved
 * value applies immediately. The remaining fields are declared so the Loader
 * validates the row's `config` and the settings page can show their resolved
 * values.
 */
export const Config = schema === undefined ? undefined : schema.object({
  gerritUrl: schema.string().default(DEFAULTS.gerritUrl)
    .description('Gerrit 服务器地址').volatile(),
  credentialsFile: schema.string().default(DEFAULTS.credentialsFile)
    .description('保存 Gerrit HTTP 凭据的文件；留空则不读取文件').volatile(),
  cacheTtlMs: schema.natural().default(DEFAULTS.cacheTtlMs).description('Gerrit 读取缓存的有效期（毫秒）'),
  defaultCwd: schema.string().default('').description('审查会话默认工作目录；留空则跟随当前会话'),
  reviewCwd: schema.string().default('').description('审查会话兜底工作目录；留空则使用上方默认目录'),
  username: schema.string().description('Gerrit 用户名；留空则读取凭据文件').volatile(),
  httpPassword: schema.string().role('secret').description('Gerrit HTTP 密码；留空则读取凭据文件').volatile(),
  sessionMatch: schema.union([schema.const('patchSet'), schema.const('change')])
    .default(DEFAULTS.sessionMatch)
    .description('审查会话的记忆方式：按补丁集（patchSet）分别记忆，还是整个变更共用一个会话（change）')
    .volatile(),
})

/** JSON response helper with no caching on the browser side. */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

/** Failure response body the client half understands. */
function failure(error) {
  const code = error instanceof GerritError ? error.code : 'unavailable'
  const message = error instanceof Error ? error.message : String(error)
  return json({ ok: false, error: { code, message } }, statusOf(error))
}

/**
 * Reject a request another site originated: this route answers with data read
 * through the owner's Gerrit credentials, so it must stay same-origin.
 * @param {Request} request - incoming request.
 * @returns {Response | undefined} a rejection, or undefined to continue.
 */
function guardHeaders(origin, host, site) {
  if (origin !== undefined && origin !== null && host !== undefined && host !== null) {
    try {
      if (new URL(origin).host !== host) return 'Cross-origin requests are not allowed.'
    } catch (_invalid) {
      return 'Malformed origin.'
    }
  }
  if (site !== undefined && site !== null && site !== 'same-origin' && site !== 'none') {
    return 'Cross-site requests are not allowed.'
  }
  return undefined
}

/**
 * Reject a request another site originated.
 * @param {Request} request - the Fetch request.
 * @returns {Response | undefined} a rejection, or undefined to continue.
 */
function guard(request) {
  const reason = guardHeaders(request.headers.get('origin'), request.headers.get('host'), request.headers.get('sec-fetch-site'))
  return reason === undefined ? undefined : json({ ok: false, error: { code: 'forbidden', message: reason } }, 403)
}

/** Write one JSON response to a node:http response. */
function sendJson(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

/**
 * Read one JSON request body with a size cap.
 * @param {import('node:http').IncomingMessage} request - incoming request.
 * @returns {Promise<unknown>} the parsed body.
 */
async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new GerritError('bad-request', 'The review payload is too large.')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch (_invalid) {
    throw new GerritError('bad-request', 'The request body is not valid JSON.')
  }
}

/** Validate and normalize the inline comments of one review payload. */
function reviewComments(value) {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object') throw new GerritError('bad-request', 'comments must be an object keyed by path.')
  const out = {}
  for (const [path, list] of Object.entries(value)) {
    if (!Array.isArray(list)) throw new GerritError('bad-request', `comments for ${path} must be an array.`)
    const entries = []
    for (const item of list) {
      if (item === null || typeof item !== 'object') continue
      const line = Number(item.line)
      const message = typeof item.message === 'string' ? item.message.trim() : ''
      if (!Number.isSafeInteger(line) || line < 1) throw new GerritError('bad-request', `invalid line for ${path}.`)
      if (message === '') throw new GerritError('bad-request', `an inline comment on ${path}:${line} is empty.`)
      entries.push({
        line,
        message,
        ...(item.side === 'PARENT' ? { side: 'PARENT' } : {}),
      })
    }
    if (entries.length > 0) out[path] = entries
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/** Validate the requested label votes. */
function reviewLabels(value) {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object') throw new GerritError('bad-request', 'labels must be an object.')
  const out = {}
  for (const [name, vote] of Object.entries(value)) {
    const numeric = Number(vote)
    if (!Number.isSafeInteger(numeric)) throw new GerritError('bad-request', `label ${name} needs an integer vote.`)
    if (numeric !== 0) out[name] = numeric
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/**
 * Host plugin body: build the Gerrit facade and serve the route.
 * @param {object} ctx - Host plugin context.
 * @param {object} [config] - row config from the bundle patch.
 */
export function apply(ctx, config) {
  const options = { ...DEFAULTS, ...(config ?? {}) }

  /** Read one config value the schema may expose as a live reference. */
  function liveValue(value) {
    if (value !== null && typeof value === 'object' && typeof value.get === 'function') return value.get()
    return value
  }

  /** How remembered review sessions are matched, read live from the configuration page. */
  function sessionMatch() {
    return liveValue(options.sessionMatch) === 'change' ? 'change' : 'patchSet'
  }

  /** Connection values as configured right now. */
  function connection() {
    const username = liveValue(options.username)
    const httpPassword = liveValue(options.httpPassword)
    return {
      gerritUrl: String(liveValue(options.gerritUrl) ?? DEFAULTS.gerritUrl),
      username: typeof username === 'string' && username !== '' ? username : undefined,
      httpPassword: typeof httpPassword === 'string' && httpPassword !== '' ? httpPassword : undefined,
      credentialsFile: String(liveValue(options.credentialsFile) ?? ''),
      cacheTtlMs: Number(options.cacheTtlMs) || DEFAULTS.cacheTtlMs,
    }
  }

  const cache = new TtlCache()

  let gerritFace
  let gerritKey

  /**
   * The Gerrit facade for the current configuration. Saving the configuration
   * page commits new values into the running plugin, so this rebuilds the
   * facade (and drops the cache it filled) the first time a value changes.
   * @returns {Gerrit} the facade to use for this request.
   */
  function gerrit() {
    const current = connection()
    const key = JSON.stringify(current)
    if (gerritFace === undefined || key !== gerritKey) {
      cache.clear()
      gerritFace = new Gerrit({
        gerritUrl: current.gerritUrl,
        credentials: new Credentials({
          username: current.username,
          httpPassword: current.httpPassword,
          credentialsFile: current.credentialsFile,
        }),
        cache,
        cacheTtlMs: current.cacheTtlMs,
      })
      gerritKey = key
    }
    return gerritFace
  }

  /**
   * Browser-reported diagnostics (last 60 events). The page and its error
   * boundaries POST-lite a GET here, which keeps the route read-only while
   * still making a rendering failure observable from outside the browser.
   */
  const events = []

  /** Record one diagnostic event, bounded. */
  function record(event, detail) {
    events.push({ at: new Date().toISOString(), event, detail: detail ?? '' })
    if (events.length > 60) events.splice(0, events.length - 60)
  }

  /** Default working directory for a review session the page creates. */
  const defaultCwd = () => {
    if (typeof options.defaultCwd === 'string' && options.defaultCwd !== '') return options.defaultCwd
    const workingDirectory = ctx.get('workingDirectory')
    return workingDirectory === undefined ? '' : workingDirectory.defaultDirectory
  }

  /**
   * Answer one API call.
   * @param {Request} request - the HTTP request.
   * @returns {Promise<Response>} the response.
   */
  async function handle(request) {
    const rejected = guard(request)
    if (rejected !== undefined) return rejected
    const url = new URL(request.url)
    const path = url.pathname.slice(API_PREFIX.length) || '/'
    const params = url.searchParams
    try {
      const current = connection()
      const configured = current.gerritUrl !== ''
      if (path === '/meta' || path === '/') {
        let self
        let error
        if (configured) {
          try {
            self = await gerrit().self()
          } catch (failure) {
            error = failure instanceof Error ? failure.message : String(failure)
          }
        }
        return json({
          ok: true,
          value: {
            configured,
            gerritUrl: configured ? gerrit().url : '',
            self: self ?? null,
            error: error ?? null,
            username: current.username ?? '',
            hasHttpPassword: current.httpPassword !== undefined,
            credentialsFile: current.credentialsFile,
            defaultCwd: defaultCwd(),
            reviewCwd: typeof options.reviewCwd === 'string' ? options.reviewCwd : '',
            sessionMatch: sessionMatch(),
            api: API_PREFIX,
          },
        })
      }
      if (path !== '/diag' && path !== '/refresh' && !configured) {
        return json({ ok: false, error: { code: 'bad-request', message: 'The Gerrit server address is not configured yet; set it on Plugins → Gerrit workbench.' } }, 400)
      }
      if (path === '/diag') {
        if (params.get('event') !== null) {
          record(params.get('event'), params.get('detail') ?? '')
          return json({ ok: true, value: { recorded: true } })
        }
        return json({ ok: true, value: { events, gerritUrl: gerrit().url, defaultCwd: defaultCwd() } })
      }
      if (path === '/refresh') {
        cache.clear()
        return json({ ok: true, value: { cleared: true } })
      }
      if (path === '/changes') {
        if (params.get('force') === '1') cache.clear()
        const page = await gerrit().listChanges({
          scope: params.get('scope') ?? 'outgoing',
          q: params.get('q') ?? undefined,
          status: params.get('status') ?? 'open',
          limit: params.get('limit') ?? undefined,
          start: params.get('start') ?? undefined,
        })
        return json({ ok: true, value: page })
      }
      const change = /^\/change\/([^/]+)(\/.*)?$/.exec(path)
      if (change !== null) {
        const id = decodeURIComponent(change[1])
        const rest = change[2] ?? ''
        if (rest === '' || rest === '/') {
          const detail = await gerrit().getChange(id, params.get('rev') ?? undefined)
          return json({ ok: true, value: detail })
        }
        if (rest === '/diff') {
          const file = params.get('path')
          if (file === null || file === '') return failure(new GerritError('bad-request', 'A diff request needs a path parameter.'))
          const diff = await gerrit().getDiff(id, file, {
            rev: params.get('rev') ?? undefined,
            base: params.get('base') ?? undefined,
            full: params.get('full') === '1',
          })
          return json({ ok: true, value: diff })
        }
        if (rest === '/comments') {
          const comments = await gerrit().getComments(id)
          return json({ ok: true, value: comments })
        }
      }
      return json({ ok: false, error: { code: 'not-found', message: `Unknown Gerrit workbench API path: ${path}` } }, 404)
    } catch (error) {
      return failure(error)
    }
  }

  /**
   * Answer one write request: publish a review with label votes and inline
   * comments, through the same HTTP API the Gerrit web UI uses.
   * @param {import('node:http').IncomingMessage} request - incoming request.
   * @param {import('node:http').ServerResponse} response - response owner.
   */
  async function handleWrite(request, response) {
    const reason = guardHeaders(request.headers.origin, request.headers.host, request.headers['sec-fetch-site'])
    if (reason !== undefined) {
      sendJson(response, 403, { ok: false, error: { code: 'forbidden', message: reason } })
      return
    }
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST')
      sendJson(response, 405, { ok: false, error: { code: 'bad-request', message: 'The write route accepts POST only.' } })
      return
    }
    if (connection().gerritUrl === '') {
      sendJson(response, 400, { ok: false, error: { code: 'bad-request', message: 'The Gerrit server address is not configured yet; set it on Plugins → Gerrit workbench.' } })
      return
    }
    try {
      const body = await readJsonBody(request)
      const url = new URL(request.url ?? '/', 'http://localhost')
      const path = url.pathname.slice(WRITE_PREFIX.length) || '/'
      if (path !== '/review') {
        sendJson(response, 404, { ok: false, error: { code: 'not-found', message: `Unknown write path: ${path}` } })
        return
      }
      const change = body.change
      const revision = body.revision
      if (change === undefined || change === null || String(change) === '') throw new GerritError('bad-request', 'A review needs a change.')
      if (typeof revision !== 'string' || revision === '') throw new GerritError('bad-request', 'A review needs a revision.')
      const info = await gerrit().postReview(change, revision, {
        message: typeof body.message === 'string' ? body.message : '',
        labels: reviewLabels(body.labels),
        comments: reviewComments(body.comments),
        tag: 'dsh-gerrit-workbench',
      })
      sendJson(response, 200, { ok: true, value: { posted: true, labels: info !== null && typeof info === 'object' && info.labels !== undefined ? info.labels : {} } })
    } catch (error) {
      const code = error instanceof GerritError ? error.code : 'unavailable'
      const message = error instanceof Error ? error.message : String(error)
      const status = statusOf(error)
      sendJson(response, status, { ok: false, error: { code, message } })
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    resource: handle,
  }), 'gerrit-workbench: api route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: WRITE_PREFIX,
    handler: handleWrite,
  }), 'gerrit-workbench: write route')

  // Host-side face for other plugins and future tools: the same normalized reads.
  ctx.provide('gerritWorkbench', {
    get url() { return gerrit().url },
    self: () => gerrit().self(),
    listChanges: params => gerrit().listChanges(params),
    getChange: (id, rev) => gerrit().getChange(id, rev),
    getDiff: (id, path, readOptions) => gerrit().getDiff(id, path, readOptions),
    getComments: id => gerrit().getComments(id),
    defaultCwd,
    clearCache: () => { cache.clear() },
  })

  console.log(`gerrit-workbench: serving ${API_PREFIX}${connection().gerritUrl === '' ? ' (Gerrit server not configured yet)' : ` for ${gerrit().url}`}`)
}
