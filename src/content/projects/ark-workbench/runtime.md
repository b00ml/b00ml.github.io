---
title: 一次对话在运行时里经过什么
description: 请求先过准入，再拿一张上下文清单，然后才轮到工具、权限、审批和副作用账本。我把最容易失控的几处摊开写。
pubDate: 2026-10-18
order: 2
summary: 运行时与控制面
---

## 请求进来先过准入

Serve 对外只有几类路由：`POST /v1/responses` 接对话和 SSE，`POST /v1/approvals/{id}` 解决一个等着用户确认的审批，`POST /v1/context-status` 看上下文状态，`GET /v1/runs/{trace_id}` 看单次运行，`POST /v1/tasks/{task_id}/operations/{operation_id}/reconcile` 把外部核验结果写回账本。

请求里有两个 id 很容易被当成一回事：request_id 是幂等键，防同一请求重复提交；previous_response_id 是会话续答，用来挂上历史。混了就会出现「重发一次变成两轮对话」。

project_id 先做安全化再进入检索范围和路径，客户端给的任意字符串不能直接拼进去。

## 循环里会失控的三处

Runner 里第一个是步数。max_steps 管的是回合，一次模型响应可能带好几个工具调用，所以还得有 max_tool_calls；只看步数推不出成本。

第二个是取消。工具执行的顺序是：取工具、已取消就拒、read/write/danger 权限确认、解析 JSON 参数、dispatch（同步函数进线程）、等 heartbeat 和超时、把异常包成 ToolResult、最后截断结果。同步工具线程是杀不掉的——取消只做到「不再等、不进下一轮编排」，底层线程可能还在跑完。所以写操作绝不能因为客户端断连就再跑一次。

第三个是 fallback。换 Provider 要同时满足三条：还有候选、错误码在允许列表里、还没有向调用方交付任何增量。已经吐过文本再换就是重复回答；已经产生工具调用或副作用，更不是能安全重试的状态。

## ContextPlan 是一张清单

ContextPlan 解决的问题是：每次调用模型之前，先把要带的上下文列成一张有预算的清单，而不是让模型自己去翻。

清单的字段是 mode、scope、budget_tokens、reserve_output_tokens、used_tokens、zones、omitted、warnings、request_manifest。选择顺序我按代码抄了一遍：scope gate、对记忆引用过读策略、滤掉未激活和过期的候选、按 required/priority/score 排序、canonical 去重（工具观察用动作身份，其他用 ref 或 hash）、算 zone 预算和总预算、记下每条被省掉的原因。

关键一条：required 的东西超预算不许静默删，要保留并标 required_budget_overflow，生产渲染器再 fail-closed。否则为了让预算通过，最先被删的永远是核心意图和安全约束。

## 审批不是唯一闸门

ApprovalManager 管 read 直接放行、write 和 danger 等 Ark 回来 resolve，也包括超时和断连时的拒绝。审批原因要分开记——用户拒、超时、断连、自动策略放行——存一个 false 就没法追了。

它外面还有几道：工具注册的权限声明、Bearer 鉴权、Vault 路径守卫、operation 账本。任何一道单拎出来都不算安全边界。

## Operation 的 unknown 是屏障

账本的状态是 planned、authorized、approved、leased、executing、verifying、succeeded，旁支 failed、cancelled、unknown。

unknown 不是失败，也不是「可以再试一次」。它表示没有证据判断这次外部动作到底有没有发生，只能靠查询外部状态或拿到确定性的本地产物证据，走 reconcile 收敛。任务表里也会存一份工具状态的投影，但那份是兼容用的，真正的放行依据在账本上，两者靠 task id 和 operation id 关联。任务表自己用 state_version 做乐观锁，旧 checkpoint 写回失败要 fail closed，不能静默覆盖新版本。

## 这里现在不好

**状态源太多，恢复基本靠人。** 任务 DONE 不推出所有 operation 已核验，一次断连可能留下一条 unknown 等人手工 reconcile。我没有自动恢复。

**ContextPlan 现在是「代码有」，不是「生产在跑」。** assembler_mode 和 renderer_mode 是两个独立开关，shadow 只记录对照结果、不换真实输入。本机活动配置我没有逐项核过，所以这层我做不了比「源码里有」更强的断言。

**Serve 起停本身出过事。** 历史上有过一次，在已经存在健康实例的情况下误判了进程的赢家输家，测试还把 trace 和 operation 写进了运营路径。补了 owner、隔离配置和定向回归，但其他脚本是否默认隔离，还得逐个入口看。

**改一处要动六处。** 动 HTTP 或 SSE 就得同时看 serve_contract、serve、Ark 的 crt.ts、agent-live、session-service、ai-asst。契约漂移是我返工最常见的原因。
