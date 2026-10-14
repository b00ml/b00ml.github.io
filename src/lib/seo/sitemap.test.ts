import { readdirSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

import { sitemapLastModified } from './sitemap'

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const COLLECTIONS = [
  ['blog', 'src/content/blog'],
  ['notes', 'src/content/notes'],
  ['product', 'src/content/product']
] as const

describe('sitemap lastmod', () => {
  test('dates every article that exists', () => {
    for (const [route, dir] of COLLECTIONS) {
      const files = readdirSync(dir).filter((name) => /\.mdx?$/.test(name))
      for (const file of files) {
        const pathname = `/${route}/${file.replace(/\.mdx?$/, '')}`
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
