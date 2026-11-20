# Flambeur: sleeve art spec

How sleeves look: on the shop shelf, when you buy one, and once you own it. This doc is for the art agent and whoever wires the sprites in. Rules and prices live in DESIGN.md, "Pochettes (run-wide upgrades)" (in v2 the game calls them Pochettes, code ids still say `sleeve`), and `src/engine/sleeves.ts`. Style, palette and motion come from `docs/ART.md`. Shelf layout comes from `docs/SHOP.md` §2. Hover cues come from `docs/READABILITY.md`.

Written Nov 18 2026 by Claude from Evan's existing notes. Nothing in here has been picked by Evan yet. Change §1 if a call is wrong.

---

## 0. What a sleeve is (the rules in one breath)

- A sleeve is a permanent run-wide buff, our version of a Balatro voucher. It doesn't go on a single card.
- One sleeve is offered per Table, in the shop right before the tournament round. It costs $10, so you get 3–4 chances a run.
- Both seats can see what the other owns (`docs/architecture.md`, the view rules).
- The pool is the 7 in `SLEEVES` (sleeves.ts):

| id | Name | Does |
|---|---|---|
| `big_hands` | Big Hands | +1 hand size |
| `restock` | Restock Sleeve | First restock each shop is free |
| `hot_market` | Hot Market | STONKS sells at +1× |
| `riser` | Display Riser | +1 display case slot |
| `deep_pockets` | Deep Pockets | Interest caps at +$4 instead of +$2 |
| `bulk_deal` | Bulk Deal | Binning a Bulk card always costs $1 |
| `archival` | Archival Sleeve | Damaged cards never tear, and grading never comes back damaged |

---

## 1. Decisions (Claude's, change them here)

| Question | Decision |
|---|---|
| Stand or hook? ART.md §10 says "on a display hook" and SHOP.md says "velvet card stand". | **The velvet stand.** SHOP.md is newer and already built. The hook is dropped, and ART.md §10 gets amended to match. |
| One generic sprite, or one per sleeve? | **One per sleeve.** The current `shop/sleeve` is a single navy pocket that says nothing about what it does. Every sleeve gets its own tint and emblem (§2), like a Balatro voucher has its own art. |
| What does a sleeve physically look like? | **A real penny sleeve of card protectors**: a clear, tinted plastic pocket with a Flambeur card back inside, and a printed paper header card stapled over the top that carries the emblem. Every product on a tabac's wall rack looks like this. |
| How do you tell them apart? | **One color and one emblem per sleeve** (CARDS.md §0.5: one visual channel per thing). The plastic tint is the color. The header card carries the emblem. |
| Archival? | **Its own silhouette.** It's a rigid toploader: thicker, squarer and clear, not tinted. It's the only protection sleeve, so it's the only one with a different shape. |
| Where do owned sleeves show? | **As tabs peeking out from behind your name plate** in the duel (§4), the same for the rival. Hover a tab for its name and rule. In the shop they peek out from behind the "Vous" plate the same way. |
| Buy beat? | The sleeve slides out of its stand and flies to your plate, then tucks in behind it as a new tab (§5). |

---

## 2. The seven sleeves

Every hex is from `art/palette/flambeur.gpl`. The **tint** is the plastic's color: three steps, dark edge → body → highlight. The **emblem** is a 16×16 sprite printed on the header card. It's drawn at 2× (32×32) on the shelf sleeve and at 1× on the plate tab.

| id | Tint (dark / body / light) | Emblem (16×16) | Emblem colors | Why |
|---|---|---|---|---|
| `big_hands` | `#1a3256` / `#28497a` / `#3e66a0` (navy) | A cream glove holding a fan of 3 cards, with the fan wider than the glove | cream `#f6ecd2`, ink `#1c1513`, burgundy pip `#a82a38` | More cards in hand |
| `restock` | `#174034` / `#2d7a5c` / `#4a9a74` (faience green) | A kraft carton box, flaps open, with a curved arrow looping over it | kraft `#9c7028` / `#6b4a1a`, cream arrow | The restock box that slams on the counter |
| `hot_market` | `#a8260a` / `#e8501a` / `#ff7a24` (flame) | The STONKS chalk star, on fire: a 5-point star with 2 flame tongues off its top | chalk `#f6ecd2`, flame `#ffb03a` / `#ffe08a` | The chalk star on hot binder cards (SHOP.md §4) |
| `riser` | `#2a1440` / `#4e2a78` / `#7a4ab0` (violet) | A brass 3-step riser with a tiny trophy silhouette on the top step | brass `#c99a3a` / `#e8c260`, shadow `#6b4a1a` | One more step in the Vitrine |
| `deep_pockets` | `#1e4a24` / `#3a8040` / `#6fcf6f` (money green) | A bulging leather porte-monnaie, clasp open, a $1 jeton showing at the mouth | leather `#5c4a36` / `#8c7656`, brass clasp, cream jeton | More interest, a fatter purse |
| `bulk_deal` | `#43342e` / `#5c4a36` / `#8c7656` (stone umber) | A Bulk card (`base/bulk` from `art/cards/cards.png`) with a red "$1" price sticker slapped on its corner | stone from the Bulk card, sticker `#d04a4e` with a cream "1" | Binning Bulk is cheap |
| `archival` | clear: `#e3d2a8` edge, no body tint, `#fffbe8` glints | A brass shield with a check inside | brass, ink | Protection. See §3.2 for its different body |

**The emblems have to read as a silhouette.** Fill each one black and check that all 7 are still told apart at 16×16. Two that blob into the same shape means one gets redrawn. Also check them against the 4 scratcher emblems (SHOP.md §7.5) and the plate icons (`icon/hand`, `icon/mulligan`, `icon/peek`, `icon/cheap_flamber`). The `big_hands` emblem can't look like `icon/hand`: it's a glove holding a fan of cards, not a bare hand.

---

## 3. Shelf art

The sleeve offer sits last in the row, in its own group (SHOP.md §2). Its slot is the standard **72×104**.

### 3.1 Penny sleeve (the 6 normal ones), 64×88 standing in the stand

Top to bottom:
- **The header card**, 64×22. Cream paper `#f6ecd2` with a `#bfa77e` bottom edge. It's folded over the sleeve's top and stapled: two 2×1 grey-brass staples. In the middle, the emblem at 2× (32×32, pixel-doubled, not redrawn). It hangs 6 px over the top of the sleeve and **breaks the sleeve's top edge**, so the silhouette isn't a plain rectangle. A tiny "POCHETTE" in `tiny` ink runs along its bottom edge.
- **The sleeve body**, 56×70, inset 4 px each side under the header.
  - A **card back inside**, the Classic back (`back/frame` + `back/tile/classic` from `art/cards/cards.png`), seen through the plastic. Composite it in Python: paste the back and multiply it by the tint at about 40%, so the card reads but the color clearly owns the sleeve.
  - **Plastic edges:** 1 px of the dark tint all round, with the open top lip as a 1 px light line.
  - **One diagonal glint band**, 2 px wide in the light tint plus `#fffbe8` dots, running top-left to bottom-right through the upper third. The current `sleeve_stand()` glint, but in the sleeve's own color.
  - The sleeve is 2 px wider than the card on each side and 4 px longer at the bottom, so you can see it's a pocket and not a tinted card.
- **The stand** under it: the existing burgundy velvet plinth from `sleeve_stand()`, kept as its own sprite `shop/sleeve/stand` so it's shared. The brass "SPÉCIAL" strip at the top of the old sprite moves to the stand's front edge as a small brass plaque: "SPÉCIAL TABLE" in `tiny`.

### 3.2 Archival toploader, 60×88

- A **rigid clear toploader**: 2 px edges in `#e3d2a8` with `#fffbe8` corners, squarer corners than the penny sleeves, and a thicker 3 px open lip at the top.
- **No tint.** The card back inside shows at full color, behind one faint diagonal glint. Clear plastic is the whole look.
- **No header card.** Instead there's a **brass label strip** across the bottom third, 48×12, carrying the shield emblem at 1× and "ARCHIVAL" in `tiny` ink.
- It stands slightly taller in the stand: lift it 2 px. It's the premium product.

### 3.3 Hover and states

- **Hover:** a lift, tilt and cream outline like every offer (built in shop.ts), plus the tag: `Sleeve · <Name> · $10 · For the rest of the run: <text>`. That text is built already.
- **Can't afford it:** the usual offer dimming, no new art.
- **Sold:** the VENDU stamp over an **empty stand**. Once bought, the sleeve is gone and only `shop/sleeve/stand` stays.

---

## 4. Owned sleeves: tabs behind the plate

You own 0–4 sleeves. Each shows as a **tab**: the top of the sleeve sticking up from behind the top edge of the name plate, like dividers in a file box.

- **`sleeve/tab/<id>`, 14×18.** The top of the sleeve in its tint, with the header card's top showing the emblem at 1×. The archival tab is the clear toploader top with the brass shield.
- **Placement:** drawn before the plate so the plate covers their bottoms, with 9 px showing above the plate's top edge. Left to right in buy order, starting 10 px in from the plate's left edge, 16 px apart. Each one is tilted a different small amount (−2°, +1°, −1°, +2°) so they look slid in by hand.
- **Both plates.** Yours bottom-left, the rival's top-right (it shows from the rival's side too, since owned sleeves are public).
- **Hover a tab:** it lifts 4 px out from behind the plate and shows a tag: `<Name> · <text>`.
- **Shop:** the same tabs behind the "Vous" plate in the bottom bar.
- **The Archival trigger beat:** when Archival stops a tear or a damaged grading, its tab pops up 6 px, flashes a brass `#fff0b0` outline for 2 frames and settles, with `tick()` from sound.ts. A tag shows the one line: "Archival · no tear". This is the only sleeve with a trigger beat. The others are always on, so they don't need one.

---

## 5. The buy beat

1. On click the sleeve slides **up out of its stand** (6 frames, ease-out) with a plastic *fwip*. Make it a short high noise burst in `sound.ts`.
2. It shrinks along an arc toward your plate, ~350 ms, with a slight spin, and ends tab-sized just above the plate.
3. It **drops in behind the plate** and becomes the new tab: a 2 px bounce, and the plate gives a `juiceUp`.
4. The coins and count-down are the same as any buy (built).

---

## 6. Sprite list

All of these go in the **shop atlas** (`art/shop/shop.png` + `shop.json`). `sprite()` looks names up across every atlas, so the duel can draw the tabs from it too.

| Slice | Size | Notes |
|---|---|---|
| `shop/sleeve/stand` | 72×24 | The velvet plinth and the SPÉCIAL TABLE plaque, shared |
| `shop/sleeve/<id>` × 6 | 64×88 | Penny sleeve, header card, back inside, glint. Pivot bottom-center |
| `shop/sleeve/archival` | 60×88 | The toploader. Pivot bottom-center |
| `sleeve/emblem/<id>` × 7 | 16×16 | Emblems at 1×. They're also reused on the tabs |
| `sleeve/tab/<id>` × 7 | 14×18 | Owned tabs. Pivot bottom-center |

That's 22 slices. The old single `shop/sleeve` slice goes away once shop.ts uses the new names.

---

## 7. Readability checks

- At **1× on the 640×360 stage**, a stranger can tell the 7 shelf sleeves apart without the hover tag, by color alone.
- With the color stripped (greyscale), the emblems alone still tell them apart. Archival reads by shape alone.
- A tab at 1× shows its color plus a recognizable emblem. If an emblem turns to mush at 1×, simplify it until it doesn't.
- The penny sleeve reads as **plastic over a card**, not a colored card. If it reads as a card, push the edges and the glint, and drop the back inside to 30%.
- Every pixel is in the master palette (ART.md §4). Run the palette check `counter.py` already uses.
- The sleeve offer doesn't out-shout the packs. It's one slot at the end of the row. Its brightest pixels are no brighter than a holo pack's.

---

## 8. Still open (not blocking the art)

- If Evan changes the pool, a new sleeve needs one tint + one emblem + one tab, nothing else. The recipe in §2 is the whole contract.
- Should owned sleeves change the look of your deck pile too, e.g. its top card wearing the newest sleeve's tint? Nice, but not for Friday.
