// the tutorial's seeded first run (docs/TUTORIAL.md): the fée forces hand 1 as your best play, then Max. a balance
// change that moves this seed breaks the demo, so it fails here first. sim/firstseed.ts finds a new seed
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { botAction } from './bot.ts'
import { autoDraft } from './starters.ts'
import { bestPlay, newMatch, pending, step, view, type Match } from './match.ts'

// main.ts's firstRun: PREMIERE-17, Classic, rows auto-drafted, an easy rival. the house style plays you after hand 1
function firstRun(): Match {
  let m = newMatch({ mode: 'solo', seed: 'PREMIERE-17', seats: [{ kind: 'human', name: 'You', style: 'house' }, { kind: 'bot', name: 'Rival', difficulty: 'easy' }] })
  m = step(m, 0, { type: 'pickBox', box: 'classic' }).match
  return step(m, 0, { type: 'draft', rows: autoDraft(m.players[0].draft!.rows!) }).match
}

test('first run, hand 1: the forced play is the 9–K straight, it beats the full house 336 to 304, and Max wins round 1 by K.O.', () => {
  let m = firstRun()
  const best = bestPlay(m, m.players[0])
  assert.equal(best.est.hand, 'straight')
  assert.deepEqual(best.played.map(c => c.rank).sort((a, b) => a - b), [9, 10, 11, 12, 13])
  m = step(m, 0, { type: 'play', cardIds: best.played.map(c => c.id) }).match
  let hand1 = null
  while (m.round === 1 && m.phase !== 'over') {
    const seat = pending(m)[0]
    const bet = seat === 0 && m.phase === 'bet' && m.hand === 1
    m = step(m, seat, bet ? { type: 'bet', choice: 'max' } : botAction(m, seat)).match
    const sd = view(m, 0).showdown
    if (sd?.hand === 1) hand1 ??= sd
  }
  assert.equal(hand1?.mine?.total, 336)
  assert.equal(hand1?.theirs?.hand, 'fullhouse')
  assert.equal(hand1?.theirs?.total, 304)
  const r1 = view(m, 0).last!
  assert.equal(r1.outcome, 'win')
  assert.equal(r1.ko, true)
})
