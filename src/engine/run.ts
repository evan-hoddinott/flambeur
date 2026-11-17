import { sellPrice, type Card, type Trait } from './cards.ts'
import { OFFERED, autoDraft, draftDeck, draftRows, rulesFor, type Rules, type StarterId } from './starters.ts'
import { COLLECTIBLES, hasCollectible, rollParam, type Owned } from './collectibles.ts'
import {
  BULK_BIN_PRICE, GOLD_BORDER, GRADING_PRICE, HAND_SIZE, HOUSE_BONUS, MOMENTUM_MAX, PAYCHECK, ROUNDS, SLEEVE_PRICE, TOURNAMENT_ROUNDS,
  blinds, interest, isTableStart, streakBonus,
} from './economy.ts'
import type { HandType } from './hands.ts'
import { chance, makeRng, pick, randInt, type Rng } from './rng.ts'
import { appraise, emptyLevels, type Appraisal } from './scoring.ts'
import { settle, type Betting, type Seat } from './betting.ts'
import { autoKeep, buildForged, grindOnFold, forgePlan } from './forge.ts'
import { cleanup, dealFresh, deckSize, mulliganHand, shuffleIn, startTable, takeOut, type Piles } from './deck.ts'
import type { ShopMemory } from './shop.ts'
import { isTournament, rollTwists, type Twist } from './twists.ts'
import { sleeveOffer, stonksFor, stonksMult, type SleeveId, type Stonks } from './sleeves.ts'

// hand / pile / discard make up the deck (deck.ts). the binder is separate: never drawn, it's what you sell from
export type Player = Piles & {
  bankroll: number
  display: Owned[]
  levels: Record<HandType, number>
  streak: number
  rules: Rules // from the starter box
  binder: Card[]
  sleeves: SleeveId[]
  mulls: number // mulligans this table that cost hand size
  freeMullsUsed: number // this table
  tableWins: number // showdowns won earlier this table, for momentum at the boss
  bulkBinned: number // paid bulk removals this run, each one costs $1 more
  grading: { card: Card; grade: number; toDeck: boolean; back: number }[] // away at the grading desk until round `back`
}

// solo is a 1v1 duel against one rival who plays by the same rules you do (own box, draft, shop, forges).
// difficulty is picked once per run. hard is the high roller table: a sharper rival with a head start
export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTIES: Record<Difficulty, { name: string; text: string; style: string; bankroll: number; rare: boolean; scoreMult: number }> = {
  easy: { name: 'Easy', text: 'A tourist. Plays scared and barely shops.', style: 'easy', bankroll: 0, rare: false, scoreMult: 1 },
  medium: { name: 'Medium', text: 'A regular. Knows when to push.', style: 'house', bankroll: 0, rare: false, scoreMult: 1.5 },
  hard: { name: 'High Roller', text: 'A shark. Starts with +$10 and a rare collectible.', style: 'sharp', bankroll: 10, rare: true, scoreMult: 2 },
}

export type Run = {
  seed: string
  rng: Rng
  round: number // 1..9
  difficulty: Difficulty
  starter: StarterId
  rivalStarter: StarterId
  you: Player
  rival: Player
  // draws, reshuffles and shuffling new cards in, one per seat. reset every round, see roundRng
  pileRng: Rng
  rivalPileRng: Rng
  mem: ShopMemory
  rivalMem: ShopMemory
  twists: Twist[] // one per tournament round
  over: boolean
  won: boolean
}

// the pile gets shuffled when the first table starts (dealHand)
function newPlayer(seed: string, starter: StarterId, picks: number[]): Player {
  const rules = rulesFor(starter)
  return {
    bankroll: rules.startBankroll, hand: [], pile: draftDeck(seed, starter, picks), discard: [], display: [...rules.startDisplay],
    levels: emptyLevels(), streak: 0, rules, binder: [], sleeves: [], mulls: 0, freeMullsUsed: 0, tableWins: 0, bulkBinned: 0, grading: [],
  }
}

function newMemory(rules: Rules): ShopMemory {
  return { seen: new Set<string>(), rolledOver: false, packDiscount: rules.packDiscount }
}

// picks = the 3 draft rows you kept (see draftRows). the rival opens its own box from the seed,
// so a daily run puts everyone against the same rival
export function newRun(seed: string, starter: StarterId, picks: number[], difficulty: Difficulty = 'medium'): Run {
  const pileRng = makeRng(`${seed}:1:pile`)
  const rivalPileRng = makeRng(`${seed}:1:rivalpile`)
  const you = newPlayer(seed, starter, picks)

  const rivalRng = makeRng(`${seed}:rival`)
  const rivalSeed = `${seed}:rival`
  const rivalStarter = pick(rivalRng, OFFERED)
  const rival = newPlayer(rivalSeed, rivalStarter, autoDraft(draftRows(rivalSeed, rivalStarter)))
  const d = DIFFICULTIES[difficulty]
  rival.bankroll += d.bankroll
  if (d.rare) {
    const rares = COLLECTIBLES.filter(c => c.rarity === 'rare' && !hasCollectible(rival.display, c.id))
    const def = pick(rivalRng, rares)
    if (rival.display.length >= displaySlots(rival)) throw new Error('rival case full before the run started')
    rival.display.push({ id: def.id, param: rollParam(def, rivalRng) })
  }

  return {
    seed, rng: makeRng(seed), round: 1, difficulty, starter, rivalStarter, you, rival, pileRng, rivalPileRng,
    mem: newMemory(you.rules), rivalMem: newMemory(rival.rules), twists: rollTwists(seed), over: false, won: false,
  }
}

export function seatOf(run: Run, seat: Seat): Player {
  return seat === 0 ? run.you : run.rival
}

function pileRngOf(run: Run, seat: Seat): Rng {
  return seat === 0 ? run.pileRng : run.rivalPileRng
}

// the tournament twist for a round, null on normal rounds
export function twistFor(run: Run, round = run.round): Twist | null {
  if (!isTournament(round)) return null
  return run.twists[TOURNAMENT_ROUNDS.indexOf(round)]
}

// this round's ante and max. one table, so the bigger starter ante bonus applies to both. high stakes: min = max
export function tableBlinds(run: Run, round = run.round): { ante: number; max: number } {
  const b = blinds(round)
  const bonus = Math.max(run.you.rules.anteBonus, run.rival.rules.anteBonus)
  const max = b.max + bonus
  return { ante: twistFor(run, round)?.id === 'highstakes' ? max : b.ante + bonus, max }
}

export function canMulligan(run: Run, p: Player): boolean {
  return twistFor(run)?.id !== 'colddeck' && p.hand.length > 0
}

// next mulligan this table is free (classic's first one), so it won't shrink your hand
export function freeMulligan(p: Player): boolean {
  return p.freeMullsUsed < p.rules.freeMulligans
}

// 8, +1 deck box, +1 big hands, −1 per mulligan this table
export function handSize(p: Player): number {
  const extra = (hasCollectible(p.display, 'deck_box') ? 1 : 0) + (p.sleeves.includes('big_hands') ? 1 : 0)
  return HAND_SIZE + extra - p.mulls
}

export function displaySlots(p: Player): number {
  return p.rules.displaySlots + (p.sleeves.includes('riser') ? 1 : 0)
}

// separate stream per round + purpose, so a restock in your shop doesn't change your draws or the rival's
export function roundRng(run: Run, purpose: 'pile' | 'rivalpile' | 'rivalshop'): Rng {
  return makeRng(`${run.seed}:${run.round}:${purpose}`)
}

// a fresh hand every round. the first round of a table shuffles everything into one pile first.
// a short or empty hand is possible when the pile runs dry (empty = you lose the round)
export function dealHand(run: Run, seat: Seat = 0): Card[] {
  const p = seatOf(run, seat)
  if (isTableStart(run.round)) {
    startTable(p, pileRngOf(run, seat))
    p.mulls = 0
    p.freeMullsUsed = 0
    p.tableWins = 0
  }
  return dealFresh(p, handSize(p))
}

export function mulligan(run: Run, seat: Seat, tossIds: number[]): { drawn: Card[]; free: boolean } {
  const p = seatOf(run, seat)
  if (!canMulligan(run, p)) throw new Error('no mulligans right now')
  const free = freeMulligan(p)
  if (free) p.freeMullsUsed++
  else p.mulls++
  return { drawn: mulliganHand(p, tossIds, pileRngOf(run, seat), free), free }
}

// deck pulls and forged cards get shuffled into the current pile
export function addCard(run: Run, card: Card, seat: Seat = 0): void {
  shuffleIn(seatOf(run, seat), card, pileRngOf(run, seat))
}

// every pull goes to the deck or the binder. you keep everything
export function takePull(run: Run, card: Card, toDeck: boolean, seat: Seat = 0): void {
  if (card.bulk) throw new Error('bulk never comes out of a pack')
  if (toDeck) addCard(run, card, seat)
  else seatOf(run, seat).binder.push(card)
}

// default sort when you rip a pack: special cards to the deck, plain ones to the binder
export function defaultToDeck(card: Card): boolean {
  return card.finish !== null || card.stamp !== null || card.tier > 0 || card.grade !== null
}

export function stonks(run: Run): Stonks {
  return stonksFor(run.seed, run.round)
}

export function binderPrice(run: Run, p: Player, card: Card): number {
  return sellPrice(card) * stonksMult(card, stonks(run), p.sleeves.includes('hot_market'))
}

// selling only happens from the binder
export function sellBinder(run: Run, seat: Seat, id: number): number {
  const p = seatOf(run, seat)
  const i = p.binder.findIndex(c => c.id === id)
  if (i < 0) throw new Error(`card ${id} is not in the binder`)
  const price = binderPrice(run, p, p.binder[i])
  p.binder.splice(i, 1)
  p.bankroll += price
  return price
}

export function bulkPrice(p: Player): number {
  return p.sleeves.includes('bulk_deal') ? 1 : BULK_BIN_PRICE + p.bulkBinned
}

// pay the shop to bin one bulk card for good. between rounds only
export function binBulk(run: Run, seat: Seat): void {
  const p = seatOf(run, seat)
  const bulk = [...p.pile, ...p.discard].find(c => c.bulk)
  if (!bulk) throw new Error('no bulk to bin')
  const price = bulkPrice(p)
  if (p.bankroll - price < 1) throw new Error('can not afford to bin bulk')
  takeOut(p, bulk.id)
  p.bankroll -= price
  p.bulkBinned++
}

export function freeRestocks(p: Player): number {
  return (hasCollectible(p.display, 'store_credit') ? 1 : 0) + (p.sleeves.includes('restock') ? 1 : 0)
}

// this shop's sleeve: only in the shop right before a boss, and only one per table
export function shopSleeve(run: Run, seat: Seat): SleeveId | null {
  if (!isTournament(run.round)) return null
  return sleeveOffer(run.seed, run.round, seatOf(run, seat).sleeves)
}

export function buySleeve(run: Run, seat: Seat, id: SleeveId): void {
  const p = seatOf(run, seat)
  if (p.sleeves.includes(id)) throw new Error(`already own ${id}`)
  if (p.bankroll - SLEEVE_PRICE < 1) throw new Error('can not afford the sleeve')
  p.bankroll -= SLEEVE_PRICE
  p.sleeves.push(id)
}

// +3 pulled this round, +2 last round, +1 two rounds ago. the starting deck is never fresh
export function freshness(card: Card, round: number): number {
  if (card.pulledRound === 0) return 0
  return Math.max(0, 3 - (round - card.pulledRound))
}

export function canGrade(card: Card): boolean {
  return !card.bulk && card.grade === null
}

// send a deck or binder card off for one round. grade = 1d10 + freshness, cap 10. it comes back next shop
export function sendToGrading(run: Run, seat: Seat, id: number): void {
  const p = seatOf(run, seat)
  if (p.bankroll - GRADING_PRICE < 1) throw new Error('can not afford grading')
  const bi = p.binder.findIndex(c => c.id === id)
  const toDeck = bi < 0
  const card = toDeck ? takeOut(p, id) : p.binder.splice(bi, 1)[0]
  if (!canGrade(card)) throw new Error(`${card.id} can not be graded`)
  const rng = seat === 0 ? run.rng : roundRng(run, 'rivalshop')
  const grade = Math.min(10, randInt(rng, 1, 10) + freshness(card, run.round))
  p.bankroll -= GRADING_PRICE
  p.grading.push({ card, grade, toDeck, back: run.round + 1 })
}

// forging needs at least a pair. there's no deck floor: forging leaves bulk behind instead
export function canForge(played: Card[]): boolean {
  return played.length > 0 && forgePlan(played) !== null
}

export function appraiseFor(run: Run, p: Player, played: Card[], betMax: boolean, rng: Rng | null): Appraisal {
  return appraise(played, {
    levels: p.levels,
    display: p.display,
    displaySlots: p.rules.displaySlots,
    deckSize: deckSize(p),
    bankroll: p.bankroll,
    ante: tableBlinds(run).ante,
    hypeMod: p.rules.hypeMod,
    twist: twistFor(run),
    betMax,
    rng,
  })
}

// higher appraisal wins, except lowball
export function showdownWinner(run: Run, you: number, rival: number): Seat | null {
  if (you === rival) return null
  const youWin = twistFor(run)?.id === 'lowball' ? you < rival : you > rival
  return youWin ? 0 : 1
}

export type RoundResult = {
  delta: number // bankroll change from the table, incl the gold border side bet
  outcome: 'win' | 'loss' | 'tie' | 'fold' | 'forge'
  income: { paycheck: number; house: number; interest: number; streak: number; sticker: number; gold: number }
  forged: Card | null
  bulk: Card[] // left behind by the forge
  ground: Card | null // the card a fold ground up +1
  torn: Card[]
}

function outcomeFor(o: NonNullable<Betting['outcome']>, seat: Seat, winner: Seat | null): RoundResult['outcome'] {
  if (o.kind === 'showdown') return winner === null ? 'tie' : winner === seat ? 'win' : 'loss'
  return o.by === seat ? o.kind : 'win' // they folded
}

// forge, card growth, cleanup and streak for one seat. bankroll and income happen after both seats
function playOut(run: Run, seat: Seat, o: NonNullable<Betting['outcome']>, outcome: RoundResult['outcome'], played: Card[], scoringIds: number[], keep: Trait[] | null): RoundResult {
  const p = seatOf(run, seat)
  const gone = new Set<number>() // forged away or torn, these leave the deck for good
  let forged: Card | null = null
  let bulk: Card[] = []
  const ground = outcome === 'fold' && played.length > 0 ? grindOnFold(played) : null
  if (outcome === 'forge') {
    const plan = forgePlan(played)
    if (!plan) throw new Error('forge on a hand that cannot forge')
    for (const c of plan.merged) gone.add(c.id)
    ;({ forged, bulk } = buildForged(plan, keep ?? autoKeep(plan), run.round))
  }

  // cards only grow / tear if they actually got appraised
  const torn: Card[] = []
  if (o.kind === 'showdown') {
    for (const card of played) {
      if (!scoringIds.includes(card.id) || card.bulk) continue
      if (card.stamp === 'first') card.bonusHype++
      if (card.stamp === 'damaged' && chance(run.rng, 0.25)) torn.push(card)
    }
    for (const c of torn) gone.add(c.id)
  }
  // fold and forge muck the whole hand, otherwise the unplayed cards go back into the pile
  cleanup(p, played, gone, outcome === 'fold' || outcome === 'forge', pileRngOf(run, seat))
  if (forged) addCard(run, forged, seat)
  for (const b of bulk) addCard(run, b, seat)

  // folding breaks any streak, otherwise folding every round farms the cold streak bonus
  if (outcome === 'win') p.streak = p.streak > 0 ? p.streak + 1 : 1
  else if (outcome === 'loss') p.streak = p.streak < 0 ? p.streak - 1 : -1
  else if (outcome !== 'tie') p.streak = 0

  const income = { paycheck: 0, house: 0, interest: 0, streak: 0, sticker: 0, gold: 0 }
  return { delta: 0, outcome, income, forged, bulk, ground, torn }
}

// the house bonus at the boss: 2× ante + 1× per showdown won earlier this table (momentum), max +2
export function houseMult(run: Run, p: Player): number {
  return isTournament(run.round) ? HOUSE_BONUS + Math.min(MOMENTUM_MAX, p.tableWins) : HOUSE_BONUS
}

// showdown = you played the hand out (win, loss or tie). the house bonus goes to the showdown winner only
function payIncome(run: Run, p: Player, r: RoundResult, showdown: boolean): void {
  r.income.paycheck = showdown ? PAYCHECK : 0
  r.income.house = showdown && r.outcome === 'win' ? houseMult(run, p) * tableBlinds(run).ante : 0
  r.income.interest = interest(p.bankroll, p.sleeves.includes('deep_pockets') ? 4 : 2)
  r.income.streak = streakBonus(p.streak)
  r.income.sticker = r.outcome === 'win' && hasCollectible(p.display, 'price_sticker') ? 1 : 0
  p.bankroll += r.income.paycheck + r.income.house + r.income.interest + r.income.streak + r.income.sticker
}

// everything after betting is decided, for both seats: forge, payouts, gold border, card growth, cleanup, income, bust check.
// keep = traits you chose when your forge goes over the tier cap. null = strongest automatically. the rival always auto-keeps.
// the run ends when either bankroll hits $0 or after round 9. you win by surviving or busting the rival
export function finishRound(
  run: Run, betting: Betting, winner: Seat | null,
  played: [Card[], Card[]], scoringIds: [number[], number[]], keep: Trait[] | null = null,
): [RoundResult, RoundResult] {
  if (!betting.outcome) throw new Error('round not finished')
  const o = betting.outcome
  const delta = settle(betting, winner)
  // double down: the house matches the pot, so the winner takes it twice
  if (o.kind === 'showdown' && winner !== null && twistFor(run)?.id === 'doubledown') delta[winner] += betting.committed[winner]

  const seats: Seat[] = [0, 1]
  // gold border: a side bet on every gold card you played. settles on a showdown win or loss, folds and ties are nothing
  const gold = seats.map(s => {
    if (o.kind !== 'showdown' || winner === null) return 0
    return (winner === s ? 1 : -1) * GOLD_BORDER * played[s].filter(c => c.stamp === 'gold').length
  })
  const results = seats.map(s => playOut(run, s, o, outcomeFor(o, s, winner), played[s], scoringIds[s], s === 0 ? keep : null)) as [RoundResult, RoundResult]
  for (const s of seats) {
    const p = seatOf(run, s)
    results[s].delta = delta[s] + gold[s]
    results[s].income.gold = gold[s]
    p.bankroll = Math.max(0, p.bankroll + delta[s] + gold[s])
    // momentum only counts the normal rounds of a table
    if (o.kind === 'showdown' && winner === s && !isTournament(run.round)) p.tableWins++
  }

  if (run.you.bankroll === 0 || run.rival.bankroll === 0) {
    run.over = true
    run.won = run.you.bankroll > 0
    return results
  }
  for (const s of seats) payIncome(run, seatOf(run, s), results[s], o.kind === 'showdown')
  if (run.round >= ROUNDS) {
    run.over = true
    run.won = true
  }
  return results
}

// leaderboard score: final bankroll × difficulty, 0 if you busted
export function runScore(run: Run): number {
  return run.won ? Math.round(run.you.bankroll * DIFFICULTIES[run.difficulty].scoreMult) : 0
}

// separate from finishRound so the result screen still shows the round that was just played.
// graded cards come back here, before the shop
export function nextRound(run: Run): void {
  if (run.over) throw new Error('next round on a finished run')
  run.round++
  run.pileRng = roundRng(run, 'pile')
  run.rivalPileRng = roundRng(run, 'rivalpile')
  for (const seat of [0, 1] as Seat[]) {
    const p = seatOf(run, seat)
    for (const g of p.grading.filter(x => x.back <= run.round)) {
      g.card.grade = g.grade
      if (g.toDeck) addCard(run, g.card, seat)
      else p.binder.push(g.card)
    }
    p.grading = p.grading.filter(x => x.back > run.round)
  }
}
