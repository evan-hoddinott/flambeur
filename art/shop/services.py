"""The guichet, its three dispatch parcels and the register's bulk bin."""
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
    im=Image.new("RGBA",(50,40))
    d=ImageDraw.Draw(im)
    for x,y in ((8,8),(23,4)):
        d.polygon([(x,y),(x+13,y-3),(x+19,y+8),(x+3,y+13)],WOOD,INK)
        d.line((x+1,y,x+12,y-2),TAN)
    d.polygon([(1,12),(49,11),(43,35),(8,39)],"#818193",INK,2)
    d.line((3,13,47,12),"#dcdce8",2)
    for x in (8,12,39,43): d.line((x,16,x-1,33),"#5c5c6e")
    text(im,"VRAC",25,18,"sans",INK,"center")
    out["shop/bulk/bin"]=im
    return out
