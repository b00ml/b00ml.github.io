#!/usr/bin/env node
/**
 * Copies the authoritative state machine into the static demo runtime.
 *
 * The page at `public/projects/english-content-workbench/demo/` is a static
 * asset, so it cannot import `src/lib/demo/english/machine.js` at runtime. It
 * inlines that file between two marker comments in `demo.js` instead; this
 * script rewrites the region, and `src/lib/demo/english/mirror.test.ts` fails if
 * the two ever differ by a byte.
 *
 * Idempotent: running it twice reports `already in sync` the second time.
 *
 * Usage: bun scripts/sync-english-demo.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RUNTIME = resolve('public/projects/english-content-workbench/demo/demo.js')
const MACHINE = resolve('src/lib/demo/english/machine.js')
const BEGIN = '/* __ENGLISH_MACHINE_BEGIN__ */'
const END = '/* __ENGLISH_MACHINE_END__ */'

const machine = readFileSync(MACHINE, 'utf8').trim()
const runtime = readFileSync(RUNTIME, 'utf8')

const start = runtime.indexOf(BEGIN)
const end = runtime.indexOf(END)
if (start === -1 || end === -1) {
  console.error(`sync-english-demo: markers ${BEGIN} / ${END} not found in ${RUNTIME}`)
  process.exit(1)
}

const next = `${runtime.slice(0, start + BEGIN.length)}\n${machine}\n${runtime.slice(end)}`
if (next === runtime) {
  console.log('sync-english-demo: already in sync')
  process.exit(0)
}

writeFileSync(RUNTIME, next)
console.log(`sync-english-demo: wrote ${machine.length} bytes of machine.js into ${RUNTIME}`)