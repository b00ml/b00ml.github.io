import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseFrontmatter } from '@astrojs/markdown-remark'

import { contentLastModified } from './lastmod'

/**
 * Route prefix to content collection directory. A content entry's `id` is its
 * path under the collection base with the extension stripped, so the URL after
 * the prefix is the file name — `/blog/20261014-sample-post` is
 * `src/content/blog/20261014-sample-post.md`.
 */
const CONTENT_ROUTES: Record<string, string> = {
  blog: 'src/content/blog',
  notes: 'src/content/notes',
  product: 'src/content/product'
}

function findEntryFile(dir: string, id: string): string | undefined {
  return ['md', 'mdx'].map((ext) => resolve(dir, `${id}.${ext}`)).find(existsSync)
}

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
  const [prefix, ...rest] = pathname.replace(/^\//, '').split('/')
  const dir = CONTENT_ROUTES[prefix]
  const id = rest.join('/')
  if (!dir || !id) return undefined

  // URL paths arrive percent-encoded for non-ASCII slugs; the file is named in
  // the decoded form.
  let file = findEntryFile(dir, id)
  if (!file) {
    try {
      file = findEntryFile(dir, decodeURIComponent(id))
    } catch {
      return undefined
    }
  }
  if (!file) return undefined

  const { frontmatter } = parseFrontmatter(readFileSync(file, 'utf8'))
  const published = new Date(frontmatter.pubDate)
  if (!Number.isFinite(published.getTime())) return undefined
  const declared = frontmatter.updatedDate ? new Date(frontmatter.updatedDate) : undefined

  return contentLastModified(file, published, declared)
}
