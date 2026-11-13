/**
 * Development check for the review payload and comment anchors.
 *
 * Lifts the pure helpers out of client.js and checks the exact JSON shape the
 * plugin sends to Gerrit's ReviewInput. No DOM, no React, no network.
 *
 * Run with: node dev/review.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')
const start = source.indexOf('    function buildReviewPayload(')
const end = source.indexOf('    /** One diff row as prompt text. */')
if (start < 0 || end < 0) throw new Error('review helpers slice not found in client.js')
const body = source.slice(start, end)

const factory = new Function(`${body}\nreturn { buildReviewPayload, rowAnchor, rangeAnchor }`)
const { buildReviewPayload, rowAnchor, rangeAnchor } = factory()

let failures = 0
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`ok   ${label}`)
    return
  }
  failures += 1
  console.log(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

// 1. Comments are grouped by path; the parent side is sent explicitly and the
//    revision side is left implicit (Gerrit's default).
{
  const payload = buildReviewPayload({
    'src/a.c': [
      { id: 'd1', line: 12, side: 'REVISION', message: 'looks wrong' },
      { id: 'd2', line: 9, side: 'PARENT', message: 'old line' },
    ],
    'src/b.h': [{ id: 'd3', line: 3, side: 'REVISION', message: 'nit' }],
    'src/empty.c': [],
  }, '  summary  ', { 'Code-Review': '1', Verified: 0, 'Wrong-Label': 'abc' })
  check('message trimmed', payload.message === 'summary', JSON.stringify(payload.message))
  check('empty path dropped', payload.comments['src/empty.c'] === undefined)
  check('two paths', Object.keys(payload.comments).length === 2, JSON.stringify(Object.keys(payload.comments)))
  check('parent side explicit', payload.comments['src/a.c'][1].side === 'PARENT')
  check('revision side implicit', payload.comments['src/a.c'][0].side === undefined)
  check('comment fields only', JSON.stringify(Object.keys(payload.comments['src/a.c'][0])) === '["line","message"]', JSON.stringify(Object.keys(payload.comments['src/a.c'][0])))
  check('integer label kept', payload.labels['Code-Review'] === 1)
  check('zero vote kept', payload.labels.Verified === 0)
  check('non-integer label dropped', payload.labels['Wrong-Label'] === undefined, JSON.stringify(payload.labels))
}

// 2. An empty review is empty, so the caller can refuse to publish it.
{
  const payload = buildReviewPayload({}, '   ', {})
  check('empty message', payload.message === '')
  check('no comments', Object.keys(payload.comments).length === 0)
  check('no labels', Object.keys(payload.labels).length === 0)
}

// 3. Row anchors: deletions belong to the parent side.
{
  check('added row anchors to the revision', JSON.stringify(rowAnchor({ t: 'add', o: null, n: 7 })) === '{"side":"REVISION","line":7}')
  check('context row anchors to the revision', JSON.stringify(rowAnchor({ t: 'ctx', o: 7, n: 8 })) === '{"side":"REVISION","line":8}')
  check('deleted row anchors to the parent', JSON.stringify(rowAnchor({ t: 'del', o: 7, n: null })) === '{"side":"PARENT","line":7}')
}

// 4. A staged range becomes a Gerrit `range` anchored at the last line.
{
  const payload = buildReviewPayload({
    'src/a.c': [
      { id: 'r1', line: 12, startLine: 9, endCharacter: 27, side: 'REVISION', message: 'this block' },
      { id: 'r2', line: 4, startLine: 4, side: 'REVISION', message: 'single' },
    ],
  }, '', {})
  const ranged = payload.comments['src/a.c'][0]
  check('range included', ranged.range !== undefined && ranged.range.start_line === 9 && ranged.range.end_line === 12, JSON.stringify(ranged))
  check('range characters', ranged.range.start_character === 0 && ranged.range.end_character === 27, JSON.stringify(ranged.range))
  check('single line has no range', payload.comments['src/a.c'][1].range === undefined)
}

// 5. Range anchors: side, first/last line, and the last line's text length.
{
  const rows = [
    { t: 'ctx', o: 1, n: 1, s: 'a' },
    { t: 'del', o: 2, n: null, s: 'gone line' },
    { t: 'add', o: null, n: 2, s: 'new line!' },
    { t: 'ctx', o: 3, n: 3, s: 'c' },
  ]
  const mixed = rangeAnchor(rows, 0, 3)
  check('mixed range uses the revision side', mixed.side === 'REVISION', JSON.stringify(mixed))
  check('mixed range lines', mixed.from === 1 && mixed.to === 3, JSON.stringify(mixed))
  check('mixed range end character', mixed.endCharacter === 1, JSON.stringify(mixed))
  const deletions = rangeAnchor(rows, 1, 1)
  check('deletion-only range uses the parent side', deletions.side === 'PARENT', JSON.stringify(deletions))
  check('deletion-only line', deletions.from === 2 && deletions.to === 2, JSON.stringify(deletions))
  check('empty anchor is null', rangeAnchor([], 0, 0) === null)
}

console.log(failures === 0 ? '\nall review checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
