import { readdirSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

import { sitemapLastModified } from './sitemap'

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const COLLECTIONS = [
  ['blog', 'src/content/blog'],
  ['notes', 'src/content/notes'],
  ['product', 'src/content/product'],
  ['projects', 'src/content/projects']
] as const

/** Every markdown file under `dir`, as a `/`-joined path relative to it. */
function markdownFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const rel = prefix ? `${prefix}/${item.name}` : item.name
    if (item.isDirectory()) return markdownFiles(`${dir}/${item.name}`, rel)
    return /\.mdx?$/.test(item.name) ? [rel] : []
  })
}

describe('sitemap lastmod', () => {
  test('dates every article that exists', () => {
    for (const [route, dir] of COLLECTIONS) {
      for (const file of markdownFiles(dir)) {
        // A project's `<slug>/index.md` is served at `/projects/<slug>`.
        const slug = file.replace(/\.mdx?$/, '').replace(/\/index$/, '')
        const pathname = `/${route}/${slug}`
        // Falling back to the pathname makes a miss report which route missed.
        expect(sitemapLastModified(pathname) ?? pathname).toMatch(ISO)
      }
    }
  })

  test('leaves listing, tag and static pages undated', () => {
    const undated = [
      '/',
      '/about',
      '/projects',
      '/blog',
      '/notes',
      '/product',
      '/tags',
      '/tags/工程',
      '/notes/tags',
      '/notes/tags/工程',
      '/search'
    ]
    for (const pathname of undated) expect(sitemapLastModified(pathname)).toBeUndefined()
  })

  test('resolves percent-encoded slugs and rejects unknown ones', () => {
    expect(sitemapLastModified('/blog/20261014%2Dsample%2Dpost')).toMatch(ISO)
    expect(sitemapLastModified('/blog/no-such-post')).toBeUndefined()
    // A malformed escape must not throw out of the sitemap build.
    expect(sitemapLastModified('/blog/%E0%A4%A')).toBeUndefined()
  })
})
