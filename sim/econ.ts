// headless economy sim: plays N full solo duels (your policy vs the rival difficulty) and prints where runs end.
// usage: node sim/econ.ts --runs 1000 --seed sim --policy greedy|cautious|random --difficulty easy|medium|hard --starter classic
import { act, firstToAct, forfeit, legalActions, startBetting } from '../src/engine/betting.ts'
import { botAct, botDeal, botShop, getStyle } from '../src/engine/bot.ts'
import { ROUNDS } from '../src/engine/economy.ts'
import { STARTERS, autoDraft, draftRows, type StarterId } from '../src/engine/starters.ts'
import { HAND_TYPES } from '../src/engine/hands.ts'
import { DIFFICULTIES, appraiseFor, canForge, finishRound, newRun, nextRound, showdownWinner, tableBlinds, twistFor, type Difficulty } from '../src/engine/run.ts'
import { deckSize } from '../src/engine/deck.ts'
import { isTournament } from '../src/engine/twists.ts'
import type { Seat } from '../src/engine/betting.ts'

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
const you = getStyle(POLICY)
const rivalStyle = getStyle(DIFFICULTIES[DIFFICULTY].style)

type RoundStat = { bankrolls: number[]; rivalBanks: number[]; youTotals: number[]; rivalTotals: number[]; rivalDealt: number[]; spend: number[]; actions: Record<string, number>; hands: Record<string, number> }
const stats: RoundStat[] = Array.from({ length: ROUNDS }, () => ({ bankrolls: [], rivalBanks: [], youTotals: [], rivalTotals: [], rivalDealt: [], spend: [], actions: {}, hands: {} }))
const ends = { youBust: new Array<number>(ROUNDS + 1).fill(0), rivalBust: new Array<number>(ROUNDS + 1).fill(0), survived: 0 }
let mulls = 0
let forfeits = 0 // rounds you lost because the pile couldn't deal you a card
let bulkMade = 0
let binned = 0
let sleeves = 0
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
  const seed = `${SEED}-${i}`
  const run = newRun(seed, STARTER, autoDraft(draftRows(seed, STARTER)), DIFFICULTY)

  while (!run.over) {
    const r = run.round
    const st = stats[r - 1]
    st.spend.push(botShop(run, 0, you))
    botShop(run, 1, rivalStyle)

    const y = botDeal(run, 0)
    const o = botDeal(run, 1)
    mulls += y.mulls
    if (o.est && !isTournament(r)) st.rivalDealt.push(o.est.total)

    const { ante, max } = tableBlinds(run)
    const forgeable: [boolean, boolean] = [canForge(y.played), canForge(o.played)]
    let b = startBetting(firstToAct([run.you.bankroll, run.rival.bankroll], r), ante, max, [run.you.bankroll, run.rival.bankroll], forgeable, isTournament(r))
    if (!y.est || !o.est) {
      if (!y.est) forfeits++
      b = forfeit(b, !y.est && !o.est ? null : !y.est ? 0 : 1)
    }
    while (!b.outcome) {
      const seat = b.toAct
      b = act(b, botAct(b, legalActions(b), (seat === 0 ? y : o).est!.total, run, seat === 0 ? you : rivalStyle, run.rng))
    }

    let winner: Seat | null = null
    let scoring: [number[], number[]] = [[], []]
    if (b.outcome.kind === 'showdown' && y.played.length && o.played.length) {
      const betMax = (s: Seat) => b.maxStake > b.minStake && b.committed[s] === b.maxStake
      const ya = appraiseFor(run, run.you, y.played, betMax(0), run.rng)
      const oa = appraiseFor(run, run.rival, o.played, betMax(1), run.rng)
      winner = showdownWinner(run, ya.total, oa.total)
      scoring = [ya.scoringIds, oa.scoringIds]
      if (!twistFor(run)) {
        st.youTotals.push(ya.total)
        st.rivalTotals.push(oa.total)
      }
      st.hands[ya.hand] = (st.hands[ya.hand] ?? 0) + 1
    }
    const [res] = finishRound(run, b, winner, [y.played, o.played], scoring)
    bulkMade += res.bulk.length
    st.actions[res.outcome] = (st.actions[res.outcome] ?? 0) + 1
    st.bankrolls.push(run.you.bankroll)
    st.rivalBanks.push(run.rival.bankroll)
    if (run.over) {
      if (run.you.bankroll === 0) ends.youBust[r]++
      else if (run.rival.bankroll === 0) ends.rivalBust[r]++
      else ends.survived++
    } else nextRound(run)
  }
  binned += run.you.bulkBinned
  sleeves += run.you.sleeves.length
  finalDeck.push(deckSize(run.you))
  rivalDeck.push(deckSize(run.rival))
}
const ms = Date.now() - t0

console.log(`flambeur duel sim · ${RUNS} runs · you ${POLICY} · rival ${DIFFICULTY} · starter ${STARTER} · seed ${SEED} · ${ms}ms\n`)
console.log('rnd  alive%  bank p10/p50/p90   rival p50  spend  you p50  riv p50   win  loss  tie  fold forge  you✗  riv✗')
for (let r = 1; r <= ROUNDS; r++) {
  const st = stats[r - 1]
  const n = st.bankrolls.length
  const a = st.actions
  const share = (k: string) => (n ? Math.round((100 * (a[k] ?? 0)) / n) : 0).toString().padStart(4)
  console.log(
    `${String(r).padStart(2)}${isTournament(r) ? 'T' : ' '}  ${((100 * n) / RUNS).toFixed(1).padStart(6)}  ` +
    `${[pct(st.bankrolls, 0.1), median(st.bankrolls), pct(st.bankrolls, 0.9)].map(x => String(x).padStart(4)).join(' /')}  ` +
    `${String(median(st.rivalBanks)).padStart(9)}  ` +
    `${(st.spend.reduce((s, x) => s + x, 0) / Math.max(1, st.spend.length)).toFixed(1).padStart(5)}  ` +
    `${String(median(st.youTotals)).padStart(7)}  ${String(median(st.rivalTotals)).padStart(7)}  ` +
    `${share('win')}% ${share('loss')}% ${share('tie')}% ${share('fold')}% ${share('forge')}%  ${String(ends.youBust[r]).padStart(4)}  ${String(ends.rivalBust[r]).padStart(4)}`,
  )
}
const wins = ends.survived + ends.rivalBust.reduce((s, x) => s + x, 0)
console.log(`\nwin rate: ${((100 * wins) / RUNS).toFixed(1)}% (survived 9: ${ends.survived}, busted the rival: ${wins - ends.survived}, you busted: ${RUNS - wins})`)
const handTotals: Record<string, number> = {}
for (const st of stats) for (const [h, n] of Object.entries(st.hands)) handTotals[h] = (handTotals[h] ?? 0) + n
console.log(`your showdown hands: ${HAND_TYPES.filter(h => handTotals[h]).map(h => `${h} ${handTotals[h]}`).join(' · ')}`)
console.log(`per run: mulligans ${(mulls / RUNS).toFixed(2)} · rounds lost to an empty pile ${(forfeits / RUNS).toFixed(2)} · bulk made ${(bulkMade / RUNS).toFixed(2)} · bulk binned ${(binned / RUNS).toFixed(2)} · sleeves ${(sleeves / RUNS).toFixed(2)}`)
console.log(`final deck p10/p50/p90 you ${pct(finalDeck, 0.1)}/${median(finalDeck)}/${pct(finalDeck, 0.9)} · rival ${pct(rivalDeck, 0.1)}/${median(rivalDeck)}/${pct(rivalDeck, 0.9)}`)
// every hand the rival was dealt, not just the ones it took to showdown (those skew high, it folds the weak ones)
console.log(`REF_SCORE (rival p50 of every dealt hand, normal rounds): [${stats.map(s => median(s.rivalDealt)).join(', ')}]`)
