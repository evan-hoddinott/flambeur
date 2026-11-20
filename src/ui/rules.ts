// the rules columns the carnet's Hands page draws: poker hands (an example row, value/hype with your levels) on the
// left, how a hand works on the right. the crumpled ball on the duel's rail opens that page.
// and the How to play page: the four things a new player has to leave knowing (docs/TUTORIAL.md), each with a tiny
// looping example
import { faceCanvas } from './art.ts'
import { drawText, measure, wrapText } from './font.ts'
import { GRADE, HYPE, MONEY, VALUE } from './ink.ts'
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
  { name: 'Flamber', text: 'Throw this hand, no bet. A pair or better burns into a ★ card and Ash, otherwise one card gets +1 Value for good.' },
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

// ---------- how to play ----------

type Lesson = { title: string; text: string; show: (g: CanvasRenderingContext2D, x: number, y: number, w: number, t: number) => void }

// a 2s loop: which beat of n we're on
const beat = (t: number, n: number, ms = 1400) => Math.floor(t / ms) % n

const PLAY: Lesson[] = [
  {
    title: '1. Appraisal',
    text: 'Each hand scores Value × Hype × 2^Grade. The higher Appraisal takes the hand, and 2 hands take the round.',
    show: (g, x, y, w, t) => {
      const hands = [[20, 2, 0], [35, 3, 1], [60, 5, 2]]
      const [v, h, gr] = hands[beat(t, 3)]
      const parts: [string, string][] = [[`Value ${v}`, VALUE.paper], [' × ', FADED], [`Hype ${h}`, HYPE.paper], [' × ', FADED], [`2^${gr}`, GRADE.paper], [' = ', FADED], [String(v * h * 2 ** gr), INK]]
      let px = x + w / 2 - parts.reduce((n, [p]) => n + measure(p, 'sans') + 1, 0) / 2
      for (const [p, color] of parts) {
        drawText(g, p, px, y, { font: 'sans', color, bold: color === INK })
        px += measure(p, 'sans') + 1
      }
    },
  },
  {
    title: '2. Your bankroll is your life',
    text: 'The same money pays for the shop, your bets and Le Patron. Hit $0 and the run is over. Interest pays +$1 for every $10 you hold.',
    show: (g, x, y, w, t) => {
      const money = [20, 18, 26, 14][beat(t, 4)]
      const why = ['start', 'the ante', 'won the pot', 'went shopping'][beat(t, 4)]
      for (let i = 0; i < money / 2; i++) {
        g.fillStyle = i % 2 ? MONEY.paper : '#2e6a33'
        g.fillRect(x + 4 + i * 6, y + 2, 5, 7)
      }
      drawText(g, `$${money}`, x + w - 70, y, { font: 'sans', color: MONEY.paper, bold: true })
      drawText(g, why, x + w - 44, y + 1, { font: 'tiny', color: FADED })
    },
  },
  {
    title: '3. Min, Max and Flamber',
    text: 'Min bets the ante. Max bets more on yourself: win the round and the House pays it. Flamber throws a hand (no bet) to burn a Pair into a ★ card for good.',
    show: (g, x, y, w, t) => {
      const tickets: [string, string][] = [['Min', '#3a8040'], ['Max', '#a82a38'], ['Flamber', '#e8501a']]
      const on = beat(t, 3)
      const tw = Math.floor((w - 12) / 3)
      tickets.forEach(([label, color], i) => {
        const tx = x + i * (tw + 6)
        const up = i === on ? -2 : 0
        g.fillStyle = color
        g.globalAlpha = i === on ? 1 : 0.45
        g.fillRect(tx, y + up, tw, 11)
        g.globalAlpha = 1
        drawText(g, label, tx + tw / 2, y + 1 + up, { font: 'sans', color: '#f6ecd2', align: 'center' })
      })
    },
  },
  {
    title: '4. Deck or binder',
    text: 'Every card you pull goes to your deck (you play it) or your binder (you sell it). The binder is one way.',
    show: (g, x, y, w, t) => {
      const u = (t % 1400) / 1400
      const toDeck = beat(t, 2) === 0
      drawText(g, 'DECK', x + 10, y + 1, { font: 'tiny', color: BURGUNDY })
      drawText(g, 'BINDER', x + w - 10, y + 1, { font: 'tiny', color: BURGUNDY, align: 'right' })
      const ease = u < 0.5 ? 0 : Math.min(1, (u - 0.5) * 3)
      const cx = x + w / 2 + (toDeck ? -1 : 1) * ease * (w / 2 - 56)
      const face = faceCanvas(toDeck ? 5 : 13, toDeck ? 'S' : 'H')
      g.drawImage(face, 0, 0, face.width, face.height, Math.round(cx - 12), y - 14, 24, 34)
    },
  },
]

// two lessons a leaf. side 0 = the left leaf. t = ms, for the examples
export function playColumn(g: CanvasRenderingContext2D, side: 0 | 1, x: number, y: number, w: number, t: number): void {
  let at = y
  for (const l of PLAY.slice(side * 2, side * 2 + 2)) {
    drawText(g, l.title, x, at, { font: 'sans', color: BURGUNDY, bold: true })
    at += 14
    for (const row of wrapText(l.text, w, 'sans')) {
      drawText(g, row, x, at, { font: 'sans', color: INK })
      at += 10
    }
    at += 10
    l.show(g, x, at, w, t)
    at += 34
  }
}
