import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import config from './site.config'

const SITE_NAME = 'peik1'
const FORMER_SITE_NAME = ['Joye', 'Personal', 'Blog'].join(' ')
const ROOT = join(import.meta.dir, '..')

function textFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.astro') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      out.push(...textFiles(path))
      continue
    }
    if (/\.(astro|css|html|json|md|mdx|ts|tsx|txt|webmanifest|xml)$/.test(entry)) out.push(path)
  }
  return out
}

describe('site name', () => {
  test('config title is peik1 for nav, titles, meta, and RSS', () => {
    expect(config.title).toBe(SITE_NAME)

    const rss = readFileSync(join(import.meta.dir, 'pages/rss.xml.ts'), 'utf8')
    expect(rss).toContain('title: config.title,')
  })

  test('nav brand stays on one line', () => {
    const header = readFileSync(join(import.meta.dir, 'components/Header.astro'), 'utf8')
    expect(header).toContain('whitespace-nowrap')
    expect(header).toContain('{config.title}')
  })

  test('the former site name is gone from source and static pages', () => {
    const paths = [
      ...textFiles(join(ROOT, 'src')),
      ...textFiles(join(ROOT, 'public')),
      join(ROOT, 'DESIGN.md')
    ]
    const hits = paths.filter((path) => readFileSync(path, 'utf8').includes(FORMER_SITE_NAME))
    expect(hits).toEqual([])
  })
})
