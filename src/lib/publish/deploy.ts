export const DEPLOY_STEP_NAME = 'Deploy to GitHub Pages'

// Pages 侧偶发卡在 updating_pages 没有任何 API 能查。只能看真实部署步骤跑了多久：
// 超过 5 分钟开始提示，超过 10 分钟当作卡死，交给调用方决定重跑。
export const SLOW_DEPLOY_MS = 5 * 60_000
export const STUCK_DEPLOY_MS = 10 * 60_000

export type RunStep = {
  name: string
  startedAt?: string
  status?: string
}

export type RunJob = {
  name?: string
  steps?: RunStep[]
}

/** `gh run view --json status,conclusion,attempt,url,jobs` 的结构（只保留用得到的字段）。 */
export type RunSnapshot = {
  databaseId: number
  status: string
  conclusion: string | null
  attempt: number
  url: string
  jobs: RunJob[]
}

export type DeployEvaluation =
  | { state: 'running'; deployStartedAt: string | null; slow: boolean }
  | { state: 'stuck'; deployStartedAt: string }
  | { state: 'success'; deployStartedAt: string | null }
  | { state: 'cancelled' }
  | { state: 'failed'; conclusion: string }

/**
 * 找真实部署步骤的启动时间。返回 null 表示读不到，调用方不能拿别的时间凑合——
 * 页面新鲜度校验全靠它和 `Last-Modified` 对齐。
 */
export function findDeployStepStart(run: RunSnapshot): string | null {
  for (const job of run.jobs ?? []) {
    for (const step of job.steps ?? []) {
      if (step.name === DEPLOY_STEP_NAME && step.startedAt) return step.startedAt
    }
  }
  return null
}

export function evaluateDeploy(run: RunSnapshot, now: number): DeployEvaluation {
  const deployStartedAt = findDeployStepStart(run)
  if (run.status !== 'completed') {
    if (!deployStartedAt) return { state: 'running', deployStartedAt: null, slow: false }
    const elapsed = now - Date.parse(deployStartedAt)
    if (elapsed > STUCK_DEPLOY_MS) return { state: 'stuck', deployStartedAt }
    return { state: 'running', deployStartedAt, slow: elapsed > SLOW_DEPLOY_MS }
  }
  if (run.conclusion === 'success') return { state: 'success', deployStartedAt }
  if (run.conclusion === 'cancelled') return { state: 'cancelled' }
  return { state: 'failed', conclusion: run.conclusion ?? 'unknown' }
}
