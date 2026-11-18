// tables, bulk, binder and the shop systems. expected numbers are hand-computed from DESIGN.md
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newBulk, newCard, sellPrice, type Card, type JokerId } from './cards.ts'
import { cleanup, dealFresh, deckSize, mulliganHand, startTable } from './deck.ts'
import { draftRows, OFFERED } from './starters.ts'
import { appraise, emptyLevels } from './scoring.ts'
import { forgePlan } from './forge.ts'
import { getDef } from './collectibles.ts'
import { keeperFor, type KeeperId } from './shop.ts'
import { stonksMult } from './sleeves.ts'
import { makeRng } from './rng.ts'
import {
  appraiseFor, binderPrice, defaultAction, defaultToDeck, displaySlots, freshness, houseMult, newMatch, pending, resolveJokers, splitsStuck, step, stonks, view,
  type Match, type MatchConfig, type PhaseKind, type SeatId,
} from './match.ts'

const ids = { nextCardId: 1 }
const key = (c: Card) => `${c.rank}${c.suit}${c.tier}${c.finish}${c.stamp}`
const score = (cards: Card[]) =>
  appraise(cards, { levels: emptyLevels(), display: [], displaySlots: 5, deckSize: 24, bankroll: 20, ante: 2, betMax: false, twist: null, rng: null })
const piles = (n: number) => ({ hand: [] as Card[], pile: Array.from({ length: n }, (_, i) => newCard(ids, 7 + (i % 8), 'S')), discard: [] as Card[] })
const duel = (seed: string): MatchConfig => ({ mode: 'duel', seed, seats: [{ kind: 'bot', name: 'a', difficulty: 'medium' }, { kind: 'bot', name: 'b', difficulty: 'medium' }] })

// timeout defaults until the match reaches this phase (and round)
function drive(m: Match, phase: PhaseKind, round = m.round): Match {
  for (let guard = 0; !(m.phase === phase && m.round === round); guard++) {
    if (guard > 5000 || m.phase === 'over') throw new Error(`never reached ${phase} in round ${round}`)
    const s = pending(m)[0]
    m = step(m, s, defaultAction(m, s)).match
  }
  return m
}

// play one bet for a seat, defaults for everyone else, until the round settles
function betAs(m: Match, s: SeatId, choice: 'fold' | 'forge' | 'min' | 'max' | 'match'): Match {
  let mine = false
  while (m.phase === 'bet' || m.phase === 'forgePick') {
    const who = pending(m)[0]
    const action = who === s && !mine && m.phase === 'bet' ? { type: 'bet' as const, choice } : defaultAction(m, who)
    if (who === s && m.phase === 'bet') mine = true
    m = step(m, who, action).match
  }
  return m
}

test('row draft: same stream same rows, 4 rows of 8, 3 rows = 24 cards for every box', () => {
  for (const id of OFFERED) {
    const a = draftRows('2026-11-16', id, { nextCardId: 1 })
    const b = draftRows('2026-11-16', id, { nextCardId: 1 })
    assert.equal(a.length, 4)
    for (const row of a) assert.equal(row.cards.length, 8)
    assert.deepEqual(a.map(r => r.cards.map(key)), b.map(r => r.cards.map(key)))
    assert.deepEqual(a.map(r => r.cards.map(c => c.id)), b.map(r => r.cards.map(c => c.id)))
  }
})

test('row draft: forge box twins land in different rows', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const perRow = draftRows(seed, 'forge', { nextCardId: 1 }).map(r => r.cards.filter(c => c.tier > 0).length)
    assert.deepEqual(perRow.slice().sort(), [0, 0, 1, 1])
  }
})

test('tables: deal 8 of 24, play 3: discard 3, the other 5 go back = pile 21', () => {
  const p = piles(24)
  startTable(p, makeRng('t'))
  dealFresh(p, 8)
  assert.equal(p.pile.length, 16)
  cleanup(p, p.hand.slice(0, 3), new Set(), false, makeRng('c'))
  assert.equal(p.hand.length, 0)
  assert.equal(p.pile.length, 21)
  assert.equal(p.discard.length, 3)
})

test('tables: folding mucks the whole hand of 8: pile 16, discard 8', () => {
  const p = piles(24)
  dealFresh(p, 8)
  cleanup(p, p.hand.slice(0, 2), new Set(), true, makeRng('c'))
  assert.equal(p.pile.length, 16)
  assert.equal(p.discard.length, 8)
})

test('mulligan: toss 3 of 8, redraw 2 = 7 cards, the 3 go back into the pile. free = redraw 3', () => {
  const p = piles(24)
  dealFresh(p, 8)
  const toss = p.hand.slice(0, 3).map(c => c.id)
  mulliganHand(p, toss, makeRng('m'), false)
  assert.equal(p.hand.length, 7)
  assert.equal(p.pile.length, 17) // 16 - 2 drawn + 3 tossed
  assert.ok(p.hand.every(c => !toss.includes(c.id)))
  mulliganHand(p, p.hand.slice(0, 3).map(c => c.id), makeRng('m2'), true)
  assert.equal(p.hand.length, 7)
})

test('match: a paid mulligan shrinks the next hand this table, the next table resets it to 8', () => {
  let m = drive(newMatch(duel('mull')), 'deal')
  m.players[0].rules = { ...m.players[0].rules, freeMulligans: 0 }
  m = step(m, 0, { type: 'mulligan', cardIds: m.players[0].hand.slice(0, 3).map(c => c.id) }).match
  assert.equal(m.players[0].hand.length, 7)
  m = drive(m, 'deal', 2)
  assert.equal(m.players[0].hand.length, 7)
  m = drive(m, 'deal', 4)
  assert.equal(m.players[0].hand.length, 8)
  assert.equal(m.players[0].discard.length, 0) // the table start shuffled everything back
})

test('classic: the first mulligan each table is free (toss 3, redraw 3)', () => {
  let m = drive(newMatch(duel('free')), 'deal')
  m.players[0].rules = { ...m.players[0].rules, freeMulligans: 1 }
  m = step(m, 0, { type: 'mulligan', cardIds: m.players[0].hand.slice(0, 3).map(c => c.id) }).match
  assert.equal(m.players[0].hand.length, 8)
  m = step(m, 0, { type: 'mulligan', cardIds: m.players[0].hand.slice(0, 3).map(c => c.id) }).match
  assert.equal(m.players[0].hand.length, 7)
})

test('empty pile: dealt nothing, you lose the round at the ante', () => {
  let m = drive(newMatch(duel('empty')), 'shop')
  m.players[0].pile = []
  m = drive(m, 'shop', 2)
  assert.equal(m.players[0].last!.outcome, 'fold')
  assert.equal(m.players[0].last!.tally.pot, -2)
})

test('bulk: forging a pair = 1 forged + 1 bulk, deck size unchanged. forge costs the $5 max', () => {
  let m = drive(newMatch(duel('bulk')), 'deal')
  const p = m.players[0]
  p.hand.splice(0, 2, newCard(m, 13, 'S'), newCard(m, 13, 'H')) // a pair of kings, fresh ids from the match
  const before = deckSize(p)
  const bank = p.bankroll
  m = step(m, 0, { type: 'lock', cardIds: [p.hand[0].id, p.hand[1].id] }).match
  m = drive(m, 'bet')
  m = betAs(m, 0, 'forge')
  const me = m.players[0]
  assert.equal(me.last!.outcome, 'forge')
  assert.equal(me.last!.bulk, 1)
  assert.equal(deckSize(me), before)
  assert.equal(me.last!.tally.pot, -5)
  assert.equal(me.bankroll, bank - 5 + me.last!.tally.interest)
})

test('bulk scores +5 Value: KK + bulk = (10 + 10 + 10 + 5) × 2 = 70, bulk alone = (5 + 5) × 1 = 10, bulk never forges', () => {
  assert.equal(score([newCard(ids, 13, 'S'), newCard(ids, 13, 'H'), newBulk(ids, 1)]).total, 70)
  assert.equal(score([newBulk(ids, 1)]).total, 10)
  assert.equal(forgePlan([newBulk(ids, 1), newBulk(ids, 1)]), null)
})

test('bulk removal: $2 then $3', () => {
  let m = drive(newMatch(duel('bin')), 'shop', 2)
  const p = m.players[0]
  p.pile.push(newBulk(m, 1), newBulk(m, 1))
  const bank = p.bankroll
  m = step(m, 0, { type: 'binBulk' }).match
  m = step(m, 0, { type: 'binBulk' }).match
  assert.equal(m.players[0].bankroll, bank - 2 - 3)
  assert.equal(m.players[0].pile.filter(c => c.bulk).length, 0)
})

test('momentum: two early wins this table make the boss house bonus (2 + 2) × ante, capped there', () => {
  const m = newMatch(duel('mo'))
  m.round = 3
  m.players[0].tableWins = 2
  assert.equal(houseMult(m, m.players[0]), 4)
  m.players[0].tableWins = 5
  assert.equal(houseMult(m, m.players[0]), 4)
  m.round = 2
  assert.equal(houseMult(m, m.players[0]), 2)
})

test('gold border: 2 played gold cards are a $6 side bet on the showdown', () => {
  let m = drive(newMatch(duel('gold')), 'deal')
  const p = m.players[0]
  const play = p.hand.slice(0, 5)
  play[0].stamp = 'gold'
  play[1].stamp = 'gold'
  m = step(m, 0, { type: 'lock', cardIds: play.map(c => c.id) }).match
  m = drive(m, 'shop', 2)
  const r = m.players[0].last!
  assert.notEqual(r.outcome, 'tie')
  assert.equal(r.tally.extras, (r.outcome === 'win' ? 1 : -1) * 6 + (r.outcome === 'win' && m.players[0].display.some(o => o.id === 'price_sticker') ? 1 : 0))
})

test('stonks: a hot rank or suit card sells for 3× ($1 → $3), a hot finish ×2 ($2 → $4)', () => {
  const m = newMatch(duel('st'))
  for (let r = 1; r <= 12; r++) {
    m.round = r
    const s = stonks(m)
    const card = s.kind === 'rank' ? newCard(ids, s.rank, 'S') : s.kind === 'suit' ? newCard(ids, 9, s.suit) : newCard(ids, 9, 'S', { finish: s.finish })
    assert.equal(binderPrice(m, m.players[0], card), s.kind === 'finish' ? 4 : 3)
  }
})

test('grading: freshness +3 this round, +2, +1, starting deck 0', () => {
  assert.equal(freshness(newCard(ids, 9, 'S', { pulledRound: 5 }), 5), 3)
  assert.equal(freshness(newCard(ids, 9, 'S', { pulledRound: 4 }), 5), 2)
  assert.equal(freshness(newCard(ids, 9, 'S', { pulledRound: 3 }), 5), 1)
  assert.equal(freshness(newCard(ids, 9, 'S', { pulledRound: 1 }), 5), 0)
  assert.equal(freshness(newCard(ids, 9, 'S'), 2), 0)
})

test('shipping: la poste $2, the card is away a round with its grade hidden, back in the deck graded at the next shop', () => {
  let m = drive(newMatch(duel('ship')), 'shop', 2)
  const [a, b] = m.players[0].pile
  const bank = m.players[0].bankroll
  m = step(m, 0, { type: 'ship', cardId: a.id, shipper: 'poste' }).match
  const me = m.players[0]
  assert.equal(me.bankroll, bank - 2)
  assert.equal(me.pile.some(c => c.id === a.id), false)
  assert.equal(view(m, 0).me.shipping!.card.grade, null)
  assert.equal(view(m, 0).me.shipping!.back, 3)
  assert.throws(() => step(m, 0, { type: 'ship', cardId: b.id, shipper: 'poste' })) // one per shop
  const grade = me.shipping!.grade
  m = drive(m, 'shop', 3)
  const back = m.players[0].pile.find(c => c.id === a.id)!
  assert.equal(back.grade, grade)
  assert.equal(m.players[0].shipping, null)
})

test('shipping: chronopost ($4) and the armored van ($7) never come back 1-3, across 40 seeds', () => {
  for (const shipper of ['chrono', 'fourgon'] as const) {
    for (let i = 0; i < 20; i++) {
      let m = drive(newMatch(duel(`safe${i}`)), 'shop', 2)
      const card = m.players[0].pile[0]
      const bank = m.players[0].bankroll
      m = step(m, 0, { type: 'ship', cardId: card.id, shipper }).match
      assert.equal(m.players[0].bankroll, bank - (shipper === 'chrono' ? 4 : 7))
      assert.ok(m.players[0].shipping!.grade >= 4)
    }
  }
})

test('shipping: a binder card comes back to the binder', () => {
  let m = drive(newMatch(duel('shipbinder')), 'shop', 2)
  const card = m.players[0].pile[0]
  m.players[0].pile = m.players[0].pile.slice(1)
  m.players[0].binder.push(card)
  m = step(m, 0, { type: 'ship', cardId: card.id, shipper: 'poste' }).match
  m = drive(m, 'shop', 3)
  assert.ok(m.players[0].binder.some(c => c.id === card.id && c.grade !== null))
})

// 30 showdowns where seat 0 plays 5 damaged cards. 1 in 4 scoring damaged cards tear without the sleeve
function tears(archival: boolean): number {
  let torn = 0
  for (let i = 0; i < 30; i++) {
    let m = drive(newMatch(duel(`tear${i}`)), 'deal')
    if (archival) m.players[0].sleeves.push('archival')
    const play = m.players[0].hand.slice(0, 5)
    for (const c of play) c.stamp = 'damaged'
    m = step(m, 0, { type: 'lock', cardIds: play.map(c => c.id) }).match
    m = drive(m, 'shop', 2)
    torn += m.players[0].last!.torn.length
  }
  return torn
}

test('archival sleeve: damaged cards never tear (without it some do), and la poste comes back at least a 4', () => {
  assert.ok(tears(false) > 0)
  assert.equal(tears(true), 0)
  for (let i = 0; i < 20; i++) {
    let m = drive(newMatch(duel(`arch${i}`)), 'shop', 2)
    m.players[0].sleeves.push('archival')
    m = step(m, 0, { type: 'ship', cardId: m.players[0].pile[0].id, shipper: 'poste' }).match
    assert.ok(m.players[0].shipping!.grade >= 4)
  }
})

// the same seed with a forced sign, driven to a shop. the sign never touches the rng, so the stock is identical
function shopWith(keeper: KeeperId[], round: number): Match {
  const m = newMatch(duel('keeper'))
  m.keeper = keeper
  return drive(m, 'shop', round)
}

test('shopkeeper: 3 different traits per run, the same for the same seed', () => {
  const a = keeperFor('run1')
  assert.equal(new Set(a).size, 3)
  assert.deepEqual(keeperFor('run1'), a)
})

test('shopkeeper: grumpy is +$1 on every paid offer and one free restock, closing down is $1 off at Table 2', () => {
  const plain = shopWith([], 2).players[0].shop!
  const grumpy = shopWith(['grumpy'], 2)
  grumpy.players[0].shop!.offers.forEach((o, i) => assert.equal(o.price, plain.offers[i].price === 0 ? 0 : plain.offers[i].price + 1))
  assert.equal(view(grumpy, 0).me.shop!.restockPrice, 0)
  const plain4 = shopWith([], 4).players[0].shop!
  shopWith(['closing'], 4).players[0].shop!.offers.forEach((o, i) => assert.equal(o.price, plain4.offers[i].price === 0 ? 0 : Math.max(1, plain4.offers[i].price - 1)))
})

test('shopkeeper: superstitious refuses ♠, collector pays 2× for graded ($4 → $8 for a grade 8), chatty shows next STONKS', () => {
  let m = shopWith(['superstitious', 'collector', 'chatty'], 2)
  const p = m.players[0]
  const spade = newCard(m, 9, 'S')
  const graded = newCard(m, 9, 'H', { grade: 8 })
  p.binder.push(spade, graded)
  assert.throws(() => step(m, 0, { type: 'sell', cardId: spade.id }), /spades/)
  assert.equal(binderPrice(m, p, graded), 4 * stonksMult(graded, stonks(m), false) * 2)
  m = step(m, 0, { type: 'sell', cardId: graded.id }).match
  const next = { ...m, round: m.round + 1 }
  assert.deepEqual(view(m, 0).stonksNext, stonks(next))
})

test('beer-stained: dealing 3 pulls the stuck mate from deep in the pile (hand of 4), and a play must take both', () => {
  const p = piles(10)
  const beer = p.pile[0]
  const mate = p.pile[7]
  beer.knockoff = { kind: 'beer', stuckTo: mate.id }
  dealFresh(p, 3)
  assert.equal(p.hand.length, 4)
  assert.ok(p.hand.includes(mate))
  assert.equal(splitsStuck(p.hand, [beer.id]), true)
  assert.equal(splitsStuck(p.hand, [mate.id]), true)
  assert.equal(splitsStuck(p.hand, [beer.id, mate.id]), false)
  assert.equal(splitsStuck(p.hand, [p.hand[1].id]), false)
})

// buys the first scratcher in a round 2 shop. binder = move a deck card into the binder first
function scratchOnce(seed: string, binder: boolean) {
  const fresh = newMatch(duel(seed))
  fresh.keeper = [] // no sign, so prices are the base $3
  const m = drive(fresh, 'shop', 2)
  const p = m.players[0]
  if (binder) p.binder.push(p.pile.shift()!)
  const before = { levels: Object.values(p.levels).reduce((a, b) => a + b, 0), display: p.display.length, bank: p.bankroll }
  const slot = p.shop!.offers.findIndex(o => o.type === 'scratcher')
  const r = step(m, 0, { type: 'buy', slot })
  const ev = r.events.map(e => e.event).find(e => e.kind === 'scratched')
  if (ev?.kind !== 'scratched') throw new Error('no scratched event')
  return { m: r.match, before, insert: ev.insert }
}

test('scratchers: 1-2 per shop at $3, every insert does its thing (grail = rare collectible or joker), checklist/wishlist block the shop until picked', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 80; i++) {
    const { m, before, insert } = scratchOnce(`scr${i}`, true)
    let after = m
    const p = after.players[0]
    const n = p.shop!.offers.filter(o => o.type === 'scratcher').length
    assert.ok(n >= 1 && n <= 2)
    assert.equal(p.bankroll, before.bank - 3 + (insert === 'grail' && before.display >= displaySlots(p) ? 4 : 0))
    seen.add(insert)
    if (insert === 'code') assert.equal(Object.values(p.levels).reduce((a, b) => a + b, 0), before.levels + 1)
    if (insert === 'grail') {
      const joker = [...p.pile, ...p.binder].some(c => c.joker !== null)
      assert.ok(joker || getDef(p.display.at(-1)!.id).rarity === 'rare', 'a grail gives a joker or a rare collectible')
    }
    if (insert === 'wishlist') {
      assert.throws(() => step(after, 0, { type: 'leaveShop' }), /scratcher/)
      const card = p.binder[0]
      after = step(after, 0, { type: 'useInsert', cardId: card.id, suit: null }).match
      assert.ok(after.players[0].pile.some(c => c.id === card.id))
    }
    if (insert === 'checklist') {
      const card = p.pile.find(c => !c.bulk)!
      const suit = card.suit === 'H' ? 'S' : 'H'
      after = step(after, 0, { type: 'useInsert', cardId: card.id, suit }).match
      assert.equal(after.players[0].pile.find(c => c.id === card.id)!.suit, suit)
    }
    assert.equal(after.players[0].shop!.scratch, null)
  }
  assert.deepEqual([...seen].sort(), ['checklist', 'code', 'grail', 'wishlist'])
})

test('scratchers: wishlist never comes up with an empty binder (it turns into a code)', () => {
  for (let i = 0; i < 80; i++) assert.notEqual(scratchOnce(`scr${i}`, false).insert, 'wishlist')
})

test('jumbo takes 2 play slots: 4 cards with a jumbo lock, 5 do not', () => {
  const m = drive(newMatch(duel('jumbo')), 'deal')
  const hand = m.players[0].hand
  hand[0].variant = 'jumbo'
  assert.throws(() => step(m, 0, { type: 'lock', cardIds: hand.slice(0, 5).map(c => c.id) }), /slots/)
  assert.doesNotThrow(() => step(m, 0, { type: 'lock', cardIds: hand.slice(0, 4).map(c => c.id) }))
})

test('chase sells for $10 and defaults to the binder. rookie in the deck grows +1 value each round (2 shops = +2)', () => {
  const chase = newCard(ids, 9, 'S', { variant: 'chase' })
  assert.equal(sellPrice(chase), 10)
  assert.equal(defaultToDeck(chase), false)
  let m = drive(newMatch(duel('rookie')), 'shop', 2)
  const rookie = m.players[0].pile[0]
  rookie.variant = 'rookie'
  m = drive(m, 'shop', 4)
  const now = [...m.players[0].pile, ...m.players[0].discard].find(c => c.id === rookie.id)!
  assert.equal(now.grind, 2)
})

test('beer-stained chain A→B, B→D: playing B + D without A still splits A from B', () => {
  const p = piles(6)
  const [a, b, d] = p.pile
  a.knockoff = { kind: 'beer', stuckTo: b.id }
  b.knockoff = { kind: 'beer', stuckTo: d.id }
  dealFresh(p, 6)
  assert.equal(splitsStuck(p.hand, [b.id, d.id]), true)
  assert.equal(splitsStuck(p.hand, [a.id, b.id, d.id]), false)
})

// round 1: seat 0 holds four kings and a 9 (the 9 carries the joker), seat 1 holds high-card junk.
// seat 0 locks those 5, then `bet` picks seat 0's bets (seat 1 folds to a max if fold1, else plays defaults)
function jokerRound(seed: string, joker: JokerId | null, bet: 'min' | 'max' | 'forge' = 'min', fold1 = false): Match {
  let m = drive(newMatch(duel(seed)), 'deal')
  const suits = ['S', 'H', 'D', 'C'] as const
  m.players[0].hand.forEach((c, i) => {
    c.rank = [13, 13, 13, 13, 9, 2, 3, 4][i]
    c.suit = suits[i % 4]
    c.finish = null
    c.stamp = null
    c.joker = i === 4 ? joker : null
  })
  m.players[1].hand.forEach((c, i) => {
    c.rank = [2, 3, 4, 6, 8, 10, 12, 14][i]
    c.suit = suits[i % 4]
    c.finish = null
    c.stamp = null
  })
  m = step(m, 0, { type: 'lock', cardIds: m.players[0].hand.slice(0, 5).map(c => c.id) }).match
  while (m.phase !== 'shop' && m.phase !== 'over') {
    const who = pending(m)[0]
    let action = defaultAction(m, who)
    if (m.phase === 'bet' && who === 0) action = { type: 'bet', choice: bet }
    if (m.phase === 'bet' && who === 1 && fold1 && view(m, 1).bet!.choices.some(c => c.seat === 0 && c.choice === 'max')) action = { type: 'bet', choice: 'fold' }
    m = step(m, who, action).match
  }
  return m
}

test('courtier counts as the J/Q/K that scores best: K K + courtier 2 = trips of kings, (30 + 10+10+10) × 3 = 180', () => {
  const m = newMatch(duel('court'))
  const hand = [newCard(ids, 13, 'S'), newCard(ids, 13, 'H'), newCard(ids, 2, 'C', { joker: 'courtier' }), newCard(ids, 5, 'D'), newCard(ids, 9, 'S')]
  assert.equal(appraiseFor(m, m.players[0], hand, false, null, 2).total, 180)
})

test("rival's card copies the rival's highest played card: rank, suit and finish", () => {
  const m = newMatch(duel('rivals'))
  const mine = newCard(ids, 2, 'C', { joker: 'rivals' })
  const theirs = [newCard(ids, 14, 'S', { finish: 'foil' }), newCard(ids, 3, 'D')]
  const [copy] = resolveJokers(m, m.players[0], [mine], 2, new Map([[mine.id, 'rivals' as JokerId]]), theirs)
  assert.deepEqual([copy.id, copy.rank, copy.suit, copy.finish, copy.joker], [mine.id, 14, 'S', 'foil', null])
})

test('double or nothing: the same showdown pays twice the pot', () => {
  const plain = jokerRound('don', null).players[0].last!
  const double = jokerRound('don', 'double').players[0].last!
  assert.equal(plain.outcome, 'win')
  assert.equal(double.tally.pot, 2 * plain.tally.pot)
})

test('sticky fingers: win the showdown, take one card from the rival into your deck (+1 card)', () => {
  const m = jokerRound('sticky', 'sticky')
  const [me, rival] = m.players
  assert.ok(me.last!.stolen)
  assert.equal(rival.last!.robbed!.id, me.last!.stolen!.id)
  assert.ok(me.pile.some(c => c.id === me.last!.stolen!.id))
  assert.equal(me.pile.length + me.discard.length, jokerRound('sticky', null).players[0].pile.length + jokerRound('sticky', null).players[0].discard.length + 1)
})

test('bluff: go max, the rival folds, +$5 extras. catalyst: four kings flambé into a ★2 instead of a ★1', () => {
  assert.equal(jokerRound('bluff', 'bluff', 'max', true).players[0].last!.tally.extras, 5)
  assert.equal(jokerRound('bluff', null, 'max', true).players[0].last!.tally.extras, 0)
  const plain = jokerRound('cat', null, 'forge').players[0].last!.forged!
  assert.equal(jokerRound('cat', 'catalyst', 'forge').players[0].last!.forged!.tier, plain.tier + 1)
})

test('joker cap: a third joker from a pack goes to the binder even if sorted to the deck', () => {
  let m = drive(newMatch(duel('cap')), 'shop', 2)
  const p = m.players[0]
  p.pile[0].joker = 'sticky'
  p.pile[1].joker = 'double'
  const card = newCard(m, 9, 'S', { joker: 'bluff' }) // ids off the match's own counter
  p.shop!.open = { cards: [card], collectible: null, codeCard: null }
  m = step(m, 0, { type: 'sortPack', toDeck: [card.id] }).match
  assert.ok(m.players[0].binder.some(c => c.id === card.id))
})

test('sleeves: only the shop right before a boss offers one', () => {
  let m = drive(newMatch(duel('sleeve')), 'shop', 2)
  assert.equal(m.players[0].shop!.offers.some(o => o.type === 'sleeve'), false)
  m = drive(m, 'shop', 3)
  assert.equal(m.players[0].shop!.offers.filter(o => o.type === 'sleeve').length, 1)
})
