import { Pool, type PoolClient, type QueryResultRow } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var __waterpermitPgPool: Pool | undefined
}

function getConnectionString(): string {
  const fromUrl = process.env.DATABASE_URL
  if (fromUrl && fromUrl.trim()) {
    const value = fromUrl.trim()
    try {
      const host = new URL(value).hostname.toLowerCase()
      const allowSupabaseUrl = process.env.ALLOW_SUPABASE_DATABASE_URL === 'true'
      if (!allowSupabaseUrl && host.includes('supabase.co')) {
        throw new Error(
          'DATABASE_URL points to Supabase. For self-hosted mode, set DATABASE_URL to your local Postgres or use PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD.'
        )
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('DATABASE_URL points to Supabase')) {
        throw err
      }
      // If URL parsing fails, preserve previous behavior and let pg surface connection errors.
    }
    return value
  }

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

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}
