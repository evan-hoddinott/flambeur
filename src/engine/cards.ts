export type Suit = 'S' | 'H' | 'D' | 'C'
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C']
export const SUIT_GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }

export type Finish = 'foil' | 'holo' | 'prism' | 'misprint'
export type Stamp = 'first' | 'signed' | 'gold' | 'damaged'

// special card types from the pack lanes. a card is at most one of these
export type Variant = 'chase' | 'sticker' | 'rookie' | 'jumbo'

export const VARIANTS: Record<Variant, { name: string; text: string }> = {
  chase: { name: 'Chase', text: 'Sells for $10 from the binder' },
  sticker: { name: 'Sticker', text: 'Copies the best Finish it is played with' },
  rookie: { name: 'Rookie', text: '+1 Value for every round it spends in your deck' },
  jumbo: { name: 'Jumbo', text: 'Scores its Value 3×, takes 2 of your 5 play slots' },
}

// joker cards are real playing cards with a rule on top. max 2 in a deck. the crayon joker is the off-brand one
export type JokerId = 'sticky' | 'double' | 'courtier' | 'catalyst' | 'bluff' | 'rivals' | 'crayon'

// jokers settle once per round: "played" = played in any of the round's hands (a flamber throws its cards, it
// doesn't play them). ids stay as they were when bluff became poker face
export const JOKERS: Record<JokerId, { name: string; text: string }> = {
  sticky: { name: 'Sticky Fingers', text: "Win the round with it played: steal a random card from the rival's deck" },
  double: { name: 'Double or Nothing', text: 'Everything this round pays or costs ×2' },
  courtier: { name: 'Courtier', text: 'Counts as whichever J, Q or K makes your best hand' },
  catalyst: { name: 'Catalyst', text: 'Flambé with it: the new card comes out one ★ higher' },
  bluff: { name: 'Poker Face', text: 'Played in a round you lose: your Max bet comes back' },
  rivals: { name: "Rival's Card", text: "At each reveal it copies the rival's highest played card" },
  crayon: { name: 'Crayon Joker', text: 'Each time it is played it copies a random Joker' },
}

export const REAL_JOKERS: readonly JokerId[] = ['sticky', 'double', 'courtier', 'catalyst', 'bluff', 'rivals']
export const MAX_JOKERS = 2

// off-brand knockoffs take the stamp slot: a card has a stamp or a knockoff, never both
export type Knockoff =
  | { kind: 'crayon' } // any rank, 0 value
  | { kind: 'marked' } // +1 grade, the rival sees it face up once it's locked
  | { kind: 'wrongsuit'; suit: Suit } // also counts as this second suit
  | { kind: 'beer'; stuckTo: number } // +6 hype. drawn, tossed and played together with card stuckTo

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
  knockoff: Knockoff | null
  variant: Variant | null
  joker: JokerId | null
  tier: number // 0 = never forged, 1..3 = ★
  traits: Trait[] // at most `tier` of them
  grind: number // +value from no-pair flambés, the meme build
  bonusHype: number // grows on 1st Edition cards
  grade: number | null // 1..10 once graded
  pulledRound: number // 0 = starting deck
  bulk: boolean // stone card a forge leaves behind: no rank or suit, always +5 value when played
}

export const MAX_TIER = 3

// the match owns the id counter, so a replay hands out the same ids as the live match did
export type Ids = { nextCardId: number }

export function newCard(ids: Ids, rank: number, suit: Suit, extra: Partial<Omit<Card, 'id'>> = {}): Card {
  if (rank < 2 || rank > 14) throw new Error(`bad rank ${rank}`)
  return {
    id: ids.nextCardId++,
    rank,
    suit,
    finish: null,
    stamp: null,
    knockoff: null,
    variant: null,
    joker: null,
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

export function newBulk(ids: Ids, round: number): Card {
  return newCard(ids, 2, 'S', { bulk: true, pulledRound: round })
}

export function standardDeck(ids: Ids): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) deck.push(newCard(ids, rank, suit))
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

export function isCrayon(card: Card): boolean {
  return card.knockoff?.kind === 'crayon'
}

// the suits a card counts as for a flush, ignoring the wild trait (hands.ts handles that)
export function suitsOf(card: Card): Suit[] {
  return card.knockoff?.kind === 'wrongsuit' ? [card.suit, card.knockoff.suit] : [card.suit]
}

// the other half of a beer-stained pair, if it's in `cards`
export function stuckMate(card: Card, cards: Card[]): Card | undefined {
  const ko = card.knockoff
  if (ko?.kind === 'beer') return cards.find(c => c.id === ko.stuckTo)
  return cards.find(c => c.knockoff?.kind === 'beer' && c.knockoff.stuckTo === card.id)
}

export function knockoffName(k: Knockoff): string {
  if (k.kind === 'wrongsuit') return `Wrong Suit/${SUIT_GLYPH[k.suit]}`
  return { crayon: 'Crayon', marked: 'Marked', beer: 'Beer-stained' }[k.kind]
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

// plural rank for display: Ks, 8s, As
export function rankPlural(rank: number): string {
  return `${rankLabel(rank)}s`
}

// a trait's full name on a card: household spells out its full house, "Household (Ks over 8s)"
export function traitLabel(card: Card, t: Trait): string {
  if (t.kind === 'household') return `Household (${rankPlural(card.rank)} over ${rankPlural(t.pairRank)})`
  return traitName(t)
}

export function cardName(card: Card): string {
  if (card.bulk) return 'Bulk'
  const suit = isWild(card) ? '★' : SUIT_GLYPH[card.suit]
  const stars = card.tier > 0 ? ` ${'★'.repeat(card.tier)}` : ''
  return `${rankLabel(card.rank)}${suit}${stars}`
}

// 2-10 face, JQK 10, A 11. grind is the no-pair flambé bonus
export function cardValue(card: Card): number {
  if (isCrayon(card)) return card.grind
  const face = card.rank === 14 ? 11 : Math.min(card.rank, 10)
  return face + card.grind
}

export function isForged(card: Card): boolean {
  return card.tier > 0
}

export function isSpecial(card: Card): boolean {
  return card.finish !== null || card.stamp !== null || card.knockoff !== null || card.variant !== null || card.joker !== null || card.grade !== null || isForged(card)
}

export function sellPrice(card: Card): number {
  if (card.bulk) throw new Error('bulk can not be sold')
  if (card.variant === 'chase') return 10
  if (card.grade !== null) return Math.max(1, Math.floor(card.grade / 2))
  if (isForged(card)) return 1 + card.tier
  if (card.finish !== null || card.stamp !== null || card.knockoff !== null) return 2
  return 1
}

const FINISH_ORDER: readonly Finish[] = ['prism', 'foil', 'holo', 'misprint']

// play slots a set of cards takes. a jumbo takes 2
export function playSlots(cards: Card[]): number {
  return cards.reduce((n, c) => n + (c.variant === 'jumbo' ? 2 : 1), 0)
}

export function bestFinish(cards: Card[]): Finish | null {
  for (const f of FINISH_ORDER) if (cards.some(c => c.finish === f)) return f
  return null
}
