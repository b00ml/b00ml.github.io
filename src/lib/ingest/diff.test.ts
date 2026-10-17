import { expect, test } from 'bun:test'

import { unifiedDiff } from './diff'

test('identical bodies produce no diff at all', () => {
  expect(unifiedDiff('一\n二\n三', '一\n二\n三')).toBe('')
  expect(unifiedDiff('', '')).toBe('')
})

test('a one-line edit shows the line and three lines of context', () => {
  const before = ['一', '二', '三', '四', '五', '六', '七', '八'].join('\n')
  const after = ['一', '二', '三', '四改', '五', '六', '七', '八'].join('\n')

  expect(unifiedDiff(before, after)).toBe(
    [
      '--- 当前正文',
      '+++ 覆盖后正文',
      '@@ -1,7 +1,7 @@',
      ' 一',
      ' 二',
      ' 三',
      '-四',
      '+四改',
      ' 五',
      ' 六',
      ' 七'
    ].join('\n')
  )
})

test('a full rewrite is one hunk with every old line removed and every new line added', () => {
  expect(unifiedDiff('a\nb', 'x\ny')).toBe(
    ['--- 当前正文', '+++ 覆盖后正文', '@@ -1,2 +1,2 @@', '-a', '-b', '+x', '+y'].join('\n')
  )
})

test('appending a line keeps the existing lines as context', () => {
  expect(unifiedDiff('a\nb', 'a\nb\nc')).toBe(
    ['--- 当前正文', '+++ 覆盖后正文', '@@ -1,2 +1,3 @@', ' a', ' b', '+c'].join('\n')
  )
})

test('deleting every line counts zero lines on the new side', () => {
  expect(unifiedDiff('only', '')).toBe(
    ['--- 当前正文', '+++ 覆盖后正文', '@@ -1,1 +0,0 @@', '-only'].join('\n')
  )
})

test('writing into an empty body counts zero lines on the old side', () => {
  expect(unifiedDiff('', 'new')).toBe(
    ['--- 当前正文', '+++ 覆盖后正文', '@@ -0,0 +1,1 @@', '+new'].join('\n')
  )
})

test('changes farther apart than the context become separate hunks', () => {
  const before = Array.from({ length: 20 }, (_, index) => `line-${index}`).join('\n')
  const after = before.replace('line-2', 'line-2-changed').replace('line-18', 'line-18-changed')

  const headerLines = unifiedDiff(before, after)
    .split('\n')
    .filter((line) => line.startsWith('@@'))

  expect(headerLines.length).toBe(2)
})
