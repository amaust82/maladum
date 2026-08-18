import { describe, it, expect } from 'vitest'
import {
  compareManifests,
  describeManifestIssue,
  isCompatible,
  manifestFrom,
  type PackRef,
} from './manifest'
import { loadPacks, loadBundledPacks } from './loader'

const pack = (id: string, over: Partial<PackRef> = {}): PackRef => ({
  id,
  name: id.toUpperCase(),
  version: 1,
  schemaVersion: 1,
  ...over,
})

describe('manifestFrom', () => {
  it('copies the library manifest in merge order', () => {
    const { library } = loadPacks({
      'b.json': { id: 'b', name: 'B', schemaVersion: 1, version: 3 },
      'core.json': { id: 'core', name: 'Core', schemaVersion: 1, version: 2 },
    })
    expect(manifestFrom(library)).toEqual([
      { id: 'core', name: 'Core', version: 2, schemaVersion: 1 },
      { id: 'b', name: 'B', version: 3, schemaVersion: 1 },
    ])
  })

  it('defaults a pack without an explicit version to content v1', () => {
    const { library } = loadPacks({ 'core.json': { id: 'core', name: 'Core', schemaVersion: 1 } })
    expect(manifestFrom(library)[0].version).toBe(1)
  })

  it('returns a copy, not aliases into the library', () => {
    const { library } = loadPacks({ 'core.json': { id: 'core', name: 'Core', schemaVersion: 1 } })
    const manifest = manifestFrom(library)
    manifest[0].version = 99
    expect(library.packs[0].version).toBe(1)
  })

  it('every bundled pack declares a content version', () => {
    for (const p of manifestFrom(loadBundledPacks().library)) {
      expect(p.version).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('compareManifests', () => {
  it('reports nothing when the content is unchanged', () => {
    const manifest = [pack('core'), pack('ale')]
    expect(compareManifests(manifest, manifest)).toEqual([])
    expect(isCompatible([])).toBe(true)
  })

  it('errors when a recorded pack is not installed, naming it from the save', () => {
    const issues = compareManifests([pack('ale', { name: 'Of Ale and Adventure' })], [])
    expect(issues).toEqual([
      {
        severity: 'error',
        kind: 'pack-missing',
        packId: 'ale',
        packName: 'Of Ale and Adventure',
      },
    ])
    expect(isCompatible(issues)).toBe(false)
  })

  it('errors on a downgrade — the save expects data this build does not have', () => {
    const issues = compareManifests([pack('core', { version: 3 })], [pack('core', { version: 2 })])
    expect(issues).toMatchObject([{ kind: 'pack-downgraded', recorded: 3, available: 2 }])
    expect(isCompatible(issues)).toBe(false)
  })

  it('warns, but does not block, on a content upgrade', () => {
    const issues = compareManifests([pack('core', { version: 1 })], [pack('core', { version: 2 })])
    expect(issues).toMatchObject([{ severity: 'warning', kind: 'pack-upgraded' }])
    expect(isCompatible(issues)).toBe(true)
  })

  it('treats a schema-version change as an error separate from the content version', () => {
    const issues = compareManifests([pack('core')], [pack('core', { schemaVersion: 2 })])
    expect(issues).toMatchObject([
      { kind: 'schema-version-changed', recorded: 1, available: 2 },
    ])
  })

  it('reports both a shape change and a version change on one pack', () => {
    const issues = compareManifests(
      [pack('core', { version: 2 })],
      [pack('core', { version: 1, schemaVersion: 2 })],
    )
    expect(issues.map((i) => i.kind)).toEqual(['schema-version-changed', 'pack-downgraded'])
  })

  it('mentions newly installed packs as info, not a problem', () => {
    const issues = compareManifests([pack('core')], [pack('core'), pack('maw')])
    expect(issues).toMatchObject([{ severity: 'info', kind: 'pack-added', packId: 'maw' }])
    expect(isCompatible(issues)).toBe(true)
  })

  it('orders recorded packs before newly installed ones', () => {
    const issues = compareManifests(
      [pack('core'), pack('gone')],
      [pack('core'), pack('new-one')],
    )
    expect(issues.map((i) => i.kind)).toEqual(['pack-missing', 'pack-added'])
  })

  it('describes every issue kind as a one-liner', () => {
    const all = [
      ...compareManifests([pack('gone')], []),
      ...compareManifests([pack('core', { version: 2 })], [pack('core', { version: 1 })]),
      ...compareManifests([pack('core')], [pack('core', { version: 5, schemaVersion: 2 })]),
      ...compareManifests([], [pack('extra')]),
    ]
    expect(all.length).toBeGreaterThan(0)
    for (const issue of all) {
      expect(describeManifestIssue(issue)).toMatch(/\S/)
    }
  })
})
