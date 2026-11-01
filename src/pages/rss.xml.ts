import { posix } from 'node:path'
import type { AstroGlobal, ImageMetadata } from 'astro'
import { getImage } from 'astro:assets'
import { getCollection } from 'astro:content'
import rss from '@astrojs/rss'
import { publishedPosts, rssItemFields } from '@/lib/rss/items'
import type { Root } from 'mdast'
import rehypeStringify from 'rehype-stringify'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import config from 'virtual:config'

export const prerender = true

// Images inside a post are written as paths relative to that post, but they can
// live either beside it or in `src/assets/` — the latter is this repo's own
// convention. RSS needs absolute URLs, so every candidate location has to be
// resolvable here; globbing only the blog directory made any post whose image
// lived elsewhere fail the build with `Unable to resolve RSS image`.
const imagesGlob = import.meta.glob<{ default: ImageMetadata }>([
  '/src/content/**/*.{jpeg,jpg,png,gif,webp,avif,svg}',
  '/src/assets/**/*.{jpeg,jpg,png,gif,webp,avif,svg}'
])

function remarkDropMdxImports() {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (node.type !== 'mdxjsEsm' || !parent || typeof index !== 'number') return
      parent.children.splice(index, 1)
      return index
    })
  }
}

// Post bodies use raw JSX elements (essay figures, callouts, tables). Plain
// remark-rehype has no handler for `mdxJsx*` nodes: it drops their attributes
// and renders them as bare `<div>`s, so feed readers lose the essay styling.
// Translate JSX elements into regular hast elements, attributes included.
type MdastJsxNode = {
  type: 'mdxJsxFlowElement' | 'mdxJsxTextElement'
  name?: string
  attributes?: { type: string; name: string; value?: unknown }[]
  children?: unknown[]
}

function mdxJsxToHast(state: any, node: MdastJsxNode) {
  const properties: Record<string, string> = {}
  for (const attr of node.attributes ?? []) {
    if (attr.type === 'mdxJsxAttribute' && typeof attr.value === 'string') {
      properties[attr.name] = attr.value
    }
  }
  return {
    type: 'element',
    tagName: node.name || 'div',
    properties,
    children: state.all(node)
  }
}

const renderContent = async (
  post: { id: string; body?: string; filePath?: string },
  site: URL
) => {
  // Replace image links with the correct path
  function remarkReplaceImageLink() {
    /**
     * @param {Root} tree
     */
    return async function (tree: Root) {
      const promises: Promise<void>[] = []
      visit(tree, 'image', (node) => {
        if (/^[a-z][a-z\d+.-]*:/i.test(node.url)) return
        if (node.url.startsWith('/')) {
          node.url = new URL(node.url, site).href
          return
        }

        const filePath = post.filePath?.replaceAll('\\', '/')
        if (!filePath) throw new Error(`Missing source path for RSS entry: ${post.id}`)

        const imageKey = `/${posix.normalize(posix.join(posix.dirname(filePath), node.url))}`
        const loadImage = imagesGlob[imageKey]
        if (!loadImage) throw new Error(`Unable to resolve RSS image: ${imageKey}`)

        promises.push(
          loadImage().then(async ({ default: imagePath }) => {
            const optimized = await getImage({ src: imagePath })
            node.url = new URL(optimized.src, site).href
          })
        )
      })
      await Promise.all(promises)
    }
  }

  const processor = unified().use(remarkParse).use(remarkMdx).use(remarkDropMdxImports)
  const file = await processor
    .use(remarkCjkFriendly)
    .use(remarkReplaceImageLink)
    .use(remarkRehype, {
      handlers: {
        mdxJsxFlowElement: mdxJsxToHast,
        mdxJsxTextElement: mdxJsxToHast
      }
    })
    .use(rehypeStringify)
    .process(post.body ?? '')

  return String(file)
}

const GET = async (context: AstroGlobal) => {
  const posts = publishedPosts(await getCollection('blog'), import.meta.env.PROD)
  const siteUrl = context.site ?? new URL(import.meta.env.SITE)

  return rss({
    // Basic configs
    trailingSlash: false,
    xmlns: { h: 'http://www.w3.org/TR/html4/' },
    stylesheet: '/scripts/pretty-feed-v3.xsl',

    // Contents
    title: config.title,
    description: config.description,
    site: import.meta.env.SITE,
    items: await Promise.all(
      posts.map(async (post) => ({
        ...rssItemFields(post),
        content: await renderContent(post, siteUrl)
      }))
    )
  })
}

export { GET }
