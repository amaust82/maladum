import { describe, it, expect } from 'vitest'
import { craftFee, craftedItemPartyValue, canCraft } from './crafting'

describe('craftFee (p.84)', () => {
  it('equals the item sell price', () => {
    expect(craftFee(14)).toBe(14)
  })
})

describe('craftedItemPartyValue (p.85)', () => {
  it('is double the sell price', () => {
    expect(craftedItemPartyValue(14)).toBe(28)
  })
})

describe('canCraft (p.84-85)', () => {
  const recipe = { resources: { steel: 1, minerals: 1, 'keltic-steel': 1 } }

  it('succeeds when resources are held and the fee is affordable', () => {
    const r = canCraft(recipe, { steel: 1, minerals: 2, 'keltic-steel': 1 }, 14, 20)
    expect(r).toEqual({ ok: true, fee: 14, missing: {}, affordable: true })
  })

  it('reports per-resource shortfalls', () => {
    const r = canCraft(recipe, { steel: 1, minerals: 0 }, 14, 100)
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual({ minerals: 1, 'keltic-steel': 1 })
    expect(r.affordable).toBe(true)
  })

  it('fails and flags affordability when Stash is short of the fee', () => {
    const r = canCraft(recipe, { steel: 1, minerals: 1, 'keltic-steel': 1 }, 14, 10)
    expect(r.ok).toBe(false)
    expect(r.affordable).toBe(false)
    expect(r.missing).toEqual({})
  })

  it('the Starstrike Flail worked example: short one Steel, fee 14', () => {
    // Rulebook p.85 example — missing one Steel resource, sell price 14.
    const flail = { resources: { steel: 2, minerals: 1 } }
    const r = canCraft(flail, { steel: 1, minerals: 1 }, 14, 50)
    expect(r.missing).toEqual({ steel: 1 })
    expect(r.fee).toBe(14)
    expect(r.ok).toBe(false)
  })
})
