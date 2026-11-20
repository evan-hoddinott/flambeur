// the title logo's fire (art/logo/fable/src/build.lua), live. heat rises off its sources and cools by a noisy
// amount per pixel, which carves the tongues. it steps at 15 fps like the logo's frames and paints in its ramp.
// a card burns the logo's way too: a front eats it from where it caught, scorched → char → a glowing edge → gone,
// and whatever is underneath shows through
import { canvas, ctx2d } from './art.ts'
import paletteGpl from '../../art/palette/flambeur.gpl?raw'

export const STEP_MS = 1000 / 15

// the logo's fire ramp, hottest first
export const FIRE = {
  white: '#fffbe0', yellow: '#ffe45e', orange: '#ffb22e', deep: '#f77a1c', red: '#dc3e1a', dark: '#9c1f26', smoke: '#55142a',
  char1: '#5a3420', char2: '#2e1810',
}

// pixels are read through a Uint32Array over ImageData, which is little endian (abgr) on every real machine
const abgr = (hex: string, a = 255) => ((a << 24) | (parseInt(hex.slice(5, 7), 16) << 16) | (parseInt(hex.slice(3, 5), 16) << 8) | parseInt(hex.slice(1, 3), 16)) >>> 0
const RAMP = [FIRE.white, FIRE.yellow, FIRE.orange, FIRE.deep, FIRE.red, FIRE.dark].map(c => abgr(c))
const RAMP_AT = [0.8, 0.62, 0.46, 0.32, 0.2, 0.11]
const SMOKE = abgr(FIRE.smoke)
const CHAR1 = abgr(FIRE.char1)
const CHAR2 = abgr(FIRE.char2)
const TONGUE = [abgr(FIRE.yellow), abgr(FIRE.orange), abgr(FIRE.deep)]

// ---------- noise (lib.lua's hash and value noise) ----------

function hash(x: number, y: number, s: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) >>> 0
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0
  n = (n ^ (n >>> 16)) >>> 0
  return (n & 0xffff) / 65536
}

// smooth value noise on an sx × sy lattice. px, py = periods in lattice cells, so a tile wraps
export function vnoise(x: number, y: number, sx: number, sy: number, seed: number, px = 0, py = 0): number {
  const fx = x / sx, fy = y / sy
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  let tx = fx - x0, ty = fy - y0
  tx = tx * tx * (3 - 2 * tx)
  ty = ty * ty * (3 - 2 * ty)
  const xa = px ? x0 % px : x0, xb = px ? (x0 + 1) % px : x0 + 1
  const ya = py ? y0 % py : y0, yb = py ? (y0 + 1) % py : y0 + 1
  const a = hash(xa, ya, seed), b = hash(xb, ya, seed), c = hash(xa, yb, seed), d = hash(xb, yb, seed)
  const top = a + (b - a) * tx
  return top + (c + (d - c) * tx - top) * ty
}

// ---------- the heat field ----------

export type Fire = {
  x: number; y: number; w: number; h: number // where it sits on the stage
  heat: Float32Array
  src: Float32Array // fed this step, cleared after it
  n1: Float32Array // the logo's two scrolling noise tiles, 96 and 64 rows
  n2: Float32Array
  n: number // steps so far
  tall: number // 1 = the logo's idle flame, bigger burns taller
  cv: HTMLCanvasElement
  data: ImageData
  px: Uint32Array
  glow: number // how much is burning, 0..~1.5, for the firelight
}

export function makeFire(x: number, y: number, w: number, h: number): Fire {
  // the tiles wrap sideways too, so a narrow fire has no seam
  w = Math.ceil(w / 28) * 28
  const n1 = new Float32Array(w * 96)
  const n2 = new Float32Array(w * 64)
  for (let yy = 0; yy < 96; yy++) for (let xx = 0; xx < w; xx++) n1[yy * w + xx] = vnoise(xx, yy, 7, 16, 11, w / 7, 6)
  for (let yy = 0; yy < 64; yy++) for (let xx = 0; xx < w; xx++) n2[yy * w + xx] = vnoise(xx, yy, 4, 8, 23, w / 4, 8)
  const cv = canvas(w, h)
  const data = ctx2d(cv).createImageData(w, h)
  return { x, y, w, h, heat: new Float32Array(w * h), src: new Float32Array(w * h), n1, n2, n: 0, tall: 1, cv, data, px: new Uint32Array(data.data.buffer), glow: 0 }
}

// heat at a stage pixel for the next step. sources only ever raise it
export function feed(f: Fire, x: number, y: number, v: number): void {
  const fx = Math.round(x - f.x), fy = Math.round(y - f.y)
  if (fx < 1 || fx >= f.w - 1 || fy < 0 || fy >= f.h) return
  const k = fy * f.w + fx
  if (v > f.src[k]) f.src[k] = v
}

// one 15 fps step: every cell takes the average of the three below it, nudged sideways by the second tile,
// minus a noisy cooling times a slow per-column fuel (build.lua's fire()). heat climbs a row per pass, so a step
// runs a few passes and the tongues rise at a card's pace, then paints once: it still moves like pixel art
export function stepFire(f: Fire, passes = 4): void {
  for (let i = 0; i < passes; i++) pass(f)
  f.src.fill(0)
  paint(f)
}

function pass(f: Fire): void {
  const { w, h, heat, src, n1, n2 } = f
  const n = f.n++
  const D = 1 / (21 * f.tall)
  const o1 = 4 * n, o2 = 8 * n
  const fr = ((6 * n) % 96) * w
  let sum = 0
  for (let y = h - 1; y >= 0; y--) {
    const row = y * w, below = row + w
    const r1 = ((y + o1) % 96) * w
    const r2 = ((y + o2) % 64) * w
    for (let x = 0; x < w; x++) {
      const a = n1[r1 + x], b = n2[r2 + x]
      let v = 0
      if (y + 1 < h) {
        let xs = x
        if (b > 0.64) xs = x + 1
        else if (b < 0.36) xs = x - 1
        if (xs < 1) xs = 1
        else if (xs > w - 2) xs = w - 2
        const i = below + xs
        const fuel = 0.6 + 1.5 * n1[fr + ((x * 3 + 5) % w)]
        v = (heat[i - 1] + 2 * heat[i] + heat[i + 1]) * 0.25 - D * (0.12 + 2.6 * a * a * a + 0.5 * b) * fuel
      }
      const s = src[row + x]
      if (s > v) v = s
      if (v < 0) v = 0
      heat[row + x] = v
      sum += v
    }
  }
  f.glow = Math.min(1.5, sum / 2600)
}

// paintFire(): the ramp by heat, then a checker of smoke where it's nearly out
function paint(f: Fire): void {
  const { w, h, heat, px } = f
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      const v = heat[k]
      let c = 0
      if (v > 0.05) {
        for (let r = 0; r < RAMP.length; r++) {
          if (v >= RAMP_AT[r]) {
            c = RAMP[r]
            break
          }
        }
        if (!c && (x + y) % 2 === 0) c = SMOKE
      }
      px[k] = c
    }
  }
  ctx2d(f.cv).putImageData(f.data, 0, 0)
}

export function drawFire(g: CanvasRenderingContext2D, f: Fire, alpha = 1): void {
  g.save()
  g.globalAlpha = alpha
  g.drawImage(f.cv, f.x, f.y)
  g.restore()
}

// ---------- sparks: embers that rise and cool, ash flakes that drift, steam ----------

export type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; kind: 'ember' | 'ash' | 'steam' | 'soul'; seed: number }

const EMBER = [FIRE.white, FIRE.yellow, FIRE.orange, FIRE.deep, FIRE.red, FIRE.dark]
const ASH = ['#d8cfc4', '#a69a8e', '#6f645c', '#463d38']
const STEAM = ['#fffbe8', '#e9e2d6', '#c9c1b6']

export function stepSparks(list: Spark[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]
    s.age += dt
    if (s.age >= s.life) {
      list.splice(i, 1)
      continue
    }
    const t = s.age / s.life
    if (s.kind === 'ember') {
      s.vy -= 30 * dt // hot air
      s.vx += Math.sin(s.age * 9 + s.seed * 6) * 40 * dt
    } else if (s.kind === 'ash') {
      s.vy += (t < 0.4 ? -12 : 16) * dt // lifted, then it settles
      s.vx = Math.sin(s.age * 4 + s.seed * 6) * 10
    } else if (s.kind === 'steam') {
      s.vy -= 10 * dt
      s.vx *= 0.97
    }
    s.x += s.vx * dt
    s.y += s.vy * dt
  }
}

export function drawSparks(g: CanvasRenderingContext2D, list: Spark[]): void {
  for (const s of list) {
    const t = s.age / s.life
    const x = Math.round(s.x), y = Math.round(s.y)
    if (s.kind === 'ember' || s.kind === 'soul') {
      g.fillStyle = EMBER[Math.min(EMBER.length - 1, Math.floor(t * EMBER.length))]
      g.fillRect(x, y, 1, 1)
      if (s.kind === 'soul' || t < 0.25) {
        // a hot one trails a pixel
        g.fillStyle = FIRE.deep
        g.fillRect(x - Math.sign(s.vx), y - Math.sign(s.vy), 1, 1)
      }
    } else if (s.kind === 'ash') {
      g.fillStyle = ASH[Math.min(ASH.length - 1, Math.floor(t * ASH.length))]
      g.fillRect(x, y, s.seed > 0.7 ? 2 : 1, 1)
    } else {
      g.globalAlpha = 0.75 * (1 - t)
      g.fillStyle = STEAM[Math.floor(s.seed * STEAM.length)]
      const r = 1 + Math.floor(t * 3)
      g.fillRect(x - (r >> 1), y - (r >> 1), r, r)
      g.globalAlpha = 1
    }
  }
}

// ---------- burning a card ----------
// the burn field says when each pixel goes: far from where it caught goes last, the card's edge burns a little
// ahead (paper catches at the edge), the index corner holds on so you can still read it, and noise rags the front

const PALETTE = paletteGpl.split('\n').filter(l => /^\s*\d/.test(l)).map(l => l.trim().split(/\s+/).slice(0, 3).map(Number))
const toast = new Map<number, number>()

// the logo's scorch: each channel browned, snapped to the game palette
function scorch(p: number, amount: number): number {
  const key = p * 4 + amount
  const hit = toast.get(key)
  if (hit !== undefined) return hit
  const k = [[1, 1, 1], [0.92, 0.86, 0.76], [0.78, 0.68, 0.55]][amount]
  const r = (p & 255) * k[0], g = ((p >> 8) & 255) * k[1], b = ((p >> 16) & 255) * k[2]
  let best = PALETTE[0], bestD = Infinity
  for (const c of PALETTE) {
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  const out = ((p & 0xff000000) | (best[2] << 16) | (best[1] << 8) | best[0]) >>> 0
  toast.set(key, out)
  return out
}

export type Burn = {
  w: number; h: number
  base: Uint32Array // the card that burns
  under: Uint32Array // what the front reveals (transparent where nothing)
  field: Float32Array // when each pixel goes, low = first. Infinity = not card
  lo: number; hi: number
  cv: HTMLCanvasElement
  data: ImageData
  px: Uint32Array
  edge: number[] // this frame's glowing pixels, x,y pairs, card-local
}

function pixels(img: HTMLCanvasElement | null, w: number, h: number): Uint32Array {
  const c = canvas(w, h)
  const g = ctx2d(c)
  if (img) g.drawImage(img, Math.floor((w - img.width) / 2), Math.floor((h - img.height) / 2))
  return new Uint32Array(g.getImageData(0, 0, w, h).data.buffer)
}

// ignite: where the flame touched, card-local pixels. seed: rags this card's front its own way
export function makeBurn(art: HTMLCanvasElement, under: HTMLCanvasElement | null, ignite: { x: number; y: number }, seed: number): Burn {
  const w = Math.max(art.width, under?.width ?? 0)
  const h = Math.max(art.height, under?.height ?? 0)
  const base = pixels(art, w, h)
  // chamfer distance to the card's own edge
  const INF = 1e9
  const d = new Float32Array(w * h)
  for (let k = 0; k < w * h; k++) d[k] = base[k] >>> 24 ? INF : 0
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const k = y * w + x
    if (d[k] > 0) d[k] = Math.min(d[k], d[k - 1] + 1, d[k - w] + 1, d[k - w - 1] + 1.4, d[k - w + 1] + 1.4)
  }
  for (let y = h - 2; y > 0; y--) for (let x = w - 2; x > 0; x--) {
    const k = y * w + x
    if (d[k] > 0) d[k] = Math.min(d[k], d[k + 1] + 1, d[k + w] + 1, d[k + w + 1] + 1.4, d[k + w - 1] + 1.4)
  }
  const field = new Float32Array(w * h)
  let lo = Infinity, hi = -Infinity
  const ix = Math.floor((w - art.width) / 2) + 9, iy = Math.floor((h - art.height) / 2) + 12 // the index corner
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      if (!(base[k] >>> 24)) {
        field[k] = Infinity
        continue
      }
      const nz = 0.7 * vnoise(x, y, 9, 9, 40 + seed) + 0.3 * vnoise(x, y, 3, 3, 60 + seed)
      const caught = Math.hypot(x - ignite.x, (y - ignite.y) * 0.8) // it climbs a bit faster than it spreads
      const rim = Math.max(0, 5 - d[k]) * 1.6
      const keep = Math.max(0, 14 - Math.hypot(x - ix, y - iy) / 1.6)
      const v = caught - rim + 18 * (nz - 0.5) + keep
      field[k] = v
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  const cv = canvas(w, h)
  const data = ctx2d(cv).createImageData(w, h)
  return { w, h, base, under: pixels(under, w, h), field, lo, hi, cv, data, px: new Uint32Array(data.data.buffer), edge: [] }
}

// t: 0 = untouched, 1 = burnt through. step: the fire's step, so the glowing edge flickers with it
export function drawBurn(b: Burn, t: number, step: number): HTMLCanvasElement {
  const { w, h, base, under, field, px } = b
  // bands, in field units: gone | glowing | char | char | scorched | toasted | whole
  const l = b.lo - 16 + (b.hi - b.lo + 20) * t
  b.edge.length = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      const be = field[k]
      if (be === Infinity) {
        px[k] = under[k]
        continue
      }
      if (be < l) px[k] = under[k]
      else if (be < l + 1.8) {
        const r = hash(x, y + step * 3, 7)
        px[k] = r > 0.62 ? TONGUE[0] : r > 0.3 ? TONGUE[1] : TONGUE[2]
        b.edge.push(x, y)
      } else if (be < l + 4) px[k] = CHAR2
      else if (be < l + 6) px[k] = (x + y) % 2 && be > l + 5 ? scorch(base[k], 2) : CHAR1
      else if (be < l + 10) px[k] = scorch(base[k], 2)
      else if (be < l + 15) px[k] = (x + y) % 2 || be < l + 12.5 ? scorch(base[k], 1) : base[k]
      else px[k] = base[k]
    }
  }
  ctx2d(b.cv).putImageData(b.data, 0, 0)
  return b.cv
}
