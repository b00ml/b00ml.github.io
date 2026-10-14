# AGENTS.md

peik1 的个人博客：全静态的 Astro 5 站点，中文写作，面向国内技术同行与潜在雇主。
仓库公开在 https://github.com/b00ml/blog，直接上游是 https://github.com/joyehuang/blog（Apache-2.0）。

## 先跑起来

包管理器是 Bun 1.3.10，由 `package.json` 的 `packageManager` 钉死。

`bun.lock` 是唯一被验证过的依赖树，用 `bun install --frozen-lockfile` 装它。换 npm/pnpm 会按浮动范围
解出一批漂移版本（astro 5.8.1→5.18.2、unocss 66.1.3→66.11.0、zod 3.24.2→4.6.7），构建直接失败。

命令都在 `package.json`，日常用到的是 `bun dev` / `bun run build` / `bun run check` / `bun test`。

## 两个会浪费你半天的坑

**`bun run build` 必须先清 Astro 内容缓存。** Astro 5 把内容集合条目缓存进
`node_modules/.astro/data-store.json`，源文件删掉后它不剔除对应条目——构建会继续产出那个页面，
不报错、不告警、退出码 0。`scripts/clean-content-cache.mjs` 专门做这件事，已经接在 `build` 前面，
别绕过它。验证一次删除干不干净，看**路由清单和页面数**，不要 grep `dist/`：字符串扫描只能发现残留，
发现不了多出来的页面。

**`trailingSlash` 是 `'never'`。** 文章 URL 是 `/blog/<slug>`，没有结尾斜杠；改它要连带改 canonical
和站内链接。

## 结构

- `src/pages/` 路由 · `src/layouts/` 页面骨架 · `src/components/` 组件
- `src/components/pure/` 是从 `astro-pure` 就地 vendor 的组件。包里的 barrel 会顺带导出评论组件，
  深层 import 会被 exports map 拒绝，所以只能这样拿
- `src/content/{blog,notes,product}/` 三个集合，共用 `src/content.config.ts` 里同一份 frontmatter schema
- `src/lib/seo/` 草稿可见性、分区与分页元信息、sitemap 的 lastmod
- `src/assets/styles/app.css` 是颜色的唯一来源，`uno.config.ts` 把它映成语义化类名
- 设计约定见 `DESIGN.md`

## 内容

文件名即 slug，例如 `20261014-astro-blog-first-look.md`。frontmatter 必填 `title`、`description`、
`pubDate`，可选 `updatedDate`、`tags`、`draft`、`cover`。

三个集合按**主题**分，不按长度：Product 收产品类的拆解与取舍，Blog 收其余完整长文，
Notes 收短、快、可以未完成的记录。

## 规范

TypeScript 写逻辑，Astro 写页面。提交信息用 Conventional Commits。
格式沿用仓库现有风格——两空格缩进、单引号、无分号、100 列、import 排序，`bun run format` 会替你处理。
测试放在被测代码旁边，命名 `*.test.ts`，用 `bun:test`。

`main` 目前不会自动部署。接上部署平台之后它就是生产分支，那之后改动走 feature 分支 + PR。

## 边界

站点是**全静态**的，构建产物里没有任何服务端路由。v1 不做评论、不做浏览量统计、不做中英双语，
这三条是已经定过的取舍；理由和将来要加时的入口写在 `docs/analytics.md`。

提交前让 `bun run build` 和 `bun test src/` 都过。
