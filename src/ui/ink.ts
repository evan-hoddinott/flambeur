// the color language (docs/ART.md): one meaning per color, everywhere. a stat has its color, and anything that feeds
// a stat wears that stat's color: Foil adds Value so its marker is Value blue, Prism adds Grade so it's Grade gold.
// felt = over the dark world (outlined), paper = ink on cream
import type { Card } from '../engine/cards.ts'
import { specialInk, tierInk } from './art.ts'

type Ink = { felt: string; paper: string }

export const VALUE: Ink = { felt: '#8ec5ff', paper: '#2f5d9a' }
export const HYPE: Ink = { felt: '#ff7a24', paper: '#e8501a' }
export const GRADE: Ink = { felt: '#e8c260', paper: '#9c7028' }
export const MONEY: Ink = { felt: '#6fcf6f', paper: '#3a8040' }
export const LOSS: Ink = { felt: '#d04a4e', paper: '#a82a38' }
// rare and strange things (jokers, the grail): absinthe and violet, never a stat
export const RARE = '#b088e0'

// a modifier's marker: the stat it feeds, or its own art ink when it feeds none (jokers, knockoffs, variants)
const FEEDS: Record<string, Ink> = {
  foil: VALUE, bulk: VALUE, rookie: VALUE, jumbo: VALUE,
  holo: HYPE, misprint: HYPE, first: HYPE, beer: HYPE,
  prism: GRADE, damaged: GRADE,
  gold: MONEY, chase: MONEY,
}

export function modifierInk(id: keyof typeof specialInk): string {
  return FEEDS[id]?.paper ?? specialInk[id]
}

// ★ cards are flambéed and every ★ adds Hype, so the tiers run the Hype ramp
export function starInk(tier: number): string {
  return tierInk[Math.min(3, tier)]
}

// the one color a card's best modifier reads as, for glows and pulls
export function cardInk(card: Card): string | undefined {
  if (card.joker) return RARE
  if (card.tier) return HYPE.felt
  if (card.finish) return modifierInk(card.finish)
  if (card.stamp) return modifierInk(card.stamp)
  return undefined
}
