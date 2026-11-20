"""the drawing kit the title's scenes share: palette names, a canvas of palette indices, shapes, wear and light

everything stays on the master palette. light doesn't blend colors, it walks each color up its ramp
(UP below), with an ordered dither where the level falls between two steps. that keeps the pixel look.
"""
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

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
RGB = [(0, 0, 0)] + [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in HEX]
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16

# light walks a color up its ramp, shade walks it down. emissive colors (flame, lit glass) don't change
RAMPS = [
    "ink0 ink1 ink2 ink3 pa0 pa1 pa2 pa3 pa4",
    "bk0 bk1 br0 br1 br2 br3 br4 br5",
    "bl0 bl1 bl2 bl3",
    "bu0 bu1 bu2 bu3 bu4",
    "fg0 fg1 fg2 fg3 fg4",
    "mg0 mg1 mg2 mg3",
    "ab0 ab1 ab2 ab3",
    "vi0 vi1 vi2 vi3",
]
UP = np.arange(len(NAMES) + 1)
DOWN = np.arange(len(NAMES) + 1)
for ramp in RAMPS:
    r = [C[n] for n in ramp.split()]
    for lo, hi in zip(r, r[1:]):
        UP[lo] = hi
        DOWN[hi] = lo
# the darkest of each ramp sinks into ink
for ramp in RAMPS[1:]:
    DOWN[C[ramp.split()[0]]] = C["ink0"]
FIXED = {C[n] for n in "fl0 fl1 fl2 fl3 fl4 fl5 fl6 br5 pa4".split()}
for i in FIXED:
    UP[i] = i
    DOWN[i] = i


class Cv:
    """a canvas of palette indices, 0 is transparent"""

    def __init__(self, w, h, fill=None, seed=1):
        self.w, self.h = w, h
        self.a = np.full((h, w), C[fill] if fill else 0, dtype=np.uint8)
        self.r = random.Random(seed)

    # ---- pixels and shapes ----

    def px(self, x, y, col):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.a[y, x] = C[col] if col else 0

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.a[y, x]
        return 0

    def rect(self, x0, y0, x1, y1, col):
        """x1, y1 exclusive"""
        x0, y0, x1, y1 = (int(round(v)) for v in (x0, y0, x1, y1))
        self.a[max(0, y0):max(0, min(self.h, y1)), max(0, x0):max(0, min(self.w, x1))] = C[col] if col else 0

    def hline(self, x0, x1, y, col):
        self.rect(x0, y, x1, y + 1, col)

    def vline(self, x, y0, y1, col):
        self.rect(x, y0, x + 1, y1, col)

    def line(self, x0, y0, x1, y1, col):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.px(x0, y0, col)
            if x0 == x1 and y0 == y1:
                return
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def mask_poly(self, pts):
        m = Image.new("1", (self.w, self.h), 0)
        ImageDraw.Draw(m).polygon([tuple(p) for p in pts], fill=1)
        return np.array(m, dtype=bool)

    def poly(self, pts, col):
        self.a[self.mask_poly(pts)] = C[col]

    def mask_ellipse(self, x0, y0, x1, y1):
        """x1, y1 exclusive"""
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
        return ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1

    def ellipse(self, x0, y0, x1, y1, col):
        self.a[self.mask_ellipse(x0, y0, x1, y1)] = C[col]

    def fill(self, mask, col):
        self.a[mask] = C[col] if col else 0

    def recolor(self, x0, y0, x1, y1, frm, to):
        sub = self.a[y0:y1, x0:x1]
        sub[sub == C[frm]] = C[to]

    def paste(self, other, x, y):
        """draws another canvas on this one, its transparent pixels left out"""
        x, y = int(x), int(y)
        h, w = other.a.shape
        sx0, sy0 = max(0, -x), max(0, -y)
        dx0, dy0 = max(0, x), max(0, y)
        dx1, dy1 = min(self.w, x + w), min(self.h, y + h)
        if dx1 <= dx0 or dy1 <= dy0:
            return
        src = other.a[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0]
        dst = self.a[dy0:dy1, dx0:dx1]
        dst[src > 0] = src[src > 0]

    def flip(self):
        out = Cv(self.w, self.h)
        out.a = self.a[:, ::-1].copy()
        return out

    # ---- wear: grime, streaks, specks ----

    def specks(self, x0, y0, x1, y1, cols, n, on=None):
        for _ in range(n):
            x, y = self.r.randrange(x0, x1), self.r.randrange(y0, y1)
            if on is None or self.get(x, y) in [C[c] for c in on]:
                self.px(x, y, self.r.choice(cols))

    def streaks(self, x0, x1, y, length, n, steps=1, density=0.6):
        """soot and rain stains running down from a ledge: darker the closer to it"""
        for _ in range(n):
            x = self.r.randrange(x0, x1)
            ln = self.r.randrange(length // 3, length + 1)
            w = self.r.choice([1, 1, 2])
            for dy in range(ln):
                if self.r.random() < density * (1 - dy / ln) + 0.15:
                    for dx in range(w):
                        self.shade_px(x + dx, y + dy, -steps)

    def shade_px(self, x, y, steps):
        if 0 <= x < self.w and 0 <= y < self.h and self.a[y, x]:
            v = self.a[y, x]
            for _ in range(abs(steps)):
                v = UP[v] if steps > 0 else DOWN[v]
            self.a[y, x] = v

    def shade(self, mask, steps):
        """walks every opaque pixel in mask up (light) or down (shade) its ramp"""
        table = UP if steps > 0 else DOWN
        for _ in range(abs(steps)):
            m = mask & (self.a > 0)
            self.a[m] = table[self.a[m]]

    def shade_rect(self, x0, y0, x1, y1, steps):
        m = np.zeros((self.h, self.w), dtype=bool)
        m[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = True
        self.shade(m, steps)

    def light(self, field, only=None):
        """field: float steps per pixel (negative shades). fractional steps dither with the bayer matrix"""
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        steps = np.floor(field + BAYER[yy % 4, xx % 4]).astype(int)
        if only is not None:
            steps[~only] = 0
        for s in range(1, int(steps.max(initial=0)) + 1):
            m = (steps >= s) & (self.a > 0)
            self.a[m] = UP[self.a[m]]
        for s in range(1, int(-steps.min(initial=0)) + 1):
            m = (steps <= -s) & (self.a > 0)
            self.a[m] = DOWN[self.a[m]]

    def outline(self, col="ink0", inside=False):
        """1px outline around the opaque pixels (outside them, or on their own edge pixels)"""
        m = self.a > 0
        n = np.zeros_like(m)
        n[1:, :] |= m[:-1, :]
        n[:-1, :] |= m[1:, :]
        n[:, 1:] |= m[:, :-1]
        n[:, :-1] |= m[:, 1:]
        if inside:
            e = np.zeros_like(m)
            e[1:, :] |= ~m[:-1, :]
            e[:-1, :] |= ~m[1:, :]
            e[:, 1:] |= ~m[:, :-1]
            e[:, :-1] |= ~m[:, 1:]
            e[0, :] = e[-1, :] = True
            e[:, 0] = e[:, -1] = True
            self.a[m & e] = C[col]
        else:
            self.a[n & ~m] = C[col]

    def rgba(self):
        pal = np.array(RGB, dtype=np.uint8)
        out = np.zeros((self.h, self.w, 4), dtype=np.uint8)
        out[..., :3] = pal[self.a]
        out[..., 3] = np.where(self.a > 0, 255, 0)
        return out

    def save(self, path, scale=1):
        im = Image.fromarray(self.rgba(), "RGBA")
        if scale != 1:
            im = im.resize((self.w * scale, self.h * scale), Image.Resampling.NEAREST)
        im.save(path)


def glow(w, h, cx, cy, r, strength, sx=1.0, sy=1.0):
    """a light's field: strength steps at the middle, falling off to 0 at radius r. sx/sy squash it"""
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx + 0.5 - cx) / sx) ** 2 + ((yy + 0.5 - cy) / sy) ** 2) / r
    return strength * np.clip(1 - d, 0, 1) ** 1.6


def noise(w, h, cell, seed):
    """smooth value noise in 0..1"""
    rnd = np.random.default_rng(seed)
    gw, gh = w // cell + 2, h // cell + 2
    grid = rnd.random((gh, gw))
    yy, xx = np.mgrid[0:h, 0:w] / cell
    x0, y0 = xx.astype(int), yy.astype(int)
    fx, fy = xx - x0, yy - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = grid[y0, x0] * (1 - fx) + grid[y0, x0 + 1] * fx
    b = grid[y0 + 1, x0] * (1 - fx) + grid[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy
