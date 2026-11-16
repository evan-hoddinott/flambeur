# Pull Rate: agent guide

Context for any agent (Claude, Codex, subagents) working in this repo. Read this, then `DESIGN.md`.

## What this is

Pull Rate is Evan's entry for the **KSU AI Club Hackathon** (Nov 16–20 2026, KSU Marietta). It's entered in two tracks: **IEEE AI Game Sprint** and **Nudox game track**. Demo and judging are **Friday Nov 20**.

It's a Balatro-inspired **booster-pack poker roguelike** in the browser:
- **Packs:** you rip booster packs to build a small deck of playing cards. Each card can have finishes, stamps and forged traits.
- **Rounds:** each round you lock in 5 cards and bet against a rival. The underdog acts second.
- **Scoring:** whoever has the higher **Appraisal = Value × Hype × 2^Grade** takes the pot.
- **Bankroll:** your money is both your life and your shop money.
- **Forging:** merges a hand into one stronger card, TFT style (★1–★3 tiers, traits that stack).

## Read first

| File | What it is |
|---|---|
| `DESIGN.md` | **The game spec and source of truth for every rule and number.** Keep it in sync with code. |
| `CLAUDE.md` | This file. How to work here. |
| `pitch.html` | Visual pitch page for Evan's friend. It's published on It as `pull-rate-pitch` and is older than DESIGN.md. |
| `collectibles-draft.md` | An old 58-idea collectible brainstorm with a Codex review. It's superseded by DESIGN.md and `src/engine/collectibles.ts`. |

## Commands

```bash
pnpm dev                     # vite dev server (or the "pull-rate" config in .claude/launch.json, port 5174)
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
  hands.ts         evaluateHand: primary hand + bonus hands from forged traits
  scoring.ts       appraise(): Value × Hype × 2^Grade, plus a Step list the UI animates
  forge.ts         forgePlan / autoKeep / buildForged, grindOnFold
  betting.ts       betting state machine (fold/forge/min/max → call/raise → call/fold), settle
  deck.ts          hand / draw / discard piles, refill, mulligan, reshuffle, 12-card floor
  run.ts           Run + Player, the persistent rival + difficulty, rounds, finishRound (both seats), income
  twists.ts        tournament round twists (rounds 3/6/9, forced play)
  starters.ts      6 starter boxes (Rules knobs), row draft (4 rows of 8, keep 3)
  shop.ts          packs, collectible offers (no repeats until pool exhausted), restock
  collectibles.ts  the display-case pool (jokers) as data + effect hooks
  economy.ts       blinds, paycheck, interest, streaks, prices
  bot.ts           bot policy, shop and deal for the rival and the sim player
  *.test.ts        focused tests with hand-computed expected values
src/main.ts      vanilla DOM UI. THROWAWAY test harness, gets rebuilt as pixel art
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
- **Tests:** only for real logic: hand eval, scoring, forging, deck, betting. Compute expected numbers by hand and write the math in the test name. Never weaken a test to make it pass.
- **Balance changes:**
  - Run the sim **before and after** for all 3 policies and the starters you touched.
  - Record the numbers in DESIGN.md.
  - Recalibrate `REF_SCORE` in `bot.ts` from the sim's "opp p50" column if rival strength changes.
- **Rule changes:** update DESIGN.md in the same change.
- **Verify UI changes in the browser preview**, and check the console for errors.
- **Commits:** only when Evan says so. Short lowercase messages, **no Claude co-author or "Generated with" lines**. Never commit scratch or AI summary files.
- **Worktrees:** the repo has **no commits yet**, so a git worktree would be empty. Side sessions share this folder, and two writers must never edit the same files at once.

## Design decisions Evan has locked (don't relitigate)

- **Scoring:** named **Value / Hype / Grade / Appraisal**, never chips × mult.
- **Betting order:**
  - You lock in your cards before betting.
  - The lower bankroll acts second, and there's no reveal of the opponent's hand type.
  - The options are Fold / Forge / Min / Max, then Call / Raise, then Call / Fold.
- **Fold vs forge:**
  - **Fold** grinds your highest locked card +1 Value (the meme build).
  - **Forge** needs at least a Pair.
  - Both cost what you've put in.
- **Forging, TFT style:**
  - Tiers ★1–★3, with trait slots = tier.
  - Cross-forging keeps traits.
  - Each hand type has a unique trait.
  - Bonus hands stack, but only when a forged trait is involved. Plain cards never combo.
- **Starter boxes:** Balatro-style decks with rule twists. You draft 4 rows of 8 and keep 3, for **24-card decks**. The deck floor is 12.
- **Deck cycling:** the draw pile persists between rounds, unplayed cards carry over, and the discard reshuffles when the pile runs out.
- **One mulligan per round** (Classic gets 2). You draw 8 and play 5.
- **Shop:**
  - The free pack is one per shop, plain cards only.
  - Nothing repeats until the whole collectible pool has been shown, then the shopkeeper gets salty and prices go up 10%.
- **Keep these:** shopkeeper traits and rapport, the grading desk with freshness, Joker cards, knockoffs, STONKS, Repacks. Reviewers said cut them; Evan says they're what make the game unique.
- **No live trades** (players could collude). No market ticker (STONKS replaces it).
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
- forging tiers and traits with bonus hands
- 29 collectibles
- shop and packs
- betting with comeback rules
- a count-up with sound
- seeded daily runs and a local leaderboard

**Done Nov 16 (later):** solo is now a duel vs one persistent rival (easy/medium/high roller), tournament rounds 3/6/9 force a showdown with a seeded twist, paycheck only on showdown + 2× ante house bonus, deck floor 16, Thin Binder at 18. Research + reasoning: `docs/balance-and-design-report.md`.

**Open problems:**
- **Forge Box and Collector on Hard** still lean cautious (+7 to +11). Forge Hammer makes forge-thinning strong.
- **Easy is very easy** (91–98% win).
- **Greedy decks bloat** from packs and barely cycle. Planned: keep 1–2 cards per pack.

**Not built yet:**
- *Identity tier:* grading desk, shopkeeper traits and rapport, knockoffs, Joker cards, STONKS, tournament rounds, the rest of the collectible pool, the deck viewer UI.
- *UI:* the pixel-art table view and cosmetics.
- *Multiplayer:* battle royale.

## Gotchas

- **Edit scripts:** Claude Code's bash safety check can block heredoc edit scripts whose text contains `.remove(`, because it reads them as a possible `rm`. Write the script to a scratch file and run it instead.
- **Stale diagnostics:** editor/LSP diagnostics are often stale after scripted edits. Trust `pnpm exec tsc --noEmit -p .`.
- **Dev server port:** the dev server uses `--strictPort` on 5174.
