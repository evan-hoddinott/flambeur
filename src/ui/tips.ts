// first-encounter tags (docs/ONBOARDING.md #3): a pinned paper tag with one short line, the first time a thing
// can be used. one at a time, gone on your next click, never back. tips off silences them, never the score labels.
// scenes call tip(id, text, anchor) every frame it applies and drawTips(g) before the Fiche.
// in the tutorial (docs/TUTORIAL.md) la fée verte says them instead: a speech bubble a page at a time, typed out in
// her voice, and a spotlight that only lets the click it points at through
import { canvas, ctx2d, nineSlice, sprite } from './art.ts'
import { drawFee, FEE_W, feeAway } from './fee.ts'
import { drawText, measure, wrapText } from './font.ts'
import { pref } from './prefs.ts'
import * as sfx from './sound.ts'

type Rect = { x: number; y: number; w: number; h: number }
// a spotlit thing as it's drawn: its center, size and turn, so a fanned card is lit card-shaped
export type Shape = { x: number; y: number; w: number; h: number; r: number }
type Side = 'above' | 'below' | 'left' | 'right'
// fee: she says it even outside the tutorial. again: never marked seen for good, only heard until the page reloads
// (give it an id per moment, like the run's number).
// lead: it wins the frame over any other tag (the tutorial's forced steps). book: it's about the open carnet, so it
// shows over it (every other tag waits for the carnet to close)
type TipOpts = { fee?: boolean; again?: boolean; lead?: boolean; book?: boolean }

const W = 640
const H = 360
const WRAP = 116
const FEE_WRAP = 150
const PAD = 5
const GAP = 4
const TYPE_MS = 28 // a letter
const SEEN_KEY = 'flambeur.tips.seen'
const INK = '#2e2320'
const OUTLINE = '#1c1513'
const ABSINTHE = '#2a4a14'

// storage can throw (private window, blocked site data): then tips just show every session
function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function save(): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]))
  } catch {}
}

const seen = loadSeen()
let guide = false // the tutorial is on: every tag is the fée's
let want: { id: string; pages: string[]; anchor: Rect; side: Side; o: TipOpts } | null = null // this frame's first tip() call
let wantSpot: Shape[] | null = null
let showing: string | null = null // what was on screen last frame
let shownAt = 0
// the fée's bubble last frame: which page, when it started, and where it and its skip chip were
let talk: { id: string; page: number; pages: string[]; at: number; box: Rect; skip: Rect | null; again: boolean; keep: boolean } | null = null
let spot: Shape[] | null = null // last frame's spotlight
let veil: HTMLCanvasElement | null = null // the dark around it, drawn at stage size
let blipped = { at: 0, n: 0 } // letters of the current page that already blipped
const heard = new Set<string>() // again tips read through this visit

// forget every tag seen, so a new player on this browser gets them all again
export function resetTips(): void {
  seen.clear()
  save()
}

// the tutorial run turns the fée on, skipping it or any other run turns her off
export function setGuide(on: boolean): void {
  guide = on
}

export function guiding(): boolean {
  return guide
}

// a lesson that also said this tag's line: it never shows on its own
export function markSeen(...ids: string[]): void {
  for (const id of ids) seen.add(id)
  save()
}

export function wasSeen(id: string): boolean {
  return seen.has(id)
}

// a tag was on screen last frame: the scene's hint line waits so the same thing isn't said twice
export function tipShowing(): boolean {
  return showing !== null
}

// the first call each frame wins, so a busy moment still shows one tag. text = one line, or the fée's pages
export function tip(id: string, text: string | string[], anchor: Rect, side: Side = 'above', o: TipOpts = {}): void {
  if ((want && (want.o.lead || !o.lead)) || (o.again ? heard : seen).has(id)) return
  if (spot && !o.lead) return // a forced step is up: the other tags wait for it
  if (!pref('tips') && !o.fee) return
  want = { id, pages: typeof text === 'string' ? [text] : text, anchor, side, o }
}

// the tutorial's forced step: everything but these shapes goes dark and won't take a click
export function spotlight(shapes: Shape[]): void {
  if (guide && shapes.length) wantSpot = shapes
}

// a plain box as a spotlight shape
export function boxShape(r: Rect): Shape {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h, r: 0 }
}

// every shape as one path, grown by pad. same winding, so overlapping cards fill as their union
function outline(g: CanvasRenderingContext2D, shapes: Shape[], pad: number): void {
  g.beginPath()
  for (const s of shapes) {
    const c = Math.cos(s.r)
    const n = Math.sin(s.r)
    const hw = s.w / 2 + pad
    const hh = s.h / 2 + pad
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
    corners.forEach(([dx, dy], i) => {
      const x = s.x + dx * c - dy * n
      const y = s.y + dx * n + dy * c
      if (i) g.lineTo(x, y)
      else g.moveTo(x, y)
    })
    g.closePath()
  }
}

function onShape(shapes: Shape[], p: { x: number; y: number }, pad: number): boolean {
  return shapes.some(s => {
    const dx = p.x - s.x
    const dy = p.y - s.y
    const lx = dx * Math.cos(-s.r) - dy * Math.sin(-s.r)
    const ly = dx * Math.sin(-s.r) + dy * Math.cos(-s.r)
    return Math.abs(lx) <= s.w / 2 + pad && Math.abs(ly) <= s.h / 2 + pad
  })
}

function place(w: number, h: number, a: Rect, side: Side): { x: number; y: number } {
  const x = side === 'left' ? a.x - GAP - w : side === 'right' ? a.x + a.w + GAP : a.x + a.w / 2 - w / 2
  const y = side === 'above' ? a.y - GAP - h : side === 'below' ? a.y + a.h + GAP : a.y + a.h / 2 - h / 2
  return { x: Math.round(Math.max(2, Math.min(W - 2 - w, x))), y: Math.round(Math.max(2, Math.min(H - 2 - h, y))) }
}

const inside = (r: Rect, p: { x: number; y: number }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

// paused: the pause menu covers everything. book: the carnet is open, so only its own tags show
export function drawTips(g: CanvasRenderingContext2D, paused = false, book = false): void {
  const t = want
  want = null
  g.globalAlpha = 1
  const hidden = paused || (book && !t?.o.book)
  spot = paused ? null : wantSpot
  wantSpot = null
  if (spot) dim(g, spot)
  if (!t || hidden) {
    showing = null
    if (!t) {
      talk = null
      feeAway()
    }
    return
  }
  if (showing !== t.id) shownAt = performance.now()
  showing = t.id
  if (guide || t.o.fee) return fee(g, t)
  talk = null
  paperTag(g, t.pages.join(' '), t.anchor, t.side)
}

// the table goes dark except the spotlit shapes, with a breathing absinthe ring hugging their outline
function dim(g: CanvasRenderingContext2D, shapes: Shape[]): void {
  veil ??= canvas(W, H)
  const v = ctx2d(veil)
  v.clearRect(0, 0, W, H)
  // the ring: the shapes grown by 2, with the shapes cut out of it
  v.globalCompositeOperation = 'source-over'
  v.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 220)
  v.fillStyle = '#8fd14f'
  outline(v, shapes, 2)
  v.fill()
  v.globalAlpha = 1
  v.globalCompositeOperation = 'destination-out'
  outline(v, shapes, 0)
  v.fill()
  // the dark behind everything, then the shapes cut out of it too
  v.globalCompositeOperation = 'destination-over'
  v.fillStyle = 'rgba(14,11,10,0.55)'
  v.fillRect(0, 0, W, H)
  v.globalCompositeOperation = 'destination-out'
  outline(v, shapes, 0)
  v.fill()
  v.globalCompositeOperation = 'source-over'
  g.save()
  g.globalAlpha = 1 // the scene can leave its alpha anywhere
  g.drawImage(veil, 0, 0)
  g.restore()
}

function paperTag(g: CanvasRenderingContext2D, text: string, anchor: Rect, side: Side): void {
  const rows = wrapText(text, WRAP, 'sans')
  const w = Math.max(...rows.map(r => measure(r, 'sans'))) + PAD * 2 + 2
  const h = rows.length * 10 + PAD * 2 + 1
  const at = place(w, h, anchor, side)
  // a 3px drop as it lands, the same slap as the Fiche
  const age = performance.now() - shownAt
  const y = at.y - (age >= 90 ? 0 : Math.round(3 * (1 - age / 90) ** 2))
  g.save()
  g.globalAlpha = 0.45
  nineSlice(g, 'hud/plate/paper', at.x + 2, y + 2, w, h, OUTLINE)
  g.restore()
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) nineSlice(g, 'hud/plate/paper', at.x + dx, y + dy, w, h, OUTLINE)
  nineSlice(g, 'hud/plate/paper', at.x, y, w, h)
  rows.forEach((row, i) => drawText(g, row, at.x + w / 2, y + PAD + i * 10, { font: 'sans', color: INK, align: 'center' }))
  const pin = sprite('fiche/pin')
  g.drawImage(pin.img, pin.x, pin.y, pin.w, pin.h, at.x + 4 - pin.px, y - 2 - pin.py, pin.w, pin.h) // the top-left corner, clear of the text
}

// the fée beside the anchor and her bubble beside her, typing out the current page
function fee(g: CanvasRenderingContext2D, t: NonNullable<typeof want>): void {
  const now = performance.now()
  if (talk?.id !== t.id) talk = { id: t.id, page: 0, pages: t.pages, at: now, box: { x: 0, y: 0, w: 0, h: 0 }, skip: null, again: !!t.o.again, keep: !!(t.o.lead || t.o.book) }
  const text = t.pages[talk.page]
  // size the bubble for the whole page so it doesn't grow while typing
  const rows = wrapText(text, FEE_WRAP, 'sans')
  const w = Math.max(...rows.map(r => measure(r, 'sans'))) + PAD * 2 + 2
  const h = rows.length * 10 + PAD * 2 + 9 // a row for the page dots and the click prompt
  // room for her on the side of the bubble nearest the anchor
  const at = place(w + FEE_W + 4, h, t.anchor, t.side)
  const left = at.x + w / 2 < t.anchor.x + t.anchor.w / 2 || at.x < FEE_W // she sits between the bubble and the anchor
  const box = { x: left ? at.x : at.x + FEE_W + 4, y: at.y, w, h }
  talk.box = box
  drawFee(g, { x: left ? box.x + w + FEE_W / 2 + 2 : box.x - FEE_W / 2 - 2, y: box.y + h / 2 }, now, !left)
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) nineSlice(g, 'hud/plate/paper', box.x + dx, box.y + dy, w, h, ABSINTHE)
  nineSlice(g, 'hud/plate/paper', box.x, box.y, w, h)
  // type it out, a blip a letter
  const shown = Math.min(text.length, Math.floor((now - talk.at) / TYPE_MS))
  if (blipped.at !== talk.at) blipped = { at: talk.at, n: 0 }
  let left_ = shown
  rows.forEach((row, i) => {
    const part = row.slice(0, Math.max(0, left_))
    left_ -= row.length + 1
    drawText(g, part, box.x + PAD + 1, box.y + PAD + i * 10, { font: 'sans', color: INK })
  })
  // a click that finishes the line jumps the count, so only the letters typed one by one blip
  if (shown - blipped.n > 2) blipped.n = shown
  for (; blipped.n < shown; blipped.n++) sfx.blip('fee', blipped.n, text[blipped.n])
  const foot = box.y + h - 9
  if (t.pages.length > 1) t.pages.forEach((_, i) => {
    g.fillStyle = i === talk!.page ? ABSINTHE : '#b8a888'
    g.fillRect(box.x + PAD + 1 + i * 5, foot + 3, 3, 3)
  })
  // a little arrow when the line is done: click for more
  if (shown >= text.length && Math.floor(now / 400) % 2) {
    g.fillStyle = ABSINTHE
    for (let i = 0; i < 3; i++) g.fillRect(box.x + w - PAD - 4 + i, foot + 2 + i, 1, 5 - i * 2)
  }
  // the way out of the tutorial, under her bubble
  talk.skip = null
  if (guide && !t.o.again) {
    const label = 'Skip tutorial'
    const sw = measure(label, 'tiny') + 6
    const skip = { x: box.x + w - sw, y: box.y + h + 2, w: sw, h: 9 }
    if (skip.y + skip.h < H) {
      drawText(g, label, skip.x + 3, skip.y + 1, { font: 'tiny', color: '#c8f27a', outline: '#0e0b0a' })
      talk.skip = skip
    }
  }
}

// a click while the fée talks: finish the line, then the next page, then she's done. the scenes call this before
// their own hits and stop when it's true. the spotlight eats every click outside it
export function tipClick(p: { x: number; y: number }): boolean {
  if (talk && showing === talk.id) {
    if (talk.skip && inside(talk.skip, p)) {
      guide = false
      spot = null
      sfx.page()
      return true
    }
    const text = talk.pages[talk.page]
    const typedAll = performance.now() - talk.at >= text.length * TYPE_MS
    if (!typedAll) {
      talk.at = performance.now() - text.length * TYPE_MS
      return true
    }
    if (talk.page < talk.pages.length - 1) {
      talk.page++
      talk.at = performance.now()
      sfx.page()
      return true
    }
    if (talk.again) heard.add(talk.id)
    else markSeen(talk.id)
    // the click that closes a forced step's or the carnet's lesson stays with it, so it can't shut the book
    const keep = talk.keep || inside(talk.box, p)
    talk = null
    showing = null
    if (keep) return true
  }
  if (spot && !onShape(spot, p, 2)) {
    sfx.denied()
    return true
  }
  return false
}

// the next click after a paper tag has been up long enough to read counts as read. a quicker click (picking a
// second card right after the first) leaves it up. the fée's bubble reads clicks through tipClick instead
const READ_MS = 1200

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => {
    if (!showing || talk || performance.now() - shownAt < READ_MS) return
    seen.add(showing)
    showing = null
    save()
  }, true)
}
