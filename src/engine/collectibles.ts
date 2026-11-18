import { SUITS, SUIT_GLYPH, isCrayon, isForged, isWild, type Card, type Finish, type Suit } from './cards.ts'
import type { HandResult, HandType } from './hands.ts'
import { next, pick, type Rng } from './rng.ts'

export type Rarity = 'common' | 'uncommon' | 'rare'

// xhype multiplies the hype built up so far (the case triggers left to right)
export type Delta = { value: number; hype: number; xhype: number; grade: number }

export type HandCtx = {
  hand: HandResult
  played: Card[] // without bulk
  bulk: number // bulk cards played
  worn: Finish[] // the finish each scored card wore (a sticker wears its borrowed one)
  deckSize: number
  bankroll: number
  ante: number
  betMax: boolean
  emptySlots: number
}

// one collectible sitting in the display case. param is the rolled suit/rank, if any
export type Owned = { id: string; param: string | null }

export type CollectibleDef = {
  id: string
  name: string
  rarity: Rarity
  text: string // {S} and {R} get the rolled param
  roll?: 'suit' | 'rank'
  payoff?: true // a lane's rare × payoff. the big shop always offers one
  // per scored card, every time it scores
  onCard?: (card: Card, param: string | null) => Partial<Delta> | null
  // once per hand, after the cards
  onHand?: (ctx: HandCtx, param: string | null) => Partial<Delta> | null
}

const handIs = (t: HandType) => (ctx: HandCtx) => ctx.hand.type === t
const hands = (ctx: HandCtx) => [ctx.hand.type, ...ctx.hand.bonus]

// ×x for each of n things, by repeated multiplication (no Math.pow in the engine)
function times(x: number, n: number): Partial<Delta> | null {
  if (n <= 0) return null
  let out = 1
  for (let i = 0; i < n; i++) out *= x
  return { xhype: out }
}

// pairs in the primary and bonus hands: pair 1, two pair 2, full house 1
function pairsIn(ctx: HandCtx): number {
  return hands(ctx).reduce((n, h) => n + (h === 'pair' || h === 'fullhouse' ? 1 : h === 'twopair' ? 2 : 0), 0)
}

export const COLLECTIBLES: readonly CollectibleDef[] = [
  // flat
  { id: 'penny_sleeve', name: 'Lucky Penny', rarity: 'common', text: '+4 Hype', onHand: () => ({ hype: 4 }) },
  { id: 'top_loader', name: 'Top Loader', rarity: 'common', text: '+30 Value', onHand: () => ({ value: 30 }) },
  // hand types
  { id: 'rubber_band', name: 'Rubber Band', rarity: 'common', text: 'Pair: +8 Hype', onHand: c => (handIs('pair')(c) ? { hype: 8 } : null) },
  { id: 'binder_divider', name: 'Binder Divider', rarity: 'common', text: 'Two Pair: +10 Hype', onHand: c => (handIs('twopair')(c) ? { hype: 10 } : null) },
  { id: 'card_stack', name: 'Card Stack', rarity: 'common', text: 'Three of a Kind: +12 Hype', onHand: c => (handIs('trips')(c) ? { hype: 12 } : null) },
  { id: 'straight_edge', name: 'Straight Edge', rarity: 'common', text: 'Straight: +80 Value', onHand: c => (handIs('straight')(c) ? { value: 80 } : null) },
  { id: 'color_binder', name: 'Color-Sorted Binder', rarity: 'common', text: 'Flush: +10 Hype', onHand: c => (handIs('flush')(c) ? { hype: 10 } : null) },
  { id: 'draft_chaff', name: 'Draft Chaff', rarity: 'common', text: 'High Card: +60 Value', onHand: c => (handIs('high')(c) ? { value: 60 } : null) },
  // ranks and suits
  { id: 'low_ball', name: 'Low Ball', rarity: 'common', text: 'Each scored 2–5: +20 Value', onCard: c => (c.rank <= 5 ? { value: 20 } : null) },
  { id: 'odd_lot', name: 'Odd Lot', rarity: 'common', text: 'Each scored A,3,5,7,9: +3 Hype', onCard: c => ([14, 3, 5, 7, 9].includes(c.rank) ? { hype: 3 } : null) },
  { id: 'even_stack', name: 'Even Stack', rarity: 'common', text: 'Each scored 2,4,6,8,10: +20 Value', onCard: c => (c.rank <= 10 && c.rank % 2 === 0 ? { value: 20 } : null) },
  { id: 'playmat', name: 'Playmat', rarity: 'common', text: 'Each scored {S}: +3 Hype', roll: 'suit', onCard: (c, s) => (isWild(c) || c.suit === s ? { hype: 3 } : null) },
  { id: 'face_binder', name: 'Face Binder', rarity: 'uncommon', text: 'Each scored J/Q/K: +5 Hype', onCard: c => (c.rank >= 11 && c.rank <= 13 ? { hype: 5 } : null) },
  {
    id: 'suit_sorter', name: 'Suit Sorter', rarity: 'uncommon', text: '+1 Grade if you played all 4 suits',
    onHand: c => (new Set(c.played.filter(p => !isWild(p)).map(p => p.suit)).size + c.played.filter(isWild).length >= 4 ? { grade: 1 } : null),
  },
  // collection
  { id: 'team_bag', name: 'Team Bag', rarity: 'uncommon', text: '+3 Hype per empty display slot', onHand: c => (c.emptySlots > 0 ? { hype: 3 * c.emptySlots } : null) },
  { id: 'black_light', name: 'Black Light', rarity: 'uncommon', text: '+1 Grade if 3+ scored cards have a Finish', onHand: c => (c.hand.scoring.filter(x => x.finish).length >= 3 ? { grade: 1 } : null) },
  { id: 'card_sleeves', name: "Chef's Apron", rarity: 'uncommon', text: '+1 Grade if you played a flambéed card', onHand: c => (c.played.some(isForged) ? { grade: 1 } : null) },
  { id: 'tournament_badge', name: 'Tournament Badge', rarity: 'uncommon', text: '+15 Hype if you bet Max', onHand: c => (c.betMax ? { hype: 15 } : null) },
  { id: 'deck_box', name: 'Deck Box', rarity: 'common', text: 'Draw 9 cards instead of 8' },
  { id: 'price_sticker', name: 'Price Sticker', rarity: 'common', text: '+$1 every round you win' },
  { id: 'store_credit', name: 'Store Credit', rarity: 'common', text: 'First restock each shop is free' },
  // forging and combos
  { id: 'combo_platter', name: 'Combo Platter', rarity: 'uncommon', text: '+10 Hype per bonus hand', onHand: c => (c.hand.bonus.length ? { hype: 10 * c.hand.bonus.length } : null) },
  { id: 'specialist', name: 'Specialist', rarity: 'uncommon', text: '+15 Hype if you scored no bonus hands', onHand: c => (c.hand.bonus.length === 0 ? { hype: 15 } : null) },
  { id: 'forge_hammer', name: 'Chalumeau', rarity: 'uncommon', text: 'Each scored flambéed card: +20 Value', onCard: c => (isForged(c) ? { value: 20 } : null) },
  { id: 'participation_trophy', name: 'Participation Trophy', rarity: 'common', text: 'Grind bonuses are ×10', onCard: c => (c.grind > 0 ? { value: 9 * c.grind } : null) },
  {
    id: 'triple_threat', name: 'Triple Threat', rarity: 'rare', text: '+1 Grade if the hand scores a rank hand, a straight and a flush',
    onHand: c => {
      const all = [c.hand.type, ...c.hand.bonus]
      const rank = all.some(h => ['pair', 'twopair', 'trips', 'fullhouse', 'quads'].includes(h))
      const run = all.some(h => ['straight', 'straightflush', 'royalflush'].includes(h))
      const suit = all.some(h => ['flush', 'straightflush', 'royalflush'].includes(h))
      return rank && run && suit ? { grade: 1 } : null
    },
  },
  // rares
  { id: 'psa_slab', name: 'PSA 10 Slab', rarity: 'rare', text: '+1 Grade if 2+ scored cards are {R}', roll: 'rank', onHand: (c, r) => (c.hand.scoring.filter(x => String(x.rank) === r).length >= 2 ? { grade: 1 } : null) },
  { id: 'thin_binder', name: 'Thin Binder', rarity: 'rare', text: '+1 Grade if your deck has 18 or fewer cards', onHand: c => (c.deckSize <= 18 ? { grade: 1 } : null) },
  { id: 'high_roller', name: 'High Roller', rarity: 'rare', text: '+1 Grade and +10 Hype while bankroll is under 3× the ante', onHand: c => (c.bankroll < 3 * c.ante ? { grade: 1, hype: 10 } : null) },
  // bulk feeder
  { id: 'bulk_bin', name: 'Bulk Bin', rarity: 'common', text: 'Each Bulk played: +2 Hype', onHand: c => (c.bulk > 0 ? { hype: 2 * c.bulk } : null) },
  // the lane payoffs: rare, and they multiply
  { id: 'les_jumeaux', name: 'Les Jumeaux', rarity: 'rare', payoff: true, text: 'Each Pair in the hand: ×1.5 Hype', onHand: c => times(1.5, pairsIn(c)) },
  {
    id: 'sommelier', name: 'Sommelier', rarity: 'rare', payoff: true, text: 'Flush: ×2 Hype if a scored card is Holo',
    onHand: c => (hands(c).some(h => h === 'flush' || h === 'straightflush' || h === 'royalflush') && c.worn.includes('holo') ? { xhype: 2 } : null),
  },
  { id: 'flamme_bleue', name: 'Flamme Bleue', rarity: 'rare', payoff: true, text: 'Each scored flambéed card: ×1.5 Hype', onCard: c => (isForged(c) ? { xhype: 1.5 } : null) },
  { id: 'vitrine', name: 'Vitrine', rarity: 'rare', payoff: true, text: '×1 Hype per different Finish scored', onHand: c => (new Set(c.worn).size > 1 ? { xhype: new Set(c.worn).size } : null) },
  { id: 'petite_monnaie', name: 'Petite Monnaie', rarity: 'rare', payoff: true, text: 'Each scored 2–6: ×1.25 Hype', onCard: c => (!isCrayon(c) && c.rank <= 6 ? { xhype: 1.25 } : null) },
  { id: 'ferrailleur', name: 'Le Ferrailleur', rarity: 'rare', payoff: true, text: 'Each Bulk played: ×1.5 Hype', onHand: c => times(1.5, c.bulk) },
  { id: 'le_flambeur', name: 'Le Flambeur', rarity: 'rare', payoff: true, text: '×Hype: 1, +1 per $20 you hold', onHand: c => (c.bankroll >= 20 ? { xhype: 1 + Math.floor(c.bankroll / 20) } : null) },
  { id: 'bis', name: 'Bis !', rarity: 'rare', payoff: true, text: 'Signed cards score 3 times, not 2' }, // scoring.ts reads it
  {
    id: 'ligne_droite', name: 'Ligne Droite', rarity: 'rare', payoff: true, text: 'Straight: ×2.5 Hype',
    onHand: c => (hands(c).some(h => h === 'straight' || h === 'straightflush' || h === 'royalflush') ? { xhype: 2.5 } : null),
  },
  { id: 'commissaire', name: 'Le Commissaire-priseur', rarity: 'rare', payoff: true, text: 'Each scored graded card: ×1.5 Hype', onCard: c => (c.grade !== null ? { xhype: 1.5 } : null) },
]

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 65, uncommon: 27, rare: 8 }

export function getDef(id: string): CollectibleDef {
  const def = COLLECTIBLES.find(d => d.id === id)
  if (!def) throw new Error(`unknown collectible ${id}`)
  return def
}

export function rollParam(def: CollectibleDef, rng: Rng): string | null {
  if (def.roll === 'suit') return pick(rng, SUITS)
  if (def.roll === 'rank') return String(2 + Math.floor(next(rng) * 13))
  return null
}

const RANK_WORDS: Record<string, string> = { '11': 'Jacks', '12': 'Queens', '13': 'Kings', '14': 'Aces' }

export function describe(owned: Owned): string {
  const def = getDef(owned.id)
  const p = owned.param
  return def.text
    .replace('{S}', p ? SUIT_GLYPH[p as Suit] : '[suit]')
    .replace('{R}', p ? (RANK_WORDS[p] ?? `${p}s`) : '[rank]')
}

export function hasCollectible(display: Owned[], id: string): boolean {
  return display.some(o => o.id === id)
}
