# Flamber: the polish pass

The plan to rebuild the Flamber beat (Nov 20). Flamber is the game's name and its core move, so this
animation has to be the best thing on the table. Wins over ART.md §7.8 once it lands (rewrite §7.8 to match).

## 0. What's wrong now

`forgeReturn()` in `src/ui/duel.ts` (FORGE timeline, ~2.25s):

- **The fire is bad.** `fx/flame/1..4` are four 24×20 polygon sprites from `art/duel/ephemera.py`, pinned in a row
  of three on a dark 3px bar. The "burn" is the card art cropped shorter from the bottom, so the cards look like
  they're being *squashed*, not burned.
- **It doesn't say what it did.** Every locked card slides in and melts the same way, including the kickers the
  engine never burns (they go to the discard whole). The ★ card appears from a flash, unconnected to any card.
  The Bulk drops out of nowhere. Nothing says "2 cards in, 1 ★ + 1 Ash out".
- **Bulk looks like a rock** (`base/bulk` in `art/cards/specials.py`: a grey stone slab with moss), and lands with
  a stone thud (`sfx.bulk()` = slam + tok). That was the old "Bulk" joke; it doesn't belong to a fire.
- **The grind is the same melt**, but in a grind nothing is destroyed at all: the picked card gets +1 Value and
  every card goes to the discard. The animation lies.

## 1. The beat, in one line

> Your scoring cards catch fire one by one. One burns down to the **★ card underneath**, the rest burn down to **Ash**.

The count always matches the engine (`flamberOut` / `buildForged`): `plan.merged` (N cards) burn, 1 ★ + N−1 Ash
come out. The kickers (`locked` minus `merged`) never touch the fire.

The trick that makes it readable: **every burning card has something underneath it.** The burn front eats the old
card face and reveals what's below: the survivor's underneath is the new ★ card, everyone else's is an Ash card.
One mechanism, and the player sees each card *become* its result instead of vanishing into a flash.

## 1b. Rule change: a flambé doesn't bet and doesn't play (Evan, Nov 20)

Today a flambé locks face down on your spots, sits through the betting, then shows as a thrown "jetée" tag at the
reveal, and only burns after the count-up. Two changes:

**1. No bet for the seat that flambés.** Betting only happens right after locking hand 1 (the opening bet) and
hand 3 (the last push). If you flambéd *that* hand, you aren't asked: you stay where you are (Min, or Max if you
were already on it). The rival still picks, and still sees a Min from you, same as a chosen Min, so nothing leaks.
- Flambé hand 1, play hand 3: the last push still asks you. "Throw hand 1 for a bomb, then push" stays a play.
- High Stakes twist: unchanged, everyone is on Max.
- Engine: `openStage(b, stage, sitting)` in `betting.ts` marks sitting seats as already acted. `afterLocks` passes
  `lockKind === 'flamber'` per seat. Bots stop getting asked; nothing else in `bot.ts` changes.
- Tests (round.test.ts): flambé hand 1 → only the rival bets, you're on Min; flambé hand 1 then play hand 3 → the
  push asks you; flambé hand 3 → no push for you; both flambé hand 1 → no betting at all, straight to the reveal.
- Balance: sim before/after for greedy/cautious/random on Classic and Forge (CLAUDE.md), numbers in DESIGN.md.
  Update DESIGN.md Betting and Flamber, and V2.md §4–5 point to it.

**2. The burn happens at the lock, not the reveal.** The moment your Flamber is locked (and its traits picked,
if it was over the cap), the cards go to the middle and burn (§2). Your spots stay empty. At the reveal the hand
plays out as if you'd played nothing: the rival's cards flip and count up alone against your empty spots, with a
small `Flambé` tag on your side instead of a score. The engine timing doesn't move: the merge still resolves in
`resolveHand` at the reveal, so both seats still lock blind and hand sizes never leak.
- The UI needs the ★ card before the engine makes it. Move the Catalyst bump from `flamberOut` into
  `buildForged` (one place for the tier), and the UI previews with `buildForged(plan, keep, round, { nextCardId: -1 })`:
  a scratch id counter, no state touched. Same card, same art, minus the real id.
- Between the burn and the reveal the ★ card **waits beside your hand** (next to the Sleeve slots), face up, tagged
  `next hand`. At the reveal it's in `view.me.hand` for real and slides into the row. The Ash lands on your
  discard pile right away; the pile's count catches up at the reveal.
- Online: the burn only plays on your screen. The opponent sees your face-down lock and your Min, like now.

## 2. The timeline

Triggered when your own lock goes in as a Flamber and `me.done` (traits picked): `forgeFx` moves from the
showdown branch of `setDuelState` to the lock. ~3.2s total, every phase a named constant in one `FLAMBE` object
like `FORGE` today. The betting slips wait until it's done.

| ms | Phase | What you see | Sound |
|---|---|---|---|
| 0–350 | **Clear** | Kickers dim (`dimCard` wash) and slide to your discard, face up. The merged cards lift off the felt to the middle at **1:1 scale (64×88)**, a slight fan. A chalk caption above them: `Flambé · Pair of 5s` | card slides |
| 350–900 | **Light** | A match spark hops card to card, left to right, 140ms apart. Each card catches at a bottom corner: a small flame and a scorch spot | `strike()` per card, pitched up |
| 900–2100 | **Burn** | Burn fronts creep up each card (logo style: noise-shaped, scorch → char → glowing edge → gone). Real fire rises off the fronts, tall, logo palette. Embers float off. The felt and both characters get firelight (warm lamp pulse) | fire roar, crackle loop |
| 2100–2600 | **Reveal** | Survivor: its front clears and the ★ card underneath is whole. It pops (scale 1→1.12), rays, ★ bells, tier label `★★` in gold chalk. Ash cards: fronts clear, the flame drops to a few licks and a smoke wisp, embers twinkle in the ash. Caption updates: `1 ★ card + 1 Ash` | `stars(n)`, a soft hiss per Ash |
| 2600–3200 | **Settle** | ★ flies to its waiting spot beside your hand (with a little trail of sparks), tag `next hand`. Ash cards slide to your discard and shed a puff, tag `Ash → discard` | ash crumble (new) |

★3 gets the existing screen shake at the reveal plus a white-hot flare on the fire ramp.

**Grind (no pair)** is a different beat, because nothing burns: the picked card goes to the middle, the others
slide to the discard. The picked card is heated: flame licks along its bottom edge, the frame glows (ART.md `heat`),
then a quench: a steam puff and `+1 Value` stamps on it. Then it goes back to its waiting spot by your hand (it
stays in your cards, `flamberOut` never discards it). Caption: `No pair · 7♣ +1 Value`. ~1.6s.

**Rival flambé:** a small fire over their squared stack (same fire module, short, no reveal), so you can tell they
threw their hand to flambé. Optional, last.

**Still cards** (`stillCards.matches`): no fire. Kickers and merged cards cross-fade straight to their results
(★ and Ash) in place for 400ms with the caption, then settle. `flash()` and `shakeAmount()` stay on the flare and shake.

## 3. The fire (`src/ui/fire.ts`, new)

A runtime port of the logo's fire (`art/logo/fable/src/build.lua`, `fire()` / `paintFire()` / `drawCards()`),
so the table burns exactly like the title screen. Pure canvas helpers, no game logic.

- **Noise.** Port `L.vnoise` (`art/logo/fable/src/lib.lua`). Two value-noise tiles made once at load (the logo's
  `N1`, `N2`), scrolled per step.
- **Heat buffer.** A Float32 grid over the middle of the felt (~360×200 game px, one cell per game pixel). Each step:
  every cell takes the average of the 3 below it, shifted sideways by the second noise tile, minus a noisy cooling
  term times a per-column fuel. Sources (the burning fronts) write heat into it. Exactly `fire()` in build.lua.
- **Paint.** Into an ImageData with the logo ramp, thresholds from `paintFire()`:
  `gold7 ≥ .80`, `fire_y #ffe45e ≥ .62`, `fire_o1 #ffb22e ≥ .46`, `fire_o2 #f77a1c ≥ .32`, `fire_r #dc3e1a ≥ .20`,
  `fire_d #9c1f26 ≥ .11`, then a checker dither of `smoke #55142a`. Add these to `art/palette/flambeur.gpl` (they're
  only in the logo's lib.lua today).
- **Stepped, not smooth.** The heat steps at ~15 fps (like the logo's frames), drawn every frame. Smooth fire reads
  as a particle system; stepped reads as pixel art.
- **Two layers**, like the logo: `fire_back` drawn behind the cards (tall), `fire_front` drawn over the bottom of
  each burning card (short), so the cards sit *in* the fire.
- **Burn field per card.** When a card lights, build its field once from its 64×88 art: chamfer distance to the
  card's edge, plus distance from the ignition corner, plus ±7 of noise seeded by the card id (build.lua's `bf`).
  The index corner burns last (`keep`), so you can read which card it was until the end.
- **Per frame per card**, with front level `l(t)`, every pixel is one of: gone (shows the underneath), glowing
  edge (fire colors, and a heat source for the buffer), `char2 #2e1810`, `char1 #5a3420`, scorched (darkened
  toward `#dfcb99`), or intact. Five cards × 5,632 px is nothing per frame.
- **Embers.** Single bright pixels (`fire_y`, cooling to `fire_r`) thrown off the fronts with a little drift and
  gravity, like the logo's looping embers. Replaces `fx/ember/*`.
- **Firelight.** Fire strength (summed heat) drives the existing `lamp()` flare and a warm multiply over the felt,
  the way `firelight()` lights the title's wall.

`fx/flame/1..4` and `fx/ember/1..3` stay for the score tag flames (`duel.ts:1523`) until those move to `fire.ts` too.

## 4. The Ash card (`base/bulk` redrawn)

Redraw the sprite in `art/cards/specials.py` and rebuild `art/cards/cards.png/json`. Keep the slice id `base/bulk`
(code ids stay `bulk`, like Forge → Flamber).

- **The card's own silhouette** (the `base/paper` 64×88 mask), not a rock polygon. It's what's left of a card.
- **Burnt edge:** an irregular ring of `char2` / `char1`, with 3–4 bites taken out of the edge (transparent),
  a curl at one corner.
- **Ash body:** a cool grey ramp (`#43342e` → `#6b605a` → `#9a8f86` → `#c9bfb4`), soft ordered dither, a few
  darker crack lines, flecks of white ash.
- **Embers:** 5–6 warm pixels (`fire_o2` / `fire_y`) in the cracks near the edge. `src/ui/art.ts` twinkles them
  at runtime on the table (a 2-frame palette swap, not a new sprite), so Ash in your hand still smoulders.
- **The +5** stays in the middle, pressed into the ash in pale `#c9bfb4` with a dark underside, readable at 44px.
- **Ghost print** (nice to have): a faint scorched pip shape in the middle, so it reads "this used to be a card".
- Update the CARDS.md row and §0.5 table: `Ash | charcoal and grey ash | a burnt card`.

## 5. Name: Bulk → Ash ✅

Done Nov 20 (Evan's yes). Display text only: ids, `card.bulk`, `BULK_VALUE`, `binBulk` and the slice stay. The card
is **Ash**, the shop's Bulk bin is the **Ashtray**, the collectible Bulk Bin is the **Ash Bucket**, the pochette is
**Ash Deal**. Left for the art pass: the shop's bin prop (`shop/bulk/bin` in `art/shop/services.py`) becomes an
ashtray, and `sfx.bin()` becomes ash tapped into a metal tray.

## 6. Clarity, outside the animation

- **Flamber hover preview.** Hovering the Flamber ticket puts a small flame on each card in your hand that would
  burn (`forgePlan(selected).merged`), dims the kickers, and the Fiche says `2 cards → 1 ★ + 1 Ash`. For a grind,
  the picked card glows instead. This is what the player is missing *before* they press it.
- **Captions** in the chalk band (§2) say the hand and the outcome, once each.
- **Result notes** (`duel.ts:2298`): `New card: 5♥ ★` and `+1 Ash in your discard`.
- **Tutorial:** La Fée's Flamber and Bulk lines (TUTORIAL.md, `tips.ts`) rewritten for the new beat and Ash.

## 7. Sound (`src/ui/sound.ts`)

- `strike()` per card on the light, pitched up a semitone each.
- A fire crackle loop under the burn (the existing `fire` sample plus filtered `noise()` crackles), gain following
  fire strength, fading out on the reveal.
- `ash()` replaces `bulk()`: a soft papery crumble (filtered noise, low), no slam. `bulk()` goes.
- The grind: keep the grindstone, add a quench hiss before the ting.
- Note the changes in SOUND.md.

## 8. Build order (one commit each)

0. ✅ **The rule (§1b).** Engine first: `openStage` sitting seats, Catalyst into `buildForged`, the tests, the sim
   before/after, DESIGN.md. Then the UI moves the trigger to the lock, empties your spots at the reveal, adds the
   `Flambé` tag and the ★ waiting spot. Uses the old fire until step 3 replaces it.
1. ✅ **Dev harness.** `/flambe.html` (dev only, never built; `src/dev/flambe-lab.ts`): a loop of the beat on a felt with fixed hands: Pair in
   5 cards, Three of a Kind, Full House (5 burn), a ★2 + ★2 into ★3, a grind. Without it, every tweak means
   playing to a Pair. Keys: space = replay, 1–5 = which hand, `[`/`]` = slow-mo.
2. ✅ **`fire.ts`:** noise, heat buffer, paint, burn field, embers. Check it alone in the harness first: one card burning.
3. ✅ **The Pair+ beat:** rewrite `forgeReturn()` into the §2 phases on top of `fire.ts`. Kickers, survivor, Ash,
   captions, firelight, settle. Delete the crop-melt.
4. ✅ **The Ash card:** redraw `base/bulk`, rebuild the atlas, ember twinkle in `art.ts`.
5. ✅ **Grind beat** and **still-cards** version.
6. ✅ **Sound** (§7).
7. ✅ ~~**Name** Bulk → Ash in display text and docs.~~ Done, and the Ashtray prop and its sound.
8. ✅ **Flamber hover preview** (§6).
9. ✅ **Rival flambé** fire on their stack.
10. ✅ **Docs:** ART.md §7.8, CARDS.md, SOUND.md, CLAUDE.md layout line for `fire.ts`.

**Status (Nov 20): all of it is built.** Step 0: `openStage(b, stage, sitting)` + 4 tests in round.test.ts, the sim
before/after in DESIGN.md (no shift), Catalyst in `buildForged` (`plan.catalyst`), the view carries `me.keep` / `me.grind`
so the UI can preview the ★ card, the burn starts at the lock (`setDuelState` in duel.ts) and `burnt()` in main.ts
holds the rival and the reveal until it's done (8s cap for a hidden tab). Your plate says `FLAMBÉ · 1 ★ card + N Ash ·
scores 0 this hand`, the score tag says `FLAMBÉ` (theirs too when they flambé). Steps 1–10 as listed, plus the Ash ember
twinkle (`ashCanvas` in art.ts), the `roar` bed, the grind's grindstone → quench + ting, the hover preview, the rival's
stack fire, and the Ashtray prop and sound. `→` and `★` are in the chalk font, `→` in sans and tiny. Tuning notes: the
heat field runs 4 passes per 15 fps step (one pass climbs a row); the front fire is `tall: 1.5`; in the duel the burn
row sits at y 212 under a dim wash so the rival's revealed row doesn't fight it. Dev: `/flambe.html`,
`/?quick&auto&burn`.

Not done: the shop atlas has the new ashtray pasted into its slot because `python art/shop/counter.py` currently fails
on the sleeve art's palette check (`shop/sleeve/archival` has pure black, another session's work); a full rebuild once
that's fixed makes the same thing from `services.py`.

Done when: in the harness and in a real `/?first` run, a stranger can say what happened after one viewing
("my pair burned into a star card and left ash"), the fire matches the title screen side by side, nothing in the
console, tests/typecheck/build pass, and it holds 60 fps with 5 cards burning.

## 9. Decisions for Evan

- ~~Rename Bulk → Ash~~: yes, done (§5).
- **Length:** ~3.2s every flambé. Flambé is rare enough (a few per run) to earn it; a click skips to the settle.
