// the atlases (duel + cards from aseprite, shop from art/shop/counter.py), sprite lookup by slice name, and the card compositor.
// card faces are assembled at runtime from parts, the same recipe as art/cards/build.py
import duelPng from '../../art/duel/duel.png'
import duelJson from '../../art/duel/duel.json'
import cardsPng from '../../art/cards/cards.png'
import cardsJson from '../../art/cards/cards.json'
import shopPng from '../../art/shop/shop.png'
import shopJson from '../../art/shop/shop.json'
import { rankLabel, isWild, type Card, type Suit } from '../engine/cards.ts'
import type { StarterId } from '../engine/starters.ts'
import { drawText } from './font.ts'

export type Sprite = {
  img: HTMLImageElement
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
  const [duel, cards, shop] = await Promise.all([loadImage(duelPng), loadImage(cardsPng), loadImage(shopPng)])
  for (const [img, data] of [[duel, duelJson], [cards, cardsJson], [shop, shopJson]] as const) {
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

export function hasSprite(name: string): boolean {
  return sprites.has(name)
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

function partCanvas(name: string): HTMLCanvasElement {
  const s = sprite(name)
  const c = canvas(s.w, s.h)
  blit(ctx2d(c), name, 0, 0)
  return c
}

// ---------- cards ----------

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

export function suitInk(suit: Suit): string {
  return suit === 'S' || suit === 'C' ? INK.dark : INK.red
}

// the printed face only: rank, suit, pips or court. modifiers that have no art yet are drawn by the caller
const faces = new Map<string, HTMLCanvasElement>()
export function faceCanvas(rank: number, suit: Suit, joker = false): HTMLCanvasElement {
  const key = joker ? 'joker' : `${rank}${suit}`
  const hit = faces.get(key)
  if (hit) return hit
  const c = canvas(64, 88)
  const g = ctx2d(c)
  blit(g, 'base/paper', 0, 0)
  if (joker) {
    mirrorPair(g, partCanvas('court/joker'), 12, 10)
    mirrorPair(g, partCanvas('index/joker'), 5, 6)
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
    mirrorPair(g, tinted(`index/rank/${r}`, ink), 4, 4)
    mirrorPair(g, tinted(`index/suit/${suit}`, ink), 5, 16)
  }
  faces.set(key, c)
  return c
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
  backs.set(id, c)
  return c
}

// bulk: a weak stone card with no rank or suit. no sprite yet, so a grey slab cut from the paper stock
let bulkCard: HTMLCanvasElement | null = null
function bulkCanvas(): HTMLCanvasElement {
  if (bulkCard) return bulkCard
  const c = canvas(64, 88)
  const g = ctx2d(c)
  blit(g, 'base/paper', 0, 0)
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = '#6b625a'
  g.globalAlpha = 0.85
  g.fillRect(0, 0, 64, 88)
  g.globalAlpha = 1
  g.fillStyle = '#4a433e'
  for (let i = 0; i < 9; i++) g.fillRect(10 + ((i * 23) % 40), 14 + ((i * 37) % 60), 4 + (i % 3) * 2, 2)
  g.globalCompositeOperation = 'source-over'
  drawText(g, '+5', 32, 40, { color: '#e3d2a8', bold: true, align: 'center' })
  bulkCard = c
  return c
}

// the full card as a 64x88 canvas: face plus stand-ins for modifiers that don't have art yet
const cards = new Map<string, HTMLCanvasElement>()
export function cardCanvas(card: Card): HTMLCanvasElement {
  if (card.bulk) return bulkCanvas()
  const wild = isWild(card)
  const key = `${card.joker ? 'joker' : `${card.rank}${card.suit}`}|${card.tier}|${card.finish ?? ''}|${card.stamp ?? ''}|${wild}`
  const hit = cards.get(key)
  if (hit) return hit
  const face = faceCanvas(card.rank, card.suit, !!card.joker)
  if (!card.tier && !card.finish && !card.stamp && !wild) {
    cards.set(key, face)
    return face
  }
  const c = canvas(64, 88)
  const g = ctx2d(c)
  g.drawImage(face, 0, 0)
  // finish trim, until the finish shaders exist: a 1px colored line inside the printed border
  const trim: Record<string, string> = { foil: '#e8c260', holo: '#b088e0', prism: '#8fd14f', misprint: '#d04a4e' }
  if (card.finish) {
    g.strokeStyle = trim[card.finish]
    g.lineWidth = 1
    g.strokeRect(1.5, 1.5, 61, 85)
  }
  // tier stars at (52,4), (52,12), (52,20)
  for (let i = 0; i < card.tier; i++) star(g, 56, 8 + i * 8, '#ff7a24')
  if (wild) star(g, 32, 80, '#7a4ab0')
  // stamps: a small round ink stamp bottom-left
  const stampInk: Record<string, string> = { first: '#1c1513', signed: '#28497a', gold: '#c99a3a', damaged: '#5c4a36' }
  if (card.stamp) {
    g.fillStyle = stampInk[card.stamp]
    g.globalAlpha = 0.85
    g.beginPath()
    g.arc(9, 79, 4, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 1
  }
  cards.set(key, c)
  return c
}

function star(g: CanvasRenderingContext2D, x: number, y: number, fill: string): void {
  g.fillStyle = '#1c1513'
  g.fillRect(x - 3, y - 1, 7, 3)
  g.fillRect(x - 1, y - 3, 3, 7)
  g.fillStyle = fill
  g.fillRect(x - 2, y, 5, 1)
  g.fillRect(x, y - 2, 1, 5)
}

// for the DOM screens (draft, shop, packs) until they're rebuilt as scenes
const urls = new Map<HTMLCanvasElement, string>()
export function canvasUrl(c: HTMLCanvasElement): string {
  let u = urls.get(c)
  if (!u) {
    u = c.toDataURL()
    urls.set(c, u)
  }
  return u
}
