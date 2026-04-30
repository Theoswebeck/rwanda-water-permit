# Management Dashboard — Permit Registry Sync & Panel Cleanup

**Date:** 2026-04-30
**Status:** Approved (ready for implementation plan)
**Scope:** `/management` only (and one shared module + a tiny refactor of `/api/staff/permit-registry` to call it)

## Context

`/management` is the regulator/decision-maker dashboard. Today its numbers do not match what the same regulator sees on `/permit-registry`, double-counts applications across two panels, and renders inspection content on the wrong tab.

Concrete reproduction (production, 2026-04-30):

- Top permit KPIs report **Total permits issued: 925 / Active: 877 / Expired: 48 / Suspended: 0**, but the Permit Registry page (`/permit-registry`, also used inside Approver / Reviewer / Verifier dashboards) is the single page the same staff trust as ground truth, and its totals do not match.
- The "Pending applications by stage" panel duplicates the four KPI cards above it (Pending Verification appears in both, Pending Final Approval == "Pending Approval", etc.).
- "Inspection recommendation breakdown" is rendered on the Portfolio Overview tab even though the rest of inspection content lives on the Compliance & Enforcement tab.

## Root cause analysis

### Permit count drift

| Concern | `/api/staff/permit-registry` (truth) | `lib/management-dashboard.ts` (current) |
|---|---|---|
| Data path | Direct Postgres via `lib/db/postgres` | Browser-side `supabase.from(...)` |
| Soft-delete filter | `WHERE deleted_at IS NULL` | **Missing** — counts soft-deleted rows |
| Status matching | Substring (`%OPERATIONAL%`, `%EXPIRED%`, `%CANCEL%`, plus `expiration_date BETWEEN today AND today+3 months`) | Exact-string normaliser in `consolidated-permit-records.ts:128-144`. `OPERATIONAL` → active ✓; `EXPIRED` → expired ✓; **`CANCELLED` → falls through default → "active" (BUG)** |
| Vocabulary | Operational / Expired / Cancelled / Expiring soon | Active / Expired / Suspended / New permits (monthly) |
| Universe of rows | `permit_registry` only | `permits` table merged with `permit_registry`, deduped by normalised permit number — `permits` rows can win the dedupe and project a different status onto a registry permit |
| Pagination | None (server-side count) | Default Supabase REST cap of 1000 rows — registry is at ~925, close to silent truncation |

### Double application panels

Top KPI row already shows `totalApplications`, `inProcessApplications`, `pendingVerificationApplications`, `pendingFinalApprovalApplications`. The "Pending applications by stage" card re-renders the same data (Submitted / Pending assessment / Pending review / Pending verification / Pending final approval). Pending Verification and Pending Final Approval appear twice.

### Inspection panel issues

- "Inspection recommendation breakdown" is inside the `section === "portfolio"` branch of `app/management/page.tsx` (lines ~677-699).
- `lib/management-dashboard.ts` filters inspections via `applicationIdSet.has(i.application_id)`, so manual / `permit_registry`-owned inspections (those with `owner_kind = 'permit_registry'` and no application in the filtered set) are silently dropped from compliance counts.

## Goals

1. **Permit numbers on `/management` match `/permit-registry` exactly** — both for the four headline buckets and for any future change to the registry's counting rules (the user plans to fold `permits`-table data into the registry later; `/management` must inherit that change for free).
2. **Drop the duplicate "Pending applications by stage" card.** Replace its grid slot with a "Permits by status" breakdown card that reinforces the registry-sync story.
3. **Move "Inspection recommendation breakdown" off Portfolio Overview** to the Compliance & Enforcement tab where the rest of inspection content lives.
4. **Inspection counts include manual / registry-owned inspections** so compliance numbers are not silently low.
5. **Switch the page from 5 client-side Supabase calls to one server endpoint** so we are not dependent on RLS visibility or the 1000-row REST cap.

## Non-goals (explicit)

- No DB migrations.
- No changes to `/permit-registry` UI, no changes to its response shape, no changes to its query params. Only the SQL is moved into a shared module.
- No changes to any page other than `/management` (and the internal refactor noted above).
- No new chart libraries.
- No new auth roles.

## Approach

### 1. Single source of permit-counting SQL

Create `lib/permit/registry-counts.ts` that owns:

- the WHERE-clause builder for the four buckets and the live-row filter (`deleted_at IS NULL`),
- the summary aggregation (`total / operational / expired / cancelled / expiringSoon / regimeTypes`),
- the listing query (used by `/api/staff/permit-registry`),
- a new pure aggregator: distributions by water source, by authorised activity, by issuance month (used by `/api/management/dashboard`),
- abstraction sums in m³/day and m³/year (parsing `volume_or_area`).

Both endpoints call this module. When the user later expands the registry to also include `permits`-table rows, this is the only file that changes — both pages stay in sync by construction.

### 2. New server endpoint `/api/management/dashboard`

`app/api/management/dashboard/route.ts` (`GET`) returns the entire `ManagementDashboardData` shape in one round-trip. Auth follows the existing `/api/staff/applications/summary` pattern: session cookie → `verifySessionToken` → `resolveEffectiveRoles` → allow `reviewer | inspector | verifier | assessor | approver | admin` plus `SUPERUSER_EMAILS`.

Query params (all optional) mirror the current `ManagementDashboardFilters`:

```
period       = monthly | quarterly | annually   (default: monthly)
from         = YYYY-MM-DD
to           = YYYY-MM-DD
province     = Kigali | Northern | Southern | Eastern | Western | "all"
district     = string | "all"
sector       = string | "all"
catchment1   = string | "all"
catchment2   = string | "all"
waterSource  = river | lake | groundwater | borehole | surface_water | spring | other | "all"
waterPurpose = domestic | irrigation | industrial | electricity_generation | mining | fish_farming_lakes | recreation | other | "all"
```

#### Filter scoping rules

| Filter | Apps | Inspections | Feedback | Permit KPIs / abstraction |
|---|---|---|---|---|
| `period` / `from` / `to` | yes (`submitted_at`/`created_at`) | yes (`completed_date`/`created_at`) | yes (`created_at`) | only `newPermitsIssued` (issued in window) |
| `province` / `district` / `sector` | yes | yes (via app or registry owner) | yes (via app) | **no** — registry rows have no admin fields |
| `catchment1` / `catchment2` | yes | yes (via app) | yes (via app) | **no** |
| `waterSource` | yes | yes (via app) | yes (via app) | yes — `permit_registry.water_source` |
| `waterPurpose` | yes | yes (via app) | yes (via app) | yes — `permit_registry.authorized_activity` |

The page surfaces a small inline hint under the permit KPIs:

> Permit counts reflect the entire permit registry. Province / district / sector / catchment filters apply to applications, inspections, and feedback only.

### 3. Response shape

Existing `ManagementDashboardData` type (in `lib/management-dashboard.ts`) is preserved with these adjustments:

- `portfolio.kpis` gains `cancelled: number` and `expiringSoon: number`.
- `portfolio.kpis.suspended` and `portfolio.kpis.revoked` are deprecated — they remain in the type for one release with `0` values to avoid breaking other (currently zero) consumers, but are not displayed.
- New top-level `meta: { permitsScopeNote: string; warnings: string[] }`.

`hooks/useManagementDashboardQuery.ts` keeps its public signature `(filters) => UseQueryResult<ManagementDashboardData, Error>`, only the `queryFn` body changes (now a `fetch` to the new endpoint).

`lib/management-dashboard.ts` becomes a thin client fetcher that calls the endpoint. The current 700-line file shrinks to ~50 lines.

### 4. Page-level UI changes (`app/management/page.tsx`)

Portfolio Overview tab, in order from top:

- **Top KPI row (unchanged)** — Total Applications / In Process / Pending Verification / Pending Approval. Source: server endpoint.
- **Feedback KPI row (unchanged)** — Feedback submissions / Average feedback rating.
- **Permit KPI row (NEW labels & buckets)** — five cards: Total permits issued / Operational / Expired / Cancelled / Expiring soon (≤ 3 months). Replaces the old Active / Expired / Suspended / New permits row. Inline scope-note caption sits beneath this row.
- **Two-column section** —
  - Left: Permits by water source type (unchanged).
  - Right: **Permits by status** — new horizontal bar card showing Operational / Expired / Cancelled / Expiring soon with counts and percentages. Replaces "Pending applications by stage".
- **Two-column feedback section (unchanged)** — Recent applicant feedback / Feedback rating breakdown.
- **Inspection recommendation breakdown is REMOVED from this tab.**

Compliance & Enforcement tab:

- **Top KPI row (unchanged)** — Fully compliant / Partially compliant / Non-compliant / Inspections conducted.
- **Compliance parameters card (unchanged).**
- **Inspection recommendation breakdown card (MOVED here from Portfolio).**

Sidebar "Quick hints" copy updates to reflect the new sourcing — replace "Permit counts come from the consolidated permit dataset" with "Permit counts come from the official permit registry (matches /permit-registry exactly)."

### 5. Inspection count fix

The new endpoint queries `inspections` with a JOIN/UNION that resolves the inspection's "owner" application either through `inspections.application_id` (the legacy column) or through `inspections.owner_id` when `inspections.owner_kind = 'application'`, AND counts `owner_kind = 'permit_registry'` inspections too. Geo filters that come from an application use the resolved application; for `permit_registry`-owned inspections, geo filters that the registry cannot answer (province / district / sector / catchment) are treated as non-matching when those filters are set, otherwise the inspection counts. Period/date filters apply uniformly via `completed_date`/`created_at`.

The schema-drift fallbacks already in `lib/management-dashboard.ts` (`isMissingRelationError`, missing `recommendations` column) are preserved in the new endpoint.

## Edge cases & failure modes

| Case | Behaviour |
|---|---|
| `permit_registry` table missing | Endpoint returns zeros for all permit metrics; `meta.warnings` includes "permit_registry table missing"; page renders with N/A states (current copy preserved). |
| `inspections` table missing | As today — empty compliance metrics, `meta.warnings` notes it. |
| `inspections.recommendations` column missing | Same fallback as today's `extractMissingColumnFromError` in `lib/management-dashboard.ts`. |
| `portal_feedback` table missing | Empty feedback; `meta.warnings` notes it (not previously handled — improvement). |
| Date filter only `from` set, no `to` | Server treats as open-ended interval `[from, ∞)`. Same for `to`-only. |
| Soft-deleted registry row referenced by an inspection | Inspection still counts (compliance signal), but the permit it points to is excluded from permit KPIs (matches `/permit-registry`). |
| `permit_registry.expiration_date` null | Excluded from "Expiring soon" bucket. Counted toward Operational/Expired/Cancelled per `status` substring rules. |
| Auth absent or expired | 401 with `clearSessionCookie`, page shows existing error toast via `useQuery` `error` handler. |
| Auth present but role disallowed | 403 — page already gates access via `ProtectedRoute`, so this is a defense-in-depth check. |

## Testing strategy

Manual smoke test against staging is the historical pattern in this repo (no test runner). The plan adds a `lib/permit/__tests__/registry-counts.spec.ts` only if the team uses one — otherwise the verification is:

1. Open `/permit-registry` and `/management` side by side as the same staff user. Record the registry's summary numbers (Total / Operational / Expired / Cancelled / Expiring soon).
2. The five Permit KPI cards on `/management` Portfolio Overview must equal those numbers exactly, with no filters applied.
3. Apply a `province` filter on `/management`. Permit KPIs MUST stay equal to the registry totals (geo filters do not apply to permit KPIs by design). Application/inspection/feedback metrics MUST narrow.
4. Toggle to Compliance & Enforcement tab. Inspection recommendation breakdown card appears here, not on Portfolio.
5. Submit a `permit_registry` soft-delete via the existing edit drawer; confirm both pages drop that row from totals.

## Rollback

The change is isolated to:

- `app/api/management/dashboard/route.ts` (new file — delete to roll back)
- `lib/permit/registry-counts.ts` (new file — delete to roll back)
- `lib/management-dashboard.ts` (revert to previous Git revision)
- `hooks/useManagementDashboardQuery.ts` (revert to previous Git revision)
- `app/management/page.tsx` (revert to previous Git revision)
- `app/api/staff/permit-registry/route.ts` (revert to previous Git revision — no behavior change to begin with)

A single `git revert` of the implementation commit restores the prior behavior. No DB migration to undo.

## Open questions (resolved)

- **Source of truth for permit counts** → `permit_registry` only, via shared module. Resolved 2026-04-30.
- **Application panels deduplication** → keep top KPIs, drop "Pending applications by stage", replace slot with "Permits by status". Resolved 2026-04-30.
- **Inspection card placement** → move to Compliance only, count manual/registry-owned inspections. Resolved 2026-04-30.
- **Status vocabulary** → match registry exactly (Operational / Expired / Cancelled / Expiring soon). Drop Suspended and "New permits (monthly)" from the Portfolio KPI row. Resolved 2026-04-30.
- **Geo-filter behaviour for permit counts** → ignored, with inline scope hint. Resolved 2026-04-30.
- **Data path for apps/inspections/feedback** → server endpoint for everything. Resolved 2026-04-30.
- **Shared-module refactor of `/api/staff/permit-registry`** → yes, behavior-preserving extraction so `/management` and `/permit-registry` cannot drift. Resolved 2026-04-30.
