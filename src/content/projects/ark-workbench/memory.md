---
title: 一条事实要过几道门才允许被读出来
description: 模型只能提候选，激活要人审，读取要报 purpose。一条事实从被抽出来到真正能被召回，中间得连着过五道门。
pubDate: 2026-10-18
order: 3
summary: 记忆与检索
---

## 三样东西不要混

知识资产是 Vault 里我能继续改的 Markdown；记忆是有 owner、scope、来源证据和治理状态的长期记录；索引是从源记录派生出来的切块和向量，必须跟着源一起失效。

一个事实可能同时被 Markdown、session range、RAG 和任务状态引用。所以「让它别再被召回」不是删一个命中行，得把几条派生路径一起处理。

## 模型只能提出候选

抽取出来的东西叫 RecordProposal，严格 Pydantic 校验，不许带额外字段。几个字段是有意收紧的：memory_class 只允许 profile、project、episode、knowledge_ref；scope_level 只允许 user、project、session；subject 长度 1 到 128；confidence 和 stability 是 0 到 1 的有限数，bool 和 NaN 直接拒；source_refs 是 1 到 16 个 EvidenceRef。

EvidenceRef 要求 session_id、message_id、sequence、role 必须是 user、还有 64 位 quote_hash。这意味着模型自己的话、工具返回值里的第三方指令、助手写的总结，都不能当用户证据。一次临时要求也不因为置信度高就变成稳定偏好。

## 审核绑的是快照

review preview 返回 preview_hash，绑住当前 etag、冲突 peer 的版本、以及证据的身份和 hash，证据原文本身不进 token。publication 字段直接写着 pending_explicit_activation。

decide() 会校验本地 principal、reason、expected_content_hash、expected_revision_etag 和 preview_hash。手工改过 Markdown 再抄一份旧的 approval 字段，继承不了旧批准。

activate() 也不是把 approval_state 换个字符串。它重新验批准回执、事实、冲突、策略和同意，然后写 status=active、approval_state=activated、source_committed=true、index_status=pending。所以「已激活」和「已索引」是两件事：索引失败不该把一条人工确认过的事实撤掉。

## 读的时候先报 purpose

统一读门禁的 purpose 只有 profile、project、search、embedding、history、admin，不认识的直接拒。检查项按顺序是：事务挂起与读阻塞、schema 版本、旧库退休标记、owner 和 vault_namespace、作用域、状态与有效期、回执与来源完整性、敏感等级与同意、expected_etag 和派生版本。

写这条的时候我想的是「user scope 不等于任意搜索都能看见」：用户画像得声明 profile 之类明确的 purpose 才放出来，history 和 admin 是管理面，不是模型召回。

## 改一条要连带失效

撤销或改正之后，顺序是：先 suppression 挡住读取和重新抽取，再改 Markdown 源状态，再删或重建 RAG，再让 session range 和任务状态失效，最后靠 outbox 和 reconcile 重试到终态。

reconcile 会复查 ready 项的源、期限和同意，embedding fingerprint 变了就重新置 pending。失败批次是有界轮换的——一个不可用的 Provider 不能把后面所有活饿死。

## 检索：票数和版本都要说清

切块按 frontmatter、heading、代码围栏、entry 和表格来分；索引元数据绑着 embedding_model、index_version、parser_version、chunk_strategy_version，版本对不上就该拒或显式重建。

hybrid 融合先对每个 route 按 entry、file、ref 去重，再算 score = Σ 1 / (rrf_k + rank)。这是排名票数的倒数相加，不是相似度概率；一个月桶里的多个 chunk 也不能在同一条路线上重复投票。

answer gate 只有在 on 模式才影响最终输出，shadow 的读数不进生产拒绝。

## 这里现在不好

**工程基础齐了，真实链路没跑。** capture 到 review 到跨会话 recall、correct、revoke 这条端到端，用的是真实模型跑的话我没做；人审的 precision 和 recall 也没有测过。现在能说的是代码和隔离 store 里有，不能说是好用。

**reflect() 还是 not_implemented。** 别把「受控维护循环」理解成它会自己反省、自己建关系。它不会。

**旧读数不能当基线。** vector 单路召回的低质候选曾经污染过融合结果；false refusal 的报表里又把未激活的期望证据、qrel 不匹配和我真的在拒答混在一起。分类治理做完了，分母还是不稳，换过语料和 qrel 的读数不能跟前一批加在一起。

**归档不等于忘掉。** 本机旧记忆全量归档时记录的口径是 155 个文件、563 条，跟着 manifest 和逐文件 hash 验过。但那是迁移当时的证据，我没重跑；历史 session 和另一个检索入口是否干净，也没验。
