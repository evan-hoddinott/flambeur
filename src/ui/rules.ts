import { rip } from './sound.ts'
// the rules paper: the crumpled ball on the rail uncrumples into a creased sheet. poker hands on the left (an example
// row, value/hype with your levels), how a hand works on the right. the carnet's Hands page draws the same two columns
import { faceCanvas, sprite } from './art.ts'
import { drawText, measure, wrapText } from './font.ts'
import { HAND_BASE, HAND_NAMES, HAND_TYPES, type HandType } from '../engine/hands.ts'
import { LEVEL_HYPE, LEVEL_VALUE } from '../engine/scoring.ts'
import type { Suit } from '../engine/cards.ts'
import type { SeatView } from '../engine/match.ts'

const W = 640
const H = 360
const INK = '#1c1513'
const PENCIL = '#43342e'
const FADED = '#8c7656'
const BURGUNDY = '#7a1a2c'
const FLAME = '#a8260a'
const PAPER = '#e3d2a8'
const CREAM = '#f6ecd2'
const CREASE = '#bfa77e'

// how a hand works, one line each. the integrator swaps these for the glossary text (UX.md §7)
export const HOW_LINES: { name: string; text: string }[] = [
  { name: 'Best of 3', text: 'A round is up to 3 hands. Win 2 hands and the round and its pot are yours.' },
  { name: 'Play', text: 'Lock 1–5 cards. Your best poker hand in them is what scores.' },
  { name: 'Discard', text: 'Toss 1–5 cards and draw as many. Your plate shows how many discards are left.' },
  { name: 'Flamber', text: 'Throw this hand. A pair or better merges into a ★ card, otherwise one card gets +1 Value for good.' },
  { name: 'Min / Max', text: 'Max bets more on yourself: win and the House pays it, lose and your rival takes it.' },
  { name: 'Appraisal', text: 'Value × Hype × 2^Grade. The higher appraisal takes the hand.' },
  { name: 'K.O.', text: 'Win a hand by K× or more and the round ends right there, a win for you.' },
]

// one example row per hand, read as rank + suit
const EXAMPLES: Record<HandType, string> = {
  royalflush: '10h Jh Qh Kh Ah', straightflush: '4s 5s 6s 7s 8s', quads: '9h 9s 9d 9c', fullhouse: 'Kh Ks Kd 8c 8h',
  flush: '2d 4d 7d Jd Ad', straight: '4s 5h 6c 7d 8s', trips: 'Qh Qs Qd', twopair: '10s 10h 8c 8d', pair: 'Jh Jc', high: 'As',
}
const RANK_OF: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 }

// ---------- the two columns, shared with the carnet ----------

// a tiny example card: the top-left index corner of a real face
function mini(g: CanvasRenderingContext2D, code: string, x: number, y: number, h: number): void {
  const r = code.slice(0, -1)
  const face = faceCanvas(RANK_OF[r] ?? Number(r), code.slice(-1).toUpperCase() as Suit)
  g.drawImage(face, 0, 0, 14, h, x, y, 14, h)
  g.fillStyle = PENCIL
  g.fillRect(x + 14, y, 1, h)
}

// every hand from high card up, best at the bottom like a ladder you climb. returns the height used
export function handsColumn(g: CanvasRenderingContext2D, v: SeatView, x: number, y: number, w: number, rowH = 26): number {
  const cards = x + 84
  const val = x + w - 62
  const hype = x + w - 34
  const lv = x + w - 6
  drawText(g, 'HAND', x, y, { font: 'tiny', color: BURGUNDY })
  drawText(g, 'EXAMPLE', cards, y, { font: 'tiny', color: BURGUNDY })
  drawText(g, 'VALUE', val, y, { font: 'tiny', color: BURGUNDY, align: 'center' })
  drawText(g, 'HYPE', hype, y, { font: 'tiny', color: BURGUNDY, align: 'center' })
  drawText(g, 'LV', lv, y, { font: 'tiny', color: BURGUNDY, align: 'right' })
  const top = y + 10
  HAND_TYPES.forEach((h, i) => {
    const ry = top + i * rowH
    const level = v.me.levels[h]
    if (i % 2) {
      g.fillStyle = 'rgba(140,118,86,0.16)'
      g.fillRect(x - 3, ry, w + 6, rowH)
    }
    const mid = ry + Math.floor((rowH - 11) / 2)
    drawText(g, HAND_NAMES[h], x, mid, { font: 'sans', color: INK })
    EXAMPLES[h].split(' ').forEach((code, j) => mini(g, code, cards + j * 16, ry + 2, Math.min(24, rowH - 3)))
    const up = level > 0
    drawText(g, String(HAND_BASE[h].value + LEVEL_VALUE * level), val, mid, { font: 'sans', color: up ? BURGUNDY : INK, align: 'center', bold: up })
    drawText(g, String(HAND_BASE[h].hype + LEVEL_HYPE * level), hype, mid, { font: 'sans', color: FLAME, align: 'center', bold: up })
    drawText(g, String(level + 1), lv, mid, { font: 'sans', color: up ? BURGUNDY : FADED, align: 'right', bold: up })
  })
  return 10 + HAND_TYPES.length * rowH
}

// one rule per paragraph: the word in bold, the line running on after it
export function howColumn(g: CanvasRenderingContext2D, v: SeatView, x: number, y: number, w: number, gap = 5): number {
  let at = y
  for (const line of HOW_LINES) {
    // the bold is just the rule's name, the live K for this Table runs on plain after it
    const name = line.name
    const text = line.name === 'K.O.' && v.hands ? `(now ${v.hands.knockout}×) ${line.text}` : line.text
    // wrap as one string, then draw the name part bold. bold is 1px wider a glyph, so wrap that much narrower
    const lines = wrapText(`${name} ${text}`, w - name.length, 'sans')
    drawText(g, name, x, at, { font: 'sans', color: BURGUNDY, bold: !/[mw]/.test(name) })
    drawText(g, lines[0].slice(name.length + 1), x + measure(name, 'sans', !/[mw]/.test(name)) + 4, at, { font: 'sans', color: INK })
    for (const l of lines.slice(1)) drawText(g, l, x, at += 10, { font: 'sans', color: INK })
    at += 10 + gap
  }
  return at - y
}

// ---------- open / close ----------

const BALL = { x: 486, y: 338 } // where duel.ts keeps the ball on the rail
const SHEET = { x: 34, y: 14, w: 572, h: 332 }
const FRAME_MS = 60 // ball, half open, sheet
let openAt: number | null = null
let closeAt: number | null = null

export function rulesOpen(): boolean {
  return openAt !== null
}

// from: where the ball is on screen, so it can uncrumple from there
export function toggleRules(from = BALL): void {
  if (openAt !== null && closeAt === null) {
    closeAt = performance.now()
    return
  }
  rip(.05)
  BALL.x = from.x
  BALL.y = from.y
  openAt = performance.now()
  closeAt = null
}

// any click while it's open folds it back up. true = the click was ours
export function rulesClick(_x: number, _y: number): boolean {
  if (openAt === null) return false
  if (closeAt === null) { rip(.05); closeAt = performance.now() }
  return true
}

export function rulesKey(key: string): boolean {
  if (openAt === null || key !== 'Escape') return false
  if (closeAt === null) { rip(.05); closeAt = performance.now() }
  return true
}

// draws nothing when closed. the scene keeps drawing its own ball on the rail
export function drawRules(g: CanvasRenderingContext2D, v: SeatView): void {
  if (openAt === null) return
  const t = performance.now()
  // closing plays the frames backwards, quicker
  let age = t - openAt
  if (closeAt !== null) {
    age = Math.max(0, Math.min(age, 3 * FRAME_MS) - (t - closeAt) * 1.5)
    if (age <= 0) {
      openAt = null
      closeAt = null
      return
    }
  }
  const p = Math.min(1, age / (3 * FRAME_MS))
  g.save()
  g.fillStyle = `rgba(14,11,10,${0.62 * p})`
  g.fillRect(0, 0, W, H)
  const cx = BALL.x + (W / 2 - BALL.x) * Math.min(1, p * 1.6)
  const cy = BALL.y + (H / 2 - BALL.y) * Math.min(1, p * 1.6)
  if (age < FRAME_MS) pinned(g, 'rules/ball', cx, cy, 1 + p * 3, p * 2)
  else if (age < 2 * FRAME_MS) pinned(g, 'rules/half', cx, cy, 1 + p * 2, (1 - p) * 0.4)
  else {
    // the sheet lands with a little overshoot
    const k = Math.min(1, (age - 2 * FRAME_MS) / 220)
    const s = closeAt !== null ? 0.4 + 0.6 * p : 1 + 0.06 * Math.sin(k * Math.PI) * (1 - k)
    g.translate(W / 2, H / 2)
    g.scale(s, s)
    g.translate(-W / 2, -H / 2)
    sheet(g, v)
  }
  g.restore()
}

function pinned(g: CanvasRenderingContext2D, name: string, x: number, y: number, s: number, r: number): void {
  g.save()
  g.translate(x, y)
  g.rotate(r)
  g.scale(s, s)
  drawSprite(g, name)
  g.restore()
}

function sheet(g: CanvasRenderingContext2D, v: SeatView): void {
  const { x, y, w } = SHEET
  g.save()
  g.translate(x, y)
  drawSprite(g, 'rules/sheet', false)
  g.restore()
  drawText(g, 'Les mains de poker', x + 22, y + 8, { font: 'didone', color: INK })
  drawText(g, 'Poker hands, weakest to strongest', x + 24 + measure('Les mains de poker', 'didone') + 8, y + 16, { font: 'sans', color: FADED })
  handsColumn(g, v, x + 24, y + 36, 312, 27)
  const rx = x + 362
  drawText(g, 'Comment ça marche', rx, y + 36, { font: 'sans', color: INK })
  drawText(g, 'How a hand works', rx, y + 47, { font: 'tiny', color: FADED })
  howColumn(g, v, rx, y + 62, w - 362 - 18)
  drawText(g, 'click anywhere to fold it up', x + w / 2, y + SHEET.h - 14, { font: 'tiny', color: FADED, align: 'center' })
}

// a sprite drawn at its pivot (or its corner)
function drawSprite(g: CanvasRenderingContext2D, name: string, pivot = true): void {
  const s = sprite(name)
  g.drawImage(s.img, s.x, s.y, s.w, s.h, pivot ? -s.px : 0, pivot ? -s.py : 0, s.w, s.h)
}
