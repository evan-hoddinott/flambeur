"""Export title.aseprite's slices to title.png + title.json, with a palette check: python art/title/build.py

Same pipeline as art/duel/build.py. draw.py makes title.aseprite, this packs it for the game and writes
parts.png (every slice at 2x with its key) to look over.
"""
import json
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent


def export_parts():
    palette = {
        tuple(map(int, line.split()[:3]))
        for line in (ROOT.parent / "palette/flambeur.gpl").read_text().splitlines()
        if line.strip() and line.strip()[0].isdigit()
    }
    parts, slices = {}, []
    with tempfile.TemporaryDirectory() as tmp:
        sheet = Path(tmp) / "source.png"
        data = Path(tmp) / "source.json"
        subprocess.run([
            "aseprite", "-b", str(ROOT / "title.aseprite"),
            "--list-slices", "--sheet", str(sheet), "--data", str(data),
        ], check=True, stdout=subprocess.DEVNULL)
        source = json.loads(data.read_text())
        with Image.open(sheet) as image:
            for item in source["meta"]["slices"]:
                key = item["name"]
                frame = item["keys"][0]
                b = frame["bounds"]
                if key in parts or "pivot" not in frame:
                    raise ValueError(f"Duplicate or unanchored slice {key}")
                part = image.crop((b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"])).convert("RGBA")
                for _, (r, g, bl, a) in part.getcolors(b["w"] * b["h"]):
                    if a and ((r, g, bl) not in palette or a != 255):
                        raise ValueError(f"Off-palette pixel in {key}: {(r, g, bl, a)}")
                parts[key] = part
                slices.append(item)
    return parts, slices, source["meta"]["version"]


def pack(parts, slices, version):
    width = 1024
    x = y = row = 0
    for item in sorted(slices, key=lambda s: -parts[s["name"]].height):
        w, h = parts[item["name"]].size
        if x + w > width:
            x, y, row = 0, y + row + 1, 0
        item["keys"][0]["bounds"].update(x=x, y=y)
        x += w + 1
        row = max(row, h)
    height = y + row
    atlas = Image.new("RGBA", (width, height))
    for item in slices:
        b = item["keys"][0]["bounds"]
        atlas.paste(parts[item["name"]], (b["x"], b["y"]))
    atlas.save(ROOT / "title.png")
    size = {"w": width, "h": height}
    rect = {"x": 0, "y": 0, **size}
    data = {
        "frames": {"title": {"frame": rect, "rotated": False, "trimmed": False,
                             "spriteSourceSize": rect, "sourceSize": size, "duration": 100}},
        "meta": {"app": "https://www.aseprite.org/", "version": version,
                 "image": "title.png", "format": "RGBA8888", "size": size,
                 "scale": "1", "slices": slices},
    }
    (ROOT / "title.json").write_text(json.dumps(data, indent=2) + "\n")


def contact_sheet(parts):
    margin, width = 12, 1600
    x = y = margin
    row = 0
    items = []
    for key, part in sorted(parts.items()):
        w, h = part.width * 2, part.height * 2 + 16
        if x + w > width - margin:
            x, y, row = margin, y + row + margin, 0
        items.append((x, y, key, part))
        x += max(w, 120) + margin
        row = max(row, h)
    sheet = Image.new("RGB", (width, y + row + margin), "#655b58")
    draw = ImageDraw.Draw(sheet)
    for x, y, key, part in items:
        scaled = part.resize((part.width * 2, part.height * 2), Image.Resampling.NEAREST)
        sheet.paste(scaled, (x, y), scaled)
        draw.text((x, y + scaled.height + 3), key, fill="#fff8e8")
    sheet.save(ROOT / "parts.png")


def main():
    parts, slices, version = export_parts()
    pack(parts, slices, version)
    contact_sheet(parts)
    print(f"packed {len(parts)} parts into title.png")


if __name__ == "__main__":
    main()
