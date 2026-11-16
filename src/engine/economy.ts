export const ROUNDS = 9
export const START_BANKROLL = 15
export const PAYCHECK = 2 // only if you went to showdown: folding and forging don't get paid
export const HOUSE_BONUS = 2 // the house pays the showdown winner this many antes on top of the pot
export const HAND_SIZE = 8
export const PLAY_SIZE = 5
export const DISPLAY_SLOTS = 5
export const TOURNAMENT_ROUNDS: readonly number[] = [3, 6, 9]

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
]

export function blinds(round: number): { ante: number; max: number } {
  const b = BLINDS[round - 1]
  if (!b) throw new Error(`no blinds for round ${round}`)
  return b
}

// +$1 per $10 held, max +$2
export function interest(bankroll: number): number {
  return Math.min(2, Math.floor(Math.max(0, bankroll) / 10))
}

// streak > 0 is wins in a row, < 0 is losses in a row. both pay, max +$3
export function streakBonus(streak: number): number {
  return Math.min(3, Math.abs(streak))
}

export const PACK_PRICE = { free: 0, offbrand: 3, repack: 4, collector: 6 } as const
export const COLLECTIBLE_PRICE = { common: 4, uncommon: 6, rare: 9 } as const
export const GRADING_PRICE = 3
