---
name: blog-essay
description: >-
  Use when writing any post for this repo's blog / product / notes sections:
  essay components (TL;DR callout, mark highlighter, pull quote, reply cards,
  numbered steps, bordered tables, animated inline-SVG figures) authored as
  markdown inside src/content, styled by the site theme itself. Includes the
  MDX compatibility rules the RSS pipeline enforces and the build-QA checklist.
  Not for standalone HTML pages and not for slides.
---

# Skill: blog-essay（本仓库文章写作）

设计系统已移植进站点主题：组件 CSS 在 `src/assets/styles/app.css` 的
"Essay components" 段，滚动动画在 `src/components/essay/FigAnim.astro`（已挂进
`ContentLayout`）。所以**写文章 = 写 markdown 进内容集合**，正文里嵌固定的 HTML
组件骨架，不要产出独立 HTML 页面。（交互图类附件另有先例：`public/diagrams/`
+ iframe。）

设计源头：tokens 取自 joyehuang.me（Astro "Pure" 主题），编排技法改编自
Thariq Shihipar 的 html-plan（MIT / Apache-2.0），已全部换成本站 token。

## 1. 选栏目、建文件

| 栏目 | 定位 | 路径 |
| --- | --- | --- |
| blog | 想清楚的事，一篇一个论点 | `src/content/blog/YYYYMMDD-slug.md` |
| product | 产品思考、方法论整理 | `src/content/product/…` |
| notes | 随手记、读书笔记 | `src/content/notes/…` |

frontmatter 必填 `title / description / pubDate`，可选 `tags / draft / cover`。
阅读时长由 `remark-reading-time` 自动计算，不要手写。活例子：
`src/content/blog/20261102-agent-eval-practice.md`。

## 2. 正文骨架

1. **引导块**（站点惯例）：`>` 引用一行，放来源链接和一句话框架。
2. **TL;DR callout**（必须整块写成一行，见 §4）。
3. 章节 `## 01 · 标题`（编号进标题文本，ToC 会显示）；小节用 `###`。
4. 结尾可以落回自己的项目与实践（Ark 知识工作台、英语内容工作台、财务审核
   Agent、G0 门禁），只用站内已写过的事实。

写作守则：第一人称，诚实，具体数字注明出处；**从不编造事实、数字、引文、链接**；
引用原文一字不改。

## 3. 组件骨架（复制即用，样式已在主题里）

TL;DR callout（⚠️ 整块必须单行）：

```html
<div class="callout"><span class="lbl">TL;DR</span><p>结论。<span class="mark">最关键的一处。</span></p></div>
```

荧光笔 `<span class="mark">…</span>`：每页最多两处。放大引言：

```html
<p class="pull">一句值得放大的话。</p>
```

引用卡（quotes/对照）：

```html
<div class="replies">
<figure class="reply"><blockquote>引用原文，一字不改。</blockquote><figcaption><span class="tag pro">标签</span><span class="who">来源</span>：一句话点评。</figcaption></figure>
</div>
```

编号步骤卡：

```html
<ol class="steps">
<li><strong>要点一。</strong>说明。</li>
<li><strong>要点二。</strong>说明。</li>
</ol>
```

表格卡（首列自动加粗不折行；列多时加 `wide`，卡片内横向滚动）：

```html
<div class="table-wrap"><table>
<thead><tr><th>列</th></tr></thead>
<tbody><tr><td>值</td></tr></tbody>
</table></div>
```

SVG 动图（配色一律用 token：`var(--primary)` / `hsl(var(--foreground))` 等，
**不写死颜色**；暗色由站点 token 自动切换）：

```html
<figure class="fig" data-anim>
<svg viewBox="0 0 720 230" role="img" aria-label="一句话描述">
<defs><marker id="ahN" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1L9 5L0 9z" style="fill:var(--primary)"/></marker></defs>
<g class="rise" style="--at:0s"><rect class="s-node" x="40" y="70" width="160" height="64" rx="10"/><text class="t-ink" x="120" y="108" text-anchor="middle">输入</text></g>
<g class="rise" style="--at:.35s"><path class="s-acc draw" pathLength="1" style="--at:.3s" d="M200 102H276" marker-end="url(#ahN)"/></g>
<circle class="s-pkt flow" r="5" style="--at:1.2s;offset-path:path('M200 102H520')"/>
</svg>
<figcaption><span><b>图 1</b>读者该从图里看出什么；非真实数据注明「示意图」。</span><button class="replay" type="button">重播</button></figcaption>
</figure>
```

图内约定：viewBox 宽 720；形状 `.s-node` `.s-node-acc`，线 `.s-ink` `.s-acc`
`.s-dim`，文字 `.t-ink` `.t-dim` `.t-acc`；动画类 `.draw`（配
`pathLength="1"`）`.rise` `.fade` `.flow`，用 `style="--at:.35s"` 阶梯错峰；
每图 figcaption 说明该看什么。**动画由 FigAnim 自动接管，不要自己写 JS。**
每页一个 marker id 前缀（`ahN` 的 N 递增），避免多图 marker 冲突。

## 4. ⚠️ Astro 组件规则

`.astro` 组件里**标签之外的任何字符都会被渲染成页面内容**——JSDoc 注释写在
`<script>` 前面，就会原样打印到每篇文章底部。组件说明一律放进 script 内部的
JS 注释。

## 5. ⚠️ MDX 兼容规则（最重要的经验）

RSS 管线（`src/pages/rss.xml.ts`）用 **remarkMdx** 解析文章正文，违规写法会让
RSS 静默缺失（构建只给一行 warning）。规则：

1. callout 整块**单行**；
2. SVG 里每个元素**开闭同行**（`<g>…</g>` 合成一行），或者开标签**独占一行**
   且行内无任何子内容；
3. 违规形态 = 「开标签行带有子内容、元素又跨行」，例如
   `<g class="rise"><text>x</text>` 换行继续 ❌；
4. 引入任何新 HTML 模式前，先用 remarkMdx 单独跑一遍验证（三行脚本），再入库。

## 6. QA（发布前必做）

1. 构建：`node scripts/clean-content-cache.mjs && npx astro build`；finance-demo
   子应用用 `~/.bun/bin/bun run --cwd apps/finance-demo build`（bash 里 bun 不在
   PATH，用全路径）。
2. 预览：`cd dist && python -m http.server 8438`。
3. Playwright 390 / 1280 × 亮暗。暗色 = `localStorage.setItem('theme','dark')`
   后刷新（站点用 `.dark` 类 + HSL token，key 与独立页相同）。
4. 检查清单：无横向滚动；390 下 SVG 文字不出框、不互相压盖；动画滚过之后终态
   正确、重播可用；`/blog` `/product` `/notes` 列表收录；只有 blog 进 `/rss.xml`。
5. 现成脚本：`../_drafts/qa/qa-site.py`（改顶部 `PAGES` 数组即可复用）。

## 7. 身份与页脚

站点页头/页脚由主题渲染（peik1 ↔ b00ml.github.io），正文里**不要**再写独立
header/footer/版权行。
