import { CONTENT_DIRS } from '../content/entries.ts'

export type ChangeKind = 'added' | 'modified' | 'deleted' | 'renamed'

export type ChangedFile = {
  path: string
  change: ChangeKind
  /** 重命名/复制时 git 给出的原路径，生成提交信息时用得上。 */
  from?: string
}

export type WorkspaceChanges = {
  files: ChangedFile[]
  conflicts: string[]
}

// 发布命令只认内容目录、图片目录和它自己的文档；其余改动都意味着工作区里混进了别的东西。
const ALLOWED_FILES = ['docs/publish-tool.md', 'docs/publish-workflow.md']
const ALLOWED_PREFIXES = [...Object.values(CONTENT_DIRS).map((dir) => `${dir}/`), 'src/assets/']

/**
 * 解析 `git status --porcelain -z -uall`。`-z` 下重命名/复制会多占一段 NUL：
 * 先是目标路径再是原路径，所以解析时要把下一段当作 `from` 消费掉。
 */
export function parseStatus(output: string): WorkspaceChanges {
  const parts = output.split('\0')
  const files: ChangedFile[] = []
  const conflicts: string[] = []
  for (let index = 0; index < parts.length; index++) {
    const entry = parts[index]
    if (!entry) continue
    const x = entry[0]
    const y = entry[1]
    const path = entry.slice(3)
    if (isConflicted(x, y)) {
      conflicts.push(path)
      continue
    }
    if (x === 'R' || y === 'R') {
      const from = parts[++index]
      files.push({ path, change: 'renamed', ...(from ? { from } : {}) })
    } else if (x === 'C' || y === 'C') {
      const from = parts[++index]
      files.push({ path, change: 'added', ...(from ? { from } : {}) })
    } else if (x === '?' || x === 'A' || y === 'A') {
      files.push({ path, change: 'added' })
    } else if (x === 'D' || y === 'D') {
      files.push({ path, change: 'deleted' })
    } else {
      files.push({ path, change: 'modified' })
    }
  }
  return { files, conflicts }
}

/** 解析 `git diff --name-status -M <range>`，用于接续上一次没推成功的提交。 */
export function parseNameStatus(output: string): ChangedFile[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, first, second] = line.split('\t')
      const code = status[0]
      if (code === 'R' || code === 'C') {
        return {
          path: second,
          change: code === 'R' ? 'renamed' : 'added',
          from: first
        } as ChangedFile
      }
      return {
        path: first,
        change: code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified'
      } as ChangedFile
    })
}

/**
 * 暂存区（index）里有改动的路径：`git status --porcelain` 的 X 位不是空格也不是 `?`。
 * 重命名/复制连同原路径一起返回——在 index 里它们是同一件事的两端。
 */
export function stagedPaths(output: string): string[] {
  const parts = output.split('\0')
  const paths: string[] = []
  for (let index = 0; index < parts.length; index++) {
    const entry = parts[index]
    if (!entry) continue
    const x = entry[0]
    const y = entry[1]
    const path = entry.slice(3)
    const renamed = x === 'R' || y === 'R' || x === 'C' || y === 'C'
    const from = renamed ? parts[++index] : undefined
    if (x === ' ' || x === '?') continue
    paths.push(path)
    if (from) paths.push(from)
  }
  return paths
}

export function isAllowedPath(path: string): boolean {
  return ALLOWED_FILES.includes(path) || ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))
}

export function blockedPaths(files: ChangedFile[]): string[] {
  const blocked: string[] = []
  for (const file of files) {
    if (!isAllowedPath(file.path)) blocked.push(file.path)
    if (file.from && !isAllowedPath(file.from)) blocked.push(file.from)
  }
  return blocked
}

function isConflicted(x: string, y: string): boolean {
  if (x === 'U' || y === 'U') return true
  return x === y && (x === 'A' || x === 'D')
}
