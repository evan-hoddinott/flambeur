// balatro style deck cycling: hand, draw pile and discard pile all persist across rounds.
// unplayed cards stay in hand, played and mulliganed cards go to discard,
// and an empty draw pile shuffles the discard back in
import type { Card, Suit } from './cards.ts'
import { randInt, shuffled, type Rng } from './rng.ts'

// the deck can never go below this many cards (forging and tearing check it)
export const DECK_FLOOR = 16

export type Piles = {
  hand: Card[]
  draw: Card[] // index 0 is the top
  discard: Card[]
}

export function allCards(p: Piles): Card[] {
  return [...p.hand, ...p.draw, ...p.discard]
}

export function deckSize(p: Piles): number {
  return p.hand.length + p.draw.length + p.discard.length
}

// draws up to n off the top. reshuffles the discard in when the draw pile runs dry.
// only comes up short if draw and discard are both empty
function drawCards(p: Piles, n: number, rng: Rng): { cards: Card[]; reshuffled: boolean } {
  const cards: Card[] = []
  let reshuffled = false
  while (cards.length < n) {
    if (p.draw.length === 0) {
      if (p.discard.length === 0) break
      p.draw = shuffled(rng, p.discard)
      p.discard = []
      reshuffled = true
    }
    cards.push(p.draw.shift()!)
  }
  return { cards, reshuffled }
}

// start of a round: whatever is still in hand stays, top up to hand size
export function refillHand(p: Piles, size: number, rng: Rng): { drawn: Card[]; reshuffled: boolean } {
  const { cards, reshuffled } = drawCards(p, Math.max(0, size - p.hand.length), rng)
  p.hand.push(...cards)
  if (p.hand.length < size) throw new Error(`deck too small to fill a hand of ${size}`)
  return { drawn: cards, reshuffled }
}

// toss these, draw that many. tossed cards hit the discard after the draw,
// so you only get them back if the rest of the deck runs out
export function mulliganHand(p: Piles, tossIds: number[], rng: Rng): { reshuffled: boolean } {
  const toss = new Set(tossIds)
  const tossed = p.hand.filter(c => toss.has(c.id))
  if (tossed.length !== toss.size) throw new Error('mulligan a card that is not in hand')
  p.hand = p.hand.filter(c => !toss.has(c.id))
  const first = drawCards(p, tossed.length, rng)
  p.discard.push(...tossed)
  const rest = drawCards(p, tossed.length - first.cards.length, rng)
  p.hand.push(...first.cards, ...rest.cards)
  return { reshuffled: first.reshuffled || rest.reshuffled }
}

// new cards (packs, forges) go somewhere random in the draw pile
export function shuffleIn(p: Piles, card: Card, rng: Rng): void {
  p.draw.splice(randInt(rng, 0, p.draw.length), 0, card)
}

// played cards leave the hand. the ones still around go to discard, gone = forged away or torn
export function discardPlayed(p: Piles, played: Card[], gone: Set<number>): void {
  const ids = new Set(played.map(c => c.id))
  if (p.hand.filter(c => ids.has(c.id)).length !== ids.size) throw new Error('played a card that is not in hand')
  p.hand = p.hand.filter(c => !ids.has(c.id))
  p.discard.push(...played.filter(c => !gone.has(c.id)))
}

// what's left to draw, for the deck viewer. sorted high to low
export function drawPileView(p: Piles): { cards: Card[]; byRank: Map<number, number>; bySuit: Map<Suit, number> } {
  const cards = p.draw.slice().sort((a, b) => b.rank - a.rank || a.suit.localeCompare(b.suit))
  const byRank = new Map<number, number>()
  const bySuit = new Map<Suit, number>()
  for (const c of cards) {
    byRank.set(c.rank, (byRank.get(c.rank) ?? 0) + 1)
    bySuit.set(c.suit, (bySuit.get(c.suit) ?? 0) + 1)
  }
  return { cards, byRank, bySuit }
}
