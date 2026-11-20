// expected counts worked out by hand from the trait rules in cards.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newCard, type Card, type Suit } from './cards.ts'
import { countsAs, lineTotal, linesOf, pileLines } from './pile.ts'

const ids = { nextCardId: 1 }
const c = (rank: number, suit: Suit, extra: Partial<Card> = {}) => newCard(ids, rank, suit, extra)
const line = (cards: Card[], key: string) => {
  const by = key.split(':')[0] as 'rank' | 'suit' | 'type'
  const l = pileLines(cards, by).find(x => x.key === key)
  if (!l) throw new Error(key)
  return l
}

test('kings: 2 plain + a twin K + a split/K queen = 4 cards that count as 2 + 2 + 1 = 5', () => {
  const twin = c(13, 'S', { tier: 1, traits: [{ kind: 'multi', count: 2 }] })
  const split = c(12, 'C', { tier: 1, traits: [{ kind: 'split', rank: 13 }] })
  const deck = [c(13, 'H'), c(13, 'D'), twin, split]
  const k = line(deck, 'rank:13')
  assert.deepEqual(k.own.map(x => x.id), [deck[0].id, deck[1].id, twin.id])
  assert.deepEqual(k.also.map(x => x.id), [split.id])
  assert.equal(k.total, 5)
  assert.equal(line(deck, 'rank:12').total, 1)
})

test('household Ks over 8s counts 3 in the K line and 2 in the 8 line', () => {
  const house = c(13, 'S', { tier: 1, traits: [{ kind: 'household', pairRank: 8 }] })
  assert.equal(lineTotal([house], 'rank:13'), 3)
  assert.equal(lineTotal([house], 'rank:8'), 2)
  assert.deepEqual(linesOf(house, 'rank'), ['rank:13', 'rank:8'])
})

test('wrong suit ♣ diamond is in ♦ and ♣, a wild card is in all 4 suits', () => {
  const wrong = c(9, 'D', { knockoff: { kind: 'wrongsuit', suit: 'C' } })
  const wild = c(10, 'S', { tier: 1, traits: [{ kind: 'wild' }] })
  assert.deepEqual(linesOf(wrong, 'suit'), ['suit:D', 'suit:C'])
  assert.deepEqual(linesOf(wild, 'suit'), ['suit:S', 'suit:H', 'suit:D', 'suit:C'])
  assert.equal(lineTotal([wrong, wild, c(2, 'C')], 'suit:C'), 3)
})

test('a crayon has no rank line, only any. ash only goes in the ash line', () => {
  const crayon = c(3, 'S', { knockoff: { kind: 'crayon' } })
  const ash = c(2, 'S', { bulk: true })
  assert.deepEqual(linesOf(crayon, 'rank'), ['rank:any'])
  assert.equal(lineTotal([crayon], 'rank:3'), 0)
  assert.deepEqual(linesOf(ash, 'rank'), ['rank:ash'])
  assert.deepEqual(linesOf(ash, 'suit'), ['suit:ash'])
})

test('the courtier is a maybe for J, Q and K and counts as none of them for sure', () => {
  const courtier = c(12, 'D', { joker: 'courtier' })
  assert.deepEqual(countsAs(courtier).maybe, [11, 12, 13])
  assert.equal(line([courtier], 'rank:12').own.length, 1)
  assert.equal(line([courtier], 'rank:12').total, 0)
  assert.equal(line([courtier], 'rank:13').maybe.length, 1)
})

test('type lines: a holo signed card is in finish and stamp, a plain card only in plain', () => {
  const both = c(8, 'D', { finish: 'holo', stamp: 'signed' })
  assert.deepEqual(linesOf(both, 'type'), ['type:finish', 'type:stamp'])
  assert.deepEqual(linesOf(c(8, 'C'), 'type'), ['type:plain'])
})

test('rank grouping always has 13 rank lines plus any and ash, even for an empty deck', () => {
  assert.equal(pileLines([], 'rank').length, 15)
  assert.equal(pileLines([], 'suit').length, 5)
  assert.equal(pileLines([], 'type').length, 9)
})
