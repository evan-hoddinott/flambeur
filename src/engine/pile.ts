// la pile: the deck sorted into lines by rank, suit or type, for the deck view (docs/UX.md §3).
// a card sits in its printed line, and also shows up in every other line it counts for (split, twin, wrong suit, wild)
import { SUITS, isCrayon, isWild, rankCounts, suitsOf, type Card, type Suit } from './cards.ts'

export type Grouping = 'rank' | 'suit' | 'type'
export const GROUPINGS: readonly Grouping[] = ['rank', 'suit', 'type']

export type TypeKey = 'plain' | 'finish' | 'stamp' | 'knockoff' | 'star' | 'graded' | 'variant' | 'joker' | 'ash'
export const TYPE_KEYS: readonly TypeKey[] = ['plain', 'finish', 'stamp', 'knockoff', 'star', 'graded', 'variant', 'joker', 'ash']

// what a card counts as in a hand. ranks: rank → copies (a twin counts 2). any: a crayon, any rank.
// maybe: ranks it can become when played (the courtier picks J, Q or K)
export type CountsAs = { ranks: Map<number, number>; suits: Suit[]; any: boolean; maybe: number[] }

export function countsAs(card: Card): CountsAs {
  if (card.bulk) return { ranks: new Map(), suits: [], any: false, maybe: [] }
  const suits = isWild(card) ? [...SUITS] : suitsOf(card)
  if (isCrayon(card)) return { ranks: new Map(), suits, any: true, maybe: [] }
  if (card.joker === 'courtier') return { ranks: new Map(), suits, any: false, maybe: [11, 12, 13] }
  return { ranks: rankCounts(card), suits, any: false, maybe: [] }
}

// key: 'rank:13', 'suit:H', 'type:finish', 'rank:any', 'rank:ash', 'suit:ash'. own = printed here, also = counts here
// from another line, maybe = could count here. total = what the line counts as (maybe left out)
export type PileLine = { key: string; own: Card[]; also: Card[]; maybe: Card[]; total: number }

const RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]

export function typesOf(card: Card): TypeKey[] {
  if (card.bulk) return ['ash']
  const out: TypeKey[] = []
  if (card.finish) out.push('finish')
  if (card.stamp) out.push('stamp')
  if (card.knockoff) out.push('knockoff')
  if (card.tier > 0) out.push('star')
  if (card.grade !== null) out.push('graded')
  if (card.variant) out.push('variant')
  if (card.joker) out.push('joker')
  return out.length ? out : ['plain']
}

// every line of a grouping, in order, empty ones included (a gap in the ranks is worth seeing)
export function pileLines(cards: Card[], by: Grouping): PileLine[] {
  const ash = cards.filter(c => c.bulk)
  const live = cards.filter(c => !c.bulk)
  const counted = live.map(c => ({ c, as: countsAs(c) }))
  const lines: PileLine[] = []
  if (by === 'rank') {
    for (const r of RANKS) {
      const own = counted.filter(x => !x.as.any && x.c.rank === r)
      const also = counted.filter(x => x.c.rank !== r && x.as.ranks.has(r))
      const maybe = counted.filter(x => x.as.maybe.includes(r))
      const total = [...own, ...also].reduce((n, x) => n + (x.as.ranks.get(r) ?? 0), 0)
      lines.push({ key: `rank:${r}`, own: own.map(x => x.c), also: also.map(x => x.c), maybe: maybe.map(x => x.c), total })
    }
    const any = counted.filter(x => x.as.any).map(x => x.c)
    lines.push({ key: 'rank:any', own: any, also: [], maybe: [], total: any.length })
  } else if (by === 'suit') {
    for (const s of SUITS) {
      const own = counted.filter(x => x.c.suit === s).map(x => x.c)
      const also = counted.filter(x => x.c.suit !== s && x.as.suits.includes(s)).map(x => x.c)
      lines.push({ key: `suit:${s}`, own, also, maybe: [], total: own.length + also.length })
    }
  } else {
    for (const t of TYPE_KEYS) {
      if (t === 'ash') continue
      const own = live.filter(c => typesOf(c).includes(t))
      lines.push({ key: `type:${t}`, own, also: [], maybe: [], total: own.length })
    }
  }
  lines.push({ key: `${by}:ash`, own: ash, also: [], maybe: [], total: ash.length })
  return lines
}

// the lines a card would land in: its own and every one it also counts in (not maybes)
export function linesOf(card: Card, by: Grouping): string[] {
  return pileLines([card], by).filter(l => l.own.length || l.also.length).map(l => l.key)
}

// a pinned line's count in any grouping: pins outlive a regroup
export function lineTotal(cards: Card[], key: string): number {
  const by = key.split(':')[0] as Grouping
  const line = pileLines(cards, by).find(l => l.key === key)
  if (!line) throw new Error(`no pile line ${key}`)
  return line.total
}
