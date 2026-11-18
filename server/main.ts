// node server/main.ts. config comes from env, missing config crashes with a clear message
import { hostname } from 'node:os'
import { resolve } from 'node:path'
import * as engine from '../src/engine/match.ts'
import { startServer } from './app.ts'
import { openDb } from './db.ts'

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`env ${name} is missing`)
  return v
}

const db = openDb(env('DATABASE_URL'))
const { close } = await startServer({
  port: Number(process.env.PORT ?? 8787),
  engine,
  db,
  dailySecret: env('DAILY_SECRET'),
  pod: process.env.POD_NAME ?? hostname(),
  staticDir: process.env.STATIC_DIR ? resolve(process.env.STATIC_DIR) : null,
  secureCookies: process.env.INSECURE_COOKIES !== '1', // dev over plain http sets INSECURE_COOKIES=1
})

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, () => {
    console.log(JSON.stringify({ msg: 'shutting down', sig }))
    close().then(() => db.end()).then(() => process.exit(0), err => {
      console.error(JSON.stringify({ msg: 'shutdown failed', err: String(err) }))
      process.exit(1)
    })
  })
}
