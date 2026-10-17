import { expect, test } from 'bun:test'

import {
  buildIngestPlan,
  deriveSlug,
  readNote,
  renderArticle,
  sha256,
  type IngestPlan
} from './plan'

function note(frontmatter: string, body = '正文。\n'): Buffer {
  return Buffer.from(`---\n${frontmatter.trim()}\n---\n\n${body}`)
}

function planFor(content: Buffer, options: { exists?: boolean; slug?: string } = {}): IngestPlan {
  return buildIngestPlan({
    path: 'E:/notes/source.md',
    content,
    collection: 'blog',
    slug: options.slug,
    exists: () => options.exists ?? false
  })
}

test('a note with full frontmatter becomes a seven-section plan', () => {
  const content = note(
    `title: 'context-assets'
description: '把上下文攒起来'
tags: ['AI', '知识管理']
created: 2026-10-17`,
    '正文第一段。\n'
  )

  const plan = planFor(content)

  expect(Object.keys(plan)).toEqual([
    'source',
    'article',
    'fields',
    'body',
    'images',
    'warnings',
    'commit'
  ])
  expect(plan.source).toEqual({
    path: 'E:/notes/source.md',
    sha256: sha256(content),
    bytes: content.byteLength
  })
  expect(plan.article).toEqual({
    collection: 'blog',
    slug: '20261017-context-assets',
    targetPath: 'src/content/blog/20261017-context-assets.md',
    exists: false
  })
  expect(plan.fields).toEqual({
    title: { value: 'context-assets', source: 'frontmatter' },
    description: { value: '把上下文攒起来', source: 'frontmatter' },
    tags: { value: ['AI', '知识管理'], source: 'frontmatter' },
    pubDate: { value: '2026-10-17', source: 'frontmatter' },
    slug: { value: '20261017-context-assets', source: 'title' }
  })
  expect(plan.body).toEqual({
    h1: { found: false, text: null, equivalentToTitle: false },
    preview: '正文第一段。'
  })
  expect(plan.images).toEqual([])
  expect(plan.warnings).toEqual([])
  expect(plan.commit).toEqual({ message: 'content: publish 20261017-context-assets' })
})

test('bytes counts UTF-8 bytes, not characters', () => {
  const content = note(`title: '中文标题'\ncreated: 2026-10-17`, '中文。\n')

  expect(planFor(content).source.bytes).toBe(content.byteLength)
  expect(content.byteLength).toBeGreaterThan(content.toString('utf8').length)
})

test('a note without frontmatter is rejected instead of guessed', () => {
  expect(() => planFor(Buffer.from('就是一段正文。\n'))).toThrow('frontmatter')
})

test('malformed YAML is rejected', () => {
  expect(() => planFor(Buffer.from(`---\ntitle: 'x'\ntags: [a, b\n---\n\n正文\n`))).toThrow()
})

test('a note without a title is rejected', () => {
  const content = note(`description: '只有描述'\ncreated: 2026-10-17`)

  expect(() => planFor(content)).toThrow('title')
})

test('a missing description warns and stays absent instead of being invented', () => {
  const plan = planFor(note(`title: 'note-without-description'\ncreated: 2026-10-13`))

  expect(plan.fields.description).toEqual({ value: null, source: 'missing' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['missing-description'])
  expect(renderArticle(plan.fields, plan.body.preview)).not.toContain('description:')
})

test('an empty description is treated as missing', () => {
  const plan = planFor(note(`title: '空描述'\ndescription: '  '\ncreated: 2026-10-13`))

  expect(plan.fields.description).toEqual({ value: null, source: 'missing' })
})

test('a missing date is rejected', () => {
  expect(() => planFor(note(`title: '没有日期'`))).toThrow('created')
})

test('a video-summary note using the date field still gets a pubDate', () => {
  const plan = planFor(note(`title: '视频笔记'\ndate: 2026-09-09`))

  expect(plan.fields.pubDate).toEqual({ value: '2026-09-09', source: 'frontmatter' })
  expect(plan.article.slug).toBe('20260909-视频笔记')
})

test('missing tags become an empty list with the missing source', () => {
  const plan = planFor(note(`title: '没有标签'\ncreated: 2026-10-13`))

  expect(plan.fields.tags).toEqual({ value: [], source: 'missing' })
  expect(renderArticle(plan.fields, plan.body.preview)).not.toContain('tags:')
})

test('an existing target is marked and planned as an update', () => {
  const plan = planFor(note(`title: '已有文章'\ncreated: 2026-10-17`), { exists: true })

  expect(plan.article.exists).toBe(true)
  expect(plan.commit.message).toBe('content: update 20261017-已有文章')
})

test('a supplied slug replaces the title-derived name in the article, path and commit', () => {
  const plan = planFor(
    note(`title: '真正会刷 LeetCode 的人'\ndescription: '描述'\ncreated: 2026-10-17`),
    { slug: 'leetcode-first-glance' }
  )

  expect(plan.article).toEqual({
    collection: 'blog',
    slug: '20261017-leetcode-first-glance',
    targetPath: 'src/content/blog/20261017-leetcode-first-glance.md',
    exists: false
  })
  expect(plan.fields.slug).toEqual({ value: '20261017-leetcode-first-glance', source: 'cli' })
  expect(plan.commit.message).toBe('content: publish 20261017-leetcode-first-glance')
  expect(plan.warnings).toEqual([])
})

test('an update keeps the supplied slug too', () => {
  const plan = planFor(note(`title: '中文标题'\ncreated: 2026-10-17`), {
    exists: true,
    slug: 'existing-post'
  })

  expect(plan.commit.message).toBe('content: update 20261017-existing-post')
})

test('an illegal supplied slug warns in the plan instead of being fixed silently', () => {
  const cases = ['Ticket', 'has space', '-leading', 'a'.repeat(81), '']
  for (const slug of cases) {
    const plan = planFor(note(`title: '中文标题'\ndescription: '描述'\ncreated: 2026-10-17`), {
      slug
    })

    expect(plan.warnings.map((warning) => warning.code)).toEqual(['slug-not-valid'])
    expect(plan.fields.slug.source).toBe('cli')
    expect(plan.warnings[0].message).toContain('--slug')
  }
})

test('a Chinese-derived slug is reported as not valid, with the title as its source', () => {
  const plan = planFor(note(`title: '视频笔记'\ndescription: '描述'\ndate: 2026-09-09`))

  expect(plan.fields.slug).toEqual({ value: '20260909-视频笔记', source: 'title' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['slug-not-valid'])
})

test('the body H1 is reported, and equivalence ignores punctuation and case', () => {
  const same = planFor(
    note(`title: '标题：测试'\ncreated: 2026-10-17`, '# 标题 测试！\n\n正文。\n')
  )
  expect(same.body.h1).toEqual({ found: true, text: '标题 测试！', equivalentToTitle: true })

  const different = planFor(note(`title: '标题'\ncreated: 2026-10-17`, '# 别的标题\n\n正文。\n'))
  expect(different.body.h1).toEqual({ found: true, text: '别的标题', equivalentToTitle: false })
})

test('the body preview is the body that apply would write, without the H1 being rewritten', () => {
  const plan = planFor(note(`title: '标题'\ncreated: 2026-10-17`, '# 标题\n\n正文。\n'))

  expect(plan.body.preview).toBe('# 标题\n\n正文。')
})

test('renderArticle writes single-quoted frontmatter, escapes quotes and keeps the body', () => {
  const plan = planFor(
    note(
      `title: 'It''s a note'\ndescription: '描述'\ntags: ['AI']\ncreated: 2026-10-17`,
      '正文。\n'
    )
  )

  const article = renderArticle(plan.fields, plan.body.preview)

  expect(article.startsWith(`---\ntitle: 'It''s a note'\n`)).toBe(true)
  expect(article).toContain(`pubDate: 2026-10-17`)
  expect(article).toContain(`tags: ['AI']`)
  expect(article.endsWith('\n---\n\n正文。\n')).toBe(true)
})

test('readNote drops the frontmatter block and trims the body edges', () => {
  const parsed = readNote(Buffer.from(`---\ntitle: 'x'\n---\n\n\n正文。\n\n\n`))

  expect(parsed.frontmatter).toEqual({ title: 'x' })
  expect(parsed.body).toBe('正文。')
})

test('a UTF-8 BOM does not leak into the planned body', () => {
  const plan = planFor(
    Buffer.from(`\uFEFF---\ntitle: '带 BOM'\ncreated: 2026-10-17\n---\n\n正文。\n`)
  )

  expect(plan.body.preview).toBe('正文。')
})

test('deriveSlug keeps Unicode letters and folds the rest into hyphens', () => {
  expect(deriveSlug('Hello, World!')).toBe('hello-world')
  expect(deriveSlug('AI 时代：上下文资产')).toBe('ai-时代-上下文资产')
  expect(deriveSlug('ＡＢＣ')).toBe('abc')
  expect(() => deriveSlug('！？')).toThrow('slug')
})

test('sha256 matches the known empty and abc vectors', () => {
  expect(sha256(Buffer.from(''))).toBe(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  )
  expect(sha256(Buffer.from('abc'))).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  )
})
