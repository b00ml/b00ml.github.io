---
title: 一次对话在运行时里经过什么
description: 请求先过准入，再拿一张有预算的上下文清单；工具要过权限、审批和副作用账本，unknown 只等外部证据收敛。
pubDate: 2026-10-18
order: 2
summary: 运行时与控制面
---

请求进来之后，运行时同时管请求和会话范围、上下文和预算、工具权限和参数、外部副作用、取消和断连、trace 和恢复证据。这些不是同一个对象，所以也不是同一个账本。

## 请求进来先过准入

Serve 的主要路由不多：`POST /v1/responses` 接对话和 SSE，`POST /v1/approvals/{id}` 解决一个等着用户确认的审批，`POST /v1/context-status` 看上下文状态，`GET /v1/runs/{trace_id}` 看单次运行，`POST /v1/tasks/{task_id}/operations/{operation_id}/reconcile` 把外部核验结果写回账本。

请求里有两个 id 很容易被当成一回事：request_id 是幂等键，防同一请求重复提交；previous_response_id 是会话续答，用来挂上历史。混了就会出现「重发一次变成两轮对话」。

project_id 先做安全化再进入检索范围和路径，客户端给的任意字符串不能直接拼进去。准入检查授权头、request id、project/session scope、输入长度、能力和并发预算边界。过了这一关，只说明请求有资格进运行时。

## 步数、取消、fallback 三个边界

第一个是步数。max_steps 管的是回合，一次模型响应可能带好几个工具调用，所以还得有 max_tool_calls；此外还有 max_tool_result_chars、context budget、output reserve、deadline 和上下文压缩的限制。只看步数推不出成本。

第二个是取消。工具执行的顺序是：取工具、已取消就拒、read/write/danger 权限确认、解析 JSON 参数、dispatch（同步函数进线程）、等 heartbeat 和超时、把异常包成 ToolResult、最后截断结果。同步工具线程是杀不掉的——取消只做到「不再等、不进下一轮编排」，底层线程可能还在跑完。所以写操作绝不能因为客户端断连就再跑一次。

第三个是 fallback。换 Provider 要同时满足三条：还有候选、错误码在允许列表里、还没有向调用方交付任何增量。已经吐过文本再换就是重复回答；已经产生工具调用或副作用，更不是能安全重试的状态。每次失败的候选都留着 tier、request/attempt id、错误码、延迟和已交付事件数，全挂时这些 route attempts 进错误 detail。

预算也是三段式：reserve、provider request、usage reconcile，失败和取消各走各的结算。没有真实 usage 或价格卡，成本就写 not_measured——不默认零成本。

## ContextPlan 是一张清单

ContextPlan 解决的问题是：每次调用模型之前，先把要带的上下文列成一张有预算的清单，而不是让模型自己去翻。

清单字段是 mode、scope、budget_tokens、reserve_output_tokens、used_tokens、zones、omitted、warnings、request_manifest。选择顺序我按代码抄了一遍：scope gate、对记忆引用调统一读策略、滤掉未激活和过期的候选、按 required/priority/score 排序、canonical 去重（工具观察用动作身份，其他用 ref 或 hash）、算 zone 预算和总预算、记下每条被省掉的原因。

可选预算 = budget_tokens - reserve_output_tokens。关键一条：required 的东西超预算不许静默删，要保留并标 required_budget_overflow，生产渲染器再 fail-closed。否则为了让预算通过，最先被删的永远是核心意图和安全约束。

渲染那一步也认身份：system rules 不可变，assistant/tool 必须成对完整，外部和记忆里的内容标成 user evidence，不提升为系统指令，history 已经用 canonical role 输出过的部分不再重复渲染。RequestManifest 记下 selected refs、内容 hash、token 估算、预算、omitted 和 renderer identity，它证明的是这一次选取的身份。

assembler_mode 和 renderer_mode 是两个独立开关，shadow 只记录对照结果，不换真实输入。

## 审批不是唯一闸门

ApprovalManager 管 read 直接放行、write 和 danger 等 Ark 回来 resolve，也包括超时和断连时的拒绝。审批原因要分开记——用户拒、超时、断连、自动策略放行——只存一个 false 就没法追了。

它外面还有几道：工具注册的权限声明、Bearer 鉴权、Vault 路径守卫、operation 账本、具体业务校验。任何一道单拎出来都不算安全边界，串起来才是。

## Operation 的 unknown 是屏障

账本的状态是 planned、authorized、approved、leased、executing、verifying、succeeded，旁支 failed、cancelled、unknown。authorized 是系统权限条件，不是人审；approved 是审批决定；executing 只说明开始了，不证明完成；verifying 是执行返回后的核验。

unknown 不是失败，也不是「可以再试一次」。它表示没有证据判断这次外部动作到底有没有发生，只能靠查询外部状态或拿到确定性的本地产物证据，走 reconcile 收敛。任务表里也会存一份工具状态的投影，但那份是兼容用的，真正的放行依据在账本上，两者靠 task id 和 operation id 关联。任务表自己用 state_version 做乐观锁，旧 checkpoint 写回失败要 fail closed，不能静默覆盖新版本。

这一层怎么留证据，见[我怎么证明它真的能跑](/projects/ark-workbench/evidence)。
