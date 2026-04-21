# Permit Registry — Editable & Deletable Rows

**Date:** 2026-04-21
**Status:** Approved (ready for implementation plan)

## Context

The permit registry (`public.permit_registry`) is the authoritative table of all issued permits — historical rows imported from XLSX plus rows kept in sync with newly-issued system permits. Staff currently see the registry as read-only aside from an Upload/Replace document action per row.

**Request:** allow any staff user to edit any field on a row and to delete a row, each gated by an "are you sure?" confirmation. Edits and deletes must persist across refreshes — they must not be silently reverted by the upstream sync layer.

## Goals

1. Staff can edit any mutable field on a registry row through a side drawer.
2. Staff can delete a registry row through a confirm dialog.
3. Edits and deletes persist — the upstream sync layer never silently undoes them.
4. Zero regressions to existing registry list, pagination, upload/replace action, or sync of new permits into un-edited rows.

## Non-goals (explicit)

- No bulk edit / bulk delete.
- No field-level permissions (any staff can edit any field).
- No audit log table — `updated_at`, `manually_edited_at`, and `deleted_at` are the history for v1.
- No restore UI for soft-deleted rows (recoverable only by DB access for now).
- No resume-auto-sync toggle on a manually-edited row (v1 is: once manual, always manual until deleted).

## Users & permissions

Any authenticated staff user can edit and delete. Registry pages are already gated by staff-role middleware; Edit and Delete affordances inherit that gate and are visible to the same set of users who see Upload/Replace today.

## Data model

One additive migration — no drops, no backfills, no renames.

```sql
alter table public.permit_registry
  add column if not exists deleted_at timestamptz null,
  add column if not exists manually_edited_at timestamptz null;

create index if not exists permit_registry_live_idx
  on public.permit_registry (deleted_at)
  where deleted_at is null;
```

Semantics:

- `deleted_at is null` ⇔ row is live. All list queries filter on this.
- `manually_edited_at is not null` ⇔ a staff user has edited this row and the automatic sync layer must leave it alone. Future PATCHes by staff refresh this timestamp but keep the lock in place.

## Persistence guarantee (the "no ghost edits" requirement)

`lib/permit/permit-registry-sync.ts` (`syncPermitToRegistry`) is called from the terms-acceptance page on permit issuance, renewal, transfer, and modification acceptance. Today it updates any `permit_registry` row matching by `permit_number` — which would silently overwrite a manual edit the next time an applicant acts on that permit.

Change to the update query:

```ts
.update(payload)
.in("id", matchIds)
.is("manually_edited_at", null)   // never overwrite a manual edit
.is("deleted_at", null)            // never resurrect a deleted row
```

Rows matched but protected are left untouched. This is the same behavior as the existing "no matching row" case — silently a no-op, logged at info level.

An integration test proves it: PATCH a row → call `syncPermitToRegistry` with a different value for the same field → re-read → assert the manual value is still present.

## API surface

Under `app/api/staff/permit-registry/[id]/`:

### `PATCH /api/staff/permit-registry/[id]`

**Body:** JSON object of changed fields only (partial update).

**Validation:** zod schema, `.strict()` — unknown keys rejected.

| Field | Rule |
|---|---|
| `permit_number` | required, trimmed, non-empty |
| `permit_holder` | required, trimmed, non-empty |
| `regime` | nullable string |
| `water_source` | nullable string |
| `volume_or_area` | nullable string |
| `method_of_water_taking` | nullable string |
| `authorized_activity` | nullable string |
| `location` | nullable string |
| `latitude` | nullable number, `-90..90` |
| `longitude` | nullable number, `-180..180` |
| `issuance_date` | nullable ISO date string |
| `duration` | nullable string |
| `expiration_date` | nullable ISO date string |
| `status` | nullable string, whitelist = distinct values currently in use |
| `contact` | nullable string |

**Immutable fields** (server silently strips): `id`, `row_index`, `serial_number`, `created_at`, `updated_at`, `source_kind`, `uploaded_doc_*`, `deleted_at`, `manually_edited_at`, all `map_*` derived columns.

**Concurrency:** the request carries `?updated_at=<iso>` query param. Server verifies `updated_at` in DB still matches. If not → `409 Conflict` with `{ error: "stale", current: <row> }`. Drawer displays: *"This row changed while you were editing. Refresh to see the latest values."*

**On success:**
- `update public.permit_registry set <fields>, manually_edited_at = now(), updated_at = now() where id = $1 and deleted_at is null`
- returns the full updated row
- `204 No Content` is avoided — client needs the row to update its cache without a full refetch

**Error cases:**
- `400` — validation failure, body includes `issues[]` from zod
- `404` — row not found, or row has `deleted_at`
- `409` — stale `updated_at`
- `500` — DB error, caught and logged

### `DELETE /api/staff/permit-registry/[id]`

No body.

- `update public.permit_registry set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null`
- returns `{ id }` on success
- `404` if row missing or already soft-deleted

### `GET /api/staff/permit-registry/route.ts` (existing)

Add `and deleted_at is null` to the WHERE clause in the list query. Summary counts also filtered. Partial index backs the filter.

## UI

### Row actions cell

The Actions column grows from one `Upload/Replace` button to a three-action group:

| Action | Trigger | Dialog |
|---|---|---|
| Upload / Replace | existing button | existing behavior |
| Edit | pencil icon button | opens side drawer |
| Delete | trash icon button (muted red on hover) | opens AlertDialog |

Desktop: three icon buttons side-by-side in the Actions cell. Mobile (<640px): a single `⋯` kebab menu (shadcn `DropdownMenu`) with the three entries.

A small 🔒 icon renders next to the permit holder name when `manually_edited_at is not null`. Tooltip: *"Manually edited. Automatic updates from permit activity are suspended. Edit again to update — edits persist until the row is deleted."*

### Edit drawer (`Sheet`, right side, ~480px)

**Header:** `Edit permit row — {permit_number}`

**Body** — four grouped sections, each a small `<FieldGroup>`:

- **Identity:** permit_holder, permit_number, regime, status, contact
- **Water:** water_source, volume_or_area, method_of_water_taking, authorized_activity
- **Location:** location, latitude, longitude
- **Dates:** issuance_date (date input), duration, expiration_date (date input)

`regime` and `status` render as `Select` backed by the distinct values already used in the list's filter dropdowns — the same options the user sees when filtering, so no drift. `latitude`/`longitude` accept decimal degrees. Dates accept ISO via a shadcn date-picker with manual entry fallback.

**Client validation** mirrors the server rules. Save is disabled until at least one field differs from the loaded row.

**Footer states:**

1. **Idle:** `Cancel` (secondary), `Save changes` (primary, disabled until dirty)
2. **Confirm (after first click of Save):** header text changes to *"Save these changes to {permit_number}?"*; footer becomes `Back` + `Confirm save`. No second stacked modal.
3. **Saving:** `Confirm save` shows spinner, drawer locked.
4. **Error:** inline field errors for 400s; toast with message for 409 / 500.

**On success:** close drawer, toast `"Row updated"`, `queryClient.invalidateQueries({ queryKey: permitRegistryKeys.all })`. The lock icon appears on the row on next render.

### Delete dialog (shadcn `AlertDialog`)

- Title: `Delete permit {permit_number}?`
- Description: *"This row will be hidden from the registry. This action is reversible only through the database — ask an admin if you change your mind."*
- Buttons: `Cancel` + `Delete` (destructive)
- `Delete` shows spinner while the DELETE fires.
- On success: dialog closes, toast `"Row deleted"`, invalidate queries.
- If the server returns `404 already deleted`: toast *"Row was already deleted"* and invalidate queries (so the list refreshes and the row disappears without an error popup).

## Component boundaries

New files:

```
components/permit-registry/
  row-actions.tsx               # 3-button action cell + kebab fallback, ~80 LOC
  edit-registry-drawer.tsx      # drawer + form + confirm step, ~200 LOC
  delete-registry-dialog.tsx    # AlertDialog wrapper, ~60 LOC
hooks/
  useUpdatePermitRegistry.ts    # react-query useMutation for PATCH
  useDeletePermitRegistry.ts    # react-query useMutation for DELETE
lib/validation/
  permit-registry.ts            # zod schema, shared by API route and form
```

Changes to existing files:

- `components/permit-registry/permit-registry-list.tsx` — import and render `<RowActions row={entry} />` in place of the current inline Upload/Replace button; pass `entry.manually_edited_at` and show lock icon next to `permit_holder`. Net change ~-30 / +10 LOC.
- `app/api/staff/permit-registry/route.ts` — one WHERE clause added.
- `lib/permit/permit-registry-sync.ts` — two `.is()` filters added.
- `hooks/usePermitRegistryQuery.ts` — `PermitRegistryEntry` type already includes `deleted_at` via the raw query; add `manually_edited_at` to the returned result type. No runtime behavior change.
- `types/database.ts` — add `deleted_at` and `manually_edited_at` to `PermitRegistryEntry`.

## Error handling and race conditions

- **Two staff edit simultaneously:** the second save hits `409`, drawer shows "row changed" message. No silent overwrite.
- **Delete while drawer is open:** next save from the drawer returns `404`, drawer shows *"Row no longer exists. Close this drawer."*
- **Network failure:** mutation retries once (react-query default), then toast with Retry.
- **Cache:** every success path calls `invalidateQueries({ queryKey: permitRegistryKeys.all })`, which refetches the current page and any cached nearby pages used by pagination.
- **Sync races manual edit:** impossible on the same field — PATCH sets `manually_edited_at` in the same statement as the field updates, and sync's WHERE clause checks `manually_edited_at is null`. Interleaving cannot produce a partial overwrite.

## Testing

**Unit — `lib/validation/permit-registry.ts`:**
- valid payload → parses
- missing `permit_number` → fails
- `latitude: 91` → fails
- `longitude: null` → passes
- unknown key → fails
- bad date string → fails

**API — integration tests with a real (test) DB:**

| Test | Expectation |
|---|---|
| PATCH happy path | 200, DB row updated, `manually_edited_at` set |
| PATCH with stale `updated_at` | 409, DB unchanged |
| PATCH nonexistent id | 404 |
| PATCH soft-deleted row | 404 |
| DELETE happy path | 200, `deleted_at` set, list query excludes the row |
| DELETE already-deleted row | 404 |
| **Sync-after-edit** | PATCH field → call syncPermitToRegistry with a different value → re-read → manual value persists, `manually_edited_at` unchanged |

**UI smoke test:**
- Open drawer, change `permit_holder`, click Save → Confirm → toast "Row updated" → row text updates → lock icon appears.
- Open delete dialog, Cancel → dialog closes, row intact.
- Open delete dialog, Confirm → toast "Row deleted" → row disappears.

**Regression sanity:**
- Jump-to-page (just shipped) still works after these changes.
- Upload/Replace action unchanged.
- Map view on the registry page still renders rows correctly (derived `map_*` fields unaffected — the BEFORE UPDATE trigger still runs on PATCH and recomputes them).

## Rollout

1. Ship the migration first (prod + staging). Additive only, no backfill, zero-risk.
2. Ship the sync guard + API + UI together. Safe to revert — the migration stays either way.
3. Monitor for `409 Conflict` rates in server logs for the first week — a spike would indicate unexpected concurrent editing pattern.

## Open questions

None remaining. Decisions captured inline:

- Any staff can edit/delete.
- Soft delete; no restore UI in v1.
- Row-level lock (not field-level) on manual edit.
- Confirm-inside-drawer for edit (not stacked modal); AlertDialog for delete.
- Optimistic concurrency via `updated_at` compare.
- No audit log in v1; rely on `updated_at`, `manually_edited_at`, `deleted_at`.
