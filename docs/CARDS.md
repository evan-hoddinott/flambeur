# Flambeur: card art spec

Everything an art agent needs to draw the cards without asking. Style, palette and mood come from `docs/ART.md`, so read that first. This doc covers **what to draw, at what size, where it sits, and how it's cut up**. The game data behind it is `src/engine/cards.ts`.

Nov 17 2026. Base paper, indices, pips, courts and backs are drawn. Every special card part (§0.5, §4.1 and §4.5–4.10) is still a code stand-in in `src/ui/art.ts`.

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

## 0.5 The special card rule: as different as Balatro

Evan's call (Nov 17): special cards should look **as different from each other as Balatro's**. In Balatro a Stone card, a Gold card and a Glass card are different objects at a glance, editions shimmer over the whole card, and seals are big and colored. A small corner badge is not enough. Every special has to read **across the table, at 0.5×, with shaders off**.

**Each modifier slot owns one visual channel**, so a card with five modifiers stays readable and no two slots fight over the same pixels:

| Slot | Owns | Reads from | Examples |
|---|---|---|---|
| **Card type** (variant, Joker, Bulk) | **the stock**: the base color, the outer 5 px frame, the silhouette | across the room | Chase is black and gold, Sticker has a white die-cut edge, Jumbo is bigger |
| **Finish** | **the surface**: a shader over the whole card + a 2 px trim on the inner window | across the table, by motion | foil sheen, holo rainbow, embers |
| **Stamp / knockoff** | **the center**: a big mark over the pips or court | in hand | the 1st Edition stamp, the crayon scribbles, the beer ring |
| **Tier** | **the rim**: a colored outline outside the card edge + stars | across the table | ★3 is a white-hot outline |
| **Traits** | **below**: the brass plate hanging off the bottom | in hand | Twin, Bridge |

Rules:
- **The card type changes the frame, never the inner window.** The window stays cream paper, so suit colors and the index read the same on every card. Bulk is the only exception (it has no rank or suit).
- **One signature color per special.** Its tooltip chip and its pack-odds line use the same color, the way Balatro colors keywords. The table below is the source.
- **Every shader has a static backup** (a trim or frame sprite), so the card reads with effects off and in screenshots.
- **No text on the card face**, except the CHASE plaque and the Rookie RC shield (both are real trading-card conventions).

| Special | Signature color | At a glance |
|---|---|---|
| Plain | cream `#f6ecd2` | cream card, burgundy border line |
| **Chase** | black `#120e08` + gold `#e8c260` | a black lacquer frame with gold filigree and a gold CHASE plaque |
| **Sticker** | white `#ffffff` | a 2 px white die-cut edge *outside* the card and a vinyl gloss stripe. Its silhouette is bigger and rounder than any other card's |
| **Rookie** | royal blue `#3e66a0` | a blue sports-card frame with a slanted burgundy band and the RC shield |
| **Jumbo** | kraft `#bfa77e` | the whole card at 1.5× with a visible cardboard thickness edge |
| **Joker** | violet `#7a4ab0` | a harlequin diamond frame (violet, burgundy, brass) with bells at the corners |
| **Crayon Joker** | crayon red | the Joker frame redrawn in wobbly wax crayon |
| **Bulk** | stone grey `#43342e` | a stone slab: no paper at all |
| Gold foil | gold `#e8c260` | gold window trim + sheen over the whole card |
| Holographic | violet `#b088e0` | rainbow over the whole card + hex grid + seal |
| Embers | flame `#ff7a24` | charred edge vignette + ember dots + glow |
| Misprint | cyan + magenta | the face printed twice, 2 px off, in two ink colors |
| ★1 / ★2 / ★3 | flame ramp | an orange / bright orange / white-hot outline outside the card |

---

## 1. Decisions made for this spec

These were open in ART.md. Claude decided them so the spec could close. Change them here if they're wrong.

| Question | Decision | Why |
|---|---|---|
| Finish names in code vs art | `foil` = **Gold foil**, `holo` = **Holographic**, `prism` = **Embers** (top rarity), `misprint` = **Misprint** (a print-registration error) | `prism` is the rarest finish (the collector rare slot), and fire is our top tier. The UI should show "Embers" for `prism`; the code id stays. |
| What's an ungraded card? | **Clean.** No wear overlay at all | Most cards are never graded (`grade: null`). Wear only appears once a card has a Grade, so grading reveals the condition. |
| `damaged` stamp vs Grade wear | **Damaged = a real tear plus tape**, heavy and obvious. **Wear = condition**, subtle. Separate sprites | Damaged is a mechanic you must spot at a glance. Wear is flavor. |
| Jumbo size | **The same parts drawn at 1.5× scale** (96×132 on screen), plus a 3 px cardboard edge on the bottom and right. It takes 2 slots on the felt | Reuses every sprite. The chunkier pixels *are* the joke: it's a jumbo card. This is the one intentional break of "one pixel scale per plane". |
| How loud are specials? | **As loud as Balatro** (§0.5). Card types change the whole frame, not a corner badge | Evan, Nov 17: the corner badges and 1 px trims didn't read. |
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
 │                          ┌─────┐│
 │                          │INDEX││      BR index (rotated)
 │       ┌[trait plate]┐    └─────┘│
 └───────┴─────────────┴───────────┘ 87
         hangs below the edge
```

| Zone | Rect / pivot | Holds |
|---|---|---|
| Card | 0,0 → 63,87 | — |
| Printed border | inset 3 px, 1 px line | part of `base/paper` |
| Type frame | the outer 5 px ring (0..4 and 59..63 in x, 0..4 and 83..87 in y) | `frame/*` for Chase, Rookie and Joker cards. Covers the printed border. Must stay clear of the index boxes |
| Inner window | 5,5 → 58,82 | always cream paper (the finish trim runs along its edge) |
| Rim | 1 px outside the card outline | tier outline, drawn by code |
| Top-left index | box 4,4 → 13,24 | rank glyph (4,4) + small suit (5,16) |
| Bottom-right index | same box rotated 180° around the card center (31.5, 43.5) | the same sprites |
| Pip / court area | 12,10 → 51,77 (40×68) | pips or court halves |
| Tier stars | 51,3 then 51,13 then 51,23 | up to 3 stars (9×9), top-right, overlapping the frame |
| Center mark | centered at (32,44) | stamps and most knockoffs |
| Trait plate | centered at x 32, top at y 82 | hangs 10 px below the card edge |
| Value tags | right edge, pivots (62,30) and (62,42) | stick out past the right edge |

---

## 4. Sprite list

Names are atlas keys. A **[T]** marks a tintable sprite (greyscale). Sizes are in art px.

### 4.1 Bases (one per card, the bottom layer)
| Key | Size | Description |
|---|---|---|
| `base/paper` | 64×88 | Cream stock (paper ramp), 1 px ink outline, 3 px rounded corners, a printed inner border 3 px in (a thin burgundy line, with a tiny flourish at each corner). Faint paper texture: 2–3 px of dither, nothing busy. |
| `base/sticker` | 68×92 | For the Sticker variant: the card printed on a sticker sheet. A **2 px white die-cut margin outside** the normal outline, with rounder 5 px corners and its own 1 px ink outline, so the silhouette is bigger and softer than any other card. The face inside is the normal cream paper, a touch brighter. Pivot (2,2), so the face lines up with every other part. |
| `base/sticker/gloss` | 64×88 | A diagonal white vinyl gloss stripe (two parallel bands, 4 px and 2 px, top-left to bottom-right) at ~35% white. Static, so it reads without the shader. |
| `base/bulk` | 64×88 | A **stone slab**, not paper: grey-brown stone ramp, chipped corners, a chiselled **+5** in the center (part of this sprite, never tinted), and moss in one corner. No index, no border. Heavy, dull, slightly funny. |

### 4.1b Type frames (the stock)
Each frame is a 64×88 sprite that covers the outer 5 px of the card (§3) and leaves the inner window transparent. They are the loudest thing on the card after the shape itself.

| Key | Size | Description |
|---|---|---|
| `frame/chase` | 64×88 | **Chase**: black lacquer (`#120e08` `#2a2010`) with gold-leaf filigree running around it (brass ramp, a 1 px vine with corner flourishes), a 1 px gold hairline on the window edge, and a **gold CHASE plaque** 26×8 centered on the top border (dark ink caps on gold, riveted ends). It should look expensive and slightly too much. |
| `frame/rookie` | 64×88 | **Rookie**: an 80s sports card. A royal blue border (felt blue ramp) with a 1 px white pinstripe inside it. A **slanted burgundy band** along the bottom edge from x 3 to x 46 (the slant on its right end, clear of the bottom-right index), with a brass **RC shield** 10×11 at its left end. |
| `frame/joker` | 64×88 | **Joker**: a harlequin border of diamonds alternating violet `#7a4ab0`, burgundy `#a82a38` and brass `#c99a3a`, with an ink outline, and a tiny brass jester's bell at each corner. |
| `frame/joker/crayon` | 64×88 | **Crayon Joker**: the same harlequin border, redrawn by a kid in wax crayon: wobbly diamonds, colors outside the lines, one diamond scribbled solid. |
| Jumbo | — | No sprite. Code renders the assembled card at 1.5× and draws a 3 px **cardboard edge** under it on the bottom and right (paper ramp `#8c7656` over `#5c4a36`), so it looks thick. |
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

### 4.6 Stamps (the stamp slot, the center channel)
Stamps work like Balatro's seals: **big, saturated and one color each**, sitting over the art in the center of the card. Code places each one at (32,44) with a seeded random angle (±15°) and offset (±4 px), so no two cards look the same. Draw them straight and centered, at full opacity (patchy ink is fine, faded is not).

| Key | Size | Color | Description |
|---|---|---|---|
| `stamp/first` | 30×30 | burgundy ink | **1st Edition**: a round rubber stamp reading "1ère ÉDITION" around the rim with a big "1" in the middle. Burgundy, not black, so it never blends with ♠♣ pips. |
| `stamp/signed` | 48×20 | blue ink `#28497a` | **Signed**: a big looping ink-pen signature right across the middle of the face, with one flourish. Ink, not stamp texture. |
| `stamp/gold` | 24×24 | gold | **Gold seal**: a gold-leaf wax seal with a flame monogram, raised (highlight and shadow), with two short ribbon tails. |
| `damaged` | — | tape yellow | uses `damage/tear` (§4.5) |

### 4.7 Knockoffs (Off-Brand, also the stamp slot)
| Key | Size | Description |
|---|---|---|
Knockoffs deface the card. Each one should look like **a different kind of damage done by a different person**, loud enough to spot in hand.

| Key | Size | Description |
|---|---|---|
| `knock/crayon/1` `/2` | 40×68 | **Crayon**: bright wax-crayon scribbles (red, green and blue) over the whole pip area, as if a kid "fixed" the card: a wobbly redrawn pip or two and a scribbled-out area. The index becomes `index/crayon/?`. |
| `knock/marked` | 24×32 | **Marked**: a cheater's mark that **you** can see (the rival sees the card face-up anyway). A thick red grease-pencil circle scrawled around the top-left index, a pinprick hole (1 px dark plus a 1 px light rim) inside it, and a small tick mark. Pivot top-left at (1,1). |
| `knock/wrongsuit` | — | No new art. Code stamps the second suit's `index/suit/*` under the main index (see §6) at a crooked 12° with a **2 px** registration offset, and draws the main suit glyph again 2 px off in the wrong suit's color, like a bad print run. |
| `knock/beer/1` `/2` | 48×48 | **Beer-stained**: a brown ring stain, darker at the rim, with a splash drip. Code places it over the card's lower half, adds a faint amber wash (~15%) below it, and overlaps the stuck-to partner card (it draws the partner offset by (10,6) behind, with the ring crossing both). |

### 4.8 Finishes
Finishes work like Balatro's editions: **the shader covers the whole card**, frame included, so a foil Chase is gold all over. Each also gets a **trim sprite** along the inner window edge, 2 px wide, so the finish reads even with effects turned down (reduce motion, post at 0%) and on top of any type frame.

| Key | Size | Code id | Description |
|---|---|---|---|
| `finish/foil` | 64×88 | `foil` | A 2 px gold-leaf line (gold ramp, bright highlight on top and left) around the inner window, with corner flourishes that reach into the frame. The shader adds a moving diagonal sheen over the whole card. |
| `finish/holo` | 64×88 | `holo` | A **greyscale** hex-grid pattern over the full card at low contrast, a 2 px pale line around the window, and a holo security seal (10×10) top-center. The shader turns all of it into a rainbow that shifts with tilt. |
| `finish/embers` | 64×88 | `prism` | A charred vignette: the outer 4 px burnt toward umber and ink, ragged on the inside edge, with ember dots (flame ramp) along it. The shader adds the glow and rising sparks. |
| `misprint` | — | `misprint` | No sprite. Code draws the pip/court and index layers three times: a cyan copy at (−2,0) and a magenta copy at (2,1), both at 50%, under the real one, like a bad print-registration error. |

### 4.9 Variants
A card has at most one variant. Variants are card types, so their main look is the stock (§4.1 and §4.1b). These are the small extras on top.

| Key | Size | Description |
|---|---|---|
| Chase | — | `frame/chase` (§4.1b). The plaque also gets the foil sheen shader, even on a card with no finish. |
| Rookie | — | `frame/rookie` (§4.1b), which includes the RC shield. |
| `variant/sticker/peel` | 14×14 | **Sticker**: a peeling corner curl at the bottom-left, showing the white backing and a little shadow under the lift. Used with `base/sticker` and `base/sticker/gloss`. |
| Jumbo | — | No new art (§4.1b). |

### 4.10 Forging (Flamber): tiers and traits
| Key | Size | Description |
|---|---|---|
| `tier/star` | 9×9 | A five-point star, brass with a white-hot center pixel and a 1 px ink outline, so it reads on any frame. Pivot at the center. Up to 3 stack down the top-right. |
| Tier rim | — | No sprite. Code draws a 1 px outline just outside the card's silhouette (the rim channel, §0.5): ★1 `#e8501a`, ★2 `#ffb03a`, ★3 `#fffbe8` with a `#ff7a24` second pixel outside it. The heat shader and sparks (ART.md §9) add on top of this static rim. |
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

1. `base/shadow` (runtime offset), then the Jumbo cardboard edge, if any
2. tier rim (code), just outside the silhouette
3. `base/paper`, `base/sticker` or `base/bulk`
4. type frame (`frame/*`)
5. finish trim (`finish/*`)
6. pips **or** court halves (misprint ghost copies first, if any)
7. indices: rank, suit, mini (top-left, then rotated bottom-right)
8. wear (`wear/*`), only if graded
9. stamp or knockoff (`stamp/*`, `knock/*`, `damage/tear`)
10. sticker gloss and peel (`base/sticker/gloss`, `variant/sticker/peel`)
11. tier stars (`tier/star` × tier)
12. finish shader over everything above, then the heat shader
13. trait plate + trait icons
14. value tags
15. grading slab (`slab/case` + `slab/label` + digits), if it's in a slab
16. runtime only: hover outline, tilt, `juiceUp`, dissolve or burn

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

Special test (§0.5): at 0.5× on the felt, **with shaders off**, you must tell plain, Chase, Sticker, Rookie, Jumbo, Joker and Bulk apart by color and silhouette alone, and spot a finish, a stamp and a ★ on each. Review row 28 checks this.

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
28. The special test at 0.5×, shaders off: plain, Chase, Sticker, Rookie, Jumbo, Joker, Crayon Joker, Bulk in a row, then one row of 9♠ foil / holo / embers / misprint, then K♥ ★1 / ★2 / ★3
29. The worst case: a foil Chase ★3 with a Gold seal and a 3-trait plate. It must still read as all five things.

---

## 11. Files and export

- **Aseprite**, one file per group, under `art/cards/`:
  - `base.aseprite` (bases, shadow)
  - `index.aseprite` (rank, suit, mini, crayon glyphs, digits)
  - `pips.aseprite` (pips, ace pips)
  - `courts.aseprite` (12 courts + joker)
  - `frames.aseprite` (type frames, sticker base, gloss and peel)
  - `overlays.aseprite` (wear, damage, stamps, knockoffs, finish trims)
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
| Type frames (chase, rookie, joker, crayon joker) + sticker gloss + peel | 6 |
| Star, 3 plates, 8 trait icons | 12 |
| Tags + 12 digits | 14 |
| Slab (case, label, 10 digits) | 12 |
| Backs (frame, 7 tiles, 7 emblems) | 15 |
| **Total (cards)** | **~133 sprites** |
| Collectibles (§14): 29 animated sprites + playmat suit + PSA label | 31 |

---

## 13. Still open (not blocking the art)

- **The UI has to show "Embers" for `prism`.** `src/main.ts` still says "Prism".
- **Joker cards** are later scope; only the court rule is set.
- **Booster pack wrappers, chips and plaques** belong in a separate objects spec.

---

## 14. Collectibles (La Vitrine)

Picked by Evan on Nov 17 from two concepts each. The engine side is `src/engine/collectibles.ts`; the ids below are its ids.

### 14.1 Rules for the whole set

Collectibles are **not cards**. Like Balatro's jokers, each one is its own object with its own size, silhouette and background, so you know it from its shape before you read its name.

- **No shared frame.** Each sprite is the object itself, cut out to its own silhouette on transparency. The hit box is the sprite's alpha.
- **Size cap: 100×106.** Nothing bigger, so the Vitrine row and the shop shelf stay predictable. A normal card (64×88) is the reference size. Small things (Price Sticker 44×30) are small on purpose.
- **Rarity is a glow behind the object.** Code draws it from the sprite's alpha, 2–3 px out, softly pulsing: **common = none**, **uncommon = a cool silver-blue glow** (`#b8d0e8`), **rare = a gold glow** (gold ramp, `#e8c260` → `#fff0b0`). Not part of the sprite.
- **Backgrounds by rarity:**
  - **Common:** the object alone. It sits on the Vitrine's dark velvet (or the shop shelf), so the silhouette does all the work.
  - **Uncommon and rare:** a **small scene drawn behind the object**, part of the sprite, inside the same silhouette budget. The scene has its own shape too (a vignette, a panel, a bit of wall), never a plain rectangle unless the entry says so.
- **The hidden buraliste.** Balatro hides "Joker" in every joker; we hide **the buraliste** in every collectible: his mustache, his Gitane, his L'Équipe, his cardigan, his handwriting. Each entry says where. It should be findable but never the first thing you see.
- **Every one has a tiny idle loop**, 2–6 frames, slow (0.15–0.3 s per frame, with a random phase so the case doesn't pulse in sync). Each entry gives it. On trigger in scoring the whole sprite also gets the usual `juiceUp` pop (code).
- **No rule text on the art.** The effect is in the tooltip. Words that are part of the object (a label, an engraving) are fine.
- Palette, outline and pixel rules are the same as the cards (§2). Effects that glow (UV, flame, glare) may be shaders on top, but the sprite has to read without them.

### 14.2 Display

- **La Vitrine** (DUEL.md §7.3): collectibles stand in a row on the case's velvet floor, **bottom-aligned**, 6 px apart, each at its own size. The row is centered.
- **The shop shelf** (SHOP.md): a collectible stands on the shelf at its own size, bottom-aligned with the packs. Its slot is its width + 8 px (min 48). The price tag hangs under it as usual.
- **Rolled params** (Playmat's suit, PSA 10 Slab's rank) are drawn by code into the art, so you see what you rolled without a tooltip.

### 14.3 The 29

Size is the sprite's bounding box in art px. Loop = the idle animation. Buraliste = where he hides.

#### Commons (no background)

**Lucky Penny** (`penny_sleeve`, +4 Hype) · 64×88
- A plain cream card with an old French centime **taped** to its middle with yellowed tape, and "porte-bonheur" scrawled under it in blue biro.
- Loop: a glint slides across the coin.
- Buraliste: the biro handwriting is his, and there's a tiny mustache doodle in the margin.

**Top Loader** (`top_loader`, +30 Value) · 64×98
- A rigid clear top loader, taller than a card, holding a dead-plain **2♣** as if it were a treasure. One big diagonal glare streak; a thick clear lip at the top opening.
- Loop: the glare streak slides down and back.
- Buraliste: his mustache, reflected faintly in the plastic.

**Rubber Band** (`rubber_band`, Pair: +8 Hype) · 56×56
- A **rubber-band ball**, round, mostly red with a few tan and green bands, one snapped strand sticking out.
- Loop: the snapped strand wiggles.
- Buraliste: one band has "L'ÉQ…" printed on it, from his newspaper bundle.

**Binder Divider** (`binder_divider`, Two Pair: +10 Hype) · 64×88
- A pastel green cardboard divider with a **tab sticking up at the top-right** reading "PAIRES ×2", and three ring holes punched down the left edge. The silhouette has the tab.
- Loop: the tab flutters 1 px.
- Buraliste: his initials penciled on the tab's back corner.

**Card Stack** (`card_stack`, Three of a Kind: +12 Hype) · 72×96
- **Three identical cards stacked crooked**; the silhouette is the jagged stack, and the top card is sliding off.
- Loop: the top card creeps 1 px and snaps back.
- Buraliste: a Gitane butt balanced on the top card.

**Straight Edge** (`straight_edge`, Straight: +80 Value) · 30×100
- A long, thin **brass ruler**. Its markings are card ranks, 9 · 10 · J · Q · K, instead of centimetres, with tick marks between.
- Loop: a glint runs down its length.
- Buraliste: "PROPRIÉTÉ DU TABAC" engraved along the back edge.

**Color-Sorted Binder** (`color_binder`, Flush: +10 Hype) · 92×66
- A **landscape binder page**, nine plastic pockets of red hearts, perfectly sorted, **except one spade** in the bottom-right pocket.
- Loop: the spade shuffles in its pocket.
- Buraliste: the stray spade has a tiny mustache drawn on it.

**Draft Chaff** (`draft_chaff`, High Card: +60 Value) · 62×58
- A **crumpled paper ball**, partly unfolded to show a sad 7-2 offsuit inside. Lumpy, irregular silhouette.
- Loop: the paper slowly uncrumples 1 px, then crumples back.
- Buraliste: the paper is a torn page of L'Équipe.

**Low Ball** (`low_ball`, each scored 2–5: +20 Value) · 64×44
- A **wee card**, half height, in navy, with a tiny bowling ball rolling along its bottom edge. It's small because it's low.
- Loop: the ball rolls across and loops around.
- Buraliste: his face reflected in the bowling ball.

**Odd Lot** (`odd_lot`, each scored A,3,5,7,9: +3 Hype) · 60×84
- A bundle of odd-ranked cards tied with string, with an **auction lot tag** ("LOT 7"). The top-right corner is chopped off, so the whole thing is lopsided.
- Loop: the tag swings.
- Buraliste: the tag's handwriting is his.

**Even Stack** (`even_stack`, each scored 2,4,6,8,10: +20 Value) · 64×64
- A **perfectly square**, perfectly symmetrical arrangement of neat chip stacks of 2, 4, 6, 8 and 10 on felt, not a pixel out of place.
- Loop: one chip on top settles with a tiny wobble.
- Buraliste: one chip has his mustache as its inlay.

**Playmat** (`playmat`, each scored {S}: +3 Hype) · 100×56
- A **wide felt playmat** with stitched edges and the **rolled suit printed huge** in the middle. The suit is a **[T]** greyscale sprite (`collect/playmat/suit`, 32×32) that code tints and places, so one mat covers all four suits.
- Loop: the stitching shimmer runs around the edge.
- Buraliste: a cigarette burn in one corner.

**Deck Box** (`deck_box`, draw 9 cards instead of 8) · 84×60
- An **open cigar box** with a deck inside and one card too many, so the lid can't close. Brass hinges, a paper label on the lid.
- Loop: the lid bobs as the extra card pushes it.
- Buraliste: he's the portrait on the cigar brand label.

**Price Sticker** (`price_sticker`, +$1 every round you win) · 44×30
- Just a **big orange price-gun sticker** reading "1 F", peeling up at one corner. Tiny on purpose.
- Loop: the peeling corner lifts and settles.
- Buraliste: a tiny mustache logo printed on the sticker.

**Store Credit** (`store_credit`, first restock each shop is free) · 88×54
- A **loyalty punch card** for the tabac: a row of punched holes with **one left to punch**.
- Loop: the last empty circle blinks a dotted outline.
- Buraliste: his mustache is the shop's logo on the card.

**Participation Trophy** (`participation_trophy`, grind bonuses ×10) · 56×88
- A **cheap gold-plastic trophy**, the sprite cut to its outline: a "10e place" plaque and one handle snapped off.
- Loop: a sad glint, then a flicker where the plastic is scratched.
- Buraliste: the figurine on top is him.

#### Uncommons (a scene behind, silver-blue glow)

**Face Binder** (`face_binder`, each scored J/Q/K: +5 Hype) · 80×88
- A **gallery wall**: J, Q and K as gilt-framed oil portraits (their Paris-pattern faces, painted). The King is sticking his tongue out.
- Scene: burgundy damask wallpaper with a picture rail.
- Loop: the King's tongue goes in and out.
- Buraliste: the Jack has his mustache.

**Suit Sorter** (`suit_sorter`, +1 Grade if you played all 4 suits) · 72×72
- A **square wooden tray, seen from above**, four compartments, one suit's cards in each.
- Scene: a zinc counter top, the tray sitting on it.
- Loop: a card in one compartment shifts.
- Buraliste: cigarette ash in one compartment.

**Team Bag** (`team_bag`, +3 Hype per empty display slot) · 66×90
- A **floppy resealable plastic bag**, almost transparent, containing **nothing but one crumb**. The emptiness is the point.
- Scene: seen against a window, so the light comes through the bag.
- Loop: the bag sways and its crinkle highlights shift.
- Buraliste: "à jeter" written on the bag's label strip.

**Black Light** (`black_light`, +1 Grade if 3+ scored cards have a Finish) · 64×88
- A card lit by **UV**: pitch black around it, violet glow, the card's hidden watermark and its foil pips glowing.
- Scene: a dark booth with the purple tube lamp at the top edge.
- Loop: the UV flickers.
- Buraliste: the watermark the UV reveals is his mustache.

**Chef's Apron** (`card_sleeves`, +1 Grade if you played a flambéed card) · 66×92
- An **apron-shaped sprite** with strings hanging off the sides, scorch marks, and "Bon appétit" embroidered on the pocket.
- Scene: a kitchen hook and white tiles behind it.
- Loop: the strings sway.
- Buraliste: a Gitane sticking out of the pocket.

**Tournament Badge** (`tournament_badge`, +15 Hype if you bet Max) · 58×100
- A **laminated lanyard badge** hanging off a strap that runs off the top of the sprite. It reads "JOUEUR", with a mugshot of a masked player.
- Scene: the hint of a tournament banner behind the strap.
- Loop: the badge swings on its strap.
- Buraliste: he's photobombing the mugshot's background.

**Combo Platter** (`combo_platter`, +10 Hype per bonus hand) · 84×64
- An **oval plate** of cheese and charcuterie where the cheese slices are tiny cards.
- Scene: a checked bistro tablecloth peeking out round the plate.
- Loop: a cornichon rolls.
- Buraliste: one slice of saucisson is shaped like his mustache.

**Specialist** (`specialist`, +15 Hype if you scored no bonus hands) · 58×58
- A **round gold monocle** over a single card, with a chain hanging off the edge.
- Scene: the inside of the lens is the scene, a magnified card on felt.
- Loop: a glint on the lens, and the chain sways.
- Buraliste: his eye, reflected in the lens.

**Chalumeau** (`forge_hammer`, each scored flambéed card: +20 Value) · 64×104
- A **kitchen blowtorch**; its flame **bursts out through the top** of the sprite. The flame is a sprite plus the flame particle shader.
- Scene: a scorched dark kitchen tile wall.
- Loop: the flame flickers (4 frames).
- Buraliste: tiny in the background, lighting his Gitane off the flame.

#### Rares (a scene behind, gold glow)

**Triple Threat** (`triple_threat`, +1 Grade for a rank hand + straight + flush) · 100×80
- A **gilt triptych**, three hinged panels like an altarpiece: pairs on the left, a straight in the middle, a flush on the right.
- Scene: a chapel niche, candlelight.
- Loop: the candlelight flickers across the gold.
- Buraliste: kneeling in a lower corner as the **donor portrait** (the real medieval convention).

**PSA 10 Slab** (`psa_slab`, +1 Grade if 2+ scored cards are {R}) · 72×106
- A full **grading slab** reusing `slab/case` (§4.12), with a **live card of the rolled rank** composited inside at (4,18) and a special label: "GEM MINT 10". Rainbow glare.
- Scene: none behind (it's a slab), but the glare shader is always on.
- Loop: the rainbow glare sweeps.
- Buraliste: his signature on the label, as the "certified by".
- New sprite: `collect/psa/label`, 64×12.

**Thin Binder** (`thin_binder`, +1 Grade if your deck has 18 or fewer cards) · 48×88
- A **slim silver cigarette case**, open a crack, with one card inside.
- Scene: a velvet-lined drawer.
- Loop: a glint runs down the silver.
- Buraliste: it's his case; his monogram is engraved on the lid.

**High Roller** (`high_roller`, +1 Grade and +10 Hype while bankroll is under 3× the ante) · 64×104
- A **tall portrait** of a masked gentleman in a top hat, pockets turned out, proudly holding up one last chip.
- Scene: a dark casino with a chandelier.
- Loop: the chip glints, and his hat tips.
- Buraliste: in the background, holding up the tab he owes.

### 14.4 Files

- `art/collectibles/collectibles.aseprite`: one frame tag per collectible (the idle loop), one slice per collectible named by its engine id, pivot at bottom-center (so code can bottom-align them).
- Plus `collect/playmat/suit` **[T]** and `collect/psa/label`.
- Export to `art/collectibles/collectibles.png` + `.json`, same pipeline as the cards (§11).
- Review sheet: `art/collectibles/review.png`, all 29 in a Vitrine row at 3×, plus the rarity glows, plus one row of the shop shelf.
