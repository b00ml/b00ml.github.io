import { rmSync } from 'node:fs'

// Astro 5 的内容层把集合条目缓存在 node_modules/.astro/data-store.json。
// 源文件删掉后缓存里的条目不会自动清除 —— 结果是「文件已经不在 src/content，
// 但每次构建仍然生成一个真页面」，不报错也不警告，只有部署后才可能被搜索引擎发现。
// node_modules/.astro/assets/ 同理，会在源图删除后继续留着旧的衍生图。
// 构建前清空，强制 glob loader 从磁盘重读一遍。
rmSync('.astro', { recursive: true, force: true })
rmSync('node_modules/.astro', { recursive: true, force: true })
