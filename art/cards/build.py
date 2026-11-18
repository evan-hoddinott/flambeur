"""Rebuild cards.png, cards.json, and the deck previews with python build.py."""
import io
import json
from pathlib import Path
import subprocess

from PIL import Image, ImageChops
from specials import layers

ROOT = Path(__file__).resolve().parent


def export():
    groups = ("base", "index", "courts", "pips", "backs")
    subprocess.run([
        "aseprite", "-b", *[f"{group}.aseprite" for group in groups],
        "--list-slices", "--sheet-pack", "--sheet", "cards.png", "--data", "cards.json",
    ], cwd=ROOT, check=True)
    path = ROOT / "cards.json"
    data = json.loads(path.read_text())
    parts = {}
    with Image.open(ROOT / "cards.png") as atlas:
        for entry in data["meta"]["slices"]:
            name = entry["name"]
            group = name.split("/")[0]
            source = {"court": "courts", "pip": "pips", "back": "backs"}.get(group, group)
            frame = data["frames"][source + ".aseprite"]["frame"]
            bounds = entry["keys"][0]["bounds"]
            # Aseprite writes slice positions relative to each source canvas.
            bounds["x"] += frame["x"]
            bounds["y"] += frame["y"]
            x, y, w, h = (bounds[k] for k in ("x", "y", "w", "h"))
            parts[name] = atlas.crop((x, y, x + w, y + h)).convert("RGBA")
        original = atlas.convert("RGBA")
    # Pack the generated layers below Aseprite's sheet, keeping its slice coordinates.
    x, y, row = 0, original.height, 0
    extras = layers()
    from runpy import run_path
    device = run_path(str(ROOT.parent / "packaging/starters/build.py"))["device"]
    for box in BOXES:
        badge = Image.new("RGBA", (32, 40))
        badge.alpha_composite(device(box).resize((32, 30), Image.Resampling.NEAREST), (0, 5))
        extras[f"back/emblem/{box}"] = badge
    positions = {}
    for name, im in extras.items():
        if x + im.width > original.width:
            x, y, row = 0, y + row, 0
        positions[name] = (x, y)
        bounds = dict(x=x, y=y, w=im.width, h=im.height)
        data["meta"]["slices"].append(dict(name=name, keys=[dict(frame=0, bounds=bounds)]))
        x += im.width
        row = max(row, im.height)
    sheet = Image.new("RGBA", (original.width, y + row))
    sheet.paste(original)
    for name, im in extras.items():
        sheet.paste(im, positions[name])
    sheet.save(ROOT / "cards.png")
    data["meta"]["size"] = dict(w=sheet.width, h=sheet.height)
    parts.update(extras)
    path.write_text(json.dumps(data, indent=2) + "\n")
    return parts


def mirror_pair(card, part, x, y):
    card.alpha_composite(part, (x, y))
    card.alpha_composite(part.transpose(Image.Transpose.ROTATE_180),
                         (card.width - x - part.width, card.height - y - part.height))


# Pip centers on the 64 x 88 stock. Each row lists its occupied columns.
PIP_ROWS = {
    2: [(16, "C"), (72, "C")],
    3: [(16, "C"), (44, "C"), (72, "C")],
    4: [(16, "LR"), (72, "LR")],
    5: [(16, "LR"), (44, "C"), (72, "LR")],
    6: [(16, "LR"), (44, "LR"), (72, "LR")],
    7: [(16, "LR"), (30, "C"), (44, "LR"), (72, "LR")],
    8: [(16, "LR"), (30, "C"), (44, "LR"), (58, "C"), (72, "LR")],
    9: [(16, "LR"), (35, "LR"), (44, "C"), (53, "LR"), (72, "LR")],
    10: [(16, "LR"), (25, "C"), (35, "LR"), (53, "LR"), (63, "C"), (72, "LR")],
}
SUITS = {"S": "spades", "H": "hearts", "D": "diamonds", "C": "clubs"}
NAMES = {"A": "ace", "J": "jack", "Q": "queen", "K": "king"}
RANKS = ["A", *map(str, range(2, 11)), "J", "Q", "K"]
BOXES = ["classic", "forge", "suited", "highroller", "bargain", "collector", "standard"]


def tinted(glyph, tint):
    return ImageChops.multiply(glyph, Image.new("RGBA", glyph.size, tint))


def face(parts, rank, suit):
    card = parts["base/paper"].copy()
    ink = "#1c1513" if suit in ("S", "C") else "#a82a38"
    if rank == "A":
        card.alpha_composite(parts[f"pip/ace/{suit}"], (19, 31))
    elif rank.isdigit():
        pip = tinted(parts[f"pip/{suit}"], ink)
        turned = pip.transpose(Image.Transpose.ROTATE_180)
        for y, columns in PIP_ROWS[int(rank)]:
            for col in columns:
                x = {"L": 20, "C": 32, "R": 44}[col]
                card.alpha_composite(turned if y > 44 else pip, (x - 5, y - 5))
    else:
        mirror_pair(card, parts[f"court/{rank}/{suit}"], 12, 10)
    mirror_pair(card, tinted(parts[f"index/rank/{rank}"], ink), 4, 4)
    mirror_pair(card, tinted(parts[f"index/suit/{suit}"], ink), 5, 16)
    return card


def back(parts, box):
    card = Image.new("RGBA", (64, 88))
    field = Image.new("RGBA", (54, 78))
    tile = parts[f"back/tile/{box}"]
    for y in range(0, field.height, tile.height):
        for x in range(0, field.width, tile.width):
            field.paste(tile, (x, y))
    card.alpha_composite(field, (5, 5))
    card.alpha_composite(parts["back/frame"])
    card.alpha_composite(parts[f"back/emblem/{box}"], (16,24))
    return card


def review(parts):
    felt = Image.new("RGB", (8 + len(RANKS) * 72, 8 + 5 * 96), "#174034")
    previews = ROOT / "previews"
    previews.mkdir(exist_ok=True)

    def place(card, name, col, row):
        card.save(previews / f"{name}.png")
        felt.paste(card, (8 + col * 72, 8 + row * 96), card)

    for row, (suit, suit_name) in enumerate(SUITS.items()):
        for col, rank in enumerate(RANKS):
            name = f"{NAMES.get(rank, rank)}-of-{suit_name}"
            place(face(parts, rank, suit), name, col, row)
    joker = parts["base/paper"].copy()
    mirror_pair(joker, parts["court/joker"], 12, 10)
    mirror_pair(joker, parts["index/joker"], 5, 6)
    joker.alpha_composite(parts["frame/joker"])
    place(joker, "joker", 0, 4)
    (previews / "backs").mkdir(exist_ok=True)
    for col, box in enumerate(BOXES, start=2):
        place(back(parts, box), f"backs/{box}", col, 4)
    sheet = felt.resize((felt.width * 3, felt.height * 3), Image.Resampling.NEAREST)
    result = subprocess.run(["node", ROOT / "render-review.mjs"], capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode())
    with Image.open(io.BytesIO(result.stdout)) as rows:
        review_sheet = Image.new("RGB", (sheet.width, sheet.height + rows.height * 3))
        review_sheet.paste(sheet)
        review_sheet.paste(rows.resize((sheet.width, rows.height * 3), Image.Resampling.NEAREST), (0, sheet.height))
        review_sheet.save(ROOT / "review.png")
    # Last row, from the first box back through the last.
    sheet.crop((144 * 3, 384 * 3, (152 + 72 * len(BOXES)) * 3, sheet.height)).save(ROOT / "backs-review.png")


if __name__ == "__main__":
    review(export())
