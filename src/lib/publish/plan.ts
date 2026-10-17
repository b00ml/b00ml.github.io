import { CONTENT_DIRS } from '../content/entries.ts'
import type { ChangedFile } from './workspace.ts'

export type PlannedArticle = {
  collection: string
  slug: string
  change: 'added' | 'modified' | 'deleted'
  url: string
}

export type PublishPlan = {
  files: ChangedFile[]
  articles: PlannedArticle[]
  /** null 表示改动已经提交过了（上次推送被拦），这次只推送、不再新建提交。 */
  commit: { message: string } | null
  verifyUrls: string[]
}

export function buildPlan(input: {
  files: ChangedFile[]
  origin: string
  commit: boolean
}): PublishPlan {
  const articles = input.files
    .map((file) => articleFor(file, input.origin))
    .filter((article): article is PlannedArticle => article !== undefined)
  return {
    files: input.files,
    articles,
    commit: input.commit ? { message: commitMessage(articles, input.files) } : null,
    verifyUrls: articles
      .filter((article) => article.change !== 'deleted')
      .map((article) => article.url)
  }
}

/**
 * 提交信息由改动本身决定，不看模型发挥：文章用 `content: <verb> <slug>[, <slug>]`，
 * 纯文档改动用 `docs: ...`。这样同一份工作区重跑永远得到同一条信息。
 */
export function commitMessage(
  articles: Pick<PlannedArticle, 'slug' | 'change'>[],
  files: Pick<ChangedFile, 'path'>[]
): string {
  if (articles.length > 0) {
    const verb = articles.some((article) => article.change === 'added')
      ? 'publish'
      : articles.some((article) => article.change === 'modified')
        ? 'update'
        : 'remove'
    return `content: ${verb} ${articles.map((article) => article.slug).join(', ')}`
  }
  if (files.every((file) => file.path.startsWith('docs/'))) {
    return 'docs: update publishing docs'
  }
  return `content: update ${files.map((file) => file.path.split('/').pop()).join(', ')}`
}

function articleFor(file: ChangedFile, origin: string): PlannedArticle | undefined {
  for (const [collection, dir] of Object.entries(CONTENT_DIRS)) {
    if (!file.path.startsWith(`${dir}/`)) continue
    const relative = file.path.slice(dir.length + 1)
    const slug = relative.replace(/\.mdx?$/i, '')
    // 只认目录下直接的 markdown 文件；子目录里的附件不算文章。
    if (slug === relative || slug.includes('/')) return undefined
    return {
      collection,
      slug,
      change: articleChange(file.change),
      url: `${origin}/${collection}/${slug}`
    }
  }
  return undefined
}

function articleChange(change: ChangedFile['change']): 'added' | 'modified' | 'deleted' {
  return change === 'deleted' ? 'deleted' : change === 'renamed' ? 'added' : change
}
