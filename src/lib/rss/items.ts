/** Same visibility rule as `getBlogCollection`: drafts stay in dev and drop in production. */
export function includeInRss(draft: boolean | undefined, prod: boolean) {
  return prod ? !draft : true
}

export type RssPost = {
  id: string
  data: {
    draft?: boolean
    title: string
    description?: string
    pubDate: Date
    updatedDate?: Date
  }
}

export type RssItemFields = {
  title: string
  description?: string
  pubDate: Date
  link: string
}

/** Feed order follows `pubDate`, newest first. Drafts follow `includeInRss`. */
export function publishedPosts<P extends RssPost>(posts: readonly P[], prod: boolean): P[] {
  return posts
    .filter((entry) => includeInRss(entry.data.draft, prod))
    .slice()
    .sort((a, b) => +new Date(b.data.pubDate) - +new Date(a.data.pubDate))
}

/** Title, description and date come from frontmatter; the link is always `/blog/<id>`. */
export function rssItemFields(item: RssPost): RssItemFields {
  const { title, description, pubDate } = item.data
  return {
    title,
    pubDate,
    link: `/blog/${item.id}`,
    ...(description ? { description } : {})
  }
}
