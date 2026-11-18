"""A velvet-lined tray. Lay an 88x112 starter box at (16, 13)."""
from pathlib import Path

from PIL import Image, ImageDraw


def draw_tray():
    image = Image.new("RGBA", (120, 144))
    d = ImageDraw.Draw(image)
    ink, wood, grain = "#0e0b0a", "#2e2320", "#43342e"
    tarnish, bronze, brass, gold = "#3d2a10", "#6b4a1a", "#9c7028", "#e8c260"
    well, velvet, nap, edge = "#2a0910", "#4e1020", "#7a1a2c", "#a82a38"

    # walnut front apron and polished top rim
    d.polygon([(8, 1), (111, 1), (114, 4), (119, 129), (118, 139),
               (114, 142), (5, 142), (1, 139), (0, 129), (5, 4)], fill=ink)
    d.polygon([(2, 127), (117, 127), (116, 138), (113, 140),
               (6, 140), (3, 138)], fill=wood)
    d.line([(4, 137), (7, 139), (112, 139), (115, 137)], fill=grain)
    for x, y, width in [(11, 135, 23), (28, 136, 11), (81, 134, 22), (70, 137, 18)]:
        d.line([(x, y), (x + width, y)], fill=grain)
    d.polygon([(8, 2), (111, 2), (113, 4), (118, 127), (115, 131),
               (4, 131), (1, 128), (6, 5)], fill=grain)
    d.line([(2, 128), (6, 130), (114, 130), (117, 127)], fill=bronze)
    d.line([(5, 129), (114, 129)], fill=brass)
    d.line([(2, 126), (7, 5), (9, 3), (110, 3)], fill=bronze)
    d.line([(8, 5), (110, 5), (112, 7)], fill=tarnish)

    # the inner wall falls into shadow behind the padded lining
    d.polygon([(11, 6), (109, 6), (111, 9), (115, 125), (112, 127),
               (7, 127), (4, 124), (9, 9)], fill=ink)
    d.polygon([(12, 7), (108, 7), (110, 9), (114, 124), (112, 126),
               (8, 126), (5, 123), (10, 10)], fill=well)
    d.polygon([(14, 11), (105, 11), (108, 14), (112, 121), (109, 124),
               (10, 124), (7, 120), (11, 15)], fill=velvet)

    # small gathers in the pile follow each corner of the fitted lining
    for points in [
        [(11, 14), (14, 12), (24, 13), (17, 14), (15, 17)],
        [(15, 16), (21, 16), (30, 20), (21, 18)],
        [(107, 14), (103, 12), (94, 13), (100, 14), (104, 17)],
        [(9, 118), (10, 112), (12, 105), (12, 114)],
        [(10, 122), (12, 117), (22, 110), (16, 117)],
        [(14, 123), (19, 120), (31, 117), (23, 121)],
        [(110, 121), (103, 118), (95, 111), (101, 114)],
        [(109, 122), (100, 121), (90, 116), (99, 119)],
        [(108, 116), (105, 112), (105, 105), (107, 110)],
    ]:
        d.polygon(points, fill=nap)
    for points in [
        [(12, 14), (15, 13), (19, 13)],
        [(10, 121), (12, 118), (15, 116)],
        [(17, 122), (22, 120)],
        [(103, 117), (107, 120)],
    ]:
        d.line(points, fill=edge)

    # two brass corner shoes and a small shell escutcheon on the front lip
    for right in (False, True):
        def points(coords):
            return [(119 - x if right else x, y) for x, y in coords]

        d.polygon(points([(2, 126), (3, 124), (5, 127), (11, 130),
                          (10, 133), (5, 133), (2, 130)]), fill=tarnish)
        d.line(points([(3, 125), (5, 128), (10, 130)]), fill=brass)
        d.point(points([(4, 127), (8, 130)]), fill=gold)
    d.polygon([(52, 132), (55, 131), (64, 131), (67, 132), (65, 136),
               (62, 137), (60, 139), (57, 137), (54, 136)], fill=ink)
    d.polygon([(53, 132), (66, 132), (64, 135), (60, 138), (56, 135)], fill=bronze)
    for dx in (-5, -2, 2, 5):
        d.line([(60 + dx, 132), (60 + dx // 2, 135)], fill=brass)
    d.line([(56, 132), (60, 132)], fill=gold)
    return image


if __name__ == "__main__":
    draw_tray().save(Path(__file__).with_suffix(".png"))
