// the four bitmap fonts from art/fonts (built by art/fonts/build.py). white glyphs, tinted per color.
// y is always the top of the line box. a glyph a font doesn't have falls back to the sans, then '?'
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
