"""The drawer: a brown leather carnet in the bottom-left corner, the papers sticking out of it, and the open spread.

Everything is drawn pixel by pixel in the master palette. build.py packs it into duel.png.
Run python art/duel/booklet.py on its own for a 4x review sheet (booklet-review.png).
"""

from math import cos, hypot, sin
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent


def rgba(s):
    return (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16), 255)


def ramp(*hexes):
    return [rgba(h) for h in hexes]


INK0, INK, INK2, INK3 = ramp("#0e0b0a", "#1c1513", "#2e2320", "#43342e")
# leather, dark to light. the deepest crease shifts toward red, never grey
LEA = ramp("#2a0910", "#3d2a10", "#6b4a1a", "#9c7028", "#c99a3a")
GOLD = ramp("#6b4a1a", "#9c7028", "#c99a3a", "#e8c260", "#fff0b0")
PAPER = ramp("#5c4a36", "#8c7656", "#bfa77e", "#e3d2a8", "#f6ecd2")
WINE = ramp("#2a0910", "#4e1020", "#7a1a2c", "#a82a38", "#d04a4e")
BLUE = ramp("#0f1d33", "#1a3256", "#28497a", "#3e66a0")
FELT = ramp("#0f2a20", "#174034", "#1f5a46", "#2d7a5c", "#4a9a74")
MONEY = ramp("#1e4a24", "#3a8040", "#6fcf6f", "#b8f0a0")
GREEN = ramp("#2a4a14", "#5c8f2a", "#8fd14f", "#c8f27a")
CLEAR = (0, 0, 0, 0)

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def dither(x, y):
    return (BAYER[y % 4][x % 4] + 0.5) / 16


class Px:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new("RGBA", (w, h))
        self.p = self.im.load()

    @classmethod
    def of(cls, im):
        px = cls(*im.size)
        px.im, px.p = im, im.load()
        return px

    def __setitem__(self, xy, c):
        x, y = xy
        if 0 <= x < self.w and 0 <= y < self.h:
            self.p[x, y] = c

    def __getitem__(self, xy):
        x, y = xy
        return self.p[x, y] if 0 <= x < self.w and 0 <= y < self.h else CLEAR

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self[x, y] = c

    def line(self, pts, c):
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(abs(x1 - x0), abs(y1 - y0), 1)
            for i in range(n + 1):
                self[round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n)] = c


def rounded(x, y, w, h, r):
    """pixel (x, y) inside a w×h box with corner radius r (or a tuple: top-left, top-right, bottom-right, bottom-left)"""
    if not (0 <= x < w and 0 <= y < h):
        return False
    tl, tr, br, bl = r if isinstance(r, tuple) else (r, r, r, r)
    px, py = x + 0.5, y + 0.5
    for rad, cx, cy in ((tl, tl, tl), (tr, w - tr, tr), (br, w - br, h - br), (bl, bl, h - bl)):
        if rad and abs(px - w / 2) > w / 2 - rad and abs(py - h / 2) > h / 2 - rad:
            if (px < w / 2) == (cx < w / 2) and (py < h / 2) == (cy < h / 2) and hypot(px - cx, py - cy) > rad:
                return False
    return True


def outline(px, inside, color=INK):
    """inside(x, y) -> bool. fills the shape's 1px rim with color, returns the interior test"""
    for y in range(px.h):
        for x in range(px.w):
            if inside(x, y) and not all(inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = color


def glyphs(name):
    font, key, rows = {}, None, []
    for line in (ROOT.parent / "fonts" / f"{name}.txt").read_text().splitlines():
        if line.startswith(": "):
            if key:
                font[key] = rows
            key, rows = line[2:], []
        elif key and line and set(line.rstrip("<^")) <= set(".#"):
            rows.append(line.rstrip("<^"))
        elif key and not line:
            font[key], key = rows, None
    if key:
        font[key] = rows
    return font


def word(px, text, x, y, font, colors, shadow=None, spacing=1):
    """gold-tooled letters: colors is (top rows, body). shadow goes 1px down-right, only onto leather"""
    f = glyphs(font)
    cells = []
    at = x
    for ch in text:
        if ch == " ":
            at += 3
            continue
        g = f[ch]
        for gy, row in enumerate(g):
            for gx, c in enumerate(row):
                if c == "#":
                    cells.append((at + gx, y + gy, gy))
        at += len(g[0]) + spacing
    top, body = colors
    if shadow:
        for cx, cy, _ in cells:
            px[cx + 1, cy + 1] = shadow
    for cx, cy, gy in cells:
        px[cx, cy] = top if gy < max(1, len(f[text.strip()[0]]) // 4) else body
    return at - x - spacing


def word_width(text, font, spacing=1):
    f = glyphs(font)
    return sum(3 if ch == " " else len(f[ch][0]) + spacing for ch in text) - spacing


# ---------- leather ----------

def leather(px, mask, x0, y0, w, h, seed, grain=0.05, lamp=(0.3, 0.12), lift=0.5, fall=0.8):
    """the hide: flat base, lamp-lit top-left, darker toward the bottom, pebbled grain"""
    rng = Random(seed)
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            if not mask(x, y):
                continue
            t = (y - y0) / h
            d = hypot((x - x0) / w - lamp[0], (y - y0) / h - lamp[1])
            tone = 2 + lift * max(0.0, 1 - d / 0.55) - fall * t * t
            i = int(tone) + (1 if tone - int(tone) > dither(x, y) else 0)
            i = max(1, min(3, i))
            r = rng.random()
            if r < grain:
                i = max(1, i - 1)
            elif r < grain * 1.45 and i >= 2:
                i = min(3, i + 1)
            px[x, y] = LEA[i]


def crease(px, pts, mask):
    """a fold in the hide: a dark line with its lit lip just above"""
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1):
            x, y = round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n)
            if mask(x, y - 1):
                px[x, y - 1] = LEA[3]
            if mask(x, y):
                px[x, y] = LEA[1] if px[x, y] != LEA[1] else LEA[0]


def stitches(px, path, on, off, mask, thread=PAPER[2], lit=PAPER[3]):
    """saddle stitching along a list of points: on pixels of thread, off pixels of hole"""
    for i, (x, y) in enumerate(path):
        if not mask(x, y):
            continue
        k = i % (on + off)
        px[x, y] = (lit if k == 0 else thread) if k < on else LEA[0]


def rect_path(x0, y0, x1, y1):
    pts = [(x, y0) for x in range(x0, x1)]
    pts += [(x1, y) for y in range(y0, y1)]
    pts += [(x, y1) for x in range(x1, x0, -1)]
    pts += [(x0, y) for y in range(y1, y0, -1)]
    return pts


def tooled(px, cells, mask, shade=GOLD[2], lit=GOLD[3]):
    """gold leaf pressed into the hide: the lit color on top-left facing pixels, a dark bite down-right"""
    cells = set(cells)
    for x, y in cells:
        if (x + 1, y + 1) not in cells and mask(x + 1, y + 1):
            px[x + 1, y + 1] = LEA[0]
    for x, y in cells:
        px[x, y] = lit if (x, y - 1) not in cells or (x - 1, y) not in cells else shade


def brass_corner(px, cx, cy, n, sx, sy, dark=False):
    """a triangular brass cap on a corner. (cx, cy) is the corner pixel, sx/sy point inward"""
    body, edge, hi, spec, low = (GOLD[1], GOLD[0], GOLD[2], GOLD[3], LEA[1]) if dark else (GOLD[2], GOLD[0], GOLD[3], GOLD[4], GOLD[1])
    for dy in range(n):
        for dx in range(n - dy):
            x, y = cx + dx * sx, cy + dy * sy
            if px[x, y] == INK or px[x, y][3] == 0:
                continue
            s = dx + dy
            c = body
            if s == n - 1:
                c = INK
            elif s == n - 2:
                c = edge
            elif s == n - 3:
                c = low
            elif (dy == 1 and sy > 0) or (dx == 1 and sx > 0):
                c = hi
            if n >= 14 and s == n // 2 and (dx % 2 == 0):
                c = low  # an engraved line
            px[x, y] = c
    r = max(1, n // 9)
    rx, ry = cx + sx * (r + 1), cy + sy * (r + 1)
    for dy in range(r + 1):
        for dx in range(r + 1):
            px[rx + dx * sx, ry + dy * sy] = low
    px[rx + (r if sx < 0 else 0) * sx, ry + (r if sy < 0 else 0) * sy] = spec if not dark else hi


# ---------- wear: what years in a gambler's coat pocket do to a carnet ----------

EMBER = rgba("#5a1206")
# one step older: gold rubs down to brass, deep shadows fill with grime, thread goes grubby
OLDER = {GOLD[4]: GOLD[3], GOLD[3]: GOLD[2], GOLD[2]: GOLD[1], LEA[0]: LEA[1], PAPER[3]: PAPER[2], PAPER[4]: PAPER[3]}


def runs(seed, n, amp=1, length=(5, 16)):
    """a hand-cut edge: an inset per pixel along one side, 0..amp, held for a few pixels at a time"""
    rng = Random(seed)
    out, v = [], 0
    while len(out) < n:
        out += [v] * rng.randint(*length)
        v = max(0, min(amp, v + rng.choice((-1, 1))))
    return out[:n]


def worn_box(w, h, r, seed, amp=(1, 1, 1, 0)):
    """a rounded box whose sides wander by a pixel: amp is (top, right, bottom, left)"""
    top, right, bottom, left = (runs(seed + i, w if i % 2 == 0 else h, a) for i, a in enumerate(amp))

    def inside(x, y):
        if not rounded(x, y, w, h, r):
            return False
        return y >= top[x] and x < w - right[y] and y < h - bottom[x] and x >= left[y]

    return inside


def blob(cx, cy, r, seed, squash=1.0):
    """the pixels of a ragged round patch, with how far in each one is (0 at the middle, 1 at the rim)"""
    rng = Random(seed)
    lobes = [rng.uniform(0.75, 1.2) for _ in range(7)]
    out = {}
    for y in range(int(cy - r - 2), int(cy + r + 3)):
        for x in range(int(cx - r - 2), int(cx + r + 3)):
            dx, dy = x - cx, (y - cy) / squash
            a = (Random(x * 977 + y).random() * 0.25 + (0.5 + 0.5 * (dx / (abs(dx) + abs(dy) + 0.01)))) * 3
            edge = r * lobes[int(a) % 7]
            d = hypot(dx, dy) / edge
            if d < 1:
                out[(x, y)] = d
    return out


def scuff(px, cx, cy, r, mask, seed, deep=False, squash=1.0):
    """rubbed through the top grain: lighter leather, and the suede under it where it's deep"""
    for (x, y), d in blob(cx, cy, r, seed, squash).items():
        if not mask(x, y) or px[x, y] == INK:
            continue
        if deep and d < 0.45:
            px[x, y] = PAPER[1] if dither(x, y) < 0.7 else PAPER[0]
        elif d < 0.8 or dither(x, y) < 0.5:
            px[x, y] = LEA[3] if px[x, y] in (LEA[2], LEA[3]) else LEA[2]


def ring(px, cx, cy, r, mask, seed, color, lit=None, squash=0.92):
    """the tide line a wet glass leaves: a broken circle, a lighter lip inside it here and there"""
    rng = Random(seed)
    gap = runs(seed, int(6.3 * r) + 8, 1, (3, 11))
    steps = int(6.3 * r * 1.5)
    for i in range(steps):
        a = 6.2832 * i / steps
        if gap[int(i / 1.5)]:
            continue
        x, y = round(cx + r * cos(a)), round(cy + r * squash * sin(a))
        if mask(x, y) and px[x, y] != INK:
            px[x, y] = color
            if lit and rng.random() < 0.3:
                ix, iy = round(cx + (r - 1) * cos(a)), round(cy + (r - 1) * squash * sin(a))
                if mask(ix, iy) and px[ix, iy] != INK:
                    px[ix, iy] = lit


def burn(px, cx, cy, r, mask, seed):
    """a cigarette set down on it once: a charred hole, an ember-brown ring, scorch around"""
    for (x, y), d in blob(cx, cy, r, seed, 0.85).items():
        if not mask(x, y) or px[x, y] == INK:
            continue
        if d < 0.38:
            px[x, y] = INK0
        elif d < 0.55:
            px[x, y] = EMBER if dither(x, y) < 0.7 else INK2
        elif d < 0.8:
            px[x, y] = LEA[0] if dither(x, y) < 0.75 else EMBER
        elif dither(x, y) < 0.5:
            px[x, y] = LEA[1]
    rng = Random(seed + 3)
    for _ in range(max(2, r)):
        x, y = cx + rng.randint(-2 * r, 2 * r), cy + rng.randint(-r, r)
        if mask(x, y) and px[x, y] != INK:
            px[x, y] = INK3  # ash


def rub(px, cx, cy, rx, ry, strength, seed, mask=lambda x, y: True, polish=0.25):
    """a thumb's worth of handling: everything one step older, the plain hide polished a shade lighter"""
    rng = Random(seed)
    for y in range(int(cy - ry), int(cy + ry) + 1):
        for x in range(int(cx - rx), int(cx + rx) + 1):
            d = hypot((x - cx) / rx, (y - cy) / ry)
            if d >= 1 or not mask(x, y):
                continue
            k = strength * (1 - d)
            c = px[x, y]
            if c in OLDER and rng.random() < k:
                px[x, y] = OLDER[c]
            elif c == LEA[2] and rng.random() < k * polish:
                px[x, y] = LEA[3]
            elif c == LEA[1] and rng.random() < k * polish:
                px[x, y] = LEA[2]


def scratches(px, n, box, mask, seed, color=LEA[3], length=(5, 16)):
    """keys and coins in the same pocket: fine light lines, broken"""
    rng = Random(seed)
    x0, y0, x1, y1 = box
    for _ in range(n):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        a = rng.uniform(-0.9, 0.9) + (3.1416 if rng.random() < 0.5 else 0)
        dx, dy = cos(a), sin(a) * 0.6
        for i in range(rng.randint(*length)):
            px_, py_ = round(x + dx * i), round(y + dy * i)
            if mask(px_, py_) and px[px_, py_] not in (INK, INK0) and rng.random() < 0.85:
                px[px_, py_] = color


def hinge_cracks(px, x0, x1, h, n, mask, seed):
    """where the cover bends every time it opens, the hide cracks across"""
    rng = Random(seed)
    for _ in range(n):
        y = rng.randint(3, h - 4)
        x = x0
        while x <= x1 + rng.randint(0, 2):
            if mask(x, y) and px[x, y] != INK:
                px[x, y] = LEA[0]
                if mask(x, y - 1) and px[x, y - 1] != INK:
                    px[x, y - 1] = LEA[3]
            x += 1
            y += rng.choice((0, 0, 1, -1))


def stitch_path(px, path, on, off, mask, seed, missing=2, loose=None):
    """saddle stitching with a few runs gone (bare holes left), and maybe a loose end lying on the hide"""
    rng = Random(seed)
    gone = set()
    for _ in range(missing):
        a = rng.randrange(len(path))
        gone |= set(range(a, a + rng.randint(4, 4 + len(path) // 30)))
    for i, (x, y) in enumerate(path):
        if not mask(x, y) or px[x, y] == INK:
            continue
        k = i % (on + off)
        if k >= on:
            px[x, y] = LEA[0]
        elif i not in gone:
            px[x, y] = PAPER[3] if k == 0 and rng.random() < 0.7 else PAPER[2]
    if loose:
        px.line(loose, PAPER[2])


def lost_corner(px, cx, cy, n, sx, sy, holes, mask):
    """the brass cap fell off years ago: a darker unfaded triangle where it sat, its nail holes,
    and the very tip worn down to the board"""
    for dy in range(n):
        for dx in range(n - dy):
            x, y = cx + dx * sx, cy + dy * sy
            if not mask(x, y) or px[x, y] == INK:
                continue
            s = dx + dy
            if s < 3:
                px[x, y] = PAPER[0] if s < 2 else PAPER[1]
            elif s == n - 1:
                px[x, y] = LEA[3] if dither(x, y) < 0.6 else LEA[2]  # the faded line where the cap's edge was
            elif s == n - 2:
                px[x, y] = LEA[1]
            else:
                px[x, y] = WINE[1] if dither(x, y) < 0.3 else LEA[1] if dither(x, y) < 0.8 else LEA[2]
    for hx, hy in holes:
        px[cx + hx * sx, cy + hy * sy] = INK0
        px[cx + (hx + 1) * sx, cy + hy * sy] = LEA[3]


def tarnish(px, cx, cy, n, sx, sy, seed, dent=True):
    """old brass: dull patches, a little verdigris in the corner seams, a dent"""
    rng = Random(seed)
    for dy in range(n):
        for dx in range(n - dy):
            x, y = cx + dx * sx, cy + dy * sy
            c = px[x, y]
            if c in (GOLD[2], GOLD[3]) and rng.random() < 0.22:
                px[x, y] = GOLD[1] if c == GOLD[2] else GOLD[2]
            elif c == GOLD[1] and dx + dy > n - 5 and rng.random() < 0.18:
                px[x, y] = FELT[3] if rng.random() < 0.6 else FELT[4]
    if dent:
        x, y = cx + (n // 3) * sx, cy + (n // 4 + 1) * sy
        px[x, y] = GOLD[1]
        px[x + sx, y] = GOLD[4]


def foxing(px, n, box, seed, mask=lambda x, y: True):
    """old paper's rust spots: little clusters, darker at the heart"""
    rng = Random(seed)
    x0, y0, x1, y1 = box
    for _ in range(n):
        cx, cy = rng.randint(x0, x1), rng.randint(y0, y1)
        r = rng.choice((1, 1, 1, 2, 2, 3))
        for (x, y), d in blob(cx, cy, r + 0.5, rng.randrange(999)).items():
            if mask(x, y) and px[x, y] in (PAPER[3], PAPER[4], PAPER[2]):
                px[x, y] = PAPER[1] if d < 0.3 and r > 1 else PAPER[2]


def yellowing(px, box, seed, mask, amount=0.5):
    """paper doesn't age evenly: big soft blotches, dithered"""
    rng = Random(seed)
    waves = [(rng.uniform(0.01, 0.04), rng.uniform(0.01, 0.04), rng.uniform(0, 6)) for _ in range(4)]
    x0, y0, x1, y1 = box
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if not mask(x, y) or px[x, y] != PAPER[3]:
                continue
            v = sum(sin(x * fx + y * fy + p) for fx, fy, p in waves) / 4
            if dither(x, y) < max(0.0, v - 0.6 + amount) * (0.3 + amount):
                px[x, y] = PAPER[2]


def smudge(px, cx, cy, rx, ry, color, mask, density=0.55):
    """a dirty fingerprint where it's always pulled"""
    for y in range(int(cy - ry), int(cy + ry) + 1):
        for x in range(int(cx - rx), int(cx + rx) + 1):
            d = hypot((x - cx) / rx, (y - cy) / ry)
            if d < 1 and mask(x, y) and px[x, y] not in (INK, CLEAR) and dither(x, y) < density * (1.2 - d):
                px[x, y] = color


def tally(px, x, y, n, color, rng):
    """pencil tally marks in a margin, a bit wonky: groups of five"""
    for i in range(n):
        g, k = divmod(i, 5)
        bx = x + g * 9
        if k < 4:
            lean = rng.choice((0, 0, 1))
            px.line([(bx + k * 2, y), (bx + k * 2 + lean, y + 5)], color)
        else:
            px.line([(bx - 1, y + 4), (bx + 7, y + 1)], color)


# ---------- the closed carnet ----------

def flame_small():
    return [
        "....#....",
        "....##...",
        "...###...",
        "..####.#.",
        "..#####..",
        ".######..",
        ".##o####.",
        ".#oooo##.",
        "##oOOo###",
        "##oOOOo##",
        ".#ooOoo#.",
        "..#####..",
    ]


def booklet():
    """80×80 front cover plus 4px of page block and back cover going down-right: 84×84.
    it's been carried for years: the bottom brass cap is gone, a cigarette went down on it once,
    a glass sat on it, and the tooling is rubbed off where the thumb opens it"""
    S, D = 80, 4
    px = Px(S + D, S + D)
    face = worn_box(S, S, (2, 3, 3, 3), seed=7)
    # the depth, back to front: the back cover, then the page edges
    for i in range(D - 1, -1, -1):
        for y in range(S):
            for x in range(S):
                if not face(x, y):
                    continue
                X, Y = x + i + 1, y + i + 1
                if face(x + 1, y) and face(x, y + 1):
                    continue
                if i == D - 1:
                    px[X, Y] = INK
                elif i == D - 2:
                    px[X, Y] = LEA[0] if not face(x, y + 1) else LEA[1]
                else:
                    bottom = not face(x, y + 1)
                    px[X, Y] = (PAPER[2] if i == 0 else PAPER[1]) if bottom else (PAPER[3] if i == 0 else PAPER[2])
    # the fore-edge is grubby where it's thumbed open, and the pages aren't all flush
    for y in range(26, 58):
        for X in (S, S + 1):
            if px[X, y] in (PAPER[3], PAPER[2]) and dither(X, y) < 0.6 - abs(y - 42) / 30:
                px[X, y] = PAPER[1] if px[X, y] == PAPER[2] else PAPER[2]
    for y in (14, 15, 16, 63, 64):
        px[S + 1, y] = PAPER[3]
    # the face
    leather(px, face, 0, 0, S, S, seed=4, grain=0.04, lamp=(0.25, 0.05), lift=0.32, fall=0.55)
    outline(px, face)
    inner = lambda x, y: face(x, y) and px[x, y] != INK
    rng = Random(9)
    for x in range(2, S - 2):
        if rng.random() < 0.7 and inner(x, 1):
            px[x, 1] = LEA[3]
        if rng.random() < 0.6 and inner(x, S - 2):
            px[x, S - 2] = LEA[1]
    for y in range(2, S - 2):
        if rng.random() < 0.35 and inner(S - 2, y):
            px[S - 2, y] = LEA[3] if y < S // 2 else LEA[2]
    # the spine side: a rounded edge, then the hinge groove
    for y in range(1, S - 1):
        px[1, y] = LEA[1]
        px[2, y] = LEA[3] if (y < S * 0.6 or dither(2, y) > 0.5) else LEA[2]
        px[3, y] = LEA[3] if y < S * 0.35 else LEA[2]
        px[5, y] = LEA[1]
        px[6, y] = LEA[0]
        px[7, y] = LEA[3] if y < S * 0.7 else LEA[2]
    px[2, 1] = px[3, 1] = LEA[2]
    hinge_cracks(px, 1, 4, S, 6, inner, seed=21)
    # folds, worn crooked: by the hinge, and the much-handled bottom
    crease(px, [(9, 22), (12, 21), (15, 23), (17, 22)], inner)
    crease(px, [(9, 47), (13, 46), (16, 47)], inner)
    crease(px, [(55, 74), (61, 71), (66, 72), (70, 69)], inner)
    crease(px, [(30, 76), (35, 74), (40, 75)], inner)
    crease(px, [(68, 12), (72, 15), (75, 15)], inner)
    # the stitching, a couple of runs gone and one end come loose
    stitch_path(px, rect_path(10, 3, S - 4, S - 4), 2, 1, inner, seed=3, missing=3,
                loose=[(S - 4, 30), (S - 6, 32), (S - 5, 34), (S - 7, 35)])
    # the tooled frame, broken where the gold flaked, and its corner flowers
    gaps = runs(5, 400, 1, (2, 9))
    frame = {p for i, p in enumerate(rect_path(14, 7, S - 8, S - 8)) if not (gaps[i] and i % 3)}
    for cx, cy in ((14, 7), (S - 8, 7), (S - 8, S - 8), (14, S - 8)):
        sx = 1 if cx < S // 2 else -1
        sy = 1 if cy < S // 2 else -1
        frame |= {(cx + 2 * sx, cy + 2 * sy), (cx + 3 * sx, cy + 2 * sy), (cx + 2 * sx, cy + 3 * sy)}
    tooled(px, frame, inner)
    # the emblem: a lozenge with a flame in it, the name under it
    cx, cy = 44, 30
    loz = set()
    for y in range(cy - 13, cy + 14):
        for x in range(cx - 10, cx + 11):
            v = abs(x - cx) / 10 + abs(y - cy) / 13
            if 0.92 <= v <= 1.04:
                loz.add((x, y))
    tooled(px, loz, inner)
    fl = flame_small()
    colors = {"#": GOLD[2], "o": GOLD[3], "O": GOLD[4]}
    fx, fy = cx - 4, cy - 6
    cells = {(fx + x, fy + y) for y, row in enumerate(fl) for x, c in enumerate(row) if c != "."}
    for x, y in cells:
        if (x + 1, y + 1) not in cells and inner(x + 1, y + 1):
            px[x + 1, y + 1] = LEA[0]
    for y, row in enumerate(fl):
        for x, c in enumerate(row):
            if c != ".":
                px[fx + x, fy + y] = colors[c]
    w = word_width("FLAMBEUR", "tiny")
    word(px, "FLAMBEUR", cx - w // 2, 49, "tiny", (GOLD[3], GOLD[2]), shadow=LEA[0])
    rule = {(x, 58) for x in range(cx - 11, cx - 2)} | {(x, 58) for x in range(cx + 3, cx + 12)}
    rule |= {(cx, 56), (cx - 1, 57), (cx, 57), (cx + 1, 57), (cx - 2, 58), (cx - 1, 58), (cx, 58), (cx + 1, 58), (cx + 2, 58), (cx - 1, 59), (cx, 59), (cx + 1, 59), (cx, 60)}
    tooled(px, rule, inner)
    # the top cap is still on, dull and dented. the bottom one is long gone
    brass_corner(px, S - 1, 0, 10, -1, 1)
    tarnish(px, S - 1, 0, 10, -1, 1, seed=8)
    lost_corner(px, S - 1, S - 1, 10, -1, -1, [(2, 6), (6, 2)], inner)
    # handling: the thumb's spot on the fore-edge, the gold rubbed thin on the name and the flame
    rub(px, 72, 42, 13, 17, 0.75, seed=11, mask=inner, polish=0.4)
    rub(px, 52, 51, 9, 4, 0.55, seed=12, mask=inner)
    rub(px, 45, 33, 4, 4, 0.45, seed=13, mask=inner)
    scuff(px, 3, 4, 3, inner, seed=14)
    scuff(px, 38, 78, 4, inner, seed=15, squash=0.5)
    scuff(px, 3, 74, 3, inner, seed=16, deep=True)
    scratches(px, 4, (16, 14, 64, 70), inner, seed=17, length=(4, 10))
    # a glass sat on it (the ring runs under the band), and somebody's cigarette
    ring(px, 58, 19, 10, inner, seed=18, color=LEA[1], lit=LEA[3])
    burn(px, 20, 67, 3, inner, seed=19)
    return px.im


def band():
    """the elastic that keeps it shut, stretched out of true: it wanders, it's furred, it's rubbed pale where
    it bends over the edges"""
    w, h = 5, 86
    px = Px(w, h)
    off = runs(23, h, 1, (9, 22))
    rng = Random(24)
    for y in range(h):
        x = 1 + off[y]
        shade = y < 1 or y > 81
        worn = y in (1, 2, 80, 81)
        px[x, y] = WINE[1] if not shade else WINE[0]
        px[x + 1, y] = (WINE[4] if y < 40 else WINE[3]) if not (shade or worn) else (WINE[3] if worn else WINE[1])
        px[x + 2, y] = WINE[2] if not shade else WINE[0]
        if y % 7 == 3 and not shade:
            px[x + 1, y] = WINE[3]  # the weave
        if rng.random() < 0.06 and not shade:
            px[x + (3 if rng.random() < 0.5 else -1), y] = WINE[2]  # fuzz
    return px.im


def slip(kind, w=48, h=13):
    """an index tab out of the fore-edge. paper body, a colored tip, each a different kind of paper, each
    handled to death: smudged where it's pulled, faded at the tip, and something wrong with every one"""
    tips = {
        "etui": (WINE[3], WINE[4], WINE[2]),
        "classeur": (BLUE[2], BLUE[3], BLUE[1]),
        "sleeve": (GOLD[2], GOLD[3], GOLD[1]),
        "vitrine": (GREEN[1], GREEN[2], GREEN[0]),
        "carnet": (WINE[4], PAPER[4], WINE[3]),
    }
    base, hi, lo = tips[kind]
    k = h / 13  # the open book's tabs are the same tabs, bigger
    px = Px(w, h)
    seed = sum(map(ord, kind)) + w
    r = {"etui": (0, 3, 3, 0), "sleeve": (0, 2, 2, 0)}.get(kind, (0, 0, 0, 0))
    edge = worn_box(w, h, r, seed=seed, amp=(1, 0, 1, 0))
    tip = max(4, w // 12)
    fold = round(3 * k) if kind == "etui" else 0  # the étui's tip is dog-eared

    def inside(x, y):
        if not edge(x, y):
            return False
        if kind == "classeur" and x > w - 3 and (y < x - (w - 3) or h - 1 - y < x - (w - 3)):
            return False  # chamfered divider
        if kind == "vitrine" and x >= w - round(2 * k) and abs(y - h // 2) < (x - (w - round(2 * k) - 1)) * 2:
            return False  # a ticket's notch
        if kind == "vitrine" and x >= w - 1 - round(k) and y % 2 == 0 and y > h // 2 + round(3 * k):
            return False  # torn off the roll
        if kind == "carnet" and x >= w - 1 - (Random(y // max(1, round(k)) + 7).random() < 0.5) * round(k):
            return x < w - 1 - round(k)  # torn from the notebook
        if fold and (w - 1 - x) + y < fold:
            return False
        return True

    body = PAPER[4] if kind == "sleeve" else PAPER[3]
    for y in range(h):
        for x in range(w):
            if inside(x, y):
                px[x, y] = body
                if y == 1 or (k > 1 and y == 2):
                    px[x, y] = PAPER[4]
                elif y >= h - 1 - round(k):
                    px[x, y] = PAPER[2]
    yellowing(px, (0, 0, w - 1, h - 1), seed, inside, 0.8)
    if kind == "carnet":
        for x in range(w - tip):
            if inside(x, h - 1 - round(3 * k)):
                px[x, h - 1 - round(3 * k)] = BLUE[3]
        for y in range(1, h - 1):
            if inside(w - tip - round(6 * k), y):
                px[w - tip - round(6 * k), y] = WINE[4]  # the margin line
    if kind == "sleeve":
        rng = Random(seed)
        for _ in range(int(6 * k * k)):
            x0, y0 = rng.randint(2, w - tip - 4), rng.randint(1, h - 3)
            px.line([(x0, y0), (x0 + round(2 * k), y0 + round(k))], PAPER[3])  # glassine wrinkles
    for y in range(h):
        for x in range(w - tip - 1, w):
            if inside(x, y):
                c = hi if y <= round(2 * k) else lo if y >= h - 1 - round(2 * k) else base
                # the tip is sun-faded and rubbed where it's pinched
                if c == base and dither(x, y) < 0.22:
                    c = hi
                px[x, y] = c
    if kind == "vitrine":
        for y in range(1, h - 1, 2):
            px[w - tip - 2, y] = PAPER[1]  # perforation
        ring(px, w - tip - round(9 * k), h // 2, round(3.5 * k), inside, seed, GREEN[0], squash=1.0)  # a stamp, half there
    if kind == "classeur":
        # torn once and taped: a crooked tear under a strip of yellowed tape
        tx = w - tip - round(10 * k)
        for y in range(1, h - 1):
            px[tx + (y // max(1, round(2 * k))) % 2, y] = PAPER[1]
        for y in range(h):
            for x in range(tx - round(2 * k), tx + round(3 * k)):
                if inside(x, y) and dither(x, y) < 0.6:
                    px[x, y] = PAPER[4] if px[x, y] != PAPER[1] else PAPER[2]
    if kind == "carnet":
        ring(px, w - tip - round(14 * k), h // 2, round(3 * k), inside, seed, PAPER[2], squash=1.0)  # coffee
    # the fingerprint where it's always pulled
    smudge(px, w - tip - round(5 * k), h // 2, round(3 * k), max(1, round(2.5 * k)), PAPER[2], inside)
    outline(px, inside)
    if fold:
        # the folded-over corner, showing the back of the card stock
        for d in range(fold):
            for j in range(fold - d):
                x, y = w - 1 - fold + j - 1, d + j + 1
                if 0 <= x < w and (w - 1 - x) + y >= fold and px[x, y] not in (CLEAR,):
                    px[x, y] = PAPER[2] if j else INK
    return px.im


def tab(kind):
    """the same tab at the open book's size: 64×40, about 52 of it shows"""
    return slip(kind, 64, 40)


def receipt():
    """a tabac receipt, balled up once and flattened again: zigzag top, red losange stamp, a coffee ring"""
    w, h = 12, 24
    px = Px(w, h)
    torn = {(w - 1, h - 1), (w - 2, h - 1), (w - 1, h - 2)}
    inside = lambda x, y: 0 <= x < w and 1 + (x % 2) <= y < h and (x, y) not in torn
    for y in range(h):
        for x in range(w):
            if inside(x, y):
                px[x, y] = PAPER[4]
    # the crumple: folds catching light on one side, shade on the other
    for pts, c in (([(0, 9), (5, 12), (11, 10)], PAPER[2]), ([(0, 10), (5, 13), (11, 11)], PAPER[3]),
                   ([(3, 2), (4, 8), (7, 23)], PAPER[3]), ([(9, 3), (8, 15)], PAPER[3])):
        px.line(pts, c)
    rng = Random(2)
    for y, x0, x1 in ((5, 2, 9), (7, 2, 6), (11, 2, 8), (13, 3, 9), (15, 2, 5), (19, 2, 9)):
        for x in range(x0, x1 + 1):
            if (x % 3 != 2 or y == 19) and rng.random() < 0.85:
                px[x, y + (1 if x > 6 and y < 12 else 0)] = PAPER[1] if y != 19 else INK3
    for dy in range(-2, 3):
        for dx in range(-(2 - abs(dy)), 3 - abs(dy)):
            if rng.random() < 0.8:
                px[8 + dx, 9 + dy] = WINE[3] if abs(dx) + abs(dy) < 2 else WINE[2]
    ring(px, 3, 17, 4, inside, 4, PAPER[2], squash=1.0)
    for x in range(w):
        if inside(x, h - 2):
            px[x, h - 2] = PAPER[3]
    outline(px, inside)
    return px.im


def card_corner():
    """the corner of a card stuck in there: red lattice back, worn white border, dog-eared"""
    w, h = 16, 24
    px = Px(w, h)
    fold = 5
    inside = lambda x, y: rounded(x, y, w, h, 3) and x + y >= fold
    rng = Random(5)
    for y in range(h):
        for x in range(w):
            if not inside(x, y):
                continue
            if x in (1, w - 2) or y in (1, h - 2):
                px[x, y] = PAPER[4] if rng.random() < 0.8 else PAPER[3]
            else:
                lattice = (x + y) % 4 == 0 or (x - y) % 4 == 0
                px[x, y] = WINE[3] if lattice and rng.random() < 0.85 else WINE[2]
                if (x + y) % 8 == 2 and (x - y) % 8 == 2:
                    px[x, y] = GOLD[3] if rng.random() < 0.6 else GOLD[1]
    px.line([(2, 13), (8, 11), (14, 12)], WINE[1])  # bent once
    px.line([(2, 12), (8, 10), (14, 11)], WINE[4])
    outline(px, inside)
    # the flap folded down over the corner shows the card's white face
    for y in range(fold + 1):
        for x in range(fold + 1):
            if x + y >= fold - 1 and x + y <= fold + 1 and x <= fold and y <= fold and (x + y) >= fold:
                px[x + 1, y + 1] = INK if x + y == fold + 1 or x == 0 or y == 0 else PAPER[3]
    px[fold - 1, 2] = PAPER[4]
    return px.im


def banknote():
    """a folded franc note, soft from use: guilloche border, a crease down the middle, a torn corner"""
    w, h = 22, 11
    px = Px(w, h)
    inside = lambda x, y: 0 <= x < w and 0 <= y < h and not (x == 0 and y == 0) and not (x + y < 2 and x < 2)
    for y in range(h):
        for x in range(w):
            if not inside(x, y):
                continue
            px[x, y] = MONEY[1]
            if x in (1, w - 2) or y in (1, h - 2):
                px[x, y] = MONEY[2] if (x + y) % 2 else MONEY[1]
    for y in range(3, h - 3):
        for x in range(8, 14):
            if hypot(x - 10.5, (y - 5) * 1.3) < 3.2:
                px[x, y] = MONEY[0]
    px[10, 4] = px[11, 4] = MONEY[3]
    px[4, 4] = px[4, 6] = px[17, 4] = px[17, 6] = MONEY[2]
    for y in range(1, h - 1):
        px[15, y] = MONEY[0]
        if y % 2:
            px[16, y] = MONEY[2]
    smudge(px, 5, 6, 3, 3, MONEY[0], inside, 0.4)
    outline(px, inside)
    return px.im


def ribbon():
    """the bookmark, hanging out the bottom: faded, forked, frayed to threads"""
    w, h = 5, 19
    px = Px(w, h)

    def inside(x, y):
        if not (0 <= x < w and 0 <= y < h - 1):
            return False
        cut = y - (h - 6)
        return not (cut > 0 and abs(x - 2) < cut)

    for y in range(h):
        for x in range(w):
            if inside(x, y):
                px[x, y] = (WINE[2], WINE[4] if y > 6 else WINE[3], WINE[3], WINE[2], WINE[1])[x]
    for y in range(3, h - 4, 5):
        px[2, y] = WINE[3]
    outline(px, inside)
    for x, y in ((0, h - 1), (4, h - 1), (1, h - 2), (4, h - 3)):
        px[x, y] = WINE[3]  # loose threads
    return px.im


def pencil():
    """a green pencil that rides in the spine loops, sharpened down to a stub, paint chipped,
    the end chewed and the eraser worn flat at a slant"""
    w, h = 5, 54
    px = Px(w, h)
    rng = Random(6)
    for y in range(h):
        for x in range(w):
            if y < 3:
                if y < 2 - x // 3:
                    continue  # worn at a slant
                c = (WINE[2], WINE[4], WINE[3], WINE[2], WINE[1])[x]
            elif y < 6:
                c = (GOLD[1], GOLD[3] if y % 2 else GOLD[2], GOLD[2], GOLD[1], GOLD[0])[x]
                if y == 5 and x == 2:
                    c = GOLD[1]  # crimp dented
            elif y < h - 9:
                c = (FELT[2], FELT[4], FELT[3], FELT[2], FELT[1])[x]
                if y in (14, 15) and x in (1, 2, 3):
                    c = GOLD[2] if y == 14 and x != 3 else FELT[3]
                if 0 < x < 4 and rng.random() < 0.05:
                    c = PAPER[2]  # chipped to the wood
                if y in (7, 8, 10) and x in (1, 3) and rng.random() < 0.7:
                    c = PAPER[1]  # tooth marks
            else:
                k = y - (h - 9)
                half = 2.5 - k * 0.32
                if abs(x + 0.5 - 2.5) > half:
                    continue
                c = INK3 if k >= 6 else PAPER[3] if x <= 2 else PAPER[2]
                if k == 7:
                    c = INK2  # blunt
            px[x, y] = c
    outline(px, lambda x, y: px[x, y][3] > 0)
    return px.im


def loop():
    """the leather loop on the spine that holds the pencil, stretched and with a stitch gone"""
    w, h = 9, 6
    px = Px(w, h)
    inside = lambda x, y: rounded(x, y, w, h, 1)
    for y in range(h):
        for x in range(w):
            if inside(x, y):
                px[x, y] = LEA[3] if y == 1 and x % 4 else LEA[1] if y == h - 2 else LEA[2]
    for x in range(1, w - 3, 2):
        px[x, 2] = PAPER[2]
    outline(px, inside)
    return px.im


# ---------- the big cover, at the open book's size ----------

def flame_mask(w, h, k=1.0):
    """three tongues of flame as a polygon, w×h. k < 1 shrinks it toward the hot base, for the inner colors"""
    m = Image.new("L", (w, h))
    d = ImageDraw.Draw(m)
    pts = [(0.0, 1.0), (-0.62, 0.86), (-0.9, 0.55), (-0.78, 0.25), (-0.55, 0.38), (-0.5, 0.12),
           (-0.25, -0.05), (-0.22, 0.22), (0.02, -0.25), (0.22, 0.05), (0.24, 0.3), (0.5, 0.08), (0.62, 0.3),
           (0.88, 0.48), (0.82, 0.78), (0.55, 0.95)]
    pts = [(x * k, 0.78 + (y - 0.78) * k) for x, y in pts]
    d.polygon([((x + 1) / 2 * (w - 1), (y + 0.25) / 1.25 * (h - 1)) for x, y in pts], 255)
    return m.load()


def cover_big(W=268, H=266):
    """the same cover at the open book's size, the same history on it"""
    px = Px(W, H)
    face = worn_box(W, H, (4, 6, 8, 5), seed=70, amp=(1, 2, 1, 0))
    leather(px, face, 0, 0, W, H, seed=12, grain=0.06, lamp=(0.32, 0.14), lift=0.7, fall=0.9)
    outline(px, face)
    inner = lambda x, y: face(x, y) and px[x, y] != INK
    rng = Random(31)
    # pebble grain: a dark dent with a lit edge, scattered
    for _ in range(W * H // 70):
        x, y = rng.randrange(20, W - 3), rng.randrange(3, H - 3)
        if inner(x, y) and inner(x - 1, y - 1):
            px[x, y] = LEA[1]
            if rng.random() < 0.5:
                px[x - 1, y - 1] = LEA[3]
    # worn rims, uneven
    rim = runs(32, W, 1, (4, 30))
    for x in range(3, W - 3):
        if rng.random() < 0.75 and inner(x, 1 + rim[x]):
            px[x, 1 + rim[x]] = LEA[3]
        if rng.random() < 0.4 and inner(x, 2 + rim[x]):
            px[x, 2 + rim[x]] = LEA[3] if x < W * 0.6 else LEA[2]
        if rng.random() < 0.7 and inner(x, H - 2):
            px[x, H - 2] = LEA[1]
    for y in range(3, H - 3):
        for x in range(W - 4, W - 1):
            if inner(x, y) and not inner(x + 1, y) and rng.random() < 0.5:
                px[x, y] = LEA[3] if y < H * 0.4 else LEA[1]
    # the spine: a rounded edge lit from the left, then a 3px hinge groove
    for y in range(1, H - 1):
        t = y / H
        for x, tone in ((1, 1.2), (2, 2.4), (3, 3.0), (4, 3.2), (5, 3.0), (6, 2.7), (7, 2.5), (8, 2.3),
                        (9, 2.2), (10, 2.1), (11, 2.0), (12, 1.8), (13, 1.5)):
            if not inner(x, y):
                continue
            v = tone - 0.9 * t * t
            i = int(v) + (1 if v - int(v) > dither(x, y) else 0)
            px[x, y] = LEA[max(1, min(4 if x in (3, 4) and t < 0.3 else 3, i))]
        px[14, y] = LEA[1]
        px[15, y] = LEA[0]
        px[16, y] = LEA[0]
        px[17, y] = LEA[1]
        px[18, y] = LEA[3] if t < 0.75 or dither(18, y) > 0.5 else LEA[2]
    hinge_cracks(px, 2, 13, H, 26, inner, seed=33)
    hinge_cracks(px, 18, 24, H, 9, inner, seed=34)
    # creases, crooked, more of them by the hinge and the bottom
    for y0 in (40, 71, 96, 118, 160, 182, 203, 236):
        x = 19
        pts = [(x, y0)]
        for _ in range(rng.randrange(2, 5)):
            x += rng.randrange(3, 8)
            pts.append((x, pts[-1][1] + rng.choice((-2, -1, 0, 1))))
        crease(px, pts, inner)
    for pts in ([(196, 254), (207, 250), (214, 251), (226, 247), (240, 246)], [(150, 256), (158, 253), (166, 254)],
                [(244, 228), (252, 222), (258, 223)], [(118, 9), (127, 8), (134, 10), (142, 9)],
                [(232, 30), (240, 38), (248, 41), (258, 41)], [(40, 248), (52, 244), (61, 246)]):
        crease(px, pts, inner)
    # stitching, 3 on 1 off, runs of it gone and an end hanging loose
    stitch_path(px, rect_path(24, 8, W - 9, H - 9), 3, 1, inner, seed=35, missing=5,
                loose=[(W - 9, 96), (W - 12, 99), (W - 11, 103), (W - 15, 105), (W - 16, 109), (W - 13, 112)])
    # double tooled frame with corner flowers, flaked in places
    gaps = runs(36, 2400, 1, (2, 14))
    path = rect_path(32, 16, W - 17, H - 17) + rect_path(36, 20, W - 21, H - 21)
    frame = {p for i, p in enumerate(path) if not (gaps[i] and i % 4)}
    for cx, cy in ((36, 20), (W - 21, 20), (W - 21, H - 21), (36, H - 21)):
        sx = 1 if cx < W // 2 else -1
        sy = 1 if cy < H // 2 else -1
        for dx, dy in ((5, 5), (6, 5), (5, 6), (8, 5), (5, 8), (8, 8), (9, 9), (10, 10), (11, 11), (7, 6), (6, 7)):
            frame.add((cx + dx * sx, cy + dy * sy))
        for k in range(4, 13, 2):
            frame.add((cx + k * sx, cy + 2 * sy))
            frame.add((cx + 2 * sx, cy + k * sy))
    tooled(px, frame, inner)
    # the emblem
    cx, cy = 142, 96
    loz = set()
    for y in range(cy - 52, cy + 53):
        for x in range(cx - 40, cx + 41):
            v = abs(x - cx) / 40 + abs(y - cy) / 52
            if 0.965 <= v <= 1.0 or 0.875 <= v <= 0.905:
                loz.add((x, y))
    for x, y in [(cx, cy - 57), (cx - 1, cy - 56), (cx + 1, cy - 56), (cx, cy - 55), (cx, cy + 55), (cx - 1, cy + 56), (cx + 1, cy + 56), (cx, cy + 57)]:
        loz.add((x, y))
    tooled(px, loz, inner)
    fw, fh = 46, 64
    masks = [flame_mask(fw, fh, k) for k in (1.0, 0.7, 0.42)]
    fx, fy = cx - fw // 2, cy - fh // 2 + 4
    cells = {(fx + x, fy + y) for y in range(fh) for x in range(fw) if masks[0][x, y] > 127}
    for x, y in cells:
        if (x + 1, y + 1) not in cells:
            px[x + 1, y + 1] = LEA[0]
        if (x + 2, y + 2) not in cells and inner(x + 2, y + 2):
            px[x + 2, y + 2] = LEA[1]
    for x, y in cells:
        mx, my = x - fx, y - fy
        edge = any((x + dx, y + dy) not in cells for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        if edge:
            c = GOLD[1] if (x + 1, y) not in cells or (x, y + 1) not in cells else GOLD[3]
        elif masks[2][mx, my] > 127:
            c = GOLD[4] if masks[2][mx, my - 2] > 127 or dither(x, y) < 0.5 else GOLD[3]
        elif masks[1][mx, my] > 127:
            c = GOLD[3]
        else:
            c = GOLD[2] if masks[1][mx - 1, my + 1] < 128 or dither(x, y) < 0.5 else GOLD[3]
        px[x, y] = c
    # the name in didone, then the line under it
    w = word_width("FLAMBEUR", "didone", 2)
    word(px, "FLAMBEUR", cx - w // 2, 166, "didone", (GOLD[3], GOLD[2]), shadow=LEA[0], spacing=2)
    w = word_width("CARNET DE JEU", "tiny")
    word(px, "CARNET DE JEU", cx - w // 2, 190, "tiny", (GOLD[3], GOLD[2]), shadow=LEA[0])
    rule = {(x, 202) for x in range(cx - 38, cx - 4)} | {(x, 202) for x in range(cx + 5, cx + 39)}
    for dy in range(-3, 4):
        for dx in range(-(3 - abs(dy)), 4 - abs(dy)):
            rule.add((cx + dx, 202 + dy))
    rule |= {(cx - 40, 201), (cx - 41, 200), (cx + 40, 201), (cx + 41, 200)}
    tooled(px, rule, inner)
    w = word_width("PARIS 1900", "tiny")
    word(px, "PARIS 1900", cx - w // 2, 210, "tiny", (GOLD[2], GOLD[1]), shadow=LEA[0])
    brass_corner(px, W - 1, 0, 30, -1, 1)
    tarnish(px, W - 1, 0, 30, -1, 1, seed=37)
    lost_corner(px, W - 1, H - 1, 30, -1, -1, [(5, 20), (12, 12), (20, 5)], inner)
    # handling, wear and accidents
    rub(px, 238, 128, 40, 58, 0.8, seed=38, mask=inner, polish=0.35)
    rub(px, 168, 172, 34, 14, 0.6, seed=39, mask=inner)
    rub(px, 144, 112, 12, 14, 0.5, seed=40, mask=inner)
    rub(px, 40, 30, 22, 18, 0.5, seed=41, mask=inner)
    scuff(px, 6, 10, 7, inner, seed=42)
    scuff(px, 120, 260, 13, inner, seed=43, squash=0.35)
    scuff(px, 8, 252, 9, inner, seed=44, deep=True)
    scuff(px, 262, 70, 6, inner, seed=45, squash=1.6)
    scuff(px, 60, 120, 5, inner, seed=46)
    scratches(px, 22, (26, 22, 250, 246), inner, seed=47, length=(8, 34))
    ring(px, 200, 58, 34, inner, seed=48, color=LEA[1], lit=LEA[3])
    ring(px, 204, 61, 33, inner, seed=49, color=LEA[1])
    burn(px, 66, 222, 10, inner, seed=50)
    # a splash of the red, years ago
    wine = Random(51)
    for _ in range(12):
        x, y = 92 + wine.randint(-14, 14), 238 + wine.randint(-6, 6)
        for (bx, by), d in blob(x, y, wine.choice((0.8, 1.2, 1.6, 2.4)), wine.randrange(99)).items():
            if inner(bx, by):
                px[bx, by] = WINE[1] if d < 0.6 else LEA[0]
    return px.im


# ---------- the open spread ----------

def leaf(W, H, side, seed):
    """one leaf of the open book: leather turn-in, page block on the outer edge, the page, gutter shade.
    side: 'right' (spine on the left), 'left' (mirrored), or 'flat' (no spine, for the dock).
    pages yellowed in blotches, foxed, a water stain in a corner, a dog-ear, pencil in the margins"""
    px = Px(W, H)
    shape = worn_box(W, H, (1, 4, 6, 1) if side != "flat" else 4, seed=seed, amp=(1, 1, 1, 0 if side != "flat" else 1))
    leather(px, shape, 0, 0, W, H, seed=seed, grain=0.05, lift=0.35, fall=0.6)
    outline(px, shape)
    inner = lambda x, y: shape(x, y) and px[x, y] != INK
    rng = Random(seed + 1)
    # blind-tooled dots in the turn-in, a lot of them rubbed out
    gaps = runs(seed + 2, 2 * (W + H), 1, (3, 20))
    for i, (x, y) in enumerate(rect_path(3, 3, W - 4, H - 4)):
        if i % 2 == 0 and inner(x, y) and (side == "flat" or x > 4) and not gaps[i]:
            px[x, y] = GOLD[1]
    b = 5
    edge = 3 if side != "flat" else 0
    x0 = 0 if side == "right" else b
    x1 = W - 1 - b - edge
    y0, y1 = b, H - 1 - b - (2 if side != "flat" else 0)
    # the paper's own edge wanders a pixel
    top = runs(seed + 3, W, 1, (8, 30))
    outer = runs(seed + 4, H, 1, (8, 30))
    paper = lambda x, y: x0 <= x <= x1 - outer[y] and y0 + top[x] <= y <= y1
    if side != "flat":
        # the page block: page edges stacked on the outer side and the bottom, not all flush
        for y in range(y0 + 1, H - b):
            for k in range(edge):
                c = (PAPER[3], PAPER[2], PAPER[1])[k] if y < H - b - 1 else PAPER[1]
                if k == 1 and rng.random() < 0.15:
                    c = PAPER[3]
                px[x1 + 1 + k, y] = c
        for x in range(x0 + 1, x1 + edge + 1):
            px[x, y1 + 1] = PAPER[2] if rng.random() < 0.9 else PAPER[3]
            px[x, y1 + 2] = PAPER[1]
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if not paper(x, y):
                if x > x1 - 2 and side != "flat":
                    px[x, y] = PAPER[2]  # the next page shows where this one falls short
                continue
            c = PAPER[3]
            d = min(x - x0, x1 - outer[y] - x, y - y0 - top[x], y1 - y)
            if d == 0:
                c = PAPER[2]
            elif d < 4 and dither(x, y) < 0.45 / d:
                c = PAPER[2]
            r = rng.random()
            if r < 0.007:
                c = PAPER[2]
            elif r < 0.014:
                c = PAPER[4]
            px[x, y] = c
    for x in range(x0 + 1, x1):
        if px[x, y0 + 1 + top[x]] == PAPER[3]:
            px[x, y0 + 1 + top[x]] = PAPER[4]
    box = (x0, y0, x1, y1)
    yellowing(px, box, seed + 5, paper, 0.12)
    foxing(px, 26 if side != "flat" else 14, (x0 + 4, y0 + 4, x1 - 4, y1 - 4), seed + 6, paper)
    if side != "flat":
        # a water stain creeping in from one outer corner: a tide line, darker paper inside it
        sx, sy = x1 - 2, y1 - 2 if side == "left" else y0 + 2
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                dd = hypot(x - sx, (y - sy) * 1.2) + 3 * sin(x * 0.21 + y * 0.13)
                if paper(x, y) and 50 < dd < 52:
                    px[x, y] = PAPER[2] if dither(x, y) < 0.8 else PAPER[1]
                elif paper(x, y) and dd <= 50 and px[x, y] == PAPER[3] and dither(x, y) < 0.18:
                    px[x, y] = PAPER[2]
        # gutter shade toward the spine
        for y in range(y0, y1 + 1):
            for k in range(10):
                x = x0 + k
                if k == 0:
                    px[x, y] = PAPER[0]
                elif k < 3:
                    px[x, y] = PAPER[1]
                elif dither(x, y) < (10 - k) / 9 and px[x, y] in (PAPER[3], PAPER[4]):
                    px[x, y] = PAPER[2]
        # the bottom outer corner of the page, dog-eared: the corner past the fold shows the page under it,
        # and the flap is that corner reflected across the fold
        n = 13
        for dy in range(n + 2):
            for dx in range(n + 2):
                x, y = x1 - outer[y1 - dy] - dx, y1 - dy
                if dx + dy < n:
                    px[x, y] = PAPER[2] if dx + dy < n - 1 else PAPER[1]
                elif dx <= n and dy <= n:
                    fold_line = dx + dy == n
                    rim = dx == n or dy == n
                    px[x, y] = PAPER[1] if fold_line else INK3 if rim else PAPER[3] if dither(x, y) < 0.55 else PAPER[2]
                elif dx + dy <= 2 * n + 1 and px[x, y] == PAPER[3]:
                    px[x, y] = PAPER[2]  # the flap's shadow
        # pencil in the margins: tally marks on the left page, a sum crossed out on the right
        pencil_grey = PAPER[2]
        if side == "right":
            word(px, "12", x1 - 40, y0 + 6, "tiny", (pencil_grey, pencil_grey))
            word(px, "-6", x1 - 40, y0 + 13, "tiny", (pencil_grey, pencil_grey))
            px.line([(x1 - 42, y0 + 20), (x1 - 31, y0 + 20)], pencil_grey)
            word(px, "6", x1 - 36, y0 + 22, "tiny", (pencil_grey, pencil_grey))
            px.line([(x1 - 41, y0 + 25), (x1 - 33, y0 + 21)], pencil_grey)  # struck
        # the turn-in: scuffed, and one brass cap gone (the front cover's, so the left leaf's bottom)
        scuff(px, W - 3, H // 2, 8, inner, seed + 7, squash=2.4)
        scuff(px, W // 2, H - 3, 9, inner, seed + 8, squash=0.3)
        brass_corner(px, W - 1, 0, 9, -1, 1)
        tarnish(px, W - 1, 0, 9, -1, 1, seed + 9, dent=False)
        if side == "left":
            lost_corner(px, W - 1, H - 1, 9, -1, -1, [(2, 6), (6, 2)], inner)
        else:
            brass_corner(px, W - 1, H - 1, 9, -1, -1, dark=True)
            tarnish(px, W - 1, H - 1, 9, -1, -1, seed + 10)
    else:
        scuff(px, W - 3, 40, 7, inner, seed + 7, squash=2.0)
        scuff(px, 3, H - 30, 6, inner, seed + 8, squash=2.0)
    im = px.im
    if side == "left":
        im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        # pencil reads the right way round, so the tally goes on after the flip: bottom of the outer margin
        tally(Px.of(im), b + edge + 12, y1 - 10, 8, PAPER[2], rng)
    return im


def parts():
    out = {
        "drawer/book/cover": booklet(),
        "drawer/book/band": band(),
        "drawer/book/receipt": receipt(),
        "drawer/book/card": card_corner(),
        "drawer/book/note": banknote(),
        "drawer/book/ribbon": ribbon(),
        "drawer/book/pencil": pencil(),
        "drawer/book/loop": loop(),
        "drawer/book/big": cover_big(),
        "drawer/leaf/left": leaf(268, 266, "left", 40),
        "drawer/leaf/right": leaf(268, 266, "right", 41),
        "drawer/dock": leaf(196, 296, "flat", 42),
    }
    for kind in ("etui", "classeur", "sleeve", "vitrine", "carnet"):
        out[f"drawer/book/slip/{kind}"] = slip(kind)
        out[f"drawer/book/tab/{kind}"] = tab(kind)
    return out


def review():
    """the booklet assembled at rest and the spread, at 4x and 2x, for eyeballing"""
    p = parts()
    small = Image.new("RGBA", (180, 130), "#1f5a46")

    def put(name, x, y):
        small.alpha_composite(p[name], (x, y))

    ox, oy = 30, 24
    put("drawer/book/receipt", ox + 16, oy - 10)
    put("drawer/book/note", ox + 30, oy - 5)
    put("drawer/book/card", ox + 50, oy - 8)
    for i, k in enumerate(("etui", "classeur", "sleeve", "vitrine", "carnet")):
        out = (27, 33, 26, 28, 29)[i]
        put(f"drawer/book/slip/{k}", ox + 84 + out - 48, oy + 6 + i * 14)
    put("drawer/book/ribbon", ox + 22, oy + 74)
    put("drawer/book/cover", ox, oy)
    put("drawer/book/pencil", ox - 4, oy - 6)
    put("drawer/book/loop", ox - 6, oy + 10)
    put("drawer/book/loop", ox - 6, oy + 40)
    put("drawer/book/band", ox + 64, oy - 1)
    small = small.resize((small.width * 4, small.height * 4), Image.Resampling.NEAREST)
    spread = Image.new("RGBA", (640, 300), "#1f5a46")
    for i, k in enumerate(("etui", "classeur", "sleeve", "vitrine", "carnet")):
        spread.alpha_composite(p[f"drawer/book/tab/{k}"], (580 - 12 + (6 if i == 0 else 0), 30 + 14 + i * 48))
    spread.alpha_composite(p["drawer/leaf/left"], (44, 30))
    spread.alpha_composite(p["drawer/leaf/right"], (312, 30))
    big = Image.new("RGBA", (300, 280), "#1f5a46")
    big.alpha_composite(p["drawer/book/big"], (16, 7))
    sheet = Image.new("RGBA", (max(small.width, 1280), small.height + 600 + 560), "#2e2320")
    sheet.alpha_composite(small, (0, 0))
    sheet.alpha_composite(spread.resize((1280, 600), Image.Resampling.NEAREST), (0, small.height))
    sheet.alpha_composite(big.resize((600, 560), Image.Resampling.NEAREST), (0, small.height + 600))
    sheet.save(ROOT / "booklet-review.png")


if __name__ == "__main__":
    review()
