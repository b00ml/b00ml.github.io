---
title: 内容怎么进来，又怎么变成能用的知识
description: 字幕拿不到就降级到 Whisper，文章和邮件各走一条链，写进 Vault 只有一条受控路径；每一段都有自己的失败码。
pubDate: 2026-10-18
order: 1
summary: 摄入与编译
---

## 一条字幕要过三道降级

B 站那条的顺序是：缓存命中、B 站 API 字幕、yt-dlp 字幕、Whisper 转写。前一层失败或被判定不可用，才落到下一层。

「不可用」有具体定义。AI 字幕就算 HTTP 200 返回了，也要过 validate_subtitle(title, transcript, duration) 的内容匹配：正文为空、跟视频时长对不上，都算不合格，继续降级。HTTP 200 只证明网络通了。

运行时打状态标签：[PARSING]、[SUBTITLE]、[TRANSCRIBING]、[VISUAL]、[CACHE]、[DONE]。三层全挂，入口打印检查项后退出——得能看出是 Cookie、yt-dlp、ffmpeg、音频还是内容校验的问题，这些不能合并成一句「处理失败」。

缓存命中会跳过后面的三层，但仍然读一次元信息，生成 meta_<BV>.json。所以缓存是性能路径，不是内容正确性的再证明。

## 文章和邮件是两条不同的链

文章总结分五段：抓正文、解析正文、结构化合同校验、调模型、受控写入。五段失败必须分开记：抓取失败、正文为空、模型超时、JSON 缺字段、CAS 冲突，处理方式完全不一样。

邮件那头更薄。inbox_poll.py 只做接收，不调用 LLM：拉消息、清 HTML、提 URL、按域名白名单分类、归一化后算 fingerprint、写 SQLite。

两个细节是后来补的。一封邮件只取第一个白名单 URL，多出来的不猜；没有白名单 URL 的邮件也要标记已处理，否则每次轮询都重新扫一遍。去重同时靠 inbox_task.dedupe_key 的 UNIQUE 约束和 inbox_seen.marker，应用层「查到没有」不算数。

每次非 dry-run 的收件先写一条 inbox_operation：begin_collection(before_hash)、读外部邮件、入队、complete_collection(after_hash)。那个 hash 是队列快照摘要，不是邮件服务器的审计证明。

## 写入只留一条路

Vault 写入的守卫是几条很硬的规则：目标路径必须落在 Vault 根目录内；raw/、templates/、.obsidian/、.git/ 一律拒写；raw/screenshots/ 是历史布局留下的截图白名单，标记 raw_whitelist_exempt，不能推广成普通 raw 写权限。

写入用临时文件加 os.replace，配进程内路径锁；revision 是内容 SHA-256；审计记录写进 .agent-brain/audit/，不碰正文。

产物另有自己的状态机：draft、previewed、confirmed、writing、written、validated、published，旁支是 conflict 和 failed。written 之后还可能 missing 或 unknown——「文件存在」和「产物有效」本来就不是一回事。

## Prompt 和 Skill 是两层约束

Prompt 走统一的 PromptRegistry，校验 frontmatter、name/version、变量集合和大小；render 时缺变量、多出没被消费的变量、参数超长，都会被拒。

B 站总结的写作规范只有一个权威：skills/bili-video-summarizer/SKILL.md。处理器每次读独立的写作块，核对 name/version 和唯一边界标记，返回全文 hash 和 source ref。在第二个 Prompt 里再抄一份规范，这个真源就废了。

## 编译出来的 wiki 页不是真源

knowledge_compiler 从总结笔记里抽概念和实体，做名称规范化、冲突判断、重复检查、页面合并和索引更新。它写出的是派生知识页，替代不了原始笔记。一个概念页生成，只能说明编译器跑过，不说明内容对。

## 这里现在不好

**Whisper 的断点说明是错的。** transcribe.py 顶部写着逐 segment 缓存，实际 transcribe_once() 会先把所有 segment 迭代进内存列表，main() 拿到返回值之后才 save_cache()、写最终 TXT。所以我只能说「能读取已有的 --resume 缓存并合并跳过已有时间范围」，不能说推理中断时逐段落了盘，更不能说能从音频偏移处继续推理。

**纯文本 CLI 加 --vault 不会自动入库。** 它只写 transcript_<BV>.txt 和 meta_<BV>.json，总结要另走 Agent 那条路径。这个参数名太容易被读成「入库开关」。

**真视频没跑过。** B 站 Skill 的离线回归证明的是规范来源唯一，不是成稿质量；付费成稿那条线我一次都没跑。

**兼容直写还在。** 独立 CLI 拿不到统一写入层时会退回轻量直写，返回里带 governed=false。这不叫治理完成，只是我知道自己绕过去了。
