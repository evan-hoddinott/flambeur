// the "done when" for the match core: random legal play never breaks an invariant, replay matches the live match,
// state survives a JSON round trip, and no view leaks another seat's hidden cards
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { botAction, legal, newMatch, pending, replay, step, view, type LogEntry, type Match, type MatchConfig, type SeatId } from './match.ts'
import { makeRng, pick } from './rng.ts'

const seats = (n: number, firstHuman = false) =>
  Array.from({ length: n }, (_, i) => ({ kind: (firstHuman && i === 0 ? 'human' : 'bot') as 'human' | 'bot', name: `p${i}`, difficulty: 'medium' as const }))

// plays to the end. random = a random legal action for a random pending seat, bot = the bot policy
function play(config: MatchConfig, how: 'random' | 'bot', onStep?: (m: Match) => void): { m: Match; log: LogEntry[] } {
  const rng = makeRng(`fuzz:${config.seed}`)
  let m = newMatch(config)
  const log: LogEntry[] = []
  for (let guard = 0; m.phase !== 'over'; guard++) {
    if (guard > 20000) throw new Error(`${config.seed} never ended`)
    const s = how === 'random' ? pick(rng, pending(m)) : pending(m)[0]
    const action = how === 'random' ? pick(rng, legal(m, s)) : botAction(m, s)
    log.push({ seat: s, action })
    m = step(m, s, action).match
    onStep?.(m)
  }
  return { m, log }
}

// every card id in this seat's view, from "id":N
const idsIn = (v: unknown) => new Set([...JSON.stringify(v).matchAll(/"id":(\d+)/g)].map(x => Number(x[1])))

// another seat's hidden cards: hand (minus what showdown or peek legitimately reveals), pile, discard, binder
function leaks(m: Match, s: SeatId): number[] {
  const v = view(m, s)
  const seen = idsIn(v)
  const allowed = new Set<number>([
    ...(v.showdown?.theirCards ?? []).map(c => c.id), ...(v.bet?.peek ? [v.bet.peek.id] : []), ...v.others.flatMap(o => o.marked.map(c => c.id)),
  ])
  const out: number[] = []
  for (const p of m.players) {
    if (p.seat === s) continue
    for (const c of [...p.hand, ...p.pile, ...p.discard, ...p.binder]) if (seen.has(c.id) && !allowed.has(c.id)) out.push(c.id)
  }
  return out
}

test('fuzz: 2 seats, random legal moves, no throws, replay equals the live match', () => {
  for (let i = 0; i < 4; i++) {
    const config: MatchConfig = { mode: i % 2 ? 'duel' : 'solo', seed: `fz2-${i}`, seats: seats(2, i % 2 === 0) }
    const { m, log } = play(config, 'random')
    assert.ok(m.result)
    assert.deepEqual(replay(config, log), m)
  }
})

test('fuzz: 10 seat battle royale, random legal moves, replay equals the live match', () => {
  const config: MatchConfig = { mode: 'br', seed: 'fz10', seats: seats(10) }
  const { m, log } = play(config, 'random')
  assert.ok(m.result)
  assert.equal(m.result.placement.length, 10)
  assert.deepEqual(replay(config, log), m)
})

test('bots play solo, duel and br to a result. same seed = same match', () => {
  for (const [mode, n] of [['solo', 2], ['duel', 2], ['br', 6]] as const) {
    const config: MatchConfig = { mode, seed: `bots-${mode}`, seats: seats(n, mode === 'solo').map(s => ({ ...s, style: 'greedy' })) }
    const a = play(config, 'bot')
    const b = play(config, 'bot')
    assert.deepEqual(a.log, b.log)
    assert.ok(a.m.result)
  }
})

test('json round trip mid-match: a parsed copy plays on to the same end state', () => {
  const config: MatchConfig = { mode: 'duel', seed: 'json-trip', seats: seats(2).map(s => ({ ...s, style: 'greedy' })) }
  const { m: end, log } = play(config, 'bot')
  let m = newMatch(config)
  for (const [i, e] of log.entries()) {
    if (i === Math.floor(log.length / 2)) m = JSON.parse(JSON.stringify(m))
    m = step(m, e.seat, e.action).match
  }
  assert.deepEqual(m, end)
})

test('views never leak another seat\'s hand, pile, discard or binder (2 and 10 seats)', () => {
  for (const config of [
    { mode: 'duel', seed: 'leak2', seats: seats(2) },
    { mode: 'br', seed: 'leak10', seats: seats(10) },
  ] as MatchConfig[]) {
    // checking every seat every step is slow at 10 seats, so check whenever a phase changes plus every 7th step
    let last = ''
    let k = 0
    play(config, 'random', m => {
      if (m.phase === last && ++k % 7 !== 0) return
      last = m.phase
      for (const p of m.players) assert.deepEqual(leaks(m, p.seat), [], `seat ${p.seat} sees hidden cards in ${m.phase}`)
    })
  }
})

test('the own pile in a view is sorted, not in draw order', () => {
  let m = newMatch({ mode: 'duel', seed: 'sorted', seats: seats(2) })
  while (m.phase !== 'deal') m = step(m, pending(m)[0], botAction(m, pending(m)[0])).match
  const p = m.players[0]
  const shown = view(m, 0).me.pile.map(c => c.id)
  assert.deepEqual(shown.slice().sort(), p.pile.map(c => c.id).sort())
  assert.notDeepEqual(shown, p.pile.map(c => c.id))
})

test('step rejects out-of-turn and foreign actions, and the rejected match is untouched', () => {
  let m = newMatch({ mode: 'duel', seed: 'reject', seats: seats(2) })
  while (m.phase !== 'deal') m = step(m, pending(m)[0], botAction(m, pending(m)[0])).match
  const before = JSON.stringify(m)
  const theirCard = m.players[1].hand[0].id
  assert.throws(() => step(m, 0, { type: 'lock', cardIds: [theirCard] }))
  assert.throws(() => step(m, 0, { type: 'lock', cardIds: [] }))
  assert.throws(() => step(m, 0, { type: 'bet', choice: 'max' }))
  assert.throws(() => step(m, 0, { type: 'leaveShop' }))
  assert.throws(() => step(m, 7, { type: 'leaveShop' }))
  assert.equal(JSON.stringify(m), before)
  // and everything legal() lists is accepted
  for (const a of legal(m, 0).slice(0, 40)) assert.doesNotThrow(() => step(m, 0, a))
})

test('replay refuses a log from another engine version', () => {
  assert.throws(() => replay({ mode: 'duel', seed: 'v', seats: seats(2) }, [], '0.0.0-old'))
})
