# Flambeur: agent guide

Context for any agent (Claude, Codex, subagents) working in this repo. Read this, then `DESIGN.md`.

## What this is

Flambeur is Evan's entry for the **KSU AI Club Hackathon** (Nov 16–20 2026, KSU Marietta). It's entered in two tracks: **IEEE CS Game Sprint** and the **Nudox track** (most organized codebase, see Nudox below). Demo and judging are **Friday Nov 20**.

It's a Balatro-inspired **booster-pack poker roguelike** in the browser:
- **Packs:** you rip booster packs to build a small deck of playing cards. Each card can have finishes, stamps and flambéed traits.
- **Rounds:** each round you're dealt a fresh hand, lock in 1–5 cards and bet against a rival. The underdog acts second.
- **Scoring:** whoever has the higher **Appraisal = Value × Hype × 2^Grade** takes the pot.
- **Bankroll:** your money is both your life and your shop money.
- **Flambéing:** merges a hand into one stronger card, TFT style (★1–★3 tiers, traits that stack).

## Read first

| File | What it is |
|---|---|
| `docs/V2.md` | **The v2 fun rework (Nov 18), the current build spec.** Best of 3 hands, no fold, Flamber as a hand, spoils, Le Patron's marker, a rival roster, the Sleeve. It wins over DESIGN.md until DESIGN.md is rewritten to match. Its §0 is the "done when". |
| `DESIGN.md` | **The game spec and source of truth for every rule and number.** Keep it in sync with code. Being rewritten to match `docs/V2.md`, slice by slice. |
| `CLAUDE.md` | This file. How to work here. |
| `docs/ART.md` | **The art style source of truth**: rendering rules, palette, scenes, characters, cards, motion, UI. Research behind it: `docs/balatro-visual-research.md`. |
| `docs/DUEL.md` | Duel scene spec: layout, characters and the 10 masks, table, room, HUD, sprite list. |
| `docs/SHOP.md` | Shop scene spec: first-person tabac counter, the offer shelf, binder, grading window, pack rip, sprite list. |
| `docs/CARDS.md` | Card art spec for the art agent: every segmented sprite, sizes, layout, layer order, export. §0.5 = special cards are Balatro-loud, one visual channel per modifier slot. |
| `docs/UX.md` | **The UI frame (Nov 18)**: fixed zones on every screen, the corner carnet drawer (deck/binder/sleeve/vitrine/carnet), the Sleeve also as 2 cards beside the hand in a match, the rules paper, compare mode, the Fiche description box, teaching. Wins over ART/DUEL/SHOP on where UI lives. |
| `docs/ONBOARDING.md` | **Onboarding build list (Nov 19)** from the playtest and the first-run onboarding research (not in the repo): hand preview, first run seed, first-encounter tags, Fiche placement, vocabulary. Wins over UX.md §7 on teaching. |
| `docs/TUTORIAL.md` | **The tutorial (Nov 20)**: La Fée Verte guides the seeded first run (forced hand 1, then a lesson for every mechanic), comes back on lost runs, the deciding-factor box, the How to play page. Wins over ONBOARDING.md. |
| `docs/SOUND.md` | **Sound design (Nov 19)**: every event's sound, sample sources and licenses, the mixer, the chord-aware accordion count-up. |
| `docs/MUSIC.md` | **The music (Nov 19)**: "Gnossienne Flambée", Satie's Gnossienne No. 1 as a 7/4 lounge band, three synced mixes (La Table, Le Tabac, La Fée Verte) + an organ score layer, Balatro's method, made in Evan's music-lab. |
| `docs/READABILITY.md` | How interactables read: color-coded ticket buttons, outlined text, prop hover cues. Amends ART.md §13. |
| `docs/FLAMBER.md` | **The Flamber polish pass (Nov 20)**: a flambé doesn't bet, the burn at the lock, Ash, the fire. Wins over ART.md §7.8. |
| `docs/architecture.md` | The multiplayer plan (Nov 17): server, Postgres, k3s deploy, dailies, battle royale. Its engine sections predate v2. |
| `docs/SLEEVES.md` | Art spec for the run-wide upgrades (Pochettes in the game, `sleeve` in code): shelf, buy, owned. |
| `docs/V2-ART.md` | What v2 means for the art: fixes, missing sprites, new sprites, with priorities. |
| `docs/PLAYTEST-FIXES.md` | Evan's Nov 20 playthrough notes, each traced to the code with a fix and an order. Has a status section. |
| `docs/SHOP-FIXES.md` | Nov 20 tabac fixes (pack rip fan, scratchers on the shelf, sell from the classeur, grading pages, tutorial ticket, clean run state). All built. |
| `docs/archive/pitch.html` | Archived. Visual pitch page for Evan's friend. It's published on It as `pull-rate-pitch` (its old name) and is older than DESIGN.md. |
| `docs/archive/collectibles-draft.md` | Archived. An old 58-idea collectible brainstorm with a Codex review. It's superseded by DESIGN.md and `src/engine/collectibles.ts`. |

## Commands

```bash
pnpm dev                     # vite dev server (or the "flambeur" config in .claude/launch.json, port 5174)
                             # dev only: open /?quick to auto-draft straight to the first deal, /?quick&shop for the round 2 shop,
                             # /?quick&wild for a rival that bets at random (Max bets and flambés come up fast)
                             # /?first plays the seeded first run (also the golden-path demo, works in prod too)
                             # /?first&shop, /?first&big, /?first&boss (dev) play the tutorial seed up to its first shop / big shop / round 3 boss, keeping tips seen
                             # /?first&lose (dev) busts the tutorial seed on purpose, for the lost-run screen
                             # /flambe.html (dev) loops the flambé beat on a felt: 1-5 = hand, space = replay, [ ] = slow-mo
pnpm test                    # node:test, src/engine/*.test.ts
pnpm exec tsc --noEmit -p .  # typecheck
pnpm build                   # typecheck + vite build
node sim/firstseed.ts --tries 400  # seeds for the first run: classic, a pair in hand 1, a round 1 KO, an affordable collectible
node sim/econ.ts --runs 1000 --policy greedy|cautious|random|nobuy --difficulty easy|medium|hard --starter classic|forge|suited|highroller|bargain|collector|standard --seed sim
```

The toolchain is Node 24 (runs `.ts` directly with type stripping), TypeScript 7, Vite 8 and pnpm. The browser bundle has no runtime dependencies (the server uses `ws` and `pg`).

## Nudox

The Nudox track judges **codebase quality**: the code, the repo on GitHub, and the **commit history**. A cool project earns bonus points. Using Nudox is required, and the proof is a screenshot of the account's usage.

- **Use the `nudox` MCP tools** (search, show, references, graph, outline) to find symbols and callers before you grep or read whole files. Only MCP tool calls count as usage.
- **Setup:** it's installed in `~/.local/bin` and signed in with `nudox auth login`. Each machine registers the MCP server itself, in local scope (`.mcp.json` is not checked in):
  `claude mcp add nudox -s local -- ~/.local/bin/nudox-mcp --project "$PWD"`
- **Reindex** after big changes with `nudox add . --execution-intent interactive --wait`. Indexing fails with "Stale" while another session is writing files, so retry when the tree is quiet.
- **Commits** are judged too. Make one focused commit per change, with a message that says what changed.
- Nudox is in beta. Note real bugs you hit so Evan can report them.

## Layout

```
src/engine/      pure, deterministic game logic. no DOM. this is the part that lasts
  rng.ts           seeded rng (mulberry32), pick/shuffled/chance. never Math.random in the engine
  cards.ts         Card (rank, suit, finish, stamp, tier, traits, grind...), trait helpers
  hands.ts         evaluateHand: primary hand + bonus hands from flambéed traits
  scoring.ts       appraise(): Value × Hype × 2^Grade, plus a Step list the UI animates
  forge.ts         forgePlan / autoKeep / buildForged, grindCard (flamber with no pair)
  betting.ts       min/max self-bets: the opening bet and the last push (a seat that flambéd sits it out on min), settle (no fold)
  deck.ts          hand / pile / discard: shuffle every round, draw, refill, cleanup
  sleeves.ts       pochettes (run-wide upgrades, ids say sleeve) + STONKS (seeded hot rank/suit/finish)
  match.ts         THE GAME: phase state machine. newMatch / step / legal / view / pending / defaultAction / replay / check.
                   N seats in pairs, plain-JSON state, per-seat rng streams, ids from match.nextCardId. see docs/architecture.md
  match.test.ts    fuzz (2 + 10 seats), replay = live, JSON round trip, no view leaks
  round.test.ts    v2 rules by hand: best of 3, knockout, flamber, self-bets, marker, rival bust, spoils, inserts, scoring order
  twists.ts        boss twists (rounds 3/6/9/12)
  starters.ts      6 starter boxes + standard (sim only) as Rules knobs, full 2–A decks, row draft (4 rows of 6, keep 3 = 18)
  shop.ts          small/big shop stock, packs, collectible offers (no repeats until pool exhausted), restock,
                   the 13 inserts (INSERTS), spoils cards, the shopkeeper sign
  collectibles.ts  the display-case pool as data + effect hooks, left to right, the 10 ×Hype payoffs
  rivals.ts        the 10 solo rivals as data (lane deck, upgrades, case by Table), buildRival, rivalOrder
  economy.ts       blinds, knockout K, house/KO/momentum/skip, interest, le patron's marker, rival stacks, prices
  bot.ts           botAction(match, seat): one action at a time, same rules as people. also the sim's policies
                   (greedy/cautious/random/nobuy) and REF_SCORE (rival p50 per hand)
  *.test.ts        focused tests with hand-computed expected values
src/main.ts      the UI driver. the table is the duel scene, the shop is the tabac scene. draft, starter box, results, packs, binder,
                 grading, Sleeve, Vitrine and forge pick are canvas panels (src/ui/panels.ts). no DOM screens left. dev: /?quick&big = first big shop, /?quick&auto = your seat plays itself to the end (&burn: it flambés every pair)
src/ui/art.ts    loads art/duel + art/cards atlases (aseprite slices), composites cards at runtime like art/cards/build.py
src/ui/duel.ts   the duel scene on one canvas: layout from art/duel/review.py, springs, idle motion, count-up, slips
src/ui/shop.ts   the tabac on one canvas: the buraliste, the offer shelf, sign, STONKS board, tickets, le patron + the scouting dossier
                 (big shop), the Sleeve on the zinc. art from art/shop/*.py (`python art/shop/counter.py` rebuilds shop.png/json)
src/ui/frame.ts  the run strip and the announcement band, shared by both scenes
src/ui/drawer.ts the corner carnet drawer (deck/binder/sleeve/vitrine/carnet) and compare mode (UX.md)
src/ui/fiche.ts  the description box on every hover, text from src/engine/glossary.ts
src/ui/tips.ts   first-encounter tags (docs/ONBOARDING.md): one pinned line the first time a thing is usable. in the tutorial
                 la fée says them (docs/TUTORIAL.md): pages, her voice, the spotlight of the forced first hand
src/ui/fee.ts    la fée verte's placeholder sprite (a text grid) and her flight
src/ui/fire.ts   the title logo's fire, live: heat field, ramp paint, a card's burn front, embers (docs/FLAMBER.md §3)
src/ui/flambe.ts the flambé beat: cards burn down to the ★ card and Ash, the grind's heat and quench (FLAMBER.md §2)
src/dev/flambe-lab.ts  dev page /flambe.html: the beat looping on a felt with fixed hands (space, 1-5, [ ], click)
src/ui/rules.ts  the rules columns (hand chart, how a hand works) the carnet's Rules tab draws
src/ui/placeholders.ts  insertFace / insertMark: the sprite ids for an insert's face and its scratcher symbol
src/ui/collectibles.ts  collectible art on the vitrine
src/ui/album.ts  every card and modifier pulled, across runs, in this browser. the binder's Album page draws it
src/ui/cursor.ts the pixel cursor (arrow + pointing hand) from text grids. the pause menu turns it off
src/ui/held.ts   a card as you hold it: turn, drop shadow, finish sheen. the duel hand, the pack rip and hover pops draw through it
src/ui/ink.ts    the color language (ART.md): one meaning per color, a modifier wears the color of the stat it feeds
src/ui/lanes.ts  rival id -> its lane icon sprite
src/ui/lang.ts   french / english: the word table every printed string runs through. english by default, french words glint
src/ui/logo.ts   the title logo: reels lock in, the word catches fire, then the idle loop
src/ui/motion.ts springs, easing and normalized time for canvas sequences, reduce motion
src/ui/music.ts  gnossienne flambée in three lockstep mixes plus the organ hype layer (docs/MUSIC.md)
src/ui/pause.ts  the pause menu (Esc): every setting on one felt panel
src/ui/pile.ts   la pile: the deck as ruled notebook lines by rank, suit or type (the carnet and the compare dock)
src/ui/prefs.ts  the player's settings: one object, one localStorage key
src/ui/spoils.ts the spoils pick: the picked card flies to its seat, the last card burns
src/ui/ticket.ts the raffle ticket every button is (READABILITY.md §5), one renderer for every scene
src/ui/title.ts  the title: one tall world you pan down through (street, cellar, sewers)
src/ui/font.ts   bitmap text from art/fonts (sans, tiny, didone, chalk). glyphs are text grids in art/fonts/*.txt, `python art/fonts/build.py` rebuilds (also the woff2s style.css uses for DOM text)
src/ui/sound.ts  all the sound (docs/SOUND.md): mixer + limiter, the sample atlas from art/sfx (`python art/sfx/build.py` rebuilds it
                 from sounds.txt), accordion count-up in key with the music, speaker blips, ambience, volume (pause menu, M mutes)
sim/econ.ts      headless duel sim (your policy vs rival difficulty), the balance tool. prints decisions/hands/KO per round, round-12 reach,
                 shop share, marker misses and REF_SCORE
```

## How to work here

- **Big changes are welcome** (Evan, Nov 18). Don't shrink a redesign, rewrite or engine change because of the deadline, and don't steer toward the "safe" option for scope reasons. Evan will put in the extra work. That holds through demo day and up to launch.
- **The engine stays pure and deterministic.**
  - All randomness goes through `Rng`.
  - Per-round streams come from `seatRngs` in match.ts (`seed:round:seat:pile`, `:shop`, `:table`), so a shop restock never changes a deal. The same seed plus the same picks must replay the same run.
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
  - Both players get the same buttons: **Play / Flamber / Discard** to lock, then **Min / Max** to bet. The second sees the first's choice. Max is a bet on yourself: win the round and the House pays it, lose and the rival takes it. There's no fold and no "Call" or "Raise" words.
- **No fold, Flamber is a hand** (V2.md §5, FLAMBER.md §1b):
  - **Flamber** throws the hand you locked. A pair or better merges into a ★ card that goes straight into your cards. No pair grinds one locked card you pick +1 Value (the old fold, the meme build).
  - No money cost. The price is one of your three hands, and a thrown hand can't be knocked out.
  - **A flambé doesn't bet.** That seat sits the stage out on Min, and the rival sees it like a chosen Min.
- **Complexity rule:** every mechanic explains itself in one line where you see it, or it gets cut.
- **Flambéing, TFT style:**
  - Tiers ★1–★3, with trait slots = tier.
  - Cross-flambéing keeps traits.
  - Each hand type has a unique trait.
  - Bonus hands stack, but only when a flambéed trait is involved. Plain cards never combo.
  - **Ash** fixes flambé thinning: every card a flambé eats beyond the first leaves an Ash card (a burnt card, +5 Value, no rank/suit), so flambéing never shrinks the deck. **No deck floor**, never a minimum deck size.
- **Starter boxes:** Balatro-style decks with rule twists. Each is a full 2–A deck dealt into 4 rows of 6, and you keep 3, for **18-card decks**. Classic's twist: 4 discards a round instead of 3.
- **Tables** (DESIGN.md, Run and A round):
  - The rounds are **4 Tables, 12 rounds** (1–3, 4–6, 7–9, 10–12). Each Table is one rival and ends in its boss round (3, 6, 9, 12).
  - A round is best of 3 hands. The whole deck shuffles at the start of every round and you're dealt 8. Nothing carries over.
  - You play 1–5 cards a hand. Played and discarded cards go to the discard for the rest of the round, unplayed ones stay in your hand, and you refill to your hand size after each hand. At the end of the round everything goes back into the deck.
  - A flambé throws only the cards you locked. The ★ card (or the ground card) comes back to your cards.
  - A hand you can't play because you have no cards counts as a thrown hand.
- **Discards, not mulligans:** before you lock, toss 1–5 cards and draw that many. 3 discards a round in total (Classic 4, Cold Deck none). Mulligans are cut.
- **Hidden info:** the rival sees your card count, discards used and how many inserts are in your Sleeve. Never what you locked or which inserts. Marked knockoffs still show face up once locked.
- **Gold Border** is a side bet, once per round: played in any hand, +$3 if you win the round, −$3 if you lose it.
- **Pochettes** (code ids say `sleeve`) are small run-wide buffs like Balatro vouchers. One of them (Pochette Archive) protects cards from tearing and shipping damage. One is offered in each big shop, between Tables, for $10. **The Sleeve** is now your 2 insert slots.
- **Win condition:** solo = pay Le Patron's final payment after round 12, score = your bankroll after it × difficulty (Easy 1, Medium 1.5, High Roller 2). Busting a rival ends its Table early and pays 2× ante per skipped round. Lose = go bust or miss a payment. Duel = both pay off, the higher bankroll wins. Battle royale = last one standing.
- **Money** shows as a Balatro-style round-end tally: Pot, House, KO, Momentum, Interest, Extras, Skip.
- **Card places:** hand, deck, discard, binder, plus one card away at the grading desk for a round. Nothing else holds cards.
- **Scratchers** are how you get inserts: bought in the shop, each scratches one of the 13 inserts (`INSERTS` in shop.ts) into your Sleeve. Grail resolves on the spot and never takes a slot.
- **Shop:**
  - The free pack is cut. Spoils replace it: 3 cards on the table after each round, the loser picks first, the last one burns.
  - Nothing repeats until the whole collectible pool has been shown, then the shopkeeper gets salty and prices go up 10%.
- **Keep these:** shopkeeper traits, the grading desk with freshness, Joker cards, knockoffs, STONKS, Repacks. Reviewers said cut them; Evan says they're what make the game unique.
- **Shopkeeper** is a posted sign of 3 seeded one-line traits, not a conversation. No rapport.
- **Grading** ships one card per shop visit that has the desk (a Table's 1st small shop and every big shop), away until the next shop. The shipper picks price and risk: La Poste $2 (can come back damaged), Chronopost $4 (safe), Fourgon blindé $7 (best of two, safe).
- **Knockoffs** are a card modifier from Off-Brand packs and take the stamp slot: Crayon, Marked, Wrong Suit, and **Beer-stained** (+6 Hype, stuck to another card, drawn and played together). Bent and Counterfeit are cut.
- **Packs lean toward build lanes** (higher odds of certain card types), so restocking for your pack is a choice.
- **No live trades** (players could collude). No market ticker (STONKS replaces it).
- **Binder:**
  - Every pull goes to Deck or Binder. You keep everything you pull; there's no "keep 1–2 per pack".
  - The binder is one-way. Only rare inserts (Wishlist) move a card back.
  - You can only sell from the binder.
  - STONKS = a seeded hot rank/suit/finish each shop that multiplies binder sell prices.
- **Timers are multiplayer only** (`PHASE_MS` in server/actor.ts): draft 45s, each hand's lock 20s, bet 10s, spoils 10s, shop 20s (45s for the big shop). A betting timeout is Min.
- **Art direction:**
  - Everything is **pixel art**, with no CSS skins.
  - Target layout is a **Pokémon-battle perspective**: your character from behind with your hand at the bottom, the rival and their card backs across the table.
  - Cosmetics are unlockable through play, never bought.
  - Special cards are as visually distinct as Balatro's: card types change the whole frame, not a corner badge (CARDS.md §0.5).
- **Platform:** browser game. Get solo rules right first; multiplayer (async battle royale, then live 10-player) comes later as a server around the same engine. Not an MMO.

## Status (Fri Nov 20)

**v2 is built** (`docs/V2.md` slices 1–10, rules in DESIGN.md): best of 3 hands with refill and discards, knockout, Max as a self-bet plus the last push, no fold, Flamber as a hand, a reshuffle every round, Le Patron's marker, the 10-rival roster with stacks and lane builds, spoils, small/big shops with rotating services, the Sleeve with 13 inserts, 2–A starter boxes (rows of 6, keep 3 = 18), ordered ×Hype scoring with the 10 payoffs and Ash Bucket, the §15 rewrites, bots for all of it (`nobuy` added), the new sim metrics, and the UI for every new piece.

**Sim, greedy vs Medium, Classic, 1000 runs:** see DESIGN.md, Tuning. Every §0 target hits except shop share (~47% vs ≤ 40%, explained there). Tuned: knockout K 6/8/10/12, rival upgrades 3 per Table, `REF_SCORE` per hand.

**Verified (Nov 18):** tests, typecheck and build pass. A full `/?quick&auto` run in headless Chromium (draft → round 12 → results) throws nothing; Play/Flamber/Discard, bets, reveal, tally, spoils and both shops checked by hand. Only console noise: `/api/me` 502 with no game server running.

**UX frame (docs/UX.md) is built:** run strip, carnet drawer in both scenes, Fiche on every hover with glossary text, compare mode on pack sort/spoils/draft, Sleeve inserts beside the hand, rules paper, one announcement band, every screen on canvas. A full `/?quick&auto` and `/?quick&wild&auto` run clean.

**Since then (Nov 18–20):**
- **French / English:** an FR · EN chip, english by default, french words glint (`src/ui/lang.ts`).
- **The Album:** every card and modifier you've pulled, across runs (`src/ui/album.ts`, the binder's Album page).
- **Sound and music:** the sample atlas, mixer and limiter, the accordion count-up in key, Gnossienne Flambée in three synced mixes. Near-miss margins on a lost hand or round, and the god pull: a pack rip holds its rarest card for last, with a heartbeat.
- **Pause menu** (Esc): sound, game speed, motion, accessibility, saved prefs, the pixel cursor, abandon run.
- **Ticket buttons:** real pixel art for every button, one renderer in every scene (`src/ui/ticket.ts`).
- **Ash:** Bulk is renamed Ash (ids stay `bulk`), with new burnt card art and the Ashtray.
- **Flamber:** a flambé doesn't bet, and the flambé beat burns your cards at the lock (`src/ui/flambe.ts`, `src/ui/fire.ts`, dev lab at `/flambe.html`).
- **La pile:** the deck view as ruled notebook lines by rank, suit or type.
- **The tutorial:** La Fée Verte guides the seeded first run (`/?first`, also the golden-path demo), with a forced first hand and a lesson the first time each thing shows up.
- The playtest fixes (docs/PLAYTEST-FIXES.md has the status), the shop fixes (docs/SHOP-FIXES.md, all built), the redrawn title world and real insert card art.

**Open problems:**
- **Shop share** of the greedy bot's actions is ~47%.
- **High Roller difficulty is a wall** (greedy wins 5.5% vs it, 56.8% vs Medium). Not the High Roller starter box, which wins 70.7% vs Medium.
- **Not built:** Deuces Wild (optional twist), cosmetics (V2.md §17).
- **Multiplayer:** the server runs the v2 engine, but online play hasn't been retested on it.

## Gotchas

- **Edit scripts:** Claude Code's bash safety check can block heredoc edit scripts whose text contains `.remove(`, because it reads them as a possible `rm`. Write the script to a scratch file and run it instead.
- **Stale diagnostics:** editor/LSP diagnostics are often stale after scripted edits. Trust `pnpm exec tsc --noEmit -p .`.
- **Dev server port:** the dev server uses `--strictPort` on 5174.
