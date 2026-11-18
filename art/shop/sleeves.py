"""Penny sleeves, rigid toploader and matching nameplate tabs."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageColor, ImageOps

ART = Path(__file__).resolve().parents[1]
NN = Image.Resampling.NEAREST
INK, PAPER, IVORY = "#1c1513", "#f6ecd2", "#fffbe8"
BRASS, GOLD, BROWN = "#c99a3a", "#e8c260", "#6b4a1a"
TINTS = {
    "big_hands": ("#1a3256", "#28497a", "#3e66a0"),
    "restock": ("#174034", "#2d7a5c", "#4a9a74"),
    "hot_market": ("#a8260a", "#e8501a", "#ff7a24"),
    "riser": ("#2a1440", "#4e2a78", "#7a4ab0"),
    "deep_pockets": ("#1e4a24", "#3a8040", "#6fcf6f"),
    "bulk_deal": ("#43342e", "#5c4a36", "#8c7656"),
    "archival": ("#8c7656", "#e3d2a8", IVORY),
}


def blank(w, h):
    return Image.new("RGBA", (w, h))


def card_layers():
    meta = json.loads((ART / "cards/cards.json").read_text())
    atlas = Image.open(ART / "cards/cards.png").convert("RGBA")
    def crop(name):
        entry = next(s for s in meta["meta"]["slices"] if s["name"] == name)
        b = entry["keys"][0]["bounds"]
        return atlas.crop((b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]))
    back = blank(64, 88)
    tile = crop("back/tile/classic")
    for y in range(5, 83, tile.height):
        for x in range(5, 59, tile.width):
            back.paste(tile, (x, y))
    frame = crop("back/frame")
    back.alpha_composite(frame)
    back.putalpha(crop("base/bulk").getchannel("A"))
    return back, crop("base/bulk")


def emblem(key, bulk):
    im = blank(16, 16)
    d = ImageDraw.Draw(im)
    def shape(points, color):
        d.polygon(points, fill=color, outline=INK)
    if key == "big_hands":
        for pts in [[(0,4),(5,2),(10,11),(5,13)], [(5,1),(10,1),(11,11),(6,11)], [(11,2),(15,4),(12,13),(7,11)]]:
            shape(pts, PAPER)
        for pos in [(3,5),(7,3),(12,5)]:
            d.point(pos, fill="#a82a38")
        shape([(3,9),(5,8),(7,10),(12,9),(11,13),(8,15),(5,15)], "#e3d2a8")
    elif key == "restock":
        d.arc((2,0,13,10), 185, 342, fill=INK, width=3)
        d.arc((3,1,12,9), 190, 330, fill=PAPER)
        shape([(9,4),(15,2),(13,7)], PAPER)
        shape([(2,8),(8,7),(14,8),(13,13),(8,15),(3,13)], BROWN)
        shape([(0,8),(4,6),(8,8),(5,11)], BRASS)
        shape([(8,8),(12,6),(15,8),(11,11)], GOLD)
    elif key == "hot_market":
        shape([(2,10),(2,4),(5,6),(7,0),(9,5),(12,1),(13,7),(15,9),(10,14),(5,14)], "#ff7a24")
        shape([(8,4),(10,8),(15,8),(11,11),(12,15),(8,13),(4,15),(5,11),(1,8),(6,8)], PAPER)
    elif key == "riser":
        d.arc((4,0,15,7),0,180,fill=BROWN,width=2)
        shape([(6,0),(13,0),(12,5),(10,6),(10,8),(8,8),(8,6),(6,4)], GOLD)
        shape([(0,12),(4,12),(4,10),(8,10),(8,8),(15,8),(15,15),(0,15)], BRASS)
        for x,y in [(1,13),(5,11),(9,9)]:
            d.line((x,y,x+2,y),fill=GOLD)
    elif key == "deep_pockets":
        d.ellipse((5,0,11,6),fill=PAPER,outline=BROWN)
        d.line((8,1,8,4),fill=BROWN)
        shape([(3,5),(12,5),(15,10),(14,14),(10,15),(3,14),(0,12),(1,9)], "#8c7656")
        d.line([(2,11),(4,13),(11,13),(13,11)],fill="#5c4a36")
        d.line((3,6,12,6),fill=GOLD)
        for x in [3,11]:
            d.rectangle((x,3,x+1,4),fill=BRASS)
    elif key == "bulk_deal":
        im.alpha_composite(bulk.resize((10,14),NN),(1,0))
        shape([(6,10),(12,7),(15,9),(15,14),(9,15)], "#d04a4e")
        d.line([(10,11),(12,10),(12,13)],fill=PAPER)
    else:
        shape([(1,2),(8,0),(14,2),(14,8),(12,12),(8,15),(4,12),(1,8)], BRASS)
        d.line([(3,3),(8,2),(12,3)],fill=GOLD)
        d.line([(4,7),(7,10),(12,5)],fill=INK,width=2)
    return im


def parts(text):
    back, bulk = card_layers()
    palette = [tuple(map(int,line.split()[:3])) for line in
               (ART / "palette/flambeur.gpl").read_text().splitlines() if line.strip() and line.strip()[0].isdigit()]
    # Bulk stock includes custom stone shades. Match the printed miniature to the shop inks.
    stone = {p:min(palette, key=lambda c:sum((a-b)**2 for a,b in zip(c,p))) + (p[3],)
             for _,p in bulk.getcolors(65536)}
    bulk.putdata([stone[p] for p in bulk.getdata()])
    stand = blank(72,24)
    d = ImageDraw.Draw(stand)
    d.polygon([(2,17),(9,3),(61,3),(69,17),(68,22),(3,22)],fill="#4e1020",outline=INK)
    d.polygon([(5,16),(11,5),(60,5),(66,16)],fill="#7a1a2c")
    d.line((12,7,59,7),fill="#2a0910",width=2)
    d.rectangle((8,12,63,20),fill=BRASS,outline=BROWN)
    text(stand,"SPÉCIAL TABLE",36,13,"tiny",INK,"center")
    out = {"shop/sleeve/stand":stand}
    for key,(edge,body,light) in TINTS.items():
        icon = emblem(key,bulk)
        rigid = key == "archival"
        w = 60 if rigid else 64
        im = blank(w,88)
        d = ImageDraw.Draw(im)
        left = 0 if rigid else 4
        d.rounded_rectangle((left,0 if rigid else 17,w-left-1,87),radius=1 if rigid else 3,fill=body,outline=edge,width=2)
        card = back.resize((w-2*left-4,78 if rigid else 62),NN)
        if not rigid:
            # The back is burgundy and gold. Print its shadows, field and foil
            # through separate tint steps so the pattern survives at shelf scale.
            ramp = [ImageColor.getrgb(c) for c in (edge, body, light, "#e3d2a8")]
            def dyed(rgb):
                luma = (3*rgb[0] + 6*rgb[1] + rgb[2]) / 10
                return ramp[sum(luma >= threshold for threshold in (35, 79, 185))]
            lut = {p:dyed(p[:3])+(p[3],) for _,p in card.getcolors()}
            card.putdata([lut[p] for p in card.getdata()])
        im.alpha_composite(card,(left+2,5 if rigid else 21))
        y = 14 if rigid else 39
        d.line((left+3,y,left+15,y+12),fill=light,width=2)
        d.line((left+6,y+2,left+9,y+5),fill=IVORY)
        if rigid:
            d.line((1,1,58,1),fill=IVORY,width=2)
            d.rectangle((6,58,53,69),fill=BRASS,outline=BROWN)
            im.alpha_composite(icon,(6,55))
            text(im,"ARCHIVAL",37,61,"tiny",INK,"center")
        else:
            d.rectangle((0,6,63,27),fill="#bfa77e",outline=edge)
            d.rectangle((1,7,62,25),fill=PAPER)
            for x in [4,58]:
                d.line((x,9,x+1,9),fill="#8c7656")
            im.alpha_composite(icon.resize((32,32),NN),(16,0))
            d.rectangle((15,30,48,38),fill=edge)
            text(im,"POCHETTE",32,31,"tiny",PAPER,"center")
            d.line((6,84,57,84),fill=light)
        tab = blank(14,18)
        t = ImageDraw.Draw(tab)
        t.rounded_rectangle((0,0,13,17),radius=2,fill=body,outline=edge)
        t.line((2,1,11,1),fill=light)
        tab.alpha_composite(icon.resize((12,12),NN),(1,1))
        out.update({f"shop/sleeve/{key}":im,f"sleeve/tab/{key}":tab,f"sleeve/emblem/{key}":icon})
    allowed = set(palette)
    for name,im in out.items():
        assert all(pixel[:3] in allowed for _,pixel in im.getcolors() if pixel[3]), (name, [p for _,p in im.getcolors() if p[3] and p[:3] not in allowed])
    return out


def shelf(parts,key):
    im = blank(72,104)
    im.alpha_composite(parts["shop/sleeve/stand"],(0,80))
    item = parts["shop/sleeve/"+key]
    im.alpha_composite(item,((72-item.width)//2,0 if key=="archival" else 2))
    return im


def preview(parts,text):
    row = Image.new("RGB",(7*80,106),"#2e2320")
    for i,key in enumerate(TINTS):
        product = shelf(parts,key)
        row.paste(product,(i*80+4,0),product)
    proof = Image.new("RGB",(row.width,250),"#2e2320")
    proof.paste(row)
    proof.paste(ImageOps.grayscale(row),(0,106))
    for i,key in enumerate(TINTS):
        for prefix,x,scale in [("emblem",5,2),("tab",43,1),("tab",58,1)]:
            im = parts[f"sleeve/{prefix}/{key}"]
            if x==58:
                im = im.resize((21,27),NN)
            else:
                im = im.resize((im.width*scale,im.height*scale),NN)
            proof.paste(im,(i*80+x,215),im)
    return proof.resize((proof.width*2,proof.height*2),NN)
