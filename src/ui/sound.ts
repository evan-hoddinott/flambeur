// the game's sound: one AudioContext, sfx / music / ambience buses through a limiter, the sample atlas from
// art/sfx (cards, chips, paper, wood, glass, fire) and synth voices for everything musical (the accordion count-up,
// chimes, stingers, the speaker blips). docs/SOUND.md. browsers start audio on the first click or key
import atlasUrl from '../../art/sfx/sfx.ogg'
import atlasIndex from '../../art/sfx/sfx.json'
import { chordAt } from './music.ts'
import { onPref, pref, setPref } from './prefs.ts'

export type Sample = keyof typeof atlasIndex
const INDEX: Record<Sample, [number, number][]> = atlasIndex as Record<Sample, [number, number][]>

// ---------- settings ----------
// the volumes live in prefs.ts with every other setting. the pause menu sets them, M mutes anywhere

const vol = (key: 'master' | 'music' | 'sfx' | 'ambience') => pref(key)

export function toggleMute(): void {
  setPref('muted', !pref('muted'))
}

onPref(key => { if (['master', 'music', 'sfx', 'ambience', 'muted', 'bgMute'].includes(key)) apply() })
document.addEventListener('visibilitychange', () => apply())

// silent: muted, or the tab is hidden and that should mute it
const silent = () => pref('muted') || (pref('bgMute') && document.hidden)

function apply(): void {
  if (!ctx) return
  const t = ctx.currentTime
  master!.gain.setTargetAtTime(silent() ? 0 : vol('master'), t, 0.03)
  sfxBus!.gain.setTargetAtTime(vol('sfx') * 0.8, t, 0.03)
  ambBus!.gain.setTargetAtTime(vol('ambience'), t, 0.03)
  musicBus_!.gain.setTargetAtTime(vol('music'), t, 0.03)
}

// ---------- the mixer ----------

let ctx: AudioContext | null = null
let master: GainNode | null = null
let sfxBus: GainNode | null = null
let ambBus: GainNode | null = null
let musicBus_: GainNode | null = null
let duckGain: GainNode | null = null
let atlas: AudioBuffer | null = null
let noiseBuf: AudioBuffer | null = null
let pulse: PeriodicWave | null = null
// the atlas downloads right away. decoding waits for the context, which waits for a click
const atlasBytes = fetch(atlasUrl).then(r => {
  if (!r.ok) throw new Error(`sfx: ${atlasUrl} ${r.status}`)
  return r.arrayBuffer()
})

function unlock(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }
  try {
    ctx = new AudioContext()
  } catch {
    return // no audio support, the game still works silently
  }
  master = ctx.createGain()
  const limit = ctx.createDynamicsCompressor()
  limit.threshold.value = -6
  limit.knee.value = 0
  limit.ratio.value = 12
  limit.attack.value = 0.003
  limit.release.value = 0.12
  master.connect(limit).connect(ctx.destination)
  sfxBus = ctx.createGain()
  ambBus = ctx.createGain()
  musicBus_ = ctx.createGain()
  duckGain = ctx.createGain()
  sfxBus.connect(master)
  ambBus.connect(master)
  duckGain.connect(musicBus_).connect(master)
  apply()
  // two seconds of white noise for every hiss, crackle and breath
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const n = noiseBuf.getChannelData(0)
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1
  // the accordion reed: a ~30% pulse
  const real = new Float32Array(32)
  const imag = new Float32Array(32)
  for (let k = 1; k < 32; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.3)
  pulse = ctx.createPeriodicWave(real, imag)
  void atlasBytes.then(b => ctx!.decodeAudioData(b)).then(b => { atlas = b })
}

for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, unlock, { capture: true })
window.addEventListener('keydown', e => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
  if ((e.key === 'm' || e.key === 'M') && !typing && !e.metaKey && !e.ctrlKey) toggleMute()
})

// the music player plugs into these so it shares the context, the limiter and the volume slider
export function context(): AudioContext | null {
  unlock()
  return ctx
}

export function musicBus(): AudioNode | null {
  unlock()
  return duckGain
}

// pull the music down for a moment: the count-up -4 dB, a pack rip -6, the god pull's held card -24
export function duck(db: number, seconds: number): void {
  if (!ctx) return
  const t = ctx.currentTime
  duckGain!.gain.cancelScheduledValues(t)
  duckGain!.gain.setTargetAtTime(10 ** (db / 20), t, 0.05)
  duckGain!.gain.setTargetAtTime(1, t + seconds, 0.2)
}

// ---------- samples ----------

const robin = new Map<Sample, number>()
const voices = new Map<Sample, number>()
let plays = 0 // every sound bumps it, so a click with no sound of its own can get the press sound

type PlayOpts = { gain?: number; rate?: number; x?: number; far?: boolean; lp?: number; delay?: number; jitter?: number; cap?: number }

// one take of a sample, round-robin, with a little random pitch and gain. x = stage x for the pan,
// far = across the table (quieter, duller), lp = a lowpass in Hz
export function play(name: Sample, o: PlayOpts = {}): void {
  plays++
  if (!ctx || !atlas || silent()) return
  const live = voices.get(name) ?? 0
  if (live >= (o.cap ?? 4)) return
  const takes = INDEX[name]
  const i = robin.get(name) ?? Math.floor(Math.random() * takes.length)
  robin.set(name, (i + 1) % takes.length)
  const [start, length] = takes[i]
  const t = ctx.currentTime + (o.delay ?? 0) / 1000
  const src = ctx.createBufferSource()
  src.buffer = atlas
  src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (o.jitter ?? 0.04))
  const g = ctx.createGain()
  g.gain.value = (o.gain ?? 1) * (o.far ? 0.5 : 1) * 10 ** ((Math.random() * 2 - 1) * 1.5 / 20)
  src.connect(g)
  out(g, o.x, o.lp ?? (o.far ? 3000 : undefined)).connect(sfxBus!)
  voices.set(name, live + 1)
  src.onended = () => voices.set(name, (voices.get(name) ?? 1) - 1)
  src.start(t, start, length)
}

// pan by stage x (small: ±0.35), and a lowpass (the far side's, or a softened sound)
function out(node: AudioNode, x?: number, lp?: number): AudioNode {
  let last = node
  if (lp !== undefined) {
    const f = ctx!.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = lp
    last = last.connect(f)
  }
  if (x !== undefined) {
    const pan = ctx!.createStereoPanner()
    pan.pan.value = Math.max(-1, Math.min(1, ((x - 320) / 320) * 0.35))
    last = last.connect(pan)
  }
  return last
}

export function played(): number {
  return plays
}

// a click handler ran and nothing it did made a sound: give it the press
export function quietSince(mark: number): void {
  if (plays === mark) press()
}

// ---------- synth voices ----------

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

type Tone = { type?: OscillatorType; wave?: PeriodicWave; attack?: number; glide?: number; delay?: number; dest?: AudioNode; x?: number }

// one oscillator note: freq in hz, ms long, gain linear. glide = end frequency
function tone(freq: number, ms: number, gain: number, o: Tone = {}): void {
  if (!ctx || silent()) return
  const t = ctx.currentTime + (o.delay ?? 0) / 1000
  const end = t + ms / 1000
  const osc = ctx.createOscillator()
  if (o.wave) osc.setPeriodicWave(o.wave)
  else osc.type = o.type ?? 'triangle'
  osc.frequency.setValueAtTime(freq, t)
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, end)
  const g = ctx.createGain()
  const attack = (o.attack ?? 3) / 1000
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, end)
  osc.connect(g)
  out(g, o.x).connect(o.dest ?? sfxBus!)
  osc.start(t)
  osc.stop(end + 0.02)
}

type Hiss = { type?: BiquadFilterType; freq?: number; q?: number; sweep?: number; attack?: number; delay?: number; dest?: AudioNode }

// filtered noise: hiss, breath, crackle, whoosh
function noise(ms: number, gain: number, o: Hiss = {}): void {
  if (!ctx || !noiseBuf || silent()) return
  const t = ctx.currentTime + (o.delay ?? 0) / 1000
  const end = t + ms / 1000
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  const f = ctx.createBiquadFilter()
  f.type = o.type ?? 'bandpass'
  f.frequency.setValueAtTime(o.freq ?? 2000, t)
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, end)
  f.Q.value = o.q ?? 1
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + (o.attack ?? 2) / 1000)
  g.gain.exponentialRampToValueAtTime(0.0001, end)
  src.connect(f).connect(g).connect(o.dest ?? sfxBus!)
  src.start(t, Math.random() * 1.5)
  src.stop(end + 0.02)
}

// a musette accordion note: 1 reed dry, or 3 reeds (in tune, +14 and -14 cents) for the wet French shimmer.
// a reed honk at 1.2 kHz, a 10 ms bellows attack and a puff of breath. docs/SOUND.md §5
function accordion(midi: number, ms: number, gain: number, o: { reeds?: 1 | 3; delay?: number; attack?: number; glide?: number } = {}): void {
  if (!ctx || !pulse || silent()) return
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2800
  const honk = ctx.createBiquadFilter()
  honk.type = 'peaking'
  honk.frequency.value = 1200
  honk.gain.value = 4
  lp.connect(honk).connect(sfxBus!)
  const reeds = o.reeds === 3 ? [0, 14, -14] : [0]
  for (const cents of reeds) {
    const f = hz(midi) * 2 ** (cents / 1200)
    tone(f, ms, gain / reeds.length ** 0.5, {
      wave: pulse, attack: o.attack ?? 10, delay: o.delay, dest: lp, glide: o.glide ? f * 2 ** (o.glide / 12) : undefined,
    })
  }
  noise(40, gain * 0.06, { freq: 1800, q: 0.7, delay: o.delay })
}

// ---------- in key with the music ----------

const PENTATONIC = [53, 56, 58, 60, 63] // F minor pentatonic from F3, for when the music isn't playing

// the current chord's tones, stacked upward from F3 for three octaves
function ladder(): number[] {
  const chord = chordAt() ?? PENTATONIC
  const classes = [...new Set(chord.map(m => ((m % 12) + 12) % 12))]
  const out: number[] = []
  for (let m = 53; m < 53 + 40; m++) if (classes.includes(m % 12)) out.push(m)
  return out
}

const at = (l: number[], i: number) => l[Math.max(0, Math.min(l.length - 1, i))]

// ---------- the count-up (docs/SOUND.md §5) ----------

let lift = 0 // a grade step sends the rest of the chain up an octave

// step n of a hand's appraisal. each step plays the next chord tone up: a dry reed for Value,
// a bellows swell for +Hype, a full chord an octave up for ×Hype, the gold stamp and a bell for Grade
export function countStep(n: number, s: { value: number; hype: number; xhype: number; grade: number }, x?: number): void {
  if (n === 0) lift = 0
  const l = ladder()
  const note = at(l, n) + lift
  plays++
  if (s.grade) {
    play('slam', { gain: 0.9, x })
    play('bell', { gain: 0.5, rate: 2 ** ((note - 72) / 12), delay: 30 })
    lift += 12
    return
  }
  if (s.xhype !== 1) {
    const top = [note + 12, at(l, n + 1) + 12 + lift, at(l, n + 2) + 12 + lift]
    for (const m of top) accordion(m, 170, 0.22, { reeds: 3 })
    play('whoosh', { gain: 0.35, rate: 1.4 })
    return
  }
  accordion(note, s.hype ? 150 : 95, 0.32)
  if (s.hype) {
    accordion(note - 12, 260, 0.12, { reeds: 3, attack: 70 })
    noise(70, 0.05, { freq: 2600, sweep: 900, q: 0.8 })
  }
}

// a display case piece fires: a glass clink from the vitrine, then its stat's sound (countStep)
export function caseClink(): void {
  play('glass', { gain: 0.35, rate: 1.3 })
}

// the appraisal reels: a ratchet while they spin, a clack and an arpeggio note as each digit locks
export function reelSpin(): void {
  for (let i = 0; i < 5; i++) play('click', { gain: 0.18, rate: 0.8 + i * 0.05, delay: i * 45, cap: 6 })
}

export function digitLock(i: number, last: boolean): void {
  const l = ladder()
  play('metal-click', { gain: 0.45, rate: 1 + i * 0.04 })
  accordion(at(l, i * 2) + 12, last ? 420 : 110, last ? 0.3 : 0.2, { reeds: last ? 3 : 1 })
  if (last) for (const k of [1, 2]) accordion(at(l, i * 2 + k) + 12, 420, 0.2, { reeds: 3 })
}

// the number catches fire. 1 = gold (crackle), 2 = orange (+ a whoosh), 3 = white hot (a roar and a glass shimmer)
export function heat(level: 1 | 2 | 3): void {
  play('fire', { gain: 0.25 + level * 0.12, rate: level === 3 ? 0.8 : 1 })
  if (level >= 2) play('whoosh', { gain: 0.4, rate: 0.9 })
  if (level === 3) {
    noise(900, 0.12, { type: 'lowpass', freq: 400, attack: 200 })
    glassSwell()
  }
}

// ---------- hands and rounds ----------

// you took the hand: a short V -> i cadence on the accordion, in F minor
export function win(): void {
  for (const m of [60, 64, 67, 70]) accordion(m, 170, 0.16, { reeds: 3 })
  for (const m of [65, 68, 72, 77]) accordion(m, 480, 0.16, { reeds: 3, delay: 190 })
}

// you lost the hand: the bellows run out, pitch sinking
export function lose(): void {
  for (const m of [65, 68, 72]) accordion(m, 650, 0.15, { reeds: 3, glide: -7, attack: 30 })
  noise(500, 0.05, { freq: 900, sweep: 300, delay: 120 })
}

export function tie(): void {
  accordion(64, 160, 0.2)
  accordion(64, 260, 0.2, { delay: 200 })
}

// a knockout: the ring bell twice, a body hit, the crowd upstairs goes "ohh"
export function knockout(): void {
  play('bell', { gain: 0.7, rate: 1.25 })
  play('bell', { gain: 0.7, rate: 1.25, delay: 170 })
  play('hit', { gain: 1, delay: 40 })
  play('slam', { gain: 0.8, rate: 0.7, delay: 60 })
  crowd()
}

// the crowd upstairs, through the floor: detuned saws through an "oh" formant, pitch up then down
function crowd(): void {
  if (!ctx || silent()) return
  const vowel = ctx.createBiquadFilter()
  vowel.type = 'bandpass'
  vowel.frequency.value = 600
  vowel.Q.value = 2
  const floor = ctx.createBiquadFilter()
  floor.type = 'lowpass'
  floor.frequency.value = 1400
  vowel.connect(floor).connect(sfxBus!)
  for (let i = 0; i < 7; i++) {
    const f = 150 + i * 17 + Math.random() * 10
    tone(f, 1100, 0.05, { type: 'sawtooth', attack: 180, glide: f * 0.85, delay: 120 + i * 15, dest: vowel })
  }
}

// a heartbeat under the last push and the god pull's held card
export function heartbeat(): void {
  tone(62, 140, 0.5, { type: 'sine', glide: 40 })
  tone(58, 160, 0.4, { type: 'sine', glide: 38, delay: 190 })
}

// the rival busts: their mask cracks, clatters on the felt, the band plays them out
export function bust(): void {
  play('glass', { gain: 0.9, rate: 0.55 })
  play('tok', { gain: 0.7, rate: 0.8 })
  play('pot', { gain: 0.5, delay: 420 })
  play('pot', { gain: 0.35, rate: 1.2, delay: 560 })
  for (const [i, m] of [65, 68, 72, 77].entries()) accordion(m, 300, 0.18, { reeds: 3, delay: 700 + i * 110 })
  for (const m of [65, 69, 72, 77]) accordion(m, 900, 0.16, { reeds: 3, delay: 1150 })
}

// you're out: the lamp buzzes and dims, a long wheeze down
export function busted(): void {
  tone(100, 1400, 0.05, { type: 'sawtooth', attack: 40 })
  for (const m of [65, 68, 72]) accordion(m, 1600, 0.15, { reeds: 3, glide: -12, attack: 40, delay: 200 })
}

// the run is won: an accordion fanfare, Fm - Db - Eb - F major
export function fanfare(): void {
  const chords = [[65, 68, 72], [61, 65, 68], [63, 67, 70], [65, 69, 72, 77]]
  chords.forEach((c, i) => c.forEach(m => accordion(m, i === 3 ? 1100 : 260, 0.15, { reeds: 3, delay: i * 280 })))
}

// a boss twist lands: a gong and a glass swoop
export function twist(): void {
  play('gong', { gain: 0.8, rate: 0.8 })
  tone(hz(77), 900, 0.08, { type: 'sine', attack: 200, glide: hz(65), delay: 150 })
}

// ---------- cards ----------

// the i-th card of a deal, rising a little each card. x = where it lands, wait = ms before the first card
export function deal(i: number, x?: number, far = false, wait = 0): void {
  play('card-deal', { gain: far ? 0.5 : 0.6, rate: 2 ** (Math.min(i, 8) / 24), x, far, delay: wait + i * 70, cap: 8 })
}

// the rival's cards flip face up one by one
export function reveal(n: number): void {
  for (let i = 0; i < n; i++) play('card-snap', { gain: 0.45, rate: 2 ** (i / 18), far: true, delay: i * 90, cap: 6 })
}

// the spoils slide onto the table
export function spoils(n: number): void {
  for (let i = 0; i < n; i++) play('card-shove', { gain: 0.4, delay: i * 110, x: 260 + i * 60 })
}

export function select(up: boolean, x?: number): void {
  play('card-snap', { gain: up ? 0.6 : 0.35, rate: up ? 1.15 : 0.9, x })
}
// cards slapped face down on the felt. flamber: the cards slide off to the middle to burn
// cards slapped face down on the felt. flamber: a match strike and the flame catching instead
export function lock(n: number, flamber: boolean): void {
  if (flamber) return shove() // the cards lift to the middle. the flambé beat strikes the match itself
  for (let i = 0; i < Math.max(1, n); i++) play('card-place', { gain: 0.6, delay: i * 45, cap: 6 })
  accordion(41, 300, 0.12, { reeds: 3, attack: 60 })
  accordion(48, 300, 0.1, { reeds: 3, attack: 60 })
}

export function strike(): void {
  noise(90, 0.25, { freq: 3000, sweep: 6000, q: 1.5 })
  play('fire', { gain: 0.45, delay: 80 })
  play('whoosh', { gain: 0.3, rate: 1.2, delay: 60 })
}

export function shove(x?: number): void {
  play('card-shove', { gain: 0.5, x })
}

export function riffle(): void {
  play('card-riffle', { gain: 0.45 })
}

export function fan(): void {
  play('card-fan', { gain: 0.5 })
}

// a card flips face up. rare = a sparkle on top. step = its place in a run of flips
export function flip(rare: boolean, step = 0): void {
  play('card-snap', { gain: 0.55, rate: 2 ** (Math.min(step, 12) / 18) })
  if (rare) sparkle()
}

// the flambé: the cards fly into the fire, it roars, one card rises out of it
export function flambe(): void {
  play('whoosh', { gain: 0.5 })
  play('fire', { gain: 0.6, delay: 120 })
  tone(90, 380, 0.6, { type: 'sine', glide: 38, delay: 420 })
}

// ★ tiers: one bell per star, rising
export function stars(n: number): void {
  for (let i = 0; i < n; i++) tone(hz([77, 80, 84][i]), 700, 0.09, { type: 'sine', delay: i * 140 })
  if (n === 3) fanfare()
}

// no pair: a grindstone, then a ting
// the grind beat's heat: a grindstone while the card glows
export function grind(): void {
  for (let i = 0; i < 6; i++) noise(55, 0.12, { freq: 900 + i * 60, q: 2, delay: i * 50 })
}

// the flambé's own beats (docs/FLAMBER.md §7). a card catches: a soft fwoomp, a step higher each card
export function ignite(i: number): void {
  noise(180, 0.2, { freq: 380 + i * 70, sweep: 1600, q: 0.7 })
  play('fire', { gain: 0.22, rate: 1 + i * 0.06 })
}

// one pop of the fire. level 0..1.5
export function crackle(level: number): void {
  noise(14 + Math.random() * 22, 0.04 + 0.07 * Math.min(1, level), { type: 'highpass', freq: 1800 + Math.random() * 3000, q: 2 })
}

// the fire's body under the pops: overlapping swells of low filtered noise, louder as it grows. level 0..1.5
export function roar(level: number): void {
  const l = Math.min(1, level)
  noise(700, 0.03 + 0.09 * l, { type: 'lowpass', freq: 260 + 380 * l, q: 0.6, attack: 260 })
  noise(500, 0.02 + 0.04 * l, { freq: 900 + 500 * Math.random(), q: 0.4, attack: 180 })
}

// a card's flame pours into the ★ card
export function whump(): void {
  tone(78, 260, 0.32, { type: 'sine', glide: 42 })
  noise(220, 0.16, { freq: 420, sweep: 160, q: 0.8 })
}

// an Ash card lands: paper ash, no thud
export function ash(): void {
  noise(320, 0.13, { freq: 1300, sweep: 420, q: 0.6 })
  play('card-snap', { gain: 0.12, rate: 0.55 })
}

// the ground card quenched: steam, then the ting of the +1
export function quench(): void {
  noise(620, 0.2, { type: 'highpass', freq: 3800, sweep: 2200, q: 0.5 })
  tone(hz(84), 300, 0.08, { type: 'sine', delay: 260 })
}

// ---------- chips and money ----------

export function chip(far = false): void {
  play('chip-lay', { gain: 0.7, far })
}

// a stack pushed forward: Max
export function push(far = false): void {
  for (let i = 0; i < 3; i++) play('chip-stack', { gain: 0.6, delay: i * 70, far, cap: 6 })
  if (!far) accordion(53, 420, 0.12, { reeds: 3, attack: 150, glide: 5 })
}

export function ante(): void {
  play('chip-collide', { gain: 0.6 })
  play('chip-collide', { gain: 0.5, delay: 110, far: true })
}

// the pot slides to the winner
export function pot(far = false): void {
  play('chip-handle', { gain: 0.7, far })
  for (let i = 0; i < 3; i++) play('chip-collide', { gain: 0.4, delay: 120 + i * 90, far, cap: 6 })
}

export function coin(): void {
  play('coins', { gain: 0.55 })
}

// the vintage register: cha-ching
export function register(): void {
  play('metal-click', { gain: 0.5, rate: 0.9 })
  play('coins', { gain: 0.6, delay: 60 })
  tone(2637, 380, 0.06, { type: 'sine', delay: 90 })
  tone(3520, 300, 0.04, { type: 'sine', delay: 95 })
}

// the restock: a fresh box slams down on the zinc
export function slamBox(): void {
  play('slam', { gain: 0.8, rate: 0.9 })
  play('box', { gain: 0.4, delay: 20 })
}

// Ash emptied into the shop's ashtray
export function bin(): void {
  // ash tapped into the brass tray: two light taps on metal, a puff of ash
  play('metal', { gain: 0.3, rate: 1.5 })
  play('metal', { gain: 0.22, rate: 1.6, delay: 120 })
  noise(260, 0.1, { freq: 1100, sweep: 380, q: 0.6, delay: 140 })
}

// the card goes off to grading: La Poste stamps it and rings a bicycle bell, Chronopost beeps its scooter,
// the armored van slams its door
export function ship(by: 'poste' | 'chrono' | 'fourgon'): void {
  plays++
  if (by === 'poste') {
    stamp()
    tone(2349, 160, 0.05, { type: 'sine', delay: 260 })
    tone(2349, 260, 0.05, { type: 'sine', delay: 400 })
  } else if (by === 'chrono') {
    tone(880, 90, 0.05, { type: 'square', delay: 100 })
    tone(988, 120, 0.05, { type: 'square', delay: 220 })
  } else {
    play('metal', { gain: 0.8, rate: 0.6 })
    play('latch', { gain: 0.6, delay: 220 })
  }
}

// a receipt / tally line prints: ka-chunk
export function thunk(): void {
  play('metal-click', { gain: 0.4, rate: 0.75 })
  play('tok', { gain: 0.35, rate: 0.7, delay: 40 })
}

// ---------- paper, wood, the carnet ----------

export function press(): void {
  play('paper', { gain: 0.3, rate: 1.4 })
  play('tok', { gain: 0.4 })
}

export function denied(): void {
  play('tok', { gain: 0.45, rate: 0.65 })
}

export function stamp(): void {
  play('slam', { gain: 0.6, rate: 1.2 })
  play('paper', { gain: 0.25 })
}

export function paper(gain = 0.4): void {
  play('paper', { gain })
}

// the old pack-rip noise, now a real foil and paper tear
export function rip(volume = 0.15): void {
  play('paper', { gain: Math.min(1, volume * 5) })
  if (volume >= 0.15) play('pack-open', { gain: 0.6, delay: 30 })
}

export function page(): void {
  play('page', { gain: 0.45 })
}

export function bookOpen(): void {
  play('book-open', { gain: 0.5 })
}

export function bookClose(): void {
  play('book-close', { gain: 0.5 })
}

export function creak(): void {
  play('creak', { gain: 0.35 })
}

// a plastic sleeve: fwip
export function fwip(): void {
  noise(110, 0.12, { type: 'highpass', freq: 2000, sweep: 8000, attack: 20 })
}

export function typewriter(): void {
  play('typewriter', { gain: 0.5 })
}

// an insert from the Sleeve works on your cards: each one sounds like the thing it is
export function insert(id: string): void {
  plays++
  if (id === 'stylo') return void [0, 1, 2].forEach(i => noise(60, 0.08, { freq: 3500, q: 3, delay: i * 70 })) // a pen
  if (id === 'broyeuse') return void [0, 1, 2, 3, 4].forEach(i => noise(70, 0.15, { freq: 700 + i * 90, q: 1.5, delay: i * 60 })) // the shredder
  if (id === 'photocopie') return void (noise(500, 0.06, { freq: 1200, sweep: 2400, attack: 80 }), play('metal-click', { gain: 0.3, delay: 480 }))
  if (id === 'reprint') return void play('card-shove', { gain: 0.5 })
  if (id === 'allumettes') return strike()
  if (id === 'tampon') return stamp()
  if (id === 'code') return typewriter()
  if (id === 'checklist') return void noise(80, 0.1, { freq: 3000, sweep: 1500, q: 2 })
  if (id === 'grail') return glassSwell()
  sparkle() // foil, holo, prism, wishlist
}

// the announcement band slams on: an accordion chord stab. good = major, bad = low minor
export function band(tone: 'good' | 'bad' | 'plain'): void {
  const chord = tone === 'good' ? [65, 69, 72] : tone === 'bad' ? [53, 56, 60] : [60, 65, 68]
  for (const m of chord) accordion(m, 260, 0.13, { reeds: 3 })
  play('slam', { gain: 0.3, rate: 1.3 })
}

// a two-way switch: two tiny reeds, up for on (FR), down for off (EN)
export function toggle(on: boolean): void {
  accordion(on ? 72 : 77, 70, 0.14)
  accordion(on ? 77 : 72, 90, 0.14, { delay: 70 })
}

// ---------- hovers ----------

let hoverKey: string | null = null
let hoverAt = 0

// call every frame with whatever is under the mouse (a stable key, or null). a new key plays its tick:
// a paper "tk" for a card, a lighter one for everything else
export function hover(key: string | null, card = false, x?: number): void {
  if (key === hoverKey) return
  hoverKey = key
  if (key === null) return
  const t = performance.now()
  // the slide is a bright hiss, so a fast sweep across the hand sounded like static: lowpass it to a soft
  // paper thup, space card ticks out, one voice at a time, quieter the faster you sweep
  const gap = t - hoverAt
  if (gap < (card ? 70 : 40)) return
  hoverAt = t
  if (card) play('card-hover', { gain: 0.25 * Math.min(1, gap / 200), x, lp: 1800, rate: 1 + ((x ?? 320) - 320) / 1600, cap: 1 })
  else play('tick', { gain: 0.2 })
}

// ---------- chimes ----------

export function bell(): void {
  play('bell', { gain: 0.45 })
}

export function doorBell(): void {
  play('doorbell', { gain: 0.5 })
  play('door', { gain: 0.25 })
}

// your turn to bet: two reeds up
export function turn(): void {
  accordion(72, 200, 0.16)
  accordion(77, 360, 0.16, { delay: 120 })
}

export function gradeUp(): void {
  play('slam', { gain: 0.7 })
  play('bell', { gain: 0.4, rate: 1.5, delay: 30 })
}

export function sparkle(): void {
  const l = ladder()
  for (let i = 0; i < 5; i++) tone(hz(at(l, 8 + i) + 12), 260, 0.05, { type: 'sine', delay: i * 45 })
}

// the pack shakes: foil and paper rustling
export function rustle(): void {
  play('cloth', { gain: 0.35, rate: 1.4 })
  play('paper', { gain: 0.2, rate: 1.6, delay: 250 })
}

// the god pull flips: the glass harmonica, the fée verte's whoosh, the buraliste's lighter on the zinc
export function godPull(): void {
  glassSwell()
  sparkle()
  play('whoosh', { gain: 0.5, rate: 0.8 })
  play('metal-click', { gain: 0.3, rate: 1.4, delay: 500 })
}

// the glass harmonica: the god pull, white-hot heat
export function glassSwell(): void {
  for (const m of [77, 80, 84]) tone(hz(m), 1800, 0.05, { type: 'sine', attack: 600 })
}

// a scratcher window clears, a step in any short run: the next chord tone up
export function tick(n: number): void {
  accordion(at(ladder(), n) + 12, 90, 0.22)
}

// a coin dragged over scratch foil: brighter when you rub faster
export function scratch(speed: number): void {
  noise(70, 0.05 + 0.05 * speed, { freq: 1800 + 2600 * speed })
  if (speed > 0.6) play('scratch', { gain: 0.15 * speed, cap: 2 })
}

// ---------- voices: undertale-style blips (docs/SOUND.md §6) ----------

export type Voice = 'buraliste' | 'croupier' | 'patron' | 'fee' | 'hare' | 'pierrot' | 'domino' | 'domino_red' | 'arlequin'
  | 'queen_hearts' | 'king_spades' | 'owl' | 'scaramouche' | 'fox'

type Speaker = { wave: OscillatorType | 'reed' | 'glass'; base: number; every: number; ms: number; filter?: number; spread: number }
const VOICES: Record<Voice, Speaker> = {
  buraliste: { wave: 'reed', base: 45, every: 3, ms: 60, spread: 1 },
  croupier: { wave: 'square', base: 60, every: 2, ms: 45, filter: 900, spread: 1 },
  patron: { wave: 'reed', base: 36, every: 3, ms: 80, filter: 600, spread: 1 },
  fee: { wave: 'glass', base: 84, every: 2, ms: 160, spread: 3 },
  hare: { wave: 'triangle', base: 79, every: 1, ms: 30, spread: 2 },
  pierrot: { wave: 'sine', base: 67, every: 2, ms: 70, spread: 1 },
  domino: { wave: 'square', base: 55, every: 2, ms: 55, filter: 700, spread: 1 },
  domino_red: { wave: 'square', base: 69, every: 2, ms: 40, filter: 2400, spread: 2 },
  arlequin: { wave: 'sine', base: 81, every: 2, ms: 50, spread: 4 },
  queen_hearts: { wave: 'sine', base: 72, every: 2, ms: 65, spread: 2 },
  king_spades: { wave: 'sawtooth', base: 48, every: 3, ms: 70, filter: 900, spread: 1 },
  owl: { wave: 'triangle', base: 64, every: 2, ms: 80, filter: 1200, spread: 1 },
  scaramouche: { wave: 'sawtooth', base: 62, every: 2, ms: 45, filter: 1400, spread: 3 },
  fox: { wave: 'triangle', base: 57, every: 2, ms: 35, spread: 2 },
}

// a rival's voice from their mask id. anyone else (or a mask with no voice of its own) is the croupier
export function voiceOf(id: string): Voice {
  return id in VOICES ? (id as Voice) : 'croupier'
}

// the i-th letter of a line typing out. plays on every `every` letters, nothing on spaces and punctuation,
// a step up on "!", a bend up on "?". masked = behind a mask, duller
export function blip(voice: Voice, i: number, ch: string, masked = false): void {
  if (!pref('blips')) return
  const v = VOICES[voice]
  if (ch === '!' || ch === '?') {
    const l = ladder()
    const m = nearest(l, v.base) + (ch === '!' ? 2 : 0)
    return say(v, m, masked, ch === '?')
  }
  if (!/[\p{L}\p{N}]/u.test(ch) || i % v.every) return
  const l = ladder()
  const k = l.indexOf(nearest(l, v.base))
  say(v, at(l, k + Math.round((Math.random() * 2 - 1) * v.spread)), masked, false)
}

function nearest(l: number[], m: number): number {
  const shifted = l.map(n => n - 12 * Math.round((n - m) / 12))
  return shifted.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a))
}

function say(v: Speaker, m: number, masked: boolean, bend: boolean): void {
  plays++
  if (!ctx || silent()) return
  if (v.wave === 'reed') return accordion(m, v.ms, 0.16, { attack: 4, glide: bend ? 3 : undefined })
  if (v.wave === 'glass') return glass(m, v.ms, bend)
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = Math.min(v.filter ?? 6000, masked ? 2500 : 20000)
  f.connect(sfxBus!)
  tone(hz(m), v.ms, 0.08, { type: v.wave, attack: 3, dest: f, glide: bend ? hz(m + 3) : undefined })
}

// la fée verte's voice: a spoon on an absinthe glass. the note, a quiet twelfth over it and a bell partial that dies
// fast, so each letter rings and fades instead of buzzing
function glass(m: number, ms: number, bend: boolean): void {
  const f = hz(m)
  tone(f, ms, 0.06, { type: 'sine', attack: 2, glide: bend ? hz(m + 3) : undefined })
  tone(hz(m + 19), ms * 0.6, 0.018, { type: 'sine', attack: 2 })
  tone(f * 2.76, ms * 0.25, 0.01, { type: 'sine', attack: 1 })
}

// ---------- ambience (docs/SOUND.md §7) ----------

let room: { stop: () => void; kind: 'duel' | 'shop' } | null = null

// the room under everything: the duel's back room or the tabac. null = silence
export function ambience(kind: 'duel' | 'shop' | null): void {
  if (room?.kind === kind) return
  room?.stop()
  room = null
  if (!kind || !ctx || !noiseBuf) return
  const c = ctx
  const bed = c.createBufferSource()
  bed.buffer = noiseBuf
  bed.loop = true
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = kind === 'duel' ? 260 : 180
  const g = c.createGain()
  g.gain.value = 0
  g.gain.setTargetAtTime(kind === 'duel' ? 0.05 : 0.03, c.currentTime, 0.8)
  bed.connect(lp).connect(g).connect(ambBus!)
  const hum = c.createOscillator()
  hum.frequency.value = kind === 'duel' ? 120 : 60 // the lamp, the tabac's fridge
  const hg = c.createGain()
  hg.gain.value = 0.006
  hum.connect(hg).connect(ambBus!)
  bed.start()
  hum.start()
  // the duel: a glass or a far chip now and then. the tabac: the wall clock
  let tock = 0
  const timer = kind === 'duel'
    ? setInterval(() => { if (Math.random() < 0.08) play(Math.random() < 0.6 ? 'glass' : 'chip-collide', { gain: 0.06, far: true }) }, 1000)
    : setInterval(() => play('tick', { gain: 0.07, rate: tock++ % 2 ? 0.55 : 0.62, jitter: 0 }), 1000)
  room = {
    kind,
    stop: () => {
      clearInterval(timer)
      g.gain.setTargetAtTime(0, c.currentTime, 0.3)
      bed.stop(c.currentTime + 1.5)
      hum.stop(c.currentTime + 0.1)
    },
  }
}
