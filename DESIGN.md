# Flambeur design (v1)

Booster-pack poker roguelike for the KSU AI Hackathon (IEEE AI Game Sprint + Nudox). Browser game.
Numbers here are first-pass. The econ sim (`sim/econ.ts`) is how we tune them, not guessing.

Sim baseline: see the duel table in Economy. Run `node sim/econ.ts --starter classic --policy greedy --difficulty medium`.
Known issue: cautious (fold a lot, never buy packs) used to beat greedy by 10–25 points. The duel + showdown-only paycheck brought it to roughly even. Tables + Bulk + Binder are built and re-simmed (see Economy, "Tables sim"). Flambé Box and Collector still lean cautious by 5–7 points.

## Decisions log (Nov 16 night, partly built Nov 17)

Decided with Evan after the Tables build. These override the sections below where they disagree; the sections get rewritten as each one is built. **Built** marks what's in the engine (`src/engine/match.ts`) as of Nov 17.

**The complexity rule:** every mechanic has to explain itself in one line, on the thing itself (button, card, badge, sign), where you see it. If it can't, it gets cut. No new systems past this list before Friday.

### Decided

- **Forge is renamed Flamber** (Nov 17, art direction, `docs/ART.md`). The button and the mechanic are **Flamber**, the result is a **flambéed** card, and the act is **a flambé**. Forge Box → **Flambé Box**, Forge Hammer → **Chalumeau** (a kitchen blowtorch), Smith's Apron → **Chef's Apron**. Display names only: code ids and identifiers (`forge.ts`, `'forge'` actions, `--starter forge`, `isForged`) stay as they are.
- **Built. 12 rounds, 4 Tables** (1–3, 4–6, 7–9, 10–12), bosses on 3/6/9/12. 4 twists, 4 sleeve offers per run. Rounds 10–12 are first-pass at ~+25% a round like 7–9: ante/max $18/$36, $22/$44, $27/$54. Tune from the sim.
- **Built. Sudden death past round 12** (bust-only modes: live duels and battle royale). Every round after 12 is forced like a boss (no fold, no flambé, no twist) and the ante doubles each round: round 13 is $54/$108, round 14 $108/$216. Stakes are still capped by the poorer bankroll (all-in), so a duel ends within a few rounds. Proposed by the architecture session, Evan approved making the call.
- **Built. Win condition.**
  - Solo: bust the rival, **or** have more money than them after round 12 (chip lead). Surviving alone is no longer a win.
  - Solo score = (your bankroll − theirs) × difficulty. Busting them zeroes their side, and a bust also banks a bonus for the rounds you skipped, so ending it early never scores worse than stalling. Bonus size comes from the sim's per-round bankroll growth.
  - Multiplayer: bust only, last bankroll standing.
- **Built. Flamber costs the Max**, paid to the rival, instead of what you've put in. **Underdog discount:** behind by 2× or more, flambéing costs the Min. Same threshold as Peek, so the underdog perks are one rule: "behind 2×: you peek and you flambé cheap." Flamber is unavailable if paying would bust you. Fold is unchanged (costs what you've put in, grinds +1 Value).
  - Still to confirm in the sim: this (G+) vs plain Max (G) vs one flambé per Table (H) vs today (A), with a smart bot. 1.5× is the fallback threshold if 2× almost never fires.
  - Why not "flambé = committed call, skip the house pay": it costs 2× ante + $2 when you'd win but $2 when you'd lose, so it rewards flambéing the hands you expect to lose. Why not "flambé costs the current bet": the richer player acts first, so the leader gets Min flambés. Why not flip the acting order so the underdog gets them: acting second with the bet in view is already the underdog's main edge.
- **Built. Betting is four buttons for both players: Fold / Flamber / Min / Max.** The second player sees the first player's choice, and buttons that don't apply grey out. If one went Max and the other Min, the Min player gets one prompt: **Match $X / Fold**. Same rules as before, but the words Call and Raise go away. Lower bankroll still acts second.
- **Rough version in the test UI. Tug-of-war bankroll bar** between the two players, Pokémon-HP-bar style. It shows who's ahead (chip lead), has a marked **2× line**, and the underdog side lights up its perks (👁 peek, 🔥 cheap flambé) past it. The Flamber button shows its price ("Flamber $2 · underdog" vs "Flamber $8").
- **Card places are hand, deck, discard, binder**, plus one card at a time away at the grading desk for a round (Evan, Nov 17). The display case holds collectibles, not cards.
- **Sleeves are literal sleeves on all of your cards, and they stack** (double, triple sleeve), one layer per sleeve bought. The card frames show the layers. **Every sleeve protects:** sleeved cards don't degrade (Damaged cards don't tear, grading can't come back "damaged in shipping"). On top of that, each sleeve type gives a small per-card buff. The current pool (restock, display riser, interest cap, bulk deal, hot market, big hands) gets replaced, since those aren't card effects. The new pool has to stay gentle, because a per-card buff stacked 4 deep scales hard. Pool still open.
- **Built (streaks are gone, Price Sticker + Gold Border show as "extras"). Money is a Balatro-style tally at the end of the round**, and it has fewer sources so the tally stays short: **Pot** (won/lost), **House** (+$2 for showing down, +2× ante for winning, more at the boss per win this Table = momentum, folded in), **Interest** (+$1 per $10, max 2).
- **Shopkeeper is a posted sign, not a conversation.** 3 seeded traits per run, no rapport, each a one-line rule on the counter (e.g. Grumpy: prices +$1, restocks free · Superstitious: won't buy ♠ · Closing Down: everything $1 cheaper each shop · Collector: pays 2× for graded cards · Chatty: shows the next boss twist early). His speech bubble reacts for flavor. The question menu is gone.
- **Knockoffs are a card modifier** from Off-Brand packs, and they **take the stamp slot**: a card is at most a Finish + one Stamp-or-Knockoff.
  - **Beer-stained** stays: +6 Hype and it's **stuck to another card**. They're drawn together and played together, and you can't split them by reordering.
  - **Crayon** (any rank, 0 Value), **Marked** (+1 Grade, the rival sees it face-up) and **Wrong Suit** (counts as two suits) stay.
  - **Bent** and **Counterfeit** are cut. Bent is confusing with the pile, and Counterfeit needed shopkeeper conversation.
- **Packs lean toward build lanes.** Each pack type has higher odds for certain card types, printed on the pack, so restocking to find the pack your build wants is a real choice. You should be able to steer toward a build without every pull being a Foil or Holo, and without the pool being so wide you never hit your lane. Lanes and odds still open, plus a few new unique card types beyond finishes (ideas below).

- **Built Nov 17. Grading desk with shippers** (Evan, replaces instant grading). Once per shop you ship one deck or binder card. It's away for one round and comes back graded at the next shop. You pick the shipper, the odds are on the button:
  - **La Poste** $2: 1d10 + freshness, a 1–3 comes back damaged.
  - **Chronopost** $4: same roll, never damaged in shipping (comes back at least a 4).
  - **Fourgon blindé** (armored van) $7: rolls twice, keeps the better one, never damaged.
- **Gold Border stays.** It's the money-lane card, and "+$3 if you win the showdown with it, −$3 if you lose" fits in one line.

- **Friday scope: all of it.** Every decided item ships for the demo. Build a seeded "golden path" demo run on top, so the 5 minutes the judges see are guaranteed to show off the good stuff.

### Decided Nov 17 (Evan), building in this order

1. Grading desk with shippers (built, above).
2. **Built. Sleeves become small run-wide buffs**, like Balatro vouchers. Protection is one sleeve in the pool (Archival Sleeve, since Lucky Penny is taken: Damaged cards don't tear, shipping can't come back damaged), not a rule on every sleeve. This replaces the stacking-sleeves idea above.
3. **Built.** Shopkeeper sign (see Shopkeeper).
4. **Built.** Knockoffs (see Cards, Knockoffs).
5. **Built.** **Scratchers replace inserts** (French: *tickets à gratter*), sold at the register like a real corner store: 1–2 per shop, about $3. Scratching gives a **random insert** that resolves on the spot, no slots to hold: Code (level a hand), Checklist (change a card's suit), Wishlist (binder card → deck), **Grail** (rare: a free rare collectible or a Joker).
6. **Built.** **New card types, all four:** Chase (sells for $10 from the binder; a rare pull in any paid pack, never a pack of its own), Sticker, Rookie, Jumbo. **Pack lanes:** Free = plain, Off-Brand = knockoffs and stamps, Repack = flambéed cards and traits, Collector = finishes and the rare slot.
7. **Built.** Joker cards (see Cards, Jokers). Sticky Fingers steals a random card from the rival; the rest get drafted and Evan vetoes. Jokers sit in the deck (max 2) and come from Repack and Collector packs. Off-Brand only has the knockoff **Crayon Joker**: each time it's played it copies one random Joker.
8. **Built.** Bots ship and scratch, a full sim pass, `REF_SCORE` recalibrated (see Economy, "Full sim pass"). The seeded golden-path demo run comes last, after everything else (Evan, Nov 17).

Deploys go out after each slice, with an `ENGINE_VERSION` bump (live matches end, the online daily pauses until midnight UTC).

### Card type ideas (for the pack lanes, not decided)

Each one has to pass the one-line rule:
The bar: a card type has to open or feed a build lane, not just add stats.
- **Chase Card**: sells for $10 from the binder. The "I HIT" pull, binder lane. Strong yes.
- **Sticker**: copies the Finish of a card it's played with. Finish lane combo piece. Yes.
- **Rookie Card**: +1 Value forever for every round it's in your deck. Long-game investment, fits 12 rounds. Yes.
- **Jumbo**: scores its Value 3×, takes 2 of your 5 play slots. Maybe, "slots" needs explaining.
- Cut: Promo (Gold Border is the money card), Error Print (Crayon and Bridge already do it), Test Print (a stat stick).

## Run

Changing: see Decisions log at the top. (12 rounds / 4 Tables, chip-lead win, margin score.)

- Solo is a **1v1 duel against one persistent rival** who plays by the same rules you do: it opens its own starter box (seeded), drafts, shops, flambés and gets paid. Same rules as multiplayer, so the engine and balance carry over.
- Daily seed = everyone gets the same rival with the same draws. "Random seed" for more runs.
- 9 rounds in 3 **Tables** (1–3, 4–6, 7–9, see Deck). You win by surviving round 9 **or busting the rival**. You lose at $0.
  - Open: should surviving be enough in a duel, or should you need more money than the rival after round 9?
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

**Special cards** (Flambé Box Twins, Bargain Damaged, Collector Foils) each land in a **different row**. So any pick keeps all but at most one of them, and dropping one costs you its whole row. Dropping a special is a real choice, not bad luck.

| Box | Box contents (32) | Twist |
|---|---|---|
| Classic | 7 through A | First mulligan each Table is free (no hand size cost) |
| Flambé Box | 7 through A, a Q★ Twin and K★ Twin swapped in | Starts with Chalumeau in the case |
| Suited | 7 through A in ♥ and ♠, two copies of each | Flush scores −2 Hype |
| High Roller | 7 through A | Start with $30, every ante and max +$1 |
| Bargain Bin | 7 through A, 3 Damaged | Every paid pack costs $1 less |
| Collector | 8 through A (28) + 4 Foil copies of random cards from it | Only 4 display slots |

Suited used to be 2 through A (26) and Collector 8 through A with 4 of them Foil (28). Both got padded to 32 for the draft: Suited went to two copies of 7–A so it matches the other boxes' ranks (more pairs, still only 2 suits), Collector keeps its 8–A identity and the 4 Foils became extra copies instead of swaps.

The rival's box is `pick(OFFERED)` from `seed:rival`, it drafts with `autoDraft` (drop the weakest row). The old 52-card deck is kept as `standard` in the sim only (drafts 3 rows of 13 = 39).

Flambé Box first had "flambéing costs half your stake" and that hit 98% for cautious, so it got the starting Chalumeau instead.

## Round flow

Changing: see Decisions log at the top. (four-button betting, flambé costs the Max.)

1. **Shop** (skipped before round 1, you start with a free pack instead). Pulls get sorted Deck or Binder (see Binder), selling happens from the binder.
2. **Deal.** At the start of a Table (rounds 1, 4, 7) everything shuffles into one pile. Every round you're dealt a **fresh hand of 8** (9 with Deck Box, minus 1 per mulligan you've taken this Table). **Mulligan**: throw back any number, they go into the pile, redraw one fewer (see Deck).
3. **Lock in 1 to 5 cards.** Both players lock at the same time. Locked cards can't change. The rival sees your hand size and how many times you mulliganed, never how many cards you locked or which.
4. **Ante** is paid automatically (the round's Min).
5. **Betting.** The player with the lower bankroll acts **second** (tie: alternate, player first on odd rounds).
   - First player: `Fold` / `Forge` / `Min` / `Max`.
   - Second player sees that, then: `Fold` / `Forge` / `Call` / `Raise` (raise only if first bet Min, raises to Max).
   - After a raise the first player can only `Call` or `Fold`. Max 3 steps.
6. **Showdown** if nobody folded. Both appraisals count up side by side, then reveal. Winner takes the matched bet from the loser, plus the house bonus (Momentum at the boss, see Deck). Tie = nobody pays beyond the ante. Gold Border cards settle their side bet.
7. Fold or Flamber: you lose what you've put in (the ante, or Min if you fold after a raise). Opponent takes it.
   - **Fold** mucks your **whole hand** to the discard, and grinds your highest locked card: same card, **+1 Value forever** (the meme build). That's the only thing a fold gives back.
   - **Flamber** needs at least a Pair. It's the real merge (below). The rest of the hand is mucked like a fold, and the new flambéed card goes into the current pile.
8. **Cleanup.** Played cards go to the discard and stay out until the next Table. Cards you were dealt but didn't play go back into the pile. Flambéed-away and torn cards are gone for good. Nothing stays in your hand.

## Deck

Code: `src/engine/deck.ts` (piles), `src/engine/run.ts` (dealHand, mulligan, cleanup in finishRound).

### Tables

Built Nov 16. The old carry-over let you hold 3 cards between rounds, so you could keep trips, fold the cheap rounds and spend them on a tournament round. That's sandbagging, not deckbuilding.

- The 9 rounds are 3 **Tables**: 1–3, 4–6, 7–9. The last round of each Table is its tournament round (the boss).
- Your deck is three piles: **hand**, **pile**, **discard**. Deck size = all three (the Binder doesn't count).
- At the start of a Table, **everything shuffles into one pile**.
- **A fresh hand every round.** You're dealt 8 from the pile (9 with Deck Box).
- **Play 1 to 5 cards.** Played cards go to the **discard** and stay out until the next Table. Cards you didn't play go **back into the pile**. Nothing stays in your hand, so there's nothing to hoard.
  - Playing only your scoring cards keeps the rest in rotation. Playing junk you don't want to see again this Table thins it out. Both are real choices.
- **Fold mucks your whole hand** to the discard, like folding in poker. Flamber does too (flambé is a fold). So sacking the cheap rounds burns pile and leaves you a short hand at the boss.
- **Mulligan:** throw back any number, they go into the pile, and you redraw **one fewer**. Your hand size drops by 1 for the rest of the Table. There's no mulligan budget: the hand-size cost limits it. Classic's first mulligan each Table is free. Cold Deck means no mulligans that round.
- **Running out:** if the pile can't deal a full hand you get a short one. If it can't deal any cards, you lose the round.
- **What the rival sees:** your hand size and how many times you mulliganed. Never how many cards you locked or which ones (no card backs that give the count away). Knockoffs like Marked can still show a card face-up.
- **New cards mid-Table:** pulls you put on Deck and newly flambéed cards are shuffled into the **current** pile.
- The deck viewer (what's left in my pile, what's in my discard) is required UI. The test UI has one (click the Deck chip): pile sorted so it doesn't leak draw order, discard, binder.
- Rng: all pile shuffles use one stream per round (`seed:round:pile`), reset at the start of each round, so a shop restock never changes what you're dealt. Same seed + same picks = same deals.
- Mulligan order: the redraw comes off the top first, then the tossed cards get shuffled into the pile, so you can't redraw what you just threw back.
- An empty hand loses the round as a fold at the ante (`forfeit` in betting.ts), even on a boss round. Both empty = nobody pays.

### Boss stakes without sacking rounds 1–2

- Folding mucks your whole hand, so a sacked round costs boss cards, not just the ante.
- **Momentum:** the boss's house bonus is **2× ante plus 1× ante for every showdown you won earlier in that Table** (max +2). Win both early rounds and the boss is worth 4× ante to you.
- Folding already pays no paycheck and resets your streak.

### Bulk (the flambé-thinning fix)

Built Nov 16. Replaces the deck floor. Flambé thinning was: every flambé shrinks the deck (2–5 cards become 1), so a bot flambéed down to a few supercards. Under Tables that got worse, because unplayed cards return to the pile, so a deck of 8 flambéed cards plays one self-contained supercard (a Household is a full house alone) every round. Evan didn't want a minimum deck size as the fix. Codex came up with the same idea independently ("Slag").

- **Every card a flambé eats beyond the first leaves a Bulk card** in your deck. Flambéing a pair gives 1 flambéed + 1 Bulk, trips 1 + 2, a full house 1 + 4. Flambéing never shrinks your deck: your power concentrates, but it gets diluted.
- **Bulk is a weak stone card:** no rank, no suit, never part of a poker hand. When locked in it always scores **+5 Value** (the one exception to "kickers don't score"). It can't be flambéed and sells for $0, so it can't go to the binder.
- **Getting rid of it:** play it as junk (it's out for the rest of the Table), or pay the shop to **bin one for good**: $2, then $3, $4… for the rest of the run (Slay the Spire style paid removal).
- **No deck floor.** Flambéing can't thin you. Damaged tears and paid Bulk removal still can, and "if the pile can't deal any cards, you lose the round" still stands.
- **Bulk builds** (ideas, not in the pool yet): **Bulk Bin** each Bulk scored +2 Hype, **Bulk Buyer** +$1 per Bulk you play, **Thin Binder** becomes "+1 Grade if your deck has no Bulk".
- Numbers (+5 Value, removal prices) are first-pass, see the Tables sim.
- Code: a Bulk card is a normal `Card` with `bulk: true` (rank/suit are placeholders). `evaluateHand` filters it out, `appraise` adds +5 Value per played Bulk. Folding a hand of only Bulk grinds nothing.

### Old carry-over deck (replaced by Tables)

Before Tables: three piles persisted for the whole run, you kept the 3 unplayed cards in hand and drew up to 8, locked exactly 5, one free mulligan per round (Classic 2), reshuffled the discard when the draw pile ran dry, deck floor 16. Gold Border paid +$2 per round held. Row draft win rates from that era (before = 26–32 card decks, after = row draft to 24, floor 12):

| Box | greedy before → after | cautious before → after | random before → after |
|---|---|---|---|
| Classic | 44.1 → 47.7 | 76.1 → 65.6 | 19.1 → 22.0 |
| Flambé Box | 51.7 → 57.6 | 86.5 → 88.1 | 23.6 → 27.8 |
| Suited | 47.1 → 52.3 | 71.6 → 69.5 | 20.5 → 22.7 |
| High Roller | 49.6 → 58.6 | 84.0 → 77.4 | 26.4 → 28.9 |
| Bargain Bin | 60.7 → 67.7 | 81.5 → 76.6 | 28.0 → 33.3 |
| Collector | 46.6 → 55.3 | 85.7 → 79.7 | 22.5 → 26.3 |

## Binder

Every card you pull goes to your **Deck** or your **Binder**. That's the only choice when you rip a pack. You keep everything you pull, but the deck only grows when you choose it. This replaces the "keep 1–2 per pack" idea, which made packs feel like a draft instead of a booster.

- **Deck**: shuffled into your current pile (see Deck).
- **Binder**: never drawn and never played. It's your sell pile and the thing binder builds score off. It doesn't count toward your deck size.
- **One-way.** Binder cards don't go back to the deck. The only exception is rare inserts (see Cards), e.g. a **Wishlist** that moves 1 binder card into your deck.
- **Defaults:** special cards (finish, stamp, flambéed, graded) start on Deck, plain cards on Binder. Tap a card to flip it, then Done. Most rips are one tap.
- **Bots** use the same default sort. They hold the binder for STONKS: sell hot cards right away, sell everything once the binder is past 6 cards or they're under their reserve.
- **Selling only happens from the binder**, at the shop. A deck card can't be sold directly.
- Starting decks don't touch the binder: the row draft builds the deck, the dropped row is gone.
- Binder build collectibles (ideas, not in the pool yet): **Completionist** +1 Hype per 3 binder cards, **Full Set** +1 Grade if the binder has all 4 suits of one rank, **Mint Condition** binder cards keep their grading freshness.

### STONKS

STONKS is the binder market (it replaces a live ticker, and there are no trades). Each shop it posts one **hot** thing, seeded per round: a rank, a suit, or a finish. Binder cards that match sell for **3×** (rank or suit) or **2×** (finish). It's shown in the top bar with the next tournament twist, so holding binder cards for a hot market is a real choice versus selling now. Multipliers are first-pass, tune them in the sim. Code: `src/engine/sleeves.ts` (`stonksFor`, stream `seed:round:stonks`). Hot ranks roll 7–A only since every box is 7–A. A Wild Suit card doesn't count as the hot suit.

## Flamber

Flamber is a fold that merges every card that scored into one flambéed card (code: `src/engine/forge.ts`). It needs at least a Pair; High Card can't be flambéed, folding grinds instead (`grindOnFold`).

| Flamber a… | Trait | The flambéed card… |
|---|---|---|
| High Card | can't flambé. **Folding** does the grind | your highest locked card gets +1 Value forever, no star |
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
- **Cross flambé:** the new card keeps the traits of flambéed cards it ate, plus traits for the primary and any bonus hands. It takes the rank/suit of the highest-tier flambéed card eaten.
- **Trait slots = tier.** Over the cap the player picks which to keep.
- A lone flambéed card can't re-flambé itself. Stamps and 1st Edition growth don't carry through a flambé; the best Finish does.
- Every card eaten beyond the first leaves a **Bulk** card (see Deck), so flambéing never shrinks the deck.

### Bonus hands

Primary hand = best hand with flambéed traits. Hands from the other families (rank, straight, flush) stack on top as **bonus hands**, but only if a flambéed trait made the primary or that bonus hand happen. Plain cards never combo. Every hand's base Value/Hype stacks, card Value counts once.

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

Changing: see Decisions log at the top. (round-end tally: Pot / House / Interest, rounds 10–12.)

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
- After each round: **Paycheck +$2 only if you went to showdown** (fold/flambé rounds don't get paid), **House bonus: the showdown winner gets 2× the ante** on top of the pot, **Interest +$1 per $10** held (max +$2), **streak bonus**. All of it comes from the house, so it's the same rule in multiplayer.
- Why: before this, paycheck + interest + selling the free pack was ~$7/round no matter what, more than the ante through round 5. Folding every hand was break-even, so the cautious bot won by never playing. Balatro does the same thing: blind rewards are most of your income, interest is a capped bonus.
- **Hot Streak**: +$1 per consecutive win (max +$3). **Cold Streak**: +$1 per consecutive showdown loss (max +$3). Fold/Flamber **resets** your streak (otherwise folding every round farms the cold streak).
- **Comeback**: lower bankroll acts second. Behind by 2× or more: **Peek** at 1 of the leader's locked cards before betting.
- **Gold Border** settles inside the table money, before the bust check, so a −$3 side bet can bust you.

### Full sim pass (Nov 17, after slices 1–8)

Bots now use the grading desk (greedy, random, medium and hard rivals: the freshest special deck card each shop, Chronopost when they have $6 over reserve, La Poste otherwise; cautious and easy never ship) and only buy a scratcher with $6 to spare. In 200 hard-vs-easy bot duels the hard bot shipped 1190 cards (1048 Chronopost) and scratched 1925 times, the easy bot scratched 575.

`REF_SCORE` recalibrated: the mean of three 3000-run greedy-vs-medium seeds (`sim`, `ref2`, `ref3`). 1000 runs aren't enough, round 2 swung between 390 and 600 because the distribution has two humps. Boss rounds interpolated, round 12 = round 11 + 7%.
Old `[336, 711, 900, 1080, 1200, 1400, 1632, 1794, 2100, 2506, 2805, 3000]` → new `[336, 400, 626, 852, 939, 1108, 1277, 1356, 1673, 1990, 2187, 2340]`.

1000 runs, Classic, win rate (mean score). Before = after jokers, middle = smarter bot shop, after = plus the new `REF_SCORE`:

| You vs rival | Before | Bot shop | After |
|---|---|---|---|
| greedy vs easy | 70.7% | 66.5% (142.6) | 63.6% |
| cautious vs easy | 36.5% | 36.5% (57.8) | 36.7% |
| random vs easy | 46.8% | 46.7% (90.3) | 36.8% |
| greedy vs medium | 46.4% (170.6) | 48.1% (171.0) | 46.5% |
| cautious vs medium | 11.7% (35.1) | 11.5% (32.9) | 14.2% |
| random vs medium | 21.4% (72.8) | 23.5% (74.3) | 20.5% |
| greedy vs hard | 27.7% | 28.2% (136.5) | 26.6% |
| cautious vs hard | 7.1% | 7.8% (30.3) | 8.4% |
| random vs hard | 9.9% | 9.5% (40.8) | 9.1% |

The difficulty ladder holds (greedy 64 / 47 / 27%). The lower `REF_SCORE` makes rivals read their hands as stronger, which mostly shows against the random policy vs easy (46.8% → 36.8%). Cautious is still the weakest way to play, which is the point.

### 12-round sim (Nov 17)

First run on the new engine (`match.ts`: 12 rounds, chip-lead win, flambé costs the Max, 4-button betting, no streaks). Win %, 1000 runs each, seed `sim`. The sim now plays through `step()` with the same bot policy the server uses. **Win = bust the rival or chip lead after round 12**, so this isn't comparable 1:1 with the old "survived round 9" numbers below. `REF_SCORE` recalibrated from every locked hand: `[336, 711, 900, 1080, 1200, 1400, 1632, 1794, 2100, 2506, 2805, 3000]` (boss rounds interpolated).

| Box | Rival | greedy | cautious | random |
|---|---|---|---|---|
| Classic | Easy | 78.0 | 38.9 | 53.4 |
| Classic | Medium | 48.3 | 8.9 | 19.2 |
| Classic | Hard | 27.7 | 5.1 | 8.7 |
| Flambé Box | Medium | 54.1 | 18.2 | 20.9 |
| Flambé Box | Hard | 33.9 | 10.3 | 12.5 |
| Suited | Medium | 47.4 | 11.5 | 17.5 |
| Suited | Hard | 28.9 | 8.5 | 7.6 |
| High Roller | Medium | 59.6 | 16.6 | 24.9 |
| High Roller | Hard | 41.3 | 11.1 | 13.8 |
| Bargain Bin | Medium | 63.9 | 23.2 | 26.2 |
| Bargain Bin | Hard | 48.4 | 14.3 | 17.4 |
| Collector | Medium | 48.0 | 17.0 | 20.1 |
| Collector | Hard | 33.7 | 11.2 | 10.9 |

- **The old problem flipped.** Cautious went from tying greedy to losing by 30–40 points. Three things stack on it: surviving isn't a win anymore, flambéing as a fold now costs the Max (so it folds instead and grinds nothing useful), and it never buys packs. Most cautious runs end "behind after 12" or busted.
- Greedy sits close to the targets from the balance chat (Medium ~50–60, Hard ~30–48, Easy ~78). Random is a bit low (17–26 on Medium vs the 25–30 target).
- **Runs end by bust a lot**: greedy vs Medium busts the rival ~40% of runs and gets busted ~46%. Antes past round 9 ($18–27) are big next to typical bankrolls. Worth a look when tuning 10–12.
- Flamber share dropped from ~40% of rounds to 5–15%: at the Max price bots only flambé as underdogs.
- Not run yet: the flambé A/G/G+/H comparison with a smart bot (the decisions log still asks for it), and a cautious policy that buys some packs so it isn't a pure strawman.

### Tables sim (Nov 16, evening)

Tables, Bulk, Binder + STONKS, Momentum, Gold Border side bet, Sleeves and grading are all built. Win rate %, 1000 runs each, seed `sim`. Before = the Duel sim table below (old carry-over deck, floor 16). After = Tables + everything above, bots sort pulls and hold the binder for STONKS, bots buy a sleeve when they can afford it over their reserve and bin one Bulk a shop when they have $4 spare.

| Box | Rival | greedy before → after | cautious before → after | random before → after |
|---|---|---|---|---|
| Classic | Easy | 91.2 → 87.5 | 95.6 → 88.4 | 79.9 → 74.1 |
| Classic | Medium | 63.7 → 69.4 | 58.5 → 64.3 | 42.7 → 46.5 |
| Classic | Hard | 52.4 → 58.2 | 52.9 → 57.1 | 30.4 → 36.0 |
| Flambé Box | Medium | 71.3 → 76.5 | 74.1 → 81.2 | 49.9 → 56.9 |
| Flambé Box | Hard | 60.7 → 65.9 | 71.9 → 73.1 | 40.2 → 45.3 |
| Suited | Medium | 64.1 → 67.4 | 64.8 → 64.7 | 46.3 → 45.4 |
| Suited | Hard | 55.5 → 56.8 | 59.0 → 58.7 | 31.9 → 35.4 |
| High Roller | Medium | 76.3 → 78.0 | 70.6 → 73.6 | 55.9 → 58.3 |
| High Roller | Hard | 64.7 → 68.1 | 65.4 → 66.2 | 44.3 → 46.7 |
| Bargain Bin | Medium | 79.5 → 82.5 | 70.9 → 71.5 | 59.2 → 60.2 |
| Bargain Bin | Hard | 69.1 → 75.5 | 67.1 → 64.4 | 47.1 → 51.2 |
| Collector | Medium | 68.8 → 74.3 | 71.5 → 77.0 | 50.5 → 49.8 |
| Collector | Hard | 57.7 → 63.2 | 65.1 → 68.3 | 38.4 → 43.6 |

- **`REF_SCORE` changed how it's calibrated.** It used to be the rival's p50 at *showdown*, which runs ~2× the p50 of every dealt hand because bots fold the weak ones. Under Tables, mulligans cost hand size so bots mulligan less and see weaker hands, and the showdown-based number made the rival fold ~35% of rounds. Random beat Medium 67–75% until it was recalibrated. The sim now prints the median of **every hand the rival is dealt**, and that's what `REF_SCORE` is.
- Cautious vs greedy is −11 to +7 now (was −8 to +11). Greedy wins or ties on Classic, Suited, High Roller and Bargain. **Flambé Box (+5 Medium, +7 Hard) and Collector (+3, +5) still lean cautious**, smaller than before.
- **Easy is less of a walkover**: 87–88 for greedy/cautious (was 91–98).
- **The pile never runs dry**: 0.00 rounds lost to an empty pile per run, in every config. Decks are 20–24 cards at minimum, and even three folds in a Table only muck 24. The "sacked rounds cost boss cards" pressure is real for hand quality but never empties the pile. If we want that pressure, try a smaller hand, a smaller deck, or folds that muck more.
- **Bulk**: cautious makes 7–10 Bulk a run (flambé is its fold) and bins 1–2. Greedy makes 3–5. Cautious decks end at 20–24 cards (p50 23), so Bulk is doing its job: flambéing can't thin you.
- **Greedy decks still bloat**: final deck p50 58–76, p90 ~90. The binder takes the plain pulls, but every special card defaults to Deck. Hard rivals bloat to ~80 too. Worth trying: bots only deck special cards that fit their hand, or deck-size pressure (Thin Binder at 18 is unreachable for greedy).
- Bots buy ~1 sleeve a run (0.4–1.4).

### Duel sim (Nov 16)

Win rate %, 1000 runs each, seed `sim`, your policy vs rival difficulty. Before = duel with the old economy (paycheck every round, no house bonus, floor 12, old easy bot). After = showdown-only paycheck, 2× ante house bonus, floor 16, new easy bot, `REF_SCORE` recalibrated.

| Box | Rival | greedy before → after | cautious before → after | random before → after |
|---|---|---|---|---|
| Classic | Easy | 94.3 → 91.2 | 99.2 → 95.6 | 88.2 → 79.9 |
| Classic | Medium | 62.6 → 63.7 | 65.0 → 58.5 | 41.9 → 42.7 |
| Classic | Hard | 47.3 → 52.4 | 60.5 → 52.9 | 28.3 → 30.4 |
| Flambé Box | Medium | 69.7 → 71.3 | 82.4 → 74.1 | 44.2 → 49.9 |
| Flambé Box | Hard | 53.5 → 60.7 | 75.1 → 71.9 | 36.1 → 40.2 |
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
- **Flambé Box and Collector on Hard** still lean cautious (+11, +7). Chalumeau makes flambé-thinning strong even at floor 16.
- **Easy is very easy** (91–98%). Fine for a first run, could use a slightly sharper bot.
- Greedy decks still bloat (p90 ~70–80 cards). The Binder (pulls go to Deck or Binder) is the planned fix, and the bots need to sort their pulls too.
- Before this pass, `REF_SCORE` was calibrated against the old fresh-every-round rival. Recalibrating made rivals bet looser, which helped cautious about 5–10 points. Before the recalibration, Classic was greedy 62.3 / cautious 47.7 on Medium.

### Prices

| Thing | Cost | Sells for |
|---|---|---|
| Free pack (1 per shop, 3 plain cards) | $0 | $1 per card, from the binder (STONKS hot: ×3) |
| Off-Brand pack (5) | $3 | |
| Repack (4) | $4 | |
| Collector pack (3 cards, insert, rare) | $6 | |
| Collectible C / U / R | $4 / $6 / $9 | half price |
| Card with a Finish | | $2 |
| Graded card | | grade ÷ 2 |
| Restock | $1, $2, $3… (resets each shop) | |
| Grading | $3 | |

## Cards

Changing: see Decisions log at the top.

### Jokers

Built Nov 17 (`JOKERS` in cards.ts, effects in match.ts `resolveJokers` / `settlePair`). A Joker is a real playing card (rank and suit) with a rule on top. **Max 2 in a deck**: a third one from a pack goes to the binder, and a Wishlist can't move one past the cap.

| Joker | Rule |
|---|---|
| Sticky Fingers | Win the showdown with it played: steal a random card from the rival's pile or discard into your deck |
| Double or Nothing | Played (by either side): the showdown pays and costs double, as far as the loser's bankroll goes |
| Courtier | Counts as whichever J, Q or K makes your best hand |
| Catalyst | Flambé with it: the new card comes out one ★ higher (max ★3) |
| Bluff | Played, you go Max and the rival folds: +$5 from the house (shows in extras) |
| Rival's Card | At showdown it turns into a copy of the rival's highest played card (rank, suit, finish) |
| Crayon Joker | Off-Brand only. Each time it's played it rolls one of the six above for that round |

Sources: Repack 6% a pack (one card), Collector rare slot 10%, Off-Brand 5% for the Crayon Joker, and a Grail scratcher is now 50/50 a rare collectible or a Joker. Bots estimate Courtier but not Rival's Card or the Crayon roll (those need the showdown). In 200 bot duels all seven show up (47–64 of each owned at the end), 102 played.

Bugs the sim caught on the way: the bot's Wishlist ignored the joker cap (illegal move, fixed with `wishable()`). The new tests are hand-checked against the same showdown with and without the joker (Double or Nothing doubles the pot, Catalyst gives ★2 instead of ★1, Bluff +$5 only with the joker). The Grail scratcher test now accepts a rare collectible or a joker.

Joker sim (Nov 17, 1000 runs, Classic vs medium, before → after): greedy 47.4% → 46.4% win, score 175.1 → 170.6; cautious 9.0% → 11.7%, 25.3 → 35.1; random 22.0% → 21.4%, 74.6 → 72.8. All six other boxes run 300 random-policy games vs hard without an illegal move. Rival p50 at round 11 is back under `REF_SCORE` (2496 vs 2805), so it stays.

### Card types and pack lanes

Built Nov 17 (`Variant` / `VARIANTS` in cards.ts, lanes in `openPack` in shop.ts). A card is at most one type.

| Type | Does | Where |
|---|---|---|
| Chase | Sells for $10 from the binder (STONKS and the sign still multiply it). Defaults to the binder when you sort a pack | 3% per paid pack, one of its cards. Never a pack of its own |
| Sticker | No finish of its own. When it scores it wears the best finish of the other cards played with it (Prism > Foil > Holo > Misprint), even a non-scoring one | Collector, 20% per base card |
| Rookie | +1 Value every round it spends in your deck (counted at each shop, pile or discard, not the binder) | Repack, 15% per card |
| Jumbo | Scores its card Value 3× (not the finish), takes 2 of your 5 play slots | Repack, 12% per card |

Lanes: **Free** = plain cards only (the locked rule, so no Rookies there), **Off-Brand** = stamps + knockoffs, **Repack** = pre-flambéed cards, Jumbos, Rookies, **Collector** = finishes, Stickers, Code Card, rare slot. Flambéing makes a plain-type card. Bots play Jumbos (`bestPlay` tries smaller plays when a Jumbo is in hand). 200 bot duels end with about 1050 Stickers, 960 Rookies, 840 Jumbos and 50 unsold Chases owned, and 159 Jumbos locked.

Also fixed here: a card already stuck to a beer stain could roll its own Beer-stained knockoff and chain three cards, and the pair check only looked one way, so a bot could toss half a pair (the cautious sim crashed on it). Pairs can't chain any more and the check runs both ways per pair.

Card types sim (Nov 17, 1000 runs, Classic vs medium, before → after): greedy 47.0% → 47.4% win, score 177.7 → 175.1; cautious 8.7% → 9.0%, 24.4 → 25.3; random 19.3% → 22.0%, 63.5 → 74.6. Other boxes, greedy, 300 runs: Forge 55.0%, Suited 45.0%, Collector 49.7%. Rival p50 dropped early (greedy round 4: 940 → 812) and rose at round 11 (3132 → 2926, both above `REF_SCORE` 2805). Within noise of the table, so it stays for now; slice 8 recalibrates once bots ship and scratch smartly.

### Scratchers

Built Nov 17 (`INSERTS` / `rollInsert` in shop.ts, `scratch()` in match.ts). 1–2 per shop at the register, $3 (the sign's price rules apply), rerolled on restock. Scratching gives one random insert on the spot:

| Insert | Odds | Does |
|---|---|---|
| Code | 40% | Levels up a random hand type |
| Checklist | 30% | Pick one deck card and a new suit for it |
| Wishlist | 22% | Pick one binder card, it shuffles into your deck |
| Grail | 8% | A free rare collectible (half its price if the case is full). Jokers join this roll in slice 7 |

A Wishlist with an empty binder, or a Checklist with no deck cards, becomes a Code, so a scratcher never comes up blank. Checklist and Wishlist block the rest of the shop until you pick (timeout default: the first card, the next suit). Bots buy scratchers like any offer they can afford, Wishlist their most valuable binder card, and Checklist an off-suit card toward their deck's main suit.

Scratcher sim (Nov 17, 1000 runs, Classic vs medium, before → after): greedy 47.8% → 47.0% win, score 191.4 → 177.7; cautious 8.0% → 8.7%, 21.3 → 24.4; random 18.6% → 19.3%, 60.3 → 63.5. Runs end in busts more often (greedy: busted 471 → 505, behind after 12: 51 → 25), since bots now spend $3–6 more a shop. Win rates barely move. Rival p50 moved both ways within noise, so `REF_SCORE` stays. Worth a look in slice 8 when bots get smarter about the shop.

### Knockoffs

Built Nov 17 (`Knockoff` in cards.ts). Off-Brand packs only: every card without a stamp has a 35% chance of a knockoff in the stamp slot, so a card is at most a Finish + one Stamp-or-Knockoff. Flambéing makes a clean card (knockoffs don't carry over).

| Knockoff | Does |
|---|---|
| Crayon | Any rank, 0 Value. Joins your biggest rank group or fills a straight gap. Never the high card |
| Marked | +1 Grade when it scores. Once locked, the rival sees it face up (it does reveal that you locked it) |
| Wrong Suit | Also counts as a second suit for flushes |
| Beer-stained | +6 Hype when it scores. Stuck to another card from the same pack: drawn together (even past hand size), tossed together, played together. The pair only breaks if one half leaves the deck (binder, sold, flambéed, torn, shipped) |

Bent and Counterfeit are cut. Bots handle pairs: `bestPlay` never splits one. 200 bot duels end with about 360 of each knockoff owned and 161 beer-stained cards locked, no illegal moves.

Knockoff sim (Nov 17, 1000 runs, Classic vs medium, before → after): greedy 48.5% → 47.8% win, score 188.0 → 191.4; cautious 9.4% → 8.0%, 28.1 → 21.3; random 21.3% → 18.6%, 71.4 → 60.3. The rival's late rounds got a bit stronger (greedy run p50 round 10: 2197 → 2625, round 11: 2256 → 2750), still within reach of the current `REF_SCORE` (2506, 2805), so it stays.


Standard 52. Each card can have one **Finish**, one **Stamp**, one **Knockoff** (Off-Brand only).

- Finishes: Foil (+30 Value), Holo (+4 Hype), Prism (+1 Grade), Misprint (+0..+8 Hype, rolled per hand).
- Stamps: 1st Edition (+1 Hype each time it scores, permanent), Signed (scores twice), Gold Border (a bet inside the bet: if it's played and you win the showdown +$3, lose the showdown −$3, fold = nothing; replaces "+$2 if held in hand", which Tables kill and which was Balatro's Gold card), Damaged (+1 Grade, 1 in 4 to tear and be destroyed), Graded 1–10 (grading desk only).
- Knockoffs: Crayon (any rank, 0 Value), Beer-stained (+6 Hype, card to its right is always played with it), Marked (+1 Grade, face-up to opponent from lock-in), Counterfeit (acts as Foil, an Honest shopkeeper confiscates it on sale), Bent (1 in 3 drawn twice), Wrong Suit (also counts as a second suit).
- Inserts (hold 2, our version of Balatro's tarots): Code Card (level a hand), Checklist (edit cards), Grading Slip, Wishlist (rare, move 1 binder card into your deck), Redemption (rare, can give a Grail).
- Joker cards (max 2 in deck): Bound, Double-or-Nothing, Bluffing, Courtier, Catalyst, Sticky Fingers, Rival's.

### Grading

Ship a card off for one round. Grade = 1d10 + freshness (+3 pulled this round, +2 last round, +1 two rounds ago, counted when it ships), cap 10. The shipper sets the price and the risk (Decisions log).
- 1–3: damaged in shipping, −1 Hype when scored
- 4–9: +grade/3 Hype (rounded down)
- 10 Gem Mint: +1 Grade

Built Nov 17 (the `ship` action in match.ts, `SHIPPERS` in economy.ts), from the deck (pile or discard) or the binder. One shipment per shop, one card away at a time. The grade is rolled when it ships, stays hidden, and shows when it comes back at the next shop: a deck card shuffles back into the pile, a binder card goes back to the binder. The starting deck is never fresh. Bulk and already graded cards can't go. Bots don't grade yet.

## Sleeves (run-wide upgrades)

Decided Nov 17: sleeves stay small run-wide buffs (vouchers). Protection is one sleeve, Archival. The stacking-sleeves idea is dropped.

Our version of vouchers. **One Sleeve is offered per Table**, in the shop right before the tournament round, so 3 per run, each one boss prep. A Sleeve is a permanent upgrade for the rest of the run, not something on a single card. They're rare, so each one should be strong.

Built Nov 16, code: `src/engine/sleeves.ts`. **$10.** The offer is seeded per Table (`seed:table:sleeve`) out of the sleeves you don't own yet. It doesn't reroll on restock. The rival gets its own offer the same way. First-pass pool:

| Sleeve | Does |
|---|---|
| Big Hands | +1 hand size |
| Restock Sleeve | First restock each shop is free (stacks with Store Credit) |
| Hot Market | STONKS sells at +1× |
| Display Riser | +1 display case slot |
| Deep Pockets | Interest caps at +$4 instead of +$2 |
| Bulk Deal | Binning a Bulk card always costs $1 |
| Archival Sleeve | Damaged cards never tear, and grading never comes back damaged (added Nov 17, the one protection sleeve) |

Archival sim (Nov 17, 1000 runs, Classic vs medium, before → after): greedy 48.3% → 48.1% win, score 183.8 → 182.4; cautious 8.9% → 10.0%, 26.1 → 26.7; random 19.2% → 18.0%, 60.6 → 57.9. Noise: the new sleeve only reshuffles which sleeve a Table offers. Rival strength is the same, so `REF_SCORE` stays.

Naming clash fixed: Penny Sleeve is now **Lucky Penny**, Card Sleeves is now **Chef's Apron** (ids unchanged). Top Loader stays, it's a one-card holder, not a sleeve.

## Display case

5 slots (Display Riser: 6). Sell to make room. Collectibles trigger left to right.
Pool lives in `pitch.html` (`POOL`), being ported to `src/engine/collectibles.ts`.

Shop: 2 random collectibles per shop. **Nothing repeats until the whole pool has been shown.** When it rolls over, the shopkeeper gets salty ("what, you too good for my stuff?"): a grumpy handwritten note goes up beside his sign and prices are +10% for the rest of the run (no rapport).

## Shopkeeper

Built Nov 17 (`KEEPER` / `keeperFor` in shop.ts, effects in match.ts). A posted sign of **3 traits seeded per run** (`seed:keeper`), the same shopkeeper for every seat. No rapport, no questions. The sign shows under his speech bubble.

| Trait | Sign says |
|---|---|
| Grumpy | Everything +$1, but the first restock each shop is free |
| Superstitious | Won't buy ♠ cards (binder sells refused) |
| Closing Down | Everything $1 cheaper every Table (Table 2: −$1 … Table 4: −$3, never under $1) |
| Collector | Pays 2× for graded cards |
| Chatty | Tells you next shop's STONKS |
| Nostalgic | Pays 2× for 1st Edition cards |

Changed from the decisions log, my calls: Grumpy's restocks would be free forever (infinite rerolls), so it's the first one each shop. Closing Down is per Table, since $1 per shop makes everything $1 by round 10. Chatty showed the next boss twist, but the top bar always shows it already, so he leaks next shop's STONKS instead. Nostalgic is new, to have 6 traits to pick 3 from. Free stays free. Shipping prices aren't touched.

Shopkeeper sim (Nov 17, 1000 runs, Classic vs medium, before → after): greedy 48.1% → 48.5% win, score 182.4 → 188.0; cautious 10.0% → 9.4%, 26.7 → 28.1; random 18.0% → 21.3%, 57.9 → 71.4. Rival p50 moved within noise (greedy run: round 2 688 → 608, round 4 915 → 980), so `REF_SCORE` stays.

## Tournament rounds

Rounds 3/6/9 are the boss blinds: the last round of each Table, played with whatever is left in your pile. The house bonus there uses Momentum (see Deck). Code: `src/engine/twists.ts`.

- **Forced play**: nobody can fold or flambé. Betting is Min/Max, then Call/Raise, then Call. It always goes to showdown.
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

### Timers (multiplayer only)

Solo has no timers. Multiplayer uses the same screens with a clock, and every timeout has a default so nobody waits on an AFK player. All pairs bet at the same time, so a round waits only for the slowest pair.

| Phase | Timer | Timeout does |
|---|---|---|
| Starter box + draft | lobby countdown | first offered box, auto-draft (drop the weakest row) |
| Shop | 30s (45s before a tournament round) | bought packs auto-rip, unsorted pulls keep their Deck/Binder default |
| Deal, mulligan, lock in | 20s | lock the selected cards (the best hand is pre-selected) |
| Each betting decision | 10s | **Min, then Call** (keeps showdowns happening; an AFK player bleeds money, not the table's time) |
| Flamber trait pick | 10s | autoKeep |
| Showdown count-up | ~6s, skippable | |

About 30s per round for a fast player, under 2 minutes worst case.

## Build tiers

1. **Core**: engine, round flow, betting, flambé, mulligan, scoring count-up + sound, packs, display case, tournament rounds, Tables, Binder, Bulk, Momentum. Solo vs bot. Done.
2. **Identity**: grading, STONKS, Sleeves and the Gold Border side bet are built. Still to build: shopkeeper traits + rapport, knockoffs, Joker cards, inserts (Wishlist etc.), the rest of the pool, bots that grade.
3. **Multiplayer**: ghost opponents, live BR, spectator betting, leaderboard.
