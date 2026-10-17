import { expect, test } from 'bun:test'

import { evaluateDeploy, SLOW_DEPLOY_MS, STUCK_DEPLOY_MS, type RunSnapshot } from './deploy'

const T0 = Date.parse('2026-10-17T13:10:00Z')
const DEPLOY_STEP = 'Deploy to GitHub Pages'

function snapshot(startedAt: string, status = 'in_progress'): RunSnapshot {
  return {
    databaseId: 42,
    status,
    conclusion: null,
    attempt: 1,
    url: 'https://github.com/b00ml/b00ml.github.io/actions/runs/42',
    jobs: [
      { name: 'build', steps: [] },
      { name: 'deploy', steps: [{ name: DEPLOY_STEP, startedAt, status }] }
    ]
  }
}

function iso(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString()
}

test('a deploy step younger than five minutes is just running', () => {
  const verdict = evaluateDeploy(snapshot(iso(-60_000)), T0)
  expect(verdict).toEqual({ state: 'running', deployStartedAt: iso(-60_000), slow: false })
})

test('a deploy step over five minutes warns without giving up', () => {
  const verdict = evaluateDeploy(snapshot(iso(-SLOW_DEPLOY_MS - 1_000)), T0)
  expect(verdict).toMatchObject({ state: 'running', slow: true })
})

test('a deploy step over ten minutes is reported as stuck', () => {
  const verdict = evaluateDeploy(snapshot(iso(-STUCK_DEPLOY_MS - 1_000)), T0)
  expect(verdict).toEqual({ state: 'stuck', deployStartedAt: iso(-STUCK_DEPLOY_MS - 1_000) })
})

test('a completed run reports success with the deploy step start time', () => {
  const run = snapshot(iso(-30_000), 'completed')
  run.conclusion = 'success'
  expect(evaluateDeploy(run, T0)).toEqual({ state: 'success', deployStartedAt: iso(-30_000) })
})

test('success without a deploy step start time is still success, but unverifiable', () => {
  const run = snapshot(iso(-30_000), 'completed')
  run.conclusion = 'success'
  run.jobs = [{ name: 'deploy', steps: [] }]
  expect(evaluateDeploy(run, T0)).toEqual({ state: 'success', deployStartedAt: null })
})

test('a cancelled run means a later push superseded this deploy', () => {
  const run = snapshot(iso(-30_000), 'completed')
  run.conclusion = 'cancelled'
  expect(evaluateDeploy(run, T0)).toEqual({ state: 'cancelled' })
})

test('any other conclusion is a failure and keeps the conclusion text', () => {
  const run = snapshot(iso(-30_000), 'completed')
  run.conclusion = 'failure'
  expect(evaluateDeploy(run, T0)).toEqual({ state: 'failed', conclusion: 'failure' })
})

test('without a deploy step the elapsed time is unknown, so it keeps waiting', () => {
  const run = snapshot(iso(-30_000))
  run.jobs = [{ name: 'deploy', steps: [] }]
  expect(evaluateDeploy(run, T0)).toEqual({ state: 'running', deployStartedAt: null, slow: false })
})
