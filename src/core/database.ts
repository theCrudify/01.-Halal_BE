import { AsyncLocalStorage } from 'node:async_hooks'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see .env.example)')

// Keep DATE columns as 'YYYY-MM-DD' strings instead of JS Date (avoids timezone shifts).
pg.types.setTypeParser(1082, (v) => v)
// COUNT(*) is bigint; our counts fit in a JS number.
pg.types.setTypeParser(20, (v) => Number(v))

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 })

// shortcut: untyped Kysely, generate a DB interface with kysely-codegen if the schema keeps growing.
const rootDb = new Kysely<any>({ dialect: new PostgresDialect({ pool }) })

// Cloudflare Workers cannot reuse a socket across requests, so the worker runs each request with its own pool.
const requestDb = new AsyncLocalStorage<Kysely<any>>()

export const db: Kysely<any> = new Proxy(rootDb, {
  get(target, key) {
    const current = requestDb.getStore() ?? target
    const value = Reflect.get(current, key)
    return typeof value === 'function' ? value.bind(current) : value
  },
})

export async function withRequestDb<T>(fn: () => Promise<T>, waitUntil: (p: Promise<unknown>) => void): Promise<T> {
  const scoped = new Kysely<any>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 }) }),
  })
  try {
    return await requestDb.run(scoped, fn)
  } finally {
    waitUntil(scoped.destroy())
  }
}
