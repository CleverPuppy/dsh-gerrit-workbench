/**
 * Development check for the per-patch-set review-session mapping.
 *
 * Lifts the pure projection helpers out of client.js and runs them against a
 * fake localStorage. No DOM, no React, no network.
 *
 * Run with: node dev/sessions.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')
const start = source.indexOf('    function readSessionMap(')
const end = source.indexOf('    // ---------------------------------------------------------------------\n    // Code highlighting')
if (start < 0 || end < 0) throw new Error('session mapping slice not found in client.js')
const body = source.slice(start, end)

const storage = new Map()
const fakeWindow = {
  localStorage: {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
    removeItem: key => { storage.delete(key) },
  },
}

const factory = new Function('window', `
  const SESSIONS_KEY = 'test.sessions'
  const REVIEWED_KEY = 'test.reviewed'
  const TARGET_KEY = 'test.target'
  ${body}
  return { sessionKeyOf, rememberSession, recallSession, forgetSession, adoptLegacySession, setSessionMatchMode: (mode) => { sessionMatchMode = mode } }
`)
const { sessionKeyOf, rememberSession, recallSession, forgetSession, adoptLegacySession, setSessionMatchMode } = factory(fakeWindow)

let failures = 0
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`ok   ${label}`)
    return
  }
  failures += 1
  console.log(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const HOST = 'https://gerrit.example'

// 1. A key names both the change and its patch set.
check('key includes the patch set', sessionKeyOf(11325, 3) === '11325@3', sessionKeyOf(11325, 3))

// 2. Sessions are isolated per patch set.
rememberSession(HOST, 11325, 3, 'session-ps3')
rememberSession(HOST, 11325, 4, 'session-ps4')
check('ps3 resolves', recallSession(HOST, 11325, 3)?.id === 'session-ps3')
check('ps4 resolves', recallSession(HOST, 11325, 4)?.id === 'session-ps4')
check('ps5 is empty', recallSession(HOST, 11325, 5) === undefined)
check('another change is empty', recallSession(HOST, 11326, 3) === undefined)
check('another host is empty', recallSession('https://other', 11325, 3) === undefined)

// 3. A session remembered before keys carried a patch set is reported as legacy
//    so the caller can adopt it for the patch set on screen.
storage.clear()
storage.set('test.sessions', JSON.stringify({ [HOST]: { 11325: 'legacy-session' } }))
const legacy = recallSession(HOST, 11325, 6)
check('legacy entry surfaces', legacy !== undefined && legacy.id === 'legacy-session', JSON.stringify(legacy))
check('legacy flagged', legacy !== undefined && legacy.legacy === true)
adoptLegacySession(HOST, 11325, 6, legacy.id)
const adopted = recallSession(HOST, 11325, 6)
check('adopted entry is exact now', adopted !== undefined && adopted.legacy === false, JSON.stringify(adopted))
check('legacy key is gone after adoption', !Object.keys(JSON.parse(storage.get('test.sessions'))[HOST]).includes('11325'))

// 4. Forgetting one patch set leaves the others alone.
forgetSession(HOST, 11325, 6)
check('forgotten patch set is empty', recallSession(HOST, 11325, 6) === undefined)

// 5. Corrupt storage never throws.
storage.set('test.sessions', 'not json')
check('corrupt storage is tolerated', recallSession(HOST, 1, 1) === undefined)
check('remember over corrupt storage recovers', (() => {
  rememberSession(HOST, 7, 1, 's7')
  return recallSession(HOST, 7, 1)?.id === 's7'
})())

// 6. The optional per-change mode keys one change into a single session.
storage.clear()
setSessionMatchMode('change')
check('key is per change in change mode', sessionKeyOf(11325, 3) === '#11325', sessionKeyOf(11325, 3))
rememberSession(HOST, 11325, 3, 'session-change')
check('change key resolves', recallSession(HOST, 11325, 3)?.id === 'session-change')
check('another patch set reuses the change session', recallSession(HOST, 11325, 5)?.id === 'session-change')

// 7. A session stored only per patch set is adopted when the mode flips to change.
storage.clear()
setSessionMatchMode('patchSet')
rememberSession(HOST, 11325, 4, 'session-ps4-only')
const stored = JSON.parse(storage.get('test.sessions'))
delete stored[HOST]['#11325']
storage.set('test.sessions', JSON.stringify(stored))
setSessionMatchMode('change')
check('change mode falls back to the patch-set entry', recallSession(HOST, 11325, 4)?.id === 'session-ps4-only')
check('in change mode any patch set adopts the remembered entry', recallSession(HOST, 11325, 5)?.id === 'session-ps4-only')
check('a change without any entry stays empty', recallSession(HOST, 11399, 1) === undefined)
setSessionMatchMode('patchSet')
check('patch-set key survives a mode flip', recallSession(HOST, 11325, 4)?.id === 'session-ps4-only')

console.log(failures === 0 ? '\nall session mapping checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
