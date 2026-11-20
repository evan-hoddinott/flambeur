# Flambeur: sound design

The source of truth for how Flambeur sounds: what plays on every event, where each sound comes from, and how the mixer works. The music has its own spec, `docs/MUSIC.md`. ART.md §11 says "every trigger has a sound"; this doc says which one.

Nov 19 2026, from Evan's ask: French, an accordion count-up like Balatro's, crispy cards, and feedback on every little thing.

---

## 0. Done when

- Every hover, press and state change in both scenes makes a sound. Nothing you can click is silent.
- Cards sound crisp: short, dry, transient-first, never two identical hits in a row.
- The Appraisal count-up is an accordion. It rises one step per scoring step and always sits in key with the music.
- There's a master, music and sfx volume in the carnet, and **M** mutes.
- No sound starts late. Everything is decoded before the first deal.
- A full `/?quick&auto` run plays without clipping and without console errors.

---

## 1. Rules of feel

1. **Every interaction gets a sound.** Hover, press, a denied press, a state change. If it moves on screen, it makes a sound on the same frame. The sound fires where `juiceUp` / `pop()` fires, never on a timer of its own.
2. **Chains rise.** Anything that repeats in a sequence steps up in pitch: deal, count-up, pack flips, tally lines, ★ tiers. Long chains also speed up (ART.md §11 timings).
3. **Physical things are recorded, musical things are synthesized.** Cards, chips, paper, stamps, coins, fire and doors are real samples. Ticks, chimes, stingers and the music are WebAudio synth voices, so they can take any pitch and stay in key.
4. **Dry is crisp.** UI and card sounds get no reverb. Only ambience, music and the big moments get space.
5. **Variation everywhere.** Each physical sound has 3–5 takes, played round-robin with ±4% random pitch and ±1.5 dB random gain. No machine-gun effect.
6. **Calm baseline** (ART.md §11). While you're deciding, only the music, the room and your own hovers play. Nothing fires on its own.
7. **Bad news is funny, not harsh.** Losing a hand is a deflating accordion wheeze, not a buzzer.
8. **Silence before the peak.** The god pull's held card and the last Appraisal digit get a beat of near silence first (the music ducks out). The hit lands harder after it.
9. **French by ear.** The accordion, a zinc counter, a tabac door bell, a La Poste rubber stamp, the croupier's "Rien ne va plus".

---

## 2. Make or pull: the call

**Pull, don't record** (Evan, Nov 19: no time to record). Pull foley for the physical sounds, make it crisp in a build script, and synthesize everything musical.

| Source | License | Use it for | Notes |
|---|---|---|---|
| [Kenney Casino Audio](https://kenney.nl/assets/casino-audio) | CC0 | **The cards and chips**: ~23 card, ~19 chip, ~12 dice sounds | Grab this first. It's the backbone of the duel |
| Freesound, CC0 only | CC0 | More card takes (flick, snap, riffle, slide on felt), a foil bag tear for the pack rip, a scratch ticket, coins on metal | Search "playing card", "card flick", "foil", "scratch card". Pick by ear for a sharp transient and no room echo |
| Kenney Impact Sounds, Interface Sounds, UI Audio | CC0 | Wood/plate thuds (stamps, box slam, Bulk stone), small clicks as raw material | Kenney asks for credit but doesn't require it. We credit anyway |
| [Sonniss GDC bundles](https://sonniss.com/gameaudiogdc) | royalty free, commercial OK, no attribution, **no AI training** | The pro foley Kenney lacks: paper tear, vintage cash register, shop door bell, match strike, fire whoosh and crackle, ceramic crack, crowd murmur, clock, street | Huge (many GB). Search the archive, don't download all of it. Check each year's license page |
| [Freesound](https://freesound.org) | per file. **Filter to CC0** | Specific French things: a Paris street, a café room tone, a moped, a Métro door | CC-BY files are fine too, but each needs a credit line |
| Sound fonts already on this machine | GeneralUser GS (its license is in `~/Music/sf2`), FluidR3 (MIT) | Single notes to borrow: an accordion, a celesta, an organ, a bell | Render one note with fluidsynth when a synth voice can't get there |
| **WebAudio synth** (`src/ui/sound.ts`) | ours | The accordion count-up, chimes, stingers, the whole score (MUSIC.md) | Already exists. Grows a proper accordion voice (§5) |

Every sound gets a line in `art/sfx/CREDITS.md`: its source files, pack, author, license and URL. Built Nov 19 from 7 CC0 packs on opengameart.org (Kenney Casino/RPG/Interface/UI, rubberduck's 100 CC0 SFX, starninjas' page flips, and single files for fire, whoosh, typewriter and the door bell).

**Not doing:** AI-generated sfx (inconsistent transients, unclear licenses) or anything ripped from Balatro or another game.

### Making pulled sounds crisp (`art/sfx/build.py`)

Pulled sounds come with room tails, quiet starts and mud. Crispness comes from the edit, so the edit is a script, not hand work. It's the same pattern as `art/*/build.py`.

- Raw downloads go in `art/sfx/raw/<source>/`, untouched. `art/sfx/sounds.txt` lists each output name, its raw file(s) and a trim length.
- `python art/sfx/build.py` runs ffmpeg on each one: cut leading silence down to 2 ms before the transient, cut the tail at **≤ 150 ms for cards** and ≤ 400 ms for everything else with a 10 ms fade, high-pass at 150 Hz, a small 5 kHz presence lift, peak-normalize to −1 dBFS, mono.
- It packs every take into one atlas, like the art: `art/sfx/sfx.ogg` (44.1 kHz mono Vorbis q6) and `art/sfx/sfx.json` (`{name: [[start_s, length_s], ...]}`), and regenerates `art/sfx/CREDITS.md` from `sounds.txt`. One fetch, one decode.
- Takes: aim for 3–5 different raw sounds per name. When a source only has one, the build makes two more with ±3% pitch and a different trim, so round-robin still has something to rotate.

---

## 3. The mixer

One `AudioContext`, built on the first click (the browser needs a gesture, the title's start button is it).

```
voices ─┬─ sfx bus ──┐
        │            ├─ master ── compressor/limiter ── destination
music ──┴─ music bus ┘
ambience ─ amb bus ──┘
```

- **Buses:** `sfx`, `music`, `amb`, each a `GainNode`. The master goes through a `DynamicsCompressorNode` set as a soft limiter (threshold −6 dB, ratio 12, attack 3 ms, release 120 ms), so stacked hits get punch and never clip.
- **Samples** are fetched and `decodeAudioData`'d once at boot into `AudioBuffer`s, and played with `AudioBufferSourceNode` at `currentTime`. No `<audio>` tags (they start late).
- **Pan by screen x:** a `StereoPannerNode` per voice, `pan = (x − 320) / 320 × 0.35`. Cards dealt to the left sound left. Small, but it's a big part of "crisp".
- **Distance:** the rival's side gets −6 dB and a 3 kHz lowpass. Their cards sound across the table.
- **Voice caps:** 4 copies of a sound at once, max. Hover sounds have a 40 ms cooldown, so sweeping across the hand ripples instead of buzzing.
- **Ducking:** the music bus ducks by a gain ramp, never a cut. Count-up −4 dB. Pack rip −6 dB and a 900 Hz lowpass. The god pull hold −24 dB. Recovers over 600 ms.
- **Volume:** master, music and sfx sliders on the carnet's Rules page, saved in `localStorage` (wrapped in try/catch). **M** toggles mute.
- **Levels** (starting values, tune by ear):

| Group | Peak | Examples |
|---|---|---|
| Peaks | 0 dB | Appraisal lock, KO, bust, god pull, ★3 |
| Triggers | −6 dB | count-up steps, chip pushes, stamps, flips |
| Actions | −10 dB | deal, select, press, buy |
| Hovers | −20 dB | every hover |
| Music | −14 dB | under everything |
| Ambience | −26 dB | room, street, clock |

---

## 4. Event map

Every event in the game. **S** = sample, **Y** = synth. Existing `sound.ts` functions are in `code`.

### 4.1 Everywhere

| Event | Sound | Src |
|---|---|---|
| Hover a card | soft paper "tk", pitch by card x | S |
| Hover a ticket / button / prop | a lighter paper flick | S |
| Press a ticket | ink stamp thunk + paper, the ticket's slam (READABILITY.md) | S |
| Press something not allowed | a dull wood "tok", pitch down | S |
| Fiche opens / pins | a paper slide / a pin push | S |
| Carnet opens | leather creak (`creak`), then a soft snap | S+Y |
| Carnet tab switch | page turn | S |
| Carnet closes | a soft leather thud | S |
| Rules paper unfolds / crumples | paper crumple, forward / reversed | S |
| FR · EN chip | two tiny reeds, up for FR, down for EN | Y |
| Announcement band slams on | an accordion chord stab in the song's key | Y |
| First-encounter tip appears | a small desk-bell ting | Y |

### 4.2 Title and draft

| Event | Sound | Src |
|---|---|---|
| Logo reels spin and lock | slot reel ratchet, a clack per reel, a flame whoosh on the last | S |
| Start | `coin`, the music fades in (Table variation) | Y |
| Draft rows deal in | card flicks, rising per card | S |
| Pick a card | card snap + slide into the deck | S |
| Starter box opens | cardboard lid lift, tissue paper | S |
| Keep 3 confirmed | chip stack clack, ★ ting | S+Y |

### 4.3 The duel

| Event | Sound | Src |
|---|---|---|
| Deal | card flick per card from the pile, panned to its slot, +1 semitone per card | S |
| Rival's deal | the same, rival distance (§3) | S |
| Select a card (it rises) | crisp snap, pitched up | S |
| Deselect | the same snap, pitched down, quieter | S |
| Sort by rank / suit | a short riffle | S |
| Discard | cards slide off the felt + a small whoosh, then new flicks | S |
| Insert from the Sleeve | plastic fwip (SLEEVES.md) + card snap | S |
| **Lock (Play)** | cards slap face down on the felt, and a low accordion bellows "huff". The croupier: "Rien ne va plus." on hand 1 | S+Y |
| **Lock (Flamber)** | a match strike, then the flame catches (whoosh) | S |
| Ante | two chips clack into the pot | S |
| À vous (your bet) | `turn`, re-voiced as two accordion reeds | Y |
| Min | one chip set down | S |
| Max | a stack pushed forward (3–4 clacks) + a rising accordion swell | S+Y |
| Rival's Min / Max | the same, rival distance, with their speech bubble | S |
| The last push | the music's stakes layer comes in (MUSIC.md §5) and a heartbeat thump under the slips | Y |
| Reveal | the rival's cards flip one by one | S |
| **Count-up: a Value step** | a dry accordion button note, the next chord tone up (§5) | Y |
| **Count-up: a +Hype step** | the same note plus a bellows swell and a flame flick | Y+S |
| **Count-up: a ×Hype step** | a full musette chord stab an octave up, and a fire whoosh | Y+S |
| **Count-up: a Grade step** | a gold stamp slam and a bell harmonic (`gradeUp` re-voiced) | S+Y |
| Collectible fires (vitrine) | a glass clink from the case, then its stat's sound | S |
| Appraisal reels spin | a soft mechanical ratchet | S |
| Each digit locks | a clack and one note of the tonic arpeggio, rising | S+Y |
| Heat: ≥ 1× `REF_SCORE` (gold) | fire crackle under the number | S |
| Heat: ≥ 2× (orange) | crackle + a whoosh | S |
| Heat: ≥ 4× (white hot) | a roar, a glass-harmonica shimmer, the room swirl's sound (MUSIC.md motif, detuned) | S+Y |
| You win the hand | a short accordion cadence (V → I) | Y |
| You lose the hand | a deflating bellows wheeze, pitch dropping | Y |
| Tie hand | two flat notes | Y |
| **Knockout** | a boxing ring bell "ding-ding", a bass hit, the crowd upstairs goes "Ohhh" | S |
| Pot slides to the winner | a chip cascade | S |
| Tally line prints (Pot, House, Interest) | receipt printer ka-chunk (`thunk`) | S |
| Each $ counts up | a coin tick, rising | Y |
| Tally total | vintage cash register "cha-ching" | S |
| Spoils deal | three card slides | S |
| Take a spoil | card snap | S |
| Skip a spoil (+$1) | `coin` | Y |
| The last spoil burns | a match + a quick flame | S |
| **Flamber: no pair (grind)** | a grindstone scrape, then a +1 ting | S+Y |
| **Flamber: merge** | a whoosh as the cards fly in, the fire roars, a deep "foomp" as one card rises | S |
| ★ tier lands | a bell per star: ★1 one, ★2 two rising, ★3 three + the motif | Y |
| A Bulk card appears | a stone thunk | S |
| Boss twist revealed | a timpani hit, an ondes swoop, the music turns to La Fée Verte | S+Y |
| **Rival busts** | their last chips slide, a ceramic mask crack, the mask clatters on the felt, the motif in full | S+Y |
| You bust | the lamp buzzes and dims, a long wheeze down | S+Y |
| Run won | an accordion fanfare (the theme's last 4 bars), then the receipt prints | Y+S |

### 4.4 The tabac

| Event | Sound | Src |
|---|---|---|
| Arrive | whip-pan whoosh, `doorBell`, one second of street (moped, chatter), then the shop's room tone | S |
| The buraliste says "Bonjour." | his voice blips (§6) | Y |
| Hover shelf items | soft tick | S |
| Buy | coins on the zinc + register drawer | S |
| Can't afford | a dull tok + a tut from the buraliste | S |
| Restock | `bell`, the box slams down (`thunk`), the row slides out, new cards flick in | S |
| **Pack: shake** | a foil rustle loop, faster as it shakes | S |
| **Pack: burst** | the best foil tear we can find (`rip` until then), a 2 px punch | S |
| Pack: each flip | card flip, +1 semitone per card | S |
| Pack: a rare | flip + a sparkle chime | S+Y |
| **Pack: the god pull** | the music ducks out, a heartbeat on the held card. On the flip: a glass harmonica swell, a fée verte whoosh, and the buraliste's lighter drops on the zinc | S+Y |
| Card to Deck | card snap into the deck | S |
| Card to Binder | plastic sleeve slide | S |
| Binder page | page turn | S |
| Sell | coins counted onto the zinc | S |
| STONKS hot match | a ticker chime | Y |
| Scratcher torn off the roll | a paper tear | S |
| Scratching | a foil scratch loop, pitch and gain follow drag speed (`scratch`) | S |
| A window clears | `tick` | Y |
| Insert matched: Code | a typewriter clack-clack-ding | S |
| Insert matched: Checklist | a pen tick | S |
| Insert matched: Wishlist | a sparkle chime | Y |
| Insert matched: Grail | an organ chord, the motif | Y |
| Ship: La Poste | a rubber stamp + a bicycle bell | S |
| Ship: Chronopost | a scooter beep | S |
| Ship: Fourgon blindé | a heavy vault door clank | S |
| Grading back | parcel cardboard, the slab clicks shut, the grade counts up and stamps (`gradeUp`) | S+Y |
| Buy a Sleeve | plastic fwip | S |
| Bulk bin | a stone dropped in a metal bin | S |
| Le Patron collects | a heavy coin bag on the counter, a pen scratch on the marker | S |
| Leave | `doorBell` + whoosh | S |

---

## 5. The accordion count-up

The Balatro move: each step of the Appraisal plays a note that's higher than the last. Ours is an accordion, and it's **chord-aware**.

**The voice** (synth, in `sound.ts`). A musette accordion is 3 reeds per note: one in tune, one sharp, one flat. Their beating is the "wet" French shimmer.

- 3 oscillators per note, each a pulse wave at ~30% duty (a `PeriodicWave`), at 0, +14 and −14 cents. That gives ~5 Hz beating around A4.
- A `BiquadFilter` lowpass at 2.8 kHz, and a peaking bump at 1.2 kHz (+4 dB) for the reed honk.
- Envelope: 10 ms attack (bellows, not a pluck), short sustain, 80 ms release. A burst of filtered breath noise on the attack, −24 dB.
- Count-up steps are **staccato**: 90 ms long, a single reed for Value steps, all 3 reeds for ×Hype stabs.

**The pitch.** The music player (MUSIC.md §6) knows the chord under the current beat. Each step plays the **next chord tone above the last one**, starting from the chord's root around F3. So over Fm7 the count-up climbs F–A♭–C–E♭–F…, over C7 it climbs C–E–G–B♭… It always harmonizes with the music, however long the chain. With the music off, it climbs F minor pentatonic.

This is a deliberate step past Balatro, whose count-up ramps +0.3 semitone per trigger without caring about key. We keep its feel (start a little low, climb every trigger) and land every note on a chord tone.

- A Hype step adds a bellows swell under the note.
- A ×Hype step jumps an octave and plays the whole chord.
- A Grade step is the stamp + a bell, and the next step starts an octave higher.
- The final digit locks play the tonic arpeggio, and the last lock plays the tonic chord.

`tick(n)` keeps its signature. The new pitch logic lives in `tick`, so the call sites in `duel.ts` and `shop.ts` don't change.

---

## 6. Voices: blips, Undertale style

No recorded speech. Every line of dialogue types out letter by letter, and each speaker has a **voice**: one short synth note, played again and again as the letters land. The note *is* the character. Undertale does this, and so did Balatro's Jimbo babble.

- **Typing:** 30 letters a second. A blip on every second letter, none on spaces and punctuation. A click shows the whole line at once.
- **A blip** is 45 ms: a quick attack, no tail. The pitch moves a little between blips, picked from the **current chord's tones** (the same `chordAt` as the count-up, MUSIC.md §6), so every voice talks in key with the song.
- **Punctuation:** "…" is three slow blips, "!" makes the last blip a step higher and louder, "?" bends the last one up.
- Speech bubbles stay in French as written ("Tapis.", "Bonjour."). The blips carry the tone, the text carries the words.

| Speaker | Voice | Register |
|---|---|---|
| Le buraliste | one gruff accordion reed, a little flat, slow (every third letter) | low, around A2–E3 |
| The croupier (off screen: "Rien ne va plus.", "Faites vos jeux.") | a muted trumpet "wah": square wave through a moving bandpass | middle |
| Le Patron | a deep bassoon-ish reed, very slow, with a sub thump on the first blip | the lowest |
| La Fée Verte (boss twist lines, if any) | a glass harmonica tone, two notes at once, a slow vibrato | high |

The 10 rivals each get a voice from their mask:

| Rival | Voice |
|---|---|
| Le Lièvre | a quick high pluck, nervous, every letter |
| Pierrot | a sad soft sine, slow, bends down at the end of lines |
| Le Domino Noir | a low clarinet tone, even and cool |
| Le Domino Rouge | a bright reedy square, fast, a little too loud |
| Arlequin | a celesta, jumping wide intervals |
| La Dame de Cœur | a warm flute-like sine with vibrato |
| Le Roi de Pique | a brass stab, slow and heavy |
| La Chouette | a hollow ocarina, two blips per word like a hoot |
| Scaramouche | a buzzy kazoo (a saw through a nasal bandpass) |
| Le Renard | a muted guitar pluck, slightly swung |

Behind a mask, every rival's voice gets a 2.5 kHz lowpass. The crowd upstairs ("Ohhh!" on a knockout) is a sample, not a voice: a Sonniss crowd, lowpassed.

---

## 7. Ambience

| Scene | Bed | Notes |
|---|---|---|
| Duel | low room tone, the casino crowd upstairs (lowpassed to 400 Hz), the lamp's buzz | Every 20–40 s, a random glass clink or a far cough. Never during the count-up |
| Tabac | a wall clock tick, the fridge hum, the street behind the door | The music here comes from the buraliste's radio (MUSIC.md, Le Tabac) |
| Boss rounds | the crowd drops out, a low drone takes its place | The room is tripping |

Each bed is one looped `.ogg`, 20–30 s, with its loop points cut at zero crossings.

---

## 8. Code

No framework, no registry. `sound.ts` stays the one place that makes sound, and its exports stay named functions per event.

```
art/sfx/raw/                the pulled sources the build uses, untouched (CC0)
art/sfx/sounds.txt          output name → max length, highpass, raw file globs. pack credit lines
art/sfx/build.py            ffmpeg + numpy: trim, clean, normalize, pack → sfx.ogg + sfx.json + CREDITS.md
art/sfx/sfx.ogg, sfx.json   the atlas: 41 sounds, ~186 takes, 68 s, 0.76 MB
src/ui/sound.ts             the mixer, the atlas, play(), the synth voices, the speaker blips, ambience, one export per event
src/ui/music.ts             the music player (MUSIC.md): synced loops, crossfades, chordAt
```

- `play(name, { rate, gain, x, far, delay })` picks the next take round-robin, applies the random pitch/gain, the pan from `x` and the far side's lowpass. Sample names are typed from `sfx.json`.
- The atlas downloads at boot. The AudioContext and the decode wait for the first click or key.
- **The duel hears the view, not the clicks:** `listen(prev, next)` in `duel.ts` diffs each `DuelState` (dealt cards, picks, locks, bets, reveal, spoils, pot), so online play sounds the same as solo.
- **Nothing clickable is silent:** each scene's click handler notes `sfx.played()` before the click and calls `sfx.quietSince()` after, which plays the press if the click made no sound of its own. Disabled tickets get the dull tok.
- **Hovers:** each scene calls `sfx.hover(key)` once a frame with whatever is under the mouse (a hit's index and size, or a card's id). A new key plays the tick.
- The music player plugs into `sfx.context()` and `sfx.musicBus()`. The count-up and the blips read `chordAt` from `music.ts`.
- The engine never touches sound.

---

## 9. Build order

Tonight (Thu Nov 19). Friday is demo day: levels and fixes only.

| # | What | Done when |
|---|---|---|
| 1 | The mixer, buses, limiter, loader, `play()`, volume sliders, **M** to mute | A sample plays panned with no delay |
| 2 | Kenney Casino Audio + Freesound CC0 cards through `art/sfx/build.py`, wired to deal, select, chips, flips | The duel sounds physical and crisp |
| 3 | The accordion voice and the chord-aware `tick` | The count-up sings |
| 4 | Hovers and presses on every interactable (§4.1) | Nothing clickable is silent |
| 5 | The music (MUSIC.md, its own session) | The three variations crossfade between scenes |
| 6 | The rest of §4, the big moments first: Appraisal, KO, god pull, Flamber, bust | Every row of §4 plays |
| 7 | Speaker blips (§6) on every speech bubble | Every character talks |
| 8 | Ambience beds | The room is alive |

---

## 10. Still open

- Safari's Ogg support is uneven. Chrome is the demo target; if Safari matters later, ship `.m4a` copies.
- Speech bubbles appear all at once today. Typing them out (§6) is a small change in `duel.ts` and `shop.ts`.
- Whether hovers on the rival's cards (you can't act on them) make a sound. Default: no.
