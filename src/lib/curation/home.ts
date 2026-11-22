import { buildProjectCards, type ProjectCardItem, type ProjectEntryInput } from '../projects/cards'

export type ArticleEntryInput = {
  id: string
  data: {
    title: string
    description: string
    pubDate: Date
    tags?: readonly string[]
    draft?: boolean
    featured?: boolean
    featuredOrder?: number
  }
}

export type FeaturedWritingItem = {
  collection: 'blog' | 'product'
  collectionLabel: '工程实践' | '产品思考'
  href: string
  title: string
  description: string
  pubDate: Date
  tags: string[]
}

export type RecentNoteItem = {
  href: string
  title: string
  pubDate: Date
}

export type HomeViewModel = {
  featuredProjects: ProjectCardItem[]
  featuredWriting: FeaturedWritingItem[]
  recentNotes: RecentNoteItem[]
}

export type HomeCurationInput = {
  projects: readonly ProjectEntryInput[]
  blog: readonly ArticleEntryInput[]
  product: readonly ArticleEntryInput[]
  notes: readonly ArticleEntryInput[]
  isProd?: boolean
  featuredWritingLimit?: number
  recentNotesLimit?: number
}

const WRITING_COLLECTION_LABELS = {
  blog: '工程实践',
  product: '产品思考'
} as const

function normalizeEntryId(id: string): string {
  return id.replace(/\.(md|mdx)$/i, '')
}

type TaggedWritingCandidate = {
  collection: 'blog' | 'product'
  entry: ArticleEntryInput
  href: string
}

function compareByPubDateDesc(a: TaggedWritingCandidate, b: TaggedWritingCandidate): number {
  const dateDiff = +new Date(b.entry.data.pubDate) - +new Date(a.entry.data.pubDate)
  if (dateDiff !== 0) return dateDiff
  return a.href.localeCompare(b.href)
}

function toFeaturedWritingItem({
  collection,
  entry,
  href
}: TaggedWritingCandidate): FeaturedWritingItem {
  return {
    collection,
    collectionLabel: WRITING_COLLECTION_LABELS[collection],
    href,
    title: entry.data.title,
    description: entry.data.description,
    pubDate: entry.data.pubDate,
    tags: [...(entry.data.tags ?? [])]
  }
}

export function formatDateYmd(date: Date): string {
  return new Date(date).toISOString().slice(0, 10)
}

export function buildHomeViewModel(input: HomeCurationInput): HomeViewModel {
  const { isProd = true, featuredWritingLimit = 4, recentNotesLimit = 5 } = input
  const isVisible = (entry: ArticleEntryInput): boolean => !isProd || !entry.data.draft

  const candidates: TaggedWritingCandidate[] = [
    ...input.blog.filter(isVisible).map((entry) => ({
      collection: 'blog' as const,
      entry,
      href: `/blog/${normalizeEntryId(entry.id)}`
    })),
    ...input.product.filter(isVisible).map((entry) => ({
      collection: 'product' as const,
      entry,
      href: `/product/${normalizeEntryId(entry.id)}`
    }))
  ]

  const featuredCandidates = candidates
    .filter(({ entry }) => Boolean(entry.data.featured))
    .sort((a, b) => {
      const orderA = a.entry.data.featuredOrder ?? Number.POSITIVE_INFINITY
      const orderB = b.entry.data.featuredOrder ?? Number.POSITIVE_INFINITY
      if (orderA !== orderB) return orderA - orderB
      return compareByPubDateDesc(a, b)
    })

  const backfillCandidates = candidates
    .filter(({ entry }) => !entry.data.featured)
    .sort(compareByPubDateDesc)

  const featuredWriting = [...featuredCandidates, ...backfillCandidates]
    .slice(0, Math.max(0, featuredWritingLimit))
    .map(toFeaturedWritingItem)

  const recentNotes: RecentNoteItem[] = input.notes
    .filter(isVisible)
    .map((entry) => ({
      href: `/notes/${normalizeEntryId(entry.id)}`,
      title: entry.data.title,
      pubDate: entry.data.pubDate
    }))
    .sort((a, b) => {
      const dateDiff = +new Date(b.pubDate) - +new Date(a.pubDate)
      if (dateDiff !== 0) return dateDiff
      return a.href.localeCompare(b.href)
    })
    .slice(0, Math.max(0, recentNotesLimit))

  return {
    featuredProjects: buildProjectCards(input.projects, { isProd, featuredOnly: true }),
    featuredWriting,
    recentNotes
  }
}
