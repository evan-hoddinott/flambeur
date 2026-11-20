// finds a seed for the first run (docs/ONBOARDING.md #2): Classic on offer, a Pair in the first hand,
// round 1 won by a knockout even played plainly, and a collectible you can afford in the first shop.
// node sim/firstseed.ts --tries 2000
import { botAction } from '../src/engine/bot.ts'
import { autoDraft } from '../src/engine/starters.ts'
import { newMatch, pending, stepInPlace, view, type Match } from '../src/engine/match.ts'
import { rankCounts } from '../src/engine/cards.ts'

const arg = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : d
}
const tries = Number(arg('tries', '2000'))

function hasPair(m: Match): boolean {
  const seen = new Map<number, number>()
  for (const c of m.players[0].hand) for (const [r] of rankCounts(c, false)) seen.set(r, (seen.get(r) ?? 0) + 1)
  return [...seen.values()].some(n => n >= 2)
}

// the same start as the game's first run: classic, rows auto-drafted, easy rival
function firstRunStart(seed: string): Match | null {
  const m = newMatch({ mode: 'solo', seed, seats: [{ kind: 'human', name: 'You', style: 'house' }, { kind: 'bot', name: 'Rival', difficulty: 'easy' }] })
  if (!m.players[0].draft!.offer.includes('classic')) return null
  stepInPlace(m, 0, { type: 'pickBox', box: 'classic' })
  stepInPlace(m, 0, { type: 'draft', rows: autoDraft(m.players[0].draft!.rows!) })
  return m
}

const found: string[] = []
for (let i = 1; i <= tries && found.length < 10; i++) {
  const seed = `PREMIERE-${i}`
  const m = firstRunStart(seed)
  if (!m || m.phase !== 'deal' || !hasPair(m)) continue
  const phase = () => m.phase // read fresh, ts narrows m.phase to 'deal' above
  while (m.round === 1 && phase() !== 'over') stepInPlace(m, pending(m)[0], botAction(m, pending(m)[0]))
  const r1 = view(m, 0).last
  if (!r1 || r1.outcome !== 'win' || !r1.ko) continue
  while (phase() !== 'shop' && phase() !== 'over') stepInPlace(m, pending(m)[0], botAction(m, pending(m)[0]))
  const me = view(m, 0).me
  const offers = me.shop?.offers ?? []
  const buy = offers.filter(o => o && o.type === 'collectible' && o.price <= me.bankroll)
  if (!buy.length) continue
  found.push(seed)
  console.log(seed, `bank $${me.bankroll}`, 'buys:', buy.map(o => o!.type === 'collectible' ? `${o!.owned.id} $${o!.price}` : '').join(', '))
}
if (!found.length) throw new Error(`no seed in ${tries} tries`)
