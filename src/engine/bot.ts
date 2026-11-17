import { sellPrice, type Card } from './cards.ts'
import type { BetAction, Betting, Seat } from './betting.ts'
import {
  appraiseFor, binBulk, binderPrice, bulkPrice, buySleeve, canMulligan, dealHand, defaultToDeck, freeMulligan, freeRestocks,
  mulligan, roundRng, seatOf, sellBinder, shopSleeve, tableBlinds, takePull, twistFor, displaySlots, type Player, type Run,
} from './run.ts'
import { chance, type Rng } from './rng.ts'
import type { Appraisal } from './scoring.ts'
import { PLAY_SIZE } from './economy.ts'
import { newShop, openPack, restock, restockPrice, type PackKind, type ShopMemory } from './shop.ts'
import type { HandType } from './hands.ts'

export function combos<T>(items: T[], k: number): T[][] {
  const out: T[][] = []
  const pickFrom = (start: number, chosen: T[]) => {
    if (chosen.length === k) {
      out.push(chosen.slice())
      return
    }
    for (let i = start; i <= items.length - (k - chosen.length); i++) {
      chosen.push(items[i])
      pickFrom(i + 1, chosen)
      chosen.pop()
    }
  }
  pickFrom(0, [])
  return out
}

// tries every 5-card pick (56 for 8 cards) using the estimate appraisal (no misprint rolls), then drops kickers
// so they go back into the pile instead of the discard. lowball wants the smallest single card
export function bestPlay(run: Run, p: Player, hand: Card[]): { played: Card[]; est: Appraisal } {
  if (hand.length === 0) throw new Error('no hand to pick from')
  const low = twistFor(run)?.id === 'lowball'
  let best: { played: Card[]; est: Appraisal } | null = null
  for (const played of combos(hand, low ? 1 : Math.min(PLAY_SIZE, hand.length))) {
    const est = appraiseFor(run, p, played, false, null)
    if (!best || (low ? est.total < best.est.total : est.total > best.est.total)) best = { played, est }
  }
  if (!best) throw new Error('no hand to pick from')
  const scoring = best.played.filter(c => best.est.scoringIds.includes(c.id))
  if (scoring.length > 0 && scoring.length < best.played.length) {
    const est = appraiseFor(run, p, scoring, false, null)
    if (est.total >= best.est.total) return { played: scoring, est }
  }
  return best
}

// mulligans shrink your hand for the rest of the table, so only toss a free one or a hopeless high card
export function botMulligan(run: Run, p: Player, hand: Card[]): number[] {
  if (twistFor(run)?.id === 'lowball' || hand.length <= PLAY_SIZE) return []
  const { played, est } = bestPlay(run, p, hand)
  const weak = est.hand === 'high' || (est.hand === 'pair' && freeMulligan(p))
  if (!weak) return []
  const keep = new Set(played.map(c => c.id))
  return hand.filter(c => !keep.has(c.id)).map(c => c.id)
}

export type BotStyle = {
  maxAt: number // strength needed to bet/raise max
  playAt: number // strength needed to bet min / call a min
  callMaxAt: number // strength needed to call a max
  bluff: number // chance to bet max on anything
  // shop
  reserve: number // $ kept on top of next round's max
  packs: boolean // buys paid packs
  restocks: number // max restocks per shop
  random?: true // picks a random legal action, skips half the shop
}

export const STYLES: Record<string, BotStyle> = {
  greedy: { maxAt: 1.4, playAt: 0.6, callMaxAt: 1.0, bluff: 0.08, reserve: 0, packs: true, restocks: 2 },
  cautious: { maxAt: 1.9, playAt: 0.85, callMaxAt: 1.4, bluff: 0.02, reserve: 10, packs: false, restocks: 0 },
  random: { maxAt: 0, playAt: 0, callMaxAt: 0, bluff: 0, reserve: 0, packs: true, restocks: 2, random: true },
  // rival difficulties
  easy: { maxAt: 1.5, playAt: 0.7, callMaxAt: 1.1, bluff: 0.04, reserve: 6, packs: false, restocks: 0 },
  house: { maxAt: 1.3, playAt: 0.6, callMaxAt: 0.9, bluff: 0.08, reserve: 4, packs: true, restocks: 1 },
  sharp: { maxAt: 1.2, playAt: 0.55, callMaxAt: 0.85, bluff: 0.1, reserve: 2, packs: true, restocks: 2 },
}

export function getStyle(name: string): BotStyle {
  const s = STYLES[name]
  if (!s) throw new Error(`unknown bot style ${name}, use ${Object.keys(STYLES).join('|')}`)
  return s
}

// what an average dealt hand appraises at per round. bots compare their hand to this.
// calibrated from `pnpm sim` (REF_SCORE line, greedy vs medium): median of every hand the rival was dealt, not just
// showdowns (those skew ~2× high since bots fold the weak ones). tournament rounds 3/6/9 are interpolated, twists skew them
export const REF_SCORE: readonly number[] = [336, 488, 770, 1050, 1284, 1540, 1800, 1850, 1900]

export function botAct(
  b: Betting, legal: BetAction[], est: number, run: Run, style: BotStyle, rng: Rng,
): BetAction {
  if (style.random) return legal[Math.floor(rng() * legal.length)]
  // lowball has no good yardstick, and it's a forced round anyway: just see the showdown
  const strength = twistFor(run)?.id === 'lowball' ? 1 : est / REF_SCORE[run.round - 1]
  const giveUp: BetAction = legal.includes('forge') ? 'forge' : legal.includes('fold') ? 'fold' : legal[0]

  if (b.step === 1) {
    if (legal.includes('max') && (strength >= style.maxAt || chance(rng, style.bluff))) return 'max'
    return strength >= style.playAt || !legal.includes('fold') ? 'min' : giveUp
  }
  if (b.step === 2) {
    if (b.firstBet === 'max') return strength >= style.callMaxAt || !legal.includes('fold') ? 'call' : giveUp
    if (legal.includes('raise') && strength >= style.maxAt) return 'raise'
    return strength >= style.playAt * 0.9 || !legal.includes('fold') ? 'call' : giveUp
  }
  return strength >= style.callMaxAt * 0.9 || !legal.includes('fold') ? 'call' : 'fold'
}

// open a pack: special cards to the deck, plain ones to the binder (same as the player's default sort)
export function botTakePack(run: Run, seat: Seat, kind: PackKind, rng: Rng, mem: ShopMemory): void {
  const p = seatOf(run, seat)
  const pack = openPack(kind, rng, run.round, mem, p.display)
  for (const card of pack.cards) takePull(run, card, defaultToDeck(card), seat)
  if (pack.codeCard) p.levels[pack.codeCard as HandType]++
  if (pack.collectible && p.display.length < displaySlots(p)) p.display.push(pack.collectible)
}

// hold the binder for STONKS: sell what's hot now, dump the rest when it gets fat or money is tight
function botSellBinder(run: Run, seat: Seat, reserve: number): void {
  const p = seatOf(run, seat)
  for (const card of p.binder.slice()) {
    const hot = binderPrice(run, p, card) > sellPrice(card)
    if (hot || p.binder.length > 6 || p.bankroll < reserve) sellBinder(run, seat, card.id)
  }
}

// a bot's whole shop visit. returns $ spent (negative = it made money selling). round 1 has no shop, just the free pack
export function botShop(run: Run, seat: Seat, style: BotStyle): number {
  const p = seatOf(run, seat)
  // the rival shops off its own stream, so your restocks never change what it buys
  const rng = seat === 0 ? run.rng : roundRng(run, 'rivalshop')
  const mem = seat === 0 ? run.mem : run.rivalMem
  const start = p.bankroll
  const reserve = tableBlinds(run).max + style.reserve

  botTakePack(run, seat, 'free', rng, mem)
  if (run.round === 1) return start - p.bankroll
  botSellBinder(run, seat, reserve)
  let shop = newShop(rng, mem, p.display, shopSleeve(run, seat))
  for (let pass = 0; pass <= style.restocks; pass++) {
    for (const offer of shop.offers) {
      if (offer.sold || (offer.type === 'pack' && offer.kind === 'free')) continue
      if (style.random && rng() < 0.5) continue
      if (p.bankroll - offer.price < reserve) continue
      if (offer.type === 'sleeve') {
        buySleeve(run, seat, offer.id)
        offer.sold = true
        continue
      }
      if (offer.type === 'collectible') {
        if (p.display.length >= displaySlots(p)) continue
        p.display.push(offer.owned)
      } else {
        if (!style.packs) continue
        botTakePack(run, seat, offer.kind, rng, mem)
      }
      p.bankroll -= offer.price
      offer.sold = true
    }
    if (pass === style.restocks) break
    const cost = restockPrice(shop, freeRestocks(p))
    if (p.bankroll - cost < reserve + 8) break
    p.bankroll -= cost
    shop = restock(shop, rng, mem, p.display)
  }
  // bin one bulk a shop when there's money to spare
  const hasBulk = [...p.pile, ...p.discard].some(c => c.bulk)
  if (hasBulk && p.bankroll - bulkPrice(p) >= reserve + 4) binBulk(run, seat)
  botSellBinder(run, seat, reserve)
  return start - p.bankroll
}

// deal, mulligan and pick what to play for a bot seat. played = [] means the pile was empty: it loses the round
export function botDeal(run: Run, seat: Seat): { played: Card[]; est: Appraisal | null; mulls: number } {
  const p = seatOf(run, seat)
  dealHand(run, seat)
  let mulls = 0
  // at most 2 tries, each one costs a card unless it's free
  for (let m = 0; m < 2 && canMulligan(run, p); m++) {
    const toss = botMulligan(run, p, p.hand)
    if (!toss.length) break
    mulligan(run, seat, toss)
    mulls++
  }
  if (p.hand.length === 0) return { played: [], est: null, mulls }
  return { ...bestPlay(run, p, p.hand), mulls }
}
