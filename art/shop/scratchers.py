"""La Fortune du Pot printing plates. counter.py packs these into the shop atlas."""

import math
from PIL import Image, ImageDraw, ImageColor

WINE, RED, ROSE = "#4e1020", "#7a1a2c", "#a82a38"
UMBER, COPPER, GOLD, LIGHT = "#6b4a1a", "#9c7028", "#e8c260", "#fff0b0"
STOCK, CREAM, EDGE = "#e3d2a8", "#f6ecd2", "#bfa77e"
GREEN, MINT = "#1e4a24", "#6fcf6f"
SILVER = ["#5c5c6e", "#818193", "#a2a2b4", "#c2c2d0", "#dcdce8"]
WINDOWS = [(20 + 56 * col, 126 + 52 * row) for row in range(2) for col in range(3)]


def blank(w, h):
    return Image.new("RGBA", (w, h))


def pixel_art(rows, colors):
    img = blank(16, 16)
    colors = {key: ImageColor.getcolor(value, "RGBA") for key, value in colors.items()}
    for y, row in enumerate(rows.strip().splitlines()):
        assert len(row) == 16
        for x, c in enumerate(row):
            if c != ".":
                img.putpixel((x, y), colors[c])
    return img


def emblems():
    return {
        "code": pixel_art(
            """
..xxxxxxxxxx....
..xppppppppgx...
..xplllllxlggx..
..xppppppxxxxxx.
..xpgggppppppgx.
..xppppppppfpgx.
..xpppppppffpgx.
..xpppppfpofpgx.
..xppppffpoopgx.
..xppfpofpoopgx.
..xpffpoopoorgx.
..xpoppooporrgx.
..xprrprrprrrgx.
..xgggggggggggx.
..xllllllllllgx.
...xxxxxxxxxxx..""",
            dict(
                x=UMBER, p=CREAM, g=EDGE, l=LIGHT, f="#ffb03a", o="#e8501a", r="#a8260a"
            ),
        ),
        "checklist": pixel_art(
            """
...xxxxxxxxx....
..xppppppppgx...
..xprppppppgx...
..xppppppppgx...
..xpphhrhhpgx...
..xprhrrrrpgx...
..xpprrrrppgx...
..xppprrpppgx..k
..xppppppppgx.kk
..xppppppppgxkmk
..xpppppkkpgkmkk
..xppppkmmkkmkk.
..xgggggkmmmkk..
...xxxxxxkmkk...
..........kk....
................""",
            dict(x=UMBER, p=CREAM, g=EDGE, r=RED, h="#d04a4e", k=GREEN, m=MINT),
        ),
        "wishlist": pixel_art(
            """
................
...v.......x....
..vbv.....xgx...
...v......xlx...
.......xxxxlgxxx
........xglllgx.
......vv.xllgx..
....vvbvxlgxgx..
...vbv..xgx.xgx.
..vv...gx....x..
.v...gg.........
...ggg.....v....
..gg......vbv...
.gg........v....
.g..............
................""",
            dict(v="#7a4ab0", b="#b088e0", x=UMBER, g=GOLD, l=LIGHT),
        ),
        "grail": pixel_art(
            """
......a.........
........a.......
...xxxxxxxxxx...
..xglaaaaaaglx..
.xxlgmmmmmmggxx.
xgxlgggggggcxggx
x.xlgllllggcx..x
.xgxllggggcxggx.
..xxxllggcxxx...
.....xggcx......
......xgx.......
......xlx.......
.....xlgcx......
....xxggcxx.....
...xllggggcx....
...xxxxxxxxx....""",
            dict(x=UMBER, l=LIGHT, g=GOLD, c=COPPER, a="#8fd14f", m="#2a4a14"),
        ),
    }


def cocotte():
    img = blank(54, 34)
    d = ImageDraw.Draw(img)
    # curls of steam above the jetons
    for x, y in [(20, 0), (32, 2)]:
        d.line(
            [(x + 2, y), (x, y + 2), (x, y + 4), (x + 3, y + 6), (x + 3, y + 7)],
            fill=STOCK,
        )
    d.ellipse((7, 14, 46, 23), fill=UMBER, outline=WINE)
    for x, y, face, side in [
        (12, 12, CREAM, EDGE),
        (18, 10, MINT, GREEN),
        (26, 9, CREAM, EDGE),
        (31, 12, "#d04a4e", WINE),
        (21, 14, "#d04a4e", WINE),
        (34, 15, MINT, GREEN),
        (16, 15, CREAM, EDGE),
        (26, 15, CREAM, EDGE),
    ]:
        d.ellipse((x, y + 2, x + 9, y + 6), fill=side, outline=WINE)
        d.ellipse((x, y, x + 9, y + 4), fill=face, outline=WINE)
        d.line((x + 3, y + 2, x + 6, y + 2), fill=side)
    for box in [(0, 18, 11, 25), (42, 18, 53, 25)]:
        d.rounded_rectangle(box, radius=3, outline=WINE, width=3)
        d.line((box[0] + 3, 19, box[2] - 2, 19), fill=GOLD)
    bowl = [
        (7, 19),
        (46, 19),
        (45, 25),
        (41, 30),
        (35, 33),
        (18, 33),
        (12, 30),
        (8, 25),
    ]
    d.polygon(bowl, fill="#a8260a", outline=WINE)
    d.polygon(
        [(10, 22), (41, 22), (38, 28), (34, 30), (17, 30), (12, 27)], fill="#e8501a"
    )
    d.polygon([(12, 23), (20, 23), (22, 29), (16, 28)], fill="#ff7a24")
    d.line((12, 23, 14, 26), fill=LIGHT)
    # hammered copper and the maker's lozenge
    d.polygon(
        [(26, 22), (30, 25), (26, 28), (22, 25)], fill="#a8260a", outline="#ffb03a"
    )
    d.line((25, 25, 27, 25), fill=GOLD)
    d.line((37, 24, 39, 23), fill="#ff7a24")
    d.line((19, 31, 34, 31), fill=COPPER)
    d.rectangle((6, 18, 47, 20), fill=UMBER)
    d.line((7, 18, 46, 18), fill=GOLD)
    return img


def foil(w, h):
    img = blank(w, h)
    d = ImageDraw.Draw(img)
    for y in range(h):
        for x in range(w):
            band = (x + y // 2) % 34
            shade = 3 if band < 8 else 1 if band > 26 else 2
            dx, dy = (x + 5 * (y // 10)) % 10 - 5, y % 10 - 5
            if abs(dx) * 2 + abs(dy) in (4, 5):
                shade += 1 if dx < 0 else -1
            d.point((x, y), fill=SILVER[shade])
    d.line([(0, h - 2), (0, 0), (w - 2, 0)], fill=SILVER[4])
    d.line([(1, h - 1), (w - 1, h - 1), (w - 1, 1)], fill=SILVER[0])
    return img


def ticket(close, text):
    w, h = (200, 280) if close else (72, 104)
    img = blank(w, h)
    d = ImageDraw.Draw(img)
    d.rectangle((2, 2, w - 1, h - 1), fill="#1c1513")
    d.rectangle((0, 0, w - 3, h - 3), fill=CREAM)
    for x in range(2, w - 2, 8 if close else 5):
        for y in (0, h - 3):
            d.rectangle((x, y, x + 1, y + 2), fill=(0, 0, 0, 0))
    cx = w // 2 - 1
    mid = 75 if close else 42
    foot = 232 if close else 85
    d.rectangle((3, 3, w - 6, h - 6), outline=RED)
    d.rectangle((5, 5, w - 8, h - 8), outline=COPPER)
    d.rectangle((6, 6, w - 9, mid), fill=WINE)
    # fan of engraved rays, with a scalloped brass cartouche around the brand
    plate = Image.new("RGBA", (w - 14, mid - 5), WINE)
    rays = ImageDraw.Draw(plate)
    for i in range(0, 181, 10):
        angle = math.radians(i)
        rays.line(
            (
                cx - 6,
                mid - 6,
                cx - 6 + int(w * math.cos(angle)),
                mid - 6 - int(mid * math.sin(angle)),
            ),
            fill=RED,
        )
    img.alpha_composite(plate, (6, 6))
    top = 10 if close else 8
    bw = 74 if close else 26
    bh = 32 if close else 18
    d.rounded_rectangle(
        (cx - bw, top, cx + bw, top + bh), radius=bh // 2, fill=WINE, outline=GOLD
    )
    text(
        img,
        "LA FORTUNE",
        cx,
        top + (0 if close else 1),
        "didone" if close else "tiny",
        LIGHT,
        "center",
    )
    text(
        img,
        "du Pot",
        cx,
        top + (18 if close else 8),
        "sans" if close else "tiny",
        GOLD,
        "center",
    )
    pot = cocotte()
    if close:
        pot = pot.resize((108, 68), Image.Resampling.NEAREST)
    img.alpha_composite(pot, (cx - pot.width // 2, 39 if close else 24))
    # matched ornaments, inspired by engraved leaves on a stock certificate
    for side in (-1, 1):
        if close:
            # curling acanthus on either side of the pot; mirror the engraving
            def leaf(points, color):
                d.polygon([(cx + side * x, y) for x, y in points], fill=color)

            for n in range(3):
                x, y = 56 + 10 * n, 89 - 4 * n
                leaf([(x, y), (x + 2, y - 7), (x + 5, y - 10), (x + 5, y - 5)], COPPER)
                leaf(
                    [(x + 2, y), (x + 8, y - 1), (x + 11, y - 4), (x + 6, y - 4)], GOLD
                )
            d.line(
                [(cx + side * 51, 94), (cx + side * 68, 87), (cx + side * 84, 78)],
                fill=COPPER,
            )
        else:
            d.point((cx + side * 25, mid - 4), fill=GOLD)
    if close:
        text(img, "3 SYMBOLES IDENTIQUES", cx, 111, "sans", RED, "center")
        for x, y in WINDOWS:
            d.rectangle((x - 2, y - 2, x + 49, y + 47), outline=COPPER)
            d.rectangle((x, y, x + 47, y + 45), fill=STOCK)
            d.ellipse((x + 6, y + 5, x + 41, y + 40), outline=EDGE)
    else:
        d.rectangle((9, 60, 60, 82), outline=COPPER, fill=STOCK)
    d.line((8, foot, w - 11, foot), fill=COPPER)
    text(img, "$3", 10, foot + 2, "didone" if close else "sans", GREEN)
    text(img, "BASE", 33 if close else 24, foot + (9 if close else 4), "tiny", GREEN)
    text(
        img,
        "041 713" if close else "0417",
        w - 12,
        foot + 4,
        "sans" if close else "tiny",
        UMBER,
        "right",
    )
    if close:
        text(img, "N", w - 60, foot + 4, "sans", UMBER)
        d.rectangle((w - 54, foot + 5, w - 52, foot + 7), outline=UMBER)
        for x in range(48, 126, 4):
            d.line(
                (x, foot + 6, x, foot + 12 + (x % 3)), fill=EDGE, width=1 + (x % 3 == 0)
            )
        text(img, "1 chance sur 33 de gagner le Graal", cx, 258, "sans", WINE, "center")
    return img


def suit_stamp(suit):
    img = blank(28, 32)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((8, 0, 19, 10), radius=4, fill=COPPER, outline=UMBER)
    d.rectangle((11, 9, 16, 14), fill=UMBER)
    d.line((10, 3, 10, 6), fill=GOLD)
    d.rounded_rectangle((1, 12, 26, 30), radius=3, fill=UMBER)
    d.rectangle((2, 27, 25, 30), fill=WINE)
    d.rounded_rectangle((2, 12, 25, 26), radius=2, fill=STOCK, outline=COPPER)
    ink = RED if suit in ("heart", "diamond") else "#1c1513"
    if suit == "diamond":
        d.polygon([(14, 14), (19, 19), (14, 25), (9, 19)], fill=ink)
    if suit == "heart":
        d.ellipse((8, 15, 14, 20), fill=ink)
        d.ellipse((13, 15, 19, 20), fill=ink)
        d.polygon([(8, 18), (19, 18), (14, 24)], fill=ink)
    if suit == "club":
        for x, y in ((11, 14), (8, 18), (15, 18)):
            d.ellipse((x, y, x + 5, y + 5), fill=ink)
    if suit == "spade":
        d.polygon([(14, 14), (20, 20), (8, 20)], fill=ink)
        for x in (8, 14):
            d.ellipse((x, 18, x + 5, 23), fill=ink)
    if suit in ("spade", "club"):
        d.polygon([(14, 19), (16, 25), (12, 25)], fill=ink)
    return img


def chart(text):
    img = blank(104, 64)
    d = ImageDraw.Draw(img)
    d.polygon(
        [(0, 0), (95, 0), (103, 8), (103, 63), (0, 63)], fill=CREAM, outline=UMBER
    )
    d.polygon([(95, 1), (95, 8), (102, 8)], fill=EDGE)
    text(img, "CODE", 8, 1, "didone", WINE)
    for x in (7, 17, 27, 37, 47, 57, 67, 77, 87, 97):
        d.line((x, 22, x, 53), fill=STOCK)
    for y in (23, 33, 43, 53):
        d.line((7, y, 97, y), fill=STOCK)
    d.line([(7, 22), (7, 54), (97, 54)], fill=COPPER)
    return img


def parts(text):
    base = ticket(False, text)
    cover = foil(48, 19)
    ImageDraw.Draw(cover).rectangle((6, 4, 41, 14), fill=SILVER[3], outline=SILVER[2])
    text(cover, "GRATTEZ", 24, 5, "tiny", SILVER[4], "center")
    text(cover, "GRATTEZ", 24, 4, "tiny", SILVER[0], "center")
    shelf = base.copy()
    shelf.alpha_composite(cover, (11, 62))
    stamp = blank(110, 18)
    d = ImageDraw.Draw(stamp)
    d.rounded_rectangle((0, 0, 109, 17), radius=2, outline=RED, width=2)
    text(stamp, "GAGNÉ !", 5, 3, "sans", RED)
    d.line((46, 4, 46, 13), fill=RED)
    for x in (3, 19, 54, 72, 81, 103):
        d.point((x, 0 if x % 2 else 16), fill=(0, 0, 0, 0))

    coin = blank(16, 16)
    d = ImageDraw.Draw(coin)
    d.ellipse((0, 1, 15, 15), fill=UMBER)
    d.ellipse((0, 0, 15, 14), fill=CREAM, outline=UMBER)
    d.ellipse((2, 2, 13, 12), outline=COPPER)
    text(coin, "F", 8, 2, "sans", UMBER, "center")
    sprites = {
        "shop/scratcher": shelf,
        "scratch/shelf-paper": base,
        "scratch/shelf-foil": cover,
        "scratch/ticket": ticket(True, text),
        "scratch/foil": foil(48, 46),
        "scratch/stamp": stamp,
        "scratch/jeton": coin,
    }
    for name, img in emblems().items():
        sprites["scratch/" + name] = img
    sprites["scratch/chart"] = chart(text)
    for suit in ("heart", "diamond", "spade", "club"):
        sprites["scratch/suit/" + suit] = suit_stamp(suit)
    return sprites


def preview(sprites, text):
    img = Image.new("RGBA", (552, 366), "#174034")
    for i in range(2):
        ticket_img = sprites["scratch/ticket"].copy()
        for (x, y), name in zip(
            WINDOWS, ["grail", "wishlist", "checklist", "wishlist", "grail", "wishlist"]
        ):
            if i:
                ticket_img.alpha_composite(
                    sprites["scratch/" + name].resize(
                        (32, 32), Image.Resampling.NEAREST
                    ),
                    (x + 8, y + 7),
                )
            else:
                ticket_img.alpha_composite(sprites["scratch/foil"], (x, y))
        if i:
            stamp = sprites["scratch/stamp"].copy()
            text(stamp, "WISHLIST", 77, 3, "sans", RED, "center")
            stamp = stamp.rotate(7, resample=Image.Resampling.NEAREST, expand=True)
            ticket_img.alpha_composite(stamp, ((200 - stamp.width) // 2, 161))
        img.alpha_composite(ticket_img, (12 + i * 210, 14))
    img.alpha_composite(sprites["shop/scratcher"], (449, 14))
    img.alpha_composite(sprites["scratch/jeton"], (508, 106))
    for i, name in enumerate(("code", "checklist", "wishlist", "grail")):
        y = 132 + i * 41
        img.alpha_composite(
            sprites["scratch/" + name].resize((32, 32), Image.Resampling.NEAREST),
            (435, y),
        )
        text(img, name.upper(), 475, y + 9, "tiny", CREAM)
    img.alpha_composite(sprites["scratch/chart"], (15, 297))
    for i, suit in enumerate(("heart", "diamond", "spade", "club")):
        img.alpha_composite(sprites["scratch/suit/" + suit], (145 + i * 40, 313))
    return img.resize((img.width * 2, img.height * 2), Image.Resampling.NEAREST)
