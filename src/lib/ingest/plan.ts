import { createHash } from 'node:crypto'
import { extractFrontmatter, parseFrontmatter } from '@astrojs/markdown-remark'

import { CONTENT_DIRS, type ContentCollection } from '../content/entries.ts'
import { commitMessage } from '../publish/plan.ts'

/** 每个字段值的来源。词表是外部契约，测试和读计划的人都按它断言。 */
export type FieldSource =
  | 'h1'
  | 'frontmatter'
  | 'filename'
  | 'today'
  | 'h1-draft'
  | 'missing'
  | 'existing'
  | 'new'

/** 告警码。词表是外部契约，后续票据往里加，不改已有含义。 */
export type WarningCode =
  | 'remote-image'
  | 'third-party-image'
  | 'missing-description'
  | 'tag-not-in-vocabulary'
  | 'no-h1'
  | 'h1-differs'

export type PlannedField<T> = {
  value: T | null
  source: FieldSource
}

export type PlannedImage = {
  from: string
  to: string
  bytes: number
  sha256: string
  remote: boolean
}

export type PlannedBody = {
  h1: { found: boolean; text: string | null; equivalentToTitle: boolean }
  preview: string
}

export type IngestPlan = {
  source: { path: string; sha256: string; bytes: number }
  article: {
    collection: ContentCollection
    slug: string
    targetPath: string
    exists: boolean
  }
  fields: {
    title: PlannedField<string>
    description: PlannedField<string>
    tags: PlannedField<string[]>
    pubDate: PlannedField<string>
  }
  body: PlannedBody
  images: PlannedImage[]
  warnings: { code: WarningCode; message: string }[]
  commit: { message: string }
}

export type Note = {
  frontmatter: Record<string, unknown>
  body: string
}

/**
 * 读源笔记的 frontmatter 与正文。没有 frontmatter、YAML 语法错误都直接抛错：
 * T03 只处理带 frontmatter 的笔记，兜底属于 T04，不在这里猜。
 */
export function readNote(content: Buffer): Note {
  // Windows 编辑器常给 UTF-8 加 BOM；它不属于正文，别让它跟着写进文章。
  const code = content.toString('utf8').replace(/^\uFEFF/, '')
  if (extractFrontmatter(code) == null) {
    throw new Error('源笔记没有 frontmatter；T03 只处理带 frontmatter 的笔记')
  }
  const parsed = parseFrontmatter(code)
  return {
    frontmatter: parsed.frontmatter,
    body: parsed.content.replace(/^[\r\n]+/, '').replace(/[\r\n]+$/, '')
  }
}

/**
 * 把一篇源笔记变成入库计划。slug 由 title 派生、日期前缀取 pubDate，
 * 目标路径落在对应集合下；正文原样写回，H1 与图片的处理属于后续票据。
 */
export function buildIngestPlan(input: {
  path: string
  content: Buffer
  collection: ContentCollection
  /** 目标文章是否已存在，由调用方提供（命令层读文件系统，测试用假实现）。 */
  exists: (targetPath: string) => boolean
}): IngestPlan {
  const note = readNote(input.content)
  const title = requireText(note.frontmatter.title, 'title')
  const description = optionalText(note.frontmatter.description, 'description')
  const tags = readTags(note.frontmatter.tags)
  const pubDate = readPubDate(note.frontmatter)
  const slug = `${pubDate.replace(/-/g, '')}-${deriveSlug(title)}`
  const targetPath = `${CONTENT_DIRS[input.collection]}/${slug}.md`
  const exists = input.exists(targetPath)
  const warnings: IngestPlan['warnings'] =
    description === null
      ? [
          {
            code: 'missing-description',
            message: '源笔记没有 description；不编造，入库前请补一句摘要。'
          }
        ]
      : []

  return {
    source: {
      path: input.path,
      sha256: sha256(input.content),
      bytes: input.content.byteLength
    },
    article: { collection: input.collection, slug, targetPath, exists },
    fields: {
      title: { value: title, source: 'frontmatter' },
      description: { value: description, source: description === null ? 'missing' : 'frontmatter' },
      tags: { value: tags ?? [], source: tags === null ? 'missing' : 'frontmatter' },
      pubDate: { value: pubDate, source: 'frontmatter' }
    },
    body: { h1: findH1(note.body, title), preview: note.body },
    images: [],
    warnings,
    commit: {
      message: commitMessage(
        [{ slug, change: exists ? 'modified' : 'added' }],
        [{ path: targetPath }]
      )
    }
  }
}

/**
 * 把计划里的 frontmatter 与正文写成文章文件。字段顺序固定，描述缺失就不写，
 * 标签为空就不写；标题与标签用 YAML 单引号标量，内部的单引号写成两个。
 */
export function renderArticle(fields: IngestPlan['fields'], body: string): string {
  const title = fields.title.value
  if (title === null) throw new Error('计划缺少 title，无法写出文章')
  const lines = ['---', `title: ${yamlString(title)}`]
  if (fields.description.value !== null) {
    lines.push(`description: ${yamlString(fields.description.value)}`)
  }
  lines.push(`pubDate: ${fields.pubDate.value}`)
  const tags = fields.tags.value
  if (tags && tags.length > 0) lines.push(`tags: [${tags.map(yamlString).join(', ')}]`)
  lines.push('---', '', body)
  return `${lines.join('\n')}\n`
}

/** 标题转 slug：保留 Unicode 字母数字，其余折叠成连字符。 */
export function deriveSlug(title: string): string {
  const slug = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  if (!slug) throw new Error(`无法从标题派生 slug：${title}`)
  return slug
}

export function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

function findH1(body: string, title: string): PlannedBody['h1'] {
  const match = /^#[ \t]+(.+?)[ \t]*$/m.exec(body)
  if (!match) return { found: false, text: null, equivalentToTitle: false }
  const text = match[1].trim()
  return { found: true, text, equivalentToTitle: comparable(text) === comparable(title) }
}

function comparable(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
}

function readPubDate(frontmatter: Record<string, unknown>): string {
  const date = datePart(frontmatter.created ?? frontmatter.date)
  if (date === undefined) {
    throw new Error('frontmatter 里没有可用的 created（或 date）日期，无法确定 pubDate')
  }
  return date
}

function datePart(raw: unknown): string | undefined {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? undefined : raw.toISOString().slice(0, 10)
  }
  if (typeof raw !== 'string') return undefined
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/.exec(raw.trim())
  if (!match) return undefined
  const parsed = new Date(`${match[1]}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : undefined
}

function requireText(raw: unknown, field: string): string {
  const value = optionalText(raw, field)
  if (value === null) throw new Error(`frontmatter 缺少 ${field}`)
  return value
}

function optionalText(raw: unknown, field: string): string | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') throw new Error(`frontmatter 的 ${field} 不是字符串`)
  const value = raw.trim()
  return value === '' ? null : value
}

function readTags(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null
  if (!Array.isArray(raw) || raw.some((tag) => typeof tag !== 'string')) {
    throw new Error('frontmatter 的 tags 不是字符串数组')
  }
  return raw as string[]
}

function yamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}
