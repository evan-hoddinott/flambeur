// boss twists, income and how a match ends. expected numbers are hand-computed
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newCard, type Card, type Suit } from './cards.ts'
import { appraise, emptyLevels } from './scoring.ts'
import { blinds, HOUSE_BONUS, HOUSE_FLAT } from './economy.ts'
import { rollTwists, type Twist } from './twists.ts'
import { DEFAULT_RULES } from './starters.ts'
import { defaultAction, newMatch, pairBlinds, pending, problem, showdownWinner, step, twistFor, type Match, type MatchConfig, type PhaseKind } from './match.ts'

const ids = { nextCardId: 1 }
const c = (rank: number, suit: Suit, extra: Partial<Card> = {}) => newCard(ids, rank, suit, extra)
const kings = () => [c(13, 'S'), c(13, 'H'), c(2, 'D'), c(5, 'C'), c(9, 'S')]
const score = (cards: Card[], twist: Twist | null, display = [{ id: 'penny_sleeve', param: null }]) =>
  appraise(cards, { levels: emptyLevels(), display, displaySlots: 5, deckSize: 24, bankroll: 20, ante: 2, betMax: false, twist, rng: null })

const duel = (seed: string, mode: MatchConfig['mode'] = 'duel'): MatchConfig => ({
  mode, seed, seats: [{ kind: mode === 'duel' ? 'bot' : 'human', name: 'a', difficulty: 'medium' }, { kind: 'bot', name: 'b', difficulty: 'medium' }],
})

// timeout defaults until the match reaches this phase (and round). defaults bet min
function drive(m: Match, phase: PhaseKind, round = m.round): Match {
  for (let guard = 0; !(m.phase === phase && m.round === round); guard++) {
    if (guard > 5000 || m.phase === 'over') throw new Error(`never reached ${phase} in round ${round}`)
    const s = pending(m)[0]
    m = step(m, s, defaultAction(m, s)).match
  }
  return m
}

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

// both seats at a round 3 deal with plain rules, no case and $20
function boss(seed: string, twist: Twist): Match {
  const m = drive(newMatch(duel(seed)), 'deal')
  m.round = 3
  m.twists[0] = twist
  for (const p of m.players) {
    p.rules = { ...DEFAULT_RULES }
    p.display = []
    p.bankroll = 20
  }
  return m
}

test('high stakes: round 3 at $4 / $8, everyone who can cover the max is on it, nobody gets asked. cold deck: no discards', () => {
  let m = boss('hs', { id: 'highstakes', suit: null })
  for (const s of [0, 1]) m = step(m, s, defaultAction(m, s)).match
  assert.notEqual(m.phase, 'bet')
  assert.deepEqual(m.pairs[0].betting!.onMax, [true, true])
  const cd = boss('cd', { id: 'colddeck', suit: null })
  assert.equal(problem(cd, 0, { type: 'discard', cardIds: [cd.players[0].hand[0].id] }), 'cold deck: no discards')
})

test('double down: the house matches the pot, so a round 3 knockout takes the $4 stake twice (+8), the loser pays it once (−4)', () => {
  let m = boss('dd', { id: 'doubledown', suit: null })
  const kk = [newCard(m, 13, 'S'), newCard(m, 13, 'H')]
  const two = [newCard(m, 2, 'C')]
  m.players[0].hand = kk
  m.players[1].hand = two
  m = step(m, 0, { type: 'play', cardIds: kk.map(x => x.id) }).match
  m = step(m, 1, { type: 'play', cardIds: two.map(x => x.id) }).match
  while (m.phase === 'bet') m = step(m, pending(m)[0], { type: 'bet', choice: 'min' }).match
  assert.equal(m.players[0].last!.tally.pot, 8)
  assert.equal(m.players[1].last!.tally.pot, -4)
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

test('income: a round 2 win pays house = 2 + 2 × ante, the loser still gets the 2', () => {
  let m = drive(newMatch(duel('pay')), 'deal', 2)
  const ante = pairBlinds(m, [0, 1]).ante
  m = drive(m, 'shop', 3)
  const won = m.players.map(p => p.last!).find(r => r.outcome === 'win')
  const lost = m.players.map(p => p.last!).find(r => r.outcome === 'loss')
  assert.ok(won && lost, 'this seed has no tie round')
  assert.equal(won.tally.house, HOUSE_FLAT + HOUSE_BONUS * ante)
  assert.equal(lost.tally.house, HOUSE_FLAT)
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
