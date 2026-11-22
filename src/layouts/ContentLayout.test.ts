import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const ROOT = join(import.meta.dir, '../..')

function readRepoFile(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8')
}

function collectAstroFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...collectAstroFiles(full))
    } else if (entry.endsWith('.astro')) {
      results.push(full)
    }
  }
  return results
}

describe('detail TOC wiring across collections and layouts', () => {
  const detailConsumers = [
    'src/pages/product/[...id].astro',
    'src/pages/notes/[...id].astro',
    'src/pages/projects/[...id].astro',
    'src/layouts/BlogPost.astro',
    'src/layouts/CommonPage.astro'
  ] as const

  test('product detail extracts headings from render(entry) and mounts TableOfContents in sidebar slot', () => {
    const productPage = readRepoFile('src/pages/product/[...id].astro')
    expect(productPage).toMatch(
      /const\s*\{\s*Content\s*,\s*headings\s*\}\s*=\s*await\s+render\(entry\)/
    )
    expect(productPage).toContain('TableOfContents')
    expect(productPage).toMatch(
      /<TableOfContents\s+headings=\{tocHeadings\}\s+slot=['"]sidebar['"]\s*\/>/
    )
  })

  test('all detail routes and layouts filter headings via filterTocHeadings (depth 2–3) before mounting TOC', () => {
    for (const relPath of detailConsumers) {
      const src = readRepoFile(relPath)
      expect(src).toContain('filterTocHeadings')
      expect(src).toMatch(/const\s+tocHeadings\s*=\s*filterTocHeadings\(headings\)/)
      expect(src).toMatch(/!!tocHeadings\.length\s*&&/)
      expect(src).not.toMatch(/depth\s*<=\s*3(?!\s*&&)/)
    }
  })
})

describe('ContentLayout empty-sidebar structural suppression', () => {
  test('uses rendered slot output (.render + .trim) rather than Astro.slots.has', () => {
    const layout = readRepoFile('src/layouts/ContentLayout.astro')
    expect(layout).not.toContain('Astro.slots.has(')
    expect(layout).toMatch(/await\s+Astro\.slots\.render\(['"]sidebar['"]\)/)
    expect(layout).toMatch(/await\s+Astro\.slots\.render\(['"]bottom-sidebar['"]\)/)
    expect(layout).toContain('.trim()')
  })

  test('gates #sidebar, #sidebar-shade, #sidebar-btn, and .bottom basis-60 spacer on non-empty sidebar state while keeping live <slot /> elements', () => {
    const layout = readRepoFile('src/layouts/ContentLayout.astro')

    // Live <slot> must remain inside the conditional branch so Astro hoists child <script>/<style>
    expect(layout).toMatch(
      /hasSidebar\s*&&[\s\S]*?<aside[\s\S]*?id=['"]sidebar['"][\s\S]*?<slot\s+name=['"]sidebar['"]\s*\/>[\s\S]*?id=['"]sidebar-shade['"]/
    )
    expect(layout).toMatch(
      /\(hasSidebar\s*\|\|\s*hasBottomSidebar\)\s*&&[\s\S]*?basis-60[\s\S]*?<slot\s+name=['"]bottom-sidebar['"]\s*\/>/
    )
    expect(layout).toMatch(/hasSidebar\s*&&[\s\S]*?id=['"]sidebar-btn['"]/)
  })
})

describe('MediumZoom single-mount contract across detail collections', () => {
  test('mounts MediumZoom inside ContentLayout PageLayout body after #content', () => {
    const layout = readRepoFile('src/layouts/ContentLayout.astro')
    expect(layout).toContain("import MediumZoom from '@/components/MediumZoom.astro'")
    expect(layout).toMatch(
      /id=['"]content['"][\s\S]*?\{integ\.mediumZoom\.enable\s*&&\s*<MediumZoom\s*\/>\}[\s\S]*?<\/PageLayout>/
    )
  })

  test('all four detail collections inherit ContentLayout and no other .astro file mounts <MediumZoom />', () => {
    const detailTemplates = [
      'src/layouts/BlogPost.astro',
      'src/pages/notes/[...id].astro',
      'src/pages/product/[...id].astro',
      'src/pages/projects/[...id].astro'
    ]

    for (const relPath of detailTemplates) {
      const src = readRepoFile(relPath)
      expect(src).toContain("from '@/layouts/ContentLayout.astro'")
      expect(src).not.toContain('MediumZoom')
    }

    const mountingFiles = collectAstroFiles(join(ROOT, 'src'))
      .filter((file) => /<MediumZoom\b/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(ROOT.length + 1).replace(/\\/g, '/'))

    expect(mountingFiles).toEqual(['src/layouts/ContentLayout.astro'])
  })
})
