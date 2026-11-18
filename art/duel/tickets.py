"""Letterpress impressions, engraved counters and plate icons."""
from pathlib import Path
from runpy import run_path
from PIL import Image, ImageDraw

letter = run_path(str(Path(__file__).resolve().parents[1]/"packaging/boosters/build.py"))["lettering"]
INK, PAPER, GOLD, EDGE = "#1c1513","#f6ecd2","#e8c260","#9c7028"


def parts():
    result = {}
    for name,w,h,word,c in (
        ("hud/ko/stamp",140,48,"K.-O. !","#7a1a2c"),
        ("hud/marker/paid",80,28,"PAYÉ","#a82a38"),
        ("hud/marker/unpaid",96,28,"IMPAYÉ",INK),
        ("hud/stamp/skip",30,11,"PASSE","#8c7656"),
        ("hud/album/new",24,10,"NEW","#a82a38"),
    ):
        im=Image.new("RGBA",(w,h))
        d=ImageDraw.Draw(im)
        d.rounded_rectangle((1,1,w-2,h-2),2,outline=c,width=2 if h>20 else 1)
        if h>20:
            mask=Image.new("RGBA",(w//2,16))
            letter(mask,word,mask.width//2,2,c,"didone",mask.width-8)
            mask=mask.resize((w-8,h-10),Image.Resampling.NEAREST)
            if name=="hud/ko/stamp": im.paste(GOLD,(5,7,w-3,h-3),mask.getchannel("A"))
            im.alpha_composite(mask,(4,5))
        else: letter(im,word,w//2,3,c)
        for x in range(7,w-4,13): d.point((x,1),(0,0,0,0))
        result[name]=im
    for key,w,h in (("play",19,11),("discard",19,11)):
        im=Image.new("RGBA",(w,h))
        d=ImageDraw.Draw(im)
        if key=="play":
            d.line([(2,5),(7,9),(16,1)],"#3e66a0",3)
        else:
            d.rectangle((5,1,13,9),outline="#7a4ab0")
            d.line((2,10,16,0),"#7a4ab0",2)
        result["hud/stamp/"+key]=im
    for name,w,h,word in (("hud/spoils/placard",96,22,"LE BUTIN"),("hud/spoils/order",20,12,"1ER"),("hud/spoils/order/2",20,12,"2E"),("hud/token/premier",38,38,"")):
        im=Image.new("RGBA",(w,h))
        d=ImageDraw.Draw(im)
        if name.endswith("placard"):
            for x in (6,w-7): d.line((x,0,x+2,5),EDGE)
            d.rounded_rectangle((0,4,w-1,h-1),2,PAPER,INK)
            d.line((3,h-3,w-4,h-3),EDGE)
            letter(im,word,w//2,7,"#7a1a2c","didone")
        else:
            d.ellipse((0,0,w-1,h-1),EDGE,INK)
            d.ellipse((2,1,w-3,h-3),GOLD,EDGE)
            d.arc((3,2,w-4,h-4),180,305,PAPER)
            if word: letter(im,word,w//2,3,INK)
        result[name]=im
    for k in ("discard","sleeve","pairs","low","straights","money","finishes","hearts","flambe","grade","junk","jokers"):
        im=Image.new("RGBA",(9,9))
        d=ImageDraw.Draw(im)
        if k in ("pairs","sleeve"):
            d.rectangle((0,2,5,8),PAPER,INK)
            d.rectangle((3,0,8,6),PAPER,INK)
            if k=="sleeve": d.polygon([(0,5),(8,3),(8,7),(2,8)],"#513260",INK)
        elif k=="discard":
            d.polygon([(0,3),(4,1),(7,6),(3,8)],PAPER,INK)
            d.line([(4,0),(7,0),(8,3),(6,2)],"#9a6ad0")
        elif k=="low":
            d.ellipse((0,0,8,8),GOLD,EDGE)
            letter(im,"2",4,2,INK)
        elif k=="straights":
            d.line((0,7,8,1),"#4a9a74",2)
            for x,y in ((1,6),(4,4),(7,1)): d.rectangle((x-1,y,x+1,y+1),PAPER)
        elif k=="money":
            d.polygon([(0,3),(7,0),(8,5),(1,8)],"#4a9a74",INK)
            d.line((3,3,4,5),PAPER)
        elif k=="finishes":
            d.polygon([(0,3),(2,0),(6,0),(8,3),(4,8)],"#9a6ad0",INK)
            d.line((1,3,7,3),GOLD)
        elif k=="hearts":
            d.polygon([(0,2),(2,1),(4,3),(6,1),(8,3),(7,5),(4,8),(0,4)],"#a82a38",INK)
            d.point((7,1),PAPER)
        elif k=="flambe":
            d.polygon([(0,5),(3,2),(3,4),(6,0),(8,5),(6,8),(2,8)],"#e8501a",INK)
            d.line((4,7,5,5),GOLD)
        elif k=="grade":
            d.rectangle((1,0,7,8),PAPER,INK)
            d.rectangle((2,1,6,2),GOLD)
            d.line((3,5,5,5),"#a82a38")
        elif k=="junk":
            d.polygon([(0,4),(3,1),(6,1),(8,5),(5,8),(1,7)],"#5c4a36",INK)
            d.line((2,3,5,2),"#bfa77e")
        else:
            d.polygon([(0,1),(4,3),(7,0),(6,6),(3,6)],"#9a6ad0",INK)
            d.ellipse((4,5,7,8),GOLD,EDGE)
        result[("icon/" if k in ("discard","sleeve") else "icon/lane/")+k]=im
    im=Image.new("RGBA",(96,44))
    d=ImageDraw.Draw(im)
    d.polygon([(1,3),(18,1),(25,3),(30,1),(69,2),(72,4),(79,1),(94,2),(95,32),(92,35),(94,42),(74,43),(69,40),(63,42),(4,43),(1,37),(3,30)],"#43342e",INK,2)
    for x,y in ((5,3),(20,2),(26,3),(73,4),(92,33),(69,40),(62,41),(4,34)):
        d.line((x,y,x+2,y),"#e8501a")
        d.point((x+1,y),"#ffb03a")
    result["hud/score/tag/thrown"]=im
    return result
