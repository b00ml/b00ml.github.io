---
title: 从一份教材到一道能引用原文的题
description: 教材解析、结构切分、两路召回与融合排序，讲清楚一条题怎么拿到可定位的原文片段，以及引用为什么能点回那一页。
pubDate: 2026-10-18
order: 2
summary: 检索与引用
---

## 两个入口，落到同一份文档表示

已经能提取文字的文件走同步解析预览，普通文件上限 10MiB；扫描 PDF 和复杂版面进 OCR 后台，上限 128MiB、任务最多 500 页，本地 MinerU 推理，按页保存结果，成功的页不重识别。同步路由的 OCR 小预览上限是 3 页，和后台任务的 500 页是两回事；只选部分页索引时保留 partial 范围。

两条路落到同一个中间结构：source_name、source_type、source_hash 记来源身份，parser_version 记解析器版本，blocks 按 order 排好并带 page 和 locator，text 是按块用空行连起来的规范化文本，warnings 和 stats 记降级和范围。每个块在规范化文本里算出 content_start 和 content_end，坐标是 Python 字符串的字符偏移，不是 PDF 字节，也不是页内坐标。source_hash 定位原源快照，normalized_content_hash 定位规范化文本，两者不互相替代。

各格式的解析规则分开写：docx 按 body 顺序处理段落和表格，html 只抽正文结构、不执行页面 JS，csv/xlsx 保留原行号、公式只留文本不计算、合并出来的空位不猜值。

## 切分用结构，页只是软边界

默认 layout 是 structure，走 structural 生成 leaf，不拿固定窗口硬切。屏障是新章节、缺页、被排除的页、独立题组和表格；重复的页眉页脚先做家具识别，不会无条件重置章节，新章节是保护屏障，不因为标题文字相同就跨章合并。续页要有 accepted 关系才连，未知邻接只标 proposed。定义和它的例句、例外、表格靠关系层恢复，不必塞进一个向量。

配置里写的是 size 512、overlap 80，但结构屏障优先，实际重叠和小块分布不必等于机械的 512 加 80 滑窗。leaf 是要被引用的正文，context_header 带来源和章节路径，embedding_content 是「上下文前缀 + 正文」——前缀是派生出来的，不能当原文事实。

一个 leaf 可以由不连续的源段拼成：页 2 的定义加页 3 的例句，中间的页眉被排除，于是它带两个 source_segments，分别记「源区间 → leaf 区间」和各自的 page、block；顶层 content_start 为空，source_envelope 只作导航。parent 是组织和回传单元，不参与 embedding。

## 索引：校验完再原子切换

建索引的顺序是：解析、切块、校验计划，冻结结构快照，分批嵌入，检查返回数量、维度和数值有限，然后同一批写文档和块。batch_size 取应用上限和 provider 上限里较小的那个。

同 ID 重建时 revision 加一、替换 chunk ID，完成源段校验和向量校验后原子切换；中途异常则保留旧索引。旧向量不是一份可以随时查询的多版本仓库，恢复旧布局要显式重建。

## 召回：两条通道，各管一半语义

检索先保留原 query，再加入 aliases 和规则补出来的互补子问题，每个 query 走两条 lane。向量通道是 PG 余弦候选，按 leaf 谓词排掉 parent，按 scope 过滤，默认最低相似度 0.3。全文通道照顾英文分词；中文没有空格，用有界 bigram 匹配。

两路候选按稳定 chunk ID 去重，每条 lane 对同一条最多贡献一次，融合分是 Σ 1/(60 + rank)——只看名次，不看余弦幅度，所以向量通道排第一，不保证融合后还是第一。候选池按 lane 各 30 个，最终取 Top 5，可选 Top 8；整个响应有 32768 字符总预算，包数、跳数、segment 和字符限制同时生效，长单元会把返回压到少于 K，这时读 incomplete_reasons，而不是硬凑满 8 个 ID。重排接口有 off、optional、required 三档，当前是 off。

关系通道只在活动同 scope 的 accepted 关系上从 seed 单元扩，source 签名或审核过期就关闭扩展。

## 从 leaf 到能点回原文的引用

返回的东西分三类：snippets 是渲染文本，bundle_citations 和 context_bundles 是送达的结构材料，实际 source_segments 与 diagnostics 记为什么少给了。body、source locator、page、block、原行列、hash 和 snapshot 版本分别保留；bundle 的 complete 说明结构材料在预算内送到了，不说明答案被原文证明。

provenance 把实际交付的 segment 转成内容引用；候选 summary 里的 diagnostic_candidate 标记只供定位，不计入「已给模型的证据」。三种内置题型都把检索设成 required：取不到有效片段，就在调用生成模型之前失败。无来源的负例跑过，生成调用数为 0。

三份资料全部走 structure，建成 81 个 leaf 向量、1 个 parent；44 条来源回归在 Top 5 和 Top 8 上都是 44/44 齐备。有一次融合只返出 4 条，该进前三的段没在里面，扩大返回预算后补齐。这套链路保证的是「这段原文被送到、能点回那一页」，答案对不对交给后面两层判。

另两段：[规则、模型、人三层怎么分工](/projects/english-content-workbench/quality-loop)；[一次生成要跨五个地方保持一致](/projects/english-content-workbench/reliability)。
