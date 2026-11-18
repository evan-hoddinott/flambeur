"""Draw the Vitrine objects at native resolution; build.py packs their animation cels."""

from functools import cache
from pathlib import Path
import importlib.util
import json
import math
import random

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
ART = ROOT.parent
spec = importlib.util.spec_from_file_location(
    "boosters", ART / "packaging/boosters/build.py"
)
boosters = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boosters)
ink, soot, wood, tan, buff, cream, white = (
    "#1c1513",
    "#43342e",
    "#5c4a36",
    "#8c7656",
    "#bfa77e",
    "#e3d2a8",
    "#f6ecd2",
)
oak, bronze, brass, gold, light = "#3d2a10", "#6b4a1a", "#c99a3a", "#e8c260", "#fff0b0"
ox, wine, red, pink = "#4e1020", "#7a1a2c", "#a82a38", "#d04a4e"
pine, felt, jade, mint = "#174034", "#1f5a46", "#4a9a74", "#b8f0a0"
navy, blue, sky = "#0f1d33", "#28497a", "#3e66a0"
plum, violet, lilac = "#2a1440", "#7a4ab0", "#b088e0"
orange = "#ff7a24"
clear = (0, 0, 0, 0)
NN = Image.Resampling.NEAREST


@cache
def atlas(group):
    sheet = Image.open(ART / group / (group + ".png")).convert("RGBA")
    data = json.loads((ART / group / (group + ".json")).read_text())
    parts = {}
    for s in data["meta"]["slices"]:
        b = s["keys"][0]["bounds"]
        x, y, w, h = (b[k] for k in ("x", "y", "w", "h"))
        parts[s["name"]] = sheet.crop((x, y, x + w, y + h))
    return parts


def label(im, words, x, y, color, font="tiny", width=None):
    boosters.lettering(im, words, x, y, color, font, width)


def paste(im, tile, xy, size, angle=0):
    tile = tile.resize(size, NN)
    if angle:
        tile = tile.rotate(angle, NN, expand=True)
    im.alpha_composite(tile, xy)


@cache
def card(rank, suit):
    im = Image.open(ART / "cards/previews" / f"{rank}-of-{suit}.png").convert("RGBA")
    # the card compositor multiplies two ink shades between palette stops
    inks = {
        (22, 17, 15, 255): (28, 21, 19, 255),
        (137, 34, 45, 255): (122, 26, 44, 255),
    }
    im.putdata([inks.get(pixel, pixel) for pixel in im.get_flattened_data()])
    return im


def pip(im, suit, xy, size, color):
    mask = atlas("cards")["pip/" + suit].getchannel("A").resize(size, NN)
    im.paste(color, xy, mask)


def moustache(d, x, y, c):
    d.line(
        [
            (x - 5, y - 1),
            (x - 4, y + 1),
            (x - 2, y + 1),
            (x, y),
            (x + 2, y + 1),
            (x + 4, y + 1),
            (x + 5, y - 1),
        ],
        c,
        2,
    )


def gleam(d, x, y, c=light):
    d.line((x - 2, y, x + 2, y), c)
    d.line((x, y - 2, x, y + 2), c)


@cache
def keeper_head():
    im = Image.new("RGBA", (200, 180))
    slices = json.loads((ART / "shop/shop.json").read_text())["meta"]["slices"]
    pivots = {s["name"]: s["keys"][0]["pivot"] for s in slices}
    for name in [
        "bur/body",
        "bur/eyes/you",
        "bur/brows/grump",
        "bur/stache/grump",
        "bur/cig",
    ]:
        pivot = pivots[name]
        im.alpha_composite(atlas("shop")[name], (-pivot["x"], -pivot["y"]))
    return im.crop((61, 19, 137, 106))


def portrait(im, x, y, w, h):
    paste(im, keeper_head(), (x, y), (w, h))


def plaque(im, box, words):
    d = ImageDraw.Draw(im)
    x, y, r, b = box
    d.rounded_rectangle(box, 2, brass, ink)
    d.line((x + 2, y + 1, r - 2, y + 1), light)
    label(im, words, (x + r) // 2, y + 3, oak)


def penny(im, d, f):
    paste(im, atlas("cards")["base/paper"], (0, 0), im.size)
    d.ellipse((10, 15, 53, 59), bronze, oak, 2)
    d.ellipse((11, 14, 51, 55), brass, light)
    d.ellipse((15, 18, 47, 51), brass, bronze)
    for i in range(28):
        a = i * math.tau / 28
        x, y = 31 + round(18 * math.cos(a)), 35 + round(18 * math.sin(a))
        d.point((x, y), light)
    label(im, "5", 31, 23, oak, "didone", 13)
    label(im, "CENTIMES", 31, 39, oak)
    for x, y in [(6, 17), (42, 48)]:
        d.polygon(
            [(x, y + 8), (x + 13, y), (x + 17, y + 6), (x + 4, y + 14)], buff, bronze
        )
        d.line((x + 3, y + 8, x + 13, y + 2), cream)
    label(im, "PORTE-BONHEUR", 32, 68, blue)
    d.line([(8, 76), (31, 74), (48, 75)], sky)
    moustache(d, 52, 81, tan)
    gleam(d, 21 + f * 4, 22 - f)


def loader(im, d, f):
    d.rounded_rectangle((0, 0, 63, 97), 4, blue, navy)
    d.rounded_rectangle((2, 1, 61, 95), 3, sky, buff)
    paste(im, card("2", "clubs"), (5, 9), (54, 82))
    d.rounded_rectangle((2, 2, 61, 8), 2, navy, cream)
    d.line((6, 4, 57, 4), sky)
    moustache(d, 44, 75, buff)
    y = 27 + f * 2
    d.polygon([(2, y + 22), (2, y + 17), (59, y - 12), (59, y - 8)], white)
    d.line((5, y + 25, 59, y - 4), cream)


def ball(im, d, f):
    d.ellipse((1, 5, 51, 55), wine, ink, 2)
    # Bands follow curved paths clipped to the ball, as if wound around a sphere.
    bands = Image.new("RGBA", im.size)
    pen = ImageDraw.Draw(bands)
    rng = random.Random(12)
    for i in range(24):
        a = rng.uniform(0, math.tau)
        offset = rng.randint(-20, 20)
        pts = []
        for t in range(-32, 33):
            u = offset + (t * t - 400) * 0.012
            pts.append(
                (
                    26 + t * math.cos(a) - u * math.sin(a),
                    30 + t * math.sin(a) + u * math.cos(a),
                )
            )
        c = [red, pink, wine, brass, red, jade][i % 6]
        pen.line(pts, ink, 5)
        pen.line(pts, c, 3)
        pen.line(
            [(x, y - 1) for x, y in pts],
            {red: pink, wine: red, jade: "#2d7a5c"}.get(c, buff),
            1,
        )
    mask = Image.new("L", im.size)
    ImageDraw.Draw(mask).ellipse((3, 7, 49, 53), 255)
    bands.putalpha(
        Image.composite(bands.getchannel("A"), Image.new("L", im.size), mask)
    )
    im.alpha_composite(bands)
    d.line([(37, 14), (43, 5), (48, 4 + f), (54, 1 + f)], ink, 4)
    d.line([(37, 14), (43, 5), (48, 4 + f), (54, 1 + f)], pink, 2)
    label(im, "L'EQ", 24, 30, cream)


def divider(im, d, f):
    y = f % 2
    d.rounded_rectangle((24, y, 63, 20), 3, jade, pine)
    label(im, "PAIRES", 42, y + 3, white)
    label(im, "X2", 56, y + 9, mint)
    d.rounded_rectangle((0, 13, 63, 87), 3, jade, ink)
    d.rounded_rectangle((2, 15, 61, 84), 2, mint, pine)
    for y in (28, 50, 72):
        d.ellipse((4, y, 11, y + 7), jade)
        d.ellipse((5, y + 1, 10, y + 6), clear)
    d.line((15, 18, 15, 81), jade)
    for x in (21, 39):
        for off in (2, 0):
            d.rounded_rectangle(
                (x + off, 37 + off, x + 14 + off, 58 + off), 2, mint, jade
            )
        pip(im, "D", (x + 3, 44), (9, 10), jade)
    label(im, "M.B.", 49, 76, jade)


def stack(im, d, f):
    for x, y, a in [(0, 7, 6), (4, 4, -4), (5 + f % 2, 1, -2)]:
        paste(im, card("3", "hearts"), (x, y), (59, 82), a)
    d.polygon([(29, 28), (46, 19), (49, 23), (32, 33)], ink)
    d.line((31, 30, 46, 22), cream, 4)
    d.line((41, 25, 47, 21), brass, 4)
    d.line((30, 29, 32, 32), red, 2)


def ruler(im, d, f):
    d.rounded_rectangle((0, 0, 29, 99), 3, brass, ink)
    d.rectangle((2, 2, 4, 96), gold)
    d.rectangle((24, 2, 27, 96), bronze)
    d.ellipse((10, 4, 16, 10), oak, light)
    d.ellipse((12, 6, 14, 8), clear)
    for i in range(35):
        y = 13 + i * 2
        d.line((2, y, 8 if i % 4 == 0 else 5, y), oak)
    for i, s in enumerate(["9", "10", "J", "Q", "K"]):
        label(im, s, 15, 15 + i * 16, oak, "sans")
    strip = Image.new("RGBA", (84, 7))
    label(strip, "PROPRIETE DU TABAC", 42, 0, light)
    im.alpha_composite(strip.transpose(Image.Transpose.ROTATE_90), (21, 12))
    gleam(d, 6, 19 + 17 * f)


def pockets(im, d, f):
    d.rounded_rectangle((0, 0, 91, 65), 4, blue, ink)
    for i in range(9):
        x = 7 + i % 3 * 27
        y = 3 + i // 3 * 20
        d.rectangle((x, y, x + 25, y + 19), sky, navy)
        d.rectangle((x + 3, y + 2, x + 22, y + 16), cream, buff)
        special = i == 8
        pip(
            im,
            "S" if special else "H",
            (x + 8 + (f % 2 if special else 0), y + 3),
            (12, 12),
            ink if special else red,
        )
        d.line((x + 1, y + 17, x + 24, y + 17), cream)
        d.line((x + 2, y + 8, x + 8, y + 2), white)
        if special:
            moustache(d, x + 14, y + 12, wood)
    for y in (10, 31, 52):
        d.ellipse((1, y, 4, y + 4), clear)


def chaff(im, d, f):
    p = [
        (1, 24),
        (9, 12),
        (18, 13),
        (22, 3),
        (36, 6),
        (46, 1 + f % 2),
        (51, 12),
        (59, 17),
        (57, 28),
        (61, 39),
        (50, 46),
        (44, 55),
        (29, 52),
        (21, 57),
        (11, 47),
        (4, 44),
    ]
    d.polygon(p, cream, ink)
    for poly, c in [
        ([(2, 25), (17, 20), (11, 44)], tan),
        ([(9, 13), (17, 20), (22, 4)], buff),
        ([(18, 20), (36, 7), (28, 23)], white),
        ([(36, 7), (49, 12), (44, 22)], tan),
        ([(57, 18), (48, 30), (60, 39)], buff),
        ([(11, 44), (29, 39), (21, 55)], wood),
        ([(29, 39), (50, 45), (43, 53)], buff),
        ([(21, 55), (30, 39), (29, 51)], tan),
    ]:
        d.polygon(poly, c)
    label(im, "L'EQUIPE", 31, 13, wood)
    paste(im, card("7", "hearts"), (15, 21), (16, 21), 10)
    paste(im, card("2", "clubs"), (31, 23), (14, 21), -10)
    for x, y in [(5, 30), (7, 33), (42, 44), (39, 47), (46, 17)]:
        d.line((x, y, x + 5, y - 2), tan)


def low(im, d, f):
    d.rounded_rectangle((0, 1, 63, 43), 4, navy, ink)
    d.rounded_rectangle((3, 4, 60, 40), 3, blue, sky)
    for i in range(3):
        x = 13 + i * 12
        y = 8
        d.polygon(
            [
                (x, y),
                (x + 2, y - 2),
                (x + 5, y - 2),
                (x + 6, y),
                (x + 4, y + 8),
                (x + 6, y + 13),
                (x + 4, y + 15),
                (x, y + 15),
                (x - 2, y + 13),
                (x + 1, y + 6),
            ],
            cream,
            navy,
        )
        d.line((x + 1, y + 3, x + 4, y + 3), red, 2)
    d.line((4, 38, 59, 38), brass)
    x = 7 + f * 9
    d.ellipse((x, 22, x + 16, 38), ink, sky)
    d.arc((x + 2, 24, x + 14, 36), 180, 280, cream, 2)
    moustache(d, x + 9, 31, tan)


def odd(im, d, f):
    for x, y in [(0, 6), (2, 3), (4, 0)]:
        d.polygon(
            [
                (x, y + 3),
                (x + 41, y),
                (x + 53, y + 14),
                (x + 49, y + 76),
                (x + 1, y + 76),
            ],
            cream,
            ink,
        )
    for i, s in enumerate("A3579"):
        label(im, s, 12 + i * 8, 7 + i * 8, wine, "sans")
    for x in [20, 22, 24]:
        d.line((x, 2, x + 8, 77), bronze)
    for y in [43, 45, 47]:
        d.line((3, y, 53, y - 4), tan)
    x = f % 3
    d.line((24, 42, 39 + x, 49), oak, 2)
    d.polygon(
        [(27 + x, 51), (37 + x, 46), (54 + x, 53), (50 + x, 70), (25 + x, 64)],
        brass,
        oak,
    )
    d.ellipse((36 + x, 48, 39 + x, 51), oak)
    label(im, "LOT 7", 39 + x, 55, ink)


def chips(im, d, f):
    d.rounded_rectangle((0, 0, 63, 63), 4, oak, ink)
    d.rounded_rectangle((3, 3, 60, 60), 2, felt, brass)
    for i, (x, y, n) in enumerate(
        [(14, 25, 2), (48, 25, 4), (15, 53, 6), (48, 53, 8), (31, 39, 10)]
    ):
        c = [red, blue, bronze, pine, wine][i]
        for k in range(n):
            yy = y - 2 * k
            xx = x + (f % 2 if i == 4 and k == 9 else 0)
            d.ellipse((xx - 9, yy - 4, xx + 9, yy + 3), c, ink)
            d.line((xx - 6, yy + 1, xx - 4, yy + 2), cream)
            d.line((xx + 4, yy + 2, xx + 6, yy + 1), cream)
        d.ellipse((xx - 5, yy - 2, xx + 5, yy + 1), brass)
        if i == 4:
            moustache(d, xx, yy - 1, oak)


def embroidered_suit(suit):
    im = Image.new("RGBA", (32, 32))
    d = ImageDraw.Draw(im)
    thread = "#ffffff"
    if suit == "D":
        d.polygon([(15, 0), (31, 16), (16, 31), (0, 16)], thread)
    elif suit == "C":
        d.ellipse((9, 1, 22, 16), thread)
        d.ellipse((1, 11, 15, 24), thread)
        d.ellipse((16, 11, 30, 24), thread)
        d.polygon(
            [(11, 12), (21, 12), (18, 20), (18, 24), (22, 30), (9, 30), (14, 23)],
            thread,
        )
    elif suit == "H":
        d.ellipse((1, 2, 16, 18), thread)
        d.ellipse((15, 2, 30, 18), thread)
        d.polygon([(1, 12), (30, 12), (27, 19), (15, 31), (4, 19)], thread)
    else:
        d.polygon([(15, 0), (28, 13), (3, 13)], thread)
        d.ellipse((1, 10, 16, 24), thread)
        d.ellipse((15, 10, 30, 24), thread)
        d.polygon([(13, 12), (18, 12), (18, 23), (22, 30), (10, 30), (14, 23)], thread)
    mask = im.getchannel("A")
    for x in range(-32, 32, 4):
        d.line((x, 0, x + 32, 32), "#cccccc")
    im.putalpha(mask)
    return im


def mat(im, d, f):
    d.rounded_rectangle((0, 0, 99, 55), 4, pine, ink)
    d.rounded_rectangle((3, 3, 96, 52), 3, felt, jade)
    for x in range(6, 94, 4):
        for y in [5, 50]:
            d.line((x, y, x + 1, y), gold if x // 12 == f + 1 else buff)
    for y in range(7, 50, 4):
        for x in [5, 94]:
            d.point((x, y), buff)
    for x, s in [(12, 1), (87, -1)]:
        d.arc(
            (x - 5, 11, x + 5, 43), 85 if s == 1 else 265, 275 if s == 1 else 455, jade
        )
        for y in [13, 27, 41]:
            d.polygon(
                [(x, y), (x + 3 * s, y - 2), (x + 6 * s, y), (x + 3 * s, y + 2)], jade
            )
    d.ellipse((83, 42, 90, 48), bronze, wood)
    d.ellipse((85, 43, 89, 46), ink)


def box(im, d, f):
    y = f % 2
    d.polygon([(1, 7 + y), (64, y), (79, 18), (78, 27), (13, 33)], bronze, ink)
    d.polygon([(5, 9 + y), (62, 3 + y), (72, 19), (14, 27)], buff, oak)
    d.ellipse((24, 6 + y, 53, 23 + y), ox, brass)
    portrait(im, 31, 6 + y, 14, 15)
    for x in [13, 59]:
        d.line((x, 12, x + 3, 18), brass, 2)
    d.polygon([(1, 32), (63, 21), (83, 34), (81, 48), (18, 59), (2, 49)], bronze, ink)
    d.polygon([(4, 32), (62, 24), (78, 34), (18, 46)], oak, brass)
    for i in range(4):
        paste(im, card("ace", "hearts"), (17 + i * 2, 25 - i), (32, 19), 8)
    d.polygon([(2, 36), (18, 47), (82, 35), (81, 48), (18, 59), (2, 49)], bronze, ink)
    d.line((18, 48, 80, 36), brass, 2)
    plaque(im, (41, 44, 56, 52), "F")
    for x in [14, 59]:
        d.rectangle((x, 27 - x // 14, x + 6, 29 - x // 14), brass)


def sticker(im, d, f):
    d.polygon(
        [
            (1, 0),
            (42, 1),
            (43, 15),
            (33, 28),
            (2, 29),
            (0, 25),
            (2, 21),
            (0, 17),
            (2, 13),
            (0, 9),
        ],
        orange,
        oak,
    )
    d.line((4, 4, 40, 4), wine)
    label(im, "1 F", 20, 7, ink, "didone", 25)
    moustache(d, 13, 22, oak)
    d.polygon([(31, 27), (32 + f, 17 - f), (42, 16)], light, bronze)


def credit(im, d, f):
    d.rounded_rectangle((0, 0, 87, 53), 4, buff, ink)
    d.rounded_rectangle((2, 2, 85, 50), 3, cream, wood)
    d.rectangle((5, 5, 82, 24), pine)
    moustache(d, 16, 15, gold)
    label(im, "TABAC", 53, 8, light, "didone", 35)
    label(im, "CARTE DE FIDELITE", 43, 26, wood)
    for i in range(6):
        x = 8 + i * 13
        if i < 5:
            d.ellipse((x, 36, x + 8, 44), tan)
            d.ellipse((x + 1, 37, x + 7, 43), clear)
        else:
            for a in range(8):
                t = (a + f * 0.25) * math.pi / 4
                d.point(
                    (x + 4 + round(4 * math.cos(t)), 40 + round(4 * math.sin(t))), wine
                )


def trophy(im, d, f):
    d.ellipse((2, 20, 24, 46), brass, oak, 2)
    d.ellipse((6, 24, 21, 40), clear, light)
    d.polygon([(40, 21), (52, 20), (55, 24), (52, 26), (49, 24), (42, 27)], brass, oak)
    d.polygon(
        [
            (10, 20),
            (45, 20),
            (41, 40),
            (34, 49),
            (30, 51),
            (31, 60),
            (39, 65),
            (39, 69),
            (17, 69),
            (17, 65),
            (25, 60),
            (26, 51),
            (18, 45),
        ],
        brass,
        oak,
    )
    d.polygon([(14, 23), (20, 24), (24, 43), (27, 48), (20, 43)], light)
    d.polygon([(32, 23), (42, 22), (39, 40), (31, 48)], bronze)
    d.ellipse((9, 17, 46, 24), gold, oak)
    portrait(im, 19, 0, 18, 20)
    d.polygon([(13, 68), (42, 68), (48, 83), (46, 87), (8, 87), (7, 83)], soot, ink)
    plaque(im, (10, 73, 44, 82), "10E PLACE")
    gleam(d, 18 + f * 3, 30 + f * 2)


def gallery(im, d, f):
    d.polygon(
        [
            (0, 16),
            (8, 16),
            (8, 10),
            (35, 10),
            (40, 4),
            (66, 4),
            (66, 0),
            (79, 0),
            (79, 80),
            (68, 80),
            (64, 86),
            (4, 87),
        ],
        wine,
        ox,
    )
    for x in range(11, 73, 10):
        for y in range(20, 76, 12):
            d.polygon([(x, y), (x + 2, y - 4), (x + 4, y), (x + 2, y + 4)], red)
    d.line((3, 18, 76, 10), brass, 2)
    for rank, s, x, y in [("J", "H", 3, 34), ("Q", "D", 24, 17), ("K", "S", 47, 39)]:
        d.line([(x + 5, y), (x + 14, y - 6), (x + 23, y)], oak)
        d.rectangle((x, y, x + 29, y + 37), bronze, ink)
        d.rectangle((x + 1, y + 1, x + 28, y + 36), gold, brass)
        d.rectangle((x + 3, y + 3, x + 26, y + 34), pine, oak)
        paste(im, atlas("cards")[f"court/{rank}/{s}"], (x + 4, y + 5), (22, 28))
        for dx in [2, 26]:
            for dy in [2, 34]:
                d.point((x + dx, y + dy), light)
        if rank == "K":
            d.rectangle((x + 14, y + 18, x + 16, y + 18 + f % 3), pink)
        if rank == "J":
            moustache(d, x + 14, y + 18, ink)


def sorter(im, d, f):
    d.polygon([(0, 8), (62, 0), (71, 4), (71, 61), (63, 71), (0, 69)], sky, navy)
    d.rounded_rectangle((3, 4, 68, 68), 3, bronze, ink)
    for i, s in enumerate("SHDC"):
        x = 7 + i % 2 * 29
        y = 8 + i // 2 * 28
        d.rectangle((x, y, x + 27, y + 25), oak, brass)
        for k in range(3):
            xx = x + 3 + 2 * k + (f % 2 if i == 1 and k == 2 else 0)
            d.rectangle((xx, y + 6 - k, xx + 15, y + 23 - k), cream, tan)
        pip(im, s, (xx + 3, y + 7), (10, 12), ink if s in "SC" else red)
    d.line((10, 59, 13, 61), tan)
    d.point((15, 63), cream)


def bag(im, d, f):
    d.polygon(
        [(0, 16), (13, 6), (53, 0), (65, 10), (64, 77), (49, 88), (4, 86)], blue, navy
    )
    d.polygon([(5, 18), (30, 10), (30, 44), (5, 51)], sky)
    d.polygon([(35, 9), (59, 6), (59, 36), (35, 43)], sky)
    x = f % 3
    p = [
        (7 + x, 14),
        (57 + x, 12),
        (58, 26),
        (54 + x, 50),
        (60, 76),
        (53, 84),
        (12 + x, 80),
        (6, 72),
        (10 + x, 43),
    ]
    d.line(p + [p[0]], cream, 2)
    d.line((9 + x, 19, 56 + x, 17), pink, 2)
    d.line((10 + x, 22, 55 + x, 20), buff)
    d.polygon([(15 + x, 34), (48 + x, 30), (47 + x, 40), (17 + x, 43)], cream)
    label(im, "A JETER", 31 + x, 34, blue)
    for pts in [
        [(9, 71), (19 + x, 64), (15, 58)],
        [(54, 48), (48 + x, 54), (57, 70)],
        [(13, 26), (17 + x, 29)],
        [(15, 76), (27, 73), (43, 78)],
    ]:
        d.line(pts, sky, 2)
    d.polygon([(35, 72), (37, 68), (41, 71), (39, 74)], gold, bronze)


def uv(im, d, f):
    d.polygon(
        [(0, 7), (8, 1), (56, 0), (63, 7), (61, 75), (52, 87), (4, 84)], navy, ink
    )
    d.polygon([(5, 16), (58, 12), (53, 73), (9, 82)], plum)
    d.rounded_rectangle((5, 5, 58, 14), 3, ink, blue)
    d.line((11, 9, 52, 9), lilac if f != 2 else violet, 3)
    d.polygon([(12, 26), (46, 21), (54, 69), (19, 77)], violet, lilac)
    d.polygon([(14, 27), (45, 23), (51, 67), (20, 74)], plum)
    for x, y in [(20, 30), (34, 29), (25, 57), (39, 55)]:
        pip(im, "D", (x, y), (8, 10), lilac if f != 2 else violet)
    moustache(d, 32, 47, violet)
    d.line((8, 80, 47, 78), blue)


def apron(im, d, f):
    d.polygon(
        [
            (4, 8),
            (17, 8),
            (17, 2),
            (47, 2),
            (47, 10),
            (61, 10),
            (61, 48),
            (53, 48),
            (53, 57),
            (4, 57),
        ],
        buff,
        tan,
    )
    for x in (6, 22, 38, 54):
        for y in (12, 26, 40):
            d.rectangle((x, y, min(60, x + 14), y + 12), cream)
    d.arc((27, 0, 38, 13), 15, 240, ink, 2)
    d.line([(21, 26), (26, 10), (33, 8), (39, 12), (45, 28)], wine, 4)
    for x, s in [(14, -1), (50, 1)]:
        d.line(
            [
                (x, 48),
                (x + 8 * s, 42),
                (x + 11 * s, 49),
                (x + 7 * s, 54),
                (x, 49),
                (x + 12 * s, 58 + f % 3),
            ],
            wine,
            3,
        )
    d.polygon(
        [
            (21, 22),
            (44, 22),
            (44, 35),
            (51, 45),
            (57, 86),
            (48, 91),
            (10, 88),
            (12, 57),
            (15, 43),
            (21, 34),
        ],
        cream,
        ink,
    )
    d.line([(23, 25), (41, 25), (42, 35)], buff, 2)
    for x in (17, 23, 43, 49):
        d.line((x, 65, x - 3, 85), buff)
    d.rectangle((23, 52, 44, 68), wine, ox)
    d.line((37, 52, 42, 43), white, 3)
    d.point((42, 43), red)
    label(im, "BON", 33, 55, light)
    label(im, "APPETIT", 33, 61, light, width=20)
    for x, y in [(14, 79), (46, 76), (49, 82)]:
        d.ellipse((x, y, x + 3, y + 2), wood)


def badge(im, d, f):
    d.polygon([(3, 2), (53, 2), (53, 38), (31, 29), (3, 39)], wine, ox)
    for x in (7, 47):
        d.line((x, 4, x, 32), brass, 2)
    d.polygon(
        [(9, 0), (17, 0), (31, 37), (41, 0), (49, 0), (34, 46), (26, 46)], blue, navy
    )
    d.line([(13, 0), (29, 40), (45, 0)], sky, 2)
    d.ellipse((26, 36, 34, 48), brass, oak)
    tile = Image.new("RGBA", (46, 49))
    q = ImageDraw.Draw(tile)
    q.rounded_rectangle((0, 0, 45, 48), 3, sky, ink)
    q.rounded_rectangle((2, 2, 43, 46), 2, cream, white)
    q.rectangle((6, 8, 39, 30), blue)
    portrait(tile, 26, 12, 11, 15)
    paste(tile, atlas("duel")["mask/fox/front"], (10, 8), (20, 22))
    q.rectangle((4, 32, 41, 41), ox)
    label(tile, "JOUEUR", 23, 34, cream)
    q.line((11, 43, 34, 43), tan)
    paste(im, tile, (4, 44), tile.size, [-5, -2, 3, 0][f])


def platter(im, d, f):
    poly = [(1, 16), (52, 1), (82, 15), (78, 39), (83, 49), (38, 63), (2, 50), (7, 32)]
    cloth = Image.new("RGBA", im.size)
    pen = ImageDraw.Draw(cloth)
    pen.polygon(poly, cream)
    mask = cloth.getchannel("A")
    for x in range(-60, 85, 11):
        pen.line((x, 0, x + 35, 64), pink, 5)
    for y in range(-10, 96, 10):
        pen.line((0, y, 84, y - 24), red, 4)
    cloth.putalpha(mask)
    im.alpha_composite(cloth)
    d.ellipse((3, 8, 79, 55), buff, ink)
    d.ellipse((4, 6, 79, 51), cream, white, 2)
    d.ellipse((8, 10, 75, 47), white, blue)
    for x, y in [(38, 14), (47, 15), (53, 20), (42, 24), (54, 27)]:
        d.ellipse((x, y, x + 14, y + 11), pink, wine)
        for dx, dy in [(3, 3), (7, 7), (10, 4)]:
            d.point((x + dx, y + dy), cream)
    moustache(d, 52, 30, wine)
    for i in range(3):
        x = 14 + i * 5
        y = 18 + i * 3
        d.polygon(
            [(x, y), (x + 13, y - 4), (x + 17, y + 10), (x + 4, y + 14)], gold, bronze
        )
        pip(im, "H", (x + 5, y + 2), (6, 6), bronze)
    d.ellipse((34 + f, 35, 44 + f, 40), jade, pine)
    d.line((37 + f, 37, 39 + f, 36), mint)


def monocle(im, d, f):
    d.line([(41, 34), (49, 35), (52, 42), (48 + f, 51), (53, 55), (56, 50)], oak, 3)
    for i in range(7):
        x = [43, 48, 50, 49, 48 + f, 51, 54][i]
        y = [34, 36, 40, 44, 48, 52, 51][i]
        d.ellipse((x, y, x + 3, y + 5), brass, oak)
        d.point((x + 1, y + 1), light)
    d.ellipse((0, 0, 48, 48), brass, oak, 2)
    d.ellipse((4, 3, 45, 44), felt, light)
    d.polygon(
        [(6, 21), (21, 7), (37, 6), (43, 18), (42, 30), (31, 41), (15, 40)], cream, wood
    )
    pip(im, "S", (12, 12), (23, 26), ink)
    d.arc((20, 22, 37, 30), 195, 342, tan)
    d.point((28, 25), buff)
    d.arc((2, 2, 46, 46), 128, 228, gold, 2)
    gleam(d, 7 + f * 2, 12 - f)


def torch(im, d, f):
    d.polygon(
        [
            (0, 43),
            (12, 43),
            (12, 26),
            (41, 26),
            (41, 17),
            (60, 17),
            (63, 85),
            (51, 85),
            (49, 98),
            (2, 98),
        ],
        soot,
        ink,
    )
    for x in (4, 21, 38):
        for y in (45, 61, 77):
            d.rectangle((x, y, x + 15, y + 14), wood if y > 60 else soot, ink)
    portrait(im, 44, 19, 17, 23)
    d.line((46, 32, 37, 26), cream, 2)
    d.point((37, 26), orange)
    d.rounded_rectangle((13, 52, 42, 99), 6, blue, ink, 2)
    d.rectangle((16, 60, 20, 92), sky)
    d.rectangle((35, 57, 39, 93), navy)
    d.ellipse((11, 93, 44, 103), navy, ink)
    d.line((15, 96, 39, 96), sky)
    d.rounded_rectangle((17, 44, 36, 57), 3, brass, oak)
    d.polygon(
        [
            (20, 45),
            (21, 34),
            (28, 28),
            (33, 16),
            (40, 19),
            (37, 35),
            (30, 40),
            (30, 45),
        ],
        tan,
        ink,
    )
    d.line((24, 36, 32, 29), cream, 2)
    d.ellipse((11, 42, 23, 51), red, ink)
    d.line((13, 47, 20, 46), pink)
    d.rectangle((15, 65, 40, 82), cream, oak)
    label(im, "GAZ", 28, 68, red, "sans")
    d.polygon(
        [(32, 18), (33, 10), (39, 10 - f), (45 + f, 1), (45, 11), (42, 17), (38, 21)],
        orange,
    )
    d.polygon([(34, 17), (38, 12), (42 + f, 6), (40, 15), (37, 20)], light)
    d.line((33, 17, 38, 19), sky, 2)


def triptych(im, d, f):
    for x, y, w, h in [(0, 18, 28, 57), (24, 0, 52, 79), (73, 20, 26, 55)]:
        d.polygon(
            [
                (x, y + h),
                (x, y + 15),
                (x + 4, y + 10),
                (x + w // 2, y),
                (x + w - 3, y + 10),
                (x + w, y + 15),
                (x + w, y + h),
            ],
            bronze,
            ink,
        )
        d.polygon(
            [
                (x + 3, y + h - 3),
                (x + 3, y + 16),
                (x + w // 2, y + 4),
                (x + w - 3, y + 16),
                (x + w - 3, y + h - 3),
            ],
            gold,
            oak,
        )
        d.polygon(
            [
                (x + 6, y + h - 8),
                (x + 6, y + 18),
                (x + w // 2, y + 9),
                (x + w - 6, y + 18),
                (x + w - 6, y + h - 8),
            ],
            wine,
            bronze,
        )
        for xx in (x + 2, x + w - 4):
            d.line((xx, y + 18, xx, y + h - 6), light)
            d.rectangle((xx - 1, y + h - 7, xx + 2, y + h - 4), brass)
        for i in range(3):
            d.point((x + w // 2 - 2 + i * 2, y + 13), gold)
    # gilded ribs, punched stars, hinges and the scalloped predella
    for x, y, w, h in [(0, 18, 28, 57), (24, 0, 52, 79), (73, 20, 26, 55)]:
        mid = x + w // 2
        for dx in range(-w // 2 + 8, w // 2 - 6, 6):
            d.line((mid, y + 11, mid + dx, y + 23 + abs(dx) // 2), bronze)
        for yy in range(y + 25, y + h - 13, 8):
            for xx in range(x + 8, x + w - 7, 7):
                d.point((xx + (yy % 3), yy), brass)
        for xx in range(x + 6, x + w - 5, 5):
            d.arc((xx, y + h - 6, xx + 4, y + h - 2), 0, 180, bronze)
    for x in (24, 73):
        for y in (39, 58):
            d.rectangle((x - 2, y, x + 2, y + 4), bronze, oak)
            d.line((x, y + 1, x, y + 3), light)
    d.ellipse((43, 12, 56, 25), brass, bronze)
    pip(im, "D", (46, 14), (8, 9), wine)
    for x in (6, 13):
        paste(im, card("2", "hearts"), (x, 39), (10, 16))
    for i, r in enumerate(["9", "10", "jack", "queen", "king"]):
        paste(im, card(r, "spades"), (32 + i * 5, 36 - i * 2), (15, 24))
    for i in range(3):
        pip(im, "H", (79 + i * 2, 32 + i * 9), (8, 8), pink)
    portrait(im, 4, 58, 11, 13)
    for x, y in [(19, 59), (64, 58), (91, 61)]:
        d.rectangle((x, y, x + 2, y + 8), cream)
        d.line((x + 1, y - 1, x + 1 + f % 2, y - 4), light)
    gleam(d, 46 + f * 3, 13 + f)


def slab(im, d, f):
    # The shared card atlas doesn't have slab/case yet. Keep the card aperture clear.
    d.rounded_rectangle((0, 0, 71, 105), 4, sky, navy)
    d.rounded_rectangle((2, 2, 69, 103), 3, buff, white)
    d.rectangle((4, 18, 67, 105), clear)
    d.line((0, 19, 0, 99), blue)
    for x in (1, 69):
        for i, c in enumerate((violet, sky, jade, gold, pink)):
            y = 21 + f * 12 + i * 2
            d.line((x, y, x + 1, y + 6), c)


def slab_label():
    im = Image.new("RGBA", (64, 12), cream)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 63, 11), outline=red)
    label(im, "GEM MINT 10", 26, 3, ink)
    d.line([(48, 8), (51, 4), (50, 8), (54, 4), (53, 8), (61, 6)], blue)
    return im


def silver(im, d, f):
    d.polygon(
        [(0, 13), (10, 4), (35, 0), (46, 7), (47, 78), (39, 87), (4, 85)], ox, oak
    )
    d.polygon([(3, 16), (37, 5), (43, 11), (43, 78), (9, 82)], wine)
    d.rounded_rectangle((6, 12, 42, 79), 4, sky, ink)
    paste(im, card("ace", "clubs"), (12, 10), (28, 65))
    d.polygon([(4, 16), (32, 10), (36, 14), (34, 73), (30, 78), (4, 81)], buff, navy)
    d.polygon([(7, 18), (29, 14), (31, 16), (29, 73), (8, 77)], cream, tan)
    for x in range(10, 29, 3):
        d.line((x, 20, x - 1, 72), buff)
    d.ellipse((10, 34, 28, 53), buff, tan)
    label(im, "MB", 19, 39, wood, "sans")
    d.line((4, 21, 4, 72), sky)
    gleam(d, 28 - f * 2, 20 + f * 13, white)


def roller(im, d, f):
    d.polygon(
        [
            (0, 18),
            (9, 13),
            (10, 4),
            (25, 0),
            (49, 3),
            (62, 16),
            (63, 95),
            (55, 103),
            (5, 102),
        ],
        navy,
        ink,
    )
    for x in (5, 53):
        d.polygon([(x, 16), (x + 6, 10), (x + 5, 43), (x, 54)], ox)
    d.line((45, 4, 45, 14), brass)
    d.arc((33, 8, 57, 22), 0, 180, brass, 2)
    for x in (35, 40, 50, 55):
        d.line((x, 15, x, 11), light)
    portrait(im, 47, 40, 14, 21)
    d.rectangle((48, 58, 60, 69), cream, wood)
    label(im, "TAB", 54, 61, wood)
    d.polygon(
        [
            (15, 55),
            (30, 49),
            (41, 53),
            (47, 72),
            (51, 98),
            (35, 101),
            (31, 84),
            (24, 102),
            (9, 99),
            (15, 76),
            (7, 67),
        ],
        ink,
        soot,
    )
    d.polygon([(19, 52), (29, 54), (26, 72), (16, 59)], sky)
    d.polygon([(31, 53), (38, 53), (39, 62), (28, 75)], blue)
    d.polygon([(23, 53), (33, 53), (28, 67)], white)
    d.polygon([(23, 53), (28, 55), (33, 52), (32, 58), (28, 56), (24, 59)], red)
    for x, y in [(26, 68), (26, 72), (25, 76)]:
        d.point((x, y), gold)
    d.arc((29, 65, 41, 76), 10, 160, brass)
    d.line((14, 85, 11, 97), soot)
    d.line((37, 88, 41, 98), soot)
    for x, y in [(12, 75), (36, 76)]:
        d.polygon([(x, y), (x + 9, y + 2), (x + 7, y + 12), (x + 2, y + 9)], cream, tan)
    d.polygon(
        [(17, 56), (12, 65), (4, 55), (2, 44), (7, 40), (11, 46), (9, 51)], soot, ink
    )
    d.ellipse((2, 36, 11, 46), buff, wood)
    d.ellipse((2, 30, 13, 40), gold, bronze, 2)
    gleam(d, 4 + f, 32)
    paste(im, atlas("duel")["mask/fox/front"], (17, 27), (22, 25))
    hat = Image.new("RGBA", (33, 24))
    p = ImageDraw.Draw(hat)
    p.polygon([(5, 1), (27, 0), (25, 18), (8, 18)], ink, soot)
    p.rectangle((8, 14, 25, 18), wine)
    p.line((9, 3, 8, 12), blue, 2)
    p.ellipse((0, 17, 32, 22), ink, soot)
    paste(im, hat, (12, 10), hat.size, [0, 3, 7, 3][f])


OBJECTS = [
    ("penny_sleeve", 64, 88, penny),
    ("top_loader", 64, 98, loader),
    ("rubber_band", 56, 56, ball),
    ("binder_divider", 64, 88, divider),
    ("card_stack", 72, 96, stack),
    ("straight_edge", 30, 100, ruler),
    ("color_binder", 92, 66, pockets),
    ("draft_chaff", 62, 58, chaff),
    ("low_ball", 64, 44, low),
    ("odd_lot", 60, 84, odd),
    ("even_stack", 64, 64, chips),
    ("playmat", 100, 56, mat),
    ("deck_box", 84, 60, box),
    ("price_sticker", 44, 30, sticker),
    ("store_credit", 88, 54, credit),
    ("participation_trophy", 56, 88, trophy),
    ("face_binder", 80, 88, gallery),
    ("suit_sorter", 72, 72, sorter),
    ("team_bag", 66, 90, bag),
    ("black_light", 64, 88, uv),
    ("card_sleeves", 66, 92, apron),
    ("tournament_badge", 58, 100, badge),
    ("combo_platter", 84, 64, platter),
    ("specialist", 58, 58, monocle),
    ("forge_hammer", 64, 104, torch),
    ("triple_threat", 100, 80, triptych),
    ("psa_slab", 72, 106, slab),
    ("thin_binder", 48, 88, silver),
    ("high_roller", 64, 104, roller),
]
