#!/usr/bin/env python3
# writes preview.html with the atlas data inlined, so it opens straight from disk
import json, pathlib

root = pathlib.Path(__file__).resolve().parent.parent

def frames(name):
    data = json.loads((root / f"{name}.json").read_text())
    return [[f["frame"]["x"], f["frame"]["y"], f["frame"]["w"], f["frame"]["h"], f["duration"]] for f in data["frames"]]

atlas = {"intro": frames("intro"), "idle": frames("idle")}
html = (root / "src" / "preview.template.html").read_text().replace("/*ATLAS*/", json.dumps(atlas, separators=(",", ":")))
(root / "preview.html").write_text(html)
print("wrote preview.html")
