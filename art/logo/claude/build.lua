-- flambeur title logo: "rien ne va plus" reels + "la cour en feu" burning court fan
-- run: aseprite -b --script-param out=<dir>/ --script build.lua
local OUT = app.params["out"] or "./"

local W, H = 256, 144
local INTRO, IDLE = 90, 40
local P = IDLE
local WORD_Y = 74
local PIV_X, PIV_Y = 128, 158
local SPIN0, WHOOSH, SLAM = 14, 57, 72

local pc = app.pixelColor
local TAU = math.pi * 2
local floor, sin, cos, sqrt, abs, max, min = math.floor, math.sin, math.cos, math.sqrt, math.abs, math.max, math.min

local function hex(s, a)
  return pc.rgba(tonumber(s:sub(1, 2), 16), tonumber(s:sub(3, 4), 16), tonumber(s:sub(5, 6), 16), a or 255)
end
local function clamp(v, a, b) return max(a, min(b, v)) end
local function round(v) return floor(v + 0.5) end
local function easeOut(k) k = clamp(k, 0, 1); return 1 - (1 - k) ^ 3 end
local function back(k, s) k = clamp(k, 0, 1); s = s or 1.6; return 1 + (s + 1) * (k - 1) ^ 3 + s * (k - 1) ^ 2 end
local function hash(x, y, t)
  local h = (floor(x) * 374761393 + floor(y) * 668265263 + floor(t) * 1442695041) & 0xffffffff
  h = ((h ~ (h >> 13)) * 1274126177) & 0xffffffff
  h = h ~ (h >> 16)
  return (h % 10007) / 10007
end

local C = {
  ink = hex"14070a", outl = hex"5a1420",
  burgdk = hex"4a1020", burg = hex"7a1a2c", burglt = hex"9a2436",
  golddk = hex"b07a24", gold = hex"f2c14e", goldlt = hex"ffe08a",
  cream = hex"f6ecd2", white = hex"fffaf0", pale = hex"fff3c4",
  card = hex"f3e8cc", cardsh = hex"dccba4", cardedge = hex"8a7650",
  char = hex"4a2012", textsh = hex"3a0a14",
}
local FIRE = {
  {0.14, hex"fffaf0"}, {0.30, hex"ffe9a8"}, {0.46, hex"ffd166"}, {0.62, hex"f7b733"},
  {0.77, hex"f39028"}, {0.89, hex"e8661e"}, {1.01, hex"c8401a"},
}
local function fireCol(u) for _, s in ipairs(FIRE) do if u < s[1] then return s[2] end end return FIRE[#FIRE][2] end
local EMBER = { hex"f39028", hex"e8661e", hex"ffd166", hex"c8401a" }

-- ramps per glyph row (0..27)
local HOT, IVORY = {}, {}
for r = 0, 27 do
  HOT[r] = r < 2 and hex"fffaf0" or r < 6 and hex"ffe9a8" or r < 12 and hex"ffd166" or r < 18 and hex"f7b733"
    or r < 23 and hex"f39028" or r < 26 and hex"e8661e" or hex"c8401a"
  IVORY[r] = r < 6 and hex"fbf3df" or r < 18 and hex"efe3c4" or hex"d9c79c"
end

local function put(img, x, y, c)
  if x >= 0 and y >= 0 and x < img.width and y < img.height then img:drawPixel(x, y, c) end
end
local function blend(base, c, a)
  if pc.rgbaA(base) == 0 then return pc.rgba(pc.rgbaR(c), pc.rgbaG(c), pc.rgbaB(c), round(a * 255)) end
  return pc.rgba(round(pc.rgbaR(base) * (1 - a) + pc.rgbaR(c) * a), round(pc.rgbaG(base) * (1 - a) + pc.rgbaG(c) * a),
    round(pc.rgbaB(base) * (1 - a) + pc.rgbaB(c) * a), pc.rgbaA(base))
end

-- bitmap fonts
local F5 = {
  A = {".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"},
  E = {"#####", "#....", "#....", "####.", "#....", "#....", "#####"},
  F = {"#####", "#....", "#....", "####.", "#....", "#....", "#...."},
  I = {"###", ".#.", ".#.", ".#.", ".#.", ".#.", "###"},
  J = {"..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."},
  L = {"#....", "#....", "#....", "#....", "#....", "#....", "#####"},
  N = {"#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"},
  O = {".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."},
  P = {"####.", "#...#", "#...#", "####.", "#....", "#....", "#...."},
  R = {"####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"},
  S = {".####", "#....", "#....", ".###.", "....#", "....#", "####."},
  T = {"#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."},
  U = {"#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."},
  V = {"#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."},
  X = {"#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"},
  ["0"] = {".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."},
  ["1"] = {"..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."},
  ["2"] = {".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"},
  ["3"] = {"####.", "....#", "....#", ".###.", "....#", "....#", "####."},
  ["4"] = {"...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."},
  ["5"] = {"#####", "#....", "####.", "....#", "....#", "#...#", ".###."},
  ["6"] = {".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."},
  ["7"] = {"#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."},
  ["8"] = {".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."},
  ["9"] = {".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."},
}
local F3 = {
  A = {".#.", "#.#", "###", "#.#", "#.#"}, C = {"###", "#..", "#..", "#..", "###"},
  D = {"##.", "#.#", "#.#", "#.#", "##."}, E = {"###", "#..", "##.", "#..", "###"},
  G = {"###", "#..", "#.#", "#.#", "###"}, H = {"#.#", "#.#", "###", "#.#", "#.#"},
  I = {"###", ".#.", ".#.", ".#.", "###"}, L = {"#..", "#..", "#..", "#..", "###"},
  N = {"##.", "#.#", "#.#", "#.#", "#.#"}, O = {"###", "#.#", "#.#", "#.#", "###"},
  P = {"##.", "#.#", "##.", "#..", "#.."}, R = {"##.", "#.#", "##.", "#.#", "#.#"},
  S = {"###", "#..", "###", "..#", "###"}, T = {"###", ".#.", ".#.", ".#.", ".#."},
  V = {"#.#", "#.#", "#.#", "#.#", ".#."},
}
local function textW(font, s, gap)
  local w = 0
  for i = 1, #s do
    local ch = s:sub(i, i)
    if ch == " " then w = w + 2 + gap else w = w + #font[ch][1] + gap end
  end
  return w - gap
end
-- plot(x, y) per lit pixel. sy squashes vertically (card-flip), scale enlarges
local function drawText(plot, font, s, x, y, gap, sy, scale)
  sy = sy or 1; scale = scale or 1
  local h = #font["A"]
  local nh = max(1, round(h * sy))
  local y0 = y + floor((h - nh) / 2) * scale
  for i = 1, #s do
    local ch = s:sub(i, i)
    if ch == " " then
      x = x + (2 + gap) * scale
    else
      local g = font[ch]
      for j = 0, nh - 1 do
        local row = g[floor(j * h / nh) + 1]
        for c = 1, #row do
          if row:sub(c, c) == "#" then
            for a = 0, scale - 1 do for b = 0, scale - 1 do plot(x + (c - 1) * scale + a, y0 + j * scale + b) end end
          end
        end
      end
      x = x + (#g[1] + gap) * scale
    end
  end
end

-- display letters: didone-ish, 28px cap height, thick stems, hairlines, bracketed serifs
local function inR(x, y, x0, y0, x1, y1) return x >= x0 and x <= x1 and y >= y0 and y <= y1 end
local function inSeg(x, y, ax, ay, bx, by, r)
  local px, py = x + 0.5, y + 0.5
  local dx, dy = bx - ax, by - ay
  local t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1)
  local qx, qy = ax + dx * t - px, ay + dy * t - py
  return qx * qx + qy * qy <= r * r
end
local function inEll(x, y, cx, cy, rx, ry)
  local px, py = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
  return px * px + py * py <= 1
end
local function bowl(x, y, cx, cy, rx, ry, icx, icy, irx, iry)
  return x + 0.5 >= cx and inEll(x, y, cx, cy, rx, ry) and not inEll(x, y, icx, icy, irx, iry)
end
local function br(x, y, row, a, b) return y == row and (x == a or x == b) end

local GLYPH_DEF = {
  F = {19, function(x, y)
    return inR(x, y, 3, 0, 8, 27) or inR(x, y, 0, 0, 18, 1) or br(x, y, 2, 2, 2)
      or inR(x, y, 16, 2, 18, 4) or inR(x, y, 17, 5, 18, 6)
      or inR(x, y, 3, 13, 13, 14) or inR(x, y, 12, 11, 13, 16)
      or inR(x, y, 0, 26, 11, 27) or br(x, y, 25, 2, 9)
  end},
  L = {19, function(x, y)
    return inR(x, y, 3, 0, 8, 27) or inR(x, y, 0, 0, 11, 1) or br(x, y, 2, 2, 9)
      or inR(x, y, 0, 26, 18, 27) or br(x, y, 25, 2, 2)
      or inR(x, y, 16, 22, 18, 25) or inR(x, y, 17, 19, 18, 21)
  end},
  A = {24, function(x, y)
    if y > 27 then return false end
    local lx = 11.6 - 8 * (y + 0.5) / 26
    local rx = 12.4 + 7 * (y + 0.5) / 26
    return inSeg(x, y, 11.6, 0.5, 3.6, 26.5, 1.15) or inSeg(x, y, 12.4, 0.5, 19.4, 26.5, 3.0)
      or inR(x, y, 10, 0, 14, 1)
      or (y >= 17 and y <= 18 and x + 0.5 >= lx and x + 0.5 <= rx)
      or inR(x, y, 0, 26, 7, 27) or inR(x, y, 15, 26, 23, 27) or br(x, y, 25, 1, 22)
  end},
  M = {27, function(x, y)
    if y > 27 then return false end
    return inR(x, y, 3, 0, 4, 27) or inSeg(x, y, 5.5, 0.5, 13.5, 27, 3.0) or inSeg(x, y, 21.5, 0.5, 13.5, 27, 1.15)
      or inR(x, y, 20, 0, 25, 27) or inR(x, y, 0, 0, 7, 1) or inR(x, y, 19, 0, 26, 1) or br(x, y, 2, 2, 2)
      or inR(x, y, 0, 26, 7, 27) or inR(x, y, 17, 26, 26, 27) or br(x, y, 25, 2, 19)
  end},
  B = {22, function(x, y)
    if y > 27 then return false end
    return inR(x, y, 3, 0, 8, 27) or inR(x, y, 0, 0, 13, 1) or inR(x, y, 0, 26, 14, 27) or br(x, y, 2, 2, 2) or br(x, y, 25, 2, 2)
      or inR(x, y, 3, 12, 14, 13)
      or bowl(x, y, 13, 6.75, 6.5, 6.75, 12.4, 6.75, 3.6, 4.6)
      or bowl(x, y, 14, 19.75, 7.5, 8.25, 13, 19.75, 3.9, 6.1)
  end},
  E = {19, function(x, y)
    return inR(x, y, 3, 0, 8, 27) or inR(x, y, 0, 0, 18, 1) or inR(x, y, 0, 26, 18, 27) or br(x, y, 2, 2, 2) or br(x, y, 25, 2, 2)
      or inR(x, y, 16, 2, 18, 4) or inR(x, y, 17, 5, 18, 6)
      or inR(x, y, 16, 23, 18, 25) or inR(x, y, 17, 21, 18, 22)
      or inR(x, y, 3, 13, 12, 14) or inR(x, y, 11, 11, 12, 16)
  end},
  U = {23, function(x, y)
    if y > 27 then return false end
    return inR(x, y, 3, 0, 8, 19) or inR(x, y, 18, 0, 19, 19) or inR(x, y, 0, 0, 11, 1) or br(x, y, 2, 2, 9)
      or inR(x, y, 15, 0, 22, 1) or br(x, y, 2, 17, 20)
      or (y + 0.5 >= 19 and inEll(x, y, 11.5, 19, 8.5, 8.75) and not inEll(x, y, 12.6, 18.5, 5.3, 6.6))
  end},
  R = {22, function(x, y)
    if y > 27 then return false end
    return inR(x, y, 3, 0, 8, 27) or inR(x, y, 0, 0, 13, 1) or br(x, y, 2, 2, 2)
      or inR(x, y, 3, 14, 13, 15)
      or bowl(x, y, 13, 7.75, 7, 7.75, 12, 7.75, 3.8, 5.6)
      or inSeg(x, y, 11, 15.5, 18.5, 26, 2.5)
      or inR(x, y, 0, 26, 11, 27) or br(x, y, 25, 2, 9) or inR(x, y, 14, 26, 22, 27)
  end},
}
local GLYPH = {}
for k, d in pairs(GLYPH_DEF) do
  local g = {w = d[1], m = {}}
  for y = 0, 27 do
    g.m[y] = {}
    for x = 0, d[1] - 1 do if d[2](x, y) then g.m[y][x] = true end end
  end
  GLYPH[k] = g
end

local WORD = {"F", "L", "A", "M", "B", "E", "U", "R"}
local GAP = 3
local total = GAP * (#WORD - 1)
for _, k in ipairs(WORD) do total = total + GLYPH[k].w end
local WX0 = floor((W - total) / 2)
local LX = {}
do local x = WX0; for i, k in ipairs(WORD) do LX[i] = x; x = x + GLYPH[k].w + GAP end end
local function lockF(i) return 26 + 4 * (i - 1) end
local LAND = {[0] = 3, -2, 1}

-- court cards (paris pattern), 44x64, double-headed
local PAL = {k = "1b1418", y = "f2c14e", Y = "ffe08a", o = "b07a24", s = "f2c9a0", S = "d29a72", w = "fffaf0",
  n = "7a4a22", N = "3a1c0c", r = "c0392b", R = "7a1a2c", b = "2f4a8a", B = "5a7ac0", g = "8a94a6", G = "d8dee6", v = "3f7a3a"}
for k, v in pairs(PAL) do PAL[k] = hex(v) end

-- heads are left halves (template cols 11..18), mirrored. torso cols 5..18, mirrored
local KING_HEAD = {"..y..y.Y", "..yy.yyY", ".kyryyyY", ".koooooo", "knnsssss", "knnsNNss", "knnsskss",
  "knnssssS", "knnssNNN", "knnnnsNr", ".knnnnnn", "..knnnnn"}
local QUEEN_HEAD = {"........", "....yyyY", "...kyryY", "..kBbbbb", ".kBbssss", ".kbsNsss", ".kbsskss",
  ".kbssssS", ".kbsssss", ".kbbssrr", "..kbbsss", "...kbbss"}
local JACK_HEAD = {"........", "...kRRRR", "..kRRRRR", ".kyyyyyy", ".knnssss", ".knsNsss", ".knsskss",
  ".knssssS", "..ksssss", "..kssssr", "...kssss", "....ksss"}
local TORSO = {"...kwwwwwwnnnn", ".kwwwwwwwRnnnn", "kwwkwwwRrrbbnn", "kwwwwwwRyrbbbb", "kwwwwwwRrybbbb",
  "kwwwkwwRrrybbb", "kRrrrrRRrrrybb", "kRrrrrRbbrrryY", "kRrrrRbbbbrrYo"}

local SWORD = {{0, 11, "ooyyoo"}, {0, 12, "kssssk"}, {0, 13, "ksSSsk"}, {2, 14, "oo"}}
for r = 0, 10 do table.insert(SWORD, 1, {2, r, r == 0 and "GG" or "Gg"}) end
local FLOWER = {{1, 1, ".r.r."}, {1, 2, "rrYrr"}, {1, 3, "rrrrr"}, {1, 4, ".rvr."}, {1, 7, "vv"}, {4, 8, "vv"}}
for r = 5, 10 do table.insert(FLOWER, {3, r, "v"}) end
table.insert(FLOWER, {1, 11, "ksssk"}); table.insert(FLOWER, {1, 12, "kSssk"})
local HALBERD = {{3, 0, "G"}, {3, 1, "GG"}, {0, 2, "gGG"}, {0, 3, "gGGG"}, {0, 4, ".gG"}}
for r = 2, 20 do table.insert(HALBERD, {3, r, "nN"}) end
table.insert(HALBERD, {1, 12, "kssssk"}); table.insert(HALBERD, {1, 13, "kSSssk"})
table.insert(HALBERD, {24, 0, "..Yw"}); table.insert(HALBERD, {24, 1, ".Yw."}); table.insert(HALBERD, {24, 2, "Yw.."})

local PIPS = {
  heart = {".#.#.", "#####", "#####", ".###.", "..#.."},
  diamond = {"..#..", ".###.", "#####", ".###.", "..#.."},
  spade = {"..#..", ".###.", "#####", "..#..", ".###."},
  club = {".###.", ".###.", "#####", "#.#.#", "..#.."},
}

local CARD_DEFS = {
  {name = "LA HIRE", rank = "V", suit = "heart", head = JACK_HEAD, items = HALBERD, tmap = {w = "B", n = "s"}},
  {name = "ARGINE", rank = "D", suit = "club", head = QUEEN_HEAD, items = FLOWER, tmap = {n = "s"}, cmap = {r = "b", b = "r", B = "r"}},
  {name = "CHARLES", rank = "R", suit = "heart", head = KING_HEAD, items = SWORD, tmap = {}},
  {name = "PALLAS", rank = "D", suit = "spade", head = QUEEN_HEAD, items = FLOWER, tmap = {n = "s"}, cmap = {r = "v", B = "B"}},
  {name = "HECTOR", rank = "V", suit = "diamond", head = JACK_HEAD, items = HALBERD, tmap = {w = "y", n = "s"}, cmap = {r = "b", b = "v", R = "b"}},
}

local CW, CH = 44, 64
local function buildCard(def)
  local buf, top = {}, {}
  for y = 0, CH - 1 do
    for x = 0, CW - 1 do
      local ex, ey = (x == 0 or x == CW - 1), (y == 0 or y == CH - 1)
      local ex1, ey1 = (x == 1 or x == CW - 2), (y == 1 or y == CH - 2)
      local cut = (ex and ey) or (ex and ey1) or (ex1 and ey)
      if cut then
        buf[y * CW + x] = 0
      else
        local edge = ex or ey or (ex1 and ey1)
        buf[y * CW + x] = edge and C.cardedge or (hash(x, y, 3) < 0.05 and C.cardsh or C.card)
      end
    end
  end
  local function tput(x, y, c) if x >= 1 and x <= CW - 2 and y >= 1 and y <= 31 then top[y * CW + x] = c end end
  local tmap, cmap = def.tmap or {}, def.cmap or {}
  local function colorOf(ch, torso)
    if ch == "." then return nil end
    if torso and tmap[ch] then ch = tmap[ch] end
    if cmap[ch] then ch = cmap[ch] end
    return PAL[ch]
  end
  for r, row in ipairs(def.head) do
    for i = 1, #row do
      local c = colorOf(row:sub(i, i))
      if c then local col = 10 + i; tput(4 + col, 9 + r, c); tput(4 + 37 - col, 9 + r, c) end
    end
  end
  for r, row in ipairs(TORSO) do
    for i = 1, #row do
      local c = colorOf(row:sub(i, i), true)
      if c then local col = 4 + i; tput(4 + col, 21 + r, c); tput(4 + 37 - col, 21 + r, c) end
    end
  end
  for _, o in ipairs(def.items) do
    for i = 1, #o[3] do
      local c = colorOf(o[3]:sub(i, i))
      if c then tput(4 + o[1] + i - 1, 10 + o[2], c) end
    end
  end
  for x = 3, CW - 4 do tput(x, 31, C.golddk) end
  local suitCol = (def.suit == "heart" or def.suit == "diamond") and PAL.r or PAL.k
  drawText(function(x, y) tput(x, y, suitCol) end, F3, def.rank, 2, 3, 1)
  for r, row in ipairs(PIPS[def.suit]) do
    for i = 1, 5 do if row:sub(i, i) == "#" then tput(i, 8 + r, suitCol) end end
  end
  drawText(function(x, y) tput(x, y, PAL.R) end, F3, def.name, floor((CW - textW(F3, def.name, 1)) / 2), 3, 1)
  for idx, c in pairs(top) do
    local x, y = idx % CW, idx // CW
    buf[idx] = c
    buf[(CH - 1 - y) * CW + (CW - 1 - x)] = c
  end
  return buf
end

-- rotsprite-lite: scale2x three times, then nearest rotate
local function scale2x(src, w, h)
  local dst, w2 = {}, w * 2
  for y = 0, h - 1 do
    for x = 0, w - 1 do
      local p = src[y * w + x]
      local a = y > 0 and src[(y - 1) * w + x] or p
      local b = x < w - 1 and src[y * w + x + 1] or p
      local c = x > 0 and src[y * w + x - 1] or p
      local d = y < h - 1 and src[(y + 1) * w + x] or p
      local e0, e1, e2, e3 = p, p, p, p
      if c == a and c ~= d and a ~= b then e0 = a end
      if a == b and a ~= c and b ~= d then e1 = b end
      if d == c and d ~= b and c ~= a then e2 = c end
      if b == d and b ~= a and d ~= c then e3 = d end
      local o = 2 * y * w2 + 2 * x
      dst[o] = e0; dst[o + 1] = e1; dst[o + w2] = e2; dst[o + w2 + 1] = e3
    end
  end
  return dst, w * 2, h * 2
end
local function rotate(buf, w, h, ang)
  local b, bw, bh = buf, w, h
  for _ = 1, 3 do b, bw, bh = scale2x(b, bw, bh) end
  local cs, sn = cos(ang), sin(ang)
  local dw = math.ceil(abs(w * cs) + abs(h * sn)) + 2
  local dh = math.ceil(abs(w * sn) + abs(h * cs)) + 2
  local out = {}
  for dy = 0, dh - 1 do
    for dx = 0, dw - 1 do
      local x, y = dx + 0.5 - dw / 2, dy + 0.5 - dh / 2
      local sx, sy = x * cs + y * sn, -x * sn + y * cs
      local px, py = floor((sx + w / 2) * 8), floor((sy + h / 2) * 8)
      out[dy * dw + dx] = (px >= 0 and py >= 0 and px < bw and py < bh) and b[py * bw + px] or 0
    end
  end
  return out, dw, dh
end

local ANGLES = {-26, -13, 0, 13, 26}
local ORDER = {1, 5, 2, 4, 3}
local CARDS = {}
for j, def in ipairs(CARD_DEFS) do
  local buf = buildCard(def)
  local pb, pw, ph = {}, CW + 4, CH + 4
  for y = 0, ph - 1 do for x = 0, pw - 1 do
    local sx, sy = x - 2, y - 2
    pb[y * pw + x] = (sx >= 0 and sy >= 0 and sx < CW and sy < CH) and buf[sy * CW + sx] or 0
  end end
  local th = math.rad(ANGLES[j])
  local rb, dw, dh = rotate(pb, pw, ph, th)
  local cx, cy = PIV_X + 100 * sin(th), PIV_Y - 8 - 100 * cos(th)
  CARDS[j] = {buf = rb, dw = dw, dh = dh, x0 = round(cx - dw / 2), y0 = round(cy - dh / 2),
    tx = cx + 32 * sin(th), ty = cy - 32 * cos(th), E = {}, I = {}, T = {}}
end
local RANK = {}
for i, j in ipairs(ORDER) do RANK[j] = i end
local owner = {}
for _, j in ipairs(ORDER) do
  local cd = CARDS[j]
  for dy = 0, cd.dh - 1 do for dx = 0, cd.dw - 1 do
    if cd.buf[dy * cd.dw + dx] ~= 0 then owner[(cd.y0 + dy) * W + cd.x0 + dx] = j end
  end end
end
for j, cd in ipairs(CARDS) do
  local function opq(x, y) return x >= 0 and y >= 0 and x < cd.dw and y < cd.dh and cd.buf[y * cd.dw + x] ~= 0 end
  local function isEdge(x, y) return opq(x, y) and not (opq(x - 1, y) and opq(x + 1, y) and opq(x, y - 1) and opq(x, y + 1)) end
  for dy = 0, cd.dh - 1 do for dx = 0, cd.dw - 1 do
    local sx, sy = cd.x0 + dx, cd.y0 + dy
    if opq(dx, dy) and owner[sy * W + sx] == j then
      local d = sqrt((sx - cd.tx) ^ 2 + (sy - cd.ty) ^ 2)
      if isEdge(dx, dy) then
        table.insert(cd.E, {sx, sy, d})
        local above = owner[(sy - 1) * W + sx]
        if not opq(dx, dy - 1) and (above == nil or RANK[above] < RANK[j]) then table.insert(cd.T, {sx, sy, d}) end
      elseif isEdge(dx - 1, dy) or isEdge(dx + 1, dy) or isEdge(dx, dy - 1) or isEdge(dx, dy + 1) then
        table.insert(cd.I, {sx, sy, d})
      end
    end
  end end
end

-- flame column height, periodic over P frames
local function noise(x, tp)
  local t = tp / P
  local n = 0.5 + 0.28 * sin(TAU * 2 * t + x * 0.9) + 0.14 * sin(TAU * 3 * t - x * 1.7 + 1.3) + 0.08 * sin(TAU * 5 * t + x * 0.37 + 2.1)
  return clamp(n, 0, 1)
end
local function flames(img, zb, ems, tp, white)
  for _, e in ipairs(ems) do
    local x, base, h = e[1], e[2], e[3]
    for d = floor(h) - 1, 0, -1 do
      local u = d / h
      if e[4] then u = u * 0.55 end
      local y = base - d
      local sway = round(sin(TAU * tp / P + d * 0.45 + x * 0.15) * u * 1.6)
      local px = x + sway
      local idx = y * W + px
      if not (u > 0.8 and (px + y + tp) % 2 == 0) and (zb[idx] == nil or zb[idx] > u) then
        zb[idx] = u
        put(img, px, y, fireCol(u))
      end
    end
  end
end

-- background felt + sunburst arch
local BAYER = {0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5}
local FELT = {hex"1f513a", hex"19432f", hex"143826", hex"0f2c1e", hex"0b2318"}
local bgImg = Image(W, H, ColorMode.RGB)
for y = 0, H - 1 do for x = 0, W - 1 do
  local d = sqrt(((x - 128) / 150) ^ 2 + ((y - 60) / 110) ^ 2)
  local v = clamp(d, 0, 0.999) * (#FELT - 1)
  local i = floor(v)
  local c = (v - i) < (BAYER[(y % 4) * 4 + x % 4 + 1] + 0.5) / 16 and FELT[i + 1] or FELT[i + 2]
  if hash(x, y, 9) < 0.03 then c = blend(c, hex"2a6a4c", 0.5) end
  bgImg:drawPixel(x, y, c)
end end
local RAY_A, RAY_B, TRACK = hex"561a2c", hex"3a0f1c", hex"24080f"
local GLOW_A, GLOW_B = hex"8a2e24", hex"6a2020"
local AR = 138
local WEDGE = TAU / 36
local BULBS = {}
for a = -64, 64, 8 do
  local r = math.rad(a)
  table.insert(BULBS, {round(PIV_X + (AR - 0.5) * sin(r)), round(PIV_Y - (AR - 0.5) * cos(r)), a})
end
local function drawRays(img, f, tp)
  local rmax = f < INTRO and (AR - 4) * easeOut(f / 14) or AR - 4
  local glow = f >= INTRO and 1 or (f < WHOOSH and 0 or clamp((f - WHOOSH) / 6, 0, 1))
  local flick = 0.85 + 0.15 * sin(TAU * 2 * tp / P)
  if rmax < 1 then return end
  local rot = (tp / P) * 2 * WEDGE
  for y = 0, H - 1 do for x = 0, W - 1 do
    local dx, dy = x + 0.5 - PIV_X, y + 0.5 - PIV_Y
    local d = sqrt(dx * dx + dy * dy)
    -- dither the arch out toward the bottom so it never ends in a hard edge
    local fade = y > 108 and (y - 108) / 32 > (BAYER[(y % 4) * 4 + x % 4 + 1] + 0.5) / 16
    if fade then
    elseif d <= rmax then
      local a = math.atan(dx, -dy)
      local even = floor((a + rot) / WEDGE) % 2 == 0
      local c = even and RAY_A or RAY_B
      if glow > 0 then
        local g = (1 - sqrt(((x - 128) / 125) ^ 2 + ((y - 86) / 34) ^ 2)) * glow * flick
        if g > (BAYER[(y % 4) * 4 + x % 4 + 1] + 0.5) / 16 then c = even and GLOW_A or GLOW_B end
      end
      img:drawPixel(x, y, c)
    elseif f >= 12 and d <= AR + 2.5 then
      img:drawPixel(x, y, (d <= AR - 2.5 or d > AR + 1.5) and C.golddk or TRACK)
    end
  end end
  if f < 14 then return end
  local flashAll = f >= WHOOSH and f < WHOOSH + 6
  for i, b in ipairs(BULBS) do
    if b[2] < 110 and (f >= INTRO or f >= 14 + abs(i - 9) * 0.8) then
      local lit = flashAll or (i + floor(tp / 4)) % 2 == 0
      local core, arm = lit and C.white or hex"7a4a22", lit and hex"ffd166" or hex"4a2a12"
      put(img, b[1], b[2], core)
      put(img, b[1] - 1, b[2], arm); put(img, b[1] + 1, b[2], arm)
      put(img, b[1], b[2] - 1, arm); put(img, b[1], b[2] + 1, arm)
    end
  end
end

-- ribbon
local RY = 110
local function drawRibbon(img, hw, tails)
  if tails then
    for side = -1, 1, 2 do
      for y = RY + 3, RY + 16 do
        local depth = max(0, 4 - abs(y - (RY + 9.5)) * 0.6)
        local first = true
        for k = 0, 13 do
          local x = side < 0 and 56 + k or 199 - k
          if k >= depth then
            local c = C.burgdk
            if y == RY + 3 or y == RY + 16 or first then c = C.ink elseif y == RY + 4 or y == RY + 15 then c = C.golddk end
            if k >= 12 and y > RY + 13 then c = hex"2a0812" end
            put(img, x, y, c)
            first = false
          end
        end
      end
    end
  end
  local x0, x1 = 128 - hw, 128 + hw - 1
  for x = x0, x1 do
    for y = RY, RY + 13 do
      local c
      if y == RY or y == RY + 13 or x == x0 or x == x1 then c = C.ink
      elseif y == RY + 1 then c = C.gold
      elseif y == RY + 2 then c = C.burglt
      elseif y == RY + 11 then c = C.burgdk
      elseif y == RY + 12 then c = C.golddk
      else c = C.burg end
      put(img, x, y, c)
    end
  end
end
local function frenchNum(v)
  local s = tostring(v)
  local out = ""
  while #s > 3 do out = " " .. s:sub(-3) .. out; s = s:sub(1, -4) end
  return s .. out
end
local function ribbonText(img, s, col, sy, scale)
  scale = scale or 1
  local w = textW(F5, s, 1) * scale
  local x = 128 - floor(w / 2)
  local y = scale == 1 and RY + 3 or RY + 6 - 7
  if scale > 1 then
    drawText(function(px, py)
      for a = -1, 1 do for b = -1, 1 do
        local o = img:getPixel(px + a, py + b)
        if pc.rgbaR(o) ~= pc.rgbaR(col) or pc.rgbaG(o) ~= pc.rgbaG(col) then put(img, px + a, py + b, C.ink) end
      end end
    end, F5, s, x, y, 1, sy, scale)
  else
    drawText(function(px, py) put(img, px, py + 1, C.textsh) end, F5, s, x, y, 1, sy, scale)
  end
  drawText(function(px, py) put(img, px, py, col) end, F5, s, x, y, 1, sy, scale)
end

-- sparks from each locked letter to the nearest card
local SPARKS, IGN = {}, {}
for i = 1, 8 do
  local sx, sy = LX[i] + floor(GLYPH[WORD[i]].w / 2), WORD_Y - 3
  local best, bd = 1, 1e9
  for j, cd in ipairs(CARDS) do local d = abs(cd.tx - sx); if d < bd then bd = d; best = j end end
  local cd = CARDS[best]
  local f0 = lockF(i)
  table.insert(SPARKS, {sx, sy, cd.tx, cd.ty + 2, f0, 7})
  IGN[best] = min(IGN[best] or 1e9, f0 + 7)
end
local function bez(s, u)
  local mx, my = (s[1] + s[3]) / 2, min(s[2], s[4]) - 18
  local a, b = (1 - u) ^ 2, 2 * (1 - u) * u
  return a * s[1] + b * mx + u * u * s[3], a * s[2] + b * my + u * u * s[4]
end

-- build the sprite
local spr = Sprite(W, H, ColorMode.RGB)
local NAMES = {"bg", "rays", "cards", "card_fx", "fire", "word", "ribbon", "fx"}
local L = {}
L.bg = spr.layers[1]; L.bg.name = "bg"
for i = 2, #NAMES do local l = spr:newLayer(); l.name = NAMES[i]; L[NAMES[i]] = l end
for _ = 2, INTRO + IDLE do spr:newEmptyFrame() end
for i = 1, #spr.frames do spr.frames[i].duration = 0.05 end

local SHAKE = {[WHOOSH] = {2, -1}, [WHOOSH + 1] = {-2, 1}, [WHOOSH + 2] = {1, 1}, [WHOOSH + 3] = {-1, -1}, [WHOOSH + 4] = {0, 1}}

for f = 0, INTRO + IDLE - 1 do
  local idle = f >= INTRO
  local tp = (f - INTRO) % P
  local img = {}
  for i = 2, #NAMES do img[NAMES[i]] = Image(W, H, ColorMode.RGB) end

  drawRays(img.rays, f, tp)

  -- cards + shadows
  for slot, j in ipairs(ORDER) do
    local cd = CARDS[j]
    local e = 2 + (slot - 1) * 2
    if f >= e then
      local oy = idle and 0 or round((1 - back((f - e) / 10, 1.4)) * 110)
      for dy = 0, cd.dh - 1 do for dx = 0, cd.dw - 1 do
        if cd.buf[dy * cd.dw + dx] ~= 0 then
          local x, y = cd.x0 + dx + 2, cd.y0 + dy + oy + 3
          if x >= 0 and y >= 0 and x < W and y < H then img.cards:drawPixel(x, y, blend(img.cards:getPixel(x, y), C.ink, 0.45)) end
        end
      end end
      for dy = 0, cd.dh - 1 do for dx = 0, cd.dw - 1 do
        local c = cd.buf[dy * cd.dw + dx]
        if c ~= 0 then put(img.cards, cd.x0 + dx, cd.y0 + dy + oy, c) end
      end end
    end
  end

  -- burning card edges
  local czb, cems = {}, {}
  for j, cd in ipairs(CARDS) do
    local ign = IGN[j]
    if ign and f >= ign then
      local r = idle and 24 or min(24, 3 + (f - ign) * 1.6)
      local spreading = not idle and r < 24
      for _, p in ipairs(cd.I) do
        if p[3] <= r - 1.5 then put(img.card_fx, p[1], p[2], hash(p[1], p[2], 5) < 0.18 and EMBER[2] or C.char) end
      end
      for _, p in ipairs(cd.E) do
        if p[3] <= r then
          local c = EMBER[floor(hash(p[1], p[2], tp) * 4) + 1]
          if spreading and p[3] > r - 2 then c = C.pale end
          put(img.card_fx, p[1], p[2], c)
        end
      end
      for _, p in ipairs(cd.T) do
        if p[3] <= r then
          local h = 2 + 5 * (0.3 + 0.9 * noise(p[1] + j * 7.3, tp) ^ 1.6)
          table.insert(cems, {p[1], p[2] - 1, h})
        end
      end
    end
  end
  flames(img.card_fx, czb, cems, tp)

  -- word
  local front = idle and 1e9 or (f < WHOOSH and -1e9 or WX0 - 8 + (f - WHOOSH) * 48)
  local ms, mr = {}, {}
  local stateOf = {}
  for i = 1, 8 do
    local g = GLYPH[WORD[i]]
    local appear, lock = SPIN0 + (i - 1), lockF(i)
    local st
    if idle then st = "hot"
    elseif f < appear then st = nil
    elseif f < lock then st = "spin"
    else
      local k = f - lock
      st = k == 0 and "flash0" or k == 1 and "flash1" or "lit"
    end
    if st == "spin" then
      local s = (f - appear) * 11 + i * 17
      local gi = (floor(s / 32) + i) % 8 + 1
      local off = s % 32
      for pass = 0, 1 do
        local gk = WORD[(gi + pass - 1) % 8 + 1]
        local sg = GLYPH[gk]
        local gx = LX[i] + floor((g.w - sg.w) / 2)
        local gy = WORD_Y + off - 32 * pass
        for y = 0, 27 do
          local yy = gy + y
          if yy >= WORD_Y - 1 and yy <= WORD_Y + 28 then
            for x = 0, sg.w - 1 do if sg.m[y][x] then local idx = yy * W + gx + x; ms[idx] = "spin"; mr[idx] = y end end
          end
        end
      end
    elseif st then
      local dy = 0
      if not idle then dy = LAND[f - lock] or 0 end
      if f >= 80 then dy = dy + round(sin(TAU * tp / P + i * 0.8)) end
      for y = 0, 27 do for x = 0, g.w - 1 do
        if g.m[y][x] then local idx = (WORD_Y + dy + y) * W + LX[i] + x; ms[idx] = st; mr[idx] = y end
      end end
    end
  end
  -- outlines + drop shadow
  local o1, o2, sh = {}, {}, {}
  for idx in pairs(ms) do
    for _, n in ipairs({idx - 1, idx + 1, idx - W, idx + W}) do if not ms[n] then o1[n] = true end end
  end
  local function ring2(src)
    for idx in pairs(src) do
      for _, n in ipairs({idx - 1, idx + 1, idx - W, idx + W, idx - W - 1, idx - W + 1, idx + W - 1, idx + W + 1}) do
        if not ms[n] and not o1[n] then o2[n] = true end
      end
    end
  end
  ring2(ms); ring2(o1)
  for _, src in ipairs({ms, o1, o2}) do
    for idx in pairs(src) do local s = idx + 2 * W + 1; if not ms[s] and not o1[s] and not o2[s] then sh[s] = true end end
  end
  local function xy(idx) return idx % W, idx // W end
  for idx in pairs(sh) do local x, y = xy(idx); put(img.word, x, y, hex("14070a", 170)) end
  do
    local seen, frontier = {}, {}
    for _, src in ipairs({ms, o1, o2, sh}) do for idx in pairs(src) do seen[idx] = true; frontier[#frontier + 1] = idx end end
    local alphas = {140, 100, 60, 30}
    for k = 1, #alphas do
      local nxt = {}
      for _, idx in ipairs(frontier) do
        for _, n in ipairs({idx - 1, idx + 1, idx - W, idx + W}) do
          if not seen[n] then seen[n] = true; nxt[#nxt + 1] = n; local x, y = xy(n); put(img.fire, x, y, hex("14070a", alphas[k])) end
        end
      end
      frontier = nxt
    end
  end
  for idx in pairs(o2) do local x, y = xy(idx); put(img.word, x, y, C.ink) end
  for idx in pairs(o1) do local x, y = xy(idx); put(img.word, x, y, C.outl) end
  local glintK = idle and tp or -99
  local tops = {}
  for idx, st in pairs(ms) do
    local x, y = xy(idx)
    local r = mr[idx]
    local et, eb, el, er = not ms[idx - W], not ms[idx + W], not ms[idx - 1], not ms[idx + 1]
    local c
    if st == "spin" then
      c = et and hex"aab5a6" or eb and hex"56604f" or hex"7f8a7c"
    elseif st == "flash0" then c = C.white
    elseif st == "flash1" then c = C.pale
    else
      local hot = x < front
      if hot then
        local rr = r
        if r >= 18 then rr = clamp(r + round(sin(TAU * 2 * tp / P + x * 0.3)), 18, 27) end
        if el then rr = max(0, rr - 4) end
        c = HOT[rr]
        if et then c = C.white elseif eb then c = hex"9a2a14" elseif er and r > 5 then c = HOT[min(27, rr + 3)] end
        local g = (x - WX0) + (y - WORD_Y) * 0.6 - (-12 + glintK * 16)
        if glintK >= 0 and glintK <= 14 and not eb then
          if abs(g) <= 1 then c = C.white elseif abs(g) <= 2.5 then c = C.pale end
        end
      else
        c = IVORY[r]
        if et then c = C.white elseif eb then c = hex"a8946a" elseif er then c = hex"d9c79c" end
      end
      if not tops[x] or y < tops[x][1] then tops[x] = {y, hot} end
    end
    put(img.word, x, y, c)
  end
  -- word flames
  local burst = idle and 1 or (f < WHOOSH and 0 or 1 + 1.4 * max(0, 1 - (f - WHOOSH) / 20))
  local ems = {}
  for x, t in pairs(tops) do
    local b = t[2] and burst or 0.32
    local flare = (not idle) and f >= WHOOSH and x <= front and x > front - 10
    if flare then b = b * 1.8 end
    if b > 0 then
      local h = 3 + 9 * (0.25 + 0.95 * noise(x, tp) ^ 1.6) * b
      table.insert(ems, {x, t[1] + 1, h, flare})
    end
  end
  flames(img.fire, {}, ems, tp)

  -- ribbon
  local rshake = (f == SLAM or f == SLAM + 1) and 1 or 0
  if f >= 6 then
    local hw = idle and 60 or round(60 * back((f - 6) / 8, 1.2))
    if hw > 1 then drawRibbon(img.ribbon, min(hw, 64), f >= 12) end
    local function flip(a, b, f0)
      local k = f - f0
      local s = abs(cos(math.pi * k / 4))
      return k < 2 and a or b, s
    end
    if idle or f >= 84 then ribbonText(img.ribbon, "RIEN NE VA PLUS", C.cream)
    elseif f >= 80 then local s, sy = flip(frenchNum(1048576), "RIEN NE VA PLUS", 80); ribbonText(img.ribbon, s, s:sub(1, 1) == "R" and C.cream or hex"ffd166", sy)
    elseif f >= SLAM then ribbonText(img.ribbon, frenchNum(1048576), hex"ffd166", 1, f == SLAM and 2 or 1)
    elseif f >= 59 then ribbonText(img.ribbon, frenchNum(floor(1048576 * easeOut((f - 59) / 13))), C.cream)
    elseif f >= 55 then local s, sy = flip("RIEN NE VA PLUS", "0", 55); ribbonText(img.ribbon, s, C.cream, sy)
    elseif f >= 24 then ribbonText(img.ribbon, "RIEN NE VA PLUS", C.cream)
    elseif f >= 20 then local s, sy = flip("FAITES VOS JEUX", "RIEN NE VA PLUS", 20); ribbonText(img.ribbon, s, C.cream, sy)
    elseif f >= 13 then ribbonText(img.ribbon, "FAITES VOS JEUX", C.cream)
    end
  end

  -- fx: sparks, lock twinkles, slam burst, embers
  if not idle then
    for _, s in ipairs(SPARKS) do
      local k = f - s[5]
      if k >= 0 and k < s[6] then
        local u = (k + 1) / s[6]
        local trail = {C.white, C.goldlt, C.gold, hex"f39028", hex"c8401a"}
        for t = #trail, 1, -1 do
          local uu = u - (t - 1) * 0.07
          if uu > 0 then local x, y = bez(s, uu); put(img.fx, round(x), round(y), trail[t]) end
        end
        local x, y = bez(s, u); x, y = round(x), round(y)
        put(img.fx, x + 1, y, C.white); put(img.fx, x, y + 1, C.pale)
      elseif k >= s[6] and k < s[6] + 5 then
        local kk = k - s[6]
        for a = 0, 7 do
          local ang = a / 8 * TAU + s[5]
          put(img.fx, round(s[3] + cos(ang) * (kk + 1) * 1.6), round(s[4] + sin(ang) * (kk + 1) * 1.6), kk < 2 and C.pale or hex"f39028")
        end
      end
      if k >= 0 and k < 3 then
        local x, y = s[1], s[2] - 1
        local len = k == 0 and 2 or k == 1 and 4 or 1
        for d = -len, len do put(img.fx, x + d, y, C.white); put(img.fx, x, y + d, C.white) end
      end
    end
    if f >= SLAM and f < SLAM + 10 then
      local k = f - SLAM
      for i = 0, 17 do
        local a = i / 18 * TAU
        local v = 2.4 + hash(i, 1, 2) * 1.6
        local x = 128 + cos(a) * v * (k + 1) * 1.7
        local y = RY + 6 + sin(a) * v * (k + 1) * 0.9 + 0.25 * k * k
        put(img.fx, round(x), round(y), k < 3 and C.white or k < 6 and hex"ffd166" or hex"f39028")
      end
    end
  end
  if idle or f >= WHOOSH + 3 then
    for i = 1, 20 do
      local phi = hash(i, 2, 0)
      local u = (tp / P + phi) % 1
      local x0 = WX0 + hash(i, 1, 0) * total
      local x = round(x0 + sin(u * TAU * 1.5 + phi * 20) * 2.5)
      local y = round(WORD_Y - 4 - u * 46)
      if u > 0.04 then put(img.fx, x, y, u < 0.3 and C.goldlt or u < 0.55 and hex"f7b733" or u < 0.8 and hex"f39028" or hex"c8401a") end
    end
  end

  local s = SHAKE[f] or {0, 0}
  spr:newCel(L.bg, f + 1, bgImg:clone(), Point(0, 0))
  for i = 2, #NAMES do
    local n = NAMES[i]
    local oy = (n == "ribbon") and rshake or 0
    spr:newCel(L[n], f + 1, img[n], Point(s[1], s[2] + oy))
  end
end

local t1 = spr:newTag(1, INTRO); t1.name = "intro"
local t2 = spr:newTag(INTRO + 1, INTRO + IDLE); t2.name = "idle"
spr:saveAs(OUT .. "logo.aseprite")
print("ok " .. #spr.frames .. " frames, word x0=" .. WX0 .. " w=" .. total)
