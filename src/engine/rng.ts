// seeded rng so runs and daily seeds are reproducible. never use Math.random in the engine.
// the state is plain data (4 × 32-bit words of sfc32) so a match survives a JSON round trip mid-stream.
// every stream is seeded by a cyrb128 hash of its name, so `seed:round:seat:purpose` streams don't correlate

export type Rng = { s: [number, number, number, number] }

// cyrb128: string -> 4 well-mixed 32-bit words
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

export function makeRng(name: string): Rng {
  const rng: Rng = { s: cyrb128(name) }
  // the first few outputs of a fresh sfc32 are weak, burn them
  for (let i = 0; i < 12; i++) next(rng)
  return rng
}

// sfc32, returns [0, 1). advances the state in place
export function next(rng: Rng): number {
  let [a, b, c, d] = rng.s
  const t = (((a + b) | 0) + d) | 0
  d = (d + 1) | 0
  a = b ^ (b >>> 9)
  b = (c + (c << 3)) | 0
  c = (c << 21) | (c >>> 11)
  c = (c + t) | 0
  rng.s = [a, b, c, d]
  return (t >>> 0) / 4294967296
}

// inclusive on both ends
export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(next(rng) * (hi - lo + 1))
}

export function chance(rng: Rng, p: number): boolean {
  return next(rng) < p
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from empty list')
  return items[Math.floor(next(rng) * items.length)]
}

export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next(rng) * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function randomSeed(): string {
  // only place that touches Math.random: making a fresh seed for an offline solo run. live seeds come from the server
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}
