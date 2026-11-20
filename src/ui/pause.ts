// the pause menu: Esc (or the Pause tab) dims the game and opens one paper sheet in the middle with every setting.
// tabs down the left, rows on the right, the hovered row's one line at the foot. every scene draws it last and
// hands it clicks first (drawPause / pauseClick). the settings themselves live in prefs.ts
import { nineSlice } from './art.ts'
import { drawText, measure, wrapText } from './font.ts'
import { drawerOpen } from './drawer.ts'
import { panelEscapes } from './panels.ts'
import { fichePinned } from './fiche.ts'
import { lang, setLang } from './lang.ts'
import { resetTips } from './tips.ts'
import { onPref, pref, setPref, type Prefs } from './prefs.ts'
import * as sfx from './sound.ts'

type P = { x: number; y: number }
type Hit = { x: number; y: number; w: number; h: number; act: () => void; drag?: (x: number) => void }
type Tab = 'sound' | 'game' | 'display' | 'access' | 'keys' | 'credits'
type Control =
  | { kind: 'slider'; key: 'master' | 'music' | 'sfx' | 'ambience' | 'post' }
  | { kind: 'choice'; options: [string, unknown][]; get: () => unknown; set: (v: never) => void }
  | { kind: 'button'; label: string; act: () => void; done?: string }
type Row = { label: string; help: string; control: Control }

export type PauseHooks = {
  inRun: () => boolean
  abandon: () => void
  firstRun: () => void
  escBusy: () => boolean // the scene has its own use for Esc right now (the scratch ticket)
}

const W = 640
const H = 360
const BOX = { x: 92, y: 24, w: 456, h: 312 }
const NAV = { x: BOX.x + 12, y: BOX.y + 36, w: 92 }
const BODY = { x: BOX.x + 120, y: BOX.y + 38, w: BOX.w - 132 }
const CONTROL_X = BODY.x + 98
const ROW_H = 19
const INK = '#1c1513'
const CREAM = '#f6ecd2'
const PAPER = '#e3d2a8'
const TAN = '#bfa77e'
const FADED = '#6b5a44'
const BURGUNDY = '#7a1a2c'
const GOLD = '#e8c260'
const BRASS = '#c99a3a'
const RED = '#a82a38'

const TABS: [Tab, string][] = [['sound', 'Sound'], ['game', 'Game'], ['display', 'Display'], ['access', 'Access'], ['keys', 'Keys'], ['credits', 'Credits']]

let hooks: PauseHooks | null = null
let open = false
let tab: Tab = 'sound'
let openedAt = 0
let hits: Hit[] = []
let help = ''
let armed: { id: string; t: number } | null = null // a tap-twice button waiting for its second tap
let done: { id: string; t: number } | null = null // a button that just did its thing says so for a moment
let held = false
let dragging: ((x: number) => void) | null = null
let wasHeld = false

export function setPauseHooks(h: PauseHooks): void {
  hooks = h
}

export const pauseOpen = () => open

export function openPause(): void {
  if (open) return
  open = true
  openedAt = performance.now()
  armed = null
  sfx.bookOpen()
}

export function closePause(): void {
  if (!open) return
  open = false
  dragging = null
  sfx.bookClose()
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen?.().catch(() => {})
}

// ---------- the rows ----------

const onOff = (key: keyof Prefs, label: string, help: string, invert = false): Row => ({
  label, help,
  control: { kind: 'choice', options: invert ? [['Off', false], ['On', true]] : [['On', true], ['Off', false]], get: () => pref(key), set: v => setPref(key, v) },
})
const choice = <K extends keyof Prefs>(key: K, label: string, help: string, options: [string, Prefs[K]][]): Row => ({
  label, help, control: { kind: 'choice', options, get: () => pref(key), set: (v: Prefs[K]) => setPref(key, v) },
})
const slider = (key: 'master' | 'music' | 'sfx' | 'ambience' | 'post', label: string, help: string): Row => ({ label, help, control: { kind: 'slider', key } })

function rows(t: Tab): Row[] {
  if (t === 'sound') return [
    slider('master', 'Master', 'Everything at once.'),
    slider('music', 'Music', 'Gnossienne Flambée, the house band.'),
    slider('sfx', 'Effects', 'Cards, chips, paper, the count-up.'),
    slider('ambience', 'Room', 'The room tone: the murmur, the lamp, the tabac clock.'),
    onOff('muted', 'Mute', 'M mutes and unmutes anywhere.', true),
    onOff('bgMute', 'Mute when away', 'Silent while the game tab is hidden.'),
    onOff('blips', 'Voices', 'The little blips when someone talks.'),
  ]
  if (t === 'game') return [
    choice('speed', 'Game speed', 'How fast the count-up, the tally and the rival play out.', [['1×', 1], ['1.5×', 1.5], ['2×', 2], ['3×', 3]]),
    choice('countUp', 'Count-up', 'Skip jumps straight to the Appraisal. Space or a click skips one any time.', [['Watch', 'watch'], ['Skip', 'skip']]),
    choice('confirm', 'Confirm bets', 'Max (and Flamber) need a second press, so a stray click can’t end a run.', [['Off', 'off'], ['Max', 'max'], ['Max + Flamber', 'both']]),
    choice('sort', 'Hand order', 'How your hand fans out. The sort chip by the hand changes it too.', [['Rank', 'rank'], ['Suit', 'suit']]),
    onOff('preview', 'Hand preview', 'Your plate shows what the picked cards make before you play.'),
    onOff('tips', 'Tips', 'A pinned line the first time something can be used.'),
    { label: 'Tips again', help: 'Forget every tip already seen, for a new player on this browser.', control: { kind: 'button', label: 'Reset', act: resetTips, done: 'Done' } },
    choice('fiche', 'Fiche on hover', 'How fast the description box comes up.', [['Instant', 'instant'], ['Short', 'short'], ['Slow', 'slow']]),
    { label: 'Language', help: 'English or French. French words stay as names either way.', control: { kind: 'choice', options: [['EN', 'en'], ['FR', 'fr']], get: lang, set: (v: 'en' | 'fr') => setLang(v) } },
    onOff('glint', 'French glint', 'The gilt shimmer that crosses French words.'),
  ]
  if (t === 'display') return [
    { label: 'Fullscreen', help: 'F toggles it anywhere.', control: { kind: 'choice', options: [['On', true], ['Off', false]], get: () => !!document.fullscreenElement, set: (v: boolean) => { if (v !== !!document.fullscreenElement) toggleFullscreen() } } },
    choice('scale', 'Pixels', 'Crisp keeps every pixel square, with a border. Fill uses the whole screen.', [['Crisp', 'crisp'], ['Fill', 'fill']]),
    slider('post', 'Atmosphere', 'Vignette, smoke and light leaks.'),
    choice('shake', 'Screen shake', 'Pack rips, big flambés, the K.O. hit.', [['Off', 'off'], ['Low', 'low'], ['Full', 'full']]),
    choice('fps', 'Frame rate', 'Saver drops to 30, and 15 when you leave it alone. Easier on a battery.', [['60', 60], ['30', 30], ['Saver', 'saver']]),
    onOff('cursor', 'Pixel cursor', 'The drawn arrow and hand, or your system cursor.'),
  ]
  if (t === 'access') return [
    choice('motion', 'Reduce motion', 'No shake, drift or flourishes. Auto follows your system setting.', [['Auto', 'auto'], ['On', 'on'], ['Off', 'off']]),
    onOff('calmFlash', 'Calm flashes', 'Softens the bright bursts: god pulls, the Grail, the lamp flare.', true),
    onOff('fourColor', 'Four-color suits', '♥ burgundy, ♦ brass, ♣ green, ♠ ink. A flush reads at a glance.', true),
    onOff('contrast', 'High contrast', 'Faded ink goes dark, light text gets an outline.', true),
    onOff('bigFiche', 'Large Fiche', 'The description box at double size.', true),
  ]
  return []
}

const KEYS: [string, string][] = [
  ['Esc', 'Pause and settings, or close what’s open'],
  ['Space / Enter', 'The gold ticket, or skip a beat'],
  ['1 – 4', 'The tickets, top to bottom'],
  ['D B S V ?', 'Deck, binder, sleeve, vitrine, rules'],
  ['M', 'Mute'],
  ['F', 'Fullscreen'],
  ['Hold / R-click', 'Pin a Fiche'],
  ['Up / Down', 'Title: walk between floors'],
]

const CREDITS = [
  'Flambeur, by Evan Hoddinott.',
  'KSU AI Club Hackathon, Nov 2026.',
  '',
  'Music: Gnossienne Flambée, after Erik Satie’s',
  'Gnossienne No. 1 (public domain).',
  'Sound: CC0 packs by Kenney, rubberduck, starninjas,',
  'antumdeluge, pyranostudios, cassie-orbitgames and',
  'frosty-ham, from OpenGameArt.',
  'Art and fonts: drawn for the game.',
  '',
  'Merci d’avoir joué.',
]

// ---------- drawing ----------

function hit(x: number, y: number, w: number, h: number, act: () => void, mouse: P, drag?: (x: number) => void): boolean {
  hits.push({ x, y, w, h, act, drag })
  return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h
}

function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string): void {
  g.fillStyle = INK
  g.fillRect(x, y, w, h)
  g.fillStyle = fill
  g.fillRect(x + 1, y + 1, w - 2, h - 2)
}

function chip(g: CanvasRenderingContext2D, label: string, x: number, y: number, on: boolean, mouse: P, act: () => void): number {
  const w = measure(label, 'sans') + 10
  const lit = hit(x, y, w, 13, act, mouse)
  const up = lit && !on ? 1 : 0
  box(g, x, y - up, w, 13, on ? GOLD : lit ? CREAM : TAN)
  drawText(g, label, x + 5, y + 2 - up, { font: 'sans', color: INK, bold: on })
  return w
}

// the slider: ten notches, click or drag along them
function notches(g: CanvasRenderingContext2D, key: 'master' | 'music' | 'sfx' | 'ambience' | 'post', x: number, y: number, mouse: P): void {
  const n = 10
  const cell = 12
  const w = n * cell
  const at = (px: number) => Math.round(Math.max(0, Math.min(1, (px - x) / w)) * n) / n
  const set = (px: number) => {
    const v = at(px)
    if (v !== pref(key)) {
      setPref(key, v)
      sfx.tick(Math.round(v * n))
    }
  }
  hit(x - 4, y - 3, w + 8, 17, () => set(mouse.x), mouse, set)
  const v = Math.round(pref(key) * n)
  for (let i = 0; i < n; i++) box(g, x + i * cell, y + 1, cell - 2, 10, i < v ? BRASS : PAPER)
  drawText(g, `${v * 10}`, x + w + 6, y + 1, { font: 'sans', color: INK })
}

function row(g: CanvasRenderingContext2D, r: Row, y: number, mouse: P, id: string): void {
  if (mouse.x >= BODY.x - 4 && mouse.x <= BODY.x + BODY.w && mouse.y >= y - 3 && mouse.y < y + ROW_H - 3) help = r.help
  drawText(g, r.label, BODY.x, y + 2, { font: 'sans', color: INK })
  const c = r.control
  if (c.kind === 'slider') return notches(g, c.key, CONTROL_X, y, mouse)
  if (c.kind === 'button') {
    const said = done?.id === id && performance.now() - done.t < 1500
    chip(g, said ? c.done ?? c.label : c.label, CONTROL_X, y, false, mouse, () => {
      c.act()
      done = { id, t: performance.now() }
      sfx.press()
    })
    return
  }
  let x = CONTROL_X
  const now = c.get()
  for (const [label, value] of c.options) {
    x += chip(g, label, x, y, now === value, mouse, () => {
      if (c.get() === value) return
      ;(c.set as (v: unknown) => void)(value)
      sfx.press()
    }) + 3
  }
}

// a nav button down the left: the tabs, then the run's own buttons at the foot
function navButton(g: CanvasRenderingContext2D, label: string, y: number, on: boolean, mouse: P, act: () => void, ink = INK, fill?: string): void {
  const lit = hit(NAV.x, y, NAV.w, 17, act, mouse)
  const dx = on ? 4 : lit ? 2 : 0
  box(g, NAV.x + dx, y, NAV.w - 4, 17, fill ?? (on ? GOLD : lit ? CREAM : TAN))
  drawText(g, label, NAV.x + dx + 7, y + 4, { font: 'sans', color: ink, bold: on })
}

// tap twice: the first tap arms it and says so, a second within 3 s goes
function twice(id: string, go: () => void): () => void {
  return () => {
    const t = performance.now()
    if (armed?.id === id && t - armed.t < 3000) {
      armed = null
      go()
    } else {
      armed = { id, t }
      sfx.press()
    }
  }
}
const isArmed = (id: string) => armed?.id === id && performance.now() - armed.t < 3000

// call last in a frame, in stage units (640×360)
export function drawPause(g: CanvasRenderingContext2D, mouse: P): void {
  hits = []
  if (!open) return
  const u = Math.min(1, (performance.now() - openedAt) / 160)
  // the scrim covers the whole canvas, past the stage's edges where the carnet peeks out
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = `rgba(14,11,10,${0.62 * u})`
  g.fillRect(0, 0, g.canvas.width, g.canvas.height)
  g.restore()
  g.save()
  g.translate(0, Math.round((1 - u) * 10))
  // the scrim eats every click off the sheet: clicking outside closes it
  hits.push({ x: 0, y: 0, w: W, h: H, act: closePause })
  hits.push({ x: BOX.x, y: BOX.y, w: BOX.w, h: BOX.h, act: () => {} })
  nineSlice(g, 'hud/plate/frame', BOX.x - 4, BOX.y - 4, BOX.w + 8, BOX.h + 8)
  nineSlice(g, 'hud/plate/paper', BOX.x, BOX.y, BOX.w, BOX.h)
  const inRun = !!hooks?.inRun()
  drawText(g, inRun ? 'Pause' : 'Réglages', BOX.x + BOX.w / 2, BOX.y + 6, { font: 'didone', color: BURGUNDY, align: 'center' })
  g.fillStyle = TAN
  g.fillRect(BOX.x + 116, BOX.y + 34, 1, BOX.h - 62)

  help = ''
  TABS.forEach(([id, label], i) => navButton(g, label, NAV.y + i * 21, tab === id, mouse, () => {
    if (tab !== id) sfx.page()
    tab = id
  }))
  // the foot of the nav: back to the game, and the run's ways out
  let y = BOX.y + BOX.h - 30
  navButton(g, inRun ? 'Resume' : 'Close', y, false, mouse, closePause, INK, GOLD)
  y -= 22
  if (inRun) {
    const go = twice('abandon', () => { closePause(); hooks?.abandon() })
    navButton(g, isArmed('abandon') ? 'Sure? Tap again' : 'Abandon run', y, false, mouse, go, CREAM, RED)
    if (mouse.x >= NAV.x && mouse.x <= NAV.x + NAV.w && mouse.y >= y && mouse.y <= y + 17) help = 'Back to the title. This run is lost.'
    y -= 22
  }
  const first = inRun ? twice('first', () => { closePause(); hooks?.firstRun() }) : () => { closePause(); hooks?.firstRun() }
  navButton(g, isArmed('first') ? 'Sure? Tap again' : 'First run', y, false, mouse, first)
  if (mouse.x >= NAV.x && mouse.x <= NAV.x + NAV.w && mouse.y >= y && mouse.y <= y + 17) help = `Play the guided first run again${inRun ? ', instead of this one' : ''}.`

  if (tab === 'keys') {
    KEYS.forEach(([k, what], i) => {
      drawText(g, k, BODY.x, BODY.y + i * ROW_H, { font: 'sans', color: BURGUNDY, bold: true })
      drawText(g, what, BODY.x + 96, BODY.y + i * ROW_H, { font: 'sans', color: INK })
    })
  } else if (tab === 'credits') {
    CREDITS.forEach((line, i) => drawText(g, line, BODY.x, BODY.y + i * 12, { font: 'sans', color: i < 2 ? INK : FADED, bold: i === 0 }))
  } else rows(tab).forEach((r, i) => row(g, r, BODY.y + i * ROW_H, mouse, `${tab}:${i}`))

  // the hovered row's one line
  g.fillStyle = TAN
  g.fillRect(BODY.x, BOX.y + BOX.h - 27, BODY.w, 1)
  const lines = wrapText(help, BODY.w, 'sans').slice(0, 2)
  lines.forEach((l, i) => drawText(g, l, BODY.x, BOX.y + BOX.h - 22 + i * 10, { font: 'sans', color: FADED }))
  g.restore()

  // a slider follows the mouse while the button is down
  if (held && !wasHeld) dragging = topHit(mouse)?.drag ?? null
  if (!held) dragging = null
  if (dragging) dragging(mouse.x)
  wasHeld = held
}

function topHit(p: P): Hit | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]
    if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return h
  }
  return null
}

// true while open: the pause menu takes every click
export function pauseClick(p: P): boolean {
  if (!open) return false
  topHit(p)?.act()
  return true
}

// what's under the mouse, for the pointer cursor and the hover tick. null off any button
export function pauseHoverAt(p: P): string | null {
  if (!open) return null
  const h = topHit(p)
  return h && hits.indexOf(h) > 1 ? `pause${hits.indexOf(h)}:${h.w}` : null
}

// ---------- keys and the pointer ----------

// every scene sizes its canvas on resize, so a new Pixels setting is one fake resize away
onPref(key => { if (key === 'scale') window.dispatchEvent(new Event('resize')) })

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => { held = true }, true)
  window.addEventListener('pointerup', () => { held = false }, true)
  window.addEventListener('blur', () => { held = false })
  // capture, so an open menu swallows keys before any scene sees them
  window.addEventListener('keydown', e => {
    if (!hooks || e.metaKey || e.ctrlKey || e.altKey) return
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    if (typing) return
    if ((e.key === 'f' || e.key === 'F') && !e.repeat) {
      toggleFullscreen()
      e.preventDefault()
      return
    }
    if (open) {
      if (e.key === 'm' || e.key === 'M') return // mute still works
      e.stopImmediatePropagation()
      e.preventDefault()
      if (e.key === 'Escape') closePause()
      return
    }
    if (e.key !== 'Escape' || drawerOpen() || panelEscapes() || fichePinned() || hooks.escBusy()) return
    e.stopImmediatePropagation()
    openPause()
  }, true)
}

// ---------- the Pause tab ----------
// a paper tab hanging off the top edge, over the run strip, for a mouse or a finger with no Esc key

// w waits for the fonts: measured when a scene first asks
export const PAUSE_TAB = { x: 8, y: 0, get w() { return pauseTabW('Pause') }, h: 16 }

export const pauseTabW = (label: string) => measure(label, 'tiny') + 22

export function pauseTab(g: CanvasRenderingContext2D, over: boolean, x = PAUSE_TAB.x, label = 'Pause'): void {
  const w = pauseTabW(label)
  const drop = over ? 2 : 0
  nineSlice(g, 'hud/plate/paper', x, -4 + drop, w, 18, over ? CREAM : PAPER)
  g.fillStyle = BURGUNDY
  g.fillRect(x + 6, 3 + drop, 2, 7)
  g.fillRect(x + 10, 3 + drop, 2, 7)
  drawText(g, label, x + 16, 2 + drop, { font: 'tiny', color: BURGUNDY })
}
