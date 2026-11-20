"""python art/tickets/build.py: the raffle ticket every button is (docs/READABILITY.md §5), as pieces the code
assembles at any width. tickets.png/json is the atlas, review.png shows every ink at two widths.

the ticket pieces are drawn in 5 grey levels, and the code maps each level onto the ink's palette ramp
(src/ui/ticket.ts): 48 = two steps darker (line work), 104 = one darker, 160 = the face, 208 = one lighter,
255 = two lighter (glints). the icons are white masks the code inks in the label color.

  stub   the left end: a notch in the edge, a recessed panel the icon sits on, a column of perforation holes
  small  the same end without the icon panel, for tickets too narrow for an icon
  body   a tile repeated across the middle: the double printed border and a fine engraved guilloche
  end    the right end: the border's corners, a notch, a serial number's dots
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
H = 24
L0, L1, L2, L3, L4 = 48, 104, 160, 208, 255
CLEAR = (0, 0, 0, 0)


def grey(v):
    return (v, v, v, 255)


def blank(w):
    return Image.new("RGBA", (w, H), CLEAR)


def rows(im, x0, x1):
    # the long edges every piece shares: outline, top glint, the face, a shade and the thickness under it
    d = ImageDraw.Draw(im)
    d.rectangle((x0, 0, x1, H - 1), grey(L2))
    d.line((x0, 0, x1, 0), grey(L0))
    d.line((x0, 1, x1, 1), grey(L4))
    d.line((x0, 2, x1, 2), grey(L3))
    d.line((x0, H - 3, x1, H - 3), grey(L1))
    d.line((x0, H - 2, x1, H - 2), grey(L1))
    d.line((x0, H - 1, x1, H - 1), grey(L0))


def border(im, x0, x1):
    # the printed double rule: a dark line with a light one under it, top and bottom
    d = ImageDraw.Draw(im)
    d.line((x0, 4, x1, 4), grey(L1))
    d.line((x0, 5, x1, 5), grey(L3))
    d.line((x0, H - 6, x1, H - 6), grey(L1))
    d.line((x0, H - 5, x1, H - 5), grey(L3))


def notch(im, x):
    # a half-moon bitten out of the short edge, with its rim shaded
    for y in range(H):
        for dx in range(-3, 4):
            r = math.hypot(dx, y - (H / 2 - 0.5))
            if r < 3.2 and 0 <= x + dx < im.width:
                im.putpixel((x + dx, y), CLEAR)
            elif r < 4.2 and 0 <= x + dx < im.width and im.getpixel((x + dx, y))[3]:
                im.putpixel((x + dx, y), grey(L0))


def round_corners(im, left):
    x = 0 if left else im.width - 1
    step = 1 if left else -1
    for y in (0, H - 1):
        im.putpixel((x, y), CLEAR)
        im.putpixel((x + step, y), grey(L0))
    for y in (1, H - 2):
        im.putpixel((x, y), grey(L0))


def edge(im, x):
    ImageDraw.Draw(im).line((x, 1, x, H - 2), grey(L0))


def stub(icon=True):
    w = 22 if icon else 11
    im = blank(w)
    rows(im, 0, w - 1)
    edge(im, 0)
    d = ImageDraw.Draw(im)
    perf = w - 4
    if icon:
        # the recessed panel the icon sits on: a sunken lighter plate with a dark lip on top and left
        d.rectangle((3, 4, perf - 3, H - 6), grey(L3))
        d.line((3, 4, perf - 3, 4), grey(L1))
        d.line((3, 4, 3, H - 6), grey(L1))
        d.line((4, H - 6, perf - 3, H - 6), grey(L4))
        d.line((perf - 3, 5, perf - 3, H - 6), grey(L4))
    # perforation: punched holes down a scored line, each hole lit on its lower lip
    d.line((perf, 2, perf, H - 3), grey(L1))
    for y in range(4, H - 4, 3):
        im.putpixel((perf, y), CLEAR)
        im.putpixel((perf, y + 1), grey(L4))
    # the body's border starts right after the perforation
    d.line((perf + 2, 4, perf + 2, H - 6), grey(L1))
    d.line((perf + 3, 5, perf + 3, H - 6), grey(L3))
    border(im, perf + 2, w - 1)
    notch(im, 0)
    round_corners(im, True)
    return im


def body():
    # 12 px tile: the double rule and an engraved guilloche, two waves crossing, kept faint so labels read
    w = 12
    im = blank(w)
    rows(im, 0, w - 1)
    border(im, 0, w - 1)
    for x in range(w):
        a = 12 + round(2.4 * math.sin(2 * math.pi * x / w))
        b = 12 - round(2.4 * math.sin(2 * math.pi * x / w))
        for y in {a, b}:
            im.putpixel((x, y - 1), grey(L1))
    return im


def end():
    w = 11
    im = blank(w)
    rows(im, 0, w - 1)
    border(im, 0, w - 5)
    d = ImageDraw.Draw(im)
    # the border turns its corner, with a lozenge where the rules meet
    d.line((w - 5, 4, w - 5, H - 6), grey(L1))
    d.line((w - 6, 5, w - 6, H - 6), grey(L3))
    for cy in (4, H - 6):
        for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1)):
            im.putpixel((w - 5 + dx, cy + dy), grey(L0))
        im.putpixel((w - 5, cy), grey(L4))
    edge(im, w - 1)
    notch(im, w - 1)
    round_corners(im, False)
    return im


# 11×11 white masks, # = ink. hand-placed, one idea each
ICONS = {
    # a card fanned off another, a spade pip cut out of the front one
    "play": """
.#########.
.#.......#.
.#...#...#.
.#..###..#.
.#.#####.#.
.#.#####.#.
.#...#...#.
.#..###..#.
.#.......#.
.#########.
...........""",
    # a stack of chips with an arrow up
    "max": """
.....#.....
....###....
...#.#.#...
.....#.....
.#########.
.#.#.#.#.#.
.#########.
.#.#.#.#.#.
.#########.
.#.#.#.#.#.
.#########.""",
    # one chip, its edge spots and the center dot
    "min": """
...#####...
..#.###.#..
.#########.
#.##...##.#
###.....###
###..#..###
###.....###
#.##...##.#
.#########.
..#.###.#..
...#####...""",
    # a flame with a hollow heart
    "forge": """
....#......
....##.....
...###..#..
...####.#..
..#######..
.####.####.
.###...###.
.##.....##.
.###...###.
..###.###..
...#####...""",
    # a card torn in two
    "discard": """
.####.####.
.#..#.#..#.
.#..#.#..#.
.#...#...#.
.#..#.#..#.
.#...#...#.
.#..#.#..#.
.#...#...#.
.#..#.#..#.
.#..#.#..#.
.####.####.""",
    # a card sliding into its sleeve
    "insert": """
...#####...
...#...#...
...#...#...
.#########.
.#.......#.
.#.#####.#.
.#.......#.
.#.#####.#.
.#.......#.
.#########.
...........""",
    # pass: an arrow over a gap
    "skip": """
...........
.......#...
.......##..
.#########.
.##########
.#########.
.......##..
.......#...
...........
.#.#.#.#.#.
...........""",
    # onward: two chevrons
    "continue": """
...........
.##...##...
..##...##..
...##...##.
....##...##
...##...##.
..##...##..
.##...##...
...........
...........
...........""",
    # back: an arrow to the left
    "back": """
...........
...#.......
..##.......
.#########.
##########.
.#########.
..##.......
...#.......
...........
...........
...........""",
}


def icon(art):
    lines = art.strip("\n").splitlines()
    assert len(lines) == 11 and all(len(l) == 11 for l in lines), art
    im = Image.new("RGBA", (11, 11), CLEAR)
    for y, line in enumerate(lines):
        for x, ch in enumerate(line):
            if ch == "#":
                im.putpixel((x, y), (255, 255, 255, 255))
    return im


def parts():
    out = {"ticket/stub": stub(True), "ticket/small": stub(False), "ticket/body": body(), "ticket/end": end()}
    for k, art in ICONS.items():
        out["ticket/icon/" + k] = icon(art)
    return out


# ---------- the review: the same mapping the code does, on a few inks ----------

def palette():
    return [tuple(int(v) for v in line.split()[:3])
            for line in (ROOT.parent / "palette/flambeur.gpl").read_text().splitlines()
            if line.strip() and line.strip()[0].isdigit()]


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


# dark → light, the same lists as src/ui/ticket.ts
RAMPS = [
    ["#0e0b0a", "#0f1d33", "#1a3256", "#28497a", "#3e66a0"],
    ["#2a0910", "#4e1020", "#7a1a2c", "#a82a38", "#d04a4e"],
    ["#5a1206", "#a8260a", "#e8501a", "#ff7a24", "#ffb03a", "#ffe08a", "#fffbe8"],
    ["#0f2a20", "#1e4a24", "#3a8040", "#6fcf6f", "#b8f0a0"],
    ["#2a1440", "#4e2a78", "#7a4ab0", "#b088e0"],
    ["#0f2a20", "#174034", "#1f5a46", "#2d7a5c", "#4a9a74", "#b8f0a0"],
    ["#120e08", "#2a2010", "#3d2a10", "#6b4a1a", "#9c7028", "#c99a3a", "#e8c260", "#fff0b0"],
    ["#1c1513", "#2e2320", "#43342e", "#5c4a36", "#8c7656", "#bfa77e", "#e3d2a8", "#f6ecd2"],
]


def ramp(face):
    for r in RAMPS:
        if face in r:
            i = r.index(face)
            at = lambda k: r[max(0, min(len(r) - 1, i + k))]
            # past the ramp's top the glint is cream and the light step stays the face
            glint = r[i + 2] if i + 2 < len(r) else r[i + 1] if i + 1 < len(r) else "#f6ecd2"
            return {L0: at(-2), L1: at(-1), L2: face, L3: at(1), L4: glint}
    raise ValueError(f"{face} is on no ramp")


def assemble(p, w, small=False):
    left = p["ticket/small" if small else "ticket/stub"]
    im = blank(w)
    im.paste(left, (0, 0))
    x = left.width
    stop = w - p["ticket/end"].width
    while x < stop:
        im.paste(p["ticket/body"].crop((0, 0, min(12, stop - x), H)), (x, 0))
        x += 12
    im.paste(p["ticket/end"], (stop, 0))
    return im


def inked(im, face):
    m = ramp(face)
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (*hexrgb(m[r]), 255)
    return out


def review(p):
    inks = ["#3e66a0", "#a82a38", "#3a8040", "#e8501a", "#7a4ab0", "#2d7a5c", "#c99a3a", "#43342e"]
    icons = ["play", "max", "min", "forge", "discard", "insert", "continue", "skip"]
    sheet = Image.new("RGBA", (300, len(inks) * 30 + 6), (14, 11, 10, 255))
    for i, (face, ic) in enumerate(zip(inks, icons)):
        t = inked(assemble(p, 126), face)
        mask = p["ticket/icon/" + ic]
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            t.paste(Image.new("RGBA", (11, 11), (14, 11, 10, 255)), (4 + dx, 7 + dy), mask)
        t.paste(Image.new("RGBA", (11, 11), (246, 236, 210, 255)), (4, 7), mask)
        sheet.alpha_composite(t, (4, 4 + i * 30))
        sheet.alpha_composite(inked(assemble(p, 96, True), face), (140, 4 + i * 30))
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.Resampling.NEAREST).save(ROOT / "review.png")


def main():
    p = parts()
    pal = set(palette())
    levels = {L0, L1, L2, L3, L4}
    for k, im in p.items():
        for _, (r, g, b, a) in im.getcolors(im.width * im.height):
            if a and (a != 255 or not (r == g == b and r in levels)):
                raise ValueError(f"{k}: a pixel off the 5 grey levels {(r, g, b, a)}")
    for r in RAMPS:
        for c in r:
            if hexrgb(c) not in pal:
                raise ValueError(f"ramp color {c} is off the palette")
    width = 128
    x = y = row = 0
    slices = []
    for k, im in p.items():
        if x + im.width > width:
            x, y, row = 0, y + row + 1, 0
        slices.append({"name": k, "keys": [{"frame": 0, "bounds": {"x": x, "y": y, "w": im.width, "h": im.height}, "pivot": {"x": 0, "y": 0}}]})
        x += im.width + 1
        row = max(row, im.height)
    atlas = Image.new("RGBA", (width, y + row))
    for s in slices:
        b = s["keys"][0]["bounds"]
        atlas.paste(p[s["name"]], (b["x"], b["y"]))
    atlas.save(ROOT / "tickets.png")
    size = {"w": atlas.width, "h": atlas.height}
    (ROOT / "tickets.json").write_text(json.dumps({"meta": {"image": "tickets.png", "size": size, "slices": slices}}, indent=2) + "\n")
    review(p)


if __name__ == "__main__":
    main()
