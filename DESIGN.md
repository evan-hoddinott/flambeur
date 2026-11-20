# Flambeur design (v2)

Booster-pack poker roguelike for the KSU AI Hackathon (IEEE AI Game Sprint + Nudox). Browser game.

This is the rules source of truth, and it matches the engine (`src/engine/`) as of the v2 build (Nov 18). The spec it was built from is `docs/V2.md`; where a tuned number here differs from V2.md, the sim moved it and the reason is in **Tuning (Nov 18)**. Numbers are tuned with the sim (`sim/econ.ts`), not by guessing. The v1 rules and their sim tables (mulligans, fold, Tables holding a pile, the chip-lead win) are in git history at `a923189`.

**The complexity rule:** every mechanic explains itself in one line, on the thing itself (button, card, badge, sign), where you see it. If it can't, it gets cut.

## Words

- **Hand**: one of the up to 3 plays in a round. The UI says "Hand 2 of 3". The 8 cards you hold are "your cards".
- **Round**: one duel against one opponent, best of 3 hands.
- **Table**: 3 rounds against the same rival. Round 3 of each Table is the boss.
- **The Sleeve**: your 2 insert slots. The run-wide upgrades that used to be called Sleeves are **Pochettes** in display text; code ids keep `sleeve`.
- **Flamber** (the button and the mechanic), **a flambé** (the act), **flambéed** (the result). Code ids keep `forge`.

## Run

- Pick a starter box (3 offered, seeded). It's dealt into **4 rows of 6, keep 3 = 18 cards** (see Starter boxes).
- **4 Tables × 3 rounds = 12 rounds.** Each Table a new rival sits down. Rounds 3, 6, 9, 12 are bosses: one twist and a bigger payout.
- You start with **$20** and you owe **Le Patron** (see Le Patron's marker).
- **Win (solo):** pay Le Patron's final payment after round 12. **Lose:** go bust, or miss a payment.
- **Score** = your bankroll after the final payment × difficulty (Easy 1, Medium 1.5, High Roller 2). Leaderboards are per seed per difficulty.
- **Difficulty** only changes the rival bots (how sharp they bet, how far along their build is). It never changes the rules.
- No shop before round 1. Every run has a visible seed; the daily seed is the same for everyone.

## A round

Code: `match.ts` (`enterRound`, `afterLocks`, `revealHand`, `resolveHand`, `settleRound`).

1. **Deal 8.** The whole deck shuffles at the start of every round (stream `seed:round:pile`). Nothing is held across rounds.
2. **Hand 1.** Before you lock you can:
   - **Discard**: toss 1–5 cards and draw that many. **3 discards per round** in total (Classic 4). Cold Deck: none.
   - **Use inserts** from the Sleeve on your cards.
   Then lock 1–5 cards as **Play** or **Flamber**. Both seats lock at once, and neither sees the other's.
3. **The opening bet.** The ante goes in, then Min or Max (see Betting). A seat that flambéd hand 1 isn't asked.
4. **Reveal hand 1.** Both appraisals count up side by side (skippable). The higher one takes the hand. A tie goes to nobody.
5. **Refill** back to your hand size from the pile. If the pile runs out, you play with what you have.
6. **Hand 2**: discard, inserts, lock, reveal.
7. If someone has 2 hands, or a knockout happened, the round is over.
8. **Hand 3**: lock, then **the last push** (not for a seat that flambéd hand 3), then reveal.
9. **Who wins the round:** a knockout, then more hands won, then the higher total appraisal across the round's hands (thrown hands count 0; Lowball: lower). Still tied: a tie round, bets come back, nobody gets the winner's House bonus.
10. **Payout** and the round-end tally (see Money).
11. **Spoils.**
12. **Cleanup:** everything goes back into the deck (played, discarded, unplayed, new ★ cards and Ash). Then a shop, unless the run is over.

- A hand you can't play because you have no cards counts as a thrown hand.
- **The rival sees** your card count, discards used and how many inserts are in your Sleeve. Never what you locked, or which inserts. Marked knockoffs still show face up once locked.
- Played cards grow (1st Edition) or tear (Damaged) when they score, same as before.

## Betting

Code: `betting.ts`. No fold, anywhere. The rule on the button:

> **Max: bet more on yourself. Win and the House pays it, lose and your rival takes it.**

- **Ante:** both seats pay the round's Min into the pot. The round's winner takes the pot.
- **Opening bet** (after locking hand 1): each seat picks **Min** or **Max**. The higher bankroll picks first, the lower one second after seeing it (tie: alternate by round). Max puts the difference (Max − Min) on yourself:
  - Win the round: the House pays you that amount.
  - Lose the round: it goes to your rival.
  - Tie round: it comes back.
- **Both on Max**: the winner gets the House's payment for their own Max and the loser's Max.
- **The last push** (after locking hand 3, only when there is a hand 3): anyone still on Min may switch to Max. Same order.
- You can only pick Max if you can cover it. Under the ante you're all-in for what you have.
- Acting second is the underdog's only perk. Peek is cut.
- High Stakes twist: everyone is on Max for the round, nobody is asked.
- **A flambé doesn't bet** (Nov 20, docs/FLAMBER.md §1b). If the hand you just locked is a Flamber, you aren't asked for that stage: you stay where you are (Min, or Max if you already chose it). When your turn in the order comes, you're logged on Min like a chosen Min, so the rival sees the same thing either way and nothing gives the flambé away. Flambé hand 1 and play hand 3: the last push still asks you. Both flambé hand 1: no betting at all. Code: `openStage(b, stage, sitting)`.

## Flamber

Code: `forge.ts` (`forgePlan`, `buildForged`), `flamberOut` in match.ts. One line on the button:

> **Flamber: throw this hand. A pair or better merges into a ★ card. Otherwise, one card you pick gets +1 Value.**

- **Pair or better:** the locked cards that score merge into one ★ card. It goes **straight into your cards** for the next hand and stays in your deck for good. Every card eaten beyond the first leaves an **Ash** card in this round's discard, which joins the deck at cleanup.
- **No pair:** you pick one locked card (if only one can be ground, it's that one). It comes back to your cards with **+1 Value forever** (the old fold grind; Participation Trophy makes it +10). The other locked cards go to the discard. Ash can't be ground.
- **The hand is thrown:** it scores 0, loses to any played hand, ties another thrown hand, and **can't be knocked out**.
- No money cost. The price is one of your three hands. It doesn't bet either (see Betting).
- **On screen it burns at the lock** (FLAMBER.md §1b, §2): the cards go to the middle and burn into the ★ card and Ash, the ★ card waits beside your hand, and at the reveal the rival's hand plays out alone against your empty spots. The engine still merges at the reveal (`resolveHand`), so both seats lock blind. The UI previews the ★ card with `buildForged` on a scratch id counter; Catalyst's extra ★ lives in `buildForged` (`plan.catalyst`) so there's one place that sets the tier.
- Over the trait cap you pick which traits the ★ card keeps (`forgeKeep`; the timeout default is `autoKeep`).

| Flambé a… | Trait | The flambéed card… |
|---|---|---|
| Pair | Twin | counts as 2 of its rank |
| Two Pair | Split | also counts as one of the other pair's rank |
| Trips | Triplet | counts as 3 of its rank |
| Straight | Bridge | counts as any rank inside a straight |
| Flush | Wild Suit | counts as every suit |
| Full House | Household | is a full house by itself. Shown as "Household (Ks over 8s)" (`traitLabel` in cards.ts) |
| Quads | Quad | counts as 4 of its rank |
| Straight Flush | Bridge + Wild Suit | both |
| Royal Flush | Crown | bridge + wild + permanent +1 Grade |

- **Tiers (TFT style):** new tier = highest tier merged + 1, max ★3. ★2 scores +5 Hype, ★3 +10 Hype and +1 Grade. Catalyst (Joker) adds one more ★.
- **Cross flambé:** the new card keeps the traits of flambéed cards it ate, plus traits for the primary and any bonus hands. It takes the rank/suit of the highest-tier flambéed card eaten. **Trait slots = tier.**
- Stamps and 1st Edition growth don't carry through a flambé; the best Finish does. Knockoffs don't carry.
- **Bonus hands:** primary hand = best hand with flambéed traits. Hands from the other families (rank, straight, flush) stack as bonus hands only if a flambéed trait made them happen. Plain cards never combo.

### Ash

- The burnt card a flambé leaves behind (it was called Bulk until Nov 20): no rank, no suit, never part of a poker hand. When played it scores **+5 Value**. It can't be flambéed or ground, sells for $0.
- Getting rid of it: the **Ashtray** service in the shop, $2, then $3, $4… for the rest of the run (Ash Deal pochette: always $1).
- No deck floor. Ash Bucket (+2 Hype each) and Le Ferrailleur (×1.5 Hype each) make it a lane.

## Knockout

Win a hand by **K× or more** and the round ends right there, a win for you.

| Table | 1 | 2 | 3 | 4 | Sudden death |
|---|---|---|---|---|---|
| K | 6× | 8× | 10× | 12× | 12× |

- The HUD always shows it ("K.O. 6×").
- A thrown hand can't be knocked out. Lowball: you knock out by being K× **lower**.
- A knockout pays +1× ante on the tally.
- V2.md started at 2/3/5/8. Hand scores spread multiplicatively (a high card 15 vs a straight 220 is already 14×), so at 2× almost every other round ended in a KO. See Tuning.

## Spoils

Code: `enterSpoils` / the `spoils` action in match.ts, `spoilsCard` in shop.ts. Spoils replace the free pack.

- After every round but the last, **3 cards go on the table** from stream `seed:round:spoils:<pair>`, so both seats see the same 3.
- **The loser picks first, then the winner, and the last card burns.** A tie round: the lower bankroll picks first.
- Either seat can **skip for +$1**. The next picker chooses from whatever's left.
- Cards: plain 2–A of random suits, 10% a finish, 5% a stamp, 3% a card type. No knockoffs or Jokers.
- A picked card goes straight into your deck (no Deck/Binder sort).
- Random on purpose: no "fits your deck" weighting, so the seed stays fair.
- A table where someone busted has no spoils (the Table ends, or the run does).

## Shops

Code: `shop.ts` (`stockShop`, `newShop`), `enterShop` / `nextShop` in match.ts. A small shop after most rounds, a big one between Tables.

| | Small (after rounds 1, 2, 4, 5, 7, 8, 10, 11) | Big (after rounds 3, 6, 9) |
|---|---|---|
| At the door | | Le Patron collects, and the scouting report for the next rival |
| Packs | 2, random from Off-Brand / Repack / Collector | 3 |
| Collectibles | 1 | 3, one always a payoff (×Hype rare) |
| Register | 1 scratcher | 2 scratchers |
| Service | the grading desk at a Table's 1st small shop, the Ashtray at its 2nd | the grading desk and the Ashtray |
| Pochette | | one offered, $10 |
| Always | restock ($1, $2… per shop), sell from the binder | same |

- Restock rerolls packs, collectibles and scratchers, never the pochette.
- Nothing repeats until the whole collectible pool has been shown. When it rolls over the shopkeeper gets salty: +10% prices for the rest of the run.
- Every pull from a pack goes to Deck or Binder (see Binder).

### Prices

| Thing | Cost | Sells for |
|---|---|---|
| Off-Brand pack (5, stamps and knockoffs) | $3 | |
| Repack (4, flambéed cards, Jumbos, Rookies) | $4 | |
| Collector pack (3, finishes, Stickers, Code Card, rare slot) | $6 | |
| Collectible C / U / R | $4 / $6 / $9 | half what it costs today (with the sign) |
| Scratcher | $3 | |
| Pochette | $10 | |
| Restock | $1, $2, $3… (resets each shop) | |
| Ashtray | $2, $3, $4… for the run | |
| Grading | La Poste $2 / Chronopost $4 / Fourgon blindé $7 | |
| Binder card | | $1, Finish $2, graded grade ÷ 2, Chase $10, × STONKS |

You always keep $1 to sit at the table: a buy that would leave you under $1 is refused.

### Shopkeeper

Code: `KEEPER` / `keeperFor` in shop.ts. A posted sign of **3 traits seeded per run** (`seed:keeper`), the same for every seat. No rapport, no questions.

| Trait | Sign says |
|---|---|
| Grumpy | Everything +$1, but the first restock each shop is free |
| Superstitious | Won't buy ♠ cards |
| Closing Down | Everything $1 cheaper every Table (never under $1) |
| Collector | Pays 2× for graded cards |
| Chatty | Tells you next shop's STONKS |
| Nostalgic | Pays 2× for 1st Edition cards |

### Grading

Once per shop visit that has the desk, ship one deck or binder card. It's away until the next shop and comes back graded. Grade = 1d10 + freshness (+3 pulled this round, +2 last round, +1 two rounds ago), cap 10. Ash and already graded cards can't go.

- **La Poste** $2: a 1–3 comes back damaged in shipping (−1 Hype when scored).
- **Chronopost** $4: same roll, never damaged (at least a 4).
- **Fourgon blindé** $7: rolls twice, keeps the better one, never damaged.
- 4–9: +grade/3 Hype. 10 Gem Mint: +1 Grade.

## The Sleeve and inserts

Code: `INSERTS` / `rollInsert` in shop.ts, `useInsert` / `tossInsert` in match.ts.

Your **Sleeve** holds **2 inserts**, drawn as 2 face-down cards by your hand. Scratch a ticket and its insert goes into the Sleeve. If it's full, the new one waits in a third slot and you must use or toss one (the new one or an old one) before doing anything else in the shop. **Grail** resolves on the spot and never takes a slot. Using an insert is one action.

| Insert | When | Does | Odds |
|---|---|---|---|
| Code | anytime | Level up a hand type (+15 Value, +1 Hype). The hand is rolled when scratched, so you see it | 18 |
| Checklist | in hand | Up to 2 cards become a suit you pick | 11 |
| Stylo | in hand | Up to 2 cards go up one rank (an Ace stays an Ace) | 11 |
| Broyeuse | in hand | Shred up to 2 cards for good | 9 |
| Photocopie | in hand | Pick 2: the first becomes a copy of the second (rank, suit, finish, stamp slot). Not Jokers or Ash; a beer stain doesn't copy | 8 |
| Reprint | in hand | A copy of 1 card goes into your deck (this round's discard) | 7 |
| Foil wrap | in hand | 1 card becomes Foil | 7 |
| Holo wrap | in hand | 1 card becomes Holo | 7 |
| Prism wrap | in hand | 1 card becomes Prism | 2 |
| Tampon | in hand | 1 card gets a random stamp: 1st Edition, Signed or Gold Border | 6 |
| Allumettes | in hand | Merge 2 same-rank cards in your hand into a ★ card now, without throwing a hand. The ★ card stays in your hand, 1 Ash goes to the discard | 6 |
| Wishlist | in the shop | 1 binder card shuffles into your deck (the Joker cap still applies) | 5 |
| Grail | on the spot | A free rare collectible (half its price if the case is full) or a Joker | 3 |

A Wishlist with an empty binder becomes a Code. In-hand inserts are used during a deal before you lock; Code works in the shop too.

## Le Patron's marker

> **You owe Le Patron. Pay at the door of the next big shop, or you're out.**

| Due | After Table 1 | After Table 2 | After Table 3 | After round 12 |
|---|---|---|---|---|
| Payment | $6 | $15 | $30 | $60, settle up |

- Paid automatically when you walk into the big shop, before anything else. Can't cover it, or paying it leaves you at $0, and you're out (counts as a bust).
- The HUD always shows the next payment.
- **Solo:** only you owe it. Rivals are guests at your table. **Multiplayer:** every player owes the same schedule. 1v1: if both pay off, the higher bankroll wins; both missing the same payment, the one with more money wins.

## Rivals (solo)

Code: `rivals.ts` (the roster as data, `buildRival`), `sitRival` in match.ts.

- All 10 masks are rivals. A run draws 4 different ones, seeded (`seed:rivals`).
- Each rival **sits down with a stack**: $20 / $40 / $70 / $120 at Tables 1–4.
- **Bust the rival** and the Table ends right there; you go straight to the big shop. Every skipped round pays **2× its ante** as a skip bonus, and the round counter jumps ahead.
- Nobody busts by the end of the boss: the rival leaves with what's left.
- **Built when it sits down:** an 18-card lane deck, plus **3 upgraded lane cards**, a level on each of its lane hands, and 1 lane collectible (or Code) for every Table before this one. Easy is a step behind, High Roller a step ahead plus a starting rare. It plays rounds and takes spoils like a player, but it doesn't shop and doesn't owe the marker.
- The scouting report in the big shop shows the next rival's mask, lane, case, deck size, stack and the boss twist.

| Mask | Lane | Deck leans toward | Case by Table (2 → 3 → 4) |
|---|---|---|---|
| Hare | Pairs | 3 copies of 4 ranks. Nervous: bets Min unless its hand is strong, never bluffs | Rubber Band → Les Jumeaux → Binder Divider |
| Pierrot | Low cards | 2–6 | Low Ball → Petite Monnaie → Odd Lot |
| Black Domino | Straights | Runs of connected ranks | Straight Edge → Ligne Droite → Code: Straight |
| Crimson Domino | Money | Gold Borders. Reckless: bets Max a lot, often on nothing | Price Sticker → Le Flambeur → Tournament Badge |
| Arlequin | Finishes | Finishes and Stickers | Black Light → L'Écrin → Lucky Penny |
| Queen of Hearts | ♥ flushes | Hearts, Holo | Color-Sorted Binder → Sommelier → Playmat (♥) |
| King of Spades | Flambé | ★ cards | Chalumeau → Flamme Bleue → Chef's Apron |
| Owl | Grade | Graded cards, Prism | PSA 10 Slab → Le Commissaire-priseur → Thin Binder |
| Scaramouche | Junk | Ash and knockoffs | Ash Bucket → Le Ferrailleur → Participation Trophy |
| Fox | Jokers | 2 Jokers, Signed cards | Specialist → Bis ! → Combo Platter |

- **Betting styles** as the Fiche says them (`glossary.ts`): Hare and Crimson Domino as above, every other mask "bets Max when its hand is strong, sometimes bluffs" (its difficulty's style).

| Difficulty | Bot style | Build step | Score × |
|---|---|---|---|
| Easy | `easy`: tight, never buys packs | one Table behind | 1 |
| Medium | `house` | on pace | 1.5 |
| High Roller | `sharp` | one Table ahead + a starting rare | 2 |

## Money

Code: `settlePair`, `payIncome`, `collect` in match.ts, constants in economy.ts. The round-end tally:

| Line | Amount |
|---|---|
| Pot | The winner takes both antes, plus the Max bets (see Betting) |
| House | +$2 to both seats every round. The round winner also gets 2× ante |
| KO | +1× ante more for winning by knockout |
| Momentum (bosses) | +1× ante for every round you won earlier that Table, max +2 |
| Interest | +$1 per $10 held, max +$2 (Deep Pockets: +$4) |
| Extras | Gold Border, Price Sticker, Poker Face, Double or Nothing |
| Skip | Busting a solo rival: 2× ante per round of its Table you skipped |

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ante | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 15 | 18 | 22 | 27 |
| Max | 5 | 6 | 8 | 10 | 12 | 16 | 20 | 25 | 30 | 36 | 44 | 54 |

- Sudden death past 12 (multiplayer only) doubles the ante every round.
- **Card money settles once per round**, not per hand (Gold Border, Price Sticker, Double or Nothing, Poker Face).
- The bust check comes before income: $0 after the table is out.
- **Gold Border** is a side bet, once per round: played in any hand, +$3 if you win the round, −$3 if you lose it (doubled by Double or Nothing).

## Starter boxes

Code: `starters.ts`. Every box is a full 2–A deck (Suited is ♥ and ♠ × 2 copies = 52), dealt 24 into **4 rows of 6**, keep 3 = **18 cards**. Specials land in different rows. Each row gets up to 2 labels: `pair-heavy`, `suited`, `high cards`, `low cards`, `connected`, or `mixed`.

| Box | Twist |
|---|---|
| Classic | 4 discards a round instead of 3 |
| Flambé Box | Q★ and K★ Twins swapped in, starts with Chalumeau |
| Suited | Only ♥ and ♠. Flush scores −2 Hype |
| High Roller | Start +$10 ($30). Every ante and Max +$1 |
| Bargain Bin | 3 Damaged cards. Paid packs cost $1 less |
| Collector | 4 Foil copies. Only 4 display slots |

`standard` (52 cards, no twist) exists for the sim only.

## Scoring: Appraisal

Code: `scoring.ts` (`appraise`).

```
Appraisal = Value × Hype × 2^Grade
```

- **Value**: card values 2–10 face, J/Q/K = 10, A = 11, plus hand base and bonuses.
- **Hype**: starts at the hand base. Can be fractional (one decimal shown); the total rounds down at the end.
- **Grade**: each +1 doubles the appraisal. Rare, from Gem Mint, Prism, rares.
- Only the cards that make the poker hand score (kickers don't). Ash is the exception: +5 Value.

**Order matters, like Balatro.** The display case triggers left to right, and a × multiplies whatever Hype has built up so far. So a + to the left of a × gets multiplied, and a + to the right doesn't. Scoring order: hand base → each scored card in play order (Value, finish, stamps, tier, grade, then each collectible's per-card effect, left to right) → Ash → each collectible's per-hand effect, left to right.

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

## Cards

Each card can have one **Finish**, one **Stamp or Knockoff**, and one **card type**.

- **Finishes:** Foil (+30 Value), Holo (+4 Hype), Prism (+1 Grade), Misprint (+0..+8 Hype, rolled per hand).
- **Stamps:** 1st Edition (+1 Hype each time it scores, permanent), Signed (scores twice; Bis !: 3 times), Gold Border (side bet, see Money), Damaged (+1 Grade, 1 in 4 to tear when it scores), Graded 1–10 (grading desk only).

### Knockoffs

Off-Brand packs only, in the stamp slot.

| Knockoff | Does |
|---|---|
| Crayon | **Counts as any rank, 0 Value.** In a hand it joins your biggest rank group or fills a straight gap; a lone Crayon is an ace. Its printed rank means nothing, so rank triggers (Low Ball, Odd Lot, Even Stack, Face Binder, PSA 10 Slab, Petite Monnaie, Face Cards Don't Score) skip it |
| Marked | +1 Grade when it scores. Once locked, the rival sees it face up |
| Wrong Suit | Also counts as a second suit for flushes |
| Beer-stained | +6 Hype when it scores. Stuck to another card: drawn, tossed and played together |

### Card types and pack lanes

| Type | Does | Where |
|---|---|---|
| Chase | Sells for $10 from the binder. Defaults to the binder | 3% per paid pack |
| Sticker | No finish of its own: wears the best finish of the other cards played with it | Collector |
| Rookie | +1 Value every round it spends in your deck | Repack |
| Jumbo | Scores its Value 3×, takes 2 of your 5 play slots | Repack |

Lanes: **Off-Brand** = stamps + knockoffs, **Repack** = pre-flambéed cards, Jumbos, Rookies, **Collector** = finishes, Stickers, Code Card, rare slot.

### Jokers

`JOKERS` in cards.ts, effects in match.ts. A Joker is a real playing card with a rule on top. **Max 2 in a deck.**

| Joker | Rule |
|---|---|
| Sticky Fingers | Win the round with it played in any hand: steal a random card from the rival's deck. Once per round |
| Double or Nothing | **Everything this round pays or costs ×2.** Played in any hand by either side: pot, Max bets, House, KO, Momentum, Gold Border, Price Sticker and Double Down's match, as far as the loser's bankroll goes. Interest isn't the round's, it's on what you hold |
| Courtier | Counts as whichever J, Q or K makes your best hand |
| Catalyst | Flambé with it: the new card comes out one ★ higher (max ★3) |
| Poker Face | Played in a round you lose: your Max bet comes back (was Bluff; id `bluff`) |
| Rival's Card | At each reveal it copies the rival's highest played card in that hand |
| Crayon Joker | Off-Brand only. Each time it's played it rolls one of the six above |

## Binder

- Every pack pull goes to your **Deck** or your **Binder**. Special cards default to Deck, plain ones to Binder.
- The binder is never drawn or played. It's your sell pile. It doesn't count toward deck size.
- **One-way.** Only a Wishlist moves a binder card back.
- **Selling only happens from the binder**, at the shop.

### STONKS

Each shop posts one **hot** rank, suit or finish (seeded, `seed:round:stonks`). Binder cards that match sell for **3×** (rank or suit) or **2×** (finish). Hot Market pochette: +1×.

## Pochettes (run-wide upgrades)

Code: `sleeves.ts` (ids say `sleeve`). One is offered in each big shop, $10, out of the ones you don't own. It doesn't reroll on restock.

| Pochette | Does |
|---|---|
| Big Hands | +1 hand size |
| Pochette Restock | First restock each shop is free (the Store Credit collectible did exactly this and is cut) |
| Hot Market | STONKS sells at +1× |
| Display Riser | +1 display case slot |
| Deep Pockets | Interest caps at +$4 instead of +$2 |
| Ash Deal | Emptying an Ash card always costs $1 |
| Pochette Archive | Damaged cards never tear, and grading never comes back damaged |

## Display case (collectibles)

Code: `collectibles.ts`. 5 slots (Collector box 4, Display Riser +1). Sell to make room (half price). **Left to right**: see Scoring.

A **lane** is a build. Cheap collectibles add; one rare **payoff** per lane multiplies. Payoffs are rare (8% weight) and the big shop guarantees one, so you see at least 3 a run.

| Payoff ($9) | Lane | Does |
|---|---|---|
| Les Jumeaux | Pairs | Each Pair in the hand: ×1.5 Hype |
| Sommelier | Flush | Flush: ×2 Hype if a scored card is Holo |
| Flamme Bleue | Flambé | Each scored flambéed card: ×1.5 Hype |
| L'Écrin | Finishes | ×1 Hype per different Finish scored (id `vitrine`, renamed so it doesn't clash with the display case) |
| Petite Monnaie | Low cards | Each scored 2–6: ×1.25 Hype |
| Le Ferrailleur | Ash | Each Ash played: ×1.5 Hype |
| Le Flambeur | Money | ×Hype = 1 + 1 per $20 you hold |
| Bis ! | Retrigger | Signed cards score 3 times, not 2 |
| Ligne Droite | Straights | Straight (or a straight bonus hand): ×2.5 Hype |
| Le Commissaire-priseur | Grade | Each scored graded card: ×1.5 Hype |

Feeders and filler: the rest of the pool in `collectibles.ts` (Rubber Band, Low Ball, Straight Edge, Price Sticker, Black Light, Color-Sorted Binder, Chalumeau, PSA 10 Slab, Ash Bucket, Specialist, …).

## Boss twists

Code: `twists.ts`. Rounds 3/6/9/12, one twist each, 4 different ones per run (`seed:twists`). The next one is always shown. Twists apply to all three hands.

| Twist | Rule |
|---|---|
| Sealed Only | Collectibles don't trigger |
| Face Cards Don't Score | J/Q/K still make the hand, but score no Value and trigger nothing |
| Ban Wave | One seeded suit: same as above |
| High Stakes | Everyone is on Max this round |
| Lowball | Lowest takes each hand, and you knock out by being K× lower |
| Double Down | The house matches the pot: the winner takes double |
| Hype Freeze | Only the hand itself gives Hype |
| Cold Deck | No discards this round |

Deuces Wild (V2.md §21, optional) isn't built.

## Multiplayer

Same rules as solo; the server runs this engine (`server/actor.ts`).

- **1v1:** one opponent the whole game. Both owe Le Patron.
- **Battle royale (up to 10):** pairs are re-drawn (seeded) at the start of every Table. A bot fills an odd seat. Last one standing wins. Sudden death past 12. Seat bots are full players: they shop and owe the marker.

| Phase | Timer | Timeout does |
|---|---|---|
| Draft | 45 s | first offered box, auto-draft |
| Deal (discards, inserts, lock) | 20 s per hand | the bot's best play |
| Bet | 10 s | Min |
| Spoils | 10 s | the bot's pick |
| Shop | 20 s small, 45 s big | leave |

## Bots and the sim

- `bot.ts`: `botAction(match, seat)`, one action at a time, same legality as people. Discards chase the best hand the cards could make (a 4-flush, a 4-straight, more of a held rank), within what the pile can replace. Flambé a weak pair on hand 1 or any pair once a hand up, never on hand 3. Max on strength vs `REF_SCORE`, again at the last push. Spoils: the best card for their deck. Inserts when they help right now. Styles: `greedy`, `cautious`, `random`, `nobuy` (greedy betting, never spends a cent), and the difficulty styles `easy`, `house`, `sharp`.
- `REF_SCORE` is the rival's p50 of **every played hand** on normal rounds (greedy vs Medium), bosses filled in from their neighbours. The sim prints it.
- `sim/econ.ts` prints per-round bankrolls and hand scores, the win rate and how runs end, and per round: decisions, hands, KO %, flambés; runs reaching round 12, shop share of your actions, inserts used, marker misses by Table.

## Tuning (Nov 18)

Every number V2.md marked *(tune)* that moved, before → after, with greedy vs Medium on Classic (1000 runs, seed `sim`):

| Knob | V2.md | Now | Why |
|---|---|---|---|
| Knockout K by Table | 2 / 3 / 5 / 8 | **6 / 8 / 10 / 12** | KO 42% → 25%, hands per round 2.19 → 2.46 |
| Rival upgrades per Table of growth | 2 | **3** | win 63.4% → 56.8% (Medium was over the 40–60 band) |
| `REF_SCORE` | v1 per round | per hand, recalibrated twice | the rivals' hands got a lot stronger late (round 11 p50 ~4300 vs 2187) |

Everything else stays at the V2.md first pass ($20 start, Le Patron $6/$15/$30/$60, stacks $20/$40/$70/$120, skip 2× ante, spoils +$1 and 10/5/3%, shop stock, prices, insert odds).

### Final sim (Nov 18, seed `sim`)

§0 targets, Classic, greedy vs Medium, 1000 runs:

| Metric | Target | v1 | Now |
|---|---|---|---|
| Your decisions per round | ≥ 5 | ~2 | **6.67** |
| Hands played per round | 2.2–2.8 | 1 | **2.47** |
| Runs that reach round 12 | ≥ 40% | 6% | **61.4%** |
| Win rate | 40–60% | 45% | **56.8%** |
| Rounds ended by knockout | 10–30% | none | **21.9%** |
| Shop share of your actions | ≤ 40% | 84% | **47.4%** (see Open problems) |
| `nobuy` win rate vs Medium | < 10% | 2.3% | **4.1%** |

Classic, 1000 runs each. Win % (mean score) · KO % · reach round 12 · marker misses by Table 2/3/4:

| You vs rival | Easy | Medium | High Roller |
|---|---|---|---|
| greedy | 90.0% (339) · KO 48% · r12 92% | 56.8% (265) · KO 22% · r12 61% · 24/48/63 | 5.5% (29) · KO 5% · r12 8% |
| cautious | 30.1% (51) · r12 47% | 4.0% (12) · r12 8% · 2/301/138 | 0.0% |
| random | 85.6% (305) · r12 88% | 43.2% (180) · r12 49% | 2.8% (14) |
| nobuy | | 4.1% (6) · r12 13% · 1/122/187 | |

Other boxes, 300 runs. Win %:

| Box | greedy vs Medium | random vs High Roller |
|---|---|---|
| Flambé Box | 77.7 | 8.3 |
| Suited | 54.0 | 4.3 |
| High Roller | 70.7 | 8.7 |
| Bargain Bin | 70.3 | 7.3 |
| Collector | 63.7 | 3.3 |

- No throws and no illegal moves in any config.
- Re-run after the engine-review fixes (2.0.1): greedy vs Medium 56.9%, KO 21.7%, 2.47 hands, r12 61.7%; `nobuy` 4.0%; random vs Hard 2.8%; all boxes clean. Within noise of the tables above.
- Cautious (never buys packs, bets scared) misses Le Patron's $30 at Table 3 in most runs: the marker is doing its job as the cull.
- Flambé Box (+21 over Classic for greedy) and Bargain/High Roller (+14) are the strong boxes; Suited is the weak one. Worth a pass with real players before touching.
- Easy is very easy for any policy that buys (86–90%).
- `REF_SCORE` from this run: `[300, 304, 548, 791, 805, 1501, 2196, 2232, 3256, 4280, 4140, 4223]`, within noise of the one in bot.ts, so it stays.

### UX content pass (Nov 18, `ENGINE_VERSION` 2.0.2)

docs/UX.md §10: Crayon's rank triggers, the Store Credit cut, Double or Nothing covering Price Sticker and Double Down. Classic vs Medium, 1000 runs, seed `sim`:

| Policy | Win % | Mean score | KO % | Reach r12 | Hands/round | Marker misses T2/3/4 |
|---|---|---|---|---|---|---|
| greedy, before | 56.9 | 270.5 | 21.7 | 61.7 | 2.47 | 23 / 47 / 69 |
| greedy, after | 59.7 | 286.7 | 21.9 | 63.9 | 2.46 | 17 / 52 / 61 |
| cautious, before | 3.9 | 11.0 | 2.6 | 7.7 | 2.46 | 0 / 303 / 142 |
| cautious, after | 3.7 | 9.9 | 2.7 | 7.8 | 2.46 | 0 / 306 / 150 |
| random, before | 44.3 | 187.3 | 17.5 | 49.5 | 2.48 | 53 / 58 / 75 |
| random, after | 45.4 | 198.7 | 17.9 | 50.7 | 2.49 | 61 / 54 / 58 |

- Greedy +2.8 points, still inside the 40–60 band. Most of it is the shop no longer stocking a dead Store Credit (one fewer common in the pool also reshuffles every later draw, so some is noise).
- Rival strength didn't move: greedy's `REF_SCORE` came out `[300, 308, 553, 798, 814, 1490, 2166, 2232, 3236, 4240, 4146, 4229]`, within noise of bot.ts, so it stays.


## Decisions log (v2 build, Nov 18)

Calls the spec didn't make, all the simplest option that fit its intent:

- **Bust before House:** the bust check runs before income, so $0 after the pot is out even though House +$2 comes after. Paying income first would keep everyone alive forever and nobody could bust a rival (§11). The engine review flagged it; kept on purpose.
- **Lowball tiebreak with thrown hands:** a thrown hand counts 0, so under Lowball it lowers your round total. Rare (1–1 and a total tiebreak), left as is.
- **Fixes from the engine review:** Gold Border is once per round (it was per card), Double or Nothing doubles the House lines too, a blanked card's finish no longer counts for Vitrine or Sommelier, Sticky Fingers sends a Joker past the cap to the binder, and a collectible sells for half its *current* price so Closing Down can't make a $1-buy/$2-sell loop. `ENGINE_VERSION` 2.0.1.
- **Le Patron at exactly $0:** paying that leaves you at $0 counts as a miss. You need $1 to sit at the table, same as the shop's $1 rule.
- **No spoils after a bust:** a round where someone busts has no spoils draft (the Table or the run ends there).
- **Allumettes:** the new ★ card stays in your hand for this hand, the Ash goes to the discard.
- **Photocopie:** a beer stain doesn't copy (it's stuck to one card), Jokers and Ash can't be either card.
- **Code rolls its hand when scratched**, so the Sleeve shows which hand it levels.
- **Sleeve overflow:** a third insert waits in a slot of its own, and the shop is blocked until you use or toss one.
- **Small shop services:** a Table's 1st small shop has the grading desk, its 2nd the Ashtray, as V2.md §8 says; with a rival bust the Table skips straight to the big shop, which has both.
- **Spoils "best card" for bots and timeouts** is value plus a bonus for anything special (`spoilsWorth`), no hate-drafting yet.
- **UI, Flamber with no pair:** with one groundable card it grinds that one; with more, the bar asks you to click the card that gets +1 Value.
- **UI, inserts in a hand:** click a Sleeve card to pick it up, select its cards (Photocopie reads click order: first becomes second), then Use. Checklist shows 4 suit tickets. Wishlist says "use it in the shop".
- **UI, the shop's Sleeve:** click it on the zinc for an overlay: use a Code or Wishlist, or toss.
- **Dev flags:** `/?quick&big` stops at the first big shop, `/?quick&auto` plays your seat with the `house` bot through the real UI to the end of the run (the browser smoke test), `&burn` makes it flambé every pair. `/flambe.html` loops the flambé beat.
- **A flambé doesn't bet (Nov 20).** Sim before → after, 1000 runs vs Medium, seed `sim` (win rate · decisions per round):

  | Starter | greedy | cautious | random |
  |---|---|---|---|
  | Classic | 59.7% → 59.6% · 6.70 → 6.58 | 3.7% → 3.8% · 6.34 → 6.34 | 45.4% → 45.4% · 6.20 → 6.14 |
  | Forge | 78.2% → 78.8% · 6.43 → 6.39 | 18.7% → 18.4% · 5.87 → 5.87 | 67.5% → 67.9% · 6.01 → 5.99 |

  All within noise: it only saves a decision (about 0.1 a round) and the bots rarely Max a flambé anyway. Rival p50 moved by under 1%, so `REF_SCORE` stays. Cautious never flambés; its tiny shift is the rival's own flambés no longer betting.

- **UX content pass (UX.md §10, 2.0.2):**
  - **Crayon** reads "Counts as any rank, 0 Value." Hand eval already did that; what didn't match was its printed rank still firing Low Ball, Odd Lot, Even Stack, Face Binder, PSA 10 Slab and Face Cards Don't Score (Petite Monnaie already skipped it). Now they all skip it, and a lone Crayon is an ace for the high card.
  - **Store Credit cut:** it and Pochette Restock both added one free restock per shop and stacked the same way (`freeRestocks`). The pochette stays.
  - **Vitrine → L'Écrin** (a jewel case, which is what its art already is). The id stays `vitrine` so the art keeps working, like `bluff` for Poker Face.
  - **Double or Nothing** reads "Everything this round pays or costs ×2." To make that true it now also doubles Price Sticker and Double Down's house match. Interest stays out: it's on what you hold, not the round.
  - **Household** shows as "Household (Ks over 8s)": `traitLabel(card, trait)` in cards.ts. `traitName` keeps the short "Household/8".
  - **Rival betting styles** have player-facing lines in `glossary.ts`.
- **Rules text map:** `src/engine/glossary.ts` (`entry`, `cardEntry`, `KEYWORDS`, `glossaryIds`) reads every Fiche line from the engine's own tables and constants (`VARIANTS`, `JOKERS`, `describe()`, `INSERTS`, `SLEEVES`, `TWISTS`, `RIVALS`, `KEEPER`, `HAND_BASE`, the scoring constants). Packs use their art names: Faux Frère (Off-Brand), Le Roussi (Repack), Sélène (Collector). `src/engine/compare.ts` (`deckDelta`) gives compare mode its counts and payoff lines.

## Open problems

- **Shop share is ~47% of the greedy bot's actions, target ≤ 40%.** Battle actions went from ~2 to 6.6 a round, but a greedy shop visit is ~6.3 actions (2.4 buys, 1.1 restocks, 0.6 sells, 0.5 ships, 0.5 sorts, 0.5 Ashtray empties (`binBulk`), leave). Lowering it means a lazier shopping bot, which only games the number. Worth a look with real players: if the shop feels long, batch-sell from the binder (one action) and auto-sort packs.
- **High Roller is a wall:** greedy wins 5.5% vs Hard, 56.8% vs Medium, 90% vs Easy. Dropping Hard's starting rare barely moves it (5% → 7%); it's the build step and the `sharp` betting. Hard isn't a §0 target, but the ladder wants a middle rung.
- **Deuces Wild** (optional twist) isn't built.
- **Cosmetics** (V2.md §17) aren't built. The Album (`src/ui/album.ts`), the near-miss margin and the god pull are.
