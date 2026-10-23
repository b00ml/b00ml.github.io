import { investigations } from './agent'
import rawClaims from './fixtures/claims.json'
import expected from './fixtures/expected_results.json'

export const company = { name: '示例制造有限公司', taxNo: '91320594MA1TEST001' }
export const expenseLabels: Record<string, string> = {
  HOTEL: '住宿费',
  MEAL: '伙食费',
  CITY_TRANSPORT: '市内交通',
  LONG_TRANSPORT: '长途交通',
  TAXI: '出租车'
}
export const claims = rawClaims.map((c) => ({
  ...c,
  totalFen: c.lines.reduce((sum, line) => sum + line.amountFen, 0),
  totalAmountFen: c.lines.reduce((sum, line) => sum + line.amountFen, 0),
  department: c.departmentName,
  submittedAt: '2026-06-06T09:30:00',
  claimType: c.claimType === 'TRAVEL' ? '差旅报销' : '日常报销'
}))
export const invoices = claims.flatMap((c) =>
  c.lines.map((line) => ({
    ...line.invoice,
    claimId: c.id,
    claimNo: c.claimNo,
    lineNo: line.lineNo,
    buyerName: line.invoice.buyer.name,
    buyerTaxNo: line.invoice.buyer.taxNo,
    sellerName: line.invoice.seller.name,
    attachmentId: line.attachment?.id ?? null,
    migrated: !!line.attachment,
    category: expenseLabels[line.expenseType] || line.expenseType
  }))
)

export type OcrFields = Record<string, string>
export const ocrFixtures: Record<string, OcrFields> = Object.fromEntries(
  invoices
    .filter((inv) => inv.attachmentId)
    .map((inv) => [
      inv.id,
      {
        buyerName: inv.buyerName,
        buyerTaxNo: inv.buyerTaxNo,
        vendor: inv.sellerName,
        amount: (inv.totalFen / 100).toFixed(2),
        date: inv.issuedOn,
        code: `${inv.invoiceCode} / ${inv.invoiceNo}`,
        category: inv.category
      }
    ])
)
// A deliberately explicit, synthetic OCR transcription difference for the comparison UI.
ocrFixtures['demo-inv-002'].buyerName = company.name

const evidence: Record<string, { violations: string[]; reasons: string[] }> = {
  'DEMO-0001': {
    violations: ['DUPLICATE_INVOICE'],
    reasons: [
      '与 DEMO-0006 使用相同发票代码和号码，重复报销。住宿 700 元 / 2 晚未超过 400 元 / 晚上限。'
    ]
  },
  'DEMO-0002': {
    violations: ['OVER_STANDARD_MEAL', 'INVOICE_TITLE_MISMATCH'],
    reasons: [
      '伙食金额 230 元超过本例两天 140 元上限。',
      '系统录入购方为分公司，与报销主体不同，需核实。'
    ]
  },
  'DEMO-0003': { violations: [], reasons: ['样例市不在标准城市表中，缺少适用标准，需人工确认。'] },
  'DEMO-0004': {
    violations: ['OVER_STANDARD_TRANSPORT_CLASS'],
    reasons: ['普通员工高铁商务座超出二等座标准，未提供特批。']
  },
  'DEMO-0005': {
    violations: ['MISSING_ATTACHMENT'],
    reasons: ['办公打车缺少票据附件，保持存疑，不编造 OCR 结果。']
  },
  'DEMO-0006': {
    violations: ['DUPLICATE_INVOICE'],
    reasons: ['与 DEMO-0001 发票代码和号码相同，虽金额不同仍需退回核实。']
  }
}
export function auditFixture(claimId: string, aiEnabled: boolean) {
  const item = evidence[claimId]
  if (!item) throw new Error('不存在的演示单据')
  const result = expected.M2[claimId as keyof typeof expected.M2]
  return {
    claimId,
    result,
    ...structuredClone(item),
    decisionStrength: 0.95,
    aiReview: aiEnabled
      ? {
          result: claimId === 'DEMO-0003' ? 'APPROVE' : result,
          agreeWithRules: claimId !== 'DEMO-0003',
          confidence: 0.9,
          reasons: [
            claimId === 'DEMO-0003'
              ? '【预设 AI 意见】金额仅 10 元，倾向通过。这是本例需要进一步核实的初始意见。'
              : '【预设 AI 意见】结合本例票据和制度条款，支持规则意见。'
          ],
          investigation: investigations[claimId] ? structuredClone(investigations[claimId]) : null
        }
      : null
  }
}
export type AuditResult = ReturnType<typeof auditFixture>
export type HumanReview = { decision: string; comment: string; createdAt: string }
export type OcrEdit = { fields: OcrFields; verified: boolean }

const duplicate = {
  invoiceCode: invoices[0].invoiceCode,
  invoiceNo: invoices[0].invoiceNo,
  claimIds: ['DEMO-0001', 'DEMO-0006'],
  invoices: [invoices[0], invoices[5]],
  suspected: false,
  basis: '同一发票代码和号码用于两张单据；金额不同仍应人工核实。'
}
export const m3Fixture = {
  duplicateInvoices: [duplicate],
  invoiceIssues: [
    {
      issue: 'TITLE_WRONG',
      invoiceId: invoices[1].id,
      invoice: invoices[1],
      basis: '系统购方为分公司，非本例报销主体；票面/OCR 存在差异，需要核对。'
    },
    {
      issue: 'TAX_RATE_WRONG',
      invoiceId: invoices[1].id,
      invoice: invoices[1],
      basis: 'HOTEL 票种税率 13%，与本例服务费税率标准 6% 不一致。'
    },
    {
      issue: 'CONSECUTIVE_NO',
      invoiceId: invoices[4].id,
      invoice: invoices[4],
      basis: '【补充合成场景】仅凭样例号码连续提出疑似连号，供展示 AI 误报复核。'
    }
  ],
  supplierProfiles: [
    {
      sellerName: invoices[0].sellerName,
      invoiceCount: 2,
      lowRatio: 0,
      consecutiveRuns: 0,
      invoices: [invoices[0], invoices[5]],
      basis: '【补充合成画像】同一销方出现重复票号，仅展示核查线索，不构成虚开定性。'
    }
  ]
}
export const m3ReviewFixture = {
  results: {
    [`duplicate:${duplicate.invoiceCode}/${duplicate.invoiceNo}`]: {
      verdict: 'CONFIRM',
      reason: '【预设】同码同号出现在两张单据中，确认重复线索。'
    },
    [`issue:TITLE_WRONG:${invoices[1].id}`]: {
      verdict: 'DOUBT',
      reason: '【预设】分公司关系和系统录入与 OCR 差异尚未核实，存疑待人工。'
    },
    [`issue:TAX_RATE_WRONG:${invoices[1].id}`]: {
      verdict: 'CONFIRM',
      reason: '【预设】本例票种税率不符合合成制度，确认需核实。'
    },
    [`issue:CONSECUTIVE_NO:${invoices[4].id}`]: {
      verdict: 'FALSE_ALARM',
      reason: '【预设】不同销方的演示号码连续不能证明连号开票，判为误报。'
    }
  }
}
export const m3ScanFixture = {
  batchCount: 1,
  totalInvoices: invoices.length,
  flaggedCount: 2,
  flagged: [
    {
      type: 'DUPLICATE',
      invoiceId: invoices[5].id,
      invoice: invoices[5],
      confidence: 0.96,
      reason: '【预设巡检】同码同号的不同金额票据，需人工核对。'
    },
    {
      type: 'TITLE_WRONG',
      invoiceId: invoices[1].id,
      invoice: invoices[1],
      confidence: 0.8,
      reason: '【预设巡检】购方记录与公司主体不一致。'
    }
  ]
}
export const bankRows = [
  {
    txnId: 'DEMO-TXN-001',
    date: '2026-06-01',
    direction: '贷方',
    amount: 1200,
    customer: '示例客户甲有限公司'
  },
  {
    txnId: 'DEMO-TXN-002',
    date: '2026-06-02',
    direction: '贷方',
    amount: 999,
    customer: '不存在的客户'
  },
  {
    txnId: 'DEMO-TXN-003',
    date: '2026-06-03',
    direction: '借方',
    amount: 300,
    customer: '示例客户乙有限公司'
  }
]
// Supplemental synthetic receivable; amount/counterparty line up with the original bank fixture.
export const receivables = [{ id: 'DEMO-AR-001', customer: '示例客户甲有限公司', amount: 1200 }]
export const m4Fixture = {
  matches: [
    {
      txnId: 'DEMO-TXN-001',
      receivableIds: ['DEMO-AR-001'],
      note: '客户全称唯一匹配，到账 1,200 元 = 应收 1,200 元'
    }
  ],
  unidentified: [{ txnId: 'DEMO-TXN-002', reason: '客户未识别：不存在的客户，999 元待人工认领' }],
  skipped: ['DEMO-TXN-003'],
  statistics: {
    matchedRate: 0.5,
    unidentifiedByReason: [{ category: 'customer_unknown', label: '客户未识别', count: 1 }]
  }
}
