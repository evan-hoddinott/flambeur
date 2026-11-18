import { BULK_VALUE, bestFinish, cardValue, has, isCrayon, type Card, type Finish } from './cards.ts'
import { getDef, hasCollectible, type HandCtx, type Owned } from './collectibles.ts'
import { HAND_BASE, HAND_NAMES, evaluateHand, type HandType } from './hands.ts'
import { randInt, type Rng } from './rng.ts'
import type { Twist } from './twists.ts'

// one line of the count-up animation. xhype = a hype multiplier (1 = none), applied when the step lands
export type Step = {
  label: string
  cardId: number | null
  slot: number | null // display case index
  value: number
  hype: number
  xhype: number
  grade: number
}

export type Appraisal = {
  hand: HandType
  bonus: HandType[]
  scoringIds: number[]
  value: number
  hype: number // can be fractional once a × lands. the total rounds down at the end
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
  twist: Twist | null // boss round rule, null on normal rounds
  // rng for misprints. null = estimate (bots planning a bet), uses the average roll
  rng: Rng | null
}

export const LEVEL_VALUE = 15
export const LEVEL_HYPE = 1

// what card modifiers add when the card scores. the glossary reads these too
export const FOIL_VALUE = 30
export const HOLO_HYPE = 4
export const MISPRINT_MAX = 8 // rolls +0 to this
export const BEER_HYPE = 6
export const JUMBO_TIMES = 3
export const TIER_HYPE = [0, 0, 5, 10] // by tier. ★3 also gives +1 grade

// a graded card's bonus: 1–3 is damaged in shipping, 4–9 +grade/3 hype, a 10 is gem mint +1 grade
export function gradeBonus(grade: number): { hype: number; grade: number } {
  if (grade <= 3) return { hype: -1, grade: 0 }
  if (grade <= 9) return { hype: Math.floor(grade / 3), grade: 0 }
  return { hype: 0, grade: 1 }
}

// appraisal = value × hype × 2^grade, rounded down. the case triggers left to right and a × multiplies whatever
// hype has built up so far, so order matters: hand base → each scored card in play order (value, finish, stamps,
// tier, grade, then each collectible's per-card effect) → bulk → each collectible's per-hand effect
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
      xhype: 1,
      grade: 0,
    })
  }

  const tw = ctx.twist?.id
  const add = (label: string, cardId: number | null, slot: number | null, d: Partial<Step>) => {
    // hype freeze: only the hand bases give hype, multipliers included
    const freeze = tw === 'hypefreeze'
    const step = { label, cardId, slot, value: d.value ?? 0, hype: freeze ? 0 : d.hype ?? 0, xhype: freeze ? 1 : d.xhype ?? 1, grade: d.grade ?? 0 }
    if (step.value || step.hype || step.grade || step.xhype !== 1) steps.push(step)
  }

  const display = tw === 'sealed' ? [] : ctx.display
  // face cards / the banned suit still make the hand, they just score nothing themselves
  const blank = (c: Card) => (tw === 'faceless' && !isCrayon(c) && c.rank >= 11 && c.rank <= 13) || (tw === 'banwave' && c.suit === ctx.twist?.suit)
  const signedTimes = hasCollectible(display, 'bis') ? 3 : 2
  const worn: Finish[] = []
  for (const card of hand.scoring) {
    // a sticker wears the best finish of the other cards played with it
    const finish = card.finish ?? (card.variant === 'sticker' ? bestFinish(played.filter(c => c.id !== card.id)) : null)
    if (blank(card)) continue
    if (finish) worn.push(finish) // a blanked card triggers nothing, its finish included
    const times = card.stamp === 'signed' ? signedTimes : 1
    const tag = (name: string) => (card.finish === null && finish !== null ? `Sticker ${name}` : name)
    for (let t = 0; t < times; t++) {
      add(card.variant === 'jumbo' ? 'Jumbo' : 'card', card.id, null, { value: cardValue(card) * (card.variant === 'jumbo' ? JUMBO_TIMES : 1) })
      if (finish === 'foil') add(tag('Foil'), card.id, null, { value: FOIL_VALUE })
      if (finish === 'holo') add(tag('Holo'), card.id, null, { hype: HOLO_HYPE })
      if (finish === 'prism') add(tag('Prism'), card.id, null, { grade: 1 })
      if (finish === 'misprint') add(tag('Misprint'), card.id, null, { hype: ctx.rng ? randInt(ctx.rng, 0, MISPRINT_MAX) : MISPRINT_MAX / 2 })
      if (card.stamp === 'first') add('1st Edition', card.id, null, { hype: 1 + card.bonusHype })
      if (card.stamp === 'damaged') add('Damaged', card.id, null, { grade: 1 })
      if (card.knockoff?.kind === 'marked') add('Marked', card.id, null, { grade: 1 })
      if (card.knockoff?.kind === 'beer') add('Beer-stained', card.id, null, { hype: BEER_HYPE })
      // forge tiers: ★2 +5 hype, ★3 +10 hype and +1 grade. crown is a permanent +1 grade
      if (card.tier === 2) add('★★', card.id, null, { hype: TIER_HYPE[2] })
      if (card.tier >= 3) add('★★★', card.id, null, { hype: TIER_HYPE[3], grade: 1 })
      if (has(card, 'crown')) add('Crown', card.id, null, { grade: 1 })
      if (card.grade !== null) add(card.grade === 10 ? 'Gem Mint' : `Grade ${card.grade}`, card.id, null, gradeBonus(card.grade))
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
    bulk: bulk.length,
    worn,
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
    hype = (hype + s.hype) * s.xhype
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
    total: Math.floor(value * hype * 2 ** grade),
    steps,
  }
}

export function emptyLevels(): Record<HandType, number> {
  return { high: 0, pair: 0, twopair: 0, trips: 0, straight: 0, flush: 0, fullhouse: 0, quads: 0, straightflush: 0, royalflush: 0 }
}
