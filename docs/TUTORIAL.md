# Tutorial: La Fée Verte shows you the table

Decided with Evan on Nov 20 on the ideation board. It builds on `docs/ONBOARDING.md` (seeded first run, first-encounter tags) and wins over it where they disagree. ART.md §1's "she's never a character with dialogue" is lifted for the tutorial and the lost-run screen: Evan wants her as the game's mascot, like Balatro's tutorial guide, with a voice of her own.

## The shape

- **Who teaches:** La Fée Verte, a small absinthe-green fairy. She flies to what she's teaching and talks in a speech bubble, a page at a time, with her own glass voice. Click to finish a line, click again for the next page.
- **When:** the seeded first run (`PREMIERE-17`, see ONBOARDING.md #2) is the tutorial. It runs by itself on a browser that never finished a run. To play it again: the **Tutorial** ticket on the title's solo row (the primary one until the tutorial is finished once), Settings → Tutorial (in a run it asks Sure? Again and drops that run), and a line at the foot of the carnet's How to play page points there. Every way into a run starts with clean UI state, so a pick or a sheet from the run you left can't carry in. A **Skip tutorial** chip under her bubble (over it when she sits on the bottom edge) ends it: the run goes on and the lessons fall back to plain paper tags. While a spotlight is up and her bubble is gone, the chip sits top left under the Pause tab, so a stuck lesson always has a way out.
- **How hands-on:** forced for hand 1 of round 1 (a spotlight, and only the right thing works), nudges after. Every lesson is still a first-encounter tag: it shows once, the first time the thing is usable.
- **Scope:** every mechanic in the game, each taught the first time it can be used. Run one doesn't stage or hide anything.
- **Outside the tutorial:** she comes back on the lost-run screen with a word about how you lost. Everything else is plain tags.

## Hand 1, forced

| Step | Spotlight | Only this works | She says |
|---|---|---|---|
| 1 | your best hand (`bestPlay`) | those cards | hello, best of 3 hands, "your best hand is a Straight: K Q J 10 9" |
| 2 | Play | Play (with exactly those cards picked) | Value × Hype is the start of your Appraisal; Play locks it, the rival locks face down |
| 3 | Max | Max (Min is off) | the bet: Min pays the ante, Max bets more on yourself, and this hand is strong |
| 4 | the score tags | Continue | Appraisal = Value × Hype × 2^Grade, 2 hands take the round |

On `PREMIERE-17` that's the 9–K Straight (336) over the rival's Full House (304), and with Max the round ends in a round 1 K.O. at $36. The Pair of 5s it skips is still in hand for hand 2, where the Flamber tag comes up. (Forcing the Pair lost hand 1 to a K.O.)

The seed is deterministic: the same seed and the same picks replay the same run, so hand 1 always deals the same way. Only a rule or balance change can move it, and `src/engine/firstrun.test.ts` fails if it does (find a new seed with `node sim/firstseed.ts`). After hand 1 the player's own picks take over, and the lessons are first-encounter tags, so nothing later depends on the script.

The engine never changes: the tutorial only turns tickets off and blocks clicks outside the spotlight. Every action still goes through `step()`.

## Every lesson

The Table: hello and goal, picking a Pair, the readout (Value × Hype), Play, the bet (Min), the reveal (Appraisal, best of 3), Discard, Max, Flamber, ★ cards, Ash, K.O., the last push, the tally (Pot, House, Interest), your bankroll, spoils, the Sleeve and inserts, Le Patron's marker, the boss twist, hovering for the Fiche, Joker cards, knockoffs, the rival's stack.

The little book (the first shop, right after the welcome): la Fée spotlights the closed book until you open it, then each tab in turn, Deck, Binder, Sleeve, Display, Rules, with a lesson on each page (`bookTour` in `src/ui/drawer.ts`). The book's tags show over the open book, every other tag waits for it to close.

The pack rip: the rip, deck vs binder, and the special-card lessons the first time a Joker, knockoff, finish, stamp or ★ card is pulled (`CARD_LESSONS` in `src/ui/duel.ts`, shared with the hand).

The tabac: the shop, packs, deck vs binder, collectibles (left to right), scratchers, the grading desk, the Ashtray, the binder and STONKS, restock, the shopkeeper's sign, pochettes, the scouting dossier, Le Patron at the door, the salty shopkeeper (10% up once every collectible has been shown).

The words live next to the code that shows them (`tip()` calls in `src/ui/duel.ts`, `src/ui/shop.ts` and `src/main.ts`).

## Pacing

One lesson at a time. A forced step's spotlight holds every other tag back, and the click that closes a forced or book lesson stays with it (so it can't shut the book or press something by accident). The table's lessons are spread over the first hands: hand 2 gets hovering and the rival's stack, hand 3 gets Le Patron's note, and the book waits for the shop.

Testing: `/?first&shop`, `/?first&big` and `/?first&boss` (dev) play the seed up to its first shop, big shop or round 3 boss deal and keep the tags already seen, so one lesson can be tested by itself. `/?first&lose` plays one card and bets Max every hand until it busts, for the lost-run Fée.

## The Fée

- **Look:** a placeholder drawn from a text grid in `src/ui/fee.ts` (2 wing frames, a soft absinthe glow, a sparkle trail), until the real sprite is drawn.
- **Voice:** a struck absinthe glass, a sine with a quiet twelfth on top and a short bell decay, in key with the music (`sfx.blip('fee', …)`). Not a voice sample, so it's nothing like Balatro's.
- **Lost run:** a short quip, then one line on what to try next, picked from how you lost (missed Le Patron, busted, or behind on chips).

## Also in this change

- **Why you lost a hand:** the score tag on the felt marks the factor that decided the hand (ONBOARDING.md "why" card, small version).
- **Rulebook:** "How to play" pages in the carnet's Rules tab, one per thing a new player must leave knowing: Appraisal, bankroll is life, Min / Max / Flamber, deck vs binder.
