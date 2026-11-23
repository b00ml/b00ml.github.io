import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'

const ROOT = join(import.meta.dir, '..', '..', '..')
const ASSET_DIR = join(ROOT, 'src/assets/english-content-workbench')
const CONTENT_DIR = join(ROOT, 'src/content/projects/english-content-workbench')
const DIAGRAM_FILE = join(ROOT, 'public/diagrams/english-pipeline.html')

const SCREENSHOTS = [
  'generation.webp',
  'reading-review.webp',
  'pdf-structure.webp',
  'retrieval-test.webp',
  'trace-replay.webp'
]

type ImageReference = {
  file: string
  line: number
  alt: string
  target: string
  nextLine: string
}

/**
 * Every markdown image in the project's own pages that points at this project's
 * asset folder, with the line that follows it — captions live there.
 */
function imageReferences(): ImageReference[] {
  const out: ImageReference[] = []
  for (const name of readdirSync(CONTENT_DIR)) {
    if (!/\.mdx?$/.test(name)) continue
    const file = join(CONTENT_DIR, name)
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
        if (!match[2].includes('assets/english-content-workbench/')) continue
        const rest = lines.slice(index + 1).find((candidate) => candidate.trim().length > 0) ?? ''
        out.push({
          file,
          line: index + 1,
          alt: match[1],
          target: match[2],
          nextLine: rest.trim()
        })
      }
    })
  }
  return out
}

describe('english workbench screenshot assets', () => {
  test('ships the five selected screenshots under semantic ASCII names', () => {
    expect(existsSync(ASSET_DIR)).toBe(true)

    const shipped = readdirSync(ASSET_DIR)
      .filter((name) => /\.webp$/i.test(name))
      .sort()
    expect(shipped).toEqual([...SCREENSHOTS].sort())

    for (const name of shipped) {
      expect(name).toMatch(/^[a-z0-9-]+\.webp$/)
    }
  })

  test('never carries the source capture filenames into the repository', () => {
    expect(readdirSync(ASSET_DIR).filter((name) => name.startsWith('项目演示-'))).toEqual([])

    const hits = readdirSync(CONTENT_DIR)
      .filter((name) => /\.mdx?$/.test(name))
      .filter((name) => readFileSync(join(CONTENT_DIR, name), 'utf8').includes('项目演示-'))
    expect(hits).toEqual([])
  })

  test('references every screenshot from markdown with a resolving path, alt text and caption', () => {
    const references = imageReferences()
    const targets = references.map((reference) => reference.target)

    for (const name of SCREENSHOTS) {
      const suffix = `assets/english-content-workbench/${name}`
      expect(targets.some((target) => target.endsWith(suffix))).toBe(true)
    }

    for (const reference of references) {
      const resolvedPath = resolve(dirname(reference.file), reference.target)
      expect(existsSync(resolvedPath)).toBe(true)
      expect(reference.target.startsWith('../../../assets/english-content-workbench/')).toBe(true)
      expect(reference.alt.trim().length).toBeGreaterThanOrEqual(6)
      expect(reference.nextLine.startsWith('_图')).toBe(true)
    }
  })

  test('spreads the screenshots over the overview and the three sub-pages', () => {
    const filesByImage: string[] = imageReferences().map((reference) =>
      reference.file.replace(/\\/g, '/')
    )
    const pages = new Set(filesByImage.map((file) => file.split('/').pop()))

    expect(pages.has('index.md')).toBe(true)
    expect(pages.has('quality-loop.md')).toBe(true)
    expect(pages.has('rag.md')).toBe(true)
    expect(pages.has('reliability.md')).toBe(true)
  })
})

describe('english pipeline diagram page', () => {
  const html = () => readFileSync(DIAGRAM_FILE, 'utf8')

  test('is a standalone single-file page with no external dependencies', () => {
    expect(existsSync(DIAGRAM_FILE)).toBe(true)
    const source = html()

    expect(source).toContain('<html lang="zh-CN"')
    expect(source).toContain('<svg')
    expect(source).not.toMatch(/<script[^>]+src=/i)
    expect(source).not.toMatch(/<link[^>]+rel=["']stylesheet["']/i)
    expect(source).not.toMatch(/<img[^>]+src=["']https?:/i)
    expect(source).not.toMatch(/@import\s+url\(\s*["']?https?:/i)
    expect(source).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net/i)
  })

  test('paints both themes and honours the reduced-motion preference', () => {
    const source = html()

    expect(source).toContain('id="english-pipeline"')
    expect(source).toContain('data-theme')
    expect(source).toMatch(/setAttribute\(\s*['"]data-theme['"]/)
    expect(source).toContain("'light'")
    expect(source).toContain("'dark'")
    expect(source).toMatch(/prefers-reduced-motion:\s*reduce/)
  })

  test('names the seven production stages and both recovery boundaries', () => {
    const source = html()

    for (const stage of [
      '资料接入',
      '知识检索',
      '内容生成',
      '规则与 Judge 质检',
      '人工复核',
      '样本沉淀',
      '成本与链路回放'
    ]) {
      expect(source).toContain(stage)
    }

    for (const recovery of ['Outbox', 'skip locked', 'stale running', '对账', '租约']) {
      expect(source).toContain(recovery)
    }
  })

  test('is embedded from the project overview and offered as a quick link', () => {
    const overview = readFileSync(join(CONTENT_DIR, 'index.md'), 'utf8')

    expect(overview).toContain('src="/diagrams/english-pipeline.html"')
    expect(overview).toContain('href: /diagrams/english-pipeline.html')
  })
})
