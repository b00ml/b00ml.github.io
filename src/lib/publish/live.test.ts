import { expect, test } from 'bun:test'

import { evaluateLive } from './live'

const DEPLOYED_AT = '2026-10-17T13:55:33Z'

test('a 200 whose Last-Modified is at or after the deploy step is fresh', () => {
  expect(evaluateLive({ status: 200, lastModified: DEPLOYED_AT }, DEPLOYED_AT)).toEqual({
    state: 'fresh',
    lastModified: DEPLOYED_AT
  })
  expect(
    evaluateLive({ status: 200, lastModified: '2026-10-17T13:55:36Z' }, DEPLOYED_AT)
  ).toMatchObject({ state: 'fresh' })
})

test('a 200 older than the deploy step is an edge cache hit, not a success', () => {
  expect(evaluateLive({ status: 200, lastModified: '2026-10-17T13:50:00Z' }, DEPLOYED_AT)).toEqual({
    state: 'stale',
    reason: 'stale-cache',
    status: 200
  })
})

test('a 200 without Last-Modified proves nothing', () => {
  expect(evaluateLive({ status: 200, lastModified: null }, DEPLOYED_AT)).toEqual({
    state: 'stale',
    reason: 'stale-cache',
    status: 200
  })
})

test('a 404 means the page is not deployed yet', () => {
  expect(evaluateLive({ status: 404, lastModified: null }, DEPLOYED_AT)).toEqual({
    state: 'stale',
    reason: 'not-deployed',
    status: 404
  })
})

test('any other status is an HTTP error worth retrying', () => {
  expect(evaluateLive({ status: 503, lastModified: null }, DEPLOYED_AT)).toEqual({
    state: 'stale',
    reason: 'http-error',
    status: 503
  })
})
