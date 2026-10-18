import { defineCollection, z, type SchemaContext } from 'astro:content'
import { glob } from 'astro/loaders'

function removeDupsAndLowerCase(array: string[]) {
  if (!array.length) return array
  const lowercaseItems = array.map((str) => str.toLowerCase())
  const distinctItems = new Set(lowercaseItems)
  return Array.from(distinctItems)
}

// `blog`, `notes` and `product` differ only in what they are for — complete
// long-form posts, short quick records, and product thinking — so they share
// one frontmatter schema and one set of listing/detail pages.
const entrySchema = ({ image }: SchemaContext) =>
  z.object({
    // Required
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    // Optional
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]).transform(removeDupsAndLowerCase),
    draft: z.boolean().default(false),
    cover: z
      .object({
        src: image(),
        alt: z.string().optional()
      })
      .optional()
  })

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: entrySchema
})

const notes = defineCollection({
  loader: glob({ base: './src/content/notes', pattern: '**/*.{md,mdx}' }),
  schema: entrySchema
})

const product = defineCollection({
  loader: glob({ base: './src/content/product', pattern: '**/*.{md,mdx}' }),
  schema: entrySchema
})

// Projects are artefacts rather than posts: each entry is one thing that was
// built, so on top of the shared entry fields it records the state it is in and
// whether there is anything a reader can go and check.
const projectSchema = ({ image }: SchemaContext) =>
  entrySchema({ image }).extend({
    status: z.enum(['ongoing', 'shipped', 'paused', 'oss']),
    role: z.string().optional(),
    period: z.string().optional(),
    stack: z.array(z.string()).default([]),
    links: z
      .array(z.object({ label: z.string(), href: z.string().url() }))
      .default([])
  })

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
  schema: projectSchema
})

export const collections = { blog, notes, product, projects }
