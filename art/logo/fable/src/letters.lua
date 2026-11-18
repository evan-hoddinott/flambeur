-- hand-built latin (wedge serif) capitals for the wordmark, 64px cap height.
-- each letter is a 1-bit mask made from a few rects, polys and half ellipses,
-- then shaded: gold leaf face, bevel, burgundy extrude, ink outline.
local L = ...
local C = L.C
local rect, poly, ell = L.rect, L.poly, L.ell

local CAP = 64
local PAD = 3 -- room for the outline and halo, the extrude adds more on the right/bottom
local EXT = 3

local function foot(m, xa, xb, left, right)
  if left ~= false then
    rect(m, xa - 4, 61, xa, 64, 1); poly(m, { xa - 4, 61, xa, 61, xa, 54 }, 1)
  end
  if right ~= false then
    rect(m, xb, 61, xb + 4, 64, 1); poly(m, { xb, 54, xb, 61, xb + 4, 61 }, 1)
  end
end

local function head(m, xa, xb, left, right)
  if left ~= false then
    rect(m, xa - 4, 0, xa, 3, 1); poly(m, { xa - 4, 3, xa, 3, xa, 10 }, 1)
  end
  if right ~= false then
    rect(m, xb, 0, xb + 4, 3, 1); poly(m, { xb, 3, xb + 4, 3, xb, 10 }, 1)
  end
end

local defs = {}

defs.F = { w = 35, draw = function(m)
  rect(m, 5, 0, 17, 64, 1); foot(m, 5, 17); head(m, 5, 17, true, false)
  rect(m, 17, 0, 28, 7, 1); poly(m, { 27, 0, 34, 0, 34, 21, 27, 7 }, 1)
  rect(m, 17, 28, 25, 35, 1); poly(m, { 25, 28, 29, 20, 29, 43, 25, 35 }, 1)
end }

defs.L = { w = 35, draw = function(m)
  rect(m, 5, 0, 17, 64, 1); head(m, 5, 17); foot(m, 5, 17, true, false)
  rect(m, 17, 57, 28, 64, 1); poly(m, { 27, 64, 34, 64, 34, 43, 27, 57 }, 1)
end }

defs.E = { w = 35, draw = function(m)
  rect(m, 5, 0, 17, 64, 1); foot(m, 5, 17, true, false); head(m, 5, 17, true, false)
  rect(m, 17, 0, 28, 7, 1); poly(m, { 27, 0, 34, 0, 34, 20, 27, 7 }, 1)
  rect(m, 17, 28, 25, 35, 1); poly(m, { 25, 28, 29, 21, 29, 42, 25, 35 }, 1)
  rect(m, 17, 57, 28, 64, 1); poly(m, { 27, 64, 34, 64, 34, 44, 27, 57 }, 1)
end }

defs.A = { w = 44, draw = function(m)
  poly(m, { 17, 0, 27, 0, 40, 64, 28, 64 }, 1) -- thick right stroke
  poly(m, { 17, 0, 22, 0, 9, 64, 4, 64 }, 1)   -- thin left stroke
  rect(m, 11, 40, 32, 46, 1)                    -- crossbar
  -- clear what the crossbar pokes outside the strokes
  poly(m, { 0, 40, 9, 40, 7, 47, 0, 47 }, 0)
  rect(m, 0, 61, 13, 64, 1); poly(m, { 0, 61, 5, 61, 5, 55 }, 1); poly(m, { 8, 61, 13, 61, 8, 55 }, 1)
  rect(m, 24, 61, 44, 64, 1); poly(m, { 24, 61, 29, 61, 29, 55 }, 1); poly(m, { 39, 61, 44, 61, 39, 55 }, 1)
end }

defs.M = { w = 52, draw = function(m)
  rect(m, 6, 0, 12, 64, 1)                       -- thin left stem
  poly(m, { 7, 0, 20, 0, 33, 56, 21, 56 }, 1)   -- thick diagonal
  -- trim the thick diagonal where it passes the thin one
  poly(m, { 41, 0, 52, 0, 52, 64, 23, 64 }, 0)
  poly(m, { 36, 0, 41, 0, 26, 56, 21, 56 }, 1)  -- thin diagonal
  rect(m, 34, 0, 46, 64, 1)                      -- thick right stem
  head(m, 6, 12, true, false); head(m, 34, 46, false, true)
  foot(m, 6, 12); foot(m, 34, 46)
end }

defs.B = { w = 38, draw = function(m)
  rect(m, 5, 0, 17, 64, 1)
  rect(m, 5, 0, 22, 32, 1); ell(m, 22, 16, 11, 16, 1, "r")
  rect(m, 5, 27, 23, 64, 1); ell(m, 23, 45.5, 13, 18.5, 1, "r")
  rect(m, 17, 7, 21, 26, 0); ell(m, 21, 16.5, 3, 9.5, 0, "r")
  rect(m, 17, 33, 22, 57, 0); ell(m, 22, 45, 4, 12, 0, "r")
  head(m, 5, 17, true, false); foot(m, 5, 17, true, false)
end }

defs.U = { w = 42, draw = function(m)
  rect(m, 5, 0, 17, 44, 1); rect(m, 31, 0, 37, 44, 1)
  ell(m, 21, 44, 16, 20, 1, "b")
  ell(m, 24, 44, 7, 13, 0, "b")
  head(m, 5, 17); head(m, 31, 37)
end }

defs.R = { w = 45, draw = function(m)
  rect(m, 5, 0, 17, 64, 1); foot(m, 5, 17); head(m, 5, 17, true, false)
  rect(m, 5, 0, 22, 36, 1); ell(m, 22, 18, 12, 18, 1, "r")
  rect(m, 17, 7, 21, 29, 0); ell(m, 21, 18, 3, 11, 0, "r")
  poly(m, { 17, 34, 28, 34, 41, 64, 29, 64 }, 1) -- leg
  rect(m, 27, 61, 45, 64, 1); poly(m, { 40, 61, 45, 61, 40, 55 }, 1)
end }

-- vertical gold ramp: bright top, a dark "horizon", then fire-lit bottom
local function rampAt(y)
  local c = C
  local bands = {
    { 0, c.gold6 }, { 5, c.gold5 }, { 17, c.gold4 }, { 29, c.gold3 }, { 37, c.gold1 },
    { 42, c.gold2 }, { 48, c.gold3 }, { 55, c.gold4 }, { 61, c.gold5 },
  }
  local cur, nxt, nextY = bands[1][2], nil, nil
  for i, b in ipairs(bands) do
    if y >= b[1] then
      cur = b[2]
      nxt = bands[i + 1] and bands[i + 1][2]; nextY = bands[i + 1] and bands[i + 1][1]
    end
  end
  return cur, nxt, nextY
end

-- shade a mask into a sprite. mode: "gold" (normal), "hot" (just locked), "white" (flash)
local function shade(m, mode)
  local w, h = m.w + PAD * 2 + EXT, m.h + PAD * 2 + EXT
  local out = L.buf(w, h, 0)
  local get = L.get
  local function inside(x, y) return get(m, x, y) ~= 0 end
  -- extrude + outline first
  local solid = L.buf(w, h, 0)
  for y = 0, m.h - 1 do
    for x = 0, m.w - 1 do
      if inside(x, y) then
        for k = 0, EXT do L.set(solid, x + PAD + k, y + PAD + k, k == 0 and 1 or 2) end
      end
    end
  end
  -- face pixels stay 1 even where a shifted copy lands
  for y = 0, m.h - 1 do
    for x = 0, m.w - 1 do
      if inside(x, y) then L.set(solid, x + PAD, y + PAD, 1) end
    end
  end
  for y = 0, h - 1 do
    for x = 0, w - 1 do
      local s = get(solid, x, y)
      if s == 0 then
        local near = false
        for dy = -1, 1 do
          for dx = -1, 1 do
            if get(solid, x + dx, y + dy) ~= 0 then near = true end
          end
        end
        if near then
          L.set(out, x, y, C.ink)
        else
          -- second ring: a dark halo so the gold never sits straight on the fire
          local far = false
          for dy = -2, 2 do
            for dx = -2, 2 do
              if (math.abs(dx) + math.abs(dy) < 4) and get(solid, x + dx, y + dy) ~= 0 then far = true end
            end
          end
          if far then L.set(out, x, y, mode == "white" and C.fire_o1 or C.ink2) end
        end
      elseif s == 2 then
        -- side of the block: lighter where it faces down, darker at the far edge
        local deep = get(solid, x + 1, y + 1) == 0
        L.set(out, x, y, deep and C.bur1 or C.bur2)
        if mode == "white" then L.set(out, x, y, C.fire_o1) end
        if mode == "hot" then L.set(out, x, y, deep and C.bur2 or C.bur3) end
      end
    end
  end
  for y = 0, m.h - 1 do
    for x = 0, m.w - 1 do
      if inside(x, y) then
        local col
        if mode == "white" then
          col = C.white
        else
          local cur, nxt, nextY = rampAt(y)
          col = cur
          -- one dithered row before each band change
          if nxt and (nextY - y == 1 or nextY - y == 2) and (x + y) % 2 == 0 then col = nxt end
          if nxt and nextY - y == 1 and (x + y) % 2 == 1 and nxt ~= C.gold1 then col = nxt end
          -- chiselled facets: which edge is nearest decides if this pixel faces the light
          local l, r, u, d = 0, 0, 0, 0
          while inside(x - l - 1, y) do l = l + 1 end
          while inside(x + r + 1, y) do r = r + 1 end
          while inside(x, y - u - 1) do u = u + 1 end
          while inside(x, y + d + 1) do d = d + 1 end
          local near = math.min(l, r, u, d)
          if near >= 1 then
            local idx = col - C.gold0
            if near == l or near == u then
              if near ~= r and near ~= d then col = C.gold0 + math.min(7, idx + 1) end
            else
              col = C.gold0 + math.max(0, idx - 1)
            end
          end
          local lit = not inside(x - 1, y) or not inside(x, y - 1)
          local dark = not inside(x + 1, y) or not inside(x, y + 1)
          if lit then
            col = C.gold7
          elseif dark then
            col = (y >= 37 and y < 48) and C.gold0 or C.gold2
          elseif not inside(x - 1, y - 1) then
            col = C.gold6
          end
          if mode == "hot" then
            if col == C.gold1 or col == C.gold0 then col = C.gold4
            elseif col == C.gold2 or col == C.gold3 then col = C.gold5
            else col = C.gold7 end
          end
        end
        L.set(out, x + PAD, y + PAD, col)
      end
    end
  end
  -- ink line between face and extrude so the letter edge stays crisp
  for y = 0, m.h - 1 do
    for x = 0, m.w - 1 do
      if not inside(x, y) and get(solid, x + PAD, y + PAD) == 2 then
        if inside(x - 1, y) or inside(x, y - 1) or inside(x - 1, y - 1) then
          L.set(out, x + PAD, y + PAD, mode == "white" and C.fire_y or C.ink)
        end
      end
    end
  end
  return out
end

local letters = {}
for ch, d in pairs(defs) do
  local m = L.buf(d.w, CAP, 0)
  d.draw(m)
  letters[ch] = { ch = ch, w = d.w, mask = m, gold = shade(m, "gold"), hot = shade(m, "hot"), white = shade(m, "white") }
end

return { letters = letters, CAP = CAP, PAD = PAD, EXT = EXT }
