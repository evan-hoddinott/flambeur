// the pixel cursor: an ink-outlined arrow and a pointing hand, drawn from text grids at 2x. the pause menu turns it off
import { pref } from './prefs.ts'

type Kind = 'default' | 'pointer' | 'text' | 'grabbing' | 'none'

// X ink, . cream, space clear
const ARROW = [
  'X',
  'XX',
  'X.X',
  'X..X',
  'X...X',
  'X....X',
  'X.....X',
  'X......X',
  'X.......X',
  'X........X',
  'X.....XXXX',
  'X..X..X',
  'X.X X..X',
  'XX  X..X',
  'X    X..X',
  '     X..X',
  '      XX',
]
const HAND = [
  '    XX',
  '   X..X',
  '   X..X',
  '   X..X',
  '   X..XXX',
  '   X..X..XX',
  'XX X..X..X.X',
  'X.XX.......X',
  'X..X.......X',
  ' X.........X',
  '  X........X',
  '  X.......X',
  '   X......X',
  '   X......X',
  '    XXXXXX',
]

function url(grid: string[]): string {
  const k = 2
  const c = document.createElement('canvas')
  c.width = Math.max(...grid.map(r => r.length)) * k
  c.height = grid.length * k
  const g = c.getContext('2d')!
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ' ') return
    g.fillStyle = ch === 'X' ? '#1c1513' : '#f6ecd2'
    g.fillRect(x * k, y * k, k, k)
  }))
  return c.toDataURL()
}

let made: { arrow: string; hand: string } | null = null

export function cursorFor(kind: Kind): string {
  if (!pref('cursor') || kind === 'text' || kind === 'grabbing' || kind === 'none') return kind
  made ??= { arrow: `url(${url(ARROW)}) 0 0, default`, hand: `url(${url(HAND)}) 9 0, pointer` }
  return kind === 'pointer' ? made.hand : made.arrow
}
