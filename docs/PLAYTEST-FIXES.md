# Playtest fixes (Nov 20)

Evan's notes from a full playthrough, traced to the code, with a fix and an order for each. Wins over UX.md, DUEL.md and ONBOARDING.md where they disagree, until those are updated to match.

Sizes: **S** is under an hour, **M** is a few hours, **L** is a day or more.

## 0. Done when

- A new player goes title → pick a box → toss a row → first deal, one click each.
- Every sentence of help text lives in one place. Nothing says the same thing twice on screen.
- The game fills the screen with no black bars at common aspect ratios, and fullscreen is one click away.
- The camera holds still at the table and only moves on a big beat.
- The rival takes visible time over every decision.
- Boss rounds sound like a different place within one bar.
- Choosing cards (pack sort, spoils, shop) uses the carnet booklet, not the side dock.
- Tickets, the sort control and the top bar are final art.

## Status (Nov 20)

Done: 1.1 box, 1.2 toss a row, 1.3 the table hints and panel help (tips untouched), 1.4 parts 1 and 3 (fill by default, crisp only when it keeps 90% of the screen, fullscreen on the first run of a visit), 1.7 rival think time, 1.12 camera. Next: 1.5, 1.6, 1.10, 1.13, 1.14, 1.11, 1.8, and 1.4 part 2 (bleed into the bars).

## 1. The notes, traced

### 1.1 A box opens into 3 more boxes (M, with 1.2)

**What happens:** `starterPanel()` in `src/main.ts:708` shows one sealed box ("Open your starter box"). Ripping it reveals a tray of 3 starter boxes to choose from (`v().me.draft.offer`). Then you pick one and go to the row draft. So it's a box inside a box, then a draft: three steps before a card.

**Fix:** drop the outer sealed box. The 3 starter boxes sit on the tray from the start. Hover one for its Fiche (deck and twist), click it, and *that* box gets the rip animation the sealed box has now (shake, tear, lid lifts). The cards fan out of it as your deck. The sealed-box sprites (`sealed`, `sealed-tear-*`, `sealed-base`, `sealed-lid`) get reused per box, tinted or redrawn per starter.

### 1.2 The row draft: keep it, make it one click (M)

**What happens:** `draftPanel()` (`src/main.ts:817`) deals 4 rows of 6 with the first 3 already picked, and you toggle rows until 3 are on. Toggling "keep" on rows that start kept is backwards, and it reads like a chore.

**Decision (Evan, Nov 20):** the draft stays, done smarter. You **toss one row** instead of keeping three:
- The rows deal out of the box you just opened, none picked. Each row shows its label (`rowLabel`: what it leans toward).
- Click a row and it lifts off the felt with a burgundy "toss" stamp. Click another and the toss moves. The other 18 cards are your deck.
- One button, "Toss it", sweeps the tossed row off the top and the rest into your pile.
- Same engine action (`draft` with the 3 kept rows), so no engine, sim or balance change.

### 1.3 Duplicate helper text (M)

**What happens:** one rule is said in up to four places at once. The places are the Fiche on hover (`src/ui/fiche.ts`), first-encounter tips (`src/ui/tips.ts`), the hint column above the tickets (`colText` in `src/ui/duel.ts:2143`, filled by `dealSlips` / `renderTable` in `src/main.ts`), panel `help:` lines, and the announcement band. Examples:

| Where you are | Said by | Duplicates |
|---|---|---|
| Betting | hint column: "Max: …" (`main.ts:1589`) | `max` tip + Max ticket's Fiche |
| Picking cards | hint: "Play scores them. Flamber: …" (`main.ts:1527`) | `flamber` tip + Flamber ticket's Fiche |
| Spoils | hint: both spoils rules (`main.ts:1591`) | announce band "Le butin" says rule 1 again |
| Pack sorted | panel help "Click a card to switch its pile" (`main.ts:941`) | `deckbinder` tip says the same |
| Your hand readout | `preview` tip (`duel.ts:1605`) | the readout itself + its Fiche |
| Draft | panel help "Keep 3 rows…" | goes away with 1.2 |

**Fix:** one home per sentence, per UX.md §2 "One home per thing":
- **Fiche:** the rules. Always there on hover.
- **Tips:** first time only, and only where the Fiche isn't enough (where to click, not what it does).
- **Hint column:** only state you can't see elsewhere: why a ticket is off, whose turn it is, what's pending. Never a rule.
- **Announcement band:** events, never rules.
- **Panel help:** gone, except one verb line where the panel would be unclear without it.

Do an audit pass: list every `hint`, `help:`, `tip(` and `announce` string, mark its home, delete the rest. One commit.

### 1.4 Black bars, not fullscreen (S)

**What happens:** the stage is a fixed 640×360. `stageScale()` (`src/ui/prefs.ts:108`) defaults to `crisp`, which floors to a whole number. On 1920×1080 that's fine (×3), but on 1366×768, 1440×900, 2560×1600 or any browser window with toolbars it drops a whole step and leaves wide bars on every side. Fullscreen exists (F, pause menu) but nothing offers it.

**Fix:**
1. Default `scale` to `fill` (fit, no floor). Crisp stays as an option for purists. Bars are then only the aspect mismatch.
2. Bleed: the scenes draw their background past the stage edge into the bars (room wall and felt in the duel, the tabac wall in the shop, the street in the title) so a 16:10 or ultrawide screen shows more room instead of black. HUD stays inside the 640×360.
3. First click on the title's Play requests fullscreen (it's a user gesture, so the browser allows it), with "Fullscreen: On/Off" remembered in prefs.

### 1.5 Pack opening goes into a "wacky selector mode" (M)

**What happens:** after the last flip, `packPanel()` (`src/main.ts:915`) sets `settled`. The cards turn into toggle buttons tagged Deck/Binder, the compare dock slides in from the side, two piles appear at the bottom corners, a tip and a help line show up, and the button changes from "Reveal all" to "Done". It's a mode switch with no motion to explain it.

**Fix:** make the sort physical. After the reveal, the cards slide on their own into two rows on the zinc: **Deck** on the left, **Binder** on the right (by `defaultToDeck`). Click a card and it slides across to the other row. "Done" sweeps each row into its pile. The booklet (1.6) opens to the deck page beside it instead of the dock. No tags on the cards: the row they're in is the tag.

### 1.6 The side dock when choosing cards → the booklet (L)

**What happens:** compare mode (`src/ui/drawer.ts:981`, UX.md §5) docks a small panel beside an offer: deck counts by suit, ghost cards, "if you take it". It shows up in pack sort, spoils and the draft.

**Fix:** compare uses the carnet itself. When you're choosing, the carnet swings open half way on the side, at the Étui (deck) page, and the hovered card ghosts into the page where it would go. It's the same book you open from the corner, so there's one way to look at your deck. Then rework the pages themselves (Evan to list what's wrong inside; see §3).

### 1.7 The rival acts instantly (S)

**What happens:** `runBots()` (`src/main.ts:165`) waits only on bets (700–1200 ms think, 1000 ms after). Plays, discards, Flamber, spoils picks and shop actions happen the moment you're done.

**Fix:** a think beat before every rival action, solo only (online players have real timing):
- Picking cards: 900–2200 ms, the rival's hand shuffles, a card lifts and drops, a "…" bubble.
- Discard: the discarded cards slide off their side.
- Bet: keep today's, add ±300 ms jitter.
- Spoils: 800–1500 ms, their hand hovers over the cards.
- Longer when the call is close (a Max into a big pot), shorter when it's obvious.
- All skippable (click/space), scaled by game speed (`pace()`), and `Math.random` is fine here since it's UI, not engine.

### 1.8 Boss music isn't distinct enough (M, music-lab)

**What happens:** bosses switch to La Fée Verte, a mix of the same song with the same tempo and form (`docs/MUSIC.md` §5, `src/ui/music.ts`). The lost-run screen uses it too, so it isn't even boss-only.

**Fix:** bosses get their own arrangement that you'd notice in one bar:
- Same chord roots so it still syncs, but **half-time or double-time drums**, a **different key center** (up a minor third), and a **new lead line**: a counter-melody, not the Gnossienne tune.
- An **intro sting** when the twist sign drops (organ stab + timpani roll), then the boss loop enters on the bar.
- La Fée Verte stays for the lost run. Bosses get a fourth file, `boss.ogg`.
- Built in Evan's music-lab per MUSIC.md §7. Its own session.

### 1.9 Collectibles trigger (done, keep an eye on it)

**Evan, Nov 20:** they do show their triggers (`caseShelf()` / `caseFired()` in `src/ui/duel.ts`). No work, beyond moving the shelf if 1.10 changes the top-left.

### 1.10 Roll Table and round into the top middle bar (M)

**What happens:** the run strip (`src/ui/frame.ts`, "Table II · Manche 5" + the twist line) is a paper plate at top-left. The hand track (`handTrack()`, `duel.ts:1725`: "Main 2/3", pips, score, K.O.) is a separate plate at top middle. Evan's note was cut off after "which also needs"; assume it needs a redesign (§3).

**Fix:** one bar, centered at the top, in both scenes:
`Table II · Manche 5   |   Main 2/3 ● ○ ○  1–0   |   K.O. 8×`
- The twist moves into the bar as a burgundy tag on the right on boss rounds and when the next round is a boss. Hover for its Fiche.
- In the shop the bar shows Table/Manche and the next twist only.
- A real sprite: a brass-edged plaque, not a nine-sliced paper strip.
- `runStrip` and `handTrack` become one `topBar()` in `frame.ts`.

### 1.11 The old sleeve icon is still there, and the tickets look bad (M art + S code)

**Sleeve icon:** `art/duel/sprites/icon/sleeve.png` is in the atlas and nothing in `src/` draws it by that id. The one Evan saw is likely the rival's insert backs by their plate (`duel.ts:1692`) or the shop's Sleeve prop. Pin it down with a screenshot, then delete the sprite and its caller.

**Tickets:** `ticket()` (`duel.ts:2106`) nine-slices one plain `hud/ticket/face` and `plinth` and tints them per kind. They read as flat colored rectangles.

**Fix:** draw real tickets: a raffle ticket with a perforated stub on the left (the icon lives there: flame for Flamber, card for Play, bin for Discard, chip stack for Min/Max), serrated ends, a printed number, and the label in the chalk font on the body. Four states as sprites: idle, hover (lifted and tilted), pressed (stub torn), disabled (greyed with a strike). **Someone already has uncommitted work in `art/duel/sprites/hud/stub/`**, so check with that session before starting.

### 1.12 Camera sways at the table (S)

**What happens:** `draw()` (`duel.ts:896`) drifts the whole world layer all the time (±2 px x, ±1 px y, a small rotation) and scales it 1.01 to hide the edges.

**Fix:** remove the constant drift. The camera only moves on beats: the reel push-in that's already there, the call-out impact, a ★3 Flamber shake, a knockout, the bust. Life comes from things in the scene instead: the crowd sway (already there), the lamp swing, smoke, the rival breathing, card idle bob, a fly on the lamp. Drop the 1.01 scale when nothing's moving.

### 1.13 The Flamber animation (M)

**What happens:** `forgeReturn()` (`duel.ts:1180`) plays a 1 s beat on the near row only after the showdown settles: the cards melt top-down with small flame sprites, Bulk cards drop, then the ★ card drifts right at 0.7 scale and vanishes. It's small, late and doesn't say where the new card went.

**Fix (ART.md §12):**
1. The moment you lock Flamber, not at the reveal: your cards slide to the center of the felt and overlap.
2. They burn together: flame flipbook along the bottom edge, palette-ramp tint to char, embers rising.
3. A flash, then the ★ card rises big and center with its stars ringing in one at a time (`sfx.stars`), holds 600 ms with its Fiche open.
4. Bulk cards drop out of the smoke onto your pile.
5. The ★ card flies to where it goes (your pile, drawn next hand) and the pile bumps.
6. Click to skip; reduced motion shows step 3 only.

Check what Evan saw first (`/?quick&wild` gets to a Flamber fast), in case something is actually broken and not just weak.

### 1.14 Rank and Sort need polish (S)

**What happens:** `sortTabs()` (`duel.ts:1833`) is a tiny "Sort" label over two 34×15 paper tabs, "Rank" and "Suit", at the right of the hand.

**Fix:** one chip beside the hand with two icon halves (A K Q for rank, ♠♥ for suit), the active half lit gold. Cards slide to their new spots instead of snapping. R toggles it. A real sprite, not a tinted paper slice.

## 2. Plan

Grouped so sessions don't edit the same files at once. `src/main.ts` and `src/ui/duel.ts` are the hot files, so each has one owner at a time.

| # | Batch | Notes | Files | Size | Parallel? |
|---|---|---|---|---|---|
| 1 | **Quick wins** | 1.12 camera, 1.4 screen fit, 1.7 rival pacing | `duel.ts` (draw), `prefs.ts`, scene `resize()`s, `main.ts` (runBots) | S each | first, one session |
| 2 | **Start of run** | 1.1 box, 1.2 toss a row | `main.ts` (starter/draft panels), DESIGN.md | M | after 1 |
| 3 | **Helper text audit** | 1.3 | `main.ts` hints, `tips.ts`, `duel.ts` colText, panels | M | after 2 (the draft text goes away there) |
| 4 | **Choosing cards** | 1.5 pack sort, 1.6 booklet compare + pages | `main.ts` packPanel, `drawer.ts` | L | after 2 (both touch main.ts) |
| 5 | **Table HUD** | 1.10 top bar, 1.13 Flamber, 1.14 sort | `duel.ts`, `frame.ts`, `shop.ts` (bar only) | L | alongside 4 (different files) |
| 6 | **Ticket and HUD art** | 1.11 tickets, sleeve icon, the top bar plaque, the sort chip | `art/duel/*`, `ticket()` in duel.ts | M | art alongside 5, code lands with 5 |
| 7 | **Boss music** | 1.8 | music-lab, `public/music/boss.ogg`, `music.ts`, MUSIC.md | M | any time, its own session |

Batches 5 and 6 share `duel.ts`, so the code half of 6 goes through whoever owns 5. Batch 7 touches nothing else.

Every batch: typecheck, tests, a full `/?quick&auto` run with no console errors, screenshots of what changed, docs updated in the same change, and one focused commit per note (Nudox judges the history).

## 3. Open questions for Evan

1. **The top bar note was cut off** ("which also needs…"). Needs what?
2. **Inside the booklet:** what's wrong with the pages today? The layout, the art, what's on each tab, or all of it?
3. **The Flamber animation:** is it broken (something wrong happens) or just weak?
4. **The old sleeve icon:** where on screen? A screenshot pins it in one step.
