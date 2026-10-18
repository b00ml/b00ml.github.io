---
title: 我怎么证明它真的能跑
description: 证据按七层记，读数先绑五个身份才允许横向比较；每一层能下什么结论写清楚，原报告和失败值留在原位。
pubDate: 2026-10-18
order: 4
summary: 评测与证据
---

这一页不列功能，列的是我怎么判断一个功能到底跑没跑过。判断从分层开始：同一个东西在不同层的证据，能下的结论差得很远。

这些判断有统一的观察日期：2026-10-06 那次核对。

## 先把证据分层，再说话

我按七层记：源码和契约、单测、离线 fast、候选报告、真实环境 shadow、运行中的服务、宿主上的人工操作。

七层各自买到什么：源码层证明入口和机制存在；单测证明指定 fixture 下的回归；离线 fast 证明这套任务在本地不联网也能过门禁；候选报告证明同身份的读数之间可以比较；真实 shadow 证明那个快照、那批任务上的结果；live service 证明运行终态和接口行为；宿主和人工操作证明某条用户路径在某台机器上走过。

分层的用处不是贬低低层证据，而是知道每一个数字该配哪一句话。`/health` 返回 ok，配的是「本地服务能应答」；bundle 的 SHA 对上，配的是「宿主加载的是这个身份」。

一次断连也一样：能记的是 session 里到了哪条消息、TaskState 停在哪个阶段、operation 是不是 unknown，这三样对齐了才算看清一次运行。

## 一个读数要横向比，先绑五样东西

评测读数要能横向比，得先绑五样：candidate_id、git_commit、build_sha256、task_set_hash、源报告的 SHA-256。绑不上的读数，只当一次观察。

几条口径是一起定的：passed 是二值门禁，不是 score；human 和 simulated 不能相加；离线重评分和重新调 Provider 是两件事；配置、模型、预算、语料、qrel 或 grader 换过，旧读数就不是同条件下的基线。定下来之后数字变少了，但能拿去用的结论变硬了。

## 有产物的那几段

Agentlab 的单测和 Ark 的 build 在指定套件、指定 fixture 下是过的。Ark 的 build 顺序是 CSS 检查、Ark 单元测试、tsc、production bundle。

离线 fast 套件不联网、不调 Provider；daily-live 必须显式加参数才会真跑。两条口径分开，fast 的绿色只代表 fast 那一层。

RAG 有过一次真实 Vault 隔离快照下的 shadow 读数，它代表那个快照和那批任务。本地模型的 smoke 也跑过，Qwen、Ollama、llama.cpp、NInfer 各自独立接通过；48K 那组参数是本机一次实验，带着 8GB 的资源护栏。

旧记忆的迁移有产物：manifest、逐文件 hash、CAS 回滚，档案量是 155 个文件、563 条。

## 证据强度用标签写

一个结论旁边挂哪个标签，比结论本身更能说明它站在哪一层。我用的标签是：source-confirmed、test-confirmed、runtime-confirmed、host-confirmed、human-confirmed，加上 design/planned、report-claimed 和 superseded。

同一件事可以同时挂几个标签：代码是 source-confirmed，离线回归是 test-confirmed，health 是 runtime-confirmed。人审要写清标准、样本、reviewer 和日期，才配叫 human-confirmed。

## 我给自己定的几条判读规则

不拿 hash 当正确性。content_hash 证明字节一致，build_sha256 证明构建身份，它们都不是内容正确性的证明。

旧读数换过条件就标 superseded，不覆盖原文件；新跑用新的 run id 和新的 task hash。

not_measured 不是 0，没执行不是失败，重试成功也不能把第一次失败的 trace 和花费删掉。

原始报告、日志和失败值留在原位。文件名和 mtime 不能单独当发布证据，我的索引里只登记路径、字节数和 SHA-256。

这么记的好处是，翻回[运行时](/projects/ark-workbench/runtime)或[记忆](/projects/ark-workbench/memory)里任何一条机制时，我能立刻说出它的证据停在哪一层。
