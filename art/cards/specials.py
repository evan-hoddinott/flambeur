"""Pixel layers for special stocks, inks and hardware. Coordinates are on the card face."""
from math import cos, sin, pi
from pathlib import Path
from random import Random
from PIL import Image, ImageDraw

INK, PAPER, WHITE = "#201720", "#f6ecd2", "#fffbe8"
GOLD, BRASS, OCHRE = "#e8c260", "#c99a3a", "#775023"
RED, BLUE, VIOLET = "#a82a38", "#3e66a0", "#7a4ab0"
WAX, FLAME = "#cf403c", "#ff7a24"


# Ash (docs/FLAMBER.md §4): what's left of a card after a flambé. the card's own outline, burnt ragged with bites
# out of it and a curled corner, a char ring, a grey ash body with cracks, embers still in them, a ghost of its
# pip, and the +5 pressed in
CHAR2, CHAR1 = "#2e1810", "#5a3420"
ASH = ["#43342e", "#6b605a", "#9a8f86", "#c9bfb4"]
EMBER = ["#9c1f26", "#f77a1c", "#ffe45e"]
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def ash_card():
    W, H = 64, 88
    rgba = lambda c: (int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), 255)
    rng = Random(5)

    def noise(x, y, s, seed):
        # smooth value noise, enough for ragged edges and the ash's blotches
        fx, fy = x / s, y / s
        x0, y0 = int(fx // 1), int(fy // 1)
        tx, ty = fx - x0, fy - y0
        tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        h = lambda a, b: Random(a * 7919 + b * 104729 + seed * 31).random()
        top = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * tx
        bot = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * tx
        return top + (bot - top) * ty

    # the card's outline, then the burn eats in from it
    shape = Image.new("L", (W, H))
    ImageDraw.Draw(shape).rounded_rectangle((0, 0, W - 1, H - 1), 4, 255)
    bites = [(0, 27, 6), (63, 58, 7), (22, 87, 5), (47, 0, 4)]
    curl = 15 # the top right corner folded over
    on = [[False] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if not shape.getpixel((x, y)):
                continue
            edge = min(x, W - 1 - x, y, H - 1 - y)
            if edge < 0.6 + 2.6 * noise(x + y * 0.7, x * 0.3 + y, 3.5, 1):
                continue
            if any((x - bx) ** 2 + (y - by) ** 2 < (r + 2.5 * (noise(x, y, 2.5, 2) - 0.5)) ** 2 for bx, by, r in bites):
                continue
            if (W - 1 - x) + y < curl:
                continue
            on[y][x] = True
    # distance to the burnt edge (chamfer)
    INF = 99.0
    d = [[(INF if on[y][x] else 0.0) for x in range(W)] for y in range(H)]
    for y in range(H):
        for x in range(W):
            if d[y][x]:
                for dx, dy, c in ((-1, 0, 1), (0, -1, 1), (-1, -1, 1.4), (1, -1, 1.4)):
                    if 0 <= x + dx < W and 0 <= y + dy < H:
                        d[y][x] = min(d[y][x], d[y + dy][x + dx] + c)
                    else:
                        d[y][x] = min(d[y][x], c)
    for y in range(H - 1, -1, -1):
        for x in range(W - 1, -1, -1):
            if d[y][x]:
                for dx, dy, c in ((1, 0, 1), (0, 1, 1), (1, 1, 1.4), (-1, 1, 1.4)):
                    if 0 <= x + dx < W and 0 <= y + dy < H:
                        d[y][x] = min(d[y][x], d[y + dy][x + dx] + c)
                    else:
                        d[y][x] = min(d[y][x], c)

    im = Image.new("RGBA", (W, H))
    px = im.load()
    for y in range(H):
        for x in range(W):
            if not on[y][x]:
                continue
            e = d[y][x] + 1.2 * (noise(x, y, 2, 3) - 0.5)
            if e < 1.6:
                px[x, y] = rgba(CHAR2)
            elif e < 3.2:
                px[x, y] = rgba(CHAR1 if (x + y) % 3 or e < 2.6 else ASH[0])
            else:
                # the ash: pale in the middle where it burnt clean, dark toward the char, blotched
                v = 0.12 + 0.62 * min(1, (e - 3) / 15) + 0.5 * (noise(x, y, 9, 4) - 0.5) + 0.12 * (noise(x, y, 3, 5) - 0.5)
                level = v * 3 + (BAYER[y % 4][x % 4] / 16 - 0.5) * 0.55
                px[x, y] = rgba(ASH[max(0, min(3, int(level + 0.5)))])

    # the curl: the burnt corner rolled over onto the card, a dark lip with a hot crease
    for y in range(curl + 6):
        for x in range(W - curl - 6, W):
            fold = (W - 1 - x) + y
            if on[y][x] and curl <= fold < curl + 4:
                px[x, y] = rgba([CHAR2, "#7a4a2c", "#a0663a", CHAR2][fold - curl])

    # the ghost of its pip in both corners, scorched into the ash
    spade = ["...#...", "..###..", ".#####.", "#######", "#######", ".#.#.#.", "...#...", "..###.."]
    for gx, gy, flip in ((7, 9, False), (W - 14, H - 17, True)):
        for j, row in enumerate(spade):
            for i, dot in enumerate(row):
                xx, yy = (gx + 6 - i, gy + 7 - j) if flip else (gx + i, gy + j)
                if dot == "#" and on[yy][xx] and d[yy][xx] > 3:
                    px[xx, yy] = rgba(ASH[0] if j < 2 or i in (0, 6) else ASH[1])

    # cracks: short walks in from the char, with a pale lip under each
    lit = []
    for start in [(3, 40), (60, 22), (12, 84), (60, 72), (30, 3), (3, 64), (52, 86), (3, 14)]:
        x, y = start
        for _ in range(rng.randrange(9, 15)):
            cx, cy = (W // 2 - x), (H // 2 - y)
            x += (cx > 0) - (cx < 0) if rng.random() < 0.6 else rng.choice((-1, 0, 1))
            y += (cy > 0) - (cy < 0) if rng.random() < 0.6 else rng.choice((-1, 0, 1))
            if not (0 <= x < W and 0 <= y < H - 1) or not on[y][x]:
                continue
            if 3 < d[y][x] < 13 and 16 < x < 48 and 30 < y < 54:
                break # keep the +5 clean
            px[x, y] = rgba(CHAR1 if d[y][x] < 6 else ASH[0])
            if on[y + 1][x] and d[y + 1][x] > 3 and rng.random() < 0.7:
                px[x, y + 1] = rgba(ASH[3])
            if d[y][x] < 9:
                lit.append((x, y))
    # embers still in the cracks near the edge
    rng.shuffle(lit)
    for x, y in lit[:6]:
        px[x, y] = rgba(EMBER[2] if rng.random() < 0.4 else EMBER[1])
        if on[y][x - 1]:
            px[x - 1, y] = rgba(EMBER[1])
        for dx, dy in ((1, 0), (0, 1)):
            if on[y + dy][x + dx]:
                px[x + dx, y + dy] = rgba(EMBER[0])
    # flecks of white ash
    for _ in range(26):
        x, y = rng.randrange(6, 58), rng.randrange(8, 80)
        if on[y][x] and d[y][x] > 4:
            px[x, y] = rgba("#e9e2d6")

    # the +5, pressed into the ash: a pale face with a dark underside, on a scorched smudge so it reads small
    for y in range(28, 60):
        for x in range(12, 54):
            k = ((x - 32) / 19) ** 2 + ((y - 43) / 13) ** 2 + 0.35 * (noise(x, y, 3, 7) - 0.5)
            if on[y][x] and k < 1:
                i = ASH.index("#%02x%02x%02x" % px[x, y][:3]) if "#%02x%02x%02x" % px[x, y][:3] in ASH else -1
                if i > 0:
                    px[x, y] = rgba(ASH[i - 1 if k > 0.55 else max(0, i - 2)])
    dr = ImageDraw.Draw(im)
    plus = [[(20, 43), (29, 43)], [(24, 38), (24, 48)], [(44, 36), (34, 36), (34, 43), (43, 43), (43, 50), (33, 50)]]
    for dx, dy, col in ((1, 1, CHAR2), (0, 0, ASH[3])):
        for pts in plus:
            dr.line([(x + dx, y + dy) for x, y in pts], col, 3)
    for pts in plus:
        dr.line([(x - 1, y - 1) for x, y in pts[:1]], "#e9e2d6")
    return im


def layers():
    parts = {}
    rng = Random(1948)
    glyphs = {}
    for block in (Path(__file__).parents[1] / "fonts/tiny.txt").read_text().split("\n: ")[1:]:
        letter, *rows = block.splitlines()
        glyphs[letter] = rows[:5]

    def layer(name, size=(64, 88)):
        im = parts[name] = Image.new("RGBA", size)
        return ImageDraw.Draw(im)

    def label(d, x, y, word, color):
        for ch in word:
            for j, row in enumerate(glyphs[ch]):
                for i, dot in enumerate(row):
                    if dot == "#":
                        d.point((x+i, y+j), color)
            x += 4

    def frame(name, stock, stripe):
        d = layer(name)
        d.rounded_rectangle((0, 0, 63, 87), 4, stock, INK)
        d.rounded_rectangle((4, 4, 59, 83), 2, outline=stripe)
        d.rounded_rectangle((5, 5, 58, 82), 1, fill=(0, 0, 0, 0))
        return d

    d = frame("frame/chase", "#120e08", GOLD)
    for y in range(8, 80, 8):
        for x in (2, 61):
            d.line([(x,y-3),(x-1,y-1),(x+1,y+1),(x,y+3)], BRASS)
            d.point((x+1,y-2), WHITE)
    for x in range(7, 58, 5):
        for y in (2, 85):
            d.line((x-2,y+1,x,y-1,x+2,y+1), BRASS)
    d.rounded_rectangle((18, 0, 45, 8), 2, GOLD, OCHRE)
    label(d, 23, 2, "CHASE", INK)
    for x in (20, 43):
        d.point((x,4), WHITE)
    d = frame("frame/rookie", BLUE, WHITE)
    d.polygon([(2,78),(48,78),(41,86),(2,86)], RED)
    d.line((14,83,37,83,42,79), "#e78678")
    d.polygon([(3,74),(15,74),(15,81),(9,86),(3,81)], GOLD, INK)
    label(d,6,76,"RC",INK)

    for crayon in (False, True):
        name = "frame/joker" + ("/crayon" if crayon else "")
        d = frame(name, "#e8c899" if crayon else "#34233e", WAX if crayon else BRASS)
        for side in range(4):
            for i, pos in enumerate(range(7, (58 if side<2 else 82), 6)):
                x,y = (pos, 3 if side==0 else 84) if side<2 else (3 if side==2 else 60,pos)
                jitter = rng.choice([-1,0,1]) if crayon else 0
                color = (VIOLET, WAX if crayon else RED, BRASS)[(i+side)%3]
                pts = [(x-3,y),(x+jitter,y-2),(x+3,y+jitter),(x,y+2)]
                d.polygon(pts, color if not crayon or i%4==0 else None, color)
                if crayon:
                    d.line((x-2,y+2,x+1,y-2),color)
        for x in (3,60):
            for y in (4,83):
                d.ellipse((x-2,y-3,x+2,y+2), GOLD, OCHRE)
                d.line((x-2,y+1,x+2,y+1),INK)
                d.point((x-1,y-1),WHITE)
    d = layer("base/diecut",(68,92))
    d.rounded_rectangle((0,0,67,91),6,"white",INK)
    d = layer("variant/gloss")
    for x,w in [(3,4),(11,2)]:
        d.polygon([(x,1),(x+w,1),(62,61-x-w),(62,61-x)],(255,255,255,102))
    d = layer("variant/peel",(14,14))
    d.polygon([(0,0),(13,13),(1,13)],"#ad947c")
    d.polygon([(0,0),(12,12),(5,11),(2,8)],"white","#85765f")
    parts["base/bulk"] = ash_card()
    # the old slab drew from the shared rng. burn the same draws so every layer after it stays put
    for _ in range(94):
        rng.randrange(6,55), rng.randrange(7,77), rng.randrange(1,4), rng.choice([0, 1])

    for kind,col in [("foil",GOLD),("holo","#b088e0"),("embers",FLAME)]:
        d = layer("finish/"+kind)
        d.rounded_rectangle((5,5,58,82),2,outline=col,width=2)
        if kind=="foil":
            for x,y in [(7,7),(56,7),(7,80),(56,80)]:
                d.line((x-1,y,x+1,y),"#fff4b0")
            for k in range(-80,66,24):
                d.polygon([(k,0),(k+5,0),(k+93,87),(k+88,87)],(251,213,114,32))
        elif kind=="holo":
            for y in range(3,85,7):
                for x in range(2+(y//7%2)*4,64,8):
                    d.line((x,y,x+2,y-2,x+5,y-2,x+7,y), (145,120,188,55))
            d.polygon([(47,8),(51,11),(50,16),(46,17),(43,13)],"#9dd8ce",VIOLET)
        else:
            for _ in range(170):
                x,y = rng.randrange(2,62),rng.randrange(2,86)
                if min(x,63-x,y,87-y)<9:
                    d.rectangle((x,y,x+1,y+1),rng.choice(["#66332a","#fdab49","#e85a26"]))
    d = layer("stamp/first",(30,30))
    d.ellipse((1,1,28,28),outline=RED,width=3)
    d.ellipse((5,5,24,24),outline=RED)
    d.line((11,12,15,9,15,20),RED,3)
    d.line((10,21,20,21),RED,2)
    for a in range(0,360,24):
        x,y=14+int(11*cos(a*pi/180)),14+int(11*sin(a*pi/180))
        d.point((x,y),PAPER)
    d=layer("stamp/signed",(48,20))
    d.line([(1,14),(10,4),(6,16),(18,3),(12,15),(22,8),(18,14),(27,9),(25,13),(38,8),(32,13),(44,10)],"#28497a",2)
    d.line((5,18,44,13,47,14),"#28497a")
    d=layer("stamp/gold",(24,26))
    for x in (5,13):
        d.polygon([(x,14),(x+6,14),(x+5,25),(x+2,22),(x-2,24)],BRASS,OCHRE)
    d.ellipse((1,0,22,21),BRASS,OCHRE)
    d.ellipse((4,3,19,18),GOLD,OCHRE)
    d.polygon([(8,14),(8,10),(11,6),(12,10),(15,8),(16,13),(13,16),(10,16)],OCHRE)
    d.point((6,6),WHITE)
    d=layer("stamp/damaged",(36,19))
    d.line((0,17,9,10,12,12,21,5,25,6,33,0),INK,2)
    d.polygon([(8,3),(16,0),(25,15),(17,18)],(230,194,105,210))
    d=layer("knock/marked",(24,32))
    d.line([(15,2),(8,1),(3,5),(1,14),(2,22),(7,26),(14,24),(18,18),(19,9),(15,3),(10,2)],WAX,2)
    d.line((15,26,18,28,22,22),WAX,2)
    d.rectangle((14,17,16,19),WHITE)
    d.point((15,18),INK)
    d=layer("knock/beer",(48,48))
    d.arc((2,2,44,43),16,338,"#a36b33",3)
    d.arc((5,4,42,41),54,270,"#c49053")
    d.polygon([(32,39),(36,37),(38,47),(35,45)],"#ae773e")
    d=layer("knock/crayon",(40,68))
    for pts,col in [([(2,22),(8,12),(6,23),(14,15),(11,26),(19,18)],WAX), ([(25,40),(19,33),(23,29),(26,32),(30,28),(33,33),(25,40)],"#348453"), ([(4,54),(15,46),(7,57),(18,49),(11,60)],BLUE)]:
        d.line(pts,col,3)
    d=layer("index/wax",(9,11))
    d.line((0,3,3,0,7,1,8,4,4,7),WAX,2)
    d.rectangle((3,9,5,10),WAX)
    d=layer("tier/star",(9,9))
    d.polygon([(4,0),(6,3),(8,3),(8,4),(6,6),(7,8),(4,7),(1,8),(2,5),(0,4),(0,3),(3,3)],INK)
    d.polygon([(4,2),(5,4),(7,4),(5,5),(6,7),(4,6),(2,7),(3,5),(1,4),(4,4)],GOLD)
    d.point((4,4),WHITE)
    for name in ("twin","triplet","quad","split","household","bridge","wild","crown"):
        d=layer("trait/"+name,(9,9))
        if name in ("twin","triplet","quad"):
            for i in range(("twin","triplet","quad").index(name)+2):
                d.rectangle((i*2,2-i//2,i*2+2,7-i//2),GOLD,INK)
        elif name=="split":
            d.rectangle((1,0,7,8),GOLD,INK)
            d.line((0,7,8,1),INK,2)
        elif name=="household":
            d.polygon([(0,4),(4,0),(8,4),(7,4),(7,8),(1,8),(1,4)],INK)
            d.rectangle((3,5,4,8),GOLD)
        elif name=="bridge":
            d.arc((0,2,8,12),180,360,INK,2)
            d.line((0,2,8,2),INK)
        elif name=="wild":
            for x,y in [(3,0),(0,3),(5,3),(3,5)]:
                d.ellipse((x,y,x+3,y+3),INK)
        else:
            d.polygon([(0,2),(2,4),(4,0),(6,4),(8,2),(7,7),(1,7)],INK)
    for count in range(1,4):
        w = 4 + count*10
        d = layer(f"trait/plate/{count}", (w,11))
        d.rounded_rectangle((0,0,w-1,10),2,BRASS,INK)
        d.line((3,1,w-4,1),WHITE)
        for x in (1,w-2): d.point((x,5),OCHRE)
    for kind,color in (("value",PAPER),("hype",FLAME)):
        d = layer("tag/"+kind,(16,9))
        d.polygon([(0,4),(3,0),(15,0),(15,8),(3,8)],color,INK)
        d.point((2,4),OCHRE)
    for symbol in "0123456789+":
        name = "plus" if symbol=="+" else symbol
        d = layer("digits/"+name,(4,6))
        if symbol=="+": d.line((0,2,2,2),INK); d.line((1,1,1,3),INK)
        else: label(d,0,0,symbol,INK)
    d = layer("slab/case",(72,106))
    d.rounded_rectangle((0,0,71,105),4,outline="#818193",width=3)
    d.line((2,101,2,4,5,1,67,1),WHITE)
    d = layer("slab/label",(64,12))
    d.rectangle((0,0,63,11),PAPER,BRASS)
    d.polygon([(3,8),(4,4),(6,5),(8,1),(10,7),(8,10)],FLAME,RED)
    label(d,14,4,"GRADE",INK)
    for n in range(1,11):
        d = layer(f"slab/digits/{n}",(10,10))
        label(d,1 if n==10 else 3,2,str(n),OCHRE)
    return parts
