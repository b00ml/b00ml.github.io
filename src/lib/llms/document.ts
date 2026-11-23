import { formatDateYmd, type ArticleEntryInput } from '../curation/home'
import { buildProjectCards, type ProjectCardItem, type ProjectEntryInput } from '../projects/cards'
import { STATUS_LABELS } from '../projects/status'

/**
 * Everything `/llms.txt` is allowed to say. The endpoint owns the content
 * collections; this module owns the text, so the whole document is assertable
 * without a build.
 *
 * Notes are deliberately absent: the index exists to point a reviewer at the
 * evidence, and short dated records are not evidence of anything.
 */
export type LlmsInput = {
  /** Absolute site origin, e.g. `https://b00ml.github.io`. */
  siteUrl: string
  projects: readonly ProjectEntryInput[]
  blog: readonly ArticleEntryInput[]
  product: readonly ArticleEntryInput[]
  isProd: boolean
}

const SUMMARY = '受控 AI Agent 工程师：把「最小权限、确定性前置、可追溯可回滚」做进真实业务流程。'

/**
 * The one paragraph the whole site exists to make: the security degree is not
 * a detour from the Agent work, it is where the design rules come from.
 */
const POSITIONING = [
  '我是 peik1，产品工程师（产品设计 × AI 应用工程落地），网络空间安全专业出身。',
  '',
  '专业训练留下的不是攻防技巧，而是四条默认设置：系统边界要显式、最小权限、确定性校验前置、每次写入可追溯且能回滚。',
  '',
  '它们被原样搬进了 AI Agent 工程：规则先于模型，外部副作用必须人工确认，状态按账本分开记录，用事后回滚替代事前审批。',
  '',
  '下面三个系统不是三个玩具，而是同一条主线在三种业务上的落地：一个个人上下文底座、一条教研出题流水线、一套财务审核工作台。'
]

/** Article date plus its own URL, newest first. Shared by the listings below. */
function toArticleLine(entry: ArticleEntryInput, pathPrefix: string, siteUrl: string): string {
  const slug = entry.id.replace(/\.(md|mdx)$/i, '')
  const url = new URL(`${pathPrefix}/${slug}`, siteUrl).href
  return `- [${entry.data.title}](${url}) · ${formatDateYmd(entry.data.pubDate)} — ${entry.data.description}`
}

/**
 * Exactly the author-marked essays, not the homepage's four slots.
 *
 * The homepage backfills unmarked articles so its section never looks empty; a
 * document that advertises itself as the curated set cannot borrow that
 * behaviour, or an ordinary article would be presented as a selected one.
 */
function selectFeaturedWriting(input: LlmsInput): string[] {
  return [
    ...input.blog.map((entry) => ({ entry, prefix: '/blog' })),
    ...input.product.map((entry) => ({ entry, prefix: '/product' }))
  ]
    .filter(
      ({ entry }) =>
        Boolean(entry.data.featured) &&
        !entry.data.hideFromHome &&
        (!input.isProd || !entry.data.draft)
    )
    .sort((a, b) => {
      const orderA = a.entry.data.featuredOrder ?? Number.POSITIVE_INFINITY
      const orderB = b.entry.data.featuredOrder ?? Number.POSITIVE_INFINITY
      if (orderA !== orderB) return orderA - orderB
      const dateDiff = +new Date(b.entry.data.pubDate) - +new Date(a.entry.data.pubDate)
      return dateDiff !== 0 ? dateDiff : a.entry.id.localeCompare(b.entry.id)
    })
    .map(({ entry, prefix }) => toArticleLine(entry, prefix, input.siteUrl))
}

/**
 * One project as a reader of the site meets it: what it is, the numbers that
 * back the claim, and every link the author hung on it.
 *
 * Links are passed through instead of being re-derived from a fixed
 * demo/diagram shape: which artefacts exist is a fact about each project, so a
 * project that has not published a demo yet must not be described as if it had.
 */
function projectBlock(card: ProjectCardItem, siteUrl: string): string[] {
  // One absolute URL, used as both label and target: a reader can copy it and a
  // tool can follow it without resolving anything relative.
  const linkLine = (label: string, href: string) => {
    const url = new URL(href, siteUrl).href
    return `- ${label}：[${url}](${url})`
  }
  const meta = [STATUS_LABELS[card.status], card.period, card.role].filter(Boolean).join(' · ')

  return [
    `### ${card.title}`,
    '',
    `${card.summary}（${meta}）`,
    '',
    ...card.highlights.map((item) => `- ${item}`),
    linkLine('详情页', card.href),
    ...card.links.map((link) => linkLine(link.label, link.href)),
    ''
  ]
}

/**
 * The plain-text index handed to an AI assistant: who the author is, the three
 * systems worth reading, the curated essays, and how to reach them.
 *
 * Drafts drop out in production through the same rules the site itself uses, so
 * a preview build cannot leak an unpublished entry into a crawler-readable file.
 */
export function buildLlmsTxt(input: LlmsInput): string {
  const projects = buildProjectCards(input.projects, { isProd: input.isProd })
  const featured = selectFeaturedWriting(input)

  const lines = [
    '# peik1 · 受控 AI Agent 作品集索引',
    '',
    `> ${SUMMARY}`,
    '',
    '## 作者定位',
    '',
    ...POSITIONING,
    '',
    `站点首页：${new URL('/', input.siteUrl).href}`,
    '',
    '## 代表项目',
    '',
    ...(projects.length > 0
      ? projects.flatMap((card) => projectBlock(card, input.siteUrl))
      : ['暂无项目。', '']),
    '## 精选文章',
    '',
    ...(featured.length > 0 ? featured : ['暂无精选文章。']),
    '',
    '## 联系方式',
    '',
    '- 邮箱：peik10421@163.com',
    '- GitHub：https://github.com/b00ml',
    '- 求职意向：产品工程师 / AI 应用产品经理（偏工程落地）/ AI Agent 全栈应用开发'
  ]

  return `${lines.join('\n')}\n`
}
