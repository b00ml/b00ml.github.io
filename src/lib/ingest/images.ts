import { createHash } from 'node:crypto'
import { basename, dirname, extname, join, posix, resolve } from 'node:path'

import { CONTENT_DIRS, type ContentCollection } from '../content/entries.ts'
import type { PlannedImage, WarningCode } from './plan.ts'

/** 图片统一落在 src/assets/；正文从 src/content/<collection>/ 往上两级引用它。 */
const ASSETS_DIR = 'src/assets'

/** 本站自己的域名。其余 http(s) 图片一律按第三方对待，保留原地址并让作者判断版权。 */
const OWN_HOSTS = new Set(['b00ml.github.io', 'www.b00ml.github.io'])

/**
 * 两种图片方言：Obsidian 的 `![[文件]]`（可带 `|尺寸` 或 `|alt`）与标准 Markdown
 * `![alt](路径)`。一次扫描按出现顺序处理，免得改写出来的标准语法被第二遍再搬一次。
 */
const IMAGE_PATTERN = /!\[\[([^\][\n|]+)(?:\|([^\][\n]+))?\]\]|!\[([^\]\n]*)\]\(([^)\n]+)\)/g

/** 附件名里的时间戳：13 位毫秒（Obsidian 附件）或 14 位粘贴时间，前面的分隔符一并丢。 */
const TIMESTAMP = /(?:[-_\s.]?\d{10,})+$/

/** Obsidian 的 `|395x733` 是显示尺寸，不是 alt。 */
const SIZE = /^\d+(?:x\d+)?$/

/** 有 scheme 的地址不是本地文件；只有 http(s) 算远程图片，`data:` 之类原样保留。 */
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/

export type ImagePlan = {
  body: string
  images: PlannedImage[]
  warnings: { code: WarningCode; message: string }[]
}

/**
 * 把正文里的图片引用变成站点能用的形式：本地附件解析成真实文件、按清洗后的名字记进
 * 计划，正文改写成 `../../assets/<name>.<ext>`；远程图片一个字节都不动，只出告警。
 *
 * 附件名里的中文没有机械的英文对应，所以清洗不出拉丁字母时退回文章短名——这是唯一
 * 不编造语义的兜底，也保证 URL 里不出现中文。找不到的本地文件直接抛错，绝不写出坏链接。
 */
export function planImages(input: {
  body: string
  notePath: string
  /** 文章短名的英文部分，用于附件名全是中文时的兜底命名。 */
  name: string
  collection: ContentCollection
  exists: (path: string) => boolean
  read: (path: string) => Buffer
}): ImagePlan {
  const noteDir = dirname(resolve(input.notePath))
  const prefix = posix.relative(CONTENT_DIRS[input.collection], ASSETS_DIR)
  const fallback = asciiWords(input.name) || 'image'
  const taken = new Set<string>()
  const placed = new Map<string, { image: PlannedImage; ref: string }>()
  const images: PlannedImage[] = []
  const warnings: ImagePlan['warnings'] = []
  const seen = new Set<string>()

  const warn = (code: WarningCode, message: string): void => {
    const key = `${code}\u0000${message}`
    if (seen.has(key)) return
    seen.add(key)
    warnings.push({ code, message })
  }

  const locate = (raw: string, offset: number): string => {
    const ref = decode(raw)
    const candidates = attachmentCandidates(ref, noteDir, input.exists)
    const found = candidates.find((candidate) => input.exists(candidate))
    if (found !== undefined) return found
    const line = input.body.slice(0, offset).split('\n').length
    throw new Error(
      `找不到附件：${ref}（正文第 ${line} 行）；已查找：${candidates.join('、')}。` +
        '请把附件放在笔记旁、笔记旁的 attachments/ 目录，或笔记库的根目录，再重新运行。'
    )
  }

  /** 同一个文件被引用两次时复用同一条计划，不再复制第二份。 */
  const place = (raw: string, offset: number): { image: PlannedImage; ref: string } => {
    const from = locate(raw, offset)
    const known = placed.get(from)
    if (known !== undefined) return known

    let bytes: Buffer
    try {
      bytes = input.read(from)
    } catch (error) {
      throw new Error(`读不到附件：${from}（${messageOf(error)}）。`)
    }

    const file = targetName(basename(from), taken, fallback)
    const image: PlannedImage = {
      from,
      to: posix.join(ASSETS_DIR, file),
      bytes: bytes.byteLength,
      sha256: digest(bytes),
      remote: false
    }
    const entry = { image, ref: posix.join(prefix, file) }
    placed.set(from, entry)
    images.push(image)
    return entry
  }

  const body = input.body.replace(
    IMAGE_PATTERN,
    (match, wiki, pipe, alt, dest, offset): string => {
      if (wiki !== undefined) {
        const { ref } = place(wiki, offset)
        return `![${altText(pipe, wiki)}](${ref})`
      }

      const url = (dest ?? '').trim()
      if (!SCHEME.test(url)) {
        const { ref } = place(url, offset)
        return `![${alt ?? ''}](${ref})`
      }
      // data: 之类的内联图片本身就是图片，没有可搬的文件，也不该报远程告警。
      if (!/^https?:/i.test(url)) return match

      const host = hostOf(url)
      warn('remote-image', `远程图片保持原地址，不下载、不改写：${url}`)
      if (host === undefined || !OWN_HOSTS.has(host)) {
        warn(
          'third-party-image',
          `${host ?? '未知域名'} 不是本站域名，图片仍指向第三方站点，引用前请确认版权：${url}`
        )
      }
      images.push({ from: url, to: url, bytes: 0, sha256: '', remote: true })
      return match
    }
  )

  return { body, images, warnings }
}

/**
 * 附件名的清洗：先丢掉尾部时间戳，再只保留拉丁字母数字并用连字符连接。
 * 扩展名原样保留；同名时按出现顺序加 `-2`、`-3`，同一篇笔记里不互相覆盖。
 */
function targetName(name: string, taken: Set<string>, fallback: string): string {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length).replace(TIMESTAMP, '')
  const base = asciiWords(stem) || fallback
  let file = `${base}${ext}`
  for (let index = 2; taken.has(file.toLowerCase()); index += 1) {
    file = `${base}-${index}${ext}`
  }
  taken.add(file.toLowerCase())
  return file
}

/** 文件名里的拉丁词，转成小写连字符形式；没有拉丁词就返回空串。 */
function asciiWords(text: string): string {
  return (text.match(/[A-Za-z0-9]+/g) ?? []).join('-').toLowerCase()
}

/** wiki 语法的 alt：竖线后是尺寸就丢掉，是文字就用它；都没有就退回文件名（去时间戳）。 */
function altText(pipe: string | undefined, ref: string): string {
  const text = pipe?.trim() ?? ''
  if (text !== '' && !SIZE.test(text)) return text
  const name = basename(decode(ref))
  const ext = extname(name)
  const stem = name
    .slice(0, name.length - ext.length)
    .replace(TIMESTAMP, '')
    .replace(/[-_\s.]+$/, '')
    .trim()
  return stem === '' ? '图片' : stem
}

/**
 * 附件可能的位置，按 Obsidian 的解析习惯排：笔记旁 → 笔记旁的 attachments/ → 笔记库根目录。
 * 以 `/` 开头的引用在 Obsidian 里相对笔记库根目录，所以只查根目录。找不到库根就退回笔记旁。
 */
function attachmentCandidates(
  ref: string,
  noteDir: string,
  exists: (path: string) => boolean
): string[] {
  // 真正的绝对路径：Windows 盘符或 UNC。注意 win32 的 isAbsolute 也认 `/foo`，
  // 而在 Obsidian 里那是相对笔记库根目录的写法，所以先判掉这两种。
  if (/^[\\/]{2}/.test(ref) || /^[A-Za-z]:[\\/]/.test(ref)) return [ref]
  const relative = ref.replace(/^[\\/]+/, '')
  if (/^[\\/]/.test(ref)) {
    const root = vaultRoot(noteDir, exists)
    return [join(root ?? noteDir, relative)]
  }
  const candidates = [join(noteDir, relative), join(noteDir, 'attachments', relative)]
  const root = vaultRoot(noteDir, exists)
  if (root !== undefined) candidates.push(join(root, relative))
  return candidates
}

/** 从笔记目录往上找带 `.obsidian` 的目录；找不到就说明这不是 Obsidian 库的路径。 */
function vaultRoot(from: string, exists: (path: string) => boolean): string | undefined {
  let dir = from
  for (;;) {
    if (exists(join(dir, '.obsidian'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/** Obsidian 可能写百分号编码的路径；解不开就按原文处理。 */
function decode(ref: string): string {
  const trimmed = ref.trim()
  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
