# Pull Rate design (v1)

Booster-pack poker roguelike for the KSU AI Hackathon (IEEE AI Game Sprint + Nudox). Browser game.
Numbers here are first-pass. The econ sim (`sim/econ.ts`) is how we tune them, not guessing.

Sim baseline: see the duel table in Economy. Run `node sim/econ.ts --starter classic --policy greedy --difficulty medium`.
Known issue: cautious (fold a lot, never buy packs) used to beat greedy by 10–25 points. The duel + showdown-only paycheck brought it to roughly even (see Economy). Forge Box and Collector on Hard still lean cautious.

## Run

- Solo is a **1v1 duel against one persistent rival** who plays by the same rules you do: it opens its own starter box (seeded), drafts, shops, forges and gets paid. Same rules as multiplayer, so the engine and balance carry over.
- Daily seed = everyone gets the same rival with the same draws. "Random seed" for more runs.
- 9 rounds. You win by surviving round 9 **or busting the rival**. You lose at $0.
- **Difficulty** is picked once per run (rival bot + head start):
  - **Easy**: tight bot, never buys packs. Score ×1.
  - **Medium**: the regular. Score ×1.5.
  - **High Roller (Hard)**: sharper bot, starts with +$10 and a random rare collectible. Score ×2.
- Score = final bankroll × difficulty (0 if you bust). Leaderboards are per seed per difficulty.
- Rounds 3, 6, 9 are **Tournament rounds** (rule twist, see below). Round 9 is the **Final Table**.
- Bankroll hits $0 = run over. If you can't cover the ante you go all-in.
- Every run has a visible seed. Daily seed = same seed for everyone that day.

## Starter boxes

The run opens by ripping a **Starter Box** that offers 3 of these (seeded, so a daily run offers everyone the same 3). Like Balatro's decks, each one bends a rule. Code: `src/engine/starters.ts`.

Every box holds **32 cards**. After you pick a box it's dealt (seeded by the run seed) into **4 rows of 8**, and you **keep 3 rows = 24-card starting deck**. Each row gets a short label hinting at what it's good for: `pair-heavy`, `suited ♥`, `high cards`, `low cards`, `connected`, or `mixed` (max 2 tags, thresholds are about 2 above what a random row of 8 averages).

**Special cards** (Forge Box Twins, Bargain Damaged, Collector Foils) each land in a **different row**. So any pick keeps all but at most one of them, and dropping one costs you its whole row. Dropping a special is a real choice, not bad luck.

| Box | Box contents (32) | Twist |
|---|---|---|
| Classic | 7 through A | 2 mulligans per round |
| Forge Box | 7 through A, a Q★ Twin and K★ Twin swapped in | Starts with Forge Hammer in the case |
| Suited | 7 through A in ♥ and ♠, two copies of each | Flush scores −2 Hype |
| High Roller | 7 through A | Start with $30, every ante and max +$1 |
| Bargain Bin | 7 through A, 3 Damaged | Every paid pack costs $1 less |
| Collector | 8 through A (28) + 4 Foil copies of random cards from it | Only 4 display slots |

Suited used to be 2 through A (26) and Collector 8 through A with 4 of them Foil (28). Both got padded to 32 for the draft: Suited went to two copies of 7–A so it matches the other boxes' ranks (more pairs, still only 2 suits), Collector keeps its 8–A identity and the 4 Foils became extra copies instead of swaps.

The rival's box is `pick(OFFERED)` from `seed:rival`, it drafts with `autoDraft` (drop the weakest row). The old 52-card deck is kept as `standard` in the sim only (drafts 3 rows of 13 = 39).

Forge Box first had "forging costs half your stake" and that hit 98% for cautious, so it got the starting Forge Hammer instead.

## Round flow

1. **Shop** (skipped before round 1, you start with a free pack instead).
2. **Draw up to 8.** Cards you didn't play last round are still in your hand; top up from your draw pile (see Deck). One **mulligan** per round: discard any number, redraw that many.
3. **Lock in 5 cards.** Both players lock at the same time. Locked cards can't change.
4. **Ante** is paid automatically (the round's Min).
5. **Betting.** The player with the lower bankroll acts **second** (tie: alternate, player first on odd rounds).
   - First player: `Fold` / `Forge` / `Min` / `Max`.
   - Second player sees that, then: `Fold` / `Forge` / `Call` / `Raise` (raise only if first bet Min, raises to Max).
   - After a raise the first player can only `Call` or `Fold`. Max 3 steps.
6. **Showdown** if nobody folded. Both appraisals count up side by side, then reveal. Winner takes the matched bet from the loser. Tie = nobody pays beyond the ante.
7. Fold or Forge: you lose what you've put in (the ante, or Min if you fold after a raise). Opponent takes it.
   - **Fold** also grinds your highest locked card: same card, **+1 Value forever** (the meme build). That's the only thing a fold gives back.
   - **Forge** needs at least a Pair. It's the real merge (below).
8. Your 5 locked cards go to the discard pile whatever happened (forged ones are gone, torn ones are gone). The other 3 stay in your hand for next round.

## Deck

Balatro-style cycling. Code: `src/engine/deck.ts`.

- Your deck is three piles that persist for the whole run: **hand**, **draw pile**, **discard pile**. Deck size = all three.
- Start of a round: keep what's in hand, draw from the top until you have 8 (9 with Deck Box).
- Played and mulliganed cards go to discard. Mulliganed cards hit the discard *after* the redraw, so you only get them straight back if the rest of the deck is empty.
- Draw pile empty (start of round, or halfway through a draw or mulligan): **reshuffle** the discard into the draw pile and keep drawing. The UI logs it.
- Cards from packs and newly forged cards are **shuffled into the draw pile** at a random spot. Forged-away and torn cards leave the deck for good.
- Gold Border pays +$2 every round it's still in your hand at round end, so holding one across rounds keeps paying (and keeps costing you a hand slot).
- **Deck floor: 16** (was 12). A forge that would leave fewer than 16 cards isn't offered ("deck too thin to forge"). A Damaged card can't tear while the deck is at 16. At 12 the cautious bot forged its deck down to 12 supercards and won on that.
- Rng: all pile shuffles use one stream per round (`seed:round:pile`), reset at the start of each round, so a shop restock never changes what you draw. Same seed + same picks = same draws.
- Deck viewer: `drawPileView()` returns the draw pile sorted, plus counts by rank and by suit.

Thin Binder is now "+1 Grade if your deck has 18 or fewer cards" (was 24, which was on from round 1).

### Before / after (sim)

Win rate (survived round 9), 1000 runs each, seed `sim`. Before = 26–32 card decks reshuffled every round. After = row draft to 24, persistent draw pile, floor 12.

| Box | greedy before → after | cautious before → after | random before → after |
|---|---|---|---|
| Classic | 44.1 → 47.7 | 76.1 → 65.6 | 19.1 → 22.0 |
| Forge Box | 51.7 → 57.6 | 86.5 → 88.1 | 23.6 → 27.8 |
| Suited | 47.1 → 52.3 | 71.6 → 69.5 | 20.5 → 22.7 |
| High Roller | 49.6 → 58.6 | 84.0 → 77.4 | 26.4 → 28.9 |
| Bargain Bin | 60.7 → 67.7 | 81.5 → 76.6 | 28.0 → 33.3 |
| Collector | 46.6 → 55.3 | 85.7 → 79.7 | 22.5 → 26.3 |

- Greedy is up 4–9 points everywhere: smaller decks + carry-over mean the cards you bought show up more.
- Cautious is down on most boxes. It forges every weak hand (forge is its fold), so it grinds its deck down to the floor (final deck p50 = 12–13) and then gets blocked thousands of times. The floor is doing its job: forge-as-free-fold is capped.
- Cautious still beats greedy, but the gap went from ~25–40 points to ~10–30.
- Reshuffles per run: greedy/random 0.2–0.9 (decks grow from packs), cautious ~3–4 (deck at the floor cycles fast).

### Forge

Forge is a fold that merges every card that scored into one forged card (code: `src/engine/forge.ts`). It needs at least a Pair; High Card can't be forged, folding grinds instead (`grindOnFold`).

| Forge a… | Trait | The forged card… |
|---|---|---|
| High Card | can't forge. **Folding** does the grind | your highest locked card gets +1 Value forever, no star |
| Pair | Twin | counts as 2 of its rank |
| Two Pair | Split | also counts as one of the other pair's rank |
| Trips | Triplet | counts as 3 of its rank |
| Straight | Bridge | counts as any rank inside a straight |
| Flush | Wild Suit | counts as every suit |
| Full House | Household | is a full house by itself |
| Quads | Quad | counts as 4 of its rank |
| Straight Flush | Bridge + Wild Suit | both |
| Royal Flush | Crown | bridge + wild + permanent +1 Grade |

- **Tiers (TFT style):** new tier = highest tier merged + 1, max ★3. ★2 scores +5 Hype, ★3 +10 Hype and +1 Grade.
- **Cross forge:** the new card keeps the traits of forged cards it ate, plus traits for the primary and any bonus hands. It takes the rank/suit of the highest-tier forged card eaten.
- **Trait slots = tier.** Over the cap the player picks which to keep.
- A lone forged card can't re-forge itself. Stamps and 1st Edition growth don't carry through a forge; the best Finish does.

### Bonus hands

Primary hand = best hand with forged traits. Hands from the other families (rank, straight, flush) stack on top as **bonus hands**, but only if a forged trait made the primary or that bonus hand happen. Plain cards never combo. Every hand's base Value/Hype stacks, card Value counts once.

## Scoring: Appraisal

```
Value = hand base Value + sum of scored cards' Value + bonuses
Hype  = hand base Hype + bonuses
Appraisal = Value × Hype × 2^Grade
```

- **Value** (was chips): card values 2–10 face, J/Q/K = 10, A = 11.
- **Hype** (was mult): additive. Commons mostly add Value/Hype.
- **Grade**: starts at 0. Each +1 Grade **doubles** the appraisal. Rare, from Gem Mint, Prism, rares. This is where jackpots break the game, on purpose.
- Only the cards that make the poker hand score (kickers don't).

| Hand | Base Value | Base Hype |
|---|---|---|
| High Card | 5 | 1 |
| Pair | 10 | 2 |
| Two Pair | 20 | 2 |
| Three of a Kind | 30 | 3 |
| Straight | 35 | 4 |
| Flush | 35 | 4 |
| Full House | 45 | 4 |
| Four of a Kind | 60 | 7 |
| Straight Flush | 100 | 8 |
| Royal Flush | 150 | 10 |

Code Cards raise a hand's level: +15 Value, +1 Hype per level.

## Economy

| Round | Ante (Min) | Max |
|---|---|---|
| 1 | 2 | 5 |
| 2 | 3 | 6 |
| 3 (T) | 4 | 8 |
| 4 | 5 | 10 |
| 5 | 6 | 12 |
| 6 (T) | 8 | 16 |
| 7 | 10 | 20 |
| 8 | 12 | 25 |
| 9 (Final) | 15 | 30 |

- Start: **$15**.
- After each round: **Paycheck +$2 only if you went to showdown** (fold/forge rounds don't get paid), **House bonus: the showdown winner gets 2× the ante** on top of the pot, **Interest +$1 per $10** held (max +$2), **streak bonus**. All of it comes from the house, so it's the same rule in multiplayer.
- Why: before this, paycheck + interest + selling the free pack was ~$7/round no matter what, more than the ante through round 5. Folding every hand was break-even, so the cautious bot won by never playing. Balatro does the same thing: blind rewards are most of your income, interest is a capped bonus.
- **Hot Streak**: +$1 per consecutive win (max +$3). **Cold Streak**: +$1 per consecutive showdown loss (max +$3). Fold/Forge **resets** your streak (otherwise folding every round farms the cold streak).
- **Comeback**: lower bankroll acts second. Behind by 2× or more: **Peek** at 1 of the leader's locked cards before betting.

### Duel sim (Nov 16)

Win rate %, 1000 runs each, seed `sim`, your policy vs rival difficulty. Before = duel with the old economy (paycheck every round, no house bonus, floor 12, old easy bot). After = showdown-only paycheck, 2× ante house bonus, floor 16, new easy bot, `REF_SCORE` recalibrated.

| Box | Rival | greedy before → after | cautious before → after | random before → after |
|---|---|---|---|---|
| Classic | Easy | 94.3 → 91.2 | 99.2 → 95.6 | 88.2 → 79.9 |
| Classic | Medium | 62.6 → 63.7 | 65.0 → 58.5 | 41.9 → 42.7 |
| Classic | Hard | 47.3 → 52.4 | 60.5 → 52.9 | 28.3 → 30.4 |
| Forge Box | Medium | 69.7 → 71.3 | 82.4 → 74.1 | 44.2 → 49.9 |
| Forge Box | Hard | 53.5 → 60.7 | 75.1 → 71.9 | 36.1 → 40.2 |
| Suited | Medium | 63.6 → 64.1 | 71.7 → 64.8 | 43.7 → 46.3 |
| Suited | Hard | 49.8 → 55.5 | 65.4 → 59.0 | 29.8 → 31.9 |
| High Roller | Medium | 75.9 → 76.3 | 76.4 → 70.6 | 54.8 → 55.9 |
| High Roller | Hard | 56.6 → 64.7 | 70.7 → 65.4 | 38.6 → 44.3 |
| Bargain Bin | Medium | 79.6 → 79.5 | 76.7 → 70.9 | 56.5 → 59.2 |
| Bargain Bin | Hard | 63.9 → 69.1 | 69.4 → 67.1 | 45.1 → 47.1 |
| Collector | Medium | 67.9 → 68.8 | 77.6 → 71.5 | 47.7 → 50.5 |
| Collector | Hard | 50.6 → 57.7 | 71.3 → 65.1 | 32.1 → 38.4 |

Easy after: 91–95 greedy, 96–98 cautious on every box.

- The gap between cautious and greedy went from 3–22 points to −8 to +11. Greedy now wins or ties on Classic, Bargain and High Roller.
- **Forge Box and Collector on Hard** still lean cautious (+11, +7). Forge Hammer makes forge-thinning strong even at floor 16.
- **Easy is very easy** (91–98%). Fine for a first run, could use a slightly sharper bot.
- Greedy decks still bloat (p90 ~70–80 cards). Pick 1–2 per pack is the planned fix.
- Before this pass, `REF_SCORE` was calibrated against the old fresh-every-round rival. Recalibrating made rivals bet looser, which helped cautious about 5–10 points. Before the recalibration, Classic was greedy 62.3 / cautious 47.7 on Medium.

### Prices

| Thing | Cost | Sells for |
|---|---|---|
| Free pack (1 per shop, 3 plain cards) | $0 | $1 per card |
| Off-Brand pack (5) | $3 | |
| Repack (4) | $4 | |
| Collector pack (3 cards, insert, rare) | $6 | |
| Collectible C / U / R | $4 / $6 / $9 | half price |
| Card with a Finish | | $2 |
| Graded card | | grade ÷ 2 |
| Restock | $1, $2, $3… (resets each shop) | |
| Grading | $3 | |

## Cards

Standard 52. Each card can have one **Finish**, one **Stamp**, one **Knockoff** (Off-Brand only).

- Finishes: Foil (+30 Value), Holo (+4 Hype), Prism (+1 Grade), Misprint (+0..+8 Hype, rolled per hand).
- Stamps: 1st Edition (+1 Hype each time it scores, permanent), Signed (scores twice), Gold Border (+$2 if held in hand at round end), Damaged (+1 Grade, 1 in 4 to tear and be destroyed), Graded 1–10 (grading desk only).
- Knockoffs: Crayon (any rank, 0 Value), Beer-stained (+6 Hype, card to its right is always played with it), Marked (+1 Grade, face-up to opponent from lock-in), Counterfeit (acts as Foil, an Honest shopkeeper confiscates it on sale), Bent (1 in 3 drawn twice), Wrong Suit (also counts as a second suit).
- Inserts (hold 2): Code Card (level a hand), Checklist (edit cards), Grading Slip, Redemption (rare, can give a Grail).
- Joker cards (max 2 in deck): Bound, Double-or-Nothing, Bluffing, Courtier, Catalyst, Sticky Fingers, Rival's.

### Grading

Send a card off for one round. Grade = 1d10 + freshness (+3 pulled this round, +2 last round, +1 two rounds ago), cap 10.
- 1–3: damaged in shipping, −1 Hype when scored
- 4–9: +grade/3 Hype (rounded down)
- 10 Gem Mint: +1 Grade

## Display case

5 slots (Display Riser: 6). Sell to make room. Collectibles trigger left to right.
Pool lives in `pitch.html` (`POOL`), being ported to `src/engine/collectibles.ts`.

Shop: 2 random collectibles per shop. **Nothing repeats until the whole pool has been shown.** When it rolls over, the shopkeeper gets salty ("what, you too good for my stuff?"): rapport drops and prices +10% for the rest of the run.

## Shopkeeper

3 seeded traits (Honest, Liar, Greedy, Chatty, Grumpy, Superstitious, Nostalgic, Closing Down, Collector) + rapport. Questions: deals, is this pack good, what're you buying, can you knock the price down, how's business.

## Tournament rounds

Rounds 3/6/9 are the boss blinds. Code: `src/engine/twists.ts`.

- **Forced play**: nobody can fold or forge. Betting is Min/Max, then Call/Raise, then Call. It always goes to showdown.
- One twist per tournament round, both players. The run rolls 3 different twists from the seed (`seed:twists`). The next one is always shown in the top bar, so the shop before it is prep.

| Twist | Rule |
|---|---|
| Sealed Only | Collectibles don't trigger |
| Face Cards Don't Score | J/Q/K still make the hand, but score no Value and trigger nothing |
| Ban Wave | One seeded suit: same as above for that suit |
| High Stakes | Min = Max |
| Lowball | Lowest appraisal wins |
| Double Down | The house matches the pot: the winner gets the stake twice, the loser still pays once |
| Hype Freeze | Only the hand base gives Hype (cards, finishes, collectibles give none) |
| Cold Deck | No mulligans |

Pitched "Deuces Wild" and "Blindfold" got swapped for Hype Freeze and Cold Deck: our boxes are 7–A so 2s barely exist, and Blindfold needs hidden-card UI. Both can come back with the visual pass.

## Battle Royale (later tiers)

Same rules as the solo duel (persistent opponents, showdown paycheck, house bonus, tournament twists). 10 players, paired each round, last bankroll standing. Bots fill empty seats. Then spectator betting for knocked-out players and a daily leaderboard.

## Build tiers

1. **Core**: engine, round flow, betting, forge, mulligan, scoring count-up + sound, packs, display case. Solo vs bot.
2. **Identity**: grading, shopkeeper, knockoffs, jokers, STONKS, full pool, tournament rounds.
3. **Multiplayer**: ghost opponents, live BR, spectator betting, leaderboard.
