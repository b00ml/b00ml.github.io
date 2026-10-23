import {
  auditFixture,
  claims,
  company,
  m3Fixture,
  m3ReviewFixture,
  m3ScanFixture,
  m4Fixture,
  ocrFixtures,
  type OcrEdit
} from '../demo/fixtures'
import { demoState, type DemoState } from '../demo/state'

interface Query {
  params?: { status?: string }
}
interface Payload {
  claimIds?: string[]
  claimId?: string
  decision?: string
  comment?: string
  enabled?: boolean
  ocrEngine?: string
  edit?: OcrEdit
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))

// Fixed, in-memory operations. Unknown paths fail here; no transport or fallback exists.
export function createDemoApi(state: DemoState) {
  async function request(method: string, path: string, body: Payload = {}, query: Query = {}) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    const detail = path.match(/^\/erp\/claims\/(DEMO-\d+)(\/ocr-fields)?$/)
    if (method === 'GET' && path === '/erp/claims') {
      const status = query.params?.status
      const items = claims.filter(
        (c) =>
          !status ||
          status === 'ALL' ||
          (status === 'PENDING' ? !state.audits[c.id] : state.audits[c.id]?.result === status)
      )
      return copy({ items, hasMore: false, nextCursor: null })
    }
    if (method === 'GET' && detail) {
      const claim = claims.find((c) => c.id === detail[1])
      if (!claim) throw new Error('未找到该演示单据，请返回列表选择')
      if (detail[2])
        return copy({
          companyName: company.name,
          companyTaxNo: company.taxNo,
          fields: Object.fromEntries(
            claim.lines
              .filter((l) => l.attachment)
              .map((l) => [
                l.attachment!.id,
                state.ocrEdits[l.invoice.id]?.fields || ocrFixtures[l.invoice.id]
              ])
          )
        })
      return copy(claim)
    }
    if (method === 'GET' && path === '/m2/status')
      return copy({
        status: Object.fromEntries(
          Object.entries(state.audits).map(([id, a]) => [
            id,
            { ...a, writtenBack: false, reviews: state.reviews[id] || [] }
          ])
        ),
        results: Object.values(state.audits)
      })
    if (method === 'POST' && path === '/m2/audit') {
      const ids = [...new Set(body.claimIds || [])]
      if (!ids.length || ids.some((id) => !claims.some((c) => c.id === id)))
        throw new Error('请选择有效演示单据')
      for (const id of ids) state.audits[id] = auditFixture(id, state.settings.enabled)
      return copy({ results: ids.map((id) => state.audits[id]), total: ids.length })
    }
    if (method === 'POST' && path === '/m2/review') {
      const id = body.claimId || ''
      if (
        !claims.some((c) => c.id === id) ||
        !['APPROVE', 'REJECT', 'FLAG'].includes(body.decision || '')
      ) {
        throw new Error('无效的演示复核决定')
      }
      const review = {
        decision: body.decision!,
        comment: body.comment?.trim() || '',
        createdAt: new Date().toLocaleString('zh-CN')
      }
      state.reviews[id] = [...(state.reviews[id] || []), review]
      return copy(review)
    }
    if (method === 'PUT' && path.startsWith('/m2/ocr/')) {
      const id = path.slice('/m2/ocr/'.length)
      if (!ocrFixtures[id] || !body.edit) throw new Error('该费用行没有可编辑的票面 OCR')
      state.ocrEdits[id] = copy(body.edit)
      return copy(body.edit)
    }
    if (method === 'POST' && path === '/m3/scan') {
      state.m3 = copy(m3Fixture)
      return copy(state.m3)
    }
    if (method === 'POST' && ['/m3/ai-review', '/m3/ai-scan'].includes(path)) {
      if (!state.settings.enabled) throw new Error('预设 AI 演示已关闭，请在系统设置开启')
      if (path === '/m3/ai-review') {
        state.m3Review = copy(m3ReviewFixture)
        return copy(state.m3Review)
      }
      state.m3Scan = copy(m3ScanFixture)
      return copy(state.m3Scan)
    }
    if (method === 'GET' && path === '/m3/ai-review-results') return copy(state.m3Review)
    if (method === 'GET' && path === '/m3/ai-scan-results') return copy(state.m3Scan)
    if (method === 'POST' && path === '/m4/reconcile') {
      state.m4 = copy(m4Fixture)
      return copy(state.m4)
    }
    if (path === '/settings/llm-review' && ['GET', 'PUT'].includes(method)) {
      if (method === 'PUT') state.settings.enabled = !!body.enabled
      return copy(state.settings)
    }
    if (method === 'PUT' && path === '/settings/ocr') {
      if (!['paddle', 'qwen'].includes(body.ocrEngine || '')) throw new Error('无效的演示引擎')
      state.settings.ocrEngine = body.ocrEngine!
      return copy(state.settings)
    }
    throw new Error(`演示不支持此操作：${method} ${path}`)
  }
  return {
    get: (path: string, query?: Query) => request('GET', path, {}, query),
    post: (path: string, body?: Payload) => request('POST', path, body),
    put: (path: string, body?: Payload) => request('PUT', path, body)
  }
}
export default createDemoApi(demoState)
