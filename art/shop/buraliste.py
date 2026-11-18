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


def torso():
    img, d = layer()
    # his left shoulder carries the weight, his right shoulder rolls forward
    d.polygon([(23,165),(26,136),(34,121),(48,114),(67,109),(80,102),(111,100),
               (130,106),(149,109),(161,116),(171,135),(175,165)], fill=G0)
    d.polygon([(29,156),(32,134),(40,121),(55,115),(72,111),(83,104),(111,103),
               (130,109),(147,111),(159,120),(165,138),(160,157),(133,166),(57,167)], fill=G1)
    d.polygon([(34,140),(41,125),(50,119),(69,113),(80,107),(98,115),(90,132),
               (70,137),(61,146),(46,145)], fill=G2)
    d.polygon([(46,122),(51,117),(69,111),(76,108),(73,113),(61,115),(54,119)], fill=G3)
    d.polygon([(124,108),(143,112),(155,119),(161,128),(150,122),(133,118)], fill=G2)
    # rumpled shirt with a loose top button under his chin
    d.polygon([(78,106),(90,102),(110,101),(123,105),(115,126),(94,153),
               (87,137)], fill=SKIN_S)
    d.polygon([(80,108),(96,111),(108,106),(118,105),(111,121),(94,146),
               (89,130)], fill=SKIN_L)
    d.polygon([(90,108),(96,110),(105,106),(98,118)], fill=SKIN_D)
    d.polygon([(78,106),(85,102),(96,110),(89,119),(84,115)], fill=CREAM)
    d.polygon([(99,114),(108,104),(118,102),(113,113),(104,110)], fill=CREAM)
    d.line([(99,117),(96,129),(95,137)], fill=SKIN_S)
    d.point((98,122), fill=SKIN_D)
    # ribbed shawl collar turns back into a wide button band
    d.polygon([(79,103),(73,107),(77,122),(87,142),(89,154),(95,161),
               (94,147),(88,130)], fill=G0)
    d.line([(76,108),(80,120),(86,132)], fill=G3, width=2)
    d.polygon([(120,102),(128,106),(123,115),(116,122),(101,143),(96,159),
               (89,162),(89,151),(95,139),(109,121)], fill=G2)
    d.line([(124,107),(118,116),(111,122),(98,141)], fill=G3)
    for x,y in [(121,109),(116,116),(111,122),(105,129),(100,136)]:
        d.line([(x-2,y),(x+1,y+2)], fill=G1)
    for x,y in [(96,147),(91,159)]:
        d.ellipse((x-2,y-2,x+2,y+2), fill=INK2)
        d.point((x-1,y-1), fill=BRASS)
    # pack sits inside the welt of the sagging pocket
    d.polygon([(128,125),(139,123),(141,133),(130,136)], fill=NAVY)
    d.line([(129,126),(138,124)], fill=CREAM, width=2)
    d.polygon([(124,133),(145,129),(143,143),(134,148),(126,146)], fill=G0)
    d.line([(125,133),(133,134),(144,130)], fill=G2, width=2)
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
    # broad temples, one sagging cheek and a heavy folded chin
    d.polygon([(66,53),(68,36),(76,25),(85,19),(103,17),(116,21),(128,32),
               (133,47),(131,68),(135,77),(133,90),(124,99),(109,106),
               (88,104),(74,97),(67,86),(65,73)], fill=SKIN_S)
    d.polygon([(68,50),(71,36),(79,26),(88,21),(104,19),(116,23),(124,31),
               (128,45),(123,57),(121,70),(129,77),(126,87),(113,96),
               (95,99),(78,94),(69,85),(67,73)], fill=SKIN)
    d.polygon([(72,47),(75,35),(83,26),(92,22),(104,21),(115,25),(123,33),
               (119,37),(109,35),(100,38),(92,36),(82,40)], fill=SKIN_L)
    d.line([(85,27),(92,24),(102,23),(108,24)], fill=CREAM, width=2)
    for ridge in ([(80,46),(88,42),(97,43),(104,41),(115,40)],
                  [(84,51),(92,48),(100,49),(107,46),(115,45)]):
        d.line([(x,y+1) for x,y in ridge], fill=SKIN_L)
        d.line(ridge, fill=SKIN_S)
    for side in (-1,1):
        def temple(points):
            return [(100+side*x,y) for x,y in points]
        d.polygon(temple([(26,49),(27,41),(32,34),(31,40),(37,36),(35,43),
                          (40,42),(37,48),(39,49),(34,55),(32,67),(28,69)]), fill=SKIN_D)
        d.polygon(temple([(27,48),(30,41),(36,37),(32,44),(38,43),
                          (33,49),(30,60),(28,64)]), fill=SKIN_L)
        d.line(temple([(27,48),(29,43),(32,40)]), fill=CREAM)
        d.line(temple([(36,63),(34,61),(33,65)]), fill=SKIN_L)
        d.polygon(temple([(15,73),(21,69),(27,70),(29,75),(25,78),(20,77)]), fill=SKIN_S)
        d.line(temple([(17,73),(22,71),(26,71)]), fill=SKIN_L)
        d.line(temple([(20,78),(25,80),(28,86)]), fill=SKIN_D)
        d.line(temple([(27,81),(30,86),(28,91)]), fill=SKIN_L)
    d.line([(80,96),(90,101),(104,102),(116,98)], fill=SKIN_D, width=2)
    d.line([(88,97),(97,99),(106,98)], fill=SKIN_L)
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
    d.polygon([(94,60),(99,58),(102,60),(103,68),(109,69),(113,73),(111,79),
               (104,83),(95,82),(89,79),(87,75),(89,71),(94,69)], fill=SKIN_S)
    d.polygon([(96,60),(99,60),(100,69),(106,70),(109,74),(106,78),(99,80),
               (91,77),(90,73),(95,70)], fill=SKIN)
    d.polygon([(96,61),(99,61),(98,69),(103,71),(101,74),(94,75),(92,72),(96,69)], fill=SKIN_L)
    d.line([(94,72),(97,70),(99,70)], fill=CREAM)
    d.line([(89,77),(93,78),(95,80)], fill=SKIN_D)
    d.line([(104,80),(107,77),(111,76)], fill=SKIN_D)
    return outline(img, INK1)


def mustache(mood):
    # a big walrus mustache. 'grump' droops, 'puff' bristles up when he exhales
    img, d = layer()
    lift = -2 if mood == 'puff' else 0
    for side in (-1,1):
        def whiskers(points):
            return [(100+side*x, y+lift*min(x,20)//20+(1 if side<0 and x>12 else 0)) for x,y in points]
        d.polygon(whiskers([(0,82),(8,79),(17,80),(23,83),(29,90),(31,99),
                            (26,96),(27,101),(20,95),(15,94),(10,90),(4,91),(0,88)]), fill=SKIN_D)
        d.polygon(whiskers([(0,83),(9,80),(16,81),(22,84),(27,90),(29,96),
                            (23,91),(24,96),(17,90),(13,91),(8,87),(3,89)]), fill=SKIN_L)
        d.polygon(whiskers([(2,83),(10,81),(16,82),(20,85),(13,84),(17,88),(9,85),(5,86)]), fill=CREAM)
        d.line(whiskers([(14,84),(20,87),(23,91)]), fill=SKIN)
    return outline(img)


def lip():
    img, d = layer()
    d.line([(94, 94), (106, 94)], fill=FLUSH_D)
    d.line([(95, 95), (105, 95)], fill=SKIN_S)
    return img


def cigarette(lit=True):
    img, d = layer()
    # a twist of paper caught under the right half of his moustache
    d.line([(111,93),(118,94),(141,101)], fill=INK1, width=3)
    d.line([(112,93),(118,94)], fill=SKIN_S, width=2)
    d.line([(118,94),(136,99)], fill=SKIN_L, width=2)
    d.line([(119,93),(135,98)], fill=WHITE)
    d.line([(138,99),(142,100)], fill=SKIN_S, width=2)
    d.point((141,99), fill=CREAM)
    if lit:
        d.line([(137,98),(136,100)], fill=EMBER)
        d.point((137,99), fill=EMBER_L)
    return img


def arms():
    img, d = layer()
    # the outer sleeve runs from each shoulder to the elbow on the counter
    for contour, face, seam, crease in [
        ([(54,113),(42,116),(33,122),(26,131),(19,142),(18,151),(22,157),
          (34,158),(44,150),(47,137),(52,129),(61,121)],
         [(50,116),(41,119),(34,125),(28,135),(25,142),(32,139),(37,131),(46,127)],
         [(36,123),(42,120),(48,118)], [(25,141),(30,138),(36,138)]),
        ([(146,110),(157,113),(166,120),(172,131),(178,141),(177,150),
          (171,155),(158,152),(153,144),(150,131),(142,122)],
         [(148,112),(156,115),(164,121),(169,131),(163,126),(156,124),(152,119)],
         [(151,114),(158,117),(163,122)], [(166,132),(171,136),(173,139)])]:
        d.polygon(contour, fill=G1)
        d.polygon(face, fill=G2)
        d.line(seam, fill=G3)
        d.line(crease, fill=G0, width=2)
    return outline(img)


def forearms():
    img, d = layer()
    # one elbow planted, the other tucked back as he holds up the sports page
    d.polygon([(18,144),(24,140),(32,139),(41,142),(57,139),(62,141),
               (65,151),(51,156),(34,160),(25,160),(18,156),(16,151)], fill=G0)
    d.polygon([(18,145),(25,141),(33,141),(42,144),(55,141),(59,148),
               (49,152),(31,156),(22,155),(18,152)], fill=G2)
    d.line([(19,146),(25,143),(31,143)], fill=G3)
    d.line([(23,152),(28,149),(35,149)], fill=G1, width=2)
    d.polygon([(50,141),(58,138),(63,141),(66,150),(57,154)], fill=G1)
    for x in (52,55,58):
        d.line([(x,142),(x+4,151)], fill=G0)
    d.polygon([(139,132),(145,129),(153,132),(166,138),(172,137),(177,140),
               (179,146),(176,152),(170,155),(161,154),(146,147),(137,144)], fill=G0)
    d.polygon([(145,131),(153,134),(164,139),(171,140),(175,139),(177,144),
               (175,149),(170,152),(161,150),(147,144),(141,140)], fill=G2)
    d.line([(152,135),(164,141),(170,142)], fill=G3)
    d.line([(164,146),(171,144),(175,145)], fill=G1, width=2)
    d.polygon([(140,130),(150,132),(149,139),(145,146),(137,143)], fill=G1)
    for x in (141,144,147):
        d.line([(x,133),(x-3,143)], fill=G0)
    return outline(img)


def hands():
    img, d = layer()
    # left index follows the score column, with the other fingers curled below it
    d.polygon([(58,143),(63,138),(68,136),(72,137),(76,140),(85,141),(89,144),
               (88,146),(77,145),(79,148),(77,151),(75,151),(73,154),(69,154),
               (66,155),(61,152),(58,149)], fill=SKIN_S)
    d.polygon([(59,143),(65,139),(69,138),(74,141),(81,142),(86,143),(87,145),
               (76,143),(72,145),(68,143),(63,147),(61,149)], fill=SKIN)
    d.line([(64,140),(68,138),(71,139)], fill=SKIN_L, width=2)
    d.line([(79,142),(85,143)], fill=SKIN_L)
    d.polygon([(65,144),(70,142),(75,144),(80,149),(79,151),(77,151),(73,147),(69,146)], fill=SKIN)
    d.polygon([(63,147),(67,145),(72,147),(76,152),(74,154),(70,150),(67,149)], fill=SKIN)
    d.line([(68,145),(72,145),(75,148)], fill=SKIN_L)
    d.line([(64,148),(67,147),(70,149)], fill=SKIN_L)
    d.line([(73,146),(78,151)], fill=SKIN_D)
    d.line([(71,150),(73,153)], fill=SKIN_D)
    d.line([(84,143),(86,144)], fill=SKIN_L)
    # his other thumb pins the page; only the tips curl around its edge
    d.polygon([(144,133),(141,130),(138,128),(134,127),(131,128),(130,131),
               (132,133),(127,135),(126,138),(128,140),(135,136),
               (133,141),(135,144),(140,144),(143,141),(146,137)], fill=SKIN_S)
    d.polygon([(143,133),(138,129),(134,128),(132,129),(134,131),(139,133),
               (135,133),(129,136),(128,138),(131,137),(137,135),(140,138)], fill=SKIN)
    d.line([(134,129),(137,129),(140,131)], fill=SKIN_L)
    d.line([(128,138),(131,136)], fill=SKIN_L)
    d.line([(137,139),(135,142)], fill=SKIN_D)
    return outline(img)


def paper():
    img, d = layer()
    # the sports paper, folded open on the counter
    d.polygon([(52, 150), (148, 150), (152, 172), (48, 172)], fill=SKIN_L)
    d.polygon([(100, 150), (148, 150), (152, 172), (100, 172)], fill=CREAM)
    d.line([(100, 150), (100, 172)], fill=SKIN_S)
    # the fold breaks the headline across two slightly different stocks
    d.rectangle([65,151,97,157], fill=RED)
    letters = ["100100100100111","111100110100111","111101101101111",
               "101101101101111","111010010010111","110101110100100","111100110100111"]
    for i, glyph in enumerate(letters):
        for j, bit in enumerate(glyph):
            if bit == "1":
                d.point((67+i*4+j%3,152+j//3), fill=CREAM)
    d.line([(54,159),(97,159)], fill=INK3)
    for left,right in [(54,66),(69,81),(84,96),(119,145)]:
        for y in range(161,172,2):
            d.line([(left,y),(right-(y%3),y)], fill=SKIN_S)
    d.rectangle([103,152,116,168], fill=SKIN_S)
    d.polygon([(104,167),(108,162),(109,158),(108,155),(111,154),(113,156),
               (112,159),(115,161),(114,163),(112,161),(110,164),(108,167)], fill=INK3)
    d.line([(119,157),(143,157)], fill=INK2, width=2)
    # left leaf bows at the spine; the right edge is lifted in his hand
    sheet = Image.new("RGBA", (W, H))
    for x in range(48,153):
        col = img.crop((x,150,x+1,H))
        lift = round((x-48)*0.11) if x<100 else round(6+(x-100)*0.30)
        sheet.paste(col, (x,149-lift))
    d = ImageDraw.Draw(sheet)
    d.line([(52,149),(97,144),(101,144),(147,129)], fill=CREAM)
    return outline(sheet)


def compose(look='down', brow='grump', stache='grump', lit=True, front=True):
    # front = the paper and his hands, which rest on the counter top and draw over it
    parts = [torso(), arms(), neck(), head(), nose(), lip(), eyes(look), brows(brow), mustache(stache)]
    if lit:
        parts.append(cigarette())
    if front:
        parts += [forearms(), paper(), hands()]
    out = Image.new("RGBA", (W, H))
    for p in parts:
        out = Image.alpha_composite(out, p)
    return out


def front():
    return Image.alpha_composite(Image.alpha_composite(forearms(), paper()), hands())


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
