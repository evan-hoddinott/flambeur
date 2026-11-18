// the game as a phase state machine. a match is config + an action log: step() is the only way state changes,
// view() is the only thing that leaves the server. see docs/architecture.md section 2
import { MAX_JOKERS, MAX_TIER, REAL_JOKERS, SUITS, newCard, playSlots, sellPrice, stuckMate, type Card, type JokerId, type Suit, type Trait } from './cards.ts'
import { appraise, emptyLevels, type Appraisal } from './scoring.ts'
import { act, firstToAct, forfeit, isUnderdog, legalActions, settle, startBetting, type BetAction, type Betting, type Pos } from './betting.ts'
import { COLLECTIBLES, getDef, hasCollectible, rollParam, type Owned } from './collectibles.ts'
import { HAND_TYPES, type HandType } from './hands.ts'
import { autoKeep, buildForged, forgePlan, grindOnFold, type ForgePlan } from './forge.ts'
import { drawCollectible, keeperFor, newShop, openPack, rollInsert, restock, restockPrice, type Insert, type KeeperId, type PackContents, type PackKind, type Shop, type ShopMemory } from './shop.ts'
import { DEFAULT_RULES, autoDraft, draftDeck, draftRows, rulesFor, starterOffer, validPicks, type DraftRow, type Rules, type StarterId } from './starters.ts'
import { isTournament, rollTwists, type Twist } from './twists.ts'
import { sleeveOffer, stonksFor, stonksMult, type SleeveId, type Stonks } from './sleeves.ts'
import { cleanup, dealFresh, deckSize, mulliganHand, pileView, shuffleIn, startTable, type Piles } from './deck.ts'
import {
  BULK_BIN_PRICE, COLLECTIBLE_PRICE, GOLD_BORDER, SHIPPERS, HAND_SIZE, HOUSE_BONUS, MOMENTUM_MAX, PAYCHECK, PLAY_SIZE, ROUNDS,
  TOURNAMENT_ROUNDS, blinds, interest, isSuddenDeath, isTableStart, tableOf, type Shipper,
} from './economy.ts'
import { chance, makeRng, pick, randInt, shuffled, type Rng } from './rng.ts'

// bump on any rule or rng change. a log only replays on its own version
export const ENGINE_VERSION = '0.9.0'

// ---------- types the server and ui build against ----------

export type SeatId = number // 0..n-1
export type Mode = 'solo' | 'daily' | 'duel' | 'br'
export type Difficulty = 'easy' | 'medium' | 'hard'

// style = bot style override (the sim's greedy/cautious/random policies). bots default to their difficulty's style
export type SeatConfig = { kind: 'human' | 'bot'; name: string; difficulty?: Difficulty; style?: string }
export type MatchConfig = { mode: Mode; seed: string; seats: SeatConfig[] } // 2 seats for solo/daily/duel, up to 10 for br

export type BetChoice = BetAction // 'fold' | 'forge' | 'min' | 'max' | 'match'

// everything a seat can do. cards are always referenced by id, never by hand index
export type Action =
  | { type: 'pickBox'; box: StarterId } // one of the 3 offered
  | { type: 'draft'; rows: number[] } // keep 3 of the 4 rows
  | { type: 'buy'; slot: number } // a pack, collectible or sleeve in the shop's offers
  | { type: 'sortPack'; toDeck: number[] } // closes the open pack: these card ids go to the deck, the rest to the binder
  | { type: 'sell'; cardId: number } // from the binder only
  | { type: 'sellCollectible'; slot: number } // display case slot
  | { type: 'restock' }
  | { type: 'ship'; cardId: number; shipper: Shipper } // send a deck or binder card to grading. one per shop visit
  | { type: 'binBulk' }
  | { type: 'leaveShop' }
  | { type: 'mulligan'; cardIds: number[] }
  | { type: 'lock'; cardIds: number[] } // 1 to 5 cards
  | { type: 'bet'; choice: BetChoice }
  | { type: 'forgeKeep'; traits: Trait[] } // only when a forge goes over the tier's trait cap
  | { type: 'useInsert'; cardId: number; suit: Suit | null } // finish a checklist (card + new suit) or wishlist (binder card, no suit)

export type LogEntry = { seat: SeatId; action: Action; auto?: boolean } // auto = timeout default or bot move

export type ShopOfferView =
  | { type: 'pack'; kind: PackKind; price: number; sold: boolean }
  | { type: 'collectible'; owned: Owned; price: number; sold: boolean }
  | { type: 'sleeve'; id: SleeveId; price: number; sold: boolean }
  | { type: 'scratcher'; price: number; sold: boolean }

export type ShopView = {
  offers: ShopOfferView[]
  restockPrice: number
  bulkPrice: number
  bulkInDeck: number
  shipped: boolean // already sent a card to grading this visit
  open: PackContents | null // a ripped pack waiting for sortPack
  scratch: 'checklist' | 'wishlist' | null // a scratched insert waiting on a card pick
}

export type PhaseKind = 'draft' | 'shop' | 'deal' | 'bet' | 'forgePick' | 'over'

// a seat's betting, from that seat's side. the opponent's locked count is never in here
export type BetView = {
  opponent: SeatId
  first: SeatId
  toAct: SeatId | null // null once the pair is settled
  minStake: number
  maxStake: number
  committed: [number, number] // [me, them]
  choices: { seat: SeatId; choice: BetChoice }[] // both seats' choices so far, in order
  forgePrice: number // what forging costs me right now (the max, or the min when I'm 2× behind)
  underdog: boolean // I'm 2× behind: peek + cheap forge
  forced: boolean // tournament / sudden death: no fold, no forge
  peek: Card | null // one of the opponent's locked cards, only when underdog
  options: BetChoice[] // what I can bet right now. empty when it's not my turn
}

// the last showdown this seat was in. a fold or forge reveals nothing
export type ShowdownView = { opponent: SeatId; mine: Appraisal; theirs: Appraisal; myCards: Card[]; theirCards: Card[]; winner: SeatId | null }

export type RoundResultView = {
  round: number
  outcome: 'win' | 'loss' | 'tie' | 'fold' | 'forge' | 'bye'
  tally: { pot: number; house: number; interest: number; extras: number } // round-end money. extras = gold border + price sticker
  forged: Card | null
  bulk: number
  ground: Card | null
  torn: Card[]
  stolen: Card | null // sticky fingers: the card you took
  robbed: Card | null // sticky fingers: the card the rival took from you
}

export type OtherSeatView = {
  seat: SeatId
  name: string
  kind: 'human' | 'bot'
  bankroll: number
  alive: boolean
  handSize: number // cards in hand right now
  marked: Card[] // their locked Marked knockoffs, face up
  mulligans: number // this table
  deckSize: number
  display: Owned[]
  sleeves: SleeveId[]
  done: boolean // finished the current phase (left the shop, locked in, ...)
}

export type SeatView = {
  engineVersion: string
  mode: Mode
  round: number
  lastRound: number | null // 12 for solo/daily. null = bust only, sudden death after 12
  phase: PhaseKind
  blinds: { ante: number; max: number }
  twist: Twist | null
  nextTwist: { round: number; twist: Twist } | null
  stonks: Stonks
  stonksNext: Stonks | null // only with a Chatty shopkeeper
  keeper: KeeperId[]
  me: {
    seat: SeatId
    name: string
    bankroll: number
    alive: boolean
    hand: Card[]
    locked: Card[] | null
    handSize: number // what the next deal gives you
    mulligans: number
    freeMulligan: boolean
    pile: Card[] // sorted, never in draw order
    discard: Card[] // sorted
    binder: Card[]
    shipping: { card: Card; shipper: Shipper; back: number } | null // away at grading, back at round `back`'s shop. grade hidden till then
    display: Owned[]
    displaySlots: number
    sleeves: SleeveId[]
    levels: Record<HandType, number>
    starter: StarterId | null
    draft: { offer: StarterId[]; rows: DraftRow[] | null } | null
    shop: ShopView | null
    forge: ForgePlan | null // a forge waiting on forgeKeep
    done: boolean
  }
  others: OtherSeatView[]
  bet: BetView | null
  showdown: ShowdownView | null
  last: RoundResultView | null
  result: MatchResult | null
}

export type MatchResult = {
  placement: SeatId[] // best first
  scores: number[] // by seat. solo/daily: margin × difficulty + bust bonus for the winner, 0 otherwise. duel/br: seats outlasted
  winner: SeatId | null
}

export type Event =
  | { kind: 'packOpened'; contents: PackContents }
  | { kind: 'showdown'; showdown: ShowdownView } // drives the count-up
  | { kind: 'roundEnd'; result: RoundResultView }
  | { kind: 'busted'; seat: SeatId }
  | { kind: 'graded'; card: Card } // back from the grading desk
  | { kind: 'scratched'; insert: Insert; hand: HandType | null; collectible: Owned | null; joker: Card | null } // what a scratcher gave
  | { kind: 'matchOver'; result: MatchResult }

export type StepResult = { match: Match; events: { to: SeatId | 'all'; event: Event }[] }

// ---------- state. never sent to a client, only view() is. plain JSON: no Map, Set, Date or closures ----------

export type ShopState = Shop & { shipped: boolean; open: PackContents | null; scratch: 'checklist' | 'wishlist' | null }

// a card away at the grading desk. the grade is rolled when it ships and stays hidden until it's back
export type Shipping = { card: Card; grade: number; to: 'deck' | 'binder'; shipper: Shipper; round: number }

export type Player = Piles & {
  seat: SeatId
  name: string
  kind: 'human' | 'bot'
  difficulty: Difficulty | null
  style: string | null // bot style name
  alive: boolean
  bustRound: number | null
  bankroll: number
  starter: StarterId | null
  rules: Rules
  display: Owned[]
  levels: Record<HandType, number>
  binder: Card[]
  sleeves: SleeveId[]
  mem: ShopMemory
  mulls: number // mulligans this table that cost hand size
  freeMullsUsed: number // this table
  roundMulls: number // this round, bots cap themselves with it
  tableWins: number // showdowns won earlier this table, for momentum at the boss
  bulkBinned: number // paid bulk removals this run, each costs $1 more
  shipping: Shipping | null
  draft: { offer: StarterId[]; rows: DraftRow[] | null } | null // null once drafted
  shop: ShopState | null
  locked: number[] | null
  done: boolean
  forge: { keep: Trait[] | null } | null // this seat forged this round. keep null = waiting on forgeKeep
  peek: number | null // card id of the opponent's locked card this seat gets to see
  showdown: ShowdownView | null
  last: RoundResultView | null
  rng: { pile: Rng; shop: Rng; table: Rng } // reseeded every round from `seed:round:seat:purpose`
}

export type Pair = { seats: [SeatId, SeatId]; betting: Betting | null }

export type Match = {
  engineVersion: string
  config: MatchConfig
  round: number
  phase: PhaseKind
  players: Player[]
  pairs: Pair[] // this round's tables. set at the deal
  twists: Twist[]
  keeper: KeeperId[] // the shopkeeper's sign, 3 traits for the run
  nextCardId: number
  n: number // actions applied so far
  result: MatchResult | null
}

export const DIFFICULTIES: Record<Difficulty, { name: string; text: string; style: string; bankroll: number; rare: boolean; scoreMult: number }> = {
  easy: { name: 'Easy', text: 'A tourist. Plays scared and barely shops.', style: 'easy', bankroll: 0, rare: false, scoreMult: 1 },
  medium: { name: 'Medium', text: 'A regular. Knows when to push.', style: 'house', bankroll: 0, rare: false, scoreMult: 1.5 },
  hard: { name: 'High Roller', text: 'A shark. Starts with +$10 and a rare collectible.', style: 'sharp', bankroll: 10, rare: true, scoreMult: 2 },
}

type Emit = { to: SeatId | 'all'; event: Event }[]

// ---------- setup ----------

export function newMatch(config: MatchConfig): Match {
  const n = config.seats.length
  if (config.mode === 'br' ? n < 2 || n > 10 : n !== 2) throw new Error(`${config.mode} needs ${config.mode === 'br' ? '2-10' : '2'} seats, got ${n}`)
  if ((config.mode === 'solo' || config.mode === 'daily') && (config.seats[0].kind !== 'human' || config.seats[1].kind !== 'bot')) {
    throw new Error(`${config.mode} is seat 0 human vs seat 1 bot`)
  }
  if (!config.seed) throw new Error('match needs a seed')
  const players = config.seats.map((s, seat): Player => {
    if (s.kind === 'bot' && !s.difficulty && !s.style) throw new Error(`bot seat ${seat} needs a difficulty or style`)
    return {
      seat, name: s.name, kind: s.kind, difficulty: s.difficulty ?? null,
      style: s.style ?? (s.kind === 'bot' ? DIFFICULTIES[s.difficulty!].style : null), // a human seat with a style can be autoplayed (the sim)
      alive: true, bustRound: null, bankroll: 0, starter: null, rules: DEFAULT_RULES,
      hand: [], pile: [], discard: [], display: [], levels: emptyLevels(), binder: [], sleeves: [],
      mem: { seen: [], rolledOver: false, packDiscount: 0 },
      mulls: 0, freeMullsUsed: 0, roundMulls: 0, tableWins: 0, bulkBinned: 0, shipping: null,
      // everyone's offer comes off the same stream, so a daily offers every player the same 3 boxes
      draft: { offer: starterOffer(config.mode === 'br' ? `${config.seed}:${seat}` : seat === 0 ? config.seed : `${config.seed}:rival`), rows: null },
      shop: null, locked: null, done: false, forge: null, peek: null, showdown: null, last: null,
      rng: seatRngs(config.seed, 1, seat),
    }
  })
  return {
    engineVersion: ENGINE_VERSION, config, round: 1, phase: 'draft', players, pairs: [],
    twists: rollTwists(config.seed), keeper: keeperFor(config.seed), nextCardId: 1, n: 0, result: null,
  }
}

function seatRngs(seed: string, round: number, seat: SeatId): Player['rng'] {
  return {
    pile: makeRng(`${seed}:${round}:${seat}:pile`),
    shop: makeRng(`${seed}:${round}:${seat}:shop`),
    table: makeRng(`${seed}:${round}:${seat}:table`),
  }
}

// ---------- rule helpers (shared with bots and the ui) ----------

export function seat(m: Match, s: SeatId): Player {
  const p = m.players[s]
  if (!p) throw new Error(`no seat ${s}`)
  return p
}

export function lastRound(m: Match): number | null {
  return m.config.mode === 'solo' || m.config.mode === 'daily' ? ROUNDS : null
}

export function twistFor(m: Match, round = m.round): Twist | null {
  if (!isTournament(round)) return null
  return m.twists[TOURNAMENT_ROUNDS.indexOf(round)]
}

// tournament rounds and sudden death: no folding, no forging
export function isForced(round: number): boolean {
  return isTournament(round) || isSuddenDeath(round)
}

// ante and max for a pair. the bigger starter ante bonus applies to both. high stakes: min = max
export function pairBlinds(m: Match, seats: SeatId[]): { ante: number; max: number } {
  const b = blinds(m.round)
  const bonus = Math.max(0, ...seats.map(s => seat(m, s).rules.anteBonus))
  const max = b.max + bonus
  return { ante: twistFor(m)?.id === 'highstakes' ? max : b.ante + bonus, max }
}

export function handSize(p: Player): number {
  const extra = (hasCollectible(p.display, 'deck_box') ? 1 : 0) + (p.sleeves.includes('big_hands') ? 1 : 0)
  return Math.max(0, HAND_SIZE + extra - p.mulls)
}

export function displaySlots(p: Player): number {
  return p.rules.displaySlots + (p.sleeves.includes('riser') ? 1 : 0)
}

export function freeMulligan(p: Player): boolean {
  return p.freeMullsUsed < p.rules.freeMulligans
}

// a chase is worth more sold than played, so it defaults to the binder
export function defaultToDeck(card: Card): boolean {
  if (card.variant === 'chase') return false
  return card.joker !== null || card.finish !== null || card.stamp !== null || card.knockoff !== null || card.variant !== null || card.tier > 0 || card.grade !== null
}

export function stonks(m: Match): Stonks {
  return stonksFor(m.config.seed, m.round)
}

export function binderPrice(m: Match, p: Player, card: Card): number {
  const fan = (m.keeper.includes('collector') && card.grade !== null) || (m.keeper.includes('nostalgic') && card.stamp === 'first')
  return sellPrice(card) * stonksMult(card, stonks(m), p.sleeves.includes('hot_market')) * (fan ? 2 : 1)
}

// null when the shopkeeper will buy it
export function refusesToBuy(m: Match, card: Card): string | null {
  return m.keeper.includes('superstitious') && card.suit === 'S' ? "the shopkeeper won't touch spades" : null
}

// what the sign does to prices this shop: grumpy +$1, closing down $1 off per Table after the first
export function keeperPriceAdj(m: Match): number {
  return (m.keeper.includes('grumpy') ? 1 : 0) - (m.keeper.includes('closing') ? tableOf(m.round) - 1 : 0)
}

export function bulkPrice(p: Player): number {
  return p.sleeves.includes('bulk_deal') ? 1 : BULK_BIN_PRICE + p.bulkBinned
}

export function freeRestocks(m: Match, p: Player): number {
  return (hasCollectible(p.display, 'store_credit') ? 1 : 0) + (p.sleeves.includes('restock') ? 1 : 0) + (m.keeper.includes('grumpy') ? 1 : 0)
}

// +3 pulled this round, +2 last round, +1 two rounds ago. the starting deck is never fresh
export function freshness(card: Card, round: number): number {
  if (card.pulledRound === 0) return 0
  return Math.max(0, 3 - (round - card.pulledRound))
}

export function canGrade(card: Card): boolean {
  return !card.bulk && card.grade === null
}

export function lockedCards(p: Player): Card[] {
  if (!p.locked) return []
  return p.locked.map(id => {
    const c = p.hand.find(h => h.id === id)
    if (!c) throw new Error(`locked card ${id} is not in seat ${p.seat}'s hand`)
    return c
  })
}

// what each played joker counts as this round. the crayon joker rolls a real one, only at the real showdown
export type JokerRoles = Map<number, JokerId>

export function jokerRoles(played: Card[], rng: Rng | null): JokerRoles {
  const roles: JokerRoles = new Map()
  for (const c of played) {
    if (c.joker === 'crayon') {
      if (rng) roles.set(c.id, pick(rng, REAL_JOKERS))
    } else if (c.joker) roles.set(c.id, c.joker)
  }
  return roles
}

// courtier becomes the J, Q or K that scores best, rival's card copies the rival's highest card (rank, suit, finish).
// the copies drop their joker so appraising them doesn't recurse. returns the cards as they'll be appraised
export function resolveJokers(m: Match, p: Player, played: Card[], ante: number, roles: JokerRoles, rival: Card[] | null): Card[] {
  const top = rival?.filter(c => !c.bulk).reduce<Card | null>((best, c) => (!best || c.rank > best.rank ? c : best), null) ?? null
  let cards = played.map(c => {
    const role = roles.get(c.id)
    if (role === 'rivals' && top) return { ...c, joker: null, rank: top.rank, suit: top.suit, finish: top.finish }
    return role === 'courtier' ? c : { ...c, joker: null }
  })
  for (const courtier of cards.filter(c => c.joker !== null)) {
    let best: Card[] | null = null
    let bestTotal = -1
    for (const rank of [11, 12, 13]) {
      const trial = cards.map(c => (c.id === courtier.id ? { ...c, joker: null, rank } : c))
      const total = appraiseFor(m, p, trial, false, null, ante).total
      if (total > bestTotal) {
        best = trial
        bestTotal = total
      }
    }
    cards = best!
  }
  return cards
}

export function appraiseFor(m: Match, p: Player, played: Card[], betMax: boolean, rng: Rng | null, ante: number): Appraisal {
  const cards = played.some(c => c.joker) ? resolveJokers(m, p, played, ante, jokerRoles(played, null), null) : played
  return appraise(cards, {
    levels: p.levels, display: p.display, displaySlots: displaySlots(p), deckSize: deckSize(p), bankroll: p.bankroll,
    ante, hypeMod: p.rules.hypeMod, twist: twistFor(m), betMax, rng,
  })
}

export function deckJokers(p: Player): number {
  return [...p.pile, ...p.discard, ...p.hand].filter(c => c.joker !== null).length
}

// higher appraisal wins, except lowball
export function showdownWinner(m: Match, a: number, b: number): Pos | null {
  if (a === b) return null
  const aWins = twistFor(m)?.id === 'lowball' ? a < b : a > b
  return aWins ? 0 : 1
}

// true when `ids` takes one half of a beer-stained pair in hand without the other. checked per beer card,
// both ways, so it holds even if an old save has a card stuck to two others
export function splitsStuck(hand: Card[], ids: number[]): boolean {
  for (const c of hand) {
    const ko = c.knockoff
    if (ko?.kind !== 'beer') continue
    const mate = hand.find(x => x.id === ko.stuckTo)
    if (mate && ids.includes(c.id) !== ids.includes(mate.id)) return true
  }
  return false
}

// the best 1-5 card play by estimate (no misprint rolls), then kickers dropped so they go back into the pile.
// lowball wants the smallest single card. used for bots and the timeout default
export function bestPlay(m: Match, p: Player, hand: Card[] = p.hand): { played: Card[]; est: Appraisal } {
  if (hand.length === 0) throw new Error('no hand to pick from')
  const low = twistFor(m)?.id === 'lowball'
  const { ante } = pairBlinds(m, [p.seat])
  let best: { played: Card[]; est: Appraisal } | null = null
  // the biggest play that fits the slots and keeps beer-stained pairs together. lowball wants one card, or the
  // smallest pair. a jumbo means a smaller play can be the best one, so then every size gets tried
  const sizes = low ? [1, 2] : Array.from({ length: Math.min(PLAY_SIZE, hand.length) }, (_, i) => Math.min(PLAY_SIZE, hand.length) - i)
  const jumbo = hand.some(c => c.variant === 'jumbo')
  for (const k of sizes) {
    for (const played of combos(hand, k)) {
      if (playSlots(played) > PLAY_SIZE || splitsStuck(hand, played.map(c => c.id))) continue
      const est = appraiseFor(m, p, played, false, null, ante)
      if (!best || (low ? est.total < best.est.total : est.total > best.est.total)) best = { played, est }
    }
    if (best && !jumbo) break
  }
  if (!best) throw new Error('no hand to pick from')
  const scoring = best.played.filter(c => best.est.scoringIds.includes(c.id))
  if (scoring.length > 0 && scoring.length < best.played.length && !splitsStuck(hand, scoring.map(c => c.id))) {
    const est = appraiseFor(m, p, scoring, false, null, ante)
    if (est.total >= best.est.total) return { played: scoring, est }
  }
  return best
}

export function combos<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = []
  const from = (start: number, chosen: T[]) => {
    if (chosen.length === k) {
      out.push(chosen.slice())
      return
    }
    for (let i = start; i <= items.length - (k - chosen.length); i++) {
      chosen.push(items[i])
      from(i + 1, chosen)
      chosen.pop()
    }
  }
  from(0, [])
  return out
}

function subsets<T>(items: readonly T[], min: number, max: number): T[][] {
  const out: T[][] = []
  for (let k = min; k <= Math.min(max, items.length); k++) out.push(...combos(items, k))
  return out
}

// the pair a seat is at this round, and its position in it
export function pairOf(m: Match, s: SeatId): { pair: Pair; pos: Pos } | null {
  for (const pair of m.pairs) {
    const i = pair.seats.indexOf(s)
    if (i >= 0) return { pair, pos: i as Pos }
  }
  return null
}

// ---------- validation: one predicate per action. step throws on a problem, legal() filters with the same check ----------

const ids = (xs: unknown): xs is number[] => Array.isArray(xs) && xs.every(x => Number.isInteger(x))
const unique = (xs: number[]) => new Set(xs).size === xs.length

// null = the action is legal right now. anything else is why not
export function problem(m: Match, s: SeatId, a: Action): string | null {
  if (m.phase === 'over') return 'match is over'
  const p = m.players[s]
  if (!p) return `no seat ${s}`
  if (!a || typeof a !== 'object' || typeof a.type !== 'string') return 'malformed action'

  if (m.phase === 'draft') {
    if (!p.draft) return 'already drafted'
    if (a.type === 'pickBox') return !p.starter && p.draft.offer.includes(a.box) ? null : 'that box is not on offer'
    if (a.type === 'draft') return p.starter && p.draft.rows && ids(a.rows) && validPicks(a.rows) ? null : 'pick 3 different rows after a box'
    return `${a.type} is not a draft action`
  }

  if (m.phase === 'shop') {
    if (!p.alive || p.done || !p.shop) return 'not shopping'
    const shop = p.shop
    if (a.type === 'sortPack') {
      if (!shop.open) return 'no open pack'
      const inPack = shop.open.cards.map(c => c.id)
      return ids(a.toDeck) && unique(a.toDeck) && a.toDeck.every(id => inPack.includes(id)) ? null : 'those cards are not in the pack'
    }
    if (shop.open) return 'sort the open pack first'
    if (a.type === 'useInsert') {
      if (shop.scratch === 'wishlist') {
        const card = p.binder.find(c => c.id === a.cardId)
        if (a.suit !== null || !card) return 'pick a card from your binder'
        return card.joker && deckJokers(p) >= MAX_JOKERS ? `max ${MAX_JOKERS} jokers in a deck` : null
      }
      if (shop.scratch !== 'checklist') return 'no insert waiting'
      const card = [...p.pile, ...p.discard].find(c => c.id === a.cardId)
      if (!card || card.bulk) return 'pick a card from your deck'
      return SUITS.includes(a.suit as Suit) && a.suit !== card.suit ? null : 'pick a different suit'
    }
    if (shop.scratch) return 'finish the scratcher first'
    switch (a.type) {
      case 'buy': {
        const o = Number.isInteger(a.slot) ? shop.offers[a.slot] : undefined
        if (!o || o.sold) return 'nothing to buy in that slot'
        if (o.price > 0 && p.bankroll - o.price < 1) return 'can not afford it' // keep $1 to sit at the table
        if (o.type === 'collectible' && p.display.length >= displaySlots(p)) return 'display case is full'
        if (o.type === 'sleeve' && p.sleeves.includes(o.id)) return 'already own that sleeve'
        return null
      }
      case 'sell': {
        const card = p.binder.find(c => c.id === a.cardId)
        return card ? refusesToBuy(m, card) : 'that card is not in your binder'
      }
      case 'sellCollectible': return Number.isInteger(a.slot) && p.display[a.slot] ? null : 'nothing in that slot'
      case 'restock': {
        if (m.round === 1) return 'no restocks before the first round'
        return p.bankroll - restockPrice(shop, freeRestocks(m, p)) >= 1 ? null : 'can not afford a restock'
      }
      case 'ship': {
        if (shop.shipped) return 'one shipment per shop visit'
        if (p.shipping) return 'a card is already away at grading'
        const shipper = Object.hasOwn(SHIPPERS, a.shipper) ? SHIPPERS[a.shipper] : undefined
        if (!shipper) return 'no such shipper'
        if (p.bankroll - shipper.price < 1) return 'can not afford that shipper'
        const card = [...p.pile, ...p.discard, ...p.binder].find(c => c.id === a.cardId)
        return card && canGrade(card) ? null : 'can not grade that card'
      }
      case 'binBulk': {
        if (![...p.pile, ...p.discard].some(c => c.bulk)) return 'no bulk to bin'
        return p.bankroll - bulkPrice(p) >= 1 ? null : 'can not afford to bin bulk'
      }
      case 'leaveShop': return null
      default: return `${a.type} is not a shop action`
    }
  }

  if (m.phase === 'deal') {
    if (!p.alive || p.locked) return 'already locked in'
    if (a.type === 'mulligan') {
      if (twistFor(m)?.id === 'colddeck') return 'cold deck: no mulligans'
      if (!ids(a.cardIds) || a.cardIds.length === 0 || !unique(a.cardIds) || !a.cardIds.every(id => p.hand.some(c => c.id === id))) return 'mulligan cards from your hand'
      return splitsStuck(p.hand, a.cardIds) ? 'beer-stained cards go together' : null
    }
    if (a.type === 'lock') {
      if (!ids(a.cardIds) || !unique(a.cardIds) || !a.cardIds.every(id => p.hand.some(c => c.id === id))) return 'lock cards from your hand'
      if (a.cardIds.length < 1 || playSlots(p.hand.filter(c => a.cardIds.includes(c.id))) > PLAY_SIZE) return `lock 1 to ${PLAY_SIZE} play slots (a jumbo takes 2)`
      return splitsStuck(p.hand, a.cardIds) ? 'beer-stained cards go together' : null
    }
    return `${a.type} is not a deal action`
  }

  if (m.phase === 'bet') {
    if (a.type !== 'bet') return `${a.type} is not a bet action`
    const at = pairOf(m, s)
    if (!at || !at.pair.betting || at.pair.betting.outcome) return 'not betting'
    if (at.pair.betting.toAct !== at.pos) return 'not your turn'
    return legalActions(at.pair.betting).includes(a.choice) ? null : `can not ${a.choice} right now`
  }

  if (m.phase === 'forgePick') {
    if (a.type !== 'forgeKeep') return `${a.type} is not a forge action`
    if (!p.forge || p.forge.keep) return 'no forge waiting on you'
    const plan = forgePlan(lockedCards(p))
    if (!plan) throw new Error(`seat ${s} forged a hand that can not forge`)
    if (!Array.isArray(a.traits) || a.traits.length !== plan.tier) return `keep exactly ${plan.tier} traits`
    const offered = plan.candidates.map(t => JSON.stringify(t))
    const keys = a.traits.map(t => JSON.stringify(t))
    return new Set(keys).size === keys.length && keys.every(k => offered.includes(k)) ? null : 'keep traits the forge offered'
  }
  return `unknown phase ${m.phase}`
}

// every legal action for a seat right now. the ui greys buttons from it, bots and the fuzz test pick from it
export function legal(m: Match, s: SeatId): Action[] {
  const p = m.players[s]
  if (!p || m.phase === 'over') return []
  const out: Action[] = []
  if (m.phase === 'draft' && p.draft) {
    for (const box of p.draft.offer) out.push({ type: 'pickBox', box })
    if (p.draft.rows) for (const rows of combos([0, 1, 2, 3], 3)) out.push({ type: 'draft', rows })
  } else if (m.phase === 'shop' && p.shop) {
    if (p.shop.open) for (const toDeck of subsets(p.shop.open.cards.map(c => c.id), 0, 99)) out.push({ type: 'sortPack', toDeck })
    for (const c of p.binder) out.push({ type: 'useInsert', cardId: c.id, suit: null })
    for (const c of [...p.pile, ...p.discard]) for (const suit of SUITS) out.push({ type: 'useInsert', cardId: c.id, suit })
    p.shop.offers.forEach((_, slot) => out.push({ type: 'buy', slot }))
    for (const c of p.binder) out.push({ type: 'sell', cardId: c.id })
    p.display.forEach((_, slot) => out.push({ type: 'sellCollectible', slot }))
    for (const c of [...p.pile, ...p.discard, ...p.binder]) {
      for (const shipper of Object.keys(SHIPPERS) as Shipper[]) out.push({ type: 'ship', cardId: c.id, shipper })
    }
    out.push({ type: 'restock' }, { type: 'binBulk' }, { type: 'leaveShop' })
  } else if (m.phase === 'deal') {
    const hand = p.hand.map(c => c.id)
    for (const cardIds of subsets(hand, 1, 99)) out.push({ type: 'mulligan', cardIds })
    for (const cardIds of subsets(hand, 1, PLAY_SIZE)) out.push({ type: 'lock', cardIds })
  } else if (m.phase === 'bet') {
    for (const choice of ['fold', 'forge', 'min', 'max', 'match'] as const) out.push({ type: 'bet', choice })
  } else if (m.phase === 'forgePick' && p.forge && !p.forge.keep) {
    const plan = forgePlan(lockedCards(p))
    if (plan) for (const traits of combos(plan.candidates, plan.tier)) out.push({ type: 'forgeKeep', traits })
  }
  return out.filter(a => problem(m, s, a) === null)
}

// ---------- step ----------

export function step(match: Match, s: SeatId, action: Action): StepResult {
  // work on a copy, so a throw halfway through can't leave a live match half-changed
  return stepInPlace(JSON.parse(JSON.stringify(match)), s, action)
}

// step without the copy: mutates `m`. only for the headless sim, where a throw ends the run anyway.
// the server and the ui always use step()
export function stepInPlace(m: Match, s: SeatId, action: Action): StepResult {
  if (m.engineVersion !== ENGINE_VERSION) throw new Error(`match is engine ${m.engineVersion}, this is ${ENGINE_VERSION}`)
  const why = problem(m, s, action)
  if (why) throw new Error(`seat ${s} ${action?.type ?? 'action'}: ${why}`)
  const emit: Emit = []
  apply(m, s, action, emit)
  m.n++
  advance(m, emit)
  check(m)
  return { match: m, events: emit }
}

function apply(m: Match, s: SeatId, a: Action, emit: Emit): void {
  const p = seat(m, s)
  switch (a.type) {
    case 'pickBox': {
      p.starter = a.box
      p.rules = rulesFor(a.box)
      p.mem.packDiscount = p.rules.packDiscount
      p.draft!.rows = draftRows(`${m.config.seed}:${s}`, a.box, m)
      return
    }
    case 'draft': {
      p.pile = draftDeck(p.draft!.rows!, a.rows) // the dropped row is gone
      p.draft = null
      p.bankroll = p.rules.startBankroll
      p.display = [...p.rules.startDisplay]
      if (p.difficulty) {
        const d = DIFFICULTIES[p.difficulty]
        p.bankroll += d.bankroll
        if (d.rare) {
          const rng = makeRng(`${m.config.seed}:${s}:rare`)
          const def = pick(rng, COLLECTIBLES.filter(c => c.rarity === 'rare' && !hasCollectible(p.display, c.id)))
          if (p.display.length >= displaySlots(p)) throw new Error('case full before the run started')
          p.display.push({ id: def.id, param: rollParam(def, rng) })
        }
      }
      p.done = true
      return
    }
    case 'buy': {
      const shop = p.shop!
      const o = shop.offers[a.slot]
      p.bankroll -= o.price
      o.sold = true
      if (o.type === 'collectible') p.display.push(o.owned)
      else if (o.type === 'sleeve') p.sleeves.push(o.id)
      else if (o.type === 'scratcher') scratch(m, p, emit)
      else {
        shop.open = openPack(m, o.kind, p.rng.shop, m.round, p.mem, p.display)
        emit.push({ to: s, event: { kind: 'packOpened', contents: shop.open } })
      }
      return
    }
    case 'sortPack': {
      const open = p.shop!.open!
      // max 2 jokers in a deck: any past that go to the binder
      let jokers = deckJokers(p)
      for (const c of open.cards) {
        const room = c.joker === null || jokers < MAX_JOKERS
        if (a.toDeck.includes(c.id) && room) {
          if (c.joker) jokers++
          shuffleIn(p, c, p.rng.pile)
        } else p.binder.push(c)
      }
      if (open.codeCard) p.levels[open.codeCard]++
      if (open.collectible) {
        if (p.display.length < displaySlots(p)) p.display.push(open.collectible)
        else p.bankroll += Math.floor(COLLECTIBLE_PRICE[getDef(open.collectible.id).rarity] / 2)
      }
      p.shop!.open = null
      return
    }
    case 'useInsert': {
      if (p.shop!.scratch === 'wishlist') {
        const i = p.binder.findIndex(c => c.id === a.cardId)
        shuffleIn(p, p.binder.splice(i, 1)[0], p.rng.pile)
      } else {
        ;[...p.pile, ...p.discard].find(c => c.id === a.cardId)!.suit = a.suit!
      }
      p.shop!.scratch = null
      return
    }
    case 'sell': {
      const i = p.binder.findIndex(c => c.id === a.cardId)
      p.bankroll += binderPrice(m, p, p.binder[i])
      p.binder.splice(i, 1)
      return
    }
    case 'sellCollectible': {
      p.bankroll += Math.floor(COLLECTIBLE_PRICE[getDef(p.display[a.slot].id).rarity] / 2)
      p.display.splice(a.slot, 1)
      return
    }
    case 'restock': {
      const shop = p.shop!
      p.bankroll -= restockPrice(shop, freeRestocks(m, p))
      const fresh = restock(shop, p.rng.shop, p.mem, p.display, keeperPriceAdj(m))
      p.shop = { ...fresh, shipped: shop.shipped, open: null, scratch: null }
      return
    }
    case 'ship': {
      // 1d10 + freshness (at the time it ships), cap 10. rolled now, revealed when it's back next shop
      const shipper = SHIPPERS[a.shipper]
      const from = [p.pile, p.discard, p.binder].find(cards => cards.some(c => c.id === a.cardId))!
      const card = from.splice(from.findIndex(c => c.id === a.cardId), 1)[0]
      let grade = 0
      for (let i = 0; i < shipper.rolls; i++) grade = Math.max(grade, Math.min(10, randInt(p.rng.shop, 1, 10) + freshness(card, m.round)))
      if (shipper.safe || p.sleeves.includes('archival')) grade = Math.max(4, grade)
      p.bankroll -= shipper.price
      p.shipping = { card, grade, to: from === p.binder ? 'binder' : 'deck', shipper: a.shipper, round: m.round }
      p.shop!.shipped = true
      return
    }
    case 'binBulk': {
      const price = bulkPrice(p)
      for (const from of [p.pile, p.discard]) {
        const i = from.findIndex(c => c.bulk)
        if (i >= 0) {
          from.splice(i, 1)
          break
        }
      }
      p.bankroll -= price
      p.bulkBinned++
      return
    }
    case 'leaveShop': {
      p.done = true
      return
    }
    case 'mulligan': {
      const free = freeMulligan(p)
      if (free) p.freeMullsUsed++
      else p.mulls++
      p.roundMulls++
      mulliganHand(p, a.cardIds, p.rng.pile, free)
      // tossed your last card with nothing to redraw: same as being dealt nothing, you lose the round
      if (p.hand.length === 0) {
        p.locked = []
        p.done = true
      }
      return
    }
    case 'lock': {
      p.locked = a.cardIds.slice()
      p.done = true
      return
    }
    case 'bet': {
      const at = pairOf(m, s)!
      at.pair.betting = act(at.pair.betting!, a.choice)
      return
    }
    case 'forgeKeep': {
      p.forge!.keep = a.traits
      return
    }
  }
}

// ---------- phase transitions ----------

// keeps moving the match forward while the current phase has nobody left to act
function advance(m: Match, emit: Emit): void {
  for (;;) {
    if (m.phase === 'over' || pending(m).length > 0) return
    if (m.phase === 'draft') enterShop(m, emit)
    else if (m.phase === 'shop') enterDeal(m)
    else if (m.phase === 'deal') enterBet(m)
    else if (m.phase === 'bet') enterForgePick(m)
    else if (m.phase === 'forgePick') settleRound(m, emit)
  }
}

// buying a scratcher: roll the insert and do it now. wishlist with an empty binder (or checklist with no deck
// cards to change) falls back to code, so a scratcher never comes up blank
function scratch(m: Match, p: Player, emit: Emit): void {
  let insert = rollInsert(p.rng.shop)
  if (insert === 'wishlist' && wishable(p).length === 0) insert = 'code'
  if (insert === 'checklist' && ![...p.pile, ...p.discard].some(c => !c.bulk)) insert = 'code'
  let hand: HandType | null = null
  let collectible: Owned | null = null
  let joker: Card | null = null
  if (insert === 'grail' && chance(p.rng.shop, 0.5)) {
    joker = newCard(m, randInt(p.rng.shop, 2, 14), pick(p.rng.shop, SUITS), { joker: pick(p.rng.shop, REAL_JOKERS), pulledRound: m.round })
    if (deckJokers(p) < MAX_JOKERS) shuffleIn(p, joker, p.rng.pile)
    else p.binder.push(joker)
  } else if (insert === 'code') {
    hand = pick(p.rng.shop, HAND_TYPES)
    p.levels[hand]++
  } else if (insert === 'grail') {
    const grail = drawCollectible(p.rng.shop, p.mem, p.display, [], 'rare')
    collectible = grail
    if (p.display.length < displaySlots(p)) p.display.push(grail)
    else p.bankroll += Math.floor(COLLECTIBLE_PRICE.rare / 2)
  } else {
    p.shop!.scratch = insert
  }
  emit.push({ to: p.seat, event: { kind: 'scratched', insert, hand, collectible, joker } })
}

// binder cards a wishlist can move into the deck: anything but a joker past the cap
export function wishable(p: Player): Card[] {
  return p.binder.filter(c => !c.joker || deckJokers(p) < MAX_JOKERS)
}

function enterShop(m: Match, emit: Emit): void {
  m.phase = 'shop'
  for (const p of m.players) {
    p.done = !p.alive
    p.rng = seatRngs(m.config.seed, m.round, p.seat)
    if (!p.alive) {
      p.shop = null
      continue
    }
    if (m.round > 1) for (const c of [...p.pile, ...p.discard]) if (c.variant === 'rookie') c.grind++
    // back from grading, to wherever it came from
    if (p.shipping && p.shipping.round < m.round) {
      const { card, grade, to } = p.shipping
      card.grade = grade
      if (to === 'binder') p.binder.push(card)
      else shuffleIn(p, card, p.rng.pile)
      p.shipping = null
      emit.push({ to: p.seat, event: { kind: 'graded', card } })
    }
    // round 1 has no shop, just the free pack. the shop right before a boss also offers this table's sleeve
    const shop: Shop = m.round === 1
      ? { offers: [{ type: 'pack', kind: 'free', price: 0, sold: false }], restocks: 0 }
      : newShop(p.rng.shop, p.mem, p.display, isTournament(m.round) ? sleeveOffer(m.config.seed, m.round, p.sleeves) : null, keeperPriceAdj(m))
    p.shop = { ...shop, shipped: false, open: null, scratch: null }
  }
}

function enterDeal(m: Match): void {
  m.phase = 'deal'
  for (const p of m.players) {
    p.shop = null
    p.locked = null
    p.forge = null
    p.peek = null
    p.showdown = null
    p.roundMulls = 0
    p.done = !p.alive
    if (!p.alive) continue
    if (isTableStart(m.round)) {
      startTable(p, p.rng.pile)
      p.mulls = 0
      p.freeMullsUsed = 0
      p.tableWins = 0
    }
    dealFresh(p, handSize(p))
    // an empty hand can't lock anything: it loses the round at the bet
    if (p.hand.length === 0) {
      p.locked = []
      p.done = true
    }
  }
  // pairs: a duel is one fixed pair. battle royale shuffles the living seats, an odd one out gets a bye
  const alive = m.players.filter(p => p.alive).map(p => p.seat)
  const order = m.config.mode === 'br' ? shuffled(makeRng(`${m.config.seed}:${m.round}:pairs`), alive) : alive
  m.pairs = []
  for (let i = 0; i + 1 < order.length; i += 2) m.pairs.push({ seats: [order[i], order[i + 1]], betting: null })
}

function enterBet(m: Match): void {
  m.phase = 'bet'
  for (const pair of m.pairs) {
    const ps = pair.seats.map(s => seat(m, s)) as [Player, Player]
    const bankrolls: [number, number] = [ps[0].bankroll, ps[1].bankroll]
    const { ante, max } = pairBlinds(m, pair.seats)
    const forgeable = ps.map(p => p.locked!.length > 0 && forgePlan(lockedCards(p)) !== null) as [boolean, boolean]
    let b = startBetting(firstToAct(bankrolls, m.round), ante, max, bankrolls, forgeable, isForced(m.round))
    const empty = ps.map(p => p.locked!.length === 0)
    if (empty[0] || empty[1]) b = forfeit(b, empty[0] && empty[1] ? null : empty[0] ? 0 : 1)
    pair.betting = b
    // the underdog peeks at one of the other seat's locked cards
    for (const pos of [0, 1] as Pos[]) {
      const them = ps[1 - pos]
      if (isUnderdog(pos, bankrolls) && them.locked!.length > 0) ps[pos].peek = pick(ps[pos].rng.table, them.locked!)
    }
  }
}

// a forge that offers more traits than its tier holds waits for the forger to pick
function enterForgePick(m: Match): void {
  m.phase = 'forgePick'
  for (const pair of m.pairs) {
    const o = pair.betting!.outcome!
    if (o.kind !== 'forge') continue
    const p = seat(m, pair.seats[o.by])
    const plan = forgePlan(lockedCards(p))
    if (!plan) throw new Error(`seat ${p.seat} forged a hand that can not forge`)
    p.forge = { keep: plan.candidates.length > plan.tier ? null : plan.candidates }
  }
}

type SeatResult = RoundResultView & { delta: number }

function settleRound(m: Match, emit: Emit): void {
  const results = new Map<SeatId, SeatResult>() // local to this call, never stored
  for (const pair of m.pairs) settlePair(m, pair, results, emit)
  // byes: nothing played, the hand goes back into the pile
  for (const p of m.players) {
    if (!p.alive || results.has(p.seat)) continue
    cleanup(p, [], new Set(), false, p.rng.pile)
    p.locked = null
    results.set(p.seat, emptyResult(m, 'bye'))
  }

  // bust check comes before income: $0 after the table is out
  const lastStanding = m.players.filter(p => p.alive && p.bankroll > 0).length
  for (const p of m.players) {
    if (!p.alive || p.bankroll > 0) continue
    p.alive = false
    p.bustRound = m.round
    emit.push({ to: 'all', event: { kind: 'busted', seat: p.seat } })
  }
  const soloOver = lastRound(m) !== null && (lastStanding < m.players.length || m.round >= lastRound(m)!)
  const over = soloOver || lastStanding <= 1

  for (const p of m.players) {
    const r = results.get(p.seat)
    if (!r) continue
    if (p.alive) payIncome(m, p, r)
    const { delta: _, ...view } = r
    p.last = view
    emit.push({ to: p.seat, event: { kind: 'roundEnd', result: view } })
  }

  if (over) {
    m.phase = 'over'
    m.pairs = []
    m.result = scoreMatch(m)
    emit.push({ to: 'all', event: { kind: 'matchOver', result: m.result } })
    return
  }
  m.round++
  enterShop(m, emit)
}

function emptyResult(m: Match, outcome: RoundResultView['outcome']): SeatResult {
  return { round: m.round, outcome, tally: { pot: 0, house: 0, interest: 0, extras: 0 }, forged: null, bulk: 0, ground: null, torn: [], stolen: null, robbed: null, delta: 0 }
}

function settlePair(m: Match, pair: Pair, results: Map<SeatId, SeatResult>, emit: Emit): void {
  const b = pair.betting!
  const o = b.outcome!
  const ps = pair.seats.map(s => seat(m, s)) as [Player, Player]
  const played = ps.map(lockedCards) as [Card[], Card[]]
  const { ante } = pairBlinds(m, pair.seats)

  let winner: Pos | null = null
  let scoring: [number[], number[]] = [[], []]
  const roles = ([0, 1] as Pos[]).map(pos => jokerRoles(played[pos], ps[pos].rng.table)) as [JokerRoles, JokerRoles]
  const plays = (pos: Pos, joker: JokerId) => [...roles[pos].values()].includes(joker)
  if (o.kind === 'showdown' && played[0].length > 0 && played[1].length > 0) {
    const betMax = (pos: Pos) => b.maxStake > b.minStake && b.committed[pos] === b.maxStake
    const shown = ([0, 1] as Pos[]).map(pos => resolveJokers(m, ps[pos], played[pos], ante, roles[pos], played[1 - pos])) as [Card[], Card[]]
    const ap = ([0, 1] as Pos[]).map(pos => appraiseFor(m, ps[pos], shown[pos], betMax(pos), ps[pos].rng.table, ante)) as [Appraisal, Appraisal]
    winner = showdownWinner(m, ap[0].total, ap[1].total)
    scoring = [ap[0].scoringIds, ap[1].scoringIds]
    for (const pos of [0, 1] as Pos[]) {
      const sd: ShowdownView = {
        opponent: pair.seats[1 - pos], mine: ap[pos], theirs: ap[1 - pos], myCards: shown[pos], theirCards: shown[1 - pos],
        winner: winner === null ? null : pair.seats[winner],
      }
      ps[pos].showdown = sd
      emit.push({ to: pair.seats[pos], event: { kind: 'showdown', showdown: sd } })
    }
  }

  const delta = settle(b, winner)
  // double down: the house matches the pot, so the winner takes it twice
  if (o.kind === 'showdown' && winner !== null && twistFor(m)?.id === 'doubledown') delta[winner] += b.committed[winner]
  // double or nothing (either side played it): the loser pays the stake again, as far as their bankroll goes
  if (o.kind === 'showdown' && winner !== null && (plays(0, 'double') || plays(1, 'double'))) {
    const loser = (1 - winner) as Pos
    const extra = Math.min(b.committed[winner], ps[loser].bankroll + delta[loser])
    delta[winner] += extra
    delta[loser] -= extra
  }

  for (const pos of [0, 1] as Pos[]) {
    const p = ps[pos]
    const outcome: RoundResultView['outcome'] = o.kind === 'showdown'
      ? (winner === null ? 'tie' : winner === pos ? 'win' : 'loss')
      : o.by === pos ? o.kind : 'win'
    // gold border: a side bet on every gold card you played, settles on a showdown win or loss
    const gold = o.kind === 'showdown' && winner !== null ? (winner === pos ? 1 : -1) * GOLD_BORDER * played[pos].filter(c => c.stamp === 'gold').length : 0
    // bluff: you went max and they folded. the house pays it, so it rides in extras
    const bluff = o.kind === 'fold' && o.by !== pos && plays(pos, 'bluff') && b.log.some(l => l.pos === pos && l.action === 'max') ? 5 : 0
    const r = playOut(m, p, o.kind === 'showdown', outcome, played[pos], scoring[pos], plays(pos, 'catalyst'))
    r.tally.pot = delta[pos]
    r.tally.extras = gold + bluff
    r.delta = delta[pos] + gold + bluff
    p.bankroll = Math.max(0, p.bankroll + delta[pos] + gold + bluff)
    // momentum only counts the normal rounds of a table
    if (outcome === 'win' && o.kind === 'showdown' && !isForced(m.round)) p.tableWins++
    results.set(p.seat, r)
  }
  // sticky fingers: the showdown winner takes a random card out of the loser's pile or discard
  if (o.kind === 'showdown' && winner !== null && plays(winner, 'sticky')) {
    const thief = ps[winner]
    const mark = ps[1 - winner]
    const pool = [...mark.pile, ...mark.discard]
    if (pool.length > 0) {
      const card = pick(thief.rng.table, pool)
      for (const from of [mark.pile, mark.discard]) if (from.includes(card)) from.splice(from.indexOf(card), 1)
      shuffleIn(thief, card, thief.rng.pile)
      results.get(thief.seat)!.stolen = card
      results.get(mark.seat)!.robbed = card
    }
  }
}

// forge, card growth and cleanup for one seat
function playOut(m: Match, p: Player, showdown: boolean, outcome: RoundResultView['outcome'], played: Card[], scoringIds: number[], catalyst: boolean): SeatResult {
  const r = emptyResult(m, outcome)
  const gone = new Set<number>() // forged away or torn, these leave the deck for good
  if (outcome === 'fold' && played.length > 0) r.ground = grindOnFold(played)
  let made: Card[] = []
  if (outcome === 'forge') {
    const plan = forgePlan(played)
    if (!plan || !p.forge?.keep) throw new Error(`seat ${p.seat} forge has no plan or traits`)
    for (const c of plan.merged) gone.add(c.id)
    const { forged, bulk } = buildForged(plan, p.forge.keep, m.round, m)
    if (catalyst) forged.tier = Math.min(MAX_TIER, forged.tier + 1)
    r.forged = forged
    r.bulk = bulk.length
    made = [forged, ...bulk]
  }
  // cards only grow or tear if they actually got appraised
  if (showdown) {
    for (const card of played) {
      if (!scoringIds.includes(card.id) || card.bulk) continue
      if (card.stamp === 'first') card.bonusHype++
      if (card.stamp === 'damaged' && !p.sleeves.includes('archival') && chance(p.rng.table, 0.25)) {
        r.torn.push(card)
        gone.add(card.id)
      }
    }
  }
  // fold and forge muck the whole hand, otherwise the unplayed cards go back into the pile
  cleanup(p, played, gone, outcome === 'fold' || outcome === 'forge', p.rng.pile)
  p.locked = null
  for (const c of made) shuffleIn(p, c, p.rng.pile)
  return r
}

// the house bonus at the boss: 2× ante + 1× per showdown won earlier this table (momentum), max +2
export function houseMult(m: Match, p: Player): number {
  return isTournament(m.round) ? HOUSE_BONUS + Math.min(MOMENTUM_MAX, p.tableWins) : HOUSE_BONUS
}

// house: +$2 for showing down, plus the bonus for winning it. interest on top. price sticker goes in extras
function payIncome(m: Match, p: Player, r: SeatResult): void {
  const showdown = r.outcome === 'win' || r.outcome === 'loss' || r.outcome === 'tie'
  const at = pairOf(m, p.seat)
  const sawShowdown = showdown && at?.pair.betting?.outcome?.kind === 'showdown'
  const ante = at ? pairBlinds(m, at.pair.seats).ante : 0
  r.tally.house = (sawShowdown ? PAYCHECK : 0) + (sawShowdown && r.outcome === 'win' ? houseMult(m, p) * ante : 0)
  r.tally.interest = interest(p.bankroll, p.sleeves.includes('deep_pockets') ? 4 : 2)
  const sticker = r.outcome === 'win' && hasCollectible(p.display, 'price_sticker') ? 1 : 0
  r.tally.extras += sticker
  p.bankroll += r.tally.house + r.tally.interest + sticker
}

// solo/daily: bust the rival or have the chip lead after round 12. score = margin × difficulty, plus a bust bonus
// worth the house bonus of every round you skipped, so ending it early never scores worse than stalling.
// duel/br: last bankroll standing, placement by bust order
function scoreMatch(m: Match): MatchResult {
  const order = m.players.slice().sort((a, b) =>
    Number(b.alive) - Number(a.alive) || b.bankroll - a.bankroll || (b.bustRound ?? 0) - (a.bustRound ?? 0) || a.seat - b.seat)
  const placement = order.map(p => p.seat)
  const scores = new Array<number>(m.players.length).fill(0)
  if (lastRound(m) !== null) {
    const [you, rival] = m.players
    const margin = you.bankroll - rival.bankroll
    const winner: SeatId | null = margin === 0 ? null : margin > 0 ? 0 : 1
    if (winner === 0) {
      let bonus = 0
      if (!rival.alive) for (let r = rival.bustRound! + 1; r <= ROUNDS; r++) bonus += HOUSE_BONUS * blinds(r).ante
      scores[0] = Math.round((margin + bonus) * DIFFICULTIES[rival.difficulty ?? 'medium'].scoreMult)
    }
    return { placement, scores, winner }
  }
  placement.forEach((s, i) => (scores[s] = m.players.length - 1 - i))
  const alive = m.players.filter(p => p.alive)
  return { placement, scores, winner: alive.length === 1 ? alive[0].seat : null }
}

// ---------- queries ----------

// who owes an action right now
export function pending(m: Match): SeatId[] {
  if (m.phase === 'over') return []
  if (m.phase === 'bet') {
    return m.pairs.filter(pr => pr.betting && !pr.betting.outcome).map(pr => pr.seats[pr.betting!.toAct])
  }
  if (m.phase === 'forgePick') return m.players.filter(p => p.forge && !p.forge.keep).map(p => p.seat)
  if (m.phase === 'deal') return m.players.filter(p => p.alive && !p.locked).map(p => p.seat)
  return m.players.filter(p => !p.done).map(p => p.seat)
}

export function result(m: Match): MatchResult | null {
  return m.result
}

// what a timeout does (the Timers table in DESIGN.md)
export function defaultAction(m: Match, s: SeatId): Action {
  const p = seat(m, s)
  if (!pending(m).includes(s)) throw new Error(`seat ${s} owes no action`)
  switch (m.phase) {
    case 'draft':
      return !p.starter ? { type: 'pickBox', box: p.draft!.offer[0] } : { type: 'draft', rows: autoDraft(p.draft!.rows!) }
    case 'shop':
      if (p.shop?.open) return { type: 'sortPack', toDeck: p.shop.open.cards.filter(defaultToDeck).map(c => c.id) }
      if (p.shop?.scratch === 'wishlist') return { type: 'useInsert', cardId: wishable(p)[0].id, suit: null }
      if (p.shop?.scratch === 'checklist') {
        const card = [...p.pile, ...p.discard].find(c => !c.bulk)!
        return { type: 'useInsert', cardId: card.id, suit: SUITS.find(x => x !== card.suit)! }
      }
      return { type: 'leaveShop' }
    case 'deal':
      return { type: 'lock', cardIds: bestPlay(m, p).played.map(c => c.id) }
    case 'bet': {
      const b = pairOf(m, s)!.pair.betting!
      const legalNow = legalActions(b)
      return { type: 'bet', choice: legalNow.includes('min') ? 'min' : legalNow.includes('match') ? 'match' : 'max' }
    }
    case 'forgePick':
      return { type: 'forgeKeep', traits: autoKeep(forgePlan(lockedCards(p))!) }
  }
  throw new Error(`no default in phase ${m.phase}`)
}

// replay = fold step over the log. used for recovery, audits and the determinism test
export function replay(config: MatchConfig, log: LogEntry[], engineVersion = ENGINE_VERSION): Match {
  if (engineVersion !== ENGINE_VERSION) throw new Error(`log is engine ${engineVersion}, this is ${ENGINE_VERSION}`)
  let m = newMatch(config)
  for (const e of log) m = step(m, e.seat, e.action).match
  return m
}

// ---------- invariants, checked after every step ----------

export function check(m: Match): void {
  const seen = new Set<number>()
  const place = (c: Card, where: string) => {
    if (!Number.isInteger(c.id) || c.id < 1 || c.id >= m.nextCardId) throw new Error(`card id ${c.id} out of range (${where})`)
    if (seen.has(c.id)) throw new Error(`card ${c.id} is in two places (${where})`)
    seen.add(c.id)
  }
  for (const p of m.players) {
    for (const c of p.hand) place(c, `seat ${p.seat} hand`)
    for (const c of p.pile) place(c, `seat ${p.seat} pile`)
    for (const c of p.discard) place(c, `seat ${p.seat} discard`)
    for (const c of p.binder) place(c, `seat ${p.seat} binder`)
    if (p.shipping) place(p.shipping.card, `seat ${p.seat} shipping`)
    for (const c of p.shop?.open?.cards ?? []) place(c, `seat ${p.seat} open pack`)
    for (const row of p.draft?.rows ?? []) for (const c of row.cards) place(c, `seat ${p.seat} draft`)
    if (!Number.isInteger(p.bankroll) || p.bankroll < 0) throw new Error(`seat ${p.seat} bankroll ${p.bankroll}`)
    if (!p.alive && p.bankroll !== 0) throw new Error(`busted seat ${p.seat} still has $${p.bankroll}`)
    for (const id of p.locked ?? []) if (!p.hand.some(c => c.id === id)) throw new Error(`seat ${p.seat} locked ${id} outside its hand`)
    if (p.hand.length > 0 && m.phase !== 'deal' && m.phase !== 'bet' && m.phase !== 'forgePick') throw new Error(`seat ${p.seat} holds cards in ${m.phase}`)
  }
  if (m.phase !== 'over' && pending(m).length === 0) throw new Error(`nobody owes an action in ${m.phase}`)
  if (m.phase === 'bet' && m.pairs.some(pr => !pr.betting)) throw new Error('a pair is betting without a betting state')
}

// ---------- the view: the only thing that leaves the server ----------

const sortCards = (cards: Card[]) => pileView(cards).cards

export function view(m: Match, s: SeatId): SeatView {
  const p = seat(m, s)
  const at = pairOf(m, s)
  const b = at?.pair.betting ?? null
  let bet: BetView | null = null
  if (at && b && (m.phase === 'bet' || m.phase === 'forgePick')) {
    const pos = at.pos
    const them = seat(m, at.pair.seats[1 - pos])
    const bankrolls = at.pair.seats.map(x => seat(m, x).bankroll) as [number, number]
    bet = {
      opponent: them.seat,
      first: at.pair.seats[b.first],
      toAct: b.outcome ? null : at.pair.seats[b.toAct],
      minStake: b.minStake,
      maxStake: b.maxStake,
      committed: [b.committed[pos], b.committed[1 - pos]],
      choices: b.log.map(l => ({ seat: at.pair.seats[l.pos], choice: l.action })),
      forgePrice: b.forgePrice[pos],
      underdog: isUnderdog(pos, bankrolls),
      forced: b.forced,
      peek: p.peek !== null ? them.hand.find(c => c.id === p.peek) ?? null : null,
      options: m.phase === 'bet' ? legal(m, s).flatMap(a => (a.type === 'bet' ? [a.choice] : [])) : [],
    }
  }
  const blindsNow = at ? pairBlinds(m, at.pair.seats) : pairBlinds(m, [s])
  const nextR = TOURNAMENT_ROUNDS.find(r => r >= m.round)
  const shop = p.shop
  const plan = p.forge && !p.forge.keep ? forgePlan(lockedCards(p)) : null
  return {
    engineVersion: m.engineVersion,
    mode: m.config.mode,
    round: m.round,
    lastRound: lastRound(m),
    phase: m.phase,
    blinds: blindsNow,
    twist: twistFor(m),
    nextTwist: nextR !== undefined ? { round: nextR, twist: twistFor(m, nextR)! } : null,
    stonks: stonks(m),
    stonksNext: m.keeper.includes('chatty') ? stonksFor(m.config.seed, m.round + 1) : null,
    keeper: m.keeper,
    me: {
      seat: s,
      name: p.name,
      bankroll: p.bankroll,
      alive: p.alive,
      hand: p.hand,
      locked: p.locked ? lockedCards(p) : null,
      handSize: handSize(p),
      mulligans: p.mulls + p.freeMullsUsed,
      freeMulligan: freeMulligan(p),
      pile: sortCards(p.pile),
      discard: sortCards(p.discard),
      binder: p.binder,
      shipping: p.shipping ? { card: p.shipping.card, shipper: p.shipping.shipper, back: p.shipping.round + 1 } : null,
      display: p.display,
      displaySlots: displaySlots(p),
      sleeves: p.sleeves,
      levels: p.levels,
      starter: p.starter,
      draft: p.draft,
      shop: shop ? {
        offers: shop.offers,
        restockPrice: restockPrice(shop, freeRestocks(m, p)),
        bulkPrice: bulkPrice(p),
        bulkInDeck: [...p.pile, ...p.discard].filter(c => c.bulk).length,
        shipped: shop.shipped,
        open: shop.open,
        scratch: shop.scratch,
      } : null,
      forge: plan,
      done: !pending(m).includes(s),
    },
    others: m.players.filter(o => o.seat !== s).map(o => ({
      seat: o.seat,
      name: o.name,
      kind: o.kind,
      bankroll: o.bankroll,
      alive: o.alive,
      handSize: o.hand.length,
      // marked knockoffs are face up once they're locked in
      marked: o.locked ? lockedCards(o).filter(c => c.knockoff?.kind === 'marked') : [],
      mulligans: o.mulls + o.freeMullsUsed,
      deckSize: deckSize(o),
      display: o.display,
      sleeves: o.sleeves,
      done: !pending(m).includes(o.seat),
    })),
    bet,
    showdown: p.showdown,
    last: p.last,
    result: m.result,
  }
}

// the bot policy lives in bot.ts. re-exported so the server only needs this module
export { botAction } from './bot.ts'
