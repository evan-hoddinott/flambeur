"""Miniature printed prizes and the cuff they tuck into."""
from PIL import Image, ImageDraw

INK = "#1c1513"
PAPER = "#f6ecd2"
EDGE = "#bfa77e"
GOLD = "#e8c260"
RED = "#7a1a2c"
LIGHT = "#fff0b0"
COLORS = {
    "code": RED, "checklist": "#3a8040", "wishlist": "#7a4ab0", "grail": GOLD,
    "stylo": "#28497a", "broyeuse": "#43342e", "photocopie": "#3e9ab0",
    "reprint": "#9c7028", "foil": GOLD, "holo": "#9a6ad0", "prism": "#e8501a",
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
    elif key in ("foil","reprint"):
        d.polygon([(4,4),(13,5),(10,12),(13,14),(3,14),(1,12)], GOLD if key=="foil" else PAPER, INK)
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


def parts(text, originals):
    out = {}
    for key, ink in COLORS.items():
        mark = originals.get("scratch/"+key)
        if mark is None:
            mark = emblem(key)
            out["scratch/"+key] = mark
        im = Image.new("RGBA",(24,34))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle((0,0,23,33),2,PAPER,INK)
        d.rectangle((2,2,21,7),ink)
        d.line((3,3,16,3),LIGHT)
        d.rectangle((2,9,21,28),outline=EDGE)
        im.alpha_composite(mark,(4,11))
        for x in range(3,22,3):
            d.point((x,30),INK)
        out["insert/face/"+key] = im
    im = Image.new("RGBA",(24,34))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0,0,23,33),2,RED,INK)
    d.rectangle((2,4,21,30),outline=GOLD)
    d.polygon([(12,5),(20,17),(12,29),(3,17)],"#4e1020",GOLD)
    text(im,"F",12,10,"didone",LIGHT,"center")
    for x in range(2,22,3):
        d.point((x,2),GOLD)
    out["insert/back"] = im
    im = Image.new("RGBA",(58,24))
    d = ImageDraw.Draw(im)
    d.polygon([(0,3),(52,0),(57,3),(55,17),(9,23),(1,18)],"#302036",INK)
    d.polygon([(1,5),(55,2),(54,8),(4,13)],PAPER,INK)
    d.line((4,10,52,5),EDGE)
    d.polygon([(3,12),(54,7),(55,17),(9,23),(3,19)],"#292632",INK)
    d.line((7,13,52,8),"#53505a")
    d.ellipse((45,9,51,14),"#9c7028",INK)
    d.line((47,10,49,10),LIGHT)
    out["you/cuff"] = im
    return out
