// the four bitmap fonts from art/fonts (built by art/fonts/build.py). white glyphs, tinted per color.
// y is always the top of the line box. a glyph a font doesn't have falls back to the sans, then the tiny, then '?'
import fontsPng from '../../art/fonts/fonts.png'
import fontsJson from '../../art/fonts/fonts.json'
import { canvas, ctx2d } from './art.ts'
import { say, segments } from './lang.ts'
import { GRADE, HYPE, LOSS, MONEY, VALUE } from './ink.ts'
import { pref, still } from './prefs.ts'

export type FontName = 'sans' | 'tiny' | 'didone' | 'chalk'

type Glyph = [x: number, y: number, w: number, h: number, top: number, left: number, advance: number]
type Font = { ascent: number; descent: number; line: number; cap: number; space: number; caps: boolean; glyphs: Record<string, Glyph> }

const fonts = fontsJson as unknown as Record<FontName, Font>
let atlas: HTMLImageElement | null = null
const tints = new Map<string, HTMLCanvasElement>()

export function loadFonts(): Promise<void> {
  return new Promise((ok, fail) => {
    const img = new Image()
    img.onload = () => {
      atlas = img
      ok()
    }
    img.onerror = () => fail(new Error('couldn\'t load the font atlas'))
    img.src = fontsPng
  })
}

function tinted(color: string): HTMLCanvasElement {
  let c = tints.get(color)
  if (c) return c
  if (!atlas) throw new Error('fonts not loaded')
  c = canvas(atlas.width, atlas.height)
  const g = ctx2d(c)
  g.drawImage(atlas, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  tints.set(color, c)
  return c
}

function glyph(font: FontName, ch: string): { g: Glyph; from: Font } {
  const f = fonts[font]
  const own = f.glyphs[ch]
  if (own) return { g: own, from: f }
  const sans = fonts.sans.glyphs[ch]
  if (sans) return { g: sans, from: fonts.sans }
  // ★ ♥ − and friends only exist in the tiny
  const tiny = fonts.tiny.glyphs[ch]
  if (tiny) return { g: tiny, from: fonts.tiny }
  return { g: fonts.sans.glyphs['?'], from: fonts.sans }
}

const shown = (font: FontName, s: string) => (fonts[font].caps ? s.toUpperCase() : s)

export function lineHeight(font: FontName): number {
  return fonts[font].line
}

export function capHeight(font: FontName): number {
  return fonts[font].cap
}

// faux bold: every glyph drawn twice, 1px apart, one px wider. measures the string as it'll show, in the current language
export function measure(s: string, font: FontName, bold = false): number {
  return Math.max(0, advance(say(s), font, bold) - 1)
}

function advance(s: string, font: FontName, bold: boolean): number {
  let w = 0
  for (const ch of shown(font, s)) w += ch === ' ' ? fonts[font].space : glyph(font, ch).g[6] + (bold ? 1 : 0)
  return w
}

export type TextStyle = { font?: FontName; color?: string; align?: 'left' | 'center' | 'right'; bold?: boolean; scale?: number; outline?: string }

// s is written in french: lang.ts swaps it to english when that's on, and french runs glint
export function drawText(g: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextStyle = {}): void {
  drawRuns(g, segments(s), x, y, pref('contrast') ? contrast(o) : o, true)
}

// High contrast (the pause menu): faded ink goes dark on paper and cream on the felt, light text gets an outline
const FADED = new Set(['#8c7656', '#5c4a36', '#a08a68', '#bfa77e', '#6b5a44', '#7a6e68', '#a69a90'])
const LIGHT = new Set(['#f6ecd2', '#e3d2a8', '#fff0b0'])
function contrast(o: TextStyle): TextStyle {
  const c = o.color?.toLowerCase() ?? ''
  if (FADED.has(c)) return { ...o, color: o.outline ? '#f6ecd2' : '#2e2320' }
  if (LIGHT.has(c) && !o.outline) return { ...o, outline: '#0e0b0a' }
  return o
}

function drawRuns(g: CanvasRenderingContext2D, runs: { s: string; french: boolean }[], x: number, y: number, o: TextStyle, glints: boolean): void {
  const font = o.font ?? 'sans'
  const scale = o.scale ?? 1
  // 1px outline: the glyphs in the outline color at the 4 orthogonal offsets, then the text on top
  if (o.outline) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawRuns(g, runs, x + dx * scale, y + dy * scale, { ...o, color: o.outline, outline: undefined }, false)
  }
  const f = fonts[font]
  const color = o.color ?? '#2e2320'
  const w = Math.max(0, runs.reduce((sum, r) => sum + advance(r.s, font, !!o.bold), 0) - 1) * scale
  let cx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x
  // snap to the art grid so glyph pixels line up with everything else
  cx = Math.round(cx)
  const cy = Math.round(y)
  const sweep = glints ? glintAt(g) : null
  for (const run of runs) {
    for (const ch of shown(font, run.s)) {
      if (ch === ' ') {
        cx += f.space * scale
        continue
      }
      const { g: [gx, gy, gw, gh, top, left, adv], from } = glyph(font, ch)
      // a fallback glyph from another font sits on this font's baseline
      const dy = top + (f.ascent - from.ascent)
      const lit = run.french && sweep !== null ? glint(color, sweep - cx) : color
      const img = tinted(lit)
      for (let b = 0; b < (o.bold ? 2 : 1); b++) g.drawImage(img, gx, gy, gw, gh, cx + (left + b) * scale, cy + dy * scale, gw * scale, gh * scale)
      cx += (adv + (o.bold ? 1 : 0)) * scale
    }
  }
}

// ---------- the french glint ----------
// a band of light that crosses the stage every few seconds, left to right. french letters it passes over brighten,
// so the french reads as gilt lettering. still (reduced motion): no glint

const GLINT_MS = 4200
const GLINT_SWEEP = 0.7 // of each cycle the band is crossing, the rest is a pause
const GLINT_W = 20 // half-width of the band, stage px
const lit = new Map<string, string[]>()

// where the band is in this context's x, or null between sweeps. it crosses the on-screen canvas, a bit past both edges.
// text drawn into an offscreen canvas never glints: a cached glint would stay lit forever
function glintAt(g: CanvasRenderingContext2D): number | null {
  if (still.matches || !pref('glint') || !(g.canvas instanceof HTMLCanvasElement) || !g.canvas.isConnected) return null
  const k = (performance.now() % GLINT_MS) / GLINT_MS
  if (k > GLINT_SWEEP) return null
  const w = g.canvas.width
  const band = w * (-0.06 + (k / GLINT_SWEEP) * 1.12)
  // back into the text's own units, under whatever scale and translate the scene set
  const m = g.getTransform()
  return m.a ? (band - m.e) / m.a : null
}

// the color a letter d px from the band's center gets: ink warms to brass, cream goes white-gold
function glint(color: string, d: number): string {
  const step = Math.abs(d) < GLINT_W / 3 ? 2 : Math.abs(d) < GLINT_W ? 1 : 0
  if (!step) return color
  let ramp = lit.get(color)
  if (!ramp) {
    const [r, g, b] = rgb(color)
    const dark = r * 0.3 + g * 0.59 + b * 0.11 < 128
    const to = dark ? [201, 140, 40] : [255, 246, 208]
    ramp = [color, mix([r, g, b], to, 0.5), mix([r, g, b], to, dark ? 0.85 : 1)]
    lit.set(color, ramp)
  }
  return ramp[step]
}

function rgb(color: string): [number, number, number] {
  const m = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return [128, 128, 128] // rgba() inks: treat as mid, they get the brass
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

function mix(a: number[], b: number[], t: number): string {
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

// wraps the string as it'll show (in the current language)
export function wrapText(s: string, width: number, font: FontName, bold = false): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of say(s).split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(next, font, bold) > width) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

// ---------- rich text: the rules markup (docs/UX.md §6) ----------
// {v}+30 Value{/} cream on a value-blue chip, {h} hype, {x}×1.5 Hype{/} cream on a flame chip, {g} grade, {$} money, {-} a loss,
// [Ash] a keyword (brass underline), a newline breaks. a token never wraps apart

type Mark = 'v' | 'h' | 'x' | 'g' | '$' | '-'
type Part = { s: string; mark: Mark | null; keyword: boolean }
type Placed = Part & { x: number; w: number }

export const RICH_LINE = 11
const CHIP_PAD = 2
const MARKS = new Set(['v', 'h', 'x', 'g', '$', '-'])
// the two chip stats (Value, ×Hype) sit on a chip of their color, the rest are bold text in it (ink.ts)
const CHIP: Partial<Record<Mark, string>> = { v: VALUE.paper, x: HYPE.paper }
const PAPER_INK: Record<Mark, string> = { v: '#f6ecd2', x: '#fffbe8', h: HYPE.paper, g: GRADE.paper, $: MONEY.paper, '-': LOSS.paper }
const FELT_INK: Record<Mark, string> = { v: '#f6ecd2', x: '#fffbe8', h: HYPE.felt, g: GRADE.felt, $: MONEY.felt, '-': LOSS.felt }

export type RichStyle = { felt?: boolean; color?: string }

// one paragraph per newline, each a list of parts. unknown or unclosed markup throws
function parseRich(text: string): Part[][] {
  return text.split('\n').map(para => {
    const parts: Part[] = []
    let plain = ''
    const flush = () => {
      if (plain) parts.push({ s: plain, mark: null, keyword: false })
      plain = ''
    }
    let i = 0
    while (i < para.length) {
      const ch = para[i]
      if (ch === '{') {
        const close = para.indexOf('}', i)
        const mark = para.slice(i + 1, close)
        if (close < 0 || !MARKS.has(mark)) throw new Error(`bad markup at ${i} in "${text}"`)
        const end = para.indexOf('{/}', close)
        if (end < 0) throw new Error(`unclosed {${mark}} in "${text}"`)
        flush()
        parts.push({ s: para.slice(close + 1, end), mark: mark as Mark, keyword: false })
        i = end + 3
      } else if (ch === '[') {
        const end = para.indexOf(']', i)
        if (end < 0) throw new Error(`unclosed [ in "${text}"`)
        flush()
        parts.push({ s: para.slice(i + 1, end), mark: null, keyword: true })
        i = end + 1
      } else {
        plain += ch
        i++
      }
    }
    flush()
    return parts
  })
}

function partWidth(p: Part): number {
  const w = measure(p.s, 'sans', !!p.mark && !CHIP[p.mark])
  return p.mark && CHIP[p.mark] ? w + CHIP_PAD * 2 : w
}

// greedy wrap by words. a word is everything between spaces, so "{h}+5 Hype{/}," stays glued to its comma
function layoutRich(text: string, maxW: number): Placed[][] {
  const space = fonts.sans.space
  const lines: Placed[][] = []
  for (const para of parseRich(text)) {
    const words: Part[][] = [[]]
    for (const part of para) {
      if (part.mark || part.keyword) {
        words[words.length - 1].push({ ...part, s: say(part.s) })
        continue
      }
      // a french run ("Le Patron") is one token, so it wraps whole and still glints when drawn
      for (const run of segments(part.s)) {
        if (run.french) {
          words[words.length - 1].push({ ...part, s: run.s })
          continue
        }
        run.s.split(' ').forEach((piece, i) => {
          if (i > 0) words.push([])
          if (piece) words[words.length - 1].push({ ...part, s: piece })
        })
      }
    }
    let line: Placed[] = []
    let x = 0
    for (const word of words) {
      if (!word.length) continue
      const w = word.reduce((sum, p) => sum + partWidth(p) + 1, -1)
      const at = line.length ? x + space + 1 : 0
      if (line.length && at + w > maxW) {
        lines.push(line)
        line = []
        x = 0
      } else x = at
      for (const p of word) {
        const pw = partWidth(p)
        line.push({ ...p, x, w: pw })
        x += pw + 1
      }
      x -= 1
    }
    lines.push(line)
  }
  return lines
}

// the widest line and the height, to size a box before drawing into it
export function richSize(text: string, maxW: number): { w: number; h: number } {
  const lines = layoutRich(text, maxW)
  const w = Math.max(0, ...lines.map(l => (l.length ? l[l.length - 1].x + l[l.length - 1].w : 0)))
  return { w, h: lines.length * RICH_LINE }
}

// draws the markup wrapped to maxW, y is the top of the first line. returns the height used.
// on paper by default (ink text), felt: true for cream outlined text over the world
export function richText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, o: RichStyle = {}): number {
  const lines = layoutRich(text, maxW)
  const base = o.color ?? (o.felt ? '#f6ecd2' : '#2e2320')
  const outline = o.felt ? '#0e0b0a' : undefined
  lines.forEach((line, row) => {
    const top = Math.round(y + row * RICH_LINE)
    for (const p of line) {
      const left = Math.round(x + p.x)
      const chip = p.mark && CHIP[p.mark]
      if (chip) {
        g.fillStyle = chip
        g.fillRect(left, top + 1, p.w, RICH_LINE - 1)
        drawText(g, p.s, left + CHIP_PAD, top, { color: PAPER_INK[p.mark!] })
        continue
      }
      const color = p.mark ? (o.felt ? FELT_INK : PAPER_INK)[p.mark] : base
      drawText(g, p.s, left, top, { color, bold: !!p.mark, outline })
      if (p.keyword) {
        g.fillStyle = o.felt ? '#e8c260' : '#c99a3a'
        g.fillRect(left, top + fonts.sans.ascent + 1, p.w, 1)
      }
    }
  })
  return lines.length * RICH_LINE
}

// the markup gone, for the DOM, aria labels and logs
export function plainText(text: string): string {
  return text.replace(/\{[^}]*\}/g, '').replace(/\[([^\]]*)\]/g, '$1')
}
