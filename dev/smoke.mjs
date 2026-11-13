/**
 * Development smoke test for the Host half's Gerrit client. It talks to a real
 * Gerrit, so it needs one:
 *
 *   GERRIT_URL=https://gerrit.example.com node dev/smoke.mjs
 *   # credentials come from ~/.gerrit-http-credentials, or GERRIT_USERNAME +
 *   # GERRIT_HTTP_PASSWORD
 */

import { Credentials, Gerrit, TtlCache, compactRows } from '../gerrit.js'

const gerritUrl = process.env.GERRIT_URL ?? ''
if (gerritUrl === '') {
  console.log('skip: set GERRIT_URL to run the smoke test against a real Gerrit')
  process.exit(0)
}

const gerrit = new Gerrit({
  gerritUrl,
  credentials: new Credentials({
    username: process.env.GERRIT_USERNAME,
    httpPassword: process.env.GERRIT_HTTP_PASSWORD,
    credentialsFile: '~/.gerrit-http-credentials',
  }),
  cache: new TtlCache(),
})

const self = await gerrit.self()
console.log('self:', self)

const outgoing = await gerrit.listChanges({ scope: 'outgoing', status: 'open', limit: 5 })
console.log('outgoing:', outgoing.changes.map(change => `${change.number} ${change.subject} ps${change.patchSet} +${change.insertions}/-${change.deletions}`))
console.log('more:', outgoing.more)

const incoming = await gerrit.listChanges({ scope: 'incoming', status: 'open', limit: 5 })
console.log('incoming:', incoming.changes.map(change => `${change.number} ${change.project} ${change.subject}`))

const first = incoming.changes[0] ?? outgoing.changes[0]
const detail = await gerrit.getChange(first.number)
console.log('detail:', {
  number: detail.number,
  subject: detail.subject,
  files: detail.files.map(file => `${file.path} (${file.status} +${file.insertions}/-${file.deletions})`),
  revisions: detail.revisions.map(revision => revision.number),
  messages: detail.messages.length,
  reviewers: detail.reviewers.map(person => person.name),
})

const codeFile = detail.files.find(file => file.path !== '/COMMIT_MSG' && !file.binary)
if (codeFile !== undefined) {
  const diff = await gerrit.getDiff(first.number, codeFile.path)
  console.log('diff:', {
    path: diff.path,
    renamed: diff.renamed,
    changeType: diff.changeType,
    rows: diff.rows.length,
    capped: diff.capped,
    oldLines: diff.oldLines,
    newLines: diff.newLines,
    head: diff.rows.slice(0, 4),
  })
  const compact = compactRows(diff.rows, 2)
  console.log('compact rows:', compact.length, 'of', diff.rows.length)
}

const comments = await gerrit.getComments(first.number)
console.log('comments files:', Object.keys(comments).length)

// --- patch-set comparison ("Diff against") -------------------------------
const withRevisions = (await gerrit.listChanges({ scope: 'outgoing', status: 'open', limit: 20 })).changes
  .find(change => change.patchSet > 1) ?? outgoing.changes.find(change => change.patchSet > 1)
if (withRevisions !== undefined) {
  const multi = await gerrit.getChange(withRevisions.number)
  const previous = multi.revisions.find(revision => revision.number === multi.patchSet - 1)
  const target = multi.files.find(file => file.path !== '/COMMIT_MSG' && !file.binary)
  if (previous !== undefined && target !== undefined) {
    const againstParent = await gerrit.getDiff(multi.number, target.path, { rev: multi.revision })
    const againstPrevious = await gerrit.getDiff(multi.number, target.path, { rev: multi.revision, base: previous.revision })
    console.log('diff against:', {
      change: multi.number,
      patchSet: multi.patchSet,
      previousPatchSet: previous.number,
      parentRows: againstParent.rows.length,
      previousRows: againstPrevious.rows.length,
      previousNoChanges: againstPrevious.noChanges,
      base: againstPrevious.base === previous.revision,
    })
  }
}

// --- write path: private draft create + delete (no review is published) ---
const own = (await gerrit.listChanges({ scope: 'outgoing', status: 'open', limit: 5 })).changes[0]
if (own !== undefined) {
  const detail = await gerrit.getChange(own.number)
  const file = detail.files.find(entry => entry.path !== '/COMMIT_MSG' && !entry.binary)
  if (file !== undefined) {
    const line = 1
    const draft = await gerrit.createDraft(detail.number, detail.revision, {
      path: file.path,
      line,
      message: 'dsh gerrit workbench: draft write-path check (deleted immediately)',
    })
    console.log('draft created:', { id: draft.id, path: draft.path, line: draft.line, side: draft.side })
    await gerrit.deleteDraft(detail.number, detail.revision, draft.id)
    console.log('draft deleted:', draft.id)
  }
}
