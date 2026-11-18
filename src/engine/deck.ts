// your deck is three piles: hand, pile, discard. the whole deck shuffles at the start of every round and you're
// dealt 8. played and discarded cards go to the discard for the rest of the round, unplayed ones stay in your hand,
// and after each hand you refill back to 8 from the pile. at the end of the round everything goes back together
import { stuckMate, type Card, type Suit } from './cards.ts'
import { randInt, shuffled, type Rng } from './rng.ts'

export type Piles = {
  hand: Card[]
  pile: Card[] // index 0 is the top
  discard: Card[]
}

export function allCards(p: Piles): Card[] {
  return [...p.hand, ...p.pile, ...p.discard]
}

export function deckSize(p: Piles): number {
  return p.hand.length + p.pile.length + p.discard.length
}

// start of a round: everything into one pile, sorted by id first so only the seed and the cards decide the order
// (a shop restock that didn't change the deck can't change the deal)
export function shuffleDeck(p: Piles, rng: Rng): void {
  p.pile = shuffled(rng, allCards(p).sort((a, b) => a.id - b.id))
  p.hand = []
  p.discard = []
}

// draw up to n off the top. short if the pile runs low. a beer-stained card pulls its mate along, even past n
export function draw(p: Piles, n: number): Card[] {
  const drawn = p.pile.splice(0, Math.max(0, n))
  p.hand.push(...drawn)
  for (let i = 0; i < p.hand.length; i++) {
    const mate = stuckMate(p.hand[i], p.pile)
    if (!mate) continue
    p.pile.splice(p.pile.indexOf(mate), 1)
    p.hand.push(mate)
    drawn.push(mate)
  }
  return drawn
}

// back up to `size` cards in hand
export function refill(p: Piles, size: number): Card[] {
  return draw(p, size - p.hand.length)
}

// hand cards to the discard (played, discarded, or eaten by a flambé leftover). throws on a card not in hand
export function toDiscard(p: Piles, ids: number[]): Card[] {
  const out: Card[] = []
  for (const id of ids) {
    const i = p.hand.findIndex(c => c.id === id)
    if (i < 0) throw new Error(`card ${id} is not in hand`)
    out.push(p.hand.splice(i, 1)[0])
  }
  p.discard.push(...out)
  return out
}

// cards leave the deck for good (flambéd away, torn, shredded)
export function removeFromHand(p: Piles, ids: number[]): Card[] {
  const out: Card[] = []
  for (const id of ids) {
    const i = p.hand.findIndex(c => c.id === id)
    if (i < 0) throw new Error(`card ${id} is not in hand`)
    out.push(p.hand.splice(i, 1)[0])
  }
  return out
}

// end of a round: everything back into the pile. the next round shuffles it anyway
export function cleanup(p: Piles): void {
  p.pile = allCards(p)
  p.hand = []
  p.discard = []
}

// new cards between rounds (deck pulls, spoils) go somewhere in the pile
export function shuffleIn(p: Piles, card: Card, rng: Rng): void {
  p.pile.splice(randInt(rng, 0, p.pile.length), 0, card)
}

// remove one card from the pile or discard for good (grading, binning bulk). only between rounds
export function takeOut(p: Piles, id: number): Card {
  if (p.hand.length > 0) throw new Error('taking a card out mid-round')
  for (const from of [p.pile, p.discard]) {
    const i = from.findIndex(c => c.id === id)
    if (i >= 0) return from.splice(i, 1)[0]
  }
  throw new Error(`card ${id} is not in the deck`)
}

// what's left in a pile, for the deck viewer. sorted high to low, bulk last
export function pileView(cards: Card[]): { cards: Card[]; byRank: Map<number, number>; bySuit: Map<Suit, number>; bulk: number } {
  const sorted = cards.slice().sort((a, b) => Number(a.bulk) - Number(b.bulk) || b.rank - a.rank || a.suit.localeCompare(b.suit) || a.id - b.id)
  const byRank = new Map<number, number>()
  const bySuit = new Map<Suit, number>()
  let bulk = 0
  for (const c of sorted) {
    if (c.bulk) {
      bulk++
      continue
    }
    byRank.set(c.rank, (byRank.get(c.rank) ?? 0) + 1)
    bySuit.set(c.suit, (bySuit.get(c.suit) ?? 0) + 1)
  }
  return { cards: sorted, byRank, bySuit, bulk }
}
