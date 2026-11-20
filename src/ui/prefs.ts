// the player's settings: one object, one localStorage key, read anywhere, changed from the pause menu (ui/pause.ts).
// storage can throw (private window, blocked site data): then the settings still apply, they just don't stick

export type Prefs = {
  // sound
  master: number // 0..1
  music: number
  sfx: number
  ambience: number
  muted: boolean
  bgMute: boolean // silent while the tab is hidden
  blips: boolean // the characters' speech blips
  // game
  speed: 1 | 1.5 | 2 | 3
  countUp: 'watch' | 'skip'
  confirm: 'off' | 'max' | 'both' // a second press for Max (and Flamber)
  sort: 'rank' | 'suit'
  preview: boolean // the hand readout on your plate
  tips: boolean
  fiche: 'instant' | 'short' | 'slow'
  lang: 'en' | 'fr'
  glint: boolean
  // display
  scale: 'crisp' | 'fill'
  post: number // 0..1, vignette, smoke and light leaks
  shake: 'off' | 'low' | 'full'
  fps: 60 | 30 | 'saver'
  cursor: boolean // the pixel cursor
  // access
  motion: 'auto' | 'on' | 'off' // reduce motion
  calmFlash: boolean
  fourColor: boolean
  contrast: boolean
  bigFiche: boolean
}

const DEFAULTS: Prefs = {
  master: 0.9, music: 0.7, sfx: 1, ambience: 1, muted: false, bgMute: true, blips: true,
  speed: 1, countUp: 'watch', confirm: 'both', sort: 'rank', preview: true, tips: true, fiche: 'short', lang: 'en', glint: true,
  scale: 'crisp', post: 1, shake: 'full', fps: 60, cursor: true,
  motion: 'auto', calmFlash: false, fourColor: false, contrast: false, bigFiche: false,
}

const KEY = 'flambeur.prefs'
const prefs: Prefs = { ...DEFAULTS, ...load() }
const listeners: ((key: keyof Prefs) => void)[] = []

// a saved value only counts if it has the default's type, so an old or hand-edited save can't break a setting
function load(): Partial<Prefs> {
  const out: Record<string, unknown> = {}
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? migrate()
    for (const [k, v] of Object.entries(saved)) if (k in DEFAULTS && typeof v === typeof DEFAULTS[k as keyof Prefs]) out[k] = v
  } catch {
    // nothing saved we can read: the defaults
  }
  return out as Partial<Prefs>
}

// before the pause menu, sound, language and tips each saved under their own key
function migrate(): Partial<Prefs> {
  const sound = JSON.parse(localStorage.getItem('flambeur.sound') ?? '{}')
  const lang = localStorage.getItem('flambeur:lang')
  const tips = localStorage.getItem('flambeur.tips')
  return { ...sound, ...(lang === 'fr' ? { lang } : {}), ...(tips === 'off' ? { tips: false } : {}) }
}

export function pref<K extends keyof Prefs>(key: K): Prefs[K] {
  return prefs[key]
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  if (prefs[key] === value) return
  prefs[key] = value
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // applied, not saved
  }
  for (const fn of listeners) fn(key)
}

export function onPref(fn: (key: keyof Prefs) => void): void {
  listeners.push(fn)
}

// ---------- what the settings mean, for the scenes ----------

const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

// reduce motion, shaped like the MediaQueryList the scenes used to read: still.matches
export const still = {
  get matches(): boolean {
    return prefs.motion === 'on' || (prefs.motion === 'auto' && !!reduced?.matches)
  },
}

// timings divide by this: the count-up, the tally, the pauses between turns
export const pace = () => prefs.speed

// screen shake multiplier. reduce motion stops it too
export const shake = () => (still.matches ? 0 : { off: 0, low: 0.4, full: 1 }[prefs.shake])

// a bright overlay's strength, softened when flashes are calmed
export const flash = (alpha: number) => (prefs.calmFlash ? alpha * 0.35 : alpha)

// the stage's device-pixel scale. crisp keeps every stage pixel the same whole number of screen pixels
export function stageScale(cw: number, ch: number, w: number, h: number): number {
  const k = Math.min(cw / w, ch / h)
  return prefs.scale === 'crisp' && k >= 1 ? Math.floor(k) : k
}

// ---------- the frame rate cap ----------

let lastInput = performance.now()
if (typeof window !== 'undefined') {
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const) {
    window.addEventListener(ev, () => { lastInput = performance.now() }, { capture: true, passive: true })
  }
}

// one per scene loop: true when this animation frame should draw. saver drops to 15 fps after 5 s with no input
export function frameGate(): (t: number) => boolean {
  let drawn = -Infinity
  return t => {
    const fps = prefs.fps === 'saver' ? (t - lastInput > 5000 ? 15 : 30) : prefs.fps
    if (fps >= 60) return true
    if (t - drawn < 1000 / fps - 2) return false
    drawn = t
    return true
  }
}
