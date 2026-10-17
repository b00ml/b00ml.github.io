import { createHash } from 'node:crypto'
import { parseFrontmatter } from '@astrojs/markdown-remark'

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
  | 'title'
  | 'cli'

/** 告警码。词表是外部契约，后续票据往里加，不改已有含义。 */
export type WarningCode =
  | 'remote-image'
  | 'third-party-image'
  | 'missing-description'
  | 'tag-not-in-vocabulary'
  | 'no-h1'
  | 'h1-differs'
  | 'slug-not-valid'
  | 'title-fallback'

export type PlannedField<T> = {
  value: T | null
  source: FieldSource
}

/** 已经兜底出来的非空值，比 PlannedField 收窄一步，省掉取用处的空值判断。 */
type ResolvedField = { value: string; source: FieldSource }

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
    slug: PlannedField<string>
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
 * 读源笔记的 frontmatter 与正文。没有 frontmatter 不算错误——样本里它才是常态，
 * 返回空的 frontmatter 让每个字段各自兜底；YAML 语法错误仍然抛错，那说明笔记本身坏了。
 */
export function readNote(content: Buffer): Note {
  // Windows 编辑器常给 UTF-8 加 BOM；它不属于正文，别让它跟着写进文章。
  const code = content.toString('utf8').replace(/^\uFEFF/, '')
  const parsed = parseFrontmatter(code)
  return {
    frontmatter: parsed.frontmatter,
    body: parsed.content.replace(/^[\r\n]+/, '').replace(/[\r\n]+$/, '')
  }
}

/**
 * 把一篇源笔记变成入库计划。日期前缀取 pubDate，短名默认由 title 派生，
 * 调用方可用 `slug` 覆盖（CLI 无法把中文翻译成英文，这一步是判断）。
 * 没有 frontmatter 不算错误：title 依次回退到正文 H1、文件名，pubDate 回退到今天，
 * description 缺失只告警、不编造，标签缺失就是空列表。
 * 目标路径落在对应集合下；正文原样写回，H1 与图片的处理属于后续票据。
 */
export function buildIngestPlan(input: {
  path: string
  content: Buffer
  collection: ContentCollection
  /** 调用方给的英文短名，覆盖由 title 派生的短名；日期前缀不跟着变。 */
  slug?: string
  /** 目标文章是否已存在，由调用方提供（命令层读文件系统，测试用假实现）。 */
  exists: (targetPath: string) => boolean
  /** 今天的日期，用于 pubDate 兜底；命令层不传就取系统时钟，测试注入固定时间。 */
  now?: () => Date
}): IngestPlan {
  const note = readNote(input.content)
  const h1 = findH1(note.body)
  const title = resolveTitle(note.frontmatter.title, h1.text, filenameTitle(input.path))
  const description = optionalText(note.frontmatter.description, 'description')
  const tags = readTags(note.frontmatter.tags)
  const pubDate = readPubDate(note.frontmatter, input.now ?? (() => new Date()))
  const name = input.slug === undefined ? deriveSlug(title.value) : input.slug
  const slug = `${pubDate.value.replace(/-/g, '')}-${name}`
  const slugSource: FieldSource = input.slug === undefined ? 'title' : 'cli'
  // 调用方给的值本身也要合法：`-name` 拼上日期前缀会变成 `20261017--name`，
  // 只看最终 slug 就漏掉了首尾连字符。
  const slugIssue =
    (input.slug === undefined ? null : issueWithSlug(input.slug)) ?? issueWithSlug(slug)
  const targetPath = `${CONTENT_DIRS[input.collection]}/${slug}.md`
  const exists = input.exists(targetPath)
  const warnings: IngestPlan['warnings'] = []
  if (title.source !== 'frontmatter') {
    warnings.push({ code: 'title-fallback', message: titleFallbackMessage(title) })
  }
  if (slugIssue !== null) {
    warnings.push({
      code: 'slug-not-valid',
      message: `slug 不合法：${slugIssue}；请用 --slug 指定英文短名后重新运行（例如 --slug leetcode-first-glance）。`
    })
  }
  if (description === null) {
    warnings.push({
      code: 'missing-description',
      message: '源笔记没有 description；不编造，入库前请补一句摘要。'
    })
  }

  return {
    source: {
      path: input.path,
      sha256: sha256(input.content),
      bytes: input.content.byteLength
    },
    article: { collection: input.collection, slug, targetPath, exists },
    fields: {
      title,
      description: { value: description, source: description === null ? 'missing' : 'frontmatter' },
      tags: { value: tags ?? [], source: tags === null ? 'missing' : 'frontmatter' },
      pubDate,
      slug: { value: slug, source: slugSource }
    },
    body: {
      h1: {
        ...h1,
        equivalentToTitle: h1.text !== null && comparable(h1.text) === comparable(title.value)
      },
      preview: note.body
    },
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

/** slug 的合法性：非空、仅小写字母数字和连字符、不以连字符开头或结尾、最多 80 字符。 */
function issueWithSlug(value: string): string | null {
  if (value.length === 0) return '它为空'
  if (!/^[a-z0-9-]+$/.test(value)) return `只能包含小写字母、数字和连字符：${value}`
  if (value.startsWith('-') || value.endsWith('-')) return `不能以连字符开头或结尾：${value}`
  if (value.length > 80) return `超过 80 个字符（${value.length}）：${value}`
  return null
}

export function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

/** title 的回退顺序：frontmatter → 正文 H1 → 文件名去扩展名。 */
function resolveTitle(raw: unknown, h1: string | null, filename: string): ResolvedField {
  const frontmatter = optionalText(raw, 'title')
  if (frontmatter !== null) return { value: frontmatter, source: 'frontmatter' }
  if (h1 !== null) return { value: h1, source: 'h1' }
  return { value: filename, source: 'filename' }
}

/**
 * 没有 frontmatter 时用一个明确的告警让人看见标题是兜底来的，
 * 而不是让读者以为这个措辞是作者确认过的标题。
 */
function titleFallbackMessage(title: ResolvedField): string {
  const from = title.source === 'h1' ? '正文 H1' : '文件名'
  return `标题不是来自 frontmatter，而是取自${from}：${title.value}；入库前请确认这个措辞就是要用的标题。`
}

/** 源笔记的文件名去扩展名，作为 title 的最后一道兜底。 */
function filenameTitle(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? ''
  const title = name.replace(/\.[^.]+$/, '').trim()
  if (title === '') throw new Error(`无法从文件名取得标题：${path}`)
  return title
}

function findH1(body: string): { found: boolean; text: string | null } {
  const match = /^#[ \t]+(.+?)[ \t]*$/m.exec(body)
  if (!match) return { found: false, text: null }
  const text = match[1].trim()
  return text === '' ? { found: false, text: null } : { found: true, text }
}

function comparable(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
}

/** pubDate 的回退顺序：frontmatter 的 created → date → 今天。 */
function readPubDate(frontmatter: Record<string, unknown>, now: () => Date): ResolvedField {
  for (const key of ['created', 'date']) {
    const date = datePart(frontmatter[key])
    if (date !== undefined) return { value: date, source: 'frontmatter' }
  }
  return { value: localDate(now()), source: 'today' }
}

/** 本地日期。不能用 toISOString：UTC 会把傍晚或凌晨的本地日期挪到另一天。 */
function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
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
