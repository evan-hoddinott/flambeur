// These rows use the gameplay compositor with all animated effects off.
import { canvas, cardCanvas, ctx2d, loadArt, stockScale } from '../../src/ui/art.ts'
import { drawText, loadFonts } from '../../src/ui/font.ts'
import { newCard, type Card } from '../../src/engine/cards.ts'

async function review() {
  await Promise.all([loadArt(), loadFonts()])
  const sheet = canvas(944, 238 + 5 * 100)
  const g = ctx2d(sheet)
  g.fillStyle = '#174034'
  g.fillRect(0, 0, sheet.width, sheet.height)
  const ids = { nextCardId: 1 }
  function sample(label: string, extra: Partial<Card>, x: number, baseline: number, scale: number, king = false) {
    const card = newCard(ids, king ? 13 : 9, king ? 'H' : 'S', extra)
    const face = cardCanvas(card)
    const size = scale * stockScale(card)
    const w = Math.round(face.width * size), h = Math.round(face.height * size)
    g.drawImage(face, x-Math.floor(w/2), baseline-h, w, h)
    drawText(g, label, x, baseline+4, {font: 'tiny', align: 'center', color: '#f6ecd2'})
  }
  function title(s: string, x: number, y: number) {
    drawText(g, s, x, y, {font:'sans', color:'#e8c260'})
  }
  title('28   HALF SIZE / EFFECTS OFF', 8, 4)
  const stocks: [string, Partial<Card>][] = [
    ['Plain', {}], ['Chase', {variant:'chase'}], ['Sticker', {variant:'sticker'}],
    ['Rookie', {variant:'rookie'}], ['Jumbo', {variant:'jumbo'}], ['Joker', {joker:'sticky'}],
    ['Crayon Joker', {joker:'crayon'}], ['Bulk', {bulk:true}],
  ]
  stocks.forEach(([name, c], i) => sample(name, c, 32+i*55, 91, .5))
  ;(['foil','holo','prism','misprint'] as const).forEach((finish,i) =>
    sample(['Foil','Holo','Embers','Misprint'][i], {finish}, 500+i*51, 91, .5))
  for (let tier=1; tier<=3; tier++) sample('Tier '+tier, {tier}, 742+tier*45, 91, .5, true)
  title('29   STACKED MODIFIERS', 8, 117)
  sample('Chase', {variant:'chase',finish:'foil',tier:3,stamp:'gold',
    traits:[{kind:'multi',count:2},{kind:'bridge'},{kind:'crown'}]}, 200, 222, 1)
  title('Gold foil / Chase plaque / white-hot rim', 255, 153)
  title('Gold seal / Twin, Bridge, Crown', 255, 172)
  const inks: [string, Partial<Card>][] = [
    ['1st Ed', {stamp:'first'}], ['Signed', {stamp:'signed'}], ['Tear', {stamp:'damaged'}],
    ['Marked', {knockoff:{kind:'marked'}}], ['Crayon', {knockoff:{kind:'crayon'}}],
    ['Wrong Suit', {knockoff:{kind:'wrongsuit',suit:'H'}}], ['Beer', {knockoff:{kind:'beer',stuckTo:1}}],
  ]
  inks.forEach(([name, c], i) => sample(name, c, 555+i*57, 210, .75))
  const finishes = [null, 'foil', 'holo', 'prism', 'misprint'] as const
  for (const [row, finish] of finishes.entries()) {
    title((finish ?? 'plain').toUpperCase(), 8, 246 + row * 100)
    for (const [j, suit] of (['S', 'H', 'D', 'C'] as const).entries()) {
      for (let rank = 2; rank <= 6; rank++) {
        const face = cardCanvas(newCard(ids, rank, suit, { finish }))
        g.drawImage(face, 10 + 46 * (j * 5 + rank - 2), 265 + row * 100, 44, 60)
      }
    }
  }
  document.body.textContent = sheet.toDataURL()
}
review().catch(error => { document.body.textContent = String(error) })
