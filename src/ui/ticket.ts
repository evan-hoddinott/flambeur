// the raffle ticket every button is (docs/READABILITY.md §5), one renderer for the duel, panels, shop and title.
// the art is pieces from art/tickets (python art/tickets/build.py): a stub, a body tile, an end. they're drawn in 5
// grey levels and each level maps onto the ink's palette ramp, so any face color gets real light and shade
import { canvas, ctx2d, nineSlice, sprite } from './art.ts'
import { drawText, measure, wrapText } from './font.ts'

export type TicketIcon = 'play' | 'max' | 'min' | 'forge' | 'discard' | 'insert' | 'skip' | 'continue' | 'back'

export type TicketLook = {
  label: string
  price?: string
  icon?: TicketIcon
  face: string
  plinth: string
  ink: string // the label's color
  enabled: boolean
  over: boolean
  gap: number // how far the face floats over its plinth: 3 resting, 4 hovered, 0 pressed
  shine?: boolean // the primary ticket: a glint sweeps across it now and then
}

const H = 24
const CREAM = '#f6ecd2'
const OUTLINE = '#0e0b0a'
const OFF = { face: '#43342e', ink: '#8c7656', price: '#e3d2a8' }

// dark → light, the same lists as art/tickets/build.py
const RAMPS = [
  ['#0e0b0a', '#0f1d33', '#1a3256', '#28497a', '#3e66a0'],
  ['#2a0910', '#4e1020', '#7a1a2c', '#a82a38', '#d04a4e'],
  ['#5a1206', '#a8260a', '#e8501a', '#ff7a24', '#ffb03a', '#ffe08a', '#fffbe8'],
  ['#0f2a20', '#1e4a24', '#3a8040', '#6fcf6f', '#b8f0a0'],
  ['#2a1440', '#4e2a78', '#7a4ab0', '#b088e0'],
  ['#0f2a20', '#174034', '#1f5a46', '#2d7a5c', '#4a9a74', '#b8f0a0'],
  ['#120e08', '#2a2010', '#3d2a10', '#6b4a1a', '#9c7028', '#c99a3a', '#e8c260', '#fff0b0'],
  ['#1c1513', '#2e2320', '#43342e', '#5c4a36', '#8c7656', '#bfa77e', '#e3d2a8', '#f6ecd2'],
]

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

// the chain stops behind the label, so the guilloche runs only in the open space between label and price
function clearUnder(g: CanvasRenderingContext2D, ink: string, x: number, y: number, w: number): void {
  const { ramp, i } = onRamp(ink)
  g.fillStyle = ramp[i]
  g.fillRect(x - 3, y + 7, w + 6, 10)
}

// a face that's on no ramp (an old hand-picked color) takes the nearest palette color that is
function onRamp(face: string): { ramp: string[]; i: number } {
  let best = { ramp: RAMPS[0], i: 0, d: Infinity }
  const [r, g, b] = rgb(face)
  for (const ramp of RAMPS)
    ramp.forEach((c, i) => {
      const [cr, cg, cb] = rgb(c)
      const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
      if (d < best.d) best = { ramp, i, d }
    })
  return best
}

// grey level → color. past the ramp's top the glint is cream and the light step stays the face
function levels(face: string): Map<number, number[]> {
  const { ramp, i } = onRamp(face)
  const at = (k: number) => ramp[Math.max(0, Math.min(ramp.length - 1, i + k))]
  const glint = ramp[i + 2] ?? ramp[i + 1] ?? CREAM
  return new Map([[48, at(-2)], [104, at(-1)], [160, ramp[i]], [208, at(1)], [255, glint]].map(([k, c]) => [k as number, rgb(c as string)]))
}

const faces = new Map<string, HTMLCanvasElement>()

// the greyscale ticket at width w: stub (or the small end), body tiles, the end
function shape(w: number, small: boolean): HTMLCanvasElement {
  const key = `shape|${w}|${small}`
  const hit = faces.get(key)
  if (hit) return hit
  const c = canvas(w, H)
  const g = ctx2d(c)
  const left = sprite(small ? 'ticket/small' : 'ticket/stub')
  const body = sprite('ticket/body')
  const end = sprite('ticket/end')
  g.drawImage(left.img, left.x, left.y, left.w, left.h, 0, 0, left.w, H)
  const stop = w - end.w
  for (let x = left.w; x < stop; x += body.w) {
    const bw = Math.min(body.w, stop - x)
    g.drawImage(body.img, body.x, body.y, bw, body.h, x, 0, bw, H)
  }
  g.drawImage(end.img, end.x, end.y, end.w, end.h, stop, 0, end.w, H)
  faces.set(key, c)
  return c
}

// the face in its ink's ramp
function face(w: number, small: boolean, ink: string): HTMLCanvasElement {
  const key = `face|${w}|${small}|${ink}`
  const hit = faces.get(key)
  if (hit) return hit
  const src = shape(w, small)
  const c = canvas(w, H)
  const g = ctx2d(c)
  g.drawImage(src, 0, 0)
  const map = levels(ink)
  const data = g.getImageData(0, 0, w, H)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue
    const to = map.get(px[i])
    if (!to) throw new Error(`ticket pixel off the grey levels: ${px[i]}`)
    px[i] = to[0]
    px[i + 1] = to[1]
    px[i + 2] = to[2]
  }
  g.putImageData(data, 0, 0)
  faces.set(key, c)
  return c
}

// the ticket's outline filled flat: the plinth under it, the cream rim on hover
function solid(w: number, small: boolean, color: string): HTMLCanvasElement {
  const key = `solid|${w}|${small}|${color}`
  const hit = faces.get(key)
  if (hit) return hit
  const c = canvas(w, H)
  const g = ctx2d(c)
  g.drawImage(shape(w, small), 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, w, H)
  faces.set(key, c)
  return c
}

function inked(name: string, color: string): HTMLCanvasElement {
  const key = `icon|${name}|${color}`
  const hit = faces.get(key)
  if (hit) return hit
  const s = sprite(name)
  const c = canvas(s.w, s.h)
  const g = ctx2d(c)
  g.drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, s.w, s.h)
  faces.set(key, c)
  return c
}

const light = (hex: string) => {
  const [r, g, b] = rgb(hex)
  return 0.3 * r + 0.59 * g + 0.11 * b > 128
}

// where the label starts: after the stub's icon panel, or the small end
export const labelX = (icon?: TicketIcon) => (icon ? 24 : 13)
const RIGHT = 7 // the chip's gap from the ticket's end, clear of the notch

// at x, y the ticket's top as the old 9-slice tickets had it: the plinth sits 3 down, the face `gap` above it
export function drawTicket(g: CanvasRenderingContext2D, x: number, y: number, w: number, t: TicketLook, now: number): void {
  // the label and the price chip have to fit side by side: the chip drops to the tiny font first, then the icon goes
  const lw = measure(t.label, 'chalk', true)
  const chip = (font: 'sans' | 'tiny') => (t.price ? measure(t.price, font) + 8 + 3 : 0)
  const fits = (icon: TicketIcon | undefined, font: 'sans' | 'tiny') => labelX(icon) + lw + chip(font) + RIGHT <= w
  const iconFits = !!t.icon && w >= 72 && (!t.enabled || fits(t.icon, 'tiny'))
  const icon = iconFits ? t.icon : undefined
  const small = !icon
  const chipFont = fits(icon, 'sans') ? 'sans' : 'tiny'
  const lx = x + labelX(icon)
  if (!t.enabled) {
    g.drawImage(face(w, small, OFF.face), x, y + 3)
    clearUnder(g, OFF.face, lx, y + 3, lw)
    if (icon) g.drawImage(inked('ticket/icon/' + icon, OFF.ink), x + 5, y + 3 + 6)
    drawText(g, t.label, lx, y + 8, { font: 'chalk', color: OFF.ink, bold: true })
    g.fillStyle = OFF.ink
    g.fillRect(lx - 3, y + 13, lw + 6, 1)
    if (t.price) {
      // the reason it's off goes where the price was, dropping to the tiny font when the label leaves no room
      const room = x + w - 9 - (lx + lw + 6)
      if (measure(t.price, 'sans') <= room) drawText(g, t.price, x + w - 9, y + 9, { font: 'sans', color: OFF.price, align: 'right' })
      else wrapText(t.price, room, 'tiny').slice(0, 2).forEach((line, i, all) => drawText(g, line, x + w - 9, y + (all.length > 1 ? 7 : 11) + i * 8, { font: 'tiny', color: OFF.price, align: 'right' }))
    }
    return
  }
  const fy = y + 3 - t.gap
  g.drawImage(solid(w, small, t.plinth), x, y + 3)
  if (t.over) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.drawImage(solid(w, small, CREAM), x + dx, fy + dy)
  const art = face(w, small, t.face)
  g.drawImage(art, x, fy)
  clearUnder(g, t.face, lx, fy, lw)
  if (t.shine) shine(g, art, x, fy, w, now)
  if (icon) {
    const at = { x: x + 6, y: fy + 6 }
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.drawImage(inked('ticket/icon/' + icon, OUTLINE), at.x + dx, at.y + dy)
    g.drawImage(inked('ticket/icon/' + icon, CREAM), at.x, at.y)
  }
  drawText(g, t.label, lx, fy + 5, { font: 'chalk', color: t.ink, bold: true, outline: light(t.ink) ? OUTLINE : undefined })
  if (t.price) {
    const pw = measure(t.price, chipFont) + 8
    const px = x + w - pw - RIGHT
    nineSlice(g, 'hud/ticket/chip', px, fy + 5, pw, 13)
    drawText(g, t.price, px + pw / 2, fy + (chipFont === 'sans' ? 6 : 8), { font: chipFont, color: '#2e2320', align: 'center' })
  }
}

// a slanted band of light crosses the face every 2.6 s, clipped to the ticket
const SWEEP = 2600
let glare: HTMLCanvasElement | null = null

function shine(g: CanvasRenderingContext2D, art: HTMLCanvasElement, x: number, y: number, w: number, now: number): void {
  const t = (now % SWEEP) / 700
  if (t >= 1) return
  glare ??= canvas(1, 1)
  if (glare.width !== w) {
    glare.width = w
    glare.height = H
  }
  const c = ctx2d(glare)
  c.clearRect(0, 0, w, H)
  c.drawImage(art, 0, 0)
  c.globalCompositeOperation = 'source-atop'
  c.fillStyle = 'rgba(255,251,232,0.55)'
  const bx = -20 + (w + 40) * t
  c.beginPath()
  c.moveTo(bx, 0)
  c.lineTo(bx + 6, 0)
  c.lineTo(bx - 2, H)
  c.lineTo(bx - 8, H)
  c.fill()
  c.globalCompositeOperation = 'destination-in'
  c.fillRect(Math.max(0, bx - 10), 0, 18, H)
  c.globalCompositeOperation = 'source-over'
  g.drawImage(glare, x, y)
}
