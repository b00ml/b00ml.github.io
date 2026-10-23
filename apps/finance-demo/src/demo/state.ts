import { reactive } from 'vue'

import type { AuditResult, HumanReview, OcrEdit } from './fixtures'
import { m3Fixture, m3ReviewFixture, m3ScanFixture, m4Fixture } from './fixtures'

export function createDemoState() {
  return reactive({
    settings: { enabled: true, model: '预设 AI 演示', keyConfigured: true, ocrEngine: 'paddle' },
    audits: {} as Record<string, AuditResult>,
    reviews: {} as Record<string, HumanReview[]>,
    ocrEdits: {} as Record<string, OcrEdit>,
    m3: null as typeof m3Fixture | null,
    m3Review: null as typeof m3ReviewFixture | null,
    m3Scan: null as typeof m3ScanFixture | null,
    m4: null as typeof m4Fixture | null
  })
}
// The only lifetime is this document. Reloading creates a fresh state.
export const demoState = createDemoState()
export type DemoState = ReturnType<typeof createDemoState>
