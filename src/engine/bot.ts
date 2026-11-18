// bot policy: given a match and a seat, the next action. bots play by the same rules as people, one logged action
// at a time, so replays never depend on this file. it never steps a clone to try things, it scores with appraise
import { SUITS, isSpecial, sellPrice, type Card } from './cards.ts'
import { autoKeep, forgePlan } from './forge.ts'
import { legalActions, type BetAction } from './betting.ts'
import { autoDraft } from './starters.ts'
import { PLAY_SIZE, SHIPPERS, type Shipper } from './economy.ts'
import { chance, makeRng, pick, type Rng } from './rng.ts'
import {
  appraiseFor, bestPlay, binderPrice, canGrade, freshness, bulkPrice, defaultToDeck, refusesToBuy, displaySlots, freeMulligan, freeRestocks, lockedCards, pairBlinds,
  pairOf, pending, problem, seat, twistFor, wishable, type Action, type Match, type Player, type SeatId,
} from './match.ts'
import { restockPrice } from './shop.ts'

export type BotStyle = {
  maxAt: number // strength needed to bet/raise max
  playAt: number // strength needed to bet min / call a min
  callMaxAt: number // strength needed to call a max
  bluff: number // chance to bet max on anything
  // shop
  reserve: number // $ kept on top of next round's max
  packs: boolean // buys paid packs
  restocks: number // max restocks per shop
  ships: boolean // uses the grading desk
  random?: true // picks a random legal action, skips half the shop
}

export const STYLES: Record<string, BotStyle> = {
  greedy: { maxAt: 1.4, playAt: 0.6, callMaxAt: 1.0, bluff: 0.08, reserve: 0, packs: true, restocks: 2, ships: true },
  cautious: { maxAt: 1.9, playAt: 0.85, callMaxAt: 1.4, bluff: 0.02, reserve: 10, packs: false, restocks: 0, ships: false },
  random: { maxAt: 0, playAt: 0, callMaxAt: 0, bluff: 0, reserve: 0, packs: true, restocks: 2, ships: true, random: true },
  // rival difficulties
  easy: { maxAt: 1.5, playAt: 0.7, callMaxAt: 1.1, bluff: 0.04, reserve: 6, packs: false, restocks: 0, ships: false },
  house: { maxAt: 1.3, playAt: 0.6, callMaxAt: 0.9, bluff: 0.08, reserve: 4, packs: true, restocks: 1, ships: true },
  sharp: { maxAt: 1.2, playAt: 0.55, callMaxAt: 0.85, bluff: 0.1, reserve: 2, packs: true, restocks: 2, ships: true },
}

export function getStyle(name: string): BotStyle {
  const s = STYLES[name]
  if (!s) throw new Error(`unknown bot style ${name}, use ${Object.keys(STYLES).join('|')}`)
  return s
}

// what an average dealt hand appraises at per round. bots compare their hand to this.
// calibrated from `node sim/econ.ts` (REF_SCORE line, greedy vs medium): median of every hand the rival was dealt.
// recalibrated Nov 17 after jokers + smarter bot shopping: mean of three 3000-run seeds (1000 runs swing round 2
// between 390 and 600, the distribution has two humps). boss rounds interpolated, round 12 = round 11 + 7%. sudden death uses the last entry
export const REF_SCORE: readonly number[] = [336, 400, 626, 852, 939, 1108, 1277, 1356, 1673, 1990, 2187, 2340]

function refScore(round: number): number {
  return REF_SCORE[Math.min(round, REF_SCORE.length) - 1]
}

// a fresh stream per decision, named by the action count, so the policy is a pure function of the match
function botRng(m: Match, s: SeatId, what: string): Rng {
  return makeRng(`${m.config.seed}:${m.round}:${s}:bot:${what}:${m.n}`)
}

export function botAction(m: Match, s: SeatId): Action {
  if (!pending(m).includes(s)) throw new Error(`bot seat ${s} owes no action`)
  const p = seat(m, s)
  if (!p.style) throw new Error(`seat ${s} has no bot style`)
  const style = getStyle(p.style)
  const action = choose(m, p, style)
  const why = problem(m, s, action)
  if (why) throw new Error(`bot seat ${s} picked an illegal ${action.type}: ${why}`)
  return action
}

function choose(m: Match, p: Player, style: BotStyle): Action {
  switch (m.phase) {
    case 'draft':
      if (!p.starter) return { type: 'pickBox', box: pick(makeRng(`${m.config.seed}:${p.seat}:box`), p.draft!.offer) }
      return { type: 'draft', rows: autoDraft(p.draft!.rows!) }
    case 'shop':
      return shopAction(m, p, style)
    case 'deal': {
      if (p.roundMulls < 2 && twistFor(m)?.id !== 'colddeck') {
        const toss = botMulligan(m, p)
        if (toss.length) return { type: 'mulligan', cardIds: toss }
      }
      return { type: 'lock', cardIds: bestPlay(m, p).played.map(c => c.id) }
    }
    case 'bet':
      return { type: 'bet', choice: betChoice(m, p, style) }
    case 'forgePick':
      return { type: 'forgeKeep', traits: autoKeep(forgePlan(lockedCards(p))!) }
  }
  throw new Error(`bot has nothing to do in ${m.phase}`)
}

// mulligans shrink your hand for the rest of the table, so only toss a free one or a hopeless high card
export function botMulligan(m: Match, p: Player): number[] {
  if (twistFor(m)?.id === 'lowball' || p.hand.length <= PLAY_SIZE) return []
  const { played, est } = bestPlay(m, p)
  const weak = est.hand === 'high' || (est.hand === 'pair' && freeMulligan(p))
  if (!weak) return []
  const keep = new Set(played.map(c => c.id))
  return p.hand.filter(c => !keep.has(c.id)).map(c => c.id)
}

// one shop decision: sort the open pack, grab the free pack, sell, buy, restock, bin bulk, leave
function shopAction(m: Match, p: Player, style: BotStyle): Action {
  const shop = p.shop!
  if (shop.open) return { type: 'sortPack', toDeck: shop.open.cards.filter(defaultToDeck).map(c => c.id) }
  // wishlist: the best binder card back into the deck. checklist: push an off-suit card toward the deck's main suit
  if (shop.scratch === 'wishlist') return { type: 'useInsert', cardId: wishable(p).reduce((b, c) => (sellPrice(c) > sellPrice(b) ? c : b)).id, suit: null }
  if (shop.scratch === 'checklist') {
    const deck = [...p.pile, ...p.discard].filter(c => !c.bulk)
    const main = SUITS.reduce((b, x) => (deck.filter(c => c.suit === x).length > deck.filter(c => c.suit === b).length ? x : b))
    const card = deck.find(c => c.suit !== main)
    return card ? { type: 'useInsert', cardId: card.id, suit: main } : { type: 'useInsert', cardId: deck[0].id, suit: SUITS.find(x => x !== deck[0].suit)! }
  }
  const free = shop.offers.findIndex(o => o.type === 'pack' && o.kind === 'free' && !o.sold)
  if (free >= 0) return { type: 'buy', slot: free }
  if (m.round === 1) return { type: 'leaveShop' }

  const reserve = pairBlinds(m, [p.seat]).max + style.reserve
  // hold the binder for STONKS: sell what's hot now, dump the rest when it gets fat or money is tight
  for (const card of p.binder) {
    if (refusesToBuy(m, card)) continue
    const hot = binderPrice(m, p, card) > sellPrice(card)
    if (hot || p.binder.length > 6 || p.bankroll < reserve) return { type: 'sell', cardId: card.id }
  }
  // grading desk: ship the freshest special deck card. chronopost when the budget has room, la poste when it's tight
  if (style.ships && !shop.shipped && !p.shipping) {
    const card = [...p.pile, ...p.discard]
      .filter(c => canGrade(c) && isSpecial(c))
      .sort((a, b) => freshness(b, m.round) - freshness(a, m.round) || b.tier - a.tier)[0]
    const shipper: Shipper = p.bankroll - SHIPPERS.chrono.price >= reserve + 6 ? 'chrono' : 'poste'
    if (card && p.bankroll - SHIPPERS[shipper].price >= reserve + 2) return { type: 'ship', cardId: card.id, shipper }
  }
  for (const [slot, o] of shop.offers.entries()) {
    if (o.sold || o.price === 0) continue
    if (style.random && chance(makeRng(`${m.config.seed}:${m.round}:${p.seat}:skip:${shop.restocks}:${slot}`), 0.5)) continue
    if (p.bankroll - o.price < reserve) continue
    if (o.type === 'collectible' && p.display.length >= displaySlots(p)) continue
    if (o.type === 'pack' && !style.packs) continue
    if (o.type === 'sleeve' && p.sleeves.includes(o.id)) continue
    // a scratcher is a treat, only with money to spare
    if (o.type === 'scratcher' && p.bankroll - o.price < reserve + 6) continue
    return { type: 'buy', slot }
  }
  if (shop.restocks < style.restocks && p.bankroll - restockPrice(shop, freeRestocks(m, p)) >= reserve + 8) return { type: 'restock' }
  const hasBulk = [...p.pile, ...p.discard].some(c => c.bulk)
  if (hasBulk && p.bankroll - bulkPrice(p) >= reserve + 4) return { type: 'binBulk' }
  return { type: 'leaveShop' }
}

// strength = this hand vs an average hand this round. forging costs the max now, so a bot only forges when it's cheap
function betChoice(m: Match, p: Player, style: BotStyle): BetAction {
  const at = pairOf(m, p.seat)!
  const b = at.pair.betting!
  const legal = legalActions(b)
  if (style.random) return pick(botRng(m, p.seat, 'bet'), legal)
  const played: Card[] = lockedCards(p)
  const { ante } = pairBlinds(m, at.pair.seats)
  const est = appraiseFor(m, p, played, false, null, ante).total
  const strength = twistFor(m)?.id === 'lowball' ? 1 : est / refScore(m.round)
  const giveUp = legal.includes('forge') && b.forgePrice[at.pos] <= b.minStake ? 'forge' : legal.includes('fold') ? 'fold' : legal[0]
  const canFold = legal.includes('fold')

  if (b.step === 1) {
    if (legal.includes('max') && (strength >= style.maxAt || chance(botRng(m, p.seat, 'bluff'), style.bluff))) return 'max'
    return strength >= style.playAt || !canFold ? 'min' : giveUp
  }
  if (b.step === 2) {
    if (b.firstBet === 'max') return strength >= style.callMaxAt || !canFold ? 'max' : giveUp
    if (legal.includes('max') && strength >= style.maxAt) return 'max'
    return strength >= style.playAt * 0.9 || !canFold ? 'min' : giveUp
  }
  return strength >= style.callMaxAt * 0.9 || !canFold ? 'match' : 'fold'
}
