---
title: 哪些是真跑过，哪些只是写着
description: 代码写了、测过、真跑过端到端是三件事。这一页把手里的证据按七层拆开，也说清哪些结论我不敢再往上抬。
pubDate: 2026-10-18
order: 4
summary: 评测与失败
---

## 先分层，再说话

同一个东西在不同层的证据，能下的结论差得很远。我按七层记：源码和契约、单测、离线 fast、候选报告、真实环境 shadow、运行中的服务、宿主上的人工操作。

- 源码层只能说明入口和机制存在，说明不了活动配置选没选它。
- `/health` 返回 ok，只证明本地服务能应答，不证明模型、工具、Vault 任何一个能成。
- bundle 的 SHA 对上了，只证明宿主加载的身份，不证明每个面板都用过。

评测读数要能横向比，得先绑五样东西：candidate_id、git_commit、build_sha256、task_set_hash、源报告的 SHA-256。绑不上的读数，只能当一次观察。

同理，passed 是二值门禁，不是 score；human 和 simulated 不能相加；离线重评分和重新调 Provider 是两件事。这几条定下来之后，数字变少了，但能拿去用的结论变硬了。

## 有产物的部分

Agentlab 的单测和 Ark 的 build 在指定套件下是过的，属于「指定环境、指定 fixture 下通过」，也仅此而已。Ark 的 build 会先做 CSS 检查，再跑 Ark 单元测试、tsc 和打包。

离线 fast 套件不联网、不调 Provider；daily-live 必须显式加参数才会真跑。这两条是分开的口径，不能拿 fast 的绿色去代表线上的样子。

RAG 有过一次真实 Vault 隔离快照下的 shadow 读数，它只能代表那个快照和那批任务。本地模型的 smoke 也跑过，Qwen、Ollama、llama.cpp、NInfer 各自独立接通过。48K 那组参数是本机一次实验，带着 8GB 的资源护栏，不是通用能力。

旧记忆的迁移有产物：manifest、逐文件 hash、CAS 回滚，档案量是 155 个文件、563 条。

## 只是声明的部分

**ContextPlan 和 Graph 有代码，但我没说它们在跑。** assembler_mode、renderer_mode 的活动值我没核，Graph 的下一步现在也只取第一条边，不能描述成所有分支并行。

**B 站 Skill 的回归只证明规范来源唯一。** 权威文件、version、hash、缺省和来源都断言了，真实视频成稿质量没有。

**归档不等于全路遗忘。** 155 和 563 这组数字只能证明迁移和文件 hash，证明不了历史 session、别的检索通道也干净。

**配置注入到位不等于记忆能用。** governed 和 approved 配置注入只说明配置和 worker 就绪，真实模型的记忆端到端、人审的 precision 与 recall 都还是 pending。

## 失败了、也没修干净的

**F-05**：早前的 live 矩阵和测试把 trace、operation 账本写进了运营路径，Serve 的 start 在已有健康实例时还会误判赢家输家。补了 owner、隔离配置和定向回归，但别的脚本是否默认隔离，得逐个入口看。

**F-06**：长上下文那条线，64K、48K、32K 的回退和 KV、窗口、输出预留、冷启动耗时混在一起报过。后来把控制时间、首 token、usage 和答案正确率分开记，但结论只对本机那一次配置成立，我不往别的显卡和别的模型上推。

**F-09**：旧库退休的候选里留着一个 product_governance_complete=false。这个字段本身就是结论——归档做完了，产品治理没做完。

## 这一页本身也没重跑

这里写的都是 2026-10-06 那次只读核对的结果。那次没启动 Serve、没调 Provider、没写真实 Vault、没跑 build 和 deploy、没重跑测试，所以我在这页不提供任何新的质量、延迟、成本或召回数字。

引用旧报告时我会连条件一起带：模型、预算、语料、qrel 或 grader 换过，旧读数就不是同条件下的基线。not_measured 不是 0，没执行不是失败，重试成功也不能把第一次失败的 trace 和花费删掉。
