// headless economy sim: plays N full solo duels (your policy vs the rival difficulty) on the real match engine and
// prints where runs end. usage: node sim/econ.ts --runs 1000 --seed sim --policy greedy|cautious|random --difficulty easy|medium|hard --starter classic
import { botAction } from '../src/engine/bot.ts'
import { ROUNDS } from '../src/engine/economy.ts'
import { STARTERS, type StarterId } from '../src/engine/starters.ts'
import { HAND_TYPES } from '../src/engine/hands.ts'
import { DIFFICULTIES, appraiseFor, lockedCards, newMatch, pairBlinds, pending, stepInPlace, type Difficulty, type Match } from '../src/engine/match.ts'
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
if (!['greedy', 'cautious', 'random'].includes(POLICY)) throw new Error(`unknown policy ${POLICY}, use greedy|cautious|random`)
if (!Number.isInteger(RUNS) || RUNS <= 0) throw new Error(`--runs must be a positive integer, got ${arg('runs', '')}`)

type RoundStat = { bankrolls: number[]; rivalBanks: number[]; youTotals: number[]; rivalTotals: number[]; rivalDealt: number[]; spend: number[]; outcomes: Record<string, number>; hands: Record<string, number> }
const stats: RoundStat[] = Array.from({ length: ROUNDS }, () => ({ bankrolls: [], rivalBanks: [], youTotals: [], rivalTotals: [], rivalDealt: [], spend: [], outcomes: {}, hands: {} }))
const ends = { youBust: new Array<number>(ROUNDS + 1).fill(0), rivalBust: new Array<number>(ROUNDS + 1).fill(0), chipLead: 0, chipLoss: 0, tie: 0 }
let mulls = 0
let forfeits = 0
let bulkMade = 0
let binned = 0
let sleeves = 0
let scoreSum = 0
const finalDeck: number[] = []
const rivalDeck: number[] = []

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

  while (m.phase !== 'over') {
    const s = pending(m)[0]
    const phase = m.phase
    const round = m.round
    if (phase === 'shop' && s === 0 && m.players[0].shop!.restocks === 0 && !m.players[0].shop!.offers.some(o => o.sold)) shopStart = m.players[0].bankroll
    const action = botAction(m, s)
    if (action.type === 'leaveShop' && s === 0) stats[round - 1].spend.push(shopStart - m.players[0].bankroll)
    if (action.type === 'mulligan' && s === 0) mulls++
    const { events } = stepInPlace(m, s, action)
    // the rival's estimate of every hand it locks, for REF_SCORE
    if (action.type === 'lock' && s === 1 && !isTournament(round)) {
      const p = m.players[1]
      stats[round - 1].rivalDealt.push(appraiseFor(m, p, lockedCards(p), false, null, pairBlinds(m, [0, 1]).ante).total)
    }
    for (const e of events) {
      if (e.event.kind === 'showdown' && e.to === 0 && !isTournament(round)) {
        stats[round - 1].youTotals.push(e.event.showdown.mine.total)
        stats[round - 1].rivalTotals.push(e.event.showdown.theirs.total)
      }
      if (e.event.kind === 'showdown' && e.to === 0) {
        const h = e.event.showdown.mine.hand
        stats[round - 1].hands[h] = (stats[round - 1].hands[h] ?? 0) + 1
      }
      if (e.event.kind === 'roundEnd' && e.to === 0) {
        const r = e.event.result
        const st = stats[r.round - 1]
        st.outcomes[r.outcome] = (st.outcomes[r.outcome] ?? 0) + 1
        bulkMade += r.bulk
        if (r.outcome === 'fold' && r.tally.pot === -pairBlinds(m, [0, 1]).ante && m.players[0].hand.length === 0 && r.ground === null) forfeits++
      }
    }
    // a round just settled: the bet (or forge pick) phase handed off to the next shop or the end
    const settled = (phase === 'bet' || phase === 'forgePick') && (m.phase as string) !== phase && (m.phase as string) !== 'forgePick'
    if (settled && round <= ROUNDS) {
      stats[round - 1].bankrolls.push(m.players[0].bankroll)
      stats[round - 1].rivalBanks.push(m.players[1].bankroll)
    }
  }
  const [you, rival] = m.players
  if (!you.alive) ends.youBust[you.bustRound!]++
  else if (!rival.alive) ends.rivalBust[rival.bustRound!]++
  else if (m.result!.winner === 0) ends.chipLead++
  else if (m.result!.winner === 1) ends.chipLoss++
  else ends.tie++
  scoreSum += m.result!.scores[0]
  binned += you.bulkBinned
  sleeves += you.sleeves.length
  finalDeck.push(deckSize(you))
  rivalDeck.push(deckSize(rival))
}
const ms = Date.now() - t0

console.log(`flambeur duel sim · ${RUNS} runs · you ${POLICY} · rival ${DIFFICULTY} · starter ${STARTER} · seed ${SEED} · ${ms}ms\n`)
console.log('rnd  alive%  bank p10/p50/p90   rival p50  spend  you p50  riv p50   win  loss  tie  fold forge  you✗  riv✗')
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
    `${String(median(st.youTotals)).padStart(7)}  ${String(median(st.rivalTotals)).padStart(7)}  ` +
    `${share('win')}% ${share('loss')}% ${share('tie')}% ${share('fold')}% ${share('forge')}%  ${String(ends.youBust[r]).padStart(4)}  ${String(ends.rivalBust[r]).padStart(4)}`,
  )
}
const busts = ends.rivalBust.reduce((s, x) => s + x, 0)
const wins = ends.chipLead + busts
console.log(`\nwin rate: ${((100 * wins) / RUNS).toFixed(1)}% (busted the rival: ${busts}, chip lead after ${ROUNDS}: ${ends.chipLead}, behind after ${ROUNDS}: ${ends.chipLoss}, tied: ${ends.tie}, you busted: ${ends.youBust.reduce((s, x) => s + x, 0)})`)
console.log(`mean score ${(scoreSum / RUNS).toFixed(1)}`)
const handTotals: Record<string, number> = {}
for (const st of stats) for (const [h, n] of Object.entries(st.hands)) handTotals[h] = (handTotals[h] ?? 0) + n
console.log(`your showdown hands: ${HAND_TYPES.filter(h => handTotals[h]).map(h => `${h} ${handTotals[h]}`).join(' · ')}`)
console.log(`per run: mulligans ${(mulls / RUNS).toFixed(2)} · rounds lost to an empty pile ${(forfeits / RUNS).toFixed(2)} · bulk made ${(bulkMade / RUNS).toFixed(2)} · bulk binned ${(binned / RUNS).toFixed(2)} · sleeves ${(sleeves / RUNS).toFixed(2)}`)
console.log(`final deck p10/p50/p90 you ${pct(finalDeck, 0.1)}/${median(finalDeck)}/${pct(finalDeck, 0.9)} · rival ${pct(rivalDeck, 0.1)}/${median(rivalDeck)}/${pct(rivalDeck, 0.9)}`)
// every hand the rival locked, not just the ones it took to showdown (those skew high, it folds the weak ones)
console.log(`REF_SCORE (rival p50 of every locked hand, normal rounds): [${stats.map(s => median(s.rivalDealt)).join(', ')}]`)
