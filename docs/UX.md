# Flambeur: UX frame, drawers and the Fiche

How the game keeps things in the same place, and how it explains itself. Decided by Evan on Nov 18 2026, after a four-reviewer UX pass covering inventory, the description box, scene flow, and props plus onboarding. **Not built yet.** Where this doc disagrees with ART.md §13, DUEL.md or SHOP.md about where UI lives, this doc wins. READABILITY.md still owns button colors and plinths.

Coordinates are art px on the 640×360 stage (×2.5 = screen px).

---

## 0. Done when

- [ ] Every screen (duel, small and big shop, draft, pack rip, binder, grading, forge pick, results) shows zones A–F in the same spots. No DOM `.packbox` overlay or `title=` tooltip is left.
- [ ] The bifold is on the left edge in every scene. D / B / S / V / ? open the right tab from anywhere, and Esc closes it. The counts are correct, and `pile/total` means the same thing everywhere.
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
  - Unexplained: K.O., MOYEN, the lane icon, the hand pips, the plate icons, STONKS (French only), twist rules in the shop, Bulk.
- **Names drift.** "Embers"/"Gold foil" vs Prism/Foil. Pack art (Le Roussi, Faux Frère) vs code (Repack, Off-Brand). Shred vs Bin.
- **The DOM screens break the pixel-art language:** draft, pack rip, binder, grading, Sleeve, forge pick, results. The draft's Keep button sits below the fold.
- **The corner button is a trap.** You press Continue in the bottom-right, and the next screen puts Discard or Max in that same spot.

## 2. The screen frame

Every screen uses the same zones, including the rebuilt draft, packs, binder, grading and results.

| Zone | Where | What |
|---|---|---|
| **A. Run strip** | top-left | Table · Manche · Main in one format ("Table II · Manche 4/12 · Main 1/3"), the next twist, and Le Patron's next payment. The VITRINE tab and the carnet sit here too. The duel chalkboard stays as set dressing. |
| **B. Bankroll plate** | left, directly above the drawer | The same spot in both scenes: the duel already has it, and the shop shelf shifts right ~40 px to make room. Le Patron's marker note always hangs off it. |
| **C. Action stack** | bottom-right (508–634 × 230–352) | The **safe or primary action sits in the corner slot**: Play at the bottom, Min below Max, Continue, Sortir, Keep, Done. Secondary actions stack above it, the hint line above those, the toast above the hint. Toasts expire after one beat. |
| **D. Rival** | top-right | The duel plate. In the shop, a small "next: <rival>" tag on the same spot, and the big shop's dossier. |
| **E. Drawer** | left edge, x 0–40, y ~204–320 | The bifold (§3). |
| **F. Announcement band** | center, y ~150–240 | One style for every rule callout: K.O., rival sits down, marker due or paid, twist on the first deal, spoils. It's the band the K.O. callout already uses, French big and English under (READABILITY §10). |

The **round-end tally** is the only place money gets itemized: marker, spoils skip, and so on.

**Color:** violet only ever means Discard, so the Grading ticket gets recolored. Green only ever means Min.

## 3. The drawer: a leather bifold on the left edge

One prop, a leather **porte-cartes** (bifold wallet), sits half off-screen on the left edge in every scene. It's in the foreground, at the same coordinates in the duel, the tabac and every rebuilt screen.

- **Closed (peek):** the spine and the edge of the fold show, with tabs sticking out for what's inside. Each tab has a live count:
  - **Étui** (your starter's tuck box): `pile/total`
  - **Classeur** (binder): count, and a STONKS glint when a hot card is inside
  - **Sleeve:** inserts held, out of 2
  - **Vitrine:** filled slots
  - **Carnet** (rules): a red ribbon when there's an unread entry
- **Hover:** the bifold springs ~10 px further in, gets a cream 1 px outline and a caption tag (`Deck · 14/18 · D`). Hit box ~44×40 per tab.
- **Open: an unfolding animation.** The bifold slides to center and swings open about its spine (scaleX flip, spring overshoot as in `duel.ts` `spring`). The two leaves become the viewer: the left leaf holds the tab's contents and the right leaf holds the details (a Fiche, counts). The tab you clicked is the page it opens on. Sound: leather creak, then a soft snap.
- **One viewer with tabs:** Étui · Classeur · Sleeve · Vitrine · Carnet. Hotkeys **D / B / S / V / ?** open it on the matching tab, the same key again or Esc closes it, and the tabs switch pages. Number keys and Space stay reserved for cards.
- **Étui tab:**
  - Filters: All / Pile / In hand / Played this Table / At grading (the card shown greyed, with its parcel).
  - Bulk and Jokers get their own row.
  - Sort by Rank / Suit / Value.
  - Suit and rank counts, as the current viewer has (main.ts ~360–452).
- **Vitrine tab:** collectibles in scoring order. The top-left VITRINE tab stays as a shortcut (it gets one pip per filled slot), and the shop uses the duel's canvas case instead of the DOM modal.
- **"Show labels" toggle:** pins every caption. On by default for the demo.
- The current pile prop on the duel table can stay as a passive count. The bifold is the button. The shop's bottom-bar deck stack and binder book go away.

## 4. The Sleeve: a drawer tab everywhere, cards in hand at the table

- **Everywhere:** the Sleeve is a tab in the bifold (S), like the other containers. It shows both inserts with their Fiches.
- **During a match:** the 2 inserts also **show as two separate cards off to the side of your hand**. Hover gives a Fiche, and clicking one uses it.
- The tiny "SLEEVE" label on the zinc and the empty cuff slots go away.
- A third insert from a pack sits crooked until you toss one.

**Names (settled):** the 2-slot insert pocket stays **the Sleeve**, and the run-wide upgrades stay **Pochettes** (V2-ART §0). The art is already baked that way, and a "pochette" is a card sleeve in French TCG slang, which fits the upgrades.

## 5. Compare mode: choosing next to your deck

Whenever you're choosing cards (draft rows, pack sort, spoils, shop cards), the bifold **opens automatically, docked at reduced size** beside the offer.

- **Hovering an offer:**
  - ghosts it into its suit row (a pulsing outline at its sort position)
  - shows count changes: `♠ 6→7`, `Q 1→2`
  - shows one payoff line: "5th ♥: flush lane", "makes a Q pair possible", "3rd Bulk"
- **Draft:** shows the totals of all picked rows at once.
- **Pack sort:** cards headed to the Deck ghost into the Étui, and cards headed to the Binder ghost into a Classeur page.
- **Shop collectibles and scratchers:** the Vitrine or the Sleeve shows the slot it would take.
- **Payoff lines** come from small pure helpers in `src/engine/`. If one can't be said in a line, it's cut.
- **Build order:** pack sort first (the most frequent choice), then spoils, then draft.

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
[Bulk]            keyword, brass underline. spawns a sub-box
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
- **Carnet:** the rules notebook in the bifold, also reachable from the top-left. Three tabs: Hands (the same sheet as the rules paper), Glossary (generated from the Fiche map), This run (the Patron schedule, rival dossier, log).
- **Buraliste one-liners** in the shop's speech bubble, French big and English under: *"Le Roussi ? Des petites cartes."* / "Mostly low cards." Le Patron stays silent and teaches only through his ledger line.
- **Keyword hovers** in the hint, tally and tags: rule words get a dotted underline and open their Fiche.

## 8. Rebuilding the DOM screens on canvas

Each rebuilt screen keeps the scene as its backdrop and the frame zones live. Order:
1. **Pack rip on the zinc.** Cards physically fly to the Étui or the Classeur.
2. **Draft rows on the felt**, with "Keep these 3/3" in the corner slot.
3. **Binder and grading** as bifold pages, with Sell and Ship in the action stack.
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
7. Final bifold art, the unfolding animation and sounds. Rules paper art: the crumpled ball, the uncrumple frames and the sheet.

Demo day (Fri Nov 20) is fixes only, so anything from steps 4–7 that isn't in by Thursday night waits.

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
export function drawDrawer(g: CanvasRenderingContext2D, v: MatchView, t: number): void  // peek on the left edge, or the open bifold
export function drawerHit(x: number, y: number): Tab | null
export function openDrawer(tab: Tab, compare?: Compare): void; export function closeDrawer(): void
export function drawerKey(key: string): boolean                     // D/B/S/V/?/Esc, true if handled
export type Compare = { offers: Card[]; dest?: 'deck' | 'binder' }   // compare mode docks the bifold small beside the offer
```
**Rules paper**, `src/ui/rules.ts`: `drawRules(g, v)`, the same sheet the carnet's Hands tab renders.

**Compare helpers**, `src/engine/compare.ts`. Pure.
```ts
export function deckDelta(deck: Card[], add: Card[]): { suit: Record<Suit, [number, number]>; rank: Record<number, [number, number]>; lines: string[] }
```

**Who owns what during the build.** Parallel agents work only in their own files. Wiring into `duel.ts`, `shop.ts` and `main.ts` happens serially, by the integrating session.
- **Engine + content agent:** `src/engine/glossary.ts`, `compare.ts`, the §10 content changes, sim runs, DESIGN.md
- **Fiche agent:** `src/ui/fiche.ts`, `richText` in `font.ts`, `.fiche` CSS
- **Drawer agent:** `src/ui/drawer.ts`, `src/ui/rules.ts`, their placeholders
