---
title: 观测与回归双闭环
description: 一次答错如果只留下「成功了」三个字，就永远修不好。Ark 把每一轮写成可回放的轨迹，把选题的轨迹升格成二元 rubric 用例，再用一个门禁脚本守住「以前能用的现在还能用」。
pubDate: 2026-11-23
order: 4
summary: Trace 轨迹 → Rubric 用例 → 门禁
---

这套机制是被一次验收逼出来的。

那时 8 步人工验收全过，但翻运行日志发现只有轮次边界的审计：谁调了什么工具、成功与否、整轮多少 token。**没有内容。** 没有用户原话，没有工具返回的正文，没有按轮次的用量。于是最该回答的问题一个都答不上来：模型为什么答错？检索是没搜到，还是搜到了没读，还是读了没用？

两个闭环就是补这个缺口，它们的分工很干脆：**trace loop 解决「看不见」，case loop 解决「没守住」。**

## Trace loop：每轮一条轨迹

开关在 `ark.toml`：

```toml
[core]
trace = "summary"   # off | summary | full
```

| 模式 | 落盘内容 | 什么时候用 |
| --- | --- | --- |
| `off` | 不写 | 明确不想落盘 |
| `summary`（默认） | 正文与结果各截断到 400 字，记长度与是否截断 | 日常开发：知道发生了什么，不存全文 |
| `full` | 正文与结果最多 20000 字 | 复现问题、升格用例、评测跑 |

位置是 `<vault>/.ark/traces/<日期>/<turn_id>.json`，写盘原子（先写 `.tmp` 再 `replace`），**写失败只吞掉异常，不影响这一轮对话**。观测设施不能成为新的故障点。

一条轨迹里有什么：

```json
{
  "trace_version": 1,
  "turn_id": "4a708c37-…",
  "mode": "full",
  "prompt": { "messages": ["…这轮请求的完整上下文…"] },
  "steps": [
    {
      "round": 1,
      "usage": { "prompt": 23030, "completion": 120 },
      "text": "我先看看有没有相关笔记。",
      "reasoning": "（模型推理内容，若有）",
      "tool_calls": [
        { "tool": "mcp__ark-core__search",
          "arguments": { "query": "方舟计划 负责人" },
          "success": true, "result": "…命中 2 条…", "result_chars": 812 }
      ]
    }
  ],
  "confirmations": [{ "tool": "mcp__demo__append_record", "decision": "approve" }],
  "outcome": { "commit": "6da9250", "files": 1 },
  "totals": { "input_tokens": 23304, "output_tokens": 426, "model_calls": 4, "tool_calls": 5 },
  "error": null
}
```

`steps[].round` 是「第几次模型调用」。这个字段看着小，作用是大：之前的扁平工具日志分不清哪次调用属于哪一轮，也就分不清「它搜了三次是因为第一次没搜到，还是因为它忘了自己搜过」。

回放用命令行，输出是时间线而不是 JSON：

```
turn 4a708c37  full  6.5s  model=openai/deepseek-flash  tokens=23304/426  steps=4 tools=5
user: 方舟计划的负责人是谁？
── round 1  2.1s  in=23030 out=120
~ 先在库里找一下「方舟计划」的负责人。
ok mcp__ark-core__search({"query": "方舟计划 负责人"})  43ms  812B
── round 2  0.4s  in=23380 out=96
ok mcp__ark-core__read({"path": "笔记/方舟计划.md"})  9ms  312B
assistant: 方舟计划的负责人是小林（笔记/方舟计划.md）。
outcome: commit=None files=0
```

`ark trace list` / `show <turn_id>` / `prune --keep 200`，三条命令就够。**没有自动清理**——`prune` 要手动跑或自己加进 cron，这一点写进已知边界，不假装它自动。

隐私边界也写在明处：`full` 会把笔记正文写进 `.ark/traces/`。`.ark/` 默认在 `.gitignore` 里，不进版本库；但它是**明文**。含敏感内容的 Vault 用 `summary`。

## Case loop：把一次失败钉成用例

轨迹能看还不够，看得见的问题不会自动变成「以后不会再犯」。所以一条真实轨迹可以升格成用例：

```bash
python evals/loop.py promote 4a708c37 --vault <vault>
```

产物是 `evals/cases/<id>.json`：

| 字段 | 含义 |
| --- | --- |
| `id` | `<prompt 摘要>-<turn 前 6 位>` |
| `source` | 来自哪条轨迹：`turn_id`、vault、时间、commit、当时的 error |
| `turns` | 多轮输入，按顺序发 |
| `fixture` | 一次性 Vault 的初始文件（`路径: 内容`） |
| `config` | 一次性 Vault 的 `ark.toml` 关键项（`readonly`、`auto_approve`），用来复现当时的世界 |
| `expected_behavior` | **给人看**的分步期望：该调哪个工具、该写出哪个文件 |
| `rubric` | **给机器判**的二元检查 |

`promote` 只自动生成能客观判定的部分。**「答得对不对」不会自动进 rubric**，需要人补一条 `file_contains` 或别的标准。这是「客观规则保下限、主观评审提上限」的直接落地：机器守流程，人守质量。

两件容易踩空的事，`promote` 已经处理好，但值得记下来，因为它们都是真实假失败：

- **`fixture` 只放这轮开始前就存在的文件。** 这轮自己写出来的产物（commit 里状态为新增的路径）必须排除，否则复跑时一开始就带着答案，`write mode=create` 直接失败。
- **`config` 要抄源 Vault 的 `readonly` 和 `auto_approve`。** 少这一项，只读目录的场景复跑时会变成可写世界——**通过了也说明不了问题**。

rubric 支持的检查全是二元的，失败按归因表映射：

| `check` | 语义 | 失败归因 |
| --- | --- | --- |
| `no_error` | 这轮没有 `ark.error` | 工具 / Skill 执行 |
| `called` | 调过这个工具（短名匹配 `mcp__…__search`） | 规划与路由 |
| `not_called` | 不该调 | 风险层 |
| `no_write` | 没发生任何写操作 | 风险层 |
| `file_exists` | Vault 里存在该文件 | 工具执行 |
| `file_contains` | 文件包含该子串 | 指令遵循 |
| `commit_touches` | 最后一次 commit 动了该路径 | 工具执行 |
| `commit_avoids` | 最后一次 commit 没碰这个前缀（如 `raw/`） | 风险层：写进了只读目录 |

**未知 `check` 一律判失败**并说明 `unknown check '…'`，不会静默通过。这条规则看着琐碎，却是门禁可信的前提：一个拼错的检查名如果被当作通过，整套用例就成了自我安慰。

二元 rubric 还有一个副作用是好的：可以用 `unknown` 的占比反过来检查**标准本身**是否合理。某条 rubric 反复产出说不清的结果，问题多半在 rubric 不在模型。

## 门禁：一个入口，一个退出码

```bash
python evals/gate.py                  # 手写用例 + 升格用例
python evals/gate.py --only loop      # 只跑升格用例（pre-push 用这个）
python evals/gate.py --strict --json gate-report.json
```

| 退出码 | 含义 |
| --- | --- |
| 0 | 全部通过，或者没有模型配置而跳过 |
| 1 | 有用例失败（打印 rubric 明细与归因） |
| 2 | 门禁本身没跑起来：`--strict` 下缺模型配置、套件名写错、`--filter` 没匹配到任何用例 |

接在两个地方：

- **pre-push**：`scripts/hooks/pre-push` 跑 `--only loop`，每次克隆装一次（`python scripts/install-git-hooks.py`）。跳过要显式做：`ARK_SKIP_EVALS=1` 或 `git push --no-verify`。
- **CI**：`evals` job 跑全量并把 `gate-report.json` 作为 artifact 上传。

### 为什么默认「缺 key 就跳过」

新克隆、fork、别人的电脑，没有模型 key。**没有钥匙的机器不该因为跑不了模型而判失败**，所以缺配置时门禁默认 `SKIP` 并退出 0。

代价是「绿，但什么也没证明」。这个代价必须可见，所以：

- 报告里标 `"skipped": true`；
- CI 读到就发 `::warning::`，让这种绿在 PR 里看得见；
- 想确认门禁真的跑过，本地用 `--strict`——缺配置直接退 2。

**`skipped` 与 `--strict` 是一对，不能只留一个。** 只留 `skipped`，绿会变成没人看的意义；只留 `--strict`，没 key 的人直接被挡在门外。

## 两个闭环怎么互相喂

1. 日常 Vault 里用出问题。
2. `ark trace list` 找到那一轮，`trace show` 看到底哪一步错了——没检索到？检索到没读？读了但忽略？
3. `promote` 成用例。此刻它是一条**失败用例**。
4. 按归因改：Skill 描述不清就改描述，提示词不够硬就改提示词，工具报错就修工具。
5. 跑到通过 → 这条用例永久留在 `evals/cases/`，以后任何改动都要过它。
6. 如果多次失败都指向同一条 rubric，那是**标准**的问题：改 rubric，不改 prompt。

## 已知边界

- **轨迹只覆盖 ark-agent 的回环。** Obsidian 面板那一轮有轨迹；Claude Code、DSH、Codex 直连 MCP 工具，不经过回环，**不产生 trace**。它们的证据只有 `ark/feedback.jsonl`（`via` 字段）和 commit 主体（`ark(<host>): …`）。要覆盖这条链路得把记录点下沉到 Core 的工具调用层——那会让 Ark 需要「轮次」这个概念，而且只能拿到「调了什么、返回什么」，**模型正文与推理仍不可见**。所以暂不做，等外部宿主真正常用、或出现一次「答错但无法归因」的实例再拍板。
- **不自动判定「答得好不好」。** 一条轨迹要不要变成标准由人决定；机器只守已经人定的那几条 rubric。
- **Core 内部（索引、检索打分、抽取）仍无日志。** 排查检索质量还需要单独加日志。
- **手工用例之间的耗时**：每个用例起一个真 server，一条 10–40 秒，串行跑。全量用例 5–10 分钟，`pytest` 半小时——所以分层的意义是给不同时机配不同深度，不是所有检查都在每次提交时跑完。
- **成熟度自评**：观测层大约 L2，评测集与门禁还在 L1，在线评测 L0。下一步性价比排序是「进 CI 的回测门禁」>「黄金集/错题集分层」>「在线失败自动入池」。这份自评写的当下，第一项已经做完，后两项没做。
