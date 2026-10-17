import { CONTENT_DIRS, type ContentCollection } from '../content/entries.ts'
import { EXIT } from '../publish/command.ts'
import { parseStatus } from '../publish/workspace.ts'
import { buildIngestPlan, collectTagVocabulary, renderArticle, sha256, type IngestPlan } from './plan.ts'

/** 与 publish 同一套退出码，不新增含义；1 只留给未预期的异常。 */
export type IngestStep = 'usage' | 'workspace' | 'internal'

export type IngestDeps = {
  git: (args: string[]) => string
  read: (path: string) => Buffer
  exists: (path: string) => boolean
  writeFile: (path: string, text: string) => void
  /** 写二进制：图片附件按字节复制，不能走文本写盘（编码会改字节）。 */
  writeBytes: (path: string, bytes: Buffer) => void
  write: (stream: 'stdout' | 'stderr', text: string) => void
  /** 站内已有文章路径，用来汇总标签词表；更新时命令层会剔除被覆盖的那一篇。 */
  articles: () => string[]
  /**
   * 按集合与 slug 找已有文章，与站内路由共用 findEntryFile；返回相对路径（正斜杠），
   * 找不到返回 undefined。命中即本次计划是更新。
   */
  entryFile: (collection: ContentCollection, slug: string) => string | undefined
}

export type IngestOutput = {
  mode: 'plan' | 'apply'
  status: 'planned' | 'ingested' | 'failed'
  plan?: IngestPlan
  result?: { targetPath: string }
  error?: { step: IngestStep; message: string }
}

const USAGE = `用法：bun run ingest <源笔记路径> --collection <blog|notes|product> [--slug <英文短名>] [--description <一句话摘要>] [--apply]

默认只把入库计划打到 stdout（一个 JSON 文档），不写任何文件。
加 --apply 才写进目标文章；写入前会重读源笔记并核对计划里的 sha256。
目标文章已存在时计划标为更新（article.mode = update），body.diff 给出磁盘正文与覆盖后正文的差异；
--apply 覆盖它，同样是这一次确认，不额外提问。
--slug 覆盖由标题派生的英文短名，日期前缀仍取 pubDate；slug 不合法时 plan 只告警，--apply 直接中止。
--description 覆盖源笔记的 description，摘要措辞由调用方决定；缺了它 plan 只告警，--apply 直接中止。
正文第一个 H1 会被删除；措辞与标题不同的 H1 留作 description 草稿，优先级是 --description → frontmatter → H1 草稿。
本地图片附件会复制进 src/assets/ 并按 ../../assets/<name>.<ext> 改写引用，文件名去掉中文与时间戳；
远程图片原地址不动，第三方域名的图片额外告警。找不到本地附件直接中止，不写坏链接。
标签与站内现有文章汇总出的词表比对：已有标签标 existing，新标签标 new 并逐个产生
tag-not-in-vocabulary 告警。更新时被覆盖的那篇文章不计入词表——否则它独有的标签会因为
「马上被自己删掉」而误报成已有。新标签是合法的，确认后再 --apply。

退出码：0 成功 · 2 参数、源笔记、附件、slug 或 description 缺失或不合法 · 3 工作区或源笔记状态不合规
`

class StepFailure extends Error {
  step: IngestStep
  exitCode: number

  constructor(step: IngestStep, exitCode: number, message: string) {
    super(message)
    this.name = 'StepFailure'
    this.step = step
    this.exitCode = exitCode
  }
}

/**
 * 默认把计划打到 stdout；--apply 才写文件。stdout 永远只有一个 JSON 文档，
 * 人看的进度和错误一律走 stderr。
 */
export function runIngest(argv: string[], deps: IngestDeps): number {
  let mode: IngestOutput['mode'] = 'plan'
  let plan: IngestPlan | undefined

  try {
    const args = parseArgs(argv)
    if (args.help) {
      deps.write('stdout', USAGE)
      return EXIT.ok
    }
    if (args.error !== undefined) throw new StepFailure('usage', EXIT.usage, args.error)
    if (args.source === undefined || args.collection === undefined) {
      throw new StepFailure('usage', EXIT.usage, '缺少源笔记路径或 --collection')
    }

    mode = args.apply ? 'apply' : 'plan'
    plan = preparePlan(args.source, args.collection, args.slug, args.description, deps)

    const slugWarning = plan.warnings.find((warning) => warning.code === 'slug-not-valid')
    if (mode === 'apply' && slugWarning !== undefined) {
      throw new StepFailure('usage', EXIT.usage, slugWarning.message)
    }
    // description 在内容 schema 里必填：写出去会让 bun run build 直接失败，
    // 所以这里不是告警，而是拒绝写盘，把摘要留给调用方用 --description 补齐。
    const descriptionWarning = plan.warnings.find(
      (warning) => warning.code === 'missing-description'
    )
    if (mode === 'apply' && descriptionWarning !== undefined) {
      throw new StepFailure('usage', EXIT.usage, descriptionWarning.message)
    }

    if (mode === 'plan') {
      emit(deps, { mode, status: 'planned', plan })
      deps.write('stderr', planSummary(plan))
      return EXIT.ok
    }

    applyPlan(args.source, plan, deps)
    emit(deps, { mode, status: 'ingested', plan, result: { targetPath: plan.article.targetPath } })
    deps.write(
      'stderr',
      `${plan.article.mode === 'update' ? '已更新' : '已入库'}：${plan.article.targetPath}\n`
    )
    return EXIT.ok
  } catch (error) {
    const failure =
      error instanceof StepFailure
        ? error
        : new StepFailure('internal', 1, error instanceof Error ? error.message : String(error))
    if (failure.step === 'usage') deps.write('stderr', USAGE)
    const output: IngestOutput = {
      mode,
      status: 'failed',
      error: { step: failure.step, message: failure.message }
    }
    if (plan !== undefined) output.plan = plan
    emit(deps, output)
    deps.write('stderr', `✗ ${failure.message}\n`)
    return failure.exitCode
  }
}

function preparePlan(
  sourcePath: string,
  collection: ContentCollection,
  slug: string | undefined,
  description: string | undefined,
  deps: IngestDeps
): IngestPlan {
  let content: Buffer
  try {
    content = deps.read(sourcePath)
  } catch (error) {
    throw new StepFailure('usage', EXIT.usage, `读不到源笔记：${messageOf(error)}`)
  }
  try {
    return buildIngestPlan({
      path: sourcePath,
      content,
      collection,
      slug,
      description,
      vocabulary: (targetPath) => [
        ...collectTagVocabulary({
          // 被覆盖的那篇文章不能算进词表：它马上要被新正文替换，独有的标签会随之消失。
          articles: deps.articles().filter((path) => !samePath(path, targetPath)),
          read: deps.read
        })
      ],
      findEntry: deps.entryFile,
      exists: deps.exists,
      read: deps.read
    })
  } catch (error) {
    throw new StepFailure('usage', EXIT.usage, messageOf(error))
  }
}

function applyPlan(sourcePath: string, plan: IngestPlan, deps: IngestDeps): void {
  const dirty = changedPaths(deps)
  if (dirty.length > 0) {
    throw new StepFailure(
      'workspace',
      EXIT.workspace,
      `工作区不干净：${dirty.join(', ')}；先提交或移走这些改动再 --apply。`
    )
  }

  let current: string
  try {
    current = sha256(deps.read(sourcePath))
  } catch (error) {
    throw new StepFailure('workspace', EXIT.workspace, `重读源笔记失败：${messageOf(error)}`)
  }
  if (current !== plan.source.sha256) {
    throw new StepFailure(
      'workspace',
      EXIT.workspace,
      '源笔记在生成计划之后被修改了；请重新运行 dry-run（不加 --apply）再执行。'
    )
  }

  // 先落图片再写文章：图片缺失会让构建直接报 image-not-found，宁可留下无人引用的
  // 附件（清理起来是一目了然的），也不要写出一个引用了不存在图片的文章。
  copyImages(plan, deps)
  deps.writeFile(plan.article.targetPath, renderArticle(plan.fields, plan.body.preview))
}

/**
 * 把本地附件复制进 src/assets/。先按计划里的 sha256 核对源字节，写完再读回来核对，
 * 中途任何一步对不上都中止：宁可让调用方重跑，也不留一份半对的图片。
 * 目标已存在且哈希一致说明上次已经搬过，跳过即可——这就是重复 --apply 的幂等性。
 */
function copyImages(plan: IngestPlan, deps: IngestDeps): void {
  const pending: { from: string; to: string; bytes: Buffer; sha256: string }[] = []
  for (const image of plan.images) {
    if (image.remote) continue
    if (deps.exists(image.to)) {
      if (sha256(deps.read(image.to)) !== image.sha256) {
        throw new StepFailure(
          'workspace',
          EXIT.workspace,
          `目标图片已存在且内容不同：${image.to}；确认这张图是不是别的笔记用的，或先移走它。`
        )
      }
      continue
    }
    let bytes: Buffer
    try {
      bytes = deps.read(image.from)
    } catch (error) {
      throw new StepFailure(
        'workspace',
        EXIT.workspace,
        `读不到附件：${image.from}（${messageOf(error)}）；附件可能在生成计划之后被移走了。`
      )
    }
    if (sha256(bytes) !== image.sha256) {
      throw new StepFailure(
        'workspace',
        EXIT.workspace,
        `附件在生成计划之后被修改了：${image.from}；请重新运行 dry-run 再执行。`
      )
    }
    pending.push({ from: image.from, to: image.to, bytes, sha256: image.sha256 })
  }

  for (const file of pending) {
    deps.writeBytes(file.to, file.bytes)
    let written: Buffer
    try {
      written = deps.read(file.to)
    } catch (error) {
      throw new StepFailure(
        'workspace',
        EXIT.workspace,
        `复制后读不回图片：${file.to}（${messageOf(error)}）。`
      )
    }
    if (written.byteLength !== file.bytes.byteLength || sha256(written) !== file.sha256) {
      throw new StepFailure(
        'workspace',
        EXIT.workspace,
        `复制后字节与源附件不一致：${file.to}；请检查磁盘与权限后重试。`
      )
    }
  }
}

function changedPaths(deps: IngestDeps): string[] {
  let status: string
  try {
    status = deps.git(['status', '--porcelain', '-z', '-uall'])
  } catch (error) {
    throw new StepFailure('workspace', EXIT.workspace, `读不到工作区状态：${messageOf(error)}`)
  }
  const changes = parseStatus(status)
  return [...changes.conflicts, ...changes.files.map((file) => file.path)]
}

function emit(deps: IngestDeps, output: IngestOutput): void {
  deps.write('stdout', `${JSON.stringify(output)}\n`)
}

function planSummary(plan: IngestPlan): string {
  const lines = [
    '入库计划（默认不写任何东西）：',
    `  源笔记：${plan.source.path}（${plan.source.bytes} 字节，sha256 ${plan.source.sha256}）`,
    `  文章：${plan.article.collection}/${plan.article.slug}${
      plan.article.mode === 'update' ? '（更新，覆盖已有文章）' : '（新建）'
    }`,
    `  标题：${plan.fields.title.value}`,
    `  描述：${plan.fields.description.value ?? '（缺失）'}`,
    `  标签：${tagSummary(plan)}`,
    `  发布：${plan.fields.pubDate.value}`,
    ...bodyLines(plan),
    ...imageLines(plan),
    `  提交信息：${plan.commit.message}`,
    ...plan.warnings.map((warning) => `  告警：${warning.code} — ${warning.message}`),
    '加 --apply 执行。'
  ]
  return `${lines.join('\n')}\n`
}

/** 更新时把正文 diff 原样摆出来；新建没有旧正文，这一段不出现。 */
function bodyLines(plan: IngestPlan): string[] {
  if (plan.body.diff === undefined) return []
  if (plan.body.diff === '') return ['  正文差异：无（磁盘上的正文与覆盖后一致）']
  return [
    '  正文差异（当前 → 覆盖后）：',
    ...plan.body.diff.split('\n').map((line) => `    ${line}`)
  ]
}

function tagSummary(plan: IngestPlan): string {
  const tags = plan.fields.tags.items
  if (tags.length === 0) return '（无）'
  return tags
    .map((tag) => `${tag.value}（${tag.source === 'existing' ? '已有' : '新增'}）`)
    .join('，')
}

function imageLines(plan: IngestPlan): string[] {
  if (plan.images.length === 0) return ['  图片：（无）']
  return [
    `  图片：${plan.images.length} 张`,
    ...plan.images.map((image) =>
      image.remote
        ? `    ${image.from}（远程，保持原样）`
        : `    ${image.from} → ${image.to}（${image.bytes} 字节）`
    )
  ]
}

type ParsedArgs = {
  apply: boolean
  help: boolean
  source?: string
  collection?: ContentCollection
  slug?: string
  description?: string
  error?: string
}

function parseArgs(argv: string[]): ParsedArgs {
  let apply = false
  let help = false
  let source: string | undefined
  let rawCollection: string | undefined
  let slug: string | undefined
  let description: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') {
      apply = true
    } else if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--slug') {
      const value = argv[index + 1]
      // slug 值本身可能就是要校验的错误值（例如 -leading），只有 -- 开头才当作缺少值。
      if (value === undefined || value.startsWith('--')) {
        return { apply, help, source, error: '--slug 缺少值' }
      }
      slug = value
      index += 1
    } else if (arg.startsWith('--slug=')) {
      slug = arg.slice('--slug='.length)
    } else if (arg === '--description') {
      const value = argv[index + 1]
      // 摘要里出现连字符是常事，只有 -- 开头才当作缺少值；空白值留给计划层判为缺失。
      if (value === undefined || value.startsWith('--')) {
        return { apply, help, source, error: '--description 缺少值' }
      }
      description = value
      index += 1
    } else if (arg.startsWith('--description=')) {
      description = arg.slice('--description='.length)
    } else if (arg === '--collection') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('-')) {
        return { apply, help, source, error: '--collection 缺少值' }
      }
      rawCollection = value
      index += 1
    } else if (arg.startsWith('--collection=')) {
      rawCollection = arg.slice('--collection='.length)
    } else if (arg.startsWith('-')) {
      return { apply, help, source, error: `未知参数：${arg}` }
    } else if (source !== undefined) {
      return { apply, help, source, error: `多余的参数：${arg}` }
    } else {
      source = arg
    }
  }

  if (help) return { apply, help }
  if (source === undefined) return { apply, help, error: '缺少源笔记路径' }
  if (rawCollection === undefined) return { apply, help, source, error: '缺少 --collection' }
  if (!isCollection(rawCollection)) {
    return {
      apply,
      help,
      source,
      error: `未知的 --collection：${rawCollection}（可选 blog / notes / product）`
    }
  }
  return { apply, help, source, collection: rawCollection, slug, description }
}

function isCollection(value: string): value is ContentCollection {
  return Object.hasOwn(CONTENT_DIRS, value)
}

/** 命令层扫出的路径来自 node:path.join（Windows 是反斜杠），计划里是正斜杠。 */
function samePath(left: string, right: string): boolean {
  return left.replace(/\\/g, '/') === right.replace(/\\/g, '/')
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
