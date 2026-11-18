// guests and accounts. passwords are scrypt, sessions are a random token in an httpOnly cookie.
// failed logins are counted per account (OWASP), so a room full of people on one wifi IP never trips it
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { IncomingMessage } from 'node:http'
import type { Db } from './db.ts'

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

export type Player = { id: number; name: string; kind: 'guest' | 'account' }

export const SESSION_COOKIE = 'fl_session'
const SESSION_DAYS = 30
const NAME_RE = /^[a-z0-9_]{3,16}$/
const BLOCKED = ['admin', 'flambeur', 'moderator', 'system', 'house', 'dealer']
export const MIN_PASSWORD = 8 // OWASP: 8 minimum, no composition rules

// thrown for anything the player did wrong. the message goes back to them as-is
export class UserError extends Error {}

export function checkName(raw: unknown): string {
  if (typeof raw !== 'string') throw new UserError('name required')
  const name = raw.trim().toLowerCase()
  if (!NAME_RE.test(name)) throw new UserError('name: 3-16 of a-z, 0-9, _')
  if (BLOCKED.some(b => name.includes(b))) throw new UserError('that name is taken')
  return name
}

async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(pw, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [kind, saltHex, hashHex] = stored.split('$')
  if (kind !== 'scrypt' || !saltHex || !hashHex) throw new Error('bad stored password hash')
  const hash = await scryptAsync(pw, Buffer.from(saltHex, 'hex'), 64)
  return timingSafeEqual(hash, Buffer.from(hashHex, 'hex'))
}

// so a wrong name takes as long as a wrong password
const DUMMY_HASH = await hashPassword(randomBytes(8).toString('hex'))

function checkPasswordInput(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length < MIN_PASSWORD) throw new UserError(`password: at least ${MIN_PASSWORD} characters`)
  if (raw.length > 200) throw new UserError('password too long')
  return raw
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest()

export async function newSession(db: Db, playerId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await db.query(`insert into sessions (token_hash, player_id, expires_at) values ($1, $2, now() + interval '${SESSION_DAYS} days')`, [tokenHash(token), playerId])
  return token
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`
}

export function clearCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
}

export function cookieToken(req: IncomingMessage): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, v] = part.trim().split('=')
    if (k === SESSION_COOKIE && v) return v
  }
  return null
}

export async function playerFor(db: Db, req: IncomingMessage): Promise<Player | null> {
  const token = cookieToken(req)
  if (!token) return null
  const r = await db.query<Player>(
    'select p.id::int as id, p.name, p.kind from sessions s join players p on p.id = s.player_id where s.token_hash = $1 and s.expires_at > now()',
    [tokenHash(token)],
  )
  return r.rows[0] ?? null
}

export async function logout(db: Db, req: IncomingMessage): Promise<void> {
  const token = cookieToken(req)
  if (token) await db.query('delete from sessions where token_hash = $1', [tokenHash(token)])
}

async function insertPlayer(db: Db, name: string, kind: Player['kind'], passHash: string | null): Promise<Player> {
  const r = await db.query<Player>(
    'insert into players (name, kind, pass_hash) values ($1, $2, $3) on conflict (name) do nothing returning id::int as id, name, kind',
    [name, kind, passHash],
  )
  if (!r.rows[0]) throw new UserError('that name is taken')
  return r.rows[0]
}

export async function createGuest(db: Db, rawName: unknown): Promise<Player> {
  const name = rawName === undefined || rawName === '' ? `guest_${randomBytes(3).toString('hex')}` : checkName(rawName)
  return insertPlayer(db, name, 'guest', null)
}

// a guest signing up claims their own row, so their history carries over
export async function signup(db: Db, current: Player | null, rawName: unknown, rawPassword: unknown): Promise<Player> {
  if (current?.kind === 'account') throw new UserError('already signed in')
  const name = checkName(rawName)
  const passHash = await hashPassword(checkPasswordInput(rawPassword))
  if (current?.kind === 'guest') {
    const r = await db.query<Player>(
      `update players set name = $2, kind = 'account', pass_hash = $3 where id = $1
       and not exists (select 1 from players where name = $2 and id <> $1)
       returning id::int as id, name, kind`,
      [current.id, name, passHash],
    )
    if (!r.rows[0]) throw new UserError('that name is taken')
    return r.rows[0]
  }
  return insertPlayer(db, name, 'account', passHash)
}

// per-account lockout with growing back-off after 5 misses. in memory: a restart forgets it, that's fine
const fails = new Map<string, { count: number; until: number }>()

export async function login(db: Db, rawName: unknown, rawPassword: unknown): Promise<Player> {
  const name = typeof rawName === 'string' ? rawName.trim().toLowerCase() : ''
  const password = typeof rawPassword === 'string' ? rawPassword : ''
  // count the try before the slow hash, so parallel guesses can't all slip past the lockout
  const f = fails.get(name) ?? { count: 0, until: 0 }
  if (f.until > Date.now()) throw new UserError('too many tries, wait a bit')
  f.count++
  if (f.count >= 5) f.until = Date.now() + Math.min(900, 2 ** (f.count - 5)) * 1000
  fails.set(name, f)
  const r = await db.query<Player & { pass_hash: string | null }>(
    "select id::int as id, name, kind, pass_hash from players where name = $1 and kind = 'account'",
    [name],
  )
  const row = r.rows[0]
  const ok = await checkPassword(password, row?.pass_hash ?? DUMMY_HASH)
  if (!row || !ok) throw new UserError('wrong name or password')
  fails.delete(name)
  return { id: row.id, name: row.name, kind: row.kind }
}

// fixed-window counters for per-IP / per-player limits
const windows = new Map<string, { count: number; reset: number }>()

export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const w = windows.get(key)
  if (!w || w.reset <= now) {
    windows.set(key, { count: 1, reset: now + windowMs })
    return true
  }
  w.count++
  return w.count <= max
}

// drop expired windows so the map doesn't grow forever
export function sweepLimits(): void {
  const now = Date.now()
  for (const [k, w] of windows) if (w.reset <= now) windows.delete(k)
  // an account's miss count resets an hour after its last lockout ends
  for (const [k, f] of fails) if (f.until + 3_600_000 <= now) fails.delete(k)
}
