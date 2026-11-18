# dsh-gerrit-workbench

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web
plugin that puts a Gerrit review desk in the main column: outgoing / incoming
changes, syntax-highlighted diffs, inline comments and review publishing, plus
an embedded DSH AI Session you can quote code into and ask to review the change.

一个 DSH 插件：左侧栏入口打开 Gerrit 评审工作台，提供出站/入站评审列表、
带语法高亮的代码 Diff、行内评论与评审发布，以及可以拉起并内嵌在页面右侧的
AI 审查会话。

```
DSH Web ── /gerrit-workbench/api ──▶ Gerrit REST
   │                                  (凭据只留在 Host 进程里)
   └── 内嵌 Conversation（普通 DSH Session，可引用代码 / 一键审查）
```

## 安装 / Install

要求：DSH Web（0.2.x），插件跑在 Host 的 Node 进程里。

```bash
# npm 上发布的包
dsh plugin --profile web add dsh-gerrit-workbench

# 或者从本地目录 / 压缩包安装
dsh plugin --profile web add /path/to/dsh-gerrit-workbench
```

安装后如果侧栏还没有入口，重启一次 `dsh web`。左侧栏出现「Gerrit 工作台」即可使用。

## 快速开始

1. 打开 **Plugins → Gerrit workbench**，点插件卡片进入配置页，填 **Gerrit 服务器**
   （形如 `https://gerrit.example.com`）和账号信息，点「保存」。
2. 打开左侧栏的「Gerrit 工作台」，列表里会显示你的出站 / 入站评审。
3. 点一个变更看 Diff；右上角「开始 AI 审查」会在右侧拉起一个内嵌 AI 会话。

配置改完即时生效：这些字段是 schema 里的 `volatile` 字段，保存直接写进运行中的
插件并重建 Gerrit 客户端，**不用重启 dsh web**。

## 配置

在 **Plugins → Gerrit workbench 卡片页**（或该行右侧的 Configure）就能改：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `gerritUrl` | 空 | Gerrit 基地址，用于 REST 与页面链接；未填写时插件不访问网络，只在界面上提示去配置 |
| `username` | 空 | HTTP 用户名；留空则用凭据文件里的用户名 |
| `httpPassword` | 空 | HTTP 密码 / Token（`role('secret')`，只存在 Host，不回传浏览器）；留空表示沿用已保存的值或凭据文件 |
| `credentialsFile` | `~/.gerrit-http-credentials` | HTTP 凭据文件；留空表示不读文件 |
| `sessionMatch` | `patchSet` | 审查会话的记忆方式：`patchSet` 每个补丁集一个会话 / `change` 整个变更共用一个。见下文「AI 会话是怎么拉起来的」 |

下面这些字段不常改，仍然写在插件 row 的 `config`（`cordis.patch.yml`）里：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `cacheTtlMs` | `20000` | 列表/详情缓存时间；`/refresh` 会清空 |
| `defaultCwd` | 空 | 兜底目录（工作目录不可解析时使用） |
| `reviewCwd` | 空 | 审查会话的默认目录；面板里的「工作区」选择优先于此项 |

凭据文件支持这几种写法（文件里只有一对凭据）：

```
<HTTP username>:<HTTP password>
```

```
<HTTP password>
```

```
https://<HTTP username>:<HTTP password>@gerrit.example.com
```

凭据只留在 Host 进程里：浏览器访问的是同源的 `/gerrit-workbench/api`，不会直接
连接 Gerrit，也不会把 Token 写进页面。

## 功能

* 左侧栏入口：`Gerrit 工作台`（panel id `gerrit`）
* 主面板：出站 / 入站评审，状态筛选，全文搜索，补丁集切换
* 变更卡片：标题、Owner、Repo、Branch、补丁集、增删行数与投票一目了然
* Diff：统一 / 并排两种视图（默认并排，和 Gerrit 一致），按语言高亮
  （跟随主题的浅色与深色配色），已有 inline comment 直接显示在对应行下方
* 长行默认自动换行（工具栏可切「不换行」）；不换行时 Diff 横向滚动，
  并排两栏不会再互相压字
* Gerrit 式折叠行：左侧「+20 行（上方）」、中间「显示 612 行公共代码」、
  右侧「+20 行（下方）」，Shift+点击一次展开全部；文件头可以
  「显示整个文件」（大文件被 Host 截断时，点折叠处或该按钮会重新拉完整行）
* 文件级「已审阅」勾选（本地保存，按 change + 补丁集记忆），已审阅的文件标题变淡
* 「对比」下拉：父提交（默认）/ 上一补丁集 / 任一补丁集，对齐 Gerrit 的 Diff against
* 变更列表可隐藏：工具栏左侧的列表按钮收起整列，把宽度让给 Diff；偏好记住
* 评审写入：点行号写行内评论（先存草稿，可删改），「回复」面板里选 Code-Review /
  Verified 分值、写评审说明，二次确认后一次性发布到 Gerrit（`POST .../review`）
* 选中代码直接操作：在 Diff 里**拖选代码文字**，松手即弹出「评论这几行 / 引用给 AI」
* 按行选择：点行号可直接开评论；拖拽或 Shift+点击行号可扩选，范围评论用 Gerrit 的
  `range`（`start_line/end_line` + 末行字符跨度）
* AI 审查：为每个 change 创建一个（并记住）普通 DSH Session，内嵌在右侧面板中，
  可以把变更整体、单个文件或单行引用进该会话的输入框，也可以一键让它开始评审
* AI 窗口可拖动左边框调整宽度（双击复位，方向键微调），标题栏按钮可最大化 /
  还原；宽度记在本地
* 审查会话的落点可选：AI 面板顶部的「工作区」下拉选择新建会话所在的工作区
  （会话会出现在该工作区的会话列表里），选择会记住；不选时自动用当前会话目录

## 结构

* `index.js` — Host 半边：在 Harness web server 上注册 `/gerrit-workbench/api`
  （`prefix` 资源路由，拒绝跨站来源）与写路由，暴露 `gerritWorkbench` 服务。
* `gerrit.js` — 与框架无关的 Gerrit REST 客户端与归一化逻辑（凭据发现、TTL 缓存、
  diff 行模型）。`node dev/smoke.mjs` 可以直接跑它。
* `client.js` — 浏览器半边：`sidebar.panellist` 入口、`main` 面板、
  `gerrit.ai.session`（session 作用域）会话面板、`plugins.bundle.config` 配置页。
  Diff 的行高亮使用主题自带的 `--shiki-token-*` 调色板，自动跟随浅色/深色主题。
* `locale/en.json`、`locale/zh.json` — 插件管理页显示的标题与描述。

## 工作区

AI 面板顶部有一行「工作区」下拉：

* `自动 · <名字>`：当前会话所在目录 → `reviewCwd` → 第一个 Workspace → `defaultCwd`
* 任意 Workspace：用 `sessions.create({ workspaceId })` 创建，会话会归属该工作区
* `配置目录 · <名字>`：`reviewCwd` 非空时出现的固定目录

选择存进 `localStorage`（`dsh.gerrit-workbench.target.v1`）。已经存在的会话不会被搬动：
切换后点「新会话」按新目标重建（或对下一个 change 生效）。

## AI 会话是怎么拉起来的

1. 首次点击「开始 AI 审查」时，用 `ctx.sessions.create({ cwd })` 在 Host 上创建一个
   普通 Session（沿用当前 Session 的工作目录），并把它记在 `localStorage`
   （key `dsh.gerrit-workbench.review-sessions.v1`，按 Gerrit URL + change 号索引）。
2. 用 `ctx.sessions.retain()` 持有它，交给 `SessionProvider` 渲染
   `gerrit.ai.session`，面板里就是完整的 Conversation（含输入框、工具调用、
   中断按钮），并不是一个简化版聊天框。
3. 「AI 审查整个变更 / 这个文件」先把要审查的文件（最多 16 个、总计 80k 字符）
   的 diff 读进来，再通过 `conversation.send()` 把变更元信息、提交信息、文件列表和
   这些 diff 作为一条用户消息发进去。提示词明确要求 AI **不要**读取凭据文件、
   不要自己调用 Gerrit。
4. 行内「引用」按钮通过 `conversation.input.insertQuote()` 把
   `Gerrit <change> · <path>:<lines>` + 代码块放进该会话的输入框，不会直接发送。
5. **审查会话默认按补丁集绑定**：存储键是 `change@patchSet`，切换补丁集时右侧面板
   自动切到该补丁集的会话；该补丁集还没有会话时面板回到「开始 AI 审查」。
   旧版本按 change 存的会话会在首次打开时迁移到当前补丁集。把 `sessionMatch`
   改成 `change` 后，键变成 `#change`，同一个 change 的所有补丁集共用一个会话
   （切换补丁集不再收面板）；两种键都会写入，所以来回切配置不会丢已在跑的会话。
6. 左侧栏再次打开工作台、或重新加载页面后，同一个 change + 补丁集复用原来的审查会话；
   「新会话」只丢弃当前补丁集的映射并重建。

## 诊断

* `GET /gerrit-workbench/api/diag` 返回浏览器上报的最近 60 条生命周期事件
  （`page-mounted`、`session-surface-mounted`、`render-error`）。页面渲染异常时，
  错误边界的消息也会落到这里，方便在没有浏览器控制台的情况下定位问题。
* `GERRIT_URL=https://gerrit.example.com node dev/smoke.mjs` 直接用 Node 验证
  Host 侧的 Gerrit 客户端（列表 / 详情 / diff）。

## 语法高亮的两个坑（已修）

* 折叠行不会丢状态：高亮对**完整行列表**做一次词法扫描（而不是只扫可见行），
  这样「注释在可见行打开、在折叠区关闭」不会把后面的 `#ifdef` 续成注释。
  Host 侧截断的大文件在折叠标记处重置注释状态。
* `#ifdef` 只在行首且**不在**注释里时按预处理指令着色；注释里的 `#ifdef` 仍是注释。

`node dev/tokenizer.mjs` 覆盖了这两条以及字符串里的 `/*`、行注释、数字、关键字等用例。

## 位置与开关

* 工具栏最左：`☰` 显示 / 隐藏变更列表（收起后 Diff 占满宽度，可再点开）
* 详情头部：「对比」选择基线；「回复」打开发布面板；右上角在 Gerrit 中打开
* AI 面板标题下：工作区选择；面板内工具条：最大化 / 还原、新会话、收起；
  拖动面板左边框调整宽度（双击恢复默认宽度）

## Diff 操作对照

| Gerrit 网页 | 这里 |
| --- | --- |
| 折叠处「+10 above / Show 612 common lines / +10 below」 | 折叠行左右两侧各展开 20 行，中间展开全部；Shift+点击一次展开全部 |
| 文件菜单「Show whole file」 | 文件头「⤢」按钮 / 工具栏「完整文件」 |
| 「Diff against: parent / patch set N」 | 详情头部「对比」下拉 |
| 「Reviewed」勾选 | 文件头「已审阅」复选框（本地记忆） |
| 并排 / 统一切换、显示文件列表 | 工具栏三个按钮 |
| 点行号写 inline comment | 点行号 → 内联编辑框 →「存为草稿」 |
| 选中代码 → 评论 / 引用 | **直接拖选代码文字** → 浮条「评论这几行 / 引用给 AI」；只取所选代码行 |
| 拖拽 / Shift+点击选多行评论 | 选行 → 文件头「评论这几行」/「引用给 AI」；范围评论带 `range` |
| Reply 面板（打分 + 说明 + Post） | 详情右上「回复」→ 选 Code-Review / Verified、写说明、「发布评审」二次确认 |
| 删除草稿 | 草稿评论右侧「删除」，或在回复面板里删 |
| 已发布的评论 | 行下方显示（作者/时间/未解决标记） |

## 发布评审（写入 Gerrit）

* 多行评论在提交时换算成 Gerrit 的 `range`（`start_line`/`end_line` 与末行字符跨度），
  与网页版「选中多行再评论」等价；纯删除行的选区会锚到 `PARENT` 侧。
* 行内评论先存在浏览器里（`dsh.gerrit-workbench.drafts.v1`，按 change + 补丁集），
  点「回复」后才一次性提交，未发布前不会碰到 Gerrit。
* 发布走 Host 的写路由 `POST /gerrit-workbench/write/review`，Host 再调
  `POST /changes/{id}/revisions/{rev}/review`（Gerrit 网页用的同一个 ReviewInput：
  `message` + `labels` + `comments`），并带上 `tag: dsh-gerrit-workbench`；
  写路由同样做同源校验、只接受 POST、body 上限 1 MB。
* 发布需要二次确认（按钮变成「确认发布」，6 秒后回退），空评审不会被提交。
* 发布成功后清空草稿、刷新变更（投票、消息、评论）。

## 已知边界

* 不支持提交 / 弃置 / 打分之外的变更操作（abandon、submit、rebase、set-topic 等）。
* 发布后无法从本插件撤回（Gerrit 3.2 没有删除评论的 REST 接口）。
* 超过 4000 行的 Diff 由 Host 先折叠为「改动附近 3 行 + 标记」；点该标记会
  重新请求完整行。
* AI 审查是普通 Session，因此会出现在左侧会话列表里（未归入 Workspace）。

## 开发

```bash
npm run check                 # node --check 三个源文件
npm test                      # 纯离线的单元检查（dev/*.mjs）
GERRIT_URL=https://gerrit.example.com node dev/smoke.mjs
```

## License

MIT © penghui ding
