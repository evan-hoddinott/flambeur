"""Rebuild fonts.png, fonts.json, review.png and the webfonts (*.woff2, for DOM text) from the glyph grids with python build.py."""
import json
import random
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
FONTS = ["sans", "tiny", "didone", "chalk"]
ATLAS_W = 512

# accented letters are built from a base glyph and a mark, so each font only draws the marks
COMPOSE = {
    "é": "e acute", "è": "e grave", "ê": "e circumflex", "ë": "e diaeresis",
    "à": "a grave", "â": "a circumflex", "ä": "a diaeresis",
    "î": "ı circumflex", "ï": "ı diaeresis", "ô": "o circumflex", "ö": "o diaeresis",
    "û": "u circumflex", "ù": "u grave", "ü": "u diaeresis", "ç": "c cedilla", "ÿ": "y diaeresis",
    "É": "E acute", "È": "E grave", "Ê": "E circumflex", "Ë": "E diaeresis",
    "À": "A grave", "Â": "A circumflex", "Î": "I circumflex", "Ï": "I diaeresis",
    "Ô": "O circumflex", "Û": "U circumflex", "Ù": "U grave", "Ü": "U diaeresis", "Ç": "C cedilla",
}


def parse(path):
    """Return (settings, glyphs, marks). A glyph is (rows, top): rows of '#'/'.', top = line row of its first row."""
    settings, glyphs, marks = {}, {}, {}
    blocks = []
    current = None
    for raw in path.read_text().splitlines():
        line = raw.rstrip()
        if line.startswith("#") and not current:
            continue
        if not line:
            current = None
            continue
        if line.startswith(": "):
            current = ("glyph", line[2:], [])
            blocks.append(current)
        elif line.startswith("mark "):
            current = ("mark", line[5:], [])
            blocks.append(current)
        elif current:
            current[2].append(line)
        else:
            key, value = line.split(None, 1)
            settings[key] = value == "true" if value in ("true", "false") else int(value)
    ascent, cap = settings["ascent"], settings.get("cap", 0)
    for kind, name, rows in blocks:
        if kind == "mark":
            marks[name] = rows
            continue
        if len(name) != 1:
            raise ValueError(f"{path.name}: glyph name {name!r} must be one character")
        base, top_row = None, None
        clean = []
        for i, row in enumerate(rows):
            if row.endswith("<"):
                base, row = i, row[:-1]
            elif row.endswith("^"):
                top_row, row = i, row[:-1]
            if set(row) - set("#."):
                raise ValueError(f"{path.name}: bad row {row!r} in {name!r}")
            clean.append(row)
        width = max(len(r) for r in clean)
        clean = [r.ljust(width, ".") for r in clean]
        if top_row is not None:
            top = ascent - cap - top_row
        else:
            top = ascent - 1 - (len(clean) - 1 if base is None else base)
        glyphs[name] = (clean, top)
    return settings, glyphs, marks


def pixels(rows, top, left=0):
    return {(left + x, top + y) for y, row in enumerate(rows) for x, c in enumerate(row) if c == "#"}


def compose(glyphs, marks, char, recipe):
    base_name, mark_name = recipe.split()
    if base_name not in glyphs or mark_name not in marks:
        return None
    rows, top = glyphs[base_name]
    mark = marks[mark_name]
    width = len(rows[0])
    mark_w = max(len(r) for r in mark)
    dx = (width - mark_w + 1) // 2
    ink = pixels(rows, top)
    if mark_name == "cedilla":
        mark_top = max(y for _, y in ink) + 1
    else:
        gap = 1 if char.islower() else 0
        mark_top = min(y for _, y in ink) - gap - len(mark)
    ink |= pixels(mark, mark_top, dx)
    return ink, width


def roughen(char, ink):
    """Chalk: some pixels go faint, a little dust lands next to the strokes. Seeded per glyph."""
    rng = random.Random(f"chalk:{ord(char)}")
    alpha = {}
    for p in sorted(ink):
        alpha[p] = 140 if rng.random() < 0.25 else 255
    for (x, y) in sorted(ink):
        if rng.random() < 0.12:
            q = (x + rng.choice((-1, 1)), y + rng.choice((-1, 0, 1)))
            if q not in alpha:
                alpha[q] = 70
    return alpha


def build():
    atlas = Image.new("RGBA", (ATLAS_W, 1024))
    data = {}
    cx = cy = row_h = 0
    for name in FONTS:
        settings, glyphs, marks = parse(ROOT / f"{name}.txt")
        entries = {}
        items = [(c, pixels(rows, top), len(rows[0])) for c, (rows, top) in glyphs.items()]
        for char, recipe in COMPOSE.items():
            if settings.get("caps") and char.islower():
                continue
            made = compose(glyphs, marks, char, recipe)
            if made:
                items.append((char, *made))
        for char, ink, width in items:
            alpha = roughen(char, ink) if settings.get("chalk") else {p: 255 for p in ink}
            xs = [x for x, _ in alpha]
            ys = [y for _, y in alpha]
            left, top = min(min(xs), 0), min(ys)
            w = max(max(xs) + 1, width) - left
            h = max(ys) - top + 1
            if cx + w > ATLAS_W:
                cx, cy, row_h = 0, cy + row_h + 1, 0
            for (x, y), a in alpha.items():
                atlas.putpixel((cx + x - left, cy + y - top), (255, 255, 255, a))
            # x, y, w, h in the atlas; top = line row of the cell's first row; left = cell x offset; advance
            entries[char] = [cx, cy, w, h, top, left, width + settings["spacing"]]
            cx += w + 1
            row_h = max(row_h, h)
        cx, cy, row_h = 0, cy + row_h + 2, 0
        data[name] = {
            "ascent": settings["ascent"], "descent": settings["descent"],
            "line": settings["ascent"] + settings["descent"], "cap": settings["cap"],
            "space": settings["space"], "caps": bool(settings.get("caps")), "glyphs": entries,
        }
    atlas = atlas.crop((0, 0, ATLAS_W, cy))
    atlas.save(ROOT / "fonts.png")
    (ROOT / "fonts.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    return atlas, data


def draw(canvas, atlas, font, text, x, y, color):
    if font["caps"]:
        text = text.upper()
    for ch in text:
        if ch == " ":
            x += font["space"]
            continue
        g = font["glyphs"].get(ch) or font["glyphs"]["?"]
        gx, gy, w, h, top, left, adv = g
        cell = atlas.crop((gx, gy, gx + w, gy + h))
        tint = Image.new("RGBA", cell.size, color)
        tint.putalpha(cell.getchannel("A"))
        canvas.alpha_composite(tint, (x + left, y + top))
        x += adv


def review(atlas, data):
    lines = [
        ("sans", "The quick brown fox jumps over the lazy dog.", "#f6ecd2"),
        ("sans", "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG!", "#f6ecd2"),
        ("sans", "0123456789 $45 +12 Hype ×2^3 · Lock in 3 – Fold (−$2)", "#e8c260"),
        ("sans", "Café crème, élève, à côté, garçon, où, naïve, Œuvre « Tapis. »", "#f6ecd2"),
        ("sans", "Pick 1–5 cards to play. Waiting on Scaramouche… ★ ♠♥♦♣ @#%&*", "#bfa77e"),
        ("tiny", "FACILE · MOYEN · GROS JOUEUR · lowercase draws as caps", "#d04a4e"),
        ("tiny", "+4 Hype when a Pair scores. 0123456789 $12 ×2 (rare) é è ç", "#f6ecd2"),
        ("didone", "LES MAINS DE POKER", "#f6ecd2"),
        ("didone", "ABCDEFGHIJKLM", "#e8c260"),
        ("didone", "NOPQRSTUVWXYZ", "#e8c260"),
        ("didone", "0123456789 $1,048 ÉTÉ!", "#ff7a24"),
        ("chalk", "Table IV · Manche 12 / 12", "#e3d2a8"),
        ("chalk", "Ante $3 · Max $6 · Lowball 0123456789", "#bfa77e"),
    ]
    height = sum(data[f]["line"] + 4 for f, _, _ in lines) + 8
    canvas = Image.new("RGBA", (420, height), "#1c1513")
    y = 4
    for font, text, color in lines:
        draw(canvas, atlas, data[font], text, 6, y, color)
        y += data[font]["line"] + 4
    canvas.resize((canvas.width * 3, canvas.height * 3), Image.Resampling.NEAREST).save(ROOT / "review.png")


# the webfonts: every glyph pixel becomes a square, 100 units each, and the em is the line box.
# so font-size: 22px on the sans (11 px line) is exactly 2 screen px per glyph pixel. chalk has faint pixels, no webfont
WEBFONTS = [("sans", "Flambeur Sans", False), ("sans", "Flambeur Sans", True), ("tiny", "Flambeur Tiny", False), ("didone", "Flambeur Didone", False)]
U = 100


def outline(ink):
    """Trace the pixel set into closed contours: outer ones clockwise, holes counterclockwise, shared edges cancelled."""
    edges = set()
    for x, y in ink:
        for e in (((x, y), (x, y + 1)), ((x, y + 1), (x + 1, y + 1)), ((x + 1, y + 1), (x + 1, y)), ((x + 1, y), (x, y))):
            back = (e[1], e[0])
            if back in edges:
                edges.remove(back)
            else:
                edges.add(e)
    out = {}
    for a, b in edges:
        out.setdefault(a, []).append(b)
    loops = []
    while out:
        start = next(iter(out))
        loop, at = [start], start
        while True:
            nxt = out[at].pop()
            if not out[at]:
                del out[at]
            if nxt == start:
                break
            loop.append(nxt)
            at = nxt
        # drop the points in the middle of straight runs
        loops.append([q for i, q in enumerate(loop) if not (
            (loop[i - 1][0] == q[0] == loop[(i + 1) % len(loop)][0]) or (loop[i - 1][1] == q[1] == loop[(i + 1) % len(loop)][1]))])
    return loops


def webfonts(atlas, data):
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen

    for name, family, bold in WEBFONTS:
        font = data[name]
        asc, desc = font["ascent"], font["descent"]
        glyphs, metrics, cmap = {}, {}, {}

        def add(gname, ink, advance):
            pen = TTGlyphPen(None)
            for loop in outline(ink):
                pen.moveTo((loop[0][0] * U, loop[0][1] * U))
                for q in loop[1:]:
                    pen.lineTo((q[0] * U, q[1] * U))
                pen.closePath()
            glyphs[gname] = pen.glyph()
            metrics[gname] = (advance * U, min((x for x, _ in ink), default=0) * U)

        add(".notdef", set(), font["space"])
        add("space", set(), font["space"])
        cmap[32] = cmap[0xA0] = "space"
        for ch, (gx, gy, w, h, top, left, adv) in font["glyphs"].items():
            ink = set()
            for py in range(h):
                for px in range(w):
                    if atlas.getpixel((gx + px, gy + py))[3]:
                        # line row top + py, so its bottom edge sits asc - row - 1 above the baseline
                        ink.add((left + px, asc - (top + py) - 1))
            if bold:
                ink |= {(x + 1, y) for x, y in ink}
            gname = f"u{ord(ch):04X}"
            add(gname, ink, adv + (1 if bold else 0))
            cmap[ord(ch)] = gname
        if font["caps"]:
            for ch in list(font["glyphs"]):
                low = ch.lower()
                if low != ch and len(low) == 1 and ord(low) not in cmap:
                    cmap[ord(low)] = cmap[ord(ch)]

        fb = FontBuilder(unitsPerEm=(asc + desc) * U, isTTF=True)
        order = list(glyphs)
        fb.setupGlyphOrder(order)
        fb.setupCharacterMap(cmap)
        fb.setupGlyf(glyphs)
        fb.setupHorizontalMetrics(metrics)
        fb.setupHorizontalHeader(ascent=asc * U, descent=-desc * U)
        style = "Bold" if bold else "Regular"
        fb.setupNameTable({"familyName": family, "styleName": style})
        fb.setupOS2(version=4, sTypoAscender=asc * U, sTypoDescender=-desc * U, sTypoLineGap=0, usWinAscent=asc * U, usWinDescent=desc * U,
                    fsSelection=(0x20 if bold else 0x40) | 0x80, usWeightClass=700 if bold else 400)
        fb.setupPost()
        fb.font["head"].macStyle = 1 if bold else 0
        fb.font.flavor = "woff2"
        fb.save(ROOT / f"{name}{'-bold' if bold else ''}.woff2")


if __name__ == "__main__":
    atlas, data = build()
    review(atlas, data)
    webfonts(atlas, data)
