/**
 * 行级 unified diff。覆盖一篇已有文章之前，计划要把「磁盘上的正文」与「--apply 将要写下的
 * 正文」的差异摆出来；正文只差几行时，人需要看见的是那几行，而不是整篇被抄两遍。
 * 这里只用行号与最长公共子序列，不引依赖：它是纯函数，能单独测。
 */

/** 一行的角色：上下文、只在当前正文、只在覆盖后的正文。 */
type DiffLine = { kind: ' ' | '-' | '+'; text: string }

/** 每个 hunk 带几行上下文。3 是 unified diff 的惯例，足以定位又不至于把整篇抄一遍。 */
const CONTEXT = 3

/**
 * 当前正文与覆盖后正文的差异，格式与 `git diff` 的 hunk 一致：先是 `---` / `+++` 两行，
 * 随后是按 3 行上下文合并的 hunk。没有差异返回空串——空串本身是「覆盖后一字不差」的答案。
 */
export function unifiedDiff(before: string, after: string): string {
  const operations = diffLines(linesOf(before), linesOf(after))
  if (!operations.some((line) => line.kind !== ' ')) return ''
  return ['--- 当前正文', '+++ 覆盖后正文', ...hunks(operations)].join('\n')
}

/** 空正文是没有行，不是一个空行；否则空串会被当成一行参与 diff。 */
function linesOf(text: string): string[] {
  return text === '' ? [] : text.split('\n')
}

/**
 * 行级差异。先剥掉公共前后缀再对中间做 LCS：正文动一两行时中间很短，
 * 既省时间，也让结果自然把差异集中在一处。
 */
function diffLines(before: string[], after: string[]): DiffLine[] {
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const context = (text: string): DiffLine => ({ kind: ' ', text })
  return [
    ...before.slice(0, prefix).map(context),
    ...middleOps(
      before.slice(prefix, before.length - suffix),
      after.slice(prefix, after.length - suffix)
    ),
    ...before.slice(before.length - suffix).map(context)
  ]
}

/** 中间段的 LCS（从后往前填表），再正向走出删除与新增；删在前、增在后是 diff 的惯例。 */
function middleOps(before: string[], after: string[]): DiffLine[] {
  const columns = after.length + 1
  const lengths = new Int32Array((before.length + 1) * columns)
  const at = (row: number, column: number): number => row * columns + column
  for (let row = before.length - 1; row >= 0; row -= 1) {
    for (let column = after.length - 1; column >= 0; column -= 1) {
      lengths[at(row, column)] =
        before[row] === after[column]
          ? lengths[at(row + 1, column + 1)] + 1
          : Math.max(lengths[at(row + 1, column)], lengths[at(row, column + 1)])
    }
  }
  const operations: DiffLine[] = []
  let row = 0
  let column = 0
  while (row < before.length && column < after.length) {
    if (before[row] === after[column]) {
      operations.push({ kind: ' ', text: before[row] })
      row += 1
      column += 1
    } else if (lengths[at(row + 1, column)] >= lengths[at(row, column + 1)]) {
      operations.push({ kind: '-', text: before[row] })
      row += 1
    } else {
      operations.push({ kind: '+', text: after[column] })
      column += 1
    }
  }
  for (; row < before.length; row += 1) operations.push({ kind: '-', text: before[row] })
  for (; column < after.length; column += 1) operations.push({ kind: '+', text: after[column] })
  return operations
}

/**
 * 把差异行切成 hunk，并写出 `@@ -旧起点,旧行数 +新起点,新行数 @@`。
 * 空的一侧按 unified diff 的约定，起点写成「插入点之前的行号」（文件头是 0）。
 */
function hunks(operations: DiffLine[]): string[] {
  const beforeCount = new Int32Array(operations.length + 1)
  const afterCount = new Int32Array(operations.length + 1)
  for (let index = 0; index < operations.length; index += 1) {
    beforeCount[index + 1] = beforeCount[index] + (operations[index].kind === '+' ? 0 : 1)
    afterCount[index + 1] = afterCount[index] + (operations[index].kind === '-' ? 0 : 1)
  }
  const lines: string[] = []
  for (const range of ranges(operations)) {
    const oldCount = beforeCount[range.end] - beforeCount[range.start]
    const newCount = afterCount[range.end] - afterCount[range.start]
    const oldStart = oldCount === 0 ? beforeCount[range.start] : beforeCount[range.start] + 1
    const newStart = newCount === 0 ? afterCount[range.start] : afterCount[range.start] + 1
    lines.push(
      `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
      ...operations.slice(range.start, range.end).map((line) => `${line.kind}${line.text}`)
    )
  }
  return lines
}

/** 每处改动取前后各 CONTEXT 行；相距不超过两倍上下文的改动并进同一个 hunk。 */
function ranges(operations: DiffLine[]): { start: number; end: number }[] {
  const merged: { start: number; end: number }[] = []
  operations.forEach((line, index) => {
    if (line.kind === ' ') return
    const start = Math.max(0, index - CONTEXT)
    const end = Math.min(operations.length, index + CONTEXT + 1)
    const last = merged[merged.length - 1]
    if (last !== undefined && start <= last.end) last.end = Math.max(last.end, end)
    else merged.push({ start, end })
  })
  return merged
}
