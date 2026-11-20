// canvas panels: the screens with no scene of their own (draft, pack rip, binder, album, grading, wishlist,
// forge pick, results, starter box), drawn over the live scene so the frame stays put (docs/UX.md §8).
// a paper sheet in the middle with a title and a help line, the screen's own content, and its buttons
// in the action column, the safe or primary one in the corner. main.ts builds a Panel each render, a scene draws it
import { backCanvas, nineSlice, sprite } from './art.ts'
import { cardShadow, heldCard } from './held.ts'
import { springSet, type T } from './motion.ts'
import { fiche } from './fiche.ts'
import * as sfx from './sound.ts'
import { drawText, measure, wrapText, type TextStyle } from './font.ts'
import { drawTicket, type TicketIcon } from './ticket.ts'
import type { Card } from '../engine/cards.ts'
import { cardEntry, type Entry } from '../engine/glossary.ts'
import type { StarterId } from '../engine/starters.ts'

export type Box = { x: number; y: number; w: number; h: number }
export type Btn = { label: string; price?: string; kind: 'go' | 'buy' | 'back' | 'use' | 'danger'; enabled: boolean; onClick: () => void }
export type CardOpts = {
  key?: string // the spring key, default the card id
  dim?: boolean
  picked?: boolean // raised with a gold outline
  tag?: string // a small paper tag under the card (Deck / Binder, a price)
  tagInk?: string
  back?: StarterId | null // face down, with this back
  glow?: string // a soft color under it
  onClick?: () => void
}
export type Ui = {
  g: CanvasRenderingContext2D
  now: number
  mouse: { x: number; y: number }
  hit: (x: number, y: number, w: number, h: number, onClick: () => void) => boolean
  text: (s: string, x: number, y: number, o?: TextStyle) => void
  lines: (s: string, x: number, y: number, w: number, o?: TextStyle) => number // wrapped, returns the height
  nine: (name: string, x: number, y: number, w: number, h: number, tint?: string) => void
  card: (c: Card, x: number, y: number, w: number, o?: CardOpts) => boolean // top-left, returns hover
  button: (b: Btn, x: number, y: number, w: number) => boolean // a small ticket inside the sheet
  fiche: (e: Entry, x: number, y: number, w: number, h: number) => boolean // this box shows e's Fiche on hover
  spring: (key: string, target: T, from?: T) => T // the panels' own springs, stepped every frame in either scene
  hover: (c: Card, at: Box) => void // a card drawn by hand (the pack fan) is under the mouse: its Fiche shows
}
export type Panel = {
  title: string
  scrim?: (now: number) => number
  help?: string
  docked?: boolean // the compare dock is open on the left: the sheet moves right of it
  felt?: boolean // no paper: the content sits right on the table (draft, starter box). text goes cream with an outline
  body: (ui: Ui, box: Box) => void
  buttons: Btn[] // top to bottom. the last one sits in the corner: make it the safe or primary one
  onCardHover?: (c: Card | null, at: Box) => void // every frame, the face-up card under the mouse (its Fiche shows by itself)
  onEscape?: () => void
  onWheel?: (dy: number) => void // the mouse wheel over the scene. without it, the wheel turns the paged() grid
}

const W = 640
const INK = '#2e2320'
const CREAM = '#f6ecd2'
const PAPER = '#e3d2a8'
const OUTLINE = '#0e0b0a'
const SHEET: Box = { x: 166, y: 20, w: 334, h: 332 }
const DOCKED_SHEET: Box = { x: 212, y: 20, w: 288, h: 332 }
const COL = { x: 508, w: 126, bottom: 352 }
// a card's fiche docks at the top of the action column, so it never covers the row of cards you're sorting
const DOCK = { x: COL.x - 4, y: 60, w: 0, h: 0 }
const PITCH = 30
export const CARD_H = (w: number) => Math.round(w * 88 / 64)

const COLORS: Record<Btn['kind'], { face: string; plinth: string; label: string }> = {
  go: { face: '#c99a3a', plinth: '#3d2a10', label: '#1c1513' },
  buy: { face: '#3a8040', plinth: '#1e4a24', label: CREAM },
  back: { face: '#8c7656', plinth: '#2a2010', label: CREAM },
  use: { face: '#2e7a78', plinth: '#0f2a2a', label: CREAM },
  danger: { face: '#a82a38', plinth: '#2a0910', label: CREAM },
}

let panel: Panel | null = null
let hits: { x: number; y: number; w: number; h: number; onClick: () => void }[] = []
let hoverCard: { card: Card; at: Box } | null = null
let openedAt = 0
let pager: { page: number; pages: number; turn: (page: number) => void } | null = null // this frame's paged() grid
let lastDraw = 0
const springs = springSet()
// the ½× card under the mouse, drawn at 1× over everything once the body is done
let popped: { c: Card; x: number; y: number; key: string; picked: boolean } | null = null

export function setPanel(next: Panel | null): void {
  if (next && !panel) openedAt = performance.now()
  panel = next
  if (!next) hits = []
}

export const panelOpen = () => panel !== null
// the open panel closes on Esc, so Esc is its, not the pause menu's
export const panelEscapes = () => !!panel?.onEscape

// draw over the scene: scrim, sheet, content, buttons. call after the scene, before the frame pieces and the Fiche
export function drawPanel(g: CanvasRenderingContext2D, now: number, mouse: { x: number; y: number }): void {
  hits = []
  pager = null
  springs.step(Math.min(0.05, (now - lastDraw) / 1000 || 0))
  lastDraw = now
  if (!panel) return
  const p = panel
  const u = Math.min(1, (now - openedAt) / 180)
  const box = p.docked ? DOCKED_SHEET : SHEET
  g.save()
  g.fillStyle = `rgba(14,11,10,${p.scrim?.(now) ?? (p.felt ? 0.25 : 0.55) * u})`
  g.fillRect(0, 0, W, 360)
  g.restore()
  const hit = (x: number, y: number, w: number, h: number, onClick: () => void) => {
    hits.push({ x, y, w, h, onClick })
    return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h
  }
  // swallow clicks on the sheet so they don't fall through to the scene
  hit(box.x, box.y, box.w, box.h, () => {})
  const slide = (1 - u) * 14
  g.save()
  g.translate(0, slide)
  if (!p.felt) {
    nineSlice(g, 'hud/plate/frame', box.x - 4, box.y - 4, box.w + 8, box.h + 8)
    nineSlice(g, 'hud/plate/paper', box.x, box.y, box.w, box.h)
  }
  const ink = p.felt ? { title: '#fff0b0', help: CREAM, outline: OUTLINE } : { title: '#7a1a2c', help: '#5c4a36', outline: undefined }
  drawText(g, p.title, box.x + box.w / 2, box.y + 4, { font: 'didone', color: ink.title, align: 'center', outline: ink.outline })
  let top = box.y + 26
  if (p.help) {
    for (const row of wrapText(p.help, box.w - 20, 'sans')) {
      drawText(g, row, box.x + box.w / 2, top, { font: 'sans', color: ink.help, align: 'center', outline: ink.outline })
      top += 10
    }
    top += 4
  }
  hoverCard = null
  popped = null
  const ui: Ui = {
    g, now, mouse, hit,
    text: (s, x, y, o) => drawText(g, s, x, y, o),
    lines: (s, x, y, w, o) => {
      const rows = wrapText(s, w, o?.font ?? 'sans', o?.bold)
      rows.forEach((row, i) => drawText(g, row, x, y + i * 10, o))
      return rows.length * 10
    },
    nine: (name, x, y, w, h, tint) => nineSlice(g, name, x, y, w, h, tint),
    card: (c, x, y, w, o = {}) => drawCard(g, hit, c, x, y, w, o),
    button: (b, x, y, w) => ticket(g, hit, b, x, y, w),
    fiche: (e, x, y, w, h) => {
      const on = mouse.x >= x && mouse.x <= x + w && mouse.y >= y + slide && mouse.y <= y + h + slide
      if (on) fiche(e, { x, y: y + slide, w, h })
      return on
    },
    spring: springs.spring,
    hover: (card, at) => (hoverCard = { card, at }),
  }
  p.body(ui, { x: box.x + 8, y: top, w: box.w - 16, h: box.y + box.h - top - 8 })
  if (popped) popCard(g, popped)
  g.restore()
  // the action column, bottom up: the last button sits in the corner
  const list = p.buttons
  list.forEach((b, i) => ticket(g, hit, b, COL.x, COL.bottom - (list.length - i) * PITCH + 3, COL.w))
  const hc = hoverCard as { card: Card; at: Box } | null // set inside drawCard, which ts can't see
  if (hc) fiche(cardEntry(hc.card), DOCK)
  p.onCardHover?.(hc?.card ?? null, hc?.at ?? { x: 0, y: 0, w: 0, h: 0 })
}

// topmost first. true = the panel took it
export function panelClick(p: { x: number; y: number }): boolean {
  if (!panel) return false
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]
    if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) {
      h.onClick()
      return true
    }
  }
  return true // the scrim eats the rest
}

export function panelHover(p: { x: number; y: number }): boolean {
  return hits.slice(1).some(h => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h)
}

// what's under the mouse for the hover tick: the topmost hit past the sheet. card-shaped ones are cards
export function panelHoverAt(p: { x: number; y: number }): { key: string; card: boolean; x: number } | null {
  for (let i = hits.length - 1; i >= 1; i--) {
    const h = hits[i]
    if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) {
      return { key: `panel${i}:${Math.round(h.w)}x${Math.round(h.h)}`, card: h.w >= 30 && h.h > h.w * 1.2, x: h.x + h.w / 2 }
    }
  }
  return null
}

export function panelKey(key: string): boolean {
  if (!panel) return false
  if (key === 'Escape' && panel.onEscape) {
    panel.onEscape()
    return true
  }
  if ((key === 'ArrowLeft' || key === 'ArrowRight') && pager) {
    flip(key === 'ArrowLeft' ? -1 : 1)
    return true
  }
  if (key === 'Enter' || key === ' ') {
    const last = panel.buttons.at(-1)
    if (last?.enabled) last.onClick()
    return true
  }
  return false
}

// a wheel turn from the scene (see wheelStep). true = the panel took it
export function panelWheel(dy: number): boolean {
  if (!panel) return false
  if (panel.onWheel) panel.onWheel(dy)
  else if (pager) flip(Math.sign(dy))
  return true
}

function flip(by: number): void {
  if (!pager) return
  const next = pager.page + by
  if (next < 0 || next >= pager.pages) return
  sfx.page()
  pager.turn(next)
}

// the scene's wheel listener feeds this: one page per notch, and a trackpad swipe turns one page, not ten.
// returns -1, 0 or 1
let wheelSum = 0
let wheelAt = 0
let wheelSpent = false
export function wheelStep(e: WheelEvent): number {
  if (e.timeStamp - wheelAt > 160) {
    wheelSum = 0
    wheelSpent = false
  }
  wheelAt = e.timeStamp
  wheelSum += e.deltaY || e.deltaX
  if (wheelSpent || Math.abs(wheelSum) < 30) return 0
  wheelSpent = true
  return Math.sign(wheelSum)
}

// a page of a grid: which items show, and the < 1 / 3 > control under them. returns the visible slice's indices.
// per page = the whole rows of w that fit in box, minus 14px for the control. the page clamps when the list shrinks
export function paged(ui: Ui, n: number, box: Box, w: number, page: number, turn: (page: number) => void, gap = 6, rowGap = 16): { at: { x: number; y: number }; i: number }[] {
  const perRow = Math.max(1, Math.floor((box.w + gap) / (w + gap)))
  const rows = Math.max(1, Math.floor((box.h - 14 + rowGap) / (CARD_H(w) + rowGap)))
  const per = perRow * rows
  const pages = Math.max(1, Math.ceil(n / per))
  const at = Math.max(0, Math.min(page, pages - 1))
  const first = at * per
  const shown = grid(Math.min(per, n - first), box, w, gap, rowGap).map((xy, k) => ({ at: xy, i: first + k }))
  if (pages === 1) return shown
  pager = { page: at, pages, turn }
  const label = `${at + 1} / ${pages}`
  const mid = box.x + box.w / 2
  const y = box.y + box.h - 11
  ui.text(label, mid, y, { color: INK, align: 'center' })
  const half = measure(label, 'sans') / 2
  const arrow = (s: string, x: number, by: number) => {
    const ok = at + by >= 0 && at + by < pages
    const lit = ok && ui.hit(x - 6, y - 2, 16, 14, () => flip(by))
    ui.text(s, x + 2, y - (lit ? 1 : 0), { color: !ok ? '#bfa77e' : lit ? '#7a1a2c' : INK, align: 'center', bold: lit })
  }
  arrow('<', mid - half - 14, -1)
  arrow('>', mid + half + 10, 1)
  return shown
}

// the card size rule (docs/UX.md): 1× (64 wide) with smoothing off, or ½× (32) with smoothing on, at whole pixels.
// any other width smears the pixel art, so it throws. a hovered ½× card pops to 1× over its spot
function drawCard(g: CanvasRenderingContext2D, hit: Ui['hit'], c: Card, x: number, y: number, w: number, o: CardOpts): boolean {
  if (w !== 64 && w !== 32) throw new Error(`a card ${w}px wide: cards are drawn 64 (1x) or 32 (half) wide`)
  x = Math.round(x)
  y = Math.round(y)
  const h = CARD_H(w)
  const over = hit(x, y, w, h, o.onClick ?? (() => {}))
  const pops = over && w === 32 && o.back === undefined
  const lift = (o.picked ? 4 : 0) + (over && o.onClick && !pops ? 2 : 0)
  const top = y - lift
  if (o.glow) {
    g.save()
    g.fillStyle = o.glow
    g.globalAlpha = 0.35
    g.fillRect(x - 2, top - 2, w + 4, h + 4)
    g.restore()
  }
  if (o.picked || (over && o.onClick && !pops)) {
    g.fillStyle = o.picked ? '#e8c260' : CREAM
    g.fillRect(x - 1, top - 1, w + 2, h + 2)
  }
  g.save()
  g.imageSmoothingEnabled = w === 32
  if (o.dim) g.globalAlpha = 0.45
  const img = o.back !== undefined ? backCanvas(o.back) : undefined
  // a sticker or a jumbo's canvas is a bit bigger than 64x88: same scale, centered on the slot
  heldCard(g, c, x + w / 2, top + h / 2, w / 64, 0, { img })
  g.restore()
  if (o.tag) {
    const tw = measure(o.tag, 'tiny') + 6
    nineSlice(g, 'hud/plate/paper', x + w / 2 - tw / 2, top + h + 2, tw, 10, o.tagInk)
    drawText(g, o.tag, x + w / 2, top + h + 3, { font: 'tiny', color: INK, align: 'center' })
  }
  if (pops) popped = { c, x: x + w / 2, y: top + h / 2, key: o.key ?? String(c.id), picked: !!o.picked }
  else if (over && o.back === undefined) hoverCard = { card: c, at: { x, y: top, w, h } }
  return over
}

// the 1× pop: springs up off its ½× spot with a shadow under it, kept on the stage
function popCard(g: CanvasRenderingContext2D, p: NonNullable<typeof popped>): void {
  const x = Math.min(W - 34, Math.max(34, p.x))
  const y = Math.min(360 - 46, Math.max(46, p.y - 12))
  const at = springs.spring('pop' + p.key, { x, y, r: 0, s: 1 }, { x: p.x, y: p.y, r: 0, s: 1 })
  const cx = Math.round(at.x)
  const cy = Math.round(at.y)
  g.save()
  g.imageSmoothingEnabled = false
  cardShadow(g, cx, cy + 2, 64, 88, 0)
  if (p.picked) {
    g.fillStyle = '#e8c260'
    g.fillRect(cx - 33, cy - 45, 66, 90)
  }
  heldCard(g, p.c, cx, cy, 1, 0)
  g.restore()
  hoverCard = { card: p.c, at: { x: cx - 32, y: cy - 44, w: 64, h: 88 } }
}

// the raffle-ticket button, same look as the duel's (src/ui/ticket.ts)
const ICON: Partial<Record<Btn['kind'], TicketIcon>> = { go: 'continue', back: 'back', use: 'insert' }

function ticket(g: CanvasRenderingContext2D, hit: Ui['hit'], b: Btn, x: number, y: number, w: number): boolean {
  const over = b.enabled && hit(x, y - 4, w, PITCH, () => { sfx.stamp(); b.onClick() })
  const c = COLORS[b.kind]
  drawTicket(g, x, y, w, { label: b.label, price: b.price, icon: ICON[b.kind], face: c.face, plinth: c.plinth, ink: c.label, enabled: b.enabled, over, gap: over ? 4 : 3 }, performance.now())
  return over
}

// lay n cards of width w in rows inside a box, centered. returns each card's top-left
export function grid(n: number, box: Box, w: number, gap = 6, rowGap = 16): { x: number; y: number }[] {
  const h = CARD_H(w)
  const perRow = Math.max(1, Math.floor((box.w + gap) / (w + gap)))
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow)
    const inRow = Math.min(perRow, n - row * perRow)
    const left = box.x + (box.w - (inRow * w + (inRow - 1) * gap)) / 2
    out.push({ x: Math.round(left + (i % perRow) * (w + gap)), y: box.y + row * (h + rowGap) })
  }
  return out
}

// a sprite scaled to fit a box, centered
export function fit(g: CanvasRenderingContext2D, name: string, box: Box): void {
  const s = sprite(name)
  const k = Math.min(box.w / s.w, box.h / s.h)
  const w = s.w * k
  const h = s.h * k
  g.save()
  g.imageSmoothingEnabled = k < 1
  g.drawImage(s.img, s.x, s.y, s.w, s.h, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h)
  g.restore()
}

