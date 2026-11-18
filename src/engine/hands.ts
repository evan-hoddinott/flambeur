import { SUITS, isBridge, isCrayon, isWild, rankCounts, suitsOf, type Card } from './cards.ts'

export const HAND_TYPES = [
  'high', 'pair', 'twopair', 'trips', 'straight', 'flush', 'fullhouse', 'quads', 'straightflush', 'royalflush',
] as const
export type HandType = (typeof HAND_TYPES)[number]

export const HAND_NAMES: Record<HandType, string> = {
  high: 'High Card',
  pair: 'Pair',
  twopair: 'Two Pair',
  trips: 'Three of a Kind',
  straight: 'Straight',
  flush: 'Flush',
  fullhouse: 'Full House',
  quads: 'Four of a Kind',
  straightflush: 'Straight Flush',
  royalflush: 'Royal Flush',
}

export const HAND_BASE: Record<HandType, { value: number; hype: number }> = {
  high: { value: 5, hype: 1 },
  pair: { value: 10, hype: 2 },
  twopair: { value: 20, hype: 2 },
  trips: { value: 30, hype: 3 },
  straight: { value: 35, hype: 4 },
  flush: { value: 35, hype: 4 },
  fullhouse: { value: 45, hype: 4 },
  quads: { value: 60, hype: 7 },
  straightflush: { value: 100, hype: 8 },
  royalflush: { value: 150, hype: 10 },
}

// bonus hands only come from families the primary hand doesn't already cover
type Family = 'rank' | 'run' | 'suit'
const FAMILIES: Record<HandType, Family[]> = {
  high: [],
  pair: ['rank'],
  twopair: ['rank'],
  trips: ['rank'],
  fullhouse: ['rank'],
  quads: ['rank'],
  straight: ['run'],
  flush: ['suit'],
  straightflush: ['run', 'suit'],
  royalflush: ['run', 'suit'],
}

export type HandResult = {
  type: HandType // primary hand, best thing the cards make
  bonus: HandType[] // extra hands that only exist because of forged traits
  scoring: Card[] // every card that counts for the primary or a bonus hand
  mainRanks: number[] // rank hand: [main rank, second rank]. others: [highest rank]
  rankRanks: number[] // ranks of the rank hand if it's the primary or a bonus, else []
}

const better = (a: HandType, b: HandType) => HAND_TYPES.indexOf(a) > HAND_TYPES.indexOf(b)

type RankHand = { type: HandType; ranks: number[] }

function rankHand(cards: Card[], useTraits: boolean): RankHand {
  const totals = new Map<number, number>()
  let crayons = 0
  for (const c of cards) {
    if (isCrayon(c)) crayons++
    else for (const [rank, n] of rankCounts(c, useTraits)) totals.set(rank, (totals.get(rank) ?? 0) + n)
  }
  // biggest group first, ties broken by higher rank
  const groups = [...totals.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  // crayons are any rank, and joining the biggest group always makes the best rank hand. all crayon = aces
  if (crayons > 0) {
    if (groups.length === 0) groups.push([14, 0])
    groups[0][1] += crayons
  }
  const [top, second] = groups
  if (top[1] >= 4) return { type: 'quads', ranks: [top[0]] }
  if (top[1] >= 3 && second && second[1] >= 2) return { type: 'fullhouse', ranks: [top[0], second[0]] }
  if (top[1] >= 3) return { type: 'trips', ranks: [top[0]] }
  if (top[1] >= 2 && second && second[1] >= 2) return { type: 'twopair', ranks: [top[0], second[0]] }
  if (top[1] >= 2) return { type: 'pair', ranks: [top[0]] }
  return { type: 'high', ranks: [] }
}

function isFlush(cards: Card[], useTraits: boolean): boolean {
  if (cards.length < 5) return false
  const fixed = useTraits ? cards.filter(c => !isWild(c)) : cards
  return fixed.length === 0 || SUITS.some(s => fixed.every(c => suitsOf(c).includes(s)))
}

// returns the top rank of the best straight, or null. needs exactly 5 cards.
// bridge cards fill any missing rank. A can be low (A2345, top = 5)
function straightTop(cards: Card[], useTraits: boolean): number | null {
  if (cards.length !== 5) return null
  // crayons fill a gap like a bridge, traits or not
  const fixed = cards.filter(c => !isCrayon(c) && !(useTraits && isBridge(c)))
  const ranks = fixed.map(c => c.rank)
  if (new Set(ranks).size !== ranks.length) return null // a repeated rank can't be in a straight
  for (let top = 14; top >= 5; top--) {
    const run = top === 5 ? [14, 2, 3, 4, 5] : [top - 4, top - 3, top - 2, top - 1, top]
    if (ranks.every(r => run.includes(r))) return top
  }
  return null
}

function bestOf(rank: RankHand, top: number | null, flush: boolean): HandType {
  let type: HandType = rank.type
  if (top !== null && better('straight', type)) type = 'straight'
  if (flush && better('flush', type)) type = 'flush'
  if (top !== null && flush) type = top === 14 ? 'royalflush' : 'straightflush'
  return type
}

// primary = best hand using forged traits. hands from the other families stack on top as bonus hands,
// but only when a forged trait made one of the two hands happen. plain cards never get bonus hands.
export function evaluateHand(played: Card[]): HandResult {
  if (played.length === 0) throw new Error('evaluating an empty hand')
  // bulk is never part of a poker hand. a hand of only bulk is a high card with nothing scoring
  const cards = played.filter(c => !c.bulk)
  if (cards.length === 0) return { type: 'high', bonus: [], scoring: [], mainRanks: [], rankRanks: [] }

  const rankWith = rankHand(cards, true)
  const rankPlain = rankHand(cards, false)
  const topWith = straightTop(cards, true)
  const topPlain = straightTop(cards, false)
  const flushWith = isFlush(cards, true)
  const flushPlain = isFlush(cards, false)

  const type = bestOf(rankWith, topWith, flushWith)
  const primaryByTraits = type !== bestOf(rankPlain, topPlain, flushPlain)

  const covered = FAMILIES[type]
  const bonus: HandType[] = []
  if (!covered.includes('rank') && rankWith.type !== 'high' && (primaryByTraits || better(rankWith.type, rankPlain.type))) bonus.push(rankWith.type)
  if (!covered.includes('run') && topWith !== null && (primaryByTraits || topPlain === null)) bonus.push('straight')
  if (!covered.includes('suit') && flushWith && (primaryByTraits || !flushPlain)) bonus.push('flush')

  // which cards score: straights/flushes use all five, rank hands use the cards of those ranks
  const usesAll = [type, ...bonus].some(h => FAMILIES[h].includes('run') || FAMILIES[h].includes('suit'))
  const rankHandScored = FAMILIES[type].includes('rank') || bonus.some(h => FAMILIES[h].includes('rank'))
  // a crayon's printed rank means nothing, so it never counts as the high card
  const printed = cards.some(c => !isCrayon(c)) ? cards.filter(c => !isCrayon(c)) : cards
  const top = printed.reduce((best, c) => (c.rank > best.rank ? c : best))
  let scoring: Card[]
  if (usesAll) scoring = cards
  else if (rankHandScored) scoring = cards.filter(c => isCrayon(c) || rankWith.ranks.some(r => (rankCounts(c).get(r) ?? 0) > 0))
  else scoring = [top]

  const highest = top.rank
  const mainRanks = FAMILIES[type].includes('rank') ? rankWith.ranks : [highest]
  const rankScored = FAMILIES[type].includes('rank') || bonus.includes(rankWith.type)
  return { type, bonus, scoring, mainRanks, rankRanks: rankScored ? rankWith.ranks : [] }
}
