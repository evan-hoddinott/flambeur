import { getDef, type Owned } from '../engine/collectibles.ts'
import { blit, canvas, canvasUrl, ctx2d, faceCanvas, sprite, tinted } from './art.ts'

const frames = new Map<string, { art: HTMLCanvasElement; alpha: Uint8ClampedArray; halo: HTMLCanvasElement | null }>()
const strips = new Map<string, string>()
const phases = new Map<string, number>()

function phase(o: Owned, slot: number): number {
  const key = o.id + slot
  let ms = phases.get(key)
  if (ms === undefined) {
    ms = Math.random() * 880
    phases.set(key, ms)
  }
  return ms
}

function frame(o: Owned, index: number) {
  const key = [o.id, o.param, index].join('|')
  const cached = frames.get(key)
  if (cached) return cached
  const name = index ? o.id + '/' + index : o.id
  const { w, h } = sprite(name)
  const art = canvas(w, h)
  const g = ctx2d(art)
  blit(g, name, 0, 0)
  if (o.id === 'playmat') {
    const suit = o.param
    if (!suit || !['S', 'H', 'D', 'C'].includes(suit)) throw new Error('invalid playmat suit')
    const glyph = 'collect/playmat/suit' + (suit === 'S' ? '' : '/' + suit)
    g.drawImage(tinted(glyph, suit === 'H' || suit === 'D' ? '#d04a4e' : '#e8c260'), 34, 12)
  }
  if (o.id === 'psa_slab') {
    const rank = Number(o.param)
    if (!Number.isInteger(rank) || rank < 2 || rank > 14) throw new Error('invalid slab rank')
    g.drawImage(faceCanvas(rank, 'S'), 4, 18)
    blit(g, 'collect/psa/label', 4, 4)
    g.save()
    g.globalAlpha = .16
    for (const [i, color] of ['#b088e0', '#3e66a0', '#6fcf6f', '#fff0b0'].entries()) {
      const y = 48 + index * 11 + i * 2
      g.fillStyle = color
      g.beginPath()
      g.moveTo(4, y)
      g.lineTo(68, y - 28)
      g.lineTo(68, y - 25)
      g.lineTo(4, y + 3)
      g.fill()
    }
    g.restore()
  }
  const rarity = getDef(o.id).rarity
  const halo = rarity === 'common' ? null : canvas(w + 6, h + 6)
  if (halo) {
    const ctx = ctx2d(halo)
    ctx.shadowColor = rarity === 'rare' ? '#e8c260' : '#b8d0e8'
    ctx.shadowBlur = 3
    for (const [x,y] of [[2,3],[4,3],[3,2],[3,4]]) ctx.drawImage(art, x, y)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = rarity === 'rare' ? '#fff0b0' : '#b8d0e8'
    ctx.fillRect(0, 0, halo.width, halo.height)
  }
  const result = { art, alpha: g.getImageData(0, 0, w, h).data, halo }
  frames.set(key, result)
  return result
}

export function collectible(o: Owned, ms: number, slot: number) {
  const age = ms + phase(o, slot)
  return frame(o, Math.floor(age / 220) % 4)
}

type Frame = ReturnType<typeof collectible>

export function opaque(f: Frame, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < f.art.width && y < f.art.height &&
    f.alpha[(Math.floor(y) * f.art.width + Math.floor(x)) * 4 + 3] > 0
}

export function drawCollectible(g: CanvasRenderingContext2D, f: Frame, x: number, y: number, ms: number): void {
  if (f.halo) {
    g.save()
    g.globalAlpha *= .72 + .22 * Math.sin(ms / 400)
    g.drawImage(f.halo, x - 3, y - 3)
    g.restore()
  }
  g.drawImage(f.art, x, y)
}

// DOM overlays use the same four cels without a second animation loop
export function collectibleHtml(o: Owned, slot: number): string {
  const { w, h } = sprite(o.id)
  const key = o.id + '|' + o.param
  let url = strips.get(key)
  if (!url) {
    const sheet = canvas((w + 6) * 4, h + 6)
    const ctx = ctx2d(sheet)
    for (let i = 0; i < 4; i++) drawCollectible(ctx, frame(o, i), i * (w + 6) + 3, 3, i * 220)
    url = canvasUrl(sheet)
    strips.set(key, url)
  }
  return `<span class="collectible-art" aria-hidden="true" style="width:${w+6}px;height:${h+6}px;background-image:url(${url});animation-delay:-${phase(o, slot)}ms"></span>`
}
