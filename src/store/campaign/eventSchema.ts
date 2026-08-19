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
const AcquireVia = z.enum(['found', 'bought', 'reward', 'crafted', 'assigned'])
const SkillSource = z.enum(['character', 'class'])
const LevellableStat = z.enum(['health', 'skill', 'magic', 'actions'])
const EscapeCounterName = z.enum(['wounded', 'poisoned', 'burning'])
const QuestOutcome = z.enum(['primary-complete', 'partial', 'failed'])
/** Mirrors `PackRef` in content/manifest.ts — the manifest a save records (§2.4). */
const ContentPackRef = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number(),
  schemaVersion: z.number(),
})

export const CampaignEventSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('CAMPAIGN_CREATED'),
    id: z.string(),
    name: z.string(),
    contentPacks: z.array(ContentPackRef),
    createdAt: z.number(),
  }),
  z.object({ t: z.literal('CAMPAIGN_RENAMED'), name: z.string() }),
  z.object({
    t: z.literal('CONTENT_PACKS_CHANGED'),
    contentPacks: z.array(ContentPackRef),
    at: z.number(),
    reason: z.string().optional(),
  }),
  z.object({ t: z.literal('PARTY_ADDED'), partyId: z.string(), name: z.string() }),
  z.object({
    t: z.literal('ADVENTURER_ADDED'),
    partyId: z.string(),
    advId: z.string(),
    characterId: z.string(),
    classId: z.string(),
    displayName: z.string(),
    startingXp: z.number().optional(),
  }),
  z.object({
    t: z.literal('ADVENTURER_REMOVED'),
    partyId: z.string(),
    advId: z.string(),
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
  z.object({
    t: z.literal('XP_SET'),
    advId: z.string(),
    filled: z.number(),
    note: z.string().optional(),
  }),
  z.object({
    t: z.literal('SKILL_MARKS_SET'),
    advId: z.string(),
    skill: z.string(),
    source: SkillSource,
    marks: z.number(),
  }),
  z.object({ t: z.literal('SPELL_LEARNED'), advId: z.string(), spell: z.string() }),
  z.object({ t: z.literal('SPELL_UNLEARNED'), advId: z.string(), spell: z.string() }),
  z.object({
    t: z.literal('STAT_INCREASE_SET'),
    advId: z.string(),
    stat: LevellableStat,
    increase: z.number(),
  }),
  z.object({ t: z.literal('RANK_SET'), advId: z.string(), rank: z.number().nullable() }),
  z.object({
    t: z.literal('STASH_SET'),
    partyId: z.string(),
    amount: z.number(),
    reason: z.string().optional(),
  }),
  z.object({
    t: z.literal('RENOWN_SET'),
    partyId: z.string(),
    amount: z.number(),
    reason: z.string().optional(),
  }),
  z.object({
    t: z.literal('ITEM_STORED'),
    partyId: z.string(),
    item: ItemRef,
    secure: z.boolean(),
  }),
  z.object({ t: z.literal('ITEM_UNSTORED'), partyId: z.string(), item: ItemRef }),
  z.object({
    t: z.literal('SECURE_STORAGE_SET'),
    partyId: z.string(),
    unlocked: z.boolean(),
  }),
  z.object({ t: z.literal('CAMP_NOTES_SET'), partyId: z.string(), notes: z.string() }),
  z.object({ t: z.literal('ITEM_REMOVED'), advId: z.string(), item: ItemRef }),
  z.object({ t: z.literal('ARMOUR_EQUIPPED'), advId: z.string(), item: ItemRef }),
  z.object({ t: z.literal('ARMOUR_REMOVED'), advId: z.string(), item: ItemRef }),
  z.object({
    t: z.literal('GRANT_COVERED_SET'),
    advId: z.string(),
    grant: z.string(),
    covered: z.boolean(),
  }),
  z.object({
    t: z.literal('QUEST_RECORDED'),
    partyId: z.string(),
    name: z.string(),
    outcome: QuestOutcome,
    renownGained: z.number().optional(),
    guildersGained: z.number().optional(),
    at: z.number(),
  }),
  z.object({
    t: z.literal('ESCAPE_RESOLVED'),
    advId: z.string(),
    roll: z.number(),
    counters: z.array(EscapeCounterName),
    consequence: z.string(),
    questsMissed: z.number(),
    equipmentLost: z.boolean(),
    ransomPaid: z.boolean().optional(),
  }),
  z.object({ t: z.literal('ABSENCE_SET'), advId: z.string(), quests: z.number() }),
  z.object({ t: z.literal('ALIVE_SET'), advId: z.string(), alive: z.boolean() }),
])

// Compile-time guarantee that the schema output stays assignable to the TS union.
const _typecheck: CampaignEvent = {} as z.infer<typeof CampaignEventSchema>
void _typecheck
