// Bundle the real canvas renderer into a local page for the two acceptance rows.
import { build } from 'vite'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const entry = fileURLToPath(new URL('review-specials.ts', import.meta.url))
const result = await build({ configFile: false, logLevel: 'error', build: {
  write: false, lib: { entry, name: 'CardReview', formats: ['iife'] },
}})
const dir = mkdtempSync(join(tmpdir(), 'flambeur-cards-'))
try {
  const page = join(dir, 'index.html')
  writeFileSync(join(dir, 'review.js'), result[0].output[0].code)
  writeFileSync(page, '<meta charset="utf-8"><body><script src="review.js"></script></body>')
  const dom = execFileSync('chromium', ['--headless', '--disable-gpu', '--disable-dev-shm-usage',
    '--enable-logging=stderr', '--no-first-run', '--user-data-dir='+dir, '--virtual-time-budget=5000', '--dump-dom',
    pathToFileURL(page).href], {encoding:'utf8', maxBuffer:8_000_000})
  const image = dom.match(/<body>data:image\/png;base64,([^<]+)/)
  if (!image) throw new Error('review render failed: '+dom.slice(-300))
  process.stdout.write(Buffer.from(image[1], 'base64'))
} finally {
  rmSync(dir, {recursive:true, force:true})
}
