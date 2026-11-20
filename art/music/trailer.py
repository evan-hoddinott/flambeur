"""Gnossienne Flambée, trailer cut: the game's song as a 2:30 epic for the YouTube trailer.

Same melody, chords, key (F minor) and 7/4 grid as the game (gnossienne.py, docs/MUSIC.md), played straight at the
game's tempo with an orchestra, a choir, braams and a rock kit over the band. No tape slowdown: a trailer wants hard
transients. One tempo the whole way, so the edit cuts on a fixed bar grid (a bar is 3.96 s).
Rendered by `build.py trailer` -> art/music/out/trailer/, with stems and the cue sheet for the edit.

  bars   section  what happens
  1-4    cold     the accordion alone with satie's phrase, a low drone, a celesta. a riser into
  5-8    ignite   a braam, then the machine starts: string ostinato, timpani, horns low with the tune
  9-16   main     the whole band and orchestra, the tune on brass, the rock kit
  17-18  joke     a hit, then the record stops. two beats of nothing, the accordion shrugs, a snare pickup
  19-26  drive    double time: 16th strings and arp, the saw lead, the rock organ. the montage
  27-28  hold     everything drops to a choir and a ticking count-up that speeds up, then half a beat of silence
  29-36  finale   the tune in octaves on everything, gongs and bells
  37-38  logo     the last braam on f minor for the title card, and the accordion's last word
"""
from pedalboard import Compressor, Distortion, HighpassFilter, LowpassFilter

import gnossienne as g
from gnossienne import ACC, A_CHORDS, BEATS, CH, OSTINATO, THEME1, THEME2, THEME3, THEME4, bends, hall_bus, plate_bus
from lab.song import Song, Track
from soundtrack.dsp import Flanger, PingPongDelay, Vibrato

BPM = g.BPM  # the game's played tempo, ~106 bpm
VPO = "sfz:"
STRINGS_STAC = "sfz:Strings/all-strings-SEC-staccato.sfz"
STRINGS_SUS = "sfz:Strings/all-strings-SEC-sustain.sfz"
STRINGS_TREM = "sfz:Strings/all-strings-SEC-tremolo.sfz"
LOW_STAC = ["sfz:Strings/cello-SEC-staccato.sfz", "sfz:Strings/bass-SEC-staccato.sfz"]
LOW_SUS = ["sfz:Strings/cello-SEC-sustain", "sfz:Strings/bass-SEC-sustain"]
BRASS = "sfz:Brass/all-brass-SEC-sustain.sfz"
BRASS_HIT = "sfz:Brass/all-brass-SEC-accent.sfz"
HORNS = "sfz:Brass/french-horn-SEC-normal-DXF"
CHOIR = "sfz:Vocals/choir-MIXED-sustain"
TIMP = "sfz:Percussion/timpani-hit.sfz"
TIMP_ROLL = "sfz:Percussion/timpani-roll"
BELLS = "sfz:Percussion/tubular-bells"
XYLO = "sfz:Percussion/xylophone"
CELESTA = "sfz:Keys/celesta"
BASS_DRUM = "sfz:Percussion/bassdrum.sfz"
MISC = "sfz:Percussion/misc"  # gong 46, tam-tam 47
CYMBALS = "sfz:Percussion/cymbals"  # crash 66, suspended cymbal swell 69
KIT = "sfz:virtuosity_drums/Programs/01-basic-kit"
GONG, TAMTAM, CRASH_O, SWELL = 46, 47, 66, 69
KICK, SNARE, HAT, OHAT, CRASH, RIDE, TOM_LO, TOM_MID, TOM_HI = 36, 38, 42, 46, 49, 51, 41, 45, 48

# (section, satie bar or [], chord or (chord for beats 0-3, chord for 4-6)). 38 bars
FORM = (
    [("cold", m, c) for m, c in zip(THEME4, ["Fm69", "Db9", "Abmaj7#11", "C7sus4"])]
    + [("ignite", m, c) for m, c in zip(THEME1[:4], A_CHORDS[:4])]
    + [("main", m, c) for m, c in zip(THEME1, A_CHORDS + [("Fm9", "Dbmaj9")])]
    + [("joke", [], "Fm9"), ("joke", [], "Fm9")]
    + [("drive", m, c) for m, c in zip(THEME2 + THEME3[:4],
                                       ["Bbm9", "Eb9", "Abmaj7", "Gbmaj7", "Fmmaj9", "Fmmaj9", "Fmmaj9", ("G7sus4", "G7")])]
    + [("hold", [], "C7sus4"), ("hold", [], ("C7sus4", "C7"))]
    + [("finale", m, c) for m, c in zip(THEME1, A_CHORDS + [("Fm9", "C7")])]
    + [("logo", [], "Fm9"), ("logo", [], "Fm9")]
)
BARS = len(FORM)
assert BARS == 38, BARS
BAR_S = BEATS * 60 / BPM


def sec(*names):
    return [i for i, (s, _, _) in enumerate(FORM) if s in names]


def first(name):
    return sec(name)[0]


def chords(bar):
    c = FORM[bar][2]
    return [(0, 7, c)] if isinstance(c, str) else [(0, 4, c[0]), (4, 3, c[1])]


def root(bar, beat=0.0):
    return CH[next(n for s, ln, n in chords(bar) if s <= beat < s + ln)][0]


def at(bar, beat=0.0):
    return bar * BEATS + beat


# --- parts: (beat, pitch, length, velocity) over the whole cue ------------------------------------------------

def tune(bars, octave=0, vel=96, k=.97):
    return [(at(b, t), p + 12 * octave, ln * k, vel - (16 if ln <= .25 else 0)) for b in bars for t, p, ln in FORM[b][1]]


def ostinato(bars, octave=0, vel=0):
    """the game's keys riff, 2-2-2-2 | 2-1-1-2, on each chord's voicing"""
    out = []
    for b in bars:
        for s, ln, name in chords(b):
            v = CH[name][1]
            out += [(at(b, t), v[i] + 12 * octave, d * .6, min(127, vv + vel)) for t, i, d, vv in OSTINATO if s <= t < s + ln]
    return out


def sixteenths(bars, octave=0):
    """a running 16th arpeggio up and down two octaves of the voicing (the drive section's motor)"""
    seq = (0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 1, 3, 2, 4, 3, 5)
    out = []
    for b in bars:
        for s, ln, name in chords(b):
            v = CH[name][1]
            tones = [p + 12 * octave for p in v] + [v[0] + 12 * (octave + 1), v[1] + 12 * (octave + 1)]
            for k in range(ln * 4):
                out.append((at(b, s + k / 4), tones[seq[k % len(seq)]], .22, 100 if k % 4 == 0 else 74))
    return out


PULSE = (0, 2, 4, 6, 8, 10, 11, 12)  # eighths where the 2-2-2-2 | 2-1-1-2 groups start: accented


def pulse(bars, octave=0, vel=100):
    """low strings hammering eighths on the root, accents on the riff's groups"""
    out = []
    for b in bars:
        for e in range(14):
            r = root(b, e / 2)
            out.append((at(b, e / 2), r + 12 * octave, .4, vel if e in PULSE else vel - 30))
    return out


def held(bars, octave=0, vel=80, top=True):
    """the voicing held for each chord"""
    return [(at(b, s), p + 12 * octave, ln - .05, vel) for b in bars for s, ln, n in chords(b) for p in CH[n][1][(0 if top else 1):]]


def roots(bars, octave=0, vel=96, length=None):
    return [(at(b, s), CH[n][0] + 12 * octave, (length or ln) - .05, vel) for b in bars for s, ln, n in chords(b)]


def stabs(bars, vel=110):
    """chord hits on the downbeat and the 5, the riff's two groups"""
    out = []
    for b in bars:
        for s, ln, n in chords(b):
            hits = [0, 4] if ln == 7 else [0]
            out += [(at(b, s + t), p, .6, vel) for t in hits for p in CH[n][1]]
    return out


def octave_bass(bars, step=.5):
    out = []
    for b in bars:
        for s, ln, n in chords(b):
            r = CH[n][0]
            k = int(ln / step)
            out += [(at(b, s + i * step), r + 12 * (i % 2), step * .8, 108 if i % 2 == 0 else 90) for i in range(k)]
    return out


def braam(bar, name="Fm9", beat=0, length=6.0, vel=124):
    """low brass, fortissimo: root, fifth and minor third stacked low"""
    r = CH[name][0]
    return [(at(bar, beat), p, length, vel) for p in (r, r + 7, r + 12, r + 15, r + 19)]


def count_up(bar):
    """the count-up's ticks on xylophone over two bars: eighths, then sixteenths, then thirty-seconds, climbing
    the c7 chord, cut off half a beat before the finale"""
    tones = [p for o in (0, 12, 24, 36) for p in (60 + o, 64 + o, 67 + o, 70 + o) if p <= 103]
    out, t, k = [], 0.0, 0
    while t < 13.5 - 1e-6:
        step = .5 if t < 7 else .25 if t < 11 else .125
        out.append((at(bar, t), tones[min(k * len(tones) // 46, len(tones) - 1)], .1, 70 + int(50 * t / 13.5)))
        t += step
        k += 1
    return out


def drive_kit(bars):
    """the main groove: 4 + 3 rock backbeat. kick on 1, the and of 2, 5, the and of 6; snare on 3 and 7"""
    out = []
    for b in bars:
        o = at(b)
        out += [(o + t, KICK, .3, 118) for t in (0, 1.5, 4, 5.5)]
        out += [(o + t, SNARE, .3, 112) for t in (2, 6)]
        out += [(o + t / 2, HAT, .2, 84 if t % 2 == 0 else 60) for t in range(14)]
        if b % 4 == 3:
            out = [n for n in out if not (o + 6 <= n[0] and n[1] in (SNARE, HAT))]
            out += [(o + 6 + i / 4, SNARE, .2, 80 + 10 * i) for i in range(4)]
    return out


def double_kit(bars):
    """double time: kick on every beat, snare on the 2, 4, 6 and the and of 7, 16th hats, open hats on the ands"""
    out = []
    for b in bars:
        o = at(b)
        out += [(o + t, KICK, .3, 116) for t in range(7)] + [(o + 3.75, KICK, .3, 90)]
        out += [(o + t, SNARE, .3, 114) for t in (1, 3, 5, 6.5)]
        out += [(o + t / 4, HAT, .1, 80 if t % 2 == 0 else 52) for t in range(28) if t % 4 != 2]
        out += [(o + t + .5, OHAT, .3, 78) for t in (0, 2, 4)]
        if b % 4 == 3:  # 16th snare roll climbing into the next phrase
            out = [n for n in out if not (o + 5 <= n[0] and n[1] in (SNARE, HAT, OHAT))]
            out += [(o + 5 + i / 8, SNARE, .1, 70 + 3 * i) for i in range(16)]
    return out


def tom_build(bar):
    """toms walking up into the main section"""
    o = at(bar)
    return ([(o + t, TOM_LO, .3, 100) for t in (0, 1, 2, 3)] + [(o + 4 + t / 2, TOM_MID, .3, 96 + 2 * t) for t in range(4)]
            + [(o + 6 + t / 4, TOM_HI, .2, 104 + 4 * t) for t in range(4)])


def riser_into(bar):
    """the lab's reversed cymbal ends on its beat"""
    return [(at(bar), "riser", 110)]


# --- the cue ------------------------------------------------------------------------------------------------------

def musette(name, notes, layer, gain_db, pan=0.0, sends=None):
    """three accordion reeds: in tune, sharp, flat (gnossienne.musette, own layer and sends)"""
    return [Track(name, ACC, notes, gain_db=gain_db, pan=pan, layer=layer, sends=sends or {}),
            Track(f"{name}_sharp", ACC, notes, gain_db=gain_db - 5, pan=pan + .2, layer=layer, bends=bends(14), sends=sends or {}),
            Track(f"{name}_flat", ACC, notes, gain_db=gain_db - 5, pan=pan - .2, layer=layer, bends=bends(-14), sends=sends or {})]


def cue():
    cold, ignite, main, drive, hold, finale = (sec(s) for s in ("cold", "ignite", "main", "drive", "hold", "finale"))
    joke, logo = first("joke"), first("logo")
    big = main + finale
    loud = ignite + main + drive + finale
    lead_fx = lambda: [HighpassFilter(220), Vibrato(rate_hz=4.6, depth_cents=16), PingPongDelay(bpm=BPM, beat_fraction=.75, feedback=.25, mix=.14)]

    # the accordion's lines: satie alone in the cold open, an octave under the brass later, the shrug, the last word
    shrug = [(at(joke + 1, 2 + t), p, ln, 92) for t, p, ln in ((0, 72, .4), (.5, 75, .4), (1, 74, .4), (1.5, 72, .9), (3, 71, .2), (3.25, 72, .5))]
    last_word = [(at(logo + 1, 1.75), 67, .2, 90), (at(logo + 1, 2), 65, 2.5, 96)]
    pickup = [(at(joke + 1, 6 + i / 8), SNARE, .1, 60 + 6 * i) for i in range(8)]

    perc = [
        Track("kit", KIT, tom_build(ignite[-1]) + drive_kit(main + finale) + double_kit(drive)
              + [(at(b), CRASH, 2, 120) for b in (first("main"), first("drive"), first("finale"), first("main") + 4, first("drive") + 4, first("finale") + 4)],
              kit=True, gain_db=10, layer="perc", sends={"plate": .06},
              fx=[HighpassFilter(40), Compressor(threshold_db=-16, ratio=3, attack_ms=10, release_ms=120)]),
        Track("bassdrum", BASS_DRUM, [(at(b, t), 38, 1, 120) for b in ignite + big for t in (0, 4)] + [(at(b), 38, 2, 127) for b in (first("ignite"), logo)],
              gain_db=6, layer="perc", sends={"hall": .25}),
        Track("gong", MISC, [(at(b), GONG, 6, 127) for b in (first("ignite"), first("main"), first("finale"), logo)]
              + [(at(b), TAMTAM, 6, 110) for b in (first("drive"),)], gain_db=2, layer="perc", sends={"hall": .35}),
        Track("cymbals", CYMBALS, [(at(b - 1, 2.5), SWELL, 4.5, 110) for b in (first("main"), first("drive"))]
              + [(at(b), CRASH_O, 3, 120) for b in (first("ignite"), first("main"), first("finale"), logo)], gain_db=-6, layer="perc", sends={"hall": .3}),
        Track("risers", None, riser_into(first("ignite")) + riser_into(first("main")) + riser_into(first("drive")) + riser_into(first("finale")),
              drums=True, gain_db=-9, layer="perc", sends={"hall": .2}),
        Track("sub", None, [(at(b), "kick:43.65", 127) for b in (first("ignite"), first("main"), first("drive"), first("finale"), logo)]
              + [(at(b, t), "kick:43.65", 100) for b in big for t in (0, 4)], drums=True, gain_db=-1, layer="perc"),
        Track("timp", TIMP, [(at(b, t), root(b, t) if root(b, t) >= 36 else root(b, t) + 12, 2, 112 if t == 0 else 96)
                             for b in ignite + big for t in (0, 4)], gain_db=4, layer="perc", sends={"hall": .3}),
        Track("timp_roll", TIMP_ROLL, [(at(cold[-1], 3), 41, 4, 90), (at(hold[0]), 48, 13.5, 100), (at(first("main") - 1, 4), 41, 3, 100)],
              gain_db=0, layer="perc", sends={"hall": .3}),
    ]

    orch = [
        *[Track(f"low_drone{i}", p, roots(cold, 0 if i == 0 else 0, 64), gain_db=2, layer="orch", sends={"hall": .4}, fx=[HighpassFilter(30)])
          for i, p in enumerate(LOW_SUS)],
        *[Track(f"low_pulse{i}", p, pulse(ignite[1:] + main + drive + finale, 0, 104), gain_db=4, layer="orch", sends={"hall": .2}, fx=[HighpassFilter(35)])
          for i, p in enumerate(LOW_STAC)],
        Track("str_ostinato", STRINGS_STAC, ostinato(ignite[2:] + big, 0, 20), gain_db=4, pan=-.1, layer="orch", sends={"hall": .25}),
        Track("str_16ths", STRINGS_STAC, sixteenths(drive, 0), gain_db=2, pan=.1, layer="orch", sends={"hall": .2}),
        Track("str_high", STRINGS_SUS, tune(big, 1, 92), gain_db=0, layer="orch", sends={"hall": .35}, fx=[HighpassFilter(200)]),
        Track("str_trem", STRINGS_TREM, held(hold, 0, 80) + held(drive[4:], 1, 70), gain_db=-2, layer="orch", sends={"hall": .35}),
        Track("brass", BRASS, tune(main, 0, 104) + tune(finale, 0, 112) + tune(finale, -1, 108), gain_db=3, pan=.1, layer="orch",
              sends={"hall": .3}, fx=[HighpassFilter(80)]),
        Track("horns", HORNS, tune(ignite, -1, 100) + held(main[4:], -1, 76, top=False), gain_db=4, pan=-.2, layer="orch", sends={"hall": .35}),
        Track("brass_hits", BRASS_HIT, braam(first("ignite"), "Fm9") + stabs(drive) + braam(logo, "Fm9", length=10)
              + [n for n in braam(joke, "Fm9", length=2)], gain_db=3, layer="orch", sends={"hall": .3},
              fx=[HighpassFilter(30), Distortion(drive_db=4)]),
        Track("choir", CHOIR, held(main[4:], 0, 78) + held(hold, 0, 88) + held(finale, 0, 96) + held([logo], 0, 100), gain_db=0, layer="orch",
              sends={"hall": .45}, fx=[HighpassFilter(150)]),
        Track("bells", BELLS, [(at(b), CH[chords(b)[0][2]][0] + 36, 3, 100) for b in finale] + [(at(logo), 65, 6, 120), (at(logo), 77, 6, 110)],
              gain_db=-2, layer="orch", sends={"hall": .4}),
    ]

    band = [
        *musette("acc_cold", tune(cold, 0, 92), "band", 10, pan=.2, sends={"plate": .12}),
        *musette("acc", tune(main + finale, -1, 84), "band", 4, pan=.2, sends={"plate": .12}),
        Track("celesta", CELESTA, tune(cold, 1, 70), gain_db=-2, pan=.3, layer="band", sends={"hall": .5}),
        Track("keys", "Keys/DX EP", ostinato(cold[2:] + ignite + big), gain_db=1, pan=-.2, layer="band", sends={"plate": .14},
              fx=[HighpassFilter(160), Flanger(rate_hz=.17, delay_ms=3, depth_ms=2.2, mix=.42)]),
        Track("saw", "Leads/Moogy Saw", tune(drive, 0, 100) + tune(finale, 1, 88), gain_db=-1, layer="band", sends={"plate": .16}, fx=lead_fx()),
        Track("saw2", "Leads/Butter", tune(drive, 0, 100), gain_db=-8, pan=-.15, layer="band", sends={"plate": .16}, fx=lead_fx()),
        Track("organ", g.ROCK_ORGAN, stabs(drive, 100) + held(finale, 0, 84), gain_db=-6, layer="band", sends={"plate": .1},
              fx=[Vibrato(rate_hz=6.4, depth_cents=14), Distortion(drive_db=6), HighpassFilter(200)]),
        Track("arp", "Plucks/FM Pluck", sixteenths(drive, 1), gain_db=-14, pan=.35, layer="band", sends={"plate": .12},
              fx=[PingPongDelay(bpm=BPM, beat_fraction=.75, feedback=.25, mix=.18)]),
        Track("dist_bass", "Basses/Dist Bass 1", octave_bass(main + finale) + octave_bass(drive, .25), gain_db=-8, layer="band",
              fx=[g.mono, HighpassFilter(40), LowpassFilter(2400), Compressor(threshold_db=-20, ratio=4)]),
        Track("ticks", XYLO, count_up(hold[0]), gain_db=2, layer="band", sends={"hall": .2}),
    ]

    solo = [
        *musette("shrug", shrug + last_word, "solo", 10, pan=0, sends={"plate": .15}),
        Track("pickup", KIT, pickup, kit=True, gain_db=10, layer="solo"),
    ]
    return perc + orch + band + solo


def song():
    ig, mn, dr, fi = first("ignite"), first("main"), first("drive"), first("finale")
    arc = [(0, -2), (ig + .25, -2), (ig + 1, -6), (mn - .01, -3), (mn, -1.5), (dr - .01, -1.5), (dr, -4.5), (dr + 7.99, 0), (fi, 1.5), (BARS + 2, 1.5)]
    return Song(bpm=BPM, bars=BARS, beats_per_bar=BEATS, tracks=cue(), loop=False, target_lufs=-20, automation=arc,
                buses={"plate": plate_bus(), "hall": hall_bus()})


# the edit's grid: where things land, in seconds
def cues():
    marks = {"bar_s": BAR_S, "bpm": BPM, "beats_per_bar": BEATS, "sections": []}
    for name in dict.fromkeys(s for s, _, _ in FORM):
        bars = sec(name)
        marks["sections"].append({"name": name, "start": round(bars[0] * BAR_S, 3), "end": round((bars[-1] + 1) * BAR_S, 3),
                                  "bars": [bars[0] + 1, bars[-1] + 1]})
    joke = first("joke")
    marks["hits"] = {
        "braam": round(first("ignite") * BAR_S, 3),
        "record_stop": round(at(joke, .75) * 60 / BPM, 3),
        "shrug": round(at(joke + 1, 2) * 60 / BPM, 3),
        "silence": round(at(first("finale") - 1, 6.5) * 60 / BPM, 3),
        "logo": round(first("logo") * BAR_S, 3),
        "last_word": round(at(first("logo") + 1, 1.75) * 60 / BPM, 3),
    }
    return marks
