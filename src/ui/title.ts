import { juiceAt } from './motion.ts'
// the title: one tall world you pan down through, like the side of an ant farm (docs/ART.md 7.1).
// the street up top holds the logo, the cellar under it holds solo play, the sewers at the bottom hold online.
// everything is drawn on one canvas on the duel's 640-wide stage, buttons are the duel's tickets.
// main.ts owns the game and hands this a TitleState; the typed text lives here until a button reads it
import titlePng from '../../art/title/title.png'
import titleJson from '../../art/title/title.json'
import { canvas, ctx2d, sprite, tinted } from './art.ts'
import { drawText, measure, wrapText, type TextStyle } from './font.ts'
import { drawTicket } from './ticket.ts'
import * as sfx from './sound.ts'
import { LANG_TAB, langTab } from './frame.ts'
import { PAUSE_TAB, pauseTabW, drawPause, openPause, pauseClick, pauseHoverAt, pauseOpen, pauseTab } from './pause.ts'
import { frameGate, stageScale } from './prefs.ts'
import { cursorFor } from './cursor.ts'
import { toggleLang } from './lang.ts'
import { INTRO_FRAMES, IDLE_FRAMES, LOGO_H, LOGO_W, firelight, frameMs, logoFrame } from './logo.ts'

export type TitleBoard = { title: string; rows: string[][]; empty: string }
export type TitleOnline =
  | { signedIn: false; notice: string; guest: (name: string) => void; login: (name: string, pass: string) => void; signup: (name: string, pass: string) => void }
  | {
    signedIn: true; who: string; guest: boolean; status: () => string; notice: string; room: string | null; dailyLabel: string
    logout: () => void; makeRoom: () => void; queue: () => void; daily: () => void; join: (code: string) => void
    keep: (pass: string) => void; cancel: () => void; boards: TitleBoard[]
  }
export type TitleState = {
  diffs: { label: string; text: string; on: boolean; pick: () => void }[]
  dailyLabel: string
  daily: () => void
  random: () => void
  playSeed: (seed: string) => void
  board: TitleBoard
  online: TitleOnline | null // null = no game server, online is off
}

// ---------- the world, in stage units (640 wide) ----------

const W = 640
const H = 360
const ROAD = 331 // the cobbles, under the pavement and curb
const SOIL = 348 // street surface ends, the cross-section starts
const CELLAR = 410 // beam top
const CELLAR_WALL = 422
const CELLAR_FLOOR = 736
const STONE = 748
const SEWER = 812
const WATER = 1128
const WORLD_H = 1180
const SNAPS = [0, 404, WORLD_H - H] // street, cellar, sewers
const LOGO = { x: (W - LOGO_W) / 2, y: 2 }
// street lights, matching art/title/street.py
const LAMP = { x: 140, y: 210 } // the lantern
const CAROTTE = { x: 497, y: 224 } // top middle
const HOTEL = { x: 622, y: 92 } // the blade sign's top left
const DOOR = 320 // the casino's door, middle
const CAT = { x: 98, y: 204 } // the cat on a sill
const HATCH_X = 566
const LADDER_X = 600
const BULBS = [200, 440]
const OUTLET = { x: 36, y: 1050 }
const LANTERN = { x: 560, y: 900 } // the sewer's one light, art/title/under.py

const INK = '#2e2320'
const CREAM = '#f6ecd2'
const OUTLINE = '#0e0b0a'
const CHALK = '#e3d2a8'
const KIND = {
  progress: { face: '#c99a3a', plinth: '#3d2a10', label: '#1c1513' },
  secondary: { face: '#43342e', plinth: '#0e0b0a', label: '#e3d2a8' },
  picked: { face: '#8c7656', plinth: '#2a2010', label: CREAM },
}
type Kind = keyof typeof KIND

// ---------- the title atlas (art/title, built by art/title/build.py) ----------

type Part = { img: HTMLImageElement; x: number; y: number; w: number; h: number; px: number; py: number }
const parts = new Map<string, Part>()
let world: HTMLCanvasElement | null = null

function part(name: string): Part {
  const p = parts.get(name)
  if (!p) throw new Error(`no title sprite ${name}`)
  return p
}

// call after loadArt(): the world also uses the duel atlas (chalkboard, plates, tickets)
export async function loadTitle(): Promise<void> {
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => fail(new Error("couldn't load the title atlas"))
    i.src = titlePng
  })
  for (const s of titleJson.meta.slices) {
    const k = s.keys[0]
    parts.set(s.name, { img, ...k.bounds, px: k.pivot.x, py: k.pivot.y })
  }
  world = buildWorld()
}

// ---------- state ----------

let state: TitleState | null = null
let root: HTMLDivElement | null = null
let cv: HTMLCanvasElement
let g: CanvasRenderingContext2D
let inp: HTMLInputElement // the hidden input behind whichever text box has focus
let k = 1 // stage unit -> device px
let ox = 0
let oy = 0
let running = false
let now = 0
let last = 0
let frame = 0 // global logo frame, the intro plays once per page load
let left = 0 // ms until the next logo frame
let shadow: HTMLCanvasElement | null = null
let mouse = { x: -1, y: -1 } // stage units
let cam = 0 // world y at the top of the screen
let camVel = 0
let camTarget = 0
let gestureFrom = 0 // the snap a wheel or drag started from
let lastWheel = 0
let drag: { y: number; cam: number; moved: boolean; vy: number; t: number } | null = null

type Hit = { x: number; y: number; w: number; h: number; act: () => void; field?: boolean }
let hits: Hit[] = []
let hover = '' // key of the hovered element
const juice = new Map<string, number>()
let pressed: { key: string; t: number } | null = null

type FieldId = 'seed' | 'name' | 'pass' | 'code' | 'keep'
const fields: Record<FieldId, { value: string; hint: string; max: number; password?: boolean; upper?: boolean }> = {
  seed: { value: '', hint: 'or type a seed', max: 20, upper: true },
  name: { value: '', hint: 'name', max: 20 },
  pass: { value: '', hint: 'password', max: 64, password: true },
  code: { value: '', hint: 'room code', max: 5, upper: true },
  keep: { value: '', hint: 'password', max: 64, password: true },
}
let focused: FieldId | null = null
let onEnter: Partial<Record<FieldId, () => void>> = {}
let fieldRects: Partial<Record<FieldId, { x: number; y: number; w: number; h: number }>> = {}

// mounts the title (or keeps it if it's already up, so re-rendering doesn't restart the logo or the camera)
export function showTitle(app: HTMLElement, next: TitleState): void {
  state = next
  if (!root || !root.isConnected) {
    app.innerHTML = ''
    root = document.createElement('div')
    cv = document.createElement('canvas')
    cv.className = 'stage'
    cv.style.touchAction = 'none' // a touch drag pans the camera, the browser mustn't take it
    g = ctx2d(cv)
    inp = document.createElement('input')
    inp.className = 'titleinput'
    inp.autocomplete = 'off'
    inp.spellcheck = false
    inp.addEventListener('input', () => {
      if (!focused) return
      const f = fields[focused]
      f.value = (f.upper ? inp.value.toUpperCase() : inp.value).slice(0, f.max)
    })
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && focused) {
        const enter = onEnter[focused]
        inp.blur()
        enter?.()
      }
      if (e.key === 'Escape') inp.blur()
    })
    inp.addEventListener('blur', () => { focused = null })
    root.append(cv, inp)
    app.appendChild(root)
    bindPointer()
    layout()
  }
  if (!running) {
    running = true
    last = performance.now()
    if (frame === 0) left = frameMs(0)
    requestAnimationFrame(tick)
  }
}

// the logo intro: a reel clack every 5 frames while they lock (the same beats as firelight in logo.ts), then the word catches
function introSound(f: number): void {
  if (f >= 15 && f < 55 && (f - 10) % 5 === 0) sfx.digitLock((f - 15) / 5, false)
  if (f === 58) sfx.strike()
}

// jump the camera to a layer: 0 street, 1 cellar, 2 sewers
export function panTo(layer: number): void {
  camTarget = SNAPS[layer]
  gestureFrom = layer
}

function layout(): void {
  if (!root?.isConnected) return
  const dpr = window.devicePixelRatio || 1
  cv.width = Math.round(innerWidth * dpr)
  cv.height = Math.round(innerHeight * dpr)
  k = stageScale(cv.width, cv.height, W, H)
  ox = Math.round((cv.width - W * k) / 2)
  oy = Math.round((cv.height - H * k) / 2)
  g.imageSmoothingEnabled = false
}

window.addEventListener('resize', () => layout())

const live = () => !!root?.isConnected

// any click or key skips the intro. the click still reaches whatever it was on
function skip(): void {
  if (root?.isConnected && frame < INTRO_FRAMES) {
    frame = INTRO_FRAMES
    left = frameMs(frame)
  }
}
window.addEventListener('pointerdown', skip, true)
window.addEventListener('keydown', skip, true)

window.addEventListener('keydown', e => {
  if (!live() || document.activeElement === inp) return
  const at = nearestSnap(camTarget)
  let to = -1
  if (e.key === 'ArrowDown' || e.key === 'PageDown') to = Math.min(SNAPS.length - 1, at + 1)
  else if (e.key === 'ArrowUp' || e.key === 'PageUp') to = Math.max(0, at - 1)
  else if (e.key === 'Home') to = 0
  else if (e.key === 'End') to = SNAPS.length - 1
  if (to < 0) return
  e.preventDefault()
  panTo(to)
})

// ---------- camera input: wheel, drag (touch or mouse), snapping ----------

const maxCam = WORLD_H - H
const clampCam = (y: number) => Math.max(0, Math.min(maxCam, y))

function nearestSnap(y: number): number {
  let best = 0
  for (let i = 1; i < SNAPS.length; i++) if (Math.abs(SNAPS[i] - y) < Math.abs(SNAPS[best] - y)) best = i
  return best
}

// a gesture ended: back to where it started if it barely moved, else the nearest layer the way it went
function settle(): void {
  const from = SNAPS[gestureFrom]
  const moved = camTarget - from
  if (Math.abs(moved) < 30) return panTo(gestureFrom)
  let best = -1
  SNAPS.forEach((s, i) => {
    if (moved > 0 ? s <= from : s >= from) return
    if (best < 0 || Math.abs(s - camTarget) < Math.abs(SNAPS[best] - camTarget)) best = i
  })
  panTo(best < 0 ? gestureFrom : best)
}

function toStage(e: { clientX: number; clientY: number }): { x: number; y: number } {
  const dpr = window.devicePixelRatio || 1
  return { x: (e.clientX * dpr - ox) / k, y: (e.clientY * dpr - oy) / k }
}

function bindPointer(): void {
  cv.addEventListener('wheel', e => {
    e.preventDefault()
    if (pauseOpen()) return
    if (!lastWheel) gestureFrom = nearestSnap(camTarget)
    camTarget = clampCam(camTarget + e.deltaY * (e.deltaMode === 1 ? 16 : 1) * 0.6)
    lastWheel = now
  }, { passive: false })
  cv.addEventListener('pointermove', e => {
    mouse = toStage(e)
    if (!drag) return
    const dy = (e.clientY - drag.y) * (window.devicePixelRatio || 1) / k
    if (!drag.moved && Math.abs(dy) > 6) drag.moved = true
    if (drag.moved) {
      const target = clampCam(drag.cam - dy)
      drag.vy = (target - camTarget) / Math.max(1, now - drag.t)
      drag.t = now
      camTarget = target
    }
  })
  cv.addEventListener('pointerleave', () => { mouse = { x: -1, y: -1 } })
  cv.addEventListener('pointerdown', e => {
    mouse = toStage(e)
    if (pauseOpen()) return
    drag = { y: e.clientY, cam: camTarget, moved: false, vy: 0, t: now }
    gestureFrom = nearestSnap(camTarget)
    cv.setPointerCapture(e.pointerId)
  })
  cv.addEventListener('pointerup', e => {
    const d = drag
    drag = null
    if (d?.moved) return settle()
    click(toStage(e))
  })
  cv.addEventListener('pointercancel', () => {
    if (drag?.moved) settle()
    drag = null
  })
}

function click(p: { x: number; y: number }): void {
  if (pauseOpen()) {
    const mark = sfx.played()
    const on = pauseHoverAt(p) !== null
    pauseClick(p)
    if (on) sfx.quietSince(mark)
    return
  }
  const wy = p.y + Math.round(cam)
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]
    if (p.x >= h.x && p.x <= h.x + h.w && wy >= h.y && wy <= h.y + h.h) {
      const mark = sfx.played()
      h.act()
      return sfx.quietSince(mark)
    }
  }
  inp.blur()
}

// ---------- the loop ----------

const gate = frameGate()

function tick(t: number): void {
  if (!root?.isConnected || !state) {
    running = false
    return
  }
  const dt = Math.min(0.05, (t - now) / 1000 || 0)
  now = t
  // capped so a hidden tab doesn't fast-forward through the intro when it comes back
  left -= Math.min(100, t - last)
  last = t
  while (left <= 0) {
    frame++
    introSound(frame)
    if (frame >= INTRO_FRAMES + IDLE_FRAMES) frame = INTRO_FRAMES
    left += frameMs(frame)
  }
  if (lastWheel && now - lastWheel > 160) {
    lastWheel = 0
    settle()
  }
  // the duel's spring, a bit more damped for a camera
  const stiff = 170
  const damp = 2 * Math.sqrt(stiff) * 0.9
  camVel += (stiff * (camTarget - cam) - damp * camVel) * dt
  cam += camVel * dt
  requestAnimationFrame(tick)
  if (!gate(t)) return
  // under the pause menu the street doesn't see the mouse
  const real = mouse
  if (pauseOpen()) mouse = { x: -1, y: -1 }
  draw(t / 1000, state)
  mouse = real
  drawPause(g, mouse)
  if (pauseOpen()) cv.style.cursor = cursorFor(pauseHoverAt(mouse) ? 'pointer' : 'default')
}

function draw(t: number, st: TitleState): void {
  hits = []
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = OUTLINE
  g.fillRect(0, 0, cv.width, cv.height)
  g.setTransform(k, 0, 0, k, ox, oy)
  g.imageSmoothingEnabled = false
  g.save()
  g.beginPath()
  g.rect(0, 0, W, H)
  g.clip()
  const cy = Math.round(cam)
  g.drawImage(world!, 0, cy, W, H, 0, 0, W, H)
  g.translate(0, -cy)
  const shows = (top: number, bottom: number) => bottom > cy && top < cy + H
  if (shows(0, SOIL + 60)) street(t)
  if (shows(SOIL, SEWER)) cellar(t, st)
  if (shows(STONE, WORLD_H)) sewers(t, st)
  g.restore()
  // hover is resolved after the frame's hits exist, and drives next frame's look
  const wy = mouse.y + cy
  let over: Hit | undefined
  for (let i = hits.length - 1; i >= 0 && !over; i--) {
    const h = hits[i]
    if (mouse.x >= h.x && mouse.x <= h.x + h.w && wy >= h.y && wy <= h.y + h.h) over = h
  }
  cv.style.cursor = cursorFor(drag?.moved ? 'grabbing' : over ? (over.field ? 'text' : 'pointer') : 'default')
  if (focused) placeInput()
}

// ---------- the static world, drawn once ----------

function buildWorld(): HTMLCanvasElement {
  const c = canvas(W, WORLD_H)
  const w = ctx2d(c)
  const pin = (name: string, x: number, y: number, flip = false) => {
    const p = part(name)
    w.save()
    w.translate(x, y)
    if (flip) w.scale(-1, 1)
    w.drawImage(p.img, p.x, p.y, p.w, p.h, -p.px, -p.py, p.w, p.h)
    w.restore()
  }
  // street: sky and far roofs, then the buildings, pavement and cobbles (art/title/street.py)
  pin('street/back', 0, 0)
  pin('street/front', 0, 0)

  // under it: the cut through the road, the cellar, the stone and the sewer (art/title/under.py)
  pin('under', 0, SOIL)
  return c
}

// ---------- draw helpers (world units, inside the camera transform) ----------

function text(s: string, x: number, y: number, o: TextStyle & { alpha?: number } = {}): void {
  if (o.alpha === undefined) return drawText(g, s, x, y, o)
  g.save()
  g.globalAlpha = Math.max(0, o.alpha)
  drawText(g, s, x, y, o)
  g.restore()
}

function glow(x: number, y: number, r: number, color: string): void {
  const grad = g.createRadialGradient(x, y, 0, x, y, r)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.save()
  g.globalCompositeOperation = 'screen'
  g.fillStyle = grad
  g.fillRect(x - r, y - r, r * 2, r * 2)
  g.restore()
}

// darkens a band toward its edges so the layer reads as lit from the middle
function vignette(top: number, bottom: number, cx: number, cy: number, r: number, alpha: number): void {
  const grad = g.createRadialGradient(cx, cy, r * 0.25, cx, cy, r)
  grad.addColorStop(0, 'rgba(14,11,10,0)')
  grad.addColorStop(1, `rgba(14,11,10,${alpha})`)
  g.fillStyle = grad
  g.fillRect(0, top, W, bottom - top)
}

// the duel's 9-slice, copied: corners stay native, edges and middle stretch, tint multiplies a greyscale sprite
function nine(name: string, x: number, y: number, w: number, h: number, tint?: string): void {
  const s = sprite(name)
  const img = tint ? tinted(name, tint) : s.img
  const sx0 = tint ? 0 : s.x
  const sy0 = tint ? 0 : s.y
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
      g.drawImage(img, sx0 + sx[c], sy0 + sy[r], sw, sh, x + dx[c], y + dy[r], tw, th)
    }
  }
}

function pinPart(name: string, x: number, y: number, r = 0): void {
  const p = part(name)
  g.save()
  g.translate(x, y)
  if (r) g.rotate(r)
  g.drawImage(p.img, p.x, p.y, p.w, p.h, -p.px, -p.py, p.w, p.h)
  g.restore()
}

// a chalk chevron pointing down (or up), cream on a 1px ink outline
function chevron(x: number, y: number, down: boolean): void {
  for (const [col, grow] of [[OUTLINE, 1], [CHALK, 0]] as const) {
    g.fillStyle = col
    for (let i = 0; i < 4; i++) {
      const w = (4 - i) * 2 - 1 + grow * 2
      const yy = down ? y + i : y + 3 - i
      g.fillRect(x - Math.floor(w / 2), yy - grow, w, 1 + grow * 2)
    }
  }
}

function hit(key: string, x: number, y: number, w: number, h: number, act: () => void, field = false): boolean {
  hits.push({ x, y, w, h, act, field })
  const wy = mouse.y + Math.round(cam)
  const over = !drag?.moved && mouse.x >= x && mouse.x <= x + w && wy >= y && wy <= y + h
  if (over && hover !== key) {
    hover = key
    juice.set(key, now)
    sfx.hover(key)
  } else if (!over && hover === key) {
    hover = ''
    sfx.hover(null)
  }
  return over
}

// the duel's juiceUp: a quick scale and wobble that settles in ~0.3 s
function juiced(key: string): { s: number; r: number } {
  return juiceAt(juice,key,now)
}

const breath = () => 0.5 - 0.5 * Math.cos((now / 1200) * Math.PI * 2)
const ticketW = (label: string) => Math.max(96, measure(label, 'chalk', true) + 24)

// a raffle ticket like the duel's (docs/READABILITY.md §5): plinth, face lifted by its gap, chalk label
function ticket(key: string, label: string, x: number, y: number, w: number, kind: Kind, act: () => void,
  o: { primary?: boolean; enabled?: boolean } = {}): void {
  const enabled = o.enabled ?? true
  const over = enabled && hit(key, x, y - 4, w, 31, () => {
    pressed = { key, t: now }
    sfx.stamp()
    inp.blur()
    act()
  })
  const c = KIND[kind]
  const down = pressed?.key === key && now - pressed.t < 90
  const gap = down ? 0 : kind === 'picked' ? 1 : over ? 4 : 3
  const j = juiced(key)
  const pulse = enabled && o.primary && !over ? 1 + 0.03 * breath() : 1
  g.save()
  g.translate(x + w / 2, y + 13)
  g.scale(j.s * pulse, j.s * pulse)
  g.rotate(j.r * 0.35)
  g.translate(-w / 2, -13)
  if (enabled && o.primary) glow(w / 2, 14, 74, `rgba(232,194,96,${0.22 + 0.16 * breath()})`)
  drawTicket(g, 0, 0, w, { label, face: c.face, plinth: c.plinth, ink: c.label, enabled, over, gap, shine: o.primary }, now)
  g.restore()
}

// a paper text box backed by the hidden input: the bitmap font, a blinking caret, stars for a password
function field(id: FieldId, x: number, y: number, w: number, enter: () => void): void {
  const f = fields[id]
  onEnter[id] = enter
  fieldRects[id] = { x, y, w, h: 22 }
  const over = hit(`field:${id}`, x, y, w, 22, () => focusField(id), true)
  const on = focused === id
  if (over || on) {
    g.fillStyle = CREAM
    g.fillRect(x - 1, y - 1, w + 2, 24)
  }
  nine('hud/plate/paper', x, y, w, 22)
  g.strokeStyle = on ? '#9c7028' : INK
  g.lineWidth = 1
  g.strokeRect(x + 0.5, y + 0.5, w - 1, 21)
  let shown = f.password ? '*'.repeat(f.value.length) : f.value
  const room = w - 14
  while (shown && measure(shown, 'sans') > room) shown = shown.slice(1) // long text scrolls: keep the end
  if (shown) text(shown, x + 7, y + 5, { font: 'sans', color: INK })
  else if (!on) text(f.hint, x + 7, y + 5, { font: 'sans', color: '#8c7656' })
  if (on && Math.floor(now / 530) % 2 === 0) {
    g.fillStyle = INK
    g.fillRect(x + 7 + (shown ? measure(shown, 'sans') + 1 : 0), y + 5, 1, 12)
  }
}

function focusField(id: FieldId): void {
  const f = fields[id]
  focused = id
  inp.type = f.password ? 'password' : 'text'
  inp.maxLength = f.max
  inp.autocapitalize = f.upper ? 'characters' : 'off'
  inp.value = f.value
  placeInput()
  inp.focus()
  inp.setSelectionRange(f.value.length, f.value.length)
}

// the hidden input sits over its box, so a phone scrolls the right spot into view and the keyboard opens there
function placeInput(): void {
  const r = focused && fieldRects[focused]
  if (!r) return
  const dpr = window.devicePixelRatio || 1
  inp.style.left = `${(ox + r.x * k) / dpr}px`
  inp.style.top = `${(oy + (r.y - Math.round(cam)) * k) / dpr}px`
  inp.style.width = `${(r.w * k) / dpr}px`
  inp.style.height = `${(r.h * k) / dpr}px`
}

// a paper table: a title line, then one row per entry. columns are as wide as their widest cell
function board(b: TitleBoard, x: number, y: number, w: number, maxRows: number): void {
  const rows = b.rows.slice(0, maxRows)
  const h = 20 + Math.max(1, rows.length) * 9 + 4
  nine('hud/plate/frame', x - 5, y - 5, w + 10, h + 10)
  nine('hud/plate/paper', x, y, w, h)
  text(b.title, x + 6, y + 4, { font: 'sans', color: INK, bold: true })
  if (!rows.length) {
    text(b.empty, x + 6, y + 19, { font: 'tiny', color: '#8c7656' })
    return
  }
  const cols = rows[0].map((_, c) => Math.max(...rows.map(r => measure(r[c], 'tiny'))))
  rows.forEach((r, i) => {
    let cx = x + 6
    r.forEach((cell, c) => {
      text(cell, cx, y + 19 + i * 9, { font: 'tiny', color: c === 1 ? '#7a1a2c' : INK })
      cx += cols[c] + 10
    })
  })
}

// text over the world, 1px ink outline (docs/READABILITY.md §8). long lines wrap to the stage
function outlined(s: string, x: number, y: number, o: TextStyle = {}): void {
  wrapText(s, 560, 'sans').forEach((line, i) => text(line, x, y + i * 11, { font: 'sans', color: CREAM, ...o, outline: OUTLINE }))
}

// a centered row of tickets and text boxes at world y
type Item = { w: number; draw: (x: number, y: number) => void }
function row(y: number, items: Item[], gap = 10): void {
  const total = items.reduce((sum, i) => sum + i.w, 0) + gap * (items.length - 1)
  let x = Math.round(W / 2 - total / 2)
  for (const i of items) {
    i.draw(x, y)
    x += i.w + gap
  }
}

const tk = (key: string, label: string, kind: Kind, act: () => void, o: { primary?: boolean; enabled?: boolean } = {}): Item =>
  ({ w: ticketW(label), draw: (x, y) => ticket(key, label, x, y, ticketW(label), kind, act, o) })

// text boxes sit 2 px lower than a ticket's face so their middles line up
const box = (id: FieldId, w: number, enter: () => void): Item => ({ w, draw: (x, y) => field(id, x, y + 2, w, enter) })

// ---------- the street ----------

function street(t: number): void {
  // rain behind everything in front of the buildings: thin diagonal streaks
  g.fillStyle = 'rgba(62,102,160,0.55)'
  for (let i = 0; i < 150; i++) {
    const h1 = (i * 7919) % 997 / 997
    const h2 = (i * 104729) % 991 / 991
    const speed = 300 + h2 * 140
    const y = ((t * speed + h1 * 600) % 420) - 40
    if (y > SOIL - 4) continue
    const x = ((h2 * 997 + i * 13) % 700) - 30 - y * 0.2
    for (let s = 0; s < 4; s++) g.fillRect(Math.round(x - s * 0.5), Math.round(y + s * 2), 1, 2)
  }
  // splashes on the cobbles
  g.fillStyle = 'rgba(127,160,220,0.7)'
  for (let i = 0; i < 16; i++) {
    const period = 0.5 + (i % 5) * 0.11
    const cycle = Math.floor(t / period + i * 0.37)
    const a = (t / period + i * 0.37) - cycle
    if (a > 0.3) continue
    const x = ((cycle * 7919 + i * 131) % 620) + 10
    const y = ROAD + 2 + ((cycle * 31 + i * 17) % 14)
    const r = 1 + Math.floor(a * 8)
    g.fillRect(x - r, y, 1, 1)
    g.fillRect(x + r, y, 1, 1)
    if (a < 0.1) g.fillRect(x, y - 1, 1, 1)
  }

  // lights: the lamp, the carotte, the door, the shop windows, and their streaks on the wet road
  const flick = 0.92 + 0.08 * Math.sin(t * 13) * Math.sin(t * 7.3)
  glow(LAMP.x, LAMP.y, 50, `rgba(255,224,138,${0.34 * flick})`)
  glow(LAMP.x, LAMP.y, 10, `rgba(255,251,232,${0.5 * flick})`)
  glow(CAROTTE.x, CAROTTE.y + 17, 30, `rgba(208,74,78,${0.3 + 0.08 * Math.sin(t * 2)})`)
  glow(DOOR, 290, 64, 'rgba(255,176,58,0.18)')
  glow(542, 292, 56, 'rgba(255,176,58,0.14)')
  glow(60, 296, 56, 'rgba(255,176,58,0.12)')
  reflection(LAMP.x, 'rgba(255,224,138,', 8, t)
  reflection(DOOR, 'rgba(255,176,58,', 24, t)
  reflection(CAROTTE.x, 'rgba(208,74,78,', 8, t)
  reflection(542, 'rgba(255,176,58,', 40, t)
  reflection(60, 'rgba(255,176,58,', 40, t)
  windows(t)
  smoke(t)
  catTail(t)

  // FR · EN, top right of the street
  langTab(g, hit('lang', W - LANG_TAB.w - 6, 0, LANG_TAB.w, LANG_TAB.h, toggleLang), W - LANG_TAB.w - 6)
  // the settings, beside it
  const sw = pauseTabW('Settings')
  const sx = W - LANG_TAB.w - sw - 12
  pauseTab(g, hit('settings', sx, 0, sw, PAUSE_TAB.h, openPause), sx, 'Settings')
  signs(t)

  // the logo burns on the casino's roof, and lights the wall behind it
  const light = firelight(frame)
  if (light > 0) glow(W / 2, LOGO.y + 112, 250, `rgba(255,150,40,${0.3 * light})`)
  floodlights()
  const logo = logoFrame(frame)
  const s = shadow ??= canvas(LOGO_W, LOGO_H)
  const sg = ctx2d(s)
  sg.globalCompositeOperation = 'copy'
  sg.drawImage(logo, 0, 0)
  sg.globalCompositeOperation = 'source-in'
  sg.fillStyle = OUTLINE
  sg.fillRect(0, 0, LOGO_W, LOGO_H)
  g.globalAlpha = 0.55
  g.drawImage(s, LOGO.x + 3, LOGO.y + 4)
  g.globalAlpha = 1
  g.drawImage(logo, LOGO.x, LOGO.y)

  // the way down: chalk on the cobbles by the drain, which drips into the dirt below
  const bob = Math.round(Math.sin(t * 3) * 1.5)
  const label = 'JOUER'
  const lw = measure(label, 'chalk', true)
  const over = hit('cue:street', W / 2 - lw / 2 - 26, ROAD - 2, lw + 52, 20, () => panTo(1))
  text(label, W / 2, ROAD, { font: 'chalk', color: over ? CREAM : CHALK, align: 'center', bold: true, outline: OUTLINE })
  chevron(W / 2 - lw / 2 - 12, ROAD + 3 + bob, true)
  chevron(W / 2 + lw / 2 + 12, ROAD + 3 + bob, true)
  // the lid drips into the dirt below
  g.fillStyle = '#3e66a0'
  for (let i = 0; i < 4; i++) {
    const a = ((t * 0.8 + i * 0.27) % 1)
    const x = W / 2 - 9 + i * 6
    g.fillRect(x, SOIL - 1 + Math.round(a * a * (CELLAR - SOIL)), 1, 2)
  }
}

// a light's streaky reflection on the wet road under it
function reflection(x: number, rgba: string, w: number, t: number): void {
  for (let y = ROAD + 2; y < SOIL - 1; y += 2) {
    const d = (y - ROAD) / (SOIL - ROAD)
    const wob = Math.round(Math.sin(t * 4 + y * 0.9) * 2)
    const ww = Math.max(2, Math.round(w * (1 - d * 0.5) + Math.sin(t * 3 + y) * 2))
    g.fillStyle = `${rgba}${(0.35 * (1 - d)).toFixed(3)})`
    g.fillRect(Math.round(x - ww / 2 + wob), y, ww, 1)
  }
}

// the shop and casino signs: lettering on their boards, the marquee's bulb chase (one bulb's dead), the hotel's neon
function signs(t: number): void {
  text('CAFÉ', 58, 260, { font: 'chalk', color: '#e8c260', align: 'center', bold: true })
  text('TABAC', 560, 250, { font: 'chalk', color: '#fff0b0', align: 'center', bold: true })
  glow(DOOR, 236, 40, 'rgba(232,194,96,0.16)')
  text('CASINO', DOOR, 231, { font: 'chalk', color: '#e8c260', align: 'center', bold: true })
  const step = Math.floor(t * 6)
  const bulb = (x: number, y: number, i: number, dead = false) => {
    const on = !dead && (i + step) % 3 !== 0
    g.fillStyle = on ? '#fffbe8' : '#6b4a1a'
    g.fillRect(x, y, 1, 1)
    if (on) {
      g.fillStyle = 'rgba(255,224,138,0.35)'
      g.fillRect(x - 1, y, 3, 1)
      g.fillRect(x, y - 1, 1, 3)
    }
  }
  for (let i = 0; i < 17; i++) {
    bulb(DOOR - 32 + i * 4, 227, i, i === 11)
    bulb(DOOR + 32 - i * 4, 245, i + 17)
  }
  for (let i = 0; i < 23; i++) bulb(DOOR - 44 + i * 4, 275, i)
  // HÔTEL down the blade sign in red neon. the E stutters now and then
  const sputter = Math.sin(t * 0.7) > 0.8 && Math.sin(t * 31) > 0
  ;['H', 'Ô', 'T', 'E', 'L'].forEach((ch, i) => {
    const off = ch === 'E' && sputter
    const y = HOTEL.y + 8 + i * 15
    if (!off) glow(HOTEL.x + 7, y + 5, 12, 'rgba(208,74,78,0.35)')
    text(ch, HOTEL.x + 7, y, { font: 'chalk', color: off ? '#4e1020' : '#ffb03a', align: 'center', bold: true, outline: off ? undefined : '#a82a38' })
  })
}

// the floodlights on the casino's parapet throw faint beams up the sign's rig
function floodlights(): void {
  for (const x of [196, 284, 356, 444]) {
    const grad = g.createLinearGradient(0, 186, 0, 90)
    grad.addColorStop(0, 'rgba(255,224,138,0.16)')
    grad.addColorStop(1, 'rgba(255,224,138,0)')
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(x - 2, 186)
    g.lineTo(x + 3, 186)
    g.lineTo(x + 18, 90)
    g.lineTo(x - 17, 90)
    g.fill()
  }
}

// life in the windows: a tv flickering, a light that goes off and on again
function windows(t: number): void {
  const tv = 0.18 + 0.12 * Math.sin(t * 9) * Math.sin(t * 2.3) + (Math.sin(t * 23) > 0.7 ? 0.1 : 0)
  g.fillStyle = `rgba(62,102,160,${tv})`
  g.fillRect(50, 142, 12, 24)
  g.fillRect(596, 162, 12, 24)
  // someone's up late on the café block's top floor: the light goes out for a while every 14 s
  if ((t % 14) > 9) {
    g.fillStyle = 'rgba(14,11,10,0.82)'
    g.fillRect(138, 104, 12, 22)
  }
}

// chimney smoke drifting off to the right
function smoke(t: number): void {
  for (const [x, y, seed] of [[34, 36, 0], [574, 14, 3], [122, 42, 7]] as const) {
    for (let i = 0; i < 7; i++) {
      const a = (t * 0.09 + i / 7 + seed * 0.13) % 1
      const r = 3 + a * 9
      g.fillStyle = `rgba(140,118,86,${0.16 * (1 - a)})`
      g.beginPath()
      g.arc(x + a * 34 + Math.sin(t + i) * 2, y - a * 30, r, 0, Math.PI * 2)
      g.fill()
    }
  }
}

// the cat's tail hangs off the sill and swishes
function catTail(t: number): void {
  const swish = Math.sin(t * 1.6) * (Math.sin(t * 0.4) > 0 ? 1 : 0.3)
  g.fillStyle = OUTLINE
  for (let i = 0; i < 9; i++) {
    const x = CAT.x + 8 + Math.round(swish * (i / 8) * (i / 8) * 4)
    g.fillRect(x, CAT.y + i - 1, 1, 1)
  }
}

// ---------- the cellar: solo play ----------

function cellar(t: number, st: TitleState): void {
  // two bare bulbs on swaying cords, the room dark toward its corners
  vignette(CELLAR_WALL, CELLAR_FLOOR, W / 2, 560, 380, 0.4)
  BULBS.forEach((x, i) => {
    const sway = Math.sin(t * 0.9 + i * 2) * 0.05
    const len = 24
    const bx = x + Math.sin(sway) * len
    const by = CELLAR_WALL + Math.cos(sway) * len
    g.strokeStyle = '#0e0b0a'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(x + 0.5, CELLAR_WALL)
    g.lineTo(bx + 0.5, by)
    g.stroke()
    pinPart('cellar/bulb', Math.round(bx), Math.round(by))
    const f = 0.9 + 0.1 * Math.sin(t * 17 + i * 5) * Math.sin(t * 5.1)
    glow(bx, by + 8, 150, `rgba(255,190,110,${0.2 * f})`)
    glow(bx, by + 8, 14, `rgba(255,240,200,${0.5 * f})`)
  })

  // the candle stuck on the barrels
  const c = 0.8 + 0.2 * Math.sin(t * 11) * Math.sin(t * 4.3)
  glow(131, 654, 26, `rgba(255,176,58,${0.3 * c})`)

  // heading on the duel's chalkboard
  const bx = W / 2 - 48
  const by = 430
  const board_ = sprite('room/chalkboard')
  g.drawImage(board_.img, board_.x, board_.y, board_.w, board_.h, bx, by, board_.w, board_.h)
  text('EN SOLO', W / 2, by + 16, { font: 'chalk', color: CHALK, align: 'center', bold: true })
  text('1 RIVAL · 12 MANCHES', W / 2, by + 36, { font: 'tiny', color: '#bfa77e', align: 'center' })

  // difficulty: the picked one sits pressed in, tan
  const diffs = st.diffs.map((d, i) => tk(`diff${i}`, d.label, d.on ? 'picked' : 'secondary', d.pick))
  row(504, diffs)
  const picked = st.diffs.find(d => d.on)
  if (picked) outlined(picked.text, W / 2, 537, { align: 'center' })

  row(556, [
    tk('daily', st.dailyLabel, 'progress', st.daily, { primary: true }),
    tk('random', 'Random seed', 'secondary', st.random),
  ])
  const play = () => {
    const s = fields.seed.value.trim()
    if (s) st.playSeed(s)
  }
  const playT = tk('playseed', 'Play seed', 'secondary', play, { enabled: fields.seed.value.trim() !== '' })
  row(592, [box('seed', 170, play), playT])

  board(st.board, W / 2 - 150, 634, 300, 8)

  // the way down to online: chalk on the wall over the hatch
  const over = hit('cue:cellar', HATCH_X - 6, 694, 84, 40, () => panTo(2))
  text('EN LIGNE', HATCH_X + 36, 702, { font: 'chalk', color: over ? CREAM : CHALK, align: 'center', bold: true, outline: OUTLINE })
  chevron(HATCH_X + 36, 718 + Math.round(Math.sin(t * 3) * 1.5), true)
}

// ---------- the sewers: online ----------

function sewers(t: number, st: TitleState): void {
  // water: a moving shimmer on the channel, the outlet's stream, drips and a little steam
  g.fillStyle = 'rgba(74,154,116,0.45)'
  for (let i = 0; i < 26; i++) {
    const y = WATER + 3 + (i * 7) % 44
    const x = ((i * 97 + t * (14 + (i % 4) * 5)) % 700) - 30
    g.fillRect(Math.round(x), y, 6 + (i % 3) * 4, 1)
  }
  for (let y = OUTLET.y + 14; y < WATER; y++) {
    const fall = (y - OUTLET.y - 14) / (WATER - OUTLET.y - 14)
    const x = OUTLET.x + 4 + Math.round(fall * fall * 10)
    g.fillStyle = (y + Math.floor(t * 30)) % 4 === 0 ? '#4a9a74' : '#2d7a5c'
    g.fillRect(x, y, 3, 1)
  }
  glow(OUTLET.x + 16, WATER, 14, 'rgba(74,154,116,0.35)')
  g.fillStyle = '#4a9a74'
  for (const [x, ph] of [[180, 0], [420, 0.4], [520, 0.75]] as const) {
    const a = (t * 0.6 + ph) % 1
    g.fillRect(x, SEWER + 44 + Math.round(a * a * (WATER - SEWER - 44)), 1, 2)
  }
  for (let i = 0; i < 6; i++) {
    const a = (t * 0.12 + i / 6) % 1
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 18)
    grad.addColorStop(0, `rgba(184,240,160,${0.07 * Math.sin(a * Math.PI)})`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.save()
    g.translate(80 + i * 96 + Math.sin(t + i) * 6, WATER - a * 60)
    g.fillStyle = grad
    g.fillRect(-18, -18, 36, 36)
    g.restore()
  }
  vignette(SEWER, WORLD_H, W / 2, 980, 400, 0.4)
  // the lantern on its hook and the candle in a bottle on the crate
  const fl = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 3.7)
  glow(LANTERN.x, LANTERN.y, 70, `rgba(255,176,58,${0.22 * fl})`)
  glow(LANTERN.x, LANTERN.y, 10, `rgba(255,251,232,${0.4 * fl})`)
  glow(91, 1082, 20, `rgba(255,176,58,${0.3 * fl})`)
  glow(W / 2, 960, 260, 'rgba(111,207,111,0.06)')

  text('RUE DU FLAMBEUR', 62, 846, { font: 'tiny', color: CREAM, align: 'center' }) // on the enamel plaque
  text('EN LIGNE', W / 2, 826, { font: 'didone', color: CREAM, align: 'center', outline: OUTLINE })
  // back up to the street
  const up = hit('cue:sewer', LADDER_X - 50, SEWER + 6, 76, 24, () => panTo(0))
  text('LA RUE', LADDER_X - 12, SEWER + 10, { font: 'chalk', color: up ? CREAM : CHALK, align: 'right', bold: true, outline: OUTLINE })
  chevron(LADDER_X - 6 + 4, SEWER + 13 + Math.round(Math.sin(t * 3) * 1.5), false)

  const on = st.online
  if (!on) {
    outlined('No game server right now, so online play is off.', W / 2, 870, { align: 'center' })
    return
  }
  if (!on.signedIn) {
    if (on.notice) outlined(on.notice, W / 2, 852, { align: 'center', color: '#e8c260' })
    const guest = () => on.guest(fields.name.value.trim())
    const login = () => on.login(fields.name.value.trim(), fields.pass.value)
    row(872, [box('name', 150, guest), box('pass', 150, login)])
    row(908, [
      tk('guest', 'Play as guest', 'progress', guest),
      tk('login', 'Log in', 'secondary', login),
      tk('signup', 'Sign up', 'secondary', () => on.signup(fields.name.value.trim(), fields.pass.value)),
    ])
    outlined('Guest needs no password. Sign up later to keep the name.', W / 2, 944, { align: 'center', color: '#bfa77e' })
    return
  }

  const who = `${on.who}${on.guest ? ' (guest)' : ''} · ${on.status()}`
  const ww = measure(who, 'sans')
  const lx = Math.round(W / 2 - (ww + 10 + 96) / 2)
  outlined(who, lx, 853)
  ticket('logout', 'Log out', lx + ww + 10, 846, 96, 'secondary', on.logout)
  if (on.notice) outlined(on.notice, W / 2, 876, { align: 'center', color: '#e8c260' })
  row(892, [
    tk('room', 'Play a friend', 'progress', on.makeRoom),
    tk('queue', 'Quick match', 'secondary', on.queue),
    tk('odaily', on.dailyLabel, 'progress', on.daily),
  ])
  const join = () => {
    if (fields.code.value.trim()) on.join(fields.code.value.trim())
  }
  const keep = () => on.keep(fields.keep.value)
  const items = [box('code', 100, join), tk('join', 'Join room', 'secondary', join, { enabled: fields.code.value.trim() !== '' })]
  if (on.guest) {
    items.push(box('keep', 110, keep))
    items.push(tk('keep', 'Keep this name', 'secondary', keep, { enabled: fields.keep.value !== '' }))
  }
  row(926, items)
  let y = 966
  if (on.room) {
    const link = `${location.origin}/r/${on.room}`
    outlined(`Room ${on.room} · send your friend this link: ${link}`, W / 2, y, { align: 'center', color: '#e8c260' })
    row(y + 14, [
      tk('copy', 'Copy link', 'secondary', () => void navigator.clipboard?.writeText(link)),
      tk('cancel', 'Cancel', 'secondary', on.cancel),
    ])
    y += 50
  }
  const bw = 262
  on.boards.forEach((b, i) => board(b, W / 2 - bw - 8 + i * (bw + 16), y + 6, bw, on.room ? 6 : 10))
}
