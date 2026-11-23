import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { CONTENT_DIRS, findEntryFile } from '../content/entries'
import { loadProjectCollection } from '../content/test-fixtures'
import { buildProjectCards, isExternalProjectLink, type ProjectEntryInput } from './cards'

const entry = (
  id: string,
  pubDate: string,
  extra: Partial<ProjectEntryInput['data']> = {}
): ProjectEntryInput => ({
  id,
  data: {
    title: `Title ${id}`,
    description: `Description ${id}`,
    pubDate: new Date(pubDate),
    ...extra
  }
})

describe('buildProjectCards', () => {
  test('maps root projects and counts sub-pages per root without listing sub-pages as cards', () => {
    const cards = buildProjectCards(
      [
        entry('alpha/index', '2026-10-18T00:00:00.000Z', {
          title: 'Alpha Workbench',
          description: 'Alpha overview description',
          status: 'ongoing',
          role: '独立开发',
          period: '2026 至今',
          highlights: ['3,778 项回归测试', '五套独立状态账本'],
          stack: ['TypeScript', 'LLM'],
          links: [{ label: '交互架构图', href: '/diagrams/ark-architecture.html' }]
        }),
        entry('alpha/pipeline', '2026-10-18T00:00:00.000Z', { summary: '摄入与编译' }),
        entry('alpha/runtime', '2026-10-18T00:00:00.000Z', { summary: '运行时与控制面' }),
        entry('solo', '2026-09-01T00:00:00.000Z', {
          title: 'Solo Tool',
          description: 'Single-page project'
        })
      ],
      { isProd: true }
    )

    expect(cards).toEqual([
      {
        slug: 'alpha',
        href: '/projects/alpha',
        title: 'Alpha Workbench',
        summary: 'Alpha overview description',
        status: 'ongoing',
        role: '独立开发',
        period: '2026 至今',
        highlights: ['3,778 项回归测试', '五套独立状态账本'],
        stack: ['TypeScript', 'LLM'],
        links: [{ label: '交互架构图', href: '/diagrams/ark-architecture.html' }],
        partCount: 2
      },
      {
        slug: 'solo',
        href: '/projects/solo',
        title: 'Solo Tool',
        summary: 'Single-page project',
        status: 'shipped',
        highlights: [],
        stack: [],
        links: [],
        partCount: 0
      }
    ])
  })

  test('sorts root projects by order ascending then pubDate descending and prefers explicit summary', () => {
    const cards = buildProjectCards(
      [
        entry('older-order-1/index', '2026-05-01T00:00:00.000Z', {
          order: 1,
          summary: 'Explicit concise summary'
        }),
        entry('newer-order-2/index', '2026-11-01T00:00:00.000Z', {
          order: 2
        }),
        entry('newer-order-1/index', '2026-10-01T00:00:00.000Z', {
          order: 1
        })
      ],
      { isProd: true }
    )

    expect(cards.map((card) => card.slug)).toEqual([
      'newer-order-1',
      'older-order-1',
      'newer-order-2'
    ])
    expect(cards[1]?.summary).toBe('Explicit concise summary')
  })

  test('filters draft roots and draft sub-pages in production while keeping them in preview', () => {
    const items = [
      entry('live/index', '2026-10-18T00:00:00.000Z'),
      entry('live/published-part', '2026-10-18T00:00:00.000Z'),
      entry('live/draft-part', '2026-10-18T00:00:00.000Z', { draft: true }),
      entry('secret/index', '2026-10-20T00:00:00.000Z', { draft: true })
    ]

    const prodCards = buildProjectCards(items, { isProd: true })
    expect(prodCards.map((card) => ({ slug: card.slug, partCount: card.partCount }))).toEqual([
      { slug: 'live', partCount: 1 }
    ])

    const devCards = buildProjectCards(items, { isProd: false })
    expect(devCards.map((card) => ({ slug: card.slug, partCount: card.partCount }))).toEqual([
      { slug: 'secret', partCount: 0 },
      { slug: 'live', partCount: 2 }
    ])
  })

  test('supports featuredOnly curation with fallback when no root is marked featured, and handles empty input', () => {
    expect(buildProjectCards([], { isProd: true })).toEqual([])

    const items = [
      entry('flagship/index', '2026-10-18T00:00:00.000Z', { featured: true, order: 2 }),
      entry('flagship/part-1', '2026-10-18T00:00:00.000Z'),
      entry('secondary/index', '2026-10-18T00:00:00.000Z', { featured: false, order: 1 })
    ]

    expect(buildProjectCards(items, { isProd: true, featuredOnly: true })).toEqual([
      expect.objectContaining({ slug: 'flagship', partCount: 1 })
    ])

    const unfeatured = items.map((item) => ({
      ...item,
      data: { ...item.data, featured: false }
    }))
    expect(
      buildProjectCards(unfeatured, { isProd: true, featuredOnly: true }).map((card) => card.slug)
    ).toEqual(['secondary', 'flagship'])
  })
})

describe('repository project content contract', () => {
  test('all three root projects carry verified highlights and resolvable links', () => {
    const entries = loadProjectCollection(CONTENT_DIRS.projects)

    const cards = buildProjectCards(entries, { isProd: true })
    const bySlug = new Map(cards.map((card) => [card.slug, card]))

    expect(cards.map((card) => card.slug)).toEqual([
      'finance-review-agent',
      'ark-workbench',
      'english-content-workbench'
    ])
    expect(bySlug.get('ark-workbench')?.partCount).toBe(4)
    expect(bySlug.get('finance-review-agent')?.partCount).toBe(3)
    expect(bySlug.get('english-content-workbench')?.partCount).toBe(3)

    for (const card of cards) {
      expect(card.highlights.length).toBeGreaterThanOrEqual(2)
      expect(card.highlights.length).toBeLessThanOrEqual(3)
      expect(card.links.length).toBeGreaterThanOrEqual(1)

      for (const link of card.links) {
        expect(link.label.trim().length).toBeGreaterThan(0)
        const isExternal = /^https:\/\/\S+$/.test(link.href)
        const isRootRelative = link.href.startsWith('/')
        expect(isExternal || isRootRelative).toBe(true)

        if (isRootRelative) {
          if (link.href === '/projects/finance-review-agent/demo/') {
            expect(existsSync(resolve('apps/finance-demo/index.html'))).toBe(true)
          } else if (link.href.startsWith('/projects/')) {
            const subSlug = link.href.slice('/projects/'.length)
            expect(findEntryFile('projects', subSlug)).toBeDefined()
          } else {
            expect(existsSync(resolve('public', link.href.slice(1)))).toBe(true)
          }
        }
      }
    }
  })
})

describe('english workbench public evidence links', () => {
  test('exposes the public repository and the seven-stage pipeline diagram', () => {
    const cards = buildProjectCards(loadProjectCollection(CONTENT_DIRS.projects), { isProd: true })
    const english = cards.find((card) => card.slug === 'english-content-workbench')

    expect(english).toBeDefined()

    const hrefs = (english?.links ?? []).map((link) => link.href)
    expect(hrefs).toContain('https://github.com/b00ml/english-edit-agent-platform')
    expect(hrefs).toContain('/diagrams/english-pipeline.html')

    for (const href of hrefs) {
      if (href.startsWith('/diagrams/')) {
        expect(existsSync(resolve('public', href.slice(1)))).toBe(true)
      }
    }
  })
})

describe('project card template and page hygiene', () => {
  test('distinguishes external http(s) URLs from root-relative and mailto project links', () => {
    expect(isExternalProjectLink('https://github.com/b00ml/AI-financialAgent-POC')).toBe(true)
    expect(isExternalProjectLink('http://example.com/demo')).toBe(true)
    expect(isExternalProjectLink('mailto:peik10421@163.com')).toBe(false)
    expect(isExternalProjectLink('/projects/finance-review-agent/demo/')).toBe(false)
    expect(isExternalProjectLink('/diagrams/ark-architecture.html')).toBe(false)
  })

  test('removes hardcoded hex #087e68, .with-demo special-casing, nested anchors, and English nav labels', () => {
    const cardPath = resolve('src/components/projects/ProjectCard.astro')
    const indexPath = resolve('src/pages/projects/index.astro')
    const detailPath = resolve('src/pages/projects/[...id].astro')

    expect(existsSync(cardPath)).toBe(true)

    const cardSource = readFileSync(cardPath, 'utf8')
    const indexSource = readFileSync(indexPath, 'utf8')
    const detailSource = readFileSync(detailPath, 'utf8')

    for (const source of [cardSource, indexSource]) {
      expect(source).not.toContain('#087e68')
      expect(source).not.toContain('with-demo')
      expect(source).not.toContain('demo-link')
      expect(source).not.toContain('finance-review-agent')
    }

    // Verify no nested <a> tags in ProjectCard.astro
    const anchorTokens = [...cardSource.matchAll(/<\/?a\b/g)].map((m) => m[0])
    let openAnchors = 0
    for (const token of anchorTokens) {
      openAnchors += token === '<a' ? 1 : -1
      expect(openAnchors).toBeGreaterThanOrEqual(0)
      expect(openAnchors).toBeLessThanOrEqual(1)
    }
    expect(openAnchors).toBe(0)

    // Chinese labels on /projects
    expect(indexSource).toContain("title='返回'")
    expect(indexSource).not.toContain("title='Back'")
    expect(indexSource).not.toContain('>Product<')
    expect(indexSource).not.toContain('>Blog<')
    expect(indexSource).toContain('产品')
    expect(indexSource).toContain('技术')

    // Detail page handles root-relative links via isExternalProjectLink
    expect(detailSource).toContain('isExternalProjectLink')
  })
})
