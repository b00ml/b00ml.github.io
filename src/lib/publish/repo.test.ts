import { expect, test } from 'bun:test'

import { parseGitHubRepo, siteOrigin } from './repo'

test('reads owner/repo out of every remote URL shape this repo uses', () => {
  expect(parseGitHubRepo('https://github.com/b00ml/b00ml.github.io.git')).toBe(
    'b00ml/b00ml.github.io'
  )
  expect(parseGitHubRepo('https://github.com/b00ml/b00ml.github.io')).toBe('b00ml/b00ml.github.io')
  expect(parseGitHubRepo('git@github.com:b00ml/b00ml.github.io.git')).toBe('b00ml/b00ml.github.io')
  expect(parseGitHubRepo('ssh://git@github.com/b00ml/b00ml.github.io.git')).toBe(
    'b00ml/b00ml.github.io'
  )
})

test('an upstream remote that is not github reads as unknown', () => {
  expect(parseGitHubRepo('https://gitlab.com/someone/blog.git')).toBeUndefined()
  expect(parseGitHubRepo('')).toBeUndefined()
})

test('the site origin follows the github.io project-site convention', () => {
  expect(siteOrigin('b00ml/b00ml.github.io')).toBe('https://b00ml.github.io')
  expect(siteOrigin('someone/blog')).toBe('https://someone.github.io/blog')
})
