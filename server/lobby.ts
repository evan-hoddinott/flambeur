// everything before and around a match: room codes, the quick-match queue, the daily, the live-match
// registry, and rebuilding live matches from their logs after a restart
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import type { WebSocket } from 'ws'
import type { Difficulty, LogEntry, MatchConfig, MatchResult, SeatConfig } from '../src/engine/match.ts'
import { MatchActor, type Engine, type SeatPlayer } from './actor.ts'
import { UserError, type Player } from './auth.ts'
import type { Db } from './db.ts'

const ROOM_TTL_MS = 10 * 60_000
const KEEP_FINISHED_MS = 10 * 60_000 // finished matches stay in memory a bit so a reconnect still sees the result
const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ' // no vowels, no rude words
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const MAX_LIVE_PER_PLAYER = 3 // a daily replaces your last daily, so this only bounds duels

type Waiting = { player: Player; ws: WebSocket }

export const utcDay = (now = new Date()) => now.toISOString().slice(0, 10)

export class Lobby {
  engine: Engine
  db: Db
  pod: string
  dailySecret: string
  actors = new Map<string, MatchActor>()
  rooms = new Map<string, Waiting & { created: number }>()
  queue: Waiting[] = []

  constructor(opts: { engine: Engine; db: Db; pod: string; dailySecret: string }) {
    if (opts.dailySecret.length < 16) throw new Error('DAILY_SECRET must be at least 16 characters')
    this.engine = opts.engine
    this.db = opts.db
    this.pod = opts.pod
    this.dailySecret = opts.dailySecret
  }

  // matches this player is seated in that aren't over, so a fresh tab can resume them
  activeFor(playerId: number): string[] {
    return [...this.actors.values()].filter(a => !a.over && a.seatOf(playerId) !== null).map(a => a.id)
  }

  checkRoom(player: Player): void {
    if (this.activeFor(player.id).length >= MAX_LIVE_PER_PLAYER) throw new UserError('finish a match before starting another')
  }

  createRoom(player: Player, ws: WebSocket): string {
    this.checkRoom(player)
    this.forget(ws)
    for (let tries = 0; tries < 20; tries++) {
      const code = Array.from(randomBytes(5), b => CODE_LETTERS[b % CODE_LETTERS.length]).join('')
      if (this.rooms.has(code)) continue
      this.rooms.set(code, { player, ws, created: Date.now() })
      return code
    }
    throw new Error('could not find a free room code')
  }

  async joinRoom(player: Player, ws: WebSocket, rawCode: unknown): Promise<void> {
    const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : ''
    const room = this.rooms.get(code)
    if (!room) throw new UserError('no room with that code')
    if (room.player.id === player.id) throw new UserError("that's your own room")
    this.checkRoom(player)
    this.rooms.delete(code)
    this.forget(ws)
    await this.startDuel(room, { player, ws })
  }

  async enqueue(player: Player, ws: WebSocket): Promise<boolean> {
    this.checkRoom(player)
    this.forget(ws)
    const other = this.queue.find(w => w.player.id !== player.id)
    if (!other) {
      this.queue.push({ player, ws })
      return false
    }
    this.queue = this.queue.filter(w => w !== other)
    await this.startDuel(other, { player, ws })
    return true
  }

  // a socket closed or moved on: drop it from the queue and close any room it was hosting
  forget(ws: WebSocket): void {
    this.queue = this.queue.filter(w => w.ws !== ws)
    for (const [code, room] of this.rooms) if (room.ws === ws) this.rooms.delete(code)
  }

  async startDuel(a: Waiting, b: Waiting): Promise<void> {
    const seats: SeatConfig[] = [{ kind: 'human', name: a.player.name }, { kind: 'human', name: b.player.name }]
    const id = await this.startMatch({ mode: 'duel', seed: randomBytes(8).toString('hex'), seats }, [
      { playerId: a.player.id, name: a.player.name }, { playerId: b.player.id, name: b.player.name },
    ])
    for (const w of [a, b]) w.ws.send(JSON.stringify({ t: 'matched', matchId: id }))
  }

  dailySeed(day: string): string {
    return createHmac('sha256', this.dailySecret).update(`daily:${day}`).digest('hex').slice(0, 16)
  }

  // the first start of the day pins the engine version. a deploy mid-day doesn't change that day's daily
  async dailyInfo(day: string): Promise<{ engineVersion: string; seedHash: string }> {
    const seedHash = createHash('sha256').update(this.dailySeed(day)).digest('hex')
    await this.db.query('insert into dailies (day, engine_version, seed_hash) values ($1, $2, $3) on conflict (day) do nothing', [day, this.engine.ENGINE_VERSION, seedHash])
    const r = await this.db.query<{ engine_version: string; seed_hash: string }>('select engine_version, seed_hash from dailies where day = $1', [day])
    return { engineVersion: r.rows[0].engine_version, seedHash: r.rows[0].seed_hash }
  }

  async startDaily(player: Player, rawDifficulty: unknown): Promise<string> {
    const difficulty = DIFFICULTIES.find(d => d === rawDifficulty)
    if (!difficulty) throw new UserError('difficulty: easy, medium or hard')
    const day = utcDay()
    const info = await this.dailyInfo(day)
    if (info.engineVersion !== this.engine.ENGINE_VERSION) {
      throw new UserError(`today's daily runs on version ${info.engineVersion}, it comes back at midnight UTC`)
    }
    // unlimited replays, one at a time: starting a new run ends your unfinished one (no score)
    for (const a of this.actors.values()) {
      if (a.config.mode !== 'daily' || a.over || a.seatOf(player.id) === null) continue
      await a.abandon()
      this.actors.delete(a.id)
    }
    const seats: SeatConfig[] = [{ kind: 'human', name: player.name }, { kind: 'bot', name: 'Rival', difficulty }]
    return this.startMatch({ mode: 'daily', seed: this.dailySeed(day), seats }, [{ playerId: player.id, name: player.name }, null])
  }

  async startMatch(config: MatchConfig, players: SeatPlayer[]): Promise<string> {
    const id = randomUUID()
    const match = this.engine.newMatch(config)
    const client = await this.db.connect()
    try {
      await client.query('begin')
      await client.query(
        "insert into matches (id, mode, config, engine_version, status, owner) values ($1, $2, $3, $4, 'live', $5)",
        [id, config.mode, JSON.stringify(config), match.engineVersion, this.pod],
      )
      for (const [seat, p] of players.entries()) {
        await client.query('insert into match_seats (match_id, seat, player_id) values ($1, $2, $3)', [id, seat, p?.playerId ?? null])
      }
      await client.query('commit')
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
    const actor = new MatchActor({ engine: this.engine, db: this.db, onEnd: (a, r) => this.onEnd(a, r) }, id, config, match, players)
    this.actors.set(id, actor)
    actor.schedule()
    console.log(JSON.stringify({ msg: 'match start', match: id, mode: config.mode, seats: players.map(p => p?.name ?? 'bot') }))
    return id
  }

  async onEnd(actor: MatchActor, result: MatchResult): Promise<void> {
    console.log(JSON.stringify({ msg: 'match end', match: actor.id, mode: actor.config.mode, result }))
    setTimeout(() => this.actors.delete(actor.id), KEEP_FINISHED_MS).unref()
    if (actor.config.mode === 'daily') {
      const seat = actor.seats.findIndex(s => s !== null)
      const player = actor.seats[seat]
      const difficulty = actor.config.seats.find(s => s.kind === 'bot')?.difficulty
      if (!player || !difficulty) throw new Error(`daily ${actor.id} without a human seat or a bot difficulty`)
      const r = await this.db.query<{ day: string }>("select to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day from matches where id = $1", [actor.id])
      await this.db.query(
        `insert into daily_best (day, difficulty, player_id, match_id, score, first_score, attempts, achieved_at, engine_version)
         values ($1, $2, $3, $4, $5, $5, 1, now(), $6)
         on conflict (day, difficulty, player_id) do update set
           attempts = daily_best.attempts + 1,
           score = greatest(daily_best.score, excluded.score),
           match_id = case when excluded.score > daily_best.score then excluded.match_id else daily_best.match_id end,
           achieved_at = case when excluded.score > daily_best.score then now() else daily_best.achieved_at end`,
        [r.rows[0].day, difficulty, player.playerId, actor.id, Math.round(result.scores[seat]), actor.match.engineVersion],
      )
    }
  }

  async leaderboard(day: string, rawDifficulty: unknown) {
    const difficulty = DIFFICULTIES.find(d => d === rawDifficulty)
    if (!difficulty) throw new UserError('difficulty: easy, medium or hard')
    // never today or later: the response reveals the day before's seed
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)) || day > utcDay()) throw new UserError('day: YYYY-MM-DD, today or earlier')
    const best = await this.db.query(
      `select p.name, p.kind, b.score, b.attempts from daily_best b join players p on p.id = b.player_id
       where b.day = $1 and b.difficulty = $2 order by b.score desc, b.achieved_at limit 50`, [day, difficulty])
    const first = await this.db.query(
      `select p.name, p.kind, b.first_score as score from daily_best b join players p on p.id = b.player_id
       where b.day = $1 and b.difficulty = $2 order by b.first_score desc, b.achieved_at limit 50`, [day, difficulty])
    // reading the board never pins the day's engine version, only starting a run does
    const pinned = await this.db.query<{ seed_hash: string }>('select seed_hash from dailies where day = $1', [day])
    const seedHash = pinned.rows[0]?.seed_hash ?? createHash('sha256').update(this.dailySeed(day)).digest('hex')
    const yesterday = utcDay(new Date(Date.parse(day) - 86_400_000))
    // commit-reveal: today's hash now, yesterday's seed in the open so anyone can replay it
    return { day, difficulty, seedHash, yesterday: { day: yesterday, seed: this.dailySeed(yesterday) }, best: best.rows, first: first.rows }
  }

  // after a restart: every live match is rebuilt by replaying its log. wrong engine version = abandoned, never replayed.
  // one replica owns everything, so it takes every live row. the owner/lease directory is for when there are many pods
  async recover(): Promise<{ resumed: number; abandoned: number }> {
    const live = await this.db.query<{ id: string; config: MatchConfig; engine_version: string }>(
      "select id, config, engine_version from matches where status = 'live'")
    let resumed = 0
    let abandoned = 0
    for (const row of live.rows) {
      try {
        if (row.engine_version !== this.engine.ENGINE_VERSION) throw new Error(`engine ${row.engine_version}, running ${this.engine.ENGINE_VERSION}`)
        const log = await this.db.query<{ seat: number; action: LogEntry['action']; auto: boolean }>(
          'select seat, action, auto from match_actions where match_id = $1 order by n', [row.id])
        const match = this.engine.replay(row.config, log.rows.map(l => ({ seat: l.seat, action: l.action, auto: l.auto })))
        if (match.n !== log.rows.length) throw new Error(`replayed ${match.n} of ${log.rows.length} actions`)
        const seats = await this.db.query<{ seat: number; player_id: string | null; name: string | null }>(
          'select s.seat, s.player_id, p.name from match_seats s left join players p on p.id = s.player_id where s.match_id = $1 order by s.seat', [row.id])
        const players: SeatPlayer[] = seats.rows.map(s => (s.player_id === null ? null : { playerId: Number(s.player_id), name: s.name ?? '?' }))
        await this.db.query('update matches set owner = $2 where id = $1', [row.id, this.pod])
        const actor = new MatchActor({ engine: this.engine, db: this.db, onEnd: (a, r) => this.onEnd(a, r) }, row.id, row.config, match, players)
        this.actors.set(row.id, actor)
        // died between logging the last action and saving the result: finish it now
        const result = this.engine.result(match)
        if (result) await actor.finish(result)
        else actor.schedule()
        resumed++
      } catch (err) {
        console.error(JSON.stringify({ msg: 'match abandoned on recovery', match: row.id, err: String(err) }))
        await this.db.query("update matches set status = 'abandoned', ended_at = now(), owner = null where id = $1", [row.id])
        abandoned++
      }
    }
    return { resumed, abandoned }
  }

  sweep(): void {
    const now = Date.now()
    for (const [code, room] of this.rooms) if (room.created + ROOM_TTL_MS < now) this.rooms.delete(code)
  }

  stop(): void {
    for (const a of this.actors.values()) a.stopClocks()
  }
}
