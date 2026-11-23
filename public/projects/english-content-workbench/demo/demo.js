/**
 * 英语教研内容生产工作台 · LangGraph 观测与评测闭环台 — 浏览器运行时。
 *
 * 页面是 public/ 下的纯静态资源，运行时无法 import TypeScript 模块，因此权威状态机放在
 * `src/lib/demo/english/machine.js`（由 `state.ts` 提供类型外壳、`state.test.ts` 锁死不变量），
 * 本文件将 `machine.js` 逐字节内联在下方两个 marker 之间。修改 `machine.js` 后请执行：
 *
 *   bun scripts/sync-english-demo.mjs
 *
 * `src/lib/demo/english/mirror.test.ts` 会对两处副本做逐字节比对。
 */
/* __ENGLISH_MACHINE_BEGIN__ */
/**
 * 英语教研内容生产工作台 · LangGraph 观测与评测闭环台 — 纯函数确定性状态机。
 *
 * 完整承载六大核心工程闭环（零后端、确定性回放）：
 *   A. LangGraph 7 节点链路级 Trace 与 Span 载荷观测
 *   B. Judge 四项硬核工程配置（跨模型解耦 / temp=0.0 / 先证据后判定 / 硬规则 0 Token 短路）
 *   C. 评测指标下钻拆解（4 大教学维度 × 6 项原子判据）
 *   D. 二元 Rubric（1 / 0 / unknown）合成就绪分与关键项一票否决
 *   E. unknown 占比反查定义歧义 + 人人一致率（≥85%）/ 人机一致率（≥90%）三版校准迭代 + 20/5 假通过冷启动保护
 *   F. Bad Case 根因归因矩阵与黄金回归集回流飞轮
 *
 * 本文件刻意保持纯 JavaScript：`public/projects/english-content-workbench/demo/demo.js`
 * 作为纯静态资源逐字节内联本文件，`src/lib/demo/english/state.ts` 提供 TypeScript 类型外壳，
 * `mirror.test.ts` 对两处副本做逐字节一致性校验。
 */

export const PROJECT_NAME = '英语教研内容生产工作台'
export const WORKBENCH_NAME = '英语教研内容生产工作台 · LangGraph 观测与评测闭环台'

export const GENERATOR_MODEL = 'qwen-plus-latest'
export const JUDGE_MODEL = 'deepseek-v4-flash'
export const RETRIEVER_MODEL = 'bge-m3 + bge-reranker-v2'
export const RULE_ENGINE = 'Pydantic v2 + YAML 硬规则引擎'

export const QUALITY_THRESHOLD = 70
export const MAX_REVISION_ROUNDS = 3
export const REVIEW_TARGET = 20
export const FALSE_PASS_TARGET = 5
/** 成本估算单价：¥ / 1k tokens */
export const COST_PER_1K_TOKENS = 0.002

export const CALIBRATION_SET_SIZE = 40
export const IAA_THRESHOLD = 85
export const HUMAN_AI_THRESHOLD = 90
export const UNKNOWN_TARGET_MAX = 5
export const REGRESSION_BASE_COUNT = 128

export const BINARY_VERDICTS = ['1', '0', 'unknown']

export const WORKSPACE_VIEWS = [
  {
    id: 'pipeline',
    label: '单题闯关与 LangGraph Trace 观测',
    shortLabel: '① 单题闯关 & Trace',
    summary: '7 节点链路 · 二元 Rubric · 原文切片锚点'
  },
  {
    id: 'calibration',
    label: 'Rubric 二元校准与人机一致迭代',
    shortLabel: '② Rubric 校准迭代',
    summary: 'unknown 反查 → 85% / 90% 阈值'
  },
  {
    id: 'flywheel',
    label: 'Judge 配置与 Bad Case 归因飞轮',
    shortLabel: '③ Judge & BadCase 飞轮',
    summary: '跨模型 temp=0.0 · 回归集回流'
  }
]

export const ACTION_NAMES = [
  'selectPreset',
  'switchView',
  'runGate',
  'focusAnchor',
  'selectNode',
  'humanDecide',
  'recordExtraReview',
  'toggleTrace',
  'selectRubricVersion',
  'advanceRubricVersion',
  'selectBadCase',
  'resolveBadCase',
  'reset'
]

export const GATE_LABELS = {
  'schema-rule': '① 规则校验',
  'llm-judge': '② Judge 评分',
  'human-review': '③ 人工复核'
}

export const LANGGRAPH_NODE_SPECS = [
  { id: 'retrieve_chunks', step: 1, label: '知识检索', role: '结构化切片召回' },
  { id: 'generate_draft', step: 2, label: '题目生成', role: '生成模型出初稿' },
  { id: 'schema_rule_guard', step: 3, label: '服务端硬规则', role: '0 Token 跨字段拦截' },
  { id: 'binary_rubric_judge', step: 4, label: '二元 Rubric 评审', role: '跨模型 temp=0.0' },
  { id: 'revise_draft', step: 5, label: '带诊断回炉改版', role: '定向修复未过项' },
  { id: 'human_interrupt', step: 6, label: '人工复核断点', role: 'interrupt_before 挂起' },
  { id: 'sample_or_badcase', step: 7, label: '样本入库 / BadCase 归因', role: '终审分流回流' }
]

/**
 * Pillar B · Judge 模型四项工程规范：与页面展示严格同源。
 */
export const JUDGE_ENGINEERING_SPECS = [
  {
    id: 'cross-model-decoupling',
    badge: 'Spec 01 · 异构解耦',
    title: '跨模型解耦评审（消除同族自评偏见）',
    summary:
      '生成侧固定使用 qwen-plus-latest（初稿 temp=0.7 / 改版 temp=0.3），评审侧独立使用 deepseek-v4-flash，切断生成模型对自身行文偏好的高分滤镜。',
    configLine: `generator=${GENERATOR_MODEL} ↔ judge=${JUDGE_MODEL}`
  },
  {
    id: 'deterministic-sampling',
    badge: 'Spec 02 · 确定采样',
    title: 'temperature = 0.0 + JSON Schema 强约束',
    summary:
      '评审采样固定 temperature = 0.0，配合 strict JSON Schema 枚举约束每个原子判据仅允许输出 "1" | "0" | "unknown"，保证同稿重评结果稳定可复现。',
    configLine: 'temperature=0.0 · response_format=json_schema(strict=true)'
  },
  {
    id: 'evidence-first-cot',
    badge: 'Spec 03 · 证据前置',
    title: '先证据后判定（Evidence-First CoT）',
    summary:
      'Schema 字段顺序强制要求先输出 aligned_chunk_id 与教材原文逐字摘录 evidence_quote，再逐条推导并给出 0 / 1 / unknown，严禁无出处笼统打印象分。',
    configLine: 'aligned_chunk_id → evidence_quote → items[R1..R6].verdict'
  },
  {
    id: 'rule-short-circuit',
    badge: 'Spec 04 · 规则短路',
    title: '确定性代码规则前置短路（0 Judge Token）',
    summary:
      '完形空位数与 blanks 数组不一致、ABCD 选项文本重复、标答越界等跨字段错误由 Pydantic v2 + YAML 规则直接拒收，judgeScore = null、Judge Token = 0。',
    configLine: 'Pydantic model_validator → short_circuit_judge (tokens=0)'
  }
]

export const JUDGE_SCHEMA_SNIPPET = `{
  "aligned_chunk_id": "p42-c3",
  "evidence_quote": "The only clue was the word CROATOAN carved on a post...",
  "verdicts": {
    "R1": { "reason": "设空唯一考查过去分词作后置定语", "verdict": "1" },
    "R2": { "reason": "仅 A. carved 表被动成立，B/C/D 均排除", "verdict": "1" },
    "R3": { "reason": "三项干扰分别对应不定式/现在分词/原形易错点", "verdict": "1" },
    "R4": { "reason": "四项语法功能互斥无同义重叠", "verdict": "1" },
    "R5": { "reason": "解析引用页码与 p42-c3 原文逐句吻合", "verdict": "1" },
    "R6": { "reason": "专有名词 CROATOAN 超出课标常规表，交人工确认", "verdict": "unknown" }
  }
}`

/**
 * Pillar C & D · 四大教学维度下钻为 6 项原子二元 Rubric（总权重 = 100）。
 */
export const BINARY_RUBRIC_DIMENSIONS = [
  {
    id: 'alignment',
    order: 1,
    title: '考点与题干契合度',
    rubricIds: ['R1'],
    totalWeight: 18
  },
  {
    id: 'uniqueness',
    order: 2,
    title: '答案正确与唯一性',
    rubricIds: ['R2'],
    totalWeight: 22
  },
  {
    id: 'distractors',
    order: 3,
    title: '干扰项教学有效性',
    rubricIds: ['R3', 'R4'],
    totalWeight: 33
  },
  {
    id: 'grounding',
    order: 4,
    title: '解析与教材原文 Grounding',
    rubricIds: ['R5', 'R6'],
    totalWeight: 27
  }
]

export const BINARY_RUBRIC_ITEMS = [
  {
    id: 'R1',
    dimensionId: 'alignment',
    dimensionTitle: '考点与题干契合度',
    title: '目标语法/词汇考点唯一命中',
    criteria: '设空或设问唯一锁定目标语法/词汇知识点，未偏移为普通词义辨析',
    weight: 18,
    critical: true
  },
  {
    id: 'R2',
    dimensionId: 'uniqueness',
    dimensionTitle: '答案正确与唯一性',
    title: '标准答案代入成立且其余选项代入均不成立',
    criteria: '标答在语法和语境上完全成立，其余 3 个干扰项代入均有客观排除依据',
    weight: 22,
    critical: true
  },
  {
    id: 'R3',
    dimensionId: 'distractors',
    dimensionTitle: '干扰项教学有效性',
    title: '每个干扰项对应明确易错点而非凑数废项',
    criteria: '干扰项须命中同词根变形、课标易混词或跨句语境误读，禁止无关词凑数',
    weight: 16,
    critical: false
  },
  {
    id: 'R4',
    dimensionId: 'distractors',
    dimensionTitle: '干扰项教学有效性',
    title: '干扰项间无语义重叠或同义并存',
    criteria: '四个选项语义与时态边界互斥，同一语境下绝不出现双解并存',
    weight: 17,
    critical: true
  },
  {
    id: 'R5',
    dimensionId: 'grounding',
    dimensionTitle: '解析与教材原文 Grounding',
    title: '解析引用的页码与教材切片原文逐句吻合',
    criteria: 'evidence_quote 与 aligned_chunk_id 原文逐字对齐，无跨页错引或无依据臆造',
    weight: 16,
    critical: true
  },
  {
    id: 'R6',
    dimensionId: 'grounding',
    dimensionTitle: '解析与教材原文 Grounding',
    title: '词汇超纲率符合目标学段课标',
    criteria: '除教材既有专有名词外，题干与选项超纲生词占比控制在课标阈值内',
    weight: 11,
    critical: false
  }
]

/** 兼容四维度权重汇总表（供契约校验与概览展示） */
export const RUBRIC_WEIGHTS = {
  alignment: 0.18,
  uniqueness: 0.22,
  distractors: 0.33,
  grounding: 0.27
}

/**
 * Pillar E · R3「干扰项教学有效性」在 40 题双盲标注集上的三版演进轨迹。
 * 所有百分比均对应 N = 40 的精确整数样本比（1/40 = 2.5%）。
 */
export const RUBRIC_CALIBRATION_VERSIONS = [
  {
    version: 'v1',
    step: 1,
    title: 'v1 · 初始模糊定义',
    targetRubricId: 'R3',
    targetRubricTitle: '干扰项教学有效性',
    sampleSize: CALIBRATION_SET_SIZE,
    promptDefinition: '「干扰项具有一定迷惑性且难度适中，能够有效考查学生英语水平。」',
    changeHighlight: '尚未拆解何为「迷惑性」与「难度适中」，完全依赖主观语感判断。',
    unknownCount: 10,
    unknownRate: 25.0,
    iaaMatchCount: 29,
    iaaRate: 72.5,
    humanAiMatchCount: 27,
    humanAiRate: 67.5,
    cohenKappa: 0.36,
    gateReady: false,
    statusBadge: '禁止启用自动门禁',
    diagnosis:
      'unknown 占比高达 25.0% 且人人一致率仅 72.5%（未达 85% 阈值），说明不是模型笨，而是 Rubric 定义含糊，禁止启用自动门禁！',
    disagreementCase:
      '例 #14（高一完形）：干扰项放了同话题名词 voyage / journey。教研员甲判 1（认为话题相关有迷惑性），教研员乙判 0（动词空塞名词属凑数废项），Judge 因「难度适中」无客观锚点输出 unknown。',
    nextActionLabel: '拆解歧义，迭代至 v2'
  },
  {
    version: 'v2',
    step: 2,
    title: 'v2 · 拆解词性与混淆源',
    targetRubricId: 'R3',
    targetRubricTitle: '干扰项教学有效性',
    sampleSize: CALIBRATION_SET_SIZE,
    promptDefinition:
      '「每个干扰项须属于目标空的同词性语法变形（时态/语态/非谓语）或同义近形课标易混词，否则判 0。」',
    changeHighlight: '删去「一定迷惑性/难度适中」形容词，改写为可核验的词性变形与课标易混词集合。',
    unknownCount: 4,
    unknownRate: 10.0,
    iaaMatchCount: 34,
    iaaRate: 85.0,
    humanAiMatchCount: 33,
    humanAiRate: 82.5,
    cohenKappa: 0.66,
    gateReady: false,
    statusBadge: '人人已达标 · 待补反例边界',
    diagnosis:
      'unknown 降至 10.0%，人人一致率升至 85.0%（≥ 85% 达标 ✓），但人机一致率 82.5% 仍距 90% 差一步——分歧集中漏在完形填空「跨句语境逻辑干扰项」。',
    disagreementCase:
      '例 #29（完形连词空）：选项含 however / therefore / besides。两位教研员均判 1（典型跨句逻辑易错点），但 Judge 按 v2 字面寻找「词形变化」未果，保守输出 unknown / 0。',
    nextActionLabel: '补齐反例边界，收敛至 v3 定稿'
  },
  {
    version: 'v3',
    step: 3,
    title: 'v3 · 补齐反例边界与缺省证据规则（定稿）',
    targetRubricId: 'R3',
    targetRubricTitle: '干扰项教学有效性',
    sampleSize: CALIBRATION_SET_SIZE,
    promptDefinition:
      '「干扰项须命中以下三类教学易错点之一：① 同词根时态/语态/非谓语变形；② 课标高频近义/近形易混词；③ 完形/阅读跨句因果或指代误读项。纯凑数无关词判 0；若缺乏题干或切片上下文支撑排他性验证，直判 unknown。」',
    changeHighlight:
      '补入跨句语境干扰正例与凑数词反例边界，并显式规定「无上下文证据直判 unknown」防强行猜判。',
    unknownCount: 1,
    unknownRate: 2.5,
    iaaMatchCount: 36,
    iaaRate: 90.0,
    humanAiMatchCount: 37,
    humanAiRate: 92.5,
    cohenKappa: 0.85,
    gateReady: true,
    statusBadge: '已达可信阈值 · 正式纳入线上门禁',
    diagnosis:
      "unknown 占比收敛至 2.5%，人人一致率 90.0%（≥ 85% ✓），人机一致率 92.5%（≥ 90% ✓，Cohen's κ = 0.85），正式纳入线上自动门禁！",
    disagreementCase:
      '仅剩例 #38（古英语诗歌引文生僻修辞）1 题触发 unknown 交人工兜底；其余 39 题人机二元判定高度对齐。',
    nextActionLabel: null
  }
]

/**
 * Pillar F · 代表性 Bad Case 根因归因矩阵与回流动作。
 */
export const BAD_CASES = [
  {
    id: 'BC-01',
    title: '完形填空题号与 blanks 数组错位 + 选项重复',
    stage: 'schema_rule_guard · 服务端校验前',
    symptom:
      '生成初稿 passage 含 4 处设空，但 blanks 数组仅输出 3 项，且选项 B 与 D 均为 to carve。',
    category: '确定性规则缺口',
    rootCause: '早期把格式与跨字段一致性混在 LLM Prompt 里提醒，既浪费 Judge Token 又偶发漏检。',
    fixAction:
      '下沉至 Pydantic v2 model_validator + YAML 跨字段硬规则，不调模型 0 Token 直接短路拦截。',
    impactMetric: '畸形结构题拦截率 100%，单次短路节省约 2,380 Judge Tokens',
    regressionTag: 'rule_cloze_blank_parity_and_dedup'
  },
  {
    id: 'BC-02',
    title: '阅读理解跨页表格漏切导致无出处臆造',
    stage: 'retrieve_chunks · 知识检索',
    symptom:
      '固定字符滑窗把 P.57–58 珊瑚白化恢复周期对照段切碎，生成模型凭外部常识编造未出现的周数。',
    category: 'RAG 结构化切块缺失',
    rootCause: 'PDF 切块未尊重教材自然章节、Language Focus 与跨页段落边界，关键证据块未进 Top-5。',
    fixAction: '改为按教材标题层级与段落结构切块 + BM25/向量混合重排，评测集 Recall@5 达 44/44。',
    impactMetric: '教材证据块 Recall@5 升至 44/44（100%），R5 原文对齐违例清零',
    regressionTag: 'rag_cross_page_section_chunking'
  },
  {
    id: 'BC-03',
    title: '89 分高分题双解共存被人工驳回（False Pass）',
    stage: 'human_interrupt · 人工复核',
    symptom:
      '过去虚拟语气题获 Judge 89 分通过，但教研员复核发现 D 项 had been studying 在持续语境下与标答 C. had studied 双解并存。',
    category: 'R4 干扰项同义排他判据缺口',
    rootCause: 'R4 旧判据只检查字面近义词，未要求核验「同一时间状语下不同完成时态的语法相容性」。',
    fixAction:
      '收紧 R4 二元排他判据（强制代入检验时态体貌互斥性），并将本题沉淀为黄金回归集必测反例。',
    impactMetric: '同类时态双解假通过清零，R4 单项人机一致率升至 95.0%',
    regressionTag: 'rubric_r4_subjunctive_aspect_exclusivity'
  },
  {
    id: 'BC-04',
    title: '初稿目标语法点偏移为普通词义辨析',
    stage: 'generate_draft · 题目生成',
    symptom: '指定考查「过去分词作后置定语」，初稿却生成四个不同实义动词过去分词的词义题。',
    category: '生成 Prompt 约束漂移',
    rootCause: '生成模板仅传入知识点名称，缺少同词根语法形式对比槽位约束。',
    fixAction:
      '在 generate_draft 注入同词根非谓语变形槽位约束，并由 R1 唯一命中二元判据自动兜底回炉。',
    impactMetric: '首轮考点唯一命中率提升至 94%，平均改版轮次收敛至 1.2 轮',
    regressionTag: 'gen_grammar_slot_homoroot_constraint'
  }
]

/**
 * 页面底部展示并由单测锁死的核心不变量。
 */
export const INVARIANTS = [
  '硬规则拦下的轮次不调用 Judge 模型，judgeScore 为 null 且 Judge Token 消耗为 0',
  'Judge 采用跨模型解耦与 temperature = 0.0，先输出教材证据再给出 6 项 1/0/unknown 二元判定',
  '综合就绪分低于 70 分或关键项出现 0 分时自动携带诊断回炉改版，最多 3 轮',
  'Judge 达标后停在 LangGraph 人工复核断点，未经人工通过绝不自动写入样本库',
  'unknown 占比过高优先反查 Rubric 定义歧义；人人一致率 ≥ 85% 且人机一致率 ≥ 90% 方可上线门禁',
  '人工驳回高分题计入假通过（满 20 条复核且含 5 条假通过触发复盘），Bad Case 归因后回流黄金回归集'
]

/**
 * 计算 6 项二元 Rubric（1 / 0 / unknown）的合成就绪分与关键门禁状态。
 */
export function evaluateBinaryRubrics(verdicts) {
  let score = 0
  const passIds = []
  const zeroIds = []
  const unknownIds = []
  const criticalZeroIds = []

  for (const item of BINARY_RUBRIC_ITEMS) {
    const verdict = verdicts[item.id]
    if (!BINARY_VERDICTS.includes(verdict)) {
      throw new Error(`invalid binary verdict for ${item.id}: ${verdict}`)
    }
    if (verdict === '1') {
      score += item.weight
      passIds.push(item.id)
    } else if (verdict === '0') {
      zeroIds.push(item.id)
      if (item.critical) criticalZeroIds.push(item.id)
    } else {
      unknownIds.push(item.id)
    }
  }

  const dimensionBreakdown = {}
  for (const dim of BINARY_RUBRIC_DIMENSIONS) {
    const earned = BINARY_RUBRIC_ITEMS.filter(
      (item) => item.dimensionId === dim.id && verdicts[item.id] === '1'
    ).reduce((sum, item) => sum + item.weight, 0)
    dimensionBreakdown[dim.id] = Math.round((earned / dim.totalWeight) * 100)
  }

  return {
    score,
    passed: score >= QUALITY_THRESHOLD && criticalZeroIds.length === 0,
    passIds,
    zeroIds,
    unknownIds,
    criticalZeroIds,
    dimensionBreakdown
  }
}

/** 确定性规则直接拦截的轮次：不调 Judge、无分数、0 Token。 */
function ruleFail(index, ruleErrors, draftStem, draftOptions, sourceAnchor) {
  return {
    round: index,
    stage: 'schema-rule',
    passed: false,
    ruleErrors,
    judgeScore: null,
    judgeBreakdown: null,
    rubricVerdicts: null,
    rubricNotes: null,
    criticalZeroIds: [],
    evidenceQuote: null,
    draftStem,
    draftOptions,
    sourceAnchor,
    tokensUsed: 0,
    trace: {
      model: RULE_ENGINE,
      temperature: null,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 12
    }
  }
}

/** 通过确定性规则但尚未调用 Judge 的轮次：0 Judge Token。 */
function rulePass(index, draftStem, draftOptions, sourceAnchor) {
  return {
    round: index,
    stage: 'schema-rule',
    passed: true,
    ruleErrors: [],
    judgeScore: null,
    judgeBreakdown: null,
    rubricVerdicts: null,
    rubricNotes: null,
    criticalZeroIds: [],
    evidenceQuote: null,
    draftStem,
    draftOptions,
    sourceAnchor,
    tokensUsed: 0,
    trace: {
      model: RULE_ENGINE,
      temperature: null,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 14
    }
  }
}

/** 二元 Rubric Judge 评审轮次：temperature = 0.0，先证据后 1/0/unknown 判定。 */
function judged(
  index,
  verdicts,
  rubricNotes,
  evidenceQuote,
  draftStem,
  draftOptions,
  sourceAnchor,
  tokensUsed,
  latencyMs
) {
  const result = evaluateBinaryRubrics(verdicts)
  const tokensIn = Math.round(tokensUsed * 0.82)
  return {
    round: index,
    stage: 'llm-judge',
    passed: result.passed,
    ruleErrors: [],
    judgeScore: result.score,
    judgeBreakdown: result.dimensionBreakdown,
    rubricVerdicts: { ...verdicts },
    rubricNotes: { ...rubricNotes },
    criticalZeroIds: result.criticalZeroIds,
    evidenceQuote,
    draftStem,
    draftOptions,
    sourceAnchor,
    tokensUsed,
    trace: {
      model: JUDGE_MODEL,
      temperature: 0.0,
      tokensIn,
      tokensOut: tokensUsed - tokensIn,
      latencyMs
    }
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

const CLOZE_STEM_FIRST = `Read the passage and choose the best option for Blank 3.

The colony of Roanoke was established in 1587 ___1___ one hundred and fifteen settlers. Their governor, John White, sailed back to England for supplies, ___2___ a war delayed his return for three years. When he finally came back, the settlement was empty. The only clue was the word CROATOAN ___3___ on a post. ___4___`

const CLOZE_STEM_FIXED = `Read the passage and choose the best option for Blank 3.

The colony of Roanoke was established in 1587 ___1___ one hundred and fifteen settlers. Their governor, John White, sailed back to England for supplies, ___2___ a war delayed his return for three years. When he finally came back, the settlement was empty. The only clue was the word CROATOAN ___3___ on a post, and the letters C-R-O ___4___ into a nearby tree.`

const CLOZE_OPTIONS_BROKEN = [
  { key: 'A', text: 'carved' },
  { key: 'B', text: 'to carve' },
  { key: 'C', text: 'carving' },
  { key: 'D', text: 'to carve' }
]

const CLOZE_OPTIONS_FIXED = [
  { key: 'A', text: 'carved' },
  { key: 'B', text: 'to carve' },
  { key: 'C', text: 'carving' },
  { key: 'D', text: 'be carved' }
]

const READING_STEM_FIRST = `Read the passage and answer the question.

Coral bleaching happens when water stays too warm for too long. The coral expels the algae that live inside its tissue and give it both colour and most of its food. What is left is a white skeleton that can still recover if the water cools within a few weeks. A reef that bleaches in four consecutive years, however, has almost no time to rebuild.

Question: According to the passage, what decides whether a bleached reef recovers?`

const READING_STEM_FINAL = `Read the passage and answer the question.

Coral bleaching happens when water stays too warm for too long. The coral expels the algae that live inside its tissue and give it both colour and most of its food. What is left is a white skeleton that can still recover if the water cools again within a few weeks. A reef that bleaches in four consecutive years, however, has almost no time to rebuild.

Question: According to the passage, which condition most directly decides whether a bleached reef can recover?`

const READING_OPTIONS_FIRST = [
  { key: 'A', text: 'How long the warm water lasts and whether it cools again.' },
  { key: 'B', text: 'How many algae the coral expels on the first warm day.' },
  { key: 'C', text: 'How white the skeleton looks after the algae leave.' },
  { key: 'D', text: 'How many fish still swim around the reef.' }
]

const READING_OPTIONS_FINAL = [
  { key: 'A', text: 'Whether the surrounding water cools again within a few weeks.' },
  { key: 'B', text: 'Whether the expelled algae change colour before drifting away.' },
  { key: 'C', text: 'Whether the white skeleton hardens during the warm season.' },
  { key: 'D', text: 'Whether nearby reefs expel their algae at the same speed.' }
]

const MCQ_STEM = `Choose the best option to complete the sentence.

If she ___ harder last term, she would have passed the exam.`

const MCQ_OPTIONS = [
  { key: 'A', text: 'studied' },
  { key: 'B', text: 'studies' },
  { key: 'C', text: 'had studied' },
  { key: 'D', text: 'had been studying' }
]

const CLOZE_PRESET = {
  id: 'cloze-rule-block',
  threadId: 'lg-thread-cloze-042',
  label: '① 完形填空 · 硬规则 0 Token 拦截',
  questionType: 'cloze',
  title: '完形填空 · The Lost Colony',
  stem: CLOZE_STEM_FIRST,
  options: CLOZE_OPTIONS_BROKEN,
  answer: 'A',
  explanation:
    '此处考查非谓语动词作后置定语修饰 the word CROATOAN，carved 为过去分词表被动完成（被刻在木柱上的词）；不定式 to carve 与现在分词 carving 均不合语态。初稿中选项 B 与 D 重复且空位计数错配，在进入 Judge 前直接由服务端硬规则 0 Token 拦截。',
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
      CLOZE_OPTIONS_BROKEN,
      CLOZE_ANCHOR
    ),
    judged(
      2,
      { R1: '1', R2: '1', R3: '1', R4: '1', R5: '1', R6: 'unknown' },
      {
        R1: '设空精准锁定过去分词作后置定语考点',
        R2: '仅 A. carved 表被动成立，其余三项语法均排除',
        R3: 'B 不定式、C 现在分词、D 被动原形分别对应典型易错点',
        R4: '已消除重复项，四项语法功能互斥',
        R5: '解析引用与 P.42 · 块 3 原文逐字吻合',
        R6: '历史专名 Roanoke / CROATOAN 不在常规课标词表，记 unknown 请教研员确认注释'
      },
      'The only clue was the word CROATOAN carved on a post, and the letters C-R-O cut into a tree nearby.',
      CLOZE_STEM_FIXED,
      CLOZE_OPTIONS_FIXED,
      CLOZE_ANCHOR,
      2380,
      4120
    )
  ],
  ledgerSeed: { totalReviewed: 0, falsePassCount: 0 },
  endDecision: 'pending'
}

const READING_PRESET = {
  id: 'reading-low-score',
  threadId: 'lg-thread-read-057',
  label: '② 阅读理解 · 二元诊断自动改版',
  questionType: 'reading',
  title: '阅读理解 · Coral Bleaching',
  stem: READING_STEM_FIRST,
  options: READING_OPTIONS_FIRST,
  answer: 'A',
  explanation:
    '原文明确指出白化珊瑚能否恢复取决于水温是否在几周内重新变凉（cools again within a few weeks）。首轮因题干问法宽泛（R2=unknown）且干扰项流于表面细节（R3=0）仅得 62 分，自动携带二元诊断回炉改版至 100 分。',
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
    rulePass(1, READING_STEM_FIRST, READING_OPTIONS_FIRST, READING_ANCHOR),
    judged(
      2,
      { R1: '1', R2: 'unknown', R3: '0', R4: '1', R5: '1', R6: '1' },
      {
        R1: '命中阅读因果决定条件定位考点',
        R2: '题干 what decides 未限定单次直接恢复条件，与跨年退化段存在边界歧义（判 unknown）',
        R3: '违例：C/D 仅描摹颜色与鱼群表象，缺乏因果倒置干扰深度（判 0）',
        R4: '四个选项表述无同义重叠',
        R5: '引用 P.57 · 块 2 原文准确',
        R6: '词汇难度符合高中必修课标'
      },
      'What is left is a white skeleton that can still recover if the water cools again within a few weeks.',
      READING_STEM_FIRST,
      READING_OPTIONS_FIRST,
      READING_ANCHOR,
      3120,
      5310
    ),
    judged(
      3,
      { R1: '1', R2: '1', R3: '1', R4: '1', R5: '1', R6: '1' },
      {
        R1: 'most directly 精准锁定直接恢复条件考点',
        R2: 'A 项唯一对应 cools again within a few weeks，其余三项均被原文排除',
        R3: '重构后的 B/C/D 均围绕白化伴随结果设障，有效检验因果区分能力',
        R4: '四项条件维度清晰互斥',
        R5: '解析与 P.57 · 块 2 原文逐句对齐',
        R6: '课标词汇覆盖率完全合规'
      },
      'What is left is a white skeleton that can still recover if the water cools again within a few weeks.',
      READING_STEM_FINAL,
      READING_OPTIONS_FINAL,
      READING_ANCHOR,
      4180,
      5620
    )
  ],
  ledgerSeed: { totalReviewed: 0, falsePassCount: 0 },
  endDecision: 'pending'
}

const MCQ_PRESET = {
  id: 'false-pass-calibration',
  threadId: 'lg-thread-mcq-071',
  label: '③ 单项选择 · 89 分假通过终审拦截',
  questionType: 'mcq',
  title: '单项选择 · Subjunctive Mood',
  stem: MCQ_STEM,
  options: MCQ_OPTIONS,
  answer: 'C',
  explanation:
    '本意考查与过去事实相反的虚拟条件句（if + had done, would have done）。Judge 对照课本例句给出 89 分通过，但人工复核发现 D 项 had been studying（过去完成进行时）在 last term 持续性语境下同样语法成立，属典型「高分双解假通过（False Pass）」，须人工驳回并沉淀至 BC-03 回归集。',
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
    rulePass(1, MCQ_STEM, MCQ_OPTIONS, MCQ_ANCHOR),
    judged(
      2,
      { R1: '1', R2: '1', R3: '1', R4: '1', R5: '1', R6: 'unknown' },
      {
        R1: '命中过去虚拟条件句语法考点',
        R2: 'Judge 按课本 had + done 模板判 C 成立（漏检 D 项进行体相容性）',
        R3: '四项均为 study 不同时态体貌变形',
        R4: 'Judge 误判互斥（未识别 had studied 与 had been studying 双解并存风险！）',
        R5: '与 P.71 · 块 2 例句完全对应',
        R6: '过去完成进行时虚拟属选修拓展语法边界，标 unknown 提醒人工复核'
      },
      'If she had studied harder last term, she would have passed the exam.',
      MCQ_STEM,
      MCQ_OPTIONS,
      MCQ_ANCHOR,
      2640,
      3860
    )
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
  const chosen =
    typeof preset === 'string' || preset === undefined
      ? demoPreset(preset || PRESET_IDS[0])
      : preset
  return {
    activeView: 'pipeline',
    preset: chosen,
    rounds: [],
    stage: chosen.rounds[0] ? chosen.rounds[0].stage : 'human-review',
    humanDecision: 'pending',
    inSampleBank: false,
    activeAnchor: null,
    focusTick: 0,
    selectedNodeId: 'generate_draft',
    traceOpen: false,
    exhausted: false,
    ledger: ledgerOf(chosen.ledgerSeed.totalReviewed, chosen.ledgerSeed.falsePassCount),
    rubricVersion: 'v1',
    selectedBadCaseId: BAD_CASES[0].id,
    resolvedBadCaseIds: []
  }
}

function isRoundCleared(entry) {
  return (
    entry.stage === 'llm-judge' &&
    entry.passed &&
    entry.judgeScore !== null &&
    entry.judgeScore >= QUALITY_THRESHOLD &&
    (!entry.criticalZeroIds || entry.criticalZeroIds.length === 0)
  )
}

function runGate(state) {
  if (state.stage === 'human-review') return state

  const script = state.preset.rounds
  const next = script[state.rounds.length]
  if (!next) return state

  const scoredRounds = state.rounds.filter((entry) => entry.stage === 'llm-judge').length
  if (next.stage === 'llm-judge' && scoredRounds >= MAX_REVISION_ROUNDS) {
    return {
      ...state,
      stage: 'human-review',
      exhausted: true,
      selectedNodeId: 'human_interrupt'
    }
  }

  const rounds = [...state.rounds, next]
  const following = script[rounds.length] || null
  const judges = rounds.filter((entry) => entry.stage === 'llm-judge').length
  const cleared = isRoundCleared(next)

  let stage
  let exhausted = false
  if (next.stage === 'schema-rule') {
    stage = following ? following.stage : 'human-review'
  } else if (cleared) {
    stage = 'human-review'
  } else if (following && following.stage === 'llm-judge' && judges < MAX_REVISION_ROUNDS) {
    stage = 'llm-judge'
  } else {
    stage = 'human-review'
    exhausted = true
  }

  const selectedNodeId = next.stage === 'schema-rule' ? 'schema_rule_guard' : 'binary_rubric_judge'

  return {
    ...state,
    rounds,
    stage,
    exhausted,
    humanDecision: 'pending',
    activeAnchor: next.sourceAnchor,
    focusTick: state.focusTick + 1,
    selectedNodeId
  }
}

function reviewLedger(ledger, clearedByJudge, decision) {
  const falsePass = decision === 'rejected' && clearedByJudge ? 1 : 0
  return ledgerOf(ledger.totalReviewed + 1, ledger.falsePassCount + falsePass)
}

function humanDecide(state, decision) {
  if (state.stage !== 'human-review' || state.humanDecision !== 'pending') return state
  const last = state.rounds[state.rounds.length - 1]
  if (!last) return state
  const cleared = isRoundCleared(last)

  if (decision === 'approve') {
    if (!cleared) return state
    return {
      ...state,
      humanDecision: 'approved',
      inSampleBank: true,
      selectedNodeId: 'sample_or_badcase',
      ledger: reviewLedger(state.ledger, cleared, 'approved')
    }
  }

  return {
    ...state,
    humanDecision: 'rejected',
    inSampleBank: false,
    selectedNodeId: 'sample_or_badcase',
    ledger: reviewLedger(state.ledger, cleared, 'rejected')
  }
}

function focusAnchor(state, page, chunkId) {
  const current = state.rounds.length ? state.rounds[state.rounds.length - 1].sourceAnchor : null
  if (!current || current.page !== page || current.chunkId !== chunkId) return state
  return { ...state, activeAnchor: current, focusTick: state.focusTick + 1 }
}

/**
 * Pillar A · 根据当前执行进度派生 LangGraph 7 个节点的实时状态与 Span 载荷。
 */
export function langGraphNodes(state) {
  const preset = state.preset
  const threadId = preset.threadId || `lg-thread-${preset.id}`
  const rounds = state.rounds
  const last = rounds.length ? rounds[rounds.length - 1] : null
  const ruleRounds = rounds.filter((r) => r.stage === 'schema-rule')
  const judgeRounds = rounds.filter((r) => r.stage === 'llm-judge')
  const lastRule = ruleRounds.length ? ruleRounds[ruleRounds.length - 1] : null
  const lastJudge = judgeRounds.length ? judgeRounds[judgeRounds.length - 1] : null
  const hadFailedRound = rounds.some((r) => !r.passed)
  const firstAnchor = preset.rounds[0] ? preset.rounds[0].sourceAnchor : { page: 1, chunkId: 'c1' }

  // 1. retrieve_chunks
  const retrieveNode = {
    id: 'retrieve_chunks',
    step: 1,
    label: '知识检索',
    role: '结构化切片召回',
    status: 'completed',
    executed: true,
    badge: `Top-5 命中 · ${firstAnchor.chunkId}`,
    span: {
      spanId: `${threadId}:span-01-retrieve`,
      threadId,
      checkpointStatus: 'checkpoint_saved · step 1',
      modelProfile: RETRIEVER_MODEL,
      temperature: null,
      latencyMs: 146,
      promptTokens: 0,
      completionTokens: 0,
      inputSummary: `query="${preset.title}" · 按章节/段落 AST 边界检索教材知识库`,
      outputSummary: `召回 ${preset.chunks.length} 个结构化教材切片，主证据锚点锁定 P.${firstAnchor.page} (${firstAnchor.chunkId})`
    }
  }

  // 2. generate_draft
  const generateNode = {
    id: 'generate_draft',
    step: 2,
    label: '题目生成',
    role: '生成模型出初稿',
    status: 'completed',
    executed: true,
    badge: '初稿 v1 已产出',
    span: {
      spanId: `${threadId}:span-02-generate`,
      threadId,
      checkpointStatus: 'checkpoint_saved · step 2',
      modelProfile: `${GENERATOR_MODEL}（生成侧模型）`,
      temperature: 0.7,
      latencyMs: 2680,
      promptTokens: 1340,
      completionTokens: 420,
      inputSummary: `注入教材切片 ${firstAnchor.chunkId} + 题型 Schema（${preset.questionType}）+ 目标课标考点`,
      outputSummary: `产出初稿 draft_v1（题干 + 4 选项 + 标答 ${preset.answer} + 解析），移交服务端硬规则门禁`
    }
  }

  // 3. schema_rule_guard
  let ruleStatus = 'pending'
  let ruleBadge = '待校验'
  let ruleInput = '等待执行第 1 轮服务端跨字段硬规则校验'
  let ruleOutput = '尚未执行'
  let ruleLatency = 0
  let ruleCkpt = 'pending · before step 3'
  if (rounds.length > 0) {
    const blockedNow = last && last.stage === 'schema-rule' && !last.passed
    ruleStatus = blockedNow ? 'blocked' : 'completed'
    ruleLatency = lastRule ? lastRule.trace.latencyMs : 12
    if (blockedNow) {
      ruleBadge = '0 Token 硬拦'
      ruleCkpt = 'short_circuited · 阻断送审 Judge'
      ruleInput = `校验初稿 draft_v1（题型=${preset.questionType}，跨字段计数 + 选项去重 + 标答合法性）`
      ruleOutput = `拦截 ${last.ruleErrors.length} 条硬规则违例：${last.ruleErrors.join('；')} → Judge Token = 0`
    } else {
      ruleBadge = '0 Token 通过'
      ruleCkpt = 'checkpoint_saved · step 3'
      ruleInput = `校验当前题稿结构完整性与跨字段确定性约束（${preset.questionType}）`
      ruleOutput = '全部 Pydantic v2 + YAML 跨字段硬规则通过，耗费 0 Judge Token，放行进入二元评审'
    }
  }
  const ruleNode = {
    id: 'schema_rule_guard',
    step: 3,
    label: '服务端硬规则',
    role: '0 Token 跨字段拦截',
    status: ruleStatus,
    executed: ruleStatus !== 'pending',
    badge: ruleBadge,
    span: {
      spanId: `${threadId}:span-03-rule-guard`,
      threadId,
      checkpointStatus: ruleCkpt,
      modelProfile: RULE_ENGINE,
      temperature: null,
      latencyMs: ruleLatency,
      promptTokens: 0,
      completionTokens: 0,
      inputSummary: ruleInput,
      outputSummary: ruleOutput
    }
  }

  // 4. binary_rubric_judge
  let judgeStatus = 'pending'
  let judgeBadge = '待评审'
  let judgeLatency = 0
  let judgeIn = 0
  let judgeOut = 0
  let judgeCkpt = 'pending · before step 4'
  let judgeInput = '等待服务端硬规则放行后启动跨模型二元 Rubric 评审'
  let judgeOutput = '尚未执行'

  if (last && last.stage === 'schema-rule' && !last.passed && !lastJudge) {
    judgeStatus = 'short-circuited'
    judgeBadge = '前置短路 · 0 tok'
    judgeCkpt = 'skipped_by_rule_guard · 0 tokens'
    judgeInput = '未接收题稿：上游 schema_rule_guard 已触发硬规则拦截'
    judgeOutput = '短路跳过！未调用 deepseek-v4-flash，省下整轮评审开销（Judge Token = 0）'
  } else if (lastJudge) {
    judgeStatus = lastJudge.passed ? 'completed' : 'failed'
    judgeBadge = `${lastJudge.judgeScore} 分 · ${lastJudge.passed ? '达标' : '触发回炉'}`
    judgeLatency = lastJudge.trace.latencyMs
    judgeIn = lastJudge.trace.tokensIn
    judgeOut = lastJudge.trace.tokensOut
    judgeCkpt = `checkpoint_saved · round ${lastJudge.round}`
    const verdictPairs = Object.keys(lastJudge.rubricVerdicts || {})
      .map((k) => `${k}=${lastJudge.rubricVerdicts[k]}`)
      .join(', ')
    judgeInput = `跨模型独立送审第 ${lastJudge.round} 轮题稿 + 教材切片 ${lastJudge.sourceAnchor.chunkId}（强制 Evidence-First JSON Schema）`
    judgeOutput = `aligned_chunk="${lastJudge.sourceAnchor.chunkId}" · 判定 [${verdictPairs}] → 综合就绪分 ${lastJudge.judgeScore} 分`
  }

  const judgeNode = {
    id: 'binary_rubric_judge',
    step: 4,
    label: '二元 Rubric 评审',
    role: '跨模型 temp=0.0',
    status: judgeStatus,
    executed: judgeStatus !== 'pending',
    badge: judgeBadge,
    span: {
      spanId: `${threadId}:span-04-binary-judge`,
      threadId,
      checkpointStatus: judgeCkpt,
      modelProfile: `${JUDGE_MODEL}（独立评审侧）`,
      temperature: 0.0,
      latencyMs: judgeLatency,
      promptTokens: judgeIn,
      completionTokens: judgeOut,
      inputSummary: judgeInput,
      outputSummary: judgeOutput
    }
  }

  // 5. revise_draft
  let reviseStatus = 'pending'
  let reviseBadge = '按需触发'
  let reviseLatency = 0
  let reviseIn = 0
  let reviseOut = 0
  let reviseCkpt = 'conditional_edge · 待定'
  let reviseInput = '仅当硬规则报错或二元 Rubric 未达标时触发定向改版'
  let reviseOutput = '尚未触发'

  if (hadFailedRound && !state.exhausted) {
    reviseStatus = 'completed'
    const failedRule = ruleRounds.find((r) => !r.passed)
    const failedJudge = judgeRounds.find((r) => !r.passed)
    reviseLatency = 2190
    reviseIn = 1560
    reviseOut = 390
    reviseCkpt = 'checkpoint_saved · revision_committed'
    if (failedRule && !failedJudge) {
      reviseBadge = '按规则错误修复'
      reviseInput = `携带硬规则报错回炉：${failedRule.ruleErrors.join('；')}`
      reviseOutput = '补齐第 4 空上下文并将重复选项 D 修正为 be carved，重新送审通过'
    } else if (failedJudge) {
      reviseBadge = '按 Rubric 诊断改版'
      reviseInput = '携带二元诊断回炉：R2=unknown（题干问法宽泛）+ R3=0（干扰项缺因果混淆）'
      reviseOutput = '题干收紧为 most directly decides，重写 B/C/D 为因果倒置干扰项'
    }
  } else if (state.stage === 'human-review' && !hadFailedRound) {
    reviseStatus = 'skipped'
    reviseBadge = '首轮直通跳过'
    reviseCkpt = 'conditional_edge → human_interrupt (0 tok)'
    reviseInput = '首轮即通过硬规则与二元 Rubric 门禁，无需进入回炉分支'
    reviseOutput = '条件边直接路由至 human_interrupt 人工复核断点'
  }

  const reviseNode = {
    id: 'revise_draft',
    step: 5,
    label: '带诊断回炉改版',
    role: '定向修复未过项',
    status: reviseStatus,
    executed: reviseStatus !== 'pending',
    badge: reviseBadge,
    span: {
      spanId: `${threadId}:span-05-revise`,
      threadId,
      checkpointStatus: reviseCkpt,
      modelProfile: `${GENERATOR_MODEL}（诊断改版模式）`,
      temperature: 0.3,
      latencyMs: reviseLatency,
      promptTokens: reviseIn,
      completionTokens: reviseOut,
      inputSummary: reviseInput,
      outputSummary: reviseOutput
    }
  }

  // 6. human_interrupt
  let humanStatus = 'pending'
  let humanBadge = '待挂起'
  let humanCkpt = 'pending · interrupt_before=["sample_or_badcase"]'
  let humanInput = '等待自动评测门禁收敛后挂起线程等待教研员终审'
  let humanOutput = '尚未到达人工断点'

  if (state.stage === 'human-review') {
    if (state.humanDecision === 'pending') {
      humanStatus = 'interrupted'
      humanBadge = state.exhausted ? '轮次耗尽 · 待兜底' : '断点挂起待审'
      humanCkpt = 'INTERRUPTED · state persisted in Checkpointer'
      humanInput = `展示当前题稿 + 二元 Rubric 明细 + 原文切片 P.${last ? last.sourceAnchor.page : firstAnchor.page} 高亮对照`
      humanOutput = '线程安全挂起：未收到教研员明确点击前，绝不自动写入黄金样本库'
    } else {
      humanStatus = 'completed'
      humanBadge = state.humanDecision === 'approved' ? '教研已通过' : '教研已驳回'
      humanCkpt = `resumed_from_checkpoint · decision=${state.humanDecision}`
      humanInput = `教研员对照原文切片 P.${last ? last.sourceAnchor.page : firstAnchor.page} 终审裁决`
      humanOutput =
        state.humanDecision === 'approved'
          ? '人工复核通过，恢复 LangGraph 线程流向黄金样本库入库节点'
          : '人工复核驳回，恢复线程流向假通过台账与 BadCase 归因队列'
    }
  }

  const humanNode = {
    id: 'human_interrupt',
    step: 6,
    label: '人工复核断点',
    role: 'interrupt_before 挂起',
    status: humanStatus,
    executed: humanStatus !== 'pending',
    badge: humanBadge,
    span: {
      spanId: `${threadId}:span-06-human-interrupt`,
      threadId,
      checkpointStatus: humanCkpt,
      modelProfile: 'Human-in-the-Loop 教研复核席',
      temperature: null,
      latencyMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      inputSummary: humanInput,
      outputSummary: humanOutput
    }
  }

  // 7. sample_or_badcase
  let sinkStatus = 'pending'
  let sinkBadge = '待终审分流'
  let sinkCkpt = 'pending · terminal sink'
  let sinkInput = '等待人工复核断点恢复后执行入库或归因记账'
  let sinkOutput = '尚未执行'

  if (state.humanDecision === 'approved') {
    sinkStatus = 'completed'
    sinkBadge = '已入黄金样本库'
    sinkCkpt = 'thread_committed · sample_bank +1'
    sinkInput = `接收人工通过裁决（就绪分 ${last ? last.judgeScore : ''} 分）`
    sinkOutput = `写入黄金样本库，并更新线上复核台账（已复核 ${state.ledger.totalReviewed}/${REVIEW_TARGET}）`
  } else if (state.humanDecision === 'rejected') {
    sinkStatus = 'blocked'
    sinkBadge = '假通过记账 / 归因'
    sinkCkpt = 'thread_committed · false_pass_routed'
    sinkInput = `接收人工驳回裁决（Judge 原判 ${last && last.judgeScore !== null ? `${last.judgeScore} 分` : '未达标'}）`
    sinkOutput = `记入假通过监控池（${state.ledger.falsePassCount}/${FALSE_PASS_TARGET}），转入 BadCase 归因飞轮沉淀回归集`
  }

  const sinkNode = {
    id: 'sample_or_badcase',
    step: 7,
    label: '样本入库 / BadCase 归因',
    role: '终审分流回流',
    status: sinkStatus,
    executed: sinkStatus !== 'pending',
    badge: sinkBadge,
    span: {
      spanId: `${threadId}:span-07-sink`,
      threadId,
      checkpointStatus: sinkCkpt,
      modelProfile: 'SampleBank & BadCase Router',
      temperature: null,
      latencyMs: state.humanDecision === 'pending' ? 0 : 18,
      promptTokens: 0,
      completionTokens: 0,
      inputSummary: sinkInput,
      outputSummary: sinkOutput
    }
  }

  return [retrieveNode, generateNode, ruleNode, judgeNode, reviseNode, humanNode, sinkNode]
}

export function selectedNodeSpan(state) {
  const nodes = langGraphNodes(state)
  const found = nodes.find((node) => node.id === state.selectedNodeId && node.executed)
  return found || nodes.find((node) => node.executed) || nodes[0]
}

export function currentRubricCalibration(state) {
  return (
    RUBRIC_CALIBRATION_VERSIONS.find((item) => item.version === state.rubricVersion) ||
    RUBRIC_CALIBRATION_VERSIONS[0]
  )
}

export function regressionSuiteStats(state) {
  const resolvedSet = new Set(state.resolvedBadCaseIds)
  const byCategory = {}
  for (const item of BAD_CASES) {
    if (!byCategory[item.category]) {
      byCategory[item.category] = { total: 0, resolved: 0 }
    }
    byCategory[item.category].total += 1
    if (resolvedSet.has(item.id)) byCategory[item.category].resolved += 1
  }
  return {
    baseCount: REGRESSION_BASE_COUNT,
    addedCount: resolvedSet.size,
    totalCount: REGRESSION_BASE_COUNT + resolvedSet.size,
    allResolved: resolvedSet.size === BAD_CASES.length,
    byCategory
  }
}

export function reduceDemo(state, action) {
  switch (action.type) {
    case 'selectPreset': {
      const fresh = createDemoState(action.presetId)
      return { ...fresh, activeView: state.activeView }
    }
    case 'switchView': {
      const valid = WORKSPACE_VIEWS.some((item) => item.id === action.view)
      if (!valid || action.view === state.activeView) return state
      return { ...state, activeView: action.view }
    }
    case 'reset': {
      const fresh = createDemoState(state.preset)
      return { ...fresh, activeView: state.activeView }
    }
    case 'runGate':
      return runGate(state)
    case 'focusAnchor':
      return focusAnchor(state, action.page, action.chunkId)
    case 'selectNode': {
      const node = langGraphNodes(state).find((item) => item.id === action.nodeId)
      if (!node || !node.executed || node.id === state.selectedNodeId) return state
      return { ...state, selectedNodeId: node.id }
    }
    case 'humanDecide':
      return humanDecide(state, action.decision)
    case 'recordExtraReview': {
      if (state.humanDecision === 'pending') return state
      return {
        ...state,
        ledger: ledgerOf(state.ledger.totalReviewed + 1, state.ledger.falsePassCount)
      }
    }
    case 'toggleTrace':
      return { ...state, traceOpen: !state.traceOpen }
    case 'selectRubricVersion': {
      const exists = RUBRIC_CALIBRATION_VERSIONS.some((item) => item.version === action.version)
      if (!exists || action.version === state.rubricVersion) return state
      return { ...state, rubricVersion: action.version }
    }
    case 'advanceRubricVersion': {
      const index = RUBRIC_CALIBRATION_VERSIONS.findIndex(
        (item) => item.version === state.rubricVersion
      )
      if (index === -1 || index >= RUBRIC_CALIBRATION_VERSIONS.length - 1) return state
      return { ...state, rubricVersion: RUBRIC_CALIBRATION_VERSIONS[index + 1].version }
    }
    case 'selectBadCase': {
      const exists = BAD_CASES.some((item) => item.id === action.badCaseId)
      if (!exists || action.badCaseId === state.selectedBadCaseId) return state
      return { ...state, selectedBadCaseId: action.badCaseId }
    }
    case 'resolveBadCase': {
      const exists = BAD_CASES.some((item) => item.id === action.badCaseId)
      if (!exists || state.resolvedBadCaseIds.includes(action.badCaseId)) return state
      return {
        ...state,
        selectedBadCaseId: action.badCaseId,
        resolvedBadCaseIds: [...state.resolvedBadCaseIds, action.badCaseId]
      }
    }
    default:
      return state
  }
}

/** 当前预设是否已走到预设脚本定义的终点状态。 */
export function isFinished(state) {
  if (state.stage !== 'human-review') return false
  return state.humanDecision !== 'pending' || state.preset.endDecision === 'pending'
}

/** 左侧三关纵向进度轨。 */
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
      rule.detail = `${last.ruleErrors.length} 条确定性规则违例，0 Judge Token`
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
    const unknownCnt = lastJudge.rubricVerdicts
      ? Object.values(lastJudge.rubricVerdicts).filter((v) => v === 'unknown').length
      : 0
    judge.detail = `${lastJudge.judgeScore} 分 · 阈值 ${QUALITY_THRESHOLD}${
      unknownCnt > 0 ? `（含 ${unknownCnt} 项 unknown）` : ''
    }`
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
      human.detail = '人工通过，已入黄金样本库'
    } else if (state.humanDecision === 'rejected') {
      human.status = 'failed'
      human.detail = '人工驳回，记入假通过 / 归因'
    } else {
      human.detail = state.exhausted ? '改版轮次用尽，等待人工兜底' : '断点挂起，等待人工决策'
    }
  }

  return [rule, judge, human]
}

/** 逐轮评测卡片（含二元 Rubric 逐项判定、证据摘录与改版分差）。 */
export function roundCards(state) {
  let previous = null
  return state.rounds.map((entry) => {
    const delta =
      entry.judgeScore !== null && previous !== null ? entry.judgeScore - previous : null
    if (entry.judgeScore !== null) previous = entry.judgeScore
    return {
      round: entry.round,
      stage: entry.stage,
      passed: entry.passed,
      ruleErrors: entry.ruleErrors,
      judgeScore: entry.judgeScore,
      judgeBreakdown: entry.judgeBreakdown,
      rubricVerdicts: entry.rubricVerdicts,
      rubricNotes: entry.rubricNotes,
      criticalZeroIds: entry.criticalZeroIds || [],
      evidenceQuote: entry.evidenceQuote,
      tokensUsed: entry.tokensUsed,
      revisionDelta: delta
    }
  })
}

export function estimateCost(tokensUsed) {
  return (tokensUsed / 1000) * COST_PER_1K_TOKENS
}

/** 每轮调用成本明细（供底部 Trace 成本折叠表消费）。 */
export function traceRows(state) {
  return state.rounds.map((entry) => ({
    round: entry.round,
    model: entry.trace.model,
    temperature: entry.trace.temperature,
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

/** 走到预设终态所需总点击数（含切换到该预设的首次点击）。 */
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
 * 供 `mirror.test.ts` 校验页面文案与状态机数值零漂移的导出契约。
 */
export function demoContract() {
  return {
    projectName: PROJECT_NAME,
    workbenchName: WORKBENCH_NAME,
    actions: ACTION_NAMES.slice(),
    views: WORKSPACE_VIEWS.map((view) => view.id),
    nodes: LANGGRAPH_NODE_SPECS.map((node) => node.id),
    invariants: INVARIANTS.slice(),
    gates: Object.keys(GATE_LABELS).map((stage) => ({ stage, label: GATE_LABELS[stage] })),
    thresholds: {
      quality: QUALITY_THRESHOLD,
      maxRevisionRounds: MAX_REVISION_ROUNDS,
      reviewedTarget: REVIEW_TARGET,
      falsePassTarget: FALSE_PASS_TARGET,
      calibrationSetSize: CALIBRATION_SET_SIZE,
      iaaThreshold: IAA_THRESHOLD,
      humanAiThreshold: HUMAN_AI_THRESHOLD,
      regressionBaseCount: REGRESSION_BASE_COUNT,
      rubric: { ...RUBRIC_WEIGHTS }
    },
    binaryRubrics: BINARY_RUBRIC_ITEMS.map((item) => ({
      id: item.id,
      dimensionId: item.dimensionId,
      weight: item.weight,
      critical: item.critical
    })),
    calibrationVersions: RUBRIC_CALIBRATION_VERSIONS.map((ver) => ({
      version: ver.version,
      unknownRate: ver.unknownRate,
      iaaRate: ver.iaaRate,
      humanAiRate: ver.humanAiRate,
      gateReady: ver.gateReady
    })),
    badCases: BAD_CASES.map((bc) => ({ id: bc.id, category: bc.category })),
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

const THEME_KEY = 'english-demo-theme'

function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
    const siteTheme = localStorage.getItem('theme')
    if (siteTheme === 'light' || siteTheme === 'dark') return siteTheme
  } catch (_) {
    /* 隐私模式下回退系统偏好 */
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(next) {
  document.documentElement.setAttribute('data-theme', next)
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch (_) {
    /* 忽略存储受限 */
  }
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const TYPE_LABELS = { cloze: '完形填空', reading: '阅读理解', mcq: '单项选择' }
const STATUS_TEXT = { pending: '待运行', passed: '通过', failed: '未通过' }
const DECISION_TEXT = { pending: '待人工决策', approved: '人工通过', rejected: '人工驳回' }
const NODE_STATUS_LABELS = {
  completed: '已完成',
  blocked: '硬拦/驳回',
  'short-circuited': '前置短路',
  failed: '未达标',
  interrupted: '断点挂起',
  skipped: '条件跳过',
  pending: '待执行'
}
const VERDICT_LABELS = {
  1: '1 · 通过',
  0: '0 · 违例',
  unknown: 'unknown'
}

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
  if (uiState.activeAnchor) return uiState.activeAnchor
  const first = uiState.preset.rounds[0]
  return first ? first.sourceAnchor : null
}

function highlightedAnchor() {
  return uiState.activeAnchor
}

/* ── 顶层三模式工作区切换条 ── */
function renderViewTabs() {
  const bar = document.getElementById('view-tabs')
  const cal = currentRubricCalibration(uiState)
  const reg = regressionSuiteStats(uiState)

  const pillMap = {
    pipeline: {
      text: uiState.inSampleBank
        ? '已入样本库 ✓'
        : uiState.humanDecision === 'rejected'
          ? '人工已驳回'
          : uiState.stage === 'human-review'
            ? '断点待复核'
            : `第 ${uiState.rounds.length} 轮`,
      tone: uiState.inSampleBank ? 'ok' : uiState.stage === 'human-review' ? 'warn' : ''
    },
    calibration: {
      text: `R3 · ${cal.version} ${cal.gateReady ? '达标 ✓' : '校准中'}`,
      tone: cal.gateReady ? 'ok' : 'warn'
    },
    flywheel: {
      text: `回归集 ${reg.totalCount} 条${reg.addedCount > 0 ? ` (+${reg.addedCount})` : ''}`,
      tone: reg.addedCount > 0 ? 'ok' : ''
    }
  }

  bar.innerHTML = WORKSPACE_VIEWS.map((view) => {
    const selected = uiState.activeView === view.id
    const pill = pillMap[view.id] || { text: '', tone: '' }
    return `<button class="mode-tab" role="tab" data-act="view" data-view="${esc(
      view.id
    )}" aria-selected="${selected}">
      <span class="mode-tab-top">
        <span class="mode-tab-title">${esc(view.shortLabel)}</span>
        <span class="mode-pill ${pill.tone}">${esc(pill.text)}</span>
      </span>
      <span class="mode-tab-sub">${esc(view.label)} · ${esc(view.summary)}</span>
    </button>`
  }).join('')

  for (const view of WORKSPACE_VIEWS) {
    const panel = document.getElementById(`view-${view.id}`)
    if (panel) panel.hidden = uiState.activeView !== view.id
  }
}

/* ── 预设体验剧本与题型标签 ── */
function renderPresets() {
  const tabs = document.getElementById('preset-tabs')
  const contract = demoContract()
  tabs.innerHTML = PRESET_IDS.map((id) => {
    const preset = demoPreset(id)
    const summary = contract.presets.find((item) => item.id === id)
    const goal = preset.endDecision === 'pending' ? '停在人工复核断点' : '走到高分假通过驳回'
    return `<button class="scenario" data-act="preset" data-preset="${esc(id)}" aria-pressed="${
      uiState.preset.id === id
    }">
      <span class="scenario-title">${esc(preset.label)}</span>
      <small class="scenario-meta">${summary ? summary.clicksToEnd : ''} 次点击到终态 · ${esc(
        goal
      )}</small>
    </button>`
  }).join('')

  const types = document.getElementById('type-tabs')
  types.innerHTML = PRESET_IDS.map((id) => {
    const preset = demoPreset(id)
    const selected = uiState.preset.id === id
    return `<button class="tab" role="tab" data-act="preset" data-preset="${esc(
      id
    )}" aria-selected="${selected}">${esc(TYPE_LABELS[preset.questionType])}</button>`
  }).join('')
}

/* ── Pillar A: LangGraph 7 节点流水线与 Span 载荷检查器 ── */
function renderLangGraph() {
  const nodes = langGraphNodes(uiState)
  const active = selectedNodeSpan(uiState)

  document.getElementById('lg-thread-label').textContent =
    `thread_id=${uiState.preset.threadId} · 点击任意已执行节点检视 Span 载荷`

  document.getElementById('langgraph-nodes').innerHTML = nodes
    .map((node) => {
      const selected = node.id === active.id
      return `<button class="lg-node" role="option" data-act="node" data-node="${esc(
        node.id
      )}" data-status="${esc(node.status)}" aria-selected="${selected}" ${
        node.executed ? '' : 'disabled title="该节点尚未执行"'
      }>
        <span class="lg-node-head">
          <span class="lg-step">0${node.step}</span>
          <span class="lg-status">${esc(NODE_STATUS_LABELS[node.status] || node.status)}</span>
        </span>
        <span class="lg-code">${esc(node.id)}</span>
        <span class="lg-label">${esc(node.label)}</span>
        <span class="lg-badge">${esc(node.badge)}</span>
      </button>`
    })
    .join('')

  const s = active.span
  const tempDisplay = s.temperature === null ? 'N/A（非采样节点）' : `${s.temperature.toFixed(1)}`
  const tokenDisplay = `${s.promptTokens} in / ${s.completionTokens} out`

  document.getElementById('span-inspector').innerHTML = `
    <div class="span-kv">
      <div class="kv-item"><span class="k">节点 Span ID</span><span class="v">${esc(s.spanId)}</span></div>
      <div class="kv-item"><span class="k">Checkpoint 状态</span><span class="v">${esc(s.checkpointStatus)}</span></div>
      <div class="kv-item"><span class="k">模型 / 执行器</span><span class="v">${esc(s.modelProfile)}</span></div>
      <div class="kv-item"><span class="k">Temperature</span><span class="v">${esc(tempDisplay)}</span></div>
      <div class="kv-item"><span class="k">耗时 Latency</span><span class="v">${s.latencyMs} ms</span></div>
      <div class="kv-item"><span class="k">Prompt / Completion Tokens</span><span class="v">${esc(tokenDisplay)}</span></div>
    </div>
    <div class="span-io">
      <div class="io-card"><b>Node Input</b>${esc(s.inputSummary)}</div>
      <div class="io-card"><b>Node Output</b>${esc(s.outputSummary)}</div>
    </div>`
}

/* ── 三关进度轨 ── */
function renderRail() {
  const rail = document.getElementById('gate-rail')
  const steps = gateRail(uiState)
  const verdict = uiState.inSampleBank
    ? '本题已入黄金样本库：唯有人工确认通过方可入库。'
    : uiState.humanDecision === 'rejected'
      ? '本题被人工驳回：高分题驳回自动记入假通过监控池，可转入 BadCase 归因。'
      : uiState.exhausted
        ? '自动改版轮次已用尽，停在人工兜底，不再盲目消耗 Token。'
        : uiState.stage === 'human-review'
          ? 'LangGraph 已在 human_interrupt 挂起：就绪分只作筛子，终审权归教研员。'
          : '确定性硬规则先短路结构错误（0 Judge Token），二元 Rubric 后做教学评审。'

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

/* ── 审题面板与当轮二元 Rubric 明细 ── */
function renderQuestion() {
  const pane = document.getElementById('question-pane')
  const preset = uiState.preset
  const anchor = currentAnchor()
  const last = uiState.rounds[uiState.rounds.length - 1]
  const stem = last ? last.draftStem : preset.stem
  const options = last && last.draftOptions ? last.draftOptions : preset.options

  let liveEvaluation = ''
  if (last) {
    if (last.stage === 'schema-rule') {
      liveEvaluation = last.passed
        ? `<div class="live-rubric-box">
            <div class="live-rubric-head">
              <span>第 ${last.round} 轮 · 服务端确定性硬规则通过</span>
              <span class="verdict-pill v-1">0 Judge Token</span>
            </div>
            <p class="empty-note">跨字段结构校验全部通过，尚未调用 Judge（judgeScore = null）。请继续运行下一关二元 Rubric 评审。</p>
          </div>`
        : `<div class="live-rubric-box">
            <div class="live-rubric-head">
              <span>第 ${last.round} 轮 · 服务端硬规则前置短路</span>
              <span class="verdict-pill v-0">0 Judge Token · judgeScore=null</span>
            </div>
            <ul class="rule-errors">${last.ruleErrors
              .map((err) => `<li>${esc(err)}</li>`)
              .join('')}</ul>
            <p class="empty-note">未触发任何 Judge 模型调用；题稿已携带确定性报错进入 revise_draft 修复。</p>
          </div>`
    } else if (last.rubricVerdicts) {
      liveEvaluation = `<div class="live-rubric-box">
        <div class="live-rubric-head">
          <span>第 ${last.round} 轮 · 二元 Rubric 逐项判定（4 维度 × 6 原子项）</span>
          <span class="verdict-pill ${last.passed ? 'v-1' : 'v-0'}">就绪分 ${last.judgeScore} / 100</span>
        </div>
        <p class="evidence-line">
          <b>Evidence-First 原文引证</b>（<code>${esc(
            last.sourceAnchor.chunkId
          )}</code>）："${esc(last.evidenceQuote || '')}"
        </p>
        <div class="rubric-list">
          ${BINARY_RUBRIC_ITEMS.map((item) => {
            const v = last.rubricVerdicts[item.id]
            const note = last.rubricNotes ? last.rubricNotes[item.id] : ''
            return `<div class="rubric-row">
              <span class="rubric-id">${esc(item.id)}</span>
              <span class="rubric-main">
                <b>${esc(item.title)}</b>${
                  item.critical ? ' <span class="crit-tag">关键项</span>' : ''
                }
                <small>${esc(item.dimensionTitle)}（权重 ${item.weight}）· ${esc(note)}</small>
              </span>
              <span class="verdict-pill v-${esc(v)}">${esc(VERDICT_LABELS[v] || v)}</span>
            </div>`
          }).join('')}
        </div>
      </div>`
    }
  }

  pane.innerHTML = `
    <div class="q-meta">
      <span class="chip">${esc(TYPE_LABELS[preset.questionType])}</span>
      <span class="chip">${esc(preset.title)}</span>
      <span class="chip">当前稿：第 ${last ? last.round : 0} 轮${last ? '' : '（初稿待检）'}</span>
    </div>
    <p class="stem">${esc(stem)}</p>
    <div class="options">
      ${options
        .map(
          (option) => `<div class="opt${option.key === preset.answer ? ' correct' : ''}">
            <span class="k">${esc(option.key)}</span>
            <span>${esc(option.text)}${
              option.key === preset.answer ? '<span class="badge">标准答案</span>' : ''
            }</span>
          </div>`
        )
        .join('')}
    </div>
    <p class="answer">答案：<b>${esc(preset.answer)}</b></p>
    <p class="explain">解析：${esc(preset.explanation)}</p>
    <div class="source">
      <span>教材原文锚点：</span>
      ${
        anchor
          ? `<button class="anchor" data-act="anchor" data-page="${anchor.page}" data-chunk="${esc(
              anchor.chunkId
            )}">${esc(anchorLabel(preset, anchor))}</button>`
          : ''
      }
      <span>${anchor ? esc(anchor.excerpt) : ''}</span>
    </div>
    ${liveEvaluation}`
}

function renderActions() {
  const bar = document.getElementById('action-bar')
  const last = uiState.rounds[uiState.rounds.length - 1]
  const score = last ? last.judgeScore : null
  const canApprove =
    last &&
    last.passed &&
    score !== null &&
    score >= QUALITY_THRESHOLD &&
    (!last.criticalZeroIds || last.criticalZeroIds.length === 0)

  if (uiState.stage !== 'human-review') {
    const label =
      uiState.stage === 'schema-rule'
        ? `运行第 ${nextRoundNumber()} 轮规则校验`
        : `运行第 ${nextRoundNumber()} 轮二元 Judge 评审`
    const note =
      uiState.stage === 'schema-rule'
        ? '跨字段确定性硬规则前置运行：不通过即短路，0 Judge Token。'
        : 'Judge 采用跨模型 temp=0.0 二元判定；低于 70 分或关键项为 0 自动回炉改版（上限 3 轮）。'
    bar.innerHTML = `<button class="btn btn-primary" data-act="run">${esc(label)}</button>
      <span class="note">${esc(note)}</span>`
    return
  }

  if (uiState.humanDecision !== 'pending') {
    bar.innerHTML = `<span class="note">${esc(DECISION_TEXT[uiState.humanDecision])}：${
      uiState.inSampleBank ? '已写入黄金样本库。' : '未入样本库；若属高分误放行已记入假通过池。'
    }</span>
      <button class="btn btn-sm" data-act="view" data-view="flywheel">去 BadCase 归因飞轮 →</button>
      <button class="btn btn-sm" data-act="reset">重置本预设</button>`
    return
  }

  bar.innerHTML = `
    <button class="btn btn-ok" data-act="approve" ${canApprove ? '' : 'disabled'}>通过入样本库</button>
    <button class="btn btn-danger" data-act="reject">驳回（记假通过 / 归因）</button>
    <span class="note">${
      canApprove
        ? '人工通过才可入样本库；人工驳回这道高分题会将其计入假通过（False Pass）监控台账。'
        : '本轮未达门禁要求，禁止入样本库，仅可执行人工驳回。'
    }</span>`
}

/* ── 教材原文结构化切块 ── */
function renderTextbook() {
  const box = document.getElementById('textbook-scroll')
  const preset = uiState.preset
  const anchor = highlightedAnchor()
  const pages = []
  for (const chunk of preset.chunks) {
    const found = pages.find((item) => item.page === chunk.page)
    if (found) found.chunks.push(chunk)
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
            }" data-chunk="${esc(chunk.chunkId)}"${active ? ' aria-current="true"' : ''}>
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
    log.innerHTML = `<p class="empty-note">尚未运行任何轮次。点击审题面板下方「运行第 1 轮规则校验」推进流水线。</p>`
    return
  }

  log.innerHTML = cards
    .map((card) => {
      const verdict = card.passed ? 'passed' : 'failed'
      const tag =
        card.stage === 'schema-rule'
          ? card.passed
            ? '规则通过 · 0 Token'
            : '规则短路 · 0 Token'
          : card.passed
            ? '二元 Judge 达标'
            : '二元 Judge 未达标'
      const errors = card.ruleErrors.length
        ? `<ul class="rule-errors">${card.ruleErrors
            .map((item) => `<li>${esc(item)}</li>`)
            .join('')}</ul>`
        : ''
      const score =
        card.judgeScore === null
          ? `<div class="score-line"><span class="score none">未调模型（judgeScore = null）</span><span class="delta">${
              card.passed ? '硬规则放行，待二元评审' : '硬规则直接拒收，省下 Judge Token'
            }</span></div>`
          : `<div class="score-line">
              <span class="score ${card.passed ? 'pass' : 'fail'}">${card.judgeScore}</span>
              <span class="delta ${card.revisionDelta && card.revisionDelta > 0 ? 'up' : ''}">${
                card.revisionDelta === null
                  ? '首轮二元就绪分'
                  : card.revisionDelta > 0
                    ? `改版增量 +${card.revisionDelta} 分`
                    : `改版增量 ${card.revisionDelta} 分`
              }</span>
            </div>`

      const miniRubrics = card.rubricVerdicts
        ? `<div class="mini-rubrics">${BINARY_RUBRIC_ITEMS.map((item) => {
            const v = card.rubricVerdicts[item.id]
            return `<span class="mini-r v-${esc(v)}" title="${esc(item.title)}">${esc(
              item.id
            )}:${esc(v)}</span>`
          }).join('')}</div>`
        : ''

      return `<article class="round-card" data-verdict="${verdict}">
        <header><b>第 ${card.round} 轮</b><span class="tag">${esc(tag)}</span></header>
        ${errors}
        ${score}
        ${miniRubrics}
        <div class="round-foot">
          <span>tokens ${card.tokensUsed}</span>
          <span>${esc(GATE_LABELS[card.stage])}</span>
          <span>${esc(STATUS_TEXT[card.passed ? 'passed' : 'failed'])}</span>
        </div>
      </article>`
    })
    .join('')
}

/* ── 假通过冷启动校准台账 ── */
function renderCalibration() {
  const box = document.getElementById('calibration')
  const ledger = uiState.ledger
  const reviewedPct = Math.min(100, (ledger.totalReviewed / REVIEW_TARGET) * 100)
  const falsePct = Math.min(100, (ledger.falsePassCount / FALSE_PASS_TARGET) * 100)
  const canAppendSample = uiState.humanDecision !== 'pending' && !ledger.thresholdMet

  box.innerHTML = `
    <div class="calib-line">
      <span class="num">${ledger.totalReviewed}</span>
      <span class="lbl">/ ${REVIEW_TARGET} 已复核</span>
      <span class="sep">|</span>
      <span class="num false">${ledger.falsePassCount}</span>
      <span class="lbl">/ ${FALSE_PASS_TARGET} 假通过</span>
    </div>
    <div class="meter">
      <div class="meter-head"><span>累计人工复核样本</span><span>${ledger.totalReviewed} / ${REVIEW_TARGET}</span></div>
      <div class="bar"><i style="width:${reviewedPct}%"></i></div>
    </div>
    <div class="meter false">
      <div class="meter-head"><span>Judge 高分放行但被人工驳回（False Pass）</span><span>${ledger.falsePassCount} / ${FALSE_PASS_TARGET}</span></div>
      <div class="bar"><i style="width:${falsePct}%"></i></div>
    </div>
    <div class="calib-state" data-active="${ledger.thresholdMet}">
      ${
        ledger.thresholdMet
          ? '双门槛同时满足（thresholdMet: true）：已触发 Rubric 判据复盘与对齐校准流程！'
          : `冷启动保护生效中（thresholdMet: false）：须累计满 ${REVIEW_TARGET} 条人工标注且至少含 ${FALSE_PASS_TARGET} 条假通过，防止凭个别样本盲目改坏线上判据。`
      }
    </div>
    <div class="calib-actions">
      ${
        canAppendSample
          ? `<button class="btn btn-sm" data-act="extra-review">+ 追加 1 条复核样本（验证 20/5 触发点）</button>`
          : ''
      }
      <button class="btn btn-sm" data-act="view" data-view="calibration">进入 Rubric 二元校准迭代台 →</button>
    </div>`
}

/* ── Trace 成本折叠表 ── */
function renderTrace() {
  const panel = document.getElementById('trace-panel')
  const rows = traceRows(uiState)
  const totalTokens = rows.reduce((sum, row) => sum + row.tokensIn + row.tokensOut, 0)
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0)

  const head = `<button class="trace-toggle" data-act="trace" aria-expanded="${
    uiState.traceOpen
  }"><span class="caret">▸</span><span>Trace 成本</span><span class="sum">${totalTokens} Judge tokens · ${money(
    totalCost
  )}</span></button>`

  if (!uiState.traceOpen) {
    panel.innerHTML = head
    return
  }

  const body = rows.length
    ? `<table class="trace-table">
        <thead><tr><th>轮次</th><th>执行器 / 模型</th><th>Temp</th><th>输入</th><th>输出</th><th>耗时</th><th>成本</th></tr></thead>
        <tbody>${rows
          .map(
            (row) => `<tr>
              <td>第 ${row.round} 轮</td>
              <td>${esc(row.model)}</td>
              <td class="num">${row.temperature === null ? '—' : row.temperature.toFixed(1)}</td>
              <td class="num">${row.tokensIn}</td>
              <td class="num">${row.tokensOut}</td>
              <td class="num">${row.latencyMs} ms</td>
              <td class="num">${money(row.cost)}</td>
            </tr>`
          )
          .join('')}</tbody>
        <tfoot><tr><td colspan="3">合计</td><td class="num">${rows.reduce(
          (sum, row) => sum + row.tokensIn,
          0
        )}</td><td class="num">${rows.reduce(
          (sum, row) => sum + row.tokensOut,
          0
        )}</td><td class="num">—</td><td class="num">${money(totalCost)}</td></tr></tfoot>
      </table>`
    : `<p class="empty-note" style="padding:10px 14px">尚未产生门禁调用记录。</p>`

  panel.innerHTML = `${head}<div class="trace-body">${body}</div>`
}

/* ── View 2: Pillar C/D/E 指标下钻拆解 + unknown 反查与 85%/90% 校准台 ── */
function renderCalibrationBenchView() {
  const drill = document.getElementById('rubric-drilldown')
  drill.innerHTML = `
    <p class="explain" style="margin-bottom:12px">
      传统「请给这道英语题打 1–5 分」会让模型与教研员同时陷入主观尺度漂移（3 分与 4 分毫无客观边界）。工作台将「题出得好不好」下钻拆解为
      <b>4 大教学维度 × 6 项原子二元 Rubric</b>，每项仅允许输出
      <span class="verdict-pill v-1">1 · 是/通过</span>
      <span class="verdict-pill v-0">0 · 否/违例</span>
      <span class="verdict-pill v-unknown">unknown · 证据不足或定义含糊</span>。
    </p>
    <div class="drill-grid">
      ${BINARY_RUBRIC_DIMENSIONS.map((dim) => {
        const items = BINARY_RUBRIC_ITEMS.filter((item) => item.dimensionId === dim.id)
        return `<article class="dim-card">
          <div class="dim-head">
            <b>维度 ${dim.order} · ${esc(dim.title)}</b>
            <span class="chip">维度权重 ${dim.totalWeight} 分</span>
          </div>
          ${items
            .map(
              (item) => `<div class="dim-item">
                <div class="dim-item-top">
                  <span class="mono">${esc(item.id)}</span>
                  <span>${esc(item.title)}</span>
                  <span class="chip">${item.weight} 分</span>
                  ${item.critical ? '<span class="crit-tag">关键一票否决</span>' : ''}
                </div>
                <p>${esc(item.criteria)}</p>
              </div>`
            )
            .join('')}
        </article>`
      }).join('')}
    </div>`

  const bench = document.getElementById('rubric-bench')
  const cur = currentRubricCalibration(uiState)
  const iaaOk = cur.iaaRate >= IAA_THRESHOLD
  const haiOk = cur.humanAiRate >= HUMAN_AI_THRESHOLD
  const unkClass =
    cur.unknownRate <= UNKNOWN_TARGET_MAX ? 'ok' : cur.unknownRate <= 12 ? 'warn' : 'bad'

  bench.innerHTML = `
    <div class="ver-bar">
      <div class="ver-tabs" role="tablist" aria-label="Rubric 迭代版本切换">
        ${RUBRIC_CALIBRATION_VERSIONS.map((ver) => {
          const selected = ver.version === cur.version
          return `<button class="ver-btn" role="tab" data-act="rubric-ver" data-version="${esc(
            ver.version
          )}" aria-selected="${selected}">${esc(ver.title)}</button>`
        }).join('')}
      </div>
      <div>
        ${
          cur.nextActionLabel
            ? `<button class="btn btn-primary" data-act="rubric-next">${esc(
                cur.nextActionLabel
              )} →</button>`
            : `<button class="btn" data-act="rubric-ver" data-version="v1">已定稿上线 ✓ 回到 v1 重新推演</button>`
        }
      </div>
    </div>

    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-top">
          <span>Judge unknown 占比（定义含糊度探针）</span>
          <span class="mode-pill ${unkClass === 'ok' ? 'ok' : 'warn'}">${cur.unknownCount} / ${
            cur.sampleSize
          } 题</span>
        </div>
        <div class="kpi-val ${unkClass}">${cur.unknownRate.toFixed(1)}%</div>
        <div class="meter ${unkClass === 'ok' ? 'ok' : 'warn'}">
          <div class="bar"><i style="width:${Math.min(100, cur.unknownRate * 3)}%"></i></div>
        </div>
        <div class="kpi-sub">收敛目标 ≤ ${UNKNOWN_TARGET_MAX}.0% · unknown 高优先反查定义歧义而非怪模型</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-top">
          <span>人人一致率（双教研盲评 IAA）</span>
          <span class="mode-pill ${iaaOk ? 'ok' : 'warn'}">${
            iaaOk ? `≥ ${IAA_THRESHOLD}% 达标 ✓` : `未达 ${IAA_THRESHOLD}% 阈值`
          }</span>
        </div>
        <div class="kpi-val ${iaaOk ? 'ok' : 'bad'}">${cur.iaaRate.toFixed(1)}%</div>
        <div class="meter ${iaaOk ? 'ok' : 'false'}">
          <div class="bar"><i style="width:${cur.iaaRate}%"></i></div>
        </div>
        <div class="kpi-sub">一致题数 ${cur.iaaMatchCount} / ${cur.sampleSize} · 人与人都对不齐时禁止自动化评审</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-top">
          <span>人机一致率（Judge vs 教研共识）</span>
          <span class="mode-pill ${haiOk ? 'ok' : 'warn'}">${
            haiOk ? `≥ ${HUMAN_AI_THRESHOLD}% 达标 ✓` : `未达 ${HUMAN_AI_THRESHOLD}% 阈值`
          }</span>
        </div>
        <div class="kpi-val ${haiOk ? 'ok' : 'warn'}">${cur.humanAiRate.toFixed(1)}%</div>
        <div class="meter ${haiOk ? 'ok' : 'warn'}">
          <div class="bar"><i style="width:${cur.humanAiRate}%"></i></div>
        </div>
        <div class="kpi-sub">一致题数 ${cur.humanAiMatchCount} / ${
          cur.sampleSize
        } · Cohen's κ = ${cur.cohenKappa.toFixed(2)}</div>
      </div>
    </div>

    <div class="prompt-diff-grid">
      <div class="box-card">
        <h3>当前版本（${esc(cur.version)}）R3 二元判据原文</h3>
        <blockquote>${esc(cur.promptDefinition)}</blockquote>
        <p><b>本版关键演进：</b>${esc(cur.changeHighlight)}</p>
      </div>
      <div class="box-card">
        <h3>40 题校准集典型分歧样本回放</h3>
        <p style="margin-bottom:10px">${esc(cur.disagreementCase)}</p>
        <div class="calib-state" data-active="${cur.gateReady}">
          <b>${esc(cur.statusBadge)}：</b>${esc(cur.diagnosis)}
        </div>
      </div>
    </div>

    <div class="trace-body" style="border:1px solid var(--border-soft);border-radius:var(--r-m)">
      <table class="trace-table">
        <thead>
          <tr>
            <th>校准版本</th>
            <th>unknown 占比</th>
            <th>人人一致率（阈值 ≥85%）</th>
            <th>人机一致率（阈值 ≥90%）</th>
            <th>Cohen's κ</th>
            <th>门禁准入状态</th>
          </tr>
        </thead>
        <tbody>
          ${RUBRIC_CALIBRATION_VERSIONS.map((ver) => {
            const activeStyle =
              ver.version === cur.version ? ' style="background:var(--accent-soft)"' : ''
            return `<tr${activeStyle}>
              <td><b>${esc(ver.title)}</b></td>
              <td class="num">${ver.unknownRate.toFixed(1)}% (${ver.unknownCount}/40)</td>
              <td class="num">${ver.iaaRate.toFixed(1)}% ${ver.iaaRate >= IAA_THRESHOLD ? '✓' : '✗'}</td>
              <td class="num">${ver.humanAiRate.toFixed(1)}% ${
                ver.humanAiRate >= HUMAN_AI_THRESHOLD ? '✓' : '✗'
              }</td>
              <td class="num">${ver.cohenKappa.toFixed(2)}</td>
              <td>${esc(ver.statusBadge)}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>`
}

/* ── View 3: Pillar B & F Judge 配置与 Bad Case 归因飞轮 ── */
function renderFlywheelView() {
  const specsBox = document.getElementById('judge-specs')
  specsBox.innerHTML = `
    <div class="spec-layout">
      <div class="spec-cards">
        ${JUDGE_ENGINEERING_SPECS.map(
          (spec) => `<article class="spec-card">
            <span class="spec-badge">${esc(spec.badge)}</span>
            <h3>${esc(spec.title)}</h3>
            <p>${esc(spec.summary)}</p>
            <code>${esc(spec.configLine)}</code>
          </article>`
        ).join('')}
      </div>
      <div>
        <div style="font-size:12px;font-weight:650;margin-bottom:6px;color:var(--muted)">
          Evidence-First 结构化输出契约（先对齐原文证据，后输出 1/0/unknown）
        </div>
        <pre class="schema-pre"><code>${esc(JUDGE_SCHEMA_SNIPPET)}</code></pre>
      </div>
    </div>`

  const fwBox = document.getElementById('badcase-flywheel')
  const stats = regressionSuiteStats(uiState)
  const resolvedSet = new Set(uiState.resolvedBadCaseIds)
  const current = BAD_CASES.find((item) => item.id === uiState.selectedBadCaseId) || BAD_CASES[0]
  const isResolved = resolvedSet.has(current.id)

  fwBox.innerHTML = `
    <div class="reg-banner">
      <div class="reg-count">
        <span>黄金回归集样本总量：</span>
        <span class="big">${stats.totalCount}</span>
        <span class="chip">基线 ${stats.baseCount} 条 + 本次归因回流 ${stats.addedCount} 条</span>
      </div>
      <div class="reg-cats">
        ${Object.keys(stats.byCategory)
          .map((cat) => {
            const c = stats.byCategory[cat]
            return `<span class="chip">${esc(cat)}：${c.resolved}/${c.total} 已回流</span>`
          })
          .join('')}
      </div>
    </div>

    <div class="bc-grid">
      <div class="bc-list" role="listbox" aria-label="典型 Bad Case 列表">
        ${BAD_CASES.map((bc) => {
          const selected = bc.id === current.id
          const done = resolvedSet.has(bc.id)
          return `<button class="bc-item" role="option" data-act="badcase" data-badcase="${esc(
            bc.id
          )}" aria-selected="${selected}">
            <span class="bc-item-top">
              <span class="bc-id">${esc(bc.id)} · ${esc(bc.category)}</span>
              <span class="mode-pill ${done ? 'ok' : ''}">${done ? '已回流回归集 ✓' : '待归因回流'}</span>
            </span>
            <b style="font-size:12.5px">${esc(bc.title)}</b>
            <span style="font-size:11px;color:var(--faint)">暴露节点：${esc(bc.stage)}</span>
          </button>`
        }).join('')}
      </div>

      <article class="bc-detail" aria-live="polite">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <span class="spec-badge">${esc(current.id)} · 根因分类：${esc(current.category)}</span>
          <code style="font-size:11px;color:var(--faint)">tag: ${esc(current.regressionTag)}</code>
        </div>
        <h3>${esc(current.title)}</h3>
        <div class="bc-field"><b>故障现场：</b>${esc(current.symptom)}</div>
        <div class="bc-field"><b>根因剖析：</b>${esc(current.rootCause)}</div>
        <div class="bc-field"><b>工程修复动作：</b>${esc(current.fixAction)}</div>
        <div class="bc-field"><b>量化闭环收益：</b>${esc(current.impactMetric)}</div>
        <div style="margin-top:4px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button class="btn ${isResolved ? '' : 'btn-primary'}" data-act="resolve-badcase" data-badcase="${esc(
            current.id
          )}" ${isResolved ? 'disabled' : ''}>
            ${isResolved ? '✓ 已归因并沉淀至黄金回归集' : '归因并回流回归集（黄金样本 +1）'}
          </button>
          <span style="font-size:11.5px;color:var(--faint)">每次改规则、改切块或改 Rubric 后自动跑全量回归集防退化</span>
        </div>
      </article>
    </div>`
}

/* ── 底部核心不变量 ── */
function renderInvariants() {
  const foot = document.getElementById('invariants')
  foot.innerHTML = `<b>${esc(WORKBENCH_NAME)} · 状态机锁死的六条工程不变量</b>
    <ul>${INVARIANTS.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
    <p style="margin:8px 0 0">本页为纯前端零后端确定性状态机回放：刷新或点「重置当前演示」即回到初始状态，不发起任何外部请求。教材原文与题目为教研评测闭环合成样例。</p>`
}

function renderAll() {
  document
    .getElementById('theme-toggle')
    .setAttribute('title', `切换到${uiTheme === 'dark' ? '浅色' : '深色'}主题`)
  renderViewTabs()
  renderPresets()
  renderLangGraph()
  renderRail()
  renderQuestion()
  renderActions()
  renderTextbook()
  renderLog()
  renderCalibration()
  renderTrace()
  renderCalibrationBenchView()
  renderFlywheelView()
  renderInvariants()

  if (uiState.activeView === 'pipeline' && uiState.focusTick !== paintedFocusTick) {
    paintedFocusTick = uiState.focusTick
    scrollToActiveChunk()
  }
}

function scrollToActiveChunk() {
  const box = document.getElementById('textbook-scroll')
  const chunk = box ? box.querySelector('.chunk.is-active') : null
  if (!box || !chunk) return
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
    case 'view':
      dispatch({ type: 'switchView', view: target.dataset.view })
      break
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
    case 'extra-review':
      dispatch({ type: 'recordExtraReview' })
      break
    case 'anchor':
      dispatch({
        type: 'focusAnchor',
        page: Number(target.dataset.page),
        chunkId: target.dataset.chunk
      })
      break
    case 'node':
      dispatch({ type: 'selectNode', nodeId: target.dataset.node })
      break
    case 'trace':
      dispatch({ type: 'toggleTrace' })
      break
    case 'rubric-ver':
      dispatch({ type: 'selectRubricVersion', version: target.dataset.version })
      break
    case 'rubric-next':
      dispatch({ type: 'advanceRubricVersion' })
      break
    case 'badcase':
      dispatch({ type: 'selectBadCase', badCaseId: target.dataset.badcase })
      break
    case 'resolve-badcase':
      dispatch({ type: 'resolveBadCase', badCaseId: target.dataset.badcase })
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
