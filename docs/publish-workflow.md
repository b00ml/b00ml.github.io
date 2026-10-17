# 发布流水线

记录一次真实发布里**实际执行**的步骤、判断和踩到的坑。目的是把它变成一个自动化工具（形式未定），所以这里写的是流程约束，不是代码。

## 输入

一次发布 = 一个 `.md` + 0..n 张图。当前来源是 Obsidian 库（`E:\peik1_books\...`），所以要处理的是 Obsidian 方言，不是纯 Markdown。

## 步骤

### 1. 读源文件，先识别方言

实际遇到的 Obsidian 特征：

- frontmatter 用的是 Obsidian 字段：`aliases` / `tags` / `created` / `updated` / `type` / `status`
- 图片用双链语法 `![[文件名.webp]]`
- 正文第一行常有一个自己的 `# 标题`

### 2. 内容检查（机器做不了的部分）

- 事实、逻辑、有没有没写完的段落
- **正文 H1 是否与 `title` 重复** → 删正文 H1。页面布局已经把 `title` 渲染成 `<h1>`，留着会变成两个 h1：伤 SEO，也让目录多一条根节点
- 图片有没有 `alt`

### 3. 字段映射

| Obsidian           | 站点 schema   | 处理                                                     |
| ------------------ | ------------- | -------------------------------------------------------- |
| `title`            | `title`       | 直接取                                                   |
| —                  | `description` | **必填**，必须生成一句话摘要（列表页、搜索、SEO 都用它） |
| `created`          | `pubDate`     | 取日期部分，`YYYY-MM-DD`                                 |
| `updated`          | `updatedDate` | 可选                                                     |
| `tags`             | `tags`        | 需人工决定语言和粒度；写入后自动小写去重                 |
| `status: draft`    | `draft`       | `true` 则不进生产构建                                    |
| `aliases` / `type` | —             | **丢弃**。schema 不认识多余字段，会校验失败              |

### 4. 文件名就是 slug

`<YYYYMMDD>-<英文短名>.md`，例如 `20261017-personal-context-assets.md`。

中文标题不能直接当 slug，必须另起一个英文短名。URL 是 `/<collection>/<slug>`，无结尾斜杠。

### 5. 图片

1. 复制到 `src/assets/`，重命名为不含中文和时间戳的名字（`context-assets-flywheel.webp`）
2. 复制后校验 SHA256，确认字节一致
3. 正文引用改成相对于**文章所在目录**的路径：`src/content/blog/` 往上两级，即 `../../assets/<name>.<ext>`
4. 可用格式：`jpeg/jpg/png/gif/webp/avif/svg`

### 6. 改写正文

删正文 H1、替换双链图片引用、给图片补 `alt`、确认图片前后有空行。

### 7. 验证（不能省）

- `bun run build` → 页数 = 原页数 + 1（每篇文章）+ 每个**新标签** 1 个标签页
- 新页面存在；`<img>` 带 `class="zoomable"`（灯箱自动生效）且 `src="/_astro/<name>.<hash>.<ext>"`
- `dist/rss.xml` 里图片是 `https://b00ml.github.io/_astro/...` **绝对**地址（相对路径在阅读器里会坏）
- `bun run check` 0 error；`bun test src/` 全过

### 8. 提交与推送

Conventional Commits，消息用英文。推送后 GitHub Actions 构建部署，约 2–3 分钟。

## 已知失败模式

1. **图片放在 `src/content/**`之外会让 RSS 构建失败。** 原来`rss.xml.ts`只 glob 了`blog/`目录下的图片，现在已扩到`/src/content/**`+`/src/assets/**`。改回去就会复发，症状是 `Unable to resolve RSS image: ...`且`script "build" exited with code 9`。
2. **删文章后 `dist` 里页面还在。** Astro 5 把集合条目缓存在 `node_modules/.astro/`，glob loader 不会剔除源文件已消失的条目。`bun run build` 已挂 `scripts/clean-content-cache.mjs`；`bun dev` 下需要重启。
3. **Obsidian 双链 `![[...]]` 不会被渲染成图片**，会原样输出成文字。
4. **多余 frontmatter 字段** → schema 校验失败，构建中断。
5. **图片路径写错 → 构建直接失败**（`image-not-found`）。不会静默产出坏图，这是好事，但意味着路径必须精确。
6. **推送依赖 `github.com:443`。** 校园网会拦；Clash 开着时用 `git -c http.proxy=http://127.0.0.1:7897 push`，且不要把代理写进 git config。

## 自动化边界

| 能完全自动化                                                              | 需要人或有判断的模型             | 只能由人做     |
| ------------------------------------------------------------------------- | -------------------------------- | -------------- |
| 字段映射、文件名生成、图片搬运与重命名、H1 删除、引用改写、构建验证、提交 | `description`、`tags`、slug 语义 | 内容本身的判断 |

`description` 和 `tags` 是最值得先做成"生成 + 人工确认"的两项，因为它们必填、且错了会直接显示在列表页上。
