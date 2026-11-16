// tournament rounds (3, 6, 9) are the boss blinds: nobody can fold or forge, and one rule twist applies to both players.
// the 3 twists for a run come from the seed, no repeats, and the next one is shown in the shop the round before
import { SUITS, type Suit } from './cards.ts'
import { TOURNAMENT_ROUNDS } from './economy.ts'
import { makeRng, pick, shuffled } from './rng.ts'

export type TwistId = 'sealed' | 'faceless' | 'banwave' | 'highstakes' | 'lowball' | 'doubledown' | 'hypefreeze' | 'colddeck'

export type Twist = { id: TwistId; suit: Suit | null } // suit = the banned suit for ban wave

export const TWISTS: readonly { id: TwistId; name: string; text: string }[] = [
  { id: 'sealed', name: 'Sealed Only', text: 'Collectibles don\'t trigger' },
  { id: 'faceless', name: 'Face Cards Don\'t Score', text: 'J, Q and K score no Value and trigger nothing' },
  { id: 'banwave', name: 'Ban Wave', text: '{S} cards score no Value and trigger nothing' },
  { id: 'highstakes', name: 'High Stakes', text: 'Min bet is the Max' },
  { id: 'lowball', name: 'Lowball', text: 'Lowest appraisal wins' },
  { id: 'doubledown', name: 'Double Down', text: 'The house matches the pot: the winner takes double' },
  { id: 'hypefreeze', name: 'Hype Freeze', text: 'Only the hand itself gives Hype' },
  { id: 'colddeck', name: 'Cold Deck', text: 'No mulligans' },
]

export function isTournament(round: number): boolean {
  return TOURNAMENT_ROUNDS.includes(round)
}

// one twist per tournament round, decided by the seed alone
export function rollTwists(seed: string): Twist[] {
  const rng = makeRng(`${seed}:twists`)
  return shuffled(rng, TWISTS.map(t => t.id))
    .slice(0, TOURNAMENT_ROUNDS.length)
    .map(id => ({ id, suit: id === 'banwave' ? pick(rng, SUITS) : null }))
}

export function twistName(t: Twist): string {
  const def = TWISTS.find(d => d.id === t.id)
  if (!def) throw new Error(`unknown twist ${t.id}`)
  return def.name
}

const SUIT_WORD: Record<Suit, string> = { H: 'Heart', D: 'Diamond', C: 'Club', S: 'Spade' }

export function twistText(t: Twist): string {
  const def = TWISTS.find(d => d.id === t.id)
  if (!def) throw new Error(`unknown twist ${t.id}`)
  return def.text.replace('{S}', t.suit ? SUIT_WORD[t.suit] : '[suit]')
}
