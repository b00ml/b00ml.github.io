import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { CONTENT_DIRS, findEntryFile } from '../content/entries.ts'
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
    },
    articles: () => siteArticles(),
    // 与站内路由共用 findEntryFile，避免「工具认为存在、路由找不到」的分叉。
    // 计划里的路径一律相对仓库根、正斜杠，和 CONTENT_DIRS 的写法一致。
    entryFile: (collection, slug) => {
      const file = findEntryFile(collection, slug)
      return file === undefined ? undefined : relative(process.cwd(), file).replace(/\\/g, '/')
    }
  }
}

/** 站内已有文章：三个内容目录下的 Markdown 文件，标签词表从它们的 frontmatter 汇总。 */
function siteArticles(): string[] {
  return Object.values(CONTENT_DIRS).flatMap((dir) => markdownFiles(dir))
}

function markdownFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...markdownFiles(path))
    else if (/\.mdx?$/.test(entry.name)) files.push(path)
  }
  return files
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
