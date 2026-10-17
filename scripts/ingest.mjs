import { main } from '../src/lib/ingest/runtime.ts'

process.exitCode = main(process.argv.slice(2))
