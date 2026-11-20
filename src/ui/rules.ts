// the rules columns the carnet's Hands page draws: poker hands (an example row, value/hype with your levels) on the
// left, how a hand works on the right. the crumpled ball on the duel's rail opens that page
import { faceCanvas } from './art.ts'
import { drawText, measure, wrapText } from './font.ts'
import { HYPE, VALUE } from './ink.ts'
import { HAND_BASE, HAND_NAMES, HAND_TYPES, type HandType } from '../engine/hands.ts'
import { LEVEL_HYPE, LEVEL_VALUE } from '../engine/scoring.ts'
import type { Suit } from '../engine/cards.ts'
import type { SeatView } from '../engine/match.ts'

const INK = '#1c1513'
const PENCIL = '#43342e'
const FADED = '#8c7656'
const BURGUNDY = '#7a1a2c'

// how a hand works, one line each. the integrator swaps these for the glossary text (UX.md §7)
export const HOW_LINES: { name: string; text: string }[] = [
  { name: 'Best of 3', text: 'A round is up to 3 hands. Win 2 hands and the round and its pot are yours.' },
  { name: 'Play', text: 'Lock 1–5 cards. Your best poker hand in them is what scores.' },
  { name: 'Discard', text: 'Toss 1–5 cards and draw as many. The Discard button shows how many are left.' },
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
  // the columns wear their stat's color, so the sheet teaches the same colors as the score tag
  drawText(g, 'VALUE', val, y, { font: 'tiny', color: VALUE.paper, align: 'center' })
  drawText(g, 'HYPE', hype, y, { font: 'tiny', color: HYPE.paper, align: 'center' })
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
    drawText(g, String(HAND_BASE[h].value + LEVEL_VALUE * level), val, mid, { font: 'sans', color: VALUE.paper, align: 'center', bold: up })
    drawText(g, String(HAND_BASE[h].hype + LEVEL_HYPE * level), hype, mid, { font: 'sans', color: HYPE.paper, align: 'center', bold: up })
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
