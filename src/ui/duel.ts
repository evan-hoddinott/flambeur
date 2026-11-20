import { forgePlan } from '../engine/forge.ts'
import { REF_SCORE } from '../engine/bot.ts'
import { progress, land, mix, juiceAt, spring, springs, stepSprings } from './motion.ts'
// the duel scene: you vs the rival across the table, drawn on one canvas from the atlases.
// layout is the art proof's (art/duel/review.py), in 640x360 stage units. main.ts owns the game,
// this file only draws a DuelState and reports clicks back through it
import { laneArt } from './lanes.ts'
import { sprite, canvas, ctx2d, blit, backCanvas, cardCanvas, stockScale, specialInk, type Sprite, nineSlice } from './art.ts'
import { GRADE, HYPE, MONEY as CASH, RARE, VALUE, modifierInk, starInk } from './ink.ts'
import { HAND_NAMES, evaluateHand, handNote } from '../engine/hands.ts'
import { handBase } from '../engine/scoring.ts'
import { STARTERS } from '../engine/starters.ts'
import { tableOf } from '../engine/economy.ts'
import { JOKERS, VARIANTS, knockoffName, traitName, type Card } from '../engine/cards.ts'
import { twistName, twistText } from '../engine/twists.ts'
import type { BetChoice, SeatView, ShowdownView } from '../engine/match.ts'
import { INSERTS, type Insert } from '../engine/shop.ts'
import type { Difficulty } from '../engine/match.ts'
import { insertFace, insertMark } from './placeholders.ts'
import { collectible, drawCollectible } from './collectibles.ts'
import type { Appraisal } from '../engine/scoring.ts'
import type { StarterId } from '../engine/starters.ts'
import * as sfx from './sound.ts'
import * as music from './music.ts'
import { drawTicket, type TicketIcon } from './ticket.ts'
import { announce, drawBand, runStrip, skipBand } from './frame.ts'
import { lang } from './lang.ts'
import { drawPanel, panelClick, panelHover, panelHoverAt, panelKey, panelOpen } from './panels.ts'
import { drawText, measure, wrapText, type TextStyle } from './font.ts'
import { closeDrawer, deckCounts, drawDrawer, drawerHoverAt, drawerKey, drawerOpen, drawerPointer, openDrawer, setCompareHover, setDrawerActions, setDrawerHover } from './drawer.ts'
import { drawFiche, fiche, ficheInput, setKeywords } from './fiche.ts'
import { drawTips, tip, tipShowing } from './tips.ts'
import { KEYWORDS, cardEntry, entry, type Entry } from '../engine/glossary.ts'
import { still as stillCards, frameGate, shake as shakeAmount, flash, stageScale, pref, pace } from './prefs.ts'
import { PAUSE_TAB, drawPause, openPause, pauseClick, pauseHoverAt, pauseOpen, pauseTab } from './pause.ts'
import { cursorFor } from './cursor.ts'

export type Kind = 'lock' | 'max' | 'min' | 'forge' | 'discard' | 'insert' | 'skip' | 'continue'
// primary = the one "move on" action that pulses. never a bet choice. stamp = the ink slam sprite when it's pressed
export type Slip = { label: string; price?: string; kind: Kind; primary?: boolean; enabled: boolean; stamp?: string; onClick: () => void }

export type DuelState = {
  view: SeatView
  settled: boolean // a revealed hand is on screen (view.showdown)
  tally: boolean // and the round is over: its money tally shows too
  counting: boolean // the appraisal count-up is running
  selected: Set<number>
  lastLocked: Card[] // what I played, so a fold or flambé result still shows it
  slips: Slip[]
  hint: string
  rival: { name: string; mask: string; stamp: string; back: StarterId }
  myMask: string
  toast: string // the latest log line
  clock: () => string // online turn timer, '' offline. read every frame
  onCard: (id: number) => void
  onPile: () => void
  insertSlot: number | null // the Sleeve slot you picked up, null = none
  onDropInsert: (slot: number, cardId: number) => void
  onInsert: (slot: number) => void // clicked a Sleeve slot
  onSpoil: (cardId: number) => void // clicked a spoils card (only when it's your pick)
  sort: HandSort // the hand comes in already sorted, this just lights the button
  onSort: (by: HandSort) => void
  bare?: boolean // showBareTable: the room and table as a backdrop for panels, nobody playing
}

export type HandSort = 'rank' | 'suit'

// ---------- constants from the art proof ----------

const W = 640
const H = 360
const RIVAL_X = 409
const FAR = 116 // felt far edge
const NEAR = 330 // felt near edge
const FELTS = ['green', 'blue', 'burgundy', 'black']
const RED = '#d04a4e'
const MONEY = CASH.felt
const INK = '#2e2320'
const CREAM = '#f6ecd2'
const BURGUNDY = '#7a1a2c'
const GOLD = '#e8c260'
const CROWD: [number, number][] = [
  [193, 127], [544, 130], [147, 135], [493, 129], [220, 127], [576, 134],
  [110, 126], [518, 126], [253, 131], [603, 133], [72, 128], [359, 132],
]
const NEAR_ROW = { cx: 311, y: 231, gap: 50, w: 44 }
const FAR_ROW = { cx: 365, y: 151, gap: 41, w: 36 }
const HAND_C = { x: 335, y: 298, r: 260 }
const MY_PILE = { x: 146, y: 251 }
const MY_DISCARD = { x: 470, y: 228 } // just left of the action column
const MY_PLATE_W = 196 // your plate is wider than the rival's: it carries your hand readout
const COL = { x: 508, w: 126, bottom: 352 } // the action column: messages, tally, tickets
const OUTLINE = '#0e0b0a' // text over the world gets a 1px ink outline
const STAMP_DIFFICULTY: Record<string, Difficulty> = { FACILE: 'easy', MOYEN: 'medium', 'GROS JOUEUR': 'hard' } // main.ts's plate stamps
const RIVAL_LINE: Record<BetChoice, string> = { max: 'Tapis.', min: 'Petite mise.' }
const BET_WORD: Record<BetChoice, string> = { max: 'Max', min: 'Min' }

// ---------- canvas + loop ----------

let cv: HTMLCanvasElement | null = null
let g: CanvasRenderingContext2D
let k = 1 // stage unit -> device px
let ox = 0
let oy = 0
let state: DuelState | null = null
let running = false
let now = 0
let mouse = { x: -1, y: -1 }
let overDrawer = false // the drawer took the mouse: the scene doesn't see it
let detachFiche: (() => void) | null = null
let bubble: { text: string; sub: string; t: number } | null = null
const stamps: { name: string; x: number; y: number; t: number }[] = []
const floats: { text: string; x: number; y: number; color: string; t: number }[] = []
const juice = new Map<string, number>() // key -> start time

type Hit = { x: number; y: number; w: number; h: number; onClick: () => void }
let hits: Hit[] = []
let deniedHits: Hit[] = [] // tickets you can't press: a click gets the dull tok
let cuffHits: { slot: number; x: number; y: number; w: number; h: number }[] = []
let dragInsert: { slot: number; x: number; y: number; pointer: number; moved: boolean } | null = null
let suppressClick = false
type CardHit = { id: number; x: number; y: number; r: number; w: number; h: number; onClick: () => void }
let cardHits: CardHit[] = []
let lastCardHits: CardHit[] = [] // last frame's, for hover while this frame is still drawing

const insertColors: Record<Insert, string> = {
  stylo: '#28497a', broyeuse: '#8c7656', photocopie: '#3e9ab0', reprint: '#c99a3a',
  foil: VALUE.paper, holo: HYPE.paper, prism: GRADE.paper, tampon: BURGUNDY, allumettes: '#e8501a',
  checklist: '#4a9a74', code: '#a82a38', wishlist: '#b088e0', grail: RARE,
}
type InsertTarget = { old: Card; card: Card; x: number; y: number; w: number; h: number; r: number }
let insertFx: { id: Insert; at: number; targets: InsertTarget[] } | null = null

export function insertUsed(id: Insert, cards: Card[]): void {
  if (!cv?.isConnected || !state || stillCards.matches) return
  const targets = cards.flatMap(card => {
    const pos = cardHits.find(h => h.id === card.id)
    if (!pos) return []
    pop('card' + card.id)
    return [{ ...pos, old: state!.view.me.hand.find(c => c.id === card.id) ?? card, card }]
  })
  insertFx = { id, targets, at: performance.now() }
  sfx.insert(id)
}

function insertEffect(): void {
  if (!insertFx) return
  const { id, at, targets } = insertFx
  const u = Math.max(0, (now - at) / 760)
  if (u >= 1) { insertFx = null; return }
  if (!targets.length) {
    pin(insertMark(id), SLEEVE_AT[0].x, SLEEVE_AT[0].y - 10 - u * 30, { s: 1 + Math.sin(u * Math.PI) * 0.4, alpha: 1 - u })
    return
  }
  for (const [i, target] of targets.entries()) {
    const { w, h } = target
    const old = cardCanvas(target.old)
    const next = cardCanvas(target.card)
    const sweep = Math.round(u * w)
    g.save()
    g.translate(target.x, target.y)
    g.rotate(target.r)
    g.translate(-w / 2, -h / 2)
    g.fillStyle = insertColors[id]
    if (id === 'broyeuse') {
      pin('scratch/broyeuse', w / 2 - 12, h * u - 13, { s: 1.5 })
      for (let n = 0; n < 8; n++) {
        const sw = old.width / 8
        g.globalAlpha = 1 - u
        g.drawImage(old, n * sw, 0, sw, old.height, n * w / 8 + Math.sin(u * 6 + n) * u * 6, u * u * (45 + n * 4), w / 8 - u, h)
      }
    } else if (id === 'reprint') {
      centered(next, w / 2 + (MY_DISCARD.x - target.x) * u * u, h / 2 + (MY_DISCARD.y - target.y) * u, w * (1 - u / 2), h * (1 - u / 2), -u / 3)
      pin('scratch/reprint', w / 2 - 8, h * u - 8, { alpha: 1 - u })
    } else if (id === 'allumettes' || id === 'prism') {
      if (id === 'allumettes') pin('scratch/allumettes', w / 2 - 8, h * (1 - u) - 9, { r: -u / 4 })
      g.globalAlpha = 1 - u
      g.drawImage(old, 0, 0, w, h)
      for (let n = 0; n < 12; n++) {
        const y = h * (1 - u) - Math.sin(n * 2 + u * 12) * 5
        g.fillStyle = n % 3 ? '#ff7a24' : GOLD
        g.fillRect(n * w / 12, y, 3, 3 + n % 5)
      }
    } else if (id === 'holo') {
      g.drawImage(old, 0, 0, w, h)
      g.save()
      g.beginPath()
      g.arc(w / 2, 4, Math.hypot(w, h) * u, 0, Math.PI * 2)
      g.clip()
      g.drawImage(next, 0, 0, w, h)
      g.restore()
      pin('scratch/holo', w / 2 - 8, 3 - 16 * (1 - Math.min(1, 4 * u)), { alpha: 1 - u })
    } else if (id === 'tampon') {
      pin('scratch/tampon', w / 2 - 12, h / 2 - 15 - 28 * Math.abs(2 * u - 1), { s: 1.5, alpha: Math.min(1, 3 - 3 * u) })
    } else {
      g.drawImage(old, 0, 0, w, h)
      if (sweep > 0) g.drawImage(next, 0, 0, next.width * sweep / w, next.height, 0, 0, sweep, h)
      if (id === 'stylo') {
        g.fillRect(3, 8, Math.min(10, sweep), 1)
        pin('scratch/stylo', Math.min(12, sweep), -5 + Math.sin(u * 28) * 2)
      } else if (id === 'photocopie' && i === 0) {
        g.globalAlpha = Math.sin(u * Math.PI) ** 6
        g.fillStyle = CREAM
        g.fillRect(0, 0, w, h)
      } else {
        g.fillStyle = insertColors[id]
        g.fillRect(sweep, 1, 2, h - 2)
        pin(insertMark(id), sweep - 8, 1, { alpha: 1 - u })
      }
    }
    g.restore()
  }
}

// the count-up's live numbers per side. null = show the final appraisal
type Live = { v: number; h: number; g: number; label: string; step: string }
let live: [Live, Live] | null = null

let forgeFx: { at: number; started: boolean; cards: Card[]; result?: Card; forged: boolean; bulk: number; landed: boolean; rang: boolean } | null = null
let reelAt = -Infinity
let pendingBust: number | null = null
let bustAt = -Infinity
let tallyAt = -Infinity
let tallyLine = -1
export function rivalBusted(seat: number): void { pendingBust = seat }
let markerAt = -Infinity
let pipAt = -Infinity

// what changed since the last view, as sound. driven by the view, so it works online too (docs/SOUND.md §4.3)
function listen(prev: DuelState | null, next: DuelState): void {
  if (!prev || prev.bare || next.bare) return
  const a = prev.view
  const b = next.view
  if (b.round !== a.round) {
    sfx.riffle() // the deck shuffles every round
    if (b.twist) sfx.twist()
  }
  const had = new Set(a.me.hand.map(c => c.id))
  const wait = b.round !== a.round ? 380 : 0
  b.me.hand.filter(c => !had.has(c.id)).forEach((c, i) => sfx.deal(i, handX(b.me.hand, c.id), false, wait))
  if (b.me.discardsLeft < a.me.discardsLeft) sfx.shove(MY_DISCARD.x)
  if (!a.me.locked) {
    for (const id of next.selected) if (!prev.selected.has(id)) sfx.select(true, springs.get(`card${id}`)?.at.x)
    for (const id of prev.selected) if (!next.selected.has(id) && !b.me.locked) sfx.select(false, springs.get(`card${id}`)?.at.x)
  }
  if (!a.me.locked && b.me.locked) sfx.lock(b.me.locked.length, b.me.lockKind === 'flamber')
  if (!a.bet && b.bet) sfx.ante()
  if (b.bet?.stage === 'push' && a.bet?.stage !== 'push') sfx.heartbeat()
  if (next.settled && !prev.settled && b.showdown) sfx.reveal(b.showdown.theirCards.length)
  if (!a.spoils && b.spoils) sfx.spoils(b.spoils.cards.length)
  if (a.spoils && b.spoils && b.spoils.picks.length > a.spoils.picks.length) {
    if (b.spoils.picks.at(-1)!.card) sfx.select(true)
    else sfx.coin()
  }
  if (a.spoils && !b.spoils && a.spoils.cards.length > 1) sfx.strike() // the last card burns
  if (next.tally && !prev.tally && b.last && b.last.outcome !== 'tie' && b.last.outcome !== 'bye') sfx.pot(b.last.outcome === 'loss')
}

// where a card sits in your fan, for the pan
function handX(hand: Card[], id: number): number {
  const n = hand.length
  const i = hand.findIndex(c => c.id === id)
  const th = n > 1 ? ((i - (n - 1) / 2) * Math.min(5.4, 38 / (n - 1)) * Math.PI) / 180 : 0
  return HAND_C.x + HAND_C.r * Math.sin(th)
}

export function showDuel(app: HTMLElement, next: DuelState): void {
  if (state?.view.hands?.hands.length !== next.view.hands?.hands.length) pipAt = performance.now()
  if (next.tally && !state?.tally && next.view.round % 3 === 0) {
    markerAt = performance.now()
    sfx.stamp()
  }
  if (state && next.view.round < state.view.round) {
    calledOut.clear()
    callout = null
    forgeFx = null
  }
  if (!next.settled) {
    bustAt = reelAt = tallyAt = -Infinity
    if (next.bare || next.view.phase === 'deal') pendingBust=null
  }
  if (pendingBust!==null && pendingBust===next.view.showdown?.opponent && next.settled && !next.counting) {
    pendingBust = null
    bustAt = performance.now()
    sfx.bust()
  }
  if (next.counting && !state?.counting) { tallyAt=-Infinity; tallyLine=-1 }
  const sd = next.view.showdown
  if (next.settled && sd?.myKind === 'flamber' && !stillCards.matches &&
      (!state?.settled || state.view.showdown?.hand !== sd.hand || state.view.round !== next.view.round)) {
    const previous = state?.view.me
    const before = previous ? [...previous.hand, ...(previous.locked ?? []), ...previous.pile, ...previous.discard] : []
    const known = new Set(before.map(c => c.id))
    const plan = forgePlan(sd.myCards)
    const current = [...next.view.me.hand, ...next.view.me.discard, ...next.view.me.pile]
    // the showdown's cards are already ground, so a grind is found against the cards from before the reveal
    const result = plan ? current.find(c => c.tier > 0 && !known.has(c.id)) :
      current.find(c => before.some(old => old.id === c.id && old.grind < c.grind))
    forgeFx = { at: performance.now(), started: false, cards: sd.myCards, result, forged: !!plan, bulk: plan ? plan.merged.length - 1 : 0, landed: false, rang: false }
  }
  listen(state, next)
  state = next
  init()
  // the drawer is shared with the shop: point its hovers and the Sleeve's use at this scene
  setDrawerHover(drawerFiche)
  setDrawerActions({ useInsert: slot => {
    if (!state || !sleeveUsable(state)) return
    closeDrawer()
    state.onInsert(slot)
  } })
  if (!cv || !cv.isConnected) {
    app.innerHTML = ''
    cv = document.createElement('canvas')
    cv.className = 'stage'
    app.appendChild(cv)
    g = ctx2d(cv)
    detachFiche?.()
    detachFiche = ficheInput(cv, toStage)
    cv.onpointerdown = e => {
      suppressClick = false
      if (!e.isPrimary || e.button !== 0 || calling() || drawerOpen() || overDrawer || panelOpen() || pauseOpen()) return
      const p = toStage(e)
      const cuff = cuffHits.find(h => Math.abs(p.x - h.x) <= h.w / 2 && Math.abs(p.y - h.y) <= h.h / 2)
      if (!cuff) return
      dragInsert = { slot: cuff.slot, ...p, pointer: e.pointerId, moved: false }
      cv?.setPointerCapture(e.pointerId)
    }
    cv.onpointermove = e => {
      mouse = toStage(e)
      overDrawer = drawerPointer(mouse.x, mouse.y, false)
      if (dragInsert?.pointer === e.pointerId && Math.hypot(mouse.x - dragInsert.x, mouse.y - dragInsert.y) > 3) dragInsert.moved = true
    }
    cv.onpointerup = e => {
      if (dragInsert?.pointer !== e.pointerId) return
      const drag = dragInsert
      dragInsert = null
      if (!drag.moved) return
      suppressClick = true
      const card = cardUnder(toStage(e))
      if (card) state?.onDropInsert(drag.slot, card.id)
    }
    cv.onlostpointercapture = () => { dragInsert = null }
    cv.onpointerleave = () => {
      mouse = { x: -1, y: -1 }
      overDrawer = drawerPointer(-1, -1, false)
    }
    cv.onclick = e => { if (!suppressClick) click(toStage(e)) }
    resize()
  }
  if (!running) {
    running = true
    requestAnimationFrame(frame)
  }
}

const noop = () => {}

// the duel room, table and felt as a backdrop, with the frame (run strip, drawer, band), panels and the Fiche.
// no hands, plates, tickets or rival. main.ts hosts the draft, starter box and results on it as Panels
export function showBareTable(app: HTMLElement, view: SeatView): void {
  showDuel(app, {
    view, bare: true, settled: false, tally: false, counting: false, selected: new Set(), lastLocked: [], slips: [], hint: '',
    rival: { name: '', mask: 'domino_red', stamp: '', back: 'standard' }, myMask: 'domino', toast: '', clock: () => '',
    onCard: noop, onPile: noop, insertSlot: null, onDropInsert: noop, onInsert: noop, onSpoil: noop, sort: 'rank', onSort: noop,
  })
}

// placeholder art and the keyword lines the Fiche's sub-boxes read. once, whichever scene comes up first
let ready = false
function init(): void {
  if (ready) return
  ready = true
  setKeywords(KEYWORDS)
}

// what the drawer reports under the mouse, as a Fiche
function drawerFiche(thing: { kind: string; id?: string; card?: Card } | null, a: { x: number; y: number; w: number; h: number }): void {
  if (!thing || !state) return
  const me = state.view.me
  if (thing.card) fiche(cardEntry(thing.card), a)
  else if (thing.kind === 'insert' && thing.id) fiche(entry('insert', thing.id, me.sleeve.find(s => s.id === thing.id)), a)
  else if (thing.kind === 'collectible' && thing.id) fiche(entry('collectible', thing.id, me.display.find(o => o.id === thing.id)), a)
  else throw new Error(`no fiche for drawer thing ${thing.kind}`)
}

const sleeveUsable = (st: DuelState) => !st.bare && st.view.phase === 'deal' && !st.view.me.locked && !st.settled

function say(choice: BetChoice): void {
  bubble = { text: RIVAL_LINE[choice], sub: BET_WORD[choice], t: now }
  pop('rival')
}

window.addEventListener('resize', () => resize())

function resize(): void {
  if (!cv) return
  const dpr = window.devicePixelRatio || 1
  cv.width = Math.round(innerWidth * dpr)
  cv.height = Math.round(innerHeight * dpr)
  k = stageScale(cv.width, cv.height, W, H)
  ox = Math.round((cv.width - W * k) / 2)
  oy = Math.round((cv.height - H * k) / 2)
  g.imageSmoothingEnabled = false
}

function toStage(e: MouseEvent): { x: number; y: number } {
  const dpr = window.devicePixelRatio || 1
  return { x: (e.clientX * dpr - ox) / k, y: (e.clientY * dpr - oy) / k }
}

// a click that lands on something always makes a sound: its own, or the press
function click(p: { x: number; y: number }): void {
  const mark = sfx.played()
  if (clicked(p)) sfx.quietSince(mark)
}

function clicked(p: { x: number; y: number }): boolean {
  if (pauseOpen()) {
    const on = pauseHoverAt(p) !== null
    pauseClick(p)
    return on
  }
  if (drawerPointer(p.x, p.y, true)) return drawerHoverAt() !== null
  if (panelOpen()) {
    const on = panelHoverAt(p) !== null
    panelClick(p)
    return on
  }
  if (calling()) {
    endCallout()
    return true
  }
  // topmost first: rects are pushed in draw order, cards draw over the felt but under the hud
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]
    if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) {
      h.onClick()
      return true
    }
  }
  const card = cardUnder(p)
  if (card) {
    card.onClick()
    return true
  }
  if (deniedHits.some(h => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h)) sfx.denied()
  return false
}

function cardUnder(p: { x: number; y: number }, list = cardHits): CardHit | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i]
    const dx = p.x - c.x
    const dy = p.y - c.y
    const lx = dx * Math.cos(-c.r) - dy * Math.sin(-c.r)
    const ly = dx * Math.sin(-c.r) + dy * Math.cos(-c.r)
    if (Math.abs(lx) <= c.w / 2 && Math.abs(ly) <= c.h / 2) return c
  }
  return null
}

const gate = frameGate()

function frame(t: number): void {
  if (!cv || !cv.isConnected || !state) {
    running = false
    return
  }
  if (!gate(t)) return void requestAnimationFrame(frame)
  const dt = Math.min(0.05, (t - now) / 1000 || 0)
  now = t
  stepSprings(dt)
  cuffHits = []
  hits = []
  deniedHits = []
  looks = []
  lastCardHits = cardHits
  cardHits = []
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = '#0e0b0a'
  g.fillRect(0, 0, cv.width, cv.height)
  // a throw in draw still lands in the console every frame, but the next frame is already booked so the game doesn't freeze
  requestAnimationFrame(frame)
  // the frame's layers sit over the scene: the band, a panel, the rules sheet, the drawer, the Fiche last.
  // whichever of them has the mouse, the scene doesn't see it
  const real = mouse
  const off = { x: -1, y: -1 }
  const paused = pauseOpen()
  const covered = !paused && (overDrawer || drawerOpen())
  if (paused || covered || panelOpen()) mouse = off
  spoilsShown = false
  draw(state)
  mouse = real
  if (!spoilsShown && spoilHover) {
    spoilHover = null
    setCompareHover(null)
  }
  drawBand(g, now)
  drawPanel(g, now, covered || paused ? off : mouse)
  drawDrawer(g, state.view, now)
  drawTips(g, drawerOpen() || paused)
  drawFiche(g)
  drawPause(g, mouse)
  if (paused) {
    const key = pauseHoverAt(mouse)
    cv.style.cursor = cursorFor(key ? 'pointer' : 'default')
    return sfx.hover(key)
  }
  cv.style.cursor = cursorFor((covered ? overDrawer : panelOpen() ? panelHover(mouse) : hoverable()) ? 'pointer' : 'default')
  const layer = covered ? drawerHoverAt() : panelOpen() ? panelHoverAt(mouse) : undefined
  if (layer !== undefined) sfx.hover(layer?.key ?? null, layer?.card, layer?.x)
  else sceneHover()
}

// the hover tick: a rect's index and size (stable while things sway), or a card's id
function sceneHover(): void {
  const p = mouse
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]
    if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return sfx.hover(`duel${i}:${Math.round(h.w)}x${Math.round(h.h)}`)
  }
  const card = cardUnder(p)
  sfx.hover(card ? `card${card.id}` : null, true, card?.x)
}

function hoverable(): boolean {
  const p = mouse
  if (hits.some(h => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h)) return true
  return !!cardUnder(p)
}

// ---------- springs + juice ----------

function pop(key: string): void {
  juice.set(key, now)
}

// scale and wobble for a juiceUp, ~0.3s
function juiced(key: string): { s: number; r: number } {
  return juiceAt(juice,key,now)
}

// ---------- draw helpers (stage units) ----------

type Pin = { r?: number; s?: number; sx?: number; sy?: number; flip?: boolean; alpha?: number }

function pin(name: string, x: number, y: number, o: Pin = {}): void {
  const s = sprite(name)
  g.save()
  g.translate(x, y)
  if (o.r) g.rotate(o.r)
  const sx = (o.s ?? 1) * (o.sx ?? 1) * (o.flip ? -1 : 1)
  const sy = (o.s ?? 1) * (o.sy ?? 1)
  g.scale(sx, sy)
  if (o.alpha !== undefined) g.globalAlpha = o.alpha
  g.drawImage(s.img, s.x, s.y, s.w, s.h, -s.px, -s.py, s.w, s.h)
  g.restore()
}

function centered(img: CanvasImageSource, x: number, y: number, w: number, h: number, r = 0, alpha = 1): void {
  g.save()
  g.translate(x, y)
  if (r) g.rotate(r)
  g.globalAlpha = alpha
  g.drawImage(img, -w / 2, -h / 2, w, h)
  g.restore()
}

function tile(name: string, x: number, y: number, w: number, h: number, c = g): void {
  const s = sprite(name)
  for (let ty = 0; ty < h; ty += s.h) {
    for (let tx = 0; tx < w; tx += s.w) {
      const cw = Math.min(s.w, w - tx)
      const ch = Math.min(s.h, h - ty)
      c.drawImage(s.img, s.x, s.y, cw, ch, x + tx, y + ty, cw, ch)
    }
  }
}

// corners stay native size, edges and middle stretch. tint multiplies a greyscale sprite by a color
function nine(name: string, x: number, y: number, w: number, h: number, tint?: string): void {
  nineSlice(g, name, x, y, w, h, tint)
}

// a canvas in one flat color, cached, for hover outlines
const sils = new Map<HTMLCanvasElement, HTMLCanvasElement>()
function silhouette(img: HTMLCanvasElement): HTMLCanvasElement {
  let c = sils.get(img)
  if (!c) {
    c = canvas(img.width, img.height)
    const sg = ctx2d(c)
    sg.drawImage(img, 0, 0)
    sg.globalCompositeOperation = 'source-in'
    sg.fillStyle = CREAM
    sg.fillRect(0, 0, c.width, c.height)
    sils.set(img, c)
  }
  return c
}
const AROUND = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const

// every string on the stage goes through here. y is the top of the line box
type TextOpt = TextStyle & { alpha?: number }

function text(s: string, x: number, y: number, o: TextOpt = {}): void {
  if (o.alpha === undefined) return drawText(g, s, x, y, o)
  g.save()
  g.globalAlpha = Math.max(0, o.alpha)
  drawText(g, s, x, y, o)
  g.restore()
}

const wrap = wrapText

function hit(x: number, y: number, w: number, h: number, onClick: () => void): boolean {
  hits.push({ x, y, w, h, onClick })
  return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h
}

// ---------- the Fiche on hover ----------
// everything with rules meaning pushes a look as it draws. at the end of the frame the topmost one under
// the mouse gets its Fiche. the entry is only built for that one

type Look = { x: number; y: number; w: number; h: number; r: number; e: () => Entry; above: boolean }
let looks: Look[] = []
const STACK = { x: 508, y: 226, w: 126, h: 126 } // the action stack, the Fiche never covers it
const FICHE_W = 162 // the box at its widest, with padding
const FICHE_H = 130 // a tall one

// x, y = top-left
function look(x: number, y: number, w: number, h: number, e: () => Entry, above = false): void {
  looks.push({ x: x + w / 2, y: y + h / 2, w, h, r: 0, e, above })
}

// a card drawn centered at x, y, turned by r
function lookCard(card: Card, x: number, y: number, w: number, h: number, r: number, above = false): void {
  looks.push({ x, y, w, h, r, e: () => cardEntry(card), above })
}

function lookUnder(p: { x: number; y: number }, l: Look): boolean {
  const dx = p.x - l.x
  const dy = p.y - l.y
  const lx = dx * Math.cos(-l.r) - dy * Math.sin(-l.r)
  const ly = dx * Math.sin(-l.r) + dy * Math.cos(-l.r)
  return Math.abs(lx) <= l.w / 2 && Math.abs(ly) <= l.h / 2
}

function showLook(): void {
  if (dragInsert?.moved) return
  let l: Look | undefined
  for (let i = looks.length - 1; i >= 0 && !l; i--) if (lookUnder(mouse, looks[i])) l = looks[i]
  if (!l) return
  // the box around a turned card
  const w = Math.abs(l.w * Math.cos(l.r)) + Math.abs(l.h * Math.sin(l.r))
  const h = Math.abs(l.w * Math.sin(l.r)) + Math.abs(l.h * Math.cos(l.r))
  const a = { x: l.x - w / 2, y: l.y - h / 2, w, h }
  if (l.above) return fiche(l.e(), a, { above: true })
  // right of the thing, unless that lands on the action stack: then left of it (an anchor that runs
  // to the stage edge leaves no room on the right, so the Fiche flips)
  const right = a.x + a.w + 4
  const covers = right < STACK.x + STACK.w && right + FICHE_W > STACK.x && a.y < STACK.y + STACK.h && a.y + FICHE_H > STACK.y
  fiche(l.e(), covers ? { x: a.x, y: a.y, w: W - a.x, h: a.h } : a)
}

// a pinned sprite's box, for a look
function spriteBox(name: string, x: number, y: number): { x: number; y: number; w: number; h: number } {
  const s = sprite(name)
  return { x: x - s.px, y: y - s.py, w: s.w, h: s.h }
}

const rule = (id: string, ctx?: unknown) => () => entry('hud', id, ctx)

const fmt = (n: number) => n.toLocaleString('en-US')
// hype goes fractional once a × lands: show one decimal
const hypeText = (h: number) => (Number.isInteger(h) ? fmt(h) : h.toFixed(1))

// ---------- cached layers ----------

// room and felt only change per Table (and on tournament rounds), so they're drawn once
let roomKey = ''
let roomLayer: HTMLCanvasElement | null = null
let feltLayer: HTMLCanvasElement | null = null

function layers(table: number, tournament: boolean): void {
  const key = `${table}|${tournament}|${lang()}|${pref('post')}`
  if (key === roomKey) return
  roomKey = key
  roomLayer = buildRoom()
  feltLayer = buildFelt(table, tournament)
}

function buildRoom(): HTMLCanvasElement {
  const c = canvas(W, 160)
  const r = ctx2d(c)
  tile('room/wall', 0, 0, W, 122, r)
  blit(r, 'room/chalkboard', 34, 28) // the run strip is pinned over its top
  // vignette toward the sides
  const img = r.getImageData(0, 0, W, 151)
  for (let y = 0; y < 151; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const dark = 96 * pref('post') * Math.abs((x - 319.5) / 320) ** 1.8 / 255
      img.data[i] = img.data[i] * (1 - dark) + 9 * dark
      img.data[i + 1] = img.data[i + 1] * (1 - dark) + 3 * dark
      img.data[i + 2] = img.data[i + 2] * (1 - dark) + 10 * dark
    }
  }
  r.putImageData(img, 0, 0)
  return c
}

// a pile print with its painted word (rows 77-83, between the corner marks) cleared out
function unworded(name: string): HTMLCanvasElement {
  const s = sprite(name)
  const c = canvas(s.w, s.h)
  const p = ctx2d(c)
  p.drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h)
  p.clearRect(14, 77, s.w - 28, 7)
  return c
}

function buildFelt(table: number, tournament: boolean): HTMLCanvasElement {
  const c = canvas(W, H)
  const f = ctx2d(c)
  const src = sprite(`felt/${FELTS[table - 1]}`)
  const fh = NEAR - FAR
  // one projected scanline of the weave per row, pixels shrink toward the far edge
  for (let y = 0; y < fh; y++) {
    const depth = y / (fh - 1)
    const scale = 0.51 + 0.49 * depth
    const size = Math.max(1, Math.round(src.w * scale))
    const sy = Math.floor((fh * 2.3 * depth) / (0.7 + 0.3 * depth)) % src.h
    for (let x = (320 % size) - size; x < W; x += size) f.drawImage(src.img, src.x, src.y + sy, src.w, 1, x, FAR + y, size, 1)
  }
  // lamp lighting: dark toward the edges, a warm pool in the middle
  const img = f.getImageData(0, FAR, W, fh)
  const pool = tournament || table >= 3 ? [232, 174, 112] : [246, 226, 159]
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const d = ((x - 318) / 365) ** 2 + ((y - 82) / 210) ** 2
      const dark = Math.min(135, 14 + 60 * d) / 255
      const warm = (23 * Math.exp(-(((x - 320) / 195) ** 2) - ((y - 72) / 88) ** 2)) / 255
      for (let ch = 0; ch < 3; ch++) img.data[i + ch] = img.data[i + ch] * (1 - dark) * (1 - warm) + pool[ch] * warm
    }
  }
  f.putImageData(img, 0, FAR)
  if (table === 4) for (const y of [122, 310]) tile('felt/print/inlay', 0, y, W, 12, f)
  const print = (name: string, x: number, y: number, w: number, h: number) => {
    const s = sprite(name)
    f.save()
    f.imageSmoothingEnabled = true // thin ink lines survive the squash
    f.globalAlpha = table === 4 ? 1 : 0.8
    f.drawImage(s.img, s.x, s.y, s.w, s.h, Math.round(x - w / 2), Math.round(y - h / 2), w, h)
    f.restore()
  }
  for (const row of [{ ...FAR_ROW, h: 21 }, { ...NEAR_ROW, h: 32 }]) {
    for (let n = -2; n <= 2; n++) print('felt/print/spot', row.cx + n * row.gap, row.y, row.w, row.h)
  }
  print('felt/print/pot', 322, 191, 145, 35)
  print('felt/print/crest', 307, 191, 49, 28)
  // the pile prints come with PIOCHE / DÉFAUSSE painted in. that band is cleared and the word drawn as text, so it
  // reads in either language
  for (const [name, x, y, s] of [['pile', 223, 158, 0.64], ['pile', MY_PILE.x, MY_PILE.y, 0.96], ['discard', MY_DISCARD.x, MY_DISCARD.y, 0.84]] as const) {
    const w = Math.round(72 * s)
    const h = Math.round(55 * s)
    const art = unworded(`felt/print/${name}`)
    f.save()
    f.imageSmoothingEnabled = true
    f.globalAlpha = table === 4 ? 1 : 0.8
    f.drawImage(art, Math.round(x - w / 2), Math.round(y - h / 2), w, h)
    drawText(f, name === 'pile' ? 'PIOCHE' : 'DÉFAUSSE', x, Math.round(y - h / 2 + h * 0.84) - 3, { font: 'tiny', color: '#8c7656', align: 'center' })
    f.restore()
  }
  tile('rail/far', 0, FAR - 4, W, 6, f)
  tile('rail/near', 0, NEAR - 4, W, 18, f)
  const stud = sprite('rail/stud')
  for (let x = 6; x < W; x += 12) f.drawImage(stud.img, stud.x, stud.y, stud.w, stud.h, x - 1, NEAR + 5, stud.w, stud.h)
  return c
}

// a squared deck of backs in table perspective (art/duel/deckstack.py), cached at 4x then drawn down
const piles = new Map<string, HTMLCanvasElement>()
function pileCanvas(box: StarterId | null, count: number, scale: number, messy: boolean): HTMLCanvasElement {
  const key = `${box}|${count}|${scale}|${messy}`
  const hit_ = piles.get(key)
  if (hit_) return hit_
  const s = scale * 4
  const front = Math.max(1, Math.round(49 * s))
  const depth = Math.max(1, Math.round(46 * s))
  const lean = Math.max(1, Math.round(15 * s))
  const height = count > 1 ? Math.max(1, Math.round(((count - 1) * s) / 2)) : 0
  const c = canvas(front + lean, depth + height)
  const p = ctx2d(c)
  if (height) {
    const edge = sprite(messy ? 'pile/messy' : 'pile/stack')
    const side = sprite('pile/side')
    const strip = Math.max(1, Math.round(edge.h * s))
    for (let y = 0; y < height; y += strip) p.drawImage(edge.img, edge.x, edge.y, edge.w, edge.h, 0, depth + y, front, strip)
    p.save()
    p.setTransform(1, -depth / lean, 0, 1, front, depth)
    for (let y = 0; y < height; y += strip) p.drawImage(side.img, side.x, side.y, side.w, side.h, 0, y, lean, strip)
    p.restore()
  }
  const back = backCanvas(box)
  p.save()
  p.setTransform(front / 64, 0, -lean / 88, depth / 88, lean, 0)
  p.drawImage(back, 0, 0)
  p.restore()
  piles.set(key, c)
  return c
}

// returns the pile's top edge
function drawPile(x: number, y: number, scale: number, box: StarterId | null, count: number, messy = false, lit = false): number {
  const bottom = y + Math.floor(Math.round(55 * scale) / 3)
  if (count <= 0) return bottom - 20
  const c = pileCanvas(box, count, scale, messy)
  const w = c.width / 4
  const h = c.height / 4
  g.save()
  g.imageSmoothingEnabled = true
  if (lit) for (const [dx, dy] of AROUND) g.drawImage(silhouette(c), x - w / 2 + dx, bottom - h + dy, w, h)
  g.drawImage(c, x - w / 2, bottom - h, w, h)
  g.restore()
  return bottom - h
}

// jetons and plaques for an amount, biggest first, a few stacks side by side
function chips(x: number, y: number, amount: number, scale: number): void {
  if (amount <= 0) return
  const stacks: [string, number, number][] = [] // key, count, width
  let left = amount
  for (const [v, key, w] of [[500, 'plaque/500', 28], [100, 'plaque/100', 28], [25, 'jeton/25', 16], [5, 'jeton/5', 16], [1, 'jeton/1', 16]] as const) {
    const n = Math.floor(left / v)
    left -= n * v
    if (n) stacks.push([key, Math.min(n, 12), w])
  }
  const shown = stacks.slice(0, 4)
  const total = shown.reduce((a, s) => a + s[2], 0) * scale
  let cx = x - total / 2
  shown.forEach(([key, n, w], i) => {
    const sw = w * scale
    const sx = cx + sw / 2
    cx += sw
    const bottom = y + (i % 2) * 2
    const lift = Math.max(1, Math.round(2 * scale))
    const edge = sprite(`chip/${key}/edge`)
    const top = sprite(`chip/${key}/top`)
    for (let j = 0; j < n; j++) centered(sub(edge), sx, bottom - j * lift, sw, Math.max(2, edge.h * scale))
    centered(sub(top), sx, bottom - n * lift - 1, sw, top.h * scale)
  })
}

// a sprite cut to its own canvas, for drawImage calls that scale to a box
const subs = new Map<Sprite, HTMLCanvasElement>()
function sub(s: Sprite): HTMLCanvasElement {
  let c = subs.get(s)
  if (!c) {
    c = canvas(s.w, s.h)
    ctx2d(c).drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h)
    subs.set(s, c)
  }
  return c
}

// red lamp shade for tournament rounds
let redShade: HTMLCanvasElement | null = null
function shadeImg(red: boolean): HTMLCanvasElement {
  const plain = sub(sprite('lamp/shade'))
  if (!red) return plain
  if (redShade) return redShade
  const c = canvas(plain.width, plain.height)
  const r = ctx2d(c)
  r.filter = 'grayscale(1) brightness(1.6)'
  r.drawImage(plain, 0, 0)
  r.filter = 'none'
  r.globalCompositeOperation = 'multiply'
  r.fillStyle = RED
  r.fillRect(0, 0, c.width, c.height)
  r.globalCompositeOperation = 'destination-in'
  r.drawImage(plain, 0, 0)
  redShade = c
  return c
}

// ---------- the scene ----------

function draw(st: DuelState): void {
  const view = st.view
  const table = Math.min(4, tableOf(view.round)) // sudden death past round 12 stays at the last table's felt
  const tournament = !!view.twist
  layers(table, tournament)
  const t = now / 1000

  // the camera holds still. it only moves on a beat: the reel push-in, a call-out's impact, a ★3 flambé
  g.setTransform(k, 0, 0, k, ox, oy)
  g.save()
  g.beginPath()
  g.rect(0, 0, W, H)
  g.clip()
  const forgeShake=forgeFx?.started && forgeFx.result?.tier===3 && now-forgeFx.at>=FORGE.burn ? 4*shakeAmount()*(1-progress(now-forgeFx.at-FORGE.burn,450)) : 0
  const impact = calling() ? shakeAmount() * Math.max(0, 1 - (now - callout!.t) / 200) : 0
  g.translate(320 + forgeShake*Math.sin(now*.08) + impact * Math.sin(now * 0.12) * 2, 180 - impact * 2)
  const age = now-reelAt
  const push = !stillCards.matches && age<1200 ? .03*Math.sin(Math.PI*progress(age,1200)) : 0
  const zoom = 1 + push + (forgeShake || impact ? 0.015 : 0) // a shake zooms in a hair so it never shows the stage edge
  g.scale(zoom, zoom)
  g.translate(-320, -180)

  room(st, tournament, t)
  lamp(tournament, t, st.bare ? 0 : flash(Math.max(turnFlare(st),push*36)))
  if (st.bare) {
    g.drawImage(feltLayer!, 0, 0)
    you(st, t)
    g.restore()
    g.setTransform(k, 0, 0, k, ox, oy)
    g.save()
    g.beginPath()
    g.rect(0, 0, W, H)
    g.clip()
    frameZones(st)
    showLook()
    g.restore()
    return
  }
  rival(st, t)
  g.drawImage(feltLayer!, 0, 0)
  tableTop(st)
  if (Number.isFinite(bustAt) && !stillCards.matches) {
    const age=now-bustAt
    for(let i=0;i<5;i++) {
      const u=progress(age-i*35,340)
      if(u<1) pin('scratch/jeton',mix(RIVAL_X,150,u),mix(134,245,u)-12*Math.sin(Math.PI*u),{s:.7})
    }
    if(age>=540) {
      const u=progress(age-540,430)
      pin(`mask/${st.rival.mask}/front`,mix(RIVAL_X,327,u),mix(59,202,u)-75*Math.sin(Math.PI*u),{r:u*2.8,sy:1-u*.57})
      if(age<1130) pin('fx/leak',-160+800*progress(age-540,600),0,{alpha:flash(.33*pref('post'))})
    }
  }
  // bet tickets sit on top of face-down cards, but under the cards once they're face up and scoring
  const showdown = st.settled && !!st.view.showdown
  if (showdown) feltBets(st)
  playedCards(st)
  if (!showdown) feltBets(st)
  you(st, t)
  g.restore()

  g.setTransform(k, 0, 0, k, ox, oy)
  g.save()
  g.beginPath()
  g.rect(0, 0, W, H)
  g.clip()
  sleeveCards(st, t)
  hand(st, t)
  insertGhost(st, t)
  hud(st, t)
  caseShelf(st) // over the hud: during the count-up the shelf is the thing to watch, even over the twist sign
  insertEffect()
  effects()
  calloutBanner(st)
  showLook()
  g.restore()
}

function room(st: DuelState, tournament: boolean, t: number): void {
  const view = st.view
  g.drawImage(roomLayer!, 0, 0)
  // patrons get busier each Table, and crowd in on tournament rounds. sudden death stays on Table IV
  const table = Math.min(4, tableOf(view.round))
  const n = Math.min(CROWD.length, table * 2 + (tournament ? 4 : 0))
  const scale = tournament ? 1.15 : 1
  for (let i = 0; i < n; i++) {
    const [x, baseline] = CROWD[i]
    const jump = !stillCards.matches && calling() ? Math.max(0, 1 - (now - callout!.t) / 460) : 0
    const y = baseline - Math.abs(Math.sin(jump * Math.PI * 2)) * jump * 7
    const id = (i % 6) + 1
    const sway = Math.sin(t * 0.7 + i * 1.7) * 0.02
    const lean = [0, 3, -3, 2, -2, 0][id - 1] + Math.sin(t * 0.4 + i) * 1.2
    pin(`crowd/${id}`, x, y, { s: scale, r: sway * 0.3 })
    pin(`crowd/${id}/head`, x + lean * scale, y - 40 * scale, { s: scale, r: sway })
    pin(`crowd/${id}/mask`, x + lean * scale, y - 40 * scale, { s: scale, r: sway })
  }
  for (const [i, [x, y]] of ([[169, 56], [562, 83]] as const).entries()) {
    pin('room/sconce', x, y)
    const f = 1 + (Math.floor(t * 8 + i * 3) % 3)
    pin(`room/sconce/flame/${f}`, x + 1, y - 1)
    glow(x + 1, y - 4, 16, 'rgba(255,176,58,0.18)')
  }
  // curtains, a slow sway
  for (const flip of [false, true]) {
    const x = flip ? 639 : 0
    const r = Math.sin(t * 0.6 + (flip ? 1 : 0)) * 0.012 * (flip ? -1 : 1)
    pin('room/curtain/L', x, 0, { flip, r })
    pin('room/curtain/cord', x, 96, { flip })
    pin('room/curtain/tassel', flip ? x - 21 : 21, 118, { flip, r: Math.sin(t * 1.3) * 0.05 })
  }
  // chalkboard: tonight's stakes. the round itself is on the run strip above it
  text(`Ante $${view.blinds.ante}`, 82, 58, { font: 'chalk', color: '#e3d2a8', align: 'center' })
  text(`Max $${view.blinds.max}`, 82, 73, { font: 'chalk', color: '#bfa77e', align: 'center' })
  look(50, 57, 64, 14, () => entry('keyword', 'Ante'))
  look(50, 72, 64, 14, rule('max'))
}

function twistLabel(v: SeatView): string {
  return v.twist ? twistName(v.twist) : ''
}

function glow(x: number, y: number, r: number, color: string): void {
  const grad = g.createRadialGradient(x, y, 0, x, y, r)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(x - r, y - r, r * 2, r * 2)
}

// flare: 0..1, the lamp brightens for a moment when it's your turn
function lamp(tournament: boolean, t: number, flare = 0): void {
  const sway = Math.sin(t / 8 * Math.PI * 2) * 0.0105
  // the light cone first, so the shade sits on top of it
  g.save()
  g.translate(320, 0)
  g.rotate(sway)
  const cone = g.createLinearGradient(0, 61, 0, 200)
  const warm = tournament ? '208,74,78' : '246,207,117'
  cone.addColorStop(0, `rgba(${warm},${0.16 + 0.3 * flare})`)
  cone.addColorStop(1, `rgba(${warm},0)`)
  g.fillStyle = cone
  g.beginPath()
  g.moveTo(-28, 61)
  g.lineTo(28, 61)
  g.lineTo(150, 200)
  g.lineTo(-150, 200)
  g.closePath()
  g.fill()
  tile('lamp/rod', -2, 0, 4, 30)
  pin('lamp/fitting', 0, 29 + 6)
  const shade = shadeImg(tournament)
  g.drawImage(shade, -60, 33)
  pin('lamp/bulb', 0, 59)
  glow(0, 62, 34 + 30 * flare, tournament ? `rgba(255,120,110,${0.25 + 0.3 * flare})` : `rgba(255,240,176,${0.22 + 0.3 * flare})`)
  g.restore()
}

function rival(st: DuelState, t: number): void {
  const view = st.view
  const them = view.others[0]
  const b = view.bet
  const thinking = !st.settled && !!b && b.toAct === them.seat
  const lost = st.settled && view.showdown?.winner === view.me.seat
  const won = st.settled && view.showdown?.winner === them.seat
  const breathe = 1 + 0.01 * (0.5 + 0.5 * Math.sin(t / 4 * Math.PI * 2))
  const slump = lost ? 3 : 0
  const j = juiced('rival')
  const torsoY = 120 + slump
  // thinking: the head tips side to side and nods, so the wait reads as them deciding
  const tilt = thinking ? 0.12 * Math.sin(t * 2.2) : lost ? 0.1 : won ? -0.05 : 0
  pin('rival/torso', RIVAL_X, torsoY, { sy: breathe, r: won ? -0.05 : 0 })
  for (const side of ['L', 'R'] as const) {
    const dir = side === 'L' ? -1 : 1
    pin('rival/arm/upper/' + side, RIVAL_X + dir * 28 - 8, torsoY - 38, { s: 0.76, r: -dir * 0.18 })
    pin('rival/arm/fore/' + side, RIVAL_X + dir * 33 - 5, torsoY - 14, { s: 0.72, r: dir * 1.32 })
  }
  const nod = thinking ? 1.5 * Math.abs(Math.sin(t * 4.4)) : 0
  const headY = torsoY - 41 * breathe - 0.3 * Math.sin(t / 4 * Math.PI * 2 - 0.4) + nod
  g.save()
  g.translate(RIVAL_X, headY)
  g.rotate(tilt + j.r)
  g.scale(j.s, j.s)
  pin('rival/head', 0, 0)
  // blink every few seconds
  const blink = (t % 4.3) < 0.09
  pin(`rival/eyes/${blink ? 'half' : b?.choices.some(c => c.seat === them.seat && c.choice === 'max') && (t % 1.2) < 0.3 ? 'glint1' : 'open'}`, 0, -21)
  if (stillCards.matches || now-bustAt<540 || !Number.isFinite(bustAt)) {
    pin(`mask/${st.rival.mask}/front`, 0, -21)
    if(Number.isFinite(bustAt) && now-bustAt>260) pin('mask/crack/'+(now-bustAt<415?1:2),0,-21)
  }
  g.restore()
  // their fan of backs, face-up for any card you're allowed to see
  if (st.settled && view.showdown) {
    if (won && t % 3 < 1.6) {
      pin('rival/hand/smoke', RIVAL_X + 14, 88, { s: 0.72, alpha: pref('post') })
      pin('rival/holder', RIVAL_X + 20, 92, { s: 0.75, r: -0.3 })
    } else pin('rival/hand/tap/' + (1 + Math.floor(t * 5) % 3), RIVAL_X + 11, 106 + slump, { s: 0.72 })
    return
  }
  const shown: Card[] = [...them.marked]
  const n = st.settled || view.phase === 'spoils' ? 0 : them.handSize
  const step_ = n > 1 ? Math.min(8, 48 / (n - 1)) : 0
  for (let i = 0; i < n; i++) {
    const m = i - (n - 1) / 2
    const card = shown[i]
    const target = { x: RIVAL_X + m * step_, y: 104 + Math.abs(m) * 1.5 + slump, r: (m * 8 * Math.PI) / 180, s: 1 }
    const at = spring(`rfan${i}`, target, { x: RIVAL_X, y: 140, r: 0, s: 1 })
    if (card) {
      const { w, h } = drawCard(card, at.x, at.y, 0.5, at.r)
      lookCard(card, at.x, at.y, w, h, at.r)
    } else centered(backCanvas(st.rival.back), at.x, at.y, 32, 44, at.r)
  }
  pin('rival/hand/hold/L', RIVAL_X - 26, 104 + slump, { s: 0.72 })
  const pose = view.phase === 'spoils' ? 'push' : thinking ? 'tap' : 'hold'
  const last = pose === 'hold' ? 'R' : 1 + Math.floor(t * 5) % 3
  pin(`rival/hand/${pose}/${last}`, RIVAL_X + 11, 106 + slump, { s: 0.72 })

}

function tableTop(st: DuelState): void {
  const view = st.view
  const me = view.me
  const them = view.others[0]
  drawPile(223, 158, 0.64, st.rival.back, Math.max(0, them.deckSize - them.handSize))
  // your pile is a passive count (the drawer's Étui is the deck), but a click opens the Étui too
  const over = hit(110, 206, 72, 66, () => openDrawer('etui'))
  look(110, 206, 72, 66, rule('pile'))
  const top = drawPile(MY_PILE.x, MY_PILE.y, 0.96, me.starter, me.pile.length, false, over)
  const n = deckCounts(view)
  text(over ? `Deck · ${n.pile}/${n.total} · D` : `${n.pile}/${n.total}`, MY_PILE.x, top - 9, { font: 'tiny', color: over ? CREAM : '#bfa77e', align: 'center', outline: OUTLINE })
  drawPile(MY_DISCARD.x, MY_DISCARD.y, 0.84, me.starter, me.discard.length, true)
  look(MY_DISCARD.x - 30, MY_DISCARD.y - 24, 60, 46, rule('discard-pile'))
  // the pot with its number. the plates carry the bankrolls
  const b = view.bet
  const pot = b ? 2 * b.stake + (b.onMax[0] ? b.extra : 0) + (b.onMax[1] ? b.extra : 0) : 0
  chips(346, 193, pot, 0.95)
  if (pot) {
    text(`$${pot}`, 374, 184, { font: 'sans', color: MONEY, align: 'center', bold: true, outline: OUTLINE })
    look(326, 176, 64, 22, () => entry('keyword', 'Pot'))
  }
}

// both sides' bets as tickets lying on the felt, so the table reads like the conversation it was:
// the rival's right of the pot, yours left of it. each one slams down the first time it shows,
// and the rival's also gets their line in the bubble. driven by the view, so it works online too
const FELT_TW = 96
const FELT_AT = { me: { x: 252, y: 206 }, them: { x: 446, y: 178 } } // ticket centers
// face up, the rows take the felt: yours goes right of your score tag, theirs under their tag, clear of their row
const SHOWDOWN_AT = { me: { x: 414, y: 280 }, them: { x: 518, y: 146 } }
const seenBets = new Set<string>()
function feltBets(st: DuelState): void {
  const view = st.view
  if (view.phase === 'spoils' && !st.tally) return
  const last = st.tally ? view.last : null
  const bets = last ? last.bets : view.bet?.choices ?? []
  const round = last ? last.round : view.round
  const showdown = st.settled && !!view.showdown
  const count = { me: 0, them: 0 }
  bets.forEach((b, i) => {
    const side = b.seat === view.me.seat ? 'me' : 'them'
    const n = count[side]++
    const tilt = side === 'me' ? -0.07 + n * 0.09 : 0.08 - n * 0.1
    const at0 = showdown ? SHOWDOWN_AT[side] : FELT_AT[side]
    const target = { x: at0.x + n * 8, y: at0.y + n * (showdown ? 10 : 19), r: tilt, s: 1 }
    const key = `felt${round}:${i}`
    if (!seenBets.has(key)) {
      seenBets.add(key)
      stamps.push({ name: `hud/stamp/${b.choice}`, x: target.x, y: target.y, t: now })
      if (b.choice === 'max') sfx.push(side === 'them')
      else sfx.chip(side === 'them')
      if (side === 'them') say(b.choice)
    }
    const at = spring(key, target, { x: target.x, y: target.y - 30, r: tilt * 4, s: 2.2 })
    if (n === 0 && !showdown) text(side === 'me' ? 'Vous' : st.rival.name, at.x - FELT_TW / 2 + 4, at.y - 24, { font: 'sans', color: CREAM, outline: OUTLINE })
    g.save()
    g.translate(at.x, at.y)
    g.rotate(at.r)
    g.scale(at.s, at.s)
    g.translate(-FELT_TW / 2, -14)
    shadow(FELT_TW / 2, 16, FELT_TW, 22, 0)
    // at the last push a min means they stayed put
    const label = b.stage === 'push' ? (b.choice === 'max' ? 'Push' : 'Stay') : BET_WORD[b.choice]
    ticket({ label, price: `$${b.amount}`, kind: b.choice, enabled: true, onClick: () => {} }, 3, false, FELT_TW)
    g.restore()
    looks.push({ x: at.x, y: at.y, w: FELT_TW, h: 28, r: at.r, e: rule(b.stage === 'push' ? 'push' : b.choice), above: false })
  })
}

// played cards on their spots. locked in: yours face down on your spots, theirs a squared stack
// (never their count). a fold or flambé leaves yours face down. showdown: both flip face up
// the flambé, as a beat of its own (ART.md §12). the locked cards slide to the middle of the felt (0-350ms) and burn
// together (350-950). a flash, and the ★ card rises big in the middle with its stars (950-1250), holds (to 1850), then
// flies down into your hand (to 2250). Bulk drops out of the smoke onto your discard. a grind is the same with the
// one card coming back +1 Value and going to the discard. it waits for the count-up, so the reveal has the stage first
const FORGE = { gather: 350, burn: 950, rise: 1250, hold: 1850, end: 2250 }
const FORGE_C = { x: 320, y: 186 }

function forgeReturn(back: HTMLCanvasElement): boolean {
  if (!forgeFx) return false
  if (!forgeFx.started) {
    if (live) {
      faceDown(forgeFx.cards, back)
      return true
    }
    forgeFx.started = true
    forgeFx.at = now
    if (forgeFx.forged) sfx.flambe()
    else sfx.grind()
  }
  const age = now - forgeFx.at
  if (age >= FORGE.end) {
    forgeFx = null
    return true
  }
  const cards = forgeFx.cards
  if (age < FORGE.burn) {
    const gather = land(progress(age, FORGE.gather))
    cards.forEach((c, i) => {
      const from = NEAR_ROW.cx + (i - (cards.length - 1) / 2) * NEAR_ROW.gap
      const x = mix(from, FORGE_C.x + (i - (cards.length - 1) / 2) * 10, gather)
      const y = mix(NEAR_ROW.y, FORGE_C.y, gather)
      const art = cardCanvas(c)
      const melt = progress(age - FORGE.gather - i * 50, FORGE.burn - FORGE.gather - i * 50)
      const w = 44 * mix(1, 1.15, gather)
      const full = art.height * (w / art.width)
      const h = Math.ceil(art.height * (1 - melt))
      g.save()
      g.translate(x, y)
      g.rotate((i - (cards.length - 1) / 2) * 0.08 * gather)
      if (h) g.drawImage(art, 0, 0, art.width, h, -w / 2, -full / 2, w, h * (w / art.width))
      // the char line eats down the card, flames riding it
      if (melt > 0 && h) {
        const edge = -full / 2 + h * (w / art.width)
        g.fillStyle = 'rgba(46,35,32,0.85)'
        g.fillRect(-w / 2, edge - 3, w, 3)
        for (let f = 0; f < 3; f++) pin('fx/flame/' + ((Math.floor(age / 65 + i + f) % 4) + 1), -w / 2 + 6 + f * (w / 3), edge - 6, { s: 1.2 })
      }
      g.restore()
      if (melt > 0) for (let e = 0; e < 3; e++) pin('fx/ember/' + (((i + e) % 3) + 1), x - 12 + e * 12 + Math.sin(i + e + age / 90) * 6, y - 20 - 50 * progress(age - FORGE.gather - e * 90, 500))
    })
    return true
  }
  const result = forgeFx.result
  if (!result) return age < FORGE.rise
  if (!forgeFx.rang) {
    forgeFx.rang = true
    if (result.tier > 0) sfx.stars(result.tier)
  }
  // the flash as it comes out of the fire
  const flashed = 1 - progress(age - FORGE.burn, 260)
  if (flashed > 0) {
    g.fillStyle = `rgba(255,251,232,${flash((result.tier === 3 ? 0.6 : 0.35) * flashed)})`
    g.fillRect(0, 0, W, H)
  }
  if (forgeFx.bulk > 0) {
    if (age >= FORGE.burn + 220 && !forgeFx.landed) {
      forgeFx.landed = true
      sfx.bulk()
    }
    for (let i = 0; i < forgeFx.bulk; i++) {
      const drop = land(progress(age - FORGE.burn - i * 60, 420))
      pin('base/bulk', mix(FORGE_C.x - 20 + i * 14, MY_DISCARD.x, drop), mix(FORGE_C.y, MY_DISCARD.y, drop) - 30 * Math.sin(Math.PI * drop), { s: mix(0.36, 0.28, drop), r: i * 0.09 + drop })
    }
  }
  const rise = land(progress(age - FORGE.burn, FORGE.rise - FORGE.burn))
  const away = progress(age - FORGE.hold, FORGE.end - FORGE.hold)
  const fly = away * away
  const bob = Math.sin((age - FORGE.rise) / 160) * 1.5 * (1 - away)
  const to = forgeFx.forged ? { x: HAND_C.x, y: 330 } : MY_DISCARD
  const x = mix(FORGE_C.x, to.x, fly)
  const y = mix(FORGE_C.y + 20 * (1 - rise), to.y, fly) + bob
  const scale = mix(mix(0.4, 1.15, rise), 0.6, fly)
  if (away === 0) {
    const rays = sprite('fx/rays')
    const k = 168 / Math.max(rays.w, rays.h)
    g.save()
    g.translate(x, y)
    g.rotate(age / 900)
    g.globalAlpha = 0.5 * rise
    g.drawImage(rays.img, rays.x, rays.y, rays.w, rays.h, (-rays.w * k) / 2, (-rays.h * k) / 2, rays.w * k, rays.h * k)
    g.restore()
  }
  drawCard(result, x, y, scale, 0.05 * Math.sin(Math.PI * rise) * (1 - fly))
  if (away === 0 && rise === 1) {
    const what = result.tier > 0 ? '★'.repeat(result.tier) : '+1 Value'
    text(what, x, y + 56, { font: 'chalk', color: result.tier > 0 ? GOLD : '#f6ecd2', align: 'center', bold: true, outline: OUTLINE })
  }
  return true
}

function playedCards(st: DuelState): void {
  const view = st.view
  const sd = st.settled ? view.showdown : null
  if (sd) {
    // a thrown hand stays face down: yours shows on your spots, theirs reveals nothing (a squared stack)
    if (sd.theirKind === 'play') rowOf(sd.theirCards, FAR_ROW, sd.theirs!, 'far', backCanvas(st.rival.back))
    else drawPile(FAR_ROW.cx, FAR_ROW.y + 18, 0.6, st.rival.back, 5)
    if (sd.myKind === 'play') rowOf(sd.myCards, NEAR_ROW, sd.mine!, 'near', backCanvas(view.me.starter))
    else if (!forgeReturn(backCanvas(view.me.starter)) && sd.myKind !== 'flamber') faceDown(sd.myCards, backCanvas(view.me.starter))
    scoreTag(st, sd, false)
    scoreTag(st, sd, true)
    return
  }
  if (view.phase === 'spoils') return spoilsTable(st)
  faceDown(view.me.locked ?? [], backCanvas(view.me.starter))
  const theyLocked = view.phase === 'bet' || (view.phase === 'deal' && view.others[0].done)
  if (theyLocked) {
    const at = spring(`rstack${view.round}:${view.hands?.hand ?? 0}`, { x: FAR_ROW.cx, y: FAR_ROW.y - 4, r: 0.04, s: 1 }, { x: RIVAL_X, y: 104, r: 0.4, s: 1 })
    drawPile(at.x, at.y + 22, 0.6, st.rival.back, 5)
  }
}

// spoils: 3 cards face up on the pot. the loser picks first, then the winner, the last card burns
let spoilHover: Card | null = null // the spoils card hovered, as told to the compare dock
let spoilsShown = false // drawn this frame
function spoilsTable(st: DuelState): void {
  const sp = st.view.spoils
  if (!sp) return
  spoilsShown = true
  const mine = sp.toPick === st.view.me.seat
  const sign = spring('butin', { x: 272, y: 140, r: 0, s: 1 }, { x: 272, y: 112, r: -.04, s: 1 })
  pin('hud/spoils/placard', sign.x, sign.y, { r: sign.r })
  const box = spriteBox('hud/spoils/placard', sign.x, sign.y)
  look(box.x, box.y, box.w, box.h, rule('spoils'))
  const who = sp.toPick === null ? '' : mine ? 'Your pick' : `${st.rival.name} picks`
  text(who, 320, 166, { font: 'sans', color: CREAM, align: 'center', bold: true, outline: OUTLINE })
  // hovering one shows it against your deck in the compare dock (main opens the dock)
  let hovered: Card | null = null
  sp.cards.forEach((c, i) => {
    const target = { x: 260 + i * 60, y: 222, r: (i - 1) * 0.04, s: 0.8 }
    const at = spring(`card${c.id}`, target, { x: 346, y: 193, r: 0, s: 0.3 })
    const over = Math.abs(mouse.x - at.x) < 26 && Math.abs(mouse.y - at.y) < 36
    if (over) hovered = c
    const lift = over && mine ? -6 : 0
    const { w, h } = drawCard(c, at.x, at.y + lift, at.s * (over && mine ? 1.06 : 1), at.r, false, true)
    if (mine) cardHits.push({ id: c.id, x: at.x, y: at.y, r: at.r, w, h, onClick: () => { pop(`card${c.id}`); st.onSpoil(c.id) } })
    lookCard(c, at.x, at.y + lift, w, h, at.r)
  })
  if (hovered !== spoilHover) setCompareHover(hovered)
  spoilHover = hovered
  // what already went: a skip pays $1, a pick shows on its picker's side
  sp.picks.forEach((x, i) => {
    const yours = x.seat === st.view.me.seat
    const line = x.card ? `${yours ? 'You' : st.rival.name} took ${cardTitle(x.card)}` : `${yours ? 'You' : st.rival.name} skipped, +$1`
    text(line, 320, 268 + i * 10, { font: 'sans', color: CREAM, align: 'center', outline: OUTLINE })
  })
}

function cardTitle(c: Card): string {
  const rank = c.rank === 14 ? 'A' : c.rank === 13 ? 'K' : c.rank === 12 ? 'Q' : c.rank === 11 ? 'J' : String(c.rank)
  return `${rank}${({ S: '♠', H: '♥', D: '♦', C: '♣' })[c.suit]}`
}

// your locked cards lying face down on your spots, sprung from wherever they were in your hand
function faceDown(cards: Card[], back: HTMLCanvasElement): void {
  const s = NEAR_ROW.w / 64
  cards.forEach((c, i) => {
    const n = i - (cards.length - 1) / 2
    const at = spring(`card${c.id}`, { x: NEAR_ROW.cx + n * NEAR_ROW.gap, y: NEAR_ROW.y - 10 * s, r: n * 0.02, s }, { x: HAND_C.x, y: HAND_C.y, r: 0, s: 1 })
    const size = at.s * stockScale(c)
    shadow(at.x, at.y, 64 * size, 88 * size, at.r)
    centered(back, at.x, at.y, 64 * size, 88 * size, at.r)
    lookCard(c, at.x, at.y, 64 * size, 88 * size, at.r)
  })
}

// a card turns over the first time it's drawn face up: back, edge-on, face, over 300ms
const FLIP_MS = 300
const flips = new Map<number, number>()
function rowOf(cards: Card[], row: typeof NEAR_ROW, a: Appraisal, side: string, back: HTMLCanvasElement): void {
  const s = row.w / 64
  cards.forEach((c, i) => {
    const n = i - (cards.length - 1) / 2
    const target = { x: row.cx + n * row.gap, y: row.y - 10 * s, r: 0, s }
    const from = side === 'far' ? { x: RIVAL_X, y: 104, r: 0.3, s: 0.5 } : { x: HAND_C.x, y: HAND_C.y, r: 0, s: 1 }
    const at = spring(`card${c.id}`, target, from)
    const j = juiced(`card${c.id}`)
    if (!flips.has(c.id)) flips.set(c.id, now)
    const p = Math.min(1, (now - flips.get(c.id)!) / FLIP_MS)
    if (p < 1) {
      const wide = Math.abs(Math.cos(p * Math.PI))
      const img = p < 0.5 ? back : cardCanvas(c)
      const size = at.s * stockScale(c)
      centered(img, at.x, at.y, img.width * size * wide, img.height * size, at.r)
      return
    }
    const dim = live === null && !a.scoringIds.includes(c.id)
    const { w, h } = drawCard(c, at.x, at.y, at.s * j.s, at.r + j.r, dim, true)
    lookCard(c, at.x, at.y, w, h, at.r)
  })
}

function drawCard(c: Card, x: number, y: number, scale: number, angle: number, dim = false, castsShadow = false) {
  const img = cardCanvas(c)
  scale *= stockScale(c)
  const w = img.width * scale
  const h = img.height * scale
  if (castsShadow) shadow(x, y, w, h, angle)
  centered(dim ? darkened(img) : img, x, y, w, h, angle)
  if (!dim && !stillCards.matches && (c.finish === 'foil' || c.finish === 'holo' || c.finish === 'prism' || c.variant === 'chase')) {
    const phase = (performance.now() / 3000 + c.id * 0.13) % 1
    g.save()
    g.translate(x, y)
    g.rotate(angle)
    g.scale(scale, scale)
    const top = -img.height / 2 + (img.height - 88 - (c.traits.length ? 9 : 0)) / 2
    g.translate(-32, top)
    g.beginPath()
    if (!c.finish) g.roundRect(18, 0, 28, 9, 2)
    else g.roundRect(0, 0, 64, 88, 4)
    g.clip()
    if (c.finish === 'prism') {
      g.strokeStyle = `rgba(255,134,47,${0.17 + 0.12 * Math.sin(phase * Math.PI * 2)})`
      g.lineWidth = 5
      g.strokeRect(2, 2, 60, 84)
    } else {
      const start = phase * 150 - 65
      const sheen = g.createLinearGradient(start, 0, start+28, 12)
      sheen.addColorStop(0, 'transparent')
      sheen.addColorStop(0.5, c.finish === 'holo' ? `hsla(${phase*360},90%,70%,.38)` : 'rgba(255,233,151,.35)')
      sheen.addColorStop(1, 'transparent')
      g.fillStyle = sheen
      g.fillRect(0, 0, 64, 88)
    }
    g.restore()
  }
  return { w, h }
}

// a card with a dark wash over it, for the ones that aren't in play
const darks = new Map<HTMLCanvasElement, HTMLCanvasElement>()
function darkened(c: HTMLCanvasElement): HTMLCanvasElement {
  let d = darks.get(c)
  if (!d) {
    d = canvas(c.width, c.height)
    const dg = ctx2d(d)
    dg.drawImage(c, 0, 0)
    dg.globalCompositeOperation = 'source-atop'
    dg.fillStyle = 'rgba(14,11,10,0.5)'
    dg.fillRect(0, 0, c.width, c.height)
    darks.set(c, d)
  }
  return d
}

function shadow(x: number, y: number, w: number, h: number, r: number): void {
  g.save()
  g.translate(x + 1, y + 3)
  g.rotate(r)
  g.fillStyle = 'rgba(18,14,8,0.35)'
  g.fillRect(-w / 2, -h / 2, w, h)
  g.restore()
}

const THEIR_TAG_X = 448 // under their plate, left of their hand pips
// your appraisal's reels: a clack and a note as each digit locks, then the heat catches on the last one
let reelHeard = { at: -1, n: 0 }
function reelSounds(digits: string, age: number, ratio: number): void {
  if (reelHeard.at !== reelAt) reelHeard = { at: reelAt, n: 0 }
  const locked = [...digits].filter((_, i) => age - 170 - i * 95 >= 0).length
  for (; reelHeard.n < locked; reelHeard.n++) {
    const last = reelHeard.n === digits.length - 1
    sfx.digitLock(reelHeard.n, last)
    if (last && ratio >= 1) sfx.heat(ratio >= 4 ? 3 : ratio >= 2 ? 2 : 1)
  }
}

function scoreTag(st: DuelState, sd: ShowdownView, mine: boolean): void {
  const a = mine ? sd.mine : sd.theirs
  const w0 = 96
  const x0 = mine ? NEAR_ROW.cx - w0 / 2 : THEIR_TAG_X
  const y0 = mine ? 260 : 74
  if (!a) {
    // a thrown hand: the tag burnt (hud/score/tag/thrown is the real art), "jetée" where the number goes
    g.save()
    g.globalAlpha = 0.85
    nine('hud/score/tag/thrown', x0, y0, w0, 44)
    text('JETÉE', x0 + w0 / 2, y0 + 6, { font: 'didone', color: '#ff7a24', align: 'center' })
    text('scores 0', x0 + w0 / 2, y0 + 28, { font: 'tiny', color: CREAM, align: 'center' })
    g.restore()
    look(x0, y0, w0, 44, rule('flamber'))
    return
  }
  const l = live ? live[mine ? 0 : 1] : null
  if (l && !l.label) return // the cards are still landing, the count hasn't started
  const v = l ? l.v : a.value
  const hy = l ? Math.max(1, l.h) : a.hype
  const gr = l ? l.g : a.grade
  const total = Math.floor(v * hy * 2 ** gr)
  const label = l ? l.label : [a.hand, ...a.bonus].map(h => HAND_NAMES[h]).join(' + ')
  const note = l ? '' : handNote(mine ? sd.myCards : sd.theirCards, a.hand)
  const w = 96
  const x = mine ? NEAR_ROW.cx - w / 2 : THEIR_TAG_X
  const y = mine ? 260 : 74
  const won = !st.counting && sd.winner !== null && sd.winner === (mine ? st.view.me.seat : sd.opponent)
  const lostIt = !st.counting && sd.winner !== null && !won
  const j = juiced(mine ? 'tag0' : 'tag1')
  g.save()
  g.translate(x + w / 2, y + 22)
  g.rotate(j.r * 0.4 + (lostIt ? (mine ? 0.04 : -0.04) : 0))
  g.scale(j.s * 0.6 + 0.4, j.s * 0.6 + 0.4)
  g.translate(-(x + w / 2), -(y + 22))
  if (lostIt) g.globalAlpha = 0.6
  nine('hud/score/tag', x, y, w, 44)
  text(label, x + w / 2, y + 4, { font: 'tiny', color: BURGUNDY, align: 'center' })
  if (note) text(note, x + w / 2, y + 46, { font: 'tiny', color: CREAM, outline: OUTLINE, align: 'center' })
  // each factor in its stat's color (ink.ts), so the tag reads the same as the Fiche and the floats
  const parts: [string, string][] = [[fmt(v), VALUE.paper], [' × ', '#8c7656'], [hypeText(hy), HYPE.paper]]
  if (gr) parts.push([` × 2^${gr}`, GRADE.paper])
  const widths = parts.map(([s]) => measure(s, 'sans') + 1)
  let px = x + w / 2 - widths.reduce((s, n) => s + n, 0) / 2
  parts.forEach(([s, color], i) => {
    text(s, px, y + 10, { font: 'sans', color })
    px += widths[i]
  })
  const ratio = total / REF_SCORE[Math.min(st.view.round,REF_SCORE.length)-1]
  const heat = ratio>=4 ? '#fffbe8' : ratio>=2 ? '#ff7a24' : ratio>=1 ? GOLD : CREAM
  const digits = fmt(total)
  const age = Math.max(0,now-reelAt)
  const settled = Number.isFinite(reelAt) && !stillCards.matches
  const numberWidth = measure(digits,'didone')
  let dx=x+(w-numberWidth)/2
  if (mine && settled) reelSounds(digits, age, ratio)
  if(settled && ratio>=2){
    for(let offset=0;offset<numberWidth;offset+=15) pin('fx/flame/'+(1+(Math.floor(now/85+offset)%4)),dx+offset,y+13,{sx:.7,sy:ratio>=4?.75:.45})
  }
  for(let i=0;i<digits.length;i++){
    const digit=digits[i]
    const lock=age-170-i*95
    const spin=settled && /[0-9]/.test(digit) && lock<0
    const shown=spin?String((Math.floor(age/38)+i*3)%10):digit
    if(settled && ratio>=2 && lock>=0 && lock<160) pin('fx/spark',dx+2,y+16-lock*.04)
    const bounce=settled && lock>=0 && lock<125?2*Math.sin(Math.PI*lock/125):0
    text(shown,dx,y+19-bounce,{font:'didone',color:settled?(lock>=0&&lock<90?'#fffbe8':heat):INK,outline:settled?INK:undefined})
    dx+=measure(digit,'didone')+1
  }
  g.restore()
  // the tag reads as its hand: your level shows, theirs you don't know
  look(x, y, w, 44, () => entry('hand', a.hand, mine ? st.view.me.levels[a.hand] : undefined))
  if (l?.step) text(l.step, x + w / 2, y + 47, { font: 'tiny', color: CREAM, align: 'center', outline: OUTLINE })
  if (won) glow(x + w / 2, y + 30, 40, 'rgba(255,176,58,0.18)')
  // the near miss: how close the losing side came
  const other = mine ? sd.theirs : sd.mine
  if (lostIt && other && !sd.ko) text(`lost by ${fmt(other.total - a.total)}`, x + w / 2, y + 47, { font: 'sans', color: CREAM, align: 'center', outline: OUTLINE })
}

function you(st: DuelState, t: number): void {
  const view = st.view
  const sd = st.settled ? view.showdown : null
  const won = sd?.winner === view.me.seat
  const lost = !!sd && sd.winner !== null && !won
  const breathe = 1 + 0.012 * (0.5 + 0.5 * Math.sin(t / 4 * Math.PI * 2))
  const slump = lost ? 4 : 0
  const bounce = won ? -Math.abs(Math.sin(t * 5)) * 2 : 0
  pin('you/shoulders', 115, 360 + slump + bounce, { sy: breathe, r: lost ? -0.035 : 0 })
  const hy = 329 + slump + bounce - 50 * (breathe - 1)
  const tilt = lost ? 0.07 : won ? -0.06 : 0
  g.save()
  g.translate(115, hy)
  g.rotate(tilt)
  pin('you/head', 0, 0)
  pin(`mask/${st.myMask}/back`, 0, -24)
  g.restore()
}

// your floating fan. cards lift on hover and more when picked
function hand(st: DuelState, t: number): void {
  const view = st.view
  const me = view.me
  // locked cards live on the felt now (playedCards), what's left of the hand dims and sinks
  const lockedIds = new Set((me.locked ?? []).map(c => c.id))
  const cards = st.settled ? [] : me.hand.filter(c => !lockedIds.has(c.id))
  const n = cards.length
  if (!n) return
  const stepDeg = n > 1 ? Math.min(5.4, 38 / (n - 1)) : 0
  const pickable = !st.settled && view.phase === 'deal' && !me.locked
  // hover goes to the topmost card under the cursor, from last frame's layout
  const hovered = pickable ? cardUnder(mouse, lastCardHits)?.id : undefined
  const placed = cards.map((c, i) => {
    const th = ((i - (n - 1) / 2) * stepDeg * Math.PI) / 180
    const up = st.selected.has(c.id)
    const lift = me.locked ? -16 : up ? 18 : c.id === hovered ? 7 : 0
    const sway = Math.sin(t * 1.4 + c.id * 2.1)
    const target = {
      x: HAND_C.x + HAND_C.r * Math.sin(th) + Math.sin(th) * lift,
      y: HAND_C.y + HAND_C.r * (1 - Math.cos(th)) - Math.cos(th) * lift + sway * 0.8,
      r: th + sway * 0.006,
      s: up ? 1.06 : c.id === hovered ? 1.04 : 1,
    }
    return { c, at: spring(`card${c.id}`, target, { x: 146, y: 230, r: 0, s: 0.5 }) }
  })
  for (const { c, at } of placed) {
    const dim = !!me.locked && !lockedIds.has(c.id)
    const j = juiced(`card${c.id}`)
    const s = at.s * j.s
    const { w, h } = drawCard(c, at.x, at.y, s, at.r + j.r, dim, true)
    const slot = dragInsert?.moved ? dragInsert.slot : st.insertSlot
    const activeInsert = slot === null ? undefined : me.sleeve[slot]
    if (activeInsert && (hovered === c.id || st.selected.has(c.id))) {
      g.save()
      g.translate(at.x, at.y)
      g.rotate(at.r)
      g.strokeStyle = insertColors[activeInsert.id]
      g.strokeRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2)
      g.restore()
    }
    cardHits.push({ id: c.id, x: at.x, y: at.y, r: at.r, w, h, onClick: pickable ? () => { pop(`card${c.id}`); st.onCard(c.id) } : () => {} })
    lookCard(c, at.x, at.y, w, h, at.r, true) // over the fan, never on top of it
  }
  // a blue pip under each picked card, so picked reads at a glance and not only by height
  if (pickable) for (const { c, at } of placed) {
    if (!st.selected.has(c.id)) continue
    const d = cardCanvas(c).height * stockScale(c) * at.s / 2 + 5
    g.fillStyle = OUTLINE
    g.fillRect(Math.round(at.x - Math.sin(at.r) * d) - 2, Math.round(at.y + Math.cos(at.r) * d) - 2, 5, 5)
    g.fillStyle = '#6f9ad8' // your blue
    g.fillRect(Math.round(at.x - Math.sin(at.r) * d) - 1, Math.round(at.y + Math.cos(at.r) * d) - 1, 3, 3)
  }
}

// your hand's score, anchored right above the tickets (docs/ONBOARDING.md #1). while you pick it shows what the
// picked cards make, once you lock it shows the locked hand through the bet. base value × hype only, Balatro style:
// never the full appraisal, so trying card orders gains nothing. the showdown hands over to the score tag on the felt.
// returns its top, or null when it isn't up
// the hand you're building, on the right of your plate: what the picked cards make (base Value × Hype only,
// ONBOARDING.md #1), then the locked hand through the bet. the showdown's count-up is the felt tag's
const READOUT = { x: 8 + 76, y: 144 + 7, w: MY_PLATE_W - 76 - 7, h: 44 }
// out of the deal and the bet the plate folds back to name and money
const readoutUp = (st: DuelState) => pref('preview') && !st.settled && !st.view.me.forge && (st.view.phase === 'deal' || st.view.phase === 'bet')
function handReadout(st: DuelState): void {
  const me = st.view.me
  if (!readoutUp(st)) return
  const cards = me.locked ?? (st.insertSlot === null ? me.hand.filter(c => st.selected.has(c.id)) : [])
  const { x, y, w, h } = READOUT
  const cx = x + w / 2
  nine('hud/score/tag', x, y, w, h)
  if (!cards.length) {
    text('YOUR HAND', cx, y + 9, { font: 'tiny', color: BURGUNDY, align: 'center' })
    text(`pick 1–5 cards`, cx, y + 19, { font: 'sans', color: '#8c7656', align: 'center' })
    look(x, y, w, h, rule('appraisal'))
    return
  }
  const hand = evaluateHand(cards)
  const hypeMod = me.starter ? STARTERS.find(b => b.id === me.starter)?.rules.hypeMod : undefined
  let value = 0
  let hype = 0
  for (const type of [hand.type, ...hand.bonus]) {
    const b = handBase(type, me.levels[type], hypeMod)
    value += b.value
    hype += b.hype
  }
  const label = [hand.type, ...hand.bonus].map(t => HAND_NAMES[t]).join(' + ').toUpperCase()
  const note = handNote(cards, hand.type)
  const parts: [string, string][] = [[`Value ${value}`, VALUE.paper], [' × ', '#8c7656'], [`Hype ${hype}`, HYPE.paper]]
  const widths = parts.map(([s_]) => measure(s_, 'sans') + 1)
  text(me.locked ? 'LOCKED' : 'YOUR HAND', cx, y + 4, { font: 'tiny', color: '#8c7656', align: 'center' })
  text(label, cx, y + 12, { font: 'tiny', color: BURGUNDY, align: 'center' })
  let px = cx - widths.reduce((a, b) => a + b, 0) / 2
  parts.forEach(([s_, color], i) => {
    text(s_, px, y + 21, { font: 'sans', color })
    px += widths[i]
  })
  if (note) text(note, cx, y + 32, { font: 'tiny', color: '#8c7656', align: 'center' })
  tip('preview', 'Value × Hype is your Appraisal. Cards and collectibles add more.', { x, y, w, h }, 'below')
  look(x, y, w, h, () => entry('hand', hand.type, me.levels[hand.type]))
}

const SHELF = { x: 8, y: 22, item: 34, gap: 6 } // the top-left corner, where the run strip used to be
const caseHits = new Map<number, number>() // slot → when it last fired

function caseShelf(st: DuelState): void {
  const display = st.view.me.display
  const down = !!live && display.length > 0
  const at = spring('shelf', { x: 0, y: down ? 0 : -SHELF.y - 50, r: 0, s: 1 }, { x: 0, y: -SHELF.y - 50, r: 0, s: 1 })
  if (at.y <= -SHELF.y - 48) return
  const w = display.length * (SHELF.item + SHELF.gap) + SHELF.gap
  const x0 = SHELF.x
  const y0 = SHELF.y + at.y
  nine('hud/plate/frame', x0 - 4, y0 - 4, w + 8, SHELF.item + 18)
  nine('hud/plate/paper', x0, y0, w, SHELF.item + 10)
  display.forEach((o, i) => {
    const f = collectible(o, now, i)
    const k = Math.min(1, SHELF.item / Math.max(f.art.width, f.art.height))
    const j = juiced(`case${i}`)
    const cx = x0 + SHELF.gap + i * (SHELF.item + SHELF.gap) + SHELF.item / 2
    const cy = y0 + 5 + SHELF.item / 2
    const fired = now - (caseHits.get(i) ?? -Infinity)
    if (fired < 260) {
      g.save()
      g.globalAlpha = 0.5 * (1 - fired / 260)
      g.fillStyle = HYPE.felt
      g.fillRect(cx - SHELF.item / 2 - 2, cy - SHELF.item / 2 - 2, SHELF.item + 4, SHELF.item + 4)
      g.restore()
    }
    g.save()
    g.translate(cx, cy)
    g.scale(k * j.s, k * j.s)
    g.rotate(j.r * 0.3)
    drawCollectible(g, f, -f.art.width / 2, -f.art.height / 2, now + i * 213)
    g.restore()
    look(cx - SHELF.item / 2, cy - SHELF.item / 2, SHELF.item, SHELF.item, () => entry('collectible', o.id, o))
  })
}

// the count-up calls this when one of your collectibles' steps lands
function caseFired(slot: number, step: { value: number; hype: number; xhype: number; grade: number }): void {
  caseHits.set(slot, now)
  pop(`case${slot}`)
  const cx = SHELF.x + SHELF.gap + slot * (SHELF.item + SHELF.gap) + SHELF.item / 2
  const bits: [string, string][] = []
  if (step.value) bits.push([`+${step.value} Value`, VALUE.felt])
  if (step.hype) bits.push([`+${step.hype} Hype`, HYPE.felt])
  if (step.xhype !== 1) bits.push([`×${step.xhype} Hype`, HYPE.felt])
  if (step.grade) bits.push([`+${step.grade} Grade`, GRADE.felt])
  bits.forEach(([t_, color], b) => floats.push({ text: t_, x: cx, y: SHELF.y + SHELF.item + 22 + b * 11, color, t: now }))
}

export function cardTags(card: Card) {
  const tags: { label: string; color: string }[] = []
  const add = (label: string, color = '#c99a3a') => tags.push({ label, color })
  if (card.bulk) add('Bulk: +5 Value', modifierInk('bulk'))
  if (card.variant) add(VARIANTS[card.variant].name, modifierInk(card.variant))
  if (card.joker) add(JOKERS[card.joker].name + ': ' + JOKERS[card.joker].text, specialInk[card.joker === 'crayon' ? 'crayon' : 'joker'])
  if (card.finish) add(({ foil: 'Foil', holo: 'Holo', prism: 'Prism', misprint: 'Misprint' })[card.finish], modifierInk(card.finish))
  if (card.stamp) add(({ first: '1st Edition', signed: 'Signed', gold: 'Gold Border', damaged: 'Damaged' })[card.stamp], modifierInk(card.stamp))
  if (card.knockoff) add(knockoffName(card.knockoff), modifierInk(card.knockoff.kind))
  if (card.grade !== null) add('Grade ' + card.grade, GRADE.paper)
  if (card.tier) add('★'.repeat(card.tier), starInk(card.tier))
  for (const t of card.traits) add(traitName(t))
  if (card.grind) add('+' + card.grind + ' Value', VALUE.paper)
  return tags
}

export function cardInfo(card: Card): string {
  return cardTags(card).map(t => t.label).join(' · ')
}
const describeCard = cardInfo

// ---------- hud ----------

function hud(st: DuelState, t: number): void {
  const view = st.view
  const me = view.me
  const them = view.others[0]
  plate(8, 144, true, st, me.bankroll)
  handReadout(st)
  if (st.tally && !st.counting) tip('bankroll', "Your money is your life. At $0 you're out.", { x: 8, y: 144, w: MY_PLATE_W, h: 58 }, 'above')
  plate(482, 12, false, st, them.bankroll)
  // their sleeve hangs where their score tag goes, so it tucks away for the showdown
  if (!(st.settled && view.showdown)) {
    for (let i = 0; i < them.sleeve; i++) pin('insert/back', 461 + i * 9, 75, { s: 0.55, r: (i - 0.5) * 0.12 })
    if (them.sleeve) look(454, 64, 16 + them.sleeve * 9, 24, rule('plate-sleeve'))
    pin('you/cuff', 483, 87, { s: 0.5, flip: true })
  }
  marker(st)
  premier(st)
  if (view.twist) twistSign(view)
  if (bubble && now - bubble.t < 2600) speech(bubble.text, bubble.sub, now - bubble.t, st.rival.mask)
  calmBand(bandTop)
  startCallout(st)
  slips(st)
  let top = colTop
  if (st.tally && !st.counting && view.last && !calling()) top = tally(st)
  bandTop = colText(st, top - 6) - 8 // next frame's band starts above whatever is in the column
  sortTabs(st)
  frameZones(st)
}

// zone A: the top bar (Table · Manche, then the hand track) and the twist tag. the bare table draws it too

function frameZones(st: DuelState): void {
  const view = st.view
  // the engine clears hands when the round ends. keep showing the last one through the reveal and the tally
  if (view.hands) lastHands = view.hands
  else if (!st.settled) lastHands = null
  const track = lastHands ? trackLayout(st, lastHands) : null
  const bar = runStrip(g, view, st.settled && view.last ? view.last.round : view.round, !!view.twist, track?.w ?? 0)
  pauseTab(g, hit(PAUSE_TAB.x, PAUSE_TAB.y, PAUSE_TAB.w, PAUSE_TAB.h, openPause))
  look(bar.label.x, bar.label.y, bar.label.w, bar.label.h, rule('round'))
  const tw = view.twist ?? view.nextTwist?.twist
  if (bar.twist && tw) look(bar.twist.x, bar.twist.y, bar.twist.w, bar.twist.h, () => entry('twist', tw.id, tw))
  if (lastHands && track) handTrack(st, lastHands, track, bar.extraX)
}

// "Main 2 / 3" on the top bar: how the round is won, in one place. one pip per hand (won, lost, tie, thrown, still
// to play), the score, and the K.O. line
let lastHands: SeatView['hands'] = null

// the hand track's pieces left to right, sized to the text as it shows (Main → Hand in english)
function trackLayout(st: DuelState, hv: NonNullable<SeatView['hands']>) {
  const shown = st.settled && st.view.showdown ? st.view.showdown.hand : hv.hand
  const label = `Main ${Math.min(3, shown)} / 3`
  const score = `${hv.wins[0]}–${hv.wins[1]}`
  const ko = `K.O. ${hv.knockout}×`
  const pips = measure(label, 'sans', true) + 12
  const scoreX = pips + 3 * 13 + 4
  const rule = scoreX + measure(score, 'sans', true) + 6
  const koX = rule + 6
  return { label, score, ko, pips, scoreX, rule, koX, w: koX + measure(ko, 'sans', true) + 8 }
}

function handTrack(st: DuelState, hv: NonNullable<SeatView['hands']>, l: ReturnType<typeof trackLayout>, x0: number): void {
  const me = st.view.me.seat
  const y = 4
  look(x0, y, l.pips, 16, rule('plate-hand'))
  look(x0 + l.pips, y, l.rule - l.pips, 16, rule('hand-pips'))
  text(l.label, x0 + 6, y + 3, { font: 'sans', color: INK, bold: true })
  const dealing = !st.settled && st.view.phase === 'deal' && !st.view.me.locked
  if (dealing && st.view.round === 1 && hv.hand === 1 && !st.selected.size) tip('goal', 'Best of 3 hands. The higher Appraisal takes each one.', { x: x0, y, w: l.w, h: 16 }, 'below')
  for (let i = 0; i < 3; i++) {
    const hand = hv.hands[i]
    const state = !hand ? 'open' : hand.mine === null ? 'thrown' : hand.winner === null ? 'tie' : hand.winner === me ? 'won' : 'lost'
    const smoke = state === 'thrown' && !stillCards.matches && Math.floor(now / 320) % 2 ? '/1' : ''
    const x = x0 + l.pips + i * 13
    const age = now - pipAt
    const flip = hand && i === hv.hands.length - 1 && age < 290 && !stillCards.matches ? Math.max(0.12, Math.abs(Math.cos(Math.PI * age / 290))) : 1
    const pop = flip === 1 ? 1 : 1+.15*Math.sin(Math.PI*progress(age,290))
    pin(`hud/hand/pip/${state}${smoke}`, x + 6 * (1 - flip*pop), y + 2, { sx: flip*pop, sy: pop })
  }
  text(l.score, x0 + l.scoreX, y + 3, { font: 'sans', color: BURGUNDY, bold: true })
  // the knockout line rides on the same bar, after a rule
  g.fillStyle = '#bfa77e'
  g.fillRect(x0 + l.rule, y + 3, 1, 10)
  text(l.ko, x0 + l.koX, y + 3, { font: 'sans', color: BURGUNDY, bold: true })
  const ko = { x: x0 + l.rule, y, w: l.w - l.rule, h: 16 }
  look(ko.x, ko.y, ko.w, ko.h, rule('ko', st.view.round))
  if (dealing && hv.hand >= 2) tip('ko', `Win a hand by ${hv.knockout}× and the round ends there.`, ko, 'below')
}

// le patron's marker, pinned under your plate: the next payment and when it's due
function marker(st: DuelState): void {
  const due = st.view.me.marker
  if (!due) return
  const x = 14
  const y = 198
  look(x, y, 58, 26, rule('marker', due.due))
  pin('hud/marker/note', x, y, { r: stillCards.matches ? 0 : Math.sin(now / 800) * 0.018 })
  const age = now - markerAt
  if (!stillCards.matches && age >= 0 && age < 700) {
    g.save()
    g.globalAlpha = Math.sin(Math.PI * age / 700) * .35
    g.fillStyle = BURGUNDY
    g.fillRect(x + 1, y + 2, 54, 21)
    g.restore()
  }
  text('Le Patron', x + 4, y + 3, { font: 'tiny', color: '#5c4a36' })
  text(`$${due.due}`, x + 4, y + 12, { font: 'sans', color: BURGUNDY, bold: true })
}

// the Sleeve's inserts as two cards beside your hand, out of your cuff (UX.md §4). hover for the Fiche,
// a click picks one up (then click a card), or drag it straight onto a card
const SLEEVE_AT = [{ x: 158, y: 306, r: -0.08 }, { x: 195, y: 313, r: 0.06 }]
const INSERT_S = 2 // the 24×34 faces, doubled
function sleeveCards(st: DuelState, t: number): void {
  pin('you/cuff', 151, 328)
  if (st.bare) return
  const me = st.view.me
  const usable = sleeveUsable(st)
  me.sleeve.slice(0, 2).forEach((card, i) => {
    const spot = SLEEVE_AT[i]
    const w = 24 * INSERT_S
    const h = 34 * INSERT_S
    const picked = st.insertSlot === i
    const over = !dragInsert?.moved && Math.abs(mouse.x - spot.x) <= w / 2 && Math.abs(mouse.y - spot.y + 4) <= h / 2
    const target = { x: spot.x, y: spot.y - (picked ? 16 : over ? 8 : 0), r: picked || over ? 0 : spot.r, s: 1 }
    const at = spring(`insert${i}${card.id}`, target, { x: spot.x, y: 390, r: 0, s: 1 })
    const def = INSERTS[card.id]
    const canUse = usable && def.when !== 'shop'
    hit(at.x - w / 2, at.y - h / 2, w, h, () => { if (usable) { sfx.fwip(); st.onInsert(i) } })
    if (canUse) cuffHits.push({ slot: i, x: at.x, y: at.y, w, h })
    looks.push({ x: at.x, y: at.y, w, h, r: at.r, above: true, e: () => {
      const e = entry('insert', card.id, card)
      return canUse ? { ...e, foot: picked ? 'now click a card' : 'click to use' } : e
    } })
    if (dragInsert?.moved && dragInsert.slot === i) return
    insertCard(insertFace(card.id), at.x, at.y + Math.sin(t * 2 + i) * 0.4, at.r, over || picked)
  })
}

// one insert face at 2x, centered, with the cream outline when lit
function insertCard(name: string, x: number, y: number, r: number, lit: boolean): void {
  const img = sub(sprite(name))
  const w = img.width * INSERT_S
  const h = img.height * INSERT_S
  shadow(x, y, w, h, r)
  g.save()
  g.translate(x, y)
  g.rotate(r)
  if (lit) for (const [dx, dy] of AROUND) g.drawImage(silhouette(img), -w / 2 + dx, -h / 2 + dy, w, h)
  g.drawImage(img, -w / 2, -h / 2, w, h)
  g.restore()
}

// the insert you're dragging rides the mouse, over the hand
function insertGhost(st: DuelState, t: number): void {
  const held = dragInsert?.moved && st.view.me.sleeve[dragInsert.slot]
  if (held) insertCard(insertFace(held.id), mouse.x, mouse.y - 12, Math.sin(t * 5) * 0.045, false)
}

// balatro's sort buttons, right of the hand under the discard (the drawer owns the left edge). only while you hold a hand
// one chip right of the hand: by rank (A K) or by suit (♠ ♥), the lit half is how the hand fans. click or R flips it
const SORT = { x: 452, y: 262, w: 48, h: 18 }

function sortTabs(st: DuelState): void {
  if (st.settled || !st.view.me.hand.length) return
  const { x, w, h } = SORT
  const over = hit(x, SORT.y - 2, w, h + 12, () => flipSort(st))
  const y = SORT.y - (over ? 1 : 0)
  nine('hud/plate/frame', x - 2, y - 2, w + 4, h + 4)
  for (const [i, by] of (['rank', 'suit'] as const).entries()) {
    const on = st.sort === by
    const hx = x + i * (w / 2)
    nine('hud/plate/paper', hx, y, w / 2, h, on ? GOLD : over ? '#d8c8a0' : '#9c8c6c')
    const label = by === 'rank' ? 'A K' : '♠ ♥'
    text(label, hx + w / 4, y + 4, { font: 'sans', color: on ? INK : '#5c4a36', align: 'center', bold: on })
  }
  text('Sort · R', x + w / 2, y + h + 3, { font: 'tiny', color: over ? CREAM : '#bfa77e', align: 'center', outline: OUTLINE })
}

function flipSort(st: DuelState): void {
  sfx.fan()
  st.onSort(st.sort === 'rank' ? 'suit' : 'rank')
}

let bandTop = COL.bottom

// a seat's plate: name and bankroll. the rival's adds its difficulty and lane
function plate(x: number, y: number, mine: boolean, st: DuelState, bankroll: number): void {
  const pw = mine && readoutUp(st) ? MY_PLATE_W : 150
  nine('hud/plate/frame', x, y, pw, 58)
  nine('hud/plate/paper', x + 5, y + 5, pw - 10, 48)
  pin(`mask/${mine ? st.myMask : st.rival.mask}/icon`, x + 20, y + 17)
  const rival = st.view.others[0].rival
  // the plate reads as your bankroll, or as the rival (its stack, lane, case)
  look(x, y, mine ? 70 : 150, 58, mine || !rival ? rule('bankroll') : () => entry('rival', rival, tableOf(st.view.round)))
  text(mine ? st.view.me.name === 'You' ? 'Vous' : st.view.me.name : st.rival.name, x + 34, y + 9, { font: 'sans', color: INK })
  const j = juiced(mine ? 'plate0' : 'plate1')
  g.save()
  g.translate(x + 12, y + 41)
  g.scale(j.s, j.s)
  text(`$${bankroll}`, 0, -17, { font: 'didone', color: CASH.paper })
  g.restore()
  // the solo rival's money is the stack it sat down with: bust it and the table is yours
  if (!mine && st.view.others[0].rival) text('stack', x + 12, y + 44, { font: 'tiny', color: '#8c7656' })
  if (!mine) {
    text(st.rival.stamp, x + 138, y + 12, { font: 'tiny', color: BURGUNDY, align: 'right' })
    const sw = measure(st.rival.stamp, 'tiny')
    look(x + 136 - sw, y + 10, sw + 4, 10, rule('difficulty', STAMP_DIFFICULTY[st.rival.stamp]))
  }
  const spoils = st.view.spoils
  if (spoils) {
    const name = spoils.first === (mine ? st.view.me.seat : st.view.others[0].seat) ? 'hud/spoils/order' : 'hud/spoils/order/2'
    pin(name, x + 124, y + 21)
    const b = spriteBox(name, x + 124, y + 21)
    look(b.x, b.y, b.w, b.h, rule('spoils'))
  }
  if (!mine && rival) {
    const name = 'icon/lane/' + laneArt[rival]
    pin(name, x + 53, y + 32)
    const b = spriteBox(name, x + 53, y + 32)
    look(b.x, b.y, b.w, b.h, rule('lane', rival))
  }
  const clock = mine ? st.clock() : ''
  if (clock) text(clock, x + 138, y + 13, { font: 'sans', color: BURGUNDY, align: 'right', bold: true })
}

// the 1er token: a brass puck (hud/token/premier) on the corner of whoever bets first, with why under it
const PUCK_R = 18
function premier(st: DuelState): void {
  const view = st.view
  const b = view.bet
  if (st.settled || view.phase !== 'bet' || !b) return
  const meFirst = b.first === view.me.seat
  // the corner of the first player's plate, nearest the middle of the table
  const target = meFirst ? { x: 8 + MY_PLATE_W + 2, y: 148, r: 0, s: 1 } : { x: 486, y: 66, r: 0, s: 1 }
  const at = spring(`premier${view.round}`, target, { x: 346, y: 180, r: -1.5, s: 0.4 })
  const d = PUCK_R * 2 + 2
  g.save()
  g.translate(at.x, at.y)
  g.rotate(at.r)
  g.scale(at.s, at.s)
  g.fillStyle = 'rgba(14,11,10,0.55)'
  g.fillRect(-PUCK_R + 2, PUCK_R - 1, d - 6, 3) // the drop shadow
  pin('hud/token/premier', -d / 2, -d / 2)
  text('1er', 0, -6, { font: 'chalk', color: INK, align: 'center', bold: true })
  g.restore()
  look(at.x - PUCK_R, at.y - PUCK_R, d, d, rule('first'))
}

function twistSign(view: SeatView): void {
  tile('hud/twist/string', 204, 0, 1, 53)
  tile('hud/twist/string', 271, 0, 1, 53)
  // the sign grows to fit the whole rule, never cut off
  const rule = wrap(view.twist ? twistText(view.twist) : '', 104, 'tiny')
  const h = 28 + Math.max(2, rule.length) * 7 // the 6px bottom border sits under the last line, not on it
  nine('hud/twist/sign', 183, 52, 111, h)
  const tw = view.twist
  if (tw) look(183, 52, 111, h, () => entry('twist', tw.id, tw))
  const name = twistLabel(view)
  if (measure(name, 'didone') <= 104) text(name, 238, 52, { font: 'didone', color: BURGUNDY, align: 'center' })
  else text(name.toUpperCase(), 238, 57, { font: 'sans', color: BURGUNDY, align: 'center', bold: true })
  rule.forEach((line, i) => text(line, 238, 72 + i * 7, { font: 'tiny', color: INK, align: 'center' }))
}

// the rival's line, in a bubble to the left of their head (their plate owns the right)
// ---------- your turn ----------
// the moment betting comes to you: a soft chime and the lamp flares.
// keyed by round and how many bets are in, so it fires once per turn, online too
let myTurn: { key: string; t: number } | null = null

function turnFlare(st: DuelState): number {
  const b = st.view.bet
  if (!st.settled && b && b.toAct === st.view.me.seat && b.options.length) {
    const key = `${st.view.round}:${b.choices.length}`
    if (myTurn?.key !== key) {
      myTurn = { key, t: now }
      sfx.turn()
    }
  }
  if (!myTurn) return 0
  const age = now - myTurn.t
  return age < 400 ? Math.sin((age / 400) * Math.PI) : 0
}

// ---------- the knockout callout ----------
// a hand won by K× ends the round right there: the K.-O. stamp slams across the felt before anything else moves.
// a click or space skips it. driven by the view (showdown.ko), so it works online too
const CALLOUT_MS = 1600
let callout: { key: string; t: number } | null = null
const calledOut = new Set<string>()

const calling = () => callout !== null && now - callout.t < CALLOUT_MS
function endCallout(): void {
  if (callout) callout.t = -CALLOUT_MS
  skipBand()
}

function startCallout(st: DuelState): void {
  const sd = st.view.showdown
  if (!st.settled || st.counting || !sd?.ko) return
  const key = `${st.view.round}:${sd.hand}:${sd.winner}`
  if (calledOut.has(key)) return
  calledOut.add(key)
  callout = { key, t: now }
  sfx.knockout()
  const [big, small] = calloutLines(st)
  announce(big, small, sd.winner === st.view.me.seat ? 'good' : 'bad')
}

// the french line big, what it means under it
function calloutLines(st: DuelState): [string, string] {
  const sd = st.view.showdown!
  const mine = sd.winner === st.view.me.seat
  const k = st.view.hands?.knockout ?? 2
  return mine ? ['K.-O. !', `You won the hand by ${k}× or more: the round is yours`] : ['K.-O. !', `${st.rival.name} won the hand by ${k}×: the round is theirs`]
}

function calloutBanner(st: DuelState): void {
  if (!calling() || !st.view.showdown?.ko) return
  const age = now - callout!.t
  const won = st.view.showdown.winner === st.view.me.seat
  if (!stillCards.matches && age < 430) {
    const t = age / 430
    for (const side of ['L', 'R'] as const) {
      const dir = side === 'L' ? -1 : 1
      pin('hud/score/tear/' + side, (won ? THEIR_TAG_X + 48 : NEAR_ROW.cx) + dir * 32 * t, (won ? 96 : 275) + t * t * 30, { r: dir * t / 4, alpha: 1 - t })
    }
  }
  pin('hud/ko/stamp', won ? THEIR_TAG_X + 48 : NEAR_ROW.cx, won ? 96 : 275, { r: -0.14, s: age < 120 ? 2 - age / 120 : 1 })
}

// the french line big, the english bet word under it
// the rival's line types out in their mask's voice, a blip every few letters (docs/SOUND.md §6)
let spoken = { t: -1, n: 0 }
function speech(s: string, sub: string, age: number, mask: string): void {
  if (spoken.t !== bubble!.t) spoken = { t: bubble!.t, n: 0 }
  const shown = stillCards.matches ? s.length : Math.min(s.length, Math.floor(age / 33))
  for (; spoken.n < shown; spoken.n++) sfx.blip(sfx.voiceOf(mask), spoken.n, s[spoken.n], true)
  const j = age < 300 ? 1 + 0.2 * Math.exp(-age / 60) : 1
  g.save()
  g.translate(RIVAL_X - 32, 82)
  g.scale(j, j)
  const w = Math.max(56, measure(s, 'didone') + 18)
  nine('bubble/9slice', -w, -18, w, 36)
  pin('bubble/tail', -1, 0, { r: -Math.PI / 2 })
  text(s.slice(0, shown), -w / 2 - measure(s, 'didone') / 2, -16, { font: 'didone', color: INK })
  text(sub.toUpperCase(), -w / 2, 4, { font: 'sans', align: 'center', color: BURGUNDY, bold: true })
  g.restore()
}

// ---------- the action column ----------
// the right edge of the stage is the dealer's corner: messages, the result tally and the tickets.
// nothing else lives here, so nothing competes with what you can press

// action colors (READABILITY.md §4): face, plinth, label. one color per action, everywhere
const TICKET: Record<Kind, { face: string; plinth: string; label: string }> = {
  lock: { face: '#3e66a0', plinth: '#0f1d33', label: CREAM },
  max: { face: '#a82a38', plinth: '#2a0910', label: CREAM },
  min: { face: '#3a8040', plinth: '#1e4a24', label: CREAM },
  forge: { face: '#e8501a', plinth: '#5a1206', label: CREAM },
  discard: { face: '#7a4ab0', plinth: '#2a1440', label: CREAM },
  insert: { face: '#2d7a5c', plinth: '#0f2a20', label: CREAM },
  skip: { face: '#8c7656', plinth: '#2a2010', label: CREAM },
  continue: { face: '#c99a3a', plinth: '#3d2a10', label: '#1c1513' },
}
const TW = COL.w
const PITCH = 30 // 24 face + 3 plinth + 3 air

let hoverSlip = -1
let pressed: { i: number; t: number } | null = null
let colTop = COL.bottom // top of the ticket stack. the tally and messages stack above it
let presses: (() => void)[] = [] // this frame's ticket actions, for the keyboard

// a dark band down the right edge from top to the stage bottom, so the tickets sit on near-black like balatro's sidebar
function calmBand(top: number): void {
  const x = COL.x - 26
  const grad = g.createLinearGradient(x, 0, COL.x + 10, 0)
  grad.addColorStop(0, 'rgba(14,11,10,0)')
  grad.addColorStop(1, 'rgba(14,11,10,0.66)')
  g.save()
  g.fillStyle = grad
  g.fillRect(x, top, W - x, H - top)
  // fade in over 40 at the top edge
  for (let y = 0; y < 40; y += 2) {
    g.globalAlpha = (y / 40) ** 1.5
    g.fillRect(x, top - 40 + y, W - x, 2)
  }
  g.restore()
}

function slips(st: DuelState): void {
  // nothing to press while the round's ending is called out, so continue can't skip past it
  const list = calling() ? [] : st.slips
  colTop = COL.bottom - (list.length ? list.length * PITCH - 3 : 0)
  presses = []
  let hovering = -1
  list.forEach((s, i) => {
    const y = colTop + i * PITCH
    const key = `slip${list.length}:${i}` // by position, so a label change doesn't fly it in again
    const at = spring(key, { x: COL.x, y, r: 0, s: 1 }, { x: W + 10 + i * 16, y, r: 0, s: 1 }) // farther start = a little stagger
    const act = () => {
      pressed = { i, t: now }
      const stamp = s.stamp ?? ({ lock: 'play', forge: 'flamber', discard: 'discard', skip: 'skip' } as Partial<Record<Kind, string>>)[s.kind]
      if (stamp) stamps.push({ name: `hud/stamp/${stamp}`, x: at.x + TW / 2, y: at.y + 12, t: now })
      sfx.stamp()
      s.onClick()
    }
    presses.push(s.enabled ? act : sfx.denied)
    const over = s.enabled && hit(at.x, at.y - 4, TW, PITCH, act)
    if (!s.enabled) deniedHits.push({ x: at.x, y: at.y - 4, w: TW, h: PITCH, onClick: sfx.denied })
    const id = slipRule(s)
    if (id) look(at.x, at.y - 4, TW, PITCH, rule(id))
    const box = { x: at.x, y: at.y - 4, w: TW, h: PITCH }
    if (s.kind === 'forge' && s.enabled && s.price === '★') tip('flamber', 'Flamber merges your Pair into one ★ card.', box, 'left')
    if (s.kind === 'max' && s.enabled) tip('max', 'Max bets more on yourself. Win and the House pays it.', box, 'left')
    if (over) {
      hovering = i
      if (hoverSlip !== i) pop(key)
    }
    const down = pressed?.i === i && now - pressed.t < 90
    const gap = down ? 0 : over ? 4 : 3
    const j = juiced(key)
    const pulse = s.primary && !over ? 1 + 0.03 * breath() : 1
    g.save()
    g.translate(at.x + TW / 2, at.y + 13)
    g.scale(j.s * pulse, j.s * pulse)
    g.rotate(j.r * 0.35)
    g.translate(-TW / 2, -13)
    ticket(s, gap, over)
    g.restore()
  })
  hoverSlip = hovering
}

// the rule a ticket stands for, if any
function slipRule(s: Slip): string | null {
  if (s.kind === 'max') return s.label === 'Push' ? 'push' : 'max'
  return ({ lock: 'play', forge: 'flamber', discard: 'discard', min: 'min', skip: 'spoils' } as Partial<Record<Kind, string>>)[s.kind] ?? null
}

// 0 → 1 → 0 over 1.2s, the primary ticket's breathing
const breath = () => 0.5 - 0.5 * Math.cos((now / 1200) * Math.PI * 2)

// one raffle ticket at 0,0 (src/ui/ticket.ts). an off one is struck through, and the price chip's spot says why
const ICON: Record<Kind, TicketIcon> = {
  lock: 'play', max: 'max', min: 'min', forge: 'forge', discard: 'discard', insert: 'insert', skip: 'skip', continue: 'continue',
}

function ticket(s: Slip, gap: number, over: boolean, tw = TW): void {
  const c = TICKET[s.kind]
  if (s.enabled && s.primary) glow(tw / 2, 14, 74, `rgba(232,194,96,${0.22 + 0.16 * breath()})`)
  drawTicket(g, 0, 0, tw, { label: s.label, price: s.price, icon: ICON[s.kind], face: c.face, plinth: c.plinth, ink: c.label, enabled: s.enabled, over, gap, shine: s.primary }, now)
}

const TOAST_MS = 5000
let toastSeen = { text: '', t: 0 }

// the hint, and the latest log line above it, stacked upward from bottom. returns the new top
function colText(st: DuelState, bottom: number): number {
  let y = bottom
  // the rival's turn: their name big and a "deciding" line with ticking dots, not a grey log line
  const them = st.view.others[0]
  const v = st.view
  const deciding = v.bet?.toAct === them.seat || v.spoils?.toPick === them.seat || (v.phase === 'deal' && v.me.locked && !them.done)
  if (!st.settled && deciding) {
    const dots = '.'.repeat(1 + Math.floor(now / 350) % 3)
    text(`is deciding${dots}`, COL.x + 2, y - 10, { font: 'sans', color: CREAM, outline: OUTLINE })
    const name = st.rival.name
    const big = measure(name, 'didone') <= W - COL.x - 4
    text(name, COL.x + 2, big ? y - 30 : y - 24, { font: big ? 'didone' : 'chalk', bold: !big, color: CREAM, outline: OUTLINE })
    return y - 30
  }
  const hint = st.hint && !tipShowing() ? wrap(st.hint, COL.w - 4, 'sans') : []
  y -= hint.length * 10
  hint.forEach((line, i) => text(line, COL.x + 2, y + i * 10, { font: 'sans', color: CREAM, outline: OUTLINE }))
  // a log line says its piece for a few seconds, then gets out of the way
  if (st.toast !== toastSeen.text) toastSeen = { text: st.toast, t: now }
  const fresh = now - toastSeen.t < TOAST_MS
  const toast = st.toast && fresh ? wrap(st.toast, COL.w - 4, 'sans').slice(-3) : []
  if (toast.length) {
    y -= toast.length * 10 + (hint.length ? 4 : 0)
    toast.forEach((line, i) => text(line, COL.x + 2, y + i * 10, { font: 'sans', color: '#bfa77e', outline: OUTLINE }))
  }
  return y
}

// the round-end tally: pot, house, interest, extras, plus what else happened. it sits above Continue.
// returns its top
function tally(st: DuelState): number {
  const r = st.view.last!
  const name = st.rival.name
  // level on hands won means the round went to the totals
  const score = r.wins[0] === r.wins[1] ? 'on total' : `${r.wins[0]}–${r.wins[1]}`
  const title = { win: r.ko ? 'K.-O. ! Yours' : `You win ${score}`, loss: r.ko ? `K.-O. by ${name}` : `${name} wins ${score}`, tie: 'Dead even', bye: 'Bye' }[r.outcome]
  const t = r.tally
  const rows: [string, number][] = ([['Pot', t.pot], ['House', t.house], ['K.O.', t.ko], ['Momentum', t.momentum], ['Interest', t.interest], ['Extras', t.extras], ['Table skipped', t.skip]] as [string, number][]).filter(([, n]) => n !== 0)
  const total = t.pot + t.house + t.ko + t.momentum + t.interest + t.extras + t.skip
  const notes: string[] = []
  // the near miss: a round lost on the totals says how close it was
  if (r.outcome === 'loss' && !r.ko && r.margin < 0) notes.push(`Lost by ${fmt(-r.margin)}.`)
  for (const c of r.forged) notes.push(`New card: ${describeCard(c) || 'flambéed'}`)
  if (r.bulk) notes.push(`${r.bulk} Bulk went into your deck.`)
  for (const c of r.ground) notes.push(`Ground a card up to +${c.grind} Value.`)
  if (r.torn.length) notes.push(`Torn up: ${r.torn.length} card${r.torn.length > 1 ? 's' : ''}.`)
  if (r.stolen) notes.push('Sticky Fingers: you took one of their cards.')
  if (r.robbed) notes.push('Sticky Fingers: they took one of yours.')
  const w = COL.w - 8
  const noteLines = notes.flatMap(n => wrap(n, w - 12, 'sans'))
  const h = 34 + rows.length * 11 + 14 + noteLines.length * 10
  const x = COL.x + 4
  const y = colTop - 10 - h
  const at = spring('tally', { x, y, r: 0, s: 1 }, { x: W + 20, y, r: 0, s: 1 })
  if(!Number.isFinite(tallyAt)) tallyAt=now
  const age=stillCards.matches?Infinity:now-tallyAt
  const beat = 120 / pace()
  const lines=Math.min(rows.length,Math.floor(age/beat))
  if(lines>tallyLine) {
    tallyLine=lines
    if (lines === rows.length) sfx.register()
    else sfx.thunk()
  }
  nine('fx/receipt',at.x,at.y,w,Math.min(h,32+lines*11+(lines===rows.length?22+noteLines.length*10:0)))
  const titleColor = r.outcome === 'win' ? '#a8260a' : INK
  if (measure(title, 'didone') <= w - 8) text(title, at.x + w / 2, at.y + 1, { font: 'didone', color: titleColor, align: 'center' })
  else if (measure(title, 'sans', true) <= w - 8) text(title, at.x + w / 2, at.y + 6, { font: 'sans', color: titleColor, align: 'center', bold: true })
  else text(title, at.x + w / 2, at.y + 6, { font: 'sans', color: titleColor, align: 'center' })
  const ROW_RULE: Record<string, () => Entry> = { Pot: () => entry('keyword', 'Pot'), House: rule('house'), 'K.O.': rule('ko', st.view.round), Momentum: rule('momentum'), Interest: rule('interest') }
  rows.forEach(([label, n], i) => {
    if (i>=lines) return
    const ry = at.y + 24 + i * 11
    if (ROW_RULE[label]) look(at.x, ry - 1, w, 11, ROW_RULE[label])
    text(label, at.x + 8, ry, { font: 'sans' })
    text(`${n > 0 ? '+' : '−'}$${Math.abs(n)}`, at.x + w - 8, ry, { font: 'sans', color: n > 0 ? '#3a8040' : BURGUNDY, align: 'right', bold: true })
  })
  if(lines<rows.length) return y-8
  const ty = at.y + 26 + rows.length * 11
  g.fillStyle = '#bfa77e'
  g.fillRect(at.x + 6, ty - 2, w - 12, 1)
  text('This round', at.x + 8, ty + 1, { font: 'sans', bold: true })
  text(`${total >= 0 ? '+' : '−'}$${Math.round(Math.abs(total)*progress(age-lines*beat,270/pace()))}`, at.x + w - 8, ty + 1, { font: 'sans', bold: true, align: 'right', color: total >= 0 ? '#3a8040' : BURGUNDY })
  noteLines.forEach((line, i) => text(line, at.x + 6, ty + 12 + i * 10, { font: 'sans', color: '#5c4a36' }))
  return y - 8
}

// keys: 1–4 press the tickets top to bottom, space or enter presses the primary one
window.addEventListener('keydown', e => {
  if (!state || !cv?.isConnected || e.repeat) return
  if (drawerKey(e.key)) return e.preventDefault()
  if (drawerOpen()) return
  if (panelKey(e.key)) return e.preventDefault()
  if (panelOpen() || state.bare) return
  if (calling()) {
    if (e.key === ' ' || e.key === 'Enter') e.preventDefault()
    return endCallout()
  }
  const n = Number(e.key)
  if ((e.key === 'r' || e.key === 'R') && !state.settled && state.view.me.hand.length) flipSort(state)
  else if (n >= 1 && n <= presses.length) presses[n - 1]()
  else if (e.key === ' ' || e.key === 'Enter') {
    const i = state.slips.findIndex(s => s.primary && s.enabled)
    if (i < 0) return
    e.preventDefault()
    presses[i]?.()
  }
})

function effects(): void {
  for (let i = stamps.length - 1; i >= 0; i--) {
    const s = stamps[i]
    const age = (now - s.t) / 1000
    if (age > 0.6) {
      stamps.splice(i, 1)
      continue
    }
    const scale = age < 0.08 ? 2 - age / 0.08 : 1
    pin(s.name, s.x, s.y, { s: scale, r: -0.12, alpha: Math.min(1, (0.6 - age) * 4) })
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]
    const age = (now - f.t) / 1000
    if (age > 0.9) {
      floats.splice(i, 1)
      continue
    }
    text(f.text, f.x, f.y - age * 18, { font: 'sans', color: f.color, align: 'center', bold: true, outline: OUTLINE, alpha: Math.min(1, (0.9 - age) * 3) })
  }
}

// ---------- the count-up ----------

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// both appraisals tick up side by side, one step at a time. each scoring card pops and floats its number
export async function countUp(sd: ShowdownView): Promise<void> {
  const fresh = (): Live => ({ v: 0, h: 0, g: 0, label: '', step: '' })
  live = [fresh(), fresh()]
  const skip = pref('countUp') === 'skip' // straight to the totals: one note, no waits
  await sleep(500 / pace()) // let the cards land on their spots
  // a thrown hand has nothing to count
  const sides = [sd.mine, sd.theirs]
  const cards = [...sd.myCards, ...sd.theirCards]
  const steps = Math.max(sd.mine?.steps.length ?? 0, sd.theirs?.steps.length ?? 0)
  sfx.duck(-4, steps * 0.3 + 1)
  for (let i = 0; i < steps; i++) {
    // one note per step for both sides: the loudest kind of step either side took, panned to its card
    let loud: { value: number; hype: number; xhype: number; grade: number } = { value: 0, hype: 0, xhype: 1, grade: 0 }
    let x: number | undefined
    const rank = (s: typeof loud) => s.grade ? 3 : s.xhype !== 1 ? 2 : s.hype ? 1 : 0
    sides.forEach((a, n) => {
      if (!a) return
      const st = a.steps[i]
      if (!st) return
      const l = live![n]
      l.v += st.value
      l.h = (l.h + st.hype) * st.xhype
      l.g += st.grade
      if (rank(st) > rank(loud) || (n === 0 && rank(st) === rank(loud))) loud = st
      if (i <= a.bonus.length) l.label = [a.hand, ...a.bonus.slice(0, i)].map(h => HAND_NAMES[h]).join(' + ')
      const card = st.cardId !== null ? cards.find(c => c.id === st.cardId) : undefined
      l.step = i === 0 ? '' : st.label === 'card' && card ? '' : st.label
      pop(`tag${n}`)
      if (st.slot !== null && n === 0) {
        l.step = st.label
        caseFired(st.slot, st)
        if (!skip) sfx.caseClink()
      }
      if (card) {
        pop(`card${card.id}`)
        const s = springs.get(`card${card.id}`)
        if (s && n === 0) x = s.at.x
        if (s) {
          const bits: [string, string][] = []
          if (st.value) bits.push([`+${st.value} Value`, VALUE.felt])
          if (st.hype) bits.push([`+${st.hype} Hype`, HYPE.felt])
          if (st.xhype !== 1) bits.push([`×${st.xhype} Hype`, HYPE.felt])
          if (st.grade) bits.push([`+${st.grade} Grade`, GRADE.felt])
          bits.forEach(([s_, color], b) => floats.push({ text: s_, x: s.at.x, y: s.at.y - 30 - b * 11, color, t: now }))
        }
      }
    })
    if (!skip || i === steps - 1) sfx.countStep(i, loud, x)
    // the music's hype layer climbs with your running appraisal
    const mine = live![0]
    if (sd.mine && state) music.heat(Math.floor(mine.v * Math.max(1, mine.h) * 2 ** mine.g) / REF_SCORE[Math.min(state.view.round, REF_SCORE.length) - 1])
    if (!skip) await sleep(Math.max(130, 340 - i * 14) / pace())
  }
  sides.forEach((a, n) => {
    const l = live![n]
    if (a && Math.floor(l.v * Math.max(1, l.h) * 2 ** l.g) !== a.total) throw new Error('count-up does not match appraisal')
  })
  reelAt = performance.now()
  if (sd.mine) sfx.reelSpin()
  if(!stillCards.matches && !skip && sides.some(Boolean)) {
    const digits = Math.max(...sides.map(a=>fmt(a?.total ?? 0).length))
    await sleep((300+digits*95) / pace())
  }
  live = null
  music.cool()
  pop(sd.winner === null ? 'tag0' : sd.winner === sd.opponent ? 'tag1' : 'tag0')
}

export function bump(which: 'me' | 'rival'): void {
  pop(which === 'me' ? 'plate0' : 'plate1')
}
