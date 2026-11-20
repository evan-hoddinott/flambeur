// the music: one song (gnossienne flambée) in three mixes that play in lockstep, plus l'orgue, a hype layer (organ,
// a driving kit, an octave bass) that rises with the appraisal's heat. the screen picks the mix and the player
// crossfades to it. balatro's method. docs/MUSIC.md

export type Scene = 'table' | 'tabac' | 'fee'
const FILES = ['table', 'tabac', 'fee', 'orgue'] as const
type File = (typeof FILES)[number]

type Info = {
  sampleRate: number
  bpm: number
  beatsPerBar: number
  bars: number
  loopBar: number
  loopStart: number // samples
  loopEnd: number
  chords: { names: string[]; tones: number[][]; beats: number[] } // tones in played midi pitch, one chord per beat
}

const FADE = 0.33 // one-pole crossfade time constant, the same as balatro's
const ORGAN_FADE = 1

let ctx: AudioContext | null = null
let out: GainNode | null = null
let info: Info | null = null
let sources: AudioBufferSourceNode[] = []
const gains = new Map<File, GainNode>()
let scene: Scene = 'table'
let organ = 0
let loading: Promise<void> | null = null
// the song position, for chordAt: file seconds at `clockAt`, moving at `rate`
let clockAt = 0
let posAt = 0
let rate = 1

// starts on the first click (browsers need one). pass the sfx context and a bus to share them, or it makes its own
export function start(audio?: AudioContext, dest?: AudioNode): Promise<void> {
  loading ??= begin(audio, dest)
  return loading
}

async function begin(audio?: AudioContext, dest?: AudioNode): Promise<void> {
  try {
    ctx = audio ?? new AudioContext()
  } catch {
    return // no audio support, the game still works silently
  }
  if (ctx.state === 'suspended') void ctx.resume()
  out = ctx.createGain()
  out.connect(dest ?? ctx.destination)
  const base = `${import.meta.env.BASE_URL}music/`
  info = (await (await fetch(`${base}gnossienne.json`)).json()) as Info
  const buffers = await Promise.all(FILES.map(async f => {
    const res = await fetch(`${base}${f}.ogg`)
    if (!res.ok) throw new Error(`music: ${f}.ogg ${res.status}`)
    return ctx!.decodeAudioData(await res.arrayBuffer())
  }))
  const lengths = new Set(buffers.map(b => b.length))
  if (lengths.size !== 1) throw new Error(`music: the mixes aren't the same length (${[...lengths].join(', ')} samples)`)
  const when = ctx.currentTime + 0.05
  sources = buffers.map((b, i) => {
    const s = ctx!.createBufferSource()
    s.buffer = b
    s.loop = true
    s.loopStart = info!.loopStart / info!.sampleRate
    s.loopEnd = info!.loopEnd / info!.sampleRate
    const g = ctx!.createGain()
    g.gain.value = target(FILES[i])
    s.connect(g).connect(out!)
    gains.set(FILES[i], g)
    s.start(when)
    return s
  })
  clockAt = when
  posAt = 0
  rate = 1
}

function target(f: File): number {
  return f === 'orgue' ? organ : f === scene ? 1 : 0
}

function fade(f: File, at: number, tc: number): void {
  const g = gains.get(f)?.gain
  if (!g) return
  g.cancelScheduledValues(at) // drops a cool-down that hasn't started yet
  g.setTargetAtTime(target(f), at, tc)
}

// the screen decides the mix. `onBar` waits for the next bar line (the boss switch lands on the grid)
export function setScene(next: Scene, onBar = false): void {
  if (next === scene) return
  scene = next
  if (!ctx || !info) return
  const at = onBar ? nextBar() : ctx.currentTime
  for (const f of ['table', 'tabac', 'fee'] as const) fade(f, at, FADE)
}

// 0..1, the hype layer's level
export function setOrgan(level: number): void {
  organ = Math.max(0, Math.min(1, level))
  if (ctx) fade('orgue', ctx.currentTime, ORGAN_FADE)
}

// the appraisal against REF_SCORE on a log scale, like balatro's organ: silent until the hand passes it,
// 0.4 at 1x, 0.7 at 5x, full at 25x. it only goes up, cool() lets it down
export function heat(ratio: number): void {
  const level = ratio < 1 ? 0 : 0.4 + 0.3 * Math.log(ratio) / Math.log(5)
  if (level > organ) setOrgan(level)
}

// the hand is over: hold the hype for `after` seconds, then let it fade out
export function cool(after = 2.5): void {
  organ = 0
  if (ctx) fade('orgue', ctx.currentTime + after, ORGAN_FADE * 1.5)
}

// tape speed for every file at once, so they stay in sync: 0.5 is the run-lost slide, 1 is normal
export function glide(to: number, seconds = 0.5): void {
  if (!ctx || to === rate) return
  const now = ctx.currentTime
  posAt = position(now)
  clockAt = now
  rate = to // chordAt treats the glide as instant. it only matters at rate 1
  for (const s of sources) s.playbackRate.setTargetAtTime(to, now, seconds / 3)
}

export function setVolume(v: number): void {
  if (out && ctx) out.gain.setTargetAtTime(v, ctx.currentTime, 0.05)
}

// file seconds playing at context time `t`, folded into the loop
function position(t: number): number {
  if (!info) return 0
  const p = posAt + Math.max(0, t - clockAt) * rate
  const a = info.loopStart / info.sampleRate
  const b = info.loopEnd / info.sampleRate
  return p < b ? p : a + ((p - a) % (b - a))
}

function nextBar(): number {
  const bar = (info!.beatsPerBar * 60) / info!.bpm
  const p = position(ctx!.currentTime)
  return ctx!.currentTime + (bar - (p % bar)) / rate
}

// the chord under the beat playing now, as midi pitches (bass root first). null until the music is playing
export function chordAt(t = ctx?.currentTime ?? 0): number[] | null {
  if (!info || !sources.length) return null
  const beat = Math.floor(position(t) / (60 / info.bpm))
  const i = info.chords.beats[beat]
  if (i === undefined) throw new Error(`music: no chord for beat ${beat}`)
  return info.chords.tones[i]
}
