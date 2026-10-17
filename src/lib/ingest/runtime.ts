import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { runIngest, type IngestDeps } from './command.ts'

/**
 * 真实副作用装配层：git 用 spawnSync 直接拿 stdout，源笔记按字节读、
 * 目标文章按 UTF-8 写；stdout 只留结构化结果，进度写 stderr。
 */
export function createDeps(): IngestDeps {
  return {
    git: (args) => run('git', args),
    read: (path) => readFileSync(path),
    exists: (path) => existsSync(path),
    writeFile: (path, text) => writeFileSync(path, text, 'utf8'),
    writeBytes: (path, bytes) => writeFileSync(path, bytes),
    write: (stream, text) => {
      ;(stream === 'stdout' ? process.stdout : process.stderr).write(text)
    }
  }
}

export function main(argv: string[]): number {
  try {
    return runIngest(argv, createDeps())
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
