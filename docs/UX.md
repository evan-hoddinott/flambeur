# Flambeur: UX frame, drawers and the Fiche

How the game keeps things in the same place, and how it explains itself. Decided by Evan on Nov 18 2026, after a four-reviewer UX pass covering inventory, the description box, scene flow, and props plus onboarding. **Not built yet.** Where this doc disagrees with ART.md §13, DUEL.md or SHOP.md about where UI lives, this doc wins. READABILITY.md still owns button colors and plinths.

Coordinates are art px on the 640×360 stage (×2.5 = screen px).

---

## 0. Done when

- [ ] Every screen (duel, small and big shop, draft, pack rip, binder, grading, forge pick, results) shows zones A–F in the same spots. No DOM `.packbox` overlay or `title=` tooltip is left.
- [ ] The carnet is in the bottom-left corner in every scene. D / B / S / V / ? open the right tab from anywhere, and Esc closes it. The counts are correct, and `pile/total` means the same thing everywhere.
- [ ] During a match, the Sleeve's inserts sit beside the hand and can be used from there.
- [ ] The crumpled paper at the table opens the rules sheet: hand rankings with examples and levels, plus the how-a-hand-works lines.
- [ ] Every rules thing (cards and all modifiers, collectibles, inserts, pochettes, twists, rivals, shopkeeper traits, every HUD icon and badge) shows a Fiche on hover. The Fiche text comes from the engine map, and no rule string is hard-coded in the UI.
- [ ] Compare mode works on pack sort, spoils and the draft.
- [ ] The carnet glossary is generated from the same map as the Fiche. (First-encounter tags, buraliste lines and the labels toggle are out of scope for now.)
- [ ] Every item in §9 and §10 is done. DESIGN.md is updated for the §10 rule changes, and the sim is re-run for any that touch balance (Crayon, the Store Credit cut).
- [ ] Tests, typecheck and build pass. A full `/?quick&auto` run and a hand-played run in the browser throw no console errors besides `/api/me`.
- [ ] Art that isn't final is registered in `src/ui/placeholders.ts`: the bifold, the tab icons, the rules paper frames, the Fiche pin.

## 1. The problems we're fixing

- **Your stuff moves.**
  - The deck is a duel prop, a shop bottom-bar stack and a DOM ghost button, depending on the screen.
  - The deck count means pile in the duel but pile+discard in the shop.
  - The Vitrine is a canvas case in the duel and a DOM modal in the shop.
  - The binder can't be reached from the duel.
  - The marker is missing in the small shop.
- **About 10 tooltip styles, and the rules are missing.**
  - Finishes, stamps, traits, ★ tiers and knockoffs show a name with no rule.
  - Unexplained: K.O., MOYEN, the lane icon, the hand pips, the plate icons, STONKS (French only), twist rules in the shop, Ash.
- **Names drift.** "Embers"/"Gold foil" vs Prism/Foil. Pack art (Le Roussi, Faux Frère) vs code (Repack, Off-Brand). Shred vs Bin.
- **The DOM screens break the pixel-art language:** draft, pack rip, binder, grading, Sleeve, forge pick, results. The draft's Keep button sits below the fold.
- **The corner button is a trap.** You press Continue in the bottom-right, and the next screen puts Discard or Max in that same spot.

## 2. The screen frame

Every screen uses the same zones, including the rebuilt draft, packs, binder, grading and results.

| Zone | Where | What |
|---|---|---|
| **A. Run strip** | top-left | Table · Manche, and the next twist (on a boss night the hanging twist sign says it instead). In the duel the **hand track** sits top-center: Main 1/3, your pips, the score and the K.O. line on one plate. The duel chalkboard stays as set dressing. |
| **B. Your plate** | left, directly above the drawer | The same spot in both scenes. Name and money. In the duel's deal and bet it widens to carry your **hand readout**: what your picked cards make, then LOCKED through the bet (base Value × Hype). Le Patron's marker note hangs under its left end. |
| **C. Action stack** | bottom-right (508–634 × 230–352) | The **safe or primary action sits in the corner slot**: Play at the bottom, Min below Max, Continue, Sortir, Keep, Done. Secondary actions stack above it, the hint line above those, the toast above the hint. Toasts expire after one beat. Nothing else lives in the column. |
| **D. Rival** | top-right | The duel plate. In the shop, a small "next: <rival>" tag on the same spot, and the big shop's dossier. |
| **E. Drawer** | bottom-left corner, x 0–40, y ~290–360 at rest | The carnet (§3). Hover pulls it out to x 8–115, y 252–350. |
| **F. Announcement band** | center, y ~150–240 | One style for every rule callout: K.O., rival sits down, marker due or paid, twist on the first deal, spoils. It's the band the K.O. callout already uses, French big and English under (READABILITY §10). |

The **round-end tally** is the only place money gets itemized: marker, spoils skip, and so on.

### One home per thing (Nov 19 cleanup)

Every piece of information has one home on the HUD. A world prop can repeat a number (the chalkboard's Ante/Max, the pile's count), but it's never the only place it shows. Cut on Nov 19, and don't bring them back:

- **Top bar:** the VITRINE/DISPLAY and CARNET tabs. The carnet in the corner and D/B/S/V/? are the way in. FR · EN, Tips and the volumes live in the pause menu (§2b). The title screen keeps its FR · EN chip.
- **The rules ball and the separate rules sheet.** The carnet's Rules tab is the one rules view.
- **Plate counters** (cards in hand, discards, Sleeve) on both plates. They show where you use them: your fan, the Discard ticket, the Sleeve cards, the rival's backs.
- **Bankroll chip stacks.** The pot keeps its chips.
- **The felt K.O. badge and the rival's pips.** Both live on the hand track.
- **The score tab over the buttons.** It's your plate's readout now.
- **"You bet first" headline and "À vous" banner.** The 1er puck, the chime and the lamp flare stay. The bet hint says the order once.
- **One voice:** while a first-encounter tag is up, the hint line waits. Nothing picked means no hint, since the readout says "pick 1–5 cards".
- **Shop:** services closed today are hidden, not greyed "not today" tickets.

### 2b. The pause menu (Nov 19)

A plain game pause: **Esc** or the **Pause** tab hanging off the top edge above the run strip (on the title, **Settings** beside FR · EN) dims the whole canvas and opens the settings table in the middle (`src/ui/pause.ts`). Esc goes to whatever else is open first: the carnet, a panel that closes on Esc, a pinned Fiche, the scratch ticket. While it's up it takes every click and key except **M**. Clicking off the table closes it.

**The look (Nov 20):** a card table in miniature: green felt under a lamp, a padded burgundy rail with brass studs, the title in gold Didone. Everything you press is a bet ticket (READABILITY.md §4), so it reads like the rest of the game. Art: `art/duel/pause.py`, packed into the duel atlas by `art/duel/build.py`.

- **Tabs** are full bet tickets with an icon. Choices, toggles and small buttons are **stubs** (`hud/stub/*`, the ticket cut to 13 px, same tint). One color rule: **gold** is what's chosen (the open tab, the picked stub), brown is everything else, **blue** goes back to play (Resume/Close), **red** loses the run (Abandon). Every stub in a row is the same width unless that runs off the page. Toggles always read On then Off.
- **Sliders** are a red jeton riding a groove in the felt, brass behind it, the value on a price chip.
- Rows sit under small section heads (Volume, Switches; Pace, Table, Help; Screen, Effects; Motion, Reading). The hovered row gets a gold pip, and its one line prints on a **receipt** at the foot of the page.
- **Keys** are drawn as keycaps. **Credits** is set in Didone with a head per section.
- **Motion:** the table slides up with a little overshoot, the page eases in on a tab change, a chosen stub bounces once. None of it with reduce motion on.

- **Tabs** down the left: Sound, Game, Display, Access, Keys, Credits. Each row is a label and its control; hovering a row puts its one line on the receipt (the complexity rule).
- **At the foot of the tabs:** Resume, Abandon run (in a run, tap twice) and First run (the seeded first run; tap twice in a run).
- **Sound:** master, music, effects and room volumes (a jeton slider in tenths, click or drag), mute (M), mute when the tab is hidden, voice blips.
- **Game:** speed 1×–3× (the count-up, the tally, the rival's pauses), count-up watch or skip, confirm bets (Max, or Max and Flamber, take a second press within 3 s; the ticket reads Sure?), hand order, hand preview, tips and tips again, Fiche delay, language, French glint.
- **Display:** fullscreen (F anywhere), crisp or fill pixels, atmosphere (vignette, smoke, light leaks), screen shake off/low/full, frame rate 60/30/saver (saver goes to 15 after 5 s idle), pixel cursor.
- **Access:** reduce motion (auto follows the system), calm flashes, four-color suits, high contrast text, Large Fiche (2×).
- **Keys** lists every key. **Credits** names the music and the CC0 sound packs.

Every setting lives in one object in `src/ui/prefs.ts`, saved under `flambeur.prefs` (the old sound, language and tips keys migrate once). The engine never reads it.

**Color:** violet only ever means Discard, so the Grading ticket gets recolored. Green only ever means Min.

## 3. The drawer: a worn leather carnet in the corner

One prop, a brown leather **carnet** (a gambler's notebook), pokes out of the bottom-left corner in every scene, tilted, mostly off-stage. It's in the foreground, at the same coordinates in the duel, the tabac and every rebuilt screen. Art: `art/duel/booklet.py` (`drawer/book/*`, `drawer/leaf/*`, `drawer/dock`), packed by `art/duel/build.py`.

**It's been carried for years.** Nothing on it is new: the bottom brass cap fell off (nail holes and an unfaded patch where it sat), the top one is dented and tarnished, a cigarette burned it once, a glass left a ring, the gilt is rubbed off where the thumb opens it, stitches are missing and one end hangs loose, the hinge is cracked, the elastic is stretched crooked, the fore-edge is grubby. The papers stuck in it are crumpled, dog-eared, taped and coffee-stained, the pencil is chewed down, the pages are foxed and water-stained with tally marks in the margin. Keep that when touching the art.

- **At rest:** the carnet sits in the corner at about −9°, with its index tabs and the papers in its top edge (a tabac receipt, a folded note, a card) peeking out. The tabs never sit flush.
  - **Étui** (red, card stock, dog-eared): `pile/total`
  - **Classeur** (blue divider, torn and taped): count, and a STONKS glint when a hot card is inside
  - **Sleeve** (glassine): inserts held, out of 2
  - **Vitrine** (green ticket stub): filled slots
  - **Carnet** (torn notebook paper): rules
- **Hover:** it springs up and out of the corner and straightens. The papers rise a little, the tabs slide out to show their counts, and the tab under the mouse pulls out further with a cream outline and a caption tag (`Deck · 14/18 · D`).
- **Click: it flies to the middle and opens.** A tab opens on that page; the cover opens where you last were. The elastic snaps off (thunk), the carnet grows to full size on its way to the center (the small sprite hands over to the big art at 95%), lands as the shut book with its tabs out of the right leaf, then the cover creaks and swings over the spine to become the left leaf. The left leaf holds the tab's contents, the right leaf the details (a Fiche, counts). Closing runs it backwards: the cover shuts, then it flies home.
- **Open tabs** stick out of the right leaf's fore-edge, the open one pulled out furthest. Click one to turn to it.
- **One viewer with tabs:** Étui · Classeur · Sleeve · Vitrine · Carnet. Hotkeys **D / B / S / V / ?** fly it open on the matching tab, the same key again or Esc closes it, and the tabs switch pages. Number keys and Space stay reserved for cards.
- **Étui tab: La Pile.** The deck as ruled lines of a French school notebook (Seyès violet rules, a red margin). Code: `src/engine/pile.ts` (pure grouping), `src/ui/pile.ts` (drawing).
  - **Group by Rank · Suit · Type** (chips on the right leaf, **G** cycles). Rank is the default: 13 rank lines, then Any (Crayons) and Ash. Empty ranks stay as short faded lines so straight gaps show.
  - **A line reads:** label in the margin, card count, `=N` in burgundy when the line counts as more or less than its printed cards, `+N?` for a Courtier that can become it. Then plain cards as ink pips (their suit in rank lines, their rank in suit lines), then special cards as cream chits with the index and a foot of one ink per modifier slot (`modifierInk`).
  - **A card shows up everywhere it counts**, dotted: a Split/K Queen in the K line, a Wrong Suit ♣ diamond in ♣, a Wild card in every suit. A Twin counts 2, a Household 3 and 2.
  - **Show** (mid-round only): Left to draw · Whole deck. It defaults to Left to draw, so nothing is greyed out. A card away at grading sits in its line, faded, with its parcel.
  - **Pinned:** click a line's label to pin it (max 3, a 4th replaces the oldest). The right leaf lists pins with their counts, plus deck size. Pins carry across groupings.
  - **Hover a card:** it's outlined, every line it counts in lights, and the right leaf shows it big with its Fiche.
- **Vitrine tab:** collectibles in scoring order. The top-left VITRINE tab stays as a shortcut (it gets one pip per filled slot), and the shop uses the duel's canvas case instead of the DOM modal.
- **"Show labels" toggle:** pins every caption. On by default for the demo.
- The current pile prop on the duel table can stay as a passive count. The carnet is the button. The shop's bottom-bar deck stack and binder book go away.

## 4. The Sleeve: a drawer tab everywhere, cards in hand at the table

- **Everywhere:** the Sleeve is a tab in the carnet (S), like the other containers. It shows both inserts with their Fiches.
- **During a match:** the 2 inserts also **show as two separate cards off to the side of your hand**. Hover gives a Fiche, and clicking one uses it.
- The tiny "SLEEVE" label on the zinc and the empty cuff slots go away.
- A third insert from a pack sits crooked until you toss one.

**Names (settled):** the 2-slot insert pocket stays **the Sleeve**, and the run-wide upgrades stay **Pochettes** (V2-ART §0). The art is already baked that way, and a "pochette" is a card sleeve in French TCG slang, which fits the upgrades.

## 5. Compare mode: choosing next to your deck

Whenever you're choosing cards (draft rows, pack sort, spoils), La Pile **docks on the left** on a scrap of carnet paper with the Étui's red tab on top. It's the same ledger as the Étui page, narrower, in the same grouping (G works here too). Facts only: counts, never odds or "take this" advice.

- **The receipt:** a tabac receipt clipped to the top holds your pins and the deck size, as `before → after` while an offer is hovered.
- **Hovering an offer:** every line it would join lights, and its pip or chit pulses into each one (dotted in lines it only also counts in). Nothing else moves.
- **Draft:** there's no deck yet, so the rows you'd keep are the ledger. It fills in as you choose which row to toss.
- **Pack sort:** cards set to Deck pulse in. A card set to Binder lights nothing and the receipt says it's not going in your deck (STONKS shown if it's hot).
- **D** opens the full carnet on La Pile over the choice, Esc comes back.
- Not built yet: rule-word lights (hovering a collectible or insert lights the lines it triggers on and adds "Your deck: N cards are 2–6" to its Fiche) and a card's play history in its Fiche footer.

## 6. The Fiche: one description box

Every rules thing in the game is explained by the same box.

**Data:**
- Everything with rules meaning exports `{ name, kind, tag?, text, flavor? }` from the engine.
  - New text maps for finishes, stamps, knockoffs, traits, tiers and HUD items go next to `VARIANTS` in cards.ts.
- The UI never hard-codes a rule string. `PACK_LINE` and the `cardTags` label maps go.
- The carnet glossary is generated from the same map, so they can't drift apart.

**Anatomy** (9-slice cream paper, ink border):
- **Header:** didone name, a chalk-font type pill (CARTE / BIBELOT / INSERT / POCHETTE / TWIST / RIVAL / PATRON / HUD), and rarity or ★ on the right.
- **Body:** sans, max ~150 px wide, one rule line per modifier slot. On cards, each line starts with its specialInk square.
- **Flavor:** one French line in tiny, `#8c7656`.
- **Footer:** after a 1 px rule: price, sell value, or state ("click to use", "away 1 round").

**Markup**, parsed by one `richText()` in font.ts:

```
{v}+30 Value{/}   cream on an ink chip
{h}+6 Hype{/}     flame #ff7a24
{x}×1.5 Hype{/}   cream on a flame chip (multiplies, so it looks different from adds)
{g}+1 Grade{/}    gold #e8c260
{$}+$3{/}         money green
{-}−$3{/}         burgundy
[Ash]            keyword, brass underline. spawns a sub-box
```

**Placement:**
- Anchored to the **right** of the thing, top-aligned, flipping left at the screen edge.
- Above the hand fan when over it.
- Never covers the action stack.
- Keyword sub-boxes stack on the far side, max 3.

**Triggers:**
- Hover after 120 ms. Touch: tap to show, a second tap acts.
- Right-click or hold 400 ms **pins** it (a brass pin). Esc closes.
- DOM screens use a `.fiche` CSS twin until they're rebuilt. No more `title=`.

**Example:**

```
┌ Dame ♥ ★★ ─────────── CARTE  ★★ ┐   ┌ [Twin] ────────────┐
│■ ★★  {h}+5 Hype{/}              │   │ Counts as 2 of its │
│■ Twin: counts as 2 Queens       │   │ rank in any hand.  │
│■ Holo: {h}+4 Hype{/}            │   └────────────────────┘
│■ Signed: scores twice           │
│ « Deux fois flambée. »          │
│─ sells $7 · flambéed rd 4       │
└─────────────────────────────────┘
```

## 7. Teaching

- **First-encounter tags.** A torn paper tag, pinned with a brass pin, shows the one-line rule the first time each of these appears: Flamber, K.O., Le Patron, Max, Spoils, STONKS.
  - One tag at a time, never during scoring, gone on your next action.
  - Seen keys go in `flambeur:seen:*` (wrapped in try/catch). `?fresh` resets them for the demo.
- **The rules paper (at the table).** The crumpled paper ball on the felt becomes the table's rules sheet. Click it and it uncrumples into a flat sheet with two sides:
  - **Poker hands:** every hand type from High Card to the top, each with a tiny example row of cards, its base Value/Hype and its current level. Players who don't know poker learn it here.
  - **How a hand works:** best of 3, Play / Flamber / Discard, Min / Max, Appraisal = Value × Hype × 2^Grade, K.O. One line each, from the Fiche map.
  - **Art rework:** a new crumpled-ball sprite that reads as "notes" (visible scribbles, a corner of a hand-ranking chart), an uncrumple animation (3–4 frames: ball, half-open, creased sheet), and the sheet itself as creased paper with a pencil-written chart. Replaces the current cheat-sheet ball and panel (duel.ts ~1889).
- **Carnet:** the rules notebook in the drawer, also reachable from the top-left. Three tabs: Hands (the same sheet as the rules paper), Glossary (generated from the Fiche map), This run (the Patron schedule, rival dossier, log).
- **Buraliste one-liners** in the shop's speech bubble, French big and English under: *"Le Roussi ? Des petites cartes."* / "Mostly low cards." Le Patron stays silent and teaches only through his ledger line.
- **Keyword hovers** in the hint, tally and tags: rule words get a dotted underline and open their Fiche.

## 8. Rebuilding the DOM screens on canvas

Each rebuilt screen keeps the scene as its backdrop and the frame zones live. Order:
1. **Pack rip on the zinc.** Cards physically fly to the Étui or the Classeur.
2. **Draft rows on the felt**, with "Keep these 3/3" in the corner slot.
3. **Binder and grading** as carnet pages, with Sell and Ship in the action stack.
4. **Forge pick:** trait chips on the new card.
5. **Results** on the duel table, with Le Patron's note in band F.

## 9. Quick fixes (do first)

- [ ] Deck count means `pile/total` everywhere. Deck button on the draft and Sleeve screens. Marker note on the shop plate.
- [ ] Hovers for K.O. 6×, MOYEN, the lane icon, the hand pips, the plate icons, the LA MAISON traits, and the Patron slip ("…or you're out").
- [ ] English under French: STONKS ("Clubs sell ×3 from your binder"). Twist rule text in the shop note and dossier.
- [ ] One name per thing: Embers/Gold foil become the engine names, pack names match their art, Shred becomes Bin.
- [ ] Draft "Keep these" pinned bottom-right, with no scrolling.
- [ ] Shop toast moves to the bottom-right column. Stale duel toasts expire.
- [ ] One round label format. Main 1/3 stays visible through the tally.
- [ ] Action stack order (§2 C).
- [ ] Grading ticket gets recolored off violet.
- [ ] Big shop: "NOUVELLE TABLE CE SOIR" chalk overprints the register.
- [ ] V2.md §6 lists K as 2/3/5/8, but the tuned K is 6/8/10/12.

## 10. Content changes (each one fails the one-line rule today)

These are rule and name changes, so update DESIGN.md in the same change.

- **Crayon** → "Counts as any rank, 0 Value."
- **Store Credit** (collectible) and **Pochette Restock** have the same effect. Cut one.
- **Rename the "Vitrine" collectible**, since it clashes with the display case.
- **Double or Nothing** → "Everything this round pays or costs ×2."
- **Household/X** shows as "Household (Ks over 8s)".
- **Rival betting styles** get player-facing lines, or come out of the UI.

## 11. Build order

1. Quick fixes (§9).
2. The engine text map plus the Fiche, routing all ~10 existing tooltips through it.
3. First-encounter tags and the carnet glossary.
4. The bifold with placeholder art, the tabbed viewer and hotkeys (Sleeve tab included). The Sleeve as two cards beside the hand during a match. The rules paper (placeholder sheet first, art after).
5. Compare mode: pack sort, then spoils, then draft.
6. Canvas rebuilds (§8).
7. Final carnet art (done Nov 18), the flight and cover swing, and sounds. Rules paper art: the crumpled ball, the uncrumple frames and the sheet.

## 12. Interfaces (so parallel pieces snap together)

Scope: **everything in §0–§10 except teaching beyond the rules paper and the carnet (no first-encounter tags, no buraliste lines, no labels toggle) and final art.** The art is placeholders registered in `src/ui/placeholders.ts`, and another model draws it later.

**Engine text map**, new `src/engine/glossary.ts`. Pure data, no DOM.
```ts
export type Kind = 'card' | 'finish' | 'stamp' | 'knockoff' | 'trait' | 'tier' | 'variant' | 'joker' | 'bulk'
  | 'collectible' | 'insert' | 'pochette' | 'twist' | 'rival' | 'keeper' | 'hud' | 'keyword' | 'hand'
export type Entry = { name: string; kind: Kind; tag?: string; text: string[]; flavor?: string; foot?: string }
export function entry(kind: Kind, id: string, ctx?: unknown): Entry   // throws on unknown id
export function cardEntry(card: Card): Entry                          // one text line per modifier slot
export const KEYWORDS: Record<string, string>                         // term -> one line, feeds sub-boxes + carnet glossary
```
`text` lines use the §6 markup. Existing `VARIANTS`, `JOKERS`, `describe()`, the INSERTS text and the twist and rival text stay where they are. `entry()` reads from them, so there's one source.

**The Fiche**, new `src/ui/fiche.ts`. `richText` goes in `font.ts`.
```ts
export function richText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number): number  // returns height
export function fiche(e: Entry, anchor: { x: number; y: number; w: number; h: number }): void  // canvas: hover box for this frame
export function pinFiche(): void; export function clearFiche(): void
export function drawFiche(g: CanvasRenderingContext2D): void        // called last by duel.ts / shop.ts each frame
export function ficheHtml(e: Entry): string                         // .fiche DOM twin
```

**Bifold and viewer**, new `src/ui/drawer.ts`. Canvas, drawn by both scenes.
```ts
export type Tab = 'etui' | 'classeur' | 'sleeve' | 'vitrine' | 'carnet'
export function drawDrawer(g: CanvasRenderingContext2D, v: MatchView, t: number): void  // the carnet in its corner, or the open book
export function drawerHit(x: number, y: number): Tab | null
export function openDrawer(tab: Tab, compare?: Compare): void; export function closeDrawer(): void
export function drawerKey(key: string): boolean                     // D/B/S/V/?/Esc, true if handled
export type Compare = { offers: Card[]; dest?: 'deck' | 'binder' }   // compare mode docks the drawer small beside the offer
```
**Rules columns**, `src/ui/rules.ts`: `handsColumn` and `howColumn`, drawn by the carnet's Rules tab (the one rules view since Nov 19).

**Compare helpers**, `src/engine/compare.ts`. Pure.
```ts
export function deckDelta(deck: Card[], add: Card[]): { suit: Record<Suit, [number, number]>; rank: Record<number, [number, number]>; lines: string[] }
```

**Who owns what during the build.** Parallel agents work only in their own files. Wiring into `duel.ts`, `shop.ts` and `main.ts` happens serially, by the integrating session.
- **Engine + content agent:** `src/engine/glossary.ts`, `compare.ts`, the §10 content changes, sim runs, DESIGN.md
- **Fiche agent:** `src/ui/fiche.ts`, `richText` in `font.ts`, `.fiche` CSS
- **Drawer agent:** `src/ui/drawer.ts`, `src/ui/rules.ts`, their placeholders
