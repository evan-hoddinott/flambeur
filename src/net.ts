// the browser side of online play. auth over http, everything else over one websocket that reconnects on its own
// and resumes the match it was in. the server is the authority: this only sends intents and renders views
import type { Action, Event, SeatView } from './engine/match.ts'

export type PlayerInfo = { id: number; name: string; kind: 'guest' | 'account' }

export type ViewMsg = { t: 'view'; matchId: string; n: number; view: SeatView; events: Event[]; deadlines: (number | null)[] }
export type ServerMsg =
  | ViewMsg
  | { t: 'hello'; player: PlayerInfo; active: string[]; now: number }
  | { t: 'matched'; matchId: string }
  | { t: 'queued' }
  | { t: 'room'; code: string }
  | { t: 'ok'; seq: number | null }
  | { t: 'reject'; seq: number | null; reason: string }
  | { t: 'error'; error: string }
  | { t: 'pong'; now: number }
  | { t: 'restarting' }

// throws the server's message on any non-2xx
export async function api<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(path, body === undefined
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `${path} failed (${res.status})`)
  return data
}

export type Status = 'connecting' | 'online' | 'offline'

const BACKOFF_MS = [500, 1000, 2000, 5000]

export function connect(onMsg: (msg: ServerMsg) => void, onStatus: (s: Status) => void) {
  let ws: WebSocket | null = null
  let tries = 0
  let closed = false
  let seq = 0
  let matchId: string | null = sessionStorage.getItem('fl:match')
  let lastN = -1
  let offsetMs = 0 // server clock - our clock, for drawing deadlines
  let pinger: ReturnType<typeof setInterval> | null = null

  const raw = (msg: object) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  function open(): void {
    onStatus('connecting')
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
    const sock = new WebSocket(url)
    ws = sock
    sock.onopen = () => {
      tries = 0
      onStatus('online')
      if (matchId) raw({ t: 'join', matchId, lastN })
      pinger = setInterval(() => raw({ t: 'ping' }), 20_000)
    }
    sock.onmessage = e => {
      const msg = JSON.parse(e.data) as ServerMsg
      if (msg.t === 'hello' || msg.t === 'pong') offsetMs = msg.now - Date.now()
      if (msg.t === 'matched') join(msg.matchId)
      // a fresh tab: pick up the match this player is already in
      if (msg.t === 'hello' && !matchId && msg.active.length > 0) join(msg.active[0])
      if (msg.t === 'view' && msg.matchId === matchId) lastN = msg.n
      if (msg.t === 'error' && msg.error === 'no such live match' && matchId) forgetMatch()
      onMsg(msg)
    }
    sock.onclose = () => {
      if (pinger) clearInterval(pinger)
      ws = null
      onStatus('offline')
      if (closed) return
      setTimeout(open, BACKOFF_MS[Math.min(tries++, BACKOFF_MS.length - 1)])
    }
  }

  function join(id: string): void {
    if (id !== matchId) lastN = -1
    matchId = id
    sessionStorage.setItem('fl:match', id)
    raw({ t: 'join', matchId: id, lastN })
  }

  function forgetMatch(): void {
    matchId = null
    lastN = -1
    sessionStorage.removeItem('fl:match')
  }

  open()
  return {
    queue: () => raw({ t: 'queue' }),
    leave: () => raw({ t: 'leave' }),
    createRoom: () => raw({ t: 'room.create' }),
    joinRoom: (code: string) => raw({ t: 'room.join', code }),
    startDaily: (difficulty: 'easy' | 'medium' | 'hard') => raw({ t: 'daily.start', difficulty }),
    join,
    forgetMatch,
    // false when it couldn't send (no match, socket down), so the caller doesn't wait on an ok that never comes
    act: (action: Action): boolean => {
      if (!matchId || ws?.readyState !== WebSocket.OPEN) return false
      raw({ t: 'act', matchId, seq: ++seq, action })
      return true
    },
    // ms left on a server deadline, by our clock
    msLeft: (deadline: number) => deadline - (Date.now() + offsetMs),
    close: () => {
      closed = true
      ws?.close()
    },
  }
}
