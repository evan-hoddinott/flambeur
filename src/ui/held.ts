// a card as you hold it: centered on x,y, turned by r, with its drop shadow and the finish sheen.
// the duel hand, the pack rip and a ½× card popped by hover all draw through here (docs/UX.md, card sizes)
import { canvas, cardCanvas, ctx2d } from './art.ts'
import { still } from './prefs.ts'
import type { Card } from '../engine/cards.ts'

// scale is the final one: the caller folds in stockScale for a jumbo. img swaps the face for another (a back)
export function heldCard(g: CanvasRenderingContext2D, c: Card, x: number, y: number, scale: number, r: number, o: { dim?: boolean; shadow?: boolean; img?: HTMLCanvasElement } = {}): { w: number; h: number } {
  const img = o.img ?? cardCanvas(c)
  const w = img.width * scale
  const h = img.height * scale
  if (o.shadow) cardShadow(g, x, y, w, h, r)
  centered(g, o.dim ? darkened(img) : img, x, y, w, h, r)
  if (!o.img && !o.dim && !still.matches && (c.finish === 'foil' || c.finish === 'holo' || c.finish === 'prism' || c.variant === 'chase')) {
    const phase = (performance.now() / 3000 + c.id * 0.13) % 1
    g.save()
    g.translate(x, y)
    g.rotate(r)
    g.scale(scale, scale)
    const top = -img.height / 2 + (img.height - 88 - (c.traits.length ? 9 : 0)) / 2
    g.translate(-32, top)
    g.beginPath()
    if (!c.finish) g.roundRect(18, 0, 28, 9, 2)
    else g.roundRect(0, 0, 64, 88, 4)
    g.clip()
    if (c.finish === 'prism') {
      g.strokeStyle = `rgba(255,134,47,${0.17 + 0.12 * Math.sin(phase * Math.PI * 2)})`
      g.lineWidth = 5
      g.strokeRect(2, 2, 60, 84)
    } else {
      const start = phase * 150 - 65
      const sheen = g.createLinearGradient(start, 0, start + 28, 12)
      sheen.addColorStop(0, 'transparent')
      sheen.addColorStop(0.5, c.finish === 'holo' ? `hsla(${phase * 360},90%,70%,.38)` : 'rgba(255,233,151,.35)')
      sheen.addColorStop(1, 'transparent')
      g.fillStyle = sheen
      g.fillRect(0, 0, 64, 88)
    }
    g.restore()
  }
  return { w, h }
}

// an image centered on x,y. unturned, it lands on whole pixels so the art stays sharp
export function centered(g: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number, r = 0, alpha = 1): void {
  g.save()
  g.globalAlpha = alpha
  if (r) {
    g.translate(x, y)
    g.rotate(r)
    g.drawImage(img, -w / 2, -h / 2, w, h)
  } else g.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), w, h)
  g.restore()
}

export function cardShadow(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.save()
  g.translate(x + 1, y + 3)
  g.rotate(r)
  g.fillStyle = 'rgba(18,14,8,0.35)'
  g.fillRect(-w / 2, -h / 2, w, h)
  g.restore()
}

// a card with a dark wash over it, for the ones that aren't in play
const darks = new Map<HTMLCanvasElement, HTMLCanvasElement>()
export function darkened(c: HTMLCanvasElement): HTMLCanvasElement {
  let d = darks.get(c)
  if (!d) {
    d = canvas(c.width, c.height)
    const dg = ctx2d(d)
    dg.drawImage(c, 0, 0)
    dg.globalCompositeOperation = 'source-atop'
    dg.fillStyle = 'rgba(14,11,10,0.5)'
    dg.fillRect(0, 0, c.width, c.height)
    darks.set(c, d)
  }
  return d
}
