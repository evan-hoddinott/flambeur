"""Le Patron in the street light and his counter props."""
from PIL import Image, ImageDraw

INK, DARK, SHADE = "#100f12", "#29232a", "#51404a"
BONE, CREAM, SUN = "#bfa77e", "#e3d2a8", "#fff0b0"


def parts(text):
    body = Image.new("RGBA",(110,190))
    d = ImageDraw.Draw(body)
    def shape(points, color):
        d.polygon(points,color,INK)
    shape([(20,64),(38,51),(48,44),(68,43),(87,51),(97,66),(108,116),(103,173),(90,189),(11,189),(2,159),(4,103)],BONE)
    shape([(20,64),(39,56),(54,80),(65,112),(69,180),(15,184),(10,139)],CREAM)
    shape([(67,52),(85,54),(94,73),(96,117),(84,157),(84,183),(71,181),(63,103)],"#c8b89b")
    shape([(35,58),(47,45),(70,45),(80,54),(63,109)],DARK)
    shape([(43,55),(57,61),(70,53),(64,82)],CREAM)
    shape([(47,57),(58,60),(68,56),(68,65),(58,62),(49,66)],INK)
    shape([(37,53),(46,48),(63,100),(46,81),(39,70),(44,67),(35,66)],SUN)
    shape([(70,47),(80,52),(85,64),(75,64),(79,68),(63,101)],CREAM)
    shape([(16,77),(23,106),(20,140),(10,159),(3,154),(6,110)],BONE)
    shape([(90,78),(100,89),(107,121),(99,154),(90,151),(85,129)],BONE)
    d.line([(77,91),(89,88)],SHADE,2)
    for x,y in ((78,73),(82,71),(85,74),(80,76)):
        d.ellipse((x-3,y-3,x+2,y+2),"#a82a38","#7a1a2c")
    for y in (114,139,162):
        d.ellipse((65,y,68,y+3),DARK,INK)
    shape([(37,23),(73,21),(74,36),(69,45),(59,51),(44,46)],INK)
    d.line([(70,33),(74,35),(71,37)],SHADE)
    d.point((66,39),SUN)
    shape([(21,22),(36,17),(39,6),(44,2),(54,5),(66,2),(72,6),(76,17),(88,21),(86,24),(60,27),(28,27)],DARK)
    d.line([(39,15),(52,17),(75,14)],SHADE,2)
    d.line([(22,22),(39,20),(73,18),(86,20)],BONE)
    d.line((68,40,81,37),"#6b4a1a",3)
    out = {"patron/body":body}
    for i,color in enumerate(("#a8260a","#e8501a","#ffb03a")):
        ember = Image.new("RGBA",(4,4))
        e = ImageDraw.Draw(ember)
        e.line((1,0,2,2),color,2)
        e.point((2,1),SUN)
        out[f"patron/cigar/{i}"] = ember
    hand = Image.new("RGBA",(24,18))
    d = ImageDraw.Draw(hand)
    shape([(0,3),(5,0),(11,5),(17,5),(23,11),(22,13),(15,10),(19,14),(17,16),(12,13),(13,16),(10,17),(4,12),(0,10)],"#ac7652")
    d.line((5,3,11,8),BONE,2)
    d.rectangle((10,6,14,10),"#c99a3a",INK)
    d.point((12,7),SUN)
    out["patron/hand"] = hand
    ledger = Image.new("RGBA",(70,44))
    d = ImageDraw.Draw(ledger)
    d.rounded_rectangle((0,1,69,43),3,DARK,INK)
    for x,mirror in ((3,False),(66,True)):
        step = -1 if mirror else 1
        def page(u,v): return x+step*u,v
        d.polygon([page(0,3),page(21,2),page(31,5),page(31,39),page(23,36),page(0,38)],CREAM,BONE)
        for y in range(10,35,5):
            d.line([page(3,y),page(27,y)],BONE)
        d.line([page(22,7),page(22,34)],"#b07a3a")
    d.line((34,4,34,38),SHADE)
    out["patron/ledger"] = ledger
    folder = Image.new("RGBA",(150,110))
    d = ImageDraw.Draw(folder)
    shape([(0,4),(5,0),(46,0),(52,6),(146,6),(149,9),(149,107),(146,109),(0,109)],"#bf995c")
    d.rectangle((4,10,145,103),BONE,outline="#8c7656")
    d.rectangle((7,9,143,99),CREAM)
    for y in range(42,90,8):
        d.line((74,y,135-(y%5),y),BONE)
    text(folder,"CONFIDENTIEL",107,22,"sans","#a82a38","center")
    d.rectangle((70,20,143,34),outline="#a82a38")
    d.rounded_rectangle((12,3,18,22),3,outline=SHADE,width=2)
    clip = folder.crop((11,2,20,24))
    stamp = folder.crop((69,19,145,36))
    out["shop/dossier/clip"] = clip
    out["shop/dossier/stamp"] = stamp
    out["shop/dossier"] = folder
    for frame in range(4):
        roll = Image.new("RGBA",(40,52))
        d = ImageDraw.Draw(roll)
        d.rounded_rectangle((1,45,38,50),2,"#9c7028",INK)
        d.rectangle((6,16,9,46),SUN,INK)
        d.rectangle((30,14,33,46),BONE,INK)
        d.rounded_rectangle((5,3,33,26),7,"#7a1a2c",INK)
        d.line((10,6,28,6),"#d04a4e",2)
        d.ellipse((2,3,15,26),CREAM,INK)
        d.ellipse((5,7,13,22),BONE,"#9c7028")
        d.ellipse((7,11,11,18),DARK,INK)
        end = 38 - frame*3
        d.polygon([(14,15),(32,13),(35,end),(16,end+2)],CREAM,INK)
        d.polygon([(16,19),(31,17),(33,end-2),(18,end)],"#7a1a2c")
        text(roll,"F",24,18,"sans",SUN,"center")
        for x in range(17,34,3):
            d.point((x,end),INK)
        out["shop/scratch/roll"+(f"/{frame}" if frame else "")] = roll
    return out
