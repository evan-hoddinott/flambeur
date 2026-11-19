# Flambeur: readability and interactables

How the player tells what they can press, and how we make that as instant as Balatro. This doc **amends `docs/ART.md` §13 (UI)**. Where they disagree about buttons, this doc wins.

Nov 17 2026, after the first pass of the pixel-art duel scene and fonts. **Built the same day**, and the numbers below are the tuned ones. Hex values are from the master palette (`art/palette/flambeur.gpl`) unless marked. Tune on screen, then update this file.

---

## 1. The problem

The duel scene looks right but it doesn't read right. In the first build:

- **Buttons blend in.** The betting slips are cream paper (`hud/slip`) with thin ink text. Cream paper is also what the plates, the tally, the score tags, the tooltips and the cards are made of. Nothing says "this one you press."
- **Every button looks the same.** Fold, Flamber, Min and Max differ only in their words, so you have to read all four every time.
- **They're small and flat.** 80×17 art px with 7px text, and no shadow or plinth, so nothing looks pushable.
- **Disabled looks broken.** An unavailable slip fades to 45% and the felt shows through it.
- **Other interactables are invisible.** Your pile opens the deck viewer, the paper ball opens the cheat sheet, and the Vitrine tab opens your collectibles. None of them look clickable until you hover over them, and some not even then.
- **Text on the felt is hard to read.** Chip numbers, the hint and the toast sit straight on a busy green weave with no outline.

## 2. Why Balatro reads instantly

1. **Saturated means interactive.** The background is dark and desaturated. Buttons are solid blocks of bright color. Your eye finds them before you think.
2. **Color means action, always.** Blue is Play Hand, red is Discard, orange is money and the shop, green is go on. After a minute you stop reading the labels.
3. **Buttons have weight.** Each one has a hard dark shadow under it. Hover makes it wiggle, press pushes it down, and the label is big, chunky and outlined.
4. **There's one obvious next step.** The button that moves the game forward is the biggest, brightest thing on screen.
5. **The text is outlined.** Every number and label floating over the game world has a dark outline or shadow, so it reads on any background.

We can keep our art direction (old French paper ephemera) and still get all five. A raffle ticket printed in bold red ink is just as much "paper from the casino" as a cream betting slip.

---

## 3. The rules

These are locked once Evan signs off. Check every new UI element against them.

1. **Only interactive things use a solid saturated fill.** Panels, plates, tags and info stay cream paper or dark wood. If it's a saturated block, you can press it. If you can't press it, it's never a saturated block.
2. **Each action has one color, everywhere it appears** (§4): the duel, the shop and the menus.
3. **Every button has a plinth.** That's a hard dark base under the face. Hover lifts it, press drops it onto the plinth.
4. **Only progress gets highlighted, never strategy.** The "move on" action (Lock in, Continue, Leave shop) gets the idle pulse. Betting choices (Fold, Flamber, Min, Max, Match) are never highlighted, because a pulsing Max is the game telling you how to play.
5. **Disabled is solid and grey, never see-through.** You should be able to read why it's off.
6. **Text over the world is outlined.** Text that sits on the felt, the room or a card (not on paper) gets a 1px ink outline.
7. **Color never works alone.** Every button keeps its label, and the colors are picked to differ in brightness as well as hue (§4), so colorblind players still see them as different.

---

## 4. Action colors

These are bold printed tickets. The face is the main color, the plinth is the darkest step of the same ramp, and the label is cream with an ink outline (or ink on light faces).

| Action | Face | Plinth | Label | Why |
|---|---|---|---|---|
| **Lock in** (play your cards) | felt blue `#3e66a0` | `#0f1d33` | cream | Balatro's Play is blue, and playing is what makes Value (blue, ART.md color language) |
| **Max** | burgundy `#a82a38` | `#2a0910` | cream | Pushing hard. Red is danger |
| **Match $X** | burgundy `#a82a38` | `#2a0910` | cream | It's paying the Max, so it gets the Max's color |
| **Min** | money green `#3a8040` | `#1e4a24` | cream | The cheap bet. Money green |
| **Flamber** | flame `#e8501a` | `#5a1206` | cream | Fire |
| **Fold** | tan `#8c7656` | `#2a2010` | cream | Backing out. Neutral, but as punchy as the others (ink read as disabled) |
| **Mulligan** | violet `#7a4ab0` | `#2a1440` | cream | Reshuffle: a strange little move, so the odd color. Brightened from `#4e2a78` to match the red and green |
| **Continue / Leave shop / Done** | brass `#c99a3a` | `#3d2a10` | ink `#1c1513` | Progress. The brightest face, with a dark label |
| **Buy / Open / Rip** (shop, packs) | money green `#3a8040` | `#1e4a24` | cream | Spending money |
| **Disabled** (any) | `#43342e` (canvas), `#2e2320` (DOM) | none | `#8c7656` + strike | Flat, grey, clearly off |
| **Secondary** (DOM: restock, binder, grading) | ink `#43342e` | `#0e0b0a` | paper `#e3d2a8` | Not progress, not spending |

Evan liked Max's red and Min's green best, so the rest were brought up to the same punch: saturated, mid-value, solid.

Brightness check (relative luminance): brass .36 > flame .23 > tan .19 > green .17 > blue .13 ≈ violet .12 > burgundy .10. Max (burgundy) and Min (green) are close in brightness, so for red-green colorblind players the label and the stamp glyph carry the difference. That's acceptable because both always show their word and price.

## 5. The ticket button

One sprite, tinted per action in code, the same way card pips work (CARDS.md §2).

- **Sprite** `hud/ticket/face`: a 9-slice ticket face drawn in the **5-step tint greyscale** (`#ffffff` `#d0d0d0` `#a0a0a0` `#686868` `#303030`), where white is the main ink. It has a perforated left edge (a column of punched holes), a 1px printed inner border, and a slight highlight along the top edge. Code multiplies it by the action color.
- **Sprite** `hud/ticket/plinth`: a 9-slice solid shape the same outline as the face, also greyscale, tinted with the plinth color.
- **Size:** 126×24 face plus a 3 px plinth, 30 apart, in the duel. Never under 96×22. Hit area = the full face plus the plinth plus the 4 px hover lift.
- **Source sprites:** 32×24, the 9-slice center is x 9–27 across the full height, so only the middle stretches sideways and the punched holes never stretch. The face is drawn at its source height.
- **Label:** the **chalk** font (cap 9) in faux bold, cream with a 1px ink outline (ink with no outline on brass). Chunkier than the sans. It sits after the perforation at x 11.
- **Top highlight:** a runtime 1px white line at 30%, so the tinted face stays the exact action color.
- **Price chip:** a small cream paper chip on the right end of the face (`hud/ticket/chip`, 9-slice, full palette color) with ink text: `$6`, `−$2`, `hand −1`.
- **Stack:** bottom-right, x 524–632, 4 px apart. The stack sits on the calm band (§7).

### States and motion

| State | Look | Motion |
|---|---|---|
| Idle | face sits 3 px above the plinth | still |
| Primary idle (progress only) | same, plus a soft brass glow behind it | scale 1.00 → 1.03 → 1.00 over 1.2 s, glow breathes with it |
| Hover | face lifts to 4 px above the plinth, 1px cream outline | `juiceUp` 0.12 the moment hover starts, a ±2° wobble that settles in 0.25 s |
| Press | face drops onto the plinth (0 px gap) | 60 ms down, the ink stamp (`hud/stamp/<choice>`) slams on at 2× → 1×, coin sfx, then the ticket slides away |
| Disabled | flat `#2e2320` face, no plinth, strike line through the label, the reason in the price chip's spot (§10) | none, no hover |
| Appearing | slides in from the right with spring overshoot, staggered 40 ms per ticket | |

## 6. Other interactables

Everything you can click outside the tickets gets the same three cues: **a cream 1px outline on hover**, **a small caption**, and **one idle tell** so it gets discovered.

| Thing | Caption (always shown) | Hover | Idle tell |
|---|---|---|---|
| Your pile | the count under it in outlined tiny (`24`) | outline, caption becomes "Deck · 24" | none |
| Cheat-sheet ball | none | outline, wobble, a tag reading "Hands" | a gold glint every ~8 s |
| Vitrine tab | it already says VITRINE | outline, tab drops 2 px | a glint when a collectible triggers in scoring |
| Hand cards (when you can pick) | none | lift 7, scale 1.04 (already built) | picked cards lift 18 and get a blue pip under them (`#6f9ad8` 3×3 in an ink ring, brighter than `#3e66a0` so it reads on the rail) |

The outline comes from the sprite's alpha at runtime (draw the sprite offset 1px in 4 directions in cream, then the sprite on top). It's never baked into the art.

## 7. The calm band

The right edge is the **action column** (x 508–634): the latest log line, the hint, the round tally and the tickets, stacked up from the bottom. Nothing else lives there, so nothing competes with what you can press. It sits on a dark band: ink `#0e0b0a`, fading in from x 482 to 66% at x 518, with a 40 px fade at its top edge, which follows whatever is in the column.

- It's drawn as a runtime gradient, not a sprite.
- **Every element gets its own zone** (Evan: Balatro works partly because nothing competes for the same space). The zone map is DUEL.md §2, "Built layout". Your discard sits just left of the column, your chips moved next to your pile, the toast moved into the column, and the cheat ball sits on the rail left of the column.

## 8. Text over the world

`drawText` gets an `outline` option: draw the glyphs at the 4 orthogonal 1px offsets in the outline color, then the text on top.

- **Outlined (ink `#0e0b0a`):** chip and pot numbers, the hint, the toast line, floating score numbers, the count-up step label, pile captions, ticket labels on dark faces, the tally's "This round" if it ever leaves paper.
- **Not outlined:** anything on paper or wood (plates, tags, tally, cheat sheet, Vitrine cards, chalkboard). Ink on cream already reads.

## 9. Checklist for any new screen

- [ ] Can you find every clickable thing in one second with your eyes half closed?
- [ ] Does anything non-clickable use a saturated solid fill? (It shouldn't.)
- [ ] Does each button use its action's color from §4?
- [ ] Is there exactly one highlighted progress action, and no highlighted strategic choice?
- [ ] Does disabled read as "off" rather than "broken"?
- [ ] Is every word over the world outlined?
- [ ] Is every hit area at least 96×22 art px?
- [ ] Does every change of state get its own beat (§10), or does something just jump?

## 10. Beats

Built Nov 17 2026. §1–9 make it clear what you can press. This section makes it clear **what just happened and whose turn it is**. It came from a playtest: when the richer rival folded first, the round went straight from Lock in to the tally, and it read as "sometimes it just plays the hand."

### The rules

1. **Big.** Nothing new is smaller than a ticket. Callouts use the Didone, and every word over the felt is outlined (§8). The bar is "readable from across the room at the demo."
2. **Driven by the view, not the bot.** Every beat comes from `view.bet` (`first`, `choices`, `toAct`, `why`) or `view.last` (`ended`, `bets`), never from the local bot loop. That way it works the same online, where the rival's move arrives from the server.
3. **One beat at a time, skippable.** Each beat holds long enough that you can't miss it. A click, Space or Enter skips ahead. Nothing ever jumps straight to the next state.

### The beats, in round order

| Beat | When | What you see | Time |
|---|---|---|---|
| **Round track** | always, at the top center | `Pick » Bets » Showdown » Tally`, the current step in brass. A round that ends early crosses out Showdown, with *folded* / *flambéd* / *no cards* under it | always on |
| **Lock in** | you lock | your cards fly face down onto your spots and the rest of the hand dims and sinks. The rival's spot gets a squared stack once they've locked (never their count) | spring |
| **1er token** | betting starts | a brass puck marked **1er** springs from the pot onto the first bettor's plate. Until the first bet lands: *"You bet first / Scaramouche bets first"* in Didone and why (*richer goes first*, *tied: alternates*) | until the round ends |
| **The rival thinks** | rival to act | their head tips and nods. The column reads **SCARAMOUCHE** *is deciding…* | 1.2 s when they open, 0.7 s otherwise |
| **Bet lands** | any bet | a full-size ticket in its §4 color slams onto the felt with its stamp and amount: yours left of the pot, theirs right. The rival's bubble shows the French line big and the bet word under it (*Tapis.* / MAX). The tickets stay through the tally | 1 s hold after a rival bet |
| **À vous** | your turn to bet | soft chime (`sfx.turn`), the lamp flares, **À VOUS** / *your bet* rises over the felt while the tickets slide in | 1 s |
| **Why it's off** | a ticket you can't use | struck through the label, with the reason where the price was (*needs a pair*, *would bust you*, *tournament: no folding*, *they went Max*, *all-in at $X*). The hint above the tickets spells it out in full | on your turn |
| **Ending callout** | a round ends without a showdown | the felt dims, a framed banner holds the middle: *Scaramouche se couche* / "Rival folded. The pot is yours, +$3" (or *flambe !*, *Vous vous couchez*, *Plus de cartes*…). The pot slides to the winner. The tally and Continue wait for it | 1.6 s |
| **Showdown flip** | showdown | your face-down cards turn over in place. The rival's fly in from their hand | 0.3 s, then the count-up |
| **Tally** | after all of the above | the title names the cause: *Scaramouche folded*, *You flambéd*. *You take the pot* is for showdown wins only | until Continue |

### Language

The French is the flavor, the English is the rule. Explanations (the 1er caption, the hint, the reasons) are English only.

There are two modes, switched by the **FR · EN** chip at the top of the title, the duel and the shop (stored in `flambeur:lang`). **English is the default**, so a first-timer reads every rule word in their own language.

- **English:** every French word that names a screen, a round or an action swaps to English (Manche → Round, Vitrine → Display, À vous → Your turn, Tapis → All in). Callouts show only the English line, big.
- **French:** the French as written, with the English under it in callouts and bubbles.
- **Both:** names stay French and always glint: Flamber and Flambé, Le Patron, the rivals, the packs' keepers, the French-named collectibles, TABAC. Mechanic words are English in English mode; names are identity and stay.
- **The glint:** French letters catch a band of light that sweeps across the screen every 4.2 s (brass on paper, white-gold on the felt), so French reads as gilt lettering. None under reduced motion, and never on cached canvases (the felt), where a glint would freeze.

`src/ui/lang.ts` holds the one word table, and `drawText` runs every string through it, so call sites keep writing the French. A new French word goes in that table, or it shows French in both modes without glinting. French that is painted into a sprite (the VITRINE tab, the felt's PIOCHE / DÉFAUSSE, the house sign) is covered and redrawn as text. Pack art (LE ROUSSI, BISCUITS) stays painted; those are brand names.

### Testing

`/?quick&wild` makes the rival bet at random, so folds, raises and flambés come up within a few rounds.

## 11. Still open

- **DOM screens** (draft, shop, packs) still use CSS buttons, now in the §4 colors: brass for progress (the default), money green for `data-buy`, ink for `.ghost`, burgundy for `.danger`, with a 3 px plinth shadow and a press shift. They still need the canvas treatment eventually.
- **Keyboard shortcuts:** built. 1–4 press the tickets top to bottom, Space or Enter presses the primary.
- **Why a ticket is off:** built (§10).
- **Sprites for the beats:** the 1er puck and the callout banner are drawn in code. Art list: `hud/token/premier` (36×36), and a banner frame if the plate frame stops looking right at that size.
- **A rival flambé callout** hasn't been seen in the browser yet. It's the same path as a fold, with a different line.
- **ART.md §13 "Buttons"** should be updated to point here once Evan approves.
