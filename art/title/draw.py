"""Draw the title world and write title.aseprite with one slice per part: python art/title/draw.py

The world is drawn in code (kit.py is the toolkit, street.py the street, under.py everything below it) so it
stays on the master palette and can be redrawn in one go. Running this overwrites title.aseprite, so hand edits
made in Aseprite are lost; after hand edits only run build.py.
Glows, rain, drips, steam, smoke, neon and water shimmer are code effects (src/ui/title.ts), not drawn here.
"""
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

import street
import under
from kit import GPL, HEX, ROOT


# key: (pixels, pivot x, pivot y)
def parts():
    return {
        "street/back": (street.back().a, 0, 0),
        "street/front": (street.front().a, 0, 0),
        "under": (under.build().a, 0, 0),
        "cellar/bulb": (under.bulb().a, 4, 0),
    }


def main():
    items = parts()
    # shelf-pack onto one source canvas
    width, gap = 720, 2
    x = y = row = 0
    placed = []
    for key, (a, pvx, pvy) in sorted(items.items(), key=lambda kv: -kv[1][0].shape[0]):
        h, w = a.shape
        if x + w > width:
            x, y, row = 0, y + row + gap, 0
        placed.append((key, x, y, w, h, pvx, pvy))
        x += w + gap
        row = max(row, h)
    height = y + row
    sheet = np.zeros((height, width), dtype=np.uint8)
    for key, x, y, w, h, _, _ in placed:
        sheet[y:y + h, x:x + w] = items[key][0]
    pal = [(0, 0, 0)] + [tuple(int(hx[i:i + 2], 16) for i in (1, 3, 5)) for hx in HEX]
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    for i, (r, g, b) in enumerate(pal):
        if i:
            rgba[sheet == i] = (r, g, b, 255)
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "sheet.png"
        Image.fromarray(rgba, "RGBA").save(png)
        manifest = Path(tmp) / "slices.json"
        manifest.write_text(json.dumps([
            {"name": k, "x": x, "y": y, "w": w, "h": h, "px": pvx, "py": pvy} for k, x, y, w, h, pvx, pvy in placed
        ]))
        subprocess.run([
            "aseprite", "-b", "--script-param", f"png={png}", "--script-param", f"slices={manifest}",
            "--script-param", f"gpl={GPL}", "--script-param", f"out={ROOT / 'title.aseprite'}",
            "--script", str(ROOT / "assemble.lua"),
        ], check=True)
    print(f"wrote title.aseprite, {len(placed)} parts")


if __name__ == "__main__":
    main()
