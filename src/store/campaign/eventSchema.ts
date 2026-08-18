/**
 * Zod schema for CampaignEvent (design.md §2.4 — save-file validation).
 *
 * Kept in lockstep with `events.ts`: a discriminated union on `t`. Used to
 * validate imported save files so a hand-edited or corrupted export can't
 * silently poison a campaign's log.
 */

import { z } from 'zod'
import type { CampaignEvent } from './events'

const ItemRef = z.object({
  itemId: z.string(),
  instanceId: z.string().optional(),
})

const XpReason = z.enum(['survived', 'escaped', 'objective', 'feat', 'other'])
const AcquireVia = z.enum(['found', 'bought', 'reward', 'crafted'])
const ContentPackRef = z.object({ id: z.string(), version: z.number() })

export const CampaignEventSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('CAMPAIGN_CREATED'),
    id: z.string(),
    name: z.string(),
    contentPacks: z.array(ContentPackRef),
    createdAt: z.number(),
  }),
  z.object({ t: z.literal('PARTY_ADDED'), partyId: z.string(), name: z.string() }),
  z.object({
    t: z.literal('ADVENTURER_ADDED'),
    partyId: z.string(),
    advId: z.string(),
    characterId: z.string(),
    classId: z.string(),
    displayName: z.string(),
  }),
  z.object({
    t: z.literal('RENOWN_CHANGED'),
    partyId: z.string(),
    amount: z.number(),
    source: z.string(),
  }),
  z.object({
    t: z.literal('STASH_CHANGED'),
    partyId: z.string(),
    amount: z.number(),
    reason: z.string().optional(),
  }),
  z.object({
    t: z.literal('XP_GAINED'),
    advId: z.string(),
    amount: z.number(),
    reason: XpReason,
  }),
  z.object({
    t: z.literal('ITEM_ACQUIRED'),
    advId: z.string(),
    item: ItemRef,
    via: AcquireVia,
  }),
])

// Compile-time guarantee that the schema output stays assignable to the TS union.
const _typecheck: CampaignEvent = {} as z.infer<typeof CampaignEventSchema>
void _typecheck
