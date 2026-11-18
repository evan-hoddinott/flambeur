# Flambeur: shop scene spec

The tabac between rounds: you stand at the counter, the buraliste stands behind it, and everything for sale sits on a shelf in front of him. This doc is for the art agent and whoever builds the renderer. Style, palette and motion come from `docs/ART.md`, cards from `docs/CARDS.md`, buttons and hover cues from `docs/READABILITY.md`. The shop's rules and prices are in `DESIGN.md` and are already built (`src/engine/shop.ts`, `match.ts`). This doc only says how they look.

**Built Nov 17 (first pass):** the counter view is in the game (`src/ui/shop.ts`, art from `art/shop/buraliste.py` and `art/shop/counter.py`, which export `art/shop/shop.png` + `shop.json`). Working: the buraliste's idle (reading, glances, sighs and "Alors ?" after 20s), bubbles (Bonjour, Bon, Pfff, Mouais), the offer shelf with hover tags and VENDU, the deal-in on restock, the bell (click it or the Restock ticket), the sign with a hover tag, the STONKS board with Chatty's tip, the round and next-twist note, the wall clock online, and the bottom bar. Still the DOM harness: pack ripping, the binder (tap to pick, sell all), the Vitrine, the grading desk and the scratcher pick. Not built yet: the whip-pan, the side pan to the guichet, the salty note (needs `rolledOver` in the view), the god-pull stare. Evan wants a polish pass on all the art.

Nov 17 2026, from Evan's shop ideation answers. The scope is **full**: everything here ships Friday. Where this doc and ART.md disagree about the shop, this doc wins.

---

## 0. Rules carried over

- Same as DUEL.md §0: everything is segmented with slices and pivots, a **640×360 stage**, crisp nearest-neighbor sprites, master palette, light and smoke are shaders.
- **Offers must be big enough to recognize at a glance.** Every pack, collectible, scratcher and sleeve on the shelf is drawn at least at card size (64×88), never as icons.
- **Every offer explains itself in one line** where you see it: hover (or tap on a phone) shows its name, price and one-line rule on a paper tag.

---

## 1. Evan's picks

| Question | Answer |
|---|---|
| Layout | **The counter, plus one side pan.** The counter is home. One whip-pan to the side wall for the grading window. No other stations. |
| Camera | **First person, facing the buraliste across the counter.** You never see your own character in the shop. |
| Offers | **A Balatro-style row**, on a **shelf under the shopkeeper** so it gets the most room. |
| Ripping packs | **Its own full-screen moment**, away from the counter. |
| Binder | **A leather binder that opens over the counter.** Tap cards to select, then sell them all at once, or slide one card out to sell it alone. |
| Table → shop | **Whip-pan**, as in ART.md. |
| Rival in the shop | **Not shown.** It shops off-screen. |
| Buraliste | **Short French bubbles on beats**, same system as the rival. Rules text never goes in a bubble. |
| Restock and Bin a Bulk | **Ticket buttons** by the counter. Pressing Restock also **rings the bell** on the counter. |
| Friday scope | **Everything** in ART.md §7.4–7.7, trimmed to the layout above. |
| Stock size | **Unchanged** (up to 7 offers). |
| Salty rollover | **A grumpy handwritten note** goes up beside the sign, prices +10%. |

### Decided by Claude so the doc could close

Change these here if they're wrong.

| Question | Decision |
|---|---|
| What's in the side pan? | The **postal window** (grading desk) only. The binder opens over the counter, so it doesn't need a table. |
| Where does the binder live? | A leather binder lying on the counter, bottom-right. Click it to open it over the scene. |
| How do scratchers resolve? | The ticket lifts off the shelf and grows to fill the center. You **rub it** (drag) to scratch; a click scratches it all at once. Checklist and Wishlist then open the deck or binder picker. |
| How do collectibles look on the shelf? | A collectible stands on a little **card-sized easel** with its icon, the same art as in the Vitrine, so they're as big as the packs. |
| The sleeve offer | Last in the row, on a **velvet card stand** with a "Spécial Table" tag, only in the shop before the tournament round. |
| How do you leave? | A brass **Sortir** ticket, bottom-right, the only thing that pulses (READABILITY.md §2). |
| Multiplayer timer | A **wall clock** behind the buraliste, with a red hand sweeping the 30s (45s before a boss). Solo has no clock. |
| Chatty's STONKS tip | Chalked small under the STONKS board: "Demain : ♥". |
| God pull, given ripping is full-screen | When you come back from the rip, his cigarette is lying on the counter and he's staring at you. |

---

## 2. The counter view

```
 0                                                                         640
 ┌──────────────────────────────────────────────────────────────────────────┐ 0
 │[VITRINE▼]  ◆TABAC (window)   ┌────────┐  wall clock    ┌COTE DU JOUR───┐  │
 │  back wall: shelves of        │BURALIST│               │ 9   ♥   foil   │  │
 │  cartons and pack boxes       │ head + │  lottery      │ demain : ♠     │  │
 │                               │ L'Équipe│  machine      └────────────────┘  │
 │                          ┌────┴────────┴────┐      register ▣ [sign]      │
 │  🔔 bell                 │  torso, arms     │        [salty note]         │ 150
 │════════════ zinc counter edge ════════════════════════════════════════════│ 165
 │  ┌─────┐┌─────┐┌─────┐  ┌─────┐┌─────┐  ┌─────┐┌─────┐  ┌─────┐            │ 180
 │  │FREE ││PACK ││PACK │  │COLL.││COLL.│  │SCRAT││SCRAT│  │SLEEV│            │
 │  │pack ││     ││     │  │ ease││ ease│  │ cher││ cher│  │stand│            │
 │  │     ││     ││     │  │  l  ││  l  │  │     ││     │  │     │            │
 │  └─────┘└─────┘└─────┘  └─────┘└─────┘  └─────┘└─────┘  └─────┘            │ 290
 │   $0     $3     $6       $6     $9       $3     $3       $10   (paper tags) │ 304
 │═════════ shelf lip ════════════════════════════════════════════════════════│ 312
 │ ┌YOU $ 62┐ [deck ▯]   [Restock $1] [Bin a Bulk $2] [Grading →]  📕 [SORTIR]│
 └──────────────────────────────────────────────────────────────────────────┘ 360
```

| Element | Position (pivot) | Notes |
|---|---|---|
| Back wall | fills 0,0 → 640,165 | Warm, smoky, lit from the window. Shelves of parody cartons and pack boxes |
| TABAC diamond | in the window, top-left (150,30) | Red, glows (shader), seen through glass |
| Buraliste | head center (320,70), torso pivot at (320,165) | The counter edge cuts him at the waist |
| STONKS board | top-right (520,20) → (630,95) | Chalkboard "Cote du jour", chalk font |
| Wall clock | (420,40) | Multiplayer only |
| Lottery machine | (420,120) | Back-wall prop |
| Register + sign | register (540,140), sign taped to its front | The sign is hand-lettered, 3 trait lines |
| Salty note | beside the sign (590,150) | Only after the collectible pool rolls over |
| Bell | (90,158) on the counter | A brass desk bell |
| Zinc counter edge | y 158–170, full width | Worn zinc, a highlight line |
| Offer shelf | y 172 → 312, full width | Glass-fronted case under the counter, dark wood inside. The row sits on it |
| Offers | row centered at x 320, tops at y 184, each 72×104 | Grouped with gaps: packs · collectibles · scratchers · sleeve. Up to 8 slots fit (8×72 + gaps ≈ 620) |
| Price tags | under each offer, y 296–308 | Money-green ink on paper (READABILITY money color) |
| Shelf lip | y 312–318 | Brass strip |
| Your plate | bottom-left (8,322) | Your bankroll in blue, same plate as the duel |
| Deck pile | (110,340) | Click for the deck viewer |
| Ticket buttons | y 322–352, centered | Restock (brass ink on cream), Bin a Bulk, Grading → |
| Binder | (560,340) | Leather, gold tooling. Opens the binder overlay |
| Sortir | bottom-right (600,337) | Brass, pulses |
| Vitrine tab | top-left (8,0) | Same pull-down as the duel; sell collectibles from it here |

A bought offer leaves an empty dark gap on the shelf with a "VENDU" slip in it. Unaffordable offers stay full color, but their price tag goes grey (never hide them).

---

## 3. Motion and beats

- **Arriving:** whip-pan from the table (smear frames, swoosh), the shop bell on the door rings, the buraliste lowers L'Équipe: "Bonjour."
- **Idle:** he reads, turns a page, takes a drag, side-eyes you. After ~20s of nothing: a sigh and "Alors ?"
- **Hover an offer:** it lifts 4 px and tilts toward the cursor (the duel's card hover), its paper tag unfolds with the one-line rule.
- **Buy:** the offer hops off the shelf toward the camera and away, coins slide from your plate. He grunts: "Bon."
- **Restock:** press the ticket, the **bell dings**, he slams a fresh box on the counter, the old row slides off, the new one deals in left to right. "Pfff."
- **Bin a Bulk:** the Bulk card drops into a bin under the counter with a stone thunk.
- **Sell:** cards slide out of the binder onto the counter and turn into coins that jump to your plate. "Mouais."
- **Salty rollover:** he slaps the handwritten note up next to the sign. "Ma marchandise vous plaît pas ?"
- **Leave:** "Au revoir." Whip-pan back to the table.

Bubble lines are short, flavor only, and never repeat back to back.

---

## 4. The binder overlay

- The binder slides up from the bottom-right and opens flat over the counter, dimming the scene behind it.
- **Pages are 3×3 sleeve grids**, cards at 1× (64×88). Page-turn animation, arrows on the page corners.
- **STONKS-hot cards** have a chalk star on their sleeve, and their sell price shows the multiplier ("$3 ×3").
- **Tap to select** any number of cards (they lift and get a brass outline). A **Vendre $X** ticket shows the total. Press it to sell them all.
- **Slide to sell:** drag one card out of its sleeve and drop it on the counter to sell just that one.
- Superstitious refuses ♠: those sleeves have a little "non" chalk mark and can't be selected.
- Close by tapping outside or the binder's ribbon.

---

## 5. The grading window (side pan)

- **Grading →** whip-pans right to the side wall: a postal **guichet** with a brass grille, stamps, a scale and a parcel.
- First you pick the card: the deck and binder open as one picker (deck cards left, binder right). Bulk and graded cards are greyed out.
- Then the three **parcels** sit on the sill, each with its odds on its tag:
  - **La Poste** $2: plain brown paper and twine.
  - **Chronopost** $4: a crisp padded envelope.
  - **Fourgon blindé** $7: a tiny armored-van tin.
- Shipping: the card goes into the parcel, a postmark stamps it, it slides through the grille.
- **Coming back** (next shop): on arrival a parcel is waiting on the counter. Opening it shows the card in its **slab**, the grade counts up on the gold label and stamps down.
- **← Comptoir** pans back.

---

## 6. Pack opening (full screen)

- Click a pack: it lifts off the shelf and flies at the camera, the shop fades to black behind it.
- From there it's ART.md §7.5: shake and burst, cards fan face down, flip left to right, last card held, god-pull rays and fée verte flash.
- **Sorting:** a **Deck** pile bottom-left and the **Binder** bottom-right. Each card shows its default (specials above the deck, plain above the binder). Tap to flip it, **Done** (brass) sends them flying.
- Then the black opens back onto the counter.

---

## 7. Scratchers

- Click a scratcher: it lifts off the shelf and grows to the middle of the screen.
- **Rub to scratch:** dragging scrapes off the silver foil (a mask texture), with a scratchy sound. A click scratches it all.
- Under the foil: the insert's name and one line (Code, Checklist, Wishlist, Grail). Grail gets the god-pull flash.
- Checklist and Wishlist then open the deck or binder picker, as the rules say. Code shows the hand leveling up on a little paper chart.

---

## 8. Sprite list

| Sprite | Size (at depth) | Notes |
|---|---|---|
| Back wall + shelves | 640×165 | Layered: wall, shelves, cartons, so parallax is possible |
| Window + TABAC diamond | ~90×60 | Diamond separate for the glow |
| Buraliste | ~180×200 | Segmented: head, mustache, cigarette, arms, newspaper, torso. Frames: idle read, page turn, drag, side-eye, grunt, slam, slap note, stare (no cigarette) |
| Cigarette on counter | ~12×4 | For the god-pull return |
| STONKS chalkboard | 110×75 | Chalk text drawn by code with the chalk font |
| Wall clock | 32×32 | Hand separate |
| Lottery machine | ~50×60 | |
| Register | ~70×50 | |
| Posted sign | ~60×40 | Text by code |
| Salty note | ~40×30 | Text by code |
| Desk bell | 20×14 | Plunger separate, for the ding |
| Counter edge (zinc) | 640×12 | Tiles |
| Shelf case | 640×146 | Glass front as an overlay layer |
| Pack art, 3 paid + free | 72×104 each | Parody Belle Époque brands, one per lane (ART.md §7.5) |
| Collectible easel | 72×104 | Icon from the Vitrine art on top |
| Scratcher ticket | 72×104, and ~200×280 up close | Foil layer separate |
| Sleeve stand | 72×104 | Velvet stand, "Spécial Table" tag |
| Price tag | 40×12 | Text by code |
| VENDU slip | 48×16 | |
| Fresh box | ~120×60 | For the restock slam |
| Leather binder | closed ~60×44, open ~480×300 | Page-turn frames, sleeves, chalk star |
| Guichet wall | 640×360 | Grille, stamps, scale as separate props |
| Parcels × 3 | ~64×48 each | Brown paper, padded envelope, armored-van tin |
| Postmark stamp | ~32×32 | |
| Grading slab | 72×100 | Card goes inside, label separate |
| Bulk bin | ~50×40 | Under the counter edge |
| Ticket buttons | from READABILITY.md | Restock, Bin a Bulk, Grading →, ← Comptoir, Vendre $X, Sortir |

---

## 9. Still open

- ~~The four pack brands~~: done in `art/packaging/boosters/build.py`. Free = Le Perchoir chocolate, Off-Brand = Faux Frère, Repack = Le Roussi biscuits, Collector = Sélène parfums.
- **Collectible icons:** do all 29 have Vitrine art yet? The easel needs it.
- **Phone layout:** the row of 8 at 72 px fits 640 wide, but check it's readable at phone size, or wrap to two rows of 4.
