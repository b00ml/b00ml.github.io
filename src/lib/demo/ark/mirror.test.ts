import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'

import {
  ARK_ACTION_TYPES,
  ARK_CHANNELS,
  ARK_SCENARIO_META,
  ARK_SIDEBAR_TABS,
  ARK_WORKSPACE_TABS,
  MEMORY_INFERRED_PREFIX
} from './state'

/**
 * The demo page is a static asset under `public/`, so it cannot import the
 * TypeScript state machine at runtime. The chosen remedy is a single plain-JS
 * implementation (`machine.js`) that the page inlines **verbatim**, with
 * `state.ts` adding the types on top. This test is what makes that honest: it
 * compares the page body to the module byte for byte, so the rules the browser
 * runs and the rules the unit tests pin cannot drift apart.
 *
 * Re-sync after editing `machine.js` with:
 *   bun scripts/sync-ark-demo.mjs
 */
const PAGE = resolve('public/projects/ark-workbench/demo/index.html')
const MACHINE = resolve('src/lib/demo/ark/machine.js')
const BEGIN = '/* __ARK_MACHINE_BEGIN__ */'
const END = '/* __ARK_MACHINE_END__ */'

const page = readFileSync(PAGE, 'utf8')
const machine = readFileSync(MACHINE, 'utf8')

function inlined(): string {
  const start = page.indexOf(BEGIN)
  const end = page.indexOf(END)
  if (start === -1 || end === -1) throw new Error('machine markers are missing from the demo page')
  return page.slice(start + BEGIN.length, end)
}

describe('demo page mirrors the authoritative state machine', () => {
  test('the inlined copy is byte-identical to src/lib/demo/ark/machine.js', () => {
    expect(inlined().trim()).toBe(machine.trim())
  })

  test('the page names every action the reducer accepts', () => {
    for (const action of ARK_ACTION_TYPES) expect(page).toContain(action)
  })

  test('the page carries every invariant string for memory, V7 tasks workbench, and product switcher', () => {
    for (const fragment of [
      MEMORY_INFERRED_PREFIX,
      'pendingConflicts',
      'baseRev',
      '已撤销',
      '插件 context.md（今日到期）',
      '搜索看板任务…',
      '现算 · 不产生文件',
      '回顾筛选：',
      '生成周报',
      '生成月报',
      '生成年报',
      '精力流向',
      '/projects/ark-workbench/product/',
      '切换看「产品概念页」版'
    ]) {
      expect(page).toContain(fragment)
    }
  })

  test('every channel card is labelled with its real evidence grade', () => {
    const graded = page.slice(page.indexOf(BEGIN), page.indexOf(END))
    expect(graded).toContain('已完成实机验收')
    expect(graded).toContain('标准 MCP 协议扩展接入')

    // astrbot-qq passed real-machine acceptance; agentmail remains mcp-extension.
    const qq = ARK_CHANNELS.find((item) => item.host === 'astrbot-qq')
    const mail = ARK_CHANNELS.find((item) => item.host === 'agentmail')
    expect(qq?.grade).toBe('verified')
    expect(mail?.grade).toBe('mcp-extension')

    // Honest grading: any MCP-extension channel must never read as accepted.
    for (const channel of ARK_CHANNELS.filter((item) => item.grade === 'mcp-extension')) {
      const block = graded.slice(graded.indexOf(`host: '${channel.host}'`))
      const card = block.slice(0, block.indexOf('actions:'))
      expect(card).not.toMatch(/已验收|验收通过|已完成实机/)
    }
  })

  test('the two evidence grades are visually distinct: verified green, extension amber', () => {
    expect(page).toMatch(/\.grade\.verified\s*\{[^}]*var\(--ok\)/)
    expect(page).toMatch(/\.grade\.mcp\s*\{[^}]*var\(--warn\)/)
    const amber = page.match(/--warn:\s*(#[0-9a-f]{6})/i)?.[1]
    const green = page.match(/--ok:\s*(#[0-9a-f]{6})/i)?.[1]
    expect(amber).toBeDefined()
    expect(green).toBeDefined()
    expect(amber).not.toBe(green)
  })

  test('all eight panels, three scenarios and the reset control are reachable', () => {
    for (const tab of [...ARK_WORKSPACE_TABS, ...ARK_SIDEBAR_TABS]) expect(page).toContain(tab)
    for (const scenario of ARK_SCENARIO_META) {
      expect(page).toContain(scenario.id)
      expect(page).toContain(scenario.label)
    }
    expect(page).toContain('data-act="reset"')
    expect(page).toContain('data-act="theme"')
  })

  test('is a closed, dependency-free page with a reduced-motion fallback and zero mojibake', () => {
    expect(page).toContain('prefers-reduced-motion')
    expect(page).toContain('localStorage')
    expect(page).toContain('data-theme')
    expect(page).not.toContain('\uFFFD')
    expect(machine).not.toContain('\uFFFD')
    // No site chrome, no framework, no CDN.
    expect(page).not.toMatch(/<script[^>]+src=/i)
    expect(page).not.toMatch(/<link[^>]+href=["']https?:/i)
    expect(page).not.toMatch(/src=["']https?:\/\//i)
    expect(page).not.toContain('@import url(')
    // The prototype's dev-annotation panel must not survive the port.
    expect(page).not.toContain('class="notes')
    expect(page).not.toMatch(/这版改了什么/)
  })

  test('keeps the page free of class rules this site never generates', () => {
    const markup = page.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
    for (const forbidden of [
      /class="[^"]*\bspace-[xy]-\d+\b/,
      /class="[^"]*\btabular-nums\b/,
      /class="[^"]*\bline-clamp-\d+\b/
    ]) {
      expect(markup).not.toMatch(forbidden)
    }
    expect(markup).not.toContain('space-y-')
    expect(markup).not.toMatch(/class="[^"]*text-red-500/)
    expect(markup).not.toMatch(/class="[^"]*text-bgColor/)
  })
})
