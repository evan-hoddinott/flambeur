// the rules text map: every rules thing in the game, as one Fiche entry. pure data, no DOM. the UI never hard-codes a
// rule string, it asks entry() or cardEntry(). text reads from the engine's own tables and constants so it can't drift.
// markup (docs/UX.md §6): {v}Value{/} {h}Hype{/} {x}×Hype{/} {g}Grade{/} {$}+$3{/} {-}−$3{/}, [Keyword] links to KEYWORDS
import {
  BULK_VALUE, JOKERS, MAX_JOKERS, MAX_TIER, SUIT_GLYPH, VARIANTS, cardValue, knockoffName, rankLabel, rankPlural, sellPrice,
  traitLabel, traitName, type Card, type Finish, type JokerId, type Knockoff, type Stamp, type Suit, type Trait, type Variant,
} from './cards.ts'
import { COLLECTIBLES, describe, getDef, type Owned } from './collectibles.ts'
import {
  BULK_BIN_PRICE, COLLECTIBLE_PRICE, DISCARDS, DISPLAY_SLOTS, GOLD_BORDER, HAND_SIZE, HANDS_PER_ROUND, HOUSE_BONUS, HOUSE_FLAT,
  KNOCKOUT, KO_BONUS, MARKER, MOMENTUM_MAX, PACK_PRICE, PLAY_SIZE, POCHETTE_PRICE, RIVAL_STACKS, SCRATCHER_PRICE, SHIPPERS,
  SKIP_BONUS, SLEEVE_SLOTS, SPOILS_CARDS, SPOILS_SKIP, STONKS_MULT, TEAR_CHANCE, WINS_NEEDED, knockoutAt, type Shipper,
} from './economy.ts'
import { HAND_BASE, HAND_NAMES, HAND_TYPES, type HandType } from './hands.ts'
import { DIFFICULTIES, type Difficulty } from './match.ts'
import { RIVALS, getRival, type RivalDef, type RivalId } from './rivals.ts'
import {
  BEER_HYPE, FOIL_VALUE, HOLO_HYPE, JUMBO_TIMES, LEVEL_HYPE, LEVEL_VALUE, MISPRINT_MAX, TIER_HYPE, gradeBonus,
} from './scoring.ts'
import { INSERTS, KEEPER, getKeeper, type Insert, type InsertWhen, type KeeperId, type PackKind, type SleeveCard } from './shop.ts'
import { SLEEVES, getSleeve, type SleeveId, type Stonks } from './sleeves.ts'
import { STARTERS } from './starters.ts'
import { TWISTS, twistText, type Twist } from './twists.ts'

export type Kind = 'card' | 'finish' | 'stamp' | 'knockoff' | 'trait' | 'tier' | 'variant' | 'joker' | 'bulk'
  | 'collectible' | 'insert' | 'pochette' | 'twist' | 'rival' | 'keeper' | 'hud' | 'keyword' | 'hand'

export type Entry = { name: string; kind: Kind; tag?: string; text: string[]; flavor?: string; foot?: string }

// ---------- markup ----------

const v = (s: string | number) => `{v}${s}{/}`
const h = (s: string | number) => `{h}${s}{/}`
const x = (s: string | number) => `{x}${s}{/}`
const g = (s: string | number) => `{g}${s}{/}`
const won = (n: number) => `{$}+$${n}{/}`
const lost = (n: number) => `{-}−$${n}{/}`

// marks up the stats in a plain rule string from an engine table ("+8 Hype" → {h}+8 Hype{/}). money stays plain:
// a +$1 can be a cost (grumpy) or a gain (price sticker), so lines that pay say it with won()/lost() by hand
function mark(s: string): string {
  return s
    .replace(/(×[\d.]+ Hype)/g, '{x}$1{/}')
    .replace(/([+−-]\d+ Value)/g, '{v}$1{/}')
    .replace(/([+−-]\d+ Hype)/g, '{h}$1{/}')
    .replace(/([+−-]\d+ Grade)/g, '{g}$1{/}')
}

// "Twin: counts as…" inside a card's lines
function lc(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s
}

const slash = (xs: readonly (string | number)[]) => xs.join(' / ')

// ---------- keywords ----------

// term -> one line. feeds the Fiche sub-boxes and the carnet glossary. [Term] in any text links here
export const KEYWORDS: Record<string, string> = {
  Value: 'The first number of an Appraisal: card values plus the hand base and bonuses',
  Hype: 'The second number: it multiplies Value. ×Hype effects multiply the Hype built up so far',
  Grade: 'Each +1 Grade doubles the Appraisal',
  Appraisal: 'Value × Hype × 2^Grade. The higher one takes the hand',
  Finish: 'Foil, Holo, Prism or Misprint. A card has at most one',
  Stamp: '1st Edition, Signed, Gold Border or Damaged. Shares its slot with a Knockoff',
  Knockoff: 'An Off-Brand flaw in the stamp slot: Crayon, Marked, Wrong Suit or Beer-stained',
  Trait: 'What a ★ card does, from the hand it was flambéed out of. A card holds as many as its ★',
  '★': 'Flambé tier, ★1 to ★3. Each ★ holds one Trait',
  Flamber: 'Throw a hand: a Pair or better merges its cards into one ★ card, otherwise one card gets +1 Value',
  Ash: `The burnt card a flambé leaves behind: +${BULK_VALUE} Value when played, never part of a hand`,
  'Bonus hand': 'A second hand type stacked on top, only when a ★ trait made it happen',
  Joker: `A real playing card with a rule on top. Max ${MAX_JOKERS} in a deck`,
  'K.O.': 'Win a hand by K× or more and the round ends right there',
  Min: 'The ante, the smallest bet. Everyone pays it into the pot',
  Max: 'Bet more on yourself: win the round and the House pays it, lose and your rival takes it',
  Ante: "The round's Min bet. It goes up every round",
  Pot: "Both antes. The round's winner takes it",
  House: `Pays +$${HOUSE_FLAT} to both seats every round, and the winner ${HOUSE_BONUS}× ante`,
  Spoils: `${SPOILS_CARDS} cards on the table after a round. Loser picks first`,
  'Le Patron': "The man you owe. He collects at the door of each big shop. Can't pay, you're out",
  STONKS: 'The hot rank, suit or finish this shop: matching binder cards sell for more',
  Binder: 'Cards you keep but never draw. The only place you can sell from',
  Deck: 'Every card you draw from: your pile, your hand and this round\'s discards',
  Sleeve: `Holds ${SLEEVE_SLOTS} inserts to use later`,
  Insert: 'A one-shot card from a scratcher, kept in the Sleeve',
  Pochette: 'A run-wide upgrade from the big shop',
  Collectible: 'Sits in your display case and triggers when you score, left to right',
  Lane: 'A build: cheap collectibles add to it, one rare payoff multiplies it',
  Payoff: 'A rare collectible that multiplies Hype for its lane',
  Twist: 'A boss round rule for both players, on all three hands',
  Freshness: 'Grading bonus for new pulls: +3 this round, +2 last round, +1 two rounds ago',
  Discard: 'Toss 1–5 cards and draw that many',
}

// ---------- cards ----------

const FINISH_TEXT: Record<Finish, { name: string; text: string[] }> = {
  foil: { name: 'Foil', text: [`${v(`+${FOIL_VALUE} Value`)} when it scores`] },
  holo: { name: 'Holo', text: [`${h(`+${HOLO_HYPE} Hype`)} when it scores`] },
  prism: { name: 'Prism', text: [`${g('+1 Grade')} when it scores`] },
  misprint: { name: 'Misprint', text: [`${h(`+0 to +${MISPRINT_MAX} Hype`)}, rolled each time it scores`] },
}

const STAMP_TEXT: Record<Stamp, { name: string; text: string[] }> = {
  first: { name: '1st Edition', text: [`${h('+1 Hype')} when it scores, and +1 more for good every time it does`] },
  signed: { name: 'Signed', text: ['Scores twice (3 times with Bis !)'] },
  gold: { name: 'Gold Border', text: [`Side bet, once per round: played in any hand, ${won(GOLD_BORDER)} if you win the round, ${lost(GOLD_BORDER)} if you lose`] },
  damaged: { name: 'Damaged', text: [`${g('+1 Grade')} when it scores`, `1 in ${Math.round(1 / TEAR_CHANCE)} to tear for good when it scores`] },
}

function knockoffText(k: Knockoff): string[] {
  if (k.kind === 'crayon') return [`Counts as any rank, ${v('0 Value')}`]
  if (k.kind === 'marked') return [`${g('+1 Grade')} when it scores`, 'Once locked, the rival sees it face up']
  if (k.kind === 'wrongsuit') return [`Also counts as ${SUIT_GLYPH[k.suit]} for a Flush`]
  return [`${h(`+${BEER_HYPE} Hype`)} when it scores`, 'Stuck to another card: drawn, tossed and played together']
}

// the hand each trait comes from, for the tag
const TRAIT_FROM: Record<string, HandType> = {
  twin: 'pair', triplet: 'trips', quad: 'quads', split: 'twopair', household: 'fullhouse', bridge: 'straight', wild: 'flush', crown: 'royalflush',
}

function traitId(t: Trait): string {
  if (t.kind === 'multi') return { 2: 'twin', 3: 'triplet', 4: 'quad' }[t.count]
  return t.kind
}

// rank = the card the trait sits on (household needs it)
function traitText(t: Trait, rank: number | null): string[] {
  if (t.kind === 'multi') return [`Counts as ${t.count} of its rank in any hand`]
  if (t.kind === 'split') return [`Also counts as a ${rankLabel(t.rank)}`]
  if (t.kind === 'household') {
    if (rank === null) return ['A Full House by itself: 3 of its rank and 2 of a second rank']
    return [`A Full House by itself: 3 ${rankPlural(rank)} and 2 ${rankPlural(t.pairRank)}`]
  }
  if (t.kind === 'bridge') return ['Counts as any rank inside a Straight']
  if (t.kind === 'wild') return ['Counts as every suit']
  return ['Any rank inside a Straight, every suit', `${g('+1 Grade')} when it scores, for good`]
}

// a trait that isn't on a card yet (the forge pick), on a card of this rank
export function traitEntry(t: Trait, rank: number): Entry {
  const id = traitId(t)
  return { name: traitName(t), kind: 'trait', tag: `from a ${HAND_NAMES[TRAIT_FROM[id]]}`, text: traitText(t, rank) }
}

// a stand-in trait for each id, for entries with no card to read from
const TRAIT_SAMPLE: Record<string, Trait> = {
  twin: { kind: 'multi', count: 2 }, triplet: { kind: 'multi', count: 3 }, quad: { kind: 'multi', count: 4 },
  split: { kind: 'split', rank: 2 }, household: { kind: 'household', pairRank: 2 },
  bridge: { kind: 'bridge' }, wild: { kind: 'wild' }, crown: { kind: 'crown' },
}

function tierText(tier: number): string[] {
  const holds = `Holds ${tier} trait${tier > 1 ? 's' : ''}`
  if (tier === 1) return [`Flambéed once. ${holds}`]
  if (tier === 2) return [`${h(`+${TIER_HYPE[2]} Hype`)} when it scores. ${holds}`]
  return [`${h(`+${TIER_HYPE[3]} Hype`)} and ${g('+1 Grade')} when it scores. ${holds}`]
}

function variantText(id: Variant): string[] {
  if (id === 'jumbo') return [`Scores its Value ${JUMBO_TIMES}×, takes 2 of your ${PLAY_SIZE} play slots`]
  return [mark(VARIANTS[id].text)]
}

function gradeLine(grade: number): string {
  const b = gradeBonus(grade)
  if (grade <= 3) return `Grade ${grade}, damaged in shipping: ${h(`${b.hype < 0 ? '−' : '+'}${Math.abs(b.hype)} Hype`)}`
  if (b.grade > 0) return `Gem Mint 10: ${g(`+${b.grade} Grade`)}`
  return `Grade ${grade}: ${h(`+${b.hype} Hype`)}`
}

const FRENCH_RANK: Record<number, string> = { 11: 'Valet', 12: 'Dame', 13: 'Roi', 14: 'As' }

const BULK: Entry = {
  name: 'Ash', kind: 'bulk',
  text: [
    `${v(`+${BULK_VALUE} Value`)} when played, but never part of a poker hand`,
    'Every card a flambé eats beyond the first leaves one',
    `No rank or suit. Can't be flambéed or sold. The Ashtray takes it for $${BULK_BIN_PRICE}+`,
  ],
}

// one line per modifier slot, base value first
export function cardEntry(card: Card): Entry {
  if (card.bulk) return { ...BULK, kind: 'card' }
  const text: string[] = []
  const crayon = card.knockoff?.kind === 'crayon'
  if (!crayon) text.push(`Worth ${v(`${cardValue(card) - card.grind} Value`)}`)
  if (card.tier > 0) text.push(`${'★'.repeat(card.tier)} ${tierText(card.tier)[0]}`)
  for (const t of card.traits) text.push(`${traitLabel(card, t)}: ${lc(traitText(t, card.rank)[0])}`)
  if (card.finish) text.push(`${FINISH_TEXT[card.finish].name}: ${FINISH_TEXT[card.finish].text[0]}`)
  if (card.stamp) {
    const s = STAMP_TEXT[card.stamp]
    if (card.stamp === 'first') text.push(`1st Edition: ${h(`+${1 + card.bonusHype} Hype`)} when it scores, +1 more for good every time`)
    else text.push(`${s.name}: ${lc(s.text.join('. '))}`)
  }
  if (card.knockoff) text.push(`${knockoffName(card.knockoff)}: ${lc(knockoffText(card.knockoff).join('. '))}`)
  if (card.variant) text.push(`${VARIANTS[card.variant].name}: ${lc(variantText(card.variant)[0])}`)
  if (card.joker) text.push(`${JOKERS[card.joker].name}: ${lc(mark(JOKERS[card.joker].text))}`)
  if (card.grade !== null) text.push(gradeLine(card.grade))
  if (card.grind > 0) text.push(`${v(`+${card.grind} Value`)} earned for good`)
  const rank = FRENCH_RANK[card.rank] ?? String(card.rank)
  return {
    name: `${rank} ${SUIT_GLYPH[card.suit]}${card.tier > 0 ? ` ${'★'.repeat(card.tier)}` : ''}`,
    kind: 'card',
    tag: card.tier > 0 ? '★'.repeat(card.tier) : undefined,
    text,
    foot: `sells $${sellPrice(card)} from the binder`,
  }
}

// ---------- hands ----------

const HAND_WHAT: Record<HandType, string> = {
  high: 'No pair or better: only your highest card scores',
  pair: 'Two cards of the same rank',
  twopair: 'Two different pairs',
  trips: 'Three cards of the same rank',
  straight: 'Five ranks in a row, like 5 6 7 8 9. An A can be low',
  flush: 'Five cards of the same suit',
  fullhouse: 'Three of a kind plus a pair',
  quads: 'Four cards of the same rank',
  straightflush: 'A Straight, all one suit',
  royalflush: '10 J Q K A, all one suit',
}

// a sample of each hand for the rules paper: [rank, suit]
export const HAND_EXAMPLE: Record<HandType, [number, Suit][]> = {
  high: [[14, 'S'], [9, 'H'], [6, 'D'], [4, 'C'], [2, 'S']],
  pair: [[12, 'H'], [12, 'S']],
  twopair: [[9, 'C'], [9, 'D'], [4, 'H'], [4, 'S']],
  trips: [[7, 'S'], [7, 'H'], [7, 'D']],
  straight: [[5, 'C'], [6, 'H'], [7, 'S'], [8, 'D'], [9, 'H']],
  flush: [[2, 'H'], [6, 'H'], [9, 'H'], [11, 'H'], [13, 'H']],
  fullhouse: [[10, 'S'], [10, 'H'], [10, 'C'], [3, 'D'], [3, 'S']],
  quads: [[13, 'S'], [13, 'H'], [13, 'D'], [13, 'C']],
  straightflush: [[5, 'S'], [6, 'S'], [7, 'S'], [8, 'S'], [9, 'S']],
  royalflush: [[10, 'D'], [11, 'D'], [12, 'D'], [13, 'D'], [14, 'D']],
}

// ctx = the hand's level (0 = base), as in Player.levels
function handEntry(id: HandType, level: unknown): Entry {
  const base = HAND_BASE[id]
  const text = [HAND_WHAT[id], `Base ${v(`${base.value} Value`)} × ${h(`${base.hype} Hype`)}`]
  if (typeof level === 'number' && level > 0) {
    text.push(`Level ${level + 1}: ${v(`+${LEVEL_VALUE * level} Value`)}, ${h(`+${LEVEL_HYPE * level} Hype`)}`)
  }
  return { name: HAND_NAMES[id], kind: 'hand', tag: typeof level === 'number' ? `lv${level + 1}` : undefined, text }
}

// ---------- rivals ----------

const BETS: Record<NonNullable<RivalDef['bets']> | 'steady', string> = {
  nervous: 'Nervous: bets Min unless its hand is strong, never bluffs',
  reckless: 'Reckless: bets Max a lot, often on nothing',
  steady: 'Bets Max when its hand is strong, sometimes bluffs',
}

function caseName(item: RivalDef['case'][number]): string {
  if ('code' in item) return `Code: ${HAND_NAMES[item.code]}`
  return getDef(item.id).name
}

// ctx = the table it sits at (1–4), for its stack
function rivalEntry(def: RivalDef, table: unknown): Entry {
  const stack = typeof table === 'number' ? `$${RIVAL_STACKS[Math.min(table, RIVAL_STACKS.length) - 1]}` : slash(RIVAL_STACKS.map(s => `$${s}`)) + ' by Table'
  return {
    name: def.name, kind: 'rival', tag: def.lane,
    text: [
      `[Lane]: ${def.lane}. Its deck leans toward ${def.leans}`,
      BETS[def.bets ?? 'steady'],
      `Case by Table 2 → 3 → 4: ${def.case.map(caseName).join(' → ')}`,
      `Sits down with ${stack}`,
      `Bust it and the Table ends: each round skipped pays ${SKIP_BONUS}× its ante`,
    ],
  }
}

// ---------- HUD and table things ----------

function stonksLine(s: Stonks, hotMarket: boolean): string {
  const what = s.kind === 'rank' ? rankPlural(s.rank) : s.kind === 'suit' ? `${SUIT_GLYPH[s.suit]} cards` : `${FINISH_TEXT[s.finish].name} cards`
  return `${what} sell ×${STONKS_MULT[s.kind] + (hotMarket ? 1 : 0)} from your binder`
}

const WHEN: Record<InsertWhen, string> = { anytime: 'Anytime', hand: 'In hand', shop: 'In the shop', spot: 'On the spot' }

const PACKS: Record<PackKind, { name: string; text: string }> = {
  offbrand: { name: 'Faux Frère', text: '5 cards: stamps and knockoffs. Off-Brand' },
  repack: { name: 'Le Roussi', text: '4 cards: flambéed cards, Jumbos, Rookies, Jokers. Repack' },
  collector: { name: 'Sélène', text: '3 cards, a Code and a rare slot. Collector' },
}

type HudDef = { name: string; text: (ctx: unknown) => string[]; tag?: string }

const num = (ctx: unknown): number | null => (typeof ctx === 'number' ? ctx : null)

const HUD: Record<string, HudDef> = {
  ko: {
    name: 'K.O.',
    text: ctx => [
      `Win a hand by ${num(ctx) !== null ? `${knockoutAt(num(ctx)!)}× ` : 'K× '}or more and the round ends there, a win`,
      `K by Table: ${slash(KNOCKOUT.map(k => `${k}×`))}. A knockout pays +${KO_BONUS}× ante more`,
      "A thrown hand can't be knocked out",
    ],
  },
  marker: {
    name: "Le Patron's marker",
    text: ctx => [
      "You owe [Le Patron]. Pay at the door of the next big shop, or you're out",
      num(ctx) !== null ? `Next payment: $${num(ctx)}` : `${slash(MARKER.map(m => `$${m}`))} after Tables 1–3 and round 12`,
      'Paying down to $0 counts as a miss',
    ],
  },
  stonks: {
    name: 'STONKS',
    text: ctx => {
      const s = ctx as { stonks: Stonks; hotMarket?: boolean } | undefined
      if (s?.stonks) return [stonksLine(s.stonks, !!s.hotMarket), 'A new hot pick every shop']
      return [`Each shop, one hot rank, suit or finish. Matching [Binder] cards sell ×${STONKS_MULT.rank} (finish ×${STONKS_MULT.finish})`]
    },
  },
  'plate-hand': { name: 'Hand', text: () => [`Best of ${HANDS_PER_ROUND}: win ${WINS_NEEDED} hands to take the round`] },
  'plate-discards': { name: 'Discards', text: () => [`[Discard] left this round: toss 1–5 cards, draw that many`, `${DISCARDS} a round (Classic ${DISCARDS + 1})`] },
  'plate-sleeve': { name: 'The Sleeve', text: () => [`Holds ${SLEEVE_SLOTS} [Insert] cards to use later. The rival sees how many, not which`] },
  difficulty: {
    name: 'Difficulty',
    text: ctx => {
      if (typeof ctx === 'string' && ctx in DIFFICULTIES) {
        const d = DIFFICULTIES[ctx as Difficulty]
        return [d.text, `Score ×${d.scoreMult}`]
      }
      return ['Only changes the rivals: how sharp they bet and how far along their build is', `Score ${slash((Object.keys(DIFFICULTIES) as Difficulty[]).map(d => `${DIFFICULTIES[d].name} ×${DIFFICULTIES[d].scoreMult}`))}`]
    },
  },
  lane: {
    name: 'Lane',
    text: ctx => {
      if (typeof ctx === 'string' && RIVALS.some(r => r.id === ctx)) {
        const r = getRival(ctx as RivalId)
        return [`${r.lane}: its deck leans toward ${r.leans}`]
      }
      return ["The rival's build: what its deck and case lean toward"]
    },
  },
  'hand-pips': { name: 'Hands won', text: () => [`Hands won this round. ${WINS_NEEDED} takes it`] },
  momentum: { name: 'Momentum', text: () => [`At the boss: +1× ante for each round you won earlier this Table, max +${MOMENTUM_MAX}`] },
  'gold-border': { name: 'Gold Border', text: () => STAMP_TEXT.gold.text },
  freshness: { name: 'Freshness', text: () => ['Added to the grading roll: +3 pulled this round, +2 last round, +1 two rounds ago'] },
  spoils: {
    name: 'Spoils',
    text: () => [
      `After every round but the last, ${SPOILS_CARDS} cards go on the table`,
      'The loser picks first, then the winner. The last card burns',
      `Skip your pick for ${won(SPOILS_SKIP)}`,
    ],
  },
  house: { name: 'House', text: () => [`${won(HOUSE_FLAT)} to both seats every round. The winner also gets ${HOUSE_BONUS}× ante`] },
  interest: { name: 'Interest', text: () => ['+$1 per $10 you hold, max +$2 (Deep Pockets +$4)'] },
  bankroll: { name: 'Bankroll', text: () => ["Your money is your life: at $0 you're out", 'You always keep $1 to sit at the table'] },
  pile: { name: 'Deck', text: () => ['Cards left to draw / cards in your deck', 'The whole deck shuffles every round'] },
  'discard-pile': { name: 'Discard pile', text: () => ['Cards played or tossed this round. They shuffle back in next round'] },
  'plate-cards': { name: 'Cards in hand', text: () => ['After each hand you refill to your hand size from the pile', 'Your rival sees how many you hold, never which'] },
  'rival-discards': { name: 'Discards used', text: () => ['How many times the rival has discarded this round'] },
  first: { name: 'Bets first', text: () => ['The richer seat bets first, so the other sees its bet', 'Tied: it alternates each round'] },
  level: {
    name: 'Hand level',
    text: ctx => {
      const n = num(ctx)
      if (n !== null && n > 0) return [`Level ${n + 1}: ${v(`+${LEVEL_VALUE * n} Value`)}, ${h(`+${LEVEL_HYPE * n} Hype`)}`]
      return [`Each level: ${v(`+${LEVEL_VALUE} Value`)}, ${h(`+${LEVEL_HYPE} Hype`)}. Raised by Code inserts`]
    },
  },
  // how a hand works (the rules paper)
  rules: { name: 'Rules', text: () => ['The rules paper: how a round, the bets and the scoring work', 'Click to open, Esc to close'] },
  round: { name: 'A round', text: () => [`Best of ${HANDS_PER_ROUND} hands against one rival. Deal ${HAND_SIZE}, lock 1–${PLAY_SIZE}`] },
  play: { name: 'Play', text: () => ['Lock these cards as your hand. Only the cards that make the poker hand score'] },
  flamber: { name: 'Flamber', text: () => ['Throw this hand. A Pair or better merges into a [★] card, otherwise one card you pick gets +1 Value'] },
  discard: { name: 'Discard', text: () => [`Toss 1–5 cards and draw that many. ${DISCARDS} a round`] },
  min: { name: 'Min', text: () => ['Stay on the ante. Both antes are the [Pot]'] },
  max: { name: 'Max', text: () => ['Bet more on yourself. Win the round and the House pays it, lose and your rival takes it'] },
  push: { name: 'Last push', text: () => ['After locking hand 3, anyone still on Min may go Max'] },
  appraisal: { name: 'Appraisal', text: () => [`${v('Value')} × ${h('Hype')} × 2^${g('Grade')}. The higher one takes the hand`] },
  vitrine: { name: 'Vitrine', text: () => [`Your display case: ${DISPLAY_SLOTS} [Collectible] slots. They trigger left to right`, 'Sell one to make room, for half what it costs today'] },
  binder: { name: 'Classeur', text: () => ['Your [Binder]. Never drawn. Sell from here. Only a Wishlist moves a card back'] },
  // the shop
  restock: { name: 'Restock', text: () => ['Rerolls the packs, collectibles and scratchers. $1, $2, $3… each shop. Never the pochette'] },
  scratcher: { name: 'Scratcher', text: () => [`$${SCRATCHER_PRICE}: scratch it for a random [Insert]. It goes in the [Sleeve]`] },
  'bulk-bin': { name: 'Ashtray', text: () => [`Empty one [Ash] card from your deck: $${BULK_BIN_PRICE}, then $${BULK_BIN_PRICE + 1}, $${BULK_BIN_PRICE + 2}… for the run`] },
  grading: { name: 'Grading desk', text: () => ['Ship one card: it comes back graded 1–10 at the next shop', 'Grade = 1d10 + [Freshness], max 10'] },
  'pack-offbrand': { name: PACKS.offbrand.name, tag: `$${PACK_PRICE.offbrand}`, text: () => [PACKS.offbrand.text] },
  'pack-repack': { name: PACKS.repack.name, tag: `$${PACK_PRICE.repack}`, text: () => [PACKS.repack.text] },
  'pack-collector': { name: PACKS.collector.name, tag: `$${PACK_PRICE.collector}`, text: () => [PACKS.collector.text] },
}

for (const id of Object.keys(SHIPPERS) as Shipper[]) {
  const s = SHIPPERS[id]
  HUD[`ship-${id}`] = { name: s.name, tag: `$${s.price}`, text: () => [s.text] }
}
for (const s of STARTERS) {
  if (s.id === 'standard') continue
  HUD[`box-${s.id}`] = { name: s.name, text: () => [`Deck: ${s.deckText}`, mark(s.twist)] }
}

// ---------- the map ----------

const IDS: Record<Kind, () => string[]> = {
  card: () => [],
  finish: () => Object.keys(FINISH_TEXT),
  stamp: () => [...Object.keys(STAMP_TEXT), 'graded'],
  knockoff: () => ['crayon', 'marked', 'wrongsuit', 'beer'],
  trait: () => Object.keys(TRAIT_SAMPLE),
  tier: () => Array.from({ length: MAX_TIER }, (_, i) => String(i + 1)),
  variant: () => Object.keys(VARIANTS),
  joker: () => Object.keys(JOKERS),
  bulk: () => ['bulk'],
  collectible: () => COLLECTIBLES.map(c => c.id),
  insert: () => Object.keys(INSERTS),
  pochette: () => SLEEVES.map(s => s.id),
  twist: () => TWISTS.map(t => t.id),
  rival: () => RIVALS.map(r => r.id),
  keeper: () => KEEPER.map(k => k.id),
  hud: () => Object.keys(HUD),
  keyword: () => Object.keys(KEYWORDS),
  hand: () => [...HAND_TYPES],
}

// every id of a kind, for the carnet glossary and tests. cards have no ids, use cardEntry
export function glossaryIds(kind: Kind): string[] {
  return IDS[kind]()
}

function unknown(kind: Kind, id: string): never {
  throw new Error(`no ${kind} entry ${id}`)
}

// ctx by kind: card = the Card, knockoff = the Knockoff (for Wrong Suit's suit), trait = the Card that carries it,
// stamp 'graded' = the grade, collectible = the Owned, insert = the SleeveCard, twist = the Twist, rival = the table (1–4),
// hand = its level, hud: ko = round, marker = amount due, stonks = { stonks, hotMarket }, difficulty, lane = rival id, level
export function entry(kind: Kind, id: string, ctx?: unknown): Entry {
  if (!glossaryIds(kind).includes(id) && kind !== 'card') unknown(kind, id)
  switch (kind) {
    case 'card': {
      const card = ctx as Card | undefined
      if (!card || typeof card.rank !== 'number') throw new Error('a card entry needs the card')
      return cardEntry(card)
    }
    case 'finish': return { name: FINISH_TEXT[id as Finish].name, kind, text: FINISH_TEXT[id as Finish].text }
    case 'stamp': {
      if (id === 'graded') {
        const grade = num(ctx)
        const text = grade !== null ? [gradeLine(grade)] : [gradeLine(2), gradeLine(6), gradeLine(10)]
        return { name: 'Graded', kind, tag: grade !== null ? String(grade) : undefined, text: [...text, 'Only from the grading desk'] }
      }
      return { name: STAMP_TEXT[id as Stamp].name, kind, text: STAMP_TEXT[id as Stamp].text }
    }
    case 'knockoff': {
      const given = ctx as Knockoff | undefined
      const k: Knockoff = given?.kind === id ? given : id === 'wrongsuit' ? { kind: 'wrongsuit', suit: 'H' } : id === 'beer' ? { kind: 'beer', stuckTo: 0 } : ({ kind: id } as Knockoff)
      const text = id === 'wrongsuit' && given?.kind !== 'wrongsuit' ? ['Also counts as a second suit for a Flush'] : knockoffText(k)
      return { name: given?.kind === id ? knockoffName(k) : knockoffName(k).split('/')[0], kind, tag: 'Off-Brand', text }
    }
    case 'trait': {
      const card = ctx as Card | undefined
      const own = card?.traits.find(t => traitId(t) === id)
      const t = own ?? TRAIT_SAMPLE[id]
      const name = own && card ? traitLabel(card, own) : id === 'split' ? 'Split' : id === 'household' ? 'Household' : traitName(t)
      const text = own ? traitText(own, card!.rank) : id === 'split' ? ['Also counts as one card of a second rank'] : traitText(t, null)
      return { name, kind, tag: `from a ${HAND_NAMES[TRAIT_FROM[id]]}`, text }
    }
    case 'tier': return { name: '★'.repeat(Number(id)), kind, text: tierText(Number(id)) }
    case 'variant': return { name: VARIANTS[id as Variant].name, kind, text: variantText(id as Variant) }
    case 'joker': {
      const j = JOKERS[id as JokerId]
      return { name: j.name, kind, tag: id === 'crayon' ? 'Off-Brand' : 'Joker', text: [mark(j.text), `Max ${MAX_JOKERS} Jokers in a deck`] }
    }
    case 'bulk': return BULK
    case 'collectible': {
      const def = getDef(id)
      const owned = ctx as Owned | undefined
      const param = owned?.id === id ? owned.param : null
      // no rolled param yet: say it's rolled instead of showing a placeholder
      const line = param !== null ? describe({ id, param }) : def.text.replace('{S}', 'card of its suit').replace('{R}', 'its rank')
      const text = [mark(line)]
      if (param === null && def.roll) text.push(`Its ${def.roll} is rolled when it's stocked`)
      return { name: def.name, kind, tag: def.payoff ? 'payoff' : def.rarity, text, foot: `$${COLLECTIBLE_PRICE[def.rarity]}` }
    }
    case 'insert': {
      const ins = INSERTS[id as Insert]
      const card = ctx as SleeveCard | undefined
      const text = [mark(ins.text)]
      if (id === 'code' && card?.hand) text.push(`Levels up ${HAND_NAMES[card.hand]}`)
      return { name: ins.name, kind, tag: WHEN[ins.when], text }
    }
    case 'pochette': {
      const s = getSleeve(id as SleeveId)
      return { name: s.name, kind, text: [mark(s.text), 'Lasts the whole run'], foot: `$${POCHETTE_PRICE}` }
    }
    case 'twist': {
      const def = TWISTS.find(t => t.id === id)!
      const t = ctx as Twist | undefined
      const line = t?.id === id && t.suit ? twistText(t) : def.text.replace('{S} cards', "One suit's cards")
      return { name: def.name, kind, tag: 'Boss', text: [line, 'For both players, on all three hands'] }
    }
    case 'rival': return rivalEntry(getRival(id as RivalId), ctx)
    case 'keeper': return { name: getKeeper(id as KeeperId).name, kind, tag: 'La Maison', text: [mark(getKeeper(id as KeeperId).text)] }
    case 'hud': {
      const d = HUD[id]
      return { name: d.name, kind, tag: d.tag, text: d.text(ctx) }
    }
    case 'keyword': return { name: id, kind, text: [KEYWORDS[id]] }
    case 'hand': return handEntry(id as HandType, ctx)
  }
}
