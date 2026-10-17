// publish 命令的入口。运行时选 node，和仓库唯一的脚本约定保持一致：`node scripts/*.mjs`
// （见 package.json 的 build → scripts/clean-content-cache.mjs）。
// 业务逻辑全在 src/lib/publish/ 的 TypeScript 里：那边 bun test 能发现、astro check 会类型检查。
// node 24 能直接 import .ts（类型擦除），所以这里只负责装配真实依赖和退出码，不含逻辑。
// 从仓库根运行：bun run publish [--apply]
import { main } from '../src/lib/publish/runtime.ts'

process.exitCode = await main(process.argv.slice(2))
