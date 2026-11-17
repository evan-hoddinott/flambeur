import { act, canPeek, firstToAct, forfeit, legalActions, startBetting, type BetAction, type Betting, type Seat } from './engine/betting.ts'
import { autoKeep, forgePlan, type ForgePlan } from './engine/forge.ts'
import { botAct, botDeal, botShop, getStyle } from './engine/bot.ts'
import { SUIT_GLYPH, cardName, isWild, rankLabel, sellPrice, traitName, type Card, type Trait } from './engine/cards.ts'
import { COLLECTIBLES, describe, getDef, hasCollectible, type Owned } from './engine/collectibles.ts'
import { GRADING_PRICE, PLAY_SIZE, ROUNDS, COLLECTIBLE_PRICE, SLEEVE_PRICE, TOURNAMENT_ROUNDS, isTableStart, tableOf } from './engine/economy.ts'
import { DRAFT_PICKS, draftRows, getStarter, starterOffer, type StarterId } from './engine/starters.ts'
import { allCards, deckSize, pileView } from './engine/deck.ts'
import { HAND_NAMES, type HandType } from './engine/hands.ts'
import { randomSeed } from './engine/rng.ts'
import {
  DIFFICULTIES, appraiseFor, binBulk, binderPrice, bulkPrice, buySleeve, canForge, canGrade, canMulligan, dealHand, defaultToDeck, displaySlots, finishRound,
  freeMulligan, freeRestocks, handSize, houseMult, mulligan, newRun, nextRound, runScore, sellBinder, sendToGrading, shopSleeve, showdownWinner, stonks,
  tableBlinds, takePull, twistFor,
  type Difficulty, type Player, type RoundResult, type Run,
} from './engine/run.ts'
import type { Appraisal, Step } from './engine/scoring.ts'
import { newShop, openPack, restock, restockPrice, type PackContents, type PackKind, type Shop } from './engine/shop.ts'
import { isTournament, twistName, twistText, type Twist } from './engine/twists.ts'
import { getSleeve, type Stonks } from './engine/sleeves.ts'
import * as sfx from './ui/sound.ts'

const app = document.getElementById('app') as HTMLElement

// ---------- state ----------
type Table = {
  opp: Player
  oppPlayed: Card[]
  oppEst: number
  selected: Set<number>
  oppMulls: number
  locked: Card[] | null
  peek: Card | null
  betting: Betting | null
  log: string[]
  duel: { you: Appraisal; opp: Appraisal } | null
  result: RoundResult | null
  rivalResult: RoundResult | null
  forgeKeep: Trait[] | null // traits picked when the forge goes over the cap
}
type PackView = { kind: PackKind; contents: PackContents; ripped: boolean; flipped: Set<number>; toDeck: Set<number>; then: () => void }

let run: Run
let table: Table | null = null
let shop: Shop | null = null
let pack: PackView | null = null
let best = { total: 0, hand: '' }
let difficulty: Difficulty = 'medium'
let busy = false // true while animations run so clicks don't double-fire
let counting = false // meters start at 0 while the count-up runs, then show the final appraisal

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const fmt = (n: number) => n.toLocaleString('en-US')

// ---------- small render helpers ----------
function cardHtml(card: Card, cls = ''): string {
  if (card.bulk) return `<div class="card bulk ${cls}" data-id="${card.id}"><span>▦</span><span class="tag">bulk +5</span><span class="s"></span></div>`
  const red = !isWild(card) && (card.suit === 'H' || card.suit === 'D')
  const suit = isWild(card) ? '✦' : SUIT_GLYPH[card.suit]
  const tags: string[] = []
  if (card.finish) tags.push(card.finish)
  if (card.stamp === 'first') tags.push('1st ed')
  if (card.stamp === 'signed') tags.push('signed')
  if (card.stamp === 'gold') tags.push('gold')
  if (card.stamp === 'damaged') tags.push('damaged')
  if (card.grade !== null) tags.push(`psa ${card.grade}`)
  for (const t of card.traits) tags.push(traitName(t).toLowerCase())
  if (card.grind) tags.push(`+${card.grind}`)
  const badge = card.tier > 0 ? `<span class="badge">${'★'.repeat(card.tier)}</span>` : ''
  const classes = ['card', red ? 'red' : '', card.finish ?? '', card.tier > 0 ? `forged t${card.tier}` : '', cls].join(' ')
  return `<div class="${classes}" data-id="${card.id}"><span>${rankLabel(card.rank)}</span>${badge}<span class="tag">${tags.join(' · ')}</span><span class="s">${suit}</span></div>`
}

function backHtml(): string {
  return '<div class="card back"></div>'
}

function caseHtml(sellable: boolean): string {
  const slots: string[] = []
  run.you.display.forEach((o, i) => {
    const def = getDef(o.id)
    const sell = sellable ? `<button class="ghost" data-sell="${i}">Sell $${Math.floor(COLLECTIBLE_PRICE[def.rarity] / 2)}</button>` : ''
    slots.push(`<div class="item ${def.rarity}" data-slot="${i}"><b>${def.name}</b><span>${describe(o)}</span><div class="rar">${def.rarity}</div>${sell}</div>`)
  })
  for (let i = run.you.display.length; i < displaySlots(run.you); i++) slots.push('<div class="item empty">empty slot</div>')
  return `<div class="panel"><h3 style="margin-bottom:10px">Display case</h3><div class="case">${slots.join('')}</div></div>`
}

function levelsHtml(): string {
  const lv = Object.entries(run.you.levels).filter(([, n]) => n > 0)
  const parts: string[] = []
  if (run.you.sleeves.length) parts.push(`<h3 style="margin-bottom:6px">Sleeves</h3>${run.you.sleeves.map(id => `<div class="muted"><b class="gold">${getSleeve(id).name}</b> · ${getSleeve(id).text}</div>`).join('')}`)
  if (lv.length) parts.push(`<h3 style="margin:8px 0 6px">Code cards</h3>${lv.map(([h, n]) => `<div class="muted">${HAND_NAMES[h as HandType]} lv${n + 1}</div>`).join('')}`)
  if (run.you.grading.length) parts.push(`<h3 style="margin:8px 0 6px">Grading desk</h3>${run.you.grading.map(g => `<div class="muted">${cardName(g.card)} is out, back round ${g.back}</div>`).join('')}`)
  if (!parts.length) return ''
  return `<div class="panel" style="margin-top:12px">${parts.join('')}</div>`
}

function stonksText(st: Stonks): string {
  if (st.kind === 'rank') return `${rankLabel(st.rank)}s ×3`
  if (st.kind === 'suit') return `${SUIT_GLYPH[st.suit]} ×3`
  return `${st.finish} ×2`
}

function topHtml(extra = ''): string {
  const { ante, max } = tableBlinds(run)
  const streak = run.you.streak > 0 ? `🔥 ${run.you.streak}` : run.you.streak < 0 ? `🧊 ${-run.you.streak}` : '—'
  return `<div class="top">
    <h2>FLAM<span class="gold">BEUR</span></h2>
    <div class="chips">
      <span class="chip">Round <b>${run.round}/${ROUNDS}</b> · Table <b>${tableOf(run.round)}</b></span>
      <span class="chip">Bankroll <b>$${run.you.bankroll}</b></span>
      <span class="chip">Ante/Max <b>$${ante}/$${max}</b></span>
      <span class="chip">Streak <b>${streak}</b></span>
      <button class="chip" id="deckview" style="cursor:pointer;color:inherit;min-height:0">Deck <b>${run.you.pile.length}</b> pile / <b>${run.you.discard.length}</b> discard · Binder <b>${run.you.binder.length}</b></button>
      <span class="chip">STONKS <b class="hot">${stonksText(stonks(run))}</b></span>
      <span class="chip">Seed <b>${run.seed}</b></span>
      <span class="chip">Box <b>${getStarter(run.starter).name}</b></span>
      <span class="chip">Rival <b>$${run.rival.bankroll}</b> · ${DIFFICULTIES[run.difficulty].name}</span>
      ${nextTwistChip()}
      ${extra}
    </div>
  </div>`
}

// the next tournament round and its twist, so the shop can be used to prepare
function nextTwistChip(): string {
  const r = TOURNAMENT_ROUNDS.find(x => x >= run.round)
  if (r === undefined) return ''
  const t = twistFor(run, r)!
  return `<span class="chip" title="${twistText(t)}">${r === run.round ? 'This round' : `Round ${r}`}: <b class="gold">${twistName(t)}</b></span>`
}

function twistBanner(t: Twist): string {
  return `<div class="banner bad" style="font-size:16px">Tournament round · ${twistName(t)}<div class="muted" style="font-size:13px">${twistText(t)}. No folding, no forging.</div></div>`
}

// pile, discard and binder. the pile is sorted so it doesn't leak the draw order
function showDeckViewer(): void {
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  const section = (title: string, cards: Card[]) => {
    const v = pileView(cards)
    const ranks = [...v.byRank.entries()].sort((a, b) => b[0] - a[0]).map(([r, n]) => `${rankLabel(r)}×${n}`).join(' ')
    const suits = [...v.bySuit.entries()].map(([su, n]) => `${SUIT_GLYPH[su]}${n}`).join(' ')
    return `<div class="panel" style="margin-top:10px;text-align:left"><b>${title} · ${cards.length}</b> <span class="muted" style="font-size:12px">${ranks} · ${suits}${v.bulk ? ` · bulk ${v.bulk}` : ''}</span>
      <div class="binder" style="margin-top:8px">${v.cards.map(c => cardHtml(c, 'mini')).join('')}</div></div>`
  }
  overlay.innerHTML = `<div class="packbox" style="max-width:900px"><h2>Your deck · ${deckSize(run.you)} cards</h2>
    ${section('Pile', run.you.pile)}${section('Discard (back next Table)', run.you.discard)}${section('Binder (never drawn, sell it at the shop)', run.you.binder)}
    <div class="row" style="justify-content:center;margin-top:12px"><button id="closeview">Close</button></div></div>`
  document.body.appendChild(overlay)
  document.getElementById('closeview')!.onclick = () => overlay.remove()
}

function bindDeckViewer(): void {
  const el = document.getElementById('deckview')
  if (el) el.onclick = () => showDeckViewer()
}

// ---------- title ----------
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
  try {
    const lb = leaderboard(run.seed, run.difficulty)
    lb.push({ score: runScore(run), bankroll: run.you.bankroll, won: run.won, best: best.total })
    lb.sort((a, b) => b.score - a.score)
    localStorage.setItem(`flambeur:lb:${run.seed}:${run.difficulty}`, JSON.stringify(lb.slice(0, 10)))
  } catch {
    // private window etc, leaderboard just doesn't persist
  }
}

function lbTable(title: string, lb: Score[]): string {
  if (!lb.length) return ''
  return `<div class="panel lb"><b>${title}</b><table>${lb.map((e, i) => `<tr><td>#${i + 1}</td><td><b>${fmt(e.score ?? 0)}</b> pts</td><td>$${e.bankroll}</td><td>${e.won ? 'cleared' : 'busted'}</td><td>best ${fmt(e.best)}</td></tr>`).join('')}</table></div>`
}

function renderTitle(): void {
  const daily = today()
  const lb = leaderboard(daily, difficulty)
  app.innerHTML = `<div class="title"><div>
    <h1>FLAM<br><span>BEUR</span></h1>
    <p class="muted" style="max-width:460px;margin:14px auto">Rip packs. Build a deck. Bet your bankroll against one rival, every hand, or forge it into something better.</p>
    <div class="row" style="justify-content:center;margin-top:16px">
      ${(Object.keys(DIFFICULTIES) as Difficulty[]).map(d => `<button class="${d === difficulty ? '' : 'ghost'}" data-diff="${d}" title="${DIFFICULTIES[d].text}">${DIFFICULTIES[d].name} ×${DIFFICULTIES[d].scoreMult}</button>`).join('')}
    </div>
    <p class="muted" style="font-size:13px">${DIFFICULTIES[difficulty].text}</p>
    <div class="row" style="justify-content:center;margin-top:16px">
      <button id="daily">Daily run · ${daily}</button>
      <button class="ghost" id="random">Random seed</button>
    </div>
    <div class="row" style="justify-content:center;margin-top:12px">
      <input id="seed" placeholder="or type a seed" maxlength="20" style="width:180px">
      <button class="ghost" id="go">Play seed</button>
    </div>
    ${lbTable(`Today's leaderboard · ${DIFFICULTIES[difficulty].name} (this browser)`, lb)}
  </div></div>`
  app.querySelectorAll<HTMLElement>('[data-diff]').forEach(el => {
    el.onclick = () => {
      difficulty = el.dataset.diff as Difficulty
      renderTitle()
    }
  })
  document.getElementById('daily')!.onclick = () => startRun(daily)
  document.getElementById('random')!.onclick = () => startRun(randomSeed())
  document.getElementById('go')!.onclick = () => {
    const s = (document.getElementById('seed') as HTMLInputElement).value.trim()
    if (s) startRun(s.toUpperCase())
  }
}

function startRun(seed: string): void {
  best = { total: 0, hand: '' }
  showStarterBox(seed)
}

// the run opens on a starter box: rip it, pick 1 of 3 starter decks (same seed = same 3)
function showStarterBox(seed: string): void {
  const offer = starterOffer(seed)
  let ripped = false
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  document.body.appendChild(overlay)
  const draw = () => {
    const body = !ripped
      ? `<p class="muted">Every run starts here. Rip it open.</p><div class="bigpack p-collector" id="srip" style="width:200px">STARTER<br>BOX</div>`
      : `<p class="muted">Pick your deck. Each one plays a little different.</p>
        <div class="shopgrid" style="margin-top:14px">${offer.map(id => {
          const s = getStarter(id)
          return `<div class="offer o-col pull reveal"><h3>${s.name}</h3><p>${s.deckText}</p><p style="color:var(--gold)"><b>${s.twist}</b></p><button data-starter="${id}">Take it</button></div>`
        }).join('')}</div>`
    overlay.innerHTML = `<div class="packbox"><h2>Seed ${seed}</h2>${body}</div>`
    const rip = document.getElementById('srip')
    if (rip) rip.onclick = async () => {
      rip.classList.add('shake')
      sfx.rip()
      await sleep(450)
      ripped = true
      sfx.flip(true)
      draw()
    }
    overlay.querySelectorAll<HTMLElement>('[data-starter]').forEach(el => {
      el.onclick = () => {
        document.body.removeChild(overlay)
        showRowDraft(seed, el.dataset.starter as StarterId)
      }
    })
  }
  draw()
}

// the box is dealt into 4 rows of 8, keep 3 of them = your 24 card deck
function showRowDraft(seed: string, starter: StarterId): void {
  const rows = draftRows(seed, starter)
  const picked = new Set<number>([0, 1, 2])
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  document.body.appendChild(overlay)
  const draw = () => {
    overlay.innerHTML = `<div class="packbox" style="max-width:900px"><h2>${getStarter(starter).name}</h2>
      <p class="muted">Keep ${DRAFT_PICKS} rows. That's your ${DRAFT_PICKS * rows[0].cards.length} card deck.</p>
      ${rows.map((row, i) => `<div class="panel" data-row="${i}" style="margin-top:10px;cursor:pointer;${picked.has(i) ? 'border-color:var(--gold)' : 'opacity:.5'}">
        <div class="muted" style="font-size:13px">${picked.has(i) ? '✔ ' : ''}${row.label}</div>
        <div class="hand" style="margin-top:6px">${row.cards.map(c => cardHtml(c)).join('')}</div></div>`).join('')}
      <div class="row" style="justify-content:center;margin-top:12px"><button id="keeprows" ${picked.size !== DRAFT_PICKS ? 'disabled' : ''}>Keep these ${picked.size}/${DRAFT_PICKS}</button></div>
    </div>`
    overlay.querySelectorAll<HTMLElement>('[data-row]').forEach(el => {
      el.onclick = () => {
        const i = Number(el.dataset.row)
        if (picked.has(i)) picked.delete(i)
        else picked.add(i)
        draw()
      }
    })
    document.getElementById('keeprows')!.onclick = () => {
      if (picked.size !== DRAFT_PICKS) return
      document.body.removeChild(overlay)
      run = newRun(seed, starter, [...picked].sort(), difficulty)
      // round 1 starts with a free pack instead of a shop
      showPack('free', () => startRound())
    }
  }
  draw()
}

// ---------- pack opening ----------
function glowFor(card: Card): string {
  if (card.finish === 'prism') return 'var(--gold)'
  if (card.finish || card.stamp) return card.stamp ? 'var(--green)' : 'var(--blue)'
  return '#e8e8e8'
}

function showPack(kind: PackKind, then: () => void): void {
  const contents = openPack(kind, run.rng, run.round, run.mem, run.you.display)
  // every pull goes to the deck or the binder. default: special cards to the deck, plain ones to the binder
  const toDeck = new Set(contents.cards.filter(defaultToDeck).map(c => c.id))
  pack = { kind, contents, ripped: false, flipped: new Set(), toDeck, then }
  renderPack()
}

const PACK_NAMES: Record<PackKind, string> = { free: 'Free Pack', offbrand: 'Off-Brand', repack: 'Repack', collector: 'Collector Pack' }

function renderPack(): void {
  if (!pack) return
  const p = pack
  const allFlipped = p.contents.cards.every(c => p.flipped.has(c.id))
  let body: string
  if (!p.ripped) {
    body = `<p class="muted">Click the pack to rip it open</p><div class="bigpack p-${p.kind}" id="rip">${PACK_NAMES[p.kind].toUpperCase()}</div>`
  } else {
    const pulls = p.contents.cards.map(c => {
      if (!p.flipped.has(c.id)) return `<div class="pull"><div class="glowback" style="--glow:${glowFor(c)}" data-flip="${c.id}"></div><span class="muted" style="font-size:12px">?</span></div>`
      const deck = p.toDeck.has(c.id)
      return `<div class="pull reveal">${cardHtml(c)}<button class="${deck ? '' : 'ghost'}" data-sort="${c.id}" style="padding:4px 10px;min-height:28px;font-size:12px">${deck ? 'Deck' : 'Binder'}</button></div>`
    })
    if (allFlipped && p.contents.codeCard) pulls.push(`<div class="pull reveal"><div class="extra code">CODE CARD<br>${HAND_NAMES[p.contents.codeCard]} +1 level</div><span class="muted" style="font-size:12px">auto-applied</span></div>`)
    if (allFlipped && p.contents.collectible) {
      const def = getDef(p.contents.collectible.id)
      const room = run.you.display.length < displaySlots(run.you)
      pulls.push(`<div class="pull reveal"><div class="extra col">★ ${def.name}<br><span style="font-weight:400;font-size:11px;color:#d5cde8">${describe(p.contents.collectible)}</span></div><span class="muted" style="font-size:12px">${room ? 'goes in your case' : `case full, sells for $${Math.floor(COLLECTIBLE_PRICE[def.rarity] / 2)}`}</span></div>`)
    }
    body = `<div class="pulls">${pulls.join('')}</div>
      <div class="row" style="justify-content:center">
        ${allFlipped ? '<button id="done">Done</button>' : '<button class="ghost" id="all">Reveal all</button>'}
      </div>`
  }
  let overlay = document.getElementById('overlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'overlay'
    overlay.className = 'overlay'
    document.body.appendChild(overlay)
  }
  overlay.innerHTML = `<div class="packbox"><h2>${PACK_NAMES[p.kind]}</h2>${body}</div>`

  const ripEl = document.getElementById('rip')
  if (ripEl) ripEl.onclick = async () => {
    ripEl.classList.add('shake')
    sfx.rip()
    await sleep(450)
    p.ripped = true
    renderPack()
  }
  overlay.querySelectorAll<HTMLElement>('[data-flip]').forEach(el => {
    el.onclick = () => flipCard(Number(el.dataset.flip))
  })
  overlay.querySelectorAll<HTMLElement>('[data-sort]').forEach(el => {
    el.onclick = () => {
      const id = Number(el.dataset.sort)
      if (p.toDeck.has(id)) p.toDeck.delete(id)
      else p.toDeck.add(id)
      renderPack()
    }
  })
  const allEl = document.getElementById('all')
  if (allEl) allEl.onclick = async () => {
    for (const c of p.contents.cards) {
      if (p.flipped.has(c.id)) continue
      flipCard(c.id)
      await sleep(220)
    }
  }
  const doneEl = document.getElementById('done')
  if (doneEl) doneEl.onclick = () => finishPack()
}

function flipCard(id: number): void {
  if (!pack || pack.flipped.has(id)) return
  const card = pack.contents.cards.find(c => c.id === id)
  if (!card) throw new Error(`flipping unknown card ${id}`)
  pack.flipped.add(id)
  sfx.flip(card.finish === 'prism' || card.stamp !== null)
  renderPack()
}

function finishPack(): void {
  if (!pack) return
  const p = pack
  for (const c of p.contents.cards) takePull(run, c, p.toDeck.has(c.id))
  if (p.contents.codeCard) run.you.levels[p.contents.codeCard]++
  if (p.contents.collectible) {
    if (run.you.display.length < displaySlots(run.you)) run.you.display.push(p.contents.collectible)
    else run.you.bankroll += Math.floor(COLLECTIBLE_PRICE[getDef(p.contents.collectible.id).rarity] / 2)
  }
  sfx.coin()
  document.getElementById('overlay')?.remove()
  pack = null
  p.then()
}

// ---------- shop ----------
const PACK_TEXT: Record<PackKind, string> = {
  free: '3 plain cards. One per shop. Binder them and sell when STONKS is hot.',
  offbrand: '5 cheap cards. Lots of stamps, some damaged.',
  repack: '4 cards other collectors sold. Some come pre-forged.',
  collector: '3 cards, a Code Card, and a rare slot: collectible or Prism.',
}

function enterShop(): void {
  shop = newShop(run.rng, run.mem, run.you.display, shopSleeve(run, 0))
  renderShop()
}

// the binder: sell (STONKS hot cards pay more), send to grading, bin bulk
function binderHtml(): string {
  const bulkCount = [...run.you.pile, ...run.you.discard].filter(c => c.bulk).length
  const gradeOk = run.you.bankroll - GRADING_PRICE >= 1
  const cards = run.you.binder.map(c => {
    const price = binderPrice(run, run.you, c)
    const hot = price > sellPrice(c)
    return `<div class="slot">${cardHtml(c, 'mini')}<button data-sellcard="${c.id}" class="${hot ? '' : 'ghost'}">Sell $${price}${hot ? ' 🔥' : ''}</button>${canGrade(c) ? `<button class="ghost" data-grade="${c.id}" ${gradeOk ? '' : 'disabled'}>Grade $${GRADING_PRICE}</button>` : ''}</div>`
  })
  return `<div class="panel" style="margin-top:14px">
    <h3 style="margin-bottom:8px">Binder · STONKS today: <span class="hot">${stonksText(stonks(run))}</span></h3>
    ${cards.length ? `<div class="binder">${cards.join('')}</div>` : '<p class="muted" style="font-size:13px">Empty. Pulls you send to the binder land here. It\'s the only place you can sell from.</p>'}
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
      <button class="ghost" id="binbulk" ${bulkCount === 0 || run.you.bankroll - bulkPrice(run.you) < 1 ? 'disabled' : ''}>Bin a Bulk for good · $${bulkPrice(run.you)} (${bulkCount} in deck)</button>
      <button class="ghost" id="gradedeck" ${gradeOk ? '' : 'disabled'}>Grade a deck card · $${GRADING_PRICE}</button>
    </div>
  </div>`
}

function renderShop(): void {
  if (!shop) return
  const s = shop
  const restockCost = restockPrice(s, freeRestocks(run.you))
  const line = run.mem.rolledOver
    ? '"What, you too good for my stuff? Fine. Prices are up."'
    : isTournament(run.round) ? '"Big game next round. Got something special in the back."' : '"Fresh stock came in this morning. Take a look."'
  const offers = s.offers.map((o, i) => {
    const afford = run.you.bankroll - o.price >= 1 // keep $1 to sit at the table
    if (o.type === 'pack') {
      return `<div class="offer p-${o.kind} ${o.sold ? 'sold' : ''}"><h3>${PACK_NAMES[o.kind]}</h3><b>${o.price ? `$${o.price}` : 'FREE'}</b><p>${PACK_TEXT[o.kind]}</p>
        <button data-buy="${i}" ${o.sold || !afford ? 'disabled' : ''}>${o.sold ? 'Opened' : 'Open'}</button></div>`
    }
    if (o.type === 'sleeve') {
      const sl = getSleeve(o.id)
      return `<div class="offer o-col ${o.sold ? 'sold' : ''}" style="outline:2px solid var(--gold)"><h3>Sleeve · ${sl.name}</h3><b>$${o.price} · run-wide</b><p>${sl.text}</p>
        <button data-buy="${i}" ${o.sold || !afford ? 'disabled' : ''}>${o.sold ? 'Bought' : 'Buy'}</button></div>`
    }
    const def = getDef(o.owned.id)
    const full = run.you.display.length >= displaySlots(run.you)
    return `<div class="offer o-col ${o.sold ? 'sold' : ''}"><h3>${def.name}</h3><b>$${o.price} · ${def.rarity}</b><p>${describe(o.owned)}</p>
      <button data-buy="${i}" ${o.sold || !afford || full ? 'disabled' : ''}>${o.sold ? 'Bought' : full ? 'Case full' : 'Buy'}</button></div>`
  })
  app.innerHTML = `${topHtml()}
    <div class="main">
      <div class="panel">
        <div class="keeper"><div class="face">🧔</div><div class="bubble">${line}</div></div>
        <div class="shopgrid">${offers.join('')}</div>
        <div class="row" style="margin-top:14px;justify-content:space-between">
          <button class="ghost" id="restock" ${run.you.bankroll - restockCost < 1 ? 'disabled' : ''}>Restock · ${restockCost ? `$${restockCost}` : 'free'}</button>
          <button id="next">To the table · round ${run.round}</button>
        </div>
        ${binderHtml()}
      </div>
      <div>${caseHtml(true)}${levelsHtml()}</div>
    </div>`

  bindDeckViewer()
  app.querySelectorAll<HTMLElement>('[data-buy]').forEach(el => {
    el.onclick = () => buy(Number(el.dataset.buy))
  })
  app.querySelectorAll<HTMLElement>('[data-sell]').forEach(el => {
    el.onclick = () => sellCollectible(Number(el.dataset.sell), renderShop)
  })
  app.querySelectorAll<HTMLElement>('[data-sellcard]').forEach(el => {
    el.onclick = () => {
      sellBinder(run, 0, Number(el.dataset.sellcard))
      sfx.coin()
      renderShop()
    }
  })
  app.querySelectorAll<HTMLElement>('[data-grade]').forEach(el => {
    el.onclick = () => {
      sendToGrading(run, 0, Number(el.dataset.grade))
      sfx.coin()
      renderShop()
    }
  })
  document.getElementById('binbulk')!.onclick = () => {
    binBulk(run, 0)
    sfx.coin()
    renderShop()
  }
  document.getElementById('gradedeck')!.onclick = () => pickDeckCardToGrade()
  document.getElementById('restock')!.onclick = () => {
    if (run.you.bankroll - restockCost < 1) return
    run.you.bankroll -= restockCost
    shop = restock(s, run.rng, run.mem, run.you.display)
    sfx.coin()
    renderShop()
  }
  document.getElementById('next')!.onclick = () => startRound()
}

// grading a deck card takes it out of your deck for a round
function pickDeckCardToGrade(): void {
  const cards = pileView([...run.you.pile, ...run.you.discard].filter(canGrade)).cards
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `<div class="packbox" style="max-width:900px"><h2>Grading desk · $${GRADING_PRICE}</h2>
    <p class="muted">Pick a card. It's gone for a round and comes back graded 1–10. Fresh pulls grade higher.</p>
    <div class="binder" style="justify-content:center">${cards.map(c => `<div class="slot" data-pickgrade="${c.id}" style="cursor:pointer">${cardHtml(c, 'mini')}</div>`).join('')}</div>
    <div class="row" style="justify-content:center;margin-top:12px"><button class="ghost" id="cancelgrade">Cancel</button></div></div>`
  document.body.appendChild(overlay)
  document.getElementById('cancelgrade')!.onclick = () => overlay.remove()
  overlay.querySelectorAll<HTMLElement>('[data-pickgrade]').forEach(el => {
    el.onclick = () => {
      sendToGrading(run, 0, Number(el.dataset.pickgrade))
      overlay.remove()
      sfx.coin()
      renderShop()
    }
  })
}

function buy(i: number): void {
  if (!shop) return
  const o = shop.offers[i]
  if (o.sold || run.you.bankroll - o.price < 1) return
  if (o.type === 'sleeve') {
    if (o.price !== SLEEVE_PRICE) throw new Error('sleeve price drifted from the engine')
    buySleeve(run, 0, o.id)
    o.sold = true
    sfx.gradeUp()
    renderShop()
    return
  }
  run.you.bankroll -= o.price
  o.sold = true
  if (o.type === 'collectible') {
    if (run.you.display.length >= displaySlots(run.you)) throw new Error('bought a collectible with a full case')
    run.you.display.push(o.owned)
    sfx.coin()
    renderShop()
    return
  }
  showPack(o.kind, renderShop)
}

function sellCollectible(slot: number, then: () => void): void {
  const owned: Owned | undefined = run.you.display[slot]
  if (!owned) return
  run.you.bankroll += Math.floor(COLLECTIBLE_PRICE[getDef(owned.id).rarity] / 2)
  run.you.display.splice(slot, 1)
  sfx.coin()
  then()
}

// ---------- the table ----------
function startRound(): void {
  if (run.you.bankroll <= 0) throw new Error('sat down at the table with no bankroll')
  // the rival shops and draws at the same time you do, off its own rng streams
  const spent = botShop(run, 1, rivalStyle())
  const full = handSize(run.you)
  const yours = dealHand(run)
  const oBest = botDeal(run, 1)
  const opp = run.rival
  const log = [run.round === 1
    ? `Your rival opens a <b>${getStarter(run.rivalStarter).name}</b> and sits down with <b>$${opp.bankroll}</b>.`
    : `Your rival ${spent > 0 ? `spent $${spent} in the shop` : 'skipped the shop'} and has <b>$${opp.bankroll}</b>.`]
  if (isTableStart(run.round)) log.push(`<b>Table ${tableOf(run.round)}</b>: everything shuffled back into one pile.`)
  if (yours.length < full) log.push(`The pile ran low: you only got <b>${yours.length}</b> cards.`)
  table = {
    opp, oppPlayed: oBest.played, oppEst: oBest.est?.total ?? 0,
    selected: new Set(), oppMulls: oBest.mulls, locked: null, peek: null, betting: null,
    log, duel: null, result: null, rivalResult: null, forgeKeep: null,
  }
  // an empty pile loses the round on the spot
  if (yours.length === 0 || oBest.played.length === 0) {
    const t = table
    t.locked = []
    const { ante, max } = tableBlinds(run)
    const bankrolls: [number, number] = [run.you.bankroll, opp.bankroll]
    const who: Seat | null = yours.length === 0 && oBest.played.length === 0 ? null : yours.length === 0 ? 0 : 1
    t.log.push(who === 0 ? 'Your pile is empty. <b>You lose the round.</b>' : who === 1 ? 'Rival\'s pile is empty. <b>They lose the round.</b>' : 'Both piles are empty.')
    t.betting = forfeit(startBetting(firstToAct(bankrolls, run.round), ante, max, bankrolls, [false, false], isTournament(run.round)), who)
    renderTable()
    void resolveRound()
    return
  }
  renderTable()
}

function rivalStyle() {
  return getStyle(DIFFICULTIES[run.difficulty].style)
}

const ACTION_LABEL: Record<BetAction, string> = { fold: 'Fold', forge: 'Forge', min: 'Bet Min', max: 'Bet Max', call: 'Call', raise: 'Raise' }

function renderTable(): void {
  if (!table) return
  const t = table
  const { ante, max } = tableBlinds(run)
  const lockedIds = new Set((t.locked ?? []).map(c => c.id))

  // rival: you see their hand size, never how many they locked. face up at showdown
  const showOpp = t.duel !== null
  const oppCards = showOpp
    ? t.oppPlayed.map(c => cardHtml(c, t.duel!.opp.scoringIds.includes(c.id) ? 'scoring' : 'dim')).join('')
    : run.rival.hand.map((_, i) => (t.peek && i === 0 ? cardHtml(t.peek) : backHtml())).join('')

  const yourCards = t.locked
    ? t.locked.map(c => cardHtml(c, t.duel ? (t.duel.you.scoringIds.includes(c.id) ? 'scoring' : 'dim') : '')).join('') +
      run.you.hand.filter(c => !lockedIds.has(c.id)).map(c => cardHtml(c, 'dim')).join('')
    : run.you.hand.map(c => cardHtml(c, t.selected.has(c.id) ? 'sel' : '')).join('')

  let controls = ''
  if (!t.locked) {
    const n = t.selected.size
    const mullOk = canMulligan(run, run.you) && n > 0
    const mullCost = freeMulligan(run.you) ? 'free' : 'hand −1 this Table'
    controls = `<div class="bets">
      <button class="ghost" id="mull" ${mullOk ? '' : 'disabled'}>Mulligan ${n || ''} (${twistFor(run)?.id === 'colddeck' ? 'cold deck' : mullCost})</button>
      <button id="lock" ${n < 1 || n > PLAY_SIZE ? 'disabled' : ''}>Lock in ${n}</button>
    </div><p class="center muted" style="font-size:13px">Pick 1–${PLAY_SIZE} cards to play. Played cards are out until the next Table, the rest go back into the pile. Fold or forge mucks the whole hand.</p>`
  } else if (t.betting && !t.betting.outcome && t.betting.toAct === 0) {
    const legal = legalActions(t.betting)
    const amount = (a: BetAction) => {
      const b = t.betting!
      if (a === 'min') return ` $${b.minStake}`
      if (a === 'max' || a === 'raise') return ` $${b.maxStake}`
      if (a === 'call') return ` $${b.committed[1]}`
      if (a === 'fold' || a === 'forge') return ` (lose $${b.committed[0]})`
      return ''
    }
    controls = `<div class="bets">${legal.map(a => `<button data-act="${a}" class="${a === 'fold' ? 'ghost' : a === 'forge' ? 'danger' : ''}">${ACTION_LABEL[a]}${amount(a)}</button>`).join('')}</div>`
    if (legal.includes('forge') && t.locked) {
      const plan = forgePlan(t.locked)
      if (plan) controls += `<p class="center muted" style="font-size:13px">${forgePreview(plan)}</p>`
    }
  } else if (t.result) {
    controls = `<div class="bets"><button id="cont">${run.over ? 'See results' : 'Continue to shop'}</button></div>`
  }

  const duel = t.duel
    ? `<div class="duel">${meterHtml('You', 'you', t.duel.you, t.duel.opp)}${meterHtml('Rival', 'opp', t.duel.opp, t.duel.you)}</div>`
    : ''

  const resultHtml = t.result ? resultBanner(t.result) : ''

  const twist = twistFor(run)
  app.innerHTML = `${topHtml()}
    <div class="main">
      <div class="panel">
        ${twist ? twistBanner(twist) : ''}
        <div class="muted" style="font-size:12px;letter-spacing:2px;text-transform:uppercase">Rival · ${getStarter(run.rivalStarter).name} · ${t.opp.display.length} collectibles · ${deckSize(t.opp)} cards · hand ${run.rival.hand.length} · ${t.oppMulls} mulligan${t.oppMulls === 1 ? '' : 's'}</div>
        <div class="hand" style="margin:8px 0 4px">${oppCards}</div>
        ${duel}
        <div class="log">${t.log.slice(-3).map(l => `<div>${l}</div>`).join('')}</div>
        ${resultHtml}
        <div class="hand" style="margin-top:14px" id="yourhand">${yourCards}</div>
        ${controls}
        <p class="center muted" style="font-size:12px;margin-top:8px">Ante $${ante} · Max $${max} · hand size ${handSize(run.you)} · lower bankroll acts second · showdowns pay your paycheck, the winner gets a house bonus${isTournament(run.round) ? ` (${houseMult(run, run.you)}× ante for you with momentum)` : ''}</p>
      </div>
      <div>${caseHtml(false)}${levelsHtml()}</div>
    </div>`

  bindDeckViewer()
  if (!t.locked) {
    app.querySelectorAll<HTMLElement>('#yourhand .card').forEach(el => {
      el.onclick = () => {
        const id = Number(el.dataset.id)
        if (t.selected.has(id)) t.selected.delete(id)
        else t.selected.add(id)
        renderTable()
      }
    })
    document.getElementById('mull')!.onclick = () => doMulligan()
    document.getElementById('lock')!.onclick = () => lockIn()
  }
  app.querySelectorAll<HTMLElement>('[data-act]').forEach(el => {
    el.onclick = () => void playerAct(el.dataset.act as BetAction)
  })
  const cont = document.getElementById('cont')
  if (cont) cont.onclick = () => {
    if (run.over) return renderOver()
    nextRound(run)
    enterShop()
  }
}

function meterHtml(who: string, side: 'you' | 'opp', mine: Appraisal, theirs: Appraisal): string {
  if (counting) {
    return `<div class="meter" id="m-${side}"><div class="who">${who}</div><div class="hand"></div>
      <div class="math"><span class="v">0</span> × <span class="h">0</span><span class="g"></span></div>
      <div class="total">0</div><div class="step"></div></div>`
  }
  const w = showdownWinner(run, side === 'you' ? mine.total : theirs.total, side === 'you' ? theirs.total : mine.total)
  const won = w === (side === 'you' ? 0 : 1) ? 'winner' : ''
  return `<div class="meter ${won}" id="m-${side}"><div class="who">${who}</div><div class="hand">${handLabel(mine)}</div>
    <div class="math"><span class="v">${fmt(mine.value)}</span> × <span class="h">${fmt(mine.hype)}</span><span class="g">${mine.grade > 0 ? ` × 2^${mine.grade}` : ''}</span></div>
    <div class="total">${fmt(mine.total)}</div><div class="step"></div></div>`
}

function handLabel(a: Appraisal): string {
  return [a.hand, ...a.bonus].map(h => HAND_NAMES[h]).join(' + ')
}

function resultBanner(r: RoundResult): string {
  const text = {
    win: ['You take the pot', 'good'], loss: ['Rival takes it', 'bad'], tie: ['Dead even, nobody pays', ''],
    fold: ['You folded', 'bad'], forge: ['Forged!', 'good'],
  }[r.outcome]
  const inc = r.income
  const incomeParts = [inc.paycheck ? `paycheck +$${inc.paycheck}` : 'no paycheck (no showdown)']
  if (inc.house) incomeParts.push(`house bonus +$${inc.house}${isTournament(run.round) ? ` (${houseMult(run, run.you)}× ante with momentum)` : ''}`)
  if (inc.interest) incomeParts.push(`interest +$${inc.interest}`)
  if (inc.streak) incomeParts.push(`streak +$${inc.streak}`)
  if (inc.sticker) incomeParts.push(`price sticker +$${inc.sticker}`)
  if (inc.gold) incomeParts.push(`gold border ${inc.gold > 0 ? '+' : '−'}$${Math.abs(inc.gold)}`)
  const forged = r.forged ? `<div class="center" style="margin-top:6px">New card in your deck: ${cardHtml(r.forged).replace('class="card', 'style="display:inline-flex;vertical-align:middle" class="card')}</div>` : ''
  const ground = r.ground ? `<div class="center muted">Folding ground your <b class="gold">${cardName(r.ground)}</b> up to +${r.ground.grind} Value. That's it. That's the build.</div>` : ''
  const bulk = r.bulk.length ? `<div class="center muted">The forge left <b>${r.bulk.length} Bulk</b> in your deck (+5 Value each when played).</div>` : ''
  const torn = r.torn.length ? `<div class="center muted">Torn up: ${r.torn.map(cardName).join(', ')}</div>` : ''
  const income = run.over ? '' : `<div class="center muted">${incomeParts.join(' · ')}</div>`
  const bust = run.over && run.rival.bankroll === 0 ? `<div class="banner good">Your rival is busted. The table is yours.</div>` : ''
  return `${bust}<div class="banner ${text[1]}">${text[0]} ${r.delta > 0 ? `+$${r.delta}` : r.delta < 0 ? `−$${-r.delta}` : ''}</div>${income}${forged}${bulk}${ground}${torn}`
}

function doMulligan(): void {
  if (!table || table.selected.size === 0 || !canMulligan(run, run.you)) return
  const tossed = table.selected.size
  const res = mulligan(run, 0, [...table.selected])
  table.selected.clear()
  table.log.push(`Mulliganed ${tossed}, drew ${res.drawn.length}${res.free ? ' (free)' : `. Hand size is ${handSize(run.you)} for the rest of this Table`}.`)
  sfx.flip(false)
  renderTable()
}

function lockIn(): void {
  if (!table || table.selected.size < 1 || table.selected.size > PLAY_SIZE) return
  const t = table
  t.locked = run.you.hand.filter(c => t.selected.has(c.id))
  const bankrolls: [number, number] = [run.you.bankroll, t.opp.bankroll]
  if (canPeek(0, bankrolls)) {
    t.peek = t.oppPlayed[Math.floor(run.rng() * t.oppPlayed.length)]
    t.log.push(`You're the underdog: you <b>peek</b> at one of their locked cards.`)
  }
  const { ante, max } = tableBlinds(run)
  const forgeable: [boolean, boolean] = [canForge(t.locked), canForge(t.oppPlayed)]
  const first = firstToAct(bankrolls, run.round)
  t.betting = startBetting(first, ante, max, bankrolls, forgeable, isTournament(run.round))
  t.log.push(first === 0 ? 'You act first.' : 'Rival acts first, you see their bet.')
  renderTable()
  void botTurns()
}

async function botTurns(): Promise<void> {
  if (!table?.betting) return
  const t = table
  while (t.betting && !t.betting.outcome && t.betting.toAct === 1) {
    busy = true
    await sleep(800)
    const b: Betting = t.betting
    const a = botAct(b, legalActions(b), t.oppEst, run, rivalStyle(), run.rng)
    t.betting = act(b, a)
    t.log.push(`Rival: <b>${ACTION_LABEL[a]}</b>${a === 'max' || a === 'raise' ? ` ($${b.maxStake})` : ''}`)
    renderTable()
  }
  busy = false
  if (t.betting?.outcome) void resolveRound()
}

function forgePreview(plan: ForgePlan): string {
  const into = `${rankLabel(plan.rank)}${'★'.repeat(plan.tier)}`
  const traits = plan.candidates.map(traitName).join(', ')
  const pick = plan.candidates.length > plan.tier ? ` · you keep ${plan.tier} of ${plan.candidates.length}` : ''
  return `Forge folds and merges ${plan.merged.map(cardName).join(' ')} into <b class="gold">${into}</b> (${traits}${pick})`
}

// over the trait cap: let the player pick which traits the new card keeps, then forge
// resolves null if they back out, then nothing happens and they can pick another action
function chooseTraits(plan: ForgePlan): Promise<Trait[] | null> {
  return new Promise(resolve => {
    const keep = new Set<number>(autoKeep(plan).map(t => plan.candidates.indexOf(t)))
    const overlay = document.createElement('div')
    overlay.className = 'overlay'
    document.body.appendChild(overlay)
    const draw = () => {
      overlay.innerHTML = `<div class="packbox panel" style="max-width:440px">
        <h2>${rankLabel(plan.rank)}${'★'.repeat(plan.tier)} holds ${plan.tier} trait${plan.tier > 1 ? 's' : ''}</h2>
        <p class="muted">Pick which ones to keep.</p>
        <div style="display:flex;flex-direction:column;gap:8px;text-align:left;margin:12px 0">
          ${plan.candidates.map((t, i) => `<label style="cursor:pointer"><input type="checkbox" data-t="${i}" ${keep.has(i) ? 'checked' : ''}> <b>${traitName(t)}</b></label>`).join('')}
        </div>
        <div class="row" style="justify-content:center"><button class="ghost" id="cancel">Cancel</button><button id="keep" ${keep.size !== plan.tier ? 'disabled' : ''}>Forge it (${keep.size}/${plan.tier})</button></div>
      </div>`
      overlay.querySelectorAll<HTMLInputElement>('[data-t]').forEach(el => {
        el.onchange = () => {
          const i = Number(el.dataset.t)
          if (el.checked) keep.add(i)
          else keep.delete(i)
          draw()
        }
      })
      document.getElementById('cancel')!.onclick = () => {
        document.body.removeChild(overlay)
        resolve(null)
      }
      document.getElementById('keep')!.onclick = () => {
        if (keep.size !== plan.tier) return
        document.body.removeChild(overlay)
        resolve([...keep].map(i => plan.candidates[i]))
      }
    }
    draw()
  })
}

async function playerAct(a: BetAction): Promise<void> {
  if (!table?.betting || busy) return
  if (a === 'forge' && table.locked) {
    const plan = forgePlan(table.locked)
    if (!plan) throw new Error('forge offered on a hand that cannot forge')
    table.forgeKeep = null
    if (plan.candidates.length > plan.tier) {
      busy = true
      const picked = await chooseTraits(plan)
      busy = false
      if (!picked) return
      table.forgeKeep = picked
    }
  }
  table.betting = act(table.betting, a)
  table.log.push(`You: <b>${ACTION_LABEL[a]}</b>`)
  renderTable()
  if (table.betting.outcome) void resolveRound()
  else void botTurns()
}

async function resolveRound(): Promise<void> {
  if (!table?.betting?.outcome || !table.locked) return
  const t = table
  busy = true
  const b = t.betting!
  let winner: Seat | null = null
  let scoring: [number[], number[]] = [[], []]
  if (b.outcome!.kind === 'showdown' && t.locked!.length && t.oppPlayed.length) {
    const betMax = (s: Seat) => b.maxStake > b.minStake && b.committed[s] === b.maxStake
    const you = appraiseFor(run, run.you, t.locked!, betMax(0), run.rng)
    const opp = appraiseFor(run, t.opp, t.oppPlayed, betMax(1), run.rng)
    t.duel = { you, opp }
    counting = true
    renderTable()
    await countUp(you, opp)
    counting = false
    winner = showdownWinner(run, you.total, opp.total)
    scoring = [you.scoringIds, opp.scoringIds]
    if (you.total > best.total) best = { total: you.total, hand: handLabel(you) }
    if (winner !== null) document.getElementById(winner === 0 ? 'm-you' : 'm-opp')?.classList.add('winner')
    if (winner === 0) sfx.win()
    else if (winner === 1) sfx.lose()
    await sleep(700)
  } else if (b.outcome!.kind === 'fold' && b.outcome!.by === 1) {
    t.log.push('Rival folds. Their ante is yours.')
    sfx.coin()
  } else if (b.outcome!.kind === 'forge' && b.outcome!.by === 1) {
    t.log.push('Rival forges their hand and walks away.')
  } else if (b.outcome!.kind === 'fold' && b.outcome!.by === 0) {
    t.log.push('You fold.')
  }
  const [mine, theirs] = finishRound(run, b, winner, [t.locked!, t.oppPlayed], scoring, t.forgeKeep)
  t.result = mine
  t.rivalResult = theirs
  if (theirs.forged) t.log.push(`Rival forged a <b class="gold">${cardName(theirs.forged)}</b> into their deck.`)
  if (t.result.outcome === 'forge') sfx.gradeUp()
  if (run.over) saveScore()
  busy = false
  renderTable()
}

// both appraisals tick up side by side, one step at a time, so it stays tense to the end
async function countUp(you: Appraisal, opp: Appraisal): Promise<void> {
  const sides = [
    { a: you, el: document.getElementById('m-you')!, v: 0, h: 0, g: 0 },
    { a: opp, el: document.getElementById('m-opp')!, v: 0, h: 0, g: 0 },
  ]
  const steps = Math.max(you.steps.length, opp.steps.length)
  for (let i = 0; i < steps; i++) {
    let gradeHit = false
    for (const s of sides) {
      const step: Step | undefined = s.a.steps[i]
      if (!step) continue
      s.v += step.value
      s.h += step.hype
      s.g += step.grade
      if (step.grade) gradeHit = true
      if (i <= s.a.bonus.length) s.el.querySelector('.hand')!.textContent = handLabel({ ...s.a, bonus: s.a.bonus.slice(0, i) })
      s.el.querySelector('.step')!.textContent = i === 0 ? '' : stepLabel(step, s === sides[0] ? run.you : table!.opp)
      s.el.querySelector('.v')!.textContent = fmt(s.v)
      s.el.querySelector('.h')!.textContent = fmt(Math.max(1, s.h))
      s.el.querySelector('.g')!.textContent = s.g > 0 ? ` × 2^${s.g}` : ''
      const total = s.el.querySelector('.total')!
      total.textContent = fmt(s.v * Math.max(1, s.h) * 2 ** s.g)
      total.classList.remove('bump')
      void (total as HTMLElement).offsetWidth
      total.classList.add('bump')
      if (step.cardId !== null) document.querySelector(`.card[data-id="${step.cardId}"]`)?.classList.add('pulse')
      if (step.slot !== null && s === sides[0]) {
        const slot = document.querySelector(`.item[data-slot="${step.slot}"]`)
        slot?.classList.remove('fire')
        void (slot as HTMLElement | null)?.offsetWidth
        slot?.classList.add('fire')
      }
    }
    if (gradeHit) sfx.gradeUp()
    else sfx.tick(i)
    await sleep(Math.max(110, 320 - i * 14))
    document.querySelectorAll('.card.pulse').forEach(el => el.classList.remove('pulse'))
  }
  for (const s of sides) {
    if (s.v * Math.max(1, s.h) * 2 ** s.g !== s.a.total) throw new Error('count-up does not match appraisal')
  }
}

function stepLabel(step: Step, owner: Player): string {
  const parts: string[] = []
  if (step.value) parts.push(`${step.value > 0 ? '+' : ''}${step.value} Value`)
  if (step.hype) parts.push(`${step.hype > 0 ? '+' : ''}${step.hype} Hype`)
  if (step.grade) parts.push(`+${step.grade} Grade`)
  let who = step.label
  if (step.label === 'card' && step.cardId !== null) {
    const card = [...allCards(owner), ...(table?.locked ?? []), ...(table?.oppPlayed ?? [])].find(c => c.id === step.cardId)
    who = card ? cardName(card) : 'card'
  }
  return `${who}: ${parts.join(', ')}`
}

// ---------- end of run ----------
function renderOver(): void {
  const lb = leaderboard(run.seed, run.difficulty)
  app.innerHTML = `<div class="title"><div>
    <h1>${run.won ? 'CLEARED<br><span>THE TABLE</span>' : 'BUSTED'}</h1>
    <p style="font-size:20px">${run.won ? `${run.rival.bankroll === 0 ? `Busted your rival in round ${run.round}. ` : ''}Final bankroll <b class="gold">$${run.you.bankroll}</b> × ${DIFFICULTIES[run.difficulty].scoreMult} = <b class="gold">${fmt(runScore(run))}</b> pts` : `Out in round ${run.round}`}</p>
    <p class="muted">Best appraisal: <b class="gold">${fmt(best.total)}</b>${best.hand ? ` (${best.hand})` : ''} · seed <b>${run.seed}</b> · ${run.you.display.length} collectibles · ${deckSize(run.you)} cards</p>
    <div class="row" style="justify-content:center;margin-top:14px">
      <button id="again">Same seed again</button>
      <button class="ghost" id="menu">Main menu</button>
    </div>
    ${lbTable(`Leaderboard · ${run.seed} · ${DIFFICULTIES[run.difficulty].name}`, lb)}
  </div></div>`
  document.getElementById('again')!.onclick = () => {
    difficulty = run.difficulty
    startRun(run.seed)
  }
  document.getElementById('menu')!.onclick = () => renderTitle()
}

// collectible count sanity: the shop's no-repeat rule needs a pool bigger than one shop visit
if (COLLECTIBLES.length < 4) throw new Error('collectible pool too small for the shop')

renderTitle()
