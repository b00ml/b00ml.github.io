/**
 * 从 git remote 的 URL 里认出 GitHub 的 owner/repo。
 *
 * 仓库有 `upstream`（Apache-2.0 上游），裸跑 `gh` 会解析到上游而不是本站，所以所有 gh 调用都
 * 得带 `--repo <owner>/<repo>`；这个名字就来自 `origin`。
 */
export function parseGitHubRepo(remote: string): string | undefined {
  const normalized = remote.trim().replace(/\/+$/, '')
  if (!normalized) return undefined
  const match = normalized.match(/github\.com[:/]([^/]+)\/([^/]+)$/)
  if (!match) return undefined
  return `${match[1]}/${match[2].replace(/\.git$/, '')}`
}

/** 站点根地址，遵循 GitHub Pages 的项目站约定。 */
export function siteOrigin(repository: string): string {
  const [owner, name] = repository.split('/')
  return name === `${owner}.github.io`
    ? `https://${owner}.github.io`
    : `https://${owner}.github.io/${name}`
}
