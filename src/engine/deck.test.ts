import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newCard, type Card } from './cards.ts'
import { DECK_FLOOR, deckSize, mulliganHand, refillHand } from './deck.ts'
import { draftRows, draftDeck, OFFERED } from './starters.ts'
import { act, startBetting } from './betting.ts'
import { finishRound, forgeCheck, newRun } from './run.ts'
import { makeRng } from './rng.ts'

const cards = (n: number, rank = 7): Card[] => Array.from({ length: n }, (_, i) => newCard(rank + (i % 7), 'S'))
const key = (c: Card) => `${c.rank}${c.suit}${c.tier}${c.finish}${c.stamp}`

test('row draft: same seed same rows, 4 rows of 8, 3 rows = 24 cards for every box', () => {
  for (const id of OFFERED) {
    const a = draftRows('2026-11-16', id)
    const b = draftRows('2026-11-16', id)
    assert.equal(a.length, 4)
    for (const row of a) assert.equal(row.cards.length, 8)
    assert.deepEqual(a.map(r => r.cards.map(key)), b.map(r => r.cards.map(key)))
    assert.deepEqual(a.map(r => r.label), b.map(r => r.label))
    assert.equal(draftDeck('2026-11-16', id, [0, 2, 3]).length, 24)
  }
  assert.throws(() => draftDeck('x', 'classic', [0, 0, 1]))
})

test('row draft: forge box twins land in different rows', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const perRow = draftRows(seed, 'forge').map(r => r.cards.filter(c => c.tier > 0).length)
    assert.deepEqual(perRow.slice().sort(), [0, 0, 1, 1])
  }
})

test('reshuffle mid-draw: 3 left to draw + 10 in discard still fills a hand of 8', () => {
  const p = { hand: [] as Card[], draw: cards(3), discard: cards(10) }
  const res = refillHand(p, 8, makeRng(1))
  assert.equal(res.reshuffled, true)
  assert.equal(p.hand.length, 8)
  assert.equal(p.draw.length, 5)
  assert.equal(p.discard.length, 0)
})

test('mulligan: tossed cards go to discard, not straight back into the hand', () => {
  const hand = cards(8)
  const p = { hand: hand.slice(), draw: cards(5, 2), discard: [] as Card[] }
  const toss = hand.slice(0, 3).map(c => c.id)
  mulliganHand(p, toss, makeRng(1))
  assert.equal(p.hand.length, 8)
  assert.deepEqual(p.discard.map(c => c.id), toss)
  assert.ok(p.hand.every(c => !toss.includes(c.id)))
})

test('carry-over: unplayed cards stay in hand, played go to discard, then refill to 8', () => {
  const run = newRun('carry', 'classic', [0, 1, 2])
  refillHand(run.you, 8, run.pileRng)
  const played = run.you.hand.slice(0, 5)
  const held = run.you.hand.slice(5)
  let b = startBetting(0, 2, 5, [run.you.bankroll, 20], [false, false])
  b = act(b, 'fold')
  finishRound(run, b, null, [played, []], [[], []])
  assert.deepEqual(run.you.hand.map(c => c.id), held.map(c => c.id))
  assert.deepEqual(run.you.discard.map(c => c.id), played.map(c => c.id))
  assert.equal(deckSize(run.you), 24)
  refillHand(run.you, 8, run.pileRng)
  assert.deepEqual(run.you.hand.slice(0, 3).map(c => c.id), held.map(c => c.id))
})

test('deck floor: a pair forge at 16 cards is blocked (16 - 2 + 1 = 15), at 17 it is fine', () => {
  const pair = [newCard(13, 'S'), newCard(13, 'H'), newCard(2, 'D'), newCard(5, 'C'), newCard(9, 'S')]
  const p = { hand: pair, draw: cards(DECK_FLOOR - 5), discard: [] as Card[] }
  const atFloor = forgeCheck(p, pair)
  assert.ok(atFloor.plan)
  assert.equal(atFloor.thin, true)
  assert.equal(forgeCheck({ ...p, draw: cards(DECK_FLOOR - 4) }, pair).thin, false)
})

test('deck floor: a scored Damaged card never tears with the deck at 16', () => {
  let tornAbove = 0
  for (let i = 0; i < 40; i++) {
    for (const size of [DECK_FLOOR, DECK_FLOOR + 1]) {
      const run = newRun(`tear${i}`, 'classic', [0, 1, 2])
      const bad = newCard(14, 'S', { stamp: 'damaged' })
      run.you.hand = [bad, ...cards(4, 2)]
      run.you.draw = cards(size - 5)
      run.you.discard = []
      let b = startBetting(0, 2, 5, [20, 20], [false, false])
      b = act(act(b, 'min'), 'call')
      const [res] = finishRound(run, b, 0, [run.you.hand.slice(), []], [[bad.id], []])
      if (size === DECK_FLOOR) assert.equal(res.torn.length, 0)
      else tornAbove += res.torn.length
      assert.ok(deckSize(run.you) >= DECK_FLOOR)
    }
  }
  assert.ok(tornAbove > 0, 'the 1 in 4 tear should hit at least once in 40 tries above the floor')
})
