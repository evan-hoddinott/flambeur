"""The guichet, its three dispatch parcels and the register's ashtray (the Ash service, ids still say bulk)."""
from PIL import Image, ImageDraw

INK,WOOD,TAN,PAPER,GOLD="#1c1513","#5c4a36","#bfa77e","#f6ecd2","#e8c260"


def parts(text):
    out={}
    for key,c,b in (("poste","#b07a3a",TAN),("chrono","#28497a","#b8d0e8"),("fourgon","#43342e","#818193")):
        im=Image.new("RGBA",(44,30))
        d=ImageDraw.Draw(im)
        d.polygon([(1,9),(26,1),(42,6),(42,22),(17,29),(1,23)],c,INK)
        d.polygon([(1,9),(26,1),(42,6),(17,15)],b,INK)
        d.line((17,15,17,28),INK)
        d.line([(9,12),(34,4),(37,5),(12,13),(12,25)],GOLD,2)
        d.polygon([(22,16),(34,12),(34,18),(22,21)],PAPER)
        if key=="fourgon":
            for x,y in ((3,12),(39,9),(39,21),(18,24)): d.point((x,y),PAPER)
        out["shop/parcel/"+key]=im
    im=Image.new("RGBA",(122,56))
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((0,0,121,55),3,WOOD,INK,2)
    d.rectangle((5,4,116,45),"#28497a",TAN,2)
    for x in range(12,117,11): d.line((x,6,x,39),INK,2)
    d.rectangle((29,4,94,18),PAPER,INK)
    text(im,"EXPERTISE",61,5,"sans",INK,"center")
    d.rounded_rectangle((47,28,76,48),6,INK,TAN)
    d.rectangle((1,45,120,53),TAN,INK)
    d.rectangle((42,45,80,49),WOOD,INK)
    out["shop/grading/guichet"]=im
    im=Image.new("RGBA",(25,23))
    d=ImageDraw.Draw(im)
    d.ellipse((0,0,23,21),outline="#7a1a2c",width=2)
    d.arc((3,3,20,19),12,168,"#a82a38")
    text(im,"PARIS",12,7,"tiny","#7a1a2c","center")
    out["shop/grading/postmark"]=im
    # the ashtray (the Ash service, docs/FLAMBER.md §5): a low brass cendrier full of ash, a burnt card corner
    # sticking out of it, a cigarette resting in a notch
    im=Image.new("RGBA",(50,40))
    d=ImageDraw.Draw(im)
    d.ellipse((2,15,47,38),"#775023",INK)
    d.rectangle((3,21,46,27),"#775023")
    d.line((2,21,2,27),INK)
    d.line((47,21,47,27),INK)
    for x in range(6,44,5): d.line((x,29,x,33),"#5c3a1a")
    d.ellipse((2,9,47,32),"#c99a3a",INK)
    d.arc((4,10,45,31),190,330,GOLD)
    d.ellipse((7,12,42,29),"#3a2c26","#5c3a1a")
    d.ellipse((10,15,39,28),"#6b605a")
    for y in range(15,28):
        for x in range(10,40):
            if (x+y)%2==0 and ((x-24.5)/14)**2+((y-21)/6)**2<0.45: d.point((x,y),"#9a8f86")
    for x,y in ((15,19),(21,23),(30,18),(34,24),(26,21),(18,25)): d.point((x,y),"#c9bfb4")
    d.point((28,25),"#f77a1c"); d.point((29,25),"#9c1f26"); d.point((13,22),"#ffe45e")
    # a burnt card corner in the ash
    d.polygon([(19,20),(23,7),(33,10),(30,22)],PAPER,"#2e1810")
    d.line((24,8,32,11),"#5a3420")
    d.polygon([(27,15),(31,13),(30,22),(25,21)],"#5a3420")
    d.point((22,12),"#a82a38"); d.point((23,13),"#a82a38")
    # notches in the rim, the cigarette in the right one
    for x,y in ((10,12),(39,12),(24,30)): d.rectangle((x,y,x+2,y+1),"#3a2c26")
    d.line((35,14,48,9),INK,3)
    d.line((35,13,48,8),"#f6ecd2",2)
    d.line((35,13,38,12),"#d08a4a",2)
    d.point((48,7),"#f77a1c"); d.point((49,7),"#9a8f86")
    out["shop/bulk/bin"]=im
    return out
