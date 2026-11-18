-- build the editable timeline from native-size cels
local sheet = app.open(app.params.sheet)
local data = json.decode(io.open(app.params.manifest):read("a"))
local spr = Sprite(100, 106, ColorMode.RGB)
spr:setPalette(Palette { fromFile = app.params.palette })
spr.layers[1].name = "objects"
local frame = 0
for _, item in ipairs(data) do
  local x, y = (100-item.w)//2, 106-item.h
  local slice = spr:newSlice(Rectangle(x, y, item.w, item.h))
  slice.name = item.name
  slice.pivot = Point(item.w//2, item.h)
  item.first = frame + 1
  for _, bounds in ipairs(item.cels) do
    frame = frame + 1
    if frame > 1 then spr:newEmptyFrame() end
    local cel = Image(sheet.cels[1].image, Rectangle(bounds.x,bounds.y,item.w,item.h))
    spr:newCel(spr.layers[1], frame, cel, Point(x,y))
    spr.frames[frame].duration = 0.22
  end
  item.last = frame
end
for _, item in ipairs(data) do
  local tag = spr:newTag(item.first, item.last)
  tag.name = item.name
end
spr:saveAs(app.params.out)
