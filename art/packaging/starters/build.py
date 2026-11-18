"""Draw the tuck cartons at game resolution. Run with Python and Pillow."""
import json
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent
ART = OUT.parents[1]
INK = "#1c1513"
GILT = "#c99a3a"
LIGHT = "#fff0b0"
MID = "#9c7028"
DEEP = "#6b4a1a"
CREAM = "#f6ecd2"
STOCKS = {
    # printed name, spine, deepest ink, board, midtone, light catching the flap
    "classic": ("Classic", "CLASSIQUE", "#2a0910", "#4e1020", "#7a1a2c", "#a82a38"),
    "forge": ("Flambé", "FLAMBÉ", "#2a0910", "#5a1206", "#a8260a", "#e8501a"),
    "suited": ("Suited", "DUO", "#0f1d33", "#1a3256", "#28497a", "#3e66a0"),
    "highroller": ("High Roller", "GRAND JEU", "#120e08", "#2a2010", "#3d2a10", "#6b4a1a"),
    "bargain": ("Bargain Bin", "SOLDES", "#3d2a10", "#5c4a36", "#8c7656", "#bfa77e"),
    "collector": ("Collector", "ARCHIVES", "#2a1440", "#4e2a78", "#7a4ab0", "#b088e0"),
    "standard": ("Standard", "STANDARD", "#0f2a20", "#174034", "#1f5a46", "#3a8040"),
    "sealed": ("Flambeur", "FLAMBEUR", "#2a0910", "#4e1020", "#7a1a2c", "#a82a38"),
}

font_atlas = Image.open(ART / "fonts/fonts.png").convert("RGBA")
fonts = json.loads((ART / "fonts/fonts.json").read_text())


def label(s, font, color):
    info = fonts[font]
    if info["caps"]:  # didone and tiny only have capitals
        s = s.upper()
    runs = []
    cursor = 0
    for ch in s:
        if ch == " ":
            cursor += info["space"]
            continue
        x, y, w, h, top, left, advance = info["glyphs"][ch]
        mask = font_atlas.crop((x, y, x + w, y + h)).getchannel("A")
        runs.append((cursor + left, top, mask))
        cursor += advance
    im = Image.new("RGBA", (cursor + 1, info["line"] + 2))
    for x, y, mask in runs:
        im.paste(color, (x, y, x + mask.width, y + mask.height), mask)
    return im.crop(im.getbbox())


def center(im, part, cx, y):
    im.alpha_composite(part, (cx - part.width // 2, y))


def tile(kind):
    atlas = Image.open(ART / "cards/cards.png").convert("RGBA")
    data = json.loads((ART / "cards/cards.json").read_text())
    entry = next(e for e in data["meta"]["slices"] if e["name"] == f"back/tile/{kind}")
    b = entry["keys"][0]["bounds"]
    return atlas.crop((b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]))


def device(kind):
    im = Image.new("RGBA", (44, 40))
    d = ImageDraw.Draw(im)
    if kind == "standard":
        d.polygon([(9,5),(35,5),(34,23),(29,30),(22,35),(15,30),(10,24)], fill="#174034", outline=GILT)
        d.line([(11,7),(32,7)], fill=LIGHT)
        f = label("F","didone",LIGHT)
        center(im, f, 22, 11)
    elif kind == "classic":
        # two cast, opposed F punches share a single crossbar
        punch = [(5,8),(25,8),(25,15),(23,15),(21,11),(14,11),(14,20),
                 (20,20),(21,17),(23,17),(23,25),(21,25),(20,23),(14,23),
                 (14,31),(18,32),(18,34),(5,34),(5,32),(9,31),(9,11),(5,10)]
        d.polygon([(43-x,39-y) for x,y in punch], fill=MID)
        d.line([(19,27),(21,30),(36,30)], fill=GILT)
        d.polygon(punch, fill=GILT, outline=DEEP)
        d.line([(5,8),(25,8),(25,12)], fill=LIGHT)
        d.line([(10,12),(10,30)], fill="#e8c260")
        d.line([(14,20),(20,20)], fill=LIGHT)
    elif kind == "forge":
        # the crucible tips right and the stream gathers in the mould
        d.polygon([(5,11),(19,5),(32,13),(25,22),(13,26),(6,19)], fill=INK, outline=GILT)
        d.polygon([(6,11),(19,6),(29,12),(20,16)], fill="#e8501a", outline="#ffb03a")
        d.line([(10,11),(18,8),(24,10)], fill=LIGHT)
        d.polygon([(7,14),(18,18),(23,17),(17,23),(13,24),(9,20)], fill=MID)
        d.line([(7,15),(11,20),(15,22)], fill="#e8c260")
        d.line([(4,19),(2,22),(3,25),(7,25),(11,22)], fill=GILT,width=2)
        d.polygon([(25,12),(32,12),(34,15),(34,22),(36,26),(34,29),(32,25),(31,17)],fill="#ff7a24")
        d.line([(27,12),(31,13),(32,15),(32,20)],fill="#ffe08a")
        d.polygon([(23,30),(32,27),(41,30),(40,34),(32,37),(23,34)],fill="#3d2a10",outline=GILT)
        d.polygon([(25,30),(32,28),(38,30),(32,32)],fill="#ffb03a")
    elif kind == "suited":
        for pts, color in [([(9,28),(30,9),(32,11),(12,31)],CREAM), ([(11,10),(13,9),(34,29),(31,31)],GILT)]:
            d.polygon(pts,fill=color,outline=MID)
        for x, sign in [(11,-1),(32,1)]:
            d.line([(x-3,28+sign*3),(x+3,28-sign*3)],fill=LIGHT,width=2)
            d.line([(x,30),(x+4*sign,34)],fill=GILT,width=2)
            d.ellipse((x+4*sign-2,33,x+4*sign+1,36),fill=LIGHT)
        d.polygon([(5,7),(8,6),(12,8),(15,5),(19,6),(21,9),(20,13),(14,20),(5,14),(3,11)],fill="#a82a38",outline="#d04a4e")
        d.line([(5,10),(7,8),(9,8)],fill="#e3d2a8")
        d.polygon([(29,3),(38,10),(40,14),(39,17),(36,19),(32,18),(35,22),(27,22),(29,17),(25,19),(22,17),(22,13)], fill=INK,outline=CREAM)
        d.line([(25,12),(29,7)],fill="#8c7656")
    elif kind == "highroller":
        for x,y in [(4,26),(6,21),(7,16)]:
            pts = [(x,y+3),(x+22,y),(x+30,y+4),(x+30,y+8),(x+7,y+12),(x,y+8)]
            d.polygon(pts,fill=DEEP,outline=INK)
            d.polygon(pts[:3]+[(x+7,y+8)],fill=GILT,outline=MID)
            d.line([(x+8,y+8),(x+28,y+5)],fill=LIGHT)
            for i in (9,20):
                d.line([(x+i,y+8-i//10),(x+i,y+10-i//10)],fill="#e8c260")
        d.polygon([(10,6),(16,10),(21,3),(27,10),(34,5),(31,17),(14,19)],fill=GILT,outline=DEEP)
        d.line([(11,7),(16,11),(21,4),(27,11),(33,6)],fill=LIGHT)
        d.line([(15,16),(30,14)],fill=LIGHT)
        d.point([(17,14),(27,12)],fill="#7a1a2c")
    elif kind == "bargain":
        d.line([(34,15),(39,8),(38,4),(35,3),(31,4),(30,6)],fill="#e3d2a8")
        d.polygon([(3,13),(29,9),(37,15),(38,24),(10,31),(4,27)],fill="#bfa77e",outline=INK)
        d.polygon([(3,11),(29,7),(36,13),(37,22),(9,28),(4,25)],fill="#e3d2a8",outline="#8c7656")
        d.line([(5,12),(28,8),(33,12)],fill=CREAM)
        d.ellipse((29,12,32,15),fill=INK,outline="#8c7656")
        mark=label("SOLDE","tiny","#7a1a2c").rotate(10,resample=Image.Resampling.NEAREST,expand=True)
        im.alpha_composite(mark,(6,14))
        d.line([(7,25),(30,19)],fill="#d04a4e")
    elif kind == "collector":
        d.polygon([(14,7),(36,10),(34,36),(11,32)],fill="#4e2a78",outline="#b088e0")
        d.polygon([(9,5),(32,7),(30,33),(6,30)],fill="#0f1d33",outline=CREAM)
        d.polygon([(13,10),(28,11),(26,28),(11,26)],fill="#28497a",outline="#8c7656")
        d.polygon([(21,13),(24,18),(20,23),(17,18)], fill=GILT)
        d.line([(13,16),(17,12),(20,12)],fill="#e3d2a8")
        for y in (11,23):
            d.ellipse((3,y-6,15,y+3),outline=DEEP,width=3)
            d.arc((3,y-6,15,y+2),160,355,fill=LIGHT,width=2)
            d.line([(5,y+1),(8,y+2)], fill=GILT)
    else:
        # a folded fan of cards under a hot wax seal
        for x,y,angle in [(8,5,22),(15,3,0),(20,5,-22)]:
            card=Image.new("RGBA",(16,24))
            c=ImageDraw.Draw(card)
            c.rounded_rectangle((0,0,15,23),2,fill=CREAM,outline="#5c4a36")
            c.rectangle((2,2,13,21),fill="#7a1a2c",outline=MID)
            c.polygon([(8,5),(11,11),(8,17),(4,11)],outline=GILT)
            im.alpha_composite(card.rotate(angle,resample=Image.Resampling.NEAREST,expand=True),(x-4,y))
        d.polygon([(11,24),(18,26),(15,38),(12,34),(8,35)],fill="#a82a38",outline="#4e1020")
        d.polygon([(19,27),(24,24),(29,35),(24,33),(21,37)],fill="#a82a38",outline="#4e1020")
        d.polygon([(10,23),(12,19),(18,17),(24,18),(28,22),(27,28),(23,31),(16,32),(11,29)],fill="#a82a38",outline="#4e1020")
        d.ellipse((13,19,25,29),outline="#d04a4e")
        center(im,label("F","sans","#e3d2a8"),19,21)
    return im


def carton(kind):
    name, spine, dark, board, mid, edge = STOCKS[kind]
    im = Image.new("RGBA", (88,112))
    d = ImageDraw.Draw(im)
    # front board, folded top and narrow right spine form a single closed carton
    d.polygon([(3,13),(15,4),(81,4),(84,6),(84,97),(73,107),(5,107),(3,105)],fill=INK)
    d.polygon([(72,15),(83,7),(83,96),(72,105)], fill=dark)
    d.line([(82,9),(82,95),(74,102)],fill=mid)
    d.line([(74,16),(74,101)],fill=board)
    for y in (23,26,84,87):
        d.line([(75,y),(81,y-4)],fill=MID)
    spine_text=label(spine,"tiny","#bfa77e").transpose(Image.Transpose.ROTATE_90)
    im.alpha_composite(spine_text,(76,56-spine_text.height//2))
    d.polygon([(5,13),(16,5),(81,5),(71,13)],fill=mid)
    d.line([(16,6),(76,6),(70,11)],fill=edge)
    d.line([(9,12),(17,7),(66,7)],fill=edge)
    d.line([(65,7),(69,11),(68,12)],fill=board)
    d.rectangle((4,14,71,105),fill=board)
    d.line([(4,104),(4,15),(70,15)],fill=edge)
    d.line([(70,16),(70,104),(5,104)],fill=dark)
    # The sleeve has a half-moon thumb cut. The scored flap shows through.
    d.rectangle((26,14,48,16),fill=mid)
    d.polygon([(25,14),(29,18),(33,20),(42,20),(46,18),(49,14)],fill=dark)
    d.line([(26,14),(30,17),(34,18),(41,18),(45,16),(47,14)],fill=edge)

    pat=tile("classic" if kind=="sealed" else kind)
    field=Image.new("RGBA",(57,50))
    for y in range(0,50,pat.height):
        for x in range(0,57,pat.width):
            field.paste(pat,(x,y))
    im.alpha_composite(field,(9,34))
    # Flat foil edging has squared shoulders and small fleurons in the corners.
    border=[(9,24),(18,24),(20,22),(55,22),(57,24),(66,24),(66,98),
            (58,98),(55,101),(20,101),(17,98),(9,98),(9,24)]
    d.line(border,fill=MID)
    d.line([(10,31),(10,25),(17,25)],fill=GILT)
    d.line([(58,97),(65,97),(65,91)],fill=DEEP)
    # Masthead is printed on solid board over the patterned field.
    center(im,label("FLAMBEUR" if kind!="sealed" else "MAISON","tiny",CREAM),38,25)
    d.line([(15,32),(61,32)],fill=GILT)
    for x,s in [(14,1),(61,-1)]:
        for y,v in [(37,1),(79,-1)]:
            d.line([(x,y+6*v),(x,y),(x+7*s,y)],fill=GILT)
            d.line([(x+2*s,y+3*v),(x+4*s,y+3*v),(x+4*s,y+2*v)],fill=MID)
    d.ellipse((15,36,60,80),fill=dark,outline=MID)
    d.arc((17,38,58,78),124,268,fill=GILT)
    d.arc((17,38,58,78),298,81,fill=DEEP)
    center(im,device(kind),38,38)
    # Use the game's Didone for editions that fit, and its sans for long names.
    title=label(name,"didone",LIGHT)
    if title.width > 60:
        title=label(name,"sans",LIGHT)
    d.rectangle((7,82,68,99),fill=board)
    d.line([(12,82),(63,82)],fill=MID)
    center(im,title,38,91-title.height//2)
    for x in (14,61):
        d.line([(x-2,100),(x+2,100)],fill=GILT)
    center(im,label("DÉPART" if kind=="sealed" else ("52" if kind=="standard" else "32"),"tiny","#e3d2a8"),38,98)
    return im


def opening_art(kind):
    box = carton(kind)
    if kind != "sealed":
        d = ImageDraw.Draw(box)
        d.polygon([(5,14),(13,1),(72,0),(81,5),(70,13)], fill=STOCKS[kind][4], outline=DEEP)
        d.polygon([(7,13),(17,8),(75,6),(69,13)], fill=CREAM, outline=INK)
        d.line((12,12,70,9), fill=MID)
        box.save(OUT / f"{kind}-open.png")
        return
    for frame in (1,2):
        torn = box.copy()
        d = ImageDraw.Draw(torn)
        lip = [(3,36),(13,39),(23,36),(31,42),(44,39),(55,44),(71,40),(84,34)]
        d.line(lip, fill=CREAM)
        d.line([(x, y + frame*4) for x,y in lip], fill="#bfa77e")
        d.line([(4,37),(1,49+frame*8),(13,43+frame*3)], fill=LIGHT)
        torn.save(OUT / f"sealed-tear-{frame}.png")
    for name, bounds in [("lid",(0,0,88,42)), ("base",(0,42,88,112))]:
        piece = Image.new("RGBA",box.size)
        piece.paste(box.crop(bounds),bounds[:2])
        piece.save(OUT / f"sealed-{name}.png")


if __name__ == "__main__":
    for kind in STOCKS:
        carton(kind).save(OUT / f"{kind}.png", optimize=True)
        opening_art(kind)
