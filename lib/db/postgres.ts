import { Pool, type QueryResultRow } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var __waterpermitPgPool: Pool | undefined
}

function getConnectionString(): string {
  const fromUrl = process.env.DATABASE_URL
  if (fromUrl && fromUrl.trim()) return fromUrl.trim()

  const host = process.env.PGHOST
  const port = process.env.PGPORT
  const database = process.env.PGDATABASE
  const user = process.env.PGUSER
  const password = process.env.PGPASSWORD

  if (!host || !port || !database || !user || !password) {
    throw new Error(
      'Database config missing. Set DATABASE_URL or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD.'
    )
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`
}

function createPool(): Pool {
  return new Pool({
    connectionString: getConnectionString(),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  })
}

function getPool(): Pool {
  if (!globalThis.__waterpermitPgPool) {
    globalThis.__waterpermitPgPool = createPool()
  }
  return globalThis.__waterpermitPgPool
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
) {
  return getPool().query<T>(text, params)
}
