import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import {
  ACTION_NAMES,
  BAD_CASES,
  BINARY_RUBRIC_ITEMS,
  demoContract,
  demoPreset,
  GATE_LABELS,
  INVARIANTS,
  LANGGRAPH_NODE_SPECS,
  PRESET_IDS,
  PROJECT_NAME,
  RUBRIC_CALIBRATION_VERSIONS,
  WORKBENCH_NAME,
  WORKSPACE_VIEWS,
  type GateStage
} from './state'

/**
 * 静态演示页位于 `public/`，浏览器运行时无法直接 import TS 模块。
 * 解决方案是唯一纯 JS 状态机 `machine.js` 由 `demo.js` 在两个 marker 之间逐字节内联，
 * 本测试保证两处副本一字不差，且 HTML 静态骨架与工程契约严格对齐。
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

  test('all files exist and contain zero UTF-8 replacement mojibake', () => {
    expect(existsSync(PAGE)).toBe(true)
    expect(existsSync(RUNTIME)).toBe(true)
    expect(existsSync(MACHINE)).toBe(true)
    expect(page).not.toContain('\uFFFD')
    expect(runtime).not.toContain('\uFFFD')
    expect(machine).not.toContain('\uFFFD')
    expect(page).toContain('src="/projects/english-content-workbench/demo/demo.js"')
  })

  test('the runtime names and dispatches every action the reducer accepts', () => {
    for (const action of ACTION_NAMES) {
      expect(runtime).toContain(`'${action}'`)
    }
    for (const dispatched of [
      'view',
      'preset',
      'run',
      'approve',
      'reject',
      'extra-review',
      'anchor',
      'node',
      'trace',
      'rubric-ver',
      'rubric-next',
      'badcase',
      'resolve-badcase',
      'reset',
      'theme'
    ]) {
      expect(runtime).toContain(`case '${dispatched}':`)
    }
  })

  test('the runtime carries every invariant string and core state key', () => {
    for (const invariant of INVARIANTS) expect(runtime).toContain(invariant)
    for (const fragment of [
      'judgeScore',
      'rubricVerdicts',
      'evidenceQuote',
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

describe('the page renders the upgraded LangGraph observability & evaluation workbench', () => {
  test('uses the upgraded project name, demo title, and three-view workspace switcher', () => {
    expect(page).toContain('<title>英语教研内容生产工作台 · LangGraph 观测与评测闭环演示</title>')
    expect(page).toContain(PROJECT_NAME)
    expect(page).toContain(WORKBENCH_NAME)
    expect(page).toContain('返回项目总览')

    for (const view of WORKSPACE_VIEWS) {
      expect(page).toContain(`id="view-${view.id}"`)
      expect(runtime).toContain(view.label)
    }
  })

  test('covers all 6 core pillars across HTML landmarks and runtime', () => {
    // Three-gate rail + classic panels
    for (const stage of Object.keys(GATE_LABELS) as GateStage[]) {
      expect(runtime).toContain(GATE_LABELS[stage])
    }
    for (const landmark of [
      'LangGraph Workflow 节点级 Trace 观测链',
      '审题面板',
      '教材原文',
      '三关进度',
      '逐轮记录',
      '假通过校准',
      'Trace 成本',
      'Rubric 二元校准与人机一致迭代',
      'Bad Case 归因矩阵与黄金回归集飞轮回流'
    ]) {
      expect(page).toContain(landmark)
    }

    // Pillar A: 7 LangGraph nodes
    for (const node of LANGGRAPH_NODE_SPECS) {
      expect(runtime).toContain(node.id)
      expect(runtime).toContain(node.label)
    }

    // Pillar C & D: 6 Binary Rubrics (R1..R6) + 1/0/unknown badges
    for (const item of BINARY_RUBRIC_ITEMS) {
      expect(runtime).toContain(item.id)
      expect(runtime).toContain(item.title)
    }
    expect(page).toContain('.verdict-pill.v-1')
    expect(page).toContain('.verdict-pill.v-0')
    expect(page).toContain('.verdict-pill.v-unknown')

    // Pillar E: v1 -> v2 -> v3 calibration versions & 85%/90% thresholds
    for (const ver of RUBRIC_CALIBRATION_VERSIONS) {
      expect(runtime).toContain(ver.version)
      expect(runtime).toContain(ver.statusBadge)
    }
    expect(page).toContain('85%')
    expect(page).toContain('90%')
    expect(page).toContain('冷启动保护')

    // Pillar F: Bad Cases & regression suite counter
    for (const bc of BAD_CASES) {
      expect(runtime).toContain(bc.id)
      expect(runtime).toContain(bc.category)
    }
    expect(runtime).toContain('归因并回流回归集')
  })

  test('offers all three presets, <= 5 clicks to end, reset and theme controls', () => {
    const contract = demoContract()
    expect(contract.presets.map((p) => p.id)).toEqual([...PRESET_IDS])
    for (const preset of contract.presets) {
      expect(preset.clicksToEnd).toBeLessThanOrEqual(5)
      expect(demoPreset(preset.id as (typeof PRESET_IDS)[number]).label.length).toBeGreaterThan(0)
    }
    expect(runtime).toContain('次点击到终态')
    expect(page).toContain('data-act="reset"')
    expect(page).toContain('data-act="theme"')
  })

  test('is self-contained with Satoshi font, WCAG AA light accent, reduced-motion, and 2 script tags', () => {
    expect(page).toContain("font-family: 'Satoshi'")
    expect(page).toContain('--accent: hsl(200 32% 38%)')
    expect(page).toContain('--accent-fg: hsl(0 0% 99%)')
    expect(page).toContain('prefers-reduced-motion: reduce')
    expect(page).toContain('localStorage')
    expect(page).toContain("localStorage.getItem('theme')")
    expect(page).toContain("'english-demo-theme'")
    expect(page).toContain('data-theme')

    // Zero remote assets or CDN dependencies
    expect(page).not.toMatch(/<link[^>]+href=["']https?:/i)
    expect(page).not.toMatch(/<script[^>]+src=["']https?:/i)
    expect(page).not.toMatch(/src=["']https?:\/\//i)
    expect(page).not.toContain('@import url(')
    expect(page).not.toMatch(/fonts\.googleapis\.com|cdn\.jsdelivr\.net|unpkg\.com/i)

    // Strictly 2 <script> tags: inline head theme initializer + module runtime
    expect(page.match(/<script\b/g)?.length).toBe(2)
  })

  test('keeps markup free of dev annotations and ungenerated UnoCSS classes', () => {
    expect(page).not.toMatch(/class="notes/)
    expect(page).not.toMatch(/这版改了什么/)

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
