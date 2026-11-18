# Flambeur v2: art changes

What the v2 rework (`docs/V2.md`) means for the art: what to fix, what's missing, and what to draw new. It's written for the art agent. Every rule from `docs/ART.md` (palette, hue-shifted ramps, lit from above, no baked glows), `docs/CARDS.md` §0 and §0.5 (segmented sprites, one visual channel per thing) and `docs/READABILITY.md` (ticket colors, outlined text) still applies. Sizes are art px on the 640×360 stage. Ids follow the existing atlases (`art/duel/duel.json`, `art/shop/shop.json`, `art/cards/cards.json`, `art/collectibles/collectibles.json`).

Written Nov 18 by Claude from V2.md and an audit of the atlases. Evan hasn't picked any of the looks yet.

**Priority:** **P1** = the v2 screens are confusing without it. **P2** = it plays without it, but a placeholder shows. **P3** = later, or v1 debt that v2 doesn't depend on.

---

## 0. One call before drawing: two things named Sleeve

**Decided (Nov 18):** the new 2-slot insert pocket is **the Sleeve**, and the run-wide upgrades are renamed **Pochettes** in display text (what French TCG players call card sleeves). Restock Sleeve → Pochette Restock, Archival Sleeve → Pochette Archive.

**The existing sleeve art stays exactly as it is.** That's `shop/sleeve/*`, `sleeve/tab/*`, `sleeve/emblem/*`, `art/shop/sleeves.py` and SLEEVES.md: they're card sleeves, and that's what a pochette is. Only text changes: any baked word "Sleeve" on the stand or the tags becomes "Pochette." Ids keep `sleeve`.

---

## 1. Fix: existing art that v2 makes wrong

| Sprite | Problem in v2 | Fix | Pri |
|---|---|---|---|
| `icon/mulligan` 9×9 | The mulligan is gone | Redraw as **`icon/discard`**: a card tilted 20° with a small curved violet arrow flicking off its top-right corner. Same 1 px ink outline as `icon/hand` | P1 |
| `icon/peek`, `icon/cheap_flamber` | Peek and the cheap flambé are cut | Retire: leave the files, stop drawing them | P1 |
| `hud/stamp/fold`, `hud/stamp/match` | Fold and Match are gone (no folding in v2) | Retire. `hud/stamp/flamber`, `min` and `max` stay | P1 |
| `shop/pack/free` | The free pack is replaced by spoils | Retire | P1 |
| Shop shelf layout (SHOP.md §2) | It was built for 8 slots: free + 2 packs + 2 collectibles + 2 scratchers + sleeve. The big shop now has 3 packs + 3 collectibles + the upgrade = 7, and the small shop has 2 packs + 1 collectible = 3 | Scratchers move off the shelf to the register (§3.2c). Lay out a 3-slot small shelf (centered, wide gaps) and a 7-slot big one | P1 |
| Scratcher footer odds | It's baked as "1 chance sur 12 de gagner le Graal" | The Grail is now 3%: **"1 chance sur 33."** If the line is drawn by code, it's a text change | P2 |
| Rival and your plates (DUEL §7.1) | They show hand size + mulligans | Show **card count + discards used + Sleeve count** (icons: `icon/hand`, the new `icon/discard`, and a new `icon/sleeve` 9×9: two card tops peeking out of a cuff) | P1 |
| All 10 masks on the rival | Only Hare, Scaramouche and King of Spades were ever checked as rival faces. Now any of the 10 can sit across from you | Re-review every `mask/*/front` on `rival/head`, under Table 1–4 lighting, at rival scale. Masks with tall parts (Hare ears, King crown) must clear the lamp shade | P1 |
| Cards 2–6 | The game was 7–A, so the 2–6 pip layouts never showed up in play. Every box is 2–A now | Check CARDS.md §5 layouts for 2–6 on the review sheet, all 4 suits, plain and with each finish. Low cards also have to look good, since Pierrot's whole lane is them | P1 |
| Round track pills (DUEL §7.7) | "Pick » Bets » Showdown » Tally" | Code text: "Main 1 » Main 2 » Main 3 » Butin." No art, unless the pills are baked | P2 |
| Sleeve stand tag (SHOP §8) | It says "Spécial Table" and sat in the shop before the boss | The upgrade is only in the big shop between Tables now. "Spécial Table" still fits, so keep it | none |

---

## 2. Missing from v1: spec'd, never drawn

These are in the v1 docs but in no atlas. V2 leans harder on the first three.

| Sprite | Spec | Why v2 needs it | Pri |
|---|---|---|---|
| Rival arms and hands: `rival/arm/upper`, `rival/arm/fore` (×2 sides), `rival/hand/hold` ×2, `rival/hand/tap` ×3 frames, `rival/hand/push` ×3, smoke hand, cigarette holder | DUEL.md §4.3. The folders exist but they're empty | The rival now locks up to 3 times a round, discards, flambés and picks spoils. Without hands, all of that happens by magic | P2 |
| `tag/value`, `tag/hype` 16×9 | CARDS.md §4.11 | Flamber's grind (+1 Value) is now how the meme build grows. The tag is the only way to see it on a card | P1 |
| `trait/plate/1` `/2` `/3` | CARDS.md §4.10 | Flambés happen mid-round now and come straight back into your hand, so traits get read a lot more | P2 |
| `slab/case`, `slab/label`, `slab/digits/1–10` | CARDS.md §4.12 | Graded cards and Le Commissaire-priseur's lane | P2 |
| Bulk bin ~50×40 | SHOP.md §8 | Now a rotating service the shop calls out by name | P2 |
| Grading guichet, 3 parcels, postmark | SHOP.md §5, §8 | Grading is still the DOM harness, so this is v1 debt | P3 |
| Fresh box (restock slam) | SHOP.md §8 | | P3 |
| `hud/token/premier` | DUEL.md §7.7 (drawn in code now) | | P3 |

---

## 3. New art for v2

### 3.1 The duel

**a. The action bar: Play / Flamber / Discard** (P1)
The ticket sprite already exists, tinted per action (READABILITY.md §4–5). The new color code:

| Ticket | Face / plinth | Note |
|---|---|---|
| **Play hand** | felt blue `#3e66a0` / `#0f1d33` | The old "Lock in" |
| **Flamber** | flame `#e8501a` / `#5a1206` | Moves here from the bet |
| **Discard** | violet `#7a4ab0` / `#2a1440` | Takes over the mulligan's "odd move" color. Its price chip shows what's left: `2 left` |
| **Min** / **Max** | money green / burgundy | Unchanged. Max's chip reads `+$X on you` |
| **Skip** (spoils) | tan `#8c7656` / `#2a2010` | Takes over Fold's "backing out" color. Chip `+$1` |

New ink stamps (the slam on press, same style and size as `hud/stamp/*`): **`hud/stamp/play`** (a big blue check mark), **`hud/stamp/discard`** (a violet slash through a card outline), **`hud/stamp/skip`** (a tan "PASSE").

**b. Hand pips: "Main 2 sur 3"** (P1)
Three pips per player, in a row next to each score tag (yours under your card row, theirs beside the rival). They tell you the best-of-3 score at a glance.

| Sprite (12×12) | Look |
|---|---|
| `hud/hand/pip/open` | An empty brass ring with a dark felt center |
| `hud/hand/pip/won` | A brass disc with a small flame embossed in it, lit warm |
| `hud/hand/pip/lost` | An ink disc, dull, with a hairline crack |
| `hud/hand/pip/tie` | Split diagonally, half brass and half ink |
| `hud/hand/pip/thrown` | Ash grey with a burn hole and a curl of smoke (2 frames) |

Motion: a pip flips like a coin (3 frames, or a code scaleX squash) when its hand settles, then gets a `juiceUp`.

**c. The knockout** (P1)
- **`hud/ko/badge`** 44×16: a small enamel plaque on the felt beside the pot, cream enamel with a brass rim, reading **"K.O. 3×"** (the number by code, in the tiny digits). It stays visible all round, so you always know the line.
- **`hud/ko/stamp`** ~140×48: the moment itself. A boxing-poster rubber stamp, **"K.-O. !"** in pixel Didone, burgundy ink with a gold drop shadow, tilted −8°. It slams over the loser's score tag, the tag tears (the existing `hud/score/tear`), the camera punches 2 px, and the crowd silhouettes jump.

**d. A thrown hand** (P1)
- **`hud/score/tag/thrown`**: the score tag, burnt. The same 9-slice, but the edges are charred to umber with ember dots along the burn line (the `finish/embers` look). The value area shows "JETÉE" (thrown) by code instead of a number.
- When you Flamber, the locked cards on your spots catch fire (the ART.md §7.8 flambé shader), then the ★ card (or the ground card with its `tag/value`) flies **back into your hand**, not to the pile. That's the beat that says "it's coming back to you."

**e. The Sleeve: your 2 insert slots** (P1)
Cards up your sleeve. Your tailcoat cuff rests on the near rail beside your plate, and the inserts are tucked into it, just their tops peeking out.
- **`you/cuff`** ~44×26: the end of your black tailcoat sleeve and a white shirt cuff with a brass cufflink, lying along the near rail at about (166,330), lit from above like the shoulders. The inside of the cuff is a dark violet lining.
- **`insert/back`** 24×34: an insert card's back, a mini "La Fortune du Pot" ticket (burgundy with a brass F monogram and a perforated top edge), so it's clearly a scratcher's prize and not a playing card.
- **`insert/face/<id>`** 24×34 × 13: a cream mini card with a colored top band in the insert's color (§3.2e), its 16×16 emblem centered, and a 1 px ink outline. Shown when you hover or lift the insert out.
- Motion: hover lifts the card 10 px out of the cuff with a little wiggle. Drag it onto a card in your hand to use it, and the target gets the insert's own beat (§3.2e). An empty slot just shows the cuff's lining. When a new insert lands, it slides in from off-screen and the cuff gives a tiny tug.
- The rival's cuff: the same sprite mirrored at their side of the table, at rival scale, with **face-down backs only** (you see how many, never which).

**f. Le Patron's marker on the HUD** (P1)
- **`hud/marker/note`** 58×26: a folded cream IOU slip, a *reconnaissance de dette*, pinned to your plate's top-right corner with a brass pin. Le Patron's red wax seal sits on the fold. The amount due goes in burgundy by code ("$15 · prochaine table").
- **`hud/marker/seal`** 10×10: the seal itself, a red wax blob stamped with a crowned **P**. It also appears on the ledger and the scouting dossier.
- Motion: it flutters slightly with the room's draft. The round before a payment is due, it pulses burgundy once per round tally.
- **`hud/marker/paid`** ~80×28: a red **"PAYÉ"** rubber stamp, for the shop-door beat and the final win.
- **`hud/marker/unpaid`** ~96×28: a black **"IMPAYÉ"** stamp, for when you can't pay (the run ends).
- **The final win** ("Quitte !"): after round 12's payment, the IOU slip burns away (fire shader) and the seal drops onto the felt. That needs no new art beyond the note and stamps.

**g. Rival lane icons** (P1)
**`icon/lane/<lane>`** 9×9 × 10, one color and silhouette each. They show on the rival plate (so you know what you're up against) and on the scouting dossier.

| Lane | Icon | Color |
|---|---|---|
| pairs | two overlapping card outlines (like `trait/twin`, but filled cream) | cream + ink |
| low | a small centime coin with a "2" | brass |
| straights | a straight métro line with three stops | felt green |
| money | a folded banknote | money green |
| finishes | a faceted gem | violet → gold |
| hearts | a heart with a sparkle | burgundy |
| flambé | a flame | flame |
| grade | a tiny slab with a gold label | gold |
| junk | a grey stone chunk | stone `#43342e` |
| jokers | a jester's bell | violet |

**h. Spoils on the table** (P1)
- The 3 cards deal face up onto the **pot zone** (the existing `felt/print/pot`) after the tally.
- **`hud/spoils/placard`**: "LE BUTIN" on a paper placard hanging on two strings, the same build as `hud/twist/sign` (9-slice + `hud/twist/string`). It drops in over the pot.
- **`hud/spoils/order`** 20×12 × 2: two little brass chips, "1er" and "2e", that sit on the plates to show who picks first (the loser).
- The last card **burns**: the flambé shader on the card, then ash flakes. No sprite.
- The rival's pick slides to their side with a `rival/hand/push` frame when that exists (§2).

**i. Rival names** (text, no art)
The rival plate needs a name per mask (DUEL.md §11 asked for this). Suggestions: Hare "Le Lièvre", Pierrot "Pierrot", Black Domino "Le Domino", Crimson Domino "La Dame Rouge", Arlequin "Arlequin", Queen of Hearts "La Reine", King of Spades "Le Roi", Owl "Le Hibou", Scaramouche "Scaramouche", Fox "Le Renard".

### 3.2 The shop

**a. Small vs big shop** (P1)
- **Small:** the shelf holds 3 offers (2 packs, 1 collectible) with wider gaps, and one service ticket (Grading → *or* Bin a Bulk). It should feel like a quick stop at the counter, nothing more.
- **Big** (between Tables): 7 offers (3 packs, 3 collectibles, the upgrade on its stand), both service tickets, Le Patron at the door, and the scouting dossier on the counter. Dress it so it reads as a different visit: the buraliste puts his newspaper down for it (a `bur` frame that already exists), and a chalk line goes under the STONKS board: "Nouvelle table ce soir."

**b. Le Patron at the door** (P2. The minimum P1 version is the ledger alone.)
The room's owner. You never see his face.
- **`patron/body`** ~110×190: a heavy man filling the shop doorway on the left wall. White dinner jacket, black bow tie, a red carnation in the lapel, a fedora pulled low so his face is in full shadow. All you see is a gold tooth glint (1 px) and the glow of a cigar. Lit from the street behind him, so he's mostly a silhouette with a warm rim.
- **`patron/hand`** ~24×18: his hand with a fat gold signet ring (the crowned P). It taps the ledger.
- **`patron/ledger`** ~70×44: an open black leather ledger, columns of names in faded ink, yours at the bottom with the amount due. This is the minimum version: the ledger on the counter and his ringed hand coming in from off-screen.
- **`patron/cigar`** 3 frames of ember glow.
- The beat: you walk in, he's already in the doorway. He taps the ledger twice, your chips slide across, "PAYÉ" stamps the line, he touches his hat brim and steps out of frame. If you can't pay, he closes the ledger slowly, the scene dims, and "IMPAYÉ" stamps across it.

**c. The scratcher roll at the register** (P1)
- **`shop/scratch/roll`** ~40×52: a roll of La Fortune du Pot tickets on a brass spindle beside the register, the way real tabacs keep them, with a strip hanging down. The small shop has 1 ticket torn off and ready on the counter, the big shop 2. It replaces the scratcher group on the shelf.
- A ticket you buy is torn off the roll (a 3-frame tear, with a small paper sound).

**d. The scouting dossier** (P2)
- **`shop/dossier`** ~150×110 (9-slice): a manila folder lying on the counter right of the register, with a paper clip (`shop/dossier/clip`) and a tilted red **"CONFIDENTIEL"** stamp (`shop/dossier/stamp`). Le Patron's seal sits in the corner, since he's the one telling you who's next.
- Inside, laid out by code: a photo corner holding the next rival's `mask/*/front` like a mugshot, their name, their lane icon (§3.1g), their case as the collectible sprites at 0.5×, their deck size, and the boss twist line.
- Hover opens it flat (it slides toward the camera like a pack).

**e. The 9 new scratcher emblems** (P1)
Same rules as the 4 in SHOP.md §7.5: 16×16 (drawn ×2 in the windows, ×3 on a reveal), one emblem, one color, one silhouette each. Each also gets a mini face in the Sleeve (§3.1e) and a short beat when it's used on a card in your hand.

| Insert | Emblem | Color | The beat when you use it |
|---|---|---|---|
| **Stylo** | A blue Bic-style biro, cap off, tilted | cream + biro blue `#28497a` | The pen scribbles over the card's corner index, and the rank ticks up one (old one crossed out, 2 frames, then the clean new index) |
| **Broyeuse** | A little office shredder with strips coming out the bottom | ink grey + cream strips | The card feeds into the shredder from the top and falls out as strips that flutter off the bottom of the screen |
| **Photocopie** | Two overlapping sheets with a bright scan line between them | cyan `#3e9ab0` + cream | A scanner-light bar sweeps the right card, then the left card flashes white and comes back as the copy |
| **Reprint** | A small brass print roller with a fresh card under it | brass | The roller rolls over the card, and a copy slides out from under it and flies to your discard pile |
| **Foil wrap** | A rolled sheet of gold leaf | gold | The sheet wraps around the card left to right, and the foil trim and sheen come on |
| **Holo wrap** | A round holo security seal, peeling | violet rainbow (static frames) | The seal slaps on the card's top-center, then the holo hex grid spreads from it |
| **Prism wrap** | A sheet with a charred, glowing edge (Prism's finish is drawn as Embers) | flame | The card's edge chars inward and the embers catch |
| **Tampon** | A wooden rubber stamp on a red ink pad | burgundy | The stamp thunks down on the card's center and the new stamp appears in fresh ink (a 1-frame smear) |
| **Allumettes** | A French matchbox (*allumettes de sûreté*) with one lit match | flame + burgundy | A match strikes, both cards catch, and they fuse into the ★ card in a puff (the same fire as Flamber) |

Code, Checklist, Wishlist and Grail keep their existing emblems.

### 3.3 Eleven new collectibles

Same format and rules as CARDS.md §14: the object is its own silhouette, at most 100×106, with a tiny idle loop and the buraliste hidden somewhere. The 10 payoffs are **rare** (a scene behind, gold glow by code). Bulk Bin is **common** (no background). Ids are whatever `collectibles.ts` ends up using. The names are fixed.

**Les Jumeaux** (pairs: each Pair ×1.5 Hype) · 84×96 · rare
- Two identical porcelain twin figurines, little boys in matching sailor suits, standing on one shared plinth. Each holds up the same playing card.
- Scene: a gilt mirror behind them, so you see four of them. It reads as "doubles" from across the room.
- Loop: they blink in sync, and the reflection blinks one frame late.
- Buraliste: one twin has his mustache painted on, slightly crooked.

**Sommelier** (flush: ×2 Hype with a Holo) · 76×100 · rare
- A silver *tastevin* (the sommelier's tasting cup) on its chain, draped over a dark wine bottle. The bottle's label is a holo sticker showing a fan of five hearts.
- Scene: a stone cellar arch with wine racks fading into the dark.
- Loop: the label's holo shifts through 3 static rainbow frames, and the wine in the cup swirls.
- Buraliste: the label reads "Cuvée du Tabac."

**Flamme Bleue** (flambé: each flambéed card ×1.5 Hype) · 92×82 · rare
- A copper flambé pan over a little brass *réchaud* (spirit burner), cherries in the pan, burning with **blue** flames. That blue is the one place the felt-blue ramp turns into fire, so it reads as different from every other flame in the game.
- Scene: a white restaurant tablecloth edge and the dark of a dining room.
- Loop: 4-frame blue flame flicker.
- Buraliste: his Gitane is what lit it, lying on the table edge.

**Vitrine** (finishes: ×1 Hype per different Finish) · 84×100 · rare
- A tiny jeweller's display case on four thin legs, glass top, holding three gems on velvet: one gold (foil), one rainbow (holo), one with a glowing ember core (prism).
- Scene: a jewellery shop wall in deep violet velvet.
- Loop: a glint hops from gem to gem.
- Buraliste: his face, faintly reflected in the glass top.

**Petite Monnaie** (low cards: each scored 2–6 ×1.25 Hype) · 72×66 · rare
- A worn brown leather coin purse, clasp open, spilling old centimes and small franc coins.
- Scene: a zinc café counter with a little saucer of change.
- Loop: one coin on the counter wobbles and settles.
- Buraliste: one coin has his profile on it, mustache and all.

**Le Ferrailleur** (junk: each Bulk played ×1.5 Hype) · 96×86 · rare
- A scrap dealer's wooden handcart heaped with stone Bulk slabs (the `base/bulk` look, small), a bent bell and a rusty horseshoe on top.
- Scene: a cobbled courtyard wall with a faded "FERRAILLE" painted sign.
- Loop: the top slab teeters and settles.
- Buraliste: his cardigan is hung over the cart handle.

**Le Flambeur** (money: +×1 Hype per $20 held) · 72×96 · rare
- A fat roll of banknotes in a gold money clip, its top end burning with a slow, lazy flame. Ash curls off it.
- Scene: green casino felt with a few jetons scattered.
- Loop: 3-frame flame and a curl of ash that drifts up.
- Buraliste: his face is on the banknote.

**Bis !** (retrigger: Signed scores 3 times) · 96×96 · rare
- A tiny theatre stage, red velvet curtains half open, a single spotlight on a playing card signed twice in gold ink. A banner across the top reads "BIS !" (a word on the object, which is allowed).
- Scene: the stage itself and the dark house behind the spotlight.
- Loop: a rose lands on the stage every few seconds.
- Buraliste: he's in the prompter's box, just his mustache showing.

**Ligne Droite** (straights: ×2.5 Hype) · 88×70 · rare
- An enamel metro line plate (a parody, never the real RATP logo or lettering): one straight line with five stops labelled 9 · 10 · J · Q · K, and a round "M" medallion in the corner.
- Scene: white bevelled metro tiles.
- Loop: a light runs along the line stop to stop.
- Buraliste: a marker-pen mustache doodled on a poster at the edge.

**Le Commissaire-priseur** (grade: each graded card ×1.5 Hype) · 80×96 · rare
- An auctioneer's wooden gavel coming down on its sound block. On the lectern beside it, a graded card in its slab.
- Scene: an auction room, with a raised bidder's paddle reading "10" in the back.
- Loop: the gavel taps (2 frames, then a hold).
- Buraliste: the bidder with the paddle has his mustache.

**Bulk Bin** (each Bulk played +2 Hype) · 56×52 · common
- A dented galvanized tin bin with "VRAC" stencilled on it, two stone Bulk slabs sticking out of the top.
- Loop: a small dust puff every few seconds.
- Buraliste: his L'Équipe, crumpled in the bin.

### 3.4 Cards

No new frames. Card types, finishes, stamps and tiers all stay. What v2 changes:
- Cards 2–6 show up all the time now (§1).
- The grind tag (`tag/value`, §2) matters a lot more.
- Inserts used in hand need a **target highlight**. That's code (a 1 px outline in the insert's color, plus a lift), not a sprite.

### 3.5 Later (P3, not needed for the v2 targets)

- **The Album:** reuses the binder overlay (SHOP.md §4), with empty slots shown as faint silhouettes, plus **`hud/album/new`** 24×10, a red "NEW" sticker for a first pull on the rip.
- **Cosmetics earned by playing:** extra felts, card backs and mask trims. The list is TBD in V2.md §17.

---

## 4. Count

| Group | Sprites | Pri |
|---|---|---|
| Fixes (discard icon, plate icons, mask and 2–6 review) | 2 new + 2 reviews | P1 |
| Action bar stamps | 3 | P1 |
| Hand pips | 5 (+1 smoke frame) | P1 |
| Knockout | 2 | P1 |
| Thrown tag | 1 | P1 |
| The Sleeve (cuff, back, 13 faces) | 15 | P1 |
| Le Patron's marker (note, seal, paid, unpaid) | 4 | P1 |
| Lane icons | 10 | P1 |
| Spoils (placard, order chips) | 3 | P1 |
| Scratcher roll | 1 (+3 tear frames) | P1 |
| Scratcher emblems | 9 | P1 |
| Collectibles | 11 × their loop frames | P1 |
| Le Patron (body, hand, ledger, cigar) | 4 (+2 cigar frames) | P2 (ledger + hand are P1) |
| Scouting dossier (folder, clip, stamp) | 3 | P2 |
| v1 debt the v2 screens use (rival arms and hands, value tags, trait plates, slab, Bulk bin) | ~25 | P1–P2 |
| **Total new for v2** | **~85 sprites**, plus loop frames | |

Files: duel additions go in `art/duel/` (`hud.aseprite`, `you.aseprite`, plus a new `patron` group if Le Patron also shows up in the duel), shop additions in `art/shop/` (`counter.py`, `scratchers.py`, a new `patron.py`), collectibles in `art/collectibles/`. Then rebuild each atlas with its build script, and update the review sheets (`art/duel/review.png`, the shop previews, `art/collectibles/review.png`) to show the v2 states: mid-round at 1–1 with the KO badge, a thrown hand, the Sleeve full, spoils on the table, and the big shop with Le Patron and the dossier.
