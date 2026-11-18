"""python build.py exports the editable timeline. Add --draw to regenerate its original cels."""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.dont_write_bytecode = True

from draw import (
    ART,
    ROOT,
    OBJECTS,
    NN,
    atlas,
    card,
    label,
    slab_label,
    embroidered_suit,
    gold,
    ink,
    cream,
    wood,
    ox,
)

from payoffs import OBJECTS as PAYOFFS

OBJECTS = [*OBJECTS, *PAYOFFS]

SOURCE = ROOT / "collectibles.aseprite"


def ase(*args):
    subprocess.run(["aseprite", "-b", *map(str, args)], check=True)


def original(tmp):
    sheet = Image.new("RGBA", (400, 106 * (len(OBJECTS) + 5)))
    manifest = []

    def add(name, frames):
        w, h = frames[0].size
        y = len(manifest) * 106
        positions = []
        for f, im in enumerate(frames):
            sheet.paste(im, (f * 100, y))
            positions.append(dict(x=f * 100, y=y))
        manifest.append(dict(name=name, w=w, h=h, cels=positions))

    for name, w, h, draw in OBJECTS:
        frames = []
        for f in range(4):
            im = Image.new("RGBA", (w, h))
            draw(im, ImageDraw.Draw(im), f)
            frames.append(im)
        add(name, frames)
    for s in "SHDC":
        add(
            "collect/playmat/suit" + ("" if s == "S" else "/" + s),
            [embroidered_suit(s)],
        )
    add("collect/psa/label", [slab_label()])
    sheet.save(tmp / "drawn.png")
    (tmp / "manifest.json").write_text(json.dumps(manifest))
    ase(
        "--script-param",
        f"sheet={tmp / 'drawn.png'}",
        "--script-param",
        f"manifest={tmp / 'manifest.json'}",
        "--script-param",
        f"palette={ART / 'palette/flambeur.gpl'}",
        "--script-param",
        f"out={SOURCE}",
        "--script",
        ROOT / "assemble.lua",
    )


def review(parts):
    gap = 6
    width = sum(w + gap for _, w, _, _ in OBJECTS) + 18
    im = Image.new("RGBA", (width, 274), ink)
    d = ImageDraw.Draw(im)
    d.rectangle((2, 5, width - 3, 158), wood, gold, 2)
    d.rectangle((7, 10, width - 8, 150), ox, ink, 2)
    d.line((10, 126, width - 11, 126), wood, 3)

    def prop(name, i):
        art = parts[name].copy()
        if name == "playmat":
            tile = parts["collect/playmat/suit/H"]
            art.paste(gold, (34, 12), tile.getchannel("A"))
        if name == "psa_slab":
            art.alpha_composite(card("king", "spades").resize((64, 88), NN), (4, 18))
            art.alpha_composite(parts["collect/psa/label"], (4, 4))
        result = Image.new("RGBA", (art.width + 6, art.height + 6))
        if i >= 16 and name != "bulk_bin":
            mask = Image.new("L", result.size)
            mask.paste(art.getchannel("A"), (3, 3))
            result.paste(
                "#e8c260" if i >= 25 else "#b8d0e8",
                (0, 0),
                mask.filter(ImageFilter.MaxFilter(5)).filter(
                    ImageFilter.GaussianBlur(1)
                ),
            )
        result.alpha_composite(art, (3, 3))
        return result

    x = 12
    for i, (name, w, h, _) in enumerate(OBJECTS):
        im.alpha_composite(prop(name, i), (x - 3, 124 - h - 3))
        label(
            im,
            name.replace("_", " ").upper(),
            x + w // 2,
            135,
            cream,
            width=min(w, len(name) * 4),
        )
        x += w + gap
    x = 12
    for name in [
        "shop/pack/free",
        "shop/pack/repack",
        "playmat",
        "triple_threat",
        "shop/scratcher",
        "shop/sleeve/archival",
    ]:
        obj = (
            atlas("shop")[name]
            if name.startswith("shop/")
            else prop(name, 25 if name == "triple_threat" else 0)
        )
        im.alpha_composite(obj, (x, 266 - obj.height))
        x += obj.width + 8
    d.rectangle((8, 266, x, 273), wood)
    im.resize((width * 3, im.height * 3), NN).save(ROOT / "review.png")


def export(tmp):
    ase(
        SOURCE,
        "--list-tags",
        "--list-slices",
        "--format",
        "json-array",
        "--sheet-columns",
        "10",
        "--sheet",
        tmp / "timeline.png",
        "--data",
        tmp / "timeline.json",
    )
    source = json.loads((tmp / "timeline.json").read_text())
    bounds = {s["name"]: s["keys"][0] for s in source["meta"]["slices"]}
    sheet = Image.open(tmp / "timeline.png").convert("RGBA")
    out = Image.new("RGBA", (1024, 1600))
    parts = {}
    slices = []
    x = y = row = 0
    for tag in source["meta"]["frameTags"]:
        name = tag["name"]
        key = bounds[name]
        b = key["bounds"]
        for i in range(tag["from"], tag["to"] + 1):
            frame = source["frames"][i]["frame"]
            left, top = frame["x"] + b["x"], frame["y"] + b["y"]
            w, h = b["w"], b["h"]
            tile = sheet.crop((left, top, left + w, top + h))
            if i == tag["from"]:
                parts[name] = tile
            if x + w > out.width:
                x, y, row = 0, y + row, 0
            out.paste(tile, (x, y))
            suffix = i - tag["from"]
            slices.append(
                dict(
                    name=name + (f"/{suffix}" if suffix else ""),
                    keys=[
                        dict(
                            frame=0, bounds=dict(x=x, y=y, w=w, h=h), pivot=key["pivot"]
                        )
                    ],
                )
            )
            x += w
            row = max(row, h)
    out = out.crop((0, 0, out.width, y + row))
    out.save(ROOT / "collectibles.png")
    meta = dict(
        image="collectibles.png", size=dict(w=out.width, h=out.height), slices=slices
    )
    (ROOT / "collectibles.json").write_text(
        json.dumps(dict(meta=meta), separators=(",", ":")) + "\n"
    )
    review(parts)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as dirname:
        tmp = Path(dirname)
        if "--draw" in sys.argv:
            original(tmp)
        export(tmp)
