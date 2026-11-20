// the screen frame (docs/UX.md §2): pieces every scene draws in the same spot, so the run reads the same everywhere.
// zone A, the run strip: Table · Manche, and tonight's or the next twist. hover the twist for its rule
import { nineSlice } from './art.ts'
import { drawText, measure } from './font.ts'
import { lang } from './lang.ts'
import { band } from './sound.ts'
import { tableOf } from '../engine/economy.ts'
import { twistName } from '../engine/twists.ts'
import type { SeatView } from '../engine/match.ts'

export const STRIP = { x: 8, y: 18, w: 150, h: 36 }
const INK = '#2e2320'
const BURGUNDY = '#7a1a2c'
const ROMAN = ['I', 'II', 'III', 'IV']

export function roundLabel(v: SeatView, round = v.round): string {
  return `Table ${ROMAN[tableOf(round) - 1]} · Manche ${round}${v.lastRound ? ` / ${v.lastRound}` : ''}`
}

// the twist line: tonight's, else the next boss round's
export function twistLine(v: SeatView): string {
  if (v.twist) return `Ce soir : ${twistName(v.twist)}`
  const t = v.nextTwist
  if (t) return `${t.round === v.round ? 'Ce soir' : `Boss, manche ${t.round}`} : ${twistName(t.twist)}`
  return v.scout ? 'Nouvelle table ce soir' : ''
}

// returns the twist line's box, so the scene can hover it for the Fiche
// the strip grows right to fit a long twist name, up to STRIP_MAX, then the line drops to the tiny font
const STRIP_MAX = 192
// signUp: the duel's twist sign is hanging, so the strip leaves the twist to it
export function runStrip(g: CanvasRenderingContext2D, v: SeatView, round = v.round, signUp = false): { x: number; y: number; w: number; h: number } | null {
  const { x, y } = STRIP
  const twist = signUp ? '' : twistLine(v)
  const font = measure(twist, 'sans') + 12 <= STRIP_MAX ? 'sans' : 'tiny'
  const tw = measure(twist, font)
  const w = Math.max(STRIP.w, Math.min(STRIP_MAX, tw + 12))
  const h = twist ? STRIP.h : 22
  nineSlice(g, 'hud/plate/paper', x, y, w, h, '#e3d2a8')
  drawText(g, roundLabel(v, round), x + 6, y + 4, { font: 'sans', color: INK, bold: true })
  if (!twist) return null
  drawText(g, twist, x + 6, y + (font === 'sans' ? 18 : 20), { font, color: BURGUNDY })
  return { x: x + 6, y: y + 18, w: Math.min(w - 12, tw), h: 10 }
}

// ---------- the language chip ----------
// FR · EN on a paper tab on the title screen, the current one lit. in a run the switch is on the carnet's rules page

export const LANG_TAB = { x: 156, y: 0, w: 40, h: 16 }

export function langTab(g: CanvasRenderingContext2D, over: boolean, x = LANG_TAB.x): void {
  const { w } = LANG_TAB
  const drop = over ? 2 : 0
  nineSlice(g, 'hud/plate/paper', x, -4 + drop, w, 18, over ? '#f6ecd2' : '#e3d2a8')
  const fr = lang() === 'fr'
  drawText(g, 'FR', x + 12, 2 + drop, { font: 'tiny', color: fr ? BURGUNDY : '#a08a68', align: 'center' })
  drawText(g, '·', x + 20, 2 + drop, { font: 'tiny', color: '#a08a68', align: 'center' })
  drawText(g, 'EN', x + 28, 2 + drop, { font: 'tiny', color: fr ? '#a08a68' : BURGUNDY, align: 'center' })
}

// ---------- zone F, the announcement band ----------
// one rule callout at a time across the middle (K.O., rival sits down, marker due or paid, twist, spoils):
// in french the french line big and the english under it (READABILITY §10), in english just the english.
// queued, ~1.6 s each, nothing drawn when empty

export type Tone = 'good' | 'bad' | 'plain'
type Call = { fr: string; en: string; tone: Tone; t: number | null }

const BAND_MS = 1600
const BAND_RIGHT = 504 // never over the action stack
const calls: Call[] = []
const still = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
const TONE: Record<Tone, { big: string; small: string }> = {
  good: { big: '#a8260a', small: '#3a8040' },
  bad: { big: INK, small: BURGUNDY },
  plain: { big: INK, small: '#5c4a36' },
}

// the same line twice in the queue is one callout
export function announce(fr: string, en: string, tone: Tone = 'plain'): void {
  if (calls.some(c => c.fr === fr && c.en === en)) return
  calls.push({ fr, en, tone, t: null })
}

export function bandShowing(): boolean {
  return calls.length > 0
}

// a click or space skips the one showing
export function skipBand(): void {
  if (calls[0]?.t !== null) calls.shift()
}

// call it every frame after the scene, in stage units. now = the frame's clock (performance.now)
export function drawBand(g: CanvasRenderingContext2D, now: number, centerY = 195): void {
  while (calls[0]?.t != null && now - calls[0].t! >= BAND_MS) calls.shift()
  const c = calls[0]
  if (!c) return
  if (c.t === null) {
    c.t = now
    band(c.tone)
  }
  const age = now - c.t
  // english mode: the english line goes big and there's nothing under it
  const big = lang() === 'fr' ? c.fr : c.en
  const small = lang() === 'fr' ? c.en : ''
  const scale = measure(big, 'didone') * 2 <= 400 ? 2 : 1
  const w = Math.max(measure(big, 'didone') * scale, measure(small, 'sans', true)) + 40
  const h = 30 + 14 * scale
  const pop = still?.matches || age >= 260 ? 1 : 0.6 + 0.4 * (1 - Math.exp(-age / 50)) + 0.12 * Math.exp(-age / 90)
  const ink = TONE[c.tone]
  const cx = Math.min(320, BAND_RIGHT - w / 2 - 5)
  g.save()
  g.translate(0,centerY-195)
  g.globalAlpha = Math.max(0, Math.min(1, age / 80, (BAND_MS - age) / 200))
  g.fillStyle = 'rgba(14,11,10,0.45)'
  g.fillRect(0, 150, 640, 90) // dim the scene behind it
  g.translate(cx, 195)
  g.scale(pop, pop)
  nineSlice(g, 'hud/plate/frame', -w / 2 - 5, -h / 2 - 5, w + 10, h + 10)
  nineSlice(g, 'hud/plate/paper', -w / 2, -h / 2, w, h)
  drawText(g, big, 0, -h / 2 + 4, { font: 'didone', color: ink.big, align: 'center', scale })
  if (small) drawText(g, small, 0, h / 2 - 15, { font: 'sans', color: ink.small, align: 'center', bold: true })
  g.restore()
}
