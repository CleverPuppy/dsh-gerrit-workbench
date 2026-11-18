/**
 * Development check for the diff folding / expansion model.
 *
 * Lifts the pure segmentation functions out of client.js and exercises the
 * Gerrit-style "expand 20 lines" behaviour. No DOM, no React.
 *
 * Run with: node dev/expansion.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')
const start = source.indexOf('    function segmentRows(')
const end = source.indexOf('    /** Pair unified rows')
if (start < 0 || end < 0) throw new Error('segmentation slice not found in client.js')
const body = source.slice(start, end)

const factory = new Function(`
  const CONTEXT_LINES = 3
  ${body}
  return { segmentRows, expandSegments }
`)
const { segmentRows, expandSegments } = factory()

let failures = 0
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`ok   ${label}`)
    return
  }
  failures += 1
  console.log(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const contextRow = (oldNo, newNo) => ({ t: 'ctx', o: oldNo, n: newNo, s: `line ${newNo}` })

/** 120 unchanged lines with two changed blocks, so two folded runs appear. */
function buildRows() {
  const rows = []
  for (let i = 1; i <= 40; i += 1) rows.push(contextRow(i, i))
  rows.push({ t: 'del', o: 41, n: null, s: 'old line' })
  rows.push({ t: 'add', o: null, n: 41, s: 'new line' })
  for (let i = 42; i <= 80; i += 1) rows.push(contextRow(i, i))
  rows.push({ t: 'add', o: null, n: 81, s: 'another new line' })
  for (let i = 81; i <= 120; i += 1) rows.push(contextRow(i + 1, i))
  return rows
}

// 1. Two folded runs, each with the change and three context rows visible.
{
  const blocks = expandSegments(segmentRows(buildRows()), {})
  const gaps = blocks.filter(block => block.kind === 'gap')
  check('folded runs exist', gaps.length >= 2, `got ${gaps.length}`)
  check('runs are expandable', gaps.every(gap => gap.expandable === true))
  check('first run count', gaps[0].count > 0, `${gaps[0].count}`)
  check('runs carry their hidden rows', gaps.every(gap => gap.hidden.length === gap.count))
}

// 2. The two edges reveal independently, like Gerrit's above / below buttons.
{
  const segments = segmentRows(buildRows())
  const gap = expandSegments(segments, {}).find(block => block.kind === 'gap')
  const above = expandSegments(segments, { [gap.key]: { above: 20, below: 0 } })
  const aboveRows = above.filter(block => block.kind === 'rows').flatMap(block => block.rows)
  check('above reveals the first hidden rows', gap.hidden.slice(0, 20).every(row => aboveRows.includes(row)))
  check('above leaves the rest folded', above.some(block => block.kind === 'gap' && block.count === gap.count - 20))

  const below = expandSegments(segments, { [gap.key]: { above: 0, below: 20 } })
  const belowRows = below.filter(block => block.kind === 'rows').flatMap(block => block.rows)
  const tail = gap.hidden.slice(gap.hidden.length - 20)
  check('below reveals the last hidden rows', tail.every(row => belowRows.includes(row)))
  check('below leaves the rest folded', below.some(block => block.kind === 'gap' && block.count === gap.count - 20))

  const both = expandSegments(segments, { [gap.key]: { above: 20, below: 15 } })
  const bothGap = both.find(block => block.kind === 'gap')
  check('both edges shrink the same run', bothGap !== undefined && bothGap.count === gap.count - 35, `${bothGap?.count} vs ${gap.count}`)
  const overlapReveal = Object.fromEntries(
    segmentRows(buildRows())
      .filter(segment => segment.kind === 'gap' && segment.expandable)
      .map(segment => [segment.key, { above: segment.hidden.length, below: segment.hidden.length }]),
  )
  check('above wins the overlap when over-revealed', expandSegments(segments, overlapReveal).every(block => block.kind === 'rows'))
}

// 3. Revealing everything removes the run entirely.
{
  const segments = segmentRows(buildRows())
  const gaps = expandSegments(segments, {}).filter(block => block.kind === 'gap')
  const revealedAll = Object.fromEntries(gaps.map(gap => [gap.key, { above: gap.count, below: 0 }]))
  const blocks = expandSegments(segments, revealedAll)
  check('no runs left after reveal-all', blocks.every(block => block.kind === 'rows'), JSON.stringify(blocks.map(b => b.kind)))
  const rows = blocks.flatMap(block => block.rows ?? [])
  check('every row rendered once', rows.length === buildRows().length, `${rows.length}`)
}

// 4. A Host-compacted run stays a single non-expandable marker.
{
  const rows = [contextRow(1, 1), { t: 'gap', g: 500 }, contextRow(2, 502)]
  const blocks = expandSegments(segmentRows(rows), {})
  const compacted = blocks.find(block => block.kind === 'gap' && block.expandable === false)
  check('compacted run is not expandable', compacted !== undefined, JSON.stringify(blocks.map(b => b.kind)))
  check('compacted count reported', compacted !== undefined && compacted.count === 500, `${compacted === undefined ? 'none' : compacted.count}`)
}

// 5. Reveal counts beyond the run are clamped, and a legacy numeric count still works.
{
  const segments = segmentRows(buildRows())
  const gaps = expandSegments(segments, {}).filter(block => block.kind === 'gap')
  const huge = Object.fromEntries(gaps.map(gap => [gap.key, { above: 10_000, below: 10_000 }]))
  const blocks = expandSegments(segments, huge)
  check('over-reveal is clamped', blocks.every(block => block.kind === 'rows'))

  const legacyGap = gaps[0]
  const legacy = expandSegments(segments, { [legacyGap.key]: 20 })
  const legacyRows = legacy.filter(block => block.kind === 'rows').flatMap(block => block.rows)
  check('legacy numeric reveal still opens from the top', legacyGap.hidden.slice(0, 20).every(row => legacyRows.includes(row)))
}

console.log(failures === 0 ? '\nall expansion checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
