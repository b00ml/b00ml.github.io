import type { AstroIntegration } from 'astro'
import { rehypeHeadingIds } from '@astrojs/markdown-remark'
import sitemap from '@astrojs/sitemap'
import AstroPureIntegration from 'astro-pure'
import { defineConfig } from 'astro/config'
import rehypeKatex from 'rehype-katex'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkMath from 'remark-math'

// Local rehype & remark plugins
import { sitemapLastModified } from './src/lib/seo/sitemap.ts'
import rehypeAutolinkHeadings from './src/plugins/rehype-auto-link-headings.ts'
import remarkReadingTime from './src/plugins/remark-reading-time.ts'
// Shiki
import {
  addCopyButton,
  addLanguage,
  addTitle,
  transformerNotationDiff,
  transformerNotationHighlight,
  updateStyle
} from './src/plugins/shiki-transformers.ts'
import config from './src/site.config.ts'

const excludedSitemapPathPatterns = [/^\/search\/?$/]

const shouldIncludeInSitemap = (page: string) => {
  const { pathname } = new URL(page)
  return !excludedSitemapPathPatterns.some((pattern) => pattern.test(pathname))
}

// astro-pure registers its own reading-time remark plugin first; this one has to
// run afterwards so the local estimate wins.
const readingTime = (): AstroIntegration => ({
  name: 'reading-time',
  hooks: {
    'astro:config:setup': ({ updateConfig }) => {
      updateConfig({
        markdown: {
          remarkPlugins: [remarkReadingTime]
        }
      })
    }
  }
})

// https://astro.build/config
export default defineConfig({
  // Top-Level Options
  site: 'https://peik1.example.com',
  trailingSlash: 'never',

  output: 'static',

  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp'
    }
  },

  integrations: [
    sitemap({
      filter: shouldIncludeInSitemap,
      // Articles get a `lastmod` from frontmatter + git history. Pages without
      // a derivable source date stay undated — see `sitemapLastModified`.
      serialize: (item) => {
        const lastmod = sitemapLastModified(new URL(item.url).pathname)
        return lastmod ? { ...item, lastmod } : item
      }
    }),
    // astro-pure will automatically add sitemap, mdx & unocss
    AstroPureIntegration(config),
    readingTime()
  ],

  // Prefetch Options
  prefetch: true,
  // Server Options
  server: {
    host: true
  },
  // Markdown Options
  markdown: {
    // remark-cjk-friendly：修复 **加粗** 紧贴全角标点时不渲染的 CommonMark flanking 问题
    remarkPlugins: [remarkMath, remarkCjkFriendly],
    rehypePlugins: [
      [rehypeKatex, {}],
      rehypeHeadingIds,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'append',
          properties: { className: ['anchor'] },
          content: { type: 'text', value: '#' }
        }
      ]
    ],
    // https://docs.astro.build/en/guides/syntax-highlighting/
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark'
      },
      transformers: [
        transformerNotationDiff(),
        transformerNotationHighlight(),
        updateStyle(),
        addTitle(),
        addLanguage(),
        addCopyButton(2000)
      ]
    }
  },
  experimental: {
    contentIntellisense: true
  }
})
