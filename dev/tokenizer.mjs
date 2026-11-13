/**
 * Development check for the client tokenizer.
 *
 * The tokenizer lives inside the browser factory closure, so this script lifts
 * the pure declarations out of client.js and exercises them directly. It is a
 * logic test only: no DOM, no React, and no attempt to render the page.
 *
 * Run with: node dev/tokenizer.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')
const start = source.indexOf('    const C_WORDS')
const end = source.indexOf("    /** Render one line's spans. */")
if (start < 0 || end < 0) throw new Error('tokenizer slice not found in client.js')
const body = source.slice(start, end)

const factory = new Function(`
  const h = () => null
  ${body}
  return { tokenizeRows, scanLine, languageOf }
`)
const { tokenizeRows, languageOf } = factory()

let failures = 0
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`ok   ${label}`)
    return
  }
  failures += 1
  console.log(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const classes = spans => spans.map(span => `${span.cls}:${span.text}`)

// 1. A block comment that opens in a visible row and closes inside a folded
//    gap must not leak into the rows after the gap.
{
  const rows = [
    { t: 'ctx', s: 'int f(void)' },
    { t: 'ctx', s: '{' },
    { t: 'ctx', s: '    /* a comment that continues' },
    { t: 'gap', g: 12 },
    { t: 'ctx', s: '    */' },
    { t: 'ctx', s: '#ifdef CONFIG_FOO' },
  ]
  const spans = tokenizeRows(rows, 'c')
  const last = spans[spans.length - 1]
  check('gap resets the block comment state', last[0].cls === 'meta', classes(last).join(' '))
}

// 2. Tokenizing the complete row list keeps a comment closed inside a hidden
//    row closed, so `#ifdef` stays a directive.
{
  const rows = [
    { t: 'ctx', s: 'int f(void)' },
    { t: 'ctx', s: '{' },
    { t: 'ctx', s: '    /* doc' },
    { t: 'ctx', s: '       still doc' },
    { t: 'ctx', s: '    */' },
    { t: 'ctx', s: '#ifdef CONFIG_FOO' },
  ]
  const spans = tokenizeRows(rows, 'c')
  check('comment closed before the directive', spans[5][0].cls === 'meta', classes(spans[5]).join(' '))
}

// 3. A directive inside a real comment stays a comment.
{
  const rows = [
    { t: 'ctx', s: '/*' },
    { t: 'ctx', s: '#ifdef NOT_A_DIRECTIVE' },
    { t: 'ctx', s: '*/' },
  ]
  const spans = tokenizeRows(rows, 'c')
  check('a quoted directive stays comment', spans[1][0].cls === 'comment', classes(spans[1]).join(' '))
}

// 4. Preprocessor, keywords, strings, numbers, function names.
{
  const spans = tokenizeRows([{ t: 'add', s: '#include <stdio.h>' }], 'c')[0]
  check('directive is meta', spans[0].cls === 'meta', classes(spans).join(' '))
  const line = tokenizeRows([{ t: 'ctx', s: 'static int count = 42; // tally' }], 'c')[0]
  const map = new Map(line.map(span => [span.text.trim(), span.cls]))
  check('keyword colored', map.get('static') === 'keyword', classes(line).join(' '))
  check('number colored', map.get('42;') === undefined && line.some(span => span.cls === 'number' && span.text === '42'), classes(line).join(' '))
  check('line comment colored', line[line.length - 1].cls === 'comment', classes(line).join(' '))
}

// 5. Strings are not comments.
{
  const line = tokenizeRows([{ t: 'ctx', s: '    printf("/* not a comment */");' }], 'c')[0]
  check('string with comment markers', line.some(span => span.cls === 'string' && span.text.includes('/*')), classes(line).join(' '))
}

// 6. Language detection.
{
  check('shell detected', languageOf('setup_chip_config.sh') === 'sh')
  check('header detected', languageOf('src/zink_screen.h') === 'c')
  check('json detected', languageOf('package.json') === 'json')
  check('makefile detected', languageOf('build/Makefile') === 'hash')
  check('unknown detected', languageOf('LICENSE') === 'plain')
}

console.log(failures === 0 ? '\nall tokenizer checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
