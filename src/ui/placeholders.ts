// stand-in sprites for v2 art that isn't drawn yet (docs/V2-ART.md). flat shapes and the bitmap fonts, so every
// new screen works today. each is registered under its real sprite id and size: when the art lands in an atlas
// with that name, it wins and these stop being used. delete an entry once its art exists
import { placeholder } from './art.ts'
import { drawText, measure, type FontName } from './font.ts'
import { INSERTS, type Insert } from '../engine/shop.ts'

const INK = '#1c1513'
const CREAM = '#f6ecd2'
const PAPER = '#e3d2a8'
const BURGUNDY = '#7a1a2c'
const BRASS = '#c99a3a'
const GOLD = '#e8c260'

function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, edge = INK): void {
  g.fillStyle = edge
  g.fillRect(x, y, w, h)
  g.fillStyle = fill
  g.fillRect(x + 1, y + 1, w - 2, h - 2)
}

function label(g: CanvasRenderingContext2D, s: string, x: number, y: number, color = INK, font: FontName = 'tiny'): void {
  drawText(g, s, x, y, { font, color, align: 'center' })
}

// the colored top band per insert (V2-ART §3.2e is the real palette)
const INSERT_INK: Record<Insert, string> = {
  code: '#3e66a0', checklist: '#3a8040', stylo: '#5c4a36', broyeuse: '#43342e', photocopie: '#8c7656', reprint: '#b07a3a',
  foil: GOLD, holo: '#9a6ad0', prism: '#ff862f', tampon: '#a82a38', allumettes: '#e8501a', wishlist: '#d06a9a', grail: BRASS,
}
const SHORT: Record<Insert, string> = {
  code: 'CO', checklist: 'CH', stylo: 'ST', broyeuse: 'BR', photocopie: 'PH', reprint: 'RE',
  foil: 'FO', holo: 'HO', prism: 'PR', tampon: 'TA', allumettes: 'AL', wishlist: 'WI', grail: 'GR',
}

// insert/back 24×34: a mini La Fortune du Pot ticket, burgundy with a brass F
placeholder('insert/back', 24, 34, g => {
  box(g, 0, 0, 24, 34, BURGUNDY)
  g.fillStyle = BRASS
  for (let x = 2; x < 22; x += 3) g.fillRect(x, 1, 1, 1) // the perforated top edge
  label(g, 'F', 12, 12, GOLD, 'didone')
})

// insert/face/<id> 24×34: cream mini card, the insert's color band, two letters for the emblem
for (const id of Object.keys(INSERTS) as Insert[]) {
  placeholder(`insert/face/${id}`, 24, 34, g => {
    box(g, 0, 0, 24, 34, CREAM)
    g.fillStyle = INSERT_INK[id]
    g.fillRect(1, 1, 22, 7)
    label(g, SHORT[id], 12, 13, INK, 'sans')
  })
  // scratch/<id> 16×16: the symbol in a scratcher window. code, checklist, wishlist and grail already exist
  placeholder(`scratch/${id}`, 16, 16, g => {
    g.fillStyle = INK
    g.fillRect(2, 0, 12, 16)
    g.fillRect(0, 2, 16, 12)
    g.fillStyle = INSERT_INK[id]
    g.fillRect(3, 1, 10, 14)
    g.fillRect(1, 3, 14, 10)
    label(g, SHORT[id], 8, 5, id === 'foil' ? INK : CREAM)
  })
}

// icon/discard 9×9: a tilted card with a violet flick. icon/sleeve 9×9: two card tops out of a cuff
placeholder('icon/discard', 9, 9, g => {
  box(g, 1, 2, 5, 7, CREAM)
  g.fillStyle = '#7a4ab0'
  g.fillRect(5, 0, 3, 1)
  g.fillRect(7, 1, 1, 2)
})
placeholder('icon/sleeve', 9, 9, g => {
  box(g, 1, 0, 4, 5, CREAM)
  box(g, 4, 1, 4, 5, CREAM)
  g.fillStyle = INK
  g.fillRect(0, 5, 9, 4)
  g.fillStyle = '#4a2a60'
  g.fillRect(1, 6, 7, 2)
})

// hud/stamp/play, /discard, /skip: the ink slams, same 11 px height as the existing hud/stamp/*
function stamp(name: string, word: string, color: string): void {
  const w = measure(word, 'sans', true) + 6
  placeholder(name, w, 11, g => {
    g.strokeStyle = color
    g.lineWidth = 1
    g.strokeRect(0.5, 0.5, w - 1, 10)
    drawText(g, word, w / 2, 0, { font: 'sans', color, align: 'center', bold: true })
  }, { x: Math.floor(w / 2), y: 5 })
}
stamp('hud/stamp/play', 'PLAY', '#3e66a0')
stamp('hud/stamp/discard', 'DISCARD', '#7a4ab0')
stamp('hud/stamp/skip', 'PASSE', '#8c7656')

// hud/hand/pip/<state> 10×10: one per hand of the round
const PIP: Record<string, [string, string]> = { open: ['#3d2a10', '#2e4a30'], won: ['#3d2a10', GOLD], lost: ['#0e0b0a', '#43342e'], tie: ['#3d2a10', BRASS], thrown: ['#43342e', '#8c7656'] }
for (const [state, [rim, fill]] of Object.entries(PIP)) {
  placeholder(`hud/hand/pip/${state}`, 10, 10, g => {
    g.fillStyle = rim
    g.fillRect(2, 0, 6, 10)
    g.fillRect(0, 2, 10, 6)
    g.fillRect(1, 1, 8, 8)
    g.fillStyle = fill
    g.fillRect(2, 2, 6, 6)
    if (state === 'tie') {
      g.fillStyle = '#0e0b0a'
      for (let i = 0; i < 6; i++) g.fillRect(2 + i, 7 - i, 6 - i, 1)
    }
    if (state === 'thrown') {
      g.fillStyle = '#0e0b0a'
      g.fillRect(4, 4, 2, 2) // the burn hole
    }
  })
}

// hud/ko/badge 44×16: the enamel plaque on the felt. the "K.O. 3×" goes on by code
placeholder('hud/ko/badge', 44, 16, g => {
  box(g, 0, 0, 44, 16, CREAM, BRASS)
  g.fillStyle = '#3d2a10'
  g.fillRect(0, 15, 44, 1)
})

// hud/ko/stamp ~140×48: the knockout slam
placeholder('hud/ko/stamp', 140, 48, g => {
  g.strokeStyle = BURGUNDY
  g.lineWidth = 3
  g.strokeRect(3, 3, 134, 42)
  drawText(g, 'K.-O. !', 71, 12, { font: 'didone', color: GOLD, align: 'center', scale: 2 })
  drawText(g, 'K.-O. !', 70, 11, { font: 'didone', color: BURGUNDY, align: 'center', scale: 2 })
}, { x: 70, y: 24 })

// hud/marker/note 58×26: le patron's IOU on your plate. the amount goes on by code
placeholder('hud/marker/note', 58, 26, g => {
  box(g, 0, 0, 58, 26, CREAM, '#8c7656')
  g.fillStyle = '#bfa77e'
  g.fillRect(29, 1, 1, 24) // the fold
  g.fillStyle = '#a82a38'
  g.fillRect(48, 3, 7, 7) // the wax seal
  g.fillStyle = '#7a1a2c'
  g.fillRect(50, 5, 3, 3)
})

// hud/spoils/placard ~96×22: "LE BUTIN" on a paper placard over the pot
placeholder('hud/spoils/placard', 96, 22, g => {
  box(g, 0, 0, 96, 22, PAPER, '#5c4a36')
  label(g, 'LE BUTIN', 48, 3, BURGUNDY, 'didone')
})

// hud/spoils/order 20×12: the brass "1er" chip on the plate of whoever picks first
placeholder('hud/spoils/order', 20, 12, g => {
  box(g, 0, 0, 20, 12, BRASS, '#3d2a10')
  label(g, '1er', 10, 2, INK)
})

// collectibles for the v2 lanes (art/collectibles): the 10 × payoffs and Bulk Bin. 4 frames each like the rest
const LANE: Record<string, [string, string, string]> = {
  bulk_bin: ['BULK', 'BIN', '#43342e'],
  les_jumeaux: ['LES', 'JUMEAUX', '#d04a4e'],
  sommelier: ['SOMME', 'LIER', '#7a1a2c'],
  flamme_bleue: ['FLAMME', 'BLEUE', '#3e66a0'],
  vitrine: ['VITRINE', '×FIN', '#9a6ad0'],
  petite_monnaie: ['PETITE', 'MONNAIE', '#3a8040'],
  ferrailleur: ['FERRAI', 'LLEUR', '#5c4a36'],
  le_flambeur: ['LE', 'FLAMBEUR', '#e8501a'],
  bis: ['BIS', '!', '#b07a3a'],
  ligne_droite: ['LIGNE', 'DROITE', '#2e5a8a'],
  commissaire: ['COMMISS', 'PRISEUR', '#8a6420'],
}
for (const [id, [top, bottom, color]] of Object.entries(LANE)) {
  for (let f = 0; f < 4; f++) {
    placeholder(f ? `${id}/${f}` : id, 48, 64, g => {
      box(g, 4, 2, 40, 60, color)
      box(g, 7, 5, 34, 54, CREAM)
      g.fillStyle = color
      g.fillRect(8, 6, 32, 10)
      if (id !== 'bulk_bin') drawText(g, '×', 24, 24, { font: 'didone', color, align: 'center', scale: 2 })
      label(g, top, 24, 8, CREAM)
      label(g, bottom, 24, 50, INK)
      if (f % 2) { // a slow glint, so it isn't dead on the shelf
        g.fillStyle = 'rgba(255,240,176,0.5)'
        g.fillRect(9 + f * 6, 18, 2, 28)
      }
    })
  }
}

// patron/body ~110×190: le patron filling the shop doorway, a silhouette with a gold tooth and a cigar glow
placeholder('patron/body', 110, 190, g => {
  g.fillStyle = '#0e0b0a'
  g.fillRect(30, 6, 50, 14) // fedora brim
  g.fillRect(38, 0, 34, 8)
  g.fillRect(40, 20, 30, 26) // face in shadow
  g.fillStyle = '#e8e0cc'
  g.fillRect(14, 46, 82, 144) // white dinner jacket
  g.fillStyle = '#0e0b0a'
  g.fillRect(50, 48, 10, 6) // bow tie
  g.fillRect(53, 54, 4, 136)
  g.fillStyle = '#a82a38'
  g.fillRect(24, 60, 6, 6) // the carnation
  g.fillStyle = GOLD
  g.fillRect(52, 38, 1, 1) // the gold tooth
  g.fillStyle = '#ff7a24'
  g.fillRect(70, 39, 3, 2) // the cigar ember
})

// patron/ledger ~70×44: the open black ledger on the counter
placeholder('patron/ledger', 70, 44, g => {
  box(g, 0, 0, 70, 44, '#2a2020')
  box(g, 3, 3, 31, 38, PAPER, '#5c4a36')
  box(g, 36, 3, 31, 38, PAPER, '#5c4a36')
  g.fillStyle = '#8c7656'
  for (let y = 9; y < 38; y += 5) {
    g.fillRect(6, y, 25, 1)
    g.fillRect(39, y, 25, 1)
  }
})

// shop/dossier ~150×110: the scouting folder for the next rival, laid out by code
placeholder('shop/dossier', 150, 110, g => {
  box(g, 0, 6, 150, 104, '#c8a868', '#5c4a36')
  box(g, 8, 0, 50, 10, '#c8a868', '#5c4a36') // the folder tab
  g.save()
  g.translate(118, 22)
  g.rotate(-0.2)
  drawText(g, 'CONFIDENTIEL', 0, 0, { font: 'tiny', color: '#a82a38', align: 'center' })
  g.restore()
})
