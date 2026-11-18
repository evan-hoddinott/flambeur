// the Fiche (docs/UX.md §6): the one description box every rules thing uses. cream paper, ink border,
// a didone name, a chalk type pill, rule lines in the §6 markup, a flavor line and a footer.
// call fiche(entry, anchor) every frame something is hovered and drawFiche(g) last
import type { Entry, Kind } from '../engine/glossary.ts'
import { sprite, tinted, specialInk, tierInk } from './art.ts'
import { drawText, measure, wrapText, richText, richSize, plainText } from './font.ts'

type Rect = { x: number; y: number; w: number; h: number }
export type Side = 'right' | 'left' | 'above' | 'below'
type Shown = { e: Entry; key: string; anchor: Rect; side: Side }

const W = 640
const H = 360
const BODY_W = 150 // rule text wraps here
const SUB_W = 112 // keyword sub-boxes are narrower
const PAD = 6
const GAP = 4 // anchor to box
const DELAY = 120
const GRACE = 150 // hid this recently: the next one shows with no delay, so sliding along the hand doesn't stutter
const HOLD = 400
const INK = '#2e2320'
const OUTLINE = '#1c1513'
const RULE = '#bfa77e'
const FLAVOR = '#8c7656'
const FOOT = '#5c4a36'
const BRASS = '#c99a3a'

const PILL: Record<Kind, string> = {
  card: 'CARTE', finish: 'CARTE', stamp: 'CARTE', knockoff: 'CARTE', trait: 'CARTE', tier: 'CARTE', variant: 'CARTE',
  joker: 'CARTE', bulk: 'CARTE', collectible: 'BIBELOT', insert: 'INSERT', pochette: 'POCHETTE', twist: 'TWIST',
  rival: 'RIVAL', keeper: 'PATRON', hud: 'HUD', keyword: 'MOT', hand: 'MAIN',
}
const CARD_KINDS = new Set<Kind>(['card', 'finish', 'stamp', 'knockoff', 'trait', 'tier', 'variant', 'joker', 'bulk'])

// a card line starts with its modifier's name. that name picks the square's color, same inks as the card art
const LINE_INK: [string, string][] = ([
  ['Chase', specialInk.chase], ['Sticker', specialInk.sticker], ['Rookie', specialInk.rookie], ['Jumbo', specialInk.jumbo],
  ['Crayon Joker', specialInk.crayon], ['Joker', specialInk.joker], ['Sticky Fingers', specialInk.joker], ['Double or Nothing', specialInk.joker],
  ['Courtier', specialInk.joker], ['Catalyst', specialInk.joker], ['Poker Face', specialInk.joker], ["Rival's Card", specialInk.joker],
  ['Bulk', specialInk.bulk], ['Gold foil', specialInk.foil], ['Foil', specialInk.foil], ['Holographic', specialInk.holo], ['Holo', specialInk.holo],
  ['Embers', specialInk.prism], ['Prism', specialInk.prism], ['Misprint', specialInk.misprint], ['1st Edition', specialInk.first],
  ['Signed', specialInk.signed], ['Gold Border', specialInk.gold], ['Damaged', specialInk.damaged], ['Crayon', specialInk.crayon],
  ['Marked', specialInk.marked], ['Wrong Suit', specialInk.wrongsuit], ['Beer-stained', specialInk.beer],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length)

function lineInk(line: string): string {
  const s = plainText(line).trim()
  const stars = s.match(/^★+/)
  if (stars) return tierInk[Math.min(3, stars[0].length)]
  const hit = LINE_INK.find(([name]) => s.toLowerCase().startsWith(name.toLowerCase()))
  return hit ? hit[1] : BRASS
}

// ---------- the pin ----------


// ---------- layout ----------

// a box is a stack of rows, measured once and drawn top down
type Row = { h: number; w: number; draw: (g: CanvasRenderingContext2D, x: number, y: number, w: number) => void }

function rows(e: Entry, sub: boolean): Row[] {
  const out: Row[] = []
  const bodyW = sub ? SUB_W : BODY_W
  const ink = CARD_KINDS.has(e.kind) && !sub
  if (sub) {
    const w = measure(e.name, 'sans', true)
    out.push({ h: 12, w, draw: (g, x, y) => drawText(g, e.name, x, y, { color: INK, bold: true }) })
  } else {
    const nameW = measure(e.name, 'didone')
    const pill = PILL[e.kind]
    const pillW = measure(pill, 'chalk') + 6
    const tagW = e.tag ? tagWidth(e.tag) : 0
    out.push({ h: 19, w: nameW, draw: (g, x, y) => drawText(g, e.name, x, y - 2, { font: 'didone', color: INK }) })
    out.push({
      h: 16, w: pillW + (tagW ? tagW + 8 : 0),
      draw: (g, x, y, w) => {
        g.fillStyle = INK
        g.fillRect(x, y + 1, pillW, 12)
        g.fillRect(x - 1, y + 2, pillW + 2, 10)
        drawText(g, pill, x + 3, y, { font: 'chalk', color: '#e3d2a8' })
        if (e.tag) drawTag(g, e.tag, x + w, y + 1)
      },
    })
  }
  for (const line of e.text) {
    const indent = ink ? 10 : 0
    const size = richSize(line, bodyW - indent)
    out.push({
      h: size.h, w: size.w + indent,
      draw: (g, x, y) => {
        if (ink) {
          g.fillStyle = OUTLINE
          g.fillRect(x, y + 2, 7, 7)
          g.fillStyle = lineInk(line)
          g.fillRect(x + 1, y + 3, 5, 5)
        }
        richText(g, line, x + indent, y, bodyW - indent)
      },
    })
  }
  if (e.flavor) {
    const lines = wrapText(e.flavor, bodyW, 'tiny')
    out.push({
      h: 3 + lines.length * 8, w: Math.max(...lines.map(l => measure(l, 'tiny'))),
      draw: (g, x, y) => lines.forEach((l, i) => drawText(g, l, x, y + 3 + i * 8, { font: 'tiny', color: FLAVOR })),
    })
  }
  if (e.foot) {
    const size = richSize(e.foot, bodyW)
    out.push({
      h: 5 + size.h, w: size.w,
      draw: (g, x, y, w) => {
        g.fillStyle = RULE
        g.fillRect(x, y + 3, w, 1)
        richText(g, e.foot!, x, y + 5, bodyW, { color: FOOT })
      },
    })
  }
  return out
}

// ★★ draws as the card's own tier stars, anything else (a rarity, a table) as small caps
function tagWidth(tag: string): number {
  return /^★+$/.test(tag) ? tag.length * 9 - 1 : measure(tag, 'tiny')
}

function drawTag(g: CanvasRenderingContext2D, tag: string, right: number, y: number): void {
  if (!/^★+$/.test(tag)) return drawText(g, tag, right, y + 2, { font: 'tiny', color: '#7a1a2c', align: 'right' })
  const star = sprite('tier/star')
  for (let i = 0; i < tag.length; i++) {
    const x = right - (tag.length - i) * 9 + 1
    g.drawImage(star.img, star.x, star.y, star.w, star.h, x, y + Math.round((10 - star.h) / 2), star.w, star.h)
  }
}

function boxSize(r: Row[], sub: boolean): { w: number; h: number } {
  const inner = Math.max(sub ? 40 : 84, ...r.map(row => row.w))
  return { w: inner + PAD * 2, h: r.reduce((s, row) => s + row.h, 0) + (sub ? 8 : 10) }
}

// the paper: a hard shadow, a 1px ink border from the paper's own silhouette, then the paper
function paper(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.save()
  g.globalAlpha = 0.45
  nine(g, 'hud/plate/paper', x + 2, y + 2, w, h, OUTLINE)
  g.restore()
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) nine(g, 'hud/plate/paper', x + dx, y + dy, w, h, OUTLINE)
  nine(g, 'hud/plate/paper', x, y, w, h)
}

// corners native, edges and middle stretch. the same as duel.ts's nine, on any context
function nine(g: CanvasRenderingContext2D, name: string, x: number, y: number, w: number, h: number, tint?: string): void {
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
      g.drawImage(img, ox + sx[c], oy + sy[r], sw, sh, Math.round(x) + dx[c], Math.round(y) + dy[r], tw, th)
    }
  }
}

function drawBox(g: CanvasRenderingContext2D, r: Row[], x: number, y: number, w: number, h: number, sub: boolean): void {
  paper(g, x, y, w, h)
  let top = y + (sub ? 3 : 4)
  for (const row of r) {
    row.draw(g, x + PAD, top, w - PAD * 2)
    top += row.h
  }
}

// ---------- keywords ----------

let keywords: Record<string, string> = {}

// until glossary.ts exports KEYWORDS, the integrator hands them in here
export function setKeywords(k: Record<string, string>): void {
  keywords = k
}

// every [Keyword] in the entry, in order, no repeats, max 3
function keywordsIn(e: Entry): string[] {
  const found: string[] = []
  for (const line of [...e.text, e.foot ?? '']) {
    for (const m of line.matchAll(/\[([^\]]+)\]/g)) if (!found.includes(m[1])) found.push(m[1])
  }
  return found.slice(0, 3)
}

function keywordEntry(term: string): Entry {
  const line = keywords[term] ?? Object.entries(keywords).find(([k]) => k.toLowerCase() === term.toLowerCase())?.[1]
  if (line === undefined) throw new Error(`no keyword line for [${term}]`)
  return { name: term, kind: 'keyword', text: [line] }
}

// ---------- placement + paint ----------

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// right of the anchor, top-aligned, by default. left: the mirror. above / below: centered over or under it.
// each flips to the opposite side when it doesn't fit, and never goes off-stage
function place(w: number, h: number, a: Rect, side: Side): { x: number; y: number; right: boolean } {
  if (side === 'above' || side === 'below') {
    let y = side === 'below' ? a.y + a.h + GAP : a.y - GAP - h
    if (side === 'below' && y + h > H - 2) y = a.y - GAP - h
    if (side === 'above' && y < 2) y = a.y + a.h + GAP
    return { x: clamp(Math.round(a.x + a.w / 2 - w / 2), 2, W - 2 - w), y: clamp(Math.round(y), 2, H - 2 - h), right: true }
  }
  const rightX = a.x + a.w + GAP
  const leftX = a.x - GAP - w
  const right = side === 'right' ? rightX + w <= W - 2 : leftX < 2
  return { x: clamp(Math.round(right ? rightX : leftX), 2, W - 2 - w), y: clamp(Math.round(a.y), 2, H - 2 - h), right }
}

const still = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

// draws a fiche next to the anchor right now, no hover timing
function paintFiche(g: CanvasRenderingContext2D, e: Entry, anchor: Rect, o: { age?: number; pinned?: boolean; side?: Side } = {}): void {
  const r = rows(e, false)
  const size = boxSize(r, false)
  const side = o.side ?? 'right'
  const at = place(size.w, size.h, anchor, side)
  // a 3px drop as it lands, like paper slapped on the table
  const age = o.age ?? Infinity
  const drop = still?.matches || age >= 90 ? 0 : Math.round(3 * (1 - age / 90) ** 2)
  drawBox(g, r, at.x, at.y - drop, size.w, size.h, false)
  if (o.pinned) {
    const pin = sprite('fiche/pin')
    g.drawImage(pin.img, pin.x, pin.y, pin.w, pin.h, at.x + Math.round(size.w / 2) - pin.px, at.y - drop + 4 - pin.py, pin.w, pin.h)
  }
  // keyword sub-boxes stack on the far side from the anchor
  const subs = keywordsIn(e).map(keywordEntry).map(k => {
    const sr = rows(k, true)
    return { r: sr, ...boxSize(sr, true) }
  })
  if (!subs.length) return
  const sw = Math.max(...subs.map(s => s.w))
  const total = subs.reduce((s, b) => s + b.h + 3, -3)
  let sx = at.right ? at.x + size.w + 3 : at.x - 3 - sw
  if (sx < 2 || sx + sw > W - 2) sx = side === 'above' || side === 'below' ? at.x - 3 - sw : at.right ? anchor.x - GAP - sw : anchor.x + anchor.w + GAP // no room: the other side
  sx = clamp(sx, 2, W - 2 - sw)
  let sy = clamp(at.y - drop, 2, H - 2 - total)
  for (const s of subs) {
    drawBox(g, s.r, at.right ? sx : sx + sw - s.w, sy, s.w, s.h, true)
    sy += s.h + 3
  }
}

// ---------- the per-frame hover + pin ----------

let want: Shown | null = null // this frame's fiche() call
let shown: Shown | null = null
let shownAt = 0
let hiddenAt = -Infinity
let waiting: { key: string; since: number } | null = null
let lastKey = '' // the last entry shown: hovering it again is instant
let pinned: Shown | null = null
let pinnedAt = 0
let touch = false // the last pointer was a finger

function ficheKey(e: Entry): string {
  return [e.kind, e.name, e.tag ?? '', ...e.text, e.flavor ?? '', e.foot ?? ''].join('|')
}

// canvas: the hover box for this frame. call it every frame while the thing is hovered
// o.side: where it sits, 'right' by default. 'above' is for the hand fan, 'below' hangs it under its anchor.
// o.above is the old spelling of side: 'above'
export function fiche(e: Entry, anchor: Rect, o: { above?: boolean; side?: Side } = {}): void {
  want = { e, key: ficheKey(e), anchor, side: o.side ?? (o.above ? 'above' : 'right') }
}

// pins whatever is showing (a brass pin). a new pin replaces the old one
export function pinFiche(): void {
  if (!shown) return
  pinned = shown
  pinnedAt = performance.now()
}

export function clearFiche(): void {
  pinned = null
  shown = null
  waiting = null
}

// called last each frame, in stage units. a frame with no fiche() call and no pin draws nothing
export function drawFiche(g: CanvasRenderingContext2D): void {
  const t = performance.now()
  if (!want) {
    if (shown) hiddenAt = t
    shown = null
    waiting = null
  } else if (shown?.key === want.key) shown = want
  else if (shown || touch || want.key === lastKey || t - hiddenAt < GRACE) {
    shown = want
    shownAt = t
  } else if (waiting?.key !== want.key) waiting = { key: want.key, since: t }
  else if (t - waiting.since >= DELAY) {
    shown = want
    shownAt = t
    waiting = null
  }
  want = null
  if (shown) lastKey = shown.key
  if (pinned) paintFiche(g, pinned.e, pinned.anchor, { age: t - pinnedAt, pinned: true, side: pinned.side })
  if (shown && shown.key !== pinned?.key) paintFiche(g, shown.e, shown.anchor, { age: t - shownAt, side: shown.side })
}

// the scene's one call: right-click pins, a 400 ms hold pins (and eats the click it ends with), Esc clears.
// returns a detach for when the canvas goes away
export function ficheInput(cv: HTMLCanvasElement, toStage: (e: MouseEvent) => { x: number; y: number }): () => void {
  let hold: { timer: number; x: number; y: number } | null = null
  let held = false
  const cancel = () => {
    if (hold) clearTimeout(hold.timer)
    hold = null
  }
  const menu = (e: MouseEvent) => {
    e.preventDefault()
    if (shown) pinFiche()
    else clearFiche()
  }
  const down = (e: PointerEvent) => {
    touch = e.pointerType === 'touch'
    if (e.button !== 0) return
    cancel()
    held = false
    const p = toStage(e)
    hold = { x: p.x, y: p.y, timer: window.setTimeout(() => {
      hold = null
      if (!shown) return
      pinFiche()
      held = true
    }, HOLD) }
  }
  const move = (e: PointerEvent) => {
    if (!hold) return
    const p = toStage(e)
    if (Math.abs(p.x - hold.x) + Math.abs(p.y - hold.y) > 4) cancel()
  }
  // capture, so it runs before the scene's onclick
  const click = (e: MouseEvent) => {
    if (!held) return
    held = false
    e.stopImmediatePropagation()
    e.preventDefault()
  }
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (pinned || shown)) clearFiche()
  }
  cv.addEventListener('contextmenu', menu)
  cv.addEventListener('pointerdown', down)
  cv.addEventListener('pointermove', move)
  cv.addEventListener('pointerup', cancel)
  cv.addEventListener('pointercancel', cancel)
  cv.addEventListener('pointerleave', cancel)
  cv.addEventListener('click', click, true)
  window.addEventListener('keydown', key)
  return () => {
    cancel()
    cv.removeEventListener('contextmenu', menu)
    cv.removeEventListener('pointerdown', down)
    cv.removeEventListener('pointermove', move)
    cv.removeEventListener('pointerup', cancel)
    cv.removeEventListener('pointercancel', cancel)
    cv.removeEventListener('pointerleave', cancel)
    cv.removeEventListener('click', click, true)
    window.removeEventListener('keydown', key)
  }
}
