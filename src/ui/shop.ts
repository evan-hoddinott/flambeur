// the tabac: first person at the counter, the buraliste behind it, the offers on a glass shelf under him.
// layout is the art proof's (art/shop/counter.py), in 640x360 stage units. spec: docs/SHOP.md.
// main.ts owns the game, this file only draws a ShopState and reports clicks back through it
import { sprite, tinted, ctx2d, backCanvas } from './art.ts'
import { drawText, measure, wrapText, type TextStyle } from './font.ts'
import { describe, getDef } from '../engine/collectibles.ts'
import { rankLabel, SUIT_GLYPH } from '../engine/cards.ts'
import { getKeeper } from '../engine/shop.ts'
import { getSleeve, type Stonks } from '../engine/sleeves.ts'
import { tableOf } from '../engine/economy.ts'
import { twistName } from '../engine/twists.ts'
import type { SeatView, ShopOfferView } from '../engine/match.ts'
import * as sfx from './sound.ts'

export type ShopState = {
  view: SeatView
  toast: string // the latest shop message (back from grading, scratched...), '' for none
  clock: () => string // online shop timer, '' offline. read every frame
  canBuy: (slot: number) => boolean
  canRestock: boolean
  canBinBulk: boolean
  canGrade: boolean
  onBuy: (slot: number) => void
  onRestock: () => void
  onBinBulk: () => void
  onGrading: () => void
  onBinder: () => void
  onVitrine: () => void
  onPile: () => void
  onLeave: () => void
}

const W = 640
const H = 360
const BUR = { x: 220, y: 0 } // the buraliste canvas origin
const SLOT = { w: 72, h: 104, top: 186 }
const INK = '#1c1513'
const INK0 = '#0e0b0a'
const CREAM = '#f6ecd2'
const PAPER = '#e3d2a8'
const TAN = '#8c7656'
const MONEY = '#3a8040'
const BLUE = '#3e66a0'
const BRASS = '#c99a3a'
const GREY = '#43342e'

// one line per offer, shown when you hover it (complexity rule: it explains itself where you see it)
const PACK_LINE: Record<string, [string, string]> = {
  free: ['Free pack', '3 plain cards, one per shop'],
  offbrand: ['Off-Brand', '5 cards: stamps and knockoffs'],
  repack: ['Repack', '4 cards: flambéed, Jumbos, Rookies, Jokers'],
  collector: ['Collector', '3 cards, a code card and a rare slot'],
}

let cv: HTMLCanvasElement | null = null
let g: CanvasRenderingContext2D
let k = 1
let ox = 0
let oy = 0
let state: ShopState | null = null
let running = false
let now = 0
let mouse = { x: -1, y: -1 }
let lastInput = 0 // for "Alors ?" after a long browse
type Hit = { x: number; y: number; w: number; h: number; onClick: () => void }
let hits: Hit[] = []
let bubble: { text: string; t: number } | null = null
let enteredRound = -1
let stockKey = '' // round:restocks. a change deals the row in again
let stockAt = 0
let bellAt = -9999
let sighAt = -9999
let pressed: { key: string; t: number } | null = null

export function showShop(app: HTMLElement, next: ShopState): void {
  state = next
  if (!cv || !cv.isConnected) {
    app.innerHTML = ''
    cv = document.createElement('canvas')
    cv.className = 'stage'
    app.appendChild(cv)
    g = ctx2d(cv)
    cv.onpointermove = e => {
      mouse = toStage(e)
      lastInput = now
    }
    cv.onpointerleave = () => { mouse = { x: -1, y: -1 } }
    cv.onclick = e => click(toStage(e))
    resize()
  }
  const v = next.view
  if (enteredRound !== v.round) {
    enteredRound = v.round
    lastInput = now
    keeperSays('Bonjour.')
  }
  const key = `${v.round}:${v.me.shop?.restockPrice}:${v.me.shop?.offers.map(o => o.type).join()}`
  if (key !== stockKey) {
    stockKey = key
    stockAt = now
  }
  if (!running) {
    running = true
    requestAnimationFrame(frame)
  }
}

// his speech bubble. flavor only, rules never go in here
export function keeperSays(text: string): void {
  bubble = { text, t: now }
}

// the desk bell dings and wobbles. main calls it on a restock
export function ringBell(): void {
  bellAt = now
  sfx.bell()
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
  lastInput = now
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]
    if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return h.onClick()
  }
}

function frame(t: number): void {
  if (!cv || !cv.isConnected || !state) {
    running = false
    return
  }
  now = t
  hits = []
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = INK0
  g.fillRect(0, 0, cv.width, cv.height)
  g.setTransform(k, 0, 0, k, ox, oy)
  g.save()
  g.beginPath()
  g.rect(0, 0, W, H)
  g.clip()
  draw(state)
  g.restore()
  cv.style.cursor = over() ? 'pointer' : 'default'
  requestAnimationFrame(frame)
}

function over(): boolean {
  return hits.some(h => mouse.x >= h.x && mouse.x <= h.x + h.w && mouse.y >= h.y && mouse.y <= h.y + h.h)
}

// ---------- drawing helpers ----------

function pin(name: string, x: number, y: number, r = 0): void {
  const s = sprite(name)
  g.save()
  g.translate(x, y)
  if (r) g.rotate(r)
  g.drawImage(s.img, s.x, s.y, s.w, s.h, -s.px, -s.py, s.w, s.h)
  g.restore()
}

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

function text(s: string, x: number, y: number, o: TextStyle = {}): void {
  drawText(g, s, x, y, o)
}

function hit(x: number, y: number, w: number, h: number, onClick: () => void): boolean {
  hits.push({ x, y, w, h, onClick })
  return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h
}

// a cream paper rectangle with a 1px ink outline
function paper(x: number, y: number, w: number, h: number, fill = CREAM): void {
  g.fillStyle = INK0
  g.fillRect(x - 1, y - 1, w + 2, h + 2)
  g.fillStyle = fill
  g.fillRect(x, y, w, h)
}

function glow(x: number, y: number, r: number, color: string): void {
  const grad = g.createRadialGradient(x, y, 0, x, y, r)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.save()
  g.globalCompositeOperation = 'lighter'
  g.fillStyle = grad
  g.fillRect(x - r, y - r, r * 2, r * 2)
  g.restore()
}

const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3

// ---------- the scene ----------

function draw(st: ShopState): void {
  const v = st.view
  const shop = v.me.shop
  if (!shop) throw new Error('shop scene without a shop')
  room(st)
  buraliste()
  pin('shop/counter', 0, 150)
  pin('bur/front', BUR.x, BUR.y)
  bell(st)
  sign(v)
  roundNote(v)
  pin('shop/case', 0, 172)
  const hover = offers(st)
  pin('shop/glints', 0, 172)
  bottomBar(st)
  if (hover) hoverTag(hover.offer, hover.x)
  signTag(v)
  speech()
  toast(st.toast)
}

function room(st: ShopState): void {
  pin('shop/wall', 0, 0)
  pin('shop/window', 64, 10)
  pin('shop/diamond', 96, 22)
  glow(126, 42, 46, `rgba(208,74,78,${0.18 + 0.06 * Math.sin(now / 700)})`)
  // the vitrine tab, same as the duel: your collectibles, sell them from here
  const tab = sprite('hud/vitrine/tab')
  const overTab = hit(8, 0, tab.w, tab.h, st.onVitrine)
  pin('hud/vitrine/tab', 8, overTab ? 1 : 0)
  stonks(st.view.stonks, st.view.stonksNext)
  const clock = st.clock()
  if (clock) {
    pin('shop/clock', 452, 14)
    text(clock, 469, 50, { align: 'center', color: CREAM, outline: INK0 })
  }
  pin('shop/lottery', 432, 94)
  pin('shop/register', 528, 94)
}

// "cote du jour": the hot rank, suit or finish, chalked up. code writes the chalk
function stonks(hot: Stonks, next: Stonks | null): void {
  const x = 508
  const y = 12
  pin('shop/stonks', x, y)
  text('Cote du jour', x + 62, y + 8, { font: 'chalk', color: PAPER, align: 'center' })
  const [big, mult] = stonksBig(hot)
  if (big.length <= 2) text(big, x + 40, y + 28, { color: CREAM, scale: 3, align: 'center' })
  else text(big, x + 40, y + 34, { font: 'chalk', color: CREAM, align: 'center' })
  text(mult, x + 68, y + 34, { font: 'chalk', color: '#e8c260' })
  text('se vend', x + 68, y + 47, { font: 'chalk', color: '#bfa77e' })
  if (next) text(`Demain : ${stonksBig(next)[0]}`, x + 62, y + 70, { color: '#bfa77e', align: 'center' })
}

function stonksBig(s: Stonks): [string, string] {
  if (s.kind === 'rank') return [rankLabel(s.rank), '×3']
  if (s.kind === 'suit') return [SUIT_GLYPH[s.suit], '×3']
  return [s.finish, '×2']
}

// idle: reads, glances at you, sighs after a long browse. a 1px breath
function buraliste(): void {
  const idle = now - lastInput
  if (idle > 20000 && now - sighAt > 20000) {
    sighAt = now
    keeperSays('Alors ?')
  }
  const sighing = now - sighAt < 1400
  const talking = bubble !== null && now - bubble.t < 600
  const glance = sighing ? false : talking || (now % 7000) > 5600
  const breath = Math.round((Math.sin(now / 900) + 1) / 2)
  const y = BUR.y + breath
  pin('bur/body', BUR.x, y)
  pin(`bur/eyes/${sighing ? 'shut' : glance ? 'you' : 'down'}`, BUR.x, y)
  pin('bur/brows/grump', BUR.x, y)
  pin(`bur/stache/${sighing ? 'puff' : 'grump'}`, BUR.x, y)
  pin('bur/cig', BUR.x, y)
  // the ember breathes too
  g.fillStyle = (now % 900) < 450 ? '#ffb03a' : '#e8501a'
  g.fillRect(BUR.x + 126, y + 98, 2, 2)
}

function bell(st: ShopState): void {
  const age = now - bellAt
  const wobble = age < 500 ? Math.sin(age / 30) * 0.25 * (1 - age / 500) : 0
  const overBell = st.canRestock && hit(192, 134, 24, 18, st.onRestock)
  pin('shop/bell', 204, 153 - (overBell ? 1 : 0), wobble)
}

function sign(v: SeatView): void {
  pin('shop/sign', 530, 120)
  v.keeper.forEach((id, i) => text(`· ${getKeeper(id).name}`, 536, 136 + i * 11, { color: INK }))
}

// hovering the sign shows each trait's rule
function signTag(v: SeatView): void {
  if (!(mouse.x >= 530 && mouse.x <= 628 && mouse.y >= 120 && mouse.y <= 174)) return
  const lines = v.keeper.map(id => `${getKeeper(id).name}: ${getKeeper(id).text}`)
  const w = Math.max(...lines.map(l => measure(l, 'sans'))) + 12
  const x = 634 - w
  paper(x, 178, w, lines.length * 12 + 6)
  lines.forEach((l, i) => text(l, x + 6, 181 + i * 12, { color: INK }))
}

// round and the next tournament twist, pinned under the window. the shop before a boss is prep
function roundNote(v: SeatView): void {
  paper(8, 122, 176, 24, PAPER)
  text(`Manche ${v.round} · Table ${tableOf(v.round)}`, 14, 124, { color: INK })
  const t = v.nextTwist
  if (t) text(`${t.round === v.round ? 'Ce soir' : `Manche ${t.round}`} : ${twistName(t.twist)}`, 14, 135, { color: '#7a1a2c' })
}

function slotX(i: number): number {
  // groups: packs · collectibles · scratchers · sleeve, a 6px gap between each group
  return 9 + i * 76 + ((i > 2 ? 1 : 0) + (i > 4 ? 1 : 0) + (i > 6 ? 1 : 0)) * 6
}

function slotOrder(offers: ShopOfferView[]): number[] {
  const rank = (o: ShopOfferView) => ({ pack: 0, collectible: 1, scratcher: 2, sleeve: 3 })[o.type]
  return offers.map((_, i) => i).sort((a, b) => rank(offers[a]) - rank(offers[b]) || a - b)
}

function offers(st: ShopState): { offer: ShopOfferView; x: number } | null {
  const list = st.view.me.shop!.offers
  let hovered: { offer: ShopOfferView; x: number } | null = null
  slotOrder(list).forEach((slot, i) => {
    const o = list[slot]
    // a fresh stock deals in from the right, left to right
    const deal = ease((now - stockAt - i * 45) / 260)
    const x = slotX(i) + (1 - deal) * 700
    if (o.sold) {
      pin('shop/vendu', x + 8, SLOT.top + 40)
      return
    }
    const ok = st.canBuy(slot)
    const isOver = hit(x, SLOT.top, SLOT.w, SLOT.h + 20, () => {
      if (!ok) return
      pressed = { key: `o${slot}`, t: now }
      st.onBuy(slot)
    })
    if (isOver) hovered = { offer: o, x }
    const lift = isOver ? 5 : 0
    pin(offerSprite(o), x, SLOT.top - lift)
    if (o.type === 'collectible') {
      // the plaque is 52 wide: wrap the name, and a word that still doesn't fit drops to the tiny font
      const lines = wrapText(getDef(o.owned.id).name, 52, 'sans').slice(0, 3)
      lines.forEach((w, j) => {
        const font = measure(w, 'sans') > 52 ? 'tiny' : 'sans'
        text(w, x + 36, SLOT.top - lift + 48 + j * 11 + (font === 'tiny' ? 2 : 0), { font, color: INK, align: 'center' })
      })
    }
    priceTag(o.price, x + 16, 295, ok)
  })
  return hovered
}

function offerSprite(o: ShopOfferView): string {
  if (o.type === 'pack') return `shop/pack/${o.kind}`
  if (o.type === 'collectible') return `shop/easel/${getDef(o.owned.id).rarity}`
  if (o.type === 'scratcher') return 'shop/scratcher'
  return 'shop/sleeve'
}

function priceTag(price: number, x: number, y: number, ok: boolean): void {
  const s = price ? `$${price}` : 'Free'
  const w = Math.max(40, measure(s, 'sans') + 16)
  g.fillStyle = INK0
  g.beginPath()
  g.moveTo(x - 1, y + 6)
  g.lineTo(x + 4, y - 1)
  g.lineTo(x + w + 1, y - 1)
  g.lineTo(x + w + 1, y + 14)
  g.lineTo(x + 4, y + 14)
  g.closePath()
  g.fill()
  g.fillStyle = ok ? CREAM : '#bfa77e'
  g.beginPath()
  g.moveTo(x, y + 6)
  g.lineTo(x + 4, y)
  g.lineTo(x + w, y)
  g.lineTo(x + w, y + 13)
  g.lineTo(x + 4, y + 13)
  g.closePath()
  g.fill()
  text(s, x + (w + 4) / 2, y + 2, { color: ok ? MONEY : TAN, align: 'center' })
}

function hoverTag(o: ShopOfferView, x: number): void {
  const [name, line] = offerLines(o)
  const head = `${name} · ${o.price ? `$${o.price}` : 'free'}`
  const w = Math.max(measure(head, 'sans'), measure(line, 'sans')) + 12
  const tx = Math.min(Math.max(4, x), W - w - 4)
  paper(tx, SLOT.top + SLOT.h - 2, w, 26)
  text(head, tx + 6, SLOT.top + SLOT.h, { color: INK })
  text(line, tx + 6, SLOT.top + SLOT.h + 12, { color: '#5c4a36' })
}

function offerLines(o: ShopOfferView): [string, string] {
  if (o.type === 'pack') return PACK_LINE[o.kind]
  if (o.type === 'collectible') return [getDef(o.owned.id).name, describe(o.owned)]
  if (o.type === 'scratcher') return ['Scratcher', 'A random insert: Code, Checklist, Wishlist or Grail']
  const sl = getSleeve(o.id)
  return [`Sleeve · ${sl.name}`, `For the rest of the run: ${sl.text}`]
}

// ---------- bottom bar: plate, deck, tickets, binder, sortir ----------

type Ticket = { key: string; label: string; price?: string; face: string; plinth: string; ink: string; enabled: boolean; primary?: boolean; onClick: () => void }

function bottomBar(st: ShopState): void {
  const v = st.view
  const shop = v.me.shop!
  // your plate: your bankroll in blue
  paper(6, 324, 96, 30, BRASS)
  g.fillStyle = CREAM
  g.fillRect(9, 327, 90, 24)
  text('Vous', 14, 333, { color: INK })
  text(`$${v.me.bankroll}`, 94, 330, { color: BLUE, scale: 2, align: 'right' })
  // deck pile: click for the deck viewer
  const back = backCanvas(v.me.starter)
  const overPile = hit(110, 318, 34, 40, st.onPile)
  const n = Math.min(6, Math.ceil((v.me.pile.length + v.me.discard.length) / 5))
  for (let i = 0; i < n; i++) {
    g.fillStyle = INK0
    g.fillRect(113 - 1, 324 - i - (overPile ? 2 : 0) - 1, 30, 31)
    g.drawImage(back, 113, 324 - i - (overPile ? 2 : 0), 28, 29)
  }
  text(String(v.me.pile.length + v.me.discard.length), 127, 334 - n - (overPile ? 2 : 0), { color: CREAM, outline: INK0, align: 'center' })

  const grey = { face: GREY, plinth: INK0, ink: PAPER }
  const tickets: [number, number, Ticket][] = [
    [158, 104, { key: 'restock', label: 'Restock', price: shop.restockPrice ? `$${shop.restockPrice}` : 'free', ...grey, enabled: st.canRestock, onClick: st.onRestock }],
    [268, 104, { key: 'bulk', label: 'Bin Bulk', price: shop.bulkInDeck ? `$${shop.bulkPrice}` : 'none', ...grey, enabled: st.canBinBulk, onClick: st.onBinBulk }],
    [378, 96, { key: 'grade', label: 'Grading', price: '$2+', ...grey, enabled: st.canGrade, onClick: st.onGrading }],
    [538, 96, { key: 'leave', label: 'Sortir', face: BRASS, plinth: '#3d2a10', ink: INK, enabled: true, primary: true, onClick: st.onLeave }],
  ]
  for (const [x, w, t] of tickets) ticket(t, x, 326, w)
  // the binder: sell from here
  const overBinder = hit(480, 320, 52, 40, st.onBinder)
  pin('shop/binder', 480, 320 - (overBinder ? 2 : 0))
  text(String(v.me.binder.length), 509, 342 - (overBinder ? 2 : 0), { color: CREAM, align: 'center' })
}

const breath = () => 0.5 - 0.5 * Math.cos((now / 1200) * Math.PI * 2)

function ticket(t: Ticket, x: number, y: number, w: number): void {
  const isOver = t.enabled && hit(x, y - 4, w, 30, () => {
    pressed = { key: t.key, t: now }
    t.onClick()
  })
  g.save()
  g.translate(x, y)
  if (!t.enabled) {
    nine('hud/ticket/face', 0, 3, w, 24, GREY)
    text(t.label, 11, 8, { font: 'chalk', color: TAN, bold: true })
    if (t.price) text(t.price, w - 8, 9, { color: TAN, align: 'right' })
    g.fillStyle = TAN
    g.fillRect(8, 14, w - 14, 1)
    g.restore()
    return
  }
  if (t.primary && !isOver) {
    const s = 1 + 0.03 * breath()
    g.translate(w / 2, 13)
    g.scale(s, s)
    g.translate(-w / 2, -13)
    glow(w / 2, 14, 60, `rgba(232,194,96,${0.18 + 0.14 * breath()})`)
  }
  const down = pressed?.key === t.key && now - pressed.t < 90
  const fy = 3 - (down ? 0 : isOver ? 4 : 3)
  nine('hud/ticket/plinth', 0, 3, w, 24, t.plinth)
  if (isOver) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) nine('hud/ticket/plinth', dx, fy + dy, w, 24, CREAM)
  nine('hud/ticket/face', 0, fy, w, 24, t.face)
  g.fillStyle = 'rgba(255,255,255,0.3)'
  g.fillRect(1, fy + 1, w - 2, 1)
  text(t.label, 11, fy + 5, { font: 'chalk', color: t.ink, bold: true, outline: t.ink === INK ? undefined : INK0 })
  if (t.price) {
    const pw = measure(t.price, 'sans') + 8
    nine('hud/ticket/chip', w - pw - 5, fy + 5, pw, 13)
    text(t.price, w - 5 - pw / 2, fy + 6, { color: INK, align: 'center' })
  }
  g.restore()
}

// ---------- words ----------

function speech(): void {
  if (!bubble) return
  const age = now - bubble.t
  if (age > 2600) return
  const w = measure(bubble.text, 'sans') + 14
  const x = 330
  const y = 22 - Math.round(ease(age / 160) * 2)
  g.fillStyle = INK0
  g.fillRect(x - 1, y - 1, w + 2, 20)
  g.fillStyle = CREAM
  g.fillRect(x, y, w, 18)
  g.beginPath()
  g.moveTo(x + 6, y + 18)
  g.lineTo(x + 12, y + 18)
  g.lineTo(x + 3, y + 24)
  g.closePath()
  g.fill()
  text(bubble.text, x + 7, y + 4, { color: INK })
}

function toast(s: string): void {
  if (!s) return
  const w = measure(s, 'sans') + 14
  const x = Math.round((W - w) / 2)
  paper(x, 2, w, 15)
  text(s, x + 7, 4, { color: INK })
}
