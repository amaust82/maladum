import { describe, it, expect } from 'vitest'
import { buildBoardInventory, checkBoardAvailability, type PhysicalBoard } from './boardAvailability'
import type { ClassDef } from '../content/schema'
import { loadBundledPacks } from '../content/loader'

/** Build class defs from a pairing spec: { Assassin: ['Guardian', 'Curator'], ... } */
function classesFrom(spec: Record<string, string[]>): ClassDef[] {
  return Object.entries(spec).map(
    ([name, pairedWith]) =>
      ({
        id: name.toLowerCase(),
        name,
        pairedWith,
        boardCopies: pairedWith.length,
        skills: [],
        spellSchools: [],
        statBonuses: [],
        grantedSpells: [],
        grantedAbilities: [],
      }) as unknown as ClassDef,
  )
}

const board = (a: string, b: string, n = 0): PhysicalBoard => ({
  id: `${a}|${b}#${n}`,
  sides: [a, b],
})

describe('buildBoardInventory', () => {
  it('counts a board once even though both classes list the pairing', () => {
    const inventory = buildBoardInventory(classesFrom({ Assassin: ['Guardian'], Guardian: ['Assassin'] }))
    expect(inventory).toHaveLength(1)
    expect(inventory[0].sides.sort()).toEqual(['assassin', 'guardian'])
  })

  it('gives a class one board per pairing entry', () => {
    const inventory = buildBoardInventory(
      classesFrom({
        Assassin: ['Guardian', 'Curator'],
        Guardian: ['Assassin'],
        Curator: ['Assassin'],
      }),
    )
    expect(inventory).toHaveLength(2)
  })

  it('rounds a half-listed pairing up, so bad data cannot invent a conflict', () => {
    // Guardian forgets to list Assassin back. The board still exists — under-counting
    // would make the app warn about a party the player can physically build.
    const inventory = buildBoardInventory(classesFrom({ Assassin: ['Guardian'], Guardian: [] }))
    expect(inventory).toHaveLength(1)
  })

  it('skips a pairing naming a class that does not exist rather than guessing', () => {
    expect(buildBoardInventory(classesFrom({ Assassin: ['Ghost'] }))).toEqual([])
  })
})

describe('checkBoardAvailability', () => {
  const inventory = [board('assassin', 'guardian'), board('assassin', 'curator')]

  it('seats a party that fits', () => {
    const r = checkBoardAvailability(inventory, ['assassin'])
    expect(r).toMatchObject({ ok: true, overSubscribed: [], conflicting: [], unknown: [] })
  })

  it('seats two classes that share a board when a second board carries one of them', () => {
    // Assassin + Guardian looks like a clash, but Assassin can take the Curator board.
    // This is the case a naive per-class count gets wrong.
    expect(checkBoardAvailability(inventory, ['assassin', 'guardian']).ok).toBe(true)
  })

  it('reports a genuine three-way clash over two boards', () => {
    const r = checkBoardAvailability(inventory, ['assassin', 'guardian', 'curator'])
    expect(r.ok).toBe(false)
    expect(r.overSubscribed).toEqual([])
    // All three compete for the same two boards.
    expect(r.conflicting).toEqual(['assassin', 'curator', 'guardian'])
  })

  it('reports picking a class more often than copies exist', () => {
    const r = checkBoardAvailability([board('rook', 'sellsword')], ['rook', 'rook'])
    expect(r.ok).toBe(false)
    expect(r.overSubscribed).toEqual([{ classId: 'rook', picked: 2, copies: 1 }])
    // An over-count explains itself, so no need to also list it as a clash.
    expect(r.conflicting).toEqual([])
  })

  it('allows as many copies as boards exist', () => {
    const many = [board('sellsword', 'rook', 0), board('sellsword', 'magus', 1)]
    expect(checkBoardAvailability(many, ['sellsword', 'sellsword']).ok).toBe(true)
    expect(checkBoardAvailability(many, ['sellsword', 'sellsword', 'sellsword']).ok).toBe(false)
  })

  it('ignores Adventurers with no Class chosen yet', () => {
    expect(checkBoardAvailability(inventory, ['assassin', '']).ok).toBe(true)
  })

  it('excludes an unknown class from the check instead of assuming it conflicts', () => {
    const r = checkBoardAvailability(inventory, ['assassin', 'mystery'])
    expect(r.ok).toBe(true)
    expect(r.unknown).toEqual(['mystery'])
  })

  it('treats an empty party as satisfiable', () => {
    expect(checkBoardAvailability(inventory, []).ok).toBe(true)
  })
})

describe('against the real board inventory', () => {
  const { library } = loadBundledPacks()
  const inventory = buildBoardInventory(library.classes.values())

  it('derives 24 physical boards from the 25 transcribed classes', () => {
    expect(inventory).toHaveLength(24)
  })

  it('lets a full party of four different classes be seated', () => {
    const r = checkBoardAvailability(inventory, ['barbarian', 'druid', 'paladin', 'rogue'])
    expect(r.ok).toBe(true)
  })

  it('allows up to five Sellswords, since Sellsword is on five boards', () => {
    const five = Array<string>(5).fill('sellsword')
    expect(checkBoardAvailability(inventory, five).ok).toBe(true)
    expect(checkBoardAvailability(inventory, [...five, 'sellsword']).ok).toBe(false)
  })

  it('refuses two Mentors — its class is printed on exactly one board', () => {
    const r = checkBoardAvailability(inventory, ['mentor', 'mentor'])
    expect(r.ok).toBe(false)
    expect(r.overSubscribed).toEqual([{ classId: 'mentor', picked: 2, copies: 1 }])
  })

  it('seats Mentor and Rambler apart, even though they share their only board together', () => {
    // Mentor is only on the Mentor/Rambler board, but Rambler is also on others, so the
    // pair is seatable. Exactly the case that makes this a matching problem.
    const rambler = library.classes.get('rambler')!
    expect(rambler.boardCopies).toBeGreaterThan(1)
    expect(checkBoardAvailability(inventory, ['mentor', 'rambler']).ok).toBe(true)
  })

  it('never reports a conflict for any single class in the game', () => {
    for (const id of library.classes.keys()) {
      expect(checkBoardAvailability(inventory, [id]).ok, `${id} alone`).toBe(true)
    }
  })
})
