export type TaggedEntry = {
  data: {
    tags: readonly string[]
  }
}

export function countAndSortTags(entries: readonly TaggedEntry[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    for (const tag of entry.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries()).sort(([tagA, countA], [tagB, countB]) =>
    countB !== countA ? countB - countA : tagA.localeCompare(tagB, 'zh-CN')
  )
}
