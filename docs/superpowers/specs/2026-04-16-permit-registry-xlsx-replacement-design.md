# Permit Registry XLSX Replacement

**Date:** 2026-04-16

## Problem

RWB maintains a master Excel spreadsheet (`PERMITS REGISTER February 2026.xlsx`) as the authoritative water-permit registry. The current system can only ingest CSV, enforces `UNIQUE(permit_number)`, and requires non-null `permit_holder` + `permit_number`. The Feb 2026 file has **1309 data rows** but only 921 unique permit numbers — 388 rows (30%) would be silently dropped by the current ingest:

| Lost type | Count | Reason |
|---|---|---|
| Multi-source permits (8 groups) | 373 | Same permit_number per water source — e.g. GICUMBI DISTRICT × 93 springs |
| Transfer history (17 groups) | 17 | Same permit, different holders before/after transfer |
| No permit_number | 6 | Continuation rows for YUMN LTD / NGALI ENERGY |

Additional parser gaps: Excel serial dates (`41493`), annotated dates (`18/09/2014 (Amended to 3/7/2020)`), 37 distinct free-form status values, no XLSX library in the project.

## Decisions

| Decision | Choice |
|---|---|
| Replace strategy | Wipe & load (TRUNCATE + fresh INSERT in one transaction) |
| Row keying | Drop `UNIQUE(permit_number)`, drop `NOT NULL` on holder/number, add `row_index` column |
| Parse location | Server-side SheetJS (`xlsx` npm package), accept binary `.xlsx` upload |
| Downstream sync | `syncPermitToRegistry` updates ALL matching rows per permit_number |
| Date handling | Parse strict + store raw in `issuance_date_raw` / `expiration_date_raw` columns |

## Data Model Changes

Migration: `database/migrations/2026-04-16-permit-registry-relax-for-xlsx-load.sql`

```sql
-- Allow multiple registry rows per permit_number and empty permit/holder cells
ALTER TABLE public.permit_registry DROP CONSTRAINT IF EXISTS permit_registry_permit_number_key;
ALTER TABLE public.permit_registry ALTER COLUMN permit_holder DROP NOT NULL;
ALTER TABLE public.permit_registry ALTER COLUMN permit_number DROP NOT NULL;

-- Preserve xlsx row order
ALTER TABLE public.permit_registry ADD COLUMN IF NOT EXISTS row_index integer;

-- Store original unparseable date strings
ALTER TABLE public.permit_registry ADD COLUMN IF NOT EXISTS issuance_date_raw text;
ALTER TABLE public.permit_registry ADD COLUMN IF NOT EXISTS expiration_date_raw text;

-- The existing btree index idx_permit_registry_permit_number already provides
-- non-unique lookup after the UNIQUE constraint is dropped. No new index needed.
```

## Ingest Pipeline

### Endpoint

`POST /api/staff/permit-registry/ingest`

- Content-Type: `multipart/form-data` with a single `file` field (`.xlsx` or `.xls`).
- Rejects non-Excel files with 400.
- Runs inside a PG transaction: `BEGIN` → `TRUNCATE permit_registry CASCADE` → bulk `INSERT` → `COMMIT`. Rollback on any failure preserves the previous state.

### Per-Row Processing

For each row in sheet `REGISTER` (skipping header row 1):

1. Read 16 cells (A–P) via SheetJS typed cell reader.
2. Build row payload:
   - `serial_number` = A as integer or NULL
   - `permit_holder` = B trimmed or NULL (no NOT NULL gate)
   - `permit_number` = C trimmed or NULL (no NOT NULL gate, no uniqueness gate)
   - `regime` = D trimmed or NULL (accepts any string including "Declaration")
   - `water_source` = E or NULL
   - `volume_or_area` = F or NULL
   - `method_of_water_taking` = G or NULL
   - `authorized_activity` = H or NULL
   - `location` = I or NULL
   - `latitude`/`longitude` = `parseCoordinate(J/K)` (existing helpers)
   - `issuance_date` = `parseDateCell(L)` — handles Excel serials + DD/MM/YYYY strings
   - `issuance_date_raw` = L original text (always populated if non-empty)
   - `duration` = M or NULL
   - `expiration_date` = `parseDateCell(N)`
   - `expiration_date_raw` = N original text
   - `status` = O trimmed, stored verbatim (no uppercasing)
   - `contact` = P or NULL
   - `row_index` = 1-based sequential index (Excel row 2 → row_index 1, Excel row 1310 → row_index 1309)
3. Compute `map_status` + `map_purpose` from parsed values (existing `normalizeMapStatus` / `normalizeMapPurpose`).
4. Compute concession polygon WKT when J/K contain multiple coordinate points (existing `getConcessionPolygonWkt`).
5. Append to insert batch.

### Date Parsing — `parseDateCell(rawValue, cellType)`

```
if cellType is numeric OR raw matches /^\d+(\.\d+)?$/:
  → Excel serial date (epoch 1899-12-30, with Lotus 1900 leap-year bug)
  → return excelSerialToISODate(Number(raw))

else:
  → existing regex parser for ISO (YYYY-MM-DD) and DD/MM/YYYY
  → on failure: return null (the _raw column preserves the original)
```

### Response

```json
{ "success": true, "inserted": 1309, "dateParseFailures": 42, "coordParseFailures": 3 }
```

No `skipped` counter — nothing is skipped.

## GET / Listing Endpoint

`GET /api/staff/permit-registry`

### Changes

The current MERGED_CTE groups by `permit_number`, collapsing multi-source rows. Replace with:

- **Default mode (`include=registry` or omitted):** return registry rows raw, no group-by. Sort by `row_index ASC` (default). Filters (`q`, `regime`, `status`) apply to registry columns. Pagination (limit/offset) works as before.
- **`include=permits_only`:** return system permits with no matching `permit_number` in the registry. Used for a small "system-issued, not in RWB spreadsheet" section.

For the expanded-row "Registry vs Permit Table" comparison: LEFT JOIN `permits` on `permit_number` to populate `permit_values`. Multiple registry rows sharing the same `permit_number` all get the same `permit_values` — correct behavior.

### Summary Counters

- `total` = row count (1309)
- `distinctPermits` = count distinct non-null permit_number (921)
- `operational` / `expired` / `expiringSoon` = based on row count

## UI Changes

File: `components/permit-registry/permit-registry-list.tsx`

1. **Upload button:** accept `.xlsx,.xls`, label "Import XLSX". Confirmation modal: *"Uploading this file will delete all current registry rows and any uploaded permit PDFs. Continue?"* No upload without confirmation.
2. **Upload handler:** POST `multipart/form-data` with `file` field instead of text body.
3. **Stats cards:** add "Distinct Permits" card (921) next to "Total Rows" (1309).
4. **Table:** add `row_index` column as `#` (first column). `serial_number` moves into the expanded detail view.
5. **Raw dates:** when `issuance_date` is NULL but `issuance_date_raw` is non-empty, display the raw text with a "raw" label so auditors see `"18/09/2014 (Amended to 3/7/2020)"`.
6. **Jump-to-page:** add a page-number input next to Previous/Next buttons so staff can reach page 27 without 26 clicks.

## Sync Write-Through

File: `lib/permit/permit-registry-sync.ts`

Replace the current `.limit(1).maybeSingle()` single-row lookup with a multi-row update:

```ts
const { data: matches } = await supabaseClient
  .from("permit_registry")
  .select("id")
  .eq("permit_number", trimmed);
// fall through to ilike if empty

if (!matches?.length) return { synced: false };

const { error } = await supabaseClient
  .from("permit_registry")
  .update(payload)
  .in("id", matches.map(r => r.id));
```

Same `.catch()` / non-blocking semantics. A transfer for `0554/RWB/2022` updates all 93 GICUMBI rows.

## Transfer Application Permit Lookup

File: `lib/permit/public-permit-query.ts`

When an applicant submits a transfer application with a manually-entered permit number, the system calls `findPublicPermitByNumber()` which falls back to `permit_registry` with `LIMIT 1`. After the schema change, a permit_number like `0021/MINIRENA/IWRM/2015` may have 2 rows (old holder → new holder). The query must prefer the **latest** registry entry.

**Change:** Add `pr.row_index DESC NULLS LAST` to the `ORDER BY` in the registry fallback query (line ~148). This ensures the lookup returns the row that appears last in the xlsx — which is typically the current state (e.g., after a transfer).

The snapshot is then stored in `application.internal_notes.permitReference.registrySnapshot` at submission time, so **existing applications (like RWB-2026-000004) are unaffected** — their snapshot was already frozen when the application was created.

### Related components (no changes needed)

| File | Why safe |
|---|---|
| `components/inspection/registry-permit-comparison-card.tsx` | Reads from the frozen snapshot in `internal_notes`, not live from `permit_registry` |
| `components/dashboard/manual-permit-entry-card.tsx` | Calls `/api/dashboard/permit-lookup` which uses `findPublicPermitByNumber` (fixed above) |

## Downstream Consumers — No Changes Needed

| File | Why safe |
|---|---|
| `lib/permit/consolidated-permit-records.ts` | Already dedupes by upper-cased `permit_number` — collapses multi-source rows for dashboard metrics |
| `app/api/public/water-use-dashboard/route.ts` | Funnels through `consolidatePermitRecords` |
| `lib/management-dashboard.ts` | Funnels through `consolidatePermitRecords` |

## Files Changed

| File | Change |
|---|---|
| `database/migrations/2026-04-16-permit-registry-relax-for-xlsx-load.sql` | New — schema migration |
| `app/api/staff/permit-registry/ingest/route.ts` | Rewrite — XLSX parsing, TRUNCATE+INSERT, date helpers |
| `app/api/staff/permit-registry/route.ts` | Rewrite — remove MERGED_CTE, return raw rows, add `include` param |
| `components/permit-registry/permit-registry-list.tsx` | Update — XLSX upload, confirmation modal, stats, raw dates, jump-to-page |
| `lib/permit/permit-registry-sync.ts` | Update — multi-row update |
| `hooks/usePermitRegistryQuery.ts` | Minor — add `distinctPermits` to response type |
| `types/database.ts` | Minor — add `row_index`, `issuance_date_raw`, `expiration_date_raw` to `PermitRegistryEntry` |
| `lib/permit/public-permit-query.ts` | Minor — add `row_index DESC` to registry fallback ORDER BY |
| `package.json` | Add `xlsx` dependency |

## Verification Checklist

- [ ] Exactly 1309 rows land in `permit_registry` after upload
- [ ] Rows 20/21 (YUMN LTD, null permit_number) are visible in the UI
- [ ] All 93 GICUMBI rows (permit `0554/RWB/2022`) are visible and reachable via pagination
- [ ] Row with annotated date (`18/09/2014 (Amended to 3/7/2020)`) shows raw string, parsed date is NULL
- [ ] Row with Excel serial date (`41493`) is correctly parsed to `2013-08-27`
- [ ] Public water-use dashboard counters still make sense (unique permits, not raw rows)
- [ ] Consolidated map still renders point/polygon markers
- [ ] `syncPermitToRegistry` updates all matching rows for a given permit_number
- [ ] TypeScript typecheck passes
- [ ] Upload confirmation modal prevents accidental wipe

## Rollout Plan

1. Feature branch off current prod branch
2. Local verification against the checklist above
3. Push to UAT branch, smoke-test with real login
4. Push to prod branch, run migration, upload xlsx
5. Rollback plan: `pg_dump -t public.permit_registry` taken before upload; restore via `TRUNCATE + psql -f backup.sql`
