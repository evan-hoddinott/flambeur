# Flambeur: agent guide

Context for any agent (Claude, Codex, subagents) working in this repo. Read this, then `DESIGN.md`.

## What this is

Flambeur is Evan's entry for the **KSU AI Club Hackathon** (Nov 16–20 2026, KSU Marietta). It's entered in two tracks: **IEEE AI Game Sprint** and **Nudox game track**. Demo and judging are **Friday Nov 20**.

It's a Balatro-inspired **booster-pack poker roguelike** in the browser:
- **Packs:** you rip booster packs to build a small deck of playing cards. Each card can have finishes, stamps and flambéed traits.
- **Rounds:** each round you're dealt a fresh hand, lock in 1–5 cards and bet against a rival. The underdog acts second.
- **Scoring:** whoever has the higher **Appraisal = Value × Hype × 2^Grade** takes the pot.
- **Bankroll:** your money is both your life and your shop money.
- **Flambéing:** merges a hand into one stronger card, TFT style (★1–★3 tiers, traits that stack).

## Read first

| File | What it is |
|---|---|
| `DESIGN.md` | **The game spec and source of truth for every rule and number.** Keep it in sync with code. |
| `CLAUDE.md` | This file. How to work here. |
| `docs/ART.md` | **The art style source of truth**: rendering rules, palette, scenes, characters, cards, motion, UI. Research behind it: `docs/balatro-visual-research.md`. |
| `docs/DUEL.md` | Duel scene spec: layout, characters and the 10 masks, table, room, HUD, sprite list. |
| `docs/SHOP.md` | Shop scene spec: first-person tabac counter, the offer shelf, binder, grading window, pack rip, sprite list. |
| `docs/CARDS.md` | Card art spec for the art agent: every segmented sprite, sizes, layout, layer order, export. |
| `docs/READABILITY.md` | How interactables read: color-coded ticket buttons, outlined text, prop hover cues. Amends ART.md §13. |
| `pitch.html` | Visual pitch page for Evan's friend. It's published on It as `pull-rate-pitch` (its old name) and is older than DESIGN.md. |
| `collectibles-draft.md` | An old 58-idea collectible brainstorm with a Codex review. It's superseded by DESIGN.md and `src/engine/collectibles.ts`. |

## Commands

```bash
pnpm dev                     # vite dev server (or the "flambeur" config in .claude/launch.json, port 5174)
                             # dev only: open /?quick to auto-draft straight to the first deal, /?quick&shop for the round 2 shop
pnpm test                    # node:test, src/engine/*.test.ts
pnpm exec tsc --noEmit -p .  # typecheck
pnpm build                   # typecheck + vite build
node sim/econ.ts --runs 1000 --policy greedy|cautious|random --difficulty easy|medium|hard --starter classic|forge|suited|highroller|bargain|collector|standard --seed sim
```

The toolchain is Node 24 (runs `.ts` directly with type stripping), TypeScript 7, Vite 8 and pnpm. There are no runtime dependencies.

## Layout

```
src/engine/      pure, deterministic game logic. no DOM. this is the part that lasts
  rng.ts           seeded rng (mulberry32), pick/shuffled/chance. never Math.random in the engine
  cards.ts         Card (rank, suit, finish, stamp, tier, traits, grind...), trait helpers
  hands.ts         evaluateHand: primary hand + bonus hands from flambéed traits
  scoring.ts       appraise(): Value × Hype × 2^Grade, plus a Step list the UI animates
  forge.ts         forgePlan / autoKeep / buildForged, grindOnFold
  betting.ts       betting state machine (fold/forge/min/max → call/raise → call/fold), settle
  deck.ts          hand / pile / discard, tables: startTable, fresh deal, mulligan, cleanup, takeOut
  sleeves.ts       sleeves (run-wide upgrades) + STONKS (seeded hot rank/suit/finish)
  match.ts         THE GAME: phase state machine. newMatch / step / legal / view / pending / defaultAction / replay / check.
                   N seats in pairs, plain-JSON state, per-seat rng streams, ids from match.nextCardId. see docs/architecture.md
  match.test.ts    fuzz (2 + 10 seats), replay = live, JSON round trip, no view leaks
  twists.ts        tournament round twists (rounds 3/6/9, forced play)
  starters.ts      6 starter boxes (Rules knobs), row draft (4 rows of 8, keep 3)
  shop.ts          packs, collectible offers (no repeats until pool exhausted), restock
  collectibles.ts  the display-case pool (jokers) as data + effect hooks
  economy.ts       blinds, paycheck, interest, streaks, prices
  bot.ts           botAction(match, seat): one action at a time, same rules as people. also the sim's policies
  *.test.ts        focused tests with hand-computed expected values
src/main.ts      the UI driver. the table is the duel scene, the shop is the tabac scene, draft/packs/binder/grading are still the throwaway DOM harness
src/ui/art.ts    loads art/duel + art/cards atlases (aseprite slices), composites cards at runtime like art/cards/build.py
src/ui/duel.ts   the duel scene on one canvas: layout from art/duel/review.py, springs, idle motion, count-up, slips
src/ui/shop.ts   the tabac on one canvas: the buraliste, the offer shelf, sign, STONKS board, tickets. art from art/shop/*.py (`python art/shop/counter.py` rebuilds shop.png/json)
src/ui/font.ts   bitmap text from art/fonts (sans, tiny, didone, chalk). glyphs are text grids in art/fonts/*.txt, `python art/fonts/build.py` rebuilds (also the woff2s style.css uses for DOM text)
src/ui/sound.ts  webaudio synth sfx
sim/econ.ts      headless duel sim (your policy vs rival difficulty), the balance tool
```

## How to work here

- **The engine stays pure and deterministic.**
  - All randomness goes through `Rng`.
  - Per-round streams come from `roundRng` and the deck's `seed:round:pile` stream, so a shop restock never changes a deal. The same seed plus the same picks must replay the same run.
  - `randomSeed()` in rng.ts is the only place `Math.random` is allowed, and only to make a new seed.
- **Multiplayer reuses the engine.** It will run this same engine on a server, so don't put UI or I/O in `src/engine/`.
- **Fail loud.** Throw on impossible states, never silently default.
- **Node strips types, so:**
  - no `enum`, no `namespace`, no parameter properties
  - import local files with `.ts` extensions
- **Code style:** follow Evan's style (the `evan` skill). Keep code simple and readable, comments short and lowercase, and don't build frameworks or registries.
- **Tests:** only for real logic: hand eval, scoring, flambéing, deck, betting. Compute expected numbers by hand and write the math in the test name. Never weaken a test to make it pass.
- **Balance changes:**
  - Run the sim **before and after** for all 3 policies and the starters you touched.
  - Record the numbers in DESIGN.md.
  - Recalibrate `REF_SCORE` in `bot.ts` from the sim's "opp p50" column if rival strength changes.
- **Rule changes:** update DESIGN.md in the same change.
- **Verify UI changes in the browser preview**, and check the console for errors.
- **Commits:** only when Evan says so. Short lowercase messages, **no Claude co-author or "Generated with" lines**. Never commit scratch or AI summary files.
- **Worktrees:** the repo has commits now, so side sessions can get their own worktree. Sessions sharing this folder must never edit the same files at once. There's no dedicated engine session anymore: any agent can edit `src/engine/`, `sim/` and `src/main.ts`. The server work still owns `server/`, `deploy/`, `src/net.ts`.
- **State changes only go through `step()`.** No UI or server code mutates a `Match`. `stepInPlace` is for the headless sim only.

## Design decisions Evan has locked (don't relitigate)

- **Scoring:** named **Value / Hype / Grade / Appraisal**, never chips × mult.
- **Betting order:**
  - You lock in your cards before betting.
  - The lower bankroll acts second, and there's no reveal of the opponent's hand type.
  - Both players get the same four buttons: **Fold / Flamber / Min / Max**. The second sees the first's choice. If one went Max and the other Min, the Min player gets **Match $X / Fold**. No "Call" or "Raise" words.
- **Fold vs flambé:**
  - **Fold** grinds your highest locked card +1 Value (the meme build), and costs what you've put in.
  - **Flamber** needs at least a Pair and **costs the Max**, paid to the rival. Behind by 2× or more (same line as Peek), it costs the Min. Unavailable if it would bust you. Still being simmed against the alternatives (DESIGN.md, Decisions log).
- **Complexity rule:** every mechanic explains itself in one line where you see it, or it gets cut.
- **Flambéing, TFT style:**
  - Tiers ★1–★3, with trait slots = tier.
  - Cross-flambéing keeps traits.
  - Each hand type has a unique trait.
  - Bonus hands stack, but only when a flambéed trait is involved. Plain cards never combo.
  - **Bulk** fixes flambé thinning: every card a flambé eats beyond the first leaves a Bulk card (a weak stone card, +5 Value, no rank/suit), so flambéing never shrinks the deck. **No deck floor**, never a minimum deck size.
- **Starter boxes:** Balatro-style decks with rule twists. You draft 4 rows of 8 and keep 3, for **24-card decks**. Classic's twist: first mulligan each Table is free.
- **Tables** (DESIGN.md, Deck):
  - The rounds are **4 Tables, 12 rounds** (1–3, 4–6, 7–9, 10–12). The deck shuffles only at the start of a Table, and each Table ends in its tournament round. (Code still has 9 rounds.)
  - You're dealt a fresh hand of 8 every round. Nothing carries over.
  - You play 1–5 cards. Played cards go to the discard until the next Table, and unplayed ones go back into the pile.
  - Fold or flambé mucks your whole hand.
  - If the pile can't deal you any cards, you lose the round.
- **Mulligan:** throw back any number. They go into the pile, you redraw one fewer, and your hand size drops by 1 for the rest of the Table. There's no mulligan budget.
- **Hidden info:** the rival sees your hand size and how many times you mulliganed, never how many cards you locked.
- **Gold Border** is a side bet: +$3 on a showdown win, −$3 on a loss.
- **Sleeves** are small run-wide buffs like Balatro vouchers. One of them (Archival Sleeve) protects cards from tearing and shipping damage. One offered per Table, in the shop before the boss.
- **Win condition:** solo = bust the rival or have the chip lead after round 12, score = margin × difficulty plus a bust bonus for skipped rounds. Multiplayer = bust only.
- **Money** shows as a Balatro-style round-end tally: Pot, House, Interest.
- **Card places:** hand, deck, discard, binder, plus one card away at the grading desk for a round. Nothing else holds cards.
- **Scratchers** replace inserts: bought at the register, each gives a random insert (Code, Checklist, Wishlist, Grail) that resolves on the spot.
- **Shop:**
  - The free pack is one per shop, plain cards only.
  - Nothing repeats until the whole collectible pool has been shown, then the shopkeeper gets salty and prices go up 10%.
- **Keep these:** shopkeeper traits, the grading desk with freshness, Joker cards, knockoffs, STONKS, Repacks. Reviewers said cut them; Evan says they're what make the game unique.
- **Shopkeeper** is a posted sign of 3 seeded one-line traits, not a conversation. No rapport.
- **Grading** ships one card per shop, away for a round. The shipper picks price and risk: La Poste $2 (can come back damaged), Chronopost $4 (safe), Fourgon blindé $7 (best of two, safe).
- **Knockoffs** are a card modifier from Off-Brand packs and take the stamp slot: Crayon, Marked, Wrong Suit, and **Beer-stained** (+6 Hype, stuck to another card, drawn and played together). Bent and Counterfeit are cut.
- **Packs lean toward build lanes** (higher odds of certain card types), so restocking for your pack is a choice.
- **No live trades** (players could collude). No market ticker (STONKS replaces it).
- **Binder:**
  - Every pull goes to Deck or Binder. You keep everything you pull; there's no "keep 1–2 per pack".
  - The binder is one-way. Only rare inserts (Wishlist) move a card back.
  - You can only sell from the binder.
  - STONKS = a seeded hot rank/suit/finish each shop that multiplies binder sell prices.
- **Timers are multiplayer only:** shop 30s (45s before a tournament round). A betting timeout is Min, then Call.
- **Art direction:**
  - Everything is **pixel art**, with no CSS skins.
  - Target layout is a **Pokémon-battle perspective**: your character from behind with your hand at the bottom, the rival and their card backs across the table.
  - Cosmetics are unlockable through play, never bought.
- **Platform:** browser game. Get solo rules right first; multiplayer (async battle royale, then live 10-player) comes later as a server around the same engine. Not an MMO.

## Status (end of Mon Nov 16)

**Built:**
- the engine, sim and tests, all passing
- starter boxes with the row draft
- persistent deck
- flambéing tiers and traits with bonus hands
- 29 collectibles
- shop and packs
- betting with comeback rules
- a count-up with sound
- seeded daily runs and a local leaderboard

**Done Nov 16 (later):** solo is now a duel vs one persistent rival (easy/medium/high roller), tournament rounds 3/6/9 force a showdown with a seeded twist, paycheck only on showdown + 2× ante house bonus, deck floor 16, Thin Binder at 18. Research + reasoning: `docs/balance-and-design-report.md`.

**Built Nov 16 night:** Tables, Bulk (deck floor is gone), the Binder + STONKS, Momentum, the Gold Border side bet, Sleeves, the grading desk, a deck viewer in the test UI. Bots sort pulls and hold the binder for STONKS. `REF_SCORE` is now calibrated from every dealt hand, not showdowns. Sim numbers: DESIGN.md, Economy, "Tables sim".

**Built Nov 17:** the engine core is `match.ts` (multiplayer-ready, per docs/architecture.md section 2), `run.ts` is gone. 12 rounds, chip-lead win + margin score, sudden death past 12 for bust-only modes, flambé costs the Max (Min for a 2× underdog), 4-button betting, instant grading. Rng is sfc32 seeded by cyrb128 stream names, so every seed changed. The solo test UI and the sim both drive `step()`. 12-round sim numbers: DESIGN.md, Economy, "12-round sim".

**Built Nov 17 (afternoon):** online play in the test UI (rooms, quick match, online daily, server board), the grading desk with shippers, the Archival Sleeve, the shopkeeper sign, knockoffs, scratchers, card types (Chase, Sticker, Rookie, Jumbo) with pack lanes, Jokers (max 2 per deck), bots that ship and scratch, `REF_SCORE` recalibrated. Every slice is deployed to flambeur.example.com. Details and sim numbers: DESIGN.md, Decisions log and Economy, "Full sim pass". Still to do: the seeded golden-path demo run, saved for the very end.

**Open problems:**
- **Win condition:** surviving round 9 counts as a win even if the rival ends richer.
- **Flambé Box and Collector** still lean cautious (+3 to +7).
- **The pile never runs dry** under Tables (0 empty-pile losses in the sim), so folding early costs hand quality but never boss cards outright.
- **Greedy decks still bloat** (p50 58–76): every special pull defaults to Deck.

**Not built yet:**
- *Identity tier:* shopkeeper traits and rapport, knockoffs, Joker cards, inserts (Wishlist etc.), the rest of the collectible pool, bots that grade.
- *UI:* the pixel-art table view and cosmetics.
- *Multiplayer:* battle royale.

## Gotchas

- **Edit scripts:** Claude Code's bash safety check can block heredoc edit scripts whose text contains `.remove(`, because it reads them as a possible `rm`. Write the script to a scratch file and run it instead.
- **Stale diagnostics:** editor/LSP diagnostics are often stale after scripted edits. Trust `pnpm exec tsc --noEmit -p .`.
- **Dev server port:** the dev server uses `--strictPort` on 5174.
