"""Table scenes for the ten lane payoffs and the common VRAC bin."""
from random import Random

from draw import (ink, soot, wood, tan, buff, cream, white, oak, bronze, brass, gold,
                  light, ox, wine, red, pink, pine, felt, jade, navy, blue, sky, plum,
                  violet, lilac, orange, portrait, moustache, label, card, paste, gleam)


def alcove(im,d,wall,floor):
    w,h=im.size
    d.rounded_rectangle((2,3,w-3,h-4),9,wall,ink,2)
    rng=Random(w*31+h)
    shadow = {oak:soot,soot:ink,ox:wine,plum:violet,pine:felt,cream:buff,ink:soot}[wall]
    for _ in range(w*h//65):
        x,y=rng.randrange(8,w-9),rng.randrange(9,h-20)
        d.line((x,y,x+rng.randrange(1,4),y),shadow)
    d.arc((6,7,w-7,h-14),180,360,wood,2)
    d.arc((7,8,w-8,h-15),190,263,tan)
    d.rectangle((3,h-18,w-4,h-6),floor,ink)
    d.line((6,h-16,w-7,h-16),tan)
    for _ in range(w//2):
        x,y=rng.randrange(5,w-9),rng.randrange(h-14,h-7)
        d.line((x,y,x+rng.randrange(1,5),y),wood)
    d.line((5,h-5,w-6,h-5),bronze)


def twins(im,d,f):
    alcove(im,d,oak,wood)
    d.ellipse((9,7,73,72),brass,ink,2)
    d.ellipse((13,11,69,68),blue,light)
    for x in (22,60):
        d.ellipse((x-5,20,x+4,31),buff,ink)
        d.polygon([(x-4,30),(x+4,30),(x+8,51),(x-7,51)],navy,ink)
        d.line((x-3,25,x+1,25),tan if f==3 else ink)
    d.rounded_rectangle((9,79,74,89),4,brass,ink,2)
    for x in (25,54):
        for dx in (-5,4):
            d.rectangle((x+dx,65,x+dx+4,79),cream,ink)
            d.ellipse((x+dx-2,76,x+dx+5,81),navy,ink)
        d.polygon([(x-7,43),(x+6,43),(x+12,65),(x-10,67)],navy,ink)
        d.polygon([(x-7,45),(x+7,45),(x,54)],white,blue)
        d.ellipse((x-7,29,x+7,45),cream,wood)
        d.ellipse((x-9,26,x+7,33),white,blue)
        if f != 2: d.point([(x-3,36),(x+3,36)],ink)
        paste(im,card("ace","hearts"),(x+6,40),(10,14),-8)
    moustache(d,25,40,wood)


def wine_bottle(im,d,f):
    alcove(im,d,soot,oak)
    for y in (27,42,57):
        for x in (12,22,55,65):
            d.ellipse((x-3,y-3,x+3,y+3),wine,ink)
    d.rounded_rectangle((22,34,53,88),8,pine,ink,2)
    d.rectangle((32,13,43,39),pine,ink)
    d.rectangle((31,12,44,21),wine,ink)
    d.line((26,43,26,74),jade,2)
    d.rectangle((25,49,50,72),(lilac,gold,sky,lilac)[f],ink)
    for i in range(5):
        x=28+i*4
        d.polygon([(x,54),(x+2,55),(x+3,54),(x+2,59)],red)
    label(im,"TABAC",38,62,ink)
    d.arc((12,20,63,74),8,174,buff,2)
    d.ellipse((42,62,68,80),tan,ink,2)
    d.ellipse((45,64,65,75),wine,cream,2)
    d.arc((48+f,66,62,72),30,150,pink)


def pan(im,d,f):
    alcove(im,d,ox,cream)
    d.ellipse((27,57,66,73),brass,ink,2)
    d.rectangle((39,48,54,62),bronze,ink)
    d.ellipse((19,35,69,58),bronze,ink,2)
    d.line((60,44,87,29),ink,6)
    d.line((60,43,86,29),brass,3)
    d.ellipse((18,32,69,48),wine,brass,2)
    d.arc((20,37,66,56),10,157,brass,2)
    for x in (30,43,57):
        h=(x+f*2)%9
        d.polygon([(x-6,39),(x-5,27),(x-2,30),(x+2,12+h),(x+5,24),(x+4,38)],sky,blue)
        d.polygon([(x-2,38),(x+1,27+h//2),(x+3,38)],"#b8d0e8")
        d.ellipse((x-6,39,x+1,45),red,ox)
    d.line((8,70,22,72),white,2)
    d.point((8,70),orange)


def jewels(im,d,f):
    alcove(im,d,plum,wood)
    for x in (13,21,62,71):
        d.line((x,66,x-2,88),brass,2)
    d.polygon([(8,52),(20,34),(75,32),(76,66),(63,75),(8,72)],bronze,ink,2)
    d.polygon([(11,51),(21,36),(72,35),(62,51)],navy,cream)
    d.rectangle((11,52,61,68),plum,brass)
    d.line((14,44,30,37),sky)
    d.line((16,46,32,39),blue)
    for i,c in enumerate((gold,lilac,orange)):
        x=21+16*i
        d.polygon([(x-5,56),(x-2,52),(x+3,52),(x+6,56),(x,64)],c,ink)
        d.line((x-3,55,x+3,55),white)
    moustache(d,41,44,blue)
    gleam(d,21+16*(f%3),52)


def purse(im,d,f):
    alcove(im,d,pine,tan)
    d.ellipse((36,42,66,56),buff,ink)
    d.rounded_rectangle((6,17,49,51),10,wood,ink,2)
    d.arc((9,19,45,49),15,160,tan,2)
    for x,y in ((11,32),(14,36),(19,40),(25,42),(32,42),(39,38)):
        d.line((x,y,x+2,y+1),buff)
    d.arc((10,20,45,47),10,168,bronze,2)
    d.ellipse((10,16,46,29),ink,brass,3)
    for x in (23,31): d.ellipse((x,12,x+6,18),gold,bronze)
    for x,y in ((43,39),(51,44),(30,52),(52,51)):
        d.ellipse((x-6,y-2,x+6,y+3),brass,bronze)
        d.line((x-3,y-1,x+2,y-1),light)
    d.ellipse((39,47,47,53+f),gold,bronze)
    moustache(d,43,50,bronze)


def cart(im,d,f):
    alcove(im,d,soot,tan)
    label(im,"FERRAILLE",47,12,buff)
    for x in (24,67):
        d.ellipse((x-9,56,x+9,75),ink,wood,2)
        d.ellipse((x-3,62,x+3,69),brass)
    for x,y in ((20,41),(45,40),(32+int(f==2),29)):
        d.polygon([(x,y),(x+17,y-4),(x+26,y+6),(x+7,y+12)],tan,ink)
        d.line((x+3,y,x+17,y-3),buff)
    d.polygon([(9,43),(75,42),(67,61),(22,64)],wood,ink,2)
    d.line((14,48,70,47),tan,2)
    for x in (23,42,58):
        d.line((x,47,x+2,60),ink)
        d.point((x+1,50),buff)
    d.arc((45,24,61,41),0,244,brass,3)
    d.ellipse((21,37,28,41),gold,bronze)
    d.line((66,52,90,34),bronze,4)
    d.polygon([(77,39),(85,36),(88,50),(80,52)],wine,ink)


def cash(im,d,f):
    alcove(im,d,pine,felt)
    for x in (12,55): d.ellipse((x-5,76,x+6,81),wine,cream)
    d.rounded_rectangle((18,30,55,78),7,jade,ink,2)
    d.ellipse((18,25,55,40),buff,ink,2)
    d.ellipse((23,28,51,37),pine,cream,2)
    portrait(im,27,42,17,18)
    d.rounded_rectangle((17,59,56,68),2,gold,bronze,2)
    d.line((21,61,50,61),light)
    for x in (29,39,46):
        h=(x+3*f)%9
        d.polygon([(x-5,32),(x-7,20),(x-2,23),(x+1,8+h),(x+6,25),(x+3,33)],orange,red)
        d.line((x,29,x+1,22),gold,2)
    d.point((41+f,10-f),buff)


def encore(im,d,f):
    alcove(im,d,ink,wood)
    d.polygon([(44,15),(56,15),(76,78),(24,78)],bronze)
    for x,side in ((5,1),(90,-1)):
        d.polygon([(x,7),(x+29*side,7),(x+15*side,46),(x+20*side,79),(x,81)],wine,ink)
        for k in (4,10,17): d.line((x+k*side,11,x+7*side,46),red,2)
        d.line((x+3*side,46,x+15*side,43),gold,2)
    paste(im,card("ace","hearts"),(35,35),(25,35),-5)
    for y in (55,60): d.line([(40,y),(46,y-3),(44,y+1),(52,y-1)],brass)
    label(im,"BIS !",47,10,light,"didone")
    y=(52,64,75,75)[f]
    d.line((55,y+4,65,y),jade)
    d.ellipse((63,y-3,68,y+1),pink,wine)
    moustache(d,48,84,ink)


def metro(im,d,f):
    alcove(im,d,cream,buff)
    for row in range(4):
        y=9+row*11
        d.line((5,y,82,y),buff)
        for x in range(12+(row%2)*10,82,21): d.line((x,y,x,y+10),buff)
    d.rounded_rectangle((6,18,81,53),4,pine,ink,2)
    d.rounded_rectangle((8,20,79,51),3,outline=brass)
    d.ellipse((10,22,22,34),gold,bronze)
    label(im,"M",16,24,ink)
    d.line((20,38,69,38),cream,2)
    for i,ch in enumerate(("9","10","J","Q","K")):
        x=20+12*i
        d.ellipse((x-2,35,x+3,40),gold if i in ((0,), (1,), (2,), (3,4))[f] else white,ink)
        label(im,ch,x,42,cream)
    moustache(d,71,58,wood)


def auction(im,d,f):
    alcove(im,d,ox,wood)
    portrait(im,49,17,18,23)
    d.line((60,20,64,36),tan,2)
    d.ellipse((52,8,68,22),cream,bronze)
    label(im,"10",60,11,ink)
    d.rectangle((6,70,73,86),wood,ink)
    paste(im,card("king","spades"),(48,43),(19,27))
    d.rectangle((47,39,67,72),outline=buff,width=2)
    d.rectangle((49,40,65,44),gold)
    d.ellipse((10,64,42,73),bronze,ink,2)
    y=(40,47,57,40)[f]
    d.line((24,y+4,54,y-15),ink,6)
    d.line((24,y+3,54,y-15),tan,3)
    d.polygon([(12,y-4),(23,y-10),(36,y+8),(24,y+15)],wood,ink,2)
    d.line((18,y-5,30,y+11),brass,3)


def bin_art(im,d,f):
    for x,y in ((13,9),(26,6)):
        d.polygon([(x,y),(x+12,y-4),(x+17,y+9),(x+5,y+16)],tan,ink)
    d.polygon([(7,16),(48,15),(44,45),(38,49),(14,47)],"#818193",ink,2)
    for x in (13,20,35,42): d.line((x,19,x-1,44),"#5c5c6e",2)
    d.rounded_rectangle((5,13,50,18),2,"#c2c2d0",ink)
    d.rectangle((13,24,43,36),cream,wood)
    label(im,"VRAC",28,26,ink)
    d.polygon([(8,10),(17,5),(22,13),(14,15)],cream,ink)
    d.line((12,10,16,8),ink)
    d.point((42+f,8-f),buff)


OBJECTS = [
    ("les_jumeaux",84,96,twins),("sommelier",76,100,wine_bottle),
    ("flamme_bleue",92,82,pan),("vitrine",84,100,jewels),
    ("petite_monnaie",72,66,purse),("ferrailleur",96,86,cart),
    ("le_flambeur",72,96,cash),("bis",96,96,encore),
    ("ligne_droite",88,70,metro),("commissaire",80,96,auction),("bulk_bin",56,52,bin_art),
]
