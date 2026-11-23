/**
 * The three-gate quality loop of the English content workbench, as a pure state
 * machine: 规则校验 → Judge 评分 → 人工复核, plus the false-pass calibration
 * ledger behind the review gate.
 *
 * This file is plain JavaScript on purpose: the demo page at
 * `public/projects/english-content-workbench/demo/demo.js` is a static asset
 * that cannot import a TypeScript module at runtime, so it carries a copy of
 * this file **byte for byte**. `src/lib/demo/english/state.ts` adds the
 * TypeScript types on top, `state.test.ts` pins the invariants, and
 * `mirror.test.ts` fails the suite the moment the two copies differ.
 *
 * Everything here is deterministic and side-effect free. A "round" is one pass
 * of a draft through one gate, and the preset scripts below are the whole
 * simulation — nothing is generated at runtime.
 */

export const QUALITY_THRESHOLD = 70
export const MAX_REVISION_ROUNDS = 3
export const REVIEW_TARGET = 20
export const FALSE_PASS_TARGET = 5
/** Cost estimate unit price, ¥ per 1k tokens (the platform's default). */
export const COST_PER_1K_TOKENS = 0.002

/** Rubric weights; the total is their weighted sum, rounded. */
export const RUBRIC_WEIGHTS = { accuracy: 0.4, uniqueness: 0.3, distractors: 0.3 }

export const ACTION_NAMES = [
  'selectPreset',
  'runGate',
  'focusAnchor',
  'humanDecide',
  'toggleTrace',
  'reset'
]

export const GATE_LABELS = {
  'schema-rule': '① 规则校验',
  'llm-judge': '② Judge 评分',
  'human-review': '③ 人工复核'
}

/**
 * The invariants the page states in words. They are shipped with the machine so
 * what a reader is told matches what the reducer does.
 */
export const INVARIANTS = [
  '硬规则拦下的轮次没有 Judge 分数，Judge Token 消耗为 0',
  'Judge 低于 70 分自动进入下一轮改版，最多 3 轮',
  'Judge 达到 70 分停在待人工复核，绝不自动进入样本库',
  '来源页码锚点与当前轮的教材切片一一对应',
  '人工驳回高分题计入假通过，20 条标注且 5 条假通过前不校准',
  '一键重置还原当前预设的初始状态'
]

const JUDGE_MODEL = 'deepseek-v4-flash'
const RULE_ENGINE = '规则引擎 · Pydantic 二次校验'

/** A round the deterministic rules killed: no model, no tokens, no score. */
function ruleFail(index, ruleErrors, draftStem, sourceAnchor) {
  return {
    round: index,
    stage: 'schema-rule',
    passed: false,
    ruleErrors,
    judgeScore: null,
    judgeBreakdown: null,
    draftStem,
    sourceAnchor,
    tokensUsed: 0,
    trace: { model: RULE_ENGINE, tokensIn: 0, tokensOut: 0, latencyMs: 12 }
  }
}

/** A draft that cleared the rules; the model has not scored it yet. */
function rulePass(index, draftStem, sourceAnchor) {
  return {
    round: index,
    stage: 'schema-rule',
    passed: true,
    ruleErrors: [],
    judgeScore: null,
    judgeBreakdown: null,
    draftStem,
    sourceAnchor,
    tokensUsed: 0,
    trace: { model: RULE_ENGINE, tokensIn: 0, tokensOut: 0, latencyMs: 14 }
  }
}

function judged(index, breakdown, draftStem, sourceAnchor, tokensUsed, latencyMs) {
  const score = Math.round(
    breakdown.accuracy * RUBRIC_WEIGHTS.accuracy +
      breakdown.uniqueness * RUBRIC_WEIGHTS.uniqueness +
      breakdown.distractors * RUBRIC_WEIGHTS.distractors
  )
  const tokensIn = Math.round(tokensUsed * 0.82)
  return {
    round: index,
    stage: 'llm-judge',
    passed: score >= QUALITY_THRESHOLD,
    ruleErrors: [],
    judgeScore: score,
    judgeBreakdown: breakdown,
    draftStem,
    sourceAnchor,
    tokensUsed,
    trace: { model: JUDGE_MODEL, tokensIn, tokensOut: tokensUsed - tokensIn, latencyMs }
  }
}

const CLOZE_ANCHOR = {
  page: 42,
  chunkId: 'p42-c3',
  excerpt: 'When White finally returned, the settlement stood empty.'
}

const READING_ANCHOR = {
  page: 57,
  chunkId: 'p57-c2',
  excerpt: 'Bleached reefs are not dead reefs: the coral has expelled its algae.'
}

const MCQ_ANCHOR = {
  page: 71,
  chunkId: 'p71-c2',
  excerpt: 'If she had studied harder last term, she would have passed the exam.'
}

const CLOZE_STEM_FIRST = `Read the passage and choose the best option for each blank.

The colony of Roanoke was established in 1587 ___1___ one hundred and fifteen settlers. Their governor, John White, sailed back to England for supplies, ___2___ a war delayed his return for three years. When he finally came back, the settlement was empty. The only clue was the word CROATOAN ___3___ on a post. ___4___`

const CLOZE_STEM_FIXED = `Read the passage and choose the best option for each blank.

The colony of Roanoke was established in 1587 ___1___ one hundred and fifteen settlers. Their governor, John White, sailed back to England for supplies, ___2___ a war delayed his return for three years. When he finally came back, the settlement was empty. The only clue was the word CROATOAN ___3___ on a post, and the letters C-R-O ___4___ into a nearby tree.`

const READING_STEM_FIRST = `Read the passage and answer the question.

Coral bleaching happens when water stays too warm for too long. The coral expels the algae that live inside its tissue and give it both colour and most of its food. What is left is a white skeleton that can still recover if the water cools within a few weeks. A reef that bleaches in four consecutive years, however, has almost no time to rebuild.

Question: According to the passage, what decides whether a bleached reef recovers?`

const READING_STEM_REVISED = `Read the passage and answer the question.

Coral bleaching happens when water stays too warm for too long. The coral expels the algae that live inside its tissue and give it both colour and most of its food. What is left is a white skeleton that can still recover if the water cools again within a few weeks. A reef that bleaches in four consecutive years, however, has almost no time to rebuild.

Question: According to the passage, which condition decides whether a bleached reef can recover?`

const READING_STEM_FINAL = `Read the passage and answer the question.

Coral bleaching happens when water stays too warm for too long. The coral expels the algae that live inside its tissue and give it both colour and most of its food. What is left is a white skeleton that can still recover if the water cools again within a few weeks. A reef that bleaches in four consecutive years, however, has almost no time to rebuild.

Question: According to the passage, which condition most directly decides whether a bleached reef can recover?`

const MCQ_STEM = `Choose the best option to complete the sentence.

If she ___ harder last term, she would have passed the exam.`

const CLOZE_PRESET = {
  id: 'cloze-rule-block',
  label: '① 完形填空被硬规则拦截',
  questionType: 'cloze',
  title: '完形填空 · The Lost Colony',
  stem: CLOZE_STEM_FIRST,
  options: [
    { key: 'A', text: 'carved' },
    { key: 'B', text: 'to carve' },
    { key: 'C', text: 'carving' },
    { key: 'D', text: 'to carve' }
  ],
  answer: 'A',
  explanation:
    '这里是非谓语作后置定语修饰 word，carved 是过去分词表被动（被刻下的那个词）；to carve 是不定式，不能单独作后置定语。B 与 D 的正文完全重复，本身就该被规则拦下。',
  chunks: [
    {
      page: 42,
      chunkId: 'p42-c1',
      label: 'P.42 · 块 1',
      body: 'The Lost Colony\nIn 1587, one hundred and fifteen English settlers landed on Roanoke Island and built a small settlement. They came with tools, seeds and a charter from Walter Raleigh.'
    },
    {
      page: 42,
      chunkId: 'p42-c2',
      label: 'P.42 · 块 2',
      body: 'Their governor, John White, sailed back to England for supplies. A war with Spain delayed his return for nearly three years, and by the time he found a ship the colony had been waiting far longer than anyone expected.'
    },
    {
      page: 42,
      chunkId: 'p42-c3',
      label: 'P.42 · 块 3',
      body: 'When White finally returned, the settlement stood empty. The only clue was the word CROATOAN carved on a post, and the letters C-R-O cut into a tree nearby. No settler was ever found.'
    },
    {
      page: 42,
      chunkId: 'p42-c4',
      label: 'P.42 · 块 4',
      body: 'Language focus: the word carved is a past participle used as a post-modifier, so it carries a passive sense. The bare infinitive to carve cannot fill that slot on its own.'
    },
    {
      page: 43,
      chunkId: 'p43-c1',
      label: 'P.43 · 块 1',
      body: 'Exercise 3. Retell the story in six sentences, using at least three past participles as modifiers.'
    }
  ],
  rounds: [
    ruleFail(
      1,
      [
        'passage 里 4 处空位，blanks 只登记了 3 条（跨字段计数不一致）',
        '选项 B 与 D 的正文完全重复：to carve'
      ],
      CLOZE_STEM_FIRST,
      CLOZE_ANCHOR
    ),
    judged(2, { accuracy: 92, uniqueness: 85, distractors: 86 }, CLOZE_STEM_FIXED, CLOZE_ANCHOR, 2380, 4120)
  ],
  ledgerSeed: { totalReviewed: 0, falsePassCount: 0 },
  endDecision: 'pending'
}

const READING_PRESET = {
  id: 'reading-low-score',
  label: '② 阅读理解低分自动改版',
  questionType: 'reading',
  title: '阅读理解 · Coral Bleaching',
  stem: READING_STEM_FIRST,
  options: [
    { key: 'A', text: 'How long the warm water lasts and whether it cools again.' },
    { key: 'B', text: 'How many algae the coral can expel in one season.' },
    { key: 'C', text: 'How white the skeleton looks after the algae leave.' },
    { key: 'D', text: 'How many fish still live around the reef.' }
  ],
  answer: 'A',
  explanation:
    '原文把恢复条件写成两个：水要重新变凉，而且要在几周之内。B、C、D 都抓了细节（藻类、颜色、鱼），却绕开了「水何时变凉」这个决定条件。',
  chunks: [
    {
      page: 57,
      chunkId: 'p57-c1',
      label: 'P.57 · 块 1',
      body: 'Coral Reefs under Heat\nA coral polyp is an animal that farms algae. The algae live inside its tissue, give it colour, and supply most of the sugar the polyp burns.'
    },
    {
      page: 57,
      chunkId: 'p57-c2',
      label: 'P.57 · 块 2',
      body: 'Bleached reefs are not dead reefs: the coral has expelled its algae. What is left is a white skeleton that can still recover if the water cools again within a few weeks.'
    },
    {
      page: 57,
      chunkId: 'p57-c3',
      label: 'P.57 · 块 3',
      body: 'A reef that bleaches in four consecutive years has almost no time to rebuild, and repeated bleaching turns a recovery problem into a mortality problem.'
    },
    {
      page: 57,
      chunkId: 'p57-c4',
      label: 'P.57 · 块 4',
      body: 'Reading skill: distinguish the condition that decides an outcome from the details that merely accompany it. Three of the four distractors here describe consequences.'
    },
    {
      page: 58,
      chunkId: 'p58-c1',
      label: 'P.58 · 块 1',
      body: 'Exercise 2. Underline the sentence that states the recovery condition, then explain why the other options are consequences rather than causes.'
    }
  ],
  rounds: [
    rulePass(1, READING_STEM_FIRST, READING_ANCHOR),
    judged(2, { accuracy: 70, uniqueness: 58, distractors: 62 }, READING_STEM_REVISED, READING_ANCHOR, 3120, 5310),
    judged(3, { accuracy: 92, uniqueness: 86, distractors: 88 }, READING_STEM_FINAL, READING_ANCHOR, 4180, 5620)
  ],
  ledgerSeed: { totalReviewed: 0, falsePassCount: 0 },
  endDecision: 'pending'
}

const MCQ_PRESET = {
  id: 'false-pass-calibration',
  label: '③ 假通过校准',
  questionType: 'mcq',
  title: '单项选择 · Subjunctive Mood',
  stem: MCQ_STEM,
  options: [
    { key: 'A', text: 'studied' },
    { key: 'B', text: 'studies' },
    { key: 'C', text: 'had studied' },
    { key: 'D', text: 'has studied' }
  ],
  answer: 'C',
  explanation:
    '与过去事实相反的虚拟条件句：从句用 had + 过去分词，主句用 would have + 过去分词。题干里的 last term 和主句的 would have passed 一起把时间锁在过去。',
  chunks: [
    {
      page: 71,
      chunkId: 'p71-c1',
      label: 'P.71 · 块 1',
      body: 'Subjunctive Mood\nA past counterfactual condition describes something that did not happen and its imagined result: if + had done, would have done.'
    },
    {
      page: 71,
      chunkId: 'p71-c2',
      label: 'P.71 · 块 2',
      body: 'If she had studied harder last term, she would have passed the exam. The time adverbial last term and the main clause would have passed fix the whole sentence in the past.'
    },
    {
      page: 71,
      chunkId: 'p71-c3',
      label: 'P.71 · 块 3',
      body: 'Common error: mixing a present-tense if-clause with a past-tense main clause. The two halves must agree on the time they describe.'
    },
    {
      page: 71,
      chunkId: 'p71-c4',
      label: 'P.71 · 块 4',
      body: 'Contrast: if she studied harder now, she would pass next term. The present counterfactual uses the past simple in the if-clause.'
    },
    {
      page: 72,
      chunkId: 'p72-c1',
      label: 'P.72 · 块 1',
      body: 'Exercise 5. Rewrite five sentences so that the if-clause and the main clause describe the same time.'
    }
  ],
  rounds: [
    rulePass(1, MCQ_STEM, MCQ_ANCHOR),
    judged(2, { accuracy: 94, uniqueness: 90, distractors: 88 }, MCQ_STEM, MCQ_ANCHOR, 2640, 3860)
  ],
  ledgerSeed: { totalReviewed: 18, falsePassCount: 4 },
  endDecision: 'rejected'
}

const PRESETS = {
  'cloze-rule-block': CLOZE_PRESET,
  'reading-low-score': READING_PRESET,
  'false-pass-calibration': MCQ_PRESET
}

export const PRESET_IDS = ['cloze-rule-block', 'reading-low-score', 'false-pass-calibration']

export function demoPreset(id) {
  const preset = PRESETS[id]
  if (!preset) throw new Error(`unknown preset: ${id}`)
  return preset
}

function ledgerOf(totalReviewed, falsePassCount) {
  return {
    totalReviewed,
    falsePassCount,
    thresholdMet: totalReviewed >= REVIEW_TARGET && falsePassCount >= FALSE_PASS_TARGET
  }
}

export function createDemoState(preset) {
  const chosen = typeof preset === 'string' || preset === undefined ? demoPreset(preset || PRESET_IDS[0]) : preset
  return {
    preset: chosen,
    rounds: [],
    stage: chosen.rounds[0] ? chosen.rounds[0].stage : 'human-review',
    humanDecision: 'pending',
    inSampleBank: false,
    activeAnchor: null,
    focusTick: 0,
    traceOpen: false,
    exhausted: false,
    ledger: ledgerOf(chosen.ledgerSeed.totalReviewed, chosen.ledgerSeed.falsePassCount)
  }
}

function runGate(state) {
  // At the review gate the pipeline is waiting for a person, not for another
  // click on "run": re-running would either fake progress or spend tokens for
  // nothing.
  if (state.stage === 'human-review') return state

  const script = state.preset.rounds
  const next = script[state.rounds.length]
  if (!next) return state

  const scoredRounds = state.rounds.filter((entry) => entry.stage === 'llm-judge').length
  if (next.stage === 'llm-judge' && scoredRounds >= MAX_REVISION_ROUNDS) {
    // The revision budget is spent: hand the case to a person instead of
    // regenerating forever.
    return { ...state, stage: 'human-review', exhausted: true }
  }

  const rounds = [...state.rounds, next]
  const following = script[rounds.length] || null
  const judges = rounds.filter((entry) => entry.stage === 'llm-judge').length
  const scored = next.judgeScore !== null && next.judgeScore >= QUALITY_THRESHOLD

  let stage
  let exhausted = false
  if (next.stage === 'schema-rule') {
    // A killed draft is fixed by the author, not by the judge: the next click
    // runs whatever the corrected draft is scheduled for.
    stage = following ? following.stage : 'human-review'
  } else if (scored) {
    stage = 'human-review'
  } else if (following && following.stage === 'llm-judge' && judges < MAX_REVISION_ROUNDS) {
    stage = 'llm-judge'
  } else {
    stage = 'human-review'
    exhausted = true
  }

  return {
    ...state,
    rounds,
    stage,
    exhausted,
    humanDecision: 'pending',
    activeAnchor: next.sourceAnchor,
    focusTick: state.focusTick + 1
  }
}

function reviewLedger(ledger, score, decision) {
  const falsePass = decision === 'rejected' && score !== null && score >= QUALITY_THRESHOLD ? 1 : 0
  return ledgerOf(ledger.totalReviewed + 1, ledger.falsePassCount + falsePass)
}

function humanDecide(state, decision) {
  if (state.stage !== 'human-review' || state.humanDecision !== 'pending') return state
  const last = state.rounds[state.rounds.length - 1]
  if (!last) return state
  const score = last.judgeScore

  if (decision === 'approve') {
    // Only a question the judge already cleared can enter the sample bank, and
    // only because a person said so.
    if (score === null || score < QUALITY_THRESHOLD) return state
    return {
      ...state,
      humanDecision: 'approved',
      inSampleBank: true,
      ledger: reviewLedger(state.ledger, score, 'approved')
    }
  }

  return {
    ...state,
    humanDecision: 'rejected',
    inSampleBank: false,
    ledger: reviewLedger(state.ledger, score, 'rejected')
  }
}

function focusAnchor(state, page, chunkId) {
  const current = state.rounds.length ? state.rounds[state.rounds.length - 1].sourceAnchor : null
  if (!current || current.page !== page || current.chunkId !== chunkId) return state
  return { ...state, activeAnchor: current, focusTick: state.focusTick + 1 }
}

export function reduceDemo(state, action) {
  switch (action.type) {
    case 'selectPreset':
      return createDemoState(action.presetId)
    case 'reset':
      return createDemoState(state.preset)
    case 'runGate':
      return runGate(state)
    case 'focusAnchor':
      return focusAnchor(state, action.page, action.chunkId)
    case 'humanDecide':
      return humanDecide(state, action.decision)
    case 'toggleTrace':
      return { ...state, traceOpen: !state.traceOpen }
    default:
      return state
  }
}

/** True once the preset has reached the state its script ends on. */
export function isFinished(state) {
  if (state.stage !== 'human-review') return false
  return state.humanDecision !== 'pending' || state.preset.endDecision === 'pending'
}

/** The vertical rail: what each gate did, and in which round. */
export function gateRail(state) {
  const rounds = state.rounds
  const last = rounds.length ? rounds[rounds.length - 1] : null
  const judges = rounds.filter((entry) => entry.stage === 'llm-judge')
  const lastJudge = judges.length ? judges[judges.length - 1] : null

  const rule = {
    stage: 'schema-rule',
    label: GATE_LABELS['schema-rule'],
    status: 'pending',
    round: null,
    detail: '尚未运行'
  }
  if (last) {
    if (last.ruleErrors.length > 0) {
      rule.status = 'failed'
      rule.round = last.round
      rule.detail = `${last.ruleErrors.length} 条确定性规则违例，未调用模型`
    } else {
      rule.status = 'passed'
      rule.round = last.round
      rule.detail = `第 ${last.round} 轮通过，0 Judge Token`
    }
  }

  const judge = {
    stage: 'llm-judge',
    label: GATE_LABELS['llm-judge'],
    status: 'pending',
    round: null,
    detail: '尚未评分'
  }
  if (lastJudge) {
    judge.status = lastJudge.passed ? 'passed' : 'failed'
    judge.round = lastJudge.round
    judge.detail = `${lastJudge.judgeScore} 分 · 阈值 ${QUALITY_THRESHOLD}`
  }

  const human = {
    stage: 'human-review',
    label: GATE_LABELS['human-review'],
    status: 'pending',
    round: null,
    detail: '尚未进入'
  }
  if (state.stage === 'human-review') {
    human.round = last ? last.round : null
    if (state.humanDecision === 'approved') {
      human.status = 'passed'
      human.detail = '人工通过，已入样本库'
    } else if (state.humanDecision === 'rejected') {
      human.status = 'failed'
      human.detail = '人工驳回'
    } else {
      human.detail = state.exhausted ? '改版轮次用尽，等待人工兜底' : '等待人工决策'
    }
  }

  return [rule, judge, human]
}

/** The round log, with the score delta against the previous judged round. */
export function roundCards(state) {
  let previous = null
  return state.rounds.map((entry) => {
    const delta = entry.judgeScore !== null && previous !== null ? entry.judgeScore - previous : null
    if (entry.judgeScore !== null) previous = entry.judgeScore
    return {
      round: entry.round,
      stage: entry.stage,
      passed: entry.passed,
      ruleErrors: entry.ruleErrors,
      judgeScore: entry.judgeScore,
      judgeBreakdown: entry.judgeBreakdown,
      tokensUsed: entry.tokensUsed,
      revisionDelta: delta
    }
  })
}

export function estimateCost(tokensUsed) {
  return (tokensUsed / 1000) * COST_PER_1K_TOKENS
}

/** Per-round cost breakdown for the collapsible Trace panel. */
export function traceRows(state) {
  return state.rounds.map((entry) => ({
    round: entry.round,
    model: entry.trace.model,
    tokensIn: entry.trace.tokensIn,
    tokensOut: entry.trace.tokensOut,
    latencyMs: entry.trace.latencyMs,
    cost: estimateCost(entry.tokensUsed)
  }))
}

export function anchorLabel(preset, anchor) {
  const chunk = preset.chunks.find(
    (item) => item.page === anchor.page && item.chunkId === anchor.chunkId
  )
  return chunk ? chunk.label : `P.${anchor.page} · ${anchor.chunkId}`
}

/** Clicks needed to reach the preset's end state, counting the preset tab. */
export function clicksToEnd(preset) {
  let state = createDemoState(preset)
  let clicks = 1
  for (let step = 0; step < 15 && !isFinished(state); step += 1) {
    const before = state
    state =
      state.stage === 'human-review'
        ? reduceDemo(state, {
            type: 'humanDecide',
            decision: preset.endDecision === 'approved' ? 'approve' : 'reject'
          })
        : reduceDemo(state, { type: 'runGate' })
    clicks += 1
    if (state === before) break
  }
  return clicks
}

/**
 * Everything the page must repeat verbatim: the action names it dispatches, the
 * invariant sentences it prints, the thresholds it quotes, and the per-round
 * facts it renders. `mirror.test.ts` re-derives this from the machine and
 * requires the shipped copy to match.
 */
export function demoContract() {
  return {
    actions: ACTION_NAMES.slice(),
    invariants: INVARIANTS.slice(),
    gates: Object.keys(GATE_LABELS).map((stage) => ({ stage, label: GATE_LABELS[stage] })),
    thresholds: {
      quality: QUALITY_THRESHOLD,
      maxRevisionRounds: MAX_REVISION_ROUNDS,
      reviewedTarget: REVIEW_TARGET,
      falsePassTarget: FALSE_PASS_TARGET,
      rubric: {
        accuracy: RUBRIC_WEIGHTS.accuracy,
        uniqueness: RUBRIC_WEIGHTS.uniqueness,
        distractors: RUBRIC_WEIGHTS.distractors
      }
    },
    presets: PRESET_IDS.map((id) => {
      const preset = demoPreset(id)
      return {
        id: preset.id,
        label: preset.label,
        questionType: preset.questionType,
        clicksToEnd: clicksToEnd(preset),
        rounds: preset.rounds.map((entry) => ({
          round: entry.round,
          stage: entry.stage,
          passed: entry.passed,
          judgeScore: entry.judgeScore,
          tokensUsed: entry.tokensUsed,
          page: entry.sourceAnchor.page,
          chunkId: entry.sourceAnchor.chunkId
        })),
        ledgerSeed: {
          totalReviewed: preset.ledgerSeed.totalReviewed,
          falsePassCount: preset.ledgerSeed.falsePassCount,
          thresholdMet:
            preset.ledgerSeed.totalReviewed >= REVIEW_TARGET &&
            preset.ledgerSeed.falsePassCount >= FALSE_PASS_TARGET
        }
      }
    })
  }
}