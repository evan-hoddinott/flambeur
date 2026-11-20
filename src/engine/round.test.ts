// a v2 round: best of 3 hands, knockouts, flamber as a thrown hand, the self-bet money, le patron's marker,
// busting a solo rival, spoils, and every in-hand insert. expected numbers are hand-computed from docs/V2.md
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newBulk, newCard, type Card, type Suit } from './cards.ts'
import { deckSize } from './deck.ts'
import { emptyLevels } from './scoring.ts'
import { DEFAULT_RULES } from './starters.ts'
import { RIVAL_STACKS } from './economy.ts'
import type { Insert } from './shop.ts'
import {
  defaultAction, isKnockout, newMatch, pending, step, view, type Action, type Match, type MatchConfig, type PhaseKind, type SeatId,
} from './match.ts'

const duel = (seed: string): MatchConfig => ({ mode: 'duel', seed, seats: [{ kind: 'bot', name: 'a', difficulty: 'medium' }, { kind: 'bot', name: 'b', difficulty: 'medium' }] })
const solo = (seed: string): MatchConfig => ({ mode: 'solo', seed, seats: [{ kind: 'human', name: 'you' }, { kind: 'bot', name: 'rival', difficulty: 'medium' }] })

// timeout defaults until the match reaches this phase (and round)
function drive(m: Match, phase: PhaseKind, round = m.round): Match {
  for (let guard = 0; !(m.phase === phase && m.round === round); guard++) {
    if (guard > 5000 || m.phase === 'over') throw new Error(`never reached ${phase} in round ${round}`)
    const s = pending(m)[0]
    m = step(m, s, defaultAction(m, s)).match
  }
  return m
}

// both seats plain: no case, no levels, default rules, $20
function plain(m: Match, bank: [number, number] = [20, 20]): Match {
  for (const p of m.players) {
    p.display = []
    p.levels = emptyLevels()
    p.rules = { ...DEFAULT_RULES }
    p.bankroll = bank[p.seat]
  }
  return m
}

type Spec = [number, Suit][]
// these cards become the seat's hand (fresh ids off the match). the old hand goes back on the pile
function setHand(m: Match, s: SeatId, spec: Spec): Card[] {
  const p = m.players[s]
  p.pile.push(...p.hand)
  p.hand = spec.map(([r, su]) => newCard(m, r, su))
  return p.hand
}

const ids = (cards: Card[]) => cards.map(c => c.id)
const KK: Spec = [[13, 'S'], [13, 'H']] // pair of kings: (10 + 10 + 10) × 2 = 60
const QQ: Spec = [[12, 'S'], [12, 'H']] // 60
const NINES: Spec = [[9, 'S'], [9, 'H']] // (10 + 9 + 9) × 2 = 56
const AA: Spec = [[14, 'S'], [14, 'H']] // (10 + 11 + 11) × 2 = 64
const DEUCE: Spec = [[2, 'C']] // high card: (5 + 2) × 1 = 7

// one hand: both seats play these, the bets go the way `bets` says (min by default)
function hand(m: Match, mine: Spec, theirs: Spec, bets: Record<number, 'min' | 'max'> = {}, mineAs: Partial<Action> = {}): Match {
  const a = setHand(m, 0, mine)
  const b = setHand(m, 1, theirs)
  m = step(m, 0, { type: 'play', cardIds: ids(a), ...mineAs } as Action).match
  m = step(m, 1, { type: 'play', cardIds: ids(b) }).match
  while (m.phase === 'bet') {
    const s = pending(m)[0]
    m = step(m, s, { type: 'bet', choice: bets[s] ?? 'min' }).match
  }
  return m
}

const start = (seed: string, bank: [number, number] = [20, 20]) => plain(drive(newMatch(duel(seed)), 'deal'), bank)

test('2–0 ends after hand 2: pot +2, house 2 + 2×2 = 6, interest 2 → $30. the loser 20 − 2 + 2 + 2 = $22', () => {
  let m = start('b2-0')
  m = hand(m, KK, NINES)
  assert.equal(m.phase, 'deal')
  assert.equal(m.hand, 2)
  m = hand(m, KK, NINES)
  assert.equal(m.phase, 'spoils')
  const [me, them] = m.players
  assert.equal(me.last!.outcome, 'win')
  assert.deepEqual(me.last!.wins, [2, 0])
  assert.deepEqual([me.last!.tally.pot, me.last!.tally.house, me.last!.tally.interest], [2, 6, 2])
  assert.equal(me.bankroll, 30)
  assert.equal(them.bankroll, 22)
})

test('1–1 goes to hand 3', () => {
  let m = start('b1-1')
  m = hand(m, KK, NINES)
  m = hand(m, NINES, KK)
  assert.equal(m.phase, 'deal')
  assert.equal(m.hand, 3)
})

test('1–1 with a tied hand 3 goes to the higher total: 60+56+60 = 176 vs 56+64+60 = 180, seat 1 takes it', () => {
  let m = start('btotal')
  m = hand(m, KK, NINES)
  m = hand(m, NINES, AA)
  m = hand(m, KK, QQ)
  assert.equal(m.players[0].last!.outcome, 'loss')
  assert.equal(m.players[0].last!.margin, -4)
  assert.equal(m.players[1].last!.outcome, 'win')
})

test('three tied hands: a tie round, the max comes back, nobody gets the bonus. both get house +2', () => {
  let m = start('btie')
  m = hand(m, KK, QQ, { 0: 'max' })
  m = hand(m, KK, QQ)
  m = hand(m, KK, QQ)
  for (const p of m.players) {
    assert.equal(p.last!.outcome, 'tie')
    assert.equal(p.last!.tally.pot, 0)
    assert.equal(p.last!.tally.house, 2)
  }
})

test('knockout at each table\'s K: 6× at table 1, 8×, 10×, 12×, 12× in sudden death', () => {
  const m = newMatch(duel('kos'))
  for (const [round, k] of [[1, 6], [4, 8], [7, 10], [10, 12], [13, 12]]) {
    m.round = round
    assert.equal(isKnockout(m, 0, ['play', 'play'], [100 * k, 100]), true, `${k}× at round ${round}`)
    assert.equal(isKnockout(m, 0, ['play', 'play'], [100 * k - 1, 100]), false, `just under ${k}× at round ${round}`)
  }
  m.round = 1
  assert.equal(isKnockout(m, 0, ['play', 'flamber'], [500, 0]), false)
})

test('a knockout ends the round after hand 1: KK 60 vs a 2 (7) is 8.6×, past 6×, KO bonus 1 × $2', () => {
  let m = start('bko')
  m = hand(m, KK, DEUCE)
  assert.equal(m.phase, 'spoils')
  const r = m.players[0].last!
  assert.equal(r.ko, true)
  assert.equal(r.tally.ko, 2)
})

test('a thrown hand loses the hand but can\'t be knocked out, and reveals nothing', () => {
  let m = start('bthrow')
  const a = setHand(m, 0, [[9, 'S'], [2, 'C']])
  const b = setHand(m, 1, KK)
  m = step(m, 0, { type: 'flamber', cardIds: ids(a), grind: a[0].id }).match
  m = step(m, 1, { type: 'play', cardIds: ids(b) }).match
  while (m.phase === 'bet') m = step(m, pending(m)[0], { type: 'bet', choice: 'min' }).match
  assert.equal(m.phase, 'deal')
  assert.equal(m.hand, 2)
  const sd = view(m, 1).showdown!
  assert.equal(sd.winner, 1)
  assert.equal(sd.ko, false)
  assert.deepEqual(sd.theirCards, [])
})

test('flamber a pair: a K★ Twin comes straight back into your hand for hand 2, 1 Ash to the discard, deck size the same', () => {
  let m = start('bforge')
  const a = setHand(m, 0, KK)
  const before = deckSize(m.players[0])
  const b = setHand(m, 1, NINES)
  m = step(m, 0, { type: 'flamber', cardIds: ids(a), grind: null }).match
  m = step(m, 1, { type: 'play', cardIds: ids(b) }).match
  while (m.phase === 'bet') m = step(m, pending(m)[0], { type: 'bet', choice: 'min' }).match
  const me = m.players[0]
  const star = me.hand.find(c => c.tier === 1)!
  assert.equal(star.rank, 13)
  assert.deepEqual(star.traits, [{ kind: 'multi', count: 2 }])
  assert.equal(me.discard.filter(c => c.bulk).length, 1)
  assert.equal(deckSize(me), before)
})

test('flamber with no pair: the picked 9 comes back with +1 Value, the 2 goes to the discard', () => {
  let m = start('bgrind')
  const [nine, two] = setHand(m, 0, [[9, 'S'], [2, 'C']])
  const b = setHand(m, 1, NINES)
  m = step(m, 0, { type: 'flamber', cardIds: [nine.id, two.id], grind: nine.id }).match
  m = step(m, 1, { type: 'play', cardIds: ids(b) }).match
  while (m.phase === 'bet') m = step(m, pending(m)[0], { type: 'bet', choice: 'min' }).match
  const me = m.players[0]
  assert.equal(me.hand.find(c => c.id === nine.id)!.grind, 1)
  assert.ok(me.discard.some(c => c.id === two.id))
})

test('discards: toss 2, draw 2 (pile 10 → 8 → 6 → 4 → 2). classic has 4 a round, the 5th is refused. cold deck refuses the first', () => {
  let m = start('bdisc')
  const p = m.players[0]
  p.rules = { ...p.rules, discards: 4 }
  assert.equal(p.pile.length, 10) // 18 cards, 8 dealt
  for (let i = 0; i < 4; i++) {
    const before = m.players[0].pile.length
    m = step(m, 0, { type: 'discard', cardIds: ids(m.players[0].hand.slice(0, 2)) }).match
    assert.equal(m.players[0].hand.length, 8)
    assert.equal(m.players[0].pile.length, before - 2)
  }
  assert.throws(() => step(m, 0, { type: 'discard', cardIds: [m.players[0].hand[0].id] }), /no discards left/)
  const cd = start('bcold')
  cd.round = 3
  cd.twists[0] = { id: 'colddeck', suit: null }
  assert.throws(() => step(cd, 0, { type: 'discard', cardIds: [cd.players[0].hand[0].id] }), /cold deck/)
})

// solo: drive to the first spoils, call it round 3, set the bankroll, and walk into the round 4 big shop
function toBigShop(seed: string, bank: number): { m: Match; events: string[] } {
  let m = drive(newMatch(solo(seed)), 'spoils')
  m.round = 3
  m.players[0].bankroll = bank
  const events: string[] = []
  while (m.phase === 'spoils') {
    const s = pending(m)[0]
    const r = step(m, s, defaultAction(m, s))
    m = r.match
    for (const e of r.events) if (e.event.kind === 'patron') events.push(`${e.event.seat}:${e.event.due}:${e.event.paid}`)
  }
  return { m, events }
}

test("le patron collects $6 at the big shop door: $50 → $44, and the next payment shows $15", () => {
  const { m, events } = toBigShop('marker', 50)
  assert.deepEqual(events, ['0:6:true'])
  assert.equal(m.phase, 'shop')
  assert.equal(m.players[0].shop!.kind, 'big')
  assert.equal(m.players[0].bankroll, 44)
  assert.deepEqual(view(m, 0).me.marker, { due: 15, table: 2 })
})

test("can't cover le patron's $6 with $5: you're out, the run is lost with a score of 0", () => {
  const { m, events } = toBigShop('marker', 5)
  assert.deepEqual(events, ['0:6:false'])
  assert.equal(m.phase, 'over')
  assert.equal(m.result!.winner, 1)
  assert.equal(m.result!.scores[0], 0)
})

test('bust the round 2 rival ($1) with a knockout: round 3 is skipped for 2 × $4 = $8, next is the round 4 big shop and a $40 rival', () => {
  let m = plain(drive(newMatch(solo('bust')), 'deal', 2))
  m.players[1].bankroll = 1
  m = hand(m, KK, DEUCE)
  const me = m.players[0]
  assert.equal(me.last!.tally.skip, 8)
  assert.equal(m.phase, 'shop')
  assert.equal(m.round, 4)
  assert.equal(me.shop!.kind, 'big')
  assert.equal(m.players[1].alive, true)
  assert.equal(m.players[1].bankroll, RIVAL_STACKS[1])
  assert.equal(m.players[1].rival, m.rivals[1])
})

test('spoils: the loser picks first, a skip pays +$1, the winner picks, the last card burns', () => {
  let m = start('spoils')
  m = hand(m, KK, NINES)
  m = hand(m, KK, NINES)
  assert.deepEqual(pending(m), [1])
  const on = m.pairs[0].spoils!.cards.map(c => c.id)
  const bank = m.players[1].bankroll
  m = step(m, 1, { type: 'spoils', cardId: null }).match
  assert.equal(m.players[1].bankroll, bank + 1)
  assert.deepEqual(pending(m), [0])
  m = step(m, 0, { type: 'spoils', cardId: on[0] }).match
  assert.ok(m.players[0].pile.some(c => c.id === on[0]))
  const everywhere = m.players.flatMap(p => [...p.hand, ...p.pile, ...p.discard, ...p.binder]).map(c => c.id)
  assert.ok(!everywhere.includes(on[1]) && !everywhere.includes(on[2]))
})

test('spoils after a tie round: the lower bankroll ($20 vs $30) picks first', () => {
  let m = start('spoilstie', [30, 20])
  m = hand(m, KK, QQ)
  m = hand(m, KK, QQ)
  m = hand(m, KK, QQ)
  assert.equal(m.players[0].last!.outcome, 'tie')
  assert.deepEqual(pending(m), [1])
})

// ---------- inserts ----------

// seat 0 holds `spec` with this insert up its Sleeve, uses it on these hand positions
function useOn(seed: string, insert: Insert, spec: Spec, at: number[], suit: Suit | null = null): { m: Match; hand: Card[] } {
  const m = start(seed)
  const hand = setHand(m, 0, spec)
  m.players[0].sleeve = [{ id: insert, hand: insert === 'code' ? 'flush' : null }]
  const next = step(m, 0, { type: 'useInsert', slot: 0, cardIds: at.map(i => hand[i].id), suit }).match
  assert.equal(next.players[0].sleeve.length, 0)
  return { m: next, hand }
}
const held = (m: Match, c: Card) => m.players[0].hand.find(x => x.id === c.id)!

test('checklist: 9♠ and 2♣ become ♥', () => {
  const { m, hand } = useOn('i-check', 'checklist', [[9, 'S'], [2, 'C'], [5, 'D']], [0, 1], 'H')
  assert.deepEqual([held(m, hand[0]).suit, held(m, hand[1]).suit, held(m, hand[2]).suit], ['H', 'H', 'D'])
})

test('stylo: 9 → 10 and K → A. an ace can\'t go up', () => {
  const { m, hand } = useOn('i-stylo', 'stylo', [[9, 'S'], [13, 'C']], [0, 1])
  assert.deepEqual([held(m, hand[0]).rank, held(m, hand[1]).rank], [10, 14])
  const s = start('i-stylo2')
  const h = setHand(s, 0, [[14, 'S']])
  s.players[0].sleeve = [{ id: 'stylo', hand: null }]
  assert.throws(() => step(s, 0, { type: 'useInsert', slot: 0, cardIds: [h[0].id], suit: null }), /ace/)
})

test('broyeuse: 2 cards shredded for good, deck −2', () => {
  const m = start('i-shred')
  const hand = setHand(m, 0, [[9, 'S'], [2, 'C'], [5, 'D']])
  const before = deckSize(m.players[0])
  m.players[0].sleeve = [{ id: 'broyeuse', hand: null }]
  const next = step(m, 0, { type: 'useInsert', slot: 0, cardIds: [hand[1].id, hand[2].id], suit: null }).match
  assert.equal(deckSize(next.players[0]), before - 2)
  assert.deepEqual(ids(next.players[0].hand), [hand[0].id])
})

test('photocopie: the 2♣ becomes a copy of the foil K♥ (rank, suit, finish, stamp), keeping its own id', () => {
  const m = start('i-copy')
  const hand = setHand(m, 0, [[2, 'C'], [13, 'H']])
  hand[1].finish = 'foil'
  hand[1].stamp = 'signed'
  m.players[0].sleeve = [{ id: 'photocopie', hand: null }]
  const next = step(m, 0, { type: 'useInsert', slot: 0, cardIds: [hand[0].id, hand[1].id], suit: null }).match
  const copy = held(next, hand[0])
  assert.deepEqual([copy.rank, copy.suit, copy.finish, copy.stamp], [13, 'H', 'foil', 'signed'])
})

test('reprint: a copy of the holo 7♦ with a new id goes to the discard, deck +1', () => {
  const m = start('i-reprint')
  const hand = setHand(m, 0, [[7, 'D']])
  hand[0].finish = 'holo'
  const before = deckSize(m.players[0])
  m.players[0].sleeve = [{ id: 'reprint', hand: null }]
  const next = step(m, 0, { type: 'useInsert', slot: 0, cardIds: [hand[0].id], suit: null }).match
  const copy = next.players[0].discard.at(-1)!
  assert.notEqual(copy.id, hand[0].id)
  assert.deepEqual([copy.rank, copy.suit, copy.finish], [7, 'D', 'holo'])
  assert.equal(deckSize(next.players[0]), before + 1)
})

test('foil, holo and prism wraps set the finish', () => {
  for (const f of ['foil', 'holo', 'prism'] as const) {
    const { m, hand } = useOn(`i-${f}`, f, [[8, 'S']], [0])
    assert.equal(held(m, hand[0]).finish, f)
  }
})

test('tampon: a random 1st Edition, Signed or Gold Border, and the knockoff is gone', () => {
  const m = start('i-stamp')
  const hand = setHand(m, 0, [[8, 'S']])
  hand[0].knockoff = { kind: 'marked' }
  m.players[0].sleeve = [{ id: 'tampon', hand: null }]
  const next = step(m, 0, { type: 'useInsert', slot: 0, cardIds: [hand[0].id], suit: null }).match
  assert.ok(['first', 'signed', 'gold'].includes(held(next, hand[0]).stamp!))
  assert.equal(held(next, hand[0]).knockoff, null)
})

test('allumettes: K♠ K♥ merge into one K★ Twin in your hand now, 1 Bulk to the discard, no hand thrown', () => {
  const { m } = useOn('i-match', 'allumettes', [[13, 'S'], [13, 'H'], [4, 'D']], [0, 1])
  const me = m.players[0]
  assert.equal(me.hand.length, 2)
  const star = me.hand.find(c => c.tier === 1)!
  assert.deepEqual([star.rank, star.traits], [13, [{ kind: 'multi', count: 2 }]])
  assert.equal(me.discard.filter(c => c.bulk).length, 1)
  assert.equal(me.locked, null)
})

test('code: Flush goes up a level', () => {
  const { m } = useOn('i-code', 'code', [[8, 'S']], [])
  assert.equal(m.players[0].levels.flush, 1)
})

test('wishlist, in the shop: a binder card goes into the deck', () => {
  let m = drive(newMatch(duel('i-wish')), 'shop', 2)
  const card = newCard(m, 9, 'S')
  m.players[0].binder.push(card)
  m.players[0].sleeve = [{ id: 'wishlist', hand: null }]
  m = step(m, 0, { type: 'useInsert', slot: 0, cardIds: [card.id], suit: null }).match
  assert.ok(m.players[0].pile.some(c => c.id === card.id))
  assert.equal(m.players[0].binder.length, 0)
})

test('a hand insert can\'t be used in the shop, and a full Sleeve blocks the shop until you toss one', () => {
  let m = drive(newMatch(duel('i-full')), 'shop', 2)
  const p = m.players[0]
  p.pile.push(newBulk(m, 1))
  p.sleeve = [{ id: 'foil', hand: null }, { id: 'holo', hand: null }]
  p.overflow = { id: 'prism', hand: null }
  assert.throws(() => step(m, 0, { type: 'useInsert', slot: 0, cardIds: [p.pile[0].id], suit: null }), /during a round/)
  assert.throws(() => step(m, 0, { type: 'leaveShop' }), /Sleeve is full/)
  m = step(m, 0, { type: 'tossInsert', slot: 0 }).match
  assert.deepEqual(m.players[0].sleeve.map(c => c.id), ['holo', 'prism'])
  assert.equal(m.players[0].overflow, null)
})
