// pochettes (code: sleeves) are run-wide upgrades, our vouchers. one is offered in each big shop, between tables.
// display text says Pochette, ids and code keep sleeve (like the forge → flamber rename)
import { STONKS_MULT, tableOf } from './economy.ts'
import { SUITS, type Card, type Finish, type Suit } from './cards.ts'
import { makeRng, pick, randInt } from './rng.ts'

export type SleeveId = 'big_hands' | 'restock' | 'hot_market' | 'riser' | 'deep_pockets' | 'bulk_deal' | 'archival'

export const SLEEVES: readonly { id: SleeveId; name: string; text: string }[] = [
  { id: 'big_hands', name: 'Big Hands', text: '+1 hand size' },
  { id: 'restock', name: 'Pochette Restock', text: 'First restock each shop is free' },
  { id: 'hot_market', name: 'Hot Market', text: 'STONKS sells at +1×' },
  { id: 'riser', name: 'Display Riser', text: '+1 display case slot' },
  { id: 'deep_pockets', name: 'Deep Pockets', text: 'Interest caps at +$4 instead of +$2' },
  { id: 'bulk_deal', name: 'Ash Deal', text: 'Emptying an Ash card always costs $1' },
  { id: 'archival', name: 'Pochette Archive', text: 'Damaged cards never tear, and grading never comes back damaged' },
]

export function getSleeve(id: SleeveId): { id: SleeveId; name: string; text: string } {
  const s = SLEEVES.find(x => x.id === id)
  if (!s) throw new Error(`unknown sleeve ${id}`)
  return s
}

// the pochette this table's big shop offers, decided by the seed and what you already own. same stream for every
// seat, so a daily run offers everyone the same one (unless they already own it)
export function sleeveOffer(seed: string, round: number, owned: SleeveId[]): SleeveId | null {
  const left = SLEEVES.filter(s => !owned.includes(s.id))
  if (left.length === 0) return null
  return pick(makeRng(`${seed}:${tableOf(round)}:sleeve`), left).id
}

// ---------- STONKS ----------
// each shop posts one hot rank, suit or finish. matching binder cards sell for more

export type Stonks = { kind: 'rank'; rank: number } | { kind: 'suit'; suit: Suit } | { kind: 'finish'; finish: Finish }

export function stonksFor(seed: string, round: number): Stonks {
  const rng = makeRng(`${seed}:${round}:stonks`)
  const kind = pick(rng, ['rank', 'suit', 'finish'] as const)
  if (kind === 'rank') return { kind, rank: randInt(rng, 2, 14) }
  if (kind === 'suit') return { kind, suit: pick(rng, SUITS) }
  return { kind, finish: pick<Finish>(rng, ['foil', 'holo', 'misprint']) }
}

// 1 when the card isn't hot. the hot market pochette adds +1 to a hot multiplier
export function stonksMult(card: Card, s: Stonks, hotMarket: boolean): number {
  const hit = s.kind === 'rank' ? card.rank === s.rank : s.kind === 'suit' ? card.suit === s.suit : card.finish === s.finish
  if (!hit) return 1
  return STONKS_MULT[s.kind] + (hotMarket ? 1 : 0)
}
