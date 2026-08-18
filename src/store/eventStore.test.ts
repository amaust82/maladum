import { describe, it, expect } from 'vitest'
import { createEventStore } from './eventStore'

// A tiny domain to exercise the generic core: an accumulator over numbers.
type CounterEvent = { type: 'add'; n: number } | { type: 'reset' }
const reducer = (s: number, e: CounterEvent): number => (e.type === 'reset' ? 0 : s + e.n)

const newStore = (interval?: number) =>
  createEventStore<number, CounterEvent>({
    reducer,
    initialState: 0,
    snapshotInterval: interval,
  })

describe('createEventStore — folding', () => {
  it('projects state as a fold over appended events', () => {
    const s = newStore()
    s.append({ type: 'add', n: 3 })
    s.append({ type: 'add', n: 4 })
    expect(s.state).toBe(7)
    expect(s.eventCount).toBe(2)
  })

  it('applies reducers in order (reset mid-stream)', () => {
    const s = newStore()
    s.append({ type: 'add', n: 5 })
    s.append({ type: 'reset' })
    s.append({ type: 'add', n: 2 })
    expect(s.state).toBe(2)
  })

  it('rejects a snapshotInterval below 1', () => {
    expect(() => newStore(0)).toThrow()
  })
})

describe('createEventStore — undo/redo', () => {
  it('undo reverts the last event and redo re-applies it', () => {
    const s = newStore()
    s.append({ type: 'add', n: 10 })
    s.append({ type: 'add', n: 5 })
    expect(s.state).toBe(15)

    expect(s.undo()).toBe(true)
    expect(s.state).toBe(10)
    expect(s.canRedo).toBe(true)

    expect(s.redo()).toBe(true)
    expect(s.state).toBe(15)
    expect(s.canRedo).toBe(false)
  })

  it('undo on an empty log returns false', () => {
    const s = newStore()
    expect(s.undo()).toBe(false)
    expect(s.canUndo).toBe(false)
  })

  it('redo with nothing to redo returns false', () => {
    const s = newStore()
    s.append({ type: 'add', n: 1 })
    expect(s.redo()).toBe(false)
  })

  it('appending a new event clears the redo stack (new branch)', () => {
    const s = newStore()
    s.append({ type: 'add', n: 1 })
    s.append({ type: 'add', n: 2 })
    s.undo() // back to 1, redo has {add 2}
    s.append({ type: 'add', n: 100 })
    expect(s.state).toBe(101)
    expect(s.canRedo).toBe(false)
    expect(s.redo()).toBe(false)
  })

  it('getEvents returns only committed events, not undone ones', () => {
    const s = newStore()
    s.append({ type: 'add', n: 1 })
    s.append({ type: 'add', n: 2 })
    s.undo()
    expect(s.getEvents()).toEqual([{ type: 'add', n: 1 }])
  })
})

describe('createEventStore — snapshotting', () => {
  it('creates a snapshot every interval events', () => {
    const s = newStore(5)
    expect(s.snapshotCount).toBe(1) // just the initial
    for (let i = 0; i < 5; i++) s.append({ type: 'add', n: 1 })
    expect(s.snapshotCount).toBe(2) // initial + one at 5
    for (let i = 0; i < 5; i++) s.append({ type: 'add', n: 1 })
    expect(s.snapshotCount).toBe(3)
    expect(s.state).toBe(10)
  })

  it('undo across a snapshot boundary rebuilds correct state and drops stale snapshots', () => {
    const s = newStore(5)
    for (let i = 1; i <= 7; i++) s.append({ type: 'add', n: i }) // 1..7 → 28
    expect(s.state).toBe(28)
    expect(s.snapshotCount).toBe(2)
    // undo back below the snapshot at 5
    s.undo() // remove 7 → 21
    s.undo() // remove 6 → 15
    s.undo() // remove 5 → 10, now only 4 events, snapshot at 5 must be dropped
    expect(s.state).toBe(10)
    expect(s.snapshotCount).toBe(1)
  })

  it('snapshot-accelerated state matches a naive fold for a long log', () => {
    const s = newStore(10)
    let expected = 0
    for (let i = 0; i < 250; i++) {
      const n = (i * 7) % 13
      s.append({ type: 'add', n })
      expected += n
    }
    expect(s.state).toBe(expected)
  })
})

describe('createEventStore — hydrate', () => {
  it('rebuilds state and snapshots from a persisted log', () => {
    const events: CounterEvent[] = Array.from({ length: 23 }, (_, i) => ({
      type: 'add' as const,
      n: i,
    }))
    const s = newStore(10)
    s.hydrate(events)
    expect(s.state).toBe(events.reduce((a, e) => a + (e.type === 'add' ? e.n : 0), 0))
    expect(s.snapshotCount).toBe(3) // initial + at 10 + at 20
    expect(s.canRedo).toBe(false)
  })

  it('hydrate replaces any existing log', () => {
    const s = newStore()
    s.append({ type: 'add', n: 999 })
    s.hydrate([{ type: 'add', n: 1 }])
    expect(s.state).toBe(1)
    expect(s.eventCount).toBe(1)
  })
})
