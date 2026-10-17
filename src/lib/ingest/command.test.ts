import { expect, test } from 'bun:test'
import { join, resolve } from 'node:path'

import { CONTENT_DIRS } from '../content/entries'
import { runIngest, type IngestDeps } from './command'
import { sha256 } from './plan'

const SOURCE = 'E:/notes/ticket.md'
const TARGET = 'src/content/blog/20261017-a-test-note.md'
const NOTE = `---
title: 'a-test-note'
description: '测试用的描述'
tags: ['测试']
created: 2026-10-17
---

正文。
`

/** 没有 description 的源笔记，用来验证「告警但拒绝写盘」。 */
const NOTE_WITHOUT_DESCRIPTION = `---
title: 'a-test-note'
created: 2026-10-17
---

正文。
`

type Options = {
  note?: string
  status?: string
  /** 磁盘上已有的目标文章：相对路径（正斜杠）→ 文件内容，用来模拟更新。 */
  existingArticles?: Record<string, string>
  /** 词表扫描的站内文章路径；默认只有语料那一篇。 */
  articles?: string[]
  /** 站内已有标签；默认「测试」已在词表里，与 NOTE 的 tags 对齐。传 [] 即空语料。 */
  vocabulary?: string[]
  /** 第二次读源笔记时返回的内容，用来模拟 dry-run 之后源文件被改。 */
  after?: string
  /** 磁盘上已有的文件：绝对路径 → 字节；本地附件也放这里。 */
  files?: Record<string, Buffer>
  /** 第二次读这个附件时换成这些字节，用来模拟计划之后附件被改。 */
  changed?: { path: string; bytes: Buffer }
}

/** 词表扫描时读到的那篇站内文章；读它不计入源笔记的读取次数。 */
const CORPUS_ARTICLE = 'src/content/blog/existing.md'

function harness(options: Options = {}) {
  const stdout: string[] = []
  const stderr: string[] = []
  const writes: { path: string; text: string }[] = []
  const copied: { path: string; bytes: Buffer }[] = []
  const reads: string[] = []
  const gitCalls: string[][] = []
  const files = new Map<string, Buffer>(Object.entries(options.files ?? {}))
  const existingArticles = options.existingArticles ?? {}
  const counts = new Map<string, number>()
  const tags = options.vocabulary ?? ['测试']
  const corpus = `---\ntitle: 'existing'\ntags: [${tags.map((tag) => `'${tag}'`).join(', ')}]\n---\n\n正文。\n`
  let current = options.note ?? NOTE

  const deps: IngestDeps = {
    git: (args) => {
      gitCalls.push(args)
      return options.status ?? ''
    },
    read: (path) => {
      const normalized = path.replace(/\\/g, '/')
      if (normalized === CORPUS_ARTICLE) return Buffer.from(corpus)
      if (Object.hasOwn(existingArticles, normalized)) {
        return Buffer.from(existingArticles[normalized] ?? '')
      }
      reads.push(path)
      const seen = (counts.get(path) ?? 0) + 1
      counts.set(path, seen)
      if (path === SOURCE) {
        if (seen > 1 && options.after !== undefined) current = options.after
        return Buffer.from(current)
      }
      if (seen > 1 && options.changed?.path === path) return options.changed.bytes
      const bytes = files.get(path)
      if (bytes === undefined) throw new Error(`ENOENT: ${path}`)
      return bytes
    },
    exists: (path) => files.has(path) || Object.hasOwn(existingArticles, path),
    writeFile: (path, text) => writes.push({ path, text }),
    writeBytes: (path, bytes) => {
      copied.push({ path, bytes })
      files.set(path, bytes)
    },
    write: (stream, text) => {
      ;(stream === 'stdout' ? stdout : stderr).push(text)
    },
    articles: () => options.articles ?? [CORPUS_ARTICLE],
    entryFile: (collection, slug) =>
      Object.keys(existingArticles).find(
        (path) =>
          path === `${CONTENT_DIRS[collection]}/${slug}.md` ||
          path === `${CONTENT_DIRS[collection]}/${slug}.mdx`
      )
  }

  return {
    writes,
    copied,
    reads,
    gitCalls,
    stdout,
    stderr,
    run: (argv: string[]) => runIngest(argv, deps),
    output: () => JSON.parse(stdout.join(''))
  }
}

test('a dry run prints exactly one JSON plan on stdout and writes nothing', () => {
  const h = harness()

  const code = h.run([SOURCE, '--collection', 'blog'])

  expect(code).toBe(0)
  expect(h.stdout.length).toBe(1)
  expect(h.stdout[0].endsWith('\n')).toBe(true)
  expect(h.writes).toEqual([])
  const out = h.output()
  expect(out.mode).toBe('plan')
  expect(out.status).toBe('planned')
  expect(Object.keys(out.plan)).toEqual([
    'source',
    'article',
    'fields',
    'body',
    'images',
    'warnings',
    'commit'
  ])
  expect(h.stderr.join('')).toContain('入库计划')
})

/** 更新功能之前的创建路径计划，一个字节都不许变：新建文章的计划里没有 mode / diff。 */
const CREATE_PLAN_JSON =
  '{"mode":"plan","status":"planned","plan":{"source":{"path":"E:/notes/ticket.md","sha256":"0b0ecb98dbedf0f411fdea04c9e8a4abc423a4fc0b24d9f8e88e836effee5d22","bytes":111},"article":{"collection":"blog","slug":"20261017-a-test-note","targetPath":"src/content/blog/20261017-a-test-note.md","exists":false},"fields":{"title":{"value":"a-test-note","source":"frontmatter"},"description":{"value":"测试用的描述","source":"frontmatter"},"tags":{"value":["测试"],"source":"frontmatter","items":[{"value":"测试","source":"existing"}]},"pubDate":{"value":"2026-10-17","source":"frontmatter"},"slug":{"value":"20261017-a-test-note","source":"title"}},"body":{"h1":{"found":false,"text":null,"equivalentToTitle":false},"preview":"正文。"},"images":[],"warnings":[{"code":"no-h1","message":"正文没有 H1：没有可删除的标题，正文其余内容原样保留。"}],"commit":{"message":"content: publish 20261017-a-test-note"}}}\n'

test('a create-path plan is byte-identical to the plan before updates existed', () => {
  const h = harness()

  const code = h.run([SOURCE, '--collection', 'blog'])

  expect(code).toBe(0)
  expect(h.stdout.join('')).toBe(CREATE_PLAN_JSON)
})

test('every field in the plan carries a source from the vocabulary', () => {
  const h = harness()

  h.run([SOURCE, '--collection', 'blog'])

  const { fields } = h.output().plan
  const vocabulary = [
    'h1',
    'frontmatter',
    'filename',
    'today',
    'h1-draft',
    'missing',
    'existing',
    'new',
    'title',
    'cli'
  ]
  for (const field of Object.values(fields) as { value: unknown; source: string }[]) {
    expect(vocabulary).toContain(field.source)
    expect(field).toHaveProperty('value')
  }
})

test('the planned article is the collection directory plus date-prefixed slug', () => {
  const h = harness()

  h.run([SOURCE, '--collection', 'blog'])

  const { plan } = h.output()
  expect(plan.article).toEqual({
    collection: 'blog',
    slug: '20261017-a-test-note',
    targetPath: TARGET,
    exists: false
  })
  expect(plan.fields.title).toEqual({ value: 'a-test-note', source: 'frontmatter' })
  expect(plan.fields.pubDate).toEqual({ value: '2026-10-17', source: 'frontmatter' })
  expect(plan.commit.message).toBe('content: publish 20261017-a-test-note')
})

test('the plan marks each tag existing or new and warns for the new ones', () => {
  const note = `---
title: 'tag-note'
description: '描述'
tags: ['AI', 'AI', '新标签']
created: 2026-10-17
---

# tag-note

正文。
`
  const h = harness({ note, vocabulary: ['ai'] })

  const code = h.run([SOURCE, '--collection', 'blog'])

  expect(code).toBe(0)
  const { plan } = h.output()
  expect(plan.fields.tags).toEqual({
    value: ['ai', '新标签'],
    source: 'frontmatter',
    items: [
      { value: 'ai', source: 'existing' },
      { value: '新标签', source: 'new' }
    ]
  })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['tag-not-in-vocabulary'])
  expect(plan.warnings[0].message).toContain('/tags/新标签')
  expect(h.stderr.join('')).toContain('标签：ai（已有），新标签（新增）')
})

test('a new tag is a warning, not a gate: apply still writes the lowercased tags', () => {
  const note = `---
title: 'tag-note'
description: '描述'
tags: ['AI', 'AI', '新标签']
created: 2026-10-17
---

正文。
`
  const h = harness({ note, vocabulary: [] })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(0)
  expect(h.writes.length).toBe(1)
  expect(h.writes[0].text).toContain(`tags: ['ai', '新标签']`)
  expect(h.output().status).toBe('ingested')
})

test('--slug flows into the article, its target path and the commit message', () => {
  const h = harness()

  const code = h.run([SOURCE, '--collection', 'blog', '--slug', 'leetcode-first-glance'])

  expect(code).toBe(0)
  const { plan } = h.output()
  expect(plan.article).toEqual({
    collection: 'blog',
    slug: '20261017-leetcode-first-glance',
    targetPath: 'src/content/blog/20261017-leetcode-first-glance.md',
    exists: false
  })
  expect(plan.fields.slug).toEqual({ value: '20261017-leetcode-first-glance', source: 'cli' })
  expect(plan.commit.message).toBe('content: publish 20261017-leetcode-first-glance')
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['no-h1'])
  expect(h.writes).toEqual([])
})

test('an illegal --slug warns in plan mode and still returns the plan', () => {
  for (const slug of ['Ticket', 'has space', '-leading', 'a'.repeat(81), '']) {
    const h = harness()

    const code = h.run([SOURCE, '--collection', 'blog', '--slug', slug])

    expect(code).toBe(0)
    expect(h.output().plan.warnings.map((warning) => warning.code)).toEqual([
      'no-h1',
      'slug-not-valid'
    ])
  }
})

test('an illegal --slug aborts apply with exit 2 and writes nothing', () => {
  for (const slug of ['Ticket', 'has space', '-leading', 'a'.repeat(81), '']) {
    const h = harness()

    const code = h.run([SOURCE, '--collection', 'blog', '--slug', slug, '--apply'])

    expect(code).toBe(2)
    expect(h.output().error.step).toBe('usage')
    expect(h.output().error.message).toContain('--slug')
    expect(h.writes).toEqual([])
  }
})

test('a Chinese-derived slug is warned about in plan mode and refused by apply', () => {
  const note = NOTE.replace(`title: 'a-test-note'`, `title: '一篇测试笔记'`)

  const planRun = harness({ note })
  expect(planRun.run([SOURCE, '--collection', 'blog'])).toBe(0)
  expect(planRun.output().plan.article.slug).toBe('20261017-一篇测试笔记')
  expect(planRun.output().plan.warnings.map((warning) => warning.code)).toEqual([
    'no-h1',
    'slug-not-valid'
  ])

  const applyRun = harness({ note })
  expect(applyRun.run([SOURCE, '--collection', 'blog', '--apply'])).toBe(2)
  expect(applyRun.output().error.message).toContain('--slug')
  expect(applyRun.writes).toEqual([])
})

test('a Chinese H1 without frontmatter warns in plan mode and refuses apply without --slug', () => {
  const note = '# 一篇测试笔记\n\n正文。\n'

  const planRun = harness({ note })
  expect(planRun.run([SOURCE, '--collection', 'blog'])).toBe(0)
  expect(planRun.output().plan.fields.title).toEqual({ value: '一篇测试笔记', source: 'h1' })
  expect(planRun.output().plan.warnings.map((warning) => warning.code)).toEqual([
    'title-fallback',
    'slug-not-valid',
    'missing-description'
  ])

  const applyRun = harness({ note })
  expect(applyRun.run([SOURCE, '--collection', 'blog', '--apply'])).toBe(2)
  expect(applyRun.output().error.message).toContain('--slug')
  expect(applyRun.writes).toEqual([])
})

test('--slug overrides a Chinese title so apply writes the English slug', () => {
  const h = harness({ note: NOTE.replace(`title: 'a-test-note'`, `title: '一篇测试笔记'`) })

  const code = h.run([SOURCE, '--collection', 'blog', '--slug', 'ticket-note', '--apply'])

  expect(code).toBe(0)
  expect(h.writes.length).toBe(1)
  expect(h.writes[0].path).toBe('src/content/blog/20261017-ticket-note.md')
  expect(h.output().result).toEqual({ targetPath: 'src/content/blog/20261017-ticket-note.md' })
})

test('--description beats the frontmatter description in the plan', () => {
  const h = harness()

  const code = h.run([SOURCE, '--collection', 'blog', '--description', '调用方给的摘要'])

  expect(code).toBe(0)
  expect(h.output().plan.fields.description).toEqual({ value: '调用方给的摘要', source: 'cli' })
  expect(h.output().plan.warnings.map((warning) => warning.code)).toEqual(['no-h1'])
})

test('a differing H1 keeps its wording as a description draft in the plan', () => {
  const h = harness({ note: NOTE_WITHOUT_DESCRIPTION.replace('正文。\n', '# 另一个标题\n\n正文。\n') })

  const code = h.run([SOURCE, '--collection', 'blog'])

  expect(code).toBe(0)
  const { plan } = h.output()
  expect(plan.body.h1).toEqual({ found: true, text: '另一个标题', equivalentToTitle: false })
  expect(plan.body.preview).toBe('正文。')
  expect(plan.fields.description).toEqual({ value: '另一个标题', source: 'h1-draft' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual(['h1-differs'])
  expect(h.writes).toEqual([])
})

test('--description beats the H1 draft without hiding the difference', () => {
  const h = harness({ note: NOTE_WITHOUT_DESCRIPTION.replace('正文。\n', '# 另一个标题\n\n正文。\n') })

  const code = h.run([SOURCE, '--collection', 'blog', '--description', '人写的摘要'])

  expect(code).toBe(0)
  expect(h.output().plan.fields.description).toEqual({ value: '人写的摘要', source: 'cli' })
  expect(h.output().plan.warnings.map((warning) => warning.code)).toEqual(['h1-differs'])
})

test('--description=text is accepted like the separate form', () => {
  const h = harness()

  const code = h.run([SOURCE, '--collection', 'blog', '--description=等号形式的摘要'])

  expect(code).toBe(0)
  expect(h.output().plan.fields.description).toEqual({ value: '等号形式的摘要', source: 'cli' })
})

test('a description from the flag alone lets apply write the article', () => {
  const h = harness({ note: NOTE_WITHOUT_DESCRIPTION })

  const code = h.run([SOURCE, '--collection', 'blog', '--description', '一句摘要', '--apply'])

  expect(code).toBe(0)
  expect(h.writes.length).toBe(1)
  expect(h.writes[0].text).toContain(`description: '一句摘要'\n`)
  expect(h.writes[0].text).toContain(`pubDate: 2026-10-17\n`)
})

test('a missing description warns in plan mode and aborts apply with exit 2', () => {
  const planRun = harness({ note: NOTE_WITHOUT_DESCRIPTION })
  expect(planRun.run([SOURCE, '--collection', 'blog'])).toBe(0)
  expect(planRun.output().plan.fields.description).toEqual({ value: null, source: 'missing' })
  expect(planRun.output().plan.warnings.map((warning) => warning.code)).toEqual([
    'no-h1',
    'missing-description'
  ])
  expect(planRun.writes).toEqual([])

  const applyRun = harness({ note: NOTE_WITHOUT_DESCRIPTION })
  expect(applyRun.run([SOURCE, '--collection', 'blog', '--apply'])).toBe(2)
  expect(applyRun.output().error.step).toBe('usage')
  expect(applyRun.output().error.message).toContain('--description')
  expect(applyRun.writes).toEqual([])
})

test('a whitespace-only --description is treated as missing and refused by apply', () => {
  const planRun = harness({ note: NOTE_WITHOUT_DESCRIPTION })
  expect(planRun.run([SOURCE, '--collection', 'blog', '--description', '   '])).toBe(0)
  expect(planRun.output().plan.fields.description).toEqual({ value: null, source: 'missing' })
  expect(planRun.output().plan.warnings.map((warning) => warning.code)).toEqual([
    'no-h1',
    'missing-description'
  ])

  const applyRun = harness({ note: NOTE_WITHOUT_DESCRIPTION })
  expect(applyRun.run([SOURCE, '--collection', 'blog', '--description', ' ', '--apply'])).toBe(2)
  expect(applyRun.output().error.message).toContain('--description')
  expect(applyRun.writes).toEqual([])
})

test('a missing --collection is a usage error and no article is written', () => {
  const h = harness()

  const code = h.run([SOURCE])

  expect(code).toBe(2)
  expect(h.output().error.step).toBe('usage')
  expect(h.output().error.message).toContain('--collection')
  expect(h.writes).toEqual([])
})

test('an unknown collection is rejected instead of guessed', () => {
  const h = harness()

  const code = h.run([SOURCE, '--collection', 'posts'])

  expect(code).toBe(2)
  expect(h.output().error.step).toBe('usage')
  expect(h.output().error.message).toContain('posts')
  expect(h.writes).toEqual([])
})

test('an unreadable source is a usage error that names the path', () => {
  const h = harness()

  const code = h.run(['E:/notes/missing.md', '--collection', 'blog'])

  expect(code).toBe(2)
  expect(h.output().error.message).toContain('读不到源笔记')
  expect(h.writes).toEqual([])
})

test('malformed YAML fails before anything is written', () => {
  const h = harness({ note: `---\ntitle: 'x'\ntags: [a, b\n---\n\n正文\n` })

  const code = h.run([SOURCE, '--collection', 'notes', '--apply'])

  expect(code).toBe(2)
  expect(h.writes).toEqual([])
})

test('a note without frontmatter plans from the body H1 and today instead of failing', () => {
  const h = harness({ note: '# a-draft-post\n\n正文。\n' })

  const code = h.run([SOURCE, '--collection', 'blog'])

  expect(code).toBe(0)
  const { plan } = h.output()
  expect(plan.fields.title).toEqual({ value: 'a-draft-post', source: 'h1' })
  expect(plan.fields.pubDate.source).toBe('today')
  expect(plan.fields.pubDate.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(plan.fields.description).toEqual({ value: null, source: 'missing' })
  expect(plan.warnings.map((warning) => warning.code)).toEqual([
    'title-fallback',
    'missing-description'
  ])
  expect(h.writes).toEqual([])
})

test('a note with frontmatter but no title falls back to the filename', () => {
  const h = harness({ note: `---\ndescription: '没有标题'\ncreated: 2026-10-17\n---\n\n正文\n` })

  const code = h.run([SOURCE, '--collection', 'blog'])

  expect(code).toBe(0)
  expect(h.output().plan.fields.title).toEqual({ value: 'ticket', source: 'filename' })
  expect(h.output().plan.warnings.map((warning) => warning.code)).toEqual([
    'title-fallback',
    'no-h1'
  ])
})

test('apply writes the frontmatter and the body with the H1 removed', () => {
  const h = harness({ note: NOTE.replace('正文。\n', '# 正文里的标题\n\n正文。\n') })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(0)
  expect(h.writes.length).toBe(1)
  const [write] = h.writes
  expect(write.path).toBe(TARGET)
  expect(write.text.startsWith(`---\ntitle: 'a-test-note'\n`)).toBe(true)
  expect(write.text).toContain(`pubDate: 2026-10-17`)
  expect(write.text).toContain(`tags: ['测试']`)
  expect(write.text).not.toContain('# 正文里的标题')
  expect(write.text.endsWith('\n正文。\n')).toBe(true)
  expect(h.output().status).toBe('ingested')
  expect(h.output().result).toEqual({ targetPath: TARGET })
})

test('apply writes fallback fields and drops the body H1 that became the title', () => {
  const h = harness({ note: '# a-draft-post\n\n正文。\n' })

  const code = h.run([SOURCE, '--collection', 'blog', '--description', '兜底写的摘要', '--apply'])

  expect(code).toBe(0)
  expect(h.writes.length).toBe(1)
  const [write] = h.writes
  expect(write.path).toMatch(/^src\/content\/blog\/\d{8}-a-draft-post\.md$/)
  expect(write.text).toMatch(
    /^---\ntitle: 'a-draft-post'\ndescription: '兜底写的摘要'\npubDate: \d{4}-\d{2}-\d{2}\n---\n\n/
  )
  expect(write.text).not.toContain('# a-draft-post')
  expect(write.text.endsWith('\n正文。\n')).toBe(true)
})

test('apply aborts when the workspace is dirty', () => {
  const h = harness({ status: ' M src/pages/index.astro\0' })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(3)
  expect(h.output().error.step).toBe('workspace')
  expect(h.output().error.message).toContain('src/pages/index.astro')
  expect(h.writes).toEqual([])
  expect(h.gitCalls).toEqual([['status', '--porcelain', '-z', '-uall']])
})

const EXISTING_ARTICLE = `---
title: 'a-test-note'
description: '测试用的描述'
pubDate: 2026-10-17
---

旧正文。
`

test('a dry run against an existing article plans an update and shows the body diff', () => {
  const h = harness({ existingArticles: { [TARGET]: EXISTING_ARTICLE } })

  const code = h.run([SOURCE, '--collection', 'blog'])

  expect(code).toBe(0)
  expect(h.writes).toEqual([])
  const { plan } = h.output()
  expect(plan.article).toEqual({
    collection: 'blog',
    slug: '20261017-a-test-note',
    targetPath: TARGET,
    exists: true,
    mode: 'update'
  })
  expect(plan.body.diff).toBe(
    [
      '--- 当前正文',
      '+++ 覆盖后正文',
      '@@ -1,1 +1,1 @@',
      '-旧正文。',
      '+正文。'
    ].join('\n')
  )
  expect(h.stderr.join('')).toContain('（更新，覆盖已有文章）')
  expect(h.stderr.join('')).toContain('正文差异（当前 → 覆盖后）')
  expect(h.stderr.join('')).toContain('-旧正文。')
})

test('--apply overwrites an existing article and reports an update', () => {
  const h = harness({ existingArticles: { [TARGET]: EXISTING_ARTICLE } })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(0)
  expect(h.writes.length).toBe(1)
  const [write] = h.writes
  expect(write.path).toBe(TARGET)
  expect(write.text).not.toContain('旧正文。')
  expect(write.text.endsWith('\n正文。\n')).toBe(true)
  expect(h.output().status).toBe('ingested')
  expect(h.output().plan.article.mode).toBe('update')
  expect(h.stderr.join('')).toContain(`已更新：${TARGET}`)
})

test('an update excludes the replaced article from the tag vocabulary', () => {
  const note = `---
title: 'a-test-note'
description: '测试用的描述'
tags: ['独家']
created: 2026-10-17
---

正文。
`
  const existing = `---
title: 'a-test-note'
tags: ['独家']
---

正文。
`
  const h = harness({
    note,
    existingArticles: { [TARGET]: existing },
    // 扫描路径用反斜杠，锁定它与 findEntry 返回的正斜杠路径的归一化。
    articles: [CORPUS_ARTICLE, TARGET.replace(/\//g, '\\')]
  })

  const code = h.run([SOURCE, '--collection', 'blog'])

  expect(code).toBe(0)
  const { plan } = h.output()
  // 独家 只由被覆盖的这篇文章承载：覆盖会删掉最后一个载体，所以它必须报成新增。
  expect(plan.fields.tags.items).toEqual([{ value: '独家', source: 'new' }])
  expect(plan.warnings.map((warning) => warning.code)).toContain('tag-not-in-vocabulary')
})

test('the vocabulary still sees tags carried by articles that are not being replaced', () => {
  const note = `---
title: 'a-test-note'
description: '测试用的描述'
tags: ['独家']
created: 2026-10-17
---

正文。
`
  const other = 'src/content/blog/other.md'
  const h = harness({
    note,
    existingArticles: { [other]: `---\ntitle: 'other'\ntags: ['独家']\n---\n\n正文。\n` },
    articles: [CORPUS_ARTICLE, other]
  })

  h.run([SOURCE, '--collection', 'blog'])

  expect(h.output().plan.fields.tags.items).toEqual([{ value: '独家', source: 'existing' }])
})

test('apply re-reads the source and aborts when its bytes changed after the dry run', () => {
  const h = harness({ after: NOTE.replace('正文。', '正文改了。') })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(3)
  expect(h.reads.length).toBe(2)
  expect(h.output().error.step).toBe('workspace')
  expect(h.output().error.message).toContain('重新运行')
  expect(h.writes).toEqual([])
})

test('a failed apply still reports the plan it had built', () => {
  const h = harness({ status: ' M src/pages/index.astro\0' })

  h.run([SOURCE, '--collection', 'blog', '--apply'])

  const out = h.output()
  expect(out.status).toBe('failed')
  expect(out.plan.article.slug).toBe('20261017-a-test-note')
})

test('unknown flags are usage errors', () => {
  const h = harness()

  const code = h.run([SOURCE, '--collection', 'blog', '--force'])

  expect(code).toBe(2)
  expect(h.output().error.message).toContain('--force')
})

test('--help prints usage to stdout and exits zero', () => {
  const h = harness()

  const code = h.run(['--help'])

  expect(code).toBe(0)
  expect(h.stdout.join('')).toContain('用法')
})

const ASSET = Buffer.from('fake webp bytes')
const ATTACHMENT = join('E:/notes', 'demo-1791295556765.webp')

function noteWithImage(body: string): string {
  return `---\ntitle: 'a-test-note'\ndescription: '测试用的描述'\ncreated: 2026-10-17\n---\n\n${body}`
}

test('--apply copies local attachments and writes ../../assets references', () => {
  const h = harness({
    note: noteWithImage('正文。\n\n![[demo-1791295556765.webp]]\n'),
    files: { [ATTACHMENT]: ASSET }
  })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(0)
  expect(h.copied).toEqual([{ path: 'src/assets/demo.webp', bytes: ASSET }])
  expect(h.writes.length).toBe(1)
  const [write] = h.writes
  expect(write.path).toBe(TARGET)
  expect(write.text).toContain('![demo](../../assets/demo.webp)')
  expect(write.text).not.toContain('![[')
  expect(h.output().plan.images).toEqual([
    {
      from: ATTACHMENT,
      to: 'src/assets/demo.webp',
      bytes: ASSET.byteLength,
      sha256: sha256(ASSET),
      remote: false
    }
  ])
})

test('a dry run lists the images it would copy', () => {
  const h = harness({
    note: noteWithImage('![[demo-1791295556765.webp]]\n'),
    files: { [ATTACHMENT]: ASSET }
  })

  const code = h.run([SOURCE, '--collection', 'blog'])

  expect(code).toBe(0)
  expect(h.copied).toEqual([])
  expect(h.writes).toEqual([])
  expect(h.stderr.join('')).toContain('图片：1 张')
  expect(h.stderr.join('')).toContain(`${ATTACHMENT} → src/assets/demo.webp`)
})

test('--apply skips an attachment that is already copied with the same bytes', () => {
  const h = harness({
    note: noteWithImage('![[demo-1791295556765.webp]]\n'),
    files: { [ATTACHMENT]: ASSET, 'src/assets/demo.webp': ASSET }
  })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(0)
  expect(h.copied).toEqual([])
  expect(h.writes.length).toBe(1)
})

test('--apply refuses to overwrite a different file at the same asset path', () => {
  const h = harness({
    note: noteWithImage('![[demo-1791295556765.webp]]\n'),
    files: { [ATTACHMENT]: ASSET, 'src/assets/demo.webp': Buffer.from('another image') }
  })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(3)
  expect(h.output().error.message).toContain('目标图片已存在')
  expect(h.copied).toEqual([])
  expect(h.writes).toEqual([])
})

test('--apply aborts when an attachment changed after the dry run', () => {
  const h = harness({
    note: noteWithImage('![[demo-1791295556765.webp]]\n'),
    files: { [ATTACHMENT]: ASSET },
    changed: { path: ATTACHMENT, bytes: Buffer.from('changed bytes') }
  })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(3)
  expect(h.output().error.message).toContain('附件在生成计划之后被修改')
  expect(h.copied).toEqual([])
  expect(h.writes).toEqual([])
})

test('a missing attachment is a usage error and writes nothing', () => {
  const h = harness({ note: noteWithImage('正文。\n\n![[gone.webp]]\n') })

  const code = h.run([SOURCE, '--collection', 'blog'])

  expect(code).toBe(2)
  expect(h.output().error.step).toBe('usage')
  expect(h.output().error.message).toContain('找不到附件：gone.webp')
  expect(h.writes).toEqual([])
  expect(h.stdout.length).toBe(1)
})

test('an attachment outside the note tree is refused and copies nothing', () => {
  const outside = resolve('E:/outside/creds.txt')
  const h = harness({
    note: noteWithImage('正文。\n\n![creds](../../outside/creds.txt)\n'),
    files: { [outside]: Buffer.from('OPENAI_API_KEY=sk-test') }
  })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(2)
  expect(h.output().error.step).toBe('usage')
  expect(h.output().error.message).toContain('../../outside/creds.txt')
  expect(h.copied).toEqual([])
  expect(h.writes).toEqual([])
})

test('--apply leaves remote images alone and records them as remote', () => {
  const h = harness({ note: noteWithImage('![第三方](https://example.com/x.png)\n') })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(0)
  expect(h.copied).toEqual([])
  expect(h.writes[0].text).toContain('![第三方](https://example.com/x.png)')
  expect(h.output().plan.warnings.map((warning) => warning.code)).toEqual([
    'no-h1',
    'remote-image',
    'third-party-image'
  ])
})
