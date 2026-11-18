-- flambeur logo generator. run from aseprite:
--   aseprite -b --script-param dir=<this folder> --script-param out=<logo.aseprite> --script build.lua
-- optional: --script-param preview=57,60,96  writes flattened png frames next to out instead
--
-- every frame is a pure function of its frame number (the fire is not simulated
-- forward in time), so any frame can be drawn alone and the idle loop is seamless.
local dir = app.params.dir
local L = dofile(dir .. "/lib.lua")
local T = loadfile(dir .. "/letters.lua")(L)
local C, W, H = L.C, L.W, L.H
local get, set, blit = L.get, L.set, L.blit
local floor, max, min, sin, cos, abs, sqrt = math.floor, math.max, math.min, math.sin, math.cos, math.abs, math.sqrt
local hash = L.hash

local INTRO, IDLE = 96, 48
local WORD = "FLAMBEUR"
local GAP = 3
local BASEY = 96
local ARCH = { 0, -2, -3, -4, -4, -3, -2, 0 }
local LOCK = { 15, 20, 25, 30, 35, 40, 45, 56 }
local SPIN0, HIT, WHOOSH = 3, 57, 58
local COUNT0, SLAM = 62, 82
local SETTLED = 80 -- cards stop burning further, everything after is loop-safe
local NUMY = 177
local APPRAISAL = 1048576 -- 2^20: appraisal = value x hype x 2^grade
local PAD = T.PAD

-- letter slots ---------------------------------------------------------------
local slots = {}
do
  local total = -GAP
  for i = 1, 8 do total = total + T.letters[WORD:sub(i, i)].w + GAP end
  local x = (W - total) // 2 - 1
  for i = 1, 8 do
    local l = T.letters[WORD:sub(i, i)]
    slots[i] = { l = l, x = x, y = BASEY + ARCH[i], w = l.w }
    x = x + l.w + GAP
  end
  -- reel strips: seq[0] is the letter that lands, the rest are the other letters shuffled
  for i = 1, 8 do
    local rest = {}
    for j = 1, 8 do
      if j ~= i then rest[#rest + 1] = { k = hash(i, j, 5), l = slots[j].l } end
    end
    table.sort(rest, function(a, b) return a.k < b.k end)
    local seq = { [0] = slots[i].l }
    for j = 1, 7 do seq[j] = rest[j].l end
    slots[i].seq = seq
  end
  -- the last reel teases with a B right before the R
  local s8 = slots[8].seq
  for j = 1, 7 do
    if s8[j].ch == "B" then s8[j], s8[1] = s8[1], s8[j] end
  end
end

-- which card each letter's spark flies to
local SPARK_TO = { 1, 1, 2, 3, 4, 4, 5, 5 }

-- reels -----------------------------------------------------------------------
local PITCH = 80
local LAST_V = { 26, 26, 24, 20, 16, 12, 9, 6, 4, 3 } -- last reel slows over frames 46..55

local function reelPos(i, f)
  if i < 8 then return -26 * (LOCK[i] - f), 26 end
  if f < 46 then return -146 - 26 * (46 - f), 26 end
  local p = 0
  for g = f, 55 do p = p - LAST_V[g - 45] end
  return p, LAST_V[f - 45]
end

local function blitClip(dst, src, ox, oy, yT, yB)
  for y = max(0, yT - oy), min(src.h - 1, yB - oy) do
    for x = 0, src.w - 1 do
      local v = src[y * src.w + x + 1]
      if v ~= 0 then set(dst, ox + x, oy + y, v) end
    end
  end
end

local function drawReel(buf, i, f, yT, yB)
  local s = slots[i]
  local p, v = reelPos(i, f)
  local cx = s.x + s.w / 2
  if v <= 9 then
    for j = -1, 1 do
      local g = s.seq[j % 8]
      blitClip(buf, g.gold, floor(cx - g.w / 2) - PAD, s.y + p + j * PITCH - PAD, yT, yB)
    end
    return
  end
  local step = v / 4
  for y = yT, yB do
    local soft = (y - yT < 3) or (yB - y < 3)
    for x = s.x - 2, s.x + s.w + 1 do
      local cnt = 0
      for k = 0, 3 do
        local yy = y - s.y - p + k * step
        local j = floor(yy / PITCH)
        local ly = floor(yy - j * PITCH)
        if ly < 64 then
          local g = s.seq[j % 8]
          local gx = x - floor(cx - g.w / 2)
          if gx >= 0 and gx < g.w and g.mask[ly * g.w + gx + 1] ~= 0 then cnt = cnt + 1 end
        end
      end
      local odd = (x + y) % 2 == 0
      if cnt > 0 and not (soft and odd) then
        local col
        if cnt == 4 then col = C.gold5
        elseif cnt == 3 then col = C.gold4
        elseif cnt == 2 then col = odd and C.gold3 or C.gold2
        elseif odd then col = C.gold1 end
        if col then set(buf, x, y, col) end
      end
    end
  end
end

-- fire --------------------------------------------------------------------------
-- two scrolling value-noise tiles, both periodic over the 48 frame idle loop
local N1, N2 = {}, {}
for y = 0, 95 do
  for x = 0, W - 1 do N1[y * W + x + 1] = L.vnoise(x, y, 7, 16, 11, 6) end
end
for y = 0, 63 do
  for x = 0, W - 1 do N2[y * W + x + 1] = L.vnoise(x, y, 4, 8, 23, 8) end
end

-- heat rises from src and cools by a noisy amount per pixel, which carves the tongues
local function fire(src, n, D, yTop, yBot)
  local h = L.buf(W, H, 0)
  local o1, o2 = 4 * n, 8 * n
  -- slow sideways-varying fuel so some columns burn tall and others low
  local fuel = {}
  local fr = ((6 * n) % 96) * W
  for x = 0, W - 1 do
    local a0 = N1[fr + (x * 3 + 5) % W + 1]
    fuel[x + 1] = 0.6 + 1.5 * a0
  end
  for y = yBot, yTop, -1 do
    local row, below = y * W, (y + 1) * W
    local r1 = ((y + o1) % 96) * W
    local r2 = ((y + o2) % 64) * W
    for x = 0, W - 1 do
      local a, b = N1[r1 + x + 1], N2[r2 + x + 1]
      local v = 0
      if y + 1 < H then
        local xs = x
        if b > 0.64 then xs = x + 1 elseif b < 0.36 then xs = x - 1 end
        if xs < 1 then xs = 1 elseif xs > W - 2 then xs = W - 2 end
        local i = below + xs + 1
        v = (h[i - 1] + 2 * h[i] + h[i + 1]) * 0.25 - D * (0.12 + 2.6 * a * a * a + 0.5 * b) * fuel[x + 1]
      end
      local s = src[row + x + 1]
      if s > v then v = s end
      if v < 0 then v = 0 end
      h[row + x + 1] = v
    end
  end
  return h
end

local function paintFire(buf, h, yTop, yBot)
  for y = yTop, yBot do
    for x = 0, W - 1 do
      local v = h[y * W + x + 1]
      if v > 0.05 then
        local col
        if v >= 0.80 then col = C.gold7
        elseif v >= 0.62 then col = C.fire_y
        elseif v >= 0.46 then col = C.fire_o1
        elseif v >= 0.32 then col = C.fire_o2
        elseif v >= 0.20 then col = C.fire_r
        elseif v >= 0.11 then col = C.fire_d
        elseif (x + y) % 2 == 0 then col = C.smoke end
        if col then buf[y * W + x + 1] = col end
      end
    end
  end
end

-- how tall the flames are, 1 = idle
local function flameScale(f)
  if f < WHOOSH then return 1 end
  local up = { 1.6, 2.8, 3.8, 4.4 }
  if f - WHOOSH < 4 then return up[f - WHOOSH + 1] end
  return 1 + 3.4 * math.exp(-(f - 61) / 5.5)
end

-- cards ----------------------------------------------------------------------------
-- the fan is the game's own 64x88 cards (art/cards). this script only knows their shape: the cards
-- layer is a mask of marker colors (card1..5 intact, scorch1..5 singed) plus the char and ember
-- pixels, and src/ui/logo.ts paints the real card art into it at runtime
local CW, CH = 64, 88
local PIVX, RAD = 192, 280
local PIVY = 62 + RAD
local STEP = math.rad(10.3)

local function cardPose(i, e)
  local ang = (i - 3) * STEP * e
  return ang, PIVX + RAD * sin(ang), PIVY - RAD * cos(ang)
end

local SCORCH = {}
for i = 1, 5 do SCORCH[C["card" .. i]] = C["scorch" .. i] end

-- the paper's alpha, upscaled 8x with scale2x so the rotated edge comes out clean
local paper
do
  local cards = dir .. "/../../../cards/"
  local data = json.decode(io.open(cards .. "cards.json"):read("a"))
  local box
  for _, s in ipairs(data.meta.slices) do
    if s.name == "base/paper" then box = s.keys[1].bounds end
  end
  assert(box, "cards.json has no base/paper slice")
  assert(box.w == CW and box.h == CH, "base/paper isn't 64x88 any more")
  local img = Image { fromFile = cards .. "cards.png" }
  local m = L.buf(CW, CH, 0)
  for y = 0, CH - 1 do
    for x = 0, CW - 1 do
      if app.pixelColor.rgbaA(img:getPixel(box.x + x, box.y + y)) > 0 then m[y * CW + x + 1] = 1 end
    end
  end
  paper = L.scale2x(L.scale2x(L.scale2x(m)))
end

-- card silhouette rotated by ang (radians, clockwise) around its centre at cx,cy, written as color v.
-- src/ui/logo.ts samples the card art with the exact same mapping
local function renderCard(dst, v, ang, cx, cy)
  local cs, sn = cos(ang), sin(ang)
  local bw = paper.w
  local r = 56
  local x0, x1 = max(0, floor(cx - r)), min(dst.w - 1, math.ceil(cx + r))
  local y0, y1 = max(0, floor(cy - r)), min(dst.h - 1, math.ceil(cy + r))
  for y = y0, y1 do
    local dy = y + 0.5 - cy
    for x = x0, x1 do
      local dx = x + 0.5 - cx
      local u = dx * cs + dy * sn + CW / 2
      local vv = -dx * sn + dy * cs + CH / 2
      if u >= 0 and u < CW and vv >= 0 and vv < CH and paper[floor(vv * 8) * bw + floor(u * 8) + 1] ~= 0 then
        dst[y * dst.w + x + 1] = v
      end
    end
  end
end

local settled = {}
for i = 1, 5 do
  local ang, cx, cy = cardPose(i, 1)
  local b = L.buf(W, H, 0)
  renderCard(b, C["card" .. i], ang, cx, cy)
  -- chamfer distance to the card's own edge
  local INF = 1e9
  local d = L.buf(W, H, 0)
  for k = 1, W * H do if b[k] ~= 0 then d[k] = INF end end
  for y = 1, H - 2 do
    for x = 1, W - 2 do
      local k = y * W + x + 1
      if d[k] > 0 then
        d[k] = min(d[k], d[k - 1] + 1, d[k - W] + 1, d[k - W - 1] + 1.4, d[k - W + 1] + 1.4)
      end
    end
  end
  for y = H - 2, 1, -1 do
    for x = W - 2, 1, -1 do
      local k = y * W + x + 1
      if d[k] > 0 then
        d[k] = min(d[k], d[k + 1] + 1, d[k + W] + 1, d[k + W + 1] + 1.4, d[k + W - 1] + 1.4)
      end
    end
  end
  local cs, sn = cos(ang), sin(ang)
  local function toScreen(a, bb) return cx + a * cs - bb * sn, cy + a * sn + bb * cs end
  local ix, iy = toScreen(-26, -34) -- the index corner burns less so the card stays readable
  local bf = {}
  local x0, x1, y0, y1 = W, 0, H, 0
  for y = 0, H - 1 do
    for x = 0, W - 1 do
      local k = y * W + x + 1
      if b[k] ~= 0 then
        local nz = 0.7 * L.vnoise(x, y, 11, 11, 40 + i) + 0.3 * L.vnoise(x, y, 3, 3, 60 + i)
        local keep = max(0, 9 - sqrt((x - ix) ^ 2 + (y - iy) ^ 2) / 2.5)
        bf[k] = d[k] - 14 * (nz - 0.5) + keep
        x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
      end
    end
  end
  local h1x, h1y = toScreen(-29, -19)
  local h2x, h2y = toScreen(5, -43)
  settled[i] = { buf = b, bf = bf, x0 = x0, x1 = x1, y0 = y0, y1 = y1, hits = { { h1x, h1y }, { h2x, h2y } } }
end

-- spark flights: letter i -> card, leaves at LOCK and lands 6 frames later
local FLIGHT = 6
local flights = {}
do
  local used = {}
  for i = 1, 8 do
    local c = SPARK_TO[i]
    used[c] = (used[c] or 0) + 1
    local hit = settled[c].hits[used[c]]
    local s = slots[i]
    flights[i] = { x0 = s.x + s.w / 2, y0 = s.y + 2, x1 = hit[1], y1 = hit[2], t0 = LOCK[i], card = c }
    hit.frame = LOCK[i] + FLIGHT
  end
end

local function burnLevel(c, f)
  local first = settled[c].hits[1].frame
  if f < first then return nil end
  if f >= WHOOSH then return -1.5 + 1.6 * min(1, (f - WHOOSH) / (SETTLED - WHOOSH)) end
  return -4 + 2.5 * (f - first) / (WHOOSH - first)
end

-- where each card is on frame f, { ang, cx, cy }, or false before it flies in
local function cardPoses(f)
  local out = {}
  for i = 1, 5 do
    local t = f < 12 and (f - (i - 1)) / 8 or 1
    if t <= 0 then
      out[i] = false
    else
      t = min(1, t)
      local c1, c3 = 1.70158, 2.70158
      local e = 1 + c3 * (t - 1) ^ 3 + c1 * (t - 1) ^ 2 -- ease out back
      local ang, cx, cy = cardPose(i, e)
      out[i] = { ang, cx, cy + (1 - t) ^ 3 * 90 }
    end
  end
  return out
end

local function drawCards(buf, src, f, n)
  if f < 12 then
    for i, p in ipairs(cardPoses(f)) do
      if p then renderCard(buf, C["card" .. i], p[1], p[2], p[3]) end
    end
    return
  end
  for i = 1, 5 do
    local s = settled[i]
    local lv = burnLevel(i, f)
    local b, bf = s.buf, s.bf
    for y = s.y0, s.y1 do
      for x = s.x0, s.x1 do
        local k = y * W + x + 1
        local v = b[k]
        if v ~= 0 then
          if not lv then
            buf[k] = v
          else
            local l = lv
            if f < SETTLED then
              -- the burn creeps outward from where each spark landed
              local pen = 1e9
              for _, hit in ipairs(s.hits) do
                if hit.frame and f >= hit.frame then
                  local dist = sqrt((x - hit[1]) ^ 2 + (y - hit[2]) ^ 2)
                  pen = min(pen, max(0, dist - 7 * (f - hit.frame + 1)) * 0.35)
                end
              end
              l = l - pen
            end
            local be = bf[k]
            if be < l then
              -- burnt away, whatever is underneath shows
            elseif be < l + 1.3 then
              local r = N2[((y * 3 + 8 * n) % 64) * W + x + 1]
              buf[k] = r > 0.62 and C.fire_y or (r > 0.36 and C.fire_o1 or C.fire_o2)
              src[k] = r > 0.45 and (0.16 + 0.3 * r) or 0
            elseif be < l + 3 then
              buf[k] = C.char2; src[k] = 0
            elseif be < l + 4.5 then
              buf[k] = C.char1; src[k] = 0
            elseif be < l + 7 then
              buf[k] = SCORCH[v] or v; src[k] = 0
            else
              buf[k] = v; src[k] = 0
            end
          end
        end
      end
    end
  end
end

-- wordmark ---------------------------------------------------------------------------
local function drawWordmark(buf, f, n)
  if f < SPIN0 then return end
  -- the reel window opens over a few frames
  local open = min(1, (f - SPIN0 + 1) / 4)
  local mid = BASEY + 30
  local yT, yB = floor(mid - 42 * open), floor(mid + 42 * open)
  for i = 1, 8 do
    local s = slots[i]
    if f < LOCK[i] then
      drawReel(buf, i, f, yT, yB)
    else
      local a = f - LOCK[i]
      local dy = ({ 3, -2, 1 })[a + 1] or 0
      local spr = s.l.gold
      if a == 0 or f == HIT then spr = s.l.white
      elseif a <= 2 or (f > HIT and f <= HIT + 4) then spr = s.l.hot end
      blit(buf, spr, s.x - PAD, s.y - PAD + dy)
    end
  end
  -- gold rails above and below the reels, gone once the word catches
  if f < WHOOSH then
    local half = floor(176 * open)
    for _, y in ipairs({ BASEY - 13, BASEY + 72 }) do
      for x = 192 - half, 191 + half do
        local hot = f == HIT
        set(buf, x, y - 1, C.ink); set(buf, x, y + 2, C.ink)
        set(buf, x, y, hot and C.white or C.gold5); set(buf, x, y + 1, hot and C.fire_y or C.gold2)
      end
      for _, ex in ipairs({ 192 - half - 1, 192 + half }) do
        for dy2 = -2, 3 do set(buf, ex, y + dy2, C.ink) end
      end
    end
  end
  -- idle sheen: a diagonal glint sweeps the gold once per loop
  if f >= INTRO then
    local g = n % IDLE
    if g >= 4 and g < 20 then
      local pos = -40 + (g - 4) * 30
      for y = BASEY - 6, BASEY + 66 do
        for x = 0, W - 1 do
          local k = y * W + x + 1
          local v = buf[k]
          if v >= C.gold1 and v <= C.gold6 or v == C.fire_o1 then
            local dd = x + (y - BASEY) * 0.5 - pos
            if dd >= 0 and dd < 5 then buf[k] = C.white
            elseif dd >= -3 and dd < 9 and v < C.gold6 then buf[k] = C.gold6 end
          end
        end
      end
    end
  end
end

-- number and croupier line -------------------------------------------------------------
local function fmt(v)
  local s = tostring(v)
  local out = ""
  for i = 1, #s do
    out = out .. s:sub(i, i)
    local left = #s - i
    if left > 0 and left % 3 == 0 then out = out .. " " end
  end
  return out
end

-- returns a small buffer with the number, outlined and shadowed
local function numberSprite(str, style)
  local w = 0
  for i = 1, #str do w = w + (str:sub(i, i) == " " and 6 or 12) end
  w = w - 2
  local m = L.buf(w, 16, 0)
  local x = 0
  for i = 1, #str do
    local ch = str:sub(i, i)
    if ch == " " then x = x + 6 else L.stamp(m, L.digits[ch], x, 0, 1); x = x + 12 end
  end
  local out = L.buf(w + 4, 16 + 5, 0)
  local ramp
  if style == "count" then
    ramp = { C.gold7, C.gold6, C.gold6, C.gold5, C.gold5, C.gold5, C.gold5, C.gold4, C.gold4, C.gold4, C.gold4, C.gold3, C.gold3, C.gold3, C.gold2, C.gold2 }
  elseif style == "white" then
    ramp = {}
    for i = 1, 16 do ramp[i] = C.white end
  else
    ramp = { C.white, C.cream0, C.cream0, C.cream0, C.cream1, C.cream1, C.cream1, C.cream1, C.cream1, C.cream1, C.cream2, C.cream2, C.cream2, C.cream2, C.cream3, C.cream3 }
  end
  -- shadow, outline, face
  for y = 0, 15 do
    for xx = 0, w - 1 do
      if get(m, xx, y) ~= 0 then
        for dy = -1, 1 do
          for dx = -1, 1 do set(out, xx + 1 + dx, y + 1 + dy, C.ink) end
        end
        set(out, xx + 2, y + 3, C.ink); set(out, xx + 3, y + 3, C.ink); set(out, xx + 3, y + 4, C.ink)
      end
    end
  end
  for y = 0, 15 do
    for xx = 0, w - 1 do
      if get(m, xx, y) ~= 0 then
        set(out, xx + 2, y + 2, C.bur2)
      end
    end
  end
  for y = 0, 15 do
    for xx = 0, w - 1 do
      if get(m, xx, y) ~= 0 then
        local col = ramp[y + 1]
        if style ~= "white" and get(m, xx + 1, y) == 0 and get(m, xx, y + 1) == 0 then col = ramp[min(16, y + 4)] end
        set(out, xx + 1, y + 1, col)
      end
    end
  end
  return out
end

local function outlinedText(buf, font, str, cx, y, color, gap)
  local w = L.textWidth(font, str, gap)
  local x = floor(cx - w / 2)
  for dy = -1, 1 do
    for dx = -1, 1 do L.text(buf, font, str, x + dx, y + dy, C.ink, gap) end
  end
  L.text(buf, font, str, x, y + 1, C.ink, gap)
  L.text(buf, font, str, x, y, color, gap)
  return x, w
end

local function pip(buf, name, x, y, color)
  local g = L.pips[name]
  for dy = -1, 1 do
    for dx = -1, 1 do L.stamp(buf, g, x + dx, y + dy, C.ink) end
  end
  L.stamp(buf, g, x, y, color)
end

local CALL = "RIEN NE VA PLUS"

local function drawNumber(buf, f)
  if f >= 5 and f <= HIT + 3 then
    local shown = min(#CALL, (f - 4) * 2)
    local str = CALL:sub(1, shown) .. string.rep(" ", 0)
    -- keep the line centred on its final width while it types
    local w = L.textWidth(L.font5, CALL, 2)
    local x = floor(192 - w / 2)
    local tmp = L.buf(W, H, 0)
    for dy = -1, 1 do
      for dx = -1, 1 do L.text(tmp, L.font5, str, x + dx, NUMY + 4 + dy, C.ink, 2) end
    end
    local col = C.cream1
    if f == HIT then col = C.white elseif f == HIT + 1 then col = C.fire_y elseif f == HIT + 2 then col = C.fire_o2 elseif f == HIT + 3 then col = C.fire_r end
    L.text(tmp, L.font5, str, x, NUMY + 4, col, 2)
    if shown == #CALL and f <= HIT then
      for _, sx in ipairs({ x - 12, x + w + 6 }) do
        pip(tmp, "diamond", sx, NUMY + 4, C.gold4)
      end
    end
    -- burning away: more of the line drops out each frame
    local drop = ({ 0, 0.3, 0.6, 0.85 })[f - HIT + 1] or 0
    for k = 1, W * H do
      if tmp[k] ~= 0 then
        local x2, y2 = (k - 1) % W, (k - 1) // W
        if hash(x2, y2 - (f - HIT) * 2, 9) >= drop then
          set(buf, x2, y2 - max(0, f - HIT - 1) * 2, tmp[k])
        end
      end
    end
    return
  end
  if f < COUNT0 then return end
  local value
  if f < SLAM then
    local t = (f - COUNT0 + 1) / (SLAM - COUNT0)
    value = floor(APPRAISAL * t ^ 3)
  else
    value = APPRAISAL
  end
  local style = f < SLAM and "count" or (f == SLAM and "white" or "rest")
  local spr = numberSprite(fmt(value), style)
  if f == SLAM then
    -- one frame of overshoot: the number lands twice as big, then snaps to size
    local big = L.buf(spr.w * 2, spr.h * 2, 0)
    for y = 0, big.h - 1 do
      for x = 0, big.w - 1 do big[y * big.w + x + 1] = spr[(y // 2) * spr.w + (x // 2) + 1] end
    end
    blit(buf, big, 192 - big.w // 2, NUMY + 8 - big.h // 2)
    return
  end
  blit(buf, spr, 192 - spr.w // 2, NUMY - 1)
  if f > SLAM then
    -- rules and pips shoot out from the number once it lands
    local grow = min(1, (f - SLAM) / 5)
    local half = spr.w // 2 + 8
    local len = floor(86 * (1 - (1 - grow) ^ 3))
    for side = -1, 1, 2 do
      for d = 22, max(22, len) do
        local x = 192 + side * (half + d) - (side == 1 and 1 or 0)
        if d < len then
          set(buf, x, NUMY + 6, C.ink); set(buf, x, NUMY + 7, C.gold4); set(buf, x, NUMY + 8, C.gold2); set(buf, x, NUMY + 9, C.ink)
        end
      end
      if len > 24 then
        local xe = 192 + side * (half + len)
        for dy = 6, 9 do set(buf, xe, NUMY + dy, C.ink); set(buf, 192 + side * (half + 21) - (side == 1 and 0 or 1), NUMY + dy, C.ink) end
      end
    end
    if f >= SLAM + 2 then
      pip(buf, "spade", 192 - half - 18, NUMY + 4, C.cream1)
      pip(buf, "heart", 192 - half - 9, NUMY + 4, C.red)
      pip(buf, "diamond", 192 + half + 2, NUMY + 4, C.red)
      pip(buf, "club", 192 + half + 11, NUMY + 4, C.cream1)
    end
    if grow >= 1 then
      pip(buf, "diamond", 192 - half - 86 - 8, NUMY + 4, C.gold4)
      pip(buf, "diamond", 192 + half + 86 + 1, NUMY + 4, C.gold4)
    end
  end
end

-- fx: sparks, embers, glints -------------------------------------------------------------
local function line(buf, xa, ya, xb, yb, col)
  local steps = max(abs(xb - xa), abs(yb - ya), 1)
  for s = 0, floor(steps) do
    local t = s / steps
    set(buf, floor(xa + (xb - xa) * t + 0.5), floor(ya + (yb - ya) * t + 0.5), col)
  end
end

local HEAT_RAMP = { C.white, C.gold7, C.fire_y, C.fire_o1, C.fire_o2, C.fire_r, C.fire_d }
local function heatCol(t)
  return HEAT_RAMP[min(#HEAT_RAMP, 1 + floor(t * #HEAT_RAMP))]
end

-- a burst of sparks: deterministic from its seed
local function burst(buf, f, t0, x, y, count, seed, speed, lifeMax, up)
  local a = f - t0
  if a < 0 or a > lifeMax then return end
  for k = 1, count do
    local life = lifeMax * (0.5 + 0.5 * hash(k, 1, seed))
    if a <= life then
      local ang = hash(k, 2, seed) * math.pi * 2
      local sp = speed * (0.4 + 0.6 * hash(k, 3, seed))
      local vx, vy = cos(ang) * sp, sin(ang) * sp * 0.8 - up
      local function pos(t) return x + vx * t * (1 - 0.03 * t), y + vy * t + 0.22 * t * t end
      local xa, ya = pos(max(0, a - 0.7))
      local xb, yb = pos(a)
      line(buf, xa, ya, xb, yb, heatCol(a / life))
    end
  end
end

local function flightPos(fl, t)
  local mx, my = (fl.x0 + fl.x1) / 2, min(fl.y0, fl.y1) - 26
  local u = 1 - t
  return u * u * fl.x0 + 2 * u * t * mx + t * t * fl.x1, u * u * fl.y0 + 2 * u * t * my + t * t * fl.y1
end

local function star(buf, x, y, r, col)
  set(buf, x, y, C.white)
  for d = 1, r do
    set(buf, x + d, y, col); set(buf, x - d, y, col); set(buf, x, y + d, col); set(buf, x, y - d, col)
  end
end

-- gold glints during idle: { frame in loop, slot, dx, dy }
local GLINTS = { { 24, 1, 29, 3 }, { 30, 4, 8, 2 }, { 36, 6, 30, 4 }, { 41, 8, 26, 9 }, { 27, 3, 20, 2 } }

local function drawFx(buf, f, n)
  for i = 1, 8 do
    local s = slots[i]
    local fl = flights[i]
    -- lock: sparks off the top of the letter
    burst(buf, f, LOCK[i], s.x + s.w / 2, s.y + 4, 9, 100 + i, 4.2, 7, 2.2)
    -- the spark that flies to the card, with a short trail
    local a = f - fl.t0
    if a >= 1 and a <= FLIGHT then
      for tr = 3, 0, -1 do
        local t = (a - tr * 0.35) / FLIGHT
        if t > 0 then
          local x, y = flightPos(fl, min(1, t))
          x, y = floor(x + 0.5), floor(y + 0.5)
          if tr == 0 then
            star(buf, x, y, 2, C.fire_y)
          else
            set(buf, x, y, heatCol(0.2 + tr * 0.2)); set(buf, x + 1, y, heatCol(0.3 + tr * 0.2))
          end
        end
      end
    end
    burst(buf, f, fl.t0 + FLIGHT, fl.x1, fl.y1, 6, 200 + i, 2.6, 5, 0.8)
  end
  -- the whoosh throws embers off the whole word
  for k = 1, 46 do
    local t0 = WHOOSH + floor(hash(k, 1, 7) * 4)
    local a = f - t0
    local life = 9 + hash(k, 2, 7) * 16
    if a >= 0 and a <= life then
      local x0 = 24 + hash(k, 3, 7) * 336
      local y0 = BASEY - 4 + hash(k, 4, 7) * 30
      local vx = (hash(k, 5, 7) - 0.5) * 3
      local vy = -(3 + hash(k, 6, 7) * 7)
      local function pos(t) return x0 + vx * t, y0 + vy * t * (1 - 0.018 * t) end
      local xa, ya = pos(max(0, a - 0.6))
      local xb, yb = pos(a)
      line(buf, xa, ya, xb, yb, heatCol(a / life))
    end
  end
  -- number slam: sparks kick out sideways
  burst(buf, f, SLAM + 1, 140, NUMY + 8, 8, 301, 5, 6, 1.2)
  burst(buf, f, SLAM + 1, 244, NUMY + 8, 8, 302, 5, 6, 1.2)
  -- looping embers
  for k = 1, 20 do
    local a = (n + floor(hash(k, 1, 3) * 48)) % 48
    local life = 18 + floor(hash(k, 2, 3) * 22)
    if a < life and (f >= INTRO or f - a >= 55) and hash(k, a, 4) > 0.12 then
      local x = 30 + hash(k, 3, 3) * 324 + 3 * sin(a * 0.35 + k) + (hash(k, 5, 3) - 0.5) * a * 0.5
      local y = BASEY - 22 + hash(k, 4, 3) * 26 - (0.9 + hash(k, 6, 3) * 1.1) * a
      local col = heatCol(0.3 + 0.7 * a / life)
      set(buf, floor(x), floor(y), col)
      if hash(k, 7, 3) > 0.6 and a < life * 0.5 then set(buf, floor(x), floor(y) - 1, col) end
    end
  end
  if f >= INTRO then
    local g = n % IDLE
    for _, gl in ipairs(GLINTS) do
      local a = g - gl[1]
      if a >= 0 and a < 5 then
        local s = slots[gl[2]]
        star(buf, s.x + gl[3], s.y + gl[4], ({ 1, 2, 3, 2, 1 })[a + 1], C.gold7)
      end
    end
  end
end

-- felt ---------------------------------------------------------------------------------------
local BAYER = { 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 }
local FELT_RAMP = { C.felt0, C.felt1, C.felt2, C.felt3, C.felt4 }
local feltBase = {}
for y = 0, H - 1 do
  for x = 0, W - 1 do
    local dx, dy = (x - W / 2) / (W * 0.62), (y - H * 0.48) / (H * 0.7)
    feltBase[y * W + x + 1] = 2.75 - 2.4 * (dx * dx + dy * dy) ^ 0.75
  end
end

-- the table: dithered vignette, firelight on the felt, and drop shadows under cards and letters.
-- this layer only makes sense on the felt, the game composites the other layers on its own table
local function drawFelt(f, n, cards, word)
  local felt = L.buf(W, H, 0)
  local lit = 0
  for i = 1, 8 do if f > LOCK[i] then lit = lit + 0.05 end end
  if f >= WHOOSH then
    lit = min(1.5, 0.55 + 0.3 * (flameScale(f) - 1)) + 0.05 * sin(n * math.pi / 8)
  end
  for y = 0, H - 1 do
    for x = 0, W - 1 do
      local k = y * W + x + 1
      local v = feltBase[k]
      if lit > 0 then
        local gx, gy = (x - 192) / 215, (y - (BASEY + 14)) / 108
        local r2 = gx * gx + gy * gy
        if r2 < 1 then v = v + lit * (1 - r2) ^ 1.5 * 1.7 end
      end
      if x >= 3 and y >= 5 then
        if cards[k - 4 * W - 3] ~= 0 or word[k - 5 * W - 2] ~= 0 then v = v - 1.4 end
      end
      v = v + (BAYER[(y % 4) * 4 + (x % 4) + 1] / 16 - 0.5) * 0.9
      felt[k] = FELT_RAMP[max(1, min(5, floor(v + 0.5) + 1))]
    end
  end
  return felt
end

-- frame composition ----------------------------------------------------------------------------
local SHAKE = {
  [58] = { 3, -2 }, [59] = { -3, 2 }, [60] = { 2, 2 }, [61] = { -2, -1 }, [62] = { 1, 1 }, [63] = { -1, 0 }, [64] = { 1, 0 },
  [83] = { 0, 3 }, [84] = { -2, -2 }, [85] = { 1, 1 }, [86] = { 0, -1 },
}
for i = 1, 8 do SHAKE[LOCK[i]] = { 0, 1 } end

local function shifted(b, dx, dy)
  if dx == 0 and dy == 0 then return b end
  local o = L.buf(W, H, 0)
  blit(o, b, dx, dy)
  return o
end

local LAYERS = { "cards", "fire_back", "wordmark", "fire_front", "number", "fx" }

-- g is the global frame: 0..95 intro, 96..143 idle
local function renderFrame(g)
  local f = g
  local n = g -- noise clock, 48-periodic so idle wraps cleanly
  local out = {}
  for _, name in ipairs(LAYERS) do out[name] = L.buf(W, H, 0) end
  local src = L.buf(W, H, 0)
  drawCards(out.cards, src, f, n)
  -- letters feed the fire once they lock: a pilot flame first, full heat after the whoosh
  local srcFront = L.buf(W, H, 0)
  local any = false
  for i = 1, 8 do
    if f > LOCK[i] then
      any = true
      local s = slots[i]
      local heat = f >= WHOOSH and 1 or 0.36
      local m = s.l.mask
      for y = 0, 63 do
        for x = 0, s.w - 1 do
          if m[y * s.w + x + 1] ~= 0 then
            src[(s.y + y) * W + s.x + x + 1] = heat
            if y >= 59 then srcFront[(s.y + y) * W + s.x + x + 1] = f >= WHOOSH and 0.5 or 0.2 end
          end
        end
      end
    end
  end
  local scale = flameScale(f)
  if any or f >= 21 then
    local h = fire(src, n, 1 / (21 * scale), 0, BASEY + 66)
    paintFire(out.fire_back, h, 0, BASEY + 66)
  end
  if any then
    local h2 = fire(srcFront, n + 24, 1 / (11 * min(scale, 1.8)), BASEY + 20, BASEY + 66)
    -- only the flame itself goes in front, not the hot core sitting on the letter feet
    for y = BASEY + 20, BASEY + 66 do
      for x = 0, W - 1 do
        local k = y * W + x + 1
        if srcFront[k] > 0 and h2[k] <= srcFront[k] then h2[k] = 0 end
      end
    end
    paintFire(out.fire_front, h2, BASEY + 20, BASEY + 66)
  end
  drawWordmark(out.wordmark, f, n)
  drawNumber(out.number, f)
  drawFx(out.fx, f, n)
  local sh = SHAKE[f]
  if sh then
    for _, name in ipairs(LAYERS) do out[name] = shifted(out[name], sh[1], sh[2]) end
  end
  out.felt = drawFelt(f, n, out.cards, out.wordmark)
  return out
end

local function duration(g)
  if g == HIT then return 0.16 end
  if g == SLAM then return 0.13 end
  if g == LOCK[8] then return 0.09 end
  return 0.06
end

-- output -------------------------------------------------------------------------------------------
if app.params.preview then
  for num in app.params.preview:gmatch("%d+") do
    local g = tonumber(num)
    local fr = renderFrame(g)
    local flat = L.buf(W, H, 0)
    blit(flat, fr.felt, 0, 0)
    for _, name in ipairs(LAYERS) do blit(flat, fr[name], 0, 0) end
    local spr = Sprite(W, H, ColorMode.INDEXED)
    spr:setPalette(L.palette())
    spr.cels[1].image = L.toImage(flat)
    spr:saveCopyAs(app.params.out .. "/prev_" .. string.format("%03d", g) .. ".png")
    spr:close()
  end
  return
end

local spr = Sprite(W, H, ColorMode.INDEXED)
spr:setPalette(L.palette())
spr.transparentColor = 0
local layers = {}
spr.layers[1].name = "felt"
layers.felt = spr.layers[1]
for _, name in ipairs(LAYERS) do
  local ly = spr:newLayer()
  ly.name = name
  layers[name] = ly
end
for g = 0, INTRO + IDLE - 1 do
  if g > 0 then spr:newEmptyFrame(g + 1) end
  spr.frames[g + 1].duration = duration(g)
  local fr = renderFrame(g)
  if g == 0 then
    spr.cels[1].image = L.toImage(fr.felt)
  else
    spr:newCel(layers.felt, g + 1, L.toImage(fr.felt), Point(0, 0))
  end
  for _, name in ipairs(LAYERS) do
    spr:newCel(layers[name], g + 1, L.toImage(fr[name]), Point(0, 0))
  end
end
-- fan.json: every frame's card poses with the shake added, so the game can paint the real cards
-- exactly where the mask has them
local fan = { cw = CW, ch = CH, frames = {} }
for g = 0, INTRO + IDLE - 1 do
  local sh = SHAKE[g] or { 0, 0 }
  local poses = {}
  for i, p in ipairs(cardPoses(g)) do
    poses[i] = p and { p[1], p[2] + sh[1], p[3] + sh[2] } or json.decode("null")
  end
  fan.frames[g + 1] = poses
end
local fanPath = app.params.out:gsub("[^/]*$", "") .. "fan.json"
local fh = io.open(fanPath, "w")
fh:write(json.encode(fan))
fh:close()

local t1 = spr:newTag(1, INTRO); t1.name = "intro"
local t2 = spr:newTag(INTRO + 1, INTRO + IDLE); t2.name = "idle"
spr:saveAs(app.params.out)
print("saved " .. app.params.out)
