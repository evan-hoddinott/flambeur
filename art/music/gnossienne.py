"""Gnossienne Flambée: Satie's Gnossienne No. 1 as a 7/4 lounge band, in three synced mixes plus an organ layer.

Spec: docs/MUSIC.md. Melody source: art/music/SOURCE.md. Rendered by art/music/build.py through Evan's music-lab.

Everything here is in *played* pitch and tempo: F minor, ~106 bpm. Song.tape renders it at 150 bpm a tritone up
and slows the tape back down (Balatro's trick), so pitch, tempo, reverb tails and transients all drop together.
Beats are quarter notes, 7 to a bar, grouped 4 + 3: a bar of four, then a waltz.
"""
import numpy as np
from pedalboard import Chorus, Compressor, Distortion, Gain, HighpassFilter, LowpassFilter, Phaser

from lab.song import Song, Track
from soundtrack.dsp import ConvolutionReverb, Flanger, PingPongDelay, Vibrato

TAPE = 2 ** -.5  # exactly 6 semitones down
BPM = 150 * TAPE
BEATS = 7
FAST_BPM = 150  # tempo effects run at render speed, before the tape slows them


def mono(a, _sr):
    """sum to mono, for the bass and the low end (patches with stereo tricks go phasey on a laptop)"""
    m = a.mean(0)
    return np.stack([m, m])


def narrow(width):
    def fx(a, _sr):
        mid, side = (a[0] + a[1]) / 2, (a[0] - a[1]) / 2 * width
        return np.stack([mid + side, mid - side])
    return fx


def hz(rate):
    """a modulation rate as heard after the tape slows it"""
    return rate / TAPE


IRS = "/home/evanh/Music/game-composition/sample-packs/bricasti-m7/Samplicity - Bricasti IRs version 2023-10, quad channel files, 48 Khz"
PLATE = f"{IRS}/2 Plates 02 Dark Plate, 48K.wav"
HALL = f"{IRS}/1 Halls 01 Large Hall, 48K.wav"
ROOM = f"{IRS}/3 Rooms 16 Djangos Room, 48K.wav"  # le tabac, of course

# name -> (bass root, keys voicing), MIDI, played pitch
CH = {
    "Fm69": (41, (56, 60, 62, 67)),
    "Fm9": (41, (56, 60, 63, 67)),
    "Fmmaj9": (41, (56, 60, 64, 67)),
    "Db9": (37, (53, 56, 59, 63)),
    "Dbmaj9": (37, (53, 56, 60, 63)),
    "Bbm9": (34, (53, 56, 60, 61)),
    "Eb9": (39, (55, 58, 61, 65)),
    "Abmaj7": (32, (56, 60, 63, 67)),
    "Abmaj7#11": (32, (56, 60, 62, 67)),
    "Gbmaj7": (30, (53, 58, 61, 66)),
    "G7sus4": (31, (53, 60, 62, 67)),
    "G7": (31, (53, 59, 62, 67)),
    "G7b9": (31, (53, 56, 59, 62)),
    "C7sus4": (36, (53, 58, 60, 67)),
    "C7": (36, (52, 58, 60, 67)),
}


def gr(beat, grace, pitch, length):
    """satie's grace note: a quick 16th just before the beat"""
    return [(beat - .25, grace, .25), (beat, pitch, length)]


# satie's melody, one 7/4 bar per satie bar. (beat in bar, pitch, length)
C_EB_D_C = [(1.5, 72, .5), (2, 75, 1), (3, 74, 1), (4, 72, 3)]
THEME1 = [
    C_EB_D_C,
    gr(0, 72, 71, 4) + gr(4, 72, 71, 3),
    C_EB_D_C,
    gr(0, 76, 77, 4) + gr(4, 76, 77, 3),
    C_EB_D_C,
    gr(0, 72, 71, 4) + gr(4, 68, 67, 3),
    gr(0, 65, 67, 1.75) + gr(2, 65, 67, 4.5),
    gr(0, 68, 67, 2) + gr(2, 67, 65, 5),
]
THEME2 = [
    gr(0, 68, 70, 4) + gr(4, 68, 67, 3),
    gr(0, 68, 70, 4) + gr(4, 68, 67, 3),
    gr(0, 68, 67, 2) + gr(2, 67, 65, 5),
    [(0, 65, 7)],
]
THEME3 = [
    [(.5, 72, .5), (1, 74, .5), (1.5, 76, .5), (2, 77, .5), (2.5, 79, .5), (3, 83, 1), (4, 79, 3)],
    [(0, 77, 2)] + gr(2, 79, 77, 5),
    gr(0, 79, 77, 4) + gr(4, 77, 76, 3),
    gr(0, 73, 72, 4) + gr(4, 72, 71, 3),
    gr(0, 68, 67, 2) + gr(2, 67, 65, 5),
    [(0, 65, 7)],
]
THEME4 = [C_EB_D_C, gr(0, 72, 71, 7), C_EB_D_C, gr(0, 76, 77, 7)]

# the form: (section, melody bar, chord or (chord for beats 0-3, chord for 4-6)). 40 bars, the loop is bars 5-40
A_CHORDS = ["Fm69", "Db9", "Fm69", "Bbm9", "Abmaj7#11", "G7b9", ("C7sus4", "C7")]
FORM = (
    [("intro", m, c) for m, c in zip(THEME4, ["Fm69", "Db9", "Abmaj7#11", "C7sus4"])]
    + [("A", m, c) for m, c in zip(THEME1, A_CHORDS + [("Fm9", "Dbmaj9")])]
    + [("A2", m, c) for m, c in zip(THEME2 * 2, ["Bbm9", "Eb9", "Abmaj7", "Gbmaj7", "Bbm9", "Eb9", "Abmaj7", ("C7sus4", "C7")])]
    + [("B", m, c) for m, c in zip(THEME3 + [[], []], ["Fmmaj9", "Fmmaj9", "Fmmaj9", ("G7sus4", "G7"), "C7sus4", "Fm9", "Gbmaj7", ("C7sus4", "C7")])]
    + [("break", m, c) for m, c in zip(THEME4, ["Fm69", "Db9", "Abmaj7#11", "C7sus4"])]
    + [("A3", m, c) for m, c in zip(THEME1, A_CHORDS + [("Fm9", "C7")])]
)
BARS = len(FORM)
LOOP_BAR = 4  # zero-based: the loop starts at bar 5
assert BARS == 40, BARS


def chords(bar):
    """[(start beat, length, name)] for a bar"""
    c = FORM[bar][2]
    return [(0, 7, c)] if isinstance(c, str) else [(0, 4, c[0]), (4, 3, c[1])]


def sections(*names):
    return [i for i, (s, _, _) in enumerate(FORM) if s in names]


# --- parts: lists of (beat, pitch, length, velocity) over the whole song -----------------------------------------

def melody(bars, octave=0, vel=92):
    return [(b * BEATS + t, p + 12 * octave, ln * .97, vel - (14 if ln <= .25 else 0))
            for b in bars for t, p, ln in FORM[b][1]]


OSTINATO = [(0, 0, .9, 96), (1, 3, .8, 70), (2, 1, .8, 78), (3, 2, .8, 70),
            (4, 0, .9, 92), (5, 3, .45, 68), (5.5, 1, .45, 74), (6, 2, .9, 72)]  # 2-2-2-2 | 2-1-1-2, voicing indices


def ostinato(bars):
    out = []
    for b in bars:
        for start, ln, name in chords(b):
            v = CH[name][1]
            out += [(b * BEATS + t, v[i], d, vel) for t, i, d, vel in OSTINATO if start <= t < start + ln]
    return out


def stabs(bars):
    """the ostinato turned into chord hits (A2)"""
    out = []
    for b in bars:
        for start, ln, name in chords(b):
            hits = [(0, 1.2, 96), (2.5, .5, 80), (4, 1.2, 92), (5.5, .5, 78)]
            out += [(b * BEATS + t, p, d, vel) for t, d, vel in hits if start <= t < start + ln for p in CH[name][1]]
    return out


def pad(bars, octave=0, vel=70):
    return [(b * BEATS + s, p + 12 * octave, ln - .05, vel) for b in bars for s, ln, name in chords(b) for p in CH[name][1]]


def bass(bars):
    """root on 1, the fifth below on the and of 2, an octave pop into the waltz, a chromatic walk into the next bar"""
    out = []
    for b in bars:
        segs = chords(b)
        nxt = CH[chords((b + 1) % BARS)[0][2]][0]
        r = CH[segs[0][2]][0]
        below = r - 5 if r - 5 >= 28 else r + 7
        out += [(b * BEATS, r, 1.3, 108), (b * BEATS + 1.5, below, .4, 84), (b * BEATS + 2.5, r, .45, 92)]
        if len(segs) == 2:
            r2 = CH[segs[1][2]][0]
            out += [(b * BEATS + 4, r2, 1.4, 104), (b * BEATS + 5.5, r2 + 7, .4, 84)]
        else:
            out += [(b * BEATS + 4, r + 12, .9, 100), (b * BEATS + 5, r + 7, .9, 88)]
        out += [(b * BEATS + 6, nxt + 1 if nxt < r else nxt - 1, .9, 90)]
    return out


def upright(bars):
    """le tabac: oom on 1 and 5 only, plucked"""
    out = []
    for b in bars:
        for s, ln, name in chords(b):
            r = CH[name][0] + 12
            out += [(b * BEATS + s, r, .9, 100)] + ([(b * BEATS + 4, r + 7, .9, 90)] if ln == 7 else [])
    return out


def pompe(bars):
    """manouche pompe on the pahs: beats 2 3 4 and 6 7 (1-based), short and dry"""
    out = []
    for b in bars:
        for s, ln, name in chords(b):
            v = CH[name][1][1:]
            out += [(b * BEATS + t, p, .3, vel) for t, vel in ((1, 82), (2, 70), (3, 76), (5, 80), (6, 72))
                    if s <= t < s + ln for p in v]
    return out


def arp(bars, sixteenths=False):
    step = .25 if sixteenths else .5
    out = []
    for b in bars:
        for s, ln, name in chords(b):
            v = CH[name][1]
            tones = [p + 12 for p in v] + [v[0] + 24, v[2] + 24]
            seq = (0, 2, 1, 3, 4, 3, 5, 2) if sixteenths else (0, 1, 2, 3, 4, 3, 2, 1)
            k = 0
            t = s
            while t < s + ln - 1e-6:
                out.append((b * BEATS + t, tones[seq[k % len(seq)]], step * .9, 92 if k % 4 == 0 else 72))
                t += step
                k += 1
    return out


# brush kit (GeneralUser GS bank 128, program 40) keys
KICK, STICK, TAP, SLAP, SWIRL, HAT, PEDAL, RIDE, CRASH, TOM_LO, TOM_HI = 36, 37, 38, 39, 40, 42, 44, 51, 49, 41, 48


def kit(bars, sticks=False):
    out = []
    for b in bars:
        o = b * BEATS
        out += [(o, KICK, .3, 100), (o + 4, KICK, .3, 86), (o + 2, STICK, .2, 76)]
        out += [(o + 5, TAP, .2, 40), (o + 6, TAP, .2, 46), (o + 3.5, TAP, .2, 30), (o + 6.5, TAP, .2, 34)]
        out += [(o + t, RIDE, .5, 64 if t % 1 == 0 else 44) for t in (0, 1, 1.5, 2, 3, 3.5, 4, 5, 5.5, 6)]
        out += [(o + t, PEDAL, .2, 50) for t in (1, 3, 5)]
        if sticks:
            out += [(o + 2, SLAP, .2, 90), (o + 6, SLAP, .2, 70)]
        if b % 4 == 0:
            out += [(o, SWIRL, 6.5, 52)]
        if b % 4 == 3:  # fill into the next phrase
            out += [(o + 6, TAP, .2, 70), (o + 6.25, TAP, .2, 56), (o + 6.5, TAP, .2, 74), (o + 6.75, SLAP, .2, 84)]
    return out


def brushes(bars):
    """le tabac: swirl and taps only"""
    out = []
    for b in bars:
        o = b * BEATS
        out += [(o, SWIRL, 3.8, 46), (o + 4, SWIRL, 2.8, 40), (o + 2, TAP, .2, 40), (o + 5, TAP, .2, 34), (o + 6, TAP, .2, 38)]
    return out


def toms(bars):
    """la fée verte: toms on the 1 and the 5, no hats"""
    out = []
    for b in bars:
        o = b * BEATS
        out += [(o, KICK, .3, 104), (o, TOM_LO, .5, 90), (o + 4, TOM_LO, .5, 84), (o + 4, KICK, .3, 90),
                (o + 2, STICK, .2, 60), (o + 6, TOM_HI, .3, 62), (o + 6.5, TOM_HI, .3, 54)]
        if b % 4 == 3:
            out += [(o + 6, CRASH, 1, 40)]
    return out


def timpani(bars):
    return [(b * BEATS, CH[chords(b)[0][2]][0] + 12, 3, 96) for b in bars if b % 2 == 0]


def bends(cents):
    """a fixed detune for one musette reed, on a 2-semitone bend range"""
    return [(0, round(cents / 200 * 8191))]


# --- the mixes ----------------------------------------------------------------------------------------------

ALL = list(range(BARS))
BAND = sections("A", "A2", "B", "A3")
TUNE = sections("intro", "A", "A3")  # where the leads play satie
ACC = "sf2:GeneralUser:21"  # accordion
ORGAN = "sf2:GeneralUser:19"  # church organ
NYLON = "sf2:GeneralUser:24"
BRUSH = "sf2:GeneralUser:40:128"


def plate_bus():
    return [ConvolutionReverb(PLATE, wet=1, predelay_ms=16, channel_order=(0, 1, 2, 3)), HighpassFilter(180), LowpassFilter(3500), Gain(-18)]


def hall_bus():
    return [ConvolutionReverb(HALL, wet=1, predelay_ms=40, channel_order=(0, 1, 2, 3)), HighpassFilter(150), LowpassFilter(3800), Gain(-36)]


def musette(name, notes, layer, gain_db, pan=0.0, spread=14, sends=None, fx=None):
    """three accordion reeds: one in tune, one sharp, one flat. their beating is the french shimmer"""
    fx = fx or []
    return [Track(f"{name}", ACC, notes, gain_db=gain_db, pan=pan, layer=layer, sends=sends or {}, fx=list(fx)),
            Track(f"{name}_sharp", ACC, notes, gain_db=gain_db - 5, pan=pan + .2, layer=layer, bends=bends(spread), sends=sends or {}, fx=list(fx)),
            Track(f"{name}_flat", ACC, notes, gain_db=gain_db - 5, pan=pan - .2, layer=layer, bends=bends(-spread), sends=sends or {}, fx=list(fx))]


def table(bars=ALL):
    band = [b for b in BAND if b in bars]
    tune = [b for b in TUNE if b in bars]
    breakdown = [b for b in sections("break") if b in bars]
    a2 = [b for b in sections("A2") if b in bars]
    b_sec = [b for b in sections("B") if b in bars]
    keys_bars = [b for b in bars if b not in a2 and b not in breakdown]
    lead_bars = [b for b in sections("A", "A2", "B", "A3") if b in bars]
    lead_fx = lambda: [HighpassFilter(220), Vibrato(rate_hz=hz(4.6), depth_cents=16),
                       Flanger(rate_hz=hz(.16), delay_ms=2.5, depth_ms=1.5, mix=.16),
                       PingPongDelay(bpm=FAST_BPM, beat_fraction=.75, feedback=.28, mix=.16)]
    return [
        Track("t_keys", "Keys/DX EP", ostinato(keys_bars), gain_db=-2, pan=-.15, layer="table", sends={"plate": .14},
              fx=[HighpassFilter(160), Flanger(rate_hz=hz(.12), delay_ms=3, depth_ms=2.2, mix=.42), Vibrato(rate_hz=hz(1.41), depth_cents=12)]),
        Track("t_stabs", "Keys/DX EP", stabs(a2), gain_db=-4, pan=-.15, layer="table", sends={"plate": .16}, fx=[HighpassFilter(160)]),
        Track("t_lead", "Leads/Moogy Saw", melody(lead_bars), gain_db=-5, pan=.1, layer="table", sends={"plate": .16}, fx=lead_fx()),
        Track("t_lead2", "Leads/Butter", melody(lead_bars), gain_db=-13, pan=-.1, layer="table", sends={"plate": .16}, fx=lead_fx()),
        *musette("t_acc", melody(tune, -1, 84) + melody(breakdown, 0, 88) + melody(a2, -1, 76), "table", 3, pan=.2, sends={"plate": .12}),
        Track("t_pad", "Pads/MKS-70 Warm Pad", pad(band), gain_db=-14, layer="table", sends={"plate": .2}, fx=[HighpassFilter(250), LowpassFilter(4000), narrow(.5)]),
        Track("t_arp", "Plucks/FM Pluck", arp(b_sec[:-2]) + arp(b_sec[-2:], sixteenths=True), gain_db=-15, pan=.3, layer="table",
              sends={"plate": .15}, fx=[PingPongDelay(bpm=FAST_BPM, beat_fraction=.75, feedback=.3, mix=.2)]),
        Track("t_bass", "Basses/Mellow", bass([b for b in bars if b > 1]), gain_db=-1, layer="table",
              fx=[mono, HighpassFilter(35), LowpassFilter(1800), Compressor(threshold_db=-20, ratio=3)]),
        Track("t_kit", BRUSH, kit(band, sticks=False) + kit([b for b in sections("A3") if b in bars], sticks=True), kit=True, gain_db=12,
              layer="table", sends={"plate": .06}, fx=[HighpassFilter(70), HighpassFilter(70), Compressor(threshold_db=-20, ratio=2.5)]),
    ]


def tabac(bars=ALL):
    band = [b for b in BAND if b in bars]
    return [
        *musette("c_acc", melody(bars, 0, 90), "tabac", 4, spread=16, sends={"room": .2}),
        Track("c_pompe", NYLON, pompe([b for b in bars if b not in sections("break")]), gain_db=-1, pan=-.2, layer="tabac", sends={"room": .15}),
        Track("c_upright", "sfz:d_smolken_rubner_bass_pizz", upright([b for b in bars if b > 1]), gain_db=4, layer="tabac", sends={"room": .1}),
        Track("c_brush", BRUSH, brushes(band), kit=True, gain_db=14, layer="tabac", sends={"room": .15}),
    ]


def fee(bars=ALL):
    band = [b for b in BAND if b in bars]
    tune = [b for b in bars if b not in sections("B")[-2:]]
    ondes = lambda: [Vibrato(rate_hz=hz(6), depth_cents=38), Chorus(rate_hz=hz(.2), depth=.2, mix=.25),
                     PingPongDelay(bpm=FAST_BPM, beat_fraction=1.5, feedback=.4, mix=.3)]
    return [
        Track("f_ondes", "Leads/Sine Lead", melody(tune), gain_db=-11, layer="fee", sends={"hall": .45}, fx=ondes()),
        Track("f_glass", "sfz:Keys/celesta", melody(tune, 2, 70), gain_db=0, pan=.3, layer="fee", sends={"hall": .6}),
        Track("f_keys", "Keys/DX EP", ostinato(bars), gain_db=-1.5, pan=-.25, layer="fee", sends={"hall": .45},
              fx=[Flanger(rate_hz=hz(.05), delay_ms=5, depth_ms=4, mix=.6), Phaser(rate_hz=hz(.1), depth=.6, mix=.35),
                  PingPongDelay(bpm=FAST_BPM, beat_fraction=.75, feedback=.45, mix=.32), LowpassFilter(4200)]),
        Track("f_organ", ORGAN, pad(band, 0, 62), gain_db=-5, layer="fee", bends=bends(25), sends={"hall": .4}),
        Track("f_organ2", ORGAN, pad(band, 0, 62), gain_db=-5, layer="fee", bends=bends(-25), sends={"hall": .4}),
        Track("f_bass", "Basses/Mellow", bass([b for b in bars if b > 1]), gain_db=-8, layer="fee",
              fx=[mono, HighpassFilter(40), Distortion(drive_db=9), LowpassFilter(1100), Compressor(threshold_db=-20, ratio=3)]),
        Track("f_drums", BRUSH, toms(band), kit=True, gain_db=2.5, layer="fee", sends={"hall": .3}),
        Track("f_timp", "sfz:Percussion/timpani-hit", timpani(band), gain_db=0, layer="fee", sends={"hall": .4}),
    ]


# standard kit (GeneralUser GS bank 128, program 0) keys, for l'orgue's drums
SNARE, CLAP, OPEN_HAT, TAMB = 38, 39, 46, 54
DRUMS = "sf2:GeneralUser:0:128"
ROCK_ORGAN = "sf2:GeneralUser:18"


def drive(bars):
    """the hype kit: a 4+3 backbeat, kick on 1 and the and of 2 and on 5 and the and of 6, snare and clap on 3 and 7"""
    out = []
    for b in bars:
        o = b * BEATS
        out += [(o + t, KICK, .3, 112) for t in (0, 1.5, 4, 5.5)]
        out += [(o + t, SNARE, .3, 104) for t in (2, 6)] + [(o + t, CLAP, .3, 90) for t in (2, 6)]
        out += [(o + t / 2, HAT, .2, 78 if t % 2 == 0 else 58) for t in range(14) if t not in (7, 13)]
        out += [(o + 3.5, OPEN_HAT, .45, 70), (o + 6.5, OPEN_HAT, .45, 74)]
        out += [(o + t + .5, TAMB, .2, 60) for t in range(7)]
        if b % 8 == 0:
            out += [(o, CRASH, 2, 96)]
        if b % 4 == 3:  # snare roll into the next phrase
            out = [n for n in out if not (o + 6 <= n[0] and n[1] in (SNARE, CLAP, OPEN_HAT))]
            out += [(o + 6 + i / 4, SNARE, .2, 70 + 10 * i) for i in range(4)]
    return out


def octaves(bars):
    """eighth notes bouncing root, octave, root, octave under each chord"""
    out = []
    for b in bars:
        for s, ln, name in chords(b):
            r = CH[name][0]
            out += [(b * BEATS + s + i / 2, r + 12 * (i % 2), .4, 104 if i % 2 == 0 else 88) for i in range(ln * 2)]
    return out


def orgue(bars=ALL):
    """the hype layer: it sits on top of whichever mix is playing and rises with the appraisal (balatro's organ, plus a band).
    a church organ holding the chords, a rock organ on the stabs, a driving kit and an octave bass"""
    leslie = lambda: [Vibrato(rate_hz=hz(6.4), depth_cents=14), Chorus(rate_hz=hz(.8), depth=.25, mix=.3)]
    return [
        Track("o_organ", ORGAN, pad(bars, 0, 70) + [(b * BEATS + s, CH[n][0] + 12, ln - .05, 66) for b in bars for s, ln, n in chords(b)],
              gain_db=-3, layer="orgue", sends={"hall": .3}),
        Track("o_rock", ROCK_ORGAN, stabs(bars), gain_db=-3.5, layer="orgue", sends={"plate": .1},
              fx=[*leslie(), Distortion(drive_db=6), HighpassFilter(200)]),
        Track("o_drums", DRUMS, drive(bars), kit=True, gain_db=4, layer="orgue", sends={"plate": .05},
              fx=[HighpassFilter(45), Compressor(threshold_db=-16, ratio=4, attack_ms=8, release_ms=120)]),
        Track("o_bass", "Basses/Dist Bass 1", octaves(bars), gain_db=-6, layer="orgue",
              fx=[mono, HighpassFilter(40), LowpassFilter(2400), Compressor(threshold_db=-20, ratio=4)]),
        Track("o_lead", "Leads/Moogy Saw", melody([b for b in TUNE + sections("B") if b in bars], 1, 84), gain_db=-10, layer="orgue",
              sends={"plate": .2}, fx=[HighpassFilter(400), Vibrato(rate_hz=hz(5), depth_cents=18)]),
    ]


def song(mixes=("table", "tabac", "fee", "orgue"), bars=ALL):
    """the song, optionally cut to a few bars (sketches). bars must be consecutive"""
    first = bars[0]
    assert list(bars) == list(range(first, first + len(bars))), "bars must be consecutive"
    makers = {"table": table, "tabac": tabac, "fee": fee, "orgue": orgue}
    tracks = [t for m in mixes for t in makers[m](list(bars))]
    shift = first * BEATS
    for t in tracks:
        t.notes = [(n[0] - shift, *n[1:]) for n in t.notes if first * BEATS <= n[0] < (first + len(bars)) * BEATS]
    return Song(bpm=BPM, bars=len(bars), beats_per_bar=BEATS, tracks=tracks, loop=False, tape=TAPE, swing=.12,
                alternatives=True, target_lufs=-18, buses={"plate": plate_bus(), "hall": hall_bus(),
                                                            "room": [ConvolutionReverb(ROOM, wet=1, channel_order=(0, 1, 2, 3)), Gain(-8)]})


# --- stingers (docs/MUSIC.md §9): short one-shots in played f minor, from the song's own phrase and instruments ----

PHRASE = [(0, 72, .5), (.5, 75, .5), (1, 74, .5), (1.5, 72, 1.5)]  # satie's c e♭ d c, twice as fast as in the tune
KIT = "sf2:GeneralUser:0:128"


def at(notes, beat=0, octave=0, vel=96, stretch=1.0):
    return [(beat + t * stretch, p + 12 * octave, ln * stretch, vel) for t, p, ln in notes]


def held(name, beat, length, vel=84, octave=0):
    return [(beat, p + 12 * octave, length, vel) for p in CH[name][1]]


def root(name, beat, length, vel=104):
    return [(beat, CH[name][0], length, vel)]


def keys(notes, gain_db=-2):
    return Track("s_keys", "Keys/DX EP", notes, gain_db=gain_db, layer="sting", sends={"plate": .2}, fx=[HighpassFilter(160)])


def lead(notes, gain_db=-5):
    return Track("s_lead", "Leads/Moogy Saw", notes, gain_db=gain_db, layer="sting", sends={"plate": .25},
                 fx=[HighpassFilter(220), Vibrato(rate_hz=hz(4.6), depth_cents=16)])


def bassline(notes, gain_db=-1):
    return Track("s_bass", "Basses/Mellow", notes, gain_db=gain_db, layer="sting", fx=[mono, HighpassFilter(35), LowpassFilter(1800)])


def drums(notes, gain_db=6):
    return Track("s_kit", KIT, notes, kit=True, gain_db=gain_db, layer="sting", sends={"plate": .08}, fx=[HighpassFilter(45)])


def acc(notes, gain_db=3, bend=()):
    return [Track(f"s_acc{i}", ACC, notes, gain_db=gain_db - (5 if c else 0), pan=.2 * (c > 0) - .2 * (c < 0), layer="sting",
                  bends=[(t, v + round(c / 200 * 8191)) for t, v in (bend or [(0, 0)])], sends={"plate": .15})
            for i, c in enumerate((0, 14, -14))]


def stings():
    """name -> (beats, tracks)"""
    run = [(i / 4, p, .25) for i, p in enumerate((60, 62, 64, 65, 67, 71, 72, 74))]
    opening = [(t - 1.5, p, ln) for t, p, ln in THEME1[0]] + [(7 + t - 1.5, p, ln) for t, p, ln in THEME1[1]][:3]  # c e♭ d c · b c b
    sag = [(1.5 + i / 8, round(-8191 * i / 20)) for i in range(21)]  # the bellows give out: down 2 semitones over the last note
    return {
        "won": (5, [*acc(at([(0, 68, .25), (.25, 67, .75), (1, 65, 3)], vel=92)), lead(at([(0, 67, 1), (1, 65, 3)], 1, vel=84)),
                    keys(held("C7", 0, 1) + held("Fm9", 1, 3)), bassline(root("C7", 0, 1) + root("Fm9", 1, 3))]),
        "lost": (5, acc(at(PHRASE, vel=80, stretch=1.4), gain_db=2, bend=[(t * 1.4, v) for t, v in sag])),
        "knockout": (5, [lead(at(run, octave=0, vel=100)), keys(held("Gbmaj7", 2, .5, 104) + held("Fm9", 3, 1.5, 96)),
                           bassline(root("Gbmaj7", 2, .5) + root("Fm9", 3, 1.5)),
                           drums([(2, 36, .3, 120), (2, 49, 2, 110), (2, 38, .3, 100), (3, 36, .3, 120), (3, 57, 2, 104)])]),
        "boss": (6, [Track("s_ondes", "Leads/Sine Lead", at(PHRASE, 1, vel=96, stretch=1.2), gain_db=-6, layer="sting", sends={"hall": .5},
                           fx=[Vibrato(rate_hz=hz(6), depth_cents=38)]),
                     Track("s_timp", "sfz:Percussion/timpani-hit", [(i / 8, 53, .2, 50 + 3 * i) for i in range(20)] + [(2.5, 41, 3, 120)],
                           gain_db=0, layer="sting", sends={"hall": .4})]),
        "pull": (4, [Track("s_glass", "sfz:Keys/celesta", at(PHRASE, octave=2, vel=90), gain_db=0, layer="sting", sends={"hall": .6})]),
        "grail": (5, [Track("s_organ", ORGAN, held("Dbmaj9", 0, 2, 76) + held("Fmmaj9", 2, 3, 80) + root("Dbmaj9", 0, 2, 70)
                            + root("Fmmaj9", 2, 3, 74), gain_db=-4, layer="sting", sends={"hall": .45}), lead(at(PHRASE, 0, 1, 86), -9)]),
        "bust": (10, [lead(at(opening, vel=104)), *acc(at(opening, octave=-1, vel=90), 2),
                     keys(held("Fm69", 0, 4) + held("Db9", 4, 3)), bassline(root("Fm69", 0, 4) + root("Db9", 4, 3)),
                     drums(drive([0])), Track("s_crash", KIT, [(0, 49, 2, 110), (7, 49, 2, 100)], kit=True, gain_db=2, layer="sting")]),
        "runwon": (9, [lead(at([(0, 68, .25), (.25, 67, 1.75), (2, 68, .25), (2.25, 67, .75), (3, 65, 6)], vel=98)),
                       *acc(at([(0, 68, .25), (.25, 67, 1.75), (2, 68, .25), (2.25, 67, .75), (3, 65, 6)], octave=-1, vel=86)),
                       keys(held("C7sus4", 0, 2) + held("C7", 2, 1) + held("Fm9", 3, 6)),
                       bassline(root("C7sus4", 0, 2) + root("C7", 2, 1) + root("Fm9", 3, 6)),
                       drums([(0, 36, .3, 110), (2, 38, .3, 96), (3, 36, .3, 120), (3, 49, 3, 110)])]),
    }


def sting(name):
    beats, tracks = stings()[name]
    return Song(bpm=BPM, bars=1, beats_per_bar=beats, tracks=tracks, loop=False, tape=TAPE, target_lufs=-18,
                buses={"plate": plate_bus(), "hall": hall_bus()})
