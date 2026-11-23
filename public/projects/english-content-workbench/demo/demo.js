/**
 * 英语内容生产工作台「单题闯三关」交互演示 — 浏览器运行时。
 *
 * 页面是 public/ 下的静态资源，运行时无法 import TypeScript 模块，所以权威
 * 状态机放在 `src/lib/demo/english/machine.js`（纯 JS，有 `state.ts` 类型外壳与
 * `state.test.ts` 单测覆盖），本文件把那份文件**逐字节**内联在两个 marker 之间。
 * 改完 machine.js 运行：
 *
 *   bun scripts/sync-english-demo.mjs
 *
 * `src/lib/demo/english/mirror.test.ts` 会比对两边，差一个字节就红。
 * marker 之间不要手写任何东西。
 */
/* __ENGLISH_MACHINE_BEGIN__ */
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
/* __ENGLISH_MACHINE_END__ */

/* ── 主题：localStorage 持久化，缺省跟随系统偏好 ── */
const THEME_KEY = 'english-demo-theme'

function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch (error) {
    /* 隐私模式下 localStorage 会抛，退回系统偏好 */
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(next) {
  document.documentElement.setAttribute('data-theme', next)
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch (error) {
    /* 存不下不影响本次会话 */
  }
}

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const TYPE_LABELS = { cloze: '完形填空', reading: '阅读理解', mcq: '单项选择' }
const STATUS_TEXT = { pending: '待运行', passed: '通过', failed: '未通过' }
const DECISION_TEXT = { pending: '待人工决策', approved: '人工通过', rejected: '人工驳回' }

let uiTheme = readTheme()
let uiState = createDemoState(PRESET_IDS[0])
let paintedFocusTick = -1

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  })
}

function money(value) {
  return `¥${value.toFixed(4)}`
}

function nextRoundNumber() {
  return uiState.rounds.length + 1
}

function currentAnchor() {
  // The citation the reader sees belongs to the draft on screen; the highlight
  // belongs to the round that has actually run.
  if (uiState.activeAnchor) return uiState.activeAnchor
  const first = uiState.preset.rounds[0]
  return first ? first.sourceAnchor : null
}

function highlightedAnchor() {
  return uiState.activeAnchor
}

/* ── 预设剧本与题型 ── */
function renderPresets() {
  const tabs = document.getElementById('preset-tabs')
  tabs.innerHTML = PRESET_IDS.map((id) => {
    const preset = demoPreset(id)
    const summary = demoContract().presets.find((item) => item.id === id)
    const goal = preset.endDecision === 'pending' ? '停在待复核' : '走到人工驳回'
    return `<button class="scenario" data-act="preset" data-preset="${esc(id)}" aria-pressed="${
      uiState.preset.id === id
    }"><span>${esc(preset.label)}</span><small>${summary ? summary.clicksToEnd : ''} 次点击到终态 · ${esc(
      goal
    )}</small></button>`
  }).join('')

  const types = document.getElementById('type-tabs')
  types.innerHTML = PRESET_IDS.map((id) => {
    const preset = demoPreset(id)
    const selected = uiState.preset.id === id
    return `<button class="tab" role="tab" data-act="preset" data-preset="${esc(id)}" aria-selected="${selected}">${esc(
      TYPE_LABELS[preset.questionType]
    )}</button>`
  }).join('')
}

/* ── 三关进度轨 ── */
function renderRail() {
  const rail = document.getElementById('gate-rail')
  const steps = gateRail(uiState)
  const verdict = uiState.inSampleBank
    ? '本题已入样本库：人工通过是入库的唯一入口。'
    : uiState.humanDecision === 'rejected'
      ? '本题被人工驳回，未进入样本库；高分题驳回会记入假通过池。'
      : uiState.exhausted
        ? '自动改版轮次已用尽，停在人工兜底，不会继续烧 Token。'
        : uiState.stage === 'human-review'
          ? '自动流程已停在待人工复核：分数只是筛子，定稿归人。'
          : '规则先跑，模型后跑；点「运行本关」推进一轮。'

  rail.innerHTML =
    steps
      .map((step, index) => {
        const round = step.round === null ? '' : `<span class="round">第 ${step.round} 轮</span>`
        return `<div class="step" data-status="${step.status}">
          <span class="dot">${index + 1}</span>
          <span>
            <span class="step-title">${esc(step.label)}${round}</span>
            <span class="step-detail">${esc(step.detail)}</span>
          </span>
        </div>`
      })
      .join('') + `<div class="rail-verdict">${esc(verdict)}</div>`
}

/* ── 审题面板 ── */
function renderQuestion() {
  const pane = document.getElementById('question-pane')
  const preset = uiState.preset
  const anchor = currentAnchor()
  const last = uiState.rounds[uiState.rounds.length - 1]
  const stem = last ? last.draftStem : preset.stem

  pane.innerHTML = `
    <div class="q-meta">
      <span class="chip">${esc(TYPE_LABELS[preset.questionType])}</span>
      <span class="chip">${esc(preset.title)}</span>
      <span class="chip">当前稿：第 ${last ? last.round : 0} 轮${last ? '' : '（未运行）'}</span>
    </div>
    <p class="stem">${esc(stem)}</p>
    <div class="options">
      ${preset.options
        .map(
          (option) => `<div class="opt${option.key === preset.answer ? ' correct' : ''}">
            <span class="k">${esc(option.key)}</span>
            <span>${esc(option.text)}${
              option.key === preset.answer ? '<span class="badge">答案</span>' : ''
            }</span>
          </div>`
        )
        .join('')}
    </div>
    <p class="answer">答案：<b>${esc(preset.answer)}</b></p>
    <p class="explain">解析：${esc(preset.explanation)}</p>
    <div class="source">
      <span>来源引用：</span>
      ${
        anchor
          ? `<button class="anchor" data-act="anchor" data-page="${anchor.page}" data-chunk="${esc(
              anchor.chunkId
            )}">${esc(anchorLabel(preset, anchor))}</button>`
          : ''
      }
      <span>${anchor ? esc(anchor.excerpt) : ''}</span>
    </div>`
}

function renderActions() {
  const bar = document.getElementById('action-bar')
  const last = uiState.rounds[uiState.rounds.length - 1]
  const score = last ? last.judgeScore : null

  if (uiState.stage !== 'human-review') {
    const label =
      uiState.stage === 'schema-rule'
        ? `运行第 ${nextRoundNumber()} 轮规则校验`
        : `运行第 ${nextRoundNumber()} 轮 Judge 评分`
    const note =
      uiState.stage === 'schema-rule'
        ? '跨字段确定性规则先跑：不通过就 0 Judge Token。'
        : 'Judge 低于 70 分自动进入下一轮改版，最多 3 轮。'
    bar.innerHTML = `<button class="btn btn-primary" data-act="run">${esc(label)}</button>
      <span class="note">${esc(note)}</span>`
    return
  }

  if (uiState.humanDecision !== 'pending') {
    bar.innerHTML = `<span class="note">${esc(
      DECISION_TEXT[uiState.humanDecision]
    )}：${uiState.inSampleBank ? '已进入样本库' : '未进入样本库'}。</span>
      <button class="btn" data-act="reset">重置本预设</button>`
    return
  }

  const canApprove = score !== null && score >= QUALITY_THRESHOLD
  bar.innerHTML = `
    <button class="btn btn-ok" data-act="approve" ${canApprove ? '' : 'disabled'}>通过入样本库</button>
    <button class="btn btn-danger" data-act="reject">驳回</button>
    <span class="note">${
      canApprove
        ? '通过才入样本库；驳回会把这道高分题计入假通过池。'
        : '本轮未达 70 分，没有可入库的稿；只能驳回。'
    }</span>`
}

/* ── 教材原文 ── */
function renderTextbook() {
  const box = document.getElementById('textbook-scroll')
  const preset = uiState.preset
  const anchor = highlightedAnchor()
  const pages = []
  for (const chunk of preset.chunks) {
    const page = pages.find((item) => item.page === chunk.page)
    if (page) page.chunks.push(chunk)
    else pages.push({ page: chunk.page, chunks: [chunk] })
  }

  box.innerHTML = pages
    .map(
      (page) => `<section class="tb-page">
        <h3>P.${page.page}</h3>
        ${page.chunks
          .map((chunk) => {
            const active =
              anchor !== null && anchor.page === chunk.page && anchor.chunkId === chunk.chunkId
            return `<article class="chunk${active ? ' is-active' : ''}" data-page="${
              chunk.page
            }" data-chunk="${esc(chunk.chunkId)}"${
              active ? ' aria-current="true"' : ''
            }>
              <span class="chunk-id">${esc(chunk.label)} · ${esc(chunk.chunkId)}</span>
              <p>${esc(chunk.body)}</p>
            </article>`
          })
          .join('')}
      </section>`
    )
    .join('')
}

/* ── 逐轮记录 ── */
function renderLog() {
  const log = document.getElementById('round-log')
  const cards = roundCards(uiState)
  if (cards.length === 0) {
    log.innerHTML = `<p class="empty-note">还没有运行任何一轮。点「运行本关」开始第 1 轮。</p>`
    return
  }

  log.innerHTML = cards
    .map((card) => {
      const verdict = card.stage === 'schema-rule' && !card.passed ? 'failed' : card.passed ? 'passed' : 'failed'
      const tag =
        card.stage === 'schema-rule'
          ? card.passed
            ? '规则通过 · 0 Token'
            : '规则拦截 · 0 Token'
          : card.passed
            ? 'Judge 达标'
            : 'Judge 未达标'
      const errors = card.ruleErrors.length
        ? `<ul class="rule-errors">${card.ruleErrors.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
        : ''
      const score =
        card.judgeScore === null
          ? `<div class="score-line"><span class="score none">未评分</span><span class="delta">${
              card.passed ? '规则通过，等待 Judge 评分' : '规则未通过，模型没有运行'
            }</span></div>`
          : `<div class="score-line">
              <span class="score ${card.passed ? 'pass' : 'fail'}">${card.judgeScore}</span>
              <span class="delta ${card.revisionDelta && card.revisionDelta > 0 ? 'up' : ''}">${
                card.revisionDelta === null
                  ? '首轮评分'
                  : card.revisionDelta > 0
                    ? `改版增量 +${card.revisionDelta} 分`
                    : `改版增量 ${card.revisionDelta} 分`
              }</span>
            </div>`
      const bars = card.judgeBreakdown
        ? `<div class="bars">${Object.keys(RUBRIC_WEIGHTS)
            .map((key) => {
              const value = card.judgeBreakdown[key]
              return `<div class="bar-row ${card.passed ? 'pass' : 'fail'}">
                <span>${esc(key)}</span>
                <span class="bar"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></span>
                <span class="mono">${value}</span>
              </div>`
            })
            .join('')}</div>`
        : ''

      return `<article class="round-card" data-verdict="${verdict}">
        <header><b>第 ${card.round} 轮</b><span class="tag">${esc(tag)}</span></header>
        ${errors}
        ${score}
        ${bars}
        <div class="round-foot">
          <span>tokens ${card.tokensUsed}</span>
          <span>${esc(GATE_LABELS[card.stage])}</span>
          <span>${esc(STATUS_TEXT[card.passed ? 'passed' : 'failed'])}</span>
        </div>
      </article>`
    })
    .join('')
}

/* ── 假通过校准 ── */
function renderCalibration() {
  const box = document.getElementById('calibration')
  const ledger = uiState.ledger
  const reviewedPct = Math.min(100, (ledger.totalReviewed / REVIEW_TARGET) * 100)
  const falsePct = Math.min(100, (ledger.falsePassCount / FALSE_PASS_TARGET) * 100)

  box.innerHTML = `
    <div class="calib-line">
      <span class="num">${ledger.totalReviewed}</span>
      <span class="lbl">/ ${REVIEW_TARGET} 已复核</span>
      <span class="sep">|</span>
      <span class="num false">${ledger.falsePassCount}</span>
      <span class="lbl">/ ${FALSE_PASS_TARGET} 假通过</span>
    </div>
    <div class="meter">
      <div class="meter-head"><span>已复核样本</span><span>${ledger.totalReviewed} / ${REVIEW_TARGET}</span></div>
      <div class="bar"><i style="width:${reviewedPct}%"></i></div>
    </div>
    <div class="meter false">
      <div class="meter-head"><span>自动高分但人工驳回</span><span>${ledger.falsePassCount} / ${FALSE_PASS_TARGET}</span></div>
      <div class="bar"><i style="width:${falsePct}%"></i></div>
    </div>
    <div class="calib-state" data-active="${ledger.thresholdMet}">
      ${
        ledger.thresholdMet
          ? '两个门槛都已满足：Judge 维度权重可以进入校准流程。'
          : `校准未激活（thresholdMet: false）：需累计 ${REVIEW_TARGET} 条人工标注且其中含 ${FALSE_PASS_TARGET} 条假通过，两个条件同时满足才触发权重更新。`
      }
    </div>`
}

/* ── Trace 成本 ── */
function renderTrace() {
  const panel = document.getElementById('trace-panel')
  const rows = traceRows(uiState)
  const totalTokens = rows.reduce((sum, row) => sum + row.tokensIn + row.tokensOut, 0)
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0)

  const head = `<button class="trace-toggle" data-act="trace" aria-expanded="${
    uiState.traceOpen
  }"><span class="caret">▸</span><span>Trace 成本</span><span class="sum">${totalTokens} tokens · ${money(
    totalCost
  )}</span></button>`

  if (!uiState.traceOpen) {
    panel.innerHTML = head
    return
  }

  const body = rows.length
    ? `<table class="trace-table">
        <thead><tr><th>轮次</th><th>模型</th><th>输入</th><th>输出</th><th>耗时</th><th>成本</th></tr></thead>
        <tbody>${rows
          .map(
            (row) => `<tr>
              <td>第 ${row.round} 轮</td>
              <td>${esc(row.model)}</td>
              <td class="num">${row.tokensIn}</td>
              <td class="num">${row.tokensOut}</td>
              <td class="num">${row.latencyMs} ms</td>
              <td class="num">${money(row.cost)}</td>
            </tr>`
          )
          .join('')}</tbody>
        <tfoot><tr><td colspan="2">合计</td><td class="num">${rows.reduce(
          (sum, row) => sum + row.tokensIn,
          0
        )}</td><td class="num">${rows.reduce((sum, row) => sum + row.tokensOut, 0)}</td><td class="num">—</td><td class="num">${money(
          totalCost
        )}</td></tr></tfoot>
      </table>`
    : `<p class="empty-note" style="padding:10px 12px">还没有调用记录。</p>`

  panel.innerHTML = `${head}<div class="trace-body">${body}</div>`
}

/* ── 不变量脚注 ── */
function renderInvariants() {
  const foot = document.getElementById('invariants')
  foot.innerHTML = `<b>这套演示遵守的不变量</b>
    <ul>${INVARIANTS.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
    <p style="margin:8px 0 0">页面是纯前端确定性回放：刷新即回到初始预设，不连接任何后端、不调用任何模型。教材原文与题目为演示用合成样例。</p>`
}

/* ── 渲染与调度 ── */
function renderAll() {
  document.getElementById('theme-toggle').setAttribute('title', `切换到${uiTheme === 'dark' ? '浅色' : '深色'}主题`)
  renderPresets()
  renderRail()
  renderQuestion()
  renderActions()
  renderTextbook()
  renderLog()
  renderCalibration()
  renderTrace()
  renderInvariants()
  if (uiState.focusTick !== paintedFocusTick) {
    paintedFocusTick = uiState.focusTick
    scrollToActiveChunk()
  }
}

function scrollToActiveChunk() {
  const box = document.getElementById('textbook-scroll')
  const chunk = box.querySelector('.chunk.is-active')
  if (!chunk) return
  const top = chunk.offsetTop - box.clientHeight / 2 + chunk.clientHeight / 2
  box.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

function dispatch(action) {
  const next = reduceDemo(uiState, action)
  if (next === uiState) return
  uiState = next
  renderAll()
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-act]')
  if (!target) return
  const act = target.dataset.act
  switch (act) {
    case 'preset':
      dispatch({ type: 'selectPreset', presetId: target.dataset.preset })
      break
    case 'run':
      dispatch({ type: 'runGate' })
      break
    case 'approve':
      dispatch({ type: 'humanDecide', decision: 'approve' })
      break
    case 'reject':
      dispatch({ type: 'humanDecide', decision: 'reject' })
      break
    case 'anchor':
      dispatch({
        type: 'focusAnchor',
        page: Number(target.dataset.page),
        chunkId: target.dataset.chunk
      })
      break
    case 'trace':
      dispatch({ type: 'toggleTrace' })
      break
    case 'reset':
      dispatch({ type: 'reset' })
      break
    case 'theme':
      uiTheme = uiTheme === 'dark' ? 'light' : 'dark'
      applyTheme(uiTheme)
      renderAll()
      break
    default:
      break
  }
})

applyTheme(uiTheme)
renderAll()