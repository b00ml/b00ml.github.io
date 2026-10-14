# peik1

个人博客与作品集，记录 AI Agent、软件工程与产品思考。全静态 Astro 5 站点，中文写作。

## 技术栈

- Astro 5 + TypeScript，`output: 'static'`
- UnoCSS（`presetMini` + `presetTypography`，没有完整的 Tailwind 调色板）
- Pagefind 站内搜索，构建期生成索引，不需要服务端路由
- Bun 1.3.10 —— `bun.lock` 是唯一被验证过的依赖树

## 快速开始

需要 Bun 1.3.10。

```shell
bun install --frozen-lockfile
bun dev              # http://localhost:4321

bun run build        # 产物在 dist/
bun run check        # astro-pure check + astro check
bun test src/        # bun:test
```

## 结构

```text
src/pages/           路由
src/layouts/         页面骨架
src/components/      组件；pure/ 是从 astro-pure vendor 来的
src/content/         blog · notes · product 三个集合
src/lib/seo/         草稿可见性、分区元信息、sitemap lastmod
src/assets/styles/   设计 token 的唯一来源
src/site.config.ts   站点标题、导航、搜索、灯箱等全局配置
```

## 写一篇

文件名就是 slug，URL 是 `/blog/<slug>`（`trailingSlash: 'never'`，没有结尾斜杠）。
三个集合共用同一份 frontmatter schema：

```yaml
---
title: 把博客当成一个产品来做
description: 一句话说明这篇文章
pubDate: 2026-10-14
tags: ['产品', '工程']
draft: false
---
```

集合按主题分而不是长度：Product 收产品类的拆解与取舍，Blog 收其余完整长文，Notes 收短、快的记录。

## 状态

功能完整，尚未部署。域名未定，`astro.config.ts` 的 `site` 仍是占位值 `https://peik1.example.com`，
它会影响 sitemap、RSS 和 canonical，上线前需要替换。

## 来源与许可

基于 [Astro](https://astro.build/) 与 [Astro Theme Pure](https://astro-pure.js.org/)，直接上游是
[joyehuang/blog](https://github.com/joyehuang/blog)（Apache-2.0）。本仓库在其基础上做了大幅删减：
只保留 Blog / Notes / Product / Projects / About 五个板块，去掉终端 dev mode、i18n、评论、统计和全部
服务端路由。许可证见 [LICENSE](./LICENSE)。

上游声明的"文章、图片、PPT、二维码和个人内容不属于模板授权范围"的内容已在本仓库中清除。
