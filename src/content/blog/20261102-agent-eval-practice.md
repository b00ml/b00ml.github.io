---
title: 'Agent 评测是实践科学：先转飞轮，再谈指标'
description: '读美团图灵团队的评测长文：评测对象怎么变了，客观与主观怎么搭，Rubric 怎么二元化，基建七件事与 L0–L3 成熟度，以及为什么 Bad Case 比精妙的指标体系值钱。'
pubDate: 2026-11-02
tags: ['agent', '评测', '方法论']
---

> 读[《Agent评测漫谈 —— 由浅入深讲解Agent评测》](https://mp.weixin.qq.com/s/gZKWRqznB8sNBFf69fBIvw)（美团图灵团队 · 公众号），把能搬进个人项目的部分搬出来：评测对象怎么变了，客观与主观怎么搭，主观标准怎么对齐，以及为什么 Bad Case 比精妙的指标体系值钱。

<div class="callout"><span class="lbl">TL;DR</span><p>评测的对象已经不是「回答」，而是「模型 + 系统 + 工具 + 流程」的任务系统。<span class="mark">客观保下限、主观提上限；主观给标准，客观做放大。</span>而体系不是一次设计出来的，是被 Good Case 和 Bad Case 喂出来的——这条对一个人维护的项目同样成立。</p></div>

## 01 · 评测的对象变了：从「说得好不好」到「事办成没有」

评测方法跟着 AI 的形态走。传统机器学习回答「算得准不准」，大模型评测回答「模型能力强不强」，Agent 评测要回答的是另一个问题：当模型被放进一个真实系统里，和 Prompt、Skill、工具链、记忆、状态管理、业务流程耦合在一起后，**能不能稳定交付好的结果**。评测对象不再是单一模型，而是一个「模型 + 系统 + 工具 + 流程」的复杂系统。

它带来一个容易忽视的推论：两个 Agent 可能最终都「做对了」，工程价值却完全不同。一个路径清晰、工具调用稳定、耗时可控、可复现；另一个反复试错、路径混乱、靠偶然命中、不可复现。只看最终答案，这两者会被误判成同一水平。所以评测至少要盖住四层：**结果层**（任务是否完成、输出是否可用）、**过程层**（规划是否合理、步骤是否稳定）、**效率层**（耗时、Token、调用次数）、**风险层**（越权、误操作、数据外发）。

<figure class="fig" data-anim>
<svg viewBox="0 0 720 236" role="img" aria-label="短程 Agent 评测 Query 到 Answer，长程 Agent 评测 Prompt、Trace 与 Expected Behavior 的三元组">
<defs><marker id="ah1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1L9 5L0 9z" style="fill:var(--primary)"/></marker></defs>
<g class="rise" style="--at:0s"><text class="t-dim" x="28" y="59" text-anchor="start">短程</text><rect class="s-node" x="90" y="30" width="120" height="50" rx="10"/><text class="t-ink" x="150" y="60" text-anchor="middle">Query</text><path class="s-ink draw" pathLength="1" style="--at:.25s" d="M210 55H290" marker-end="url(#ah1)"/><rect class="s-node" x="300" y="30" width="120" height="50" rx="10"/><text class="t-ink" x="360" y="60" text-anchor="middle">Answer</text><text class="t-dim fade" style="--at:.7s" x="450" y="60" text-anchor="start">只看回答质量</text></g>
<g class="rise" style="--at:.4s"><text class="t-dim" x="28" y="173" text-anchor="start">长程</text><rect class="s-node" x="90" y="144" width="120" height="50" rx="10"/><text class="t-ink" x="150" y="174" text-anchor="middle">Prompt</text><path class="s-acc draw" pathLength="1" style="--at:.65s" d="M210 169H292" marker-end="url(#ah1)"/><rect class="s-node-acc" x="300" y="144" width="200" height="50" rx="10"/><text class="t-acc" x="400" y="174" text-anchor="middle">Trace（全过程）</text><path class="s-acc draw" pathLength="1" style="--at:.95s" d="M500 169H552" marker-end="url(#ah1)"/><rect class="s-node" x="560" y="144" width="130" height="50" rx="10"/><text class="t-ink" x="625" y="174" text-anchor="middle">Expected</text><text class="t-dim fade" style="--at:1.4s" x="360" y="226" text-anchor="middle">结果层 · 过程层 · 效率层 · 风险层，四层都要打分</text></g>
</svg>
<figcaption><span><b>图 1</b>短程评「说得好不好」，长程评「事办成没有、怎么成的」——Trace 成为评测对象本身（示意图）。</span><button class="replay" type="button">重播</button></figcaption>
</figure>

<p class="pull">ChatAgent 评测关心「说得好不好」，长程 Agent 评测关心「事情做成没有，以及是怎么做成的」。</p>

## 02 · 指标要搭桥，观测是基石

Agent 评测最难的一处，是模型能力指标和业务结果指标之间有天然鸿沟，两类指标不能直接映射，中间必须有一层面向任务系统的桥梁指标。原文给的分层思路：

<div class="table-wrap"><table>
<thead><tr><th>层级</th><th>关注问题</th><th>示例指标</th></tr></thead>
<tbody>
<tr><td>业务目标层</td><td>是否创造业务价值</td><td>DAU、留存、转化、人工节省时长、完单率</td></tr>
<tr><td>Agent 能力层</td><td>是否把用户任务做成、是否稳定</td><td>任务完成率、一次成功率、规划合理率、Tool/Skill 调用成功率、纠错成功率</td></tr>
<tr><td>模型能力层</td><td>基座能力是否足够支撑</td><td>推理、指令遵循、检索、长文本、代码能力</td></tr>
</tbody>
</table></div>

以 AI 搜索为例：业务关心 DAU 和留存，搜索系统关心召回和点击，Agent 层关心意图识别准不准、检索有没有效、结果整合可不可信。只有把三层串起来，才答得出「为什么业务指标变差」和「模型能力提升为什么没带来业务收益」。

而这一切的地基是观测。**看不见的问题，几乎不可能被稳定解决。**如果日志系统只能看到「用户说了什么」和「最后回了什么」，Case 复现都做不到，归因无从谈起。原文给的公式很朴素：观测 + 评测 = 持续迭代。

<figure class="fig" data-anim>
<svg viewBox="0 0 720 244" role="img" aria-label="业务目标层与模型能力层之间由 Agent 能力层搭桥">
<defs><marker id="ah2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1L9 5L0 9z" style="fill:var(--primary)"/></marker></defs>
<g class="rise" style="--at:0s"><rect class="s-node" x="140" y="20" width="440" height="50" rx="10"/><text class="t-ink" x="360" y="50" text-anchor="middle">业务目标层 —— DAU · 留存 · 转化</text></g>
<g class="rise" style="--at:.4s"><path class="s-acc draw" pathLength="1" style="--at:.4s" d="M360 70V94" marker-end="url(#ah2)"/><rect class="s-node-acc" x="140" y="100" width="440" height="50" rx="10"/><text class="t-acc" x="360" y="130" text-anchor="middle">Agent 能力层 —— 完成率 · 纠错成功率</text></g>
<g class="rise" style="--at:.8s"><path class="s-acc draw" pathLength="1" style="--at:.8s" d="M360 150V174" marker-end="url(#ah2)"/><rect class="s-node" x="140" y="180" width="440" height="50" rx="10"/><text class="t-ink" x="360" y="210" text-anchor="middle">模型能力层 —— 推理 · 遵循 · 检索</text></g>
<g class="fade" style="--at:1.2s"><path class="s-dim" d="M620 45C690 45 690 205 620 205"/><path class="s-dim" d="M636 117l16 16M652 117l-16 16"/><text class="t-dim" x="640" y="92" text-anchor="middle">不能</text><text class="t-dim" x="640" y="162" text-anchor="middle">直配</text></g>
</svg>
<figcaption><span><b>图 2</b>业务指标和模型指标对不上号，中间必须有一层面向任务的桥——靠真正懂业务流程的人一起建。</span><button class="replay" type="button">重播</button></figcaption>
</figure>

## 03 · 客观保下限，主观提上限

Agent 评测大量借鉴大模型评测的方法论，拆成客观和主观两条线。原文的对照表：

<div class="table-wrap"><table>
<thead><tr><th>维度</th><th>客观评测</th><th>主观评测</th></tr></thead>
<tbody>
<tr><td>目标定位</td><td>规则清晰、可自动化、可规模执行，保下限</td><td>判断「好不好」，提上限</td></tr>
<tr><td>典型问题</td><td>调对 Tool 了吗？格式对吗？答案对吗？</td><td>真解决问题了吗？规划合理吗？交互自然可信吗？</td></tr>
<tr><td>常用方法</td><td>Rule based / Ground truth based eval</td><td>Rubric based eval（打分 rubric）</td></tr>
<tr><td>局限</td><td>上限不高，测不到「质量感」</td><td>标准难建难统一；人工贵</td></tr>
</tbody>
</table></div>

落地的三段式组合：**高频、结构化、可规则化的部分交给客观评测自动跑**（工具对不对、字段格式、参数取值）；**开放性、高价值的复杂场景由主观评测兜底**（多步规划合不合理、输出能不能直接拿去用）；最关键的一步是**用主观评测去校准客观评测和 AI 评测，校准完再把规模化的部分交回自动化**。

这条对个人项目一点不远。我在自己的评测记录里给三批证据分过层：工程批跑通链路、模拟批证明合同、真实批才算体验——模拟批的报告里明确写着 <code>human_calibrated=false</code>，它证明合同，不证明质量。这不是我发明的措辞，只是把「主观给标准」这件事诚实写下来。

## 04 · 把「好不好」拆成「是不是」

评测实践里真正困难的不是「没有人会评」，而是「不同的人评得不一样，机器和人评得也不一样」。原文给的解法概括成两句话：**人人一致、人机一致**。

- **人人一致：1 个「独裁者」好过 10 个「民主者」。**要有一位强有力的角色拉齐产品、运营、研发、QA 的评测标准，评测员之间背靠背标注拉齐，避免各自为政。
- **人机一致：机器评测结果要和人工保持一致，否则不置信。**它的意义在规模化提效——校准过的机评才能接走更大的流量。

对齐的具体动作是三步：**指标下钻**（把「大而模糊」拆成清晰维度）→ **Rubric 二元化**（收敛成是 / 否 / 未知）→ **持续迭代**（用 unknown 占比反查 Rubric 定义是否合理，直到人人一致率、人机一致率达到可信阈值，比如 85%、90%）。数字站长靠这套方法把人机一致率做到 99%；Beam 改造后从 62% 提到 92%。

<div class="replies">
<figure class="reply"><blockquote>经典错误示范 —— 请判断大模型的回答是否口语化，并按照 0 到 10 分打分。</blockquote><figcaption><span class="tag">下钻前</span><span class="who">骑手外呼场景</span>：一个谁都能打、谁都打不一样的模糊分。</figcaption></figure>
<figure class="reply"><blockquote>模型是否以「您」指代骑手；模型是否使用「甭客气」「明儿见」等口语交流词汇；模型输出是否包含「吧」「呢」「那个」等语气词。</blockquote><figcaption><span class="tag pro">下钻后</span><span class="who">同一场景</span>：三条二元判据，人和机器照着勾就行。</figcaption></figure>
</div>

顺带厘清一对容易混的概念：**标注是一种动作，评测是一套目标导向的判断流程。**机器预标注可以帮助人工提效，但只有在人机一致率有保障时才配叫自动化评测——否则只是机器标注。

「独裁者」听着危险，原文在 FAQ 里回应过：评测目标本身是被真实业务里的 Bad Case / Good Case 驱动演进的，独裁者的价值更多体现在拉齐标准，避免评测体系分化带来的内耗。

## 05 · 飞轮先转起来，体系喂出来

从执行链路看，评测拆成五个环节：**采集 → 清洗 → 评测 → 质检 → 分析/归因**，与线上 AB、持续观测一起构成数据飞轮。绝大部分新团队的误区是在这里：多方调研、设计一套复杂精妙的指标体系——而越复杂的指标越难执行、越难对齐。

<figure class="fig" data-anim>
<svg viewBox="0 0 720 300" role="img" aria-label="采集清洗评测质检归因构成数据飞轮">
<defs><marker id="ah3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1L9 5L0 9z" style="fill:var(--primary)"/></marker></defs>
<g class="rise" style="--at:0s"><rect class="s-node-acc" x="304" y="14" width="112" height="42" rx="10"/><text class="t-acc" x="360" y="41" text-anchor="middle">采集</text></g>
<g class="rise" style="--at:.2s"><rect class="s-node" x="194" y="93" width="112" height="42" rx="10"/><text class="t-ink" x="250" y="120" text-anchor="middle">清洗</text></g>
<g class="rise" style="--at:.4s"><rect class="s-node" x="236" y="222" width="112" height="42" rx="10"/><text class="t-ink" x="292" y="249" text-anchor="middle">评测</text></g>
<g class="rise" style="--at:.6s"><rect class="s-node" x="372" y="222" width="112" height="42" rx="10"/><text class="t-ink" x="428" y="249" text-anchor="middle">质检</text></g>
<g class="rise" style="--at:.8s"><rect class="s-node" x="413" y="93" width="112" height="42" rx="10"/><text class="t-ink" x="469" y="120" text-anchor="middle">归因</text></g>
<g><path class="s-acc draw" pathLength="1" style="--at:.5s" d="M316 67L285 89" marker-end="url(#ah3)"/><path class="s-acc draw" pathLength="1" style="--at:.7s" d="M268 166L283 202" marker-end="url(#ah3)"/><path class="s-acc draw" pathLength="1" style="--at:.9s" d="M352 243H368" marker-end="url(#ah3)"/><path class="s-acc draw" pathLength="1" style="--at:1.1s" d="M442 193L454 150" marker-end="url(#ah3)"/><path class="s-acc draw" pathLength="1" style="--at:1.3s" d="M424 75L395 48" marker-end="url(#ah3)"/><circle class="s-pkt flow" r="5" style="--at:1.6s;offset-path:path('M360 35L251 114L292 243L428 243L469 114Z')"/></g>
<g class="fade" style="--at:1.5s"><text class="t-acc" x="360" y="140" text-anchor="middle">数据飞轮</text><text class="t-dim" x="360" y="168" text-anchor="middle">Bad Case 喂养</text></g>
</svg>
<figcaption><span><b>图 3</b>五环节 + 线上 AB + 持续观测构成飞轮；起步阶段让它转起来，比设计精妙体系更重要（示意图）。</span><button class="replay" type="button">重播</button></figcaption>
</figure>

原文的判断很直接：**起步阶段「让数据飞轮高效运转起来」的意义远大于「设计一个复杂精妙的评测体系」**。体系是被 Case 喂出来的——履约数字站长项目启动时只有 20 多个指标，一年推全之后扩展到近 200 个。Bad Case 的价值往往更高，因为它最容易暴露能力边界和系统短板；Good Case 的作用是定义「好」的范式。

体系怎么长出来？原文给的最佳实践路径是六步，秩序感很强——先让飞轮转起来，每转一圈沉淀一层：

<ol class="steps">
<li><strong>从高频核心场景起步</strong>，先定义少量关键指标，不求全。</li>
<li><strong>从生产环境收集 Bad Case</strong>——它最容易暴露能力边界和系统短板。</li>
<li><strong>沉淀高质量 Good Case</strong>，明确这个场景里「好」的范式长什么样。</li>
<li><strong>把 Good / Bad Case 转成标准评测样本</strong>，进回归集。</li>
<li><strong>用评测结果反哺优化</strong>——Prompt、Skill、策略、模型，归哪层修哪层。</li>
<li><strong>从新的线上表现持续抽样</strong>，形成下一轮迭代。</li>
</ol>

第五步里「归哪层修哪层」，靠的就是归因表。原文把 Bad Case 的归因拆成两个 Loop、七个层级——六个归 Agent 迭代，一个归评测迭代自己：

<div class="table-wrap wide"><table>
<thead><tr><th>归因分类</th><th>归因层级</th><th>典型表现</th><th>修复动作</th><th>责任方</th></tr></thead>
<tbody>
<tr><td>Agent 迭代 Loop</td><td>意图理解</td><td>用户要的是环比，做成了同比</td><td>调 Prompt、补 few-shot、澄清追问策略</td><td>Agent 研发</td></tr>
<tr><td>Agent 迭代 Loop</td><td>规划与路由</td><td>该调两个 Skill 只调了一个；步骤顺序颠倒</td><td>优化任务拆解、修正 Skill 描述</td><td>Agent 研发</td></tr>
<tr><td>Agent 迭代 Loop</td><td>工具/Skill 执行</td><td>参数传错、返回数据解析失败</td><td>修 Skill 实现、补参数校验</td><td>Skill 开发者</td></tr>
<tr><td>Agent 迭代 Loop</td><td>上下文与记忆</td><td>长链路后忘了用户最初的约束</td><td>优化上下文压缩、引入结构化状态</td><td>Agent 研发</td></tr>
<tr><td>Agent 迭代 Loop</td><td>知识与数据</td><td>指标口径理解错、检索到过期文档</td><td>更新知识库、修正检索策略</td><td>知识运营</td></tr>
<tr><td>Agent 迭代 Loop</td><td>基座模型能力</td><td>复杂推理确实做不对，换模型后消失</td><td>升级模型、任务降维、引入专家知识</td><td>算法</td></tr>
<tr><td>评测迭代 Loop</td><td>评测标准本身</td><td>Agent 做法其实合理，是 Rubric 定义有偏</td><td>修正 Rubric、更新评测集</td><td>评测负责人</td></tr>
</tbody>
</table></div>

最容易被忽略的是最后一行：**Agent 的做法其实合理，是 Rubric 定义有偏**。归因归到评测标准自己头上，同样要开单修。个人版的好处是七个「责任方」全是我，坏处也是。

## 06 · 长程 Agent 评测：Task 三元组与一票否决

长程 Agent 解决的不是「回答一个问题」，而是「完成一个复杂任务」：任务要多步骤拆解，执行中要多次调用 Tool 或 Skill，还要读中间结果动态调整策略。评测的抓手是 Task——按 Anthropic 的定义，**具有明确输入和成功标准的单个测试**。综合开源实践简化后，一次评测拿到的是 <code>prompt - expected_behavior - trace</code> 三元组，正好对应短程时代的 <code>query - ground_truth - answer</code>：prompt 定义诉求，expected behavior 定义预期行为，trace 记录真实执行路径。有了三元组，长程评测就能像短程一样批量跑。

评测集里的一个 Task 长什么样？原文给了一个商家经营分析的示例，字段值得照抄：

<div class="table-wrap"><table>
<thead><tr><th>字段</th><th>示例（商家经营分析）</th></tr></thead>
<tbody>
<tr><td>初始环境</td><td>工作目录已存在 <code>门店数据.csv</code>；已配置商家账号权限；投放数据 Skill 可用</td></tr>
<tr><td>prompt</td><td>结合门店数据和上月投放数据，帮我制作门店经营分析 PPT</td></tr>
<tr><td>expected behavior</td><td>调用投放 Skill 取数并存 CSV；结合两份数据调用经营分析 Skill 出 PPT</td></tr>
<tr><td>结果层 Rubric</td><td>产出 <code>.pptx</code>（必过）；投放金额与源数据一致（必过）；含同比/环比分析（加分）</td></tr>
<tr><td>效率与安全 Rubric</td><td>总耗时 5 分钟内；<strong>未经确认的写操作或数据外发——一票否决</strong></td></tr>
</tbody>
</table></div>

这张表里最硬的一条在最后：**未经确认的写操作或数据外发，一票否决。**结果层 Rubric 决定任务成没成，效率与安全层 Rubric 决定这个结果能不能要——两层都过，才算真过。

## 07 · 从打分动作到基础设施：七件事与四级台阶

原文最后把话题抬了一层：如果评测要支撑大规模的 Agent 和 Skill 生态，它就不能停在「单次分析」和「项目制支持」，得成为生产系统的一部分。基建至少七件事：

- **全链路回放**：复现一次任务从输入到结果的全过程；
- **Case 管理**：统一维护任务样本、上下文、约束和 Rubric；
- **执行沙箱**：按只读、可写、高风险分层隔离执行；
- **AI 评测引擎**：Rubric 驱动的人机对齐与自动判分，且要简单到 Skill 生产者愿意接入；
- **报告与归因**：不仅给分，还指出问题出在规划、工具、环境还是 Skill；
- **回归机制**：版本升级后自动触发历史 Case 回归；
- **准入准出门禁**：把评测结果嵌进开发、发布和运营流程。

和七件事配套的，是一张成熟度分级表。它的用法不是当 KPI，是拿来自查「我卡在哪一级、下一级差什么」：

<div class="table-wrap wide"><table>
<thead><tr><th>维度</th><th>L0 起始</th><th>L1 冷启动</th><th>L2 成型</th><th>L3 自进化</th></tr></thead>
<tbody>
<tr><td>观测</td><td>全靠人肉翻日志</td><td>完整 Trace，可人工回放</td><td>结构化埋点，自动提取</td><td>含环境快照，自动判定 outcome</td></tr>
<tr><td>评测集</td><td>没有固定评测集</td><td>端到端种子集，人工维护</td><td>分层评测集，含黄金集与错题集</td><td>线上 Case 自动回流，版本化</td></tr>
<tr><td>评测标准</td><td>凭感觉判断</td><td>有 Rubric</td><td>Rubric 二元化，人人一致率达标</td><td>人机一致率达标，机评规模化</td></tr>
<tr><td>回测门禁</td><td>不做回测</td><td>发版前手工跑一次</td><td>回测自动化，分层门禁</td><td>嵌入 CI/CD，不过不发布</td></tr>
<tr><td>在线评测</td><td>无</td><td>人工抽查</td><td>周期性巡检，含报警</td><td>巡检 + AB + 影子模式</td></tr>
<tr><td>在线监控</td><td>无</td><td>基础成功率指标</td><td>成本、行为分布多维指标</td><td>与版本/AB 打通，自动归因</td></tr>
<tr><td>Case 挖掘</td><td>靠用户投诉</td><td>有 Bad Case 收集渠道</td><td>四类来源齐备，有 Case 池</td><td>自动挖掘 + 分类入池</td></tr>
<tr><td>归因</td><td>不做归因</td><td>人工逐条分析</td><td>归因分层与例会机制</td><td>机器辅助归因，结论自动分派</td></tr>
</tbody>
</table></div>

<p class="pull">看得见问题、说得清标准、跑得动规模、接得上流程、带得动迭代。</p>

## 08 · 落到一个人的项目里

这套方法论是大厂语境的，但拆到个人尺度，我发现每一块都有一个「穷人版」，而且惊人地成立：

<ol class="steps">
<li><strong>独裁者天然收敛为时间轴上的自己。</strong>单人团队没有「民主者」要对齐，新的风险是三个月后的自己悄悄推翻标准还不留记录——所以 Rubric 要版本化，改动写原因。</li>
<li><strong>二元化照样是省力杠杆。</strong>「这次跑得好不好」没法回答，「PPT 文件产出了没、金额和源数据一致没」可以。unknown 占比照样反查我自己定义得糊不糊。</li>
<li><strong>飞轮的最小形态是三条记录。</strong>一条真实 Bad Case、一条从中提炼的二元 Rubric、一个跑历史 Case 的回归脚本。有这三样，体系就在长了。</li>
<li><strong>门禁就是评测的出口。</strong>我的发布门禁 G0 现在是 NOT PASSED——不是哪项挂了，是群聊和真实重启还没验。门禁不放行本身，就是这套证据体系的输出。</li>
</ol>
