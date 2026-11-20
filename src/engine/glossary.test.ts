import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newCard, type Card, type Suit } from './cards.ts'
import { KEYWORDS, cardEntry, entry, glossaryIds, type Entry, type Kind } from './glossary.ts'
import { deckDelta } from './compare.ts'

const KINDS: Kind[] = ['finish', 'stamp', 'knockoff', 'trait', 'tier', 'variant', 'joker', 'bulk', 'collectible', 'insert', 'pochette', 'twist', 'rival', 'keeper', 'hud', 'keyword', 'hand']

const ids = { nextCardId: 1 }
const c = (rank: number, suit: Suit, extra: Partial<Card> = {}) => newCard(ids, rank, suit, extra)

// a filled line, and every [Keyword] in it is a real keyword
function check(e: Entry, where: string): void {
  assert.ok(e.name, `${where} has a name`)
  for (const line of [...e.text, e.flavor ?? 'x', e.foot ?? 'x']) {
    assert.ok(line.trim().length > 0, `${where} has an empty line`)
    assert.ok(!line.includes('undefined') && !line.includes('NaN'), `${where}: ${line}`)
    for (const [, word] of line.matchAll(/\[([^\]]+)\]/g)) assert.ok(word in KEYWORDS, `${where}: [${word}] isn't a keyword`)
  }
}

test('every glossary id of every kind resolves, with no empty lines and only known [Keywords]', () => {
  for (const kind of KINDS) {
    const all = glossaryIds(kind)
    assert.ok(all.length > 0, `${kind} has ids`)
    for (const id of all) {
      const e = entry(kind, id)
      assert.equal(e.kind, kind)
      assert.ok(e.text.length > 0, `${kind}:${id} has text`)
      check(e, `${kind}:${id}`)
    }
  }
})

test('the hud covers the ux.md ids', () => {
  const hud = glossaryIds('hud')
  for (const id of ['ko', 'marker', 'stonks', 'plate-hand', 'plate-discards', 'plate-sleeve', 'difficulty', 'lane', 'hand-pips', 'momentum', 'gold-border', 'freshness', 'spoils', 'house', 'interest', 'bankroll', 'pile', 'level']) {
    assert.ok(hud.includes(id), id)
  }
})

test('entry throws on an unknown id', () => {
  assert.throws(() => entry('collectible', 'store_credit'))
  assert.throws(() => entry('hud', 'nope'))
  assert.throws(() => entry('card', 'x'))
})

test('a loaded card gets one line per modifier slot: base, ★, 2 traits, finish, stamp, variant, grade, grind = 9', () => {
  const card = c(12, 'H', { tier: 2, traits: [{ kind: 'multi', count: 2 }, { kind: 'household', pairRank: 8 }], finish: 'holo', stamp: 'first', bonusHype: 2, variant: 'rookie', grind: 3, grade: 10 })
  const e = cardEntry(card)
  check(e, 'card')
  assert.equal(e.text.length, 9)
  assert.ok(e.text.some(l => l.startsWith('Household (Qs over 8s)')))
  assert.ok(e.text.includes('1st Edition: {h}+3 Hype{/} when it scores, +1 more for good every time'))
  assert.equal(e.foot, 'sells $5 from the binder') // graded 10 / 2
})

test('ctx fills the rolled bits: playmat ♥, ban wave clubs, wrong suit ♦', () => {
  assert.deepEqual(entry('collectible', 'playmat', { id: 'playmat', param: 'H' }).text, ['Each scored ♥: {h}+3 Hype{/}'])
  assert.equal(entry('twist', 'banwave', { id: 'banwave', suit: 'C' }).text[0], 'Club cards score no Value and trigger nothing')
  assert.equal(entry('knockoff', 'wrongsuit', { kind: 'wrongsuit', suit: 'D' }).text[0], 'Also counts as ♦ for a Flush')
})

test('compare: a 5th ♥ in a ♥-heavy deck, a 2nd Q and a 3rd Ash', () => {
  const deck = [c(2, 'H'), c(5, 'H'), c(9, 'H'), c(13, 'H'), c(12, 'S'), c(3, 'C'), c(2, 'S', { bulk: true }), c(2, 'S', { bulk: true })]
  const d = deckDelta(deck, [c(12, 'H'), c(2, 'S', { bulk: true })])
  assert.deepEqual(d.suit.H, [4, 5])
  assert.deepEqual(d.suit.S, [1, 1]) // bulk has no suit
  assert.deepEqual(d.rank[12], [1, 2])
  assert.deepEqual(d.rank[2], [1, 1])
  assert.deepEqual(d.lines, ['5th ♥: flush lane', 'makes a Q pair possible', '3rd Ash'])
})

test('compare: a 3rd Joker is over the cap of 2, a crayon has no rank to count', () => {
  const deck = [c(4, 'S', { joker: 'sticky' }), c(7, 'D', { joker: 'double' })]
  const d = deckDelta(deck, [c(9, 'C', { joker: 'bluff' }), c(9, 'H', { knockoff: { kind: 'crayon' } })])
  assert.deepEqual(d.rank[9], [0, 1])
  assert.deepEqual(d.lines, ['3rd Joker: over the cap, goes to the binder', 'Crayon: joins any rank'])
})
