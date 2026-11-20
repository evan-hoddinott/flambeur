// the atlases (duel + cards from aseprite, shop from art/shop/counter.py, tickets from art/tickets/build.py), sprite lookup by slice name, and the card compositor.
// card faces are assembled at runtime from parts, the same recipe as art/cards/build.py
import collectiblePng from '../../art/collectibles/collectibles.png'
import collectibleJson from '../../art/collectibles/collectibles.json'
import duelPng from '../../art/duel/duel.png'
import duelJson from '../../art/duel/duel.json'
import cardsPng from '../../art/cards/cards.png'
import cardsJson from '../../art/cards/cards.json'
import shopPng from '../../art/shop/shop.png'
import shopJson from '../../art/shop/shop.json'
import ticketsPng from '../../art/tickets/tickets.png'
import ticketsJson from '../../art/tickets/tickets.json'
import { rankLabel, traitName, type Card, type Suit } from '../engine/cards.ts'
import type { StarterId } from '../engine/starters.ts'
import { onPref, pref, still } from './prefs.ts'

export type Sprite = {
  img: HTMLImageElement | HTMLCanvasElement
  x: number; y: number; w: number; h: number
  px: number; py: number // pivot, from the sprite's top-left
  center: { x: number; y: number; w: number; h: number } | null // 9-slice middle
}

type SliceJson = {
  name: string
  keys: { bounds: { x: number; y: number; w: number; h: number }; pivot?: { x: number; y: number }; center?: { x: number; y: number; w: number; h: number } }[]
}

const sprites = new Map<string, Sprite>()

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => fail(new Error(`couldn't load ${url}`))
    img.src = url
  })
}

export async function loadArt(): Promise<void> {
  const [duel, cards, shop, collectibles, tickets] = await Promise.all([loadImage(duelPng), loadImage(cardsPng), loadImage(shopPng), loadImage(collectiblePng), loadImage(ticketsPng)])
  for (const [img, data] of [[duel, duelJson], [cards, cardsJson], [shop, shopJson], [collectibles, collectibleJson], [tickets, ticketsJson]] as const) {
    for (const s of (data.meta.slices as SliceJson[])) {
      const k = s.keys[0]
      sprites.set(s.name, { img, ...k.bounds, px: k.pivot?.x ?? 0, py: k.pivot?.y ?? 0, center: k.center ?? null })
    }
  }
}

export function sprite(name: string): Sprite {
  const s = sprites.get(name)
  if (!s) throw new Error(`no sprite ${name}`)
  return s
}

// ---------- small canvas helpers ----------

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d')
  if (!g) throw new Error('no 2d context')
  g.imageSmoothingEnabled = false
  return g
}

export function blit(g: CanvasRenderingContext2D, name: string, x: number, y: number): void {
  const s = sprite(name)
  g.drawImage(s.img, s.x, s.y, s.w, s.h, x, y, s.w, s.h)
}

// corners stay native size, edges and middle stretch. tint multiplies a greyscale sprite by a color
export function nineSlice(g: CanvasRenderingContext2D, name: string, x: number, y: number, w: number, h: number, tint?: string): void {
  const s = sprite(name)
  const img = tint ? tinted(name, tint) : s.img
  const sx0 = tint ? 0 : s.x
  const sy0 = tint ? 0 : s.y
  const m = s.center
  if (!m) throw new Error(`${name} has no 9-slice center`)
  const sx = [0, m.x, m.x + m.w, s.w]
  const sy = [0, m.y, m.y + m.h, s.h]
  const dx = [0, m.x, w - (s.w - m.x - m.w), w]
  const dy = [0, m.y, h - (s.h - m.y - m.h), h]
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const sw = sx[c + 1] - sx[c]
      const sh = sy[r + 1] - sy[r]
      const tw = dx[c + 1] - dx[c]
      const th = dy[r + 1] - dy[r]
      if (sw <= 0 || sh <= 0 || tw <= 0 || th <= 0) continue
      g.drawImage(img, sx0 + sx[c], sy0 + sy[r], sw, sh, x + dx[c], y + dy[r], tw, th)
    }
  }
}

// the greyscale glyph times the ink color, alpha kept
const tints = new Map<string, HTMLCanvasElement>()
export function tinted(name: string, ink: string): HTMLCanvasElement {
  const key = `${name}|${ink}`
  const hit = tints.get(key)
  if (hit) return hit
  const s = sprite(name)
  const c = canvas(s.w, s.h)
  const g = ctx2d(c)
  blit(g, name, 0, 0)
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = ink
  g.fillRect(0, 0, s.w, s.h)
  g.globalCompositeOperation = 'destination-in'
  blit(g, name, 0, 0)
  tints.set(key, c)
  return c
}

// draws the part, plus its copy turned 180° around the card center
function mirrorPair(g: CanvasRenderingContext2D, part: CanvasImageSource & { width: number; height: number }, x: number, y: number): void {
  g.drawImage(part, x, y)
  g.save()
  g.translate(64, 88)
  g.rotate(Math.PI)
  g.drawImage(part, x, y)
  g.restore()
}

export function partCanvas(name: string): HTMLCanvasElement {
  const s = sprite(name)
  const c = canvas(s.w, s.h)
  blit(ctx2d(c), name, 0, 0)
  return c
}

// ---------- cards ----------

// Ash still smoulders: two frames with the embers' yellow and orange swapped, a few times a second (FLAMBER.md §4)
let ashFrames: HTMLCanvasElement[] = []
function ashCanvas(): HTMLCanvasElement {
  if (!ashFrames.length) {
    const lit = partCanvas('base/bulk')
    const g = ctx2d(lit)
    const img = g.getImageData(0, 0, lit.width, lit.height)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const hex = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
      const to = hex === 0xffe45e ? 0xf77a1c : hex === 0xf77a1c ? 0xffe45e : hex === 0x9c1f26 ? 0xdc3e1a : -1
      if (to < 0 || !d[i + 3]) continue
      d[i] = to >> 16
      d[i + 1] = (to >> 8) & 255
      d[i + 2] = to & 255
    }
    g.putImageData(img, 0, 0)
    ashFrames = [partCanvas('base/bulk'), lit]
  }
  return still.matches ? ashFrames[0] : ashFrames[Math.floor(performance.now() / 340) % 2]
}

// pip centers on the 64x88 stock, each row lists its columns
const PIP_ROWS: Record<number, [number, string][]> = {
  2: [[16, 'C'], [72, 'C']],
  3: [[16, 'C'], [44, 'C'], [72, 'C']],
  4: [[16, 'LR'], [72, 'LR']],
  5: [[16, 'LR'], [44, 'C'], [72, 'LR']],
  6: [[16, 'LR'], [44, 'LR'], [72, 'LR']],
  7: [[16, 'LR'], [30, 'C'], [44, 'LR'], [72, 'LR']],
  8: [[16, 'LR'], [30, 'C'], [44, 'LR'], [58, 'C'], [72, 'LR']],
  9: [[16, 'LR'], [35, 'LR'], [44, 'C'], [53, 'LR'], [72, 'LR']],
  10: [[16, 'LR'], [25, 'C'], [35, 'LR'], [53, 'LR'], [63, 'C'], [72, 'LR']],
}
const COL_X: Record<string, number> = { L: 20, C: 32, R: 44 }

export const INK = { dark: '#1c1513', red: '#a82a38', brass: '#c99a3a' }

// four-color suits (ART.md §15, the pause menu): ♦ brass and ♣ felt green, so a flush reads at a glance
export function suitInk(suit: Suit): string {
  if (pref('fourColor')) return { S: INK.dark, H: INK.red, D: INK.brass, C: '#2d7a5c' }[suit]
  return suit === 'S' || suit === 'C' ? INK.dark : INK.red
}

const prints = new Map<string, HTMLCanvasElement>()
function printedFace(rank: number, suit: Suit, joker: boolean, inset: boolean, wax: boolean): HTMLCanvasElement {
  const key = [rank, suit, joker, inset, wax].join('|')
  const hit = prints.get(key)
  if (hit) return hit
  const c = canvas(64, 88)
  const g = ctx2d(c)
  if (joker) {
    mirrorPair(g, partCanvas('court/joker'), 12, 10)
    mirrorPair(g, partCanvas('index/joker'), inset ? 7 : 5, inset ? 8 : 6)
  } else {
    const r = rankLabel(rank)
    const ink = suitInk(suit)
    if (r === 'A') blit(g, `pip/ace/${suit}`, 19, 31)
    else if (rank <= 10) {
      const pip = tinted(`pip/${suit}`, ink)
      for (const [y, cols] of PIP_ROWS[rank]) {
        for (const col of cols) {
          const x = COL_X[col]
          if (y > 44) {
            g.save()
            g.translate(x, y)
            g.rotate(Math.PI)
            g.drawImage(pip, -6, -6)
            g.restore()
          } else g.drawImage(pip, x - 5, y - 5)
        }
      }
    } else mirrorPair(g, partCanvas(`court/${r}/${suit}`), 12, 10)
    mirrorPair(g, wax ? partCanvas('index/wax') : tinted(`index/rank/${r}`, ink), inset ? 7 : 4, inset ? 8 : 4)
    mirrorPair(g, tinted(`index/suit/${suit}`, ink), inset ? 8 : 5, inset ? 20 : 16)
  }
  prints.set(key, c)
  return c
}

const faces = new Map<string, HTMLCanvasElement>()
export function faceCanvas(rank: number, suit: Suit, joker = false): HTMLCanvasElement {
  const key = [rank, suit, joker].join('|')
  let face = faces.get(key)
  if (!face) {
    face = partCanvas('base/paper')
    ctx2d(face).drawImage(printedFace(rank, suit, joker, false, false), 0, 0)
    faces.set(key, face)
  }
  return face
}

const backs = new Map<string, HTMLCanvasElement>()
export function backCanvas(box: StarterId | null): HTMLCanvasElement {
  const id = box ?? 'standard'
  const hit = backs.get(id)
  if (hit) return hit
  const c = canvas(64, 88)
  const g = ctx2d(c)
  const tile = sprite(`back/tile/${id}`)
  g.save()
  g.beginPath()
  g.rect(5, 5, 54, 78)
  g.clip()
  for (let y = 5; y < 83; y += tile.h) for (let x = 5; x < 59; x += tile.w) blit(g, `back/tile/${id}`, x, y)
  g.restore()
  blit(g, 'back/frame', 0, 0)
  blit(g, `back/emblem/${id}`, 16, 24)
  backs.set(id, c)
  return c
}

export const specialInk = {
  chase: '#e8c260', sticker: '#ffffff', rookie: '#3e66a0', jumbo: '#bfa77e',
  joker: '#7a4ab0', crayon: '#cf403c', bulk: '#43342e', foil: '#e8c260',
  holo: '#b088e0', prism: '#ff7a24', misprint: '#19c8cd', first: '#a82a38',
  signed: '#28497a', gold: '#c99a3a', damaged: '#e6c269', marked: '#cf403c',
  wrongsuit: '#de559b', beer: '#a36b33',
}
export const tierInk = ['', '#e8501a', '#ffb03a', '#fffbe8']
export const stockScale = (card: Card) => card.variant === 'jumbo' ? 1.5 : 1

function silhouette(source: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = canvas(source.width, source.height)
  const g = ctx2d(c)
  g.drawImage(source, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  return c
}

const cards = new Map<string, HTMLCanvasElement>()
// the suit inks changed: every printed face redraws
onPref(key => {
  if (key !== 'fourColor') return
  prints.clear()
  faces.clear()
  cards.clear()
})
export function cardCanvas(card: Card): HTMLCanvasElement {
  const { rank, suit, variant, finish, stamp, tier, traits, knockoff } = card
  const joker = card.joker === 'crayon' ? 'joker/crayon' : card.joker ? 'joker' : null
  const icons = traits.map(t => traitName(t).split('/')[0].toLowerCase().replace('wild suit', 'wild'))
  const markOffset = stamp ? card.id % 7 : 0
  const key = [card.grind, card.bonusHype, card.grade, card.bulk, rank, suit, variant, joker, finish, stamp, markOffset, knockoff?.kind,
    knockoff?.kind === 'wrongsuit' && knockoff.suit, tier, ...icons].join('|')
  const hit = cards.get(key)
  if (hit) return hit
  if (card.bulk) return ashCanvas()
  if (!card.grade && !card.grind && !card.bonusHype && !variant && !joker && !tier && !finish && !stamp && !knockoff) return faceCanvas(rank, suit)
  const stock = partCanvas('base/paper')
  const g = ctx2d(stock)
  const frame = joker ?? (variant === 'rookie' || variant === 'chase' ? variant : null)
  if (frame) blit(g, 'frame/' + frame, 0, 0)
  const print = printedFace(rank, suit, !!joker, !!frame || !!finish, knockoff?.kind === 'crayon')
  if (finish === 'misprint') {
    g.globalAlpha = 0.66
    g.drawImage(silhouette(print, specialInk.misprint), -2, 0)
    g.drawImage(silhouette(print, '#e3439e'), 2, 1)
    g.globalAlpha = 1
  }
  if (finish && finish !== 'misprint') {
    g.globalCompositeOperation = 'source-atop'
    blit(g, 'finish/' + (finish === 'prism' ? 'embers' : finish), 0, 0)
    g.globalCompositeOperation = 'source-over'
  }
  if (finish && frame === 'chase') {
    const plaque = sprite('frame/chase')
    g.drawImage(plaque.img, plaque.x+18, plaque.y, 28, 9, 18, 0, 28, 9)
  }
  g.drawImage(print, 0, 0)
  if (stamp) {
    const name = 'stamp/' + stamp
    const s = sprite(name)
    g.save()
    g.translate(32 + markOffset - 3, 44 + (markOffset * 3 % 7) - 3)
    g.rotate((markOffset - 3) * Math.PI / 45)
    blit(g, name, -Math.floor(s.w / 2), -Math.floor(s.h / 2))
    g.restore()
  }
  if (knockoff?.kind === 'wrongsuit') {
    const x = frame || finish ? 8 : 5
    const y = frame || finish ? 20 : 16
    const second = tinted('index/suit/' + knockoff.suit, suitInk(knockoff.suit))
    g.drawImage(second, x+2, y+2)
    g.drawImage(tinted('index/suit/' + suit, suitInk(suit)), x, y)
    g.translate(x+1, y+11)
    g.rotate(Math.PI / 15)
    g.drawImage(second, 0, 0)
    g.resetTransform()
  } else if (knockoff) {
    const [x,y] = knockoff.kind === 'marked' ? [1,1] : knockoff.kind === 'beer' ? [9,36] : [12,10]
    blit(g, 'knock/' + knockoff.kind, x, y)
  }
  const edge = variant === 'sticker' ? 2 : 0
  const depth = variant === 'jumbo' ? 3 : 0
  const body = canvas(64 + edge*2 + depth, 88 + edge*2 + depth)
  const bg = ctx2d(body)
  if (edge) blit(bg, 'base/diecut', 0, 0)
  if (depth) {
    bg.drawImage(silhouette(stock, '#5c4a36'), depth, depth)
    bg.drawImage(silhouette(stock, '#bfa77e'), 2, 2)
    bg.drawImage(silhouette(stock, '#8c7656'), 1, 1)
  }
  bg.drawImage(stock, edge, edge)
  if (edge) {
    blit(bg, 'variant/gloss', edge, edge)
    blit(bg, 'variant/peel', edge, edge+73)
  }
  const rim = tier === 3 ? 2 : tier ? 1 : 0
  const c = canvas(body.width + 2*rim, body.height + 2*rim + (icons.length ? 9 : 0))
  const out = ctx2d(c)
  for (let ring = rim; ring > 0; ring--) {
    const color = silhouette(body, ring === 2 ? '#ff7a24' : tierInk[tier])
    for (const [x,y] of [[-ring,0],[ring,0],[0,-ring],[0,ring]]) out.drawImage(color, rim+x, rim+y)
  }
  out.drawImage(body, rim, rim)
  for (let i = 0; i < tier; i++) blit(out, 'tier/star', rim+edge+49, rim+edge+8+i*10)
  if (icons.length) {
    const w = 4 + 10*icons.length
    const x = Math.floor((c.width-w)/2)
    const y = c.height-11
    blit(out, 'trait/plate/' + icons.length, x, y)
    icons.forEach((icon,i) => blit(out, 'trait/'+icon, x+2+i*10,y+1))
  }
  let finished = c
  if (card.grade !== null) {
    finished = canvas(Math.max(72, c.width + 8), c.height + 18)
    const slab = ctx2d(finished)
    slab.drawImage(partCanvas('slab/case'), 0, 0, finished.width, finished.height)
    slab.drawImage(c, 4, 17)
    blit(slab, 'slab/label', 4, 3)
    blit(slab, 'slab/digits/' + card.grade, 54, 4)
  }
  if (card.grind || card.bonusHype) {
    const tagged = canvas(finished.width + 12, finished.height)
    const ctx = ctx2d(tagged)
    ctx.drawImage(finished, 0, 0)
    for (const [kind, value, y] of [['value', card.grind, 32], ['hype', card.bonusHype, 43]] as const) {
      if (!value) continue
      const x = finished.width - 4
      blit(ctx, 'tag/' + kind, x, y)
      const digits = String(value)
      if (digits.length < 3) blit(ctx, 'digits/plus', x + 4, y + 2)
      for (let i = 0; i < digits.length; i++) blit(ctx, 'digits/' + digits[i], x + 15 - (digits.length - i) * 4, y + 2)
    }
    finished = tagged
  }
  cards.set(key, finished)
  return finished
}
