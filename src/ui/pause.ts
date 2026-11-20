// the pause menu: Esc (or the Pause tab) dims the game and opens one felt panel in the middle with every setting.
// it's built from the bet tickets: tab tickets down the left, stub tickets for each choice, jeton sliders, and the
// hovered row's one line printed on a receipt at the foot. every scene draws it last and hands it clicks first
// (drawPause / pauseClick). the settings themselves live in prefs.ts
import { blit, nineSlice, partCanvas, sprite, tinted } from './art.ts'
import { drawText, measure, wrapText, type FontName } from './font.ts'
import { drawerOpen } from './drawer.ts'
import { panelEscapes } from './panels.ts'
import { fichePinned } from './fiche.ts'
import { lang, setLang } from './lang.ts'
import { resetTips } from './tips.ts'
import { land, progress } from './motion.ts'
import { onPref, pref, setPref, still, type Prefs } from './prefs.ts'
import * as sfx from './sound.ts'

type P = { x: number; y: number }
type Hit = { x: number; y: number; w: number; h: number; act: () => void; drag?: (x: number) => void }
type Tab = 'sound' | 'game' | 'display' | 'access' | 'keys' | 'credits'
type Volume = 'master' | 'music' | 'sfx' | 'ambience' | 'post'
type Control =
  | { kind: 'slider'; key: Volume }
  | { kind: 'choice'; options: [string, unknown][]; get: () => unknown; set: (v: never) => void }
  | { kind: 'button'; label: string; act: () => void; done?: string }
type Row = { label: string; help: string; control: Control }
type Ink = { face: string; plinth: string; label: string }

export type PauseHooks = {
  inRun: () => boolean
  abandon: () => void
  firstRun: () => void
  escBusy: () => boolean // the scene has its own use for Esc right now (the scratch ticket)
}

const W = 640
const H = 360
const BOX = { x: 84, y: 16, w: 472, h: 328 }
const RAIL = 9 // the leather rail around the felt
const NAV = { x: BOX.x + 18, y: BOX.y + 44, w: 108 }
const BODY = { x: BOX.x + 152, y: BOX.y + 46, w: BOX.w - 152 - 20 }
const CONTROL_X = BODY.x + 106
const ROW_H = 18
const HEAD_H = 13
const PITCH = 28 // a tab ticket: 24 face + 3 plinth + 1 air
const RECEIPT = { y: BOX.y + BOX.h - RAIL - 38, h: 30 }

const INK = '#1c1513'
const OUTLINE = '#0e0b0a'
const CREAM = '#f6ecd2'
const PAPER = '#e3d2a8'
const TAN = '#bfa77e'
const GOLD = '#e8c260'
const FELT_LO = '#0f2a20'
const FELT_HI = '#1f5a46'

// the bet tickets' colors (READABILITY.md §4). gold is what's chosen, blue goes back to play, red loses the run
const OFF: Ink = { face: '#5c4a36', plinth: '#1c1513', label: PAPER }
const LIT: Ink = { face: '#8c7656', plinth: '#2a2010', label: CREAM }
const ON: Ink = { face: '#c99a3a', plinth: '#3d2a10', label: INK }
const PLAY: Ink = { face: '#3e66a0', plinth: '#0f1d33', label: CREAM }
const LOSE: Ink = { face: '#a82a38', plinth: '#2a0910', label: CREAM }

const TABS: [Tab, string][] = [['sound', 'Sound'], ['game', 'Game'], ['display', 'Display'], ['access', 'Access'], ['keys', 'Keys'], ['credits', 'Credits']]

let hooks: PauseHooks | null = null
let open = false
let tab: Tab = 'sound'
let openedAt = 0
let tabAt = 0
let hits: Hit[] = []
let help = ''
let armed: { id: string; t: number } | null = null // a tap-twice button waiting for its second tap
let done: { id: string; t: number } | null = null // a button that just did its thing says so for a moment
let held = false
let dragging: ((x: number) => void) | null = null
let wasHeld = false
const pops = new Map<string, number>() // a stub that was just chosen bounces once
let felt: CanvasPattern | null = null

export function setPauseHooks(h: PauseHooks): void {
  hooks = h
}

export const pauseOpen = () => open

export function openPause(): void {
  if (open) return
  open = true
  openedAt = performance.now()
  tabAt = openedAt
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

// a string in a tab's list is a section head
const onOff = (key: keyof Prefs, label: string, help: string): Row => ({
  label, help,
  control: { kind: 'choice', options: [['On', true], ['Off', false]], get: () => pref(key), set: v => setPref(key, v) },
})
const choice = <K extends keyof Prefs>(key: K, label: string, help: string, options: [string, Prefs[K]][]): Row => ({
  label, help, control: { kind: 'choice', options, get: () => pref(key), set: (v: Prefs[K]) => setPref(key, v) },
})
const slider = (key: Volume, label: string, help: string): Row => ({ label, help, control: { kind: 'slider', key } })

function rows(t: Tab): (Row | string)[] {
  if (t === 'sound') return [
    'Volume',
    slider('master', 'Master', 'Everything at once.'),
    slider('music', 'Music', 'Gnossienne Flambée, the house band.'),
    slider('sfx', 'Effects', 'Cards, chips, paper, the count-up.'),
    slider('ambience', 'Room', 'The room tone: the murmur, the lamp, the tabac clock.'),
    'Switches',
    onOff('muted', 'Mute', 'M mutes and unmutes anywhere.'),
    onOff('bgMute', 'Mute when away', 'Silent while the game tab is hidden.'),
    onOff('blips', 'Voices', 'The little blips when someone talks.'),
  ]
  if (t === 'game') return [
    'Pace',
    choice('speed', 'Game speed', 'How fast the count-up, the tally and the rival play out.', [['1×', 1], ['1.5×', 1.5], ['2×', 2], ['3×', 3]]),
    choice('countUp', 'Count-up', 'Skip jumps straight to the Appraisal. Space or a click skips one any time.', [['Watch', 'watch'], ['Skip', 'skip']]),
    choice('confirm', 'Confirm bets', 'Max (and Flamber) need a second press, so a stray click can’t end a run.', [['Off', 'off'], ['Max', 'max'], ['Max + Flamber', 'both']]),
    'Table',
    choice('sort', 'Hand order', 'How your hand fans out. The sort chip by the hand changes it too.', [['Rank', 'rank'], ['Suit', 'suit']]),
    onOff('preview', 'Hand preview', 'Your plate shows what the picked cards make before you play.'),
    { label: 'Language', help: 'English or French. French words stay as names either way.', control: { kind: 'choice', options: [['EN', 'en'], ['FR', 'fr']], get: lang, set: (v: 'en' | 'fr') => setLang(v) } },
    onOff('glint', 'French glint', 'The gilt shimmer that crosses French words.'),
    'Help',
    onOff('tips', 'Tips', 'A pinned line the first time something can be used.'),
    { label: 'Tips again', help: 'Forget every tip already seen, for a new player on this browser.', control: { kind: 'button', label: 'Reset', act: resetTips, done: 'Done' } },
    choice('fiche', 'Fiche on hover', 'How fast the description box comes up.', [['Instant', 'instant'], ['Short', 'short'], ['Slow', 'slow']]),
  ]
  if (t === 'display') return [
    'Screen',
    { label: 'Fullscreen', help: 'F toggles it anywhere.', control: { kind: 'choice', options: [['On', true], ['Off', false]], get: () => !!document.fullscreenElement, set: (v: boolean) => { if (v !== !!document.fullscreenElement) toggleFullscreen() } } },
    choice('scale', 'Pixels', 'Crisp keeps every pixel square, with a border. Fill uses the whole screen.', [['Crisp', 'crisp'], ['Fill', 'fill']]),
    choice('fps', 'Frame rate', 'Saver drops to 30, and 15 when you leave it alone. Easier on a battery.', [['60', 60], ['30', 30], ['Saver', 'saver']]),
    onOff('cursor', 'Pixel cursor', 'The drawn arrow and hand, or your system cursor.'),
    'Effects',
    slider('post', 'Atmosphere', 'Vignette, smoke and light leaks.'),
    choice('shake', 'Screen shake', 'Pack rips, big flambés, the K.O. hit.', [['Off', 'off'], ['Low', 'low'], ['Full', 'full']]),
  ]
  if (t === 'access') return [
    'Motion',
    choice('motion', 'Reduce motion', 'No shake, drift or flourishes. Auto follows your system setting.', [['Auto', 'auto'], ['On', 'on'], ['Off', 'off']]),
    onOff('calmFlash', 'Calm flashes', 'Softens the bright bursts: god pulls, the Grail, the lamp flare.'),
    'Reading',
    onOff('fourColor', 'Four-color suits', '♥ burgundy, ♦ brass, ♣ green, ♠ ink. A flush reads at a glance.'),
    onOff('contrast', 'High contrast', 'Faded ink goes dark, light text gets an outline.'),
    onOff('bigFiche', 'Large Fiche', 'The description box at double size.'),
  ]
  return []
}

const KEYS: [string[], string][] = [
  [['Esc'], 'Pause, or close what’s open'],
  [['Space', 'Enter'], 'The gold ticket, or skip a beat'],
  [['1', '2', '3', '4'], 'The tickets, top to bottom'],
  [['D', 'B', 'S', 'V', '?'], 'Deck, binder, sleeve, vitrine, rules'],
  [['M'], 'Mute'],
  [['F'], 'Fullscreen'],
  [['R-click'], 'Pin a Fiche (or hold the mouse)'],
  [['Up', 'Down'], 'On the title: walk between floors'],
]

const CREDITS: [string, string[]][] = [
  ['Music', ['Gnossienne Flambée, after Erik Satie’s', 'Gnossienne No. 1 (public domain).']],
  ['Sound', ['CC0 packs by Kenney, rubberduck, starninjas,', 'antumdeluge, pyranostudios, cassie-orbitgames', 'and frosty-ham, from OpenGameArt.']],
  ['Art and fonts', ['Drawn for the game.']],
]

// ---------- drawing ----------

function hit(x: number, y: number, w: number, h: number, act: () => void, mouse: P, drag?: (x: number) => void): boolean {
  hits.push({ x, y, w, h, act, drag })
  return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h
}

const over = (mouse: P, x: number, y: number, w: number, h: number) => mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h

// cream labels on a colored face get the ink outline, like the bet tickets
const outlined = (c: Ink) => (c.label === INK ? undefined : OUTLINE)

// a plinth with a cream rim, the hover cue every ticket in the game uses
function rim(g: CanvasRenderingContext2D, name: string, x: number, y: number, w: number, h: number): void {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) nineSlice(g, name, x + dx, y + dy, w, h, CREAM)
}

// a full bet ticket, 24 + 3 plinth tall: the tabs and the ways out
function ticket(g: CanvasRenderingContext2D, x: number, y: number, w: number, c: Ink, label: string, lit: boolean, icon?: string): void {
  const gap = lit ? 4 : 3
  const fy = y + 3 - gap
  nineSlice(g, 'hud/ticket/plinth', x, y + 3, w, 24, c.plinth)
  if (lit) rim(g, 'hud/ticket/plinth', x, fy, w, 24)
  nineSlice(g, 'hud/ticket/face', x, fy, w, 24, c.face)
  g.fillStyle = 'rgba(255,255,255,0.3)'
  g.fillRect(x + 1, fy + 1, w - 2, 1)
  let lx = x + 11
  if (icon) {
    g.drawImage(tinted(`icon/pause/${icon}`, c.label), lx, fy + 7)
    lx += 13
  }
  // a long label drops to the plain face instead of spilling past the notch
  const font: FontName = measure(label, 'chalk', true) <= x + w - 6 - lx ? 'chalk' : 'sans'
  drawText(g, label, lx, fy + (font === 'chalk' ? 5 : 7), { font, color: c.label, bold: true, outline: outlined(c) })
}

// the ticket cut down to a 13 px stub: every choice, toggle and small button
function stub(g: CanvasRenderingContext2D, x: number, y: number, w: number, c: Ink, label: string, lit: boolean, pop = 1): void {
  const gap = lit ? 2 : 1
  const fy = y + 2 - gap
  g.save()
  if (pop !== 1) {
    g.translate(x + w / 2, y + 7)
    g.scale(pop, pop)
    g.translate(-(x + w / 2), -(y + 7))
  }
  nineSlice(g, 'hud/stub/plinth', x, y + 2, w, 13, c.plinth)
  if (lit) rim(g, 'hud/stub/plinth', x, fy, w, 13)
  nineSlice(g, 'hud/stub/face', x, fy, w, 13, c.face)
  drawText(g, label, x + 5 + (w - 5) / 2, fy + 2, { font: 'sans', color: c.label, bold: c === ON, align: 'center' })
  g.restore()
}

// the scale a stub bounces through right after it's chosen
function popAt(id: string): number {
  const t = pops.get(id)
  if (t === undefined || still.matches) return 1
  const age = performance.now() - t
  if (age > 360) {
    pops.delete(id)
    return 1
  }
  return 1 + 0.16 * Math.exp(-age / 70) * Math.cos(age / 40)
}

// the slider: a jeton riding a groove in the felt, brass behind it, the value on a price chip
function jetonSlider(g: CanvasRenderingContext2D, key: Volume, x: number, y: number, mouse: P): void {
  const n = 10
  const w = 120
  const gy = y + 4
  const at = (px: number) => Math.round(Math.max(0, Math.min(1, (px - x) / w)) * n) / n
  const set = (px: number) => {
    const v = at(px)
    if (v !== pref(key)) {
      setPref(key, v)
      sfx.tick(Math.round(v * n))
    }
  }
  const lit = hit(x - 8, y - 2, w + 16, ROW_H, () => set(mouse.x), mouse, set)
  const v = pref(key)
  const kx = x + Math.round(v * w)
  nineSlice(g, 'pause/groove', x - 3, gy, w + 6, 7)
  if (kx > x) {
    g.fillStyle = '#9c7028'
    g.fillRect(x - 1, gy + 2, kx - x + 1, 3)
    g.fillStyle = '#c99a3a'
    g.fillRect(x - 1, gy + 2, kx - x + 1, 2)
    g.fillStyle = GOLD
    g.fillRect(x - 1, gy + 2, kx - x + 1, 1)
  }
  // a notch every tenth, longer at the ends and the middle
  g.fillStyle = FELT_HI
  for (let i = 0; i <= n; i++) g.fillRect(x + (i * w) / n, gy + 8, 1, i % 5 ? 1 : 2)
  const lift = lit || dragging ? 1 : 0
  blit(g, 'pause/knob', kx - 6, gy - 3 - lift)
  const label = `${Math.round(v * 100)}`
  const cw = 26
  nineSlice(g, 'hud/ticket/chip', x + w + 14, y + 1, cw, 13)
  drawText(g, label, x + w + 14 + cw / 2, y + 2, { font: 'sans', color: INK, align: 'center' })
}

function row(g: CanvasRenderingContext2D, r: Row, y: number, mouse: P, id: string): void {
  const hovered = over(mouse, BODY.x - 6, y - 2, BODY.w + 6, ROW_H - 1)
  if (hovered) {
    help = r.help
    // a gold pip and a lighter band of felt under the row you're on
    g.fillStyle = 'rgba(232,194,96,0.08)'
    g.fillRect(BODY.x - 6, y - 2, BODY.w + 6, ROW_H - 1)
    g.fillStyle = GOLD
    g.fillRect(BODY.x - 6, y + 2, 2, 7)
  }
  drawText(g, r.label, BODY.x, y + 2, { font: 'sans', color: hovered ? CREAM : PAPER, outline: OUTLINE })
  const c = r.control
  if (c.kind === 'slider') return jetonSlider(g, c.key, CONTROL_X, y, mouse)
  if (c.kind === 'button') {
    const said = done?.id === id && performance.now() - done.t < 1500
    const w = Math.max(measure(c.label, 'sans', true), measure(c.done ?? '', 'sans', true)) + 16
    const lit = hit(CONTROL_X, y, w, 15, () => {
      c.act()
      done = { id, t: performance.now() }
      pops.set(id, performance.now())
      sfx.stamp()
    }, mouse)
    stub(g, CONTROL_X, y, w, said ? ON : lit ? LIT : OFF, said ? c.done ?? c.label : c.label, lit && !said, popAt(id))
    return
  }
  // every stub in a row is as wide as its widest label, so a row reads as one set, unless that runs off the page
  const natural = c.options.map(([label]) => measure(label, 'sans', true) + 16)
  const even = Math.max(...natural)
  const widths = even * natural.length + 4 * (natural.length - 1) <= BODY.x + BODY.w - CONTROL_X ? natural.map(() => even) : natural
  const now = c.get()
  let x = CONTROL_X
  c.options.forEach(([label, value], i) => {
    const w = widths[i]
    const key = `${id}:${i}`
    const on = now === value
    const lit = hit(x, y, w, 15, () => {
      if (c.get() === value) return
      ;(c.set as (v: unknown) => void)(value)
      pops.set(key, performance.now())
      sfx.stamp()
    }, mouse) && !on
    stub(g, x, y, w, on ? ON : lit ? LIT : OFF, label, lit, popAt(key))
    x += w + 4
  })
}

// a small caps line over a group of rows, with a rule running off to the right
function head(g: CanvasRenderingContext2D, label: string, y: number): void {
  const text = label.toUpperCase()
  drawText(g, text, BODY.x, y + 2, { font: 'tiny', color: TAN, outline: OUTLINE })
  const x = BODY.x + measure(text, 'tiny') + 6
  g.fillStyle = FELT_LO
  g.fillRect(x, y + 5, BODY.x + BODY.w - x, 1)
  g.fillStyle = FELT_HI
  g.fillRect(x, y + 6, BODY.x + BODY.w - x, 1)
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

// a nav ticket down the left. the open tab slides out toward the page it opens
function navTicket(g: CanvasRenderingContext2D, label: string, y: number, c: Ink, mouse: P, act: () => void, say?: string, icon?: string, out = 0): void {
  const lit = hit(NAV.x, y - 1, NAV.w + out, PITCH - 1, act, mouse) && !out
  if (lit && say) help = say
  ticket(g, NAV.x + out, y, NAV.w, c, label, lit, icon)
}

// the felt bed, the lamp over it and the rail's studs
function table(g: CanvasRenderingContext2D): void {
  nineSlice(g, 'pause/panel', BOX.x, BOX.y, BOX.w, BOX.h)
  const fx = BOX.x + RAIL + 1
  const fy = BOX.y + RAIL + 2
  const fw = BOX.w - 2 * RAIL - 2
  const fh = BOX.h - 2 * RAIL - 3
  felt ??= g.createPattern(partCanvas('pause/felt'), 'repeat')
  g.save()
  g.translate(fx, fy)
  g.fillStyle = felt!
  g.fillRect(0, 0, fw, fh)
  g.restore()
  // light from a lamp above the middle, the edges falling off into shadow
  const lamp = g.createRadialGradient(BOX.x + BOX.w / 2, BOX.y + 70, 10, BOX.x + BOX.w / 2, BOX.y + 120, 300)
  lamp.addColorStop(0, 'rgba(255,224,138,0.13)')
  lamp.addColorStop(0.5, 'rgba(255,224,138,0.03)')
  lamp.addColorStop(1, 'rgba(14,11,10,0.38)')
  g.fillStyle = lamp
  g.fillRect(fx, fy, fw, fh)
  // the rail's shadow on the felt
  g.fillStyle = 'rgba(14,11,10,0.35)'
  g.fillRect(fx, fy, fw, 3)
  g.fillRect(fx, fy, 2, fh)
  // brass studs along the rail
  for (let x = BOX.x + 30; x < BOX.x + BOX.w - 30; x += 24) {
    blit(g, 'pause/stud', x, BOX.y + 2)
    blit(g, 'pause/stud', x, BOX.y + BOX.h - 7)
  }
  for (let y = BOX.y + 30; y < BOX.y + BOX.h - 30; y += 24) {
    blit(g, 'pause/stud', BOX.x + 2, y)
    blit(g, 'pause/stud', BOX.x + BOX.w - 7, y)
  }
}

function keysPage(g: CanvasRenderingContext2D): void {
  head(g, 'Keys', BODY.y)
  KEYS.forEach(([caps, what], i) => {
    const y = BODY.y + HEAD_H + i * 22
    let x = BODY.x
    caps.forEach((k, j) => {
      if (j) {
        drawText(g, caps.length > 2 ? '' : '/', x + 1, y + 3, { font: 'sans', color: TAN, outline: OUTLINE })
        x += caps.length > 2 ? 2 : 9
      }
      const w = Math.max(13, measure(k, 'sans', true) + 8)
      nineSlice(g, 'pause/key', x, y, w, 15)
      drawText(g, k, x + w / 2, y + 2, { font: 'sans', color: INK, bold: true, align: 'center' })
      x += w
    })
    drawText(g, what, BODY.x + 98, y + 3, { font: 'sans', color: PAPER, outline: OUTLINE })
  })
}

function creditsPage(g: CanvasRenderingContext2D): void {
  const cx = BODY.x + BODY.w / 2
  drawText(g, 'Flambeur', cx, BODY.y, { font: 'didone', color: GOLD, align: 'center', outline: OUTLINE })
  drawText(g, 'by Evan Hoddinott · KSU AI Club Hackathon, Nov 2026', cx, BODY.y + 24, { font: 'sans', color: PAPER, align: 'center', outline: OUTLINE })
  let y = BODY.y + 44
  for (const [title, lines] of CREDITS) {
    head(g, title, y)
    y += HEAD_H
    for (const line of lines) {
      drawText(g, line, BODY.x, y, { font: 'sans', color: PAPER, outline: OUTLINE })
      y += 11
    }
    y += 6
  }
  drawText(g, 'Merci d’avoir joué.', cx, y + 4, { font: 'chalk', bold: true, color: GOLD, align: 'center', outline: OUTLINE })
}

// call last in a frame, in stage units (640×360)
export function drawPause(g: CanvasRenderingContext2D, mouse: P): void {
  hits = []
  if (!open) return
  const t = performance.now()
  const u = progress(t - openedAt, 260)
  // the scrim covers the whole canvas, past the stage's edges where the carnet peeks out
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = `rgba(14,11,10,${0.66 * Math.min(1, u * 1.6)})`
  g.fillRect(0, 0, g.canvas.width, g.canvas.height)
  g.restore()
  g.save()
  // the table slides up and settles with a little overshoot
  if (!still.matches) g.translate(0, Math.round((1 - land(u)) * 40))
  // the scrim eats every click off the sheet: clicking outside closes it
  hits.push({ x: 0, y: 0, w: W, h: H, act: closePause })
  hits.push({ x: BOX.x, y: BOX.y, w: BOX.w, h: BOX.h, act: () => {} })
  table(g)

  const inRun = !!hooks?.inRun()
  const title = inRun ? 'Pause' : 'Réglages'
  drawText(g, title, BOX.x + BOX.w / 2, BOX.y + RAIL + 5, { font: 'didone', color: GOLD, align: 'center', outline: OUTLINE })
  const fl = sprite('pause/flourish')
  blit(g, 'pause/flourish', Math.round(BOX.x + BOX.w / 2 - fl.w / 2), BOX.y + RAIL + 25)
  // the seam between the tickets and the page, cut into the felt
  const seam = NAV.x + NAV.w + 14
  g.fillStyle = FELT_LO
  g.fillRect(seam, NAV.y, 1, BOX.y + BOX.h - RAIL - 12 - NAV.y)
  g.fillStyle = FELT_HI
  g.fillRect(seam + 1, NAV.y, 1, BOX.y + BOX.h - RAIL - 12 - NAV.y)

  help = ''
  TABS.forEach(([id, label], i) => {
    const on = tab === id
    navTicket(g, label, NAV.y + i * PITCH, on ? ON : OFF, mouse, () => {
      if (tab === id) return
      sfx.page()
      tab = id
      tabAt = performance.now()
    }, undefined, id, on ? 8 : 0)
  })
  // the foot of the nav: back to the game, and the run's ways out
  let y = BOX.y + BOX.h - RAIL - 12 - PITCH
  navTicket(g, inRun ? 'Resume' : 'Close', y, PLAY, mouse, closePause, inRun ? 'Back to the table. Esc does it too.' : 'Back to the title. Esc does it too.')
  y -= PITCH
  if (inRun) {
    const go = twice('abandon', () => { closePause(); hooks?.abandon() })
    navTicket(g, isArmed('abandon') ? 'Sure? Again' : 'Abandon run', y, LOSE, mouse, go, 'Back to the title. This run is lost.')
    y -= PITCH
  }
  const first = inRun ? twice('first', () => { closePause(); hooks?.firstRun() }) : () => { closePause(); hooks?.firstRun() }
  navTicket(g, isArmed('first') ? 'Sure? Again' : 'Tutoriel', y, OFF, mouse, first, `La fée verte walks you through a run, start to finish.${inRun ? ' This run is lost.' : ''}`)

  // the page eases in a few pixels each time the tab changes
  g.save()
  const v = still.matches ? 1 : progress(t - tabAt, 160)
  g.globalAlpha = v
  g.translate(Math.round((1 - v) * 6), 0)
  if (tab === 'keys') keysPage(g)
  else if (tab === 'credits') creditsPage(g)
  else {
    let ry = BODY.y
    for (const r of rows(tab)) {
      if (typeof r === 'string') {
        if (ry > BODY.y) ry += 3
        head(g, r, ry)
        ry += HEAD_H
      } else {
        row(g, r, ry, mouse, `${tab}:${ry}`)
        ry += ROW_H
      }
    }
  }
  g.restore()

  // the hovered row's one line, printed on a receipt along the foot of the page
  const rx = BODY.x - 6
  const rw = BODY.w + 6
  const say = help || (tab === 'keys' || tab === 'credits' ? '' : 'Point at a setting to see what it does.')
  if (say) {
    nineSlice(g, 'fx/receipt', rx, RECEIPT.y, rw, RECEIPT.h)
    const lines = wrapText(say, rw - 16, 'sans').slice(0, 2)
    lines.forEach((l, i) => drawText(g, l, rx + 8, RECEIPT.y + (lines.length > 1 ? 4 : 9) + i * 10, { font: 'sans', color: help ? INK : '#8c7656' }))
  }
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
// a stub ticket hanging off the top edge, over the run strip, for a mouse or a finger with no Esc key

// w waits for the fonts: measured when a scene first asks
export const PAUSE_TAB = { x: 8, y: 0, get w() { return pauseTabW('Pause') }, h: 15 }

export const pauseTabW = (label: string) => measure(label, 'sans', true) + 24

export function pauseTab(g: CanvasRenderingContext2D, lit: boolean, x = PAUSE_TAB.x, label = 'Pause'): void {
  const w = pauseTabW(label)
  const y = lit ? -1 : -2
  const c = lit ? LIT : OFF
  nineSlice(g, 'hud/stub/plinth', x, y + 2, w, 13, c.plinth)
  if (lit) rim(g, 'hud/stub/plinth', x, y, w, 13)
  nineSlice(g, 'hud/stub/face', x, y, w, 13, c.face)
  // the pause bars
  g.fillStyle = c.label
  g.fillRect(x + 8, y + 4, 2, 6)
  g.fillRect(x + 11, y + 4, 2, 6)
  drawText(g, label, x + 16, y + 2, { font: 'sans', color: c.label, bold: true })
}
