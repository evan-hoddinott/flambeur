-- shared helpers for the flambeur logo generator: palette, buffers, raster, noise, fonts
local L = {}

L.W, L.H = 384, 216

-- palette. index 0 is transparent, everything else is listed here in order
local PAL = {
  { "ink",    0x1a0a12 }, { "ink2",   0x2e0f1c },
  { "bur1",   0x4a1525 }, { "bur2",   0x6e1b2c }, { "bur3",   0x96283a }, { "bur4",   0xc2413f },
  { "gold0",  0x4a2210 }, { "gold1",  0x7a3d12 }, { "gold2",  0xad6316 }, { "gold3",  0xd98e1c },
  { "gold4",  0xf2b830 }, { "gold5",  0xfbd85a }, { "gold6",  0xfdf0a0 }, { "gold7",  0xfffbe0 },
  { "fire_y", 0xffe45e }, { "fire_o1", 0xffb22e }, { "fire_o2", 0xf77a1c }, { "fire_r", 0xdc3e1a },
  { "fire_d", 0x9c1f26 }, { "smoke",  0x55142a },
  { "cream0", 0xfff6e0 }, { "cream1", 0xf4e8cc }, { "cream2", 0xdfcba3 }, { "cream3", 0xb89c74 },
  { "char1",  0x5a3420 }, { "char2",  0x2e1810 },
  { "red",    0xcc2f2f }, { "red_d",  0x8c1c28 },
  { "blue",   0x2e52a4 }, { "blue_d", 0x1c2f6a }, { "blue_l", 0x7fa0dc },
  { "skin",   0xf6d2aa }, { "skin_d", 0xd99c74 },
  { "felt0",  0x061a14 }, { "felt1",  0x0a2a1f }, { "felt2",  0x0e3a2a }, { "felt3",  0x14503a },
  { "felt4",  0x1c6a4c },
  { "white",  0xffffff },
  -- card markers: the cards layer is a mask, the game paints the real card art where these are.
  -- one intact + one scorched shade per fan slot, near cream so the flat previews still read as blank cards.
  -- src/ui/logo.ts matches these exact values
  { "card1", 0xf4e8c1 }, { "card2", 0xf4e8c2 }, { "card3", 0xf4e8c3 }, { "card4", 0xf4e8c4 }, { "card5", 0xf4e8c5 },
  { "scorch1", 0xdfcb99 }, { "scorch2", 0xdfcb9a }, { "scorch3", 0xdfcb9b }, { "scorch4", 0xdfcb9c }, { "scorch5", 0xdfcb9d },
}
L.PAL = PAL
local C = {}
for i, p in ipairs(PAL) do C[p[1]] = i end
L.C = C

function L.palette()
  local pal = Palette(#PAL + 1)
  pal:setColor(0, Color { r = 0, g = 0, b = 0, a = 0 })
  for i, p in ipairs(PAL) do
    local v = p[2]
    pal:setColor(i, Color { r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255, a = 255 })
  end
  return pal
end

-- flat buffer of w*h values, 0-based x,y
function L.buf(w, h, v)
  local b = { w = w, h = h }
  v = v or 0
  for i = 1, w * h do b[i] = v end
  return b
end

function L.get(b, x, y)
  if x < 0 or y < 0 or x >= b.w or y >= b.h then return 0 end
  return b[y * b.w + x + 1]
end

function L.set(b, x, y, v)
  if x < 0 or y < 0 or x >= b.w or y >= b.h then return end
  b[y * b.w + x + 1] = v
end

-- copy src onto dst at ox,oy, skipping 0. remap is an optional color table
function L.blit(dst, src, ox, oy, remap)
  local sw, sh, dw, dh = src.w, src.h, dst.w, dst.h
  for y = 0, sh - 1 do
    local dy = y + oy
    if dy >= 0 and dy < dh then
      local si, di = y * sw, dy * dw + ox
      for x = 0, sw - 1 do
        local v = src[si + x + 1]
        if v ~= 0 then
          local dx = x + ox
          if dx >= 0 and dx < dw then dst[di + x + 1] = remap and (remap[v] or v) or v end
        end
      end
    end
  end
end

function L.rect(b, x0, y0, x1, y1, v)
  for y = math.max(0, y0), math.min(b.h, y1) - 1 do
    for x = math.max(0, x0), math.min(b.w, x1) - 1 do b[y * b.w + x + 1] = v end
  end
end

-- even-odd polygon fill sampled at pixel centers. pts = {x1,y1,x2,y2,...}
function L.poly(b, pts, v)
  local n = #pts // 2
  local ymin, ymax = math.huge, -math.huge
  for i = 1, n do
    ymin = math.min(ymin, pts[2 * i]); ymax = math.max(ymax, pts[2 * i])
  end
  for y = math.max(0, math.floor(ymin)), math.min(b.h - 1, math.ceil(ymax)) do
    local cy = y + 0.5
    local xs = {}
    for i = 1, n do
      local j = i % n + 1
      local xa, ya, xb, yb = pts[2 * i - 1], pts[2 * i], pts[2 * j - 1], pts[2 * j]
      if (ya <= cy and yb > cy) or (yb <= cy and ya > cy) then
        xs[#xs + 1] = xa + (cy - ya) / (yb - ya) * (xb - xa)
      end
    end
    table.sort(xs)
    for k = 1, #xs - 1, 2 do
      for x = math.max(0, math.ceil(xs[k] - 0.5)), math.min(b.w - 1, math.ceil(xs[k + 1] - 0.5) - 1) do
        b[y * b.w + x + 1] = v
      end
    end
  end
end

-- filled ellipse, side: nil = full, "r" right half, "l" left half, "b" bottom half, "t" top half
function L.ell(b, cx, cy, rx, ry, v, side)
  for y = math.max(0, math.floor(cy - ry)), math.min(b.h - 1, math.ceil(cy + ry)) do
    for x = math.max(0, math.floor(cx - rx)), math.min(b.w - 1, math.ceil(cx + rx)) do
      local px, py = x + 0.5, y + 0.5
      local ok = ((px - cx) / rx) ^ 2 + ((py - cy) / ry) ^ 2 <= 1
      if ok and side == "r" then ok = px >= cx end
      if ok and side == "l" then ok = px <= cx end
      if ok and side == "b" then ok = py >= cy end
      if ok and side == "t" then ok = py <= cy end
      if ok then b[y * b.w + x + 1] = v end
    end
  end
end

-- integer hash to [0,1)
local function hash(x, y, s)
  local n = (x * 374761393 + y * 668265263 + s * 1442695041) & 0xffffffff
  n = ((n ~ (n >> 13)) * 1274126177) & 0xffffffff
  n = n ~ (n >> 16)
  return (n & 0xffff) / 65536
end
L.hash = hash

-- smooth value noise, lattice sx,sy. py = period in lattice rows (nil = none)
function L.vnoise(x, y, sx, sy, seed, py)
  local fx, fy = x / sx, y / sy
  local x0, y0 = math.floor(fx), math.floor(fy)
  local tx, ty = fx - x0, fy - y0
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty)
  local ya, yb = y0, y0 + 1
  if py then ya = ya % py; yb = yb % py end
  local a, b2 = hash(x0, ya, seed), hash(x0 + 1, ya, seed)
  local c, d = hash(x0, yb, seed), hash(x0 + 1, yb, seed)
  local top = a + (b2 - a) * tx
  return top + ((c + (d - c) * tx) - top) * ty
end

-- parse ascii art rows into a buffer using a char -> color map ('.' = transparent)
function L.art(rows, map)
  local w = 0
  for _, r in ipairs(rows) do w = math.max(w, #r) end
  local b = L.buf(w, #rows, 0)
  for y, r in ipairs(rows) do
    for x = 1, #r do
      local ch = r:sub(x, x)
      if ch ~= "." and ch ~= " " then
        local v = map[ch]
        if not v then error("art: unknown char '" .. ch .. "' in row " .. y) end
        b[(y - 1) * w + x] = v
      end
    end
  end
  return b
end

function L.rot180(src)
  local b = L.buf(src.w, src.h, 0)
  local n = src.w * src.h
  for i = 1, n do b[i] = src[n + 1 - i] end
  return b
end

-- rotate 90 clockwise
function L.rot90(src)
  local b = L.buf(src.h, src.w, 0)
  for y = 0, src.h - 1 do
    for x = 0, src.w - 1 do
      b[x * b.w + (src.h - 1 - y) + 1] = src[y * src.w + x + 1]
    end
  end
  return b
end

-- scale2x (epx), used three times for a rotsprite-style rotation
function L.scale2x(src)
  local w, h = src.w, src.h
  local b = L.buf(w * 2, h * 2, 0)
  local get = L.get
  for y = 0, h - 1 do
    for x = 0, w - 1 do
      local p = src[y * w + x + 1]
      local a, bb, c, d = get(src, x, y - 1), get(src, x + 1, y), get(src, x - 1, y), get(src, x, y + 1)
      local e0, e1, e2, e3 = p, p, p, p
      if c == a and c ~= d and a ~= bb then e0 = a end
      if a == bb and a ~= c and bb ~= d then e1 = bb end
      if d == c and d ~= bb and c ~= a then e2 = c end
      if bb == d and bb ~= a and d ~= c then e3 = d end
      local o = (2 * y) * b.w + 2 * x + 1
      b[o] = e0; b[o + 1] = e1; b[o + b.w] = e2; b[o + b.w + 1] = e3
    end
  end
  return b
end

-- tiny fonts ----------------------------------------------------------------
local function glyphs(h, defs)
  local out = {}
  for ch, rows in pairs(defs) do
    if #rows ~= h then error("glyph " .. ch .. " has " .. #rows .. " rows") end
    out[ch] = L.art(rows, { X = 1 })
    out[ch].w = #rows[1]
  end
  return out
end

-- 3x5, card names
L.font3 = glyphs(5, {
  A = { ".X.", "X.X", "XXX", "X.X", "X.X" }, C = { ".XX", "X..", "X..", "X..", ".XX" },
  E = { "XXX", "X..", "XX.", "X..", "XXX" }, H = { "X.X", "X.X", "XXX", "X.X", "X.X" },
  L = { "X..", "X..", "X..", "X..", "XXX" }, N = { "XX.", "X.X", "X.X", "X.X", "X.X" },
  O = { ".X.", "X.X", "X.X", "X.X", ".X." }, P = { "XX.", "X.X", "XX.", "X..", "X.." },
  R = { "XX.", "X.X", "XX.", "X.X", "X.X" }, S = { ".XX", "X..", ".X.", "..X", "XX." },
  T = { "XXX", ".X.", ".X.", ".X.", ".X." },
})

-- 5x7, croupier line and card indices
L.font5 = glyphs(7, {
  A = { ".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X" },
  D = { "XXXX.", "X...X", "X...X", "X...X", "X...X", "X...X", "XXXX." },
  E = { "XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX" },
  I = { "XXX", ".X.", ".X.", ".X.", ".X.", ".X.", "XXX" },
  L = { "X....", "X....", "X....", "X....", "X....", "X....", "XXXXX" },
  N = { "X...X", "XX..X", "XX..X", "X.X.X", "X..XX", "X..XX", "X...X" },
  P = { "XXXX.", "X...X", "X...X", "XXXX.", "X....", "X....", "X...." },
  R = { "XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X" },
  S = { ".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX." },
  U = { "X...X", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX." },
  V = { "X...X", "X...X", "X...X", "X...X", ".X.X.", ".X.X.", "..X.." },
})

-- 10x16 digits for the appraisal count-up
L.digits = glyphs(16, {
  ["0"] = { "..XXXXXX..", ".XXXXXXXX.", "XXXX..XXXX", "XXX....XXX", "XXX....XXX", "XXX....XXX", "XXX....XXX", "XXX....XXX",
    "XXX....XXX", "XXX....XXX", "XXX....XXX", "XXX....XXX", "XXX....XXX", "XXXX..XXXX", ".XXXXXXXX.", "..XXXXXX.." },
  ["1"] = { "....XXX...", "...XXXX...", "..XXXXX...", ".XXXXXX...", ".XX.XXX...", "....XXX...", "....XXX...", "....XXX...",
    "....XXX...", "....XXX...", "....XXX...", "....XXX...", "....XXX...", "....XXX...", ".XXXXXXXX.", ".XXXXXXXX." },
  ["2"] = { "..XXXXXX..", ".XXXXXXXX.", "XXXX..XXXX", "XXX....XXX", ".......XXX", ".......XXX", "......XXXX", ".....XXXX.",
    "....XXXX..", "...XXXX...", "..XXXX....", ".XXXX.....", "XXXX......", "XXX.......", "XXXXXXXXXX", "XXXXXXXXXX" },
  ["3"] = { "..XXXXXX..", ".XXXXXXXX.", "XXXX..XXXX", "XXX....XXX", ".......XXX", ".......XXX", "......XXXX", "...XXXXXX.",
    "...XXXXXX.", "......XXXX", ".......XXX", ".......XXX", "XXX....XXX", "XXXX..XXXX", ".XXXXXXXX.", "..XXXXXX.." },
  ["4"] = { "......XXX.", ".....XXXX.", "....XXXXX.", "...XXXXXX.", "...XX.XXX.", "..XXX.XXX.", ".XXX..XXX.", ".XX...XXX.",
    "XXX...XXX.", "XXXXXXXXXX", "XXXXXXXXXX", "......XXX.", "......XXX.", "......XXX.", "......XXX.", "......XXX." },
  ["5"] = { "XXXXXXXXX.", "XXXXXXXXX.", "XXX.......", "XXX.......", "XXX.......", "XXXXXXXX..", "XXXXXXXXX.", "XXX...XXXX",
    ".......XXX", ".......XXX", ".......XXX", ".......XXX", "XXX....XXX", "XXXX..XXXX", ".XXXXXXXX.", "..XXXXXX.." },
  ["6"] = { "...XXXXXX.", "..XXXXXXX.", ".XXXX.....", "XXXX......", "XXX.......", "XXX.XXXX..", "XXXXXXXXX.", "XXXX..XXXX",
    "XXX....XXX", "XXX....XXX", "XXX....XXX", "XXX....XXX", "XXX....XXX", "XXXX..XXXX", ".XXXXXXXX.", "..XXXXXX.." },
  ["7"] = { "XXXXXXXXXX", "XXXXXXXXXX", ".......XXX", ".......XXX", "......XXX.", "......XXX.", ".....XXX..", ".....XXX..",
    "....XXX...", "....XXX...", "...XXX....", "...XXX....", "...XXX....", "...XXX....", "...XXX....", "...XXX...." },
  ["8"] = { "..XXXXXX..", ".XXXXXXXX.", "XXXX..XXXX", "XXX....XXX", "XXX....XXX", "XXX....XXX", "XXXX..XXXX", ".XXXXXXXX.",
    ".XXXXXXXX.", "XXXX..XXXX", "XXX....XXX", "XXX....XXX", "XXX....XXX", "XXXX..XXXX", ".XXXXXXXX.", "..XXXXXX.." },
})

L.digits["9"] = L.rot180(L.digits["6"]); L.digits["9"].w = 10

-- suit pips, 7x7
L.pips = {
  heart   = L.art({ ".XX.XX.", "XXXXXXX", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..." }, { X = 1 }),
  diamond = L.art({ "...X...", "..XXX..", ".XXXXX.", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..." }, { X = 1 }),
  spade   = L.art({ "...X...", "..XXX..", ".XXXXX.", "XXXXXXX", "XXXXXXX", ".X.X.X.", "..XXX.." }, { X = 1 }),
  club    = L.art({ "..XXX..", "..XXX..", "XX.X.XX", "XXXXXXX", "XX.X.XX", "...X...", "..XXX.." }, { X = 1 }),
}

-- draw a 1-bit glyph in a color
function L.stamp(dst, g, ox, oy, color)
  for y = 0, g.h - 1 do
    for x = 0, g.w - 1 do
      if g[y * g.w + x + 1] ~= 0 then L.set(dst, ox + x, oy + y, color) end
    end
  end
end

function L.textWidth(font, s, gap)
  local w = 0
  for i = 1, #s do
    local ch = s:sub(i, i)
    w = w + (ch == " " and 4 or font[ch].w + gap)
  end
  return w - gap
end

function L.text(dst, font, s, ox, oy, color, gap)
  for i = 1, #s do
    local ch = s:sub(i, i)
    if ch == " " then
      ox = ox + 4
    else
      L.stamp(dst, font[ch], ox, oy, color)
      ox = ox + font[ch].w + gap
    end
  end
end

-- write a color-index buffer into an aseprite indexed image
function L.toImage(b)
  local img = Image(b.w, b.h, ColorMode.INDEXED)
  local parts, char, w = {}, string.char, b.w
  for y = 0, b.h - 1 do
    parts[y + 1] = char(table.unpack(b, y * w + 1, y * w + w))
  end
  img.bytes = table.concat(parts)
  return img
end

return L
