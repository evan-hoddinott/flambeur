import type { Card, Trait } from './cards.ts'
import { OFFERED, autoDraft, draftDeck, draftRows, rulesFor, type Rules, type StarterId } from './starters.ts'
import { COLLECTIBLES, hasCollectible, rollParam, type Owned } from './collectibles.ts'
import {
  HAND_SIZE, HOUSE_BONUS, PAYCHECK, ROUNDS, TOURNAMENT_ROUNDS, blinds, interest, streakBonus,
} from './economy.ts'
import type { HandType } from './hands.ts'
import { chance, makeRng, pick, shuffled, type Rng } from './rng.ts'
import { appraise, emptyLevels, type Appraisal } from './scoring.ts'
import { settle, type Betting, type Seat } from './betting.ts'
import { autoKeep, buildForged, grindOnFold, forgePlan, type ForgePlan } from './forge.ts'
import { DECK_FLOOR, deckSize, discardPlayed, refillHand, shuffleIn, type Piles } from './deck.ts'
import type { ShopMemory } from './shop.ts'
import { isTournament, rollTwists, type Twist } from './twists.ts'

// hand / draw / discard persist across rounds (deck.ts). the deck is all three together
export type Player = Piles & {
  bankroll: number
  display: Owned[]
  levels: Record<HandType, number>
  streak: number
  rules: Rules // from the starter box
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

function newPlayer(seed: string, starter: StarterId, picks: number[], rng: Rng): Player {
  const rules = rulesFor(starter)
  const draw = shuffled(rng, draftDeck(seed, starter, picks))
  return { bankroll: rules.startBankroll, hand: [], draw, discard: [], display: [...rules.startDisplay], levels: emptyLevels(), streak: 0, rules }
}

function newMemory(rules: Rules): ShopMemory {
  return { seen: new Set<string>(), rolledOver: false, packDiscount: rules.packDiscount }
}

// picks = the 3 draft rows you kept (see draftRows). the rival opens its own box from the seed,
// so a daily run puts everyone against the same rival
export function newRun(seed: string, starter: StarterId, picks: number[], difficulty: Difficulty = 'medium'): Run {
  const pileRng = makeRng(`${seed}:1:pile`)
  const rivalPileRng = makeRng(`${seed}:1:rivalpile`)
  const you = newPlayer(seed, starter, picks, pileRng)

  const rivalRng = makeRng(`${seed}:rival`)
  const rivalSeed = `${seed}:rival`
  const rivalStarter = pick(rivalRng, OFFERED)
  const rival = newPlayer(rivalSeed, rivalStarter, autoDraft(draftRows(rivalSeed, rivalStarter)), rivalPileRng)
  const d = DIFFICULTIES[difficulty]
  rival.bankroll += d.bankroll
  if (d.rare) {
    const rares = COLLECTIBLES.filter(c => c.rarity === 'rare' && !hasCollectible(rival.display, c.id))
    const def = pick(rivalRng, rares)
    if (rival.display.length >= rival.rules.displaySlots) throw new Error('rival case full before the run started')
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

export function mulligansFor(run: Run, p: Player): number {
  return twistFor(run)?.id === 'colddeck' ? 0 : p.rules.mulligans
}

export function handSize(p: Player): number {
  return hasCollectible(p.display, 'deck_box') ? HAND_SIZE + 1 : HAND_SIZE
}

// separate stream per round + purpose, so a restock in your shop doesn't change your draws or the rival's
export function roundRng(run: Run, purpose: 'pile' | 'rivalpile' | 'rivalshop'): Rng {
  return makeRng(`${run.seed}:${run.round}:${purpose}`)
}

// a hand at the start of a round: carried over cards + top up from the draw pile
export function dealHand(run: Run, seat: Seat = 0): { drawn: Card[]; reshuffled: boolean } {
  const p = seatOf(run, seat)
  return refillHand(p, handSize(p), pileRngOf(run, seat))
}

// pack cards and forged cards get shuffled into the draw pile
export function addCard(run: Run, card: Card, seat: Seat = 0): void {
  shuffleIn(seatOf(run, seat), card, pileRngOf(run, seat))
}

// forging needs a forgeable hand and has to leave the deck at DECK_FLOOR or more
export function forgeCheck(p: Piles, played: Card[]): { plan: ForgePlan | null; thin: boolean } {
  const plan = forgePlan(played)
  const thin = plan !== null && deckSize(p) - plan.merged.length + 1 < DECK_FLOOR
  return { plan, thin }
}

export function canForgeNow(p: Piles, played: Card[]): boolean {
  const { plan, thin } = forgeCheck(p, played)
  return plan !== null && !thin
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
  delta: number // bankroll change from the table
  outcome: 'win' | 'loss' | 'tie' | 'fold' | 'forge'
  income: { paycheck: number; house: number; interest: number; streak: number; sticker: number; gold: number }
  forged: Card | null
  ground: Card | null // the card a fold ground up +1
  torn: Card[]
}

function outcomeFor(o: NonNullable<Betting['outcome']>, seat: Seat, winner: Seat | null): RoundResult['outcome'] {
  if (o.kind === 'showdown') return winner === null ? 'tie' : winner === seat ? 'win' : 'loss'
  return o.by === seat ? o.kind : 'win' // they folded
}

// forge, card growth, discards and streak for one seat. bankroll and income happen after both seats
function playOut(run: Run, seat: Seat, o: NonNullable<Betting['outcome']>, outcome: RoundResult['outcome'], played: Card[], scoringIds: number[], keep: Trait[] | null): RoundResult {
  const p = seatOf(run, seat)
  const gone = new Set<number>() // forged away or torn, these leave the deck for good
  let forged: Card | null = null
  const ground = outcome === 'fold' ? grindOnFold(played) : null
  if (outcome === 'forge') {
    const { plan, thin } = forgeCheck(p, played)
    if (!plan) throw new Error('forge on a hand that cannot forge')
    if (thin) throw new Error('forge would take the deck under the floor')
    for (const c of plan.merged) gone.add(c.id)
    forged = buildForged(plan, keep ?? autoKeep(plan), run.round)
  }

  // cards only grow / tear if they actually got appraised. no tearing at the deck floor
  const torn: Card[] = []
  if (o.kind === 'showdown') {
    for (const card of played) {
      if (!scoringIds.includes(card.id)) continue
      if (card.stamp === 'first') card.bonusHype++
      if (card.stamp === 'damaged' && chance(run.rng, 0.25) && deckSize(p) - torn.length > DECK_FLOOR) torn.push(card)
    }
    for (const c of torn) gone.add(c.id)
  }
  discardPlayed(p, played, gone)
  if (forged) addCard(run, forged, seat)

  // folding breaks any streak, otherwise folding every round farms the cold streak bonus
  if (outcome === 'win') p.streak = p.streak > 0 ? p.streak + 1 : 1
  else if (outcome === 'loss') p.streak = p.streak < 0 ? p.streak - 1 : -1
  else if (outcome !== 'tie') p.streak = 0

  const income = { paycheck: 0, house: 0, interest: 0, streak: 0, sticker: 0, gold: 0 }
  return { delta: 0, outcome, income, forged, ground, torn }
}

// showdown = you played the hand out (win, loss or tie). the house bonus goes to the showdown winner only
function payIncome(p: Player, r: RoundResult, held: Card[], showdown: boolean, ante: number): void {
  r.income.paycheck = showdown ? PAYCHECK : 0
  r.income.house = showdown && r.outcome === 'win' ? HOUSE_BONUS * ante : 0
  r.income.interest = interest(p.bankroll)
  r.income.streak = streakBonus(p.streak)
  r.income.sticker = r.outcome === 'win' && hasCollectible(p.display, 'price_sticker') ? 1 : 0
  r.income.gold = 2 * held.filter(c => c.stamp === 'gold').length
  p.bankroll += r.income.paycheck + r.income.house + r.income.interest + r.income.streak + r.income.sticker + r.income.gold
}

// everything after betting is decided, for both seats: forge, payouts, card growth, income, bust check.
// played cards go to discard (or vanish if forged/torn), the rest of the hand carries to next round.
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
  const held = seats.map(s => seatOf(run, s).hand.filter(c => !played[s].some(p => p.id === c.id)))
  const results = seats.map(s => playOut(run, s, o, outcomeFor(o, s, winner), played[s], scoringIds[s], s === 0 ? keep : null)) as [RoundResult, RoundResult]
  for (const s of seats) {
    const p = seatOf(run, s)
    results[s].delta = delta[s]
    p.bankroll = Math.max(0, p.bankroll + delta[s])
  }

  if (run.you.bankroll === 0 || run.rival.bankroll === 0) {
    run.over = true
    run.won = run.you.bankroll > 0
    return results
  }
  for (const s of seats) payIncome(seatOf(run, s), results[s], held[s], o.kind === 'showdown', tableBlinds(run).ante)
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

// separate from finishRound so the result screen still shows the round that was just played
export function nextRound(run: Run): void {
  if (run.over) throw new Error('next round on a finished run')
  run.round++
  run.pileRng = roundRng(run, 'pile')
  run.rivalPileRng = roundRng(run, 'rivalpile')
}
