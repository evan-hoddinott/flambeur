// the last pick can open the shop in the same step. finish the deal above the scene change.
import { canvas, cardCanvas, ctx2d } from './art.ts'
import type { SeatView } from '../engine/match.ts'

export function spoilPicked(before: SeatView, id: number | null, last: boolean): void {
  const spoils = before.spoils
  if (!spoils || !document.querySelector('canvas.stage') || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const cards = spoils.cards.map((card, i) => ({ card, x: 260 + i * 60 }))
  const surface = canvas(640, 360)
  surface.className = 'spoil-flight'
  surface.setAttribute('aria-hidden', 'true')
  document.body.appendChild(surface)
  const g = ctx2d(surface)
  const start = performance.now()
  function frame(now: number): void {
    const t = Math.min(1, (now - start) / 650)
    g.clearRect(0, 0, 640, 360)
    for (const { card, x } of cards) {
      const art = cardCanvas(card)
      if (card.id === id) {
        const mine = spoils!.toPick === before.me.seat
        const ease = 1 - (1 - t) ** 3
        g.save()
        g.translate(x + ((mine ? 156 : 409) - x) * ease, 222 + ((mine ? 303 : 105) - 222) * ease - 28 * Math.sin(Math.PI * t))
        g.rotate((mine ? -1 : 1) * ease * 0.22)
        g.scale(0.8 - t / 2, 0.8 - t / 2)
        g.globalAlpha = Math.min(1, (1 - t) * 4)
        g.drawImage(art, -art.width / 2, -art.height / 2)
        g.restore()
      } else if (last) {
        const height = Math.ceil(art.height * (1 - t))
        if (height > 0) g.drawImage(art, 0, 0, art.width, height, x - art.width * .4, 222 - art.height * .4, art.width * .8, height * .8)
        for (let n = 0; n < 15; n++) {
          g.fillStyle = n % 3 ? '#ff7a24' : '#e8c260'
          const y = 222 + art.height * (.4 - .8 * t)
          g.fillRect(x - 25 + n * 3.5, y + Math.sin(t * 23 + n) * 3, 2, 3)
          g.fillStyle = '#8c7656'
          g.fillRect(x - 25 + n * 3.5 + Math.sin(t * 7 + n) * 6, y - (t * (17 + n)) % 22, 2, 1)
        }
      }
    }
    if (t < 1) requestAnimationFrame(frame)
    else surface.remove()
  }
  requestAnimationFrame(frame)
}
