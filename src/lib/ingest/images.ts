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

/** 与 src/pages/rss.xml.ts 的图片 glob 一致：只有这些扩展名会被站点当图片处理。 */
const IMAGE_EXTENSIONS = ['avif', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']

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
 *
 * 计划里的 `from` 会被下一条命令原样复制进 `src/assets/`，所以候选位置必须先过两道网：
 * 解析之后仍落在笔记库内（没有库时是笔记所在目录），且扩展名是图片。`..` 和盘符可以把
 * 任意可读文件指到仓库外，一旦进了 `src/assets/`，下一次推送就会把它带上公开仓库。
 */
function attachmentCandidates(
  ref: string,
  noteDir: string,
  exists: (path: string) => boolean
): string[] {
  const vault = vaultRoot(noteDir, exists)
  const root = vault ?? noteDir
  let raw: string[]
  // 真正的绝对路径：Windows 盘符或 UNC。注意 win32 的 isAbsolute 也认 `/foo`，
  // 而在 Obsidian 里那是相对笔记库根目录的写法，所以先判掉这两种。
  if (/^[\\/]{2}/.test(ref) || /^[A-Za-z]:[\\/]/.test(ref)) {
    raw = [ref]
  } else {
    const relative = ref.replace(/^[\\/]+/, '')
    if (/^[\\/]/.test(ref)) {
      raw = [join(root, relative)]
    } else {
      raw = [join(noteDir, relative), join(noteDir, 'attachments', relative)]
      if (vault !== undefined) raw.push(join(vault, relative))
    }
  }

  const candidates = raw.map((path) => resolve(path))
  // 先看引用本身解析到哪：`..` 或盘符一旦把主位置指到根目录外就整条拒绝，
  // 不能靠 attachments/ 之类的兜底候选把它「救」回库内。
  if (!isInside(candidates[0], root)) {
    throw new Error(
      `附件越出了${vault === undefined ? '笔记所在目录' : '笔记库'}：${ref}` +
        `（解析为 ${candidates[0]}，根目录是 ${root}）；` +
        '只接受该目录内的图片，请把附件放进笔记库再重新运行。'
    )
  }

  const inside = candidates.filter((path) => isInside(path, root))
  const [path] = inside
  if (!IMAGE_EXTENSIONS.includes(extname(path).slice(1).toLowerCase())) {
    throw new Error(
      `附件不是图片：${ref}（解析为 ${path}）；只接受图片扩展名：` +
        `${IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join('、')}。`
    )
  }
  return inside
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

/**
 * 先解析再比前缀，`..` 和分隔符都由 `resolve` 归一。只把盘符改成小写（Windows 的盘符
 * 不区分大小写），其余保持原样；末尾补 `/` 再比，避免 `C:\a\b` 被 `C:\a\bc` 骗过。
 */
function isInside(path: string, root: string): boolean {
  const normalise = (value: string): string =>
    resolve(value)
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .replace(/^([A-Za-z]):/, (_, drive: string) => `${drive.toLowerCase()}:`)
  const child = normalise(path)
  const parent = normalise(root)
  return child === parent || child.startsWith(`${parent}/`)
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
