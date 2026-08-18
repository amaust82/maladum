/**
 * Generic event-sourcing core (design.md §2.3) — domain-agnostic and pure at heart.
 *
 * Current state is a fold (projection) over an append-only event log. This buys:
 *   - undo/redo for free (mistaps at a game table are constant),
 *   - a campaign chronicle for free (the log *is* the story),
 *   - a graceful sync path later (logs merge better than mutable documents).
 *
 * Snapshots cache the fold at every `snapshotInterval` events so a long campaign
 * doesn't replay thousands of events on load. `snapshots[k]` is the state after
 * folding the first `k * snapshotInterval` committed events; `snapshots[0]` is the
 * initial state. They are only ever built for fixed committed prefixes, so they
 * stay valid across undo (we just drop the ones past the new length).
 *
 * The reducer MUST be pure and return a new state value (treat state as immutable).
 */

export interface EventStoreOptions<S, E> {
  reducer: (state: S, event: E) => S
  initialState: S
  /** Snapshot the projection every this-many events (design §2.3: 100). */
  snapshotInterval?: number
}

export interface EventStore<S, E> {
  /** Current projected state (the fold over all committed events). */
  readonly state: S
  /** Number of committed (active, non-undone) events. */
  readonly eventCount: number
  readonly canUndo: boolean
  readonly canRedo: boolean
  /** Append a new event. Clears the redo stack (a new branch). */
  append(event: E): void
  /** Undo the last committed event. Returns false if there's nothing to undo. */
  undo(): boolean
  /** Redo the last undone event. Returns false if there's nothing to redo. */
  redo(): boolean
  /** Snapshot of the committed event log (a copy — safe to persist/inspect). */
  getEvents(): E[]
  /** Replace the entire log (e.g. loading from disk). Rebuilds state + snapshots, clears redo. */
  hydrate(events: E[]): void
  /** Number of cached snapshots including the initial one (for tests/diagnostics). */
  readonly snapshotCount: number
}

export function createEventStore<S, E>(opts: EventStoreOptions<S, E>): EventStore<S, E> {
  const interval = opts.snapshotInterval ?? 100
  if (interval < 1) throw new Error('snapshotInterval must be >= 1')

  let events: E[] = []
  let redo: E[] = []
  let snapshots: S[] = [opts.initialState]
  let current: S = opts.initialState

  function foldFrom(state: S, slice: readonly E[]): S {
    let s = state
    for (const e of slice) s = opts.reducer(s, e)
    return s
  }

  /** Extend snapshots to cover every completed interval in the current committed log. */
  function extendSnapshots(): void {
    while (snapshots.length * interval <= events.length) {
      const idx = snapshots.length
      const base = snapshots[idx - 1]
      const slice = events.slice((idx - 1) * interval, idx * interval)
      snapshots[idx] = foldFrom(base, slice)
    }
  }

  /** Drop snapshots that cover more events than we currently have (after undo). */
  function clampSnapshots(): void {
    const maxIdx = Math.floor(events.length / interval)
    if (snapshots.length - 1 > maxIdx) snapshots.length = maxIdx + 1
  }

  /** Recompute `current` from the nearest snapshot (used after undo). */
  function rebuild(): void {
    const idx = Math.min(Math.floor(events.length / interval), snapshots.length - 1)
    current = foldFrom(snapshots[idx], events.slice(idx * interval))
  }

  return {
    get state() {
      return current
    },
    get eventCount() {
      return events.length
    },
    get canUndo() {
      return events.length > 0
    },
    get canRedo() {
      return redo.length > 0
    },
    get snapshotCount() {
      return snapshots.length
    },
    append(event) {
      redo = []
      events.push(event)
      current = opts.reducer(current, event)
      extendSnapshots()
    },
    undo() {
      const last = events.pop()
      if (last === undefined) return false
      redo.push(last)
      clampSnapshots()
      rebuild()
      return true
    },
    redo() {
      const next = redo.pop()
      if (next === undefined) return false
      events.push(next)
      current = opts.reducer(current, next)
      extendSnapshots()
      return true
    },
    getEvents() {
      return events.slice()
    },
    hydrate(next) {
      events = next.slice()
      redo = []
      snapshots = [opts.initialState]
      current = opts.initialState
      // Fold the whole log, building snapshots as we pass each interval boundary.
      for (let i = 0; i < events.length; i++) {
        current = opts.reducer(current, events[i])
        if ((i + 1) % interval === 0) snapshots.push(current)
      }
    },
  }
}
