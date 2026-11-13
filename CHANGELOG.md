# Changelog

## 0.1.0

First public release.

- Gerrit review desk panel: outgoing / incoming changes, status filter, full-text
  search, patch-set and diff-base selectors.
- Syntax-highlighted unified / side-by-side diffs, Gerrit-style gap expansion,
  whole-file view, per-file "reviewed" flags remembered per change and patch set.
- Inline comments and review publishing (Code-Review / Verified votes) through
  the Gerrit REST API, with drag-selection actions that quote code into the AI
  session or start a range comment.
- Embedded AI review session: one DSH Session per change, quoted code, one-click
  review start, and a workspace picker for where the session is created.
- Review-session matching can be per patch set or per change, chosen on the
  plugin configuration page.
- The configuration page (Plugins → Gerrit workbench) edits the Gerrit server,
  username, HTTP password, credentials file and session matching; values are
  volatile, so they apply without restarting DSH.
