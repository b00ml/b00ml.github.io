import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sectionMetadata } from '@/lib/seo/metadata'
import { describe, expect, test } from 'bun:test'

const ROOT = join(import.meta.dir, '../../..')
const ABOUT_PAGE = join(ROOT, 'src/pages/about/index.astro')
const COMMON_PAGE = join(ROOT, 'src/layouts/CommonPage.astro')

const BANNED_COPY_RE =
  /付费|模拟面试|简历辅导|微信|QQ|paid|consulting|mock interview|coaching|WeChat/i

const KNOWN_TOP_ROUTES = new Set(['/', '/about', '/projects', '/blog', '/product', '/notes'])

function internalHrefExists(href: string): boolean {
  const clean = href.split('#')[0]!.split('?')[0]!
  if (clean === '/projects/finance-review-agent/demo/') {
    return existsSync(join(ROOT, 'apps/finance-demo/package.json'))
  }
  if (clean !== '/' && clean.endsWith('/')) {
    return false
  }
  if (KNOWN_TOP_ROUTES.has(clean)) {
    return true
  }
  if (clean.startsWith('/projects/')) {
    const rel = clean.slice('/projects/'.length)
    return (
      existsSync(join(ROOT, 'src/content/projects', `${rel}.md`)) ||
      existsSync(join(ROOT, 'src/content/projects', rel, 'index.md'))
    )
  }
  return existsSync(join(ROOT, 'public', clean.slice(1)))
}

describe('/about metadata wiring', () => {
  test('CommonPage forwards optional description into PageLayout meta and /about supplies sectionMetadata', () => {
    const commonSource = readFileSync(COMMON_PAGE, 'utf8')
    expect(commonSource).toMatch(/description\?:\s*string/)
    expect(commonSource).not.toContain('meta={{ title }}')
    expect(commonSource).toMatch(/<PageLayout\s+\{meta\}|<PageLayout\s+meta=\{meta\}/)

    const aboutSource = readFileSync(ABOUT_PAGE, 'utf8')
    expect(aboutSource).toContain("sectionMetadata('/about')")
    expect(aboutSource).toMatch(/description=\{[^}]*description[^}]*\}/)
    expect(aboutSource).not.toContain("title='About'")
  })
})

describe('/about recruiter profile structure and links', () => {
  test('renders the 4 recruiter-facing sections with 1:1 TOC heading parity', () => {
    const source = readFileSync(ABOUT_PAGE, 'utf8')

    const expectedSections = [
      { slug: 'positioning', text: '定位与工程主张' },
      { slug: 'capabilities', text: '能力栈与独立交付边界' },
      { slug: 'projects', text: '代表项目与经历脉络' },
      { slug: 'contact', text: '求职意向与联系通道' }
    ]

    const tocEntries = Array.from(
      source.matchAll(/\{\s*depth:\s*2,\s*slug:\s*'([^']+)',\s*text:\s*'([^']+)'\s*\}/g),
      (m) => ({ slug: m[1], text: m[2] })
    )
    expect(tocEntries).toEqual(expectedSections)

    const domHeadings = Array.from(
      source.matchAll(/<h2\s+id=['"]([^'"]+)['"][^>]*>([^<]+)<\/h2>/g),
      (m) => ({ slug: m[1], text: m[2].trim() })
    )
    expect(domHeadings).toEqual(expectedSections)
  })

  test('includes verified capability boundaries, project metrics, and resume-by-email instructions', () => {
    const source = readFileSync(ABOUT_PAGE, 'utf8')

    // Positioning & principle
    expect(source).toContain('peik1')
    expect(source).toContain('产品工程师')
    expect(source).toContain('能跑、能测、出错能兜')

    // Three capability domains
    expect(source).toContain('产品定义与流程拆解')
    expect(source).toContain('Agent 评测与原型验证')
    expect(source).toContain('全栈工程化落地')

    // Real verified project metrics from repo
    expect(source).toContain('3,778')
    expect(source).toContain('1,154')
    expect(source).toContain('84.05%')
    expect(source).toContain('Recall@8')

    // Job-seeking contact & resume channel without dead PDF link
    expect(source).toContain('peik10421@163.com')
    expect(source).toContain('@b00ml')
    expect(source).toContain('完整简历')
    expect(source).not.toMatch(/href=['"][^'"]*\.pdf['"]/i)
  })

  test('links all required project, collection, demo, repo, and contact targets with zero dead routes', () => {
    const source = readFileSync(ABOUT_PAGE, 'utf8')
    const hrefs = Array.from(source.matchAll(/href=['"]([^'"]+)['"]/g), (m) => m[1]!)

    const requiredHrefs = [
      '/projects/ark-workbench',
      '/projects/finance-review-agent',
      '/projects/finance-review-agent/demo/',
      'https://github.com/b00ml/AI-financialAgent-POC',
      '/projects/english-content-workbench',
      '/projects',
      '/blog',
      '/product',
      '/notes',
      'mailto:peik10421@163.com',
      'https://github.com/b00ml'
    ]

    for (const target of requiredHrefs) {
      expect(hrefs).toContain(target)
    }

    const internalHrefs = hrefs.filter((href) => href.startsWith('/'))
    expect(internalHrefs.length).toBeGreaterThanOrEqual(8)
    for (const href of internalHrefs) {
      expect(internalHrefExists(href)).toBe(true)
    }
  })

  test('respects SEO banned-word guard and semantic color tokens', () => {
    const aboutMeta = sectionMetadata('/about')
    expect(aboutMeta?.title).toBe('关于我')
    expect(aboutMeta?.description).not.toMatch(BANNED_COPY_RE)

    const source = readFileSync(ABOUT_PAGE, 'utf8')
    expect(source).not.toMatch(BANNED_COPY_RE)
    expect(source).not.toMatch(
      /\b(?:text|bg|border)-(?:red|emerald|zinc|slate|gray|blue|teal)-\d+\b|text-bgColor|#[0-9a-fA-F]{3,8}\b/
    )
  })
})
