-- paris-pattern court cards, original pixel versions. 72x104, double-headed.
-- the figure box is drawn once for the top head and mirrored through the centre.
-- index, pip and name are kept as separate decals so they stay pixel-crisp when
-- the card body is rotated into the fan.
local L = ...
local C = L.C
local rect, poly, set, get = L.rect, L.poly, L.set, L.get

local CW, CH = 72, 104
local BX, BY, BW, BH = 13, 5, 46, 94

local MAP = { k = C.ink, s = C.skin, d = C.skin_d, y = C.gold4, o = C.gold2, r = C.red, m = C.red_d,
  b = C.blue, n = C.blue_d, l = C.blue_l, w = C.cream0, c = C.cream2 }

local function mirror(rows)
  local out = {}
  for i, r in ipairs(rows) do out[i] = r .. r:reverse() end
  return out
end

local heads = {}

heads.king = mirror {
  ".......k....k",
  "......kyk..ky",
  "..k...kyykkyy",
  ".kyk.kyyyyyyy",
  ".kyykyyyyyyyy",
  ".kyyyyryyyyyb",
  ".kyyyyyyyyyyy",
  ".kooooooooooo",
  ".krrkyykrrkyy",
  ".kkkkkkkkkkkk",
  "kyyykssssssss",
  "kyykskkkkksss",
  "kyyksssswksss",
  "kyykssssssssd",
  "kyyksrssssssd",
  "kyyyksssssdds",
  ".kyykyyyyyyyy",
  ".kyyyyykkkmmm",
  ".kyyyyyyyyyyy",
  "..kyyyyyyyyyy",
  "..kyyoyyyyoyy",
  "...kyyoyyyoyy",
  "...kyyykyyyyy",
  "....kyyk.kyyy",
  ".....kk...kyy",
  "...........kk",
}

heads.queen = mirror {
  "......k...k.k",
  ".....kyk.kyky",
  ".....kyykyyyy",
  ".....kyyryyyb",
  ".....kooooooo",
  "....kkkkkkkkk",
  "...kyyyyyyyyy",
  "..kyyyyyyykkk",
  ".kyyyyykkssss",
  ".kyyyykssssss",
  "kyyyykskkkkss",
  "kyyyksssswkss",
  "kyyykssssssss",
  "kyyykrrsssssd",
  "kyyykssssssds",
  ".kyyykssssmmm",
  ".kyyyksssssss",
  "..kyyykssssss",
  "..kyyyykkssss",
  "...kyyyykksss",
  "...kyyyyk.kss",
  "....kyyk..kss",
  ".....kk...kss",
}

local jackHat = {
  "........kkkkkkkkkk........",
  ".....kkkbbbbbbbbbbkkk.....",
  "....kbbbbbbbbbbbbbbbbkkkk.",
  "...kbbbbbbbbbbbbbbbbbkrrrk",
  "...kbbnbbnbbnbbnbbnbbkrrrk",
  "...kyyyyyyyyyyyyyyyyykrrk.",
  "...kkkkkkkkkkkkkkkkkkkkk..",
}
local jackFace = mirror {
  "..kyyksssssss",
  ".kyyykskkkkss",
  ".kyyyksswksss",
  "kyyyyksssssss",
  "kyyyyksssssds",
  "kyyyykrssssds",
  "kyyyyksssssss",
  "kyyyyyksssmmm",
  ".kyyyykssssss",
  ".kyyyykkkksss",
  "..kyyk....kss",
  "...kk.....kss",
}
heads.jack = {}
for _, r in ipairs(jackHat) do heads.jack[#heads.jack + 1] = r end
for _, r in ipairs(jackFace) do heads.jack[#heads.jack + 1] = r end

heads.queenProfile = {
  "..........k..k..k.........",
  ".........kykkykkyk........",
  ".........kyyyyyyyk........",
  ".........kyryybyyk........",
  "........kkkkkkkkkkkk......",
  "......kkyyyyyyyyyyyyk.....",
  ".....ksskyyyyyyyyyyyyk....",
  "....kssssskkyyyyyyyyyyk...",
  "....kssssssskyyyyyyyyyk...",
  "...kskkkksssskyyyyyyyyyk..",
  "...ksswksssssskyyyyyyyyk..",
  "..kssssssssssskyyyyyyyyk..",
  ".ksssssssrrssskyyyyyyyk...",
  "kssssssssssssskyyyyyyyk...",
  ".kkssssssssssskyyyyyyk....",
  "..kmmsssssssskyyyyyykk....",
  "..kssssssssskyyyyykk......",
  "...kssssssssskkkkk........",
  "....kkkksssssk............",
  "........kssssk............",
  "........kssssk............",
}

heads.jackProfile = {
  "............kkkkkkk.......",
  ".........kkkrrrrrrrkk.....",
  ".......kkrrrrrrrrrrrrk....",
  "......krrrrrrrrrrrrrrrk...",
  ".....krrmrrmrrmrrmrrmrk...",
  ".....kbbbbbbbbbbbbbbbbbk..",
  ".....kkkkkkkkkkkkkkkkkkk..",
  "....kssssskyyyyyyyyyyk....",
  "....kssssssskyyyyyyyyyk...",
  "...kskkkksssskyyyyyyyyk...",
  "...ksswkssssskyyyyyyyyk...",
  "..ksssssssssskyyyyyyyyk...",
  ".kssssssssssskyyyyyyyyk...",
  "kssssssssssssskyyyyyyk....",
  ".kkssssssssssskyyyyykk....",
  "..kmmsssssssskkyyykk......",
  "..ksssssssssk.kkkk........",
  "...ksssssssssk............",
  "....kkkksssssk............",
  "........kssssk............",
  "........kssssk............",
}

local function inkEdge(b, isBody)
  -- outline a filled region with ink where it meets empty space
  local w, h = b.w, b.h
  local out = {}
  for y = 0, h - 1 do
    for x = 0, w - 1 do
      if isBody(get(b, x, y)) then
        if get(b, x - 1, y) == 0 or get(b, x + 1, y) == 0 or get(b, x, y - 1) == 0 then
          out[#out + 1] = y * w + x + 1
        end
      end
    end
  end
  for _, i in ipairs(out) do b[i] = C.ink end
end

local attrs = {}

function attrs.sword(f)
  rect(f, 4, 4, 9, 37, C.ink); rect(f, 5, 5, 8, 37, C.cream0); rect(f, 7, 5, 8, 37, C.blue_l)
  poly(f, { 4, 5, 6.5, 0, 9, 5 }, C.ink); set(f, 6, 3, C.cream0); set(f, 6, 4, C.cream0)
  rect(f, 1, 36, 12, 40, C.ink); rect(f, 2, 37, 11, 39, C.gold4)
  rect(f, 4, 40, 9, 47, C.ink); rect(f, 5, 40, 8, 46, C.skin); set(f, 5, 42, C.skin_d); set(f, 5, 44, C.skin_d)
  rect(f, 5, 47, 8, 51, C.red); rect(f, 4, 51, 9, 53, C.gold4)
end

function attrs.flower(f)
  rect(f, 6, 22, 7, 44, C.ink)
  rect(f, 7, 28, 10, 30, C.blue); set(f, 10, 28, 0); rect(f, 3, 33, 6, 35, C.blue); set(f, 3, 34, 0)
  rect(f, 3, 15, 10, 22, C.ink)
  set(f, 3, 15, 0); set(f, 9, 15, 0); set(f, 3, 21, 0); set(f, 9, 21, 0)
  rect(f, 4, 16, 9, 21, C.red); rect(f, 5, 17, 8, 20, C.gold4); set(f, 6, 18, C.red_d)
  set(f, 4, 16, C.red_d); set(f, 8, 16, C.red_d); set(f, 4, 20, C.red_d); set(f, 8, 20, C.red_d)
  rect(f, 3, 40, 10, 46, C.ink); rect(f, 4, 41, 9, 45, C.skin); set(f, 4, 43, C.skin_d); set(f, 6, 43, C.skin_d)
end

function attrs.halberd(f)
  rect(f, 5, 3, 9, 56, C.ink); rect(f, 6, 3, 8, 56, C.gold3)
  poly(f, { 4, 4, 7, -3, 10, 4 }, C.ink); set(f, 6, 2, C.cream0); set(f, 7, 2, C.cream0); set(f, 6, 1, C.cream0)
  poly(f, { 8, 5, 14, 3, 15, 12, 14, 19, 8, 16 }, C.ink)
  poly(f, { 9, 7, 13, 5, 14, 12, 13, 17, 9, 15 }, C.blue_l)
  rect(f, 9, 10, 11, 12, C.cream0)
  rect(f, 3, 38, 11, 44, C.ink); rect(f, 4, 39, 10, 43, C.skin); set(f, 5, 41, C.skin_d); set(f, 8, 41, C.skin_d)
end

function attrs.baton(f)
  -- hector carries a short commander's baton
  poly(f, { 2, 44, 9, 24, 12, 25, 5, 45 }, C.ink)
  poly(f, { 3.5, 43, 9.5, 26, 10.8, 26.5, 5, 44 }, C.gold4)
  rect(f, 8, 22, 13, 27, C.ink); rect(f, 9, 23, 12, 26, C.red)
  rect(f, 2, 40, 9, 46, C.ink); rect(f, 3, 41, 8, 45, C.skin); set(f, 4, 43, C.skin_d)
end

-- draw one bust into a 46x56 canvas
local function bust(spec)
  local f = L.buf(BW, 56, 0)
  local robe = L.buf(BW, 56, 0)
  poly(robe, { 0, 56, 0, 39, 6, 32, 16, 28, 30, 28, 40, 32, 46, 39, 46, 56 }, 1)
  for y = 0, 55 do
    for x = 0, BW - 1 do
      if get(robe, x, y) ~= 0 then
        local col = spec.robe
        if spec.pattern == "stripes" and ((x + y) // 3) % 2 == 0 then col = spec.robe2 end
        if spec.pattern == "dots" and x % 5 == 2 and (y + (x // 5) * 2) % 5 == 1 then col = spec.robe2 end
        if spec.pattern == "checks" and ((x // 4) + (y // 4)) % 2 == 0 then col = spec.robe2 end
        set(f, x, y, col)
      end
    end
  end
  inkEdge(f, function(v) return v ~= 0 end)
  -- collar
  local col = L.buf(BW, 56, 0)
  poly(col, { 5, 33, 16, 28, 30, 28, 41, 33, 41, 38, 30, 33, 16, 33, 5, 38 }, 1)
  for y = 0, 55 do
    for x = 0, BW - 1 do
      if get(col, x, y) ~= 0 then
        local edge = get(col, x, y + 1) == 0 or get(col, x, y - 1) == 0 or get(col, x - 1, y) == 0 or get(col, x + 1, y) == 0
        local c = spec.collar
        if spec.ermine and (x * 2 + y * 3) % 7 == 0 then c = C.ink end
        set(f, x, y, edge and C.ink or c)
      end
    end
  end
  -- centre panel
  rect(f, 19, 30, 27, 56, C.ink); rect(f, 20, 30, 26, 56, spec.panel)
  for y = 34, 55, 6 do
    set(f, 22, y, spec.gem); set(f, 23, y, spec.gem); set(f, 22, y + 1, spec.gem); set(f, 23, y + 1, spec.gem)
    set(f, 21, y, C.ink); set(f, 24, y + 1, C.ink)
  end
  -- neck
  rect(f, 19, 22, 27, 30, C.ink); rect(f, 20, 22, 26, 30, C.skin); rect(f, 20, 27, 26, 29, C.skin_d)
  local h = L.art(heads[spec.head], MAP)
  if spec.hair then
    for i = 1, h.w * h.h do if h[i] == C.gold4 then h[i] = spec.hair end end
    -- keep the crown gold: only rows below the crown band get the hair colour swapped back
    local crownRows = spec.crownRows or 0
    for y = 0, crownRows - 1 do
      for x = 0, h.w - 1 do
        if h[y * h.w + x + 1] == spec.hair then h[y * h.w + x + 1] = C.gold4 end
      end
    end
  end
  L.blit(f, h, spec.headX or 10, spec.headY or 2)
  attrs[spec.attr](f)
  return f
end

local specs = {
  { name = "LANCELOT", idx = "V", suit = "club", head = "jack", headY = 6, attr = "halberd",
    robe = C.blue, robe2 = C.blue_d, pattern = "stripes", collar = C.gold4, panel = C.red, gem = C.gold4 },
  { name = "RACHEL", idx = "D", suit = "diamond", head = "queen", headY = 4, attr = "flower",
    robe = C.red, robe2 = C.gold4, pattern = "dots", collar = C.cream0, panel = C.blue, gem = C.gold4 },
  { name = "CHARLES", idx = "R", suit = "heart", head = "king", headY = 1, attr = "sword",
    robe = C.blue, robe2 = C.gold4, pattern = "dots", collar = C.cream0, ermine = true, panel = C.gold4, gem = C.red },
  { name = "PALLAS", idx = "D", suit = "spade", head = "queenProfile", headX = 12, headY = 5, attr = "flower",
    robe = C.blue, robe2 = C.red, pattern = "checks", collar = C.gold4, panel = C.gold4, gem = C.red,
    hair = C.char2, crownRows = 4 },
  { name = "HECTOR", idx = "V", suit = "diamond", head = "jackProfile", headX = 12, headY = 5, attr = "baton",
    robe = C.red, robe2 = C.red_d, pattern = "stripes", collar = C.blue, panel = C.gold4, gem = C.blue },
}

local function buildCard(spec)
  local c = L.buf(CW, CH, 0)
  -- body: rounded cream stock with an ink edge
  for y = 0, CH - 1 do
    for x = 0, CW - 1 do
      local dx = math.max(0, 3.5 - x, x - (CW - 4.5))
      local dy = math.max(0, 3.5 - y, y - (CH - 4.5))
      local d = math.sqrt(dx * dx + dy * dy)
      if d <= 3.6 then
        local col = C.cream1
        if d > 2.6 or x == 0 or y == 0 or x == CW - 1 or y == CH - 1 then col = C.ink
        elseif x == 1 or y == 1 then col = C.cream0
        elseif x == CW - 2 or y == CH - 2 then col = C.cream2 end
        set(c, x, y, col)
      end
    end
  end
  -- figure box
  rect(c, BX - 1, BY - 1, BX + BW + 1, BY + BH + 1, C.blue_d)
  rect(c, BX, BY, BX + BW, BY + BH, C.cream0)
  local f = bust(spec)
  local slope = 0.2
  for y = 0, BH - 1 do
    for x = 0, BW - 1 do
      local edge = BH / 2 + slope * (x - BW / 2 + 0.5)
      local v
      if y + 0.5 < edge - 2 then
        v = get(f, x, y)
      elseif y + 0.5 > edge + 2 then
        v = get(f, BW - 1 - x, BH - 1 - y)
      else
        v = C.gold4
      end
      if math.abs(y + 0.5 - edge) >= 1 and math.abs(y + 0.5 - edge) < 2 then v = C.ink end
      if v ~= 0 then set(c, BX + x, BY + y, v) end
    end
  end
  local red = spec.suit == "heart" or spec.suit == "diamond"
  local ink = red and C.red or C.ink
  local decals = {}
  local function decal(g, lx, ly, color)
    decals[#decals + 1] = { g = g, lx = lx, ly = ly, color = color }
    decals[#decals + 1] = { g = L.rot180(g), lx = CW - lx, ly = CH - ly, color = color }
  end
  decal(L.font5[spec.idx], 6.5, 7.5, ink)
  decal(L.pips[spec.suit], 6.5, 17.5, ink)
  for i = 1, #spec.name do
    local g = L.rot90(L.font3[spec.name:sub(i, i)])
    decal(g, 6.5, 26.5 + 4 * (i - 1), C.ink)
  end
  local big = L.scale2x(L.scale2x(L.scale2x(c)))
  return { spec = spec, base = c, big = big, decals = decals, red = red }
end

local cards = {}
for i, s in ipairs(specs) do cards[i] = buildCard(s) end

-- draw card onto dst rotated by ang (radians, clockwise) around its centre at cx,cy.
-- returns nothing; dst gets colour indices
local function render(dst, card, ang, cx, cy)
  local cs, sn = math.cos(ang), math.sin(ang)
  local big, bw = card.big, card.big.w
  local r = 66
  local x0, x1 = math.max(0, math.floor(cx - r)), math.min(dst.w - 1, math.ceil(cx + r))
  local y0, y1 = math.max(0, math.floor(cy - r)), math.min(dst.h - 1, math.ceil(cy + r))
  for y = y0, y1 do
    local dy = y + 0.5 - cy
    for x = x0, x1 do
      local dx = x + 0.5 - cx
      local u = dx * cs + dy * sn + CW / 2
      local v = -dx * sn + dy * cs + CH / 2
      if u >= 0 and u < CW and v >= 0 and v < CH then
        local p = big[math.floor(v * 8) * bw + math.floor(u * 8) + 1]
        if p ~= 0 then dst[y * dst.w + x + 1] = p end
      end
    end
  end
  for _, d in ipairs(card.decals) do
    local a, b = d.lx - CW / 2, d.ly - CH / 2
    local sx, sy = cx + a * cs - b * sn, cy + a * sn + b * cs
    local ox, oy = math.floor(sx - d.g.w / 2 + 0.5), math.floor(sy - d.g.h / 2 + 0.5)
    for gy = 0, d.g.h - 1 do
      for gx = 0, d.g.w - 1 do
        if d.g[gy * d.g.w + gx + 1] ~= 0 then
          local px, py = ox + gx, oy + gy
          if get(dst, px, py) ~= 0 then set(dst, px, py, d.color) end
        end
      end
    end
  end
end

return { cards = cards, render = render, CW = CW, CH = CH }
