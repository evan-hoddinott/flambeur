// the game ui. the table is the pixel art duel scene (ui/duel.ts), the shop is the tabac (ui/shop.ts),
// the other screens (and the shop's binder, grading and pack overlays) are still the throwaway dom harness.
// it renders only from a SeatView: offline it runs step() itself, online the server does and sends the view over net.ts
import { JOKERS, SUITS, SUIT_GLYPH, cardName, playSlots, rankLabel, stuckMate, traitName, type Card, type Trait } from './engine/cards.ts'
import { describe, getDef } from './engine/collectibles.ts'
import { COLLECTIBLE_PRICE, PLAY_SIZE, SHIPPERS, tableOf, type Shipper } from './engine/economy.ts'
import { DRAFT_PICKS, getStarter, type StarterId } from './engine/starters.ts'
import { pileView } from './engine/deck.ts'
import { HAND_NAMES, type HandType } from './engine/hands.ts'
import { randomSeed } from './engine/rng.ts'
import { autoKeep, type ForgePlan } from './engine/forge.ts'
import {
  DIFFICULTIES, botAction, canGrade, defaultToDeck, legal, newMatch, pending, step, view,
  type Action, type BetChoice, type Difficulty, type Event, type Match, type SeatView,
} from './engine/match.ts'
import { api, connect, type PlayerInfo, type ServerMsg, type Status } from './net.ts'
import type { Appraisal } from './engine/scoring.ts'
import { INSERTS, type PackKind } from './engine/shop.ts'
import { twistName, twistText } from './engine/twists.ts'
import { getSleeve, type Stonks } from './engine/sleeves.ts'
import * as sfx from './ui/sound.ts'
import { loadArt, cardCanvas, canvasUrl } from './ui/art.ts'
import { loadFonts } from './ui/font.ts'
import { loadLogo } from './ui/logo.ts'
import { loadTitle, panTo, showTitle, type TitleOnline } from './ui/title.ts'
import { showDuel, say, countUp as duelCountUp, cardInfo, type Slip } from './ui/duel.ts'
import { showShop, keeperSays, ringBell } from './ui/shop.ts'

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
let seenChoices = 0 // bet choices already in the log, so the rival's show up once
let autoSent = new Set<string>() // round-1 auto moves already sent this match, so a reject can't loop them
let difficulty: Difficulty = 'medium'
let best = { total: 0, hand: '' }
let busy = false // true while bots act or animations run, so clicks don't double-fire
let counting = false // meters start at 0 while the count-up runs
// ui-only state. never game state: that all lives in the match
let selected = new Set<number>()
let pack: { ripped: boolean; flipped: Set<number>; toDeck: Set<number> } | null = null
let log: string[] = []
let resultHold = false // keep showing the settled round until "continue"
let lastLocked: Card[] = [] // my locked cards, so a fold or forge result can still show them
let countedRound = 0 // the count-up runs once per showdown
let binderOpen = false // the shop's binder overlay, kept open across renders while you sell
let binderPicked = new Set<number>()
let vitrineOpen = false

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const fmt = (n: number) => n.toLocaleString('en-US')
const v = (): SeatView => online?.view ?? view(match!, ME)
const mySeat = () => v().me.seat

// greys out buttons. offline it's the real legal(). online the server has the full state, so this only rules out
// what the view already shows can't work, and the server rejects the rest
function can(a: Action): boolean {
  if (match) return legal(match, ME).some(l => JSON.stringify(l) === JSON.stringify(a))
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

// my action, then the bots catch up. bets get a pause so you can watch the rival decide.
// online it just goes to the server, and busy clears on its ok or reject
async function dispatch(action: Action): Promise<void> {
  if (busy) return
  if (online) {
    // false = socket not open. the click is dropped and the reconnect brings a fresh view
    if (net!.act(action)) busy = true
    return
  }
  if (!match) return
  busy = true
  try {
    const res = step(match, ME, action)
    match = res.match
    onEvents(res.events.filter(e => e.to === ME || e.to === 'all').map(e => e.event))
    await runBots()
  } finally {
    busy = false
  }
  render()
}

async function runBots(): Promise<void> {
  for (;;) {
    const m = match!
    if (m.phase === 'over') return
    const bot = pending(m).find(s => s !== ME)
    // simultaneous phases: the bot goes once I'm done, so it never shops off what I just did
    if (bot === undefined || (pending(m).includes(ME) && m.phase !== 'bet')) return
    const action = botAction(m, bot)
    if (m.phase === 'bet' && action.type === 'bet') {
      render()
      await sleep(800)
      log.push(`Rival: <b>${BET_LABEL[action.choice]}</b>`)
      say(action.choice)
    }
    const dealing = m.phase === 'shop'
    const res = step(m, bot, action)
    match = res.match
    onEvents(res.events.filter(e => e.to === ME || e.to === 'all').map(e => e.event))
    if (dealing && match.phase === 'deal') log = [`Round ${match.round} · the rival has <b>$${v().others[0].bankroll}</b>.`]
  }
}

function onEvents(events: Event[]): void {
  for (const e of events) {
    if (e.kind === 'packOpened') pack = { ripped: false, flipped: new Set(), toDeck: new Set(e.contents.cards.filter(defaultToDeck).map(c => c.id)) }
    if (e.kind === 'roundEnd') resultHold = true
    if (e.kind === 'scratched') {
      const what = e.hand ? `: ${HAND_NAMES[e.hand]} +1 level` : e.collectible ? `: ${getDef(e.collectible.id).name}` : e.joker ? `: ${JOKERS[e.joker.joker!].name} (${cardName(e.joker)})` : ', pick a card'
      log.push(`Scratched a <b class="gold">${INSERTS[e.insert].name}</b>${what}.`)
      sfx.flip(e.insert === 'grail')
    }
    if (e.kind === 'graded') log.push(`Back from grading: <b>${cardName(e.card)}</b> came back a <b class="gold">${e.card.grade}</b>.`)
    if (e.kind === 'showdown' && e.showdown.mine.total > best.total) best = { total: e.showdown.mine.total, hand: handLabel(e.showdown.mine) }
  }
}

// ---------- online ----------

function startNet(): void {
  if (net) return
  net = connect(onServer, s => {
    netStatus = s
    // an action in flight on a dead socket never gets its ok/reject
    if (s !== 'online') busy = false
    const dot = document.getElementById('netdot')
    if (dot) dot.textContent = s
    if (s === 'online' && joinCode) {
      net!.joinRoom(joinCode)
      joinCode = null
      history.replaceState(null, '', '/')
    }
  })
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
    best = { total: 0, hand: '' }
    log = []
    resultHold = false
    pack = null
    selected = new Set()
    autoSent = new Set()
    countedRound = next.last?.round ?? 0
  }
  online = { view: next, deadlines }
  const choices = next.bet?.choices ?? []
  const rival = next.others[0]
  for (const c of choices.slice(seenChoices)) {
    if (c.seat === next.me.seat) continue
    log.push(`${rival.name}: <b>${BET_LABEL[c.choice]}</b>`)
    say(c.choice)
  }
  seenChoices = choices.length
  if (prev && prev.phase !== 'deal' && next.phase === 'deal') log = [`Round ${next.round} · ${rival.name} has <b>$${rival.bankroll}</b>.`]
  if (prev) onEvents(events)
  // the rival's moves in a phase you both play at once only change `others`, which these screens don't show.
  // skipping the redraw keeps open overlays (draft picks, the deck viewer) from resetting under you
  const quiet = prev && !events.length && ['draft', 'shop', 'forgePick'].includes(next.phase)
    && JSON.stringify({ ...prev, others: null }) === JSON.stringify({ ...next, others: null })
  if (!quiet) render()
}

function leaveOnline(): void {
  online = null
  net?.forgetMatch()
  renderTitle()
}

// my seat's server clock, ticking in the top bar
setInterval(() => {
  const el = document.getElementById('clock')
  if (!el || !online || !net) return
  const d = online.deadlines[online.view.me.seat]
  el.textContent = d === null ? '' : `${Math.max(0, Math.ceil(net.msLeft(d) / 1000))}s`
}, 250)

// ---------- small render helpers ----------
function cardHtml(card: Card, cls = ''): string {
  const info = cardInfo(card)
  return `<div class="card art ${cls}" data-id="${card.id}" title="${cardName(card)}${info ? ` · ${info}` : ''}"><img src="${canvasUrl(cardCanvas(card))}" alt="${cardName(card)}">${info && !cls.includes('mini') ? `<span class="tag">${info}</span>` : ''}</div>`
}

function caseHtml(sellable: boolean): string {
  const me = v().me
  const slots = me.display.map((o, i) => {
    const def = getDef(o.id)
    const sell = sellable ? `<button class="ghost" data-sellcol="${i}">Sell $${Math.floor(COLLECTIBLE_PRICE[def.rarity] / 2)}</button>` : ''
    return `<div class="item ${def.rarity}" data-slot="${i}"><b>${def.name}</b><span>${describe(o)}</span><div class="rar">${def.rarity}</div>${sell}</div>`
  })
  for (let i = me.display.length; i < me.displaySlots; i++) slots.push('<div class="item empty">empty slot</div>')
  return `<div class="panel"><h3 style="margin-bottom:10px">Display case</h3><div class="case">${slots.join('')}</div></div>`
}

function sideHtml(): string {
  const me = v().me
  const lv = Object.entries(me.levels).filter(([, n]) => n > 0)
  const parts: string[] = []
  if (me.sleeves.length) parts.push(`<h3 style="margin-bottom:6px">Sleeves</h3>${me.sleeves.map(id => `<div class="muted"><b class="gold">${getSleeve(id).name}</b> · ${getSleeve(id).text}</div>`).join('')}`)
  if (lv.length) parts.push(`<h3 style="margin:8px 0 6px">Code cards</h3>${lv.map(([h, n]) => `<div class="muted">${HAND_NAMES[h as HandType]} lv${n + 1}</div>`).join('')}`)
  return caseHtml(v().phase === 'shop') + (parts.length ? `<div class="panel" style="margin-top:12px">${parts.join('')}</div>` : '')
}

function stonksText(st: Stonks): string {
  if (st.kind === 'rank') return `${rankLabel(st.rank)}s ×3`
  if (st.kind === 'suit') return `${SUIT_GLYPH[st.suit]} ×3`
  return `${st.finish} ×2`
}

function topHtml(): string {
  const view_ = v()
  const t = view_.nextTwist
  const twistChip = t ? `<span class="chip" title="${twistText(t.twist)}">${t.round === view_.round ? 'This round' : `Round ${t.round}`}: <b class="gold">${twistName(t.twist)}</b></span>` : ''
  return `<div class="top">
    <h2>FLAM<span class="gold">BEUR</span></h2>
    <div class="chips">
      <span class="chip">Round <b>${view_.round}/${view_.lastRound ?? '∞'}</b> · Table <b>${tableOf(view_.round)}</b></span>
      <span class="chip">Bankroll <b>$${view_.me.bankroll}</b></span>
      <span class="chip">Ante/Max <b>$${view_.blinds.ante}/$${view_.blinds.max}</b></span>
      <button class="chip" id="deckview" style="cursor:pointer;color:inherit;min-height:0">Deck <b>${view_.me.pile.length}</b> pile / <b>${view_.me.discard.length}</b> discard · Binder <b>${view_.me.binder.length}</b></button>
      <span class="chip">STONKS <b class="hot">${stonksText(view_.stonks)}</b></span>
      ${match ? `<span class="chip">Seed <b>${match.config.seed}</b></span>` : ''}
      ${view_.me.starter ? `<span class="chip">Box <b>${getStarter(view_.me.starter).name}</b></span>` : ''}
      <span class="chip">${match ? `Rival · ${DIFFICULTIES[difficulty].name}` : `${view_.mode} vs <b>${view_.others[0].name}</b>`}</span>
      ${online ? '<span class="chip" id="clock"></span><span class="chip" id="netdot">' + netStatus + '</span>' : ''}
      ${twistChip}
    </div>
  </div>`
}

// pile, discard and binder. the view already sorts the pile so it never shows draw order
function showDeckViewer(): void {
  const me = v().me
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  const section = (title: string, cards: Card[]) => {
    const pv = pileView(cards)
    const ranks = [...pv.byRank.entries()].sort((a, b) => b[0] - a[0]).map(([r, n]) => `${rankLabel(r)}×${n}`).join(' ')
    const suits = [...pv.bySuit.entries()].map(([su, n]) => `${SUIT_GLYPH[su]}${n}`).join(' ')
    return `<div class="panel" style="margin-top:10px;text-align:left"><b>${title} · ${cards.length}</b> <span class="muted small">${ranks} · ${suits}${pv.bulk ? ` · bulk ${pv.bulk}` : ''}</span>
      <div class="binder" style="margin-top:8px">${pv.cards.map(c => cardHtml(c, 'mini')).join('')}</div></div>`
  }
  overlay.innerHTML = `<div class="packbox" style="max-width:900px"><h2>Your deck · ${me.pile.length + me.discard.length + me.hand.length} cards</h2>
    ${section('Pile', me.pile)}${section('Discard (back next Table)', me.discard)}${section('Binder (never drawn, sell it at the shop)', me.binder)}
    <div class="row" style="justify-content:center;margin-top:12px"><button id="closeview">Close</button></div></div>`
  document.body.appendChild(overlay)
  document.getElementById('closeview')!.onclick = () => overlay.remove()
}

function bindCommon(): void {
  const dv = document.getElementById('deckview')
  if (dv) dv.onclick = () => showDeckViewer()
  app.querySelectorAll<HTMLElement>('[data-sellcol]').forEach(el => {
    el.onclick = () => {
      sfx.coin()
      void dispatch({ type: 'sellCollectible', slot: Number(el.dataset.sellcol) })
    }
  })
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
  } catch {
    // private window etc, the leaderboard just doesn't persist
  }
}

function lbTable(title: string, lb: Score[]): string {
  if (!lb.length) return ''
  return `<div class="panel lb"><b>${title}</b><table>${lb.map((e, i) => `<tr><td>#${i + 1}</td><td><b>${fmt(e.score ?? 0)}</b> pts</td><td>$${e.bankroll}</td><td>${e.won ? 'won' : 'lost'}</td><td>best ${fmt(e.best)}</td></tr>`).join('')}</table></div>`
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
    random: () => startRun(randomSeed()),
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

// the run-end screen's copy of the server's daily board: best run and first try
async function fillBoard(): Promise<void> {
  const lb = await api<DailyBoard>(`/api/daily?difficulty=${difficulty}`)
  const el = document.getElementById('board')
  if (!el) return
  const table = (title: string, rows: BoardRow[]) => `<div class="panel lb" style="margin-top:10px"><b>${title}</b>${rows.length
    ? `<table>${rows.slice(0, 10).map((r, i) => `<tr><td>#${i + 1}</td><td>${r.name}</td><td><b>${fmt(r.score)}</b> pts</td>${r.attempts ? `<td>${r.attempts} tr${r.attempts === 1 ? 'y' : 'ies'}</td>` : ''}</tr>`).join('')}</table>`
    : '<p class="muted small">Nobody yet. Be first.</p>'}</div>`
  el.innerHTML = table(`Online daily ${lb.day} · ${DIFFICULTIES[difficulty].name} · best run`, lb.best) + table('First try', lb.first)
}

function startRun(seed: string, autoplay = false): void {
  autoSent = new Set()
  best = { total: 0, hand: '' }
  log = []
  resultHold = false
  pack = null
  countedRound = 0
  match = newMatch({ mode: 'solo', seed, seats: [{ kind: 'human', name: 'You', ...(autoplay ? { style: 'house' } : {}) }, { kind: 'bot', name: 'Rival', difficulty }] })
  render()
}

// dev only: ?quick drafts and shops for you (house bot style) straight to the first deal, for testing the table.
// ?quick&shop plays on (house bot style) until the round 2 shop, for testing the tabac
function quickStart(): void {
  startRun(randomSeed(), true)
  let m = match!
  const toShop = new URLSearchParams(location.search).has('shop')
  const going = () => toShop ? m.phase !== 'over' && !(m.phase === 'shop' && m.round >= 2) : m.phase === 'draft' || m.phase === 'shop'
  while (going()) {
    const seat = pending(m)[0]
    m = step(m, seat, botAction(m, seat)).match
  }
  match = m
  render()
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
  if (view_ && resultHold && sd && view_.last && countedRound !== view_.last.round && !counting) {
    countedRound = view_.last.round
    counting = true
    busy = true
    draw()
    await duelCountUp(sd)
    counting = false
    busy = false
    if (sd.winner === mySeat()) sfx.win()
    else if (sd.winner !== null) sfx.lose()
  }
  draw()
}

function draw(): void {
  document.querySelectorAll('.overlay').forEach(o => o.remove())
  if (!match && !online) return renderTitle()
  const view_ = v()
  if (resultHold && view_.last) return renderTable()
  if (view_.phase === 'over') return renderOver()
  // online, you can finish the draft or shop before the other player does
  if (view_.me.done && (view_.phase === 'draft' || view_.phase === 'shop')) {
    app.innerHTML = `${topHtml()}<div class="panel" style="margin-top:12px"><p class="center muted">Waiting on ${view_.others[0].name}…</p></div>`
    return bindCommon()
  }
  if (view_.phase === 'draft') return view_.me.starter ? renderDraft() : renderStarterBox()
  if (view_.phase === 'shop') {
    if (view_.me.shop?.open) return renderPack()
    if (view_.me.shop?.scratch) return renderInsertPick(view_.me.shop.scratch)
    // round 1 has no shop, just the free pack: rip it straight away
    if (view_.round === 1) {
      const free = view_.me.shop!.offers.findIndex(o => o.type === 'pack' && !o.sold)
      const action: Action = free >= 0 ? { type: 'buy', slot: free } : { type: 'leaveShop' }
      if (!busy && !autoSent.has(action.type)) {
        autoSent.add(action.type)
        void dispatch(action)
      }
      return
    }
    return renderShop()
  }
  if (view_.phase === 'forgePick' && view_.me.forge) return renderForgePick(view_.me.forge)
  return renderTable()
}

// ---------- draft ----------
function starterArt(id: StarterId | 'sealed'): string {
  const url = new URL(`../art/packaging/starters/${id}.png`, import.meta.url).href
  return `<span class="box-tray"><img src="${url}" width="88" height="112" alt=""></span>`
}

function renderStarterBox(): void {
  const offer = v().me.draft!.offer
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  document.body.appendChild(overlay)
  let ripped = false
  const paint = () => {
    const body = !ripped
      ? `<button class="package-button" id="srip" aria-label="Open starter box">${starterArt('sealed')}</button><p class="muted">Open your starter box.</p>`
      : `<p class="muted">Choose a starter box.</p>
        <div class="starter-tray">${offer.map(id => {
          const s = getStarter(id)
          return `<button class="starter-choice reveal" data-starter="${id}">${starterArt(id)}<strong>${s.name}</strong><span>${s.deckText}</span><span class="starter-twist">${s.twist}</span></button>`
        }).join('')}</div>`
    overlay.innerHTML = `<div class="packbox"><h2>${match ? `Seed ${match.config.seed}` : 'Starter box'}</h2>${body}</div>`
    const rip = overlay.querySelector<HTMLButtonElement>('#srip')
    if (rip) rip.onclick = async () => {
      rip.disabled = true
      rip.classList.add('shake')
      sfx.rip()
      await sleep(450)
      ripped = true
      sfx.flip(true)
      paint()
    }
    overlay.querySelectorAll<HTMLElement>('[data-starter]').forEach(el => {
      el.onclick = () => void dispatch({ type: 'pickBox', box: el.dataset.starter as StarterId })
    })
  }
  paint()
}

function renderDraft(): void {
  const me = v().me
  const rows = me.draft!.rows!
  const picked = new Set<number>([0, 1, 2])
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  document.body.appendChild(overlay)
  const paint = () => {
    overlay.innerHTML = `<div class="packbox" style="max-width:900px"><h2>${getStarter(me.starter!).name}</h2>
      <p class="muted">Keep ${DRAFT_PICKS} rows. That's your ${DRAFT_PICKS * rows[0].cards.length} card deck.</p>
      ${rows.map((row, i) => `<div class="panel" data-row="${i}" style="margin-top:10px;cursor:pointer;${picked.has(i) ? 'border-color:var(--gold)' : 'opacity:.5'}">
        <div class="muted small">${picked.has(i) ? '★ ' : ''}${row.label}</div>
        <div class="hand" style="margin-top:6px">${row.cards.map(c => cardHtml(c)).join('')}</div></div>`).join('')}
      <div class="row" style="justify-content:center;margin-top:12px"><button id="keeprows" ${picked.size !== DRAFT_PICKS ? 'disabled' : ''}>Keep these ${picked.size}/${DRAFT_PICKS}</button></div>
    </div>`
    overlay.querySelectorAll<HTMLElement>('[data-row]').forEach(el => {
      el.onclick = () => {
        const i = Number(el.dataset.row)
        if (picked.has(i)) picked.delete(i)
        else picked.add(i)
        paint()
      }
    })
    document.getElementById('keeprows')!.onclick = () => {
      if (picked.size === DRAFT_PICKS) void dispatch({ type: 'draft', rows: [...picked].sort() })
    }
  }
  paint()
}

// ---------- pack opening ----------
const PACK_NAMES: Record<PackKind, string> = { free: 'Free Pack', offbrand: 'Off-Brand', repack: 'Repack', collector: 'Collector Pack' }

function glowFor(card: Card): string {
  if (card.finish === 'prism') return 'var(--gold)'
  if (card.finish || card.stamp) return card.stamp ? 'var(--green)' : 'var(--blue)'
  return '#e8e8e8'
}

function renderPack(): void {
  const open = v().me.shop!.open!
  if (!pack) pack = { ripped: false, flipped: new Set(), toDeck: new Set(open.cards.filter(defaultToDeck).map(c => c.id)) }
  const p = pack
  // older servers sent the contents without the lane. each lane has a unique collation.
  const kind = open.kind ?? (open.codeCard ? 'collector' : open.cards.length === 5 ? 'offbrand' : open.cards.length === 4 ? 'repack' : 'free')
  const allFlipped = open.cards.every(c => p.flipped.has(c.id))
  let body: string
  if (!p.ripped) {
    const url = new URL(`../art/packaging/boosters/${kind}.png`, import.meta.url).href
    body = `<button class="package-button" id="rip" aria-label="Rip open ${PACK_NAMES[kind]}"><img src="${url}" width="72" height="104" alt=""></button><p class="muted">Rip it open.</p>`
  } else {
    const pulls = open.cards.map(c => {
      if (!p.flipped.has(c.id)) return `<div class="pull"><div class="glowback" style="--glow:${glowFor(c)}" data-flip="${c.id}"></div><span class="muted small">?</span></div>`
      const deck = p.toDeck.has(c.id)
      return `<div class="pull reveal">${cardHtml(c)}<button class="${deck ? '' : 'ghost'}" data-sort="${c.id}">${deck ? 'Deck' : 'Binder'}</button></div>`
    })
    if (allFlipped && open.codeCard) pulls.push(`<div class="pull reveal"><div class="extra code">CODE CARD<br>${HAND_NAMES[open.codeCard]} +1 level</div><span class="muted small">auto-applied</span></div>`)
    if (allFlipped && open.collectible) {
      const def = getDef(open.collectible.id)
      const room = v().me.display.length < v().me.displaySlots
      pulls.push(`<div class="pull reveal"><div class="extra col">★ ${def.name}<br><span class="small" style="color:#d5cde8">${describe(open.collectible)}</span></div><span class="muted small">${room ? 'goes in your case' : `case full, sells for $${Math.floor(COLLECTIBLE_PRICE[def.rarity] / 2)}`}</span></div>`)
    }
    body = `<div class="pulls">${pulls.join('')}</div>
      <div class="row" style="justify-content:center">${allFlipped ? '<button id="done">Done</button>' : '<button class="ghost" id="all">Reveal all</button>'}</div>`
  }
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `<div class="packbox"><h2>${PACK_NAMES[kind]}</h2>${body}</div>`
  document.body.appendChild(overlay)

  const ripEl = overlay.querySelector<HTMLButtonElement>('#rip')
  if (ripEl) ripEl.onclick = async () => {
    ripEl.disabled = true
    ripEl.classList.add('shake')
    sfx.rip()
    await sleep(450)
    p.ripped = true
    render()
  }
  const flip = (id: number) => {
    if (p.flipped.has(id)) return
    const card = open.cards.find(c => c.id === id)!
    p.flipped.add(id)
    sfx.flip(card.finish === 'prism' || card.stamp !== null)
  }
  overlay.querySelectorAll<HTMLElement>('[data-flip]').forEach(el => {
    el.onclick = () => {
      flip(Number(el.dataset.flip))
      render()
    }
  })
  overlay.querySelectorAll<HTMLElement>('[data-sort]').forEach(el => {
    el.onclick = () => {
      const id = Number(el.dataset.sort)
      if (p.toDeck.has(id)) p.toDeck.delete(id)
      else p.toDeck.add(id)
      render()
    }
  })
  const allEl = document.getElementById('all')
  if (allEl) allEl.onclick = async () => {
    for (const c of open.cards) {
      if (p.flipped.has(c.id)) continue
      flip(c.id)
      render()
      await sleep(220)
    }
  }
  const doneEl = document.getElementById('done')
  if (doneEl) doneEl.onclick = () => {
    const toDeck = [...p.toDeck]
    pack = null
    sfx.coin()
    void dispatch({ type: 'sortPack', toDeck })
  }
}

// ---------- shop ----------

function renderShop(): void {
  const view_ = v()
  const me = view_.me
  const shop = me.shop!
  const toast = log.filter(l => l.startsWith('Back from grading') || l.startsWith('Scratched')).at(-1)?.replace(/<[^>]+>/g, '') ?? ''
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
    canGrade: !shop.shipped && !me.shipping,
    onBuy: slot => {
      sfx.coin()
      if (shop.offers[slot].type !== 'pack') keeperSays('Bon.')
      void dispatch({ type: 'buy', slot })
    },
    onRestock: () => {
      ringBell()
      keeperSays('Pfff.')
      void dispatch({ type: 'restock' })
    },
    onBinBulk: () => void dispatch({ type: 'binBulk' }),
    onGrading: () => pickDeckCardToGrade(),
    onBinder: () => {
      binderOpen = true
      binderPicked = new Set()
      render()
    },
    onVitrine: () => {
      vitrineOpen = true
      render()
    },
    onPile: () => showDeckViewer(),
    onLeave: () => void dispatch({ type: 'leaveShop' }),
  })
  if (binderOpen) showBinder()
  if (vitrineOpen) showVitrine()
}

// the binder over the counter: tap cards to pick them, then sell them all. stonks-hot cards say so
function showBinder(): void {
  const view_ = v()
  const me = view_.me
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  document.body.appendChild(overlay)
  for (const id of binderPicked) if (!me.binder.some(c => c.id === id)) binderPicked.delete(id)
  const paint = () => {
    const cards = me.binder.map(c => {
      const ok = can({ type: 'sell', cardId: c.id })
      return `<div class="slot" data-pick="${c.id}" style="cursor:${ok ? 'pointer' : 'not-allowed'};opacity:${ok ? 1 : 0.5}">${cardHtml(c, `mini ${binderPicked.has(c.id) ? 'sel' : ''}`)}</div>`
    })
    const n = binderPicked.size
    overlay.innerHTML = `<div class="packbox" style="max-width:900px"><h2>Binder · ${me.binder.length}</h2>
      <p class="muted">Tap cards to pick them, then sell. Today's hot: <span class="hot">${stonksText(view_.stonks)}</span>.</p>
      ${cards.length ? `<div class="binder" style="justify-content:center">${cards.join('')}</div>` : '<p class="muted">Empty. Pulls you send to the binder land here.</p>'}
      <div class="row" style="justify-content:center;margin-top:12px">
        <button data-buy id="sellpicked" ${n ? '' : 'disabled'}>Sell ${n || ''} picked</button>
        <button class="ghost" id="closebinder">Close</button>
      </div></div>`
    overlay.querySelectorAll<HTMLElement>('[data-pick]').forEach(el => {
      el.onclick = () => {
        const id = Number(el.dataset.pick)
        if (!can({ type: 'sell', cardId: id })) return
        if (binderPicked.has(id)) binderPicked.delete(id)
        else binderPicked.add(id)
        paint()
      }
    })
    document.getElementById('closebinder')!.onclick = () => {
      binderOpen = false
      overlay.remove()
    }
    document.getElementById('sellpicked')!.onclick = async () => {
      const ids = [...binderPicked]
      binderPicked = new Set()
      sfx.coin()
      keeperSays('Mouais.')
      for (const id of ids) await dispatch({ type: 'sell', cardId: id })
    }
  }
  paint()
}

// your collectibles, sellable while you're in the shop
function showVitrine(): void {
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `<div class="packbox" style="max-width:900px"><h2>La Vitrine</h2>${caseHtml(true)}
    <div class="row" style="justify-content:center;margin-top:12px"><button class="ghost" id="closevitrine">Close</button></div></div>`
  document.body.appendChild(overlay)
  overlay.querySelectorAll<HTMLElement>('[data-sellcol]').forEach(el => {
    el.onclick = () => {
      sfx.coin()
      void dispatch({ type: 'sellCollectible', slot: Number(el.dataset.sellcol) })
    }
  })
  document.getElementById('closevitrine')!.onclick = () => {
    vitrineOpen = false
    overlay.remove()
  }
}

function pickDeckCardToGrade(): void {
  const me = v().me
  let shipper: Shipper = 'poste'
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  document.body.appendChild(overlay)
  const paint = () => {
    const cards = [...me.pile, ...me.discard, ...me.binder].filter(c => can({ type: 'ship', cardId: c.id, shipper }))
    const shippers = (Object.keys(SHIPPERS) as Shipper[]).map(id => {
      const sh = SHIPPERS[id]
      return `<button class="${id === shipper ? '' : 'ghost'}" data-shipper="${id}" ${sh.price < me.bankroll ? '' : 'disabled'}>${sh.name} $${sh.price}<br><span class="small">${sh.text}</span></button>`
    }).join('')
    overlay.innerHTML = `<div class="packbox" style="max-width:900px"><h2>Grading desk</h2>
      <p class="muted">Ship one card. It's away for a round and comes back graded 1–10 at the next shop. Fresh pulls grade higher. One per shop.</p>
      <div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap">${shippers}</div>
      <div class="binder" style="justify-content:center;margin-top:12px">${cards.map(c => `<div class="slot" data-pickgrade="${c.id}" style="cursor:pointer">${cardHtml(c, 'mini')}</div>`).join('')}</div>
      <div class="row" style="justify-content:center;margin-top:12px"><button class="ghost" id="cancelgrade">Cancel</button></div></div>`
    document.getElementById('cancelgrade')!.onclick = () => overlay.remove()
    overlay.querySelectorAll<HTMLElement>('[data-shipper]').forEach(el => {
      el.onclick = () => {
        shipper = el.dataset.shipper as Shipper
        paint()
      }
    })
    overlay.querySelectorAll<HTMLElement>('[data-pickgrade]').forEach(el => {
      el.onclick = () => {
        sfx.coin()
        void dispatch({ type: 'ship', cardId: Number(el.dataset.pickgrade), shipper })
      }
    })
  }
  paint()
}

// a scratched checklist or wishlist: pick the card (and for a checklist, the new suit)
function renderInsertPick(kind: 'checklist' | 'wishlist'): void {
  const me = v().me
  const cards = kind === 'wishlist' ? me.binder : [...me.pile, ...me.discard].filter(c => !c.bulk)
  let picked: Card | null = null
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  document.body.appendChild(overlay)
  const paint = () => {
    const suits = kind === 'checklist' && picked
      ? `<div class="row" style="justify-content:center;margin-top:12px">${SUITS.filter(x => x !== picked!.suit).map(x => `<button data-suit="${x}">${SUIT_GLYPH[x]}</button>`).join('')}</div>`
      : ''
    overlay.innerHTML = `<div class="packbox" style="max-width:900px"><h2>${INSERTS[kind].name}</h2><p class="muted">${INSERTS[kind].text}.</p>
      <div class="binder" style="justify-content:center">${cards.map(c => `<div class="slot" data-ins="${c.id}" style="cursor:pointer">${cardHtml(c, `mini ${picked?.id === c.id ? 'sel' : ''}`)}</div>`).join('')}</div>${suits}</div>`
    overlay.querySelectorAll<HTMLElement>('[data-ins]').forEach(el => {
      el.onclick = () => {
        const card = cards.find(c => c.id === Number(el.dataset.ins))!
        if (kind === 'wishlist') {
          log.push(`Scratched a <b class="gold">Wishlist</b>: ${cardName(card)} went into your deck.`)
          return void dispatch({ type: 'useInsert', cardId: card.id, suit: null })
        }
        picked = card
        paint()
      }
    })
    overlay.querySelectorAll<HTMLElement>('[data-suit]').forEach(el => {
      el.onclick = () => {
        const suit = el.dataset.suit as Card['suit']
        log.push(`Scratched a <b class="gold">Checklist</b>: ${cardName(picked!)} is now ${SUIT_GLYPH[suit]}.`)
        void dispatch({ type: 'useInsert', cardId: picked!.id, suit })
      }
    })
  }
  paint()
}

// ---------- the table ----------
const BET_LABEL: Record<BetChoice, string> = { fold: 'Fold', forge: 'Flamber', min: 'Min', max: 'Max', match: 'Match' }

// the rival's face: a mask and a name per difficulty. online opponents get a mask from their name
type DuelRival = { name: string; mask: string; stamp: string; back: StarterId }
const RIVALS: Record<Difficulty, DuelRival> = {
  easy: { name: 'Le Lièvre', mask: 'hare', stamp: 'FACILE', back: 'classic' },
  medium: { name: 'Scaramouche', mask: 'scaramouche', stamp: 'MOYEN', back: 'suited' },
  hard: { name: 'Le Roi', mask: 'king_spades', stamp: 'GROS JOUEUR', back: 'highroller' },
}
const MASKS = ['domino', 'pierrot', 'arlequin', 'scaramouche', 'hare', 'fox', 'owl', 'king_spades', 'queen_hearts']

function rivalFace(): DuelRival {
  if (match) return RIVALS[difficulty]
  const name = v().others[0].name
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return { name, mask: MASKS[h % MASKS.length], stamp: v().mode.toUpperCase(), back: 'standard' }
}

const plain = (html: string) => html.replace(/<[^>]+>/g, '')

function renderTable(): void {
  const view_ = v()
  const me = view_.me
  const them = view_.others[0]
  const settled = resultHold && view_.last !== null

  let slips: Slip[] = []
  let hint = ''
  if (settled) {
    if (!counting) slips = [{ label: view_.phase === 'over' ? 'See results' : 'Continue', kind: 'continue', primary: true, enabled: true, onClick: () => {
      resultHold = false
      if (match?.phase === 'over') saveScore()
      render()
    } }]
  } else if (view_.phase === 'deal' && !me.locked) {
    const n = selected.size
    const picked = me.hand.filter(c => selected.has(c.id))
    const slots = playSlots(picked)
    const mullOk = n > 0 && can({ type: 'mulligan', cardIds: [...selected] })
    const cost = view_.twist?.id === 'colddeck' ? 'cold deck' : me.freeMulligan ? 'free' : 'hand −1'
    hint = !n ? `Pick 1–${PLAY_SIZE} cards to play. The rest go back in the pile.` : slots > n ? `Those take ${slots} of your ${PLAY_SIZE} slots.` : 'Lock them in to bet, or mulligan them for new ones.'
    slips = [
      { label: 'Mulligan', price: n ? cost : '', kind: 'mulligan', enabled: mullOk, onClick: () => {
        const tossed = [...selected]
        selected = new Set()
        sfx.flip(false)
        log.push(`Mulliganed ${tossed.length}${me.freeMulligan ? ' (free)' : ', hand size −1 this Table'}.`)
        void dispatch({ type: 'mulligan', cardIds: tossed })
      } },
      { label: 'Lock in', price: n ? `${n} card${n > 1 ? 's' : ''}` : '', kind: 'lock', primary: n >= 1 && slots <= PLAY_SIZE, enabled: n >= 1 && slots <= PLAY_SIZE, onClick: () => {
        lastLocked = picked
        const ids = [...selected]
        selected = new Set()
        void dispatch({ type: 'lock', cardIds: ids })
      } },
    ]
  } else if (view_.phase === 'bet' && view_.bet?.toAct === me.seat) {
    const b = view_.bet
    const price = (c: BetChoice) => {
      if (c === 'min') return `$${b.minStake}`
      if (c === 'max' || c === 'match') return `$${b.maxStake}`
      if (c === 'forge') return `$${b.forgePrice}`
      return b.committed[0] ? `−$${b.committed[0]}` : ''
    }
    // all four always show, the ones you can't use are struck through
    const all: BetChoice[] = b.options.includes('match') ? ['match', 'fold'] : ['fold', 'forge', 'min', 'max']
    slips = all.map(c => ({ label: BET_LABEL[c], price: price(c), stamp: c, kind: c, enabled: b.options.includes(c), onClick: () => {
      log.push(`You: <b>${BET_LABEL[c]}</b>`)
      void dispatch({ type: 'bet', choice: c })
    } }))
    hint = b.forced ? 'Tournament round: no folding, no flambé.' : b.underdog ? "You're 2× behind: you see one of their cards and flambé for the Min." : ''
  } else hint = `Waiting on ${them.name}…`

  const deadline = online ? online.deadlines[me.seat] : null
  showDuel(app, {
    view: view_,
    settled,
    counting,
    selected,
    lastLocked,
    slips,
    hint,
    rival: rivalFace(),
    myMask: 'domino_red',
    toast: plain(log[log.length - 1] ?? ''),
    clock: () => (deadline === null || !net ? '' : `${Math.max(0, Math.ceil(net.msLeft(deadline) / 1000))}s`),
    onCard: id => {
      // a beer-stained pair is picked and dropped together
      const mate = stuckMate(me.hand.find(c => c.id === id)!, me.hand)
      const on = !selected.has(id)
      for (const x of mate ? [id, mate.id] : [id]) {
        if (on) selected.add(x)
        else selected.delete(x)
      }
      sfx.flip(false)
      render()
    },
    onPile: () => showDeckViewer(),
  })
}

function handLabel(a: Appraisal): string {
  return [a.hand, ...a.bonus].map(h => HAND_NAMES[h]).join(' + ')
}

// over the trait cap: pick which traits the new card keeps
function renderForgePick(plan: ForgePlan): void {
  const keep = new Set<number>(autoKeep(plan).map(t => plan.candidates.indexOf(t)))
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  document.body.appendChild(overlay)
  const paint = () => {
    overlay.innerHTML = `<div class="packbox panel" style="max-width:440px">
      <h2>${rankLabel(plan.rank)}${'★'.repeat(plan.tier)} holds ${plan.tier} trait${plan.tier > 1 ? 's' : ''}</h2>
      <p class="muted">Pick which ones to keep.</p>
      <div style="display:flex;flex-direction:column;gap:8px;text-align:left;margin:12px 0">
        ${plan.candidates.map((t, i) => `<label style="cursor:pointer"><input type="checkbox" data-t="${i}" ${keep.has(i) ? 'checked' : ''}> <b>${traitName(t)}</b></label>`).join('')}
      </div>
      <div class="row" style="justify-content:center"><button id="keep" ${keep.size !== plan.tier ? 'disabled' : ''}>Flambé it (${keep.size}/${plan.tier})</button></div>
    </div>`
    overlay.querySelectorAll<HTMLInputElement>('[data-t]').forEach(el => {
      el.onchange = () => {
        const i = Number(el.dataset.t)
        if (el.checked) keep.add(i)
        else keep.delete(i)
        paint()
      }
    })
    document.getElementById('keep')!.onclick = () => {
      if (keep.size !== plan.tier) return
      const traits: Trait[] = [...keep].map(i => plan.candidates[i])
      sfx.gradeUp()
      void dispatch({ type: 'forgeKeep', traits })
    }
  }
  paint()
}

// ---------- end of run ----------
function renderOver(): void {
  const view_ = v()
  const res = view_.result!
  const me = view_.me
  const them = view_.others[0]
  const won = res.winner === me.seat
  // the match ends in the round someone busts, so view_.round is the bust round
  const how = won ? (!them.alive ? `Busted ${them.name} in round ${view_.round}. ` : 'Chip lead after round 12. ') : ''
  const score = view_.mode === 'solo' || view_.mode === 'daily' ? `Score <b class="gold">${fmt(res.scores[me.seat])}</b> pts` : ''
  const seed = match ? ` · seed <b>${match.config.seed}</b>` : ''
  app.innerHTML = `<div class="title"><div>
    <h1>${won ? 'TOOK<br><span>THE TABLE</span>' : 'BUSTED'}</h1>
    <p class="big">${won ? `${how}${score}` : me.alive ? 'Behind on chips after round 12' : `Out in round ${view_.round}`}</p>
    <p class="muted">Best appraisal: <b class="gold">${fmt(best.total)}</b>${best.hand ? ` (${best.hand})` : ''}${seed} · you $${me.bankroll} vs ${them.name} $${them.bankroll}</p>
    <div class="row" style="justify-content:center;margin-top:14px">
      ${match ? '<button id="again">Same seed again</button>' : ''}
      <button class="ghost" id="menu">Main menu</button>
    </div>
    ${match ? lbTable(`Leaderboard · ${match.config.seed} · ${DIFFICULTIES[difficulty].name}`, leaderboard(match.config.seed, difficulty)) : ''}
    ${view_.mode === 'daily' ? '<div id="board"></div>' : ''}
  </div></div>`
  if (match) document.getElementById('again')!.onclick = () => startRun(match!.config.seed)
  document.getElementById('menu')!.onclick = () => {
    match = null
    if (online) leaveOnline()
    else renderTitle()
  }
  if (view_.mode === 'daily') void fillBoard()
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
artReady = true
if (joinCode) panTo(2) // came in on a room link: start down in the sewers, where joining happens
if (QUICK) quickStart()
else renderTitle()
