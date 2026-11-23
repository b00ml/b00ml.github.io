import { describe, expect, test } from 'bun:test'

import { CONTENT_DIRS } from '../content/entries'
import { loadArticleCollection, loadProjectCollection } from '../content/test-fixtures'
import type { ArticleEntryInput } from '../curation/home'
import type { ProjectEntryInput } from '../projects/cards'
import { buildLlmsTxt } from './document'

const SITE_URL = 'https://b00ml.github.io'

const project = (
  id: string,
  pubDate: string,
  extra: Partial<ProjectEntryInput['data']> = {}
): ProjectEntryInput => ({
  id,
  data: {
    title: `项目 ${id}`,
    description: `项目摘要 ${id}`,
    pubDate: new Date(pubDate),
    ...extra
  }
})

const article = (
  id: string,
  pubDate: string,
  extra: Partial<ArticleEntryInput['data']> = {}
): ArticleEntryInput => ({
  id,
  data: {
    title: `文章 ${id}`,
    description: `文章摘要 ${id}`,
    pubDate: new Date(pubDate),
    tags: ['agent'],
    ...extra
  }
})

/** One flagship project plus one featured essay: the smallest document worth indexing. */
const minimalInput = {
  siteUrl: SITE_URL,
  projects: [
    project('alpha/index', '2026-10-18T00:00:00.000Z', {
      title: 'Alpha 工作台',
      description: 'Alpha 的项目摘要',
      status: 'shipped',
      highlights: ['1,154 项自动化测试']
    })
  ],
  blog: [article('20261018-alpha-essay', '2026-10-18T00:00:00.000Z', { featured: true })],
  product: [],
  isProd: true
}

describe('llms.txt document', () => {
  test('opens with the author positioning and carries one section per required part', () => {
    const text = buildLlmsTxt(minimalInput)
    const headings = text
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice(3))

    expect(text.startsWith('# ')).toBe(true)
    expect(text.split('\n')[0]).toContain('peik1')
    expect(headings).toEqual(['作者定位', '代表项目', '精选文章', '联系方式'])

    // Positioning: the security background is tied to the shared Agent design rules.
    const positioning = text.slice(text.indexOf('## 作者定位'), text.indexOf('## 代表项目'))
    expect(positioning).toContain('网络空间安全')
    for (const keyword of ['最小权限', '确定性', '可追溯', '回滚']) {
      expect(positioning).toContain(keyword)
    }
    expect(positioning).toContain(SITE_URL)
    expect(text.endsWith('\n')).toBe(true)
  })

  test('gives each root project its metrics, a detail URL, and every link the author attached', () => {
    const text = buildLlmsTxt({
      ...minimalInput,
      projects: [
        project('beta/index', '2026-10-18T00:00:00.000Z', {
          title: 'Beta 审计台',
          description: 'Beta 的项目摘要',
          status: 'shipped',
          period: '2026',
          role: '产品设计',
          order: 1,
          highlights: ['32 条合成困难集准确率 1.0000', '50 条标注集 Recall@8 达 1.00'],
          links: [
            { label: '体验交互 Demo', href: '/projects/beta/demo/' },
            { label: '交互架构图', href: '/diagrams/beta-architecture.html' },
            { label: '开源仓库', href: 'https://github.com/b00ml/beta' }
          ]
        }),
        // A sub-page is part of the project, never a project of its own.
        project('beta/workflows', '2026-10-18T00:00:00.000Z', { title: '三条链路' })
      ]
    })

    const section = text.slice(text.indexOf('## 代表项目'), text.indexOf('## 精选文章'))

    expect(section).toContain('### Beta 审计台')
    expect(section).toContain('Beta 的项目摘要')
    expect(section).toContain('32 条合成困难集准确率 1.0000')
    expect(section).toContain('50 条标注集 Recall@8 达 1.00')

    // Every artefact deep-links to an absolute URL a tool can follow directly.
    expect(section).toContain(`[${SITE_URL}/projects/beta](${SITE_URL}/projects/beta)`)
    expect(section).toContain(`[${SITE_URL}/projects/beta/demo/](${SITE_URL}/projects/beta/demo/)`)
    expect(section).toContain(
      `[${SITE_URL}/diagrams/beta-architecture.html](${SITE_URL}/diagrams/beta-architecture.html)`
    )
    // An external repository is passed through untouched, not re-based on our origin.
    expect(section).toContain('https://github.com/b00ml/beta')
    expect(section).not.toContain(`${SITE_URL}/https://github.com`)

    // The sub-page must not appear as a second project.
    expect(section).not.toContain('### 三条链路')
  })

  test('isProd: true drops every draft entry; a preview build keeps them', () => {
    const input = {
      ...minimalInput,
      projects: [
        project('live/index', '2026-10-18T00:00:00.000Z', { title: 'Live 项目', order: 2 }),
        project('secret/index', '2026-10-20T00:00:00.000Z', {
          title: 'Secret 项目',
          order: 1,
          draft: true
        })
      ],
      blog: [
        article('20261018-live-post', '2026-10-18T00:00:00.000Z', {
          title: 'Live 文章',
          featured: true,
          featuredOrder: 2
        }),
        article('20261020-secret-post', '2026-10-20T00:00:00.000Z', {
          title: 'Secret 文章',
          featured: true,
          featuredOrder: 1,
          draft: true
        })
      ],
      product: [
        article('20261018-live-product', '2026-10-18T00:00:00.000Z', {
          title: 'Live 产品思考',
          featured: true
        }),
        article('20261020-secret-product', '2026-10-20T00:00:00.000Z', {
          title: 'Secret 产品思考',
          featured: true,
          draft: true
        })
      ]
    }

    const prod = buildLlmsTxt({ ...input, isProd: true })
    expect(prod).toContain('Live 项目')
    expect(prod).toContain('Live 文章')
    expect(prod).toContain('Live 产品思考')
    for (const leaked of ['Secret 项目', 'Secret 文章', 'Secret 产品思考', 'secret']) {
      expect(prod).not.toContain(leaked)
    }

    // A preview build is where an author reads their own unpublished entry.
    const preview = buildLlmsTxt({ ...input, isProd: false })
    expect(preview).toContain('Secret 项目')
    expect(preview).toContain('Secret 文章')
    expect(preview).toContain('Secret 产品思考')
  })

  test('lists only author-marked essays, ordered by featuredOrder, never backfilled from dates', () => {
    const text = buildLlmsTxt({
      ...minimalInput,
      blog: [
        article('20261001-unmarked', '2026-11-01T00:00:00.000Z', { title: '未标记新文章' }),
        article('20261002-second', '2026-09-01T00:00:00.000Z', {
          title: '第二篇精选',
          featured: true,
          featuredOrder: 2
        })
      ],
      product: [
        article('20261003-first', '2026-08-01T00:00:00.000Z', {
          title: '第一篇精选',
          featured: true,
          featuredOrder: 1
        })
      ]
    })

    const section = text.slice(text.indexOf('## 精选文章'), text.indexOf('## 联系方式'))
    const first = section.indexOf('第一篇精选')
    const second = section.indexOf('第二篇精选')

    expect(first).toBeGreaterThan(-1)
    expect(first).toBeLessThan(second)
    // Newest-first backfill would have promoted this unmarked essay into the set.
    expect(section).not.toContain('未标记新文章')
    expect(section).toContain(`${SITE_URL}/blog/20261002-second`)
    expect(section).toContain(`${SITE_URL}/product/20261003-first`)
  })
})

describe('repository llms.txt contract', () => {
  const render = (isProd: boolean) =>
    buildLlmsTxt({
      siteUrl: SITE_URL,
      projects: loadProjectCollection(CONTENT_DIRS.projects),
      blog: loadArticleCollection(CONTENT_DIRS.blog),
      product: loadArticleCollection(CONTENT_DIRS.product),
      isProd
    })

  test('indexes the three flagship projects, every featured essay, and both contact channels', () => {
    const text = render(true)

    for (const [slug, title] of [
      ['ark-workbench', 'Ark 知识工作台'],
      ['finance-review-agent', '企业财务审核 Agent'],
      ['english-content-workbench', '英语内容生产工作台']
    ]) {
      expect(text).toContain(`### ${title}`)
      expect(text).toContain(`${SITE_URL}/projects/${slug})`)
    }

    // The award badge is external backing, so the index must carry it too.
    expect(text).toContain('观猹 FDE 共学营前五优秀作品')

    expect(text).toContain('peik10421@163.com')
    expect(text).toContain('https://github.com/b00ml')

    const blog = loadArticleCollection(CONTENT_DIRS.blog)
    const product = loadArticleCollection(CONTENT_DIRS.product)
    const featured = [...blog, ...product].filter(
      (entry) => entry.data.featured && !entry.data.hideFromHome
    )
    expect(featured.length).toBeGreaterThan(0)
    for (const entry of featured) {
      const slug = entry.id.replace(/\.mdx?$/, '')
      expect(text).toContain(`/${slug})`)
    }
  })

  test('leaks no draft entry and no internship employer name in production', () => {
    const prod = render(true)
    const preview = render(false)

    for (const text of [prod, preview]) {
      // The sample post is the repo's only draft, and it is not featured: the
      // index advertises curated evidence, so an unmarked draft never enters it
      // in either mode. Draft filtering itself is covered by the unit test above.
      expect(text).not.toContain('20261014-sample-post')

      for (const banned of ['锦行', '直觉向量', '广州', '明源云']) {
        expect(text).not.toContain(banned)
      }
    }
  })
})
