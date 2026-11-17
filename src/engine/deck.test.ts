// tables, bulk, binder and the side systems. expected numbers are hand-computed from DESIGN.md
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newBulk, newCard, type Card } from './cards.ts'
import { deckSize } from './deck.ts'
import { draftRows, draftDeck, OFFERED } from './starters.ts'
import { act, forfeit, startBetting } from './betting.ts'
import { appraise, emptyLevels } from './scoring.ts'
import { binBulk, binderPrice, dealHand, finishRound, freshness, handSize, mulligan, newRun, nextRound, stonks } from './run.ts'
import { forgePlan } from './forge.ts'

const key = (c: Card) => `${c.rank}${c.suit}${c.tier}${c.finish}${c.stamp}`
const score = (cards: Card[]) =>
  appraise(cards, { levels: emptyLevels(), display: [], displaySlots: 5, deckSize: 24, bankroll: 20, ante: 2, betMax: false, twist: null, rng: null })
const showdown = (ante = 2, max = 5) => act(act(startBetting(0, ante, max, [40, 40], [false, false]), 'min'), 'call')

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

test('tables: play 3 of 8, the 3 go to discard and 5 go back: pile 16 + 5 = 21, discard 3', () => {
  const run = newRun('tbl', 'highroller', [0, 1, 2])
  dealHand(run, 0)
  dealHand(run, 1)
  assert.equal(run.you.hand.length, 8)
  assert.equal(run.you.pile.length, 16)
  const played = run.you.hand.slice(0, 3)
  finishRound(run, showdown(), 0, [played, run.rival.hand.slice(0, 5)], [[], []])
  assert.equal(run.you.hand.length, 0)
  assert.equal(run.you.pile.length, 21)
  assert.deepEqual(run.you.discard.map(c => c.id), played.map(c => c.id))
})

test('tables: folding mucks the whole hand of 8: pile 16, discard 8', () => {
  const run = newRun('fold', 'highroller', [0, 1, 2])
  dealHand(run, 0)
  dealHand(run, 1)
  finishRound(run, act(startBetting(0, 2, 5, [40, 40], [false, false]), 'fold'), null, [run.you.hand.slice(0, 2), run.rival.hand.slice(0, 5)], [[], []])
  assert.equal(run.you.pile.length, 16)
  assert.equal(run.you.discard.length, 8)
})

test('tables: round 4 shuffles everything back: 24 cards, deal 8 = pile 16, discard 0', () => {
  const run = newRun('t2', 'highroller', [0, 1, 2])
  dealHand(run, 0)
  dealHand(run, 1)
  finishRound(run, showdown(), 0, [run.you.hand.slice(0, 5), run.rival.hand.slice(0, 5)], [[], []])
  run.round = 3
  nextRound(run)
  assert.equal(run.round, 4)
  dealHand(run, 0)
  assert.equal(run.you.pile.length, 16)
  assert.equal(run.you.discard.length, 0)
})

test('mulligan: toss 3 of 8, redraw 2 = 7 cards, next hand this table is 7', () => {
  const run = newRun('mull', 'highroller', [0, 1, 2])
  dealHand(run, 0)
  const res = mulligan(run, 0, run.you.hand.slice(0, 3).map(c => c.id))
  assert.equal(res.free, false)
  assert.equal(run.you.hand.length, 7)
  assert.equal(handSize(run.you), 7)
  assert.equal(deckSize(run.you), 24)
})

test('classic: first mulligan each table is free (toss 3 redraw 3), the second one costs a card', () => {
  const run = newRun('cl', 'classic', [0, 1, 2])
  dealHand(run, 0)
  assert.equal(mulligan(run, 0, run.you.hand.slice(0, 3).map(c => c.id)).free, true)
  assert.equal(run.you.hand.length, 8)
  assert.equal(mulligan(run, 0, run.you.hand.slice(0, 3).map(c => c.id)).free, false)
  assert.equal(run.you.hand.length, 7)
})

test('empty pile: dealt nothing, you lose the round at the ante ($2)', () => {
  const run = newRun('empty', 'highroller', [0, 1, 2])
  run.you.pile = []
  assert.equal(dealHand(run, 0).length, 0)
  dealHand(run, 1)
  const b = forfeit(startBetting(0, 2, 5, [40, 40], [false, false]), 0)
  const [you] = finishRound(run, b, null, [[], run.rival.hand.slice(0, 5)], [[], []])
  assert.equal(you.outcome, 'fold')
  assert.equal(you.delta, -2)
})

test('bulk: forging a pair leaves 1 forged + 1 bulk, trips leaves 1 + 2, deck size never drops', () => {
  const pair = forgePlan([newCard(13, 'S'), newCard(13, 'H'), newCard(2, 'D')])
  const trips = forgePlan([newCard(9, 'S'), newCard(9, 'H'), newCard(9, 'D')])
  assert.equal(pair?.merged.length, 2)
  assert.equal(trips?.merged.length, 3)

  const run = newRun('forge', 'highroller', [0, 1, 2])
  dealHand(run, 0)
  dealHand(run, 1)
  run.you.hand.splice(0, 2, newCard(13, 'S'), newCard(13, 'H')) // swap two out so the hand has a pair
  const swapped = run.you.hand.slice(0, 2)
  const before = deckSize(run.you)
  const b = act(startBetting(0, 2, 5, [40, 40], [true, false]), 'forge')
  const [you] = finishRound(run, b, null, [swapped, run.rival.hand.slice(0, 5)], [[], []])
  assert.equal(you.bulk.length, 1)
  assert.equal(deckSize(run.you), before) // 2 eaten, 1 forged + 1 bulk back
})

test('bulk scores +5 Value: KK + bulk = (10 + 10 + 10 + 5) × 2 = 70, bulk alone = (5 + 5) × 1 = 10', () => {
  assert.equal(score([newCard(13, 'S'), newCard(13, 'H'), newBulk(1)]).total, 70)
  assert.equal(score([newBulk(1)]).total, 10)
  assert.equal(forgePlan([newBulk(1), newBulk(1)]), null)
})

test('bulk removal: $2 then $3', () => {
  const run = newRun('bin', 'highroller', [0, 1, 2])
  run.you.pile.push(newBulk(1), newBulk(1))
  binBulk(run, 0)
  binBulk(run, 0)
  assert.equal(run.you.bankroll, 30 - 2 - 3)
  assert.equal(run.you.pile.filter(c => c.bulk).length, 0)
})

test('momentum: win rounds 1 and 2, the boss house bonus is (2 + 2) × $4 ante = $16', () => {
  const run = newRun('mo', 'classic', [0, 1, 2])
  run.twists[0] = { id: 'sealed', suit: null }
  for (const r of [1, 2, 3]) {
    dealHand(run, 0)
    dealHand(run, 1)
    const [you] = finishRound(run, showdown(r + 1, r + 4), 0, [run.you.hand.slice(0, 5), run.rival.hand.slice(0, 5)], [[], []])
    if (r === 3) assert.equal(you.income.house, 16)
    else nextRound(run)
  }
})

test('gold border: 2 played gold cards, win the showdown +$6 on top of the pot, lose −$6', () => {
  const run = newRun('gold', 'highroller', [0, 1, 2])
  dealHand(run, 0)
  dealHand(run, 1)
  run.you.hand[0].stamp = 'gold'
  run.you.hand[1].stamp = 'gold'
  run.rival.hand[0].stamp = 'gold'
  const [you, rival] = finishRound(run, showdown(), 0, [run.you.hand.slice(0, 5), run.rival.hand.slice(0, 5)], [[], []])
  assert.equal(you.income.gold, 6)
  assert.equal(you.delta, 2 + 6)
  assert.equal(rival.delta, -2 - 3)
})

test('stonks: a hot rank or suit card sells for 3× ($1 → $3), a hot finish ×2 ($2 → $4)', () => {
  const run = newRun('st', 'classic', [0, 1, 2])
  for (let r = 1; r <= 9; r++) {
    run.round = r
    const s = stonks(run)
    const card = s.kind === 'rank' ? newCard(s.rank, 'S') : s.kind === 'suit' ? newCard(9, s.suit) : newCard(9, 'S', { finish: s.finish })
    assert.equal(binderPrice(run, run.you, card), s.kind === 'finish' ? 4 : 3)
  }
})

test('grading freshness: pulled this round +3, last round +2, two ago +1, starting deck 0', () => {
  assert.equal(freshness(newCard(9, 'S', { pulledRound: 5 }), 5), 3)
  assert.equal(freshness(newCard(9, 'S', { pulledRound: 4 }), 5), 2)
  assert.equal(freshness(newCard(9, 'S', { pulledRound: 3 }), 5), 1)
  assert.equal(freshness(newCard(9, 'S', { pulledRound: 1 }), 5), 0)
  assert.equal(freshness(newCard(9, 'S'), 2), 0)
})
