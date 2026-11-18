// betting for one pair of seats. positions 0/1 are the pair's two seats (match.ts maps them to seat ids).
// both players get the same four buttons, fold / forge / min / max. the second player sees the first's choice.
// if one went max and the other min, the min player gets one prompt: match or fold
export type Pos = 0 | 1
export type BetAction = 'fold' | 'forge' | 'min' | 'max' | 'match'

export type Outcome =
  | { kind: 'fold'; by: Pos }
  | { kind: 'forge'; by: Pos }
  | { kind: 'showdown' }

export type Betting = {
  first: Pos
  toAct: Pos
  step: 1 | 2 | 3
  minStake: number
  maxStake: number
  committed: [number, number]
  firstBet: 'min' | 'max' | null
  canForge: [boolean, boolean] // a forgeable hand you can afford to forge
  forgePrice: [number, number] // the max, or the min when you're 2× behind
  forced: boolean // tournament / sudden death: nobody can fold or forge, it always goes to showdown
  outcome: Outcome | null
  log: { pos: Pos; action: BetAction }[]
}

export const other = (p: Pos): Pos => (p === 0 ? 1 : 0)

// the richer player acts first so the underdog gets to see their bet. tie: the first seat goes first on odd rounds
export function firstToAct(bankrolls: [number, number], round: number): Pos {
  if (bankrolls[0] > bankrolls[1]) return 0
  if (bankrolls[1] > bankrolls[0]) return 1
  return round % 2 === 1 ? 0 : 1
}

// behind by 2× or more: you peek at one of their locked cards and forging costs the min
export function isUnderdog(pos: Pos, bankrolls: [number, number]): boolean {
  return bankrolls[pos] * 2 <= bankrolls[other(pos)]
}

// stakes are capped by whoever is poorer, so nobody can bet money that isn't there (all-in).
// forging costs the max (paid to the other seat), the min for an underdog, and isn't offered if it would bust you
export function startBetting(
  first: Pos, ante: number, max: number, bankrolls: [number, number], forgeable: [boolean, boolean], forced = false,
): Betting {
  if (bankrolls[0] <= 0 || bankrolls[1] <= 0) throw new Error('betting with an empty bankroll')
  const cap = Math.min(max, bankrolls[0], bankrolls[1])
  const minStake = Math.min(ante, cap)
  const forgePrice: [number, number] = [0, 1].map(p => (isUnderdog(p as Pos, bankrolls) ? minStake : cap)) as [number, number]
  const canForge = [0, 1].map(p => !forced && forgeable[p] && forgePrice[p] < bankrolls[p]) as [boolean, boolean]
  return {
    first,
    toAct: first,
    step: 1,
    minStake,
    maxStake: cap,
    committed: [minStake, minStake],
    firstBet: null,
    canForge,
    forgePrice,
    forced,
    outcome: null,
    log: [],
  }
}

export function legalActions(b: Betting): BetAction[] {
  if (b.outcome) return []
  if (b.step === 3) return b.forced ? ['match'] : ['match', 'fold']
  const out: BetAction[] = b.forced ? [] : ['fold']
  if (b.canForge[b.toAct]) out.push('forge')
  const canMax = b.maxStake > b.minStake
  if (b.step === 1) {
    out.push('min')
    if (canMax) out.push('max')
    return out
  }
  // step 2: min only makes sense against a min, max is a call against max or a raise against min
  if (b.firstBet === 'min') out.push('min')
  if (b.firstBet === 'max' || canMax) out.push('max')
  return out
}

export function act(b: Betting, action: BetAction): Betting {
  if (!legalActions(b).includes(action)) throw new Error(`illegal bet ${action} at step ${b.step}`)
  const pos = b.toAct
  const next: Betting = { ...b, committed: [...b.committed], log: [...b.log, { pos, action }] }

  if (action === 'fold' || action === 'forge') {
    next.outcome = { kind: action, by: pos }
    return next
  }
  if (b.step === 1) {
    next.firstBet = action === 'max' ? 'max' : 'min'
    next.committed[pos] = action === 'max' ? b.maxStake : b.minStake
    next.toAct = other(pos)
    next.step = 2
    return next
  }
  if (b.step === 2 && action === 'max' && b.firstBet === 'min') {
    // raise: the first player now has to match or fold
    next.committed[pos] = b.maxStake
    next.toAct = other(pos)
    next.step = 3
    return next
  }
  // step 2 same as the first bet, or step 3 match
  next.committed[pos] = next.committed[other(pos)]
  next.outcome = { kind: 'showdown' }
  return next
}

// money each position gains (negative = loses). winner = null on a showdown tie (or both seats forfeiting).
// a fold costs what you've put in, a forge costs its forge price
export function settle(b: Betting, winner: Pos | null): [number, number] {
  if (!b.outcome) throw new Error('settling before betting is done')
  if (b.outcome.kind !== 'showdown') {
    const loser = b.outcome.by
    const amount = b.outcome.kind === 'forge' ? b.forgePrice[loser] : b.committed[loser]
    return loser === 0 ? [-amount, amount] : [amount, -amount]
  }
  if (b.committed[0] !== b.committed[1]) throw new Error('showdown with unmatched stakes')
  if (winner === null) return [0, 0]
  const stake = b.committed[0]
  return winner === 0 ? [stake, -stake] : [-stake, stake]
}

// a seat that got dealt no cards loses the round, same as folding at the ante. both empty = nobody pays
export function forfeit(b: Betting, by: Pos | null): Betting {
  if (b.outcome) throw new Error('forfeit after betting is done')
  return { ...b, outcome: by === null ? { kind: 'showdown' } : { kind: 'fold', by } }
}
