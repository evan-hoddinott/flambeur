"""Run python art/shop/buraliste.py to paint the buraliste parts and a stage-scale proof."""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent
NN = Image.Resampling.NEAREST
W, H = 200, 172  # canvas, placed with its top-left at stage (220, 0). the counter edge cuts it at y 158

# palette (art/palette/flambeur.gpl)
INK0, INK1, INK2, INK3 = "#0e0b0a", "#1c1513", "#2e2320", "#43342e"
SKIN_D, SKIN_S, SKIN, SKIN_L = "#5c4a36", "#8c7656", "#bfa77e", "#e3d2a8"
CREAM, WHITE = "#f6ecd2", "#fffbe8"
G0, G1, G2, G3 = "#0f2a20", "#174034", "#1f5a46", "#2d7a5c"
FLUSH, FLUSH_D = "#d04a4e", "#a82a38"
EMBER, EMBER_L = "#e8501a", "#ffb03a"
BRASS, BRASS_L = "#c99a3a", "#e8c260"
NAVY, NAVY_L = "#1a3256", "#28497a"
RED = "#7a1a2c"


def layer():
    img = Image.new("RGBA", (W, H))
    return img, ImageDraw.Draw(img)


def outline(img, color=INK0):
    # 1 px ink outline around everything opaque, the duel sprites do the same
    # pad first: ImageChops.offset wraps around the edges
    a = Image.new("L", (W + 2, H + 2))
    a.paste(img.getchannel("A").point(lambda v: 255 if v else 0), (1, 1))
    grown = a.copy()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        grown = ImageChops.lighter(grown, ImageChops.offset(a, dx, dy))
    ring = ImageChops.subtract(grown, a).crop((1, 1, W + 1, H + 1))
    out = Image.new("RGBA", img.size, color)
    out.putalpha(ring)
    return Image.alpha_composite(out, img)


def px(d, pts, color):
    for p in pts:
        d.point(p, fill=color)


def torso():
    img, d = layer()
    # hunched shoulders and a belly, cut by the counter
    d.polygon([(18, 172), (22, 136), (34, 118), (62, 106), (86, 102), (114, 102), (138, 106), (166, 118), (178, 136), (182, 172)], fill=G2)
    # shadow side (light comes from the window, top-left)
    d.polygon([(140, 108), (166, 118), (178, 136), (182, 172), (150, 172), (152, 130)], fill=G1)
    d.polygon([(18, 172), (22, 136), (34, 118), (40, 116), (32, 140), (30, 172)], fill=G1)
    # knit ribs: dark vertical stitches
    for x in range(30, 176, 6):
        for y in range(124 + abs(x - 100) // 8, 172, 2):
            if (x + y) % 4 == 0:
                d.point((x, y), fill=G1)
    # shoulder highlight
    d.line([(40, 115), (62, 108), (82, 105)], fill=G3, width=2)
    # shirt in the V
    d.polygon([(82, 102), (118, 102), (108, 150), (100, 164), (92, 150)], fill=CREAM)
    d.polygon([(100, 112), (118, 102), (108, 150), (100, 164)], fill=SKIN_L)
    # collar points
    d.polygon([(80, 101), (94, 104), (88, 122)], fill=WHITE)
    d.polygon([(120, 101), (106, 104), (112, 122)], fill=SKIN_L)
    d.line([(80, 101), (88, 122), (94, 104)], fill=SKIN_S)
    d.line([(120, 101), (112, 122), (106, 104)], fill=SKIN_S)
    # cardigan edges, placket and brass buttons
    d.line([(80, 104), (93, 152), (100, 166)], fill=G3, width=3)
    d.line([(120, 104), (107, 152), (100, 166)], fill=G0, width=3)
    for y in (138, 152):
        x = 96 if y == 138 else 98
        d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=BRASS)
        d.point((x - 1, y - 1), fill=BRASS_L)
    # breast pocket with a pack of cigarettes peeking out
    d.rectangle([126, 128, 146, 144], fill=G1)
    d.line([(126, 128), (146, 128)], fill=G3)
    d.rectangle([129, 120, 139, 129], fill=NAVY)
    d.line([(129, 120), (139, 120)], fill=NAVY_L)
    d.rectangle([131, 123, 137, 125], fill=CREAM)
    d.line([(141, 121), (141, 128)], fill=WHITE)  # a loose cigarette
    return outline(img)


def neck():
    img, d = layer()
    d.polygon([(82, 86), (118, 86), (120, 108), (80, 108)], fill=SKIN_S)
    d.polygon([(82, 96), (118, 96), (110, 106), (90, 106)], fill=SKIN_D)
    return img


def head():
    img, d = layer()
    # ears
    for x0 in (62, 128):
        d.ellipse([x0, 56, x0 + 10, 76], fill=SKIN_S)
        d.ellipse([x0 + 3, 60, x0 + 7, 72], fill=SKIN_D)
    # skull: bald dome, wide jowly bottom
    d.ellipse([67, 20, 133, 84], fill=SKIN)
    d.polygon([(68, 60), (132, 60), (130, 88), (118, 100), (82, 100), (70, 88)], fill=SKIN)
    # shading on the right, highlight on the dome
    d.chord([67, 20, 133, 84], 300, 90, fill=SKIN_S)
    d.polygon([(124, 60), (132, 60), (130, 88), (118, 100), (112, 98), (124, 84)], fill=SKIN_S)
    d.ellipse([80, 26, 98, 36], fill=SKIN_L)
    d.ellipse([84, 28, 90, 31], fill=CREAM)
    # forehead wrinkles
    for y, x0, x1 in ((40, 84, 116), (45, 80, 120)):
        d.line([(x0, y), (x0 + 6, y - 1), (x1 - 6, y - 1), (x1, y)], fill=SKIN_S)
    # grey hair horseshoe on the sides, in tufts
    for side in (-1, 1):
        base, shade = (CREAM, SKIN_L) if side < 0 else (SKIN_L, SKIN)
        x_in, x_out = 100 + side * 24, 100 + side * 37
        tufts = [(x_out, 42), (x_out + side * 2, 47), (x_out, 52), (x_out + side * 2, 57), (x_out - side, 62),
                 (x_in + side * 3, 64), (x_in, 58), (x_in + side, 50), (x_in - side * 2, 43), (x_in + side * 4, 39)]
        d.polygon(tufts, fill=base)
        for y in (45, 51, 57):
            d.line([(x_in + side * 4, y), (x_out - side * 2, y + 2)], fill=shade)
    # ruddy cheeks
    for cx in (81, 119):
        px(d, [(x, y) for x in range(cx - 6, cx + 7) for y in range(72, 81) if (x + y) % 2 == 0 and ((x - cx) / 6) ** 2 + ((y - 76) / 4) ** 2 < 1], FLUSH_D)
    # jowl lines
    d.line([(78, 82), (80, 92), (86, 98)], fill=SKIN_S)
    d.line([(122, 82), (120, 92), (114, 98)], fill=SKIN_D)
    # chin stubble dots
    px(d, [(x, y) for x in range(86, 116, 3) for y in (96, 99) if (x + y) % 2], SKIN_S)
    return outline(img)


def eyes(look):
    # look = 'down' (reading), 'you' (side-eye at the player), 'shut' (sigh)
    img, d = layer()
    for cx in (87, 113):
        # eye bags
        d.line([(cx - 7, 69), (cx - 3, 71), (cx + 3, 71), (cx + 7, 69)], fill=SKIN_S)
        if look == 'shut':
            d.line([(cx - 6, 65), (cx - 2, 67), (cx + 2, 67), (cx + 6, 65)], fill=INK1, width=1)
            continue
        # half-lidded white sliver
        d.rectangle([cx - 5, 64, cx + 5, 67], fill=WHITE)
        d.line([(cx - 6, 63), (cx + 6, 63)], fill=INK1)  # heavy upper lid
        d.line([(cx - 6, 64), (cx + 6, 64)], fill=SKIN_D)
        if look == 'down':
            d.rectangle([cx - 2, 66, cx + 1, 67], fill=INK1)
        else:
            d.rectangle([cx + 1, 65, cx + 4, 67], fill=INK1)
            d.point((cx + 2, 65), fill=WHITE)
    return img


def brows(mood):
    # mood = 'grump' (pinched) or 'raised' (the god-pull stare)
    img, d = layer()
    for side in (-1, 1):
        cx = 100 + side * 13
        inner, outer = (cx - side * 9, cx + side * 9)
        if mood == 'grump':
            pts = [(inner, 60), (cx, 57), (outer, 58), (outer, 61), (cx, 61), (inner, 63)]
        else:
            pts = [(inner, 54), (cx, 51), (outer, 54), (outer, 57), (cx, 55), (inner, 57)]
        d.polygon(pts, fill=CREAM)
        d.line([pts[3], pts[4], pts[5]], fill=SKIN_S)
        for i in range(-8, 9, 3):
            d.point((cx + i, (pts[1][1] + pts[4][1]) // 2), fill=SKIN_L)
    return outline(img)


def nose():
    img, d = layer()
    # a big bulbous nose that sits on top of the mustache
    d.polygon([(97, 58), (103, 58), (107, 70), (93, 70)], fill=SKIN)
    d.line([(103, 60), (107, 69)], fill=SKIN_S)
    # the bulb: lighter and redder than the face so it pops
    d.ellipse([88, 66, 112, 83], fill=SKIN_L)
    d.chord([88, 66, 112, 83], 330, 110, fill=SKIN)
    d.ellipse([92, 68, 98, 73], fill=CREAM)
    px(d, [(x, y) for x in range(96, 110) for y in range(71, 82) if (x + y) % 2 == 0 and (x - 103) ** 2 + (y - 76) ** 2 < 26], FLUSH)
    # nostrils
    d.line([(92, 80), (96, 82)], fill=SKIN_D)
    d.line([(104, 82), (108, 80)], fill=SKIN_D)
    return outline(img, INK1)


def mustache(mood):
    # a big walrus mustache. 'grump' droops, 'puff' bristles up when he exhales
    img, d = layer()
    lift = -2 if mood == 'puff' else 0
    d.polygon([(100, 81), (110, 80), (120, 83 + lift), (126, 90 + lift), (124, 96), (116, 92), (108, 91), (100, 92),
               (92, 91), (84, 92), (76, 96), (74, 90 + lift), (80, 83 + lift), (90, 80)], fill=CREAM)
    d.polygon([(104, 88), (116, 86), (124, 92), (124, 96), (116, 92), (104, 91)], fill=SKIN_L)
    d.polygon([(76, 96), (74, 90 + lift), (78, 88), (84, 92)], fill=SKIN_L)
    for x in range(80, 122, 3):
        d.line([(x, 84), (x + (1 if x > 100 else -1), 90)], fill=SKIN_L if x < 100 else SKIN)
    d.line([(100, 82), (100, 90)], fill=SKIN)
    return outline(img)


def lip():
    img, d = layer()
    d.line([(94, 94), (106, 94)], fill=FLUSH_D)
    d.line([(95, 95), (105, 95)], fill=SKIN_S)
    return img


def cigarette(lit=True):
    img, d = layer()
    # hangs from the right corner of his mouth, tipped down
    d.line([(108, 93), (126, 99)], fill=WHITE, width=3)
    d.line([(108, 92), (125, 98)], fill=WHITE)
    d.line([(109, 95), (126, 100)], fill=SKIN_L)
    if lit:
        d.rectangle([125, 97, 128, 101], fill=EMBER)
        d.point((127, 98), fill=EMBER_L)
        d.point((128, 99), fill=SKIN_S)
    return outline(img)


def arms():
    img, d = layer()
    for side in (-1, 1):
        fill, rib = (G1, G0) if side > 0 else (G2, G1)
        shoulder, elbow, wrist = (100 + side * 66, 124), (100 + side * 76, 160), (100 + side * 44, 158)
        d.line([shoulder, elbow, wrist], fill=fill, width=20, joint="curve")
        d.ellipse([elbow[0] - 10, elbow[1] - 10, elbow[0] + 10, elbow[1] + 10], fill=fill)
        # cuff
        d.line([(wrist[0] + side * 4, 150), (wrist[0] + side * 4, 166)], fill=rib, width=3)
        for y in range(130, 158, 4):
            d.point((shoulder[0] + side * 4, y), fill=rib)
    return outline(img)


def hands():
    img, d = layer()
    for side in (-1, 1):
        cx = 100 + side * 40
        # back of the hand, fingers curled over the top edge of the paper
        d.rounded_rectangle([cx - 8, 146, cx + 8, 156], 3, fill=SKIN)
        d.rectangle([cx - 8, 153, cx + 8, 156], fill=SKIN_S)
        for i in (-4, 0, 4):
            d.line([(cx + i, 152), (cx + i, 156)], fill=SKIN_D)
        d.line([(cx - 6, 147), (cx + 2, 147)], fill=SKIN_L)
        # thumb
        tx = cx - side * 9
        d.rounded_rectangle([tx - 3, 149, tx + 3, 156], 2, fill=SKIN_S)
    return outline(img)


def paper():
    img, d = layer()
    # the sports paper, folded open on the counter
    d.polygon([(52, 150), (148, 150), (152, 172), (48, 172)], fill=SKIN_L)
    d.polygon([(100, 150), (148, 150), (152, 172), (100, 172)], fill=CREAM)
    d.line([(100, 150), (100, 172)], fill=SKIN_S)
    # masthead and columns
    d.rectangle([60, 153, 92, 157], fill=RED)
    px(d, [(x, 155) for x in range(62, 91, 3)], CREAM)
    for y in range(160, 172, 3):
        d.line([(58, y), (94, y)], fill=SKIN_S)
        d.line([(106, y), (144, y)], fill=SKIN_S)
    d.rectangle([108, 153, 122, 158], fill=SKIN)  # a photo
    return outline(img)


def compose(look='down', brow='grump', stache='grump', lit=True, front=True):
    # front = the paper and his hands, which rest on the counter top and draw over it
    parts = [torso(), arms(), neck(), head(), eyes(look), brows(brow), nose(), mustache(stache), lip(), cigarette(lit)]
    if front:
        parts += [paper(), hands()]
    out = Image.new("RGBA", (W, H))
    for p in parts:
        out = Image.alpha_composite(out, p)
    return out


def front():
    return Image.alpha_composite(paper(), hands())


def proof():
    # stage-scale proof on a stand-in back wall and counter, then a 3x close-up
    frames = [("idle", compose()), ("side-eye", compose(look='you')), ("sigh", compose(look='shut', stache='puff')),
              ("god pull", compose(look='you', brow='raised', lit=False))]
    stage = Image.new("RGBA", (640, 360), "#2a2010")
    d = ImageDraw.Draw(stage)
    d.rectangle([0, 0, 640, 165], fill="#3d2a10")
    for x in range(0, 640, 48):
        d.rectangle([x + 6, 20, x + 40, 150], fill="#2a2010")
    stage.alpha_composite(compose(front=False), (220, 0))
    # stand-in counter top (zinc) and the offer shelf with 8 card-size slots, to check proportions
    d.rectangle([0, 150, 640, 172], fill="#8c7656")
    d.line([(0, 150), (640, 150)], fill="#e3d2a8")
    d.line([(0, 172), (640, 172)], fill="#5c4a36")
    stage.alpha_composite(front(), (220, 0))
    d.rectangle([0, 173, 640, 360], fill="#1c1513")
    for i in range(8):
        x = 9 + i * 76 + ((i > 2) + (i > 4) + (i > 6)) * 6  # 8 × 72 wide, groups: packs · collectibles · scratchers · sleeve
        d.rectangle([x, 186, x + 71, 289], outline="#5c4a36")
        d.rectangle([x + 16, 296, x + 55, 307], fill="#3d2a10")
    stage.resize((1280, 720), NN).save(ROOT / "previews/buraliste-stage@2x.png")

    sheet = Image.new("RGBA", (W * 4 + 30, H + 20), "#3d2a10")
    for i, (_, f) in enumerate(frames):
        sheet.alpha_composite(f, (6 + i * (W + 6), 10))
    sheet.resize((sheet.width * 2, sheet.height * 2), NN).save(ROOT / "previews/buraliste-frames@2x.png")


if __name__ == "__main__":
    proof()
