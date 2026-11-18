"""Run python art/shop/counter.py to paint the tabac counter parts and a stage-scale proof."""
import json
from pathlib import Path
from runpy import run_path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
ART = ROOT.parent
NN = Image.Resampling.NEAREST
bur = run_path(str(ROOT / "buraliste.py"))
outline = bur["outline"]

# palette (art/palette/flambeur.gpl)
INK0, INK1, INK2, INK3 = "#0e0b0a", "#1c1513", "#2e2320", "#43342e"
G0, G1, G2, G3, G4 = "#0f2a20", "#174034", "#1f5a46", "#2d7a5c", "#4a9a74"
NAVY0, NAVY1, NAVY2, NAVY3 = "#0f1d33", "#1a3256", "#28497a", "#3e66a0"
BURG0, BURG1, BURG2, BURG3, BURG4 = "#2a0910", "#4e1020", "#7a1a2c", "#a82a38", "#d04a4e"
WOOD0, WOOD1, WOOD2, WOOD3, BRASS, BRASS_L, GOLD_L = "#120e08", "#2a2010", "#3d2a10", "#6b4a1a", "#c99a3a", "#e8c260", "#fff0b0"
PAPER0, PAPER1, PAPER2, PAPER3, CREAM = "#5c4a36", "#8c7656", "#bfa77e", "#e3d2a8", "#f6ecd2"
FIRE0, FIRE1, FIRE2, FIRE3, FIRE4 = "#5a1206", "#a8260a", "#e8501a", "#ff7a24", "#ffb03a"
MONEY0, MONEY1, MONEY2 = "#1e4a24", "#3a8040", "#6fcf6f"
VIO0, VIO1, VIO2, VIO3 = "#2a1440", "#4e2a78", "#7a4ab0", "#b088e0"
WHITE = "#fffbe8"

STAGE = (640, 360)
COUNTER_TOP, COUNTER_FRONT, SHELF_LIP = 150, 172, 312
SLOT_W, SLOT_H, SLOT_TOP = 72, 104, 186


# ---------- bitmap text from art/fonts, same atlas as src/ui/font.ts ----------
FONTS = json.loads((ART / "fonts/fonts.json").read_text())
ATLAS = Image.open(ART / "fonts/fonts.png").convert("RGBA")


def glyph(font, ch):
    f = FONTS[font]
    if ch in f["glyphs"]:
        return f["glyphs"][ch]
    return FONTS["sans"]["glyphs"].get(ch, FONTS["sans"]["glyphs"]["?"])


def measure(s, font="sans"):
    f = FONTS[font]
    s = s.upper() if f["caps"] else s
    return max(0, sum(f["space"] if c == " " else glyph(font, c)[6] for c in s) - 1)


def text(img, s, x, y, font="sans", color=INK1, align="left", outline_color=None):
    # y = top of the line box
    if outline_color:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            text(img, s, x + dx, y + dy, font, outline_color, align)
    f = FONTS[font]
    s = s.upper() if f["caps"] else s
    w = measure(s, font)
    cx = x - w // 2 if align == "center" else x - w if align == "right" else x
    tint = Image.new("RGBA", ATLAS.size, color)
    for c in s:
        if c == " ":
            cx += f["space"]
            continue
        gx, gy, gw, gh, top, left, adv = glyph(font, c)
        mask = ATLAS.crop((gx, gy, gx + gw, gy + gh)).getchannel("A")
        img.paste(tint.crop((0, 0, gw, gh)), (cx + left, y + top), mask)
        cx += adv


def layer(w, h):
    img = Image.new("RGBA", (w, h))
    return img, ImageDraw.Draw(img)


# ---------- the room ----------
def back_wall():
    img, d = layer(640, COUNTER_TOP + 2)
    d.rectangle([0, 0, 640, COUNTER_TOP], fill=WOOD1)
    # wainscot panels, kept dark so the buraliste and the counter carry the scene
    for x in range(0, 640, 80):
        d.rectangle([x + 4, 4, x + 76, COUNTER_TOP], outline=WOOD0)
        d.line([(x + 5, 5), (x + 75, 5)], fill=WOOD2)
    # two shelves of cartons and pack boxes behind him
    for y in (52, 102):
        d.rectangle([180, y, 470, y + 4], fill=WOOD3)
        d.line([(180, y + 5), (470, y + 5)], fill=WOOD0)
        x = 184
        i = 0
        while x < 466:
            w = (10, 14, 8, 12, 16)[i % 5]
            h = (26, 20, 30, 22, 18)[(i * 3) % 5]
            body, lid = ((BURG2, BURG3), (NAVY1, NAVY2), (G1, G2), (WOOD3, BRASS), (VIO1, VIO2))[(i * 7) % 5]
            d.rectangle([x, y - h, x + w - 1, y - 1], fill=body)
            d.line([(x, y - h), (x + w - 1, y - h)], fill=lid)
            d.line([(x + w - 1, y - h), (x + w - 1, y - 1)], fill=INK1)
            if w > 10:
                d.rectangle([x + 2, y - h // 2 - 2, x + w - 4, y - h // 2 + 1], fill=PAPER2)
            x += w + 1
            i += 1
    return img


def window():
    # the shop window, top-left: night street outside, the red TABAC diamond hanging in it
    img, d = layer(124, 108)
    d.rectangle([0, 0, 123, 107], fill=WOOD2)
    d.rectangle([5, 5, 118, 102], fill=NAVY0)
    # rain streaks and a street lamp glow
    for x in range(8, 116, 7):
        for y in range((x * 5) % 11 + 6, 100, 13):
            d.line([(x, y), (x - 1, y + 3)], fill=NAVY1)
    d.ellipse([84, 62, 104, 82], fill=NAVY1)
    d.ellipse([90, 68, 98, 76], fill=BRASS)
    d.line([(61, 5), (61, 102)], fill=WOOD2, width=3)
    d.line([(5, 54), (118, 54)], fill=WOOD2, width=3)
    d.line([(6, 6), (118, 6)], fill=WOOD3)
    return img


def diamond():
    # the carotte: a red lozenge with TABAC across it. its glow is a shader
    img, d = layer(58, 40)
    d.polygon([(29, 0), (57, 20), (29, 39), (0, 20)], fill=BURG3)
    d.polygon([(29, 3), (53, 20), (29, 36), (4, 20)], outline=BURG4)
    d.polygon([(29, 20), (57, 20), (29, 39)], fill=BURG2)
    text(img, "TABAC", 29, 14, "tiny", CREAM, "center")
    return outline(pad(img))


def pad(img, n=1):
    out = Image.new("RGBA", (img.width + 2 * n, img.height + 2 * n))
    out.paste(img, (n, n))
    return out


def outline(img, color=INK0):
    from PIL import ImageChops
    a = Image.new("L", (img.width + 2, img.height + 2))
    a.paste(img.getchannel("A").point(lambda v: 255 if v else 0), (1, 1))
    grown = a.copy()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        grown = ImageChops.lighter(grown, ImageChops.offset(a, dx, dy))
    ring = ImageChops.subtract(grown, a).crop((1, 1, img.width + 1, img.height + 1))
    out = Image.new("RGBA", img.size, color)
    out.putalpha(ring)
    return Image.alpha_composite(out, img)


def stonks_board(hot="♥", mult="×3", tomorrow="♠", blank=False):
    # "cote du jour": the hot rank, suit or finish chalked up. code writes the chalk
    img, d = layer(124, 92)
    d.rectangle([0, 0, 123, 91], fill=WOOD3)
    d.rectangle([4, 4, 119, 87], fill=G0)
    d.line([(4, 4), (119, 4)], fill=WOOD0)
    # chalk dust smears
    for x, y in ((14, 70), (60, 20), (96, 60), (30, 40)):
        d.line([(x, y), (x + 12, y - 1)], fill=G1)
    d.line([(14, 22), (110, 22)], fill=PAPER1)
    if blank:
        return outline(img)
    text(img, "COTE DU JOUR", 62, 8, "chalk", PAPER3, "center")
    # the hot thing, big
    big = Image.new("RGBA", (12, 12))
    text(big, hot, 0, 0, "sans", CREAM)
    big = big.crop(big.getbbox()).resize((big.crop(big.getbbox()).width * 3, big.crop(big.getbbox()).height * 3), NN)
    img.alpha_composite(big, (28, 30))
    text(img, mult, 66, 34, "chalk", BRASS_L)
    text(img, "SE VEND", 66, 47, "chalk", PAPER2)
    text(img, "DEMAIN : " + tomorrow, 62, 70, "sans", PAPER2, "center")
    return outline(img)


def clock():
    img, d = layer(34, 34)
    d.ellipse([0, 0, 33, 33], fill=WOOD3)
    d.ellipse([3, 3, 30, 30], fill=CREAM)
    for i in range(12):
        import math
        a = math.radians(i * 30)
        d.point((16.5 + 11 * math.sin(a), 16.5 - 11 * math.cos(a)), fill=INK2)
    d.line([(16, 16), (16, 7)], fill=INK1, width=1)
    d.line([(16, 16), (23, 19)], fill=BURG3, width=1)  # the red timer hand
    return outline(img)


def lottery():
    # the lottery terminal on the back counter
    img, d = layer(46, 58)
    d.rectangle([4, 0, 41, 40], fill=NAVY1)
    d.rectangle([8, 4, 37, 20], fill=MONEY0)
    for y in range(7, 19, 3):
        d.line([(11, y), (11 + (y * 7) % 20, y)], fill=MONEY2)
    d.rectangle([8, 24, 37, 36], fill=NAVY2)
    for x in range(10, 36, 5):
        for y in (26, 31):
            d.rectangle([x, y, x + 2, y + 2], fill=PAPER3)
    d.polygon([(0, 40), (45, 40), (45, 57), (0, 57)], fill=NAVY0)
    d.line([(0, 40), (45, 40)], fill=NAVY3)
    d.rectangle([14, 46, 31, 49], fill=INK0)  # ticket slot
    return outline(img)


def register():
    img, d = layer(84, 58)
    d.polygon([(10, 0), (74, 0), (80, 30), (4, 30)], fill=WOOD3)
    d.rectangle([14, 4, 70, 14], fill=INK1)
    text(img, "0,00", 66, 4, "tiny", MONEY2, "right")
    for x in range(10, 74, 9):
        for y in (18, 24):
            d.rectangle([x, y, x + 6, y + 3], fill=PAPER3 if (x + y) % 3 else BRASS)
    d.rectangle([0, 30, 83, 57], fill=WOOD2)
    d.line([(0, 30), (83, 30)], fill=BRASS)
    d.rectangle([34, 44, 50, 47], fill=BRASS)  # drawer handle
    return outline(img)


def sign(traits):
    # the posted sign: a hand-lettered card taped to the register, 3 trait names
    img, d = layer(96, 52)
    d.rectangle([0, 3, 95, 51], fill=CREAM)
    d.line([(0, 51), (95, 51)], fill=PAPER2)
    d.rectangle([40, 0, 56, 6], fill=PAPER2)  # tape
    text(img, "LA MAISON", 48, 6, "tiny", BURG2, "center")
    for i, t in enumerate(traits):
        text(img, "· " + t, 6, 16 + i * 11, "sans", INK1)
    return outline(img)


def bell():
    img, d = layer(24, 18)
    d.rectangle([11, 0, 12, 4], fill=BRASS)
    d.rectangle([9, 0, 14, 1], fill=GOLD_L)
    d.chord([2, 3, 21, 22], 180, 360, fill=BRASS)
    d.chord([4, 4, 12, 14], 180, 270, fill=GOLD_L)
    d.rectangle([0, 12, 23, 15], fill=WOOD3)
    return outline(img)


def counter_top():
    # worn zinc, seen from just above: a lit back edge, the top, a dark front lip
    img, d = layer(640, COUNTER_FRONT - COUNTER_TOP + 1)
    d.rectangle([0, 0, 640, 22], fill=PAPER1)
    d.line([(0, 0), (640, 0)], fill=PAPER3)
    d.line([(0, 1), (640, 1)], fill=PAPER2)
    for x in range(0, 640, 23):  # scuffs
        d.line([(x + 3, 6 + x % 9), (x + 10, 6 + x % 9)], fill=PAPER2)
    d.rectangle([0, 19, 640, 22], fill=PAPER0)
    return img


def shelf_case():
    # glass-fronted case under the counter. the offers sit inside on a brass lip
    h = STAGE[1] - COUNTER_FRONT
    img, d = layer(640, h)
    d.rectangle([0, 0, 640, h], fill=WOOD1)
    d.rectangle([0, 0, 640, 8], fill=WOOD0)  # shadow under the counter
    lip = SHELF_LIP - COUNTER_FRONT
    d.rectangle([0, lip, 640, lip + 5], fill=BRASS)
    d.line([(0, lip), (640, lip)], fill=GOLD_L)
    d.rectangle([0, lip + 6, 640, h], fill=WOOD2)
    d.line([(0, lip + 6), (640, lip + 6)], fill=WOOD0)
    return img


def glass_glints():
    # diagonal reflections on the case glass, drawn over the offers but sparse so nothing hides
    h = SHELF_LIP - COUNTER_FRONT
    img, d = layer(640, h)
    for i in (3, 5, 7):
        x0 = slot_x(i) - 7
        d.line([(x0, 40), (x0 + 3, 22)], fill=PAPER1)
        d.line([(x0 + 1, 70), (x0 + 2, 64)], fill=PAPER1)
    return img


# ---------- the offers (72×104) ----------
def offer_base():
    return layer(SLOT_W, SLOT_H)


def pack_art(kind):
    path = ART / "packaging" / "boosters" / f"{kind}.png"
    with Image.open(path) as pack:
        if pack.size != (SLOT_W, SLOT_H):
            raise ValueError(f"{path} must fit a {SLOT_W}x{SLOT_H} shelf slot")
        return pack.convert("RGBA")


def collectible(name, rarity):  # name '' = blank plaque, the game writes the name
    # a small wooden easel holding a card-sized plaque: icon placeholder + name
    img, d = offer_base()
    d.line([(14, 101), (26, 60)], fill=WOOD3, width=3)
    d.line([(58, 101), (46, 60)], fill=WOOD3, width=3)
    d.line([(36, 101), (36, 70)], fill=WOOD2, width=3)
    face = {"common": PAPER3, "uncommon": G4, "rare": BRASS_L}[rarity]
    d.rectangle([8, 4, 63, 82], fill=CREAM)
    d.rectangle([8, 4, 63, 82], outline=face)
    d.rectangle([9, 5, 62, 81], outline=face)
    d.ellipse([20, 14, 51, 45], fill=face)
    d.ellipse([26, 20, 45, 39], fill=CREAM)
    d.ellipse([31, 25, 40, 34], fill=face)
    words = name.split()
    for i, w in enumerate(words[:2]):
        text(img, w, 36, 52 + i * 11, "sans", INK1, "center")
    d.rectangle([4, 82, 67, 86], fill=WOOD3)
    return outline(img)


def scratcher():
    img, d = offer_base()
    d.rectangle([8, 2, 63, 101], fill=CREAM)
    d.rectangle([8, 2, 63, 22], fill=BURG3)
    text(img, "GRATTEZ !", 36, 7, "sans", GOLD_L, "center")
    # the silver foil panel (a dithered pale ramp, the palette has no grey)
    for x in range(14, 58):
        for y in range(30, 76):
            d.point((x, y), fill=PAPER2 if (x + y) % 2 else PAPER3)
    for x, y in ((24, 44), (40, 58), (30, 66)):
        text(img, "?", x, y - 4, "sans", PAPER0)
    d.line([(14, 30), (57, 30)], fill=WHITE)
    for x in range(8, 64, 4):  # perforated bottom
        d.point((x, 100), fill=PAPER1)
    text(img, "1 INSERT", 36, 84, "tiny", BURG2, "center")
    return outline(img)


def sleeve_stand():
    img, d = offer_base()
    d.polygon([(4, 101), (67, 101), (60, 86), (11, 86)], fill=BURG1)
    d.rectangle([10, 6, 61, 86], fill=BURG2)
    d.rectangle([16, 12, 55, 80], fill=NAVY2)  # the sleeve itself, a card-shaped pocket
    d.rectangle([18, 14, 53, 78], fill=NAVY3)
    d.line([(18, 14), (53, 14)], fill=CREAM)
    d.line([(20, 20), (30, 70)], fill=CREAM)  # plastic glint
    d.rectangle([6, 0, 65, 10], fill=BRASS)
    text(img, "SPÉCIAL", 36, 0, "tiny", INK1, "center")
    text(img, "TABLE", 36, 88, "tiny", CREAM, "center")
    return outline(img)


def price_tag(price):
    s = f"${price}" if price else "Free"
    w = max(40, measure(s) + 16)
    img, d = layer(w, 13)
    d.polygon([(4, 0), (w - 1, 0), (w - 1, 12), (4, 12), (0, 6)], fill=CREAM)
    d.point((4, 6), fill=PAPER1)  # string hole
    text(img, s, (w + 4) // 2, 1, "sans", MONEY1, "center")
    return outline(img)


def vendu():
    img, d = layer(56, 18)
    d.rectangle([0, 0, 55, 17], fill=CREAM)
    text(img, "VENDU", 28, 3, "chalk", BURG3, "center")
    return outline(img).rotate(-8, NN, expand=True)


def hover_tag(name, line):
    # the one-line rule, unfolded under a hovered offer
    w = max(measure(name), measure(line)) + 12
    img, d = layer(w, 28)
    d.rectangle([0, 0, w - 1, 27], fill=CREAM)
    d.line([(0, 27), (w - 1, 27)], fill=PAPER2)
    text(img, name, 6, 2, "sans", INK1)
    text(img, line, 6, 14, "sans", PAPER0)
    return outline(img)


# ---------- the bottom bar ----------
def ticket(label_text, face, plinth, ink, price=None, width=104):
    # same build as the duel tickets: tinted greyscale face over a plinth, chalk label, cream price chip
    src_face = Image.open(ART / "duel/sprites/hud/ticket/face.png").convert("RGBA")
    src_plinth = Image.open(ART / "duel/sprites/hud/ticket/plinth.png").convert("RGBA")

    def stretch(src, color):
        w, h = src.size
        out = Image.new("RGBA", (width, h))
        out.paste(src.crop((0, 0, 9, h)), (0, 0))
        out.paste(src.crop((9, 0, 27, h)).resize((width - 9 - (w - 27), h), NN), (9, 0))
        out.paste(src.crop((27, 0, w, h)), (width - (w - 27), 0))
        tint = Image.new("RGBA", out.size, color)
        from PIL import ImageChops
        rgb = ImageChops.multiply(out, tint)
        rgb.putalpha(out.getchannel("A"))
        return rgb

    img = Image.new("RGBA", (width, 27))
    img.alpha_composite(stretch(src_plinth, plinth), (0, 3))
    img.alpha_composite(stretch(src_face, face), (0, 0))
    out_color = None if ink == INK1 else INK0
    text(img, label_text, 12, 6, "chalk", ink, "left", out_color)
    if price is not None:
        cw = measure(price) + 6
        d = ImageDraw.Draw(img)
        d.rectangle([width - cw - 5, 5, width - 5, 18], fill=CREAM)
        text(img, price, width - 5 - cw // 2, 6, "sans", INK1, "center")
    return img


def plate(money):
    img, d = layer(96, 30)
    d.rectangle([0, 0, 95, 29], fill=BRASS)
    d.rectangle([3, 3, 92, 26], fill=CREAM)
    text(img, "Vous", 8, 9, "sans", INK1)
    big = Image.new("RGBA", (60, 24))
    text(big, f"${money}", 0, 0, "sans", NAVY3)
    big = big.crop(big.getbbox())
    big = big.resize((big.width * 2, big.height * 2), NN)
    img.alpha_composite(big, (88 - big.width, 8))
    return outline(img)


def deck_pile(n):
    img, d = layer(40, 40)
    for i in range(min(n // 4, 6)):
        d.rectangle([4, 10 - i, 35, 38 - i], fill=PAPER2 if i < 5 else BURG2)
        d.line([(4, 38 - i), (35, 38 - i)], fill=PAPER0)
    d.rectangle([6, 6, 33, 32], outline=BRASS)
    text(img, str(n), 20, 14, "sans", CREAM, "center", INK0)
    return outline(img)


def binder(count="6"):
    img, d = layer(52, 40)
    d.rectangle([2, 2, 49, 37], fill=BURG1)
    d.rectangle([2, 2, 9, 37], fill=BURG0)  # spine
    d.rectangle([13, 6, 45, 33], outline=BRASS)
    d.line([(14, 7), (44, 7)], fill=GOLD_L)
    text(img, "BINDER", 29, 14, "tiny", BRASS_L, "center")
    if count:
        text(img, count, 29, 22, "sans", CREAM, "center")
    return outline(img)


def bubble(s):
    w = measure(s) + 14
    img, d = layer(w, 24)
    d.rounded_rectangle([0, 0, w - 1, 17], 5, fill=CREAM)
    d.polygon([(8, 17), (14, 17), (5, 23)], fill=CREAM)
    text(img, s, 7, 3, "sans", INK1)
    return outline(img)


# ---------- proof ----------
OFFERS = [
    ("pack", "free"), ("pack", "offbrand"), ("pack", "repack"),
    ("collectible", ("Lucky Penny", "common", 4)), ("collectible", ("Straight Edge", "uncommon", 6)),
    ("scratcher", None), ("scratcher", None), ("sleeve", None),
]
PRICES = {"free": 0, "offbrand": 3, "repack": 4, "collector": 6}


def slot_x(i):
    return 9 + i * 76 + ((i > 2) + (i > 4) + (i > 6)) * 6


def proof(hover: int | None = 2, sold: int | None = None):
    stage = Image.new("RGBA", STAGE, INK0)
    stage.alpha_composite(back_wall())
    stage.alpha_composite(window(), (64, 10))
    stage.alpha_composite(diamond(), (96, 22))
    stage.alpha_composite(Image.open(ART / "duel/sprites/hud/vitrine/tab.png").convert("RGBA"), (8, 0))
    stage.alpha_composite(stonks_board(), (508, 12))
    stage.alpha_composite(clock(), (452, 14))
    stage.alpha_composite(lottery(), (432, 94))
    stage.alpha_composite(register(), (528, 94))
    stage.alpha_composite(bur["compose"](front=False), (220, 0))
    stage.alpha_composite(bubble("Bonjour."), (330, 22))
    stage.alpha_composite(counter_top(), (0, COUNTER_TOP))
    stage.alpha_composite(bur["front"](), (220, 0))
    stage.alpha_composite(bell(), (94, 136))
    stage.alpha_composite(sign(["Grumpy", "Chatty", "Collector"]), (530, 120))
    stage.alpha_composite(shelf_case(), (0, COUNTER_FRONT))

    for i, (kind, data) in enumerate(OFFERS):
        x = slot_x(i)
        y = SLOT_TOP - (5 if i == hover else 0)
        if kind == "pack":
            art, price = pack_art(data), PRICES[data]
        elif kind == "collectible":
            art, price = collectible(data[0], data[1]), data[2]
        elif kind == "scratcher":
            art, price = scratcher(), 3
        else:
            art, price = sleeve_stand(), 10
        if i == sold:
            stage.alpha_composite(vendu(), (x + 8, SLOT_TOP + 40))
            continue
        stage.alpha_composite(art, (x, y))
        stage.alpha_composite(price_tag(price), (x + 16, 295))
    stage.alpha_composite(glass_glints(), (0, COUNTER_FRONT))

    # bottom bar
    stage.alpha_composite(plate(62), (6, 324))
    stage.alpha_composite(deck_pile(24), (108, 320))
    stage.alpha_composite(ticket("Restock", INK3, INK0, PAPER3, "$1", 104), (158, 326))
    stage.alpha_composite(ticket("Bin Bulk", INK3, INK0, PAPER3, "$2", 104), (268, 326))
    stage.alpha_composite(ticket("Grading", INK3, INK0, PAPER3, "$2+", 96), (378, 326))
    stage.alpha_composite(binder(), (480, 320))
    stage.alpha_composite(ticket("Sortir", BRASS, WOOD2, INK1, None, 96), (538, 326))

    if hover is not None:
        kind, data = OFFERS[hover]
        tag = hover_tag("Repack · $4", "4 cards: flambéed, Jumbos, Rookies, Jokers")
        stage.alpha_composite(tag, (min(slot_x(hover), 640 - tag.width - 4), SLOT_TOP + SLOT_H - 2))
    return stage


# ---------- atlas for the game (src/ui/art.ts loads it like the duel atlas) ----------
def trimmed(img):
    box = img.getbbox()
    return img.crop(box), box[0], box[1]


def export_atlas():
    parts = {}  # name -> (image, pivot)

    def add(name, img, pivot=(0, 0)):
        parts[name] = (img, pivot)

    def bur_layer(name, img):
        # buraliste layers share one 200x172 canvas. pivot = that canvas's origin, so pin(name, 220, 0) lines them up
        crop, bx, by = trimmed(img)
        add(name, crop, (-bx, -by))

    body = Image.new("RGBA", (bur["W"], bur["H"]))
    for f in (bur["torso"], bur["arms"], bur["neck"], bur["head"], bur["nose"], bur["lip"]):
        body = Image.alpha_composite(body, f())
    bur_layer("bur/body", body)
    for look in ("down", "you", "shut"):
        bur_layer(f"bur/eyes/{look}", bur["eyes"](look))
    for mood in ("grump", "raised"):
        bur_layer(f"bur/brows/{mood}", bur["brows"](mood))
    for mood in ("grump", "puff"):
        bur_layer(f"bur/stache/{mood}", bur["mustache"](mood))
    bur_layer("bur/cig", bur["cigarette"](True))
    bur_layer("bur/front", bur["front"]())

    add("shop/wall", back_wall())
    add("shop/window", window())
    add("shop/diamond", diamond())
    add("shop/stonks", stonks_board(blank=True))
    add("shop/clock", clock())
    add("shop/lottery", lottery())
    add("shop/register", register())
    add("shop/sign", sign([]))
    add("shop/bell", bell(), (12, 17))
    add("shop/counter", counter_top())
    add("shop/case", shelf_case())
    add("shop/glints", glass_glints())
    for kind in ("free", "offbrand", "repack", "collector"):
        add(f"shop/pack/{kind}", pack_art(kind))
    for rarity in ("common", "uncommon", "rare"):
        add(f"shop/easel/{rarity}", collectible("", rarity))
    add("shop/scratcher", scratcher())
    add("shop/sleeve", sleeve_stand())
    add("shop/vendu", vendu())
    add("shop/binder", binder(""))

    # shelf-pack, tallest first
    width, x, y, row = 640, 0, 0, 0  # the wall, counter and case are full stage width
    placed = {}
    for name, (img, _) in sorted(parts.items(), key=lambda kv: -kv[1][0].height):
        if x + img.width > width:
            x, y, row = 0, y + row + 1, 0
        placed[name] = (x, y)
        x += img.width + 1
        row = max(row, img.height)
    atlas = Image.new("RGBA", (width, y + row))
    slices = []
    for name, (img, pivot) in parts.items():
        px_, py_ = placed[name]
        atlas.alpha_composite(img, (px_, py_))
        slices.append({"name": name, "keys": [{"frame": 0, "bounds": {"x": px_, "y": py_, "w": img.width, "h": img.height},
                                               "pivot": {"x": pivot[0], "y": pivot[1]}}]})
    atlas.save(ROOT / "shop.png")
    (ROOT / "shop.json").write_text(json.dumps({"meta": {"app": "art/shop/counter.py", "slices": slices}}, indent=1))


if __name__ == "__main__":
    export_atlas()
    (ROOT / "previews").mkdir(exist_ok=True)
    proof().resize((1280, 720), NN).save(ROOT / "previews/counter@2x.png")
    proof(hover=None, sold=1).resize((1280, 720), NN).save(ROOT / "previews/counter-sold@2x.png")
