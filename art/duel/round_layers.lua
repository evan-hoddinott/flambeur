-- one named layer and slice per part, all at native resolution
local source = app.open(app.params.sheet)
local items = json.decode(io.open(app.params.manifest):read("a"))
local sprite = Sprite(source.width, source.height, ColorMode.RGB)
sprite:setPalette(Palette { fromFile = app.params.palette })
for i,item in ipairs(items) do
  local layer = i == 1 and sprite.layers[1] or sprite:newLayer()
  layer.name = item.name
  local r = Rectangle(item.x, item.y, item.w, item.h)
  sprite:newCel(layer, 1, Image(source.cels[1].image, r), Point(item.x, item.y))
  local slice = sprite:newSlice(r)
  slice.name = item.name
  slice.pivot = Point(item.px,item.py)
  if item.name == "hud/score/tag/thrown" then slice.center = Rectangle(7,5,item.w-14,item.h-10) end
end
sprite:saveAs(app.params.out)
