"""Draw the four printed cartons at their native shelf and reveal size."""
import json
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent
FONTS = OUT.parents[1] / "fonts"
GLYPHS = json.loads((FONTS / "fonts.json").read_text())
LETTERS = Image.open(FONTS / "fonts.png").getchannel("A")
INK, SOOT, SEPIA = "#0e0b0a", "#2e2320", "#5c4a36"
KRAFT, TAN, PAPER, MILK = "#8c7656", "#bfa77e", "#e3d2a8", "#f6ecd2"
UMBER, BRONZE, BRASS, GOLD, GLINT = "#6b4a1a", "#9c7028", "#c99a3a", "#e8c260", "#fff0b0"
PINE, LEAF, JADE = "#174034", "#2d7a5c", "#4a9a74"
OX, WINE, RED, ROSE = "#4e1020", "#7a1a2c", "#a82a38", "#d04a4e"
PLUM, VIOLET = "#2a1440", "#4e2a78"
MIDNIGHT, BLUE, GLASS, SKY = "#0f1d33", "#1a3256", "#28497a", "#3e66a0"
EMBER, FLAME, ORANGE = "#a8260a", "#e8501a", "#ffb03a"


def paper():
    im = Image.new("RGBA", (72, 104))
    return im, ImageDraw.Draw(im)


def lettering(im, phrase, x, cap_y, color, font="tiny", width=None):
    """Align printed letters on their cap line; allow a condensed display face."""
    f = GLYPHS[font]
    advances = [f["space"] if c == " " else f["glyphs"][c][6] for c in phrase]
    mask = Image.new("L", (sum(advances) - 1, f["line"]))
    cursor = 0
    for c, advance in zip(phrase, advances):
        if c != " ":
            sx, sy, w, h, top, left, _ = f["glyphs"][c]
            mask.paste(LETTERS.crop((sx, sy, sx + w, sy + h)), (cursor + left, top))
        cursor += advance
    if width:
        mask = mask.resize((width, mask.height), Image.Resampling.NEAREST)
    im.paste(color, (x - mask.width // 2, cap_y - (f["ascent"] - f["cap"])), mask)


def diamond(d, x, y, r, color):
    d.polygon([(x, y-r), (x+r, y), (x, y+r), (x-r, y)], fill=color)


def corners(d, left, top, right, bottom, color):
    for x, sx in [(left, 1), (right, -1)]:
        for y, sy in [(top, 1), (bottom, -1)]:
            d.line([(x, y+6*sy), (x, y), (x+6*sx, y)], fill=color)
            d.point((x+2*sx, y+2*sy), fill=color)


def free():
    # A chocolate sample folded in buff paper. One small swallow breaks the oval seal.
    im, d = paper()
    d.polygon([(4,12),(13,6),(60,6),(67,10),(67,92),(61,99),(4,99)], fill=INK)
    d.polygon([(5,13),(60,13),(60,97),(5,97)], fill=PAPER)
    d.polygon([(6,11),(14,7),(59,7),(65,10),(60,12)], fill=TAN)
    d.polygon([(61,13),(66,10),(66,92),(61,97)], fill=KRAFT)
    d.line([(62,15),(64,22),(64,80),(62,91)], fill=SEPIA)
    d.line([(6,14),(59,14)], fill=MILK)
    # Front label is an uncoated two-ink print with clipped corners.
    d.polygon([(8,22),(11,19),(54,19),(57,22),(57,78),(54,81),(11,81),(8,78)],fill=PINE)
    d.polygon([(10,23),(12,21),(53,21),(55,23),(55,76),(52,79),(13,79),(10,76)],outline=JADE)
    lettering(im,"CHOCOLAT",33,25,PAPER)
    d.ellipse((16,34,49,60),fill=PAPER)
    d.arc((18,36,47,58),0,355,fill=TAN)
    # Forked tail, swept primaries, white throat and brick-red chin.
    d.polygon([(14,52),(22,52),(12,58),(25,55),(33,55),(41,48),(45,47),
               (49,45),(44,44),(42,42),(39,42),(35,45),(32,44),(26,37),
               (13,30),(19,39),(25,46),(17,44),(24,50)],fill=PINE)
    d.line([(18,34),(26,40),(32,47)], fill=LEAF)
    d.line([(21,39),(26,42),(30,47)],fill=JADE)
    d.line([(27,53),(33,51),(38,47)],fill=JADE)
    d.line([(39,47),(42,45)],fill=RED,width=2)
    d.point((42,43),fill=MILK)
    d.polygon([(11,62),(53,62),(55,65),(53,74),(12,74),(9,71)],fill=PAPER)
    lettering(im,"PERCHOIR",32,65,PINE,"sans")
    lettering(im,"LE",33,57,PINE)
    # A single length of store twine pinches the folds just under the label.
    d.line([(5,88),(23,86),(40,86),(60,88),(66,84)],fill=KRAFT,width=3)
    d.line([(5,87),(26,85),(39,85),(60,87),(66,83)],fill=MILK)
    d.line([(39,85),(43,81),(47,81),(47,83),(40,86),(37,89),(32,91),(31,89),(38,85)],fill=SEPIA)
    d.line([(39,86),(43,91),(47,93)],fill=SEPIA)
    d.line([(39,86),(37,91),(39,95)],fill=KRAFT)
    lettering(im,"3 CARTES",21,92,PINE)
    return im


def offbrand():
    # Counterfeit cigarette carton: the second mask is a whole plate out of register.
    im,d=paper()
    d.polygon([(4,8),(11,4),(63,6),(67,9),(65,98),(59,102),(4,99)],fill=INK)
    d.polygon([(6,9),(59,11),(58,99),(5,97)],fill=PAPER)
    d.polygon([(6,8),(12,5),(62,7),(59,10)],fill=MILK)
    d.polygon([(60,11),(65,9),(64,96),(59,99)],fill=KRAFT)
    for y in range(17,92,5):
        d.line([(61,y),(63,y-1)],fill=SEPIA)
    d.polygon([(5,11),(59,13),(59,32),(5,29)],fill=RED)
    for x in range(8,54,6):
        d.line([(x,12),(x+4,16)],fill=WINE)
    lettering(im,"FAUX",32,17,MILK,"didone",39)
    d.polygon([(6,33),(59,35),(58,75),(6,72)],fill=PLUM)
    d.polygon([(8,35),(55,37),(55,72),(8,69)],outline=VIOLET)
    # The mirrored theatre masks share a cheek. Only the left face smiles.
    face=[(29,41),(39,40),(45,43),(44,51),(38,60),(34,62),(29,60),(26,50),(26,44)]
    d.polygon([(x+6,y+2) for x,y in face],fill=ROSE)
    d.line([(39,48),(43,49),(46,47)],fill=OX,width=2)
    d.line([(40,55),(43,55),(45,57)],fill=OX)
    d.polygon([(14,40),(20,42),(28,42),(32,39),(36,41),(35,51),(30,59),(25,63),
               (21,62),(15,54),(12,46)],fill=JADE)
    d.polygon([(15,38),(21,40),(29,40),(33,37),(37,39),(36,49),(31,57),
               (26,61),(22,60),(16,52),(13,44)],fill=MILK)
    d.polygon([(15,41),(20,43),(21,48),(18,50),(16,47)],fill=TAN)
    d.polygon([(29,42),(34,39),(34,44),(30,46),(26,45)],fill=TAN)
    d.line([(17,44),(21,45),(22,47)],fill=PLUM,width=2)
    d.line([(27,46),(29,43),(33,42)],fill=PLUM,width=2)
    d.line([(24,46),(23,51),(26,50)],fill=KRAFT)
    d.polygon([(20,52),(25,54),(31,50),(29,55),(25,57),(22,56)],fill=WINE)
    diamond(d,48,42,2,BRASS)
    diamond(d,11,57,1,PAPER)
    d.line([(9,66),(54,68)],fill=ROSE)
    lettering(im,"FRÈRE",32,73,OX,"didone",46)
    d.line([(8,90),(54,90)],fill=RED)
    lettering(im,"5 CARTES",32,92,PLUM)
    return im


def repack():
    # A rolled metal biscuit tin. The maker's kiln is embossed into the enamel.
    im,d=paper()
    d.rounded_rectangle((2,5,68,101),radius=8,fill=INK)
    d.rounded_rectangle((4,7,66,99),radius=6,fill=UMBER)
    d.rounded_rectangle((5,7,64,96),radius=6,fill=BRASS)
    d.rounded_rectangle((7,9,62,94),radius=5,fill=OX)
    d.rounded_rectangle((9,11,60,92),radius=4,outline=BRONZE)
    d.arc((4,7,16,19),180,270,fill=GLINT)
    d.line([(12,7),(55,7)],fill=GOLD)
    d.line([(4,15),(4,85)],fill=GOLD)
    for x in range(11,60,4):
        d.line([(x,97),(x+1,97)],fill=BRONZE)
    lettering(im,"BISCUITS",35,17,PAPER)
    # Wheat spikes flank a round wood-fired oven with a projecting stone hearth.
    for x,sign in [(11,1),(58,-1)]:
        d.line([(x,57),(x+2*sign,47),(x,38)],fill=BRONZE)
        for y in [40,45,50,55]:
            d.line([(x+sign,y+2),(x+4*sign,y-1)],fill=BRASS)
    d.pieslice((16,26,54,66),180,360,fill=BRONZE,outline=BRASS)
    d.rectangle((16,47,54,57),fill=BRONZE)
    d.pieslice((20,31,50,66),180,360,fill=EMBER)
    d.rectangle((20,48,50,56),fill=EMBER)
    d.pieslice((22,33,48,66),180,360,fill=SOOT)
    d.rectangle((22,50,48,56),fill=SOOT)
    for a,b in [((19,36),(22,39)),((25,30),(28,34)),((34,27),(34,31)),((43,29),(41,33)),((50,34),(46,37)),((52,42),(49,43))]:
        d.line([a,b],fill=UMBER,width=2)
    d.polygon([(25,56),(23,51),(26,45),(28,49),(31,44),(32,36),(36,39),(39,46),
               (42,43),(43,39),(46,45),(45,53),(42,56)],fill=FLAME)
    d.polygon([(28,55),(27,51),(31,47),(32,49),(35,42),(38,47),(37,51),(42,46),
               (42,51),(38,55)],fill=ORANGE)
    d.polygon([(32,55),(32,52),(36,48),(37,52),(39,51),(37,55)],fill=GLINT)
    d.rectangle((14,57,55,59),fill=BRASS)
    d.line([(17,60),(52,60)],fill=UMBER)
    lettering(im,"LE",35,62,GOLD)
    lettering(im,"ROUSSI",35,69,MILK,"didone",45)
    lettering(im,"4 CARTES",35,85,GOLD)
    # A torn paper seal bridges the lid lip at the upper right.
    d.polygon([(48,7),(54,6),(65,15),(64,22),(59,20),(55,16)],fill=TAN)
    d.line([(51,8),(63,18)],fill=PAPER,width=2)
    d.line([(53,9),(62,16)],fill=RED)
    return im


def collector():
    # Tall parfum coffret. A deep lid lip, brushed gilt and glass facets catch the lamp.
    im,d=paper()
    d.polygon([(6,10),(14,4),(61,4),(66,8),(66,94),(60,101),(6,101)],fill=INK)
    d.polygon([(7,12),(58,12),(58,99),(7,99)],fill=MIDNIGHT)
    d.polygon([(8,10),(15,5),(61,5),(65,8),(58,12)],fill=GLASS)
    d.polygon([(59,13),(65,9),(65,93),(59,99)],fill=BLUE)
    d.line([(61,15),(61,94)],fill=GLASS)
    d.polygon([(7,15),(58,15),(58,24),(55,26),(10,26),(7,24)],fill=BLUE)
    d.line([(8,13),(56,13)],fill=GOLD)
    d.line([(9,25),(55,25),(63,20)],fill=BRASS)
    lettering(im,"PARFUMS",33,17,PAPER)
    corners(d,10,29,54,94,BRASS)
    # A half-moon hangs behind the faceted bottle, seen through an arched display window.
    d.ellipse((15,30,50,67),fill=BLUE,outline=BRONZE)
    d.ellipse((19,33,43,58),fill=GOLD)
    d.ellipse((24,31,46,55),fill=BLUE)
    diamond(d,44,39,2,GLINT)
    d.point((37,34),fill=PAPER)
    d.polygon([(28,43),(32,40),(37,40),(40,43),(36,47),(31,47)],fill=SKY,outline=MIDNIGHT)
    d.line([(30,43),(34,41),(37,42)],fill=MILK)
    d.rectangle((31,47,37,49),fill=BRASS)
    d.polygon([(30,50),(38,50),(44,55),(42,64),(38,67),(29,67),(25,64),(24,55)],fill=GLASS,outline=MIDNIGHT)
    d.polygon([(26,55),(31,51),(30,63),(27,62)],fill=SKY)
    d.polygon([(38,51),(42,55),(40,62),(37,63)],fill=BLUE)
    d.polygon([(29,56),(33,53),(39,56),(38,61),(34,64),(30,61)],fill=BRASS)
    diamond(d,34,58,2,GLINT)
    d.line([(30,65),(37,65)],fill=SKY)
    lettering(im,"SÉLÈNE",33,71,GLINT,"didone",44)
    lettering(im,"COLLECTION",33,87,GOLD)
    return im


if __name__ == "__main__":
    for brand in (free, offbrand, repack, collector):
        brand().save(OUT / f"{brand.__name__}.png")
