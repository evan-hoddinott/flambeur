// la pile on canvas: the deck as the ruled lines of a french school notebook (docs/UX.md §3). the carnet's étui page
// and the compare dock both draw it. plain cards are pips, special cards are chits with one ink per modifier,
// and a card that also counts in another line shows up there dotted. stage units, returns hit boxes for hover/click
import { SUITS, rankLabel, type Card, type Suit } from '../engine/cards.ts'
import { linesOf, pileLines, typesOf, type Grouping, type PileLine, type TypeKey } from '../engine/pile.ts'
import { INK, blit, suitInk, tinted } from './art.ts'
import { drawText, measure } from './font.ts'
import { GRADE, HYPE, RARE, modifierInk } from './ink.ts'

export type Box = { x: number; y: number; w: number; h: number }
// card null = the line's label (click it to pin)
export type PileHit = Box & { card: Card | null; key: string }
export type PileOpts = {
  by: Grouping
  ghosts: Card[] // offers you'd take: each pulses into every line it would join
  hover: Card | null // the card under the mouse: its other lines light too
  pins: string[]
  lit: string[] // lines a rule touches (a hovered collectible)
  away: number | null // the card at the grading desk
  ms: number
}

const PAPER = '#f6ecd2'
const FADED = '#8c7656'
const BURGUNDY = '#7a1a2c'
const BRASS = '#c99a3a'
const RULE = '#b088e0' // seyès violet
const MARGIN = '#d04a4e'
const ASH = '#43342e'

const CHIT = 20 // a chit is 19 wide plus a 1px gap
const EMPTY_H = 9

export const TYPE_NAMES: Record<TypeKey, string> = {
  plain: 'Plain', finish: 'Finish', stamp: 'Stamp', knockoff: 'Knockoff', star: '★ Flambé', graded: 'Graded', variant: 'Type', joker: 'Joker', ash: 'Ash',
}

// a line's name, for pins and fiches: "Kings", "♣", "Finish"
export function lineName(key: string): string {
  const [by, id] = key.split(':')
  if (id === 'ash') return 'Ash'
  if (id === 'any') return 'Any'
  if (by === 'suit') return { S: '♠', H: '♥', D: '♦', C: '♣' }[id as Suit]
  if (by === 'type') return TYPE_NAMES[id as TypeKey]
  const r = Number(id)
  return { 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' }[r] ?? `${r}s`
}

type Item = { card: Card; kind: 'pip' | 'chit' | 'ash'; how: 'own' | 'also' | 'maybe' | 'ghost' }

function items(line: PileLine, by: Grouping, ghosts: { card: Card; in: string[] }[]): Item[] {
  const plainLine = by === 'type' && line.key === 'type:plain'
  const shape = (c: Card): Item['kind'] => (c.bulk ? 'ash' : plainLine || typesOf(c)[0] === 'plain' ? 'pip' : 'chit')
  const order = (a: Card, b: Card) => (by === 'rank' ? SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) : b.rank - a.rank) || a.id - b.id
  const own = [...line.own].sort(order)
  const out: Item[] = [
    ...own.filter(c => shape(c) !== 'chit').map(c => ({ card: c, kind: shape(c), how: 'own' as const })),
    ...own.filter(c => shape(c) === 'chit').map(c => ({ card: c, kind: 'chit' as const, how: 'own' as const })),
  ]
  for (const gh of ghosts) if (gh.in.includes(line.key)) out.push({ card: gh.card, kind: ownLine(gh.card, line, by) ? shape(gh.card) : 'chit', how: 'ghost' })
  for (const c of line.also) out.push({ card: c, kind: 'chit', how: 'also' })
  for (const c of line.maybe) if (!line.own.includes(c)) out.push({ card: c, kind: 'chit', how: 'maybe' })
  return out
}

// is this the ghost's printed line (a pip), or a line it only also counts in (a dotted chit)
function ownLine(card: Card, line: PileLine, by: Grouping): boolean {
  return pileLines([card], by).find(l => l.key === line.key)!.own.length > 0
}

function itemW(it: Item, by: Grouping): number {
  if (it.kind === 'chit') return CHIT
  if (it.kind === 'ash') return 8
  if (by === 'rank') return 8
  if (by === 'suit') return it.card.rank === 10 ? 13 : 12
  return it.card.rank === 10 ? 22 : 21
}

export function drawPile(g: CanvasRenderingContext2D, cards: Card[], box: Box, o: PileOpts): PileHit[] {
  const hits: PileHit[] = []
  const lines = pileLines(cards, o.by)
  const ghosts = o.ghosts.map(c => ({ card: c, in: linesOf(c, o.by) }))
  const ghostIn = new Set(ghosts.flatMap(gh => gh.in))
  const hoverIn = new Set(o.hover ? linesOf(o.hover, o.by) : [])
  const margin = o.by === 'type' ? Math.max(...lines.map(l => measure(lineName(l.key), 'tiny'))) + 12 : 22
  const countW = 26
  const x0 = box.x + margin + countW
  const room = box.x + box.w - x0
  const laid = lines.map(l => ({ line: l, items: items(l, o.by, ghosts) }))

  // rows: wrap when there's height to spare, else squeeze. empty lines are short, the rest share what's left
  const natural = laid.map(x => x.items.reduce((w, it) => w + itemW(it, o.by), 0))
  const empty = laid.filter(x => !x.items.length).length
  let rows = natural.map(w => Math.max(1, Math.ceil(w / room)))
  const tall = (rs: number[], h: number) => rs.reduce((s, r, i) => s + (laid[i].items.length ? r * h : EMPTY_H), 0)
  if (tall(rows, 16) > box.h) rows = rows.map(() => 1)
  const rowH = Math.max(13, Math.min(18, Math.floor((box.h - empty * EMPTY_H) / Math.max(1, rows.reduce((s, r, i) => s + (laid[i].items.length ? r : 0), 0)))))
  const pulse = 0.5 + 0.5 * Math.sin(o.ms / 140)

  // the red margin runs the whole page
  g.save()
  g.globalAlpha = 0.6
  g.fillStyle = MARGIN
  g.fillRect(box.x + margin - 3, box.y, 1, Math.min(box.h, tall(rows, rowH)))
  g.restore()

  let y = box.y
  laid.forEach(({ line, items: its }, i) => {
    const h = its.length ? rows[i] * rowH : EMPTY_H
    const lit = ghostIn.has(line.key) || hoverIn.has(line.key) || o.lit.includes(line.key)
    if (lit) {
      g.save()
      g.globalAlpha = 0.28
      g.fillStyle = BRASS
      g.fillRect(box.x, y, box.w, h - 1)
      g.restore()
    }
    // seyès: a violet rule under every line
    g.save()
    g.globalAlpha = 0.45
    g.fillStyle = RULE
    g.fillRect(box.x, y + h - 1, box.w, 1)
    g.restore()

    label(g, line.key, box.x, y, margin, h, !its.length)
    if (o.pins.includes(line.key)) drawPin(g, box.x - 1, y + Math.floor(h / 2) - 3)
    hits.push({ x: box.x, y, w: margin + countW, h, card: null, key: line.key })
    if (its.length) count(g, line, box.x + margin, y + Math.floor((Math.min(h, rowH) - 7) / 2))

    // squeeze one row if it doesn't fit, else wrap
    const perRow = rows[i] > 1 ? room : Math.max(room, natural[i])
    const squeeze = rows[i] === 1 && natural[i] > room ? (room - itemW(its[its.length - 1], o.by)) / (natural[i] - itemW(its[its.length - 1], o.by)) : 1
    let cx = 0
    let row = 0
    for (const it of its) {
      const w = itemW(it, o.by)
      if (rows[i] > 1 && cx + w > perRow) {
        cx = 0
        row++
      }
      const ix = Math.round(x0 + cx * squeeze)
      const iy = y + row * rowH + 1
      const ih = rowH - 2
      const fade = it.how === 'also' ? 0.6 : it.how === 'maybe' ? 0.4 : it.card.id === o.away ? 0.4 : 1
      g.save()
      g.globalAlpha *= it.how === 'ghost' ? 0.55 + 0.45 * pulse : fade
      if (it.kind === 'chit') chit(g, it.card, ix, iy, ih, it.how === 'also' || it.how === 'maybe')
      else if (it.kind === 'ash') ash(g, ix, iy, ih)
      else pip(g, it.card, ix, iy, ih, o.by)
      g.restore()
      const r = { x: ix, y: iy, w: w - 1, h: ih }
      if (it.how === 'ghost') outline(g, r, pulse > 0.5 ? BRASS : '#9c7028')
      else if (o.hover && it.card.id === o.hover.id) outline(g, r, INK.dark)
      if (it.card.id === o.away && it.how !== 'ghost') blit(g, 'drawer/parcel', ix + w - 12, iy + ih - 8)
      if (it.how !== 'ghost') hits.push({ ...r, card: it.card, key: line.key })
      cx += w
    }
    y += h
  })
  return hits
}

function label(g: CanvasRenderingContext2D, key: string, x: number, y: number, margin: number, h: number, empty: boolean): void {
  const [by, id] = key.split(':')
  const cy = y + Math.floor(h / 2)
  if (empty || by === 'type' || id === 'any' || id === 'ash') {
    const s = empty && by === 'rank' && id !== 'any' && id !== 'ash' ? rankLabel(Number(id)) : lineName(key)
    drawText(g, s, x + margin - 6, cy - 3, { font: 'tiny', color: empty ? '#bfa77e' : FADED, align: 'right' })
    return
  }
  if (by === 'suit') {
    const glyph = tinted(`index/suit/${id}`, suitInk(id as Suit))
    g.drawImage(glyph, x + margin - 21, cy - 7, 14, 14)
    return
  }
  const r = rankLabel(Number(id))
  const glyph = tinted(`index/rank/${r}`, INK.dark)
  g.drawImage(glyph, x + margin - 6 - glyph.width, cy - 6)
}

// "4" then "=6" when the line counts as more (or less) than its printed cards, then "+1?" for maybes
function count(g: CanvasRenderingContext2D, line: PileLine, x: number, y: number): void {
  const n = line.own.length
  drawText(g, String(n), x, y, { bold: true, color: INK.dark })
  let cx = x + measure(String(n), 'sans', true) + 2
  if (line.total !== n) {
    drawText(g, `=${line.total}`, cx, y + 1, { font: 'tiny', color: BURGUNDY })
    cx += measure(`=${line.total}`, 'tiny') + 2
  }
  const maybe = line.maybe.filter(c => !line.own.includes(c)).length
  if (maybe) drawText(g, `+${maybe}?`, cx, y + 1, { font: 'tiny', color: FADED })
}

// a plain card: its suit (rank lines), its rank (suit lines), or both (the plain type line). no paper, just ink
function pip(g: CanvasRenderingContext2D, c: Card, x: number, y: number, h: number, by: Grouping): void {
  const ink = suitInk(c.suit)
  const suit = tinted(`index/suit/${c.suit}`, ink)
  const rank = tinted(`index/rank/${rankLabel(c.rank)}`, ink)
  const cy = y + Math.floor(h / 2)
  if (by === 'rank') g.drawImage(suit, x, cy - 3)
  else if (by === 'suit') g.drawImage(rank, x, cy - 5)
  else {
    g.drawImage(rank, x, cy - 5)
    g.drawImage(suit, x + rank.width, cy - 3)
  }
}

// a special card: a cream chit with its index, and a foot of one ink per modifier slot (the fiche's colors)
function chit(g: CanvasRenderingContext2D, c: Card, x: number, y: number, h: number, dotted: boolean): void {
  const w = CHIT - 1
  g.fillStyle = PAPER
  g.fillRect(x, y, w, h)
  g.fillStyle = INK.dark
  if (dotted) {
    for (let i = 0; i < w; i += 2) {
      g.fillRect(x + i, y, 1, 1)
      g.fillRect(x + i, y + h - 1, 1, 1)
    }
    for (let i = 0; i < h; i += 2) {
      g.fillRect(x, y + i, 1, 1)
      g.fillRect(x + w - 1, y + i, 1, 1)
    }
  } else {
    g.fillRect(x, y, w, 1)
    g.fillRect(x, y + h - 1, w, 1)
    g.fillRect(x, y, 1, h)
    g.fillRect(x + w - 1, y, 1, h)
  }
  const ink = suitInk(c.suit)
  const crayon = c.knockoff?.kind === 'crayon'
  if (crayon) blit(g, 'index/wax', x + 1, y + 1)
  else g.drawImage(tinted(`index/rank/${rankLabel(c.rank)}`, ink), x + 1, y + 1)
  g.drawImage(tinted(`index/suit/${c.suit}`, ink), x + 11, y + 2)
  // the second suit of a wrong suit card, under the first
  if (c.knockoff?.kind === 'wrongsuit' && h >= 15) g.drawImage(tinted(`index/suit/${c.knockoff.suit}`, suitInk(c.knockoff.suit)), x + 11, y + 6)
  const inks = modInks(c)
  if (!inks.length) return
  const fw = w - 2
  const each = Math.floor(fw / inks.length)
  inks.forEach((color, i) => {
    g.fillStyle = color
    g.fillRect(x + 1 + i * each, y + h - 3, i === inks.length - 1 ? fw - i * each : each, 2)
  })
}

function modInks(c: Card): string[] {
  const out: string[] = []
  if (c.finish) out.push(modifierInk(c.finish))
  if (c.stamp) out.push(modifierInk(c.stamp))
  if (c.knockoff) out.push(modifierInk(c.knockoff.kind))
  if (c.variant) out.push(modifierInk(c.variant))
  if (c.tier) out.push(HYPE.paper)
  if (c.grade !== null) out.push(GRADE.paper)
  if (c.joker) out.push(RARE)
  return out
}

function ash(g: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  const t = Math.min(11, h)
  const top = y + Math.floor((h - t) / 2)
  g.fillStyle = ASH
  g.fillRect(x, top, 6, t)
  g.fillStyle = '#5c4a36'
  g.fillRect(x + 1, top + 2, 2, 1)
  g.fillRect(x + 3, top + 6, 2, 1)
}

// a brass map pin in the margin
export function drawPin(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = '#6b4a1a'
  g.fillRect(x, y, 4, 4)
  g.fillStyle = BRASS
  g.fillRect(x, y, 3, 3)
  g.fillStyle = '#fff0b0'
  g.fillRect(x, y, 1, 1)
  g.fillStyle = '#43342e'
  g.fillRect(x + 1, y + 4, 1, 3)
}

function outline(g: CanvasRenderingContext2D, r: Box, color: string): void {
  g.fillStyle = color
  g.fillRect(r.x - 1, r.y - 1, r.w + 2, 1)
  g.fillRect(r.x - 1, r.y + r.h, r.w + 2, 1)
  g.fillRect(r.x - 1, r.y - 1, 1, r.h + 2)
  g.fillRect(r.x + r.w, r.y - 1, 1, r.h + 2)
}
