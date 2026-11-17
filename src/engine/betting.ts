export type Seat = 0 | 1 // 0 = you, 1 = opponent
export type BetAction = 'fold' | 'forge' | 'min' | 'max' | 'call' | 'raise'

export type Outcome =
  | { kind: 'fold'; by: Seat }
  | { kind: 'forge'; by: Seat }
  | { kind: 'showdown' }

export type Betting = {
  first: Seat
  toAct: Seat
  step: 1 | 2 | 3
  minStake: number
  maxStake: number
  committed: [number, number]
  firstBet: 'min' | 'max' | null
  canForge: [boolean, boolean] // from forgePlan on each seat's locked cards
  forced: boolean // tournament round: nobody can fold or forge, it always goes to showdown
  outcome: Outcome | null
  log: { seat: Seat; action: BetAction }[]
}

const other = (s: Seat): Seat => (s === 0 ? 1 : 0)

// the richer player acts first so the underdog gets to see their bet. tie: you go first on odd rounds
export function firstToAct(bankrolls: [number, number], round: number): Seat {
  if (bankrolls[0] > bankrolls[1]) return 0
  if (bankrolls[1] > bankrolls[0]) return 1
  return round % 2 === 1 ? 0 : 1
}

// behind by 2× or more gets to peek at one locked card
export function canPeek(seat: Seat, bankrolls: [number, number]): boolean {
  return bankrolls[seat] * 2 <= bankrolls[other(seat)]
}

// stakes are capped by whoever is poorer, so nobody can bet money that isn't there (all-in)
export function startBetting(
  first: Seat, ante: number, max: number, bankrolls: [number, number], canForge: [boolean, boolean], forced = false,
): Betting {
  if (bankrolls[0] <= 0 || bankrolls[1] <= 0) throw new Error('betting with an empty bankroll')
  const cap = Math.min(max, bankrolls[0], bankrolls[1])
  const minStake = Math.min(ante, cap)
  return {
    first,
    toAct: first,
    step: 1,
    minStake,
    maxStake: cap,
    committed: [minStake, minStake],
    firstBet: null,
    canForge: forced ? [false, false] : canForge,
    forced,
    outcome: null,
    log: [],
  }
}

export function legalActions(b: Betting): BetAction[] {
  if (b.outcome) return []
  const out: BetAction[] = b.forced ? [] : ['fold']
  if (b.step === 3) return b.forced ? ['call'] : ['call', 'fold']
  if (b.canForge[b.toAct]) out.push('forge')
  if (b.step === 1) {
    out.push('min')
    if (b.maxStake > b.minStake) out.push('max')
    return out
  }
  out.push('call')
  if (b.firstBet === 'min' && b.maxStake > b.minStake) out.push('raise')
  return out
}

export function act(b: Betting, action: BetAction): Betting {
  if (!legalActions(b).includes(action)) throw new Error(`illegal action ${action} at step ${b.step}`)
  const seat = b.toAct
  const next: Betting = { ...b, committed: [...b.committed], log: [...b.log, { seat, action }] }

  if (action === 'fold' || action === 'forge') {
    next.outcome = { kind: action, by: seat }
    return next
  }
  if (b.step === 1) {
    next.firstBet = action === 'max' ? 'max' : 'min'
    next.committed[seat] = action === 'max' ? b.maxStake : b.minStake
    next.toAct = other(seat)
    next.step = 2
    return next
  }
  if (b.step === 2 && action === 'raise') {
    next.committed[seat] = b.maxStake
    next.toAct = other(seat)
    next.step = 3
    return next
  }
  // call
  next.committed[seat] = next.committed[other(seat)]
  next.outcome = { kind: 'showdown' }
  return next
}

// a seat that got dealt no cards loses the round, same as folding at the ante. both empty = nobody pays
export function forfeit(b: Betting, by: Seat | null): Betting {
  if (b.outcome) throw new Error('forfeit after betting is done')
  return { ...b, outcome: by === null ? { kind: 'showdown' } : { kind: 'fold', by } }
}

// money each seat gains (negative = loses). winner = null on a showdown tie
export function settle(b: Betting, winner: Seat | null): [number, number] {
  if (!b.outcome) throw new Error('settling before betting is done')
  if (b.outcome.kind !== 'showdown') {
    const loser = b.outcome.by
    const amount = b.committed[loser]
    return loser === 0 ? [-amount, amount] : [amount, -amount]
  }
  if (b.committed[0] !== b.committed[1]) throw new Error('showdown with unmatched stakes')
  if (winner === null) return [0, 0]
  const stake = b.committed[0]
  return winner === 0 ? [stake, -stake] : [-stake, stake]
}
