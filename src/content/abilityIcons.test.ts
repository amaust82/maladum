import { describe, expect, it } from 'vitest'
import { iconsForNotes } from './abilityIcons'

const abilityNames = [
  'Bludgeoning',
  'Cumbersome',
  'Sharp',
  'Ammunition',
  'Balanced',
  'Parry',
  'Defensive Re-roll',
  'Quickstrike',
]

describe('iconsForNotes', () => {
  it('matches multiple traits mentioned in a notes string', () => {
    const icons = iconsForNotes('Combat 1 Burst, Bludgeoning, Cumbersome', abilityNames)
    expect(icons).toEqual(['/icons/bludgeoning.png', '/icons/cumbersome.png'])
  })

  it('matches whole words only, not substrings of other words', () => {
    // "Ammunition" should not match "Ammo" and vice versa via substring accident.
    const icons = iconsForNotes('Ammo', abilityNames)
    expect(icons).toEqual([])
  })

  it('is case-insensitive', () => {
    expect(iconsForNotes('sharp, ammo', abilityNames)).toEqual(['/icons/sharp.png'])
  })

  it('returns nothing for notes with no known trait words', () => {
    expect(iconsForNotes('See table in rulebook p151', abilityNames)).toEqual([])
  })

  it('returns nothing for null/empty notes', () => {
    expect(iconsForNotes(null, abilityNames)).toEqual([])
    expect(iconsForNotes('', abilityNames)).toEqual([])
  })

  it('handles hyphenated/parenthetical ability names', () => {
    expect(iconsForNotes('Defensive Re-Roll', abilityNames)).toEqual(['/icons/defensive_re_roll.png'])
  })
})
