# Management & Public Dashboards — Design

**Date:** 2026-08-05
**Source requirement:** `Management & Public Dashboards.docx` (RWB)
**Status:** implemented

## Requirement, verbatim

> **a) Internal Dashboard (as per the Permit Registry and the Inspection Registry)**
> On Permit Registry:
> - To replace Regimes dropdown by Activities dropdown
> - To replace Regime column (in the table) by Activity column
>
> **b) Public Dashboard (as per the Permit Registry only)**
> - To hide the table (the registry)
> - To show the following tabs: Total Permits, Permits per District, Permits Per Catchment, Permits Per Activity

Scope confirmed with the requester: (a) is exactly the two Permit Registry changes — the Management Dashboard's own metrics are out of scope. (b) shows aggregate numbers only, over all 1,318 registry rows (not just active ones), with the leftover hidden dashboard code removed.

## The data we actually have

Measured against production (1,318 registry rows on 2026-08-05):

| Field | Reality |
|---|---|
| `authorized_activity` | Free text, 122 distinct spellings — `water supply` / `Water Supply` / `Domestic water supply`, `Coffee washing station` / `Coffee Wahing Station` / `CWS`, `Irrigation of 10Ha`, and `company water permit application for irrigation` for system-issued permits. 44 rows blank. |
| `location` | Free text, e.g. `Western Province, Nyamasheke District, Karengera Sector, Miko Cell` — but also bare `Gicumbi District`, misspellings (`Nyamsheke`), and sector-only strings. |
| catchment | **Does not exist.** The registry XLSX has 16 columns and none is a catchment. |
| `latitude`/`longitude` | Present on 833 rows; 4 of those plot outside Rwanda. |

## 1. Activity classification

`lib/permit/activity-classification.ts` is the single source of truth: an ordered keyword rule table producing 16 canonical codes, exposed two ways:

- `classifyActivity()` for TypeScript, and
- `activityCodeSqlExpression()`, which renders **the same rules** as a Postgres `CASE`, so filtering, sorting and aggregation happen server-side across the whole registry rather than over the current page.

Matching runs against the primary segment first (text before the first `(`, `,`, `/`, `&`, `:` or ` and `), then the whole string. Rule order is load-bearing and documented in the file: bottling before mining (`Bottled Mineral water` is Industry), irrigation before recreation (`Irrigating the golf course`), recreation before fish farming (`Recreational fishing`), livestock before water supply, hydropower before dam.

Result on production data: **1,318 of 1,318 classified**, 44 as "Not Specified", and only 2 as "Other" (`Company's activities`, `Groundwater investigation`).

**Verification:** the generated SQL was executed against a real PostgreSQL 16 instance loaded with all 1,318 production activity strings and compared row-by-row with the TypeScript classifier — **0 mismatches**, including `NULL` and whitespace-only inputs.

## 2. Internal Permit Registry

- `app/api/staff/permit-registry/route.ts` accepts an `activity` parameter, returns a computed `activity_code` per row, and supports `sort_by=activity`.
- `lib/permit/registry-counts.ts` gains an `activityCode` filter using the shared expression. The pre-existing coarse `authorizedActivity` "use category" filter is left untouched — it belongs to the Management Dashboard, which is out of scope.
- `components/permit-registry/permit-registry-list.tsx`: the Regimes dropdown becomes an Activities dropdown populated from the fixed canonical taxonomy (the old dropdown only listed values found on the current page), and the REGIME column becomes a sortable ACTIVITY column. The expanded row detail still shows both "Regime of Water Use" and the raw "Authorized Activity" text, so nothing is lost.

The change reaches all five staff pages that render the registry (review, approver, assessment, verification, management).

## 3. Catchment derivation

`lib/permit/catchment-resolution.ts`, with data baked offline by `scripts/build-catchment-lookup.mjs` from the official RWB "Rwanda Level 1 Catchments" layer and geoBoundaries RWA ADM2/ADM3 (CC BY 4.0, NISR). Nothing at runtime touches the network.

Cascade: coordinates → point-in-polygon (825 rows) → sector overlap table (269) → district overlap table (66) → unattributed (158).

District parsing: exact name → fuzzy match, but **only** on a token explicitly followed by "District" and only when exactly one district is within edit distance 2 → unambiguous sector name. 1,308 of 1,318 districts resolved.

Two deliberate refusals to guess, both found while validating against real data:

- **Split districts.** A sector or district is only used when ≥70% of its area lies in one catchment. Gicumbi splits ~55/45 and 93 rows there carry the location `Gicumbi District` and nothing else; attributing them by bare majority moved Muvumba from 13 permits to 122 — a visibly wrong public figure. They are now reported as unattributed.
- **Cell names that look like districts.** The cell `Gisayura` is two edits from the district `Gisagara`; anchoring fuzzy matches to the word "District" stops a Karongi permit being filed under Gisagara. This was caught by a test, not by inspection.

## 4. Public dashboard

`app/api/public/water-use-dashboard/route.ts` reads the same unified registry dataset as the staff table (extracted to `lib/permit/registry-unified.ts`) and computes the headline counts with the *same* status-bucket SQL, so the public total equals the internal total by construction. It returns counts only — no holder, number, contact, or coordinate ever leaves the server. Cached for 5 minutes.

`app/water-use-dashboard/page.tsx` is four tabs: Total Permits (headline plus Active / Expired / Cancelled / Expiring within 3 months), and ranked count-and-share lists per District, per Catchment, per Activity. The Catchment tab states how many permits were placed from coordinates versus estimated from location. The hidden search/filter/map/per-permit code and `components/public/public-permits-map.tsx` are deleted.

## 5. Verification

- `npm run test:activity-classification` — classifier over real registry strings, ordering traps, blanks, and TS/SQL agreement.
- `npm run test:catchment-resolution` — district parsing, misspellings, ambiguity refusal, coordinate validation, cascade order, split-district refusal.
- Generated SQL executed against real PostgreSQL 16 (see §1).
- `npm run build` before every push; prod branch first, then cherry-pick to UAT.

## Known limitation

158 permits (12%) cannot be attributed to a catchment because their recorded location is only a district that spans two catchments. The fix is better location data in the registry, not a better guess; the public page says so plainly.
