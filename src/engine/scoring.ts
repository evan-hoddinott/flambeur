import { BULK_VALUE, bestFinish, cardValue, has, type Card } from './cards.ts'
import { getDef, type HandCtx, type Owned } from './collectibles.ts'
import { HAND_BASE, HAND_NAMES, evaluateHand, type HandType } from './hands.ts'
import { randInt, type Rng } from './rng.ts'
import type { Twist } from './twists.ts'

// one line of the count-up animation
export type Step = {
  label: string
  cardId: number | null
  slot: number | null // display case index
  value: number
  hype: number
  grade: number
}

export type Appraisal = {
  hand: HandType
  bonus: HandType[]
  scoringIds: number[]
  value: number
  hype: number
  grade: number
  total: number
  steps: Step[]
}

export type ScoreCtx = {
  levels: Record<HandType, number>
  display: Owned[]
  displaySlots: number
  deckSize: number
  bankroll: number
  ante: number
  betMax: boolean
  hypeMod?: Partial<Record<HandType, number>> // starter box tweaks to hand base hype
  twist: Twist | null // tournament round rule, null on normal rounds
  // rng for misprints. null = estimate (bots planning a bet), uses the average roll
  rng: Rng | null
}

export const LEVEL_VALUE = 15
export const LEVEL_HYPE = 1

// appraisal = value × hype × 2^grade. hype never drops below 1
export function appraise(played: Card[], ctx: ScoreCtx): Appraisal {
  const hand = evaluateHand(played)
  const steps: Step[] = []
  // primary hand first, then any bonus hands forged traits unlocked. each one's base stacks
  for (const [i, type] of [hand.type, ...hand.bonus].entries()) {
    const level = ctx.levels[type]
    const base = HAND_BASE[type]
    const name = level > 0 ? `${HAND_NAMES[type]} lv${level + 1}` : HAND_NAMES[type]
    steps.push({
      label: i === 0 ? name : `+ ${name}`,
      cardId: null,
      slot: null,
      value: base.value + LEVEL_VALUE * level,
      hype: base.hype + LEVEL_HYPE * level + (ctx.hypeMod?.[type] ?? 0),
      grade: 0,
    })
  }

  const add = (label: string, cardId: number | null, slot: number | null, d: Partial<Step>) => {
    // hype freeze: only the hand bases give hype
    const hype = ctx.twist?.id === 'hypefreeze' ? 0 : d.hype ?? 0
    const step = { label, cardId, slot, value: d.value ?? 0, hype, grade: d.grade ?? 0 }
    if (step.value || step.hype || step.grade) steps.push(step)
  }

  const tw = ctx.twist?.id
  const display = tw === 'sealed' ? [] : ctx.display
  // face cards / the banned suit still make the hand, they just score nothing themselves
  const blank = (c: Card) => (tw === 'faceless' && c.rank >= 11 && c.rank <= 13) || (tw === 'banwave' && c.suit === ctx.twist?.suit)
  for (const card of hand.scoring) {
    if (blank(card)) continue
    const times = card.stamp === 'signed' ? 2 : 1
    // a sticker wears the best finish of the other cards played with it
    const finish = card.finish ?? (card.variant === 'sticker' ? bestFinish(played.filter(c => c.id !== card.id)) : null)
    const tag = (name: string) => (card.finish === null && finish !== null ? `Sticker ${name}` : name)
    for (let t = 0; t < times; t++) {
      add(card.variant === 'jumbo' ? 'Jumbo' : 'card', card.id, null, { value: cardValue(card) * (card.variant === 'jumbo' ? 3 : 1) })
      if (finish === 'foil') add(tag('Foil'), card.id, null, { value: 30 })
      if (finish === 'holo') add(tag('Holo'), card.id, null, { hype: 4 })
      if (finish === 'prism') add(tag('Prism'), card.id, null, { grade: 1 })
      if (finish === 'misprint') add(tag('Misprint'), card.id, null, { hype: ctx.rng ? randInt(ctx.rng, 0, 8) : 4 })
      if (card.stamp === 'first') add('1st Edition', card.id, null, { hype: 1 + card.bonusHype })
      if (card.stamp === 'damaged') add('Damaged', card.id, null, { grade: 1 })
      if (card.knockoff?.kind === 'marked') add('Marked', card.id, null, { grade: 1 })
      if (card.knockoff?.kind === 'beer') add('Beer-stained', card.id, null, { hype: 6 })
      // forge tiers: ★2 +5 hype, ★3 +10 hype and +1 grade. crown is a permanent +1 grade
      if (card.tier === 2) add('★★', card.id, null, { hype: 5 })
      if (card.tier >= 3) add('★★★', card.id, null, { hype: 10, grade: 1 })
      if (has(card, 'crown')) add('Crown', card.id, null, { grade: 1 })
      if (card.grade !== null) {
        if (card.grade <= 3) add(`Grade ${card.grade}`, card.id, null, { hype: -1 })
        else if (card.grade <= 9) add(`Grade ${card.grade}`, card.id, null, { hype: Math.floor(card.grade / 3) })
        else add('Gem Mint', card.id, null, { grade: 1 })
      }
      display.forEach((owned, slot) => {
        const d = getDef(owned.id).onCard?.(card, owned.param)
        if (d) add(getDef(owned.id).name, card.id, slot, d)
      })
    }
  }

  // bulk is the one card that scores without being in the hand
  const bulk = played.filter(c => c.bulk)
  for (const card of bulk) add('Bulk', card.id, null, { value: BULK_VALUE })

  const handCtx: HandCtx = {
    hand,
    played: played.filter(c => !c.bulk),
    deckSize: ctx.deckSize,
    bankroll: ctx.bankroll,
    ante: ctx.ante,
    betMax: ctx.betMax,
    emptySlots: ctx.displaySlots - ctx.display.length,
  }
  display.forEach((owned, slot) => {
    const d = getDef(owned.id).onHand?.(handCtx, owned.param)
    if (d) add(getDef(owned.id).name, null, slot, d)
  })

  let value = 0
  let hype = 0
  let grade = 0
  for (const s of steps) {
    value += s.value
    hype += s.hype
    grade += s.grade
  }
  hype = Math.max(1, hype)
  return {
    hand: hand.type,
    bonus: hand.bonus,
    scoringIds: [...hand.scoring, ...bulk].map(c => c.id),
    value,
    hype,
    grade,
    total: value * hype * 2 ** grade,
    steps,
  }
}

export function emptyLevels(): Record<HandType, number> {
  return { high: 0, pair: 0, twopair: 0, trips: 0, straight: 0, flush: 0, fullhouse: 0, quads: 0, straightflush: 0, royalflush: 0 }
}
