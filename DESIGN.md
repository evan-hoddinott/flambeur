# Flambeur design (v1)

Booster-pack poker roguelike for the KSU AI Hackathon (IEEE AI Game Sprint + Nudox). Browser game.
Numbers here are first-pass. The econ sim (`sim/econ.ts`) is how we tune them, not guessing.

Sim baseline: see the duel table in Economy. Run `node sim/econ.ts --starter classic --policy greedy --difficulty medium`.
Known issue: cautious (fold a lot, never buy packs) used to beat greedy by 10–25 points. The duel + showdown-only paycheck brought it to roughly even. Tables + Bulk + Binder are built and re-simmed (see Economy, "Tables sim"). Forge Box and Collector still lean cautious by 5–7 points.

## Decisions log (Nov 16 night, not built yet)

Decided with Evan after the Tables build. These override the sections below where they disagree; the sections get rewritten as each one is built.

**The complexity rule:** every mechanic has to explain itself in one line, on the thing itself (button, card, badge, sign), where you see it. If it can't, it gets cut. No new systems past this list before Friday.

### Decided

- **12 rounds, 4 Tables** (1–3, 4–6, 7–9, 10–12), bosses on 3/6/9/12. 4 twists, 4 sleeve offers per run. Antes for rounds 10–12 get set from the sim, not guessed.
- **Win condition.**
  - Solo: bust the rival, **or** have more money than them after round 12 (chip lead). Surviving alone is no longer a win.
  - Solo score = (your bankroll − theirs) × difficulty. Busting them zeroes their side, and a bust also banks a bonus for the rounds you skipped, so ending it early never scores worse than stalling. Bonus size comes from the sim's per-round bankroll growth.
  - Multiplayer: bust only, last bankroll standing.
- **Forge costs the Max**, paid to the rival, instead of what you've put in. **Underdog discount:** behind by 2× or more, forging costs the Min. Same threshold as Peek, so the underdog perks are one rule: "behind 2×: you peek and you forge cheap." Forge is unavailable if paying would bust you. Fold is unchanged (costs what you've put in, grinds +1 Value).
  - Still to confirm in the sim: this (G+) vs plain Max (G) vs one forge per Table (H) vs today (A), with a smart bot. 1.5× is the fallback threshold if 2× almost never fires.
  - Why not "forge = committed call, skip the house pay": it costs 2× ante + $2 when you'd win but $2 when you'd lose, so it rewards forging the hands you expect to lose. Why not "forge costs the current bet": the richer player acts first, so the leader gets Min forges. Why not flip the acting order so the underdog gets them: acting second with the bet in view is already the underdog's main edge.
- **Betting is four buttons for both players: Fold / Forge / Min / Max.** The second player sees the first player's choice, and buttons that don't apply grey out. If one went Max and the other Min, the Min player gets one prompt: **Match $X / Fold**. Same rules as before, but the words Call and Raise go away. Lower bankroll still acts second.
- **Tug-of-war bankroll bar** between the two players, Pokémon-HP-bar style. It shows who's ahead (chip lead), has a marked **2× line**, and the underdog side lights up its perks (👁 peek, 🔨 cheap forge) past it. The Forge button shows its price ("Forge $2 · underdog" vs "Forge $8").
- **Card places are hand, deck, discard, binder.** That's it. The display case holds collectibles, not cards.
- **Sleeves are literal sleeves on all of your cards, and they stack** (double, triple sleeve), one layer per sleeve bought. The card frames show the layers. **Every sleeve protects:** sleeved cards don't degrade (Damaged cards don't tear, grading can't come back "damaged in shipping"). On top of that, each sleeve type gives a small per-card buff. The current pool (restock, display riser, interest cap, bulk deal, hot market, big hands) gets replaced, since those aren't card effects. The new pool has to stay gentle, because a per-card buff stacked 4 deep scales hard. Pool still open.
- **Money is a Balatro-style tally at the end of the round**, and it has fewer sources so the tally stays short: **Pot** (won/lost), **House** (+$2 for showing down, +2× ante for winning, more at the boss per win this Table = momentum, folded in), **Interest** (+$1 per $10, max 2).
- **Shopkeeper is a posted sign, not a conversation.** 3 seeded traits per run, no rapport, each a one-line rule on the counter (e.g. Grumpy: prices +$1, restocks free · Superstitious: won't buy ♠ · Closing Down: everything $1 cheaper each shop · Collector: pays 2× for graded cards · Chatty: shows the next boss twist early). His speech bubble reacts for flavor. The question menu is gone.
- **Knockoffs are a card modifier** from Off-Brand packs, and they **take the stamp slot**: a card is at most a Finish + one Stamp-or-Knockoff.
  - **Beer-stained** stays: +6 Hype and it's **stuck to another card**. They're drawn together and played together, and you can't split them by reordering.
  - **Crayon** (any rank, 0 Value), **Marked** (+1 Grade, the rival sees it face-up) and **Wrong Suit** (counts as two suits) stay.
  - **Bent** and **Counterfeit** are cut. Bent is confusing with the pile, and Counterfeit needed shopkeeper conversation.
- **Packs lean toward build lanes.** Each pack type has higher odds for certain card types, printed on the pack, so restocking to find the pack your build wants is a real choice. You should be able to steer toward a build without every pull being a Foil or Holo, and without the pool being so wide you never hit your lane. Lanes and odds still open, plus a few new unique card types beyond finishes (ideas below).

- **Grading is instant.** Pay $3, the grade shows right away: 1d10 + freshness, cap 10. A 1–3 is still "damaged in shipping" (sleeves protect against it). **One grade per shop visit.** No card is ever away, so there's no hidden fifth place.
- **Gold Border stays.** It's the money-lane card, and "+$3 if you win the showdown with it, −$3 if you lose" fits in one line.

- **Friday scope: all of it.** Every decided item ships for the demo. Build a seeded "golden path" demo run on top, so the 5 minutes the judges see are guaranteed to show off the good stuff.

### Proposed, waiting on Evan

- **Shippers at the grading desk** (pick one per grade, the odds are on the button):
  - **La Poste** $2: 1d10 + freshness, a 1–3 comes back damaged.
  - **Chronopost** $4: same roll, never damaged in shipping.
  - **Fourgon blindé** (armored van) $7: roll twice, keep the better one, never damaged.
- **Scratchers replace inserts** (French: *tickets à gratter*), sold at the register like a real corner store: 1–2 per shop, $2–4, plus the odd one in Collector packs. You scratch it on the spot and it resolves right away, no slots to hold. Each scratcher type names its pool up front ("Code Scratcher: levels up one of your hand types"), so you know what you're gambling on. The planned inserts become scratcher types: Code (level a hand), Checklist (change a card's suit), Wishlist (binder card → deck), Grail (rare jackpot).
- **Cut streaks.** Small money, and nobody tracks them.

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

- Solo is a **1v1 duel against one persistent rival** who plays by the same rules you do: it opens its own starter box (seeded), drafts, shops, forges and gets paid. Same rules as multiplayer, so the engine and balance carry over.
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

**Special cards** (Forge Box Twins, Bargain Damaged, Collector Foils) each land in a **different row**. So any pick keeps all but at most one of them, and dropping one costs you its whole row. Dropping a special is a real choice, not bad luck.

| Box | Box contents (32) | Twist |
|---|---|---|
| Classic | 7 through A | First mulligan each Table is free (no hand size cost) |
| Forge Box | 7 through A, a Q★ Twin and K★ Twin swapped in | Starts with Forge Hammer in the case |
| Suited | 7 through A in ♥ and ♠, two copies of each | Flush scores −2 Hype |
| High Roller | 7 through A | Start with $30, every ante and max +$1 |
| Bargain Bin | 7 through A, 3 Damaged | Every paid pack costs $1 less |
| Collector | 8 through A (28) + 4 Foil copies of random cards from it | Only 4 display slots |

Suited used to be 2 through A (26) and Collector 8 through A with 4 of them Foil (28). Both got padded to 32 for the draft: Suited went to two copies of 7–A so it matches the other boxes' ranks (more pairs, still only 2 suits), Collector keeps its 8–A identity and the 4 Foils became extra copies instead of swaps.

The rival's box is `pick(OFFERED)` from `seed:rival`, it drafts with `autoDraft` (drop the weakest row). The old 52-card deck is kept as `standard` in the sim only (drafts 3 rows of 13 = 39).

Forge Box first had "forging costs half your stake" and that hit 98% for cautious, so it got the starting Forge Hammer instead.

## Round flow

Changing: see Decisions log at the top. (four-button betting, forge costs the Max.)

1. **Shop** (skipped before round 1, you start with a free pack instead). Pulls get sorted Deck or Binder (see Binder), selling happens from the binder.
2. **Deal.** At the start of a Table (rounds 1, 4, 7) everything shuffles into one pile. Every round you're dealt a **fresh hand of 8** (9 with Deck Box, minus 1 per mulligan you've taken this Table). **Mulligan**: throw back any number, they go into the pile, redraw one fewer (see Deck).
3. **Lock in 1 to 5 cards.** Both players lock at the same time. Locked cards can't change. The rival sees your hand size and how many times you mulliganed, never how many cards you locked or which.
4. **Ante** is paid automatically (the round's Min).
5. **Betting.** The player with the lower bankroll acts **second** (tie: alternate, player first on odd rounds).
   - First player: `Fold` / `Forge` / `Min` / `Max`.
   - Second player sees that, then: `Fold` / `Forge` / `Call` / `Raise` (raise only if first bet Min, raises to Max).
   - After a raise the first player can only `Call` or `Fold`. Max 3 steps.
6. **Showdown** if nobody folded. Both appraisals count up side by side, then reveal. Winner takes the matched bet from the loser, plus the house bonus (Momentum at the boss, see Deck). Tie = nobody pays beyond the ante. Gold Border cards settle their side bet.
7. Fold or Forge: you lose what you've put in (the ante, or Min if you fold after a raise). Opponent takes it.
   - **Fold** mucks your **whole hand** to the discard, and grinds your highest locked card: same card, **+1 Value forever** (the meme build). That's the only thing a fold gives back.
   - **Forge** needs at least a Pair. It's the real merge (below). The rest of the hand is mucked like a fold, and the new forged card goes into the current pile.
8. **Cleanup.** Played cards go to the discard and stay out until the next Table. Cards you were dealt but didn't play go back into the pile. Forged-away and torn cards are gone for good. Nothing stays in your hand.

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
- **Fold mucks your whole hand** to the discard, like folding in poker. Forge does too (forge is a fold). So sacking the cheap rounds burns pile and leaves you a short hand at the boss.
- **Mulligan:** throw back any number, they go into the pile, and you redraw **one fewer**. Your hand size drops by 1 for the rest of the Table. There's no mulligan budget: the hand-size cost limits it. Classic's first mulligan each Table is free. Cold Deck means no mulligans that round.
- **Running out:** if the pile can't deal a full hand you get a short one. If it can't deal any cards, you lose the round.
- **What the rival sees:** your hand size and how many times you mulliganed. Never how many cards you locked or which ones (no card backs that give the count away). Knockoffs like Marked can still show a card face-up.
- **New cards mid-Table:** pulls you put on Deck and newly forged cards are shuffled into the **current** pile.
- The deck viewer (what's left in my pile, what's in my discard) is required UI. The test UI has one (click the Deck chip): pile sorted so it doesn't leak draw order, discard, binder.
- Rng: all pile shuffles use one stream per round (`seed:round:pile`), reset at the start of each round, so a shop restock never changes what you're dealt. Same seed + same picks = same deals.
- Mulligan order: the redraw comes off the top first, then the tossed cards get shuffled into the pile, so you can't redraw what you just threw back.
- An empty hand loses the round as a fold at the ante (`forfeit` in betting.ts), even on a boss round. Both empty = nobody pays.

### Boss stakes without sacking rounds 1–2

- Folding mucks your whole hand, so a sacked round costs boss cards, not just the ante.
- **Momentum:** the boss's house bonus is **2× ante plus 1× ante for every showdown you won earlier in that Table** (max +2). Win both early rounds and the boss is worth 4× ante to you.
- Folding already pays no paycheck and resets your streak.

### Bulk (the forge-thinning fix)

Built Nov 16. Replaces the deck floor. Forge thinning was: every forge shrinks the deck (2–5 cards become 1), so a bot forged down to a few supercards. Under Tables that got worse, because unplayed cards return to the pile, so a deck of 8 forged cards plays one self-contained supercard (a Household is a full house alone) every round. Evan didn't want a minimum deck size as the fix. Codex came up with the same idea independently ("Slag").

- **Every card a forge eats beyond the first leaves a Bulk card** in your deck. Forging a pair gives 1 forged + 1 Bulk, trips 1 + 2, a full house 1 + 4. Forging never shrinks your deck: your power concentrates, but it gets diluted.
- **Bulk is a weak stone card:** no rank, no suit, never part of a poker hand. When locked in it always scores **+5 Value** (the one exception to "kickers don't score"). It can't be forged and sells for $0, so it can't go to the binder.
- **Getting rid of it:** play it as junk (it's out for the rest of the Table), or pay the shop to **bin one for good**: $2, then $3, $4… for the rest of the run (Slay the Spire style paid removal).
- **No deck floor.** Forging can't thin you. Damaged tears and paid Bulk removal still can, and "if the pile can't deal any cards, you lose the round" still stands.
- **Bulk builds** (ideas, not in the pool yet): **Bulk Bin** each Bulk scored +2 Hype, **Bulk Buyer** +$1 per Bulk you play, **Thin Binder** becomes "+1 Grade if your deck has no Bulk".
- Numbers (+5 Value, removal prices) are first-pass, see the Tables sim.
- Code: a Bulk card is a normal `Card` with `bulk: true` (rank/suit are placeholders). `evaluateHand` filters it out, `appraise` adds +5 Value per played Bulk. Folding a hand of only Bulk grinds nothing.

### Old carry-over deck (replaced by Tables)

Before Tables: three piles persisted for the whole run, you kept the 3 unplayed cards in hand and drew up to 8, locked exactly 5, one free mulligan per round (Classic 2), reshuffled the discard when the draw pile ran dry, deck floor 16. Gold Border paid +$2 per round held. Row draft win rates from that era (before = 26–32 card decks, after = row draft to 24, floor 12):

| Box | greedy before → after | cautious before → after | random before → after |
|---|---|---|---|
| Classic | 44.1 → 47.7 | 76.1 → 65.6 | 19.1 → 22.0 |
| Forge Box | 51.7 → 57.6 | 86.5 → 88.1 | 23.6 → 27.8 |
| Suited | 47.1 → 52.3 | 71.6 → 69.5 | 20.5 → 22.7 |
| High Roller | 49.6 → 58.6 | 84.0 → 77.4 | 26.4 → 28.9 |
| Bargain Bin | 60.7 → 67.7 | 81.5 → 76.6 | 28.0 → 33.3 |
| Collector | 46.6 → 55.3 | 85.7 → 79.7 | 22.5 → 26.3 |

## Binder

Every card you pull goes to your **Deck** or your **Binder**. That's the only choice when you rip a pack. You keep everything you pull, but the deck only grows when you choose it. This replaces the "keep 1–2 per pack" idea, which made packs feel like a draft instead of a booster.

- **Deck**: shuffled into your current pile (see Deck).
- **Binder**: never drawn and never played. It's your sell pile and the thing binder builds score off. It doesn't count toward your deck size.
- **One-way.** Binder cards don't go back to the deck. The only exception is rare inserts (see Cards), e.g. a **Wishlist** that moves 1 binder card into your deck.
- **Defaults:** special cards (finish, stamp, forged, graded) start on Deck, plain cards on Binder. Tap a card to flip it, then Done. Most rips are one tap.
- **Bots** use the same default sort. They hold the binder for STONKS: sell hot cards right away, sell everything once the binder is past 6 cards or they're under their reserve.
- **Selling only happens from the binder**, at the shop. A deck card can't be sold directly.
- Starting decks don't touch the binder: the row draft builds the deck, the dropped row is gone.
- Binder build collectibles (ideas, not in the pool yet): **Completionist** +1 Hype per 3 binder cards, **Full Set** +1 Grade if the binder has all 4 suits of one rank, **Mint Condition** binder cards keep their grading freshness.

### STONKS

STONKS is the binder market (it replaces a live ticker, and there are no trades). Each shop it posts one **hot** thing, seeded per round: a rank, a suit, or a finish. Binder cards that match sell for **3×** (rank or suit) or **2×** (finish). It's shown in the top bar with the next tournament twist, so holding binder cards for a hot market is a real choice versus selling now. Multipliers are first-pass, tune them in the sim. Code: `src/engine/sleeves.ts` (`stonksFor`, stream `seed:round:stonks`). Hot ranks roll 7–A only since every box is 7–A. A Wild Suit card doesn't count as the hot suit.

## Forge

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
- Every card eaten beyond the first leaves a **Bulk** card (see Deck), so forging never shrinks the deck.

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
- After each round: **Paycheck +$2 only if you went to showdown** (fold/forge rounds don't get paid), **House bonus: the showdown winner gets 2× the ante** on top of the pot, **Interest +$1 per $10** held (max +$2), **streak bonus**. All of it comes from the house, so it's the same rule in multiplayer.
- Why: before this, paycheck + interest + selling the free pack was ~$7/round no matter what, more than the ante through round 5. Folding every hand was break-even, so the cautious bot won by never playing. Balatro does the same thing: blind rewards are most of your income, interest is a capped bonus.
- **Hot Streak**: +$1 per consecutive win (max +$3). **Cold Streak**: +$1 per consecutive showdown loss (max +$3). Fold/Forge **resets** your streak (otherwise folding every round farms the cold streak).
- **Comeback**: lower bankroll acts second. Behind by 2× or more: **Peek** at 1 of the leader's locked cards before betting.
- **Gold Border** settles inside the table money, before the bust check, so a −$3 side bet can bust you.

### Tables sim (Nov 16, evening)

Tables, Bulk, Binder + STONKS, Momentum, Gold Border side bet, Sleeves and grading are all built. Win rate %, 1000 runs each, seed `sim`. Before = the Duel sim table below (old carry-over deck, floor 16). After = Tables + everything above, bots sort pulls and hold the binder for STONKS, bots buy a sleeve when they can afford it over their reserve and bin one Bulk a shop when they have $4 spare.

| Box | Rival | greedy before → after | cautious before → after | random before → after |
|---|---|---|---|---|
| Classic | Easy | 91.2 → 87.5 | 95.6 → 88.4 | 79.9 → 74.1 |
| Classic | Medium | 63.7 → 69.4 | 58.5 → 64.3 | 42.7 → 46.5 |
| Classic | Hard | 52.4 → 58.2 | 52.9 → 57.1 | 30.4 → 36.0 |
| Forge Box | Medium | 71.3 → 76.5 | 74.1 → 81.2 | 49.9 → 56.9 |
| Forge Box | Hard | 60.7 → 65.9 | 71.9 → 73.1 | 40.2 → 45.3 |
| Suited | Medium | 64.1 → 67.4 | 64.8 → 64.7 | 46.3 → 45.4 |
| Suited | Hard | 55.5 → 56.8 | 59.0 → 58.7 | 31.9 → 35.4 |
| High Roller | Medium | 76.3 → 78.0 | 70.6 → 73.6 | 55.9 → 58.3 |
| High Roller | Hard | 64.7 → 68.1 | 65.4 → 66.2 | 44.3 → 46.7 |
| Bargain Bin | Medium | 79.5 → 82.5 | 70.9 → 71.5 | 59.2 → 60.2 |
| Bargain Bin | Hard | 69.1 → 75.5 | 67.1 → 64.4 | 47.1 → 51.2 |
| Collector | Medium | 68.8 → 74.3 | 71.5 → 77.0 | 50.5 → 49.8 |
| Collector | Hard | 57.7 → 63.2 | 65.1 → 68.3 | 38.4 → 43.6 |

- **`REF_SCORE` changed how it's calibrated.** It used to be the rival's p50 at *showdown*, which runs ~2× the p50 of every dealt hand because bots fold the weak ones. Under Tables, mulligans cost hand size so bots mulligan less and see weaker hands, and the showdown-based number made the rival fold ~35% of rounds. Random beat Medium 67–75% until it was recalibrated. The sim now prints the median of **every hand the rival is dealt**, and that's what `REF_SCORE` is.
- Cautious vs greedy is −11 to +7 now (was −8 to +11). Greedy wins or ties on Classic, Suited, High Roller and Bargain. **Forge Box (+5 Medium, +7 Hard) and Collector (+3, +5) still lean cautious**, smaller than before.
- **Easy is less of a walkover**: 87–88 for greedy/cautious (was 91–98).
- **The pile never runs dry**: 0.00 rounds lost to an empty pile per run, in every config. Decks are 20–24 cards at minimum, and even three folds in a Table only muck 24. The "sacked rounds cost boss cards" pressure is real for hand quality but never empties the pile. If we want that pressure, try a smaller hand, a smaller deck, or folds that muck more.
- **Bulk**: cautious makes 7–10 Bulk a run (forge is its fold) and bins 1–2. Greedy makes 3–5. Cautious decks end at 20–24 cards (p50 23), so Bulk is doing its job: forging can't thin you.
- **Greedy decks still bloat**: final deck p50 58–76, p90 ~90. The binder takes the plain pulls, but every special card defaults to Deck. Hard rivals bloat to ~80 too. Worth trying: bots only deck special cards that fit their hand, or deck-size pressure (Thin Binder at 18 is unreachable for greedy).
- Bots buy ~1 sleeve a run (0.4–1.4).

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

Changing: see Decisions log at the top. (knockoffs: Bent and Counterfeit cut, Beer-stained is a stuck pair.)

Standard 52. Each card can have one **Finish**, one **Stamp**, one **Knockoff** (Off-Brand only).

- Finishes: Foil (+30 Value), Holo (+4 Hype), Prism (+1 Grade), Misprint (+0..+8 Hype, rolled per hand).
- Stamps: 1st Edition (+1 Hype each time it scores, permanent), Signed (scores twice), Gold Border (a bet inside the bet: if it's played and you win the showdown +$3, lose the showdown −$3, fold = nothing; replaces "+$2 if held in hand", which Tables kill and which was Balatro's Gold card), Damaged (+1 Grade, 1 in 4 to tear and be destroyed), Graded 1–10 (grading desk only).
- Knockoffs: Crayon (any rank, 0 Value), Beer-stained (+6 Hype, card to its right is always played with it), Marked (+1 Grade, face-up to opponent from lock-in), Counterfeit (acts as Foil, an Honest shopkeeper confiscates it on sale), Bent (1 in 3 drawn twice), Wrong Suit (also counts as a second suit).
- Inserts (hold 2, our version of Balatro's tarots): Code Card (level a hand), Checklist (edit cards), Grading Slip, Wishlist (rare, move 1 binder card into your deck), Redemption (rare, can give a Grail).
- Joker cards (max 2 in deck): Bound, Double-or-Nothing, Bluffing, Courtier, Catalyst, Sticky Fingers, Rival's.

### Grading

Send a card off for one round. Grade = 1d10 + freshness (+3 pulled this round, +2 last round, +1 two rounds ago), cap 10.
- 1–3: damaged in shipping, −1 Hype when scored
- 4–9: +grade/3 Hype (rounded down)
- 10 Gem Mint: +1 Grade

Built Nov 16 (`sendToGrading` in run.ts), from the deck (pile or discard) or the binder. The grade is rolled when you send it, revealed when it comes back at the next shop, back to wherever it came from. The starting deck is never fresh. Bulk and already graded cards can't go. Bots don't grade yet.

## Sleeves (run-wide upgrades)

Changing: see Decisions log at the top. Sleeves become literal stacking sleeves on all your cards, with protection built in. Everything below is the current build and gets replaced.

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

Naming clash fixed: Penny Sleeve is now **Lucky Penny**, Card Sleeves is now **Smith's Apron** (ids unchanged). Top Loader stays, it's a one-card holder, not a sleeve.

## Display case

5 slots (Display Riser: 6). Sell to make room. Collectibles trigger left to right.
Pool lives in `pitch.html` (`POOL`), being ported to `src/engine/collectibles.ts`.

Shop: 2 random collectibles per shop. **Nothing repeats until the whole pool has been shown.** When it rolls over, the shopkeeper gets salty ("what, you too good for my stuff?"): rapport drops and prices +10% for the rest of the run.

## Shopkeeper

Changing: see Decisions log at the top. Posted trait sign, no question menu.

3 seeded traits (Honest, Liar, Greedy, Chatty, Grumpy, Superstitious, Nostalgic, Closing Down, Collector) + rapport. Questions: deals, is this pack good, what're you buying, can you knock the price down, how's business.

## Tournament rounds

Rounds 3/6/9 are the boss blinds: the last round of each Table, played with whatever is left in your pile. The house bonus there uses Momentum (see Deck). Code: `src/engine/twists.ts`.

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

### Timers (multiplayer only)

Solo has no timers. Multiplayer uses the same screens with a clock, and every timeout has a default so nobody waits on an AFK player. All pairs bet at the same time, so a round waits only for the slowest pair.

| Phase | Timer | Timeout does |
|---|---|---|
| Starter box + draft | lobby countdown | first offered box, auto-draft (drop the weakest row) |
| Shop | 30s (45s before a tournament round) | bought packs auto-rip, unsorted pulls keep their Deck/Binder default |
| Deal, mulligan, lock in | 20s | lock the selected cards (the best hand is pre-selected) |
| Each betting decision | 10s | **Min, then Call** (keeps showdowns happening; an AFK player bleeds money, not the table's time) |
| Forge trait pick | 10s | autoKeep |
| Showdown count-up | ~6s, skippable | |

About 30s per round for a fast player, under 2 minutes worst case.

## Build tiers

1. **Core**: engine, round flow, betting, forge, mulligan, scoring count-up + sound, packs, display case, tournament rounds, Tables, Binder, Bulk, Momentum. Solo vs bot. Done.
2. **Identity**: grading, STONKS, Sleeves and the Gold Border side bet are built. Still to build: shopkeeper traits + rapport, knockoffs, Joker cards, inserts (Wishlist etc.), the rest of the pool, bots that grade.
3. **Multiplayer**: ghost opponents, live BR, spectator betting, leaderboard.
