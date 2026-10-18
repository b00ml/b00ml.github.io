import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from 'bun:test'

import { CONTENT_DIRS, findEntryFile, readFrontmatter } from './entries'

test('locates an article in every collection', () => {
  expect(findEntryFile('blog', '20261014-sample-post')).toBe(
    resolve('src/content/blog/20261014-sample-post.md')
  )
  expect(findEntryFile('notes', '20261014-stale-content-cache')).toBe(
    resolve('src/content/notes/20261014-stale-content-cache.md')
  )
  expect(findEntryFile('product', '20261014-three-collections')).toBe(
    resolve('src/content/product/20261014-three-collections.md')
  )
})

test('the collection mapping is the source directory', () => {
  expect(CONTENT_DIRS).toEqual({
    blog: 'src/content/blog',
    notes: 'src/content/notes',
    product: 'src/content/product',
    projects: 'src/content/projects'
  })
})

test('decodes percent-encoded slugs and rejects unknown ones', () => {
  const plain = findEntryFile('blog', '20261014-sample-post')
  expect(findEntryFile('blog', '20261014%2Dsample%2Dpost')).toBe(plain)
  expect(findEntryFile('blog', 'no-such-post')).toBeUndefined()
  // A malformed escape must not throw.
  expect(findEntryFile('blog', '%E0%A4%A')).toBeUndefined()
  expect(findEntryFile('tags', 'ai')).toBeUndefined()
})

test('prefers an .md entry and falls back to .mdx', async () => {
  const base = resolve(CONTENT_DIRS.notes, '_entry-lookup-fixture')
  const md = `${base}.md`
  const mdx = `${base}.mdx`
  const frontmatter = '---\ntitle: fixture\ndescription: fixture\npubDate: 2026-01-01\n---\n'
  try {
    await writeFile(mdx, frontmatter)
    expect(findEntryFile('notes', '_entry-lookup-fixture')).toBe(mdx)
    await writeFile(md, frontmatter)
    expect(findEntryFile('notes', '_entry-lookup-fixture')).toBe(md)
  } finally {
    await rm(md, { force: true })
    await rm(mdx, { force: true })
  }
})

test('reads the frontmatter of an article', () => {
  const frontmatter = readFrontmatter(resolve(CONTENT_DIRS.blog, '20261014-sample-post.md'))
  expect(frontmatter.title).toBe('把博客当成一个产品来做')
  expect(frontmatter.pubDate).toBeInstanceOf(Date)
  expect((frontmatter.pubDate as Date).toISOString()).toBe('2026-10-14T00:00:00.000Z')
})

test('malformed frontmatter reads as empty instead of throwing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'frontmatter-fixture-'))
  try {
    const file = join(dir, 'post.md')
    await writeFile(file, '---\ntitle: [unclosed\n---\nbody\n')
    expect(readFrontmatter(file)).toEqual({})
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('an article without frontmatter reads as empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'frontmatter-fixture-'))
  try {
    const file = join(dir, 'post.md')
    await writeFile(file, 'just a body\n')
    expect(readFrontmatter(file)).toEqual({})
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
