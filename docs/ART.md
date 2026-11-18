# Flambeur: art style

The source of truth for how Flambeur looks, moves and feels, written so anyone (person or agent) can make an asset or a scene without asking. Rules and numbers live in `DESIGN.md`. This file only covers what you see and hear.

Made Nov 17 2026 from two ideation rounds with Evan, plus the research in `docs/balatro-visual-research.md`. Hex values and timings are **starting values**: tune them on screen, then update this file.

---

## 1. The one-liner

**A masked ball in the basement of a Belle Époque casino, where every big hand goes up in flames and the room starts to hallucinate.**

Three pillars. Check every asset against them:

1. **Opulent.** Brass, velvet, gilt, green felt, lamplight. Things look expensive and old.
2. **Psychedelic.** When the stakes rise, the room "goes absinthe": marbled swirls, green-violet shifts, Art Nouveau curls that come alive. It's always earned by the play and never there at rest.
3. **French, all the way down.** Paris-pattern court cards, a tabac, jetons and plaques, the croupier's calls, silent-film grain. French is the **flavor**, and the rules text stays English.

Tone is **wry**: classy on the surface, with small jokes hidden in the art and the flavor text, the way Balatro hides "Joker" in every joker.

---

## 2. World and setting

- **Where:** a grand Belle Époque casino (Monte Carlo spirit, around 1900). We never play in the grand salon. We play **downstairs**, in the private back room: low ceiling, one hanging lamp over the table, smoke hanging in the light, and rich furniture going shabby at the edges.
- **Who:** the players are **masked**, as at a bal masqué. Nobody shows their face at this table.
- **The shop** is a **tabac** across the street (or at the top of the stairs): a real French bureau de tabac with its red diamond sign, scratch tickets, packs behind the counter, and a buraliste who doesn't wear a mask and thinks the people who do are weird.
- **The trip:** La Fée Verte, the absinthe green fairy, is the in-world reason the room bends. Hot hands bring her out. She's never a character with dialogue. She's a flash of green light, a curl of smoke shaped like wings, a swirl.

---

## 3. Rendering rules (the pipeline)

This is how we get pixel art that can still wobble, tilt and burn.

### The Balatro rule
- **Every sprite is crisp pixel art**, sampled with **nearest-neighbor**. There's no smoothing, no bilinear filtering, and no second hi-res texture set.
- **Transforms are free.** Each sprite is its own quad that moves, rotates and scales at **screen resolution** with sub-pixel positions. There's no global low-res framebuffer that everything snaps to, so a card can rotate 2° and still look clean.
- **Everything is segmented.** Every visual element is its own sprite: card parts, characters' masks and bodies, props, UI pieces. Scenes and cards are assembled at runtime, so parts can be positioned, reused, tinted and animated on their own. Never bake a finished composite, a shadow, a glow or a mirrored copy into a sprite. The card version of this rule, with every part listed, is `docs/CARDS.md`.
- **Mixed pixel sizes are allowed** when depth or a zoom makes them. A rival far across the table has smaller pixels than your hand, and that's fine. **Within one plane, use one scale**: everything on the felt at the same depth uses the same art-pixel size.

### Stage
- A fixed **16:9 stage of 640×360 art units**, letterboxed to fit the window. At 1080p one unit is 3 screen pixels.
- Bars outside the stage are near-black ink (`ink-0`), never browser white.
- Phone portrait is a **stretch goal**. Don't design anything that blocks it (keep the HUD in panels that could be moved), but don't build it now.

### Sizes
| Thing | Native size (art px) | Notes |
|---|---|---|
| Card | **64×88** | Rounded corners with a 3 px radius, a 1 px ink outline drawn into the sprite |
| Card back | 64×88 | One per starter box |
| Collectible (display case) | 64×88 | Same frame as cards, so one shader set works on both |
| Jeton (round chip) | 16×16, plus 16×4 for the edge | Stacks are drawn from edge slices |
| Plaque (big chip) | 28×16 | |
| Booster pack | 72×104 | A bit bigger than a card, so it reads as "contains cards" |
| Rival torso + mask | ~160×160 | Billboard across the table |
| Player from behind | ~200×180 | Shoulders, head and mask ties, cropped at the bottom of the stage |
| Shopkeeper | ~180×200 | |
| UI font cap height | titles 14 px, body 7 px | See Typography |

### Renderer
- **Hand-rolled WebGL2**: one sprite batcher plus our own shaders, with no runtime dependencies. This matches the rest of the project.
- Draw order is by **depth**: background room, then floor/felt, rival, table props, cards on the felt, your hand, the HUD, then post.
- Every sprite carries: position, rotation, scale, a depth, a tint, and per-shader uniforms (finish, heat, dissolve, tilt).
- **Shaders we need** (one file each, kept small):
  1. `sprite`: the base. Nearest sampling, tint, and the fake-3D **tilt** (perspective divide on the quad, from the Godot port in the research notes).
  2. `foil`: the gold foil sheen.
  3. `holo`: the holographic finish.
  4. `embers`: the ember finish (glowing edges plus sparks; sparks can be particles).
  5. `heat`: forged ★ tiers (smoulder → glow → white-hot).
  6. `burn`: dissolve with a glowing edge (fold, muck, a card consumed by Flamber).
  7. `floor`: the perspective felt and floor plane.
  8. `swirl`: the marbled-endpaper paint swirl.
  9. `post`: lamp glow and bloom, smoke, film grain, vignette, light leaks.
- **Art is made in Aseprite** and exported as atlases with JSON, like the logo (`art/logo/claude/build.lua` is the reference for scripted builds).

---

## 4. Color

### Palette discipline
One **master palette** of about 40 colors, used by every sprite. **Shaders are free** to go outside it (fire, holo, the swirl, glow), which is how the "psychedelic" escapes the "opulent". Ramps are **hue-shifted**: highlights go warmer and yellower, shadows go cooler and toward violet or red, never toward grey.

### Master palette (starting values)
| Ramp | Colors (dark → light) | Used for |
|---|---|---|
| Ink | `#0e0b0a` `#1c1513` `#2e2320` `#43342e` | Outlines, shadows, letterbox, the room in darkness |
| Felt green | `#0f2a20` `#174034` `#1f5a46` `#2d7a5c` `#4a9a74` | Table 1 felt, classic casino |
| Felt blue | `#0f1d33` `#1a3256` `#28497a` `#3e66a0` | Table 2 felt |
| Burgundy | `#2a0910` `#4e1020` `#7a1a2c` `#a82a38` `#d04a4e` | Table 3 felt, velvet, hearts and diamonds, the logo outline |
| Black-gold | `#120e08` `#2a2010` + brass ramp | Table 4 felt: black baize with gold inlay |
| Brass / gold | `#3d2a10` `#6b4a1a` `#9c7028` `#c99a3a` `#e8c260` `#fff0b0` | Frames, lamp, chip inlays, Grade |
| Paper / cream | `#5c4a36` `#8c7656` `#bfa77e` `#e3d2a8` `#f6ecd2` | Card faces, UI ephemera, Value |
| Flame | `#5a1206` `#a8260a` `#e8501a` `#ff7a24` `#ffb03a` `#ffe08a` `#fffbe8` | Fire, Hype, heat tiers |
| Money green | `#1e4a24` `#3a8040` `#6fcf6f` `#b8f0a0` | Money, bankroll, price tags |
| Absinthe | `#2a4a14` `#5c8f2a` `#8fd14f` `#c8f27a` | La Fée Verte, the psychedelic moments |
| Violet | `#2a1440` `#4e2a78` `#7a4ab0` `#b088e0` | Absinthe's partner, deep shadows, Holo base |

### Color language (locked)
The score has its own colors, used everywhere: counters, floating numbers, particles, tooltip keywords and HUD plates. Learn it once and it reads everywhere.

| Meaning | Color | Why |
|---|---|---|
| **Value** | cream `#f6ecd2` | The card's printed worth, paper and ink |
| **Hype** | flame orange `#ff7a24` | Hype is heat |
| **Grade** | gold `#e8c260` | Grading slabs, gold standard |
| **Money** ($, bankroll, pot) | green `#6fcf6f` | Banknotes |
| Danger / losing / bust | burgundy `#d04a4e` | |
| Psychedelic / rare | absinthe `#8fd14f` + violet | Only on rare and high moments |

The **Appraisal** total uses the **flame ramp**: it starts cream and heats toward white-hot as it climbs (see Big moments).

### Felt per Table
Felt tells you where you are in the run, getting richer and darker as stakes rise:
1. **Table 1 (rounds 1–3):** green
2. **Table 2 (4–6):** blue
3. **Table 3 (7–9):** burgundy
4. **Table 4 (10–12):** black with gold inlay lines

The swirl on big moments uses that Table's felt colors (see Atmosphere).

### Suits
- **Default two-color:** ♥ ♦ in burgundy `#a82a38`, ♠ ♣ in ink `#1c1513`.
- **Four-color option** (accessibility): ♥ burgundy, ♦ brass `#c99a3a`, ♣ felt green `#2d7a5c`, ♠ ink.

---

## 5. Light, atmosphere and post

### Lighting
- **One warm lamp** hangs over the table. It's the key light for the whole duel scene. Felt is brightest under it and falls off to the edges. The rival's mask catches the light from above.
- Everything outside the lamp's pool sinks into ink and violet shadow. The room behind is visible but dim.
- **Hot hands brighten the lamp.** As Appraisal climbs, the lamp flares warmer and the bloom grows.

### Post pass (one full-screen shader)
In order:
1. **Lamp glow / bloom.** Bright pixels are pulled out, blurred and added back, warm-tinted.
2. **Smoke.** Two layers of slow-drifting noise haze, densest in the lamp's light cone. It thickens a little each Table.
3. **Vignette.** Warm-dark, oval.
4. **Film grain.** **Visible** by default, around Balatro's CRT level: animated monochrome grain at 24 fps (it updates every other frame, so it reads as film rather than TV static).
5. **Light leaks**, on big moments only: an orange-amber flare that bleeds in from a frame edge for about 0.6 s.

There are no scanlines and no screen curvature. We're **film, not CRT**. The **post strength** slider scales grain, smoke and vignette from 0 to 100%.

### The room behind the table
- An **illustrated pixel room**: brass sconces, a dim velvet wall, a mirror, other masked figures in shadow at other tables (billboards, barely moving), and smoke.
- **On big moments it melts into the swirl.** The swirl is **marbled endpapers + paint swirl**: the pattern of old French marbled paper (papier marbré), moving like Balatro's paint swirl. It fades in over the room from the edges inward. It uses the current Table's felt colors plus **absinthe green and violet streaks** when La Fée Verte is out. Calm room = no swirl. A hot hand = the swirl starts at the edges. A record hand = the whole room is marbling.
- **Reduce motion** stops the swirl from moving and kills camera shake. Everything stays readable.

---

## 6. Camera and space

### How we fake 3D
- **Perspective floor + billboards.** The felt (and the shop floor) is a textured plane drawn in perspective (the Mode 7 idea, done in the `floor` shader). People, props and cards standing up are flat **billboard sprites** that scale with depth.
- Cards **lying on the felt** are drawn on the plane, so they foreshorten. Cards **in your hand** are upright billboards facing the camera.

### The duel camera
- **Low, over your shoulder.** Like a Pokémon battle seen from behind the player, but lower and more cinematic.
- From bottom to top, on screen: **your back and shoulders** (cut off at the bottom edge) → **your hand of cards**, fanned in an arc just above your shoulders → **the felt**, with the pot and both chip stacks → **the rival's face-down cards** → **the rival**, masked and lit from above → **the room**.
- Left to right: **your HUD plate bottom-left**, the **rival's HUD plate top-right**, the pot in the middle of the felt.
- **Idle drift:** the camera always floats a little, like slow breathing (±2 art px, ±0.3°, about a 6 s cycle).
- **Zoom with the score:** during the Appraisal count-up the camera pushes in toward the played cards, **the higher the score, the closer**. It eases back after the result.

### The shop camera
**Full spec: `docs/SHOP.md`.** It wins over this section: first person at the counter, one side pan to the grading window, no other stations.

- **Whip-pan** from the table to the tabac: a fast pan with motion blur (smear frames) and a short swoosh. There's no screen cut.
- The shop is one space with **stations**: the counter (packs and collectibles), the **scratcher** rack, the **sleeve** display, the **grading desk** (a little postal window), and your **binder** on a side table. Moving between stations is another short whip-pan.
- **Parallax look-around:** moving the cursor toward the edges turns your head a little. Near layers move more than far ones.

---

## 7. Scenes

### 7.1 Title
The title is **one tall world you pan down through**, a cross-section like the side of an ant farm: the street on top, then the dirt, a cellar, stone, and the sewers at the bottom. It's 640 wide like the duel stage and 1180 tall. Code: `src/ui/title.ts`. Art: `art/title/` (`draw.py` makes `title.aseprite`, `build.py` exports `title.png/json` with a palette check).

| Layer | World y | Holds |
|---|---|---|
| **Street** | 0–348 | The logo (`art/logo/fable`) burning like a rooftop sign over the casino's ground floor at night: rain, wet cobbles with light streaks, a lamp, the tabac's red carotte and lit shopfront across the way. A drain grate with "JOUER" and chalk arrows on the cobbles is the cue to go down, and it drips into the dirt below |
| Dirt | 348–410 | Asphalt, dirt, rocks, a pipe. Shows at the bottom of the street view so you can tell there's more below |
| **Cellar** | 410–748 | Solo play: a chalkboard heading, the difficulty tickets, Daily run (the one pulsing progress ticket), Random seed, the seed box and Play seed, and this browser's leaderboard on paper. Two bare bulbs. Chalk "EN LIGNE" over a floor hatch leads down |
| Stone | 748–812 | Rock, with the hatch's ladder running through it |
| **Sewers** | 812–1180 | Online: sign-in (name, password, guest / log in / sign up) or, once signed in, Play a friend, Quick match, Online daily, the room-code box and Join, the room link while you wait, and the two server boards. An arched tunnel, a walkway, the water channel, an outlet pipe. Chalk "LA RUE" by the ladder goes back up |

- **Camera:** the mouse wheel, a touch or mouse drag, the arrow keys, Page Up/Down and Home/End pan it on a spring, and it snaps to a layer (world y 0, 404, 820). The chalk cues jump straight to their layer.
- **Everything is on the canvas**, built like the duel: the tickets (READABILITY.md §4–5), text boxes that are paper plus the bitmap font with a caret (a hidden `<input>` underneath does the typing, phone keyboards and password stars), and leaderboards on the duel's plates. Text over the world has the 1px ink outline.
- **Code effects, not art:** the rain and splashes, light streaks on the road, the lamp, carotte, door and bulb glows, the marquee's bulb chase, the logo's firelight, the drips, the outlet's stream, the water shimmer and the steam.
- The logo plays its intro once per page load (any click or key skips it), then idles.

### 7.2 Starter box draft
- Starter boxes are **vintage card boxes**, each with its own card back and a tuck flap. They sit in a velvet-lined tray.
- The row draft is laid out on the felt: 4 rows of 8 cards. Picked cards slide into your deck pile.

### 7.3 The duel (main scene)
**Full spec: `docs/DUEL.md`.** It wins over this file where they differ: long rectangular table, floating hand, no croupier, a dark room, blue/red bankroll numbers instead of a tug bar, the round on a chalkboard, and collectibles in a pull-down Vitrine.

Covered in Camera. A few more details:
- **Locking cards:** a locked card lifts out of the arc and slides forward onto the felt, still face down to the rival.
- **The four betting buttons** (Fold / Flamber / Min / Max) are **paper betting slips** at the bottom-right, by your hand. Pressing one stamps it (see UI).
- **Chips move physically:** bets slide from your stack to the pot. The pot pays out by sliding to the winner, stacks restack with a little clatter, and the big number above each stack counts.
- **Showdown:** the rival's cards flip over on the felt, then both hands appraise (Big moments).
- **Fold:** your hand burns (`burn` shader, quick and small), apart from the card that gets ground +1 Value, which flashes cream and slides back.
- **Bust:** see Big moments.

### 7.4 The tabac (shop)
**Full spec: `docs/SHOP.md`.**

- **The counter:** worn wood and zinc. The buraliste stands behind it, and behind him is a wall of packs, cigarette cartons and the lottery machine.
- The red **TABAC** diamond glows outside the window.
- **The posted sign** with the shopkeeper's 3 traits is an actual hand-lettered card taped to the register.
- **Prices** are little paper tags in money green ink.
- **STONKS** is a chalkboard behind the counter: "Cote du jour" with the hot rank, suit and finish chalked up.
- **Restock:** he slams a fresh box on the counter.
- When the collectible pool runs out and he gets salty, a new handwritten note goes up and he looks even grumpier.

### 7.5 Pack opening
- Packs are **vintage French product packaging**. Each pack lane is a fake Belle Époque brand: a chocolate tin, a cigarette carton, a perfume box, a biscuit tin. A lane's brand tells you its lean at a glance. (Name and draw them as **original parody brands**, never real ones.)
- Opening is **shake and burst**, like Balatro: the pack shakes, the wrapper bursts with paper scraps, and the cards fan out face down.
- The cards flip one at a time, left to right. The **last card stays face down** a beat longer, then flips. That's the god-pull slot.
- On a **top-rarity pull**: light rays behind the card plus a **fée verte flash** (absinthe green bloom, the swirl blooming briefly at the edges), a light leak, and the callout.
- Then each pull is sorted to Deck or Binder: the card flies to the deck pile (bottom-left) or into the binder (side table).

### 7.6 The binder
- A **real leather binder** with gold-tooled edges. Pages are 3×3 sleeve grids, and you flip pages with a page-turn animation.
- STONKS-hot cards in the binder have a little chalk star on their sleeve.
- **Selling** = slide a card out of the sleeve onto the counter. It turns into money that jumps into your stack.

### 7.7 The grading desk
- A **postal window** (guichet) at the side of the tabac: a brass grille, stamps, a scale and a parcel.
- The three shippers are three **parcel options** on the counter:
  - **La Poste**, $2: a plain brown-paper parcel with twine, which can come back dented.
  - **Chronopost**, $4: a crisp padded envelope.
  - **Fourgon blindé**, $7: a tiny armored-van tin box.
- A card **comes back** in a **grading slab** (a clear case with a gold Grade label). The Grade number counts up on the label with a stamp.

### 7.8 Flamber (formerly "Forge")
- The screen is about **fire**, because the merge is a flambé. The chosen cards lift and overlap, then **a flame runs across them** (`burn` shader, but the fire stays). They melt into one card that rises out of the flame, glowing with its ★ heat.
- Leftover **Bulk** cards drop to the felt as stone-grey slabs with a dull thunk. They have no flame and no finish, and they look heavy.
- A new trait slot lights up on the card with a small spark and the trait name in a tooltip.

### 7.9 Run end
- **Win:** the rival takes off their mask and throws it on the table, a light leak, and the camera holds on the mask. The score slip prints out like a receipt.
- **Loss:** your stack slides away, the lamp dims, iris-out.
- The **tally** (Pot, House, Interest) prints line by line on a paper receipt with a ka-chunk for each line.

---

## 8. Characters

### Masks are the identity, and the cosmetics
Four mask families, all **unlockable through play, never bought**:
1. **Commedia dell'arte:** Arlequin (diamonds), Pierrot (white, a black tear), Scaramouche (black, a long nose).
2. **Belle Époque domino:** black or colored silk eye masks with a top hat or ribbons.
3. **Animal masks:** a fox, hare, owl, toad or cat, in papier-mâché with gilt edges.
4. **Card-suit masks:** a heart, a spade, or a court card's face worn as a mask.

### Bodies
- **Formal evening wear** for everyone: tails, white tie, gowns, gloves. The mask carries the personality. (Outfits become a cosmetic later.)
- Hands are always gloved. White gloves read well on felt.

### You
- Seen **from behind**: shoulders, the back of your head, hair, and the **mask's ribbon or strap** tied at the back. The **edge of the mask** pokes past your cheek, so the silhouette tells you which mask you're wearing.
- Your character reacts: shoulders slump on a loss and square up on a Max bet.

### The rival
- **Solo:** one rival for the whole run, with a mask that matches their difficulty. Easy, medium and the high roller each get their own mask and silhouette.
- **Multiplayer:** each player picks their own mask, so the rival you see is the other player's chosen mask.
- **Life:** idle breathing, smoking (a cigarette holder; smoke curls up into the lamp light), and **French speech bubbles** on key beats (a bet, a showdown, a bust). Bubbles are short: *"Tapis."* (all-in, on a Max), *"Bof."*, *"Merde."*, *"Encore ?"*, *"Bien joué."* Rules text never lives in a bubble.
- The rival has **no tells that leak real information.** The animations react to what's already public.

### The shopkeeper, the buraliste
- **Not masked.** A grumpy older man: cardigan over a shirt, a big grey mustache, a Gitane on his lip, reading L'Équipe behind the counter.
- He thinks the masked customers are weird, and it shows: side-eye, a sigh when you browse too long, a grunt when you buy. On a god pull he **drops his cigarette**.
- His 3 traits sit on the posted sign. He has no rapport and no conversation, just reactions.

---

## 9. Cards

### Anatomy (64×88)
- **Paper:** cream stock (`paper` ramp), not stark white, with a 1 px ink outline and 3 px rounded corners.
- **Indices:** **English K Q J A** (no learning cost), top-left and bottom-right, rank above suit. Ranks use the pixel Didone numerals.
- **Pips:** a traditional layout, drawn crisp, with a slight letterpress feel (a 1 px darker inner edge).
- **Courts:** the **Paris pattern**, double-headed and mirrored, with the **named figures** (shown in the tooltip and collection view, not printed on the card, since text that small doesn't read). Kings: Charles, David, César, Alexandre. Queens: Judith, Rachel, Argine, Pallas. Jacks: La Hire, Hector, Ogier, Lancelot. Reuse the logo's court drawings where possible.
- **Joker cards:** a jester in a commedia mask. The word "Joker" hides somewhere in each one's art (the Balatro tradition, and a wink).
- **Bulk:** a grey stone slab the size of a card, with no rank or suit, a chiselled "+5", and moss in one corner.

### Wear shows Grade
- Condition is visible **once a card is graded** (ungraded cards are clean). A **low grade** has soft corners, a crease, a scuff and yellowed edges. **Mid** has slight edge wear. **Gem mint** is pristine, with a faint gloss sweep on hover.
- These are **overlay sprites** (corner wear, crease, stain) on top of the clean card, so we draw wear once and reuse it on every card.

### Card backs
- **One per starter box.** All share a frame (a burgundy and brass border, 64×88) with a different center emblem and pattern per box. For example: Classic = an interlocking-F filigree; Flambé Box = a crucible and flame; High Roller = a gold plaque; Collector = a binder ring and sleeve.

### Finishes (shader layers over the sprite)
Code ids: `foil` = Gold foil, `holo` = Holographic, `prism` = Embers (the top rarity), `misprint` = a print-registration error (ghost copy, no shader). Full part list and layout: `docs/CARDS.md`.

| Finish | Look | Motion |
|---|---|---|
| **Gold foil** | Brass-gold sheen over the card's light areas | A diagonal light sweep that **follows the tilt**. Idle: a slow sweep every ~3 s |
| **Holographic** | Rainbow interference + a fine hex grid, strongest at the edges | The hue shifts with tilt angle. Idle: a slow drift |
| **Embers** | The card edge glows orange, the paper darkens slightly at the border like it's singed | Tiny sparks rise off the top edge (particles, screen-space up, like the logo's fire) |

Finishes always shimmer a little when idle. That's part of the "the table is alive" feel.

### Stamps and knockoffs
- **Stamps** are rubber-stamp marks in colored ink, slightly misaligned and partly faded. Each stamp has its own ink color and icon.
- **Knockoffs** take the stamp slot and look like bad printing:
  - **Crayon:** the pips are redrawn in wobbly crayon.
  - **Marked:** a pinprick and a tiny pencil dot in the corner. Sneaky.
  - **Wrong Suit:** the suit is misprinted with a registration offset (the colors don't line up).
  - **Beer-stained:** a ring stain on the card, and it's stuck to its partner card, so the two are drawn overlapping and move as one.

### Forged ★ tiers: heat
| Tier | Look |
|---|---|
| ★1 | **Smoulder:** a faint warm glow at the edges, an occasional spark |
| ★2 | **Glow:** an orange rim light, a heat shimmer above the card (the `heat` shader warps the pixels above it) |
| ★3 | **White-hot:** edges at the top of the flame ramp, constant shimmer, sparks, and the card face lit from within |

Trait icons sit in a small strip at the bottom of the card, and the number of slots = the tier.

### Collectibles (the display case)
- Same 64×88 frame, but **behind glass**: a beveled brass frame and a glass glint that slides on hover.
- **Flavor text appears only in the collection view.** It's **funny references and jokes about the card**, e.g. a Balatro-joker nod that just says *"Looks familiar…"*. Keep it to 1 line, and never let it explain a rule.

### Card motion (always on)
- **Idle sway/breathing:** each card bobs ±1 art px and ±0.5° with a random phase.
- **Fanned arc in hand:** cards rotate ±3° per step from the center, along a gentle arc.
- **Tilt toward cursor:** fake 3D. Max ~12°. Eases back to flat in 0.1 s on leave.
- **Hover:** lift 6 art px and scale 1.05. **Selected/locked:** lift 12 and scale 1.08.

---

## 10. Objects

- **Jetons (round chips)** for small amounts: $1 cream, $5 burgundy, $25 green, each with a brass inlay ring and an "F" monogram.
- **Plaques (rectangular)** for big amounts ($100+): mother-of-pearl look, brass corners. Monte Carlo style.
- **Stacks + a big number:** the stack height shows magnitude at a glance, and the number above it (money green) is the truth.
- **Scratchers:** lottery tickets in the tabac rack, scratched with the cursor (silver flakes come off). Each insert (Code, Checklist, Wishlist, Grail) has its own ticket design.
- **Sleeves** (run-wide buffs): actual card sleeves on a display hook. The **Archival Sleeve** is a thick toploader.
- **The Gold Border side bet:** a small gold-edged chip placed on its own circle on the felt.

---

## 11. Motion system

### The engine of feel
- Every visible thing has a **target transform** and a **visible transform**. Each frame the visible one **springs** toward the target (critically damped, plus a bit of overshoot). We never set positions directly, which is why things always ease and settle.
- **`juiceUp(sprite, amount)`** is a quick scale pop (+10–20%) plus a decaying rotation wobble (±6°, ~0.3 s). Use it on any trigger: a card scores, a chip lands, a button is pressed.
- **The juice level is Balatro's:** constant micro-motion, short punchy triggers, and big payoff moments.

### Budget
- **Calm baseline.** While you're deciding (choosing cards, betting), only idle motion runs: sway, shimmer, smoke, camera drift. Nothing flashes and nothing shakes.
- **Triggers** are short, under 0.4 s each, and always return to calm.
- **Peak moments** (the Appraisal, the god pull, Flamber, bust) get shake, the swirl, light leaks and callouts, and nothing else does.

### Timings (start here, tune on screen)
| Event | Duration |
|---|---|
| Card score trigger (each) | 0.30 s, accelerating for long chains |
| Count-up digit lock | 0.08 s per reel |
| Whip-pan | 0.35 s |
| Pack shake → burst | 0.6 s shake, 0.15 s burst |
| Per-card flip in a pack | 0.25 s, plus 0.5 s hold before the last card |
| Screen shake | small 0.15 s / medium 0.25 s / big 0.45 s |
| Light leak | 0.6 s |

### Sound (paired with motion)
Every trigger has a sound, and pitch rises through a chain (each scored card a step higher, like Balatro). Chips clatter, paper rustles, stamps thunk, fire whooshes and crackles. The existing synth in `src/ui/sound.ts` is the starting point.

---

## 12. Big moments

### 12.1 The showdown Appraisal (the biggest payoff)
1. The rival's cards flip. The camera starts pushing in.
2. **Your cards score one at a time, left to right.** Each `juiceUp`s and floats its **Value** (cream) up into the Value counter, with a rising pitch.
3. Hype sources fire: **Hype** (flame orange) counts up, with a little flame flare per trigger.
4. Grade applies: a **gold stamp** slams down with "×2^Grade".
5. **The Appraisal rolls:** the number spins in like **slot reels** and locks digit by digit, left to right (the logo's lock-in, overshoot and white flash on each lock).
6. **Flambé:** the bigger the number, the hotter it burns. It goes cream → amber → orange → white-hot through the flame ramp. Above thresholds the number catches **actual fire** (the logo's flame shader), the lamp flares, the camera pushes closer, and the swirl starts at the room's edges.
7. **The announcer's call** slams on (see Writing on screen).
8. The winner takes the pot: chips slide over, the result settles, and the camera eases back. Show the margin ("by 40").

Heat thresholds are relative to the round's expected score (from `REF_SCORE`), so the fire means "big for this point in the run", not just "big number".

### 12.2 The god pull (the second biggest)
See Pack opening: the last card is held face-down, light rays, a fée verte flash, a light leak, the shopkeeper drops his cigarette, and the callout.

### 12.3 Flamber
See the Flamber scene: a flame runs across the hand and one card rises out of it. A ★3 result gets the full white-hot treatment and a big shake.

### 12.4 Busting the rival
The rival's last chips slide over, their mask cracks, then they tear it off and throw it on the felt. A big light leak, the swirl goes full-room for a moment, then calm, and the receipt prints.

---

## 13. UI

### Style: paper ephemera
Every panel is a **real piece of paper from the casino and the tabac**: betting slips, tickets, receipts, pawn tags, telegrams, postage stamps. That's what makes the UI itself feel French and old.
- **Panels** are cream paper with a slightly uneven edge, a printed ink border, and a hard drop shadow onto whatever is under them.
- **Buttons** are **betting slips / tickets** with a perforated edge. On press they get **stamped** (an ink stamp slams down with a thunk and a little `juiceUp`), and they push down 1 px.
- **Tooltips** are small torn paper tags pinned to the card. Keywords are colored by the color language (Value cream on ink, Hype orange, Grade gold, money green).
- **Panels slide in** from offscreen with spring overshoot, the way paper gets slapped on a table.
- **The complexity rule holds in the UI:** every mechanic explains itself in one line where you see it.

### HUD: battle-style plates
- **Your plate, bottom-left:** a brass-framed name plate with your mask icon, your bankroll (big, money green), your hand size and your mulligans.
- **Rival plate, top-right:** their mask, bankroll, hand size and mulligans. Never their locked count (hidden info rule).
- **Center felt:** the pot, as chips plus a number, and the round marker as a small brass "Table 2 · Round 5" plaque at the felt's far edge.
- **Score counters** (Value, Hype, Grade, Appraisal) appear above the felt only during scoring, then fold away.

### Typography
- **Titles and numbers: a pixel Didone.** High-contrast serif caps with thick stems and hairlines, built like the logo's letters. Used for titles, the Appraisal, the announcer's calls and card indices. Cap height is 14 art px for titles; numbers run at 10–28 px depending on importance.
- **Body: a pixel sans,** in the chunky m6x11 style, for rules text, tooltips and buttons. Cap height 7 art px, with 1 px letter spacing allowed.
- We can draw both ourselves in Aseprite as bitmap fonts, or start from an open pixel font with a compatible license and adapt it.
- Numbers are **gameplay objects**: their size and motion scale with how much the number matters (the Appraisal is the biggest thing on screen during a showdown).
- French number formatting **only in flavor** (like the logo's "1 048 576"). Use plain numbers in the rules UI.

---

## 14. Writing on screen

- **French = flavor only.** Names, signs, the announcer, speech bubbles, brands, flavor text. **Rules text, buttons and tooltips are English.** The Value / Hype / Grade / Appraisal names stay English.
- **The renamed mechanic:** "Forge" is now **Flamber** (the button and the verb). Tiers and traits are unchanged.
- **The announcer** is the croupier, **text only**: big Didone callouts that slam onto the screen with a stamp and a little shake. The ladder, from lowest to highest:
  1. **Pas mal** (not bad)
  2. **Joli coup** (nice shot)
  3. **Magnifique**
  4. **Sensationnel**
  5. **Flambé !** (the number is on fire)
  
  The croupier also has fixed phase calls: *"Faites vos jeux"* (betting opens), *"Rien ne va plus"* (bets locked, showdown).
- **Flavor text:** collection view only, one line, jokes and references.

---

## 15. Accessibility (from day one)

- **Reduce motion:** no screen shake, no swirl movement, no camera drift, shorter flips. Fire and shimmer still render, but calmer.
- **Post strength slider:** 0–100% for grain, smoke, vignette and light leaks.
- **Four-color suits** (see Color).
- Color is never the only signal: Value, Hype and Grade numbers always come with their label or icon.

---

## 16. Hackathon asset list (in priority order)

Get the duel scene readable first, then the payoffs, then the shop.

1. **Renderer core:** sprite batcher, springs, `juiceUp`, nearest sampling, the 640×360 stage. Plus the `sprite` (tilt), `post` and `floor` shaders.
2. **Cards:** the 64×88 frame, pips, indices, 12 Paris courts, 1 card back, Bulk.
3. **The duel scene:** felt plane (4 colors), lamp, room backdrop, the player from behind (1 mask), the rival (3 masks for the 3 difficulties), jetons and plaques, the HUD plates, the betting-slip buttons.
4. **Showdown Appraisal:** counters, slot-reel numbers, flambé fire, the callouts, the camera push.
5. **Finishes and heat:** `foil`, `holo`, `embers`, `heat`, `burn`.
6. **Pack opening:** 1–2 packaging brands, shake and burst, the god-pull reveal.
7. **The tabac:** counter, buraliste, the posted sign, the whip-pan, the binder and grading desk as simple versions.
8. **Polish:** the swirl, light leaks, wear overlays, the other card backs, stamps and knockoffs, more masks.

---

## 17. Still open

- **The Flamber rename** has to land in `DESIGN.md`, `CLAUDE.md` and the UI strings (the engine can keep `forge` internally).
- **Exact font choice:** draw our own, or adapt an open pixel font?
- **Multiplayer:** how the 10-player table looks (it can't be one rival across the table). This is a later doc.
- **Rival names** per mask/difficulty.
