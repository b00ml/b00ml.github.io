---
title: 一次生成要跨五个地方保持一致
description: 一次生成横跨数据库、队列、检查点、文件卷和调用记录五个地方。讲投递、幂等、重试与状态机怎么拢成一条一致的链路。
pubDate: 2026-10-18
order: 3
summary: 跨系统一致性
---

## 五个地方，没有一个事务盖得住

一次生成要保护五类状态：已接收的请求、待执行的条目、进行中的图、OCR 成功的页、已经发生的模型调用和费用。它们分别落在数据库、Redis、LangGraph 检查点、文件卷和 Trace 里，没有一个事务能同时覆盖。目标因此写成四句：有限重试、可追溯、可补偿、尽量不重复。

五处各有分工。FastAPI 只做校验、写 task 和 Outbox、尝试投递，不在 HTTP 请求里跑完整批生成；Redis 是 Celery 的 broker 和结果后端，不是主业务事实；生成 worker 走默认队列、并发 5，每个条目一个独立会话；OCR worker 单独一条队列、并发 1；PostgresSaver 按 thread 持久化节点状态；DB 和文件 spool 留作安全回退证据。

Trace 是第五处的记账本：先递归脱敏和截断再写 sink，sink 故障就落 spool 原子文件。一次完整链路跑下来记了 118 次模型调用——嵌入 99、生成 7、质检 12——按配置单价估算是 0.170276。

## 投递：把「要发」和「已发」分成两行

请求进来时，task 行和 Outbox 行在同一个数据库事务里写入，事件号是 `task:<id>:dispatch`，唯一。之后 relay 读最早一条 pending，置为 sending、attempts 加一，提交，再拿稳定的事件号去投递；成功写 sent，失败回 pending 并按退避重排，次数耗尽进 dead。领取用 skip locked 加带随机租约令牌的 CAS，令牌决定谁能 ack。

周期维护每 20 秒跑一次，盯三种缺口：活动状态里 pending 或 dispatched 缺投递的、sent 超过 3600 秒没有执行确认的、running 超过 1800 秒没有执行锁的。发现 thread 里已经有内容，就只修条目，不重新调生成。已完成、取消、awaiting_review 这些终态不自动复活——这条规则比多恢复几条更重要。

## 幂等：三层身份，一个 thread

第一层是 (task_id, item_index) 唯一，第二层是 thread_id 唯一，第三层是内容表 thread 非空唯一。图里已有最终 state 且没有 next，直接返回；有人工 interrupt 就停在 awaiting_review；其余从保存的节点续跑。每个 Celery 条目建自己的 SQLAlchemy 会话、finally 关闭；线程执行用 PostgreSQL 的 session advisory lock，锁由独立连接持有，不因为节点 commit 就释放。

锁和唯一约束能挡住重复提交业务终态，但不撤销已经发出去的云端请求，所以每次尝试的失败、attempt 和 usage 都落库，恢复演练分开测消息重投和外部副作用重复。

条目状态六种、内容状态五种，旧值只留 Python 别名，SQL 侧迁移归一，未知的 Graph 结果按失败关闭。直接改 status 会绕过服务层的转换表，所以门禁写在 status.py 和服务里。

## 四类重试，四种预算

输出没通过结构校验，走模板的 max_retry；Judge 每轮最多 3 次尝试、两轮都要有效；内容低分触发 max_revise，带反馈改版，耗尽 reject；外部任务失败才轮到 Celery 的 TASK_MAX_RETRIES。四种叠起来会增加调用数，没有「最多三次」这种统一说法。

失败按结构化异常和 `__cause__` 分类：连接、超时、Redis 和 DB 的 OperationalError、HTTP 408、429、5xx 是瞬态，有限重试；非瞬态 HTTP 4xx 和确定的业务错误保留 code、失败关闭；Trace 无法持久化单独一类；未归类的记 UNKNOWN_ERROR，默认不重试。分类看异常链，不看错误文本里的「429」。

## 任务成功，不等于内容通过

22 张业务表，任务八种状态、条目六种、内容五种。图跑到 stored，条目变 succeeded，内容落在 pending_qc——「这批能用了」还要走人工。Graph 结果和条目的映射是固定的：stored 对 succeeded，awaiting_review 对 awaiting_review，rejected 对 failed，外部异常耗尽对 failed，cancelled 对 cancelled。

父任务的进度只算 succeeded、failed、cancelled，缺项不提前到 100%；全成功才是 succeeded，成功混失败或取消算部分成功，全取消是 cancelled。等人工的父任务停在 awaiting_review，不算最终进度，人工 resume 之后再决定结果。

取消是合作式的：只写 cancel_requested_at，在调度前和条目入口检查，已经发出去的模型请求不会立刻终止。软超时 600 秒、硬超时 900 秒、visibility_timeout 3600 秒；硬超时杀进程来不及执行 finally，收尾落在未 ack 重投、租约和检查点上，这条链路本来就按「消息一定会重投」设计。

工程侧的证据：1154 个测试通过，其中 1091 个非集成、63 个连真实 PostgreSQL；应用层覆盖率 8974/10677，即 84.05%，门槛设在 80%，连真实库的用例在夹具里跑迁移。

另两段：[规则、模型、人三层怎么分工](/projects/english-content-workbench/quality-loop)；[一份教材怎么变成一道能引用原文的题](/projects/english-content-workbench/rag)。
