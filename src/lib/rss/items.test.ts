import { describe, expect, test } from 'bun:test'

import { includeInRss, publishedPosts, rssItemFields, type RssPost } from './items'

const post = (id: string, pubDate: string, extra: Partial<RssPost['data']> = {}): RssPost => ({
  id,
  data: {
    title: `Post ${id}`,
    description: `Description ${id}`,
    pubDate: new Date(pubDate),
    ...extra
  }
})

describe('RSS items', () => {
  test('posts are ordered by pubDate, newest first', () => {
    const fields = publishedPosts(
      [post('older', '2026-09-01T00:00:00.000Z'), post('newer', '2026-10-14T00:00:00.000Z')],
      true
    ).map(rssItemFields)

    expect(fields.map((item) => item.link)).toEqual(['/blog/newer', '/blog/older'])
  })

  test('frontmatter fields map onto the feed item', () => {
    const published = post('20261014-astro-blog-first-look', '2026-10-14T00:00:00.000Z')
    expect(rssItemFields(published)).toEqual({
      title: published.data.title,
      description: published.data.description,
      pubDate: published.data.pubDate,
      link: '/blog/20261014-astro-blog-first-look'
    })
  })

  test('drafts follow the existing production filter', () => {
    const draft = post('secret', '2026-11-01T00:00:00.000Z', { draft: true })
    expect(includeInRss(true, true)).toBe(false)
    expect(includeInRss(false, true)).toBe(true)
    expect(includeInRss(undefined, true)).toBe(true)
    expect(includeInRss(true, false)).toBe(true)

    expect(publishedPosts([post('live', '2026-01-01T00:00:00.000Z'), draft], true).map((e) => e.id))
      .toEqual(['live'])
    expect(publishedPosts([draft], false).map((e) => e.id)).toEqual(['secret'])
  })

  test('pubDate orders the feed, not updatedDate', () => {
    const revised = post('revised', '2026-01-01T00:00:00.000Z', {
      updatedDate: new Date('2026-12-01T00:00:00.000Z')
    })
    const fields = publishedPosts([post('may', '2026-05-01T00:00:00.000Z'), revised], true).map(
      rssItemFields
    )
    expect(fields.map((item) => item.link)).toEqual(['/blog/may', '/blog/revised'])
  })
})
