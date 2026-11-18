// the deck, bulk, binder and the shop systems. expected numbers are hand-computed from DESIGN.md / V2.md
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newBulk, newCard, sellPrice, type Card, type JokerId, type Suit } from './cards.ts'
import { cleanup, deckSize, draw, refill, shuffleDeck, toDiscard } from './deck.ts'
import { draftRows, OFFERED } from './starters.ts'
import { appraise, emptyLevels } from './scoring.ts'
import { forgePlan } from './forge.ts'
import { DEFAULT_RULES } from './starters.ts'
import { keeperFor, type KeeperId } from './shop.ts'
import { stonksMult } from './sleeves.ts'
import { makeRng } from './rng.ts'
import {
  appraiseFor, binderPrice, defaultAction, defaultToDeck, freshness, newMatch, pending, resolveJokers, splitsStuck, step, stonks, view,
  type Match, type MatchConfig, type PhaseKind, type SeatId,
} from './match.ts'

const ids = { nextCardId: 1 }
const key = (c: Card) => `${c.rank}${c.suit}${c.tier}${c.finish}${c.stamp}`
const score = (cards: Card[]) =>
  appraise(cards, { levels: emptyLevels(), display: [], displaySlots: 5, deckSize: 24, bankroll: 20, ante: 2, betMax: false, twist: null, rng: null })
const piles = (n: number) => ({ hand: [] as Card[], pile: Array.from({ length: n }, (_, i) => newCard(ids, 2 + (i % 13), 'S')), discard: [] as Card[] })
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

// both seats plain at the first deal: no case, no levels, default rules, $20
function plainDeal(seed: string): Match {
  const m = drive(newMatch(duel(seed)), 'deal')
  for (const p of m.players) {
    p.display = []
    p.levels = emptyLevels()
    p.rules = { ...DEFAULT_RULES }
    p.bankroll = 20
  }
  return m
}

function setHand(m: Match, s: SeatId, spec: [number, Suit][]): Card[] {
  const p = m.players[s]
  p.pile.push(...p.hand)
  p.hand = spec.map(([r, su]) => newCard(m, r, su))
  return p.hand
}

// seat 0 plays these, seat 1 a lone 2 (7), bets min: KK-type hands knock out at table 1 and end the round
function knockout(m: Match, mine: Card[]): Match {
  const theirs = setHand(m, 1, [[2, 'C']])
  m = step(m, 0, { type: 'play', cardIds: mine.map(c => c.id) }).match
  m = step(m, 1, { type: 'play', cardIds: theirs.map(c => c.id) }).match
  while (m.phase === 'bet') m = step(m, pending(m)[0], { type: 'bet', choice: 'min' }).match
  return m
}

test('row draft: same stream same rows, 4 rows of 6, 3 rows = 18 cards for every box', () => {
  for (const id of OFFERED) {
    const a = draftRows('2026-11-16', id, { nextCardId: 1 })
    const b = draftRows('2026-11-16', id, { nextCardId: 1 })
    assert.equal(a.length, 4)
    for (const row of a) assert.equal(row.cards.length, 6)
    assert.deepEqual(a.map(r => r.cards.map(key)), b.map(r => r.cards.map(key)))
    assert.deepEqual(a.map(r => r.cards.map(c => c.id)), b.map(r => r.cards.map(c => c.id)))
  }
})

test('row draft: flambé box twins and the collector\'s 4 foils are always dealt, each in a different row', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    assert.deepEqual(draftRows(seed, 'forge', { nextCardId: 1 }).map(r => r.cards.filter(c => c.tier > 0).length).sort(), [0, 0, 1, 1])
    assert.deepEqual(draftRows(seed, 'collector', { nextCardId: 1 }).map(r => r.cards.filter(c => c.finish === 'foil').length), [1, 1, 1, 1])
  }
})

test('a round: shuffle 18, deal 8 = 10 left. play 3: discard 3, refill 3 = 7 left. cleanup puts all 18 back', () => {
  const p = piles(18)
  shuffleDeck(p, makeRng('t'))
  draw(p, 8)
  assert.equal(p.pile.length, 10)
  toDiscard(p, p.hand.slice(0, 3).map(c => c.id))
  assert.equal(p.hand.length, 5)
  refill(p, 8)
  assert.deepEqual([p.hand.length, p.pile.length, p.discard.length], [8, 7, 3])
  cleanup(p)
  assert.deepEqual([p.hand.length, p.pile.length, p.discard.length], [0, 18, 0])
})

test('running out: a refill with 2 cards left in the pile draws 2', () => {
  const p = piles(10)
  draw(p, 8)
  toDiscard(p, p.hand.slice(0, 5).map(c => c.id))
  refill(p, 8)
  assert.deepEqual([p.hand.length, p.pile.length], [5, 0])
})

test('the deal only depends on the seed and the cards: the same deck in a different order shuffles the same', () => {
  const a = piles(18)
  const b = { ...a, pile: a.pile.slice().reverse() }
  shuffleDeck(a, makeRng('same'))
  shuffleDeck(b, makeRng('same'))
  assert.deepEqual(a.pile.map(c => c.id), b.pile.map(c => c.id))
})

test('bulk scores +5 Value: KK + bulk = (10 + 10 + 10 + 5) × 2 = 70, bulk alone = (5 + 5) × 1 = 10, bulk never forges', () => {
  assert.equal(score([newCard(ids, 13, 'S'), newCard(ids, 13, 'H'), newBulk(ids, 1)]).total, 70)
  assert.equal(score([newBulk(ids, 1)]).total, 10)
  assert.equal(forgePlan([newBulk(ids, 1), newBulk(ids, 1)]), null)
})

test('bulk removal: $2 then $3, only at a shop with the bulk bin (a table\'s 2nd small shop)', () => {
  let m = drive(newMatch(duel('bin')), 'shop', 2)
  assert.throws(() => step(m, 0, { type: 'binBulk' }), /no bulk bin/)
  m = drive(m, 'shop', 3)
  const p = m.players[0]
  p.pile.push(newBulk(m, 1), newBulk(m, 1))
  p.bankroll = 20
  m = step(m, 0, { type: 'binBulk' }).match
  m = step(m, 0, { type: 'binBulk' }).match
  assert.equal(m.players[0].bankroll, 20 - 2 - 3)
  assert.equal(m.players[0].pile.filter(c => c.bulk).length, 0)
})

test('momentum: two rounds won earlier this table make the boss worth 2 × ante more: round 3, ante 4 → +8', () => {
  const m = plainDeal('mo')
  m.round = 3
  m.twists[0] = { id: 'sealed', suit: null } // a twist that can't change who wins
  m.players[0].tableWins = 2
  const next = knockout(m, setHand(m, 0, [[13, 'S'], [13, 'H']]))
  assert.equal(next.players[0].last!.outcome, 'win')
  assert.equal(next.players[0].last!.tally.momentum, 8)
})

test('gold border is once per round: 2 gold cards played are still one $3 side bet, +3 on the win', () => {
  const m = plainDeal('gold')
  const play = setHand(m, 0, [[13, 'S'], [13, 'H']])
  play[0].stamp = 'gold'
  play[1].stamp = 'gold'
  const next = knockout(m, play)
  assert.equal(next.players[0].last!.tally.extras, 3)
  assert.equal(next.players[1].last!.tally.extras, 0)
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

test('shipping: la poste $2 at the round 2 shop, away a round with its grade hidden, back in the deck graded at the next shop', () => {
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
  assert.throws(() => step(m, 0, { type: 'ship', cardId: b.id, shipper: 'poste' }), /no grading desk/) // the 2nd small shop has the bulk bin
})

test('shipping: chronopost ($4) and the armored van ($7) never come back 1-3, across 40 seeds', () => {
  for (const shipper of ['chrono', 'fourgon'] as const) {
    for (let i = 0; i < 20; i++) {
      let m = drive(newMatch(duel(`safe${i}`)), 'shop', 2)
      const card = m.players[0].pile[0]
      m.players[0].bankroll = 20
      m = step(m, 0, { type: 'ship', cardId: card.id, shipper }).match
      assert.equal(m.players[0].bankroll, 20 - (shipper === 'chrono' ? 4 : 7))
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

// 30 knockout rounds where seat 0 plays four damaged kings. 1 in 4 scoring damaged cards tear without archival
function tears(archival: boolean): number {
  let torn = 0
  for (let i = 0; i < 30; i++) {
    const m = plainDeal(`tear${i}`)
    if (archival) m.players[0].sleeves.push('archival')
    const play = setHand(m, 0, [[13, 'S'], [13, 'H'], [13, 'D'], [13, 'C']])
    for (const c of play) c.stamp = 'damaged'
    torn += knockout(m, play).players[0].last!.torn.length
  }
  return torn
}

test('pochette archive: damaged cards never tear (without it some do), and la poste comes back at least a 4', () => {
  assert.ok(tears(false) > 0)
  assert.equal(tears(true), 0)
  for (let i = 0; i < 20; i++) {
    let m = drive(newMatch(duel(`arch${i}`)), 'shop', 2)
    m.players[0].sleeves.push('archival')
    m.players[0].bankroll = 20
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

test('shopkeeper: grumpy is +$1 on every offer and one free restock, closing down is $1 off at Table 2', () => {
  const plain = shopWith([], 2).players[0].shop!
  const grumpy = shopWith(['grumpy'], 2)
  grumpy.players[0].shop!.offers.forEach((o, i) => assert.equal(o.price, plain.offers[i].price + 1))
  assert.equal(view(grumpy, 0).me.shop!.restockPrice, 0)
  const plain5 = shopWith([], 5).players[0].shop!
  shopWith(['closing'], 5).players[0].shop!.offers.forEach((o, i) => assert.equal(o.price, Math.max(1, plain5.offers[i].price - 1)))
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

test('small shop: 2 packs, 1 collectible, 1 scratcher. big shop: 3, 3 (one a × payoff), 2 and a pochette', () => {
  const count = (m: Match) => {
    const o = m.players[0].shop!.offers
    return ['pack', 'collectible', 'scratcher', 'sleeve'].map(t => o.filter(x => x.type === t).length)
  }
  const small = drive(newMatch(duel('shops')), 'shop', 2)
  assert.deepEqual(count(small), [2, 1, 1, 0])
  const big = drive(small, 'shop', 4)
  assert.deepEqual(count(big), [3, 3, 2, 1])
  const first = big.players[0].shop!.offers.find(o => o.type === 'collectible')!
  assert.equal(first.type === 'collectible' && ['les_jumeaux', 'sommelier', 'flamme_bleue', 'vitrine', 'petite_monnaie', 'ferrailleur', 'le_flambeur', 'bis', 'ligne_droite', 'commissaire'].includes(first.owned.id), true)
  // a restock rerolls the rest, never the pochette
  const pochette = big.players[0].shop!.offers.find(o => o.type === 'sleeve')!
  big.players[0].bankroll = 50
  const after = step(big, 0, { type: 'restock' }).match
  assert.deepEqual(after.players[0].shop!.offers.find(o => o.type === 'sleeve'), pochette)
})

test('beer-stained: dealing 3 pulls the stuck mate from deep in the pile (hand of 4), and a play must take both', () => {
  const p = piles(10)
  const beer = p.pile[0]
  const mate = p.pile[7]
  beer.knockoff = { kind: 'beer', stuckTo: mate.id }
  draw(p, 3)
  assert.equal(p.hand.length, 4)
  assert.ok(p.hand.includes(mate))
  assert.equal(splitsStuck(p.hand, [beer.id]), true)
  assert.equal(splitsStuck(p.hand, [mate.id]), true)
  assert.equal(splitsStuck(p.hand, [beer.id, mate.id]), false)
  assert.equal(splitsStuck(p.hand, [p.hand[1].id]), false)
})

test('scratchers: 1 per small shop at $3, the insert goes up your Sleeve (a grail resolves on the spot)', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 80; i++) {
    const fresh = newMatch(duel(`scr${i}`))
    fresh.keeper = [] // no sign, so prices are the base $3
    let m = drive(fresh, 'shop', 2)
    const p = m.players[0]
    p.binder.push(p.pile.shift()!)
    p.bankroll = 20
    const slot = p.shop!.offers.findIndex(o => o.type === 'scratcher')
    const r = step(m, 0, { type: 'buy', slot })
    m = r.match
    const ev = r.events.map(e => e.event).find(e => e.kind === 'scratched')
    if (ev?.kind !== 'scratched') throw new Error('no scratched event')
    seen.add(ev.insert)
    const me = m.players[0]
    if (ev.insert === 'grail') {
      assert.equal(me.sleeve.length, 0)
      assert.ok(ev.joker || ev.collectible)
    } else {
      assert.deepEqual(me.sleeve.map(c => c.id), [ev.insert])
      assert.equal(me.sleeve[0].hand !== null, ev.insert === 'code')
    }
    // a grail's collectible goes in the case, or sells for half ($4) when the case is full
    const sold = ev.collectible !== null && !me.display.some(o => o.id === ev.collectible!.id)
    assert.equal(me.bankroll, 20 - 3 + (sold ? 4 : 0))
  }
  assert.ok(seen.size >= 10, `saw ${[...seen].join(',')}`)
})

test('scratchers: a wishlist never comes up with an empty binder (it turns into a code)', () => {
  for (let i = 0; i < 80; i++) {
    let m = drive(newMatch(duel(`wish${i}`)), 'shop', 2)
    m.players[0].bankroll = 20
    const slot = m.players[0].shop!.offers.findIndex(o => o.type === 'scratcher')
    const ev = step(m, 0, { type: 'buy', slot }).events.map(e => e.event).find(e => e.kind === 'scratched')
    assert.notEqual(ev?.kind === 'scratched' && ev.insert, 'wishlist')
  }
})

test('jumbo takes 2 play slots: 4 cards with a jumbo lock, 5 do not', () => {
  const m = drive(newMatch(duel('jumbo')), 'deal')
  const hand = m.players[0].hand
  hand[0].variant = 'jumbo'
  assert.throws(() => step(m, 0, { type: 'play', cardIds: hand.slice(0, 5).map(c => c.id) }), /slots/)
  assert.doesNotThrow(() => step(m, 0, { type: 'play', cardIds: hand.slice(0, 4).map(c => c.id) }))
})

test('chase sells for $10 and defaults to the binder. rookie in the deck grows +1 value each shop (shops 3 and 4 = +2)', () => {
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
  draw(p, 6)
  assert.equal(splitsStuck(p.hand, [b.id, d.id]), true)
  assert.equal(splitsStuck(p.hand, [a.id, b.id, d.id]), false)
})

// round 1: seat 0 plays four kings and a 9 (the 9 carries the joker) against seat 1's lone 2: a knockout win.
// lose = seat 0 plays a lone 3 and seat 1 the four kings instead
function jokerRound(seed: string, joker: JokerId | null, bet: 'min' | 'max' = 'min', lose = false): Match {
  let m = plainDeal(seed)
  const kings = (s: SeatId) => {
    const cards = setHand(m, s, [[13, 'S'], [13, 'H'], [13, 'D'], [13, 'C'], [9, 'S']])
    if (s === 0) cards[4].joker = joker
    return cards
  }
  const mine = lose ? setHand(m, 0, [[3, 'C'], [9, 'S']]) : kings(0)
  if (lose) mine[1].joker = joker
  const theirs = lose ? kings(1) : setHand(m, 1, [[2, 'C']])
  m = step(m, 0, { type: 'play', cardIds: mine.map(c => c.id) }).match
  m = step(m, 1, { type: 'play', cardIds: theirs.map(c => c.id) }).match
  while (m.phase === 'bet') {
    const who = pending(m)[0]
    m = step(m, who, { type: 'bet', choice: who === 0 ? bet : 'min' }).match
  }
  return m
}

test('courtier counts as the J/Q/K that scores best: K K + courtier 2 = trips of kings, (30 + 10+10+10) × 3 = 180', () => {
  const m = newMatch(duel('court'))
  m.players[0].display = []
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

test('double or nothing: the same knockout round pays twice the pot (+2 → +4)', () => {
  const plain = jokerRound('don', null).players[0].last!
  const double = jokerRound('don', 'double').players[0].last!
  assert.equal(plain.outcome, 'win')
  assert.equal(plain.tally.pot, 2)
  assert.equal(double.tally.pot, 4)
})

test('sticky fingers: win the round with it played, take one card from the rival into your deck (+1 card)', () => {
  const m = jokerRound('sticky', 'sticky')
  const [me, rival] = m.players
  assert.ok(me.last!.stolen)
  assert.equal(rival.last!.robbed!.id, me.last!.stolen!.id)
  assert.ok(me.pile.some(c => c.id === me.last!.stolen!.id))
  assert.equal(deckSize(me), deckSize(jokerRound('sticky', null).players[0]) + 1)
})

test('poker face: lose a round on max with it played and the max comes back: −5 → −2', () => {
  assert.equal(jokerRound('poker', null, 'max', true).players[0].last!.tally.pot, -5)
  assert.equal(jokerRound('poker', 'bluff', 'max', true).players[0].last!.tally.pot, -2)
})

test('catalyst: four kings flambé into a ★2 instead of a ★1', () => {
  const forged = (joker: JokerId | null) => {
    let m = plainDeal('cat')
    const mine = setHand(m, 0, [[13, 'S'], [13, 'H'], [13, 'D'], [13, 'C'], [9, 'S']])
    mine[0].joker = joker
    const theirs = setHand(m, 1, [[2, 'C']])
    m = step(m, 0, { type: 'flamber', cardIds: mine.slice(0, 4).map(c => c.id), grind: null }).match
    m = step(m, 1, { type: 'play', cardIds: theirs.map(c => c.id) }).match
    while (m.phase === 'bet') m = step(m, pending(m)[0], { type: 'bet', choice: 'min' }).match
    return m.players[0].hand.find(c => c.tier > 0)!
  }
  assert.equal(forged('catalyst').tier, forged(null).tier + 1)
})

test('joker cap: a third joker from a pack goes to the binder even if sorted to the deck', () => {
  let m = drive(newMatch(duel('cap')), 'shop', 2)
  const p = m.players[0]
  p.pile[0].joker = 'sticky'
  p.pile[1].joker = 'double'
  const card = newCard(m, 9, 'S', { joker: 'bluff' }) // ids off the match's own counter
  p.shop!.open = { kind: 'repack', cards: [card], collectible: null, codeCard: null }
  m = step(m, 0, { type: 'sortPack', toDeck: [card.id] }).match
  assert.ok(m.players[0].binder.some(c => c.id === card.id))
})
