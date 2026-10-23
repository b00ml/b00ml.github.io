<script setup>
import { computed, ref } from 'vue'

import { agentTools } from '../demo/agent'

const props = defineProps({ result: Object, reviews: { type: Array, default: () => [] } })
defineEmits(['review'])
const step = ref(0)
const steps = ['发现疑问', '查证经过', '核验证据', '交给人工']
const investigation = computed(() => props.result?.aiReview?.investigation)
const story = computed(() => investigation.value?.story)
const json = (value) => JSON.stringify(value, null, 2)
const verdicts = { APPROVE: '倾向通过', REJECT: '建议驳回', FLAG: '保留存疑' }
</script>

<template>
  <section class="agent-workflow" aria-label="M2 Agent 查证过程">
    <template v-if="investigation">
      <header class="story-heading">
        <span class="story-kicker">跟着一张单据看 · 四步预设演示</span>
        <h2>{{ story.title }}</h2>
        <p>{{ story.question }}</p>
        <small>虚拟数据与预设查证结果；未调用真实模型或 ERP。</small>
      </header>

      <ol class="story-steps" aria-label="查证步骤">
        <li v-for="(label, i) in steps" :key="label">
          <button
            :class="{ current: step === i }"
            :aria-current="step === i ? 'step' : undefined"
            @click="step = i"
          >
            <span class="step-number">{{ i + 1 }}</span
            ><span>{{ label }}</span>
          </button>
        </li>
      </ol>

      <div class="story-layout">
        <section class="glass-card story-panel" aria-live="polite" :aria-label="steps[step]">
          <template v-if="step === 0">
            <h3>1. 这张单据卡在哪里？</h3>
            <div class="opinion-grid">
              <div class="opinion">
                <span class="card-label">规则初审</span>
                <strong>保留存疑</strong>
                <p>{{ result.reasons[0] }}</p>
              </div>
              <div class="opinion">
                <span class="card-label">AI 初审</span>
                <strong>{{ verdicts[result.aiReview.result] }}</strong>
                <p>{{ result.aiReview.reasons[0].replace('【预设 AI 意见】', '') }}</p>
              </div>
            </div>
            <p class="step-takeaway">
              {{
                result.aiReview.agreeWithRules
                  ? '关键证据不全。Agent 继续查审批和制度，把需要人工补证的事项说清楚。'
                  : '意见不同，系统保留存疑，并让 Agent 继续查证；金额小也需要有合规依据。'
              }}
            </p>
          </template>

          <template v-else-if="step === 1">
            <h3>2. Agent 查了什么，查到了什么？</h3>
            <ol class="lookup-list">
              <li v-for="(call, i) in investigation.transcript" :key="call.call_id">
                <span class="lookup-number">{{ i + 1 }}</span>
                <div>
                  <h4>{{ call.label }}</h4>
                  <p>{{ call.finding }}</p>
                </div>
              </li>
            </ol>
            <p class="step-takeaway">
              Agent 读取已有资料，补充核查依据。仍然找不到的信息，会明确留给人工确认。
            </p>
          </template>

          <template v-else-if="step === 2">
            <h3>3. 哪些说法有依据？</h3>
            <p>每条引用都要能在查证记录中找到出处。没有来源的说法不会作为审核依据。</p>
            <div
              v-for="ev in investigation.evidence"
              :key="ev.source_id"
              class="source-check"
              :class="{ rejected: !ev.grounded }"
            >
              <strong>{{ ev.grounded ? '✓ 有出处，可以引用' : '× 没有对应出处，不采纳' }}</strong>
              <p>{{ ev.finding }}</p>
              <small>{{ ev.grounded ? ev.ref : '预设的错误引用示例，用于展示校验拦截。' }}</small>
            </div>
            <p class="step-takeaway">核对完来源，关键依据仍然不足。这张单据继续保留存疑。</p>
          </template>

          <template v-else>
            <h3>4. 财务接下来做什么？</h3>
            <p class="handoff-action">{{ story.handoff }}</p>
            <div class="human-state">
              <strong>{{
                reviews.length ? '已记录 ' + reviews.length + ' 条人工意见' : '等待财务补充确认'
              }}</strong>
              <p>机器建议保持存疑；人工意见单独记录。ERP 仍为待审核，Demo 不执行放行或回写。</p>
            </div>
            <button class="btn-primary" @click="$emit('review')">记录本例人工意见 →</button>
          </template>

          <nav class="step-actions" aria-label="切换查证步骤">
            <button v-if="step > 0" class="btn-ghost" @click="step--">← 上一步</button>
            <span v-else class="step-hint">从疑问开始，沿着证据往下看</span>
            <button v-if="step < steps.length - 1" class="btn-primary" @click="step++">
              下一步：{{ steps[step + 1] }} →
            </button>
          </nav>
        </section>

        <aside class="glass-card story-outcome">
          <span class="card-label">本例最后怎么处理</span>
          <h3>{{ story.decision }}</h3>
          <p>{{ story.handoff }}</p>
          <div class="outcome-note">
            <strong>Agent 帮到哪里？</strong>
            <p>把查过的资料、仍缺的依据和下一步工作交代清楚，让财务有据可查。</p>
          </div>
        </aside>
      </div>
    </template>
    <div v-else class="glass-card story-panel">
      <h2>Agent 查证过程</h2>
      <p>
        {{
          !result
            ? '请先回列表选择“10 元交通费”或“36 元打车缺票”案例，开始四步演示。'
            : !result.aiReview
              ? 'AI 复核已关闭。在系统设置开启后，回列表重新选择案例。'
              : '本单规则与 AI 意见一致，没有预设的进一步调查。回列表选择“10 元交通费”可查看完整过程。'
        }}
      </p>
    </div>

    <details class="glass-card engineering-details">
      <summary>展开工程细节：Skill、只读工具与原始记录</summary>
      <div class="engineering-body">
        <h3>这条业务过程如何实现</h3>
        <p>
          规则先做初审；真实项目将 <code>m2-claim-review/SKILL.md</code> 注入 AI
          提示词，要求按票面和制度独立判断，意见分歧转为存疑。
        </p>
        <p>LangGraph 中的节点顺序：</p>
        <code class="graph-path"
          >llm_review → investigate（按需） → adjudicate → human_gate → write_back</code
        >
        <p>调查与证据裁定只能增加人工关注；人工交接可配置中断和恢复，回写只写审核意见。</p>
        <h3>5 个只读工具</h3>
        <ul class="agent-tools">
          <li v-for="tool in agentTools" :key="tool[0]">
            <code>{{ tool[0] }}</code
            >：{{ tool[1] }}
          </li>
        </ul>

        <template v-if="investigation">
          <h3>本例的合成调用记录</h3>
          <details v-for="call in investigation.transcript" :key="call.call_id" class="agent-call">
            <summary>
              {{ call.label }} · <code>{{ call.tool }}</code>
            </summary>
            <p>
              {{ call.purpose }} · <code>{{ call.call_id }}</code>
            </p>
            <div class="agent-json">
              <div>
                <h4>参数</h4>
                <pre>{{ json(call.args) }}</pre>
              </div>
              <div>
                <h4>合成返回</h4>
                <pre>{{ json(call.output) }}</pre>
              </div>
            </div>
          </details>
          <h3>Grounding：预设的引用核对结果</h3>
          <p>
            引用绑定
            call_id、source_id、field_path。真实实现是来源与字段启发式校验，不等于语义正确性证明。
          </p>
          <div v-for="ev in investigation.evidence" :key="ev.source_id" class="technical-evidence">
            <strong>{{ ev.grounded ? '预设：可追溯' : '预设：未通过' }}</strong>
            <code>{{ ev.call_id }} → {{ ev.source_id }} → {{ ev.field_path }}</code>
          </div>
        </template>

        <h3>预算与降级</h3>
        <p>
          真实项目默认上限：5 步、14 次工具调用、30,000 token、90
          秒。这是配置说明，不是本次运行统计。
        </p>
        <p>
          调查超时、预算耗尽或证据不足时保留存疑；AI 复核失败时沿用规则。此页只展示合成记录，不执行
          LangGraph、工具或模型。会话修改在刷新后重置。
        </p>
      </div>
    </details>
  </section>
</template>

<style scoped>
.agent-workflow {
  display: grid;
  gap: 20px;
}
.story-kicker,
.card-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--brand);
}
h2 {
  margin: 10px 0;
  font-size: 25px;
  line-height: 1.4;
}
h3 {
  font-size: 18px;
  line-height: 1.6;
  margin-bottom: 16px;
}
h4 {
  font-size: 15px;
  line-height: 1.6;
}
p {
  margin: 10px 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.9;
}
small {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.8;
}
.story-heading p {
  max-width: 850px;
  color: var(--text-primary);
}
.story-steps {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-bottom: 1px solid var(--glass-border);
}
.story-steps button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 12px;
  border: 0;
  border-bottom: 3px solid transparent;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: var(--text-muted);
  cursor: pointer;
}
.story-steps button.current {
  border-bottom-color: var(--brand);
  color: var(--brand-dark);
  background: var(--glass-hover);
  font-weight: 600;
}
.step-number,
.lookup-number {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--bg-tertiary);
  flex-shrink: 0;
  font-size: 12px;
}
.current .step-number {
  background: var(--brand);
  color: white;
}
.story-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(250px, 1fr);
  gap: 20px;
  align-items: start;
}
.story-panel,
.story-outcome {
  padding: 24px;
  min-width: 0;
}
.story-outcome {
  border-top: 3px solid var(--brand);
}
.story-outcome h3 {
  margin: 10px 0;
}
.outcome-note {
  margin-top: 20px;
  border-top: 1px solid var(--glass-border);
  padding-top: 16px;
  font-size: 13px;
}
.outcome-note p {
  font-size: 13px;
}
.opinion-grid,
.agent-json {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.opinion {
  padding: 18px;
  border-radius: 10px;
  background: var(--bg-primary);
}
.opinion strong {
  display: block;
  margin: 10px 0;
  font-size: 18px;
}
.opinion p {
  font-size: 13px;
  margin-bottom: 0;
}
.step-takeaway {
  margin: 20px 0 0;
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--glass-hover);
  color: var(--brand-dark);
  font-size: 13px;
}
.step-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--glass-border);
  margin-top: 24px;
  padding-top: 20px;
  flex-wrap: wrap;
}
.step-hint {
  font-size: 12px;
  color: var(--text-muted);
}
.lookup-list {
  list-style: none;
  display: grid;
  gap: 20px;
}
.lookup-list li {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.lookup-number {
  color: var(--brand);
  background: var(--glass-hover);
  margin-top: 2px;
}
.lookup-list p {
  margin-bottom: 0;
}
.source-check {
  padding: 16px;
  border-radius: 8px;
  border-left: 3px solid var(--brand);
  background: var(--glass-hover);
  margin-top: 16px;
}
.source-check strong {
  color: var(--brand-dark);
  font-size: 14px;
}
.source-check.rejected {
  border-color: var(--danger);
  background: rgba(229, 72, 77, 0.05);
}
.source-check.rejected strong {
  color: var(--danger);
}
.source-check p {
  font-size: 13px;
}
.handoff-action {
  color: var(--text-primary);
}
.human-state {
  padding: 16px;
  margin: 18px 0;
  border-radius: 8px;
  background: var(--bg-primary);
  font-size: 14px;
}
.human-state p {
  font-size: 13px;
  margin-bottom: 0;
}
.engineering-details {
  padding: 18px 24px;
  min-width: 0;
}
summary {
  font-size: 13px;
  line-height: 1.8;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.engineering-body {
  padding-top: 24px;
}
.engineering-body h3 {
  font-size: 15px;
  margin: 24px 0 10px;
}
.engineering-body h3:first-child {
  margin-top: 0;
}
.engineering-body p,
.agent-tools {
  font-size: 13px;
}
.agent-tools {
  padding-left: 20px;
  line-height: 2;
}
.agent-tools li {
  margin-top: 8px;
}
code {
  font-size: 12px;
  overflow-wrap: anywhere;
}
.graph-path,
.technical-evidence code {
  display: block;
  line-height: 2;
}
.agent-call,
.technical-evidence {
  border-top: 1px solid var(--glass-border);
  padding: 14px 0;
}
.technical-evidence strong {
  font-size: 12px;
}
.agent-json > div {
  min-width: 0;
}
pre {
  background: var(--bg-primary);
  padding: 12px;
  margin-top: 8px;
  border-radius: 8px;
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media (max-width: 1100px) {
  .story-layout {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 600px) {
  h2 {
    font-size: 21px;
  }
  .story-panel,
  .story-outcome,
  .engineering-details {
    padding: 18px;
  }
  .story-steps {
    grid-template-columns: 1fr 1fr;
  }
  .story-steps button {
    padding: 12px 8px;
    font-size: 13px;
  }
  .opinion-grid,
  .agent-json {
    grid-template-columns: 1fr;
  }
}
</style>
