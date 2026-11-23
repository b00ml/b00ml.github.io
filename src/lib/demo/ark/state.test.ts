import { describe, expect, test } from 'bun:test'

import {
  ARK_ACTION_TYPES,
  ARK_HOSTS,
  ARK_SCENARIO_META,
  ARK_SIDEBAR_TABS,
  ARK_WORKSPACE_TABS,
  MEMORY_INFERRED_PREFIX,
  STALE_BASE_REV,
  createInitialState,
  dispatch,
  memoryDisplay,
  residentPreview,
  runScenario,
  scenarioActions,
  taskContextPreview,
  undoSnapshot,
  type ArkAction,
  type ArkDemoState
} from './state'

/**
 * Every assertion here drives the public action surface only: `createInitialState`
 * plus `dispatch`. Nothing reaches into a renderer, a selector or a private helper,
 * so the panels can be rewritten without touching these tests.
 */
const run = (actions: ArkAction[], from: ArkDemoState = createInitialState()) =>
  actions.reduce((state, action) => dispatch(state, action), from)

const INITIAL_NOTE = createInitialState().note.content

/** One probe per action type, so a new action cannot ship untested at the seam. */
const PROBES: ArkAction[] = [
  { type: 'set-workspace-tab', tab: 'collect' },
  { type: 'set-sidebar-tab', tab: 'history' },
  { type: 'organize-note' },
  { type: 'undo-latest' },
  { type: 'undo-snapshot', commit: 'deadbee' },
  { type: 'collect-submit', url: 'https://www.bilibili.com/video/BV1GJ411x7h7', host: 'astrbot-qq' },
  { type: 'collect-finish', id: 'c4' },
  { type: 'collect-retry', id: 'c2' },
  { type: 'move-task', id: 't1', status: 'doing' },
  { type: 'run-channel-action', host: 'dsh', action: 'list-tasks' },
  { type: 'request-agentmail-send' },
  { type: 'resolve-pending-action', decision: 'approve' },
  { type: 'confirm-memory', id: 'm1' },
  { type: 'downgrade-by-channel', host: 'dsh' },
  { type: 'save-thread', host: 'obsidian', baseRev: STALE_BASE_REV, summary: '探测用' },
  { type: 'run-scenario', scenario: 'vault-write-and-undo' },
  { type: 'reset' }
]

describe('ark demo initial state', () => {
  test('opens on the note tab with eight panels, no history and nothing pending', () => {
    const state = createInitialState()

    expect(ARK_WORKSPACE_TABS).toEqual(['note', 'collect', 'tasks', 'channels'])
    expect(ARK_SIDEBAR_TABS).toEqual(['chat', 'history', 'memory', 'settings'])
    expect(ARK_HOSTS).toEqual(['obsidian', 'claude-code', 'dsh', 'astrbot-qq', 'agentmail'])

    expect(state.workspaceTab).toBe('note')
    expect(state.sidebarTab).toBe('chat')
    expect(state.scenario).toBeNull()
    expect(state.snapshots).toEqual([])
    expect(state.pendingAction).toBeNull()
    expect(state.mail.sentCount).toBe(0)

    expect(state.note.path.endsWith('.md')).toBe(true)
    expect(state.note.content.length).toBeGreaterThan(40)
    expect(state.collectItems.length).toBeGreaterThanOrEqual(3)
    expect(state.tasks.map((task) => task.status)).toContain('doing')
    expect(state.tasks.some((task) => task.dueToday)).toBe(true)
    expect(state.memories.some((memory) => memory.status === 'inferred')).toBe(true)
    expect(state.memories.some((memory) => memory.status === 'confirmed')).toBe(true)
    expect(state.thread.pendingConflicts).toEqual([])
    expect(state.chat.length).toBeGreaterThan(0)
  })

  test('is deterministic, so the same scenario always lands on the same screen', () => {
    expect(createInitialState()).toEqual(createInitialState())
  })

  test('exposes exactly the action types it can dispatch', () => {
    expect(PROBES.map((action) => action.type).sort()).toEqual([...ARK_ACTION_TYPES].sort())
    for (const action of PROBES) {
      expect(() => dispatch(createInitialState(), action)).not.toThrow()
    }
  })
})

describe('in-vault writes: no confirmation, one snapshot, exact undo', () => {
  test('organising the note writes through and appends exactly one snapshot', () => {
    const state = run([{ type: 'organize-note' }])

    expect(state.note.content).not.toBe(INITIAL_NOTE)
    expect(state.note.content).toContain('工作流')
    expect(state.snapshots).toHaveLength(1)
    expect(state.snapshots[0].source).toBe('ark(ark-agent)')
    expect(state.snapshots[0].reverted).toBe(false)
    expect(state.snapshots[0].message).toContain(state.note.path)

    // Nothing was held back for approval: rewriting a file inside the vault is
    // covered by the snapshot, not by a dialog.
    expect(state.pendingAction).toBeNull()

    // The coloured diff is derived from the two contents, not hand-written.
    expect(state.snapshots[0].diff).toContain('- tags: [知识管理]')
    expect(state.snapshots[0].diff).toContain('+ tags: [知识管理, 工作流]')
  })

  test('organising an already organised note changes nothing', () => {
    const once = run([{ type: 'organize-note' }])
    const twice = dispatch(once, { type: 'organize-note' })

    expect(twice.snapshots).toHaveLength(1)
    expect(twice.note.content).toBe(once.note.content)
  })

  test('undo restores the exact prior note content and keeps history intact', () => {
    const organised = run([{ type: 'organize-note' }])
    const commit = organised.snapshots[0].commit
    const undone = dispatch(organised, { type: 'undo-snapshot', commit })

    expect(undone.note.content).toBe(INITIAL_NOTE)
    expect(undone.note.rev).toBe(createInitialState().note.rev)
    expect(undone.snapshots).toHaveLength(1)
    expect(undone.snapshots[0].commit).toBe(commit)
    expect(undone.snapshots[0].reverted).toBe(true)
    // A snapshot is never removed or rewritten; undo is one more fact, not a
    // rollback of the history list itself.
    expect(undone.snapshots[0].message).toBe(organised.snapshots[0].message)
    expect(undoSnapshot(organised, commit)).toEqual(undone)
  })

  test('only the newest un-reverted snapshot can be undone', () => {
    const organised = run([{ type: 'organize-note' }])
    const older = organised.snapshots[0].commit
    const withTask = dispatch(organised, { type: 'move-task', id: 't1', status: 'done' })

    expect(withTask.snapshots).toHaveLength(2)
    // An older snapshot is buried under a newer one: undoing it would silently
    // throw away the later write, so the reducer refuses.
    expect(undoSnapshot(withTask, older)).toEqual(withTask)
    expect(undoSnapshot(withTask, 'does-not-exist')).toEqual(withTask)

    const undone = dispatch(withTask, { type: 'undo-latest' })
    expect(undone.tasks).toEqual(createInitialState().tasks)
    expect(undone.note.content).toBe(organised.note.content)
  })

  test('moving a task appends one snapshot and rewrites the day context preview', () => {
    const state = run([{ type: 'move-task', id: 't1', status: 'done' }])

    expect(state.tasks.find((task) => task.id === 't1')?.status).toBe('done')
    expect(state.snapshots).toHaveLength(1)
    expect(state.snapshots[0].previousTasks).toBeDefined()
    expect(state.pendingAction).toBeNull()

    expect(taskContextPreview(createInitialState())).toContain('整理本周采集的三条视频')
    expect(taskContextPreview(state)).not.toContain('整理本周采集的三条视频')

    // Same status is not a write.
    expect(dispatch(state, { type: 'move-task', id: 't1', status: 'done' })).toEqual(state)
  })

  test('undoing a task snapshot puts the board back', () => {
    const moved = run([{ type: 'move-task', id: 't1', status: 'done' }])
    const undone = undoSnapshot(moved, moved.snapshots[0].commit)

    expect(undone.tasks).toEqual(createInitialState().tasks)
    expect(undone.snapshots[0].reverted).toBe(true)
  })

  test('collect intake writes a note and one snapshot tagged with its origin', () => {
    const state = run([{ type: 'collect-finish', id: 'c4' }])
    const item = state.collectItems.find((entry) => entry.id === 'c4')

    expect(item?.status).toBe('done')
    expect(item?.summary?.length).toBeGreaterThan(10)
    expect(item?.points?.length).toBeGreaterThan(0)
    expect(item?.notePath).toContain('笔记/collect/')
    expect(state.snapshots).toHaveLength(1)
    expect(state.snapshots[0].source).toBe('plugin:collect')
    expect(state.pendingAction).toBeNull()

    const retried = run([{ type: 'collect-retry', id: 'c2' }])
    expect(retried.collectItems.find((entry) => entry.id === 'c2')?.status).toBe('processing')
    expect(retried.snapshots).toEqual([])
  })
})

describe('external outbound mail never completes directly', () => {
  test('a send request stops at a pending action and sends nothing', () => {
    const state = run([{ type: 'request-agentmail-send' }])

    expect(state.pendingAction?.status).toBe('pending')
    expect(state.pendingAction?.channel).toBe('agentmail')
    expect(state.pendingAction?.tool).toBe('agentmail_send')
    expect(state.pendingAction?.payloadPreview.to).toContain('@')
    expect(state.mail.sentCount).toBe(0)
    expect(state.sidebarTab).toBe('chat')
    // Outbound mail is not a vault write, so it must not fabricate a snapshot.
    expect(state.snapshots).toEqual([])
  })

  test('approving sends it exactly once', () => {
    const pending = run([{ type: 'request-agentmail-send' }])
    const approved = dispatch(pending, { type: 'resolve-pending-action', decision: 'approve' })

    expect(approved.pendingAction?.status).toBe('approved')
    expect(approved.mail.sentCount).toBe(1)
    expect(dispatch(approved, { type: 'resolve-pending-action', decision: 'approve' })).toEqual(
      approved
    )
  })

  test('rejecting backfills a refusal with no external effect', () => {
    const pending = run([{ type: 'request-agentmail-send' }])
    const rejected = dispatch(pending, { type: 'resolve-pending-action', decision: 'reject' })

    expect(rejected.pendingAction?.status).toBe('rejected')
    expect(rejected.mail.sentCount).toBe(0)
    expect(rejected.mail.refusal).toContain('拒绝')
    expect(rejected.chat.at(-1)?.text).toContain('未发送')
    expect(rejected.snapshots).toEqual([])
  })

  test('a second request while one is pending does not stack or send', () => {
    const pending = run([{ type: 'request-agentmail-send' }])
    const again = dispatch(pending, { type: 'request-agentmail-send' })

    expect(again.pendingAction).toEqual(pending.pendingAction)
    expect(again.mail.sentCount).toBe(0)
  })

  test('resolving with nothing pending is a no-op', () => {
    expect(
      dispatch(createInitialState(), { type: 'resolve-pending-action', decision: 'approve' })
    ).toEqual(createInitialState())
  })
})

describe('memory isolation between inferred and confirmed', () => {
  test('inferred entries carry the unconfirmed prefix and stay out of the resident layer', () => {
    const state = createInitialState()
    const inferred = state.memories.filter((memory) => memory.status === 'inferred')

    expect(inferred.length).toBeGreaterThan(0)
    expect(MEMORY_INFERRED_PREFIX).toBe('[推测，未确认]')
    expect(memoryDisplay(inferred[0])).toBe(`${MEMORY_INFERRED_PREFIX}${inferred[0].text}`)

    const preview = residentPreview(state)
    expect(preview.limit).toBe(2000)
    expect(preview.ids).not.toContain(inferred[0].id)
    expect(preview.tokens).toBeGreaterThan(0)
  })

  test('confirming a memory records the channel and grows the resident preview', () => {
    const before = residentPreview(createInitialState())
    const state = run([{ type: 'confirm-memory', id: 'm1' }])
    const memory = state.memories.find((entry) => entry.id === 'm1')

    expect(memory?.status).toBe('confirmed')
    expect(memory?.via).toBe('claude-code')
    expect(memoryDisplay(state.memories[1])).not.toContain(MEMORY_INFERRED_PREFIX)

    const after = residentPreview(state)
    expect(after.ids).toContain('m1')
    expect(after.tokens).toBeGreaterThan(before.tokens)
  })

  test('downgrading by channel reverts only that channel and nothing else', () => {
    const confirmed = run([{ type: 'confirm-memory', id: 'm1', host: 'dsh' }])
    expect(confirmed.memories.find((entry) => entry.id === 'm1')?.via).toBe('dsh')

    const downgraded = dispatch(confirmed, { type: 'downgrade-by-channel', host: 'dsh' })

    expect(downgraded.memories.find((entry) => entry.id === 'm1')?.status).toBe('inferred')
    expect(downgraded.memories.find((entry) => entry.id === 'm3')?.status).toBe('inferred')
    expect(downgraded.memories.find((entry) => entry.id === 'm2')?.status).toBe('confirmed')
    expect(residentPreview(downgraded).ids).toEqual(['m2'])

    // A channel with nothing confirmed changes nothing at all.
    const untouched = dispatch(downgraded, { type: 'downgrade-by-channel', host: 'agentmail' })
    expect(untouched).toEqual(downgraded)
  })
})

describe('live state optimism: base_rev must match', () => {
  test('a matching base_rev advances the revision', () => {
    const state = createInitialState()
    const saved = dispatch(state, {
      type: 'save-thread',
      host: 'obsidian',
      baseRev: state.thread.rev,
      summary: '新的假设：先把双区八个面板摆出来。'
    })

    expect(saved.thread.rev).not.toBe(state.thread.rev)
    expect(saved.thread.rev.startsWith('rev-')).toBe(true)
    expect(saved.thread.summary).toBe('新的假设：先把双区八个面板摆出来。')
    expect(saved.thread.updatedBy).toBe('obsidian')
    expect(saved.thread.pendingConflicts).toEqual([])
  })

  test('a stale base_rev lands in pendingConflicts and never touches the thread', () => {
    const state = createInitialState()
    expect(STALE_BASE_REV).not.toBe(state.thread.rev)

    const stale = dispatch(state, {
      type: 'save-thread',
      host: 'claude-code',
      baseRev: STALE_BASE_REV,
      summary: '先只做两栏。'
    })

    expect(stale.thread.rev).toBe(state.thread.rev)
    expect(stale.thread.summary).toBe(state.thread.summary)
    expect(stale.thread.pendingConflicts).toHaveLength(1)
    expect(stale.thread.pendingConflicts[0]).toMatchObject({
      host: 'claude-code',
      baseRev: STALE_BASE_REV,
      incomingSummary: '先只做两栏。'
    })
    expect(stale.chat.at(-1)?.text).toContain('.pending')
  })
})

describe('preset scenarios', () => {
  test('each scenario finishes inside six steps', () => {
    expect(ARK_SCENARIO_META).toHaveLength(3)
    for (const meta of ARK_SCENARIO_META) {
      expect(meta.label.length).toBeGreaterThan(4)
      expect(meta.steps).toBe(scenarioActions(meta.id).length)
      expect(meta.steps).toBeLessThanOrEqual(6)
    }
  })

  test('scenario 1 collects a delivered link and stops at the mail confirmation', () => {
    const state = runScenario('cross-channel-collect-mail')

    expect(state.scenario).toBe('cross-channel-collect-mail')
    expect(state.collectItems).toHaveLength(5)
    expect(state.collectItems[4]).toMatchObject({ id: 'c5', sourceHost: 'astrbot-qq', status: 'done' })
    expect(state.snapshots.map((snapshot) => snapshot.source)).toEqual(['ark(astrbot)'])
    expect(state.pendingAction?.status).toBe('pending')
    expect(state.mail.sentCount).toBe(0)
    expect(state.chat.some((message) => (message.trace?.length ?? 0) > 0)).toBe(true)
    expect(state.workspaceTab).toBe('collect')
  })

  test('scenario 2 rewrites the note, then restores it', () => {
    const state = runScenario('vault-write-and-undo')

    expect(state.note.content).toBe(INITIAL_NOTE)
    expect(state.snapshots).toHaveLength(1)
    expect(state.snapshots[0].reverted).toBe(true)
    expect(state.sidebarTab).toBe('history')
    expect(state.pendingAction).toBeNull()
  })

  test('scenario 3 promotes a memory and traps the stale save', () => {
    const state = runScenario('memory-and-concurrency')

    expect(state.memories.find((entry) => entry.id === 'm1')?.status).toBe('confirmed')
    expect(state.memories.find((entry) => entry.id === 'm1')?.via).toBe('claude-code')
    expect(residentPreview(state).ids).toContain('m1')
    expect(state.thread.pendingConflicts).toHaveLength(1)
    expect(state.thread.pendingConflicts[0].host).toBe('claude-code')

    // The desktop host's valid save moved the rev; the terminal's stale save then
    // left both the rev and the summary exactly where they were.
    const beforeStaleSave = run(scenarioActions('memory-and-concurrency').slice(0, 3))
    expect(state.thread.rev).toBe(beforeStaleSave.thread.rev)
    expect(state.thread.summary).toBe(beforeStaleSave.thread.summary)
    expect(state.thread.rev).not.toBe(createInitialState().thread.rev)
    expect(state.workspaceTab).toBe('channels')
  })

  test('scenarios and reset are idempotent', () => {
    expect(runScenario('vault-write-and-undo')).toEqual(runScenario('vault-write-and-undo'))
    expect(runScenario('cross-channel-collect-mail')).toEqual(
      runScenario('cross-channel-collect-mail')
    )

    const first = runScenario('memory-and-concurrency')
    const detour = dispatch(first, { type: 'run-scenario', scenario: 'vault-write-and-undo' })
    const back = dispatch(detour, {
      type: 'run-scenario',
      scenario: 'memory-and-concurrency'
    })
    expect(back).toEqual(first)
    expect(dispatch(back, { type: 'reset' })).toEqual(createInitialState())
  })
})
