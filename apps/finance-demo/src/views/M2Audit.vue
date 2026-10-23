<script setup>
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import ClaimTable from '../components/ClaimTable.vue'
import StatsCards from '../components/StatsCards.vue'
import { useAuditStore } from '../stores/audit'
import { useConnectionStore } from '../stores/connection'

const router = useRouter()
const connStore = useConnectionStore()
const auditStore = useAuditStore()

const auditing = ref(false)
const auditProgress = ref({ processed: 0, total: 0, phase: '' })
const statusFilter = ref('ALL')
const keyword = ref('')

const displayClaims = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return auditStore.claims
  return auditStore.claims.filter(
    (c) =>
      (c.claimNo || '').toLowerCase().includes(kw) ||
      (c.title || '').toLowerCase().includes(kw) ||
      (c.employeeName || '').toLowerCase().includes(kw)
  )
})

const phaseLabel = computed(() => {
  if (auditProgress.value.phase === 'ai') return 'AI复核'
  if (auditProgress.value.phase === 'rules') return '规则审核'
  return ''
})

onMounted(loadData)

async function loadData() {
  await auditStore.loadClaims({ page: 1, pageSize: 30, status: statusFilter.value })
}

async function runAudit() {
  if (auditStore.selectedIds.length === 0) return
  auditing.value = true
  auditProgress.value = { processed: 0, total: auditStore.selectedIds.length }
  try {
    await auditStore.runAudit(auditStore.selectedIds, (p) => {
      auditProgress.value = p
    })
    await loadData()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    auditing.value = false
  }
}

async function openAgentCase(claimId) {
  auditing.value = true
  try {
    await auditStore.runAudit([claimId])
    await router.push({ path: '/m2/' + claimId, query: { tab: 'agent' } })
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    auditing.value = false
  }
}

function viewDetail(claimId) {
  router.push(`/m2/${claimId}`)
}

function handleSelectionChange(ids) {
  auditStore.selectClaims(ids)
}

async function handleQuery() {
  await auditStore.loadClaims({ page: 1, pageSize: 30, status: statusFilter.value })
}

async function handleReset() {
  statusFilter.value = 'ALL'
  keyword.value = ''
  await auditStore.loadClaims({ page: 1, pageSize: 30, status: 'ALL' })
}

async function handlePageChange(page) {
  await auditStore.loadClaims({ page, pageSize: 30, status: statusFilter.value })
}
</script>

<template>
  <div class="m2-audit-page">
    <header class="page-header">
      <div class="header-left">
        <h1 class="page-title">M2 合规审核</h1>
        <p class="page-subtitle">差旅报销审核工作台 · 11 类规则的预设案例</p>
      </div>
      <div class="header-right">
        <button
          class="btn-primary"
          :disabled="auditing || auditStore.selectedIds.length === 0"
          @click="runAudit"
        >
          <el-icon v-if="!auditing"><VideoPlay /></el-icon>
          <span style="margin-left: 6px">
            {{
              auditing
                ? `审核中${phaseLabel ? ' ' + phaseLabel : ''} ${auditProgress.processed}/${auditProgress.total}`
                : `模拟批量审核 (${auditStore.selectedIds.length})`
            }}
          </span>
        </button>
      </div>
    </header>

    <section class="agent-entry glass-card" aria-label="Agent 体验入口">
      <div>
        <h2>一张存疑单，Agent 怎样帮财务查清楚？</h2>
        <p>选一个例子，按四步看：哪里有疑问 → 查了什么 → 证据是否够用 → 人工处理。</p>
      </div>
      <div class="agent-actions">
        <button class="btn-primary" :disabled="auditing" @click="openAgentCase('DEMO-0003')">
          看案例：10 元交通费
        </button>
        <button class="btn-ghost" :disabled="auditing" @click="openAgentCase('DEMO-0005')">
          看案例：36 元打车缺票
        </button>
      </div>
    </section>

    <StatsCards v-if="connStore.connected" :stats="auditStore.stats" />

    <div v-if="connStore.connected" class="filter-bar glass-card">
      <div class="filter-item">
        <label class="filter-label">机器建议</label>
        <el-select v-model="statusFilter" placeholder="全部" style="width: 140px">
          <el-option label="全部" value="ALL" />
          <el-option label="尚未模拟审核" value="PENDING" />
          <el-option label="建议通过" value="APPROVE" />
          <el-option label="建议驳回" value="REJECT" />
          <el-option label="存疑复核" value="FLAG" />
        </el-select>
      </div>
      <div class="filter-item">
        <label class="filter-label">关键字</label>
        <el-input
          v-model="keyword"
          placeholder="单号 / 事由 / 报销人"
          clearable
          style="width: 260px"
          @keyup.enter="handleQuery"
        />
      </div>
      <el-button type="primary" @click="handleQuery">查询</el-button>
      <button class="reset-link" @click="handleReset">重置筛选</button>
    </div>

    <ClaimTable
      v-if="connStore.connected"
      :claims="displayClaims"
      :loading="auditStore.loading"
      :total="displayClaims.length"
      :current-page="auditStore.currentPage"
      :page-size="30"
      :audit-status="auditStore.auditStatusMap"
      @view-detail="viewDetail"
      @selection-change="handleSelectionChange"
      @page-change="handlePageChange"
    />
  </div>
</template>

<style scoped>
.m2-audit-page {
  max-width: 1400px;
  margin: 0 auto;
}

.agent-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.agent-entry h2 {
  margin: 0 0 8px;
  font-size: 17px;
}
.agent-entry p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.8;
}
.agent-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.writeback-toggle {
  white-space: nowrap;
  margin-right: 2px;
}

.page-title {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin-top: 4px;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  margin-bottom: 16px;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.reset-link {
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  text-decoration: none;
  user-select: none;
}

.reset-link:hover {
  color: var(--brand);
}

.connect-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-item label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.error-msg {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--danger);
  font-size: 13px;
  padding: 8px 12px;
  background: rgba(229, 72, 77, 0.08);
  border-radius: var(--border-radius-sm);
}
</style>
