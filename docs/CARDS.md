# Flambeur: card art spec

Everything an art agent needs to draw the cards without asking. Style, palette and mood come from `docs/ART.md`, so read that first. This doc covers **what to draw, at what size, where it sits, and how it's cut up**. The game data behind it is `src/engine/cards.ts`.

Nov 17 2026. Nothing here is drawn yet.

---

## 0. The prime rule: everything is segmented

**Every visual element is its own sprite.** No card is ever drawn as one finished picture. The game builds each card at runtime by stacking parts, and moves, rotates, tints and animates each part on its own.

Why:
- **Reuse.** 13 rank glyphs + 4 suits + 12 court halves cover all 52 faces. One star covers all three tiers.
- **Positioning.** Code places parts by the layout tables below, so a fix to one part fixes every card.
- **Motion.** A stamp can slam down, a star can pop and a trait icon can spark on its own, because each is a separate quad.
- **Combinations for free.** A card can be foil + signed + ★2 + graded 7 + Rookie. That's 5 overlays, not a new drawing.

What this means when drawing:
1. **Draw each part alone on transparency**, cropped to its own size. Never paint one part into another's sprite.
2. **Don't bake in effects the game does at runtime:** no drop shadows on parts, no glow, no rotation, no outline highlight for hover, no shine. Those are shaders and transforms.
3. **Don't draw mirrored copies.** The bottom-right index is the top-left index rotated 180° at runtime. The bottom half of a court is the top half rotated 180°. Pips in the lower half are rotated by code.
4. **Every sprite has a pivot**, set as an Aseprite slice pivot (see §11). The layout tables give each part's position as the pivot's coordinates on the 64×88 card.
5. **Tintable parts are drawn in greyscale** (see §2) so code can color them.

---

## 1. Decisions made for this spec

These were open in ART.md. Claude decided them so the spec could close. Change them here if they're wrong.

| Question | Decision | Why |
|---|---|---|
| Finish names in code vs art | `foil` = **Gold foil**, `holo` = **Holographic**, `prism` = **Embers** (top rarity), `misprint` = **Misprint** (a print-registration error) | `prism` is the rarest finish (the collector rare slot), and fire is our top tier. The UI should show "Embers" for `prism`; the code id stays. |
| What's an ungraded card? | **Clean.** No wear overlay at all | Most cards are never graded (`grade: null`). Wear only appears once a card has a Grade, so grading reveals the condition. |
| `damaged` stamp vs Grade wear | **Damaged = a real tear plus tape**, heavy and obvious. **Wear = condition**, subtle. Separate sprites | Damaged is a mechanic you must spot at a glance. Wear is flavor. |
| Jumbo size | **The same parts drawn at 1.5× scale** (96×132 on screen). It takes 2 slots on the felt | Reuses every sprite. The chunkier pixels *are* the joke: it's a jumbo card. This is the one intentional break of "one pixel scale per plane". |
| Court figure names | **Not printed on the card.** Shown in the hover tooltip and the collection view | Text that small isn't legible at 64×88. |
| Second rank / suit (split, wrong suit, household) | A **mini index** under the main one | See §6. |

---

## 2. Colors and tinting

- Use the master palette in `docs/ART.md` §4. Build it as a file first: `art/palette/flambeur.gpl` (also loaded into each `.aseprite`).
- **Tintable parts** (rank glyphs, suit glyphs, pips) are drawn in a **5-step greyscale ramp only**: `#ffffff` `#d0d0d0` `#a0a0a0` `#686868` `#303030`. Code multiplies them by the suit color. That's how the four-color option works with zero extra art.
  - Draw them as if white = the main ink color. Use the darker greys sparingly, for a 1 px letterpress inner edge.
- **Everything else** is full color from the palette.
- Shaders (foil, holo, embers, heat) may produce colors outside the palette. Sprites may not.

Suit tints (code applies these):

| Suit | Two-color (default) | Four-color option |
|---|---|---|
| ♥ | burgundy `#a82a38` | burgundy `#a82a38` |
| ♦ | burgundy `#a82a38` | brass `#c99a3a` |
| ♣ | ink `#1c1513` | felt green `#2d7a5c` |
| ♠ | ink `#1c1513` | ink `#1c1513` |

---

## 3. The card frame (64×88)

All coordinates are in art pixels from the card's top-left, with x to the right and y down.

```
 0                                63
 ┌─────────────────────────────────┐ 0
 │ ┌INDEX┐                   ★     │      TL index (4,4)      tier stars (52,4)
 │ │ K   │                   ★     │
 │ │ ♠   │                   ★     │
 │ └─────┘                         │
 │        ┌─────────────────┐      │      pip / court area
 │        │                 │      │      x 12..51, y 10..77
 │        │   PIPS / COURT  │      │
 │        │                 │      │
 │        │                 │      │
 │        └─────────────────┘      │
 │ ┌──┐                     ┌─────┐│
 │ │VA│                     │INDEX││      variant badge (3,74)   BR index (rotated)
 │ └──┘  ┌[trait plate]┐    └─────┘│
 └───────┴─────────────┴───────────┘ 87
         hangs below the edge
```

| Zone | Rect / pivot | Holds |
|---|---|---|
| Card | 0,0 → 63,87 | — |
| Printed border | inset 3 px, 1 px line | part of `base/paper` |
| Top-left index | box 4,4 → 13,24 | rank glyph (4,4) + small suit (5,16) |
| Bottom-right index | same box rotated 180° around the card center (31.5, 43.5) | the same sprites |
| Pip / court area | 12,10 → 51,77 (40×68) | pips or court halves |
| Tier stars | 52,4 then 52,12 then 52,20 | up to 3 stars, top-right |
| Variant badge corner | 3,74 → 13,84 | the Rookie badge, Chase ribbon or Sticker curl |
| Trait plate | centered at x 32, top at y 82 | hangs 10 px below the card edge |
| Value tags | right edge, pivots (62,30) and (62,42) | stick out past the right edge |

---

## 4. Sprite list

Names are atlas keys. A **[T]** marks a tintable sprite (greyscale). Sizes are in art px.

### 4.1 Bases (one per card, the bottom layer)
| Key | Size | Description |
|---|---|---|
| `base/paper` | 64×88 | Cream stock (paper ramp), 1 px ink outline, 3 px rounded corners, a printed inner border 3 px in (a thin burgundy line, with a tiny flourish at each corner). Faint paper texture: 2–3 px of dither, nothing busy. |
| `base/sticker` | 64×88 | For the Sticker variant: the same card but glossier, with a 1 px white die-cut margin inside the outline, as if printed on a sticker sheet. |
| `base/bulk` | 64×88 | A **stone slab**, not paper: grey-brown stone ramp, chipped corners, a chiselled **+5** in the center (part of this sprite, never tinted), and moss in one corner. No index, no border. Heavy, dull, slightly funny. |
| `base/shadow` | 64×88 | A soft dithered drop shadow, ink at ~50%. Code offsets it by (2,3). |

### 4.2 Indices
| Key | Size | Description |
|---|---|---|
| `index/rank/2` … `index/rank/10`, `index/rank/J` `Q` `K` `A` **[T]** | 9×11 (10 can be 10×11) | **Pixel Didone** numerals and caps: thick stems, 1 px hairlines, small bracketed serifs (the logo's letterforms in miniature). English letters. Pivot top-left. |
| `index/suit/S` `H` `D` `C` **[T]** | 7×7 | Small suit glyph under the rank. Pivot top-left. |
| `index/mini/2` … `A` **[T]** | 5×7 | Tiny rank glyphs for the second rank (split, household). |
| `index/crayon/?` | 9×11 | A crayon-scrawled "?", in full color: wax-crayon red, uneven. Used by the Crayon knockoff in place of the rank. |

### 4.3 Pips
| Key | Size | Description |
|---|---|---|
| `pip/S` `H` `D` `C` **[T]** | 11×11 | Standard pips. Classic French shapes, crisp, with a 1 px darker inner edge (letterpress). Pivot at the center (5,5). |
| `pip/ace/S` `H` `D` `C` | 27×27 | One big ace pip per suit, **full color**, more ornate: Belle Époque filigree around the pip. The **Ace of Spades** is the most ornate, a nod to the tradition of the printer's mark on the A♠. Pivot at the center. |

### 4.4 Courts (Paris pattern)
Draw the **top half only**. Code draws it twice: once as is, once rotated 180°.

| Key | Size | Figure (Paris pattern) |
|---|---|---|
| `court/K/S` | 40×34 | **David**, with a harp |
| `court/K/H` | 40×34 | **Charles** (Charlemagne), with a raised sword |
| `court/K/D` | 40×34 | **César**, in profile with a scepter |
| `court/K/C` | 40×34 | **Alexandre**, crowned, with a scepter |
| `court/Q/S` | 40×34 | **Pallas**, armored, with a flower |
| `court/Q/H` | 40×34 | **Judith**, with a flower or fan |
| `court/Q/D` | 40×34 | **Rachel**, with a flower |
| `court/Q/C` | 40×34 | **Argine**, with a flower or fan |
| `court/J/S` | 40×34 | **Ogier**, with a spear |
| `court/J/H` | 40×34 | **La Hire**, with a halberd |
| `court/J/D` | 40×34 | **Hector**, with a halberd or axe |
| `court/J/C` | 40×34 | **Lancelot**, with a halberd |

- Follow the Paris pattern for pose, costume and attribute. References: [IPCS Paris and Rouen patterns](https://i-p-c-s.org/faq/history_13.php), [IPCS court names](https://i-p-c-s.org/faq/tmfaq.php). Check each attribute against the reference; the table is a guide, not gospel.
- **Full color:** courts keep their traditional mix of red, blue, yellow and black (from our palette). They are not tinted. Each court also carries a small suit glyph near the head, part of the court sprite.
- The figure's bottom edge must meet its rotated twin cleanly at y 44 (the card's center line). A thin decorative band across the waist hides the seam.
- The logo already has 5 of these figures at 44×64 (`art/logo/claude/`). Redraw them at 40×34 per half, keeping the same character. Don't scale the old ones.
- **Joker card** (`court/joker`, 40×34, top half, same rules): a jester in a commedia mask. The word "Joker" is hidden somewhere in the art. Later scope.

### 4.5 Overlays, wear and damage
| Key | Size | Description |
|---|---|---|
| `wear/light/1` `/2` | 64×88 | Grade 7–9: very faint softness on 1–2 corners, one tiny edge nick. |
| `wear/mid/1` `/2` | 64×88 | Grade 4–6: soft corners, edge whitening, one faint crease line. |
| `wear/heavy/1` `/2` | 64×88 | Grade 1–3: rounded and dog-eared corners, a crease across, a faint coffee-yellow edge stain, scuffs. |
| `damage/tear` | 64×88 | The `damaged` stamp: a **real tear** from one edge about 20 px in, with yellowed tape over it. Obvious at a glance. |

- Wear and damage are drawn **over** the printed art (creases cross pips), but only inside the card's alpha. Code masks them to the card shape.
- Code picks variant 1 or 2 from the card id, so two cards with the same grade don't look identical.
- **Grade 10 (gem mint)** has no wear sprite. It gets a gloss sweep shader.
- **Ungraded** cards have no wear.

### 4.6 Stamps (the stamp slot)
These are **rubber-stamp ink marks**. Code places each one near the center at a seeded random angle (±15°) and offset (±4 px), so no two cards look the same. Draw them straight and centered.

| Key | Size | Description |
|---|---|---|
| `stamp/first` | 28×28 | **1st Edition**: a round black-ink stamp reading "1ère ÉDITION" around the rim with a "1" in the middle. Slightly patchy ink. |
| `stamp/signed` | 40×18 | **Signed**: a looping ink-pen signature in dark blue, with one flourish. Ink, not stamp texture. |
| `stamp/gold` | 22×22 | **Gold seal**: a gold-leaf wax seal with a flame monogram, raised (with highlight and shadow). |
| `damaged` | — | uses `damage/tear` (§4.5) |

### 4.7 Knockoffs (Off-Brand, also the stamp slot)
| Key | Size | Description |
|---|---|---|
| `knock/crayon/1` `/2` | 40×68 | **Crayon**: wax-crayon scribbles over the pip area, as if a kid "fixed" the card: a wobbly redrawn pip or two, a scribbled-out area. The index becomes `index/crayon/?`. |
| `knock/marked` | 64×88 | **Marked**: a pinprick hole (1 px dark plus a 1 px light rim) and a tiny pencil dot near the top-left corner. Subtle: a cheater's mark. |
| `knock/wrongsuit` | — | No new art. Code stamps the second suit's `index/suit/*` under the main index (see §6) at a crooked 12° with a 1 px registration offset, like a misprint. |
| `knock/beer/1` `/2` | 48×48 | **Beer-stained**: a brown ring stain, darker at the rim, with a splash drip. Code places it over the card's lower half and overlaps the stuck-to partner card (it draws the partner offset by (10,6) behind). |

### 4.8 Finishes
Finishes are **shaders** (ART.md §9). Each also gets a **frame trim sprite**, so the finish reads even with effects turned down (reduce motion, post at 0%).

| Key | Size | Code id | Description |
|---|---|---|---|
| `finish/foil` | 64×88 | `foil` | Gold-leaf trim: replaces the printed border with a 2 px gold line (gold ramp), plus corner flourishes. The shader adds the moving sheen. |
| `finish/holo` | 64×88 | `holo` | A **greyscale** hex-grid pattern over the full face at low contrast. The shader turns it into a rainbow that shifts with tilt. Also a small holo security seal (8×8) top-center. |
| `finish/embers` | 64×88 | `prism` | A singed edge: the 3 px rim darkened toward burnt umber, with tiny ember dots in the palette's flame ramp. The shader adds the glow and rising sparks. |
| `misprint` | — | `misprint` | No sprite. Code draws the pip/court layer twice: a ghost copy offset by (1,1) and tinted cyan or magenta at 40%, like a print-registration error. |

### 4.9 Variants (the bottom-left corner)
A card has at most one variant.

| Key | Size | Description |
|---|---|---|
| `variant/chase` | 18×18 | **Chase**: a diagonal gold-foil ribbon across the bottom-left corner reading "CHASE" in tiny caps. The card also gets the foil sheen shader on the ribbon only. |
| `variant/rookie` | 10×11 | **Rookie**: an "RC" shield badge (rookie-card convention), brass with burgundy letters. |
| `variant/sticker` | 12×12 | **Sticker**: a peeling corner curl showing the white backing. Used with `base/sticker`. |
| `jumbo` | — | **Jumbo**: no new art. The whole assembled card renders at 1.5×. |

### 4.10 Forging (Flamber): tiers and traits
| Key | Size | Description |
|---|---|---|
| `tier/star` | 7×7 | A five-point star, brass with a white-hot center pixel. Pivot at the center. Up to 3 stack down the top-right. Heat glow is a shader (ART.md §9). |
| `trait/plate/1` `/2` `/3` | 14×11, 24×11, 34×11 | A small **brass plate** that hangs off the bottom edge, with 1, 2 or 3 icon sockets. Riveted ends. Pivot at top-center. |
| `trait/twin` | 9×9 | Two overlapping card outlines (multi ×2) |
| `trait/triplet` | 9×9 | Three overlapping card outlines (multi ×3) |
| `trait/quad` | 9×9 | Four overlapping card outlines (multi ×4) |
| `trait/split` | 9×9 | A card split diagonally in two |
| `trait/household` | 9×9 | A tiny house (a full house by itself) |
| `trait/bridge` | 9×9 | A small arched bridge (any rank in a straight) |
| `trait/wild` | 9×9 | A four-suit rosette (every suit) |
| `trait/crown` | 9×9 | A crown (bridge + wild + grade) |

Trait icons are full color in brass and ink, so they read on the brass plate. Each icon also has to work alone at 9×9 in tooltips.

### 4.11 Value tags
| Key | Size | Description |
|---|---|---|
| `tag/value` | 16×9 | A small cream **paper tag** with a string hole on the left, pinned past the right edge. It shows **grind** (+Value from folds). |
| `tag/hype` | 16×9 | The same tag in a flame-orange tint, for **bonusHype** (1st Edition growth). |
| `digits/0`…`9`, `digits/plus`, `digits/minus` **[T]** | 4×6 | A small pixel digit set for tags, slab labels and anything tiny. Pixel sans, not Didone. |

### 4.12 Grading slab
| Key | Size | Description |
|---|---|---|
| `slab/case` | 72×106 | A clear plastic grading case: a 4 px frame around a card-sized window, with a 14 px **label** band at the top. Edges catch light (a 1 px white highlight on top and left). The window is transparent (the card shows through). Pivot at the window's top-left, so the card sits at (4,18). |
| `slab/label` | 64×12 | The label: cream with a gold edge, a small flame logo on the left, and a big-digit area on the right. |
| `slab/digits/1`…`10` | 10×10 | The grade number in **pixel Didone**, gold. |

### 4.13 Card backs (one per starter box)
| Key | Size | Description |
|---|---|---|
| `back/frame` | 64×88 | The shared back frame: a burgundy-and-brass border 5 px wide with corner ornaments. The center window is transparent. |
| `back/tile/<box>` | 8×8 (tileable) | A repeating pattern filling the center window. |
| `back/emblem/<box>` | 32×40 | The box's emblem, centered on the pattern. |

| Box (code id) | Name | Pattern tile | Emblem |
|---|---|---|---|
| `classic` | Classic Box | burgundy diamond lattice | interlocking "FF" monogram in brass |
| `forge` | Flambé Box | tiny flame tongues on dark red | a crucible pouring molten gold |
| `suited` | Suited Box | alternating ♥ ♠ | a heart and spade crossed like swords |
| `highroller` | High Roller | black with gold pinstripe | a stack of plaques with a crown |
| `bargain` | Bargain Bin | brown kraft paper with a price-gun dot pattern | a slashed price tag "SOLDE" |
| `collector` | Collector Box | violet velvet weave | a binder ring and sleeve |
| `standard` | Standard Deck | plain green felt weave | a simple brass "F" crest |

---

## 5. Pip layouts

Pip centers on the 64×88 card. Columns: **L x=20, C x=32, R x=44**. Pips with y > 44 are drawn **rotated 180°** by code.

| Rank | Pips (x, y) |
|---|---|
| 2 | C16, C72 |
| 3 | C16, C44, C72 |
| 4 | L16, R16, L72, R72 |
| 5 | L16, R16, C44, L72, R72 |
| 6 | L16, R16, L44, R44, L72, R72 |
| 7 | L16, R16, C30, L44, R44, L72, R72 |
| 8 | L16, R16, C30, L44, R44, C58, L72, R72 |
| 9 | L16, R16, L35, R35, C44, L53, R53, L72, R72 |
| 10 | L16, R16, C25, L35, R35, L53, R53, C63, L72, R72 |
| A | `pip/ace/<suit>` at (32,44) |
| J Q K | `court/<rank>/<suit>` with top-left at (12,10), plus the same sprite rotated 180° with its top-left at (51,77) |

Most boxes play 7 through A, but the Standard Deck has 2–6, so all ranks are needed.

---

## 6. Second rank and suit marks

Some cards count as two things. Show the second one as a **mini index** right under the main index (and mirrored at the bottom-right):

| Card | Mini index at (5,24) |
|---|---|
| `split` trait (also counts as rank R) | `index/mini/R`, tinted the card's suit color |
| `household` trait (full house: 3 of its rank + 2 of P) | `index/mini/P` + `index/mini/P`, side by side |
| `wrongsuit` knockoff (also counts as suit S) | `index/suit/S` tinted in S's color, crooked 12°, offset 1 px |
| `wild` / `crown` | no mini index. The trait icon says it |

---

## 7. Layer order (bottom → top)

Code draws in this order. Every line is a separate sprite or a runtime effect.

1. `base/shadow` (runtime offset)
2. `base/paper`, `base/sticker` or `base/bulk`
3. finish trim (`finish/*`) and the finish shader
4. pips **or** court halves (misprint ghost copy first, if any)
5. indices: rank, suit, mini (top-left, then rotated bottom-right)
6. wear (`wear/*`), only if graded
7. stamp or knockoff (`stamp/*`, `knock/*`, `damage/tear`)
8. variant (`variant/*`)
9. tier stars (`tier/star` × tier) and heat shader
10. trait plate + trait icons
11. value tags
12. grading slab (`slab/case` + `slab/label` + digits), if it's in a slab
13. runtime only: hover outline, tilt, `juiceUp`, dissolve or burn

---

## 8. Motion notes for the artist

Nothing here is animated in Aseprite. Motion is code. Things to keep in mind:
- Parts will **tilt up to 12°** in fake 3D and wobble ±6°, so avoid 1 px details that only read when perfectly straight (lonely single pixels on diagonals).
- Stamps, stars and trait icons **pop** (scale +20%) on their own, so give each one a clear silhouette.
- Cards will be seen **foreshortened on the felt** (perspective plane), so the index has to read even squashed to about 60% height. Keep rank glyphs bold.

---

## 9. Readability checks

The card must read at each of these sizes:
- **In hand, 1×** (3 screen px per art px at 1080p): every detail.
- **On the felt** (foreshortened, about 0.6–0.8× height): rank and suit at a glance.
- **Rival's cards across the table** (about 0.5×): only the back and its emblem.
- **Four-color mode:** check that ♦ in brass reads on cream.

Squint test: at 0.5× you must still tell 7 from 9 and ♣ from ♠.

---

## 10. Review sheet

When the parts exist, assemble these sample cards on one contact sheet (`art/cards/review.png`, on green felt, 3× scale). That's how the set gets reviewed:

1. 7♥ plain
2. 10♣ plain
3. K♠ plain (court check: both halves, seam)
4. A♠ plain
5. Q♦ foil
6. 9♠ holo
7. J♥ embers (`prism`)
8. 8♦ misprint
9. K♥ ★2 Twin (twin + split traits, mini index)
10. Q♣ ★3 (3 stars, 3-trait plate, crown)
11. 7♠ 1st Edition + hype tag +3
12. 10♥ signed + grind tag +2
13. A♦ gold seal
14. 9♣ damaged
15. 7♦ crayon
16. 8♥ marked
17. J♠ wrong suit (♥)
18. 10♦ + 10♠ beer-stained pair
19. K♦ Chase
20. 9♥ Rookie
21. Q♠ Sticker
22. A♥ Jumbo (1.5×)
23. 8♠ graded 3 in slab (heavy wear)
24. J♣ graded 10 in slab
25. Bulk
26. All 7 backs in a row
27. The same row of 7♥ 8♦ 9♣ 10♠ in four-color mode

---

## 11. Files and export

- **Aseprite**, one file per group, under `art/cards/`:
  - `base.aseprite` (bases, shadow)
  - `index.aseprite` (rank, suit, mini, crayon glyphs, digits)
  - `pips.aseprite` (pips, ace pips)
  - `courts.aseprite` (12 courts + joker)
  - `overlays.aseprite` (wear, damage, stamps, knockoffs, finish trims, variants)
  - `forge.aseprite` (stars, trait plates, trait icons, tags)
  - `slab.aseprite` (case, label, grade digits)
  - `backs.aseprite` (frame, tiles, emblems)
- **One sprite = one slice** in its file. The slice name = the atlas key (e.g. `court/K/S`). Every slice has a **pivot** set as in the tables.
- **Export:** one packed atlas `art/cards/cards.png` + `cards.json` (Aseprite's JSON with slices and pivots), via a script like `art/logo/claude/build.lua`, so it can be rebuilt with one command.
- **No anti-aliasing to transparency.** Edges are hard pixels; the outline does the smoothing. Manual AA is allowed inside sprites, using palette colors only.
- **The palette is locked** to `art/palette/flambeur.gpl`, plus the greyscale ramp for **[T]** sprites.

---

## 12. Sprite count

| Group | Count |
|---|---|
| Bases | 4 |
| Index (13 rank, 4 suit, 13 mini, 1 crayon) | 31 |
| Pips (4 + 4 ace) | 8 |
| Courts (12, joker later) | 12 |
| Wear (3 × 2) + tear | 7 |
| Stamps | 3 |
| Knockoffs (crayon 2, marked 1, beer 2) | 5 |
| Finish trims | 3 |
| Variants | 3 |
| Star, 3 plates, 8 trait icons | 12 |
| Tags + 12 digits | 14 |
| Slab (case, label, 10 digits) | 12 |
| Backs (frame, 7 tiles, 7 emblems) | 15 |
| **Total** | **~129 sprites** |

---

## 13. Still open (not blocking the art)

- **The UI has to show "Embers" for `prism`.** `src/main.ts` still says "Prism".
- **Joker cards** are later scope; only the court rule is set.
- **Booster pack wrappers, chips and plaques** belong in a separate objects spec.
