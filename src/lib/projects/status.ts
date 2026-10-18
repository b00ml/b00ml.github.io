/**
 * The four states a project entry can be in. Kept in one place because the
 * listing groups by them, the detail page badges them, and the label wording is
 * the part a reader actually uses to decide whether a project is worth opening.
 */
export type ProjectStatus = 'ongoing' | 'shipped' | 'oss' | 'paused'

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  ongoing: '在做',
  shipped: '已交付',
  oss: '开源',
  paused: '暂停'
}

/** Listing order: what is alive comes first, what has stopped comes last. */
export const STATUS_ORDER: ProjectStatus[] = ['ongoing', 'shipped', 'oss', 'paused']

export const STATUS_NOTE: Record<ProjectStatus, string> = {
  ongoing: '还在推进，会持续更新',
  shipped: '跑通过一版，现在不常动',
  oss: '代码在外，可以直接看',
  paused: '停下来过，经验还在'
}
