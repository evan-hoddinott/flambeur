// first-encounter tags (docs/ONBOARDING.md #3): a pinned paper tag with one short line, the first time a thing
// can be used. one at a time, gone on your next click, never back. tips off silences them, never the score labels.
// scenes call tip(id, text, anchor) every frame it applies and drawTips(g) before the Fiche
import { nineSlice, sprite } from './art.ts'
import { drawText, measure, wrapText } from './font.ts'

type Rect = { x: number; y: number; w: number; h: number }
type Side = 'above' | 'below' | 'left' | 'right'

const W = 640
const H = 360
const WRAP = 116
const PAD = 5
const GAP = 4
const SEEN_KEY = 'flambeur.tips.seen'
const ON_KEY = 'flambeur.tips'
const INK = '#2e2320'
const OUTLINE = '#1c1513'

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
    localStorage.setItem(ON_KEY, on ? 'on' : 'off')
  } catch {}
}

function loadOn(): boolean {
  try {
    return localStorage.getItem(ON_KEY) !== 'off'
  } catch {
    return true
  }
}

const seen = loadSeen()
let on = loadOn()
let want: { id: string; text: string; anchor: Rect; side: Side } | null = null // this frame's first tip() call
let showing: string | null = null // what was on screen last frame
let shownAt = 0

export function tipsOn(): boolean {
  return on
}

export function setTips(v: boolean): void {
  on = v
  save()
}

// forget every tag seen, so a new player on this browser gets them all again
export function resetTips(): void {
  seen.clear()
  save()
}

// a tag was on screen last frame: the scene's hint line waits so the same thing isn't said twice
export function tipShowing(): boolean {
  return showing !== null
}

// the first call each frame wins, so a busy moment still shows one tag
export function tip(id: string, text: string, anchor: Rect, side: Side = 'above'): void {
  if (!on || seen.has(id) || want) return
  want = { id, text, anchor, side }
}

function place(w: number, h: number, a: Rect, side: Side): { x: number; y: number } {
  const x = side === 'left' ? a.x - GAP - w : side === 'right' ? a.x + a.w + GAP : a.x + a.w / 2 - w / 2
  const y = side === 'above' ? a.y - GAP - h : side === 'below' ? a.y + a.h + GAP : a.y + a.h / 2 - h / 2
  return { x: Math.round(Math.max(2, Math.min(W - 2 - w, x))), y: Math.round(Math.max(2, Math.min(H - 2 - h, y))) }
}

// hidden: something covers the table (the open carnet), so the tag waits for it to close
export function drawTips(g: CanvasRenderingContext2D, hidden = false): void {
  const t = want
  want = null
  if (!t || hidden) {
    showing = null
    return
  }
  if (showing !== t.id) shownAt = performance.now()
  showing = t.id
  const rows = wrapText(t.text, WRAP, 'sans')
  const w = Math.max(...rows.map(r => measure(r, 'sans'))) + PAD * 2 + 2
  const h = rows.length * 10 + PAD * 2 + 1
  const at = place(w, h, t.anchor, t.side)
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

// the next click after a tag has been up long enough to read counts as read. a quicker click (picking a second
// card right after the first) leaves it up
const READ_MS = 1200

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => {
    if (!showing || performance.now() - shownAt < READ_MS) return
    seen.add(showing)
    showing = null
    save()
  }, true)
}
