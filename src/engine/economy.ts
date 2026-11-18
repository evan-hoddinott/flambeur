export const ROUNDS = 12 // solo/daily end here. duels and battle royale keep going in sudden death until someone busts
export const START_BANKROLL = 15
export const PAYCHECK = 2 // only if you went to showdown: folding and forging don't get paid
export const HOUSE_BONUS = 2 // the house pays the showdown winner this many antes on top of the pot
export const HAND_SIZE = 8
export const PLAY_SIZE = 5 // lock in 1 to this many
export const ROUNDS_PER_TABLE = 3
export const DISPLAY_SLOTS = 5
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
  // 10-12 are first-pass, ~+25% a round like 7-9. tune from the sim
  { ante: 18, max: 36 },
  { ante: 22, max: 44 },
  { ante: 27, max: 54 },
]

// past round 12 (bust-only modes) every round is sudden death: forced showdown, the ante doubles each round
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

// +$1 per $10 held, max +$2 (Deep Pockets sleeve: +$4)
export function interest(bankroll: number, cap = 2): number {
  return Math.min(cap, Math.floor(Math.max(0, bankroll) / 10))
}

// boss house bonus: 2× ante plus 1× ante per showdown you won earlier in the table, max +2
export const MOMENTUM_MAX = 2
export const GOLD_BORDER = 3 // side bet per gold border card played: +$3 on a showdown win, −$3 on a loss
export const SLEEVE_PRICE = 10
export const BULK_BIN_PRICE = 2 // then $3, $4... for the rest of the run
export const STONKS_MULT = { rank: 3, suit: 3, finish: 2 } as const

// which table a round belongs to, 1..3
export function tableOf(round: number): number {
  return Math.ceil(round / ROUNDS_PER_TABLE)
}

export function isTableStart(round: number): boolean {
  return round % ROUNDS_PER_TABLE === 1
}

// streak > 0 is wins in a row, < 0 is losses in a row. both pay, max +$3
export function streakBonus(streak: number): number {
  return Math.min(3, Math.abs(streak))
}

export const PACK_PRICE = { free: 0, offbrand: 3, repack: 4, collector: 6 } as const
export const COLLECTIBLE_PRICE = { common: 4, uncommon: 6, rare: 9 } as const
export const SCRATCHER_PRICE = 3
// the grading desk. the card is away one round and comes back graded at the next shop.
// safe = a 1–3 (damaged in shipping) can't happen, it comes back at least a 4
export type Shipper = 'poste' | 'chrono' | 'fourgon'
export const SHIPPERS: Record<Shipper, { name: string; price: number; rolls: number; safe: boolean; text: string }> = {
  poste: { name: 'La Poste', price: 2, rolls: 1, safe: false, text: 'A 1–3 comes back damaged' },
  chrono: { name: 'Chronopost', price: 4, rolls: 1, safe: true, text: 'Never damaged in shipping' },
  fourgon: { name: 'Fourgon blindé', price: 7, rolls: 2, safe: true, text: 'Rolls twice, keeps the better. Never damaged' },
}
