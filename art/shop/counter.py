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
def carton_bay(img, x, y, width, rows):
    d = ImageDraw.Draw(img)
    # one brand per compartment, stocked in short stacks and partly sold through
    brands = [(BURG1, BURG2, PAPER1), (NAVY1, NAVY2, PAPER1), (PAPER0, PAPER1, INK2),
              (G0, G1, PAPER1), (WOOD2, WOOD3, PAPER1)]
    height = 24 * len(rows)
    d.rectangle((x, y, x+width, y+height), fill=WOOD0, outline=WOOD3)
    for row, stock in enumerate(rows):
        y0 = y + row * 24 + 1
        bottom = y0 + 20
        xx = x + 3
        for brand, count, wide in stock:
            body, shoulder, label = brands[brand]
            for i in range(count):
                yy = bottom - 6 * i - 5
                d.rectangle((xx, yy, xx+wide-1, yy+4), fill=body)
                d.line((xx, yy, xx+wide-3, yy), fill=shoulder)
                d.polygon([(xx+1,yy+1),(xx+6,yy+1),(xx+3,yy+3),(xx+1,yy+3)], fill=label)
                d.line((xx+wide-4,yy+1,xx+wide-4,yy+4), fill=shoulder)
                if wide > 14:
                    d.line((xx+8,yy+2,xx+12,yy+2),fill=shoulder)
            xx += wide + 2
        d.line((x+1,bottom+1,x+width-1,bottom+1), fill=PAPER0)
        d.line((x+1,bottom+2,x+width-1,bottom+2), fill=WOOD2)


def back_wall():
    img, d = layer(640, COUNTER_TOP + 2)
    d.rectangle((0,0,639,151), fill=INK2)
    # gloss on the upper arris of each green tile, with a burgundy floral border
    d.rectangle((0,84,639,151),fill=G0)
    for row in range(4):
        y = 88 + row * 18
        for i in range(-1,17):
            x = i*41 + (20 if row%2 else 0)
            d.rectangle((x+1,y,x+40,y+16),fill=G2 if (i+row*2)%5 else G1)
            d.line((x+2,y,x+39,y),fill=G3)
            d.line((x+40,y+2,x+40,y+16),fill=G1)
    d.rectangle((0,81,639,86),fill=WOOD2)
    d.line((0,81,639,81),fill=PAPER0)
    d.line((0,86,639,86),fill=WOOD0)
    for x in range(5,640,16):
        d.polygon([(x,90),(x+3,87),(x+6,90),(x+3,93)],fill=G1)
        d.point((x+3,89),fill=G3)

    # a little oxidised mirror, with hand-cut corners and a bevel
    d.polygon([(14,25),(21,18),(47,18),(54,25),(54,73),(47,79),(20,79),(14,73)],fill=WOOD3,outline=WOOD0)
    d.polygon([(17,26),(22,21),(46,21),(51,26),(51,72),(46,76),(22,76),(17,72)],fill=NAVY0,outline=PAPER1)
    d.polygon([(19,27),(23,23),(46,23),(49,26),(19,51)],fill=INK3)
    d.polygon([(19,57),(49,31),(49,36),(19,62)],fill=NAVY1)
    d.line((20,71,47,47),fill=INK3)
    for x in (16,50):
        d.point((x,24),fill=BRASS)
        d.point((x,73),fill=PAPER1)

    # low storefront cabinet. The upper space at centre is mostly keeper silhouette
    carton_bay(img,195,12,77,[
        [(2,3,22),(0,2,21),(0,3,21)], [(1,3,19),(1,3,19),(4,2,27)], [(0,2,25),(2,1,18),(2,3,22)]])
    carton_bay(img,273,12,76,[
        [(4,2,21),(2,3,22),(2,3,21)], [(3,3,21),(3,3,21),(0,1,23)], [(1,2,20),(0,3,20),(4,2,25)]])
    carton_bay(img,350,12,76,[
        [(1,2,20),(1,3,20),(0,2,25)], [(2,2,25),(4,2,17),(4,3,21)], [(0,3,21),(0,2,21),(3,2,22)]])
    # a letterpress lottery poster: the little enamel pot and lucky star
    d.rectangle((438,51,493,91),fill=WOOD0)
    d.rectangle((439,52,492,90),fill=PAPER0)
    d.rectangle((441,54,490,88),fill=BURG1,outline=WOOD2)
    text(img,"FORTUNE",466,55,"tiny",PAPER2,"center")
    d.ellipse((451,67,466,79),outline=WOOD3,width=2)
    d.ellipse((468,67,483,79),outline=WOOD3,width=2)
    d.polygon([(456,66),(478,66),(476,76),(470,81),(463,80),(458,76)],fill=WOOD3)
    d.line((455,66,479,66),fill=PAPER2)
    d.line((463,82,472,82),fill=PAPER1)
    d.polygon([(468,68),(469,71),(472,72),(469,74),(468,77),(466,74),(463,72),(466,71)],fill=PAPER2)
    for xx in (445,486):
        d.line((xx,65,xx,82),fill=BURG2)
        d.point((xx,63),fill=PAPER1)
    # lighter carousel under the mirror: steel spark wheels and coloured shells
    d.polygon([(8,119),(12,102),(43,100),(51,119)],fill=INK2)
    for x,color,h in ((12,BURG2,12),(19,NAVY2,15),(26,G1,12),(33,WOOD3,14),(40,BURG1,16)):
        d.rectangle((x,117-h,x+4,117),fill=color)
        d.rectangle((x,116-h,x+3,118-h),fill=PAPER1)
        d.point((x+3,116-h),fill=INK1)
    d.rectangle((8,116,51,120),fill=WOOD2,outline=INK1)
    d.line((9,117,50,117),fill=PAPER0)
    d.rectangle((0,0,639,6),fill=WOOD2)
    d.line((0,3,639,3),fill=PAPER0)
    d.line((0,6,639,6),fill=WOOD0)
    return img


def window():
    img, d = layer(124,108)
    d.rectangle((0,0,123,107), fill=WOOD0)
    d.rectangle((1,1,122,106), fill=WOOD2,outline=WOOD3)
    d.rectangle((5,4,118,101), fill=NAVY1,outline=INK1)
    # shopfronts across the wet street, two windows still lit
    d.polygon([(6,75),(6,56),(26,46),(31,48),(31,41),(35,41),(35,49),(47,56),
               (58,51),(72,57),(86,42),(94,43),(114,58),(118,57),(118,98),(6,98)],fill=NAVY0)
    for x,y in ((14,64),(27,69),(75,71),(95,63),(102,63),(106,78)):
        d.rectangle((x,y,x+3,y+6),fill=WOOD3 if x in (27,95) else NAVY1)
    for x,y in ((12,13),(24,72),(43,20),(55,37),(69,65),(80,12),(97,28),(110,85),(36,58)):
        d.line((x,y,x-2,y+5),fill=NAVY2)
    d.line((96,77,96,98),fill=INK2)
    d.polygon([(91,72),(100,72),(98,78),(93,78)],fill=WOOD3,outline=INK1)
    d.rectangle((94,73,97,75),fill=PAPER2)
    d.line((17,91,28,91),fill=NAVY1)
    d.line((88,93,105,93),fill=NAVY2)
    for x in (61,):
        d.rectangle((x-2,4,x+1,102),fill=WOOD1)
        d.line((x-2,4,x-2,102),fill=WOOD3)
    d.rectangle((4,54,119,57),fill=WOOD1)
    d.line((4,54,119,54),fill=WOOD3)
    d.line((4,102,119,102),fill=PAPER0)
    return img


def pendant():
    img,d = layer(64,16)
    d.rectangle((30,0,33,4),fill=INK2)
    d.rectangle((26,3,37,5),fill=WOOD3)
    d.polygon([(27,4),(37,4),(45,7),(59,10),(63,12),(61,14),(2,14),(0,12),(6,10),(21,7)],fill=G0,outline=INK0)
    d.line([(5,10),(20,7),(27,5)],fill=G3)
    d.line((3,12,61,12),fill=WOOD3)
    d.line((5,13,59,13),fill=BRASS)
    d.line((11,14,53,14),fill=GOLD_L)
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
    d.polygon([(1,4),(94,3),(95,44),(89,51),(2,50)], fill=PAPER3, outline=PAPER1)
    d.polygon([(89,44),(94,44),(89,49)], fill=CREAM)
    d.line([(87,45),(89,44),(90,44)], fill=PAPER1)
    d.polygon([(38,1),(54,0),(55,6),(39,7)], fill=PAPER2)
    d.line((40,2,52,1),fill=CREAM)
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
    img,d = layer(640, COUNTER_FRONT - COUNTER_TOP + 1)
    d.rectangle((0,0,639,22),fill=PAPER0)
    d.rectangle((0,1,639,12),fill=PAPER1)
    d.line((0,0,639,0),fill=PAPER3)
    d.line((0,2,639,2),fill=PAPER2)
    # two solder joints and shallow scratches worn into the zinc
    for x in (163,483):
        d.line((x,2,x-4,12),fill=PAPER0)
        d.line((x+1,3,x-3,11),fill=PAPER2)
    for x,y,w in ((14,10,7),(57,5,12),(121,9,4),(178,8,9),(215,4,5),
                  (250,11,17),(377,7,16),(414,9,8),(502,5,10),(584,11,8),(621,7,6)):
        d.line([(x,y),(x+w//2,y),(x+w,y-1)],fill=PAPER2)
    d.line((0,13,639,13),fill=PAPER3)
    d.line((0,14,639,14),fill=PAPER1)
    d.rectangle((0,16,639,22),fill=WOOD2)
    d.line((0,16,639,16),fill=INK1)
    d.line((0,18,639,18),fill=WOOD3)
    d.line((0,21,639,21),fill=WOOD1)
    return img


def shelf_case():
    h = STAGE[1] - COUNTER_FRONT
    lip = SHELF_LIP - COUNTER_FRONT
    img,d = layer(640,h)
    d.rectangle((0,0,639,h-1),fill=WOOD1)
    d.rectangle((5,4,634,lip-1),fill=INK1)
    # inset: oxblood velvet back, separate mahogany sides and a polished shelf floor
    d.rectangle((12,9,627,lip-31),fill=INK2)
    d.rectangle((12,9,627,23),fill=INK3)
    d.line((12,24,627,24),fill=INK2)
    d.polygon([(5,3),(13,10),(13,lip-32),(5,lip-21)],fill=WOOD2)
    d.polygon([(635,3),(626,10),(626,lip-32),(635,lip-21)],fill=WOOD2)
    d.polygon([(12,lip-32),(627,lip-32),(635,lip-20),(5,lip-20)],fill=PAPER0)
    d.line((12,lip-32,627,lip-32),fill=INK1)
    d.line((7,lip-21,632,lip-21),fill=PAPER1)
    d.rectangle((4,lip-19,635,lip-1),fill=WOOD2)
    d.rectangle((5,lip-17,634,lip-13),fill=WOOD3)
    d.line((5,lip-17,634,lip-17),fill=BRASS)
    d.line((5,lip-13,634,lip-13),fill=WOOD0)
    for x in (8,155,318,482,630):
        d.point((x,lip-15),fill=PAPER2)
        d.point((x+1,lip-15),fill=INK3)
    d.rectangle((0,0,639,3),fill=WOOD2)
    d.line((2,1,637,1),fill=WOOD3)
    for side in (0,1):
        def edge(points):
            return [(639-x if side else x,y) for x,y in points]
        d.line(edge([(3,4),(3,lip-1)]),fill=WOOD3,width=2)
        for y,dy in ((3,1),(lip-2,-1)):
            d.polygon(edge([(1,y),(22,y),(19,y+2*dy),(7,y+3*dy),(4,y+7*dy),(2,y+14*dy)]),
                      fill=WOOD3)
            d.line(edge([(2,y),(19,y)]),fill=BRASS)
            d.point(edge([(3,y+3*dy)])[0],fill=PAPER2)
    d.rectangle((0,lip,639,lip+5),fill=WOOD3)
    d.line((0,lip,639,lip),fill=BRASS_L)
    d.line((0,lip+1,639,lip+1),fill=BRASS)
    d.line((0,lip+4,639,lip+4),fill=WOOD2)
    d.line((0,lip+6,639,lip+6),fill=WOOD0)
    # cabinet plinth, subdued behind the HUD
    for x0,x1 in ((5,152),(157,473),(478,634)):
        d.rectangle((x0,lip+9,x1,h-2),outline=WOOD2)
        d.line((x0+2,lip+11,x1-2,lip+11),fill=INK1)
    return img


def glass_glints():
    # runtime draws these in screen space; keep the lighting cue in the static proof
    img,d = layer(640, SHELF_LIP-COUNTER_FRONT)
    for x,w in ((142,8),(477,4)):
        d.polygon([(x,10),(x+w,10),(x+w-51,118),(x-51,118)], fill=(255,251,232,18))
    return img


def stock_box():
    img,d = layer(120,60)
    d.polygon([(1,13),(25,2),(102,2),(118,12),(117,48),(94,58),(2,52)],fill=PAPER0,outline=INK1)
    d.polygon([(2,13),(25,3),(101,3),(116,12),(94,22)],fill=PAPER2)
    d.polygon([(3,15),(93,23),(93,56),(3,51)],fill=PAPER1)
    d.polygon([(94,23),(116,13),(116,48),(94,57)],fill=PAPER0)
    d.polygon([(43,5),(53,4),(69,17),(61,20)],fill=PAPER3)
    d.polygon([(55,20),(66,21),(66,33),(63,32),(62,34),(55,32)],fill=PAPER2)
    d.line([(3,14),(94,22),(117,12)],fill=WOOD2)
    d.line((94,24,94,55),fill=WOOD3)
    d.polygon([(10,28),(47,31),(47,44),(10,41)],fill=PAPER2)
    text(img,"TABAC",29,30,"tiny",BURG2,"center")
    for xx in (73,81):
        d.line((xx,48,xx,40),fill=INK3,width=2)
        d.polygon([(xx-3,42),(xx,37),(xx+3,42)],fill=INK3)
    d.line((70,50,84,51),fill=INK3)
    for i in (1,3,4,7,9,12):
        d.line((98+i,34-i//3,98+i,39-i//3),fill=INK2)
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


scratch_art = run_path(str(ROOT / "scratchers.py"))
scratch_parts = scratch_art["parts"](text)
scratch_parts.update(run_path(str(ROOT / "inserts.py"))["parts"](text, scratch_parts))


sleeve_art = run_path(str(ROOT / "sleeves.py"))
sleeve_parts = sleeve_art["parts"](text)


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
    d.polygon([(1,1),(54,0),(55,12),(50,17),(0,16)], fill=PAPER3,outline=PAPER1)
    d.polygon([(50,12),(54,12),(50,16)],fill=CREAM)
    d.rectangle((4,3,5,4),fill=WOOD3)
    d.point((4,3),fill=BRASS_L)
    text(img, "VENDU", 28, 3, "chalk", BURG3, "center")
    return outline(img)


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
    img,d = layer(60,44)
    d.polygon([(1,3),(5,1),(53,2),(57,4),(58,36),(53,39),(5,38),(2,36)],fill=WOOD2,outline=INK0)
    # page block, gilded edges, and the fishtail of the red silk marker
    d.polygon([(8,31),(57,30),(57,35),(53,37),(8,36)],fill=PAPER1)
    d.line([(11,35),(53,36),(56,34)],fill=PAPER2)
    d.polygon([(40,34),(46,34),(46,43),(43,41),(40,43)],fill=BURG2,outline=BURG1)
    d.line((41,36,41,40),fill=BURG3)
    d.polygon([(2,3),(5,1),(53,2),(55,4),(55,32),(52,34),(6,33),(2,31)],fill=PAPER0,outline=WOOD0)
    d.line([(6,2),(6,31),(8,33)],fill=WOOD3,width=2)
    d.line((10,3,10,32),fill=WOOD1)
    d.line((12,4,12,31),fill=WOOD3)
    # tooled corners around the embossed count
    d.rounded_rectangle((15,5,52,30),radius=3,outline=WOOD3)
    d.rounded_rectangle((17,7,50,28),radius=3,outline=BRASS)
    for x,dx in ((19,1),(48,-1)):
        for y,dy in ((9,1),(26,-1)):
            d.line([(x+5*dx,y),(x+2*dx,y),(x+2*dx,y+2*dy),(x,y+2*dy),(x,y+5*dy)],fill=WOOD3)
            d.point((x+4*dx,y+3*dy),fill=BRASS)
    for y in (5,26):
        d.line((3,y,7,y),fill=BRASS)
        d.line((4,y+1,7,y+1),fill=WOOD3)
    if count:
        text(img,count,34,15,"sans",BRASS_L,"center")
    return img


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
    stage.alpha_composite(pendant(), (288, 0))
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
            art, price = scratch_parts["shop/scratcher"], 3
        else:
            art, price = sleeve_art["shelf"](sleeve_parts, "big_hands"), 10
        if i == sold:
            stage.alpha_composite(vendu(), (x + 8, SLOT_TOP + 40))
            continue
        stage.alpha_composite(art, (x, y))
        stage.alpha_composite(price_tag(price), (x + 16, 295))
    stage.alpha_composite(glass_glints(), (0, COUNTER_FRONT))

    # bottom bar
    stage.alpha_composite(plate(62), (6, 324))
    stage.alpha_composite(deck_pile(24), (108, 320))
    stage.alpha_composite(ticket("Restock", MONEY1, MONEY0, CREAM, "$1", 104), (158, 326))
    stage.alpha_composite(ticket("Bin Bulk", MONEY1, MONEY0, CREAM, "$2", 104), (268, 326))
    stage.alpha_composite(ticket("Grading", VIO2, VIO0, CREAM, "$2+", 96), (378, 326))
    stage.alpha_composite(binder(), (475, 315))
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
    note=Image.new("RGBA",(42,31))
    nd=ImageDraw.Draw(note)
    nd.polygon([(1,3),(38,0),(41,26),(5,30)],fill="#e3d2a8",outline="#5c4a36")
    text(note,"+10%",21,8,"sans","#7a1a2c","center")
    nd.line((9,22,33,19),fill="#7a1a2c")
    add("shop/note/salty",note)
    add("shop/bell", bell(), (12, 17))
    add("shop/counter", counter_top())
    add("shop/case", shelf_case())
    add("shop/pendant", pendant())
    add("shop/box", stock_box(), (60, 59))
    for kind in ("free", "offbrand", "repack", "collector"):
        add(f"shop/pack/{kind}", pack_art(kind))
    for kind in ("offbrand", "repack", "collector"):
        wrapper = pack_art(kind)
        for top in (True,False):
            half = wrapper.copy()
            for x in range(half.width):
                cut = half.height//4 + x%5//2
                bounds = (x,cut,x+1,half.height) if top else (x,0,x+1,cut)
                half.paste((0,0,0,0), bounds)
            add("pack/"+kind+("/top" if top else "/bottom"),half)
    for i in range(4):
        scrap = Image.new("RGBA",(8,8))
        d = ImageDraw.Draw(scrap)
        d.polygon([(0,2+i),(5,0),(7,3),(4,7)],"#e3d2a8")
        d.line((2,3,5,1),"#fff0b0")
        add(f"pack/scrap/{i+1}",scrap)
    for rarity in ("common", "uncommon", "rare"):
        add(f"shop/easel/{rarity}", collectible("", rarity))
    for name, img in scratch_parts.items():
        add(name, img, (8, 8) if name == "scratch/jeton" else (0, 0))
    for name, img in run_path(str(ROOT / "services.py"))["parts"](text).items():
        add(name, img, (0, 0))
    for name, img in run_path(str(ROOT / "patron.py"))["parts"](text).items():
        add(name, img, (0, 0))
    for name, img in sleeve_parts.items():
        add(name, img, (img.width // 2, img.height))
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
    scratch_art["preview"](scratch_parts, text).save(ROOT / "previews/scratchers@2x.png")
    sleeve_art["preview"](sleeve_parts, text).save(ROOT / "previews/sleeves@2x.png")
