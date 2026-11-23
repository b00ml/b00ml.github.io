/**
 * Ark v2 interactive workbench — typed face of the state machine.
 *
 * The single implementation lives in `machine.js`: plain JavaScript, because the
 * demo page in `public/projects/ark-workbench/demo/` inlines it verbatim and a
 * static asset cannot import a module at runtime. `mirror.test.ts` fails if the
 * inlined copy ever drifts by a byte, so the two are provably the same code.
 *
 * This file adds the types the rest of `src/` and the tests need. Keeping the
 * types here rather than in `machine.js` is deliberate: the browser copy must
 * stay dependency-free and erasable.
 */

import * as machine from './machine.js'

export type ArkHostId = 'obsidian' | 'claude-code' | 'dsh' | 'astrbot-qq' | 'agentmail'

export type ArkWorkspaceTab = 'note' | 'collect' | 'tasks' | 'channels'
export type ArkSidebarTab = 'chat' | 'history' | 'memory' | 'settings'
export type ArkScenarioId =
  | 'cross-channel-collect-mail'
  | 'vault-write-and-undo'
  | 'memory-and-concurrency'

export type ArkPendingAction = {
  id: string
  channel: 'agentmail'
  tool: string
  summary: string
  payloadPreview: Record<string, string>
  status: 'pending' | 'approved' | 'rejected'
}

export type ArkCollectItem = {
  id: string
  kind: 'video' | 'web'
  title: string
  url: string
  origin: string
  sourceHost: ArkHostId
  status: 'processing' | 'done' | 'failed'
  category: string
  tags: string[]
  addedAt: string
  summary?: string
  points?: string[]
  progress?: string
  error?: string
  notePath?: string
}

export type ArkTask = {
  id: string
  title: string
  status: 'todo' | 'doing' | 'done'
  dueToday: boolean
  source: string
}

export type ArkMemory = {
  id: string
  text: string
  status: 'inferred' | 'confirmed'
  via: ArkHostId
  quote: string
  kind: '偏好' | '事实' | '推断'
  at: string
}

export type ArkPendingConflict = {
  id: string
  host: ArkHostId
  baseRev: string
  incomingSummary: string
  incomingAt: number
}

export type ArkSnapshot = {
  commit: string
  kind: 'note' | 'tasks' | 'collect'
  source: string
  message: string
  diff: string
  reverted: boolean
  at: number
  previousNoteContent?: string
  previousNoteRev?: string
  previousTasks?: ArkTask[]
  previousCollectItems?: ArkCollectItem[]
}

export type ArkTraceStep = { tool: string; arg?: string; result: string; ms: number }

export type ArkChatMessage = {
  id: string
  role: 'user' | 'agent' | 'system'
  text: string
  at: number
  trace?: ArkTraceStep[]
}

export type ArkThread = {
  slug: string
  rev: string
  summary: string
  updatedBy: ArkHostId
  pendingConflicts: ArkPendingConflict[]
}

export type ArkDemoState = {
  scenario: ArkScenarioId | null
  workspaceTab: ArkWorkspaceTab
  sidebarTab: ArkSidebarTab
  note: { path: string; content: string; rev: string }
  collectItems: ArkCollectItem[]
  tasks: ArkTask[]
  memories: ArkMemory[]
  thread: ArkThread
  snapshots: ArkSnapshot[]
  pendingAction: ArkPendingAction | null
  chat: ArkChatMessage[]
  mail: { sentCount: number; refusal: string | null }
  /** Monotonic tick: the only clock in the machine, so replays are identical. */
  clock: number
}

export type ArkAction =
  | { type: 'set-workspace-tab'; tab: ArkWorkspaceTab }
  | { type: 'set-sidebar-tab'; tab: ArkSidebarTab }
  | { type: 'organize-note' }
  | { type: 'undo-latest' }
  | { type: 'undo-snapshot'; commit: string }
  | { type: 'collect-submit'; url: string; host: ArkHostId }
  | { type: 'collect-finish'; id: string }
  | { type: 'collect-retry'; id: string }
  | { type: 'move-task'; id: string; status: ArkTask['status'] }
  | { type: 'run-channel-action'; host: ArkHostId; action: string }
  | { type: 'request-agentmail-send' }
  | { type: 'resolve-pending-action'; decision: 'approve' | 'reject' }
  | { type: 'confirm-memory'; id: string; host?: ArkHostId }
  | { type: 'downgrade-by-channel'; host: ArkHostId }
  | { type: 'save-thread'; host: ArkHostId; baseRev: string; summary: string }
  | { type: 'run-scenario'; scenario: ArkScenarioId }
  | { type: 'reset' }

export type ArkChannel = {
  host: ArkHostId
  name: string
  grade: 'verified' | 'mcp-extension'
  gradeLabel: string
  detail: string
  actions: Array<{ id: string; label: string }>
}

export type ArkScenarioMeta = {
  id: ArkScenarioId
  label: string
  summary: string
  steps: number
}

export type ResidentPreview = {
  ids: string[]
  tokens: number
  limit: number
  parts: Array<{ label: string; tokens: number }>
}

export const MEMORY_INFERRED_PREFIX: string = machine.MEMORY_INFERRED_PREFIX
export const STALE_BASE_REV: string = machine.STALE_BASE_REV
export const CURRENT_REV: string = machine.CURRENT_REV
export const ARK_BUDGET: { resident: number; onDemand: number } = machine.ARK_BUDGET
export const ARK_HOSTS = machine.ARK_HOSTS as ArkHostId[]
export const ARK_WORKSPACE_TABS = machine.ARK_WORKSPACE_TABS as ArkWorkspaceTab[]
export const ARK_SIDEBAR_TABS = machine.ARK_SIDEBAR_TABS as ArkSidebarTab[]
export const ARK_ACTION_TYPES = machine.ARK_ACTION_TYPES as string[]
export const ARK_CHANNELS = machine.ARK_CHANNELS as ArkChannel[]
export const ARK_SCENARIO_META = machine.ARK_SCENARIO_META as ArkScenarioMeta[]

export const createInitialState = machine.createInitialState as () => ArkDemoState
export const dispatch = machine.dispatch as (state: ArkDemoState, action: ArkAction) => ArkDemoState
export const undoSnapshot = machine.undoSnapshot as (
  state: ArkDemoState,
  commit: string
) => ArkDemoState
export const runScenario = machine.runScenario as (scenario: ArkScenarioId) => ArkDemoState
export const scenarioActions = machine.scenarioActions as (scenario: ArkScenarioId) => ArkAction[]
export const memoryDisplay = machine.memoryDisplay as (memory: ArkMemory) => string
export const residentPreview = machine.residentPreview as (state: ArkDemoState) => ResidentPreview
export const taskContextPreview = machine.taskContextPreview as (state: ArkDemoState) => string
export const collectCategories = machine.collectCategories as (
  state: ArkDemoState
) => Array<{ name: string; count: number }>
export const channelOf = machine.channelOf as (host: ArkHostId) => ArkChannel | undefined
export const estimatedTokens = machine.estimatedTokens as (text: string) => number
export const messageTime = machine.messageTime as (at: number) => string
export const diffLines = machine.diffLines as (before: string, after: string) => string
