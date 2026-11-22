import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseFrontmatter } from '@astrojs/markdown-remark'

import type { ArticleEntryInput } from '../curation/home'
import type { ProjectEntryInput, ProjectLink } from '../projects/cards'
import type { ProjectStatus } from '../projects/status'
import { readFrontmatter } from './entries'

function collectMarkdownFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...collectMarkdownFiles(full))
    } else if (/\.mdx?$/i.test(name)) {
      out.push(full)
    }
  }
  return out
}

function entryIdFromPath(root: string, filePath: string): string {
  return relative(root, filePath)
    .replace(/\\/g, '/')
    .replace(/\.mdx?$/i, '')
}

function readArticleBody(filePath: string): string {
  const raw = readFileSync(filePath, 'utf8')
  try {
    return parseFrontmatter(raw).content
  } catch {
    return ''
  }
}

export function loadArticleCollection(dirPath: string): ArticleEntryInput[] {
  const root = resolve(dirPath)
  return collectMarkdownFiles(root).map((filePath) => {
    const fm = readFrontmatter(filePath)
    return {
      id: entryIdFromPath(root, filePath),
      body: readArticleBody(filePath),
      data: {
        title: String(fm.title ?? ''),
        description: String(fm.description ?? ''),
        pubDate: fm.pubDate instanceof Date ? fm.pubDate : new Date(String(fm.pubDate)),
        tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
        draft: Boolean(fm.draft ?? false),
        featured: Boolean(fm.featured ?? false),
        featuredOrder: typeof fm.featuredOrder === 'number' ? fm.featuredOrder : undefined,
        hideFromHome: Boolean(fm.hideFromHome ?? false)
      }
    }
  })
}

export function loadProjectCollection(dirPath: string): ProjectEntryInput[] {
  const root = resolve(dirPath)
  return collectMarkdownFiles(root).map((filePath) => {
    const fm = readFrontmatter(filePath)
    return {
      id: entryIdFromPath(root, filePath),
      data: {
        title: String(fm.title ?? ''),
        description: String(fm.description ?? ''),
        pubDate: fm.pubDate instanceof Date ? fm.pubDate : new Date(String(fm.pubDate)),
        draft: Boolean(fm.draft ?? false),
        featured: Boolean(fm.featured ?? false),
        status: fm.status as ProjectStatus | undefined,
        role: typeof fm.role === 'string' ? fm.role : undefined,
        period: typeof fm.period === 'string' ? fm.period : undefined,
        stack: Array.isArray(fm.stack) ? fm.stack.map(String) : [],
        order: typeof fm.order === 'number' ? fm.order : 0,
        summary: typeof fm.summary === 'string' ? fm.summary : undefined,
        highlights: Array.isArray(fm.highlights) ? fm.highlights.map(String) : [],
        links: Array.isArray(fm.links) ? (fm.links as ProjectLink[]) : []
      }
    }
  })
}
