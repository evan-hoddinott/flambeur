"""Dinner-jacket sleeves, ivory gloves and their articulated poses."""
from PIL import Image, ImageDraw, ImageOps

INK, CLOTH, SILK, CUFF, LIGHT = "#1c1513","#302830","#51444a","#bfa77e","#f6ecd2"


def parts():
    out = {}
    for joint,w,h in (("upper",22,40),("fore",18,36)):
        im=Image.new("RGBA",(w,h))
        d=ImageDraw.Draw(im)
        d.polygon([(4,1),(w-7,0),(w-2,6),(w-1,18),(w-5,h-2),(6,h-1),(1,h-9),(0,11)],CLOTH,INK)
        d.line([(3,12),(5,4),(w-8,2)],SILK,2)
        d.polygon([(1,15),(6,22),(4,29),(8,h-4),(3,h-7)],INK)
        d.line((6,h-9,w-4,h-12),SILK)
        if joint=="fore":
            d.polygon([(4,h-8),(w-4,h-10),(w-4,h-4),(6,h-1)],LIGHT,INK)
            d.point((w-6,h-6),"#c99a3a")
        for side in "LR":
            out[f"rival/arm/{joint}/{side}"]=im if side=="L" else ImageOps.mirror(im)
    def glove(w,h,pose,frame):
        im=Image.new("RGBA",(w,h))
        d=ImageDraw.Draw(im)
        d.polygon([(0,5),(5,2),(9,3),(13,1),(16,3),(15,8),(12,h-5),(5,h-3),(1,h-6)],CUFF,INK)
        for i in range(3):
            x=7+3*i
            y=3+i
            reach=(w-3-i if pose=="push" else min(w-2,x+4))
            tip=y+5+(frame if pose=="tap" and i==frame else 0)
            d.line([(x,y),(reach,y+1),(reach+1,tip)],INK,4)
            d.line([(x,y),(reach,y+1),(reach+1,tip-1)],LIGHT,2)
        d.line([(3,7),(8,5),(10,6)],LIGHT,2)
        return im
    im=glove(20,20,"hold",0)
    out["rival/hand/hold/L"]=im
    out["rival/hand/hold/R"]=ImageOps.mirror(im)
    for pose,w,h in (("tap",20,16),("push",26,18)):
        for i in range(3):
            im=glove(w,h,pose,i)
            if pose=="push": im=im.transform(im.size,Image.Transform.AFFINE,(1,0,-i,0,1,0))
            out[f"rival/hand/{pose}/{i+1}"]=im
    out["rival/hand/smoke"]=glove(20,20,"tap",1)
    im=Image.new("RGBA",(30,4))
    d=ImageDraw.Draw(im)
    d.line((0,3,29,1),INK,2)
    d.line((20,1,28,1),LIGHT)
    d.point((29,1),"#ff7a24")
    out["rival/holder"]=im
    return out
