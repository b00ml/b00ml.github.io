import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import api from '../api'
import { claims as fixtures } from '../demo/fixtures'
import { demoState } from '../demo/state'

export const useAuditStore = defineStore('audit', () => {
  const claims = ref([])
  const loading = ref(false)
  const currentPage = ref(1)
  const selectedIds = ref([])
  const totalCount = computed(() => claims.value.length)
  const auditResults = computed(() => Object.values(demoState.audits))
  const auditStatusMap = computed(() =>
    Object.fromEntries(
      fixtures
        .map((c) => [
          c.id,
          {
            ...demoState.audits[c.id],
            reviews: demoState.reviews[c.id] || [],
            writtenBack: false
          }
        ])
        .filter(([, s]) => s.result)
    )
  )
  const stats = computed(() => ({
    total: fixtures.length,
    approved: auditResults.value.filter((a) => a.result === 'APPROVE').length,
    rejected: auditResults.value.filter((a) => a.result === 'REJECT').length,
    flagged: auditResults.value.filter((a) => a.result === 'FLAG').length
  }))
  async function loadClaims(params = {}) {
    loading.value = true
    try {
      const data = await api.get('/erp/claims', { params })
      claims.value = data.items
      currentPage.value = 1
    } finally {
      loading.value = false
    }
  }
  async function runAudit(ids, progress) {
    progress?.({ processed: 0, total: ids.length, phase: 'rules' })
    const data = await api.post('/m2/audit', { claimIds: ids })
    progress?.({ processed: data.total, total: data.total, phase: 'done' })
    return data
  }
  function submitReview(claimId, payload) {
    return api.post('/m2/review', { claimId, ...payload })
  }
  function selectClaims(ids) {
    selectedIds.value = ids
  }
  return {
    claims,
    loading,
    currentPage,
    totalCount,
    auditResults,
    auditStatusMap,
    selectedIds,
    stats,
    loadClaims,
    runAudit,
    submitReview,
    selectClaims
  }
})
