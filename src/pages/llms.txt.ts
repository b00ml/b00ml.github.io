import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import { buildLlmsTxt } from '@/lib/llms/document'

/**
 * `/llms.txt` — the same idea as `robots.txt`, aimed at an assistant rather than
 * a crawler: one plain-text file that says who the author is and which systems,
 * numbers and essays are worth reading.
 *
 * Prerendered at build time, so the file is a static artefact and nothing here
 * runs on a server.
 */
export const prerender = true

export const GET: APIRoute = async ({ site }) => {
  const [projects, blog, product] = await Promise.all([
    getCollection('projects'),
    getCollection('blog'),
    getCollection('product')
  ])

  const body = buildLlmsTxt({
    siteUrl: (site ?? new URL(import.meta.env.SITE)).origin,
    projects,
    blog,
    product,
    isProd: import.meta.env.PROD
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  })
}
