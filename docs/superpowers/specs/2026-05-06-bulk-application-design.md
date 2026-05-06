# Bulk Application Process — Design Spec
**Date:** 2026-05-06  
**Branch:** `chore/stage-unstaged-2026-03-01-uat` (UAT only until user approves)  
**Status:** Approved for implementation

---

## Overview

Introduce a bulk water permit application flow for specific accounts (e.g., WASAC GROUP LTD). A bulk application covers multiple water supply networks within a single district under one parent permit number. The existing application form, assessment, contract, permit PDF, and registry are all extended — no new pages or routes.

---

## 1. Database Schema

### Migration 1 — `users` table
```sql
ALTER TABLE users ADD COLUMN is_bulk_applicant boolean NOT NULL DEFAULT false;
```
Set by admin via the admin user management UI. Applicants cannot self-assign.

### Migration 2 — `applications` table
```sql
ALTER TABLE applications ADD COLUMN is_bulk boolean NOT NULL DEFAULT false;
ALTER TABLE applications ADD COLUMN bulk_networks jsonb;
```

`bulk_networks` is an array of network row objects:
```json
[
  {
    "number": 1,
    "network_name": "Karongi Network A",
    "sector": "Rugabano",
    "cell": "Kabeza",
    "village": "Rugeyo",
    "coordinates": "-2.123, 29.456",
    "capacity_m3_day": 120,
    "abstraction_method": "pumping"
  }
]
```

`is_bulk` is set automatically at draft creation when `user.is_bulk_applicant = true`. Never toggled manually.

Renumbering rule:
- **In the form UI (before save):** deleting a row renumbers remaining rows live (1, 2, 3… no gaps)
- **On save (draft/submit):** persisted `bulk_networks` always has clean sequential `number` fields with no gaps

### Migration 3 — `permits` table
```sql
ALTER TABLE permits ADD COLUMN parent_permit_id uuid REFERENCES permits(id);
ALTER TABLE permits ADD COLUMN network_sequence_index integer;
```
Parent permit: both columns NULL. Child permits: `parent_permit_id` = parent UUID, `network_sequence_index` = the network row's `number`.

---

## 2. TypeScript Types (`types/database.ts`)

```typescript
export interface BulkNetworkRow {
  number: number;
  network_name: string;
  sector: string;
  cell: string;
  village?: string;
  coordinates?: string;
  capacity_m3_day?: number;
  abstraction_method?: string;
}
```

`User` gains `is_bulk_applicant?: boolean`.  
`Application` gains `is_bulk?: boolean` and `bulk_networks?: BulkNetworkRow[]`.  
`Permit` gains `parent_permit_id?: string` and `network_sequence_index?: number`.

---

## 3. Application Form (`components/dashboard/application-form.tsx`)

`is_bulk_applicant` is read from the `/api/auth/me` session and passed as a prop into the form.

### Bulk-only sections (hidden for non-bulk users)

**After water source selection:**
- "Select District" dropdown — reuses `getFormattedDistrictOptions()` from `rwanda-administrative-data.ts`. Stored in the existing `district` field.

**Network rows table** — rendered below the district selector:
- Columns: `#` | `Network Name` | `Sector` | `Cell` | `Village` | `Coordinates` | `Capacity (m³/day)` | `Water Abstraction Method` | `Actions`
- Defaults to 5 empty rows on new application
- "Add Row" button appends a new row; rows renumber live on delete
- Each row's abstraction method uses the same dropdown options as the existing `water_taking_method` field
- No district column (all rows share the same district)

**Permit Duration** — existing field, one value shared across all networks.

**Land Ownership section** — not rendered for bulk users.

**Payment section** — no changes.

**Draft saving** — `bulk_networks` array is serialized and saved to `applications.bulk_networks` on every draft save alongside all other fields.

---

## 4. Staff / Assessor View

### Application view (all staff roles, including assessor)
Read-only. Shows:
- Selected district
- Full network rows table (all columns, no editing)
- "BULK" badge next to the application number in all list views

### Assessment report (`components/inspection/assessment-report-form.tsx`)
Gains a new "Network Rows" section showing all rows from the application. The assessor can **edit output values per row** (capacity m³/day, abstraction method, coordinates) but **cannot add or delete rows**.

On save, edited rows are stored via `app/api/staff/applications/[id]/assessor-adjustments/route.ts` as `bulkNetworks` in the adjustments JSON — the same pattern used today for `assessor_recommended_volume_m3`.

No renumbering at assessment stage.

### Source of truth for downstream stages
When generating contract, permit preview, or issuing permits:
1. Check `assessorAdjustments.bulkNetworks` first
2. Fall back to `application.bulk_networks` if no assessor adjustment exists

### Other staff roles (reviewer, verifier, approver)
Read-only display of the final network rows table (assessor-adjusted version if it exists, otherwise original).

---

## 5. Permit Generation (`app/dashboard/application/[id]/terms/page.tsx`)

On terms acceptance for a bulk application, instead of one permit insert:

### Parent permit
- Insert one `permits` row with `permit_number = NULL` (DB trigger auto-generates next sequential number, e.g., `000918/RWB/2026`)
- `parent_permit_id = NULL`, `network_sequence_index = NULL`
- `water_allowance` = total capacity across all networks (sum of `capacity_m3_day`)

### Child permits
- Loop over final network rows; insert one `permits` row per row
- Pass `permit_number` explicitly as `{parentSeq}_{row.number}/RWB/{year}` (e.g., `000918_1/RWB/2026`) — bypasses DB trigger
- Each child: `parent_permit_id = <parent UUID>`, `network_sequence_index = row.number`
- Each child: `water_allowance = row.capacity_m3_day`, location fields from the network row

### Permit registry sync
- Each child permit is synced to `permit_registry` individually via `syncRegistryViaApi`
- Parent permit is not synced to the registry
- Registry entries: `000918_1/RWB/2026`, `000918_2/RWB/2026`, etc.

### Modifications / renewals / transfers
Operate on individual child permits only (e.g., transfer `000918_1/RWB/2026`). Existing flow unchanged.

---

## 6. Permit PDF & Public View

### One PDF only
The parent permit PDF (`000918/RWB/2026`) contains:

**Body text (English + Kinyarwanda bilingual, matching WASAC docx template):**
> "[Company name] with its registered list as follows, represented by [representative], is authorized to abstract water from [N] water supply networks located in [District] as described in attached annex. Water abstracted will be used for water supply. This water permit is valid from [start date] to [end date]. In addition to [standard conditions clause]..."

**Annex table:**
| Permit Number | Network Name | Sector | Cell | Village | Coordinates | Capacity (m³/day) | Water abstraction method |
|---|---|---|---|---|---|---|---|
| 000918_1/RWB/2026 | ... | ... | ... | ... | ... | ... | ... |

No individual child permit PDFs.

### Permit registry — view PDF
Clicking "View Permit PDF" on any child registry row (`000918_1/RWB/2026`) resolves to the parent permit and serves the parent PDF.

### Public permit view page (`/permit/view/[permitNumber]`)
- Accepts both parent and child permit numbers
- For a child permit number: looks up parent via `parent_permit_id`, renders parent permit details + full annex table of all child networks
- QR codes are only on the parent PDF; child registry entries link to the parent permit's public view URL

### `lib/permit-number-utils.ts`
Add handling for the `{seq}_{index}/RWB/{year}` child format so all existing lookup/normalization logic (QR scan, registry lookup, permit number matching) handles child permit numbers correctly.

---

## 7. Contract Preview

### Bulk contract body
Replaces single-location paragraph with:
> "[Company] is authorized to abstract water from [N] water supply networks located in [District] as described in attached annex."

Permit number in contract header = parent permit number (`000918/RWB/2026`).

### Annex table
Same structure as permit annex, populated from final network rows (assessor-adjusted if exists). At **contract preview time** (before terms acceptance), the Permit Number column is blank — child permits do not exist yet, same as how regular contracts omit the permit number before issuance. After terms acceptance, the issued **permit PDF** annex contains the real child permit numbers.

### Variant detection
`selectPermitVariant()` returns `bulk_water_supply` when `application.is_bulk = true`. This drives `contract-terms.ts` and `lib/pdf-permit-server.ts` to render bulk templates.

Existing non-bulk contracts: zero impact.

---

## 8. Supporting Changes

### Admin UI
Existing admin user edit form gains a "Bulk Applicant" toggle that sets `is_bulk_applicant`. Admin-only.

### Application list views
Bulk applications show a "BULK" badge next to the application number in all staff list views (assessor, reviewer, verifier, approver, admin dashboards).

### `lib/permit-variant.ts`
New variant: `"bulk_water_supply"`. `selectPermitVariant()` checks `application.is_bulk` first and returns this variant before the existing individual/organization checks.

---

## 9. Out of Scope

- Bulk application for non-water-supply activities
- Bulk modifications (modifications operate on individual child permits)
- Bulk renewals (renewals operate on individual child permits)
- Bulk transfers (transfers operate on individual child permits)
- Adding new networks after a permit is issued
