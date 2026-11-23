---
title: 英语教研内容生产工作台
description: 基于 LangGraph 编排的英语教研内容生产线：打通生成、跨字段硬规则、二元 Rubric 评审、人机一致率校准与 Bad Case 归因迭代的全链路观测与评测闭环。
pubDate: 2026-10-18
updatedDate: 2026-11-23
status: shipped
role: 产品与实现
period: '2026'
order: 3
highlights:
  - LangGraph 全链路节点 Trace 观测 · 1,154 项测试（84.05% 覆盖率）
  - 指标拆解 + Rubric 二元化（0/1/unknown）· 人人 ≥85% / 人机 ≥90% 校准
  - 跨字段规则前置短路 + Bad Case 归因回流 · Outbox 三层幂等恢复
stack: [LangGraph, 观测与评测, Rubric 二元化, 教研工作流]
links:
  - label: 观测与评测演示
    href: /projects/english-content-workbench/demo/
  - label: 七阶段流水线图
    href: /diagrams/english-pipeline.html
  - label: 开源仓库
    href: https://github.com/b00ml/english-edit-agent-platform
---

## 它能完整办成的一件事

把一份英语教材丢进去，经 LangGraph 状态机跑出单选、完形、阅读三类教研题目——每道题都带着答案、解析，和一个能点回教材原文的页码切片。系统不靠一句笼统的 1–5 分主观 Prompt 放行，而是把「题目质量」下钻拆解为多维度的**二元化原子判据（`1 / 0 / unknown`）**，配合服务端确定性硬规则前置短路、人机一致率校准门禁与 Bad Case 归因回流，守住整条生产线的可信度。

它要回答的不是「能不能生成」，而是「生成之后，凭什么信它对、判错了怎么校准迭代」。

> [打开 LangGraph 观测与评测闭环演示](/projects/english-content-workbench/demo/)：免安装、免登录，无需任何后端或密钥。在浏览器里直接查看 LangGraph 节点级 Span 轨迹、独立 Judge 模型（`temperature=0` + 先证据后判定）配置、指标下钻与 `0/1/unknown` 二元 Rubric、用 `unknown` 占比反查歧义直至人人/人机一致率越过 `85% / 90%` 阈值的迭代过程，以及 Bad Case 归因回流。

![内容生成界面：按知识点、题型、难度和数量批量出题，生成结果带结构化校验与本次参数。](../../../assets/english-content-workbench/generation.webp)

_图 1：一次批量生成。参数、题型和数量在上，结果是带答案与解析的成稿，下方保留这次生成的知识来源。点击图片可以放大。_

<iframe src="/diagrams/english-pipeline.html" title="英语教研内容生产工作台七阶段流水线与恢复边界（可交互）" loading="lazy" style="width:100%;height:640px;border:1px solid #8884;border-radius:8px;"></iframe>

_图 2：七阶段流水线与恢复边界（交互版）。悬停节点与连线可单独聚焦那一步，右上角可切换深浅主题；下面那条虚线带画的是请求落 Outbox 之后的投递、租约与周期对账。[在新窗口打开](/diagrams/english-pipeline.html)可放大阅读。_

## 我为什么把它做成这样

**规则先于模型。** 选项重复、答案字母越界、完形空格数和 blanks 对不上，这些代码能直接拒绝，不该花 token 去问模型。模型只判它真正擅长的部分。两层都不覆盖的，交给人。

**来源必需，宁可失败。** 内置三种题型都把检索设成必填：取不到符合条件的知识片段，就在调用生成模型之前失败。代价是知识点标签没建好的题目出不来——这个代价我接受，因为一条没有出处的题，复核的人无从判断。

**不追求全自动。** 生成器写得再好，也换不来一句「这批可以直接发」。人工复核那一步不省，省掉的是翻找原文和初筛的时间。

## 三段实现

- [规则、模型、人：三层判定各管什么](/projects/english-content-workbench/quality-loop)：能写成判断的交给代码，语感和干扰项交给模型，最后一眼留给人，分数只当筛选器。
- [从一份教材到一道能引用原文的题](/projects/english-content-workbench/rag)：解析、结构切分、索引、融合排序，以及为什么取到原文只是起点。
- [一次生成要跨五个地方保持一致](/projects/english-content-workbench/reliability)：任务、条目、内容五种状态，重试、幂等和补偿各挡住什么。

## 做到什么程度

链路是完整的七段：资料接入 → 知识检索 → 内容生成 → 自动质检 → 人工复核 → 样本沉淀 → 成本与链路分析。前四段是机器，中间一段是人，最后两段留证据；每次调用留一条 Trace，能回放这稿是怎么出来的。

工程侧：1154 个测试通过（1091 个非集成 + 63 个连真实 PostgreSQL），应用层覆盖率 8974/10677 即 84.05%，门槛设在 80%。连真实库的用例在夹具里跑迁移，不是 mock 表结构。

内容侧：6 条真实题目跑完自动质检，得分 87.70～91.75，全部进待人工复核队列——自动分只负责排序和取舍，定稿仍然归人。三份资料建成 81 个 leaf 向量，44 条来源回归在 Top5 和 Top8 上都是 44/44 齐备。

![阅读理解人工质检界面：左侧题目、选项、答案与解析，右侧知识来源与复核决定。](../../../assets/english-content-workbench/reading-review.webp)

_图 3：自动质检之后的复核台。题目、选项、答案、解析和知识来源放在同一屏，自动分只当筛选器，定稿由人点。点击图片可以放大。_

![调用链路回放界面：一条内容从检索到质检的模型、Token、耗时与成本。](../../../assets/english-content-workbench/trace-replay.webp)

_图 4：按 trace_id 回放一稿。每次生成与质检调用都绑同一条链路标识，失败重试也记在链路上，所以「这稿怎么出来的」能逐段查。点击图片可以放大。_

## 适用范围

面向教研组内部的批量出题，单人维护、本机部署。出版级校对、多学科扩展、多人协同审校不在这一版范围内。
