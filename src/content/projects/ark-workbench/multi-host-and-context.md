---
title: 多渠道共享大脑与上下文工程
description: 一个 ark serve 进程同时说 MCP 和 OpenAI 兼容协议，五个渠道连的是同一个大脑而不是五份同步状态；2k/4k 双层预算管住上下文，rev/base_rev 管住并发。每条渠道都标了它停在哪一级证据上。
pubDate: 2026-11-23
order: 2
summary: 单进程、五个渠道、两层预算、一个乐观锁
---

「多端」这个词容易骗人。大多数产品的做法是：每端各存一份，然后想办法同步。Ark 的取舍相反——**只跑一个大脑，其余都是客户端**。

理由很直接：同步出来的第二份状态，迟早会和第一份不一致，而「哪份是对的」这个问题没有便宜的答案。所以本机只有一个 `ark serve` 进程，笔记本、桌面宿主、手机 QQ、邮件，全部通过 HTTP 连它。

## 一个进程，两个协议面

<figure class="fig" data-anim>
<svg viewBox="0 0 720 432" role="img" aria-label="ark-obsidian 经 HTTP 连接单进程 ark serve 的 /mcp 与 /v1 两个协议面，ark-agent 仅经 MCP 客户端接口调用 ark-core">
<defs>
<marker id="ah-mh1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1L9 5L0 9z" style="fill:hsl(var(--primary))"/></marker>
</defs>
<g class="rise" style="--at:0s">
<rect class="s-node" x="24" y="14" width="672" height="64" rx="10"/>
<text class="t-ink" x="360" y="41" text-anchor="middle">ark-obsidian · TS 桌面插件</text>
<text class="t-dim" x="360" y="67" text-anchor="middle">聊天 / 历史 / 记忆 / 设置 四面板 + 插件视图</text>
</g>
<g class="rise" style="--at:.25s">
<path class="s-acc draw" pathLength="1" style="--at:.25s" d="M130 78V148" marker-end="url(#ah-mh1)"/>
<path class="s-acc draw" pathLength="1" style="--at:.25s" d="M590 78V148" marker-end="url(#ah-mh1)"/>
<text class="t-dim" x="360" y="99" text-anchor="middle">HTTP · Bearer Token</text>
<rect class="s-dim" x="24" y="112" width="672" height="278" rx="12"/>
<text class="t-acc" x="360" y="138" text-anchor="middle">ark serve · 单进程 127.0.0.1:8650</text>
</g>
<g class="rise" style="--at:.5s">
<rect class="s-node-acc" x="44" y="152" width="290" height="96" rx="10"/>
<text class="t-acc" x="189" y="180" text-anchor="middle">/mcp · 工具协议面</text>
<text class="t-dim" x="189" y="206" text-anchor="middle">Streamable HTTP</text>
<text class="t-dim" x="189" y="232" text-anchor="middle">Core + 插件工具发布</text>
<rect class="s-node" x="386" y="152" width="290" height="96" rx="10"/>
<text class="t-ink" x="531" y="180" text-anchor="middle">/v1 · 会话协议面</text>
<text class="t-dim" x="531" y="206" text-anchor="middle">OpenAI 兼容 SSE</text>
<text class="t-dim" x="531" y="232" text-anchor="middle">动作确认 · 插件接口</text>
</g>
<g class="rise" style="--at:.8s">
<path class="s-acc draw" pathLength="1" style="--at:.8s" d="M189 248V276" marker-end="url(#ah-mh1)"/>
<path class="s-acc draw" pathLength="1" style="--at:.8s" d="M531 248V276" marker-end="url(#ah-mh1)"/>
<rect class="s-node-acc" x="44" y="280" width="290" height="96" rx="10"/>
<text class="t-acc" x="189" y="308" text-anchor="middle">ark-core</text>
<text class="t-dim" x="189" y="334" text-anchor="middle">vault · context</text>
<text class="t-dim" x="189" y="360" text-anchor="middle">memory · history</text>
<rect class="s-node" x="386" y="280" width="290" height="96" rx="10"/>
<text class="t-ink" x="531" y="308" text-anchor="middle">ark-agent</text>
<text class="t-dim" x="531" y="334" text-anchor="middle">回环 · Skill · 调度</text>
<text class="t-dim" x="531" y="360" text-anchor="middle">插件宿主 · 外发确认</text>
<path class="s-acc draw" pathLength="1" style="--at:1.05s" d="M386 328H338" marker-end="url(#ah-mh1)"/>
</g>
<g class="fade" style="--at:1.3s">
<text class="t-dim" x="360" y="418" text-anchor="middle">同进程 ark-agent 也只经 MCP 调 ark-core</text>
</g>
</svg>
<figcaption><span><b>图 1</b>一个常驻进程同时暴露 `/mcp` 与 `/v1` 两个协议面；自带 `ark-agent` 与外部宿主走同一套 MCP 接口，不直接 import 内核模块。</span><button class="replay" type="button">重播</button></figcaption>
</figure>

三条容易被忽略的约束：

- **`ark-agent` 不 import `ark-core` 的内部模块**，只经 MCP 客户端接口调用（同进程时走进程内传输，不经网络）。这样外部宿主能用的工具和自带 Agent 完全一致——**自家 Agent 也没有内部捷径**。
- **扩展是独立子进程**，MCP stdio，只被 Core 连接，宿主不直接连。Core 拉起它们后把工具一并发布到 `/mcp`，调用原样转发。扩展不写 Vault，只返回素材，写由调用方经 Core 完成。
- **只有一个端口、一个 token、一个开机自启项。** 实例锁 `.ark/core.lock` 挡住同机重复启动；HTTP 保留 Host / Origin 校验，防 DNS rebinding。端口只绑本机也照样要 Bearer token——本机其他进程和浏览器页面也能访问 `127.0.0.1`。

<figure class="fig" data-anim>
<svg viewBox="0 0 720 422" role="img" aria-label="只读目录守卫、采集扩展子进程、ark-agent 与多端渠道围绕 ark-core 和 Vault 真源的读写拓扑">
<defs>
<marker id="ah-mh2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1L9 5L0 9z" style="fill:hsl(var(--primary))"/></marker>
<marker id="ah-mh2-dim" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1L9 5L0 9z" style="fill:hsl(var(--muted-foreground))"/></marker>
</defs>
<g class="rise" style="--at:0s">
<rect class="s-node" x="22" y="16" width="316" height="90" rx="10"/>
<text class="t-ink" x="180" y="44" text-anchor="middle">只读目录 raw/</text>
<text class="t-dim" x="180" y="70" text-anchor="middle">路径守卫强制拒写</text>
<text class="t-dim" x="180" y="94" text-anchor="middle">禁改 .git · .ark · .env</text>
<rect class="s-node" x="382" y="16" width="316" height="90" rx="10"/>
<text class="t-ink" x="540" y="44" text-anchor="middle">扩展子进程（stdio）</text>
<text class="t-dim" x="540" y="70" text-anchor="middle">ark-bili · ark-article</text>
<text class="t-dim" x="540" y="94" text-anchor="middle">只返回素材，不写 Vault</text>
</g>
<g class="rise" style="--at:.35s">
<path class="s-dim" d="M180 106V132H320V154" marker-end="url(#ah-mh2-dim)"/>
<path class="s-acc draw" pathLength="1" style="--at:.35s" d="M540 106V132H400V154" marker-end="url(#ah-mh2)"/>
<rect class="s-node" x="22" y="158" width="204" height="96" rx="10"/>
<text class="t-ink" x="124" y="186" text-anchor="middle">ark-agent</text>
<text class="t-dim" x="124" y="212" text-anchor="middle">自家回环</text>
<text class="t-dim" x="124" y="238" text-anchor="middle">经 MCP 调内核</text>
<path class="s-acc draw" pathLength="1" style="--at:.55s" d="M226 206H254" marker-end="url(#ah-mh2)"/>
<rect class="s-node-acc" x="258" y="158" width="204" height="96" rx="10"/>
<text class="t-acc" x="360" y="186" text-anchor="middle">ark-core</text>
<text class="t-dim" x="360" y="212" text-anchor="middle">唯一写入入口</text>
<text class="t-dim" x="360" y="238" text-anchor="middle">/mcp 统一发布</text>
<path class="s-acc draw" pathLength="1" style="--at:.75s" d="M462 206H490" marker-end="url(#ah-mh2)"/>
<rect class="s-node" x="494" y="158" width="204" height="96" rx="10"/>
<text class="t-ink" x="596" y="186" text-anchor="middle">Vault 真源</text>
<text class="t-dim" x="596" y="212" text-anchor="middle">Markdown 笔记</text>
<text class="t-dim" x="596" y="238" text-anchor="middle">+ Git 单快照</text>
</g>
<g class="rise" style="--at:.95s">
<path class="s-acc draw" pathLength="1" style="--at:.95s" d="M360 298V258" marker-end="url(#ah-mh2)"/>
<text class="t-acc" x="374" y="284" text-anchor="start">/mcp</text>
<rect class="s-node" x="22" y="298" width="676" height="110" rx="10"/>
<text class="t-ink" x="360" y="326" text-anchor="middle">外部宿主与多端渠道（共用同一入口）</text>
<text class="t-dim" x="360" y="356" text-anchor="middle">Obsidian · Claude Code · DSH</text>
<text class="t-dim" x="360" y="386" text-anchor="middle">AstrBot(QQ) · 邮件 MCP</text>
</g>
</svg>
<figcaption><span><b>图 2</b>只读目录守卫与采集扩展全部收敛到 `ark-core`；所有宿主只连 `/mcp`，Vault 写入与 Git 快照只走这一处。</span><button class="replay" type="button">重播</button></figcaption>
</figure>

## 五个渠道，三种证据等级

这一节是全篇最需要说清楚的地方：**哪个渠道是真跑过的，哪个只是按标准协议接进去的。**

设计文档里有两列：一列记「接入方式」，一列记「验收状态」。前者是照官方资料核对出来的方向，后者必须是实机跑过才能填。混着写，就是给面试官递刀。

### 已完成实机 / 自动验收

这四条渠道能拿出具体版本、具体机制与真机验证步骤：

| 渠道 | 状态 | 证据 |
| --- | --- | --- |
| **Claude Code** | 已支持（MCP 接入） | 2026-11-01，Claude 桌面端 Code 标签，Claude Code 2.1.304 + Opus 5.5，经 `mcp-remote` 0.15.2 桥接 stdio，用户级 `ask` Skill，四步通过：提问、引用、写笔记、撤销 |
| **DSH** | 已支持（MCP 接入） | 2026-11-01，桌面应用 44.7.0 内置 dsh（DSH 0.1.0-rc.7）、模型 `mx/deepseek-flash`，经 `desktop` profile 的补丁层，同样四步通过 |
| **Obsidian 面板** | 已人工验收 | 2026-11-16，8 步全过：总结当前笔记后不满意就撤销、一轮对话的多次写入只产生一个快照、记忆面板确认与驳回推断、调用不在免确认名单里的工具时出现确认卡且拒绝后不执行 |
| **手机 QQ（经 AstrBot）** | 已实机验收 | AstrBot 用 `streamable_http` 连接 Core 的 `/mcp`（`Authorization: Bearer <ARK_TOKEN>`），无需另起 stdio 进程，人格提示词由共用的 `SKILL.md` 正文拼接生成；已完成真实 QQ 私聊共享 `Collect` 链接采集与 `Tasks` 任务查询/创建/拆分闭环验收 |

再加一条自动化验收：调度器 + 插件宿主 + 任务看板，2026-11-18 由一条真实 `ark serve` 的场景用例跑通「创建 → 看板编辑 → 到点提醒 → 停服补发 → 外部 MCP 查询 → 停用回归」，全仓 658 例同时运行。

有两件事同一批验收里**没有**做，照实记：真实 Obsidian 里的在线提醒与拖动没人工走过；真实模型的规划与拆分没人工走过。

还有一个已经跳过、不打算补的：Codex 因为没有环境，示例保留但不标「已支持」。

### 标准 MCP 协议扩展接入（未实机验收）

下面这条邮件渠道走的是**同一套标准机制**，机制本身是稳的，但**尚未在真实邮件服务上跑完验收**，所以只写接入方式与动作拦截边界，不写「通过」：

| 渠道 | 接入方式（已按官方/源码核对） | 边界 | 证据等级 |
| --- | --- | --- | --- |
| **邮件（经腾讯 AgentMail MCP）** | 设计里对邮件只有一条原则：**优先选用现成的 IMAP/SMTP MCP server**，接入前先看来源和它要的权限；腾讯 AgentMail 属于这条路径 | 收信作为采集来源（只返回素材）；发信是外部写动作，属五条硬约束第 3 条，执行前必须确认，拒绝也回填给模型 | 仓库内**没有**针对 AgentMail 的专门实机验收记录，属标准 MCP 扩展接入方向 |

**为什么这条边界要写这么啰嗦。** 把「照协议接得进去」和「在真机上跑通过」混为一谈，是最容易被一轮追问打穿的地方——问一句「这路外发邮件在哪个客户端验过、验收记录在哪」就露底。反过来，把已真机跑通的四条（Obsidian / Claude Code / DSH / AstrBot QQ）和仍在协议扩展层的邮件分开写，被追问时句句有据。

## 上下文：两层预算，不是一个大窗口

有上下文窗口不等于会用上下文。Ark 把上下文分两层，两层各有默认预算，**数字是估算**：每个中日韩字符算 1 token，其余字符每 4 个算 1 token。

| 层 | 装什么 | 何时进入 | 默认预算 |
| --- | --- | --- | --- |
| 常驻层 | `confirmed` 的偏好 + 当前话题的 Live State + 已启用插件的 `context.md` | 会话开始时 `resume` | **2k token** |
| 按需层 | 其余记忆（含 `inferred`）+ Vault 笔记 | 每轮按需 `recall` / `search` | **4k token** |

四条规则决定它能不能撑住：

- **`inferred` 永远不进常驻层。** 模型的猜测不能靠「反正预算还有空」混进每轮对话。
- **插件上下文不提高预算。** 插件写的 `context.md`（比如今天的待办）用记忆与断点装配后的**剩余**额度装入，按启用顺序截断，截断时在 `truncated` 里说明。停用插件就不再注入，它的数据仍能当普通笔记检索。
- **超出预算先截记忆，再截断点**，并且明说截了什么——静默截断会让人以为「模型忘了」是模型的问题。
- **按需层的记忆与笔记各占一半预算**，一边用不满就让给另一边。结果里始终保留来源（记忆 id 或笔记路径）和确认状态。

Live State 是常驻层里最贵的那块，所以它被设计成一个短文件而不是聊天记录：

```markdown
---
thread: ark-v2-design
title: Ark v2 设计
status: active          # active | parked | done
updated: 2026-10-28T15:10:00+08:00
updated_by: obsidian
---
## 当前假设
- loop 放在 ark-agent，核心只暴露 MCP

## 未决问题
- 中文短查询要不要加 jieba

## 待定决策
- 常驻层预算定多少

## 下一步
- 写 M0：vault + history

## 已确认
- 同一知识库采用单个常驻 HTTP Core，本机和远程宿主都连接它。
```

`parked` 和 `done` 的线程不进常驻层。断点属于**话题**，不属于宿主或聊天窗口——这正是「换宿主、换设备还能接着想」的实现方式。

## 并发：过期写入永远不覆盖

一个大脑、多个客户端，就要回答「两个人同时保存怎么办」。

`rev` 是线程文件内容的 SHA-256 前 16 位。`resume` 返回当前 `rev`；保存时 `checkpoint` 带回 `base_rev`。如果线程已存在而 `base_rev` 缺失或与当前 `rev` 不一致，就是一次过期更新：

1. **不覆盖。** 当前断点原样留在原处，用过期的旧内容覆盖先保存的内容是最坏的结果。
2. **留存待合并。** 过期更新写到 `ark/threads/<slug>.pending/<YYYYmmdd-HHMMSS>-<host>.md`，frontmatter 记 `thread`、`host`、`base_rev`、`created`，正文就是它带来的那几段。文件和断点一样进 Git，所以它也可撤销。
3. **返回可区分。** `checkpoint` 的返回里 `status` 是 `saved` 或 `pending`（带 `pending_id`），调用方一眼能看出来这次是存上了还是排进了队列。
4. **合并是人做的。** 宿主用当前 `rev`、合并后的段落和 `resolves`（已合并的待合并 id）再调一次 `checkpoint`，断点写回与待合并文件删除在**同一个快照**里完成。如果这时 `base_rev` 又过期了，`resolves` 被忽略，这次更新本身变成新的待合并更新。
5. **合并完成前继续用旧断点。** 模型不自行裁决两条矛盾结论，它只能等着人来选。

比较发生在写锁内，所以「同时保存」不会出现两个都算成功。撤销一次 `checkpoint` 会改变线程的 `rev`，旧 `rev` 随即过期——所以宿主撤销之后必须重新 `resume`，这条很容易忘，忘了就会把自己下一次保存变成待合并。

## 这套拓扑的边界

- **只有一台机器跑大脑。** 笔记可以自己同步，但同步配置要排除 `.git/` 和 `.ark/`。主机离线时，其他设备仍能看已有笔记，但接续、记忆和 Ark 写入都要等主机恢复。
- **不做设备间状态同步。** 这是选择，不是缺失：多一份状态就多一套对账。
- **不承诺跨宿主的预算。** Ark 只约束自己发起的模型调用（回环、抽取、插件 `ctx.llm`），Claude Code 和 DSH 自己的调用记在它们账上。
- **Obsidian 移动端不适配。** 多端先覆盖不同 Agent、QQ 和邮件；手机里看笔记用 Obsidian 自己的同步就够。
