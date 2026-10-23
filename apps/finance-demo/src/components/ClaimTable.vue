<script setup>
import { demoState } from '../demo/state'
import StatusBadge from './StatusBadge.vue'

const props = defineProps({
  claims: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  total: {
    type: Number,
    default: 0
  },
  currentPage: {
    type: Number,
    default: 1
  },
  pageSize: {
    type: Number,
    default: 30
  },
  auditStatus: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['view-detail', 'selection-change', 'page-change'])

function getAmountYuan(row) {
  if (row.totalAmount != null) return Number(row.totalAmount)
  if (row.totalAmountFen != null) return Number(row.totalAmountFen) / 100
  return 0
}

function formatAmount(row) {
  const amount = getAmountYuan(row)
  return Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function lineCount(row) {
  if (Array.isArray(row.lines)) return row.lines.length
  if (row.lineCount != null) return row.lineCount
  return '-'
}

function auditState(row) {
  return props.auditStatus?.[row.id || row.claimNo]
}

function auditResult(row) {
  return auditState(row)?.result || ''
}

function lifecycleStatus(row) {
  const s = auditState(row)
  if (!s) return 'WAIT_AUDIT'
  return s.writtenBack ? 'WRITTEN_BACK' : 'AI_REVIEWED'
}

function handleSelectionChange(selection) {
  const ids = selection.map((item) => item.id || item.claimNo)
  emit('selection-change', ids)
}

function onPageChange(page) {
  emit('page-change', page)
}
</script>

<template>
  <div class="claim-table glass-card">
    <el-table
      :data="claims"
      v-loading="loading"
      class="data-table"
      @selection-change="handleSelectionChange"
      row-key="id"
    >
      <el-table-column type="selection" width="32" />
      <el-table-column prop="claimNo" label="单据编号" min-width="128">
        <template #default="{ row }">
          <button class="claim-no-link" @click="emit('view-detail', row.id || row.claimNo)">
            {{ row.claimNo || '-' }}
          </button>
        </template>
      </el-table-column>
      <el-table-column prop="employeeName" label="报销人" min-width="78">
        <template #default="{ row }">
          {{ row.employeeName || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="department" label="部门" min-width="56">
        <template #default="{ row }">
          {{ row.department || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="claimType" label="类型" min-width="68">
        <template #default="{ row }">
          {{ row.claimType || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="title" label="事由" min-width="92" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.title || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="行数" min-width="38" align="center">
        <template #default="{ row }">
          {{ lineCount(row) }}
        </template>
      </el-table-column>
      <el-table-column label="金额（元）" min-width="86" align="right">
        <template #default="{ row }">
          <span class="amount">{{ formatAmount(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="机器建议" min-width="86" align="center">
        <template #default="{ row }">
          <StatusBadge v-if="auditResult(row)" :status="auditResult(row)" />
          <span v-else class="muted-text">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="演示进度" min-width="100">
        <template #default="{ row }">
          <StatusBadge :status="lifecycleStatus(row)" />
        </template>
      </el-table-column>
      <el-table-column label="ERP 状态" min-width="68"
        ><template #default><span>待审核</span></template></el-table-column
      >
      <el-table-column label="人工复核" min-width="72"
        ><template #default="{ row }">
          <span>{{
            demoState.reviews[row.id]?.length
              ? `已记录 ${demoState.reviews[row.id].length} 次`
              : '尚未记录'
          }}</span>
        </template></el-table-column
      >
      <el-table-column label="操作" min-width="56">
        <template #default="{ row }">
          <button class="action-btn" @click="emit('view-detail', row.id || row.claimNo)">
            <el-icon><View /></el-icon>
            <span>详情</span>
          </button>
        </template>
      </el-table-column>
    </el-table>

    <div class="table-footer">
      <el-pagination
        background
        layout="total, prev, pager, next, jumper"
        :total="total"
        :page-size="pageSize"
        :current-page="currentPage"
        @current-change="onPageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.claim-table {
  padding: 0;
  overflow: hidden;
}

.muted-text {
  color: var(--text-muted, #9ca3af);
}

.data-table {
  width: 100%;
}

.data-table :deep(.el-table__body-wrapper) {
  padding: 0;
}

.data-table :deep(.el-table__cell) {
  padding: 10px 0;
}

.data-table :deep(.cell) {
  padding: 0 6px;
}

.data-table :deep(.status-badge) {
  gap: 3px;
  padding: 4px;
  white-space: nowrap;
}

.data-table :deep(.el-table__header th) {
  font-weight: 600;
  font-size: 13px;
}

.claim-no-link {
  border: none;
  background: transparent;
  font-family: var(--font-display);
  color: var(--brand);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
}

.claim-no-link:hover {
  text-decoration: underline;
}

.amount {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: var(--brand);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 0;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: rgba(10, 143, 117, 0.1);
}

.table-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 14px 24px;
  border-top: 1px solid var(--glass-border);
}
</style>
