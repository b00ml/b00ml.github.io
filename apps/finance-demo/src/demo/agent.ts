// Synthetic transcripts illustrate the POC contract; no tools or models execute here.
export const agentTools = [
  ['query_travel_standards', '查询职级与城市档次对应的差旅标准'],
  ['search_policy_kb', '检索制度条款，返回可引用的出处'],
  ['get_approval_records', '读取审批记录，核对是否存在特批'],
  ['get_invoice_ocr', '读取已有票面字段，不补造缺失附件'],
  ['check_invoice_ledger', '检查发票代码、号码及跨单使用记录']
]

export interface Investigation {
  conclusion: string
  summary: string
  story: { title: string; question: string; decision: string; handoff: string }
  transcript: {
    call_id: string
    tool: string
    purpose: string
    label: string
    finding: string
    args: Record<string, unknown>
    output: unknown
  }[]
  evidence: {
    tool: string
    finding: string
    ref: string
    call_id: string
    source_id: string
    field_path: string
    grounded: boolean
  }[]
}

export const investigations: Record<string, Investigation> = {
  'DEMO-0003': {
    conclusion: 'support_flag',
    summary: '【预设调查】金额小不能替代合规依据；未取得样例市适用标准，保留 FLAG。',
    story: {
      title: '10 元交通费，为什么还要人工确认？',
      question:
        '员工在“样例市”报销市内交通费。规则找不到当地标准，AI 却因金额小而倾向通过。两边意见不同，需要继续查证。',
      decision: '暂不能确认合规，保留存疑',
      handoff: '财务需要确认“样例市”适用的交通费标准，再决定这张单据能否通过。'
    },
    transcript: [
      {
        call_id: 'demo-call-003-policy',
        tool: 'search_policy_kb',
        purpose: '寻找城市交通标准及规则与 AI 分歧的处理条款',
        label: '查制度：有没有这个城市的报销标准？',
        finding: '找到了“意见不一致交人工复核”的条款，但没有找到“样例市”的适用交通费标准。',
        args: { query: '样例市 市内交通 标准 分歧', top_k: 5 },
        output: {
          clauses: [
            {
              id: 'demo-policy-disagreement',
              doc: '合成制度样例',
              article: '分歧处理',
              content: '规则与 AI 复核意见不一致时只能进入 FLAG，不能自动放行。'
            }
          ]
        }
      },
      {
        call_id: 'demo-call-003-ocr',
        tool: 'get_invoice_ocr',
        purpose: '核对票面金额；票面存在仍不能补齐城市标准',
        label: '看票面：报销的 10 元是否有票据依据？',
        finding:
          '合成票面金额为 10 元，与报销金额一致。金额对得上，但这不能证明它符合当地报销标准。',
        args: { attachment_id: 'demo-att-003' },
        output: { found: true, fields: { invoiceNo: 'DEMO-NO-003', amount: '10.00' } }
      }
    ],
    evidence: [
      {
        tool: 'search_policy_kb',
        finding: '分歧条款支持保留人工复核。',
        ref: '合成制度样例 · 分歧处理',
        call_id: 'demo-call-003-policy',
        source_id: 'demo-policy-disagreement',
        field_path: 'clauses[0].content',
        grounded: true
      },
      {
        tool: 'search_policy_kb',
        finding: '【拦截示例】声称已找到样例市交通标准，但返回中无此条款，不采纳。',
        ref: '不存在的城市标准引用',
        call_id: 'demo-call-003-policy',
        source_id: 'demo-policy-city-transport',
        field_path: 'clauses[1].content',
        grounded: false
      }
    ]
  },
  'DEMO-0005': {
    conclusion: 'support_flag',
    summary: '【预设调查】无票据附件，也无审批记录可供进一步核实，交由财务补证。',
    story: {
      title: '36 元打车缺票，Agent 能帮财务查什么？',
      question:
        '员工只提交了遗失票据说明，没有票据附件。规则和 AI 都保留存疑，Agent 继续查审批与制度，明确还需要补什么。',
      decision: '票据依据仍然不足，交人工补证',
      handoff:
        '财务需要联系报销人补充票据或其他可核实材料，再作决定。系统不会根据文字说明编造票面。'
    },
    transcript: [
      {
        call_id: 'demo-call-005-approvals',
        tool: 'get_approval_records',
        purpose: '核对是否有可用于核实缺票情况的审批记录',
        label: '查审批：有没有可供核实的记录？',
        finding: '本例没有审批记录，无法从审批中补充核实缺票情况；这不等于另外认定一项违规。',
        args: { claim_id: 'DEMO-0005' },
        output: []
      },
      {
        call_id: 'demo-call-005-policy',
        tool: 'search_policy_kb',
        purpose: '查找缺票情况下的补证要求',
        label: '查制度：缺票应该怎么处理？',
        finding: '补充合成制度要求交由人工补证，不能凭“遗失票据”的描述生成票面或 OCR 结果。',
        args: { query: '遗失票据 附件 补证', top_k: 5 },
        output: {
          clauses: [
            {
              id: 'demo-policy-missing-attachment',
              doc: '补充合成制度',
              article: '缺票补证',
              content: '缺少票据附件时提交人工补证，不凭报销描述生成票面。'
            }
          ]
        }
      }
    ],
    evidence: [
      {
        tool: 'search_policy_kb',
        finding: '缺票补证条款要求人工核实；不生成虚构 OCR。',
        ref: '补充合成制度 · 缺票补证',
        call_id: 'demo-call-005-policy',
        source_id: 'demo-policy-missing-attachment',
        field_path: 'clauses[0].content',
        grounded: true
      }
    ]
  }
}
