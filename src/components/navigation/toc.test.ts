import type { MarkdownHeading } from 'astro'
import { describe, expect, test } from 'bun:test'

import { filterTocHeadings, generateToc } from './toc'

describe('filterTocHeadings', () => {
  test('keeps only h2 and h3 headings in document order', () => {
    const headings: MarkdownHeading[] = [
      { depth: 1, slug: 'title', text: 'Title' },
      { depth: 2, slug: 'loop', text: '01 · 一个闭环，不是三步流程' },
      { depth: 3, slug: 'roadmap', text: '锚定目标：Roadmap 是滤出来的' },
      { depth: 4, slug: 'detail', text: '过深的小节' },
      { depth: 5, slug: 'footnote', text: '五级标题' }
    ]

    expect(filterTocHeadings(headings)).toEqual([
      { depth: 2, slug: 'loop', text: '01 · 一个闭环，不是三步流程' },
      { depth: 3, slug: 'roadmap', text: '锚定目标：Roadmap 是滤出来的' }
    ])
  })

  test('returns an empty list when headings are absent or lack h2/h3 sections', () => {
    expect(filterTocHeadings()).toEqual([])
    expect(filterTocHeadings([])).toEqual([])
    expect(
      filterTocHeadings([
        { depth: 1, slug: 'stray-h1', text: 'Stray H1' },
        { depth: 4, slug: 'deep-h4', text: 'Deep H4' }
      ])
    ).toEqual([])
  })

  test('never yields a non-empty list that generateToc turns into an empty tree', () => {
    const h1Only: MarkdownHeading[] = [{ depth: 1, slug: 'only-h1', text: 'Only H1' }]
    const filtered = filterTocHeadings(h1Only)
    expect(filtered.length > 0).toBe(generateToc(filtered).length > 0)
  })
})

describe('generateToc', () => {
  test('nests h3 subsections under their parent h2 and resumes top-level on next h2', () => {
    const headings = filterTocHeadings([
      { depth: 2, slug: 's1', text: '01 · 闭环' },
      { depth: 2, slug: 's4', text: '04 · 试' },
      { depth: 3, slug: 's4-1', text: '锚定目标' },
      { depth: 3, slug: 's4-2', text: '节奏评估' },
      { depth: 2, slug: 's5', text: '05 · 价值观' }
    ])

    expect(generateToc(headings)).toEqual([
      { depth: 2, slug: 's1', text: '01 · 闭环', subheadings: [] },
      {
        depth: 2,
        slug: 's4',
        text: '04 · 试',
        subheadings: [
          { depth: 3, slug: 's4-1', text: '锚定目标', subheadings: [] },
          { depth: 3, slug: 's4-2', text: '节奏评估', subheadings: [] }
        ]
      },
      { depth: 2, slug: 's5', text: '05 · 价值观', subheadings: [] }
    ])
  })

  test('keeps a leading h3 at top level when no h2 precedes it', () => {
    const headings = filterTocHeadings([{ depth: 3, slug: 'intro-sub', text: '前置小节' }])

    expect(generateToc(headings)).toEqual([
      { depth: 3, slug: 'intro-sub', text: '前置小节', subheadings: [] }
    ])
  })
})
