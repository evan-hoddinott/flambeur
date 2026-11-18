// headless economy sim: plays N full solo runs (your policy vs the rival difficulty) on the real match engine and
// prints where runs end. usage: node sim/econ.ts --runs 1000 --seed sim --policy greedy|cautious|random|nobuy --difficulty easy|medium|hard --starter classic
import { botAction } from '../src/engine/bot.ts'
import { ROUNDS, tableOf } from '../src/engine/economy.ts'
import { STARTERS, type StarterId } from '../src/engine/starters.ts'
import { HAND_TYPES } from '../src/engine/hands.ts'
import { DIFFICULTIES, newMatch, pending, stepInPlace, type Action, type Difficulty, type Match } from '../src/engine/match.ts'
import { deckSize } from '../src/engine/deck.ts'
import { isTournament } from '../src/engine/twists.ts'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const RUNS = Number(arg('runs', '1000'))
const SEED = arg('seed', 'sim')
const POLICY = arg('policy', 'greedy')
const STARTER = arg('starter', 'classic') as StarterId
const DIFFICULTY = arg('difficulty', 'medium') as Difficulty
if (!STARTERS.some(s => s.id === STARTER)) throw new Error(`unknown starter ${STARTER}, use ${STARTERS.map(s => s.id).join('|')}`)
if (!DIFFICULTIES[DIFFICULTY]) throw new Error(`unknown difficulty ${DIFFICULTY}, use easy|medium|hard`)
if (!['greedy', 'cautious', 'random', 'nobuy'].includes(POLICY)) throw new Error(`unknown policy ${POLICY}, use greedy|cautious|random|nobuy`)
if (!Number.isInteger(RUNS) || RUNS <= 0) throw new Error(`--runs must be a positive integer, got ${arg('runs', '')}`)

type RoundStat = { bankrolls: number[]; rivalBanks: number[]; youHands: number[]; rivalHands: number[]; spend: number[]; outcomes: Record<string, number>; hands: Record<string, number> }
const stats: RoundStat[] = Array.from({ length: ROUNDS }, () => ({ bankrolls: [], rivalBanks: [], youHands: [], rivalHands: [], spend: [], outcomes: {}, hands: {} }))
const ends = { won: 0, busted: new Array<number>(ROUNDS + 1).fill(0), missed: [0, 0, 0, 0, 0] }
let rivalBusts = 0
let scoreSum = 0
let rounds = 0 // rounds you played
let handsPlayed = 0
let kos = 0
let decisions = 0 // discards, locks, bets, inserts, spoils
let shopActions = 0
let allActions = 0
let flambes = 0
let inserts = 0
let reached12 = 0
let bulkMade = 0
let sleevesBought = 0
const finalDeck: number[] = []
const rivalDeck: number[] = []
const DECISIONS = new Set<Action['type']>(['discard', 'play', 'flamber', 'bet', 'useInsert', 'spoils'])

function median(xs: number[]): number {
  if (xs.length === 0) return NaN
  const s = xs.slice().sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
function pct(xs: number[], p: number): number {
  if (xs.length === 0) return NaN
  const s = xs.slice().sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}

const t0 = Date.now()
for (let i = 0; i < RUNS; i++) {
  const m: Match = newMatch({
    mode: 'solo', seed: `${SEED}-${i}`,
    seats: [{ kind: 'human', name: 'you', style: POLICY }, { kind: 'bot', name: 'rival', difficulty: DIFFICULTY }],
  })
  // the sim forces your starter box onto the offer so it can test one box at a time
  m.players[0].draft!.offer = [STARTER]
  let shopStart = 0
  let saw12 = false
  let missedAt = 0 // the table whose payment you couldn't make

  while (m.phase !== 'over') {
    const s = pending(m)[0]
    const phase = m.phase
    const round = m.round
    if (phase === 'shop' && s === 0 && m.players[0].shop!.restocks === 0 && !m.players[0].shop!.offers.some(o => o.sold)) shopStart = m.players[0].bankroll
    if (phase === 'deal' && round === ROUNDS) saw12 = true
    const action = botAction(m, s)
    if (s === 0) {
      allActions++
      if (phase === 'shop') shopActions++
      if (DECISIONS.has(action.type)) decisions++
      if (action.type === 'flamber') flambes++
      if (action.type === 'useInsert') inserts++
      if (action.type === 'leaveShop') stats[round - 1].spend.push(shopStart - m.players[0].bankroll)
    }
    const { events } = stepInPlace(m, s, action)
    for (const e of events) {
      const ev = e.event
      if (ev.kind === 'showdown' && e.to === 0) {
        handsPlayed++
        const st = stats[round - 1]
        if (ev.showdown.mine) {
          st.hands[ev.showdown.mine.hand] = (st.hands[ev.showdown.mine.hand] ?? 0) + 1
          if (!isTournament(round)) st.youHands.push(ev.showdown.mine.total)
        }
        // every hand the rival played on a normal round, for REF_SCORE
        if (ev.showdown.theirs && !isTournament(round)) st.rivalHands.push(ev.showdown.theirs.total)
      }
      if (ev.kind === 'roundEnd' && e.to === 0) {
        const r = ev.result
        const st = stats[r.round - 1]
        rounds++
        if (r.ko) kos++
        st.outcomes[r.outcome] = (st.outcomes[r.outcome] ?? 0) + 1
        bulkMade += r.bulk
        st.bankrolls.push(m.players[0].bankroll)
        st.rivalBanks.push(m.players[1].bankroll)
      }
      if (ev.kind === 'busted' && ev.seat === 1) rivalBusts++
      if (ev.kind === 'patron' && ev.seat === 0 && !ev.paid) missedAt = m.round > ROUNDS ? 4 : tableOf(m.round) - (m.phase === 'shop' ? 1 : 0)
    }
  }
  const you = m.players[0]
  if (you.alive) ends.won++
  else if (missedAt > 0) ends.missed[missedAt - 1]++
  else ends.busted[you.bustRound!]++
  if (saw12) reached12++
  scoreSum += m.result!.scores[0]
  sleevesBought += you.sleeves.length
  finalDeck.push(deckSize(you))
  rivalDeck.push(deckSize(m.players[1]))
}
const ms = Date.now() - t0

console.log(`flambeur sim · ${RUNS} runs · you ${POLICY} · rival ${DIFFICULTY} · starter ${STARTER} · seed ${SEED} · ${ms}ms\n`)
console.log('rnd  alive%  bank p10/p50/p90   rival p50  spend  you p50  riv p50   win  loss  tie')
for (let r = 1; r <= ROUNDS; r++) {
  const st = stats[r - 1]
  const n = st.bankrolls.length
  const o = st.outcomes
  const share = (k: string) => (n ? Math.round((100 * (o[k] ?? 0)) / n) : 0).toString().padStart(4)
  console.log(
    `${String(r).padStart(2)}${isTournament(r) ? 'T' : ' '}  ${((100 * n) / RUNS).toFixed(1).padStart(6)}  ` +
    `${[pct(st.bankrolls, 0.1), median(st.bankrolls), pct(st.bankrolls, 0.9)].map(x => String(x).padStart(4)).join(' /')}  ` +
    `${String(median(st.rivalBanks)).padStart(9)}  ` +
    `${(st.spend.reduce((s, x) => s + x, 0) / Math.max(1, st.spend.length)).toFixed(1).padStart(5)}  ` +
    `${String(median(st.youHands)).padStart(7)}  ${String(median(st.rivalHands)).padStart(7)}  ` +
    `${share('win')}% ${share('loss')}% ${share('tie')}%`,
  )
}
const busted = ends.busted.reduce((s, x) => s + x, 0)
const missed = ends.missed.reduce((s, x) => s + x, 0)
console.log(`\nwin rate: ${((100 * ends.won) / RUNS).toFixed(1)}% (paid le patron off: ${ends.won}, busted at the table: ${busted}, missed a payment: ${missed} [by table ${ends.missed.slice(0, 4).join(' / ')}])`)
console.log(`mean score ${(scoreSum / RUNS).toFixed(1)} · rivals busted ${(rivalBusts / RUNS).toFixed(2)} per run`)
console.log(`per round: decisions ${(decisions / rounds).toFixed(2)} · hands ${(handsPlayed / rounds).toFixed(2)} · ko ${((100 * kos) / rounds).toFixed(1)}% · flambés ${(flambes / rounds).toFixed(2)}`)
console.log(`runs reaching round 12: ${((100 * reached12) / RUNS).toFixed(1)}% · shop share of your actions ${((100 * shopActions) / allActions).toFixed(1)}% · inserts used ${(inserts / RUNS).toFixed(2)} per run`)
const handTotals: Record<string, number> = {}
for (const st of stats) for (const [h, n] of Object.entries(st.hands)) handTotals[h] = (handTotals[h] ?? 0) + n
console.log(`your played hands: ${HAND_TYPES.filter(h => handTotals[h]).map(h => `${h} ${handTotals[h]}`).join(' · ')}`)
console.log(`per run: bulk made ${(bulkMade / RUNS).toFixed(2)} · pochettes ${(sleevesBought / RUNS).toFixed(2)}`)
console.log(`final deck p10/p50/p90 you ${pct(finalDeck, 0.1)}/${median(finalDeck)}/${pct(finalDeck, 0.9)} · rival ${pct(rivalDeck, 0.1)}/${median(rivalDeck)}/${pct(rivalDeck, 0.9)}`)
// every hand the rival played, not just the ones that won
// boss rounds have twists, so they're left out and filled from their neighbours (the last one from the one before)
const ref = stats.map(s => median(s.rivalHands))
const filled = ref.map((x, i) => (Number.isNaN(x) ? Math.round(i + 1 < ref.length ? (ref[i - 1] + ref[i + 1]) / 2 : ref[i - 1] * 1.02) : x))
console.log(`REF_SCORE (rival p50 of every played hand, normal rounds, bosses filled in): [${filled.join(', ')}]`)
