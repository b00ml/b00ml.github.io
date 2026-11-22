import { describe, expect, test } from 'bun:test'
import type { Root } from 'mdast'

import { calculateReadingTime, formatReadingTime, remarkReadingTime } from './remark-reading-time'

describe('calculateReadingTime', () => {
  test('uses 350 characters per minute for Chinese text', () => {
    const result = calculateReadingTime('中'.repeat(700))

    expect(result.cjkCharacters).toBe(700)
    expect(result.words).toBe(0)
    expect(result.displayedMinutes).toBe(2)
  })

  test('uses 200 words per minute for English text', () => {
    const result = calculateReadingTime(Array(400).fill('agent').join(' '))

    expect(result.cjkCharacters).toBe(0)
    expect(result.words).toBe(400)
    expect(result.displayedMinutes).toBe(2)
  })

  test('adds CJK and English reading time for mixed content', () => {
    const result = calculateReadingTime(`${'中'.repeat(350)} ${Array(200).fill('agent').join(' ')}`)

    expect(result.minutes).toBe(2)
    expect(result.displayedMinutes).toBe(2)
  })

  test('writes Chinese minutesRead onto Astro frontmatter', () => {
    const tree: Root = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: '中'.repeat(700) }] }]
    }
    const frontmatter: Record<string, unknown> = {}
    const transform = remarkReadingTime.call({} as never) as (
      tree: Root,
      file: { data: { astro: { frontmatter: Record<string, unknown> } } }
    ) => void

    transform(tree, { data: { astro: { frontmatter } } })

    expect(frontmatter.minutesRead).toBe('2 分钟阅读')
    expect(frontmatter.words).toBe(700)
  })

  test('formats standalone reading time with a 1-minute floor', () => {
    expect(formatReadingTime('短句')).toBe('1 分钟阅读')
    expect(formatReadingTime('中'.repeat(1050))).toBe('3 分钟阅读')
  })
})
