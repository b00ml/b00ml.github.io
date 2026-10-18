import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseFrontmatter } from '@astrojs/markdown-remark'

/**
 * Content collection to source directory. An entry's `id` is its path under the
 * collection base with the extension stripped, so the URL `/blog/<slug>` is the
 * file `src/content/blog/<slug>.md`. The single copy of this mapping: sitemap
 * dating and ingest both read it from here.
 */
export const CONTENT_DIRS = {
  blog: 'src/content/blog',
  notes: 'src/content/notes',
  product: 'src/content/product',
  projects: 'src/content/projects'
} as const

export type ContentCollection = keyof typeof CONTENT_DIRS

/** Lookup order matters: `.md` wins when both files exist. */
const ENTRY_EXTENSIONS = ['md', 'mdx']

function entryFileIn(dir: string, id: string): string | undefined {
  return ENTRY_EXTENSIONS.map((ext) => resolve(dir, `${id}.${ext}`)).find(existsSync)
}

function decodeSlug(slug: string): string | undefined {
  try {
    return decodeURIComponent(slug)
  } catch {
    return undefined
  }
}

/**
 * Source file for an entry in `collection`, or `undefined` when no file
 * matches. URL paths arrive percent-encoded for non-ASCII slugs; the file is
 * named in the decoded form, so the raw slug is tried first and the decoded
 * one after it.
 */
export function findEntryFile(collection: string, slug: string): string | undefined {
  const dir = Object.hasOwn(CONTENT_DIRS, collection)
    ? CONTENT_DIRS[collection as ContentCollection]
    : undefined
  if (!dir || !slug) return undefined

  const direct = entryFileIn(dir, slug)
  if (direct) return direct
  const decoded = decodeSlug(slug)
  return decoded && decoded !== slug ? entryFileIn(dir, decoded) : undefined
}

/** Frontmatter values as written; unvalidated and possibly absent. */
export type Frontmatter = Record<string, unknown>

/**
 * Frontmatter of a content entry. Malformed frontmatter reads as empty rather
 * than throwing: one bad draft must not take the whole build down. Reading a
 * missing file still throws — that is a caller error, not malformed content.
 */
export function readFrontmatter(filePath: string): Frontmatter {
  const code = readFileSync(filePath, 'utf8')
  try {
    return parseFrontmatter(code).frontmatter
  } catch {
    return {}
  }
}
