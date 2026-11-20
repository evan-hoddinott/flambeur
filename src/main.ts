// the game ui. the table is the pixel art duel scene (ui/duel.ts), the shop is the tabac (ui/shop.ts),
// the draft, starter box and results are panels on the bare duel table, the shop's pack, binder and grading are panels in the tabac.
// it renders only from a SeatView: offline it runs step() itself, online the server does and sends the view over net.ts
import { JOKERS, SUITS, SUIT_GLYPH, sellPrice as cardSellPrice, cardName, rankLabel, stuckMate, type Card, type Trait } from './engine/cards.ts'
import { describe, getDef } from './engine/collectibles.ts'
import { COLLECTIBLE_PRICE, SHIPPERS, SLEEVE_SLOTS, tableOf, type Shipper } from './engine/economy.ts'
import { DRAFT_PICKS, autoDraft, getStarter, type StarterId } from './engine/starters.ts'
import { HAND_NAMES } from './engine/hands.ts'
import { randomSeed } from './engine/rng.ts'
import { autoKeep, forgePlan, type ForgePlan } from './engine/forge.ts'
import { getRival } from './engine/rivals.ts'
import {
  DIFFICULTIES, bestPlay, botAction, canGrade, defaultToDeck, legal, newMatch, pending, problem, step, view,
  type Action, type BetChoice, type Difficulty, type Event, type Match, type SeatView, type StepResult,
} from './engine/match.ts'
import { api, connect, type PlayerInfo, type ServerMsg, type Status } from './net.ts'
import type { Appraisal } from './engine/scoring.ts'
import { INSERTS, type SleeveCard } from './engine/shop.ts'
import { KEYWORDS, entry, glossaryIds, traitEntry, type Entry, type Kind } from './engine/glossary.ts'
import { stonksMult } from './engine/sleeves.ts'
import { progress, land, mix, juiceAt, still, whipPan } from './ui/motion.ts'
import { heldCard } from './ui/held.ts'
import * as sfx from './ui/sound.ts'
import * as music from './ui/music.ts'
import { loadArt, faceCanvas, backCanvas, stockScale, tinted } from './ui/art.ts'
import { cardInk } from './ui/ink.ts'
import { loadFonts, measure, plainText, wrapText } from './ui/font.ts'
import { loadLogo } from './ui/logo.ts'
import { loadTitle, panTo, showTitle, type TitleOnline } from './ui/title.ts'
import { albumSeen, ALBUM_SETS, recordPull } from './ui/album.ts'
import { spoilPicked } from './ui/spoils.ts'
import { CARD_LESSONS, flambeBusy, showBareTable, rivalBusted, showDuel, insertUsed, countUp as duelCountUp, resetScene as resetDuel, type HandSort, type Slip } from './ui/duel.ts'
import { lottoOpen, showShop, shelfCenter, gradingReturn, clearGradingReturn, dropCigarette, shopInsertUsed, keeperSays, resetScene as resetShop, type Scratch } from './ui/shop.ts'
import { setPanel, grid, paged, fit, CARD_H, type Panel, type Ui } from './ui/panels.ts'
import { closeCompare, closeDrawer, openDrawer, setCompareHover, setDrawerActions, setGlossary, type Compare } from './ui/drawer.ts'
import { setKeywords } from './ui/fiche.ts'
import { guiding, markSeen, resetTips, setGuide, tip } from './ui/tips.ts'
import { announce, bandShowing, type Tone } from './ui/frame.ts'
import { onPref, pace, pref, setPref, shake as shakeAmount } from './ui/prefs.ts'
import { pauseOpen, setPauseHooks } from './ui/pause.ts'
import { twistName } from './engine/twists.ts'

const app = document.getElementById('app') as HTMLElement
const ME = 0

// ---------- state ----------
let match: Match | null = null // offline only
let online: { view: SeatView; deadlines: (number | null)[] } | null = null // the server's latest view, while in an online match
let net: ReturnType<typeof connect> | null = null
let player: PlayerInfo | null | undefined // undefined = haven't heard from the server (or it's down)
let netStatus: Status = 'offline'
let room: string | null = null // a room I made, waiting for a friend
let joinCode = location.pathname.match(/^\/r\/([A-Z]+)$/i)?.[1]?.toUpperCase() ?? null // came in on a room link
let notice = '' // last server message for the title screen
let difficulty: Difficulty = 'medium'
let best = { total: 0, hand: '' }
let busy = false // true while bots act or animations run, so clicks don't double-fire
let counting = false // meters start at 0 while the count-up runs
// ui-only state. never game state: that all lives in the match
let selected = new Set<number>()
let pack: ReturnType<typeof newRip> | null = null
let packShelfX = 320
let log: string[] = []
let scratchShow: Scratch | null = null // a scratcher being rubbed in the shop scene, the card pick waits for it
let scratchKey = 0
let buySlot = -1 // the shelf slot of the last buy, so a scratcher grows out of where it sat
let resultHold = false // keep showing the revealed hand until "continue"
let tallyHold = false // and that reveal ended the round: its money tally shows too
let toCount = false // a fresh reveal waiting for its count-up
let insertSlot: number | null = null // the Sleeve slot picked up during a deal
let grindPick = false // flamber with no pair: waiting for the card that gets +1 Value
let patronMissed = false
let patronPaid: number | null = null // le patron just collected this at the big shop door
let lastLocked: Card[] = [] // my locked cards, so a flambé result can still show them
let handSort: HandSort = pref('sort') // how your hand fans out. display only, the engine's order never changes
let overflowOpened = false // the Sleeve already popped open for the insert waiting on room
let docked: Compare | null = null // this render's compare dock, set by the screen that offers a choice
let announced = new Set<string>() // band callouts already made this run, so a redraw doesn't repeat one

const rule = (kind: Kind, id: string, line = 0, ctx?: unknown) => plainText(entry(kind, id, ctx).text[line])
const fmt = (n: number) => n.toLocaleString('en-US')

// zone F, once per key per run. these belong to the phase on screen, so they only queue when the band is free:
// queued behind another callout they'd land after the phase is over. a later render of the same phase tries again
function announceOnce(key: string, fr: string, en: string, tone: Tone = 'plain'): void {
  if (announced.has(key) || bandShowing()) return
  announced.add(key)
  announce(fr, en, tone)
}
const v = (): SeatView => online?.view ?? view(match!, ME)
const mySeat = () => v().me.seat

// greys out buttons. offline it's the engine's own check. online the server has the full state, so this only rules out
// what the view already shows can't work, and the server rejects the rest
function can(a: Action): boolean {
  if (match) return problem(match, ME, a) === null
  const me = v().me
  const shop = me.shop
  if (a.type === 'buy') return !!shop && !shop.offers[a.slot].sold && shop.offers[a.slot].price <= me.bankroll
  if (a.type === 'restock') return !!shop && shop.restockPrice <= me.bankroll
  if (a.type === 'binBulk') return !!shop && shop.bulkInDeck > 0 && shop.bulkPrice <= me.bankroll
  if (a.type === 'sell') {
    const card = me.binder.find(c => c.id === a.cardId)
    return !!card && !(v().keeper.includes('superstitious') && card.suit === 'S')
  }
  if (a.type === 'ship') {
    const card = [...me.pile, ...me.discard, ...me.binder].find(c => c.id === a.cardId)
    return !!shop && !shop.shipped && !me.shipping && !!card && canGrade(card) && SHIPPERS[a.shipper].price < me.bankroll
  }
  return true
}

// ---------- driving the match ----------

// dev only: the trailer recorder (trailer/record.ts) sets window.__trail and reads my actions and events off it, timed
const trail = import.meta.env.DEV ? (window as { __trail?: unknown[] }).__trail : undefined

// my action, then the bots catch up. bets get a pause so you can watch the rival decide.
// online it just goes to the server, and busy clears on its ok or reject
async function dispatch(action: Action): Promise<void> {
  if (busy) return
  trail?.push({ t: performance.now(), action })
  armed = null // any move disarms a waiting Sure?
  if (action.type === 'buy') buySlot = action.slot
  if (online) {
    // false = socket not open. the click is dropped and the reconnect brings a fresh view
    if (net!.act(action)) busy = true
    else { resetPendingMotion(); render() }
    return
  }
  if (!match) return
  busy = true
  try {
    const before = action.type === 'spoils' ? v() : null
    const res = step(match, ME, action)
    if (before && action.type === 'spoils') spoilPicked(before, action.cardId, !!before.spoils?.picks.length)
    match = res.match
    onEvents(res.events.filter(e => e.to === ME || e.to === 'all').map(e => e.event))
    if (action.type === 'flamber' || action.type === 'forgeKeep') await burnt()
    await runBots()
  } finally {
    busy = false
  }
  render()
}

// a pause you can watch, or skip with a click, space or enter
let skipBeat: (() => void) | null = null
// your flambé burns the moment it locks (duel.ts). the rival's turn and the reveal wait for it, never more than 8s
// (a hidden tab stops drawing, so the burn would never end)
function burnt(): Promise<void> {
  render()
  const t0 = performance.now()
  return new Promise(done => {
    const poll = setInterval(() => {
      if (flambeBusy() && performance.now() - t0 < 8000) return
      clearInterval(poll)
      done()
    }, 50)
  })
}

function beat(ms: number): Promise<void> {
  ms /= pace()
  return new Promise(done => {
    const finish = () => {
      clearTimeout(timer)
      skipBeat = null
      done()
    }
    const timer = setTimeout(finish, ms)
    skipBeat = finish
  })
}
window.addEventListener('pointerdown', () => { if (!pauseOpen()) skipBeat?.() })
// the music starts on the first click or key (browsers need one), on the sfx context and its music bus
for (const ev of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(ev, () => void music.start(sfx.context() ?? undefined, sfx.musicBus() ?? undefined), { once: true })
}
window.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Enter') skipBeat?.()
})

// how long the rival sits on a decision, so it plays like a person across the table. a bet they open
// waits longer, so "Scaramouche bets first" has time to read. the shop and the draft stay instant
const THINK: Partial<Record<Action['type'], [number, number]>> = {
  play: [900, 1800], flamber: [1300, 2100], discard: [700, 1300], spoils: [800, 1500],
}

function thinkTime(action: Action, answering: boolean): number {
  if (action.type === 'bet') return (answering ? 700 : 1200) + Math.random() * 400
  const range = THINK[action.type]
  return range ? range[0] + Math.random() * (range[1] - range[0]) : 0
}

async function runBots(): Promise<void> {
  const id = run
  for (;;) {
    const m = match
    if (!m || id !== run || m.phase === 'over') return
    const bot = pending(m).find(s => s !== ME)
    // simultaneous phases: the bot goes once I'm done, so it never shops off what I just did
    if (bot === undefined || (pending(m).includes(ME) && m.phase !== 'bet')) return
    const action = botAction(m, bot)
    const betting = m.phase === 'bet' && action.type === 'bet'
    const think = thinkTime(action, !!v().bet?.choices.length)
    if (think) {
      render()
      await beat(think)
      if (id !== run) return // abandoned while the rival thought
    }
    const dealing = m.phase === 'shop'
    const before = action.type === 'spoils' ? v() : null
    const res = step(m, bot, action)
    if (before && action.type === 'spoils') spoilPicked(before, action.cardId, !!before.spoils?.picks.length)
    match = res.match
    onEvents(res.events.filter(e => e.to === ME || e.to === 'all').map(e => e.event))
    if (dealing && match.phase === 'deal') log = [`Round ${match.round} · the rival has $${v().others[0].bankroll}.`]
    if (betting) {
      render()
      await beat(1000) // their ticket lands on the felt and sits a beat before anything else moves
      if (id !== run) return
    }
  }
}

function onEvents(events: Event[]): void {
  trail?.push({ t: performance.now(), events })
  for (const e of events) {
    if (e.kind === 'packOpened') pack = newRip(e.contents.cards)
    if (e.kind === 'showdown') {
      resultHold = true
      tallyHold = false
      toCount = true
      const mine = e.showdown.mine
      if (mine && mine.total > best.total) best = { total: mine.total, hand: handLabel(mine) }
    }
    if (e.kind === 'busted' && e.seat !== mySeat()) rivalBusted(e.seat)
    if (e.kind === 'roundEnd') {
      tallyHold = true
      const r = e.result
      if (r.outcome === 'loss' && r.margin < 0) log.push(`Lost round ${r.round} by ${fmt(-r.margin)}.`)
      else if (r.outcome === 'win') log.push(`Took round ${r.round}${r.ko ? ' by knockout' : ''}, by ${fmt(r.margin)}.`)
    }
    if (e.kind === 'patron' && e.seat === mySeat()) {
      patronMissed = !e.paid
      patronPaid = e.paid ? e.due : null
      if (e.paid) {
        announce('Le Patron est payé', 'You covered his marker', 'good')
        sfx.register()
      } else {
        announce('Impayé', "You couldn't cover Le Patron's marker", 'bad')
        sfx.denied()
      }
    }
    if (e.kind === 'rival' && e.seat !== mySeat()) {
      const r = getRival(e.rival)
      announce(`${r.name} s'installe`, `A new rival sits down: ${r.lane}`)
    }
    if (e.kind === 'insertUsed') {
      insertUsed(e.insert, e.cards)
      shopInsertUsed(e.insert, e.cards)
    }
    if (e.kind === 'insertUsed') log.push(`Used ${INSERTS[e.insert].name}${e.cards.length ? ` on ${e.cards.map(cardName).join(', ')}` : ''}.`)
    if (e.kind === 'scratched') {
      const what = e.hand ? `: ${HAND_NAMES[e.hand]} +1 level` : e.collectible ? `: ${getDef(e.collectible.id).name}` : e.joker ? `: ${JOKERS[e.joker.joker!].name} (${cardName(e.joker)})` : ', into your Sleeve'
      log.push(`Scratched a ${INSERTS[e.insert].name}${what}.`)
      const prize = e.hand ? `${HAND_NAMES[e.hand]} +1 level` : e.collectible ? getDef(e.collectible.id).name : e.joker ? `${JOKERS[e.joker.joker!].name} (${cardName(e.joker)})` : 'into your Sleeve'
      scratchShow = { key: ++scratchKey, insert: e.insert, prize, slot: buySlot }
    }
    if (e.kind === 'graded') gradingReturn(e.card)
    if (e.kind === 'graded') log.push(`Back from grading: ${cardName(e.card)} came back a ${e.card.grade}.`)
  }
}

// ---------- online ----------

function startNet(): void {
  if (net) return
  net = connect(onServer, s => {
    netStatus = s
    // an action in flight on a dead socket never gets its ok/reject
    if (s !== 'online') {
      busy = false
      resetPendingMotion()
    }
    if (s === 'online' && joinCode) {
      net!.joinRoom(joinCode)
      joinCode = null
      history.replaceState(null, '', '/')
    }
  })
}

function resetPendingMotion(): void {
  if (pack?.sent) { pack.sent = false; pack.doneAt = null }
  if (pickedBox?.sent) pickedBox = null
  sweepAt = null
}

function onServer(msg: ServerMsg): void {
  if (msg.t === 'view') return onView(msg.view, msg.deadlines, msg.events)
  if (msg.t === 'ok') {
    // the view this action made came first, while busy, so anything draw() wanted to send waited for this
    busy = false
    render()
  } else if (msg.t === 'error' && online && GONE.includes(msg.error)) {
    // the match ended and was swept, or another tab started a new daily over it
    busy = false
    notice = 'That match is over.'
    leaveOnline()
  } else if (msg.t === 'reject' || msg.t === 'error') {
    busy = false
    resetPendingMotion()
    const why = msg.t === 'reject' ? msg.reason : msg.error
    if (online) log.push(`Server said no: ${why}`)
    else notice = why
    render()
  } else if (msg.t === 'room') {
    room = msg.code
    render()
  } else if (msg.t === 'queued') {
    notice = 'Looking for someone to play…'
    render()
  } else if (msg.t === 'matched') {
    room = null
    notice = ''
  } else if (msg.t === 'restarting') {
    notice = 'Server is restarting, your match picks back up in a few seconds'
    if (online) log.push(notice)
    render()
  }
}

const GONE = ['no such live match', 'not your match', 'not in that match']

function onView(next: SeatView, deadlines: (number | null)[], events: Event[]): void {
  const prev = online?.view ?? null
  if (!prev) {
    // a fresh join: start clean. old events are already in the view, replaying them would rerun old count-ups
    match = null
    clearGradingReturn()
    receiptAt = null
    receiptLine = -1
    best = { total: 0, hand: '' }
    log = []
    resultHold = false
    tallyHold = false
    toCount = false
    pack = null
    selected = new Set()
    boxesAt = null
    pickedBox = null
    sweepAt = null
    boxesShown = 0
    tossedRow = null
  }
  online = { view: next, deadlines }
  const rival = next.others[0] // the rival's bets show up on the felt, from the view (duel.ts)
  if (prev && prev.phase !== 'deal' && next.phase === 'deal') log = [`Round ${next.round} · ${rival.name} has $${rival.bankroll}.`]
  if (prev?.spoils && next.spoils && next.spoils.picks.length > prev.spoils.picks.length) {
    spoilPicked(prev, next.spoils.picks.at(-1)?.card?.id ?? null, next.spoils.picks.length === 2)
  }
  if (prev) onEvents(events)
  // the rival's moves in a phase you both play at once only change `others`, which these screens don't show.
  // skipping the redraw keeps an open panel (draft picks, a pack sort) from resetting under you
  const quiet = prev && !events.length && ['draft', 'shop'].includes(next.phase)
    && JSON.stringify({ ...prev, others: null }) === JSON.stringify({ ...next, others: null })
  if (!quiet) render()
}

function leaveOnline(): void {
  online = null
  net?.forgetMatch()
  renderTitle()
}

// ---------- title + leaderboard ----------
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Score = { score: number; bankroll: number; won: boolean; best: number }

function leaderboard(seed: string, diff: Difficulty): Score[] {
  try {
    return JSON.parse(localStorage.getItem(`flambeur:lb:${seed}:${diff}`) ?? '[]')
  } catch {
    return []
  }
}

function saveScore(): void {
  const m = match!
  try {
    const lb = leaderboard(m.config.seed, difficulty)
    lb.push({ score: m.result!.scores[ME], bankroll: m.players[ME].bankroll, won: m.result!.winner === ME, best: best.total })
    lb.sort((a, b) => b.score - a.score)
    localStorage.setItem(`flambeur:lb:${m.config.seed}:${difficulty}`, JSON.stringify(lb.slice(0, 10)))
    localStorage.setItem(FIRST_DONE, '1')
  } catch {
    // private window etc, the leaderboard just doesn't persist
  }
}

let artReady = false // the title is drawn from the atlases, so it waits for them

// the title world (ui/title.ts): solo in the cellar, online in the sewers. it reads this state every frame,
// so re-rendering only swaps the state, the logo and the camera keep going
function renderTitle(): void {
  if (!artReady) return
  const daily = today()
  const name = DIFFICULTIES[difficulty].name
  showTitle(app, {
    diffs: (Object.keys(DIFFICULTIES) as Difficulty[]).map(d => ({
      label: `${DIFFICULTIES[d].name} ×${DIFFICULTIES[d].scoreMult}`,
      text: DIFFICULTIES[d].text,
      on: d === difficulty,
      pick: () => {
        difficulty = d
        renderTitle()
      },
    })),
    dailyLabel: `Daily run · ${daily}`,
    daily: () => startRun(daily),
    random: () => (firstRunDone() ? startRun(randomSeed()) : firstRun()),
    tutorial: firstRun,
    tutorialFirst: !firstRunDone(),
    playSeed: s => startRun(s.toUpperCase()),
    board: {
      title: `Today's leaderboard · ${name} (this browser)`,
      rows: leaderboard(daily, difficulty).map((e, i) => [`#${i + 1}`, `${fmt(e.score ?? 0)} pts`, `$${e.bankroll}`, e.won ? 'won' : 'lost', `best ${fmt(e.best)}`]),
      empty: 'No runs on today\'s seed yet.',
    },
    online: titleOnline(),
  })
}

// the sewers' half: sign in, then rooms, quick match, the online daily and the server boards
function titleOnline(): TitleOnline | null {
  if (player === undefined) return null
  const auth = async (path: string, body: object) => {
    try {
      player = (await api<{ player: PlayerInfo }>(path, body)).player
      notice = joinCode ? `Joining room ${joinCode}…` : ''
      startNet()
    } catch (err) {
      notice = (err as Error).message
    }
    renderTitle()
  }
  if (player === null) {
    return {
      signedIn: false,
      notice,
      guest: n => void auth('/api/guest', n ? { name: n } : {}),
      login: (n, password) => void auth('/api/login', { name: n, password }),
      signup: (n, password) => void auth('/api/signup', { name: n, password }),
    }
  }
  const me = player
  if (titleBoard?.difficulty !== difficulty) void loadTitleBoard()
  const rows = (list: BoardRow[]) => list.slice(0, 10).map((r, i) => [`#${i + 1}`, r.name, `${fmt(r.score)} pts`, r.attempts ? `${r.attempts} tr${r.attempts === 1 ? 'y' : 'ies'}` : ''])
  const name = DIFFICULTIES[difficulty].name
  const empty = 'Nobody yet. Be first.'
  return {
    signedIn: true,
    who: me.name,
    guest: me.kind === 'guest',
    status: () => netStatus,
    notice,
    room,
    dailyLabel: `Online daily · ${name}`,
    logout: async () => {
      await api('/api/logout', {})
      net?.close()
      net = null
      player = null
      room = null
      renderTitle()
    },
    makeRoom: () => net?.createRoom(),
    queue: () => net?.queue(),
    daily: () => net?.startDaily(difficulty),
    join: code => net?.joinRoom(code.toUpperCase()),
    keep: password => void auth('/api/signup', { name: me.name, password }),
    cancel: () => {
      net?.leave()
      room = null
      renderTitle()
    },
    boards: titleBoard?.difficulty === difficulty
      ? [{ title: `Online daily ${titleBoard.day} · ${name} · best run`, rows: rows(titleBoard.best), empty },
        { title: 'First try', rows: rows(titleBoard.first), empty }]
      : [],
  }
}

type BoardRow = { name: string; kind: string; score: number; attempts?: number }
type DailyBoard = { day: string; best: BoardRow[]; first: BoardRow[] }
let titleBoard: (DailyBoard & { difficulty: Difficulty }) | null = null
let boardLoading: Difficulty | null = null

// the server's daily board for the title, once per difficulty picked
async function loadTitleBoard(): Promise<void> {
  if (boardLoading === difficulty) return
  const d = difficulty
  boardLoading = d
  try {
    titleBoard = { ...await api<DailyBoard>(`/api/daily?difficulty=${d}`), difficulty: d }
  } catch (err) {
    console.warn('no daily board:', err)
    titleBoard = { day: '', best: [], first: [], difficulty: d } // don't refetch in a loop
  }
  boardLoading = null
  if (!match && !online) renderTitle()
}

// the first run of a visit goes fullscreen (a click started it, so the browser allows it). leave it and it stays left
let wentFullscreen = false

// every ui-only let back to how a fresh page has it, and the scenes' beats too. a pick, a sheet or a spotlight
// left over from the last run would point at cards that aren't there anymore (the tutorial soft lock)
function resetRunUi(): void {
  selected = new Set()
  pack = null
  packShelfX = 320
  log = []
  scratchShow = null
  resultHold = tallyHold = toCount = false
  insertSlot = null
  grindPick = false
  patronMissed = false
  patronPaid = null
  lastLocked = []
  buySlot = -1
  overflowOpened = false
  docked = null
  announced = new Set()
  boxesAt = null
  pickedBox = null
  dealAt = 0
  sweepAt = null
  boxesShown = 0
  tossedRow = null
  albumOpen = false
  gradeOpen = false
  gradeFrom = 'all'
  gradePage = 0
  shipper = 'poste'
  wishSlot = null
  wishPage = 0
  armed = null
  forgeKeepPicks = null
  dailyBoard = null
  boardAsked = false
  receiptAt = null
  receiptLine = -1
  lostQuip = ''
  lastPhase = null
  setGuide(false)
  setPanel(null)
  closeDrawer()
  resetShop()
  resetDuel()
}

// autoplay: the bot style that plays your seat (dev skips), false = you play
function startRun(seed: string, autoplay: string | false = false): void {
  if (!wentFullscreen && !QUICK && !autoplay && !document.fullscreenElement) {
    wentFullscreen = true
    void document.documentElement.requestFullscreen?.().catch(() => {})
  }
  run++
  resetRunUi()
  best = { total: 0, hand: '' }
  // dev only: ?quick&wild makes the rival bet at random, so flambés come up fast for testing
  const wild = QUICK && new URLSearchParams(location.search).has('wild') ? { style: 'random' } : {}
  match = newMatch({ mode: 'solo', seed, seats: [{ kind: 'human', name: 'You', ...(autoplay ? { style: autoplay } : {}) }, { kind: 'bot', name: 'Rival', difficulty, ...wild }] })
  render()
}

// the first run on this browser (docs/ONBOARDING.md #2): a seed found by sim/firstseed.ts, Classic with its rows
// drafted for you, an easy rival. it has a Pair in the first hand, a round 1 you can knock out and a Top Loader
// you can afford in the first shop. every system is live, it just starts kind. ?first plays it again
const FIRST_SEED = 'PREMIERE-17'
const FIRST_DONE = 'flambeur.firstRun'

function firstRunDone(): boolean {
  try {
    return localStorage.getItem(FIRST_DONE) === '1'
  } catch {
    return true
  }
}

// the pause menu's Abandon run: straight back to the title. bumping run stops a rival mid-thought or a count-up
// mid-way from carrying on into the next run
let run = 0
function abandonRun(): void {
  run++
  match = null
  busy = counting = false
  skipBeat = null
  resetRunUi()
  if (online) leaveOnline()
  else renderTitle()
}

setPauseHooks({
  inRun: () => !!match || !!online,
  abandon: abandonRun,
  firstRun: () => {
    if (match || online) abandonRun()
    firstRun()
  },
  escBusy: lottoOpen,
})

// settings the pause menu changes that this file draws from
onPref(key => {
  if (key === 'sort') handSort = pref('sort')
  if (key === 'sort' || key === 'confirm' || key === 'preview') render()
})

function firstRun(): void {
  difficulty = 'easy'
  // dev only: ?first&shop plays the tutorial seed for you (house bot style) up to its first shop, ?first&big up to its
  // big shop, ?first&boss up to the round 3 boss deal, ?first&lose plays one card and bets Max every hand until it busts,
  // to test a lesson deep in the run without playing up to it
  const q = new URLSearchParams(location.search)
  const skipTo = import.meta.env.DEV ? (['big', 'shop', 'boss', 'lose'] as const).find(k => q.has(k)) ?? null : null
  startRun(FIRST_SEED, skipTo ? 'house' : false)
  // the tutorial (docs/TUTORIAL.md): la fée verte teaches every tag again, the forced first hand says the goal.
  // a dev skip keeps the tags already seen, so a lesson deep in the run can be tested by itself
  if (!skipTo) resetTips()
  markSeen('goal', 'preview')
  setGuide(true)
  let m = match!
  m = step(m, ME, { type: 'pickBox', box: 'classic' }).match
  m = step(m, ME, { type: 'draft', rows: autoDraft(m.players[ME].draft!.rows!) }).match
  const there = () =>
    skipTo === 'boss' ? m.phase === 'deal' && m.round >= 3
    : skipTo === 'lose' ? false
    : m.phase === 'shop' && m.round >= 2 && (skipTo !== 'big' || m.players[ME].shop?.kind === 'big')
  while (skipTo && m.phase !== 'over' && !there()) {
    const seat = pending(m)[0]
    let a = botAction(m, seat)
    if (skipTo === 'lose' && seat === ME) {
      if (a.type === 'play' || a.type === 'flamber') a = { type: 'play', cardIds: [a.cardIds.at(-1)!] }
      if (a.type === 'bet' && legal(m, ME).some(l => l.type === 'bet' && l.choice === 'max')) a = { type: 'bet', choice: 'max' }
    }
    const r = step(m, seat, a)
    m = r.match
    skipped(r.events)
  }
  match = m
  render()
}

// dev only: ?quick drafts and shops for you (house bot style) straight to the first deal, for testing the table.
// ?quick&shop plays on (house bot style) until the round 2 shop, for testing the tabac. ?quick&big: the first big shop
function quickStart(): void {
  startRun(randomSeed(), 'house')
  let m = match!
  const q = new URLSearchParams(location.search)
  const big = q.has('big')
  const toShop = q.has('shop') || big
  const atShop = () => m.phase === 'shop' && m.round >= 2 && (!big || m.players[ME].shop?.kind === 'big')
  // &draft stops at the starter box instead, so ?quick&auto&draft plays the draft through the ui too
  const going = () => q.has('draft') ? false : toShop ? m.phase !== 'over' && !atShop() : m.phase === 'draft' || m.phase === 'shop'
  while (going()) {
    const seat = pending(m)[0]
    const r = step(m, seat, botAction(m, seat))
    m = r.match
    skipped(r.events)
  }
  match = m
  render()
}

// a dev skip's events: only what's read after it, never onEvents (no sounds, holds or announcements for the
// hands it played). the best appraisal for the run's receipt, and le patron's payment at the big shop door,
// so his paid-at-the-door lesson shows
function skipped(events: StepResult['events']): void {
  for (const { to, event: e } of events) {
    if (to !== ME && to !== 'all') continue
    if (e.kind === 'showdown' && e.showdown.mine && e.showdown.mine.total > best.total) best = { total: e.showdown.mine.total, hand: handLabel(e.showdown.mine) }
    if (e.kind === 'patron' && e.seat === ME) patronPaid = e.paid ? e.due : null
  }
}

// ---------- render: one switch on the phase ----------

// the count-up runs once, the first time a settled showdown is on screen. everything else just draws
function render(): void {
  void show()
}

async function show(): Promise<void> {
  if (counting) return // a view landing mid count-up waits, the count-up draws when it's done
  const view_ = match || online ? v() : null
  const sd = view_?.showdown
  if (view_ && resultHold && sd && toCount && !counting) {
    toCount = false
    counting = true
    busy = true
    draw()
    const id = run
    await duelCountUp(sd)
    if (id !== run) return // abandoned mid count-up: abandonRun already cleaned up
    counting = false
    busy = false
    if (sd.winner === mySeat()) sfx.win()
    else if (sd.winner !== null) sfx.lose()
    else sfx.tie()
  }
  draw()
}

// shop lines (a scratch, a grading return, an insert used at the counter) don't follow you to the table
let lastPhase: SeatView['phase'] | null = null
const SHOP_LINE = /^(Back from grading|Scratched|Used)/

function draw(): void {
  const phase = match || online ? v().phase : null
  if (lastPhase === 'shop' && phase !== 'shop') log = log.filter(l => !SHOP_LINE.test(l))
  lastPhase = phase
  followMusic()
  docked = null
  setDrawerActions({})
  drawScreen()
  // compare mode: the bifold docks beside whatever choice this screen offers, and folds away when it's over
  if (docked) openDrawer('etui', docked)
  else closeCompare()
}

function drawScreen(): void {
  if (!match && !online) {
    setPanel(null)
    return renderTitle()
  }
  const view_ = v()
  if (resultHold && view_.showdown) return renderTable()
  // the screens with no hand to play sit on the bare duel table
  const bare = (panel: Panel) => {
    showBareTable(app, view_)
    setPanel(panel)
  }
  if (view_.phase === 'over') return bare(overPanel())
  // online, you can finish the draft or shop before the other player does
  if (view_.me.done && (view_.phase === 'draft' || view_.phase === 'shop')) {
    return bare({ title: 'Waiting', help: `Waiting on ${view_.others[0].name}…`, body: () => {}, buttons: [] })
  }
  if (view_.phase === 'draft') return bare(view_.me.starter ? draftPanel() : starterPanel())
  if (view_.phase === 'shop') return renderShop()
  if (view_.phase === 'deal' && view_.me.forge) {
    renderTable()
    return setPanel(forgePanel(view_.me.forge))
  }
  return renderTable()
}

// ---------- draft ----------
// both on the bare duel table: choose a starter box, it rips open, then toss one of its rows

// art/packaging/starters/*.png, loaded on first use. null until it has loaded (the scene redraws every frame)
const boxArt = new Map<string, HTMLImageElement>()
function boxImage(id: string): HTMLImageElement | null {
  let img = boxArt.get(id)
  if (!img) {
    img = new Image()
    img.src = new URL(`../art/packaging/starters/${id}.png`, import.meta.url).href
    boxArt.set(id, img)
  }
  return img.complete && img.naturalWidth ? img : null
}

function drawBoxArt(g: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number): void {
  const img = boxImage(id)
  if (!img) return
  g.save()
  g.imageSmoothingEnabled = false
  g.drawImage(img, Math.round(x), Math.round(y), w, h)
  g.restore()
}

const FELT_TEXT = { color: '#f6ecd2', outline: '#0e0b0a' } as const

let boxesAt: number | null = null // when the three boxes came out on the tray
let pickedBox: { id: StarterId; at: number; x: number; sent: boolean; ripped: boolean } | null = null
let dealAt = 0
let sweepAt: number | null = null
let boxesShown = 0
const tray = new Image()
tray.src = new URL('../art/packaging/tray.png', import.meta.url).href
let tossedRow: number | null = null

function drawTray(g: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  if (!tray.complete || !tray.naturalWidth) return
  // keep the walnut end caps square when the tray spans several boxes
  const end = 15
  g.drawImage(tray, 0, 0, end, 144, x, y, end, 132)
  g.drawImage(tray, end, 0, 120 - 2 * end, 144, x + end, y, w - 2 * end, 132)
  g.drawImage(tray, 120 - end, 0, end, 144, x + w - end, y, end, 132)
}

// the three boxes on the tray. click one: it comes to the middle, shakes, tears and opens, and its rows deal out
function starterPanel(): Panel {
  const offer = v().me.draft!.offer
  for (const id of [...offer, ...offer.map(id => id + '-open')]) boxImage(id)
  const shown = (boxesAt ??= performance.now())
  return {
    title: 'Choose a starter box',
    felt: true,
    body: (ui, box) => {
      const n = offer.length
      const cw = Math.floor((box.w - (n - 1) * 8) / n)
      const t = pickedBox ? (still.matches ? 1300 : ui.now - pickedBox.at) : 0
      const leave = progress(t, 300)
      drawTray(ui.g, box.x, box.y + 16 + leave * 100, box.w)
      offer.forEach((id, i) => {
        const s = getStarter(id)
        const x = box.x + i * (cw + 8)
        const y = box.y + 20
        const intro = still.matches ? 1 : progress(ui.now - shown - i * 60, 260)
        if (intro > 0 && boxesShown <= i) {
          boxesShown = i + 1
          sfx.flip(false, i)
        }
        const over =
          !pickedBox &&
          intro === 1 &&
          ui.hit(x, y, cw, box.h - 20, () => {
            if (!pickedBox) pickedBox = { id, at: performance.now(), x: box.x + box.w / 2, sent: false, ripped: false }
          })
        const chosen = pickedBox?.id === id
        if (!chosen) {
          ui.g.save()
          ui.g.translate(x + cw / 2, y + 56 + (1 - land(intro)) * 56 - (over ? 6 : 0) + leave * 100)
          ui.g.rotate(over ? (ui.mouse.x - x - cw / 2) * 0.002 : 0)
          ui.g.globalAlpha = intro * (1 - leave)
          drawBoxArt(ui.g, id, -44, -56, 88, 112)
          ui.g.restore()
        } else openBox(ui.g, id, t, x + cw / 2, y + 56, box)
        ui.g.save()
        ui.g.globalAlpha = 1 - leave
        let ty = y + 118
        ui.text(s.name, x + cw / 2, ty, { align: 'center', bold: true, color: '#fff0b0', outline: FELT_TEXT.outline })
        ty += 13
        ty += ui.lines(s.deckText, x + cw / 2, ty, cw, { align: 'center', ...FELT_TEXT }) + 4
        ui.lines(s.twist, x + cw / 2, ty, cw, { align: 'center', color: '#fff0b0', outline: FELT_TEXT.outline })
        ui.g.restore()
        if (id !== 'standard' && !pickedBox) ui.fiche(entry('hud', `box-${id}`), x, y, cw, box.h - 20)
      })
      if (pickedBox && t >= 1300 && !pickedBox.sent && !busy) {
        pickedBox.sent = true
        dealAt = performance.now()
        void dispatch({ type: 'pickBox', box: pickedBox.id })
      }
    },
    buttons: [],
  }
}

// the picked box: slides to the middle and grows (0-300ms), shakes (300-750), bursts open with scraps, its card
// back rises out (750-1300)
function openBox(g: CanvasRenderingContext2D, id: StarterId, t: number, fromX: number, fromY: number, box: { x: number; y: number; w: number; h: number }): void {
  const go = land(progress(t, 300))
  const cx = mix(fromX, box.x + box.w / 2, go)
  const cy = mix(fromY, box.y + box.h / 2 - 20, go)
  const size = mix(1, 1.35, go)
  const shaking = t >= 300 && t < 750
  if (t >= 300 && !pickedBox!.ripped) {
    pickedBox!.ripped = true
    sfx.rip()
  }
  const shake = shaking ? shakeAmount() * Math.sin(t / 25) * 4 * (0.4 + 0.6 * progress(t - 300, 450)) : 0
  g.save()
  g.translate(cx + shake, cy)
  g.rotate(shake * 0.02)
  g.scale(size, size)
  const open = t >= 750
  const rise = land(progress(t - 750, 450))
  if (open) g.drawImage(backCanvas(id), -22, -45 - 50 * rise, 44, 60)
  drawBoxArt(g, open ? id + '-open' : id, -44, -56, 88, 112)
  if (t > 650 && t < 1100) {
    const u = progress(t - 650, 450)
    for (let i = 0; i < 6; i++) fit(g, 'pack/scrap/' + ((i % 4) + 1), { x: (i - 2.5) * (8 + 15 * u), y: -50 - 55 * u + 90 * u * u, w: 6, h: 8 })
  }
  g.restore()
}

// the rows on the felt, dealt out of the box at ½x. click the one row you don't want: it slides off the felt as a
// face-down stack and the other three close up, so what's left is your deck. click another and the toss moves.
// the compare dock adds up what you'd keep
function draftPanel(): Panel {
  const me = v().me
  const rows = me.draft!.rows!
  const dealing = () => !still.matches && performance.now() - dealAt < 950
  const toss = (i: number) => {
    if (sweepAt !== null || dealing()) return
    tossedRow = tossedRow === i ? null : i
    if (tossedRow === null) sfx.select(true)
    else sfx.fwip()
    render()
  }
  const kept = rows.map((_, i) => i).filter(i => i !== tossedRow)
  docked = { offers: tossedRow === null ? [] : kept.flatMap(i => rows[i].cards), dest: 'deck' }
  return {
    title: getStarter(me.starter!).name,
    help: `Toss one row. The other ${DRAFT_PICKS * rows[0].cards.length} cards are your deck.`,
    felt: true,
    docked: true,
    body: (ui, box) => {
      const g = ui.g
      const n = Math.max(...rows.map(r => r.cards.length))
      const w = 32
      const gap = 6
      const rowH = 58
      // the tossed stack sits half off the felt, at the sheet's bottom edge
      const stack = { x: Math.round(box.x + box.w / 2), y: box.y + box.h + 8 }
      const swept = sweepAt === null ? 0 : progress(ui.now - sweepAt, 450)
      rows.forEach((row, i) => {
        const out = tossedRow === i
        const k = kept.indexOf(i)
        const left = Math.round(box.x + (box.w - (row.cards.length * w + (row.cards.length - 1) * gap)) / 2)
        const rowAt = ui.spring(`draftrow${i}`, { x: 0, y: out ? stack.y : box.y + k * rowH, r: 0, s: 1 })
        const over = !out && sweepAt === null && ui.hit(box.x, Math.round(rowAt.y), box.w, rowH - 4, () => toss(i))
        const lift = over ? 2 : 0
        if (!out) ui.text(row.label, left, Math.round(rowAt.y) - lift, { font: 'tiny', color: over ? '#fff0b0' : FELT_TEXT.color, outline: FELT_TEXT.outline })
        row.cards.forEach((c, j) => {
          const slot = out
            ? { x: stack.x + (j - 2.5) * 1.5, y: stack.y - j, r: ((j % 3) - 1) * 0.05 + 0.04, s: 1 }
            : { x: left + j * (w + gap) + w / 2, y: box.y + k * rowH + 11 + 22, r: 0, s: 1 }
          const at = ui.spring(`draft${c.id}`, slot, slot)
          const arrive = still.matches ? 1 : land(progress(ui.now - dealAt - (i * n + j) * 30, 250))
          let x = mix(pickedBox?.x ?? 320, at.x, arrive)
          let y = mix(box.y + box.h / 2 - 40, at.y, arrive) - lift
          // toss it: the kept rows sweep to your deck, the stack slides away under the rail
          const fly = sweepAt === null ? 0 : land(progress(ui.now - sweepAt - j * 12, 400))
          x = mix(x, out ? x : box.x + 16, fly)
          y = mix(y, out ? y + 60 : box.y + box.h - 4, fly)
          if (!out && arrive === 1 && sweepAt === null) {
            ui.card(c, x - w / 2, y - 22, w, { onClick: () => toss(i) })
            return
          }
          g.save()
          g.imageSmoothingEnabled = true
          g.globalAlpha = out ? 1 : 1 - swept
          heldCard(g, c, Math.round(x), Math.round(y), 0.5, out ? at.r : 0, { img: out ? backCanvas(me.starter!) : undefined, shadow: out })
          g.restore()
        })
        if (out && sweepAt === null) {
          ui.hit(stack.x - 22, stack.y - 26, 44, 30, () => toss(i))
          ui.text('Tossed', stack.x + 20, stack.y - 36, { font: 'tiny', color: '#a82a38', outline: FELT_TEXT.color })
        }
      })
    },
    buttons: [
      {
        label: 'Toss it',
        kind: 'go',
        enabled: tossedRow !== null,
        onClick: () => {
          if (tossedRow === null || sweepAt !== null || dealing()) return
          const at = (sweepAt = performance.now())
          sfx.shove()
          setTimeout(
            () => {
              if (sweepAt !== at || (!match && !online) || v().phase !== 'draft' || v().me.done) return
              tossedRow = null
              closeCompare()
              void dispatch({ type: 'draft', rows: kept })
            },
            still.matches ? 0 : 500,
          )
        },
      },
    ],
  }
}

// ---------- pack opening ----------
// the pack, ripped on the zinc: flip each pull, then raise the ones that go in your deck. the rest go to the binder
function topPull(c: Card): boolean {
  return c.finish === 'prism' || (c.stamp !== null && c.stamp !== 'damaged') || c.joker !== null || c.tier > 0
}

function pullRank(c: Card): number {
  if (topPull(c)) return 3
  if (c.variant || c.finish || c.knockoff || c.stamp) return 2
  return 1
}

function newRip(cards: Card[]) {
  return {
    at: performance.now(),
    burst: false,
    shook: false, // sounds already played, so each beat sounds once
    fanned: false,
    held: false,
    fastAt: null as number | null,
    doneAt: null as number | null,
    settled: false,
    sent: false,
    cards: [...cards].sort((a, b) => pullRank(a) - pullRank(b)),
    discoveries: new Set<number>(),
    flipped: new Set<number>(),
    toDeck: new Set(cards.filter(defaultToDeck).map(c => c.id)),
    hovered: null as number | null, // the topmost card under the mouse, from last frame's fan
    juice: new Map<string, number>(),
  }
}

function packPanel(): Panel {
  const open = v().me.shop!.open!
  const p = (pack ??= newRip(open.cards))
  const back = v().me.starter
  const cards = p.cards
  const last = cards.length - 1
  const fanAt = 1050
  const first = fanAt + 300 + last * 40
  const flipStart = (i: number) => {
    const regular = first + i * 250 + (i === last ? 500 : 0)
    if (p.fastAt === null) return regular
    const start = Math.max(first, p.fastAt)
    const next = Math.max(0, Math.ceil((start - first) / 250))
    return Math.min(regular, start + Math.max(0, i - next) * 120 + (i === last ? 500 : 0))
  }
  const skip = () => {
    if (p.settled || p.doneAt !== null) return
    const t = performance.now() - p.at
    if (t < 900) p.at -= 900 - t
    p.fastAt ??= performance.now() - p.at
  }
  if (p.settled) docked = { offers: cards.filter(c => p.toDeck.has(c.id)), dest: 'deck' }
  return {
    title: entry('hud', 'pack-' + open.kind).name,
    felt: true,
    docked: true, // from the start, so the fan never moves or shrinks when the compare dock opens
    scrim: now => 0.7 * progress(now - p.at, 300) * (p.doneAt === null ? 1 : 1 - progress(now - p.doneAt, 400 + last * 50)),
    body: (ui, box) => {
      const g = ui.g
      const t = still.matches ? Math.max(ui.now - p.at, flipStart(last) + 900) : ui.now - p.at
      if (!p.settled) tip('rip', ['Rip! The cards flip one by one.', 'The last one is held back, because it can be a rare. Click to hurry the rest along.'], { x: box.x + box.w / 2 - 60, y: box.y + 20, w: 120, h: 120 }, 'above')
      const cx = box.x + box.w / 2
      const cy = box.y + box.h * 0.43
      if (t < fanAt + 500) {
        const lift = land(progress(t, 300))
        const shake = progress(t - 300, 600) * shakeAmount()
        const burst = progress(t - 900, 350)
        g.save()
        if (t >= 900 && t < 1050) g.translate(Math.sin(t * 0.15) * 2 * shakeAmount() * (1 - progress(t - 900, 150)), 0)
        g.translate(mix(packShelfX, cx, lift) + Math.sin(t * 0.13) * 4 * shake * (1 - burst), mix(245, cy, lift))
        g.rotate(Math.sin(t * 0.09) * 0.055 * shake * (1 - burst))
        g.scale(1, 1 - (Math.floor(t / 50) % 4 === 0 ? 0.035 * shake : 0))
        const w = mix(65, 126, lift),
          h = w * 1.42
        if (t >= 300 && !p.shook) {
          p.shook = true
          sfx.rustle()
        }
        if (t < 900) fit(g, 'shop/pack/' + open.kind, { x: -w / 2, y: -h / 2, w, h })
        else {
          if (!p.burst) {
            p.burst = true
            sfx.rip()
            sfx.duck(-6, 1.6)
          }
          g.globalAlpha = 1 - burst
          for (const [half, sign] of [
            ['top', -1],
            ['bottom', 1],
          ] as const) {
            g.save()
            g.translate(sign * 95 * burst, sign * 70 * burst)
            g.rotate(sign * burst)
            fit(g, `pack/${open.kind}/${half}`, { x: -w / 2, y: -h / 2, w, h })
            g.restore()
          }
          g.globalAlpha = 1 - progress(t - 1220, 330)
          const u = progress(t - 900, 650)
          for (let i = 0; i < 10; i++) {
            g.save()
            g.translate(Math.cos(i * 2.4) * 105 * u, -45 + ((i % 4) - 5) * 38 * u + 220 * u * u)
            g.rotate(i + u * 6)
            const ink = { offbrand: '#e8c260', collector: '#3e66a0', repack: '#a82a38' }[open.kind]
            g.drawImage(tinted('pack/scrap/' + ((i % 4) + 1), ink), -4, -4)
            g.restore()
          }
        }
        g.restore()
      }
      if (t < fanAt) {
        ui.hit(0, 0, 640, 360, skip)
        return
      }
      const rare = topPull(cards[last])
      if (!p.fanned) {
        p.fanned = true
        sfx.fan()
      }
      // the god pull: the last card waits face down, the music drops out, a heartbeat
      if (rare && !p.held && t >= flipStart(last) - 500 && !still.matches) {
        p.held = true
        sfx.duck(-24, 1.2)
        sfx.heartbeat()
      }
      const peak = t - flipStart(last) - 125
      const pilesY = box.y + box.h - 38
      const sorting = p.settled && p.doneAt === null
      // the fan stays a 1x fan the whole way, like the duel hand. once sorted, deck cards ride high and binder cards sit low
      const step = last ? Math.min(60, Math.floor((box.w - 64) / last)) : 0
      const toggle = (id: number) => {
        if (p.toDeck.has(id)) p.toDeck.delete(id)
        else p.toDeck.add(id)
        p.juice.set(`pack${id}`, ui.now)
        if (p.toDeck.has(id)) sfx.select(true)
        else sfx.fwip() // into a binder sleeve
        render()
      }
      const placed: { c: Card; x: number; y: number; r: number; w: number; h: number }[] = []
      cards.forEach((c, i) => {
        const fan = land(progress(t - fanAt - i * 40, 300))
        const offset = i - last / 2
        let x = mix(cx, cx + offset * step, fan)
        let y = mix(cy + 20, cy + offset ** 2 * 2, fan)
        let r = offset * 0.052 * fan
        const deck = p.toDeck.has(c.id)
        const over = sorting && p.hovered === c.id
        const raise = ui.spring(`pack${c.id}`, { x: 0, y: sorting ? (deck ? 18 : -4) + (over ? 7 : 0) : 0, r: 0, s: over ? 1.04 : 1 })
        x += Math.sin(r) * raise.y
        y -= Math.cos(r) * raise.y
        if (rare && peak >= 0 && peak < 250 && !still.matches) x += 3 * Math.sin(peak * 0.095) * (1 - peak / 250)
        const flip = progress(t - flipStart(i), p.fastAt === null || i === last ? 250 : 120)
        if (flip >= 0.5 && !p.flipped.has(c.id)) {
          p.flipped.add(c.id)
          if (recordPull(c)) p.discoveries.add(c.id)
          sfx.flip(topPull(c), i)
          if (i === last && rare) {
            announce('La fée verte !', cardName(c), 'good')
            dropCigarette()
            sfx.godPull()
          }
        }
        // on Done they fly to the piles at 1x and fade as they land
        const flight = p.doneAt === null ? 0 : progress(ui.now - p.doneAt - i * 50, 400)
        if (p.doneAt !== null) {
          const fly = land(flight)
          x = mix(x, deck ? box.x + 30 : box.x + box.w - 30, fly)
          y = mix(y, pilesY, fly)
          r *= 1 - flight
        }
        if (!p.settled && i === last && flip === 0 && t > first + (last - 1) * 250) x += Math.sin(t * 0.12) * 1.4
        if (!p.settled && i === last && rare && peak >= 0 && peak < 600 && !still.matches) {
          g.save()
          g.translate(x, y)
          g.rotate(peak * 0.001)
          g.globalAlpha = 0.55 * (1 - peak / 600)
          fit(g, 'fx/rays', { x: -84, y: -84, w: 168, h: 168 })
          g.restore()
        }
        const j = juiceAt(p.juice, `pack${c.id}`, ui.now)
        const size = stockScale(c)
        const w = 64 * size
        const h = 88 * size
        x = Math.round(x)
        y = Math.round(y)
        if (sorting && !deck) fit(g, 'shop/binder', { x: x - 15, y: Math.round(y + h / 2 - 2), w: 30, h: 22 })
        g.save()
        g.globalAlpha = 1 - progress(flight - 0.6, 0.4)
        g.translate(x, y)
        g.rotate(r + j.r)
        const landing = progress(t - flipStart(i) - 250, 230)
        const pop = (still.matches || pullRank(c) === 1 ? 1 : 1 + 0.1 * Math.sin(Math.PI * landing) * (1 - landing)) * raise.s * j.s
        g.scale(pop * Math.max(0.02, Math.abs(Math.cos(Math.PI * flip))), pop * (1 + Math.sin(Math.PI * flip) * 0.07))
        const ink = glowInk(c)
        if (i === last && rare && flip === 0 && ink) {
          g.globalAlpha = 0.5 + 0.4 * Math.sin(t * 0.012)
          g.fillStyle = ink
          g.fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4)
          g.globalAlpha = 1
        }
        heldCard(g, c, 0, 0, size, 0, { img: flip < 0.5 ? backCanvas(back) : undefined, shadow: fan === 1 && flight === 0 })
        if (flip === 1 && p.discoveries.has(c.id) && (sorting || t - flipStart(i) < 900)) fit(g, 'hud/album/new', { x: w / 2 - 16, y: -h / 2 - 4, w: 24, h: 14 })
        g.restore()
        placed.push({ c, x, y, r: r + j.r, w, h })
        if (sorting) {
          // a box around the card's middle: the topmost card under the mouse gets the click, as in the duel
          ui.hit(x - w / 2, y - h / 2, w, h, () => toggle(p.hovered ?? c.id))
          if (i === 0) tip('deckbinder', 'Click to switch. Deck cards get played, Binder cards get sold.', { x: x - w / 2, y: y - h / 2, w, h: h + 12 }, 'below')
          const lesson = CARD_LESSONS.find(l => l.test(c))
          if (lesson) tip(lesson.id, lesson.lines, { x: x - w / 2, y: y - h / 2, w, h }, 'above')
        }
      })
      // the hover for next frame: the topmost card whose turned rect has the mouse
      p.hovered = null
      if (sorting) {
        for (let i = placed.length - 1; i >= 0; i--) {
          const q = placed[i]
          const dx = ui.mouse.x - q.x
          const dy = ui.mouse.y - q.y
          const lx = dx * Math.cos(q.r) + dy * Math.sin(q.r)
          const ly = -dx * Math.sin(q.r) + dy * Math.cos(q.r)
          if (Math.abs(lx) <= q.w / 2 && Math.abs(ly) <= q.h / 2) {
            p.hovered = q.c.id
            ui.hover(q.c, { x: q.x - q.w / 2, y: q.y - q.h / 2, w: q.w, h: q.h })
            break
          }
        }
      }
      if (!p.settled && rare && peak >= 0 && peak < 600 && !still.matches) {
        g.save()
        g.globalCompositeOperation = 'lighter'
        g.globalAlpha = 0.32 * (1 - progress(peak, 120))
        g.fillStyle = '#3a8040'
        g.fillRect(0, 0, 640, 360)
        g.globalAlpha = 0.45 * (1 - peak / 600)
        fit(g, 'fx/leak', { x: -160 + (800 * peak) / 600, y: 0, w: 160, h: 360 })
        g.restore()
      }
      if (!p.settled && t >= flipStart(last) + (rare ? 725 : 250)) {
        p.settled = true
        render()
      }
      // the labels ride with their cards: Deck over the raised ones, Binder under the low ones
      const inDeck = placed.filter(q => p.toDeck.has(q.c.id))
      const inBinder = placed.filter(q => !p.toDeck.has(q.c.id))
      const midX = (qs: typeof placed) => Math.round(qs.reduce((sum, q) => sum + q.x, 0) / qs.length)
      if (sorting && inDeck.length) {
        const top = Math.min(...inDeck.map(q => q.y - q.h / 2))
        ui.text(`Deck · ${inDeck.length}`, midX(inDeck), top - 14, { align: 'center', bold: true, color: '#fff0b0', outline: FELT_TEXT.outline })
      }
      if (sorting && inBinder.length) {
        const bottom = Math.max(...inBinder.map(q => q.y + q.h / 2))
        ui.text(`Binder · ${inBinder.length}`, midX(inBinder), bottom + 22, { align: 'center', bold: true, color: '#fff0b0', outline: FELT_TEXT.outline })
      }
      if (p.settled) {
        for (const [label, x] of [
          ['Deck', box.x + 30],
          ['Binder', box.x + box.w - 30],
        ] as const) {
          if (label === 'Binder') fit(g, 'shop/binder', { x: x - 15, y: pilesY - 10, w: 30, h: 22 })
          else {
            g.save()
            g.imageSmoothingEnabled = true // the pile's backs at ½x
            for (let layer = 2; layer >= 0; layer--) g.drawImage(backCanvas(back), x - 16 + layer, pilesY - 22 + layer * 2, 32, 44)
            g.restore()
          }
          ui.text(label, x, pilesY + 24, { align: 'center', ...FELT_TEXT })
        }
        let y = cy + 44 + 52
        if (open.codeCard) {
          ui.text(`Code: ${HAND_NAMES[open.codeCard]} +1 level`, cx, y, { align: 'center', ...FELT_TEXT })
          y += 12
        }
        if (open.collectible) {
          const def = getDef(open.collectible.id)
          y += ui.lines(`${def.name}: ${describe(open.collectible)}`, cx, y, box.w - 100, { align: 'center', ...FELT_TEXT })
          ui.text(
            v().me.display.length < v().me.displaySlots
              ? 'Goes in your case.'
              : `Case full, sells for $${Math.floor(COLLECTIBLE_PRICE[def.rarity] / 2)}.`,
            cx,
            y,
            { align: 'center', ...FELT_TEXT },
          )
        }
      } else ui.hit(0, 0, 640, 360, skip)
      if (p.doneAt !== null && !p.sent && !busy && (still.matches || ui.now - p.doneAt >= 400 + last * 50)) {
        p.sent = true
        closeCompare()
        sfx.shove()
        void dispatch({ type: 'sortPack', toDeck: [...p.toDeck] })
      }
    },
    buttons: p.settled
      ? [
          {
            label: 'Done',
            kind: 'go',
            enabled: p.doneAt === null,
            onClick: () => {
              p.doneAt ??= performance.now()
              render()
            },
          },
        ]
      : [{ label: 'Reveal all', kind: 'back', enabled: true, onClick: skip }],
    onCardHover: c => setCompareHover(c, c && p.toDeck.has(c.id) ? 'deck' : 'binder'),
  }
}

// a face-down pull hints at what's under it
function glowInk(card: Card): string | undefined {
  return cardInk(card)
}

// ---------- shop ----------

function renderShop(): void {
  const view_ = v()
  const me = view_.me
  const shop = me.shop!
  if (!shop.open) pack = null
  // only the newest line, so a table-side insert from last round doesn't show up here
  const last = log.at(-1) ?? ''
  const toast = SHOP_LINE.test(last) ? last : ''
  showShop(app, {
    view: view_,
    toast,
    clock: () => {
      if (!online || !net) return ''
      const d = online.deadlines[online.view.me.seat]
      return d === null ? '' : `${Math.max(0, Math.ceil(net.msLeft(d) / 1000))}s`
    },
    canBuy: slot => can({ type: 'buy', slot }),
    canRestock: can({ type: 'restock' }),
    canBinBulk: can({ type: 'binBulk' }),
    canGrade: shop.services.grading && !shop.shipped && !me.shipping,
    onBuy: slot => {
      packShelfX = shelfCenter(shop.offers, slot)
      void dispatch({ type: 'buy', slot })
    },
    onRestock: () => void dispatch({ type: 'restock' }),
    onBinBulk: () => void dispatch({ type: 'binBulk' }),
    onGrading: () => {
      gradeOpen = true
      gradePage = 0
      render()
    },
    onBinder: () => openDrawer('classeur'),
    onVitrine: () => openDrawer('vitrine'),
    onPile: () => openDrawer('etui'),
    onLeave: () => {
      whipPan(app.querySelector('canvas.stage'), 1)
      sfx.doorBell()
      sfx.play('whoosh', { gain: 0.25, rate: 1.3 })
      patronPaid = null
      void dispatch({ type: 'leaveShop' })
    },
    scratch: scratchShow,
    onScratchDone: () => {
      scratchShow = null
      render()
    },
    onSleeve: () => openDrawer('sleeve'),
    patronPaid,
  })
  setDrawerActions({
    useInsert: shopInsert,
    canUse: slot => {
      const c = heldInsert(me, slot)
      const when = INSERTS[c.id].when
      if (when === 'shop') return me.binder.length > 0
      return when === 'anytime' && can({ type: 'useInsert', slot, cardIds: [], suit: null })
    },
    tossInsert: slot => {
      closeDrawer()
      void dispatch({ type: 'tossInsert', slot })
    },
    sell: async ids => {
      sfx.coin()
      keeperSays('Mouais.')
      for (const id of ids) await dispatch({ type: 'sell', cardId: id })
    },
    sellPrice,
    canSell: id => can({ type: 'sell', cardId: id }),
    openAlbum: () => {
      closeDrawer()
      albumOpen = true
      render()
    },
    sellCollectible: slot => {
      sfx.coin()
      void dispatch({ type: 'sellCollectible', slot })
    },
    collectiblePrice: slot => collectibleSell(view_, slot),
  })
  // a scratch with a full Sleeve: the Sleeve opens once on it, use or toss one before buying anything else
  if (!me.overflow) overflowOpened = false
  else if (!scratchShow && !overflowOpened) {
    overflowOpened = true
    openDrawer('sleeve')
  }
  setPanel(shop.open ? packPanel()
    : wishSlot !== null ? wishPanel()
    : gradeOpen ? gradingPanel()
    : albumOpen ? albumPanel()
    : null)
}

// slot 2 is the insert waiting for room
function heldInsert(me: SeatView['me'], slot: number): SleeveCard {
  const c = slot === SLEEVE_SLOTS ? me.overflow : me.sleeve[slot]
  if (!c) throw new Error(`no insert in slot ${slot}`)
  return c
}

// the Sleeve page's Use in the shop: a code levels its hand here, a wishlist picks a binder card first
function shopInsert(slot: number): void {
  const c = heldInsert(v().me, slot)
  closeDrawer()
  if (c.id === 'wishlist') {
    wishSlot = slot
    wishPage = 0
    return render()
  }
  void dispatch({ type: 'useInsert', slot, cardIds: [], suit: null })
}

// half what a collectible costs today, the same math as the engine's sellCollectible
function collectibleSell(view_: SeatView, slot: number): number {
  const rarity = getDef(view_.me.display[slot].id).rarity
  const adj = (view_.keeper.includes('grumpy') ? 1 : 0) - (view_.keeper.includes('closing') ? tableOf(view_.round) - 1 : 0)
  return Math.floor(Math.max(1, COLLECTIBLE_PRICE[rarity] + adj) / 2)
}

// the album: every card ever pulled. the binder sells on the carnet's Classeur page
let albumOpen = false
function albumPanel(): Panel {
  const close = () => {
    albumOpen = false
    render()
  }
  return {
    title: 'Album',
    help: 'Every card and modifier you have ever pulled, across all your runs.',
    body: (ui, box) => drawAlbum(ui, box),
    buttons: [{ label: 'Binder', kind: 'back', enabled: true, onClick: () => { close(); openDrawer('classeur') } }],
    onEscape: close,
  }
}

// what a binder card sells for right now, from the engine's own pricing
// the same math as the engine's binderPrice, from the view
function sellPrice(c: Card): number {
  const view_ = v()
  const fan = (view_.keeper.includes('collector') && c.grade !== null) || (view_.keeper.includes('nostalgic') && c.stamp === 'first')
  return cardSellPrice(c) * stonksMult(c, view_.stonks, view_.me.sleeves.includes('hot_market')) * (fan ? 2 : 1)
}

// the album: 52 faces, lit once you've pulled them, then the modifier sets by their engine names. hover a found one to read it
const ALBUM_KIND: Record<string, { kind: Kind; label: string }> = {
  finish: { kind: 'finish', label: 'Finishes' }, stamp: { kind: 'stamp', label: 'Stamps' }, type: { kind: 'variant', label: 'Card types' },
  joker: { kind: 'joker', label: 'Jokers' }, knock: { kind: 'knockoff', label: 'Knockoffs' },
}

function drawAlbum(ui: Ui, box: { x: number; y: number; w: number; h: number }): void {
  const seen = albumSeen()
  const w = 20
  const h = CARD_H(w)
  const left = box.x + (box.w - 13 * (w + 3)) / 2
  SUITS.forEach((suit, row) => {
    for (let i = 0; i < 13; i++) {
      const rank = i + 2
      ui.g.save()
      ui.g.imageSmoothingEnabled = true
      ui.g.globalAlpha = seen.has(rank + suit) ? 1 : 0.18
      ui.g.drawImage(faceCanvas(rank, suit), left + i * (w + 3), box.y + row * (h + 4), w, h)
      ui.g.restore()
    }
  })
  let y = box.y + 4 * (h + 4) + 8
  for (const [group, ids] of ALBUM_SETS) {
    const { kind, label } = ALBUM_KIND[group]
    const found = ids.filter(id => seen.has(group + '/' + id)).length
    ui.text(`${label} ${found}/${ids.length}`, box.x, y, { font: 'tiny', color: '#7a1a2c' })
    y += 10
    let x = box.x
    for (const id of ids) {
      const has = seen.has(group + '/' + id)
      const name = has ? entry(kind, id).name : '?'
      const cw = measure(name, 'sans') + 8
      if (x + cw > box.x + box.w) {
        x = box.x
        y += 12
      }
      ui.nine('hud/plate/paper', x, y, cw, 11, has ? '#fff6dc' : '#bfa77e')
      ui.text(name, x + 4, y + 1, { color: has ? '#2e2320' : '#8c7656' })
      if (has) ui.fiche(entry(kind, id), x, y, cw, 11)
      x += cw + 3
    }
    y += 16
  }
}

// grading: pick a shipper, then the card. away for a round, back graded at the next shop
let gradeOpen = false
let shipper: Shipper = 'poste'
let gradeFrom: 'all' | 'deck' | 'binder' = 'all'
let gradePage = 0
// special cards first (a finish, stamp, ★, type, joker or knockoff), then rank high to low
const special = (c: Card) => !!(c.finish || c.stamp || c.tier || c.variant || c.joker || c.knockoff)
const byShelf = (a: Card, b: Card) => Number(special(b)) - Number(special(a)) || b.rank - a.rank || a.id - b.id
function gradingPanel(): Panel {
  const me = v().me
  const shippable = (c: Card) => can({ type: 'ship', cardId: c.id, shipper })
  const deck = [...me.pile, ...me.discard].filter(shippable)
  const binder = me.binder.filter(shippable)
  const inBinder = new Set(binder.map(c => c.id))
  const cards = (gradeFrom === 'deck' ? deck : gradeFrom === 'binder' ? binder : [...deck, ...binder]).sort(byShelf)
  const close = () => {
    gradeOpen = false
    render()
  }
  const from = (f: typeof gradeFrom) => {
    gradeFrom = f
    gradePage = 0
    render()
  }
  return {
    title: entry('hud', 'grading').name,
    body: (ui, box) => {
      // the help line, with the All · Deck · Binder filter on its right
      ui.text('Pick a card to ship. One per shop.', box.x, box.y + 1, { color: '#5c4a36' }) // how grading works is on the window's Fiche
      let x = box.x + box.w
      for (const [f, label] of [['binder', `Binder ${binder.length}`], ['deck', `Deck ${deck.length}`], ['all', `All ${deck.length + binder.length}`]] as const) {
        x -= measure(label, 'tiny') + 8
        chip(ui, label, x, box.y, gradeFrom === f, () => from(f))
        x -= 3
      }
      const top = box.y + 16
      tip('shippers', ['Pick a shipper. La Poste is cheap but your card can come back damaged.', 'Chronopost is safe. The Fourgon blindé grades twice and keeps the better grade.'], { x: box.x, y: top, w: box.w, h: 54 }, 'below')
      const ids = Object.keys(SHIPPERS) as Shipper[]
      const bw = Math.floor((box.w - 8) / 3)
      ids.forEach((id, i) => {
        const sh = SHIPPERS[id]
        const x = box.x + i * (bw + 4)
        const on = id === shipper
        const ok = sh.price < me.bankroll
        const over = ui.hit(x, top, bw, 54, () => { if (ok) { shipper = id; render() } })
        ui.fiche(entry('hud', `ship-${id}`), x, top, bw, 54)
        ui.nine('hud/plate/paper', x, top, bw, 54, on ? '#e8c260' : over && ok ? '#fff6dc' : undefined)
        fit(ui.g, 'shop/parcel/' + id, { x: x + 4, y: top + 4, w: 30, h: 20 })
        const big = measure(sh.name, 'sans', true) <= bw - 42
        ui.text(sh.name, x + 38, top + (big ? 4 : 6), { font: big ? 'sans' : 'tiny', bold: big, color: ok ? '#2e2320' : '#8c7656' })
        ui.text(`$${sh.price}`, x + 38, top + 15, { color: '#3a8040' })
        ui.lines(sh.text, x + 4, top + 27, bw - 8, { font: 'tiny', color: '#5c4a36' })
      })
      if (!cards.length) ui.text('Nothing here to ship.', box.x + box.w / 2, top + 80, { color: '#8c7656', align: 'center' })
      // ½× cards, 8 a row, 4 rows a page. with All, each wears a deck or binder tag
      const w = 32
      const gridBox = { x: box.x, y: top + 60, w: box.w, h: box.y + box.h - top - 60 }
      const tags: { c: Card; x: number; y: number }[] = []
      for (const { at, i } of paged(ui, cards.length, gridBox, w, gradePage, p => { gradePage = p; render() }, 6, 8)) {
        const c = cards[i]
        const over = ui.card(c, at.x, at.y, w, { onClick: () => {
          gradeOpen = false
          void dispatch({ type: 'ship', cardId: c.id, shipper }) // the shipper's sound plays in the shop
        } })
        if (gradeFrom === 'all' && !over) tags.push({ c, ...at })
      }
      for (const t of tags) {
        const label = inBinder.has(t.c.id) ? 'binder' : 'deck'
        const tw = measure(label, 'tiny') + 6
        ui.nine('hud/plate/paper', t.x + w / 2 - tw / 2, t.y + CARD_H(w) - 3, tw, 9, inBinder.has(t.c.id) ? '#a9bedf' : undefined)
        ui.text(label, t.x + w / 2, t.y + CARD_H(w) - 2, { font: 'tiny', color: '#2e2320', align: 'center' })
      }
    },
    buttons: [{ label: 'Cancel', kind: 'back', enabled: true, onClick: close }],
    onEscape: close,
  }
}

// a small filter chip on a panel's paper: gold when on
function chip(ui: Ui, label: string, x: number, y: number, on: boolean, onClick: () => void): void {
  const w = measure(label, 'tiny') + 8
  const over = ui.hit(x, y, w, 11, onClick)
  ui.nine('hud/plate/paper', x, y - (over && !on ? 1 : 0), w, 11, on ? '#e8c260' : over ? '#fff6dc' : '#bfa77e')
  ui.text(label, x + 4, y + 2 - (over && !on ? 1 : 0), { font: 'tiny', color: '#2e2320' })
}

// a wishlist from the Sleeve: pick the binder card it shuffles back into your deck
let wishSlot: number | null = null
let wishPage = 0
function wishPanel(): Panel {
  const me = v().me
  const back = () => {
    wishSlot = null
    render()
  }
  return {
    title: entry('insert', 'wishlist').name,
    help: 'Pick a binder card to shuffle into your deck.',
    body: (ui, box) => {
      const w = 32
      for (const { at, i } of paged(ui, me.binder.length, box, w, wishPage, p => { wishPage = p; render() }, 6, 10)) {
        const c = me.binder[i]
        ui.card(c, at.x, at.y, w, { onClick: () => {
          const slot = wishSlot!
          wishSlot = null
          void dispatch({ type: 'useInsert', slot, cardIds: [c.id], suit: null })
        } })
      }
    },
    buttons: [{ label: 'Back', kind: 'back', enabled: true, onClick: back }],
    onEscape: back,
  }
}

// ---------- the table ----------
const BET_LABEL: Record<BetChoice, string> = { min: 'Min', max: 'Max' }

// the rival's face. solo: the mask that sat down this Table. online opponents get a mask from their name
type DuelRival = { name: string; mask: string; stamp: string; back: StarterId }
const STAMP: Record<Difficulty, { stamp: string; back: StarterId }> = {
  easy: { stamp: 'FACILE', back: 'classic' },
  medium: { stamp: 'MOYEN', back: 'suited' },
  hard: { stamp: 'GROS JOUEUR', back: 'highroller' },
}
const MASKS = ['domino', 'pierrot', 'arlequin', 'scaramouche', 'hare', 'fox', 'owl', 'king_spades', 'queen_hearts', 'domino_red']

function rivalFace(): DuelRival {
  const them = v().others[0]
  if (match && them.rival) return { name: getRival(them.rival).name, mask: them.rival, ...STAMP[difficulty] }
  let h = 0
  for (const ch of them.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return { name: them.name, mask: MASKS[h % MASKS.length], stamp: v().mode.toUpperCase(), back: 'standard' }
}

// the deal: pick cards, then play them, flambé them or discard them. a Sleeve insert picked up takes over the bar
// Confirm bets (the pause menu): Max, and Flamber with Max + Flamber, take a second press within 3 s.
// the first press only arms the ticket, which says Sure?
let armed: { kind: 'max' | 'forge'; t: number } | null = null
const isArmed = (kind: 'max' | 'forge') => armed?.kind === kind && performance.now() - armed.t < 3000
const needsConfirm = (kind: 'max' | 'forge') => pref('confirm') === 'both' || (pref('confirm') === 'max' && kind === 'max')

function confirmed(kind: 'max' | 'forge', go: () => void): () => void {
  if (!needsConfirm(kind)) return go
  return () => {
    if (isArmed(kind)) {
      armed = null
      return go()
    }
    armed = { kind, t: performance.now() }
    render()
    setTimeout(() => {
      if (armed?.kind !== kind || isArmed(kind)) return
      armed = null
      render()
    }, 3050)
  }
}

// the tutorial's forced first hand (docs/TUTORIAL.md): your best hand, then Play, then Max. the fée spotlights
// each one and only it works. on the first run's seed that's a 9–K Straight, which beats the rival's Full House
// and opens a round 1 knockout. null once hand 1 of round 1 is locked and bet, or outside the tutorial
type Lesson = { id: string; lines: string[]; cards?: number[]; slip?: 'lock' | 'max'; want: number[] }

function lessonNow(view_: SeatView): Lesson | null {
  if (!guiding() || !match || view_.round !== 1 || view_.hands?.hand !== 1) return null
  const me = view_.me
  if (view_.phase === 'deal' && !me.locked && !me.forge) {
    // a pick that isn't in the hand can never Play, and the spotlight would leave no way out
    for (const id of selected) if (!me.hand.some(c => c.id === id)) throw new Error(`lesson: picked card ${id} isn't in the hand`)
    const best = bestPlay(match, match.players[ME])
    const want = best.played.map(c => c.id)
    if (!want.every(id => selected.has(id))) {
      const cards = [...best.played].sort((a, b) => b.rank - a.rank).map(c => rankLabel(c.rank)).join(' ')
      return { id: 'lesson-pick', want, cards: want, lines: [
        "Bonsoir! I'm La Fée Verte. Let me show you how this table works.",
        'A round is up to 3 hands against your rival. Win 2 hands and the pot is yours.',
        `Your best poker hand here is a ${HAND_NAMES[best.est.hand]}: ${cards}. Click those ${want.length === 1 ? 'card' : `${want.length} cards`}.`,
      ] }
    }
    return { id: 'lesson-play', want, slip: 'lock', lines: [
      'Your plate reads Value × Hype. Multiply them: that is the start of your Appraisal.',
      "Play locks your cards in. Your rival locks theirs face down, so you can't see them.",
    ] }
  }
  if (view_.phase === 'bet' && view_.bet?.toAct === me.seat && view_.bet.stage !== 'push' && view_.bet.options.includes('max'))
    return { id: 'lesson-bet', want: [], slip: 'max', lines: [
      'Now the bet, before anyone reveals. Min just pays the ante.',
      'Max bets more on yourself. Win the round and the House pays it, lose and your rival takes it.',
      'Your hand is a strong one. Go on, bet Max!',
    ] }
  return null
}

function dealSlips(me: SeatView['me']): { slips: Slip[]; hint: string } {
  const ids = [...selected] // click order, which photocopie reads (the first becomes the second)
  const picked = me.hand.filter(c => selected.has(c.id))
  const n = ids.length

  if (insertSlot !== null && me.sleeve[insertSlot]) {
    const slot = insertSlot
    const ins = me.sleeve[slot]
    const def = INSERTS[ins.id]
    const [lo, hi] = def.cards
    const want = lo === hi ? `${lo} card${lo > 1 ? 's' : ''}` : `${lo}–${hi} cards`
    const hint = `${def.name}: ${plainText(entry('insert', ins.id, ins).text[0])}.${hi ? ` Pick ${want}.` : ''}`
    const cancel: Slip = { label: 'Put back', kind: 'skip', enabled: true, onClick: () => {
      insertSlot = null
      selected = new Set()
      render()
    } }
    const use = (suit: Card['suit'] | null) => () => {
      insertSlot = null
      selected = new Set()
      void dispatch({ type: 'useInsert', slot, cardIds: ids, suit }) // the insert's own sound plays as it lands
    }
    if (ins.id === 'checklist') {
      const suits = SUITS.map(x => ({ label: SUIT_GLYPH[x], kind: 'insert' as const, enabled: can({ type: 'useInsert', slot, cardIds: ids, suit: x }), onClick: use(x) }))
      return { slips: [cancel, ...suits], hint }
    }
    return { slips: [cancel, { label: 'Use it', price: hi ? `${n}/${hi}` : '', kind: 'insert', primary: true, enabled: can({ type: 'useInsert', slot, cardIds: ids, suit: null }), onClick: use(null) }], hint }
  }

  if (grindPick) {
    const cancel: Slip = { label: 'Back', kind: 'skip', enabled: true, onClick: () => {
      grindPick = false
      render()
    } }
    return { slips: [cancel], hint: 'No pair: click the locked card that gets +1 Value for good.' }
  }

  const merges = n > 0 && !!forgePlan(picked)
  const grindable = picked.filter(c => !c.bulk)
  // the tickets, their Fiches and the flamber tip say what each choice does. the column only says what you can't
  // see elsewhere: that a flambé gives up this hand
  const hint = merges ? 'This hand scores 0 and skips the bet. The ★ card comes back next hand.' : ''
  const lock = (type: 'play' | 'flamber', grind: number | null) => {
    lastLocked = picked
    selected = new Set()
    grindPick = false
    void dispatch(type === 'play' ? { type, cardIds: ids } : { type, cardIds: ids, grind })
  }
  return {
    hint,
    slips: [
      { label: 'Discard', price: `${me.discardsLeft} left`, kind: 'discard', enabled: n > 0 && can({ type: 'discard', cardIds: ids }), onClick: () => {
        selected = new Set()
        void dispatch({ type: 'discard', cardIds: ids })
      } },
      { label: isArmed('forge') ? 'Sure?' : 'Flamber', price: merges ? '★' : n ? '+1 Value' : '', kind: 'forge', ...(needsConfirm('forge') && !isArmed('forge') ? { stamp: '' } : {}), enabled: n > 0 && can({ type: 'flamber', cardIds: ids, grind: merges || !grindable.length ? null : grindable[0].id }), onClick: confirmed('forge', () => {
        if (merges || grindable.length <= 1) return lock('flamber', merges ? null : grindable[0]?.id ?? null)
        grindPick = true
        render()
      }) },
      { label: 'Play', price: n ? `${n} card${n > 1 ? 's' : ''}` : '', kind: 'lock', primary: n > 0, enabled: n > 0 && can({ type: 'play', cardIds: ids }), onClick: () => lock('play', null) },
    ],
  }
}

function renderTable(): void {
  setPanel(null)
  sfx.ambience('duel')
  const view_ = v()
  const me = view_.me
  const settled = resultHold && view_.showdown !== null
  const tally = settled && tallyHold && view_.last !== null

  let slips: Slip[] = []
  let hint = ''
  if (settled) {
    if (!counting) slips = [{ label: view_.phase === 'over' ? 'See results' : 'Continue', kind: 'continue', primary: true, enabled: true, onClick: () => {
      resultHold = false
      tallyHold = false
      if (match?.phase === 'over') saveScore()
      render()
    } }]
  } else if (view_.phase === 'deal' && !me.locked && !me.forge) {
    ({ slips, hint } = dealSlips(me))
    if (view_.hands?.hand === 1) {
      const t = view_.twist
      if (t) announceOnce(`twist:${view_.round}`, twistName(t), rule('twist', t.id, 0, t))
      if (me.marker && view_.round % 3 === 0) announceOnce(`marker:${view_.round}`, 'Le Patron attend', `$${me.marker.due} due at the next big shop`, 'bad')
    }
  } else if (view_.phase === 'bet' && view_.bet?.toAct === me.seat) {
    const b = view_.bet
    const push = b.stage === 'push'
    const price = (c: BetChoice) => (c === 'min' ? (push ? 'stay' : `$${b.stake}`) : `+$${b.extra} on you`)
    const ask = (c: BetChoice) => c === 'max' && needsConfirm('max')
    slips = (['max', 'min'] as const).map(c => ({ label: c === 'max' && isArmed('max') ? 'Sure?' : push && c === 'max' ? 'Push' : BET_LABEL[c], price: b.options.includes(c) ? price(c) : b.why[c] ?? price(c), stamp: ask(c) && !isArmed('max') ? '' : c, kind: c, enabled: b.options.includes(c), onClick: c === 'max' ? confirmed('max', () => void dispatch({ type: 'bet', choice: c })) : () => {
      void dispatch({ type: 'bet', choice: c })
    } }))
    // the bet order, said once before the first bet (the 1er puck carries it after). what Max and Push do is on
    // their tickets' Fiches, and why one is off is on its price chip
    hint = !b.choices.length ? (me.bankroll === view_.others[0].bankroll ? 'You bet first (tied: it alternates).' : 'You bet first: more money goes first.') : ''
  } else if (view_.phase === 'spoils' && view_.spoils?.toPick === me.seat) {
    hint = 'Pick one for your deck.' // the band says who picks first, Skip's Fiche says what skipping pays
    docked = { offers: [], dest: 'deck' }
    announceOnce(`spoils:${view_.round}`, 'Le butin', rule('hud', 'spoils', 1))
    slips = [{ label: 'Skip', price: '+$1', kind: 'skip', enabled: true, onClick: () => void dispatch({ type: 'spoils', cardId: null }) }]
  } else hint = `Waiting on ${rivalFace().name}…`

  // the forced first hand: only the ticket the fée points at works, and Play only with exactly the Pair
  const lesson = settled ? null : lessonNow(view_)
  if (lesson) {
    const exact = selected.size === lesson.want.length && lesson.want.every(id => selected.has(id))
    slips = slips.map(s => ({ ...s, enabled: s.enabled && s.kind === (lesson.slip ?? 'lock') && (s.kind !== 'lock' || exact) }))
  }

  const deadline = online ? online.deadlines[me.seat] : null
  const face = rivalFace()
  showDuel(app, {
    view: { ...view_, me: { ...me, hand: sortHand(me.hand, handSort) } },
    sort: handSort,
    onSort: by => {
      handSort = by
      setPref('sort', by)
      render()
    },
    settled,
    tally,
    counting,
    selected,
    lesson,
    lastLocked,
    slips,
    hint,
    rival: face,
    myMask: face.mask === 'domino_red' ? 'domino' : 'domino_red',
    toast: log.at(-1) ?? '',
    clock: () => (deadline === null || !net ? '' : `${Math.max(0, Math.ceil(net.msLeft(deadline) / 1000))}s`),
    insertSlot,
    onDropInsert: (slot, cardId) => {
      const ins = me.sleeve[slot]
      if (!ins || view_.phase !== 'deal' || me.locked || !me.hand.some(c => c.id === cardId)) return
      const def = INSERTS[ins.id]
      if (def.when === 'shop' || !def.cards[1]) return
      grindPick = false
      const action = { type: 'useInsert' as const, slot, cardIds: [cardId], suit: null }
      if (def.cards[1] === 1 && can(action)) {
        insertSlot = null
        selected = new Set()
        void dispatch(action)
      } else {
        insertSlot = slot
        selected = new Set([cardId])
        render()
      }
    },
    onInsert: slot => {
      const ins = me.sleeve[slot]
      if (!ins || INSERTS[ins.id].when === 'shop') {
        if (ins) log.push(`${INSERTS[ins.id].name} is used in the shop.`)
        return render()
      }
      grindPick = false
      selected = new Set()
      insertSlot = insertSlot === slot ? null : slot
      render()
    },
    onSpoil: cardId => {
      void dispatch({ type: 'spoils', cardId })
    },
    onCard: id => {
      // flamber with no pair: this card gets the +1
      if (grindPick) {
        if (!selected.has(id) || me.hand.find(c => c.id === id)?.bulk) return
        lastLocked = me.hand.filter(c => selected.has(c.id))
        const ids = [...selected]
        selected = new Set()
        grindPick = false
        return void dispatch({ type: 'flamber', cardIds: ids, grind: id })
      }
      // a beer-stained pair is picked and dropped together
      const mate = stuckMate(me.hand.find(c => c.id === id)!, me.hand)
      const on = !selected.has(id)
      for (const x of mate ? [id, mate.id] : [id]) {
        if (on) selected.add(x)
        else selected.delete(x)
      }
      render() // the duel hears the pick (duel.ts listen)
    },
    onPile: () => openDrawer('etui'),
  })
}

// rank: high to low, suits break ties. suit: grouped by suit, high to low inside. bulk has neither, so it goes last
function sortHand(hand: Card[], by: HandSort): Card[] {
  const suit = (c: Card) => SUITS.indexOf(c.suit)
  return [...hand].sort((a, b) => Number(a.bulk) - Number(b.bulk)
    || (by === 'rank' ? b.rank - a.rank || suit(a) - suit(b) : suit(a) - suit(b) || b.rank - a.rank))
}

function handLabel(a: Appraisal): string {
  return [a.hand, ...a.bonus].map(h => HAND_NAMES[h]).join(' + ')
}

// a flambé made a card with more traits than its tier holds: pick which ones it keeps. the merged cards on top,
// one chip per trait with its rule, picking past the cap drops the oldest pick
let forgeKeepPicks: { key: string; keep: number[] } | null = null
function forgePanel(plan: ForgePlan): Panel {
  // the view hands back a fresh plan every render, so the picks key on the cards being merged
  const key = plan.merged.map(c => c.id).join()
  if (forgeKeepPicks?.key !== key) forgeKeepPicks = { key, keep: autoKeep(plan).map(t => plan.candidates.indexOf(t)) }
  const picks = forgeKeepPicks
  const name = `${rankLabel(plan.rank)}${SUIT_GLYPH[plan.suit]}${'★'.repeat(plan.tier)}`
  return {
    title: `${name} holds ${plan.tier} trait${plan.tier > 1 ? 's' : ''}`,
    help: `Pick ${plan.tier} to keep. The rest burn off.`,
    body: (ui, box) => {
      tip('traits', ['Each hand type gives its own trait when you flamber it.', 'A ★ card holds one trait per star. Pick the ones that fit your deck.'], box, 'above')
      const w = 32
      const spots = grid(plan.merged.length, box, w, 4)
      plan.merged.forEach((c, i) => ui.card(c, spots[i].x, spots[i].y, w))
      let y = box.y + CARD_H(w) + 14
      plan.candidates.forEach((t, i) => {
        const e = traitEntry(t, plan.rank)
        const on = picks.keep.includes(i)
        const x = box.x + 20
        const cw = box.w - 40
        const lines = e.text.flatMap(l => wrapText(plainText(l), cw - 12, 'sans'))
        const h = 16 + lines.length * 10
        const over = ui.hit(x, y, cw, h, () => {
          if (on) picks.keep = picks.keep.filter(k => k !== i)
          else picks.keep = [...picks.keep, i].slice(-plan.tier)
          sfx.select(!on)
          render()
        })
        ui.nine('hud/plate/paper', x, y, cw, h, on ? '#e8c260' : over ? '#fff6dc' : undefined)
        ui.fiche(e, x, y, cw, h)
        ui.text(`${on ? '★ ' : ''}${e.name}`, x + 6, y + 3, { bold: true, color: '#2e2320' })
        if (e.tag) ui.text(e.tag, x + cw - 6, y + 4, { font: 'tiny', color: '#5c4a36', align: 'right' })
        lines.forEach((l, j) => ui.text(l, x + 6, y + 14 + j * 10, { color: '#5c4a36' }))
        y += h + 6
      })
    },
    buttons: [{ label: 'Flambé it', price: `${picks.keep.length}/${plan.tier}`, kind: 'go', enabled: picks.keep.length === plan.tier, onClick: () => {
      const traits: Trait[] = picks.keep.map(i => plan.candidates[i])
      forgeKeepPicks = null
      sfx.strike()
      void dispatch({ type: 'forgeKeep', traits })
    } }],
  }
}

// ---------- end of run ----------
// on the bare duel table: won or busted, the score, Le Patron's paper, this seed's leaderboard

let dailyBoard: DailyBoard | null = null // the server's board for the results, fetched once per run end
let boardAsked = false
let receiptAt: number | null = null
let lostQuip = ''

const QUIPS = [
  'Ah, la vie... The cards were cruel tonight.',
  "Don't cry into your absinthe, mon chou.",
  'Pas de chance! The next deal will be kinder.',
  'Even the best flambeurs go home with empty pockets sometimes.',
  'Ouf. Le Patron is already counting your chips.',
]

// what to try next time, from how the run was lost
function lostLesson(alive: boolean, solo: boolean): string {
  if (alive && solo) return "Le Patron wanted his money. Read his note before you shop, and keep that much back."
  if (alive) return 'So close! Your rival just held more chips at the end.'
  return 'Out of money! Bet Max when your hand is strong, Min when it is not. And interest pays you to save.'
}
let receiptLine = -1

// the music follows the screen (docs/MUSIC.md §5): le tabac in the shop and after a won run, la fée verte in boss
// rounds (on the next bar line), the house band everywhere else. a lost run slides the tape down to half speed
function followMusic(): void {
  const view_ = match || online ? v() : null
  const lost = view_?.phase === 'over' && view_.result!.winner !== view_.me.seat
  const scene = view_?.phase === 'shop' || (view_?.phase === 'over' && !lost) ? 'tabac' : lost || view_?.twist ? 'fee' : 'table'
  music.setScene(scene, scene === 'fee' && !lost)
  music.glide(lost ? 0.5 : 1, lost ? 2 : 0.5)
}

function overPanel(): Panel {
  const view_ = v()
  const res = view_.result!
  const me = view_.me
  const them = view_.others[0]
  const won = res.winner === me.seat
  if (receiptAt === null) {
    receiptAt = performance.now()
    lostQuip = QUIPS[Math.floor(Math.random() * QUIPS.length)]
    if (won) sfx.fanfare()
    else sfx.busted()
  }
  // the match ends in the round someone busts, so view_.round is the bust round
  const solo = view_.mode === 'solo' || view_.mode === 'daily'
  const how = won
    ? solo
      ? 'Paid Le Patron off after round 12.'
      : !them.alive
        ? `Busted ${them.name} in round ${view_.round}.`
        : 'Higher bankroll after round 12.'
    : me.alive
      ? solo
        ? "Couldn't pay Le Patron."
        : 'Behind on chips after round 12.'
      : `Out in round ${view_.round}.`
  if (view_.mode === 'daily' && !boardAsked) {
    boardAsked = true
    api<DailyBoard>(`/api/daily?difficulty=${difficulty}`).then(
      b => {
        dailyBoard = b
        render()
      },
      err => console.warn('no daily board:', err),
    )
  }
  const lb = match ? leaderboard(match.config.seed, difficulty) : []
  const menu = () => {
    match = null
    dailyBoard = null
    boardAsked = false
    if (online) leaveOnline()
    else renderTitle()
  }
  const paper = solo && (won || patronMissed)
  return {
    title: won ? (solo ? 'Paid Le Patron' : 'Took the table') : 'Busted',
    help: how,
    felt: true,
    scrim: () => (won ? 0.25 : 0.62),
    body: (ui, box) => {
      const ink = '#2e2320'
      const faded = '#5c4a36'
      const age = still.matches ? 5000 : ui.now - receiptAt!
      // la fée comes back for every lost run, Balatro-style: a quip, then what to try next time (docs/TUTORIAL.md)
      if (!won && age > 900) tip(`lost:${run}`, [lostQuip, lostLesson(me.alive, solo)], { x: 8, y: 236, w: 4, h: 40 }, 'right', { fee: true, again: true })
      if (!still.matches && age < 550) {
        if (won) fit(ui.g, 'fx/leak', { x: -160 + 800 * progress(age, 550), y: 0, w: 160, h: 360 })
        else {
          for (let i = 0; i < 6; i++)
            fit(ui.g, 'scratch/jeton', { x: 155 + (420 + i * 6) * progress(age - i * 20, 350), y: 225 + i * 3, w: 12, h: 8 })
          const radius = Math.max(8, 400 * (1 - progress(age, 530)))
          ui.g.fillStyle = '#0e0b0a'
          ui.g.beginPath()
          ui.g.rect(0, 0, 640, 360)
          ui.g.arc(320, 180, radius, 0, Math.PI * 2, true)
          ui.g.fill()
        }
      }
      if (won) {
        ui.g.save()
        ui.g.translate(125, 210)
        ui.g.rotate(-0.3)
        ui.g.scale(1, 0.68)
        fit(ui.g, `mask/${rivalFace().mask}/front`, { x: -32, y: -25, w: 64, h: 50 })
        ui.g.restore()
      }
      const line = Math.min(26, Math.floor(Math.max(0, age - 470) / 95))
      const seedRows = match ? Math.max(1, Math.min(5, lb.length)) + 1 : 0
      const onlineRows = dailyBoard
        ? 2 + Math.max(1, Math.min(5, dailyBoard.best.length)) + Math.max(1, Math.min(5, dailyBoard.first.length))
        : 0
      const receiptHeight = Math.min(box.h, 88 + (seedRows + onlineRows) * 12 + (dailyBoard ? 12 : 0))
      const printed = Math.min(receiptHeight, 12 + line * 12)
      if (line !== receiptLine && printed < receiptHeight) {
        receiptLine = line
        sfx.thunk()
      }
      ui.nine('fx/receipt', box.x - 3, box.y - 3, box.w + 6, printed + 8)
      ui.g.save()
      ui.g.beginPath()
      ui.g.rect(box.x, box.y, box.w, printed)
      ui.g.clip()
      let y = box.y
      if (solo && won) {
        ui.text(`Score ${fmt(res.scores[me.seat])} pts`, box.x, y, { font: 'didone', color: '#7a1a2c' })
        y += 22
      }
      ui.text(`Best appraisal: ${fmt(best.total)}${best.hand ? ` (${best.hand})` : ''}`, box.x, y, { color: ink, bold: true })
      y += 12
      ui.text(`You $${me.bankroll} · ${them.name} $${them.bankroll}`, box.x, y, { color: ink })
      y += 12
      if (match) {
        ui.text(`Seed ${match.config.seed} · ${DIFFICULTIES[difficulty].name}`, box.x, y, { color: faded })
        y += 12
      }
      // le patron's paper on the right: the marker stamped paid, or his ledger stamped unpaid
      if (paper) {
        const px = box.x + box.w - 96
        fit(ui.g, won ? 'hud/marker/note' : 'patron/ledger', { x: px, y: box.y, w: 90, h: 64 })
        fit(ui.g, won ? 'hud/marker/paid' : 'hud/marker/unpaid', { x: px + 4, y: box.y + 18, w: won ? 64 : 82, h: 24 })
        if (won) fit(ui.g, 'hud/marker/seal', { x: px + 68, y: box.y + 40, w: 22, h: 22 })
        ui.fiche(entry('hud', 'marker'), px, box.y, 90, 64)
      }
      y = Math.max(y, box.y + 70) + 6
      const table = (title: string, rows: string[][]) => {
        ui.text(title, box.x, y, { color: '#7a1a2c', bold: true })
        y += 12
        if (!rows.length) {
          ui.text('Nobody yet. Be first.', box.x, y, { color: faded })
          y += 12
        }
        for (const r of rows) {
          r.forEach((cell, i) => ui.text(cell, box.x + [0, 22, 110, 160, 200][i], y, { color: ink }))
          y += 11
        }
        y += 6
      }
      if (match)
        table(
          'This seed, this browser',
          lb
            .slice(0, 5)
            .map((e, i) => [
              `#${i + 1}`,
              `${fmt(e.score ?? 0)} pts`,
              `$${e.bankroll}`,
              e.won ? 'won' : 'lost',
              `best ${fmt(e.best)}`,
            ]),
        )
      if (dailyBoard) {
        const rows = (list: BoardRow[]) =>
          list
            .slice(0, 5)
            .map((r, i) => [
              `#${i + 1}`,
              r.name,
              `${fmt(r.score)} pts`,
              r.attempts ? `${r.attempts} tr${r.attempts === 1 ? 'y' : 'ies'}` : '',
            ])
        table(`Online daily ${dailyBoard.day} · best run`, rows(dailyBoard.best))
        table('First try', rows(dailyBoard.first))
      }
      ui.g.restore()
    },
    buttons: match
      ? [
          { label: 'Main menu', kind: 'back', enabled: true, onClick: menu },
          { label: 'Same seed again', kind: 'go', enabled: true, onClick: () => startRun(match!.config.seed) },
        ]
      : [{ label: 'Main menu', kind: 'go', enabled: true, onClick: menu }],
  }
}

// ---------- the glossary ----------

// the carnet's glossary: rule words first, then card modifiers, then everything else that has rules
const CARNET: Kind[] = ['keyword', 'finish', 'stamp', 'knockoff', 'tier', 'trait', 'variant', 'joker', 'bulk', 'insert', 'pochette', 'twist', 'keeper', 'hud']

function carnetEntries(): Entry[] {
  return CARNET.flatMap(kind => glossaryIds(kind).map(id => entry(kind, id)))
}

// ---------- boot ----------
const QUICK = import.meta.env.DEV && new URLSearchParams(location.search).has('quick')
// already signed in (cookie) = straight online. no server (offline vite, plane) = solo only
api<{ player: PlayerInfo | null }>('/api/me').then(r => {
  player = r.player
  if (player && !QUICK) startNet() // ?quick stays offline
  else if (joinCode) notice = `Pick a name to join room ${joinCode}`
  if (!online && !match) renderTitle() // don't draw over a solo run started before this came back
}, err => {
  console.warn('no game server, online play is off:', err)
})

await Promise.all([loadArt(), loadFonts()])
await Promise.all([loadLogo(), loadTitle()])
setKeywords(KEYWORDS)
setGlossary(carnetEntries())
artReady = true
if (joinCode) panTo(2) // came in on a room link: start down in the sewers, where joining happens
if (QUICK) quickStart()
else if (new URLSearchParams(location.search).has('first')) firstRun() // also the golden-path demo run
else renderTitle()

// dev only: ?quick&auto plays your seat with the bot through the real ui, a full run with every screen drawn.
// &burn flambés every pair it would have played, to watch the flambé beat in a real run. &pace=ms waits that long
// between its moves (a person's speed, for the trailer), 120 by default
if (QUICK && new URLSearchParams(location.search).has('auto')) {
  const burn = new URLSearchParams(location.search).has('burn')
  const pace = Number(new URLSearchParams(location.search).get('pace') ?? 120)
  setInterval(() => {
    if (busy || counting || !match || flambeBusy()) return
    if (match.phase === 'over') {
      document.body.dataset.autoDone = '1'
      return
    }
    if (resultHold) {
      resultHold = false
      tallyHold = false
      return render()
    }
    if (!pending(match).includes(ME)) return
    let a = botAction(match, ME)
    if (burn && a.type === 'play') {
      const hand = view(match, ME).me.hand
      if (forgePlan(a.cardIds.map(id => hand.find(c => c.id === id)!))) a = { type: 'flamber', cardIds: a.cardIds, grind: null }
    }
    void dispatch(a)
  }, pace)
}
