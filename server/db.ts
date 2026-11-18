// postgres pool + migrations. plain numbered .sql files, applied in order at startup, each in a transaction
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

export type Db = pg.Pool

export function openDb(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 10 })
  // an idle client erroring (db restart) must not crash the process. queries still fail loud
  pool.on('error', err => console.error(JSON.stringify({ msg: 'pg idle client error', err: String(err) })))
  return pool
}

export async function migrate(db: Db): Promise<string[]> {
  await db.query('create table if not exists schema_migrations (name text primary key, at timestamptz not null default now())')
  const dir = join(import.meta.dirname, 'migrations')
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations')).rows.map(r => r.name))
  const applied: string[] = []
  for (const file of files) {
    if (done.has(file)) continue
    const client = await db.connect()
    try {
      await client.query('begin')
      await client.query(readFileSync(join(dir, file), 'utf8'))
      await client.query('insert into schema_migrations (name) values ($1)', [file])
      await client.query('commit')
      applied.push(file)
    } catch (err) {
      await client.query('rollback')
      throw new Error(`migration ${file} failed: ${err}`)
    } finally {
      client.release()
    }
  }
  return applied
}
