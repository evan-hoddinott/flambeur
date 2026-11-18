// tiny webaudio synth so we don't ship audio files. browsers need a click before audio starts

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null // no audio support, game still works silently
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, ms: number, type: OscillatorType = 'triangle', gain = 0.08, delayMs = 0): void {
  const a = audio()
  if (!a) return
  const t = a.currentTime + delayMs / 1000
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
  osc.connect(g).connect(a.destination)
  osc.start(t)
  osc.stop(t + ms / 1000)
}

// rising scale for the count-up, step n gets higher
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31]
export function tick(n: number): void {
  const semis = SCALE[Math.min(n, SCALE.length - 1)] + 12 * Math.floor(n / SCALE.length)
  tone(330 * 2 ** (semis / 12), 120)
}

export function gradeUp(): void {
  tone(660, 220, 'square', 0.05)
  tone(990, 260, 'square', 0.04, 60)
}

export function win(): void {
  ;[523, 659, 784, 1047].forEach((f, i) => tone(f, 260, 'triangle', 0.08, i * 90))
}

export function lose(): void {
  ;[392, 330, 262].forEach((f, i) => tone(f, 300, 'sawtooth', 0.04, i * 120))
}

export function flip(rare: boolean): void {
  if (rare) {
    ;[784, 988, 1175, 1568].forEach((f, i) => tone(f, 200, 'triangle', 0.07, i * 70))
  } else {
    tone(520, 60, 'square', 0.03)
  }
}

export function rip(): void {
  const a = audio()
  if (!a) return
  const len = Math.floor(a.sampleRate * 0.25)
  const buf = a.createBuffer(1, len, a.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = a.createBufferSource()
  const g = a.createGain()
  g.gain.value = 0.15
  src.buffer = buf
  src.connect(g).connect(a.destination)
  src.start()
}

export function coin(): void {
  tone(1320, 80, 'square', 0.04)
  tone(1760, 120, 'square', 0.04, 70)
}

// the desk bell on the shop counter: a bright ding with a ringing overtone
export function bell(): void {
  tone(1568, 700, 'sine', 0.07)
  tone(3136, 400, 'sine', 0.025)
  tone(2093, 500, 'sine', 0.02, 10)
}
