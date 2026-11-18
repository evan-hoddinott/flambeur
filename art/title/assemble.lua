-- called by draw.py: turns the drawn sheet into title.aseprite on the master palette, one slice per part
local spr = app.open(app.params.png)
assert(spr, "couldn't open " .. app.params.png)
local pal = Palette { fromFile = app.params.gpl }
spr:setPalette(pal)
app.command.ChangePixelFormat { format = "indexed", dithering = "none" }
spr.layers[1].name = "parts"
local f = io.open(app.params.slices)
local list = json.decode(f:read("a"))
f:close()
for _, s in ipairs(list) do
  local sl = spr:newSlice(Rectangle(s.x, s.y, s.w, s.h))
  sl.name = s.name
  sl.pivot = Point(s.px, s.py)
end
spr:saveAs(app.params.out)
