import { spawnSync } from 'node:child_process'

import { runPublish, type PublishDeps } from './command.ts'
import type { LiveResponse } from './live.ts'

/**
 * 真实副作用装配层：git/gh 用 spawnSync 直接拿 stdout（不经 shell 重定向，避免 Windows
 * 的 BOM 和引号问题），构建/测试的子进程输出全部走 stderr，stdout 只留结构化结果。
 */
export function createDeps(): PublishDeps {
  return {
    git: (args) => run('git', args),
    gh: (args) => run('gh', args),
    exec: (command, args) =>
      spawnSync(command, args, {
        stdio: ['inherit', 2, 2],
        shell: process.platform === 'win32'
      }).status ?? 1,
    head,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    write: (stream, text) => {
      ;(stream === 'stdout' ? process.stdout : process.stderr).write(text)
    }
  }
}

export async function main(argv: string[]): Promise<number> {
  try {
    return await runPublish(argv, createDeps())
  } catch (error) {
    process.stderr.write(`✗ ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} 无法执行：${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} 失败（退出码 ${result.status}）：${(result.stderr ?? '').trim()}`
    )
  }
  return result.stdout ?? ''
}

async function head(url: string): Promise<LiveResponse> {
  try {
    // 文章地址会 301 到带斜杠的变体，必须跟随重定向后看最终状态。
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000)
    })
    return { status: response.status, lastModified: response.headers.get('last-modified') }
  } catch {
    return { status: 0, lastModified: null }
  }
}
