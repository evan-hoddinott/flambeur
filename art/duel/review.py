"""Assemble four static art proofs from the same independent sprites as the game."""
import json
from functools import lru_cache
from math import cos, degrees, exp, radians, sin
from pathlib import Path
from runpy import run_path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
CARD_DIR = ROOT.parent / "cards"
NN = Image.Resampling.NEAREST
INK, BRASS, CREAM = "#2e2320", "#c99a3a", "#f6ecd2"
BURGUNDY, BLUE, GREEN = "#7a1a2c", "#28497a", "#b8f0a0"
HAND = [
    "7-of-clubs", "8-of-diamonds", "9-of-spades", "10-of-hearts",
    "jack-of-clubs", "queen-of-hearts", "king-of-spades", "ace-of-diamonds",
]
# The small unfolded print samples use the unlevelled values from engine/hands.ts.
POKER = [
    ("Royal Flush", "10h Jh Qh Kh Ah", 150, 10),
    ("Straight Flush", "4s 5s 6s 7s 8s", 100, 8),
    ("Four of a Kind", "9h 9s 9d 9c", 60, 7),
    ("Full House", "Kh Ks Kd 8c 8h", 45, 4),
    ("Flush", "2d 4d 7d Jd Ad", 35, 4),
    ("Straight", "4s 5h 6c 7d 8s", 35, 4),
    ("Three of a Kind", "Qh Qs Qd", 30, 3),
    ("Two Pair", "10s 10h 8c 8d", 20, 2),
    ("Pair", "Jh Jc", 10, 2),
    ("High Card", "As", 5, 1),
]


@lru_cache(maxsize=1)
def card_library():
    # Use the production card compositor. The proof must reflect a change to any slice.
    recipes = run_path(str(CARD_DIR / "build.py"))
    parts = {}
    metadata = json.loads((CARD_DIR / "cards.json").read_text())
    with Image.open(CARD_DIR / "cards.png") as atlas:
        for entry in metadata["meta"]["slices"]:
            box = entry["keys"][0]["bounds"]
            x, y, w, h = (box[k] for k in ("x","y","w","h"))
            parts[entry["name"]] = atlas.crop((x,y,x+w,y+h)).convert("RGBA")
    return recipes, parts


@lru_cache(maxsize=None)
def card_image(name):
    recipes, parts = card_library()
    if name.startswith("backs/"):
        return recipes["back"](parts, name.split("/")[1])
    rank_name,suit_name = name.split("-of-")
    rank = {v:k for k,v in recipes["NAMES"].items()}.get(rank_name,rank_name)
    suit = {v:k for k,v in recipes["SUITS"].items()}[suit_name]
    return recipes["face"](parts,rank,suit)


class Stage:
    """Keep layout in art units and composite on the physical output grid."""
    def __init__(self, scale):
        self.scale = scale
        self.image = Image.new("RGBA", (640 * scale, 360 * scale), "#1c1513")

    def alpha_composite(self, sprite, pos=(0, 0)):
        w, h = sprite.size
        scaled = sprite.resize((w * self.scale, h * self.scale), NN)
        self.image.alpha_composite(scaled, tuple(round(v * self.scale) for v in pos))


def label(canvas, xy, text, size=10, fill=CREAM, *, anchor="lt"):
    # Proof type is rasterized at output resolution, independently of the artwork.
    scale = canvas.scale
    font = ImageFont.load_default(size=size * scale)
    if not text.isascii():
        try:
            font = ImageFont.truetype("DejaVuSans.ttf", size * scale)
        except OSError:
            font = ImageFont.load_default_imagefont()
            bounds = font.getbbox(text)
            patch = Image.new("RGBA", (bounds[2] - bounds[0], bounds[3] - bounds[1]))
            ImageDraw.Draw(patch).text((-bounds[0], -bounds[1]), text, font=font, fill=fill)
            canvas.alpha_composite(patch, xy)
            return
    ImageDraw.Draw(canvas.image).text(tuple(round(v * scale) for v in xy), text,
                                      fill=fill, font=font, anchor=anchor)


def centered(canvas, img, x, y, *, size=None, angle=0, lifted=False):
    scale = canvas.scale
    w, h = size or img.size
    if angle:
        # Sample crisp texels four times per display axis, then resolve coverage.
        # This smooths tilted borders over one screen pixel without blurring the card.
        samples = 4
        size = round(w * scale * samples), round(h * scale * samples)
        rotated = img.resize(size, NN).rotate(angle, NN, expand=True)
        img = rotated.resize((round(rotated.width / samples), round(rotated.height / samples)),
                             Image.Resampling.BOX)
    else:
        img = img.resize((round(w * scale), round(h * scale)), NN)
    left, top = round(x * scale - img.width / 2), round(y * scale - img.height / 2)
    if lifted:
        pad = 5 * scale
        mask = Image.new("L", (img.width + 2 * pad, img.height + 2 * pad))
        mask.paste(img.getchannel("A"), (pad, pad))
        shadow = Image.new("RGBA", mask.size, "#120e08")
        shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(1.6 * scale)).point(lambda a: a // 3))
        canvas.image.alpha_composite(shadow, (left - pad + scale, top - pad + 3 * scale))
    canvas.image.alpha_composite(img, (left, top))


def nine_slice(sprite, middle, width, height):
    """Keep hardware, corners and paper edges at native pixel size."""
    x, y, w, h = middle
    sx = (0, x, x + w, sprite.width)
    sy = (0, y, y + h, sprite.height)
    dx = (0, x, width - (sprite.width-x-w), width)
    dy = (0, y, height - (sprite.height-y-h), height)
    output = Image.new("RGBA", (width, height))
    for row in range(3):
        for col in range(3):
            target = (dx[col+1]-dx[col], dy[row+1]-dy[row])
            if min(target) <= 0 or sx[col+1] == sx[col] or sy[row+1] == sy[row]:
                continue
            piece = sprite.crop((sx[col], sy[row], sx[col+1], sy[row+1]))
            output.alpha_composite(piece.resize(target, NN), (dx[col],dy[row]))
    return output


class Proof:
    def __init__(self, parts, pivots, centers, tournament):
        self.parts, self.pivots, self.centers = parts, pivots, centers
        self.tournament = tournament
        self.canvas = Stage(2)
        self.rival = "king_spades" if tournament else "hare"
        self.back = card_image("backs/highroller" if tournament else "backs/classic")

    def pin(self, key, x, y, *, flip=False, angle=0, scale=1):
        img = self.parts[key]
        px, py = self.pivots[key]
        if flip:
            img = ImageOps.mirror(img)
            px = img.width - 1 - px
        screen = self.canvas.scale
        factor = scale * screen
        img = img.resize((round(img.width * factor), round(img.height * factor)), NN)
        px, py = px * factor, py * factor
        if angle:
            r = max(img.size) * 2
            disc = Image.new("RGBA", (r*2+1, r*2+1))
            disc.alpha_composite(img, (round(r-px), round(r-py)))
            img = disc.rotate(angle, NN)
            px, py = r, r
        self.canvas.image.alpha_composite(img, (round(x * screen - px), round(y * screen - py)))

    def panel(self, key, x, y, w, h):
        panel = nine_slice(self.parts[key], self.centers[key], w, h)
        self.canvas.alpha_composite(panel, (x, y))

    def text(self, x, y, data, size=10, fill=CREAM, *, anchor="lt"):
        label(self.canvas, (x,y), data, size, fill, anchor=anchor)

    def tile(self, key, x, y, w, h):
        img = self.parts[key]
        field = Image.new("RGBA", (w,h))
        for ty in range(0,h,img.height):
            for tx in range(0,w,img.width):
                field.alpha_composite(img,(tx,ty))
        self.canvas.alpha_composite(field, (x,y))

    def patron(self,n,x,y):
        scale = 1.15 if self.tournament else 1
        lean = (0,3,-3,2,-2,0)[n-1]
        self.pin(f"crowd/{n}",x,y,scale=scale)
        for piece in ("head","mask"):
            self.pin(f"crowd/{n}/{piece}",x+lean*scale,y-40*scale,scale=scale)

    def curtains(self):
        for flip in (False,True):
            x=639 if flip else 0
            self.pin("room/curtain/L",x,0,flip=flip)
            self.pin("room/curtain/cord",x,96,flip=flip)
            self.pin("room/curtain/tassel",x-21 if flip else 21,118,flip=flip)

    def room(self):
        self.tile("room/wall", 0,0,640,122)
        audience = [(193,127),(544,130)]
        if self.tournament:
            audience += [(147,135),(220,127),(493,129),(576,134),(110,126),
                         (518,126),(253,131),(359,132),(72,128),(603,133)]
        for i,(x,y) in enumerate(audience):
            n = i%6+1
            self.patron(n,x,y)
        for x,y in ((169,56),(562,83)):
            self.pin("room/sconce",x,y)
            self.pin("room/sconce/flame/2",x+1,y-1)
        self.curtains()
        self.canvas.alpha_composite(self.parts["room/chalkboard"],(34,28))
        self.text(82,43,"TABLE IV" if self.tournament else "TABLE I",13,"#e3d2a8",anchor="mt")
        self.text(82,60,"Manche 12" if self.tournament else "Manche 2",10,"#bfa77e",anchor="mt")
        if self.tournament:
            self.text(82,75,"Lowball",8,"#c99a3a",anchor="mt")
        # The proof simulates the stage vignette in a separate pass.
        vignette = Image.new("RGBA",(640,151))
        for x in range(640):
            darkness = round(96 * (abs(x-319.5)/320)**1.8)
            ImageDraw.Draw(vignette).line((x,0,x,150),fill=(9,3,10,darkness))
        self.canvas.alpha_composite(vignette)
        # Preview the lamp lighting on the room. The sprite files contain no light cone.
        beam = Image.new("RGBA",(640,122))
        beam.putdata([
            (246,207,117,round(18*exp(-((x-320)/(48+y*.64))**4)*(1-y/180)))
            for y in range(122) for x in range(640)
        ])
        self.canvas.alpha_composite(beam,(0,31))

    def players(self):
        rival_x = 409
        self.pin("rival/torso",rival_x,120)
        self.pin("rival/head",rival_x,79)
        self.pin("rival/eyes/open",rival_x,58)
        self.pin(f"mask/{self.rival}/front",rival_x,58)
        for i in range(7):
            centered(self.canvas,self.back,rival_x+(i-3)*8,104+abs(i-3)*1.5,
                     size=(32,44),angle=24-8*i)

    def lamp(self):
        self.tile("lamp/rod",318,0,4,30)
        centered(self.canvas,self.parts["lamp/fitting"],320,29)
        shade = self.parts["lamp/shade"]
        if self.tournament:
            shade = ImageOps.colorize(ImageOps.grayscale(shade),"#2a0910","#d04a4e").convert("RGBA")
            shade.putalpha(self.parts["lamp/shade"].getchannel("A"))
        centered(self.canvas,shade,320,47)
        centered(self.canvas,self.parts["lamp/bulb"],320,61)

    def flat_print(self, key, x, y, size):
        # Project thin ink lines with coverage; a nearest sample can miss a whole edge.
        image = self.parts[key].resize(size, Image.Resampling.BOX)
        image.putalpha(image.getchannel("A").point(lambda a: min(255, a * 2)))
        centered(self.canvas, image, x, y)

    def felt(self):
        key = "felt/black" if self.tournament else "felt/green"
        src = self.parts[key]
        # Pull one projected scanline from the repeating weave at each depth.
        far, near = 116, 330
        field = Image.new("RGBA",(640,near-far))
        for y in range(field.height):
            depth = y/(field.height-1)
            scale = 0.51+0.49*depth
            size = max(1, round(src.width*scale))
            sy = int(field.height*2.3*depth/(0.70+0.30*depth))%src.height
            strip = src.crop((0,sy,src.width,sy+1)).resize((size,1),NN)
            for x in range(320 % size-size,640,size):
                field.paste(strip,(x,y))
        self.canvas.alpha_composite(field,(0,far))
        # A separate lighting pass for the art proof, never saved in a sprite.
        lighting = Image.new("RGBA",field.size)
        alpha = []
        for y in range(field.height):
            for x in range(640):
                d = ((x-318)/365)**2 + ((y-82)/210)**2
                alpha.append(min(135,round(14+60*d)))
        lighting.putalpha(bytes_to_mask(alpha,field.size))
        self.canvas.alpha_composite(lighting,(0,far))
        pool=Image.new("RGBA",field.size)
        color=(232,174,112) if self.tournament else (246,226,159)
        pool.putdata([(*color,round(23*exp(-((x-320)/195)**2-((y-72)/88)**2)))
                      for y in range(field.height) for x in range(640)])
        self.canvas.alpha_composite(pool,(0,far))
        if self.tournament:
            for y in (122,310):
                self.tile("felt/print/inlay",0,y,640,12)
        # The far row sits under the rival; the near row opens toward the player.
        for cx,y,w,h,gap in [(365,151,36,21,41),(311,231,44,32,50)]:
            for n in range(-2,3):
                self.flat_print("felt/print/spot",cx+n*gap,y,(w,h))
        self.flat_print("felt/print/pot",322,191,(145,35))
        self.flat_print("felt/print/crest",307,191,(49,28))
        self.tile("rail/far",0,far-4,640,6)
        self.tile("rail/near",0,near-4,640,18)
        for x in range(6,640,12):
            centered(self.canvas,self.parts["rail/stud"],x,near+6)
        rival_box = "highroller" if self.tournament else "classic"
        self.pile(223,158,0.64,rival_box,17)
        self.pile(547,159,0.64,rival_box,3,discard=True)
        self.pile(146,251,0.96,"standard",24)
        self.pile(506,249,0.90,"standard",5,discard=True)
        self.stack(483,151,[(25,1),(5,3),(1,5)],0.78)
        self.stack(460,275,[(25,2),(5,2),(1,2)],1.05)
        self.stack(346,193,[(5,1),(1,3)],0.95)
        self.text(372,186,"$8",10,GREEN,anchor="mt")
        self.text(484,129,"$45",10,"#d04a4e",anchor="mt")
        self.text(458,254,"$62",10,"#6f9ad8",anchor="mt")

    def pile(self,x,y,scale,box,count,discard=False):
        from deckstack import deck_stack
        key = "felt/print/discard" if discard else "felt/print/pile"
        width, height = round(72*scale), round(55*scale)
        self.flat_print(key,x,y,(width,height))
        screen = self.canvas.scale
        pile = deck_stack(self.parts, card_image("backs/" + box), count, scale * screen * 4)
        pile = pile.resize((round(pile.width / 4), round(pile.height / 4)), Image.Resampling.BOX)
        self.canvas.image.alpha_composite(pile, (round(x * screen - pile.width / 2),
                                                 round((y + height // 3) * screen - pile.height)))

    def stack(self,x,y,stacks,scale):
        for n,(value,count) in enumerate(stacks):
            dx=x+int((n-(len(stacks)-1)/2)*12*scale)
            key=f"chip/jeton/{value}"
            bottom=y+(n%2)*2
            for j in range(count):
                centered(self.canvas,self.parts[key+"/edge"],dx,bottom-j*max(1,round(2*scale)),
                         size=(round(16*scale),max(2,round(3*scale))))
            centered(self.canvas,self.parts[key+"/top"],dx,bottom-count*max(1,round(2*scale))-1,
                     size=(round(16*scale),round(10*scale)))

    def foreground(self):
        self.pin("you/shoulders",115,360)
        self.pin("you/head",115,329)
        self.pin("mask/domino_red/back",115,305)
        for i,name in enumerate(HAND):
            theta = radians(-19+38*i/7)
            centered(self.canvas,card_image(name),335+260*sin(theta),
                     298+260*(1-cos(theta)),angle=-degrees(theta),lifted=True)
        centered(self.canvas,self.parts["hud/cheat/ball"],602,338)

    def plate(self,x,y,player):
        self.panel("hud/plate/frame",x,y,150,58)
        self.panel("hud/plate/paper",x+5,y+5,140,48)
        mask = "domino_red" if player else self.rival
        centered(self.canvas,self.parts[f"mask/{mask}/icon"],x+20,y+17)
        self.text(x+34,y+11,"Vous" if player else ("Le Roi" if self.tournament else "Le Lièvre"),12,INK)
        self.text(x+12,y+32,"$62" if player else "$45",16,BLUE if player else BURGUNDY)
        for i,(key,v) in enumerate([("hand","8" if player else "7"),("mulligan","0" if player else "1")]):
            centered(self.canvas,self.parts["icon/"+key],x+88+i*31,y+39)
            self.text(x+94+i*31,y+36,v,9,INK)
        if not player:
            self.text(x+138,y+13,"GROS JOUEUR" if self.tournament else "FACILE",8,BURGUNDY,anchor="rt")

    def hud(self):
        self.plate(8,144,True)
        self.plate(482,12,False)
        self.canvas.alpha_composite(self.parts["hud/vitrine/tab"],(8,0))
        actions = [("Fold",""),("Flamber","$4"),("Min","$2"),("Max","$8")]
        if self.tournament:
            actions=[("Match","$8"),("Fold","")]
        for i,(action,price) in enumerate(actions):
            x,y=550,247+19*i
            self.panel("hud/slip",x,y,80,17)
            self.text(x+10,y+4,action,10,INK)
            self.text(x+72,y+4,price,9,BURGUNDY,anchor="rt")
        if self.tournament:
            self.tile("hud/twist/string",204,0,1,53)
            self.tile("hud/twist/string",271,0,1,53)
            self.panel("hud/twist/sign",183,52,111,36)
            self.text(238,58,"LOWBALL",12,BURGUNDY,anchor="mt")
            self.text(238,74,"Lowest score wins",9,INK,anchor="mt")

    def vitrine(self):
        _,card_parts=card_library()
        base=card_parts["base/paper"]
        self.panel("hud/vitrine/case",8,15,254,124)
        examples = [
            ("Lucky Penny","chip/jeton/5/top","+4 Hype"),
            ("Card Stack","pile/stack","+12 Hype"),
            ("Top Loader","felt/print/spot","+30 Value"),
        ]
        for i,(name,key,rule) in enumerate(examples):
            x,y=26+79*i,36
            self.canvas.alpha_composite(base,(x,y))
            self.text(x+32,y+12,name,9,INK,anchor="mt")
            glyph=self.parts[key]
            if name=="Top Loader":
                centered(self.canvas,glyph,x+32,y+44,size=(30,40))
                centered(self.canvas,card_image("backs/collector"),x+32,y+44,size=(21,30))
            elif name=="Card Stack":
                centered(self.canvas,glyph,x+31,y+48,size=(31,7))
                centered(self.canvas,card_image("backs/classic"),x+32,y+43,size=(30,17),angle=-7)
            else:
                centered(self.canvas,glyph,x+32,y+43,size=(31,19))
            if name=="Card Stack":
                self.text(x+32,y+62,"TRIPS",8,INK,anchor="mt")
            self.text(x+32,y+69,rule,8,BURGUNDY,anchor="mt")
        self.canvas.alpha_composite(self.parts["hud/vitrine/tab"],(8,0))

    def cheat(self):
        self.canvas.alpha_composite(Image.new("RGBA",(640,360),(14,11,10,159)))
        self.panel("hud/cheat/sheet",44,10,552,340)
        crease=self.parts["hud/cheat/crease"]
        for x in (230,421):
            centered(self.canvas,crease,x,180,size=(3,323))
        for y in (125,232):
            centered(self.canvas,crease,320,y,size=(3,530),angle=90)
        self.text(73,30,"Les mains de poker",22,INK)
        self.text(72,56,"HAND",9,BURGUNDY)
        self.text(262,56,"CARDS",9,BURGUNDY)
        self.text(460,56,"VALUE",9,BURGUNDY,anchor="mt")
        self.text(526,56,"HYPE",9,BURGUNDY,anchor="mt")
        suits=dict(h="hearts",s="spades",d="diamonds",c="clubs")
        ranks=dict(A="ace",J="jack",Q="queen",K="king")
        for i,(name,examples,value,hype) in enumerate(POKER):
            y=71+26*i
            self.text(73,y+4,name,12,INK)
            for j,example in enumerate(examples.split()):
                r=example[:-1]
                card=card_image(ranks.get(r,r)+"-of-"+suits[example[-1]])
                # Show just each card's index at native size in a small paper tab.
                patch=card.crop((0,0,14,24))
                self.canvas.alpha_composite(patch,(263+j*21,y))
            self.text(460,y+4,str(value),12,INK,anchor="mt")
            self.text(526,y+4,str(hype),12,BURGUNDY,anchor="mt")


def bytes_to_mask(values, size):
    return Image.frombytes("L",size,bytes(values))


def review(parts,pivots,centers):
    scenes=[]
    for variant in ("table-1","table-4","vitrine","cheat-sheet"):
        proof=Proof(parts,pivots,centers,variant=="table-4")
        proof.room()
        proof.lamp()
        proof.players()
        proof.felt()
        proof.foreground()
        proof.hud()
        if variant=="vitrine":
            proof.vitrine()
        elif variant=="cheat-sheet":
            proof.cheat()
        display=proof.canvas.image.convert("RGB")
        draw=display.resize((640,360),Image.Resampling.BOX)
        folder=ROOT/"previews"
        folder.mkdir(exist_ok=True)
        draw.save(folder/f"{variant}.png")
        display.save(folder/f"{variant}@2x.png")
        scenes.append(draw)
    sheet=Image.new("RGB",(1280,720))
    for i,scene in enumerate(scenes):
        sheet.paste(scene,((i%2)*640,(i//2)*360))
    sheet.save(ROOT/"review.png")



def tilt_review():
    """Compare the same king at six degrees on the art and display grids."""
    card = card_image("king-of-spades")
    art = Image.new("RGBA", (112, 108), "#174034")
    tilted = card.rotate(6, NN, expand=True)
    art.alpha_composite(tilted, ((112 - tilted.width) // 2, (108 - tilted.height) // 2))
    scale = 4
    display = Stage(scale)
    display.image = Image.new("RGBA", (112 * scale, 108 * scale), "#174034")
    centered(display, card, 56, 54, angle=6)
    comparison = Image.new("RGB", (224 * scale, 108 * scale + 40), "#174034")
    comparison.paste(art.resize(display.image.size, NN), (0, 0))
    comparison.paste(display.image, (112 * scale, 0))
    draw = ImageDraw.Draw(comparison)
    font = ImageFont.load_default(size=19)
    for i, title in enumerate(("Rotate on the art grid", "Rotate on the display grid")):
        draw.text(((i + .5) * 112 * scale, 108 * scale + 4), title, anchor="mt",
                  font=font, fill=CREAM)
    comparison.save(ROOT / "tilt-comparison.png")
