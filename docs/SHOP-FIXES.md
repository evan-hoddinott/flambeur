# Shop fixes (Nov 20)

Things Evan hit in the tabac and around it, what causes each one in the code, and the fix. Where this file and SHOP.md / UX.md / TUTORIAL.md disagree, this file wins, and the change that builds it updates those docs to match.

| # | Problem | Fix in one line |
|---|---|---|
| 1 | After a pack's cards flip, they snap into a flat row that's blurry and dead | Keep the fan, draw cards at 1× with smoothing off, deck cards ride high and binder cards sit low |
| 2 | Nobody sees that the scratcher strip on the register is something you can buy | Scratchers sit on the shelf as a full-size offer, like packs and collectibles |
| 3 | Selling from the binder closes the carnet and opens a second binder sheet | Pick and sell right on the carnet's Classeur page |
| 4 | The grading sheet runs off the bottom with a big deck + binder | Pages of 32 cards, a Deck / Binder filter, wheel and arrow keys turn pages |
| 5 | No obvious way to replay the tutorial | Rename the hidden "First run" ticket to "Tutorial" and add a Tutorial ticket on the title |
| 6 | Starting the tutorial from inside a run soft-locks you | Reset all the run's UI state when any run starts |
| 7 | Opening a starter box: the rows are blurry and flat, and the tossed row looks bad | Cards at ½× with a 1× hover pop, and the tossed row slides off the felt instead of being stamped |

The rule behind #1, #4 and #7 is in §0. Read it first.

## 0. The card size rule

Card art is 64×88 pixel art. Every card on screen is drawn at **1× (64×88)** or **½× (32×44)**, at whole-pixel positions. No other sizes.

- **1×** is drawn with smoothing off, rotated or not, like the duel hand.
- **½×** is drawn with smoothing on. Halving averages exact 2×2 blocks, so it stays clean. Any other ratio (57.2, 48, 40, 39, 34) smears pixels across each other, and that's the blur Evan sees.
- A ½× card that you hover **pops to 1×** above its spot (springs up, drops a shadow), so small grids still feel like real cards you can pick up. This is what makes the binder, grading, wish and draft grids feel alive.
- **Enforce it in one place.** `drawCard()` in `src/ui/panels.ts:190` rounds `x` and `y`, picks smoothing from the size, and **throws** on any `w` other than 64 or 32. That's the fail-loud rule, and it catches the next fractional card. Today's callers pass 40 (binder, wish), 34 (grading), ~39 (draft) and ~48–57 (pack). They all move to 32 or 64.
- **Share the duel's card look.** Pull the duel's card drawing (`drawCard()`, its finish sheen, `shadow()`, `centered()` in `src/ui/duel.ts:1387`) into a small `src/ui/held.ts` that the duel, the pack rip and the ½× hover pop all call. That gives every card the foil/holo/prism sheen and the drop shadow. Keep it one function with a few options, not a framework.

## 1. The pack rip goes blurry and flat

### What happens

`packPanel()` in `src/main.ts` (line ~981) has two ways of drawing a card:

- **While the cards flip** (`!p.settled`), it draws them itself with `g.drawImage(...)`, rotated in a fan. The shop canvas has `imageSmoothingEnabled = false` (`resize()` in `src/ui/shop.ts`), so they're crisp.
- **Once the last card lands** (`p.settled`), it switches to `ui.card(...)`, the panel's flat card. That's where it goes wrong:
  1. **Smoothing turns on.** `drawCard` sets `g.imageSmoothingEnabled = true` and scales the 64×88 art to `w`. That's the blur. It isn't missing anti-aliasing, it's the opposite: pixel art resampled by a fractional factor.
  2. **The size is fractional.** `w = Math.min(64, (box.w - 12) / cards.length - 4)`. A 5-card pack in the normal sheet gives 57.2 px.
  3. **The size jumps at settle.** `docked: p.settled` swaps the sheet from `SHEET` (334 wide) to `DOCKED_SHEET` (288 wide) the same frame, so `w` drops from ~57 to 48 and every card shrinks and reflows.
  4. **The positions are fractional.** The cards chase their group with `at.x += (slot(c) - at.x) * ease` and are drawn at that float x, so they shimmer while they slide.
  5. **The life goes.** The fan's tilt goes to 0, hover is a 2 px lift and a cream box, and there's no finish sheen, no shadow and no spring. The duel's hand (`hand()` in `src/ui/duel.ts:1600`) has all of that, so the pack feels like a form after it.

### The fix

The comment above `packPanel` already says what it should be: *"flip each pull, then raise the ones that go in your deck. the rest go to the binder."* Build that.

**Keep the fan after settle.** The cards stay where they flipped, in the same arc and tilt as the duel hand. There's no reflow into two groups.

- **Deck or binder = high or low.** A Deck card rides up ~18 px, like a selected card in the duel. A Binder card sits low with the small `shop/binder` mark under it. Click a card to toggle it, with the duel's spring and pop (`juiced`). The default split is still `defaultToDeck`.
- **The labels follow the cards.** A `Deck · 3` label rides over the raised cards and `Binder · 2` sits under the low ones. Drop the divider line and the left/right groups. The two piles at the sheet's corners (`pilesY`) stay as where the cards fly on Done.
- **Hover** lifts and scales the card a little (s 1.04, like the duel). The Fiche and the compare dock work as now through `onCardHover`.

**1× the whole way.** The flip, the settle and the fly-out all use 64×88 (times `stockScale` for jumbos), with rounded positions. A 5-card fan at 64 px overlaps a little, the same as the duel hand, so it fits the sheet without shrinking.

**Don't resize at settle.** Open the compare dock when the cards settle, but keep the fan's size. `packPanel` draws the fan itself, not inside the sheet box, so it doesn't need to move. If the dock covers the left of the fan, slide the whole fan right once with a spring.

### Done when

- Rip a pack in `/?quick&shop`: no visible softening at any point from rip to Done, at the browser's 100% and 150% zoom.
- The cards never change size or jump when the last one lands.
- A holo or foil pull shimmers in the fan the way it does in the hand.
- Clicking a card moves it up or down with a spring, and the Deck/Binder counts update.

## 2. Scratchers on the shelf

### What happens

Players don't realize the scratcher is for sale.

- `offerLayout()` (`shop.ts:816`) filters scratchers out of the offer row. `registerTickets()` (`shop.ts:790`) draws them as **40×19 paper strips** lying by the register at (410, 151). They have a price in sans, but no tilt, no reflection, no shelf light and no VENDU.
- Next to 72×104 packs on a lit shelf, a little strip on the counter reads as set dressing.
- The fée's scratcher lesson (`teach('scratcher', ...)`, `shop.ts:1087`) points at that strip's hard-coded box.

SHOP.md §2 always had scratchers in the offer row ("packs · collectibles · scratchers · sleeve"), and the full-size `shop/scratcher` 72×104 sprite is already in the atlas. The register strip was a stopgap.

### The fix

**On the shelf.** Drop the `filter(... !== 'scratcher')` in `offerLayout`, so scratchers take their group in `slotOrder` between the collectibles and the pochette. They get the same hover tilt, reflection, contact shadow, price tag, Fiche and VENDU as every other offer. `offerArt()` already returns `shop/scratcher` for them.

- **Delete `registerTickets()`.** Keep the paper roll on the register as set dressing, and stop it tearing when you buy (the tear beat is for a ticket coming off the roll, which no longer happens).
- **Buying** works the way SHOP.md §7 first described: the ticket **lifts off the shelf and grows into the close-up**. The rub, the jeton cursor, the stamp and the Grail beat all stay as they are. The close-up's open animation starts from the shelf slot (`shelfCenter(offers, slot)`, like `packShelfX` does for packs) instead of from the register roll.
- **The spent ticket** shrinks back into its shelf slot, scratched, under VENDU, until you leave or restock. That replaces the pile by the register (`spentPile()`).
- **The fée's lesson** points at the scratcher's shelf box, from `offerLayout`, not at (410, 151).
- **Shelf room.** The big shop now has 3 packs + 3 collectibles + 2 scratchers + a pochette = 9 slots. `offerLayout` already squeezes gaps first, then slot widths, when the row is too wide. Check that 9 still reads at `/?quick&big`. If it's too tight, two scratchers share one slot, fanned like a tear-off pair, with one price tag and a ×2.

### Done when

- In `/?quick&shop` the scratcher sits on the shelf at full size and reads as a thing for sale, next to the packs.
- In `/?quick&big` both scratchers are on the shelf, and nothing overlaps the plate or the bifold.
- Buying one opens the same close-up from where it sat, and its spent ticket ends up back in its slot.
- In `/?first&shop` the fée's scratcher lesson points at it.

## 3. Sell from the Classeur page

### What happens

The carnet's Classeur page (`classeur()` in `src/ui/drawer.ts:756`) shows the binder, but its **Sell** button calls `actions.sellBinder`. In the shop that's `closeDrawer(); binderOpen = true` (`main.ts:1309`), which flies the carnet away and opens `binderPanel()`, a second binder in a panel sheet, to pick and sell there. That's two binders for one job.

The Vitrine page already sells in place (`actions.sellCollectible`), so the pattern exists.

### The fix

**Pick and sell on the page, in the shop.** When `actions.sell` is set (shop only), the Classeur page works like this:

- **Click a card** to pick it. A picked card lifts 3 px with a steady gold outline, the same `outlineRect` STONKS uses.
- **Every card shows its price** in a tiny tag under it while the page is in the shop. Hot STONKS cards keep their ×2 chit.
- **The right leaf** gets a green `Sell 3 · +$14` button above the hovered card's detail, plus `Select all` / `Clear` chips. With nothing picked, the button reads `Sell` and is disabled.
- **Selling** dispatches one `sell` per card, as `binderPanel` does now. The carnet stays open, and the shop's `sales()` beat and coin sound play behind it. The buraliste's "Mouais." still plays.
- **Outside the shop** (the duel), there's no `sell` action, so the page stays read-only with today's "Sell from it at the shop." line.

**New `DrawerActions`** replace `sellBinder`:

```ts
sell?: (cardIds: number[]) => void
sellPrice?: (card: Card) => number // main.ts's sellPrice(), the same math as the engine's binderPrice
canSell?: (cardId: number) => boolean
```

The picked set lives in `drawer.ts` and clears when the tab changes or the drawer closes.

**Album:** keep the Album button where it is. It still opens the Album panel, which is a different thing (every card ever pulled), not a second binder.

**What goes:** `binderPanel()`'s sell mode, `binderPicked`, and the `binderOpen` path for selling. The `classeur` bookTour line changes to "Pick cards on this page and sell them, here in the shop."

**Big binders:** past 15 cards the page drops to 32×44 cards (§0), with the 1× hover pop. Past 28 cards (4 rows of 7), it uses the pager from §4 instead of overlapping further.

### Done when

- In `/?quick&shop` with a few binder cards: open the carnet, Classeur, pick two, Sell. The money counts up, the cards leave the page, and the carnet never closes.
- In the duel the Classeur page has no Sell and no picking.

## 4. The grading sheet pages

### What happens

`gradingPanel()` (`main.ts:1472`) lists every card you could ship: `[...me.pile, ...me.discard, ...me.binder]`. It lays them out with `grid()` at 34 px wide under the three shipper plates.

- The sheet has room for about 4 rows of 8 = **32 cards**.
- A 24-card deck plus a binder of 15 is already 39, and by Table 3 it's often 50+.
- `grid()` never clips, so the extra rows draw off the bottom of the sheet and can't be clicked.

`wishPanel()` (a binder grid at 40 px) has the same bug with a big binder.

### The fix

**A pager in `src/ui/panels.ts`.** It's one function plus a Panel field, not a scroll framework:

```ts
// a page of a grid: which items show, and the ‹ 1 / 3 › control under them. returns the visible slice's indices
export function paged(ui: Ui, n: number, box: Box, w: number, page: number, turn: (page: number) => void): { at: { x: number; y: number }; i: number }[]
```

- **Per page** = as many whole rows of `w` as fit in `box`, minus 14 px for the control.
- **The control** is `‹  2 / 3  ›` in sans, centered under the grid, with the arrows as hit boxes. It's hidden when everything fits on one page.
- **Turning a page** plays the carnet's `page` sound.
- **The mouse wheel** and **← / →** also turn the page. Add an optional `onWheel(dy)` to `Panel` and call it from a wheel listener on the scene canvas. None exists yet, so add `cv.addEventListener('wheel', ...)` in `showShop` (and in the duel scene for the draft). Handle ← / → in `panelKey`.
- **The page clamps** when the list shrinks, after a ship or a sell.

**Grading uses it:**

- **Cards at 32×44** with the 1× hover pop: 8 per row, 4 rows = 32 per page.
- **A filter:** `All · Deck · Binder` chips on the help line, defaulting to All. Binder cards stay in the list, because they're worth grading for the Collector shopkeeper's 2× sell.
- **Order:** special cards first (finish, stamp, tier, variant), then by rank, high to low. Today it's pile order, which looks random.
- **Tags:** with the filter on All, each card wears a tiny `deck` / `binder` tag.

**The wish panel** uses `paged()` too, at 32 px.

### Done when

- A run with 45+ shippable cards (a late big shop in `/?quick&auto`) shows `‹ 1 / 2 ›`, and the wheel, the arrow keys and clicks all turn the page.
- Nothing draws past the sheet's bottom edge.
- Shipping a card from page 2 works, and the sheet closes as now.

## 5. Tutorial from the menu

### What happens

It already exists, but nobody can find it:

- The Settings sheet (`src/ui/pause.ts:486`) has a nav ticket labeled **"First run"**, both on the title and in a run. It calls `hooks.firstRun()`, which abandons any run and starts `firstRun()`: the seeded run with la fée, `resetTips()`, `setGuide(true)`.
- "First run" doesn't say tutorial, and it sits in the grey stack at the foot of the nav, under Abandon.
- The title's solo row (`title.ts:856`) has Daily, Random seed and Play seed, but no tutorial. `random` only routes to the tutorial if you've never finished it (`firstRunDone()`).

### The fix

- **Rename** the pause ticket to **Tutorial**. Its receipt reads "La fée verte walks you through a run, start to finish." In a run it keeps the "Sure? Again" double press, and the receipt adds "This run is lost."
- **On the title,** add a `Tutorial` ticket to the solo row, a secondary ticket after Random seed, that calls `firstRun()`. While `firstRunDone()` is false, it's the primary instead, so a new player sees it first.
- **The carnet's Rules tab** already has the How to play pages (TUTORIAL.md). Add one line at the foot of its first page: "Want the guided run? Settings → Tutorial."
- **French label:** add `Tutoriel` to the word table in `src/ui/lang.ts`.

### Done when

- From the title, both Settings → Tutorial and the title's Tutorial ticket start the seeded run with la fée from hand 1.
- From mid-run, Esc → Tutorial → Sure? Again starts it and drops the run. See §6 for the soft lock this must not hit.

## 6. The tutorial soft-locks when started from a run

### What happens

The pause hook does `if (match || online) abandonRun(); firstRun()` (`main.ts:591`). `abandonRun()` and `startRun()` reset the match and a list of flags, but **not the UI state that lives beside the match** at the top of `main.ts`:

| Left over | What it breaks |
|---|---|
| `selected` (the cards you'd picked) | **The soft lock.** The tutorial's forced first hand (`lessonNow()`, `main.ts:1589`) spotlights only the cards it wants, and the spotlight eats every other click. Old ids from the abandoned run are still in `selected`. Play's `can({ type: 'play', cardIds: ids })` fails on cards that aren't in your hand, or there are more than 5. So Play stays disabled, and you can't click anything else to fix it. |
| `insertSlot`, `grindPick` | The deal opens in insert mode or the grind pick, which the tutorial's slips don't expect |
| `lastLocked` | The old run's locked cards can show in the new run's first fold/forge result |
| `scratchShow`, `gradeOpen`, `binderOpen`, `binderPicked`, `wishSlot`, `albumOpen`, `overflowOpened` | The first shop of the new run opens on the old run's grading sheet, binder or scratch |
| `shop.ts`: `lotto`, `purchases`, `restockBeat`, `parcel`, `sale`, `spent`, `dossierOpen` | Old shop beats replay in the new shop |
| `duel.ts`: springs keyed `card${id}`, the fée's last `spot` in `tips.ts` | New cards reuse old ids (every match counts ids from the same start), so they spring from the old cards' spots. A stale spotlight can eat the first click |

The same leak hits Abandon run → Daily, or any second run in one page load. It shows up in the tutorial first because the spotlight turns a wrong state into a dead end.

Card ids starting from the same number in every match is also why "it doesn't start a new game" can look true: the new hand's first cards spring in from where the old ones were.

### The fix

- **One `resetRunUi()`** in `main.ts` that sets every ui-only `let` under `// ui-only state` back to its starting value. `startRun()` calls it, so every way into a run (tutorial, daily, random, seed, quick) starts clean. `abandonRun()` calls it too.
- **`resetScene()`** exported from `shop.ts` and `duel.ts` clears their module state (above) and the spring map. `resetRunUi()` calls both. `tips.ts`'s `setGuide()` clears `spot`.
- **Fail loud:** in `lessonNow()`, if `selected` holds an id that isn't in `me.hand`, throw. A stale pick should crash in dev, not soft-lock in the demo.
- **The tutorial's own escape hatch:** the fée's `Skip tutorial` link is already under her bubble. Make sure it's never inside the spotlight's dark area, so it stays clickable even if a lesson ever gets stuck.

### Done when

- Repro first, before the fix: `/?quick`, pick 3 cards in the hand, Esc → First run → Sure? Again. Confirm Play stays disabled under the fée. If it doesn't reproduce, try the same from mid-shop and mid-bet, and note which path locks.
- After the fix, the tutorial starts clean from each of these: the title, mid-deal with cards picked, mid-bet, mid-shop with the grading sheet open, and mid-scratch.
- Abandon run → Daily starts with nothing picked and no panel open.

## 7. Opening a starter box

### What happens

The starter box opens and deals its 4 rows of 6 onto the felt (`draftPanel()`, `main.ts:873`).

- **The same blur as the pack.** `w = Math.min(40, ..., (rowH - 13) * 64 / 88)` comes out around 39 px. While dealing, the cards are drawn with `ui.g.drawImage(cardCanvas(c), dx, dy, size, CARD_H(size))` at fractional `dx`/`dy`/`size`. Once they land, they go through `ui.card` with smoothing on. Both are non-integer scales of 64×88, so both are soft (see §0).
- **Flat and still.** No tilt, no sheen, no hover beyond 1 px. You're looking at the 24 cards that become your deck, and they feel like a spreadsheet.
- **The tossed row is ugly.** Clicking a row:
  - dims its cards to 45% alpha (grey mush over the felt)
  - turns its label salmon (`#e07a6a`, not a palette color) as `Tossed · ...`
  - stretches the 19×11 `hud/stamp/discard` sprite to about 72×57 over the row with `fit()`, a ~3.7× non-integer upscale that comes out chunky and lopsided

### The fix

**Cards at ½× (32×44), whole pixels, with the 1× hover pop (§0).**

- Four rows of 32×44 plus labels need ~228 px, which fits the docked sheet with room to spare.
- **Rows slide, cards don't shrink.** The deal animation flies cards at 1× from the box and settles them to ½× in one step on landing, never through in-between sizes. Or, simpler: deal them at ½× from the start.
- **Hover a row** and it lifts 2 px together, with its label going cream. **Hover a card** and it pops to 1× with the Fiche, as everywhere else.

**The tossed row leaves the felt instead of being stamped.**

- Clicking a row **slides it down and off the felt edge** with a spring and tilts each card a little, as if pushed off the table. It sits half off-stage at the sheet's bottom edge as a face-down stack of 6 (`backCanvas` at ½×) with a small `Tossed` tag in the palette's red (`#a82a38`, outlined).
- The three kept rows **close the gap** with a spring, so what you see is exactly your deck: 3 rows, 18 cards.
- **Clicking the tossed stack** (or any other row) swaps them, with the same springs.
- **Cut** the 45% dim, the salmon label and the stretched `hud/stamp/discard`. If Evan wants a stamp, it's drawn once at 2× (38×22, integer) on the stack, not stretched over a row.
- **"Toss it"** stays the button. The sweep animation (`sweepAt`) now starts from the stack.

### Done when

- Open any starter box from the title: the dealt cards are sharp at every moment of the deal.
- Hovering a card pops it to full size with its Fiche.
- Tossing a row slides it off and the other three close up. Swapping rows is smooth. The salmon text and the stretched stamp are gone.

## Order and ownership

Each one is its own commit. They touch these files:

| # | Files | Commit |
|---|---|---|
| 6 | `main.ts` (`resetRunUi`), `shop.ts` + `duel.ts` (`resetScene`), `tips.ts` | `runs: every run starts with clean ui state, no tutorial soft lock` |
| 5 | `pause.ts`, `title.ts`, `main.ts` (title state), `lang.ts` | `menu: a tutorial ticket on the title and in settings` |
| 0 | new `src/ui/held.ts`, `duel.ts` (uses it), `panels.ts` (1×/½× rule, hover pop) | `cards: one card renderer, 1× or ½× only, a 1× pop on hover` |
| 4 | `panels.ts` (paged, onWheel, ←/→), `main.ts` (grading, wish), `shop.ts` (wheel listener) | `grading: pages, a deck/binder filter, specials first` |
| 3 | `drawer.ts`, `main.ts` (actions, drop the sell panel) | `binder: pick and sell on the classeur page` |
| 1 | `main.ts` (packPanel) | `packs: the rip stays a crisp fan, deck cards ride high` |
| 7 | `main.ts` (draftPanel), `duel.ts` (wheel listener if needed) | `starter box: sharp rows, the tossed row slides off the felt` |
| 2 | `shop.ts` (shelf scratchers, close-up from the slot) | `scratchers: on the shelf with the other offers` |

Do them in that order. #6 first, because it's a demo-breaking bug and small. #0 before #1, #3, #4 and #7, because they all use it. Nearly every one touches `main.ts`, so **one session at a time on `main.ts`**: split the work by order, not by parallel sessions.

For each one:

- Check it in the browser preview with `/?quick`, `/?quick&shop`, `/?quick&big` and `/?first&shop`. The fée's lessons (`rip`, `deckbinder`, `binder`, `shippers`, `scratcher`) must still point at the right things after their UI moves.
- Check the console for errors.
- Run `pnpm build`.

None of these change the engine or a rule, so there's no sim run and no DESIGN.md edit. In the same commits, update:

- **SHOP.md** §2 and §7: scratchers on the shelf, and the close-up opens from the slot.
- **UX.md:** the Classeur sells in the shop, and the card size rule.
- **TUTORIAL.md:** where the replay lives.
