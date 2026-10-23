<script setup>
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import api from '../api'
import AgentWorkflow from '../components/AgentWorkflow.vue'
import ReviewPanel from '../components/ReviewPanel.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { attachmentUrl } from '../demo/attachments'
import { company, expenseLabels } from '../demo/fixtures'
import { demoState } from '../demo/state'
import { useAuditStore } from '../stores/audit'

const route = useRoute()
const router = useRouter()
const auditStore = useAuditStore()
const claim = ref(null)
const companyRef = ref(company)
const loading = ref(true)
const error = ref('')
const activeTab = ref(route.query.tab === 'agent' ? 'agent' : 'details')
const auditResult = computed(() => demoState.audits[route.params.claimId])
const selectedInvoiceId = ref(null)
const ocrEditable = ref({})
const verified = ref(false)
const savingEdit = ref(false)
const reviewSubmitting = ref(false)
const reviews = computed(() => demoState.reviews[route.params.claimId] || [])
const fieldLabels = {
  buyerName: '购方名称',
  buyerTaxNo: '购方税号',
  vendor: '销售方/供应商',
  amount: '金额',
  date: '开票日期',
  code: '发票代码 / 号码',
  category: '费用类型'
}
const selectedInvoice = computed(() =>
  claim.value?.invoices.find((i) => i.id === selectedInvoiceId.value)
)
const systemFields = computed(() => {
  const inv = selectedInvoice.value
  if (!inv) return {}
  return {
    buyerName: inv.sysBuyerName,
    buyerTaxNo: inv.sysBuyerTaxNo,
    vendor: inv.vendor,
    amount: inv.amount.toFixed(2),
    date: inv.date,
    code: inv.code,
    category: inv.category
  }
})
const ocrFields = computed(() => ocrEditable.value)
const fieldDiffs = computed(() =>
  Object.fromEntries(
    Object.keys(systemFields.value).map((k) => [
      k,
      !!selectedInvoice.value?.attachmentId &&
        String(ocrFields.value[k] ?? '').trim() !== String(systemFields.value[k] ?? '').trim()
    ])
  )
)
const diffCount = computed(() => Object.values(fieldDiffs.value).filter(Boolean).length)
const totalAmount = computed(() => claim.value?.totalAmount || 0)
function selectInvoice(id) {
  selectedInvoiceId.value = id
  const inv = claim.value?.invoices.find((i) => i.id === id)
  const saved = demoState.ocrEdits[id]
  ocrEditable.value = { ...(saved?.fields || inv?.ocr || {}) }
  verified.value = saved?.verified || false
}
function updateOcrField(key, value) {
  ocrEditable.value = { ...ocrEditable.value, [key]: value }
}
async function saveEdit() {
  if (!selectedInvoice.value?.attachmentId) return
  savingEdit.value = true
  try {
    await api.put('/m2/ocr/' + selectedInvoiceId.value, {
      edit: { fields: ocrEditable.value, verified: verified.value }
    })
    ElMessage.success('已保存在当前会话；预设机器建议不会重算')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    savingEdit.value = false
  }
}
onMounted(async () => {
  try {
    const id = String(route.params.claimId)
    const detail = await api.get('/erp/claims/' + id)
    const ocr = await api.get('/erp/claims/' + id + '/ocr-fields')
    const result = demoState.audits[id]
    claim.value = {
      id,
      claimNo: detail.claimNo,
      employeeName: detail.employeeName,
      department: detail.departmentName,
      totalAmount: detail.totalFen / 100,
      submitDate: detail.submittedAt.replace('T', ' ').slice(0, 16),
      status: detail.status,
      currency: 'CNY',
      auditResult: result?.result,
      confidence: result?.decisionStrength,
      aiReview: result?.aiReview,
      violations: (result?.violations || []).map((code, i) => ({
        id: code,
        rule: code,
        severity: 'MEDIUM',
        description: result.reasons[i] || code
      })),
      reasons: result?.reasons || [],
      invoices: detail.lines.map((line) => {
        const inv = line.invoice
        return {
          id: inv.id,
          date: inv.issuedOn,
          vendor: inv.seller.name,
          amount: inv.totalFen / 100,
          code: `${inv.invoiceCode} / ${inv.invoiceNo}`,
          category: expenseLabels[line.expenseType] || line.expenseType,
          sysBuyerName: inv.buyer.name,
          sysBuyerTaxNo: inv.buyer.taxNo,
          attachmentId: line.attachment?.id,
          imgUrl: attachmentUrl(line.attachment?.id),
          ocr: ocr.fields[line.attachment?.id] || {}
        }
      })
    }
    selectInvoice(claim.value.invoices[0]?.id)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})
const verdictMap = { APPROVE: '建议通过', REJECT: '建议驳回', FLAG: '存疑复核' }
function verdictLabel(value) {
  return verdictMap[value] || '尚未模拟审核'
}
const violationLabels = {
  OVER_STANDARD_HOTEL: '住宿超标',
  OVER_STANDARD_MEAL: '伙食超标',
  OVER_STANDARD_TRANSPORT_CLASS: '舱位超标',
  INVOICE_TITLE_MISMATCH: '购方抬头异常',
  DUPLICATE_INVOICE: '重复报销',
  MISSING_ATTACHMENT: '缺少票据附件'
}
function ruleLabel(code) {
  return violationLabels[code] || code
}
function investigationLabel() {
  return '预设调查 · 保留人工复核'
}
const approvalSuggestion = computed(() => {
  if (!claim.value?.auditResult) return '请返回列表选择单据并模拟审核，再查看预设建议。'
  return claim.value.auditResult === 'FLAG'
    ? '证据或标准不足，保留存疑，交由财务人员确认。'
    : '机器只给建议。人工复核记录与机器建议独立，ERP 状态始终保持待审核。'
})
function goBack() {
  router.push('/m2')
}
const imageVisible = ref(false)
function openImage() {
  imageVisible.value = true
}
async function copyReasons() {
  try {
    await navigator.clipboard.writeText(
      ['【虚拟演示】' + claim.value.claimNo, ...claim.value.reasons].join('\n')
    )
    ElMessage.success('演示理由已复制')
  } catch {
    ElMessage.warning('当前浏览器无法复制，请手动选择理由文本')
  }
}
async function handleReviewSubmit(payload) {
  reviewSubmitting.value = true
  try {
    await auditStore.submitReview(payload.claimId, payload)
    ElMessage.success('人工决定已记录到当前会话；ERP 状态保持待审核')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    reviewSubmitting.value = false
  }
}
</script>
<template>
  <div class="m2-detail">
    <div class="page-nav">
      <button class="btn-ghost back-btn" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回列表</span>
      </button>
    </div>

    <div v-if="loading" class="loading-state">
      <el-icon :size="48" class="spin-icon"><Loading /></el-icon>
      <span>加载审核详情中...</span>
    </div>

    <el-empty v-else-if="error" :description="error" />
    <template v-else-if="claim">
      <header class="detail-header glass-card" :class="{ 'agent-context': activeTab === 'agent' }">
        <div class="header-top">
          <div class="claim-identity">
            <h1 class="claim-no mono">#{{ claim.claimNo }}</h1>
            <StatusBadge :status="claim.auditResult" />
          </div>
          <div class="amount-block">
            <span class="amount-label">报销金额</span>
            <span class="amount-value"
              >¥{{ totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</span
            >
          </div>
        </div>

        <div v-if="activeTab !== 'agent'" class="info-grid">
          <div class="info-item">
            <span class="info-label">申请人</span>
            <span class="info-value">{{ claim.employeeName }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">部门</span>
            <span class="info-value">{{ claim.department }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">提交时间</span>
            <span class="info-value">{{ claim.submitDate }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">币种</span>
            <span class="info-value">{{ claim.currency }}</span>
          </div>
        </div>
      </header>

      <div class="detail-tabs">
        <button
          v-for="tab in [
            { key: 'details', label: '费用明细' },
            { key: 'result', label: `审核结果 (${claim.violations?.length || 0})` },
            { key: 'agent', label: 'Agent 查证过程' },
            { key: 'review', label: '人工复核' }
          ]"
          :key="tab.key"
          :class="['tab-btn', { active: activeTab === tab.key }]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <p class="demo-note">ERP 状态：待审核（PENDING） · 机器建议与人工决定分别记录</p>
      <div v-if="activeTab === 'review' && reviews.length" class="glass-card session-reviews">
        <h3>当前会话复核记录</h3>
        <p v-for="(review, i) in reviews" :key="i">
          {{ review.createdAt }} · 人工{{ verdictMap[review.decision]?.replace('建议', '') }} ·
          {{ review.comment || '无备注' }}
        </p>
      </div>
      <div class="tab-content">
        <div v-if="activeTab === 'details'" class="compare-container">
          <div class="invoice-tabs-bar glass-card">
            <button
              v-for="inv in claim.invoices"
              :key="inv.id"
              :class="['inv-tab', { active: selectedInvoiceId === inv.id }]"
              @click="selectInvoice(inv.id)"
            >
              <span class="inv-tab-type">{{ inv.category }}</span>
              <span class="inv-tab-vendor">{{ inv.vendor }}</span>
              <span class="inv-tab-amount mono">¥{{ inv.amount.toLocaleString() }}</span>
            </button>
          </div>

          <div v-if="selectedInvoice" class="three-column-layout glass-card">
            <div class="col col-image">
              <div class="col-header">
                <el-icon><Picture /></el-icon>
                <span>票据图片</span>
              </div>
              <div v-if="selectedInvoice.imgUrl" class="invoice-image">
                <img
                  :src="selectedInvoice.imgUrl"
                  :alt="selectedInvoice.vendor"
                  loading="lazy"
                  role="button"
                  tabindex="0"
                  @keydown.enter="openImage"
                  @keydown.space.prevent="openImage"
                  @click="openImage"
                />
                <div class="image-hint">
                  <el-icon><ZoomIn /></el-icon>
                  <span>点击查看大图</span>
                </div>
              </div>
              <div v-else class="image-placeholder">
                <el-icon :size="48"><Document /></el-icon>
                <p>{{ selectedInvoice.vendor }} - {{ selectedInvoice.category }}</p>
                <span>该费用行无票据影像</span>
              </div>
            </div>

            <div class="col col-ocr">
              <div class="col-header">
                <el-icon><Edit /></el-icon>
                <span>预设 OCR 转录</span>
                <el-tag size="small" type="warning" effect="dark">可编辑</el-tag>
              </div>
              <div v-if="selectedInvoice.attachmentId" class="fields-list">
                <div
                  v-for="key in Object.keys(fieldLabels)"
                  :key="key"
                  :class="['field-row', { diff: fieldDiffs[key] }]"
                >
                  <label class="field-label">{{ fieldLabels[key] }}</label>
                  <el-input
                    :model-value="ocrFields[key]"
                    @update:model-value="(v) => updateOcrField(key, v)"
                    size="default"
                  />
                  <el-icon v-if="fieldDiffs[key]" class="diff-icon"><Warning /></el-icon>
                </div>
              </div>
              <p v-if="!selectedInvoice.attachmentId" class="demo-note">
                缺少附件，无票面 OCR 可供核对。
              </p>
              <div
                v-if="
                  !ocrFields.buyerName &&
                  selectedInvoice.sysBuyerName &&
                  selectedInvoice.sysBuyerName !== companyRef.name
                "
                class="ocr-fallback-note"
              >
                <el-icon><InfoFilled /></el-icon>
                <span>票面无购方栏，抬头/税号按系统录入判定（见右侧「系统录入」）</span>
              </div>
              <div v-if="diffCount" class="diff-summary">
                <el-icon><Warning /></el-icon>
                <span
                  >检测到 <strong>{{ diffCount }}</strong> 处差异</span
                >
              </div>
            </div>

            <div class="col col-system">
              <div class="col-header">
                <el-icon><Lock /></el-icon>
                <span>系统录入字段</span>
                <el-tag size="small" type="info" effect="plain">只读</el-tag>
              </div>
              <div class="fields-list">
                <div
                  v-for="key in Object.keys(fieldLabels)"
                  :key="key"
                  :class="['field-row', { diff: fieldDiffs[key] }]"
                >
                  <label class="field-label">{{ fieldLabels[key] }}</label>
                  <div class="field-value mono">{{ systemFields[key] }}</div>
                  <span
                    v-if="
                      key === 'buyerName' &&
                      selectedInvoice.sysBuyerName &&
                      selectedInvoice.sysBuyerName !== companyRef.name
                    "
                    class="sys-entry-note"
                  >
                    系统录入：{{ selectedInvoice.sysBuyerName }}
                  </span>
                  <span v-if="fieldDiffs[key]" class="diff-badge">不一致</span>
                </div>
              </div>
              <div class="match-summary">
                <span v-if="diffCount === 0" class="match-ok">
                  <el-icon><CircleCheck /></el-icon>
                  <span>{{
                    selectedInvoice.attachmentId ? '所有字段一致' : '缺少附件，无法核对'
                  }}</span>
                </span>
                <span v-else class="match-warn">
                  <el-icon><Warning /></el-icon>
                  <span>{{ diffCount }} 处需核对</span>
                </span>
              </div>
            </div>
          </div>

          <div v-if="selectedInvoice?.attachmentId" class="compare-actions glass-card">
            <div class="actions-left">
              <el-checkbox v-model="verified" active-color="#0A8F75">
                <span class="checkbox-label">标记为已核对</span>
              </el-checkbox>
              <span v-if="verified" class="verified-badge">
                <el-icon><CircleCheck /></el-icon>
                <span>已核对</span>
              </span>
            </div>
            <div class="actions-right">
              <span v-if="diffCount" class="diff-warn">
                <el-icon><Warning /></el-icon>
                <span>存在 {{ diffCount }} 处差异未处理</span>
              </span>
              <button class="btn-primary" :disabled="savingEdit" @click="saveEdit">
                <el-icon v-if="!savingEdit"><Check /></el-icon>
                <span style="margin-left: 6px">{{ savingEdit ? '保存中...' : '保存修改' }}</span>
              </button>
            </div>
          </div>
        </div>

        <div v-else-if="activeTab === 'result'" class="result-panel">
          <!-- 1. 规则匹配结果 -->
          <div class="res-block glass-card">
            <div class="res-head">
              <h3>规则匹配结果</h3>
              <el-tag type="info" size="small" effect="plain">依据合成制度样例</el-tag>
              <span class="res-verdict" :class="'v-' + (claim.auditResult || 'none').toLowerCase()">
                {{ verdictLabel(claim.auditResult) }}
              </span>
              <span v-if="claim.confidence != null" class="res-conf"
                >规则决策强度 {{ Math.round(claim.confidence * 100) }}%</span
              >
            </div>
            <div v-if="claim.violations?.length" class="violation-list">
              <div v-for="v in claim.violations" :key="v.id" class="violation-item">
                <div :class="['violation-indicator', v.severity.toLowerCase()]"></div>
                <div class="violation-content">
                  <div class="violation-header">
                    <span class="rule-label">{{ ruleLabel(v.rule) }}</span>
                    <span class="rule-code mono">{{ v.rule }}</span>
                    <el-tag type="danger" size="small" effect="dark">{{ v.severity }}</el-tag>
                  </div>
                  <p class="violation-desc">{{ v.description }}</p>
                </div>
              </div>
              <button class="btn-secondary copy-btn" @click="copyReasons">
                <el-icon><CopyDocument /></el-icon>
                <span style="margin-left: 4px">复制退单理由</span>
              </button>
            </div>
            <div v-else class="res-empty">
              <el-icon :size="18"><CircleCheck /></el-icon>
              <span>{{ claim.reasons.join('；') || '尚未模拟审核' }}</span>
            </div>
          </div>

          <!-- 2. AI 审核结果 -->
          <div class="res-block glass-card">
            <div class="res-head">
              <h3>预设 AI 复核意见</h3>
              <span
                v-if="claim.aiReview?.result"
                class="res-verdict"
                :class="'v-' + claim.aiReview.result.toLowerCase()"
              >
                {{ verdictLabel(claim.aiReview.result) }}
              </span>
              <el-tag
                v-if="claim.aiReview?.agreeWithRules !== undefined"
                :type="claim.aiReview.agreeWithRules ? 'success' : 'warning'"
                size="small"
                effect="plain"
              >
                {{ claim.aiReview.agreeWithRules ? '与规则一致' : '与规则分歧' }}
              </el-tag>
            </div>
            <div v-if="claim.aiReview?.reasons?.length" class="ai-reasons">
              <p v-for="(r, i) in claim.aiReview.reasons" :key="i" class="ai-reason">{{ r }}</p>
              <div v-if="claim.aiReview.confidence != null" class="res-conf">
                AI 置信度 {{ Math.round(claim.aiReview.confidence * 100) }}%
              </div>
            </div>
            <div v-if="claim.aiReview?.investigation" class="investigation">
              <div class="invest-head">
                <span class="invest-title">调查 Agent</span>
                <el-tag size="small" effect="plain" type="info">
                  {{ investigationLabel(claim.aiReview.investigation) }}
                </el-tag>
                <span class="invest-meta mono">
                  预设 {{ claim.aiReview.investigation.transcript.length }} 次工具调用
                </span>
                <button class="btn-ghost" @click="activeTab = 'agent'">看 Agent 怎样查证 →</button>
              </div>
              <p v-if="claim.aiReview.investigation.summary" class="invest-summary">
                {{ claim.aiReview.investigation.summary }}
              </p>
              <ul v-if="claim.aiReview.investigation.evidence?.length" class="invest-evidence">
                <li v-for="(ev, i) in claim.aiReview.investigation.evidence" :key="i">
                  <span class="mono">{{ ev.tool }}</span>
                  <span class="ev-finding">{{ ev.finding }}</span>
                  <span v-if="ev.ref" class="ev-ref">{{ ev.ref }}</span>
                  <el-tag
                    v-if="ev.grounded !== null && ev.grounded !== undefined"
                    :type="ev.grounded ? 'success' : 'danger'"
                    size="small"
                    effect="plain"
                  >
                    {{ ev.grounded ? '预设：引用可追溯' : '预设：引用未通过' }}
                  </el-tag>
                </li>
              </ul>
            </div>
            <div v-if="!claim.aiReview" class="res-empty">
              <el-icon :size="18"><MagicStick /></el-icon>
              <span>未启用 AI 复核或暂无结果（可在「系统设置」开启后重新审核）</span>
            </div>
          </div>

          <!-- 3. 审批建议 -->
          <div class="res-block glass-card">
            <div class="res-head">
              <h3>审批建议</h3>
            </div>
            <div
              class="approval-suggestion"
              :class="'s-' + (claim.auditResult || 'none').toLowerCase()"
            >
              <el-icon :size="20"><InfoFilled /></el-icon>
              <span>{{ approvalSuggestion }}</span>
            </div>
          </div>
        </div>

        <AgentWorkflow
          v-else-if="activeTab === 'agent'"
          :result="auditResult"
          :reviews="reviews"
          @review="activeTab = 'review'"
        />
        <ReviewPanel
          :submitting="reviewSubmitting"
          v-else-if="activeTab === 'review'"
          :claim="claim"
          @submit="handleReviewSubmit"
        />
      </div>
    </template>
    <el-dialog v-model="imageVisible" title="合成票据示意" width="min(960px, 94vw)"
      ><img
        v-if="selectedInvoice?.imgUrl"
        :src="selectedInvoice.imgUrl"
        alt="虚拟票据大图"
        style="width: 100%"
    /></el-dialog>
  </div>
</template>

<style scoped>
.m2-detail {
  max-width: 1400px;
  margin: 0 auto;
}

.page-nav {
  margin-bottom: 16px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  gap: 16px;
  color: var(--text-muted);
  font-family: var(--font-display);
}

.spin-icon {
  animation: spin 1s linear infinite;
  color: var(--brand);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.detail-header {
  padding: 28px 32px;
  margin-bottom: 20px;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 20px;
}

.claim-identity {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-header.agent-context {
  padding: 16px 24px;
  margin-bottom: 12px;
}

.agent-context .header-top {
  align-items: center;
  margin-bottom: 0;
  gap: 12px;
}

.agent-context .claim-identity {
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
}

.agent-context .claim-no {
  font-size: 18px;
}

.agent-context .amount-value {
  font-size: 24px;
}

.claim-no {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}

.amount-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.amount-label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.amount-value {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 700;
  color: var(--brand);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px 32px;
  padding-top: 20px;
  border-top: 1px solid var(--glass-border);
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--text-primary);
}

.detail-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--glass-border);
  margin-bottom: 20px;
}

.tab-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 12px 20px;
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: -1px;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  color: var(--brand);
  border-bottom-color: var(--brand);
}

.tab-content {
  min-height: 400px;
}

.compare-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.invoice-tabs-bar {
  display: flex;
  gap: 8px;
  padding: 12px;
  overflow-x: auto;
}

.inv-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  font-family: var(--font-body);
  color: var(--text-secondary);
}

.inv-tab:hover {
  border-color: var(--brand);
  color: var(--text-primary);
}

.inv-tab.active {
  border-color: var(--brand);
  background: rgba(10, 143, 117, 0.06);
  color: var(--text-primary);
}

.inv-tab-type {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  background: rgba(10, 143, 117, 0.15);
  border-radius: 4px;
  color: var(--brand);
}

.inv-tab-vendor {
  font-size: 13px;
}

.inv-tab-amount {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.three-column-layout {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1.2fr;
  gap: 0;
  overflow: hidden;
}

.col {
  display: flex;
  flex-direction: column;
  padding: 20px;
  min-height: 420px;
}

.col + .col {
  border-left: 1px solid var(--glass-border);
}

.col-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--glass-border);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
}

.col-header .el-icon {
  color: var(--brand);
}

.col-system .col-header .el-icon {
  color: var(--text-muted);
}

.image-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #fafbfc;
  border-radius: var(--border-radius-sm);
  border: 2px dashed #e5e8ec;
  color: var(--text-muted);
  cursor: zoom-in;
  transition: all 0.2s ease;
}

.image-placeholder:hover {
  border-color: var(--brand);
  background: rgba(10, 143, 117, 0.04);
}

.image-placeholder .el-icon {
  color: var(--brand);
  opacity: 0.4;
}

.image-placeholder p {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}

.image-placeholder span {
  font-size: 12px;
}

.invoice-image {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 12px;
}

.invoice-image img {
  max-width: 100%;
  max-height: 360px;
  object-fit: contain;
  cursor: zoom-in;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.ocr-fallback-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 10px;
  background: rgba(230, 162, 60, 0.08);
  border-left: 3px solid var(--warning);
  border-radius: 4px;
  color: var(--warning);
  font-size: 12px;
  line-height: 1.5;
}

.sys-entry-note {
  grid-column: 1 / -1;
  font-size: 11px;
  color: var(--warning);
  background: rgba(230, 162, 60, 0.08);
  border-radius: 4px;
  padding: 3px 8px;
  margin-top: 2px;
}

.image-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  padding: 4px 12px;
  background: rgba(10, 143, 117, 0.1);
  border-radius: 4px;
  color: var(--brand);
  font-size: 12px;
}

.fields-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
  padding: 10px 12px;
  border-radius: var(--border-radius-sm);
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.field-row.diff {
  background: rgba(245, 166, 35, 0.06);
  border-color: rgba(245, 166, 35, 0.2);
}

.field-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.diff-icon {
  position: absolute;
  top: 12px;
  right: 12px;
  color: var(--warning);
  font-size: 14px;
}

.field-value {
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  font-size: 14px;
  color: var(--text-primary);
  min-height: 36px;
  display: flex;
  align-items: center;
}

.field-row.diff .field-value {
  color: var(--warning);
  font-weight: 600;
}

.diff-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 11px;
  padding: 2px 8px;
  background: var(--warning);
  color: #ffffff;
  border-radius: 4px;
  font-weight: 600;
}

.diff-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 14px;
  background: rgba(245, 166, 35, 0.1);
  border: 1px solid rgba(245, 166, 35, 0.25);
  border-radius: var(--border-radius-sm);
  font-size: 13px;
  color: var(--warning);
}

.diff-summary strong {
  font-size: 16px;
}

.match-summary {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: var(--border-radius-sm);
  font-size: 13px;
}

.match-ok {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--success);
  background: rgba(26, 147, 111, 0.08);
}

.match-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--warning);
  background: rgba(245, 166, 35, 0.08);
}

.compare-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  flex-wrap: wrap;
  gap: 12px;
}

.actions-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.checkbox-label {
  font-size: 14px;
  color: var(--text-primary);
}

.verified-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(26, 147, 111, 0.1);
  color: var(--success);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.actions-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.diff-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--warning);
}

.violations-panel {
  padding: 0;
  overflow: hidden;
}

.result-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.res-block {
  padding: 20px 24px;
}

.res-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.res-head h3 {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.res-verdict {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 6px;
}

.res-verdict.v-approve {
  background: rgba(26, 147, 111, 0.1);
  color: var(--success);
}
.res-verdict.v-reject {
  background: rgba(229, 72, 77, 0.1);
  color: var(--danger);
}
.res-verdict.v-flag {
  background: rgba(245, 166, 35, 0.12);
  color: var(--warning);
}
.res-verdict.v-none {
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.res-conf {
  margin-left: auto;
  font-family: var(--font-display);
  font-size: 12px;
  color: var(--text-muted);
}

.ai-reasons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.investigation {
  margin-top: 12px;
  padding: 12px 14px;
  background: rgba(10, 143, 117, 0.04);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.invest-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.invest-title {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.invest-meta {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted);
}

.invest-summary {
  margin: 8px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.invest-evidence {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.invest-evidence li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.invest-evidence .ev-finding {
  flex: 1;
}
.invest-evidence .ev-ref {
  color: var(--text-muted);
}

.ai-reason {
  margin: 0;
  padding: 10px 14px;
  background: rgba(10, 143, 117, 0.05);
  border-left: 3px solid var(--brand);
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
}

.res-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
}

.approval-suggestion {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
}

.approval-suggestion.s-approve {
  background: rgba(26, 147, 111, 0.08);
  color: var(--success);
}
.approval-suggestion.s-reject {
  background: rgba(229, 72, 77, 0.08);
  color: var(--danger);
}
.approval-suggestion.s-flag {
  background: rgba(245, 166, 35, 0.1);
  color: var(--warning);
}
.approval-suggestion.s-none {
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--glass-border);
}

.panel-header h3 {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.violation-count {
  font-family: var(--font-display);
  font-size: 13px;
  color: var(--text-muted);
}

.violation-list {
  padding: 8px 0;
}

.violation-item {
  display: flex;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--glass-border);
  transition: background 0.2s ease;
}

.violation-item:hover {
  background: rgba(10, 143, 117, 0.02);
}

.violation-item:last-child {
  border-bottom: none;
}

.violation-indicator {
  width: 4px;
  border-radius: 2px;
  flex-shrink: 0;
  background: var(--brand);
  opacity: 0.4;
}

.violation-indicator.high {
  opacity: 1;
}
.violation-indicator.medium {
  opacity: 0.6;
}
.violation-indicator.low {
  opacity: 0.3;
}

.violation-content {
  flex: 1;
}

.violation-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.rule-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--danger, #e5484d);
}

.rule-code {
  font-size: 13px;
  font-weight: 600;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  margin-top: 8px;
  border: 1px solid rgba(10, 143, 117, 0.3);
  border-radius: 6px;
  background: rgba(10, 143, 117, 0.08);
  color: var(--brand);
  font-size: 13px;
  cursor: pointer;
}

.violation-desc {
  font-size: 14px;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.violation-amount {
  font-family: var(--font-display);
  font-size: 12px;
  color: var(--text-muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 0;
  gap: 16px;
  color: var(--text-muted);
}

.empty-state p {
  margin: 0;
  font-size: 14px;
}
</style>
