#!/usr/bin/env node
/**
 * Copies the authoritative state machine into the static demo page.
 *
 * The page at `public/projects/ark-workbench/demo/index.html` is a static asset,
 * so it cannot import `src/lib/demo/ark/machine.js` at runtime. It inlines that
 * file between two marker comments instead; this script rewrites the region and
 * `src/lib/demo/ark/mirror.test.ts` fails if the two ever differ.
 *
 * Usage: bun scripts/sync-ark-demo.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PAGE = resolve('public/projects/ark-workbench/demo/index.html')
const MACHINE = resolve('src/lib/demo/ark/machine.js')
const BEGIN = '/* __ARK_MACHINE_BEGIN__ */'
const END = '/* __ARK_MACHINE_END__ */'

const machine = readFileSync(MACHINE, 'utf8').trim()
const page = readFileSync(PAGE, 'utf8')

const start = page.indexOf(BEGIN)
const end = page.indexOf(END)
if (start === -1 || end === -1) {
  console.error(`sync-ark-demo: markers ${BEGIN} / ${END} not found in ${PAGE}`)
  process.exit(1)
}

const next = `${page.slice(0, start + BEGIN.length)}\n${machine}\n${page.slice(end)}`
if (next === page) {
  console.log('sync-ark-demo: already in sync')
  process.exit(0)
}

writeFileSync(PAGE, next)
console.log(`sync-ark-demo: wrote ${machine.length} bytes of machine.js into ${PAGE}`)
