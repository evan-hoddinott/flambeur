#!/usr/bin/env bash
# rebuilds logo.aseprite from the lua generator and re-exports every deliverable
set -euo pipefail
cd "$(dirname "$0")/.."
HERO=118 # idle frame used for the still (0-based, no sheen or glint on it)

aseprite -b --script-param dir="$PWD/src" --script-param out="$PWD/logo.aseprite" --script src/build.lua

aseprite -b --frame-range $HERO,$HERO logo.aseprite --save-as logo.png
aseprite -b --frame-range $HERO,$HERO logo.aseprite --scale 4 --save-as "logo@4x.png"

# spritesheets for the game, transparent background. the cards layer is only a marker mask, so it gets
# its own sheets and src/ui/logo.ts paints the real card art into it, under everything else
aseprite -b --ignore-layer felt --ignore-layer cards --tag intro logo.aseprite \
  --sheet intro.png --data intro.json --format json-array --sheet-type rows --sheet-columns 12 --filename-format '{tag}_{tagframe00}' >/dev/null
aseprite -b --ignore-layer felt --ignore-layer cards --tag idle logo.aseprite \
  --sheet idle.png --data idle.json --format json-array --sheet-type rows --sheet-columns 8 --filename-format '{tag}_{tagframe00}' >/dev/null
aseprite -b --layer cards --tag intro logo.aseprite \
  --sheet cards_intro.png --format json-array --sheet-type rows --sheet-columns 12 >/dev/null
aseprite -b --layer cards --tag idle logo.aseprite \
  --sheet cards_idle.png --format json-array --sheet-type rows --sheet-columns 8 >/dev/null

# the still, the gif and preview.html show the card markers as blank cream cards (and preview.html has
# no cards at all, the sheets leave them out). the real fan only exists in the game
# gif: intro, then three idle loops, on the felt, 3x
tmp=$(mktemp -d)
aseprite -b logo.aseprite --scale 3 --save-as "$tmp/f_{frame000}.png"
args=()
for i in $(seq 0 95); do
  d=6
  [ "$i" = 56 ] && d=9
  [ "$i" = 57 ] && d=16
  [ "$i" = 82 ] && d=13
  args+=(-delay $d "$tmp/f_$(printf %03d "$i").png")
done
for loop in 1 2 3; do
  for i in $(seq 96 143); do args+=(-delay 6 "$tmp/f_$(printf %03d "$i").png"); done
done
magick "${args[@]}" -loop 0 -layers optimize logo.gif
rm -rf "$tmp"

python3 src/preview.py
ls -la
