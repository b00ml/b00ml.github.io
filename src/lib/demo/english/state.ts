/**
 * English workbench three-gate demo — typed face of the state machine.
 *
 * The single implementation lives in `machine.js`: plain JavaScript, because the
 * demo page in `public/projects/english-content-workbench/demo/` inlines it
 * verbatim and a static asset cannot import a module at runtime. `mirror.test.ts`
 * fails if the inlined copy ever drifts by a byte, so the code the browser runs
 * and the code the unit tests pin are provably the same.
 *
 * This file only adds the types the rest of `src/` and the tests need.
 */

import * as machine from './machine.js'

export type GateStage = 'schema-rule' | 'llm-judge' | 'human-review'

export type QuestionType = 'cloze' | 'reading' | 'mcq'

export type PresetId = 'cloze-rule-block' | 'reading-low-score' | 'false-pass-calibration'

export type JudgeBreakdown = {
  accuracy: number
  uniqueness: number
  distractors: number
}

export type SourceAnchor = {
  page: number
  chunkId: string
  excerpt: string
}

/** A structured chunk of the faux textbook page the right pane scrolls. */
export type TextbookChunk = {
  page: number
  chunkId: string
  label: string
  body: string
}

/** What one call to a model (or to the rule engine) cost. */
export type RoundTrace = {
  model: string
  tokensIn: number
  tokensOut: number
  latencyMs: number
}

export type RoundRecord = {
  round: number
  stage: GateStage
  passed: boolean
  ruleErrors: string[]
  /** `null` whenever the model never ran on this round — rules precede the model. */
  judgeScore: number | null
  judgeBreakdown: JudgeBreakdown | null
  draftStem: string
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
  label: string
  questionType: QuestionType
  title: string
  stem: string
  options: Array<{ key: string; text: string }>
  answer: string
  explanation: string
  chunks: TextbookChunk[]
  rounds: RoundRecord[]
  ledgerSeed: { totalReviewed: number; falsePassCount: number }
  /** The state this preset is scripted to end on, used to drive the demo. */
  endDecision: HumanDecision
}

export type EnglishDemoState = {
  preset: DemoPreset
  rounds: RoundRecord[]
  stage: GateStage
  humanDecision: HumanDecision
  inSampleBank: boolean
  activeAnchor: SourceAnchor | null
  focusTick: number
  traceOpen: boolean
  exhausted: boolean
  ledger: CalibrationLedger
}

export type DemoAction =
  | { type: 'selectPreset'; presetId: PresetId }
  | { type: 'runGate' }
  | { type: 'focusAnchor'; page: number; chunkId: string }
  | { type: 'humanDecide'; decision: 'approve' | 'reject' }
  | { type: 'toggleTrace' }
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
  tokensUsed: number
  revisionDelta: number | null
}

export type TraceRow = {
  round: number
  model: string
  tokensIn: number
  tokensOut: number
  latencyMs: number
  cost: number
}

export type DemoContract = {
  actions: string[]
  invariants: string[]
  gates: Array<{ stage: GateStage; label: string }>
  thresholds: {
    quality: number
    maxRevisionRounds: number
    reviewedTarget: number
    falsePassTarget: number
    rubric: { accuracy: number; uniqueness: number; distractors: number }
  }
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

export const QUALITY_THRESHOLD: number = machine.QUALITY_THRESHOLD
export const MAX_REVISION_ROUNDS: number = machine.MAX_REVISION_ROUNDS
export const REVIEW_TARGET: number = machine.REVIEW_TARGET
export const FALSE_PASS_TARGET: number = machine.FALSE_PASS_TARGET
export const COST_PER_1K_TOKENS: number = machine.COST_PER_1K_TOKENS
export const RUBRIC_WEIGHTS: JudgeBreakdown = machine.RUBRIC_WEIGHTS
export const ACTION_NAMES = machine.ACTION_NAMES as readonly string[]
export const GATE_LABELS: Record<GateStage, string> = machine.GATE_LABELS
export const INVARIANTS: string[] = machine.INVARIANTS
export const PRESET_IDS: PresetId[] = machine.PRESET_IDS as PresetId[]

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
export const estimateCost = machine.estimateCost as (tokensUsed: number) => number
export const traceRows = machine.traceRows as (state: EnglishDemoState) => TraceRow[]
export const anchorLabel = machine.anchorLabel as (preset: DemoPreset, anchor: SourceAnchor) => string
export const clicksToEnd = machine.clicksToEnd as (preset: DemoPreset) => number
export const demoContract = machine.demoContract as () => DemoContract