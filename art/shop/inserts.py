"""The scratchers' prizes: the insert cards you hold beside your hand, and their back."""
import math

from PIL import Image, ImageColor, ImageDraw

INK = "#1c1513"
PAPER = "#f6ecd2"
EDGE = "#bfa77e"
GOLD = "#e8c260"
RED = "#7a1a2c"
LIGHT = "#fff0b0"
COLORS = {
    "code": RED, "checklist": "#3a8040", "wishlist": "#7a4ab0", "grail": GOLD,
    "stylo": "#28497a", "broyeuse": "#43342e", "photocopie": "#3e9ab0",
    "reprint": "#9c7028", "foilwrap": GOLD, "holo": "#9a6ad0", "prism": "#e8501a",
    "tampon": RED, "allumettes": "#a82a38",
}


def emblem(key):
    im = Image.new("RGBA", (16, 16))
    d = ImageDraw.Draw(im)
    c = COLORS[key]
    if key == "stylo":
        d.polygon([(1,14),(3,9),(11,1),(14,4),(6,12)], PAPER, INK)
        d.line((4,10,11,3), c, 2)
        d.polygon([(10,12),(14,8),(15,10),(11,14)], c, INK)
    elif key == "broyeuse":
        d.rectangle((4,0,11,8), PAPER, INK)
        d.rectangle((1,5,14,11), "#5c5c6e", INK)
        d.line((3,7,12,7), "#c2c2d0")
        for x in (4,7,10):
            d.line((x,10,x,14-x%3), PAPER, 2)
    elif key == "photocopie":
        for x,y in ((5,0),(1,4)):
            d.polygon([(x,y),(x+6,y),(x+9,y+3),(x+9,y+11),(x,y+11)], PAPER, INK)
            d.line((x+2,y+5,x+6,y+5), EDGE)
        d.line((0,10,13,10), c, 2)
    elif key in ("foilwrap","reprint"):
        d.polygon([(4,4),(13,5),(10,12),(13,14),(3,14),(1,12)], GOLD if key=="foilwrap" else PAPER, INK)
        d.polygon([(2,2),(12,1),(15,3),(14,7),(4,8),(1,6)], c, INK)
        d.line((4,3,12,2), LIGHT)
        d.ellipse((1,2,5,8), "#9c7028", INK)
        d.point((3,5), LIGHT)
        d.line((5,12,9,12), EDGE)
    elif key == "holo":
        d.ellipse((1,1,14,14), c, INK)
        for x,color in ((4,"#3e9ab0"),(6,LIGHT),(8,"#d06a9a")):
            d.line((x,9,x+4,3),color,2)
        d.polygon([(7,14),(14,7),(13,12),(10,14)], PAPER, INK)
    elif key == "prism":
        d.polygon([(1,3),(12,1),(15,10),(11,9),(10,13),(7,11),(4,15)], "#43342e", INK)
        d.line([(4,13),(7,10),(10,12),(11,8),(14,9)],c,2)
        d.point((10,10),LIGHT)
    elif key == "tampon":
        d.rounded_rectangle((1,10,14,15),2,RED,INK)
        d.rectangle((3,8,12,11), "#9c7028", INK)
        d.ellipse((5,0,10,6), "#b07a3a", INK)
        d.rectangle((6,5,9,8), "#6b4a1a")
        d.point((7,2), GOLD)
    else:
        d.polygon([(1,8),(8,5),(13,8),(13,12),(6,15),(1,12)], EDGE, INK)
        d.polygon([(2,8),(8,6),(12,8),(6,11)], RED)
        d.line((9,7,13,2), PAPER)
        d.polygon([(12,4),(11,2),(13,0),(14,2),(14,4)], "#e8501a")
        d.point((13,3),GOLD)
    return im


# each insert's frame ramp: dark, face, light, glint. all on the palette
RAMP = {
    "code": ("#4e1020", "#7a1a2c", "#a82a38", "#d04a4e"),
    "checklist": ("#1e4a24", "#3a8040", "#6fcf6f", "#b8f0a0"),
    "wishlist": ("#4e2a78", "#7a4ab0", "#b088e0", "#f6ecd2"),
    "grail": ("#6b4a1a", "#c99a3a", "#e8c260", "#fff0b0"),
    "stylo": ("#0f1d33", "#28497a", "#3e66a0", "#f6ecd2"),
    "broyeuse": ("#1c1513", "#43342e", "#5c4a36", "#8c7656"),
    "photocopie": ("#174034", "#2d7a5c", "#4a9a74", "#b8f0a0"),
    "reprint": ("#3d2a10", "#9c7028", "#c99a3a", "#e8c260"),
    "foilwrap": ("#6b4a1a", "#c99a3a", "#e8c260", "#fff0b0"),
    "holo": ("#4e2a78", "#7a4ab0", "#b088e0", "#f6ecd2"),
    "prism": ("#a8260a", "#e8501a", "#ff7a24", "#ffe08a"),
    "tampon": ("#2a0910", "#7a1a2c", "#a82a38", "#d04a4e"),
    "allumettes": ("#4e1020", "#a82a38", "#d04a4e", "#ffb03a"),
}
NAMES = {
    "code": "Code", "checklist": "Checklist", "wishlist": "Wishlist", "grail": "Graal", "stylo": "Stylo",
    "broyeuse": "Broyeuse", "photocopie": "Photocopie", "reprint": "Reprint", "foilwrap": "Foil",
    "holo": "Holo", "prism": "Prism", "tampon": "Tampon", "allumettes": "Allumettes",
}
# rarity pips from the insert's odds (src/engine/shop.ts INSERTS): 1 common, 2 uncommon, 3 rare
PIPS = {"code": 1, "checklist": 1, "stylo": 1, "broyeuse": 1, "photocopie": 2, "reprint": 2, "foilwrap": 2,
        "holo": 2, "tampon": 2, "allumettes": 2, "wishlist": 3, "prism": 3, "grail": 3}
FOIL = {"foilwrap", "holo", "prism", "grail"}
W, H = 48, 68


def scale2x(im):
    # EPX: doubles a sprite and rounds its diagonals, so a 16 px emblem reads as drawn at 32
    src = im.load()
    w, h = im.size
    out = Image.new("RGBA", (w * 2, h * 2))
    dst = out.load()
    get = lambda x, y: src[min(w - 1, max(0, x)), min(h - 1, max(0, y))]
    for y in range(h):
        for x in range(w):
            p = src[x, y]
            a, b, c, d = get(x, y - 1), get(x + 1, y), get(x - 1, y), get(x, y + 1)
            e = [p, p, p, p]
            if c == a and c != d and a != b: e[0] = a
            if a == b and a != c and b != d: e[1] = b
            if d == c and d != b and c != a: e[2] = c
            if b == d and b != a and d != c: e[3] = d
            dst[2 * x, 2 * y], dst[2 * x + 1, 2 * y], dst[2 * x, 2 * y + 1], dst[2 * x + 1, 2 * y + 1] = e
    return out


def frame(d, ramp):
    dark, face, light, glint = ramp
    d.rounded_rectangle((0, 0, W - 1, H - 1), 3, face, INK)
    # bevel: light along the top and left, dark along the bottom and right
    d.line((2, 1, W - 3, 1), glint)
    d.line((1, 2, 1, H - 3), light)
    d.line((2, H - 2, W - 3, H - 2), dark)
    d.line((W - 2, 2, W - 2, H - 3), dark)
    d.rectangle((3, 3, W - 4, H - 4), dark)
    for x, y in ((2, 2), (W - 3, 2), (2, H - 3), (W - 3, H - 3)):
        d.point((x, y), GOLD)


def sunburst(im, box, ramp, center):
    # alternating rays behind the emblem, Balatro's tarot trick in two paper tones and the insert's light
    x0, y0, x1, y1 = box
    cx, cy = center
    px = im.load()
    _, face, light, _ = ramp
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            ang = math.atan2(y - cy, x - cx)
            ray = int((ang + math.pi) / (2 * math.pi) * 16) % 2
            r = math.hypot(x - cx, y - cy)
            col = (light if r > 12 else PAPER) if ray else "#e3d2a8"
            px[x, y] = ImageColor.getrgb(col) + (255,)


def foil(im, box):
    # sparse diagonal streaks of light over the window, the card is a wrap or a prize
    x0, y0, x1, y1 = box
    px = im.load()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            k = (x + y) % 11
            if k == 0 and (x * 7 + y) % 3:
                px[x, y] = ImageColor.getrgb("#fffbe8") + (255,)
            elif k == 1 and (x + 2 * y) % 4 == 0:
                px[x, y] = ImageColor.getrgb("#b088e0") + (255,)


def face(key, mark, text, measure):
    ramp = RAMP[key]
    dark, mid, light, glint = ramp
    im = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(im)
    frame(d, ramp)
    # the name banner
    d.rectangle((4, 4, W - 5, 13), mid)
    d.line((4, 4, W - 5, 4), light)
    d.line((4, 13, W - 5, 13), dark)
    name = NAMES[key]
    font = "tiny"
    text(im, name, W // 2, 6, font, PAPER, "center", INK if measure(name, font) <= W - 12 else None)
    # the art window
    win = (5, 15, W - 6, 48)
    sunburst(im, win, ramp, (W // 2, 31))
    if key in FOIL:
        foil(im, win)
    d.rectangle(win, outline=dark)
    d.line((win[0] + 1, win[3] - 1, win[2] - 1, win[3] - 1), "#bfa77e")
    d.ellipse((W // 2 - 15, 31 - 15, W // 2 + 15, 31 + 15), PAPER, mid)
    d.arc((W // 2 - 14, 31 - 14, W // 2 + 14, 31 + 14), 200, 330, glint)
    big = scale2x(mark)
    im.alpha_composite(big, (W // 2 - 16, 31 - 16))
    # the foot: a paper plate with rarity lozenges
    d.rectangle((5, 50, W - 6, 61), PAPER)
    d.line((5, 50, W - 6, 50), "#bfa77e")
    d.line((5, 61, W - 6, 61), "#8c7656")
    n = PIPS[key]
    for i in range(n):
        x = W // 2 + (i - (n - 1) / 2) * 8
        x = int(round(x))
        d.polygon([(x, 52), (x + 3, 55), (x, 58), (x - 3, 55)], GOLD if n == 3 else light, INK)
        d.point((x, 54), glint)
    for x in range(7, W - 7, 3):
        d.point((x, 63), light)
    return im


def back(text):
    im = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(im)
    frame(d, RAMP["code"])
    d.rectangle((4, 4, W - 5, H - 5), "#4e1020")
    # a lattice of small diamonds
    for y in range(6, H - 6, 6):
        for x in range(6 + (y // 6 % 2) * 3, W - 6, 6):
            d.polygon([(x, y - 2), (x + 2, y), (x, y + 2), (x - 2, y)], "#7a1a2c")
    d.rectangle((6, 6, W - 7, H - 7), outline=GOLD)
    cx, cy = W // 2, H // 2
    d.polygon([(cx, cy - 20), (cx + 15, cy), (cx, cy + 20), (cx - 15, cy)], "#2a0910", GOLD)
    d.polygon([(cx, cy - 17), (cx + 12, cy), (cx, cy + 17), (cx - 12, cy)], None, "#9c7028")
    text(im, "F", cx, cy - 9, "didone", LIGHT, "center")
    return im


def parts(text, originals, measure):
    out = {}
    for key in COLORS:
        mark = originals.get("scratch/" + key)
        if mark is None:
            mark = emblem(key)
            out["scratch/" + key] = mark
        out["insert/face/" + key] = face(key, mark, text, measure)
    out["insert/back"] = back(text)
    return out
