// dev only: the flambé beat on a bare felt, looping, so it can be tuned without playing to a pair (docs/FLAMBER.md §8.1).
// served at /flambe.html by vite dev, never built. keys: space = replay, 1-5 = hand, [ ] = slow-mo, click = skip
import { cardName, newCard, rankLabel, type Card, type Suit } from '../engine/cards.ts'
import { autoKeep, buildForged, forgePlan } from '../engine/forge.ts'
import { HAND_NAMES } from '../engine/hands.ts'
import { loadArt, cardCanvas } from '../ui/art.ts'
import { loadFonts, drawText } from '../ui/font.ts'
import { tableBackdrop } from '../ui/duel.ts'
import { drawFlambe, firelight, flambeShake, skipFlambe, startFlambe, type Flambe, type FlambeSpec } from '../ui/flambe.ts'

const W = 640
const H = 360
const ids = { nextCardId: 1 }
const c = (rank: number, suit: Suit, extra: Partial<Card> = {}) => newCard(ids, rank, suit, extra)

// the hands: what you locked, and for a grind which card gets the +1
const HANDS: { name: string; locked: () => Card[]; grind?: number }[] = [
  { name: 'Pair in 5', locked: () => [c(5, 'H'), c(13, 'C'), c(5, 'S'), c(9, 'D'), c(2, 'H')] },
  { name: 'Three of a Kind', locked: () => [c(7, 'C'), c(7, 'D'), c(12, 'S'), c(7, 'H'), c(3, 'D')] },
  { name: 'Full House', locked: () => [c(10, 'S'), c(10, 'H'), c(4, 'C'), c(10, 'D'), c(4, 'S')] },
  { name: '★2 + ★2 → ★3', locked: () => [c(12, 'H', { tier: 2, traits: [{ kind: 'wild' }, { kind: 'bridge' }] }), c(12, 'S', { tier: 2, traits: [{ kind: 'bridge' }] }), c(6, 'C')] },
  { name: 'Grind', locked: () => [c(11, 'D'), c(8, 'C'), c(3, 'S')], grind: 0 },
]

const row = (n: number, i: number) => {
  const r = backdrop.row
  return { x: r.cx + (i - (n - 1) / 2) * r.gap, y: r.y, s: r.w / 64 }
}

function spec(which: number): FlambeSpec {
  const h = HANDS[which]
  const locked = h.locked()
  const spot = (card: Card) => row(locked.length, locked.indexOf(card))
  const hand = { ...backdrop.hand, s: 0.7 }
  const discard = { ...backdrop.discard, s: 0.5 }
  if (h.grind !== undefined) {
    const ground = locked[h.grind]
    const result = { ...ground, grind: ground.grind + 1 }
    return { burn: [], survivor: 0, result, ground, kickers: locked.filter(x => x !== ground), label: `No pair · ${cardName(ground)}`, from: spot, hand, discard }
  }
  const plan = forgePlan(locked)
  if (!plan) throw new Error(`${h.name} has no pair`)
  const { forged } = buildForged(plan, autoKeep(plan), 1, { nextCardId: 9000 + which })
  const burn = locked.filter(x => plan.merged.includes(x))
  return {
    burn, survivor: burn.indexOf(plan.merged[0]), result: forged, ground: null,
    kickers: locked.filter(x => !plan.merged.includes(x)), label: ['pair', 'trips', 'quads'].includes(plan.hand) ? `${HAND_NAMES[plan.hand]} of ${rankLabel(plan.rank)}s` : HAND_NAMES[plan.hand], from: spot, hand, discard,
  }
}

// ---------- the page ----------

const cv = document.createElement('canvas')
document.getElementById('app')!.append(cv)
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;image-rendering:pixelated;background:#0e0b0a'
const stage = document.createElement('canvas')
stage.width = W
stage.height = H
const g = stage.getContext('2d')!
g.imageSmoothingEnabled = false

await Promise.all([loadArt(), loadFonts()])
const backdrop = tableBackdrop(1)

let which = 0
let speed = 1
let clock = 0 // lab time, slowed by [ ]
let last = performance.now()
let fx: Flambe | null = null
let idleUntil = 0

function replay(): void {
  fx = startFlambe(spec(which), clock)
}

addEventListener('keydown', e => {
  if (e.key === ' ') replay()
  else if (e.key >= '1' && e.key <= String(HANDS.length)) {
    which = Number(e.key) - 1
    replay()
  } else if (e.key === '[') speed = Math.max(0.125, speed / 2)
  else if (e.key === ']') speed = Math.min(2, speed * 2)
  else return
  e.preventDefault()
})
addEventListener('pointerdown', () => {
  if (fx) skipFlambe(fx, clock)
})

function frame(t: number): void {
  clock += (t - last) * speed
  last = t
  if (!fx && clock > idleUntil) replay()
  const shake = fx ? flambeShake(fx, clock) : 0
  g.save()
  if (shake) g.translate(Math.round((Math.random() - 0.5) * 6 * shake), Math.round((Math.random() - 0.5) * 6 * shake))
  g.drawImage(backdrop.room, 0, 0)
  g.drawImage(backdrop.felt, 0, 0)
  // the lamp answers the fire
  const light = firelight(fx)
  if (light > 0.02) {
    g.fillStyle = `rgba(255,150,60,${0.07 * Math.min(1, light)})`
    g.fillRect(0, 0, W, H)
  }
  if (fx && !drawFlambe(g, fx, clock)) {
    fx = null
    idleUntil = clock + 900
  }
  // until it starts, the locked hand waits on the spots
  if (!fx) {
    const locked = HANDS[which].locked()
    locked.forEach((card, i) => {
      const p = row(locked.length, i)
      const art = cardCanvas(card)
      g.drawImage(art, Math.round(p.x - (art.width * p.s) / 2), Math.round(p.y - (art.height * p.s) / 2), art.width * p.s, art.height * p.s)
    })
  }
  g.restore()
  const hud = `${which + 1}/${HANDS.length} ${HANDS[which].name}   ×${speed}   space replay · 1-${HANDS.length} hand · [ ] speed · click skip`
  drawText(g, hud, 6, H - 10, { font: 'tiny', color: '#f6ecd2', outline: '#0e0b0a' })

  const dpr = devicePixelRatio || 1
  cv.width = Math.round(innerWidth * dpr)
  cv.height = Math.round(innerHeight * dpr)
  const k = Math.max(1, Math.floor(Math.min(cv.width / W, cv.height / H)))
  const out = cv.getContext('2d')!
  out.imageSmoothingEnabled = false
  out.drawImage(stage, Math.round((cv.width - W * k) / 2), Math.round((cv.height - H * k) / 2), W * k, H * k)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
