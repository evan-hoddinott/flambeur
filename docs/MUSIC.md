# Flambeur: music spec

One song, **"Gnossienne Flambée"**: Erik Satie's *Gnossienne No. 1* (1890, public domain) played by a smoky lounge band in 7/4, rendered as three full mixes that play in lockstep and crossfade by scene, the way Balatro does it. Sound effects are in `docs/SOUND.md`.

Nov 19 2026, from Evan's ask: Balatro's jam and vibe, a play on a French song, truly psychedelic, one song in three variations, production quality, made with the music tools on this machine.

---

## 0. Done when

- One song, three mixes (La Table, Le Tabac, La Fée Verte), sample-identical length, all started together and looped together. A score-reactive organ layer on top.
- Moving between the duel and the tabac crossfades without the song restarting. You hear the same bar in a different room.
- You can hum Satie in it, but it grooves like a band, and it feels like 2 a.m. in the casino basement.
- Loops forever with no click, gap or drift. The lab's seam check passes.
- Each mix is mastered to its loudness target (§8) and Evan has signed off by ear.
- The count-up ticks and the voice blips (SOUND.md §5, §6) land on the chord playing under them.

---

## 1. What we're taking from Balatro

From Evan's research (`~/dev/school/Senior Design/research_notes/Riff driven game music design/balatro_louisf.md`, `.../Game soundtrack production tools/balatro.md`) and his lab's reference study (`~/dev/personal-projects/music-lab/refs/STUDY.md`). We take the **method and the feel**, never its notes, riffs, samples or files. Balatro's audio lives in `~/Music/refs` for listening and measuring only. Nothing from it is rendered, sampled or shipped.

| Balatro does | Why it works | We do |
|---|---|---|
| **One song, five full mixes** of the same stems, equal length, all playing at once in lockstep. LocalThunk remixed LouisF's stems himself | the music changes mood but never restarts | **One song, three full mixes**, rendered from one score in the lab |
| A crossfade by a one-pole volume smoother, time constant ~0.33 s, toward whichever track the screen wants | seamless, and trivially robust: the visible screen decides the mix | the same: `setTargetAtTime(target, t, 0.33)` per mix |
| Written fast and **resampled to 0.7×** (−6.2 semitones), pitch and tempo together | the woozy, smoky, "underwater" character: softer transients, darker timbres, longer tails | written at **150 BPM a tritone high**, resampled by **2^(−1/2) = 0.7071** to exactly 6 semitones down, ~106 BPM. Exact, so it stays in tune with the synth sfx. And the whole song is played a *diabolus in musica* low, which suits a gambling den |
| On game over the music **slides to 0.5×** like a dying record | the loss is felt, not shown | the same glide on run lost (and a shorter dip on a bust) |
| **7/4**, an odd-meter ostinato that never lands where a 4/4 ear expects | it stays alive on loop after hundreds of hours | **7/4 grouped 4 + 3**: a bar of four, then a bar of waltz hidden inside it. The musette is in the meter |
| Lounge / jazz-funk harmony: i7 – iv9 – Vsus/V7 – IIImaj7, a ♭II7 color | casino lounge, not rock | the same palette laid over Satie's melody (§3) |
| Two layered analog leads with LFO vibrato and glides, a flanged keys ostinato, a pad, a marimba-like arp, programmed real drums, bass level with the band | it's a band, not a pad with a beat | the same roles, from the lab's `balatro.*` palette, plus an **accordion** in every mix |
| A ~4 min loop with internal sections (solos, a minimal breakdown, a return) that loops back to just after the intro | long listening without fatigue | sections in §4, the loop restarting after the intro |
| An **organ drone** that fades in with log(score ÷ target), and fire loops on big scores | the score *sounds* bigger, not only looks bigger | **L'Orgue**: a synced organ stem driven by the Appraisal heat (§5). Fire loops are sfx (SOUND.md §4.3) |
| Music at 0.6 under the sfx | feedback always wins | music −14 dB under the sfx (SOUND.md §3) |

---

## 2. Why Gnossienne No. 1

- **It's public domain.** Satie wrote it in 1890 and died in 1925. The composition is free everywhere. **Modern editions and MIDI files are not automatically free**: transcribe from a public-domain scan (IMSLP) or a public-domain/CC0 engraving (Mutopia), and record the source in `art/music/SOURCE.md`.
- **It's the right era and the right room.** Satie played piano at Le Chat Noir, a Montmartre cabaret, in the same years as our Belle Époque casino. He's the house pianist of our world.
- **It's already psychedelic.** Free time with no bar lines, a minor key with an exotic augmented second, a hypnotic oom-pah left hand, instructions in the score like "du bout de la pensée". It wants to be slowed, flanged and looped.
- **It has no meter of its own**, so setting it in 7/4 is a fair reading, not a mangling.
- **It's recognizable** to anyone who's heard it, so it lands as "a play on a French song", and it's still ours.

The rule: **keep Satie's melody, rewrite everything under it.** The melody is quoted, ornamented and broken into riffs. The harmony, groove, bass, ostinato and every other part are new.

---

## 3. The song

| | |
|---|---|
| Title | **Gnossienne Flambée** |
| Source | Erik Satie, *Gnossienne No. 1* (1890). Melody from the score, everything else new |
| Meter | 7/4, grouped 4 + 3 |
| Tempo | written ♩ = 150, played ♩ ≈ 106.07 (×0.7071) |
| Key | written B minor, **played F minor**, Satie's own key |
| Length | 40 bars written. One bar = 2.8 s written, 3.96 s played. ~2:38 played, the loop is bars 5–40 (~2:23) |

### Harmony

Satie's own harmony is mostly F minor with turns to B♭ minor and E♭. We lay Balatro's lounge palette over it where the melody allows, in played pitch:

| Role | Chord | Notes |
|---|---|---|
| i7 | **Fm7** (Fm9 in the pad) | home, long vamps: open on ~2 bars of tonic before any change |
| iv9 | **B♭m9** | Satie's own move, with the lounge 9th |
| V7 (harmonic minor) | **C7sus4 → C7** | the sus resolves late |
| IIImaj7 | **A♭maj7** | the deceptive turn instead of a cadence |
| ♭II7 | **G♭7** | the Neapolitan color: one bar per section, the "absinthe" chord |
| VI | **D♭maj7** | the B section's floor |

The harmonic rhythm is slow, about one chord per bar, with tonic vamps. The arranger picks the exact progression per section to fit Satie's melody notes. A clash between a quoted melody note and our chord is fixed by moving the chord, never the melody.

### The groove (new, not Balatro's)

- **Keys ostinato**, 14 eighths a bar, grouped **2-2-2-2 | 2-1-1-2**: four steady, then the waltz with a skip in it. Flanged, on a DX-style EP. This is the riff people should hum after Satie's tune. It must not copy Balatro's 1-1-1-2-2-2-1-2-2 figure.
- **Bass**: the root on 1, the fifth *below* on the "and" of 2, an octave pop into beat 5 (the waltz's "oom"), walking chord tones into the next bar on beat 7.
- **Drums**: a programmed jazz kit, brushes in A and Le Tabac, sticks in A″. Kick on 1 and 5, a cross-stick on 3, ghost notes on the "pah-pah" of 6 and 7. Level with the band.
- **Swing**: a light swing on the eighths (55–58%), the manouche feel.

---

## 4. Form

| Bars (written) | Section | What happens |
|---|---|---|
| 1–4 | **Intro** (plays once) | the ostinato alone, flanged and filtered, the bass sneaks in. Satie's first phrase on accordion, rubato over the grid |
| 5–12 | **A** | the full band. Satie's first phrase on the two leads in unison, the accordion doubling an octave down |
| 13–20 | **A′** | the ostinato turns into chord hits, the lead plays Satie's phrase as a riff with glides and scoops, call and response with the accordion |
| 21–28 | **B** | Satie's middle phrase (the augmented-second turn), the marimba-like arp takes a solo, the D♭maj7 floor and one bar of G♭7 |
| 29–32 | **Breakdown** | minimal: bass carrying the chord tones, a dry accordion, the kit drops out. A reversed cymbal into bar 33 |
| 33–40 | **A″** | everything back, the melody in octaves, the lead's big glide on the last phrase. Bar 40 turns back to bar 5 |

`loopStart` = the first sample of bar 5, `loopEnd` = the end of bar 40. All four files share them to the sample.

---

## 5. The mixes

Every mix plays every bar of the same score. A mix changes instruments, register, density, effects and chord color, never the tempo, form or chord roots. **The accordion is in all three**, so it's French everywhere.

| | **La Table** | **Le Tabac** | **La Fée Verte** |
|---|---|---|---|
| Where | the duel, title, draft (Balatro's main) | both shops, a won run's results (Balatro's shop) | boss rounds 3 / 6 / 9 / 12, a lost run's results (Balatro's boss) |
| The story | the house band in the back room | the same song on the buraliste's radio | the room goes absinthe |
| Melody | two layered analog leads + accordion an octave down | **accordion alone**, musette (3 reeds, wet) | **ondes Martenot**: sine + a little triangle, deep vibrato, long glides. Glass harmonica doubling it two octaves up, quiet |
| Ostinato | flanged EP | a nylon guitar plays it as manouche pompe | the EP through a slow, deep flanger and a ping-pong delay, half the notes reversed |
| Harmony | warm pad | none (the guitar is the harmony) | an **organ** holding the chords, detuned ±25 cents (seasick), chord colors pushed (Fm(maj9), C7♭9, G♭7♯11) |
| Bass | synth bass, mono | upright, plucked, thin | synth bass with a fuzz edge, an octave lower on the downbeats |
| Drums | jazz kit, brushes → sticks in A″ | brushes only, quiet | toms and timpani on the 1 and the 5, a reversed cymbal into every 4th bar, the kit's hats gone |
| Space | a dark plate (the lab's Bricasti Dark Plate IR) | a small room, then the **radio**: bandpass 300 Hz–3.4 kHz, mono, light tube saturation, vinyl crackle, 0.2 Hz wow | a long dark hall, **tape wow** ±12 cents at 0.25 Hz on the whole mix, a slow stereo drift |
| Loudness | −16 LUFS | −20 LUFS (it's across the room, mono) | −15 LUFS |

### L'Orgue (the hype layer)

A fourth synced file that plays on top of whichever mix is up. Balatro's is an organ drone; after the sketch Evan asked for "a more HYPE version", so ours is the organ plus a band that kicks in:

- a church organ holding the chords and their roots (Balatro's drone)
- a rock organ through a Leslie-ish vibrato and a little drive, on the A′ chord hits, all song long
- a driving kit in 4 + 3: kick on 1, the "and" of 2, 5 and the "and" of 6, snare and clap on 3 and 7, eighth hats, open hats on the "and" of 4 and 7, a tambourine on the offbeats, a snare roll every 4th bar
- an octave-bouncing distorted bass on the eighths
- the tune an octave up on a saw lead, quiet

It follows your running Appraisal during the count-up (`duel.ts` calls `music.heat(running ÷ REF_SCORE)` after every step):

- silent below `REF_SCORE`, then `level = 0.4 + 0.3 × log5(ratio)`: 0.4 at 1×, 0.7 at 5×, full at 25×. It only goes up during a count-up, with a 1 s constant.
- `music.cool()` at the end of the count-up holds it 2.5 s, then fades it out (1.5 s constant).
- Mono, mastered 3 dB under La Table, so at full it adds about 2 dB and a lot of drive.

---

## 6. The player (`src/ui/music.ts`)

- **Files:** `public/music/table.ogg`, `tabac.ogg`, `fee.ogg`, `orgue.ogg`, and `public/music/gnossienne.json` with the sample rate, BPM, bar length, `loopStart`/`loopEnd` in samples, and the **chord tones of every beat in played pitch** (MIDI numbers).
- **Start:** fetch and decode all four after the title's first click. Start four `AudioBufferSourceNode`s at the same `when`, `loop = true`, with the shared loop points. Never restart one alone.
- **Mix:** a `GainNode` per file into the music bus. `setScene('table' | 'tabac' | 'fee')` ramps the targets with `setTargetAtTime(…, 0.33)`. `heat(ratio)` / `cool()` / `setOrgan(level)` move l'orgue with a 1 s constant.
- **Wiring:** `main.ts` starts it on the first click or key with `music.start(sfx.context(), sfx.musicBus())`, and `followMusic()` in `draw()` picks the scene from the phase every frame (`setScene` and `glide` do nothing when nothing changed).
- **Boss:** switch to `fee` at the next bar line after the twist is revealed.
- **Pitch mod:** `glide(rate, seconds)` moves `playbackRate` on all four sources together, so they stay in sync. Run lost: → 0.5 over ~2 s and hold. Bust: → 0.8 and back over 1.5 s. The god pull's held card: the music bus ducks to −24 dB, the rate stays.
- **chordAt(time):** the song position from the start time and the playback rate history, then the chord tones at that beat from the JSON. `sfx.tick` and the voice blips read it.
- **Ducking** stays in `sound.ts`'s music bus (SOUND.md §3).
- **Memory:** a decoded buffer is float32 at the context's rate, whatever the file's rate. 2:38.4 of 48 kHz stereo is 60.8 MB, so La Table and La Fée Verte are 60.8 MB each and the mono Le Tabac and L'Orgue 30.4 MB each: **182 MB** decoded, 9.5 MB of Ogg to download.

---

## 7. How it's made

With Evan's **music-lab** (`~/dev/personal-projects/music-lab`, also at `~/Music/game-composition/toolkit`): songs written as Python, rendered headless through Surge XT, sfizz and FluidSynth, with Pedalboard effects, analysis reports and learned listeners. `songs/dial_theme.py` already renders one song in variations (main / tense / all) and is the pattern to follow.

```
art/music/SOURCE.md        where the Satie melody came from (edition, URL, license) and what was transcribed
art/music/gnossienne.py    the song: Satie's melody, the new parts, the form, the three mixes, the hype layer and the stingers, as lab Tracks
art/music/build.py         renders through the lab, resamples ×0.7071, loudness-matches, cuts the loop, writes public/music/
art/music/out/             WAVs, stems, reports. Not committed
public/music/*.ogg         48 kHz Vorbis q5, plus gnossienne.json
```

### The instruments (all already installed)

| Role | First try | Alternatives |
|---|---|---|
| Two leads | `balatro.lead` recipe (Surge *Leads/Moogy Saw* + *Leads/Butter*), vibrato and scoops from `soundtrack.dsp` | Obxd, Vitalium |
| Keys ostinato | `balatro.keys` (Surge *Keys/DX EP*) + `Flanger` | jRhodes3d (sfz), Dexed |
| Accordion | GeneralUser GS *Accordion* / *Tango Accordion* (sf2) | a Surge musette patch: 3 detuned pulse oscillators (0, ±14 cents), reed formant at 1.2 kHz |
| Pad | Surge *Pads/MKS-70 Warm Pad* | Surge *Pads/Pad 1* |
| Arp (marimba-like) | Surge *Plucks/FM Pluck* | GeneralUser marimba |
| Bass | Surge *Basses/Mellow* | Karoryfer basses (write them an octave up), `dsmolken.double-bass` for Le Tabac |
| Nylon guitar | Karoryfer guitars (sfz) | GeneralUser nylon |
| Drums | AVL *Blonde Bop* (a jazz kit, LV2/sf2) | Virtuosity drums, DrumGizmo Muldjord |
| Organ | GeneralUser organ | Surge organ patches, Cardinal |
| Ondes Martenot | Surge, sine + triangle, 6 Hz vibrato, 80 ms glide | Vitalium |
| Glass harmonica / celesta | VSCO-2-CE / VirtualPlayingOrchestra3 | Surge *Plucks/Bell 1* |
| Timpani | VirtualPlayingOrchestra3 | VSCO-2-CE |
| Radio crackle | Calf's *Crackle.sf2* / *Static.sf2* (`/usr/share/calf/sf2`) | lab noise |
| Space | the lab's Bricasti M7 Dark Plate IR (`ConvolutionReverb`), Dragonfly Hall, `SpaciousReverb` | TAL-Reverb |
| Tape / saturation | the lab's tape treatment, ZamTube, gxtape | Pedalboard |
| Master | ZaMaximX2 or Pedalboard limiter, the lab's `master.py` / matchering | LSP plugins |

REAPER is there for hand edits: `lab.bridge` opens the song live so Evan can move notes while the session reads them back.

### The quality loop

1. Render. The lab writes metrics (LUFS, peak, band balance, stereo, key, chords per bar, **loop seam click check**) and a report PNG for each mix.
2. Check the numbers against the intent: played key F minor, ~106 BPM, chords as written, loudness targets, no seam click, mono below 140 Hz.
3. Run the learned listeners (`--ears`): audiobox aesthetics to compare versions, Music Flamingo to describe the mood and diff it against "smoky lounge band in a Belle Époque casino basement, hypnotic, psychedelic". Its key and chord claims aren't trusted.
4. Compare band balance and loudness with Balatro's music1 in `~/Music/refs` (measuring only).
5. Put every take on one audition page for Evan, with the three mixes switchable in sync and a fake "count-up" button, so he judges it the way the game will use it. **His ears are the final call.**

---

## 8. Mix and master

- **Loudness:** La Table −16 LUFS, Le Tabac −20, La Fée Verte −15, L'Orgue −19 (3 dB under La Table: it's the hype, it should be felt). True peak ≤ −1 dBTP everywhere. Stingers −16 LUFS.
- **The crossfade must not jump:** La Table ↔ La Fée Verte within 1 LU, so the boss switch feels like the room changing, not a volume knob. Le Tabac is quieter on purpose.
- **Leave room for the sfx:** cut 2–4 kHz a little in the leads (the card sounds live there), and keep the melody out of the count-up's register (F3 and up gets the ticks, so the leads live around them, not on them).
- **Low end:** mono below 140 Hz, no sub below 45 Hz. Check it on laptop speakers (the demo).
- **The 0.7071 resample happens before mastering**, so the limiter sees what the player hears.

---

## 8.5 What came out (Nov 19)

| File | LUFS | True peak | Channels | Seam |
|---|---|---|---|---|
| `table.ogg` | −16.0 | −4.8 dBTP | stereo | jump 0.074, typical 0.085 |
| `tabac.ogg` | −20.0 | −7.9 | mono | 0.021 / 0.047 |
| `fee.ogg` | −15.0 | −5.3 | stereo | 0.040 / 0.039 |
| `orgue.ogg` | −19.0 | −4.9 | mono | 0.047 / 0.097 |

- Every file is 7,602,812 samples (2:38.4 at 48 kHz). `loopStart` 760,281 (bar 5, 15.84 s), `loopEnd` 7,602,812, so the loop is 2:22.6. ♩ = 106.07, a bar is 3.96 s.
- The seam check is the lab's `loop_seam` on the loop alone. La Fée Verte's tape wow first clicked there (a 0.31 jump): its constant 4 ms offset read intro audio at the loop start. The wow's delay is now zero on the loop line.
- La Table + full hype is −12.8 LUFS, peak −1.3 dBFS; the master limiter in `sound.ts` catches the rest.
- Balatro's music1 for comparison (measured, not copied): −17 LUFS, stereo correlation 0.75, bands 13 / 49 / 35 / 2.3 / 0.7 % (sub / bass / low-mid / presence / air). La Table's sketch: −16, 0.81, 6 / 39 / 51 / 4 / 0.2. Ours has less sub and more low-mid, which suits laptop speakers.
- The learned listeners: on La Table, Music Flamingo heard "cinematic orchestral" (the leads read as horns), aesthetics CE 7.02 / CU 7.80 / PC 4.92 / PQ 7.94. La Table + full hype: "energetic… euphoric… peak-time dancefloor", CE 7.27 / CU 7.71 / PC 5.86 / PQ 7.63. Evan on the sketch: "PEAK", plus the ask for a hype version.

---

## 9. Stingers

Short cues on the sfx bus, rendered by the same lab session from the song's own instruments and in played F minor, so they sit over any mix. They play right away, not quantized. Files: `public/music/sting-*.ogg`.

| Cue | Built from | Instrument |
|---|---|---|
| Hand won | the last cadence of A″ | leads + accordion |
| Hand lost | Satie's first phrase, slowed and bent down | accordion, bellows running out |
| Knockout | the phrase as a fast run up into a G♭7 stab, then Fm | full band |
| Boss twist | the phrase on the ondes, over a timpani roll | ondes + timpani |
| God pull | the phrase two octaves up | glass harmonica |
| ★3 / Grail | the phrase over a held D♭maj7 → Fm(maj9) | organ |
| Rival busts | the whole phrase, loud, with the kit | full band |
| Run won | A″'s last 4 bars with a ritardando and a held chord | full band |

Rendered by `build.py` (`build.py stings` alone) to `public/music/sting-{won,lost,knockout,boss,pull,grail,bust,runwon}.ogg`, −16 LUFS each, 3.7–11.3 s with their tails, 908 KB in all. Run won's ritardando is written into the note lengths, since the lab has no tempo map. Playing them is `sound.ts`'s job (the sfx bus), not wired yet.

---

## 10. Build order (its own session)

| # | What | Done when |
|---|---|---|
| 1 | `SOURCE.md` + Satie's melody transcribed from a public-domain edition | the melody plays back right against the score |
| 2 | `gnossienne.py`: the groove, harmony and form in La Table only | 4 bars sound like a band; Evan hears a sketch |
| 3 | The full La Table, rendered and resampled, the loop cut | it loops 5 minutes clean, the seam check passes |
| 4 | Le Tabac, La Fée Verte, L'Orgue | the four files are sample-identical in length |
| 5 | Mix and master (§8), the quality loop (§7) | the numbers hit, Evan signs off |
| 6 | `music.ts`: load, sync, crossfade, glide, `chordAt`, wired to scenes, the boss and the heat | the three mixes swap in the game with no restart |
| 7 | The stingers (§9) | every row plays |

---

## 11. Still open

- **The source.** Gnossienne No. 1 is the pick. Backups, all public domain: Satie's *Gymnopédie No. 1* (3/4, dreamy, major), Saint-Saëns's *Danse macabre* (a waltz with a tritone, born for a boss), Offenbach's *Barcarolle* (6/8, lush), *Le Temps des cerises* (1866, the chanson).
- **The download size.** 9.5 MB for the song, 0.9 MB for the stingers. Fine for the demo.
- **The bust glide** (→ 0.8 and back) and the stingers are rendered but not wired: they belong with the sfx events in `sound.ts`.
- **Safari.** Ogg Vorbis support is uneven. Chrome is the demo target.
