// la fée verte, the tutorial's guide (docs/TUTORIAL.md): a little absinthe-green fairy drawn from a text grid until
// her real sprite exists. tips.ts flies her to whatever she's teaching and hangs her speech bubble beside her
import { canvas, ctx2d } from './art.ts'

const COLORS: Record<string, string> = {
  o: '#1c2a10', // outline
  h: '#2a4a14', // hair
  s: '#e4f5c8', // skin, a pale green
  e: '#1c1513', // eyes
  g: '#5c8f2a', // dress
  l: '#8fd14f', // dress light
  c: '#c8f27a', // wing
  w: '#b088e0', // wing edge, absinthe's violet partner
}

// 13 wide. two wing frames, the body is the same in both
const UP = [
  '....hhhhh....',
  '...hhhhhhh...',
  '...hsesesh...',
  '...hsssssh...',
  '....hsssh....',
  'cw...glg...wc',
  'ccw..glg..wcc',
  'ccw.gglgg.wcc',
  '.cw.glllg.wc.',
  '..w.glllg.w..',
  '...glllllg...',
  '..glllllllg..',
  '....s...s....',
]
const DOWN = [
  '....hhhhh....',
  '...hhhhhhh...',
  '...hsesesh...',
  '...hsssssh...',
  '....hsssh....',
  '.....glg.....',
  'w....glg....w',
  'cw..gglgg..wc',
  'ccw.glllg.wcc',
  'ccw.glllg.wcc',
  '.cwglllllgwc.',
  '..glllllllg..',
  '....s...s....',
]

const PX = 2 // she's drawn at 2× so she reads as a character over the 1× table
let frames: HTMLCanvasElement[] | null = null

function bake(rows: string[]): HTMLCanvasElement {
  const c = canvas(rows[0].length * PX + 2, rows.length * PX + 2)
  const g = ctx2d(c)
  // a 1px dark rim around the whole shape first, so she reads on green felt
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(g, rows, 1 + dx, 1 + dy, COLORS.o)
  paint(g, rows, 1, 1)
  return c
}

function paint(g: CanvasRenderingContext2D, rows: string[], x0: number, y0: number, only?: string): void {
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return
    g.fillStyle = only ?? COLORS[ch]
    g.fillRect(x0 + x * PX, y0 + y * PX, PX, PX)
  }))
}

export const FEE_W = UP[0].length * PX + 2
export const FEE_H = UP.length * PX + 2

// she flies toward a target and bobs there. at = where she's headed, her center
const pos = { x: 320, y: 120, set: false }
const trail: { x: number; y: number; t: number }[] = []

export function drawFee(g: CanvasRenderingContext2D, at: { x: number; y: number }, now: number, flip: boolean): void {
  frames ??= [bake(UP), bake(DOWN)]
  if (!pos.set) Object.assign(pos, { x: at.x, y: at.y - 40, set: true })
  pos.x += (at.x - pos.x) * 0.12
  pos.y += (at.y - pos.y) * 0.12
  const bob = Math.sin(now / 260) * 2
  const x = Math.round(pos.x)
  const y = Math.round(pos.y + bob)
  if (!trail.length || now - trail[trail.length - 1].t > 70) trail.push({ x: x + (Math.random() * 8 - 4), y: y + 8, t: now })
  while (trail.length && now - trail[0].t > 700) trail.shift()
  // a soft absinthe glow, then sparkles falling off her wings
  const glow = g.createRadialGradient(x, y, 0, x, y, 22)
  glow.addColorStop(0, 'rgba(143,209,79,0.32)')
  glow.addColorStop(1, 'rgba(143,209,79,0)')
  g.fillStyle = glow
  g.fillRect(x - 22, y - 22, 44, 44)
  for (const s of trail) {
    const age = (now - s.t) / 700
    g.globalAlpha = 1 - age
    g.fillStyle = age < 0.4 ? '#c8f27a' : '#8fd14f'
    g.fillRect(Math.round(s.x), Math.round(s.y + age * 10), 1, 1)
  }
  g.globalAlpha = 1
  const img = frames[Math.floor(now / 140) % 2]
  g.save()
  g.translate(x, y)
  if (flip) g.scale(-1, 1)
  g.drawImage(img, -Math.round(FEE_W / 2), -Math.round(FEE_H / 2))
  g.restore()
}

// she's gone off screen (no lesson up): the next one flies her in from above it
export function feeAway(): void {
  pos.set = false
  trail.length = 0
}
