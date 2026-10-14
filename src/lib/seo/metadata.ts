/** SEO-only copy. Visible headings and article metadata remain owned by their pages. */
const sections: Record<string, [string, string]> = {
  '/': [
    '首页',
    'peik1 的个人博客：记录 AI Agent、软件工程与学习实践，汇集产品思考、技术文章、笔记和项目。'
  ],
  '/about': ['关于我', '了解 peik1：个人介绍、学习与开发经历，以及日常使用的工具。'],
  '/projects': ['项目', 'peik1 的开源项目、参与开发的产品和学习实践。'],
  '/product': ['产品', '产品拆解、需求分析与设计取舍的记录。'],
  '/tags': ['博客标签', '按主题浏览博客文章，从标签进入相关技术实践、原理解析与学习记录。'],
  '/notes/tags': ['笔记标签', '按标签查找学习笔记、代码片段、研究记录与尚在完善的想法。']
}

export function sectionMetadata(pathname: string) {
  const bare = pathname.replace(/\/$/, '') || '/'
  const copy = sections[bare]
  return copy ? { title: copy[0], description: copy[1] } : undefined
}

export function listingMetadata(
  kind: 'blog' | 'notes' | 'product',
  page: number,
  titles: string[],
  tag?: string | number
) {
  const name = { blog: '博客', notes: '笔记', product: '产品' }[kind]
  const subject = tag ? `${name} · ${tag} 标签` : name
  const suffix = `第 ${page} 页`
  const examples = titles.slice(0, 3).join('；')
  return {
    title: `${subject} · ${suffix}`,
    description: `${subject}，第 ${page} 页。${examples ? `本页收录：${examples}。` : '浏览已发布的记录。'}`
  }
}
