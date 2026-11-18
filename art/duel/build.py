"""Run python art/duel/build.py to export the Aseprite parts and render the art proofs."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
GROUPS = ("you", "masks", "rival", "table", "chips", "lamp", "room", "hud", "round")


def export_parts():
    palette = {
        tuple(map(int, line.split()[:3]))
        for line in (ROOT.parent / "palette/flambeur.gpl").read_text().splitlines()
        if line.strip() and line.strip()[0].isdigit()
    }
    # tinted sprites are drawn in the 5-step greyscale and multiplied by a color in code
    greys = {(255, 255, 255), (208, 208, 208), (160, 160, 160), (104, 104, 104), (48, 48, 48)}
    parts, slices = {}, []
    with tempfile.TemporaryDirectory() as tmp:
        sheet = Path(tmp) / "source.png"
        data = Path(tmp) / "source.json"
        for group in GROUPS:
            subprocess.run([
                "aseprite", "-b", str(ROOT / f"{group}.aseprite"),
                "--list-slices", "--sheet", str(sheet), "--data", str(data),
            ], check=True)
            source = json.loads(data.read_text())
            with Image.open(sheet) as image:
                for item in source["meta"]["slices"]:
                    key = item["name"]
                    frame = item["keys"][0]
                    bounds = frame["bounds"]
                    x, y, w, h = (bounds[k] for k in ("x", "y", "w", "h"))
                    if key in parts or "pivot" not in frame:
                        raise ValueError(f"Duplicate or unanchored slice {key}")
                    part = image.crop((x, y, x + w, y + h)).convert("RGBA")
                    tint = key.startswith("hud/ticket/") and key != "hud/ticket/chip"
                    allowed = palette | greys if tint else palette
                    for _, (r, g, b, a) in part.getcolors(w * h):
                        if a and ((r, g, b) not in allowed or a != 255):
                            raise ValueError(f"Off-palette pixel in {key}: {(r, g, b, a)}")
                    parts[key] = part
                    slices.append(item)
    from ephemera import parts as paper_parts
    for key, im in paper_parts().items():
        parts[key] = im
        w,h = im.size
        centered = key in ("rules/ball","rules/half")
        frame = dict(frame=0, bounds=dict(x=0,y=0,w=w,h=h), pivot=dict(x=w//2 if centered else 0,y=h//2 if centered else 0))
        if key == "fx/receipt":
            frame["center"] = dict(x=4,y=4,w=24,h=20)
        slices.append(dict(name=key,keys=[frame]))
    return parts, slices, source["meta"]["version"]


def pack(parts, slices, version):
    # Pack individual slices. Pivots and nine-slice centers stay local to their sprite.
    width = max(512, max(im.width for im in parts.values()))
    x = y = row_height = 0
    for item in sorted(slices, key=lambda s: -parts[s["name"]].height):
        w, h = parts[item["name"]].size
        if x + w > width:
            x, y, row_height = 0, y + row_height + 1, 0
        item["keys"][0]["bounds"].update(x=x, y=y)
        x += w + 1
        row_height = max(row_height, h)
    height = y + row_height
    atlas = Image.new("RGBA", (width, height))
    for item in slices:
        bounds = item["keys"][0]["bounds"]
        atlas.paste(parts[item["name"]], (bounds["x"], bounds["y"]))
    atlas.save(ROOT / "duel.png")
    size = {"w": width, "h": height}
    rect = {"x": 0, "y": 0, **size}
    data = {
        "frames": {"duel": {"frame": rect, "rotated": False, "trimmed": False,
                            "spriteSourceSize": rect, "sourceSize": size, "duration": 100}},
        "meta": {"app": "https://www.aseprite.org/", "version": version,
                 "image": "duel.png", "format": "RGBA8888", "size": size,
                 "scale": "1", "slices": slices},
    }
    (ROOT / "duel.json").write_text(json.dumps(data, indent=2) + "\n")


def contact_sheet(parts):
    """Lay out the isolated pieces at 2x with their atlas keys underneath."""
    font = ImageFont.load_default(size=14)
    margin, width = 16, 1080
    items = []
    x = y = margin
    row_height = 0
    for key, part in parts.items():
        w = max(part.width * 2, int(font.getlength(key)) + 1)
        if x + w + margin > width:
            x = margin
            y += row_height + margin
            row_height = 0
        items.append((x, y, key, part))
        row_height = max(row_height, part.height * 2 + 22)
        x += w + margin
    sheet = Image.new("RGB", (width, y + row_height + margin), "#655b58")
    draw = ImageDraw.Draw(sheet)
    for x, y, key, part in items:
        scaled = part.resize((part.width * 2, part.height * 2), Image.Resampling.NEAREST)
        sheet.paste(scaled, (x, y), scaled)
        draw.text((x, y + scaled.height + 3), key, font=font, fill="#fff8e8")
    sheet.save(ROOT / "parts.png")


def draw_round():
    from round_hud import parts as round_parts
    from gestures import parts as gestures
    from tickets import parts as tickets

    parts = round_parts() | gestures() | tickets()
    palette = [tuple(map(int,line.split()[:3])) for line in (ROOT.parent/"palette/flambeur.gpl").read_text().splitlines() if line.strip() and line.strip()[0].isdigit()]
    colors = {}
    items = []
    x = y = row = 0
    width = 320
    for name, image in parts.items():
        if x + image.width > width:
            x, y, row = 0, y + row + 2, 0
        anchor = name.startswith("hud/stamp/") or name == "hud/ko/stamp"
        items.append(dict(name=name,x=x,y=y,w=image.width,h=image.height,
                          px=image.width//2 if anchor else 0,py=image.height//2 if anchor else 0))
        x += image.width + 2
        row = max(row,image.height)
    sheet = Image.new("RGBA",(width,y+row))
    for item in items:
        image = parts[item["name"]]
        for _,color in image.getcolors(image.width*image.height):
            if color not in colors:
                nearest = min(palette,key=lambda rgb:sum((a-b)**2 for a,b in zip(rgb,color[:3])))
                colors[color] = (*nearest,color[3])
        image.putdata([colors[color] for color in image.get_flattened_data()])
        sheet.alpha_composite(image,(item["x"],item["y"]))
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        sheet.save(base/"round.png")
        (base/"parts.json").write_text(json.dumps(items))
        subprocess.run(["aseprite","-b","--script-param",f"sheet={base/'round.png'}",
                        "--script-param",f"manifest={base/'parts.json'}","--script-param",
                        f"palette={ROOT.parent/'palette/flambeur.gpl'}","--script-param",
                        f"out={ROOT/'round.aseprite'}","--script",str(ROOT/"round_layers.lua")],check=True)


def main():
    from deckstack import stack_review
    sys.path.insert(0, str(ROOT.parent / "cards"))
    from review import review, tilt_review

    if "--draw" in sys.argv:
        draw_round()
    parts, slices, version = export_parts()
    pack(parts, slices, version)
    for key, part in parts.items():
        path = ROOT / "sprites" / f"{key}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        part.save(path)
    pivots, centers = {}, {}
    for item in slices:
        key, frame = item["name"], item["keys"][0]
        pivots[key] = tuple(frame["pivot"][k] for k in ("x", "y"))
        if "center" in frame:
            centers[key] = tuple(frame["center"][k] for k in ("x", "y", "w", "h"))
    contact_sheet(parts)
    review(parts, pivots, centers)
    stack_review(parts)
    tilt_review()


if __name__ == "__main__":
    main()
