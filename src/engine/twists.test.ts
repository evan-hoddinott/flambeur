// betting, tournament rounds, twists and how a match ends. expected numbers are hand-computed
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newCard, type Card, type Suit } from './cards.ts'
import { appraise, emptyLevels } from './scoring.ts'
import { act, legalActions, settle, startBetting } from './betting.ts'
import { blinds, HOUSE_BONUS, PAYCHECK } from './economy.ts'
import { rollTwists, type Twist } from './twists.ts'
import { defaultAction, newMatch, pairBlinds, pending, problem, showdownWinner, step, twistFor, type Match, type MatchConfig, type PhaseKind } from './match.ts'

const ids = { nextCardId: 1 }
const c = (rank: number, suit: Suit, extra: Partial<Card> = {}) => newCard(ids, rank, suit, extra)
const kings = () => [c(13, 'S'), c(13, 'H'), c(2, 'D'), c(5, 'C'), c(9, 'S')]
const score = (cards: Card[], twist: Twist | null, display = [{ id: 'penny_sleeve', param: null }]) =>
  appraise(cards, { levels: emptyLevels(), display, displaySlots: 5, deckSize: 24, bankroll: 20, ante: 2, betMax: false, twist, rng: null })

const duel = (seed: string, mode: MatchConfig['mode'] = 'duel'): MatchConfig => ({
  mode, seed, seats: [{ kind: mode === 'duel' ? 'bot' : 'human', name: 'a', difficulty: 'medium' }, { kind: 'bot', name: 'b', difficulty: 'medium' }],
})

// timeout defaults until the match reaches this phase (and round). defaults bet min and always show down
function drive(m: Match, phase: PhaseKind, round = m.round): Match {
  for (let guard = 0; !(m.phase === phase && m.round === round); guard++) {
    if (guard > 5000 || m.phase === 'over') throw new Error(`never reached ${phase} in round ${round}`)
    const s = pending(m)[0]
    m = step(m, s, defaultAction(m, s)).match
  }
  return m
}

test('four buttons: min/min shows down, min/max gives the first player match or fold', () => {
  let b = startBetting(0, 2, 5, [20, 20], [false, false])
  assert.deepEqual(legalActions(b), ['fold', 'min', 'max'])
  b = act(b, 'min')
  assert.deepEqual(legalActions(b), ['fold', 'min', 'max'])
  assert.equal(act(b, 'min').outcome?.kind, 'showdown')
  b = act(b, 'max')
  assert.deepEqual(legalActions(b), ['match', 'fold'])
  b = act(b, 'match')
  assert.deepEqual(b.committed, [5, 5])
  assert.equal(b.outcome?.kind, 'showdown')
})

test('against a max the second player can fold, forge or max (match), never min', () => {
  const b = act(startBetting(0, 2, 5, [20, 20], [true, true]), 'max')
  assert.deepEqual(legalActions(b), ['fold', 'forge', 'max'])
})

test('forced betting: no fold or forge, min → max → match goes to showdown', () => {
  let b = startBetting(0, 4, 8, [20, 20], [true, true], true)
  assert.deepEqual(legalActions(b), ['min', 'max'])
  b = act(b, 'min')
  assert.deepEqual(legalActions(b), ['min', 'max'])
  b = act(b, 'max')
  assert.deepEqual(legalActions(b), ['match'])
  b = act(b, 'match')
  assert.equal(b.outcome?.kind, 'showdown')
})

test('forge costs the max ($5), the min ($2) when 2× behind, and is not offered if it would bust you', () => {
  const even = act(startBetting(0, 2, 5, [20, 20], [true, true]), 'forge')
  assert.deepEqual(settle(even, null), [-5, 5])
  // $8 vs $20: 8 × 2 = 16 <= 20, the underdog forges for the min
  const under = act(startBetting(0, 2, 5, [8, 20], [true, true]), 'forge')
  assert.deepEqual(settle(under, null), [-2, 2])
  // $5 vs $6: the max is capped at $5, nobody is 2× behind, paying $5 would bust seat 0 so it can't forge
  assert.deepEqual(startBetting(0, 2, 5, [5, 6], [true, true]).canForge, [false, true])
})

test('a fold costs what you put in: fold after a raise = the $2 min', () => {
  const b = act(act(act(startBetting(0, 2, 5, [20, 20], [false, false]), 'min'), 'max'), 'fold')
  assert.deepEqual(settle(b, null), [-2, 2])
})

test('sealed only: pair of kings + Lucky Penny scores (10 + 10 + 10) × 2 = 60, not × 6', () => {
  assert.equal(score(kings(), null).total, 30 * 6)
  assert.equal(score(kings(), { id: 'sealed', suit: null }).total, 60)
})

test('face cards don\'t score: pair of kings is still a pair, but only the base: 10 × 2 = 20', () => {
  const a = score(kings(), { id: 'faceless', suit: null }, [])
  assert.equal(a.hand, 'pair')
  assert.equal(a.total, 20)
})

test('ban wave ♠: K♠ K♥ pair scores 10 + 10 (K♥ only) = 20 × 2 = 40', () => {
  assert.equal(score(kings(), { id: 'banwave', suit: 'S' }, []).total, 40)
})

test('hype freeze: Lucky Penny +4 Hype is ignored, holo too: 30 × 2 = 60', () => {
  const hand = [c(13, 'S', { finish: 'holo' }), c(13, 'H'), c(2, 'D'), c(5, 'C'), c(9, 'S')]
  assert.equal(score(hand, { id: 'hypefreeze', suit: null }).total, 60)
})

test('lowball: lower appraisal wins the showdown, only on its round', () => {
  const m = newMatch(duel('low'))
  m.round = 3
  m.twists[0] = { id: 'lowball', suit: null }
  assert.equal(showdownWinner(m, 100, 500), 0)
  m.round = 4
  assert.equal(showdownWinner(m, 100, 500), 1)
})

test('high stakes: round 3 min becomes the max ($8 / $8), cold deck: mulligans are refused', () => {
  const hs = newMatch(duel('hs'))
  hs.round = 3
  hs.twists[0] = { id: 'highstakes', suit: null }
  assert.deepEqual(pairBlinds(hs, [0, 1]), { ante: 8, max: 8 })
  const m = drive(newMatch(duel('cd')), 'deal')
  m.round = 3
  m.twists[0] = { id: 'colddeck', suit: null }
  assert.equal(problem(m, 0, { type: 'mulligan', cardIds: [m.players[0].hand[0].id] }), 'cold deck: no mulligans')
})

test('double down: the round 3 winner takes the ante twice, the loser pays it once', () => {
  let m = drive(newMatch(duel('dd')), 'deal', 3)
  m.twists[0] = { id: 'doubledown', suit: null }
  const ante = pairBlinds(m, [0, 1]).ante
  m = drive(m, 'shop', 4)
  const [a, b] = m.players.map(p => p.last!)
  assert.notEqual(a.outcome, 'tie')
  const win = a.outcome === 'win' ? a : b
  const lose = a.outcome === 'win' ? b : a
  assert.equal(win.tally.pot, 2 * ante)
  assert.equal(lose.tally.pot, -ante)
})

test('twists: 4 different ones per seed, same seed same twists, only on rounds 3/6/9/12', () => {
  const a = rollTwists('seed-a')
  assert.equal(a.length, 4)
  assert.equal(new Set(a.map(t => t.id)).size, 4)
  assert.deepEqual(rollTwists('seed-a'), a)
  const m = newMatch(duel('seed-a'))
  assert.equal(twistFor(m, 2), null)
  assert.deepEqual(twistFor(m, 12), a[3])
})

test('income: a round 2 showdown win pays house = paycheck 2 + 2 × ante', () => {
  let m = drive(newMatch(duel('pay')), 'deal', 2)
  const ante = pairBlinds(m, [0, 1]).ante
  m = drive(m, 'shop', 3)
  const won = m.players.map(p => p.last!).find(r => r.outcome === 'win')
  assert.ok(won, 'defaults always show down, someone wins unless it tied')
  assert.equal(won.tally.house, PAYCHECK + HOUSE_BONUS * ante)
})

test('sudden death: round 13 ante 27 × 2 = 54, round 14 108. solo never goes past 12', () => {
  assert.deepEqual(blinds(13), { ante: 54, max: 108 })
  assert.deepEqual(blinds(14), { ante: 108, max: 216 })
  let m = newMatch(duel('end', 'solo'))
  for (let guard = 0; m.phase !== 'over'; guard++) {
    if (guard > 5000) throw new Error('solo never ended')
    m = step(m, pending(m)[0], defaultAction(m, pending(m)[0])).match
  }
  assert.ok(m.round <= 12)
  assert.ok(m.result)
})
