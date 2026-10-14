import { describe, expect, test } from 'bun:test'

import { detailAvailable, published } from './drafts'
import { listingMetadata, sectionMetadata } from './metadata'

describe('section metadata', () => {
  test('section copy and meaningful pagination', () => {
    expect(sectionMetadata('/about')?.title).toBe('关于我')
    expect(sectionMetadata('/product')?.title).toBe('产品')
    expect(sectionMetadata('/blog/existing/post')).toBeUndefined()
    expect(listingMetadata('notes', 2, ['实际笔记标题'], 'ai').title).toBe('笔记 · ai 标签 · 第 2 页')
    expect(listingMetadata('blog', 1, ['Real article']).description).toContain('Real article')
  })

  test('section copy never advertises discontinued services', () => {
    for (const path of ['/', '/about', '/projects', '/product', '/tags', '/notes/tags']) {
      const description = sectionMetadata(path)?.description
      expect(description).toBeTruthy()
      expect(description).not.toMatch(
        /付费|模拟面试|简历辅导|微信|QQ|paid|consulting|mock interview|coaching|WeChat/i
      )
    }
  })
})

describe('draft publication policy', () => {
  test('production denies drafts; explicit Preview and local dev allow detail only', () => {
    for (const preview of [false, true])
      for (const dev of [false, true]) {
        expect(detailAvailable(false, preview, dev)).toBe(true)
        expect(detailAvailable(true, preview, dev)).toBe(preview || dev)
        expect(published({ data: { draft: true } })).toBe(false)
      }
  })
})
