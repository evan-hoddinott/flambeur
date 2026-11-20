"""Render Gnossienne Flambée through Evan's music-lab and write the game's music files.

  ~/dev/personal-projects/music-lab/.venv/bin/python art/music/build.py           # everything -> public/music/
  ~/dev/personal-projects/music-lab/.venv/bin/python art/music/build.py sketch    # intro + A of each mix -> art/music/out/
  ~/dev/personal-projects/music-lab/.venv/bin/python art/music/build.py stings    # only the stingers -> public/music/sting-*.ogg

Each mix is the same 40 bars on the same grid. The file is the intro (bars 1-4, plays once) followed by the loop
(bars 5-40); the player loops between loopStart and loopEnd from gnossienne.json. Spec: docs/MUSIC.md.
"""
import json
import subprocess
import sys
from pathlib import Path

LAB = Path.home() / "dev/personal-projects/music-lab"
sys.path.insert(0, str(LAB))
sys.path.insert(0, str(Path(__file__).parent))

import numpy as np  # noqa: E402
import pyloudnorm  # noqa: E402
from pedalboard import Distortion, HighpassFilter, Limiter, LowpassFilter  # noqa: E402
from scipy.signal import resample_poly  # noqa: E402

import gnossienne as g  # noqa: E402
from lab.analyze import analyze  # noqa: E402
from lab.song import render, write  # noqa: E402
from lab.surge import SR  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).parent / "out"
PUBLIC = ROOT / "public/music"
BAR_S = g.BEATS * 60 / g.BPM
# loudness per mix (docs/MUSIC.md §8). l'orgue is set relative to la table so it sits under every mix
LUFS = {"table": -16.0, "tabac": -20.0, "fee": -15.0}
ORGUE_UNDER = 3.0
STING_LUFS = -16.0
TARGETS = dict(LUFS, orgue=LUFS["table"] - ORGUE_UNDER)
MONO = {"tabac", "orgue"}
meter = pyloudnorm.Meter(SR)


def lufs(a):
    return meter.integrated_loudness(a.T)


def true_peak(a):
    return max(np.abs(resample_poly(ch, 4, 1)).max() for ch in a)


def wrap_loop(a, start, end):
    """fold everything past the loop's end (reverb and delay tails) back onto the loop's head, then cut"""
    body = a[:, :end].copy()
    tail = a[:, end:]
    body[:, start:start + tail.shape[1]] += tail[:, : end - start]
    return body


def radio(a, loop_start):
    """le tabac comes out of the buraliste's radio: mono, telephone band, a little tube, crackle, a slow wow"""
    m = a.mean(0, keepdims=True)
    for fx in (HighpassFilter(300), HighpassFilter(300), LowpassFilter(3400), LowpassFilter(3400), Distortion(drive_db=6)):
        m = fx(m, SR)
    m = wow(m, loop_start, cents=9, cycles=36)
    rng = np.random.default_rng(1913)
    n = m.shape[1]
    crackle = np.zeros(n, np.float32)
    pops = rng.integers(0, n, n // 2400)
    crackle[pops] = rng.uniform(-.6, .6, len(pops))
    crackle = LowpassFilter(5000)(HighpassFilter(1200)(crackle[None], SR), SR)[0]
    hiss = LowpassFilter(6000)(rng.standard_normal((1, n)).astype(np.float32) * .004, SR)[0]
    level = np.abs(m).max()
    return m + (crackle * .05 + hiss) * level


def wow(a, loop_start, cents, cycles):
    """tape wobble whose period divides the loop, so its phase matches at both ends of the seam. the delay is zero on the
    loop line itself, so both sides of the seam read the same samples"""
    n = a.shape[1]
    loop_len = n - loop_start
    t = (np.arange(n) - loop_start) / SR
    f = cycles / (loop_len / SR)
    ratio = 2 ** (cents / 1200) - 1
    delay = ratio / (2 * np.pi * f) * (1 - np.cos(2 * np.pi * f * t))
    idx = np.arange(n) - delay * SR
    return np.stack([np.interp(idx, np.arange(n), ch) for ch in a]).astype(np.float32)


def master(a, target, loop_start):
    """gain to the target, a limiter over intro + loop + loop (so it's settled at the seam), then trim back to the
    target. the limiter adds its own makeup gain, so the trim measures again. ceiling -1 dBTP, which wins over loudness"""
    for _ in range(3):
        a = a * 10 ** ((target - lufs(a)) / 20)
        x = np.concatenate([a, a[:, loop_start:]], 1).astype(np.float32)
        x = Limiter(threshold_db=-1.5, release_ms=150)(x, SR)
        a = np.concatenate([x[:, :loop_start], x[:, a.shape[1]:]], 1) * 10 ** (-5.75 / 20)  # undo the makeup
    a = a * 10 ** ((target - lufs(a)) / 20)
    tp = true_peak(a)
    if tp > 10 ** (-1 / 20):
        a = a * 10 ** (-1 / 20) / tp
    return a.astype(np.float32)


def ogg(wav, dst):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "libvorbis", "-q:a", "5", str(dst)], check=True)


def chord_map():
    """per beat of the loop's grid: the index of its chord in `chords`, chord tones in played MIDI pitch"""
    names = list(g.CH)
    beats = []
    for b in range(g.BARS):
        for t in range(g.BEATS):
            beats.append(names.index(next(n for s, ln, n in g.chords(b) if s <= t < s + ln)))
    return {"names": names, "tones": [[g.CH[n][0], *g.CH[n][1]] for n in names], "beats": beats}


def sketch(mixes=("table", "tabac", "fee")):
    """intro + A (bars 1-12) of each mix, same length, for the audition page"""
    OUT.mkdir(exist_ok=True)
    n = int(12 * BAR_S * SR)
    layers = render(g.song(tuple(mixes), range(0, 12)))
    for name, a in layers.items():
        a = a[:, :n]
        if name == "tabac":
            a = radio(a, 0)
        if name == "fee":
            a = wow(a, 0, cents=12, cycles=3)
        if name in MONO:
            a = a.mean(0, keepdims=True)
        a = master(a, TARGETS[name], 0)
        write(OUT / f"sketch.{name}.wav", a)
        ogg(OUT / f"sketch.{name}.wav", OUT / f"sketch.{name}.ogg")
        m, png = analyze(OUT / f"sketch.{name}.wav", g.BPM, g.BEATS)
        print(name, json.dumps({k: m.get(k) for k in ("lufs_integrated", "peak_dbfs", "stereo_correlation", "band_energy_pct")}))


def full():
    OUT.mkdir(exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    start, end = round(g.LOOP_BAR * BAR_S * SR), round(g.BARS * BAR_S * SR)
    layers = render(g.song())
    mixed = {}
    for name, a in layers.items():
        a = wrap_loop(a, start, end)
        if name == "tabac":
            a = radio(a, start)
        if name == "fee":
            a = wow(a, start, cents=12, cycles=36)  # ~0.25 Hz
        if name in MONO:
            a = a.mean(0, keepdims=True)
        mixed[name] = a
    report = {}
    for name, a in mixed.items():
        a = master(a, TARGETS[name], start)
        assert a.shape[1] == end, (name, a.shape)
        wav = OUT / f"{name}.wav"
        write(wav, a)
        ogg(wav, PUBLIC / f"{name}.ogg")
        loop = a[:, start:]
        write(OUT / f"{name}.loop.wav", loop)
        m, png = analyze(OUT / f"{name}.loop.wav", g.BPM, g.BEATS)
        report[name] = {"lufs": round(lufs(a), 2), "true_peak_db": round(20 * np.log10(true_peak(a)), 2),
                        "channels": a.shape[0], "seconds": round(a.shape[1] / SR, 3), "key": m.get("key"),
                        "seam": m.get("loop_seam"), "report": str(png)}
        print(name, json.dumps(report[name], default=float))
    info = {"sampleRate": SR, "bpm": g.BPM, "beatsPerBar": g.BEATS, "bars": g.BARS, "loopBar": g.LOOP_BAR,
            "loopStart": start, "loopEnd": end, "chords": chord_map()}
    (PUBLIC / "gnossienne.json").write_text(json.dumps(info, separators=(",", ":")))
    (OUT / "report.json").write_text(json.dumps(report, indent=1, default=float))


def stings():
    """the one-shots, on the sfx bus. one limiter pass and a gain to -16 LUFS, ceiling -1 dBTP"""
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for name in g.stings():
        a = render(g.sting(name))["sting"]
        a = a * 10 ** ((STING_LUFS - lufs(a)) / 20)
        a = Limiter(threshold_db=-1.5, release_ms=150)(a.astype(np.float32), SR) * 10 ** (-5.75 / 20)
        a = a * 10 ** ((STING_LUFS - lufs(a)) / 20)
        a = a * min(1, 10 ** (-1 / 20) / true_peak(a))
        wav = OUT / f"sting-{name}.wav"
        write(wav, a.astype(np.float32))
        ogg(wav, PUBLIC / f"sting-{name}.ogg")
        print(f"sting-{name}", json.dumps({"seconds": round(a.shape[1] / SR, 2), "lufs": round(lufs(a), 1),
                                           "true_peak_db": round(20 * np.log10(true_peak(a)), 1)}))


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "full"
    if mode == "sketch":
        sketch(sys.argv[2:] or ("table", "tabac", "fee"))
    elif mode == "stings":
        stings()
    else:
        full()
        stings()
