/**
 * Browser half of the Gerrit workbench: a left-sidebar entry that opens a
 * review desk in the main column — outgoing and incoming reviews, a
 * syntax-highlighted diff, and an embedded AI Session the reviewer can quote
 * code into.
 *
 * The Host half serves `/gerrit-workbench/api`; this module never talks to
 * Gerrit directly. Every visible string goes through the Client locale service,
 * every color through a theme token or the theme's `--shiki-token-*` palette.
 */
window.__ModuleLoader__.load({
  id: 'dsh-gerrit-workbench',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const {
      useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, memo, Fragment,
    } = React

    /** Locale namespace this plugin owns. */
    const NS = 'gerritWorkbench'
    /** Sidebar entry id, which is also the main panel key. */
    const PANEL_ID = 'gerrit'
    /** Loader row id of the Host half, which is also its settings namespace. */
    const ROW_ID = 'gerrit-workbench'
    /** Package name of this bundle, which keys its bundle page in the Plugins panel. */
    const PACKAGE_NAME = 'dsh-gerrit-workbench'
    /** `plugins.row.config` key of this row in the Plugins panel. */
    const ROW_CONFIG_KEY = `${PACKAGE_NAME}#${ROW_ID}`
    /** Host API prefix. */
    const API = '/gerrit-workbench/api'
    /** Remembered review Session ids. */
    const SESSIONS_KEY = 'dsh.gerrit-workbench.review-sessions.v1'
    /** Remembered review-session target (workspace or directory). */
    const TARGET_KEY = 'dsh.gerrit-workbench.target.v1'
    /** Remembered per-file Reviewed flags. */
    const REVIEWED_KEY = 'dsh.gerrit-workbench.reviewed.v1'
    /** Locally staged inline comments. */
    const DRAFTS_KEY = 'dsh.gerrit-workbench.drafts.v1'
    /** Host write route (review publishing). */
    const WRITE = '/gerrit-workbench/write'
    /** Lines one expand click reveals, matching Gerrit's context step. */
    const GAP_STEP = 20
    /** Collapsed unchanged lines kept around a change. */
    const CONTEXT_LINES = 3
    /** Longest diff body a review prompt quotes across every file. */
    const PROMPT_DIFF_LIMIT = 80_000
    /** Page size of one change list read. */
    const PAGE_SIZE = 40

    // ---------------------------------------------------------------------
    // Copy
    // ---------------------------------------------------------------------

    const zh = {
      'panel.title': 'Gerrit 工作台',
      'scope.outgoing': '出站',
      'scope.incoming': '入站',
      'scope.outgoing.hint': '我提交的评审',
      'scope.incoming.hint': '待我评审',
      'status.open': '进行中',
      'status.merged': '已合并',
      'status.abandoned': '已放弃',
      'status.all': '全部状态',
      'search.placeholder': '搜索 subject、项目或编号',
      'action.refresh': '刷新',
      'action.refreshAll': '刷新列表与当前变更',
      'action.openInGerrit': '在 Gerrit 中打开',
      'action.loadMore': '加载更多',
      'action.expand': '展开',
      'action.collapse': '收起',
      'action.expandAll': '展开全部',
      'action.showWholeChange': '完整文件',
      'action.toggleList': '显示 / 隐藏变更列表',
      'action.listLabel': '变更列表',
      'action.hideList': '隐藏变更列表',
      'action.showList': '显示变更列表',
      'action.collapseAll': '收起全部',
      'action.retry': '重试',
      'action.copyAll': '复制完整 Diff',
      'action.copied': '已复制',
      'list.title': '变更',
      'list.loading': '正在读取变更…',
      'list.empty': '这里还没有评审。',
      'list.error': '读取失败',
      'detail.empty': '从左侧选择一个变更，查看它的 Diff。',
      'detail.loading': '正在读取变更详情…',
      'detail.files': '文件',
      'detail.patchSet': '补丁集 {number}',
      'detail.patchSet.latest': '最新',
      'detail.owner': '作者',
      'detail.reviewers': '评审人',
      'detail.commits': '提交信息',
      'detail.unknown': '未知',
      'diff.loading': '正在读取 Diff…',
      'diff.failed': 'Diff 读取失败',
      'diff.binary': '二进制文件，没有可显示的文本 Diff。',
      'diff.empty': '没有文本改动。',
      'diff.gap.expand': '展开 {count} 行',
      'diff.gap.expandMore': '展开 {step} 行（剩余 {rest} 行）',
      'diff.gap.expandTitle': '点击展开 {step} 行，Shift+点击展开全部',
      'diff.gap.capped': '{count} 行未加载（大文件）',
      'diff.gap.cappedLoad': '{count} 行未加载',
      'diff.gap.cappedTitle': '这段内容没有随文件加载，点击加载整个文件',
      'diff.gap.loadHint': ' · 点击加载整个文件',
      'diff.capped': '文件较大，仅显示改动附近的行。',
      'diff.noChanges': '与所比修订没有差异。',
      'diff.showWhole': '显示整个文件',
      'diff.collapseGaps': '折叠未改动行',
      'diff.reviewed': '已审阅',
      'diff.selectionHint': '选中代码可直接评论 / 引用给 AI',
      'base.hint': '对比基线：父提交、上一补丁集或任一补丁集',
      'base.parent': '对比：父提交',
      'base.patchSet': '对比：PS {number}',
      'base.previous': '对比：上一补丁集 PS {number}',
      'diff.toggleSplit': '并排 / 统一视图',
      'diff.toggleWrap': '自动换行',
      'diff.unified': '统一视图',
      'diff.split': '并排视图',
      'diff.noWrap': '不换行',
      'diff.filesPanel': '显示或隐藏文件列表',
      'comment.unresolved': '未解决',
      'comment.add': '点行号添加行内评论',
      'comment.placeholder': '写下你的评论…',
      'comment.hint': 'Ctrl/⌘ + Enter 保存',
      'comment.save': '存为草稿',
      'comment.cancel': '取消',
      'comment.remove': '删除',
      'comment.draft': '草稿',
      'comment.draftAuthor': '我的草稿',
      'comment.anchorRevision': '新版本第 {line} 行',
      'comment.anchorParent': '父版本第 {line} 行',
      'comment.anchorRange': '新版本第 {range} 行',
      'comment.anchorRangeParent': '父版本第 {range} 行',
      'comment.rangeHint': '拖拽或 Shift+点击行号可多选',
      'selection.count': '已选 {count} 行',
      'selection.quote': '引用给 AI',
      'selection.quoteHint': '把这几行代码引用到 AI 审查会话的输入框',
      'selection.comment': '评论这几行',
      'selection.commentHint': '对选中的代码写行内评论',
      'ai.notice.quotedText': '已引用 {path}:{range} 的选中内容',
      'selection.clear': '取消选择',
      'ai.notice.quotedRange': '已引用 {path}:{from}-{to}',
      'reply.title': '发布评审',
      'reply.button': '回复',
      'reply.open': '回复 / 发布评审…',
      'reply.publish': '发布评审',
      'reply.confirmButton': '确认发布',
      'reply.posting': '正在发布…',
      'reply.confirm': '即将发布：{summary}。再次点击「确认发布」提交到 Gerrit。',
      'reply.summary': '{comments} 条行内评论 · 投票 {votes} · 说明 {message} 字',
      'reply.noVotes': '无',
      'reply.noDrafts': '还没有行内评论草稿。点 Diff 左侧行号即可添加。',
      'reply.drafts': '行内评论草稿（{count}）',
      'reply.message': '评审说明',
      'reply.messagePlaceholder': '给作者看的说明（可选）…',
      'reply.noVote': '不投票',
      'reply.currentVote': '当前 {value}',
      'reply.empty': '评审内容为空：至少写一条评论、一段说明或投一票。',
      'reply.posted': '评审已发布到 Gerrit。',
      'reply.staged': '评论已暂存，点「回复」发布。',
      'reply.noChange': '没有选中的变更。',
      'reply.failed': '发布失败：{message}',
      'ai.title': 'AI 审查',
      'ai.subtitle': 'Change {number} · PS {patchSet}',
      'ai.openPanel': '打开 AI 审查面板',
      'ai.closePanel': '收起 AI 面板',
      'ai.start': '开始 AI 审查',
      'ai.newSession': '新会话',
      'ai.creating': '正在创建审查会话…',
      'ai.loading': '正在恢复审查会话…',
      'ai.noChange': '先选择一个变更，再开始 AI 审查。',
      'ai.emptyHint': '点击「开始 AI 审查」，会在右侧拉起一个内嵌的 AI Session，并把当前变更与 Diff 交给它。',
      'ai.reviewSent': '已把本次变更发给 AI 审查。',
      'ai.reviewFailed': '发送审查请求失败：{message}',
      'ai.quoteFailed': '引用失败：{message}',
      'ai.created': '已创建审查会话。',
      'ai.restored': '已恢复该变更的审查会话。',
      'ai.sessionError': '无法创建审查会话：{message}',
      'ai.patchSession': '已切换到 PS {number} 的审查会话。',
      'ai.workspace': '工作区',
      'ai.workspace.hint': '新的 AI 审查会话创建在哪个工作区或目录',
      'ai.workspace.auto': '自动 · {name}',
      'ai.workspace.config': '配置目录 · {name}',
      'ai.workspace.changed': '已切换到 {name}，新会话将在其中创建。',
      'ai.workspace.changedExisting': '工作区已设为 {name}；点「新会话」在该工作区重建。',
      'config.title': '插件配置',
      'config.summary': '审查会话的记忆方式',
      'config.sessionMatch': '审查会话记忆方式',
      'config.sessionMatch.patchSet': '按补丁集（每个 PS 各一个会话）',
      'config.sessionMatch.change': '按变更（整个变更共用一个会话）',
      'config.sessionMatch.hint': '按补丁集：切到别的 PS 时面板收起，切回来再恢复原来的会话。按变更：同一个变更的所有 PS 复用同一个审查会话。保存后即时生效，已打开的 AI 面板也会按新方式重新匹配。',
      'config.saving': '正在保存…',
      'config.saved': '已保存，立即生效。',
      'config.rejected': 'Host 拒绝了这次修改。',
      'config.unavailable': '当前环境没有可编辑的插件配置。',
      'config.server': 'Gerrit 服务器',
      'config.server.hint': '形如 https://gerrit.example.com（不要带结尾的 /）。保存后立即生效。',
      'config.username': '用户名',
      'config.username.hint': '留空则使用凭据文件里的用户名。',
      'config.username.fromFile': '取自凭据文件',
      'config.password': 'HTTP 密码 / Token',
      'config.password.set': '已设置，留空保持不变',
      'config.password.unset': '未设置',
      'config.password.hint': '只保存在 Host 进程的配置里，不会发到浏览器。留空则继续使用凭据文件中的密码。',
      'config.password.clear': '清除已保存的密码',
      'config.credentialsFile': '凭据文件',
      'config.credentialsFile.hint': '存放 username:HTTP密码 的文件；留空则不读取文件。',
      'config.save': '保存',
      'config.readonly': '当前环境只读，无法修改插件配置。',
      'ai.quoteFile': '引用整个文件',
      'ai.quoteLine': '引用这一行',
      'ai.reviewFile': '让 AI 审查这个文件',
      'ai.reviewChange': 'AI 审查整个变更',
      'ai.notice.quoted': '已引用 {path}:{line}',
      'ai.notice.fileQuoted': '已引用 {path} 的改动',
      'ai.needSession': '请先打开 AI 审查会话。',
      'ai.prompt.intro': '请对下面这个 Gerrit 变更做一次严格的代码审查。',
      'ai.prompt.project': '项目',
      'ai.prompt.branch': '分支',
      'ai.prompt.change': '变更',
      'ai.prompt.subject': '标题',
      'ai.prompt.owner': '作者',
      'ai.prompt.topic': '主题',
      'ai.prompt.truncated': '...（Diff 太长，已截断）',
      'ai.prompt.instructions': '请按严重程度列出问题（阻塞 / 重要 / 建议 / 疑问），每条给出文件与行号、问题原因和具体修改建议。重点关注：正确性与边界条件、资源生命周期与错误处理、并发与锁、内存与性能、可移植性、命名与代码风格。如果这段代码没有问题，也请说明你检查了哪些方面。\n\n注意：上面已经提供了变更信息与 Diff，请勿读取任何凭据文件（例如 ~/.gerrit-http-credentials），也不要自己调用 Gerrit API；需要更多上下文时，请直接在会话里说明需要哪一段代码。',
      'error.unauthenticated': 'Gerrit 拒绝了凭据，请检查 {file} 或插件配置中的用户名与 HTTP 密码。',
      'error.notFound': 'Gerrit 上找不到该资源。',
      'error.forbidden': '请求被拒绝（跨站来源）。',
      'error.generic': '请求失败：{message}',
      'meta.connected': '已连接 {user}',
      'meta.checking': '正在连接 Gerrit…',
      'meta.setup': '未找到凭据：请在 {file} 写入 username 与 HTTP 密码，或在插件配置中填写 username/httpPassword。',
      'meta.unconfigured': '还没有配置 Gerrit 服务器：打开 Plugins → Gerrit workbench，在配置里填写服务器地址。',
      'aria.scopeTabs': '评审范围',
      'aria.statusFilter': '状态过滤',
      'aria.changeList': '变更列表',
      'aria.diff': '代码差异',
      'aria.aiSession': 'AI 审查会话',
      'file.status.A': '新增',
      'file.status.D': '删除',
      'file.status.R': '重命名',
      'file.status.M': '修改',
      'file.status.C': '复制',
    }

    const en = {
      'panel.title': 'Gerrit workbench',
      'scope.outgoing': 'Outgoing',
      'scope.incoming': 'Incoming',
      'scope.outgoing.hint': 'Changes I uploaded',
      'scope.incoming.hint': 'Changes awaiting my review',
      'status.open': 'Open',
      'status.merged': 'Merged',
      'status.abandoned': 'Abandoned',
      'status.all': 'Any status',
      'search.placeholder': 'Search subject, project, or number',
      'action.refresh': 'Refresh',
      'action.refreshAll': 'Refresh the list and the open change',
      'action.openInGerrit': 'Open in Gerrit',
      'action.loadMore': 'Load more',
      'action.expand': 'Expand',
      'action.collapse': 'Collapse',
      'action.expandAll': 'Expand all',
      'action.showWholeChange': 'Whole files',
      'action.toggleList': 'Show or hide the change list',
      'action.listLabel': 'Changes',
      'action.hideList': 'Hide the change list',
      'action.showList': 'Show the change list',
      'action.collapseAll': 'Collapse all',
      'action.retry': 'Retry',
      'action.copyAll': 'Copy the complete diff',
      'action.copied': 'Copied',
      'list.title': 'Changes',
      'list.loading': 'Reading changes…',
      'list.empty': 'No reviews here yet.',
      'list.error': 'Read failed',
      'detail.empty': 'Pick a change on the left to read its diff.',
      'detail.loading': 'Reading the change…',
      'detail.files': 'Files',
      'detail.patchSet': 'Patch set {number}',
      'detail.patchSet.latest': 'latest',
      'detail.owner': 'Owner',
      'detail.reviewers': 'Reviewers',
      'detail.commits': 'Commit message',
      'detail.unknown': 'unknown',
      'diff.loading': 'Reading the diff…',
      'diff.failed': 'Could not read the diff',
      'diff.binary': 'Binary file — no text diff to show.',
      'diff.empty': 'No textual changes.',
      'diff.gap.expand': 'Expand {count} lines',
      'diff.gap.expandMore': 'Expand {step} lines ({rest} left)',
      'diff.gap.expandTitle': 'Click to expand {step} lines, Shift+click for all',
      'diff.gap.capped': '{count} lines not loaded (large file)',
      'diff.gap.cappedLoad': '{count} lines not loaded',
      'diff.gap.cappedTitle': 'These lines were not sent with the file; click to load the whole file',
      'diff.gap.loadHint': ' · click to load the whole file',
      'diff.capped': 'Large file: only lines around the changes are shown.',
      'diff.noChanges': 'No difference from the compared revision.',
      'diff.showWhole': 'Show the whole file',
      'diff.collapseGaps': 'Fold the unchanged lines again',
      'diff.reviewed': 'Reviewed',
      'diff.selectionHint': 'Select code to comment or quote for the AI',
      'base.hint': 'Compare against: parent commit, previous patch set, or any patch set',
      'base.parent': 'Against: parent',
      'base.patchSet': 'Against: PS {number}',
      'base.previous': 'Against: previous PS {number}',
      'diff.toggleSplit': 'Side by side / unified',
      'diff.toggleWrap': 'Wrap lines',
      'diff.unified': 'Unified',
      'diff.split': 'Side by side',
      'diff.noWrap': 'No wrap',
      'diff.filesPanel': 'Show or hide the file list',
      'comment.unresolved': 'Unresolved',
      'comment.add': 'Click a line number to comment',
      'comment.placeholder': 'Write your comment…',
      'comment.hint': 'Ctrl/⌘ + Enter saves',
      'comment.save': 'Save draft',
      'comment.cancel': 'Cancel',
      'comment.remove': 'Delete',
      'comment.draft': 'draft',
      'comment.draftAuthor': 'My draft',
      'comment.anchorRevision': 'New line {line}',
      'comment.anchorParent': 'Parent line {line}',
      'comment.anchorRange': 'New lines {range}',
      'comment.anchorRangeParent': 'Parent lines {range}',
      'comment.rangeHint': 'Drag or Shift+click line numbers to select more',
      'selection.count': '{count} lines selected',
      'selection.quote': 'Quote for AI',
      'selection.quoteHint': 'Quote these lines into the AI review session input',
      'selection.comment': 'Comment on these lines',
      'selection.commentHint': 'Write an inline comment on the selected code',
      'ai.notice.quotedText': 'Quoted the selection at {path}:{range}',
      'selection.clear': 'Clear selection',
      'ai.notice.quotedRange': 'Quoted {path}:{from}-{to}',
      'reply.title': 'Publish review',
      'reply.button': 'Reply',
      'reply.open': 'Reply / publish a review…',
      'reply.publish': 'Publish review',
      'reply.confirmButton': 'Confirm publish',
      'reply.posting': 'Publishing…',
      'reply.confirm': 'About to publish: {summary}. Click “Confirm publish” again to send it to Gerrit.',
      'reply.summary': '{comments} inline comments · votes {votes} · message {message} chars',
      'reply.noVotes': 'none',
      'reply.noDrafts': 'No inline drafts yet. Click a line number in the diff to add one.',
      'reply.drafts': 'Inline comment drafts ({count})',
      'reply.message': 'Review message',
      'reply.messagePlaceholder': 'Message for the author (optional)…',
      'reply.noVote': 'No vote',
      'reply.currentVote': 'now {value}',
      'reply.empty': 'Nothing to publish: add a comment, a message, or a vote.',
      'reply.posted': 'Review published to Gerrit.',
      'reply.staged': 'Comment staged; publish it from “Reply”.',
      'reply.noChange': 'No change is selected.',
      'reply.failed': 'Publish failed: {message}',
      'ai.title': 'AI review',
      'ai.subtitle': 'Change {number} · PS {patchSet}',
      'ai.openPanel': 'Open the AI review panel',
      'ai.closePanel': 'Collapse the AI panel',
      'ai.start': 'Start AI review',
      'ai.newSession': 'New session',
      'ai.creating': 'Creating the review session…',
      'ai.loading': 'Restoring the review session…',
      'ai.noChange': 'Select a change before starting an AI review.',
      'ai.emptyHint': 'Start an AI review to raise an embedded AI Session beside the diff and hand it this change.',
      'ai.reviewSent': 'Sent this change to the AI reviewer.',
      'ai.reviewFailed': 'Could not send the review request: {message}',
      'ai.quoteFailed': 'Could not quote: {message}',
      'ai.created': 'Review session created.',
      'ai.restored': 'Restored this change’s review session.',
      'ai.sessionError': 'Could not create the review session: {message}',
      'ai.patchSession': 'Switched to the review session of PS {number}.',
      'ai.workspace': 'Workspace',
      'ai.workspace.hint': 'Workspace or directory a new AI review session is created in',
      'ai.workspace.auto': 'Auto · {name}',
      'ai.workspace.config': 'Configured dir · {name}',
      'ai.workspace.changed': 'Switched to {name}; new sessions are created there.',
      'ai.workspace.changedExisting': 'Workspace set to {name}; press “New session” to recreate there.',
      'config.title': 'Plugin configuration',
      'config.summary': 'How review sessions are remembered',
      'config.sessionMatch': 'Review session matching',
      'config.sessionMatch.patchSet': 'Per patch set (one session each)',
      'config.sessionMatch.change': 'Per change (one session for the change)',
      'config.sessionMatch.hint': 'Per patch set: switching to another PS collapses the panel and switching back restores that session. Per change: every PS of one change reuses the same review session. Saved live; an AI panel that is already open re-matches immediately.',
      'config.saving': 'Saving…',
      'config.saved': 'Saved; applied immediately.',
      'config.rejected': 'The Host refused the change.',
      'config.unavailable': 'No editable plugin configuration in this environment.',
      'config.server': 'Gerrit server',
      'config.server.hint': 'For example https://gerrit.example.com, without a trailing slash. Applied immediately after saving.',
      'config.username': 'Username',
      'config.username.hint': 'Leave empty to use the username from the credentials file.',
      'config.username.fromFile': 'From the credentials file',
      'config.password': 'HTTP password / token',
      'config.password.set': 'Set; leave empty to keep it',
      'config.password.unset': 'Not set',
      'config.password.hint': 'Stored only in the Host plugin configuration, never sent to the browser. Leave empty to keep using the credentials file.',
      'config.password.clear': 'Clear the stored password',
      'config.credentialsFile': 'Credentials file',
      'config.credentialsFile.hint': 'File holding username:HTTP-password; leave empty to skip the file.',
      'config.save': 'Save',
      'config.readonly': 'This environment is read-only; the plugin configuration cannot be changed.',
      'ai.quoteFile': 'Quote this file',
      'ai.quoteLine': 'Quote this line',
      'ai.reviewFile': 'Ask the AI to review this file',
      'ai.reviewChange': 'Ask the AI to review the whole change',
      'ai.notice.quoted': 'Quoted {path}:{line}',
      'ai.notice.fileQuoted': 'Quoted the changes in {path}',
      'ai.needSession': 'Open the AI review session first.',
      'ai.prompt.intro': 'Please review this Gerrit change carefully.',
      'ai.prompt.project': 'Project',
      'ai.prompt.branch': 'Branch',
      'ai.prompt.change': 'Change',
      'ai.prompt.subject': 'Subject',
      'ai.prompt.owner': 'Owner',
      'ai.prompt.topic': 'Topic',
      'ai.prompt.truncated': '... (the diff was truncated because it is long)',
      'ai.prompt.instructions': 'List findings by severity (blocking / important / minor / question). For each finding give the file and line, why it matters, and a concrete change. Focus on correctness and edge cases, resource lifetime and error handling, concurrency and locking, memory and performance, portability, and naming/style. If the code is fine, say what you checked.\n\nNote: the change and its diff are already included above. Do not read credential files (for example ~/.gerrit-http-credentials) and do not call Gerrit yourself; if you need more context, say which code you need in this conversation.',
      'error.unauthenticated': 'Gerrit rejected the credentials. Check {file}, or the username and HTTP password in the plugin config.',
      'error.notFound': 'Gerrit does not expose that resource.',
      'error.forbidden': 'The request was rejected (cross-site origin).',
      'error.generic': 'Request failed: {message}',
      'meta.connected': 'Connected as {user}',
      'meta.checking': 'Connecting to Gerrit…',
      'meta.setup': 'No credentials found. Write a username and HTTP password into {file}, or set username/httpPassword in the plugin config.',
      'meta.unconfigured': 'No Gerrit server yet. Open Plugins → Gerrit workbench and fill in the server address.',
      'aria.scopeTabs': 'Review scope',
      'aria.statusFilter': 'Status filter',
      'aria.changeList': 'Change list',
      'aria.diff': 'Code diff',
      'aria.aiSession': 'AI review session',
      'file.status.A': 'added',
      'file.status.D': 'deleted',
      'file.status.R': 'renamed',
      'file.status.M': 'modified',
      'file.status.C': 'copied',
    }

    // ---------------------------------------------------------------------
    // Small utilities
    // ---------------------------------------------------------------------

    /** Replace `{name}` placeholders. */
    function format(template, params) {
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, key) => (params[key] === undefined ? match : String(params[key])))
    }

    /** A minimal observable snapshot store (same contract as the host stores). */
    function createStore(initial) {
      let value = initial
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set(next) {
          if (Object.is(next, value)) return
          value = next
          for (const listener of [...listeners]) listener()
        },
        patch(partial) {
          this.set({ ...value, ...partial })
        },
      }
    }

    /** Subscribe one component to a snapshot store. */
    function useSnapshot(store) {
      return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    }

    /** Parse one Gerrit timestamp (`2026-11-10 08:17:08.000000000`). */
    function parseWhen(text) {
      if (typeof text !== 'string' || text === '') return undefined
      const normalized = text.includes('T') ? text : text.replace(' ', 'T')
      const trimmed = normalized.replace(/(\.\d{3})\d+/, '$1')
      const date = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed) ? trimmed : `${trimmed}Z`)
      return Number.isNaN(date.getTime()) ? undefined : date
    }

    /** A compact relative time for one Gerrit timestamp. */
    function relativeWhen(text, locale) {
      const date = parseWhen(text)
      if (date === undefined) return ''
      const seconds = Math.round((date.getTime() - Date.now()) / 1000)
      const table = [
        ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800],
        ['day', 86_400], ['hour', 3_600], ['minute', 60], ['second', 1],
      ]
      for (const [unit, size] of table) {
        if (Math.abs(seconds) >= size || unit === 'second') {
          const value = Math.round(seconds / size)
          try {
            return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit)
          } catch (_unsupported) {
            return `${value} ${unit}`
          }
        }
      }
      return ''
    }

    /** Format an absolute date in the reader's locale. */
    function absoluteWhen(text, locale) {
      const date = parseWhen(text)
      if (date === undefined) return ''
      try {
        return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
      } catch (_unsupported) {
        return date.toISOString()
      }
    }

    /** One API failure, carrying the Host's business code. */
    class ApiError extends Error {
      constructor(code, message) {
        super(message)
        this.name = 'ApiError'
        this.code = code
      }
    }

    /** GET one workbench API endpoint. */
    async function apiGet(path, params, options = {}) {
      const url = new URL(`${API}${path}`, window.location.origin)
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value === undefined || value === null || value === '') continue
        url.searchParams.set(key, String(value))
      }
      let response
      try {
        response = await fetch(url, {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          signal: options.signal,
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        throw new ApiError('unavailable', error instanceof Error ? error.message : String(error))
      }
      const text = await response.text()
      let body
      try {
        body = JSON.parse(text)
      } catch (_invalid) {
        throw new ApiError('unavailable', `Unexpected response from the Host (HTTP ${response.status}).`)
      }
      if (!response.ok || body === null || typeof body !== 'object' || body.ok !== true) {
        const code = body !== null && typeof body === 'object' && body.error !== undefined ? body.error.code : 'unavailable'
        const message = body !== null && typeof body === 'object' && body.error !== undefined ? body.error.message : `HTTP ${response.status}`
        throw new ApiError(code, message)
      }
      return body.value
    }

    /** POST one JSON body to the workbench write route. */
    async function apiPost(path, body) {
      let response
      try {
        response = await fetch(`${WRITE}${path}`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(body),
        })
      } catch (error) {
        throw new ApiError('unavailable', error instanceof Error ? error.message : String(error))
      }
      const text = await response.text()
      let payload
      try {
        payload = JSON.parse(text)
      } catch (_invalid) {
        throw new ApiError('unavailable', `Unexpected response from the Host (HTTP ${response.status}).`)
      }
      if (!response.ok || payload === null || typeof payload !== 'object' || payload.ok !== true) {
        const code = payload !== null && typeof payload === 'object' && payload.error !== undefined ? payload.error.code : 'unavailable'
        const message = payload !== null && typeof payload === 'object' && payload.error !== undefined ? payload.error.message : `HTTP ${response.status}`
        throw new ApiError(code, message)
      }
      return payload.value
    }

    /**
     * Report one page lifecycle event to the Host's diagnostics ring. Failures
     * are swallowed: diagnostics must never break the surface they observe.
     * @param {string} event - event name.
     * @param {string} [detail] - short detail text.
     */
    function beacon(event, detail) {
      try {
        const query = new URLSearchParams({ event })
        if (detail !== undefined) query.set('detail', String(detail).slice(0, 600))
        void fetch(`${API}/diag?${query.toString()}`, { credentials: 'same-origin', keepalive: true })
          .catch(() => {})
      } catch (_ignored) { /* diagnostics are best-effort */ }
    }


    /** Resolve a stored review-session map. */
    function readSessionMap() {
      try {
        const raw = window.localStorage.getItem(SESSIONS_KEY)
        const parsed = raw === null ? undefined : JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
      } catch (_unavailable) {
        return {}
      }
    }

    /**
     * How the Host matches remembered review sessions: one per patch set (the
     * default) or one for the whole change. Kept in sync with the Host's meta,
     * which follows the configuration page.
     */
    let sessionMatchMode = 'patchSet'

    /** Storage key of one review session: one per patch set, or one per change. */
    function sessionKeyOf(number, patchSet) {
      return sessionMatchMode === 'change' ? changeKeyOf(number) : patchSetKeyOf(number, patchSet)
    }

    /** Exact key of one patch set's review session. */
    function patchSetKeyOf(number, patchSet) {
      return `${number}@${patchSet}`
    }

    /** Key of the review session shared by every patch set of one change. */
    function changeKeyOf(number) {
      return `#${number}`
    }

    /**
     * Remember the review session of one change at one patch set. Both keys are
     * written: switching the matching mode keeps reusing the same session.
     */
    function rememberSession(gerritUrl, number, patchSet, sessionId) {
      try {
        const all = readSessionMap()
        const forHost = all[gerritUrl] ?? {}
        forHost[patchSetKeyOf(number, patchSet)] = sessionId
        forHost[changeKeyOf(number)] = sessionId
        all[gerritUrl] = forHost
        window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(all))
      } catch (_unavailable) { /* private mode: reuse is best-effort */ }
    }

    /** Read the Reviewed flags of one change at one patch set. */
    function readReviewed(meta, detail) {
      if (meta === null || detail === null) return {}
      try {
        const raw = window.localStorage.getItem(REVIEWED_KEY)
        const all = raw === null ? {} : JSON.parse(raw)
        const forHost = all !== null && typeof all === 'object' ? all[meta.gerritUrl] : undefined
        if (forHost === null || typeof forHost !== 'object') return {}
        const entry = forHost[`${detail.number}@${detail.patchSet}`]
        return entry !== null && typeof entry === 'object' ? { ...entry } : {}
      } catch (_unavailable) {
        return {}
      }
    }

    /** Persist the Reviewed flags of one change at one patch set. */
    function saveReviewed(meta, detail, reviewed) {
      if (meta === null || detail === null) return
      try {
        const raw = window.localStorage.getItem(REVIEWED_KEY)
        const all = raw === null ? {} : JSON.parse(raw)
        const next = all !== null && typeof all === 'object' ? all : {}
        const forHost = next[meta.gerritUrl] !== null && typeof next[meta.gerritUrl] === 'object' ? next[meta.gerritUrl] : {}
        forHost[`${detail.number}@${detail.patchSet}`] = reviewed
        next[meta.gerritUrl] = forHost
        window.localStorage.setItem(REVIEWED_KEY, JSON.stringify(next))
      } catch (_unavailable) { /* best-effort */ }
    }

    /** Read the staged inline comments of one change at one patch set. */
    function readDrafts(meta, detail) {
      if (meta === null || detail === null) return {}
      try {
        const raw = window.localStorage.getItem(DRAFTS_KEY)
        const all = raw === null ? {} : JSON.parse(raw)
        const forHost = all !== null && typeof all === 'object' ? all[meta.gerritUrl] : undefined
        if (forHost === null || typeof forHost !== 'object') return {}
        const entry = forHost[`${detail.number}@${detail.patchSet}`]
        if (entry === null || typeof entry !== 'object') return {}
        const out = {}
        for (const [path, list] of Object.entries(entry)) {
          if (Array.isArray(list)) out[path] = list.filter(item => item !== null && typeof item === 'object' && typeof item.message === 'string')
        }
        return out
      } catch (_unavailable) {
        return {}
      }
    }

    /** Persist the staged inline comments of one change at one patch set. */
    function saveDrafts(meta, detail, drafts) {
      if (meta === null || detail === null) return
      try {
        const raw = window.localStorage.getItem(DRAFTS_KEY)
        const all = raw === null ? {} : JSON.parse(raw)
        const next = all !== null && typeof all === 'object' ? all : {}
        const forHost = next[meta.gerritUrl] !== null && typeof next[meta.gerritUrl] === 'object' ? next[meta.gerritUrl] : {}
        forHost[`${detail.number}@${detail.patchSet}`] = drafts
        next[meta.gerritUrl] = forHost
        window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(next))
      } catch (_unavailable) { /* best-effort */ }
    }

    /**
     * Read the remembered review-session target.
     * @returns {{ kind: 'auto' } | { kind: 'workspace', id: string } | { kind: 'cwd', path: string }} the target.
     */
    function readTarget() {
      try {
        const raw = window.localStorage.getItem(TARGET_KEY)
        if (raw === null) return { kind: 'auto' }
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return { kind: 'auto' }
        if (parsed.kind === 'workspace' && typeof parsed.id === 'string' && parsed.id !== '') return { kind: 'workspace', id: parsed.id }
        if (parsed.kind === 'cwd' && typeof parsed.path === 'string' && parsed.path !== '') return { kind: 'cwd', path: parsed.path }
      } catch (_unavailable) { /* fall through to auto */ }
      return { kind: 'auto' }
    }

    /** Persist the review-session target. */
    function saveTarget(target) {
      try { window.localStorage.setItem(TARGET_KEY, JSON.stringify(target)) } catch (_unavailable) { /* best-effort */ }
    }

    /** The last path segment, for compact labels. */
    function baseName(path) {
      const trimmed = String(path).replace(/[\\/]+$/, '')
      const at = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
      return at >= 0 ? trimmed.slice(at + 1) : trimmed
    }

    /** Forget the remembered review session of one change at one patch set. */
    function forgetSession(gerritUrl, number, patchSet) {
      try {
        const all = readSessionMap()
        const forHost = all[gerritUrl]
        if (forHost === null || typeof forHost !== 'object') return
        delete forHost[patchSetKeyOf(number, patchSet)]
        delete forHost[changeKeyOf(number)]
        all[gerritUrl] = forHost
        window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(all))
      } catch (_unavailable) { /* best-effort */ }
    }

    /**
     * Move a session remembered under the old change-only key to the exact
     * change@patch-set key, so it is not resurrected after a reset.
     */
    function adoptLegacySession(gerritUrl, number, patchSet, sessionId) {
      try {
        const all = readSessionMap()
        const forHost = all[gerritUrl]
        if (forHost === null || typeof forHost !== 'object') return
        if (forHost[String(number)] === sessionId) delete forHost[String(number)]
        forHost[patchSetKeyOf(number, patchSet)] = sessionId
        forHost[changeKeyOf(number)] = sessionId
        all[gerritUrl] = forHost
        window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(all))
      } catch (_unavailable) { /* best-effort */ }
    }

    /**
     * Read the remembered review session of one change at one patch set.
     * A session remembered before keys carried a patch set is adopted by the
     * patch set that is open now; when matching per change, the session kept
     * for this patch set is adopted by the whole change.
     * @returns {{ id: string, legacy: boolean } | undefined} the remembered entry.
     */
    function recallSession(gerritUrl, number, patchSet) {
      const all = readSessionMap()
      const forHost = all[gerritUrl]
      if (forHost === null || typeof forHost !== 'object') return undefined
      const exact = forHost[sessionKeyOf(number, patchSet)]
      if (typeof exact === 'string') return { id: exact, legacy: false }
      if (sessionMatchMode === 'change') {
        // One session per change: reuse whatever patch set of this change was
        // remembered before the mode flipped, newest patch set first.
        const prefix = `${number}@`
        let adopted
        for (const [key, id] of Object.entries(forHost)) {
          if (!key.startsWith(prefix) || typeof id !== 'string') continue
          const at = Number(key.slice(prefix.length))
          if (!Number.isFinite(at)) continue
          if (adopted === undefined || at > adopted.at) adopted = { at, id }
        }
        if (adopted !== undefined) return { id: adopted.id, legacy: true }
      }
      const legacy = forHost[String(number)]
      return typeof legacy === 'string' ? { id: legacy, legacy: true } : undefined
    }

    // ---------------------------------------------------------------------
    // Code highlighting
    // ---------------------------------------------------------------------

    /** Keywords shared by the C-like family. */
    const C_WORDS = new Set(('alignas alignof asm auto bool boolean break case catch char class const constexpr continue '
      + 'default defined delete do double else enum explicit export extends extern final finally float for friend func go goto if '
      + 'impl implements import in inline instanceof int interface internal let long match mod mut namespace new noexcept null nullptr '
      + 'operator override package private protected pub public range register restrict return self short signed sizeof static strictfp '
      + 'struct super switch synchronized template this throw throws trait transient true false try typedef typename typeof union unsigned '
      + 'using var virtual void volatile where while yield async await of from as is type keyof readonly declare abstract').split(' '))

    /** Python keywords. */
    const PY_WORDS = new Set(('and as assert async await break class continue def del elif else except finally for from global if import in '
      + 'is lambda nonlocal not or pass raise return try while with yield True False None self print len range str int float dict list set tuple')
      .split(' '))

    /** Shell keywords and builtins. */
    const SH_WORDS = new Set(('if then else elif fi for while until do done case esac function in select return export local readonly declare '
      + 'shift break continue exit echo printf cd pushd popd test source eval exec set unset trap wait read').split(' '))

    /** Data and markup words. */
    const MARK_WORDS = new Set('true false null undefined nil yes no on off'.split(' '))

    /** Extensions grouped into tokenizer families. */
    const LANG_BY_EXT = {
      c: 'c', h: 'c', cc: 'c', cpp: 'c', cxx: 'c', hpp: 'c', hxx: 'c', ino: 'c', m: 'c', mm: 'c',
      js: 'c', mjs: 'c', cjs: 'c', jsx: 'c', ts: 'c', tsx: 'c', mts: 'c', cts: 'c',
      go: 'c', rs: 'c', java: 'c', kt: 'c', kts: 'c', cs: 'c', swift: 'c', scala: 'c',
      py: 'py', pyi: 'py',
      sh: 'sh', bash: 'sh', zsh: 'sh', fish: 'sh',
      json: 'json', jsonc: 'json',
      yml: 'yaml', yaml: 'yaml',
      toml: 'hash', ini: 'hash', conf: 'hash', cfg: 'hash',
      rb: 'hash', pl: 'hash', r: 'hash', mk: 'hash', cmake: 'hash', gradle: 'hash', lua: 'hash', php: 'hash',
      xml: 'xml', html: 'xml', htm: 'xml', svg: 'xml', vue: 'xml',
      css: 'css', scss: 'css', less: 'css',
      md: 'md', markdown: 'md', rst: 'md',
      diff: 'diff', patch: 'diff',
    }

    /** Files whose name alone names the language. */
    const LANG_BY_NAME = {
      makefile: 'hash', gnumakefile: 'hash', cmakelists: 'hash', dockerfile: 'hash', '.gitignore': 'hash',
      kconfig: 'hash', 'meson.build': 'hash', 'meson_options.txt': 'hash',
    }

    /** Detect a tokenizer family for one repository path. */
    function languageOf(path) {
      const name = String(path).split('/').pop() ?? ''
      const lower = name.toLowerCase()
      if (LANG_BY_NAME[lower] !== undefined) return LANG_BY_NAME[lower]
      if (lower.startsWith('.')) {
        const bare = lower.slice(1)
        if (LANG_BY_NAME[bare] !== undefined) return LANG_BY_NAME[bare]
      }
      if (lower.startsWith('.bash')) return 'sh'
      const dot = lower.lastIndexOf('.')
      if (dot < 0) return 'plain'
      return LANG_BY_EXT[lower.slice(dot + 1)] ?? 'plain'
    }

    /** Whether the family tokenizes C preprocessor directives. */
    function hasPreprocessor(family) {
      return family === 'c' || family === 'css'
    }

    /** Words this family treats as keywords. */
    function wordsOf(family) {
      if (family === 'py') return PY_WORDS
      if (family === 'sh' || family === 'yaml' || family === 'hash') return SH_WORDS
      if (family === 'md' || family === 'json') return MARK_WORDS
      return C_WORDS
    }

    /**
     * Scan one line into `{text, cls}` spans.
     * @param {string} text - the raw line.
     * @param {string} family - tokenizer family.
     * @param {{ block?: string }} state - carried block-comment state.
     * @returns {Array<{ text: string, cls: string }>} spans.
     */
    function scanLine(text, family, state) {
      const spans = []
      let index = 0
      const push = (cls, value) => {
        if (value === '' || value === undefined) return
        const last = spans[spans.length - 1]
        if (last !== undefined && last.cls === cls) last.text += value
        else spans.push({ text: value, cls })
      }
      if (family === 'diff') {
        const lead = text.charAt(0)
        const cls = lead === '+' ? 'add' : lead === '-' ? 'del' : lead === '@' ? 'hunk' : 'plain'
        return [{ text, cls }]
      }
      const blockEnd = family === 'xml' ? '-->' : '*/'
      const blockStart = family === 'xml' ? '<!--' : '/*'
      const lineComment = family === 'py' || family === 'sh' || family === 'yaml' || family === 'hash'
        ? '#'
        : family === 'xml' || family === 'json'
          ? undefined
          : '//'
      const words = wordsOf(family)
      while (index < text.length) {
        if (state.block !== undefined) {
          const close = text.indexOf(blockEnd, index)
          if (close < 0) {
            push('comment', text.slice(index))
            index = text.length
            break
          }
          push('comment', text.slice(index, close + blockEnd.length))
          index = close + blockEnd.length
          state.block = undefined
          continue
        }
        const rest = text.slice(index)
        const char = text[index]
        if (char === ' ' || char === '\t') {
          let end = index
          while (text[end] === ' ' || text[end] === '\t') end += 1
          push('plain', text.slice(index, end))
          index = end
          continue
        }
        if (hasPreprocessor(family) && char === '#' && text.slice(0, index).trim() === '') {
          push('meta', rest)
          break
        }
        if (lineComment !== undefined && rest.startsWith(lineComment)) {
          push('comment', rest)
          break
        }
        if (rest.startsWith(blockStart)) {
          const close = text.indexOf(blockEnd, index + blockStart.length)
          if (close < 0) {
            push('comment', text.slice(index))
            index = text.length
            state.block = blockStart
            break
          }
          push('comment', text.slice(index, close + blockEnd.length))
          index = close + blockEnd.length
          continue
        }
        if (char === '"' || char === "'" || char === '`') {
          let end = index + 1
          let closed = false
          while (end < text.length) {
            const current = text[end]
            if (current === '\\') {
              end += 2
              continue
            }
            if (current === char) {
              end += 1
              closed = true
              break
            }
            end += 1
          }
          push('string', text.slice(index, end))
          index = closed ? end : text.length
          continue
        }
        if (char >= '0' && char <= '9') {
          const match = /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)[uUlLfF]*/.exec(rest)
          if (match !== null) {
            push('number', match[0])
            index += match[0].length
            continue
          }
        }
        if (/[A-Za-z_$]/.test(char)) {
          const match = /^[A-Za-z_$][\w$]*/.exec(rest)
          const word = match === null ? char : match[0]
          const after = text.slice(index + word.length).trimStart()
          let cls = 'plain'
          if (words.has(word)) cls = 'keyword'
          else if (family === 'yaml' && after.startsWith(':')) cls = 'key'
          else if (after.startsWith('(')) cls = 'func'
          else if (/^[A-Z][A-Z0-9_]*$/.test(word) && word.length > 1) cls = 'const'
          else if (family === 'c' && /^[A-Z]/.test(word)) cls = 'type'
          push(cls, word)
          index += word.length
          continue
        }
        push('punct', char)
        index += 1
      }
      if (spans.length === 0) return [{ text: '', cls: 'plain' }]
      return spans
    }

    /**
     * Tokenize every line of one file, carrying block comments across lines.
     * @param {Array<object>} rows - rows in display order.
     * @param {string} family - tokenizer family.
     * @returns {Array<Array<{ text: string, cls: string }>>} spans per row.
     */
    function tokenizeRows(rows, family) {
      const state = {}
      const out = []
      for (const row of rows) {
        // A Host-compacted gap hides text this run cannot see: start the next
        // row outside any block comment rather than guessing.
        if (row.t === 'gap') {
          state.block = undefined
          out.push([])
          continue
        }
        out.push(scanLine(row.s ?? '', family, state))
      }
      return out
    }

    /** CSS custom property per token class. */
    const TOKEN_VAR = {
      keyword: 'var(--shiki-token-keyword)',
      string: 'var(--shiki-token-string)',
      comment: 'var(--shiki-token-comment)',
      number: 'var(--shiki-token-constant)',
      func: 'var(--shiki-token-function)',
      type: 'var(--shiki-token-constant)',
      const: 'var(--shiki-token-parameter)',
      meta: 'var(--shiki-token-parameter)',
      key: 'var(--shiki-token-function)',
      punct: 'var(--shiki-token-punctuation)',
    }

    /** Render one line's spans. */
    function CodeText({ spans }) {
      if (spans === undefined || spans.length === 0) return null
      return h(Fragment, null, ...spans.map((span, index) => {
        const color = TOKEN_VAR[span.cls]
        return color === undefined
          ? h(Fragment, { key: index }, span.text)
          : h('span', { key: index, style: { color } }, span.text)
      }))
    }

    // ---------------------------------------------------------------------
    // Diff model
    // ---------------------------------------------------------------------

    /**
     * Fold unchanged lines into gap segments, keeping `context` lines around
     * every change. Host-provided gaps (large files) stay fixed markers.
     * @param {Array<object>} rows - unified rows from the Host.
     * @returns {Array<object>} segments in display order.
     */
    function segmentRows(rows) {
      const keep = new Uint8Array(rows.length)
      for (let index = 0; index < rows.length; index += 1) {
        const type = rows[index].t
        if (type === 'gap') {
          keep[index] = 1
          continue
        }
        if (type === 'ctx') continue
        const from = Math.max(0, index - CONTEXT_LINES)
        const to = Math.min(rows.length - 1, index + CONTEXT_LINES)
        for (let mark = from; mark <= to; mark += 1) keep[mark] = 1
      }
      const segments = []
      let hiddenStart = -1
      const flushHidden = (end) => {
        if (hiddenStart < 0) return
        const hidden = rows.slice(hiddenStart, end)
        segments.push({ kind: 'gap', key: `g${hiddenStart}`, count: hidden.length, hidden, expandable: true })
        hiddenStart = -1
      }
      for (let index = 0; index < rows.length; index += 1) {
        if (keep[index] === 0) {
          if (hiddenStart < 0) hiddenStart = index
          continue
        }
        flushHidden(index)
        const row = rows[index]
        if (row.t === 'gap') {
          segments.push({ kind: 'gap', key: undefined, count: row.g ?? 0, hidden: [], expandable: false })
          continue
        }
        const last = segments[segments.length - 1]
        if (last !== undefined && last.kind === 'rows') last.rows.push(row)
        else segments.push({ kind: 'rows', rows: [row] })
      }
      flushHidden(rows.length)
      return segments
    }

    /**
     * Apply the reader's reveal counts to the folded runs.
     * @param {Array<object>} segments - folded segments.
     * @param {Record<string, number>} revealed - gap key → lines already revealed.
     * @returns {Array<object>} blocks: rendered rows, or the run still folded.
     */
    function expandSegments(segments, revealed) {
      const blocks = []
      for (const segment of segments) {
        if (segment.kind === 'rows') {
          blocks.push(segment)
          continue
        }
        if (!segment.expandable) {
          blocks.push({ kind: 'gap', key: undefined, count: segment.count, expandable: false })
          continue
        }
        const total = segment.hidden.length
        const shown = Math.min(total, Math.max(0, Number(revealed[segment.key]) || 0))
        if (shown > 0) blocks.push({ kind: 'rows', rows: segment.hidden.slice(0, shown) })
        if (shown < total) {
          blocks.push({ kind: 'gap', key: segment.key, count: total - shown, total, expandable: true })
        }
      }
      return blocks
    }

    /** Pair unified rows into two-column rows for the side-by-side view. */
    function splitRows(rows) {
      const paired = []
      let deletions = []
      let additions = []
      const flush = () => {
        const length = Math.max(deletions.length, additions.length)
        for (let index = 0; index < length; index += 1) {
          paired.push({ left: deletions[index] ?? null, right: additions[index] ?? null })
        }
        deletions = []
        additions = []
      }
      for (const row of rows) {
        if (row.t === 'del') {
          if (additions.length > 0) flush()
          deletions.push(row)
          continue
        }
        if (row.t === 'add') {
          additions.push(row)
          continue
        }
        flush()
        paired.push({ left: row, right: row })
      }
      flush()
      return paired
    }

    /**
     * Build the Gerrit ReviewInput body from staged drafts and the reply form.
     * Pure so the payload can be checked without a browser.
     * @param {Record<string, Array<object>>} drafts - staged comments by path.
     * @param {string} message - review summary message.
     * @param {Record<string, number|string>} votes - label votes.
     * @returns {{ message: string, labels: Record<string, number>, comments: Record<string, Array<object>> }} the review.
     */
    function buildReviewPayload(drafts, message, votes) {
      const comments = {}
      for (const [path, list] of Object.entries(drafts ?? {})) {
        if (!Array.isArray(list) || list.length === 0) continue
        comments[path] = list.map(item => ({
          line: item.line,
          message: item.message,
          ...(item.side === 'PARENT' ? { side: 'PARENT' } : {}),
          ...(typeof item.startLine === 'number' && item.startLine < item.line
            ? {
              range: {
                start_line: item.startLine,
                start_character: 0,
                end_line: item.line,
                end_character: typeof item.endCharacter === 'number' ? item.endCharacter : 0,
              },
            }
            : {}),
        }))
      }
      const labels = {}
      for (const [name, value] of Object.entries(votes ?? {})) {
        const numeric = Number(value)
        if (Number.isSafeInteger(numeric)) labels[name] = numeric
      }
      return { message: typeof message === 'string' ? message.trim() : '', labels, comments }
    }

    /**
     * Gerrit anchor of a contiguous run of diff rows: the revision side unless
     * the run is made only of deletions, plus the character span of the last
     * line so Gerrit draws a full-line range.
     * @param {Array<object>} rows - complete unified rows of the file.
     * @param {number} from - first row index (inclusive).
     * @param {number} to - last row index (inclusive).
     * @returns {{ side: 'REVISION'|'PARENT', from: number, to: number, endCharacter: number } | null} the anchor.
     */
    function rangeAnchor(rows, from, to) {
      const slice = rows.slice(from, to + 1)
      if (slice.length === 0) return null
      const useParent = slice.every(row => typeof row.n !== 'number')
      const lines = slice.map(row => (useParent ? row.o : row.n)).filter(line => typeof line === 'number')
      if (lines.length === 0) return null
      const last = slice[slice.length - 1]
      const text = useParent ? last.s : last.s
      return {
        side: useParent ? 'PARENT' : 'REVISION',
        from: Math.min(...lines),
        to: Math.max(...lines),
        endCharacter: typeof text === 'string' ? text.length : 0,
      }
    }

    /**
     * Gerrit anchor of one diff row: deletions belong to the parent side,
     * everything else to the revision under review.
     * @param {object} row - a unified diff row.
     * @returns {{ side: 'REVISION'|'PARENT', line: number }} the anchor.
     */
    function rowAnchor(row) {
      return row.t === 'del'
        ? { side: 'PARENT', line: row.o }
        : { side: 'REVISION', line: row.n }
    }

    /**
     * Read the browser's text selection inside one diff table.
     * @param {HTMLElement} container - element that owns the rows.
     * @returns {{ from: number, to: number, text: string, rect: {left: number, top: number, bottom: number} } | null} the rows and text.
     */
    function readTextSelection(container) {
      const selection = window.getSelection()
      if (selection === null || selection === undefined || selection.isCollapsed || selection.rangeCount === 0) return null
      const range = selection.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) return null
      const rowOf = (node) => {
        let element = node.nodeType === 1 ? node : node.parentElement
        while (element !== null && element !== undefined && element !== container) {
          if (element.hasAttribute !== undefined && element.hasAttribute('data-row-index')) return element
          element = element.parentElement
        }
        return null
      }
      const startRow = rowOf(range.startContainer)
      const endRow = rowOf(range.endContainer)
      if (startRow === null || endRow === null) return null
      const a = Number(startRow.getAttribute('data-row-index'))
      const b = Number(endRow.getAttribute('data-row-index'))
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null
      const from = Math.min(a, b)
      const to = Math.max(a, b)
      // Collect only the code cells the selection touches: comment notes and
      // other chrome between the rows must never end up in the quote, and in
      // the side-by-side view only the column the reader dragged over counts.
      const lines = []
      for (const element of container.querySelectorAll('tr[data-row-index]')) {
        const index = Number(element.getAttribute('data-row-index'))
        if (!(index >= from && index <= to)) continue
        for (const cell of element.querySelectorAll('.gwb-code')) {
          if (range.intersectsNode(cell)) lines.push(cell.textContent ?? '')
        }
      }
      const text = lines.join('\n')
      if (text.trim() === '') return null
      const rect = range.getBoundingClientRect()
      return {
        from,
        to,
        text,
        rect: { left: rect.left, top: rect.top, bottom: rect.bottom },
      }
    }

    /** One diff row as prompt text. */
    function promptLine(row) {
      if (row.t === 'add') return `+${row.s}`
      if (row.t === 'del') return `-${row.s}`
      return ` ${row.s}`
    }

    // ---------------------------------------------------------------------
    // Icons
    // ---------------------------------------------------------------------

    function svg(paths, props) {
      const size = props?.size ?? 16
      return h('svg', {
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        style: { display: 'block', flex: 'none' },
      }, ...paths.map((entry, index) => (typeof entry === 'string'
        ? h('path', { key: index, d: entry })
        : h(entry.tag, { key: index, ...entry.attrs }))))
    }

    const IconRefresh = props => svg(['M13.4 8a5.4 5.4 0 1 1-1.6-3.9', 'M13.6 2.6v3.2h-3.2'], props)
    const IconSearch = props => svg([{ tag: 'circle', attrs: { cx: 7, cy: 7, r: 4.2 } }, 'M10.2 10.2 14 14'], props)
    const IconClose = props => svg(['M4 4l8 8', 'M12 4l-8 8'], props)
    const IconExternal = props => svg(['M6.5 3.5H3.5v9h9V9.5', 'M9 3h4v4', 'M13 3 7.5 8.5'], props)
    const IconChevron = props => svg(['M5.5 3.5 10 8l-4.5 4.5'], props)
    const IconSplit = props => svg(['M2.5 3.5h11v9h-11z', 'M8 3.5v9'], props)
    const IconUnified = props => svg(['M2.5 3.5h11v9h-11z', 'M2.5 7h11', 'M2.5 9.5h11'], props)
    const IconWrap = props => svg(['M3 4.5h10', 'M3 8h7.5a2.2 2.2 0 0 1 0 4.4H7', 'M8.4 10.2 6.6 12l1.8 1.8'], props)
    const IconQuote = props => svg(['M4 10.5c0-2.4 1.2-4 3.2-4.6', 'M9.4 10.5c0-2.4 1.2-4 3.2-4.6'], props)
    const IconSparkle = props => svg(['M8 2.2l1.5 3.8L13.3 7.5 9.5 9l-1.5 3.8L6.5 9 2.7 7.5 6.5 6z'], props)
    const IconChevrons = props => svg(['M5.6 6.2 8 3.8l2.4 2.4', 'M5.6 9.8 8 12.2l2.4-2.4'], props)
    const IconPanel = props => svg(['M2.5 3.5h11v9h-11z', 'M10 3.5v9'], props)
    const IconList = props => svg(['M3 4h10', 'M3 8h10', 'M3 12h10'], props)
    const IconComment = props => svg(['M2.6 3.6h10.8v6.4H8.1L5.2 12.6V10H2.6z'], props)

    /** The Gerrit mark shown in the left sidebar panel list. */
    function SidebarIcon({ size, active }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size ?? 18,
        height: size ?? 18,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: active === true ? 1.9 : 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        style: { display: 'block' },
      },
      h('rect', { x: 3, y: 3.2, width: 12.6, height: 12.6, rx: 3.2 }),
      h('path', { d: 'M6.6 9.4l2.2 2.2 4.4-4.4' }),
      h('path', { d: 'M15.8 15.4h4.4v4.4' }),
      h('path', { d: 'M20.2 15.4a6.6 6.6 0 0 0-6.6 6.6' }))
    }

    // ---------------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------------

    const CSS = `
.gwb-root {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  overflow: hidden;
}
.gwb-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  flex: none;
  flex-wrap: wrap;
}
.gwb-brand { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.gwb-brand strong { font-size: 14px; font-weight: 600; letter-spacing: .01em; white-space: nowrap; }
.gwb-brand span { font-size: 11px; color: var(--dsw-alias-label-secondary); max-width: 260px; }
.gwb-tabs { display: inline-flex; padding: 2px; gap: 2px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); }
.gwb-tab {
  border: 0; background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; padding: 4px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap;
}
.gwb-tab:hover { color: var(--dsw-alias-label-primary); }
.gwb-tab[data-active] { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.gwb-spacer { flex: 1; }
.gwb-field {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary); min-width: 0;
}
.gwb-field:focus-within { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.gwb-field input {
  border: 0; outline: 0; background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; width: 200px; min-width: 60px;
}
.gwb-field input::placeholder { color: var(--dsw-alias-label-secondary); }
.gwb-select {
  height: 28px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; padding: 0 4px; max-width: 180px;
}
.gwb-iconbtn {
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  height: 28px; min-width: 28px; padding: 0 8px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; white-space: nowrap;
  text-decoration: none;
}
.gwb-iconbtn:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
.gwb-iconbtn[disabled] { opacity: .45; cursor: default; }
.gwb-iconbtn[data-tone="primary"] { background: var(--dsw-alias-brand-primary); border-color: transparent; color: #fff; }
.gwb-iconbtn[data-tone="primary"]:hover { color: #fff; filter: brightness(1.07); }
.gwb-iconbtn[data-active] { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.gwb-conn { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); max-width: 260px; }
.gwb-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); flex: none; }
.gwb-dot[data-state="ok"] { background: var(--dsw-alias-state-success-primary); }
.gwb-dot[data-state="error"] { background: var(--dsw-alias-state-error-primary); }
.gwb-dot[data-state="busy"] { background: var(--dsw-alias-state-warn-primary); }
.gwb-body { flex: 1; min-height: 0; display: flex; position: relative; }
.gwb-list {
  width: 306px; min-width: 240px; max-width: 40vw; display: flex; flex-direction: column;
  border-right: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); min-height: 0;
}
.gwb-list-head {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; flex: none;
  font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--dsw-alias-label-secondary);
  border-bottom: 1px solid var(--dsw-alias-border-l1); text-transform: none;
}
.gwb-list-scroll { overflow: auto; flex: 1; min-height: 0; padding: 6px; }
.gwb-row {
  display: flex; flex-direction: column; gap: 4px; width: 100%; text-align: left;
  padding: 8px 10px; border-radius: 8px; border: 1px solid transparent; background: transparent;
  color: inherit; font: inherit; cursor: pointer;
}
.gwb-row:hover { background: var(--dsw-alias-bg-layer-2); }
.gwb-row[data-selected] { background: var(--dsw-alias-bg-base); border-color: var(--dsw-alias-border-l2); }
.gwb-row-subject { font-size: 13px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.gwb-row-meta { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--dsw-alias-label-secondary); min-width: 0; }
.gwb-mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
.gwb-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.gwb-row-foot { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--dsw-alias-label-secondary); min-width: 0; }
.gwb-counts { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-variant-numeric: tabular-nums; flex: none; }
.gwb-chip {
  display: inline-flex; align-items: center; gap: 4px; height: 18px; padding: 0 6px;
  border-radius: 5px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
  font-size: 11px; white-space: nowrap; flex: none;
}
.gwb-chip[data-tone="ok"] { color: var(--dsw-alias-state-success-primary); }
.gwb-chip[data-tone="warn"] { color: var(--dsw-alias-state-warn-primary); }
.gwb-chip[data-tone="bad"] { color: var(--dsw-alias-state-error-primary); }
.gwb-add { color: var(--dsw-alias-state-success-primary); font-variant-numeric: tabular-nums; }
.gwb-del { color: var(--dsw-alias-state-error-primary); font-variant-numeric: tabular-nums; }
.gwb-detail { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.gwb-detail-scroll { flex: 1; overflow: auto; min-height: 0; }
.gwb-detail-head { padding: 14px 18px 10px; display: flex; flex-direction: column; gap: 8px; }
.gwb-detail-title { display: flex; align-items: flex-start; gap: 12px; }
.gwb-detail-title h2 { margin: 0; font-size: 16px; line-height: 1.35; font-weight: 600; flex: 1; min-width: 0; }
.gwb-detail-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.gwb-detail-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.gwb-kv { display: flex; gap: 10px; font-size: 12px; }
.gwb-kv dt { color: var(--dsw-alias-label-secondary); min-width: 56px; margin: 0; }
.gwb-kv dd { margin: 0; min-width: 0; }
.gwb-commit {
  margin: 0 18px 12px; padding: 10px 12px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1); font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px; line-height: 1.55; white-space: pre-wrap; color: var(--dsw-alias-label-secondary);
  max-height: 168px; overflow: auto;
}
.gwb-section-head {
  display: flex; align-items: center; gap: 8px; padding: 8px 18px; font-size: 11px;
  letter-spacing: .04em; color: var(--dsw-alias-label-secondary); border-top: 1px solid var(--dsw-alias-border-l1);
}
.gwb-files { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 18px 12px; }
.gwb-filechip {
  display: inline-flex; align-items: center; gap: 6px; max-width: 340px;
  padding: 3px 8px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 11px; cursor: pointer;
}
.gwb-filechip:hover { border-color: var(--dsw-alias-border-l2); }
.gwb-filechip[data-open] { border-color: var(--dsw-alias-brand-primary); }
.gwb-status-letter {
  display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px;
  border-radius: 4px; font-size: 10px; font-weight: 600; flex: none;
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
}
.gwb-status-letter[data-status="A"] { color: var(--dsw-alias-state-success-primary); }
.gwb-status-letter[data-status="D"] { color: var(--dsw-alias-state-error-primary); }
.gwb-status-letter[data-status="R"] { color: var(--dsw-alias-state-warn-primary); }
.gwb-toolbar-strip {
  display: flex; align-items: center; gap: 6px; padding: 6px 14px;
  border-top: 1px solid var(--dsw-alias-border-l1); border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); position: sticky; top: 0; z-index: 6;
}
.gwb-difftools { display: flex; align-items: center; gap: 4px; }
.gwb-file { border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gwb-file-head {
  display: flex; align-items: center; gap: 8px; padding: 6px 14px;
  background: var(--dsw-alias-bg-layer-1); position: sticky; top: 41px; z-index: 4;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.gwb-file-head .gwb-filepath { font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.gwb-file-head .gwb-chev { transition: transform .15s ease; color: var(--dsw-alias-label-secondary); }
.gwb-file-head[data-open] .gwb-chev { transform: rotate(90deg); }
.gwb-file-head-actions { display: flex; align-items: center; gap: 4px; flex: none; }
.gwb-hoveronly { opacity: 0; transition: opacity .12s ease; }
.gwb-file-head:hover .gwb-hoveronly, .gwb-line:hover .gwb-hoveronly { opacity: 1; }
.gwb-diff { overflow: auto; }
.gwb-diff-table { border-collapse: collapse; width: 100%; table-layout: fixed; }
.gwb-diff-table[data-wrap="1"] { table-layout: auto; }
.gwb-diff-table td { padding: 0; vertical-align: top; }
.gwb-num {
  width: 50px; padding: 0 7px !important; text-align: right; user-select: none;
  color: var(--dsw-alias-label-secondary); font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px; line-height: 20px; background: var(--dsw-alias-bg-base);
  border-right: 1px solid var(--dsw-alias-border-l1);
}
.gwb-sign {
  width: 16px; text-align: center; user-select: none;
  color: var(--dsw-alias-label-secondary); font-family: ui-monospace, Menlo, monospace;
  font-size: 11px; line-height: 20px;
}
.gwb-code {
  padding: 0 10px 0 4px !important; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px; line-height: 20px; white-space: pre; tab-size: 4; overflow-wrap: normal;
  color: var(--dsw-alias-label-primary); position: relative;
}
.gwb-diff-table[data-wrap="1"] .gwb-code { white-space: pre-wrap; overflow-wrap: anywhere; }
.gwb-line[data-kind="add"] .gwb-code { background: color-mix(in oklab, var(--dsw-alias-state-success-primary) 12%, transparent); }
.gwb-line[data-kind="del"] .gwb-code { background: color-mix(in oklab, var(--dsw-alias-state-error-primary) 12%, transparent); }
.gwb-line[data-kind="add"] .gwb-sign { color: var(--dsw-alias-state-success-primary); }
.gwb-line[data-kind="del"] .gwb-sign { color: var(--dsw-alias-state-error-primary); }
.gwb-line[data-kind="add"] .gwb-num { background: color-mix(in oklab, var(--dsw-alias-state-success-primary) 9%, transparent); }
.gwb-line[data-kind="del"] .gwb-num { background: color-mix(in oklab, var(--dsw-alias-state-error-primary) 9%, transparent); }
.gwb-cell-add { background: color-mix(in oklab, var(--dsw-alias-state-success-primary) 12%, transparent); }
.gwb-cell-del { background: color-mix(in oklab, var(--dsw-alias-state-error-primary) 12%, transparent); }
.gwb-sign-add { color: var(--dsw-alias-state-success-primary); }
.gwb-sign-del { color: var(--dsw-alias-state-error-primary); }
.gwb-line:hover .gwb-code { background: color-mix(in oklab, var(--dsw-alias-brand-primary) 8%, transparent); }
.gwb-line-action { position: absolute; right: 6px; top: 1px; z-index: 2; }
.gwb-mini {
  display: inline-flex; align-items: center; justify-content: center; height: 18px; min-width: 18px;
  padding: 0 4px; border-radius: 4px; border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-secondary); cursor: pointer;
  font: inherit; font-size: 10px; gap: 3px;
}
.gwb-mini:hover { color: var(--dsw-alias-label-primary); }
.gwb-gap-cell { padding: 0 !important; }
.gwb-gap {
  display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 0; width: 100%;
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 11px; cursor: pointer; text-align: left;
}
.gwb-gap:hover { color: var(--dsw-alias-label-primary); }
.gwb-gap[disabled] { cursor: default; }
.gwb-capped {
  padding: 6px 14px; font-size: 11px; color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2); border-top: 1px dashed var(--dsw-alias-border-l1);
}
.gwb-gap-inner { display: flex; align-items: center; gap: 6px; width: 100%; padding: 3px 0; border-top: 1px dashed var(--dsw-alias-border-l1); border-bottom: 1px dashed var(--dsw-alias-border-l1); }
.gwb-gap-hint { color: var(--dsw-alias-brand-primary); }
.gwb-reviewed {
  display: inline-flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer;
  color: var(--dsw-alias-label-secondary); user-select: none; padding: 0 4px; white-space: nowrap;
}
.gwb-reviewed input { margin: 0; accent-color: var(--dsw-alias-brand-primary); }
.gwb-file[data-reviewed] .gwb-file-head { opacity: .7; }
.gwb-note {
  margin: 3px 8px 6px; padding: 8px 12px; border-radius: 8px; font-size: 12px; line-height: 1.5;
  background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
  white-space: pre-wrap;
}
.gwb-note[data-unresolved] { border-left: 3px solid var(--dsw-alias-state-warn-primary); }
.gwb-note-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.gwb-empty {
  display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center;
  height: 100%; min-height: 160px; padding: 32px 24px; text-align: center;
  color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6;
}
.gwb-error {
  margin: 12px; padding: 10px 12px; border-radius: 8px; font-size: 12px; line-height: 1.55;
  background: color-mix(in oklab, var(--dsw-alias-state-error-primary) 10%, transparent);
  border: 1px solid color-mix(in oklab, var(--dsw-alias-state-error-primary) 35%, transparent);
  color: var(--dsw-alias-label-primary); white-space: pre-wrap;
}
.gwb-ai {
  width: 428px; min-width: 340px; max-width: 46vw; display: flex; flex-direction: column;
  border-left: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); min-height: 0; flex: none;
}
.gwb-ai-head {
  display: flex; align-items: center; gap: 8px; padding: 7px 12px; flex: none;
  border-bottom: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
}
.gwb-ai-head strong { font-size: 12px; font-weight: 600; white-space: nowrap; }
.gwb-ai-head span { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.gwb-ai-target {
  display: flex; align-items: center; gap: 6px; padding: 4px 10px; flex: none;
  border-bottom: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
  font-size: 11px; color: var(--dsw-alias-label-secondary); min-width: 0;
}
.gwb-select-sm { height: 24px; font-size: 11px; max-width: 168px; }
.gwb-ai-target-path { margin-left: auto; max-width: 168px; font-size: 10px; opacity: .85; }
.gwb-ai-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.gwb-ai-surface { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.gwb-ai-surface > * { flex: 1; min-height: 0; }
.gwb-ai-empty { display: flex; flex-direction: column; gap: 10px; align-items: center; justify-content: center; padding: 24px 20px; text-align: center; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.gwb-boundary { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; overflow: auto; }
.gwb-root { position: relative; }
.gwb-num-click { cursor: pointer; }
.gwb-line[data-selected] .gwb-code { background: color-mix(in oklab, var(--dsw-alias-brand-primary) 16%, transparent); }
.gwb-line[data-selected] .gwb-num { background: color-mix(in oklab, var(--dsw-alias-brand-primary) 22%, transparent); color: var(--dsw-alias-label-primary); }
.gwb-float {
  position: fixed; z-index: 60; display: inline-flex; align-items: center; gap: 4px;
  padding: 4px; border-radius: 8px; background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l2); box-shadow: 0 8px 24px rgb(0 0 0 / .22);
}
.gwb-diff-holder { display: block; }
.gwb-toolbar-hint { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gwb-selection-bar {
  display: flex; align-items: center; gap: 6px; padding: 4px 14px; flex: none;
  background: color-mix(in oklab, var(--dsw-alias-brand-primary) 12%, var(--dsw-alias-bg-layer-1));
  border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 11px; color: var(--dsw-alias-label-primary);
  position: sticky; top: 41px; z-index: 5;
}
.gwb-num-click:hover { color: var(--dsw-alias-brand-primary); background: color-mix(in oklab, var(--dsw-alias-brand-primary) 10%, transparent); }
.gwb-composer {
  margin: 4px 8px 6px; padding: 8px 10px; border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l2);
  display: flex; flex-direction: column; gap: 6px;
}
.gwb-composer-head { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.gwb-composer-input {
  width: 100%; box-sizing: border-box; resize: vertical; padding: 6px 8px;
  border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; line-height: 1.5; outline: none;
}
.gwb-composer-input:focus { border-color: var(--dsw-alias-border-l2); }
.gwb-composer-actions { display: flex; align-items: center; gap: 6px; }
.gwb-muted { color: var(--dsw-alias-label-secondary); font-size: 11px; min-width: 0; }
.gwb-note[data-draft] { border-style: dashed; border-left: 3px solid var(--dsw-alias-state-warn-primary); }
.gwb-backdrop {
  position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center;
  background: rgb(0 0 0 / .32); padding: 16px;
}
.gwb-modal {
  width: min(600px, 92%); max-height: 88%; display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px;
  box-shadow: 0 18px 48px rgb(0 0 0 / .3); overflow: hidden;
}
.gwb-modal-head {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px; flex: none;
  border-bottom: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
}
.gwb-modal-head strong { font-size: 13px; }
.gwb-modal-head span { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.gwb-modal-body { padding: 12px 14px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.gwb-modal-foot {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px; flex: none;
  border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
}
.gwb-vote-grid { display: flex; flex-direction: column; gap: 6px; }
.gwb-vote-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.gwb-vote-name { min-width: 96px; color: var(--dsw-alias-label-secondary); }
.gwb-field-label { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 4px; }
.gwb-draft-list { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow: auto; }
.gwb-draft-row { padding: 6px 8px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); }
.gwb-draft-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.gwb-draft-text { font-size: 12px; line-height: 1.5; white-space: pre-wrap; margin-top: 3px; }
.gwb-confirm {
  margin-top: 4px; padding: 8px 10px; border-radius: 8px; font-size: 12px; line-height: 1.5;
  background: color-mix(in oklab, var(--dsw-alias-state-warn-primary) 12%, transparent);
  border: 1px solid color-mix(in oklab, var(--dsw-alias-state-warn-primary) 40%, transparent);
}
.gwb-toast {
  position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%);
  padding: 8px 14px; border-radius: 8px; font-size: 12px; z-index: 20;
  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary); box-shadow: 0 6px 24px rgb(0 0 0 / .18);
  max-width: 70%; text-align: center;
}
`

    // ---------------------------------------------------------------------
    // Review desk state
    // ---------------------------------------------------------------------

    /** Initial workbench state. */
    function initialState() {
      return {
        scope: 'outgoing',
        status: 'open',
        query: '',
        meta: { phase: 'idle', value: null, error: null },
        list: { phase: 'idle', items: [], error: null, more: false, start: 0, query: '' },
        selected: null,
        detail: { phase: 'idle', value: null, error: null, rev: '', base: '', comments: {}, reviewed: {} },
        diffs: {},
        openFiles: {},
        openGaps: {},
        drafts: {},
        selection: null,
        textSelection: null,
        composer: null,
        replyOpen: false,
        prefs: { split: true, wrap: false, filesOpen: true, listOpen: true },
        ai: { open: false, phase: 'idle', sessionId: null, changeNumber: null, error: null, notice: null, busy: false, reference: undefined, target: readTarget() },
      }
    }

    /** Sidebar size and open state preference remembered across reloads. */
    function readPrefs() {
      try {
        const raw = window.localStorage.getItem('dsh.gerrit-workbench.prefs.v1')
        const parsed = raw === null ? undefined : JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
      } catch (_unavailable) {
        return {}
      }
    }

    /** Build the injected face: data reads and session operations bound to one plugin context. */
    function createFace(ctx, store) {
      let reference
      let previousReference
      let sessionKey
      let noticeTimer
      const localeSource = {
        getSnapshot: () => ctx.locale.getLocale(),
        subscribe: listener => ctx.locale.subscribe(listener),
      }
      /** Identity-stable empty rows: `useSnapshot` never sees a freshly built array. */
      const noWorkspaces = []
      /** Bound once the Workspace service registers (this plugin activates first). */
      let workspaceService
      const workspaceListeners = new Set()
      /** Wake every component subscribed through `workspaceSource`. */
      const notifyWorkspaces = () => {
        for (const listener of [...workspaceListeners]) listener()
      }
      /**
       * Read the Workspace rows for the review target picker.
       *
       * The model's rows are identity-stable, so they are returned untouched: a
       * fresh array on every call would make `useSyncExternalStore` re-render
       * forever (React #185 "Maximum update depth exceeded").
       */
      const readWorkspaces = () => {
        if (workspaceService === undefined) return noWorkspaces
        const items = workspaceService.list.getSnapshot().items
        return Array.isArray(items) ? items : noWorkspaces
      }
      const workspaceSource = {
        getSnapshot: readWorkspaces,
        subscribe: (listener) => {
          workspaceListeners.add(listener)
          return () => { workspaceListeners.delete(listener) }
        },
      }
      // The Workspace service may register after this plugin, so bind it late
      // instead of freezing the fallback above into the face.
      ctx.inject(['workspaces'], (scope) => {
        workspaceService = scope.get('workspaces')
        const detach = workspaceService.list.subscribe(notifyWorkspaces)
        notifyWorkspaces()
        scope.effect(() => () => {
          detach()
          workspaceService = undefined
          notifyWorkspaces()
        })
      })
      const t = (key, params) => format(ctx.locale.bind(NS)(key), params)
      const state = () => store.getSnapshot()
      const update = patch => store.patch(patch)

      /** Persist one display preference. */
      function savePrefs(next) {
        try { window.localStorage.setItem('dsh.gerrit-workbench.prefs.v1', JSON.stringify(next)) } catch (_unavailable) { /* best-effort */ }
      }

      /** Put a transient notice in the page. */
      function notify(text) {
        update({ ai: { ...state().ai, notice: text } })
        if (noticeTimer !== undefined) clearTimeout(noticeTimer)
        noticeTimer = setTimeout(() => {
          update({ ai: { ...state().ai, notice: null } })
        }, 4200)
      }

      /**
       * Adopt the Host's review-session matching mode.
       * @param {string} value - 'patchSet' or 'change'.
       */
      function applySessionMatch(value) {
        const next = value === 'change' ? 'change' : 'patchSet'
        if (next === sessionMatchMode) return
        sessionMatchMode = next
        // Re-resolve the panel now; the key of the current session just changed.
        if (state().ai.open === true && state().detail.value !== null) syncSessionForPatch()
      }

      /** Read the meta row and the signed-in account. */
      async function loadMeta() {
        update({ meta: { ...state().meta, phase: 'loading' } })
        try {
          const value = await apiGet('/meta')
          applySessionMatch(value.sessionMatch)
          update({ meta: { phase: 'ready', value, error: value.error ?? null } })
        } catch (error) {
          update({ meta: { phase: 'error', value: null, error: error.message } })
        }
      }

      /** Read one page of the current scope. */
      async function loadList(options = {}) {
        const current = state()
        const append = options.append === true
        const start = append ? current.list.start + current.list.items.length : 0
        update({ list: { ...current.list, phase: append ? 'append' : 'loading', error: null } })
        try {
          const value = await apiGet('/changes', {
            scope: current.scope,
            status: current.status,
            q: current.query,
            limit: PAGE_SIZE,
            start,
            force: options.force === true ? 1 : undefined,
          })
          const items = append ? [...state().list.items, ...value.changes] : value.changes
          update({ list: { phase: 'ready', items, error: null, more: value.more && value.changes.length > 0, start: value.start, query: value.query } })
        } catch (error) {
          update({ list: { ...state().list, phase: 'error', error: error.message } })
        }
      }

      /**
       * Read one file's diff into the store (cached by revision).
       * @param {object} detail - the selected change.
       * @param {string} path - repository path.
       * @param {object} [options] - `force` ignores a cached answer.
       * @returns {Promise<object | undefined>} the diff, or undefined on failure.
       */
      async function fetchDiff(detail, path, options = {}) {
        const key = `${path}@${detail.revision}`
        const existing = state().diffs[key]
        if (existing !== undefined && existing.phase === 'ready' && existing.value !== null && options.force !== true) return existing.value
        update({ diffs: { ...state().diffs, [key]: { phase: 'loading', value: existing === undefined ? null : existing.value, error: null } } })
        try {
          const base = state().detail.base
          const value = await apiGet(`/change/${detail.number}/diff`, {
            path,
            rev: detail.revision === '' ? 'current' : detail.revision,
            base: base === '' ? undefined : base,
            full: options.full === true ? 1 : undefined,
          })
          update({ diffs: { ...state().diffs, [key]: { phase: 'ready', value, error: null, full: options.full === true || value.capped !== true } } })
          return value
        } catch (error) {
          update({ diffs: { ...state().diffs, [key]: { phase: 'error', value: null, error: error.message } } })
          return undefined
        }
      }

      /** Open one file section and read its diff when it is not loaded yet. */
      async function openFile(path, options = {}) {
        const current = state()
        const detail = current.detail.value
        if (detail === null) return
        update({ openFiles: { ...current.openFiles, [path]: true } })
        await fetchDiff(detail, path, options)
      }

      /** Read one change with its files and comments, then open its first file. */
      async function selectChange(number, options = {}) {
        const current = state()
        const rev = options.rev === undefined ? '' : String(options.rev)
        const sameChange = current.selected === number
        const base = options.base === undefined ? (sameChange ? current.detail.base : '') : String(options.base)
        if (sameChange && options.force !== true && current.detail.value !== null) {
          const settledRev = String(current.detail.rev)
          const sameRevision = rev === ''
            || rev === settledRev
            || rev === String(current.detail.value.patchSet)
            || rev === current.detail.value.revision
          if (sameRevision && base === current.detail.base) return
        }
        update({
          selected: number,
          detail: {
            phase: 'loading',
            value: sameChange ? current.detail.value : null,
            error: null,
            rev,
            base,
            comments: sameChange ? current.detail.comments : {},
            reviewed: sameChange ? current.detail.reviewed : {},
          },
          diffs: {},
          openFiles: {},
          openGaps: {},
          drafts: {},
          selection: null,
          textSelection: null,
          composer: null,
          replyOpen: false,
        })
        try {
          const detail = await apiGet(`/change/${number}`, { rev: rev === '' ? undefined : rev })
          update({ detail: {
            phase: 'ready',
            value: detail,
            error: null,
            rev: rev === '' ? String(detail.patchSet) : rev,
            base,
            comments: state().detail.comments,
            reviewed: readReviewed(state().meta.value, detail),
          },
          drafts: readDrafts(state().meta.value, detail) })
          void loadComments(detail.number)
          // The AI panel follows the patch set now on screen.
          syncSessionForPatch()
          const first = detail.files.find(file => file.path !== '/COMMIT_MSG' && !file.binary)
            ?? detail.files.find(file => file.path === '/COMMIT_MSG')
          if (first !== undefined) void openFile(first.path)
        } catch (error) {
          update({ detail: { ...state().detail, phase: 'error', error: error.message } })
        }
      }

      /** Read inline comments for one change. */
      async function loadComments(number) {
        try {
          const comments = await apiGet(`/change/${number}/comments`)
          const current = state()
          if (current.selected !== number) return
          update({ detail: { ...current.detail, comments } })
        } catch (_ignored) { /* comments are an enhancement */ }
      }

      /** Switch the review scope and reload. */
      function setScope(scope) {
        update({ scope, selected: null, detail: initialState().detail, diffs: {}, openFiles: {}, openGaps: {} })
        void loadList()
      }

      /** Switch the status filter and reload. */
      function setStatus(status) {
        update({ status })
        void loadList()
      }

      /** Apply a free-text query and reload. */
      function setQuery(query) {
        update({ query })
        void loadList()
      }

      /** Refresh the connection, the list, and the open change. */
      function refresh() {
        void apiGet('/refresh').catch(() => {})
        void loadMeta()
        void loadList({ force: true })
        const current = state()
        if (current.selected !== null) {
          void selectChange(current.selected, { force: true, rev: current.detail.rev === '' ? undefined : current.detail.rev })
        }
      }

      /** Set one display preference. */
      function setPref(key, value) {
        const next = { ...state().prefs, [key]: value }
        savePrefs(next)
        update({ prefs: next })
      }

      /** Expand or collapse one file section. */
      function toggleOpenFile(path, opened) {
        const value = opened === undefined ? !state().openFiles[path] : opened
        update({ openFiles: { ...state().openFiles, [path]: value } })
        if (value) void openFile(path)
      }

      /**
       * Reveal lines of one folded run, Gerrit style: one step of `step` lines
       * per click, everything on request.
       * @param {string} path - file path.
       * @param {string} key - gap identity.
       * @param {number} remaining - lines still hidden in that run.
       * @param {boolean} all - reveal every remaining line.
       */
      function expandGap(path, key, remaining, all) {
        const current = state()
        const perPath = { ...(current.openGaps[path] ?? {}) }
        const revealed = perPath[key] ?? 0
        const step = all === true ? remaining : Math.min(GAP_STEP, remaining)
        perPath[key] = revealed + step
        update({ openGaps: { ...current.openGaps, [path]: perPath } })
      }

      /** Reveal every folded run of one file. */
      function revealAllGaps(path) {
        const current = state()
        const detail = current.detail.value
        if (detail === null) return
        const entry = current.diffs[`${path}@${detail.revision}`]
        if (entry === undefined || entry.value === null) return
        const perPath = {}
        for (const segment of segmentRows(entry.value.rows)) {
          if (segment.kind === 'gap' && segment.expandable) perPath[segment.key] = segment.hidden.length
        }
        update({ openGaps: { ...current.openGaps, [path]: perPath } })
      }

      /** Fold every revealed run of one file back to context. */
      function collapseGaps(path) {
        update({ openGaps: { ...state().openGaps, [path]: {} } })
      }

      /**
       * Read the whole file: past the Host row cap, then reveal every run.
       * @param {string} path - file path.
       */
      async function loadFullFile(path) {
        const detail = state().detail.value
        if (detail === null) return
        const key = `${path}@${detail.revision}`
        const entry = state().diffs[key]
        if (entry !== undefined && entry.full === true) {
          revealAllGaps(path)
          return
        }
        update({ diffs: { ...state().diffs, [key]: { phase: 'loading', value: entry?.value ?? null, error: null, full: false } } })
        await fetchDiff(detail, path, { force: true, full: true })
        revealAllGaps(path)
      }

      /** Toggle the Reviewed flag of one file (local review bookkeeping). */
      function toggleReviewed(path) {
        const detail = state().detail.value
        if (detail === null) return
        const reviewed = { ...state().detail.reviewed }
        if (reviewed[path] === true) delete reviewed[path]
        else reviewed[path] = true
        update({ detail: { ...state().detail, reviewed } })
        saveReviewed(state().meta.value, detail, reviewed)
      }

      /**
       * Switch the comparison baseline of the open change.
       * @param {string} base - revision sha, or empty for the parent commit.
       */
      function setBase(base) {
        const detail = state().detail.value
        if (detail === null) return
        const open = state().openFiles
        void selectChange(detail.number, { rev: state().detail.rev, base, force: true }).then(() => {
          for (const [path, opened] of Object.entries(open)) {
            if (opened === true) void openFile(path)
          }
        })
      }

      // ------------------------- review drafts -------------------------

      /** Rows of one file's diff at the current revision, or null. */
      function rowsOf(path) {
        const detail = state().detail.value
        if (detail === null) return null
        const entry = state().diffs[`${path}@${detail.revision}`]
        return entry === undefined || entry.value === null || !Array.isArray(entry.value.rows) ? null : entry.value.rows
      }

      /**
       * Select a run of diff rows; a click also opens the comment box, a drag
       * or Shift+click only moves the selection (and the open box with it).
       * @param {string} path - file path.
       * @param {number} fromIndex - anchor row index.
       * @param {number} toIndex - head row index.
       * @param {{ withComposer?: boolean }} [options] - open the comment box now.
       */
      function selectLines(path, fromIndex, toIndex, options = {}) {
        const rows = rowsOf(path)
        if (rows === null) return
        const from = Math.max(0, Math.min(fromIndex, toIndex))
        const to = Math.min(rows.length - 1, Math.max(fromIndex, toIndex))
        const current = state()
        const selection = { path, from, to }
        const composer = options.withComposer === true
          ? { path, from, to }
          : current.composer !== null && current.composer !== undefined && current.composer.path === path
            ? { path, from, to }
            : current.composer
        update({ selection, composer })
      }

      /** Start a selection at one row and open its comment box. */
      function startSelection(path, index) {
        selectLines(path, index, index, { withComposer: true })
      }

      /** Extend the current selection to another row. */
      function extendSelection(path, anchorIndex, index) {
        selectLines(path, anchorIndex, index)
      }

      /** Drop the selection and any open comment box. */
      function clearSelection() {
        update({ selection: null, composer: null })
      }

      /** Open the comment box for the rows already selected. */
      function openSelectionComment() {
        const selection = state().selection
        if (selection === null) return
        update({ composer: { path: selection.path, from: selection.from, to: selection.to } })
      }

      /** Close the inline comment box, keeping the selection. */
      function cancelComment() {
        update({ composer: null })
      }

      /** Remember the browser text selection and where its popup belongs. */
      function setTextSelection(path, found) {
        update({ textSelection: { path, ...found } })
      }

      /** Drop the text-selection popup. */
      function clearTextSelection() {
        if (state().textSelection === null) return
        update({ textSelection: null })
      }

      /** Comment on the rows the reader selected with the mouse. */
      function commentTextSelection() {
        const found = state().textSelection
        if (found === null) return
        update({
          textSelection: null,
          selection: { path: found.path, from: found.from, to: found.to },
          composer: { path: found.path, from: found.from, to: found.to },
        })
        const selection = window.getSelection()
        if (selection !== null && selection !== undefined) selection.removeAllRanges()
      }

      /** Quote the exact text the reader selected into the AI session. */
      function quoteTextSelection() {
        const current = state()
        const found = current.textSelection
        const detail = current.detail.value
        if (found === null || detail === null) return
        const rows = rowsOf(found.path)
        const anchor = rows === null ? null : rangeAnchor(rows, found.from, found.to)
        const range = anchor === null ? '' : (anchor.from === anchor.to ? `${anchor.from}` : `${anchor.from}-${anchor.to}`)
        update({ textSelection: null })
        const body = `> **Gerrit ${detail.number} · ${found.path}:${range} (PS ${detail.patchSet})**\n> \n> \`\`\`${languageOf(found.path) === 'plain' ? '' : languageOf(found.path)}\n`
          + found.text.replace(/\r\n?/gu, '\n').split('\n').map(line => `> ${line}`).join('\n')
          + '\n> ```'
        void quote(body).then((ok) => {
          if (ok) notify(t('ai.notice.quotedText', { path: found.path, range }))
        })
        const selection = window.getSelection()
        if (selection !== null && selection !== undefined) selection.removeAllRanges()
      }

      /** Stage one inline comment for the open range; posting publishes it. */
      function saveComment(message) {
        const current = state()
        const composer = current.composer
        const detail = current.detail.value
        const text = String(message ?? '').trim()
        if (composer === null || composer === undefined || detail === null || text === '') return
        const rows = rowsOf(composer.path)
        if (rows === null) return
        const anchor = rangeAnchor(rows, composer.from, composer.to)
        if (anchor === null) return
        const drafts = { ...current.drafts }
        const list = [...(drafts[composer.path] ?? [])]
        list.push({
          id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          line: anchor.to,
          side: anchor.side,
          startLine: anchor.from,
          endCharacter: anchor.endCharacter,
          message: text,
          at: new Date().toISOString(),
        })
        drafts[composer.path] = list
        saveDrafts(current.meta.value, detail, drafts)
        update({ drafts, composer: null, selection: null })
        notify(t('reply.staged'))
      }

      /** Drop one staged comment. */
      function removeDraft(path, id) {
        const current = state()
        const drafts = { ...current.drafts }
        const list = (drafts[path] ?? []).filter(item => item.id !== id)
        if (list.length === 0) delete drafts[path]
        else drafts[path] = list
        saveDrafts(current.meta.value, current.detail.value, drafts)
        update({ drafts })
      }

      /** Quote the selected rows into the AI review session. */
      function quoteSelection() {
        const current = state()
        const selection = current.selection
        const detail = current.detail.value
        if (selection === null || detail === null) return
        const rows = rowsOf(selection.path)
        if (rows === null) return
        const slice = rows.slice(selection.from, selection.to + 1).filter(row => row.t !== 'gap')
        if (slice.length === 0) return
        const anchor = rangeAnchor(rows, selection.from, selection.to)
        void quote(quoteBlock(detail, selection.path, slice, languageOf(selection.path))).then((ok) => {
          if (!ok) return
          notify(anchor === null
            ? t('ai.notice.fileQuoted', { path: selection.path })
            : t('ai.notice.quotedRange', { path: selection.path, from: anchor.from, to: anchor.to }))
        })
      }

      /** Open the reply/publish dialog. */
      function openReply() {
        update({ replyOpen: true })
      }

      /** Close the reply/publish dialog. */
      function closeReply() {
        update({ replyOpen: false })
      }

      /**
       * Publish one review: summary message, label votes, and every staged
       * inline comment, through the Host write route.
       * @param {{ message: string, labels: Record<string, number|string> }} input - the review content.
       * @returns {Promise<{ ok: boolean, error?: string }>} the outcome.
       */
      async function publishReview(input) {
        const current = state()
        const detail = current.detail.value
        if (detail === null) return { ok: false, error: t('reply.noChange') }
        const payload = buildReviewPayload(current.drafts, input.message, input.labels)
        if (payload.message === '' && Object.keys(payload.comments).length === 0 && Object.keys(payload.labels).length === 0) {
          return { ok: false, error: t('reply.empty') }
        }
        try {
          await apiPost('/review', {
            change: detail.number,
            revision: detail.revision,
            ...payload,
          })
          saveDrafts(current.meta.value, detail, {})
          update({ drafts: {}, composer: null, replyOpen: false })
          notify(t('reply.posted'))
          void selectChange(detail.number, { rev: current.detail.rev, base: current.detail.base, force: true })
          return { ok: true }
        } catch (error) {
          return { ok: false, error: error.message ?? String(error) }
        }
      }

      // ------------------------- AI session wiring -------------------------

      /** Release the reference a previous session switch replaced. */
      function releasePrevious() {
        if (previousReference === undefined) return
        const stale = previousReference
        previousReference = undefined
        setTimeout(() => { try { stale.release() } catch (_ignored) { /* already released */ } }, 2500)
      }

      /** Release the session the panel currently shows. */
      function releaseCurrent() {
        if (reference === undefined) return
        previousReference = reference
        reference = undefined
        sessionKey = undefined
        releasePrevious()
      }

      /** Bind one retained session reference into the store. */
      function bindSession(sessionId, nextReference, key) {
        if (reference !== undefined && reference !== nextReference) previousReference = reference
        reference = nextReference
        sessionKey = key
        update({ ai: { ...state().ai, phase: 'ready', sessionId, changeNumber: state().selected, error: null, open: true, reference: nextReference } })
        releasePrevious()
      }

      /** The current Conversation's directory, when one is selected. */
      function currentSessionCwd() {
        const sessions = ctx.get('sessions')
        const uiSession = ctx.get('uiSession')
        const current = uiSession !== undefined && uiSession.adapter !== undefined
          ? uiSession.adapter.current.getSnapshot().key
          : undefined
        const listed = sessions !== undefined ? sessions.list.getSnapshot().byId : undefined
        const cwd = typeof current === 'string' && listed !== undefined ? listed[current]?.cwd : undefined
        return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
      }

      /** Configured default review directory from the Host row, when any. */
      function configuredCwd() {
        const meta = state().meta.value
        return meta !== null && typeof meta.reviewCwd === 'string' && meta.reviewCwd !== '' ? meta.reviewCwd : undefined
      }

      /**
       * Resolve where a new review session should be created.
       * @returns {{ workspaceId?: string, cwd?: string, label: string, path: string }} creation options and a label.
       */
      function resolveTarget() {
        const target = state().ai.target
        const items = workspaceSource.getSnapshot()
        if (target.kind === 'workspace') {
          const found = items.find(item => item.workspaceId === target.id)
          if (found !== undefined) return { workspaceId: found.workspaceId, label: found.title, path: found.path }
        }
        if (target.kind === 'cwd' && typeof target.path === 'string' && target.path !== '') {
          return { cwd: target.path, label: baseName(target.path) || target.path, path: target.path }
        }
        const sessionCwd = currentSessionCwd()
        if (sessionCwd !== undefined) return { cwd: sessionCwd, label: baseName(sessionCwd) || sessionCwd, path: sessionCwd }
        const reviewCwd = configuredCwd()
        if (reviewCwd !== undefined) return { cwd: reviewCwd, label: baseName(reviewCwd) || reviewCwd, path: reviewCwd }
        const first = items[0]
        if (first !== undefined) return { workspaceId: first.workspaceId, label: first.title, path: first.path }
        const meta = state().meta.value
        if (meta !== null && typeof meta.defaultCwd === 'string' && meta.defaultCwd !== '') {
          return { cwd: meta.defaultCwd, label: baseName(meta.defaultCwd), path: meta.defaultCwd }
        }
        return { label: '', path: '' }
      }

      /**
       * Apply a new target; a still-blank review session is recreated so the
       * choice takes effect immediately.
       * @param {object} target - the chosen target.
       */
      function setTarget(target) {
        saveTarget(target)
        update({ ai: { ...state().ai, target } })
        const resolved = resolveTarget()
        const current = state()
        // A session that already exists keeps its directory: say where the
        // next one goes instead of silently replacing a live conversation.
        notify(t(current.ai.reference === undefined
          ? 'ai.workspace.changed'
          : 'ai.workspace.changedExisting', { name: resolved.label }))
      }

      /** Retain one existing session id. */
      function retainSession(sessionId) {
        const sessions = ctx.get('sessions')
        if (sessions === undefined) throw new Error('The Session service is not available.')
        const nextReference = sessions.retain(sessionId, { source: 'gerritReview' })
        void nextReference.ready.catch((error) => {
          console.warn('gerrit-workbench: review session failed to open', error)
        })
        return nextReference
      }

      /** Create a fresh review session on the Host, in the resolved target. */
      async function createReviewSession() {
        const sessions = ctx.get('sessions')
        if (sessions === undefined) throw new Error('The Session service is not available.')
        const target = resolveTarget()
        if (typeof target.workspaceId === 'string') return await sessions.create({ workspaceId: target.workspaceId })
        if (typeof target.cwd === 'string') return await sessions.create({ cwd: target.cwd })
        return await sessions.create({})
      }

      /** Restore the remembered session of one change's patch set while the Host still lists it. */
      function rememberedSession(detail) {
        const meta = state().meta.value
        const url = meta !== null && typeof meta.gerritUrl === 'string' ? meta.gerritUrl : ''
        const found = recallSession(url, detail.number, detail.patchSet)
        if (found === undefined) return undefined
        const sessions = ctx.get('sessions')
        const known = sessions !== undefined ? sessions.list.getSnapshot().byId[found.id] : undefined
        if (known === undefined) return undefined
        if (found.legacy === true) adoptLegacySession(url, detail.number, detail.patchSet, found.id)
        return found.id
      }

      /**
       * Ensure the AI panel shows the review session of one change's patch set.
       * @param {object} detail - the change detail whose patch set is on screen.
       * @param {boolean} create - create a session when none is remembered.
       * @returns {Promise<string | undefined>} the session id.
       */
      async function ensureSession(detail, create) {
        const key = sessionKeyOf(detail.number, detail.patchSet)
        const current = state()
        if (current.ai.phase === 'ready' && current.ai.sessionId !== null && sessionKey === key && reference !== undefined) {
          if (current.ai.open !== true) update({ ai: { ...state().ai, open: true } })
          return current.ai.sessionId
        }
        if (current.ai.busy === true) return undefined
        update({ ai: { ...current.ai, busy: true, open: true, phase: 'loading', error: null, changeNumber: detail.number } })
        try {
          const remembered = rememberedSession(detail)
          if (remembered !== undefined) {
            bindSession(remembered, retainSession(remembered), key)
            notify(t('ai.restored'))
            return remembered
          }
          if (create !== true) {
            releaseCurrent()
            update({ ai: { ...state().ai, busy: false, phase: 'idle', sessionId: null, reference: undefined } })
            return undefined
          }
          update({ ai: { ...state().ai, phase: 'creating' } })
          const created = await createReviewSession()
          const meta = state().meta.value
          if (meta !== null && typeof meta.gerritUrl === 'string') rememberSession(meta.gerritUrl, detail.number, detail.patchSet, created)
          bindSession(created, retainSession(created), key)
          notify(t('ai.created'))
          return created
        } catch (error) {
          update({ ai: { ...state().ai, phase: 'error', error: error.message, busy: false } })
          notify(t('ai.sessionError', { message: error.message }))
          return undefined
        } finally {
          if (state().ai.phase !== 'error') update({ ai: { ...state().ai, busy: false } })
        }
      }

      /** Open or collapse the AI panel; opening resolves this change's session. */
      function setAiOpen(open) {
        if (open === false) {
          update({ ai: { ...state().ai, open: false } })
          return
        }
        const detail = state().detail.value
        if (detail === null) {
          update({ ai: { ...state().ai, open: true } })
          return
        }
        // Re-read the matching mode first: the configuration page may have changed it.
        void (async () => {
          await loadMeta()
          const current = state().detail.value
          if (current !== null) await ensureSession(current, false)
        })()
      }

      /**
       * Follow the patch set on screen: show the session that belongs to it,
       * and clear the panel when that patch set has no session yet.
       */
      function syncSessionForPatch() {
        const current = state()
        const detail = current.detail.value
        if (detail === null || current.ai.open !== true) return
        const key = sessionKeyOf(detail.number, detail.patchSet)
        if (current.ai.phase === 'ready' && sessionKey === key && reference !== undefined) return
        if (current.ai.busy === true) return
        const remembered = rememberedSession(detail)
        if (remembered !== undefined) {
          if (sessionKey === key) return
          bindSession(remembered, retainSession(remembered), key)
          notify(t('ai.patchSession', { number: detail.patchSet }))
          return
        }
        if (sessionKey === key) return
        releaseCurrent()
        update({ ai: { ...state().ai, phase: 'idle', sessionId: null, reference: undefined, error: null } })
      }

      /** Send one user message into a session. */
      async function sendToSession(sessionId, text) {
        const sessions = ctx.get('sessions')
        const scope = sessions !== undefined ? sessions.scope(sessionId) : undefined
        if (scope === undefined) throw new Error('The review session is not retained.')
        const conversation = scope.get('conversation')
        if (conversation === undefined) throw new Error('The Conversation service is not available.')
        await conversation.send(text)
      }

      /**
       * Compose the review prompt for a change from the diffs already read.
       * @param {object} detail - the selected change.
       * @param {Array<{ path: string, diff?: object }>} files - diffs to quote.
       * @returns {string} the prompt text.
       */
      function buildReviewPrompt(detail, files) {
        const parts = []
        parts.push(t('ai.prompt.intro'))
        parts.push('')
        parts.push(`- Gerrit: ${detail.url}`)
        parts.push(`- ${t('ai.prompt.project')}: ${detail.project}`)
        parts.push(`- ${t('ai.prompt.branch')}: ${detail.branch}`)
        parts.push(`- ${t('ai.prompt.change')}: ${detail.number} (PS ${detail.patchSet})`)
        parts.push(`- ${t('ai.prompt.subject')}: ${detail.subject}`)
        if (detail.owner !== null) parts.push(`- ${t('ai.prompt.owner')}: ${detail.owner.name || detail.owner.username}`)
        if (detail.topic !== '') parts.push(`- ${t('ai.prompt.topic')}: ${detail.topic}`)
        parts.push('')
        const commit = detail.messages.length > 0 ? detail.messages[detail.messages.length - 1].text.trim() : ''
        if (commit !== '') {
          parts.push(`## ${t('detail.commits')}`)
          parts.push('')
          parts.push('```text')
          parts.push(commit)
          parts.push('```')
          parts.push('')
        }
        parts.push(`## ${t('detail.files')} (${detail.files.length})`)
        parts.push('')
        for (const file of detail.files) parts.push(`- ${file.path} (${file.status} +${file.insertions} -${file.deletions})`)
        parts.push('')
        let budget = PROMPT_DIFF_LIMIT
        let quoted = 0
        for (const file of files) {
          if (file.diff === undefined || budget <= 0) continue
          const rows = file.diff.rows.filter(row => row.t !== 'gap')
          if (rows.length === 0) continue
          const lines = []
          let size = 0
          for (const row of rows) {
            const line = promptLine(row)
            if (size + line.length > Math.min(budget, 24_000)) break
            lines.push(line)
            size += line.length + 1
          }
          if (lines.length === 0) continue
          budget -= size
          quoted += 1
          parts.push(`## Diff: ${file.path}`)
          parts.push('')
          parts.push('```diff')
          parts.push(...lines)
          parts.push('```')
          parts.push('')
        }
        if (quoted < files.length) parts.push(t('ai.prompt.truncated'))
        parts.push(t('ai.prompt.instructions'))
        return parts.join('\n')
      }

      /** Start (or repeat) an AI review of the selected change. */
      async function startReview(options = {}) {
        const current = state()
        const detail = current.detail.value
        if (detail === null) {
          notify(t('ai.noChange'))
          return
        }
        const sessionId = await ensureSession(detail, true)
        if (sessionId === undefined) return
        update({ ai: { ...state().ai, busy: true } })
        try {
          const reviewable = detail.files.filter(file => !file.binary
            && (file.path !== '/COMMIT_MSG' || detail.files.length === 1))
          const listed = options.path === undefined
            ? reviewable
            : reviewable.filter(file => file.path === options.path)
          const targets = (listed.length === 0 ? reviewable : listed).slice(0, 16)
          const files = []
          for (const file of targets) {
            files.push({ path: file.path, diff: await fetchDiff(detail, file.path) })
          }
          await sendToSession(sessionId, buildReviewPrompt(detail, files))
          notify(t('ai.reviewSent'))
        } catch (error) {
          notify(t('ai.reviewFailed', { message: error.message ?? String(error) }))
        } finally {
          update({ ai: { ...state().ai, busy: false } })
        }
      }

      /** Compose one quote block for a run of rows. */
      function quoteBlock(detail, path, rows, language) {
        const numbers = rows.map(row => row.n ?? row.o).filter(value => typeof value === 'number')
        const first = numbers.length > 0 ? numbers[0] : 0
        const last = numbers.length > 0 ? numbers[numbers.length - 1] : first
        const range = first === last ? String(first) : `${first}-${last}`
        const body = rows.map(promptLine).join('\n')
        const fence = language === 'plain' ? '' : language
        return `> **Gerrit ${detail.number} · ${path}:${range} (PS ${detail.patchSet})**\n> \n> \`\`\`${fence}\n`
          + body.split('\n').map(line => `> ${line}`).join('\n')
          + '\n> ```'
      }

      /** Put a quote into the AI session's input document. */
      async function quote(text) {
        const detail = state().detail.value
        if (detail === null) return false
        const sessionId = await ensureSession(detail, true)
        if (sessionId === undefined) {
          notify(t('ai.needSession'))
          return false
        }
        const sessions = ctx.get('sessions')
        const scope = sessions !== undefined ? sessions.scope(sessionId) : undefined
        const conversation = scope !== undefined ? scope.get('conversation') : undefined
        if (scope === undefined || conversation === undefined) {
          notify(t('ai.needSession'))
          return false
        }
        try {
          const input = conversation.input.for(scope)
          let applied = false
          let lastError
          // The composer may still be mounting right after the panel opens, so
          // try the quote node first and fall back to a plain draft append.
          for (let attempt = 0; attempt < 2 && !applied; attempt += 1) {
            try {
              applied = input.insertQuote(text)
            } catch (error) {
              lastError = error
            }
            if (!applied) {
              try {
                const draft = input.state.getSnapshot().draft
                input.setDraft(draft === '' ? text : `${draft}\n\n${text}`)
                applied = true
              } catch (error) {
                lastError = error
              }
            }
            if (!applied) await new Promise(resolve => setTimeout(resolve, 220))
          }
          if (!applied) throw lastError ?? new Error('The input is not ready yet.')
          update({ ai: { ...state().ai, open: true } })
          return true
        } catch (error) {
          notify(t('ai.quoteFailed', { message: error.message ?? String(error) }))
          return false
        }
      }

      /** Quote one row into the AI session. */
      function quoteRow(row, path) {
        const detail = state().detail.value
        if (detail === null) return
        void quote(quoteBlock(detail, path, [row], languageOf(path))).then((ok) => {
          if (ok) notify(t('ai.notice.quoted', { path, line: row.n ?? row.o }))
        })
      }

      /** Quote every changed row of one file. */
      function quoteFile(path) {
        const detail = state().detail.value
        if (detail === null) return
        const entry = state().diffs[`${path}@${detail.revision}`]
        const rows = entry !== undefined && entry.value !== null
          ? entry.value.rows.filter(row => row.t === 'add' || row.t === 'del')
          : []
        if (rows.length === 0) return
        void quote(quoteBlock(detail, path, rows, languageOf(path))).then((ok) => {
          if (ok) notify(t('ai.notice.fileQuoted', { path }))
        })
      }

      /** Recreate the review session for the selected change. */
      async function resetSession() {
        const detail = state().detail.value
        if (detail === null) return
        if (reference !== undefined) {
          previousReference = reference
          reference = undefined
          releasePrevious()
        }
        sessionKey = undefined
        // A recreated session must not resolve back to the remembered one.
        const meta = state().meta.value
        if (meta !== null && typeof meta.gerritUrl === 'string') forgetSession(meta.gerritUrl, detail.number, detail.patchSet)
        update({ ai: { ...initialState().ai, open: true, changeNumber: detail.number } })
        await ensureSession(detail, true)
      }

      /** Release everything this face owns. */
      function dispose() {
        if (noticeTimer !== undefined) clearTimeout(noticeTimer)
        for (const held of [reference, previousReference]) {
          if (held === undefined) continue
          try { held.release() } catch (_ignored) { /* already released */ }
        }
        reference = undefined
        previousReference = undefined
      }

      // The client configuration-form service arrives after activation when the
      // settings panel is in another bundle; a store lets the page re-render
      // when it shows up instead of freezing on "unavailable".
      const formsSource = createStore({ value: undefined })

      return {
        store,
        t,
        hooks: { locale: localeSource, workspaces: workspaceSource },
        forms: formsSource,
        resolveTarget,
        setTarget,
        loadMeta,
        loadList,
        selectChange,
        setScope,
        setStatus,
        setQuery,
        refresh,
        setPref,
        toggleOpenFile,
        expandGap,
        revealAllGaps,
        collapseGaps,
        loadFullFile,
        toggleReviewed,
        setBase,
        openFile,
        startSelection,
        extendSelection,
        clearSelection,
        setTextSelection,
        clearTextSelection,
        commentTextSelection,
        quoteTextSelection,
        openSelectionComment,
        quoteSelection,
        cancelComment,
        saveComment,
        removeDraft,
        openReply,
        closeReply,
        publishReview,
        setAiOpen,
        applySessionMatch,
        syncSessionForPatch,
        ensureSession,
        startReview,
        quoteRow,
        quoteFile,
        resetSession,
        dispose,
      }
    }

    // ---------------------------------------------------------------------
    // Components
    // ---------------------------------------------------------------------

    /**
     * Contain one crashed subtree so the desk stays usable and the failure is
     * visible instead of blank: the boundary renders the message and a retry.
     */
    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error) {
        console.error('gerrit-workbench: section failed', error)
        const detail = error instanceof Error
          ? `${error.name}: ${error.message} @ ${(error.stack ?? '').split('\n').slice(1, 4).join(' ').trim()}`
          : String(error)
        beacon('render-error', detail)
      }

      render() {
        if (this.state.error !== null) {
          const message = this.state.error instanceof Error ? this.state.error.message : String(this.state.error)
          return h('div', { className: 'gwb-boundary' },
            h('div', { className: 'gwb-error' }, message),
            h('button', {
              type: 'button',
              className: 'gwb-iconbtn',
              onClick: () => this.setState({ error: null }),
            }, this.props.retryLabel))
        }
        return this.props.children
      }
    }

    /** Line counts as `+n −m`. */
    function Counts({ insertions, deletions }) {
      return h('span', { className: 'gwb-counts' },
        h('span', { className: 'gwb-add' }, `+${insertions}`),
        h('span', { className: 'gwb-del' }, `−${deletions}`))
    }

    /** Vote chips for one change. */
    const VoteChips = memo(function VoteChips({ labels }) {
      const entries = Object.entries(labels ?? {}).filter(([, value]) => value.value !== 0 || value.approved || value.rejected)
      if (entries.length === 0) return null
      return h(Fragment, null, ...entries.map(([name, value]) => {
        const tone = value.approved || value.value > 0 ? 'ok' : value.rejected || value.value < 0 ? 'bad' : undefined
        const short = name === 'Code-Review' ? 'CR' : name === 'Verified' ? 'V' : name.slice(0, 3)
        return h('span', { key: name, className: 'gwb-chip', 'data-tone': tone, title: `${name}: ${value.value}` },
          `${short} ${value.value > 0 ? '+' : ''}${value.value}`)
      }))
    })

    /** The toolbar: scope, status, search, connection, refresh, AI panel. */
    function Toolbar({ state, face }) {
      const { t } = face
      const [draft, setDraft] = useState(state.query)
      useEffect(() => { setDraft(state.query) }, [state.query])
      const meta = state.meta.value
      const connection = state.meta.phase === 'loading' || state.meta.phase === 'idle'
        ? { state: 'busy', text: t('meta.checking') }
        : meta !== null && meta.configured === false
          ? { state: 'busy', text: t('meta.unconfigured') }
          : meta === null || meta.self === null
          ? { state: 'error', text: t('meta.setup', { file: meta === null ? '~/.gerrit-http-credentials' : meta.credentialsFile }) }
          : { state: 'ok', text: t('meta.connected', { user: meta.self.name || meta.self.username }) }
      return h('div', { className: 'gwb-toolbar' },
        h('div', { className: 'gwb-brand' },
          h('strong', null, t('panel.title')),
          state.list.query === '' ? null : h('span', { className: 'gwb-mono gwb-ellipsis', title: state.list.query }, state.list.query)),
        h('div', { className: 'gwb-tabs', role: 'tablist', 'aria-label': t('aria.scopeTabs') },
          h('button', {
            type: 'button', className: 'gwb-tab', role: 'tab',
            'data-active': state.scope === 'outgoing' || undefined,
            'aria-selected': state.scope === 'outgoing',
            title: t('scope.outgoing.hint'),
            onClick: () => face.setScope('outgoing'),
          }, t('scope.outgoing')),
          h('button', {
            type: 'button', className: 'gwb-tab', role: 'tab',
            'data-active': state.scope === 'incoming' || undefined,
            'aria-selected': state.scope === 'incoming',
            title: t('scope.incoming.hint'),
            onClick: () => face.setScope('incoming'),
          }, t('scope.incoming'))),
        h('select', {
          className: 'gwb-select',
          'aria-label': t('aria.statusFilter'),
          value: state.status,
          onChange: event => face.setStatus(event.target.value),
        },
        h('option', { value: 'open' }, t('status.open')),
        h('option', { value: 'merged' }, t('status.merged')),
        h('option', { value: 'abandoned' }, t('status.abandoned')),
        h('option', { value: 'all' }, t('status.all'))),
        h('button', {
          type: 'button',
          className: 'gwb-iconbtn',
          'data-active': state.prefs.listOpen ? '' : undefined,
          title: state.prefs.listOpen ? t('action.hideList') : t('action.showList'),
          'aria-pressed': state.prefs.listOpen,
          onClick: () => face.setPref('listOpen', !state.prefs.listOpen),
        }, h(IconList, { size: 13 }), h('span', null, t('action.listLabel'))),
        h('div', { className: 'gwb-spacer' }),
        h('div', { className: 'gwb-field' },
          h(IconSearch, { size: 13 }),
          h('input', {
            type: 'text',
            value: draft,
            placeholder: t('search.placeholder'),
            onChange: event => setDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') face.setQuery(draft.trim())
              if (event.key === 'Escape') { setDraft(''); face.setQuery('') }
            },
            onBlur: () => { if (draft.trim() !== state.query) face.setQuery(draft.trim()) },
          })),
        h('div', { className: 'gwb-conn', title: connection.text },
          h('span', { className: 'gwb-dot', 'data-state': connection.state }),
          h('span', { className: 'gwb-ellipsis' }, connection.text)),
        h('button', {
          type: 'button',
          className: 'gwb-iconbtn',
          'data-active': state.ai.open ? '' : undefined,
          title: state.ai.open ? t('ai.closePanel') : t('ai.openPanel'),
          'aria-pressed': state.ai.open,
          onClick: () => face.setAiOpen(!state.ai.open),
        }, h(IconPanel, { size: 13 }), h('span', null, t('ai.title'))),
        h('button', { type: 'button', className: 'gwb-iconbtn', title: t('action.refreshAll'), onClick: () => face.refresh() },
          h(IconRefresh, { size: 14 }),
          h('span', null, t('action.refresh'))))
    }

    /** One row of the change list. */
    const ChangeRow = memo(function ChangeRow({ change, selected, onSelect, t, locale }) {
      return h('button', {
        type: 'button',
        className: 'gwb-row',
        'data-selected': selected ? '' : undefined,
        onClick: () => onSelect(change.number),
      },
      h('span', { className: 'gwb-row-subject' }, change.subject),
      h('span', { className: 'gwb-row-meta' },
        h('span', { className: 'gwb-mono gwb-ellipsis', title: `${change.project} · ${change.branch}` }, change.project),
        h('span', null, '·'),
        h('span', { className: 'gwb-mono gwb-ellipsis' }, change.branch)),
      h('span', { className: 'gwb-row-foot' },
        h('span', { className: 'gwb-mono' }, `#${change.number}`),
        change.patchSet > 0 ? h('span', { className: 'gwb-chip' }, `PS ${change.patchSet}`) : null,
        h(Counts, { insertions: change.insertions, deletions: change.deletions }),
        h(VoteChips, { labels: change.labels }),
        h('span', { className: 'gwb-spacer' }),
        h('span', { title: absoluteWhen(change.updated, locale) }, relativeWhen(change.updated, locale))))
    })

    /** The change list column. */
    const ChangeList = memo(function ChangeList({ state, face }) {
      const { t } = face
      const snapshot = useSnapshot(face.hooks.locale)
      const locale = snapshot.active ?? 'en'
      const list = state.list
      return h('div', { className: 'gwb-list', 'aria-label': t('aria.changeList') },
        h('div', { className: 'gwb-list-head' },
          h(IconList, { size: 12 }),
          h('span', null, t('list.title')),
          h('span', { className: 'gwb-chip' }, list.items.length),
          h('span', { className: 'gwb-spacer' })),
        h('div', { className: 'gwb-list-scroll' },
          list.phase === 'loading' ? h('div', { className: 'gwb-empty' }, t('list.loading')) : null,
          list.phase === 'error' ? h('div', { className: 'gwb-error' }, h('div', null, t('list.error')), h('div', null, state.meta.value !== null && state.meta.value.configured === false ? t('meta.unconfigured') : list.error)) : null,
          list.phase !== 'loading' && list.phase !== 'error' && list.items.length === 0
            ? h('div', { className: 'gwb-empty' }, t('list.empty'))
            : null,
          list.items.map(change => h(ChangeRow, {
            key: change.number,
            change,
            selected: state.selected === change.number,
            onSelect: face.selectChange,
            t,
            locale,
          })),
          list.more
            ? h('button', {
              type: 'button',
              className: 'gwb-iconbtn',
              style: { width: '100%', marginTop: '6px', justifyContent: 'center' },
              disabled: list.phase === 'append',
              onClick: () => face.loadList({ append: true }),
            }, t('action.loadMore'))
            : null))
    })

    /** One unified diff row. */
    function UnifiedLine({ row, spans, onQuote, t }) {
      const kind = row.t === 'add' ? 'add' : row.t === 'del' ? 'del' : 'ctx'
      return h('tr', { className: 'gwb-line', 'data-kind': kind },
        h('td', { className: 'gwb-num' }, row.o ?? ''),
        h('td', { className: 'gwb-num' }, row.n ?? ''),
        h('td', { className: 'gwb-sign' }, kind === 'add' ? '+' : kind === 'del' ? '-' : ''),
        h('td', { className: 'gwb-code' },
          h(CodeText, { spans }),
          kind === 'ctx' ? null : h('span', { className: 'gwb-line-action gwb-hoveronly' },
            h('button', {
              type: 'button', className: 'gwb-mini', title: t('ai.quoteLine'),
              onClick: (event) => { event.stopPropagation(); onQuote(row) },
            }, h(IconQuote, { size: 11 })))))
    }

    /** One folded-run row: Gerrit's "expand context" affordance. */
    function GapRow({ block, columns, t, onExpand, onLoadFull }) {
      const capped = block.expandable !== true
      const step = Math.min(GAP_STEP, block.count)
      const label = capped
        ? t('diff.gap.cappedLoad', { count: block.count })
        : block.count > step
          ? t('diff.gap.expandMore', { step, rest: block.count })
          : t('diff.gap.expand', { count: block.count })
      return h('tr', null,
        h('td', { className: 'gwb-gap-cell', colSpan: columns },
          h('button', {
            type: 'button',
            className: 'gwb-gap',
            title: capped ? t('diff.gap.cappedTitle') : t('diff.gap.expandTitle', { step }),
            onClick: (event) => {
              if (capped) onLoadFull()
              else onExpand(block.key, block.count, event.shiftKey === true)
            },
          },
          h('span', { className: 'gwb-gap-inner' },
            h(IconChevrons, { size: 12 }),
            h('span', null, label),
            capped ? h('span', { className: 'gwb-gap-hint' }, t('diff.gap.loadHint')) : null))))
    }

    /** Inline comment editor anchored under a selected run of diff rows. */
    function CommentComposer({ anchor, t, onSave, onCancel, onQuote }) {
      const [text, setText] = useState('')
      const save = () => { if (text.trim() !== '') onSave(text) }
      const range = anchor.from === anchor.to ? `${anchor.to}` : `${anchor.from}-${anchor.to}`
      return h('div', { className: 'gwb-composer' },
        h('div', { className: 'gwb-composer-head' },
          h(IconComment, { size: 12 }),
          h('span', null, anchor.side === 'PARENT'
            ? t('comment.anchorRangeParent', { range })
            : t('comment.anchorRange', { range })),
          h('span', { className: 'gwb-muted' }, t('comment.rangeHint'))),
        h('textarea', {
          className: 'gwb-composer-input',
          rows: 3,
          autoFocus: true,
          value: text,
          placeholder: t('comment.placeholder'),
          onChange: event => setText(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              save()
            }
            if (event.key === 'Escape') { event.preventDefault(); onCancel() }
          },
        }),
        h('div', { className: 'gwb-composer-actions' },
          h('button', {
            type: 'button', className: 'gwb-mini', title: t('selection.quote'),
            onClick: () => onQuote(),
          }, h(IconSparkle, { size: 11 }), h('span', null, t('selection.quote'))),
          h('span', { className: 'gwb-muted' }, t('comment.hint')),
          h('span', { className: 'gwb-spacer' }),
          h('button', { type: 'button', className: 'gwb-iconbtn', onClick: onCancel }, t('comment.cancel')),
          h('button', {
            type: 'button', className: 'gwb-iconbtn', 'data-tone': 'primary',
            disabled: text.trim() === '',
            onClick: save,
          }, t('comment.save'))))
    }

    /** One comment shown under its line (published or locally staged). */
    const CommentNote = memo(function CommentNote({ comment, locale, t, onRemove }) {
      const draft = comment.draft === true
      const ranged = typeof comment.startLine === 'number' && comment.startLine < comment.line
      return h('div', { className: 'gwb-note', 'data-unresolved': comment.unresolved ? '' : undefined, 'data-draft': draft ? '' : undefined },
        h('div', { className: 'gwb-note-head' },
          h('strong', null, draft ? t('comment.draftAuthor') : (comment.author !== null ? (comment.author.name || comment.author.username) : '')),
          draft ? h('span', { className: 'gwb-chip', 'data-tone': 'warn' }, t('comment.draft')) : null,
          h('span', { className: 'gwb-chip gwb-mono' }, ranged ? `${comment.startLine}-${comment.line}` : `${comment.line}`),
          h('span', { title: absoluteWhen(comment.updated, locale) }, relativeWhen(comment.updated, locale)),
          comment.unresolved ? h('span', { className: 'gwb-chip', 'data-tone': 'warn' }, t('comment.unresolved')) : null,
          h('span', { className: 'gwb-spacer' }),
          draft && onRemove !== undefined
            ? h('button', { type: 'button', className: 'gwb-mini', onClick: onRemove }, t('comment.remove'))
            : null),
        comment.message)
    })

    /** The comments staged or published for one anchor, in order. */
    function notesFor(map, anchor) {
      const key = `${anchor.side === 'PARENT' ? 'o' : 'n'}${anchor.line}`
      return map.get(key) ?? []
    }

    /** One unified diff row. */
    function UnifiedLine({ row, spans, selected, rowIndex, onQuote, onComment, onCommentHover, t }) {
      const kind = row.t === 'add' ? 'add' : row.t === 'del' ? 'del' : 'ctx'
      const cellProps = {
        className: 'gwb-num gwb-num-click',
        title: t('comment.add'),
        onMouseDown: event => onComment(event),
        onMouseEnter: () => onCommentHover(),
      }
      return h('tr', {
        className: 'gwb-line',
        'data-kind': kind,
        'data-row-index': rowIndex,
        'data-selected': selected ? '' : undefined,
      },
      h('td', { ...cellProps }, row.o ?? ''),
        h('td', { ...cellProps }, row.n ?? ''),
        h('td', { className: 'gwb-sign' }, kind === 'add' ? '+' : kind === 'del' ? '-' : ''),
        h('td', { className: 'gwb-code' },
          h(CodeText, { spans }),
          kind === 'ctx' ? null : h('span', { className: 'gwb-line-action gwb-hoveronly' },
            h('button', {
              type: 'button', className: 'gwb-mini', title: t('ai.quoteLine'),
              onClick: (event) => { event.stopPropagation(); onQuote(row) },
            }, h(IconQuote, { size: 11 })))))
    }

    /** The table of one file's diff. */
    const DiffBody = memo(function DiffBody({
      blocks, spansByRow, commentsByLine, prefs, locale, t, path, rowIndex, allRows,
      selection, composer, onQuote, onQuoteSelection, onSaveComment, onCancelComment, onRemoveDraft,
      onSelectStart, onSelectExtend, onExpandGap, onLoadFull, onTextSelect, onClearTextSelection,
    }) {
      const containerRef = useRef(null)
      const trySelectRef = useRef(null)
      const split = prefs.split === true
      const wrap = prefs.wrap === true
      const columns = split ? 6 : 4
      const dragging = useRef(false)
      const anchorIndex = useRef(-1)
      useEffect(() => {
        const stop = () => { dragging.current = false }
        window.addEventListener('mouseup', stop)
        return () => window.removeEventListener('mouseup', stop)
      }, [])
      const press = (index, event) => {
        if (event.button !== 0) return
        event.preventDefault()
        if (event.shiftKey && anchorIndex.current >= 0) {
          onSelectExtend(anchorIndex.current, index)
          anchorIndex.current = index
          return
        }
        anchorIndex.current = index
        dragging.current = true
        onSelectStart(index)
      }
      const hover = (index) => {
        if (!dragging.current || anchorIndex.current < 0) return
        onSelectExtend(anchorIndex.current, index)
      }
      useEffect(() => {
        const onUp = () => { if (trySelectRef.current !== null) trySelectRef.current() }
        window.addEventListener('mouseup', onUp)
        return () => window.removeEventListener('mouseup', onUp)
      }, [])
      useEffect(() => {
        if (composer === null || composer === undefined) return undefined
        const frame = requestAnimationFrame(() => {
          const container = containerRef.current
          if (container === null || container === undefined) return
          const node = container.querySelector('[data-gwb-composer]')
          if (node !== null && node !== undefined && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }
        })
        return () => cancelAnimationFrame(frame)
      }, [composer])
      trySelectRef.current = () => {
        const container = containerRef.current
        if (container === null || container === undefined) return
        const found = readTextSelection(container)
        if (found !== null) onTextSelect(found)
      }
      const inSelection = (index) => selection !== null && selection !== undefined
        && selection.path === path
        && index >= selection.from && index <= selection.to
      const nodes = []
      const notes = (anchor) => notesFor(commentsByLine, anchor)
      const composerAnchor = composer !== null && composer !== undefined
        ? rangeAnchor(allRows, composer.from, composer.to)
        : null
      const composerNode = (key) => (composerAnchor === null
        ? null
        : h('tr', { key: `${key}-composer`, 'data-gwb-composer': '' },
          h('td', { colSpan: columns },
            h(CommentComposer, {
              anchor: composerAnchor,
              t,
              onSave: text => onSaveComment(text),
              onCancel: () => onCancelComment(),
              onQuote: () => onQuoteSelection(),
            }))))
      const composerAt = (index) => composer !== null && composer !== undefined
        && composer.path === path
        && composer.to === index
      const noteRows = (anchor, key) => {
        const rows = []
        for (const comment of notes(anchor)) {
          rows.push(h('tr', { key: `${key}-${comment.id}` },
            h('td', { colSpan: columns },
              h(CommentNote, {
                comment,
                locale,
                t,
                onRemove: comment.draft === true ? () => onRemoveDraft(path, comment.id) : undefined,
              }))))
        }
        return rows
      }
      blocks.forEach((block, blockIndex) => {
        if (block.kind === 'gap') {
          nodes.push(h(GapRow, {
            key: `gap-${blockIndex}`,
            block: { ...block, index: blockIndex },
            columns,
            t,
            onExpand: onExpandGap,
            onLoadFull,
          }))
          return
        }
        if (split) {
          const paired = splitRows(block.rows)
          paired.forEach((pair, index) => {
            const left = pair.left
            const right = pair.right
            const leftIndex = left === null ? -1 : (rowIndex.get(left) ?? -1)
            const rightIndex = right === null ? -1 : (rowIndex.get(right) ?? -1)
            const leftKind = left !== null && left.t !== 'ctx' ? left.t : undefined
            const rightKind = right !== null && right.t !== 'ctx' ? right.t : undefined
            const rowIdx = leftIndex >= 0 ? leftIndex : rightIndex
            nodes.push(h('tr', {
              key: `s-${blockIndex}-${index}`,
              className: 'gwb-line',
              'data-row-index': rowIdx >= 0 ? rowIdx : undefined,
              'data-selected': inSelection(leftIndex) || inSelection(rightIndex) ? '' : undefined,
            },
            h('td', {
              className: `gwb-num gwb-num-click${leftKind === undefined ? '' : ` gwb-cell-${leftKind}`}`,
              title: left === null ? undefined : t('comment.add'),
              onMouseDown: left === null ? undefined : event => press(leftIndex, event),
              onMouseEnter: left === null ? undefined : () => hover(leftIndex),
            }, left === null ? '' : (left.o ?? '')),
            h('td', { className: `gwb-sign${leftKind === undefined ? '' : ` gwb-sign-${leftKind}`}` }, left !== null && left.t === 'del' ? '-' : ''),
            h('td', { className: `gwb-code${leftKind === undefined ? '' : ` gwb-cell-${leftKind}`}` },
              left === null ? null : h(CodeText, { spans: spansByRow.get(left) }),
              left === null || left.t === 'ctx' ? null : h('span', { className: 'gwb-line-action gwb-hoveronly' },
                h('button', {
                  type: 'button', className: 'gwb-mini', title: t('ai.quoteLine'),
                  onClick: (event) => { event.stopPropagation(); onQuote(left) },
                }, h(IconQuote, { size: 11 })))),
            h('td', {
              className: `gwb-num gwb-num-click${rightKind === undefined ? '' : ` gwb-cell-${rightKind}`}`,
              title: right === null ? undefined : t('comment.add'),
              onMouseDown: right === null ? undefined : event => press(rightIndex, event),
              onMouseEnter: right === null ? undefined : () => hover(rightIndex),
            }, right === null ? '' : (right.n ?? '')),
            h('td', { className: `gwb-sign${rightKind === undefined ? '' : ` gwb-sign-${rightKind}`}` }, right !== null && right.t === 'add' ? '+' : ''),
            h('td', { className: `gwb-code${rightKind === undefined ? '' : ` gwb-cell-${rightKind}`}` },
              right === null ? null : h(CodeText, { spans: spansByRow.get(right) }),
              right === null || right.t === 'ctx' ? null : h('span', { className: 'gwb-line-action gwb-hoveronly' },
                h('button', {
                  type: 'button', className: 'gwb-mini', title: t('ai.quoteLine'),
                  onClick: (event) => { event.stopPropagation(); onQuote(right) },
                }, h(IconQuote, { size: 11 }))))))
            if (left !== null) nodes.push(...noteRows(rowAnchor(left), `l-${blockIndex}-${index}`))
            if (right !== null && right !== left) nodes.push(...noteRows(rowAnchor(right), `r-${blockIndex}-${index}`))
            if (composerAt(leftIndex) || composerAt(rightIndex)) {
              const node = composerNode(`s-${blockIndex}-${index}`)
              if (node !== null) nodes.push(node)
            }
          })
          return
        }
        for (const row of block.rows) {
          const index = rowIndex.get(row) ?? -1
          nodes.push(h(UnifiedLine, {
            key: `${row.t}-${row.o}-${row.n}-${blockIndex}`,
            row,
            rowIndex: index,
            spans: spansByRow.get(row),
            selected: inSelection(index),
            onQuote,
            onComment: event => press(index, event),
            onCommentHover: () => hover(index),
            t,
          }))
          nodes.push(...noteRows(rowAnchor(row), `${row.t}-${row.o}-${row.n}`))
          if (composerAt(index)) {
            const node = composerNode(`u-${row.t}-${row.o}-${row.n}`)
            if (node !== null) nodes.push(node)
          }
        }
      })
      const cols = split
        ? [52, 16, null, 52, 16, null].map((width, index) => h('col', { key: index, ...(width === null ? {} : { style: { width: `${width}px` } }) }))
        : [50, 50, 16, null].map((width, index) => h('col', { key: index, ...(width === null ? {} : { style: { width: `${width}px` } }) }))
      return h('div', {
        className: 'gwb-diff-holder',
        ref: containerRef,
      },
      h('table', { className: 'gwb-diff-table', 'data-wrap': wrap ? '1' : '0', 'aria-label': t('aria.diff') },
        h('colgroup', null, ...cols),
        h('tbody', null, ...nodes)))
    })

    /** One file section of the diff. */
    const DiffFile = memo(function DiffFile({
      file, diffEntry, comments, drafts, composer, selection, expanded, openGaps, prefs, t, locale, face, reviewed,
    }) {
      const family = languageOf(file.path)
      const diffValue = diffEntry !== undefined && diffEntry.value !== null ? diffEntry.value : null
      const rowIndex = useMemo(() => {
        const map = new Map()
        if (diffValue !== null) diffValue.rows.forEach((row, index) => map.set(row, index))
        return map
      }, [diffValue])
      const blocks = useMemo(() => {
        if (diffValue === null || diffValue.rows.length === 0) return { blocks: [], spansByRow: new Map() }
        const expandedSegments = expandSegments(segmentRows(diffValue.rows), openGaps ?? {})
        // Tokenize the COMPLETE row list, not only the visible rows: a block
        // comment opened in a visible line often closes inside a folded gap,
        // and a state machine that skips those rows would grey out the rest of
        // the file (the `#ifdef`-as-comment symptom).
        const spans = tokenizeRows(diffValue.rows, family)
        const spansByRow = new Map()
        diffValue.rows.forEach((row, index) => spansByRow.set(row, spans[index]))
        return { blocks: expandedSegments, spansByRow }
      }, [diffValue, openGaps, family])
      const commentsByLine = useMemo(() => {
        const map = new Map()
        const add = (key, value) => {
          if (!map.has(key)) map.set(key, [])
          map.get(key).push(value)
        }
        for (const comment of comments ?? []) add(`${comment.side === 'PARENT' ? 'o' : 'n'}${comment.line}`, comment)
        for (const draft of drafts ?? []) {
          add(`${draft.side === 'PARENT' ? 'o' : 'n'}${draft.line}`, {
            id: draft.id,
            line: draft.line,
            startLine: draft.startLine,
            side: draft.side,
            message: draft.message,
            author: null,
            updated: draft.at,
            patchSet: 0,
            unresolved: false,
            draft: true,
          })
        }
        return map
      }, [comments, drafts])
      const revealed = openGaps ?? {}
      const revealedCount = Object.values(revealed).reduce((sum, value) => sum + (Number(value) || 0), 0)
      const capped = diffValue !== null && diffValue.capped === true
      const selectedHere = selection !== null && selection !== undefined && selection.path === file.path
      let body
      if (!expanded) body = null
      else if (diffEntry === undefined || (diffEntry.phase === 'loading' && diffValue === null)) {
        body = h('div', { className: 'gwb-empty' }, t('diff.loading'))
      } else if (diffEntry.phase === 'error') {
        body = h('div', { className: 'gwb-error' }, h('div', null, t('diff.failed')), h('div', null, diffEntry.error))
      } else if (diffValue === null) body = null
      else if (diffValue.binary) body = h('div', { className: 'gwb-empty' }, t('diff.binary'))
      else if (diffValue.noChanges) body = h('div', { className: 'gwb-empty' }, t('diff.noChanges'))
      else if (diffValue.rows.length === 0) body = h('div', { className: 'gwb-empty' }, t('diff.empty'))
      else {
        body = h('div', { className: 'gwb-diff' },
          h(DiffBody, {
            blocks: blocks.blocks,
            spansByRow: blocks.spansByRow,
            commentsByLine,
            prefs,
            locale,
            t,
            path: file.path,
            rowIndex,
            allRows: diffValue.rows,
            selection: selectedHere ? selection : null,
            composer: composer !== null && composer !== undefined && composer.path === file.path ? composer : null,
            onQuote: row => face.quoteRow(row, file.path),
            onQuoteSelection: () => face.quoteSelection(),
            onSaveComment: text => face.saveComment(text),
            onCancelComment: () => face.cancelComment(),
            onRemoveDraft: (path, id) => face.removeDraft(path, id),
            onSelectStart: index => face.startSelection(file.path, index),
            onTextSelect: found => face.setTextSelection(file.path, found),
            onClearTextSelection: () => face.clearTextSelection(),
            onSelectExtend: (anchor, index) => face.extendSelection(file.path, anchor, index),
            onExpandGap: (key, remaining, all) => face.expandGap(file.path, key, remaining, all),
            onLoadFull: () => { void face.loadFullFile(file.path) },
          }),
          capped ? h('div', { className: 'gwb-capped' }, t('diff.capped')) : null)
      }
      const selectionBar = selectedHere
        ? h('div', { className: 'gwb-selection-bar' },
          h(IconComment, { size: 12 }),
          h('span', null, t('selection.count', { count: selection.to - selection.from + 1 })),
          h('span', { className: 'gwb-spacer' }),
          h('button', {
            type: 'button', className: 'gwb-mini', title: t('selection.quoteHint'),
            onClick: () => face.quoteSelection(),
          }, h(IconSparkle, { size: 11 }), h('span', null, t('selection.quote'))),
          h('button', {
            type: 'button', className: 'gwb-mini',
            onClick: () => face.openSelectionComment(),
          }, h(IconComment, { size: 11 }), h('span', null, t('selection.comment'))),
          h('button', {
            type: 'button', className: 'gwb-mini', title: t('selection.clear'),
            onClick: () => face.clearSelection(),
          }, h(IconClose, { size: 10 })))
        : null
      return h('section', { className: 'gwb-file', 'data-gwb-file': file.path, 'data-reviewed': reviewed ? '' : undefined },
        h('div', { className: 'gwb-file-head', 'data-open': expanded ? '' : undefined },
          h('button', {
            type: 'button',
            className: 'gwb-iconbtn',
            style: { border: 0, background: 'transparent', padding: '0 2px', minWidth: '18px', height: '18px' },
            title: expanded ? t('action.collapse') : t('action.expand'),
            'aria-expanded': expanded,
            onClick: () => face.toggleOpenFile(file.path, !expanded),
          }, h('span', { className: 'gwb-chev' }, h(IconChevron, { size: 12 }))),
          h('span', { className: 'gwb-status-letter', 'data-status': file.status }, file.status),
          h('span', { className: 'gwb-filepath gwb-mono', title: file.path }, file.path),
          file.binary ? h('span', { className: 'gwb-chip' }, 'binary') : h(Counts, { insertions: file.insertions, deletions: file.deletions }),
          h('div', { className: 'gwb-file-head-actions' },
            expanded && diffValue !== null && diffValue.rows.length > 0
              ? h('button', {
                type: 'button', className: 'gwb-mini', title: t('diff.showWhole'),
                onClick: () => { void face.loadFullFile(file.path) },
              }, h(IconChevrons, { size: 11 }))
              : null,
            revealedCount > 0
              ? h('button', {
                type: 'button', className: 'gwb-mini', title: t('diff.collapseGaps'),
                onClick: () => face.collapseGaps(file.path),
              }, h(IconList, { size: 11 }))
              : null,
            h('label', { className: 'gwb-reviewed', title: t('diff.reviewed') },
              h('input', {
                type: 'checkbox',
                checked: reviewed === true,
                onChange: () => face.toggleReviewed(file.path),
              }),
              h('span', null, t('diff.reviewed'))),
            h('button', {
              type: 'button', className: 'gwb-mini gwb-hoveronly', title: t('ai.quoteFile'),
              onClick: () => face.quoteFile(file.path),
            }, h(IconQuote, { size: 11 })),
            h('button', {
              type: 'button', className: 'gwb-mini gwb-hoveronly', title: t('ai.reviewFile'),
              onClick: () => { void face.startReview({ path: file.path }) },
            }, h(IconSparkle, { size: 11 })))),
        selectionBar,
        body)
    })

    /** The diff toolbar under the files strip. */
    function DetailToolbar({ state, face }) {
      const { t } = face
      const detail = state.detail.value
      if (detail === null) return null
      const prefs = state.prefs
      return h('div', { className: 'gwb-toolbar-strip' },
        h('div', { className: 'gwb-difftools' },
          h('button', {
            type: 'button', className: 'gwb-iconbtn', 'data-active': !prefs.split || undefined,
            title: t('diff.unified'), onClick: () => face.setPref('split', false),
          }, h(IconUnified, { size: 13 })),
          h('button', {
            type: 'button', className: 'gwb-iconbtn', 'data-active': prefs.split || undefined,
            title: t('diff.split'), onClick: () => face.setPref('split', true),
          }, h(IconSplit, { size: 13 })),
          h('button', {
            type: 'button', className: 'gwb-iconbtn', 'data-active': prefs.wrap || undefined,
            title: prefs.wrap ? t('diff.noWrap') : t('diff.toggleWrap'), onClick: () => face.setPref('wrap', !prefs.wrap),
          }, h(IconWrap, { size: 13 })),
          h('button', {
            type: 'button', className: 'gwb-iconbtn', 'data-active': prefs.filesOpen || undefined,
            title: t('diff.filesPanel'), onClick: () => face.setPref('filesOpen', !prefs.filesOpen),
          }, h(IconList, { size: 13 }))),
        h('span', { className: 'gwb-muted gwb-toolbar-hint' }, t('diff.selectionHint')),
        h('span', { className: 'gwb-spacer' }),
        h('button', {
          type: 'button', className: 'gwb-iconbtn',
          title: t('action.expandAll'),
          onClick: () => {
            for (const file of detail.files) {
              face.toggleOpenFile(file.path, true)
              face.openFile(file.path)
            }
          },
        }, h(IconChevrons, { size: 13 }), h('span', null, t('action.expandAll'))),
        h('button', {
          type: 'button', className: 'gwb-iconbtn',
          title: t('action.showWholeChange'),
          onClick: () => {
            for (const file of detail.files) {
              face.toggleOpenFile(file.path, true)
              face.openFile(file.path)
              void face.loadFullFile(file.path)
            }
          },
        }, h(IconChevrons, { size: 13 }), h('span', null, t('action.showWholeChange'))),
        h('button', {
          type: 'button', className: 'gwb-iconbtn',
          title: t('action.collapseAll'),
          onClick: () => {
            for (const file of detail.files) {
              face.toggleOpenFile(file.path, false)
              face.collapseGaps(file.path)
            }
          },
        }, h(IconChevrons, { size: 13 })),
        h('button', {
          type: 'button', className: 'gwb-iconbtn', 'data-tone': 'primary',
          title: t('ai.reviewChange'),
          onClick: () => { void face.startReview() },
        }, h(IconSparkle, { size: 13 }), h('span', null, t('ai.start'))))
    }

    /** The change detail column. */
    function ChangeDetail({ state, face }) {
      const { t } = face
      const snapshot = useSnapshot(face.hooks.locale)
      const locale = snapshot.active ?? 'en'
      const detail = state.detail.value
      const scroller = useRef(null)
      const scrollToFile = useCallback((path) => {
        const container = scroller.current
        if (container === null) return
        let selector
        try {
          const escaped = window.CSS !== undefined && typeof window.CSS.escape === 'function'
            ? window.CSS.escape(path)
            : path.replace(/"/g, '\\"')
          selector = `[data-gwb-file="${escaped}"]`
        } catch (_unsupported) {
          return
        }
        const target = container.querySelector(selector)
        if (target !== null) target.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }, [])
      if (detail === null && state.detail.phase === 'error') {
        const failure = h('div', { className: 'gwb-error' },
          h('div', null, t('error.generic', { message: state.detail.error })),
          h('button', {
            type: 'button', className: 'gwb-iconbtn', style: { marginTop: '8px' },
            onClick: () => { if (state.selected !== null) void face.selectChange(state.selected, { force: true }) },
          }, t('action.retry')))
        return h('div', { className: 'gwb-detail' }, failure)
      }
      if (detail === null) {
        const hint = t(state.detail.phase === 'loading' ? 'detail.loading' : 'detail.empty')
        return h('div', { className: 'gwb-detail' },
          h('div', { className: 'gwb-empty' }, hint,
            state.prefs.listOpen === false
              ? h('button', {
                type: 'button', className: 'gwb-iconbtn',
                onClick: () => face.setPref('listOpen', true),
              }, h(IconList, { size: 13 }), h('span', null, t('action.showList')))
              : null))
      }
      const latest = detail.revisions.length > 0 ? detail.revisions[0].number : detail.patchSet
      const commit = detail.messages.length > 0 ? detail.messages[detail.messages.length - 1].text : ''
      const ownerName = detail.owner === null ? t('detail.unknown') : (detail.owner.name || detail.owner.username)
      const reviewerNames = detail.reviewers.map(person => person.name || person.username).join(', ')

      const patchSetControl = detail.revisions.length > 1
        ? h('select', {
          className: 'gwb-select',
          value: String(detail.patchSet),
          title: t('detail.patchSet', { number: detail.patchSet }),
          onChange: event => { void face.selectChange(detail.number, { rev: event.target.value, force: true }) },
        }, ...detail.revisions.map(revision => h('option', { key: revision.number, value: String(revision.number) },
          `${t('detail.patchSet', { number: revision.number })}${revision.number === latest ? ` · ${t('detail.patchSet.latest')}` : ''}`)))
        : h('span', { className: 'gwb-chip' }, t('detail.patchSet', { number: detail.patchSet }))

      const previousRevision = detail.revisions.find(candidate => candidate.number === detail.patchSet - 1)
      const baseLabel = (revision) => {
        if (previousRevision !== undefined && previousRevision.revision === revision) {
          return t('base.previous', { number: previousRevision.number })
        }
        const match = detail.revisions.find(candidate => candidate.revision === revision)
        return t('base.patchSet', { number: match === undefined ? 0 : match.number })
      }
      const baseControl = h('select', {
        className: 'gwb-select',
        value: detail.base === '' ? '' : detail.base,
        title: t('base.hint'),
        onChange: event => face.setBase(event.target.value),
      },
      h('option', { value: '' }, t('base.parent')),
      ...detail.revisions
        .filter(revision => revision.revision !== detail.revision)
        .map(revision => h('option', { key: revision.revision, value: revision.revision }, baseLabel(revision.revision))))

      const fileChips = detail.files.map(file => h('button', {
        key: file.path,
        type: 'button',
        className: 'gwb-filechip',
        'data-open': state.openFiles[file.path] ? '' : undefined,
        title: file.path,
        onClick: () => {
          face.toggleOpenFile(file.path, true)
          scrollToFile(file.path)
        },
      },
      h('span', { className: 'gwb-status-letter', 'data-status': file.status }, file.status),
      h('span', { className: 'gwb-ellipsis gwb-mono' }, file.path),
      h('span', { className: 'gwb-add' }, `+${file.insertions}`),
      h('span', { className: 'gwb-del' }, `−${file.deletions}`)))

      const sections = detail.files.map(file => h(DiffFile, {
        key: `${file.path}@${detail.revision}`,
        file,
        diffEntry: state.diffs[`${file.path}@${detail.revision}`],
        comments: state.detail.comments[file.path],
        expanded: state.openFiles[file.path] === true,
        openGaps: state.openGaps[file.path],
        drafts: state.drafts[file.path],
        selection: state.selection,
        composer: state.composer,
        prefs: state.prefs,
        t,
        locale,
        face,
        reviewed: state.detail.reviewed[file.path] === true,
      }))

      const draftCount = Object.values(state.drafts).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0)
      const titleRow = h('div', { className: 'gwb-detail-title' },
        h('h2', null, detail.subject),
        h('div', { className: 'gwb-detail-actions' },
          h('button', {
            type: 'button',
            className: 'gwb-iconbtn',
            'data-tone': draftCount > 0 ? 'primary' : undefined,
            title: t('reply.open'),
            onClick: () => face.openReply(),
          },
          h(IconComment, { size: 13 }),
          h('span', null, t('reply.button')),
          draftCount > 0 ? h('span', { className: 'gwb-chip' }, draftCount) : null),
          h('a', {
            className: 'gwb-iconbtn', href: detail.url, target: '_blank', rel: 'noreferrer',
            title: t('action.openInGerrit'),
          }, h(IconExternal, { size: 13 }))))

      const metaRow = h('div', { className: 'gwb-detail-meta' },
        h('span', { className: 'gwb-mono' }, `#${detail.number}`),
        h('span', { className: 'gwb-mono' }, detail.project),
        h('span', { className: 'gwb-mono' }, detail.branch),
        detail.topic === '' ? null : h('span', { className: 'gwb-chip' }, detail.topic),
        patchSetControl,
        baseControl,
        h(Counts, { insertions: detail.insertions, deletions: detail.deletions }),
        h(VoteChips, { labels: detail.labels }),
        h('span', { className: 'gwb-spacer' }),
        h('span', { title: absoluteWhen(detail.updated, locale) }, relativeWhen(detail.updated, locale)))

      const ownerRow = h('div', { className: 'gwb-kv' },
        h('dt', null, t('detail.owner')),
        h('dd', null, ownerName))

      const reviewerRow = detail.reviewers.length === 0
        ? null
        : h('div', { className: 'gwb-kv' },
          h('dt', null, t('detail.reviewers')),
          h('dd', null, reviewerNames))

      const head = h('div', { className: 'gwb-detail-head' }, titleRow, metaRow, ownerRow, reviewerRow)
      const commitBlock = commit === '' ? null : h('pre', { className: 'gwb-commit' }, commit)
      const filesHead = state.prefs.filesOpen
        ? h('div', { className: 'gwb-section-head' },
          h('span', null, `${t('detail.files')} (${detail.files.length})`),
          h('span', { className: 'gwb-spacer' }))
        : null
      const filesBlock = state.prefs.filesOpen ? h('div', { className: 'gwb-files' }, ...fileChips) : null
      const body = [head, commitBlock, filesHead, filesBlock, h(DetailToolbar, { state, face }), ...sections]
      return h('div', { className: 'gwb-detail' },
        h('div', { className: 'gwb-detail-scroll', ref: scroller }, ...body))
    }

    /**
     * Reply dialog: the staged inline comments, a summary message, and one
     * vote per permitted label, published as one Gerrit review.
     */
    function ReplyDialog({ state, face }) {
      const { t } = face
      const detail = state.detail.value
      const [message, setMessage] = useState('')
      const [votes, setVotes] = useState({})
      const [step, setStep] = useState('edit')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const drafts = Object.entries(state.drafts).flatMap(([path, list]) => (Array.isArray(list) ? list.map(item => ({ path, ...item })) : []))
      const permitted = detail !== null && detail.permittedLabels !== null && typeof detail.permittedLabels === 'object'
        ? detail.permittedLabels
        : {}
      const labelNames = Object.keys(permitted)
      const chosen = labelNames.filter(name => votes[name] !== undefined && votes[name] !== '')
      const voteText = chosen.map(name => `${name} ${Number(votes[name]) > 0 ? '+' : ''}${votes[name]}`).join('、')
      useEffect(() => {
        if (step !== 'confirm') return undefined
        const timer = setTimeout(() => setStep('edit'), 6000)
        return () => clearTimeout(timer)
      }, [step])
      const publish = () => {
        setBusy(true)
        setError(null)
        void face.publishReview({ message, labels: votes }).then((result) => {
          setBusy(false)
          if (!result.ok) setError(result.error)
        })
      }
      if (detail === null) return null
      const summary = t('reply.summary', {
        comments: drafts.length,
        votes: voteText === '' ? t('reply.noVotes') : voteText,
        message: message.trim().length,
      })
      const empty = drafts.length === 0 && message.trim() === '' && chosen.length === 0
      return h('div', {
        className: 'gwb-backdrop',
        role: 'presentation',
        onClick: event => { if (event.target === event.currentTarget && !busy) face.closeReply() },
      },
      h('div', { className: 'gwb-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('reply.title') },
        h('div', { className: 'gwb-modal-head' },
          h(IconComment, { size: 14 }),
          h('strong', null, t('reply.title')),
          h('span', { className: 'gwb-ellipsis' }, t('ai.subtitle', { number: detail.number, patchSet: detail.patchSet })),
          h('span', { className: 'gwb-spacer' }),
          h('button', { type: 'button', className: 'gwb-mini', title: t('action.close'), onClick: () => face.closeReply() }, h(IconClose, { size: 11 }))),
        h('div', { className: 'gwb-modal-body' },
          labelNames.length === 0
            ? null
            : h('div', { className: 'gwb-vote-grid' }, ...labelNames.map(name => {
              const values = Array.isArray(permitted[name]) ? permitted[name] : []
              const current = detail.labels !== null && detail.labels[name] !== undefined ? detail.labels[name].value : 0
              return h('div', { className: 'gwb-vote-row', key: name },
                h('span', { className: 'gwb-vote-name' }, name),
                h('select', {
                  className: 'gwb-select gwb-select-sm',
                  value: votes[name] === undefined ? '' : String(votes[name]),
                  onChange: event => setVotes(previous => ({ ...previous, [name]: event.target.value })),
                },
                h('option', { value: '' }, t('reply.noVote')),
                ...values.map(value => {
                  const numeric = Number(String(value).trim())
                  return h('option', { key: value, value: String(numeric) }, `${numeric > 0 ? '+' : ''}${numeric}`)
                })),
                h('span', { className: 'gwb-muted' }, t('reply.currentVote', { value: current > 0 ? `+${current}` : current })))
            })),
          h('div', { className: 'gwb-field-label' }, t('reply.message')),
          h('textarea', {
            className: 'gwb-composer-input',
            rows: 5,
            value: message,
            placeholder: t('reply.messagePlaceholder'),
            onChange: event => setMessage(event.target.value),
          }),
          h('div', { className: 'gwb-field-label' }, t('reply.drafts', { count: drafts.length })),
          drafts.length === 0
            ? h('div', { className: 'gwb-muted' }, t('reply.noDrafts'))
            : h('div', { className: 'gwb-draft-list' }, ...drafts.map(item => h('div', { className: 'gwb-draft-row', key: `${item.path}:${item.id}` },
              h('div', { className: 'gwb-draft-meta' },
                h('code', { className: 'gwb-mono' }, `${item.path}:${item.line}`),
                h('span', { className: 'gwb-chip' }, item.side === 'PARENT' ? 'parent' : 'PS'),
                h('span', { className: 'gwb-spacer' }),
                h('button', {
                  type: 'button', className: 'gwb-mini',
                  onClick: () => face.removeDraft(item.path, item.id),
                }, t('comment.remove'))),
              h('div', { className: 'gwb-draft-text' }, item.message)))),
          error === null ? null : h('div', { className: 'gwb-error' }, error),
          step === 'confirm' ? h('div', { className: 'gwb-confirm' }, t('reply.confirm', { summary })) : null),
        h('div', { className: 'gwb-modal-foot' },
          h('span', { className: 'gwb-muted gwb-ellipsis' }, summary),
          h('span', { className: 'gwb-spacer' }),
          h('button', {
            type: 'button', className: 'gwb-iconbtn', disabled: busy,
            onClick: () => face.closeReply(),
          }, t('comment.cancel')),
          h('button', {
            type: 'button', className: 'gwb-iconbtn', 'data-tone': 'primary',
            disabled: busy || empty,
            onClick: () => {
              setError(null)
              if (step === 'confirm') publish()
              else setStep('confirm')
            },
          }, busy ? t('reply.posting') : step === 'confirm' ? t('reply.confirmButton') : t('reply.publish')))))
    }

    /** Floating actions for a mouse text selection inside a diff. */
    function SelectionPopup({ found, face }) {
      const { t } = face
      const width = 264
      const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth
      const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight
      const left = Math.max(8, Math.min(found.rect.left, viewportWidth - width - 8))
      let top = found.rect.bottom + 8
      if (top + 40 > viewportHeight) top = Math.max(8, found.rect.top - 42)
      return h('div', {
        className: 'gwb-float',
        style: { left: `${left}px`, top: `${top}px` },
        onMouseDown: event => event.preventDefault(),
      },
      h('button', {
        type: 'button', className: 'gwb-mini', title: t('selection.commentHint'),
        onClick: () => face.commentTextSelection(),
      }, h(IconComment, { size: 11 }), h('span', null, t('selection.comment'))),
      h('button', {
        type: 'button', className: 'gwb-mini', title: t('selection.quoteHint'),
        onClick: () => face.quoteTextSelection(),
      }, h(IconSparkle, { size: 11 }), h('span', null, t('selection.quote'))),
      h('button', {
        type: 'button', className: 'gwb-mini', title: t('selection.clear'),
        onClick: () => face.clearTextSelection(),
      }, h(IconClose, { size: 10 })))
    }

    /** The embedded AI Session pane. */
    function AiPane({ state, face, pageProps }) {
      const { t } = face
      const { renderSlot, SessionProvider } = pageProps
      const ai = state.ai
      const meta = state.meta.value
      const workspaces = useSnapshot(face.hooks.workspaces)
      const resolved = face.resolveTarget()
      const configured = meta !== null && typeof meta.reviewCwd === 'string' ? meta.reviewCwd : ''
      const target = ai.target
      const targetIsKnown = target.kind !== 'workspace'
        || workspaces.some(item => item.workspaceId === target.id)
      const selectValue = !targetIsKnown
        ? 'auto'
        : target.kind === 'workspace' ? `ws:${target.id}` : target.kind === 'cwd' ? `cwd:${target.path}` : 'auto'
      const targetOptions = [
        h('option', { key: 'auto', value: 'auto' }, t('ai.workspace.auto', { name: resolved.label === '' ? t('detail.unknown') : resolved.label })),
        ...workspaces.map(item => h('option', { key: `ws:${item.workspaceId}`, value: `ws:${item.workspaceId}`, title: item.path }, item.title)),
        ...configured === ''
          ? []
          : [h('option', { key: `cwd:${configured}`, value: `cwd:${configured}`, title: configured }, t('ai.workspace.config', { name: baseName(configured) || configured }))],
      ]
      const onTargetChange = (event) => {
        const value = event.target.value
        if (value === 'auto') face.setTarget({ kind: 'auto' })
        else if (value.startsWith('ws:')) face.setTarget({ kind: 'workspace', id: value.slice(3) })
        else if (value.startsWith('cwd:')) face.setTarget({ kind: 'cwd', path: value.slice(4) })
      }
      const subtitle = state.detail.value === null
        ? ''
        : t('ai.subtitle', { number: state.detail.value.number, patchSet: state.detail.value.patchSet })
      // A retained session reports `ready` once the Host has opened it and the
      // client service knows it. Rendering the embedded Conversation before that
      // makes the framework ask for a binding that does not exist yet
      // (`uiConversation.binding: unknown session`), so wait for it.
      const reference = ai.reference
      const [surfaceReady, setSurfaceReady] = useState(reference === undefined)
      useEffect(() => {
        if (reference === undefined) {
          setSurfaceReady(false)
          return undefined
        }
        let live = true
        const settle = () => { if (live) setSurfaceReady(true) }
        if (reference.ready === undefined) settle()
        else void reference.ready.then(settle, settle)
        return () => { live = false }
      }, [reference])
      let body
      if (meta !== null && meta.configured === false) {
        body = h('div', { className: 'gwb-ai-empty' }, h(IconSparkle, { size: 22 }), h('div', null, t('meta.unconfigured')))
      } else if (meta !== null && meta.error !== null) {
        body = h('div', { className: 'gwb-ai-empty' }, h('div', { className: 'gwb-error' }, meta.error))
      } else if (ai.phase === 'creating' || ai.phase === 'loading') {
        body = h('div', { className: 'gwb-ai-empty' }, ai.phase === 'creating' ? t('ai.creating') : t('ai.loading'))
      } else if (ai.phase === 'error') {
        body = h('div', { className: 'gwb-ai-empty' },
          h('div', { className: 'gwb-error' }, ai.error),
          h('button', {
            type: 'button', className: 'gwb-iconbtn',
            onClick: () => {
              const detail = state.detail.value
              if (detail !== null) void face.ensureSession(detail, true)
            },
          }, t('action.retry')))
      } else if (ai.reference === undefined) {
        body = h('div', { className: 'gwb-ai-empty' },
          h(IconSparkle, { size: 22 }),
          h('div', null, t('ai.emptyHint')),
          h('button', {
            type: 'button', className: 'gwb-iconbtn', 'data-tone': 'primary',
            disabled: state.selected === null,
            onClick: () => { void face.startReview() },
          }, t('ai.start')))
      } else if (!surfaceReady) {
        body = h('div', { className: 'gwb-ai-empty' }, t('ai.loading'))
      } else {
        body = h('div', { className: 'gwb-ai-surface' },
          h(Boundary, { retryLabel: t('action.retry') },
            h(SessionProvider, { session: reference }, renderSlot('gerrit.ai.session', {}))))
      }
      return h('aside', { className: 'gwb-ai', 'aria-label': t('aria.aiSession') },
        h('div', { className: 'gwb-ai-head' },
          h(IconSparkle, { size: 14 }),
          h('strong', null, t('ai.title')),
          h('span', { className: 'gwb-ellipsis' }, subtitle),
          h('span', { className: 'gwb-spacer' }),
          h('button', {
            type: 'button', className: 'gwb-mini', title: t('ai.newSession'),
            onClick: () => { void face.resetSession() },
          }, t('ai.newSession')),
          h('button', {
            type: 'button', className: 'gwb-mini', title: t('ai.closePanel'),
            onClick: () => face.setAiOpen(false),
          }, h(IconClose, { size: 11 }))),
        h('div', { className: 'gwb-ai-target' },
          h('span', null, t('ai.workspace')),
          h('select', {
            className: 'gwb-select gwb-select-sm',
            value: selectValue,
            title: t('ai.workspace.hint'),
            'aria-label': t('ai.workspace'),
            onChange: onTargetChange,
          }, ...targetOptions),
          h('span', { className: 'gwb-ai-target-path gwb-mono gwb-ellipsis', title: resolved.path }, resolved.path)),
        h('div', { className: 'gwb-ai-body' }, body))
    }

    /** Session-scope body: the chat view of the embedded Conversation. */
    function FixedChatConversationView(props) {
      return props.renderSlot('conversation.session', { view: 'chat' })
    }

    /**
     * Render the shared Conversation content for the review Session. The
     * framework supplies the Session scope target through SessionProvider, so
     * this body reads the same props the right-Sidebar chat does.
     */
    function ReviewSessionPanel(props) {
      const { sessionId, useSession, useConversation, useSessions, renderFactorySlot } = props
      useEffect(() => { beacon('session-surface-mounted', sessionId) }, [sessionId])
      const sessionSnapshot = useSession(value => value)
      const conversationSnapshot = useConversation(value => value)
      const session = sessionSnapshot ?? { blank: true, awaitingFirstTurn: true, running: false, promptAttempted: false, openState: 'loading' }
      const conversation = conversationSnapshot ?? { activeTargets: new Set() }
      const active = conversation.activeTargets.size > 0
        || (!session.blank && !session.awaitingFirstTurn)
        || session.running
      const shellPhase = active ? 'active' : session.promptAttempted ? 'engaging' : 'blank'
      const summaryBlank = useSessions(state => state.byId[sessionId]?.blank)
      const settling = shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true
      // No hero: the review desk pins the Session to its own panel, and a hero
      // would raise a second workspace picker whose selection navigates the
      // main column away from the workbench.
      const phase = settling ? 'settling' : 'active'
      return renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero: false }, {
        slots: { views: FixedChatConversationView },
      })
    }

    /**
     * A form-shaped stand-in so the page renders before the client service
     * resolves. `useSyncExternalStore` compares snapshots by identity, so the
     * same frozen snapshot has to come back on every read: a fresh object here
     * would re-render the page in a loop.
     */
    const UNAVAILABLE_SNAPSHOT = Object.freeze({
      status: 'unavailable', value: undefined, base: undefined, user: undefined, revision: 0, writable: false,
    })
    const UNAVAILABLE_FORM = Object.freeze({
      getSnapshot: () => UNAVAILABLE_SNAPSHOT,
      subscribe: () => () => {},
    })

    /** Read one configuration value as text. */
    function configText(value) {
      return typeof value === 'string' ? value : ''
    }

    /** The connection status line, shared with the toolbar's wording. */
    function connectionNote(face, state) {
      const meta = state.meta.value
      if (state.meta.phase === 'idle' || state.meta.phase === 'loading') return face.t('meta.checking')
      if (meta !== null && meta.configured === false) return face.t('meta.unconfigured')
      if (meta === null) return face.t('meta.setup', { file: '~/.gerrit-http-credentials' })
      if (meta.self === null) {
        const message = meta.error === undefined || meta.error === null ? '' : String(meta.error)
        // A reachable Gerrit that rejects the credentials is the setup case; an
        // unreachable one is a transport failure and has to say which.
        if (message !== '' && !/401|403|unauthenticated|credentials/i.test(message)) {
          return face.t('error.generic', { message })
        }
        return face.t('meta.setup', { file: meta.credentialsFile })
      }
      return face.t('meta.connected', { user: meta.self.name || meta.self.username })
    }

    /**
     * This bundle's configuration page. It serves the row page inside the
     * Plugins panel (`plugins.row.config`, which hands the form over as a prop)
     * and the page opened by clicking the plugin card (`plugins.bundle.config`,
     * which has no prop, so the page reads the form from the client service).
     * The fields are the Host schema's volatile ones: saving writes them
     * through the settings domain, the Loader commits them into the running
     * plugin, and the Host rebuilds its Gerrit facade, so a new server or
     * account applies without a restart.
     */
    function PluginConfigPage(props) {
      const { view, form } = props
      const face = props.face
      const { t } = face
      // Re-render on a language change: `t` reads the active locale at call time.
      useSnapshot(face.hooks.locale)
      const state = useSnapshot(face.store)
      const forms = useSnapshot(face.forms).value
      // Two shapes reach this page: the row page is handed `{ state, mutate }`
      // by the Plugins panel, while the bundle page gets no prop and reads the
      // `ConfigForm` service instead. The service form is a class instance, so
      // its methods are bound here: `useSnapshot` hands `getSnapshot` to React
      // detached, and an unbound method would lose `this`.
      const serviceForm = form === undefined && forms !== undefined ? forms.get(ROW_ID) : undefined
      const source = useMemo(() => (serviceForm === undefined ? UNAVAILABLE_FORM : {
        subscribe: (listener) => serviceForm.subscribe(listener),
        getSnapshot: () => serviceForm.getSnapshot(),
      }), [serviceForm])
      const live = useSnapshot(source)
      const snapshot = form === undefined ? live : form.state
      const mutate = form === undefined ? serviceForm?.mutate.bind(serviceForm) : form.mutate
      const [draft, setDraft] = useState(null)
      const [busy, setBusy] = useState(false)
      const [saved, setSaved] = useState(false)
      const [rejected, setRejected] = useState(false)
      const [failure, setFailure] = useState(null)
      // A new revision (our save, or one written elsewhere) restarts the draft.
      const revision = snapshot.revision
      useEffect(() => {
        setDraft(null)
        setBusy(false)
      }, [revision])
      useEffect(() => {
        // The card page can open before the workbench ever loaded: ask the Host.
        if (face.store.getSnapshot().meta.phase === 'idle') void face.loadMeta()
      }, [face])
      if (view === 'summary') return h('span', null, t('config.summary'))
      const note = { margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--dsh-text-2, inherit)' }
      if (snapshot.status === 'loading') return h('div', { style: note }, t('meta.checking'))
      if (snapshot.status !== 'ready' || snapshot.value === null || typeof snapshot.value !== 'object') {
        return h('div', { style: note }, t('config.unavailable'))
      }
      const value = snapshot.value
      const current = {
        gerritUrl: configText(value.gerritUrl),
        username: configText(value.username),
        credentialsFile: configText(value.credentialsFile),
        sessionMatch: value.sessionMatch === 'change' ? 'change' : 'patchSet',
      }
      const fields = draft === null ? { ...current, httpPassword: '' } : draft
      const writable = snapshot.writable === true
      // A cleared text field unsets the key instead of storing an empty string,
      // so the schema default (or the credentials file) applies again.
      const textOp = (key, next) => next === '' ? { op: 'unset', path: [key] } : { op: 'set', path: [key], value: next }
      const ops = []
      if (fields.gerritUrl.trim() !== current.gerritUrl.trim()) ops.push(textOp('gerritUrl', fields.gerritUrl.trim()))
      if (fields.username.trim() !== current.username.trim()) ops.push(textOp('username', fields.username.trim()))
      if (fields.credentialsFile.trim() !== current.credentialsFile.trim()) ops.push(textOp('credentialsFile', fields.credentialsFile.trim()))
      if (fields.sessionMatch !== current.sessionMatch) ops.push({ op: 'set', path: ['sessionMatch'], value: fields.sessionMatch })
      // The Host redacts the stored password, so a blank box means "keep it".
      if (fields.httpPassword !== '') ops.push({ op: 'set', path: ['httpPassword'], value: fields.httpPassword })
      /** Write one batch of settings edits and report how it went. */
      const run = (batch) => {
        if (!writable || busy) return
        if (mutate === undefined) {
          setRejected(true)
          return
        }
        setBusy(true)
        setSaved(false)
        setRejected(false)
        setFailure(null)
        void Promise.resolve(mutate(batch, snapshot.revision))
          .then((accepted) => {
            if (accepted !== true) {
              setRejected(true)
              return
            }
            // Adopt the mode here too: an AI panel open in this tab re-matches now.
            const match = batch.find((op) => Array.isArray(op.path) && op.path[0] === 'sessionMatch')
            if (match !== undefined) face.applySessionMatch(match.value)
            setSaved(true)
            setDraft(null)
            void face.loadMeta()
          })
          .catch((error) => setFailure(error.message))
          .finally(() => setBusy(false))
      }
      const save = () => {
        if (ops.length === 0) return
        run(ops)
      }
      const clearPassword = () => run([{ op: 'unset', path: ['httpPassword'] }])
      const inputStyle = { height: 28, fontSize: 12, padding: '0 8px', borderRadius: 6, maxWidth: 420,
        border: '1px solid var(--dsh-border, #d0d0d0)', background: 'var(--dsh-surface, transparent)', color: 'inherit' }
      const field = (id, key, extra = {}) => h('input', {
        id,
        type: extra.type === undefined ? 'text' : extra.type,
        value: fields[key],
        placeholder: extra.placeholder,
        disabled: !writable || busy,
        autoComplete: 'off',
        spellCheck: false,
        onChange: (event) => setDraft({ ...fields, [key]: event.target.value }),
        style: inputStyle,
      })
      const rowOf = (label, control, hint) => h('div', { style: { display: 'grid', gap: 4, marginBottom: 10 } },
        h('label', { htmlFor: control.props.id, style: { fontSize: 12, fontWeight: 500 } }, label),
        control,
        hint === undefined ? null : h('span', { style: { ...note, margin: 0 } }, hint))
      const storedPassword = state.meta.value !== null && state.meta.value !== undefined && state.meta.value.hasHttpPassword === true
      return h('div', { 'data-gwb-config': 'plugin-config', style: { padding: '4px 0 8px', maxWidth: 560 } },
        h('p', { style: { ...note, margin: '0 0 12px' }, 'data-gwb-config-status': '' }, connectionNote(face, state)),
        rowOf(t('config.server'), field('gwb-config-url', 'gerritUrl', { placeholder: 'https://gerrit.example.com' }), t('config.server.hint')),
        rowOf(t('config.username'), field('gwb-config-user', 'username', {
          placeholder: current.username === '' ? t('config.username.fromFile') : '',
        }), t('config.username.hint')),
        rowOf(t('config.password'), field('gwb-config-password', 'httpPassword', {
          type: 'password',
          placeholder: storedPassword ? t('config.password.set') : t('config.password.unset'),
        }), t('config.password.hint')),
        rowOf(t('config.credentialsFile'), field('gwb-config-file', 'credentialsFile'), t('config.credentialsFile.hint')),
        rowOf(t('config.sessionMatch'), h('select', {
          id: 'gwb-config-session-match',
          value: fields.sessionMatch,
          disabled: !writable || busy,
          onChange: (event) => setDraft({ ...fields, sessionMatch: event.target.value === 'change' ? 'change' : 'patchSet' }),
          style: { height: 28, fontSize: 12, maxWidth: 320, borderRadius: 6 },
        },
        h('option', { value: 'patchSet' }, t('config.sessionMatch.patchSet')),
        h('option', { value: 'change' }, t('config.sessionMatch.change'))), t('config.sessionMatch.hint')),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 } },
          h('button', {
            type: 'button',
            disabled: !writable || busy || ops.length === 0,
            onClick: save,
            style: { height: 28, padding: '0 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer' },
          }, busy ? t('config.saving') : t('config.save')),
          saved ? h('span', { style: note, role: 'status' }, t('config.saved')) : null,
          rejected ? h('span', { style: note }, t('config.rejected')) : null,
          failure === null ? null : h('span', { style: { ...note, color: 'var(--dsh-danger, #d33)' } }, failure),
          storedPassword
            ? h('button', {
              type: 'button',
              disabled: !writable || busy,
              onClick: clearPassword,
              style: { height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer' },
            }, t('config.password.clear'))
            : null),
        writable ? null : h('p', { style: note }, t('config.readonly')))
    }

    /** Page root: toolbar, list, detail, and the AI column. */
    function GerritWorkbenchPage(props) {
      const face = props.face
      const state = useSnapshot(face.store)
      // Re-render when the active language changes: `t` reads it at call time.
      useSnapshot(face.hooks.locale)
      useEffect(() => {
        const dismiss = (event) => {
          const target = event.target
          if (target !== null && target !== undefined && target instanceof Element && target.closest('.gwb-float') !== null) return
          face.clearTextSelection()
        }
        const onKey = (event) => { if (event.key === 'Escape') face.clearTextSelection() }
        window.addEventListener('mousedown', dismiss, true)
        window.addEventListener('keydown', onKey)
        return () => {
          window.removeEventListener('mousedown', dismiss, true)
          window.removeEventListener('keydown', onKey)
        }
      }, [face])
      useEffect(() => {
        let cancelled = false
        beacon('page-mounted')
        void (async () => {
          await face.loadMeta()
          if (cancelled) return
          await face.loadList()
          if (cancelled) return
          // Land on the newest change so the desk opens with a diff instead of a hint.
          const snapshot = face.store.getSnapshot()
          const first = snapshot.list.items[0]
          if (snapshot.selected === null && first !== undefined) void face.selectChange(first.number)
        })()
        return () => { cancelled = true }
      }, [face])
      return h('div', { className: 'gwb-root', 'data-gwb-root': '' },
        h('style', null, CSS),
        h(Boundary, { retryLabel: face.t('action.retry') },
          h(Toolbar, { state, face }),
          h('div', { className: 'gwb-body' },
            state.prefs.listOpen === false ? null : h(ChangeList, { state, face }),
            h(ChangeDetail, { state, face }),
            state.ai.open === true ? h(AiPane, { state, face, pageProps: props }) : null,
            state.ai.notice === null ? null : h('div', { className: 'gwb-toast', role: 'status' }, state.ai.notice))),
        state.replyOpen === true ? h(ReplyDialog, { state, face }) : null,
        state.textSelection === null ? null : h(SelectionPopup, { found: state.textSelection, face }))
    }

    // ---------------------------------------------------------------------
    // Plugin body
    // ---------------------------------------------------------------------

    /** Hard services this client half needs before it activates. */
    const inject = ['slots', 'locale', 'sessions']

    /** Plugin body: register the sidebar entry, the panel, and the session body. */
    function apply(ctx) {
      const store = createStore({ ...initialState(), prefs: { ...initialState().prefs, ...readPrefs() } })
      const face = createFace(ctx, store)
      ctx.effect(() => ctx.locale.register(NS, { en, zh, ja: en, de: en, es: en, fr: en, pt: en, ru: en }), 'gerrit-workbench: dictionaries')
      ctx.effect(() => () => { face.dispose() }, 'gerrit-workbench: session references')

      // The settings client keeps one configuration form per loader entry id;
      // the bundle page reads this while the row page uses the form prop.
      ctx.inject(['configForms'], (scope) => {
        face.forms.set({ value: scope.configForms })
        scope.effect(() => () => { face.forms.set({ value: undefined }) })
      })

      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 15,
        label: () => face.t('panel.title'),
      }, SidebarIcon)), 'gerrit-workbench: sidebar entry')

      ctx.effect(() => ctx.slots.inject('main', function* () {
        yield ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          inject: () => ({ face }),
          children: { 'gerrit.ai.session': { kind: 'single', scope: 'session' } },
        }, GerritWorkbenchPage)
        yield ctx.slots.register({
          name: 'gerrit.ai.session',
        }, ReviewSessionPanel)
      }), 'gerrit-workbench: workbench panel')

      // The configuration page closes over `face` instead of asking the slot
      // for injected props: the bundle page renders the view without them, and
      // a view that reads `face` from its props would crash there.
      const configView = (props) => h(PluginConfigPage, { ...props, face })

      ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: ROW_CONFIG_KEY,
      }, configView)), 'gerrit-workbench: row configuration page')

      // The same page on the bundle page the plugin card opens: the settings
      // domain generates it there too, but hands it no form, so it reads the
      // form from the client service captured above.
      ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: PACKAGE_NAME,
      }, configView)), 'gerrit-workbench: bundle configuration page')
    }

    return { inject, apply }
  },
})
