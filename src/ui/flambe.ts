// the flambé, as a beat of its own (docs/FLAMBER.md §2). the cards that merge lift to the middle of the felt at full
// size, a match runs along their bottoms and lights each one, and they burn the title logo's way (fire.ts). each
// burning card has something underneath it: the survivor burns down to the new ★ card, the rest burn down to Ash,
// and their flame pours into the survivor as they go. the kickers never touch the fire, they go to the discard.
// a grind (no pair) is its own short beat: nothing burns, the card is heated, quenched, and comes back +1 Value.
// duel.ts owns where things are, this file only draws the beat on the felt in stage units
import { newBulk, type Card } from '../engine/cards.ts'
import { canvas, cardCanvas, ctx2d, sprite, tierInk } from './art.ts'
import { drawText } from './font.ts'
import { VALUE } from './ink.ts'
import { land, mix, progress } from './motion.ts'
import { flash, still } from './prefs.ts'
import * as sfx from './sound.ts'
import { FIRE, STEP_MS, drawBurn, drawFire, drawSparks, feed, makeBurn, makeFire, stepFire, stepSparks, type Burn, type Fire, type Spark } from './fire.ts'

export type Spot = { x: number; y: number; s: number }

export type FlambeSpec = {
  burn: Card[] // what the flambé eats (forgePlan's merged), in table order. empty for a grind
  survivor: number // which of them comes back as the ★ card (the one whose rank and suit it keeps)
  result: Card // the ★ card, or for a grind the card after its +1
  ground: Card | null // a grind: the card before its +1
  kickers: Card[] // locked, never burned: to the discard whole
  label: string // the hand, for the caption: 'Pair of 5s'
  from: (card: Card) => Spot // where a locked card starts
  hand: Spot // where the ★ card (or the ground card) goes
  discard: Spot
  row?: number // the burn row's y, 196 if not given
}

type Cell = {
  card: Card
  art: HTMLCanvasElement
  burn: Burn | null
  x: number; y: number // its place in the row
  from: Spot
  ignite: number // ms from the start
  ix: number // where along its bottom the match touched, card-local
  done: number // burnt through
  ash: boolean
  ignited: boolean
  poured: boolean // its flame has left for the survivor
  arrived: boolean
  lean: number
}

export type Flambe = {
  spec: FlambeSpec
  at: number
  row: number
  cells: Cell[]
  back: Fire // tall, behind the cards
  front: Fire // short licks, over them
  sparks: Spark[]
  steps: number // fire steps run
  last: number // the last frame's time
  reveal: number // ms: the survivor is through and the ★ card is out
  settle: number
  end: number
  match: { x0: number; x1: number; y: number; t0: number; t1: number }
  heard: Set<string>
  crackleAt: number
  roarAt: number
}

const CLEAR = 520 // kickers off, the cards lift to the row
const MATCH = 560 // the match comes in
const PER_CARD = 170 // the match's pace along the row
const ASH_BURN = 1250
const POUR = 480 // a card's flame flying into the survivor
const HOLD = 1050
const SETTLE = 650
const CX = 320
const GRIND_HEAT = 1100

const ash = newBulk({ nextCardId: -1 }, 0)

export function startFlambe(spec: FlambeSpec, now: number): Flambe {
  const grind = !spec.burn.length
  const ROW_Y = spec.row ?? 196
  const burning = grind ? [spec.ground!] : spec.burn
  // the survivor takes the middle of the row, the rest keep their order around it
  const n = burning.length
  const order = grind ? [0] : burning.map((_, i) => i).filter(i => i !== spec.survivor)
  if (!grind) order.splice(Math.floor(n / 2), 0, spec.survivor)
  const gap = n > 3 ? 68 : 74
  const cells: Cell[] = order.map((i, slot) => {
    const card = burning[i]
    const art = cardCanvas(card)
    return {
      card, art, burn: null, x: CX + (slot - (n - 1) / 2) * gap, y: ROW_Y, from: spec.from(card),
      ignite: 0, ix: 32, done: 0, ash: !grind && i !== spec.survivor, ignited: false, poured: false, arrived: false,
      lean: (slot - (n - 1) / 2) * 0.012,
    }
  })
  const x0 = cells[0].x - 70, x1 = cells[n - 1].x + 70
  const t1 = MATCH + 220 + n * PER_CARD
  const seed = spec.result.id & 0xffff
  cells.forEach((c, slot) => {
    // the match head touches each card's bottom edge as it passes
    const local = 32 + Math.round(Math.sin(seed + slot * 2.3) * 12)
    c.ix = local
    const sx = c.x - c.art.width / 2 + local
    c.ignite = MATCH + 220 + (t1 - MATCH - 220) * ((sx - x0) / (x1 - x0))
    const under = grind ? null : cardCanvas(c.ash ? ash : spec.result)
    if (!grind) c.burn = makeBurn(c.art, under, { x: local, y: c.art.height - 2 }, seed + slot * 17)
    c.done = c.ignite + ASH_BURN
  })
  let reveal: number
  if (grind) reveal = cells[0].ignite + GRIND_HEAT
  else {
    const s = cells[Math.floor(n / 2)]
    const lastAsh = Math.max(0, ...cells.filter(c => c.ash).map(c => c.done))
    reveal = Math.max(lastAsh + POUR + 120, s.ignite + 1500)
    s.done = reveal
  }
  return {
    spec, at: now, row: ROW_Y, cells,
    back: makeFire(CX - 250, ROW_Y - 176, 500, 250),
    front: { ...makeFire(CX - 250, ROW_Y - 96, 500, 170), tall: 1.5 }, // licks up over what hasn't burnt yet
    sparks: [], steps: 0, last: now, reveal, settle: reveal + HOLD, end: reveal + HOLD + SETTLE + 120,
    match: { x0, x1, y: ROW_Y + 44 + 3, t0: MATCH, t1 },
    heard: new Set(), crackleAt: 0, roarAt: 0,
  }
}

const once = (fx: Flambe, key: string) => (fx.heard.has(key) ? false : (fx.heard.add(key), true))

// how hard the fire lights the room, 0..~1.5. duel.ts flares the lamp with it
export function firelight(fx: Flambe | null): number {
  return fx ? fx.back.glow : 0
}

// how much the table dims behind the beat, 0..1: in with the lift, out with the settle
export function flambeFocus(fx: Flambe | null, now: number): number {
  if (!fx) return 0
  const age = now - fx.at
  return progress(age, CLEAR) * (1 - progress(age - fx.settle, SETTLE))
}

// a ★★★ flambé shakes the camera when it comes out
export function flambeShake(fx: Flambe | null, now: number): number {
  if (!fx || fx.spec.result.tier < 3 || fx.spec.ground) return 0
  const age = now - fx.at - fx.reveal
  return age >= 0 && age < 450 ? 1 - age / 450 : 0
}

// a click: straight to the ★ card leaving. false = already leaving, the click is for something else
export function skipFlambe(fx: Flambe, now: number): boolean {
  if (now - fx.at >= fx.settle) return false
  fx.at = now - fx.settle
  fx.steps = Math.floor(fx.settle / STEP_MS) // the fire doesn't try to catch up on what it skipped
  fx.heard.add('strike')
  fx.cells.forEach((_, i) => fx.heard.add('ignite' + i))
  return true
}

// draws one frame. false = it's over
export function drawFlambe(g: CanvasRenderingContext2D, fx: Flambe, now: number): boolean {
  const age = now - fx.at
  if (age >= fx.end) return false
  if (still.matches) return stillFrame(g, fx, age)
  const dt = Math.min(0.05, (now - fx.last) / 1000)
  fx.last = now
  const grind = !!fx.spec.ground
  const S = fx.cells[Math.floor(fx.cells.length / 2)]
  const leaving = progress(age - fx.settle, SETTLE)

  sounds(fx, age)
  if (age < fx.settle + SETTLE * 0.4) {
    // the fire steps at 15 fps, catching up if a frame was slow (never more than 3 at once)
    const due = Math.min(fx.steps + 3, Math.floor(age / STEP_MS))
    while (fx.steps < due) {
      fx.steps++
      feedFire(fx, fx.steps * STEP_MS)
      fx.back.tall = age > fx.reveal && age < fx.reveal + 260 ? 3.4 : 2.1
      stepFire(fx.back)
      stepFire(fx.front)
    }
  }
  stepSparks(fx.sparks, dt)

  // firelight on the felt, under everything
  const light = fx.back.glow
  if (light > 0.02) {
    g.save()
    g.globalCompositeOperation = 'lighter'
    const r = g.createRadialGradient(CX, fx.row + 30, 0, CX, fx.row + 30, 230)
    r.addColorStop(0, `rgba(255,140,46,${0.32 * Math.min(1, light)})`)
    r.addColorStop(1, 'rgba(255,90,20,0)')
    g.fillStyle = r
    g.fillRect(CX - 240, fx.row - 210, 480, 420)
    g.restore()
  }

  kickers(g, fx, age)

  // the ★ card's rays, behind everything that burns
  if (!grind && age >= fx.reveal) {
    const rise = land(progress(age - fx.reveal, 380))
    const rays = sprite('fx/rays')
    const k = (150 * rise) / Math.max(rays.w, rays.h)
    g.save()
    g.translate(S.x, S.y)
    g.rotate(age / 1100)
    g.globalAlpha = 0.55 * rise * (1 - leaving)
    g.drawImage(rays.img, rays.x, rays.y, rays.w, rays.h, (-rays.w * k) / 2, (-rays.h * k) / 2, rays.w * k, rays.h * k)
    g.restore()
  }

  drawFire(g, fx.back, 1 - leaving)
  for (const c of fx.cells) drawCell(g, fx, c, age, S)
  drawFire(g, fx.front, 0.92 * (1 - leaving))
  drawSparks(g, fx.sparks)
  drawMatch(g, fx, age)

  // the flash as the ★ card comes out
  if (!grind) {
    const flashed = 1 - progress(age - fx.reveal, 260)
    if (age >= fx.reveal && flashed > 0) {
      g.fillStyle = `rgba(255,251,232,${flash((fx.spec.result.tier === 3 ? 0.6 : 0.38) * flashed)})`
      g.fillRect(-40, -40, 720, 440)
    }
  }
  captions(g, fx, age, S)
  return true
}

// ---------- the fire ----------

function feedFire(fx: Flambe, age: number): void {
  const grind = !!fx.spec.ground
  const S = fx.cells[Math.floor(fx.cells.length / 2)]
  for (const c of fx.cells) {
    if (age < c.ignite) continue
    const ox = Math.round(c.x - c.art.width / 2), oy = Math.round(c.y - c.art.height / 2)
    if (grind) {
      // nothing burns: flames lick the bottom edge while it heats, then the quench puts them out
      if (age < fx.reveal) {
        const heat = Math.min(1, (age - c.ignite) / 250)
        for (let x = 2; x < c.art.width - 2; x++) {
          feed(fx.back, ox + x, oy + c.art.height - 1, 0.9 * heat)
          if ((x + fx.steps) % 3) feed(fx.front, ox + x, oy + c.art.height - 2, 0.55 * heat)
        }
      }
      continue
    }
    const b = c.burn!
    const t = burnT(fx, c, age)
    if (t >= 1) {
      // ash smoulders: a few licks, then nothing
      if (c.ash && age < c.done + 700) {
        const left = 1 - (age - c.done) / 700
        for (let i = 0; i < 6; i++) {
          const x = ox + 6 + ((i * 37 + fx.steps * 11) % (c.art.width - 12))
          feed(fx.front, x, oy + c.art.height - 3, 0.5 * left)
        }
      }
      continue
    }
    // the glowing edge is the fire's fuel. it roars hardest mid-burn
    const roar = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.3))
    const e = b.edge
    for (let i = 0; i < e.length; i += 2) {
      feed(fx.back, ox + e[i], oy + e[i + 1], 1.05 * roar)
      if ((e[i] + e[i + 1] + fx.steps) % 2) feed(fx.front, ox + e[i], oy + e[i + 1], 0.85 * roar)
    }
    // embers and ash flakes off the edge
    for (let i = 0; i < 3 && e.length; i++) {
      const j = 2 * Math.floor(Math.random() * (e.length / 2))
      spark(fx, ox + e[j], oy + e[j + 1], Math.random() < 0.7 ? 'ember' : 'ash')
    }
  }
  // the survivor coming out: a burst of heat all along its bottom
  if (!grind && age >= fx.reveal && age < fx.reveal + 2 * STEP_MS) {
    const ox = Math.round(S.x - S.art.width / 2), oy = Math.round(S.y + S.art.height / 2)
    for (let x = -8; x < S.art.width + 8; x++) feed(fx.back, ox + x, oy - 1, 1.2)
    for (let i = 0; i < 26; i++) spark(fx, S.x + (Math.random() - 0.5) * 60, S.y + 30, 'ember', 1.8)
  }
}

function spark(fx: Flambe, x: number, y: number, kind: Spark['kind'], speed = 1): void {
  const up = kind === 'ash' ? 10 : 34
  fx.sparks.push({
    x, y, kind, seed: Math.random(), age: 0,
    vx: (Math.random() - 0.5) * 24 * speed, vy: -(up + Math.random() * up) * speed,
    life: kind === 'ash' ? 1.4 + Math.random() : 0.5 + Math.random() * 0.7,
  })
}

// how far through its burn a card is. ash goes steady, the survivor holds on until every flame has poured in
function burnT(fx: Flambe, c: Cell, age: number): number {
  const t = progress(age - c.ignite, c.done - c.ignite)
  return t * t * (3 - 2 * t) * 0.85 + t * 0.15
}

// ---------- the cards ----------

function kickers(g: CanvasRenderingContext2D, fx: Flambe, age: number): void {
  const u = progress(age, CLEAR + 120)
  if (u >= 1) return
  fx.spec.kickers.forEach((card, i) => {
    const from = fx.spec.from(card)
    const t = land(progress(age - i * 50, CLEAR))
    const to = fx.spec.discard
    const x = mix(from.x, to.x, t), y = mix(from.y, to.y, t) - 14 * Math.sin(Math.PI * t)
    const s = mix(from.s, to.s, t)
    const art = cardCanvas(card)
    g.save()
    g.translate(Math.round(x), Math.round(y))
    g.rotate(0.3 * t * (i % 2 ? -1 : 1))
    g.globalAlpha = 1 - progress(age - CLEAR, 120)
    g.drawImage(art, (-art.width * s) / 2, (-art.height * s) / 2, art.width * s, art.height * s)
    g.fillStyle = `rgba(14,11,10,${0.45 * t})`
    g.fillRect((-art.width * s) / 2, (-art.height * s) / 2, art.width * s, art.height * s)
    g.restore()
  })
}

function drawCell(g: CanvasRenderingContext2D, fx: Flambe, c: Cell, age: number, S: Cell): void {
  const grind = !!fx.spec.ground
  const survivor = c === S && !grind
  const lift = land(progress(age - fx.cells.indexOf(c) * 45, CLEAR))
  let x = mix(c.from.x, c.x, lift)
  let y = mix(c.from.y, c.y, lift) - 10 * Math.sin(Math.PI * lift)
  let s = mix(c.from.s, 1, lift)
  let r = c.lean * lift
  // a slow bob while it burns
  y += Math.sin(age / 420 + c.x / 40) * (age > CLEAR ? 1 : 0)
  if (survivor && age >= fx.reveal) {
    const pop = progress(age - fx.reveal, 360)
    s = 1 + 0.16 * Math.sin(Math.PI * Math.min(1, pop * 1.4)) * (1 - pop * 0.5)
    y -= 6 * land(pop)
    r = 0.04 * Math.sin(Math.PI * pop)
  }
  // settling: the ★ card to your hand, the ash to the discard (light, it flutters)
  const leave = progress(age - fx.settle - (c.ash ? 80 + fx.cells.indexOf(c) * 60 : 0), SETTLE - 80)
  if (leave > 0) {
    const to = c.ash ? fx.spec.discard : fx.spec.hand
    const t = c.ash ? land(leave) : leave * leave
    x = mix(x, to.x, t)
    y = mix(y, to.y, t) - (c.ash ? 26 : 10) * Math.sin(Math.PI * t)
    s = mix(s, to.s, t)
    r += c.ash ? Math.sin(leave * 9) * 0.25 * (1 - leave) : 0
    if (c.ash && Math.random() < 0.5) spark(fx, x, y + 10, 'ash', 0.6)
  }
  let art: HTMLCanvasElement = c.art
  if (grind) art = age >= fx.reveal ? cardCanvas(fx.spec.result) : c.art
  else if (age >= c.ignite) art = drawBurn(c.burn!, burnT(fx, c, age), fx.steps)
  if (age >= c.ignite && !c.ignited) {
    // it catches: a burst where the match touched
    c.ignited = true
    for (let i = 0; i < 12; i++) spark(fx, c.x - c.art.width / 2 + c.ix, c.y + c.art.height / 2 - 2, 'ember', 1.3)
  }
  const fade = c.ash && leave > 0.85 ? 1 - (leave - 0.85) / 0.15 : 1
  const w = art.width * s, h = art.height * s
  g.save()
  g.translate(Math.round(x), Math.round(y))
  if (r) g.rotate(r)
  g.globalAlpha = fade
  // a contact shadow on the felt while it hovers
  g.fillStyle = 'rgba(18,14,8,0.35)'
  g.fillRect(-w / 2 + 2, -h / 2 + 5, w, h)
  g.drawImage(art, Math.round(-w / 2), Math.round(-h / 2), w, h)
  // the ground card glows as it heats, white-hot at the end
  if (grind && age >= c.ignite && age < fx.reveal + 300) {
    const heat = age < fx.reveal ? progress(age - c.ignite, GRIND_HEAT) : 1 - progress(age - fx.reveal, 300)
    g.globalAlpha = 0.55 * heat * (0.85 + 0.15 * Math.sin(age / 40))
    g.drawImage(hot(c.art), Math.round(-w / 2), Math.round(-h / 2), w, h)
  }
  // the ★ card breathes its heat once it's out
  if (survivor && age >= fx.reveal) {
    const glowing = (1 - progress(age - fx.reveal, 900)) * 0.7 + 0.15 * Math.sin(age / 120) * (1 - leave)
    g.globalAlpha = Math.max(0, glowing)
    g.drawImage(rim(art, tierInk[Math.max(1, fx.spec.result.tier)]), Math.round(-w / 2) - 1, Math.round(-h / 2) - 1, w + 2, h + 2)
  }
  g.restore()
  if (!c.ash || leave > 0) return
  // its flame pours into the survivor once it's mostly ash
  const pourAt = c.ignite + ASH_BURN * 0.82
  if (age >= pourAt && !c.poured) {
    c.poured = true
    sfx.crackle(1)
  }
  if (c.poured && age < pourAt + POUR) {
    const t = progress(age - pourAt, POUR)
    for (let i = 0; i < 9; i++) {
      const u = Math.max(0, Math.min(1, t * 1.25 - i * 0.03))
      if (u <= 0 || u >= 1) continue
      const px = mix(c.x, S.x, u), py = mix(c.y - 10, S.y - 6, u) - 46 * Math.sin(Math.PI * u) + Math.sin(i * 1.7 + age / 50) * 3
      g.fillStyle = i % 3 ? FIRE.orange : FIRE.white
      g.fillRect(Math.round(px), Math.round(py), i === 0 ? 2 : 1, i === 0 ? 2 : 1)
      if (Math.random() < 0.3) fx.sparks.push({ x: px, y: py, vx: 0, vy: -6, age: 0, life: 0.35, kind: 'soul', seed: Math.random() })
    }
  }
  if (c.poured && age >= pourAt + POUR && !c.arrived) {
    c.arrived = true
    sfx.whump()
    for (let i = 0; i < 14; i++) spark(fx, S.x + (Math.random() - 0.5) * 40, S.y + (Math.random() - 0.2) * 40, 'ember', 1.4)
    for (let x = -30; x <= 30; x++) feed(fx.back, S.x + x, S.y + 44, 1.1)
  }
}

// a card's silhouette in the forge's orange, for the grind's heat
const hots = new Map<HTMLCanvasElement, HTMLCanvasElement>()
function hot(art: HTMLCanvasElement): HTMLCanvasElement {
  let c = hots.get(art)
  if (!c) {
    c = canvas(art.width, art.height)
    const h = ctx2d(c)
    h.drawImage(art, 0, 0)
    h.globalCompositeOperation = 'source-in'
    const grad = h.createLinearGradient(0, art.height, 0, 0)
    grad.addColorStop(0, FIRE.yellow)
    grad.addColorStop(0.5, FIRE.deep)
    grad.addColorStop(1, FIRE.red)
    h.fillStyle = grad
    h.fillRect(0, 0, art.width, art.height)
    hots.set(art, c)
  }
  return c
}

// a 1px rim around a card in its ★ color
const rims = new Map<string, HTMLCanvasElement>()
function rim(art: HTMLCanvasElement, ink: string): HTMLCanvasElement {
  const key = art.width + 'x' + art.height + ink
  let c = rims.get(key)
  if (!c) {
    c = canvas(art.width + 2, art.height + 2)
    const h = ctx2d(c)
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) h.drawImage(art, dx, dy)
    h.globalCompositeOperation = 'source-in'
    h.fillStyle = ink
    h.fillRect(0, 0, c.width, c.height)
    h.globalCompositeOperation = 'destination-out'
    h.drawImage(art, 1, 1)
    rims.set(key, c)
  }
  return c
}

// ---------- the match ----------

function drawMatch(g: CanvasRenderingContext2D, fx: Flambe, age: number): void {
  const m = fx.match
  if (age < m.t0 - 200 || age > m.t1 + 420) return
  // in from under the row, along the bottoms, then shaken out and dropped
  let hx: number, hy: number, a = 1
  if (age < m.t0) {
    const t = land(progress(age - m.t0 + 200, 200))
    hx = mix(m.x0 - 30, m.x0, t)
    hy = mix(m.y + 40, m.y, t)
  } else if (age < m.t1) {
    const t = progress(age - m.t0, m.t1 - m.t0)
    hx = mix(m.x0, m.x1, t)
    hy = m.y + Math.sin(t * Math.PI * fx.cells.length) * 1.5
  } else {
    const t = progress(age - m.t1, 420)
    hx = m.x1 + 18 * t + Math.sin(t * 30) * 4 * (1 - t)
    hy = m.y + 50 * t * t
    a = 1 - t
  }
  hx = Math.round(hx)
  hy = Math.round(hy)
  const lit = age >= m.t0 - 60 && age < m.t1 + 120
  g.save()
  g.globalAlpha = a
  // the stick, down and right from the head, shaded on one side
  for (let i = 2; i < 14; i++) {
    const x = hx + Math.round(i * 0.55), y = hy + Math.round(i * 0.84)
    g.fillStyle = i > 9 ? '#c99a3a' : lit && i < 4 ? '#3d2a10' : '#e8c260'
    g.fillRect(x, y, 1, 1)
    g.fillStyle = '#9c7028'
    g.fillRect(x + 1, y, 1, 1)
  }
  // the head
  g.fillStyle = lit ? '#2e1810' : '#a82a38'
  g.fillRect(hx - 1, hy - 1, 3, 3)
  g.fillStyle = lit ? '#5a3420' : '#d04a4e'
  g.fillRect(hx - 1, hy - 1, 1, 1)
  if (lit) {
    // its flame, flickering
    const f = Math.floor(age / 50) % 3
    const tall = 4 + f
    for (let i = 0; i < tall; i++) {
      const w = i < 2 ? 3 : i < tall - 1 ? 2 : 1
      g.fillStyle = i < 1 ? FIRE.white : i < 3 ? FIRE.yellow : FIRE.orange
      g.fillRect(hx - Math.floor(w / 2) + (i > 2 && f === 1 ? 1 : 0), hy - 2 - i, w, 1)
    }
    g.fillStyle = FIRE.deep
    g.fillRect(hx - 2, hy - 2, 1, 1)
    g.fillRect(hx + 2, hy - 2, 1, 1)
    feed(fx.front, hx, hy - 3, 0.5)
  }
  g.restore()
}

// ---------- words ----------

function captions(g: CanvasRenderingContext2D, fx: Flambe, age: number, S: Cell): void {
  const grind = !!fx.spec.ground
  const top = fx.row - 44 - 42
  const leaving = progress(age - fx.settle, 240)
  const inT = progress(age - CLEAR + 160, 240)
  const style = { font: 'chalk' as const, align: 'center' as const, outline: '#0e0b0a' }
  const n = fx.cells.length
  const out = grind ? '+1 Value' : `${n} cards → 1 ★ card + ${n - 1} Ash`
  const outT = progress(age - (grind ? fx.reveal : fx.reveal + 380), 260)
  // one caption line: the hand going in, then what came out in its place
  const swap = grind ? 0 : outT
  if (inT > 0 && leaving < 1 && swap < 1) {
    g.save()
    g.globalAlpha = inT * (1 - leaving) * (1 - swap)
    drawText(g, `Flambé · ${fx.spec.label}`, CX, top + 4 * (1 - inT) - 6 * swap, { ...style, color: '#f6ecd2' })
    g.restore()
  }
  if (outT > 0 && leaving < 1) {
    g.save()
    g.globalAlpha = outT * (1 - leaving)
    // stamped onto the card as it's quenched
    if (grind) drawText(g, out, S.x, S.y - 4, { ...style, color: VALUE.paper, bold: true, scale: outT < 0.5 ? 2 : 1 })
    else drawText(g, out, CX, top + 6 * (1 - outT), { ...style, color: '#f6ecd2' })
    g.restore()
  }
  if (!grind && age >= fx.reveal) {
    // the stars stamp in over the card, one a beat
    const tier = fx.spec.result.tier
    for (let i = 0; i < tier; i++) {
      const t = progress(age - fx.reveal - 200 - i * 140, 220)
      if (t <= 0 || leaving >= 1) continue
      const big = 1 + 0.8 * (1 - land(t))
      g.save()
      g.globalAlpha = Math.min(1, t * 2) * (1 - leaving)
      drawText(g, '★', S.x + (i - (tier - 1) / 2) * 14, S.y - 44 - 26, { ...style, color: tierInk[Math.min(3, tier)] || '#e8c260', scale: big >= 1.4 ? 2 : 1 })
      g.restore()
    }
  }
}

// ---------- sound ----------

function sounds(fx: Flambe, age: number): void {
  const grind = !!fx.spec.ground
  if (age >= fx.match.t0 - 80 && once(fx, 'strike')) sfx.strike()
  fx.cells.forEach((c, i) => {
    if (age >= c.ignite && once(fx, 'ignite' + i)) {
      if (grind) sfx.grind()
      else sfx.ignite(i)
    }
  })
  // its body: a swell every ~420ms while there's fire, following its size, gone after the reveal
  if (!grind && age > fx.cells[0].ignite && age < fx.reveal + 400 && age >= fx.roarAt) {
    sfx.roar(fx.back.glow)
    fx.roarAt = age + 420
  }
  // the fire pops while it burns, faster when it's big
  if (age > fx.cells[0].ignite && age < fx.reveal + 500 && age >= fx.crackleAt) {
    sfx.crackle(fx.back.glow)
    fx.crackleAt = age + 40 + Math.random() * (160 - 80 * Math.min(1, fx.back.glow))
  }
  if (age >= fx.reveal && once(fx, 'reveal')) {
    if (grind) sfx.quench()
    else {
      sfx.flambe()
      if (fx.spec.result.tier > 0) sfx.stars(fx.spec.result.tier)
    }
  }
  if (grind && age >= fx.reveal && once(fx, 'steam')) {
    const c = fx.cells[0]
    for (let i = 0; i < 40; i++) fx.sparks.push({ x: c.x + (Math.random() - 0.5) * 60, y: c.y + 20 + (Math.random() - 0.5) * 50, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 20, age: 0, life: 0.8 + Math.random() * 0.8, kind: 'steam', seed: Math.random() })
  }
  if (!grind && age >= fx.settle + SETTLE * 0.7 && once(fx, 'ash')) sfx.ash()
}

// ---------- reduced motion: the results cross-fade in place, no fire ----------

function stillFrame(g: CanvasRenderingContext2D, fx: Flambe, age: number): boolean {
  const t = progress(age - 200, 400)
  for (const c of fx.cells) {
    const after = fx.spec.ground ? cardCanvas(fx.spec.result) : cardCanvas(c.ash ? ash : fx.spec.result)
    g.save()
    g.globalAlpha = 1 - t
    g.drawImage(c.art, Math.round(c.x - c.art.width / 2), Math.round(c.y - c.art.height / 2))
    g.globalAlpha = t
    g.drawImage(after, Math.round(c.x - after.width / 2), Math.round(c.y - after.height / 2))
    g.restore()
  }
  return age < 1600
}
