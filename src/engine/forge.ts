import { MAX_TIER, bestFinish, newBulk, newCard, type Card, type Ids, type Trait } from './cards.ts'
import { evaluateHand, type HandType } from './hands.ts'

// forging folds the hand and merges every card that scored into one card.
// the new card gets the traits for the primary hand and every bonus hand, keeps the traits of any forged cards it ate,
// and goes up a tier. a card holds as many traits as its tier (★1 = 1 ... ★3 = 3)

export type ForgePlan = {
  merged: Card[]
  hand: HandType
  rank: number
  suit: Card['suit']
  tier: number
  grind: number
  candidates: Trait[] // everything it could keep. if more than `tier`, the player picks
}

// other = the second rank in two pair / full house (whichever isn't the new card's rank)
function newTraits(hand: HandType, other: number): Trait[] {
  switch (hand) {
    case 'high': return [] // never forged, folding grinds instead (see grindOnFold)
    case 'pair': return [{ kind: 'multi', count: 2 }]
    case 'trips': return [{ kind: 'multi', count: 3 }]
    case 'quads': return [{ kind: 'multi', count: 4 }]
    case 'twopair': return [{ kind: 'split', rank: other }]
    case 'fullhouse': return [{ kind: 'household', pairRank: other }]
    case 'straight': return [{ kind: 'bridge' }]
    case 'flush': return [{ kind: 'wild' }]
    case 'straightflush': return [{ kind: 'bridge' }, { kind: 'wild' }]
    case 'royalflush': return [{ kind: 'crown' }]
  }
}

// split/household are one per rank they point at, everything else is one per kind
function traitKey(t: Trait): string {
  if (t.kind === 'split') return `split:${t.rank}`
  if (t.kind === 'household') return `household:${t.pairRank}`
  return t.kind
}

// dedupe, the bigger multi wins, crown already covers bridge and wild
function mergeTraits(traits: Trait[], rank: number): Trait[] {
  const out: Trait[] = []
  for (const t of traits) {
    if (t.kind === 'split' && t.rank === rank) continue // split onto its own rank does nothing
    if (t.kind === 'household' && t.pairRank === rank) continue // same for household
    const same = out.findIndex(o => traitKey(o) === traitKey(t))
    if (same < 0) out.push(t)
    else if (t.kind === 'multi' && t.count > (out[same] as { count: number }).count) out[same] = t
  }
  if (out.some(t => t.kind === 'crown')) return out.filter(t => t.kind !== 'bridge' && t.kind !== 'wild')
  return out
}

export function forgePlan(played: Card[]): ForgePlan | null {
  const hand = evaluateHand(played)
  const merged = hand.scoring
  // high card can't be forged (folding grinds instead). a lone forged card (K Twin is already a pair) would just re-make itself
  if (hand.type === 'high' || merged.length < 2) return null

  // a rank hand (pair, quads...) anchors the new card to that rank, so Twin/Quad stay on the cards that made them.
  // otherwise it takes the identity of the highest tier forged card it eats, so a K★2 in a straight stays a K
  const forged = merged.filter(c => c.tier > 0).sort((a, b) => b.tier - a.tier)
  const rank = hand.rankRanks[0] ?? forged[0]?.rank ?? hand.mainRanks[0]
  const suit = (forged.find(c => c.rank === rank) ?? merged.find(c => c.rank === rank) ?? merged[0]).suit


  const inherited = merged.flatMap(c => c.traits)
  const other = [...hand.rankRanks, ...hand.mainRanks].find(r => r !== rank) ?? rank
  const fresh = [hand.type, ...hand.bonus].flatMap(h => newTraits(h, other))
  const candidates = mergeTraits([...inherited, ...fresh], rank)
  const tier = Math.min(MAX_TIER, Math.max(0, ...merged.map(c => c.tier)) + 1)
  const grind = merged.reduce((n, c) => n + c.grind, 0)
  return { merged, hand: hand.type, rank, suit, tier, grind, candidates }
}

// bots (and the ui default) keep the strongest traits when over the cap
const PRIORITY: Trait['kind'][] = ['crown', 'household', 'multi', 'wild', 'bridge', 'split']

export function autoKeep(plan: ForgePlan): Trait[] {
  if (plan.candidates.length <= plan.tier) return plan.candidates
  return plan.candidates
    .slice()
    .sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || (b.kind === 'multi' && a.kind === 'multi' ? b.count - a.count : 0))
    .slice(0, plan.tier)
}

// the forged card plus one bulk for every card eaten beyond the first, so forging never shrinks the deck
export function buildForged(plan: ForgePlan, keep: Trait[], round: number, ids: Ids): { forged: Card; bulk: Card[] } {
  if (keep.length > plan.tier) {
    throw new Error(`keeping ${keep.length} traits on a ★${plan.tier} card`)
  }
  const offered = new Set(plan.candidates.map(t => JSON.stringify(t)))
  for (const t of keep) if (!offered.has(JSON.stringify(t))) throw new Error('keeping a trait the plan never offered')
  const forged = newCard(ids, plan.rank, plan.suit, {
    tier: plan.tier,
    traits: keep,
    grind: plan.grind,
    finish: bestFinish(plan.merged),
    pulledRound: round,
  })
  const bulk = plan.merged.slice(1).map(() => newBulk(ids, round))
  return { forged, bulk }
}

// folding grinds your highest locked card: same card, +1 value forever. the meme build, and the only
// thing a fold gives back. done in place so the card keeps its stamp, grade and 1st edition growth
// bulk can't be ground. folding a hand of only bulk grinds nothing
export function grindOnFold(played: Card[]): Card | null {
  if (played.length === 0) throw new Error('folding with no locked cards')
  const real = played.filter(c => !c.bulk)
  if (real.length === 0) return null
  const top = real.reduce((best, c) => (c.rank > best.rank ? c : best))
  top.grind++
  return top
}
