import { query } from "./postgres";

/**
 * Per-table column registry, populated lazily from
 * `information_schema.columns` and cached at module scope.
 *
 * Used by `app/api/internal/query/route.ts` to reject INSERT/UPDATE
 * payloads that reference columns the database does not have, BEFORE
 * issuing SQL. Without this guard a missing column produces a Postgres
 * error that the legacy client retry helper would catch and silently
 * drop, leading to data loss with a green checkmark in the UI.
 *
 * Concurrency / race safety:
 *   Multiple concurrent requests during the very first load all await
 *   the same in-flight Promise (`inflightLoad`), so the registry is
 *   built exactly once. Reads after load are read-only against an
 *   immutable Map<string, Set<string>>.
 *
 * Refresh:
 *   * TTL: {@link CACHE_TTL_MS} (default 5 minutes).
 *   * On-demand: callers may invoke {@link invalidateSchemaCache} after
 *     they detect a missing-column error slipping through (covers the
 *     case where a migration was applied while the server was running).
 */

type ColumnSet = ReadonlySet<string>;
type Registry = ReadonlyMap<string, ColumnSet>;

const CACHE_TTL_MS = Number(process.env.SCHEMA_CACHE_TTL_MS ?? 5 * 60 * 1000);

let registry: Registry | null = null;
let registryLoadedAt = 0;
let inflightLoad: Promise<Registry> | null = null;

async function loadRegistry(tables: ReadonlyArray<string>): Promise<Registry> {
  // information_schema is ANSI-standard; both Supabase Postgres and
  // self-hosted Postgres expose it. Filtered to the public schema and
  // only the tables we know about, so this is cheap (one round-trip).
  const result = await query<{ table_name: string; column_name: string }>(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1)`,
    [tables],
  );

  const next = new Map<string, Set<string>>();
  for (const t of tables) next.set(t, new Set());
  for (const row of result.rows) {
    const set = next.get(row.table_name);
    if (set) set.add(row.column_name);
  }
  return next as Registry;
}

/**
 * Returns the cached registry, loading it (once, even under
 * concurrency) if necessary. The returned value is an immutable
 * snapshot; callers must not mutate it.
 */
export async function getSchemaRegistry(
  tables: ReadonlyArray<string>,
): Promise<Registry> {
  const now = Date.now();
  if (registry && now - registryLoadedAt < CACHE_TTL_MS) return registry;

  if (!inflightLoad) {
    inflightLoad = (async () => {
      try {
        const next = await loadRegistry(tables);
        registry = next;
        registryLoadedAt = Date.now();
        return next;
      } finally {
        inflightLoad = null;
      }
    })();
  }
  return inflightLoad;
}

/**
 * Look up the column set for one table. Returns `null` if the table is
 * not tracked (in which case callers should fall back to the previous
 * behavior of letting Postgres surface any error).
 */
export async function getTableColumns(
  table: string,
  tables: ReadonlyArray<string>,
): Promise<ColumnSet | null> {
  const reg = await getSchemaRegistry(tables);
  return reg.get(table) ?? null;
}

/**
 * Drop the cache so the next call to {@link getSchemaRegistry} reloads
 * from `information_schema`. Cheap and safe to call after a migration.
 */
export function invalidateSchemaCache(): void {
  registry = null;
  registryLoadedAt = 0;
}
