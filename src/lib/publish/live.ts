export type LiveResponse = {
  status: number
  /** 响应头 `Last-Modified`，缺失就是 null。 */
  lastModified: string | null
}

export type LiveEvaluation =
  | { state: 'fresh'; lastModified: string }
  | { state: 'stale'; reason: 'not-deployed' | 'stale-cache' | 'http-error'; status: number }

/**
 * 判断线上页面是不是这次部署的产物。
 *
 * `Last-Modified >= 部署步骤启动时间` 才算法证：`Age`、查询串、no-cache 请求头都会被 Fastly
 * 忽略，HTML 的 max-age 是 600，所以只能比时间戳。301 在取响应时已跟随，这里拿到的应当是
 * 无斜杠地址的最终状态。
 */
export function evaluateLive(response: LiveResponse, deployedAt: string): LiveEvaluation {
  if (response.status !== 200) {
    return {
      state: 'stale',
      reason: response.status === 404 ? 'not-deployed' : 'http-error',
      status: response.status
    }
  }
  const modified = response.lastModified ? Date.parse(response.lastModified) : Number.NaN
  if (!Number.isFinite(modified))
    return { state: 'stale', reason: 'stale-cache', status: response.status }
  return modified >= Date.parse(deployedAt)
    ? { state: 'fresh', lastModified: response.lastModified as string }
    : { state: 'stale', reason: 'stale-cache', status: response.status }
}
