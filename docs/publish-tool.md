# 入库与发布

这份文档给下一个 agent：只读这一份，就能把一篇源笔记入库、发布，并知道哪里必须停下来问人。原来的手工流程
`docs/publish-workflow.md` 已被本文取代，那份现在只是指向这里的入口。

用词按 [`GLOSSARY.md`](../GLOSSARY.md)：**源笔记**是 Obsidian 库里的原始笔记；**入库**把它变成
`src/content/<collection>/` 下的**文章**；**发布**把工作区的文章变成线上页面。**计划**是两条命令默认打印的
动作清单；**确认点**是计划打印出来、等人决定是否 `--apply` 的时刻，一次完整发布只有一个确认点。

两条命令都默认只读。不加 `--apply`，`ingest` 不写文件，`publish` 不构建、不提交、不推送。正常输出时
stdout 只有一个 JSON 文档，进度和错误在 stderr，退出码表示停在哪一步；`--help` 是唯一不输出 JSON 的情况。

## 前置条件

- 从仓库根目录运行。`src/content`、`src/assets`、`docs/...` 都是相对路径，换目录会找不到文件。
- Bun 1.3.10，由 `package.json` 的 `packageManager` 钉死。依赖用 `bun install --frozen-lockfile`，不要用
  npm/pnpm。
- Node 24（本仓库验证 24.19.0）。`scripts/ingest.mjs` / `scripts/publish.mjs` 用 `node` 直接 import
  `.ts`；Node 20 不支持这种类型剥离。
- `git` 可用，`origin` 指向 `b00ml/b00ml.github.io` 的 GitHub 地址（`https://github.com/...` 或
  `git@github.com:...`）。`publish` 从 `origin` 解析仓库；本地路径 remote 会以 3 退出。
- 发布 `--apply` 需要 `gh` 已登录（`gh auth status`），且 `deploy.yml` 在 `main` 上。否则会在等部署时以 8
  退出。
- 源笔记是 UTF-8 Markdown。本地图片放在笔记同目录、同目录的 `attachments/`、或 Obsidian 库根目录（含
  `.obsidian` 的目录）。
- `ingest --apply` 要求工作区干净：任何未提交改动（包括源笔记本身在仓库里且未提交）都会以 3 退出。
- `publish` 要求改动只在允许路径（见下文「发布」）。`publish --apply` 只从 `main` 执行；在 ticket 分支上
  可以入库并手工提交，但不能用工具发布。

## 入库

```
bun run ingest <源笔记路径> --collection <blog|notes|product> --slug <英文短名> --description <一句话摘要> [--apply]
```

语法上 `--slug` / `--description` 可以省略，最终值合法就行：`--slug` 缺省时由 title 派生，`description`
缺省时依次取源笔记 frontmatter 和正文 H1。但中文标题派生出的 slug 一定不合法；源笔记没有 frontmatter
description、正文 H1 又不能当候选时，也没有可回退值。这两种情况必须显式给参数，否则 `--apply` 以 2 退出。

| 参数            | 必填               | 作用                                                 |
| --------------- | ------------------ | ---------------------------------------------------- |
| `<源笔记路径>`  | 是                 | 要入库的 Markdown；相对路径按当前目录解析            |
| `--collection`  | 是                 | `blog` / `notes` / `product`，决定目标目录；工具不猜 |
| `--slug`        | 派生不合法时必填   | 英文短名；只允许 `a-z0-9-`，不以 `-` 开头或结尾      |
| `--description` | 源笔记无摘要时必填 | 一句话摘要；列表页、搜索、SEO 都用它，工具不编造     |
| `--apply`       | 否                 | 写盘；省略时只打印计划                               |
| `--help` / `-h` | 否                 | 打印用法并退出 0                                     |

`--collection` / `--slug` / `--description` 也接受 `--flag=value` 形式。最终 slug 是
`<YYYYMMDD>-<短名>`，日期前缀取自 `pubDate`；加前缀后不能超过 80 字符，所以短名最多 71 字符。文章 URL 是
`https://b00ml.github.io/<collection>/<slug>`，没有结尾斜杠。

`--slug` 只给短名，不要带日期：`--slug 20261018-foo` 会得到 `20261018-20261018-foo`。

### 计划长什么样

```json
{
  "mode": "plan",
  "status": "planned",
  "plan": {
    "source": { "path": "E:\\...\\README.md", "sha256": "3e0676...", "bytes": 2613 },
    "article": {
      "collection": "product",
      "slug": "20261018-finance-poc",
      "targetPath": "src/content/product/20261018-finance-poc.md",
      "exists": false
    },
    "fields": {
      "title": { "value": "启衡精密 AI 财务提效 POC：现状文档", "source": "h1" },
      "description": { "value": "启衡精密 AI 财务提效 POC 的现状说明。", "source": "cli" },
      "tags": { "value": [], "source": "missing", "items": [] },
      "pubDate": { "value": "2026-10-18", "source": "today" },
      "slug": { "value": "20261018-finance-poc", "source": "cli" }
    },
    "body": {
      "h1": {
        "found": true,
        "text": "启衡精密 AI 财务提效 POC：现状文档",
        "equivalentToTitle": true
      },
      "preview": "（删掉第一个 H1 后的正文全文）"
    },
    "images": [],
    "warnings": [
      {
        "code": "title-fallback",
        "message": "标题不是来自 frontmatter，而是取自正文 H1：...；入库前请确认这个措辞就是要用的标题。"
      }
    ],
    "commit": { "message": "content: publish 20261018-finance-poc" }
  }
}
```

`body.preview` 是真正要写进文章的正文全文，不是摘要；长笔记会让 stdout 很大，解析字段，别整段打印。
`images` 里本地图片有 `bytes` / `sha256`，远程图片没有。`commit.message` 是给后面的发布用的，`ingest`
自己不提交。

目标文章已存在时，`article.mode` 是 `"update"`，`body.diff` 是多行 unified diff；`--apply` 直接覆盖目标
文件，不额外提问。目标可以是 `.md` 或 `.mdx`。

### 更新还是新文章

slug 决定目标路径。slug 由 `--slug` 或 title 派生，再拼上 `pubDate` 的日期前缀，所以：

- 同一个 slug → 更新，覆盖旧文章。
- title 变了且没给 `--slug` → slug 变，算新文章。想原地改标题，复用同一个 `--slug`。
- `created` / `date` 变了 → 日期前缀变，算新文章。想原地更新，保持日期不变。

更新时，被覆盖文章的标签不计入词表，避免它独有的标签被误判成「已有」。

### 退出码

| 退出码 | 含义                                  | 典型原因                                                                                                                                                    |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | 成功                                  | 计划打印完，或 `--apply` 写入完成                                                                                                                           |
| 2      | 参数、源笔记、附件、slug、description | 缺 `--collection`、未知集合、源笔记读不到、YAML 坏、附件找不到、附件越出笔记库、附件不是图片、slug 非法、description 缺失、`--description` 没有值、多余参数 |
| 3      | 工作区或源笔记状态不合规              | 工作区不干净、源笔记或附件在计划后变了、目标图片同名不同哈希、复制后校验失败                                                                                |
| 1      | 未预期异常                            | 代码或 IO 错误，不是正常路径                                                                                                                                |

失败时 stdout 是 `{"mode":"plan","status":"failed","error":{"step":"usage|workspace|internal","message":"..."}}`。
`step` 说明停在哪一类；先看它再决定补参数还是清工作区。

### 告警

告警本身不阻断计划。只有 `slug-not-valid` 和 `missing-description` 会让 `--apply` 以 2 退出。

| code                    | 何时                                     | 要不要管                                               |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------ |
| `title-fallback`        | title 来自 H1 或文件名，不是 frontmatter | 确认这个措辞就是要用的标题                             |
| `no-h1`                 | 正文没有 H1                              | 不用管；没有可删的标题                                 |
| `h1-differs`            | 正文 H1 与 title 不同，已删除            | H1 文本会成为 description 候选；确认或改写             |
| `slug-not-valid`        | 最终 slug 非法                           | 必须用 `--slug` 给英文短名，否则 `--apply` 拒绝        |
| `missing-description`   | 最终 description 为空                    | 必须用 `--description` 给一句摘要，否则 `--apply` 拒绝 |
| `tag-not-in-vocabulary` | 每个不在站内词表里的新标签               | 确认后合法；新标签可能新增标签页                       |
| `remote-image`          | 正文里有远程图片                         | 保留原地址，确认可访问                                 |
| `third-party-image`     | 远程图片不在 `b00ml.github.io` 域名下    | 注意版权和防盗链                                       |

## 发布：文章 → 线上

```
bun run publish [--apply]
```

没有业务参数，只接受 `--apply` / `--help` / `-h`。默认只打印计划，不构建、不提交、不推送；`--apply` 才
执行。执行顺序：

1. 校验工作区和分支。
2. `bun run build`。
3. `bun run test`。
4. 有新改动就只暂存计划里的路径（`git add -A -- <计划路径>`）再提交；没有就跳过。
5. `git push origin main`。
6. 轮询这次提交的 `deploy.yml`，等 `Deploy to GitHub Pages` 完成。
7. 请求每个 `verifyUrls`，确认 200 且 `Last-Modified` 不早于这次部署。

任何一步失败就停在那一步，退出码对应阶段。

### 计划长什么样

```json
{
  "mode": "plan",
  "status": "planned",
  "plan": {
    "files": [
      { "path": "src/assets/my-first-note.png", "change": "added" },
      { "path": "src/content/blog/20261018-my-first-note.md", "change": "added" }
    ],
    "articles": [
      {
        "collection": "blog",
        "slug": "20261018-my-first-note",
        "change": "added",
        "url": "https://b00ml.github.io/blog/20261018-my-first-note"
      }
    ],
    "commit": { "message": "content: publish 20261018-my-first-note" },
    "verifyUrls": ["https://b00ml.github.io/blog/20261018-my-first-note"]
  }
}
```

`commit: null` 表示工作区干净、有待推送的提交：只推送，不再提交。`verifyUrls` 不含删除的文章。提交信息由
改动类型决定：新增文章 `content: publish <slug>`，只改文章 `content: update <slug>`，只删文章
`content: remove <slug>`，只改发布文档 `docs: update publishing docs`，其他情况
`content: update <文件名>`。

### 工作区规则

允许的路径只有：

- `src/content/blog/**`
- `src/content/notes/**`
- `src/content/product/**`
- `src/assets/**`
- `docs/publish-tool.md`
- `docs/publish-workflow.md`

其他一律拒绝，包括 `AGENTS.md`、`README.md`、`GLOSSARY.md`、`docs/adr/**`、`src/pages/**`、`package.json`、
`.github/**`。发布工具只发文章、资源和两个发布文档，不改规则或代码；这些改动走普通 git 提交，不要混进发布
提交。

`--apply` 只暂存计划里的 `files`，按新路径逐个交给 `git add`（重命名的原路径不再交给 git：`git status`
只在重命名已进入暂存区时才报 `R`，那时原路径既不在 index 也不在磁盘上，`git add` 会对它报 pathspec
不存在）。暂存后重读 `git status --porcelain`：提交必须恰好等于这份清单，重命名的两端都算清单内。计划里的
`files` 是完整清单，发布前确认没有别的半成品。

- 允许和不允许的改动混在一起 → 3，`error.files` 列出不允许的路径。
- 暂存区里出现计划外的路径（例如构建往工作区里写了文件）→ 3，`error.files` 列出这些路径，不产生提交。
- 工作区有冲突 → 3。
- 工作区干净且没有待推送提交 → 3 `工作区没有可发布的改动。`
- 工作区干净但待推送提交里有不允许路径 → 3。
- 当前分支不是 `main` → `--apply` 以 3 退出，计划模式不拦。
- `origin` 不是可解析的 GitHub 地址 → 3。

### 退出码

| 退出码 | 含义         | 说明                                                                                        |
| ------ | ------------ | ------------------------------------------------------------------------------------------- |
| 0      | 成功         | 计划打印完，或发布完成（含部署和线上校验）                                                  |
| 2      | 参数错误     | 未知参数；只接受 `--apply` / `--help` / `-h`                                                |
| 3      | 工作区不合规 | 冲突、路径不允许、暂存区有计划外路径、没有改动、非 `main`、`origin` 不是 GitHub、读不到状态 |
| 4      | 构建失败     | `bun run build` 非 0；没有产生提交                                                          |
| 5      | 测试失败     | `bun run test` 非 0；没有产生提交                                                           |
| 6      | 提交失败     | `git commit` 失败；改动还在工作区                                                           |
| 7      | 推送失败     | 网络拦截或远端拒绝；本地提交保留                                                            |
| 8      | 部署失败     | 取消、失败、卡住重跑一次后仍卡住、15 分钟没有 run                                           |
| 9      | 线上校验失败 | 10 分钟内仍有 404、HTTP 错误，或 `Last-Modified` 仍旧                                       |
| 1      | 未预期异常   | 代码或 IO 错误，不是正常路径                                                                |

失败时 stdout 是 `{"mode":"plan","status":"failed","error":{"step":"...","message":"..."}}`，`step` 是
`usage` / `workspace` / `build` / `test` / `commit` / `push` / `deploy` / `verify` / `internal` 之一。

### 部署与线上校验

`publish` 用 `gh run list --workflow deploy.yml --commit <sha>` 找这次提交的 run，再看
`Deploy to GitHub Pages` 这个 job。正常几十秒；卡在部署步骤超过 10 分钟会自动 `gh run rerun` 一次，再卡住
就以 8 退出。部署被取消、失败、或 15 分钟内没有 run，也是 8。

部署成功后，`publish` 对每个 `verifyUrls` 发 HEAD：必须是 200，且 `Last-Modified` 不早于这次部署开始。
404、其他 HTTP 错误、旧的 `Last-Modified` 都会每 5 秒重试；2 分钟后在 stderr 告警，10 分钟仍不满足就以 9
退出。删除的文章不在 `verifyUrls` 里，不会因为 404 而失败；没有 `verifyUrls`（例如只改发布文档）时跳过这
一步，部署成功就以 0 结束。

这个阶段只验证 HTTP 状态和 `Last-Modified`，不比对正文。退出 9 时先手工打开 URL 确认；线上已经是新内容就
不要再入库一遍，记录 URL，必要时用 `gh run list --commit <sha>` 找这次 run。

### 失败后怎么重跑

- **4 / 5（构建或测试）**：工作区没动，修好再 `bun run publish --apply`。
- **6（提交）**：改动还在工作区，检查 git 配置后重跑。
- **7（推送）**：本地提交保留。网络恢复后原样重跑 `bun run publish --apply`：工作区干净、提交未推送，计划里
  `commit` 是 `null`，只补推送并继续等部署。临时用代理可以
  `git -c http.proxy=http://127.0.0.1:7897 push`，但不要写进 git config；手工推送后部署和线上校验要自己看。
- **8（部署）**：提交已经推上去了，重跑 `publish --apply` 会因为没有改动以 3 退出。用
  `gh run view <id> --repo b00ml/b00ml.github.io` 看失败原因；Pages 卡死可以
  `gh run rerun <id> --repo b00ml/b00ml.github.io`，然后手工确认 URL。
- **9（线上校验）**：代码已经上线，只是校验没通过。手工确认 URL；确认没问题就结束，不要重复入库。

## 字段取值优先级

| 字段          | 取值顺序（前者优先）                                                 | 计划里的 `source`                              | 备注                                                                       |
| ------------- | -------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `title`       | frontmatter `title` → 正文第一个 H1 → 文件名去扩展名                 | `frontmatter` / `h1` / `filename`              | 不是 frontmatter 时产生 `title-fallback`                                   |
| `pubDate`     | frontmatter `created` → frontmatter `date` → 今天（本地时区）        | `frontmatter` / `today`                        | 只取日期部分；同时决定 slug 的日期前缀                                     |
| `description` | `--description` → frontmatter `description` → 与 title 不同的正文 H1 | `cli` / `frontmatter` / `h1-draft` / `missing` | `missing` 时计划只告警，`--apply` 拒绝                                     |
| `tags`        | 只取 frontmatter `tags`                                              | `frontmatter` / `missing`                      | 小写去重；逐条标 `existing` / `new`；新标签产生告警                        |
| `slug`        | `--slug` → 由 title 派生                                             | `cli` / `title`                                | 最终是 `YYYYMMDD-<短名>`；非法时计划告警，`--apply` 拒绝                   |
| 正文 H1       | 总是删除第一个 `# ` 标题                                             | —                                              | 与 title 等价（忽略标点、空白、大小写）直接删；不同则留作 description 候选 |

补充：

- `title`、`description` 的空字符串按缺失处理。
- `tags` 必须是 YAML 数组；写成单个字符串会以 2 退出（`frontmatter 的 tags 不是字符串数组`）。`tags` 的取值
  只来自 frontmatter，不来自 `--tags` 之类的参数。
- 正文只改写图片引用和第一个 H1。Obsidian callout、站内 `[[链接]]`、脚注等语法原样保留，需要人改写。
- 工具写出的 frontmatter 是 `title` / `description` / `pubDate`，以及非空时的 `tags`。源笔记的 `updated`、
  `status: draft`、`aliases`、`cover` 都不会进文章；要 `updatedDate` 或 `draft`，入库后手工补。

## 六个已知失败模式

1. **图片放错位置，RSS 构建失败。** 图片必须落在 `src/content/**` 或 `src/assets/**`，因为 `rss.xml.ts`
   的 glob 只覆盖这两处。放到 `public/` 等位置会报 `Unable to resolve RSS image: ...`，构建以 9 退出。
   `ingest` 会把本地附件复制到 `src/assets/`；手工搬运也放这里。
2. **删文章后旧页面还在。** Astro 5 把集合条目缓存在 `node_modules/.astro/`，glob loader 不会剔除源文件
   已消失的条目；构建可能继续产出旧页面，退出码还是 0。`bun run build` 已接
   `scripts/clean-content-cache.mjs`；`bun dev` 下需要重启。核对删除是否干净看路由清单和页面数，不要 grep
   `dist/`。
3. **`![[...]]` 不会自动变成图片。** 普通 Markdown 渲染器会把 Obsidian 双链原样输出成文字。`ingest` 会
   转换；手工写文章时必须自己写成 `![alt](../../assets/x.png)`。`ingest` 找不到附件时以 2 退出，不会写坏
   链接。
4. **多余 frontmatter 字段会被静默丢弃。** 旧文档说 schema 会拒绝多余字段，实测不会：未知键被剥离，构建
   照常成功。工具只写 `title` / `description` / `pubDate` / `tags`，所以 `updated`、`status: draft`、
   `aliases`、`cover` 都不会进文章。要 `updatedDate` 或 `draft`，入库后手工补。
5. **图片路径写错，构建直接失败。** `../../assets/...` 少一层、文件名拼错，都会报 `image-not-found`，构建以
   9 退出，不会静默出坏图。`ingest` 写盘前会解析并核对附件，找不到就以 2 退出；但入库后手工改路径仍会踩。
6. **推送被 `github.com:443` 拦截。** 校园网或代理没开时，`publish --apply` 以 7 退出，本地提交保留。网络
   恢复后原样重跑，它会只推送已有提交并继续等部署。临时用代理可以
   `git -c http.proxy=http://127.0.0.1:7897 push`，但不要写进 git config。

## 自动化边界

| 阶段          | 全自动                                                                                                     | 生成后确认                                                                            | 只能由人                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 源笔记 → 正文 | 解析 frontmatter、删第一个 H1、转换 `![[...]]` 和本地图片引用、复制/改名/SHA256/改写本地图片、保留远程图片 | 图片 alt（wiki 链接用文件名兜底）、多 H1 时后续 H1 的处理、图片文件名去中文后的可读性 | 事实、逻辑、段落完整性；第三方图片的版权与防盗链       |
| 字段          | title/pubDate 回退、slug 日期前缀与合法性校验、tags 小写去重与词表比对                                     | slug 英文短名、description 措辞、H1 候选是否可用、新标签是否接受                      | 选集合（blog/notes/product）、标题/摘要/标签的最终语义 |
| 发布          | 改动范围校验、构建、测试、提交信息、提交、推送、等部署、线上校验                                           | —                                                                                     | 是否 `--apply`（确认点）、处理推送/部署/校验失败       |

判断只发生在入库计划。发布没有可判断项：`publish --apply` 直接执行，不再问人；`publish` 的计划模式只用于
排查或重跑，不是第二个确认点。

## 一次完整流程

下面用一篇真实的源笔记举例。命令在仓库根目录、`main` 分支、PowerShell 下可直接跑。

```powershell
# 1. 计划：不写盘
bun run ingest "E:\peik1_books\Agent应用\个人项目\财务POC\README.md" --collection product --slug finance-poc --description "启衡精密 AI 财务提效 POC 的现状说明。"

# 2. 确认点：读 stdout 的 plan.fields / plan.body / plan.warnings
#    标题、摘要、slug、标签、集合都以这里为准；缺什么补什么

# 3. 入库：写盘
bun run ingest "E:\peik1_books\Agent应用\个人项目\财务POC\README.md" --collection product --slug finance-poc --description "启衡精密 AI 财务提效 POC 的现状说明。" --apply

# 4. 发布：从 main 执行；不再问人
bun run publish --apply
```

第 2 步是唯一确认点。第 3 步之后工作区里是允许的改动，第 4 步会构建、测试、提交、推送、等部署、校验。
第 4 步失败时按上面的「失败后怎么重跑」处理；不要重新入库同一条笔记，那会变成更新并覆盖正文。

只入库、暂时不发布时，手工跑 `bun run build`、`bun test src/` 和 `bun run check`。构建页数应比之前多出新文章
数 + 新增标签页数；`check` 应为 0 error。

## 依据

| 内容                         | 位置                                                      |
| ---------------------------- | --------------------------------------------------------- |
| 两条命令的参数与退出码       | `src/lib/ingest/command.ts`、`src/lib/publish/command.ts` |
| 入库计划与字段优先级         | `src/lib/ingest/plan.ts`                                  |
| 图片搬运、改名与告警         | `src/lib/ingest/images.ts`                                |
| 发布计划、提交信息、校验 URL | `src/lib/publish/plan.ts`                                 |
| 允许提交的路径               | `src/lib/publish/workspace.ts`                            |
| frontmatter schema           | `src/content.config.ts`                                   |
| 判断与机械的分工             | `docs/adr/0001-split-judgment-from-mechanics.md`          |
| 用词                         | `GLOSSARY.md`                                             |
