import { describe, expect, test } from 'bun:test'

import { createDemoApi } from '../api'
import { createDemoState } from './state'

// These scenarios use the same local boundary as the Vue views.
describe('finance workbench session', () => {
  test('audit, filter and human review keep machine advice and ERP state independent', async () => {
    const api = createDemoApi(createDemoState())
    const initial = await api.get('/erp/claims')
    expect(initial.items).toHaveLength(6)
    await api.post('/m2/audit', { claimIds: initial.items.map((c) => c.id) })
    const rejected = await api.get('/erp/claims', { params: { status: 'REJECT' } })
    const flagged = await api.get('/erp/claims', { params: { status: 'FLAG' } })
    expect(rejected.items.map((c) => c.id)).toEqual([
      'DEMO-0001',
      'DEMO-0002',
      'DEMO-0004',
      'DEMO-0006'
    ])
    expect(flagged.items.map((c) => c.id)).toEqual(['DEMO-0003', 'DEMO-0005'])
    await api.post('/m2/review', {
      claimId: 'DEMO-0001',
      decision: 'APPROVE',
      comment: '人工确认样例'
    })
    const status = await api.get('/m2/status')
    expect(status.status['DEMO-0001'].result).toBe('REJECT')
    expect(status.status['DEMO-0001'].reviews[0].decision).toBe('APPROVE')
    expect(status.status['DEMO-0001'].writtenBack).toBe(false)
    expect((await api.get('/erp/claims/DEMO-0001')).status).toBe('PENDING')
    const fresh = createDemoApi(createDemoState())
    expect((await fresh.get('/m2/status')).results).toHaveLength(0)
  })

  test('OCR edits survive navigation but cannot invent an attachment', async () => {
    const api = createDemoApi(createDemoState())
    const before = await api.get('/erp/claims/DEMO-0002/ocr-fields')
    const fields = { ...before.fields['demo-att-002'], vendor: '人工校对的合成商户' }
    await api.put('/m2/ocr/demo-inv-002', { edit: { fields, verified: true } })
    await api.get('/erp/claims/DEMO-0001')
    expect((await api.get('/erp/claims/DEMO-0002/ocr-fields')).fields['demo-att-002'].vendor).toBe(
      '人工校对的合成商户'
    )
    expect((await api.get('/erp/claims/DEMO-0005/ocr-fields')).fields).toEqual({})
    await expect(
      api.put('/m2/ocr/demo-inv-005', { edit: { fields, verified: true } })
    ).rejects.toThrow()
    const fresh = createDemoApi(createDemoState())
    expect(
      (await fresh.get('/erp/claims/DEMO-0002/ocr-fields')).fields['demo-att-002'].vendor
    ).not.toBe('人工校对的合成商户')
  })

  test('settings affect later simulations and AI outcomes stay preset', async () => {
    const api = createDemoApi(createDemoState())
    await api.put('/settings/llm-review', { enabled: false })
    const disabled = await api.post('/m2/audit', { claimIds: ['DEMO-0003'] })
    expect(disabled.results[0].aiReview).toBeNull()
    await expect(api.post('/m3/ai-review')).rejects.toThrow()
    await api.put('/settings/llm-review', { enabled: true })
    const enabled = await api.post('/m2/audit', { claimIds: ['DEMO-0003'] })
    expect(enabled.results[0].result).toBe('FLAG')
    expect(enabled.results[0].aiReview.result).toBe('APPROVE')
    // Inspecting and recording a decision must not turn the investigation into an ERP action.
    await api.post('/m2/audit', { claimIds: ['DEMO-0005'] })
    const status = await api.get('/m2/status')
    expect((await api.get('/erp/claims/DEMO-0005/ocr-fields')).fields).toEqual({})
    await api.post('/m2/review', {
      claimId: 'DEMO-0003',
      decision: 'APPROVE',
      comment: '演示人工接管'
    })
    const afterReview = (await api.get('/m2/status')).status['DEMO-0003']
    expect(afterReview.result).toBe('FLAG')
    expect(afterReview.aiReview.investigation).toEqual(
      status.status['DEMO-0003'].aiReview.investigation
    )
    expect((await api.get('/erp/claims/DEMO-0003')).status).toBe('PENDING')
    const scan = await api.post('/m3/scan')
    expect(scan.duplicateInvoices).toHaveLength(1)
    const review = await api.post('/m3/ai-review')
    expect(new Set(Object.values(review.results).map((r) => r.verdict))).toEqual(
      new Set(['CONFIRM', 'DOUBT', 'FALSE_ALARM'])
    )
    expect(await api.get('/m3/ai-review-results')).toEqual(review)
    expect((await api.post('/m3/ai-scan')).totalInvoices).toBe(6)
  })

  test('reconciliation excludes the debit and fails closed on unsupported operations', async () => {
    const api = createDemoApi(createDemoState())
    const result = await api.post('/m4/reconcile')
    expect(result.matches.map((m) => m.txnId)).toEqual(['DEMO-TXN-001'])
    expect(result.unidentified.map((m) => m.txnId)).toEqual(['DEMO-TXN-002'])
    expect(result.skipped).toEqual(['DEMO-TXN-003'])
    expect(result.statistics.matchedRate).toBe(0.5)
    await expect(api.get('/not-supported')).rejects.toThrow()
    await expect(api.post('/m2/audit', { claimIds: ['REAL-0001'] })).rejects.toThrow()
    await expect(api.post('/erp/write-back')).rejects.toThrow()
    expect((await api.get('/m2/status')).results).toHaveLength(0)
  })
})
