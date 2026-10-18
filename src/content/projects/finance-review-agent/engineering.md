---
title: 每个数字的口径
description: 任务、审批状态、artifact 和缓存各落在哪个文件，任务怎么流转，以及每个数字是怎么算出来的、该按什么口径读。
pubDate: 2026-10-18
order: 3
summary: 状态、幂等与数字口径
---

## 数据落在哪，为什么这么落

六种运行状态，各有用处：

| 存什么 | 存在哪 | 用途 |
| --- | --- | --- |
| Job | output/runtime/jobs.db | 任务、进度、错误、取消 |
| M2 审核状态 | output/cache/m2_audit_status.json | 单据结论、AI 结果、回写标记 |
| Workflow run | output/runtime/workflow_runs.db | claim 和 run 的映射、人工状态、revision |
| LangGraph checkpoint | output/runtime/workflow_checkpoints.db | interrupt 前后的图状态 |
| Artifact | output/artifacts/{type}/{job}/rN.json | M3、M4 的版本化结果 |
| 报告和 OCR 缓存 | output/reports/、output/cache/ | 失败清单、票面字段复用 |

JSON 状态那个文件用临时文件加 fsync 再原子替换，外层加文件锁；artifact 带 artifactId、revision、schemaVersion、创建时间和 SHA-256，新 revision 不覆盖旧的。

原因很实际：财务结论要能复现。三个月后有人问「这单当时为什么判 FLAG」，得拿得出当时那份证据，而不是重跑一遍得到另一个答案。output 是运行目录，不当源码提交。

## 异步任务与状态流转

M2 批量审核、M3 的 AI 复核和 AI 全量巡检走同一套任务队列。请求先返回 jobId，worker 从 SQLite 领 queued 状态的 job，逐阶段更新进度、结果和错误，前端轮询状态接口。取消是协作式的——外部调用跑完，才在安全边界停下。

崩溃语义很简单：服务重启后普通 job 直接标失败，需要重新提交。带人工 gate 的 workflow 单独有 checkpoint 和 revision，interrupt 之后从 checkpoint 恢复；人提交决定时带 expectedRevision，对不上返回 409。

单节点 SQLite 是刻意选的，理由写在设计决策里：POC 要容易部署、便于本地审计。M3 规则扫描和 M4 对账由 Service 直接调核心处理器并存 artifact，只有 AI 复核这类长任务进 job queue。

## 缓存、检索与两处降级

OCR 按引擎缓存成功结果，重复运行直接复用；解析失败只记录失败信息和统计，不会让整批审核退出。

制度检索有两条路径。keyword 是默认的，按关键词打分；hybrid 用本地 bge-small-zh-v1.5 做向量召回，再和关键词召回做 RRF 融合，模型不可用时回退到 keyword。

50 条标注集上的 Recall@8：keyword 是 0.78，hybrid 是 1.00。延迟取决于 CPU、首次模型加载和缓存状态，单次测量不能写成固定 SLA。

## 每个数字的口径

一个数字要有分母、有来源、有适用范围，才算一个数。列在这里的是口径：

| 数字 | 口径 |
| --- | --- |
| 公开 30 单 M2 F1 = 1.0 | 项目资料口径 |
| 自建困难集 32 单准确率 1.0000 | 离线合成的边界和复合场景 |
| 注入和结构约束 9/9 | 6 条规则样例加 3 条契约与编排检查 |
| 23,461 张台账 → 42 组重复 + 135 项问题 | 42 是组数不是张数，135 是项数，分母不同 |
| 315 笔流水匹配 201 笔 | 笔数匹配率 63.8%，不是金额匹配率 |
| 一次调查 2 步、8 次调用、14,602 tokens | 单次 BX-005693 记录 |

「30 单 2 到 3 分钟」是批量初审的观察值，不含人工终审，不是生产 SLA。

这些数字的来源是分层评测：单测覆盖规则、契约、工具、grounding、workflow、任务、artifact 和 M4；API 契约测 OpenAPI 路由、schema 和错误模型；另有检索评测、32 条困难集门禁、注入评测、Prompt 回归和前端测试。CI 里跑 Ruff、pytest、前端构建和离线评测门禁。

## 写死在契约里的两件事

M2 结论和 M3 AI 复核的枚举由 schema 固定，请求和响应默认拒绝未知字段；M2 违规码经过契约层和回写层两道白名单过滤。模型的输出要先过这一层，才可能出现在报告里。

另一件是回写。系统能回写审核意见，审核意见和 ERP 审批状态是两件事——前者是系统产出的判断和依据，后者只有人能改。前端展示的也是理由、违规码和证据字段。想先看分工，回到[机器判得清，人才敢放行](/projects/finance-review-agent/boundaries)；想先看三条链路的差异，去[三条链路，三种难度](/projects/finance-review-agent/workflows)。
