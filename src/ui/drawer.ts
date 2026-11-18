import { still } from './motion.ts'
import { creak, rip } from './sound.ts'
// the drawer (UX.md §3): a leather bifold half off the left edge, the same in every scene. its tabs peek out with live
// counts, a click or D/B/S/V/? swings it open in the middle as one tabbed viewer, and compare mode docks it small
// beside an offer. stage units (640×360), drawn by whichever scene is up
import { cardCanvas, sprite } from './art.ts'
import { collectible, drawCollectible } from './collectibles.ts'
import { drawText, measure, richSize, richText, wrapText, type TextStyle } from './font.ts'
import { insertFace } from './placeholders.ts'
import { handsColumn, howColumn } from './rules.ts'
import { SUITS, SUIT_GLYPH, cardValue, rankLabel, type Card } from '../engine/cards.ts'
import { deckDelta } from '../engine/compare.ts'
import { getDef } from '../engine/collectibles.ts'
import { SLEEVE_SLOTS } from '../engine/economy.ts'
import { entry, type Entry, type Kind } from '../engine/glossary.ts'
import { HAND_NAMES } from '../engine/hands.ts'
import { INSERTS, type SleeveCard } from '../engine/shop.ts'
import { stonksMult } from '../engine/sleeves.ts'
import type { SeatView } from '../engine/match.ts'

export type Tab = 'etui' | 'classeur' | 'sleeve' | 'vitrine' | 'carnet'
export type Compare = { offers: Card[]; dest?: 'deck' | 'binder' }
// what's under the mouse in the drawer, for the scene's Fiche. ctx goes to entry() as is
export type DrawerThing = { kind: Kind; id?: string; card?: Card; ctx?: unknown }
export type Anchor = { x: number; y: number; w: number; h: number }
// what the pages can do in this scene. a missing one hides its button
export type DrawerActions = {
  useInsert?: (slot: number) => void // slot 2 is the overflow
  canUse?: (slot: number) => boolean
  tossInsert?: (slot: number) => void
  sellBinder?: () => void // the classeur's Sell: opens the shop's sell sheet
  openAlbum?: () => void
  sellCollectible?: (slot: number) => void
  collectiblePrice?: (slot: number) => number
}

const W = 640
const H = 360
const INK = '#1c1513'
const CREAM = '#f6ecd2'
const PAPER = '#e3d2a8'
const TAN = '#bfa77e'
const FADED = '#8c7656'
const BURGUNDY = '#7a1a2c'
const RED = '#a82a38'
const GOLD = '#e8c260'
const BRASS = '#c99a3a'
const FLAME = '#a8260a'
const LEATHER = '#6b4a1a'
const LEATHER_DARK = '#3d2a10'
const LEATHER_LIGHT = '#9c7028'

const TABS: { id: Tab; name: string; en: string; key: string; ink: string }[] = [
  { id: 'etui', name: 'Étui', en: 'Deck', key: 'D', ink: RED },
  { id: 'classeur', name: 'Classeur', en: 'Binder', key: 'B', ink: '#28497a' },
  { id: 'sleeve', name: 'Sleeve', en: 'Sleeve', key: 'S', ink: BRASS },
  { id: 'vitrine', name: 'Vitrine', en: 'Display', key: 'V', ink: '#5c8f2a' },
  { id: 'carnet', name: 'Carnet', en: 'Rules', key: '?', ink: '#d04a4e' },
]

// closed peek on the left edge, the open book in the middle, the compare dock on the left
const PEEK = { x: -14, y: 204, tabW: 46, tabH: 23 }
const SPINE = 320
const LEAF = { w: 268, h: 266, top: 62 }
const DOCK = { x: 6, y: 34, w: 196, h: 296 }

// ---------- state ----------

let tab: Tab | null = null
let compare: Compare | null = null
let compareHover: Card | null = null
let hoverDest: 'deck' | 'binder' | null = null
let mouse = { x: -1, y: -1 }
let hits: { x: number; y: number; w: number; h: number; on: () => void }[] = []
let lastMs = 0
let hoverFn: ((thing: DrawerThing | null, anchor: Anchor) => void) | null = null
let hovered: { thing: DrawerThing; anchor: Anchor } | null = null
let wasActive = false
let actions: DrawerActions = {}
let glossary: Entry[] | null = null
let dockH = 0

type Filter = 'all' | 'pile' | 'hand' | 'played' | 'grading'
type Sort = 'rank' | 'suit' | 'value'
let filter: Filter = 'all'
let sort: Sort = 'suit'
let pageTurnAt = -Infinity
let carnetPage: 'hands' | 'glossary' = 'hands'
let glossPage = 0

// one-number springs: open slides it in, swing turns the right leaf on the spine, peek pops it out on hover
type Spring = { at: number; vel: number }
const slide: Spring = { at: 0, vel: 0 }
const swing: Spring = { at: -1, vel: 0 }
const peek: Spring = { at: 0, vel: 0 }
const dock: Spring = { at: 0, vel: 0 }

function chase(s: Spring, target: number, dt: number, stiff = 170): void {
  const damp = 2 * Math.sqrt(stiff) * 0.6 // under-damped a little, for the overshoot
  s.vel += (stiff * (target - s.at) - damp * s.vel) * dt
  s.at += s.vel * dt
}

// ---------- the api ----------

// with a compare, docks it small beside the offer instead (the tab is ignored, the dock is the Étui or the Classeur)
export function openDrawer(t: Tab, c?: Compare): void {
  if (c) {
    compare = c
    return
  }
  if (tab === null) { swing.at = -1; creak() }
  if (tab !== null && tab !== t) { pageTurnAt=performance.now(); rip(.035) }
  tab = t
}

// closes the full viewer first, and the compare dock when nothing else is open
export function closeDrawer(): void {
  if (tab !== null) tab = null
  else compare = null
}

export function drawerOpen(): boolean {
  return tab !== null || slide.at > 0.02
}

// ends compare mode: the choice is over
export function closeCompare(): void {
  compare = null
  compareHover = null
  hoverDest = null
}

// the offer under the mouse, ghosted into the dock. dest: where this one card goes, when offers split (pack sort)
export function setCompareHover(card: Card | null, dest?: 'deck' | 'binder'): void {
  compareHover = card
  hoverDest = card ? dest ?? null : null
}

export function setDrawerHover(fn: (thing: DrawerThing | null, anchor: Anchor) => void): void {
  hoverFn = fn
}

export function setDrawerActions(a: DrawerActions): void {
  actions = a
}

// the carnet's glossary page: the same entries the Fiche shows (engine/glossary.ts)
export function setGlossary(entries: Entry[]): void {
  glossary = entries
}

// D/B/S/V/? open their tab, the same key again or Esc closes. true if it was ours
export function drawerKey(key: string): boolean {
  if (key === 'Escape') {
    if (tab === null) return false
    tab = null
    return true
  }
  const t = TABS.find(x => x.key === (key === '/' ? '?' : key.toUpperCase()))
  if (!t) return false
  if (tab === t.id) tab = null
  else openDrawer(t.id)
  return true
}

// the tab under a point: the peek's tabs when closed, the tab row when open
function drawerHit(x: number, y: number): Tab | null {
  if (tab !== null) {
    for (const [i, t] of TABS.entries()) {
      const r = topTab(i)
      if (inside(x, y, r)) return t.id
    }
    return null
  }
  if (compare) return null
  for (const [i, t] of TABS.entries()) if (inside(x, y, peekTab(i, 10))) return t.id
  return null
}

// pointer moves and clicks from the scene, in stage units. true = the drawer took it (the scene ignores it)
export function drawerPointer(x: number, y: number, down: boolean): boolean {
  mouse = { x, y }
  const over = hits.some(h => inside(x, y, h)) || (tab === null && drawerHit(x, y) !== null)
  if (!down) return over || tab !== null
  for (let i = hits.length - 1; i >= 0; i--) {
    if (inside(x, y, hits[i])) {
      hits[i].on()
      return true
    }
  }
  if (tab !== null) {
    // a click off the book closes it
    if (!inside(x, y, { x: SPINE - LEAF.w - 4, y: LEAF.top - 24, w: LEAF.w * 2 + 8, h: LEAF.h + 30 })) tab = null
    return true
  }
  const t = drawerHit(x, y)
  if (t) {
    openDrawer(t)
    return true
  }
  return !!compare && inside(x, y, { ...DOCK, h: dockH })
}

// what the Étui counts: pile out of everything in your deck this round (grading and binder don't count)
export function deckCounts(v: SeatView): { pile: number; total: number } {
  return { pile: v.me.pile.length, total: deckCards(v).length }
}

const plain = (c: Card) => !c.bulk && !c.joker

// ---------- helpers ----------

const inside = (x: number, y: number, r: Anchor) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
const over = (r: Anchor) => inside(mouse.x, mouse.y, r)

function hit(r: Anchor, on: () => void): boolean {
  hits.push({ ...r, on })
  return over(r)
}

function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, edge = INK): void {
  g.fillStyle = edge
  g.fillRect(x, y, w, h)
  g.fillStyle = fill
  g.fillRect(x + 1, y + 1, w - 2, h - 2)
}

// faux bold fills in the sans m and w, so words with them stay regular
const boldable = (s: string) => !/[mw]/.test(s)

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextStyle = {}): void {
  drawText(g, s, x, y, { font: 'sans', color: INK, ...o, bold: o.bold && boldable(s) })
}

// "6→7": the font has no arrow, so it's drawn
function delta(g: CanvasRenderingContext2D, a: number, b: number, x: number, y: number, font: 'sans' | 'tiny' = 'sans'): number {
  const color = b > a ? BURGUNDY : INK
  text(g, String(a), x, y, { font, color: b > a ? FADED : INK })
  if (b === a) return measure(String(a), font)
  let at = x + measure(String(a), font) + 2
  const mid = y + (font === 'sans' ? 5 : 3)
  g.fillStyle = BURGUNDY
  g.fillRect(at, mid, 5, 1)
  g.fillRect(at + 3, mid - 2, 1, 1)
  g.fillRect(at + 4, mid - 1, 1, 1)
  g.fillRect(at + 3, mid + 2, 1, 1)
  g.fillRect(at + 4, mid + 1, 1, 1)
  at += 8
  text(g, String(b), at, y, { font, color, bold: true })
  return at + measure(String(b), font, true) - x
}

// a card scaled to fit a box, centered on its bottom edge
function cardAt(g: CanvasRenderingContext2D, c: Card, x: number, y: number, w: number, h: number, alpha = 1): Anchor {
  const img = cardCanvas(c)
  const s = Math.min(w / img.width, h / img.height)
  const dw = Math.round(img.width * s)
  const dh = Math.round(img.height * s)
  const dx = Math.round(x + (w - dw) / 2)
  const dy = Math.round(y + h - dh)
  g.save()
  g.globalAlpha *= alpha
  g.imageSmoothingEnabled = false
  g.drawImage(img, dx, dy, dw, dh)
  g.restore()
  return { x: dx, y: dy, w: dw, h: dh }
}

function outlineRect(g: CanvasRenderingContext2D, r: Anchor, color = CREAM): void {
  g.fillStyle = color
  g.fillRect(r.x - 1, r.y - 1, r.w + 2, 1)
  g.fillRect(r.x - 1, r.y + r.h, r.w + 2, 1)
  g.fillRect(r.x - 1, r.y, 1, r.h)
  g.fillRect(r.x + r.w, r.y, 1, r.h)
}

function chip(g: CanvasRenderingContext2D, label: string, x: number, y: number, on: boolean, click: () => void, font: 'tiny' | 'sans' = 'tiny'): number {
  const w = measure(label, font) + 8
  const h = font === 'tiny' ? 11 : 13
  const lit = hit({ x, y, w, h }, click)
  box(g, x, y - (lit && !on ? 1 : 0), w, h, on ? GOLD : lit ? CREAM : TAN)
  text(g, label, x + 4, y + 2 - (lit && !on ? 1 : 0), { font, color: INK })
  return w
}

function setHover(thing: DrawerThing, anchor: Anchor): void {
  hovered = { thing, anchor }
}

const hand = (v: SeatView) => {
  const ids = new Set(v.me.hand.map(c => c.id))
  return [...v.me.hand, ...(v.me.locked ?? []).filter(c => !ids.has(c.id))]
}
const deckCards = (v: SeatView) => [...v.me.pile, ...hand(v), ...v.me.discard]
const stonksOf = (v: SeatView, c: Card) => c.bulk ? 1 : stonksMult(c, v.stonks, v.me.sleeves.includes('hot_market'))

// rule lines in the glossary markup, wrapped. returns the height
function rich(g: CanvasRenderingContext2D, lines: string[], x: number, y: number, w: number, color = INK): number {
  let h = 0
  for (const l of lines) h += richText(g, l, x, y + h, w, { color })
  return h
}

const richHeight = (lines: string[], w: number) => lines.reduce((sum, l) => sum + richSize(l, w).h, 0)

// a small colored ticket on a page: Use, Toss, Sell
function button(g: CanvasRenderingContext2D, label: string, x: number, y: number, w: number, ink: string, enabled: boolean, click: () => void): void {
  const lit = enabled && hit({ x, y, w, h: 14 }, click)
  const up = lit ? 1 : 0
  box(g, x, y - up, w, 14, enabled ? ink : TAN, lit ? CREAM : INK)
  text(g, label, x + w / 2, y + 3 - up, { align: 'center', color: enabled ? CREAM : FADED, bold: true, outline: enabled ? INK : undefined })
}

function counts(v: SeatView): Record<Tab, string> {
  const d = deckCounts(v)
  return {
    etui: `${d.pile}/${d.total}`,
    classeur: String(v.me.binder.length),
    sleeve: `${v.me.sleeve.length}/2`,
    vitrine: `${v.me.display.length}/${v.me.displaySlots}`,
    carnet: '?',
  }
}

// ---------- per frame ----------

// ms is the frame time (performance.now()). draws the peek, the open book, or the compare dock
export function drawDrawer(g: CanvasRenderingContext2D, v: SeatView, ms: number): void {
  const dt = Math.min(0.05, (ms - lastMs) / 1000 || 0)
  lastMs = ms
  hits = []
  hovered = null
  const opening = tab !== null
  chase(slide, opening ? 1 : 0, dt, 260)
  // the cover swings once it's mostly in, and folds shut first when closing
  chase(swing, opening && slide.at > 0.7 ? 1 : -1, dt, 200)
  if (!opening && swing.at > -0.6) slide.vel = Math.max(slide.vel, 0)
  chase(dock, compare ? 1 : 0, dt, 220)

  if (dock.at > 0.02) drawDock(g, v)
  if (slide.at > 0.02) drawBook(g, v)
  else if (!compare) drawPeek(g, v, dt)
  else peek.at = 0

  const active = slide.at > 0.02 || !!compare
  if (hoverFn && (active || wasActive)) {
    const a = hovered as { thing: DrawerThing; anchor: Anchor } | null
    hoverFn(a?.thing ?? null, a?.anchor ?? { x: 0, y: 0, w: 0, h: 0 })
  }
  wasActive = active
}

// ---------- closed ----------

function peekTab(i: number, out: number): Anchor {
  return { x: PEEK.x + 22 + out, y: PEEK.y + 2 + i * PEEK.tabH, w: PEEK.tabW, h: PEEK.tabH - 2 }
}

function drawPeek(g: CanvasRenderingContext2D, v: SeatView, dt: number): void {
  const zone = { x: 0, y: PEEK.y, w: PEEK.x + 34 + PEEK.tabW + peek.at, h: TABS.length * PEEK.tabH + 4 }
  chase(peek, over(zone) ? 10 : 0, dt, 300)
  const out = Math.round(peek.at)
  const n = counts(v)
  const hotBinder = v.me.binder.some(c => stonksOf(v, c) > 1)
  let lit: number | null = null
  TABS.forEach((_, i) => { if (over(peekTab(i, out))) lit = i })
  if (lit !== null) {
    // the cream 1px outline around the whole bifold
    g.fillStyle = CREAM
    g.fillRect(0, PEEK.y - 1, PEEK.x + 35 + out, 124)
    TABS.forEach((_, i) => {
      const r = peekTab(i, out)
      g.fillRect(r.x - 1, r.y - 1, PEEK.tabW + 2, r.h + 2)
    })
  }
  // tabs first, so the leather covers their roots
  TABS.forEach((t, i) => {
    const r = peekTab(i, out)
    const lift = lit === i ? 2 : 0
    blit(g, `drawer/tab/${t.id}`, r.x + lift, r.y)
    text(g, n[t.id], r.x + lift + 15, r.y + 3, { font: 'tiny', color: INK })
    text(g, t.key, r.x + lift + 15, r.y + 12, { font: 'tiny', color: FADED })
    if (t.id === 'classeur' && hotBinder && Math.floor(lastMs / 500) % 2) {
      g.fillStyle = '#fff0b0'
      g.fillRect(r.x + lift + PEEK.tabW - 9, r.y + 3, 1, 3)
      g.fillRect(r.x + lift + PEEK.tabW - 10, r.y + 4, 3, 1)
    }
  })
  blit(g, 'drawer/peek', PEEK.x + out, PEEK.y)
  if (lit !== null) {
    const t = TABS[lit]
    const r = peekTab(lit, out)
    const cap = `${t.en} · ${n[t.id]} · ${t.key}`
    const w = measure(cap, 'sans') + 10
    box(g, r.x + PEEK.tabW + 8, r.y + 3, w, 15, CREAM)
    text(g, cap, r.x + PEEK.tabW + 13, r.y + 5)
  }
}

function blit(g: CanvasRenderingContext2D, name: string, x: number, y: number): void {
  const s = sprite(name)
  g.drawImage(s.img, s.x, s.y, s.w, s.h, Math.round(x), Math.round(y), s.w, s.h)
}

// ---------- open ----------

function topTab(i: number): Anchor {
  return { x: SPINE - LEAF.w + 14 + i * 74, y: LEAF.top - 20, w: 70, h: 22 }
}

function drawBook(g: CanvasRenderingContext2D, v: SeatView): void {
  const s = slide.at
  const settled = Math.abs(1 - s) < 0.03 && swing.at > 0.97
  g.save()
  g.fillStyle = `rgba(14,11,10,${0.6 * Math.min(1, s)})`
  g.fillRect(0, 0, W, H)
  // slides from the left edge and grows into place, about the spine
  const spine = 10 + (SPINE - 10) * s
  const cy = LEAF.top + LEAF.h / 2
  const sc = 0.35 + 0.65 * Math.min(1.05, s)
  g.translate(spine, cy)
  g.scale(sc, sc)
  g.translate(-SPINE, -cy)
  const shown = tab ?? 'etui'
  const n = counts(v)

  // the tab row along the top, the open one in front
  TABS.forEach((t, i) => {
    const r = topTab(i)
    const on = t.id === shown
    const lit = settled && hit(r, () => openDrawer(t.id))
    const y = r.y + (on ? 0 : lit ? 1 : 4)
    box(g, r.x, y, r.w, r.h + 4, on ? PAPER : lit ? CREAM : TAN)
    g.fillStyle = t.ink
    g.fillRect(r.x + 1, y + 1, r.w - 2, 2)
    text(g, t.name, r.x + 5, y + 5, { bold: on })
    text(g, n[t.id], r.x + r.w - 5, y + 7, { font: 'tiny', color: FADED, align: 'right' })
  })
  // close tag, top right
  const close = { x: SPINE + LEAF.w - 54, y: LEAF.top - 18, w: 54, h: 18 }
  const lit = settled && hit(close, () => { tab = null })
  box(g, close.x, close.y + (lit ? 0 : 2), close.w, close.h + 2, lit ? CREAM : TAN)
  text(g, 'Esc ×', close.x + close.w / 2, close.y + 5 + (lit ? 0 : 2), { align: 'center' })

  // the left leaf holds the contents, the right leaf the details. the right one swings on the spine
  blit(g, 'drawer/leaf', SPINE - LEAF.w, LEAF.top)
  if (swing.at > 0) {
    g.save()
    g.translate(SPINE, 0)
    g.scale(Math.max(0.01, swing.at), 1)
    g.translate(-SPINE, 0)
    blit(g, 'drawer/leaf', SPINE, LEAF.top)
    g.restore()
  }
  // gutter shadow
  g.fillStyle = 'rgba(28,21,19,0.35)'
  g.fillRect(SPINE - 3, LEAF.top + 6, 6, LEAF.h - 12)
  if (swing.at > 0.5) {
    // pages only register clicks once the book has settled
    const clickable = settled
    const keep = hits.length
    page(g, v, shown)
    if (!clickable) hits.length = keep
  }
  const turn=(lastMs-pageTurnAt)/210
  if (turn>=0 && turn<1 && !still.matches) {
    g.save()
    g.translate(SPINE,LEAF.top+6)
    const fold=Math.cos(Math.PI*turn)
    g.scale(fold,1)
    g.fillStyle=fold>0?PAPER:TAN
    g.fillRect(0,0,LEAF.w-7,LEAF.h-12)
    g.fillStyle=CREAM
    g.beginPath();g.moveTo(LEAF.w-30,0);g.lineTo(LEAF.w-7,turn<.5?18:32);g.lineTo(LEAF.w-7,0);g.fill()
    g.restore()
  }
  if (swing.at <= 0) {
    // still folded: the cover lies over the left leaf, mirrored
    g.save()
    g.translate(SPINE, 0)
    g.scale(Math.min(-0.01, swing.at), 1)
    g.translate(-SPINE, 0)
    blit(g, 'drawer/back', SPINE, LEAF.top)
    g.restore()
  }
  g.restore()
}

const L = { x: SPINE - LEAF.w + 12, y: LEAF.top + 10, w: LEAF.w - 24, h: LEAF.h - 20 }
const R = { x: SPINE + 12, y: LEAF.top + 10, w: LEAF.w - 24, h: LEAF.h - 20 }

function page(g: CanvasRenderingContext2D, v: SeatView, t: Tab): void {
  if (t === 'etui') etui(g, v)
  else if (t === 'classeur') classeur(g, v)
  else if (t === 'sleeve') sleeve(g, v)
  else if (t === 'vitrine') vitrine(g, v)
  else carnet(g, v)
}

// the right leaf's card detail: the hovered card big, its Fiche beside it, a note under it
function detail(g: CanvasRenderingContext2D, c: Card | null, y: number, note = ''): void {
  if (!c) {
    text(g, 'Hover a card to read it.', R.x, y, { color: FADED })
    return
  }
  const a = cardAt(g, c, R.x, y, 64, 92)
  setHover({ kind: 'card', card: c }, a)
  wrapText(note, a.w + 8, 'tiny').forEach((l, i) => text(g, l, R.x, a.y + a.h + 4 + i * 9, { font: 'tiny', color: BURGUNDY }))
}

// the Fiche of what's hovered on the left leaf, pinned to the right leaf's top instead of over the page
const leafAnchor = (y: number): Anchor => ({ x: R.x - 4, y, w: 0, h: 0 })

// ---------- étui ----------

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'pile', label: 'Pile' }, { id: 'hand', label: 'In hand' },
  { id: 'played', label: 'Played' }, { id: 'grading', label: 'Grading' },
]
const NOTES: Record<Filter, string> = {
  all: 'Your whole deck. Dimmed: in your hand or played this round.',
  pile: 'What you can still draw this round.',
  hand: 'Your cards right now.',
  played: 'Played or discarded this round. Back in at the next shuffle.',
  grading: 'Away at the grading desk.',
}

function etuiCards(v: SeatView, f: Filter): Card[] {
  if (f === 'pile') return v.me.pile
  if (f === 'hand') return hand(v)
  if (f === 'played') return v.me.discard
  if (f === 'grading') return v.me.shipping ? [v.me.shipping.card] : []
  return [...deckCards(v), ...(v.me.shipping ? [v.me.shipping.card] : [])]
}

const byRank = (a: Card, b: Card) => b.rank - a.rank || b.tier - a.tier || a.id - b.id
const SORTS: Record<Sort, (a: Card, b: Card) => number> = {
  rank: byRank,
  suit: (a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || byRank(a, b),
  value: (a, b) => cardValue(b) - cardValue(a) || byRank(a, b),
}

// rows of cards: one per suit when sorting by suit, else one flow wrapped into rows. bulk and jokers get their own row
function cardRows(cards: Card[], by: Sort, maxRows: number): { label: string; red: boolean; cards: Card[] }[] {
  const rows: { label: string; red: boolean; cards: Card[] }[] = []
  const main = cards.filter(plain).sort(SORTS[by])
  const other = cards.filter(c => !plain(c)).sort((a, b) => Number(a.bulk) - Number(b.bulk) || a.id - b.id)
  if (by === 'suit') {
    for (const s of SUITS) {
      const row = main.filter(c => c.suit === s)
      if (row.length) rows.push({ label: SUIT_GLYPH[s], red: s === 'H' || s === 'D', cards: row })
    }
  } else if (main.length) {
    const n = Math.max(1, Math.min(maxRows - (other.length ? 1 : 0), Math.ceil(main.length / 7)))
    const per = Math.ceil(main.length / n)
    for (let i = 0; i < main.length; i += per) rows.push({ label: '', red: false, cards: main.slice(i, i + per) })
  }
  if (other.length) rows.push({ label: 'B/J', red: false, cards: other })
  return rows
}

function etui(g: CanvasRenderingContext2D, v: SeatView): void {
  const all = etuiCards(v, filter)
  let x = L.x
  for (const f of FILTERS) x += chip(g, `${f.label} ${etuiCards(v, f.id).length}`, x, L.y, filter === f.id, () => { filter = f.id }) + 3
  const outIds = new Set([...hand(v), ...v.me.discard].map(c => c.id))
  const away = v.me.shipping?.card.id
  const rows = cardRows(all, sort, 5)
  const top = L.y + 16
  const rowH = Math.min(46, Math.floor((L.h - 18) / Math.max(1, rows.length)))
  const cw = Math.round((rowH - 2) * 64 / 88)
  let hoverCard = null as Card | null
  rows.forEach((row, i) => {
    const y = top + i * rowH
    text(g, row.label, L.x, y + rowH / 2 - 6, { color: row.red ? RED : INK, font: row.label.length > 1 ? 'tiny' : 'sans' })
    const x0 = L.x + 14
    const span = L.w - 14 - cw
    const step = row.cards.length > 1 ? Math.min(cw + 2, span / (row.cards.length - 1)) : 0
    let lift: { c: Card; x: number } | null = null
    row.cards.forEach((c, j) => {
      const cx = Math.round(x0 + j * step)
      if (over({ x: cx, y, w: j === row.cards.length - 1 ? cw : step, h: rowH - 2 })) lift = { c, x: cx }
    })
    row.cards.forEach((c, j) => {
      const cx = Math.round(x0 + j * step)
      const up = lift?.c === c ? 3 : 0
      const dim = filter === 'all' && outIds.has(c.id)
      const gone = c.id === away
      const a = cardAt(g, c, cx, y - up, cw, rowH - 2, dim || gone ? 0.4 : 1)
      if (gone) blit(g, 'drawer/parcel', a.x + a.w - 12, a.y + a.h - 10)
      if (up) {
        outlineRect(g, a)
        hoverCard = c
      }
    })
  })
  if (!rows.length) text(g, 'Nothing here.', L.x + L.w / 2, L.y + L.h / 2, { color: FADED, align: 'center' })

  // right leaf: sort, counts, the note, the hovered card
  let y = R.y
  text(g, 'Sort', R.x, y + 2, { font: 'tiny', color: FADED })
  x = R.x + 22
  for (const s of ['rank', 'suit', 'value'] as const) x += chip(g, s[0].toUpperCase() + s.slice(1), x, y, sort === s, () => { sort = s }) + 3
  const d = deckCounts(v)
  text(g, `${d.pile}/${d.total}`, R.x + R.w, y, { align: 'right', bold: true, color: BURGUNDY })
  y += 16
  for (const l of wrapText(NOTES[filter], R.w, 'sans')) {
    text(g, l, R.x, y, { color: FADED })
    y += 10
  }
  y += 4
  const p = all.filter(plain)
  SUITS.forEach((s, i) => {
    const cx = R.x + i * 34
    text(g, SUIT_GLYPH[s], cx, y, { color: s === 'H' || s === 'D' ? RED : INK })
    text(g, String(p.filter(c => c.suit === s).length), cx + 9, y, { bold: true })
  })
  const bulk = all.filter(c => c.bulk).length
  const jokers = all.filter(c => c.joker).length
  text(g, `${bulk} Bulk · ${jokers} Joker`, R.x + R.w, y, { align: 'right', font: 'tiny', color: FADED })
  y += 14
  rankGrid(g, R.x, y, R.w, r => p.filter(c => c.rank === r).length)
  y += 24
  g.fillStyle = TAN
  g.fillRect(R.x, y, R.w, 1)
  detail(g, hoverCard, y + 6, hoverCard && hoverCard.id === away ? `Away at grading, back round ${v.me.shipping!.back}` : '')
}

// 13 little columns, A down to 2, the count under each
function rankGrid(g: CanvasRenderingContext2D, x: number, y: number, w: number, count: (r: number) => number, after?: (r: number) => number): void {
  const col = w / 13
  for (let i = 0; i < 13; i++) {
    const r = 14 - i
    const cx = Math.round(x + i * col + col / 2)
    text(g, rankLabel(r), cx, y, { font: 'tiny', color: FADED, align: 'center' })
    const a = count(r)
    const b = after ? after(r) : a
    text(g, String(b), cx, y + 9, { align: 'center', bold: b !== a || a > 0, color: b > a ? BURGUNDY : a ? INK : TAN })
  }
}

// ---------- classeur ----------

function classeur(g: CanvasRenderingContext2D, v: SeatView): void {
  const cards = [...v.me.binder].sort((a, b) => stonksOf(v, b) - stonksOf(v, a) || byRank(a, b))
  text(g, 'Never drawn. Sell from it at the shop.', L.x, L.y, { color: FADED })
  if (actions.sellBinder) button(g, 'Sell', L.x + L.w - 44, L.y + L.h - 16, 44, '#3a8040', cards.length > 0, actions.sellBinder)
  if (actions.openAlbum) button(g, 'Album', L.x + L.w - 44 - 4 - 54, L.y + L.h - 16, 54, '#8c7656', true, actions.openAlbum)
  // big cards while they fit in 3 rows, then smaller and overlapped
  const big = cards.length <= 15
  const cols = big ? 5 : 7
  const cw = big ? 46 : 32
  const ch = big ? 64 : 44
  const per = Math.max(cols, Math.ceil(cards.length / (big ? 3 : 4)))
  const step = per > cols ? (L.w - cw) / (per - 1) : (L.w - cw) / (cols - 1)
  let hoverCard = null as Card | null
  const glint = Math.floor(lastMs / 400) % 2
  cards.forEach((c, i) => {
    const x = Math.round(L.x + (i % per) * step)
    const y = L.y + 16 + Math.floor(i / per) * (ch + 10)
    const lit = over({ x, y, w: Math.min(cw, step), h: ch })
    const a = cardAt(g, c, x, y - (lit ? 3 : 0), cw, ch)
    const mult = stonksOf(v, c)
    if (mult > 1) {
      outlineRect(g, a, glint ? GOLD : BRASS)
      box(g, a.x + a.w - 14, a.y - 4, 16, 10, GOLD)
      text(g, `×${mult}`, a.x + a.w - 6, a.y - 3, { font: 'tiny', align: 'center' })
    }
    if (lit) {
      outlineRect(g, a)
      hoverCard = c
    }
  })
  if (!cards.length) text(g, 'Empty. Pulls you send to the binder land here.', L.x + L.w / 2, L.y + L.h / 2, { color: FADED, align: 'center' })

  let y = R.y
  text(g, `${cards.length} card${cards.length === 1 ? '' : 's'}`, R.x, y, { bold: true, color: BURGUNDY })
  y += 14
  const stonks = entry('hud', 'stonks', { stonks: v.stonks, hotMarket: v.me.sleeves.includes('hot_market') })
  const lines = stonks.text.slice(0, 1)
  const bh = richHeight(lines, R.w - 10) + 14
  box(g, R.x, y, R.w, bh, CREAM)
  text(g, 'STONKS', R.x + 5, y + 3, { font: 'tiny', color: '#3a8040' })
  const hot = cards.filter(c => stonksOf(v, c) > 1).length
  text(g, hot ? `${hot} hot` : '', R.x + R.w - 5, y + 3, { font: 'tiny', align: 'right', color: BURGUNDY })
  rich(g, lines, R.x + 5, y + 11, R.w - 10)
  y += bh + 8
  detail(g, hoverCard, y, hoverCard && stonksOf(v, hoverCard) > 1 ? `STONKS: sells ×${stonksOf(v, hoverCard)}` : '')
}

// ---------- sleeve ----------

function insertName(card: SleeveCard): string {
  return card.hand ? `${INSERTS[card.id].name}: ${HAND_NAMES[card.hand]}` : INSERTS[card.id].name
}

// an insert face at 2×, lifted on hover. returns true when hovered
function insertCard(g: CanvasRenderingContext2D, card: SleeveCard, x: number, y: number, rotate = 0): boolean {
  const r = { x, y, w: 48, h: 68 }
  const lit = over(r)
  g.save()
  g.translate(x, y - (lit ? 3 : 0))
  g.rotate(rotate)
  g.scale(2, 2)
  const s = sprite(insertFace(card.id))
  g.drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h)
  g.restore()
  if (lit) outlineRect(g, { ...r, y: r.y - 3 })
  return lit
}

// use and toss under an insert, when this scene allows them
function insertButtons(g: CanvasRenderingContext2D, slot: number, x: number, y: number): void {
  if (actions.useInsert) button(g, 'Use', x, y, 48, '#2e7a78', actions.canUse?.(slot) ?? true, () => actions.useInsert!(slot))
  if (actions.tossInsert) button(g, 'Toss', x + 52, y, 48, RED, true, () => actions.tossInsert!(slot))
}

function sleeve(g: CanvasRenderingContext2D, v: SeatView): void {
  const held = [...v.me.sleeve]
  wrapText(`${SLEEVE_SLOTS} pockets. Use an insert from here, or from beside your hand.`, L.w, 'sans').forEach((l, i) => text(g, l, L.x, L.y + i * 10, { color: FADED }))
  let shown: { card: SleeveCard; slot: number } | null = null
  for (let i = 0; i < SLEEVE_SLOTS; i++) {
    const x = L.x + 36 + i * 124
    const y = L.y + 28
    const card = held[i]
    if (!card) {
      g.fillStyle = TAN
      for (let k = 0; k < 68; k += 4) {
        g.fillRect(x, y + k, 1, 2)
        g.fillRect(x + 47, y + k, 1, 2)
      }
      for (let k = 0; k < 48; k += 4) {
        g.fillRect(x + k, y, 2, 1)
        g.fillRect(x + k, y + 67, 2, 1)
      }
      text(g, 'empty', x + 24, y + 30, { font: 'tiny', color: FADED, align: 'center' })
      continue
    }
    if (insertCard(g, card, x, y)) shown = { card, slot: i }
    text(g, insertName(card), x + 24, y + 74, { align: 'center', bold: true, color: BURGUNDY })
    insertButtons(g, i, x - 26, y + 88)
  }
  if (v.me.overflow) {
    const o = v.me.overflow
    const y = L.y + L.h - 72
    if (insertCard(g, o, L.x + 4, y, -0.12)) shown = { card: o, slot: SLEEVE_SLOTS }
    text(g, `${insertName(o)} won't fit:`, L.x + 60, y + 6, { color: RED, bold: true })
    text(g, 'use or toss one', L.x + 60, y + 17, { color: RED })
    insertButtons(g, SLEEVE_SLOTS, L.x + 60, y + 32)
  }

  text(g, `${held.length}/${SLEEVE_SLOTS} held`, R.x, R.y, { bold: true, color: BURGUNDY })
  if (!shown) {
    text(g, 'Hover an insert to read it.', R.x, R.y + 16, { color: FADED })
    return
  }
  setHover({ kind: 'insert', id: shown.card.id, ctx: shown.card }, leafAnchor(R.y + 16))
  const when = INSERTS[shown.card.id].when
  const usable = !!actions.useInsert && (actions.canUse?.(shown.slot) ?? true)
  const where = usable ? 'Use it with the button under it.' : when === 'shop' ? 'Used in the shop.' : when === 'spot' ? 'Resolves the moment you get it.' : 'Used at the table, during a deal.'
  text(g, where, R.x, R.y + R.h - 12, { color: FADED })
}

// ---------- vitrine ----------

function vitrine(g: CanvasRenderingContext2D, v: SeatView): void {
  const items = v.me.display
  text(g, 'They score left to right, after your cards.', L.x, L.y, { color: FADED })
  const slots = Math.max(items.length, v.me.displaySlots)
  const rowH = Math.min(46, Math.floor((L.h - 14) / Math.max(1, slots)))
  let lit: number | null = null
  for (let i = 0; i < slots; i++) {
    const y = L.y + 14 + i * rowH
    const o = items[i]
    text(g, String(i + 1), L.x, y + rowH / 2 - 6, { bold: true, color: FADED })
    if (!o) {
      g.fillStyle = TAN
      for (let k = 0; k < L.w - 14; k += 4) g.fillRect(L.x + 14 + k, y + rowH - 6, 2, 1)
      text(g, 'empty slot', L.x + 16, y + rowH / 2 - 6, { color: FADED })
      continue
    }
    const r = { x: L.x + 12, y, w: L.w - 12, h: rowH - 2 }
    if (over(r)) {
      lit = i
      g.fillStyle = CREAM
      g.fillRect(r.x, r.y, r.w, r.h)
      setHover({ kind: 'collectible', id: o.id, ctx: o }, leafAnchor(R.y + 16))
    }
    const f = collectible(o, lastMs, i)
    const s = Math.min(1, (rowH - 6) / f.art.height, 44 / f.art.width)
    g.save()
    g.translate(L.x + 16, y + 2)
    g.scale(s, s)
    drawCollectible(g, f, 0, 0, lastMs + i * 213)
    g.restore()
    const def = getDef(o.id)
    text(g, def.name, L.x + 66, y + 2, { bold: true, color: def.rarity === 'rare' ? '#9c7028' : INK })
    if (actions.sellCollectible) {
      const price = actions.collectiblePrice?.(i)
      button(g, price !== undefined ? `Sell $${price}` : 'Sell', L.x + L.w - 50, y + 1, 50, '#3a8040', true, () => actions.sellCollectible!(i))
    }
    // as many rule lines as the row has room for, the Fiche has the rest. clear of the Sell button
    const room = Math.max(1, Math.floor((rowH - 14) / 11))
    const tw = L.w - 66 - (actions.sellCollectible ? 54 : 0)
    g.save()
    g.beginPath()
    g.rect(L.x + 66, y + 12, tw, room * 11)
    g.clip()
    rich(g, entry('collectible', o.id, o).text, L.x + 66, y + 12, tw, FADED)
    g.restore()
  }

  let y = R.y
  text(g, `${items.length}/${v.me.displaySlots} slots`, R.x, y, { bold: true, color: BURGUNDY })
  y += 16
  if (lit === null) text(g, 'Hover a collectible to read it.', R.x, y, { color: FADED })
  if (v.me.sleeves.length) {
    const lines = v.me.sleeves.map(id => {
      const e = entry('pochette', id)
      return `${e.name}: ${e.text[0]}`
    })
    y = R.y + R.h - 12 - richHeight(lines, R.w)
    text(g, 'Pochettes', R.x, y, { font: 'tiny', color: FADED })
    rich(g, lines, R.x, y + 9, R.w)
  }
}

// ---------- carnet ----------

const GLOSS_KIND: Record<Kind, string> = {
  card: 'card', finish: 'finish', stamp: 'stamp', knockoff: 'knockoff', trait: 'trait', tier: 'tier', variant: 'card type',
  joker: 'joker', bulk: 'card', collectible: 'collectible', insert: 'insert', pochette: 'pochette', twist: 'twist',
  rival: 'rival', keeper: 'la maison', hud: 'table', keyword: 'word', hand: 'hand',
}

function carnet(g: CanvasRenderingContext2D, v: SeatView): void {
  // the page switch sits on the right leaf's top
  let x = R.x + R.w
  for (const [id, label] of [['glossary', 'Glossary'], ['hands', 'Hands']] as const) {
    const w = measure(label, 'tiny') + 8
    x -= w
    chip(g, label, x, R.y - 2, carnetPage === id, () => { carnetPage = id })
    x -= 3
  }
  if (carnetPage === 'hands') {
    text(g, 'Les mains', L.x, L.y - 2, { bold: true, color: BURGUNDY })
    handsColumn(g, v, L.x, L.y + 12, L.w, 22)
    text(g, 'How a hand works', R.x, R.y, { bold: true, color: BURGUNDY })
    howColumn(g, v, R.x, R.y + 18, R.w, 6)
    return
  }
  // glossary: two leaves of entries, paged
  if (!glossary) throw new Error('the carnet glossary was opened before setGlossary')
  const pages: Entry[][] = []
  let cur: Entry[] = []
  let used = 0
  const height = (e: Entry) => 12 + richHeight(e.text, L.w) + 5
  for (const e of glossary) {
    const h = height(e)
    if (used + h > L.h - 22 && cur.length) {
      pages.push(cur)
      cur = []
      used = 0
    }
    cur.push(e)
    used += h
  }
  if (cur.length) pages.push(cur)
  const spreads = Math.max(1, Math.ceil(pages.length / 2))
  glossPage = Math.min(glossPage, spreads - 1)
  for (const [side, leaf] of [[0, L], [1, R]] as const) {
    let y = leaf.y + (side ? 14 : 0)
    for (const e of pages[glossPage * 2 + side] ?? []) {
      text(g, e.name, leaf.x, y, { bold: true, color: BURGUNDY })
      text(g, GLOSS_KIND[e.kind], leaf.x + leaf.w, y + 2, { font: 'tiny', color: FADED, align: 'right' })
      y += 12
      y += rich(g, e.text, leaf.x, y, leaf.w) + 5
    }
  }
  // page turns at the bottom corners
  const by = LEAF.top + LEAF.h - 22
  if (glossPage > 0) chip(g, '< prev', L.x, by, false, () => { glossPage-- })
  if (glossPage < spreads - 1) chip(g, 'next >', R.x + R.w - measure('next >', 'tiny') - 8, by, false, () => { glossPage++ })
  text(g, `${glossPage + 1} / ${spreads}`, R.x, by + 2, { font: 'tiny', color: FADED })
}

// ---------- compare dock ----------

// a tiny card: its index corner
function corner(g: CanvasRenderingContext2D, c: Card, x: number, y: number, alpha = 1): void {
  const img = cardCanvas(c)
  g.save()
  g.globalAlpha *= alpha
  g.drawImage(img, 0, 0, 14, 22, x, y, 14, 22)
  g.fillStyle = INK
  g.fillRect(x + 14, y, 1, 22)
  g.restore()
}

function drawDock(g: CanvasRenderingContext2D, v: SeatView): void {
  if (!compare && dock.at < 0.02) return
  const c = compare ?? { offers: [], dest: 'deck' as const }
  const x0 = DOCK.x - (DOCK.w + 10) * (1 - dock.at)
  g.save()
  g.translate(x0 - DOCK.x, 0)
  const binder = (hoverDest ?? c.dest) === 'binder'
  const base = binder ? v.me.binder : deckCards(v)
  const adding = compareHover ? [compareHover] : c.offers
  const d = deckDelta(base, adding)
  // the dock is only as tall as what's in it
  const other = base.filter(card => !plain(card))
  const otherGhost = !!compareHover && !plain(compareHover)
  const h = binder ? 24 + Math.ceil((base.length + 1) / 11) * 25 + 40
    : 24 + 4 * 25 + (other.length || otherGhost ? 25 : 0) + 30 + Math.max(1, Math.min(4, d.lines.length)) * 11 + 12
  const dockSprite = sprite('drawer/dock')
  g.drawImage(dockSprite.img, dockSprite.x, dockSprite.y, DOCK.w, h - 8, DOCK.x, DOCK.y, DOCK.w, h - 8)
  g.drawImage(dockSprite.img, dockSprite.x, dockSprite.y + DOCK.h - 8, DOCK.w, 8, DOCK.x, DOCK.y + h - 8, DOCK.w, 8)
  dockH = h
  const ix = DOCK.x + 12
  const iw = DOCK.w - 24
  let y = DOCK.y + 11
  text(g, binder ? 'Classeur' : 'Étui', ix, y, { bold: true, color: BURGUNDY })
  text(g, compareHover ? 'if you take it' : c.offers.length ? `if you take all ${c.offers.length}` : '', ix + iw, y + 2, { font: 'tiny', color: FADED, align: 'right' })
  y += 13
  const pulse = 0.5 + 0.5 * Math.sin(lastMs / 140)

  if (binder) {
    // binder: a flow of corners, the newcomer ghosted at the end
    const all = [...base].sort(byRank)
    const per = 11
    all.forEach((card, i) => corner(g, card, ix + (i % per) * 15, y + Math.floor(i / per) * 25))
    const i = all.length
    if (compareHover) ghost(g, compareHover, ix + (i % per) * 15, y + Math.floor(i / per) * 25, pulse)
    y += Math.max(1, Math.ceil((all.length + 1) / per)) * 25 + 4
    text(g, 'Cards', ix, y, { color: FADED })
    delta(g, all.length, all.length + adding.length, ix + 40, y)
    y += 14
    if (compareHover && stonksOf(v, compareHover) > 1) text(g, `STONKS: sells ×${stonksOf(v, compareHover)} today`, ix, y, { color: '#3a8040', bold: true })
    g.restore()
    return
  }

  // deck: one row per suit, the hovered offer ghosted at its sort spot
  for (const s of SUITS) {
    const row = base.filter(card => plain(card) && card.suit === s).sort(byRank)
    const ghostAt = compareHover && plain(compareHover) && compareHover.suit === s ? row.filter(card => card.rank > compareHover!.rank).length : -1
    const n = row.length + (ghostAt >= 0 ? 1 : 0)
    // the count sits at the row's right end, the corners squeeze to stay clear of it
    const [a, b] = d.suit[s]
    const w = measure(String(b), 'sans', true) + (b !== a ? measure(String(a), 'sans') + 9 : 0)
    const step = n > 1 ? Math.min(15, (iw - 10 - 15 - 4 - w) / (n - 1)) : 15
    text(g, SUIT_GLYPH[s], ix, y + 6, { color: s === 'H' || s === 'D' ? RED : INK })
    let k = 0
    let ghostX = -1
    for (let j = 0; j <= row.length; j++) {
      if (j === ghostAt) ghostX = Math.round(ix + 10 + k++ * step)
      if (j < row.length) corner(g, row[j], Math.round(ix + 10 + k++ * step), y)
    }
    if (ghostX >= 0) ghost(g, compareHover!, ghostX, y, pulse) // on top, so squeezed rows don't hide it
    delta(g, a, b, ix + iw - w, y + 6)
    y += 25
  }
  if (other.length || otherGhost) {
    text(g, 'B/J', ix, y + 7, { font: 'tiny', color: FADED })
    other.forEach((card, j) => corner(g, card, ix + 14 + j * 12, y))
    if (otherGhost) ghost(g, compareHover!, ix + 14 + other.length * 12, y, pulse)
    y += 25
  }
  y += 2
  rankGrid(g, ix, y, iw, r => d.rank[r][0], r => d.rank[r][1])
  y += 24
  g.fillStyle = TAN
  g.fillRect(ix, y, iw, 1)
  y += 4
  for (const l of d.lines.slice(0, 4)) {
    text(g, l, ix, y, { color: FLAME, bold: true })
    y += 11
  }
  if (!d.lines.length) text(g, compareHover || c.offers.length ? 'no new lane' : 'hover an offer', ix, y, { color: FADED })
  g.restore()
}

function ghost(g: CanvasRenderingContext2D, c: Card, x: number, y: number, pulse: number): void {
  corner(g, c, x, y, 0.55 + 0.35 * pulse)
  outlineRect(g, { x, y, w: 15, h: 22 }, pulse > 0.5 ? GOLD : BRASS)
}
