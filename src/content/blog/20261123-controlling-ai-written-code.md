---
title: '我是怎么管住 AI 写生产代码的：领域词表、测试接缝与双轴审查'
description: '直接让模型改代码，坏的往往不是语法，是意图。五道锁：GLOSSARY 锁死领域概念、Spec 锁一个高层测试接缝、隔离工作树、垂直切片 TDD、Standards 与 Spec 双轴独立审查——以及一个被构建完整放过、只被源码契约测试抓住的真实失效。'
pubDate: 2026-11-23
tags: ['agent', 'ai-engineering', '工程']
featured: true
featuredOrder: 1
---

> 让模型改代码，最坏的结果不是它写错，是它写对了你没要的那件事，而且没有任何东西报警。这篇是我在自己几个仓库里反复调过的一套控场方法：五道锁，每道锁对应一种具体的失败模式。

<div class="callout"><span class="lbl">TL;DR</span><p>模型的输入是一句意图，输出是一段代码，中间没有契约——这中间缺的那层就是全部风险所在。<span class="mark">词表管「说的是不是同一件事」，接缝管「怎么算做完了」，工作树管「改动落在哪里」，TDD 管「顺序对不对」，双轴审查管「做完的和要的是不是同一个东西」。</span>五道锁都拦不住的，只有一种情况：你的规格本身就是错的。</p></div>

## 01 · 直接让模型改代码，坏在哪儿

先说清楚失败长什么样，因为它不像"代码写错了"那么显眼。

第一种是**意图漂移**。你说"把这个列表按时间倒序"，它顺手把分页也改了、把空状态文案也换了，因为那些在它看来属于"让这段更完整"。语法上全对，编译通过，测试也通过——通过的是原来那批测试，只是它们没管分页。

第二种是**静默退化**。改动落下去，构建绿、类型检查 0 error、页面能打开。行为变了，但没有任何一个环节会因此报错。这类失效最贵，因为发现它的人是一周后的用户，或者三个月后的你自己。

两种失败同一个根因：模型拿到的输入是一句人话意图，产出是一段满足这句话的代码，中间那层"这段代码承诺了什么、怎么验证这个承诺"是空的。人在 review 的时候是唯一的闸门，而 review 看的是 diff——diff 越大越 review 不动，于是大的改动反而审得最松。

所以要做的不是"写更好的提示词"，是**在意图和代码之间插入几层可验证的东西**。我这儿有五道。

<figure class="fig" data-anim>
<svg viewBox="0 0 720 384" role="img" aria-label="五道锁依次拦下模型改动的不同失败模式">
<defs><marker id="ah1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1L9 5L0 9z" style="fill:var(--primary)"/></marker></defs>
<g class="rise" style="--at:0s"><rect class="s-node-acc" x="140" y="10" width="440" height="42" rx="10"/><text class="t-acc" x="360" y="37" text-anchor="middle">一次模型改动：一段 diff + 一句意图</text></g>
<g class="rise" style="--at:.25s"><path class="s-acc draw" pathLength="1" style="--at:.25s" d="M360 52V70" marker-end="url(#ah1)"/><rect class="s-node" x="20" y="74" width="680" height="42" rx="10"/><text class="t-ink" x="36" y="101">① GLOSSARY 锁死领域概念</text><text class="t-dim" x="684" y="101" text-anchor="end">拦：同词异义</text></g>
<g class="rise" style="--at:.45s"><path class="s-acc draw" pathLength="1" style="--at:.45s" d="M360 116V134" marker-end="url(#ah1)"/><rect class="s-node" x="20" y="138" width="680" height="42" rx="10"/><text class="t-ink" x="36" y="165">② Spec 锁死一个高层测试接缝</text><text class="t-dim" x="684" y="165" text-anchor="end">拦：事后才发现没做完</text></g>
<g class="rise" style="--at:.65s"><path class="s-acc draw" pathLength="1" style="--at:.65s" d="M360 180V198" marker-end="url(#ah1)"/><rect class="s-node" x="20" y="202" width="680" height="42" rx="10"/><text class="t-ink" x="36" y="229">③ 隔离工作树</text><text class="t-dim" x="684" y="229" text-anchor="end">拦：顺手改动不相干文件</text></g>
<g class="rise" style="--at:.85s"><path class="s-acc draw" pathLength="1" style="--at:.85s" d="M360 244V262" marker-end="url(#ah1)"/><rect class="s-node" x="20" y="266" width="680" height="42" rx="10"/><text class="t-ink" x="36" y="293">④ 垂直切片 TDD</text><text class="t-dim" x="684" y="293" text-anchor="end">拦：先写完再补测试</text></g>
<g class="rise" style="--at:1.05s"><path class="s-acc draw" pathLength="1" style="--at:1.05s" d="M360 308V326" marker-end="url(#ah1)"/><rect class="s-node" x="20" y="330" width="680" height="42" rx="10"/><text class="t-ink" x="36" y="357">⑤ Standards × Spec 双轴独立审查</text><text class="t-dim" x="684" y="357" text-anchor="end">拦：测试过了但事做错了</text></g>
</svg>
<figcaption><span><b>图 1</b>五道锁按顺序落，越靠前越便宜：词表和接缝是一次性成本，审查是每次都付的成本（示意图）。</span><button class="replay" type="button">重播</button></figcaption>
</figure>

## 02 · 第一道锁：领域词表把概念钉死在一个文件里

这是最便宜也最有效的一道，但大多数仓库没有。

领域词表（`GLOSSARY.md`）做的事只有一件：写清楚**这个词在这个仓库里指什么、不指什么**，并且把常见的替代词明确标成禁用。本仓库的词表里，`文章` 后面跟着一句 `_Avoid_: 帖子, 笔记, 文档`；`项目` 的定义是"由作者实际构建、具备可运行工程代码库与自动化验证体系的完整软件系统作品"，后面同样跟一串 `_Avoid_: 课题作业, 方案推演, 概念稿, 文章`。

为什么这条对模型特别重要？因为模型读不到你脑子里的区分，但它**会**读仓库里的 Markdown。词表一旦落成一个文件，命名、测试名、提交信息、界面文案会在同一轮里一起对齐；词表不落文件，同一个概念就会在四个地方长出四个名字，然后你还得靠 review 去发现它们不是一回事。

我踩过的具体形态是这样的：一个知识工作台项目里，"笔记"同时指三样东西——磁盘上的 Markdown 文件、一次对话产生的中间结果、用户手动收藏的一条外部链接。三者混用一个词时，模型很乐意在一个函数里接受 `note`，而这个 `note` 有时是路径、有时是对象、有时是字符串。它没写错，它只是不知道这是三个东西。

词表还有第二个作用，是给审查一个客观的判据。Standards 那一轴最怕的评论是"我觉得这个命名不好"；有了词表，同样的评论变成"这个词在词表里是另一个意思"，可执行、可讨论、可关闭。

## 03 · 第二道锁：Spec 阶段锁死一个高层测试接缝

第二道锁的关键是**先约定从哪儿观察行为，再动手**。

"接缝"这个词我在两个意义上用：既指代码里那个可以被替换的边界，也指测试里那个可以观察到对外行为的入口。这两个是同一个决定的两面。规格阶段要回答的不是"这段代码怎么写"，而是"这件事做完了，我从哪一行断言"。

选接缝有一条硬规矩：**选对外行为，不选内部结构**。可接受的接缝是纯函数的入参和返回值、状态机的动作和状态、一个 API 路由的响应体；不可接受的是内部 DOM 选择器、组件私有标记、样式类名的排列。前者的断言在重构之后依然成立，后者的断言会在你换一个类名时全部失败——然后你就开始删测试，闸门就这么消失了。

举个具体的：这个站点做首页策展时，真正有意义的接缝不是"精选区渲染了四张卡片"，而是 `buildHomeViewModel({ projects, blog, product, notes, isProd })` 这个纯函数返回的 `featuredWriting` 顺序。前一种断言会被任何排版调整打破，后一种断言只会在策展规则真的变了时失败。所以那批测试断言的是 href 和 collectionLabel 的序列，不是 class。

规格里还要写清楚**这一轮不做什么**。模型天然倾向于把相邻的、看起来相关的坑一起填掉，那是它的优点，也是意图漂移的主要来源。明确写下"不动分页""不改空状态文案"，比写三倍的"请只做这件事"有用。

## 04 · 第三道锁：一个 ticket 一棵工作树

这道锁不防模型，防的是连锁污染。

模型的"顺手清理"是真实存在的：改 A 的同时格式化 B、把 C 里一个它认为没用的变量删掉。在同一个工作树里，这些改动和你自己的未提交改动混在一起，你连"哪些是这个 ticket 干的"都说不清，更不用说干净地回退。

做法很朴素：一个 ticket 一个独立工作树，开工前先确认三件事——分支的 merge-base 是预期的祖先、工作树干净、锁文件已装好。不满足就先对齐，不动代码。

隔离真正的价值在于**失败可以整棵扔掉**。当一轮改动方向就错了，你不需要在 diff 里逐块挑拣往回退，直接丢掉整棵树，重开一棵。这个动作在同一个工作树里几乎做不到，因为你的其他工作也在里面。

## 05 · 第四道锁：垂直切片 TDD，不是"先写一整套测试"

这条我要说得重一点，因为它最容易被做反。

TDD 的循环是红→绿：写一个失败的测试，然后只写让**它**通过的最小实现，再进下一个。这里的关键词是"一个"。每次循环只推进一个可观察的行为，所以你在写第二个测试的时候，已经知道了第一个实现长什么样——测试不是凭空想象的。

反过来的做法是**水平切片**：先把整套测试写完，再写实现。这种方式在人工开发里就已经很难受了，在模型协作里几乎必然失败，原因有两个。第一，模型一次能吐很多，于是那批测试验证的是它**想象中**的接口形状，而不是它将要实现的接口形状；你会在实现阶段发现一半的测试在测不存在的东西，然后被迫改测试去迁就实现。第二，水平切片会让人提前锁定测试结构，而那时你还没理解实现，结构一旦锁错，后面每一步都在跟它较劲。

我在同一个仓库里连着做过两轮，第二轮的结论很清楚：切片越薄，模型跑偏的空间越小。一个切片结束时，新测试必须是为这个切片写的、并且先红后绿；如果报告里说不清"哪个测试先失败、失败成什么样"，那这一轮不算过。

报告的真实性也要区分。`234 pass` 和"我先看到这 3 个 fail，改完变 234 pass"是两种证据。前者只说明当下是绿的，后者说明你确实经过了红。

## 06 · 一个被构建完整放过的失效

现在讲那道最贵的锁为什么必须存在，用一次真实的失效说明。

背景：这个站点的样式只跑 UnoCSS 的 `presetMini` + `presetTypography`，**没有** `presetWind3`。这意味着完整 Tailwind 调色板和那一堆便捷工具类在这个仓库里根本不存在。`space-y-*`、`tabular-nums`、`line-clamp-*`、`text-red-500`、`text-bgColor` 这些写在模板里都不会产出任何 CSS。

失效是这样发生的：一次排版微调，模型给一个容器加了 `space-y-4`——在它见过的绝大多数项目里这是标准写法。构建成功，类型检查 0 error，页面正常打开，退出码 0。没有任何一条日志提到这个类名。你在浏览器里看到的只是"间距有点小，大概是我的错觉"。

为什么构建抓不到？因为 UnoCSS 是扫描式的：扫到一个不认识的类名就跳过，不认识的类名不是错误，是"没有规则"。这类失效的形态特别恶劣——它不报错、不告警、不影响构建，唯一的症状是视觉上和预期差一点点，而人对"差一点点"的容忍度极高。

真正抓住它的是一条源码契约测试：一条正则扫 `src/` 下所有 `.astro` / `.ts` 文件，命中 `\bspace-[xy]-\d+\b` 就 fail，同一份清单里还有 `tabular-nums`、`line-clamp-\d+`、`text-red-500`、`text-bgColor`。断言不看渲染结果，只看**源码里不许出现这个字符串**。

这次失效教给我的东西，比五道锁的其他部分加起来都多：**能被"没有 CSS"这种方式静默失败的改动，不能靠构建兜底。**构建验证的是"代码能编译"，不是"样式生效"；唯一稳定的兜底是把那个已知会静默失效的写法变成一条禁止出现的字符串。这条测试也顺带解释了双轴审查的必要——它属于 Standards 轴（仓库已写下的规矩：只能用语义 token 类名），不属于 Spec 轴（ticket 并没有要求"修好间距"）。

同类的东西我这个仓库里还有几条：导航首项必须是 `项目` 且全中文、`footer.credits` 必须为 `false`、某篇压测版式的示例文章必须保持 `draft: true`、已退役的英文界面文案不许再出现。它们全都是"违反了不会报错，只会悄悄变差"的那一档。

## 07 · 第五道锁：Standards 和 Spec 分开跑

最后一道锁是最容易被糊弄过去的，因为它是唯一一道要花人的时间的。

**Standards 轴**问：这份代码遵守仓库已经写下的规矩吗？缩进、引号、导入顺序、提交信息格式、`AGENTS.md` 里的结构约定、`DESIGN.md` 里的动效与间距配方、上面那批禁用类名。

**Spec 轴**问：它做了 ticket 要求的事吗？不看实现优不优雅，只对着 ticket 的验收条件逐条核。

两轴必须**分开跑、分开出结论**。合起来跑的失效方式很稳定：reviewer 一边看 diff 一边想"这代码挺干净"，然后"干净"这个感受悄悄替代了"事情做对了"这个判断。反过来也一样，一份实现得很糙但确实做对了的改动，会在合并审查里被当成没做完。

两轴跑完，结果只有一格允许合并：

<figure class="fig" data-anim>
<svg viewBox="0 0 720 300" role="img" aria-label="规范与规格两轴审查的四种结果，只有两轴都过才允许合并">
<defs><marker id="ah2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1L9 5L0 9z" style="fill:var(--primary)"/></marker></defs>
<g class="rise" style="--at:0s"><rect class="s-node-acc" x="364" y="54" width="322" height="132" rx="10"/></g>
<g class="rise" style="--at:.35s"><path class="s-acc draw" pathLength="1" style="--at:.35s" d="M360 292V50" marker-end="url(#ah2)"/><path class="s-acc draw" pathLength="1" style="--at:.35s" d="M56 190H692" marker-end="url(#ah2)"/></g>
<g class="rise" style="--at:.7s"><text class="t-ink" x="360" y="40" text-anchor="middle">规格（Spec）通过</text><text class="t-dim" x="700" y="208" text-anchor="end">规范（Standards）通过</text><text class="t-acc" x="525" y="106" text-anchor="middle">两轴都过</text><text class="t-dim" x="525" y="132" text-anchor="middle">这是唯一允许合并的一格</text><text class="t-ink" x="210" y="106" text-anchor="middle">规范挂</text><text class="t-dim" x="210" y="132" text-anchor="middle">重写实现，不动意图</text><text class="t-ink" x="525" y="244" text-anchor="middle">规格挂</text><text class="t-dim" x="525" y="270" text-anchor="middle">退回规格，别迁就代码</text><text class="t-ink" x="210" y="244" text-anchor="middle">两轴都挂</text><text class="t-dim" x="210" y="270" text-anchor="middle">丢弃，不解释</text></g>
</svg>
<figcaption><span><b>图 2</b>两轴独立评审的四种结果。真正有用的是下面两格——它们分别告诉你该改代码还是该改规格（示意图）。</span><button class="replay" type="button">重播</button></figcaption>
</figure>

实务上有两个细节值得固定下来。一是 finding 的写法：`文件:行号` + 一句"为什么这违反了什么"，不写形容词。二是两轴的结论要**分别**写进交付说明，这样下一轮的人（或者三个月后的你）能看出问题是规范层还是规格层——这两层要修的东西完全不同。

## 08 · 成本、边界，以及这套东西管不了什么

把成本说清楚，不然这套方法会变成负担：

<div class="table-wrap wide"><table>
<thead><tr><th>锁</th><th>拦住的失败模式</th><th>失效时的症状</th><th>成本形态</th></tr></thead>
<tbody>
<tr><td>领域词表</td><td>同词异义、概念在四个地方长出四个名字</td><td>读代码时不断问"这个 note 是哪个 note"</td><td>一次性，随仓库增长</td></tr>
<tr><td>测试接缝</td><td>改完了没人知道算不算做完</td><td>验收条件写不出来，只能靠"看着像好了"</td><td>一次性，每轮定规格时付</td></tr>
<tr><td>隔离工作树</td><td>顺手改动不相干文件、失败无法整棵回退</td><td>diff 里混着三个不相干的东西</td><td>很低，几条命令</td></tr>
<tr><td>垂直切片 TDD</td><td>先写完再补测试的自证循环</td><td>测试全是绿的，但说不清哪条先红过</td><td>每轮都付，最贵的一项</td></tr>
<tr><td>双轴审查</td><td>通过测试但偏离规格；或做对了但违反仓库规矩</td><td>合并之后才发现改的是另一件事</td><td>每轮都付，要人和时间</td></tr>
</tbody>
</table></div>

什么时候值得上全五道？我的判断线是三条，满足任意两条就上：这份改动会长期留在仓库里；有别人（或者三个月后的我）要读它；它的失败是静默的。

什么时候不值得：一次性脚本、探索期的原型、明天就扔的实验分支。给原型上双轴审查是浪费，因为它的规格本来就没定。

最后是这套方法的边界，我得说明白：**五道锁管的是"意图不漂移"，管不了"意图本身是错的"。**如果规格写错了，这套东西会把错的东西锁得特别牢固——测试、词表、审查全都在为一个错目标服务，而且每一步都通过。这是它最危险的地方，也是为什么第 03 节里那句"明确写下这一轮不做什么"必须由人写，不能由模型代笔。

<p class="pull">这套方法不保证你想对了，只保证做出来的确实是你想的那个。</p>
