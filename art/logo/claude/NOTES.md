# Flambeur logo (Claude's take)

**Concept:** "Rien ne va plus" + "La Cour en feu". The word spins in like slot reels and locks left to right. Each lock sends a spark into a court card, which starts burning at the edge where the spark hits. The last lock flambés the whole word, the ribbon counts up to 1 048 576 (2^20, French digit spacing) and slams, then everything settles into an idle loop.

## Files
- `build.lua`: generates everything. Run `aseprite -b --script-param out=$PWD/ --script build.lua`.
- `logo.aseprite`: 256×144, 130 frames at 50 ms. Tags are `intro` (90 frames, 4.5 s) and `idle` (40 frames, 2 s, seamless). Layers from bottom to top: bg, rays, cards, card_fx, fire, word, ribbon, fx.
- `logo.png` and `logo@4x.png`: the transparent hero still. `logo-felt@4x.png` is the same still on felt.
- `intro.png/json` and `idle.png/json`: spritesheets with 10 frames per row, without the bg layer.
- `logo.gif`: intro plus 3 idle loops at 3×.
- `preview.html`: plays intro then idle, crisp, with a smooth sub-pixel sway once it settles.

## Decisions
- **Native size of 256×144 (16:9):** it scales to 1024×576 at 4× and to 1080p at 7.5×. Like Balatro, the logo is one crisp sprite that can be moved and rotated smoothly at display resolution (see the preview's sway), not locked to a game-wide pixel grid.
- **Letters built from shapes, not a font:** 28 px Didone-style caps (thick stems, hairlines, bracketed serifs) for a Belle Époque feel. Shading is automatic: a top-edge highlight, a bottom-edge shade, and a hue-shifted vertical ramp from white-hot through gold and amber to ember at the base. They have a two-ring outline (burgundy, then ink) plus a drop shadow and a soft dark halo so the word reads over the busy cards.
- **Court cards are real Paris-pattern figures:** La Hire (V♥), Argine (D♣), Charles (R♥), Pallas (D♠) and Hector (V♦), one of each suit. They use French indices (R, D, V for Roi, Dame, Valet), the names on the cards, and double-headed mirrored figures. Each is drawn at 44×64 and rotated with a RotSprite-style pass (Scale2x three times, then nearest-neighbor rotation), so the tilted cards stay clean pixel art instead of turning into jagged noise.
- **Fire is in screen space:** card flames always rise straight up whatever angle the card sits at. Flame heights come from a sum of sine waves with whole-number cycles per loop, so the idle loop is seamless.
- **Casino backdrop:** a burgundy sunburst arch with a chasing marquee-bulb ring that dithers out at the bottom, and a warm dithered glow behind the word after the flambé.
- **Juice:**
  - **Anticipation:** gray spinning reels.
  - **Overshoot on each lock:** +3, −2, +1 px, with a white flash frame.
  - **Hit-stop:** a two-frame beat before the whoosh.
  - **Screen shake** on the whoosh, a 2× slam frame on the count-up, a spark burst, and a glint sweep in the idle loop.

## Sources
- [Pixel Parmesan, anti-aliasing fundamentals](https://pixelparmesan.com/anti-aliasing-fundamentals-for-pixel-artists): use manual, selective AA rather than blurry brush edges.
- [Pixnote, shading](https://pixnote.net/en/learn/shading): hue-shift ramps, so highlights go warmer and shadows go toward red/purple.
- [IPCS, Paris and Rouen patterns](https://i-p-c-s.org/faq/history_13.php) and [IPCS court names FAQ](https://i-p-c-s.org/faq/tmfaq.php): the court card names and iconography (Charles with a sword, La Hire with a halberd).
- [Game Developer, the 12 principles of animation in games](https://www.gamedeveloper.com/production/the-12-principles-of-animation-in-video-games) and [Game Developer, juice in Slime Road](https://www.gamedeveloper.com/design/3-game-juice-techniques-from-slime-road): anticipation, overshoot, squash, and a title that keeps living in idle.
- [foro3d, Balatro and LÖVE](https://foro3d.com/en/2026/mayo/el-arte-del-crt-digital-balatro-y-la-magia-de-love.html): Balatro's pixel art comes from Aseprite and is scaled with nearest-neighbor filtering, with a CRT shader on top.
