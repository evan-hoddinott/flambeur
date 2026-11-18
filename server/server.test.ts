// end to end against a real postgres, with a toy engine standing in for the real one (still stubs).
// needs TEST_DATABASE_URL pointing at a postgres server; each run makes and drops its own database.
//   docker run -d --name flambeur-pg -e POSTGRES_PASSWORD=dev -p 127.0.0.1:55432:5432 postgres:17
//   TEST_DATABASE_URL=postgres://postgres:dev@127.0.0.1:55432/postgres pnpm test:server
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import pg from 'pg'
import WebSocket from 'ws'
import type { Action, LogEntry, Match, MatchConfig, SeatId, SeatView } from '../src/engine/match.ts'
import type { Engine } from './actor.ts'
import { startServer } from './app.ts'
import { openDb, type Db } from './db.ts'

const ADMIN_URL = process.env.TEST_DATABASE_URL
if (!ADMIN_URL) throw new Error('TEST_DATABASE_URL is missing, see the top of server/server.test.ts')

// toy game: 2 rounds, both seats bet each round, max beats min, seat 0 wins ties. the secret is per seat
type Toy = Match & { bets: (string | null)[]; wins: number[]; secret: number[] }
const toy = (m: Match) => m as Toy
const toyEngine = {
  ENGINE_VERSION: 'toy-1',
  newMatch(config: MatchConfig): Match {
    const t = { engineVersion: 'toy-1', config, round: 1, phase: 'bet', players: [], pairs: [], twists: [], nextCardId: 1, n: 0, bets: [null, null], wins: [0, 0], secret: [11, 22] }
    return t as unknown as Match
  },
  step(m: Match, seat: SeatId, action: Action) {
    const t = structuredClone(toy(m))
    if (t.phase !== 'bet') throw new Error('match is over')
    if (action.type !== 'bet' || (action.choice !== 'min' && action.choice !== 'max')) throw new Error('only min or max')
    if (t.bets[seat] !== null) throw new Error('already bet')
    t.bets[seat] = action.choice
    t.n++
    const events: { to: SeatId | 'all'; event: never }[] = []
    if (t.bets.every(b => b !== null)) {
      t.wins[t.bets[1] === 'max' && t.bets[0] === 'min' ? 1 : 0]++
      t.bets = [null, null]
      t.round++
      events.push({ to: 'all', event: { kind: 'busted', seat: -1 } as never })
      if (t.round > 2) t.phase = 'over'
    }
    return { match: t as Match, events }
  },
  legal: () => [],
  view: (m: Match, seat: SeatId) => ({ round: m.round, phase: m.phase, mySecret: toy(m).secret[seat], wins: toy(m).wins } as unknown as SeatView),
  pending: (m: Match) => (m.phase === 'over' ? [] : [0, 1].filter(s => toy(m).bets[s] === null)),
  defaultAction: (): Action => ({ type: 'bet', choice: 'min' }),
  botAction: (): Action => ({ type: 'bet', choice: 'max' }),
  result(m: Match) {
    if (m.phase !== 'over') return null
    const w = toy(m).wins
    return { placement: w[0] >= w[1] ? [0, 1] : [1, 0], scores: [w[0] * 10, w[1] * 10], winner: w[0] >= w[1] ? 0 : 1 }
  },
  replay(config: MatchConfig, log: LogEntry[]): Match {
    let m = toyEngine.newMatch(config)
    for (const e of log) m = toyEngine.step(m, e.seat, e.action).match
    return m
  },
} as unknown as Engine

const DB_NAME = `flambeur_test_${process.pid}`
let admin: pg.Client
let db: Db
let srv: Awaited<ReturnType<typeof startServer>>
const PORT = 18787
const base = `http://127.0.0.1:${PORT}`
const opts = () => ({ port: PORT, engine: toyEngine, db, dailySecret: 'test-secret-0123456789', pod: 'test', staticDir: null, secureCookies: false })

before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`create database ${DB_NAME}`)
  const url = new URL(ADMIN_URL)
  url.pathname = `/${DB_NAME}`
  db = openDb(url.toString())
  srv = await startServer(opts())
})

after(async () => {
  await srv.close()
  await db.end()
  await admin.query(`drop database ${DB_NAME}`)
  await admin.end()
})

async function guest(name: string): Promise<string> {
  const res = await fetch(`${base}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
  assert.equal(res.status, 200, await res.clone().text())
  return res.headers.get('set-cookie')!.split(';')[0]
}

// a socket that buffers messages so tests can wait for the next one of a kind
function client(cookie: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { cookie } })
  const inbox: any[] = []
  const waiters: { t: string; ok: (m: any) => boolean; resolve: (m: any) => void }[] = []
  ws.on('message', raw => {
    const msg = JSON.parse(String(raw))
    const w = waiters.find(x => x.t === msg.t && x.ok(msg))
    if (w) {
      waiters.splice(waiters.indexOf(w), 1)
      w.resolve(msg)
    } else inbox.push(msg)
  })
  return {
    ws,
    send: (msg: object) => ws.send(JSON.stringify(msg)),
    next(t: string, ok: (m: any) => boolean = () => true, ms = 15_000): Promise<any> {
      const i = inbox.findIndex(m => m.t === t && ok(m))
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0])
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no ${t} within ${ms}ms`)), ms)
        waiters.push({ t, ok, resolve: m => { clearTimeout(timer); resolve(m) } })
      })
    },
    opened: () => new Promise(r => ws.once('open', r)),
  }
}

test('ws refuses a socket with no session (401)', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`)
  const status = await new Promise(r => ws.on('unexpected-response', (_req, res) => r(res.statusCode)))
  assert.equal(status, 401)
})

test('room code duel: both seats get only their own view, illegal moves are rejected, log is on disk', async () => {
  const a = client(await guest('alice'))
  const b = client(await guest('bob'))
  await a.next('hello')
  await b.next('hello')
  a.send({ t: 'room.create' })
  const { code } = await a.next('room')
  assert.match(code, /^[BCDFGHJKLMNPQRSTVWXZ]{5}$/)
  b.send({ t: 'room.join', code })
  const { matchId } = await a.next('matched')
  assert.equal((await b.next('matched')).matchId, matchId)
  a.send({ t: 'join', matchId })
  b.send({ t: 'join', matchId })
  assert.equal((await a.next('view')).view.mySecret, 11)
  assert.equal((await b.next('view')).view.mySecret, 22)

  a.send({ t: 'act', matchId, seq: 1, action: { type: 'bet', choice: 'max' } })
  await a.next('view', m => m.n === 1)
  a.send({ t: 'act', matchId, seq: 2, action: { type: 'bet', choice: 'max' } }) // already bet this round
  const rej = await a.next('reject')
  assert.deepEqual([rej.seq, rej.reason], [2, 'already bet'])

  // round 1: max vs min -> seat 0. round 2: min vs max -> seat 1
  b.send({ t: 'act', matchId, seq: 1, action: { type: 'bet', choice: 'min' } })
  await b.next('view', m => m.n === 2)
  a.send({ t: 'act', matchId, seq: 3, action: { type: 'bet', choice: 'min' } })
  b.send({ t: 'act', matchId, seq: 2, action: { type: 'bet', choice: 'max' } })
  const last = await a.next('view', m => m.n === 4)
  assert.deepEqual(last.view.wins, [1, 1])

  const rows = (await db.query('select n, seat, auto from match_actions where match_id = $1 order by n', [matchId])).rows
  assert.deepEqual(rows.map(r => r.n), [0, 1, 2, 3])
  assert.equal((await db.query('select status from matches where id = $1', [matchId])).rows[0].status, 'done')
  a.ws.close()
  b.ws.close()
})

test('daily vs bot: two runs, best and first score kept, attempts counted, seed hash published', async () => {
  const c = client(await guest('carol'))
  await c.next('hello')
  for (const choice of ['min', 'max']) { // run 1 loses both rounds (0), run 2 ties both (seat 0 wins ties: 20)
    c.send({ t: 'daily.start', difficulty: 'medium' })
    const { matchId } = await c.next('matched')
    c.send({ t: 'join', matchId })
    await c.next('view', m => m.matchId === matchId)
    for (let r = 0; r < 2; r++) {
      c.send({ t: 'act', matchId, seq: r, action: { type: 'bet', choice } })
      await c.next('view', m => m.matchId === matchId && m.view.round === r + 2, 5000)
    }
  }
  const board = await (await fetch(`${base}/api/daily?difficulty=medium`)).json()
  assert.deepEqual(board.best.map((r: any) => [r.name, r.kind, r.score, r.attempts]), [['carol', 'guest', 20, 2]])
  assert.deepEqual(board.first.map((r: any) => r.score), [0])
  assert.match(board.seedHash, /^[0-9a-f]{64}$/)
  c.ws.close()
})

test('timeout plays the default move (min) for an AFK seat, logged as auto', { timeout: 30_000 }, async () => {
  const d = client(await guest('dave'))
  const e = client(await guest('erin'))
  await d.next('hello')
  await e.next('hello')
  d.send({ t: 'queue' })
  await d.next('queued')
  e.send({ t: 'queue' })
  const { matchId } = await d.next('matched')
  d.send({ t: 'join', matchId })
  await d.next('view')
  d.send({ t: 'act', matchId, seq: 1, action: { type: 'bet', choice: 'max' } })
  // erin never acts: after 10s the server plays min for her
  const v = await d.next('view', m => m.n === 2, 15_000)
  assert.deepEqual(v.view.wins, [1, 0])
  const auto = (await db.query('select auto from match_actions where match_id = $1 and n = 1', [matchId])).rows[0].auto
  assert.equal(auto, true)
  d.ws.close()
  e.ws.close()
})

test('restart mid-match: the new server replays the log and the match carries on', async () => {
  // frank claims his guest as an account so he can log back in from a fresh "device" after the restart
  const fCookie = await guest('frank')
  const claimed = await fetch(`${base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: fCookie }, body: JSON.stringify({ name: 'frank', password: 'longenough' }) })
  assert.equal(claimed.status, 200, await claimed.clone().text())
  const f = client(fCookie)
  const g = client(await guest('gina'))
  await f.next('hello')
  await g.next('hello')
  f.send({ t: 'room.create' })
  g.send({ t: 'room.join', code: (await f.next('room')).code })
  const { matchId } = await f.next('matched')
  f.send({ t: 'join', matchId })
  await f.next('view')
  f.send({ t: 'act', matchId, seq: 1, action: { type: 'bet', choice: 'max' } })
  await f.next('view', m => m.n === 1)

  await srv.close()
  assert.equal((await f.next('restarting')).t, 'restarting')
  srv = await startServer(opts())

  const stranger = client(await guest('hank'))
  await stranger.next('hello')
  stranger.send({ t: 'join', matchId })
  assert.equal((await stranger.next('error')).error, 'not your match')

  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'frank', password: 'longenough' }) })
  assert.equal(login.status, 200)
  const back = client(login.headers.get('set-cookie')!.split(';')[0])
  assert.deepEqual((await back.next('hello')).active, [matchId])
  back.send({ t: 'join', matchId, lastN: 1 })
  assert.equal((await back.next('view')).n, 1)
  for (const s of [back, stranger, f, g]) s.ws.close()
})

test('login: wrong password and unknown name give the same error', async () => {
  const bad = (name: string) => fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password: 'nopenopenope' }) }).then(r => r.json())
  assert.deepEqual(await bad('frank'), await bad('nobody_here'))
})

test("the board never takes today+1 or later: that response would reveal today's seed", async () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const res = await fetch(`${base}/api/daily?difficulty=medium&day=${tomorrow}`)
  assert.equal(res.status, 400)
  assert.equal((await fetch(`${base}/api/daily?difficulty=medium&day=nonsense`)).status, 400)
})

test('a foreign Origin is refused on the socket and on posts', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { cookie: await guest('ivan'), origin: 'https://evil.example.com' } })
  assert.equal(await new Promise(r => ws.on('unexpected-response', (_req, res) => r(res.statusCode))), 403)
  const res = await fetch(`${base}/api/logout`, { method: 'POST', headers: { origin: 'https://evil.example.com' } })
  assert.equal(res.status, 403)
})
