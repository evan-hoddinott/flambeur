// compare mode: what adding cards does to a deck. counts before → after, plus short payoff lines from real rules.
// a rule that can't be said in one line doesn't get a line
import { MAX_JOKERS, SUITS, SUIT_GLYPH, isCrayon, rankLabel, type Card, type Suit } from './cards.ts'

export type DeckDelta = { suit: Record<Suit, [number, number]>; rank: Record<number, [number, number]>; lines: string[] }

const FLUSH = 5 // cards of one suit a flush needs

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`
}

const RANK_HAND = ['pair', 'trips', 'quads'] // what a 2nd, 3rd, 4th copy of a rank makes possible

// suits count printed suits, ranks count printed ranks. bulk has neither and a crayon has no rank of its own
export function deckDelta(deck: Card[], add: Card[]): DeckDelta {
  const suits = new Map<Suit, number>(SUITS.map(s => [s, 0]))
  const ranks = new Map<number, number>()
  for (let r = 2; r <= 14; r++) ranks.set(r, 0)
  let bulk = 0
  let jokers = 0
  const count = (c: Card) => {
    if (c.bulk) {
      bulk++
      return
    }
    suits.set(c.suit, suits.get(c.suit)! + 1)
    if (!isCrayon(c)) ranks.set(c.rank, ranks.get(c.rank)! + 1)
    if (c.joker) jokers++
  }
  for (const c of deck) count(c)
  const before = { suits: new Map(suits), ranks: new Map(ranks) }

  const lines: string[] = []
  const say = (line: string) => {
    if (!lines.includes(line)) lines.push(line)
  }
  for (const c of add) {
    count(c)
    if (c.bulk) {
      say(`${ordinal(bulk)} Ash`)
      continue
    }
    const n = suits.get(c.suit)!
    // your top suit with enough for a flush
    if (n >= FLUSH && SUITS.every(s => suits.get(s)! <= n)) say(`${ordinal(n)} ${SUIT_GLYPH[c.suit]}: flush lane`)
    const copies = ranks.get(c.rank)!
    if (!isCrayon(c) && copies >= 2 && copies <= 4) say(`makes a ${rankLabel(c.rank)} ${RANK_HAND[copies - 2]} possible`)
    if (isCrayon(c)) say('Crayon: joins any rank')
    if (c.joker && jokers > MAX_JOKERS) say(`${ordinal(jokers)} Joker: over the cap, goes to the binder`)
  }

  const suit = {} as Record<Suit, [number, number]>
  for (const s of SUITS) suit[s] = [before.suits.get(s)!, suits.get(s)!]
  const rank: Record<number, [number, number]> = {}
  for (const [r, n] of ranks) rank[r] = [before.ranks.get(r)!, n]
  return { suit, rank, lines }
}
