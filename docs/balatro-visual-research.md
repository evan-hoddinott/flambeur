# Balatro visual design: research notes

Nov 17 2026. Input for the Flambeur art style doc. `balance-and-design-report.md` covers Balatro's game design; this covers how it looks, moves and feels.

How sure we are: **[confirmed]** = interviews, the game's own files, or modding docs. **[reading]** = third-party analysis or reimplementations, plausible but not from the source.

## 1. Pipeline: pixel art that isn't stuck on a pixel grid

- **[confirmed]** Built in LÖVE (Lua). Art drawn in Aseprite with a mouse. LocalThunk set himself rules on palette, resolution and UI so everything stays coherent. Every non-legendary Joker has the word "Joker" somewhere in its art.
- **[confirmed]** Card sprites are **71×95** at 1x. There's a second 2x atlas (142×190), used when "pixel art smoothing" is on.
- **[confirmed]** Sprites are drawn with **nearest-neighbor** filtering. But each card is its own quad that moves, scales and rotates freely at **screen** resolution. There's no low-res framebuffer that the whole scene snaps to. That's what lets a card wobble by 2° without turning into jaggies.
- **[reading]** There are about **11 GLSL shaders**: the background swirl, CRT, card dissolve, and the editions (foil, holo, polychrome, negative), plus booster, voucher, debuff and others. Animation is mostly done with shaders and transforms, not with sprite frames.
- **[confirmed, from the game's Lua]** Every object has a *target* transform and a *visible* transform. The visible one springs toward the target each frame, so motion always eases and overshoots a little. `juice_up()` adds a quick scale pop plus a decaying rotation wobble. Most of Balatro's "juice" is just this one call.

## 2. Cards

- **[reading]** Fake 3D tilt: a fragment shader rotates the UVs in 3D and divides by depth, so the card looks like a plane leaning toward the cursor. Tilt is about 1° per 1/50 of the card's width the cursor is from center, and it eases back to flat in ~0.1s when the cursor leaves. (Godot port of the effect.)
- **[confirmed by play]** Cards are never perfectly still: the hand fans in an arc with a slight rotation per card, and idle cards sway slowly. A hovered card lifts and grows; a selected one lifts further.
- **[reading]** Editions are shader layers over the art. **Foil** is a moving diagonal sheen, **Holo** is an HSL rainbow with a hex grid and noise, **Polychrome** rotates hue through animated noise with boosted saturation, and **Negative** inverts. Shader detail is the reason the wiki asks for 2x screenshots.
- **[confirmed by play]** Cards flip and dissolve (a burn-away shader with a colored edge) when destroyed. Booster packs shake and burst open.

## 3. Screen and atmosphere

- **[confirmed]** A full-screen **CRT pass**: bloom (bright pixels are pulled out and blurred), contrast, vignette, slight curvature and chromatic aberration. It can be turned down in settings. LocalThunk wanted it lo-fi and a bit psychedelic, "underground".
- **[confirmed by play]** The background is an animated **paint swirl** shader in two or three colors. It changes color with the blind or boss and spins up during big scores. It's cheap and fills the whole screen, and it never competes with the cards because it's low-contrast and slow.
- **[reading]** It's a dark, cool, desaturated base with saturated accents. Neutral tones are for surfaces, bright ones for whatever is selected or scoring, and the hottest highlights are saved for exceptional events.

## 4. UI and layout

- **[reading]** There are stable zones: info on the left column, the hand and actions along the bottom, Jokers and consumables across the top. The main numbers never move, so your eye finds them without searching.
- **[confirmed by play]** UI is chunky rounded-rect panels with a hard drop shadow and a slightly lighter top edge, like plastic buttons. Buttons press down when clicked. Panels slide in from offscreen with springy overshoot.
- **[confirmed]** Font: **m6x11** (Daniel Linssen), a chunky pixel font used for everything, numbers included.
- **[reading]** Colors carry meaning everywhere: **blue = chips, red = mult, gold = money**, green for hands left, and purple for planets. The same color is used in tooltips, counters and particles, so you learn the language without being taught it.
- **[confirmed by play]** Tooltips are small and pop up on hover, with keywords colored in the text.

## 5. Scoring as a show

- **[confirmed]** The final score is hidden, so you watch the machine run (GMTK).
- **[reading]** The sequence goes card by card, then Joker by Joker, left to right. Each trigger pops (`juice_up`) and floats a colored number, and the chips/mult counters tick up. Each scored card plays a rising pitch, and mult triggers get a distinct "ka-ching". Big totals set the score box on **fire** (a flame shader whose intensity scales with the score), shake the screen, and speed up the background swirl.
- **[reading]** Feedback scales with significance: screen shake has small/medium/large tiers by score size, routine actions stay clean, and the peak moments get the effects. Every effect is short and returns to a calm, ready-to-decide state.
- **[reading]** It's ~300ms per trigger. Each one shows cause → effect, which teaches the rules without any text.

## 6. What this means for Flambeur

1. **Copy the pipeline, not the look.** Use nearest-neighbor sprites as free quads at screen resolution, spring-based transforms, a `juiceUp()`, a shader for each finish, and one post-process pass. All the wobble and tilt we want comes from this.
2. **A color language for Value / Hype / Grade / money** from day one, used in counters, particles and tooltip keywords.
3. **Fire is our Balatro flame.** The logo already sets flambé as the payoff motif, so the Appraisal count-up should catch fire the way Balatro's score box does.
4. **A calm baseline.** Keep a budget for effects so the table stays readable during betting, which Balatro doesn't have to deal with.
5. **Our extra moments:** pack rips (the god pull revealed last), the forge merge, and the showdown reveal against the rival. Balatro has nothing like the forge or the showdown, so those get the biggest effects budget.

## Sources

- [The art of digital CRT: Balatro and LÖVE (foro3d)](https://foro3d.com/en/2026/mayo/el-arte-del-crt-digital-balatro-y-la-magia-de-love.html)
- [Reimplementing LÖVE2D in Rust to play Balatro in a terminal (dev.to)](https://dev.to/4rh1t3ct0r/how-i-reimplemented-love2d-in-rust-to-play-balatro-in-a-terminal-2ag2)
- [Balatro card tilt shader (Godot Shaders)](https://godotshaders.com/shader/balatro-card-tilt/)
- [Balatro-style background gist](https://gist.github.com/mar1lusk1/4677e482375bff4a01956107aef35699)
- [Modded Balatro Wiki style guide](https://balatromods.miraheze.org/wiki/Modded_Balatro_Wiki:Style_Guide), [Nexus card template](https://www.nexusmods.com/balatro/mods/493?tab=docs)
- [Balatro: juicy feedback (Blake Crosley)](https://blakecrosley.com/guides/design/balatro). Its timings and hex values are the author's reconstructions.
- [Balatro art direction breakdown (halabaojia)](https://halabaojia.com/collection/20260212-balatro-visual-design-analysis/)
- [GMTK, Balatro's cursed design problem](https://gmtk.substack.com/p/balatros-cursed-design-problem)
- [Xbox Era / Playday interview with LocalThunk](https://xboxera.com/2024/03/09/there-is-a-lot-more-design-to-explore-within-balatro)
- [Indieklem, 100%-interface games](https://indieklem.substack.com/p/20-a-look-at-100-interface-games)
