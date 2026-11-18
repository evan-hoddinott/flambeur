// betting for one pair of seats over a round. positions 0/1 are the pair's two seats (match.ts maps them to seat ids).
// no fold. both seats ante the min into the pot, the round's winner takes it. after locking hand 1 each seat picks
// min or max: max bets (max − min) more on yourself. win the round and the house pays it, lose and your rival takes it.
// after locking hand 3 anyone still on min may push to max. the richer seat picks first, the other sees it
export type Pos = 0 | 1
export type BetAction = 'min' | 'max'
export type BetStage = 'open' | 'push'

export type Betting = {
  first: Pos
  stake: number // what each seat has in the pot: the ante, or less when someone can't cover it (all-in)
  extra: number // what a max puts on yourself, max − ante
  canMax: [boolean, boolean] // can cover stake + extra
  onMax: [boolean, boolean]
  stage: BetStage | null // null = not betting right now
  toAct: Pos | null
  acted: [boolean, boolean] // this stage
  log: { pos: Pos; action: BetAction; stage: BetStage }[]
}

export const other = (p: Pos): Pos => (p === 0 ? 1 : 0)

// the richer player acts first so the underdog gets to see their bet. tie: the first seat goes first on odd rounds
export function firstToAct(bankrolls: [number, number], round: number): Pos {
  if (bankrolls[0] > bankrolls[1]) return 0
  if (bankrolls[1] > bankrolls[0]) return 1
  return round % 2 === 1 ? 0 : 1
}

// allMax = high stakes: everyone who can cover it is on max, nobody gets asked
export function startBetting(first: Pos, ante: number, max: number, bankrolls: [number, number], allMax = false): Betting {
  if (bankrolls[0] <= 0 || bankrolls[1] <= 0) throw new Error('betting with an empty bankroll')
  const stake = Math.min(ante, bankrolls[0], bankrolls[1])
  const extra = Math.max(0, max - ante)
  const canMax = [0, 1].map(p => extra > 0 && bankrolls[p] >= stake + extra) as [boolean, boolean]
  return {
    first, stake, extra, canMax,
    onMax: allMax ? [canMax[0], canMax[1]] : [false, false],
    stage: null, toAct: null, acted: [false, false], log: [],
  }
}

// who still has a choice in this stage: anyone who can max and isn't on it yet
function eligible(b: Betting, pos: Pos): boolean {
  return b.canMax[pos] && !b.onMax[pos] && !b.acted[pos]
}

function nextToAct(b: Betting): Pos | null {
  for (const pos of [b.first, other(b.first)]) if (eligible(b, pos)) return pos
  return null
}

// opens a betting stage. returns the betting unchanged (stage null) if nobody has a choice to make
export function openStage(b: Betting, stage: BetStage): Betting {
  const next: Betting = { ...b, acted: [false, false], stage }
  next.toAct = nextToAct(next)
  if (next.toAct === null) next.stage = null
  return next
}

export function legalActions(b: Betting): BetAction[] {
  if (b.toAct === null) return []
  return ['min', 'max']
}

export function act(b: Betting, action: BetAction): Betting {
  if (b.toAct === null || b.stage === null) throw new Error('nobody is betting')
  if (!legalActions(b).includes(action)) throw new Error(`illegal bet ${action}`)
  const pos = b.toAct
  const next: Betting = { ...b, onMax: [...b.onMax], acted: [...b.acted], log: [...b.log, { pos, action, stage: b.stage }] }
  next.acted[pos] = true
  if (action === 'max') next.onMax[pos] = true
  next.toAct = nextToAct(next)
  if (next.toAct === null) next.stage = null
  return next
}

// what a seat has riding: the stake, plus its max bet
export function riding(b: Betting, pos: Pos): number {
  return b.stake + (b.onMax[pos] ? b.extra : 0)
}

// money each position gains (negative = loses). winner null = tie round, everything comes back.
// the winner takes the loser's stake and max, and the house pays the winner's own max.
// keepMax = the loser's max comes back (poker face)
export function settle(b: Betting, winner: Pos | null, keepMax: [boolean, boolean] = [false, false]): [number, number] {
  if (winner === null) return [0, 0]
  const loser = other(winner)
  const lost = b.stake + (b.onMax[loser] && !keepMax[loser] ? b.extra : 0)
  const out: [number, number] = [0, 0]
  out[winner] = lost + (b.onMax[winner] ? b.extra : 0)
  out[loser] = -lost
  return out
}
