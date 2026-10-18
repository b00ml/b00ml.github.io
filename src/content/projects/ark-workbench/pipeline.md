---
title: 从一条链接到一条可引用的记录
description: B 站字幕三层降级、文章五段、邮件一封只入队一条链接，写入只走一条受控路径，派生页不冒充真源。
pubDate: 2026-10-18
order: 1
summary: 摄入与编译
---

内容从三个地方进来：B 站链接、公众号文章、Agent Mail 里的链接。落盘规则是同一条，中间的处理链不是一条。

## 一条字幕要过三层降级

B 站那条的顺序是：缓存命中、B 站 API 字幕、yt-dlp 字幕、Whisper 转写。前一层失败或被判定不可用，才落到下一层。

「不可用」有具体定义。AI 字幕就算 HTTP 200 返回了，也要过 `validate_subtitle(title, transcript, duration)` 的内容匹配：正文为空、跟视频时长对不上，都算不合格，继续降级。HTTP 200 只证明网络通了。

缓存命中会跳过后面的三层，但仍然读一次元信息，生成 `meta_<bvid>.json`。所以缓存是性能路径，不是内容正确性的再证明。

运行时打状态标签：`[PARSING]`、`[SUBTITLE]`、`[TRANSCRIBING]`、`[VISUAL]`、`[CACHE]`、`[DONE]`。三层全挂，入口打印检查项后退出——得能看出是 Cookie、yt-dlp、ffmpeg、音频还是内容校验的问题。这些不能合并成一句「处理失败」。

视觉是可选增强：视觉依赖缺失或视觉模型失败时，已经生成的字幕保留。视觉那一段出问题，抹不掉纯文本结果。

## 文章和邮件是两条不同的链

文章总结分五段：抓正文、解析正文、结构化合同校验、调模型、受控写入。五段的失败分开记：抓取失败、正文为空、模型超时、JSON 缺字段、CAS 冲突，处理方式完全不一样。

邮件那头更薄。`inbox_poll.py` 只做接收，不调用 LLM：拉消息、清 HTML、提 URL、按域名白名单分类、归一化后算 fingerprint、写 SQLite。

两个细节是后来补的。一封邮件只取第一个白名单 URL，多出来的不猜；没有白名单 URL 的邮件也标记已处理，否则每次轮询都重新扫一遍。去重同时靠 `inbox_task.dedupe_key` 的 UNIQUE 约束和 `inbox_seen.marker`——应用层「查到没有」不算数。

非 dry-run 的收件可以先记一条 `inbox_operation`：`begin_collection(before_hash)`、读外部邮件、入队、`complete_collection(after_hash)`。那个 hash 是队列快照摘要，它回答的是「这一次收件变了多少」。

## 写入只留一条路

Vault 写入的守卫是几条很硬的规则：目标路径必须落在 Vault 根目录内；`raw/`、`templates/`、`.obsidian/`、`.git/` 一律拒写；`raw/screenshots/` 是历史布局留下的截图白名单，标记 `raw_whitelist_exempt`，不能推广成普通 raw 写权限。

写入用临时文件加 `os.replace`，配进程内路径锁；revision 是内容 SHA-256；审计记录写进 `.agent-brain/audit/`，不碰正文。

内容源在 Vault 里运行时优先找统一 `VaultGateway`：授权和审批、Operation Ledger、Artifact 生命周期、Vault 投影、RAG revision 对账，都挂在这条链上。拿不到 Gateway 时返回里写 `governed=false`，不假装治理完成；但 Gateway 拿到了又明确拒绝时，不允许悄悄退回直写——那等于同时绕开审批和操作账本。

模型调用和文件写入也拆成两个网关：`ContentModelGateway` 管模型调用，`VaultGateway` 管写入。名字相近，一个成功推不出另一个成功。

产物另有自己的状态机：draft、previewed、confirmed、writing、written、validated、published，旁支是 conflict 和 failed；written 之后还可能 missing 或 unknown。「文件存在」和「产物有效」本来就不是一回事。

## Prompt 和 Skill 是两层约束

Prompt 走统一的 PromptRegistry，校验 frontmatter、name/version、变量集合和大小；render 时缺变量、多出没被消费的变量、参数超长，都会被拒。

B 站总结的写作规范只有一个权威：`skills/bili-video-summarizer/SKILL.md`。处理器每次读独立的写作块，核对 name/version 和唯一边界标记，返回全文 hash 和 source ref。在第二个 Prompt 里再抄一份规范，这个真源就废了。

## 编译出来的 wiki 页不是真源

`knowledge_compiler` 从总结笔记里抽概念和实体，做名称规范化、冲突判断、重复检查、页面合并和索引更新。它写出的是派生知识页，替代不了原始笔记；一个概念页生成，只能说明编译器跑过。

维护时我把这几样分开看：原始视频或文章、逐字稿、总结和视觉笔记、wiki 概念页、RAG 索引。一段产物写成功，不等于下一段也成功。这段链路往下接到[运行时](/projects/ark-workbench/runtime)和[记忆](/projects/ark-workbench/memory)。
