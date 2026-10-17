import { CONTENT_DIRS, type ContentCollection } from '../content/entries.ts'
import { EXIT } from '../publish/command.ts'
import { parseStatus } from '../publish/workspace.ts'
import { buildIngestPlan, renderArticle, sha256, type IngestPlan } from './plan.ts'

/** 与 publish 同一套退出码，不新增含义；1 只留给未预期的异常。 */
export type IngestStep = 'usage' | 'workspace' | 'internal'

export type IngestDeps = {
  git: (args: string[]) => string
  read: (path: string) => Buffer
  exists: (path: string) => boolean
  writeFile: (path: string, text: string) => void
  write: (stream: 'stdout' | 'stderr', text: string) => void
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
--slug 覆盖由标题派生的英文短名，日期前缀仍取 pubDate；slug 不合法时 plan 只告警，--apply 直接中止。
--description 覆盖源笔记的 description，摘要措辞由调用方决定；缺了它 plan 只告警，--apply 直接中止。

退出码：0 成功 · 2 参数、源笔记、slug 或 description 缺失或不合法 · 3 工作区或源笔记状态不合规
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
    deps.write('stderr', `已入库：${plan.article.targetPath}\n`)
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
      exists: deps.exists
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
  if (plan.article.exists) {
    throw new StepFailure(
      'workspace',
      EXIT.workspace,
      `目标文章已存在：${plan.article.targetPath}；已有文章的更新还没实现，这里不覆盖。`
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

  deps.writeFile(plan.article.targetPath, renderArticle(plan.fields, plan.body.preview))
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
  const tags = plan.fields.tags.value ?? []
  const lines = [
    '入库计划（默认不写任何东西）：',
    `  源笔记：${plan.source.path}（${plan.source.bytes} 字节，sha256 ${plan.source.sha256}）`,
    `  文章：${plan.article.collection}/${plan.article.slug}${plan.article.exists ? '（已存在）' : ''}`,
    `  标题：${plan.fields.title.value}`,
    `  描述：${plan.fields.description.value ?? '（缺失）'}`,
    `  标签：${tags.length > 0 ? tags.join('，') : '（无）'}`,
    `  发布：${plan.fields.pubDate.value}`,
    `  提交信息：${plan.commit.message}`,
    ...plan.warnings.map((warning) => `  告警：${warning.code} — ${warning.message}`),
    '加 --apply 执行。'
  ]
  return `${lines.join('\n')}\n`
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
