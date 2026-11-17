import { SUITS, newCard, type Card, type Finish, type Stamp, type Trait } from './cards.ts'
import { COLLECTIBLES, RARITY_WEIGHT, rollParam, type CollectibleDef, type Owned, type Rarity } from './collectibles.ts'
import { COLLECTIBLE_PRICE, PACK_PRICE, SLEEVE_PRICE } from './economy.ts'
import type { SleeveId } from './sleeves.ts'
import { HAND_TYPES, type HandType } from './hands.ts'
import { chance, pick, randInt, type Rng } from './rng.ts'

export type PackKind = keyof typeof PACK_PRICE

export type PackContents = {
  cards: Card[]
  collectible: Owned | null
  codeCard: HandType | null // levels up a hand when kept
}

export type ShopOffer =
  | { type: 'pack'; kind: PackKind; price: number; sold: boolean }
  | { type: 'collectible'; owned: Owned; price: number; sold: boolean }
  | { type: 'sleeve'; id: SleeveId; price: number; sold: boolean }

export type Shop = { offers: ShopOffer[]; restocks: number }

// run-wide state the shop needs. seen = collectibles that have shown up this run
export type ShopMemory = { seen: Set<string>; rolledOver: boolean; packDiscount: number }

function randomCard(rng: Rng, round: number, extra: { finish?: Finish | null; stamp?: Stamp | null } = {}): Card {
  return newCard(randInt(rng, 2, 14), pick(rng, SUITS), { pulledRound: round, ...extra })
}

function rollFinish(rng: Rng, p: number): Finish | null {
  if (!chance(rng, p)) return null
  return pick<Finish>(rng, ['foil', 'foil', 'holo', 'holo', 'misprint']) // prism only from the collector rare slot
}

function rollStamp(rng: Rng, p: number): Stamp | null {
  if (!chance(rng, p)) return null
  return pick<Stamp>(rng, ['first', 'signed', 'gold', 'damaged'])
}

function rollRarity(rng: Rng): Rarity {
  const total = RARITY_WEIGHT.common + RARITY_WEIGHT.uncommon + RARITY_WEIGHT.rare
  const r = rng() * total
  if (r < RARITY_WEIGHT.common) return 'common'
  if (r < RARITY_WEIGHT.common + RARITY_WEIGHT.uncommon) return 'uncommon'
  return 'rare'
}

// nothing repeats until every collectible has been shown once. then the pool resets and the shopkeeper gets salty
// exclude = ids already on display in this shop, so a rollover mid-stock can't offer the same thing twice
export function drawCollectible(rng: Rng, mem: ShopMemory, owned: Owned[], exclude: string[] = []): Owned {
  const ownedIds = new Set([...owned.map(o => o.id), ...exclude])
  let fresh = COLLECTIBLES.filter(d => !mem.seen.has(d.id) && !ownedIds.has(d.id))
  if (fresh.length === 0) {
    mem.seen.clear()
    mem.rolledOver = true
    fresh = COLLECTIBLES.filter(d => !ownedIds.has(d.id))
    if (fresh.length === 0) throw new Error('every collectible is owned')
  }
  const rarity = rollRarity(rng)
  const ofRarity = fresh.filter(d => d.rarity === rarity)
  const def: CollectibleDef = pick(rng, ofRarity.length > 0 ? ofRarity : fresh)
  mem.seen.add(def.id)
  return { id: def.id, param: rollParam(def, rng) }
}

export function collectiblePrice(owned: Owned, mem: ShopMemory): number {
  const def = COLLECTIBLES.find(d => d.id === owned.id)
  if (!def) throw new Error(`unknown collectible ${owned.id}`)
  const base = COLLECTIBLE_PRICE[def.rarity]
  return mem.rolledOver ? Math.ceil(base * 1.1) : base
}

export function openPack(kind: PackKind, rng: Rng, round: number, mem: ShopMemory, owned: Owned[]): PackContents {
  if (kind === 'free') {
    return { cards: [0, 1, 2].map(() => randomCard(rng, round)), collectible: null, codeCard: null }
  }
  if (kind === 'offbrand') {
    // cheap chaos: lots of stamps incl damaged. knockoffs land here in tier 2
    const cards = [0, 1, 2, 3, 4].map(() => randomCard(rng, round, { finish: rollFinish(rng, 0.25), stamp: rollStamp(rng, 0.25) }))
    return { cards, collectible: null, codeCard: null }
  }
  if (kind === 'repack') {
    // stand-in for other players' sold cards until multiplayer exists: some come pre-forged ★1
    const cards = [0, 1, 2, 3].map(() => {
      const card = randomCard(rng, round, { finish: rollFinish(rng, 0.4) })
      if (chance(rng, 0.15)) {
        card.tier = 1
        card.traits = [pick<Trait>(rng, [{ kind: 'multi', count: 2 }, { kind: 'bridge' }, { kind: 'wild' }])]
      }
      return card
    })
    return { cards, collectible: null, codeCard: null }
  }
  // collector: 3 cards, an insert (code card), then the rare slot
  const cards = [0, 1, 2].map(() => randomCard(rng, round, { finish: rollFinish(rng, 0.3) }))
  const codeCard = pick(rng, HAND_TYPES)
  const r = rng()
  let collectible: Owned | null = null
  if (r < 0.45) collectible = drawCollectible(rng, mem, owned)
  else if (r < 0.65) cards.push(randomCard(rng, round, { finish: 'prism' }))
  else cards.push(randomCard(rng, round, { finish: rollFinish(rng, 1), stamp: rollStamp(rng, 1) }))
  return { cards, collectible, codeCard }
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
  return offers
}

// sleeve = this table's sleeve, only offered in the shop right before the boss
export function newShop(rng: Rng, mem: ShopMemory, owned: Owned[], sleeve: SleeveId | null = null): Shop {
  const offers = stockShop(rng, mem, owned, true)
  if (sleeve) offers.push({ type: 'sleeve', id: sleeve, price: SLEEVE_PRICE, sold: false })
  return { offers, restocks: 0 }
}

// $1, $2, $3... free = how many restocks this shop cost nothing (store credit, restock sleeve)
export function restockPrice(shop: Shop, free: number): number {
  return Math.max(0, shop.restocks + 1 - free)
}

// rerolls everything except the free pack and the sleeve
export function restock(shop: Shop, rng: Rng, mem: ShopMemory, owned: Owned[]): Shop {
  const kept = shop.offers.filter(o => (o.type === 'pack' && o.kind === 'free') || o.type === 'sleeve')
  const offers = stockShop(rng, mem, owned, false)
  return { offers: [...kept.filter(o => o.type === 'pack'), ...offers, ...kept.filter(o => o.type === 'sleeve')], restocks: shop.restocks + 1 }
}
