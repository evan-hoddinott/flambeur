// tables: the 9 rounds are 3 tables (1-3, 4-6, 7-9). the deck only shuffles at the start of a table.
// every round you're dealt a fresh hand. played cards go to the discard until the next table,
// unplayed ones go back into the pile. folding mucks the whole hand
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

// start of a table: everything goes back into one shuffled pile
export function startTable(p: Piles, rng: Rng): void {
  p.pile = shuffled(rng, allCards(p))
  p.hand = []
  p.discard = []
}

// a fresh hand off the top. short if the pile runs low, empty means you lose the round
export function dealFresh(p: Piles, size: number): Card[] {
  if (p.hand.length > 0) throw new Error('dealing on top of a hand that was never cleaned up')
  p.hand = p.pile.splice(0, Math.max(0, size))
  pullStuck(p)
  return p.hand
}

// beer-stained pairs are drawn together: half a pair in hand pulls the other half off the pile, even past hand size
function pullStuck(p: Piles): void {
  for (let i = 0; i < p.hand.length; i++) {
    const mate = stuckMate(p.hand[i], p.pile)
    if (!mate) continue
    p.pile.splice(p.pile.indexOf(mate), 1)
    p.hand.push(mate)
  }
}

// throw back any number, redraw one fewer (free = redraw them all). the redraw comes off the top first,
// then the tossed cards get shuffled into the pile, so you can't redraw the same cards
export function mulliganHand(p: Piles, tossIds: number[], rng: Rng, free: boolean): Card[] {
  const toss = new Set(tossIds)
  const tossed = p.hand.filter(c => toss.has(c.id))
  if (tossed.length !== toss.size || toss.size === 0) throw new Error('mulligan needs cards that are in hand')
  p.hand = p.hand.filter(c => !toss.has(c.id))
  const drawn = p.pile.splice(0, free ? tossed.length : tossed.length - 1)
  p.hand.push(...drawn)
  pullStuck(p)
  for (const c of tossed) shuffleIn(p, c, rng)
  return drawn
}

// new cards (deck pulls, forges, bulk) go somewhere random in the current pile
export function shuffleIn(p: Piles, card: Card, rng: Rng): void {
  p.pile.splice(randInt(rng, 0, p.pile.length), 0, card)
}

// end of a round. played cards go to the discard (gone = forged away or torn, those leave for good).
// muck = fold or forge: the rest of the hand goes to the discard too. otherwise it goes back into the pile
export function cleanup(p: Piles, played: Card[], gone: Set<number>, muck: boolean, rng: Rng): void {
  const ids = new Set(played.map(c => c.id))
  if (p.hand.filter(c => ids.has(c.id)).length !== ids.size) throw new Error('played a card that is not in hand')
  const rest = p.hand.filter(c => !ids.has(c.id))
  p.hand = []
  p.discard.push(...played.filter(c => !gone.has(c.id)))
  if (muck) p.discard.push(...rest)
  else for (const c of rest) shuffleIn(p, c, rng)
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
