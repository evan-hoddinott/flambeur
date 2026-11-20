import { mix, still } from './motion.ts'
import { bookClose, creak, page as pageTurn, thunk } from './sound.ts'
// the drawer (UX.md §3): a worn leather carnet poking out of the bottom-left corner, the same in every scene. its
// index tabs stick out with live counts, hover pulls it into view, a click or D/B/S/V/? flies it to the middle and
// swings it open as one tabbed viewer, and compare mode docks it small beside an offer. stage units (640×360)
import { cardCanvas, sprite } from './art.ts'
import { collectible, drawCollectible } from './collectibles.ts'
import { drawText, measure, richSize, richText, wrapText, type TextStyle } from './font.ts'
import { insertFace } from './placeholders.ts'
import { handsColumn, howColumn, playColumn } from './rules.ts'
import { boxShape, spotlight, tip, wasSeen, type Shape } from './tips.ts'
import { drawPile, drawPin, lineName, type Box } from './pile.ts'
import { type Card } from '../engine/cards.ts'
import { GROUPINGS, lineTotal, type Grouping } from '../engine/pile.ts'
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

const TABS: { id: Tab; name: string; en: string; key: string; ink: string }[] = [
  { id: 'etui', name: 'Étui', en: 'Deck', key: 'D', ink: RED },
  { id: 'classeur', name: 'Classeur', en: 'Binder', key: 'B', ink: '#28497a' },
  { id: 'sleeve', name: 'Sleeve', en: 'Sleeve', key: 'S', ink: BRASS },
  { id: 'vitrine', name: 'Vitrine', en: 'Display', key: 'V', ink: '#5c8f2a' },
  { id: 'carnet', name: 'Carnet', en: 'Rules', key: '?', ink: '#d04a4e' },
]

// the carnet sits in the bottom-left corner, tilted and mostly off-stage. hover pulls it into view, a click flies
// it to the middle and swings the cover open. poses are the cover's top-left corner, in stage units
const BOOK = 80 // the closed carnet's face is 80×80 (plus 4px of page block, art/duel/booklet.py)
const REST = { x: -42, y: 300, rot: -0.15 }
const OUT = { x: 8, y: 262, rot: 0 }
// its index tabs: how far each one sticks out of the fore-edge. they've never sat flush
const SLIP = { y: 6, step: 14, h: 13, w: 48, edge: 84 }
const SLIP_REST = [7, 10, 6, 9, 8]
const SLIP_OUT = [27, 29, 26, 28, 27]
// the open book: the cover lands on the right leaf, then swings over the spine to become the left leaf
const SPINE = 312
const LEAF = { w: 268, h: 266, top: 50 }
const GROW = LEAF.w / BOOK
const BIG_AT = 0.95 // past this far into the flight, the big art takes over from the small carnet
const TAB = { w: 64, h: 40, out: 52, top: 14, step: 48 }
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

// la pile: how the étui and the dock group the deck, what's pinned, and (mid-round) pile or whole deck
let grouping: Grouping = 'rank'
let pins: string[] = []
let showAll = false
let pileHover: Card | null = null // last frame's, so the renderer can light the hovered card's other lines
let pageTurnAt = -Infinity
let carnetPage: 'play' | 'hands' | 'glossary' = 'hands'
let glossPage = 0

let lastTab: Tab = 'etui' // a click on the cover opens where you left off
let creaked = false

// one-number springs: out pulls the carnet from the corner on hover, slide flies it to the middle,
// swing turns the cover on the spine (-1 shut, 1 open), band slips the elastic off, slips are the tabs
type Spring = { at: number; vel: number }
const out: Spring = { at: 0, vel: 0 }
const slide: Spring = { at: 0, vel: 0 }
const swing: Spring = { at: -1, vel: 0 }
const band: Spring = { at: 0, vel: 0 }
const dock: Spring = { at: 0, vel: 0 }
const slips: Spring[] = SLIP_REST.map(at => ({ at, vel: 0 }))

function chase(s: Spring, target: number, dt: number, stiff = 170): void {
  if (still.matches) {
    s.at = target
    s.vel = 0
    return
  }
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
  if (tab === null && slide.at < 0.02) thunk() // the elastic snaps off
  if (tab !== null && tab !== t) { pageTurnAt=performance.now(); pageTurn() }
  tab = t
  lastTab = t
}

// closes the full viewer first, and the compare dock when nothing else is open
export function closeDrawer(): void {
  if (tab !== null) {
    tab = null
    bookClose()
  } else compare = null
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
  if (key.toUpperCase() === 'G' && (tab === 'etui' || (tab === null && compare))) {
    regroup(GROUPINGS[(GROUPINGS.indexOf(grouping) + 1) % GROUPINGS.length])
    return true
  }
  const t = TABS.find(x => x.key === (key === '/' ? '?' : key.toUpperCase()))
  if (!t) return false
  if (tab === t.id) tab = null
  else openDrawer(t.id)
  return true
}

// where the carnet is: the corner pose (rest, or pulled out by hover) on its way to the middle as it opens.
// s is its scale, 1 in the corner and GROW when it's landed on the right leaf
function pose(): { x: number; y: number; rot: number; s: number } {
  const k = slide.at
  const x = mix(mix(REST.x, OUT.x, out.at), SPINE, k)
  const y = mix(mix(REST.y, OUT.y, out.at), LEAF.top, k)
  return { x, y, rot: mix(mix(REST.rot, OUT.rot, out.at), 0, Math.min(1, k)), s: 1 + (GROW - 1) * k }
}

// a stage point in the carnet's own pixels (its cover's top-left is 0,0)
function local(x: number, y: number): { x: number; y: number } {
  const p = pose()
  const half = (BOOK * p.s) / 2
  const dx = x - p.x - half
  const dy = y - p.y - half
  const c = Math.cos(-p.rot)
  const s = Math.sin(-p.rot)
  return { x: (dx * c - dy * s) / p.s + BOOK / 2, y: (dx * s + dy * c) / p.s + BOOK / 2 }
}

// the index tab under a stage point, on the closed carnet
function slipAt(x: number, y: number): number | null {
  const l = local(x, y)
  for (let i = 0; i < TABS.length; i++) {
    const top = SLIP.y + i * SLIP.step
    if (l.x >= SLIP.edge - 2 && l.x <= SLIP.edge + slips[i].at && l.y >= top && l.y < top + SLIP.h) return i
  }
  return null
}

// the closed carnet under a stage point: cover, papers sticking out the top, pencil, ribbon, tabs
function overBook(x: number, y: number): boolean {
  if (x < 0 || y < 0) return false
  const l = local(x, y)
  return (l.x >= -6 && l.x <= SLIP.edge && l.y >= -10 && l.y <= BOOK + 12) || slipAt(x, y) !== null
}

// the open book's tabs, out of the right leaf's fore-edge. the visible part only
function sideTab(i: number): Anchor {
  return { x: SPINE + LEAF.w, y: LEAF.top + TAB.top + i * TAB.step, w: TAB.out, h: TAB.h }
}

// pointer moves and clicks from the scene, in stage units. true = the drawer took it (the scene ignores it)
export function drawerPointer(x: number, y: number, down: boolean): boolean {
  mouse = { x, y }
  const closed = tab === null && slide.at < 0.02 && !compare
  const over = hits.some(h => inside(x, y, h)) || (closed && overBook(x, y))
  if (!down) return over || tab !== null
  for (let i = hits.length - 1; i >= 0; i--) {
    if (inside(x, y, hits[i])) {
      hits[i].on()
      return true
    }
  }
  if (tab !== null) {
    // a click off the book (and its tabs) closes it
    if (!inside(x, y, { x: SPINE - LEAF.w - 4, y: LEAF.top - 24, w: LEAF.w * 2 + TAB.out + 12, h: LEAF.h + 30 })) {
      tab = null
      bookClose()
    }
    return true
  }
  if (closed && overBook(x, y)) {
    const i = slipAt(x, y)
    openDrawer(i === null ? lastTab : TABS[i].id)
    return true
  }
  return !!compare && inside(x, y, { ...DOCK, h: dockH })
}

// what's under the mouse for the hover tick: a card in the book, a hit, or the carnet in its corner
export function drawerHoverAt(): { key: string; card: boolean; x: number } | null {
  const h = hovered as { thing: DrawerThing; anchor: Anchor } | null
  if (h?.thing.card) return { key: `drawer-card${h.thing.card.id}`, card: true, x: h.anchor.x + h.anchor.w / 2 }
  for (let i = hits.length - 1; i >= 0; i--) {
    const r = hits[i]
    if (inside(mouse.x, mouse.y, r)) return { key: `drawer${i}:${Math.round(r.w)}x${Math.round(r.h)}`, card: false, x: r.x }
  }
  const closed = tab === null && slide.at < 0.02 && !compare
  return closed && overBook(mouse.x, mouse.y) ? { key: 'carnet', card: false, x: mouse.x } : null
}

// what the Étui counts: pile out of everything in your deck this round (grading and binder don't count)
export function deckCounts(v: SeatView): { pile: number; total: number } {
  return { pile: v.me.pile.length, total: deckCards(v).length }
}

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

// ms is the frame time (performance.now()). draws the carnet in its corner (or flying), the open book, or the compare dock
export function drawDrawer(g: CanvasRenderingContext2D, v: SeatView, ms: number): void {
  const dt = Math.min(0.05, (ms - lastMs) / 1000 || 0)
  lastMs = ms
  hits = []
  hovered = null
  const opening = tab !== null
  const flying = slide.at > 0.02
  // hover pulls it out of the corner. while it flies, the corner pose holds still so the path doesn't wander
  if (!flying && !opening) chase(out, !compare && overBook(mouse.x, mouse.y) ? 1 : 0, dt, 240)
  // it flies in, then the cover swings. closing: the cover shuts first, then it flies home
  chase(slide, opening || swing.at > -0.9 ? 1 : 0, dt, 190)
  chase(swing, opening && slide.at > BIG_AT ? 1 : -1, dt, 160)
  chase(band, opening || flying ? 1 : 0, dt, 300)
  chase(dock, compare ? 1 : 0, dt, 220)
  if (opening && !creaked && slide.at > BIG_AT) {
    creak()
    creaked = true
  }
  if (!opening) creaked = false

  if (dock.at > 0.02) drawDock(g, v)
  if (flying) {
    g.fillStyle = `rgba(14,11,10,${0.6 * Math.min(1, slide.at)})`
    g.fillRect(0, 0, W, H)
  }
  if (slide.at >= BIG_AT) drawBook(g, v)
  else if (!compare || flying) drawCarnet(g, v, dt, flying)

  tour()
  const active = slide.at > 0.02 || !!compare
  if (hoverFn && (active || wasActive)) {
    const a = hovered as { thing: DrawerThing; anchor: Anchor } | null
    hoverFn(a?.thing ?? null, a?.anchor ?? { x: 0, y: 0, w: 0, h: 0 })
  }
  wasActive = active
}

// ---------- the tutorial's tour (docs/TUTORIAL.md) ----------
// la fée has you open the carnet, then walks you through each tab in order. a scene asks for it every frame it
// applies (the first shop of the tutorial); each tab's lesson is a tag, so it's done once it's been read

let touring = false

export function bookTour(): void {
  touring = true
}

const TOUR: Record<Tab, string[]> = {
  etui: ['Étui: your deck, every card you play with.', 'One line per rank. A dotted card also counts in that line. G regroups by suit or type. Now click the Binder tab.'],
  classeur: ['Classeur: your binder, the cards you kept out of your deck.', 'Binder cards are for selling, here in the shop. Cards that match the chalkboard sell for more. Next, the Sleeve tab.'],
  sleeve: ['Your Sleeve holds up to 2 inserts, won on scratchers.', 'Most are used on the cards in your hand during a round. A Wishlist works here in the shop. Next, the Display tab.'],
  vitrine: ['Vitrine: your display case, with your collectibles.', 'They fire left to right on every hand. Sell one here if you need the room or the money. Last, the Rules tab.'],
  carnet: ['Carnet: How to play, every poker hand with its Value and Hype, and a glossary of every word in the game.', 'Open it whenever something is unclear.'],
}

// the closed carnet in its corner as a spotlight shape: the cover, the papers on top and the tabs on the right
function closedShape(): Shape {
  const p = pose()
  const half = (BOOK * p.s) / 2
  const c = Math.cos(p.rot)
  const n = Math.sin(p.rot)
  const [ox, oy] = [13, 1] // the shape's middle, from the cover's
  return { x: p.x + half + (ox * c - oy * n) * p.s, y: p.y + half + (ox * n + oy * c) * p.s, w: 118 * p.s, h: 102 * p.s, r: p.rot }
}

function tour(): void {
  const on = touring
  touring = false
  if (!on) return
  const next = TABS.find(t => !wasSeen(`book-${t.id}`))
  if (tab === null) {
    if (slide.at > 0.02 || !next) return
    const s = closedShape()
    tip('book-open', ['Before you shop, meet the little book down in the corner.', 'Your deck, binder, sleeve, display case and the rules all live in it. Click it to open it.'],
      { x: Math.max(0, s.x - s.w / 2), y: s.y - s.h / 2, w: s.w, h: s.h }, 'above', { lead: true, book: true })
    spotlight([s])
    return
  }
  if (Math.abs(1 - slide.at) > 0.03 || swing.at < 0.97) return
  const top = { x: SPINE - LEAF.w, y: LEAF.top, w: LEAF.w * 2, h: LEAF.h }
  if (!next) return tip('book-done', ['That is your little book. Open it any time from the corner, or with D, B, S, V or ?.', 'Esc closes it. Now, go shopping!'], top, 'above', { lead: true, book: true })
  if (tab !== next.id) return spotlight([boxShape(sideTab(TABS.indexOf(next)))])
  if (next.id === 'carnet' && carnetPage === 'hands') carnetPage = 'play'
  tip(`book-${next.id}`, TOUR[next.id], top, 'above', { lead: true, book: true })
}

// ---------- closed: the carnet ----------

function blit(g: CanvasRenderingContext2D, name: string, x: number, y: number): void {
  const s = sprite(name)
  g.drawImage(s.img, s.x, s.y, s.w, s.h, Math.round(x), Math.round(y), s.w, s.h)
}

// a paper tucked in the top edge, set a little crooked
function tucked(g: CanvasRenderingContext2D, name: string, x: number, y: number, rot: number): void {
  const s = sprite(name)
  g.save()
  g.translate(x + s.w / 2, y + s.h)
  g.rotate(rot)
  g.drawImage(s.img, s.x, s.y, s.w, s.h, -s.w / 2, -s.h, s.w, s.h)
  g.restore()
}

function drawCarnet(g: CanvasRenderingContext2D, v: SeatView, dt: number, flying: boolean): void {
  const p = pose()
  const lit = flying ? null : slipAt(mouse.x, mouse.y)
  slips.forEach((s, i) => chase(s, lit === i ? SLIP_OUT[i] + 6 : mix(SLIP_REST[i], SLIP_OUT[i], out.at), dt, 320))
  const half = (BOOK * p.s) / 2
  g.save()
  // whole stage pixels while it sits still, so the counts on the tabs stay crisp
  const parked = !flying && Math.abs(p.rot) < 0.01
  g.translate(parked ? Math.round(p.x) + half : p.x + half, parked ? Math.round(p.y) + half : p.y + half)
  g.rotate(p.rot)
  g.scale(p.s, p.s)
  g.translate(-BOOK / 2, -BOOK / 2)
  g.imageSmoothingEnabled = false
  // the papers stuck in the top rise a little when you pull it out, like they're about to fall
  const lift = 2 * out.at
  tucked(g, 'drawer/book/receipt', 15, -10 - lift, -0.1 - 0.04 * out.at)
  tucked(g, 'drawer/book/note', 29, -5 - lift * 0.5, 0.05)
  tucked(g, 'drawer/book/card', 50, -8 - lift, 0.17 + 0.03 * out.at)
  // the tabs come out from between the pages, so the cover hides their roots
  TABS.forEach((t, i) => blit(g, `drawer/book/slip/${t.id}`, SLIP.edge + slips[i].at - SLIP.w, SLIP.y + i * SLIP.step))
  blit(g, 'drawer/book/ribbon', 22, 74)
  blit(g, 'drawer/book/cover', 0, 0)
  blit(g, 'drawer/book/pencil', -4, -6)
  blit(g, 'drawer/book/loop', -6, 10)
  blit(g, 'drawer/book/loop', -6, 40)
  if (band.at < 0.98) {
    g.globalAlpha = 1 - band.at
    blit(g, 'drawer/book/band', 64 + 18 * band.at, -1)
    g.globalAlpha = 1
  }
  // counts on the tabs once it's out far enough to read them
  const n = counts(v)
  if (out.at > 0.6 && !flying) {
    const hotBinder = v.me.binder.some(c => stonksOf(v, c) > 1)
    TABS.forEach((t, i) => {
      const y = SLIP.y + i * SLIP.step
      text(g, n[t.id], SLIP.edge + 2, y + 4, { font: 'tiny', color: INK })
      if (t.id === 'classeur' && hotBinder && Math.floor(lastMs / 500) % 2) {
        const gx = SLIP.edge + slips[i].at - 9
        g.fillStyle = '#fff0b0'
        g.fillRect(gx, y + 3, 1, 3)
        g.fillRect(gx - 1, y + 4, 3, 1)
      }
    })
  }
  if (lit !== null) outlineRect(g, { x: SLIP.edge, y: SLIP.y + lit * SLIP.step, w: slips[lit].at - 1, h: SLIP.h })
  g.restore()
  // the caption beside the tab you're on: Deck · 14/18 · D
  if (lit !== null) {
    const t = TABS[lit]
    const cap = `${t.en} · ${n[t.id]} · ${t.key}`
    const w = measure(cap, 'sans') + 10
    const x = Math.round(p.x) + SLIP.edge + Math.round(slips[lit].at) + 4
    const y = Math.round(p.y) + SLIP.y + lit * SLIP.step - 1
    box(g, x, y, w, 15, CREAM)
    text(g, cap, x + 5, y + 2)
  }
}

// ---------- open ----------

function drawBook(g: CanvasRenderingContext2D, v: SeatView): void {
  const settled = Math.abs(1 - slide.at) < 0.03 && swing.at > 0.97
  const p = pose()
  g.save()
  // the flight's last few percent and its overshoot: the whole book scales about the cover's top-left
  g.translate(p.x, p.y)
  g.scale(p.s / GROW, p.s / GROW)
  g.translate(-SPINE, -LEAF.top)
  g.imageSmoothingEnabled = false
  const shown = tab ?? lastTab
  const n = counts(v)

  // the tabs stick out of the right leaf's fore-edge, the open one pulled out furthest
  TABS.forEach((t, i) => {
    const r = sideTab(i)
    const on = t.id === shown
    const lit = settled && hit({ ...r, w: r.w + 6 }, () => openDrawer(t.id))
    const pull = on ? 6 : lit ? 3 : 0
    blit(g, `drawer/book/tab/${t.id}`, r.x - (TAB.w - TAB.out) + pull, r.y)
    text(g, t.name, r.x + 4 + pull, r.y + 7, { bold: on, color: on ? BURGUNDY : INK })
    text(g, n[t.id], r.x + 4 + pull, r.y + 19, { font: 'tiny', color: INK })
    text(g, t.key, r.x + 4 + pull, r.y + 28, { font: 'tiny', color: FADED })
  })
  blit(g, 'drawer/leaf/right', SPINE, LEAF.top)
  // shut, the cover lies on the right leaf. it turns on the spine and comes down as the left leaf
  g.save()
  g.translate(SPINE, 0)
  if (swing.at < 0) {
    g.scale(Math.max(0.01, -swing.at), 1)
    g.translate(-SPINE, 0)
    blit(g, 'drawer/book/big', SPINE, LEAF.top)
  } else {
    g.scale(Math.max(0.01, swing.at), 1)
    g.translate(-SPINE, 0)
    blit(g, 'drawer/leaf/left', SPINE - LEAF.w, LEAF.top)
  }
  g.restore()
  // gutter shadow
  g.fillStyle = 'rgba(28,21,19,0.35)'
  g.fillRect(SPINE - 3, LEAF.top + 6, 6, LEAF.h - 12)
  if (swing.at > 0.5) {
    // pages only register clicks once the book has settled
    const keep = hits.length
    page(g, v, shown)
    if (!settled) hits.length = keep
  }
  const turn=(lastMs-pageTurnAt)/210
  if (turn>=0 && turn<1 && !still.matches) {
    g.save()
    g.translate(SPINE,LEAF.top+6)
    const fold=Math.cos(Math.PI*turn)
    g.scale(fold,1)
    g.fillStyle=fold>0?PAPER:TAN
    g.fillRect(0,0,LEAF.w-9,LEAF.h-14)
    g.fillStyle=CREAM
    g.beginPath();g.moveTo(LEAF.w-32,0);g.lineTo(LEAF.w-9,turn<.5?18:32);g.lineTo(LEAF.w-9,0);g.fill()
    g.restore()
  }
  // close tag, top right
  if (swing.at > 0.5) {
    const close = { x: SPINE + LEAF.w - 54, y: LEAF.top - 18, w: 54, h: 18 }
    const lit = settled && hit(close, () => { tab = null })
    box(g, close.x, close.y + (lit ? 0 : 2), close.w, close.h + 2, lit ? CREAM : TAN)
    text(g, 'Esc ×', close.x + close.w / 2, close.y + 5 + (lit ? 0 : 2), { align: 'center' })
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

// ---------- étui: la pile ----------

const MAX_PINS = 3
const byRank = (a: Card, b: Card) => b.rank - a.rank || b.tier - a.tier || a.id - b.id

function regroup(by: Grouping): void {
  if (by !== grouping) pageTurn()
  grouping = by
}

// a 4th pin pushes out the oldest
function togglePin(key: string): void {
  pins = pins.includes(key) ? pins.filter(k => k !== key) : [...pins, key].slice(-MAX_PINS)
}

// mid-round some of the deck is in your hand or played, so the pile is what's left to draw
const midRound = (v: SeatView) => hand(v).length > 0 || v.me.discard.length > 0
const wholeDeck = (v: SeatView) => [...deckCards(v), ...(v.me.shipping ? [v.me.shipping.card] : [])]

// draws la pile and wires it up: a card hovers its Fiche, a line's label pins it. ox = the dock's slide offset.
// returns the hovered card
function ledger(g: CanvasRenderingContext2D, v: SeatView, cards: Card[], at: Box, ghosts: Card[], ox = 0): Card | null {
  const found = drawPile(g, cards, at, { by: grouping, ghosts, hover: pileHover, pins, lit: [], away: v.me.shipping?.card.id ?? null, ms: lastMs })
  let card: Card | null = null
  for (const h of found) {
    const r = { x: h.x + ox, y: h.y, w: h.w, h: h.h }
    if (!h.card) hit(r, () => togglePin(h.key))
    else if (over(r)) {
      card = h.card
      setHover({ kind: 'card', card }, r)
    }
  }
  pileHover = card
  return card
}

// Rank · Suit · Type, right-aligned at x
function groupChips(g: CanvasRenderingContext2D, right: number, y: number): void {
  const widths = GROUPINGS.map(by => measure(by[0].toUpperCase() + by.slice(1), 'tiny') + 8)
  let x = right - widths.reduce((s, w) => s + w + 2, -2)
  GROUPINGS.forEach((by, i) => {
    chip(g, by[0].toUpperCase() + by.slice(1), x, y, grouping === by, () => regroup(by))
    x += widths[i] + 2
  })
}

// the pinned lines and the deck size, before → after when you'd add cards. returns the y under the last row
function pinRows(g: CanvasRenderingContext2D, base: Card[], adding: Card[], x: number, y: number, w: number): number {
  const after = [...base, ...adding]
  for (const key of pins) {
    drawPin(g, x, y + 2)
    text(g, lineName(key), x + 8, y)
    const a = lineTotal(base, key)
    const b = lineTotal(after, key)
    delta(g, a, b, x + w - deltaW(a, b), y)
    y += 11
  }
  if (!pins.length) {
    text(g, "Click a line's label to pin it.", x, y + 1, { font: 'tiny', color: FADED })
    y += 11
  }
  text(g, 'Deck size', x + 8, y, { color: FADED })
  delta(g, base.length, after.length, x + w - deltaW(base.length, after.length), y)
  return y + 11
}

const deltaW = (a: number, b: number) => (a === b ? measure(String(a), 'sans') : measure(String(a), 'sans') + 10 + measure(String(b), 'sans', true))

function etui(g: CanvasRenderingContext2D, v: SeatView): void {
  const mid = midRound(v)
  const all = wholeDeck(v)
  const pile = mid && !showAll
  const cards = pile ? v.me.pile : all
  text(g, pile ? `Left to draw · ${cards.length} of ${all.length}` : `Your deck · ${all.length} cards`, L.x, L.y, { font: 'tiny', color: FADED })
  const hover = ledger(g, v, cards, { x: L.x + 4, y: L.y + 12, w: L.w - 4, h: L.h - 12 }, [])

  // right leaf: grouping, pile or whole deck, the pins, the hovered card
  let y = R.y
  text(g, 'Group by', R.x, y + 2, { font: 'tiny', color: FADED })
  text(g, 'G', R.x + 40, y + 2, { font: 'tiny', color: TAN })
  groupChips(g, R.x + R.w, y)
  y += 16
  if (mid) {
    text(g, 'Show', R.x, y + 2, { font: 'tiny', color: FADED })
    let x = R.x + R.w - (measure(`Left to draw ${v.me.pile.length}`, 'tiny') + measure(`Whole deck ${all.length}`, 'tiny') + 19)
    x += chip(g, `Left to draw ${v.me.pile.length}`, x, y, !showAll, () => { showAll = false }) + 3
    chip(g, `Whole deck ${all.length}`, x, y, showAll, () => { showAll = true })
    y += 16
  }
  y += 2
  text(g, 'Pinned', R.x, y, { font: 'tiny', color: FADED })
  y = pinRows(g, all, [], R.x, y + 10, R.w)
  g.fillStyle = TAN
  g.fillRect(R.x, y + 2, R.w, 1)
  const away = v.me.shipping
  detail(g, hover, y + 8, hover && away && hover.id === away.card.id ? `Away at grading, back round ${away.back}` : '')
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

// an insert face (48×68), lifted on hover. returns true when hovered
function insertCard(g: CanvasRenderingContext2D, card: SleeveCard, x: number, y: number, rotate = 0): boolean {
  const r = { x, y, w: 48, h: 68 }
  const lit = over(r)
  g.save()
  g.translate(x, y - (lit ? 3 : 0))
  g.rotate(rotate)
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

// the switches moved to the pause menu: the foot of the rules page says where
function settings(g: CanvasRenderingContext2D, y: number): void {
  text(g, 'Volume, speed, language and the rest: Esc, the pause menu.', R.x, y + 2, { font: 'tiny', color: FADED })
}

const GLOSS_KIND: Record<Kind, string> = {
  card: 'card', finish: 'finish', stamp: 'stamp', knockoff: 'knockoff', trait: 'trait', tier: 'tier', variant: 'card type',
  joker: 'joker', bulk: 'card', collectible: 'collectible', insert: 'insert', pochette: 'pochette', twist: 'twist',
  rival: 'rival', keeper: 'la maison', hud: 'table', keyword: 'word', hand: 'hand',
}

function carnet(g: CanvasRenderingContext2D, v: SeatView): void {
  // the page switch sits on the right leaf's top
  let x = R.x + R.w
  for (const [id, label] of [['glossary', 'Glossary'], ['hands', 'Hands'], ['play', 'How to play']] as const) {
    const w = measure(label, 'tiny') + 8
    x -= w
    chip(g, label, x, R.y - 2, carnetPage === id, () => { carnetPage = id })
    x -= 3
  }
  if (carnetPage === 'play') {
    text(g, 'Comment ça marche', L.x, L.y - 2, { bold: true, color: BURGUNDY })
    playColumn(g, 0, L.x, L.y + 16, L.w, lastMs)
    playColumn(g, 1, R.x, R.y + 16, R.w, lastMs)
    settings(g, LEAF.top + LEAF.h - 22)
    return
  }
  if (carnetPage === 'hands') {
    text(g, 'Les mains', L.x, L.y - 2, { bold: true, color: BURGUNDY })
    handsColumn(g, v, L.x, L.y + 12, L.w, 22)
    text(g, 'How a hand works', R.x, R.y, { bold: true, color: BURGUNDY })
    howColumn(g, v, R.x, R.y + 18, R.w, 6)
    settings(g, LEAF.top + LEAF.h - 22)
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

// la pile docked beside a choice, on a scrap of carnet paper: the étui's tab on top, a tabac receipt clipped on with
// your pins, then the ledger with the offer pulsing into its lines
function drawDock(g: CanvasRenderingContext2D, v: SeatView): void {
  if (!compare && dock.at < 0.02) return
  const c = compare ?? { offers: [] }
  const ox = -(DOCK.w + 10) * (1 - dock.at)
  g.save()
  g.translate(ox, 0)
  const base = wholeDeck(v)
  // the draft has no deck yet: the rows you'd keep are it. otherwise offers pulse in, unless headed for the binder
  const draft = base.length === 0
  const cards = draft ? c.offers : base
  const binder = hoverDest === 'binder'
  const ghosts = binder ? [] : compareHover ? [compareHover] : draft ? [] : c.offers

  g.fillStyle = 'rgba(14,11,10,0.45)'
  g.fillRect(DOCK.x + 3, DOCK.y + 3, DOCK.w, DOCK.h)
  // the étui's index tab pokes out the top
  const tabX = DOCK.x + DOCK.w - 62
  box(g, tabX, DOCK.y - 10, 50, 14, RED)
  text(g, 'Étui · D', tabX + 25, DOCK.y - 7, { font: 'tiny', color: CREAM, align: 'center' })
  blit(g, 'drawer/dock', DOCK.x, DOCK.y)
  dockH = DOCK.h

  const ix = DOCK.x + 12
  const iw = DOCK.w - 24
  let y = DOCK.y + 9
  text(g, 'La Pile', ix, y, { bold: true, color: BURGUNDY })
  groupChips(g, ix + iw, y - 1)
  y += 15

  // the receipt: pins and deck size
  const rows = Math.max(1, pins.length) + 1 + (binder ? 1 : 0)
  const rh = 6 + rows * 11
  receipt(g, ix - 3, y, iw + 6, rh)
  let ry = pinRows(g, cards, ghosts, ix + 2, y + 4, iw - 4)
  if (binder) text(g, 'To the binder: not in your deck', ix + 2, ry, { font: 'tiny', color: FADED })
  if (binder && compareHover && stonksOf(v, compareHover) > 1) text(g, `STONKS ×${stonksOf(v, compareHover)}`, ix + iw - 2, ry, { font: 'tiny', color: '#3a8040', align: 'right' })
  y += rh + 8

  ledger(g, v, cards, { x: ix + 2, y, w: iw - 2, h: DOCK.y + DOCK.h - 10 - y }, ghosts, ox)
  g.restore()
}

// a cream tabac receipt with a torn bottom edge and a brass paper clip
function receipt(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = 'rgba(14,11,10,0.25)'
  g.fillRect(x + 2, y + 2, w, h)
  g.fillStyle = CREAM
  g.fillRect(x, y, w, h)
  // torn: a zigzag of 1-3px teeth
  for (let i = 0; i < w; i++) {
    const tooth = [0, 1, 2, 1][i % 4]
    g.fillRect(x + i, y + h, 1, tooth)
  }
  g.fillStyle = TAN
  g.fillRect(x, y, w, 1)
  g.fillRect(x, y, 1, h)
  g.fillRect(x + w - 1, y, 1, h)
  // the clip
  const cx = x + w - 14
  g.fillStyle = '#6b4a1a'
  g.fillRect(cx, y - 4, 1, 10)
  g.fillRect(cx + 4, y - 4, 1, 12)
  g.fillRect(cx, y - 4, 5, 1)
  g.fillRect(cx + 2, y - 2, 1, 7)
  g.fillRect(cx + 2, y + 5, 3, 1)
  g.fillStyle = BRASS
  g.fillRect(cx + 1, y - 3, 3, 1)
}
