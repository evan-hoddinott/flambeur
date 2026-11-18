// expected numbers are hand-computed from DESIGN.md, not recomputed with the engine
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newCard, type Card, type Suit, type Trait } from './cards.ts'
import { evaluateHand } from './hands.ts'
import { appraise, emptyLevels } from './scoring.ts'
import { autoKeep, buildForged, forgePlan, grindCard } from './forge.ts'
import { starterOffer } from './starters.ts'

const ids = { nextCardId: 1 }
const c = (rank: number, suit: Suit, extra: Partial<Card> = {}) => newCard(ids, rank, suit, extra)
const forged = (rank: number, suit: Suit, tier: number, traits: Trait[], extra: Partial<Card> = {}) => c(rank, suit, { tier, traits, ...extra })
const score = (cards: Card[]) =>
  appraise(cards, { levels: emptyLevels(), display: [], displaySlots: 5, deckSize: 52, bankroll: 20, ante: 2, betMax: false, twist: null, rng: null })

test('pair of kings: (10 + 10 + 10) × 2 = 60', () => {
  const a = score([c(13, 'S'), c(13, 'H'), c(2, 'D'), c(5, 'C'), c(9, 'S')])
  assert.equal(a.hand, 'pair')
  assert.deepEqual(a.bonus, [])
  assert.equal(a.total, 60)
})

test('foil adds 30 value, prism doubles', () => {
  assert.equal(score([c(13, 'S', { finish: 'foil' }), c(13, 'H'), c(2, 'D'), c(5, 'C'), c(9, 'S')]).total, 120)
  assert.equal(score([c(13, 'S', { finish: 'prism' }), c(13, 'H'), c(2, 'D'), c(5, 'C'), c(9, 'S')]).total, 120)
})

test('K Twin ★1 alone is a pair: (10 + 10) × 2 = 40', () => {
  const a = score([forged(13, 'S', 1, [{ kind: 'multi', count: 2 }]), c(7, 'H'), c(4, 'D'), c(2, 'C'), c(9, 'S')])
  assert.equal(a.hand, 'pair')
  assert.equal(a.total, 40)
})

test('K Triplet ★2 + K is quads: value 60+10+10 = 80, hype 7 + 5 (★2) = 12, 960', () => {
  const a = score([forged(13, 'S', 2, [{ kind: 'multi', count: 3 }]), c(13, 'H'), c(4, 'D'), c(2, 'C'), c(9, 'S')])
  assert.equal(a.hand, 'quads')
  assert.equal(a.total, 960)
})

test('heart flush: (35 + 2 + 5 + 7 + 9 + 10) × 4 = 272', () => {
  const a = score([c(2, 'H'), c(5, 'H'), c(7, 'H'), c(9, 'H'), c(11, 'H')])
  assert.equal(a.hand, 'flush')
  assert.equal(a.total, 272)
})

test('natural straight flush is one hand: (100 + 5+6+7+8+9) × 8 = 1080', () => {
  const a = score([c(5, 'S'), c(6, 'S'), c(7, 'S'), c(8, 'S'), c(9, 'S')])
  assert.equal(a.hand, 'straightflush')
  assert.deepEqual(a.bonus, [])
  assert.equal(a.total, 1080)
})

test('natural royal flush: (150 + 10+10+10+10+11) × 10 = 2010', () => {
  const a = score([c(10, 'S'), c(11, 'S'), c(12, 'S'), c(13, 'S'), c(14, 'S')])
  assert.equal(a.hand, 'royalflush')
  assert.equal(a.total, 2010)
})

test('natural flush + 7 Twin gets a bonus pair: (35+10 + 2+5+7+9+10) × (4+2) = 468', () => {
  const a = score([c(2, 'H'), c(5, 'H'), forged(7, 'H', 1, [{ kind: 'multi', count: 2 }]), c(9, 'H'), c(11, 'H')])
  assert.equal(a.hand, 'flush')
  assert.deepEqual(a.bonus, ['pair'])
  assert.equal(a.total, 468)
})

test('9 10 J Q hearts + K★3 (Quad, Bridge, Wild) = straight flush + bonus quads', () => {
  // value 100 + 60 + 9+10+10+10+10 = 209, hype 8 + 7 + 10 (★3) = 25, grade 1 (★3) → 209 × 25 × 2
  const k = forged(13, 'C', 3, [{ kind: 'multi', count: 4 }, { kind: 'bridge' }, { kind: 'wild' }])
  const a = score([c(9, 'H'), c(10, 'H'), c(11, 'H'), c(12, 'H'), k])
  assert.equal(a.hand, 'straightflush')
  assert.deepEqual(a.bonus, ['quads'])
  assert.equal(a.total, 10450)
})

test('wild suit card completes a flush', () => {
  assert.equal(evaluateHand([c(2, 'H'), c(5, 'H'), c(7, 'H'), c(9, 'H'), forged(11, 'S', 1, [{ kind: 'wild' }])]).type, 'flush')
})

test('bridge card fills a straight and pair-of-kings stays the primary', () => {
  // K K + 9 10 + bridge Q: primary straight (9 10 Q? no, K K repeats) → kings pair, no straight
  const h = evaluateHand([c(13, 'S'), c(13, 'H'), c(9, 'D'), c(10, 'C'), forged(12, 'S', 1, [{ kind: 'bridge' }])])
  assert.equal(h.type, 'pair')
  // 9 10 J K + bridge 2: bridge fills the Q
  assert.equal(evaluateHand([c(9, 'S'), c(10, 'H'), c(11, 'D'), c(13, 'C'), forged(2, 'S', 1, [{ kind: 'bridge' }])]).type, 'straight')
})

test('wheel straight A2345: (35 + 11 + 2 + 3 + 4 + 5) × 4 = 240', () => {
  const a = score([c(14, 'S'), c(2, 'H'), c(3, 'D'), c(4, 'C'), c(5, 'S')])
  assert.equal(a.hand, 'straight')
  assert.equal(a.total, 240)
})

test('signed card scores twice: pair of 9s signed = (10 + 9 + 9 + 9) × 2 = 74', () => {
  const a = score([c(9, 'S', { stamp: 'signed' }), c(9, 'H'), c(2, 'D'), c(5, 'C'), c(13, 'S')])
  assert.equal(a.total, 74)
})

test('grind: high card A with +1 = (5 + 11 + 1) × 1 = 17', () => {
  assert.equal(score([c(2, 'C'), c(5, 'D'), c(8, 'S'), c(11, 'H'), c(14, 'S', { grind: 1 })]).total, 17)
})

test('forge a natural pair → ★1 Twin of that rank', () => {
  const p = forgePlan([c(13, 'S'), c(13, 'H'), c(2, 'D'), c(5, 'C'), c(9, 'S')])
  assert.ok(p)
  assert.equal(p.rank, 13)
  assert.equal(p.tier, 1)
  assert.deepEqual(p.candidates, [{ kind: 'multi', count: 2 }])
  assert.equal(p.merged.length, 2)
})

test('two K Twins forge into ★2 Quad (they make quads together)', () => {
  const p = forgePlan([forged(13, 'S', 1, [{ kind: 'multi', count: 2 }]), forged(13, 'H', 1, [{ kind: 'multi', count: 2 }]), c(2, 'D'), c(5, 'C'), c(9, 'S')])
  assert.ok(p)
  assert.equal(p.tier, 2)
  assert.deepEqual(p.candidates, [{ kind: 'multi', count: 4 }])
})

test('cross forge: straight with a K Quad ★2 → K★3 with Quad + Bridge', () => {
  const p = forgePlan([c(10, 'S'), c(11, 'H'), c(12, 'D'), c(14, 'C'), forged(13, 'S', 2, [{ kind: 'multi', count: 4 }])])
  assert.ok(p)
  assert.equal(p.rank, 13)
  assert.equal(p.tier, 3)
  assert.deepEqual(p.candidates, [{ kind: 'multi', count: 4 }, { kind: 'bridge' }])
})

test('over the trait cap the strongest traits are kept', () => {
  // flush containing a K★1 Bridge (tier → 2, slots 2) with Twin also merged → bridge, twin, wild = 3 candidates
  const p = forgePlan([forged(13, 'H', 1, [{ kind: 'bridge' }]), forged(4, 'H', 1, [{ kind: 'multi', count: 2 }]), c(2, 'H'), c(7, 'H'), c(9, 'H')])
  assert.ok(p)
  assert.equal(p.tier, 2)
  assert.equal(p.candidates.length, 3)
  assert.deepEqual(autoKeep(p).map(t => t.kind), ['multi', 'wild'])
})

test('high card cannot be forged', () => {
  assert.equal(forgePlan([c(2, 'C'), c(5, 'D'), c(8, 'S'), c(11, 'H'), c(14, 'S')]), null)
})

test('a lone forged pair card cannot re-forge itself', () => {
  assert.equal(forgePlan([forged(13, 'S', 1, [{ kind: 'multi', count: 2 }]), c(7, 'H'), c(4, 'D'), c(2, 'C'), c(9, 'S')]), null)
})

test('10 J Q A + K Quad ★2: quads + bonus straight = (60+35 + 10+10+10+11+10) × (7+4+5) = 2336', () => {
  const a = score([c(10, 'S'), c(11, 'H'), c(12, 'D'), c(14, 'C'), forged(13, 'S', 2, [{ kind: 'multi', count: 4 }])])
  assert.equal(a.hand, 'quads')
  assert.deepEqual(a.bonus, ['straight'])
  assert.equal(a.total, 2336)
})

test('plain cards never combo: flush with a duplicate natural pair is just a flush', () => {
  const a = score([c(13, 'H'), c(13, 'H'), c(2, 'H'), c(5, 'H'), c(9, 'H')])
  assert.equal(a.hand, 'flush')
  assert.deepEqual(a.bonus, [])
})

test('picked traits still forge after the plan is rebuilt (chooser → finishRound)', () => {
  const hand = [forged(13, 'S', 1, [{ kind: 'multi', count: 2 }]), forged(13, 'H', 1, [{ kind: 'bridge' }]), c(5, 'D'), c(5, 'C'), c(9, 'S')]
  const first = forgePlan(hand)
  const second = forgePlan(hand)
  assert.ok(first && second)
  assert.doesNotThrow(() => buildForged(second, autoKeep(first), 1, ids))
})

test('a no-pair flamber grinds the picked card in place, keeping stamp and grade. bulk can not be ground', () => {
  const ace = c(14, 'S', { stamp: 'gold', grade: 9, grind: 2 })
  assert.equal(grindCard(ace), ace)
  assert.equal(ace.grind, 3)
  assert.equal(ace.stamp, 'gold')
  assert.equal(ace.grade, 9)
  assert.throws(() => grindCard(c(2, 'S', { bulk: true })))
})

// scoring order: the case triggers left to right and a × multiplies the hype built up so far
const withCase = (cards: Card[], ids: string[]) =>
  appraise(cards, { levels: emptyLevels(), display: ids.map(id => ({ id, param: null })), displaySlots: 5, deckSize: 18, bankroll: 20, ante: 2, betMax: false, twist: null, rng: null })

test('order matters: KK with Lucky Penny then Les Jumeaux = 30 × (2 + 4) × 1.5 = 270, the other way round 30 × (2 × 1.5 + 4) = 210', () => {
  const kk = () => [c(13, 'S'), c(13, 'H')]
  assert.equal(withCase(kk(), ['penny_sleeve', 'les_jumeaux']).total, 270)
  assert.equal(withCase(kk(), ['les_jumeaux', 'penny_sleeve']).total, 210)
})

test('hype goes fractional and the total rounds down: 2-6 pair of 3s with Petite Monnaie = (10 + 3 + 3) × 2 × 1.25 × 1.25 = 50', () => {
  const a = withCase([c(3, 'S'), c(3, 'H')], ['petite_monnaie'])
  assert.equal(a.hype, 3.125)
  assert.equal(a.total, 50)
})

test('ligne droite ×2.5 on a straight: (35 + 2+3+4+5+6) × 4 × 2.5 = 550. bis !: a signed 9 pair scores 3 times = (10 + 9×3 + 9) × 2 = 92', () => {
  assert.equal(withCase([c(2, 'S'), c(3, 'H'), c(4, 'D'), c(5, 'C'), c(6, 'S')], ['ligne_droite']).total, 550)
  assert.equal(withCase([c(9, 'S', { stamp: 'signed' }), c(9, 'H')], ['bis']).total, 92)
})

test('flush + K pair with a Wild 9 forges a K (anchored to the pair), not a 9', () => {
  const p = forgePlan([forged(9, 'S', 1, [{ kind: 'wild' }]), c(13, 'H'), c(13, 'H'), c(4, 'H'), c(2, 'H')])
  assert.ok(p)
  assert.equal(p.rank, 13)
})

test('two Splits with different ranks both stay as candidates', () => {
  // K Split/7 ★1 + K Split/4 ★1 + 9 9 2: kings pair + nines pair → two pair, new card keeps both splits
  const p = forgePlan([forged(13, 'S', 1, [{ kind: 'split', rank: 7 }]), forged(13, 'H', 1, [{ kind: 'split', rank: 4 }]), c(9, 'D'), c(9, 'C'), c(2, 'S')])
  assert.ok(p)
  const splits = p.candidates.filter(t => t.kind === 'split').map(t => (t as { rank: number }).rank).sort((a, b) => a - b)
  assert.deepEqual(splits, [4, 7, 9])
})

test('crayon joins the pair: 9 9 + crayon is trips, (30 + 9 + 9 + 0) × 3 = 144', () => {
  const a = score([c(9, 'S'), c(9, 'H'), c(5, 'D', { knockoff: { kind: 'crayon' } }), c(2, 'C'), c(4, 'S')])
  assert.equal(a.hand, 'trips')
  assert.equal(a.total, 144)
})

test('crayon turns two pair into a full house: (45 + 10+10+7+7+0) × 4 = 316', () => {
  const a = score([c(13, 'S'), c(13, 'H'), c(7, 'D'), c(7, 'C'), c(2, 'S', { knockoff: { kind: 'crayon' } })])
  assert.equal(a.hand, 'fullhouse')
  assert.equal(a.total, 316)
})

test('crayon fills a straight gap: 5 6 7 _ 9 = (35 + 5+6+7+0+9) × 4 = 248', () => {
  const a = score([c(5, 'S'), c(6, 'H'), c(7, 'D'), c(9, 'C'), c(2, 'S', { knockoff: { kind: 'crayon' } })])
  assert.equal(a.hand, 'straight')
  assert.deepEqual(a.bonus, [])
  assert.equal(a.total, 248)
})

test('crayon counts as any rank, so its printed 3 never triggers Low Ball: 9 9 + crayon = trips (30 + 9 + 9 + 0) × 3 = 144', () => {
  const a = withCase([c(9, 'S'), c(9, 'H'), c(3, 'D', { knockoff: { kind: 'crayon' } })], ['low_ball'])
  assert.equal(a.hand, 'trips')
  assert.equal(a.total, 144)
})

test('a lone crayon is a high card that counts as an ace', () => {
  assert.deepEqual(evaluateHand([c(4, 'D', { knockoff: { kind: 'crayon' } })]).mainRanks, [14])
})

test('wrong suit ♠ that also counts as ♥ makes a heart flush: (35 + 2+5+7+9+10) × 4 = 272', () => {
  const a = score([c(2, 'H'), c(5, 'H'), c(7, 'H'), c(9, 'H'), c(10, 'S', { knockoff: { kind: 'wrongsuit', suit: 'H' } })])
  assert.equal(a.hand, 'flush')
  assert.equal(a.total, 272)
})

test('marked king: pair of kings 60 × 2^1 = 120. beer-stained king: 30 × (2 + 6) = 240', () => {
  assert.equal(score([c(13, 'S', { knockoff: { kind: 'marked' } }), c(13, 'H'), c(2, 'D'), c(5, 'C'), c(9, 'S')]).total, 120)
  assert.equal(score([c(13, 'S', { knockoff: { kind: 'beer', stuckTo: 999 } }), c(13, 'H'), c(2, 'D'), c(5, 'C'), c(9, 'S')]).total, 240)
})

test('jumbo 9 scores its value 3×: pair of 9s = (10 + 27 + 9) × 2 = 92', () => {
  assert.equal(score([c(9, 'S', { variant: 'jumbo' }), c(9, 'H'), c(2, 'D'), c(5, 'C')]).total, 92)
})

test('sticker K next to a foil K wears foil too: (10 + 10+30 + 10+30) × 2 = 180', () => {
  assert.equal(score([c(13, 'S', { variant: 'sticker' }), c(13, 'H', { finish: 'foil' }), c(2, 'D'), c(5, 'C'), c(9, 'S')]).total, 180)
})

test('sticker copies the best finish played, even off a non-scoring card: prism beats holo, 30 × (2+4) × 2^1 = 360', () => {
  assert.equal(score([c(13, 'S', { variant: 'sticker' }), c(13, 'H', { finish: 'holo' }), c(9, 'D', { finish: 'prism' }), c(2, 'C'), c(5, 'S')]).total, 360)
})

test('starter box offer is 3 different decks and the same for the same seed', () => {
  const a = starterOffer('2026-11-16')
  assert.equal(new Set(a).size, 3)
  assert.deepEqual(starterOffer('2026-11-16'), a)
})
