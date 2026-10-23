# 财务 Agent 独立演示工作台

本目录复用启衡精密 POC 的 Vue 界面，在博客中构建为独立静态子应用。
入口为 `/projects/finance-review-agent/demo/`，内部使用 `#/m2`、`#/m2/:claimId`、
`#/m3`、`#/m4`、`#/settings`，无需静态托管路由回退。

## 运行

在博客根目录使用 Bun 1.3.10：

```sh
bun install --frozen-lockfile
bun install --cwd apps/finance-demo --frozen-lockfile
bun run build
python -m http.server 4323 --bind 127.0.0.1 --directory dist
```

`bun run demo:dev` 可单独开发子应用；完整博客入口请用构建预览。
构建预览从 `http://127.0.0.1:4323/projects/` 进入，Python 只负责提供静态文件。
Astro 自身的 preview 会按博客的无末尾斜杠约定处理路径，Demo 使用目录入口，
因此这里用静态目录服务器预览与 Pages 一致的文件布局。
根构建保留 Astro 内容缓存清理，先构建博客，再写入 Demo 子目录。
Vite 只清空自己的输出目录，不清空博客 dist。

## 数据与边界

- 6 张报销单、6 张发票、3 笔银行流水来自 POC 合成 fixture。
- 批量机器建议：4 REJECT、2 FLAG；没有 APPROVE 样例。
- M2 列表可进入「10 元交通费」「36 元打车缺票」案例；详情的「Agent 查证过程」按
  发现疑问 → 查证经过 → 核验证据 → 交给人工四步展开，并说明本例结论和人工下一步。
  Skill、5 个只读工具、原始参数/返回、引用校验和预算降级收在默认折叠的工程细节中。
  记录与校验结果均为合成预设；浏览器不执行 LangGraph、工具或大模型。
- M3 展示重复发票、票面问题、补充合成供应商画像和预设 AI 意见。
- M4 展示 1 笔匹配、1 笔未识别、1 笔借方跳过，参与匹配的收款匹配率 50%。
- OCR 转录、票据 SVG、AI/调查结果和应收记录是标明用途的补充合成材料。
- `src/api/index.ts` 是固定本地 get/post/put 边界，无网络传输或网络回退。
- 所有修改保存在内存，导航保留，刷新重置；人工记录与机器建议分开，ERP 始终 PENDING。
- 保存 OCR 仅演示校对过程，不重算预设机器结论；无附件的费用行无 OCR 可编辑。
- 设置只影响后续模拟；不能填写真实地址/密钥，不使用浏览器持久存储。

## 验证与手动验收

```sh
bun run check
bun test src/
bun run demo:test
bun run build
```

根测试命令也会发现子应用 `src/demo/session.test.ts` 的 4 个行为场景，
通过与 Vue 相同的本地接口验证审核/筛选/人工记录、OCR 校对、设置/AI、银行对账和非法操作。
构建验证 Vue 模板与静态资源路径；新 TypeScript 数据适配已单独通过严格类型检查。
界面交互与桌面、手机布局已做定向浏览器检查，用户已在本地预览完成体验验收。

建议从 `/projects` 进入：全选并模拟审核 → 查看 DEMO-0002 字段差异 → 保存校对 →
记录人工决定 → 查看 DEMO-0005 缺附件 → M3 扫描/预设复核/异常详情 → M4 模拟对账 →
设置关闭 AI 后重新审核 → 刷新确认所有状态重置。

复用原 Element Plus 整体入口及图标注册，构建目前有主 chunk 超过 500 kB 的体积提示；
各业务页仍按路由懒加载。

## 来源与维护

源仓库：https://github.com/b00ml/AI-financialAgent-POC

本次复制基线为 `55599517d7bd821264090a59b6866a179151bcab`；复制时包含已列明的
本地前端修改，详见 `source-snapshot.json` 的覆盖清单和适配前 SHA-256。
源代码的 MIT 许可保存在本目录 `LICENSE`。
本目录是博客持有的静态展示副本，后续同步需人工比较，不能覆盖 POC 工作目录。

实现取舍：保留用户确认的原 Vue 页面、样式及依赖；在单一数据边界替换服务，
不增加 mock 服务、通用演示框架、浏览器存储或自动同步机制。
本次检查覆盖新适配层、状态、路由、应用壳和各页改动；复制保留的其余旧样式和组件
未逐行重新审计，不将它们标记为已完成全面代码审查。
