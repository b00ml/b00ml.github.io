import { DEPLOY_STEP_NAME, evaluateDeploy, type RunSnapshot } from './deploy.ts'
import { evaluateLive, type LiveResponse } from './live.ts'
import { buildPlan, type PublishPlan } from './plan.ts'
import { parseGitHubRepo, siteOrigin } from './repo.ts'
import { blockedPaths, parseNameStatus, parseStatus } from './workspace.ts'

export const EXIT = {
  ok: 0,
  usage: 2,
  workspace: 3,
  build: 4,
  test: 5,
  commit: 6,
  push: 7,
  deploy: 8,
  verify: 9
} as const

export type PublishStep =
  | 'usage'
  | 'workspace'
  | 'build'
  | 'test'
  | 'commit'
  | 'push'
  | 'deploy'
  | 'verify'
  | 'internal'

export type PublishDeps = {
  /** 跑 git 子命令，非零退出码要抛错（错误信息里带 stderr）。 */
  git: (args: string[]) => string
  /** 跑 gh 子命令。所有调用都必须显式带 `--repo`。 */
  gh: (args: string[]) => string
  /** 跑构建/测试，返回退出码；子进程输出走 stderr，stdout 留给结构化结果。 */
  exec: (command: string, args: string[]) => number
  /** HEAD 请求，跟随重定向，返回最终状态与 Last-Modified。 */
  head: (url: string) => Promise<LiveResponse>
  now: () => number
  sleep: (ms: number) => Promise<void>
  write: (stream: 'stdout' | 'stderr', text: string) => void
}

export type PublishOutput = {
  mode: 'plan' | 'apply'
  status: 'planned' | 'published' | 'failed'
  plan?: PublishPlan
  result?: { sha: string; runUrl: string; urls: string[] }
  error?: { step: PublishStep; message: string; files?: string[] }
}

const POLL = {
  intervalStart: 5_000,
  intervalSlow: 10_000,
  slowAfter: 60_000,
  deadline: 15 * 60_000
} as const

const VERIFY = {
  interval: 5_000,
  warnAfter: 120_000,
  deadline: 600_000
} as const

const DEPLOY_WORKFLOW = 'deploy.yml'

const USAGE = `用法：bun run publish [--apply]

默认只把发布计划打到 stdout（JSON），不构建、不提交、不推送；加 --apply 才执行。
退出码：0 成功 · 2 参数错误 · 3 工作区不合规 · 4 构建失败 · 5 测试失败 · 6 提交失败
· 7 推送失败 · 8 部署失败 · 9 线上校验失败
`

class StepFailure extends Error {
  step: PublishStep
  exitCode: number
  files: string[] | undefined

  constructor(step: PublishStep, exitCode: number, message: string, files?: string[]) {
    super(message)
    this.name = 'StepFailure'
    this.step = step
    this.exitCode = exitCode
    this.files = files
  }
}

/**
 * publish 的编排。默认只出计划；`--apply` 才构建、测试、提交、推送、等部署、校验线上页面。
 *
 * 成功与失败完全由返回值（退出码）表达；stdout 只有一个 JSON 文档，进度写 stderr。
 */
export async function runPublish(argv: string[], deps: PublishDeps): Promise<number> {
  let mode: 'plan' | 'apply' = 'plan'
  let plan: PublishPlan | undefined
  try {
    const args = parseArgs(argv)
    if (args.help) {
      deps.write('stdout', USAGE)
      return EXIT.ok
    }
    if (args.error) throw new StepFailure('usage', EXIT.usage, args.error)
    mode = args.apply ? 'apply' : 'plan'

    const prepared = await preparePlan(deps)
    plan = prepared.plan

    if (mode === 'plan') {
      emit(deps, { mode, status: 'planned', plan })
      deps.write('stderr', planSummary(plan))
      return EXIT.ok
    }

    const result = await applyPlan(prepared, deps)
    emit(deps, { mode, status: 'published', plan, result })
    deps.write('stderr', `已发布：${result.urls.join(', ')}\n`)
    return EXIT.ok
  } catch (error) {
    const failure =
      error instanceof StepFailure
        ? error
        : new StepFailure('internal', 1, error instanceof Error ? error.message : String(error))
    if (failure.step === 'usage') deps.write('stderr', USAGE)
    const output: PublishOutput = {
      mode,
      status: 'failed',
      error: {
        step: failure.step,
        message: failure.message,
        ...(failure.files ? { files: failure.files } : {})
      }
    }
    if (plan) output.plan = plan
    emit(deps, output)
    deps.write('stderr', `✗ ${failure.message}\n`)
    return failure.exitCode
  }
}

function parseArgs(argv: string[]): { apply: boolean; help: boolean; error?: string } {
  let apply = false
  let help = false
  for (const arg of argv) {
    if (arg === '--apply') apply = true
    else if (arg === '--help' || arg === '-h') help = true
    else return { apply, help, error: `未知参数：${arg}` }
  }
  return { apply, help }
}

type Prepared = { plan: PublishPlan; repo: string }

async function preparePlan(deps: PublishDeps): Promise<Prepared> {
  let remote: string
  try {
    remote = deps.git(['remote', 'get-url', 'origin'])
  } catch (error) {
    throw new StepFailure('workspace', EXIT.workspace, `读不到 origin 远端：${messageOf(error)}`)
  }
  const repo = parseGitHubRepo(remote)
  if (!repo) {
    throw new StepFailure(
      'workspace',
      EXIT.workspace,
      `无法从 origin 的地址认出 GitHub 仓库：${remote.trim()}`
    )
  }
  const origin = siteOrigin(repo)

  let changes: ReturnType<typeof parseStatus>
  try {
    changes = parseStatus(deps.git(['status', '--porcelain', '-z', '-uall']))
  } catch (error) {
    throw new StepFailure('workspace', EXIT.workspace, `读不到工作区状态：${messageOf(error)}`)
  }

  if (changes.conflicts.length > 0) {
    throw new StepFailure(
      'workspace',
      EXIT.workspace,
      `工作区里有没解决的合并冲突：${changes.conflicts.join(', ')}`,
      changes.conflicts
    )
  }
  const blocked = blockedPaths(changes.files)
  if (blocked.length > 0) {
    throw new StepFailure(
      'workspace',
      EXIT.workspace,
      `工作区里有本命令不该提交的改动：${blocked.join(', ')}。先把它们移出工作区再重跑。`,
      blocked
    )
  }

  const needsCommit = changes.files.length > 0
  let files = changes.files
  if (!needsCommit) {
    // 上一次推送被网络拦下时改动已经提交、工作区是干净的；重跑要能接着把那个提交推上去。
    try {
      const pending = deps.git(['log', '--format=%h', 'origin/main..HEAD']).trim()
      if (!pending) throw new StepFailure('workspace', EXIT.workspace, '工作区没有可发布的改动。')
      files = parseNameStatus(deps.git(['diff', '--name-status', '-M', 'origin/main..HEAD']))
    } catch (error) {
      if (error instanceof StepFailure) throw error
      throw new StepFailure(
        'workspace',
        EXIT.workspace,
        `无法和 origin/main 比对：${messageOf(error)}`
      )
    }
    const blockedPending = blockedPaths(files)
    if (blockedPending.length > 0) {
      throw new StepFailure(
        'workspace',
        EXIT.workspace,
        `待推送的提交里有本命令不该发布的改动：${blockedPending.join(', ')}`,
        blockedPending
      )
    }
  }

  return { plan: buildPlan({ files, origin, commit: needsCommit }), repo }
}

async function applyPlan(
  prepared: Prepared,
  deps: PublishDeps
): Promise<{ sha: string; runUrl: string; urls: string[] }> {
  const { plan, repo } = prepared

  const branch = deps.git(['branch', '--show-current']).trim()
  if (branch !== 'main') {
    throw new StepFailure(
      'workspace',
      EXIT.workspace,
      `发布只从 main 执行，当前分支是 ${branch || '(detached HEAD)'}。`
    )
  }

  deps.write('stderr', '构建中（bun run build）…\n')
  const buildCode = deps.exec('bun', ['run', 'build'])
  if (buildCode !== 0) {
    throw new StepFailure(
      'build',
      EXIT.build,
      `构建失败（bun run build 退出码 ${buildCode}），没有产生提交。`
    )
  }

  deps.write('stderr', '跑测试（bun run test）…\n')
  const testCode = deps.exec('bun', ['run', 'test'])
  if (testCode !== 0) {
    throw new StepFailure(
      'test',
      EXIT.test,
      `测试失败（bun run test 退出码 ${testCode}），没有产生提交。`
    )
  }

  if (plan.commit) {
    try {
      deps.git(['add', '-A'])
      deps.git(['commit', '-m', plan.commit.message])
    } catch (error) {
      throw new StepFailure('commit', EXIT.commit, `提交失败：${messageOf(error)}`)
    }
  }

  const sha = deps.git(['rev-parse', 'HEAD']).trim()

  try {
    deps.git(['push', 'origin', 'main'])
  } catch (error) {
    const detail = messageOf(error)
    if (/non-fast-forward|fetch first|\[rejected\]|remote contains work/i.test(detail)) {
      throw new StepFailure(
        'push',
        EXIT.push,
        '推送被远端拒绝：远端 main 有本地没有的提交，先 git pull --rebase 再重跑。工作区与本地提交都还在。'
      )
    }
    throw new StepFailure(
      'push',
      EXIT.push,
      '推送失败（github.com:443 被网络拦截属于本机环境问题，不是代码问题）。工作区与提交已保留，可原样重跑：bun run publish --apply'
    )
  }

  deps.write('stderr', '等待 GitHub Pages 部署…\n')
  const deployed = await waitForDeploy(sha, repo, deps)
  await verifyLive(plan.verifyUrls, deployed.deployStartedAt, deps)
  return { sha, runUrl: deployed.runUrl, urls: plan.verifyUrls }
}

async function waitForDeploy(
  sha: string,
  repo: string,
  deps: PublishDeps
): Promise<{ runUrl: string; deployStartedAt: string }> {
  const started = deps.now()
  let deadline = started + POLL.deadline
  let runId = 0
  let runUrl = ''
  let rerunOnce = false
  let minAttempt = 1
  let warnedSlow = false

  while (deps.now() < deadline) {
    if (runId === 0) {
      let found: RunSnapshot[]
      try {
        const raw = deps.gh([
          'run',
          'list',
          '--repo',
          repo,
          '--workflow',
          DEPLOY_WORKFLOW,
          '--commit',
          sha,
          '--json',
          'databaseId,status,conclusion,attempt,url'
        ])
        found = JSON.parse(raw) as RunSnapshot[]
      } catch (error) {
        throw new StepFailure('deploy', EXIT.deploy, `查询部署记录失败：${messageOf(error)}`)
      }
      if (found.length === 0) {
        // 刚 push 完 CI 可能还没建出 run，先等一会儿再查。
        await deps.sleep(pollInterval(started, deps))
        continue
      }
      runId = found[0].databaseId
      runUrl = found[0].url
    }

    let snapshot: RunSnapshot
    try {
      const raw = deps.gh([
        'run',
        'view',
        String(runId),
        '--repo',
        repo,
        '--json',
        'status,conclusion,attempt,url,jobs'
      ])
      snapshot = JSON.parse(raw) as RunSnapshot
    } catch (error) {
      throw new StepFailure('deploy', EXIT.deploy, `查询部署状态失败：${messageOf(error)}`)
    }
    runUrl = snapshot.url || runUrl
    if (snapshot.attempt < minAttempt) {
      // 重跑后偶尔还能读到上一次 attempt 的旧快照，跳过它。
      await deps.sleep(pollInterval(started, deps))
      continue
    }

    const verdict = evaluateDeploy(snapshot, deps.now())
    if (verdict.state === 'success') {
      if (!verdict.deployStartedAt) {
        throw new StepFailure(
          'deploy',
          EXIT.deploy,
          `部署报告成功，但读不到「${DEPLOY_STEP_NAME}」的启动时间，没法校验页面新鲜度（${runUrl}）。`
        )
      }
      return { runUrl, deployStartedAt: verdict.deployStartedAt }
    }
    if (verdict.state === 'cancelled') {
      throw new StepFailure(
        'deploy',
        EXIT.deploy,
        `这次部署被后续推送取消（cancelled），不算发布成功（${runUrl}）。`
      )
    }
    if (verdict.state === 'failed') {
      throw new StepFailure(
        'deploy',
        EXIT.deploy,
        `部署失败，conclusion 是 ${verdict.conclusion}（${runUrl}）。`
      )
    }
    if (verdict.state === 'stuck') {
      if (rerunOnce) {
        throw new StepFailure(
          'deploy',
          EXIT.deploy,
          `部署卡在「${DEPLOY_STEP_NAME}」上超过 10 分钟，自动重跑一次后仍然卡住（${runUrl}）。`
        )
      }
      rerunOnce = true
      minAttempt = snapshot.attempt + 1
      deps.write(
        'stderr',
        `部署卡在「${DEPLOY_STEP_NAME}」超过 10 分钟，疑似 Pages 侧 updating_pages 卡死，重跑一次…\n`
      )
      try {
        deps.gh(['run', 'rerun', String(runId), '--repo', repo])
      } catch (error) {
        throw new StepFailure('deploy', EXIT.deploy, `重跑部署失败：${messageOf(error)}`)
      }
      deadline = deps.now() + POLL.deadline
      await deps.sleep(POLL.intervalStart)
      continue
    }
    if (verdict.slow && !warnedSlow) {
      warnedSlow = true
      deps.write(
        'stderr',
        `部署已经跑了 5 分钟以上（${DEPLOY_STEP_NAME}），继续等到 10 分钟再决定是否重跑。\n`
      )
    }
    await deps.sleep(pollInterval(started, deps))
  }

  throw new StepFailure(
    'deploy',
    EXIT.deploy,
    `等待部署超时（15 分钟）${runUrl ? `：${runUrl}` : '。'}`
  )
}

async function verifyLive(urls: string[], deployedAt: string, deps: PublishDeps): Promise<void> {
  if (urls.length === 0) return
  const started = deps.now()
  const deadline = started + VERIFY.deadline
  let warned = false

  while (deps.now() < deadline) {
    const stale: string[] = []
    for (const url of urls) {
      const verdict = evaluateLive(await deps.head(url), deployedAt)
      if (verdict.state === 'stale')
        stale.push(`${url}（${describeStale(verdict.reason, verdict.status)}）`)
    }
    if (stale.length === 0) return
    if (!warned && deps.now() - started >= VERIFY.warnAfter) {
      warned = true
      deps.write('stderr', `线上页面还没更新，继续等：${stale.join('，')}\n`)
    }
    await deps.sleep(VERIFY.interval)
  }

  throw new StepFailure(
    'verify',
    EXIT.verify,
    `线上校验超时（10 分钟）：${urls.join(', ')} 仍未更新。`
  )
}

function describeStale(
  reason: 'not-deployed' | 'stale-cache' | 'http-error',
  status: number
): string {
  if (reason === 'not-deployed') return '还是 404'
  if (reason === 'http-error') return `HTTP ${status}`
  return 'Last-Modified 还是旧的'
}

function pollInterval(started: number, deps: PublishDeps): number {
  return deps.now() - started > POLL.slowAfter ? POLL.intervalSlow : POLL.intervalStart
}

function emit(deps: PublishDeps, output: PublishOutput): void {
  deps.write('stdout', `${JSON.stringify(output)}\n`)
}

function planSummary(plan: PublishPlan): string {
  const lines = ['发布计划（默认不写任何东西）：']
  for (const file of plan.files) lines.push(`  ${file.change} ${file.path}`)
  if (plan.articles.length > 0) {
    lines.push(
      `  文章：${plan.articles.map((article) => `${article.collection}/${article.slug}`).join('，')}`
    )
  }
  lines.push(
    plan.commit ? `  提交信息：${plan.commit.message}` : '  提交信息：（已有提交，只推送）'
  )
  for (const url of plan.verifyUrls) lines.push(`  校验地址：${url}`)
  lines.push('加 --apply 执行。')
  return `${lines.join('\n')}\n`
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
