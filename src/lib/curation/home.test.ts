import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { CONTENT_DIRS, readFrontmatter } from '../content/entries'
import type { ProjectEntryInput, ProjectLink, ProjectStatus } from '../projects/cards'
import { buildHomeViewModel, formatDateYmd, type ArticleEntryInput } from './home'

const project = (
  id: string,
  pubDate: string,
  extra: Partial<ProjectEntryInput['data']> = {}
): ProjectEntryInput => ({
  id,
  data: {
    title: `Project ${id}`,
    description: `Description ${id}`,
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
    title: `Title ${id}`,
    description: `Summary ${id}`,
    pubDate: new Date(pubDate),
    tags: ['agent'],
    ...extra
  }
})

describe('buildHomeViewModel', () => {
  test('curates featured root projects with sub-page partCount and falls back to all roots when none are featured', () => {
    const withFeatured = buildHomeViewModel({
      projects: [
        project('alpha/index', '2026-10-18T00:00:00.000Z', { featured: true, order: 2 }),
        project('alpha/part-1', '2026-10-18T00:00:00.000Z'),
        project('beta/index', '2026-10-20T00:00:00.000Z', { featured: false, order: 1 })
      ],
      blog: [],
      product: [],
      notes: [],
      isProd: true
    })

    expect(
      withFeatured.featuredProjects.map((item) => ({ slug: item.slug, partCount: item.partCount }))
    ).toEqual([{ slug: 'alpha', partCount: 1 }])

    const fallbackAll = buildHomeViewModel({
      projects: [
        project('alpha/index', '2026-10-18T00:00:00.000Z', { order: 2 }),
        project('alpha/part-1', '2026-10-18T00:00:00.000Z'),
        project('beta/index', '2026-10-20T00:00:00.000Z', { order: 1 })
      ],
      blog: [],
      product: [],
      notes: [],
      isProd: true
    })

    expect(
      fallbackAll.featuredProjects.map((item) => ({ slug: item.slug, partCount: item.partCount }))
    ).toEqual([
      { slug: 'beta', partCount: 0 },
      { slug: 'alpha', partCount: 1 }
    ])
  })

  test('orders featuredWriting by featured flag, featuredOrder ascending, pubDate descending, and backfills up to 4 slots across blog and product', () => {
    const vm = buildHomeViewModel({
      projects: [],
      blog: [
        article('blog-unfeatured-new', '2026-11-10T00:00:00.000Z', { featured: false }),
        article('blog-featured-order-2', '2026-10-10T00:00:00.000Z', {
          featured: true,
          featuredOrder: 2,
          tags: ['agent', 'eval']
        }),
        article('blog-unfeatured-old', '2026-09-01T00:00:00.000Z', { featured: false })
      ],
      product: [
        article('prod-featured-order-1', '2026-10-05T00:00:00.000Z', {
          featured: true,
          featuredOrder: 1,
          tags: ['产品']
        }),
        article('prod-featured-no-order', '2026-10-20T00:00:00.000Z', {
          featured: true
        }),
        article('prod-unfeatured-mid', '2026-10-25T00:00:00.000Z', { featured: false })
      ],
      notes: [],
      isProd: true
    })

    expect(
      vm.featuredWriting.map((item) => ({
        href: item.href,
        collection: item.collection,
        collectionLabel: item.collectionLabel
      }))
    ).toEqual([
      {
        href: '/product/prod-featured-order-1',
        collection: 'product',
        collectionLabel: '产品思考'
      },
      {
        href: '/blog/blog-featured-order-2',
        collection: 'blog',
        collectionLabel: '工程实践'
      },
      {
        href: '/product/prod-featured-no-order',
        collection: 'product',
        collectionLabel: '产品思考'
      },
      {
        href: '/blog/blog-unfeatured-new',
        collection: 'blog',
        collectionLabel: '工程实践'
      }
    ])

    expect(vm.featuredWriting[1]).toEqual({
      collection: 'blog',
      collectionLabel: '工程实践',
      href: '/blog/blog-featured-order-2',
      title: 'Title blog-featured-order-2',
      description: 'Summary blog-featured-order-2',
      pubDate: new Date('2026-10-10T00:00:00.000Z'),
      tags: ['agent', 'eval']
    })
  })

  test('isolates notes strictly into recentNotes (capped at 5 newest) without ever affecting featuredProjects or featuredWriting', () => {
    const baseInput = {
      projects: [project('ark/index', '2026-10-18T00:00:00.000Z')],
      blog: [
        article('flagship-blog', '2026-10-18T00:00:00.000Z', {
          featured: true,
          featuredOrder: 1
        })
      ],
      product: [article('backfill-product', '2026-10-15T00:00:00.000Z')],
      isProd: true
    }

    const beforeNotes = buildHomeViewModel({
      ...baseInput,
      notes: []
    })

    const afterManyNewNotes = buildHomeViewModel({
      ...baseInput,
      notes: [
        article('note-1', '2026-12-01T00:00:00.000Z', { featured: true, featuredOrder: 1 }),
        article('note-2', '2026-12-06T00:00:00.000Z'),
        article('note-3', '2026-12-03T00:00:00.000Z'),
        article('note-4', '2026-12-05T00:00:00.000Z'),
        article('note-5', '2026-12-02T00:00:00.000Z'),
        article('note-6', '2026-12-04T00:00:00.000Z')
      ]
    })

    expect(afterManyNewNotes.featuredProjects).toEqual(beforeNotes.featuredProjects)
    expect(afterManyNewNotes.featuredWriting).toEqual(beforeNotes.featuredWriting)
    expect(afterManyNewNotes.recentNotes.map((item) => item.href)).toEqual([
      '/notes/note-2',
      '/notes/note-4',
      '/notes/note-6',
      '/notes/note-3',
      '/notes/note-5'
    ])
    expect(afterManyNewNotes.recentNotes[0]).toEqual({
      href: '/notes/note-2',
      title: 'Title note-2',
      pubDate: new Date('2026-12-06T00:00:00.000Z')
    })
  })

  test('filters out draft entries across projects, blog, product, and notes when isProd is true and keeps them when isProd is false', () => {
    const raw = {
      projects: [
        project('live-proj/index', '2026-10-18T00:00:00.000Z', { featured: true, order: 2 }),
        project('draft-proj/index', '2026-10-20T00:00:00.000Z', {
          featured: true,
          order: 1,
          draft: true
        })
      ],
      blog: [
        article('draft-blog', '2026-11-05T00:00:00.000Z', {
          featured: true,
          featuredOrder: 1,
          draft: true
        }),
        article('live-blog', '2026-10-18T00:00:00.000Z', { featured: true, featuredOrder: 2 })
      ],
      product: [
        article('draft-product', '2026-11-04T00:00:00.000Z', { draft: true }),
        article('live-product', '2026-10-15T00:00:00.000Z')
      ],
      notes: [
        article('draft-note', '2026-11-10T00:00:00.000Z', { draft: true }),
        article('live-note', '2026-10-10T00:00:00.000Z')
      ]
    }

    const prodVm = buildHomeViewModel({ ...raw, isProd: true })
    expect(prodVm.featuredProjects.map((item) => item.slug)).toEqual(['live-proj'])
    expect(prodVm.featuredWriting.map((item) => item.href)).toEqual([
      '/blog/live-blog',
      '/product/live-product'
    ])
    expect(prodVm.recentNotes.map((item) => item.href)).toEqual(['/notes/live-note'])

    const devVm = buildHomeViewModel({ ...raw, isProd: false })
    expect(devVm.featuredProjects.map((item) => item.slug)).toEqual(['draft-proj', 'live-proj'])
    expect(devVm.featuredWriting.map((item) => item.href)).toEqual([
      '/blog/draft-blog',
      '/blog/live-blog',
      '/product/draft-product',
      '/product/live-product'
    ])
    expect(devVm.recentNotes.map((item) => item.href)).toEqual([
      '/notes/draft-note',
      '/notes/live-note'
    ])
  })

  test('handles empty frozen collections, omitted optional fields, and .md/.mdx id suffixes without throwing or mutating inputs', () => {
    const emptyVm = buildHomeViewModel({
      projects: Object.freeze([]),
      blog: Object.freeze([]),
      product: Object.freeze([]),
      notes: Object.freeze([])
    })

    expect(emptyVm).toEqual({
      featuredProjects: [],
      featuredWriting: [],
      recentNotes: []
    })

    const minimalBlog: ArticleEntryInput = {
      id: '20261018-minimal.md',
      data: {
        title: 'Minimal Blog',
        description: 'No optional fields provided',
        pubDate: new Date('2026-10-18T00:00:00.000Z')
      }
    }
    const minimalNote: ArticleEntryInput = {
      id: '20261019-note.mdx',
      data: {
        title: 'Minimal Note',
        description: 'Note description',
        pubDate: new Date('2026-10-19T00:00:00.000Z')
      }
    }

    const sparseVm = buildHomeViewModel({
      projects: Object.freeze([]),
      blog: Object.freeze([minimalBlog]),
      product: Object.freeze([]),
      notes: Object.freeze([minimalNote])
    })

    expect(sparseVm.featuredWriting).toEqual([
      {
        collection: 'blog',
        collectionLabel: '工程实践',
        href: '/blog/20261018-minimal',
        title: 'Minimal Blog',
        description: 'No optional fields provided',
        pubDate: new Date('2026-10-18T00:00:00.000Z'),
        tags: []
      }
    ])
    expect(sparseVm.recentNotes).toEqual([
      {
        href: '/notes/20261019-note',
        title: 'Minimal Note',
        pubDate: new Date('2026-10-19T00:00:00.000Z')
      }
    ])
    expect(formatDateYmd(new Date('2026-10-19T00:00:00.000Z'))).toBe('2026-10-19')
  })
})

function collectMarkdownFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...collectMarkdownFiles(full))
    } else if (/\.mdx?$/i.test(name)) {
      out.push(full)
    }
  }
  return out
}

function loadArticleCollection(dirPath: string): ArticleEntryInput[] {
  const root = resolve(dirPath)
  return collectMarkdownFiles(root).map((filePath) => {
    const id = relative(root, filePath)
      .replace(/\\/g, '/')
      .replace(/\.mdx?$/i, '')
    const fm = readFrontmatter(filePath)
    return {
      id,
      data: {
        title: String(fm.title ?? ''),
        description: String(fm.description ?? ''),
        pubDate: fm.pubDate instanceof Date ? fm.pubDate : new Date(String(fm.pubDate)),
        tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
        draft: Boolean(fm.draft ?? false),
        featured: Boolean(fm.featured ?? false),
        featuredOrder: typeof fm.featuredOrder === 'number' ? fm.featuredOrder : undefined
      }
    }
  })
}

function loadProjectCollection(dirPath: string): ProjectEntryInput[] {
  const root = resolve(dirPath)
  return collectMarkdownFiles(root).map((filePath) => {
    const id = relative(root, filePath)
      .replace(/\\/g, '/')
      .replace(/\.mdx?$/i, '')
    const fm = readFrontmatter(filePath)
    return {
      id,
      data: {
        title: String(fm.title ?? ''),
        description: String(fm.description ?? ''),
        pubDate: fm.pubDate instanceof Date ? fm.pubDate : new Date(String(fm.pubDate)),
        draft: Boolean(fm.draft ?? false),
        featured: Boolean(fm.featured ?? false),
        status: fm.status as ProjectStatus | undefined,
        role: typeof fm.role === 'string' ? fm.role : undefined,
        period: typeof fm.period === 'string' ? fm.period : undefined,
        stack: Array.isArray(fm.stack) ? fm.stack.map(String) : [],
        order: typeof fm.order === 'number' ? fm.order : 0,
        summary: typeof fm.summary === 'string' ? fm.summary : undefined,
        highlights: Array.isArray(fm.highlights) ? fm.highlights.map(String) : [],
        links: Array.isArray(fm.links) ? (fm.links as ProjectLink[]) : []
      }
    }
  })
}

describe('repository homepage curation contract', () => {
  test('surfaces the 3 flagship projects and 4 curated essays on / while excluding sample-post and three-collections', () => {
    const projects = loadProjectCollection(CONTENT_DIRS.projects)
    const blog = loadArticleCollection(CONTENT_DIRS.blog)
    const product = loadArticleCollection(CONTENT_DIRS.product)
    const notes = loadArticleCollection(CONTENT_DIRS.notes)

    // Verify 20261014-three-collections remains published on /product while unfeatured
    const threeCollections = product.find((entry) => entry.id === '20261014-three-collections')
    expect(threeCollections).toBeDefined()
    expect(threeCollections?.data.draft).toBe(false)
    expect(threeCollections?.data.featured).toBe(false)

    const vm = buildHomeViewModel({
      projects,
      blog,
      product,
      notes,
      isProd: true
    })

    expect(vm.featuredProjects.map((item) => item.slug)).toEqual([
      'finance-review-agent',
      'ark-workbench',
      'english-content-workbench'
    ])

    expect(
      vm.featuredWriting.map((item) => ({
        href: item.href,
        collectionLabel: item.collectionLabel
      }))
    ).toEqual([
      {
        href: '/blog/20261018-agent-engineering-8-skills',
        collectionLabel: '工程实践'
      },
      {
        href: '/product/20261018-vertical-agent-moat',
        collectionLabel: '产品思考'
      },
      {
        href: '/blog/20261017-personal-context-assets',
        collectionLabel: '工程实践'
      },
      {
        href: '/blog/20261102-agent-eval-practice',
        collectionLabel: '工程实践'
      }
    ])

    expect(vm.recentNotes.length).toBeGreaterThan(0)
    expect(vm.recentNotes.length).toBeLessThanOrEqual(5)
    for (const note of vm.recentNotes) {
      expect(note.href.startsWith('/notes/')).toBe(true)
    }

    const allHomeHrefs = [
      ...vm.featuredProjects.map((item) => item.href),
      ...vm.featuredWriting.map((item) => item.href),
      ...vm.recentNotes.map((item) => item.href)
    ]
    expect(allHomeHrefs.some((href) => href.includes('20261014-sample-post'))).toBe(false)
    expect(allHomeHrefs.some((href) => href.includes('20261014-three-collections'))).toBe(false)
  })

  test('renders 4-section homepage without nested anchors, separate About section, or Hero RSS link, while preserving ADR 0001 in ingest/plan.ts', () => {
    const landingPath = resolve('src/components/home/HomeLanding.astro')
    const indexPath = resolve('src/pages/index.astro')
    const ingestPlanPath = resolve('src/lib/ingest/plan.ts')

    expect(existsSync(landingPath)).toBe(true)
    const landingSource = readFileSync(landingPath, 'utf8')
    const indexSource = readFileSync(indexPath, 'utf8')
    const ingestPlanSource = readFileSync(ingestPlanPath, 'utf8')

    expect(landingSource).toContain('产品工程师 · 产品设计 × AI 应用工程落地')
    expect(landingSource).toMatch(/>\s*代表项目\s*<\/h2>/)
    expect(landingSource).toMatch(/>\s*精选文章\s*<\/h2>/)
    expect(landingSource).toMatch(/>\s*近期笔记\s*<\/h2>/)
    expect(landingSource).toContain("<ul class='grid gap-4 sm:grid-cols-2'>")
    expect(landingSource).not.toContain('projectLayout')
    expect(landingSource).not.toContain('sm:col-span-2')
    expect(landingSource).not.toContain('/rss.xml')
    expect(indexSource).not.toContain("title='关于'")
    expect(existsSync(resolve('src/pages/ab-a.astro'))).toBe(false)
    expect(existsSync(resolve('src/pages/ab-b.astro'))).toBe(false)
    expect(existsSync(resolve('src/pages/ab-c.astro'))).toBe(false)

    const anchorTokens = [...landingSource.matchAll(/<\/?a\b/g)].map((m) => m[0])
    let openAnchors = 0
    for (const token of anchorTokens) {
      openAnchors += token === '<a' ? 1 : -1
      expect(openAnchors).toBeGreaterThanOrEqual(0)
      expect(openAnchors).toBeLessThanOrEqual(1)
    }
    expect(openAnchors).toBe(0)

    expect(ingestPlanSource).not.toContain('featured')
  })
})
