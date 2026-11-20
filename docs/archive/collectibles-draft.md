# Flambeur: display case pool (draft for review)

## Game summary
Booster-pack poker roguelike (Balatro-like) for a 1-week hackathon. Standard 52-card deck.
Each round: auto-pay the **ante** (round's min bet). Draw 8, choose 5. Then pick one:
- **Fold**: lose ante; hand returns to deck.
- **Forge**: lose ante; fold and merge the 5-card hand into one forged card
  (pair → card counts as a pair alone; trips → rank scores ×2; straight → counts as two adjacent ranks;
  flush → counts as every suit; quads → counts as trips alone). Thins the deck.
- **Play**: bet Min / Mid / Max (min and max climb each round). Showdown vs an opponent:
  each hand scores **Chips × Mult**; higher score wins. Win: +your bet. Lose: −your bet.
**Bankroll is both life and shop money.** Run ends at $0.

Modes: seeded solo vs bot opponents; 10-player Battle Royale (paired each round, last bankroll standing).

Pulls come from packs (commons → insert → rare slot):
- **Playing cards** with one Finish (Foil +50 chips, Holo +10 mult, Prism ×1.5 mult, Misprint +0–20 mult rolled)
  and one Stamp (1st Edition: +1 mult each time it scores, permanent; Signed: scores twice;
  Gold Border: +$2 if held at round end; Damaged: ×2 mult, 1 in 4 to tear; Graded 1–10 from grading desk: ×(1+grade/10)).
- **Knockoffs** (Off-Brand packs only, upside+downside): Crayon (any rank, 0 chips), Beer-stained (+10 mult, card to its right is always played with it),
  Marked (×2 mult, face-up to opponent before they choose), Counterfeit (acts as Foil; Honest shopkeeper confiscates on sale),
  Bent (1 in 3 drawn twice), Wrong Suit (also counts as a second suit).
- **Inserts** (one-use, hold 2): Code Card (level a hand type), Checklist (edit cards), Redemption (rare, risky, can summon a Grail).
- **Collectibles** (jokers): 5 display-case slots, trigger left→right, sell for half. Rarity weights: Common 65 / Uncommon 27 / Rare 8; Grails via Redemption only.
  Some are **rolled** on pull (random suit/rank baked in).

Shop: pack wall (Free always present / Collector / Off-Brand / Repack = cards other players sold), singles case, grading desk,
sell/trade-in, restock (1,2,3… cost), shopkeeper with 3 seeded traits (Honest, Liar, Greedy, Chatty, Grumpy, Superstitious, Nostalgic, Closing Down, Collector) and rapport.

## Design rules (from LocalThunk / Balatro)
1. Theme teaches: real TCG-collector lingo only.
2. Numbers go up: Chips × Mult.
3. Hook into broad game elements; never synergy with one specific other collectible.
4. Effect text ≤ 4 short lines.
5. Strong = conditional; mix in boring reliable ones.
6. Collectibles never introduce new mechanics; only bend existing ones.
7. Forging is spice, not the spine; collectibles carry the run.
8. Art: one shared acrylic-stand frame, 32×32 icon per item, all animation is code tweens. Rolled variants overlay a suit/rank glyph.

## Pool (S = Steady, B = Build-around)

| # | Name | Rarity | Hook | Type | Effect |
|---|---|---|---|---|---|
| 1 | Penny Sleeve | Common | flat | S | +4 mult |
| 2 | Top Loader | Common | flat | S | +30 chips |
| 3 | Team Bag | Uncommon | case | B | +3 mult per empty display slot |
| 4 | Rubber Band | Common | hand type | S | Pairs give +8 mult |
| 5 | Card Stack | Common | hand type | S | Three of a kind gives +12 mult |
| 6 | Straight Edge | Common | hand type | S | Straights give +80 chips |
| 7 | Color-Sorted Binder | Common | hand type | S | Flushes give +10 mult |
| 8 | House Rules | Uncommon | hand type | B | Full House gives ×2 mult |
| 9 | Draft Chaff | Common | hand type | S | High Card hands give +40 chips |
| 10 | Face Binder | Uncommon | rank | S | Scored face cards give +5 mult |
| 11 | Low Ball | Common | rank | S | Each scored 2–5 gives +20 chips |
| 12 | PSA 10 Slab [rank] | Rare | rank (rolled) | B | Scored [rank] give ×2 mult |
| 13 | Odd Lot | Common | rank | S | Scored A,3,5,7,9 give +3 mult |
| 14 | Even Stack | Common | rank | S | Scored 2,4,6,8,10 give +20 chips |
| 15 | Playmat [suit] | Common | suit (rolled) | S | Scored [suit] give +3 mult |
| 16 | Two-Tone Sleeves | Uncommon | suit | B | ♥/♦ count as one suit; ♠/♣ count as one suit |
| 17 | Suit Sorter | Uncommon | suit | B | ×1.5 mult if played hand has all 4 suits |
| 18 | Black Light | Uncommon | finish | B | Foil cards also give ×1.5 mult |
| 19 | Holo Lamp | Common | finish | S | Holo cards give +5 more mult |
| 20 | Prism Case | Rare | finish | B | Prism cards give ×2 instead of ×1.5 |
| 21 | Collector's Guide | Uncommon | finish | B | +1 mult per card with a Finish in your deck |
| 22 | Autograph Pen | Uncommon | stamp | B | Signed cards score a third time |
| 23 | First Print Run | Uncommon | stamp | B | 1st Edition cards gain +2 mult instead of +1 |
| 24 | Gold Leaf | Common | stamp | S | Gold Border cards pay $3 instead of $2 |
| 25 | Packing Tape | Uncommon | stamp | B | Damaged cards never tear |
| 26 | Crayon Box | Uncommon | knockoff | B | Crayon cards score their chips normally |
| 27 | Coaster | Common | knockoff | S | Beer-stained cards give +5 more mult |
| 28 | Sleight of Hand | Rare | knockoff | B | Your Marked cards are hidden from opponents |
| 29 | Bootleg Press | Uncommon | knockoff/pack | S | Off-Brand packs have +1 slot |
| 30 | Card Sleeves | Uncommon | forge | B | Forged cards give ×1.5 mult |
| 31 | Forge Rebate | Common | forge | S | Forging refunds half the ante |
| 32 | Cold Read | Common | fold | S | After you Fold or Forge, next hand +10 mult |
| 33 | Thin Binder | Rare | deck size | B | ×2 mult if deck has ≤ 40 cards |
| 34 | Deck Box | Common | hand size | S | Draw 9 instead of 8 |
| 35 | Complete Set | Rare | deck | B | ×0.25 mult per rank you own all 4 suits of |
| 36 | Poker Face | Uncommon | bet | B | +15 mult if you bet Max |
| 37 | Penny Pincher | Uncommon | bet | S | Bet Min: +$3, win or lose |
| 38 | Lucky Coin | Common | bet | S | 1 in 4 chance to double a pot you win |
| 39 | High Roller | Rare | bankroll | B | ×3 mult while bankroll < $10 |
| 40 | Price Sticker | Common | bankroll | S | +$1 each round you win |
| 41 | Piggy Bank | Uncommon | bankroll | B | +1 mult per $10 in bankroll |
| 42 | Sealed Box | Rare | bankroll | B | Does nothing. Sell value +$3 every round |
| 43 | Code Redeemer | Rare | insert | B | Code Cards level a hand type twice |
| 44 | Checklist Pad | Uncommon | insert | S | +1 insert slot |
| 45 | Mystery Insert | Common | insert | S | Round start: 1 in 3 to gain a random insert (if room) |
| 46 | Store Credit | Common | shop | S | First restock each shop is free |
| 47 | Pack Weigher | Uncommon | shop | S | See rare-slot glow before buying |
| 48 | Shop Regular | Uncommon | shop | S | Shopkeeper rapport starts maxed |
| 49 | Pity Timer | Uncommon | pack | S | Every 5th paid pack's rare slot is a collectible |
| 50 | Repack Specialist | Common | pack | S | Repacks cost $1 less and have +1 card |
| 51 | Grading Pass | Uncommon | grading | S | Grading returns same round; grade is at least 5 |
| 52 | Trash Talk | Uncommon | versus | S | Opponent's hand scores −5 mult |
| 53 | Scouting Report | Uncommon | versus | B | See 1 random card of opponent's hand before choosing |
| 54 | Giant Killer | Rare | versus | B | ×1.5 mult vs an opponent with a bigger bankroll |
| 55 | Alpha Ace | Grail | rank | B | Each scored Ace gives ×3 mult |
| 56 | The 1-of-1 | Grail | case | B | Copies the collectible to its right |
| 57 | Gem Mint Set | Grail | grading | B | Graded cards give +mult equal to their grade |
| 58 | Black Border Box | Grail | stamp | B | First hand each round: every played card is Signed |
