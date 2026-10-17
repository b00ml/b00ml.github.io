import { expect, test } from 'bun:test'
import { dirname, join, resolve } from 'node:path'

import {
  buildIngestPlan,
  collectTagVocabulary,
  deriveSlug,
  readNote,
  renderArticle,
  sha256,
  type IngestPlan
} from './plan'

function note(frontmatter: string, body = '正文。\n'): Buffer {
  return Buffer.from(`---\n${frontmatter.trim()}\n---\n\n${body}`)
}

/** 固定“今天”，让日期兜底的断言不随机器时钟漂移。 */
const NOW = new Date(2026, 9, 17, 15, 30)

/** 附件路径与实现里的算法一致：先 resolve 笔记路径，再从它所在目录拼。 */
function beside(notePath: string, ...parts: string[]): string {
  return join(dirname(resolve(notePath)), ...parts)
}

/** 仓库现有文章汇总出的词表，默认值让不关心标签的用例保持安静。 */
const VOCABULARY = ['产品', '工程', 'AI', '知识管理', 'Astro', '信息架构']

function planFor(
  content: Buffer,
  options: {
    /** 磁盘上已存在的目标文章（正文已去掉 frontmatter）；存在即计划为更新。 */
    existing?: { path: string; body: string }
    slug?: string
    description?: string
    path?: string
    now?: Date
    /** 站内已有标签；默认是仓库当前那六个，标签用例各自注入。 */
    vocabulary?: string[]
    /** 附件文件：绝对路径 → 字节。 */
    files?: Record<string, Buffer>
    /** 额外存在的目录（例如笔记库根的 .obsidian）。 */
    dirs?: string[]
  } = {}
): IngestPlan {
  const files = options.files ?? {}
  const dirs = options.dirs ?? []
  const existing = options.existing
  return buildIngestPlan({
    path: options.path ?? 'E:/notes/source.md',
    content,
    collection: 'blog',
    slug: options.slug,
    description: options.description,
    vocabulary: options.vocabulary ?? VOCABULARY,
    findEntry: (_collection, slug) =>
      existing !== undefined &&
      (existing.path.endsWith(`/${slug}.md`) || existing.path.endsWith(`/${slug}.mdx`))
        ? existing.path
        : undefined,
    exists: (path) => Object.hasOwn(files, path) || dirs.includes(path),
    read: (path) => {
      if (existing !== undefined && path === existing.path) {
        return Buffer.from(existing.body)
      }
      const bytes = files[path]
      if (bytes === undefined) throw new Error(`ENOENT: ${path}`)
      return bytes
    },
    now: () => options.now ?? NOW
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
    tags: {
      value: ['ai', '知识管理'],
      source: 'frontmatter',
      items: [
        { value: 'ai', source: 'existing' },
        { value: '知识管理', source: 'existing' }
      ]
    },
    pubDate: { value: '2026-10-17', source: 'frontmatter' },
    slug: { value: '20261017-context-assets', source: 'title' }
  })
  expect(plan.body).toEqual({
    h1: { found: false, text: null, equivalentToTitle: false },
    preview: '正文第一段。'
  })
  expect(plan.images).toEqual([])
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1'])
  expect(plan.commit).toEqual({ message: 'content: publish 20261017-context-assets' })
})

test('bytes counts UTF-8 bytes, not characters', () => {
  const content = note(`title: '中文标题'\ncreated: 2026-10-17`, '中文。\n')

  expect(planFor(content).source.bytes).toBe(content.byteLength)
  expect(content.byteLength).toBeGreaterThan(content.toString('utf8').length)
})

test('a note without frontmatter falls back to the body H1 and today', () => {
  const plan = planFor(Buffer.from('# Hello World\n\n正文。\n'))

  expect(plan.fields.title).toEqual({ value: 'Hello World', source: 'h1' })
  expect(plan.fields.pubDate).toEqual({ value: '2026-10-17', source: 'today' })
  expect(plan.fields.description).toEqual({ value: null, source: 'missing' })
  expect(plan.fields.tags).toEqual({ value: [], source: 'missing', items: [] })
  expect(plan.article.slug).toBe('20261017-hello-world')
  expect(plan.body.h1).toEqual({ found: true, text: 'Hello World', equivalentToTitle: true })
  expect(plan.warnings.map((warning) => warning.code)).toEqual([
    'title-fallback',
    'missing-description'
  ])
})

test('a note without frontmatter and without an H1 takes its title from the filename', () => {
  const plan = planFor(Buffer.from('就是一段正文。\n'), { path: 'E:/notes/daily-notes.md' })

  expect(plan.fields.title).toEqual({ value: 'daily-notes', source: 'filename' })
  expect(plan.fields.pubDate).toEqual({ value: '2026-10-17', source: 'today' })
  expect(plan.article.slug).toBe('20261017-daily-notes')
  expect(plan.body.h1).toEqual({ found: false, text: null, equivalentToTitle: false })
  expect(plan.warnings.map((warning) => warning.code)).toEqual([
    'title-fallback',
    'no-h1',
    'missing-description'
  ])
  expect(plan.warnings[0].message).toContain('文件名')
})

test('malformed YAML is rejected', () => {
  expect(() => planFor(Buffer.from(`---\ntitle: 'x'\ntags: [a, b\n---\n\n正文\n`))).toThrow()
})

test('frontmatter without a title falls back to the body H1 before the filename', () => {
  const plan = planFor(note(`description: '只有描述'`, '# 正文里的标题\n\n正文。\n'), {
    path: 'E:/notes/daily-notes.md'
  })

  expect(plan.fields.title).toEqual({ value: '正文里的标题', source: 'h1' })
  expect(plan.fields.description).toEqual({ value: '只有描述', source: 'frontmatter' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['title-fallback', 'slug-not-valid'])
})

test('frontmatter without a title and no H1 falls back to the filename', () => {
  const plan = planFor(note(`description: '只有描述'`, '正文。\n'), {
    path: 'E:/notes/daily-notes.md'
  })

  expect(plan.fields.title).toEqual({ value: 'daily-notes', source: 'filename' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['title-fallback', 'no-h1'])
})

test('a missing description warns and stays absent instead of being invented', () => {
  const plan = planFor(note(`title: 'note-without-description'\ncreated: 2026-10-13`))

  expect(plan.fields.description).toEqual({ value: null, source: 'missing' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1', 'missing-description'])
  expect(renderArticle(plan.fields, plan.body.preview)).not.toContain('description:')
})

test('an empty description is treated as missing', () => {
  const plan = planFor(note(`title: '空描述'\ndescription: '  '\ncreated: 2026-10-13`))

  expect(plan.fields.description).toEqual({ value: null, source: 'missing' })
})

test('a supplied description beats the frontmatter one and is reported as cli', () => {
  const plan = planFor(note(`title: 'note'\ndescription: '笔记里的描述'\ncreated: 2026-10-17`), {
    description: '调用方给的摘要'
  })

  expect(plan.fields.description).toEqual({ value: '调用方给的摘要', source: 'cli' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1'])
  expect(renderArticle(plan.fields, plan.body.preview)).toContain(`description: '调用方给的摘要'`)
})

test('a supplied description alone satisfies the required field', () => {
  const plan = planFor(Buffer.from('# Note\n\n正文。\n'), { description: '一句摘要', slug: 'note' })

  expect(plan.fields.description).toEqual({ value: '一句摘要', source: 'cli' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['title-fallback'])
})

test('a whitespace-only description is treated as absent', () => {
  const blank = planFor(note(`title: 'note'\ncreated: 2026-10-17`), { description: '   ' })
  expect(blank.fields.description).toEqual({ value: null, source: 'missing' })
  expect(blank.warnings.map((warning) => warning.code)).toEqual(['no-h1', 'missing-description'])

  const fallback = planFor(
    note(`title: 'note'\ndescription: '笔记里的描述'\ncreated: 2026-10-17`),
    { description: '\t ' }
  )
  expect(fallback.fields.description).toEqual({ value: '笔记里的描述', source: 'frontmatter' })
})

test('pubDate falls back to the local date when frontmatter has no date', () => {
  const plan = planFor(note(`title: 'no-date'\ndescription: '描述'`), {
    now: new Date(2026, 0, 5, 23, 59)
  })

  expect(plan.fields.pubDate).toEqual({ value: '2026-01-05', source: 'today' })
  expect(plan.fields.title).toEqual({ value: 'no-date', source: 'frontmatter' })
  expect(plan.article.slug).toBe('20260105-no-date')
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1'])
})

test('an unusable created falls through to date instead of failing', () => {
  const plan = planFor(
    note(`title: 'fall-through'\ndescription: '描述'\ncreated: '不是日期'\ndate: 2026-09-09`)
  )

  expect(plan.fields.pubDate).toEqual({ value: '2026-09-09', source: 'frontmatter' })
})

test('a video-summary note using the date field still gets a pubDate', () => {
  const plan = planFor(note(`title: '视频笔记'\ndate: 2026-09-09`))

  expect(plan.fields.pubDate).toEqual({ value: '2026-09-09', source: 'frontmatter' })
  expect(plan.article.slug).toBe('20260909-视频笔记')
})

test('missing tags become an empty list with the missing source', () => {
  const plan = planFor(note(`title: '没有标签'\ncreated: 2026-10-13`))

  expect(plan.fields.tags).toEqual({ value: [], source: 'missing', items: [] })
  expect(renderArticle(plan.fields, plan.body.preview)).not.toContain('tags:')
})

test('with an empty corpus every tag is new and warns once per tag', () => {
  const plan = planFor(
    note(`title: 'empty-corpus'\ndescription: '描述'\ncreated: 2026-10-17\ntags: ['产品', 'AI']`),
    { vocabulary: [] }
  )

  expect(plan.fields.tags).toEqual({
    value: ['产品', 'ai'],
    source: 'frontmatter',
    items: [
      { value: '产品', source: 'new' },
      { value: 'ai', source: 'new' }
    ]
  })
  expect(plan.warnings.map((warning) => warning.code)).toEqual([
    'no-h1',
    'tag-not-in-vocabulary',
    'tag-not-in-vocabulary'
  ])
  expect(plan.warnings[1].message).toContain('标签「产品」不在站内词表里')
  expect(plan.warnings[1].message).toContain('/tags/产品')
  expect(plan.warnings[2].message).toContain('标签「ai」不在站内词表里')
})

test('every tag already in the corpus is existing and warns nothing', () => {
  const plan = planFor(
    note(
      `title: 'all-known'\ndescription: '描述'\ncreated: 2026-10-17\ntags: ['产品', '工程', 'AI', '知识管理', 'Astro', '信息架构']`
    )
  )

  expect(plan.fields.tags.items.map((tag) => tag.source)).toEqual([
    'existing',
    'existing',
    'existing',
    'existing',
    'existing',
    'existing'
  ])
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1'])
})

test('a mix marks each tag separately and warns only for the new one', () => {
  const plan = planFor(
    note(`title: 'mixed-tags'\ndescription: '描述'\ncreated: 2026-10-17\ntags: ['产品', 'RAG']`),
    { vocabulary: ['产品'] }
  )

  expect(plan.fields.tags.items).toEqual([
    { value: '产品', source: 'existing' },
    { value: 'rag', source: 'new' }
  ])
  expect(plan.warnings.map((warning) => warning.code)).toEqual([
    'no-h1',
    'tag-not-in-vocabulary'
  ])
  expect(plan.warnings[1].message).toContain('/tags/rag')
})

test('tag matching is case-insensitive and duplicates collapse to the stored form', () => {
  const plan = planFor(
    note(
      `title: 'case-tags'\ndescription: '描述'\ncreated: 2026-10-17\ntags: ['AI', 'ai', '知识管理', 'AI']`
    ),
    { vocabulary: ['AI', '知识管理'] }
  )

  expect(plan.fields.tags.value).toEqual(['ai', '知识管理'])
  expect(plan.fields.tags.items).toEqual([
    { value: 'ai', source: 'existing' },
    { value: '知识管理', source: 'existing' }
  ])
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1'])
  expect(renderArticle(plan.fields, plan.body.preview)).toContain(`tags: ['ai', '知识管理']`)
})

test('CJK tags match the vocabulary like any other tag', () => {
  const plan = planFor(
    note(
      `title: 'cjk-tags'\ndescription: '描述'\ncreated: 2026-10-17\ntags: ['知识管理', '信息架构', '产品']`
    ),
    { vocabulary: ['产品', '信息架构', '知识管理'] }
  )

  expect(plan.fields.tags.items.map((tag) => tag.source)).toEqual([
    'existing',
    'existing',
    'existing'
  ])
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1'])
})

test('a tags block that is not an array of strings is rejected', () => {
  expect(() => planFor(note(`title: 'x'\ntags: 'AI'`))).toThrow(
    'frontmatter 的 tags 不是字符串数组'
  )
  expect(() => planFor(note(`title: 'x'\ntags: ['AI', 42]`))).toThrow(
    'frontmatter 的 tags 不是字符串数组'
  )
})

test('collectTagVocabulary unions the tags of every article and skips unusable ones', () => {
  const files: Record<string, Buffer> = {
    'src/content/blog/a.md': note(`title: 'A'\ntags: ['AI', '知识管理']`),
    'src/content/notes/b.md': note(`title: 'B'\ntags: ['ai', 'Astro']`),
    'src/content/notes/no-tags.md': note(`title: '没有标签'`),
    'src/content/product/broken.md': Buffer.from('---\ntitle: [\n---\n')
  }
  const vocabulary = collectTagVocabulary({
    articles: Object.keys(files),
    read: (path) => {
      const bytes = files[path]
      if (bytes === undefined) throw new Error(`ENOENT: ${path}`)
      return bytes
    }
  })

  expect([...vocabulary].sort()).toEqual(['ai', 'astro', '知识管理'])
})

test('an empty corpus collects an empty vocabulary', () => {
  const vocabulary = collectTagVocabulary({
    articles: [],
    read: () => {
      throw new Error('不该读任何文件')
    }
  })

  expect(vocabulary.size).toBe(0)
})

test('adding an article with a new tag grows the vocabulary', () => {
  const article = note(`title: 'new-post'\ntags: ['RAG']`)
  const before = collectTagVocabulary({ articles: [], read: () => Buffer.alloc(0) })
  const after = collectTagVocabulary({ articles: ['src/content/blog/new.md'], read: () => article })

  expect(before.has('rag')).toBe(false)
  expect(after.has('rag')).toBe(true)
})

test('an existing target is marked and planned as an update', () => {
  const plan = planFor(note(`title: '已有文章'\ncreated: 2026-10-17`), {
    existing: { path: 'src/content/blog/20261017-已有文章.md', body: '正文。' }
  })

  expect(plan.article).toEqual({
    collection: 'blog',
    slug: '20261017-已有文章',
    targetPath: 'src/content/blog/20261017-已有文章.md',
    exists: true,
    mode: 'update'
  })
  // 正文一致时 diff 是空串：覆盖不会改变任何一行。
  expect(plan.body.diff).toBe('')
  expect(plan.commit.message).toBe('content: update 20261017-已有文章')
})

test('a create plan keeps its exact shape: no mode and no diff', () => {
  const plan = planFor(note(`title: 'brand-new'\ncreated: 2026-10-17`))

  expect(plan.article).toEqual({
    collection: 'blog',
    slug: '20261017-brand-new',
    targetPath: 'src/content/blog/20261017-brand-new.md',
    exists: false
  })
  expect('mode' in plan.article).toBe(false)
  expect('diff' in plan.body).toBe(false)
})

test('an update plan carries the diff between the disk body and the overwritten body', () => {
  const plan = planFor(note(`title: 'edit-me'\ncreated: 2026-10-17`, '# edit-me\n\n新正文。\n'), {
    existing: { path: 'src/content/blog/20261017-edit-me.md', body: '旧正文。' }
  })

  expect(plan.body.preview).toBe('新正文。')
  expect(plan.body.diff).toBe(
    ['--- 当前正文', '+++ 覆盖后正文', '@@ -1,1 +1,1 @@', '-旧正文。', '+新正文。'].join('\n')
  )
})

test('an update whose body is unchanged reports an empty diff', () => {
  const plan = planFor(note(`title: 'same'\ncreated: 2026-10-17`), {
    existing: { path: 'src/content/blog/20261017-same.md', body: '正文。' }
  })

  expect(plan.body.diff).toBe('')
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
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1'])
})

test('an update keeps the supplied slug too', () => {
  const plan = planFor(note(`title: '中文标题'\ncreated: 2026-10-17`), {
    existing: { path: 'src/content/blog/20261017-existing-post.md', body: '正文。' },
    slug: 'existing-post'
  })

  expect(plan.article.mode).toBe('update')
  expect(plan.commit.message).toBe('content: update 20261017-existing-post')
})

test('an illegal supplied slug warns in the plan instead of being fixed silently', () => {
  const cases = ['Ticket', 'has space', '-leading', 'a'.repeat(81), '']
  for (const slug of cases) {
    const plan = planFor(note(`title: '中文标题'\ndescription: '描述'\ncreated: 2026-10-17`), {
      slug
    })

    expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1', 'slug-not-valid'])
    expect(plan.fields.slug.source).toBe('cli')
    expect(plan.warnings[1].message).toContain('--slug')
  }
})

test('a Chinese-derived slug is reported as not valid, with the title as its source', () => {
  const plan = planFor(note(`title: '视频笔记'\ndescription: '描述'\ndate: 2026-09-09`))

  expect(plan.fields.slug).toEqual({ value: '20260909-视频笔记', source: 'title' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1', 'slug-not-valid'])
})

test('the body H1 is reported, and equivalence ignores punctuation and case', () => {
  const same = planFor(
    note(`title: '标题：测试'\ncreated: 2026-10-17`, '# 标题 测试！\n\n正文。\n')
  )
  expect(same.body.h1).toEqual({ found: true, text: '标题 测试！', equivalentToTitle: true })

  const different = planFor(note(`title: '标题'\ncreated: 2026-10-17`, '# 别的标题\n\n正文。\n'))
  expect(different.body.h1).toEqual({ found: true, text: '别的标题', equivalentToTitle: false })
})

test('an H1 differing from the title is removed and kept as a description draft', () => {
  const plan = planFor(
    note(`title: 'Short Title'\ncreated: 2026-10-17`, '# A Longer Title\n\n正文。\n')
  )

  expect(plan.body.h1).toEqual({
    found: true,
    text: 'A Longer Title',
    equivalentToTitle: false
  })
  expect(plan.body.preview).toBe('正文。')
  expect(plan.fields.description).toEqual({ value: 'A Longer Title', source: 'h1-draft' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['h1-differs'])
  expect(plan.warnings[0].message).toContain('A Longer Title')
})

test('an equivalent H1 is removed without leaving a description draft', () => {
  const plan = planFor(note(`title: 'Title: Test'\ncreated: 2026-10-17`, '# Title Test!\n\n正文。\n'))

  expect(plan.body.preview).toBe('正文。')
  expect(plan.fields.description).toEqual({ value: null, source: 'missing' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['missing-description'])
})

test('a frontmatter description beats the H1 draft but h1-differs is still reported', () => {
  const plan = planFor(
    note(
      `title: 'Short Title'\ndescription: '人写的描述'\ncreated: 2026-10-17`,
      '# A Longer Title\n\n正文。\n'
    )
  )

  expect(plan.fields.description).toEqual({ value: '人写的描述', source: 'frontmatter' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['h1-differs'])
})

test('a supplied description beats the H1 draft', () => {
  const plan = planFor(
    note(`title: 'Short Title'\ncreated: 2026-10-17`, '# A Longer Title\n\n正文。\n'),
    { description: '调用方写的摘要' }
  )

  expect(plan.fields.description).toEqual({ value: '调用方写的摘要', source: 'cli' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['h1-differs'])
})

test('the H1 is removed wherever it sits in the body', () => {
  const first = planFor(note(`title: 'T'\ncreated: 2026-10-17`, '# T\n\n正文。\n'))
  expect(first.body.preview).toBe('正文。')

  const afterQuote = planFor(note(`title: 'T'\ncreated: 2026-10-17`, '> 引用\n\n# T\n\n正文。\n'))
  expect(afterQuote.body.preview).toBe('> 引用\n\n正文。')

  const afterQuoteWithoutBlank = planFor(
    note(`title: 'T'\ncreated: 2026-10-17`, '> 引用\n# T\n正文。\n')
  )
  expect(afterQuoteWithoutBlank.body.preview).toBe('> 引用\n\n正文。')

  const afterBlankLines = planFor(
    note(`title: 'T'\ncreated: 2026-10-17`, '第一段。\n\n# T\n\n第二段。\n')
  )
  expect(afterBlankLines.body.preview).toBe('第一段。\n\n第二段。')
})

test('a body that is nothing but an H1 becomes an empty preview', () => {
  const plan = planFor(note(`title: 'Only Heading'\ncreated: 2026-10-17`, '# Only Heading\n'))

  expect(plan.body.preview).toBe('')
  expect(plan.fields.description).toEqual({ value: null, source: 'missing' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['missing-description'])
})

test('a body without an H1 warns and is left untouched', () => {
  const plan = planFor(
    note(`title: 'No Heading'\ndescription: '描述'\ncreated: 2026-10-17`, '第一段。\n\n第二段。\n')
  )

  expect(plan.body.h1).toEqual({ found: false, text: null, equivalentToTitle: false })
  expect(plan.body.preview).toBe('第一段。\n\n第二段。')
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1'])
})

test('an H1 that repeats the filename still wins over the filename', () => {
  const plan = planFor(Buffer.from('# daily-notes\n\n正文。\n'), {
    path: 'E:/notes/daily-notes.md'
  })

  expect(plan.fields.title).toEqual({ value: 'daily-notes', source: 'h1' })
  expect(plan.body.h1).toEqual({ found: true, text: 'daily-notes', equivalentToTitle: true })
})

test('the body preview is the body that apply would write, with the H1 removed', () => {
  const plan = planFor(note(`title: '标题'\ncreated: 2026-10-17`, '# 标题\n\n正文。\n'))

  expect(plan.body.preview).toBe('正文。')
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
  expect(article).toContain(`tags: ['ai']`)
  expect(article.endsWith('\n---\n\n正文。\n')).toBe(true)
})

test('renderArticle writes the fallback title and date without inventing a description', () => {
  const plan = planFor(Buffer.from('# Hello World\n\n正文。\n'))

  const article = renderArticle(plan.fields, plan.body.preview)

  expect(article.startsWith(`---\ntitle: 'Hello World'\n`)).toBe(true)
  expect(article).toContain(`pubDate: 2026-10-17`)
  expect(article).not.toContain('description:')
  expect(article).not.toContain('tags:')
  expect(article).not.toContain('# Hello World')
  expect(article.endsWith('\n正文。\n')).toBe(true)
})

test('readNote drops the frontmatter block and trims the body edges', () => {
  const parsed = readNote(Buffer.from(`---\ntitle: 'x'\n---\n\n\n正文。\n\n\n`))

  expect(parsed.frontmatter).toEqual({ title: 'x' })
  expect(parsed.body).toBe('正文。')
})

test('readNote treats a note without frontmatter as an empty frontmatter plus the body', () => {
  const parsed = readNote(Buffer.from('\n\n# 标题\n\n正文。\n\n'))

  expect(parsed.frontmatter).toEqual({})
  expect(parsed.body).toBe('# 标题\n\n正文。')
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

const IMAGE = Buffer.from('fake webp bytes')

function imageNote(body: string, title = 'demo'): Buffer {
  return note(`title: '${title}'\ndescription: '描述'\ncreated: 2026-10-17`, body)
}

test('a wiki embed becomes a Markdown image and its attachment is planned', () => {
  const path = 'E:/notes/source.md'
  const plan = planFor(imageNote('正文。\n\n![[demo-1791295556765.webp]]\n'), {
    path,
    files: { [beside(path, 'demo-1791295556765.webp')]: IMAGE }
  })

  expect(plan.body.preview).toBe('正文。\n\n![demo](../../assets/demo.webp)')
  expect(plan.body.preview).not.toContain('![[')
  expect(plan.images).toEqual([
    {
      from: beside(path, 'demo-1791295556765.webp'),
      to: 'src/assets/demo.webp',
      bytes: IMAGE.byteLength,
      sha256: sha256(IMAGE),
      remote: false
    }
  ])
})

test('wiki size pipes are dropped and non-numeric pipes become the alt text', () => {
  const path = 'E:/notes/source.md'
  const file = beside(path, 'shot-1791295556765.png')
  const plan = planFor(
    imageNote('![[shot-1791295556765.png|395x733]]\n\n![[shot-1791295556765.png|一张截图]]\n'),
    { path, files: { [file]: IMAGE } }
  )

  expect(plan.body.preview).toBe(
    '![shot](../../assets/shot.png)\n\n![一张截图](../../assets/shot.png)'
  )
  expect(plan.images.length).toBe(1)
})

test('a standard Markdown image pointing at a local file is copied too', () => {
  const path = 'E:/notes/source.md'
  const file = beside(path, 'screens', 'shot.png')
  const plan = planFor(imageNote('![红色方框](screens/shot.png)\n'), {
    path,
    files: { [file]: IMAGE }
  })

  expect(plan.body.preview).toBe('![红色方框](../../assets/shot.png)')
  expect(plan.images).toEqual([
    {
      from: file,
      to: 'src/assets/shot.png',
      bytes: IMAGE.byteLength,
      sha256: sha256(IMAGE),
      remote: false
    }
  ])
})

test('remote images are left alone and get the spec warnings', () => {
  const plan = planFor(imageNote('![第三方](https://example.com/x.png)\n'))

  expect(plan.body.preview).toBe('![第三方](https://example.com/x.png)')
  expect(plan.warnings.map((warning) => warning.code)).toEqual([
    'no-h1',
    'remote-image',
    'third-party-image'
  ])
  expect(plan.images).toEqual([
    {
      from: 'https://example.com/x.png',
      to: 'https://example.com/x.png',
      bytes: 0,
      sha256: '',
      remote: true
    }
  ])
})

test('an image on the site domain is remote but not third-party', () => {
  const plan = planFor(imageNote('![本站](https://b00ml.github.io/x.png)\n'))

  expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1', 'remote-image'])
})

test('a missing attachment is an actionable error, not a broken link', () => {
  const path = 'E:/notes/source.md'

  expect(() => planFor(imageNote('正文。\n\n![[gone.webp]]\n'), { path })).toThrow(
    `找不到附件：gone.webp（正文第 3 行）；已查找：${beside(path, 'gone.webp')}`
  )
})

test('13-digit and 14-digit timestamps are stripped from attachment names', () => {
  const path = 'E:/notes/source.md'
  const paste = beside(path, 'Pasted image 20260902183943.png')
  const double = beside(path, 'demo-1791295556765-1791295556766.webp')
  const body =
    '![[Pasted image 20260902183943.png]]\n\n![[demo-1791295556765-1791295556766.webp]]\n'

  const plan = planFor(imageNote(body), { path, files: { [paste]: IMAGE, [double]: IMAGE } })

  expect(plan.images.map((image) => image.to)).toEqual([
    'src/assets/pasted-image.png',
    'src/assets/demo.webp'
  ])
})

test('two attachments with the same cleaned name get distinct targets', () => {
  const path = 'E:/notes/source.md'
  const first = beside(path, 'a', 'pic-1791295556765.png')
  const second = beside(path, 'b', 'pic-1791295556766.png')
  const body = '![一](a/pic-1791295556765.png)\n\n![二](b/pic-1791295556766.png)\n'
  const plan = planFor(imageNote(body), { path, files: { [first]: IMAGE, [second]: IMAGE } })

  expect(plan.images.map((image) => image.to)).toEqual([
    'src/assets/pic.png',
    'src/assets/pic-2.png'
  ])
})

test('an attachment name without Latin letters falls back to the article name', () => {
  const path = 'E:/notes/source.md'
  const first = beside(path, '项目演示-1791295556765.webp')
  const second = beside(path, '项目演示-1791295556766.webp')
  const body = '![[项目演示-1791295556765.webp]]\n\n![[项目演示-1791295556766.webp]]\n'
  const plan = planFor(imageNote(body, 'demo-note'), {
    path,
    files: { [first]: IMAGE, [second]: IMAGE }
  })

  expect(plan.images.map((image) => image.to)).toEqual([
    'src/assets/demo-note.webp',
    'src/assets/demo-note-2.webp'
  ])
})

test('attachments resolve beside the note, in attachments/, and at the vault root', () => {
  const path = 'E:/vault/开发侧/note.md'
  const first = beside(path, 'attachments', 'a-1791295556765.png')
  const second = beside(path, 'attachments', 'b-1791295556766.png')
  const third = beside(path, '..', 'root-1791295556767.png')
  const body =
    '![[a-1791295556765.png]]\n\n![b](attachments/b-1791295556766.png)\n\n![c](/root-1791295556767.png)\n'

  const plan = planFor(imageNote(body), {
    path,
    files: { [first]: IMAGE, [second]: IMAGE, [third]: IMAGE },
    dirs: [beside(path, '..', '.obsidian')]
  })

  expect(plan.images.map((image) => image.from)).toEqual([first, second, third])
})

test('the same attachment referenced twice is planned once', () => {
  const path = 'E:/notes/source.md'
  const file = beside(path, 'same-1791295556765.png')
  const body = '![[same-1791295556765.png]]\n\n![[same-1791295556765.png]]\n'
  const plan = planFor(imageNote(body), { path, files: { [file]: IMAGE } })

  expect(plan.images.length).toBe(1)
  expect(plan.body.preview).toBe(
    '![same](../../assets/same.png)\n\n![same](../../assets/same.png)'
  )
})

test('inline data images are neither copied nor reported', () => {
  const data = '![图片](data:image/svg+xml;base64,AAAA)'
  const plan = planFor(imageNote(`${data}\n`))

  expect(plan.body.preview).toBe(data)
  expect(plan.images).toEqual([])
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1'])
})

test('images are rewritten before the H1 is removed', () => {
  const path = 'E:/notes/source.md'
  const file = beside(path, 'pic-1791295556765.png')
  const plan = planFor(
    note(
      `title: 'demo'\ndescription: '描述'\ncreated: 2026-10-17`,
      '# demo\n\n![[pic-1791295556765.png]]\n'
    ),
    { path, files: { [file]: IMAGE } }
  )

  expect(plan.body.preview).toBe('![pic](../../assets/pic.png)')
})
