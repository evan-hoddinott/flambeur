// the solo rival roster: all 10 masks. a run draws 4 different ones (one per table, seeded), and each sits down
// pre-built for its table: an 18 card lane deck, 2 upgraded lane cards and 1 lane collectible for every table
// before this one. difficulty shifts that a step (easy one behind, high roller one ahead plus a starting rare).
// solo rivals play rounds and take spoils like a player, but they don't shop and don't owe le patron
import { REAL_JOKERS, SUITS, newBulk, newCard, type Card, type Ids, type Suit } from './cards.ts'
import { COLLECTIBLES, rollParam, type Owned } from './collectibles.ts'
import type { HandType } from './hands.ts'
import { chance, makeRng, pick, randInt, shuffled, type Rng } from './rng.ts'

export type RivalId = 'hare' | 'pierrot' | 'domino' | 'domino_red' | 'arlequin' | 'queen_hearts' | 'king_spades' | 'owl' | 'scaramouche' | 'fox'

// a case item is a collectible, or a code card (a level on one hand type)
export type CaseItem = { id: string; param: string | null } | { code: HandType }

export type RivalDef = {
  id: RivalId // also the mask sprite
  name: string
  lane: string // one word for the scouting report
  leans: string
  deck: (rng: Rng, ids: Ids) => Card[] // 18 cards
  upgrade: (rng: Rng, ids: Ids) => Card // one upgraded lane card
  case: readonly CaseItem[] // gained at table 2, 3, 4
  hands: readonly HandType[] // the lane's hand types: each gets a level per step
  bets?: 'nervous' | 'reckless' // hare bets min unless it's sure, crimson domino bets max a lot
}

const LANE_DECK = 18
export const UPGRADES_PER_STEP = 3 // upgraded lane cards a rival gains per table of growth
export const LEVELS_PER_STEP = 1 // levels on each of its lane hands per table of growth
const card = (ids: Ids, rank: number, suit: Suit, extra: Partial<Card> = {}) => newCard(ids, rank, suit, extra)
const anyCard = (rng: Rng, ids: Ids, extra: Partial<Card> = {}) => card(ids, randInt(rng, 2, 14), pick(rng, SUITS), extra)
const fill = (rng: Rng, ids: Ids, cards: Card[]) => {
  while (cards.length < LANE_DECK) cards.push(anyCard(rng, ids))
  return cards
}
// n distinct ranks from lo..hi
const ranks = (rng: Rng, n: number, lo = 2, hi = 14) => shuffled(rng, Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)).slice(0, n)

export const RIVALS: readonly RivalDef[] = [
  {
    id: 'hare', name: 'Le Lièvre', lane: 'Pairs', leans: '3 copies of 4 ranks', bets: 'nervous',
    deck: (rng, ids) => fill(rng, ids, ranks(rng, 4).flatMap(r => shuffled(rng, SUITS).slice(0, 3).map(s => card(ids, r, s)))),
    upgrade: (rng, ids) => anyCard(rng, ids, { tier: 1, traits: [{ kind: 'multi', count: 2 }] }),
    case: [{ id: 'rubber_band', param: null }, { id: 'les_jumeaux', param: null }, { id: 'binder_divider', param: null }],
    hands: ['pair', 'twopair'],
  },
  {
    id: 'pierrot', name: 'Pierrot', lane: 'Low cards', leans: '2 through 6',
    deck: (rng, ids) => shuffled(rng, SUITS.flatMap(s => [2, 3, 4, 5, 6].map(r => card(ids, r, s)))).slice(0, LANE_DECK),
    upgrade: (rng, ids) => card(ids, randInt(rng, 2, 6), pick(rng, SUITS), { finish: 'holo' }),
    case: [{ id: 'low_ball', param: null }, { id: 'petite_monnaie', param: null }, { id: 'odd_lot', param: null }],
    hands: ['pair', 'straight'],
  },
  {
    id: 'domino', name: 'Le Domino Noir', lane: 'Straights', leans: 'runs of connected ranks',
    deck: (rng, ids) => {
      const lo = randInt(rng, 2, 6)
      const two = shuffled(rng, SUITS).slice(0, 2)
      return two.flatMap(s => Array.from({ length: 9 }, (_, i) => card(ids, lo + i, s)))
    },
    upgrade: (rng, ids) => anyCard(rng, ids, { tier: 1, traits: [{ kind: 'bridge' }] }),
    case: [{ id: 'straight_edge', param: null }, { id: 'ligne_droite', param: null }, { code: 'straight' }],
    hands: ['straight'],
  },
  {
    id: 'domino_red', name: 'Le Domino Rouge', lane: 'Money', leans: 'Gold Borders', bets: 'reckless',
    deck: (rng, ids) => fill(rng, ids, [0, 1, 2].map(() => anyCard(rng, ids, { stamp: 'gold' }))),
    upgrade: (rng, ids) => anyCard(rng, ids, { stamp: 'gold', finish: 'foil' }),
    case: [{ id: 'price_sticker', param: null }, { id: 'le_flambeur', param: null }, { id: 'tournament_badge', param: null }],
    hands: ['pair', 'twopair'],
  },
  {
    id: 'arlequin', name: 'Arlequin', lane: 'Finishes', leans: 'Finishes and Stickers',
    deck: (rng, ids) => fill(rng, ids, [
      ...[0, 1, 2, 3].map(() => anyCard(rng, ids, { finish: pick(rng, ['foil', 'holo', 'misprint'] as const) })),
      anyCard(rng, ids, { variant: 'sticker' }),
    ]),
    upgrade: (rng, ids) => anyCard(rng, ids, { finish: pick(rng, ['foil', 'holo'] as const) }),
    case: [{ id: 'black_light', param: null }, { id: 'vitrine', param: null }, { id: 'penny_sleeve', param: null }],
    hands: ['pair', 'flush'],
  },
  {
    id: 'queen_hearts', name: 'La Dame de Cœur', lane: '♥ Flushes', leans: 'Hearts and Holo',
    deck: (rng, ids) => {
      const hearts = ranks(rng, 10).map((r, i) => card(ids, r, 'H', i === 0 ? { finish: 'holo' } : {}))
      return fill(rng, ids, hearts)
    },
    upgrade: (rng, ids) => card(ids, randInt(rng, 2, 14), 'H', { finish: 'holo' }),
    case: [{ id: 'color_binder', param: null }, { id: 'sommelier', param: null }, { id: 'playmat', param: 'H' }],
    hands: ['flush'],
  },
  {
    id: 'king_spades', name: 'Le Roi de Pique', lane: 'Flambé', leans: '★ cards',
    deck: (rng, ids) => fill(rng, ids, [0, 1].map(() => anyCard(rng, ids, { tier: 1, traits: [{ kind: 'multi', count: 2 }] }))),
    upgrade: (rng, ids) => anyCard(rng, ids, { tier: 1, traits: [{ kind: 'multi', count: 2 }] }),
    case: [{ id: 'forge_hammer', param: null }, { id: 'flamme_bleue', param: null }, { id: 'card_sleeves', param: null }],
    hands: ['pair', 'trips'],
  },
  {
    id: 'owl', name: 'La Chouette', lane: 'Grade', leans: 'graded cards and Prism',
    deck: (rng, ids) => fill(rng, ids, [
      ...[0, 1, 2].map(() => anyCard(rng, ids, { grade: randInt(rng, 6, 9) })),
      anyCard(rng, ids, { finish: 'prism' }),
    ]),
    upgrade: (rng, ids) => anyCard(rng, ids, { grade: randInt(rng, 7, 10) }),
    case: [{ id: 'psa_slab', param: null }, { id: 'commissaire', param: null }, { id: 'thin_binder', param: null }],
    hands: ['pair', 'twopair'],
  },
  {
    id: 'scaramouche', name: 'Scaramouche', lane: 'Junk', leans: 'Bulk and knockoffs',
    deck: (rng, ids) => fill(rng, ids, [
      newBulk(ids, 0), newBulk(ids, 0), newBulk(ids, 0),
      anyCard(rng, ids, { knockoff: { kind: 'crayon' } }),
      anyCard(rng, ids, { knockoff: { kind: 'marked' } }),
      anyCard(rng, ids, { knockoff: { kind: 'wrongsuit', suit: pick(rng, SUITS) } }),
    ]),
    upgrade: (rng, ids) => chance(rng, 0.5) ? anyCard(rng, ids, { knockoff: { kind: 'marked' } }) : anyCard(rng, ids, { knockoff: { kind: 'crayon' } }),
    case: [{ id: 'bulk_bin', param: null }, { id: 'ferrailleur', param: null }, { id: 'participation_trophy', param: null }],
    hands: ['high', 'pair'],
  },
  {
    id: 'fox', name: 'Le Renard', lane: 'Jokers', leans: '2 Jokers and Signed cards',
    deck: (rng, ids) => fill(rng, ids, [
      ...shuffled(rng, REAL_JOKERS).slice(0, 2).map(j => anyCard(rng, ids, { joker: j })),
      anyCard(rng, ids, { stamp: 'signed' }), anyCard(rng, ids, { stamp: 'signed' }),
    ]),
    upgrade: (rng, ids) => anyCard(rng, ids, { stamp: 'signed' }),
    case: [{ id: 'specialist', param: null }, { id: 'bis', param: null }, { id: 'combo_platter', param: null }],
    hands: ['pair', 'twopair'],
  },
]

export function getRival(id: RivalId): RivalDef {
  const r = RIVALS.find(x => x.id === id)
  if (!r) throw new Error(`unknown rival ${id}`)
  return r
}

// the 4 masks of a run, one per table. decided by the seed alone so the daily is the same for everyone
export function rivalOrder(seed: string): RivalId[] {
  return shuffled(makeRng(`${seed}:rivals`), RIVALS.map(r => r.id)).slice(0, 4)
}

export type RivalBuild = { id: RivalId; deck: Card[]; display: Owned[]; codes: HandType[] }

// step = tables of growth: table 1 is step 0. easy is a step behind, high roller a step ahead plus a starting rare
export function buildRival(id: RivalId, step: number, rare: boolean, stream: string, ids: Ids): RivalBuild {
  const def = getRival(id)
  const rng = makeRng(stream)
  const deck = def.deck(rng, ids)
  if (deck.length !== LANE_DECK) throw new Error(`${id} lane deck has ${deck.length} cards`)
  for (let i = 0; i < UPGRADES_PER_STEP * step; i++) deck.push(def.upgrade(rng, ids))
  const display: Owned[] = []
  const codes: HandType[] = []
  for (let i = 0; i < LEVELS_PER_STEP * step; i++) codes.push(...def.hands)
  for (const item of def.case.slice(0, Math.min(step, def.case.length))) {
    if ('code' in item) codes.push(item.code)
    else {
      const d = COLLECTIBLES.find(c => c.id === item.id)
      if (!d) throw new Error(`${id} case has unknown collectible ${item.id}`)
      display.push({ id: item.id, param: item.param ?? rollParam(d, rng) })
    }
  }
  if (rare) {
    const pool = COLLECTIBLES.filter(c => c.rarity === 'rare' && !display.some(o => o.id === c.id))
    const d = pick(rng, pool)
    display.push({ id: d.id, param: rollParam(d, rng) })
  }
  return { id, deck, display, codes }
}
