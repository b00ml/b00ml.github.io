import { describe, expect, test } from 'bun:test'

import { countAndSortTags } from './tags'

describe('countAndSortTags', () => {
  test('counts tag occurrences and sorts by count descending then zh-CN locale ascending', () => {
    const entries = [
      { data: { tags: ['工程', 'agent'] } },
      { data: { tags: ['产品', 'agent'] } },
      { data: { tags: ['架构'] } },
      { data: { tags: [] } }
    ]

    expect(countAndSortTags(entries)).toEqual([
      ['agent', 2],
      ['产品', 1],
      ['工程', 1],
      ['架构', 1]
    ])
  })

  test('returns empty array when no tags exist', () => {
    expect(countAndSortTags([])).toEqual([])
    expect(countAndSortTags([{ data: { tags: [] } }])).toEqual([])
  })
})
