// the game as a phase state machine. a match is config + an action log: step() is the only way state changes,
// view() is the only thing that leaves the server. see docs/architecture.md section 2 and docs/V2.md
import { MAX_JOKERS, MAX_TIER, REAL_JOKERS, SUITS, newCard, playSlots, sellPrice, type Card, type JokerId, type Suit, type Trait } from './cards.ts'
import { appraise, emptyLevels, type Appraisal } from './scoring.ts'
import { act, firstToAct, legalActions, openStage, other, settle, startBetting, type BetAction, type BetStage, type Betting, type Pos } from './betting.ts'
import { getDef, hasCollectible, type Owned } from './collectibles.ts'
import { HAND_TYPES, type HandType } from './hands.ts'
import { autoKeep, buildForged, forgePlan, grindCard, type ForgePlan } from './forge.ts'
import {
  INSERTS, drawCollectible, keeperFor, newShop, openPack, rollInsert, restock, restockPrice, spoilsCard,
  type Insert, type KeeperId, type PackContents, type Shop, type ShopKind, type ShopMemory, type ShopOffer, type SleeveCard,
} from './shop.ts'
import { DEFAULT_RULES, autoDraft, draftDeck, draftRows, rulesFor, starterOffer, validPicks, type DraftRow, type Rules, type StarterId } from './starters.ts'
import { isTournament, rollTwists, type Twist } from './twists.ts'
import { sleeveOffer, stonksFor, stonksMult, type SleeveId, type Stonks } from './sleeves.ts'
import { cleanup, deckSize, draw, pileView, refill, removeFromHand, shuffleDeck, shuffleIn, toDiscard, type Piles } from './deck.ts'
import { buildRival, getRival, rivalOrder, type RivalId } from './rivals.ts'
import {
  BULK_BIN_PRICE, COLLECTIBLE_PRICE, GOLD_BORDER, HAND_SIZE, HANDS_PER_ROUND, HOUSE_BONUS, HOUSE_FLAT, KO_BONUS, MOMENTUM_MAX, PLAY_SIZE,
  RIVAL_STACKS, ROUNDS, ROUNDS_PER_TABLE, SHIPPERS, SKIP_BONUS, SLEEVE_SLOTS, SPOILS_CARDS, SPOILS_SKIP, TOURNAMENT_ROUNDS, WINS_NEEDED,
  blinds, interest, isTableStart, knockoutAt, markerFor, tableOf, type Shipper,
} from './economy.ts'
import { chance, makeRng, pick, randInt, shuffled, type Rng } from './rng.ts'

// bump on any rule or rng change. a log only replays on its own version
export const ENGINE_VERSION = '2.0.1'

// ---------- types the server and ui build against ----------

export type SeatId = number // 0..n-1
export type Mode = 'solo' | 'daily' | 'duel' | 'br'
export type Difficulty = 'easy' | 'medium' | 'hard'

// style = bot style override (the sim's greedy/cautious/random/nobuy policies). bots default to their difficulty's style
export type SeatConfig = { kind: 'human' | 'bot'; name: string; difficulty?: Difficulty; style?: string }
export type MatchConfig = { mode: Mode; seed: string; seats: SeatConfig[] } // 2 seats for solo/daily/duel, up to 10 for br

export type BetChoice = BetAction // 'min' | 'max'
export type LockKind = 'play' | 'flamber' | 'empty' // empty = no cards left to lock: a thrown hand

// everything a seat can do. cards are always referenced by id, never by hand index
export type Action =
  | { type: 'pickBox'; box: StarterId } // one of the 3 offered
  | { type: 'draft'; rows: number[] } // keep 3 of the 4 rows
  | { type: 'buy'; slot: number } // a pack, collectible, pochette or scratcher in the shop's offers
  | { type: 'sortPack'; toDeck: number[] } // closes the open pack: these card ids go to the deck, the rest to the binder
  | { type: 'sell'; cardId: number } // from the binder only
  | { type: 'sellCollectible'; slot: number } // display case slot
  | { type: 'restock' }
  | { type: 'ship'; cardId: number; shipper: Shipper } // send a deck or binder card to grading. one per shop visit
  | { type: 'binBulk' }
  | { type: 'leaveShop' }
  | { type: 'discard'; cardIds: number[] } // toss 1-5 and draw that many
  | { type: 'play'; cardIds: number[] } // lock 1-5 cards as this hand
  | { type: 'flamber'; cardIds: number[]; grind: number | null } // throw this hand. no pair: grind = the card that gets +1 value
  | { type: 'forgeKeep'; traits: Trait[] } // only when a flambé goes over the tier's trait cap
  | { type: 'bet'; choice: BetChoice }
  | { type: 'spoils'; cardId: number | null } // null = skip for +$1
  | { type: 'useInsert'; slot: number; cardIds: number[]; suit: Suit | null } // slot 2 = a scratched insert waiting for room
  | { type: 'tossInsert'; slot: number }

export type LogEntry = { seat: SeatId; action: Action; auto?: boolean } // auto = timeout default or bot move

export type ShopOfferView = ShopOffer

export type ShopView = {
  kind: ShopKind
  offers: ShopOfferView[]
  restockPrice: number
  services: { grading: boolean; bulkBin: boolean } // the small shop has one, the big shop both
  bulkPrice: number
  bulkInDeck: number
  shipped: boolean // already sent a card to grading this visit
  open: PackContents | null // a ripped pack waiting for sortPack
}

export type PhaseKind = 'draft' | 'shop' | 'deal' | 'bet' | 'spoils' | 'over'

export type BetMade = { seat: SeatId; choice: BetChoice; stage: BetStage; amount: number } // amount = what that seat has riding after it

// a seat's betting, from that seat's side
export type BetView = {
  opponent: SeatId
  first: SeatId
  toAct: SeatId | null
  stage: BetStage | null // null = nobody is betting right now
  stake: number // each seat's ante in the pot
  extra: number // what Max puts on yourself
  canMax: boolean // I can cover it
  onMax: [boolean, boolean] // [me, them]
  choices: BetMade[] // both seats' choices so far, in order
  options: BetChoice[] // what I can bet right now. empty when it's not my turn
  why: Partial<Record<BetChoice, string>> // on my turn, one line per choice I can't use
}

// the last hand this seat revealed. a thrown hand reveals nothing to the other seat
export type ShowdownView = {
  opponent: SeatId
  hand: number
  mine: Appraisal | null // null = thrown
  theirs: Appraisal | null
  myKind: LockKind
  theirKind: LockKind
  myCards: Card[]
  theirCards: Card[]
  winner: SeatId | null
  ko: boolean
}

export type HandSummary = { hand: number; winner: SeatId | null; ko: boolean; mine: number | null; theirs: number | null } // null = thrown

// the round so far at my table
export type HandsView = {
  opponent: SeatId
  hand: number // the hand being played, 1..3
  knockout: number // win a hand by this many × and the round is yours
  wins: [number, number] // [me, them]
  totals: [number, number]
  hands: HandSummary[]
  done: boolean
}

export type SpoilsView = {
  cards: Card[] // still on the table
  first: SeatId
  toPick: SeatId | null
  picks: { seat: SeatId; card: Card | null }[] // null = skipped for +$1
}

export type RoundResultView = {
  round: number
  outcome: 'win' | 'loss' | 'tie' | 'bye'
  ko: boolean
  wins: [number, number] // [me, them]
  margin: number // my round total − theirs. thrown hands count 0
  tally: { pot: number; house: number; ko: number; momentum: number; interest: number; extras: number; skip: number }
  forged: Card[]
  ground: Card[]
  bulk: number
  torn: Card[]
  stolen: Card | null // sticky fingers: the card you took
  robbed: Card | null // sticky fingers: the card the rival took from you
  bets: BetMade[]
}

export type OtherSeatView = {
  seat: SeatId
  name: string
  kind: 'human' | 'bot'
  bankroll: number
  alive: boolean
  handSize: number // cards in hand right now
  discards: number // used this round
  sleeve: number // inserts up their Sleeve
  marked: Card[] // their locked Marked knockoffs, face up
  deckSize: number
  display: Owned[]
  sleeves: SleeveId[] // pochettes
  rival: RivalId | null // solo: the mask in that seat
  done: boolean // finished the current phase (left the shop, locked in, ...)
}

// solo, big shop: who sits down next
export type ScoutView = { rival: RivalId; name: string; lane: string; leans: string; display: Owned[]; deckSize: number; stack: number; twist: Twist | null }

export type SeatView = {
  engineVersion: string
  mode: Mode
  round: number
  lastRound: number | null // 12 for solo/daily/duel. null = battle royale, sudden death after 12
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
    lockKind: LockKind | null
    handSize: number // what a refill brings you back to
    discardsLeft: number
    sleeve: SleeveCard[]
    overflow: SleeveCard | null // scratched with a full Sleeve: use or toss one to make room
    pile: Card[] // sorted, never in draw order
    discard: Card[] // sorted
    binder: Card[]
    shipping: { card: Card; shipper: Shipper; back: number } | null // away at grading, back at round `back`'s shop. grade hidden till then
    display: Owned[]
    displaySlots: number
    sleeves: SleeveId[] // pochettes
    levels: Record<HandType, number>
    starter: StarterId | null
    draft: { offer: StarterId[]; rows: DraftRow[] | null } | null
    shop: ShopView | null
    forge: ForgePlan | null // a flambé waiting on forgeKeep
    marker: { due: number; table: number } | null // le patron's next payment, collected after this table
    done: boolean
  }
  others: OtherSeatView[]
  hands: HandsView | null
  bet: BetView | null
  showdown: ShowdownView | null
  spoils: SpoilsView | null
  scout: ScoutView | null
  last: RoundResultView | null
  result: MatchResult | null
}

export type MatchResult = {
  placement: SeatId[] // best first
  scores: number[] // by seat. solo/daily: bankroll after the final payment × difficulty, 0 on a loss. duel/br: seats outlasted
  winner: SeatId | null
}

export type Event =
  | { kind: 'packOpened'; contents: PackContents }
  | { kind: 'showdown'; showdown: ShowdownView } // every hand's reveal, drives the count-up
  | { kind: 'roundEnd'; result: RoundResultView }
  | { kind: 'busted'; seat: SeatId }
  | { kind: 'graded'; card: Card } // back from the grading desk
  | { kind: 'scratched'; insert: Insert; hand: HandType | null; collectible: Owned | null; joker: Card | null } // what a scratcher gave
  | { kind: 'insertUsed'; insert: Insert; cards: Card[] }
  | { kind: 'patron'; seat: SeatId; due: number; paid: boolean } // le patron collected, or you couldn't cover it
  | { kind: 'rival'; seat: SeatId; rival: RivalId } // a solo rival sat down
  | { kind: 'matchOver'; result: MatchResult }

export type StepResult = { match: Match; events: { to: SeatId | 'all'; event: Event }[] }

// ---------- state. never sent to a client, only view() is. plain JSON: no Map, Set, Date or closures ----------

export type ShopState = Shop & { shipped: boolean; open: PackContents | null; services: { grading: boolean; bulkBin: boolean } }

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
  bustBank: number // what it had when it went out (a missed payment), for ties
  bankroll: number
  starter: StarterId | null
  rules: Rules
  display: Owned[]
  levels: Record<HandType, number>
  binder: Card[]
  sleeves: SleeveId[] // pochettes
  sleeve: SleeveCard[] // the Sleeve: up to 2 inserts
  overflow: SleeveCard | null
  mem: ShopMemory
  rival: RivalId | null // solo: which mask sits in this seat this table
  owes: boolean // pays le patron's marker
  tableWins: number // rounds won earlier this table, for momentum at the boss
  bulkBinned: number // paid bulk removals this run, each costs $1 more
  shipping: Shipping | null
  draft: { offer: StarterId[]; rows: DraftRow[] | null } | null // null once drafted
  shop: ShopState | null
  // this round
  discards: number // used this round
  locked: number[] | null
  lockKind: LockKind | null
  grind: number | null // a no-pair flamber: the card that gets +1 value
  forge: { keep: Trait[] | null } | null // a pair-or-better flamber. keep null = waiting on forgeKeep
  played: number[] // every card played (not thrown) this round, for gold border
  jokers: JokerId[] // what the jokers played this round counted as
  made: { forged: Card[]; ground: Card[]; bulk: number; torn: Card[] }
  done: boolean
  showdown: ShowdownView | null
  last: RoundResultView | null
  rng: { pile: Rng; shop: Rng; table: Rng } // reseeded from `seed:round:seat:purpose`
}

export type HandPlay = { kind: LockKind; cards: Card[]; appraisal: Appraisal | null } // cards as appraised (jokers resolved)
export type HandRecord = { hand: number; plays: [HandPlay, HandPlay]; winner: Pos | null; ko: boolean }
export type Spoils = { cards: Card[]; order: [Pos, Pos]; next: number; picks: { pos: Pos; card: Card | null }[] }
export type Pair = { seats: [SeatId, SeatId]; betting: Betting | null; hands: HandRecord[]; done: boolean; spoils: Spoils | null }

export type Match = {
  engineVersion: string
  config: MatchConfig
  round: number
  hand: number // 1..3 within the round
  phase: PhaseKind
  players: Player[]
  pairs: Pair[] // this round's tables
  twists: Twist[]
  keeper: KeeperId[] // the shopkeeper's sign, 3 traits for the run
  rivals: RivalId[] // solo: the 4 masks, one per table
  nextCardId: number
  n: number // actions applied so far
  result: MatchResult | null
}

// difficulty only changes the rivals: how sharp they bet and how far along their build is (step)
export const DIFFICULTIES: Record<Difficulty, { name: string; text: string; style: string; step: number; rare: boolean; scoreMult: number }> = {
  easy: { name: 'Easy', text: 'Rivals play scared, a Table behind.', style: 'easy', step: -1, rare: false, scoreMult: 1 },
  medium: { name: 'Medium', text: 'Regulars. They know when to push.', style: 'house', step: 0, rare: false, scoreMult: 1.5 },
  hard: { name: 'High Roller', text: 'Sharks, a Table ahead, each with a rare.', style: 'sharp', step: 1, rare: true, scoreMult: 2 },
}

type Emit = { to: SeatId | 'all'; event: Event }[]

// ---------- setup ----------

const isSolo = (m: Match) => m.config.mode === 'solo' || m.config.mode === 'daily'

export function newMatch(config: MatchConfig): Match {
  const n = config.seats.length
  if (config.mode === 'br' ? n < 2 || n > 10 : n !== 2) throw new Error(`${config.mode} needs ${config.mode === 'br' ? '2-10' : '2'} seats, got ${n}`)
  const solo = config.mode === 'solo' || config.mode === 'daily'
  if (solo && (config.seats[0].kind !== 'human' || config.seats[1].kind !== 'bot')) throw new Error(`${config.mode} is seat 0 human vs seat 1 bot`)
  if (!config.seed) throw new Error('match needs a seed')
  const players = config.seats.map((s, seat): Player => {
    if (s.kind === 'bot' && !s.difficulty && !s.style) throw new Error(`bot seat ${seat} needs a difficulty or style`)
    const rival = solo && seat === 1
    return {
      seat, name: s.name, kind: s.kind, difficulty: s.difficulty ?? null,
      style: s.style ?? (s.kind === 'bot' ? DIFFICULTIES[s.difficulty!].style : null), // a human seat with a style can be autoplayed (the sim)
      alive: true, bustRound: null, bustBank: 0, bankroll: 0, starter: null, rules: DEFAULT_RULES,
      hand: [], pile: [], discard: [], display: [], levels: emptyLevels(), binder: [], sleeves: [], sleeve: [], overflow: null,
      mem: { seen: [], rolledOver: false, packDiscount: 0 },
      rival: null, owes: !rival, tableWins: 0, bulkBinned: 0, shipping: null,
      // everyone's offer comes off the same stream, so a daily offers every player the same 3 boxes. a solo rival doesn't draft
      draft: rival ? null : { offer: starterOffer(config.mode === 'br' ? `${config.seed}:${seat}` : seat === 0 ? config.seed : `${config.seed}:rival`), rows: null },
      shop: null, discards: 0, locked: null, lockKind: null, grind: null, forge: null, played: [], jokers: [],
      made: { forged: [], ground: [], bulk: 0, torn: [] }, done: rival, showdown: null, last: null,
      rng: seatRngs(config.seed, 1, seat),
    }
  })
  const m: Match = {
    engineVersion: ENGINE_VERSION, config, round: 1, hand: 1, phase: 'draft', players, pairs: [],
    twists: rollTwists(config.seed), keeper: keeperFor(config.seed), rivals: solo ? rivalOrder(config.seed) : [], nextCardId: 1, n: 0, result: null,
  }
  if (solo) sitRival(m, 1, [])
  return m
}

function seatRngs(seed: string, round: number, seat: SeatId): Player['rng'] {
  return {
    pile: makeRng(`${seed}:${round}:${seat}:pile`),
    shop: makeRng(`${seed}:${round}:${seat}:shop`),
    table: makeRng(`${seed}:${round}:${seat}:table`),
  }
}

// solo: this table's rival sits down in seat 1, built for its table, with its stack
function sitRival(m: Match, table: number, emit: Emit): void {
  const id = m.rivals[table - 1]
  if (!id) throw new Error(`no rival for table ${table}`)
  const p = m.players[1]
  const d = DIFFICULTIES[m.config.seats[1].difficulty ?? 'medium']
  const b = buildRival(id, Math.max(0, table - 1 + d.step), d.rare, `${m.config.seed}:rival:${table}`, m)
  const levels = emptyLevels()
  for (const h of b.codes) levels[h]++
  Object.assign(p, {
    name: getRival(id).name, rival: id, alive: true, bustRound: null, bustBank: 0, bankroll: RIVAL_STACKS[table - 1],
    hand: [], pile: b.deck, discard: [], binder: [], display: b.display, levels, tableWins: 0, shipping: null, last: null, showdown: null,
  })
  emit.push({ to: 'all', event: { kind: 'rival', seat: 1, rival: id } })
}

// ---------- rule helpers (shared with bots and the ui) ----------

export function seat(m: Match, s: SeatId): Player {
  const p = m.players[s]
  if (!p) throw new Error(`no seat ${s}`)
  return p
}

export function lastRound(m: Match): number | null {
  return m.config.mode === 'br' ? null : ROUNDS
}

export function twistFor(m: Match, round = m.round): Twist | null {
  if (!isTournament(round)) return null
  return m.twists[TOURNAMENT_ROUNDS.indexOf(round)]
}

// ante and max for a pair. the bigger starter ante bonus applies to both
export function pairBlinds(m: Match, seats: SeatId[]): { ante: number; max: number } {
  const b = blinds(m.round)
  const bonus = Math.max(0, ...seats.map(s => seat(m, s).rules.anteBonus))
  return { ante: b.ante + bonus, max: b.max + bonus }
}

export function handSize(p: Player): number {
  return HAND_SIZE + (hasCollectible(p.display, 'deck_box') ? 1 : 0) + (p.sleeves.includes('big_hands') ? 1 : 0)
}

export function discardsLeft(m: Match, p: Player): number {
  if (twistFor(m)?.id === 'colddeck') return 0
  return Math.max(0, p.rules.discards - p.discards)
}

export function displaySlots(p: Player): number {
  return p.rules.displaySlots + (p.sleeves.includes('riser') ? 1 : 0)
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

// what each played joker counts as this hand. the crayon joker rolls a real one, only at the real reveal
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

// higher appraisal takes the hand, except lowball
export function showdownWinner(m: Match, a: number, b: number): Pos | null {
  if (a === b) return null
  const aWins = twistFor(m)?.id === 'lowball' ? a < b : a > b
  return aWins ? 0 : 1
}

// a thrown hand loses to any played hand and ties another thrown hand. otherwise the appraisals decide
export function handWinner(m: Match, kinds: [LockKind, LockKind], totals: [number, number]): Pos | null {
  const played = [kinds[0] === 'play', kinds[1] === 'play']
  if (!played[0] && !played[1]) return null
  if (played[0] !== played[1]) return played[0] ? 0 : 1
  return showdownWinner(m, totals[0], totals[1])
}

// winning a hand by K× ends the round. a thrown hand can't be knocked out. lowball: K× lower
export function isKnockout(m: Match, winner: Pos | null, kinds: [LockKind, LockKind], totals: [number, number]): boolean {
  if (winner === null || kinds[0] !== 'play' || kinds[1] !== 'play') return false
  const k = knockoutAt(m.round)
  const w = totals[winner]
  const l = totals[other(winner)]
  return twistFor(m)?.id === 'lowball' ? w * k <= l : w >= k * l
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

// the best 1-5 card play by estimate (no misprint rolls), then kickers dropped so they stay in hand.
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

// hands won and appraisal totals so far this round, by position. thrown hands count 0
export function roundScore(pair: Pair): { wins: [number, number]; totals: [number, number] } {
  const wins: [number, number] = [0, 0]
  const totals: [number, number] = [0, 0]
  for (const h of pair.hands) {
    if (h.winner !== null) wins[h.winner]++
    for (const pos of [0, 1] as Pos[]) totals[pos] += h.plays[pos].appraisal?.total ?? 0
  }
  return { wins, totals }
}

// who takes the round: a knockout, then more hands won, then the higher total (lowball: lower). null = a tie round
export function roundWinner(m: Match, pair: Pair): Pos | null {
  const lastHand = pair.hands.at(-1)
  if (lastHand?.ko) return lastHand.winner
  const { wins, totals } = roundScore(pair)
  if (wins[0] !== wins[1]) return wins[0] > wins[1] ? 0 : 1
  return showdownWinner(m, totals[0], totals[1])
}

// binder cards a wishlist can move into the deck: anything but a joker past the cap
export function wishable(p: Player): Card[] {
  return p.binder.filter(c => !c.joker || deckJokers(p) < MAX_JOKERS)
}

// the best spoils card for a deck, by value plus a bonus for anything special. bots and the timeout default
export function spoilsWorth(c: Card): number {
  const face = c.rank === 14 ? 11 : Math.min(c.rank, 10)
  return face + (c.finish ? 12 : 0) + (c.stamp && c.stamp !== 'damaged' ? 8 : 0) + (c.variant && c.variant !== 'chase' ? 6 : 0)
}

// ---------- validation: one predicate per action. step throws on a problem, legal() filters with the same check ----------

const ids = (xs: unknown): xs is number[] => Array.isArray(xs) && xs.every(x => Number.isInteger(x))
const unique = (xs: number[]) => new Set(xs).size === xs.length

// a set of hand cards to lock: real ids from the hand, 1 to 5 play slots, beer-stained pairs together
function lockProblem(p: Player, cardIds: unknown): string | null {
  if (!ids(cardIds) || !unique(cardIds) || !cardIds.every(id => p.hand.some(c => c.id === id))) return 'lock cards from your hand'
  if (cardIds.length < 1 || playSlots(p.hand.filter(c => cardIds.includes(c.id))) > PLAY_SIZE) return `lock 1 to ${PLAY_SIZE} play slots (a jumbo takes 2)`
  return splitsStuck(p.hand, cardIds) ? 'beer-stained cards go together' : null
}

// the insert in a Sleeve slot (2 = the one waiting for room)
function heldInsert(p: Player, slot: number): SleeveCard | null {
  if (!Number.isInteger(slot)) return null
  if (slot === SLEEVE_SLOTS) return p.overflow
  return p.sleeve[slot] ?? null
}

function insertProblem(m: Match, p: Player, a: Extract<Action, { type: 'useInsert' }>, where: 'shop' | 'hand'): string | null {
  const held = heldInsert(p, a.slot)
  if (!held) return 'no insert in that slot'
  const def = INSERTS[held.id]
  if (def.when === 'hand' && where === 'shop') return 'use it during a round, on the cards you hold'
  if (def.when === 'shop' && where === 'hand') return 'use it in the shop'
  if (!ids(a.cardIds) || !unique(a.cardIds)) return 'pick cards'
  const n = a.cardIds.length
  if (n < def.cards[0] || n > def.cards[1]) return def.cards[0] === def.cards[1] ? `pick ${def.cards[0]} card${def.cards[0] === 1 ? '' : 's'}` : `pick ${def.cards[0]} to ${def.cards[1]} cards`
  if (held.id !== 'checklist' && a.suit !== null) return 'no suit for this one'
  if (held.id === 'wishlist') {
    const card = p.binder.find(c => c.id === a.cardIds[0])
    if (!card) return 'pick a card from your binder'
    return card.joker && deckJokers(p) >= MAX_JOKERS ? `max ${MAX_JOKERS} jokers in a deck` : null
  }
  const cards = a.cardIds.map(id => p.hand.find(c => c.id === id))
  if (!cards.every(c => c !== undefined)) return 'pick cards from your hand'
  const real = cards as Card[]
  if (held.id !== 'broyeuse' && real.some(c => c.bulk)) return 'not on bulk'
  switch (held.id) {
    case 'checklist': return SUITS.includes(a.suit as Suit) && real.every(c => c.suit !== a.suit) ? null : 'pick a suit they are not'
    case 'stylo': return real.every(c => c.rank < 14) ? null : 'an ace is already the top'
    case 'photocopie': return real.some(c => c.joker) ? 'not on jokers' : null
    case 'reprint': return real[0].joker && deckJokers(p) >= MAX_JOKERS ? `max ${MAX_JOKERS} jokers in a deck` : null
    case 'foil': case 'holo': case 'prism': return real[0].finish === held.id ? `already ${def.name.split(' ')[0]}` : null
    case 'allumettes': return forgePlan(real) ? null : 'pick 2 cards of the same rank'
    default: return null
  }
}

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
    if (a.type === 'useInsert') return insertProblem(m, p, a, 'shop')
    if (a.type === 'tossInsert') return heldInsert(p, a.slot) ? null : 'no insert in that slot'
    if (p.overflow) return 'your Sleeve is full: use or toss an insert'
    switch (a.type) {
      case 'buy': {
        const o = Number.isInteger(a.slot) ? shop.offers[a.slot] : undefined
        if (!o || o.sold) return 'nothing to buy in that slot'
        if (p.bankroll - o.price < 1) return 'can not afford it' // keep $1 to sit at the table
        if (o.type === 'collectible' && p.display.length >= displaySlots(p)) return 'display case is full'
        if (o.type === 'sleeve' && p.sleeves.includes(o.id)) return 'already own that pochette'
        return null
      }
      case 'sell': {
        const card = p.binder.find(c => c.id === a.cardId)
        return card ? refusesToBuy(m, card) : 'that card is not in your binder'
      }
      case 'sellCollectible': return Number.isInteger(a.slot) && p.display[a.slot] ? null : 'nothing in that slot'
      case 'restock': return p.bankroll - restockPrice(shop, freeRestocks(m, p)) >= 1 ? null : 'can not afford a restock'
      case 'ship': {
        if (!shop.services.grading) return 'no grading desk at this shop'
        if (shop.shipped) return 'one shipment per shop visit'
        if (p.shipping) return 'a card is already away at grading'
        const shipper = Object.hasOwn(SHIPPERS, a.shipper) ? SHIPPERS[a.shipper] : undefined
        if (!shipper) return 'no such shipper'
        if (p.bankroll - shipper.price < 1) return 'can not afford that shipper'
        const card = [...p.pile, ...p.discard, ...p.binder].find(c => c.id === a.cardId)
        return card && canGrade(card) ? null : 'can not grade that card'
      }
      case 'binBulk': {
        if (!shop.services.bulkBin) return 'no bulk bin at this shop'
        if (![...p.pile, ...p.discard].some(c => c.bulk)) return 'no bulk to bin'
        return p.bankroll - bulkPrice(p) >= 1 ? null : 'can not afford to bin bulk'
      }
      case 'leaveShop': return null
      default: return `${a.type} is not a shop action`
    }
  }

  if (m.phase === 'deal') {
    if (!p.alive) return 'not playing'
    const at = pairOf(m, s)
    if (!at || at.pair.done) return 'sitting this hand out'
    if (p.forge && !p.forge.keep) {
      if (a.type !== 'forgeKeep') return 'pick which traits the ★ card keeps'
      const plan = forgePlan(lockedCards(p))
      if (!plan) throw new Error(`seat ${s} flambéd a hand that can not merge`)
      if (!Array.isArray(a.traits) || a.traits.length !== plan.tier) return `keep exactly ${plan.tier} traits`
      const offered = plan.candidates.map(t => JSON.stringify(t))
      const keys = a.traits.map(t => JSON.stringify(t))
      return new Set(keys).size === keys.length && keys.every(k => offered.includes(k)) ? null : 'keep traits the flambé offered'
    }
    if (p.locked) return 'already locked in'
    switch (a.type) {
      case 'discard': {
        if (discardsLeft(m, p) <= 0) return twistFor(m)?.id === 'colddeck' ? 'cold deck: no discards' : 'no discards left'
        if (!ids(a.cardIds) || !unique(a.cardIds) || !a.cardIds.every(id => p.hand.some(c => c.id === id))) return 'discard cards from your hand'
        if (a.cardIds.length < 1 || a.cardIds.length > PLAY_SIZE) return `discard 1 to ${PLAY_SIZE} cards`
        return splitsStuck(p.hand, a.cardIds) ? 'beer-stained cards go together' : null
      }
      case 'play': return lockProblem(p, a.cardIds)
      case 'flamber': {
        const why = lockProblem(p, a.cardIds)
        if (why) return why
        const cards = p.hand.filter(c => a.cardIds.includes(c.id))
        if (forgePlan(cards)) return a.grind === null ? null : 'a pair or better merges, nothing to grind'
        const grindable = cards.filter(c => !c.bulk)
        if (grindable.length === 0) return a.grind === null ? null : 'bulk can not be ground'
        return grindable.some(c => c.id === a.grind) ? null : 'pick one locked card to get +1 Value'
      }
      case 'useInsert': return insertProblem(m, p, a, 'hand')
      case 'forgeKeep': return 'no flambé waiting on you'
      default: return `${a.type} is not a deal action`
    }
  }

  if (m.phase === 'bet') {
    if (a.type !== 'bet') return `${a.type} is not a bet action`
    const at = pairOf(m, s)
    if (!at || !at.pair.betting || at.pair.betting.toAct === null) return 'not betting'
    if (at.pair.betting.toAct !== at.pos) return 'not your turn'
    return legalActions(at.pair.betting).includes(a.choice) ? null : `can not ${a.choice} right now`
  }

  if (m.phase === 'spoils') {
    if (a.type !== 'spoils') return `${a.type} is not a spoils action`
    const at = pairOf(m, s)
    const sp = at?.pair.spoils
    if (!at || !sp || sp.next >= 2 || sp.order[sp.next] !== at.pos) return 'not your pick'
    return a.cardId === null || sp.cards.some(c => c.id === a.cardId) ? null : 'that card is not on the table'
  }
  return `unknown phase ${m.phase}`
}

// every insert use a seat could try right now: each held slot × every card choice that insert takes
function insertActions(m: Match, p: Player): Action[] {
  const out: Action[] = []
  for (let slot = 0; slot <= SLEEVE_SLOTS; slot++) {
    const held = heldInsert(p, slot)
    if (!held) continue
    const def = INSERTS[held.id]
    const from = held.id === 'wishlist' ? p.binder : p.hand
    for (const cards of subsets(from.map(c => c.id), def.cards[0], def.cards[1])) {
      if (held.id === 'checklist') for (const suit of SUITS) out.push({ type: 'useInsert', slot, cardIds: cards, suit })
      else if (held.id === 'photocopie') out.push({ type: 'useInsert', slot, cardIds: cards, suit: null }, { type: 'useInsert', slot, cardIds: [cards[1], cards[0]], suit: null })
      else out.push({ type: 'useInsert', slot, cardIds: cards, suit: null })
    }
  }
  return out
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
    out.push(...insertActions(m, p))
    for (let slot = 0; slot <= SLEEVE_SLOTS; slot++) out.push({ type: 'tossInsert', slot })
    p.shop.offers.forEach((_, slot) => out.push({ type: 'buy', slot }))
    for (const c of p.binder) out.push({ type: 'sell', cardId: c.id })
    p.display.forEach((_, slot) => out.push({ type: 'sellCollectible', slot }))
    if (p.shop.services.grading) {
      for (const c of [...p.pile, ...p.discard, ...p.binder]) {
        for (const shipper of Object.keys(SHIPPERS) as Shipper[]) out.push({ type: 'ship', cardId: c.id, shipper })
      }
    }
    out.push({ type: 'restock' }, { type: 'binBulk' }, { type: 'leaveShop' })
  } else if (m.phase === 'deal') {
    if (p.forge && !p.forge.keep) {
      const plan = forgePlan(lockedCards(p))
      if (plan) for (const traits of combos(plan.candidates, plan.tier)) out.push({ type: 'forgeKeep', traits })
    } else if (!p.locked) {
      const hand = p.hand.map(c => c.id)
      for (const cardIds of subsets(hand, 1, PLAY_SIZE)) {
        out.push({ type: 'play', cardIds }, { type: 'discard', cardIds })
        const cards = p.hand.filter(c => cardIds.includes(c.id))
        const grindable = cards.filter(c => !c.bulk)
        if (forgePlan(cards) || grindable.length === 0) out.push({ type: 'flamber', cardIds, grind: null })
        else for (const c of grindable) out.push({ type: 'flamber', cardIds, grind: c.id })
      }
      out.push(...insertActions(m, p))
    }
  } else if (m.phase === 'bet') {
    for (const choice of ['min', 'max'] as const) out.push({ type: 'bet', choice })
  } else if (m.phase === 'spoils') {
    const sp = pairOf(m, s)?.pair.spoils
    if (sp) for (const c of sp.cards) out.push({ type: 'spoils', cardId: c.id })
    out.push({ type: 'spoils', cardId: null })
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
      useInsert(m, p, a, emit)
      return
    }
    case 'tossInsert': {
      if (a.slot === SLEEVE_SLOTS) p.overflow = null
      else p.sleeve.splice(a.slot, 1)
      roomForOverflow(p)
      return
    }
    case 'sell': {
      const i = p.binder.findIndex(c => c.id === a.cardId)
      p.bankroll += binderPrice(m, p, p.binder[i])
      p.binder.splice(i, 1)
      return
    }
    case 'sellCollectible': {
      // half what it costs today, so closing down can't make a buy-for-$1, sell-for-$2 loop
      p.bankroll += Math.floor(Math.max(1, COLLECTIBLE_PRICE[getDef(p.display[a.slot].id).rarity] + keeperPriceAdj(m)) / 2)
      p.display.splice(a.slot, 1)
      return
    }
    case 'restock': {
      const shop = p.shop!
      p.bankroll -= restockPrice(shop, freeRestocks(m, p))
      const fresh = restock(shop, p.rng.shop, p.mem, p.display, keeperPriceAdj(m))
      p.shop = { ...fresh, shipped: shop.shipped, open: null, services: shop.services }
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
    case 'discard': {
      toDiscard(p, a.cardIds)
      p.discards++
      draw(p, a.cardIds.length)
      lockEmptyHand(p) // tossed your last cards with nothing left to draw
      return
    }
    case 'play': {
      p.locked = a.cardIds.slice()
      p.lockKind = 'play'
      p.done = true
      return
    }
    case 'flamber': {
      p.locked = a.cardIds.slice()
      p.lockKind = 'flamber'
      p.grind = a.grind
      const plan = forgePlan(lockedCards(p))
      // over the trait cap the seat picks what the ★ card keeps, otherwise it keeps everything
      p.forge = plan ? { keep: plan.candidates.length > plan.tier ? null : plan.candidates } : null
      p.done = !p.forge || p.forge.keep !== null
      return
    }
    case 'forgeKeep': {
      p.forge!.keep = a.traits
      p.done = true
      return
    }
    case 'bet': {
      const at = pairOf(m, s)!
      at.pair.betting = act(at.pair.betting!, a.choice)
      return
    }
    case 'spoils': {
      const at = pairOf(m, s)!
      const sp = at.pair.spoils!
      if (a.cardId === null) {
        p.bankroll += SPOILS_SKIP
        sp.picks.push({ pos: at.pos, card: null })
      } else {
        const card = sp.cards.splice(sp.cards.findIndex(c => c.id === a.cardId), 1)[0]
        shuffleIn(p, card, p.rng.pile)
        sp.picks.push({ pos: at.pos, card })
      }
      sp.next++
      if (sp.next >= 2) sp.cards = [] // the last card burns
      return
    }
  }
}

// ---------- the Sleeve ----------

// buying a scratcher: grail resolves on the spot, anything else goes up your Sleeve (or waits for room).
// a wishlist with an empty binder falls back to a code, so a scratcher never comes up blank
function scratch(m: Match, p: Player, emit: Emit): void {
  let insert = rollInsert(p.rng.shop)
  if (insert === 'wishlist' && wishable(p).length === 0) insert = 'code'
  let hand: HandType | null = null
  let collectible: Owned | null = null
  let joker: Card | null = null
  if (insert === 'grail') {
    if (chance(p.rng.shop, 0.5)) {
      joker = newCard(m, randInt(p.rng.shop, 2, 14), pick(p.rng.shop, SUITS), { joker: pick(p.rng.shop, REAL_JOKERS), pulledRound: m.round })
      if (deckJokers(p) < MAX_JOKERS) shuffleIn(p, joker, p.rng.pile)
      else p.binder.push(joker)
    } else {
      collectible = drawCollectible(p.rng.shop, p.mem, p.display, [], 'rare')
      if (p.display.length < displaySlots(p)) p.display.push(collectible)
      else p.bankroll += Math.floor(COLLECTIBLE_PRICE.rare / 2)
    }
  } else {
    if (insert === 'code') hand = pick(p.rng.shop, HAND_TYPES)
    const card: SleeveCard = { id: insert, hand }
    if (p.sleeve.length < SLEEVE_SLOTS) p.sleeve.push(card)
    else p.overflow = card
  }
  emit.push({ to: p.seat, event: { kind: 'scratched', insert, hand, collectible, joker } })
}

function roomForOverflow(p: Player): void {
  if (p.overflow && p.sleeve.length < SLEEVE_SLOTS) {
    p.sleeve.push(p.overflow)
    p.overflow = null
  }
}

function useInsert(m: Match, p: Player, a: Extract<Action, { type: 'useInsert' }>, emit: Emit): void {
  const held = heldInsert(p, a.slot)!
  if (a.slot === SLEEVE_SLOTS) p.overflow = null
  else p.sleeve.splice(a.slot, 1)
  const cards = a.cardIds.map(id => (held.id === 'wishlist' ? p.binder : p.hand).find(c => c.id === id)!)
  switch (held.id) {
    case 'code':
      p.levels[held.hand!]++
      break
    case 'checklist':
      for (const c of cards) c.suit = a.suit!
      break
    case 'stylo':
      for (const c of cards) c.rank = Math.min(14, c.rank + 1)
      break
    case 'broyeuse':
      removeFromHand(p, a.cardIds)
      break
    case 'photocopie': {
      // the first card becomes the second: rank, suit, finish and the stamp slot. a beer stain doesn't copy (it's stuck to one card)
      const [target, source] = cards
      target.rank = source.rank
      target.suit = source.suit
      target.finish = source.finish
      target.stamp = source.stamp
      target.knockoff = source.knockoff && source.knockoff.kind !== 'beer' ? { ...source.knockoff } : null
      break
    }
    case 'reprint': {
      const c = cards[0]
      const knockoff = c.knockoff && c.knockoff.kind !== 'beer' ? { ...c.knockoff } : null
      p.discard.push(newCard(m, c.rank, c.suit, {
        finish: c.finish, stamp: c.stamp, knockoff, variant: c.variant, joker: c.joker, tier: c.tier, traits: c.traits.map(t => ({ ...t })),
        grind: c.grind, bonusHype: c.bonusHype, grade: c.grade, pulledRound: m.round,
      }))
      break
    }
    case 'foil': case 'holo': case 'prism':
      cards[0].finish = held.id
      break
    case 'tampon':
      cards[0].stamp = pick(p.rng.table, ['first', 'signed', 'gold'] as const)
      cards[0].knockoff = null
      break
    case 'allumettes': {
      // like flambéing the pair without throwing a hand: the ★ card stays in your hand, the bulk goes to the discard
      const plan = forgePlan(cards)!
      const { forged, bulk } = buildForged(plan, autoKeep(plan), m.round, m)
      removeFromHand(p, plan.merged.map(c => c.id))
      p.hand.push(forged)
      p.discard.push(...bulk)
      p.made.forged.push(forged)
      p.made.bulk += bulk.length
      break
    }
    case 'wishlist': {
      const i = p.binder.findIndex(c => c.id === cards[0].id)
      shuffleIn(p, p.binder.splice(i, 1)[0], p.rng.pile)
      break
    }
    case 'grail':
      throw new Error('a grail never sits in the Sleeve')
  }
  roomForOverflow(p)
  if (m.phase === 'deal') lockEmptyHand(p) // shredded your last cards
  emit.push({ to: p.seat, event: { kind: 'insertUsed', insert: held.id, cards: held.id === 'broyeuse' ? cards : cards.map(c => ({ ...c })) } })
}

// ---------- phase transitions ----------

// keeps moving the match forward while the current phase has nobody left to act
function advance(m: Match, emit: Emit): void {
  for (;;) {
    if (m.phase === 'over' || pending(m).length > 0) return
    if (m.phase === 'draft' || m.phase === 'shop') enterRound(m, emit)
    else if (m.phase === 'deal') afterLocks(m, emit)
    else if (m.phase === 'bet') revealHand(m, emit)
    else if (m.phase === 'spoils') nextShop(m, emit)
  }
}

function resetRound(p: Player): void {
  p.discards = 0
  p.locked = null
  p.lockKind = null
  p.grind = null
  p.forge = null
  p.played = []
  p.jokers = []
  p.made = { forged: [], ground: [], bulk: 0, torn: [] }
  p.showdown = null
}

// a seat with no cards left can't lock anything: its hand is thrown
function lockEmptyHand(p: Player): void {
  if (p.hand.length > 0) return
  p.locked = []
  p.lockKind = 'empty'
  p.done = true
}

// a new round: the whole deck shuffles, everyone is dealt 8, and the pairs sit down
function enterRound(m: Match, emit: Emit): void {
  m.phase = 'deal'
  m.hand = 1
  if (isSolo(m) && m.round === 1 && m.players[1].rival === null) sitRival(m, 1, emit)
  for (const p of m.players) {
    p.shop = null
    resetRound(p)
    p.done = !p.alive
    if (!p.alive) continue
    const fresh = seatRngs(m.config.seed, m.round, p.seat)
    p.rng.pile = fresh.pile
    p.rng.table = fresh.table
    if (isTableStart(m.round)) p.tableWins = 0
    shuffleDeck(p, p.rng.pile)
    draw(p, handSize(p))
  }
  // pairs: a duel is one fixed pair. battle royale redraws them every table (seeded), an odd one out gets a bye
  const alive = m.players.filter(p => p.alive).map(p => p.seat)
  const order = m.config.mode === 'br' ? shuffled(makeRng(`${m.config.seed}:${tableOf(m.round)}:pairs`), alive) : alive
  m.pairs = []
  for (let i = 0; i + 1 < order.length; i += 2) m.pairs.push({ seats: [order[i], order[i + 1]], betting: null, hands: [], done: false, spoils: null })
  for (const p of m.players) {
    if (!p.alive) continue
    if (pairOf(m, p.seat)) lockEmptyHand(p)
    else p.done = true // a bye
  }
}

// everyone at an open table has locked. hand 1 opens the betting, hand 3 gets the last push
function afterLocks(m: Match, emit: Emit): void {
  for (const pair of m.pairs) {
    if (pair.done) continue
    if (m.hand === 1) {
      const bankrolls = pair.seats.map(s => seat(m, s).bankroll) as [number, number]
      const { ante, max } = pairBlinds(m, pair.seats)
      pair.betting = openStage(startBetting(firstToAct(bankrolls, m.round), ante, max, bankrolls, twistFor(m)?.id === 'highstakes'), 'open')
    } else if (m.hand === HANDS_PER_ROUND) {
      pair.betting = openStage(pair.betting!, 'push')
    }
  }
  if (m.pairs.some(pr => !pr.done && pr.betting?.toAct !== null)) m.phase = 'bet'
  else revealHand(m, emit)
}

// every open table reveals the hand. then the next hand, or the round is over
function revealHand(m: Match, emit: Emit): void {
  for (const pair of m.pairs) if (!pair.done) resolveHand(m, pair, emit)
  if (m.pairs.every(pr => pr.done)) return settleRound(m, emit)
  m.hand++
  m.phase = 'deal'
  for (const p of m.players) {
    p.done = true
    if (!p.alive) continue
    const at = pairOf(m, p.seat)
    if (!at || at.pair.done) continue
    p.locked = null
    p.lockKind = null
    p.grind = null
    p.forge = null
    p.done = false
    refill(p, handSize(p))
    lockEmptyHand(p)
  }
}

function resolveHand(m: Match, pair: Pair, emit: Emit): void {
  const ps = pair.seats.map(s => seat(m, s)) as [Player, Player]
  const kinds = ps.map(p => p.lockKind!) as [LockKind, LockKind]
  const locked = ps.map(lockedCards) as [Card[], Card[]]
  const { ante } = pairBlinds(m, pair.seats)
  const roles = ([0, 1] as Pos[]).map(pos => (kinds[pos] === 'play' ? jokerRoles(locked[pos], ps[pos].rng.table) : new Map())) as [JokerRoles, JokerRoles]
  const shown = ([0, 1] as Pos[]).map(pos =>
    kinds[pos] === 'play' ? resolveJokers(m, ps[pos], locked[pos], ante, roles[pos], kinds[1 - pos] === 'play' ? locked[1 - pos] : null) : locked[pos]) as [Card[], Card[]]
  const betMax = (pos: Pos) => pair.betting?.onMax[pos] ?? false
  const ap = ([0, 1] as Pos[]).map(pos => (kinds[pos] === 'play' ? appraiseFor(m, ps[pos], shown[pos], betMax(pos), ps[pos].rng.table, ante) : null)) as [Appraisal | null, Appraisal | null]
  const totals = ap.map(a => a?.total ?? 0) as [number, number]
  const winner = handWinner(m, kinds, totals)
  const ko = isKnockout(m, winner, kinds, totals)
  pair.hands.push({ hand: m.hand, plays: [0, 1].map(pos => ({ kind: kinds[pos], cards: shown[pos], appraisal: ap[pos] })) as [HandPlay, HandPlay], winner, ko })

  for (const pos of [0, 1] as Pos[]) {
    const p = ps[pos]
    if (kinds[pos] === 'play') playOut(p, locked[pos], ap[pos]!.scoringIds, [...roles[pos].values()])
    else if (kinds[pos] === 'flamber') flamberOut(m, p, locked[pos])
    p.locked = null
    p.lockKind = null
    p.grind = null
    p.forge = null
  }
  const { wins } = roundScore(pair)
  pair.done = ko || wins[0] >= WINS_NEEDED || wins[1] >= WINS_NEEDED || pair.hands.length >= HANDS_PER_ROUND

  for (const pos of [0, 1] as Pos[]) {
    const them = other(pos)
    const sd: ShowdownView = {
      opponent: pair.seats[them], hand: m.hand, mine: ap[pos], theirs: ap[them], myKind: kinds[pos], theirKind: kinds[them],
      myCards: shown[pos], theirCards: kinds[them] === 'play' ? shown[them] : [], winner: winner === null ? null : pair.seats[winner], ko,
    }
    ps[pos].showdown = sd
    emit.push({ to: pair.seats[pos], event: { kind: 'showdown', showdown: sd } })
  }
}

// played cards grow (1st edition) or tear (damaged) if they scored, then go to the discard
function playOut(p: Player, played: Card[], scoringIds: number[], jokers: JokerId[]): void {
  const torn: number[] = []
  for (const card of played) {
    if (!scoringIds.includes(card.id) || card.bulk) continue
    if (card.stamp === 'first') card.bonusHype++
    if (card.stamp === 'damaged' && !p.sleeves.includes('archival') && chance(p.rng.table, 0.25)) {
      torn.push(card.id)
      p.made.torn.push(card)
    }
  }
  removeFromHand(p, torn)
  toDiscard(p, played.filter(c => !torn.includes(c.id)).map(c => c.id))
  p.played.push(...played.map(c => c.id))
  p.jokers.push(...jokers)
}

// a thrown hand. pair or better: the scoring cards merge into a ★ card that comes straight back into your hand,
// plus one bulk per card eaten beyond the first. no pair: the picked card gets +1 value and comes back
function flamberOut(m: Match, p: Player, locked: Card[]): void {
  const plan = forgePlan(locked)
  if (plan) {
    if (!p.forge?.keep) throw new Error(`seat ${p.seat} flambé has no traits picked`)
    const { forged, bulk } = buildForged(plan, p.forge.keep, m.round, m)
    if (locked.some(c => c.joker === 'catalyst')) forged.tier = Math.min(MAX_TIER, forged.tier + 1)
    const merged = plan.merged.map(c => c.id)
    removeFromHand(p, merged)
    toDiscard(p, locked.filter(c => !merged.includes(c.id)).map(c => c.id))
    p.hand.push(forged)
    p.discard.push(...bulk)
    p.made.forged.push(forged)
    p.made.bulk += bulk.length
    return
  }
  const ground = p.grind === null ? null : locked.find(c => c.id === p.grind)!
  if (ground) {
    grindCard(ground)
    p.made.ground.push(ground)
  }
  toDiscard(p, locked.filter(c => c !== ground).map(c => c.id))
}

type SeatResult = RoundResultView

function emptyResult(m: Match, outcome: RoundResultView['outcome']): SeatResult {
  return {
    round: m.round, outcome, ko: false, wins: [0, 0], margin: 0,
    tally: { pot: 0, house: 0, ko: 0, momentum: 0, interest: 0, extras: 0, skip: 0 },
    forged: [], ground: [], bulk: 0, torn: [], stolen: null, robbed: null, bets: [],
  }
}

function settleRound(m: Match, emit: Emit): void {
  const results = new Map<SeatId, SeatResult>() // local to this call, never stored
  const doubled = new Set<SeatId>() // double or nothing was played at their table
  for (const pair of m.pairs) settlePair(m, pair, results, doubled)
  for (const p of m.players) if (p.alive && !results.has(p.seat)) results.set(p.seat, emptyResult(m, 'bye'))

  // bust check comes before income: $0 after the table is out. income first would mean the house +$2 keeps
  // everyone alive forever, and nobody could bust a rival (V2.md §11)
  for (const p of m.players) {
    if (!p.alive || p.bankroll > 0) continue
    bust(m, p, emit)
  }
  for (const p of m.players) {
    const r = results.get(p.seat)
    if (!r) continue
    if (p.alive) payIncome(m, p, r, doubled.has(p.seat) ? 2 : 1)
    const made = p.made
    Object.assign(r, { forged: made.forged, ground: made.ground, bulk: made.bulk, torn: made.torn })
  }
  // solo: bust the rival and its table ends here. every round you skip pays 2× its ante, and the round counter jumps
  const round = m.round
  const you = m.players[0]
  if (isSolo(m) && you.alive && !m.players[1].alive && !isTournament(round)) {
    const end = Math.ceil(round / ROUNDS_PER_TABLE) * ROUNDS_PER_TABLE
    let skip = 0
    for (let r = round + 1; r <= end; r++) skip += SKIP_BONUS * (blinds(r).ante + you.rules.anteBonus)
    you.bankroll += skip
    results.get(0)!.tally.skip = skip
    m.round = end
  }
  for (const p of m.players) {
    const r = results.get(p.seat)
    if (!r) continue
    p.last = r
    emit.push({ to: p.seat, event: { kind: 'roundEnd', result: r } })
  }
  for (const p of m.players) cleanup(p)

  if (isOver(m)) return finish(m, emit)
  const last = lastRound(m)
  if (last !== null && m.round >= last) {
    // after round 12: le patron's final payment settles it
    for (const p of m.players) if (p.alive && p.owes) collect(m, p, markerFor(tableOf(last))!, emit)
    return finish(m, emit)
  }
  enterSpoils(m)
}

// the round's money for one pair: the pot and max bets, card money (once per round), and card growth
function settlePair(m: Match, pair: Pair, results: Map<SeatId, SeatResult>, doubled: Set<SeatId>): void {
  const b = pair.betting!
  const ps = pair.seats.map(s => seat(m, s)) as [Player, Player]
  const winner = roundWinner(m, pair)
  const plays = (pos: Pos, joker: JokerId) => ps[pos].jokers.includes(joker)
  // poker face: played in a round you lose, your max bet comes back
  const keepMax = [0, 1].map(pos => winner !== null && pos !== winner && plays(pos as Pos, 'bluff')) as [boolean, boolean]
  const delta = settle(b, winner, keepMax)
  if (winner !== null) {
    const loser = other(winner)
    // double down: the house matches the pot
    if (twistFor(m)?.id === 'doubledown') delta[winner] += b.stake
    // double or nothing (either side played it): the loser pays again as far as their bankroll goes, the house doubles its share
    if (plays(0, 'double') || plays(1, 'double')) {
      for (const s of pair.seats) doubled.add(s)
      const extra = Math.min(-delta[loser], ps[loser].bankroll + delta[loser])
      delta[loser] -= extra
      delta[winner] += extra + (b.onMax[winner] ? b.extra : 0)
    }
  }
  const { wins, totals } = roundScore(pair)
  const lastHand = pair.hands.at(-1)!
  for (const pos of [0, 1] as Pos[]) {
    const p = ps[pos]
    const them = other(pos)
    const r = emptyResult(m, winner === null ? 'tie' : winner === pos ? 'win' : 'loss')
    r.ko = lastHand.ko && winner === pos
    r.wins = [wins[pos], wins[them]]
    r.margin = totals[pos] - totals[them]
    // gold border: once per round, played in any hand: a side bet that settles on the round
    const golds = [...p.hand, ...p.pile, ...p.discard].some(c => c.stamp === 'gold' && p.played.includes(c.id)) ? 1 : 0
    const twice = doubled.has(p.seat) ? 2 : 1
    const gold = winner === null ? 0 : (winner === pos ? 1 : -1) * GOLD_BORDER * golds * twice
    r.tally.pot = delta[pos]
    r.tally.extras = gold
    r.bets = b.log.map(l => ({ seat: pair.seats[l.pos], choice: l.action, stage: l.stage, amount: b.stake + (l.action === 'max' ? b.extra : 0) }))
    p.bankroll = Math.max(0, p.bankroll + delta[pos] + gold)
    results.set(p.seat, r)
  }
  // sticky fingers: the round winner takes a random card out of the loser's deck
  if (winner !== null && plays(winner, 'sticky')) {
    const thief = ps[winner]
    const mark = ps[other(winner)]
    const pool = [...mark.hand, ...mark.pile, ...mark.discard].sort((a, b) => a.id - b.id)
    if (pool.length > 0) {
      const card = pick(thief.rng.table, pool)
      for (const from of [mark.hand, mark.pile, mark.discard]) if (from.includes(card)) from.splice(from.indexOf(card), 1)
      // a joker past the cap goes to the binder, like one from a pack
      if (card.joker && deckJokers(thief) >= MAX_JOKERS) thief.binder.push(card)
      else thief.discard.push(card)
      results.get(thief.seat)!.stolen = card
      results.get(mark.seat)!.robbed = card
    }
  }
}

// house: +$2 to everyone who played, the winner 2× ante, +1× for a knockout, momentum at the boss. interest on top
// x = 2 when double or nothing was played: everything the round pays is doubled (interest isn't the round's)
function payIncome(m: Match, p: Player, r: SeatResult, x: number): void {
  const at = pairOf(m, p.seat)
  if (at) {
    const ante = pairBlinds(m, at.pair.seats).ante
    const win = r.outcome === 'win'
    r.tally.house = x * (HOUSE_FLAT + (win ? HOUSE_BONUS * ante : 0))
    r.tally.ko = win && r.ko ? x * KO_BONUS * ante : 0
    r.tally.momentum = win && isTournament(m.round) ? x * Math.min(MOMENTUM_MAX, p.tableWins) * ante : 0
    const sticker = win && hasCollectible(p.display, 'price_sticker') ? 1 : 0
    r.tally.extras += sticker
    p.bankroll += r.tally.house + r.tally.ko + r.tally.momentum + sticker
    if (win) p.tableWins++
  }
  r.tally.interest = interest(p.bankroll, p.sleeves.includes('deep_pockets') ? 4 : 2)
  p.bankroll += r.tally.interest
}

function bust(m: Match, p: Player, emit: Emit): void {
  p.bustBank = p.bankroll
  p.bankroll = 0
  p.alive = false
  p.bustRound = m.round
  emit.push({ to: 'all', event: { kind: 'busted', seat: p.seat } })
}

// le patron collects. can't cover it, or it leaves you at $0, and you're out
function collect(m: Match, p: Player, due: number, emit: Emit): void {
  const paid = p.bankroll >= due
  emit.push({ to: 'all', event: { kind: 'patron', seat: p.seat, due, paid } })
  if (!paid) return bust(m, p, emit)
  p.bankroll -= due
  if (p.bankroll === 0 && lastRound(m) !== m.round) bust(m, p, emit)
}

// solo: you're out. duel: someone's out. battle royale: one left standing
function isOver(m: Match): boolean {
  if (isSolo(m)) return !m.players[0].alive
  const alive = m.players.filter(p => p.alive).length
  return m.config.mode === 'duel' ? alive < 2 : alive <= 1
}

function finish(m: Match, emit: Emit): void {
  m.phase = 'over'
  m.pairs = []
  m.result = scoreMatch(m)
  emit.push({ to: 'all', event: { kind: 'matchOver', result: m.result } })
}

// 3 cards on the table after every round but the last. the loser picks first (a tie: the lower bankroll),
// then the winner, and the last card burns. a table where someone busted has no spoils
function enterSpoils(m: Match): void {
  m.phase = 'spoils'
  for (const p of m.players) p.done = true
  for (const pair of m.pairs) {
    const ps = pair.seats.map(s => seat(m, s)) as [Player, Player]
    if (!ps[0].alive || !ps[1].alive) continue
    const rng = makeRng(`${m.config.seed}:${m.round}:spoils:${pair.seats.join('-')}`)
    const cards = Array.from({ length: SPOILS_CARDS }, () => spoilsCard(m, rng, m.round))
    const winner = roundWinner(m, pair)
    let first: Pos
    if (winner !== null) first = other(winner)
    else if (ps[0].bankroll !== ps[1].bankroll) first = ps[0].bankroll < ps[1].bankroll ? 0 : 1
    else first = other(firstToAct([ps[0].bankroll, ps[1].bankroll], m.round))
    pair.spoils = { cards, order: [first, other(first)], next: 0, picks: [] }
  }
}

// the round is over: on to the next shop. big between tables (le patron collects at the door), small otherwise
function nextShop(m: Match, emit: Emit): void {
  m.round++
  enterShop(m, emit)
}

function enterShop(m: Match, emit: Emit): void {
  m.phase = 'shop'
  m.pairs = []
  const kind: ShopKind = isTableStart(m.round) ? 'big' : 'small'
  // a table's 1st small shop has the grading desk, its 2nd the bulk bin. the big shop has both
  const services = { grading: kind === 'big' || m.round % ROUNDS_PER_TABLE === 2, bulkBin: kind === 'big' || m.round % ROUNDS_PER_TABLE === 0 }
  for (const p of m.players) {
    p.done = !p.alive
    p.rng.shop = makeRng(`${m.config.seed}:${m.round}:${p.seat}:shop`)
    p.shop = null
    if (!p.alive) continue
    if (kind === 'big' && p.owes) {
      const due = markerFor(tableOf(m.round) - 1)
      if (due !== null) collect(m, p, due, emit)
      if (!p.alive) {
        p.done = true
        continue
      }
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
    // a solo rival doesn't shop
    if (isSolo(m) && p.seat === 1) {
      p.done = true
      continue
    }
    const pochette = kind === 'big' ? sleeveOffer(m.config.seed, m.round, p.sleeves) : null
    const shop = newShop(p.rng.shop, p.mem, p.display, kind, pochette, keeperPriceAdj(m))
    p.shop = { ...shop, shipped: false, open: null, services }
  }
  if (isOver(m)) return finish(m, emit)
  // solo: the next table's rival sits down, and the scouting report shows it
  if (isSolo(m) && kind === 'big') sitRival(m, tableOf(m.round), emit)
}

// solo/daily: you win by paying le patron's final payment. score = your bankroll after it × difficulty.
// duel: both paid → the higher bankroll. battle royale: last one standing. placement by bust order
function scoreMatch(m: Match): MatchResult {
  const order = m.players.slice().sort((a, b) =>
    Number(b.alive) - Number(a.alive) || b.bankroll - a.bankroll || (b.bustRound ?? 0) - (a.bustRound ?? 0) || b.bustBank - a.bustBank || a.seat - b.seat)
  const placement = order.map(p => p.seat)
  const scores = new Array<number>(m.players.length).fill(0)
  if (isSolo(m)) {
    const you = m.players[0]
    if (you.alive) scores[0] = Math.round(you.bankroll * DIFFICULTIES[m.config.seats[1].difficulty ?? 'medium'].scoreMult)
    return { placement: you.alive ? [0, 1] : [1, 0], scores, winner: you.alive ? 0 : 1 }
  }
  placement.forEach((s, i) => (scores[s] = m.players.length - 1 - i))
  if (m.config.mode === 'duel') {
    const [a, b] = order
    const tied = a.alive === b.alive && a.bankroll === b.bankroll && a.bustRound === b.bustRound && a.bustBank === b.bustBank
    return { placement, scores, winner: tied ? null : a.seat }
  }
  const alive = m.players.filter(p => p.alive)
  return { placement, scores, winner: alive.length === 1 ? alive[0].seat : null }
}

// ---------- queries ----------

// who owes an action right now
export function pending(m: Match): SeatId[] {
  if (m.phase === 'over') return []
  if (m.phase === 'bet') return m.pairs.filter(pr => !pr.done && pr.betting && pr.betting.toAct !== null).map(pr => pr.seats[pr.betting!.toAct!])
  if (m.phase === 'spoils') return m.pairs.filter(pr => pr.spoils && pr.spoils.next < 2).map(pr => pr.seats[pr.spoils!.order[pr.spoils!.next]])
  return m.players.filter(p => !p.done).map(p => p.seat)
}

export function result(m: Match): MatchResult | null {
  return m.result
}

// what a timeout does: lock = the best play, bet = min, spoils = the best card, shop = leave
export function defaultAction(m: Match, s: SeatId): Action {
  const p = seat(m, s)
  if (!pending(m).includes(s)) throw new Error(`seat ${s} owes no action`)
  switch (m.phase) {
    case 'draft':
      return !p.starter ? { type: 'pickBox', box: p.draft!.offer[0] } : { type: 'draft', rows: autoDraft(p.draft!.rows!) }
    case 'shop':
      if (p.shop?.open) return { type: 'sortPack', toDeck: p.shop.open.cards.filter(defaultToDeck).map(c => c.id) }
      if (p.overflow) return { type: 'tossInsert', slot: SLEEVE_SLOTS }
      return { type: 'leaveShop' }
    case 'deal':
      if (p.forge && !p.forge.keep) return { type: 'forgeKeep', traits: autoKeep(forgePlan(lockedCards(p))!) }
      return { type: 'play', cardIds: bestPlay(m, p).played.map(c => c.id) }
    case 'bet':
      return { type: 'bet', choice: 'min' }
    case 'spoils': {
      const sp = pairOf(m, s)!.pair.spoils!
      return { type: 'spoils', cardId: sp.cards.reduce((b, c) => (spoilsWorth(c) > spoilsWorth(b) ? c : b)).id }
    }
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
    if (p.sleeve.length > SLEEVE_SLOTS) throw new Error(`seat ${p.seat} has ${p.sleeve.length} inserts up its Sleeve`)
    if (p.overflow && m.phase !== 'shop') throw new Error(`seat ${p.seat} carried a waiting insert out of the shop`)
    for (const id of p.locked ?? []) if (!p.hand.some(c => c.id === id)) throw new Error(`seat ${p.seat} locked ${id} outside its hand`)
    if (p.hand.length > 0 && m.phase !== 'deal' && m.phase !== 'bet') throw new Error(`seat ${p.seat} holds cards in ${m.phase}`)
  }
  for (const pair of m.pairs) for (const c of pair.spoils?.cards ?? []) place(c, `spoils ${pair.seats.join('-')}`)
  if (m.phase !== 'over' && pending(m).length === 0) throw new Error(`nobody owes an action in ${m.phase}`)
  if (m.phase === 'bet' && m.pairs.some(pr => !pr.done && !pr.betting)) throw new Error('a pair is betting without a betting state')
}

// ---------- the view: the only thing that leaves the server ----------

const sortCards = (cards: Card[]) => pileView(cards).cards

export function view(m: Match, s: SeatId): SeatView {
  const p = seat(m, s)
  const at = pairOf(m, s)
  const pos = at?.pos ?? 0
  const them = at ? seat(m, at.pair.seats[1 - pos]) : null
  const b = at?.pair.betting ?? null
  let bet: BetView | null = null
  if (at && b && them && (m.phase === 'deal' || m.phase === 'bet')) {
    const myTurn = m.phase === 'bet' && b.toAct === pos
    bet = {
      opponent: them.seat,
      first: at.pair.seats[b.first],
      toAct: b.toAct === null ? null : at.pair.seats[b.toAct],
      stage: b.stage,
      stake: b.stake,
      extra: b.extra,
      canMax: b.canMax[pos],
      onMax: [b.onMax[pos], b.onMax[1 - pos]],
      choices: b.log.map(l => ({ seat: at.pair.seats[l.pos], choice: l.action, stage: l.stage, amount: b.stake + (l.action === 'max' ? b.extra : 0) })),
      options: myTurn ? legalActions(b) : [],
      why: {},
    }
  }
  let hands: HandsView | null = null
  if (at && them && (m.phase === 'deal' || m.phase === 'bet')) {
    const { wins, totals } = roundScore(at.pair)
    const mine = (h: HandRecord, x: Pos) => (h.plays[x].kind === 'play' ? h.plays[x].appraisal!.total : null)
    hands = {
      opponent: them.seat,
      hand: m.hand,
      knockout: knockoutAt(m.round),
      wins: [wins[pos], wins[1 - pos]],
      totals: [totals[pos], totals[1 - pos]],
      hands: at.pair.hands.map(h => ({
        hand: h.hand, winner: h.winner === null ? null : at.pair.seats[h.winner], ko: h.ko, mine: mine(h, pos), theirs: mine(h, other(pos)),
      })),
      done: at.pair.done,
    }
  }
  let spoils: SpoilsView | null = null
  const sp = at?.pair.spoils
  if (at && sp && m.phase === 'spoils') {
    spoils = {
      cards: sp.cards,
      first: at.pair.seats[sp.order[0]],
      toPick: sp.next < 2 ? at.pair.seats[sp.order[sp.next]] : null,
      picks: sp.picks.map(x => ({ seat: at.pair.seats[x.pos], card: x.card })),
    }
  }
  let scout: ScoutView | null = null
  if (isSolo(m) && m.phase === 'shop' && p.shop?.kind === 'big' && m.players[1].rival) {
    const r = m.players[1]
    const def = getRival(r.rival!)
    scout = { rival: def.id, name: def.name, lane: def.lane, leans: def.leans, display: r.display, deckSize: deckSize(r), stack: r.bankroll, twist: twistFor(m, Math.ceil(m.round / ROUNDS_PER_TABLE) * ROUNDS_PER_TABLE) }
  }
  const blindsNow = at ? pairBlinds(m, at.pair.seats) : pairBlinds(m, [s])
  const nextR = TOURNAMENT_ROUNDS.find(r => r >= m.round)
  const shop = p.shop
  const plan = p.forge && !p.forge.keep ? forgePlan(lockedCards(p)) : null
  const markerTable = tableOf(m.round)
  const due = p.owes && p.alive ? markerFor(markerTable) : null
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
      lockKind: p.lockKind,
      handSize: handSize(p),
      discardsLeft: discardsLeft(m, p),
      sleeve: p.sleeve,
      overflow: p.overflow,
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
        kind: shop.kind,
        offers: shop.offers,
        restockPrice: restockPrice(shop, freeRestocks(m, p)),
        services: shop.services,
        bulkPrice: bulkPrice(p),
        bulkInDeck: [...p.pile, ...p.discard].filter(c => c.bulk).length,
        shipped: shop.shipped,
        open: shop.open,
      } : null,
      forge: plan,
      marker: due !== null ? { due, table: markerTable } : null,
      done: !pending(m).includes(s),
    },
    others: m.players.filter(o => o.seat !== s).map(o => ({
      seat: o.seat,
      name: o.name,
      kind: o.kind,
      bankroll: o.bankroll,
      alive: o.alive,
      handSize: o.hand.length,
      discards: o.discards,
      sleeve: o.sleeve.length + (o.overflow ? 1 : 0),
      // marked knockoffs are face up once they're locked in
      marked: o.locked ? lockedCards(o).filter(c => c.knockoff?.kind === 'marked') : [],
      deckSize: deckSize(o),
      display: o.display,
      sleeves: o.sleeves,
      rival: o.rival,
      done: !pending(m).includes(o.seat),
    })),
    hands,
    bet,
    showdown: m.phase === 'deal' || m.phase === 'bet' || m.phase === 'spoils' || m.phase === 'shop' || m.phase === 'over' ? p.showdown : null,
    spoils,
    scout,
    last: p.last,
    result: m.result,
  }
}

// the bot policy lives in bot.ts. re-exported so the server only needs this module
export { botAction } from './bot.ts'
