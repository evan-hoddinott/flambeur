// bot policy: given a match and a seat, the next action. bots play by the same rules as people, one logged action
// at a time, so replays never depend on this file. it never steps a clone to try things, it scores with appraise
import { SUITS, cardValue, isSpecial, sellPrice, type Card, type Suit } from './cards.ts'
import { autoKeep, forgePlan } from './forge.ts'
import { legalActions, type BetAction } from './betting.ts'
import { autoDraft } from './starters.ts'
import type { HandType } from './hands.ts'
import { HANDS_PER_ROUND, PLAY_SIZE, ROUNDS_PER_TABLE, SHIPPERS, SLEEVE_SLOTS, markerFor, tableOf, type Shipper } from './economy.ts'
import { deckSize } from './deck.ts'
import { restockPrice, type Insert } from './shop.ts'
import { chance, makeRng, pick, type Rng } from './rng.ts'
import {
  bestPlay, binderPrice, bulkPrice, canGrade, defaultToDeck, discardsLeft, displaySlots, freeRestocks, freshness, lockedCards, pairBlinds, pairOf,
  pending, problem, refusesToBuy, roundScore, seat, splitsStuck, spoilsWorth, twistFor, wishable, type Action, type Match, type Player, type SeatId,
} from './match.ts'

export type BotStyle = {
  maxAt: number // strength (hand 1 vs an average hand) to bet max at the opening
  pushAt: number // strength (hand 3) to push to max at the last push
  bluff: number // chance to bet max on anything
  keepAt: number // strength good enough to stop discarding
  throwAt: number // flambé a pair weaker than this (when up a hand, or on hand 1). 0 = never throws a hand
  // shop
  buys: boolean // false = never spends a cent (the nobuy baseline)
  reserve: number // $ kept on top of next round's max
  packs: boolean // buys paid packs
  restocks: number // max restocks per shop
  ships: boolean // uses the grading desk
  inserts: boolean // buys scratchers and uses inserts
  random?: true // bets at random, skips half the shop
}

export const STYLES: Record<string, BotStyle> = {
  greedy: { maxAt: 1.2, pushAt: 1.0, bluff: 0.08, keepAt: 1.1, throwAt: 0.6, buys: true, reserve: 0, packs: true, restocks: 2, ships: true, inserts: true },
  cautious: { maxAt: 1.8, pushAt: 1.5, bluff: 0.02, keepAt: 1.0, throwAt: 0, buys: true, reserve: 10, packs: false, restocks: 0, ships: false, inserts: false },
  random: { maxAt: 0, pushAt: 0, bluff: 0, keepAt: 0.8, throwAt: 0.4, buys: true, reserve: 0, packs: true, restocks: 2, ships: true, inserts: true, random: true },
  // greedy betting that never spends a cent: proves buying matters (V2.md §0)
  nobuy: { maxAt: 1.2, pushAt: 1.0, bluff: 0.08, keepAt: 1.1, throwAt: 0.6, buys: false, reserve: 0, packs: false, restocks: 0, ships: false, inserts: false },
  // rival difficulties
  easy: { maxAt: 1.5, pushAt: 1.3, bluff: 0.04, keepAt: 0.9, throwAt: 0, buys: true, reserve: 6, packs: false, restocks: 0, ships: false, inserts: false },
  house: { maxAt: 1.2, pushAt: 1.0, bluff: 0.08, keepAt: 1.1, throwAt: 0.5, buys: true, reserve: 4, packs: true, restocks: 1, ships: true, inserts: true },
  sharp: { maxAt: 1.1, pushAt: 0.95, bluff: 0.1, keepAt: 1.2, throwAt: 0.6, buys: true, reserve: 2, packs: true, restocks: 2, ships: true, inserts: true },
}

export function getStyle(name: string): BotStyle {
  const s = STYLES[name]
  if (!s) throw new Error(`unknown bot style ${name}, use ${Object.keys(STYLES).join('|')}`)
  return s
}

// a solo rival's mask bends its betting: the hare is nervous, the crimson domino loves a max
function styleFor(p: Player): BotStyle {
  const base = getStyle(p.style!)
  if (p.rival === 'hare') return { ...base, maxAt: base.maxAt + 0.4, pushAt: base.pushAt + 0.3, bluff: 0 }
  if (p.rival === 'domino_red') return { ...base, maxAt: base.maxAt - 0.4, pushAt: base.pushAt - 0.3, bluff: base.bluff + 0.15 }
  return base
}

// what an average hand appraises at, per round. bots compare a hand to this.
// calibrated from `node sim/econ.ts` (REF_SCORE line, greedy vs medium): the median of every hand the rival locked
// as a play on normal rounds, boss rounds interpolated. sudden death uses the last entry
export const REF_SCORE: readonly number[] = [300, 308, 550, 791, 810, 1493, 2176, 2244, 3312, 4380, 4320, 4400]

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
  const action = choose(m, p, styleFor(p))
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
    case 'deal':
      return dealAction(m, p, style)
    case 'bet':
      return { type: 'bet', choice: betChoice(m, p, style) }
    case 'spoils':
      return spoilsPick(m, p)
  }
  throw new Error(`bot has nothing to do in ${m.phase}`)
}

// ---------- the hand ----------

const strength = (m: Match, total: number) => (twistFor(m)?.id === 'lowball' ? 1 : total / refScore(m.round))

function dealAction(m: Match, p: Player, style: BotStyle): Action {
  if (p.forge && !p.forge.keep) return { type: 'forgeKeep', traits: autoKeep(forgePlan(lockedCards(p))!) }
  if (style.inserts) {
    const use = insertUse(m, p)
    if (use) return use
  }
  const best = bestPlay(m, p)
  const s = strength(m, best.est.total)
  const ids = best.played.map(c => c.id)
  // throw a hand to flambé: a weak pair on hand 1, or any pair once you're a hand up. never on the last hand
  const plan = forgePlan(best.played)
  if (style.throwAt > 0 && plan && m.hand < HANDS_PER_ROUND && twistFor(m)?.id !== 'lowball') {
    const at = pairOf(m, p.seat)!
    const { wins } = roundScore(at.pair)
    const up = wins[at.pos] > wins[1 - at.pos]
    if ((up && s < style.throwAt * 1.6) || (m.hand === 1 && plan.hand === 'pair' && s < style.throwAt)) return { type: 'flamber', cardIds: ids, grind: null }
  }
  if (discardsLeft(m, p) > 0 && s < style.keepAt) {
    const toss = chaseDiscard(p, best.played, best.est.hand)
    if (toss.length > 0) return { type: 'discard', cardIds: toss }
  }
  return { type: 'play', cardIds: ids }
}

// discards that chase the best hand these cards could make: a flush draw, a straight draw, or more of the rank you hold.
// never more than the pile can replace, and beer-stained pairs go together
export function chaseDiscard(p: Player, best: Card[], made: HandType): number[] {
  const hand = p.hand
  if (p.pile.length === 0 || hand.length < 3) return []
  const real = hand.filter(c => !c.bulk)
  const bySuit = (s: Suit) => real.filter(c => c.suit === s)
  const topSuit = SUITS.reduce((b, s) => (bySuit(s).length > bySuit(b).length ? s : b))
  let keep: Card[]
  if (!['high', 'pair', 'twopair', 'trips'].includes(made)) return [] // a straight or better: keep it
  if (bySuit(topSuit).length >= 4) keep = bySuit(topSuit)
  else {
    const run = straightDraw(real)
    if (run.length >= 4) keep = run
    else if (made !== 'high') keep = best.filter(c => !c.bulk)
    else keep = real.slice().sort((a, b) => b.rank - a.rank).slice(0, 2)
  }
  let toss = hand.filter(c => !keep.includes(c)).sort((a, b) => Number(b.bulk) - Number(a.bulk) || a.rank - b.rank)
  toss = toss.slice(0, Math.min(PLAY_SIZE, p.pile.length))
  // a beer-stained pair can't be split: drop both halves from the toss if it would split them
  while (toss.length > 0 && splitsStuck(hand, toss.map(c => c.id))) toss = toss.slice(0, -1)
  return toss.map(c => c.id)
}

// the cards of the 5-rank window with the most distinct ranks (A counts low too)
function straightDraw(cards: Card[]): Card[] {
  let best: Card[] = []
  for (let top = 14; top >= 5; top--) {
    const window = top === 5 ? [14, 2, 3, 4, 5] : [top - 4, top - 3, top - 2, top - 1, top]
    const picked: Card[] = []
    for (const r of window) {
      const c = cards.find(x => x.rank === r)
      if (c) picked.push(c)
    }
    if (picked.length > best.length) best = picked
  }
  return best
}

// inserts are worth using when they help right now. code, reprint, broyeuse and allumettes build the deck, so those
// go whenever there's a good target. the hand fixers (checklist, stylo, photocopie) only when the best play gets better
function insertUse(m: Match, p: Player): Action | null {
  if (p.hand.length === 0) return null
  const best = bestPlay(m, p)
  const scoring = best.played.filter(c => best.est.scoringIds.includes(c.id) && !c.bulk)
  for (let slot = 0; slot < p.sleeve.length; slot++) {
    const held = p.sleeve[slot]
    const use = (cardIds: number[], suit: Suit | null = null): Action => ({ type: 'useInsert', slot, cardIds, suit })
    const ok = (a: Action) => problem(m, p.seat, a) === null
    const top = scoring.slice().sort((a, b) => cardValue(b) - cardValue(a))[0]
    switch (held.id) {
      case 'code': return use([])
      case 'foil': case 'holo': case 'prism': {
        const c = scoring.find(x => x.finish !== held.id && x.finish !== 'prism')
        if (c && ok(use([c.id]))) return use([c.id])
        break
      }
      case 'tampon': {
        const c = scoring.find(x => x.stamp === null && x.knockoff === null)
        if (c) return use([c.id])
        break
      }
      case 'reprint': {
        const c = p.hand.find(x => !x.bulk && isSpecial(x) && !x.joker) ?? top
        if (c && ok(use([c.id]))) return use([c.id])
        break
      }
      case 'broyeuse': {
        if (p.pile.length + p.discard.length + p.hand.length <= 14) break
        const junk = p.hand.filter(c => c.bulk || (!best.played.includes(c) && c.rank <= 5 && !isSpecial(c))).slice(0, 2)
        if (junk.length && ok(use(junk.map(c => c.id)))) return use(junk.map(c => c.id))
        break
      }
      case 'allumettes': {
        const real = p.hand.filter(c => !c.bulk && !c.joker)
        for (const a of real) for (const b of real) {
          if (a.id < b.id && a.rank === b.rank && ok(use([a.id, b.id]))) return use([a.id, b.id])
        }
        break
      }
      case 'checklist': {
        const real = p.hand.filter(c => !c.bulk)
        const main = SUITS.reduce((x, s) => (real.filter(c => c.suit === s).length > real.filter(c => c.suit === x).length ? s : x))
        const off = real.filter(c => c.suit !== main).sort((a, b) => b.rank - a.rank).slice(0, 2)
        if (off.length && improves(m, p, best.est.total, off.map(c => ({ ...c, suit: main })))) return use(off.map(c => c.id), main)
        break
      }
      case 'stylo': {
        const real = p.hand.filter(c => !c.bulk && c.rank < 14)
        const up = real.find(c => p.hand.some(x => x.id !== c.id && x.rank === c.rank + 1 && !x.bulk))
        if (up && improves(m, p, best.est.total, [{ ...up, rank: up.rank + 1 }])) return use([up.id])
        break
      }
      case 'photocopie': {
        if (!top || top.joker) break
        const target = p.hand.filter(c => !c.bulk && !c.joker && !best.played.includes(c)).sort((a, b) => a.rank - b.rank)[0]
        if (target && improves(m, p, best.est.total, [{ ...target, rank: top.rank, suit: top.suit, finish: top.finish, stamp: top.stamp }])) {
          return use([target.id, top.id])
        }
        break
      }
    }
  }
  return null
}

// would the best play beat `now` with these cards swapped into the hand
function improves(m: Match, p: Player, now: number, changed: Card[]): boolean {
  const hand = p.hand.map(c => changed.find(x => x.id === c.id) ?? c)
  return bestPlay(m, p, hand).est.total > now
}

// strength = the hand vs an average hand this round. a thrown hand is a guess at the next ones
function betChoice(m: Match, p: Player, style: BotStyle): BetAction {
  const at = pairOf(m, p.seat)!
  const b = at.pair.betting!
  const legal = legalActions(b)
  if (style.random) return pick(botRng(m, p.seat, 'bet'), legal)
  const locked = lockedCards(p)
  const s = p.lockKind === 'play' ? strength(m, bestPlay(m, p, locked).est.total) : 0.5
  if (b.stage === 'open') return s >= style.maxAt || chance(botRng(m, p.seat, 'bluff'), style.bluff) ? 'max' : 'min'
  // the last push: hand 3 decides it. a hand up already, push on less
  const { wins } = roundScore(at.pair)
  const up = wins[at.pos] > wins[1 - at.pos]
  return s >= style.pushAt * (up ? 0.8 : 1) ? 'max' : 'min'
}

// spoils: the most valuable card for the deck, with a lean toward the suit the opponent showed most (hate-draft).
// a plain low card would only water the deck down, so skip it for the $1
function spoilsPick(m: Match, p: Player): Action {
  const at = pairOf(m, p.seat)!
  const sp = at.pair.spoils!
  const theirs = at.pair.hands.flatMap(h => (h.plays[1 - at.pos].kind === 'play' ? h.plays[1 - at.pos].cards : []))
  const hot = SUITS.reduce((b, s) => (theirs.filter(c => c.suit === s).length > theirs.filter(c => c.suit === b).length ? s : b))
  const worth = (c: Card) => spoilsWorth(c) + (theirs.filter(x => x.suit === hot).length >= 4 && c.suit === hot ? 4 : 0)
  const best = sp.cards.reduce((b, c) => (worth(c) > worth(b) ? c : b))
  // the bigger the deck, the better a card has to be to earn a spot
  return worth(best) >= 8 + Math.max(0, deckSize(p) - 18) ? { type: 'spoils', cardId: best.id } : { type: 'spoils', cardId: null }
}

// ---------- the shop ----------

const DECK_CAP = 26 // bots stop buying packs here

// how much a bot wants each insert, for tossing the weakest when the Sleeve is full
const INSERT_WORTH: Record<Insert, number> = {
  prism: 9, allumettes: 8, code: 7, foil: 6, holo: 6, tampon: 5, reprint: 5, photocopie: 4, checklist: 4, stylo: 3, broyeuse: 3, wishlist: 2, grail: 10,
}

// one shop decision: sort the open pack, make room in the Sleeve, sell, buy, restock, bin bulk, leave
function shopAction(m: Match, p: Player, style: BotStyle): Action {
  const shop = p.shop!
  if (shop.open) return { type: 'sortPack', toDeck: shop.open.cards.filter(defaultToDeck).map(c => c.id) }
  // a code or wishlist can be used here. a full Sleeve tosses the weakest of the three
  const held = [...p.sleeve, ...(p.overflow ? [p.overflow] : [])]
  for (const [slot, ins] of held.entries()) {
    const real = slot < p.sleeve.length ? slot : SLEEVE_SLOTS
    if (ins.id === 'code') return { type: 'useInsert', slot: real, cardIds: [], suit: null }
    if (ins.id === 'wishlist' && wishable(p).length > 0) {
      return { type: 'useInsert', slot: real, cardIds: [wishable(p).reduce((b, c) => (sellPrice(c) > sellPrice(b) ? c : b)).id], suit: null }
    }
  }
  if (p.overflow) {
    const worst = held.reduce((w, c, i) => (INSERT_WORTH[c.id] < INSERT_WORTH[held[w].id] ? i : w), 0)
    return { type: 'tossInsert', slot: worst < p.sleeve.length ? worst : SLEEVE_SLOTS }
  }
  if (!style.buys) return { type: 'leaveShop' }

  // keep next round's max, plus le patron's payment: all of it before the boss, half of it earlier in the table
  const due = p.owes ? markerFor(tableOf(m.round)) ?? 0 : 0
  const reserve = pairBlinds(m, [p.seat]).max + style.reserve + (m.round % ROUNDS_PER_TABLE === 0 ? due : Math.ceil(due / 2))
  const packs = shop.offers.filter(o => o.type === 'pack' && o.sold).length
  // hold the binder for STONKS: sell what's hot now, dump the rest when it gets fat or money is tight
  for (const card of p.binder) {
    if (refusesToBuy(m, card)) continue
    const hot = binderPrice(m, p, card) > sellPrice(card)
    if (hot || p.binder.length > 6 || p.bankroll < reserve) return { type: 'sell', cardId: card.id }
  }
  // grading desk: ship the freshest special deck card. chronopost when the budget has room, la poste when it's tight
  if (style.ships && shop.services.grading && !shop.shipped && !p.shipping) {
    const card = [...p.pile, ...p.discard]
      .filter(c => canGrade(c) && isSpecial(c))
      .sort((a, b) => freshness(b, m.round) - freshness(a, m.round) || b.tier - a.tier)[0]
    const shipper: Shipper = p.bankroll - SHIPPERS.chrono.price >= reserve + 6 ? 'chrono' : 'poste'
    if (card && p.bankroll - SHIPPERS[shipper].price >= reserve + 2) return { type: 'ship', cardId: card.id, shipper }
  }
  for (const [slot, o] of shop.offers.entries()) {
    if (o.sold) continue
    if (style.random && chance(makeRng(`${m.config.seed}:${m.round}:${p.seat}:skip:${shop.restocks}:${slot}`), 0.5)) continue
    if (p.bankroll - o.price < reserve) continue
    if (o.type === 'collectible' && p.display.length >= displaySlots(p)) continue
    // a bigger deck waters down every hand: one pack per stock, and none past the deck cap
    if (o.type === 'pack' && (!style.packs || packs >= 1 || deckSize(p) >= DECK_CAP)) continue
    if (o.type === 'sleeve' && p.sleeves.includes(o.id)) continue
    // a scratcher only with room up the Sleeve and money to spare
    if (o.type === 'scratcher' && (!style.inserts || p.sleeve.length >= SLEEVE_SLOTS || p.bankroll - o.price < reserve + 4)) continue
    if (problem(m, p.seat, { type: 'buy', slot }) !== null) continue
    return { type: 'buy', slot }
  }
  if (shop.restocks < style.restocks && p.bankroll - restockPrice(shop, freeRestocks(m, p)) >= reserve + 8) return { type: 'restock' }
  const hasBulk = [...p.pile, ...p.discard].some(c => c.bulk)
  if (shop.services.bulkBin && hasBulk && p.bankroll - bulkPrice(p) >= reserve + 4) return { type: 'binBulk' }
  return { type: 'leaveShop' }
}

