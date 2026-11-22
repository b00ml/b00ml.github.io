import { isProjectRoot, projectPath, projectRootId } from './entries'
import type { ProjectStatus } from './status'

export type ProjectLink = {
  label: string
  href: string
}

export type ProjectEntryInput = {
  id: string
  data: {
    title: string
    description: string
    pubDate: Date
    draft?: boolean
    featured?: boolean
    status?: ProjectStatus
    role?: string
    period?: string
    stack?: string[]
    order?: number
    summary?: string
    highlights?: string[]
    links?: ProjectLink[]
  }
}

export type ProjectCardItem = {
  slug: string
  href: string
  title: string
  summary: string
  status: ProjectStatus
  role?: string
  period?: string
  highlights: string[]
  stack: string[]
  links: ProjectLink[]
  partCount: number
}

export type BuildProjectCardsOptions = {
  isProd: boolean
  featuredOnly?: boolean
}

export function isExternalProjectLink(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

export function buildProjectCards(
  entries: readonly ProjectEntryInput[],
  options: BuildProjectCardsOptions
): ProjectCardItem[] {
  const { isProd, featuredOnly = false } = options
  const visible = isProd ? entries.filter((entry) => !entry.data.draft) : entries
  const allRoots = visible.filter(isProjectRoot)
  const featuredRoots = featuredOnly ? allRoots.filter((entry) => entry.data.featured) : []
  const selectedRoots = featuredOnly && featuredRoots.length > 0 ? featuredRoots : allRoots

  const roots = selectedRoots.slice().sort((a, b) => {
    const orderDiff = (a.data.order ?? 0) - (b.data.order ?? 0)
    if (orderDiff !== 0) return orderDiff
    const dateDiff = +new Date(b.data.pubDate) - +new Date(a.data.pubDate)
    if (dateDiff !== 0) return dateDiff
    return projectPath(a).localeCompare(projectPath(b))
  })

  return roots.map((entry) => {
    const slug = projectPath(entry)
    const partCount = visible.filter(
      (item) => !isProjectRoot(item) && projectRootId(item) === slug
    ).length
    const summary = entry.data.summary?.trim() || entry.data.description

    return {
      slug,
      href: `/projects/${slug}`,
      title: entry.data.title,
      summary,
      status: entry.data.status ?? 'shipped',
      ...(entry.data.role !== undefined ? { role: entry.data.role } : {}),
      ...(entry.data.period !== undefined ? { period: entry.data.period } : {}),
      highlights: [...(entry.data.highlights ?? [])],
      stack: [...(entry.data.stack ?? [])],
      links: (entry.data.links ?? []).map(({ label, href }) => ({ label, href })),
      partCount
    }
  })
}
