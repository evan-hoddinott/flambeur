// tournament rounds: forced play and the twists. expected numbers are hand-computed
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newCard, type Card, type Suit } from './cards.ts'
import { appraise, emptyLevels } from './scoring.ts'
import { act, legalActions, startBetting } from './betting.ts'
import { canMulligan, dealHand, finishRound, newRun, showdownWinner, tableBlinds, twistFor } from './run.ts'
import { rollTwists, type Twist } from './twists.ts'

const c = (rank: number, suit: Suit, extra: Partial<Card> = {}) => newCard(rank, suit, extra)
const kings = () => [c(13, 'S'), c(13, 'H'), c(2, 'D'), c(5, 'C'), c(9, 'S')]
const score = (cards: Card[], twist: Twist | null, display = [{ id: 'penny_sleeve', param: null }]) =>
  appraise(cards, { levels: emptyLevels(), display, displaySlots: 5, deckSize: 24, bankroll: 20, ante: 2, betMax: false, twist, rng: null })

test('forced betting: no fold or forge at any step, min → raise → call goes to showdown', () => {
  let b = startBetting(0, 4, 8, [20, 20], [true, true], true)
  assert.deepEqual(legalActions(b), ['min', 'max'])
  b = act(b, 'min')
  assert.deepEqual(legalActions(b), ['call', 'raise'])
  b = act(b, 'raise')
  assert.deepEqual(legalActions(b), ['call'])
  b = act(b, 'call')
  assert.equal(b.outcome?.kind, 'showdown')
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

test('lowball: lower appraisal wins the showdown', () => {
  const run = newRun('low', 'classic', [0, 1, 2])
  run.round = 3
  run.twists[0] = { id: 'lowball', suit: null }
  assert.equal(showdownWinner(run, 100, 500), 0)
  assert.equal(showdownWinner(run, 500, 100), 1)
  run.round = 4
  assert.equal(showdownWinner(run, 100, 500), 1)
})

test('high stakes: round 3 min becomes the max ($8 / $8), cold deck: no mulligans', () => {
  const run = newRun('hs', 'classic', [0, 1, 2])
  run.round = 3
  run.twists[0] = { id: 'highstakes', suit: null }
  assert.deepEqual(tableBlinds(run), { ante: 8, max: 8 })
  run.twists[0] = { id: 'colddeck', suit: null }
  assert.equal(canMulligan(run, run.you), false)
})

test('double down: winning a $8 showdown pays +$16, the loser still only pays $8', () => {
  const run = newRun('dd', 'classic', [0, 1, 2])
  run.round = 3
  run.twists[0] = { id: 'doubledown', suit: null }
  run.you.bankroll = 30
  run.rival.bankroll = 30
  dealHand(run, 0)
  dealHand(run, 1)
  let b = startBetting(0, 4, 8, [30, 30], [false, false], true)
  b = act(act(b, 'max'), 'call')
  const [you, rival] = finishRound(run, b, 0, [run.you.hand.slice(0, 5), run.rival.hand.slice(0, 5)], [[], []])
  assert.equal(you.delta, 16)
  assert.equal(rival.delta, -8)
})

test('rival bust ends the run as a win, your bust as a loss', () => {
  const run = newRun('bust', 'classic', [0, 1, 2])
  run.rival.bankroll = 2
  dealHand(run, 0)
  dealHand(run, 1)
  let b = startBetting(0, 2, 5, [run.you.bankroll, 2], [false, false])
  b = act(act(b, 'min'), 'call')
  finishRound(run, b, 0, [run.you.hand.slice(0, 5), run.rival.hand.slice(0, 5)], [[], []])
  assert.equal(run.over, true)
  assert.equal(run.won, true)
})

test('twists: 3 different ones per seed, same seed same twists, only rounds 3/6/9', () => {
  const a = rollTwists('seed-a')
  assert.equal(a.length, 3)
  assert.equal(new Set(a.map(t => t.id)).size, 3)
  assert.deepEqual(rollTwists('seed-a'), a)
  const run = newRun('seed-a', 'classic', [0, 1, 2])
  assert.equal(twistFor(run, 2), null)
  assert.deepEqual(twistFor(run, 6), a[1])
})

test('income: folding pays no paycheck. a $3 round-2 showdown win: +3 pot, paycheck 2 + house 2×3 = 8', () => {
  const run = newRun('pay', 'classic', [0, 1, 2])
  run.you.bankroll = 9 // interest 0 before and after a fold
  run.rival.bankroll = 9
  dealHand(run, 0)
  dealHand(run, 1)
  let b = startBetting(0, 2, 5, [9, 9], [false, false])
  const [folded, other] = finishRound(run, act(b, 'fold'), null, [run.you.hand.slice(0, 5), run.rival.hand.slice(0, 5)], [[], []])
  assert.equal(folded.income.paycheck, 0)
  assert.equal(run.you.bankroll, 7)
  assert.equal(other.income.house, 0) // a fold isn't a showdown, no house bonus
  run.round = 2
  run.you.bankroll = 9
  run.rival.bankroll = 9
  dealHand(run, 0)
  dealHand(run, 1)
  b = act(act(startBetting(0, 3, 6, [9, 9], [false, false]), 'min'), 'call')
  const [won, lost] = finishRound(run, b, 0, [run.you.hand.slice(0, 5), run.rival.hand.slice(0, 5)], [[], []])
  assert.equal(won.delta, 3)
  assert.equal(won.income.paycheck + won.income.house, 2 + 6)
  assert.equal(lost.income.paycheck, 2)
  assert.equal(lost.income.house, 0)
})
