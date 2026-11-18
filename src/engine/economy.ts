export const ROUNDS = 12 // solo, daily and duel end here with Le Patron's final payment. battle royale keeps going in sudden death
export const START_BANKROLL = 20
export const HAND_SIZE = 8
export const PLAY_SIZE = 5 // lock in 1 to this many
export const HANDS_PER_ROUND = 3 // best of 3
export const WINS_NEEDED = 2
export const DISCARDS = 3 // per round, toss 1-5 and draw that many (classic: 4)
export const ROUNDS_PER_TABLE = 3
export const DISPLAY_SLOTS = 5
export const SLEEVE_SLOTS = 2 // the Sleeve: inserts held for later
export const TOURNAMENT_ROUNDS: readonly number[] = [3, 6, 9, 12]

// ante is the min stake, max is the max stake. index = round - 1
export const BLINDS: readonly { ante: number; max: number }[] = [
  { ante: 2, max: 5 },
  { ante: 3, max: 6 },
  { ante: 4, max: 8 },
  { ante: 5, max: 10 },
  { ante: 6, max: 12 },
  { ante: 8, max: 16 },
  { ante: 10, max: 20 },
  { ante: 12, max: 25 },
  { ante: 15, max: 30 },
  { ante: 18, max: 36 },
  { ante: 22, max: 44 },
  { ante: 27, max: 54 },
]

// past round 12 (battle royale) every round is sudden death: the ante doubles each round
export function isSuddenDeath(round: number): boolean {
  return round > ROUNDS
}

export function blinds(round: number): { ante: number; max: number } {
  if (!Number.isInteger(round) || round < 1) throw new Error(`no blinds for round ${round}`)
  if (!isSuddenDeath(round)) return BLINDS[round - 1]
  let ante = BLINDS[ROUNDS - 1].ante
  for (let r = ROUNDS; r < round; r++) ante *= 2 // integer doubling, no Math.pow in the engine
  return { ante, max: ante * 2 }
}

// which table a round belongs to, 1..4 (5+ in sudden death)
export function tableOf(round: number): number {
  return Math.ceil(round / ROUNDS_PER_TABLE)
}

export function isTableStart(round: number): boolean {
  return round % ROUNDS_PER_TABLE === 1
}

// win a hand by K× or more and the round ends there. table 1..4, sudden death stays at the last one
export const KNOCKOUT: readonly number[] = [6, 8, 10, 12]

export function knockoutAt(round: number): number {
  return KNOCKOUT[Math.min(tableOf(round), KNOCKOUT.length) - 1]
}

// the house pays both seats every round, the winner more. all of it comes from the house, same rule in multiplayer
export const HOUSE_FLAT = 2 // both seats, every round
export const HOUSE_BONUS = 2 // the round winner, × ante
export const KO_BONUS = 1 // winning by knockout, × ante
export const MOMENTUM_MAX = 2 // at the boss: +1× ante per round won earlier this table, max +2
export const SKIP_BONUS = 2 // busting a solo rival: × ante for every round of its table you skip
export const TEAR_CHANCE = 0.25 // a damaged card that scores tears for good
export const GOLD_BORDER = 3 // once per round, a gold border played in any hand: +$3 if you win the round, −$3 if you lose

// +$1 per $10 held, max +$2 (Deep Pockets pochette: +$4)
export function interest(bankroll: number, cap = 2): number {
  return Math.min(cap, Math.floor(Math.max(0, bankroll) / 10))
}

// le patron's marker, due at the door of the big shop after each table. the last one settles up after round 12
export const MARKER: readonly number[] = [6, 15, 30, 60]

export function markerFor(table: number): number | null {
  return MARKER[table - 1] ?? null
}

// solo rivals sit down with a fresh stack every table
export const RIVAL_STACKS: readonly number[] = [20, 40, 70, 120]

// spoils: 3 cards on the table after every round but the last
export const SPOILS_CARDS = 3
export const SPOILS_SKIP = 1 // skip your pick for +$1
export const SPOILS_ODDS = { finish: 0.1, stamp: 0.05, variant: 0.03 } as const

export const POCHETTE_PRICE = 10 // the big shop's pochette, a run-wide upgrade (code: sleeve)
export const BULK_BIN_PRICE = 2 // then $3, $4... for the rest of the run
export const STONKS_MULT = { rank: 3, suit: 3, finish: 2 } as const

export const PACK_PRICE = { offbrand: 3, repack: 4, collector: 6 } as const
export const COLLECTIBLE_PRICE = { common: 4, uncommon: 6, rare: 9 } as const
export const SCRATCHER_PRICE = 3

// the grading desk. the card is away until the next shop and comes back graded.
// safe = a 1–3 (damaged in shipping) can't happen, it comes back at least a 4
export type Shipper = 'poste' | 'chrono' | 'fourgon'
export const SHIPPERS: Record<Shipper, { name: string; price: number; rolls: number; safe: boolean; text: string }> = {
  poste: { name: 'La Poste', price: 2, rolls: 1, safe: false, text: 'A 1–3 comes back damaged' },
  chrono: { name: 'Chronopost', price: 4, rolls: 1, safe: true, text: 'Never damaged in shipping' },
  fourgon: { name: 'Fourgon blindé', price: 7, rolls: 2, safe: true, text: 'Rolls twice, keeps the better. Never damaged' },
}
