/**
 * A project is one entry, or a small tree of them: `<slug>/index.md` is the
 * overview and `<slug>/<part>.md` are the deep dives. The collection gives no
 * hint which is which, so the id is the only thing to go on and every page that
 * lists or links projects reads it through here.
 */
type EntryLike = { id: string }

/** URL path under `/projects` — `ark-workbench/index.md` is `/projects/ark-workbench`. */
export function projectPath(entry: EntryLike): string {
  return entry.id.replace(/\/index$/, '')
}

/** True for the entry that speaks for the whole project. */
export function isProjectRoot(entry: EntryLike): boolean {
  return !entry.id.includes('/') || /\/index$/.test(entry.id)
}

/** Slug of the project an entry belongs to, for both roots and sub-pages. */
export function projectRootId(entry: EntryLike): string {
  return projectPath(entry).split('/')[0]
}
