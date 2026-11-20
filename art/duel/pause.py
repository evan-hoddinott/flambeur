"""The pause menu's art: the felt panel with its leather rail, the small stub tickets, tab icons, keycaps."""
from PIL import Image, ImageDraw

INK, DARK = "#0e0b0a", "#1c1513"
FELT, FELT_LO, FELT_HI, FELT_DEEP = "#174034", "#0f2a20", "#1f5a46", "#0f2a20"
RAIL, RAIL_HI, RAIL_LO, RAIL_DEEP = "#7a1a2c", "#a82a38", "#4e1020", "#2a0910"
BRASS, GOLD, EDGE, SHINE = "#c99a3a", "#e8c260", "#9c7028", "#fff0b0"
CREAM, PAPER, FOLD = "#f6ecd2", "#e3d2a8", "#bfa77e"
# tinted sprites are drawn in the greyscale steps and multiplied by a color in code
W_, L_, M_ = "#ffffff", "#d0d0d0", "#a0a0a0"

# nine-slice centers, merged into the slices by build.py
CENTERS = {
    "pause/panel": (12, 12, 24, 24),
    "hud/stub/face": (7, 0, 13, 13),
    "hud/stub/plinth": (7, 0, 13, 13),
    "pause/key": (3, 2, 6, 7),
    "pause/groove": (3, 3, 6, 1),
}

# the tab icons, 9×9, white so code can tint them to the label's color
ICONS = {
    "sound": [
        "....X....",
        "...XX..X.",
        "XXXXX...X",
        "XXXXX.X.X",
        "XXXXX.X.X",
        "XXXXX.X.X",
        "XXXXX...X",
        "...XX..X.",
        "....X....",
    ],
    "game": [
        "XXXXXXXX.",
        "X......XX",
        "X.X..X.XX",
        "X......XX",
        "X..XX..XX",
        "X......XX",
        "X.X..X.XX",
        "X......XX",
        "XXXXXXXXX",
    ],
    "display": [
        "XXXXXXXXX",
        "X.......X",
        "X.......X",
        "X.......X",
        "X.......X",
        "XXXXXXXXX",
        "....X....",
        "...XXX...",
        "..XXXXX..",
    ],
    "access": [
        ".........",
        "..XXXXX..",
        ".X.....X.",
        "X...XX..X",
        "X..XXXX.X",
        "X...XX..X",
        ".X.....X.",
        "..XXXXX..",
        ".........",
    ],
    "keys": [
        ".XXX.....",
        "X...X....",
        "X...XXXXX",
        "X...X.X.X",
        ".XXX..X.X",
        ".........",
        ".........",
        ".........",
        ".........",
    ],
    "credits": [
        "....X....",
        "....X....",
        "...XXX...",
        "XXXXXXXXX",
        ".XXXXXXX.",
        "..XXXXX..",
        "..XX.XX..",
        ".XX...XX.",
        ".X.....X.",
    ],
}


def panel():
    # the card table in miniature: a padded leather rail around a felt bed, a brass line where they meet
    im = Image.new("RGBA", (48, 48))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, 47, 47), 4, RAIL, INK)
    d.rounded_rectangle((1, 1, 46, 46), 3, None, RAIL_HI)  # light on the rail's top edge
    d.line((3, 46, 44, 46), RAIL_LO)
    d.line((46, 3, 46, 44), RAIL_LO)
    d.line((3, 45, 44, 45), RAIL_LO)
    d.rectangle((7, 7, 40, 40), RAIL_DEEP)  # the tuck where the leather folds under
    d.rectangle((8, 8, 39, 39), EDGE)
    d.line((8, 8, 39, 8), BRASS)
    d.line((8, 8, 8, 39), BRASS)
    d.rectangle((9, 9, 38, 38), FELT)
    d.line((9, 9, 38, 9), FELT_DEEP)  # the rail's shadow on the felt
    d.line((9, 9, 9, 38), FELT_DEEP)
    d.line((10, 10, 37, 10), FELT_LO)
    # a brass stud in each corner
    for x, y in ((2, 2), (41, 2), (2, 41), (41, 41)):
        stud(d, x, y)
    return im


def stud(d, x, y):
    d.rectangle((x, y + 1, x + 4, y + 3), EDGE)
    d.rectangle((x + 1, y, x + 3, y + 4), EDGE)
    d.rectangle((x + 1, y + 1, x + 3, y + 3), BRASS)
    d.point((x + 1, y + 1), SHINE)
    d.point((x + 2, y + 1), GOLD)
    d.point((x + 1, y + 2), GOLD)
    d.point((x + 3, y + 4), RAIL_DEEP)
    d.point((x + 4, y + 3), RAIL_DEEP)


def stud_sprite():
    im = Image.new("RGBA", (5, 5))
    stud(ImageDraw.Draw(im), 0, 0)
    return im


def felt_tile():
    # sparse nap for the felt bed, tiled by code (a stretched nine-slice center can't carry a texture)
    im = Image.new("RGBA", (16, 16), FELT)
    d = ImageDraw.Draw(im)
    d.point([(2, 3), (11, 1), (6, 9), (14, 12), (9, 14), (1, 12)], FELT_HI)
    d.point([(7, 2), (13, 7), (3, 7), (10, 11)], FELT_LO)
    return im


def stub(face):
    # the bet ticket cut down to a 13 px stub: one pair of punch holes, a tear line, the notch on the right
    w, h = 24, 13
    im = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w - 1, h - 1), W_)
    if face:
        d.line((0, h - 2, w - 1, h - 2), L_)
        d.line((0, h - 1, w - 1, h - 1), M_)
        for y in (3, 7):
            d.rectangle((2, y, 3, y + 1), (0, 0, 0, 0))
        for y in range(2, h - 3, 2):
            d.point((5, y), M_)
    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        im.putpixel((x, y), (0, 0, 0, 0))
    for y in (5, 6, 7):
        im.putpixel((w - 1, y), (0, 0, 0, 0))
    im.putpixel((w - 2, 6), (0, 0, 0, 0))
    return im


def key():
    # a keycap: cream top, the skirt in shadow below
    im = Image.new("RGBA", (12, 13))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, 11, 12), 2, FOLD, INK)
    d.rectangle((1, 1, 10, 9), PAPER)
    d.rectangle((2, 1, 9, 8), CREAM)
    d.line((1, 10, 10, 10), "#8c7656")
    d.line((2, 11, 9, 11), "#5c4a36")
    return im


def groove():
    # the slot a slider runs in, sunk into the felt
    im = Image.new("RGBA", (12, 7))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, 11, 6), 2, DARK, INK)
    d.line((2, 1, 9, 1), INK)
    d.line((2, 6, 9, 6), FELT_HI)
    return im


def knob():
    # the slider's knob: a red jeton face-on, cream edge spots, a gold inlay, its shadow on the felt
    rows = [
        "....kkkkk....",
        "..kkrcccrkk..",
        ".krrrrcrrrrk.",
        ".krrdddddrrk.",
        "kcrdggggddrck",
        "kcrdgsggddrck",
        "kcrdggggddrck",
        "krrddgggddrrk",
        ".krrdddddrrk.",
        ".krrrrcrrrrk.",
        "..kkrcccrkk..",
        "...xkkkkkx...",
        "....xxxxx....",
    ]
    colors = {"k": INK, "r": RAIL_HI, "c": CREAM, "d": RAIL, "g": GOLD, "s": SHINE, "x": FELT_LO}
    im = Image.new("RGBA", (13, 13))
    d = ImageDraw.Draw(im)
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c in colors:
                d.point((x, y), colors[c])
    return im


def icon(rows):
    im = Image.new("RGBA", (9, 9))
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c == "X":
                im.putpixel((x, y), (255, 255, 255, 255))
    return im


def flourish():
    # under the title: a brass rule with a diamond in the middle
    im = Image.new("RGBA", (61, 5))
    d = ImageDraw.Draw(im)
    d.line((0, 2, 25, 2), EDGE)
    d.line((35, 2, 60, 2), EDGE)
    d.line((6, 2, 25, 2), BRASS)
    d.line((35, 2, 54, 2), BRASS)
    d.polygon([(30, 0), (34, 2), (30, 4), (26, 2)], GOLD, EDGE)
    d.point((30, 1), SHINE)
    for x in (22, 38):
        d.point((x, 1), BRASS)
        d.point((x, 3), BRASS)
    return im


def parts():
    out = {
        "pause/panel": panel(),
        "pause/stud": stud_sprite(),
        "pause/felt": felt_tile(),
        "pause/key": key(),
        "pause/groove": groove(),
        "pause/flourish": flourish(),
        "pause/knob": knob(),
        "hud/stub/face": stub(True),
        "hud/stub/plinth": stub(False),
    }
    for name, rows in ICONS.items():
        out["icon/pause/" + name] = icon(rows)
    return out

