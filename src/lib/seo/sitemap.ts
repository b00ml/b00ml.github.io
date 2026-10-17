import { findEntryFile, readFrontmatter } from '../content/entries'
import { contentLastModified } from './lastmod'

/**
 * Last-modified time for a page in the sitemap, or `undefined` when it cannot
 * be derived without guessing.
 *
 * Only article pages are dated, and their date comes from frontmatter plus git
 * history via `contentLastModified`. Listing, tag and static pages are left
 * undated rather than given a build timestamp: a `lastmod` that moves on every
 * deploy tells a crawler nothing, and one that is merely the newest entry in a
 * list would be a different fact than "this page changed".
 */
export function sitemapLastModified(pathname: string): string | undefined {
  const [collection, ...rest] = pathname.replace(/^\//, '').split('/')
  const file = findEntryFile(collection, rest.join('/'))
  if (!file) return undefined

  const frontmatter = readFrontmatter(file)
  const published = toDate(frontmatter.pubDate)
  if (!published) return undefined

  return contentLastModified(file, published, toDate(frontmatter.updatedDate))
}

/** A frontmatter date as parsed, or `undefined` when it is not a valid date. */
function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : undefined
  if (typeof value !== 'string') return undefined
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}
