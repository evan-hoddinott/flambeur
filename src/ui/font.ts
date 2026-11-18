// the four bitmap fonts from art/fonts (built by art/fonts/build.py). white glyphs, tinted per color.
// y is always the top of the line box. a glyph a font doesn't have falls back to the sans, then the tiny, then '?'
import fontsPng from '../../art/fonts/fonts.png'
import fontsJson from '../../art/fonts/fonts.json'
import { canvas, ctx2d } from './art.ts'

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

// faux bold: every glyph drawn twice, 1px apart, one px wider
export function measure(s: string, font: FontName, bold = false): number {
  let w = 0
  for (const ch of shown(font, s)) w += ch === ' ' ? fonts[font].space : glyph(font, ch).g[6] + (bold ? 1 : 0)
  return Math.max(0, w - 1)
}

export type TextStyle = { font?: FontName; color?: string; align?: 'left' | 'center' | 'right'; bold?: boolean; scale?: number; outline?: string }

export function drawText(g: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextStyle = {}): void {
  const font = o.font ?? 'sans'
  const scale = o.scale ?? 1
  // 1px outline: the glyphs in the outline color at the 4 orthogonal offsets, then the text on top
  if (o.outline) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawText(g, s, x + dx * scale, y + dy * scale, { ...o, color: o.outline, outline: undefined })
  }
  const f = fonts[font]
  const img = tinted(o.color ?? '#2e2320')
  const w = measure(s, font, o.bold) * scale
  let cx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x
  // snap to the art grid so glyph pixels line up with everything else
  cx = Math.round(cx)
  const cy = Math.round(y)
  for (const ch of shown(font, s)) {
    if (ch === ' ') {
      cx += f.space * scale
      continue
    }
    const { g: [gx, gy, gw, gh, top, left, adv], from } = glyph(font, ch)
    // a fallback glyph from another font sits on this font's baseline
    const dy = top + (f.ascent - from.ascent)
    for (let b = 0; b < (o.bold ? 2 : 1); b++) g.drawImage(img, gx, gy, gw, gh, cx + (left + b) * scale, cy + dy * scale, gw * scale, gh * scale)
    cx += (adv + (o.bold ? 1 : 0)) * scale
  }
}

export function wrapText(s: string, width: number, font: FontName, bold = false): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of s.split(' ')) {
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
// {v}+30 Value{/} cream on an ink chip, {h} hype, {x}×1.5 Hype{/} cream on a flame chip, {g} grade, {$} money, {-} a loss,
// [Bulk] a keyword (brass underline), a newline breaks. a token never wraps apart

type Mark = 'v' | 'h' | 'x' | 'g' | '$' | '-'
type Part = { s: string; mark: Mark | null; keyword: boolean }
type Placed = Part & { x: number; w: number }

export const RICH_LINE = 11
const CHIP_PAD = 2
const MARKS = new Set(['v', 'h', 'x', 'g', '$', '-'])
const CHIP: Partial<Record<Mark, string>> = { v: '#2e2320', x: '#e8501a' }
// on paper the score colors drop one step so they read on cream. on the felt they're the color language as is
const PAPER_INK: Record<Mark, string> = { v: '#f6ecd2', x: '#fffbe8', h: '#e8501a', g: '#9c7028', $: '#3a8040', '-': '#a82a38' }
const FELT_INK: Record<Mark, string> = { v: '#f6ecd2', x: '#fffbe8', h: '#ff7a24', g: '#e8c260', $: '#6fcf6f', '-': '#d04a4e' }

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
        words[words.length - 1].push(part)
        continue
      }
      part.s.split(' ').forEach((piece, i) => {
        if (i > 0) words.push([])
        if (piece) words[words.length - 1].push({ ...part, s: piece })
      })
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
