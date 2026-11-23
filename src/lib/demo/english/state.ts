/**
 * 英语教研内容生产工作台 · LangGraph 观测与评测闭环台 — TypeScript 类型外壳。
 *
 * 唯一实现位于 `machine.js`（纯 JavaScript）：`public/projects/english-content-workbench/demo/demo.js`
 * 作为静态资产无法在浏览器运行时 import TS 模块，因此逐字节内联 `machine.js`，并由
 * `mirror.test.ts` 做逐字节对齐校验，确保浏览器运行的规则与单元测试锁死的规则完全同源。
 */

import * as machine from './machine.js'

export type GateStage = 'schema-rule' | 'llm-judge' | 'human-review'

export type WorkspaceViewId = 'pipeline' | 'calibration' | 'flywheel'

export type QuestionType = 'cloze' | 'reading' | 'mcq'

export type PresetId = 'cloze-rule-block' | 'reading-low-score' | 'false-pass-calibration'

export type BinaryVerdict = '1' | '0' | 'unknown'

export type RubricId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6'

export type DimensionId = 'alignment' | 'uniqueness' | 'distractors' | 'grounding'

export type RubricVersionId = 'v1' | 'v2' | 'v3'

export type LangGraphNodeId =
  | 'retrieve_chunks'
  | 'generate_draft'
  | 'schema_rule_guard'
  | 'binary_rubric_judge'
  | 'revise_draft'
  | 'human_interrupt'
  | 'sample_or_badcase'

export type LangGraphNodeStatus =
  | 'completed'
  | 'blocked'
  | 'short-circuited'
  | 'failed'
  | 'interrupted'
  | 'skipped'
  | 'pending'

export type JudgeBreakdown = Record<DimensionId, number>

export type RubricVerdictMap = Record<RubricId, BinaryVerdict>

export type RubricNoteMap = Record<RubricId, string>

export type SourceAnchor = {
  page: number
  chunkId: string
  excerpt: string
}

export type TextbookChunk = {
  page: number
  chunkId: string
  label: string
  body: string
}

export type RoundTrace = {
  model: string
  temperature: number | null
  tokensIn: number
  tokensOut: number
  latencyMs: number
}

export type QuestionOption = {
  key: string
  text: string
}

export type RoundRecord = {
  round: number
  stage: GateStage
  passed: boolean
  ruleErrors: string[]
  /** 只要本轮未调用 Judge（被硬规则前置拦截或仅跑规则门禁），必须为 null。 */
  judgeScore: number | null
  judgeBreakdown: JudgeBreakdown | null
  rubricVerdicts: RubricVerdictMap | null
  rubricNotes: RubricNoteMap | null
  criticalZeroIds: RubricId[]
  evidenceQuote: string | null
  draftStem: string
  draftOptions: QuestionOption[]
  sourceAnchor: SourceAnchor
  tokensUsed: number
  trace: RoundTrace
}

export type CalibrationLedger = {
  totalReviewed: number
  falsePassCount: number
  thresholdMet: boolean
}

export type HumanDecision = 'pending' | 'approved' | 'rejected'

export type DemoPreset = {
  id: PresetId
  threadId: string
  label: string
  questionType: QuestionType
  title: string
  stem: string
  options: QuestionOption[]
  answer: string
  explanation: string
  chunks: TextbookChunk[]
  rounds: RoundRecord[]
  ledgerSeed: { totalReviewed: number; falsePassCount: number }
  endDecision: HumanDecision
}

export type WorkspaceViewMeta = {
  id: WorkspaceViewId
  label: string
  shortLabel: string
  summary: string
}

export type LangGraphNodeSpec = {
  id: LangGraphNodeId
  step: number
  label: string
  role: string
}

export type NodeSpanPayload = {
  spanId: string
  threadId: string
  checkpointStatus: string
  modelProfile: string
  temperature: number | null
  latencyMs: number
  promptTokens: number
  completionTokens: number
  inputSummary: string
  outputSummary: string
}

export type LangGraphNodeState = {
  id: LangGraphNodeId
  step: number
  label: string
  role: string
  status: LangGraphNodeStatus
  executed: boolean
  badge: string
  span: NodeSpanPayload
}

export type JudgeEngineeringSpec = {
  id: string
  badge: string
  title: string
  summary: string
  configLine: string
}

export type BinaryRubricDimension = {
  id: DimensionId
  order: number
  title: string
  rubricIds: RubricId[]
  totalWeight: number
}

export type BinaryRubricItem = {
  id: RubricId
  dimensionId: DimensionId
  dimensionTitle: string
  title: string
  criteria: string
  weight: number
  critical: boolean
}

export type BinaryRubricEvaluation = {
  score: number
  passed: boolean
  passIds: RubricId[]
  zeroIds: RubricId[]
  unknownIds: RubricId[]
  criticalZeroIds: RubricId[]
  dimensionBreakdown: JudgeBreakdown
}

export type RubricCalibrationVersion = {
  version: RubricVersionId
  step: number
  title: string
  targetRubricId: RubricId
  targetRubricTitle: string
  sampleSize: number
  promptDefinition: string
  changeHighlight: string
  unknownCount: number
  unknownRate: number
  iaaMatchCount: number
  iaaRate: number
  humanAiMatchCount: number
  humanAiRate: number
  cohenKappa: number
  gateReady: boolean
  statusBadge: string
  diagnosis: string
  disagreementCase: string
  nextActionLabel: string | null
}

export type BadCaseItem = {
  id: string
  title: string
  stage: string
  symptom: string
  category: string
  rootCause: string
  fixAction: string
  impactMetric: string
  regressionTag: string
}

export type RegressionSuiteStats = {
  baseCount: number
  addedCount: number
  totalCount: number
  allResolved: boolean
  byCategory: Record<string, { total: number; resolved: number }>
}

export type EnglishDemoState = {
  activeView: WorkspaceViewId
  preset: DemoPreset
  rounds: RoundRecord[]
  stage: GateStage
  humanDecision: HumanDecision
  inSampleBank: boolean
  activeAnchor: SourceAnchor | null
  focusTick: number
  selectedNodeId: LangGraphNodeId
  traceOpen: boolean
  exhausted: boolean
  ledger: CalibrationLedger
  rubricVersion: RubricVersionId
  selectedBadCaseId: string
  resolvedBadCaseIds: string[]
}

export type DemoAction =
  | { type: 'selectPreset'; presetId: PresetId }
  | { type: 'switchView'; view: WorkspaceViewId }
  | { type: 'runGate' }
  | { type: 'focusAnchor'; page: number; chunkId: string }
  | { type: 'selectNode'; nodeId: LangGraphNodeId }
  | { type: 'humanDecide'; decision: 'approve' | 'reject' }
  | { type: 'recordExtraReview' }
  | { type: 'toggleTrace' }
  | { type: 'selectRubricVersion'; version: RubricVersionId }
  | { type: 'advanceRubricVersion' }
  | { type: 'selectBadCase'; badCaseId: string }
  | { type: 'resolveBadCase'; badCaseId: string }
  | { type: 'reset' }

export type GateStep = {
  stage: GateStage
  label: string
  status: 'pending' | 'passed' | 'failed'
  round: number | null
  detail: string
}

export type RoundCard = {
  round: number
  stage: GateStage
  passed: boolean
  ruleErrors: string[]
  judgeScore: number | null
  judgeBreakdown: JudgeBreakdown | null
  rubricVerdicts: RubricVerdictMap | null
  rubricNotes: RubricNoteMap | null
  criticalZeroIds: RubricId[]
  evidenceQuote: string | null
  tokensUsed: number
  revisionDelta: number | null
}

export type TraceRow = {
  round: number
  model: string
  temperature: number | null
  tokensIn: number
  tokensOut: number
  latencyMs: number
  cost: number
}

export type DemoContract = {
  projectName: string
  workbenchName: string
  actions: string[]
  views: WorkspaceViewId[]
  nodes: LangGraphNodeId[]
  invariants: string[]
  gates: Array<{ stage: GateStage; label: string }>
  thresholds: {
    quality: number
    maxRevisionRounds: number
    reviewedTarget: number
    falsePassTarget: number
    calibrationSetSize: number
    iaaThreshold: number
    humanAiThreshold: number
    regressionBaseCount: number
    rubric: JudgeBreakdown
  }
  binaryRubrics: Array<{
    id: RubricId
    dimensionId: DimensionId
    weight: number
    critical: boolean
  }>
  calibrationVersions: Array<{
    version: RubricVersionId
    unknownRate: number
    iaaRate: number
    humanAiRate: number
    gateReady: boolean
  }>
  badCases: Array<{ id: string; category: string }>
  presets: Array<{
    id: string
    label: string
    questionType: QuestionType
    clicksToEnd: number
    rounds: Array<{
      round: number
      stage: GateStage
      passed: boolean
      judgeScore: number | null
      tokensUsed: number
      page: number
      chunkId: string
    }>
    ledgerSeed: { totalReviewed: number; falsePassCount: number; thresholdMet: boolean }
  }>
}

export const PROJECT_NAME: string = machine.PROJECT_NAME
export const WORKBENCH_NAME: string = machine.WORKBENCH_NAME
export const GENERATOR_MODEL: string = machine.GENERATOR_MODEL
export const JUDGE_MODEL: string = machine.JUDGE_MODEL
export const RETRIEVER_MODEL: string = machine.RETRIEVER_MODEL
export const RULE_ENGINE: string = machine.RULE_ENGINE

export const QUALITY_THRESHOLD: number = machine.QUALITY_THRESHOLD
export const MAX_REVISION_ROUNDS: number = machine.MAX_REVISION_ROUNDS
export const REVIEW_TARGET: number = machine.REVIEW_TARGET
export const FALSE_PASS_TARGET: number = machine.FALSE_PASS_TARGET
export const COST_PER_1K_TOKENS: number = machine.COST_PER_1K_TOKENS

export const CALIBRATION_SET_SIZE: number = machine.CALIBRATION_SET_SIZE
export const IAA_THRESHOLD: number = machine.IAA_THRESHOLD
export const HUMAN_AI_THRESHOLD: number = machine.HUMAN_AI_THRESHOLD
export const UNKNOWN_TARGET_MAX: number = machine.UNKNOWN_TARGET_MAX
export const REGRESSION_BASE_COUNT: number = machine.REGRESSION_BASE_COUNT

export const BINARY_VERDICTS = machine.BINARY_VERDICTS as readonly BinaryVerdict[]
export const WORKSPACE_VIEWS = machine.WORKSPACE_VIEWS as WorkspaceViewMeta[]
export const ACTION_NAMES = machine.ACTION_NAMES as readonly string[]
export const GATE_LABELS: Record<GateStage, string> = machine.GATE_LABELS
export const LANGGRAPH_NODE_SPECS = machine.LANGGRAPH_NODE_SPECS as LangGraphNodeSpec[]
export const JUDGE_ENGINEERING_SPECS = machine.JUDGE_ENGINEERING_SPECS as JudgeEngineeringSpec[]
export const JUDGE_SCHEMA_SNIPPET: string = machine.JUDGE_SCHEMA_SNIPPET
export const BINARY_RUBRIC_DIMENSIONS = machine.BINARY_RUBRIC_DIMENSIONS as BinaryRubricDimension[]
export const BINARY_RUBRIC_ITEMS = machine.BINARY_RUBRIC_ITEMS as BinaryRubricItem[]
export const RUBRIC_WEIGHTS: JudgeBreakdown = machine.RUBRIC_WEIGHTS
export const RUBRIC_CALIBRATION_VERSIONS =
  machine.RUBRIC_CALIBRATION_VERSIONS as RubricCalibrationVersion[]
export const BAD_CASES = machine.BAD_CASES as BadCaseItem[]
export const INVARIANTS: string[] = machine.INVARIANTS
export const PRESET_IDS: PresetId[] = machine.PRESET_IDS as PresetId[]

export const evaluateBinaryRubrics = machine.evaluateBinaryRubrics as (
  verdicts: RubricVerdictMap
) => BinaryRubricEvaluation
export const demoPreset = machine.demoPreset as (id: PresetId) => DemoPreset
export const createDemoState = machine.createDemoState as (
  preset?: PresetId | DemoPreset
) => EnglishDemoState
export const reduceDemo = machine.reduceDemo as (
  state: EnglishDemoState,
  action: DemoAction
) => EnglishDemoState
export const isFinished = machine.isFinished as (state: EnglishDemoState) => boolean
export const gateRail = machine.gateRail as (state: EnglishDemoState) => GateStep[]
export const roundCards = machine.roundCards as (state: EnglishDemoState) => RoundCard[]
export const langGraphNodes = machine.langGraphNodes as (
  state: EnglishDemoState
) => LangGraphNodeState[]
export const selectedNodeSpan = machine.selectedNodeSpan as (
  state: EnglishDemoState
) => LangGraphNodeState
export const currentRubricCalibration = machine.currentRubricCalibration as (
  state: EnglishDemoState
) => RubricCalibrationVersion
export const regressionSuiteStats = machine.regressionSuiteStats as (
  state: EnglishDemoState
) => RegressionSuiteStats
export const estimateCost = machine.estimateCost as (tokensUsed: number) => number
export const traceRows = machine.traceRows as (state: EnglishDemoState) => TraceRow[]
export const anchorLabel = machine.anchorLabel as (
  preset: DemoPreset,
  anchor: SourceAnchor
) => string
export const clicksToEnd = machine.clicksToEnd as (preset: DemoPreset) => number
export const demoContract = machine.demoContract as () => DemoContract
