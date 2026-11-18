import { REAL_JOKERS, SUITS, newCard, type Card, type JokerId, type Finish, type Ids, type Knockoff, type Stamp, type Trait, type Variant } from './cards.ts'
import { COLLECTIBLES, RARITY_WEIGHT, rollParam, type CollectibleDef, type Owned, type Rarity } from './collectibles.ts'
import { COLLECTIBLE_PRICE, PACK_PRICE, SCRATCHER_PRICE, SLEEVE_PRICE } from './economy.ts'
import type { SleeveId } from './sleeves.ts'
import { HAND_TYPES, type HandType } from './hands.ts'
import { chance, makeRng, next, pick, randInt, shuffled, type Rng } from './rng.ts'

export type PackKind = keyof typeof PACK_PRICE

export type PackContents = {
  kind: PackKind
  cards: Card[]
  collectible: Owned | null
  codeCard: HandType | null // levels up a hand when kept
}

export type ShopOffer =
  | { type: 'pack'; kind: PackKind; price: number; sold: boolean }
  | { type: 'collectible'; owned: Owned; price: number; sold: boolean }
  | { type: 'sleeve'; id: SleeveId; price: number; sold: boolean }
  | { type: 'scratcher'; price: number; sold: boolean }

export type Shop = { offers: ShopOffer[]; restocks: number }

// run-wide state the shop needs. seen = collectibles that have shown up this run (an array, state stays plain JSON)
export type ShopMemory = { seen: string[]; rolledOver: boolean; packDiscount: number }

function randomCard(ids: Ids, rng: Rng, round: number, extra: { finish?: Finish | null; stamp?: Stamp | null; joker?: JokerId } = {}): Card {
  return newCard(ids, randInt(rng, 2, 14), pick(rng, SUITS), { pulledRound: round, ...extra })
}

function rollFinish(rng: Rng, p: number): Finish | null {
  if (!chance(rng, p)) return null
  return pick<Finish>(rng, ['foil', 'foil', 'holo', 'holo', 'misprint']) // prism only from the collector rare slot
}

function rollStamp(rng: Rng, p: number): Stamp | null {
  if (!chance(rng, p)) return null
  return pick<Stamp>(rng, ['first', 'signed', 'gold', 'damaged'])
}

// each plain-variant card has `p` to become this variant
function variantRoll(rng: Rng, cards: Card[], variant: Variant, p: number): void {
  for (const card of cards) if (card.variant === null && chance(rng, p)) card.variant = variant
}

// 3% a paid pack: one of its cards is a chase. never a pack of its own
function chaseRoll(rng: Rng, cards: Card[]): void {
  if (chance(rng, 0.03)) pick(rng, cards).variant = 'chase'
}

// beer sticks to another card from the same pack. neither card can already be in a pair, so pairs never chain
function rollKnockoff(rng: Rng, card: Card, pack: Card[]): Knockoff {
  const paired = new Set(pack.flatMap(c => (c.knockoff?.kind === 'beer' ? [c.id, c.knockoff.stuckTo] : [])))
  const kind = pick(rng, paired.has(card.id) ? ['crayon', 'marked', 'wrongsuit'] as const : ['crayon', 'marked', 'wrongsuit', 'beer'] as const)
  if (kind === 'wrongsuit') return { kind, suit: pick(rng, SUITS.filter(s => s !== card.suit)) }
  if (kind === 'beer') {
    const free = pack.filter(c => c.id !== card.id && !paired.has(c.id))
    return free.length > 0 ? { kind, stuckTo: pick(rng, free).id } : { kind: 'crayon' }
  }
  return { kind }
}

function rollRarity(rng: Rng): Rarity {
  const total = RARITY_WEIGHT.common + RARITY_WEIGHT.uncommon + RARITY_WEIGHT.rare
  const r = next(rng) * total
  if (r < RARITY_WEIGHT.common) return 'common'
  if (r < RARITY_WEIGHT.common + RARITY_WEIGHT.uncommon) return 'uncommon'
  return 'rare'
}

// nothing repeats until every collectible has been shown once. then the pool resets and the shopkeeper gets salty
// exclude = ids already on display in this shop, so a rollover mid-stock can't offer the same thing twice
export function drawCollectible(rng: Rng, mem: ShopMemory, owned: Owned[], exclude: string[] = [], forceRarity: Rarity | null = null): Owned {
  const ownedIds = new Set([...owned.map(o => o.id), ...exclude])
  let fresh = COLLECTIBLES.filter(d => !mem.seen.includes(d.id) && !ownedIds.has(d.id))
  if (fresh.length === 0) {
    mem.seen.length = 0
    mem.rolledOver = true
    fresh = COLLECTIBLES.filter(d => !ownedIds.has(d.id))
    if (fresh.length === 0) throw new Error('every collectible is owned')
  }
  const rarity = forceRarity ?? rollRarity(rng)
  const ofRarity = fresh.filter(d => d.rarity === rarity)
  const def: CollectibleDef = pick(rng, ofRarity.length > 0 ? ofRarity : fresh)
  mem.seen.push(def.id)
  return { id: def.id, param: rollParam(def, rng) }
}

export function collectiblePrice(owned: Owned, mem: ShopMemory): number {
  const def = COLLECTIBLES.find(d => d.id === owned.id)
  if (!def) throw new Error(`unknown collectible ${owned.id}`)
  const base = COLLECTIBLE_PRICE[def.rarity]
  return mem.rolledOver ? Math.ceil(base * 1.1) : base
}

export function openPack(ids: Ids, kind: PackKind, rng: Rng, round: number, mem: ShopMemory, owned: Owned[]): PackContents {
  // pack lanes: free = plain, off-brand = stamps and knockoffs, repack = forged, jumbos and rookies,
  // collector = finishes, stickers and the rare slot. any paid pack has a small shot at a chase card
  if (kind === 'free') {
    return { kind, cards: [0, 1, 2].map(() => randomCard(ids, rng, round)), collectible: null, codeCard: null }
  }
  if (kind === 'offbrand') {
    const cards = [0, 1, 2, 3, 4].map(() => randomCard(ids, rng, round, { finish: rollFinish(rng, 0.25), stamp: rollStamp(rng, 0.25) }))
    for (const card of cards) if (card.stamp === null && chance(rng, 0.35)) card.knockoff = rollKnockoff(rng, card, cards)
    if (chance(rng, 0.05)) pick(rng, cards).joker = 'crayon'
    chaseRoll(rng, cards)
    return { kind, cards, collectible: null, codeCard: null }
  }
  if (kind === 'repack') {
    // stand-in for other players' sold cards until multiplayer exists: some come pre-forged ★1
    const cards = [0, 1, 2, 3].map(() => {
      const card = randomCard(ids, rng, round, { finish: rollFinish(rng, 0.4) })
      if (chance(rng, 0.15)) {
        card.tier = 1
        card.traits = [pick<Trait>(rng, [{ kind: 'multi', count: 2 }, { kind: 'bridge' }, { kind: 'wild' }])]
      }
      return card
    })
    variantRoll(rng, cards, 'jumbo', 0.12)
    variantRoll(rng, cards, 'rookie', 0.15)
    if (chance(rng, 0.06)) pick(rng, cards).joker = pick(rng, REAL_JOKERS)
    chaseRoll(rng, cards)
    return { kind, cards, collectible: null, codeCard: null }
  }
  // collector: 3 cards, an insert (code card), then the rare slot
  const cards = [0, 1, 2].map(() => randomCard(ids, rng, round, { finish: rollFinish(rng, 0.3) }))
  // a sticker has no finish of its own, it borrows one
  for (const card of cards) {
    if (card.variant === null && chance(rng, 0.2)) {
      card.variant = 'sticker'
      card.finish = null
    }
  }
  chaseRoll(rng, cards)
  const codeCard = pick(rng, HAND_TYPES)
  const r = next(rng)
  let collectible: Owned | null = null
  if (r < 0.45) collectible = drawCollectible(rng, mem, owned)
  else if (r < 0.55) cards.push(randomCard(ids, rng, round, { joker: pick(rng, REAL_JOKERS) }))
  else if (r < 0.65) cards.push(randomCard(ids, rng, round, { finish: 'prism' }))
  else cards.push(randomCard(ids, rng, round, { finish: rollFinish(rng, 1), stamp: rollStamp(rng, 1) }))
  return { kind, cards, collectible, codeCard }
}

const PAID_PACKS: readonly PackKind[] = ['offbrand', 'repack', 'collector']

// free pack is always there (once per shop). restocking rerolls everything else
export function stockShop(rng: Rng, mem: ShopMemory, owned: Owned[], freeAvailable: boolean): ShopOffer[] {
  const offers: ShopOffer[] = []
  if (freeAvailable) offers.push({ type: 'pack', kind: 'free', price: 0, sold: false })
  for (let i = 0; i < 2; i++) {
    const kind = pick(rng, PAID_PACKS)
    offers.push({ type: 'pack', kind, price: Math.max(1, PACK_PRICE[kind] - mem.packDiscount), sold: false })
  }
  const shown: string[] = []
  for (let i = 0; i < 2; i++) {
    const offer = drawCollectible(rng, mem, owned, shown)
    shown.push(offer.id)
    offers.push({ type: 'collectible', owned: offer, price: collectiblePrice(offer, mem), sold: false })
  }
  // 1 or 2 scratchers at the register
  for (let i = randInt(rng, 1, 2); i > 0; i--) offers.push({ type: 'scratcher', price: SCRATCHER_PRICE, sold: false })
  return offers
}

// a scratcher resolves on the spot into one random insert. checklist and wishlist then wait on a card pick
export type Insert = 'code' | 'checklist' | 'wishlist' | 'grail'

export const INSERTS: Record<Insert, { name: string; text: string }> = {
  code: { name: 'Code', text: 'Levels up a random hand type' },
  checklist: { name: 'Checklist', text: "Change one deck card's suit" },
  wishlist: { name: 'Wishlist', text: 'Move one binder card into your deck' },
  grail: { name: 'Grail', text: 'A free rare collectible or a Joker' },
}

export function rollInsert(rng: Rng): Insert {
  const r = next(rng)
  if (r < 0.4) return 'code'
  if (r < 0.7) return 'checklist'
  if (r < 0.92) return 'wishlist'
  return 'grail'
}

// the shopkeeper's posted sign: 3 seeded one-line rules for the whole run, the same shopkeeper for every seat
export type KeeperId = 'grumpy' | 'superstitious' | 'closing' | 'collector' | 'chatty' | 'nostalgic'

export const KEEPER: readonly { id: KeeperId; name: string; text: string }[] = [
  { id: 'grumpy', name: 'Grumpy', text: 'Everything +$1, but the first restock each shop is free' },
  { id: 'superstitious', name: 'Superstitious', text: "Won't buy ♠ cards" },
  { id: 'closing', name: 'Closing Down', text: 'Everything $1 cheaper every Table' },
  { id: 'collector', name: 'Collector', text: 'Pays 2× for graded cards' },
  { id: 'chatty', name: 'Chatty', text: "Tells you next shop's STONKS" },
  { id: 'nostalgic', name: 'Nostalgic', text: 'Pays 2× for 1st Edition cards' },
]

export function keeperFor(seed: string): KeeperId[] {
  return shuffled(makeRng(`${seed}:keeper`), KEEPER.map(k => k.id)).slice(0, 3)
}

export function getKeeper(id: KeeperId): { id: KeeperId; name: string; text: string } {
  const k = KEEPER.find(x => x.id === id)
  if (!k) throw new Error(`unknown shopkeeper trait ${id}`)
  return k
}

// sleeve = this table's sleeve, only offered in the shop right before the boss.
// the sign's price change on fresh stock. free stays free, nothing drops under $1
function adjust(offers: ShopOffer[], priceAdj: number): ShopOffer[] {
  return offers.map(o => (o.price === 0 ? o : { ...o, price: Math.max(1, o.price + priceAdj) }))
}

export function newShop(rng: Rng, mem: ShopMemory, owned: Owned[], sleeve: SleeveId | null, priceAdj: number): Shop {
  const offers = stockShop(rng, mem, owned, true)
  if (sleeve) offers.push({ type: 'sleeve', id: sleeve, price: SLEEVE_PRICE, sold: false })
  return { offers: adjust(offers, priceAdj), restocks: 0 }
}

// $1, $2, $3... free = how many restocks this shop cost nothing (store credit, restock sleeve)
export function restockPrice(shop: Shop, free: number): number {
  return Math.max(0, shop.restocks + 1 - free)
}

// rerolls everything except the free pack and the sleeve
export function restock(shop: Shop, rng: Rng, mem: ShopMemory, owned: Owned[], priceAdj: number): Shop {
  const kept = shop.offers.filter(o => (o.type === 'pack' && o.kind === 'free') || o.type === 'sleeve')
  const offers = adjust(stockShop(rng, mem, owned, false), priceAdj)
  return { offers: [...kept.filter(o => o.type === 'pack'), ...offers, ...kept.filter(o => o.type === 'sleeve')], restocks: shop.restocks + 1 }
}
