export type Suit = 'S' | 'H' | 'D' | 'C'
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C']
export const SUIT_GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }

export type Finish = 'foil' | 'holo' | 'prism' | 'misprint'
export type Stamp = 'first' | 'signed' | 'gold' | 'damaged'

// what a forged card can do. every forgeable hand gives one (see forge.ts)
export type Trait =
  | { kind: 'multi'; count: 2 | 3 | 4 } // twin / triplet / quad: counts as N of its rank
  | { kind: 'split'; rank: number } // also counts as one of this second rank
  | { kind: 'household'; pairRank: number } // full house by itself: 3 of its rank + 2 of pairRank
  | { kind: 'bridge' } // any rank inside a straight
  | { kind: 'wild' } // every suit
  | { kind: 'crown' } // bridge + wild + permanent +1 grade

export type Card = {
  id: number
  rank: number // 2..14, ace is 14
  suit: Suit
  finish: Finish | null
  stamp: Stamp | null
  tier: number // 0 = never forged, 1..3 = ★
  traits: Trait[] // at most `tier` of them
  grind: number // +value from high card forges, the meme build
  bonusHype: number // grows on 1st Edition cards
  grade: number | null // 1..10 once graded
  pulledRound: number // 0 = starting deck
  bulk: boolean // stone card a forge leaves behind: no rank or suit, always +5 value when played
}

export const MAX_TIER = 3

// ids only need to be unique, they never feed the rng
let nextId = 1

export function newCard(rank: number, suit: Suit, extra: Partial<Omit<Card, 'id'>> = {}): Card {
  if (rank < 2 || rank > 14) throw new Error(`bad rank ${rank}`)
  return {
    id: nextId++,
    rank,
    suit,
    finish: null,
    stamp: null,
    tier: 0,
    traits: [],
    grind: 0,
    bonusHype: 0,
    grade: null,
    pulledRound: 0,
    bulk: false,
    ...extra,
  }
}

// every card a forge eats beyond the first leaves one of these. rank/suit are placeholders, nothing reads them
export const BULK_VALUE = 5

export function newBulk(round: number): Card {
  return newCard(2, 'S', { bulk: true, pulledRound: round })
}

export function standardDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) deck.push(newCard(rank, suit))
  }
  return deck
}

export function rankLabel(rank: number): string {
  if (rank <= 10) return String(rank)
  return { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[rank] as string
}

export function has(card: Card, kind: Trait['kind']): boolean {
  return card.traits.some(t => t.kind === kind)
}

export function isWild(card: Card): boolean {
  return has(card, 'wild') || has(card, 'crown')
}

export function isBridge(card: Card): boolean {
  return has(card, 'bridge') || has(card, 'crown')
}

// how many of each rank this card counts as, with and without its traits
export function rankCounts(card: Card, useTraits = true): Map<number, number> {
  const counts = new Map<number, number>([[card.rank, 1]])
  if (!useTraits) return counts
  const bump = (rank: number, n: number) => counts.set(rank, Math.max(counts.get(rank) ?? 0, n))
  for (const t of card.traits) {
    if (t.kind === 'multi') bump(card.rank, t.count)
    if (t.kind === 'split') bump(t.rank, 1)
    if (t.kind === 'household') {
      bump(card.rank, 3)
      bump(t.pairRank, 2)
    }
  }
  return counts
}

export function traitName(t: Trait): string {
  if (t.kind === 'multi') return { 2: 'Twin', 3: 'Triplet', 4: 'Quad' }[t.count]
  if (t.kind === 'split') return `Split/${rankLabel(t.rank)}`
  if (t.kind === 'household') return `Household/${rankLabel(t.pairRank)}`
  return { bridge: 'Bridge', wild: 'Wild Suit', crown: 'Crown' }[t.kind]
}

export function cardName(card: Card): string {
  if (card.bulk) return 'Bulk'
  const suit = isWild(card) ? '★' : SUIT_GLYPH[card.suit]
  const stars = card.tier > 0 ? ` ${'★'.repeat(card.tier)}` : ''
  return `${rankLabel(card.rank)}${suit}${stars}`
}

// 2-10 face, JQK 10, A 11. grind is the high card forge bonus
export function cardValue(card: Card): number {
  const face = card.rank === 14 ? 11 : Math.min(card.rank, 10)
  return face + card.grind
}

export function isForged(card: Card): boolean {
  return card.tier > 0
}

export function isSpecial(card: Card): boolean {
  return card.finish !== null || card.stamp !== null || card.grade !== null || isForged(card)
}

export function sellPrice(card: Card): number {
  if (card.bulk) throw new Error('bulk can not be sold')
  if (card.grade !== null) return Math.max(1, Math.floor(card.grade / 2))
  if (isForged(card)) return 1 + card.tier
  if (card.finish !== null || card.stamp !== null) return 2
  return 1
}

const FINISH_ORDER: readonly Finish[] = ['prism', 'foil', 'holo', 'misprint']

export function bestFinish(cards: Card[]): Finish | null {
  for (const f of FINISH_ORDER) if (cards.some(c => c.finish === f)) return f
  return null
}
