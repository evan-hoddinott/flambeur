// every card and modifier pulled, across runs, in this browser. the binder's Album page draws it
import { JOKERS, VARIANTS, type Card } from '../engine/cards.ts'

const store = 'flambeur:album:1'
const seen = new Set<string>()

function read(): void {
  try {
    const entries: unknown = JSON.parse(localStorage.getItem(store) ?? '[]')
    if (Array.isArray(entries)) for (const key of entries) if (typeof key === 'string') seen.add(key)
  } catch { /* the album still works for this session when storage is unavailable */ }
}

export function recordPull(card: Card): boolean {
  read()
  const size = seen.size
  seen.add(card.rank + card.suit)
  for (const [group, id] of Object.entries({ finish: card.finish, stamp: card.stamp, type: card.variant, joker: card.joker, knock: card.knockoff?.kind })) {
    if (id) seen.add(group + '/' + id)
  }
  if (size === seen.size) return false
  try { localStorage.setItem(store, JSON.stringify([...seen])) } catch { /* retain the session copy */ }
  return true
}

export function albumSeen(): ReadonlySet<string> {
  read()
  return seen
}

export const ALBUM_SETS: [string, string[]][] = [
  ['finish', ['foil', 'holo', 'prism', 'misprint']], ['stamp', ['first', 'signed', 'gold', 'damaged']],
  ['type', Object.keys(VARIANTS)], ['joker', Object.keys(JOKERS)], ['knock', ['crayon', 'marked', 'wrongsuit', 'beer']],
]
