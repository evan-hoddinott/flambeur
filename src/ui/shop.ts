import { laneArt } from './lanes.ts'
import { collectible, drawCollectible, opaque } from './collectibles.ts'
// the tabac: first person at the counter, the buraliste behind it, the offers on a glass shelf under him.
// layout is the art proof's (art/shop/counter.py), in 640x360 stage units. spec: docs/SHOP.md.
// main.ts owns the game, this file only draws a ShopState and reports clicks back through it
import { cardCanvas, sprite, tinted, ctx2d, backCanvas, blit, canvas } from './art.ts'
import { drawText, measure, wrapText, type TextStyle } from './font.ts'
import { describe, getDef } from '../engine/collectibles.ts'
import { rankLabel, SUIT_GLYPH, type Card } from '../engine/cards.ts'
import { getKeeper, INSERTS, type Insert } from '../engine/shop.ts'
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
  scratch: Scratch | null // a scratcher just bought, shown up close until onScratchDone
  onScratchDone: () => void
  onSleeve: () => void // your Sleeve on the zinc: use a code or a wishlist, or toss one
  patronPaid: number | null // le patron just collected this at the door (big shop)
}

export type Scratch = { key: number; insert: Insert; prize: string }

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
type Hit = { x: number; y: number; w: number; h: number; onClick: () => void; mask?: (x: number, y: number) => boolean }
let hits: Hit[] = []
let bubble: { text: string; t: number } | null = null
let enteredRound = -1
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let enteredAt = -Infinity
let restockBeat: { at: number; old: ShopState; landed: boolean } | null = null
let purchases: { at: number; offer: ShopOfferView; slot: number; center: number }[] = []
let countdown: { at: number; from: number; to: number } | null = null
let bulkAt = -Infinity
let stockAt = 0
let bellAt = -9999
let sighAt = -9999
let pressed: { key: string; t: number } | null = null

export function showShop(app: HTMLElement, next: ShopState): void {
  const previous = state
  const arriving = !cv?.isConnected || enteredRound !== next.view.round
  now = performance.now()
  state = next
  if (!cv || !cv.isConnected) {
    app.innerHTML = ''
    cv = document.createElement('canvas')
    cv.className = 'stage'
    app.appendChild(cv)
    g = ctx2d(cv)
    cv.onpointermove = e => {
      const p = toStage(e)
      if (lotto && dragging) rubLine(mouse, p)
      mouse = p
      lastInput = now
    }
    cv.onpointerdown = e => {
      if (!lotto) return
      dragging = true
      lotto.rubbed = false
      mouse = toStage(e)
      rubLine(mouse, mouse)
    }
    cv.onpointerup = () => { dragging = false }
    cv.onpointerleave = () => { mouse = { x: -1, y: -1 } }
    cv.onclick = e => click(toStage(e))
    resize()
  }
  if (arriving || !previous) {
    enteredRound = next.view.round
    enteredAt = lastInput = now
    stockAt = reducedMotion.matches ? -Infinity : now
    restockBeat = countdown = null
    purchases = []
    bulkAt = sighAt = -Infinity
    spent = 0
    keeperSays('Bonjour.')
    sfx.doorBell()
  } else updateBeats(previous, next)
  if (next.scratch && next.scratch.key !== shownKey) openTicket(next.scratch)
  if (!running) {
    running = true
    requestAnimationFrame(frame)
  }
}

// his speech bubble. flavor only, rules never go in here
export function keeperSays(text: string): void {
  bubble = { text, t: now }
}

// compare confirmed shelf views so remote buys and repeated renders behave like local ones
function updateBeats(before: ShopState, after: ShopState): void {
  const prev = before.view.me.shop!
  const next = after.view.me.shop!
  const stockChanged = prev.offers.length !== next.offers.length || prev.offers.some((o, i) => {
    const n = next.offers[i]
    return (o.sold && !n.sold) || JSON.stringify({ ...o, sold: false }) !== JSON.stringify({ ...n, sold: false })
  })
  if (stockChanged) {
    bellAt = now
    sfx.bell()
    keeperSays('Pfff.')
    if (!reducedMotion.matches) {
      restockBeat = { at: now, old: before, landed: false }
      stockAt = now + 120
    } else sfx.thunk()
    return
  }
  const bought = next.offers.some((o, i) => o.sold && !prev.offers[i].sold)
  if (bought) {
    keeperSays('Bon.')
    sfx.coin()
    if (!reducedMotion.matches) {
      for (const { slot, x, w } of offerLayout(prev.offers)) {
        if (next.offers[slot].sold && !prev.offers[slot].sold) {
          purchases.push({ offer: prev.offers[slot], slot, center: x + w / 2, at: now })
        }
      }
      countdown = { at: now, from: plateMoney(before.view.me.bankroll), to: after.view.me.bankroll }
    }
  }
  if (next.bulkInDeck < prev.bulkInDeck && prev.shipped === next.shipped) {
    bulkAt = reducedMotion.matches ? -Infinity : now
    sfx.thunk()
  }
}

function newspaperLift(): number {
  return reducedMotion.matches ? 0 : -Math.round(6 * (1 - ease((now - enteredAt - 90) / 500)))
}

let shopInsert: { id: Insert; card?: Card; at: number } | null = null

export function shopInsertUsed(id: Insert, cards: Card[]): void {
  if (cv?.isConnected && !reducedMotion.matches) shopInsert = { id, card: cards[0], at: performance.now() }
}

function counterInsert(): void {
  if (!shopInsert) return
  const u = Math.max(0, (now - shopInsert.at) / 700)
  if (u >= 1) { shopInsert = null; return }
  const x = 34 + (shopInsert.id === 'wishlist' ? 433 : 110) * ease(u)
  const y = 159 - Math.sin(u * Math.PI) * 38 + u * 9
  g.save()
  g.globalAlpha = Math.min(1, (1 - u) * 5)
  g.translate(x, y)
  g.rotate(Math.sin(u * Math.PI) * .18)
  if (shopInsert.card) g.drawImage(cardCanvas(shopInsert.card), -12, -17, 24, 34)
  else pin('insert/face/' + shopInsert.id, -12, -17)
  pin('scratch/' + shopInsert.id, 4, 0, .12)
  g.restore()
}

function counterPush(): number {
  if (!restockBeat) return 0
  const age = now - restockBeat.at
  return age >= 130 && age < 185 ? 1 : 0
}

function counterBeat(): void {
  if (restockBeat) {
    const age = now - restockBeat.at
    if (age >= 550) restockBeat = null
    else {
      if (age >= 130 && !restockBeat.landed) {
        restockBeat.landed = true
        sfx.thunk()
      }
      const fall = Math.min(1, age / 130)
      const bounce = Math.sin(Math.PI * Math.min(1, Math.max(0, (age - 130) / 90)))
      g.save()
      g.globalAlpha = 1 - ease((age - 390) / 160)
      pin('shop/box', 372, Math.round(90 + 73 * fall * fall - 4 * bounce), -0.07 * (1 - fall))
      g.restore()
    }
  }
  const age = now - bulkAt
  if (age >= 0 && age < 330) {
    const t = age / 330
    const s = sprite('base/bulk')
    g.save()
    g.beginPath()
    g.rect(0, 0, W, 171)
    g.clip()
    g.translate(276 + 14 * t, 133 - 8 * Math.sin(Math.PI * t) + 59 * t * t)
    g.rotate(-0.18 + t * 0.55)
    g.drawImage(s.img, s.x, s.y, s.w, s.h, -12, -17, 24, 34)
    g.restore()
  }
}

function outgoingRow(): void {
  if (!restockBeat) return
  const age = now - restockBeat.at
  if (age >= 230) return
  const old = restockBeat.old
  const offers = old.view.me.shop!.offers
  g.save()
  g.translate(-Math.round(W * (age / 230) ** 2), 0)
  for (const { slot, x, w } of offerLayout(offers)) {
    const o = offers[slot]
    const center = x + w / 2
    if (o.sold) pin('shop/vendu', center - 28, SLOT.top + 40)
    else {
      paintOffer(o, slot, center, SLOT.top + SLOT.h)
      priceTag(o.price, center - 20, 295, o.price < old.view.me.bankroll)
    }
  }
  g.restore()
}

function plateMoney(value: number): number {
  if (!countdown || countdown.to !== value) return value
  return Math.round(countdown.from + (value - countdown.from) * ease((now - countdown.at) / 360))
}

function shelfBeat(): void {
  purchases = purchases.filter(p => now - p.at < 440)
  for (const p of purchases) {
    const age = now - p.at
    const t = Math.min(1, age / 250)
    if (t < 1) {
      g.save()
      g.globalAlpha = 1 - t * t
      g.translate(p.center, SLOT.top + SLOT.h - 8 * Math.sin(Math.PI * t))
      g.scale(1 + 0.4 * t, 1 + 0.4 * t)
      paintOffer(p.offer, p.slot, 0, 0)
      g.restore()
    }
    if (!p.offer.price) continue
    for (let i = 0; i < Math.min(4, Math.max(2, p.offer.price)); i++) {
      const u = (age - 35 * i) / 318
      if (u <= 0 || u >= 1) continue
      const x = Math.round(p.center + (58 - p.center) * ease(u))
      const y = Math.round(296 + 38 * u - (15 + 3 * i) * Math.sin(Math.PI * u))
      g.fillStyle = '#6b4a1a'
      g.fillRect(x - 2, y, 5, 3)
      g.fillStyle = BRASS
      g.fillRect(x - 2, y - 1, 4, 2)
      g.fillStyle = '#e8c260'
      g.fillRect(x - 1, y - 1, 2, 1)
    }
  }
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
  if (lotto) return lottoClick()
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]
    if (inside(h, p)) return h.onClick()
  }
}

window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !cv?.isConnected) return
  if (lotto) {
    for (const w of lotto.wins) clearWindow(w)
    lottoClick()
    return
  }
  purchases = []
  restockBeat = countdown = null
  bulkAt = enteredAt = stockAt = -Infinity
})

function frame(t: number): void {
  if (!cv || !cv.isConnected || !state) {
    running = false
    return
  }
  now = t
  requestAnimationFrame(frame) // booked first, so a throw in draw shows in the console without freezing the shop
  hits = []
  g.restore() // a frame that threw left its save() open
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
  cv.style.cursor = jeton ? 'none' : lotto || over() ? 'pointer' : 'default'
}

function over(): boolean {
  return hits.some(h => inside(h, mouse))
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

const spriteArt = new Map<string, HTMLCanvasElement>()
function imageOf(name: string): HTMLCanvasElement {
  let art = spriteArt.get(name)
  if (!art) {
    const s = sprite(name)
    art = canvas(s.w, s.h)
    blit(ctx2d(art), name, 0, 0)
    spriteArt.set(name, art)
  }
  return art
}

const outlines = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>()
function outline(art: HTMLCanvasElement, x: number, y: number, w = art.width, h = art.height): void {
  let mask = outlines.get(art)
  if (!mask) {
    mask = canvas(art.width, art.height)
    const c = ctx2d(mask)
    c.drawImage(art, 0, 0)
    c.globalCompositeOperation = 'source-in'
    c.fillStyle = CREAM
    c.fillRect(0, 0, mask.width, mask.height)
    outlines.set(art, mask)
  }
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.drawImage(mask, x + dx, y + dy, w, h)
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

function inside(h: Hit, p: { x: number; y: number }): boolean {
  const x = p.x - h.x, y = p.y - h.y
  return x >= 0 && x < h.w && y >= 0 && y < h.h && (!h.mask || h.mask(x, y))
}

function hit(x: number, y: number, w: number, h: number, onClick: () => void, mask?: Hit['mask']): boolean {
  const target = { x, y, w, h, onClick, mask }
  hits.push(target)
  return inside(target, mouse)
}

// a cream paper rectangle with a 1px ink outline
function paper(x: number, y: number, w: number, h: number, fill = CREAM): void {
  g.fillStyle = 'rgba(14,11,10,.65)'
  g.fillRect(x, y + 1, w + 2, h + 2)
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
  g.translate(0, counterPush())
  room(st)
  buraliste()
  pin('shop/counter', 0, 150)
  pin('bur/front', BUR.x, BUR.y + newspaperLift() + (shop.kind === 'big' ? 5 : 0))
  glow(320, 142, 124, 'rgba(202,135,55,.085)')
  bell(st)
  sign(v)
  roundNote(v)
  if (shop.services.bulkBin) pin('shop/bulk/bin', 223, 125)
  counterBeat()
  registerTickets(st)
  spentPile()
  sleeveOnZinc(st)
  if (v.scout) {
    dossierFolder()
    text('Nouvelle table ce soir', 571, 86, { font: 'tiny', color: CREAM, align: 'center', outline: INK })
  }
  if (v.me.shipping) {
    g.drawImage(imageOf('shop/parcel/' + v.me.shipping.shipper), 160, 143, 41, 27)
    g.drawImage(imageOf('shop/grading/postmark'), 178, 147, 13, 12)
  }
  pin('shop/case', 0, 172)
  caseLight()
  outgoingRow()
  const hover = offers(st)
  glassBands()
  bottomBar(st)
  shelfBeat()
  if (!lotto) {
    if (hover) hoverTag(hover.offer, hover.x, hover.lift)
    signTag(v)
    if (v.scout && dossierOpen) dossier(v)
    toast(st.toast) // would give the scratcher away
  }
  speech()
  counterInsert()
  scratcher()
}

let wall: HTMLCanvasElement | null = null
function litWall(): HTMLCanvasElement {
  if (wall) return wall
  wall = canvas(W, 172)
  const c = ctx2d(wall)
  blit(c, 'shop/wall', 0, 0)
  blit(c, 'shop/window', 64, 10)
  const img = c.getImageData(0, 0, W, wall.height)
  for (let y = 0; y < wall.height; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - 320
      const pool = Math.max(0, 1 - Math.hypot(dx / 225, (y - 160) / 230))
      const cone = Math.max(0, 1 - Math.abs(dx) / (22 + y * .78))
      const shade = .19 + .32 * Math.abs(dx / 320) ** 1.6 + .14 * (1 - y / 172)
      const i = (y * W + x) * 4
      const warmth = pool * .095 + cone * .06
      img.data[i] = img.data[i] * (1 - shade) + 14 * shade + 230 * warmth
      img.data[i+1] = img.data[i+1] * (1 - shade) + 11 * shade + 154 * warmth
      img.data[i+2] = img.data[i+2] * (1 - shade) + 10 * shade + 67 * warmth
    }
  }
  c.putImageData(img, 0, 0)
  return wall
}

function room(st: ShopState): void {
  g.drawImage(litWall(), 0, 0)
  pin('shop/diamond', 96, 22)
  glow(126, 42, 86, `rgba(208,54,55,${0.14 + 0.02 * Math.sin(now / 700)})`)
  pin('shop/pendant', 288, 0)
  glow(320, 14, 65, 'rgba(255,203,104,.15)')
  if (st.view.me.shop?.kind === 'big') patron(st) // under the vitrine tab, so the tab stays clickable
  // the vitrine tab, same as the duel: your collectibles, sell them from here
  const tab = sprite('hud/vitrine/tab')
  const overTab = hit(8, 0, tab.w, tab.h, st.onVitrine)
  if (overTab) outline(imageOf('hud/vitrine/tab'), 8, 2)
  pin('hud/vitrine/tab', 8, overTab ? 2 : 0)
  stonks(st.view.stonks, st.view.stonksNext)
  const clock = st.clock()
  if (clock) {
    pin('shop/clock', 452, 14)
    text(clock, 469, 50, { align: 'center', color: CREAM, outline: INK0 })
  }
  pin('shop/lottery', 432, 94)
  pin('shop/register', 528, 94)
  glow(456, 108, 23, 'rgba(78,156,160,.14)')
  glow(570, 110, 18, 'rgba(100,170,130,.15)')
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
  g.fillRect(BUR.x + 137, y + 99, 1, 1)
}

function bell(st: ShopState): void {
  const age = now - bellAt
  const wobble = age < 500 ? Math.sin(age / 30) * 0.25 * (1 - age / 500) : 0
  const overBell = st.canRestock && hit(192, 134, 24, 18, st.onRestock)
  if (overBell) outline(imageOf('shop/bell'), 192, 135)
  pin('shop/bell', 204, 153 - (overBell ? 1 : 0), wobble)
}

function sign(v: SeatView): void {
  g.save()
  g.translate(578, 142)
  g.rotate(.024)
  g.fillStyle = 'rgba(14,11,10,.65)'
  g.fillRect(-47, -25, 96, 52)
  pin('shop/sign', -48, -26)
  v.keeper.forEach((id, i) => text(`· ${getKeeper(id).name}`, -42, -10 + i * 11, { color: INK }))
  g.restore()
}

// hovering the sign shows each trait's rule
function signTag(v: SeatView): void {
  if (!(mouse.x >= 530 && mouse.x <= 628 && mouse.y >= 115 && mouse.y <= 170)) return
  const lines = v.keeper.map(id => `${getKeeper(id).name}: ${getKeeper(id).text}`)
  const w = Math.max(...lines.map(l => measure(l, 'sans'))) + 12
  const x = 634 - w
  paper(x, 178, w, lines.length * 12 + 6)
  lines.forEach((l, i) => text(l, x + 6, 181 + i * 12, { color: INK }))
}

// round and the next tournament twist, pinned under the window. the shop before a boss is prep
function roundNote(v: SeatView): void {
  g.save()
  g.translate(96, 134)
  g.rotate(-.025)
  g.translate(-96, -134)
  paper(8, 122, 176, 24, PAPER)
  g.fillStyle = '#bfa77e'
  g.fillRect(86, 120, 19, 4)
  g.fillRect(178, 141, 5, 4)
  g.fillStyle = CREAM
  g.fillRect(179, 141, 3, 2)
  text(`Manche ${v.round} · Table ${tableOf(v.round)}`, 14, 124, { color: INK })
  const t = v.nextTwist
  if (t) text(`${t.round === v.round ? 'Ce soir' : `Manche ${t.round}`} : ${twistName(t.twist)}`, 14, 135, { color: '#7a1a2c' })
  g.restore()
}

function slotOrder(offers: ShopOfferView[]): number[] {
  const rank = (o: ShopOfferView) => ({ pack: 0, collectible: 1, scratcher: 2, sleeve: 3 })[o.type]
  return offers.map((_, i) => i).sort((a, b) => rank(offers[a]) - rank(offers[b]) || a - b)
}

function registerTickets(st: ShopState): void {
  const tickets = st.view.me.shop!.offers.flatMap((offer, slot) => offer.type === 'scratcher' && !offer.sold ? [{ offer, slot }] : [])
  const age = lotto ? Math.max(0, now - lotto.at) : 1000
  const tear = age < 180 ? Math.min(3, 1 + Math.floor(age / 60)) : 0
  pin('shop/scratch/roll' + (tear > 0 ? '/' + tear : ''), 402, 104)
  tickets.forEach(({ offer, slot }, i) => {
    const x = 410 + i * 41
    const over = hit(x, 151, 40, 19, () => { if (st.canBuy(slot)) st.onBuy(slot) })
    const y = over ? 149 : 151
    g.drawImage(imageOf('scratch/shelf-paper'), x, y, 40, 19)
    text(`$${offer.price}`, x + 20, y + 5, { font: 'sans', color: CREAM, outline: INK, align: 'center', bold: true })
  })
}

function offerLayout(list: ShopOfferView[]): { slot: number; x: number; w: number }[] {
  const ordered = slotOrder(list).filter(slot => list[slot].type !== 'scratcher')
  const widths = ordered.map(slot => {
    const o = list[slot]
    return o.type === 'collectible' ? Math.max(40, sprite(o.owned.id).w) : SLOT.w
  })
  const gaps: number[] = ordered.map((slot, i) => i === 0 ? 0 : ordered.length === 3 ? 46 : list[ordered[i-1]].type === list[slot].type ? 4 : 13)
  // the big shop's 9 offers can run wider than the shelf: the gaps go first, then every slot narrows a little
  const natural = widths.reduce((sum, w) => sum + w, 0)
  const squeeze = Math.min(1, (W - 20) / natural)
  const width = natural * squeeze
  const gapWidth = gaps.reduce((sum, w) => sum + w, 0)
  const scale = Math.max(0, Math.min(1, (W - 20 - width) / Math.max(1, gapWidth)))
  let x = Math.round((W - width - gapWidth * scale) / 2)
  return ordered.map((slot, i) => {
    x += Math.round(gaps[i] * scale)
    const w = Math.round(widths[i] * squeeze)
    const pos = { slot, x, w }
    x += w
    return pos
  })
}

const sleeveOffers = new Map<string, HTMLCanvasElement>()

function offerArt(o: ShopOfferView, slot: number): HTMLCanvasElement {
  if (o.type === 'collectible') return collectible(o.owned, now, slot).art
  if (o.type === 'sleeve') {
    const cached = sleeveOffers.get(o.id)
    if (cached) return cached
    const art = document.createElement('canvas')
    art.width = 72
    art.height = 104
    const ctx = art.getContext('2d')!
    const item = imageOf('shop/sleeve/' + o.id)
    ctx.drawImage(imageOf('shop/sleeve/stand'), 0, 80)
    ctx.drawImage(item, (72 - item.width) / 2, o.id === 'archival' ? 0 : 2)
    sleeveOffers.set(o.id, art)
    return art
  }
  return imageOf(o.type === 'pack' ? 'shop/pack/' + o.kind : 'shop/' + o.type)
}

function paintOffer(o: ShopOfferView, slot: number, center: number, baseline: number, outlined = false): void {
  const art = offerArt(o, slot)
  const x = Math.round(center - art.width / 2), y = baseline - art.height
  if (outlined) outline(art, x, y)
  if (o.type === 'collectible') drawCollectible(g, collectible(o.owned, now, slot), x, y, now + slot * 213)
  else g.drawImage(art, x, y)
}

const reflections = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>()
function reflection(art: HTMLCanvasElement): HTMLCanvasElement {
  let result = reflections.get(art)
  if (result) return result
  result = canvas(art.width, 12)
  const c = ctx2d(result)
  for (let y = 0; y < 12 && y * 2 < art.height; y++) {
    c.globalAlpha = .19 * (1 - y / 12)
    c.drawImage(art, 0, art.height - 1 - y * 2, art.width, 1, 0, y, art.width, 1)
  }
  reflections.set(art, result)
  return result
}

function caseLight(): void {
  const r = g.createLinearGradient(0, 180, 0, 224)
  r.addColorStop(0, 'rgba(255,203,115,.20)')
  r.addColorStop(1, 'rgba(255,203,115,0)')
  g.fillStyle = r
  g.fillRect(7, 180, 626, 44)
  g.fillStyle = '#e8c260'
  g.fillRect(9, 178, 622, 1)
  g.fillStyle = '#fff0b0'
  g.fillRect(12, 179, 616, 1)
}

function glassBands(): void {
  g.fillStyle = 'rgba(246,236,210,.074)'
  for (const [x, width] of [[151, 13], [523, 6]]) {
    g.beginPath()
    g.moveTo(x, 181)
    g.lineTo(x + width, 181)
    g.lineTo(x - 48 + width, 293)
    g.lineTo(x - 48, 293)
    g.closePath()
    g.fill()
  }
}

const hoverMotion = new Map<number, { lift: number; tilt: number; vel: number; spin: number; time: number }>()
function offers(st: ShopState): { offer: ShopOfferView; x: number; lift: number } | null {
  const list = st.view.me.shop!.offers
  let hovered = null
  for (const [i, pos] of offerLayout(list).entries()) {
    const { slot, w } = pos
    const o = list[slot]
    const deal = ease((now - stockAt - i * 45) / 260)
    const x = pos.x + (1 - deal) * 700
    const center = Math.round(x + w / 2)
    const floor = SLOT.top + SLOT.h
    if (o.sold) {
      if (o.type === 'sleeve') g.drawImage(imageOf('shop/sleeve/stand'), center - 36, floor - 24)
      g.fillStyle = 'rgba(14,11,10,.30)'
      g.fillRect(x + 2, SLOT.top + 5, w - 4, SLOT.h - 5)
      g.save()
      g.translate(center, SLOT.top + 50)
      g.rotate(-.034)
      g.fillStyle = INK0
      g.fillRect(-27, -8, 56, 18)
      pin('shop/vendu', -28, -9)
      g.restore()
      continue
    }
    const ok = st.canBuy(slot)
    const buy = () => {
      if (!ok) return
      pressed = { key: `o${slot}`, t: now }
      st.onBuy(slot)
    }
    const art = offerArt(o, slot)
    const motion = hoverMotion.get(slot) ?? { lift: 0, tilt: 0, vel: 0, spin: 0, time: now - 16 }
    hoverMotion.set(slot, motion)
    const f = o.type === 'collectible' ? collectible(o.owned, now, slot) : null
    const rad = motion.tilt
    const lift = motion.lift
    // inverse of the drawing transform keeps the narrow props' hit masks on their pixels
    const mask = (mx: number, my: number) => {
      const dx = x - 5 + mx - center, dy = SLOT.top - 8 + my - floor + art.height / 2 + lift
      const ax = Math.cos(rad) * dx + Math.sin(rad) * dy + art.width / 2
      const ay = -Math.sin(rad) * dx + Math.cos(rad) * dy + art.height / 2
      return f ? opaque(f, ax, ay) : ax >= 0 && ay >= 0 && ax < art.width && ay < art.height
    }
    const body = hit(x - 5, SLOT.top - 8, w + 10, SLOT.h + 16, buy, mask)
    const tag = hit(center - 21, 294, 43, 17, buy)
    const over = body || tag
    const dt = Math.min(.025, (now - motion.time) / 1000)
    motion.time = now
    const target = over ? Math.max(-1, Math.min(1, (mouse.x - center) / (w / 2))) * Math.PI / 60 : 0
    motion.vel += ((Number(over) * 4 - motion.lift) * 320 - 29 * motion.vel) * dt
    motion.spin += ((target - motion.tilt) * 320 - 29 * motion.spin) * dt
    motion.lift += motion.vel * dt
    motion.tilt += motion.spin * dt
    g.save()
    g.translate(center, floor)
    g.scale(w * .48, 3.5)
    const shadow = g.createRadialGradient(0, 0, 0, 0, 0, 1)
    shadow.addColorStop(0, 'rgba(14,11,10,.74)')
    shadow.addColorStop(1, 'rgba(14,11,10,0)')
    g.fillStyle = shadow
    g.fillRect(-1,-1,2,2)
    g.restore()
    g.drawImage(reflection(art), center - art.width / 2, floor + 1 + Math.round(motion.lift))
    g.save()
    g.translate(center, floor - art.height / 2 - motion.lift)
    g.rotate(motion.tilt)
    paintOffer(o, slot, 0, art.height / 2, over)
    g.restore()
    if (over) hovered = { offer: o, x, lift: motion.lift }
    priceTag(o.price, center - 20, 295, ok)
  }
  return hovered
}

function priceTag(price: number, x: number, y: number, ok: boolean): void {
  const s = price ? `$${price}` : 'Free'
  const w = Math.max(40, measure(s, 'sans') + 16)
  g.save()
  g.translate(x+4, y+4)
  g.rotate((Math.round(x) % 2 ? -1 : 1) * .024)
  g.translate(-x-4, -y-4)
  g.fillStyle = 'rgba(14,11,10,.65)'
  g.fillRect(x+4, y+1, w-2, 15)
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
  text(s, x + (w + 4) / 2, y + 2, { color: ok ? '#1e4a24' : '#43342e', align: 'center' })
  g.fillStyle = TAN
  g.fillRect(x+3, y+5, 2, 2)
  g.restore()
}

function hoverTag(o: ShopOfferView, x: number, lift: number): void {
  const [name, line] = offerLines(o)
  const head = `${name} · ${o.price ? `$${o.price}` : 'free'}`
  const w = Math.max(measure(head, 'sans'), measure(line, 'sans')) + 12
  const tx = Math.min(Math.max(4, x), W - w - 4)
  g.save()
  g.translate(0, SLOT.top + SLOT.h - 2)
  g.scale(1, .64 + Math.min(1, lift / 4) * .36)
  g.translate(0, -(SLOT.top + SLOT.h - 2))
  paper(tx, SLOT.top + SLOT.h - 2, w, 26)
  text(head, tx + 6, SLOT.top + SLOT.h, { color: INK })
  text(line, tx + 6, SLOT.top + SLOT.h + 12, { color: '#5c4a36' })
  g.restore()
}

function offerLines(o: ShopOfferView): [string, string] {
  if (o.type === 'pack') return PACK_LINE[o.kind]
  if (o.type === 'collectible') return [getDef(o.owned.id).name, describe(o.owned)]
  if (o.type === 'scratcher') return ['Scratcher', 'A random insert, up your Sleeve (2 slots)']
  const sl = getSleeve(o.id)
  return [`Pochette · ${sl.name}`, `For the rest of the run: ${sl.text}`]
}

// ---------- bottom bar: plate, deck, tickets, binder, sortir ----------

type Ticket = { key: string; label: string; price?: string; face: string; plinth: string; ink: string; enabled: boolean; primary?: boolean; onClick: () => void }

function bottomBar(st: ShopState): void {
  const v = st.view
  const shop = v.me.shop!
  const calm = g.createRadialGradient(615, 357, 12, 615, 357, 145)
  calm.addColorStop(0, 'rgba(14,11,10,.68)')
  calm.addColorStop(1, 'rgba(14,11,10,0)')
  g.fillStyle = calm
  g.fillRect(458, 314, 182, 46)

  nine('hud/plate/frame', 6, 317, 93, 40)
  nine('hud/plate/paper', 10, 321, 85, 32)
  text('Vous', 16, 323, { color: INK })
  text(`$${plateMoney(v.me.bankroll)}`, 88, 328, { font: 'didone', color: BLUE, align: 'right' })

  const count = v.me.pile.length + v.me.discard.length
  const stack = Math.min(7, Math.ceil(count / 5))
  const overPile = hit(103, 310, 51, 50, st.onPile)
  const back = backCanvas(v.me.starter)
  for (let i = 0; i < stack; i++) {
    const y = 313 - (overPile ? 2 : 0) - i
    if (overPile && i === stack - 1) outline(back, 109, y, 33, 45)
    g.drawImage(back, 109, y, 33, 45)
  }
  text(overPile ? `Deck · ${count}` : String(count), 126, 350, { font: 'tiny', color: CREAM, outline: INK0, align: 'center' })

  const spend = { face: MONEY, plinth: '#1e4a24', ink: CREAM }
  const tickets: [number, number, Ticket][] = [
    [158, 104, { key: 'restock', label: 'Restock', price: shop.restockPrice ? `$${shop.restockPrice}` : 'free', ...spend, enabled: st.canRestock, onClick: st.onRestock }],
    // a small shop has one service: the grading desk at a table's 1st, the bulk bin at its 2nd. the big shop has both
    [268, 104, { key: 'bulk', label: 'Bin Bulk', price: !shop.services.bulkBin ? 'not today' : shop.bulkInDeck ? `$${shop.bulkPrice}` : 'none', ...spend, enabled: st.canBinBulk, onClick: st.onBinBulk }],
    [378, 96, { key: 'grade', label: 'Grading', price: shop.services.grading ? '$2+' : 'not today', face: '#7a4ab0', plinth: '#2a1440', ink: CREAM, enabled: st.canGrade, onClick: st.onGrading }],
    [538, 96, { key: 'leave', label: 'Sortir', face: BRASS, plinth: '#3d2a10', ink: INK, enabled: true, primary: true, onClick: st.onLeave }],
  ]
  for (const [x, w, t] of tickets) ticket(t, x, 326, w)
  // the binder: sell from here
  const overBinder = hit(475, 315, 60, 44, st.onBinder)
  const binderY = 315 - (overBinder ? 2 : 0)
  if (overBinder) outline(imageOf('shop/binder'), 475, binderY)
  pin('shop/binder', 475, binderY)
  text(String(v.me.binder.length), 509, binderY + 15, { color: '#e8c260', align: 'center' })
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
  text(s, W / 2, 4, { color: CREAM, outline: INK0, align: 'center' })
}

// ---------- the big shop: le patron at the door, the scouting dossier ----------

// le patron in the doorway on the left wall, his ledger on the counter. he already collected at the door
function patron(st: ShopState): void {
  const age = Math.max(0, now - enteredAt)
  const paid = st.patronPaid
  const motion = paid !== null && !reducedMotion.matches
  const exit = motion ? ease((age - 1710) / 550) : 0
  const tap = motion ? Math.max(0, 1 - Math.min(Math.abs(age - 250), Math.abs(age - 490)) / 110) : 0
  const tip = motion ? Math.sin(Math.PI * ease((age - 1350) / 400)) : 0
  pin('patron/body', -26 - exit * 100, 16 + 2 * tip)
  pin(`patron/cigar/${[0, 1, 2, 1][Math.floor(now / 380) % 4]}`, 54 - exit * 100, 52 + 2 * tip)
  pin('patron/ledger', 86, 78)
  pin('patron/hand', 70 - exit * 100 - 43 * tip, 76 + 4 * tap - 52 * tip)
  text('Le Patron', 121, 82, { font: 'tiny', color: '#5c4a36', align: 'center' })
  if (paid !== null) {
    text(`$${paid}`, 121, 95, { color: '#7a1a2c', align: 'center', bold: true })
    if (motion && age > 540 && age < 1150) {
      for (let i = 0; i < 4; i++) {
        const u = ease((age - 540 - i * 65) / 340)
        g.drawImage(imageOf('scratch/jeton'), 206 - 94 * u + i * 2, 147 - 38 * u - 7 * Math.sin(u * Math.PI), 9, 7)
      }
    }
    if (!motion || age > 1030) {
      const slam = motion ? 1 + 0.5 * Math.exp(-Math.max(0, age - 1030) / 70) : 1
      g.drawImage(imageOf('hud/marker/paid'), 106, 104, 36 * slam, 12 * slam)
    }
  }

}

let dossierOpen = false
let dossierAt = -Infinity

// the folder on the zinc. hover or click it for the next rival's report
function dossierFolder(): void {
  const x = 84
  const y = 152
  const open = () => {
    if (!dossierOpen) dossierAt = now
    dossierOpen = true
  }
  const over = hit(x, y, 48, 20, open)
  if (over) open()
  else if (mouse.x < 140 || mouse.x > 500 || mouse.y < 60 || mouse.y > 180) dossierOpen = false
  g.drawImage(imageOf('shop/dossier'), x, y, 48, 20)
  pin('hud/marker/seal', x + 35, y + 4)
  text('Dossier', x + 4, y + 5, { font: 'tiny', color: INK })
}

// the scouting report: the next rival's mask, lane, case, deck size, stack and the boss twist
function dossier(v: SeatView): void {
  const s = v.scout!
  const x = 140
  const y = 60
  const w = 360
  const h = 120
  g.save()
  const open = reducedMotion.matches ? 1 : ease((now - dossierAt) / 210)
  g.translate((x + 20) * (1 - open), (y + 110) * (1 - open))
  g.scale(0.7 + 0.3 * open, 0.7 + 0.3 * open)
  paper(x, y, w, h)
  const folderX = x + w - 154
  pin('shop/dossier', folderX, y + 6)
  g.drawImage(imageOf(`mask/${s.rival}/front`), folderX + 10, y + 30, 48, 48)
  s.display.slice(0, 4).forEach((owned, i) => {
    const art = collectible(owned, now, i).art
    const scale = Math.min(26 / art.width, 28 / art.height)
    g.drawImage(art, folderX + 13 + i * 31, y + 82 - art.height * scale / 2, art.width * scale, art.height * scale)
  })
  pin('hud/marker/seal', folderX + 132, y + 99)
  pin(`mask/${s.rival}/icon`, x + 18, y + 22)
  text(`Next: ${s.name}`, x + 34, y + 6, { font: 'didone', color: '#7a1a2c' })
  pin('icon/lane/' + laneArt[s.rival], x + 1, y + 34)
  let lineY = y + 32
  const line = (message: string, color = INK) => {
    for (const row of wrapText(message, 184, 'sans')) {
      text(row, x + 14, lineY, { color })
      lineY += 10
    }
  }
  line(`${s.lane} · ${s.leans}`)
  line(`Deck ${s.deckSize} cards · stack $${s.stack}`)
  if (s.twist) line(`Boss twist: ${twistName(s.twist)}`, '#a82a38')
  for (const row of wrapText('Bust it and its Table ends early, with a bonus for every round you skip.', 185, 'tiny')) {
    text(row, x + 12, lineY + 6, { font: 'tiny', color: '#5c4a36' })
    lineY += 7
  }
  g.restore()
}

// your Sleeve: the inserts you're holding, lying on the zinc. click for the sleeve (use a code or wishlist, toss one)
function sleeveOnZinc(st: ShopState): void {
  const me = st.view.me
  const cards = [...me.sleeve, ...(me.overflow ? [me.overflow] : [])]
  const over = hit(14, 150, 66, 36, st.onSleeve)
  text('Sleeve', 60, 158, { font: 'tiny', color: CREAM, outline: INK0 })
  for (let i = 0; i < Math.max(2, cards.length); i++) {
    const c = cards[i]
    const x = 16 + i * 22
    if (!c) {
      g.fillStyle = 'rgba(14,11,10,.35)'
      g.fillRect(x, 152, 18, 26)
      continue
    }
    const name = over ? `insert/face/${c.id}` : 'insert/back'
    const s = sprite(name)
    g.drawImage(s.img, s.x, s.y, s.w, s.h, x, 150 - (over ? 2 : 0), 18, 26)
  }
  if (me.overflow) text('full!', 48, 178, { font: 'tiny', color: '#ff7a24', outline: INK0, align: 'center' })
}

// ---------- the scratcher up close (SHOP.md §7) ----------
// the insert is already rolled when you buy, so this is pure theater: rub the foil or click once, find 3 matching

const TICKET = { x: 220, y: 40, w: 200, h: 280 }
const WINDOWS = [0, 1, 2, 3, 4, 5].map(i => ({ x: 20 + 56 * (i % 3), y: 126 + 52 * Math.floor(i / 3) }))
const FOIL = { w: 48, h: 46 }
const PILE = { x: 474, y: 148 } // spent tickets lie on the zinc by the register
const FOIL_FLAKES = ['#5c5c6e', '#9a9aae', '#dcdce8']
type Win = { symbol: Insert; foil: HTMLCanvasElement; mask: Uint8Array; left: number; clearedAt: number }
type Lotto = Scratch & { wins: Win[]; at: number; wonAt: number; autoAt: number; closeAt: number; rubbed: boolean; noiseAt: number }
let lotto: Lotto | null = null
let shownKey = -1
let spent = 0
let dragging = false
let jeton = false
let flakes: { x: number; y: number; vx: number; vy: number; at: number; color: string }[] = []

// three of the prize plus decoys that never make a second triple. a non-grail ticket always shows two grails.
// the layout is visual only, so plain Math.random is fine here
function symbols(insert: Insert): Insert[] {
  const others = (Object.keys(INSERTS) as Insert[]).filter(e => e !== insert)
  const plain = others.filter(e => e !== 'grail')
  const decoys = others.slice().sort(() => Math.random() - 0.5).slice(0, 3)
  const list = [insert, insert, insert, ...(insert === 'grail' ? decoys : ['grail', 'grail', plain[Math.floor(Math.random() * plain.length)]] as Insert[])]
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

function openTicket(s: Scratch): void {
  sfx.rip()
  shownKey = s.key
  const wins = symbols(s.insert).map(symbol => {
    const foil = canvas(FOIL.w, FOIL.h)
    blit(ctx2d(foil), 'scratch/foil', 0, 0)
    return { symbol, foil, mask: new Uint8Array(FOIL.w * FOIL.h).fill(1), left: FOIL.w * FOIL.h, clearedAt: -1 }
  })
  lotto = { ...s, wins, at: now, wonAt: -1, autoAt: -1, closeAt: -1, rubbed: false, noiseAt: 0 }
  dragging = false
}

// the coin drags from a to b, a round ~4px brush with a ragged edge
function rubLine(a: { x: number; y: number }, b: { x: number; y: number }): void {
  const t = lotto
  if (!t || t.wonAt >= 0 || t.closeAt >= 0) return
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  if (dist > 2) t.rubbed = true
  const steps = Math.max(1, Math.ceil(dist / 2))
  for (let s = 0; s <= steps; s++) rub(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps)
  if (dist > 1 && now - t.noiseAt > 70) {
    t.noiseAt = now
    sfx.scratch(Math.min(1, dist / 12))
  }
}

function rub(x: number, y: number): void {
  const t = lotto!
  t.wins.forEach((w, i) => {
    const fx = x - TICKET.x - WINDOWS[i].x
    const fy = y - TICKET.y - WINDOWS[i].y
    if (w.clearedAt >= 0 || fx < -4 || fy < -4 || fx > FOIL.w + 4 || fy > FOIL.h + 4) return
    const c = ctx2d(w.foil)
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.hypot(dx, dy)
        if (d > 4 || (d > 3 && Math.random() < 0.5)) continue
        const px = Math.round(fx + dx)
        const py = Math.round(fy + dy)
        if (px < 0 || py < 0 || px >= FOIL.w || py >= FOIL.h || !w.mask[py * FOIL.w + px]) continue
        w.mask[py * FOIL.w + px] = 0
        w.left--
        c.clearRect(px, py, 1, 1)
        if (Math.random() < 0.06) flake(TICKET.x + WINDOWS[i].x + px, TICKET.y + WINDOWS[i].y + py)
      }
    }
    // about 55% scraped clears the rest, so you never hunt for the last pixels
    if (w.left < FOIL.w * FOIL.h * 0.45) clearWindow(w)
  })
}

function flake(x: number, y: number): void {
  if (flakes.length > 160) return
  flakes.push({ x, y, vx: (Math.random() - 0.5) * 0.08, vy: -0.06 - Math.random() * 0.06, at: now, color: FOIL_FLAKES[Math.floor(Math.random() * 3)] })
}

function clearWindow(w: Win): void {
  const t = lotto!
  if (w.clearedAt >= 0) return
  w.clearedAt = now
  w.left = 0
  w.mask.fill(0)
  ctx2d(w.foil).clearRect(0, 0, FOIL.w, FOIL.h)
  for (let i = 0; i < 5; i++) flake(TICKET.x + 24 + Math.random() * 150, TICKET.y + 150 + Math.random() * 40)
  sfx.tick(t.wins.filter(x => x.clearedAt >= 0).length)
  if (t.wonAt < 0 && t.wins.filter(x => x.symbol === t.insert).every(x => x.clearedAt >= 0)) {
    t.wonAt = now
    t.autoAt = now + 600 // then the rest clears on its own, so you see what you almost had
    sfx.flip(t.insert === 'grail')
    if (t.insert === 'grail') keeperSays('Hein ?!')
  }
}

function lottoClick(): void {
  const t = lotto!
  if (t.closeAt >= 0) return
  if (t.wonAt >= 0) {
    if (now - t.wonAt > 700 && t.autoAt < 0) t.closeAt = now
    return
  }
  // a click without a rub: the windows clear one after another
  if (!t.rubbed && t.autoAt < 0) t.autoAt = now
}

function spentPile(): void {
  for (let i = 0; i < Math.min(spent, 6); i++) {
    const s = sprite('scratch/shelf-paper')
    g.save()
    g.translate(PILE.x + 11 + ((i * 7) % 5) - 2, PILE.y + 7 - i)
    g.rotate(((i * 37) % 9 - 4) * 0.04)
    g.fillStyle = 'rgba(14,11,10,.45)'
    g.fillRect(-10, -5, 22, 13)
    g.drawImage(s.img, s.x, s.y, s.w, s.h, -11, -7, 22, 13) // lying flat on the zinc
    g.restore()
  }
}

function scratcher(): void {
  jeton = false
  const t = lotto
  if (t) drawTicket(t)
  drawFlakes()
}

function drawTicket(t: Lotto): void {
  if (t.autoAt >= 0 && now >= t.autoAt) {
    const next = t.wins.find(w => w.clearedAt < 0)
    if (next) {
      clearWindow(next)
      t.autoAt = now + 110
    } else t.autoAt = -1
  }
  const grow = reducedMotion.matches ? 1 : ease((now - t.at) / 260)
  const shrink = t.closeAt < 0 ? 0 : reducedMotion.matches ? 1 : ease((now - t.closeAt) / 300)
  if (t.closeAt >= 0 && now - t.closeAt > 300) {
    lotto = null
    spent++
    queueMicrotask(() => state?.onScratchDone())
    return
  }
  const won = t.wonAt >= 0
  const grail = won && t.insert === 'grail'
  const cx = TICKET.x + TICKET.w / 2
  const cy = TICKET.y + TICKET.h / 2

  g.fillStyle = `rgba(14,11,10,${0.74 * grow * (1 - shrink)})`
  g.fillRect(0, 0, W, H)
  if (grail && !shrink) rays(cx, cy, now - t.wonAt)

  // grows out of the shelf, shrinks onto the pile by the register
  const scale = (0.36 + 0.64 * grow) * (1 - 0.88 * shrink)
  g.save()
  g.translate(cx + (PILE.x + 11 - cx) * shrink, cy + 40 * (1 - grow) + (PILE.y + 6 - cy) * shrink)
  g.scale(scale, scale)
  g.translate(-cx, -cy)
  g.fillStyle = 'rgba(14,11,10,.5)'
  g.fillRect(TICKET.x + 4, TICKET.y + 5, TICKET.w, TICKET.h)
  pin('scratch/ticket', TICKET.x, TICKET.y)
  t.wins.forEach((w, i) => {
    const x = TICKET.x + WINDOWS[i].x
    const y = TICKET.y + WINDOWS[i].y
    const pop = w.clearedAt < 0 ? 1 : 1 + 0.25 * Math.max(0, 1 - (now - w.clearedAt) / 140)
    const size = 32 * pop
    g.drawImage(imageOf('scratch/' + w.symbol), x + 24 - size / 2, y + 23 - size / 2, size, size)
    if (w.clearedAt < 0) g.drawImage(w.foil, x, y)
  })
  if (won) {
    // the three matches light up in sequence, then the stamp slams across
    t.wins.filter(w => w.symbol === t.insert).forEach((w, j) => {
      if (now - t.wonAt < j * 120) return
      const i = t.wins.indexOf(w)
      g.strokeStyle = `rgba(232,194,96,${0.65 + 0.35 * Math.sin(now / 160)})`
      g.lineWidth = 2
      g.strokeRect(TICKET.x + WINDOWS[i].x - 1, TICKET.y + WINDOWS[i].y - 1, FOIL.w + 2, FOIL.h + 2)
    })
    stamp(t)
  }
  g.restore()
  if (shrink) return

  if (won && now - t.wonAt > 500) resultTag(t)
  if (t.insert === 'code' && won) chart(t)
  if (grail) {
    const age = now - t.wonAt
    const flash = Math.max(0, 1 - age / 2000)
    if (flash) {
      const bloom = g.createRadialGradient(cx, cy, 20, cx, cy, 420)
      bloom.addColorStop(0, `rgba(176,232,120,${0.55 * flash})`)
      bloom.addColorStop(1, `rgba(74,154,116,${0.2 * flash})`)
      g.fillStyle = bloom
      g.fillRect(0, 0, W, H)
    }
    const s = 1 + Math.max(0, 1 - age / 200)
    g.save()
    g.translate(cx, 18)
    g.scale(s, s)
    text('LE GRAAL !', 0, -6, { font: 'didone', color: '#ffb03a', outline: INK0, align: 'center' })
    g.restore()
  }
  // your cursor is a $1 jeton over the foil
  const overTicket = mouse.x >= TICKET.x && mouse.x < TICKET.x + TICKET.w && mouse.y >= TICKET.y && mouse.y < TICKET.y + TICKET.h
  if (overTicket && !won && grow === 1) {
    jeton = true
    pin('scratch/jeton', Math.round(mouse.x), Math.round(mouse.y) + (dragging ? 1 : 0))
  }
}

function stamp(t: Lotto): void {
  const age = now - t.wonAt - 380
  if (age < 0) return
  if (age < 16 && !t.rubbed) sfx.thunk()
  const s = 1 + Math.max(0, 1 - age / 110)
  const st = sprite('scratch/stamp')
  g.save()
  g.translate(TICKET.x + 100, TICKET.y + 176 + (age < 60 ? 1 : 0))
  g.rotate(-0.1)
  g.scale(s, s)
  g.globalAlpha = Math.min(1, age / 60)
  g.drawImage(st.img, st.x, st.y, st.w, st.h, -st.w / 2, -st.h / 2, st.w, st.h)
  text(INSERTS[t.insert].name.toUpperCase(), 13, -st.h / 2 + 5, { color: '#a82a38', align: 'center', bold: true })
  g.restore()
}

// the one-line rule on a paper tag under the ticket, plus what you got
function resultTag(t: Lotto): void {
  const name = INSERTS[t.insert].name
  const line = t.prize || INSERTS[t.insert].text
  const w = Math.max(measure(`${name} · ${line}`, 'sans'), 120) + 16
  const x = Math.round(W / 2 - w / 2)
  const y = TICKET.y + TICKET.h + 4
  paper(x, y, w, 16)
  text(`${name} · ${line}`, W / 2, y + 4, { color: INK, align: 'center' })
  if (t.autoAt < 0 && now - t.wonAt > 900) {
    const a = 0.55 + 0.45 * Math.sin(now / 300)
    g.globalAlpha = a
    text('click to continue', W / 2, y + 22, { color: CREAM, outline: INK0, align: 'center' })
    g.globalAlpha = 1
  }
}

// a code levels a hand type: the little paper chart slides out from behind the ticket
function chart(t: Lotto): void {
  const age = now - t.wonAt - 700
  if (age < 0) return
  const slide = ease(age / 280)
  const x = Math.round(TICKET.x + TICKET.w - 80 + 96 * slide)
  const y = 132
  pin('scratch/chart', x, y)
  const hand = t.prize.replace(/ \+1 level$/, '')
  const bar = Math.round(8 + 18 * ease((age - 280) / 400))
  g.fillStyle = '#e8501a'
  g.fillRect(x + 8, y + 58 - bar, 10, bar)
  g.fillStyle = '#ffb03a'
  g.fillRect(x + 8, y + 58 - bar, 10, 2)
  text(hand, x + 60, y + 28, { color: INK, align: 'center' })
  text('+1 level', x + 60, y + 42, { color: MONEY, align: 'center' })
}

// brass and absinthe rays turning slowly behind a grail
function rays(cx: number, cy: number, age: number): void {
  const a = Math.min(1, age / 300)
  g.save()
  g.translate(cx, cy)
  g.rotate(now / 4000)
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? `rgba(232,194,96,${0.22 * a})` : `rgba(111,207,111,${0.18 * a})`
    g.beginPath()
    g.moveTo(0, 0)
    g.arc(0, 0, 460, (i / 16) * Math.PI * 2, ((i + 0.6) / 16) * Math.PI * 2)
    g.closePath()
    g.fill()
  }
  g.restore()
}

function drawFlakes(): void {
  const floor = TICKET.y + TICKET.h + 2
  flakes = flakes.filter(f => now - f.at < 2600)
  for (const f of flakes) {
    const age = now - f.at
    const x = f.x + f.vx * age
    const y = Math.min(floor, f.y + f.vy * age + 0.0004 * age * age)
    g.globalAlpha = Math.min(1, (2600 - age) / 600)
    g.fillStyle = f.color
    g.fillRect(Math.round(x), Math.round(y), 1, 1)
  }
  g.globalAlpha = 1
}
