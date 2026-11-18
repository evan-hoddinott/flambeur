// the self-bet money. ante 2, max 5: a max puts $3 more on yourself. hand-computed from V2.md §4
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { act, firstToAct, legalActions, openStage, settle, startBetting } from './betting.ts'

const open = (bankrolls: [number, number] = [20, 20], allMax = false) => openStage(startBetting(0, 2, 5, bankrolls, allMax), 'open')

test('min/min: the winner takes the $2 ante, +2 / −2. a tie round gives everything back', () => {
  const b = act(act(open(), 'min'), 'min')
  assert.equal(b.stage, null)
  assert.deepEqual(settle(b, 0), [2, -2])
  assert.deepEqual(settle(b, null), [0, 0])
})

test('max vs min: the max seat wins = ante 2 + its own $3 from the house = +5, the min seat −2. loses = −5, rival +5', () => {
  const b = act(act(open(), 'max'), 'min')
  assert.deepEqual(b.onMax, [true, false])
  assert.deepEqual(settle(b, 0), [5, -2])
  assert.deepEqual(settle(b, 1), [-5, 5])
})

test('max/max: the winner gets 2 + its own 3 (house) + the loser\'s 3 = +8, the loser −5', () => {
  const b = act(act(open(), 'max'), 'max')
  assert.deepEqual(settle(b, 1), [-5, 8])
})

test('poker face: the losing max comes back, so a max/max loss is −2 and the winner +5', () => {
  const b = act(act(open(), 'max'), 'max')
  assert.deepEqual(settle(b, 1, [true, false]), [-2, 5])
})

test('the richer seat picks first, the other sees it. tie: seat 0 first on odd rounds', () => {
  assert.equal(firstToAct([30, 20], 2), 0)
  assert.equal(firstToAct([20, 30], 1), 1)
  assert.equal(firstToAct([20, 20], 1), 0)
  assert.equal(firstToAct([20, 20], 2), 1)
  const b = openStage(startBetting(1, 2, 5, [20, 30]), 'open')
  assert.equal(b.toAct, 1)
  assert.equal(act(b, 'max').toAct, 0)
})

test('the last push: only a seat still on min gets asked, and nobody on max can go back', () => {
  let b = act(act(open(), 'max'), 'min')
  b = openStage(b, 'push')
  assert.equal(b.toAct, 1)
  b = act(b, 'max')
  assert.deepEqual(b.onMax, [true, true])
  assert.equal(b.toAct, null)
  // both already on max: no push at all
  assert.equal(openStage(b, 'push').stage, null)
})

test('$4 vs $20 at ante 2 max 5: max needs $5 to cover, so the $4 seat is never asked. $1 bankroll: all-in for $1', () => {
  const b = open([4, 20])
  assert.deepEqual(b.canMax, [false, true])
  assert.equal(b.toAct, 1)
  assert.equal(act(b, 'min').toAct, null)
  const allIn = startBetting(0, 2, 5, [1, 20])
  assert.equal(allIn.stake, 1)
  assert.deepEqual(settle(act(openStage(allIn, 'open'), 'min'), 1), [-1, 1])
})

test('high stakes: everyone who can cover it starts on max, nobody gets asked', () => {
  const b = open([20, 4], true)
  assert.deepEqual(b.onMax, [true, false])
  assert.equal(b.stage, null)
  assert.deepEqual(legalActions(b), [])
})
