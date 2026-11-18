# Changelog

## Unreleased

- Side-by-side diffs no longer let a long line paint over the opposite column:
  lines wrap by default, and with wrapping off the diff table grows and scrolls
  horizontally instead of overlapping.
- Folded unchanged runs use Gerrit's bar with line counts:
  `+20 above · Show 612 common lines · +20 below` (Shift+click reveals all).
  Runs can be opened from either edge; the old top-only behaviour is still
  accepted when restoring an open page.
- Change cards in the left column now show Owner in addition to Repo and Branch.
- The AI review pane can be resized by dragging its left edge (double-click
  resets; arrow keys nudge) and maximized / restored from its header. The width
  is remembered locally.

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
