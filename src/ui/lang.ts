// french or english. every french word the game prints is listed here, and font.ts runs all text through it:
// in english, WORDS swap to their english, in french they glint. NAMES stay french in both and always glint.
// call sites never translate, they keep writing the french. english is the default: a first-timer reads the rules
// in their own words, and the french stays as the names, the barks and the glint
import { toggle } from './sound.ts'
import { pref, setPref } from './prefs.ts'
import { RIVALS } from '../engine/rivals.ts'

export type Lang = 'fr' | 'en'
export type Seg = { s: string; french: boolean }

// french -> english. matched as whole words, any case, longest first
const WORDS: [string, string][] = [
  // the frame
  ['Vitrine', 'Display'], ['Classeur', 'Binder'], ['Étui', 'Deck'], ['Carnet', 'Rules'], ['Pochettes', 'Upgrades'], ['Pochette', 'Upgrade'],
  ['Manches', 'Rounds'], ['Manche', 'Round'], ['Nouvelle table ce soir', 'New table tonight'], ['Ce soir', 'Tonight'],
  ['À vous', 'Your turn'], ['Vous', 'You'], ['1er', '1st'],
  ['FACILE', 'EASY'], ['MOYEN', 'MEDIUM'], ['GROS JOUEUR', 'HIGH ROLLER'], ['PIOCHE', 'PILE'], ['DÉFAUSSE', 'DISCARD'],
  ['CARTE', 'CARD'], ['BIBELOT', 'COLLECTIBLE'],
  // the duel
  ['JETÉE', 'THROWN'], ['Tapis.', 'All in.'], ['Petite mise.', 'Small bet.'], ['K.-O. !', 'K.O.!'],
  ['Le butin', 'The spoils'], ['La fée verte !', 'The green fairy!'], ['Impayé', 'Unpaid'],
  ['Le Patron attend', 'Le Patron is waiting'], ['Le Patron est payé', 'Le Patron is paid'],
  ['Les mains de poker', 'Poker hands'], ['Les mains', 'Hands'], ['Comment ça marche', 'How it works'], ['la maison', 'the house'],
  // the tabac
  ['Bonjour.', 'Hello.'], ['Alors ?', 'Well?'], ['Bon.', 'Right.'], ['Hein ?!', 'Huh?!'], ['Mouais.', 'Meh.'],
  ['Ma marchandise vous plaît pas ?', "Don't like my stock?"], ['LE GRAAL !', 'THE GRAIL!'],
  ['se vend', 'sells'], ['Sortir', 'Leave'], ['Cote du jour', "Today's prices"], ['Demain', 'Tomorrow'],
  // the title
  ['JOUER', 'PLAY'], ['EN SOLO', 'SOLO'], ['EN LIGNE', 'ONLINE'], ['LA RUE', 'THE STREET'], ['Tutoriel', 'Tutorial'],
]

// a whole label that's french only on its own: the Fiche's MAIN pill is a hand, "Main menu" isn't
const EXACT: Record<string, string> = { MAIN: 'HAND', MOT: 'TERM', PATRON: 'KEEPER' }
// a french word at the start, only in this spot: "Main 2 / 3", a card's "Roi ♠" (never the "as" in a sentence)
const PREFIX: [RegExp, string][] = [
  [/^Main(?= \d)/, 'Hand'], [/^Valet(?= [♠♥♦♣])/, 'Jack'], [/^Dame(?= [♠♥♦♣])/, 'Queen'], [/^Roi(?= [♠♥♦♣])/, 'King'],
  [/^As(?= [♠♥♦♣])/, 'Ace'],
]

// names and the game's own verbs. french in both languages, so they always glint
const NAMES: string[] = [
  'Flambeur', 'Flamber', 'Flambéed', 'Flambés', 'Flambé', 'Le Patron', 'TABAC', 'La Poste', 'Fourgon blindé',
  'Chalumeau', 'Les Jumeaux', 'Flamme Bleue', 'Le Ferrailleur', 'Le Commissaire-priseur', "L'Écrin",
  'Faux Frère', 'Le Roussi', 'Sélène', ...RIVALS.map(r => r.name),
]

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const english = new Map(WORDS.map(([fr, en]) => [fr.toLowerCase(), en]))
const terms = [...WORDS.map(w => w[0]), ...NAMES].sort((a, b) => b.length - a.length)
// no letter right before or after, so "Bon." never hits "Bonjour."
const FRENCH = new RegExp(`(?<!\\p{L})(${terms.map(escape).join('|')})(?!\\p{L})`, 'giu')

let current: Lang = pref('lang')
const cache = new Map<string, Seg[]>()

export function lang(): Lang {
  return current
}

export function setLang(l: Lang): void {
  if (l !== current) toggle(l === 'fr')
  current = l
  cache.clear()
  setPref('lang', l)
}

export function toggleLang(): void {
  setLang(current === 'fr' ? 'en' : 'fr')
}

// "MANCHE" -> "ROUND", "manche" -> "round", "Manche" -> "Round"
function matchCase(src: string, en: string): string {
  if (src === src.toUpperCase() && src !== src.toLowerCase()) return en.toUpperCase()
  if (src[0] === src[0].toLowerCase()) return en[0].toLowerCase() + en.slice(1)
  return en
}

// the string split into french runs (they glint) and the rest, already in the current language
export function segments(s: string): Seg[] {
  let segs = cache.get(s)
  if (segs) return segs
  segs = split(s)
  if (cache.size > 4000) cache.clear() // count-ups make a new string every frame
  cache.set(s, segs)
  return segs
}

function split(s: string): Seg[] {
  const exact = EXACT[s]
  if (exact) return [{ s: current === 'en' ? exact : s, french: current === 'fr' }]
  for (const [re, en] of PREFIX) {
    const m = s.match(re)
    if (!m) continue
    const rest = s.slice(m[0].length)
    return current === 'en' ? [{ s: en, french: false }, ...split(rest)] : [{ s: m[0], french: true }, ...split(rest)]
  }
  const out: Seg[] = []
  let at = 0
  for (const m of s.matchAll(FRENCH)) {
    if (m.index > at) out.push({ s: s.slice(at, m.index), french: false })
    const en = english.get(m[0].toLowerCase())
    if (en && current === 'en') out.push({ s: matchCase(m[0], en), french: false })
    else out.push({ s: m[0], french: true })
    at = m.index + m[0].length
  }
  if (at < s.length) out.push({ s: s.slice(at), french: false })
  return out
}

// the plain string in the current language, for measuring and the DOM
export function say(s: string): string {
  const segs = segments(s)
  return segs.length === 1 ? segs[0].s : segs.map(x => x.s).join('')
}
