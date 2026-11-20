# Onboarding: make the game readable to a Balatro player in one run

Sources: first-run onboarding research (a research note, not in the repo) and BronnonY's playtest (Nov 18, Discord). This doc is the build list. It wins over UX.md §7 on teaching.

## What the playtest actually said

BronnonY is a strong Balatro player, finished a run, called it "super addicting", and still couldn't plan at High Roller. The gap is not a tutorial, it's that **the information to strategize isn't on screen**.

| Quote | Root cause | Fix (# below) |
|---|---|---|
| "hype 🙁" / "oh ok like mult" | Score factors are bare numbers, meaning is one hover away | 1 (base preview only, Evan: an exact total turns it into guessing card orders) |
| "some of the things at the top wont go away" | Pinned Fiche (fixed in 4a2019a) or the announcement band. Needs a repro from the screenshot | 4 |
| "tooltip ... covering cards, hard to tell if it was going to binder or deck" | Fiche draws over pack-sort cards | 4 |
| "can you move stuff in and out of bulk?" | **Bulk** is TCG slang for your unwanted cards, i.e. what goes in a binder. The name collides with Binder | 6 |
| "no five of a kind?" | `rankHand` folds 5-of-a-rank into quads silently | 7 |
| "for high roller I need to know what im doing in depth" | No exact numbers, no run-planning view, no rival preview | 1, 5, 9 |
| "jokers" (meaning collectibles) | Balatro vocabulary: their Joker = our collectible, our Joker = a playable card | 6 |
| "toggle tooltips" / "rather have too much info" | One detail level for everyone | 8 |
| "each hand needs a strength and weakness ... pair spam" | Pair is most common **and** the Flamber key. Straight and Flush share a base | 10 |
| "some of it is in french" | Done: English by default (b495ba0) | — |

## Build list

### Before demo (today, Nov 19)

1. ✅ **Hand readout, Balatro style.** (`handReadout` in duel.ts, `handBase` in scoring.ts) On your plate beside your money, like Balatro's left panel, in every deal and bet: what your picked cards make, then your locked hand through the bet. The showdown hands over to the felt score tag. During the count-up your display case drops down from the top so each collectible pops and floats its number as it fires (`caseShelf`). On every selection change, call `evaluateHand` and show the hand name and its **base** factors above the hand: `Two Pair · Value 20 × Hype 2`. Base only (`HAND_BASE` plus any hand-level upgrades), never the full Appraisal: no card Value, finishes, collectibles or order, so there's nothing to gain from clicking through card orders to find the best total. The skill stays in reading your engine. Factor words printed every time in their stat colors. The full number still only shows in the count-up on reveal. This teaches Value/Hype by repetition and gives Min/Max a starting point.
2. ✅ **Seeded first run** (`?first`, and Random on a browser that never finished a run): seed `PREMIERE-17` from `node sim/firstseed.ts`, Easy, Classic with its rows auto-drafted. Pair of 5s and a 9–K straight in hand 1, a round 1 the house bot knocks out, Top Loader ($4) in the first shop. Doubles as the golden-path demo seed.
3. ✅ **First-encounter tags** (`src/ui/tips.ts`): one pinned paper tag at a time, the first moment a system is usable, read on the first click after 1.2 s, never during scoring. Built: goal (best of 3, Appraisal), preview (Value × Hype), Flamber, Max, K.O., bankroll, deck vs binder, collectibles, Le Patron. Not yet: Discard, Spoils, STONKS, grading.
4. ✅ **Fiche placement.** Panel cards (pack sort, spoils, draft) dock their Fiche at the top of the action column. Esc and click-away already closed it, keywords already nest one level. Still open: the "won't go away" screenshot.
5. ◐ **Exact numbers in every Fiche.** Collectibles already print exact numbers. Not yet: a "right now" line for state-based ones (Team Bag, Le Flambeur, Thin Binder, High Roller). 
6. **Vocabulary collisions.**
   - ✅ **Bulk is now Ash** (Nov 20): it's what a flambé leaves and it can't be confused with the binder. The shop's Bulk bin is the Ashtray, the collectible Bulk Bin is the Ash Bucket. Ids stay `bulk`.
   - Collectible Fiche and first tag: "Display case: passive effects, left to right" so Balatro players map it to their Jokers. Joker card Fiche: "A playable card, not a passive".
7. ✅ **Hand-label fixes.** (`handNote` in hands.ts, shown on the hand readout and the score tag. Rules example row not changed) 5 of a rank labels "Four of a Kind (5 counts as 4)". Unsuited 10–A labels "Straight (Royal needs one suit)". Rules paper example row in one suit.
8. ◐ **Detail toggle.** Built: Tips On / Off at the foot of the carnet's rules page, next to the language, which silences tags only. Not yet: Full detail and Shift-to-expand, which need a short and long text per entry.

### After demo

9. **Run-planning info for hard difficulties**: the scouting dossier shows the next rival's lane and payoff before the shop, the vitrine shows the left-to-right order math, pack odds per lane on hover.
10. **Hand rebalance** (sim before/after, record in DESIGN.md): give each hand's unique trait a strength and a weakness, Pair payoffs trigger on "exactly a Pair", split Straight and Flush bases (Flush is far easier to chase with 3 discards), one boss twist aimed at each meta, Five of a Kind as a hidden hand.
11. **Stage run one**: grading, STONKS, knockoffs, pochettes, scratchers/inserts, rival lanes, box and difficulty choice, and the full draft unlock over runs 2–4 automatically, with an unlock-all.
12. **Carnet glossary lists only met terms**, all hoverable.
13. **Playtest protocol**: 3–5 new people, seeded first run, think-aloud, then ask "what is Appraisal / Hype / Flamber / K.O. / what happens at $0". Target: all right by round 3. Save seeds + actions and replay where they stalled.

## Open

- The "won't go away" screenshot: need it from Discord to repro.
- Whether run-one staging (11) hides too much of what makes the game unique. Balatro's answer: run 2 comes within the hour.
