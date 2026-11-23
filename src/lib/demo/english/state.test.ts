import { describe, expect, test } from 'bun:test'

import {
  ACTION_NAMES,
  anchorLabel,
  createDemoState,
  demoContract,
  demoPreset,
  estimateCost,
  FALSE_PASS_TARGET,
  gateRail,
  isFinished,
  MAX_REVISION_ROUNDS,
  PRESET_IDS,
  QUALITY_THRESHOLD,
  reduceDemo,
  REVIEW_TARGET,
  roundCards,
  RUBRIC_WEIGHTS,
  traceRows,
  type DemoPreset,
  type DemoAction,
  type EnglishDemoState,
  type GateStage,
  type RoundRecord
} from './state'

/** A scripted round with only the fields a test cares about spelled out. */
function round(
  index: number,
  stage: GateStage,
  passed: boolean,
  score: number | null,
  tokensUsed: number,
  extra: Partial<RoundRecord> = {}
): RoundRecord {
  const breakdown = score === null ? null : { accuracy: score, uniqueness: score, distractors: score }
  return {
    round: index,
    stage,
    passed,
    ruleErrors: [],
    judgeScore: score,
    judgeBreakdown: breakdown,
    draftStem: `draft-${index}`,
    sourceAnchor: { page: 10 + index, chunkId: `c${index}`, excerpt: `chunk-${index}` },
    tokensUsed,
    trace: {
      model: score === null ? '规则引擎 · Pydantic 二次校验' : 'judge-model',
      tokensIn: tokensUsed === 0 ? 0 : Math.round(tokensUsed * 0.8),
      tokensOut: tokensUsed === 0 ? 0 : tokensUsed - Math.round(tokensUsed * 0.8),
      latencyMs: tokensUsed === 0 ? 8 : 4200
    },
    ...extra
  }
}

/**
 * Drive one preset the way the shipped page does: click the preset tab, then
 * keep pressing the gate button (or the human decision the preset ends on).
 */
function driveToEnd(preset: DemoPreset | string): { state: EnglishDemoState; clicks: number } {
  let state = createDemoState(preset as DemoPreset)
  let clicks = 1 // selecting the preset is the first click
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

describe('three-gate demo presets', () => {
  test('ships exactly three switchable presets, one per question type', () => {
    expect(PRESET_IDS).toHaveLength(3)
    const types = PRESET_IDS.map((id) => demoPreset(id).questionType)
    expect(types).toEqual(['cloze', 'reading', 'mcq'])
  })

  test('every preset starts in the first gate with nothing revealed and nothing banked', () => {
    for (const id of PRESET_IDS) {
      const preset = demoPreset(id)
      const state = createDemoState(id)
      expect(state.rounds).toEqual([])
      expect(state.stage).toBe(preset.rounds[0].stage as GateStage)
      expect(state.humanDecision).toBe('pending')
      expect(state.inSampleBank).toBe(false)
      expect(state.activeAnchor).toBeNull()
      expect(state.traceOpen).toBe(false)
      expect(state.ledger.thresholdMet).toBe(false)
    }
  })

  test('every preset reaches its end state in five clicks or fewer', () => {
    for (const id of PRESET_IDS) {
      const { state, clicks } = driveToEnd(id)
      expect(isFinished(state)).toBe(true)
      expect(clicks).toBeLessThanOrEqual(5)
    }
  })

  test('only a scripted round nobody can skip keeps the demo honest about round order', () => {
    for (const id of PRESET_IDS) {
      const preset = demoPreset(id)
      preset.rounds.forEach((entry, index) => {
        expect(entry.round).toBe(index + 1)
        // A rule round that passes is still a rule round: it must not have been
        // scored by the model, and a judge round must never come before it.
        if (entry.stage === 'schema-rule') expect(entry.judgeScore).toBeNull()
        if (entry.stage === 'llm-judge') expect(entry.ruleErrors).toEqual([])
      })
    }
  })
})

describe('gate 1 · deterministic rules run before the model', () => {
  test('a round stopped by cross-field rules carries no judge score and spends zero judge tokens', () => {
    for (const id of PRESET_IDS) {
      for (const entry of demoPreset(id).rounds) {
        if (entry.stage !== 'schema-rule' || entry.passed) continue
        expect(entry.ruleErrors.length).toBeGreaterThan(0)
        expect(entry.judgeScore).toBeNull()
        expect(entry.judgeBreakdown).toBeNull()
        expect(entry.tokensUsed).toBe(0)
        expect(entry.trace.tokensIn).toBe(0)
        expect(entry.trace.tokensOut).toBe(0)
      }
    }

    const blocked = reduceDemo(createDemoState('cloze-rule-block'), { type: 'runGate' })
    expect(blocked.rounds).toHaveLength(1)
    const first = blocked.rounds[0]
    expect(first.stage).toBe('schema-rule')
    expect(first.passed).toBe(false)
    expect(first.judgeScore).toBeNull()
    expect(first.tokensUsed).toBe(0)
    expect(first.ruleErrors.join()).toMatch(/空位|重复/)
    // The rules failed, so the corrected draft is what the next click runs.
    expect(blocked.stage).toBe('llm-judge')
    expect(roundCards(blocked)[0].revisionDelta).toBeNull()
  })

  test('token accounting is the sum of the trace, and rules-only rounds cost nothing', () => {
    // Unit price from the platform's own config (COST_PER_1K_TOKENS = 0.002).
    expect(estimateCost(2000)).toBe(0.004)
    expect(estimateCost(0)).toBe(0)

    for (const id of PRESET_IDS) {
      const { state } = driveToEnd(id)
      for (const entry of state.rounds) {
        expect(entry.trace.tokensIn + entry.trace.tokensOut).toBe(entry.tokensUsed)
        if (entry.stage === 'schema-rule') expect(estimateCost(entry.tokensUsed)).toBe(0)
      }
    }
  })
})

describe('gate 2 · the judge score is a weighted rubric and below-70 auto-revises', () => {
  test('every judge score equals its weighted sub-scores, rounded', () => {
    const weights = { accuracy: 0.4, uniqueness: 0.3, distractors: 0.3 }
    expect(RUBRIC_WEIGHTS).toEqual(weights)
    for (const id of PRESET_IDS) {
      for (const entry of demoPreset(id).rounds) {
        if (entry.judgeScore === null || entry.judgeBreakdown === null) continue
        const weighted =
          entry.judgeBreakdown.accuracy * weights.accuracy +
          entry.judgeBreakdown.uniqueness * weights.uniqueness +
          entry.judgeBreakdown.distractors * weights.distractors
        expect(entry.judgeScore).toBe(Math.round(weighted))
      }
    }
  })

  test('a low score auto-advances to a revision round instead of asking a human', () => {
    let state = createDemoState('reading-low-score')
    state = reduceDemo(state, { type: 'runGate' }) // rules pass, no score yet
    expect(state.rounds[0].judgeScore).toBeNull()
    expect(state.stage).toBe('llm-judge')

    state = reduceDemo(state, { type: 'runGate' }) // judge 64
    expect(state.rounds[1].judgeScore).toBe(64)
    expect(state.rounds[1].passed).toBe(false)
    expect(state.stage).toBe('llm-judge') // still revising, not human review
    // A human decision is impossible before the judge is satisfied.
    expect(reduceDemo(state, { type: 'humanDecide', decision: 'approve' })).toBe(state)

    state = reduceDemo(state, { type: 'runGate' }) // judge 89
    expect(state.rounds[2].judgeScore).toBe(89)
    expect(state.stage).toBe('human-review')
    expect(state.humanDecision).toBe('pending')
    expect(state.inSampleBank).toBe(false)
    expect(roundCards(state)[2].revisionDelta).toBe(89 - 64)
  })

  test('a score at or above the threshold stops at human review and never banks itself', () => {
    const state = reduceDemo(createDemoState('false-pass-calibration'), { type: 'runGate' })
    const scored = reduceDemo(state, { type: 'runGate' })
    const last = scored.rounds[scored.rounds.length - 1]
    expect(last.judgeScore).toBeGreaterThanOrEqual(QUALITY_THRESHOLD)
    expect(scored.stage).toBe('human-review')
    expect(scored.humanDecision).toBe('pending')
    expect(scored.inSampleBank).toBe(false)

    // No amount of re-running the gate banks the question.
    const rerun = reduceDemo(scored, { type: 'runGate' })
    expect(rerun.rounds).toHaveLength(scored.rounds.length)
    expect(rerun.inSampleBank).toBe(false)
  })

  test('revision rounds are capped, and a case that exhausts them escalates to a human', () => {
    const failing = demoPreset('reading-low-score')
    const endless: DemoPreset = {
      ...failing,
      id: 'reading-low-score',
      endDecision: 'pending',
      rounds: [
        round(1, 'llm-judge', false, 61, 3000),
        round(2, 'llm-judge', false, 64, 3100),
        round(3, 'llm-judge', false, 66, 3200),
        round(4, 'llm-judge', true, 88, 3300)
      ]
    }
    const { state, clicks } = driveToEnd(endless)
    expect(clicks).toBe(4)
    expect(state.rounds).toHaveLength(MAX_REVISION_ROUNDS)
    expect(state.stage).toBe('human-review')
    expect(state.exhausted).toBe(true)
    expect(state.humanDecision).toBe('pending')
    expect(state.inSampleBank).toBe(false)
    expect(reduceDemo(state, { type: 'runGate' })).toBe(state)

    // Nothing to bank, so an approve click cannot invent one.
    expect(reduceDemo(state, { type: 'humanDecide', decision: 'approve' })).toBe(state)
    const rejected = reduceDemo(state, { type: 'humanDecide', decision: 'reject' })
    expect(rejected.ledger.totalReviewed).toBe(1)
    expect(rejected.ledger.falsePassCount).toBe(0)
    expect(rejected.ledger.thresholdMet).toBe(false)
  })
})

describe('gate 3 · source anchors', () => {
  test('clicking the anchor activates exactly one chunk: the current round source', () => {
    const base = reduceDemo(createDemoState('cloze-rule-block'), { type: 'runGate' })
    const current = base.rounds[base.rounds.length - 1].sourceAnchor
    expect(base.activeAnchor).toEqual(current)

    const focused = reduceDemo(base, {
      type: 'focusAnchor',
      page: current.page,
      chunkId: current.chunkId
    })
    expect(focused.activeAnchor).toEqual(current)
    expect(focused.focusTick).toBe(base.focusTick + 1)

    // A chunk that is not the current round's anchor cannot steal the highlight.
    const stale = reduceDemo(base, { type: 'focusAnchor', page: 999, chunkId: 'c9' })
    expect(stale.activeAnchor).toEqual(current)
    expect(stale.focusTick).toBe(base.focusTick)
  })

  test('every anchor resolves to a textbook chunk the page can scroll to', () => {
    for (const id of PRESET_IDS) {
      const preset = demoPreset(id)
      const { state } = driveToEnd(id)
      for (const entry of state.rounds) {
        const chunk = preset.chunks.find(
          (item) => item.page === entry.sourceAnchor.page && item.chunkId === entry.sourceAnchor.chunkId
        )
        expect(chunk).toBeDefined()
        expect(anchorLabel(preset, entry.sourceAnchor)).toBe(chunk!.label)
        expect(chunk!.body.includes(entry.sourceAnchor.excerpt.slice(0, 12))).toBe(true)
      }
    }
  })
})

describe('gate 3 · human review and false-pass calibration', () => {
  test('approving a scored question moves it into the sample bank and labels one sample', () => {
    const scored = reduceDemo(
      reduceDemo(createDemoState('false-pass-calibration'), { type: 'runGate' }),
      { type: 'runGate' }
    )
    const approved = reduceDemo(scored, { type: 'humanDecide', decision: 'approve' })
    expect(approved.humanDecision).toBe('approved')
    expect(approved.inSampleBank).toBe(true)
    expect(approved.ledger.totalReviewed).toBe(scored.ledger.totalReviewed + 1)
    expect(approved.ledger.falsePassCount).toBe(scored.ledger.falsePassCount)
  })

  test('rejecting a high score counts a false pass and keeps calibration inactive early', () => {
    const scored = reduceDemo(
      reduceDemo(createDemoState('false-pass-calibration'), { type: 'runGate' }),
      { type: 'runGate' }
    )
    expect(scored.ledger).toEqual({ totalReviewed: 18, falsePassCount: 4, thresholdMet: false })
    const rejected = reduceDemo(scored, { type: 'humanDecide', decision: 'reject' })
    expect(rejected.humanDecision).toBe('rejected')
    expect(rejected.inSampleBank).toBe(false)
    expect(rejected.ledger.totalReviewed).toBe(19)
    expect(rejected.ledger.falsePassCount).toBe(5)
    // 5 false passes are there, the reviewed count is not: both are required.
    expect(rejected.ledger.thresholdMet).toBe(false)
  })

  test('calibration activates only when both thresholds are met', () => {
    const preset = demoPreset('false-pass-calibration')
    const at = (totalReviewed: number, falsePassCount: number) => {
      const scored = reduceDemo(
        reduceDemo(createDemoState({ ...preset, ledgerSeed: { totalReviewed, falsePassCount } }), {
          type: 'runGate'
        }),
        { type: 'runGate' }
      )
      return reduceDemo(scored, { type: 'humanDecide', decision: 'reject' })
    }
    expect(at(19, 4).ledger).toEqual({
      totalReviewed: 20,
      falsePassCount: 5,
      thresholdMet: true
    })
    expect(at(18, 4).ledger).toEqual({
      totalReviewed: 19,
      falsePassCount: 5,
      thresholdMet: false
    })
    expect(at(19, 3).ledger).toEqual({
      totalReviewed: 20,
      falsePassCount: 4,
      thresholdMet: false
    })
    expect(REVIEW_TARGET).toBe(20)
    expect(FALSE_PASS_TARGET).toBe(5)
  })

  test('a human decision is only possible at the human review gate, once', () => {
    const fresh = createDemoState('false-pass-calibration')
    expect(reduceDemo(fresh, { type: 'humanDecide', decision: 'reject' })).toBe(fresh)

    const scored = reduceDemo(reduceDemo(fresh, { type: 'runGate' }), { type: 'runGate' })
    const rejected = reduceDemo(scored, { type: 'humanDecide', decision: 'reject' })
    expect(reduceDemo(rejected, { type: 'humanDecide', decision: 'approve' })).toBe(rejected)
  })

  test('no action other than an explicit approve ever banks a question', () => {
    for (const id of PRESET_IDS) {
      let state = createDemoState(id)
      const actions: DemoAction[] = [
        { type: 'runGate' },
        { type: 'runGate' },
        { type: 'runGate' },
        { type: 'toggleTrace' },
        { type: 'focusAnchor', page: 42, chunkId: 'p42-c3' },
        { type: 'humanDecide', decision: 'reject' }
      ]
      for (const action of actions) {
        state = reduceDemo(state, action)
        expect(state.inSampleBank).toBe(false)
      }
    }
  })
})

describe('reset and preset switching', () => {
  test('reset restores the initial preset exactly, ledger included', () => {
    for (const id of PRESET_IDS) {
      const initial = createDemoState(id)
      let state = reduceDemo(initial, { type: 'runGate' })
      state = reduceDemo(state, { type: 'runGate' })
      state = reduceDemo(state, { type: 'runGate' })
      state = reduceDemo(state, { type: 'humanDecide', decision: 'reject' })
      state = reduceDemo(state, { type: 'toggleTrace' })
      state = reduceDemo(state, { type: 'focusAnchor', page: 42, chunkId: 'p42-c3' })
      expect(state).not.toEqual(initial)
      expect(reduceDemo(state, { type: 'reset' })).toEqual(initial)
    }
  })

  test('switching presets swaps the question and the ledger seed', () => {
    const cloze = createDemoState('cloze-rule-block')
    const reading = reduceDemo(cloze, { type: 'selectPreset', presetId: 'reading-low-score' })
    expect(reading).toEqual(createDemoState('reading-low-score'))
    expect(reading.preset.questionType).toBe('reading')
    expect(reading.ledger).toEqual({ totalReviewed: 0, falsePassCount: 0, thresholdMet: false })

    const calibration = reduceDemo(reading, { type: 'selectPreset', presetId: 'false-pass-calibration' })
    expect(calibration.ledger).toEqual({
      totalReviewed: 18,
      falsePassCount: 4,
      thresholdMet: false
    })
  })

  test('the trace panel and the gate rail are derived from the same revealed rounds', () => {
    let state = createDemoState('reading-low-score')
    expect(state.traceOpen).toBe(false)
    state = reduceDemo(state, { type: 'toggleTrace' })
    expect(state.traceOpen).toBe(true)

    const empty = gateRail(createDemoState('reading-low-score'))
    expect(empty.map((step) => step.status)).toEqual(['pending', 'pending', 'pending'])

    state = reduceDemo(state, { type: 'runGate' })
    state = reduceDemo(state, { type: 'runGate' })
    const rail = gateRail(state)
    expect(rail.map((step) => step.stage)).toEqual(['schema-rule', 'llm-judge', 'human-review'])
    expect(rail.map((step) => step.status)).toEqual(['passed', 'failed', 'pending'])
    expect(rail[1].round).toBe(2)

    state = reduceDemo(state, { type: 'runGate' })
    expect(gateRail(state).map((step) => step.status)).toEqual(['passed', 'passed', 'pending'])
    expect(gateRail(state)[2].round).toBe(3)

    const rows = traceRows(state)
    expect(rows.map((row) => row.round)).toEqual([1, 2, 3])
    expect(rows[0].cost).toBe(0)
    expect(rows[2].cost).toBe(estimateCost(state.rounds[2].tokensUsed))
    expect(rows[2].cost).toBeGreaterThan(rows[1].cost)
  })
})

describe('contract shared with the shipped page', () => {
  test('an unknown action leaves the state untouched', () => {
    const state = createDemoState('cloze-rule-block')
    const unknown = { type: 'nope' } as unknown as DemoAction
    expect(reduceDemo(state, unknown)).toBe(state)
  })

  test('lists every action the page dispatches', () => {
    expect([...ACTION_NAMES]).toEqual([
      'selectPreset',
      'runGate',
      'focusAnchor',
      'humanDecide',
      'toggleTrace',
      'reset'
    ])
  })

  test('the derived contract describes the presets this machine actually runs', () => {
    const contract = demoContract()
    expect(contract.thresholds).toEqual({
      quality: 70,
      maxRevisionRounds: 3,
      reviewedTarget: 20,
      falsePassTarget: 5,
      rubric: { accuracy: 0.4, uniqueness: 0.3, distractors: 0.3 }
    })
    expect(contract.gates.map((gate) => gate.stage)).toEqual([
      'schema-rule',
      'llm-judge',
      'human-review'
    ])
    expect(contract.presets).toHaveLength(3)

    for (const summary of contract.presets) {
      const preset = demoPreset(summary.id)
      expect(summary.label).toBe(preset.label)
      expect(summary.questionType).toBe(preset.questionType)
      expect(summary.rounds).toEqual(
        preset.rounds.map((entry) => ({
          round: entry.round,
          stage: entry.stage,
          passed: entry.passed,
          judgeScore: entry.judgeScore,
          tokensUsed: entry.tokensUsed,
          page: entry.sourceAnchor.page,
          chunkId: entry.sourceAnchor.chunkId
        }))
      )
      expect(summary.clicksToEnd).toBe(driveToEnd(summary.id).clicks)
      expect(summary.clicksToEnd).toBeLessThanOrEqual(5)
      expect(summary.ledgerSeed).toEqual({
        totalReviewed: preset.ledgerSeed.totalReviewed,
        falsePassCount: preset.ledgerSeed.falsePassCount,
        thresholdMet: false
      })
    }
    expect(contract.invariants.length).toBeGreaterThanOrEqual(5)
  })
})