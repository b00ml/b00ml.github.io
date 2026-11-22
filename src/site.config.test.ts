import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { CONTENT_DIRS, findEntryFile, readFrontmatter } from './lib/content/entries'
import { publishedPosts } from './lib/rss/items'
import { detailAvailable, published } from './lib/seo/drafts'
import config from './site.config'

const SITE_NAME = 'peik1'
const FORMER_SITE_NAME = ['Joye', 'Personal', 'Blog'].join(' ')
const ROOT = join(import.meta.dir, '..')

function textFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.astro') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      out.push(...textFiles(path))
      continue
    }
    if (/\.(astro|css|html|json|md|mdx|ts|tsx|txt|webmanifest|xml)$/.test(entry)) out.push(path)
  }
  return out
}

function nonTestSourceFiles(dir: string): string[] {
  return textFiles(dir).filter(
    (path) => /\.(astro|css|ts|tsx)$/.test(path) && !path.endsWith('.test.ts')
  )
}

describe('site name', () => {
  test('config title is peik1 for nav, titles, meta, and RSS', () => {
    expect(config.title).toBe(SITE_NAME)

    const rss = readFileSync(join(import.meta.dir, 'pages/rss.xml.ts'), 'utf8')
    expect(rss).toContain('title: config.title,')
  })

  test('nav brand stays on one line', () => {
    const header = readFileSync(join(import.meta.dir, 'components/Header.astro'), 'utf8')
    expect(header).toContain('whitespace-nowrap')
    expect(header).toContain('{config.title}')
  })

  test('the former site name is gone from source and static pages', () => {
    const paths = [
      ...textFiles(join(ROOT, 'src')),
      ...textFiles(join(ROOT, 'public')),
      join(ROOT, 'DESIGN.md')
    ]
    const hits = paths.filter((path) => readFileSync(path, 'utf8').includes(FORMER_SITE_NAME))
    expect(hits).toEqual([])
  })
})

describe('navigation and footer chrome', () => {
  test('header menu puts projects first and uses concise Chinese labels', () => {
    expect(config.header?.menu).toEqual([
      { title: '项目', link: '/projects' },
      { title: '技术', link: '/blog' },
      { title: '产品', link: '/product' },
      { title: '笔记', link: '/notes' },
      { title: '关于', link: '/about' }
    ])
  })

  test('footer disables third-party theme credits', () => {
    expect(config.footer.credits).toBe(false)
  })
})

describe('layout stress-test sample post', () => {
  test('stays on disk as draft so production listings, detail routes, and RSS exclude it', () => {
    const sampleFile = findEntryFile('blog', '20261014-sample-post')
    expect(sampleFile).toBeDefined()

    const sampleFrontmatter = readFrontmatter(sampleFile!)
    expect(sampleFrontmatter.draft).toBe(true)
    expect(detailAvailable(Boolean(sampleFrontmatter.draft), false, false)).toBe(false)
    expect(published({ data: { draft: Boolean(sampleFrontmatter.draft) } })).toBe(false)

    const blogDir = join(ROOT, CONTENT_DIRS.blog)
    const blogPosts = readdirSync(blogDir)
      .filter((name) => /\.mdx?$/.test(name))
      .map((name) => {
        const id = name.replace(/\.mdx?$/, '')
        const fm = readFrontmatter(join(blogDir, name))
        return {
          id,
          data: {
            title: String(fm.title ?? ''),
            description: typeof fm.description === 'string' ? fm.description : undefined,
            pubDate: fm.pubDate instanceof Date ? fm.pubDate : new Date(String(fm.pubDate)),
            draft: Boolean(fm.draft)
          }
        }
      })

    const prodRssIds = publishedPosts(blogPosts, true).map((entry) => entry.id)
    expect(prodRssIds).not.toContain('20261014-sample-post')
    expect(prodRssIds.length).toBeGreaterThanOrEqual(3)
  })
})

describe('Chinese UI chrome and semantic tokens', () => {
  test('uses semantic tokens instead of missing presetWind3 or astro-pure classes', () => {
    const brokenClassPatterns = [
      /\btext-red-500\b/,
      /\btext-bgColor\b/,
      /\bspace-[xy]-\d+\b/,
      /\btabular-nums\b/,
      /\bline-clamp-\d+\b/
    ]
    const files = nonTestSourceFiles(join(ROOT, 'src')).filter((path) => !path.endsWith('.css'))

    const violations = files.flatMap((file) => {
      const content = readFileSync(file, 'utf8').replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
      return brokenClassPatterns
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${file}: ${pattern}`)
    })

    expect(violations).toEqual([])

    const hero = readFileSync(join(import.meta.dir, 'components/pure/Hero.astro'), 'utf8')
    const preview = readFileSync(join(import.meta.dir, 'components/pure/PostPreview.astro'), 'utf8')
    expect(hero).toContain('text-destructive')
    expect(hero).toContain('（草稿）')
    expect(preview).toContain('text-destructive')
    expect(preview).toContain('（草稿）')
  })

  test('replaces English template chrome with Chinese across site UI', () => {
    const retiredChromePhrases = [
      'Toggle dark mode',
      'Toggle menu',
      'Set theme to ',
      "aria-label='Brand'",
      "aria-label='Nav menu item'",
      'TABLE OF CONTENTS',
      'Scroll to section:',
      '>PROJECT<',
      'Back to Top',
      "title='Back'",
      "aria-label='Toggle sidebar'",
      ": 'Previous'",
      ": 'Next'",
      '(Draft)',
      'Blur image',
      'View more blogs with the tag',
      'You are in Dev mode, the search is disabled.',
      "content: 'Copied!';",
      'min read',
      "title: 'Home'",
      "title='More about me'",
      "title='All posts'",
      "title='All notes'",
      "title='All product notes'",
      "title='All projects'",
      "<Section title='About'",
      "<Section title='Blog'",
      "<Section title='Notes'",
      "<Section title='Product'",
      "<Section title='Projects'",
      '← Previous Posts',
      'Next Posts →',
      '>Blog</h1>',
      '>Notes</h1>',
      '>Product</h1>',
      '>Tags</h1>',
      '>Search</h1>',
      'No posts yet.',
      'Showing ',
      'View all tags',
      'View all →',
      'No note entries yet.',
      "Updated{' '}",
      "title: 'All Tags'",
      'Any tag yet.',
      '← Previous Tags',
      'Next Tags →',
      "title: 'Note Tags'",
      'No tags found in note entries.',
      'Search across every post',
      'Oops, something went wrong.',
      "Sorry, we couldn't find your page.",
      "title='Back to home'",
      "name: 'Blog'",
      "name: 'Notes'",
      "name: 'Product'",
      "underline-offset-4'>Product</a>",
      "underline-offset-4'>Blog</a"
    ]

    const files = nonTestSourceFiles(join(ROOT, 'src'))
    const violations = files.flatMap((file) => {
      const content = readFileSync(file, 'utf8')
      return retiredChromePhrases
        .filter((phrase) => content.includes(phrase))
        .map((phrase) => `${file}: ${phrase}`)
    })

    expect(violations).toEqual([])

    expect(
      readFileSync(join(import.meta.dir, 'components/navigation/TableOfContents.astro'), 'utf8')
    ).toContain('>目录</h2>')
    expect(
      readFileSync(join(import.meta.dir, 'components/navigation/ProjectNav.astro'), 'utf8')
    ).toContain('>项目篇章</h2>')
    expect(readFileSync(join(import.meta.dir, 'layouts/ContentLayout.astro'), 'utf8')).toContain(
      "title='返回'"
    )
  })
})
