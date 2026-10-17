import { expect, test } from 'bun:test'

import { runPublish, type PublishDeps } from './command'

const SITE = 'https://b00ml.github.io'
const REPO = 'b00ml/b00ml.github.io'
const RUN_URL = 'https://github.com/b00ml/b00ml.github.io/actions/runs/42'
const T0 = Date.parse('2026-10-17T13:10:00Z')
const POST = 'src/content/blog/20261017-new-post.md'
const POST_URL = `${SITE}/blog/20261017-new-post`

type Step = { name: string; startedAt: string; status: string }
type Job = { name: string; steps: Step[] }
type Run = {
  databaseId: number
  status: string
  conclusion: string | null
  attempt: number
  url: string
  jobs: Job[]
}
type Live = { status: number; lastModified: string | null }

type Scenario = {
  status?: string
  /** 确认计划之后、提交之前 git status 的返回，用来模拟构建往暂存区塞了文件。 */
  staged?: string
  branch?: string
  pendingCommits?: string
  pendingDiff?: string
  build?: number
  test?: number
  push?: 'ok' | 'blocked' | 'rejected'
  lists?: Run[][]
  runs?: Run[]
  pages?: Live[]
  remote?: string
}

const DEPLOY_STEP = 'Deploy to GitHub Pages'

function run(overrides: Partial<Run> = {}): Run {
  return {
    databaseId: 42,
    status: 'completed',
    conclusion: 'success',
    attempt: 1,
    url: RUN_URL,
    jobs: [
      { name: 'build', steps: [] },
      {
        name: 'deploy',
        steps: [
          {
            name: DEPLOY_STEP,
            startedAt: '2026-10-17T13:09:00Z',
            status: overrides.status === 'completed' ? 'completed' : 'in_progress'
          }
        ]
      }
    ],
    ...overrides
  }
}

function deployStep(startedAt: string): Job[] {
  return [
    { name: 'build', steps: [] },
    { name: 'deploy', steps: [{ name: DEPLOY_STEP, startedAt, status: 'in_progress' }] }
  ]
}

function harness(scenario: Scenario = {}) {
  let now = T0
  const stdout: string[] = []
  const stderr: string[] = []
  const execCalls: { command: string; args: string[] }[] = []
  const gitCalls: string[][] = []
  const ghCalls: string[][] = []
  const headCalls: string[] = []
  const sleeps: number[] = []
  let commitMessage: string | undefined
  let statusCalls = 0

  const pages: Live[] = [
    ...(scenario.pages ?? [{ status: 200, lastModified: '2026-10-17T13:09:30Z' }])
  ]
  const lists: Run[][] = [
    ...(scenario.lists ?? [
      [
        {
          databaseId: 42,
          status: 'in_progress',
          conclusion: null,
          attempt: 1,
          url: RUN_URL,
          jobs: []
        }
      ]
    ])
  ]
  const runs: Run[] = [...(scenario.runs ?? [run()])]

  function next<T>(queue: T[]): T {
    if (queue.length === 0) throw new Error('fixture queue exhausted')
    return queue.length > 1 ? (queue.shift() as T) : (queue[0] as T)
  }

  const deps: PublishDeps = {
    git: (args) => {
      gitCalls.push(args)
      switch (args[0]) {
        case 'remote':
          return `${scenario.remote ?? 'https://github.com/b00ml/b00ml.github.io.git'}\n`
        case 'status':
          statusCalls += 1
          return statusCalls === 1 ? (scenario.status ?? '') : (scenario.staged ?? scenario.status ?? '')
        case 'branch':
          return scenario.branch ?? 'main'
        case 'log':
          return scenario.pendingCommits ?? ''
        case 'diff':
          return scenario.pendingDiff ?? ''
        case 'add':
          return ''
        case 'commit':
          commitMessage = args[2]
          return ''
        case 'rev-parse':
          return 'deadbeefcafe\n'
        case 'push':
          if (scenario.push === 'blocked') {
            throw new Error(
              'git push origin main 失败（退出码 128）：fatal: unable to access https://github.com/b00ml/b00ml.github.io.git/: Failed to connect to github.com port 443'
            )
          }
          if (scenario.push === 'rejected') {
            throw new Error(
              'git push origin main 失败（退出码 1）：! [rejected] main -> main (fetch first)'
            )
          }
          return ''
        default:
          throw new Error(`unexpected git call: ${args.join(' ')}`)
      }
    },
    gh: (args) => {
      ghCalls.push(args)
      if (args[1] === 'list') return JSON.stringify(next(lists))
      if (args[1] === 'view') return JSON.stringify(next(runs))
      if (args[1] === 'rerun') return ''
      throw new Error(`unexpected gh call: ${args.join(' ')}`)
    },
    exec: (command, args) => {
      execCalls.push({ command, args })
      if (args[1] === 'build') return scenario.build ?? 0
      if (args[1] === 'test') return scenario.test ?? 0
      throw new Error(`unexpected exec: ${command} ${args.join(' ')}`)
    },
    head: async (url) => {
      headCalls.push(url)
      return next(pages)
    },
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms)
      now += ms
    },
    write: (stream, text) => {
      ;(stream === 'stdout' ? stdout : stderr).push(text)
    }
  }

  return {
    run: (argv: string[]) => runPublish(argv, deps),
    output: () => JSON.parse(stdout.join('')),
    stdout,
    stderr,
    execCalls,
    gitCalls,
    ghCalls,
    headCalls,
    sleeps,
    elapsed: () => now - T0,
    commitMessage: () => commitMessage
  }
}

function mutatingCalls(calls: string[][]): string[][] {
  return calls.filter((args) =>
    ['add', 'commit', 'push', 'reset', 'checkout', 'restore'].includes(args[0])
  )
}

test('plan mode prints the plan and touches nothing', async () => {
  const h = harness({
    status: ' M src/assets/context-assets-flywheel.webp\0?? src/content/blog/20261017-new-post.md\0'
  })

  const code = await h.run([])

  expect(code).toBe(0)
  expect(h.output()).toEqual({
    mode: 'plan',
    status: 'planned',
    plan: {
      files: [
        { path: 'src/assets/context-assets-flywheel.webp', change: 'modified' },
        { path: 'src/content/blog/20261017-new-post.md', change: 'added' }
      ],
      articles: [
        {
          collection: 'blog',
          slug: '20261017-new-post',
          change: 'added',
          url: POST_URL
        }
      ],
      commit: { message: 'content: publish 20261017-new-post' },
      verifyUrls: [POST_URL]
    }
  })
  expect(h.execCalls).toEqual([])
  expect(h.ghCalls).toEqual([])
  expect(mutatingCalls(h.gitCalls)).toEqual([])
})

test('plan lists every planned article and names them all in the commit message', async () => {
  const h = harness({
    status:
      ' M src/content/notes/20261014-stale-content-cache.md\0?? src/content/blog/20261017-new-post.md\0'
  })

  const code = await h.run([])

  expect(code).toBe(0)
  expect(h.output().plan.commit.message).toBe(
    'content: publish 20261014-stale-content-cache, 20261017-new-post'
  )
  expect(h.output().plan.verifyUrls).toEqual([
    `${SITE}/notes/20261014-stale-content-cache`,
    POST_URL
  ])
})

test('a rename is planned as the new slug and the old path is kept for the commit', async () => {
  const h = harness({
    status: 'R  src/content/blog/20261017-renamed.md\0src/content/blog/20261017-old.md\0'
  })

  const code = await h.run([])

  expect(code).toBe(0)
  expect(h.output().plan.files).toEqual([
    {
      path: 'src/content/blog/20261017-renamed.md',
      change: 'renamed',
      from: 'src/content/blog/20261017-old.md'
    }
  ])
  expect(h.output().plan.articles).toEqual([
    {
      collection: 'blog',
      slug: '20261017-renamed',
      change: 'added',
      url: `${SITE}/blog/20261017-renamed`
    }
  ])
})

test('a change outside the publish scope aborts the plan and names the files', async () => {
  const h = harness({
    status: ' M src/pages/index.astro\0?? src/content/blog/20261017-new-post.md\0'
  })

  const code = await h.run(['--apply'])

  expect(code).toBe(3)
  const out = h.output()
  expect(out.status).toBe('failed')
  expect(out.plan).toBeUndefined()
  expect(out.error.step).toBe('workspace')
  expect(out.error.files).toEqual(['src/pages/index.astro'])
  expect(out.error.message).toContain('src/pages/index.astro')
  expect(h.execCalls).toEqual([])
  expect(mutatingCalls(h.gitCalls)).toEqual([])
})

test('a clean workspace with nothing to push aborts instead of inventing a commit', async () => {
  const h = harness({ status: '' })

  const code = await h.run(['--apply'])

  expect(code).toBe(3)
  expect(h.output().error.step).toBe('workspace')
  expect(h.output().error.message).toContain('没有可发布')
  expect(h.execCalls).toEqual([])
})

test('unresolved merge conflicts abort before anything else', async () => {
  const h = harness({
    status: 'UU src/content/blog/20261017-conflicted.md\0'
  })

  const code = await h.run(['--apply'])

  expect(code).toBe(3)
  expect(h.output().error.files).toEqual(['src/content/blog/20261017-conflicted.md'])
  expect(h.output().error.message).toContain('冲突')
})

test('a clean tree with a commit already made is planned as push-only, so a rerun resumes', async () => {
  const h = harness({
    status: '',
    pendingCommits: 'abc1234 content: publish 20261017-new-post\n',
    pendingDiff: `A\t${POST}\n`
  })

  const code = await h.run([])

  expect(code).toBe(0)
  expect(h.output().plan.commit).toBeNull()
  expect(h.output().plan.files).toEqual([{ path: POST, change: 'added' }])
  expect(h.output().plan.verifyUrls).toEqual([POST_URL])
})

test('apply stops on a build failure with no commit and no push', async () => {
  const h = harness({ status: `?? ${POST}\0`, build: 1 })

  const code = await h.run(['--apply'])

  expect(code).toBe(4)
  expect(h.output().error.step).toBe('build')
  expect(h.execCalls).toEqual([{ command: 'bun', args: ['run', 'build'] }])
  expect(mutatingCalls(h.gitCalls)).toEqual([])
})

test('apply stops on a test failure with no commit and no push', async () => {
  const h = harness({ status: `?? ${POST}\0`, test: 1 })

  const code = await h.run(['--apply'])

  expect(code).toBe(5)
  expect(h.output().error.step).toBe('test')
  expect(h.execCalls).toEqual([
    { command: 'bun', args: ['run', 'build'] },
    { command: 'bun', args: ['run', 'test'] }
  ])
  expect(mutatingCalls(h.gitCalls)).toEqual([])
})

test('apply commits with the planned message, pushes, and waits for the live URL', async () => {
  const h = harness({ status: `?? ${POST}\0` })

  const code = await h.run(['--apply'])

  expect(code).toBe(0)
  const out = h.output()
  expect(out.status).toBe('published')
  expect(out.plan.commit.message).toBe('content: publish 20261017-new-post')
  expect(out.result).toEqual({ sha: 'deadbeefcafe', runUrl: RUN_URL, urls: [POST_URL] })
  expect(h.commitMessage()).toBe('content: publish 20261017-new-post')
  expect(h.gitCalls.filter((args) => args[0] === 'push')).toEqual([['push', 'origin', 'main']])
  const order = h.gitCalls
    .map((args) => args[0])
    .filter((name) => ['add', 'commit', 'push'].includes(name))
  expect(order).toEqual(['add', 'commit', 'push'])
  expect(h.ghCalls.every((args) => args.includes('--repo') && args.includes(REPO))).toBe(true)
  expect(h.ghCalls[0]).toContain('--workflow')
  expect(h.headCalls).toEqual([POST_URL])
})

test('a path staged after the plan gate aborts before commit and names it', async () => {
  const h = harness({
    status: `?? ${POST}\0`,
    staged: `A  ${POST}\0A  AGENTS.md\0`
  })

  const code = await h.run(['--apply'])

  expect(code).toBe(3)
  const out = h.output()
  expect(out.status).toBe('failed')
  expect(out.error.step).toBe('workspace')
  expect(out.error.files).toEqual(['AGENTS.md'])
  expect(out.error.message).toContain('AGENTS.md')
  expect(h.commitMessage()).toBeUndefined()
  expect(h.gitCalls.filter((args) => args[0] === 'push')).toEqual([])
})

test('a deletion of a planned path is still staged', async () => {
  const doomed = 'src/content/blog/20261017-old-post.md'
  const h = harness({ status: ` D ${doomed}\0`, staged: `D  ${doomed}\0` })

  const code = await h.run(['--apply'])

  expect(code).toBe(0)
  expect(h.gitCalls.filter((args) => args[0] === 'add')).toEqual([['add', '-A', '--', doomed]])
  expect(h.commitMessage()).toBe('content: remove 20261017-old-post')
})

test('a legitimate run stages exactly the planned paths', async () => {
  const asset = 'src/assets/context-assets-flywheel.webp'
  const h = harness({
    status: ` M ${asset}\0?? ${POST}\0`,
    staged: `M  ${asset}\0A  ${POST}\0`
  })

  const code = await h.run(['--apply'])

  expect(code).toBe(0)
  expect(h.gitCalls.filter((args) => args[0] === 'add')).toEqual([
    ['add', '-A', '--', asset, POST]
  ])
  expect(h.commitMessage()).toBe('content: publish 20261017-new-post')
})

test('a blocked push is a normal outcome with a rerun hint, and the commit survives', async () => {
  const h = harness({ status: `?? ${POST}\0`, push: 'blocked' })

  const code = await h.run(['--apply'])

  expect(code).toBe(7)
  const out = h.output()
  expect(out.error.step).toBe('push')
  expect(out.error.message).toContain('可原样重跑')
  expect(h.commitMessage()).toBe('content: publish 20261017-new-post')
  expect(h.gitCalls.some((args) => args[0] === 'reset' || args[0] === 'checkout')).toBe(false)
  expect(h.ghCalls).toEqual([])
})

test('a rejected push tells the operator to rebase instead of pretending a rerun will work', async () => {
  const h = harness({ status: `?? ${POST}\0`, push: 'rejected' })

  const code = await h.run(['--apply'])

  expect(code).toBe(7)
  expect(h.output().error.message).toContain('pull --rebase')
})

test('a cancelled deploy is superseded, and that is a failure with an explanation', async () => {
  const h = harness({
    status: `?? ${POST}\0`,
    runs: [run({ conclusion: 'cancelled' })]
  })

  const code = await h.run(['--apply'])

  expect(code).toBe(8)
  expect(h.output().error.step).toBe('deploy')
  expect(h.output().error.message).toContain('取消')
})

test('a failed deploy reports the conclusion and the run URL', async () => {
  const h = harness({
    status: `?? ${POST}\0`,
    runs: [run({ conclusion: 'failure' })]
  })

  const code = await h.run(['--apply'])

  expect(code).toBe(8)
  expect(h.output().error.message).toContain('failure')
  expect(h.output().error.message).toContain(RUN_URL)
})

test('a stuck deploy is rerun once and can then succeed', async () => {
  const h = harness({
    status: `?? ${POST}\0`,
    runs: [
      run({ status: 'in_progress', conclusion: null, jobs: deployStep('2026-10-17T12:58:00Z') }),
      run({ conclusion: 'failure', attempt: 1 }),
      run({
        status: 'in_progress',
        conclusion: null,
        attempt: 2,
        jobs: deployStep('2026-10-17T13:15:00Z')
      }),
      run({ attempt: 2, jobs: deployStep('2026-10-17T13:15:00Z') })
    ],
    pages: [{ status: 200, lastModified: '2026-10-17T13:15:30Z' }]
  })

  const code = await h.run(['--apply'])

  expect(code).toBe(0)
  expect(h.ghCalls.filter((args) => args[1] === 'rerun')).toHaveLength(1)
  expect(h.output().result.sha).toBe('deadbeefcafe')
})

test('a deploy that stalls again after the single rerun gives up and names the step', async () => {
  const h = harness({
    status: `?? ${POST}\0`,
    runs: [
      run({ status: 'in_progress', conclusion: null, jobs: deployStep('2026-10-17T12:58:00Z') }),
      run({
        status: 'in_progress',
        conclusion: null,
        attempt: 2,
        jobs: deployStep('2026-10-17T12:59:00Z')
      })
    ]
  })

  const code = await h.run(['--apply'])

  expect(code).toBe(8)
  expect(h.ghCalls.filter((args) => args[1] === 'rerun')).toHaveLength(1)
  expect(h.output().error.step).toBe('deploy')
  expect(h.output().error.message).toContain(DEPLOY_STEP)
  expect(h.output().error.message).toContain('重跑')
})

test('an edge cache still serving the old page is retried until the new one lands', async () => {
  const h = harness({
    status: `?? ${POST}\0`,
    pages: [
      { status: 200, lastModified: '2026-10-17T13:00:00Z' },
      { status: 200, lastModified: '2026-10-17T13:09:30Z' }
    ]
  })

  const code = await h.run(['--apply'])

  expect(code).toBe(0)
  expect(h.headCalls).toEqual([POST_URL, POST_URL])
})

test('a page that never becomes fresh fails verification with the URL in the message', async () => {
  const h = harness({
    status: `?? ${POST}\0`,
    pages: [{ status: 200, lastModified: '2026-10-17T13:00:00Z' }]
  })

  const code = await h.run(['--apply'])

  expect(code).toBe(9)
  expect(h.output().error.step).toBe('verify')
  expect(h.output().error.message).toContain(POST_URL)
  expect(h.elapsed()).toBeGreaterThanOrEqual(600_000)
  expect(h.headCalls.length).toBeGreaterThan(100)
})

test('unknown arguments fail fast with usage on stderr', async () => {
  const h = harness()

  const code = await h.run(['--force'])

  expect(code).toBe(2)
  expect(h.gitCalls).toEqual([])
  expect(h.stderr.join('')).toContain('用法')
})

test('apply refuses to publish from a branch other than main', async () => {
  const h = harness({ status: `?? ${POST}\0`, branch: 'ticket/3-publish-command' })

  const code = await h.run(['--apply'])

  expect(code).toBe(3)
  expect(h.output().error.step).toBe('workspace')
  expect(h.execCalls).toEqual([])
})

test('every gh call names the repository explicitly, never the upstream remote', async () => {
  const h = harness({ status: `?? ${POST}\0` })

  await h.run(['--apply'])

  expect(h.ghCalls.length).toBeGreaterThan(0)
  for (const args of h.ghCalls) {
    expect(args.slice(args.indexOf('--repo'), args.indexOf('--repo') + 2)).toEqual(['--repo', REPO])
  }
})
