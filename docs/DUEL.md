# Flambeur: duel scene spec

The main screen: you against one rival across a long card table in the casino's back room. This doc is for the art agent and for whoever builds the renderer. Style, palette and the motion system come from `docs/ART.md`, and the cards from `docs/CARDS.md`. Read both first.

Nov 17 2026, from Evan's duel-scene answers. The scope is **full**: everything here is wanted. Where this doc and ART.md disagree about the duel, this doc wins.

---

## 0. Rules carried over

- **Everything is segmented.** Every part is its own sprite with an Aseprite slice and a pivot: each mask, hand, arm, lamp, chip, sign, curtain. Code assembles, moves and animates them. Don't bake in shadows, glows, light cones or mirrored copies.
- **Stage:** 640×360 art units, 16:9, letterboxed. All coordinates below are stage coordinates (x right, y down, origin top-left).
- **Pixel rule:** crisp nearest-neighbor sprites with free transforms. Things on the same depth plane share one art-pixel scale. Sprites below are listed at the size they're drawn **at their depth**, so code doesn't scale them except for camera moves.
- **Master palette** (`art/palette/flambeur.gpl`). Light, smoke, glow and the swirl are shaders, not paint.

---

## 1. Decisions made for this spec

Evan's answers left these open. Claude decided them so the doc could close, so change them here if they're wrong.

| Question | Decision |
|---|---|
| "All 10 masks unlocked by default": which 10? | The 10 in §4.1. The 3 rival masks are 3 of the 10, so the art is shared. |
| "Red and blue numbers" instead of a tug-of-war bar | **Your bankroll is blue** (`#3e66a0` → `#6f9ad8`), **the rival's is red** (`#d04a4e`). The 2× underdog perk shows as a small 👁 icon next to the underdog's number, not as a bar. Pot and prices stay money green. |
| Collectibles view | A Balatro-style **pull-down tab**, "La Vitrine", top-left. Yours only; the rival's are never shown. Rearrange by drag. |
| Hand cheat sheet | A **crumpled paper** on the rail, bottom-right. Click to unfold full-screen. |
| Rival's choice | A **speech bubble** says it ("Tapis.", "Je me couche."), then your slips appear. |
| The rival's hand vs the hidden-info rule | The rival **holds all their cards** in a fan the whole round. At showdown the played ones fly from their hand to their card spots; the rest stay held. So you see their hand size but never their locked count. |

---

## 2. Layout

> **Nov 17 readability pass:** the built scene no longer matches the ASCII sketch below. Every element now has its own zone so nothing competes for space (READABILITY.md §7). The **"Built layout"** table under the sketch is the current truth, and the 640×360 numbers live in `src/ui/duel.ts` (`COL`, `MY_PILE`, `MY_DISCARD`, `NEAR_ROW`, `FAR_ROW`).

```
 0                                                                         640
 ┌──────────────────────────────────────────────────────────────────────────┐ 0
 │[VITRINE▼]   curtain        ┌──────┐  ║lamp║   sconce        curtain        │
 │  chalkboard                │      │  ╚════╝            ┌RIVAL PLATE──────┐ │
 │  ┌─────────┐   ·silhouette·│ RIVAL│  (sign drops here) │ mask  $ red 45  │ │
 │  │Table 2  │               │ head │                    │ hand 7 · mull 1 │ │
 │  │Manche 5 │               │ +mask│                    └─────────────────┘ │
 │  └─────────┘          ┌────┴──────┴───┐                                    │ 120
 │                       │ rival torso   │ rival's card fan held at chest     │
 │═════════ far rail (barely seen) ═══════════════════════════════════════════│ 150
 │   rival pile ▯   rival spots ▭▭▭▭▭     rival chips ◎    rival discard ▯     │
 │                        ┌──── POT ZONE ────┐                                │
 │                        │  (crest) chips $ │                                │ 205
 │                        └──────────────────┘                                │
 │   your pile ▯     your spots ▭▭▭▭▭        your chips ◎     your discard ▯   │ 250
 │ ┌YOUR PLATE──────┐                                                        │
 │ │mask  $ blue 62 │   ╭── floating fan hand (8 cards) ──╮    [slips]       │
 │ │hand 8 · mull 0 │  you (head + shoulders)                    🗒 cheat    │
 │═└────────────────┘═══ near rail ════════════════════════════════════════════│ 320
 └──────────────────────────────────────────────────────────────────────────┘ 360
```

| Element | Position (pivot) | Notes |
|---|---|---|
| Room backdrop | fills 0,0 → 640,180 | Mostly dark (see §6) |
| Lamp | hangs from (320,0), shade bottom at y 66 | Green banker's shade |
| Rival | head center (320,90), torso pivot at (320,150) | The far table edge cuts them at the waist |
| Rival card fan | center (320,132) | Card backs, at rival-depth scale (≈0.55×) |
| Far rail | y 148–154, full width | We barely see it: a dark burgundy line with studs |
| Felt plane | far edge y 152 → near edge y 312 | Perspective plane, full width, sides run off-screen |
| Rival card spots | 5 spots centered at y 172 | Printed gold outlines on the felt |
| Pot zone | center (320,205) | Printed oval, crest under it |
| Your card spots | 5 spots centered at y 238 | |
| Piles | yours: pile (110,262), discard (530,262). Rival: pile (190,166), discard (450,166) | Left = pile, right = discard |
| Chip stacks | yours (450,262), rival's (390,166) | Jetons + plaques, plus a number above |
| Near rail | y 306–322, full width | Burgundy leather, brass studs, front and center |
| You | shoulders pivot at (230,360), head center (230,300) | Cut by the bottom edge, left of center |
| Floating hand | fan center (360,300), arc radius ~260 | 8 cards at 1× (64×88), overlapping |
| Your plate | top-left at (8,262) | Over the rail and your shoulder |
| Rival plate | top-right at (632,24) | |
| Betting slips | right side, x 520–630, y 240–330 | Only when it's your turn |
| Cheat sheet | (600,330) on the rail | A crumpled ball of paper |
| Vitrine tab | top-left (8,0) | Pull-down |
| Chalkboard | top-left at (34,28), 96×64 | On the back wall |
| Pocket watch | (100,300) on the rail | **Multiplayer only** |

### Built layout (Nov 17)

| Zone | What lives there | Stage coords |
|---|---|---|
| **Action column** | the latest log line, the hint, the round tally, the tickets. Nothing else, ever | x 508–634, stacked up from y 352, on a dark band (READABILITY.md §7) |
| Tickets | 126×24 faces + 3 px plinth, 30 apart, bottom one ends at y 352 | x 508 |
| Round tally | paper panel, 118 wide, sits 10 px above the ticket stack | x 512 |
| Your side (left) | your plate (8,144), your chips (60,262), your pile (146,251) with its count above it, you (115,360) | |
| Your discard | (470,228), just left of the action column | |
| Rival side (top) | their plate (482,12), their chips (180,160), their pile (223,158). Their discard spot is gone (it's never drawn) | |
| Speech bubble | ends at (377,82), left of the rival's head, tail pointing right | so it never sits on their plate |
| Score tags | yours centered under your row at y 260 (the hand is gone at showdown). Theirs at (456,74), beside the rival, under their plate | |
| Cheat ball | (486,338) on the rail, left of the column | |
| Pot | chips (346,193), number (374,184) | the only chip stack with a number; the plates carry bankrolls |
| Twist sign | drops to center (470,70) | Tournament rounds only |

The table is **long and rectangular**. We see only its far edge by the rival and its near edge by you, and the ends run off both sides of the screen. There's no visible table corner.

---

## 3. You (the player)

- **Head and shoulders from behind**, cut off by the bottom edge, left of center, so your floating hand sits to your right.
- **Formal wear:** a black tailcoat collar, a white shirt collar edge, and hair (short, dark, slicked; one style for now).
- **Your mask** shows only as its **back**: the ribbon or strap tied behind your head, plus the **edge of the mask poking past your cheek** (a few pixels of silhouette, so every mask has a recognisable edge).
- **Your hand floats** above your shoulders in a big Balatro-style fan. It's UI-scale, so it reads easily. Your body sits under it.

### Parts
| Key | Size | Notes |
|---|---|---|
| `you/shoulders` | 180×70 | Tailcoat shoulders and collar. Pivot bottom-center |
| `you/head` | 56×64 | Back of head, hair, ears. Pivot at the neck |
| `you/mask/<id>/back` | ~60×40 | Per mask: the strap or ribbon plus the edge peeking past the cheek. Drawn over the head |

### Motion (puppet)
- **Idle breathing:** shoulders scale y 1.00 → 1.012, 4 s cycle. The head follows with a 0.2 s lag.
- **Max bet:** shoulders square up (y −2, scale x 1.02), with a `juiceUp` on the head.
- **Loss:** shoulders slump (y +4, rotate −2°), head tilts down 4°.
- **Win:** a little bounce, and a head turn of 8° toward the camera (enough to show the mask edge).

---

## 4. The rival

### 4.1 The 10 masks (everyone has all of them from the start)
Each mask is a cosmetic **and** a possible rival face. All four families from ART.md are represented.

| # | id | Mask | Family | Rival? |
|---|---|---|---|---|
| 1 | `domino` | Black silk domino | Belle Époque | |
| 2 | `domino_red` | Crimson domino with a feather | Belle Époque | |
| 3 | `pierrot` | Pierrot: white, black tear | Commedia | |
| 4 | `arlequin` | Arlequin: diamond motley half-mask | Commedia | |
| 5 | `scaramouche` | Scaramouche: black, long nose, a rogue | Commedia | **Medium** |
| 6 | `hare` | Hare: papier-mâché, tall ears, nervous eyes | Animal | **Easy** |
| 7 | `fox` | Fox: gilt-edged, sly | Animal | |
| 8 | `owl` | Owl: round eyes, feathered brow | Animal | |
| 9 | `king_spades` | King of Spades: a Paris-pattern king's face as a mask, with a crown | Card-suit | **High Roller** |
| 10 | `queen_hearts` | Queen of Hearts: a heart-shaped face mask with a lace veil | Card-suit | |

Every mask needs **3 sprites**:
- `mask/<id>/front`: ~44×40, worn by a rival (and used in portraits). Eye holes are transparent (eyes are their own sprites).
- `mask/<id>/back`: the player view (§3).
- `mask/<id>/icon`: 16×16, for HUD plates and menus.

Masks with tall parts (the hare's ears, the king's crown) include them in the front sprite, extending above the head.

### 4.2 Framing
- **Seated, torso up**, centered behind the far edge of the table, which cuts them at the waist.
- Lit **from above** by the lamp: mask and shoulders bright, the face sides and the tailcoat falling into shadow (painted into the sprites, with lit tops and dark bottoms).
- **Holds their cards** in a fan at chest height, backs facing you. The fan's card count = their current hand size.

### 4.3 Parts (puppet + a few frames)
Pivots go at the joints, so code can rotate them.

| Key | Size | Notes |
|---|---|---|
| `rival/torso` | 140×80 | Tailcoat, shirt front, bow tie. Pivot bottom-center (on the table edge) |
| `rival/head` | 40×46 | Head under the mask: jaw, ears, hair, neck. Pivot at the neck |
| `rival/eyes/open` `/half` `/glint1` `/glint2` | 20×6 | Eyes behind the eye holes: dark with 1 px whites. The glint frames add a warm pixel catch-light |
| `rival/arm/upper/L` `R` | 22×40 | Pivot at the shoulder |
| `rival/arm/fore/L` `R` | 18×36 | Pivot at the elbow |
| `rival/hand/hold/L` `R` | 20×20 | White gloves holding the fan |
| `rival/hand/tap/1-3` | 20×16 | Right hand: fingers drumming on the felt (3 frames) |
| `rival/hand/push/1-3` | 26×18 | Right hand pushing chips forward (3 frames) |
| `rival/hand/smoke` | 20×20 | Right hand holding a long cigarette holder |
| `rival/holder` | 30×4 | The cigarette holder, a separate part with the ember at its tip |
| `rival/cards/back` | — | Uses `back/*` from the card atlas at rival scale |

Each **mask's front** sits on `rival/head`. The head is generic; the mask makes the character.

### 4.4 Animations
| Beat | How |
|---|---|
| **Idle breathing** | Torso scale y 1.00 → 1.01 over 4 s, head follows with lag, arms sway ±1° |
| **Smoke** | Every 6–10 s (random): the right forearm rotates the holder to the mask's mouth, there's a 0.6 s hold, then it lowers. Code emits smoke particles that drift up into the lamp light |
| **Eyes glint** | Random blink (`half`, 80 ms) every 3–6 s. A `glint1→glint2` catch-light when they bet Max or look at your hand |
| **Pushes chips** | On a bet: the right hand plays `push/1-3` while chip sprites slide from their stack to the pot |
| **Win gloat** | Leans back (torso rotates −3°), head tilts up, and a speech bubble |
| **Loss slump** | Torso drops 3 px, head down 6°, fan lowers |
| **Thinking** (while they decide) | `tap/1-3` loops on the felt and the head tilts 4° |

**Bust** isn't in the picked list, but ART.md has it as a big moment (the mask cracks and gets thrown). It's kept as a **stretch goal**: two crack overlays `mask/crack/1` `/2` (generic, masked to the mask's alpha), and the front mask sprite flies off.

### 4.5 Speech bubbles
- Paper bubbles (paper-ephemera style): cream with an ink outline and a tail pointing at the mask. Segmented as `bubble/9slice` (a 9-slice frame) + `bubble/tail`.
- Short French lines only, in the pixel sans. Examples: *"Tapis."* (Max), *"Je suis."* (match), *"Je me couche."* (fold), *"Flambons."* (Flamber), *"Bof."*, *"Merde."*, *"Bien joué."*, *"Encore ?"*
- **Order on their turn:** the bubble pops (`juiceUp`) → 0.6 s → their chips move → your slips slide in.

---

## 5. The table

### 5.1 Felt
- A **perspective plane** (the `floor` shader) from y 152 (far) to y 312 (near), running off both sides.
- Felt texture: a 32×32 **tileable** felt weave per color: `felt/green`, `felt/blue`, `felt/burgundy`, `felt/black` (Tables 1–4). It's lit by the lamp in the shader (a bright pool in the middle, darker toward the edges and the sides).
- **Printed on the felt** (separate sprites, drawn flat as decals and projected onto the plane by code), in a faded gold ink:
  - `felt/print/spot`: a card outline, 66×90 at flat scale. 5 per player.
  - `felt/print/pot`: the pot zone oval, 160×56.
  - `felt/print/crest`: the Flambeur crest (flame + F), 64×48, under the pot. Matches the logo.
  - `felt/print/pile` and `felt/print/discard`: small labeled outlines ("PIOCHE" and "DÉFAUSSE" in tiny caps).
- Table 4 (black) prints in brighter gold with an extra inlay border `felt/print/inlay` (a tileable 16×16 edge).

### 5.2 Rails
- **Near rail:** burgundy leather, padded (a highlight along the top curve), with **brass studs** every 12 px. Tileable segment `rail/near` 32×18 + `rail/stud` 3×3.
- **Far rail:** the same, thin and dark, `rail/far` 32×6.
- The rail edges overlap the felt's edges to hide the seam.

### 5.3 Piles and chips
- **Pile:** a squared stack of card backs. `pile/stack` is 70×12 (the stack's side, drawn at felt-plane scale). Height shows the count: code draws the side slice 1 px per 2 cards, plus a top card back.
- **Discard:** the same, but messy: `pile/messy` with a few cards rotated (code randomizes rotation from the card ids).
- **Chips** (from ART.md §10):
  - `chip/jeton/<1|5|25>/top` (16×10 on the plane) and `/edge` (16×3)
  - `chip/plaque/<100|500>/top` (28×12) and `/edge` (28×3)
  - Stacks are edge slices plus one top. Big amounts split into several stacks side by side.
  - The **number** floats above each stack: **blue** for you, **red** for the rival, **money green** for the pot.

### 5.4 The lamp
- A **green banker's shade**: a long brass rod from the ceiling (`lamp/rod`, 4×60, tileable vertically), a brass fitting, and a **green glass shade** (`lamp/shade`, 120×28) with a white-hot bulb line under it (`lamp/bulb`, 60×4).
- The light cone, the pool on the felt and the smoke in the beam are shaders (ART.md §5).
- **Idle:** the lamp sways ±0.6° on its rod, 8 s cycle, and the light pool shifts with it.
- **Tournament round:** the shade's light turns **red** (a shader tint, no new sprite).
- **Hot hands:** the bulb flares and the bloom grows (ART.md).

### 5.5 No croupier
Cards and chips **move by themselves**. Deals fly from the pile into your floating hand (and into the rival's fan) one by one with a flick sound. Chips slide and restack on their own. It's a slightly magical room, which sits well with the fée verte.

---

## 6. The room

- **Dark.** You can barely make out the room, so the marbled swirl can take over on big moments without fighting the art. (Evan: "can't really see anything, so the psychedelic can take effect.")
- **Back wall:** deep violet-burgundy velvet wallpaper (a tileable 32×32 damask, `room/wall`), almost black at the edges.
- **Velvet curtains** at the left and right edges: `room/curtain/L` and `R`, 120×180, with heavy folds and gold tassels. Idle: a very slow sway (1°, 10 s).
- **Wall sconces:** 2–4 brass sconces with small flames. `room/sconce` is 16×28, plus `room/sconce/flame/1-3` (3 frames, 6×8). Each casts a small warm glow (shader).
- **Chalkboard** on the left wall (`room/chalkboard`, 96×64, wood frame): it shows the Table and round in chalk, *"Table 2 · Manche 5"*, written by code with a chalk font (`font/chalk`, see §8). On a tournament round the twist name goes under it.
- **Silhouettes:** the patrons at other tables are **idle silhouettes**: near-black shapes with masks just catching light (a 1–2 px rim). Draw 6 poses: `crowd/1` … `crowd/6`, ~40×70. Idle = a slow sway and the occasional head turn (puppet).
  - **They get busier each Table:** 2, then 4, then 6, then 8 silhouettes, and smoke density rises.
  - **On a tournament round the crowd gathers:** silhouettes slide in closer (scale up 15%, move toward the table edges), 4 extra appear, and they lean in during the showdown.

### Per-Table changes
| Table | Felt | Lamp | Crowd | Smoke |
|---|---|---|---|---|
| 1 | green | warm white | 2 | light |
| 2 | blue | warmer | 4 | medium |
| 3 | burgundy | amber | 6 | heavy |
| 4 | black-gold | deep amber | 8 | heavy, low |

---

## 7. HUD

### 7.1 Plates
Two **name plates**, each a **wood-and-brass frame holding a paper card**:
- `hud/plate/frame` (9-slice): a dark-wood frame with brass corner caps and rivets.
- `hud/plate/paper` (9-slice): the cream paper card inside, with a slightly uneven edge.

**Your plate** (left side of the felt at (8,144), 150×58):
- Your mask icon (16×16) and your name, in the pixel sans
- **Bankroll**, big, in **blue**
- Hand size and mulligan count as small icons with numbers (`icon/hand` 9×9, `icon/mulligan` 9×9)

**Rival plate** (top-right, 150×58), with the same layout:
- Their mask icon and name, and the difficulty as a small stamp: *Facile / Moyen / Gros joueur*
- **Bankroll**, big, in **red**
- Hand size and mulligans. Never their locked count.

**Underdog perk:** when someone is 2× behind, a small 👁 icon (`icon/peek`, 9×9) and a flame icon (`icon/cheap_flamber`, 9×9) appear on their plate with a `juiceUp`, plus a one-line tooltip.

### 7.2 Betting tickets
- Color-coded **raffle tickets** slide in from the right into the action column when it's your turn: **Fold / Flamber / Min / Max**, each with its price chip. When you face a Max: **Match $X / Fold**. The look, colors and states are READABILITY.md §4–5.
- `hud/ticket/face` + `hud/ticket/plinth` (tint greyscale, multiplied by the action color in code) + `hud/ticket/chip` + `hud/stamp/<choice>` (the ink stamp that slams on at press). `hud/slip` is no longer used.
- Tickets you can't use go flat and dark with a strike line, not hidden, and say why where the price was (READABILITY.md §10).
- Every bet, yours and the rival's, also lands on the felt as a full-size ticket: yours left of the pot, theirs right. They stay through the tally.
- Keys: 1–4 press the tickets top to bottom, Space or Enter presses the primary (Lock in, Continue).

### 7.3 La Vitrine (collectibles)
- A wooden **pull tab** at the top-left reading **"Vitrine ▾"** (`hud/vitrine/tab`, 64×16).
- Click it and a **glass display case** drops down (spring overshoot): `hud/vitrine/case` (9-slice, dark wood with a glass front and a glint). Your collectibles stand inside on the velvet floor, bottom-aligned, each at its own size (CARDS.md §14).
- **Drag to rearrange.** Order matters for triggers, Balatro-style.
- Close by clicking the tab again or anywhere outside. It doesn't block the scene while closed.
- **The rival's collectibles are never shown.**

### 7.4 The cheat sheet
- A **crumpled ball of paper** on the near rail at (486,338), just left of the action column (`hud/cheat/ball`, 20×18). A gold glint flashes on it every ~8 s.
- Hover: it wobbles, gets a cream outline and a "Hands" tag. Click: it **unfolds** into a full-screen creased paper (`hud/cheat/sheet`, 9-slice with crease overlay lines) listing the poker hands from best to worst, each with a tiny card example and its base Value / Hype. It's written in pen, as if a regular scribbled it for you. Click to crumple it back.

### 7.5 Pocket watch (multiplayer only)
- A brass pocket watch lying open on the rail (`hud/watch/body` 24×28 + `hud/watch/hand` 1×9, rotated by code). The hand sweeps the timer. In the last 5 s it ticks louder and the watch shakes.

### 7.6 Twist sign (tournament rounds)
- A paper **placard on two strings** drops from the ceiling to the right of the lamp, swings, and settles (spring). `hud/twist/sign` (9-slice) + `hud/twist/string` (1×tileable). It carries the twist's name and its one-line rule.
- Together with it: the lamp turns red and the crowd gathers (§6).

### 7.7 Beats (built Nov 17)
The moments that say whose turn it is and what just happened. The full list and timings are READABILITY.md §10. Where they sit:
- **Round track:** paper pills across the top center: `Pick » Bets » Showdown » Tally`.
- **1er token:** a brass puck (drawn in code for now, `hud/token/premier` later) on the corner of the first bettor's plate, nearest the middle: yours at (156,148), theirs at (486,66). Its caption sits above your plate or under theirs until the first bet lands.
- **Locked cards:** face down on your card spots (`NEAR_ROW`). The rival gets a squared stack on theirs (`FAR_ROW`).
- **À vous** and the **ending callout:** centered over the felt at x 300. The callout is a plate frame with a dimmed band behind it.
- **"is deciding…":** in the action column while the rival is to act, in place of the hint.

---

## 8. Scoring on the table

- At showdown, **both** players' played cards land on their card spots. Scoring runs per player, yours then the rival's (or the order the rules say).
- **Floating numbers, Balatro-style.** Each scoring card `juiceUp`s and pops a number that floats up from it: Value in cream, Hype in flame orange, Grade as a gold "×2^n" stamp.
- A **running total** sits **next to each player's spots**: a paper tag (`hud/score/tag`, 9-slice). Yours sits under your row, theirs beside the rival (§2, Built layout), showing Value × Hype × 2^Grade as it fills, then the **Appraisal**, which rolls in slot-reel style and catches fire (ART.md §12.1).
- The bigger Appraisal wins. The loser's tag tears in half (`hud/score/tear`, 2 halves) and the pot slides to the winner.
- **Fonts needed:** the pixel Didone (titles, the Appraisal, the callouts), the pixel sans (body, numbers on plates), the small digits (CARDS.md), and a **chalk** font for the chalkboard. The font spec is its own doc; this one only lists where they're used.

---

## 9. Motion summary (what moves, always)

| Thing | Idle motion |
|---|---|
| Camera | drift ±2 px, ±0.3°, 6 s |
| Lamp | sway ±0.6°, 8 s, light pool follows |
| Rival | breathe, blink, smoke every 6–10 s |
| You | breathe |
| Your floating hand | each card sways and tilts toward the cursor (CARDS.md) |
| Curtains | 1°, 10 s |
| Sconce flames | 3-frame flicker |
| Crowd | slow sway, occasional head turn |
| Smoke | shader drift, denser each Table |
| Everything else | still until something happens |

---

## 10. Sprite list (for the art agent)

| Group | Sprites | Count |
|---|---|---|
| You | shoulders, head | 2 |
| Masks | 10 × (front, back, icon) | 30 |
| Mask cracks (stretch) | crack 1, 2 | 2 |
| Rival body | torso, head, 4 eye frames, 4 arm parts, 2 hold hands, 3 tap, 3 push, smoke hand, holder | 20 |
| Speech bubble | 9-slice, tail | 2 |
| Felt | 4 weave tiles, spot, pot, crest, pile, discard, inlay | 10 |
| Rails | near, far, stud | 3 |
| Piles | stack, messy | 2 |
| Chips | 3 jetons + 2 plaques × (top, edge) | 10 |
| Lamp | rod, shade, bulb | 3 |
| Room | wall tile, 2 curtains, sconce, 3 flame frames, chalkboard, 6 crowd | 14 |
| HUD | plate frame, plate paper, 4 icons, slip, 5 stamps, vitrine tab, vitrine case, cheat ball, cheat sheet, watch body, watch hand, twist sign, twist string, score tag, score tear | 22 |
| **Total** | | **~120 sprites** |

**Files:** `art/duel/` with one `.aseprite` per group (`you`, `masks`, `rival`, `table`, `chips`, `lamp`, `room`, `hud`), exported to `art/duel/duel.png` + `duel.json` with slices and pivots, by the same kind of build script as `art/cards/build.py`.

**Review sheet:** `art/duel/review.png` is the full scene composed at 640×360 (and at 2×), with Table 1, easy rival (Hare), mid-round, your hand of 8 floating, plus three variants: Table 4 with a tournament sign, red lamp and gathered crowd; the vitrine open; and the cheat sheet unfolded.

---

## 11. Still open

- **Rival names** per mask (they show on the rival plate).
- **The bust animation** is a stretch goal, but ART.md calls it a big moment. Decide whether it makes Friday.
- **Multiplayer:** this is a 1v1 layout. The 10-player table needs its own spec.
- **The font spec** (Didone, sans, chalk) is the next doc.
