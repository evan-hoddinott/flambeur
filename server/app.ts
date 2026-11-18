// http + websocket front door. auth and the leaderboard are plain http, everything in a match goes over /ws
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import type { Action } from '../src/engine/match.ts'
import { MAX_REJECTS, type Engine } from './actor.ts'
import {
  UserError, allow, clearCookie, createGuest, login, logout, newSession, playerFor, sessionCookie, signup, sweepLimits, type Player,
} from './auth.ts'
import { migrate, type Db } from './db.ts'
import { Lobby, utcDay } from './lobby.ts'

export type ServerOpts = {
  port: number
  engine: Engine
  db: Db
  dailySecret: string
  pod: string
  staticDir: string | null // the vite build. null in dev, vite serves the client and proxies here
  secureCookies: boolean
}

const MAX_BODY = 4096
const MAX_MESSAGE = 4096
const MSG_PER_SEC = 10 // per socket, burst of 20
const SOCKETS_PER_PLAYER = 3
const PING_MS = 25_000 // under cloudflare's idle cutoff
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
}

function ipOf(req: IncomingMessage): string {
  // cloudflare puts the real client in cf-connecting-ip. without the tunnel it's the socket address
  const cf = req.headers['cf-connecting-ip']
  return (typeof cf === 'string' && cf) || req.socket.remoteAddress || 'unknown'
}

// a browser always sends Origin on websockets and cross-site posts. a page on another *.example.com site
// gets our SameSite=Lax cookie, so anything with a foreign Origin is refused. no Origin = not a browser
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new UserError('body too big')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new UserError('expected a json object')
  return body
}

export async function startServer(opts: ServerOpts) {
  const { db } = opts
  const applied = await migrate(db)
  if (applied.length) console.log(JSON.stringify({ msg: 'migrated', applied }))
  const lobby = new Lobby({ engine: opts.engine, db, pod: opts.pod, dailySecret: opts.dailySecret })
  const recovered = await lobby.recover()
  console.log(JSON.stringify({ msg: 'recovered', ...recovered }))
  const sockets = new Map<number, Set<WebSocket>>() // player id -> open sockets
  let shuttingDown = false

  async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const ip = ipOf(req)
    if (req.method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'wrong origin' })
    const me = await playerFor(db, req)
    const cookie = (p: Player) => newSession(db, p.id).then(t => sessionCookie(t, opts.secureCookies))

    if (path === '/api/me' && req.method === 'GET') return send(res, 200, { player: me, active: me ? lobby.activeFor(me.id) : [] })
    if (path === '/api/guest' && req.method === 'POST') {
      if (me) return send(res, 200, { player: me })
      if (!allow(`new:${ip}`, 30, 3_600_000)) throw new UserError('too many new players from here, try later')
      const p = await createGuest(db, (await readJson(req)).name)
      return send(res, 200, { player: p }, { 'set-cookie': await cookie(p) })
    }
    if (path === '/api/signup' && req.method === 'POST') {
      const body = await readJson(req)
      // scrypt is expensive on purpose, so every path into it is limited per IP
      if (!allow(`new:${ip}`, 30, 3_600_000)) throw new UserError('too many new players from here, try later')
      const p = await signup(db, me, body.name, body.password)
      return send(res, 200, { player: p }, { 'set-cookie': await cookie(p) })
    }
    if (path === '/api/login' && req.method === 'POST') {
      const body = await readJson(req)
      // loose: the real lockout is per account. this only stops one IP spraying names
      if (!allow(`login:${ip}`, 60, 600_000)) throw new UserError('too many tries from here, wait a bit')
      const p = await login(db, body.name, body.password)
      return send(res, 200, { player: p }, { 'set-cookie': await cookie(p) })
    }
    if (path === '/api/logout' && req.method === 'POST') {
      await logout(db, req)
      return send(res, 200, { ok: true }, { 'set-cookie': clearCookie(opts.secureCookies) })
    }
    if (path === '/api/daily' && req.method === 'GET') {
      const url = new URL(req.url ?? '/', 'http://x')
      return send(res, 200, await lobby.leaderboard(url.searchParams.get('day') ?? utcDay(), url.searchParams.get('difficulty') ?? 'medium'))
    }
    send(res, 404, { error: 'not found' })
  }

  function serveStatic(res: ServerResponse, path: string): void {
    if (!opts.staticDir) return send(res, 404, { error: 'not found' })
    let decoded: string
    try {
      decoded = decodeURIComponent(path)
    } catch {
      return send(res, 400, { error: 'bad path' })
    }
    let file = normalize(join(opts.staticDir, decoded))
    if (file !== opts.staticDir && !file.startsWith(opts.staticDir + sep)) return send(res, 400, { error: 'bad path' })
    // anything that isn't a file is the app (room links like /r/BXKQT)
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(opts.staticDir, 'index.html')
    const hashed = file.includes('/assets/') // vite's hashed file names never change content
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    createReadStream(file).on('error', err => {
      console.error(JSON.stringify({ msg: 'static read failed', file, err: String(err) }))
      res.destroy()
    }).pipe(res)
  }

  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (path === '/healthz') return send(res, 200, { ok: true })
    if (path === '/readyz') {
      if (shuttingDown) return send(res, 503, { ok: false, why: 'shutting down' })
      db.query('select 1').then(() => send(res, 200, { ok: true }), err => send(res, 503, { ok: false, why: String(err) }))
      return
    }
    if (path.startsWith('/api/')) {
      api(req, res, path).catch(err => {
        if (err instanceof UserError || err instanceof SyntaxError) return send(res, 400, { error: err.message })
        console.error(JSON.stringify({ msg: 'api error', path, err: String(err?.stack ?? err) }))
        send(res, 500, { error: 'server error' })
      })
      return
    }
    serveStatic(res, path)
  })

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE })

  server.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (path !== '/ws' || shuttingDown) return void socket.destroy()
    if (!sameOrigin(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      return void socket.destroy()
    }
    playerFor(db, req).then(player => {
      if (!player) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        return void socket.destroy()
      }
      const open = sockets.get(player.id) ?? new Set()
      if (open.size >= SOCKETS_PER_PLAYER) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
        return void socket.destroy()
      }
      wss.handleUpgrade(req, socket, head, ws => onSocket(ws, player, ipOf(req)))
    }, err => {
      console.error(JSON.stringify({ msg: 'upgrade auth failed', err: String(err) }))
      socket.destroy()
    })
  })

  function onSocket(ws: WebSocket, player: Player, ip: string): void {
    const open = sockets.get(player.id) ?? new Set()
    open.add(ws)
    sockets.set(player.id, open)
    let tokens = 20
    let lastRefill = Date.now()
    let alive = true
    let rejects = 0
    const reply = (msg: object) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg))
    reply({ t: 'hello', player, active: lobby.activeFor(player.id), now: Date.now() })

    const ping = setInterval(() => {
      if (!alive) return ws.terminate()
      alive = false
      ws.ping()
    }, PING_MS)
    ws.on('pong', () => { alive = true })

    ws.on('message', raw => {
      const now = Date.now()
      tokens = Math.min(20, tokens + ((now - lastRefill) / 1000) * MSG_PER_SEC)
      lastRefill = now
      if (tokens < 1) return ws.close(4008, 'slow down')
      tokens--
      handle(String(raw)).catch(err => {
        if (err instanceof UserError || err instanceof SyntaxError) return reply({ t: 'error', error: err.message })
        console.error(JSON.stringify({ msg: 'ws error', player: player.id, err: String(err?.stack ?? err) }))
        reply({ t: 'error', error: 'server error' })
      })
    })

    ws.on('close', () => {
      clearInterval(ping)
      open.delete(ws)
      if (open.size === 0) sockets.delete(player.id)
      lobby.forget(ws)
      for (const a of lobby.actors.values()) a.detach(ws)
    })

    async function handle(raw: string): Promise<void> {
      const msg = JSON.parse(raw)
      if (typeof msg !== 'object' || msg === null || typeof msg.t !== 'string') throw new UserError('bad message')
      switch (msg.t) {
        case 'ping':
          return void reply({ t: 'pong', now: Date.now() })
        case 'queue': {
          const matched = await lobby.enqueue(player, ws)
          if (!matched) reply({ t: 'queued' })
          return
        }
        case 'leave':
          return lobby.forget(ws)
        case 'room.create':
          return void reply({ t: 'room', code: lobby.createRoom(player, ws) })
        case 'room.join':
          return lobby.joinRoom(player, ws, msg.code)
        case 'daily.start': {
          // loose on purpose: replays are allowed, this only stops a script grinding the board
          if (!allow(`daily:${player.id}`, 60, 3_600_000) || !allow(`daily-ip:${ip}`, 300, 3_600_000)) throw new UserError('too many daily runs, take a break')
          return void reply({ t: 'matched', matchId: await lobby.startDaily(player, msg.difficulty) })
        }
        case 'join': {
          const actor = lobby.actors.get(String(msg.matchId))
          if (!actor) throw new UserError('no such live match')
          const seat = actor.seatOf(player.id)
          if (seat === null) throw new UserError('not your match')
          for (const a of lobby.actors.values()) a.detach(ws) // one match per socket
          return actor.attach(seat, ws, Number.isInteger(msg.lastN) ? msg.lastN : -1)
        }
        case 'act': {
          const actor = lobby.actors.get(String(msg.matchId))
          const seat = actor?.seatOf(player.id) ?? null
          if (!actor || seat === null) throw new UserError('not in that match')
          if (typeof msg.action !== 'object' || msg.action === null || typeof msg.action.type !== 'string') throw new UserError('bad action')
          const why = await actor.submit(seat, msg.action as Action)
          // after the broadcast, so the client already has the view this action made
          if (why === null) return void reply({ t: 'ok', seq: msg.seq ?? null })
          reply({ t: 'reject', seq: msg.seq ?? null, reason: why })
          if (++rejects >= MAX_REJECTS) ws.close(4009, 'too many rejected actions')
          return
        }
        default:
          throw new UserError(`unknown message ${msg.t}`)
      }
    }
  }

  const sweeper = setInterval(() => {
    sweepLimits()
    lobby.sweep()
  }, 60_000)

  await new Promise<void>(resolve => server.listen(opts.port, resolve))
  console.log(JSON.stringify({ msg: 'listening', port: opts.port, pod: opts.pod, engine: opts.engine.ENGINE_VERSION }))

  // sigterm: stop taking matches, tell clients, close. live matches resume from their logs on the next pod
  async function close(): Promise<void> {
    shuttingDown = true
    clearInterval(sweeper)
    lobby.stop()
    for (const ws of wss.clients) {
      ws.send(JSON.stringify({ t: 'restarting' }))
      ws.close(1012, 'restarting')
    }
    await new Promise<void>(resolve => server.close(() => resolve()))
  }

  return { server, lobby, close }
}
