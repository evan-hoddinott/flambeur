"""under the street, world y 348-1180: the cut through the road, the cellar (a back-room tripot under a stone
vault), the limestone with an old ossuary niche, and the sewer (an egg-shaped gallery over the channel).
drawn on one canvas in world coordinates and cropped at the end. light is baked in with kit.light
"""
import numpy as np

from kit import BAYER, C, Cv, glow, noise

W = 640
TOP = 348  # the street's cut
CELLAR = 410
VAULT_SPRING = 520  # where the cellar's vault starts curving
VAULT_APEX = 414
CELLAR_FLOOR = 736
STONE = 748
SEWER = 812
SEWER_SPRING = 930
WALK = 1118
WATER = 1128
H = 1180
BULBS = [200, 440]
HATCH_X = 566
LADDER_X = 600
OUTLET = (36, 1050)
LANTERN = (560, 900)


def vault_mask(cv, x0, x1, spring, apex, floor):
    """a room with straight walls and an elliptical vault"""
    yy, xx = np.mgrid[0:cv.h, 0:cv.w]
    cx, rx, ry = (x0 + x1) / 2, (x1 - x0) / 2, spring - apex
    walls = (xx >= x0) & (xx < x1) & (yy >= spring) & (yy < floor)
    arch = (((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - spring) / ry) ** 2 <= 1) & (yy < spring) & (yy >= apex)
    return walls | arch


def ring(cv, inner, width):
    """the band just outside a mask, width px thick"""
    out = inner.copy()
    for _ in range(width):
        n = out.copy()
        n[1:, :] |= out[:-1, :]
        n[:-1, :] |= out[1:, :]
        n[:, 1:] |= out[:, :-1]
        n[:, :-1] |= out[:, 1:]
        out = n
    return out & ~inner


# ---------- earth and rock ----------

def earth(cv):
    """the ground between the rooms: sand bed under the cobbles, dark backfill, pebbles, then the limestone"""
    r = cv.r
    cv.rect(0, TOP, W, H, "ink2")
    # the cobbles cut in section, on their sand bed
    for x in range(0, W, 7):
        w = 6 + r.choice([-1, 0, 0])
        cv.rect(x, TOP, x + w, TOP + 6, r.choice(["ink2", "ink3", "ink2"]))
        cv.hline(x, x + w, TOP, "pa0")
        cv.vline(x + w, TOP, TOP + 6, "ink0")
    cv.hline(0, W, TOP + 6, "ink0")
    cv.rect(0, TOP + 7, W, TOP + 14, "pa0")
    for y in range(TOP + 7, TOP + 14):
        for x in range(W):
            if BAYER[y % 4, x % 4] < (y - TOP - 7) / 9:
                cv.px(x, y, "ink3")
    # backfill: mottled dark earth with stones
    n = noise(W, H, 10, 77)
    yy, xx = np.mgrid[0:H, 0:W]
    fill = yy >= TOP + 14
    f = np.where(fill, np.clip((n - 0.5) * 2, -0.8, 0.8), 0)
    cv.light(f)
    cv.specks(0, TOP + 14, W, H, ["ink1", "ink3", "pa0", "br0"], 9000, on=["ink2", "ink3", "ink1"])
    for _ in range(140):
        pebble(cv, r.randrange(W), r.randrange(TOP + 16, H), r.choice([2, 3, 3, 4, 5, 7]))
    # limestone strata from the cellar floor down: light bands with shells
    for y0, y1, col in ((STONE - 40, STONE + 6, "ink3"), (STONE + 6, STONE + 24, "pa0"), (STONE + 24, STONE + 30, "ink3"),
                        (STONE + 30, STONE + 52, "pa0"), (STONE + 52, STONE + 58, "ink2"), (STONE + 58, SEWER + 140, "ink3")):
        wob = noise(W, 1, 30, y0)[0]
        for x in range(W):
            a, b = y0 + int(wob[x] * 4), y1 + int(wob[x] * 4)
            cv.rect(x, a, x + 1, b, col)
    cv.specks(0, STONE - 40, W, SEWER + 140, ["ink2", "pa1", "ink3", "pa0"], 5000)
    for _ in range(26):  # fossil shells in the lutetian limestone
        shell(cv, r.randrange(10, W - 10), r.randrange(STONE + 6, STONE + 52))
    # cracks
    for _ in range(14):
        x, y = r.randrange(W), r.randrange(STONE - 30, SEWER + 100)
        for i in range(r.randrange(6, 18)):
            cv.px(x, y, "ink1")
            x += r.choice([-1, 0, 1])
            y += 1


def pebble(cv, x, y, s):
    cv.ellipse(x, y, x + s + 1, y + max(2, s * 2 // 3), "ink3")
    cv.hline(x + 1, x + s, y, "pa0")
    cv.hline(x + 1, x + s, y + max(2, s * 2 // 3) - 1, "ink1")


def shell(cv, x, y):
    for dx, dy in ((0, 0), (1, 0), (2, 1), (2, 2), (1, 3), (0, 3), (-1, 2), (-1, 1), (0, 1), (1, 2)):
        cv.px(x + dx, y + dy, "pa2" if dy < 2 else "pa1")
    cv.px(x + 1, y + 1, "ink3")


def pipes_in_earth(cv):
    """the city's pipes under the road: a water main, a gas line with a valve, a bundle of cables, an old bottle"""
    y = 372
    cv.rect(0, y, W, y + 9, "bl0")
    cv.rect(0, y + 1, W, y + 4, "bl1")
    cv.hline(0, W, y + 2, "bl2")
    cv.hline(0, W, y, "ink0")
    cv.hline(0, W, y + 8, "ink0")
    for x in range(30, W, 120):
        cv.rect(x, y - 1, x + 5, y + 10, "bl0")
        cv.vline(x, y - 1, y + 10, "bl1")
        cv.vline(x + 4, y - 1, y + 10, "ink0")
    cv.specks(0, y, W, y + 9, ["fl0", "br0", "ink1"], 220, on=["bl0", "bl1"])  # rust
    gy = 392
    cv.rect(0, gy, 420, gy + 5, "br1")
    cv.hline(0, 420, gy + 1, "br2")
    cv.hline(0, 420, gy, "ink1")
    cv.hline(0, 420, gy + 4, "br0")
    cv.specks(0, gy, 420, gy + 5, ["br0", "fl0"], 120, on=["br1", "br2"])
    cv.rect(418, gy - 2, 426, gy + 7, "br1")
    cv.rect(420, gy - 7, 424, gy - 2, "ink1")
    cv.ellipse(415, gy - 11, 430, gy - 6, "bu2")  # the valve's red wheel
    cv.ellipse(418, gy - 10, 427, gy - 7, "ink2")
    cv.line(426, gy + 2, 450, gy + 14, "br2")
    cv.line(426, gy + 3, 450, gy + 15, "br1")
    for i, col in enumerate(["ink0", "ink1", "bl0", "ink0"]):  # cables drooping between clips
        for x in range(0, W):
            sag = int(3 * abs(np.sin(x / 80 * np.pi)))
            cv.px(x, 360 + i + sag, col)
    for x in range(0, W, 80):
        cv.rect(x - 1, 359, x + 2, 365, "ink3")
    # a bottle someone threw in when they laid the road
    cv.poly([(250, 400), (262, 397), (263, 400), (251, 403)], "fg1")
    cv.line(262, 398, 267, 397, "fg1")
    cv.px(253, 400, "fg3")


# ---------- the cellar ----------

def cellar(cv):
    r = cv.r
    room = vault_mask(cv, 14, 626, VAULT_SPRING, VAULT_APEX, CELLAR_FLOOR)
    # the back wall: rough limestone blocks of mixed sizes, mortar between
    wall = Cv(W, H, "ink1", seed=5)
    y = VAULT_APEX
    while y < CELLAR_FLOOR:
        h = r.choice([9, 10, 11, 12])
        x = -r.randrange(0, 20)
        while x < W:
            w = r.choice([16, 20, 24, 28, 30, 34])
            col = r.choice(["ink3", "ink2", "ink3", "ink2", "ink3", "pa0"])
            wall.rect(x + 1, y + 1, x + w - 1, y + h - 1, col)
            wall.hline(x + 1, x + w - 1, y + 1, "ink3" if col == "ink2" else "pa0" if col == "ink3" else "pa1")  # a lit top edge
            wall.vline(x + w - 2, y + 1, y + h - 1, "ink2")
            wall.specks(x + 1, y + 2, x + w - 1, y + h - 1, ["ink2", "pa0", "ink3"], w * h // 14)
            if r.random() < 0.15:  # a chip out of a corner
                wall.px(x + 1, y + 1, "ink1")
                wall.px(x + 2, y + 1, "ink1")
                wall.px(x + 1, y + 2, "ink1")
            x += w
        y += h
    # old whitewash, flaking off in patches
    n = noise(W, H, 16, 9) * 0.7 + noise(W, H, 5, 10) * 0.3
    yy, xx = np.mgrid[0:H, 0:W]
    wash = (n > 0.6) & (yy > 450) & (yy < 690) & ((xx < 230) | (xx > 410))
    wall.shade(wash, 1)
    edge = wash & ~np.roll(wash, 1, axis=0)
    wall.fill(edge & room, "pa1")
    # damp creeping up from the floor, a stain under the street's drain
    damp = (yy > CELLAR_FLOOR - 40 + (noise(W, H, 6, 12) * 26).astype(int)) & (yy < CELLAR_FLOOR)
    wall.shade(damp, -1)
    stain = (np.abs(xx - 320 + noise(W, H, 4, 14) * 10) < 6) & (yy > VAULT_APEX) & (yy < 470)
    wall.shade(stain, -1)
    cv.a[room] = wall.a[room]
    # the vault's ring of dressed stones
    band = ring(cv, room, 6)
    cv.fill(band & (yy < CELLAR_FLOOR), "pa0")
    ang = np.degrees(np.arctan2(VAULT_SPRING - yy, xx - 320))
    cv.fill(band & ((ang * 1.5).astype(int) % 9 == 0) & (yy < VAULT_SPRING), "ink1")
    cv.fill(band & ((yy - VAULT_SPRING) % 12 == 0) & (yy >= VAULT_SPRING) & (yy < CELLAR_FLOOR), "ink1")
    cv.fill(ring(cv, room, 1) & (yy < CELLAR_FLOOR), "pa1")
    cv.fill(ring(cv, room | ring(cv, room, 6), 1) & (yy < CELLAR_FLOOR), "ink0")
    # floor: worn flagstones
    cv.rect(14, CELLAR_FLOOR, 626, STONE, "ink3")
    cv.hline(14, 626, CELLAR_FLOOR, "pa1")
    x = 14
    while x < 626:
        w = r.choice([26, 30, 34, 40])
        cv.vline(x, CELLAR_FLOOR + 1, STONE, "ink1")
        x += w
    cv.hline(14, 626, CELLAR_FLOOR + 5, "ink2")
    cv.specks(14, CELLAR_FLOOR + 1, 626, STONE, ["ink2", "pa0"], 300)
    cv.hline(14, 626, STONE - 1, "ink1")
    # cobwebs in the vault's corners
    cobweb(cv, 20, 470, 1)
    cobweb(cv, 619, 470, -1)
    cobweb(cv, 300, 418, 1)
    wine_rack(cv, 26, CELLAR_FLOOR)
    barrels(cv, 96, CELLAR_FLOOR)
    shelf(cv, 30, 520)
    card_table(cv, 470, CELLAR_FLOOR)
    hatch(cv, HATCH_X, CELLAR_FLOOR)
    coat_hook(cv, 600, 560)
    poster(cv, 500, 548)
    clock(cv, 562, 512)
    pipes_on_vault(cv)
    chalk_tally(cv, 170, 600)
    mousehole(cv, 440, CELLAR_FLOOR)
    broom(cv, 176, CELLAR_FLOOR)


def cobweb(cv, x, y, d):
    """a web in a corner: spokes fanning from (x, y), threads strung across them. d = 1 opens right, -1 left"""
    ends = [(x + d * round(18 * np.cos(t)), y + round(16 * np.sin(t))) for t in np.linspace(0, np.pi / 2, 5)]
    for ex, ey in ends:
        cv.line(x, y, ex, ey, "ink3")
    for s_ in (0.4, 0.7, 0.95):
        pts = [(x + round((ex - x) * s_), y + round((ey - y) * s_)) for ex, ey in ends]
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            cv.line(ax, ay + 1, bx, by, "pa0")


def wine_rack(cv, x, floor):
    """a tall rack, mostly full, a few slots empty and one bottle lying on top"""
    w, h = 58, 100
    top = floor - h
    cv.rect(x, top, x + w, floor, "bk1")
    for yy in range(top, floor, 10):
        for xx in range(x, x + w, 10):
            slot_x, slot_y = xx + 5, yy + 5
            cv.line(xx, yy, xx + 10, yy + 10, "br1")
            cv.line(xx + 10, yy, xx, yy + 10, "br1")
            if cv.r.random() < 0.82:  # a bottle end, glass catching the bulb
                col = cv.r.choice(["fg0", "fg1", "bu1", "fg0", "ink1"])
                cv.ellipse(slot_x - 3, slot_y - 3, slot_x + 3, slot_y + 3, col)
                cv.px(slot_x - 1, slot_y - 1, "pa2")
                if cv.r.random() < 0.4:
                    cv.px(slot_x, slot_y, "fl1")  # a foil cap
    cv.rect(x, top, x + 3, floor, "br1")
    cv.rect(x + w - 3, top, x + w, floor, "br0")
    cv.rect(x - 2, top - 3, x + w + 2, top, "br2")
    cv.hline(x - 2, x + w + 2, top - 3, "br3")
    cv.rect(x + 14, top - 8, x + 34, top - 4, "fg0")  # a bottle on top, on its side
    cv.rect(x + 34, top - 7, x + 39, top - 5, "fg0")
    cv.hline(x + 16, x + 32, top - 8, "fg2")
    cv.rect(x + 20, top - 7, x + 26, top - 5, "pa3")  # its label


def barrel(cv, x, y, w, h, tally=""):
    """a barrel lying on its side, seen end on: the round head with its hoops and a chalk mark"""
    cv.ellipse(x, y, x + w, y + h, "br1")
    cv.fill(cv.mask_ellipse(x, y, x + w, y + h) & ~cv.mask_ellipse(x + 3, y + 3, x + w - 3, y + h - 3), "ink1")
    cv.fill(cv.mask_ellipse(x + 1, y + 1, x + w - 1, y + h - 1) & ~cv.mask_ellipse(x + 3, y + 3, x + w - 3, y + h - 3), "br0")
    for i in range(1, 4):  # head boards
        cv.hline(x + 4, x + w - 4, y + i * h // 4, "br0")
    cv.ellipse(x + w // 2 - 2, y + h // 2 - 1, x + w // 2 + 2, y + h // 2 + 2, "ink1")  # the bung
    cv.fill(cv.mask_ellipse(x + 3, y + 2, x + w - 6, y + h // 2) & ~cv.mask_ellipse(x + 4, y + 4, x + w - 3, y + h // 2 + 3), "br2")
    if tally:
        for i, ch in enumerate(tally):
            cv.vline(x + w // 2 - 6 + i * 2, y + h // 2 + 5, y + h // 2 + 10, "pa3")
        cv.line(x + w // 2 - 7, y + h // 2 + 9, x + w // 2 + 2, y + h // 2 + 6, "pa3")


def barrels(cv, x, floor):
    """three barrels on a cradle, two below and one on top, and a candle stuck to the top one"""
    cv.rect(x - 2, floor - 6, x + 72, floor, "br0")
    cv.hline(x - 2, x + 72, floor - 6, "br1")
    barrel(cv, x, floor - 40, 34, 34, "1111")
    barrel(cv, x + 36, floor - 40, 34, 34, "11")
    barrel(cv, x + 18, floor - 72, 34, 34, "111")
    cv.rect(x + 33, floor - 80, x + 37, floor - 71, "pa3")  # candle
    cv.vline(x + 33, floor - 80, floor - 71, "pa4")
    cv.rect(x + 32, floor - 72, x + 38, floor - 70, "pa2")  # its wax pooled
    cv.px(x + 35, floor - 82, "fl5")
    cv.px(x + 35, floor - 83, "fl4")
    cv.px(x + 35, floor - 81, "fl3")


def shelf(cv, x, y):
    """a plank on brackets with jars, a lamp, a tin box"""
    cv.rect(x, y, x + 80, y + 3, "br1")
    cv.hline(x, x + 80, y, "br2")
    for bx in (x + 6, x + 70):
        cv.line(bx, y + 3, bx + 4, y + 9, "ink1")
        cv.vline(bx, y + 3, y + 10, "ink1")
    for i, (w, h, col) in enumerate(((7, 10, "ab1"), (6, 8, "br2"), (8, 12, "fg1"), (6, 6, "pa2"))):
        jx = x + 4 + i * 11
        cv.rect(jx, y - h, jx + w, y, col)
        cv.hline(jx, jx + w, y - h, "pa1")
        cv.px(jx + 1, y - h + 2, "pa3")
    cv.rect(x + 50, y - 7, x + 64, y, "bu2")  # a biscuit tin
    cv.hline(x + 50, x + 64, y - 7, "br3")
    cv.rect(x + 53, y - 5, x + 61, y - 2, "br4")
    cv.rect(x + 68, y - 12, x + 74, y, "br1")  # an oil lamp, cold
    cv.ellipse(x + 67, y - 18, x + 75, y - 11, "pa2")


def card_table(cv, x, floor):
    """the tripot's table: green baize, a hand left face up, chips, an ashtray, two chairs, one knocked over"""
    tw = 74
    top = floor - 30
    cv.rect(x, top, x + tw, top + 4, "fg1")
    cv.hline(x, x + tw, top, "fg2")
    cv.rect(x - 2, top + 4, x + tw + 2, top + 7, "br1")
    cv.hline(x - 2, x + tw + 2, top + 6, "br0")
    for lx in (x + 3, x + tw - 6):
        cv.rect(lx, top + 7, lx + 3, floor, "br0")
        cv.vline(lx, top + 7, floor, "br1")
    # what's on it
    for i, (cx, col) in enumerate(((x + 10, "pa4"), (x + 15, "pa4"), (x + 20, "pa3"))):
        cv.rect(cx, top - 2, cx + 6, top, col)
        cv.px(cx + 2, top - 2, "bu3" if i != 1 else "ink1")
    for i, (cx, n, col) in enumerate(((x + 34, 4, "bu2"), (x + 41, 6, "pa3"), (x + 48, 3, "bl2"))):
        for k in range(n):
            cv.hline(cx, cx + 5, top - 1 - k, col if k % 2 == 0 else ("bu3" if col == "bu2" else "pa4" if col == "pa3" else "bl3"))
    cv.rect(x + 58, top - 3, x + 66, top, "ink3")  # ashtray
    cv.hline(x + 58, x + 66, top - 3, "pa0")
    cv.line(x + 62, top - 4, x + 68, top - 6, "pa3")  # a cigarette resting in it
    cv.px(x + 68, top - 6, "fl3")
    cv.rect(x + 26, top - 9, x + 30, top, "fg0")  # a bottle
    cv.rect(x + 27, top - 13, x + 29, top - 9, "fg0")
    cv.px(x + 27, top - 7, "fg3")
    # a chair standing
    chair(cv, x - 16, floor, flip=False)
    # one knocked over
    cv.line(x + tw + 6, floor - 2, x + tw + 26, floor - 8, "br1")
    cv.line(x + tw + 6, floor - 1, x + tw + 26, floor - 7, "br0")
    cv.line(x + tw + 12, floor - 4, x + tw + 10, floor, "br0")
    cv.line(x + tw + 22, floor - 7, x + tw + 24, floor - 1, "br0")
    cv.line(x + tw + 26, floor - 8, x + tw + 34, floor - 1, "br1")


def chair(cv, x, floor, flip):
    seat = floor - 14
    cv.rect(x, seat, x + 12, seat + 2, "br2")
    cv.vline(x + 1, seat + 2, floor, "br0")
    cv.vline(x + 10, seat + 2, floor, "br0")
    cv.vline(x + 1, seat - 16, seat, "br1")
    cv.hline(x + 1, x + 4, seat - 16, "br1")
    for yy in range(seat - 13, seat - 2, 4):
        cv.hline(x + 1, x + 4, yy, "br0")


def hatch(cv, x, floor):
    """the trapdoor down to the sewers: a hole in the flags with a ladder's top, its lid propped open"""
    cv.rect(x + 12, floor, x + 52, STONE + 1, "ink0")
    cv.rect(x + 10, floor, x + 12, STONE, "br1")
    cv.rect(x + 52, floor, x + 54, STONE, "br1")
    # the lid standing open against the wall
    cv.poly([(x + 12, floor), (x + 4, floor - 38), (x + 42, floor - 42), (x + 50, floor - 3)], "br1")
    for i in range(1, 4):
        cv.line(x + 4 + i * 9 + 1, floor - 39 - i, x + 12 + i * 9 + 1, floor - 1, "br0")
    cv.line(x + 4, floor - 38, x + 42, floor - 42, "br2")
    cv.line(x + 8, floor - 20, x + 46, floor - 22, "ink1")  # an iron strap
    cv.rect(x + 25, floor - 24, x + 29, floor - 18, "ink2")
    cv.px(x + 27, floor - 21, "pa1")


def coat_hook(cv, x, y):
    """a coat and a hat left on a hook"""
    cv.rect(x, y, x + 3, y + 2, "ink1")
    cv.poly([(x - 6, y + 2), (x + 8, y + 2), (x + 11, y + 40), (x + 2, y + 44), (x - 9, y + 40)], "ink2")
    cv.line(x + 1, y + 3, x + 1, y + 40, "ink1")
    cv.line(x - 6, y + 2, x - 9, y + 40, "ink3")
    cv.rect(x - 7, y - 4, x + 9, y - 1, "ink1")  # hat brim
    cv.rect(x - 4, y - 10, x + 6, y - 4, "ink1")
    cv.hline(x - 4, x + 6, y - 6, "bu1")


def poster(cv, x, y):
    """a boxing bill pasted to the wall, gone yellow, one corner peeling"""
    w, h = 30, 40
    cv.rect(x, y, x + w, y + h, "pa2")
    cv.rect(x + 2, y + 2, x + w - 2, y + 8, "bu2")
    cv.rect(x + 4, y + 10, x + w - 4, y + 28, "pa1")
    cv.rect(x + 8, y + 12, x + 13, y + 26, "ink2")  # two boxers squared up
    cv.rect(x + 17, y + 12, x + 22, y + 26, "ink2")
    cv.rect(x + 12, y + 15, x + 15, y + 18, "bu2")
    cv.rect(x + 16, y + 15, x + 19, y + 18, "bu2")
    for ly in (y + 31, y + 34):
        cv.hline(x + 4, x + w - 4, ly, "ink3")
    cv.poly([(x + w - 8, y + h), (x + w, y + h - 9), (x + w, y + h)], "ink2")
    cv.line(x + w - 8, y + h - 1, x + w - 1, y + h - 9, "pa3")
    cv.specks(x, y, x + w, y + h, ["pa1", "pa0"], 30, on=["pa2"])


def clock(cv, x, y):
    """a station clock, stopped"""
    cv.ellipse(x - 9, y - 9, x + 10, y + 10, "br1")
    cv.ellipse(x - 7, y - 7, x + 8, y + 8, "pa3")
    cv.line(x, y, x, y - 5, "ink0")
    cv.line(x, y, x + 4, y + 2, "ink0")
    for a in range(12):
        t = a / 12 * 2 * np.pi
        cv.px(x + round(6 * np.sin(t)), y - round(6 * np.cos(t)), "ink2")
    cv.line(x + 2, y - 6, x + 5, y + 4, "pa2")  # a crack across the glass


def pipes_on_vault(cv):
    """a pipe and a cable following the vault round, a valve, a junction box"""
    for x in range(30, 610):
        dx = (x - 320) / 306
        if abs(dx) >= 1:
            continue
        y = int(VAULT_SPRING - (VAULT_SPRING - VAULT_APEX) * np.sqrt(1 - dx * dx)) + 9
        cv.px(x, y, "br2")
        cv.px(x, y + 1, "br1")
        cv.px(x, y + 2, "ink0")
        if x % 40 == 0:
            cv.rect(x - 1, y - 1, x + 2, y + 3, "ink2")
    cv.rect(596, 600, 610, 616, "ink2")  # junction box
    cv.hline(596, 610, 600, "ink3")
    cv.rect(600, 604, 606, 608, "ab1")
    cv.vline(603, 530, 600, "ink0")


def chalk_tally(cv, x, y):
    """who owes what, in chalk: five-bar gates"""
    for g in range(3):
        gx = x + g * 12
        for i in range(4):
            cv.vline(gx + i * 2, y, y + 7, "pa2")
        cv.line(gx - 1, y + 6, gx + 8, y + 1, "pa2")
    cv.hline(x, x + 20, y + 11, "pa1")
    cv.hline(x + 24, x + 30, y + 11, "pa1")


def mousehole(cv, x, floor):
    cv.ellipse(x, floor - 7, x + 8, floor + 4, "ink0")
    cv.rect(x + 9, floor - 3, x + 14, floor, "ink2")  # a mouse
    cv.px(x + 14, floor - 3, "ink2")
    cv.px(x + 13, floor - 4, "pa1")
    cv.line(x + 8, floor - 1, x + 6, floor - 2, "ink2")


def broom(cv, x, floor):
    cv.line(x, floor - 50, x + 8, floor - 8, "br1")
    cv.poly([(x + 5, floor - 10), (x + 11, floor - 10), (x + 14, floor), (x + 4, floor)], "br3")
    for i in range(5, 14, 2):
        cv.vline(x + i, floor - 6, floor, "br2")


# ---------- the ossuary niche in the stone ----------

def ossuary(cv, x, y):
    """a niche cut in the limestone where the old bones were stacked: skulls on a row of long bones"""
    cv.ellipse(x, y, x + 60, y + 40, "ink1")
    cv.rect(x, y + 20, x + 60, y + 40, "ink1")
    yy, xx = np.mgrid[0:cv.h, 0:cv.w]
    niche = cv.mask_ellipse(x, y, x + 60, y + 40) | ((yy >= y + 20) & (yy < y + 40) & (xx >= x) & (xx < x + 60))
    cv.fill(ring(cv, niche, 1), "pa1")
    for row in range(3):  # bone ends
        by = y + 36 - row * 4
        for bx in range(x + 4 + (row % 2) * 2, x + 56, 5):
            cv.rect(bx, by, bx + 4, by + 3, "pa2")
            cv.px(bx, by, "pa3")
            cv.px(bx + 3, by + 2, "pa0")
    for sx in range(x + 8, x + 52, 11):  # a row of skulls
        cv.ellipse(sx, y + 14, sx + 9, y + 23, "pa2")
        cv.rect(sx + 2, y + 21, sx + 7, y + 25, "pa2")
        cv.px(sx + 2, y + 18, "ink0")
        cv.px(sx + 3, y + 18, "ink0")
        cv.px(sx + 6, y + 18, "ink0")
        cv.px(sx + 5, y + 18, "ink0")
        cv.px(sx + 4, y + 21, "ink1")
        cv.hline(sx + 3, sx + 7, y + 24, "pa0")
        cv.px(sx + 2, y + 15, "pa3")
    cv.rect(x + 22, y + 8, x + 38, y + 11, "pa1")
    cv.hline(x + 24, x + 36, y + 9, "ink2")  # a carved date, too worn to read


# ---------- the sewer ----------

def sewer(cv):
    r = cv.r
    yy, xx = np.mgrid[0:H, 0:W]
    room = vault_mask(cv, 8, 632, SEWER_SPRING, SEWER + 2, WALK + 10)
    # the gallery's wall: millstone blocks, green-black with damp
    wall = Cv(W, H, "ink0", seed=8)
    y = SEWER
    while y < WALK + 10:
        h = 8
        off = ((y - SEWER) // 8 % 2) * 11
        for x in range(-off, W, 22):
            col = r.choice(["ink2", "ink2", "fg0", "ink3", "ink2", "ink1"])
            wall.rect(x + 1, y + 1, x + 21, y + h, col)
            wall.hline(x + 1, x + 21, y + 1, "ink3" if col != "ink3" else "pa0")
            wall.specks(x + 1, y + 2, x + 21, y + h, ["ink1", "fg0", "ink3"], 5)
        y += h
    # the gallery runs away from us: rings of arches going darker toward the middle
    for i, (inset, col) in enumerate(((60, "ink0"), (110, "ink0"), (150, "ink0"))):
        m = vault_mask(wall, 8 + inset, 632 - inset, SEWER_SPRING + inset // 3, SEWER + 2 + inset * 2 // 3, WALK)
        wall.fill(ring(wall, m, 2), "ink3" if i < 2 else "ink2")
        if i:
            wall.shade(m, -1)
    far = vault_mask(wall, 230, 410, SEWER_SPRING + 70, SEWER + 140, WALK)
    wall.fill(far, "ink0")
    wall.fill(ring(wall, far, 1), "ink2")
    # slime and tide lines low down
    wall.fill((yy > WALK - 30 + (noise(W, H, 5, 21) * 14).astype(int)) & (yy < WALK + 10) & (noise(W, H, 3, 22) > 0.7), "fg0")
    for k, ty in enumerate((WALK - 18, WALK - 24)):
        wall.fill((np.abs(yy - ty - (noise(W, H, 20, 30 + k) * 3).astype(int)) < 1) & (wall.a > 0) & (noise(W, H, 6, 40 + k) > 0.45), "fg0")
    cv.a[room] = wall.a[room]
    # the ring of the vault, cut stone
    band = ring(cv, room, 7)
    cv.fill(band, "ink3")
    ang = np.degrees(np.arctan2(SEWER_SPRING - yy, xx - 320))
    cv.fill(band & ((ang * 1.6).astype(int) % 8 == 0) & (yy < SEWER_SPRING), "ink1")
    cv.fill(band & ((yy - SEWER_SPRING) % 10 == 0) & (yy >= SEWER_SPRING), "ink1")
    cv.fill(ring(cv, room, 1), "pa0")
    cv.fill(ring(cv, room | band, 1), "ink0")
    mains(cv)
    plaque(cv, 24, 840)
    tags(cv)
    walkway(cv)
    water(cv)
    outlet(cv, *OUTLET)
    hangout(cv, 70, WALK)
    rat(cv, 520, WALK)
    lantern_hook(cv, *LANTERN)
    ladder(cv)
    sluice(cv, 470, 1040)


def mains(cv):
    """the big water mains bolted along the walls, and a cable bundle in a tray"""
    for y, x0, x1, ramp, d in ((862, 16, 200, ("ink0", "bl0", "bl1", "bl2"), 12), (880, 16, 160, ("ink0", "fg0", "fg1", "fg2"), 8),
                               (862, 470, 626, ("ink0", "bl0", "bl1", "bl2"), 12), (884, 500, 626, ("ink0", "br0", "br1", "br2"), 7)):
        dark, body, lit, shine = ramp
        cv.rect(x0, y, x1, y + d, body)
        cv.rect(x0, y + 1, x1, y + d // 2, lit)
        cv.hline(x0, x1, y + 2, shine)
        cv.hline(x0, x1, y, dark)
        cv.hline(x0, x1, y + d - 1, dark)
        for x in range(x0 + 20, x1, 46):  # collars and wall brackets
            cv.rect(x, y - 1, x + 4, y + d + 1, body)
            cv.vline(x, y - 1, y + d + 1, shine)
            cv.vline(x + 3, y - 1, y + d + 1, dark)
            cv.rect(x + 1, y + d + 1, x + 3, y + d + 5, "ink1")
        cv.specks(x0, y, x1, y + d, ["fl0", "br0"], (x1 - x0) // 3)  # rust
    for x in range(16, 626):  # cables
        if 200 < x < 470:
            continue
        for i, col in enumerate(["ink0", "ink2", "ink0"]):
            cv.px(x, 900 + i + int(2 * abs(np.sin(x / 50 * np.pi))), col)


def plaque(cv, x, y):
    """a blue enamel street plaque, the way the égoutiers mark which street is overhead. its words are code"""
    w, h = 76, 16
    cv.rect(x - 1, y - 1, x + w + 1, y + h + 1, "ink0")
    cv.rect(x, y, x + w, y + h, "bl2")
    cv.rect(x + 1, y + 1, x + w - 1, y + h - 1, "pa4")
    cv.rect(x + 2, y + 2, x + w - 2, y + h - 2, "bl2")
    cv.hline(x + 2, x + w - 2, y + 2, "bl3")
    for cx, cy in ((x + 3, y + 3), (x + w - 4, y + 3), (x + 3, y + h - 4), (x + w - 4, y + h - 4)):
        cv.px(cx, cy, "pa2")
    cv.px(x + 10, y + 10, "ink1")  # chipped enamel
    cv.px(x + 11, y + 10, "ink1")
    cv.px(x + 60, y + 4, "ink2")


def tags(cv):
    """graffiti low on the walls: a crowned tag, a heart with initials, a spade"""
    # a spade in mint
    for (dx, dy) in [(0, 2), (1, 1), (2, 0), (3, 1), (4, 2), (-1, 3), (5, 3), (-1, 4), (5, 4), (0, 5), (4, 5), (1, 5), (3, 5), (2, 6), (2, 7), (1, 8), (3, 8)]:
        cv.px(36 + dx * 2, 1060 + dy * 2, "ab1")
        cv.px(37 + dx * 2, 1060 + dy * 2, "ab1")
    # a scrawled crown and initials in violet
    cv.line(560, 1080, 564, 1072, "vi2")
    cv.line(564, 1072, 568, 1078, "vi2")
    cv.line(568, 1078, 572, 1070, "vi2")
    cv.line(572, 1070, 576, 1078, "vi2")
    cv.line(576, 1078, 580, 1072, "vi2")
    cv.line(580, 1072, 584, 1080, "vi2")
    cv.hline(560, 585, 1081, "vi2")
    for i, x in enumerate(range(556, 590, 7)):
        cv.line(x, 1096, x + 4, 1086 + (i % 2) * 2, "vi1")
        cv.line(x + 4, 1086 + (i % 2) * 2, x + 6, 1096, "vi1")
    # a heart
    cv.ellipse(150, 1076, 158, 1084, "bu2")
    cv.ellipse(156, 1076, 164, 1084, "bu2")
    cv.poly([(150, 1081), (164, 1081), (157, 1090)], "bu2")
    cv.ellipse(152, 1078, 156, 1082, "bu1")


def walkway(cv):
    """the walkway along the channel: stone kerb, an iron rail with posts and a chain"""
    cv.rect(8, WALK, 632, WATER, "ink3")
    cv.hline(8, 632, WALK, "pa1")
    cv.hline(8, 632, WALK + 1, "pa0")
    for x in range(8, 632, 30):
        cv.vline(x, WALK + 2, WATER, "ink1")
    cv.specks(8, WALK + 2, 632, WATER, ["ink2", "fg0"], 160)
    cv.hline(8, 632, WATER - 1, "ink0")
    for x in range(20, 632, 48):  # rail posts and a chain swinging between
        cv.rect(x, WALK - 20, x + 2, WALK, "ink1")
        cv.px(x, WALK - 21, "ink2")
        cv.px(x + 1, WALK - 21, "ink2")
        if x + 48 < 632:
            for k in range(48):
                t = k / 48
                cv.px(x + 1 + k, WALK - 18 + int(5 * np.sin(t * np.pi)), "ink2" if k % 2 else "pa0")


def water(cv):
    """the channel: dark water going darker with depth, a bright skin where the light catches"""
    yy, xx = np.mgrid[0:H, 0:W]
    m = (yy >= WATER) & (yy < H)
    cv.fill(m, "fg0")
    cv.fill(m & (yy > WATER + 10 + (BAYER[yy % 4, xx % 4] * 6)), "bl0")
    cv.fill(m & (yy > WATER + 30 + (BAYER[yy % 4, xx % 4] * 6)), "ink0")
    cv.hline(0, W, WATER, "fg2")
    for _ in range(40):
        x, y = cv.r.randrange(W), cv.r.randrange(WATER + 2, H - 4)
        cv.hline(x, x + cv.r.randrange(3, 9), y, "fg1" if y < WATER + 20 else "bl1")
    # some rubbish floating: a bottle, a playing card
    cv.rect(300, WATER + 4, 307, WATER + 6, "fg1")
    cv.px(307, WATER + 4, "fg3")
    cv.rect(420, WATER + 8, 426, WATER + 10, "pa3")
    cv.px(422, WATER + 8, "bu3")


def outlet(cv, x, y):
    """an outlet pipe in the wall, a green slick down its lip"""
    s = 40
    cv.ellipse(x - s // 2, y - s // 2, x + s // 2, y + s // 2, "ink3")
    cv.fill(cv.mask_ellipse(x - s // 2, y - s // 2, x + s // 2, y + s // 2) & ~cv.mask_ellipse(x - s // 2 + 2, y - s // 2 + 2, x + s // 2 - 2, y + s // 2 - 2), "pa0")
    cv.ellipse(x - 14, y - 14, x + 14, y + 14, "ink0")
    cv.ellipse(x - 12, y - 12, x + 12, y + 12, "ink0")
    cv.fill(cv.mask_ellipse(x - 14, y - 14, x + 14, y + 14) & ~cv.mask_ellipse(x - 12, y - 12, x + 12, y + 12), "ink1")
    for k in range(10):
        cv.vline(x - 3 + k % 4, y + 14, y + 20 + k % 3, "ab1")
    cv.rect(x - 16, y + 18, x + 16, y + 20, "fg1")


def hangout(cv, x, floor):
    """where the online crowd meets: a crate for a table, a candle in a bottle, a deck, two stools"""
    cv.rect(x, floor - 18, x + 26, floor, "br1")
    cv.hline(x, x + 26, floor - 18, "br2")
    cv.line(x, floor - 18, x + 26, floor, "br0")
    cv.vline(x + 13, floor - 18, floor, "br0")
    cv.rect(x + 3, floor - 21, x + 9, floor - 18, "pa4")  # the deck
    cv.hline(x + 3, x + 9, floor - 21, "pa3")
    cv.rect(x + 12, floor - 20, x + 17, floor - 18, "pa3")  # a dealt card
    cv.px(x + 14, floor - 20, "bu3")
    cv.rect(x + 19, floor - 28, x + 23, floor - 18, "fg0")  # candle in a bottle, wax down its neck
    cv.rect(x + 20, floor - 32, x + 22, floor - 28, "fg0")
    cv.vline(x + 20, floor - 34, floor - 27, "pa3")
    cv.vline(x + 22, floor - 32, floor - 26, "pa2")
    cv.px(x + 21, floor - 36, "fl5")
    cv.px(x + 21, floor - 37, "fl4")
    for sx in (x - 14, x + 32):  # stools: upturned buckets
        cv.poly([(sx, floor), (sx + 2, floor - 10), (sx + 9, floor - 10), (sx + 11, floor)], "bl1")
        cv.hline(sx + 2, sx + 9, floor - 10, "bl2")
        cv.hline(sx, sx + 11, floor - 4, "ink1")


def rat(cv, x, floor):
    """a rat on the walkway, its tail is code"""
    cv.ellipse(x, floor - 5, x + 9, floor, "ink2")
    cv.ellipse(x + 7, floor - 5, x + 12, floor - 1, "ink2")
    cv.px(x + 12, floor - 3, "ink2")
    cv.px(x + 9, floor - 6, "pa0")  # ear
    cv.px(x + 10, floor - 4, "fl3")  # eye
    cv.hline(x + 1, x + 7, floor - 5, "ink3")


def lantern_hook(cv, x, y):
    """a hurricane lantern on a hook in the wall: the gallery's only light"""
    cv.rect(x - 1, y - 14, x + 2, y - 12, "ink2")
    cv.line(x, y - 12, x, y - 8, "ink2")
    cv.rect(x - 4, y - 8, x + 5, y - 6, "ink1")
    cv.rect(x - 3, y - 6, x + 4, y + 4, "fl4")
    cv.rect(x - 2, y - 4, x + 3, y + 2, "fl5")
    cv.px(x, y - 2, "fl6")
    cv.vline(x - 4, y - 6, y + 4, "ink1")
    cv.vline(x + 4, y - 6, y + 4, "ink1")
    cv.rect(x - 4, y + 4, x + 5, y + 6, "ink1")


def ladder(cv):
    """the iron ladder down from the cellar hatch, through the stone and into the gallery"""
    x = LADDER_X
    cv.rect(x - 6, STONE, x + 34, SEWER + 8, "ink0")  # the shaft
    cv.vline(x - 7, STONE, SEWER + 8, "ink3")
    cv.vline(x + 34, STONE, SEWER + 8, "ink2")
    for side in (x, x + 25):
        cv.rect(side, STONE, side + 3, WALK, "ink2")
        cv.vline(side, STONE, WALK, "pa0")
    for y in range(STONE + 6, WALK, 12):
        cv.rect(x + 3, y, x + 25, y + 2, "ink2")
        cv.hline(x + 3, x + 25, y, "pa0")
    cv.specks(x, STONE, x + 28, WALK, ["fl0", "br0"], 120, on=["ink2"])  # rust


def sluice(cv, x, y):
    """a sluice gate's wheel on a post by the water"""
    cv.rect(x - 1, y, x + 2, WALK, "ink2")
    cv.ellipse(x - 10, y - 10, x + 11, y + 11, "bu1")
    cv.fill(cv.mask_ellipse(x - 10, y - 10, x + 11, y + 11) & ~cv.mask_ellipse(x - 8, y - 8, x + 9, y + 9), "bu2")
    for a in range(4):
        t = a / 4 * np.pi
        cv.line(x - round(8 * np.cos(t)), y - round(8 * np.sin(t)), x + round(8 * np.cos(t)), y + round(8 * np.sin(t)), "bu1")
    cv.ellipse(x - 2, y - 2, x + 3, y + 3, "ink2")


# ---------- light ----------

def lights(cv):
    f = np.zeros((cv.h, cv.w))
    for bx in BULBS:  # the cellar's bulbs
        f += glow(W, H, bx, 452, 160, 2.6)
    f += glow(W, H, 131, CELLAR_FLOOR - 80, 30, 1.5)  # the candle on the barrels
    f += glow(W, H, 320, 600, 300, -0.6, sx=1.2)  # the middle stays dim so the chalk reads
    f += glow(W, H, *LANTERN, 190, 2.4)
    f += glow(W, H, 320, 1020, 330, 1.0, sx=1.0, sy=0.6)  # the gallery's own murk, lit from the water
    f += glow(W, H, LADDER_X + 14, SEWER + 30, 70, 1.2)  # what comes down the shaft
    f += glow(W, H, 91, WALK - 34, 40, 1.4)  # the candle in the bottle
    f += glow(W, H, OUTLET[0], OUTLET[1], 60, 0.8)
    return f


def build():
    cv = Cv(W, H, seed=2)
    earth(cv)
    pipes_in_earth(cv)
    ossuary(cv, 60, STONE + 2)
    cellar(cv)
    sewer(cv)
    only = np.zeros(cv.a.shape, bool)
    only[TOP + 7:, :] = True
    cv.light(lights(cv), only)
    out = Cv(W, H - TOP)
    out.a = cv.a[TOP:].copy()
    return out


def bulb():
    """a bare bulb on its socket, hung from a cord in code"""
    cv = Cv(8, 12)
    cv.rect(3, 0, 5, 3, "ink1")
    cv.rect(2, 3, 6, 5, "ink3")
    yy, xx = np.mgrid[0:12, 0:8]
    d = (xx - 3.5) ** 2 + (yy - 8) ** 2
    cv.fill((d <= 10) & (yy >= 5), "fl5")
    cv.fill((d <= 3) & (yy >= 5), "fl6")
    return cv


if __name__ == "__main__":
    import sys
    build().save(sys.argv[1] if len(sys.argv) > 1 else "under.png", 1)
