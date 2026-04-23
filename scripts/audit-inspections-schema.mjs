#!/usr/bin/env node
/**
 * Inspection-schema drift detector.
 *
 * Compares `lib/inspections/payload-columns.data.json` (the canonical
 * list of columns the editor writes to) against the live database
 * schema reported by `information_schema.columns`.
 *
 * Exit codes:
 *   0  -> registry and database agree (no drift).
 *   1  -> drift detected. Prints a ready-to-paste ALTER TABLE block.
 *   2  -> infrastructure problem (couldn't connect, etc.).
 *
 * Usage:
 *   DATABASE_URL=postgres://... npm run audit:inspections-schema
 *
 * Notes:
 *   * Read-only: this script never mutates the schema.
 *   * Skips NextJS bootstrapping; uses pg directly so it can be run
 *     standalone in CI or pre-deploy hooks.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(HERE, "../lib/inspections/payload-columns.data.json");

function fail(msg, code = 2) {
  console.error(`✖ ${msg}`);
  process.exit(code);
}

async function loadRegistry() {
  let raw;
  try {
    raw = await readFile(REGISTRY_PATH, "utf8");
  } catch (err) {
    fail(`Could not read ${REGISTRY_PATH}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(`Registry is not valid JSON: ${err.message}`);
  }
  if (!parsed || !Array.isArray(parsed.columns)) {
    fail("Registry is missing a `columns` array.");
  }
  return parsed;
}

function getConnectionString() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return url;
  const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env;
  if (PGHOST && PGPORT && PGDATABASE && PGUSER && PGPASSWORD) {
    return `postgresql://${encodeURIComponent(PGUSER)}:${encodeURIComponent(
      PGPASSWORD,
    )}@${PGHOST}:${PGPORT}/${PGDATABASE}`;
  }
  fail(
    "No database connection configured. Set DATABASE_URL or " +
      "PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD.",
  );
}

async function fetchLiveColumns(client, fullyQualifiedTable) {
  const [schema, table] = fullyQualifiedTable.includes(".")
    ? fullyQualifiedTable.split(".")
    : ["public", fullyQualifiedTable];
  const result = await client.query(
    `select column_name
       from information_schema.columns
      where table_schema = $1
        and table_name   = $2
      order by column_name`,
    [schema, table],
  );
  return new Set(result.rows.map((r) => r.column_name));
}

function emitAlter(table, missing) {
  const adds = missing
    .map(({ name, type }) => `  ADD COLUMN IF NOT EXISTS ${name} ${type}`)
    .join(",\n");
  return `ALTER TABLE ${table}\n${adds};\n\nSELECT pg_notify('pgrst', 'reload schema');\n`;
}

async function main() {
  const registry = await loadRegistry();
  const table = registry.table || "public.inspections";
  const expected = registry.columns;
  const expectedNames = new Set(expected.map((c) => c.name));

  const { Client } = pg;
  const client = new Client({
    connectionString: getConnectionString(),
    ssl:
      process.env.PGSSLMODE === "disable" || process.env.NODE_ENV === "development"
        ? undefined
        : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
  } catch (err) {
    fail(`Could not connect to database: ${err.message}`);
  }

  let liveColumns;
  try {
    liveColumns = await fetchLiveColumns(client, table);
  } catch (err) {
    await client.end().catch(() => {});
    fail(`Could not query information_schema for ${table}: ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }

  if (liveColumns.size === 0) {
    fail(`Table ${table} not found in the live database.`);
  }

  const missingInDb = expected.filter((c) => !liveColumns.has(c.name));
  const extraInDb = [...liveColumns].filter((name) => !expectedNames.has(name));

  console.log(`✓ Registry: ${expected.length} columns expected on ${table}`);
  console.log(`✓ Database: ${liveColumns.size} columns found on ${table}`);

  if (missingInDb.length === 0 && extraInDb.length === 0) {
    console.log("✓ No drift. Registry and database agree on every payload column.");
    process.exit(0);
  }

  if (missingInDb.length) {
    console.error(
      `\n✖ Drift: ${missingInDb.length} column(s) in the registry are NOT in the database:`,
    );
    for (const c of missingInDb) {
      console.error(`    - ${c.name} (${c.type})${c.note ? `  // ${c.note}` : ""}`);
    }
    console.error("\n  Run this in your Supabase SQL editor (prod AND staging):\n");
    console.error(emitAlter(table, missingInDb));
  }

  if (extraInDb.length) {
    // Extra columns in the DB are common (id, created_at, updated_at,
    // legacy fields not written by the editor). Just an informational
    // notice — does NOT cause a non-zero exit.
    console.log(
      `\nℹ Note: ${extraInDb.length} column(s) exist in the database but are not in the editor payload registry. ` +
        `This is usually fine (e.g. id, created_at, legacy fields).`,
    );
    if (process.env.AUDIT_VERBOSE === "1") {
      for (const name of extraInDb.sort()) console.log(`    - ${name}`);
    }
  }

  process.exit(missingInDb.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(2);
});
