import { expect, test } from 'bun:test'

import { runIngest, type IngestDeps } from './command'

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

type Options = {
  note?: string
  status?: string
  existing?: string[]
  /** 第二次读源笔记时返回的内容，用来模拟 dry-run 之后源文件被改。 */
  after?: string
}

function harness(options: Options = {}) {
  const stdout: string[] = []
  const stderr: string[] = []
  const writes: { path: string; text: string }[] = []
  const reads: string[] = []
  const gitCalls: string[][] = []
  let current = options.note ?? NOTE

  const deps: IngestDeps = {
    git: (args) => {
      gitCalls.push(args)
      return options.status ?? ''
    },
    read: (path) => {
      reads.push(path)
      if (path !== SOURCE) throw new Error(`ENOENT: ${path}`)
      if (reads.length > 1 && options.after !== undefined) current = options.after
      return Buffer.from(current)
    },
    exists: (path) => (options.existing ?? []).includes(path),
    writeFile: (path, text) => writes.push({ path, text }),
    write: (stream, text) => {
      ;(stream === 'stdout' ? stdout : stderr).push(text)
    }
  }

  return {
    writes,
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
  expect(plan.warnings).toEqual([])
  expect(h.writes).toEqual([])
})

test('an illegal --slug warns in plan mode and still returns the plan', () => {
  for (const slug of ['Ticket', 'has space', '-leading', 'a'.repeat(81), '']) {
    const h = harness()

    const code = h.run([SOURCE, '--collection', 'blog', '--slug', slug])

    expect(code).toBe(0)
    expect(h.output().plan.warnings.map((warning) => warning.code)).toEqual(['slug-not-valid'])
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
  expect(h.output().plan.warnings.map((warning) => warning.code)).toEqual(['title-fallback'])
})

test('apply writes the frontmatter and the body verbatim to the target article', () => {
  const h = harness({ note: NOTE.replace('正文。\n', '# 正文里的标题\n\n正文。\n') })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(0)
  expect(h.writes.length).toBe(1)
  const [write] = h.writes
  expect(write.path).toBe(TARGET)
  expect(write.text.startsWith(`---\ntitle: 'a-test-note'\n`)).toBe(true)
  expect(write.text).toContain(`pubDate: 2026-10-17`)
  expect(write.text).toContain(`tags: ['测试']`)
  expect(write.text.endsWith('\n# 正文里的标题\n\n正文。\n')).toBe(true)
  expect(h.output().status).toBe('ingested')
  expect(h.output().result).toEqual({ targetPath: TARGET })
})

test('apply writes fallback fields and keeps the body H1 verbatim', () => {
  const h = harness({ note: '# a-draft-post\n\n正文。\n' })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(0)
  expect(h.writes.length).toBe(1)
  const [write] = h.writes
  expect(write.path).toMatch(/^src\/content\/blog\/\d{8}-a-draft-post\.md$/)
  expect(write.text).toMatch(/^---\ntitle: 'a-draft-post'\npubDate: \d{4}-\d{2}-\d{2}\n---\n\n/)
  expect(write.text).not.toContain('description:')
  expect(write.text.endsWith('\n# a-draft-post\n\n正文。\n')).toBe(true)
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

test('apply refuses to overwrite an existing article', () => {
  const h = harness({ existing: [TARGET] })

  const code = h.run([SOURCE, '--collection', 'blog', '--apply'])

  expect(code).toBe(3)
  expect(h.output().error.message).toContain('已存在')
  expect(h.writes).toEqual([])
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
