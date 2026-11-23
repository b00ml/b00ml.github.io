import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import {
  ACTION_NAMES,
  demoContract,
  demoPreset,
  GATE_LABELS,
  INVARIANTS,
  PRESET_IDS,
  type GateStage
} from './state'

/**
 * The demo page is a static asset under `public/`, so it cannot import the
 * state machine at runtime. The remedy is a single plain-JS implementation
 * (`machine.js`) that the page's runtime **inlines verbatim**, with `state.ts`
 * adding the types on top. This test is what makes that honest: it compares the
 * shipped copy to the module byte for byte, so the rules the browser runs and
 * the rules the unit tests pin cannot drift apart.
 *
 * Re-sync after editing `machine.js` with:
 *   bun scripts/sync-english-demo.mjs
 */
const ROOT = join(import.meta.dir, '..', '..', '..', '..')
const PAGE = join(ROOT, 'public/projects/english-content-workbench/demo/index.html')
const RUNTIME = join(ROOT, 'public/projects/english-content-workbench/demo/demo.js')
const MACHINE = join(ROOT, 'src/lib/demo/english/machine.js')
const BEGIN = '/* __ENGLISH_MACHINE_BEGIN__ */'
const END = '/* __ENGLISH_MACHINE_END__ */'

const page = readFileSync(PAGE, 'utf8')
const runtime = readFileSync(RUNTIME, 'utf8')
const machine = readFileSync(MACHINE, 'utf8')

function inlined(): string {
  const start = runtime.indexOf(BEGIN)
  const end = runtime.indexOf(END)
  if (start === -1 || end === -1) throw new Error('machine markers are missing from demo.js')
  return runtime.slice(start + BEGIN.length, end)
}

describe('shipped runtime mirrors the authoritative state machine', () => {
  test('the inlined copy is byte-identical to src/lib/demo/english/machine.js', () => {
    expect(inlined().trim()).toBe(machine.trim())
  })

  test('both files exist where the site expects them', () => {
    expect(existsSync(PAGE)).toBe(true)
    expect(existsSync(RUNTIME)).toBe(true)
    expect(existsSync(MACHINE)).toBe(true)
    // The page loads its runtime as a sibling asset, not from a bundler.
    expect(page).toContain('src="./demo.js"')
  })

  test('the runtime names every action the reducer accepts', () => {
    expect([...ACTION_NAMES].length).toBeGreaterThan(0)
    for (const action of ACTION_NAMES) {
      // Declared once in the machine copy, dispatched once in the UI switch.
      expect(runtime).toContain(`'${action}'`)
    }
    for (const dispatched of ['preset', 'run', 'approve', 'reject', 'anchor', 'trace', 'reset', 'theme']) {
      expect(runtime).toContain(`case '${dispatched}':`)
    }
  })

  test('the runtime carries every invariant string the rules depend on', () => {
    for (const invariant of INVARIANTS) expect(runtime).toContain(invariant)
    for (const fragment of [
      'judgeScore',
      'tokensUsed',
      'thresholdMet',
      'falsePassCount',
      'totalReviewed',
      'is-active'
    ]) {
      expect(runtime).toContain(fragment)
    }
  })
})

describe('the page renders the three-gate workbench', () => {
  test('names the three gates and the calibration panel in Chinese', () => {
    // The gate rail is rendered from the machine, so the labels live in the
    // runtime; the panel titles are static markup.
    for (const stage of Object.keys(GATE_LABELS) as GateStage[]) {
      expect(runtime).toContain(GATE_LABELS[stage])
    }
    for (const label of ['审题面板', '教材原文', '三关进度', '逐轮记录', 'Trace 成本', '假通过校准']) {
      expect(page).toContain(label)
    }
    expect(page).toContain('返回项目总览')
  })

  test('offers all three presets, the type switch, reset and theme controls', () => {
    for (const id of PRESET_IDS) {
      expect(runtime).toContain(id)
      expect(demoPreset(id).label.length).toBeGreaterThan(0)
    }
    // Question-type switch, one preset per type.
    for (const type of ['cloze', 'reading', 'mcq']) expect(runtime).toContain(type)
    expect(runtime).toContain('data-act="preset"')
    expect(runtime).toContain('data-act="reset"')
    expect(page).toContain('data-act="reset"')
    expect(page).toContain('data-act="theme"')
  })

  test('each preset is a five-click story at most, and the page says how many', () => {
    const contract = demoContract()
    expect(contract.presets.map((preset) => preset.id)).toEqual([...PRESET_IDS])
    for (const preset of contract.presets) {
      expect(preset.clicksToEnd).toBeLessThanOrEqual(5)
      expect(preset.rounds.length).toBeGreaterThan(0)
      expect(preset.rounds.length).toBeLessThanOrEqual(4)
    }
    // The preset buttons print the count, so the claim is visible.
    expect(runtime).toContain('次点击到终态')
  })

  test('states the calibration thresholds it actually enforces', () => {
    const { thresholds } = demoContract()
    expect(runtime).toContain(`${thresholds.reviewedTarget}`)
    expect(runtime).toContain(`${thresholds.falsePassTarget}`)
    expect(runtime).toContain(`${thresholds.quality}`)
    expect(runtime).toContain('thresholdMet')
    expect(page).toContain('冷启动保护')
  })

  test('is a closed, dependency-free page with a reduced-motion fallback', () => {
    expect(page).toContain('prefers-reduced-motion')
    expect(page).toContain('localStorage')
    expect(page).toContain('data-theme')
    expect(page).toContain("'english-demo-theme'")
    // No site chrome, no framework, no CDN, no remote font.
    expect(page).not.toMatch(/<link[^>]+href=["']https?:/i)
    expect(page).not.toMatch(/<script[^>]+src=["']https?:/i)
    expect(page).not.toMatch(/src=["']https?:\/\//i)
    expect(page).not.toContain('@import url(')
    expect(page).not.toMatch(/fonts\.googleapis\.com|cdn\.jsdelivr\.net|unpkg\.com/i)
    // Exactly one script, the sibling runtime.
    expect(page.match(/<script\b/g)?.length).toBe(2)
  })

  test('has no dev-annotation panel and no class this site never generates', () => {
    expect(page).not.toMatch(/class="notes/)
    expect(page).not.toMatch(/这版改了什么/)

    // The page ships its own plain CSS, so `font-variant-numeric: tabular-nums`
    // would be legitimate there. What must never appear is a *class* this
    // site's UnoCSS preset cannot generate — the same guard
    // `src/site.config.test.ts` applies to `src/`, extended to this page.
    const markup = page.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
    for (const forbidden of [
      /class="[^"]*\bspace-[xy]-\d+\b/,
      /class="[^"]*\btabular-nums\b/,
      /class="[^"]*\bline-clamp-\d+\b/,
      /class="[^"]*text-red-500/,
      /class="[^"]*text-bgColor/
    ]) {
      expect(markup).not.toMatch(forbidden)
    }
  })
})