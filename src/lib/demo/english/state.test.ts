import { describe, expect, test } from 'bun:test'

import {
  ACTION_NAMES,
  anchorLabel,
  BAD_CASES,
  BINARY_RUBRIC_DIMENSIONS,
  BINARY_RUBRIC_ITEMS,
  BINARY_VERDICTS,
  CALIBRATION_SET_SIZE,
  createDemoState,
  currentRubricCalibration,
  demoContract,
  demoPreset,
  estimateCost,
  evaluateBinaryRubrics,
  FALSE_PASS_TARGET,
  gateRail,
  GENERATOR_MODEL,
  HUMAN_AI_THRESHOLD,
  IAA_THRESHOLD,
  isFinished,
  JUDGE_ENGINEERING_SPECS,
  JUDGE_MODEL,
  LANGGRAPH_NODE_SPECS,
  langGraphNodes,
  MAX_REVISION_ROUNDS,
  PRESET_IDS,
  PROJECT_NAME,
  QUALITY_THRESHOLD,
  reduceDemo,
  REGRESSION_BASE_COUNT,
  regressionSuiteStats,
  REVIEW_TARGET,
  roundCards,
  RUBRIC_CALIBRATION_VERSIONS,
  selectedNodeSpan,
  traceRows,
  WORKBENCH_NAME,
  WORKSPACE_VIEWS,
  type DemoAction,
  type DemoPreset,
  type EnglishDemoState,
  type GateStage,
  type RoundRecord,
  type RubricVerdictMap
} from './state'

/** 构造测试专用轮次记录，覆盖边界分支（如改版轮次耗尽与关键项一票否决）。 */
function scriptedRound(
  index: number,
  stage: GateStage,
  passed: boolean,
  score: number | null,
  tokensUsed: number,
  extra: Partial<RoundRecord> = {}
): RoundRecord {
  return {
    round: index,
    stage,
    passed,
    ruleErrors: [],
    judgeScore: score,
    judgeBreakdown:
      score === null
        ? null
        : { alignment: score, uniqueness: score, distractors: score, grounding: score },
    rubricVerdicts:
      score === null ? null : { R1: '1', R2: '1', R3: '0', R4: '1', R5: '1', R6: 'unknown' },
    rubricNotes: null,
    criticalZeroIds: [],
    evidenceQuote: score === null ? null : 'chunk-evidence',
    draftStem: `draft-${index}`,
    draftOptions: [
      { key: 'A', text: 'opt-a' },
      { key: 'B', text: 'opt-b' },
      { key: 'C', text: 'opt-c' },
      { key: 'D', text: 'opt-d' }
    ],
    sourceAnchor: { page: 10 + index, chunkId: `c${index}`, excerpt: `chunk-${index}` },
    tokensUsed,
    trace: {
      model: score === null ? 'Pydantic v2 + YAML 硬规则引擎' : JUDGE_MODEL,
      temperature: score === null ? null : 0.0,
      tokensIn: tokensUsed === 0 ? 0 : Math.round(tokensUsed * 0.8),
      tokensOut: tokensUsed === 0 ? 0 : tokensUsed - Math.round(tokensUsed * 0.8),
      latencyMs: tokensUsed === 0 ? 8 : 4200
    },
    ...extra
  }
}

function driveToEnd(preset: DemoPreset | string): { state: EnglishDemoState; clicks: number } {
  let state = createDemoState(preset as DemoPreset)
  let clicks = 1
  for (let step = 0; step < 15 && !isFinished(state); step += 1) {
    const before = state
    state =
      state.stage === 'human-review'
        ? reduceDemo(state, {
            type: 'humanDecide',
            decision: state.preset.endDecision === 'approved' ? 'approve' : 'reject'
          })
        : reduceDemo(state, { type: 'runGate' })
    clicks += 1
    if (state === before) break
  }
  return { state, clicks }
}

describe('project identity, views and presets', () => {
  test('uses the canonical project and workbench titles and three workspace views', () => {
    expect(PROJECT_NAME).toBe('英语教研内容生产工作台')
    expect(WORKBENCH_NAME).toBe('英语教研内容生产工作台 · LangGraph 观测与评测闭环台')
    expect(WORKSPACE_VIEWS.map((v) => v.id)).toEqual(['pipeline', 'calibration', 'flywheel'])
  })

  test('ships three switchable presets, one per question type, each finishing in <= 5 clicks', () => {
    expect(PRESET_IDS).toHaveLength(3)
    expect(PRESET_IDS.map((id) => demoPreset(id).questionType)).toEqual(['cloze', 'reading', 'mcq'])

    for (const id of PRESET_IDS) {
      const preset = demoPreset(id)
      const initial = createDemoState(id)
      expect(initial.activeView).toBe('pipeline')
      expect(initial.rounds).toEqual([])
      expect(initial.stage).toBe(preset.rounds[0].stage)
      expect(initial.humanDecision).toBe('pending')
      expect(initial.inSampleBank).toBe(false)
      expect(initial.activeAnchor).toBeNull()
      expect(initial.ledger.thresholdMet).toBe(false)

      const { state, clicks } = driveToEnd(id)
      expect(isFinished(state)).toBe(true)
      expect(clicks).toBeLessThanOrEqual(5)
    }
  })
})

describe('Pillar A · LangGraph 7-node Trace pipeline and Span inspection', () => {
  test('renders the 7 canonical LangGraph nodes in exact execution order', () => {
    expect(LANGGRAPH_NODE_SPECS.map((n) => n.id)).toEqual([
      'retrieve_chunks',
      'generate_draft',
      'schema_rule_guard',
      'binary_rubric_judge',
      'revise_draft',
      'human_interrupt',
      'sample_or_badcase'
    ])
  })

  test('allows inspecting executed node Spans and ignores unexecuted pending nodes', () => {
    let state = createDemoState('cloze-rule-block')
    const initialNodes = langGraphNodes(state)
    expect(initialNodes[0].executed).toBe(true) // retrieve_chunks
    expect(initialNodes[1].executed).toBe(true) // generate_draft
    expect(initialNodes[2].executed).toBe(false) // schema_rule_guard pending

    // Selecting pending node is a no-op
    expect(reduceDemo(state, { type: 'selectNode', nodeId: 'human_interrupt' })).toBe(state)

    // Selecting retrieve_chunks updates selectedNodeSpan
    state = reduceDemo(state, { type: 'selectNode', nodeId: 'retrieve_chunks' })
    expect(state.selectedNodeId).toBe('retrieve_chunks')
    expect(selectedNodeSpan(state).span.spanId).toContain('span-01-retrieve')

    // Running Gate 1 (hard rule block) marks schema_rule_guard blocked and short-circuits judge
    state = reduceDemo(state, { type: 'runGate' })
    const afterBlock = langGraphNodes(state)
    const ruleNode = afterBlock.find((n) => n.id === 'schema_rule_guard')!
    const judgeNode = afterBlock.find((n) => n.id === 'binary_rubric_judge')!
    expect(ruleNode.status).toBe('blocked')
    expect(ruleNode.span.promptTokens).toBe(0)
    expect(ruleNode.span.completionTokens).toBe(0)
    expect(judgeNode.status).toBe('short-circuited')
    expect(judgeNode.executed).toBe(true)
    expect(judgeNode.span.promptTokens).toBe(0)

    // Running Gate 2 (revised draft clears Judge) pauses at human_interrupt
    state = reduceDemo(state, { type: 'runGate' })
    const atInterrupt = langGraphNodes(state)
    const interruptNode = atInterrupt.find((n) => n.id === 'human_interrupt')!
    expect(interruptNode.status).toBe('interrupted')
    expect(interruptNode.executed).toBe(true)
    expect(interruptNode.span.checkpointStatus).toContain('INTERRUPTED')
  })
})

describe('Pillar B · Judge engineering setup and 0-token rule short-circuit', () => {
  test('decouples generator and judge models and enforces temperature = 0.0 + Evidence-First', () => {
    expect(GENERATOR_MODEL).not.toBe(JUDGE_MODEL)
    expect(JUDGE_ENGINEERING_SPECS).toHaveLength(4)

    for (const id of PRESET_IDS) {
      for (const entry of demoPreset(id).rounds) {
        if (entry.stage === 'schema-rule') {
          expect(entry.judgeScore).toBeNull()
          expect(entry.rubricVerdicts).toBeNull()
          expect(entry.evidenceQuote).toBeNull()
          expect(entry.tokensUsed).toBe(0)
          expect(entry.trace.tokensIn).toBe(0)
          expect(entry.trace.tokensOut).toBe(0)
          expect(estimateCost(entry.tokensUsed)).toBe(0)
        } else {
          expect(entry.trace.model).toBe(JUDGE_MODEL)
          expect(entry.trace.temperature).toBe(0.0)
          expect(entry.evidenceQuote).toBeTruthy()
          expect(entry.trace.tokensIn + entry.trace.tokensOut).toBe(entry.tokensUsed)
        }
      }
    }
  })
})

describe('Pillar C & D · 4 dimensions × 6 Binary Rubrics (1 / 0 / unknown)', () => {
  test('drills down into 4 dimensions and 6 binary items summing to 100 points', () => {
    expect(BINARY_VERDICTS).toEqual(['1', '0', 'unknown'])
    expect(BINARY_RUBRIC_DIMENSIONS).toHaveLength(4)
    expect(BINARY_RUBRIC_ITEMS).toHaveLength(6)
    const totalWeight = BINARY_RUBRIC_ITEMS.reduce((sum, item) => sum + item.weight, 0)
    expect(totalWeight).toBe(100)

    for (const dim of BINARY_RUBRIC_DIMENSIONS) {
      const subSum = BINARY_RUBRIC_ITEMS.filter((i) => i.dimensionId === dim.id).reduce(
        (sum, i) => sum + i.weight,
        0
      )
      expect(subSum).toBe(dim.totalWeight)
    }
  })

  test('computes composite readiness score from 1/0/unknown and blocks critical 0s even above 70', () => {
    const allPass = evaluateBinaryRubrics({
      R1: '1',
      R2: '1',
      R3: '1',
      R4: '1',
      R5: '1',
      R6: '1'
    })
    expect(allPass.score).toBe(100)
    expect(allPass.passed).toBe(true)
    expect(allPass.criticalZeroIds).toEqual([])

    // R5 (grounding, weight 16, critical: true) is '0', all others '1' -> score 84 >= 70, MUST STILL FAIL!
    const hallucinatedCitation = evaluateBinaryRubrics({
      R1: '1',
      R2: '1',
      R3: '1',
      R4: '1',
      R5: '0',
      R6: '1'
    })
    expect(hallucinatedCitation.score).toBe(84)
    expect(hallucinatedCitation.score).toBeGreaterThanOrEqual(QUALITY_THRESHOLD)
    expect(hallucinatedCitation.criticalZeroIds).toEqual(['R5'])
    expect(hallucinatedCitation.passed).toBe(false)

    // Invalid scale values (like fuzzy '3' or '4') are rejected
    expect(() =>
      evaluateBinaryRubrics({
        R1: '4' as unknown as '1',
        R2: '1',
        R3: '1',
        R4: '1',
        R5: '1',
        R6: '1'
      })
    ).toThrow(/invalid binary verdict/)
  })

  test('low binary score auto-revises with diagnostics and caps revisions at 3 rounds', () => {
    let state = createDemoState('reading-low-score')
    state = reduceDemo(state, { type: 'runGate' }) // Round 1 rule pass
    expect(state.rounds[0].judgeScore).toBeNull()
    expect(state.stage).toBe('llm-judge')

    state = reduceDemo(state, { type: 'runGate' }) // Round 2 judge 62 (R2=unknown, R3=0)
    expect(state.rounds[1].judgeScore).toBe(62)
    expect(state.rounds[1].rubricVerdicts?.R2).toBe('unknown')
    expect(state.rounds[1].rubricVerdicts?.R3).toBe('0')
    expect(state.rounds[1].passed).toBe(false)
    expect(state.stage).toBe('llm-judge')
    expect(reduceDemo(state, { type: 'humanDecide', decision: 'approve' })).toBe(state)

    state = reduceDemo(state, { type: 'runGate' }) // Round 3 revised -> 100
    expect(state.rounds[2].judgeScore).toBe(100)
    expect(state.rounds[2].passed).toBe(true)
    expect(state.stage).toBe('human-review')
    expect(state.inSampleBank).toBe(false)
    expect(roundCards(state)[2].revisionDelta).toBe(38)

    // Revision cap guard
    const endless: DemoPreset = {
      ...demoPreset('reading-low-score'),
      endDecision: 'pending',
      rounds: [
        scriptedRound(1, 'llm-judge', false, 60, 3000),
        scriptedRound(2, 'llm-judge', false, 62, 3100),
        scriptedRound(3, 'llm-judge', false, 65, 3200),
        scriptedRound(4, 'llm-judge', true, 90, 3300)
      ]
    }
    const capped = driveToEnd(endless)
    expect(capped.state.rounds).toHaveLength(MAX_REVISION_ROUNDS)
    expect(capped.state.exhausted).toBe(true)
    expect(capped.state.stage).toBe('human-review')
    expect(reduceDemo(capped.state, { type: 'humanDecide', decision: 'approve' })).toBe(
      capped.state
    )
  })
})

describe('Pillar E · unknown rate root-cause + 85%/90% calibration bench + 20/5 false-pass guard', () => {
  test('steps R3 calibration from v1 (noisy) -> v2 (IAA met) -> v3 (IAA >=85% & Human-AI >=90% met)', () => {
    expect(CALIBRATION_SET_SIZE).toBe(40)
    expect(IAA_THRESHOLD).toBe(85)
    expect(HUMAN_AI_THRESHOLD).toBe(90)
    expect(RUBRIC_CALIBRATION_VERSIONS).toHaveLength(3)

    let state = createDemoState('cloze-rule-block')
    const v1 = currentRubricCalibration(state)
    expect(v1.version).toBe('v1')
    expect(v1.unknownRate).toBe(25.0)
    expect(v1.iaaRate).toBe(72.5)
    expect(v1.humanAiRate).toBe(67.5)
    expect(v1.gateReady).toBe(false)

    state = reduceDemo(state, { type: 'advanceRubricVersion' })
    const v2 = currentRubricCalibration(state)
    expect(v2.version).toBe('v2')
    expect(v2.unknownRate).toBe(10.0)
    expect(v2.iaaRate).toBe(85.0)
    expect(v2.iaaRate).toBeGreaterThanOrEqual(IAA_THRESHOLD)
    expect(v2.humanAiRate).toBe(82.5)
    expect(v2.humanAiRate).toBeLessThan(HUMAN_AI_THRESHOLD)
    expect(v2.gateReady).toBe(false)

    state = reduceDemo(state, { type: 'advanceRubricVersion' })
    const v3 = currentRubricCalibration(state)
    expect(v3.version).toBe('v3')
    expect(v3.unknownRate).toBe(2.5)
    expect(v3.iaaRate).toBe(90.0)
    expect(v3.humanAiRate).toBe(92.5)
    expect(v3.cohenKappa).toBe(0.85)
    expect(v3.gateReady).toBe(true)

    // Advancing past v3 is a safe no-op
    expect(reduceDemo(state, { type: 'advanceRubricVersion' })).toBe(state)
  })

  test('enforces the 20-reviewed AND 5-false-pass cold-start guard on single-question review', () => {
    let state = createDemoState('false-pass-calibration')
    state = reduceDemo(state, { type: 'runGate' })
    state = reduceDemo(state, { type: 'runGate' })
    expect(state.rounds[1].judgeScore).toBe(89)
    expect(state.ledger).toEqual({ totalReviewed: 18, falsePassCount: 4, thresholdMet: false })

    // Human rejects the 89-point dual-solution question -> 19 reviewed, 5 false passes (still false!)
    state = reduceDemo(state, { type: 'humanDecide', decision: 'reject' })
    expect(state.humanDecision).toBe('rejected')
    expect(state.inSampleBank).toBe(false)
    expect(state.ledger).toEqual({ totalReviewed: 19, falsePassCount: 5, thresholdMet: false })

    // Recording the 20th reviewed sample crosses both 20 and 5 thresholds -> thresholdMet: true
    state = reduceDemo(state, { type: 'recordExtraReview' })
    expect(state.ledger).toEqual({ totalReviewed: 20, falsePassCount: 5, thresholdMet: true })
    expect(REVIEW_TARGET).toBe(20)
    expect(FALSE_PASS_TARGET).toBe(5)
  })
})

describe('Pillar F · Bad Case attribution matrix and golden regression suite flywheel', () => {
  test('attributes Bad Cases across rule, RAG, Judge rubric, and prompt layers and increments suite count', () => {
    expect(BAD_CASES.map((b) => b.id)).toEqual(['BC-01', 'BC-02', 'BC-03', 'BC-04'])
    let state = createDemoState('cloze-rule-block')
    expect(regressionSuiteStats(state).totalCount).toBe(REGRESSION_BASE_COUNT)
    expect(regressionSuiteStats(state).addedCount).toBe(0)

    state = reduceDemo(state, { type: 'selectBadCase', badCaseId: 'BC-02' })
    expect(state.selectedBadCaseId).toBe('BC-02')

    state = reduceDemo(state, { type: 'resolveBadCase', badCaseId: 'BC-02' })
    expect(regressionSuiteStats(state).addedCount).toBe(1)
    expect(regressionSuiteStats(state).totalCount).toBe(REGRESSION_BASE_COUNT + 1)

    // Idempotent: resolving the same Bad Case twice never double-counts
    expect(reduceDemo(state, { type: 'resolveBadCase', badCaseId: 'BC-02' })).toBe(state)

    state = reduceDemo(state, { type: 'resolveBadCase', badCaseId: 'BC-03' })
    expect(regressionSuiteStats(state).totalCount).toBe(REGRESSION_BASE_COUNT + 2)
  })
})

describe('source anchors, view switching, reset and contract', () => {
  test('every round anchor resolves to an authentic textbook chunk and focusAnchor validates it', () => {
    for (const id of PRESET_IDS) {
      const preset = demoPreset(id)
      const { state } = driveToEnd(id)
      for (const entry of state.rounds) {
        const chunk = preset.chunks.find(
          (item) =>
            item.page === entry.sourceAnchor.page && item.chunkId === entry.sourceAnchor.chunkId
        )
        expect(chunk).toBeDefined()
        expect(anchorLabel(preset, entry.sourceAnchor)).toBe(chunk!.label)
        expect(chunk!.body.includes(entry.sourceAnchor.excerpt.slice(0, 12))).toBe(true)
      }
    }

    const ran = reduceDemo(createDemoState('cloze-rule-block'), { type: 'runGate' })
    const anchor = ran.rounds[0].sourceAnchor
    const focused = reduceDemo(ran, {
      type: 'focusAnchor',
      page: anchor.page,
      chunkId: anchor.chunkId
    })
    expect(focused.focusTick).toBe(ran.focusTick + 1)
    expect(reduceDemo(ran, { type: 'focusAnchor', page: 999, chunkId: 'nope' })).toBe(ran)
  })

  test('reset restores simulation state cleanly while preserving the active workspace view', () => {
    const initial = createDemoState('cloze-rule-block')
    let state = reduceDemo(initial, { type: 'runGate' })
    state = reduceDemo(state, { type: 'advanceRubricVersion' })
    state = reduceDemo(state, { type: 'resolveBadCase', badCaseId: 'BC-01' })
    state = reduceDemo(state, { type: 'toggleTrace' })
    expect(reduceDemo(state, { type: 'reset' })).toEqual(initial)

    // When on View 2 (calibration), reset keeps View 2 active while resetting data to v1
    const inCalib = reduceDemo(state, { type: 'switchView', view: 'calibration' })
    const resetInCalib = reduceDemo(inCalib, { type: 'reset' })
    expect(resetInCalib.activeView).toBe('calibration')
    expect(resetInCalib.rubricVersion).toBe('v1')
    expect(resetInCalib.resolvedBadCaseIds).toEqual([])
  })

  test('gateRail, traceRows, unknown actions and demoContract stay completely consistent', () => {
    const base = createDemoState('reading-low-score')
    expect(reduceDemo(base, { type: 'unknown' } as unknown as DemoAction)).toBe(base)
    expect(gateRail(base).map((g) => g.status)).toEqual(['pending', 'pending', 'pending'])

    const contract = demoContract()
    expect(contract.actions).toEqual([...ACTION_NAMES])
    expect(contract.nodes).toHaveLength(7)
    expect(contract.binaryRubrics).toHaveLength(6)
    expect(contract.calibrationVersions).toHaveLength(3)
    expect(contract.badCases).toHaveLength(4)
    expect(contract.presets).toHaveLength(3)

    const driven = driveToEnd('reading-low-score').state
    const rows = traceRows(driven)
    expect(rows).toHaveLength(3)
    expect(rows[0].cost).toBe(0)
    expect(rows[2].cost).toBeGreaterThan(rows[1].cost)
  })
})
