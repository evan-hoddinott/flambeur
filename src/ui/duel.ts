// the duel scene: you vs the rival across the table, drawn on one canvas from the atlases.
// layout is the art proof's (art/duel/review.py), in 640x360 stage units. main.ts owns the game,
// this file only draws a DuelState and reports clicks back through it
import { sprite, tinted, canvas, ctx2d, blit, backCanvas, cardCanvas, faceCanvas, type Sprite } from './art.ts'
import { HAND_BASE, HAND_NAMES, HAND_TYPES } from '../engine/hands.ts'
import { describe, getDef, type Owned } from '../engine/collectibles.ts'
import { tableOf } from '../engine/economy.ts'
import { JOKERS, VARIANTS, knockoffName, traitName, type Card } from '../engine/cards.ts'
import { twistName, twistText } from '../engine/twists.ts'
import type { BetChoice, SeatView, ShowdownView } from '../engine/match.ts'
import type { Appraisal } from '../engine/scoring.ts'
import type { StarterId } from '../engine/starters.ts'
import * as sfx from './sound.ts'
import { drawText, measure, wrapText, type TextStyle } from './font.ts'

export type Kind = 'lock' | 'max' | 'match' | 'min' | 'forge' | 'fold' | 'mulligan' | 'continue'
// primary = the one "move on" action that pulses. never a bet choice
export type Slip = { label: string; price?: string; kind: Kind; primary?: boolean; enabled: boolean; stamp?: BetChoice; onClick: () => void }

export type DuelState = {
  view: SeatView
  settled: boolean // the round is over and its result is on screen
  counting: boolean // the appraisal count-up is running
  selected: Set<number>
  lastLocked: Card[] // what I played, so a fold or flambé result still shows it
  slips: Slip[]
  hint: string
  rival: { name: string; mask: string; stamp: string; back: StarterId }
  myMask: string
  toast: string // the latest log line
  clock: () => string // online turn timer, '' offline. read every frame
  onCard: (id: number) => void
  onPile: () => void
}

// ---------- constants from the art proof ----------

const W = 640
const H = 360
const RIVAL_X = 409
const FAR = 116 // felt far edge
const NEAR = 330 // felt near edge
const FELTS = ['green', 'blue', 'burgundy', 'black']
const RED = '#d04a4e'
const MONEY = '#b8f0a0'
const INK = '#2e2320'
const CREAM = '#f6ecd2'
const BURGUNDY = '#7a1a2c'
const FLAME = '#ff7a24'
const GOLD = '#e8c260'
const CROWD: [number, number][] = [
  [193, 127], [544, 130], [147, 135], [493, 129], [220, 127], [576, 134],
  [110, 126], [518, 126], [253, 131], [603, 133], [72, 128], [359, 132],
]
const NEAR_ROW = { cx: 311, y: 231, gap: 50, w: 44 }
const FAR_ROW = { cx: 365, y: 151, gap: 41, w: 36 }
const HAND_C = { x: 335, y: 298, r: 260 }
const MY_PILE = { x: 146, y: 251 }
const MY_DISCARD = { x: 470, y: 228 } // just left of the action column
const COL = { x: 508, w: 126, bottom: 352 } // the action column: messages, tally, tickets
const OUTLINE = '#0e0b0a' // text over the world gets a 1px ink outline
const RIVAL_LINE: Record<BetChoice, string> = { max: 'Tapis.', min: 'Petite mise.', match: 'Je suis.', fold: 'Je me couche.', forge: 'Flambons.' }

// ---------- canvas + loop ----------

let cv: HTMLCanvasElement | null = null
let g: CanvasRenderingContext2D
let k = 1 // stage unit -> device px
let ox = 0
let oy = 0
let state: DuelState | null = null
let running = false
let now = 0
let mouse = { x: -1, y: -1 }
let vitrineOpen = false
let cheatOpen = false
let bubble: { text: string; t: number } | null = null
const stamps: { name: string; x: number; y: number; t: number }[] = []
const floats: { text: string; x: number; y: number; color: string; t: number }[] = []
const juice = new Map<string, number>() // key -> start time

type Hit = { x: number; y: number; w: number; h: number; onClick: () => void }
let hits: Hit[] = []
type CardHit = { id: number; x: number; y: number; r: number; s: number; onClick: () => void }
let cardHits: CardHit[] = []
let lastCardHits: CardHit[] = [] // last frame's, for hover while this frame is still drawing

// the count-up's live numbers per side. null = show the final appraisal
type Live = { v: number; h: number; g: number; label: string; step: string }
let live: [Live, Live] | null = null

export function showDuel(app: HTMLElement, next: DuelState): void {
  state = next
  if (!cv || !cv.isConnected) {
    app.innerHTML = ''
    cv = document.createElement('canvas')
    cv.className = 'stage'
    app.appendChild(cv)
    g = ctx2d(cv)
    cv.onpointermove = e => { mouse = toStage(e) }
    cv.onpointerleave = () => { mouse = { x: -1, y: -1 } }
    cv.onclick = e => click(toStage(e))
    resize()
  }
  if (!running) {
    running = true
    requestAnimationFrame(frame)
  }
}

export function say(choice: BetChoice): void {
  bubble = { text: RIVAL_LINE[choice], t: now }
  pop('rival')
}

window.addEventListener('resize', () => resize())

function resize(): void {
  if (!cv) return
  const dpr = window.devicePixelRatio || 1
  cv.width = Math.round(innerWidth * dpr)
  cv.height = Math.round(innerHeight * dpr)
  k = Math.min(cv.width / W, cv.height / H)
  ox = (cv.width - W * k) / 2
  oy = (cv.height - H * k) / 2
  g.imageSmoothingEnabled = false
}

function toStage(e: MouseEvent): { x: number; y: number } {
  const dpr = window.devicePixelRatio || 1
  return { x: (e.clientX * dpr - ox) / k, y: (e.clientY * dpr - oy) / k }
}

function click(p: { x: number; y: number }): void {
  if (cheatOpen) {
    cheatOpen = false
    return
  }
  // topmost first: rects are pushed in draw order, cards draw over the felt but under the hud
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]
    if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return h.onClick()
  }
  const card = cardUnder(p)
  if (card) return card.onClick()
  if (vitrineOpen) vitrineOpen = false
}

function cardUnder(p: { x: number; y: number }, list = cardHits): CardHit | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i]
    const dx = p.x - c.x
    const dy = p.y - c.y
    const lx = dx * Math.cos(-c.r) - dy * Math.sin(-c.r)
    const ly = dx * Math.sin(-c.r) + dy * Math.cos(-c.r)
    if (Math.abs(lx) <= 32 * c.s && Math.abs(ly) <= 44 * c.s) return c
  }
  return null
}

function frame(t: number): void {
  if (!cv || !cv.isConnected || !state) {
    running = false
    return
  }
  const dt = Math.min(0.05, (t - now) / 1000 || 0)
  now = t
  step(dt)
  hits = []
  lastCardHits = cardHits
  cardHits = []
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = '#0e0b0a'
  g.fillRect(0, 0, cv.width, cv.height)
  draw(state)
  cv.style.cursor = hoverable() ? 'pointer' : 'default'
  requestAnimationFrame(frame)
}

function hoverable(): boolean {
  if (cheatOpen) return true
  const p = mouse
  if (hits.some(h => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h)) return true
  return !!cardUnder(p)
}

// ---------- springs + juice ----------

type T = { x: number; y: number; r: number; s: number }
const springs = new Map<string, { at: T; vel: T }>()
const seen = new Set<string>()

// the visible transform chases the target, critically damped with a touch of overshoot
function spring(key: string, target: T, from?: T): T {
  seen.add(key)
  let s = springs.get(key)
  if (!s) {
    s = { at: { ...(from ?? target) }, vel: { x: 0, y: 0, r: 0, s: 0 } }
    springs.set(key, s)
  }
  pending.push([s, target])
  return s.at
}
let pending: [{ at: T; vel: T }, T][] = []

function step(dt: number): void {
  const stiff = 170
  const damp = 2 * Math.sqrt(stiff) * 0.75
  for (const [s, target] of pending) {
    for (const f of ['x', 'y', 'r', 's'] as const) {
      const a = stiff * (target[f] - s.at[f]) - damp * s.vel[f]
      s.vel[f] += a * dt
      s.at[f] += s.vel[f] * dt
    }
  }
  pending = []
  // forget springs nobody drew last frame, so a card coming back flies in again
  for (const key of springs.keys()) if (!seen.has(key)) springs.delete(key)
  seen.clear()
}

function pop(key: string): void {
  juice.set(key, now)
}

// scale and wobble for a juiceUp, ~0.3s
function juiced(key: string): { s: number; r: number } {
  const t0 = juice.get(key)
  if (t0 === undefined) return { s: 1, r: 0 }
  const t = (now - t0) / 1000
  if (t > 0.5) {
    juice.delete(key)
    return { s: 1, r: 0 }
  }
  const e = Math.exp(-t * 10)
  return { s: 1 + 0.18 * e, r: 0.1 * Math.sin(t * 34) * e }
}

// ---------- draw helpers (stage units) ----------

type Pin = { r?: number; s?: number; sx?: number; sy?: number; flip?: boolean; alpha?: number }

function pin(name: string, x: number, y: number, o: Pin = {}): void {
  const s = sprite(name)
  g.save()
  g.translate(x, y)
  if (o.r) g.rotate(o.r)
  const sx = (o.s ?? 1) * (o.sx ?? 1) * (o.flip ? -1 : 1)
  const sy = (o.s ?? 1) * (o.sy ?? 1)
  g.scale(sx, sy)
  if (o.alpha !== undefined) g.globalAlpha = o.alpha
  g.drawImage(s.img, s.x, s.y, s.w, s.h, -s.px, -s.py, s.w, s.h)
  g.restore()
}

function centered(img: CanvasImageSource, x: number, y: number, w: number, h: number, r = 0, alpha = 1): void {
  g.save()
  g.translate(x, y)
  if (r) g.rotate(r)
  g.globalAlpha = alpha
  g.drawImage(img, -w / 2, -h / 2, w, h)
  g.restore()
}

function tile(name: string, x: number, y: number, w: number, h: number, c = g): void {
  const s = sprite(name)
  for (let ty = 0; ty < h; ty += s.h) {
    for (let tx = 0; tx < w; tx += s.w) {
      const cw = Math.min(s.w, w - tx)
      const ch = Math.min(s.h, h - ty)
      c.drawImage(s.img, s.x, s.y, cw, ch, x + tx, y + ty, cw, ch)
    }
  }
}

// corners stay native size, edges and middle stretch. tint multiplies a greyscale sprite by a color
function nine(name: string, x: number, y: number, w: number, h: number, tint?: string): void {
  const s = sprite(name)
  const img = tint ? tinted(name, tint) : s.img
  const ox = tint ? 0 : s.x
  const oy = tint ? 0 : s.y
  const m = s.center
  if (!m) throw new Error(`${name} has no 9-slice center`)
  const sx = [0, m.x, m.x + m.w, s.w]
  const sy = [0, m.y, m.y + m.h, s.h]
  const dx = [0, m.x, w - (s.w - m.x - m.w), w]
  const dy = [0, m.y, h - (s.h - m.y - m.h), h]
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const sw = sx[c + 1] - sx[c]
      const sh = sy[r + 1] - sy[r]
      const tw = dx[c + 1] - dx[c]
      const th = dy[r + 1] - dy[r]
      if (sw <= 0 || sh <= 0 || tw <= 0 || th <= 0) continue
      g.drawImage(img, ox + sx[c], oy + sy[r], sw, sh, x + dx[c], y + dy[r], tw, th)
    }
  }
}

// a canvas in one flat color, cached, for hover outlines
const sils = new Map<HTMLCanvasElement, HTMLCanvasElement>()
function silhouette(img: HTMLCanvasElement): HTMLCanvasElement {
  let c = sils.get(img)
  if (!c) {
    c = canvas(img.width, img.height)
    const sg = ctx2d(c)
    sg.drawImage(img, 0, 0)
    sg.globalCompositeOperation = 'source-in'
    sg.fillStyle = CREAM
    sg.fillRect(0, 0, c.width, c.height)
    sils.set(img, c)
  }
  return c
}
const AROUND = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const

// the cream 1px hover outline of a pinned sprite. draw the sprite on top after
function outline(name: string, x: number, y: number, r = 0): void {
  const s = sprite(name)
  const sil = silhouette(sub(s))
  for (const [dx, dy] of AROUND) {
    g.save()
    g.translate(x + dx, y + dy)
    if (r) g.rotate(r)
    g.drawImage(sil, -s.px, -s.py)
    g.restore()
  }
}

// every string on the stage goes through here. y is the top of the line box
type TextOpt = TextStyle & { alpha?: number }

function text(s: string, x: number, y: number, o: TextOpt = {}): void {
  if (o.alpha === undefined) return drawText(g, s, x, y, o)
  g.save()
  g.globalAlpha = Math.max(0, o.alpha)
  drawText(g, s, x, y, o)
  g.restore()
}

const wrap = wrapText

function hit(x: number, y: number, w: number, h: number, onClick: () => void): boolean {
  hits.push({ x, y, w, h, onClick })
  return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h
}

const fmt = (n: number) => n.toLocaleString('en-US')

// ---------- cached layers ----------

// room and felt only change per Table (and on tournament rounds), so they're drawn once
let roomKey = ''
let roomLayer: HTMLCanvasElement | null = null
let feltLayer: HTMLCanvasElement | null = null

function layers(table: number, tournament: boolean): void {
  const key = `${table}|${tournament}`
  if (key === roomKey) return
  roomKey = key
  roomLayer = buildRoom()
  feltLayer = buildFelt(table, tournament)
}

function buildRoom(): HTMLCanvasElement {
  const c = canvas(W, 160)
  const r = ctx2d(c)
  tile('room/wall', 0, 0, W, 122, r)
  blit(r, 'room/chalkboard', 34, 28)
  // vignette toward the sides
  const img = r.getImageData(0, 0, W, 151)
  for (let y = 0; y < 151; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const dark = 96 * Math.abs((x - 319.5) / 320) ** 1.8 / 255
      img.data[i] = img.data[i] * (1 - dark) + 9 * dark
      img.data[i + 1] = img.data[i + 1] * (1 - dark) + 3 * dark
      img.data[i + 2] = img.data[i + 2] * (1 - dark) + 10 * dark
    }
  }
  r.putImageData(img, 0, 0)
  return c
}

function buildFelt(table: number, tournament: boolean): HTMLCanvasElement {
  const c = canvas(W, H)
  const f = ctx2d(c)
  const src = sprite(`felt/${FELTS[table - 1]}`)
  const fh = NEAR - FAR
  // one projected scanline of the weave per row, pixels shrink toward the far edge
  for (let y = 0; y < fh; y++) {
    const depth = y / (fh - 1)
    const scale = 0.51 + 0.49 * depth
    const size = Math.max(1, Math.round(src.w * scale))
    const sy = Math.floor((fh * 2.3 * depth) / (0.7 + 0.3 * depth)) % src.h
    for (let x = (320 % size) - size; x < W; x += size) f.drawImage(src.img, src.x, src.y + sy, src.w, 1, x, FAR + y, size, 1)
  }
  // lamp lighting: dark toward the edges, a warm pool in the middle
  const img = f.getImageData(0, FAR, W, fh)
  const pool = tournament || table >= 3 ? [232, 174, 112] : [246, 226, 159]
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const d = ((x - 318) / 365) ** 2 + ((y - 82) / 210) ** 2
      const dark = Math.min(135, 14 + 60 * d) / 255
      const warm = (23 * Math.exp(-(((x - 320) / 195) ** 2) - ((y - 72) / 88) ** 2)) / 255
      for (let ch = 0; ch < 3; ch++) img.data[i + ch] = img.data[i + ch] * (1 - dark) * (1 - warm) + pool[ch] * warm
    }
  }
  f.putImageData(img, 0, FAR)
  if (table === 4) for (const y of [122, 310]) tile('felt/print/inlay', 0, y, W, 12, f)
  const print = (name: string, x: number, y: number, w: number, h: number) => {
    const s = sprite(name)
    f.save()
    f.imageSmoothingEnabled = true // thin ink lines survive the squash
    f.globalAlpha = table === 4 ? 1 : 0.8
    f.drawImage(s.img, s.x, s.y, s.w, s.h, Math.round(x - w / 2), Math.round(y - h / 2), w, h)
    f.restore()
  }
  for (const row of [{ ...FAR_ROW, h: 21 }, { ...NEAR_ROW, h: 32 }]) {
    for (let n = -2; n <= 2; n++) print('felt/print/spot', row.cx + n * row.gap, row.y, row.w, row.h)
  }
  print('felt/print/pot', 322, 191, 145, 35)
  print('felt/print/crest', 307, 191, 49, 28)
  for (const [name, x, y, s] of [['pile', 223, 158, 0.64], ['pile', MY_PILE.x, MY_PILE.y, 0.96], ['discard', MY_DISCARD.x, MY_DISCARD.y, 0.84]] as const) {
    print(`felt/print/${name}`, x, y, Math.round(72 * s), Math.round(55 * s))
  }
  tile('rail/far', 0, FAR - 4, W, 6, f)
  tile('rail/near', 0, NEAR - 4, W, 18, f)
  const stud = sprite('rail/stud')
  for (let x = 6; x < W; x += 12) f.drawImage(stud.img, stud.x, stud.y, stud.w, stud.h, x - 1, NEAR + 5, stud.w, stud.h)
  return c
}

// a squared deck of backs in table perspective (art/duel/deckstack.py), cached at 4x then drawn down
const piles = new Map<string, HTMLCanvasElement>()
function pileCanvas(box: StarterId | null, count: number, scale: number, messy: boolean): HTMLCanvasElement {
  const key = `${box}|${count}|${scale}|${messy}`
  const hit_ = piles.get(key)
  if (hit_) return hit_
  const s = scale * 4
  const front = Math.max(1, Math.round(49 * s))
  const depth = Math.max(1, Math.round(46 * s))
  const lean = Math.max(1, Math.round(15 * s))
  const height = count > 1 ? Math.max(1, Math.round(((count - 1) * s) / 2)) : 0
  const c = canvas(front + lean, depth + height)
  const p = ctx2d(c)
  if (height) {
    const edge = sprite(messy ? 'pile/messy' : 'pile/stack')
    const side = sprite('pile/side')
    const strip = Math.max(1, Math.round(edge.h * s))
    for (let y = 0; y < height; y += strip) p.drawImage(edge.img, edge.x, edge.y, edge.w, edge.h, 0, depth + y, front, strip)
    p.save()
    p.setTransform(1, -depth / lean, 0, 1, front, depth)
    for (let y = 0; y < height; y += strip) p.drawImage(side.img, side.x, side.y, side.w, side.h, 0, y, lean, strip)
    p.restore()
  }
  const back = backCanvas(box)
  p.save()
  p.setTransform(front / 64, 0, -lean / 88, depth / 88, lean, 0)
  p.drawImage(back, 0, 0)
  p.restore()
  piles.set(key, c)
  return c
}

// returns the pile's top edge
function drawPile(x: number, y: number, scale: number, box: StarterId | null, count: number, messy = false, lit = false): number {
  const bottom = y + Math.floor(Math.round(55 * scale) / 3)
  if (count <= 0) return bottom - 20
  const c = pileCanvas(box, count, scale, messy)
  const w = c.width / 4
  const h = c.height / 4
  g.save()
  g.imageSmoothingEnabled = true
  if (lit) for (const [dx, dy] of AROUND) g.drawImage(silhouette(c), x - w / 2 + dx, bottom - h + dy, w, h)
  g.drawImage(c, x - w / 2, bottom - h, w, h)
  g.restore()
  return bottom - h
}

// jetons and plaques for an amount, biggest first, a few stacks side by side
function chips(x: number, y: number, amount: number, scale: number): void {
  if (amount <= 0) return
  const stacks: [string, number, number][] = [] // key, count, width
  let left = amount
  for (const [v, key, w] of [[500, 'plaque/500', 28], [100, 'plaque/100', 28], [25, 'jeton/25', 16], [5, 'jeton/5', 16], [1, 'jeton/1', 16]] as const) {
    const n = Math.floor(left / v)
    left -= n * v
    if (n) stacks.push([key, Math.min(n, 12), w])
  }
  const shown = stacks.slice(0, 4)
  const total = shown.reduce((a, s) => a + s[2], 0) * scale
  let cx = x - total / 2
  shown.forEach(([key, n, w], i) => {
    const sw = w * scale
    const sx = cx + sw / 2
    cx += sw
    const bottom = y + (i % 2) * 2
    const lift = Math.max(1, Math.round(2 * scale))
    const edge = sprite(`chip/${key}/edge`)
    const top = sprite(`chip/${key}/top`)
    for (let j = 0; j < n; j++) centered(sub(edge), sx, bottom - j * lift, sw, Math.max(2, edge.h * scale))
    centered(sub(top), sx, bottom - n * lift - 1, sw, top.h * scale)
  })
}

// a sprite cut to its own canvas, for drawImage calls that scale to a box
const subs = new Map<Sprite, HTMLCanvasElement>()
function sub(s: Sprite): HTMLCanvasElement {
  let c = subs.get(s)
  if (!c) {
    c = canvas(s.w, s.h)
    ctx2d(c).drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h)
    subs.set(s, c)
  }
  return c
}

// red lamp shade for tournament rounds
let redShade: HTMLCanvasElement | null = null
function shadeImg(red: boolean): HTMLCanvasElement {
  const plain = sub(sprite('lamp/shade'))
  if (!red) return plain
  if (redShade) return redShade
  const c = canvas(plain.width, plain.height)
  const r = ctx2d(c)
  r.filter = 'grayscale(1) brightness(1.6)'
  r.drawImage(plain, 0, 0)
  r.filter = 'none'
  r.globalCompositeOperation = 'multiply'
  r.fillStyle = RED
  r.fillRect(0, 0, c.width, c.height)
  r.globalCompositeOperation = 'destination-in'
  r.drawImage(plain, 0, 0)
  redShade = c
  return c
}

// ---------- the scene ----------

function draw(st: DuelState): void {
  const view = st.view
  const table = tableOf(view.round)
  const tournament = !!view.twist
  layers(table, tournament)
  const t = now / 1000

  // world layers drift a little, the hud stays put
  const drift = { x: Math.sin(t / 6 * Math.PI * 2) * 2, y: Math.cos(t / 7.3 * Math.PI * 2) * 1, r: Math.sin(t / 9 * Math.PI * 2) * 0.003 }
  g.setTransform(k, 0, 0, k, ox, oy)
  g.save()
  g.beginPath()
  g.rect(0, 0, W, H)
  g.clip()
  g.translate(320 + drift.x, 180 + drift.y)
  g.rotate(drift.r)
  g.scale(1.01, 1.01) // so the drift never shows the stage edge
  g.translate(-320, -180)

  room(st, tournament, t)
  lamp(tournament, t)
  rival(st, t)
  g.drawImage(feltLayer!, 0, 0)
  tableTop(st)
  playedCards(st)
  you(st, t)
  g.restore()

  g.setTransform(k, 0, 0, k, ox, oy)
  g.save()
  g.beginPath()
  g.rect(0, 0, W, H)
  g.clip()
  hand(st, t)
  hud(st, t)
  effects()
  if (cheatOpen) cheatSheet(st)
  g.restore()
}

function room(st: DuelState, tournament: boolean, t: number): void {
  const view = st.view
  g.drawImage(roomLayer!, 0, 0)
  // patrons get busier each Table, and crowd in on tournament rounds
  const table = tableOf(view.round)
  const n = Math.min(CROWD.length, table * 2 + (tournament ? 4 : 0))
  const scale = tournament ? 1.15 : 1
  for (let i = 0; i < n; i++) {
    const [x, y] = CROWD[i]
    const id = (i % 6) + 1
    const sway = Math.sin(t * 0.7 + i * 1.7) * 0.02
    const lean = [0, 3, -3, 2, -2, 0][id - 1] + Math.sin(t * 0.4 + i) * 1.2
    pin(`crowd/${id}`, x, y, { s: scale, r: sway * 0.3 })
    pin(`crowd/${id}/head`, x + lean * scale, y - 40 * scale, { s: scale, r: sway })
    pin(`crowd/${id}/mask`, x + lean * scale, y - 40 * scale, { s: scale, r: sway })
  }
  for (const [i, [x, y]] of ([[169, 56], [562, 83]] as const).entries()) {
    pin('room/sconce', x, y)
    const f = 1 + (Math.floor(t * 8 + i * 3) % 3)
    pin(`room/sconce/flame/${f}`, x + 1, y - 1)
    glow(x + 1, y - 4, 16, 'rgba(255,176,58,0.18)')
  }
  // curtains, a slow sway
  for (const flip of [false, true]) {
    const x = flip ? 639 : 0
    const r = Math.sin(t * 0.6 + (flip ? 1 : 0)) * 0.012 * (flip ? -1 : 1)
    pin('room/curtain/L', x, 0, { flip, r })
    pin('room/curtain/cord', x, 96, { flip })
    pin('room/curtain/tassel', flip ? x - 21 : 21, 118, { flip, r: Math.sin(t * 1.3) * 0.05 })
  }
  // chalkboard: Table and round, then the twist or the stakes
  const roman = ['I', 'II', 'III', 'IV'][table - 1]
  const round = st.settled && view.last ? view.last.round : view.round
  const third = view.twist ? twistLabel(view) : `Ante $${view.blinds.ante} · Max $${view.blinds.max}`
  text(`Table ${roman}`, 82, 34, { font: 'chalk', color: '#e3d2a8', align: 'center' })
  text(`Manche ${round}${view.lastRound ? ` / ${view.lastRound}` : ''}`, 82, 50, { font: 'chalk', color: '#bfa77e', align: 'center' })
  // chalk when it fits on the board, the tiny hand when it doesn't
  const thirdColor = view.twist ? '#c99a3a' : '#bfa77e'
  if (measure(third, 'chalk') <= 84) text(third, 82, 66, { font: 'chalk', color: thirdColor, align: 'center' })
  else text(third, 82, 70, { font: 'tiny', color: thirdColor, align: 'center' })
}

function twistLabel(v: SeatView): string {
  return v.twist ? twistName(v.twist) : ''
}

function glow(x: number, y: number, r: number, color: string): void {
  const grad = g.createRadialGradient(x, y, 0, x, y, r)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(x - r, y - r, r * 2, r * 2)
}

function lamp(tournament: boolean, t: number): void {
  const sway = Math.sin(t / 8 * Math.PI * 2) * 0.0105
  // the light cone first, so the shade sits on top of it
  g.save()
  g.translate(320, 0)
  g.rotate(sway)
  const cone = g.createLinearGradient(0, 61, 0, 200)
  const warm = tournament ? '208,74,78' : '246,207,117'
  cone.addColorStop(0, `rgba(${warm},0.16)`)
  cone.addColorStop(1, `rgba(${warm},0)`)
  g.fillStyle = cone
  g.beginPath()
  g.moveTo(-28, 61)
  g.lineTo(28, 61)
  g.lineTo(150, 200)
  g.lineTo(-150, 200)
  g.closePath()
  g.fill()
  tile('lamp/rod', -2, 0, 4, 30)
  pin('lamp/fitting', 0, 29 + 6)
  const shade = shadeImg(tournament)
  g.drawImage(shade, -60, 33)
  pin('lamp/bulb', 0, 59)
  glow(0, 62, 34, tournament ? 'rgba(255,120,110,0.25)' : 'rgba(255,240,176,0.22)')
  g.restore()
}

function rival(st: DuelState, t: number): void {
  const view = st.view
  const them = view.others[0]
  const b = view.bet
  const thinking = !st.settled && !!b && b.toAct === them.seat
  const lost = st.settled && view.showdown?.winner === view.me.seat
  const won = st.settled && view.showdown?.winner === them.seat
  const breathe = 1 + 0.01 * (0.5 + 0.5 * Math.sin(t / 4 * Math.PI * 2))
  const slump = lost ? 3 : 0
  const j = juiced('rival')
  const torsoY = 120 + slump
  const tilt = thinking ? 0.07 * Math.sin(t * 1.5) : lost ? 0.1 : won ? -0.05 : 0
  pin('rival/torso', RIVAL_X, torsoY, { sy: breathe, r: won ? -0.05 : 0 })
  const headY = torsoY - 41 * breathe - 0.3 * Math.sin(t / 4 * Math.PI * 2 - 0.4)
  g.save()
  g.translate(RIVAL_X, headY)
  g.rotate(tilt + j.r)
  g.scale(j.s, j.s)
  pin('rival/head', 0, 0)
  // blink every few seconds
  const blink = (t % 4.3) < 0.09
  pin(`rival/eyes/${blink ? 'half' : b?.choices.some(c => c.seat === them.seat && c.choice === 'max') && (t % 1.2) < 0.3 ? 'glint1' : 'open'}`, 0, -21)
  pin(`mask/${st.rival.mask}/front`, 0, -21)
  g.restore()
  // their fan of backs, face-up for any card you're allowed to see
  if (st.settled && view.showdown) return
  const shown: Card[] = [...them.marked]
  if (b?.peek && !shown.some(c => c.id === b.peek!.id)) shown.push(b.peek)
  const n = st.settled ? 0 : them.handSize
  const step_ = n > 1 ? Math.min(8, 48 / (n - 1)) : 0
  for (let i = 0; i < n; i++) {
    const m = i - (n - 1) / 2
    const card = shown[i]
    const target = { x: RIVAL_X + m * step_, y: 104 + Math.abs(m) * 1.5 + slump, r: (m * 8 * Math.PI) / 180, s: 1 }
    const at = spring(`rfan${i}`, target, { x: RIVAL_X, y: 140, r: 0, s: 1 })
    centered(card ? cardCanvas(card) : backCanvas(st.rival.back), at.x, at.y, 32, 44, at.r)
  }
}

function tableTop(st: DuelState): void {
  const view = st.view
  const me = view.me
  const them = view.others[0]
  drawPile(223, 158, 0.64, st.rival.back, Math.max(0, them.deckSize - them.handSize))
  // your pile opens the deck viewer: outlined on hover, its count always above it
  const over = !cheatOpen && hit(110, 206, 72, 66, st.onPile)
  const top = drawPile(MY_PILE.x, MY_PILE.y, 0.96, me.starter, me.pile.length, false, over)
  text(over ? `Deck · ${me.pile.length}` : String(me.pile.length), MY_PILE.x, top - 9, { font: 'tiny', color: over ? CREAM : '#bfa77e', align: 'center', outline: OUTLINE })
  drawPile(MY_DISCARD.x, MY_DISCARD.y, 0.84, me.starter, me.discard.length, true)
  // bankroll stacks (the plates carry the numbers) and the pot with its number
  const pot = view.bet ? view.bet.committed[0] + view.bet.committed[1] : 0
  chips(180, 160, them.bankroll, 0.78) // left of their pile, clear of their row and tag
  chips(60, 262, me.bankroll, 0.95)
  chips(346, 193, pot, 0.95)
  if (pot) text(`$${pot}`, 374, 184, { font: 'sans', color: MONEY, align: 'center', bold: true, outline: OUTLINE })
}

// played cards on their spots, face up at showdown
function playedCards(st: DuelState): void {
  const sd = st.settled ? st.view.showdown : null
  if (!sd) return
  rowOf(sd.theirCards, FAR_ROW, sd.theirs, 'far')
  rowOf(sd.myCards, NEAR_ROW, sd.mine, 'near')
  scoreTag(st, sd, false)
  scoreTag(st, sd, true)
}

function rowOf(cards: Card[], row: typeof NEAR_ROW, a: Appraisal, side: string): void {
  const s = row.w / 64
  cards.forEach((c, i) => {
    const n = i - (cards.length - 1) / 2
    const target = { x: row.cx + n * row.gap, y: row.y - 10 * s, r: 0, s }
    const from = side === 'far' ? { x: RIVAL_X, y: 104, r: 0.3, s: 0.5 } : { x: HAND_C.x, y: HAND_C.y, r: 0, s: 1 }
    const at = spring(`card${c.id}`, target, from)
    const j = juiced(`card${c.id}`)
    const dim = live === null && !a.scoringIds.includes(c.id)
    shadow(at.x, at.y, 64 * at.s * j.s, 88 * at.s * j.s, at.r)
    centered(dim ? darkened(cardCanvas(c)) : cardCanvas(c), at.x, at.y, 64 * at.s * j.s, 88 * at.s * j.s, at.r + j.r)
  })
}

// a card with a dark wash over it, for the ones that aren't in play
const darks = new Map<HTMLCanvasElement, HTMLCanvasElement>()
function darkened(c: HTMLCanvasElement): HTMLCanvasElement {
  let d = darks.get(c)
  if (!d) {
    d = canvas(c.width, c.height)
    const dg = ctx2d(d)
    dg.drawImage(c, 0, 0)
    dg.globalCompositeOperation = 'source-atop'
    dg.fillStyle = 'rgba(14,11,10,0.5)'
    dg.fillRect(0, 0, c.width, c.height)
    darks.set(c, d)
  }
  return d
}

function shadow(x: number, y: number, w: number, h: number, r: number): void {
  g.save()
  g.translate(x + 1, y + 3)
  g.rotate(r)
  g.fillStyle = 'rgba(18,14,8,0.35)'
  g.fillRect(-w / 2, -h / 2, w, h)
  g.restore()
}

function scoreTag(st: DuelState, sd: ShowdownView, mine: boolean): void {
  const a = mine ? sd.mine : sd.theirs
  const l = live ? live[mine ? 0 : 1] : null
  const v = l ? l.v : a.value
  const hy = l ? Math.max(1, l.h) : a.hype
  const gr = l ? l.g : a.grade
  const total = v * hy * 2 ** gr
  const label = l ? l.label : [a.hand, ...a.bonus].map(h => HAND_NAMES[h]).join(' + ')
  const w = 96
  const x = mine ? NEAR_ROW.cx - w / 2 : 456
  const y = mine ? 260 : 74
  const won = !st.counting && sd.winner !== null && sd.winner === (mine ? st.view.me.seat : sd.opponent)
  const lostIt = !st.counting && sd.winner !== null && !won
  const j = juiced(mine ? 'tag0' : 'tag1')
  g.save()
  g.translate(x + w / 2, y + 22)
  g.rotate(j.r * 0.4 + (lostIt ? (mine ? 0.04 : -0.04) : 0))
  g.scale(j.s * 0.6 + 0.4, j.s * 0.6 + 0.4)
  g.translate(-(x + w / 2), -(y + 22))
  if (lostIt) g.globalAlpha = 0.6
  nine('hud/score/tag', x, y, w, 44)
  text(label, x + w / 2, y + 4, { font: 'tiny', color: BURGUNDY, align: 'center' })
  // value cream-on-ink chip, hype in flame, grade in gold
  const parts: [string, string][] = [[fmt(v), INK], [' × ', '#8c7656'], [fmt(hy), FLAME]]
  if (gr) parts.push([` × 2^${gr}`, '#9c7028'])
  const widths = parts.map(([s]) => measure(s, 'sans') + 1)
  let px = x + w / 2 - widths.reduce((s, n) => s + n, 0) / 2
  parts.forEach(([s, color], i) => {
    text(s, px, y + 10, { font: 'sans', color })
    px += widths[i]
  })
  text(fmt(total), x + w / 2, y + 19, { font: 'didone', color: won ? '#a8260a' : INK, align: 'center' })
  g.restore()
  if (l?.step) text(l.step, x + w / 2, y + 47, { font: 'tiny', color: CREAM, align: 'center', outline: OUTLINE })
  if (won) glow(x + w / 2, y + 30, 40, 'rgba(255,176,58,0.18)')
}

function you(st: DuelState, t: number): void {
  const view = st.view
  const sd = st.settled ? view.showdown : null
  const won = sd?.winner === view.me.seat
  const lost = !!sd && sd.winner !== null && !won
  const breathe = 1 + 0.012 * (0.5 + 0.5 * Math.sin(t / 4 * Math.PI * 2))
  const slump = lost ? 4 : 0
  const bounce = won ? -Math.abs(Math.sin(t * 5)) * 2 : 0
  pin('you/shoulders', 115, 360 + slump + bounce, { sy: breathe, r: lost ? -0.035 : 0 })
  const hy = 329 + slump + bounce - 50 * (breathe - 1)
  const tilt = lost ? 0.07 : won ? -0.06 : 0
  g.save()
  g.translate(115, hy)
  g.rotate(tilt)
  pin('you/head', 0, 0)
  pin(`mask/${st.myMask}/back`, 0, -24)
  g.restore()
}

// your floating fan. cards lift on hover and more when picked
function hand(st: DuelState, t: number): void {
  const view = st.view
  const me = view.me
  const sd = st.settled ? view.showdown : null
  let cards: Card[]
  if (sd) cards = []
  else if (st.settled) cards = st.lastLocked
  else cards = me.hand
  const n = cards.length
  if (!n) return
  const stepDeg = n > 1 ? Math.min(5.4, 38 / (n - 1)) : 0
  const pickable = !st.settled && view.phase === 'deal' && !me.locked
  const lockedIds = new Set((me.locked ?? []).map(c => c.id))
  // hover goes to the topmost card under the cursor, from last frame's layout
  const hovered = pickable ? cardUnder(mouse, lastCardHits)?.id : undefined
  const placed = cards.map((c, i) => {
    const th = ((i - (n - 1) / 2) * stepDeg * Math.PI) / 180
    const up = st.selected.has(c.id) || lockedIds.has(c.id) || (st.settled && !sd)
    const lift = up ? 18 : c.id === hovered ? 7 : 0
    const sway = Math.sin(t * 1.4 + c.id * 2.1)
    const target = {
      x: HAND_C.x + HAND_C.r * Math.sin(th) + Math.sin(th) * lift,
      y: HAND_C.y + HAND_C.r * (1 - Math.cos(th)) - Math.cos(th) * lift + sway * 0.8,
      r: th + sway * 0.006,
      s: up ? 1.06 : c.id === hovered ? 1.04 : 1,
    }
    return { c, at: spring(`card${c.id}`, target, { x: 146, y: 230, r: 0, s: 0.5 }) }
  })
  for (const { c, at } of placed) {
    const dim = !!me.locked && !lockedIds.has(c.id)
    const j = juiced(`card${c.id}`)
    const s = at.s * j.s
    shadow(at.x, at.y + 2, 64 * s, 88 * s, at.r)
    centered(dim ? darkened(cardCanvas(c)) : cardCanvas(c), at.x, at.y, 64 * s, 88 * s, at.r + j.r)
    cardHits.push({ id: c.id, x: at.x, y: at.y, r: at.r, s, onClick: pickable ? () => { pop(`card${c.id}`); st.onCard(c.id) } : () => {} })
  }
  // a blue pip under each picked card, so picked reads at a glance and not only by height
  if (pickable) for (const { c, at } of placed) {
    if (!st.selected.has(c.id)) continue
    const d = 44 * at.s + 5
    g.fillStyle = OUTLINE
    g.fillRect(Math.round(at.x - Math.sin(at.r) * d) - 2, Math.round(at.y + Math.cos(at.r) * d) - 2, 5, 5)
    g.fillStyle = '#6f9ad8' // your blue
    g.fillRect(Math.round(at.x - Math.sin(at.r) * d) - 1, Math.round(at.y + Math.cos(at.r) * d) - 1, 3, 3)
  }
  // a little tag above the hovered card for what the art doesn't show yet
  const hov = cardUnder(mouse)
  if (hov) {
    const c = cards.find(x => x.id === hov.id)
    if (c) cardTag(c, hov.x, hov.y - 58)
  }
}

// what the art doesn't show yet: finish, stamp, knockoff, variant, joker, grade, traits, grind
export function cardInfo(card: Card): string {
  if (card.bulk) return 'Bulk: +5 Value'
  const tags: string[] = []
  if (card.finish) tags.push(card.finish)
  if (card.stamp === 'first') tags.push('1st ed')
  if (card.stamp === 'signed') tags.push('signed')
  if (card.stamp === 'gold') tags.push('gold border')
  if (card.stamp === 'damaged') tags.push('damaged')
  if (card.knockoff) tags.push(knockoffName(card.knockoff).toLowerCase())
  if (card.variant) tags.push(VARIANTS[card.variant].name.toLowerCase())
  if (card.joker) tags.push(`${JOKERS[card.joker].name}: ${JOKERS[card.joker].text}`)
  if (card.grade !== null) tags.push(`grade ${card.grade}`)
  if (card.tier) tags.push('★'.repeat(card.tier))
  for (const t of card.traits) tags.push(traitName(t).toLowerCase())
  if (card.grind) tags.push(`+${card.grind} Value`)
  return tags.join(' · ')
}
const describeCard = cardInfo

function cardTag(c: Card, x: number, y: number): void {
  const s = describeCard(c)
  if (!s) return
  const lines = wrap(s, 120, 'sans')
  const w = 128
  const h = 6 + lines.length * 10
  const left = Math.max(4, Math.min(W - w - 4, x - w / 2))
  nine('hud/plate/paper', left, y - h, w, h)
  lines.forEach((line, i) => text(line, left + w / 2, y - h + 1 + i * 10, { font: 'sans', align: 'center' }))
}

// ---------- hud ----------

function hud(st: DuelState, t: number): void {
  const view = st.view
  const me = view.me
  const them = view.others[0]
  plate(8, 144, true, st, me.bankroll, me.handSize, me.mulligans, them.bankroll)
  plate(482, 12, false, st, them.bankroll, them.handSize, them.mulligans, me.bankroll)
  if (view.twist) twistSign(view)
  if (bubble && now - bubble.t < 2600) speech(bubble.text, now - bubble.t)
  calmBand(bandTop)
  slips(st)
  let top = colTop
  if (st.settled && !st.counting && view.last) top = tally(st)
  bandTop = colText(st, top - 6) - 8 // next frame's band starts above whatever is in the column
  cheatBall(t)
  vitrine(st, t)
}

let bandTop = COL.bottom

// the cheat sheet, a crumpled ball on the rail. outlined with a tag on hover, a gold glint now and then
function cheatBall(t: number): void {
  const x = 486
  const y = 338
  const over = hit(x - 12, y - 11, 24, 22, () => { cheatOpen = true; sfx.flip(false) })
  const r = over ? Math.sin(t * 20) * 0.15 : 0
  if (over) outline('hud/cheat/ball', x, y, r)
  pin('hud/cheat/ball', x, y, { r })
  if (t % 8 < 0.15) {
    g.fillStyle = '#fff0b0'
    g.fillRect(x + 3, y - 6, 1, 1)
    g.fillRect(x + 2, y - 5, 3, 1)
    g.fillRect(x + 3, y - 4, 1, 1)
  }
  if (over) text('Hands', x, y - 22, { font: 'sans', color: CREAM, align: 'center', bold: true, outline: OUTLINE })
}

function plate(x: number, y: number, mine: boolean, st: DuelState, bankroll: number, handSize: number, mulls: number, theirs: number): void {
  nine('hud/plate/frame', x, y, 150, 58)
  nine('hud/plate/paper', x + 5, y + 5, 140, 48)
  pin(`mask/${mine ? st.myMask : st.rival.mask}/icon`, x + 20, y + 17)
  text(mine ? st.view.me.name === 'You' ? 'Vous' : st.view.me.name : st.rival.name, x + 34, y + 9, { font: 'sans', color: INK })
  const j = juiced(mine ? 'plate0' : 'plate1')
  g.save()
  g.translate(x + 12, y + 41)
  g.scale(j.s, j.s)
  text(`$${bankroll}`, 0, -17, { font: 'didone', color: mine ? '#3e66a0' : BURGUNDY })
  g.restore()
  for (const [i, [icon, n]] of ([['hand', handSize], ['mulligan', mulls]] as const).entries()) {
    pin(`icon/${icon}`, x + 84 + i * 31, y + 35)
    text(String(n), x + 95 + i * 31, y + 33, { font: 'sans', color: INK })
  }
  // 2x behind: peek + the cheap flambé
  if (bankroll * 2 <= theirs) {
    pin('icon/peek', x + 60, y + 24)
    pin('icon/cheap_flamber', x + 60, y + 35)
  }
  if (!mine) text(st.rival.stamp, x + 138, y + 12, { font: 'tiny', color: BURGUNDY, align: 'right' })
  const clock = mine ? st.clock() : ''
  if (clock) text(clock, x + 138, y + 13, { font: 'sans', color: BURGUNDY, align: 'right', bold: true })
}

function twistSign(view: SeatView): void {
  tile('hud/twist/string', 204, 0, 1, 53)
  tile('hud/twist/string', 271, 0, 1, 53)
  nine('hud/twist/sign', 183, 52, 111, 36)
  const name = twistLabel(view)
  if (measure(name, 'didone') <= 104) text(name, 238, 52, { font: 'didone', color: BURGUNDY, align: 'center' })
  else text(name.toUpperCase(), 238, 57, { font: 'sans', color: BURGUNDY, align: 'center', bold: true })
  const rule = wrap(view.twist ? twistText(view.twist) : '', 104, 'tiny')
  rule.slice(0, 2).forEach((line, i) => text(line, 238, 72 + i * 7, { font: 'tiny', color: INK, align: 'center' }))
}

// the rival's line, in a bubble to the left of their head (their plate owns the right)
function speech(s: string, age: number): void {
  const j = age < 300 ? 1 + 0.2 * Math.exp(-age / 60) : 1
  g.save()
  g.translate(RIVAL_X - 32, 82)
  g.scale(j, j)
  const w = Math.max(40, measure(s, 'sans') + 16)
  nine('bubble/9slice', -w, -10, w, 20)
  pin('bubble/tail', -1, 0, { r: -Math.PI / 2 })
  text(s, -w / 2, -8, { font: 'sans', align: 'center', color: INK })
  g.restore()
}

// ---------- the action column ----------
// the right edge of the stage is the dealer's corner: messages, the result tally and the tickets.
// nothing else lives here, so nothing competes with what you can press

// action colors (READABILITY.md §4): face, plinth, label. one color per action, everywhere
const TICKET: Record<Kind, { face: string; plinth: string; label: string }> = {
  lock: { face: '#3e66a0', plinth: '#0f1d33', label: CREAM },
  max: { face: '#a82a38', plinth: '#2a0910', label: CREAM },
  match: { face: '#a82a38', plinth: '#2a0910', label: CREAM },
  min: { face: '#3a8040', plinth: '#1e4a24', label: CREAM },
  forge: { face: '#e8501a', plinth: '#5a1206', label: CREAM },
  fold: { face: '#8c7656', plinth: '#2a2010', label: CREAM },
  mulligan: { face: '#7a4ab0', plinth: '#2a1440', label: CREAM },
  continue: { face: '#c99a3a', plinth: '#3d2a10', label: '#1c1513' },
}
const TW = COL.w
const PITCH = 30 // 24 face + 3 plinth + 3 air

let hoverSlip = -1
let pressed: { i: number; t: number } | null = null
let colTop = COL.bottom // top of the ticket stack. the tally and messages stack above it
let presses: (() => void)[] = [] // this frame's ticket actions, for the keyboard

// a dark band down the right edge from top to the stage bottom, so the tickets sit on near-black like balatro's sidebar
function calmBand(top: number): void {
  const x = COL.x - 26
  const grad = g.createLinearGradient(x, 0, COL.x + 10, 0)
  grad.addColorStop(0, 'rgba(14,11,10,0)')
  grad.addColorStop(1, 'rgba(14,11,10,0.66)')
  g.save()
  g.fillStyle = grad
  g.fillRect(x, top, W - x, H - top)
  // fade in over 40 at the top edge
  for (let y = 0; y < 40; y += 2) {
    g.globalAlpha = (y / 40) ** 1.5
    g.fillRect(x, top - 40 + y, W - x, 2)
  }
  g.restore()
}

function slips(st: DuelState): void {
  const list = st.slips
  colTop = COL.bottom - (list.length ? list.length * PITCH - 3 : 0)
  presses = []
  let hovering = -1
  list.forEach((s, i) => {
    const y = colTop + i * PITCH
    const key = `slip${list.length}:${i}` // by position, so a label change doesn't fly it in again
    const at = spring(key, { x: COL.x, y, r: 0, s: 1 }, { x: W + 10 + i * 16, y, r: 0, s: 1 }) // farther start = a little stagger
    const act = () => {
      pressed = { i, t: now }
      if (s.stamp) stamps.push({ name: `hud/stamp/${s.stamp}`, x: at.x + TW / 2, y: at.y + 12, t: now })
      sfx.coin()
      s.onClick()
    }
    presses.push(s.enabled ? act : () => {})
    const over = s.enabled && hit(at.x, at.y - 4, TW, PITCH, act)
    if (over) {
      hovering = i
      if (hoverSlip !== i) pop(key)
    }
    const down = pressed?.i === i && now - pressed.t < 90
    const gap = down ? 0 : over ? 4 : 3
    const j = juiced(key)
    const pulse = s.primary && !over ? 1 + 0.03 * breath() : 1
    g.save()
    g.translate(at.x + TW / 2, at.y + 13)
    g.scale(j.s * pulse, j.s * pulse)
    g.rotate(j.r * 0.35)
    g.translate(-TW / 2, -13)
    ticket(s, gap, over)
    g.restore()
  })
  hoverSlip = hovering
}

// 0 → 1 → 0 over 1.2s, the primary ticket's breathing
const breath = () => 0.5 - 0.5 * Math.cos((now / 1200) * Math.PI * 2)

// one raffle ticket at 0,0: plinth, face lifted by gap, label, price chip
function ticket(s: Slip, gap: number, over: boolean): void {
  const c = TICKET[s.kind]
  if (!s.enabled) {
    nine('hud/ticket/face', 0, 3, TW, 24, '#43342e')
    text(s.label, 11, 8, { font: 'chalk', color: '#8c7656', bold: true })
    if (s.price) text(s.price, TW - 8, 9, { font: 'sans', color: '#8c7656', align: 'right' })
    g.fillStyle = '#8c7656'
    g.fillRect(8, 14, TW - 14, 1)
    return
  }
  if (s.primary) glow(TW / 2, 14, 74, `rgba(232,194,96,${0.22 + 0.16 * breath()})`)
  nine('hud/ticket/plinth', 0, 3, TW, 24, c.plinth)
  const fy = 3 - gap
  if (over) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) nine('hud/ticket/plinth', dx, fy + dy, TW, 24, CREAM)
  nine('hud/ticket/face', 0, fy, TW, 24, c.face)
  g.fillStyle = 'rgba(255,255,255,0.3)'
  g.fillRect(1, fy + 1, TW - 2, 1)
  const dark = c.label !== CREAM
  text(s.label, 11, fy + 5, { font: 'chalk', color: c.label, bold: true, outline: dark ? undefined : OUTLINE })
  if (s.price) {
    const pw = measure(s.price, 'sans') + 8
    const px = TW - pw - 5
    nine('hud/ticket/chip', px, fy + 5, pw, 13)
    text(s.price, px + pw / 2, fy + 6, { font: 'sans', color: INK, align: 'center' })
  }
}

// the hint, and the latest log line above it, stacked upward from bottom. returns the new top
function colText(st: DuelState, bottom: number): number {
  let y = bottom
  const hint = st.hint ? wrap(st.hint, COL.w - 4, 'sans') : []
  y -= hint.length * 10
  hint.forEach((line, i) => text(line, COL.x + 2, y + i * 10, { font: 'sans', color: CREAM, outline: OUTLINE }))
  const toast = st.toast ? wrap(st.toast, COL.w - 4, 'sans').slice(-3) : []
  if (toast.length) {
    y -= toast.length * 10 + (hint.length ? 4 : 0)
    toast.forEach((line, i) => text(line, COL.x + 2, y + i * 10, { font: 'sans', color: '#bfa77e', outline: OUTLINE }))
  }
  return y
}

// the round-end tally: pot, house, interest, extras, plus what else happened. it sits above Continue.
// returns its top
function tally(st: DuelState): number {
  const r = st.view.last!
  const title = { win: 'You take the pot', loss: `${st.rival.name} takes it`, tie: 'Dead even', fold: 'You folded', forge: 'Flambé !', bye: 'Bye' }[r.outcome]
  const rows: [string, number][] = ([['Pot', r.tally.pot], ['House', r.tally.house], ['Interest', r.tally.interest], ['Extras', r.tally.extras]] as [string, number][]).filter(([, n]) => n !== 0)
  const total = r.tally.pot + r.tally.house + r.tally.interest + r.tally.extras
  const notes: string[] = []
  if (r.forged) notes.push(`New card: ${describeCard(r.forged) || 'flambéed'}`)
  if (r.bulk) notes.push(`The flambé left ${r.bulk} Bulk in your deck.`)
  if (r.ground) notes.push(`Folding ground a card up to +${r.ground.grind} Value.`)
  if (r.torn.length) notes.push(`Torn up: ${r.torn.length} card${r.torn.length > 1 ? 's' : ''}.`)
  if (r.stolen) notes.push('Sticky Fingers: you took one of their cards.')
  if (r.robbed) notes.push('Sticky Fingers: they took one of yours.')
  const w = COL.w - 8
  const noteLines = notes.flatMap(n => wrap(n, w - 12, 'sans'))
  const h = 34 + rows.length * 11 + 14 + noteLines.length * 10
  const x = COL.x + 4
  const y = colTop - 10 - h
  const at = spring('tally', { x, y, r: 0, s: 1 }, { x: W + 20, y, r: 0, s: 1 })
  nine('hud/plate/frame', at.x - 4, at.y - 4, w + 8, h + 8)
  nine('hud/plate/paper', at.x, at.y, w, h)
  const titleColor = r.outcome === 'win' || r.outcome === 'forge' ? '#a8260a' : INK
  if (measure(title, 'didone') <= w - 8) text(title, at.x + w / 2, at.y + 1, { font: 'didone', color: titleColor, align: 'center' })
  else if (measure(title, 'sans', true) <= w - 8) text(title, at.x + w / 2, at.y + 6, { font: 'sans', color: titleColor, align: 'center', bold: true })
  else text(title, at.x + w / 2, at.y + 6, { font: 'sans', color: titleColor, align: 'center' })
  rows.forEach(([label, n], i) => {
    const ry = at.y + 24 + i * 11
    text(label, at.x + 8, ry, { font: 'sans' })
    text(`${n > 0 ? '+' : '−'}$${Math.abs(n)}`, at.x + w - 8, ry, { font: 'sans', color: n > 0 ? '#3a8040' : BURGUNDY, align: 'right', bold: true })
  })
  const ty = at.y + 26 + rows.length * 11
  g.fillStyle = '#bfa77e'
  g.fillRect(at.x + 6, ty - 2, w - 12, 1)
  text('This round', at.x + 8, ty + 1, { font: 'sans', bold: true })
  text(`${total >= 0 ? '+' : '−'}$${Math.abs(total)}`, at.x + w - 8, ty + 1, { font: 'sans', bold: true, align: 'right', color: total >= 0 ? '#3a8040' : BURGUNDY })
  noteLines.forEach((line, i) => text(line, at.x + 6, ty + 12 + i * 10, { font: 'sans', color: '#5c4a36' }))
  return y - 8
}

// keys: 1–4 press the tickets top to bottom, space or enter presses the primary one
window.addEventListener('keydown', e => {
  if (!state || !cv?.isConnected || e.repeat) return
  if (cheatOpen) {
    cheatOpen = false
    return
  }
  const n = Number(e.key)
  if (n >= 1 && n <= presses.length) presses[n - 1]()
  else if (e.key === ' ' || e.key === 'Enter') {
    const i = state.slips.findIndex(s => s.primary && s.enabled)
    if (i < 0) return
    e.preventDefault()
    presses[i]?.()
  }
})

function vitrine(st: DuelState, t: number): void {
  const items: Owned[] = st.view.me.display
  if (vitrineOpen) {
    const slots = Math.max(items.length, st.view.me.displaySlots)
    const w = 18 + Math.max(3, slots) * 79
    const at = spring('vitrine', { x: 8, y: 15, r: 0, s: 1 }, { x: 8, y: -130, r: 0, s: 1 })
    hit(at.x, at.y, w, 124, () => {}) // clicks inside the case don't close it
    nine('hud/vitrine/case', at.x, at.y, w, 124)
    const paper = sub(sprite('base/paper'))
    for (let i = 0; i < slots; i++) {
      const x = at.x + 18 + i * 79
      const y = at.y + 21
      const o = items[i]
      if (!o) {
        g.save()
        g.globalAlpha = 0.25
        g.drawImage(paper, x, y)
        g.restore()
        continue
      }
      const def = getDef(o.id)
      const j = juiced(`slot${i}`)
      g.save()
      g.translate(x + 32, y + 44)
      g.scale(j.s, j.s)
      g.rotate(j.r)
      g.drawImage(paper, -32, -44)
      const name = wrap(def.name, 56, 'tiny')
      name.forEach((line, n) => text(line, 0, -39 + n * 7, { font: 'tiny', align: 'center', color: INK }))
      const body = wrap(describe(o), 54, 'tiny')
      body.slice(0, 7).forEach((line, n) => text(line, 0, -20 + n * 7, { font: 'tiny', align: 'center', color: '#5c4a36' }))
      text(def.rarity, 0, 33, { font: 'tiny', align: 'center', color: BURGUNDY })
      g.restore()
    }
  }
  const over = hit(8, 0, 64, 18, () => { vitrineOpen = !vitrineOpen })
  const drop = over && !vitrineOpen ? 2 : 0
  if (over) outline('hud/vitrine/tab', 8, drop)
  pin('hud/vitrine/tab', 8, drop + (over ? Math.sin(t * 8) * 0.3 : 0))
}

function cheatSheet(st: DuelState): void {
  g.fillStyle = 'rgba(14,11,10,0.62)'
  g.fillRect(0, 0, W, H)
  nine('hud/cheat/sheet', 44, 10, 552, 340)
  const crease = sub(sprite('hud/cheat/crease'))
  for (const x of [230, 421]) centered(crease, x, 180, 3, 323)
  text('Les mains de poker', 73, 22, { font: 'didone' })
  text('HAND', 72, 56, { font: 'sans', color: BURGUNDY })
  text('CARDS', 262, 56, { font: 'sans', color: BURGUNDY })
  text('VALUE', 460, 56, { font: 'sans', color: BURGUNDY, align: 'center' })
  text('HYPE', 526, 56, { font: 'sans', color: BURGUNDY, align: 'center' })
  const examples: Record<string, string> = {
    royalflush: '10h Jh Qh Kh Ah', straightflush: '4s 5s 6s 7s 8s', quads: '9h 9s 9d 9c', fullhouse: 'Kh Ks Kd 8c 8h',
    flush: '2d 4d 7d Jd Ad', straight: '4s 5h 6c 7d 8s', trips: 'Qh Qs Qd', twopair: '10s 10h 8c 8d', pair: 'Jh Jc', high: 'As',
  }
  const rankOf: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 }
  ;[...HAND_TYPES].reverse().forEach((h, i) => {
    const y = 71 + 26 * i
    const lv = st.view.me.levels[h]
    text(HAND_NAMES[h] + (lv ? `  lv${lv + 1}` : ''), 73, y + 4, { font: 'sans' })
    examples[h].split(' ').forEach((ex, j) => {
      const r = ex.slice(0, -1)
      const face = faceCanvas(rankOf[r] ?? Number(r), ex.slice(-1).toUpperCase() as Card['suit'])
      g.drawImage(face, 0, 0, 14, 24, 263 + j * 21, y, 14, 24)
    })
    text(String(HAND_BASE[h].value), 460, y + 4, { font: 'sans', align: 'center' })
    text(String(HAND_BASE[h].hype), 526, y + 4, { font: 'sans', align: 'center', color: BURGUNDY })
  })
  text('base numbers, before levels and cards', 320, 334, { font: 'tiny', align: 'center', color: '#8c7656' })
}

function effects(): void {
  for (let i = stamps.length - 1; i >= 0; i--) {
    const s = stamps[i]
    const age = (now - s.t) / 1000
    if (age > 0.6) {
      stamps.splice(i, 1)
      continue
    }
    const scale = age < 0.08 ? 2 - age / 0.08 : 1
    pin(s.name, s.x, s.y, { s: scale, r: -0.12, alpha: Math.min(1, (0.6 - age) * 4) })
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]
    const age = (now - f.t) / 1000
    if (age > 0.9) {
      floats.splice(i, 1)
      continue
    }
    text(f.text, f.x, f.y - age * 18, { font: 'sans', color: f.color, align: 'center', bold: true, outline: OUTLINE, alpha: Math.min(1, (0.9 - age) * 3) })
  }
}

// ---------- the count-up ----------

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// both appraisals tick up side by side, one step at a time. each scoring card pops and floats its number
export async function countUp(sd: ShowdownView): Promise<void> {
  const fresh = (): Live => ({ v: 0, h: 0, g: 0, label: '', step: '' })
  live = [fresh(), fresh()]
  await sleep(500) // let the cards land on their spots
  const sides = [sd.mine, sd.theirs]
  const cards = [...sd.myCards, ...sd.theirCards]
  const steps = Math.max(sd.mine.steps.length, sd.theirs.steps.length)
  for (let i = 0; i < steps; i++) {
    let gradeHit = false
    sides.forEach((a, n) => {
      const st = a.steps[i]
      if (!st) return
      const l = live![n]
      l.v += st.value
      l.h += st.hype
      l.g += st.grade
      if (st.grade) gradeHit = true
      if (i <= a.bonus.length) l.label = [a.hand, ...a.bonus.slice(0, i)].map(h => HAND_NAMES[h]).join(' + ')
      const card = st.cardId !== null ? cards.find(c => c.id === st.cardId) : undefined
      l.step = i === 0 ? '' : st.label === 'card' && card ? '' : st.label
      pop(`tag${n}`)
      if (st.slot !== null && n === 0) {
        pop(`slot${st.slot}`)
        if (!vitrineOpen) l.step = st.label
      }
      if (card) {
        pop(`card${card.id}`)
        const s = springs.get(`card${card.id}`)
        if (s) {
          const bits: [string, string][] = []
          if (st.value) bits.push([`+${st.value}`, CREAM])
          if (st.hype) bits.push([`+${st.hype} Hype`, FLAME])
          if (st.grade) bits.push([`×2^${st.grade}`, GOLD])
          bits.forEach(([s_, color], b) => floats.push({ text: s_, x: s.at.x, y: s.at.y - 30 - b * 11, color, t: now }))
        }
      }
    })
    if (gradeHit) sfx.gradeUp()
    else sfx.tick(i)
    await sleep(Math.max(130, 340 - i * 14))
  }
  sides.forEach((a, n) => {
    const l = live![n]
    if (l.v * Math.max(1, l.h) * 2 ** l.g !== a.total) throw new Error('count-up does not match appraisal')
  })
  live = null
  pop(sd.winner === null ? 'tag0' : sd.winner === sd.opponent ? 'tag1' : 'tag0')
}

export function bump(which: 'me' | 'rival'): void {
  pop(which === 'me' ? 'plate0' : 'plate1')
}
