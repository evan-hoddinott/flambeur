"""Paper, leather and fire used in the table animations."""

from math import cos, sin, tau
from random import Random
from PIL import Image, ImageDraw

INK, DARK, BRASS, GOLD = "#1c1513", "#3d2a10", "#9c7028", "#e8c260"
PAPER, CREAM, FOLD = "#e3d2a8", "#f6ecd2", "#bfa77e"


def parts():
    out = {}

    def surface(name, w, h):
        im = Image.new("RGBA", (w, h))
        out[name] = im
        return ImageDraw.Draw(im)

    for name, w, h in [
        ("peek", 34, 122),
        ("leaf", 268, 266),
        ("back", 268, 266),
        ("dock", 196, 296),
    ]:
        d = surface("drawer/" + name, w, h)
        d.rounded_rectangle((0, 0, w - 1, h - 1), 5, "#4e1020", INK)
        d.rounded_rectangle((2, 2, w - 3, h - 3), 4, outline="#7a1a2c")
        rng = Random(18)
        for _ in range(w * h // 30):
            x, y = rng.randrange(4, w - 5), rng.randrange(4, h - 5)
            d.line((x, y, x + 2, y - 1), "#2a0910")
        for x in range(6, w - 7, 5):
            for y in (4, h - 5):
                d.line((x, y, x + 2, y), BRASS)
        for y in range(7, h - 7, 5):
            for x in (4, w - 5):
                d.line((x, y, x, y + 2), BRASS)
        if name in ("leaf", "dock"):
            d.rounded_rectangle((7, 7, w - 8, h - 8), 3, FOLD, DARK)
            d.rounded_rectangle((10, 9, w - 10, h - 11), 2, PAPER, "#8c7656")
        elif name == "back":
            x, y = w // 2, h // 2
            d.polygon(
                [(x, y - 18), (x + 14, y), (x, y + 18), (x - 14, y)], outline=BRASS
            )
            d.line([(x - 4, y + 7), (x - 4, y - 7), (x + 5, y - 7)], GOLD, 2)
            d.line((x - 4, y, x + 2, y), BRASS, 2)
        else:
            d.line((w - 8, 4, w - 8, h - 4), INK, 2)
    for tab, ink in [
        ("etui", "#a82a38"),
        ("classeur", "#28497a"),
        ("sleeve", "#c99a3a"),
        ("vitrine", "#5c8f2a"),
        ("carnet", "#d04a4e"),
    ]:
        d = surface("drawer/tab/" + tab, 46, 21)
        d.polygon([(0, 0), (41, 0), (45, 4), (45, 17), (42, 20), (0, 20)], PAPER, DARK)
        d.line((3, 1, 39, 1), CREAM)
        d.line((41, 5, 41, 15), ink, 4)
        d.line((3, 18, 38, 18), FOLD)
    d = surface("drawer/parcel", 14, 11)
    d.polygon([(0, 3), (4, 0), (13, 2), (13, 9), (9, 10), (0, 9)], FOLD, DARK)
    d.line([(3, 1), (9, 4), (9, 10)], CREAM)
    d.line([(0, 6), (9, 7), (13, 5)], BRASS)
    d = surface("fiche/pin", 9, 13)
    d.line((4, 5, 2, 12), INK, 2)
    d.ellipse((0, 1, 8, 8), BRASS, DARK)
    d.ellipse((1, 0, 7, 6), GOLD, DARK)
    d.line((2, 2, 4, 1), CREAM)
    for name, w, h in [("ball", 24, 22), ("half", 64, 52)]:
        d = surface("rules/" + name, w, h)
        points = [
            (2, h // 4),
            (w // 3, 1),
            (w * 2 // 3, 3),
            (w - 2, h // 4),
            (w - 4, h * 3 // 4),
            (w // 2, h - 1),
            (3, h * 4 // 5),
        ]
        d.polygon(points, PAPER, INK)
        for i in (0, 2, 4):
            d.polygon([points[i], (w // 2, h // 2), points[i + 1]], FOLD)
            d.line([points[i], (w // 2, h // 2), points[i + 1]], CREAM)
        for i in range(3):
            d.line((w // 4, h // 2 + i * 3, w // 2 - 2, h // 2 + i * 3 - 2), "#8c7656")
    d = surface("rules/sheet", 572, 332)
    d.rounded_rectangle((0, 0, 571, 331), 4, PAPER, INK)
    for x in (143, 286, 429):
        d.line((x, 2, x, 329), FOLD)
        d.line((x + 1, 2, x + 1, 329), CREAM)
    for y in (110, 221):
        d.line((2, y, 569, y), FOLD)
        d.line((2, y + 1, 569, y + 1), CREAM)
    for y in range(8, 325, 13):
        d.ellipse((4, y, 7, y + 3), FOLD)
    d = surface("fx/receipt", 32, 32)
    d.rectangle((0, 0, 31, 27), CREAM)
    for x in range(0, 32, 4):
        d.polygon([(x, 26), (x + 3, 26), (x + 1, 31)], CREAM)
    for i in range(4):
        d = surface(f"fx/flame/{i + 1}", 24, 20)
        for j in range(5):
            x = j * 5
            y = 2 + (j * 7 + i * 3) % 10
            d.polygon(
                [(x, 19), (x + 1, 11), (x + 4, y), (x + 5, 12), (x + 7, 19)], "#e8501a"
            )
            d.polygon([(x + 1, 19), (x + 4, y + 5), (x + 5, 19)], "#ffb03a")
    for i in range(3):
        d = surface(f"fx/ember/{i + 1}", 5, 5)
        d.line((1, 4, 3, i), "#ff7a24", 2)
        d.point((2, 3), GOLD)
    d = surface("fx/spark", 3, 3)
    d.line((1, 0, 1, 2), CREAM)
    d.line((0, 1, 2, 1), GOLD)
    d = surface("fx/rays", 96, 96)
    for i in range(13):
        a = tau * i / 13
        d.polygon(
            [
                (48, 48),
                (48 + 47 * cos(a), 48 + 47 * sin(a)),
                (48 + 44 * cos(a + 0.16), 48 + 44 * sin(a + 0.16)),
            ],
            GOLD if i % 2 else CREAM,
        )
    d = surface("fx/leak", 160, 360)
    rng = Random(21)
    for y in range(360):
        for x in range(160):
            distance = abs(x - 60 - y * 0.08) / 70
            if rng.random() > distance**0.6:
                d.point(
                    (x, y),
                    CREAM
                    if distance < 0.12
                    else GOLD
                    if distance < 0.45
                    else "#e8501a",
                )
    return out
