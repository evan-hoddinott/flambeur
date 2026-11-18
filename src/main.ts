// the game ui. the table is the pixel art duel scene (ui/duel.ts), the shop is the tabac (ui/shop.ts),
// the other screens (and the shop's binder, grading and pack overlays) are still the throwaway dom harness.
// it renders only from a SeatView: offline it runs step() itself, online the server does and sends the view over net.ts
import { JOKERS, SUITS, SUIT_GLYPH, cardName, playSlots, rankLabel, stuckMate, traitName, type Card, type Trait } from './engine/cards.ts'
import { describe, getDef } from './engine/collectibles.ts'
import { COLLECTIBLE_PRICE, PLAY_SIZE, SHIPPERS, tableOf, type Shipper } from './engine/economy.ts'
import { DRAFT_PICKS, getStarter, type StarterId } from './engine/starters.ts'
import { HAND_NAMES, type HandType } from './engine/hands.ts'
import { randomSeed } from './engine/rng.ts'
import { autoKeep, forgePlan, type ForgePlan } from './engine/forge.ts'
import { getRival } from './engine/rivals.ts'
import {
  DIFFICULTIES, botAction, canGrade, defaultToDeck, newMatch, pending, problem, step, view,
  type Action, type BetChoice, type Difficulty, type Event, type Match, type SeatView,
} from './engine/match.ts'
import { api, connect, type PlayerInfo, type ServerMsg, type Status } from './net.ts'
import type { Appraisal } from './engine/scoring.ts'
import { INSERTS, type PackKind } from './engine/shop.ts'
import { twistName, twistText } from './engine/twists.ts'
import { getSleeve, type Stonks } from './engine/sleeves.ts'
import * as sfx from './ui/sound.ts'
import { partCanvas, loadArt, cardCanvas, stockScale, canvasUrl, backCanvas } from './ui/art.ts'
import { collectibleHtml } from './ui/collectibles.ts'
import { loadFonts } from './ui/font.ts'
import { loadLogo } from './ui/logo.ts'
import { loadTitle, panTo, showTitle, type TitleOnline } from './ui/title.ts'
import { albumPage, recordPull } from './ui/album.ts'
import { spoilPicked } from './ui/spoils.ts'
import { showDuel, insertUsed, countUp as duelCountUp, cardInfo, cardTags, type HandSort, type Slip } from './ui/duel.ts'
import { showShop, shopInsertUsed, keeperSays, type Scratch } from './ui/shop.ts'

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
let autoSent = new Set<string>() // round-1 auto moves already sent this match, so a reject can't loop them
let difficulty: Difficulty = 'medium'
let best = { total: 0, hand: '' }
let busy = false // true while bots act or animations run, so clicks don't double-fire
let counting = false // meters start at 0 while the count-up runs
// ui-only state. never game state: that all lives in the match
let selected = new Set<number>()
let pack: { ripped: boolean; discoveries: Set<number>; flipped: Set<number>; toDeck: Set<number> } | null = null
const justFlipped = new Set<number>() // pulls flipped since the last draw, the only ones that play the flip animation
let log: string[] = []
let scratchShow: Scratch | null = null // a scratcher being rubbed in the shop scene, the card pick waits for it
let scratchKey = 0
let resultHold = false // keep showing the revealed hand until "continue"
let tallyHold = false // and that reveal ended the round: its money tally shows too
let toCount = false // a fresh reveal waiting for its count-up
let insertSlot: number | null = null // the Sleeve slot picked up during a deal
let grindPick = false // flamber with no pair: waiting for the card that gets +1 Value
let patronMissed = false
let patronPaid: number | null = null // le patron just collected this at the big shop door
let sleeveOpen = false // the shop's Sleeve overlay
let lastLocked: Card[] = [] // my locked cards, so a fold or forge result can still show them
let binderOpen = false // the shop's binder overlay, kept open across renders while you sell
let binderPicked = new Set<number>()
let vitrineOpen = false
let deckOpen = false // the deck viewer, kept open across renders so a bot move doesn't close it
let handSort: HandSort = 'rank' // how your hand fans out. display only, the engine's order never changes

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const fmt = (n: number) => n.toLocaleString('en-US')
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
    const before = action.type === 'spoils' ? v() : null
    const res = step(match, ME, action)
    if (before && action.type === 'spoils') spoilPicked(before, action.cardId, !!before.spoils?.picks.length)
    match = res.match
    onEvents(res.events.filter(e => e.to === ME || e.to === 'all').map(e => e.event))
    await runBots()
  } finally {
    busy = false
  }
  render()
}

// a pause you can watch, or skip with a click, space or enter
let skipBeat: (() => void) | null = null
function beat(ms: number): Promise<void> {
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
window.addEventListener('pointerdown', () => skipBeat?.())
window.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Enter') skipBeat?.()
})

async function runBots(): Promise<void> {
  for (;;) {
    const m = match!
    if (m.phase === 'over') return
    const bot = pending(m).find(s => s !== ME)
    // simultaneous phases: the bot goes once I'm done, so it never shops off what I just did
    if (bot === undefined || (pending(m).includes(ME) && m.phase !== 'bet')) return
    const action = botAction(m, bot)
    const betting = m.phase === 'bet' && action.type === 'bet'
    if (betting) {
      render()
      // the rival thinks. longer when they open, so "Scaramouche bets first" has time to read
      await beat(v().bet?.choices.length ? 700 : 1200)
    }
    const dealing = m.phase === 'shop'
    const before = action.type === 'spoils' ? v() : null
    const res = step(m, bot, action)
    if (before && action.type === 'spoils') spoilPicked(before, action.cardId, !!before.spoils?.picks.length)
    match = res.match
    onEvents(res.events.filter(e => e.to === ME || e.to === 'all').map(e => e.event))
    if (dealing && match.phase === 'deal') log = [`Round ${match.round} · the rival has <b>$${v().others[0].bankroll}</b>.`]
    if (betting) {
      render()
      await beat(1000) // their ticket lands on the felt and sits a beat before anything else moves
    }
  }
}

function onEvents(events: Event[]): void {
  for (const e of events) {
    if (e.kind === 'packOpened') pack = { ripped: false, discoveries: new Set(), flipped: new Set(), toDeck: new Set(e.contents.cards.filter(defaultToDeck).map(c => c.id)) }
    if (e.kind === 'showdown') {
      resultHold = true
      tallyHold = false
      toCount = true
      const mine = e.showdown.mine
      if (mine && mine.total > best.total) best = { total: mine.total, hand: handLabel(mine) }
    }
    if (e.kind === 'roundEnd') {
      tallyHold = true
      const r = e.result
      if (r.outcome === 'loss' && r.margin < 0) log.push(`Lost round ${r.round} by <b>${fmt(-r.margin)}</b>.`)
      else if (r.outcome === 'win') log.push(`Took round ${r.round}${r.ko ? ' by knockout' : ''}, by <b>${fmt(r.margin)}</b>.`)
    }
    if (e.kind === 'patron' && e.seat === mySeat()) {
      patronMissed = !e.paid
      patronPaid = e.paid ? e.due : null
      log.push(e.paid ? `Le Patron collected <b>$${e.due}</b>.` : `Couldn't cover Le Patron's <b>$${e.due}</b>.`)
    }
    if (e.kind === 'rival' && e.seat !== mySeat()) log.push(`${getRival(e.rival).name} sits down.`)
    if (e.kind === 'insertUsed') {
      insertUsed(e.insert, e.cards)
      shopInsertUsed(e.insert, e.cards)
    }
    if (e.kind === 'insertUsed') log.push(`Used <b class="gold">${INSERTS[e.insert].name}</b>${e.cards.length ? ` on ${e.cards.map(cardName).join(', ')}` : ''}.`)
    if (e.kind === 'scratched') {
      const what = e.hand ? `: ${HAND_NAMES[e.hand]} +1 level` : e.collectible ? `: ${getDef(e.collectible.id).name}` : e.joker ? `: ${JOKERS[e.joker.joker!].name} (${cardName(e.joker)})` : ', into your Sleeve'
      log.push(`Scratched a <b class="gold">${INSERTS[e.insert].name}</b>${what}.`)
      const prize = e.hand ? `${HAND_NAMES[e.hand]} +1 level` : e.collectible ? getDef(e.collectible.id).name : e.joker ? `${JOKERS[e.joker.joker!].name} (${cardName(e.joker)})` : 'into your Sleeve'
      scratchShow = { key: ++scratchKey, insert: e.insert, prize }
    }
    if (e.kind === 'graded') log.push(`Back from grading: <b>${cardName(e.card)}</b> came back a <b class="gold">${e.card.grade}</b>.`)
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
    tallyHold = false
    toCount = false
    pack = null
    selected = new Set()
    autoSent = new Set()
  }
  online = { view: next, deadlines }
  const rival = next.others[0] // the rival's bets show up on the felt, from the view (duel.ts)
  if (prev && prev.phase !== 'deal' && next.phase === 'deal') log = [`Round ${next.round} · ${rival.name} has <b>$${rival.bankroll}</b>.`]
  if (prev?.spoils && next.spoils && next.spoils.picks.length > prev.spoils.picks.length) {
    spoilPicked(prev, next.spoils.picks.at(-1)?.card?.id ?? null, next.spoils.picks.length === 2)
  }
  if (prev) onEvents(events)
  // the rival's moves in a phase you both play at once only change `others`, which these screens don't show.
  // skipping the redraw keeps open overlays (draft picks, the deck viewer) from resetting under you
  const quiet = prev && !events.length && ['draft', 'shop'].includes(next.phase)
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
function cardChips(card: Card): string {
  return cardTags(card).map(t => `<span class="card-chip" style="--ink:${t.color}">${t.label}</span>`).join(' · ')
}

function cardHtml(card: Card, cls = ''): string {
  const info = cardInfo(card)
  const img = cardCanvas(card)
  const scale = stockScale(card) * (cls.includes('mini') ? .75 : cls.includes('big') ? 2 : 1.5)
  return `<div class="card art ${cls}" style="width:${img.width*scale}px;height:${img.height*scale}px" data-id="${card.id}" title="${cardName(card)}${info ? ` · ${info}` : ''}"><img src="${canvasUrl(img)}" alt="${cardName(card)}">${info && !cls.includes('mini') ? `<span class="tag">${cardChips(card)}</span>` : ''}</div>`
}

function caseHtml(sellable: boolean): string {
  const me = v().me
  const slots = me.display.map((o, i) => {
    const def = getDef(o.id)
    const sell = sellable ? `<button class="ghost" data-sellcol="${i}">Sell $${Math.floor(COLLECTIBLE_PRICE[def.rarity] / 2)}</button>` : ''
    return `<div class="item ${def.rarity}" data-slot="${i}">${collectibleHtml(o, i)}<b>${def.name}</b><span>${describe(o)}</span><div class="rar">${def.rarity}</div>${sell}</div>`
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
  deckOpen = true
  render()
}

// a deck button for the dom overlays (packs, binder, grading). the canvas scenes use the pile
const deckButton = () => '<button class="ghost" data-deck style="position:absolute;top:10px;right:10px;min-height:0;padding:4px 10px">Deck</button>'
document.addEventListener('click', e => {
  if ((e.target as HTMLElement).closest('[data-deck]')) showDeckViewer()
})
// d opens or closes your deck from anywhere in a run, escape closes it
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && deckOpen) {
    deckOpen = false
    return render()
  }
  if (e.key !== 'd' || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input, textarea')) return
  if (!(match || online) || !v().me.starter) return
  deckOpen = !deckOpen
  render()
})

// balatro's deck view: stats on the left, one row per suit high to low, big cards that overlap only when a row runs long.
// full deck dims what's out of the pile (in hand or played this Table), so you can see what's left to draw
type DeckTab = 'full' | 'pile' | 'binder'
let deckTab: DeckTab = 'full'
const ROW_SUITS = ['S', 'H', 'C', 'D'] as const

function drawDeckViewer(): void {
  const me = v().me
  const outIds = new Set([...me.hand, ...me.discard].map(c => c.id))
  const cards = deckTab === 'binder' ? me.binder : deckTab === 'pile' ? me.pile : [...me.pile, ...me.hand, ...me.discard]
  const byValue = (a: Card, b: Card) => b.rank - a.rank || b.tier - a.tier || cardName(a).localeCompare(cardName(b))
  const rows = ROW_SUITS.map(su => ({ label: SUIT_GLYPH[su], red: su === 'H' || su === 'D', cards: cards.filter(c => !c.bulk && !c.joker && c.suit === su).sort(byValue) }))
    .filter(r => r.cards.length)
  const other = cards.filter(c => c.bulk || c.joker)
  if (other.length) rows.push({ label: '✦', red: false, cards: other.sort((a, b) => Number(a.bulk) - Number(b.bulk)) })
  // the biggest whole-ish scale that fits every row on screen
  const avail = innerHeight - 40 // the overlay's padding
  const scale = [2, 1.75, 1.5, 1.25, 1].find(s => rows.length * (88 * s + 14) + 20 <= avail) ?? 1
  const w = 64 * scale

  const plain = cards.filter(c => !c.bulk && !c.joker)
  const rankCounts = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map(r => `<span>${rankLabel(r)}</span><b>${plain.filter(c => c.rank === r).length}</b>`).join('')
  const suitCounts = ROW_SUITS.map(su => `<span class="${su === 'H' || su === 'D' ? 'red' : ''}">${SUIT_GLYPH[su]} <b>${plain.filter(c => c.suit === su).length}</b></span>`).join('')
  const tab = (id: DeckTab, label: string, n: number) => `<button class="${deckTab === id ? '' : 'ghost'}" data-tab="${id}">${label} <b>${n}</b></button>`
  const note = deckTab === 'full' ? `<p class="muted small">Dimmed: in your hand or played this Table. They come back when the next Table shuffles.</p>`
    : deckTab === 'pile' ? `<p class="muted small">What you can still draw this Table.</p>`
    : `<p class="muted small">Never drawn. Sell from it at the shop.${me.shipping ? ` ${cardName(me.shipping.card)} is away at grading.` : ''}</p>`
  const rowHtml = rows.map(r => `<div class="dv-row"><span class="dv-suit ${r.red ? 'red' : ''}">${r.label}</span>
    <div class="dv-cards" style="grid-template-columns:repeat(${r.cards.length}, minmax(0, ${w + 6}px))">
      ${r.cards.map(c => `<div class="dv-card ${deckTab === 'full' && outIds.has(c.id) ? 'out' : ''}" data-id="${c.id}" style="width:${cardCanvas(c).width * stockScale(c) * scale}px;height:${cardCanvas(c).height * stockScale(c) * scale}px"><img src="${canvasUrl(cardCanvas(c))}" alt="${cardName(c)}"></div>`).join('')}
    </div></div>`).join('')

  const overlay = document.createElement('div')
  overlay.className = 'overlay deckview'
  overlay.style.zIndex = '60'
  overlay.innerHTML = `<div class="dv">
    <div class="dv-side">
      <h2>Your deck</h2>
      <div class="dv-tabs">${tab('full', 'Full deck', me.pile.length + me.hand.length + me.discard.length)}${tab('pile', 'Left to draw', me.pile.length)}${tab('binder', 'Binder', me.binder.length)}</div>
      ${note}
      <div class="dv-ranks">${rankCounts}</div>
      <div class="dv-suits">${suitCounts}</div>
      ${other.length ? `<p class="muted small">✦ ${cards.filter(c => c.bulk).length} bulk · ${cards.filter(c => c.joker).length} joker</p>` : ''}
      <div class="dv-info" id="dvinfo">Hover a card to read it.</div>
      <button id="closeview">Close <span class="muted small">(D)</span></button>
    </div>
    <div class="dv-main">${rows.length ? rowHtml : '<p class="muted">Nothing here.</p>'}</div>
  </div>`
  document.body.appendChild(overlay)
  const info = document.getElementById('dvinfo')!
  overlay.querySelectorAll<HTMLElement>('.dv-card').forEach(el => {
    el.onmouseenter = () => {
      const c = cards.find(x => x.id === Number(el.dataset.id))!
      const extra = cardChips(c)
      const where = deckTab !== 'full' ? '' : me.hand.some(x => x.id === c.id) ? ' · in your hand' : me.discard.some(x => x.id === c.id) ? ' · played this Table' : ''
      info.innerHTML = `<b>${cardName(c)}</b>${where}${extra ? `<br><span class="muted">${extra}</span>` : ''}`
    }
  })
  overlay.querySelectorAll<HTMLElement>('[data-tab]').forEach(el => {
    el.onclick = () => {
      deckTab = el.dataset.tab as DeckTab
      render()
    }
  })
  overlay.onclick = e => {
    if (e.target === overlay) document.getElementById('closeview')!.click()
  }
  document.getElementById('closeview')!.onclick = () => {
    deckOpen = false
    overlay.remove()
  }
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
  tallyHold = false
  toCount = false
  patronPaid = null
  patronMissed = false
  pack = null
  // dev only: ?quick&wild makes the rival bet at random, so folds and flambés come up fast for testing
  const wild = QUICK && new URLSearchParams(location.search).has('wild') ? { style: 'random' } : {}
  match = newMatch({ mode: 'solo', seed, seats: [{ kind: 'human', name: 'You', ...(autoplay ? { style: 'house' } : {}) }, { kind: 'bot', name: 'Rival', difficulty, ...wild }] })
  render()
}

// dev only: ?quick drafts and shops for you (house bot style) straight to the first deal, for testing the table.
// ?quick&shop plays on (house bot style) until the round 2 shop, for testing the tabac. ?quick&big: the first big shop
function quickStart(): void {
  startRun(randomSeed(), true)
  let m = match!
  const q = new URLSearchParams(location.search)
  const big = q.has('big')
  const toShop = q.has('shop') || big
  const atShop = () => m.phase === 'shop' && m.round >= 2 && (!big || m.players[ME].shop?.kind === 'big')
  const going = () => toShop ? m.phase !== 'over' && !atShop() : m.phase === 'draft' || m.phase === 'shop'
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
  if (view_ && resultHold && sd && toCount && !counting) {
    toCount = false
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
  drawScreen()
  if (deckOpen && (match || online) && v().me.starter && v().phase !== 'over') drawDeckViewer()
}

function drawScreen(): void {
  if (!match && !online) return renderTitle()
  const view_ = v()
  if (resultHold && view_.showdown) return renderTable()
  if (view_.phase === 'over') return renderOver()
  // online, you can finish the draft or shop before the other player does
  if (view_.me.done && (view_.phase === 'draft' || view_.phase === 'shop')) {
    app.innerHTML = `${topHtml()}<div class="panel" style="margin-top:12px"><p class="center muted">Waiting on ${view_.others[0].name}…</p></div>`
    return bindCommon()
  }
  if (view_.phase === 'draft') return view_.me.starter ? renderDraft() : renderStarterBox()
  if (view_.phase === 'shop') {
    const shop = view_.me.shop!
    if (shop.open) {
      renderShop()
      return renderPack()
    }
    return renderShop()
  }
  if (view_.phase === 'deal' && view_.me.forge) {
    renderTable()
    return renderForgePick(view_.me.forge)
  }
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
const PACK_NAMES: Record<PackKind, string> = { offbrand: 'Off-Brand', repack: 'Repack', collector: 'Collector Pack' }

function glowFor(card: Card): string {
  if (card.finish === 'prism') return 'var(--gold)'
  if (card.finish || card.stamp) return card.stamp ? 'var(--green)' : 'var(--blue)'
  return '#e8e8e8'
}

function renderPack(): void {
  const open = v().me.shop!.open!
  if (!pack) pack = { ripped: false, discoveries: new Set(), flipped: new Set(), toDeck: new Set(open.cards.filter(defaultToDeck).map(c => c.id)) }
  const p = pack
  // older servers sent the contents without the lane. each lane has a unique collation.
  const kind = open.kind
  const allFlipped = open.cards.every(c => p.flipped.has(c.id))
  let body: string
  if (!p.ripped) {
    const url = new URL(`../art/packaging/boosters/${kind}.png`, import.meta.url).href
    body = `<button class="package-button" id="rip" aria-label="Rip open ${PACK_NAMES[kind]}"><img src="${url}" width="144" height="208" alt=""></button><p class="muted">Rip it open.</p>`
  } else {
    const back = canvasUrl(backCanvas(v().me.starter)) // your deck's back, so the pulls look like your cards
    const pulls = open.cards.map(c => {
      if (!p.flipped.has(c.id)) return `<div class="pull"><span class="pull-tag hidden">?</span><img class="glowback" src="${back}" style="--glow:${glowFor(c)}" data-flip="${c.id}" alt="face-down card"></div>`
      const deck = p.toDeck.has(c.id)
      return `<div class="pull ${deck ? 'to-deck' : ''} ${justFlipped.has(c.id) ? 'reveal' : ''}" data-sort="${c.id}">${p.discoveries.has(c.id) ? `<img class="album-new" src="${canvasUrl(partCanvas('hud/album/new'))}" alt="New to your Album">` : ''}<span class="pull-tag">${deck ? 'Deck' : 'Binder'}</span>${cardHtml(c, 'big')}</div>`
    })
    justFlipped.clear()
    const sorting = open.cards.some(c => p.flipped.has(c.id))
    if (allFlipped && open.codeCard) pulls.push(`<div class="pull reveal"><div class="extra code">CODE CARD<br>${HAND_NAMES[open.codeCard]} +1 level</div><span class="muted small">auto-applied</span></div>`)
    if (allFlipped && open.collectible) {
      const def = getDef(open.collectible.id)
      const room = v().me.display.length < v().me.displaySlots
      pulls.push(`<div class="pull reveal"><div class="extra col">${collectibleHtml(open.collectible, 0)}${def.name}<br><span class="small" style="color:#d5cde8">${describe(open.collectible)}</span></div><span class="muted small">${room ? 'goes in your case' : `case full, sells for $${Math.floor(COLLECTIBLE_PRICE[def.rarity] / 2)}`}</span></div>`)
    }
    body = `<p class="muted pull-help">${sorting ? 'Raised cards go in your <b class="gold">deck</b>, the rest in your binder. Click a card to switch.' : 'Click a card to flip it.'}</p>
      <div class="pulls">${pulls.join('')}</div>
      <div class="row" style="justify-content:center">${allFlipped ? '<button id="done">Done</button>' : '<button class="ghost" id="all">Reveal all</button>'}</div>`
  }
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `<div class="packbox packview" style="position:relative">${deckButton()}<h2>${PACK_NAMES[kind]}</h2>${body}</div>`
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
    if (recordPull(card)) p.discoveries.add(id)
    justFlipped.add(id)
    sfx.flip(card.finish === 'prism' || card.stamp !== null)
  }
  overlay.querySelectorAll<HTMLElement>('[data-flip]').forEach(el => {
    el.onclick = () => {
      flip(Number(el.dataset.flip))
      render()
    }
  })
  // switched in place, not re-rendered, so the card slides up or down
  overlay.querySelectorAll<HTMLElement>('[data-sort]').forEach(el => {
    el.onclick = () => {
      const id = Number(el.dataset.sort)
      const deck = !p.toDeck.has(id)
      if (deck) p.toDeck.add(id)
      else p.toDeck.delete(id)
      el.classList.remove('reveal')
      el.classList.toggle('to-deck', deck)
      el.querySelector('.pull-tag')!.textContent = deck ? 'Deck' : 'Binder'
      sfx.flip(false)
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
    canGrade: shop.services.grading && !shop.shipped && !me.shipping,
    onBuy: slot => void dispatch({ type: 'buy', slot }),
    onRestock: () => void dispatch({ type: 'restock' }),
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
    onLeave: () => {
      patronPaid = null
      void dispatch({ type: 'leaveShop' })
    },
    scratch: scratchShow,
    onScratchDone: () => {
      scratchShow = null
      render()
    },
    onSleeve: () => {
      sleeveOpen = true
      render()
    },
    patronPaid,
  })
  // a scratch with a full Sleeve: use or toss one before anything else
  if ((sleeveOpen || me.overflow) && !scratchShow) showSleeve()
  else if (binderOpen) showBinder()
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
    overlay.innerHTML = `<div class="packbox" style="max-width:900px;position:relative">${deckButton()}<h2>Binder · ${me.binder.length}</h2>
      <p class="muted">Tap cards to pick them, then sell. Today's hot: <span class="hot">${stonksText(view_.stonks)}</span>.</p>
      ${cards.length ? `<div class="binder" style="justify-content:center">${cards.join('')}</div>` : '<p class="muted">Empty. Pulls you send to the binder land here.</p>'}
      <div class="row" style="justify-content:center;margin-top:12px">
        <button data-buy id="sellpicked" ${n ? '' : 'disabled'}>Sell ${n || ''} picked</button>
        <button class="ghost" id="openalbum">Album</button><button class="ghost" id="closebinder">Close</button>
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
    overlay.querySelector<HTMLButtonElement>('#openalbum')!.onclick = () => {
      overlay.innerHTML = `<div class="packbox"><h2>Album</h2>${albumPage()}<button id="backbinder">Back to binder</button></div>`
      overlay.querySelector<HTMLButtonElement>('#backbinder')!.onclick = paint
    }
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

function shopCaseHtml(): string {
  const me = v().me
  if (!me.display.length) return '<p class="muted">The case is empty.</p>'
  const objects = me.display.map((o, i) => {
    const def = getDef(o.id)
    const price = Math.floor(COLLECTIBLE_PRICE[def.rarity] / 2)
    return `<div class="vitrine-piece" tabindex="0" aria-label="${def.name}. ${describe(o)}">
      ${collectibleHtml(o, i)}
      <span class="vitrine-caption">${def.name} · ${describe(o)}</span>
      <button class="ghost" aria-label="Sell ${def.name} for $${price}" data-sellcol="${i}">Sell $${price}</button>
    </div>`
  })
  return `<div class="vitrine-tray">${objects.join('')}</div>`
}

// your collectibles, sellable while you're in the shop
function showVitrine(): void {
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `<div class="packbox" style="max-width:900px"><h2>La Vitrine</h2>${shopCaseHtml()}
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
      return `<button class="${id === shipper ? '' : 'ghost'}" data-shipper="${id}" ${sh.price < me.bankroll ? '' : 'disabled'}><img style="image-rendering:pixelated" src="${canvasUrl(partCanvas('shop/parcel/' + id))}" alt=""><br>${sh.name} $${sh.price}<br><span class="small">${sh.text}</span></button>`
    }).join('')
    overlay.innerHTML = `<div class="packbox" style="max-width:900px;position:relative">${deckButton()}<img src="${canvasUrl(partCanvas('shop/grading/guichet'))}" alt="" width="244" style="image-rendering:pixelated"><h2>Grading desk</h2>
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

// the Sleeve in the shop: a code levels its hand here, a wishlist pulls a binder card back into the deck.
// in-hand inserts wait for a deal. with a full Sleeve, the new one (slot 2) has to be used or something tossed
function showSleeve(): void {
  const me = v().me
  let wish: number | null = null // the slot of a wishlist picking its binder card
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  document.body.appendChild(overlay)
  const held = [...me.sleeve.map((c, slot) => ({ c, slot })), ...(me.overflow ? [{ c: me.overflow, slot: 2 }] : [])]
  const paint = () => {
    const rows = held.map(({ c, slot }) => {
      const def = INSERTS[c.id]
      const head = c.hand ? `${def.name}: ${HAND_NAMES[c.hand]}` : def.name
      const use = def.when === 'anytime' || def.when === 'shop'
      const ok = def.when === 'shop' ? me.binder.length > 0 : can({ type: 'useInsert', slot, cardIds: [], suit: null })
      return `<div class="row" style="justify-content:space-between;gap:12px;margin:6px 0">
        <span style="text-align:left">${slot === 2 ? '<b class="gold">New:</b> ' : ''}<b>${head}</b><br><span class="muted">${def.text}${use ? '' : '. Use it on your cards during a hand'}</span></span>
        <span class="row">${use ? `<button data-use="${slot}" ${ok ? '' : 'disabled'}>Use</button>` : ''}<button class="ghost" data-toss="${slot}">Toss</button></span></div>`
    }).join('')
    const pick = wish === null ? '' : `<p class="muted">Pick a binder card to shuffle into your deck.</p>
      <div class="binder" style="justify-content:center">${me.binder.map(c => `<div class="slot" data-wish="${c.id}" style="cursor:pointer">${cardHtml(c, 'mini')}</div>`).join('')}</div>`
    overlay.innerHTML = `<div class="packbox panel" style="max-width:640px">
      <h2>Your Sleeve</h2><p class="muted">${me.overflow ? 'Your Sleeve holds 2. Use or toss one to make room.' : 'Up to 2 inserts, used before you lock a hand.'}</p>
      ${rows || '<p class="muted">Empty. Scratchers fill it.</p>'}${pick}
      ${me.overflow ? '' : '<div class="row" style="justify-content:center;margin-top:10px"><button class="ghost" id="close">Close</button></div>'}</div>`
    overlay.querySelectorAll<HTMLElement>('[data-use]').forEach(el => {
      el.onclick = () => {
        const slot = Number(el.dataset.use)
        const c = held.find(h => h.slot === slot)!.c
        if (c.id === 'wishlist') {
          wish = slot
          return paint()
        }
        sleeveOpen = false
        void dispatch({ type: 'useInsert', slot, cardIds: [], suit: null })
      }
    })
    overlay.querySelectorAll<HTMLElement>('[data-toss]').forEach(el => {
      el.onclick = () => {
        sleeveOpen = false
        void dispatch({ type: 'tossInsert', slot: Number(el.dataset.toss) })
      }
    })
    overlay.querySelectorAll<HTMLElement>('[data-wish]').forEach(el => {
      el.onclick = () => {
        sleeveOpen = false
        void dispatch({ type: 'useInsert', slot: wish!, cardIds: [Number(el.dataset.wish)], suit: null })
      }
    })
    const close = document.getElementById('close')
    if (close) close.onclick = () => {
      sleeveOpen = false
      overlay.remove()
    }
  }
  paint()
}

// ---------- the table ----------
const BET_LABEL: Record<BetChoice, string> = { min: 'Min', max: 'Max' }
const MAX_RULE = 'Max: bet more on yourself. Win and the House pays it, lose and your rival takes it.'

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

const plain = (html: string) => html.replace(/<[^>]+>/g, '')

// the deal: pick cards, then play them, flambé them or discard them. a Sleeve insert picked up takes over the bar
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
    const hint = `${def.name}: ${def.text}.${hi ? ` Pick ${want}.` : ''}`
    const cancel: Slip = { label: 'Put back', kind: 'skip', enabled: true, onClick: () => {
      insertSlot = null
      selected = new Set()
      render()
    } }
    const use = (suit: Card['suit'] | null) => () => {
      insertSlot = null
      selected = new Set()
      sfx.gradeUp()
      void dispatch({ type: 'useInsert', slot, cardIds: ids, suit })
    }
    if (ins.id === 'checklist') {
      const suits = SUITS.map(x => ({ label: SUIT_GLYPH[x], kind: 'insert' as const, enabled: can({ type: 'useInsert', slot, cardIds: ids, suit: x }), onClick: use(x) }))
      return { slips: [...suits, cancel], hint }
    }
    return { slips: [{ label: `Use ${def.name}`, price: hi ? `${n}/${hi}` : '', kind: 'insert', primary: true, enabled: can({ type: 'useInsert', slot, cardIds: ids, suit: null }), onClick: use(null) }, cancel], hint }
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
  const hint = !n
    ? `Hand ${v().hands?.hand ?? 1} of 3. Pick 1–${PLAY_SIZE} cards to play, flambé or discard.`
    : merges ? 'Flamber merges them into a ★ card for your next hand. This hand scores 0.'
    : 'Play scores them. Flamber throws the hand: one card gets +1 Value.'
  const lock = (type: 'play' | 'flamber', grind: number | null) => {
    lastLocked = picked
    selected = new Set()
    grindPick = false
    void dispatch(type === 'play' ? { type, cardIds: ids } : { type, cardIds: ids, grind })
  }
  return {
    hint,
    slips: [
      { label: 'Play', price: n ? `${n} card${n > 1 ? 's' : ''}` : '', kind: 'lock', primary: n > 0, enabled: n > 0 && can({ type: 'play', cardIds: ids }), onClick: () => lock('play', null) },
      { label: 'Flamber', price: merges ? '★' : n ? '+1 Value' : '', kind: 'forge', enabled: n > 0 && can({ type: 'flamber', cardIds: ids, grind: merges || !grindable.length ? null : grindable[0].id }), onClick: () => {
        if (merges || grindable.length <= 1) return lock('flamber', merges ? null : grindable[0]?.id ?? null)
        grindPick = true
        render()
      } },
      { label: 'Discard', price: `${me.discardsLeft} left`, kind: 'discard', enabled: n > 0 && can({ type: 'discard', cardIds: ids }), onClick: () => {
        selected = new Set()
        sfx.flip(false)
        void dispatch({ type: 'discard', cardIds: ids })
      } },
    ],
  }
}

function renderTable(): void {
  const view_ = v()
  const me = view_.me
  const them = view_.others[0]
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
  } else if (view_.phase === 'bet' && view_.bet?.toAct === me.seat) {
    const b = view_.bet
    const push = b.stage === 'push'
    const price = (c: BetChoice) => (c === 'min' ? (push ? 'stay' : `$${b.stake}`) : `+$${b.extra} on you`)
    slips = (['min', 'max'] as const).map(c => ({ label: push && c === 'max' ? 'Push' : BET_LABEL[c], price: b.options.includes(c) ? price(c) : b.why[c] ?? price(c), stamp: c, kind: c, enabled: b.options.includes(c), onClick: () => {
      void dispatch({ type: 'bet', choice: c })
    } }))
    const off = (['min', 'max'] as const).filter(c => b.why[c]).map(c => `${BET_LABEL[c]}: ${b.why[c]}.`).join(' ')
    hint = [push ? 'Last push before hand 3. Still on Min? You can go Max now.' : MAX_RULE, off].filter(Boolean).join(' ')
  } else if (view_.phase === 'spoils' && view_.spoils?.toPick === me.seat) {
    hint = 'Spoils: pick a card for your deck, or skip for +$1. The last card burns.'
    slips = [{ label: 'Skip', price: '+$1', kind: 'skip', enabled: true, onClick: () => void dispatch({ type: 'spoils', cardId: null }) }]
  } else hint = `Waiting on ${rivalFace().name}…`

  const deadline = online ? online.deadlines[me.seat] : null
  const face = rivalFace()
  showDuel(app, {
    view: { ...view_, me: { ...me, hand: sortHand(me.hand, handSort) } },
    sort: handSort,
    onSort: by => {
      handSort = by
      render()
    },
    settled,
    tally,
    counting,
    selected,
    lastLocked,
    slips,
    hint,
    rival: face,
    myMask: face.mask === 'domino_red' ? 'domino' : 'domino_red',
    toast: plain(log[log.length - 1] ?? ''),
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
        sfx.gradeUp()
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
      sfx.flip(true)
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
        sfx.gradeUp()
        return void dispatch({ type: 'flamber', cardIds: ids, grind: id })
      }
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

// rank: high to low, suits break ties. suit: grouped by suit, high to low inside. bulk has neither, so it goes last
function sortHand(hand: Card[], by: HandSort): Card[] {
  const suit = (c: Card) => SUITS.indexOf(c.suit)
  return [...hand].sort((a, b) => Number(a.bulk) - Number(b.bulk)
    || (by === 'rank' ? b.rank - a.rank || suit(a) - suit(b) : suit(a) - suit(b) || b.rank - a.rank))
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
  const solo = view_.mode === 'solo' || view_.mode === 'daily'
  const how = won ? (solo ? 'Paid Le Patron off after round 12. ' : !them.alive ? `Busted ${them.name} in round ${view_.round}. ` : 'Higher bankroll after round 12. ') : ''
  const score = solo ? `Score <b class="gold">${fmt(res.scores[me.seat])}</b> pts` : ''
  const seed = match ? ` · seed <b>${match.config.seed}</b>` : ''
  app.innerHTML = `<div class="title"><div>
    <h1>${won ? (solo ? 'PAID<br><span>LE PATRON</span>' : 'TOOK<br><span>THE TABLE</span>') : 'BUSTED'}</h1>
    <p class="big">${won ? `${how}${score}` : me.alive ? (solo ? "Couldn't pay Le Patron" : 'Behind on chips after round 12') : `Out in round ${view_.round}`}</p>
    <p class="muted">Best appraisal: <b class="gold">${fmt(best.total)}</b>${best.hand ? ` (${best.hand})` : ''}${seed} · you $${me.bankroll} vs ${them.name} $${them.bankroll}</p>
    <div class="row" style="justify-content:center;margin-top:14px">
      ${match ? '<button id="again">Same seed again</button>' : ''}
      <button class="ghost" id="menu">Main menu</button>
    </div>
    ${match ? lbTable(`Leaderboard · ${match.config.seed} · ${DIFFICULTIES[difficulty].name}`, leaderboard(match.config.seed, difficulty)) : ''}
    ${view_.mode === 'daily' ? '<div id="board"></div>' : ''}
  </div></div>`
  if (solo && (won || patronMissed)) {
    const ending = document.createElement('div')
    ending.className = 'patron-ending ' + (won ? 'paid' : 'unpaid')
    const prop = (id: string, cls: string) => {
      const img = document.createElement('img')
      img.src = canvasUrl(partCanvas(id))
      img.className = cls
      img.alt = ''
      ending.appendChild(img)
    }
    prop(won ? 'hud/marker/note' : 'patron/ledger', 'debt-paper')
    prop(won ? 'hud/marker/paid' : 'hud/marker/unpaid', 'payment-stamp')
    if (won) prop('hud/marker/seal', 'wax-seal')
    app.querySelector('h1')!.before(ending)
  }
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

// dev only: ?quick&auto plays your seat with the bot through the real ui, a full run with every screen drawn
if (QUICK && new URLSearchParams(location.search).has('auto')) {
  setInterval(() => {
    if (busy || counting || !match) return
    if (match.phase === 'over') {
      document.body.dataset.autoDone = '1'
      return
    }
    if (resultHold) {
      resultHold = false
      tallyHold = false
      return render()
    }
    if (pending(match).includes(ME)) void dispatch(botAction(match, ME))
  }, 120)
}
