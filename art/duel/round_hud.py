"""Round medals, enamel knockout plaque and the patron's folded note."""
from PIL import Image, ImageDraw

INK = "#1c1513"
BRONZE = "#6b4a1a"
BRASS = "#c99a3a"
GOLD = "#e8c260"
LIGHT = "#fff0b0"
PAPER = "#f6ecd2"
ASH = "#8c7656"


def medal(state, frame=0):
    im = Image.new("RGBA", (12, 12))
    d = ImageDraw.Draw(im)
    d.ellipse((0, 1, 11, 11), BRONZE, INK)
    d.ellipse((0, 0, 11, 10), BRASS, INK)
    d.arc((1, 1, 10, 9), 170, 285, LIGHT)
    d.ellipse((2, 2, 9, 8), {
        "open": "#244237", "won": GOLD, "lost": "#43342e",
        "tie": GOLD, "thrown": ASH,
    }[state], BRONZE)
    if state == "won":
        d.polygon([(4,6),(6,3),(6,5),(8,4),(7,7),(5,8)], "#9c7028")
        d.point((6,6), LIGHT)
    elif state == "tie":
        d.polygon([(3,7),(8,3),(9,5),(8,7),(6,8)], "#43342e")
    elif state == "lost":
        d.line([(7,2),(5,5),(7,5),(4,8)], INK)
    elif state == "thrown":
        d.polygon([(4,5),(6,3),(8,5),(6,8),(4,7)], INK)
        d.line([(6,4),(7,3),(6,2),(6+frame,0)], "#bfa77e")
    return im


def parts():
    out = {"hud/hand/pip/"+s: medal(s) for s in ("won","lost","open","tie","thrown")}
    out["hud/hand/pip/thrown/1"] = medal("thrown",1)
    im = Image.new("RGBA",(44,16))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0,0,43,15),3,BRONZE,INK)
    d.rounded_rectangle((1,1,42,13),2,BRASS)
    d.rounded_rectangle((3,2,40,12),2,PAPER,BRONZE)
    for x in (2,41):
        d.point((x,7),LIGHT)
        d.point((x,8),INK)
    out["hud/ko/badge"] = im
    seal = Image.new("RGBA",(10,10))
    d = ImageDraw.Draw(seal)
    d.polygon([(2,1),(5,0),(7,1),(9,3),(8,6),(9,8),(6,9),(2,8),(0,6),(1,3)],"#a82a38","#4e1020")
    d.line([(3,6),(3,3),(6,3),(6,5),(4,5)],"#d04a4e")
    d.point((3,2),LIGHT)
    out["hud/marker/seal"] = seal
    im = Image.new("RGBA",(58,26))
    d = ImageDraw.Draw(im)
    d.polygon([(1,2),(51,0),(57,4),(56,23),(3,25),(0,22)],"#bfa77e",INK)
    d.polygon([(2,3),(50,1),(55,5),(54,21),(3,23)],PAPER)
    d.line((30,3,31,21),"#e3d2a8")
    d.line((51,1,50,6,55,5),ASH)
    d.line((37,18,51,17),"#bfa77e")
    d.ellipse((26,1,30,5),BRASS,BRONZE)
    d.point((27,2),LIGHT)
    im.alpha_composite(seal,(44,7))
    out["hud/marker/note"] = im
    return out
