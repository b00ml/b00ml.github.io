/**
 * Ark v2 interactive workbench — the one implementation of the state machine.
 *
 * This file is plain JavaScript on purpose: the demo page at
 * `public/projects/ark-workbench/demo/index.html` inlines it verbatim (it is a
 * static asset and cannot import a module at runtime), and
 * `src/lib/demo/ark/mirror.test.ts` fails if the two copies ever differ by a
 * single byte. `src/lib/demo/ark/state.ts` adds the TypeScript types on top.
 *
 * Design rules encoded here (Ark `docs/design.md` v0.8):
 *
 * 1. Anything Git can undo is written without a dialog. Vault writes (organise a
 *    note, Collect intake, task board edits) apply immediately and append exactly
 *    one snapshot carrying its source tag. `undoSnapshot` puts the exact previous
 *    bytes back and marks that snapshot reverted; the history list itself is
 *    never rewritten.
 * 2. External, irreversible writes stop at a confirmation. Mail via Tencent
 *    AgentMail always becomes a `pendingAction` with `status: 'pending'`; only an
 *    explicit approve sends it, and a reject backfills the refusal with no
 *    external effect.
 * 3. Inferred memory never enters the 2k resident layer and always renders with
 *    `[推测，未确认]`. Confirming records the `via` channel; downgrading by
 *    channel bulk-reverts only that host's confirmed entries.
 * 4. A cross-host Live State save checks `baseRev === thread.rev`. A stale
 *    `baseRev` never overwrites: it lands in `thread.pendingConflicts`.
 *
 * Everything is pure and deterministic (no Date.now, no Math.random — a
 * monotonic `clock` instead), so a scenario replays to an identical state.
 */

export const MEMORY_INFERRED_PREFIX = '[推测，未确认]'

/** A rev read in an earlier session: it can no longer match `thread.rev`. */
export const STALE_BASE_REV = 'rev-4b1d7c02'

/** Symbol for "the rev this host just read", resolved when the action applies. */
export const CURRENT_REV = '@current'

export const ARK_BUDGET = { resident: 2000, onDemand: 4000 }

export const ARK_HOSTS = ['obsidian', 'claude-code', 'dsh', 'astrbot-qq', 'agentmail']

export const ARK_WORKSPACE_TABS = ['note', 'collect', 'tasks', 'channels']
export const ARK_SIDEBAR_TABS = ['chat', 'history', 'memory', 'settings']

/** The action names the reducer understands; the tests pin this list. */
export const ARK_ACTION_TYPES = [
  'set-workspace-tab',
  'set-sidebar-tab',
  'organize-note',
  'undo-latest',
  'undo-snapshot',
  'collect-submit',
  'collect-finish',
  'collect-retry',
  'move-task',
  'run-channel-action',
  'request-agentmail-send',
  'resolve-pending-action',
  'confirm-memory',
  'downgrade-by-channel',
  'save-thread',
  'run-scenario',
  'reset'
]

/**
 * The five channels with the evidence grade each one actually has. The two
 * external channels read as standard MCP extensions and never as accepted on
 * real hardware: one mismatched word here turns an honest page into one that
 * folds under a follow-up question.
 */
export const ARK_CHANNELS = [
  {
    host: 'obsidian',
    name: 'Obsidian 面板',
    grade: 'verified',
    gradeLabel: '已完成实机验收',
    detail:
      '2026-11-16 · 8 步人工验收：整理笔记、一轮对话一个快照、确认与驳回推断记忆、外部动作确认卡拒绝后不执行。',
    actions: [
      { id: 'organize-note', label: '整理当前笔记' },
      { id: 'inspect-history', label: '查看快照' },
      { id: 'save-thread', label: '保存 Live State' }
    ]
  },
  {
    host: 'claude-code',
    name: 'Claude Code',
    grade: 'verified',
    gradeLabel: '已完成实机验收',
    detail:
      '2.1.304 + Opus 5.5 · 经 mcp-remote 桥接 stdio 连 /mcp，2026-11-01 四步通过：提问、引用、写笔记、撤销。',
    actions: [
      { id: 'resume-thread', label: '恢复线程' },
      { id: 'list-tasks', label: '查任务' },
      { id: 'save-thread', label: '保存 Live State' }
    ]
  },
  {
    host: 'dsh',
    name: 'DSH',
    grade: 'verified',
    gradeLabel: '已完成实机验收',
    detail: 'DSH 0.1.0-rc.7 · 同一个 /mcp，2026-11-01 同样四步通过；模型 mx/deepseek-flash。',
    actions: [
      { id: 'resume-thread', label: '恢复线程' },
      { id: 'list-tasks', label: '查任务' },
      { id: 'recall-memory', label: '召回记忆' }
    ]
  },
  {
    host: 'astrbot-qq',
    name: '手机 QQ（经 AstrBot）',
    grade: 'mcp-extension',
    gradeLabel: '标准 MCP 协议扩展接入',
    detail:
      'AstrBot 用 streamable_http 连 Core 的 /mcp，headers 带 Authorization: Bearer；人格提示词由 ark-protocol、ask、summarize 三份 SKILL.md 正文拼接。示例对照 AstrBot v4.29.4 源码核对，尚未在真实 AstrBot 上运行。',
    actions: [
      { id: 'collect-submit', label: '投递链接' },
      { id: 'list-tasks', label: '查任务' },
      { id: 'resume-thread', label: '恢复线程' }
    ]
  },
  {
    host: 'agentmail',
    name: '腾讯 AgentMail',
    grade: 'mcp-extension',
    gradeLabel: '标准 MCP 协议扩展接入',
    detail:
      '邮件只有一条原则：优先用现成的 IMAP/SMTP MCP server。腾讯 AgentMail 属这条路径，仓库内没有专门接入记录。收信只返回素材；发信是外部写动作，执行前必须确认，拒绝也回填给模型。',
    actions: [
      { id: 'request-agentmail-send', label: '外发邮件' },
      { id: 'collect-submit', label: '收信入库' }
    ]
  }
]

export const ARK_SCENARIO_META = [
  {
    id: 'cross-channel-collect-mail',
    label: '跨端采集到外发拦截',
    summary: '手机 QQ 投递视频链接 → Collect 入库 → 对话汇总 → 外发停在确认卡',
    steps: 3
  },
  {
    id: 'vault-write-and-undo',
    label: '免审批写与单步回滚',
    summary: '整理笔记免弹窗改写原文 → 历史里看着色 diff → 一键撤销复原',
    steps: 3
  },
  {
    id: 'memory-and-concurrency',
    label: '记忆确认与并发保护',
    summary: '确认一条推断记忆升入常驻层 → 过期 base_rev 落入待合并',
    steps: 5
  }
]

/* ── deterministic helpers ─────────────────────────────────────────────── */

function fnv1a(input) {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** `rev` is a content hash, exactly like Ark's Live State rev. */
function revOf(content) {
  return `rev-${fnv1a(content)}`
}

/** CJK counts 1 token per character, everything else 1 token per 4 characters. */
export function estimatedTokens(text) {
  let tokens = 0
  for (const char of text) tokens += /[\u3000-\u9fff\uff00-\uffef]/.test(char) ? 1 : 0.25
  return Math.ceil(tokens)
}

export function messageTime(at) {
  const minutes = 9 * 60 + at * 3
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** A line diff good enough to colour: unchanged lines kept as context. */
export function diffLines(before, after) {
  const left = before.split('\n')
  const right = after.split('\n')
  const out = []
  const rows = Math.max(left.length, right.length)
  for (let i = 0; i < rows; i += 1) {
    const a = left[i]
    const b = right[i]
    if (a === b) {
      if (a !== undefined) out.push(` ${a}`)
      continue
    }
    if (a !== undefined) out.push(`- ${a}`)
    if (b !== undefined) out.push(`+ ${b}`)
  }
  return out.join('\n')
}

function taskLines(tasks) {
  return tasks.map((task) => `${task.status === 'done' ? '[x]' : '[ ]'} ${task.title}`).join('\n')
}

function collectLines(items) {
  return items.map((item) => `${item.status} ${item.category || '未分类'} ${item.title}`).join('\n')
}

function commitId(clock, kind) {
  return fnv1a(`${kind}:${clock}:${kind}`)
}

/* ── seed data ─────────────────────────────────────────────────────────── */

const NOTE_PATH = '笔记/三体.md'

const NOTE_INITIAL = `---
title: 三体
tags: [知识管理]
updated: 2026-11-23
---

刘慈欣的长篇科幻。黑暗森林法则：宇宙就是一座黑暗森林，每个文明都是带枪的猎人。

## 相关阅读

- [[方舟计划]]
`

const NOTE_ORGANISED = `---
title: 三体
tags: [知识管理, 工作流]
updated: 2026-11-23
---

刘慈欣的长篇科幻。黑暗森林法则：宇宙就是一座黑暗森林，每个文明都是带枪的猎人。

## 相关阅读

- [[方舟计划]]
- [[黑暗森林与最小暴露面]]
`

const THREAD_SUMMARY = '先把双区八个面板摆出来，再补三个预设剧本；写入一律免审批，靠快照兜底。'

const SEED_COLLECT = [
  {
    id: 'c1',
    kind: 'video',
    title: '如何构建一个真正可靠的个人知识库',
    url: 'https://www.bilibili.com/video/BV1Axxxxxxx?p=1',
    origin: 'bilibili.com · 林间实验室',
    sourceHost: 'obsidian',
    status: 'done',
    category: '技术',
    tags: ['知识管理', '工作流'],
    addedAt: '今天 10:24',
    summary:
      '作者从长期使用经验出发，讨论知识库如何从「堆积资料」转向支持检索、复用和行动的个人系统。',
    points: [
      '先明确知识库服务的具体工作流，再决定目录和标签结构。',
      '捕获成本越低越好，但需要定期回顾来防止信息沉没。',
      '让原始来源、个人判断和后续行动保持可追溯的联系。'
    ],
    notePath: '笔记/collect/个人知识库.md'
  },
  {
    id: 'c2',
    kind: 'web',
    title: '理解长文阅读中的信息筛选与记忆',
    url: 'https://mp.weixin.qq.com/s/reading-notes',
    origin: 'mp.weixin.qq.com · 少数派',
    sourceHost: 'obsidian',
    status: 'failed',
    category: '阅读',
    tags: ['阅读方法', '记忆'],
    addedAt: '今天 09:12',
    error: '页面要求登录，当前无法提取正文。原链接已保留，可以稍后重试。'
  },
  {
    id: 'c3',
    kind: 'video',
    title: '从用户研究到产品决策：一套轻量方法',
    url: 'https://www.bilibili.com/video/BV1Bxxxxxxx?p=2',
    origin: 'bilibili.com · 产品沉思录',
    sourceHost: 'astrbot-qq',
    status: 'processing',
    category: '产品',
    tags: ['用户研究'],
    addedAt: '昨天 21:08',
    progress: '内容已提取，正在生成摘要。'
  },
  {
    id: 'c4',
    kind: 'web',
    title: 'A practical guide to local-first software',
    url: 'https://martin.kleppmann.com/2020/10/07/local-first.html',
    origin: 'martin.kleppmann.com',
    sourceHost: 'obsidian',
    status: 'processing',
    category: '技术',
    tags: ['Local-first', '软件设计'],
    addedAt: '昨天 18:07',
    progress: '已取到正文，等待抽取要点。'
  }
]

const SEED_TASKS = [
  {
    id: 't1',
    title: '整理本周采集的三条视频',
    status: 'todo',
    dueToday: true,
    source: 'plugin:collect'
  },
  {
    id: 't2',
    title: '给多端同步文档补 AstrBot 配置片段',
    status: 'doing',
    dueToday: true,
    source: 'ark(ark-agent)'
  },
  {
    id: 't3',
    title: '重跑一次 evals/gate.py 门禁',
    status: 'todo',
    dueToday: false,
    source: 'ark(ark-agent)'
  },
  {
    id: 't4',
    title: '把记忆面板的降级按钮做出来',
    status: 'done',
    dueToday: false,
    source: 'ark(obsidian)'
  },
  {
    id: 't5',
    title: '确认 AgentMail 的权限清单',
    status: 'doing',
    dueToday: false,
    source: 'ark(agentmail)'
  }
]

const SEED_MEMORIES = [
  {
    id: 'm1',
    text: '写文档时偏好先给结论，再展开细节。',
    status: 'inferred',
    via: 'claude-code',
    quote: '「以后写文档都先给结论，再展开细节。」',
    kind: '偏好',
    at: '2026-11-16'
  },
  {
    id: 'm2',
    text: '笔记一律用中文书写，术语保留英文原词，不做中英混排。',
    status: 'confirmed',
    via: 'obsidian',
    quote: '「笔记就用中文写，别中英混排。」',
    kind: '事实',
    at: '2026-11-16'
  },
  {
    id: 'm3',
    text: '长文多写在深夜。',
    status: 'confirmed',
    via: 'dsh',
    quote: '「夜里两点那篇是我写的，白天写不动。」',
    kind: '推断',
    at: '2026-11-12'
  }
]

const SEED_CHAT = [
  {
    id: 'msg-0',
    role: 'user',
    text: '把《三体》这篇笔记整理一下，补上相关链接和标签。',
    at: 0
  },
  {
    id: 'msg-1',
    role: 'agent',
    text: '整理好了：frontmatter 补了标签，正文末尾补了一条双链。原文措辞没动，要撤销说一声。',
    at: 1,
    trace: [
      { tool: 'ark_load_skill', arg: 'organize', result: '已加载整理技能', ms: 12 },
      { tool: 'read', arg: '笔记/三体.md', result: '读到 4 段正文与 1 组 frontmatter', ms: 8 },
      { tool: 'search', arg: '三体', result: '3 条：笔记/方舟计划.md、收件箱.md、笔记/三体.md', ms: 31 },
      { tool: 'patch', arg: '笔记/三体.md', result: '在「相关阅读」追加 [[方舟计划]]', ms: 11 }
    ]
  }
]

export function createInitialState() {
  return {
    scenario: null,
    workspaceTab: 'note',
    sidebarTab: 'chat',
    note: { path: NOTE_PATH, content: NOTE_INITIAL, rev: revOf(NOTE_INITIAL) },
    collectItems: SEED_COLLECT.map((item) => ({ ...item })),
    tasks: SEED_TASKS.map((task) => ({ ...task })),
    memories: SEED_MEMORIES.map((memory) => ({ ...memory })),
    thread: {
      slug: 'ark-v2-demo',
      rev: revOf(THREAD_SUMMARY),
      summary: THREAD_SUMMARY,
      updatedBy: 'obsidian',
      pendingConflicts: []
    },
    snapshots: [],
    pendingAction: null,
    chat: SEED_CHAT.map((message) => ({ ...message })),
    mail: { sentCount: 0, refusal: null },
    clock: 2
  }
}

/* ── derived views (pure; shared by the tests and the page) ────────────── */

export function memoryDisplay(memory) {
  return memory.status === 'inferred' ? `${MEMORY_INFERRED_PREFIX}${memory.text}` : memory.text
}

/**
 * The 2k resident layer: confirmed preferences + the Live State summary + the
 * enabled plugin's `context.md`. Inferred entries are structurally excluded —
 * not filtered out by a budget check that might later pass.
 */
export function residentPreview(state) {
  const confirmed = state.memories.filter((memory) => memory.status === 'confirmed')
  const parts = [
    { label: '已确认偏好', tokens: confirmed.reduce((sum, m) => sum + estimatedTokens(m.text), 0) },
    { label: 'Live State 摘要', tokens: estimatedTokens(state.thread.summary) },
    { label: '插件 context.md（今日到期）', tokens: estimatedTokens(taskContextPreview(state)) }
  ]
  return {
    ids: confirmed.map((memory) => memory.id),
    tokens: parts.reduce((sum, part) => sum + part.tokens, 0),
    limit: ARK_BUDGET.resident,
    parts
  }
}

/** What the tasks plugin injects: only unfinished work that is due today. */
export function taskContextPreview(state) {
  const due = state.tasks.filter((task) => task.dueToday && task.status !== 'done')
  const lines = due.length
    ? due.map((task) => `- [ ] ${task.title}（今日到期 · ${task.status}）`)
    : ['- 今天没有未完成且到期的任务']
  return [`# context.md · ${state.thread.slug}`, '## 今日到期', ...lines].join('\n')
}

/** Category counts for the Collect sidebar. */
export function collectCategories(state) {
  const counts = new Map()
  for (const item of state.collectItems) {
    const key = item.category || '未分类'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }))
}

export function channelOf(host) {
  return ARK_CHANNELS.find((channel) => channel.host === host)
}

/* ── reducer internals ─────────────────────────────────────────────────── */

function withSnapshot(state, input, patch) {
  const clock = state.clock + 1
  const snapshot = {
    commit: commitId(clock, input.kind),
    kind: input.kind,
    source: input.source,
    message: input.message,
    diff: input.diff,
    reverted: false,
    at: clock,
    previousNoteContent: input.previousNoteContent,
    previousNoteRev: input.previousNoteRev,
    previousTasks: input.previousTasks,
    previousCollectItems: input.previousCollectItems
  }
  return { ...state, ...patch, clock, snapshots: [...state.snapshots, snapshot] }
}

function say(state, role, text, trace) {
  const clock = state.clock + 1
  return {
    ...state,
    clock,
    chat: [...state.chat, { id: `msg-${clock}`, role, text, at: clock, trace }]
  }
}

function sourceOfCollect(item) {
  return item.sourceHost === 'astrbot-qq' ? 'ark(astrbot)' : 'plugin:collect'
}

function collectSummary(item) {
  return item.kind === 'video'
    ? `这条视频把「${item.category || '未分类'}」的实操拆成三步，重点在把捕获成本压到一次粘贴。`
    : `这篇文章从「${item.category || '未分类'}」角度给出可操作的清单，结论先于论据。`
}

function collectPoints(item) {
  return item.kind === 'video'
    ? [
        '先把入口做窄，只留一个粘贴框。',
        '入库必须带来源锚点，否则三个月后没人敢引用。',
        '摘要只写能行动的部分。'
      ]
    : ['先判断这条资料服务于哪个工作流。', '把结论和引用证据分开记。', '失败时要保留原链接，不能编摘要。']
}

/** Undo one snapshot by commit. Only the newest un-reverted snapshot can go. */
export function undoSnapshot(state, commit) {
  const newest = [...state.snapshots].reverse().find((snapshot) => !snapshot.reverted)
  if (!newest || newest.commit !== commit) return state

  const snapshots = state.snapshots.map((snapshot) =>
    snapshot.commit === commit ? { ...snapshot, reverted: true } : snapshot
  )

  if (newest.kind === 'note' && newest.previousNoteContent !== undefined) {
    const note = {
      ...state.note,
      content: newest.previousNoteContent,
      rev: newest.previousNoteRev || revOf(newest.previousNoteContent)
    }
    return say({ ...state, snapshots, note }, 'agent', `已撤销 ${commit}，笔记精确恢复到写入前的字节。`)
  }

  if (newest.kind === 'tasks' && newest.previousTasks) {
    return say(
      { ...state, snapshots, tasks: newest.previousTasks.map((task) => ({ ...task })) },
      'agent',
      `已撤销 ${commit}，任务看板回到写入前的状态。`
    )
  }

  if (newest.kind === 'collect' && newest.previousCollectItems) {
    return say(
      { ...state, snapshots, collectItems: newest.previousCollectItems.map((item) => ({ ...item })) },
      'agent',
      `已撤销 ${commit}，入库记录与摘要笔记一并撤回，来源链接保留。`
    )
  }

  return { ...state, snapshots }
}

/* ── dispatch ──────────────────────────────────────────────────────────── */

export function dispatch(state, action) {
  switch (action.type) {
    case 'set-workspace-tab':
      return state.workspaceTab === action.tab ? state : { ...state, workspaceTab: action.tab }

    case 'set-sidebar-tab':
      return state.sidebarTab === action.tab ? state : { ...state, sidebarTab: action.tab }

    case 'organize-note': {
      if (state.note.content === NOTE_ORGANISED) return state
      return say(
        withSnapshot(
          state,
          {
            kind: 'note',
            source: 'ark(ark-agent)',
            message: `ark(ark-agent): organize ${state.note.path}`,
            diff: diffLines(state.note.content, NOTE_ORGANISED),
            previousNoteContent: state.note.content,
            previousNoteRev: state.note.rev
          },
          {
            workspaceTab: 'note',
            note: { ...state.note, content: NOTE_ORGANISED, rev: revOf(NOTE_ORGANISED) }
          }
        ),
        'agent',
        '整理完成：frontmatter 补了工作流标签，末尾加了一条双链。没有弹确认框 —— 这件事 Git 撤得回来。'
      )
    }

    case 'undo-latest': {
      const newest = [...state.snapshots].reverse().find((snapshot) => !snapshot.reverted)
      return newest ? undoSnapshot(state, newest.commit) : state
    }

    case 'undo-snapshot':
      return undoSnapshot(state, action.commit)

    case 'collect-submit': {
      const url = action.url.trim()
      if (!url) return state
      const isVideo = /bilibili\.com/i.test(url)
      const id = `c${state.collectItems.length + 1}`
      const item = {
        id,
        kind: isVideo ? 'video' : 'web',
        title: isVideo
          ? '新采集的 B 站视频（等待抽取）'
          : `新采集的网页（${url.replace(/^https?:\/\//, '').slice(0, 28)}）`,
        url,
        origin: url.replace(/^https?:\/\//, '').split('/')[0] || url,
        sourceHost: action.host,
        status: 'processing',
        category: '',
        tags: ['待处理'],
        addedAt: '刚刚',
        progress: '链接已进 queue，采集扩展正在取素材。'
      }
      return say(
        { ...state, workspaceTab: 'collect', collectItems: [...state.collectItems, item] },
        'user',
        action.host === 'astrbot-qq'
          ? `手机 QQ（AstrBot）投递了一个链接：${url}`
          : `投递了一个链接：${url}`
      )
    }

    case 'collect-finish': {
      const target = state.collectItems.find((item) => item.id === action.id)
      if (!target || target.status === 'done') return state
      const finished = {
        ...target,
        status: 'done',
        summary: collectSummary(target),
        points: collectPoints(target),
        progress: undefined,
        error: undefined,
        notePath: `笔记/collect/${target.id}-${target.kind === 'video' ? '视频摘要' : '文章摘要'}.md`
      }
      const items = state.collectItems.map((item) => (item.id === action.id ? finished : item))
      return say(
        withSnapshot(
          state,
          {
            kind: 'collect',
            source: sourceOfCollect(target),
            message: `${sourceOfCollect(target)}: collect ${finished.notePath}`,
            diff: diffLines(collectLines(state.collectItems), collectLines(items)),
            previousCollectItems: state.collectItems.map((item) => ({ ...item }))
          },
          { collectItems: items }
        ),
        'agent',
        `入库完成：${finished.notePath}。摘要、要点、来源锚点都在，随时可检索。`,
        [
          { tool: 'collect_fetch', arg: finished.origin, result: '取到正文与元数据', ms: 640 },
          { tool: 'collect_extract', arg: '摘要 + 要点', result: '生成 1 段摘要、3 条要点', ms: 1180 },
          { tool: 'write', arg: finished.notePath, result: '写入 Vault，附带来源锚点', ms: 14 }
        ]
      )
    }

    case 'collect-retry': {
      const target = state.collectItems.find((item) => item.id === action.id)
      if (!target || target.status === 'processing') return state
      const items = state.collectItems.map((item) =>
        item.id === action.id
          ? {
              ...item,
              status: 'processing',
              error: undefined,
              progress: '重试任务已入队，等待采集扩展。'
            }
          : item
      )
      return say(
        { ...state, collectItems: items },
        'agent',
        `已重试 ${action.id}：任务入队，没有生成任何摘要。`
      )
    }

    case 'move-task': {
      const target = state.tasks.find((task) => task.id === action.id)
      if (!target || target.status === action.status) return state
      const tasks = state.tasks.map((task) =>
        task.id === action.id ? { ...task, status: action.status } : task
      )
      const label = { todo: '待办', doing: '进行中', done: '已完成' }[action.status]
      return say(
        withSnapshot(
          state,
          {
            kind: 'tasks',
            source: 'ark(ark-agent)',
            message: `ark(ark-agent): tasks 将 ${target.id} 移到 ${action.status}`,
            diff: diffLines(taskLines(state.tasks), taskLines(tasks)),
            previousTasks: state.tasks.map((task) => ({ ...task }))
          },
          { tasks }
        ),
        'agent',
        `任务「${target.title}」已移到${label}。看板变更同样进快照，不用先问。`
      )
    }

    case 'run-channel-action': {
      const channel = channelOf(action.host)
      if (!channel) return state

      switch (action.action) {
        case 'organize-note':
          return dispatch(state, { type: 'organize-note' })

        case 'inspect-history':
          return { ...state, sidebarTab: 'history' }

        case 'request-agentmail-send':
          return dispatch(state, { type: 'request-agentmail-send' })

        case 'collect-submit':
          return dispatch(state, {
            type: 'collect-submit',
            url: 'https://www.bilibili.com/video/BV1GJ411x7h7',
            host: action.host
          })

        case 'list-tasks': {
          const open = state.tasks.filter((task) => task.status !== 'done')
          return say(
            { ...state, sidebarTab: 'chat' },
            'agent',
            `${channel.name} 查到 ${open.length} 个未完成任务：${open
              .map((task) => task.title)
              .join('；')}`,
            [
              {
                tool: 'tasks_list_tasks',
                arg: channel.host,
                result: `返回 ${state.tasks.length} 条`,
                ms: 9
              },
              {
                tool: 'tasks_today',
                arg: '今日到期',
                result: `返回 ${
                  state.tasks.filter((task) => task.dueToday && task.status !== 'done').length
                } 条`,
                ms: 6
              }
            ]
          )
        }

        case 'resume-thread':
          return say(
            { ...state, sidebarTab: 'chat' },
            'agent',
            `${channel.name} 恢复线程 ${state.thread.slug}（${state.thread.rev}）：${state.thread.summary}`,
            [
              {
                tool: 'context_resume',
                arg: state.thread.slug,
                result: `rev ${state.thread.rev}`,
                ms: 12
              }
            ]
          )

        case 'recall-memory': {
          const inferred = state.memories.filter((memory) => memory.status === 'inferred')
          return say(
            { ...state, sidebarTab: 'chat' },
            'agent',
            `${channel.name} 召回 ${state.memories.length} 条记忆，其中 ${inferred.length} 条标了${MEMORY_INFERRED_PREFIX}，不计入常驻层。`,
            [
              {
                tool: 'memory_search_memory',
                arg: '全部',
                result: `${state.memories.length} 条`,
                ms: 7
              }
            ]
          )
        }

        case 'save-thread':
          return dispatch(state, {
            type: 'save-thread',
            host: action.host,
            baseRev: CURRENT_REV,
            summary: state.thread.summary
          })

        default:
          return state
      }
    }

    case 'request-agentmail-send': {
      if (state.pendingAction && state.pendingAction.status === 'pending') return state
      const clock = state.clock + 1
      const pending = {
        id: `pa-${clock}`,
        channel: 'agentmail',
        tool: 'agentmail_send',
        summary: '把本轮对话的三条结论外发到 demo@example.com（主题：Ark v2 采集链路小结）',
        payloadPreview: {
          to: 'demo@example.com',
          subject: 'Ark v2 采集链路小结',
          body: `${state.thread.summary}\n- Collect 已完成 ${
            state.collectItems.filter((item) => item.status === 'done').length
          } 条入库`,
          via: '标准 MCP 扩展接入（IMAP/SMTP）'
        },
        status: 'pending'
      }
      return say(
        { ...state, pendingAction: pending, sidebarTab: 'chat', clock },
        'agent',
        '整理好了。发给外部邮箱是撤不回来的动作，所以先挂一张确认卡：批准才发，拒绝我把结果回填给模型。'
      )
    }

    case 'resolve-pending-action': {
      const pending = state.pendingAction
      if (!pending || pending.status !== 'pending') return state

      if (action.decision === 'approve') {
        return say(
          {
            ...state,
            pendingAction: { ...pending, status: 'approved' },
            mail: { sentCount: state.mail.sentCount + 1, refusal: state.mail.refusal }
          },
          'agent',
          `已批准，邮件已通过 AgentMail 发出（第 ${
            state.mail.sentCount + 1
          } 封）。这次没有 Vault 写入，所以不产生快照。`
        )
      }

      return say(
        {
          ...state,
          pendingAction: { ...pending, status: 'rejected' },
          mail: {
            sentCount: state.mail.sentCount,
            refusal: '用户拒绝外发，邮件未发送；拒绝结果已回填给模型。'
          }
        },
        'agent',
        '已拒绝：邮件未发送，外部没有任何副作用。拒绝结果回填给模型，这轮到此结束。'
      )
    }

    case 'confirm-memory': {
      const target = state.memories.find((memory) => memory.id === action.id)
      if (!target || target.status === 'confirmed') return state
      const via = action.host || target.via
      const memories = state.memories.map((memory) =>
        memory.id === action.id ? { ...memory, status: 'confirmed', via } : memory
      )
      const clock = state.clock + 1
      return {
        ...state,
        memories,
        clock,
        chat: [
          ...state.chat,
          {
            id: `msg-${clock}`,
            role: 'agent',
            text: `记忆 ${action.id} 已确认，via=${via}。它从这轮起进入 2k 常驻层。`,
            at: clock
          }
        ]
      }
    }

    case 'downgrade-by-channel': {
      const affected = state.memories.filter(
        (memory) => memory.status === 'confirmed' && memory.via === action.host
      )
      if (!affected.length) return state
      const memories = state.memories.map((memory) =>
        affected.some((entry) => entry.id === memory.id)
          ? { ...memory, status: 'inferred' }
          : memory
      )
      const clock = state.clock + 1
      return {
        ...state,
        memories,
        clock,
        chat: [
          ...state.chat,
          {
            id: `msg-${clock}`,
            role: 'agent',
            text: `已按通道降级 ${affected.length} 条（via=${action.host}）：${affected
              .map((memory) => memory.id)
              .join('、')}。其他通道确认的不受影响。`,
            at: clock
          }
        ]
      }
    }

    case 'save-thread': {
      const baseRev = action.baseRev === CURRENT_REV ? state.thread.rev : action.baseRev
      if (baseRev !== state.thread.rev) {
        const clock = state.clock + 1
        const conflict = {
          id: `conflict-${clock}`,
          host: action.host,
          baseRev,
          incomingSummary: action.summary,
          incomingAt: clock
        }
        return {
          ...state,
          clock,
          thread: { ...state.thread, pendingConflicts: [...state.thread.pendingConflicts, conflict] },
          chat: [
            ...state.chat,
            {
              id: `msg-${clock}`,
              role: 'system',
              text: `base_rev ${baseRev} 已过期（当前 ${state.thread.rev}）。${action.host} 的这次保存没有覆盖线程，落进 ark/threads/${state.thread.slug}.pending/ 待合并。`,
              at: clock
            }
          ]
        }
      }

      const clock = state.clock + 1
      const rev = `rev-${fnv1a(
        `${state.thread.slug}|${action.summary}|${action.host}|${state.thread.rev}`
      )}`
      return {
        ...state,
        clock,
        thread: { ...state.thread, rev, summary: action.summary, updatedBy: action.host },
        chat: [
          ...state.chat,
          {
            id: `msg-${clock}`,
            role: 'agent',
            text: `Live State 已由 ${action.host} 保存，${state.thread.rev} → ${rev}。`,
            at: clock
          }
        ]
      }
    }

    case 'run-scenario':
      return runScenario(action.scenario)

    case 'reset':
      return createInitialState()

    default:
      return state
  }
}

/* ── preset scenarios ──────────────────────────────────────────────────── */

/**
 * Each scenario is a short click list, replayed from a fresh state. Deriving the
 * end state from the same actions the buttons fire is what makes switching and
 * reset idempotent: the run has no memory of the previous run.
 */
export function scenarioActions(scenario) {
  switch (scenario) {
    case 'cross-channel-collect-mail':
      return [
        {
          type: 'collect-submit',
          url: 'https://www.bilibili.com/video/BV1GJ411x7h7',
          host: 'astrbot-qq'
        },
        { type: 'collect-finish', id: 'c5' },
        { type: 'request-agentmail-send' }
      ]

    case 'vault-write-and-undo':
      return [
        { type: 'organize-note' },
        { type: 'set-sidebar-tab', tab: 'history' },
        { type: 'undo-latest' }
      ]

    case 'memory-and-concurrency':
      return [
        { type: 'set-sidebar-tab', tab: 'memory' },
        { type: 'confirm-memory', id: 'm1', host: 'claude-code' },
        {
          type: 'save-thread',
          host: 'obsidian',
          baseRev: CURRENT_REV,
          summary: '桌面端接上：先把 note 与 collect 两栏做实，再谈渠道。'
        },
        {
          type: 'save-thread',
          host: 'claude-code',
          baseRev: STALE_BASE_REV,
          summary: '终端这边的结论：只做两栏就够。'
        },
        { type: 'set-workspace-tab', tab: 'channels' }
      ]

    default:
      return []
  }
}

export function runScenario(scenario) {
  const start = { ...createInitialState(), scenario }
  return scenarioActions(scenario).reduce((current, action) => dispatch(current, action), start)
}
