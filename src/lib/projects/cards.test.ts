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
          } else if (link.href.startsWith('/projects/') && link.href.endsWith('/demo/')) {
            // A demo that is not the Vite sub-app is a static page under public/.
            const demoSlug = link.href.slice('/projects/'.length, -'/demo/'.length)
            expect(existsSync(resolve('public/projects', demoSlug, 'demo/index.html'))).toBe(true)
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

/**
 * Ark v2 rebuilt the project from the ground up: the overview now speaks as a
 * near-public product page, the four deep dives are new pages, and the old v1
 * sub-pages (and the v1-only diagrams they embedded) must leave no ghost route
 * behind. These assertions read the real corpus so a stale number or a dangling
 * sub-page link fails the suite instead of shipping.
 */
describe('ark workbench v2 content contract', () => {
  const ARK_DIR = 'src/content/projects/ark-workbench'
  const V2_SUBPAGES = ['v1-to-v2', 'multi-host-and-context', 'memory-and-plugins', 'eval-loops']
  const V1_SUBPAGES = ['pipeline', 'runtime', 'memory', 'evidence']

  const read = (path: string) => readFileSync(resolve(path), 'utf8')
  const frontmatterOf = (path: string) => {
    const raw = read(path)
    const end = raw.indexOf('\n---', 3)
    return raw.slice(0, end === -1 ? raw.length : end)
  }
  const bodyOf = (path: string) => {
    const raw = read(path)
    const end = raw.indexOf('\n---', 3)
    return end === -1 ? '' : raw.slice(end + 4)
  }

  test('the overview card carries v2 metrics, four parts, and no v1 repository link', () => {
    const entries = loadProjectCollection(CONTENT_DIRS.projects)
    const ark = buildProjectCards(entries, { isProd: true }).find(
      (card) => card.slug === 'ark-workbench'
    )

    expect(ark).toBeDefined()
    expect(ark?.partCount).toBe(4)

    const highlights = (ark?.highlights ?? []).join(' ')
    expect(highlights).toContain('658')
    expect(highlights).toMatch(/2k/)
    expect(highlights).toMatch(/4k/)
    expect(highlights).toMatch(/双宿主|Claude Code/)
    expect(highlights).toMatch(/Trace|Rubric|回归/)

    const hrefs = (ark?.links ?? []).map((link) => link.href)
    expect(hrefs).toContain('/diagrams/ark-architecture.html')
    expect(hrefs.some((href) => href.includes('obsidian-ark-agent'))).toBe(false)
    // The interactive demo is T05's deliverable; this ticket only reserved the
    // slot. See the dedicated demo test below.
    expect(hrefs).toContain('/projects/ark-workbench/demo/')
  })

  test('publishes exactly the four v2 deep dives, ordered 1..4, each with its own metadata', () => {
    const pages = V2_SUBPAGES.map((slug) => `${ARK_DIR}/${slug}.md`)
    for (const path of pages) expect(existsSync(resolve(path))).toBe(true)

    for (const slug of V1_SUBPAGES) {
      expect(existsSync(resolve(`${ARK_DIR}/${slug}.md`))).toBe(false)
    }

    const entries = loadProjectCollection(CONTENT_DIRS.projects).filter(
      (item) => item.id.startsWith('ark-workbench/') && !item.id.endsWith('index')
    )
    expect(entries.map((item) => item.id.replace('ark-workbench/', '')).sort()).toEqual(
      [...V2_SUBPAGES].sort()
    )
    expect(entries.map((item) => item.data.order).sort()).toEqual([1, 2, 3, 4])

    for (const item of entries) {
      expect(item.data.title.trim().length).toBeGreaterThan(0)
      expect(item.data.description.trim().length).toBeGreaterThan(20)
      expect(item.data.summary?.trim().length ?? 0).toBeGreaterThan(0)
    }

    const overview = bodyOf(`${ARK_DIR}/index.md`)
    for (const slug of V2_SUBPAGES) {
      expect(overview).toContain(`/projects/ark-workbench/${slug}`)
    }
    for (const slug of V1_SUBPAGES) {
      // Anchored so `memory-and-plugins` is not read as a link to `memory`.
      expect(overview).not.toMatch(new RegExp(`/projects/ark-workbench/${slug}(?![\\w-])`))
    }
  })

  test('the overview reads as a product page: no milestone codes, no v1 numbers, explicit pre-release note', () => {
    const path = `${ARK_DIR}/index.md`
    const raw = read(path)
    const frontmatter = frontmatterOf(path)
    const body = bodyOf(path)
    const publicText = `${frontmatter}\n${body}`

    expect(publicText).not.toMatch(/\bM[0-9][a-z]?\b/)
    expect(publicText).not.toContain('3,778')
    expect(publicText).not.toContain('五套')
    expect(publicText).not.toContain('七层证据')
    expect(publicText).not.toContain('155 个文件')
    expect(publicText).not.toContain('563')

    expect(body).toContain('v2 开源发布准备中')
    expect(body).toContain('658')
    expect(body).toMatch(/2k/)
    expect(body).toMatch(/4k/)
    expect(body).toMatch(/Claude Code/)
    expect(body).toMatch(/DSH/)
    // Five hard constraints and a five-step local start, both spelled out.
    expect(body).toMatch(/硬约束/)
    expect(body).toMatch(/raw\//)
    expect(body).toMatch(/\.env/)
    expect(body).toMatch(/ark serve/)
    expect(body).toMatch(/ark init/)
    expect((body.match(/^\d\. /gm) ?? []).length).toBeGreaterThanOrEqual(5)
  })

  test('multi-host claims are graded: AstrBot and AgentMail never read as verified', () => {
    const content = read(`${ARK_DIR}/multi-host-and-context.md`)

    // Both grades are stated in the reader's language, not implied.
    expect(content).toContain('已完成实机')
    expect(content).toContain('自动验收')
    expect(content).toContain('标准 MCP 协议扩展接入')

    for (const line of content.split('\n')) {
      if (/AstrBot|AgentMail/.test(line)) {
        expect(line).not.toMatch(/验收通过|已验收|已完成实机|已支持/)
      }
    }

    // The MCP-extension grade names both external channels and says outright
    // that neither has had a real-machine acceptance run.
    const graded = content.split(/\n(?=### )/).find((section) => section.startsWith('### 标准 MCP'))
    expect(graded).toBeDefined()
    expect(graded).toMatch(/AstrBot/)
    expect(graded).toMatch(/AgentMail/)
    expect(graded).toMatch(/未/)

    // The verified grade lists the hosts that really were accepted, with versions.
    const verified = content.split(/\n(?=### )/).find((section) =>
      section.startsWith('### 已完成实机')
    )
    expect(verified).toBeDefined()
    expect(verified).toMatch(/Claude Code 2\.1\.304/)
    expect(verified).toMatch(/DSH 0\.1\.0-rc\.7/)
    expect(verified).not.toMatch(/AstrBot|AgentMail/)
  })

  test('the v1-to-v2 and memory pages keep their load-bearing rules and honest boundaries', () => {
    const migration = read(`${ARK_DIR}/v1-to-v2.md`)
    expect(migration).toMatch(/审批/)
    expect(migration).toMatch(/快照/)
    expect(migration).toMatch(/undo|撤销/)
    expect(migration).toMatch(/外部.*(确认|不可逆)/)

    const memory = read(`${ARK_DIR}/memory-and-plugins.md`)
    expect(memory).toContain('[推测，未确认]')
    expect(memory).toMatch(/inferred/)
    expect(memory).toMatch(/confirmed/)
    expect(memory).toMatch(/via/)
    expect(memory).toMatch(/Markdown/)
    expect(memory).toMatch(/不建私有库|不建私有数据库|私有数据库/)

    const evals = read(`${ARK_DIR}/eval-loops.md`)
    expect(evals).toContain('.ark/traces')
    expect(evals).toMatch(/promote/)
    expect(evals).toMatch(/rubric/)
    expect(evals).toContain('evals/gate.py')
    expect(evals).toMatch(/skipped/)
    expect(evals).toContain('--strict')
  })

  test('the all-channel diagram is self-contained, themed, focusable, and replaces every v1 diagram', () => {
    const diagramPath = resolve('public/diagrams/ark-architecture.html')
    const diagram = readFileSync(diagramPath, 'utf8')

    expect(diagram).toContain('<svg')
    expect(diagram).toContain('data-theme')
    expect(diagram).toContain('prefers-reduced-motion')
    // Focus-on-hover is the interaction the ticket asks for.
    expect(diagram).toMatch(/:hover|mouseenter|pointerenter/)
    // Zero external dependencies: no CDN script, font or stylesheet.
    expect(diagram).not.toMatch(/<script[^>]+src=/i)
    expect(diagram).not.toMatch(/<link[^>]+href=["']https?:/i)
    expect(diagram).not.toMatch(/@import\s+url\(/i)
    expect(diagram).not.toMatch(/src=["']https?:\/\//i)

    for (const label of ['Obsidian', 'Claude Code', 'DSH', 'AstrBot', 'AgentMail', 'ark serve']) {
      expect(diagram).toContain(label)
    }
    // The two grades are visible on the canvas itself.
    expect(diagram).toMatch(/已完成实机|实机验收/)
    expect(diagram).toMatch(/扩展接入|未验收/)

    for (const stale of [
      'ark-operation-ledger.html',
      'ark-memory-governance.html',
      'ark-response-sequence.html'
    ]) {
      expect(existsSync(resolve(`public/diagrams/${stale}`))).toBe(false)
    }
    const arkSources = [...V2_SUBPAGES, 'index'].map((slug) => read(`${ARK_DIR}/${slug}.md`))
    for (const source of arkSources) {
      expect(source).not.toMatch(/ark-operation-ledger|ark-memory-governance|ark-response-sequence/)
    }
  })

  /**
   * T05: the interactive demo is a static page under `public/`, reached by the
   * directory form `/projects/ark-workbench/demo/` — `trailingSlash: 'never'`
   * governs Astro routes, not static assets.
   */
  test('the overview links the interactive demo, and that link resolves to a real page', () => {
    const entries = loadProjectCollection(CONTENT_DIRS.projects)
    const ark = buildProjectCards(entries, { isProd: true }).find(
      (card) => card.slug === 'ark-workbench'
    )
    const demo = (ark?.links ?? []).find((link) => link.href === '/projects/ark-workbench/demo/')

    expect(demo).toBeDefined()
    expect(demo?.label).toContain('交互演示')
    expect(isExternalProjectLink(demo!.href)).toBe(false)

    const demoPage = resolve('public/projects/ark-workbench/demo/index.html')
    expect(existsSync(demoPage)).toBe(true)

    // The overview body names the demo too, so a reader who scrolls finds it.
    expect(bodyOf(`${ARK_DIR}/index.md`)).toContain('/projects/ark-workbench/demo/')
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
