/**
 * Gerrit REST client used by the Host half of the Gerrit workbench.
 *
 * Everything here is framework-free: credential discovery, one authenticated
 * GET helper, and normalization of Gerrit entities into the compact JSON the
 * browser half renders. No Cordis or Harness import, so the module can be
 * exercised by a plain Node script.
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

/** Gerrit answers REST bodies with an anti-XSSI prefix that must be dropped. */
const XSSI = /^\)\]\}'/

/** Cap on how many rows one diff answer may carry; larger files are compacted. */
const MAX_DIFF_ROWS = 4000
/** Context lines kept around a change when a file is too large to answer whole. */
const COMPACT_CONTEXT = 3
/** Default request timeout for one Gerrit round trip. */
const REQUEST_TIMEOUT_MS = 20_000

/**
 * Expand a leading `~` to the host user's home directory.
 * @param {string} path - configured or discovered file path.
 * @returns {string} an absolute path.
 */
export function expandHome(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return isAbsolute(path) ? path : join(process.cwd(), path)
}

/**
 * Parse one credentials file. Accepts the formats this deployment writes:
 * `username:<name>` followed by the HTTP password on the next line, a single
 * `user:password` line, an `https://user:password@host` URL, an `user`/`password`
 * pair of lines, or a lone token (paired with the configured username).
 * @param {string} text - file contents.
 * @returns {{ username?: string, password?: string } | undefined} parsed pair.
 */
export function parseCredentials(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')
  if (lines.length === 0) return undefined
  const first = lines[0]
  if (first.startsWith('username:')) {
    const username = first.slice('username:'.length).trim()
    const password = lines[1]
    if (username !== '' && password !== undefined) return { username, password }
    return undefined
  }
  const url = /^(https?:\/\/)([^@/]+)@/.exec(first)
  if (url !== null) {
    const userinfo = url[2]
    const colon = userinfo.indexOf(':')
    if (colon > 0) return { username: decodeURIComponent(userinfo.slice(0, colon)), password: decodeURIComponent(userinfo.slice(colon + 1)) }
    return undefined
  }
  if (lines.length >= 2 && !first.includes(':')) return { username: first, password: lines[1] }
  const colon = first.indexOf(':')
  if (colon > 0) return { username: first.slice(0, colon), password: first.slice(colon + 1) }
  return undefined
}

/**
 * Discover the HTTP credentials this workbench authenticates with.
 * An explicit username plus password in the plugin config wins; otherwise the
 * credentials file is read once per cache window.
 */
export class Credentials {
  /**
   * @param {object} options - resolved plugin config.
   * @param {string} [options.username] - explicit HTTP username.
   * @param {string} [options.httpPassword] - explicit HTTP password or token.
   * @param {string} [options.credentialsFile] - file holding the pair.
   */
  constructor(options) {
    this.options = options
    this.cached = undefined
    this.cachedAt = 0
  }

  /**
   * Read the credential pair, remembering a successful read briefly.
   * @returns {Promise<{ username: string, password: string, source: string } | undefined>} the pair.
   */
  async resolve() {
    const { username, httpPassword, credentialsFile } = this.options
    if (typeof username === 'string' && username !== '' && typeof httpPassword === 'string' && httpPassword !== '') {
      return { username, password: httpPassword, source: 'config' }
    }
    if (this.cached !== undefined && Date.now() - this.cachedAt < 60_000) return this.cached
    if (typeof credentialsFile !== 'string' || credentialsFile === '') return undefined
    let text
    try {
      text = await readFile(expandHome(credentialsFile), 'utf8')
    } catch (_missing) {
      return undefined
    }
    const parsed = parseCredentials(text)
    if (parsed === undefined) return undefined
    const resolved = {
      username: typeof username === 'string' && username !== '' ? username : parsed.username,
      password: parsed.password,
      source: expandHome(credentialsFile),
    }
    if (resolved.username === undefined) return undefined
    this.cached = resolved
    this.cachedAt = Date.now()
    return resolved
  }
}

/** A tiny TTL cache: entries expire by age and the table is bounded. */
export class TtlCache {
  /**
   * @param {number} [limit] - maximum retained entries.
   */
  constructor(limit = 120) {
    this.limit = limit
    this.entries = new Map()
  }

  /**
   * @param {string} key - cache key.
   * @returns {unknown} the value while fresh.
   */
  get(key) {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    if (entry.expires < Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  /**
   * @param {string} key - cache key.
   * @param {unknown} value - value to retain.
   * @param {number} ttlMs - freshness window.
   */
  set(key, value, ttlMs) {
    if (this.entries.size >= this.limit) {
      const oldest = this.entries.keys().next()
      if (!oldest.done) this.entries.delete(oldest.value)
    }
    this.entries.set(key, { value, expires: Date.now() + ttlMs })
  }

  /** Drop every entry. */
  clear() {
    this.entries.clear()
  }
}

/** Normalize a Gerrit account (or leave it out). */
function account(value) {
  if (value === null || typeof value !== 'object') return null
  return {
    id: typeof value._account_id === 'number' ? value._account_id : null,
    name: typeof value.name === 'string' ? value.name : '',
    email: typeof value.email === 'string' ? value.email : '',
    username: typeof value.username === 'string' ? value.username : '',
  }
}

/** Read one label entry into the facts the list renders. */
function label(value) {
  if (value === null || typeof value !== 'object') return null
  const votes = []
  if (Array.isArray(value.all)) {
    for (const voter of value.all) {
      if (voter === null || typeof voter !== 'object') continue
      const id = account(voter)
      votes.push({
        value: typeof voter.value === 'number' ? voter.value : 0,
        name: id === null ? '' : id.name,
        username: id === null ? '' : id.username,
      })
    }
  }
  return {
    value: typeof value.value === 'number' ? value.value : 0,
    approved: value.approved === true,
    rejected: value.rejected === true,
    recommended: value.recommended === true,
    disliked: value.disliked === true,
    blocking: value.blocking === true,
    optional: value.optional === true,
    votes,
  }
}

/** Read a labels map. */
function labelsOf(value) {
  /** @type {Record<string, unknown>} */
  const out = {}
  if (value === null || typeof value !== 'object') return out
  for (const [name, entry] of Object.entries(value)) {
    const read = label(entry)
    if (read !== null) out[name] = read
  }
  return out
}

/** Gerrit's project path inside its web UI URL. */
function changeUrl(baseUrl, project, number) {
  return `${baseUrl.replace(/\/+$/, '')}/c/${project}/+/${number}`
}

/** One revision object into the compact shape. */
function revisionOf(sha, value, baseUrl) {
  if (value === null || typeof value !== 'object') return null
  const commit = value.commit !== null && typeof value.commit === 'object' ? value.commit : undefined
  return {
    revision: sha,
    number: typeof value._number === 'number' ? value._number : 0,
    created: typeof value.created === 'string' ? value.created : '',
    uploader: account(value.uploader),
    kind: typeof value.kind === 'string' ? value.kind : '',
    subject: commit !== undefined && typeof commit.subject === 'string' ? commit.subject : '',
    message: commit !== undefined && typeof commit.message === 'string' ? commit.message : '',
    parents: commit !== undefined && Array.isArray(commit.parents)
      ? commit.parents.map(parent => (parent !== null && typeof parent === 'object' ? String(parent.commit ?? '') : '')).filter(Boolean)
      : [],
    authorDate: commit !== undefined && commit.author !== undefined && typeof commit.author.date === 'string' ? commit.author.date : '',
  }
}

/** Content types Gerrit reports for text that is still readable in a diff. */
const TEXTUAL_TYPE = /^(text\/)|json|xml|javascript|x-sh|x-python|x-c\+\+|x-httpd-php|toml|yaml|x-perl|x-ruby/i

/** Whether one side's content type describes binary content. */
function binaryType(type) {
  return type !== '' && !TEXTUAL_TYPE.test(type)
}

/** Whether a files-map entry describes binary content (Gerrit omits line counts). */
function binaryEntry(entry) {
  return entry !== null
    && typeof entry === 'object'
    && entry.lines_inserted === undefined
    && entry.lines_deleted === undefined
    && entry.size !== undefined
}

/** One list row. */
function changeOf(change, baseUrl) {
  const number = typeof change._number === 'number' ? change._number : 0
  const project = typeof change.project === 'string' ? change.project : ''
  const revisions = change.revisions !== null && typeof change.revisions === 'object' ? change.revisions : {}
  const current = typeof change.current_revision === 'string' ? change.current_revision : ''
  const currentRevision = current !== '' && revisions[current] !== undefined ? revisions[current] : undefined
  return {
    number,
    changeId: typeof change.change_id === 'string' ? change.change_id : '',
    project,
    branch: typeof change.branch === 'string' ? change.branch : '',
    subject: typeof change.subject === 'string' ? change.subject : '',
    status: typeof change.status === 'string' ? change.status : 'NEW',
    created: typeof change.created === 'string' ? change.created : '',
    updated: typeof change.updated === 'string' ? change.updated : '',
    topic: typeof change.topic === 'string' ? change.topic : '',
    owner: account(change.owner),
    insertions: typeof change.insertions === 'number' ? change.insertions : 0,
    deletions: typeof change.deletions === 'number' ? change.deletions : 0,
    url: changeUrl(baseUrl, project, number),
    patchSet: currentRevision !== undefined && typeof currentRevision._number === 'number' ? currentRevision._number : 0,
    revision: current,
    labels: labelsOf(change.labels),
    commentCount: typeof change.total_comment_count === 'number' ? change.total_comment_count : 0,
    unresolved: typeof change.unresolved_comment_count === 'number' ? change.unresolved_comment_count : 0,
    wip: change.work_in_progress === true,
    mergeable: change.mergeable === true ? true : change.mergeable === false ? false : null,
  }
}

/**
 * Turn Gerrit's side-by-side diff blocks into unified rows with line numbers,
 * following `context=ALL` output where every line of both sides is present.
 * @param {Array<object>} content - the diff `content` array.
 * @returns {{ rows: Array<object>, oldLines: number, newLines: number }} rows.
 */
export function rowsFromDiff(content) {
  const rows = []
  let oldNo = 1
  let newNo = 1
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    if (Array.isArray(block.ab)) {
      for (const text of block.ab) {
        rows.push({ t: 'ctx', o: oldNo++, n: newNo++, s: text })
      }
      continue
    }
    if (Array.isArray(block.a)) {
      for (const text of block.a) rows.push({ t: 'del', o: oldNo++, n: null, s: text })
    }
    if (Array.isArray(block.b)) {
      for (const text of block.b) rows.push({ t: 'add', o: null, n: newNo++, s: text })
    }
  }
  return { rows, oldLines: oldNo - 1, newLines: newNo - 1 }
}

/**
 * Keep the changed rows and `context` neighbours, folding dropped runs into
 * gap markers so a very large file still opens quickly.
 * @param {Array<object>} rows - complete unified rows.
 * @param {number} context - context lines to keep on each side of a change.
 * @returns {Array<object>} compacted rows, where `{ t: 'gap', g: n }` hides n lines.
 */
export function compactRows(rows, context = COMPACT_CONTEXT) {
  const keep = new Uint8Array(rows.length)
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].t === 'ctx') continue
    const from = Math.max(0, index - context)
    const to = Math.min(rows.length - 1, index + context)
    for (let mark = from; mark <= to; mark += 1) keep[mark] = 1
  }
  const out = []
  let gap = 0
  for (let index = 0; index < rows.length; index += 1) {
    if (keep[index] === 1) {
      if (gap > 0) {
        out.push({ t: 'gap', g: gap })
        gap = 0
      }
      out.push(rows[index])
    } else {
      gap += 1
    }
  }
  if (gap > 0) out.push({ t: 'gap', g: gap })
  return out
}

/** The Gerrit facade one route handler mutates. */
export class Gerrit {
  /**
   * @param {object} options - resolved plugin config.
   * @param {string} options.gerritUrl - Gerrit base URL.
   * @param {Credentials} options.credentials - credential source.
   * @param {TtlCache} options.cache - response cache.
   * @param {number} [options.cacheTtlMs] - list/detail freshness.
   * @param {string} [options.username] - configured HTTP username.
   */
  constructor(options) {
    this.baseUrl = options.gerritUrl.replace(/\/+$/, '')
    this.credentials = options.credentials
    this.cache = options.cache
    this.cacheTtlMs = options.cacheTtlMs ?? 20_000
  }

  /** The public base URL, without a trailing slash. */
  get url() {
    return this.baseUrl
  }

  /**
   * One authenticated Gerrit REST GET.
   * @param {string} path - REST path below `/a`, already encoded.
   * @param {object} [options] - request options.
   * @param {boolean} [options.anonymous] - skip the `/a` prefix and credentials.
   * @returns {Promise<unknown>} the decoded JSON body.
   */
  async request(path, options = {}) {
    const authenticated = options.anonymous !== true
    const method = typeof options.method === 'string' ? options.method : 'GET'
    const headers = { accept: 'application/json' }
    if (authenticated) {
      const credentials = await this.credentials.resolve()
      if (credentials === undefined) {
        throw new GerritError('unauthenticated', 'No Gerrit HTTP credentials were found; set username/httpPassword or point credentialsFile at ~/.gerrit-http-credentials.')
      }
      headers.authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`
    }
    let payload
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json; charset=utf-8'
      payload = JSON.stringify(options.body)
    }
    const prefix = authenticated ? '/a' : ''
    const response = await fetch(`${this.baseUrl}${prefix}${path}`, {
      method,
      headers,
      body: payload,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const text = await response.text()
    const body = text.replace(XSSI, '')
    if (!response.ok) {
      // Gerrit business failures arrive as `{"error": "..."}` (older) or `{"message": "..."}`.
      let message = body.trim()
      try {
        const parsed = JSON.parse(body)
        if (parsed !== null && typeof parsed === 'object') {
          if (typeof parsed.message === 'string') message = parsed.message
          else if (typeof parsed.error === 'string') message = parsed.error
        }
      } catch (_notJson) {
        message = message.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
      }
      message = message.slice(0, 600)
      if (response.status === 401 || response.status === 403) {
        throw new GerritError('unauthenticated', `Gerrit rejected the HTTP credentials (${response.status}). ${message}`)
      }
      if (response.status === 404) throw new GerritError('not-found', message === '' ? 'Gerrit reports no such resource.' : message)
      if (response.status === 400 || response.status === 409) throw new GerritError('bad-request', message)
      throw new GerritError('unavailable', `Gerrit answered ${response.status}: ${message}`)
    }
    if (body.trim() === '') return null
    try {
      return JSON.parse(body)
    } catch (_invalid) {
      throw new GerritError('unavailable', 'Gerrit answered with a body that is not JSON.')
    }
  }

  /**
   * Publish one review: an optional summary message, label votes, and inline
   * comments (the same ReviewInput the Gerrit web UI posts).
   * @param {number|string} id - change identity.
   * @param {string} revision - revision sha the review is anchored to.
   * @param {object} input - review content.
   * @param {string} [input.message] - summary message.
   * @param {Record<string, number>} [input.labels] - label name → vote.
   * @param {Record<string, Array<{line: number, message: string, side?: string}>>} [input.comments] - comments by path.
   * @param {string} [input.tag] - review tag shown in the change log.
   * @returns {Promise<object>} Gerrit's ReviewInfo.
   */
  async postReview(id, revision, input) {
    const target = encodeURIComponent(String(id))
    const body = {}
    if (typeof input.message === 'string' && input.message.trim() !== '') body.message = input.message
    if (input.labels !== undefined && Object.keys(input.labels).length > 0) body.labels = input.labels
    if (input.comments !== undefined && Object.keys(input.comments).length > 0) body.comments = input.comments
    if (typeof input.tag === 'string' && input.tag !== '') body.tag = input.tag
    if (typeof body.message !== 'string' && body.labels === undefined && body.comments === undefined) {
      throw new GerritError('bad-request', 'A review needs a message, a label vote, or at least one comment.')
    }
    const result = await this.request(`/changes/${target}/revisions/${encodeURIComponent(revision)}/review`, { method: 'POST', body })
    this.cache.clear()
    return result === null ? {} : result
  }

  /**
   * Create one private draft comment (used for safe write-path checks: drafts
   * are visible only to their author and can be deleted again).
   * @param {number|string} id - change identity.
   * @param {string} revision - revision sha.
   * @param {{path: string, line: number, message: string, side?: string}} comment - the draft.
   * @returns {Promise<object>} Gerrit's DraftInfo.
   */
  async createDraft(id, revision, comment) {
    const target = encodeURIComponent(String(id))
    const result = await this.request(`/changes/${target}/revisions/${encodeURIComponent(revision)}/drafts`, {
      method: 'PUT',
      body: comment,
    })
    return result === null ? {} : result
  }

  /**
   * Delete one draft comment.
   * @param {number|string} id - change identity.
   * @param {string} revision - revision sha.
   * @param {string} draftId - Gerrit draft id.
   */
  async deleteDraft(id, revision, draftId) {
    const target = encodeURIComponent(String(id))
    await this.request(`/changes/${target}/revisions/${encodeURIComponent(revision)}/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE' })
  }

  /**
   * Read the signed-in account.
   * @returns {Promise<object>} the account.
   */
  async self() {
    return account(await this.request('/accounts/self'))
  }

  /**
   * List changes for one named scope or a free query.
   * @param {object} params - query parameters.
   * @param {'outgoing'|'incoming'|'all'|'query'} params.scope - named scope.
   * @param {string} [params.q] - raw query appended to the scope.
   * @param {string} [params.status] - `open`, `merged`, `abandoned`, or empty for any.
   * @param {number} [params.limit] - page size.
   * @param {number} [params.start] - paging offset.
   * @returns {Promise<{ changes: Array<object>, more: boolean }>} the page.
   */
  async listChanges(params) {
    const scope = typeof params.scope === 'string' ? params.scope : 'outgoing'
    const status = typeof params.status === 'string' ? params.status : 'open'
    const limit = Math.min(Math.max(Number.parseInt(String(params.limit ?? '40'), 10) || 40, 1), 200)
    const start = Math.max(Number.parseInt(String(params.start ?? '0'), 10) || 0, 0)
    const parts = []
    if (scope === 'outgoing') parts.push('owner:self')
    else if (scope === 'incoming') parts.push('reviewer:self', '-owner:self')
    else if (scope === 'all') parts.push('(owner:self OR reviewer:self)')
    if (status === 'open') parts.push('status:open')
    else if (status === 'merged') parts.push('status:merged')
    else if (status === 'abandoned') parts.push('status:abandoned')
    if (scope === 'query' && typeof params.q !== 'string') throw new GerritError('bad-request', 'The query scope needs a q parameter.')
    if (typeof params.q === 'string' && params.q.trim() !== '') parts.push(params.q.trim())
    const query = parts.join(' ')
    const cacheKey = `list:${query}:${limit}:${start}`
    const cached = this.cache.get(cacheKey)
    if (cached !== undefined) return cached
    const search = new URLSearchParams({ q: query, n: String(limit), S: String(start) })
    search.set('o', 'LABELS')
    search.append('o', 'DETAILED_ACCOUNTS')
    search.append('o', 'CURRENT_REVISION')
    const raw = await this.request(`/changes/?${search.toString()}`)
    if (!Array.isArray(raw)) throw new GerritError('unavailable', 'Gerrit did not answer with a change list.')
    const changes = raw.map(change => changeOf(change, this.baseUrl))
    const more = raw.some(change => change !== null && typeof change === 'object' && change._more_changes === true)
      || raw.length === limit
    const page = { changes, more, query, start, limit }
    this.cache.set(cacheKey, page, this.cacheTtlMs)
    return page
  }

  /**
   * Read one change: the change itself, its revisions, its messages, and the
   * files of one patch set.
   * @param {number|string} id - change number, change id, or `project~branch~id`.
   * @param {string} [rev] - patch set number, revision sha, or empty for current.
   * @returns {Promise<object>} the detail.
   */
  async getChange(id, rev) {
    const target = encodeURIComponent(String(id))
    const search = new URLSearchParams()
    for (const option of ['CURRENT_REVISION', 'ALL_REVISIONS', 'CURRENT_COMMIT', 'LABELS', 'DETAILED_ACCOUNTS', 'MESSAGES']) {
      search.append('o', option)
    }
    const cacheKey = `detail:${target}`
    let detail = this.cache.get(cacheKey)
    if (detail === undefined) {
      detail = await this.request(`/changes/${target}/detail?${search.toString()}`)
      this.cache.set(cacheKey, detail, this.cacheTtlMs)
    }
    const base = changeOf(detail, this.baseUrl)
    const revisions = detail !== null && typeof detail === 'object' && detail.revisions !== null && typeof detail.revisions === 'object'
      ? Object.entries(detail.revisions).map(([sha, value]) => revisionOf(sha, value, this.baseUrl)).filter(value => value !== null)
      : []
    revisions.sort((left, right) => right.number - left.number)
    const requested = typeof rev === 'string' && rev !== '' ? rev : 'current'
    let selected = base.revision
    let patchSet = base.patchSet
    if (/^\d+$/.test(requested)) {
      const match = revisions.find(entry => entry.number === Number(requested))
      if (match !== undefined) {
        selected = match.revision
        patchSet = match.number
      }
    } else if (requested !== 'current') {
      const match = revisions.find(entry => entry.revision === requested)
      if (match !== undefined) {
        selected = match.revision
        patchSet = match.number
      }
    }
    const files = {}
    let fileError = ''
    try {
      const listing = await this.request(`/changes/${target}/revisions/${encodeURIComponent(selected === '' ? 'current' : selected)}/files/`)
      if (listing !== null && typeof listing === 'object') {
        for (const [path, entry] of Object.entries(listing)) {
          if (entry === null || typeof entry !== 'object') continue
          files[path] = {
            path,
            status: typeof entry.status === 'string' ? entry.status : 'M',
            insertions: typeof entry.lines_inserted === 'number' ? entry.lines_inserted : 0,
            deletions: typeof entry.lines_deleted === 'number' ? entry.lines_deleted : 0,
            size: typeof entry.size === 'number' ? entry.size : 0,
            sizeDelta: typeof entry.size_delta === 'number' ? entry.size_delta : 0,
            binary: binaryEntry(entry),
          }
        }
      }
    } catch (error) {
      fileError = error instanceof Error ? error.message : String(error)
    }
    const reviewers = []
    if (detail.reviewers !== null && typeof detail.reviewers === 'object') {
      for (const entry of Object.values(detail.reviewers)) {
        if (!Array.isArray(entry)) continue
        for (const person of entry) {
          const read = account(person)
          if (read !== null && !reviewers.some(existing => existing.id === read.id)) reviewers.push(read)
        }
      }
    }
    const messages = Array.isArray(detail.messages)
      ? detail.messages.slice(-30).map(message => ({
        id: typeof message.id === 'string' ? message.id : '',
        author: account(message.author),
        date: typeof message.date === 'string' ? message.date : '',
        text: typeof message.message === 'string' ? message.message : '',
        tag: typeof message.tag === 'string' ? message.tag : '',
        revision: typeof message._revision_number === 'number' ? message._revision_number : null,
      }))
      : []
    return {
      ...base,
      url: changeUrl(this.baseUrl, base.project, base.number),
      revisions,
      patchSet,
      revision: selected,
      files: Object.values(files).sort((left, right) => left.path.localeCompare(right.path)),
      fileError,
      reviewers,
      messages,
      permittedLabels: detail.permitted_labels !== null && typeof detail.permitted_labels === 'object' ? detail.permitted_labels : {},
      currentRevision: base.revision,
    }
  }

  /**
   * Read one file's diff as unified rows.
   * @param {number|string} id - change identity.
   * @param {string} path - repo-relative file path.
   * @param {object} [options] - read options.
   * @param {string} [options.rev] - patch set or revision.
   * @param {string} [options.base] - revision to compare against (Gerrit's `base`); empty means the parent commit.
   * @param {boolean} [options.full] - keep every row even for a large file.
   * @returns {Promise<object>} rows plus file facts.
   */
  async getDiff(id, path, options = {}) {
    const target = encodeURIComponent(String(id))
    const rev = typeof options.rev === 'string' && options.rev !== '' ? options.rev : 'current'
    const base = typeof options.base === 'string' ? options.base : ''
    const fileId = encodeURIComponent(path)
    const cacheKey = `diff:${target}:${rev}:${base}:${path}`
    let raw = this.cache.get(cacheKey)
    if (raw === undefined) {
      const search = new URLSearchParams({ context: 'ALL' })
      if (base !== '') search.set('base', base)
      raw = await this.request(`/changes/${target}/revisions/${encodeURIComponent(rev)}/files/${fileId}/diff?${search.toString()}`)
      this.cache.set(cacheKey, raw, Math.max(this.cacheTtlMs * 6, 60_000))
    }
    const metaA = raw !== null && typeof raw === 'object' && raw.meta_a !== null && typeof raw.meta_a === 'object' ? raw.meta_a : undefined
    const metaB = raw !== null && typeof raw === 'object' && raw.meta_b !== null && typeof raw.meta_b === 'object' ? raw.meta_b : undefined
    const oldPath = metaA !== undefined && typeof metaA.name === 'string' ? metaA.name : path
    const newPath = metaB !== undefined && typeof metaB.name === 'string' ? metaB.name : path
    const content = raw !== null && typeof raw === 'object' && Array.isArray(raw.content) ? raw.content : []
    // Gerrit answers a file that two revisions share with one all-context block.
    const noChanges = base !== '' && content.length > 0 && content.every(block => block !== null
      && typeof block === 'object'
      && Array.isArray(block.ab)
      && block.a === undefined
      && block.b === undefined)
    const built = rowsFromDiff(content)
    const capped = options.full === true || noChanges ? false : built.rows.length > MAX_DIFF_ROWS
    const rows = noChanges ? [] : capped ? compactRows(built.rows) : built.rows
    return {
      base,
      noChanges,
      path,
      oldPath,
      newPath,
      renamed: oldPath !== newPath,
      changeType: typeof raw.change_type === 'string' ? raw.change_type : 'MODIFIED',
      contentTypes: {
        old: metaA !== undefined && typeof metaA.content_type === 'string' ? metaA.content_type : '',
        new: metaB !== undefined && typeof metaB.content_type === 'string' ? metaB.content_type : '',
      },
      // Gerrit omits `content` for binary files; a text file with no rows is an empty diff.
      binary: content.length === 0 && built.rows.length === 0
        && (binaryType(metaB !== undefined && typeof metaB.content_type === 'string' ? metaB.content_type : '')
          || binaryType(metaA !== undefined && typeof metaA.content_type === 'string' ? metaA.content_type : '')),
      header: Array.isArray(raw.diff_header) ? raw.diff_header : [],
      rows,
      capped,
      oldLines: metaA !== undefined && typeof metaA.lines === 'number' ? metaA.lines : built.oldLines,
      newLines: metaB !== undefined && typeof metaB.lines === 'number' ? metaB.lines : built.newLines,
    }
  }

  /**
   * Read the inline comments of one change, grouped by file.
   * @param {number|string} id - change identity.
   * @returns {Promise<Record<string, Array<object>>>} comments by path.
   */
  async getComments(id) {
    const target = encodeURIComponent(String(id))
    const cacheKey = `comments:${target}`
    const cached = this.cache.get(cacheKey)
    if (cached !== undefined) return cached
    const raw = await this.request(`/changes/${target}/comments`)
    /** @type {Record<string, Array<object>>} */
    const grouped = {}
    if (raw !== null && typeof raw === 'object') {
      for (const [path, list] of Object.entries(raw)) {
        if (!Array.isArray(list)) continue
        grouped[path] = list.map(comment => ({
          id: typeof comment.id === 'string' ? comment.id : '',
          line: typeof comment.line === 'number' ? comment.line : 0,
          message: typeof comment.message === 'string' ? comment.message : '',
          author: account(comment.author),
          updated: typeof comment.updated === 'string' ? comment.updated : '',
          patchSet: typeof comment.patch_set === 'number' ? comment.patch_set : 0,
          unresolved: comment.unresolved === true,
          side: typeof comment.side === 'string' ? comment.side : 'REVISION',
        }))
      }
    }
    this.cache.set(cacheKey, grouped, this.cacheTtlMs)
    return grouped
  }
}

/** A business failure that maps to an HTTP status and a client code. */
export class GerritError extends Error {
  /**
   * @param {'unauthenticated'|'not-found'|'unavailable'|'bad-request'} code - failure kind.
   * @param {string} message - human-readable cause.
   */
  constructor(code, message) {
    super(message)
    this.name = 'GerritError'
    this.code = code
  }
}

/** HTTP status for one failure code. */
export function statusOf(error) {
  if (error instanceof GerritError) {
    if (error.code === 'unauthenticated') return 401
    if (error.code === 'not-found') return 404
    if (error.code === 'bad-request') return 400
  }
  return 502
}
