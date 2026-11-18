// one live match. it owns the full Match, runs one action at a time, writes each action to postgres
// before anyone sees it, sends every seat only its own view, and runs the clocks and the bots
import type { WebSocket } from 'ws'
import type * as EngineModule from '../src/engine/match.ts'
import type { Action, Event, Match, MatchConfig, MatchResult, PhaseKind, SeatId } from '../src/engine/match.ts'
import type { Db } from './db.ts'

export type Engine = typeof EngineModule
export type SeatPlayer = { playerId: number; name: string } | null // null = bot seat

// the Timers table in DESIGN.md (V2.md §16). the big shop between tables gets 45s
const PHASE_MS: Record<PhaseKind, number> = { draft: 45_000, shop: 20_000, deal: 20_000, bet: 10_000, spoils: 10_000, over: 0 }
const BIG_SHOP_MS = 45_000
const BOT_DELAY_MS = 700
const EVENTS_KEPT = 100 // enough to resume a short disconnect, older ones are just the view
export const MAX_REJECTS = 20 // a normal client almost never sends an illegal action

type Logged = { n: number; to: SeatId | 'all'; event: Event }

export class MatchActor {
  id: string
  config: MatchConfig
  match: Match
  seats: SeatPlayer[]
  over = false
  engine: Engine
  db: Db
  onEnd: (actor: MatchActor, result: MatchResult) => Promise<void>
  sockets: Set<WebSocket>[]
  deadlines: (number | null)[] // server ms epoch per seat, null = not on the clock
  rejects: number[]
  events: Logged[] = []
  chain: Promise<unknown> = Promise.resolve()
  phaseKey = ''
  clock: NodeJS.Timeout | null = null
  botClock: NodeJS.Timeout | null = null

  constructor(
    deps: { engine: Engine; db: Db; onEnd: (actor: MatchActor, result: MatchResult) => Promise<void> },
    id: string, config: MatchConfig, match: Match, seats: SeatPlayer[],
  ) {
    if (seats.length !== config.seats.length) throw new Error(`match ${id}: ${seats.length} players for ${config.seats.length} seats`)
    this.engine = deps.engine
    this.db = deps.db
    this.onEnd = deps.onEnd
    this.id = id
    this.config = config
    this.match = match
    this.seats = seats
    this.sockets = seats.map(() => new Set())
    this.deadlines = seats.map(() => null)
    this.rejects = seats.map(() => 0)
  }

  seatOf(playerId: number): SeatId | null {
    const i = this.seats.findIndex(s => s?.playerId === playerId)
    return i < 0 ? null : i
  }

  // queue a player's action. resolves to null when applied, or the reason it was rejected
  submit(seat: SeatId, action: Action): Promise<string | null> {
    return this.enqueue(seat, () => action, false)
  }

  // a timeout default or a bot move, picked inside the queue so it's computed from the state it'll apply to.
  // returns early if the seat stopped owing a move while it waited (a human acted right at the deadline)
  auto(seat: SeatId, kind: 'timeout' | 'bot'): Promise<string | null> {
    return this.enqueue(seat, () => {
      if (!this.engine.pending(this.match).includes(seat)) return null
      if (kind === 'bot') return this.engine.botAction(this.match, seat)
      const d = this.deadlines[seat]
      if (d === null || d > Date.now()) return null
      this.deadlines[seat] = null
      return this.engine.defaultAction(this.match, seat)
    }, true)
  }

  enqueue(seat: SeatId, pick: () => Action | null, auto: boolean): Promise<string | null> {
    const run = this.chain.then(() => {
      if (this.over) return 'match is over'
      const action = pick()
      return action ? this.apply(seat, action, auto) : null
    }).catch(err => {
      console.error(JSON.stringify({ msg: 'action failed', match: this.id, seat, auto, err: String(err?.stack ?? err) }))
      // re-arm the clocks, or a failed default/bot move (db blip, engine bug) would freeze the match for good
      if (!this.over) this.schedule()
      return 'server error'
    })
    this.chain = run
    return run
  }

  async apply(seat: SeatId, action: Action, auto: boolean): Promise<string | null> {
    let r
    try {
      r = this.engine.step(this.match, seat, action)
    } catch (err) {
      // the engine throws on anything illegal. the state we hold is untouched
      this.rejects[seat]++
      console.log(JSON.stringify({ msg: 'rejected', match: this.id, seat, action: action.type, auto, err: String(err) }))
      // a default or bot move the engine picked from this exact state can't be illegal: that's an engine bug
      if (auto) throw new Error(`engine rejected its own default/bot action: ${err}`)
      return String((err as Error).message ?? err)
    }
    const n = this.match.n
    if (r.match.n !== n + 1) throw new Error(`step moved n from ${n} to ${r.match.n}`)
    // on disk before anyone sees it
    await this.db.query('insert into match_actions (match_id, n, seat, action, auto) values ($1, $2, $3, $4, $5)', [this.id, n, seat, JSON.stringify(action), auto])
    this.match = r.match
    const fresh = r.events.map(e => ({ n: n + 1, ...e }))
    this.events.push(...fresh)
    if (this.events.length > EVENTS_KEPT) this.events.splice(0, this.events.length - EVENTS_KEPT)
    // the result (and a daily score) is saved before anyone sees the final view, same rule as the log
    const result = this.engine.result(this.match)
    if (result) await this.finish(result)
    else this.schedule()
    this.broadcast(fresh)
    return null
  }

  attach(seat: SeatId, ws: WebSocket, lastN: number): void {
    this.sockets[seat].add(ws)
    this.sendView(seat, ws, this.events.filter(e => e.n > lastN))
  }

  detach(ws: WebSocket): void {
    for (const set of this.sockets) set.delete(ws)
  }

  sendView(seat: SeatId, ws: WebSocket, events: Logged[]): void {
    const mine = events.filter(e => e.to === 'all' || e.to === seat).map(e => e.event)
    ws.send(JSON.stringify({
      t: 'view', matchId: this.id, n: this.match.n, view: this.engine.view(this.match, seat), events: mine, deadlines: this.deadlines,
    }))
  }

  broadcast(events: Logged[]): void {
    this.sockets.forEach((set, seat) => {
      for (const ws of set) this.sendView(seat, ws, events)
    })
  }

  // after every step: who's on the clock, and which bots owe a move
  schedule(): void {
    const now = Date.now()
    const key = `${this.match.round}:${this.match.hand}:${this.match.phase}` // a round locks up to 3 hands
    if (key !== this.phaseKey) {
      this.deadlines.fill(null)
      this.phaseKey = key
    }
    const pend = new Set(this.engine.pending(this.match))
    const phaseMs = this.match.phase === 'shop' && this.match.round % 3 === 1 ? BIG_SHOP_MS : PHASE_MS[this.match.phase]
    this.seats.forEach((player, seat) => {
      if (!player || !pend.has(seat) || phaseMs === 0) this.deadlines[seat] = null
      else this.deadlines[seat] ??= now + phaseMs
    })

    if (this.clock) clearTimeout(this.clock)
    const due = this.deadlines.filter((d): d is number => d !== null)
    if (due.length > 0) this.clock = setTimeout(() => this.timeouts(), Math.max(0, Math.min(...due) - now) + 5)

    const bots = [...pend].filter(seat => this.seats[seat] === null)
    if (this.botClock) clearTimeout(this.botClock)
    if (bots.length > 0) {
      this.botClock = setTimeout(() => {
        for (const seat of bots) void this.auto(seat, 'bot')
      }, BOT_DELAY_MS)
    }
  }

  // AFK: the seat's default action, same as the Timers table. it goes in the log like any move
  timeouts(): void {
    const now = Date.now()
    this.deadlines.forEach((d, seat) => {
      if (d !== null && d <= now) void this.auto(seat, 'timeout')
    })
  }

  // never throws: a failed save is logged loudly, and players still get their final view
  async finish(result: MatchResult): Promise<void> {
    this.over = true
    this.stopClocks()
    this.deadlines.fill(null)
    try {
      await this.db.query("update matches set status = 'done', result = $2, ended_at = now(), owner = null where id = $1", [this.id, JSON.stringify(result)])
      await this.onEnd(this, result)
    } catch (err) {
      console.error(JSON.stringify({ msg: 'saving match result failed', match: this.id, result, err: String((err as Error)?.stack ?? err) }))
    }
  }

  // a player started another daily: this run ends with no result and no score
  async abandon(): Promise<void> {
    this.over = true
    this.stopClocks()
    this.deadlines.fill(null)
    await this.db.query("update matches set status = 'abandoned', ended_at = now(), owner = null where id = $1", [this.id])
  }

  stopClocks(): void {
    if (this.clock) clearTimeout(this.clock)
    if (this.botClock) clearTimeout(this.botClock)
    this.clock = null
    this.botClock = null
  }
}
