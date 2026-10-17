import { createHash } from 'node:crypto'
import { parseFrontmatter } from '@astrojs/markdown-remark'

import { CONTENT_DIRS, type ContentCollection } from '../content/entries.ts'
import { commitMessage } from '../publish/plan.ts'
import { unifiedDiff } from './diff.ts'
import { planImages } from './images.ts'

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

/** 一个标签相对站内词表的状态；沿用 FieldSource 的 existing / new 两个值。 */
export type PlannedTag = {
  value: string
  source: 'existing' | 'new'
}

/** 标签字段：value 是真正会写进文章的那一版，items 逐条给出它是已有还是新增。 */
export type PlannedTags = PlannedField<string[]> & { items: PlannedTag[] }

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
  /** 仅在目标文章已存在时出现：磁盘正文与覆盖后正文的 unified diff；无差异是空串。 */
  diff?: string
}

export type IngestPlan = {
  source: { path: string; sha256: string; bytes: number }
  article: {
    collection: ContentCollection
    slug: string
    targetPath: string
    exists: boolean
    /** 仅当目标文章已存在时出现：这次是覆盖更新，不是新建。 */
    mode?: 'update'
  }
  fields: {
    title: PlannedField<string>
    description: PlannedField<string>
    tags: PlannedTags
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
 * description 取 `description` 参数、frontmatter，再取措辞不同的正文 H1 草稿，
 * 都没有就留空只告警、不编造，标签缺失就是空列表。
 * 目标路径落在对应集合下；正文第一个 H1 会被删除——页面布局已经把 title 渲染成 h1，
 * 再留一个就是两个 h1。本地图片附件会解析成真实文件、按清洗后的名字记进计划，
 * 正文引用改成 `../../assets/<name>.<ext>`；远程图片保持原地址只出告警。
 * 标签先按内容 schema 的规则小写去重，再与站内词表比对：已有标签标 existing，
 * 其余标 new 并逐个告警——新标签是合法的，但每个都会生成一个新的标签页，得让人看见。
 * 目标文章已存在时（findEntry 按 slug 命中），计划标成更新并附上「磁盘正文 → 覆盖后正文」
 * 的行级 diff；`--apply` 会覆盖那篇文章，diff 让人在覆盖前看见自己将要覆盖什么。
 */
export function buildIngestPlan(input: {
  path: string
  content: Buffer
  collection: ContentCollection
  /** 调用方给的英文短名，覆盖由 title 派生的短名；日期前缀不跟着变。 */
  slug?: string
  /** 调用方给的一句摘要，覆盖源笔记的 description；摘要措辞是判断，工具不生成。 */
  description?: string
  /**
   * 站内已有标签（大小写不敏感）。数组是固定词表（测试用）；函数按目标路径定制，
   * 命令层用它把「被覆盖的那篇文章」从扫描结果里排除，免得最后一个 X 标签被自己顶掉。
   */
  vocabulary: readonly string[] | ((targetPath: string) => readonly string[])
  /**
   * 按集合与 slug 找已有文章，返回其相对路径；与站内路由共用 findEntryFile。
   * 命中即本次是更新：计划带 mode 与正文 diff，`--apply` 覆盖它。
   */
  findEntry: (collection: ContentCollection, slug: string) => string | undefined
  /** 目标文章是否已存在，由调用方提供（命令层读文件系统，测试用假实现）。 */
  exists: (targetPath: string) => boolean
  /** 读文件字节：解析附件、算哈希都用它；命令层读文件系统，测试注入假实现。 */
  read: (path: string) => Buffer
  /** 今天的日期，用于 pubDate 兜底；命令层不传就取系统时钟，测试注入固定时间。 */
  now?: () => Date
}): IngestPlan {
  const note = readNote(input.content)
  const h1 = splitH1(note.body)
  const title = resolveTitle(note.frontmatter.title, h1.text, filenameTitle(input.path))
  const equivalentToTitle = h1.text !== null && comparable(h1.text) === comparable(title.value)
  // 措辞不同才值得留作草稿：等价时它是 title 的重复，删掉就是全部处理。
  const h1Draft = h1.found && !equivalentToTitle ? h1.text : null
  const description = resolveDescription(
    input.description,
    note.frontmatter.description,
    h1Draft
  )
  const rawTags = readTags(note.frontmatter.tags)
  const tags = rawTags === null ? [] : lowerCaseAndDedupe(rawTags)
  const pubDate = readPubDate(note.frontmatter, input.now ?? (() => new Date()))
  const name = input.slug === undefined ? deriveSlug(title.value) : input.slug
  const slug = `${pubDate.value.replace(/-/g, '')}-${name}`
  // 已有文章按 slug 定位：命中即覆盖更新，路径以磁盘上的文件为准（可能是 .mdx）。
  const located = input.findEntry(input.collection, slug)
  const exists = located !== undefined
  const targetPath = located ?? `${CONTENT_DIRS[input.collection]}/${slug}.md`
  const known = new Set(
    vocabularyFor(input.vocabulary, targetPath).map((tag) => tag.toLowerCase())
  )
  const tagItems: PlannedTag[] = tags.map((tag) => ({
    value: tag,
    source: known.has(tag) ? 'existing' : 'new'
  }))
  // 图片在删 H1 之前处理：报错行号对着源笔记，正文改写的顺序也与读者看到的一致。
  const imagePlan = planImages({
    body: note.body,
    notePath: input.path,
    name,
    collection: input.collection,
    exists: input.exists,
    read: input.read
  })
  const slugSource: FieldSource = input.slug === undefined ? 'title' : 'cli'
  // 调用方给的值本身也要合法：`-name` 拼上日期前缀会变成 `20261017--name`，
  // 只看最终 slug 就漏掉了首尾连字符。
  const slugIssue =
    (input.slug === undefined ? null : issueWithSlug(input.slug)) ?? issueWithSlug(slug)
  const warnings: IngestPlan['warnings'] = []
  if (title.source !== 'frontmatter') {
    warnings.push({ code: 'title-fallback', message: titleFallbackMessage(title) })
  }
  if (!h1.found) {
    warnings.push({
      code: 'no-h1',
      message: '正文没有 H1：没有可删除的标题，正文其余内容原样保留。'
    })
  } else if (!equivalentToTitle) {
    warnings.push({
      code: 'h1-differs',
      message:
        description.source === 'h1-draft'
          ? `正文 H1 与 title 措辞不同：${h1.text}；H1 已删除，该文本作为 description 草稿保留，请确认或改写。`
          : `正文 H1 与 title 措辞不同：${h1.text}；H1 已删除，但 description 已由 ${description.source} 提供，草稿没有覆盖它。`
    })
  }
  if (slugIssue !== null) {
    warnings.push({
      code: 'slug-not-valid',
      message: `slug 不合法：${slugIssue}；请用 --slug 指定英文短名后重新运行（例如 --slug leetcode-first-glance）。`
    })
  }
  if (description.source === 'missing') {
    warnings.push({
      code: 'missing-description',
      message:
        '缺少 description：源笔记没有，--description 也没有给出非空值；不编造，请用 --description 提供一句摘要。'
    })
  }
  for (const tag of tagItems) {
    if (tag.source === 'existing') continue
    warnings.push({
      code: 'tag-not-in-vocabulary',
      message: `标签「${tag.value}」不在站内词表里：这是新标签，会生成新的 /tags/${tag.value} 页面；请确认后加 --apply。`
    })
  }

  const preview = splitH1(imagePlan.body).without
  // 只有覆盖时才需要 diff：新建没有「旧正文」可比，键也就不出现，创建路径的计划保持原样。
  const diff =
    located === undefined ? undefined : unifiedDiff(readExistingBody(input.read, located), preview)

  return {
    source: {
      path: input.path,
      sha256: sha256(input.content),
      bytes: input.content.byteLength
    },
    article: {
      collection: input.collection,
      slug,
      targetPath,
      exists,
      ...(located === undefined ? {} : { mode: 'update' as const })
    },
    fields: {
      title,
      description,
      tags: {
        value: tags,
        source: rawTags === null ? 'missing' : 'frontmatter',
        items: tagItems
      },
      pubDate,
      slug: { value: slug, source: slugSource }
    },
    body: {
      h1: { found: h1.found, text: h1.text, equivalentToTitle },
      preview,
      ...(diff === undefined ? {} : { diff })
    },
    images: imagePlan.images,
    warnings: [...warnings, ...imagePlan.warnings],
    commit: {
      message: commitMessage(
        [{ slug, change: exists ? 'modified' : 'added' }],
        [{ path: targetPath }]
      )
    }
  }
}

/**
 * 读目标文章的当前正文。读不到就没法给出覆盖前的 diff，也就没法让覆盖不静默，
 * 所以直接报出路径，而不是带着空的 diff 继续。
 */
function readExistingBody(read: (path: string) => Buffer, path: string): string {
  try {
    return readNote(read(path)).body
  } catch (error) {
    throw new Error(`读不到要覆盖的文章：${path}（${messageOf(error)}）；无法显示正文 diff。`)
  }
}

/** 词表可以是固定列表，也可以是按目标路径定制的函数：命令层用它排除被覆盖的那篇。 */
function vocabularyFor(
  vocabulary: readonly string[] | ((targetPath: string) => readonly string[]),
  targetPath: string
): readonly string[] {
  return typeof vocabulary === 'function' ? vocabulary(targetPath) : vocabulary
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
 * description 的取值：调用方给的 --description 优先于 frontmatter，frontmatter 又优先于
 * 措辞不同的正文 H1 草稿；空白值一律当没有。frontmatter 里的描述是人写的，草稿只是草稿，
 * 不能反过来盖掉它。内容 schema 里 description 是必填，写进空串等于写出坏文章；
 * 工具自己不生成摘要文字。
 */
function resolveDescription(
  cli: string | undefined,
  frontmatter: unknown,
  draft: string | null
): PlannedField<string> {
  const fromCli = cli === undefined ? '' : cli.trim()
  if (fromCli !== '') return { value: fromCli, source: 'cli' }
  const fromNote = optionalText(frontmatter, 'description')
  if (fromNote !== null) return { value: fromNote, source: 'frontmatter' }
  if (draft !== null) return { value: draft, source: 'h1-draft' }
  return { value: null, source: 'missing' }
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

/**
 * 围栏代码块的行：``` 或 ~~~ 起头，最多三格缩进，信息串跟在标记后面，
 * 闭合围栏用的是同一种字符且不短于开始围栏；没有闭合就吃到文末。
 * 围栏里的 `#` 是代码或注释，不是标题。
 */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

function fencedLines(lines: string[]): boolean[] {
  const fenced = lines.map(() => false)
  let open: { marker: string; length: number } | null = null
  lines.forEach((line, index) => {
    const match = FENCE.exec(line)
    if (open === null) {
      // 反引号围栏的信息串里不能再出现反引号，否则整行是普通文本。
      if (match === null || (match[1][0] === '`' && match[2].includes('`'))) return
      open = { marker: match[1][0], length: match[1].length }
      fenced[index] = true
      return
    }
    fenced[index] = true
    if (
      match !== null &&
      match[1][0] === open.marker &&
      match[1].length >= open.length &&
      match[2].trim() === ''
    ) {
      open = null
    }
  })
  return fenced
}

/**
 * 正文第一个 H1 的文本，以及删掉它之后的正文。删除是默认动作：页面布局已经把 title
 * 渲染成 h1，正文再留一个就是两个 h1，目录里也会多一个孤零零的根节点。
 * 删完把接缝处的空行收拾干净——两侧都有空行只留一个，两侧都没有就补一个，
 * 免得把标题前后的两个块粘成一段；正文首尾的空行一并去掉。
 * 代码块里的 `#` 不算 H1，四格缩进的代码行也匹配不到行首的 `#`。
 */
function splitH1(body: string): { found: boolean; text: string | null; without: string } {
  const lines = body.split('\n')
  const fenced = fencedLines(lines)
  const index = lines.findIndex(
    (line, at) => !fenced[at] && /^#[ \t]+(.+?)[ \t]*$/.test(line)
  )
  if (index === -1) return { found: false, text: null, without: body }
  const match = /^#[ \t]+(.+?)[ \t]*$/.exec(lines[index])
  if (match === null || match[1].trim() === '') {
    return { found: false, text: null, without: body }
  }
  const text = match[1].trim()
  lines.splice(index, 1)
  if (index > 0 && index < lines.length) {
    const blankBefore = lines[index - 1].trim() === ''
    const blankAfter = lines[index].trim() === ''
    if (blankBefore && blankAfter) lines.splice(index, 1)
    else if (!blankBefore && !blankAfter) lines.splice(index, 0, '')
  }
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return { found: true, text, without: lines.join('\n') }
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

/**
 * 站内已有标签的词表：扫描内容目录里已有文章的 frontmatter，取 tags。词表必须从真实
 * 文章来——维护一份独立的标签白名单，下一篇文章就会让它和站内脱钩。单篇文章坏掉
 * 不该让入库停摆（构建会先报它），跳过即可。
 */
export function collectTagVocabulary(input: {
  articles: readonly string[]
  read: (path: string) => Buffer
}): Set<string> {
  const vocabulary = new Set<string>()
  for (const path of input.articles) {
    let tags: unknown
    try {
      tags = readNote(input.read(path)).frontmatter.tags
    } catch {
      continue
    }
    if (!Array.isArray(tags)) continue
    for (const tag of tags) {
      if (typeof tag === 'string') vocabulary.add(tag.toLowerCase())
    }
  }
  return vocabulary
}

/**
 * 与 src/content.config.ts 的 removeDupsAndLowerCase 一致：先小写，再按首次出现去重。
 * 计划里报的标签必须就是真正写进文章的形态，否则词表比对的是磁盘上不存在的值。
 */
function lowerCaseAndDedupe(tags: readonly string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.toLowerCase())))
}

function yamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}
