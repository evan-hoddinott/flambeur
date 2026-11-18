// starter boxes: like balatro's decks, each one changes a rule, not just the cards.
// the run opens by ripping a starter box that offers 3 of these (same seed, same 3)
import { SUITS, SUIT_GLYPH, cardValue, isSpecial, newCard, standardDeck, type Card, type Ids, type Suit } from './cards.ts'
import { DISPLAY_SLOTS, START_BANKROLL } from './economy.ts'
import type { HandType } from './hands.ts'
import type { Owned } from './collectibles.ts'
import { makeRng, next, pick, shuffled, type Rng } from './rng.ts'

// the rule knobs a starter can turn. opponents always play default rules
export type Rules = {
  startBankroll: number
  displaySlots: number
  freeMulligans: number // per table, these don't shrink your hand
  anteBonus: number // added to every ante and max
  packDiscount: number // $ off every paid pack
  startDisplay: Owned[] // collectibles already in the case
  hypeMod: Partial<Record<HandType, number>> // hand base hype changes
}

export const DEFAULT_RULES: Rules = {
  startBankroll: START_BANKROLL,
  displaySlots: DISPLAY_SLOTS,
  freeMulligans: 0,
  anteBonus: 0,
  packDiscount: 0,
  startDisplay: [],
  hypeMod: {},
}

export type StarterId = 'classic' | 'forge' | 'suited' | 'highroller' | 'bargain' | 'collector' | 'standard'

export type Starter = {
  id: StarterId
  name: string
  deckText: string
  twist: string
  rules: Partial<Rules>
  deck: (rng: Rng, ids: Ids) => Card[]
}

// 7 through A in every suit = 32 cards. smaller deck = the stuff you add actually shows up
export function shortDeck(ids: Ids, suits: readonly Suit[] = SUITS, lowest = 7): Card[] {
  const deck: Card[] = []
  for (const suit of suits) for (let rank = lowest; rank <= 14; rank++) deck.push(newCard(ids, rank, suit))
  return deck
}

export const STARTERS: readonly Starter[] = [
  {
    id: 'classic', name: 'Classic Box', deckText: '7 through A',
    twist: 'First mulligan each Table is free (no hand size cost)', rules: { freeMulligans: 1 },
    deck: (_rng, ids) => shortDeck(ids),
  },
  {
    id: 'forge', name: 'Flambé Box', deckText: '7 through A, a Q★ Twin and K★ Twin swapped in',
    twist: 'Starts with a Chalumeau in your case (+20 Value per scored flambéed card)', rules: { startDisplay: [{ id: 'forge_hammer', param: null }] },
    deck: (rng, ids) => {
      const deck = shortDeck(ids)
      for (const rank of [12, 13]) {
        const plain = deck.filter(c => c.rank === rank)
        const swap = pick(rng, plain)
        swap.tier = 1
        swap.traits = [{ kind: 'multi', count: 2 }]
      }
      return deck
    },
  },
  {
    id: 'suited', name: 'Suited Box', deckText: 'two copies of 7 through A, only ♥ and ♠',
    twist: 'Flushes come easy, but Flush scores −2 Hype', rules: { hypeMod: { flush: -2 } },
    deck: (_rng, ids) => [...shortDeck(ids, ['H', 'S']), ...shortDeck(ids, ['H', 'S'])],
  },
  {
    id: 'highroller', name: 'High Roller', deckText: '7 through A',
    twist: 'Start with $30, but every ante and max is +$1', rules: { startBankroll: 30, anteBonus: 1 },
    deck: (_rng, ids) => shortDeck(ids),
  },
  {
    id: 'bargain', name: 'Bargain Bin', deckText: '7 through A, 3 of them Damaged',
    twist: 'Every paid pack costs $1 less', rules: { packDiscount: 1 },
    deck: (rng, ids) => {
      const deck = shortDeck(ids)
      for (const c of shuffled(rng, deck).slice(0, 3)) c.stamp = 'damaged'
      return deck
    },
  },
  {
    id: 'collector', name: 'Collector Box', deckText: '8 through A plus 4 Foil copies',
    twist: 'Only 4 display case slots', rules: { displaySlots: 4 },
    // 28 cards + 4 foil copies of random ones = 32 for the row draft
    deck: (rng, ids) => {
      const deck = shortDeck(ids, SUITS, 8)
      const copies = shuffled(rng, deck).slice(0, 4).map(c => newCard(ids, c.rank, c.suit, { finish: 'foil' }))
      return [...deck, ...copies]
    },
  },
  // the old 52 card start. not offered in the box, kept so the sim can compare against it (drafts 39)
  {
    id: 'standard', name: 'Standard Deck', deckText: '52 cards',
    twist: 'none', rules: {},
    deck: (_rng, ids) => standardDeck(ids),
  },
]

export const OFFERED: readonly StarterId[] = ['classic', 'forge', 'suited', 'highroller', 'bargain', 'collector']

export function getStarter(id: StarterId): Starter {
  const s = STARTERS.find(x => x.id === id)
  if (!s) throw new Error(`unknown starter ${id}`)
  return s
}

// 3 different boxes, decided by the stream name alone so a daily run offers everyone the same 3
export function starterOffer(stream: string): StarterId[] {
  return shuffled(makeRng(`${stream}:starter`), OFFERED).slice(0, 3)
}

export function rulesFor(id: StarterId): Rules {
  return { ...DEFAULT_RULES, ...getStarter(id).rules }
}

// ---------- row draft ----------
// every box holds 32 cards, dealt into 4 rows of 8. you keep 3 rows = 24 card deck.
// special cards (twins, damaged, foils) each land in a different row, so dropping a row costs you at most one of them

export const DRAFT_ROWS = 4
export const DRAFT_PICKS = 3

export type DraftRow = { cards: Card[]; label: string }

// stream = which rng stream deals the box (a match uses `seed:seat`), ids = the match's card id counter
export function draftRows(stream: string, id: StarterId, ids: Ids): DraftRow[] {
  const rng = makeRng(`${stream}:draft`)
  const deck = getStarter(id).deck(rng, ids)
  if (deck.length % DRAFT_ROWS !== 0) throw new Error(`${id} box has ${deck.length} cards, can't split into ${DRAFT_ROWS} rows`)
  const size = deck.length / DRAFT_ROWS
  const rows: Card[][] = Array.from({ length: DRAFT_ROWS }, () => [])
  const specials = shuffled(rng, deck.filter(isSpecial))
  if (specials.length > DRAFT_ROWS) throw new Error(`${id} box has more specials than rows`)
  const start = Math.floor(next(rng) * DRAFT_ROWS)
  specials.forEach((c, i) => rows[(start + i) % DRAFT_ROWS].push(c))
  let r = 0
  for (const c of shuffled(rng, deck.filter(c => !isSpecial(c)))) {
    while (rows[r].length >= size) r++
    rows[r].push(c)
  }
  return rows.map(cards => {
    const sorted = cards.slice().sort((a, b) => b.rank - a.rank || a.suit.localeCompare(b.suit))
    return { cards: sorted, label: rowLabel(sorted) }
  })
}

export function validPicks(picks: number[]): boolean {
  return picks.length === DRAFT_PICKS && new Set(picks).size === DRAFT_PICKS && picks.every(i => Number.isInteger(i) && i >= 0 && i < DRAFT_ROWS)
}

// the deck you keep from the draft. picks = 3 different row indexes
export function draftDeck(rows: DraftRow[], picks: number[]): Card[] {
  if (!validPicks(picks)) throw new Error(`pick ${DRAFT_PICKS} different rows, got ${picks.join(',')}`)
  return picks.flatMap(i => rows[i].cards)
}

// row draft for bots (the rival and the sim): drop the row with the least card value, specials count +15
export function autoDraft(rows: DraftRow[]): number[] {
  const worth = (row: DraftRow) => row.cards.reduce((n, c) => n + cardValue(c) + (isSpecial(c) ? 15 : 0), 0)
  const drop = rows.reduce((lo, row, i) => (worth(row) < worth(rows[lo]) ? i : lo), 0)
  return rows.map((_, i) => i).filter(i => i !== drop)
}

// short hint at what a row is good for. thresholds are ~2 above what a random row of 8 averages
export function rowLabel(cards: Card[]): string {
  const tags: string[] = []
  const ranks = new Map<number, number>()
  const suits = new Map<Suit, number>()
  for (const c of cards) {
    ranks.set(c.rank, (ranks.get(c.rank) ?? 0) + 1)
    suits.set(c.suit, (suits.get(c.suit) ?? 0) + 1)
  }
  const pairs = [...ranks.values()].filter(n => n >= 2).length
  const [topSuit, topCount] = [...suits.entries()].sort((a, b) => b[1] - a[1])[0]
  const high = cards.filter(c => c.rank >= 12).length
  const low = cards.filter(c => c.rank <= 9).length
  let run = 1
  let longest = 1
  const distinct = [...ranks.keys()].sort((a, b) => a - b)
  for (let i = 1; i < distinct.length; i++) {
    run = distinct[i] === distinct[i - 1] + 1 ? run + 1 : 1
    longest = Math.max(longest, run)
  }
  if (pairs >= 3) tags.push('pair-heavy')
  if (topCount >= (suits.size <= 2 ? 6 : 4)) tags.push(`suited ${SUIT_GLYPH[topSuit]}`)
  if (high >= 5) tags.push('high cards')
  if (low >= 5) tags.push('low cards')
  if (longest >= 5) tags.push('connected')
  if (tags.length === 0) tags.push('mixed')
  const special = cards.find(isSpecial)
  const extra = !special ? '' : special.tier > 0 ? 'has a ★ Twin' : special.stamp === 'damaged' ? 'has a Damaged' : special.finish === 'foil' ? 'has a Foil' : 'has a special'
  return [...tags.slice(0, 2), extra].filter(Boolean).join(' · ')
}
