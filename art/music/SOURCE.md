# Where the melody comes from

**Erik Satie, *Gnossienne No. 1*** (1890, published 1893). Satie died in 1925, so the composition is public domain.

The notes were read from the Mutopia Project engraving:

| | |
|---|---|
| Piece | Mutopia-2015/07/23-2035, "Gnossienne No. 1" |
| Engraved by | Knute Snortum, from the Éditions Salabert edition (Paris, 1913) |
| License | the engraving is [CC BY-SA 4.0](http://creativecommons.org/licenses/by-sa/4.0/) |
| Files | `no_1.ly` (8,292 B, sha256 `f1f5d6a0…a37fdb`) and `no_1.mid` (7,635 B, sha256 `f49fc6c6…71708a`) from `https://www.mutopiaproject.org/ftp/SatieE/Gnossienne/no_1/` |
| Fetched | Nov 19 2026, into `art/music/out/source/` (not committed) |

Only the melody's pitches and their order are taken from it, and those are Satie's. None of the engraving, its layout or its MIDI performance is copied into the game. We credit Mutopia anyway.

## What was taken

Satie's right hand, in its own key (F minor with a raised B and D, the "Gnossienne" scale with the A♭–B augmented second). In `gnossienne.py` each Satie bar of 4 slow beats becomes one 7/4 bar, its two half notes landing on the "four" and the "three" of the bar:

| Theme | Satie's bars | Notes (the grace notes in brackets) |
|---|---|---|
| 1 | 9 | C E♭ D C · (C) B (C) B · C E♭ D C · (E) F (E) F · C E♭ D C · (C) B (A♭) G · (F) G (F) G · (A♭) G (G) F · F |
| 2 | 4 | (A♭) B♭ (A♭) G · (A♭) B♭ (A♭) G · (A♭) G (G) F · F |
| 3 | 6 | C D E F G B G · F (G) F · (G) F (F) E · (D♭) C (C) B · (A♭) G (G) F · F |
| 4 | 4 | C E♭ D C · (C) B · C E♭ D C · (E) F |

Everything else in the song is new: the 7/4 groove, the reharmonization, the bass, the ostinato, the drums, the form and every arrangement. Satie's own accompaniment (an F minor pedal under an oom-pah) isn't used except as the Fm pedal under theme 3.
