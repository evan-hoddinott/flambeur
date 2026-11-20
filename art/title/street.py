"""the street at night, world y 0-348: sky, far roofs, the café block, the casino, the tabac and hotel block, the
pavement and cobbles, and everything left out on them. drawn as two layers: back (sky and far roofs, opaque)
and front (buildings and street, transparent where the sky shows). light is baked in with kit.light
"""
import numpy as np

from kit import BAYER, C, Cv, glow, noise

W = 640
H = 348
SIDEWALK = 314  # building feet
CURB = 328
ROAD = 331
LAMP = (140, 326)  # the lamp's foot
CAROTTE = (497, 224)  # top middle of the carotte
HOTEL = (622, 92)  # top left of the hotel's blade sign, 14 wide, 84 tall


# ---------- sky and far roofs ----------

def back():
    cv = Cv(W, H, "ink0", seed=11)
    a = cv.a
    # sky: deep blue at the top, a violet band, the city's warm haze near the roofs
    bands = [(0, "ink0"), (20, "bk0"), (46, "bl0"), (96, "vi0"), (150, "bu0"), (180, "bu1")]
    for i, (y0, col) in enumerate(bands):
        y1 = bands[i + 1][0] if i + 1 < len(bands) else H
        cv.rect(0, y0, W, y1, col)
        if i:  # dither the seam 8 px each way
            prev = bands[i - 1][1]
            for y in range(y0 - 8, y0 + 8):
                t = (y - (y0 - 8)) / 16
                for x in range(W):
                    a[y, x] = C[col] if t > BAYER[y % 4, x % 4] else C[prev]
    # stars, only in the dark top
    for _ in range(70):
        x, y = cv.r.randrange(W), cv.r.randrange(0, 70)
        cv.px(x, y, cv.r.choice(["bl2", "bl1", "bl1", "pa2"]))
    for x, y in ((40, 12), (210, 22), (590, 8), (452, 30)):
        cv.px(x, y, "pa3")
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            cv.px(x + dx, y + dy, "bl2")
    # clouds: two soft banks, lit from below by the city
    n = noise(W, H, 30, 5) * 0.7 + noise(W, H, 11, 6) * 0.3
    yy, xx = np.mgrid[0:H, 0:W]
    cloud = n * np.exp(-((yy - 96) / 30) ** 2)
    body = cloud > 0.40
    cv.fill(body, "vi0")
    cv.fill(body & (np.roll(cloud, 3, axis=0) < 0.40), "vi1")  # the top edge
    cv.fill(body & (np.roll(cloud, -2, axis=0) < 0.40), "bu1")  # the underside, warm
    cv.fill((cloud > 0.50) & (np.roll(cloud, 2, axis=0) < 0.50), "vi1")  # a second fold
    # the moon behind a thin cloud, top left
    mx, my, mr = 70, 30, 10
    halo = np.sqrt((xx + 0.5 - mx) ** 2 + (yy + 0.5 - my) ** 2)
    ring = (halo < mr + 9) & (halo >= mr) & (BAYER[yy % 4, xx % 4] < 0.5 - (halo - mr) / 20)
    cv.fill(ring & (a != C["vi1"]), "bl1")
    cv.fill((halo < mr + 3) & (halo >= mr), "bl2")
    disc = halo < mr
    cv.fill(disc, "pa3")
    cv.fill(disc & (xx - mx + (yy - my) * 0.6 > 3), "pa2")
    cv.fill(disc & (xx - mx + (yy - my) * 0.6 < -7), "pa4")
    for cx, cy, r in ((66, 27, 2), (73, 34, 3), (75, 25, 1.5), (64, 35, 1.2)):
        cv.fill(np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) < r, "pa2")
    for y, x0, x1 in ((35, 70, 96), (36, 64, 100), (37, 72, 92)):  # a wisp of cloud across its lower edge
        cv.hline(x0, x1, y, "vi0")
    cv.hline(74, 90, 35, "vi1")
    far_roofs(cv)
    return cv


def far_roofs(cv):
    """two rows of roofs: the far one a flat silhouette, the near one with chimney pots, dormers and a few lit windows"""
    r = cv.r
    # far: low and hazy
    x = 0
    while x < W:
        bw = r.randrange(18, 46)
        top = r.randrange(150, 172)
        cv.rect(x, top, x + bw, H, "bu0")
        if r.random() < 0.5:
            for i in range(5):
                cv.rect(x + i, top - 5 + i, x + bw - i, top - 4 + i, "bu0")
        if r.random() < 0.6:
            cx = x + r.randrange(2, max(3, bw - 4))
            cv.rect(cx, top - 7, cx + 2, top, "bu0")
        x += bw
    # a dome, far off
    yy, xx = np.mgrid[0:cv.h, 0:cv.w]
    cv.fill(((xx - 404) / 22) ** 2 + ((yy - 156) / 18) ** 2 <= 1, "bu0")
    cv.rect(402, 132, 406, 140, "bu0")
    cv.rect(392, 156, 416, 175, "bu0")
    # near: mansards, chimneys with pots, antennas, lit windows
    x = -6
    while x < W:
        bw = r.randrange(26, 54)
        top = r.randrange(168, 186)
        cv.rect(x, top, x + bw, H, "ink1")
        for i in range(6):  # the mansard's slope
            cv.rect(x + i, top - 6 + i, x + bw - i, top - 5 + i, "ink1")
        cv.hline(x + 6, x + bw - 6, top - 6, "bl0")  # moonlight on the ridge
        for _ in range(r.randrange(1, 3)):
            cx = x + r.randrange(4, max(5, bw - 8))
            ch = r.randrange(6, 12)
            cv.rect(cx, top - 6 - ch, cx + 5, top - 6, "ink1")
            for p in range(r.randrange(1, 4)):
                cv.rect(cx + p * 2, top - 8 - ch, cx + p * 2 + 1, top - 6 - ch, "ink1")
            if r.random() < 0.3:  # an antenna
                ax = cx + 2
                cv.vline(ax, top - 18 - ch, top - 6 - ch, "ink1")
                cv.hline(ax - 3, ax + 4, top - 16 - ch, "ink1")
                cv.hline(ax - 2, ax + 3, top - 13 - ch, "ink1")
        for dx in range(4, bw - 6, 9):  # dormers
            if r.random() < 0.6:
                cv.rect(x + dx, top - 4, x + dx + 4, top + 1, "ink0")
                if r.random() < 0.35:
                    cv.rect(x + dx + 1, top - 3, x + dx + 3, top, r.choice(["fl3", "fl4", "br3"]))
        for wy in range(top + 6, H, 9):
            for wx in range(x + 3, x + bw - 3, 7):
                if r.random() < 0.08:
                    cv.rect(wx, wy, wx + 2, wy + 3, r.choice(["fl3", "fl4", "br3", "br2"]))
        x += bw


# ---------- facade pieces ----------

def stone(cv, x0, y0, x1, y1, base="ink3", seed=1):
    """a stone face: soft dithered mottling and specks, no joints (joints() adds those)"""
    cv.rect(x0, y0, x1, y1, base)
    n = noise(x1 - x0, y1 - y0, 14, seed) * 0.6 + noise(x1 - x0, y1 - y0, 4, seed + 1) * 0.4
    f = np.zeros(cv.a.shape)
    f[y0:y1, x0:x1] = np.clip((n - 0.5) * 2.2, -0.7, 0.7)
    only = np.zeros(cv.a.shape, bool)
    only[y0:y1, x0:x1] = True
    cv.light(f, only)
    cv.specks(x0, y0, x1, y1, ["ink2", "pa0"], (x1 - x0) * (y1 - y0) // 90, on=[base])


def joints(cv, x0, y0, x1, y1, course=6, brick=18):
    """the mortar lines on a stone face, drawn as one shade down"""
    for y in range(y0 + course - 1, y1, course):
        for x in range(x0, x1):
            if cv.r.random() < 0.85:
                cv.shade_px(x, y, -1)
        off = ((y - y0) // course % 2) * (brick // 2)
        for x in range(x0 + off, x1, brick):
            for yy in range(y + 1, min(y1, y + course)):
                cv.shade_px(x, yy, -1)


def window(cv, x, y, w, h, kind, shutters=None, rail=False, sill=True):
    """a tall french window: molded surround, keystone, sill, two leaves of glass. kind says what's inside"""
    r = cv.r
    # surround and keystone
    cv.rect(x - 2, y - 2, x + w + 2, y + h, "pa0")
    cv.rect(x - 1, y - 1, x + w + 1, y + h, "ink2")
    cv.rect(x + w // 2 - 2, y - 5, x + w // 2 + 2, y - 1, "pa0")
    cv.hline(x + w // 2 - 2, x + w // 2 + 2, y - 5, "pa1")
    cv.hline(x - 2, x + w + 2, y - 2, "pa1")
    inner = (x, y, x + w, y + h)
    glass(cv, *inner, kind)
    if sill:
        cv.rect(x - 3, y + h, x + w + 3, y + h + 2, "pa0")
        cv.hline(x - 3, x + w + 3, y + h, "pa1")
        cv.hline(x - 2, x + w + 2, y + h + 2, "ink1")
    if shutters:
        shutter_pair(cv, x, y, w, h, shutters, closed=kind == "shut")
    if rail:  # a low guard rail across the window
        ry = y + h - 9
        cv.hline(x - 1, x + w + 1, ry, "ink0")
        cv.hline(x - 1, x + w + 1, y + h - 1, "ink0")
        for xx in range(x, x + w, 2):
            cv.vline(xx, ry, y + h, "ink0")
        for xx in range(x + 2, x + w - 1, 4):
            cv.px(xx + 1, ry + 3, "ink0")
            cv.px(xx - 1, ry + 3, "ink0")
    return r


def glass(cv, x0, y0, x1, y1, kind):
    w, h = x1 - x0, y1 - y0
    mid = x0 + w // 2
    if kind in ("warm", "figure", "curtain", "lamp", "plant", "cat"):
        cv.rect(x0, y0, x1, y1, "fl3")
        cv.rect(x0, y0 + h // 3, x1, y1, "fl4")
        cv.rect(x0 + 2, y0 + h // 2, x1 - 2, y1 - 3, "fl5") if kind == "lamp" else None
        if kind == "curtain":  # lace half drawn
            for xx in range(x0, x1):
                if xx < x0 + 4 or xx >= x1 - 3:
                    for yy in range(y0, y1):
                        cv.px(xx, yy, "pa3" if (xx + yy // 3) % 3 else "pa2")
            cv.rect(x0, y0, x1, y0 + 3, "pa2")
        if kind == "figure":  # someone at the window
            fx = x0 + w // 2 - 2 + cv.r.choice([-2, 0, 2])
            cv.rect(fx + 1, y0 + 8, fx + 5, y0 + 12, "ink1")
            cv.rect(fx, y0 + 12, fx + 6, y1, "ink1")
            cv.rect(fx - 1, y0 + 14, fx + 7, y1, "ink1")
        if kind == "plant":
            for i in range(9):
                cv.px(x0 + 2 + cv.r.randrange(w - 4), y1 - 3 - cv.r.randrange(10), "fg1")
            cv.rect(x0 + 3, y1 - 4, x1 - 3, y1, "br0")
        if kind == "lamp":
            cv.rect(x0 + 3, y0 + 9, x1 - 3, y0 + 13, "br4")
            cv.vline(mid, y0 + 13, y1, "br1")
    elif kind == "tv":
        cv.rect(x0, y0, x1, y1, "bl1")
        cv.rect(x0, y0 + h // 2, x1, y1, "bl2")
        cv.rect(x0 + 2, y1 - 8, x1 - 2, y1 - 3, "bl3")
    elif kind == "shut":
        cv.rect(x0, y0, x1, y1, "ink1")
    else:  # dark: the room is out, the sky catches the glass
        cv.rect(x0, y0, x1, y1, "ink1")
        cv.rect(x0, y0, x1, y0 + h // 3, "bl0")
        for i in range(0, w + h, 7):
            for t in range(3):
                xx, yy = x0 + i - t, y0 + t
                for s in range(h):
                    if x0 <= xx - s < x1 and y0 <= yy + s < y1 and s < h // 2:
                        cv.px(xx - s, yy + s, "bl0" if t else "bl1")
    # frame: the meeting rail and glazing bars
    cv.vline(mid, y0, y1, "pa1" if kind != "shut" else "ink2")
    for yy in range(y0 + h // 3, y1 - 2, h // 3):
        cv.hline(x0, x1, yy, "pa0" if kind not in ("dark", "shut") else "ink2")


def shutter_pair(cv, x, y, w, h, col, closed=False):
    """louvered shutters: folded back beside the window, or closed over it"""
    lo, hi = col
    leaves = [(x, x + w // 2), (x + w // 2, x + w)] if closed else [(x - 2 - w // 2, x - 2), (x + w + 2, x + w + 2 + w // 2)]
    for i, (a0, a1) in enumerate(leaves):
        cv.rect(a0, y, a1, y + h, lo)
        for yy in range(y + 1, y + h - 1, 2):
            cv.hline(a0 + 1, a1 - 1, yy, hi)
        cv.vline(a0, y, y + h, "ink1")
        cv.vline(a1 - 1, y, y + h, "ink1")
        cv.hline(a0, a1, y + h // 2, lo)


def rail(cv, x0, x1, y):
    """a continuous wrought-iron balcony: slab, consoles under it, rail with rings"""
    cv.rect(x0, y, x1, y + 3, "pa0")
    cv.hline(x0, x1, y, "pa1")
    cv.hline(x0, x1, y + 3, "ink1")
    for x in range(x0 + 6, x1 - 4, 22):
        cv.rect(x, y + 3, x + 3, y + 6, "pa0")
        cv.px(x + 2, y + 5, "ink2")
    top = y - 8
    cv.hline(x0, x1, top, "ink0")
    cv.hline(x0, x1, y - 1, "ink0")
    for x in range(x0, x1):
        k = (x - x0) % 6
        if k == 0:
            cv.vline(x, top, y, "ink0")
        elif k in (2, 4):
            cv.px(x, top + 2, "ink0")
            cv.px(x, top + 5, "ink0")
        elif k == 3:
            cv.px(x, top + 1, "ink0")
            cv.px(x, top + 3, "ink0")
            cv.px(x, top + 4, "ink0")
            cv.px(x, top + 6, "ink0")


def mansard(cv, x0, x1, top, bottom, dormers, seed):
    """the zinc roof: standing seams, moonlit ridge, dormers with little pediments"""
    r = cv.r
    cv.rect(x0, top, x1, bottom, "bl0")
    for x in range(x0, x1):
        if (x - x0) % 4 == 0:
            cv.vline(x, top, bottom, "ink1")
        elif (x - x0) % 4 == 1:
            cv.vline(x, top, bottom, "bl1")
    cv.hline(x0, x1, top, "bl2")
    cv.hline(x0, x1, top + 1, "bl1")
    n = noise(x1 - x0, bottom - top, 6, seed)
    m = np.zeros(cv.a.shape, bool)
    m[top + 2:bottom, x0:x1] = n[2:] > 0.74
    cv.shade(m, -1)
    for dx, kind in dormers:
        x = x0 + dx
        cv.rect(x - 2, top + 6, x + 14, bottom, "pa0")
        cv.hline(x - 2, x + 14, top + 6, "pa1")
        cv.poly([(x - 4, top + 7), (x + 6, top + 1), (x + 16, top + 7)], "pa0")
        cv.line(x - 4, top + 7, x + 6, top + 1, "pa1")
        cv.line(x + 6, top + 1, x + 16, top + 7, "ink2")
        cv.rect(x, top + 9, x + 12, bottom - 1, "ink2")
        glass(cv, x + 1, top + 10, x + 11, bottom - 1, kind)
    # gutter at the bottom
    cv.hline(x0, x1, bottom - 1, "ink1")


def chimney(cv, x, base, w, h, pots):
    """a brick stack with a cap and terracotta pots"""
    cv.rect(x, base - h, x + w, base, "br0")
    for y in range(base - h, base, 3):
        off = ((y - base) // 3 % 2) * 2
        for xx in range(x + off, x + w, 4):
            cv.px(xx, y, "bk1")
        cv.hline(x, x + w, y, "bk1") if (y - base) % 6 == 0 else None
    cv.vline(x, base - h, base, "br1")
    cv.vline(x + w - 1, base - h, base, "bk1")
    cv.rect(x - 1, base - h - 2, x + w + 1, base - h, "pa0")
    cv.hline(x - 1, x + w + 1, base - h - 2, "pa1")
    px = x + 1
    for p in range(pots):
        ph = cv.r.choice([4, 5, 6])
        cv.rect(px, base - h - 2 - ph, px + 3, base - h - 2, "fl0")
        cv.vline(px, base - h - 2 - ph, base - h - 2, "fl1")
        cv.hline(px - 1 if p == 0 else px, px + 3, base - h - 2 - ph, "fl1")
        px += 4


def drainpipe(cv, x, y0, y1):
    cv.vline(x, y0, y1, "bl1")
    cv.vline(x + 1, y0, y1, "bl0")
    for y in range(y0 + 10, y1, 30):
        cv.hline(x - 1, x + 3, y, "ink1")


# ---------- the café block, left ----------

def cafe_block(cv):
    x0, x1 = 0, 156
    stone(cv, x0, 92, x1, SIDEWALK, "ink3", seed=21)
    joints(cv, x0, 92, x1, 250, 6, 20)
    mansard(cv, x0, x1, 58, 92, [(14, "dark"), (58, "warm"), (102, "shut")], 3)
    chimney(cv, 28, 58, 14, 14, 3)
    chimney(cv, 118, 58, 10, 10, 2)
    # a tv antenna on the left stack
    cv.vline(33, 22, 32, "ink1")
    cv.hline(28, 40, 24, "ink1")
    cv.hline(30, 38, 27, "ink1")
    cv.line(33, 32, 24, 40, "ink1")
    # cornice
    cv.rect(x0, 92, x1, 97, "pa0")
    cv.hline(x0, x1, 92, "pa1")
    cv.hline(x0, x1, 97, "ink1")
    for x in range(x0, x1, 3):
        cv.px(x, 96, "ink2")
    bays = [6, 50, 94, 138]
    floors = [  # window top, height, guard rail, kinds per bay
        (104, 22, False, ["dark", "curtain", "dark", "warm"]),
        (142, 24, True, ["shut", "tv", "cat", "dark"]),
        (180, 24, True, ["warm", "dark", "shut", "lamp"]),
        (216, 28, False, ["dark", "figure", "plant", "dark"]),
    ]
    blue = ("bl1", "bl2")
    for fy, fh, rl, kinds in floors:
        for bx, kind in zip(bays, kinds):
            sh = None if bx == 138 else blue
            window(cv, bx, fy, 12, fh, kind, shutters=sh, rail=rl)
    rail(cv, x0, x1, 134)
    rail(cv, x0, x1, 252)
    # a cat on the second floor's lit sill, against the glass
    cat_sill(cv, 98, 204)
    # geraniums on the noble floor's balcony
    for bx in (50, 94):
        flowerbox(cv, bx - 2, 249)
    # laundry strung across the fifth floor balcony
    line_of_laundry(cv, 2, 120, 128)
    drainpipe(cv, 151, 97, SIDEWALK)
    cafe_front(cv)
    # soot and rain down the stone under each sill and the cornice
    for fy, fh, _, _ in floors:
        for bx in bays:
            cv.streaks(bx - 2, bx + 14, fy + fh + 3, 12, 6)
    cv.streaks(x0, x1, 98, 10, 30)


def cat_sill(cv, x, y):
    """a cat sitting on a sill, a silhouette against the lit glass. its tail is code (title.ts)"""
    pts = [(x, y), (x, y - 6), (x + 1, y - 8), (x + 2, y - 7), (x + 4, y - 7), (x + 5, y - 8), (x + 6, y - 6),
           (x + 6, y - 4), (x + 8, y - 2), (x + 8, y), ]
    cv.poly(pts, "ink0")
    cv.px(x + 2, y - 5, "ab2")
    cv.px(x + 4, y - 5, "ab2")


def flowerbox(cv, x, y):
    cv.rect(x, y - 3, x + 16, y, "fl0")
    cv.hline(x, x + 16, y - 3, "fl1")
    for i in range(14):
        cv.px(x + 1 + i, y - 4 - cv.r.randrange(3), "fg1")
        if cv.r.random() < 0.4:
            cv.px(x + 1 + i, y - 5 - cv.r.randrange(3), "bu3")
    for i in range(5):
        cv.px(x + 2 + cv.r.randrange(12), y - 6 - cv.r.randrange(2), "bu4")


def line_of_laundry(cv, x0, x1, y):
    for x in range(x0, x1):
        cv.px(x, y + (1 if 0.25 < (x - x0) / (x1 - x0) < 0.75 else 0), "pa1")
    items = [("pa3", 6, 9), ("bl2", 5, 7), ("bu2", 3, 4), ("pa2", 7, 6), ("vi2", 3, 4), ("pa3", 5, 10), ("ab1", 4, 5)]
    x = x0 + 3
    for col, w, h in items:
        if x + w > x1:
            break
        sag = 1 if 0.25 < (x - x0) / (x1 - x0) < 0.75 else 0
        cv.rect(x, y + sag + 1, x + w, y + sag + 1 + h, col)
        cv.shade_rect(x + w - 1, y + sag + 1, x + w, y + sag + 1 + h, -1)
        cv.px(x, y + sag, "ink0")
        cv.px(x + w - 1, y + sag, "ink0")
        x += w + cv.r.randrange(2, 5)


def cafe_front(cv):
    """the café on the ground floor: green fascia, a striped awning, the lit room, chairs stacked outside"""
    x0, x1 = 0, 150
    top = 258
    cv.rect(x0, top, x1, SIDEWALK, "fg0")
    cv.rect(x0, top, x1, top + 12, "fg1")  # fascia, CAFÉ is lettered in code
    cv.hline(x0, x1, top, "br3")
    cv.hline(x0, x1, top + 11, "br2")
    cv.hline(x0, x1, top + 12, "ink0")
    # the room: a zinc bar, bottles, globe lamps, two drinkers
    wx0, wx1, wy0, wy1 = 6, 112, top + 22, SIDEWALK - 8
    cv.rect(wx0 - 1, wy0 - 1, wx1 + 1, wy1 + 1, "ink0")
    cv.rect(wx0, wy0, wx1, wy1, "fl3")
    cv.rect(wx0, wy0 + 8, wx1, wy1, "fl4")
    for x in range(wx0 + 4, wx1 - 4, 3):  # bottles on a shelf
        h = cv.r.choice([4, 5, 6])
        cv.rect(x, wy0 + 9 - h + 4, x + 2, wy0 + 13, cv.r.choice(["fg1", "fl1", "br1", "ab1", "bu2"]))
        cv.px(x, wy0 + 9 - h + 4, "fl5")
    cv.hline(wx0, wx1, wy0 + 13, "br1")
    for gx in (24, 60, 96):  # globe lamps
        cv.vline(gx, wy0, wy0 + 3, "ink1")
        cv.rect(gx - 2, wy0 + 3, gx + 3, wy0 + 7, "fl6")
    cv.rect(wx0, wy1 - 9, wx1, wy1 - 7, "pa2")  # the zinc
    cv.rect(wx0, wy1 - 7, wx1, wy1, "br1")
    for fx in (38, 78):  # drinkers on stools
        cv.rect(fx, wy1 - 20, fx + 5, wy1 - 16, "ink1")
        cv.rect(fx - 1, wy1 - 16, fx + 7, wy1 - 6, "ink1")
        cv.rect(fx + 1, wy1 - 6, fx + 3, wy1, "ink1")
    for x in range(wx0 + 26, wx1, 27):  # window bars
        cv.vline(x, wy0, wy1, "fg0")
    cv.rect(wx0, wy1, wx1, SIDEWALK, "fg1")  # the riser under the glass
    cv.hline(wx0, wx1, wy1, "fg2")
    # door
    cv.rect(118, top + 18, 142, SIDEWALK, "fg1")
    cv.rect(121, top + 21, 139, SIDEWALK - 18, "fl4")
    cv.rect(121, top + 21, 139, top + 25, "fl3")
    cv.vline(130, top + 21, SIDEWALK - 18, "fg0")
    cv.rect(137, SIDEWALK - 26, 139, SIDEWALK - 24, "br3")
    # awning: red and cream stripes, darker toward the wall, a scalloped valance
    ay0, ay1 = top + 13, top + 21
    for x in range(x0, 114):
        col = ("bu2", "bu1") if (x // 5) % 2 == 0 else ("pa2", "pa1")
        for y in range(ay0, ay1):
            cv.px(x, y, col[1] if y < ay0 + 3 else col[0])
        drop = 2 if (x % 5) in (1, 2, 3) else 1
        for y in range(ay1, ay1 + drop):
            cv.px(x, y, col[1])
    cv.hline(x0, 114, ay0, "ink0")
    # shadow under the awning on the glass
    cv.shade_rect(wx0, ay1 + 2, 114, ay1 + 6, -1)


# ---------- the casino, middle ----------

def casino(cv):
    x0, x1 = 158, 482
    cx = (x0 + x1) // 2
    stone(cv, x0, 196, x1, SIDEWALK, "ink3", seed=31)
    # roof sign rig behind the logo: a few iron posts, x-braced, floodlights on the parapet
    posts = [184, 248, 320, 392, 456]
    for x in posts:
        cv.vline(x, 112, 192, "ink0")
        cv.vline(x + 1, 112, 192, "ink1")
    for a_, b_ in zip(posts, posts[1:]):
        cv.line(a_ + 1, 116, b_, 150, "ink0")
        cv.line(a_ + 1, 150, b_, 116, "ink0")
        cv.line(a_ + 1, 152, b_, 186, "ink0")
        cv.line(a_ + 1, 186, b_, 152, "ink0")
    for y in (116, 151, 186):
        cv.hline(posts[0], posts[-1] + 2, y, "ink0")
    for x in (196, 284, 356, 444):  # floodlights aimed up
        cv.rect(x - 3, 186, x + 4, 191, "ink1")
        cv.rect(x - 2, 185, x + 3, 187, "fl5")
    # balustrade
    cv.rect(x0, 192, x1, 196, "pa1")
    cv.hline(x0, x1, 192, "pa2")
    for x in range(x0 + 2, x1 - 2, 4):
        cv.rect(x, 196, x + 2, 204, "pa0")
        cv.px(x, 199, "pa1")
        cv.px(x + 1, 202, "ink2")
    cv.rect(x0, 204, x1, 207, "pa1")
    cv.hline(x0, x1, 204, "pa2")
    for px_, w in ((x0, 14), (x1 - 14, 14), (cx - 8, 16)):  # pedestals with urns
        cv.rect(px_, 186, px_ + w, 207, "pa1")
        cv.vline(px_ + w - 1, 186, 207, "pa0")
        cv.hline(px_, px_ + w, 186, "pa2")
        u = px_ + w // 2
        cv.rect(u - 3, 179, u + 3, 186, "pa1")
        cv.rect(u - 2, 176, u + 2, 179, "pa1")
        cv.rect(u - 4, 180, u + 4, 183, "pa2")
        cv.px(u, 175, "pa2")
    # cornice with dentils
    cv.rect(x0, 207, x1, 213, "pa1")
    for x in range(x0, x1, 3):
        cv.px(x, 211, "ink3")
        cv.px(x, 212, "ink3")
    cv.hline(x0, x1, 213, "ink2")
    # attic story: oculus windows in carved frames, garlands between
    for ox in range(x0 + 26, x1 - 10, 46):
        cv.ellipse(ox - 7, 216, ox + 8, 231, "pa1")
        cv.ellipse(ox - 5, 218, ox + 6, 229, "ink1")
        cv.ellipse(ox - 4, 219, ox + 5, 228, "fl4" if ox % 3 else "fl3")
        cv.vline(ox, 219, 228, "pa0")
        cv.hline(ox - 4, ox + 5, 223, "pa0")
        for t in range(16):  # a swag
            gx = ox + 10 + t
            gy = 218 + int(3 * np.sin(t / 15 * np.pi))
            if gx < x1 - 6:
                cv.px(gx, gy, "pa2")
                cv.px(gx, gy + 1, "pa0")
    # entablature
    cv.rect(x0, 234, x1, 242, "pa1")
    cv.hline(x0, x1, 234, "pa2")
    cv.hline(x0, x1, 241, "ink2")
    # ground floor: deep rustication
    for y in range(248, SIDEWALK - 6, 7):
        cv.hline(x0, x1, y, "ink2")
        cv.hline(x0, x1, y + 1, "ink3")
    # tall arched windows: a room of tables inside
    for wx in (180, 226, 392, 438):
        casino_window(cv, wx, 250, 22, 50, red=wx in (226,))
    # pilasters with gilt capitals
    for px_ in (x0 + 4, 210, 256, 376, 422, x1 - 12):
        cv.rect(px_, 242, px_ + 8, SIDEWALK - 6, "pa1")
        cv.vline(px_, 242, SIDEWALK - 6, "pa2")
        cv.vline(px_ + 7, 242, SIDEWALK - 6, "pa0")
        cv.rect(px_ - 1, 242, px_ + 9, 246, "br3")
        cv.hline(px_ - 1, px_ + 9, 242, "br4")
        cv.px(px_ + 2, 244, "br2")
        cv.px(px_ + 5, 244, "br2")
    # the plinth all along
    cv.rect(x0, SIDEWALK - 6, x1, SIDEWALK, "ink3")
    cv.hline(x0, x1, SIDEWALK - 6, "pa0")
    entrance(cv, cx)
    cv.rect(cx - 33, 228, cx + 33, 244, "ink0")  # the name plate, CASINO is lettered and lit in code
    cv.rect(cx - 32, 229, cx + 32, 243, "bk0")
    cv.hline(cx - 32, cx + 32, 229, "br3")
    cv.hline(cx - 32, cx + 32, 242, "br2")
    cv.vline(cx - 32, 229, 243, "br3")
    cv.vline(cx + 31, 229, 243, "br2")
    for px_ in (cx - 52, cx + 36):  # posters either side of the door
        poster_frame(cv, px_, 262)
    # soot under the cornice, rain stains under the oculi
    cv.streaks(x0, x1, 214, 8, 50)
    cv.streaks(x0, x1, 242, 6, 30)
    # pigeons on the balustrade
    for bx in (198, 206, 430):
        pigeon(cv, bx, 192)


def casino_window(cv, x, y, w, h, red=False):
    r = w // 2
    yy, xx = np.mgrid[0:cv.h, 0:cv.w]
    cxw, cyw = x + r, y + r
    arch = ((xx + 0.5 - cxw) ** 2 + (yy + 0.5 - cyw) ** 2 <= (r + 2) ** 2) & (yy < cyw)
    box = (xx >= x - 2) & (xx < x + w + 2) & (yy >= cyw) & (yy < y + h + 1)
    cv.fill(arch | box, "pa1")
    arch_i = ((xx + 0.5 - cxw) ** 2 + (yy + 0.5 - cyw) ** 2 <= r * r) & (yy < cyw)
    box_i = (xx >= x) & (xx < x + w) & (yy >= cyw) & (yy < y + h)
    inner = arch_i | box_i
    cv.fill(inner, "fl3")
    cv.fill(inner & (yy > y + 14), "fl4")
    # a chandelier up in the arch
    cv.rect(cxw - 4, y + 9, cxw + 5, y + 11, "br4")
    for dx in (-4, -2, 0, 2, 4):
        cv.px(cxw + dx, y + 11, "fl6")
    cv.vline(cxw, y + 2, y + 9, "br2")
    if red:  # drawn velvet curtains, a gap of light between
        for x_ in range(x, x + w):
            d = abs(x_ - cxw)
            if d > 2:
                for y_ in range(y, y + h):
                    if inner[y_, x_]:
                        cv.px(x_, y_, "bu2" if (x_ + (y_ > y + h - 12)) % 3 else "bu1")
        cv.rect(x, y + 24, x + 3, y + 30, "br3")
        cv.rect(x + w - 3, y + 24, x + w, y + 30, "br3")
    else:  # the green of a table, heads and shoulders around it
        cv.rect(x, y + h - 12, x + w, y + h - 9, "fg2")
        cv.hline(x, x + w, y + h - 12, "fg3")
        heads = [x + 3, x + w - 7] if w < 24 else [x + 3, x + 10, x + w - 7]
        for hx in heads:
            cv.rect(hx, y + h - 20, hx + 4, y + h - 16, "ink1")
            cv.rect(hx - 1, y + h - 16, hx + 6, y + h, "ink1")
        cv.rect(x, y + h - 6, x + w, y + h, "ink1")
    # glazing bars
    cv.vline(cxw, y + r, y + h, "br1")
    cv.hline(x, x + w, y + r, "br1")
    cv.hline(x, x + w, y + r + 16, "br1")
    # keystone
    cv.rect(cxw - 2, y - 3, cxw + 3, y + 2, "pa2")
    cv.hline(x - 3, x + w + 3, y + h + 1, "pa2")
    cv.hline(x - 3, x + w + 3, y + h + 2, "ink2")


def entrance(cv, cx):
    """the casino's door: a deep arch with a lit fanlight, brass doors, a glass marquise, steps and a red carpet"""
    yy, xx = np.mgrid[0:cv.h, 0:cv.w]
    r = 30
    top = 246
    cy = top + r
    outer = (((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 <= (r + 4) ** 2) & (yy < cy)) | (
        (abs(xx + 0.5 - cx) <= r + 4) & (yy >= cy) & (yy < SIDEWALK - 6))
    inner = (((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 <= r * r) & (yy < cy)) | (
        (abs(xx + 0.5 - cx) <= r) & (yy >= cy) & (yy < SIDEWALK - 6))
    # voussoirs: alternating blocks around the arch
    ang = np.degrees(np.arctan2(cy - yy, xx - cx))
    cv.fill(outer & ~inner, "pa1")
    cv.fill(outer & ~inner & ((ang // 12) % 2 == 0) & (yy < cy), "pa2")
    cv.fill(outer & ~inner & (yy >= cy), "pa2")
    cv.rect(cx - 3, top - 5, cx + 4, top + 3, "pa2")  # keystone
    cv.hline(cx - 3, cx + 4, top - 5, "pa3")
    cv.fill(inner, "fl4")
    # the fanlight: radial bars
    fan = inner & (yy < cy)
    cv.fill(fan & ((ang.astype(int) % 18) < 3), "br2")
    cv.fill(fan & ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 < 64), "br3")
    cv.fill(fan & ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 > (r - 2) ** 2), "br1")
    cv.hline(cx - r, cx + r + 1, cy, "br2")
    # doors: two brass-framed glass leaves standing open on a lit hall
    cv.rect(cx - r, cy + 1, cx + r + 1, SIDEWALK - 6, "fl5")
    cv.rect(cx - 8, cy + 6, cx + 9, SIDEWALK - 6, "bu2")  # the hall's carpet running in
    for yy_ in range(cy + 6, SIDEWALK - 6):
        t = (yy_ - cy - 6) / 30
        w = int(8 + t * 8)
        cv.hline(cx - w, cx + w + 1, yy_, "bu2")
    cv.rect(cx - 2, cy + 4, cx + 3, cy + 7, "br4")  # a far chandelier
    for side in (-1, 1):
        dx0 = cx + side * (r - 11)
        lo, hi = sorted((dx0, cx + side * r))
        cv.rect(lo, cy + 1, hi + 1, SIDEWALK - 6, "br3")
        cv.rect(lo + 2, cy + 3, hi - 1, SIDEWALK - 12, "fl4")
        cv.hline(lo + 2, hi - 1, cy + 14, "br2")
        cv.vline(lo, cy + 1, SIDEWALK - 6, "br2")
    # glass marquise over the door: iron ribs, pale panes, a fringe of bulbs (lit in code)
    my = 266
    cv.poly([(cx - 46, my + 6), (cx - 38, my), (cx + 38, my), (cx + 46, my + 6)], "ink0")
    cv.poly([(cx - 44, my + 5), (cx - 37, my + 1), (cx + 37, my + 1), (cx + 44, my + 5)], "bl2")
    for x in range(cx - 40, cx + 41, 6):
        cv.line(x, my + 1, x + (x - cx) // 8, my + 5, "ink0")
    cv.hline(cx - 46, cx + 47, my + 6, "br2")
    cv.hline(cx - 46, cx + 47, my + 7, "ink0")
    for x in range(cx - 44, cx + 45, 4):
        cv.px(x, my + 8, "ink0")
        cv.px(x + 1, my + 9, "ink0")
    for side in (-1, 1):  # brackets to the wall
        bx = cx + side * 40
        cv.line(bx, my + 7, bx + side * 4, my + 16, "ink0")
    # steps
    cv.rect(cx - r - 10, SIDEWALK - 6, cx + r + 11, SIDEWALK - 4, "pa2")
    cv.rect(cx - r - 14, SIDEWALK - 4, cx + r + 15, SIDEWALK - 2, "pa1")
    cv.rect(cx - r - 18, SIDEWALK - 2, cx + r + 19, SIDEWALK, "pa0")
    cv.hline(cx - r - 10, cx + r + 11, SIDEWALK - 6, "pa3")
    cv.hline(cx - r - 14, cx + r + 15, SIDEWALK - 4, "pa2")
    cv.hline(cx - r - 18, cx + r + 19, SIDEWALK - 2, "pa1")


def poster_frame(cv, x, y):
    """a brass frame with tonight's poster: a red ground, a queen's silhouette, two lines of type"""
    w, h = 16, 30
    cv.rect(x - 1, y - 1, x + w + 1, y + h + 1, "br1")
    cv.rect(x, y, x + w, y + h, "bu1")
    cv.rect(x, y, x + w, y + 9, "bu2")
    cv.rect(x + 2, y + 2, x + w - 2, y + 4, "pa3")
    cv.rect(x + 3, y + 5, x + w - 3, y + 6, "pa2")
    cv.ellipse(x + 5, y + 11, x + 11, y + 17, "pa3")
    cv.rect(x + 4, y + 16, x + 12, y + 24, "br3")
    cv.rect(x + 6, y + 9, x + 10, y + 11, "br4")
    cv.rect(x + 2, y + 26, x + w - 2, y + 27, "br4")
    cv.hline(x - 1, x + w + 1, y - 1, "br3")
    cv.vline(x - 1, y - 1, y + h + 1, "br3")


def pigeon(cv, x, y):
    cv.rect(x, y - 3, x + 5, y, "ink2")
    cv.rect(x + 4, y - 5, x + 6, y - 3, "ink2")
    cv.px(x + 6, y - 4, "pa1")
    cv.px(x - 1, y - 2, "ink2")
    cv.px(x + 1, y - 3, "bl1")


# ---------- the tabac and hotel block, right ----------

def tabac_block(cv):
    x0, x1 = 482, 640
    stone(cv, x0, 76, x1, SIDEWALK, "ink3", seed=41)
    cv.shade_rect(x0, 76, x1, 246, 1)  # a paler stone than the café block
    joints(cv, x0, 76, x1, 246, 7, 16)
    mansard(cv, x0, x1, 36, 76, [(20, "warm"), (64, "dark"), (108, "dark")], 9)
    chimney(cv, 566, 36, 16, 16, 4)
    chimney(cv, 494, 36, 8, 9, 1)
    # a satellite dish on the roof
    cv.ellipse(530, 26, 538, 34, "pa1")
    cv.ellipse(531, 27, 537, 33, "pa0")
    cv.line(534, 30, 539, 27, "ink1")
    cv.vline(534, 33, 36, "ink1")
    cv.rect(x0, 76, x1, 81, "pa1")
    cv.hline(x0, x1, 76, "pa2")
    cv.hline(x0, x1, 81, "ink1")
    bays = [508, 552, 596]
    floors = [
        (88, 22, False, ["warm", "dark", "figure"]),
        (124, 24, True, ["dark", "shut", "warm"]),
        (162, 24, True, ["lamp", "dark", "tv"]),
        (200, 30, False, ["dark", "curtain", "shut"]),
    ]
    green = ("fg1", "fg2")
    for i, (fy, fh, rl, kinds) in enumerate(floors):
        for bx, kind in zip(bays, kinds):
            window(cv, bx, fy, 12, fh, kind, shutters=green if not (i == 2 and bx == 552) else None, rail=rl)
    # a shutter hanging off one hinge
    cv.rect(566, 166, 573, 190, "fg1")
    for yy in range(167, 189, 2):
        cv.line(567, yy + 1, 572, yy, "fg2")
    rail(cv, x0, x1, 116)
    rail(cv, x0, x1, 238)
    flowerbox(cv, 506, 235)
    line_of_laundry(cv, 586, 632, 104)
    # a satellite dish bolted under a window
    cv.ellipse(536, 150, 544, 158, "pa1")
    cv.line(540, 154, 545, 152, "ink1")
    drainpipe(cv, x0 + 2, 81, SIDEWALK)
    for fy, fh, _, _ in floors:
        for bx in bays:
            cv.streaks(bx - 2, bx + 14, fy + fh + 3, 10, 5)
    cv.streaks(x0, x1, 82, 10, 26)
    hotel_sign(cv)
    tabac_front(cv)
    carotte(cv)


def hotel_sign(cv):
    """the hotel's blade sign: a dark box with a red edge, HÔTEL is lit in code. a bracket ties it to the wall"""
    x, y = HOTEL
    cv.rect(x - 1, y - 1, x + 15, y + 85, "ink0")
    cv.rect(x, y, x + 14, y + 84, "bu0")
    cv.vline(x, y, y + 84, "bu2")
    cv.vline(x + 13, y, y + 84, "bu1")
    cv.hline(x, x + 14, y, "bu3")
    for yy in range(y + 4, y + 82, 4):  # empty bulb sockets down both edges
        cv.px(x + 2, yy, "br1")
        cv.px(x + 11, yy, "br1")
    cv.rect(x + 4, y - 6, x + 6, y - 1, "ink1")
    cv.rect(x + 4, y + 85, x + 6, y + 90, "ink1")


def carotte(cv):
    """the tabac's red double cone on an iron bracket off the corner"""
    cx, y = CAROTTE
    cv.hline(484, cx + 2, y - 3, "ink0")
    cv.line(484, y + 6, cx - 4, y - 3, "ink0")
    cv.vline(cx, y - 3, y, "ink0")
    h = 34
    for yy in range(h):
        t = yy / (h - 1)
        half = 1 + 8 * (1 - abs(t - 0.5) * 2)
        for x in range(int(cx - half), int(cx + half) + 1):
            d = x + 0.5 - cx
            col = "bu3" if d < -half * 0.3 else "bu4" if d < 0.5 else "bu2" if d < half * 0.6 else "bu1"
            cv.px(x, y + yy, col)
    for x in range(cx - 9, cx + 10):  # the white band and the diamond's waist
        if cv.get(x, y + 16):
            cv.px(x, y + 16, "pa3")
            cv.px(x, y + 17, "pa2")
    cv.rect(cx - 1, y + 4, cx + 1, y + 13, "bu4")
    cv.rect(cx - 1, y + 20, cx + 1, y + 29, "bu4")


def tabac_front(cv):
    """the tabac: a burgundy painted front, TABAC on the fascia (code), a window full of magazines and lotto posters"""
    x0, x1 = 486, 640
    top = 248
    cv.rect(x0, top, x1, SIDEWALK, "bu1")
    cv.rect(x0, top, x1, top + 14, "bu2")
    cv.hline(x0, x1, top, "br3")
    cv.hline(x0, x1, top + 1, "br2")
    cv.hline(x0, x1, top + 13, "br2")
    cv.hline(x0, x1, top + 14, "ink0")
    cv.vline(x0, top, SIDEWALK, "ink0")
    # window
    wx0, wx1, wy0, wy1 = 492, 592, top + 20, SIDEWALK - 8
    cv.rect(wx0 - 2, wy0 - 2, wx1 + 2, wy1 + 2, "br2")
    cv.rect(wx0, wy0, wx1, wy1, "fl4")
    cv.rect(wx0, wy0, wx1, wy0 + 4, "fl3")
    for sy in (wy0 + 10, wy0 + 22, wy0 + 34):  # shelves of magazines and cartons
        if sy >= wy1:
            break
        cv.hline(wx0, wx1, sy, "br1")
        x = wx0 + 1
        while x < wx1 - 3:
            w = cv.r.choice([3, 4, 4, 5])
            col = cv.r.choice(["vi2", "ab2", "bl3", "bu3", "pa4", "fg3", "bl2", "fl2", "pa3"])
            cv.rect(x, sy - cv.r.choice([6, 7, 8]), x + w - 1, sy, col)
            cv.shade_rect(x + w - 2, sy - 8, x + w - 1, sy, -1)
            x += w
    # the buraliste behind his counter, a shape against the light
    cv.ellipse(566, wy1 - 23, 576, wy1 - 13, "ink1")
    cv.rect(562, wy1 - 14, 580, wy1, "ink1")
    cv.hline(567, 576, wy1 - 16, "ink2")  # the moustache catching a little light
    # posters taped inside the glass
    for px_, py_, col, w, h in ((498, wy0 + 14, "ab3", 14, 18), (514, wy0 + 20, "pa4", 12, 14), (546, wy0 + 6, "br4", 10, 12)):
        cv.rect(px_, py_, px_ + w, py_ + h, col)
        cv.rect(px_ + 2, py_ + 2, px_ + w - 2, py_ + 4, "bu2" if col != "ab3" else "fg1")
        for ly in range(py_ + 6, py_ + h - 2, 2):
            cv.hline(px_ + 2, px_ + 2 + cv.r.randrange(4, w - 3), ly, "ink2")
        cv.px(px_, py_, "pa3")
        cv.px(px_ + w - 1, py_, "pa3")
    cv.vline(542, wy0, wy1, "br2")  # mullion
    cv.rect(wx0 - 2, wy1 + 2, wx1 + 2, SIDEWALK, "bu1")  # the riser, a panel in it
    cv.rect(wx0 + 2, wy1 + 3, wx1 - 2, SIDEWALK - 1, "bu0")
    # the door, lit, with its bell
    cv.rect(598, top + 18, 626, SIDEWALK, "bu2")
    cv.rect(601, top + 21, 623, SIDEWALK - 14, "fl4")
    cv.rect(601, top + 21, 623, top + 25, "fl3")
    cv.rect(609, top + 30, 616, top + 34, "pa4")  # a little "open" card
    cv.hline(610, 615, top + 32, "bu2")
    cv.rect(620, SIDEWALK - 26, 622, SIDEWALK - 23, "br3")
    cv.rect(632, top + 18, x1, SIDEWALK, "bu1")


# ---------- the ground: pavement, curb, cobbles ----------

def ground(cv):
    # pavement: big worn slabs
    cv.rect(0, SIDEWALK, W, CURB, "ink2")
    cv.hline(0, W, SIDEWALK, "ink1")
    x = 0
    while x < W:
        w = cv.r.randrange(22, 40)
        cv.vline(x, SIDEWALK + 1, CURB, "ink1")
        x += w
    cv.hline(0, W, SIDEWALK + 7, "ink1")
    cv.specks(0, SIDEWALK + 1, W, CURB, ["ink3", "ink1"], 400, on=["ink2"])
    # curb: granite, its top catching light
    cv.rect(0, CURB, W, ROAD, "ink3")
    cv.hline(0, W, CURB, "pa0")
    for x in range(0, W, 26):
        cv.vline(x, CURB + 1, ROAD, "ink2")
    cv.hline(0, W, ROAD - 1, "ink1")
    # cobbles: rows that grow toward us, each stone with a wet top edge
    rows = [(ROAD, 2, 4), (ROAD + 3, 3, 5), (ROAD + 7, 3, 6), (ROAD + 11, 3, 6), (ROAD + 15, 2, 7)]
    cv.rect(0, ROAD, W, H, "ink0")
    for i, (y, h, w) in enumerate(rows):
        off = (i % 2) * (w // 2)
        for x in range(-w + off, W, w + 1):
            ww = w + cv.r.choice([-1, 0, 0, 0, 1])
            col = cv.r.choice(["ink2", "ink2", "ink2", "ink1", "ink3"])
            cv.rect(x + 1, y, x + ww, y + h, col)
            cv.hline(x + 1, x + ww, y, "ink3" if col != "ink3" else "pa0")
            if cv.r.random() < 0.25:
                cv.px(x + 2, y, "bl1")  # sky caught in the wet
    # puddles on the pavement and in the gutter, holding the sky
    for x, y, w in ((40, 322, 22), (238, 324, 16), (420, 321, 26), (600, 323, 14), (520, 340, 30), (110, 342, 24)):
        cv.ellipse(x, y, x + w, y + 3 + (w > 20), "bl0")
        cv.hline(x + 3, x + w - 4, y + 1, "bl1")
    # litter: cigarette ends, a scrap of newspaper, leaves
    for _ in range(30):
        cv.px(cv.r.randrange(W), cv.r.randrange(SIDEWALK + 2, CURB), cv.r.choice(["pa3", "pa2", "br1", "fl0"]))
    cv.rect(462, 324, 467, 326, "pa3")
    cv.px(465, 324, "ink2")


def manhole(cv, cx, y):
    """the sewer's cast-iron lid in the road, where the chalk says to go down"""
    cv.ellipse(cx - 15, y, cx + 15, y + 7, "ink0")
    cv.ellipse(cx - 13, y + 1, cx + 13, y + 6, "ink2")
    for dx in range(-11, 12, 3):
        cv.vline(cx + dx, y + 2, y + 5, "ink1")
    cv.hline(cx - 9, cx + 10, y + 1, "ink3")
    cv.hline(cx - 6, cx + 7, y + 1, "bl1")


# ---------- street furniture ----------

def lamp(cv, x, foot):
    """a paris candelabra lamp in bottle green: fluted foot, pole, a crossbar for ladders, a tapered lantern"""
    top = foot - 126
    # foot
    cv.rect(x - 5, foot - 4, x + 6, foot, "fg0")
    cv.rect(x - 4, foot - 14, x + 5, foot - 4, "fg0")
    cv.rect(x - 3, foot - 20, x + 4, foot - 14, "fg0")
    cv.vline(x - 4, foot - 14, foot - 4, "fg1")
    cv.vline(x - 5, foot - 4, foot, "fg1")
    for yy in (foot - 14, foot - 5):
        cv.hline(x - 5, x + 6, yy, "fg1")
    # pole
    cv.rect(x - 1, top + 18, x + 2, foot - 20, "fg0")
    cv.vline(x - 1, top + 18, foot - 20, "fg1")
    for yy in (foot - 60, top + 40):
        cv.rect(x - 2, yy, x + 3, yy + 3, "fg0")
        cv.hline(x - 2, x + 3, yy, "fg1")
    # crossbar the lamplighters leaned their ladders on
    cv.hline(x - 6, x + 7, top + 26, "fg0")
    cv.px(x - 6, top + 25, "fg0")
    cv.px(x + 6, top + 25, "fg0")
    # lantern: cap, flared glass, base
    cv.vline(x, top - 3, top, "fg0")
    cv.rect(x - 2, top, x + 3, top + 2, "fg0")
    cv.rect(x - 6, top + 2, x + 7, top + 4, "fg0")
    cv.hline(x - 6, x + 7, top + 2, "fg1")
    cv.poly([(x - 6, top + 4), (x + 6, top + 4), (x + 3, top + 16), (x - 3, top + 16)], "fl5")
    cv.poly([(x - 4, top + 5), (x + 4, top + 5), (x + 2, top + 14), (x - 2, top + 14)], "fl6")
    cv.line(x - 6, top + 4, x - 3, top + 16, "fg0")
    cv.line(x + 6, top + 4, x + 3, top + 16, "fg0")
    cv.vline(x, top + 4, top + 16, "fg0")
    cv.rect(x - 3, top + 16, x + 4, top + 18, "fg0")


def bicycle(cv, x, y):
    """a red city bike leaning on the lamp, y is where the wheels touch"""
    for wx in (x, x + 20):
        ring = cv.mask_ellipse(wx - 6, y - 12, wx + 7, y + 1) & ~cv.mask_ellipse(wx - 5, y - 11, wx + 6, y)
        cv.fill(ring, "ink0")
        cv.px(wx, y - 6, "pa1")
    cv.line(x, y - 6, x + 8, y - 6, "bu2")
    cv.line(x + 8, y - 6, x + 13, y - 13, "bu2")
    cv.line(x + 4, y - 13, x + 13, y - 13, "bu2")
    cv.line(x + 4, y - 13, x, y - 6, "bu2")
    cv.line(x + 4, y - 13, x + 8, y - 6, "bu2")
    cv.line(x + 13, y - 13, x + 20, y - 6, "bu2")
    cv.hline(x + 2, x + 7, y - 14, "ink0")  # saddle
    cv.line(x + 13, y - 13, x + 14, y - 16, "ink1")
    cv.hline(x + 12, x + 18, y - 16, "ink1")  # bars
    cv.rect(x + 16, y - 15, x + 21, y - 12, "br1")  # a basket
    cv.hline(x + 16, x + 21, y - 15, "br2")


def morris(cv, cx, foot):
    """a morris column: dark green, a little dome, wrapped in posters, the newest pasted over a torn one"""
    w = 22
    x0 = cx - w // 2
    top = foot - 74
    cv.rect(x0 - 2, foot - 4, x0 + w + 2, foot, "fg0")
    cv.hline(x0 - 2, x0 + w + 2, foot - 4, "fg1")
    cv.rect(x0, top + 14, x0 + w, foot - 4, "pa2")
    posters = [(top + 14, top + 34, "bu2"), (top + 34, top + 50, "pa3"), (top + 50, foot - 4, "br3")]
    for y0, y1, col in posters:
        cv.rect(x0, y0, x0 + w, y1, col)
    # the red one: a juggler's ball and a title
    cv.rect(x0 + 3, top + 17, x0 + w - 3, top + 20, "pa3")
    cv.ellipse(x0 + 7, top + 22, x0 + 15, top + 30, "br4")
    cv.rect(x0 + 4, top + 31, x0 + w - 4, top + 32, "pa2")
    # the cream one: lines of type
    for ly in range(top + 37, top + 48, 3):
        cv.hline(x0 + 3, x0 + w - 3 - (ly % 5), ly, "ink2")
    cv.rect(x0 + 3, top + 36, x0 + 12, top + 38, "bu2")
    # the yellow-green one, torn at a corner to the white underneath
    cv.rect(x0 + 4, top + 53, x0 + w - 4, top + 58, "bu2")
    cv.poly([(x0 + w - 7, foot - 4), (x0 + w, foot - 14), (x0 + w, foot - 4)], "pa3")
    cv.line(x0 + w - 7, foot - 4, x0 + w, foot - 14, "pa4")
    # round it off: dark at both edges, a highlight left of middle
    for y in range(top + 14, foot - 4):
        cv.shade_px(x0, y, -2)
        cv.shade_px(x0 + 1, y, -1)
        cv.shade_px(x0 + w - 1, y, -2)
        cv.shade_px(x0 + w - 2, y, -1)
        cv.shade_px(x0 + w - 3, y, -1)
    # cornice, frieze and dome
    cv.rect(x0 - 2, top + 10, x0 + w + 2, top + 14, "fg0")
    cv.hline(x0 - 2, x0 + w + 2, top + 10, "fg1")
    cv.rect(x0, top + 6, x0 + w, top + 10, "fg1")
    cv.ellipse(x0 + 1, top - 2, x0 + w - 1, top + 14, "fg1")
    cv.ellipse(x0 + 3, top, x0 + 10, top + 6, "fg2")
    cv.rect(x0 - 2, top + 9, x0 + w + 2, top + 11, "fg0")
    cv.rect(cx - 1, top - 6, cx + 1, top - 1, "fg0")
    cv.px(cx - 1, top - 7, "fg2")


def bin_(cv, cx, foot):
    """a paris street bin: a green hoop on a post holding a clear bag of rubbish"""
    cv.vline(cx - 1, foot - 26, foot, "fg0")
    cv.vline(cx, foot - 26, foot, "fg1")
    cv.ellipse(cx - 7, foot - 26, cx + 8, foot - 22, "fg1")
    cv.ellipse(cx - 6, foot - 25, cx + 7, foot - 23, "ink0")
    cv.poly([(cx - 7, foot - 23), (cx + 7, foot - 23), (cx + 6, foot - 8), (cx + 2, foot - 5), (cx - 3, foot - 5), (cx - 6, foot - 9)], "bl1")
    for _ in range(14):  # what's in the bag
        cv.px(cx - 4 + cv.r.randrange(9), foot - 20 + cv.r.randrange(13), cv.r.choice(["pa2", "ink2", "bu2", "ab1", "pa3"]))
    cv.vline(cx - 5, foot - 22, foot - 10, "bl2")


def scooter(cv, x, y):
    """a beaten-up scooter on its stand, y is the ground"""
    cv.ellipse(x, y - 7, x + 8, y + 1, "ink0")
    cv.ellipse(x + 22, y - 7, x + 30, y + 1, "ink0")
    cv.px(x + 4, y - 3, "pa0")
    cv.px(x + 26, y - 3, "pa0")
    cv.poly([(x + 3, y - 7), (x + 7, y - 15), (x + 9, y - 15), (x + 9, y - 6), (x + 20, y - 6), (x + 21, y - 12), (x + 29, y - 12), (x + 31, y - 6), (x + 28, y - 4), (x + 2, y - 4)], "fg2")
    cv.hline(x + 21, x + 29, y - 12, "fg3")
    cv.line(x + 7, y - 15, x + 9, y - 15, "fg3")
    cv.rect(x + 19, y - 15, x + 29, y - 12, "ink1")  # seat
    cv.hline(x + 19, x + 29, y - 15, "ink2")
    cv.line(x + 8, y - 15, x + 6, y - 20, "ink1")  # steering column
    cv.hline(x + 3, x + 10, y - 20, "ink1")
    cv.px(x + 4, y - 18, "fl5")  # headlamp
    cv.line(x + 14, y - 4, x + 12, y, "ink1")  # stand
    cv.rect(x + 26, y - 9, x + 29, y - 7, "bu3")  # tail light
    cv.rect(x + 12, y - 9, x + 17, y - 7, "pa3")  # a sticker on the side
    cv.px(x + 16, y - 10, "ink2")  # a scuff


def chairs(cv, x, foot):
    """bistro chairs stacked for the night and a round table, chained together"""
    for i in range(4):
        cy = foot - 2 - i * 3
        cv.hline(x + i, x + 12 + i, cy - 8, "br1")
        cv.hline(x + i, x + 12 + i, cy - 7, "br2")
        cv.vline(x + 1 + i, cy - 7, foot, "ink1") if i == 0 else None
        cv.vline(x + 11 + i, cy - 7, foot, "ink1") if i == 0 else None
        for yy in range(cy - 18, cy - 8, 2):  # woven back
            cv.hline(x + 1 + i, x + 10 + i, yy, "br1" if (yy // 2) % 2 else "br2")
        cv.vline(x + i, cy - 19, cy - 7, "ink1")
        cv.vline(x + 11 + i, cy - 19, cy - 7, "ink1")
        cv.hline(x + i, x + 12 + i, cy - 19, "ink1")
    # table
    tx = x + 22
    cv.rect(tx, foot - 16, tx + 14, foot - 14, "pa2")
    cv.hline(tx, tx + 14, foot - 16, "pa3")
    cv.vline(tx + 7, foot - 14, foot - 1, "ink1")
    cv.hline(tx + 3, tx + 12, foot - 1, "ink1")
    # the chain
    for xx in range(x + 2, tx + 8, 2):
        cv.px(xx, foot - 4 + (xx % 4 == 0), "pa0")


def aboard(cv, x, foot):
    """the café's chalkboard on the pavement: today's dish in scrawl"""
    cv.poly([(x, foot), (x + 4, foot - 22), (x + 12, foot - 22), (x + 16, foot)], "br1")
    cv.poly([(x + 3, foot - 3), (x + 6, foot - 19), (x + 10, foot - 19), (x + 13, foot - 3)], "fg0")
    for ly, w in ((foot - 16, 4), (foot - 12, 3), (foot - 9, 4), (foot - 6, 2)):
        cv.hline(x + 7 - w // 2, x + 7 + w - w // 2, ly, "pa3")
    cv.px(x + 8, foot - 14, "pa2")


def news_rack(cv, x, foot):
    """a wire rack of tonight's papers by the door"""
    cv.rect(x, foot - 22, x + 18, foot, None)
    for i, col in enumerate(["pa3", "pa4", "pa3"]):
        y0 = foot - 22 + i * 7
        cv.rect(x + 1, y0, x + 17, y0 + 6, col)
        cv.hline(x + 2, x + 16, y0 + 1, "ink1")  # the headline
        cv.hline(x + 2, x + 9, y0 + 3, "ink3")
        if i == 1:
            cv.rect(x + 11, y0 + 2, x + 16, y0 + 5, "bl2")  # a photo
    cv.vline(x, foot - 23, foot, "ink0")
    cv.vline(x + 17, foot - 23, foot, "ink0")
    for i in range(4):
        cv.hline(x, x + 18, foot - 23 + i * 7, "ink0")


def crates(cv, x, foot):
    """the tabac's delivery left by the door: a carton and a crate of empties"""
    cv.rect(x, foot - 12, x + 14, foot, "br1")
    cv.hline(x, x + 14, foot - 12, "br2")
    cv.vline(x + 7, foot - 12, foot - 6, "pa1")
    cv.rect(x + 2, foot - 8, x + 7, foot - 6, "pa2")
    cv.rect(x + 3, foot - 22, x + 14, foot - 12, "br0")
    cv.hline(x + 3, x + 14, foot - 22, "br1")
    for bx in range(x + 4, x + 13, 3):
        cv.rect(bx, foot - 26, bx + 2, foot - 21, "fg1")
        cv.px(bx, foot - 26, "fg3")


# ---------- light ----------

def street_light(cv):
    """the lamp, the café, the casino's door and windows and the tabac light what's near them"""
    f = np.zeros((cv.h, cv.w))
    lx, lf = LAMP
    f += glow(W, H, lx, lf - 118, 80, 3.2)
    f += glow(W, H, lx, lf - 10, 50, 1.6, sx=1.6, sy=0.5)  # its pool on the pavement
    f += glow(W, H, 320, 292, 100, 2.6, sx=1.4)  # the casino's door
    f += glow(W, H, 320, 250, 160, 1.2, sx=1.6)
    for wx in (191, 237, 403, 449):
        f += glow(W, H, wx, 300, 40, 1.0)
    f += glow(W, H, 60, 300, 90, 2.0, sx=1.3, sy=0.7)  # the café
    f += glow(W, H, 556, 300, 90, 2.2, sx=1.3, sy=0.7)  # the tabac
    f += glow(W, H, CAROTTE[0], CAROTTE[1] + 18, 36, 1.4)
    f += glow(W, H, HOTEL[0] + 7, HOTEL[1] + 42, 50, 1.2, sy=1.6)
    f += glow(W, H, 320, 200, 190, 1.5, sx=1.1, sy=0.4)  # the logo's fire on the casino's roof
    return f


def front():
    cv = Cv(W, H, seed=3)
    cafe_block(cv)
    tabac_block(cv)
    casino(cv)
    ground(cv)
    manhole(cv, 320, 339)
    chairs(cv, 4, 320)
    aboard(cv, 66, 322)
    bin_(cv, 102, 322)
    morris(cv, 178, 323)
    lamp(cv, *LAMP)
    bicycle(cv, LAMP[0] - 20, 325)
    scooter(cv, 446, 325)
    news_rack(cv, 574, 322)
    crates(cv, 626, 322)
    for x in (cv.w // 2 - 50, cv.w // 2 + 50):  # brass stanchions and a velvet rope either side of the carpet
        cv.rect(x - 1, 312, x + 2, 324, "br3")
        cv.rect(x - 2, 324, x + 3, 326, "br2")
        cv.rect(x - 1, 310, x + 2, 312, "br4")
    for i, (a, b) in enumerate(((cv.w // 2 - 50, cv.w // 2 - 34), (cv.w // 2 + 34, cv.w // 2 + 50))):
        for x in range(a, b + 1):
            t = (x - a) / (b - a)
            cv.px(x, 313 + int(4 * np.sin(t * np.pi)), "bu3")
    cv.rect(cv.w // 2 - 14, SIDEWALK, cv.w // 2 + 15, CURB, "bu2")  # the carpet out to the curb
    cv.hline(cv.w // 2 - 14, cv.w // 2 + 15, SIDEWALK, "bu3")
    cv.vline(cv.w // 2 - 14, SIDEWALK, CURB, "br2")
    cv.vline(cv.w // 2 + 14, SIDEWALK, CURB, "br2")
    cv.light(street_light(cv))
    # the ground darkens toward the cut and the pavement sits in the buildings' shadow
    f = np.zeros((cv.h, cv.w))
    yy = np.mgrid[0:cv.h, 0:cv.w][0]
    f -= np.clip((yy - 336) / 12, 0, 1) * 1.2
    xx = np.mgrid[0:cv.h, 0:cv.w][1]
    sides = (xx < 158) | (xx >= 482)
    f -= np.where(sides, np.clip((150 - yy) / 110, 0, 1) * 1.1, 0)  # the upper floors fall off into the night
    cv.light(f)
    return cv


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "street.png"
    b = back()
    fr = front()
    b.paste(fr, 0, 0)
    b.save(out, 2)
