// normalized time for canvas sequences
export const progress = (ms: number, duration: number) => Math.min(1, Math.max(0, ms / duration))
export const mix = (a: number, b: number, t: number) => a + (b - a) * t
export const land = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2
export const still = matchMedia('(prefers-reduced-motion: reduce)')

// carry the outgoing scene over the cut, with two short trails on its moving edge
export function whipPan(stage: HTMLCanvasElement | null, direction: number): void {
  if (!stage || still.matches) return
  const shot = document.createElement('canvas')
  shot.width = stage.width
  shot.height = stage.height
  const image = shot.getContext('2d')!
  image.drawImage(stage, 0, 0)
  const overlay = shot.cloneNode() as HTMLCanvasElement
  overlay.className = 'spoil-flight'
  overlay.setAttribute('aria-hidden', 'true')
  document.body.appendChild(overlay)
  const g = overlay.getContext('2d')!
  const start = performance.now()
  function frame(t: number): void {
    const u = progress(t - start, 320)
    g.clearRect(0, 0, shot.width, shot.height)
    for (let i = 2; i >= 0; i--) {
      g.globalAlpha = i === 0 ? 1 : 0.16
      g.drawImage(shot, direction * Math.max(0, shot.width * u * u - i * shot.width * 0.026), 0)
    }
    if (u < 1) requestAnimationFrame(frame)
    else overlay.remove()
  }
  requestAnimationFrame(frame)
}

export function juiceAt(starts: Map<string, number>, key: string, now: number): { s: number; r: number } {
  const start = starts.get(key)
  if (start === undefined || now - start > 500) {
    starts.delete(key)
    return { s: 1, r: 0 }
  }
  const t = (now - start) / 1000
  const decay = Math.exp(-t * 10)
  return { s: 1 + 0.18 * decay, r: 0.1 * Math.sin(t * 34) * decay }
}

type T = { x: number; y: number; r: number; s: number }
export const springs = new Map<string, { at: T; vel: T }>()
const seen = new Set<string>()

// the visible transform chases the target, critically damped with a touch of overshoot
export function spring(key: string, target: T, from?: T): T {
  seen.add(key)
  let s = springs.get(key)
  if (!s) {
    s = { at: { ...(from ?? target) }, vel: { x: 0, y: 0, r: 0, s: 0 } }
    springs.set(key, s)
  }
  pending.push([s, target])
  return s.at
}
let pending: [{ at: T; vel: T }, T][] = []

export function stepSprings(dt: number): void {
  const stiff = 170
  const damp = 2 * Math.sqrt(stiff) * 0.75
  for (const [s, target] of pending) {
    for (const f of ['x', 'y', 'r', 's'] as const) {
      const a = stiff * (target[f] - s.at[f]) - damp * s.vel[f]
      s.vel[f] += a * dt
      s.at[f] += s.vel[f] * dt
    }
  }
  pending = []
  // forget springs nobody drew last frame, so a card coming back flies in again
  for (const key of springs.keys()) if (!seen.has(key)) springs.delete(key)
  seen.clear()
}
