// the fable logo (art/logo/fable): reels lock in, the word catches fire, then a 48 frame idle loop.
// the wordmark, fire and number are baked sheets. the card fan is the game's real cards: the logo's
// cards layer is only a mask (marker colors for each card, plus char and ember pixels) and fan.json
// says where each card sits on every frame, so this paints the art in and the fire still lines up.
// rebuild the sheets with art/logo/fable/src/export.sh
import introPng from '../../art/logo/fable/intro.png'
import idlePng from '../../art/logo/fable/idle.png'
import cardsIntroPng from '../../art/logo/fable/cards_intro.png'
import cardsIdlePng from '../../art/logo/fable/cards_idle.png'
import introJson from '../../art/logo/fable/intro.json'
import idleJson from '../../art/logo/fable/idle.json'
import fan from '../../art/logo/fable/fan.json'
import paletteGpl from '../../art/palette/flambeur.gpl?raw'
import { blit, canvas, ctx2d, sprite, suitInk, tinted } from './art.ts'
import type { Suit } from '../engine/cards.ts'

export const LOGO_W = 384
export const LOGO_H = 216
export const INTRO_FRAMES = introJson.frames.length
export const IDLE_FRAMES = idleJson.frames.length
const CW = fan.cw
const CH = fan.ch

// same fan as the old hand-drawn courts: lancelot, rachel, charles, pallas, hector
const FAN: { rank: 'J' | 'Q' | 'K'; suit: Suit }[] = [
  { rank: 'J', suit: 'C' }, { rank: 'Q', suit: 'D' }, { rank: 'K', suit: 'H' }, { rank: 'Q', suit: 'S' }, { rank: 'J', suit: 'D' },
]

// pixels are read through a Uint32Array over ImageData, which is little endian (abgr) on every real machine
const rgba = (r: number, g: number, b: number) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
// the marker colors from art/logo/fable/src/lib.lua
const INTACT = [0xc1, 0xc2, 0xc3, 0xc4, 0xc5].map(b => rgba(0xf4, 0xe8, b))
const SCORCHED = [0x99, 0x9a, 0x9b, 0x9c, 0x9d].map(b => rgba(0xdf, 0xcb, b))
const EDGE = rgba(0x1c, 0x15, 0x13) // a mask pixel the art sample missed by rounding gets the card's ink edge

type Sheet = { img: HTMLImageElement; mask: HTMLImageElement; frames: { x: number; y: number; ms: number }[] }
type Decal = { px: Uint32Array; w: number; h: number; lx: number; ly: number }
type FanCard = { big: Uint32Array; decals: Decal[] }

let sheets: { intro: Sheet; idle: Sheet } | null = null
let cards: FanCard[] = []
let scratch: CanvasRenderingContext2D // one frame of the mask, read back
let out: HTMLCanvasElement // the composed logo frame
let outG: CanvasRenderingContext2D
let outData: ImageData
let layers: Uint32Array[] = [] // each card rotated into place, full logo size
const scorchCache = new Map<number, number>()
let drawn = '' // which frame out holds

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => fail(new Error(`couldn't load ${url}`))
    img.src = url
  })
}

function sheetFrames(data: typeof introJson) {
  return data.frames.map(f => ({ x: f.frame.x, y: f.frame.y, ms: f.duration }))
}

// call after loadArt(), the fan is built from the card atlas
export async function loadLogo(): Promise<void> {
  const [intro, idle, maskIntro, maskIdle] = await Promise.all([introPng, idlePng, cardsIntroPng, cardsIdlePng].map(loadImage))
  sheets = {
    intro: { img: intro, mask: maskIntro, frames: sheetFrames(introJson) },
    idle: { img: idle, mask: maskIdle, frames: sheetFrames(idleJson) },
  }
  if (fan.frames.length !== INTRO_FRAMES + IDLE_FRAMES) throw new Error('fan.json and the logo sheets are from different builds')
  const read = canvas(LOGO_W, LOGO_H).getContext('2d', { willReadFrequently: true }) // read back every frame
  if (!read) throw new Error('no 2d context')
  scratch = read
  out = canvas(LOGO_W, LOGO_H)
  outG = ctx2d(out)
  outData = outG.createImageData(LOGO_W, LOGO_H)
  layers = FAN.map(() => new Uint32Array(LOGO_W * LOGO_H))
  cards = FAN.map(c => fanCard(c.rank, c.suit))
}

// ---------- the fan cards ----------

function pixels(c: HTMLCanvasElement): Uint32Array {
  return new Uint32Array(ctx2d(c).getImageData(0, 0, c.width, c.height).data.buffer)
}

// scale2x (epx), same rule as the logo generator's L.scale2x. outside the image counts as empty
function scale2x(src: Uint32Array, w: number, h: number): Uint32Array {
  const dst = new Uint32Array(w * h * 4)
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[y * w + x])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = src[y * w + x]
      const a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1)
      const o = 2 * y * 2 * w + 2 * x
      dst[o] = c === a && c !== d && a !== b ? a : p
      dst[o + 1] = a === b && a !== c && b !== d ? b : p
      dst[o + 2 * w] = d === c && d !== b && c !== a ? c : p
      dst[o + 2 * w + 1] = b === d && b !== a && d !== c ? d : p
    }
  }
  return dst
}

function rot180(px: Uint32Array): Uint32Array {
  return px.slice().reverse()
}

// the printed face minus the index, upscaled 8x so it rotates clean. the index is kept as decals
// stamped unrotated, like the logo's old courts, so the letters stay crisp at an angle
function fanCard(rank: 'J' | 'Q' | 'K', suit: Suit): FanCard {
  const face = canvas(CW, CH)
  const g = ctx2d(face)
  blit(g, 'base/paper', 0, 0)
  const court = sprite(`court/${rank}/${suit}`)
  for (const flip of [false, true]) {
    g.save()
    if (flip) {
      g.translate(CW, CH)
      g.rotate(Math.PI)
    }
    g.drawImage(court.img, court.x, court.y, court.w, court.h, 12, 10, court.w, court.h)
    g.restore()
  }
  let big = pixels(face)
  for (let s = 1; s < 8; s *= 2) big = scale2x(big, CW * s, CH * s)
  const decals: Decal[] = []
  const ink = suitInk(suit)
  // same spots as faceCanvas: rank at (4,4), suit at (5,16), and both again turned 180° in the far corner
  for (const [glyph, x, y] of [[tinted(`index/rank/${rank}`, ink), 4, 4], [tinted(`index/suit/${suit}`, ink), 5, 16]] as const) {
    const px = pixels(glyph)
    const w = glyph.width, h = glyph.height
    decals.push({ px, w, h, lx: x + w / 2, ly: y + h / 2 })
    decals.push({ px: rot180(px), w, h, lx: CW - x - w / 2, ly: CH - y - h / 2 })
  }
  return { big, decals }
}

// the card rotated by ang (radians, clockwise) around cx,cy. the same mapping as renderCard in build.lua
function renderCard(dst: Uint32Array, card: FanCard, ang: number, cx: number, cy: number): void {
  const cs = Math.cos(ang), sn = Math.sin(ang)
  const bw = CW * 8
  const r = 56
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(LOGO_W - 1, Math.ceil(cx + r))
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(LOGO_H - 1, Math.ceil(cy + r))
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const u = dx * cs + dy * sn + CW / 2
      const v = -dx * sn + dy * cs + CH / 2
      if (u >= 0 && u < CW && v >= 0 && v < CH) {
        const p = card.big[Math.floor(v * 8) * bw + Math.floor(u * 8)]
        if (p >>> 24) dst[y * LOGO_W + x] = p
      }
    }
  }
  for (const d of card.decals) {
    const a = d.lx - CW / 2, b = d.ly - CH / 2
    const ox = Math.floor(cx + a * cs - b * sn - d.w / 2 + 0.5)
    const oy = Math.floor(cy + a * sn + b * cs - d.h / 2 + 0.5)
    for (let gy = 0; gy < d.h; gy++) {
      for (let gx = 0; gx < d.w; gx++) {
        const p = d.px[gy * d.w + gx]
        const x = ox + gx, y = oy + gy
        if (p >>> 24 && x >= 0 && y >= 0 && x < LOGO_W && y < LOGO_H && dst[y * LOGO_W + x]) dst[y * LOGO_W + x] = p
      }
    }
  }
}

// ---------- scorch: one step darker and warmer, snapped back onto the master palette ----------

const PALETTE = paletteGpl.split('\n')
  .map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)/))
  .filter(m => m !== null)
  .map(m => [Number(m[1]), Number(m[2]), Number(m[3])])

function scorch(p: number): number {
  const hit = scorchCache.get(p)
  if (hit !== undefined) return hit
  const r = (p & 255) * 0.78, g = ((p >> 8) & 255) * 0.68, b = ((p >> 16) & 255) * 0.55
  let best = PALETTE[0]
  let bestD = Infinity
  for (const c of PALETTE) {
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  const s = rgba(best[0], best[1], best[2])
  scorchCache.set(p, s)
  return s
}

// ---------- frames ----------

// g is the global frame: 0..INTRO_FRAMES-1 is the intro, then the idle loop
export function frameMs(g: number): number {
  if (!sheets) throw new Error('loadLogo() first')
  return g < INTRO_FRAMES ? sheets.intro.frames[g].ms : sheets.idle.frames[g - INTRO_FRAMES].ms
}

// the composed logo for global frame g, LOGO_W x LOGO_H, transparent around it
export function logoFrame(g: number): HTMLCanvasElement {
  if (!sheets) throw new Error('loadLogo() first')
  const key = String(g)
  if (key === drawn) return out
  drawn = key
  const sheet = g < INTRO_FRAMES ? sheets.intro : sheets.idle
  const f = sheet.frames[g < INTRO_FRAMES ? g : g - INTRO_FRAMES]

  scratch.clearRect(0, 0, LOGO_W, LOGO_H)
  scratch.drawImage(sheet.mask, f.x, f.y, LOGO_W, LOGO_H, 0, 0, LOGO_W, LOGO_H)
  const mask = new Uint32Array(scratch.getImageData(0, 0, LOGO_W, LOGO_H).data.buffer)

  const poses = fan.frames[g]
  for (let i = 0; i < cards.length; i++) {
    layers[i].fill(0)
    const p = poses[i]
    if (p) renderCard(layers[i], cards[i], p[0], p[1], p[2])
  }
  const px = new Uint32Array(outData.data.buffer)
  for (let k = 0; k < px.length; k++) {
    const m = mask[k]
    if (!(m >>> 24)) {
      px[k] = 0
      continue
    }
    const i = INTACT.indexOf(m)
    if (i >= 0) {
      px[k] = layers[i][k] || EDGE
      continue
    }
    const s = SCORCHED.indexOf(m)
    px[k] = s >= 0 ? scorch(layers[s][k] || EDGE) : m // char and embers are drawn as baked
  }
  outG.putImageData(outData, 0, 0)
  outG.drawImage(sheet.img, f.x, f.y, LOGO_W, LOGO_H, 0, 0, LOGO_W, LOGO_H)
  return out
}

// how hard the fire lights the room, 0..~1.5, roughly following the flames (from the logo's preview.html)
export function firelight(g: number): number {
  if (g >= INTRO_FRAMES) return 0.6 + 0.06 * Math.sin(((g - INTRO_FRAMES) / IDLE_FRAMES) * Math.PI * 6)
  if (g < 15) return 0
  if (g < 58) return Math.min(8, Math.floor((g - 10) / 5)) * 0.04
  return 0.6 + 0.9 * Math.exp(-(g - 60) / 6)
}
