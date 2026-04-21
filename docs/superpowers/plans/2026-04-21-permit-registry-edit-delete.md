# Permit Registry Edit/Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add staff-facing edit and delete for rows in `public.permit_registry`, with persistent storage that cannot be silently reverted by the upstream sync layer.

**Architecture:** Additive schema migration (`deleted_at`, `manually_edited_at`), PATCH/DELETE API under `/api/staff/permit-registry/[id]`, zod validation shared between API and form, sync-layer update guarded by `.is("manually_edited_at", null).is("deleted_at", null)`, shadcn Sheet-based edit drawer + AlertDialog for delete, react-query mutations with `invalidateQueries` on success.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · PostgreSQL (self-hosted via `lib/db/postgres.ts` and Supabase JS via `supabase-js`) · shadcn/ui · react-query v5 · zod · lucide-react.

**Spec:** `docs/superpowers/specs/2026-04-21-permit-registry-edit-delete-design.md`

**Branches:** commit on `chore/stage-unstaged-2026-03-01` (prod) and push to both `chore/stage-unstaged-2026-03-01` and `chore/stage-unstaged-2026-03-01-uat` (staging).

**Verification strategy:** No test framework is installed in this repo. The plan uses three forms of verification:
- **Curl smoke tests** against a running `next dev` server for API routes.
- **One Node verification script** (`scripts/verify-registry-sync-guard.mjs`) for the critical "manual edit must survive a sync call" contract.
- **Documented browser smoke tests** with exact click-by-click steps for UI tasks.

Each task ends with a commit. Push to both remote branches only after the full browser smoke test (Task 11) passes.

---

## File map

### New files
```
database/migrations/2026-04-21-add-registry-edit-delete-fields.sql
lib/validation/permit-registry.ts
app/api/staff/permit-registry/[id]/route.ts
hooks/useUpdatePermitRegistry.ts
hooks/useDeletePermitRegistry.ts
components/permit-registry/row-actions.tsx
components/permit-registry/delete-registry-dialog.tsx
components/permit-registry/edit-registry-drawer.tsx
scripts/verify-registry-sync-guard.mjs
```

### Modified files
```
types/database.ts                                     # add deleted_at, manually_edited_at
lib/permit/permit-registry-sync.ts                    # add .is() guards to update
app/api/staff/permit-registry/route.ts                # filter deleted_at is null on list + summary
hooks/usePermitRegistryQuery.ts                       # propagate new fields in return type
components/permit-registry/permit-registry-list.tsx   # render <RowActions> + lock icon; remove inline action JSX
```

---

## Task 1: Database migration

**Files:**
- Create: `database/migrations/2026-04-21-add-registry-edit-delete-fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 2026-04-21 — Add soft-delete + manual-edit-lock columns to permit_registry.
-- Additive only. No backfill. Safe to re-run.

alter table public.permit_registry
  add column if not exists deleted_at timestamptz null,
  add column if not exists manually_edited_at timestamptz null;

-- Partial index: list queries always filter deleted_at IS NULL, so keep that hot.
create index if not exists permit_registry_live_idx
  on public.permit_registry (deleted_at)
  where deleted_at is null;
```

- [ ] **Step 2: Apply the migration to the self-hosted DB**

The repo's production DB is on `qtgentil@10.10.82.199` per `CLAUDE.md`. For local dev you likely have `DATABASE_URL` pointed at either that server or a local/Supabase instance. Apply through whichever is in use:

```bash
# From the repo root, using the psql CLI and current DATABASE_URL:
psql "$DATABASE_URL" -f database/migrations/2026-04-21-add-registry-edit-delete-fields.sql
```

Expected output includes `ALTER TABLE` and `CREATE INDEX` (or `NOTICE: ... already exists, skipping` on re-run).

- [ ] **Step 3: Verify the columns and index exist**

```bash
psql "$DATABASE_URL" -c "\d public.permit_registry" | grep -E "deleted_at|manually_edited_at|permit_registry_live_idx"
```

Expected: three lines showing both new columns as `timestamp with time zone` and the partial index.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/2026-04-21-add-registry-edit-delete-fields.sql
git commit -m "feat(db): add deleted_at and manually_edited_at to permit_registry"
```

---

## Task 2: Update the TypeScript row type

**Files:**
- Modify: `types/database.ts:421-450` (the `PermitRegistryEntry` interface)

- [ ] **Step 1: Add the two fields to the interface**

Locate the existing `PermitRegistryEntry` (ends at line ~450, last field `source_kind?: string | null`). Replace it with the version that adds `deleted_at` and `manually_edited_at`:

```ts
export interface PermitRegistryEntry {
  id: string
  row_index: number | null
  serial_number: number | null
  permit_holder: string | null
  permit_number: string | null
  regime: string | null
  water_source: string | null
  volume_or_area: string | null
  method_of_water_taking: string | null
  authorized_activity: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  coordinates_geojson?: string | null
  issuance_date: string | null
  issuance_date_raw: string | null
  duration: string | null
  expiration_date: string | null
  expiration_date_raw: string | null
  status: string | null
  contact: string | null
  uploaded_doc_path: string | null
  uploaded_doc_name: string | null
  uploaded_doc_mime_type: string | null
  uploaded_doc_uploaded_at: string | null
  created_at: string
  updated_at: string
  source_kind?: string | null
  deleted_at: string | null
  manually_edited_at: string | null
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: no new errors beyond any pre-existing ones. If new errors appear in files that reference `PermitRegistryEntry`, address them in-place (probably only need to null-check before use).

- [ ] **Step 3: Commit**

```bash
git add types/database.ts
git commit -m "feat(types): add deleted_at and manually_edited_at to PermitRegistryEntry"
```

---

## Task 3: Filter soft-deleted rows from the list API

**Files:**
- Modify: `app/api/staff/permit-registry/route.ts` (the `GET` handler)

- [ ] **Step 1: Find the WHERE clause in the list query**

Read the file. The GET handler builds a SQL query against `public.permit_registry`. Locate the base `where` clause — it should be near the top of the main select statement.

- [ ] **Step 2: Add `deleted_at is null` to every filter**

Every SQL query in this route that reads `permit_registry` needs `and deleted_at is null` added to its WHERE clause — both the list query and any summary/count queries. Example, for a block like:

```ts
const whereParts: string[] = [];
// ... existing filter pushes ...
const whereSql = whereParts.length ? `where ${whereParts.join(" and ")}` : "";
```

Prepend a baseline filter so it is always present:

```ts
const whereParts: string[] = ["deleted_at is null"];
// ... existing filter pushes ...
const whereSql = `where ${whereParts.join(" and ")}`;
```

Apply the same change to any separate summary-count query in the same file. (Search for other SQL strings hitting `permit_registry`.)

- [ ] **Step 3: Start dev server and smoke test**

```bash
npm run dev
```

In another terminal:
```bash
# Should return a JSON list (existing rows all have deleted_at IS NULL, so count stays the same)
curl -s "http://localhost:3000/api/staff/permit-registry?limit=5" \
  -H "Cookie: <paste your dev-session cookie>" | jq '.total, (.items | length)'
```

Expected: `total` matches what it was before the change; `items` length ≤ 5.

- [ ] **Step 4: Soft-delete one row in the DB and re-run**

```bash
psql "$DATABASE_URL" -c "update public.permit_registry set deleted_at = now() where id = (select id from public.permit_registry order by updated_at desc limit 1)"
```

Re-run the curl. `total` should be exactly one less than before.

- [ ] **Step 5: Restore the row**

```bash
psql "$DATABASE_URL" -c "update public.permit_registry set deleted_at = null where deleted_at is not null"
```

- [ ] **Step 6: Commit**

```bash
git add app/api/staff/permit-registry/route.ts
git commit -m "feat(registry): exclude soft-deleted rows from list and summary"
```

---

## Task 4: Guard the sync layer against ghost-edit overwrites

**Files:**
- Modify: `lib/permit/permit-registry-sync.ts:78-87` (the `.update()` call)

- [ ] **Step 1: Add the two `.is()` filters**

In `syncPermitToRegistry`, locate the update block:

```ts
const matchIds = matches.map((r) => r.id);
const { error: updateErr } = await supabaseClient
  .from("permit_registry")
  .update(payload)
  .in("id", matchIds);
```

Replace with:

```ts
const matchIds = matches.map((r) => r.id);
const { error: updateErr, count } = await supabaseClient
  .from("permit_registry")
  .update(payload, { count: "exact" })
  .in("id", matchIds)
  .is("manually_edited_at", null)
  .is("deleted_at", null);
```

And update the success log to surface when rows were skipped:

```ts
if (updateErr) {
  console.warn("⚠️ permit-registry-sync: update error", updateErr.message);
  return { synced: false, error: updateErr.message };
}

const updatedCount = count ?? 0;
const skippedCount = matches.length - updatedCount;
if (skippedCount > 0) {
  console.log(
    `ℹ️ permit-registry-sync: skipped ${skippedCount} locked/deleted row(s); updated ${updatedCount} for`,
    matches[0].permit_number
  );
} else {
  console.log(`✅ permit-registry-sync: updated ${updatedCount} registry row(s) for`, matches[0].permit_number);
}
return { synced: updatedCount > 0 };
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "permit-registry-sync" | head -10
```

Expected: no output (no new errors).

- [ ] **Step 3: Commit**

```bash
git add lib/permit/permit-registry-sync.ts
git commit -m "fix(registry-sync): never overwrite manually-edited or deleted rows"
```

---

## Task 5: Validation schema (zod)

**Files:**
- Create: `lib/validation/permit-registry.ts`

- [ ] **Step 1: Write the shared zod schema**

```ts
import { z } from "zod";

// ISO 8601 date (YYYY-MM-DD) or full datetime, nullable.
const isoDate = z
  .string()
  .trim()
  .refine((s) => s === "" || !Number.isNaN(Date.parse(s)), { message: "Invalid date" })
  .transform((s) => (s === "" ? null : s))
  .nullable();

const nullableString = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s === "" ? null : s))
  .nullable();

const requiredString = z
  .string()
  .trim()
  .min(1, "Required");

const latitude = z
  .number()
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90")
  .nullable();

const longitude = z
  .number()
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180")
  .nullable();

// All fields are optional at the schema level — PATCH is partial.
// The two required fields (permit_number, permit_holder) are enforced by
// `.min(1)` so if they ARE included in the payload, they cannot be blanked.
export const registryUpdateSchema = z
  .object({
    permit_number: requiredString.optional(),
    permit_holder: requiredString.optional(),
    regime: nullableString.optional(),
    water_source: nullableString.optional(),
    volume_or_area: nullableString.optional(),
    method_of_water_taking: nullableString.optional(),
    authorized_activity: nullableString.optional(),
    location: nullableString.optional(),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    issuance_date: isoDate.optional(),
    duration: nullableString.optional(),
    expiration_date: isoDate.optional(),
    status: nullableString.optional(),
    contact: nullableString.optional(),
  })
  .strict(); // unknown keys rejected

export type RegistryUpdateInput = z.infer<typeof registryUpdateSchema>;

/** Columns that are ALWAYS immutable via PATCH, even if they appear in the body. */
export const IMMUTABLE_REGISTRY_FIELDS = [
  "id",
  "row_index",
  "serial_number",
  "created_at",
  "updated_at",
  "source_kind",
  "uploaded_doc_path",
  "uploaded_doc_name",
  "uploaded_doc_mime_type",
  "uploaded_doc_uploaded_at",
  "deleted_at",
  "manually_edited_at",
  "map_geometry",
  "map_status",
  "map_purpose",
  "map_updated_at",
  "issuance_date_raw",
  "expiration_date_raw",
  "coordinates_geojson",
] as const;
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "validation/permit-registry" | head -10
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add lib/validation/permit-registry.ts
git commit -m "feat(registry): add zod validation schema for PATCH payload"
```

---

## Task 6: PATCH + DELETE API routes

**Files:**
- Create: `app/api/staff/permit-registry/[id]/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { registryUpdateSchema } from "@/lib/validation/permit-registry";

export const runtime = "nodejs";

function isValidUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const expectedUpdatedAt = url.searchParams.get("updated_at");
  if (!expectedUpdatedAt) {
    return NextResponse.json(
      { error: "updated_at query param is required for optimistic concurrency" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = registryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const patch = parsed.data;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Build dynamic SQL — field names are from the zod schema (whitelisted).
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  for (const [key, value] of Object.entries(patch)) {
    setClauses.push(`${key} = $${p++}`);
    params.push(value);
  }
  setClauses.push(`manually_edited_at = now()`);
  setClauses.push(`updated_at = now()`);

  params.push(id);
  const idParam = `$${p++}`;
  params.push(expectedUpdatedAt);
  const updatedAtParam = `$${p++}`;

  // Conditional update: only if (id, deleted_at is null, updated_at matches)
  const result = await query<{ current_updated_at: string; row: unknown }>(
    `with attempt as (
       update public.permit_registry
       set ${setClauses.join(", ")}
       where id = ${idParam}::uuid
         and deleted_at is null
         and updated_at = ${updatedAtParam}::timestamptz
       returning *
     )
     select
       (select row_to_json(attempt.*) from attempt) as row,
       (select updated_at::text from public.permit_registry where id = ${idParam}::uuid) as current_updated_at`,
    params
  );

  const row = (result.rows[0]?.row as Record<string, unknown> | null) ?? null;
  const current = result.rows[0]?.current_updated_at ?? null;

  if (row) {
    return NextResponse.json({ row });
  }
  if (current === null) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }
  return NextResponse.json(
    { error: "Stale updated_at", current_updated_at: current },
    { status: 409 }
  );
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const result = await query<{ id: string }>(
    `update public.permit_registry
        set deleted_at = now(), updated_at = now()
      where id = $1::uuid and deleted_at is null
      returning id`,
    [id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Row not found or already deleted" }, { status: 404 });
  }

  return NextResponse.json({ id: result.rows[0].id });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "permit-registry/\[id\]/route" | head -10
```

Expected: no output.

- [ ] **Step 3: Smoke-test PATCH against dev server**

Ensure `npm run dev` is running. Pick a real registry row id and its current `updated_at`:

```bash
psql "$DATABASE_URL" -c "select id, updated_at, permit_holder from public.permit_registry limit 1"
```

Replace `<ID>` and `<TS>` below with the values shown. Also paste your auth cookie.

```bash
# PATCH happy path
curl -s -X PATCH "http://localhost:3000/api/staff/permit-registry/<ID>?updated_at=<TS>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <paste your dev-session cookie>" \
  -d '{"permit_holder":"TEST EDITED HOLDER"}' | jq '.row.permit_holder, .row.manually_edited_at'
```

Expected: `"TEST EDITED HOLDER"` and a non-null timestamp.

```bash
# PATCH stale updated_at → 409
curl -si -X PATCH "http://localhost:3000/api/staff/permit-registry/<ID>?updated_at=2020-01-01T00:00:00Z" \
  -H "Content-Type: application/json" \
  -H "Cookie: <paste>" \
  -d '{"permit_holder":"Anything"}' | head -3
```

Expected: `HTTP/1.1 409 Conflict`.

```bash
# PATCH validation failure → 400
curl -si -X PATCH "http://localhost:3000/api/staff/permit-registry/<ID>?updated_at=<TS>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <paste>" \
  -d '{"latitude":999}' | head -3
```

Expected: `HTTP/1.1 400 Bad Request`.

Restore the holder to its original value before moving on:

```bash
psql "$DATABASE_URL" -c "update public.permit_registry set permit_holder = '<ORIGINAL>', manually_edited_at = null where id = '<ID>'"
```

- [ ] **Step 4: Smoke-test DELETE**

```bash
# Create a throwaway row
NEW_ID=$(psql -Atq "$DATABASE_URL" -c "insert into public.permit_registry (id, permit_holder, permit_number, created_at, updated_at) values (gen_random_uuid(), 'TEST DELETE ME', 'TEST/DEL/001', now(), now()) returning id")

# DELETE it
curl -s -X DELETE "http://localhost:3000/api/staff/permit-registry/$NEW_ID" \
  -H "Cookie: <paste>" | jq .

# Verify soft-deleted in DB
psql "$DATABASE_URL" -c "select deleted_at from public.permit_registry where id = '$NEW_ID'"

# Second DELETE → 404
curl -si -X DELETE "http://localhost:3000/api/staff/permit-registry/$NEW_ID" \
  -H "Cookie: <paste>" | head -3

# Hard-delete the test row
psql "$DATABASE_URL" -c "delete from public.permit_registry where id = '$NEW_ID'"
```

Expected: first DELETE returns `{"id":"..."}`, DB shows `deleted_at` non-null, second DELETE returns `404`.

- [ ] **Step 5: Commit**

```bash
git add app/api/staff/permit-registry/\[id\]/route.ts
git commit -m "feat(registry): add PATCH and DELETE API routes with optimistic concurrency"
```

---

## Task 7: Sync-guard verification script (CRITICAL — this is the "no ghost edits" proof)

**Files:**
- Create: `scripts/verify-registry-sync-guard.mjs`

- [ ] **Step 1: Write the verification script**

```js
// scripts/verify-registry-sync-guard.mjs
//
// Verifies the DB-level guard that prevents the sync layer from overwriting
// a manually-edited row or resurrecting a soft-deleted one. We replicate the
// exact query shape used by syncPermitToRegistry (.is("manually_edited_at", null)
// and .is("deleted_at", null)) against supabase-js — if this test passes, the
// TS sync module's queries are safe.
//
// Run: node scripts/verify-registry-sync-guard.mjs
// Requires env: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const { DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!DATABASE_URL || !NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sql = new pg.Client({ connectionString: DATABASE_URL });
const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Replicates the guarded update from lib/permit/permit-registry-sync.ts.
async function guardedSyncUpdate(permitNumber, updates) {
  const { data: matches } = await supabase
    .from("permit_registry")
    .select("id")
    .eq("permit_number", permitNumber);
  if (!matches || matches.length === 0) return { updated: 0 };
  const ids = matches.map((m) => m.id);
  const { count, error } = await supabase
    .from("permit_registry")
    .update({ ...updates, updated_at: new Date().toISOString() }, { count: "exact" })
    .in("id", ids)
    .is("manually_edited_at", null)
    .is("deleted_at", null);
  if (error) throw error;
  return { updated: count ?? 0 };
}

const testPermitNumber = `TEST/SYNC-GUARD/${Date.now()}`;
let failures = 0;
function assertEq(actual, expected, label) {
  if (actual !== expected) {
    console.error(`FAIL  ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failures += 1;
  } else {
    console.log(`PASS  ${label}`);
  }
}

async function main() {
  await sql.connect();
  const insert = await sql.query(
    `insert into public.permit_registry
       (id, permit_holder, permit_number, status, created_at, updated_at)
     values (gen_random_uuid(), 'ORIGINAL HOLDER', $1, 'OPERATIONAL', now(), now())
     returning id`,
    [testPermitNumber]
  );
  const id = insert.rows[0].id;
  console.log("inserted test row", id);

  try {
    // 1. Guarded sync updates an un-edited row
    await guardedSyncUpdate(testPermitNumber, { permit_holder: "SYNCED HOLDER 1" });
    let row = (await sql.query("select permit_holder from public.permit_registry where id = $1", [id])).rows[0];
    assertEq(row.permit_holder, "SYNCED HOLDER 1", "sync updates an un-edited row");

    // 2. Lock the row (simulate a staff manual edit)
    await sql.query(
      `update public.permit_registry set permit_holder = 'MANUAL HOLDER', manually_edited_at = now() where id = $1`,
      [id]
    );

    // 3. Guarded sync must NOT overwrite
    await guardedSyncUpdate(testPermitNumber, { permit_holder: "SYNC SHOULD NOT WIN" });
    row = (await sql.query(
      "select permit_holder, manually_edited_at from public.permit_registry where id = $1",
      [id]
    )).rows[0];
    assertEq(row.permit_holder, "MANUAL HOLDER", "sync is BLOCKED when manually_edited_at is set");
    assertEq(Boolean(row.manually_edited_at), true, "manually_edited_at remains set");

    // 4. Soft-delete. Guarded sync must NOT resurrect.
    await sql.query("update public.permit_registry set deleted_at = now() where id = $1", [id]);
    await guardedSyncUpdate(testPermitNumber, { permit_holder: "SYNC SHOULD NOT RESURRECT" });
    row = (await sql.query(
      "select permit_holder, deleted_at from public.permit_registry where id = $1",
      [id]
    )).rows[0];
    assertEq(row.permit_holder, "MANUAL HOLDER", "sync is BLOCKED when deleted_at is set");
    assertEq(Boolean(row.deleted_at), true, "deleted_at remains set");
  } finally {
    await sql.query("delete from public.permit_registry where id = $1", [id]);
    await sql.end();
    console.log("cleaned up test row");
  }

  if (failures > 0) {
    console.error(`\nFAILED (${failures}) — DO NOT DEPLOY`);
    process.exit(1);
  }
  console.log("\nPASSED — sync-guard verification green");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run the verification script**

```bash
node scripts/verify-registry-sync-guard.mjs
```

Expected tail of output:
```
✅ sync updates an un-edited row
✅ sync is BLOCKED when manually_edited_at is set
✅ manually_edited_at remains set
✅ sync is BLOCKED when deleted_at is set
✅ deleted_at remains set
✅ sync-guard verification PASSED
```

If it fails: **do not proceed.** The guard is wrong. Investigate `lib/permit/permit-registry-sync.ts` (Task 4).

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-registry-sync-guard.mjs
git commit -m "test(registry): add sync-guard contract verification script"
```

---

## Task 8: React-query mutations

**Files:**
- Create: `hooks/useUpdatePermitRegistry.ts`
- Create: `hooks/useDeletePermitRegistry.ts`

- [ ] **Step 1: Write `useUpdatePermitRegistry`**

```ts
// hooks/useUpdatePermitRegistry.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { permitRegistryKeys } from "./usePermitRegistryQuery";
import type { PermitRegistryEntry } from "@/types/database";
import type { RegistryUpdateInput } from "@/lib/validation/permit-registry";

export interface UpdateInput {
  id: string;
  expectedUpdatedAt: string;
  patch: RegistryUpdateInput;
}

export interface UpdateError {
  status: number;
  message: string;
  issues?: Array<{ path: Array<string | number>; message: string }>;
  currentUpdatedAt?: string;
}

async function updateRegistry({ id, expectedUpdatedAt, patch }: UpdateInput): Promise<PermitRegistryEntry> {
  const res = await fetch(
    `/api/staff/permit-registry/${id}?updated_at=${encodeURIComponent(expectedUpdatedAt)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }
  );

  if (!res.ok) {
    let body: any = {};
    try { body = await res.json(); } catch {}
    const err: UpdateError = {
      status: res.status,
      message: body.error ?? `Update failed (${res.status})`,
      issues: body.issues,
      currentUpdatedAt: body.current_updated_at,
    };
    throw err;
  }
  const json = await res.json();
  return json.row as PermitRegistryEntry;
}

export function useUpdatePermitRegistry() {
  const qc = useQueryClient();
  return useMutation<PermitRegistryEntry, UpdateError, UpdateInput>({
    mutationFn: updateRegistry,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: permitRegistryKeys.all });
    },
  });
}
```

- [ ] **Step 2: Write `useDeletePermitRegistry`**

```ts
// hooks/useDeletePermitRegistry.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { permitRegistryKeys } from "./usePermitRegistryQuery";

export interface DeleteError {
  status: number;
  message: string;
}

async function deleteRegistry(id: string): Promise<{ id: string }> {
  const res = await fetch(`/api/staff/permit-registry/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    let body: any = {};
    try { body = await res.json(); } catch {}
    const err: DeleteError = {
      status: res.status,
      message: body.error ?? `Delete failed (${res.status})`,
    };
    throw err;
  }
  return res.json();
}

export function useDeletePermitRegistry() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, DeleteError, string>({
    mutationFn: deleteRegistry,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: permitRegistryKeys.all });
    },
  });
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "useUpdatePermitRegistry|useDeletePermitRegistry" | head -10
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add hooks/useUpdatePermitRegistry.ts hooks/useDeletePermitRegistry.ts
git commit -m "feat(registry): react-query mutations for update and delete"
```

---

## Task 9: Delete confirmation dialog

**Files:**
- Create: `components/permit-registry/delete-registry-dialog.tsx`

- [ ] **Step 1: Write the dialog component**

```tsx
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { useDeletePermitRegistry } from "@/hooks/useDeletePermitRegistry";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowId: string;
  permitNumber: string | null;
}

export function DeleteRegistryDialog({ open, onOpenChange, rowId, permitNumber }: Props) {
  const mutation = useDeletePermitRegistry();

  const handleConfirm = async () => {
    try {
      await mutation.mutateAsync(rowId);
      toast.success("Row deleted");
      onOpenChange(false);
    } catch (err: any) {
      if (err?.status === 404) {
        toast.message("Row was already deleted");
        onOpenChange(false);
      } else {
        toast.error(err?.message ?? "Delete failed");
      }
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete permit {permitNumber ?? "row"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This row will be hidden from the registry. This action is reversible only
            through the database — ask an admin if you change your mind.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={mutation.isPending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Verify sonner and alert-dialog exist in the project**

```bash
ls components/ui/alert-dialog.tsx components/ui/sonner.tsx 2>&1
grep -E '"sonner"' package.json
```

Expected: both files exist, `sonner` is in `dependencies`. If `sonner` is not installed, the codebase likely uses a different toast lib — search for `useToast` or `toast(` in existing components and adapt the imports accordingly.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "delete-registry-dialog" | head -10
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/permit-registry/delete-registry-dialog.tsx
git commit -m "feat(registry): add delete confirmation dialog"
```

---

## Task 10: Edit drawer

**Files:**
- Create: `components/permit-registry/edit-registry-drawer.tsx`

- [ ] **Step 1: Write the drawer component**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PermitRegistryEntry } from "@/types/database";
import {
  registryUpdateSchema,
  type RegistryUpdateInput,
} from "@/lib/validation/permit-registry";
import { useUpdatePermitRegistry } from "@/hooks/useUpdatePermitRegistry";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: PermitRegistryEntry;
}

type FormState = {
  permit_holder: string;
  permit_number: string;
  regime: string;
  water_source: string;
  volume_or_area: string;
  method_of_water_taking: string;
  authorized_activity: string;
  location: string;
  latitude: string;
  longitude: string;
  issuance_date: string;
  duration: string;
  expiration_date: string;
  status: string;
  contact: string;
};

function rowToForm(row: PermitRegistryEntry): FormState {
  return {
    permit_holder: row.permit_holder ?? "",
    permit_number: row.permit_number ?? "",
    regime: row.regime ?? "",
    water_source: row.water_source ?? "",
    volume_or_area: row.volume_or_area ?? "",
    method_of_water_taking: row.method_of_water_taking ?? "",
    authorized_activity: row.authorized_activity ?? "",
    location: row.location ?? "",
    latitude: row.latitude != null ? String(row.latitude) : "",
    longitude: row.longitude != null ? String(row.longitude) : "",
    issuance_date: row.issuance_date ?? "",
    duration: row.duration ?? "",
    expiration_date: row.expiration_date ?? "",
    status: row.status ?? "",
    contact: row.contact ?? "",
  };
}

function buildPatch(initial: FormState, current: FormState): RegistryUpdateInput {
  const patch: Record<string, unknown> = {};
  const keys = Object.keys(current) as (keyof FormState)[];
  for (const k of keys) {
    if (initial[k] === current[k]) continue;
    if (k === "latitude" || k === "longitude") {
      patch[k] = current[k] === "" ? null : Number(current[k]);
    } else {
      patch[k] = current[k] === "" ? null : current[k];
    }
  }
  return patch as RegistryUpdateInput;
}

export function EditRegistryDrawer({ open, onOpenChange, row }: Props) {
  const [form, setForm] = useState<FormState>(() => rowToForm(row));
  const [initial, setInitial] = useState<FormState>(() => rowToForm(row));
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const mutation = useUpdatePermitRegistry();

  // When the drawer opens on a new row, reset
  useEffect(() => {
    if (open) {
      const next = rowToForm(row);
      setForm(next);
      setInitial(next);
      setStep("edit");
      setFieldErrors({});
    }
  }, [open, row]);

  const dirty = useMemo(
    () => (Object.keys(form) as (keyof FormState)[]).some((k) => form[k] !== initial[k]),
    [form, initial]
  );

  const handleField = (k: keyof FormState, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (fieldErrors[k]) setFieldErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const handleFirstSubmit = () => {
    const patch = buildPatch(initial, form);
    const parsed = registryUpdateSchema.safeParse(patch);
    if (!parsed.success) {
      const errs: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0] as keyof FormState | undefined;
        if (path) errs[path] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setStep("confirm");
  };

  const handleConfirm = async () => {
    const patch = buildPatch(initial, form);
    try {
      await mutation.mutateAsync({
        id: row.id,
        expectedUpdatedAt: row.updated_at,
        patch,
      });
      toast.success("Row updated");
      onOpenChange(false);
    } catch (err: any) {
      if (err?.status === 409) {
        toast.error(
          "This row changed while you were editing. Refresh to see the latest values."
        );
      } else if (err?.status === 404) {
        toast.error("Row no longer exists.");
        onOpenChange(false);
      } else if (err?.issues) {
        const errs: Partial<Record<keyof FormState, string>> = {};
        for (const issue of err.issues) {
          const path = issue.path?.[0] as keyof FormState | undefined;
          if (path) errs[path] = issue.message;
        }
        setFieldErrors(errs);
        setStep("edit");
      } else {
        toast.error(err?.message ?? "Save failed");
      }
    }
  };

  const inputClass = (name: keyof FormState) =>
    fieldErrors[name] ? "border-red-500 focus-visible:ring-red-500" : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[95vw] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {step === "edit"
              ? `Edit permit row — ${row.permit_number ?? "(no number)"}`
              : `Save changes to ${row.permit_number ?? "this row"}?`}
          </SheetTitle>
          {step === "confirm" && (
            <SheetDescription>
              These changes will be written to the permit registry. The row will be
              marked as manually edited — automatic updates from permit activity will
              stop for this row.
            </SheetDescription>
          )}
        </SheetHeader>

        {step === "edit" && (
          <div className="space-y-6 py-4">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Identity
              </h3>
              <Field label="Permit holder" error={fieldErrors.permit_holder}>
                <Input
                  className={inputClass("permit_holder")}
                  value={form.permit_holder}
                  onChange={(e) => handleField("permit_holder", e.target.value)}
                />
              </Field>
              <Field label="Permit number" error={fieldErrors.permit_number}>
                <Input
                  className={inputClass("permit_number")}
                  value={form.permit_number}
                  onChange={(e) => handleField("permit_number", e.target.value)}
                />
              </Field>
              <Field label="Regime" error={fieldErrors.regime}>
                <Input
                  className={inputClass("regime")}
                  value={form.regime}
                  onChange={(e) => handleField("regime", e.target.value)}
                  placeholder="Concession / Authorization"
                />
              </Field>
              <Field label="Status" error={fieldErrors.status}>
                <Input
                  className={inputClass("status")}
                  value={form.status}
                  onChange={(e) => handleField("status", e.target.value)}
                  placeholder="OPERATIONAL / EXPIRED / ..."
                />
              </Field>
              <Field label="Contact" error={fieldErrors.contact}>
                <Input
                  className={inputClass("contact")}
                  value={form.contact}
                  onChange={(e) => handleField("contact", e.target.value)}
                />
              </Field>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Water
              </h3>
              <Field label="Water source" error={fieldErrors.water_source}>
                <Input
                  className={inputClass("water_source")}
                  value={form.water_source}
                  onChange={(e) => handleField("water_source", e.target.value)}
                />
              </Field>
              <Field label="Volume or area" error={fieldErrors.volume_or_area}>
                <Input
                  className={inputClass("volume_or_area")}
                  value={form.volume_or_area}
                  onChange={(e) => handleField("volume_or_area", e.target.value)}
                />
              </Field>
              <Field label="Method of water taking" error={fieldErrors.method_of_water_taking}>
                <Input
                  className={inputClass("method_of_water_taking")}
                  value={form.method_of_water_taking}
                  onChange={(e) => handleField("method_of_water_taking", e.target.value)}
                />
              </Field>
              <Field label="Authorized activity" error={fieldErrors.authorized_activity}>
                <Textarea
                  className={inputClass("authorized_activity")}
                  value={form.authorized_activity}
                  onChange={(e) => handleField("authorized_activity", e.target.value)}
                  rows={2}
                />
              </Field>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Location
              </h3>
              <Field label="Location" error={fieldErrors.location}>
                <Input
                  className={inputClass("location")}
                  value={form.location}
                  onChange={(e) => handleField("location", e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Latitude" error={fieldErrors.latitude}>
                  <Input
                    className={inputClass("latitude")}
                    value={form.latitude}
                    onChange={(e) => handleField("latitude", e.target.value)}
                    placeholder="-2.345"
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Longitude" error={fieldErrors.longitude}>
                  <Input
                    className={inputClass("longitude")}
                    value={form.longitude}
                    onChange={(e) => handleField("longitude", e.target.value)}
                    placeholder="30.123"
                    inputMode="decimal"
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Dates
              </h3>
              <Field label="Issuance date" error={fieldErrors.issuance_date}>
                <Input
                  type="date"
                  className={inputClass("issuance_date")}
                  value={form.issuance_date}
                  onChange={(e) => handleField("issuance_date", e.target.value)}
                />
              </Field>
              <Field label="Duration" error={fieldErrors.duration}>
                <Input
                  className={inputClass("duration")}
                  value={form.duration}
                  onChange={(e) => handleField("duration", e.target.value)}
                  placeholder="5 years"
                />
              </Field>
              <Field label="Expiration date" error={fieldErrors.expiration_date}>
                <Input
                  type="date"
                  className={inputClass("expiration_date")}
                  value={form.expiration_date}
                  onChange={(e) => handleField("expiration_date", e.target.value)}
                />
              </Field>
            </section>
          </div>
        )}

        {step === "confirm" && (
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Review the changes, then confirm to save. You can go back to edit further.
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {(Object.keys(form) as (keyof FormState)[])
                .filter((k) => form[k] !== initial[k])
                .map((k) => (
                  <li key={k} className="tabular-nums">
                    <span className="font-medium">{k}</span>:{" "}
                    <span className="text-red-600 line-through">{initial[k] || "(blank)"}</span>{" "}
                    →{" "}
                    <span className="text-green-700">{form[k] || "(blank)"}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        <SheetFooter className="gap-2">
          {step === "edit" ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={!dirty} onClick={handleFirstSubmit}>
                Save changes
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => setStep("edit")}
              >
                Back
              </Button>
              <Button type="button" disabled={mutation.isPending} onClick={handleConfirm}>
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Confirm save"
                )}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Confirm sheet, label, textarea components exist**

```bash
ls components/ui/sheet.tsx components/ui/label.tsx components/ui/textarea.tsx 2>&1
```

Expected: all three files exist. If `textarea.tsx` is missing, swap `Textarea` for a multi-line `Input` or install the shadcn textarea.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "edit-registry-drawer" | head -10
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/permit-registry/edit-registry-drawer.tsx
git commit -m "feat(registry): add edit drawer with grouped fields and in-drawer confirm"
```

---

## Task 11: Row actions cell component

**Files:**
- Create: `components/permit-registry/row-actions.tsx`

**Context:** the existing inline Upload/Replace logic lives in `components/permit-registry/permit-registry-list.tsx`. Read the list file first to find the exact Upload/Replace JSX (search for `Upload` and `Replace` around the Actions column render). Copy that same props contract — this task **wraps** the existing Upload/Replace without rewriting it.

- [ ] **Step 1: Extract the Upload/Replace signature**

Search:
```bash
grep -n "onUploadDocument\|handleDocumentUpload\|uploadingDocId" components/permit-registry/permit-registry-list.tsx | head
```

Note the prop names and callback signatures. Use them verbatim below (replace `<UPLOAD_BUTTON_JSX>` with the exact JSX you're pulling out of the list file).

- [ ] **Step 2: Write the component**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { PermitRegistryEntry } from "@/types/database";
import { EditRegistryDrawer } from "./edit-registry-drawer";
import { DeleteRegistryDialog } from "./delete-registry-dialog";

interface Props {
  row: PermitRegistryEntry;
  /**
   * The existing Upload/Replace button, rendered by the list with its own state.
   * Pass a ReactNode so we don't duplicate upload logic.
   */
  uploadButton: React.ReactNode;
}

export function RowActions({ row, uploadButton }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      {/* Desktop: three buttons */}
      <div className="hidden sm:flex items-center gap-1.5">
        {uploadButton}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2"
          onClick={() => setEditOpen(true)}
          aria-label="Edit row"
          title="Edit row"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
          onClick={() => setDeleteOpen(true)}
          aria-label="Delete row"
          title="Delete row"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Mobile: kebab menu */}
      <div className="sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              aria-label="Row actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setDeleteOpen(true)}
              className="text-red-600 focus:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {uploadButton}
      </div>

      <EditRegistryDrawer open={editOpen} onOpenChange={setEditOpen} row={row} />
      <DeleteRegistryDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        rowId={row.id}
        permitNumber={row.permit_number}
      />
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "row-actions" | head -10
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/permit-registry/row-actions.tsx
git commit -m "feat(registry): row actions cell with edit + delete + upload passthrough"
```

---

## Task 12: Integrate into the registry list + lock icon

**Files:**
- Modify: `components/permit-registry/permit-registry-list.tsx`

- [ ] **Step 1: Add the import**

Add near the other component imports (after `WaterConcessionMap`):

```ts
import { RowActions } from "./row-actions";
import { Lock } from "lucide-react";
```

Add `Lock` to the existing lucide-react import block if the Lock import line above conflicts — consolidate into one import.

- [ ] **Step 2: Find the Actions cell JSX**

Search for where the current Upload/Replace button is rendered per row inside the `<TableBody>` map. It's the `<TableCell>` in the Actions column containing the Upload/Replace `<Button>`.

- [ ] **Step 3: Replace the Actions cell content**

Replace the inline Upload/Replace button with:

```tsx
<TableCell>
  <RowActions row={entry} uploadButton={<UPLOAD_BUTTON_JSX />} />
</TableCell>
```

Where `<UPLOAD_BUTTON_JSX />` is the JSX that was previously inline. Keep the same `onClick` handler, the same props, the same label ("Upload" / "Replace"). Wrap it in a fragment if needed. Do NOT touch the upload state, file input, or handler — only move the button markup into the `uploadButton` prop.

- [ ] **Step 4: Add the lock icon next to the permit holder**

Locate the `<TableCell>` rendering `entry.permit_holder`. Replace its contents with:

```tsx
<TableCell>
  <div className="flex items-center gap-1.5">
    <span>{entry.permit_holder ?? "—"}</span>
    {entry.manually_edited_at && (
      <Lock
        className="h-3 w-3 text-amber-600 shrink-0"
        aria-label="Manually edited"
      >
        <title>
          Manually edited. Automatic updates from permit activity are suspended
          for this row. Edit again to update — edits persist until the row is
          deleted.
        </title>
      </Lock>
    )}
  </div>
</TableCell>
```

Since lucide icons don't accept `<title>` children reliably, use a wrapping `<span>` with `title` attribute as the tooltip fallback:

```tsx
<TableCell>
  <div className="flex items-center gap-1.5">
    <span>{entry.permit_holder ?? "—"}</span>
    {entry.manually_edited_at && (
      <span
        title="Manually edited. Automatic updates from permit activity are suspended for this row. Edit again to update — edits persist until the row is deleted."
      >
        <Lock className="h-3 w-3 text-amber-600 shrink-0" aria-label="Manually edited" />
      </span>
    )}
  </div>
</TableCell>
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "permit-registry-list" | head -10
```

Expected: no output.

- [ ] **Step 6: Start dev and do a browser smoke test**

```bash
npm run dev
```

In the browser, log in as a staff user and open the permit registry page. Verify the following in order. **Each step must produce the described result before moving on.**

1. **Baseline:** the table renders with `Previous`, `Page N of M`, `Next` pagination. Each row has three action buttons on desktop (Upload/Replace, pencil, trash).
2. **Edit happy path:** click ✏️ on any row. Drawer slides in from the right. Change `Permit holder` to "SMOKETEST HOLDER" and click `Save changes`. The drawer switches to the confirm step and shows `permit_holder: <old> → SMOKETEST HOLDER`. Click `Confirm save`. Drawer closes, toast says "Row updated". The row in the table now shows "SMOKETEST HOLDER" with a 🔒 icon next to it. Refresh the page — still there.
3. **Edit cancel:** click ✏️ on another row. Change a field. Click `Cancel`. Drawer closes, no toast, row unchanged.
4. **Edit validation:** click ✏️. Enter `Latitude: 999`. Click `Save changes`. Red border on the latitude input, error text visible. Change to `45` → red border clears → Save → Confirm → toast.
5. **Edit stale:** open the edit drawer on a row. In a psql session, manually bump `updated_at`: `update public.permit_registry set updated_at = now() where id = '<that-id>'`. Back in the browser, change a field and confirm save. Toast: "This row changed while you were editing. Refresh to see the latest values."
6. **Delete happy path:** click 🗑️ on a throwaway row you inserted or your SMOKETEST row from step 2. AlertDialog shows. Click `Cancel` first — dialog closes, row still there. Click 🗑️ again, then `Delete`. Dialog closes, toast "Row deleted", row disappears from the list. Refresh — still gone.
7. **Undelete via DB:** `update public.permit_registry set deleted_at = null, permit_holder = '<original>', manually_edited_at = null where id = '<that-id>'`. Refresh the browser; row reappears without the lock icon.
8. **Upload unchanged:** click `Upload` / `Replace` on a row. The existing upload flow still works (file picker, upload, name appears).
9. **Pagination + jump unchanged:** jump to page 5, then back to 1. The fix from earlier today still works.

Any failure → stop, fix, re-run.

- [ ] **Step 7: Commit**

```bash
git add components/permit-registry/permit-registry-list.tsx
git commit -m "feat(registry): wire row actions and lock icon into the list"
```

---

## Task 13: Push to both remote branches

- [ ] **Step 1: Re-run the sync-guard verification one more time**

```bash
node scripts/verify-registry-sync-guard.mjs
```

Must print `✅ sync-guard verification PASSED`. If not, stop.

- [ ] **Step 2: Push to prod**

```bash
git push origin chore/stage-unstaged-2026-03-01
```

- [ ] **Step 3: Fast-forward staging**

```bash
git push origin chore/stage-unstaged-2026-03-01:chore/stage-unstaged-2026-03-01-uat
```

- [ ] **Step 4: Verify both remotes**

```bash
git log --oneline origin/chore/stage-unstaged-2026-03-01 -1
git log --oneline origin/chore/stage-unstaged-2026-03-01-uat -1
```

Both must print the same commit hash ending in the last commit from Task 12.

---

## Self-review checklist (reviewer: fill in before starting)

- [ ] Spec item **"Migration adds `deleted_at` + `manually_edited_at`"** → Task 1 ✓
- [ ] Spec item **"Sync guard via `.is()` filters"** → Task 4 ✓
- [ ] Spec item **"Sync-after-edit integration test"** → Task 7 ✓
- [ ] Spec item **"PATCH + DELETE API with 400/404/409"** → Task 6 ✓
- [ ] Spec item **"Optimistic concurrency via updated_at"** → Task 6 Steps 1, 3 ✓
- [ ] Spec item **"GET filter deleted_at is null"** → Task 3 ✓
- [ ] Spec item **"Zod schema shared API + form"** → Task 5 (exported) + Task 10 (imported) ✓
- [ ] Spec item **"react-query mutations with invalidateQueries"** → Task 8 ✓
- [ ] Spec item **"Confirm-inside-drawer"** → Task 10 (two-step state) ✓
- [ ] Spec item **"AlertDialog for delete"** → Task 9 ✓
- [ ] Spec item **"Lock icon on manually_edited_at rows"** → Task 12 Step 4 ✓
- [ ] Spec item **"Desktop three buttons, mobile kebab menu"** → Task 11 ✓
- [ ] Spec item **"Browser smoke test script"** → Task 12 Step 6 ✓
- [ ] Spec item **"Push to prod + staging"** → Task 13 ✓

---

## Rollback

If something goes wrong post-deploy:

1. **UI only:** `git revert <commit>` the UI task (12) and push. The API and sync guard stay safe.
2. **API misbehaves:** revert Task 6 and Task 12. Schema stays (additive, harmless).
3. **Sync guard wrong:** revert Task 4. The `manually_edited_at` column becomes dead weight but causes no bug.
4. **Full rollback:** revert Tasks 12 → 1 in reverse order. The migration columns can stay forever — they're nullable and unread by old code.
