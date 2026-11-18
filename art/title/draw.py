"""Draw the title world's parts and write title.aseprite with one slice per part: python art/title/draw.py

The parts are procedural so they stay on the master palette and can be redrawn in one go. Running this
overwrites title.aseprite, so hand edits made in Aseprite are lost; after hand edits only run build.py.
Glows, rain, drips, steam and water shimmer are code effects (src/ui/title.ts), not drawn here.
"""
import json
import random
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
GPL = ROOT.parent / "palette/flambeur.gpl"

HEX = [line.split()[3] for line in GPL.read_text().splitlines() if line.strip() and line.strip()[0].isdigit()]
NAMES = (
    "ink0 ink1 ink2 ink3 fg0 fg1 fg2 fg3 fg4 bl0 bl1 bl2 bl3 bu0 bu1 bu2 bu3 bu4 bk0 bk1 "
    "br0 br1 br2 br3 br4 br5 pa0 pa1 pa2 pa3 pa4 fl0 fl1 fl2 fl3 fl4 fl5 fl6 mg0 mg1 mg2 mg3 "
    "ab0 ab1 ab2 ab3 vi0 vi1 vi2 vi3"
).split()
assert len(NAMES) == len(HEX), "flambeur.gpl changed, update NAMES"
C = {n: i + 1 for i, n in enumerate(NAMES)}  # 0 = transparent
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16
rng = random.Random(7)


def new(w, h, fill=0):
    return np.full((h, w), C[fill] if fill else 0, dtype=np.uint8)


def rect(a, x0, y0, x1, y1, col):
    a[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = C[col]


def px(a, x, y, col):
    if 0 <= y < a.shape[0] and 0 <= x < a.shape[1]:
        a[y, x] = C[col]


def outline(a, col="ink0"):
    """1px outline around everything opaque, inside the part's own bounds"""
    m = a > 0
    edge = np.zeros_like(m)
    edge[1:, :] |= m[:-1, :]
    edge[:-1, :] |= m[1:, :]
    edge[:, 1:] |= m[:, :-1]
    edge[:, :-1] |= m[:, 1:]
    a[edge & ~m] = C[col]


def ramp_dither(a, x0, y0, x1, y1, cols, t0=0.0, t1=1.0):
    """vertical ordered-dither gradient through cols"""
    for y in range(y0, y1):
        t = t0 + (t1 - t0) * (y - y0) / max(1, y1 - y0 - 1)
        f = t * (len(cols) - 1)
        for x in range(x0, x1):
            i = int(f + BAYER[y % 4, x % 4])
            a[y, x] = C[cols[min(i, len(cols) - 1)]]


def specks(a, cols, n, mask=None):
    h, w = a.shape
    for _ in range(n):
        x, y = rng.randrange(w), rng.randrange(h)
        if mask is None or a[y, x] == C[mask]:
            a[y, x] = C[rng.choice(cols)]


def arch_window(a, x, y, w, h, lit=True):
    """a tall window with a round top: frame, glass, mullions"""
    r = w // 2
    glass = ("fl4", "br4", "fl3") if lit else ("bl0", "bl1", "ink1")
    for yy in range(h):
        for xx in range(w):
            dy = yy - r
            inside = dy >= 0 or (xx - r + 0.5) ** 2 + (dy + 0.5) ** 2 <= r * r
            if not inside:
                continue
            edge = xx == 0 or xx == w - 1 or yy == h - 1 or (dy < 0 and (xx - r + 0.5) ** 2 + (dy + 0.5) ** 2 > (r - 1.2) ** 2)
            if edge:
                a[y + yy, x + xx] = C["ink1"]
            else:
                a[y + yy, x + xx] = C[glass[0] if yy > h * 0.55 else glass[1]]
    # mullions
    for yy in range(r // 2, h - 1):
        a[y + yy, x + r] = C["br1" if lit else "ink2"]
    for xx in range(1, w - 1):
        a[y + r + (h - r) // 2, x + xx] = C["br1" if lit else "ink2"]


def rect_window(a, x, y, w, h, lit):
    rect(a, x - 1, y - 1, x + w + 1, y + h + 1, "ink1")
    rect(a, x, y, x + w, y + h, "fl3" if lit else "bl0")
    if lit:
        rect(a, x, y + h // 2, x + w, y + h, "fl4")
    else:
        rect(a, x, y, x + w, y + 2, "bl1")
    a[y:y + h, x + w // 2] = C["ink2"]


# ---------- street ----------

def sky():
    a = new(8, 200)
    ramp_dither(a, 0, 0, 8, 200, ["ink0", "ink1", "vi0", "bl0", "bl1"], 0, 1)
    return a


def skyline():
    w, h = 160, 72
    a = new(w, h)
    x = 0
    while x < w:
        bw = rng.randrange(14, 30)
        top = rng.randrange(14, 46)
        rect(a, x, top, min(w, x + bw), h, "ink1")
        if rng.random() < 0.6:  # mansard roof slope
            for i in range(4):
                rect(a, x + i, top - 4 + i, min(w, x + bw - i), top - 3 + i, "ink1")
        if rng.random() < 0.7:  # chimney
            cx = x + rng.randrange(2, max(3, bw - 4))
            rect(a, cx, top - 8, cx + 3, top, "ink1")
        for wy in range(top + 6, h - 6, 8):
            for wx in range(x + 3, min(w, x + bw) - 3, 6):
                if rng.random() < 0.12:
                    rect(a, wx, wy, wx + 2, wy + 3, rng.choice(["br3", "fl4", "br2"]))
        x += bw
    return a


def casino():
    """the ground floor under the logo, which reads as its rooftop sign: cornice, lit windows, the door"""
    w, h = 400, 122
    a = new(w, h, "ink3")
    for y in range(26, h, 8):  # stone courses
        a[y, :] = C["ink2"]
        off = 0 if (y // 8) % 2 else 12
        for x in range(off, w, 24):
            a[y:y + 8, x] = C["ink2"]
    specks(a, ["pa0", "ink2"], 500, mask="ink3")
    # cornice and balustrade
    rect(a, 0, 0, w, 3, "pa0")
    rect(a, 0, 3, w, 6, "pa1")
    rect(a, 0, 6, w, 8, "ink1")
    rect(a, 4, 8, w - 4, 10, "pa0")
    for x in range(8, w - 8, 7):
        rect(a, x, 10, x + 3, 21, "pa0")
        px(a, x + 1, 11, "pa1")
    rect(a, 4, 21, w - 4, 24, "pa1")
    rect(a, 4, 24, w - 4, 25, "ink1")
    for x in range(10, w, 50):  # pilasters
        rect(a, x, 25, x + 8, h, "pa0")
        rect(a, x, 25, x + 2, h, "pa1")
        rect(a, x + 7, 25, x + 8, h, "ink2")
    # tall arched windows either side of the door, lit
    for x in list(range(24, 140, 50)) + list(range(274, w - 30, 50)):
        arch_window(a, x, 40, 22, 62)
        rect(a, x - 3, 102, x + 25, 105, "pa1")
        rect(a, x - 3, 105, x + 25, 106, "ink1")
    # the entrance: a deep arch with a lit fanlight and burgundy doors
    dx, dw, top = 164, 72, 46
    r = dw // 2
    for y in range(top, h - 4):
        for x in range(dx, dx + dw):
            dy = y - (top + r)
            d2 = (x - dx - r + 0.5) ** 2 + (dy + 0.5) ** 2
            if dy < 0 and d2 > r * r:
                continue
            if dy < 0 and d2 > (r - 5) ** 2:
                a[y, x] = C["pa1" if (x // 4 + y // 4) % 2 else "pa0"]
            elif dy < 0:
                a[y, x] = C["fl5" if dy > -14 else "fl4"]
            elif x < dx + 5 or x >= dx + dw - 5:
                a[y, x] = C["pa0"]
            else:
                a[y, x] = C["bu2"]
    for x in range(dx + 9, dx + dw - 9, 5):  # fanlight spokes
        for y in range(top + 8, top + r):
            if a[y, x] in (C["fl4"], C["fl5"]):
                a[y, x] = C["br3"]
    rect(a, dx + 5, top + r, dx + dw - 5, top + r + 1, "ink1")
    a[top + r:h - 4, dx + r] = C["ink1"]
    for side in (dx + 8, dx + r + 3):  # door panels
        rect(a, side, top + r + 5, side + r - 11, top + r + 30, "bu1")
        rect(a, side, top + r + 34, side + r - 11, h - 8, "bu1")
    rect(a, dx + r - 3, top + r + 30, dx + r - 1, top + r + 35, "br4")
    rect(a, dx + r + 2, top + r + 30, dx + r + 4, top + r + 35, "br4")
    # marquee canopy over the door (its bulbs and CASINO are drawn in code)
    rect(a, 136, 28, 264, 42, "bu2")
    rect(a, 136, 28, 264, 30, "br3")
    rect(a, 136, 40, 264, 42, "br2")
    rect(a, 136, 42, 264, 43, "ink1")
    # steps
    rect(a, dx - 10, h - 4, dx + dw + 10, h - 2, "pa1")
    rect(a, dx - 16, h - 2, dx + dw + 16, h, "pa0")
    return a


def building(w, h, seed, shop):
    """a haussmann block: slate mansard, stone floors with balconies, an optional shopfront"""
    r = random.Random(seed)
    a = new(w, h, "ink2")
    specks(a, ["ink3", "ink1"], w * h // 16, mask="ink2")
    # mansard
    rect(a, 0, 0, w, 26, "bl0")
    for y in range(0, 26, 4):
        a[y, :] = C["ink1"]
    for x in range(10, w - 16, 34):
        rect(a, x, 4, x + 14, 26, "ink3")
        rect(a, x + 3, 9, x + 11, 22, "fl4" if r.random() < 0.4 else "bl1")
        rect(a, x - 1, 2, x + 15, 5, "pa0")
    rect(a, 0, 26, w, 30, "pa1")
    rect(a, 0, 30, w, 31, "ink1")
    floors = range(36, h - (60 if shop else 30) - 34, 40)
    for fy in floors:
        for x in range(10, w - 16, 34):
            rect_window(a, x + 2, fy, 12, 24, r.random() < 0.3)
            rect(a, x - 2, fy - 2, x, fy + 26, "bl1")  # shutters
            rect(a, x + 16, fy - 2, x + 18, fy + 26, "bl1")
        # balcony rail
        rect(a, 0, fy + 26, w, fy + 28, "ink0")
        for x in range(0, w, 3):
            rect(a, x, fy + 28, x + 1, fy + 34, "ink0")
        rect(a, 0, fy + 34, w, fy + 35, "ink0")
    if shop:
        top = h - 56
        rect(a, 0, top, w, h, "bu0")
        rect(a, 0, top, w, top + 14, "bu2")  # fascia, TABAC is lettered in code
        rect(a, 0, top + 14, w, top + 15, "br3")
        rect(a, 8, top + 20, w - 34, h - 6, "ink1")
        rect(a, 9, top + 21, w - 35, h - 7, "fl3")
        rect(a, 9, top + 21 + (h - top - 28) // 2, w - 35, h - 7, "fl4")
        for x in range(9 + 24, w - 35, 24):
            a[top + 21:h - 7, x] = C["ink1"]
        rect(a, w - 28, top + 20, w - 8, h, "bu1")  # door
        rect(a, w - 25, top + 24, w - 11, h - 30, "fl3")
    else:
        top = h - 26
        rect(a, 0, top, w, h, "ink2")
        rect(a, 12, top + 4, 40, h, "ink1")
    return a


def carotte():
    """the red double-cone tabac sign, hung from a bracket"""
    w, h = 18, 34
    a = new(w, h)
    cx = w / 2
    for y in range(4, h):
        t = (y - 4) / (h - 5)
        half = 8 * (1 - abs(t - 0.5) * 2) + 1
        for x in range(w):
            if abs(x + 0.5 - cx) <= half:
                a[y, x] = C["bu3" if x + 0.5 < cx else "bu2"]
                if abs(x + 0.5 - cx) < 1.5 and 0.2 < t < 0.8:
                    a[y, x] = C["bu4"]
    rect(a, 8, 0, 10, 5, "ink1")
    a[18, 1:w - 1] = np.where(a[18, 1:w - 1] > 0, C["pa4"], 0)  # the white band
    outline(a)
    return a


def lamp():
    w, h = 20, 132
    a = new(w, h)
    rect(a, 9, 22, 11, h - 8, "ink1")  # pole
    rect(a, 8, 60, 12, 64, "ink2")
    rect(a, 6, h - 10, 14, h, "ink1")  # base
    rect(a, 5, h - 3, 15, h, "ink2")
    # lantern: a cap, glass, a bottom
    rect(a, 4, 2, 16, 5, "ink1")
    rect(a, 6, 0, 14, 2, "ink1")
    rect(a, 5, 5, 15, 19, "fl5")
    rect(a, 7, 7, 13, 17, "fl6")
    a[5:19, 10] = C["ink1"]
    rect(a, 4, 19, 16, 22, "ink1")
    outline(a)
    return a


def curb():
    a = new(32, 8, "ink3")
    a[0, :] = C["pa0"]
    a[1, :] = C["pa1"]
    for x in range(0, 32, 16):
        a[1:, x] = C["ink2"]
    specks(a, ["ink2", "pa0"], 20, mask="ink3")
    a[7, :] = C["ink1"]
    return a


def road():
    a = new(32, 32, "ink1")
    for row in range(4):
        off = 0 if row % 2 else 4
        for col in range(-1, 4):
            x0, y0 = col * 8 + off, row * 8
            for y in range(y0 + 1, y0 + 7):
                for x in range(x0 + 1, x0 + 7):
                    corner = (x in (x0 + 1, x0 + 6)) and (y in (y0 + 1, y0 + 6))
                    if not corner:
                        a[y, x % 32] = C["ink2"]
            a[y0 + 1, (x0 + 2) % 32] = C["ink3"]
            a[y0 + 1, (x0 + 3) % 32] = C["bl0"]
    return a


def grate():
    a = new(40, 8, "ink3")
    rect(a, 2, 2, 38, 7, "ink0")
    for x in range(4, 37, 4):
        rect(a, x, 2, x + 2, 7, "ink2")
    a[0, :] = C["pa0"]
    return a


# ---------- soil ----------

def asphalt():
    a = new(32, 8, "ink1")
    a[0, :] = C["ink3"]
    specks(a, ["ink2", "ink0"], 30)
    a[7, :] = C["ink2"]
    return a


def dirt():
    a = new(32, 32, "ink2")
    specks(a, ["ink3", "ink1", "pa0"], 120)
    return a


def rock(w, h):
    a = new(w, h)
    for y in range(h):
        for x in range(w):
            if ((x + 0.5 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2 <= 1:
                a[y, x] = C["pa0" if y < h / 2 else "ink3"]
    a[1, w // 3:w // 3 + 3] = C["pa1"]
    outline(a, "ink1")
    return a


def pipe():
    a = new(32, 10, "br1")
    a[1, :] = C["br2"]
    a[2, :] = C["br3"]
    a[7:9, :] = C["br0"]
    a[0, :] = C["ink1"]
    a[9, :] = C["ink1"]
    rect(a, 0, 0, 3, 10, "br0")  # flange
    a[:, 3] = C["ink1"]
    specks(a, ["br0", "fl1"], 12, mask="br1")
    return a


def stone():
    a = new(32, 32, "ink1")
    for y0, x0, w, h in ((1, 1, 14, 9), (1, 16, 15, 9), (11, 0, 9, 10), (11, 10, 13, 10), (11, 24, 8, 10),
                         (22, 1, 16, 9), (22, 18, 13, 9)):
        rect(a, x0, y0, x0 + w, y0 + h, "ink3")
        rect(a, x0, y0, x0 + w, y0 + 1, "pa0")
        rect(a, x0 + w - 1, y0, x0 + w, y0 + h, "ink2")
    specks(a, ["ink2", "pa0"], 40, mask="ink3")
    return a


# ---------- cellar ----------

def brick():
    a = new(32, 32, "ink1")
    for row in range(4):
        off = 0 if row % 2 else 8
        for col in range(-1, 3):
            x0 = col * 16 + off
            col_ = rng.choice(["ink2", "br0", "ink2", "bk1"])
            for y in range(row * 8 + 1, row * 8 + 8):
                for x in range(x0 + 1, x0 + 16):
                    a[y, x % 32] = C[col_]
            a[row * 8 + 1, (x0 + 2) % 32:(x0 + 12) % 32 or 32] = C["ink3"]
    specks(a, ["ink2", "br1"], 40)
    return a


def beam():
    a = new(32, 12, "br1")
    a[0, :] = C["ink0"]
    a[1, :] = C["br2"]
    for y in (4, 7):
        for x in range(32):
            if (x + y * 3) % 11 < 7:
                a[y, x] = C["br0"]
    a[10, :] = C["br0"]
    a[11, :] = C["ink0"]
    return a


def floorboards():
    a = new(32, 12, "br0")
    a[0, :] = C["br1"]
    a[:, 0] = C["ink1"]
    a[:, 21] = C["ink1"]
    for x in range(32):
        if x % 9 < 5:
            a[5, x] = C["bk1"]
    a[11, :] = C["ink1"]
    return a


def rack():
    w, h = 64, 84
    a = new(w, h, "br0")
    rect(a, 0, 0, w, 3, "br1")
    rect(a, 0, h - 3, w, h, "br1")
    for x in (0, w - 3):
        rect(a, x, 0, x + 3, h, "br1")
    for row in range(5):
        for col in range(4):
            cx, cy = 10 + col * 14, 12 + row * 15
            for y in range(cy - 5, cy + 6):
                for x in range(cx - 5, cx + 6):
                    d = (x - cx) ** 2 + (y - cy) ** 2
                    if d <= 25:
                        a[y, x] = C["ink0"]
                    if d <= 12:
                        a[y, x] = C[["fg1", "bu1", "fg0", "bk1"][(row + col) % 4]]
            px(a, cx - 2, cy - 2, "pa1")
    outline(a, "ink0")
    return a


def barrel():
    w, h = 34, 40
    a = new(w, h)
    for y in range(h):
        bulge = 3 * (1 - ((y - h / 2) / (h / 2)) ** 2)
        for x in range(w):
            if abs(x + 0.5 - w / 2) <= w / 2 - 3 + bulge:
                stave = int((x + 1) / 5)
                a[y, x] = C["br2" if stave % 2 else "br1"]
    for y in (5, 6, h - 7, h - 6, h // 2):
        a[y, :] = np.where(a[y, :] > 0, C["ink2"], 0)
    a[:, w // 2 - 4] = np.where(a[:, w // 2 - 4] > 0, C["br3"], 0)
    outline(a)
    return a


def crate():
    w, h = 34, 26
    a = new(w, h, "br1")
    rect(a, 0, 0, w, 3, "br2")
    rect(a, 0, h - 3, w, h, "br0")
    for i in range(w):
        y = int(3 + i * (h - 6) / w)
        a[y:y + 2, i] = C["br0"]
    rect(a, 0, 0, 3, h, "br0")
    rect(a, w - 3, 0, w, h, "br0")
    outline(a)
    return a


def bulb():
    a = new(8, 12)
    rect(a, 3, 0, 5, 3, "ink1")
    rect(a, 2, 3, 6, 5, "ink3")
    for y in range(5, 12):
        for x in range(8):
            if (x - 3.5) ** 2 + (y - 8) ** 2 <= 10:
                a[y, x] = C["fl6" if (x - 3.5) ** 2 + (y - 8) ** 2 <= 3 else "fl5"]
    return a


def hatch():
    a = new(72, 12)
    rect(a, 0, 0, 72, 12, "br1")
    rect(a, 4, 2, 68, 12, "ink0")
    a[0, :] = C["br2"]
    for x in range(10, 68, 12):  # ladder top rungs showing
        rect(a, x, 3, x + 2, 12, "ink3")
    return a


def ladder():
    a = new(28, 16)
    rect(a, 2, 0, 5, 16, "br1")
    rect(a, 23, 0, 26, 16, "br1")
    a[:, 2] = C["br2"]
    a[:, 23] = C["br2"]
    rect(a, 5, 6, 23, 9, "ink3")
    a[6, 5:23] = C["pa0"]
    return a


# ---------- sewer ----------

def sewer_stone():
    a = new(32, 32, "ink0")
    for row in range(4):
        off = 0 if row % 2 else 8
        for col in range(-1, 3):
            x0 = col * 16 + off
            col_ = rng.choice(["fg0", "ink2", "fg0", "ink1"])
            for y in range(row * 8 + 1, row * 8 + 8):
                for x in range(x0 + 1, x0 + 16):
                    a[y, x % 32] = C[col_]
    specks(a, ["ab0", "fg1", "ink1"], 24)
    return a


def corner():
    """top-left quarter of the tunnel arch: rock outside, a ring of arch stones, open inside"""
    s = 64
    a = new(s, s)
    for y in range(s):
        for x in range(s):
            d = ((s - x - 0.5) ** 2 + (s - y - 0.5) ** 2) ** 0.5
            if d > s:
                a[y, x] = C["ink1"] if (x * 7 + y * 3) % 23 else C["ink2"]
            elif d > s - 7:
                seg = int(np.degrees(np.arctan2(s - y, s - x)) / 9)
                a[y, x] = C["ink0"] if d > s - 1 or abs(np.degrees(np.arctan2(s - y, s - x)) - seg * 9) < 1 else C["pa0" if seg % 2 else "ink3"]
    return a


def walk():
    a = new(32, 10, "ink3")
    a[0, :] = C["pa0"]
    a[1, :] = C["pa1"]
    a[:, 0] = C["ink2"]
    specks(a, ["ink2", "fg1"], 16, mask="ink3")
    a[9, :] = C["ink0"]
    return a


def water():
    a = new(32, 24, "bl0")
    ramp_dither(a, 0, 0, 32, 24, ["fg1", "fg0", "bl0", "ink1"], 0, 1)
    for y, x0 in ((3, 2), (7, 18), (12, 6), (17, 22)):
        a[y, x0:x0 + 7] = C["fg2"]
    return a


def outlet():
    s = 40
    a = new(s, s)
    for y in range(s):
        for x in range(s):
            d = ((x - s / 2 + 0.5) ** 2 + (y - s / 2 + 0.5) ** 2) ** 0.5
            if d <= s / 2:
                a[y, x] = C["ink0"] if d < s / 2 - 6 else C["br1" if (x + y) % 5 else "br0"]
                if s / 2 - 6 <= d < s / 2 - 4:
                    a[y, x] = C["ink2"]
    for y in range(s // 2 + 8, s - 6):  # a green slick down the lip
        a[y, s // 2 - 2:s // 2 + 2] = C["ab1"]
    outline(a)
    return a


# ---------- assembly ----------

# key: (pixels, pivot x, pivot y)
def parts():
    out = {
        "street/sky": (sky(), 0, 0),
        "street/skyline": (skyline(), 0, 0),
        "street/casino": (casino(), 200, 122),
        "street/house": (building(150, 236, 3, shop=False), 0, 236),
        "street/tabac": (building(150, 220, 5, shop=True), 0, 220),
        "street/carotte": (carotte(), 9, 0),
        "street/lamp": (lamp(), 10, 132),
        "street/curb": (curb(), 0, 0),
        "street/road": (road(), 0, 0),
        "street/grate": (grate(), 20, 0),
        "soil/asphalt": (asphalt(), 0, 0),
        "soil/dirt": (dirt(), 0, 0),
        "soil/rock/1": (rock(14, 9), 7, 4),
        "soil/rock/2": (rock(22, 13), 11, 6),
        "soil/rock/3": (rock(9, 6), 4, 3),
        "soil/pipe": (pipe(), 0, 0),
        "soil/stone": (stone(), 0, 0),
        "cellar/brick": (brick(), 0, 0),
        "cellar/beam": (beam(), 0, 0),
        "cellar/floor": (floorboards(), 0, 0),
        "cellar/rack": (rack(), 0, 84),
        "cellar/barrel": (barrel(), 17, 40),
        "cellar/crate": (crate(), 17, 26),
        "cellar/bulb": (bulb(), 4, 0),
        "cellar/hatch": (hatch(), 0, 0),
        "cellar/ladder": (ladder(), 0, 0),
        "sewer/stone": (sewer_stone(), 0, 0),
        "sewer/corner": (corner(), 0, 0),
        "sewer/walk": (walk(), 0, 0),
        "sewer/water": (water(), 0, 0),
        "sewer/outlet": (outlet(), 20, 20),
    }
    return out


def main():
    items = parts()
    # shelf-pack onto one source canvas
    width, gap = 720, 2
    x = y = row = 0
    placed = []
    for key, (a, pvx, pvy) in sorted(items.items(), key=lambda kv: -kv[1][0].shape[0]):
        h, w = a.shape
        if x + w > width:
            x, y, row = 0, y + row + gap, 0
        placed.append((key, x, y, w, h, pvx, pvy))
        x += w + gap
        row = max(row, h)
    height = y + row
    sheet = np.zeros((height, width), dtype=np.uint8)
    for key, x, y, w, h, _, _ in placed:
        sheet[y:y + h, x:x + w] = items[key][0]
    pal = [(0, 0, 0)] + [tuple(int(hx[i:i + 2], 16) for i in (1, 3, 5)) for hx in HEX]
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    for i, (r, g, b) in enumerate(pal):
        if i:
            rgba[sheet == i] = (r, g, b, 255)
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "sheet.png"
        Image.fromarray(rgba, "RGBA").save(png)
        manifest = Path(tmp) / "slices.json"
        manifest.write_text(json.dumps([
            {"name": k, "x": x, "y": y, "w": w, "h": h, "px": pvx, "py": pvy} for k, x, y, w, h, pvx, pvy in placed
        ]))
        subprocess.run([
            "aseprite", "-b", "--script-param", f"png={png}", "--script-param", f"slices={manifest}",
            "--script-param", f"gpl={GPL}", "--script-param", f"out={ROOT / 'title.aseprite'}",
            "--script", str(ROOT / "assemble.lua"),
        ], check=True)
    print(f"wrote title.aseprite, {len(placed)} parts")


if __name__ == "__main__":
    main()
