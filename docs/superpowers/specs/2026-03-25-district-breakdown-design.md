# District Breakdown — Water Use Dashboard

**Date:** 2026-03-25
**Status:** Approved
**Page:** `/water-use-dashboard`

---

## Goal

Add district-level permit data to the public Water Use Dashboard. Rwanda has 30 districts across 5 provinces. The breakdown must be readable without overwhelming the page.

---

## Decisions Made

| Question | Decision |
|---|---|
| Layout approach | Upgrade existing "Permits by province" card — expandable accordion |
| Expand behavior | Accordion (one province open at a time) |
| Default state on load | All provinces collapsed |
| Percentage denominator | District % is relative to province total, not national total |
| New files | None — 3 existing files only |

---

## Data Shape

Add `permitsByDistrict` to the API snapshot response:

```typescript
permitsByDistrict: Array<{
  province: string;                     // matches permitsByProvince key
  districts: Array<{
    key: string;                        // raw district name
    label: string;                      // same as key (district names are already readable)
    count: number;                      // number of permits in this district
    percentage: number;                 // count / province_total × 100
  }>;
}>;
```

**Province ordering:** same as `permitsByProvince` (sorted by count descending).
**District ordering within province:** sorted by count descending.
**Exclusion rule:** districts with empty/null name are skipped — same logic as province aggregation.
**Registry permits:** `permit_registry` rows have no district field; they contribute to province totals via `permitsByProvince` but are absent from `permitsByDistrict`. This is expected and acceptable.

---

## API Changes

**File:** `app/api/public/water-use-dashboard/route.ts`

After the existing `permitsByProvince` aggregation, add:

```typescript
// Group districts under their province, using the same filtered set
const districtsByProvince = new Map<string, Map<string, number>>();
for (const p of filtered) {
  const prov = (p.province ?? "").trim();
  const dist = (p.district ?? "").trim();
  if (!prov || !dist) continue;
  if (!districtsByProvince.has(prov)) districtsByProvince.set(prov, new Map());
  const dm = districtsByProvince.get(prov)!;
  dm.set(dist, (dm.get(dist) ?? 0) + 1);
}

const permitsByDistrict = permitsByProvince.map(({ key: province }) => {
  const dm = districtsByProvince.get(province);
  if (!dm) return { province, districts: [] };
  const provTotal = Array.from(dm.values()).reduce((s, n) => s + n, 0) || 1;
  const districts = Array.from(dm.entries())
    .map(([key, count]) => ({
      key,
      label: key,
      count,
      percentage: (count / provTotal) * 100,
    }))
    .sort((a, b) => b.count - a.count);
  return { province, districts };
});
```

Add `permitsByDistrict` to the `snapshot` object in the `NextResponse.json(...)` call.

---

## TypeScript Type Changes

**File:** `hooks/usePublicWaterUseDashboardQuery.ts`

Add to `PublicWaterUseDashboardResponse.snapshot`:

```typescript
permitsByDistrict: Array<{
  province: string;
  districts: Array<{ key: string; label: string; count: number; percentage: number }>;
}>;
```

---

## UI Changes

**File:** `app/water-use-dashboard/page.tsx`

### State

Add one state variable at the top of the component:

```typescript
const [expandedProvince, setExpandedProvince] = useState<string | null>(null);

function toggleProvince(key: string) {
  setExpandedProvince(prev => (prev === key ? null : key));
}
```

### Card replacement

Replace the existing `"Permits by province"` card entirely. The new card:

1. **Province row** (always visible):
   - Left: colored dot + province name
   - Right: mini progress bar + `"{count} · {pct}%"` + `ChevronRight` icon (rotates 90° to `ChevronDown` when expanded)
   - `cursor-pointer`, hover background `hover:bg-muted/40`, transition 150ms
   - Active (expanded) state: green border `border-emerald-200`, green header background `bg-emerald-50/50`

2. **District sub-rows** (visible only when province is expanded):
   - Indented with `pl-6`
   - Small uppercase label at top: `"Districts — % of province total"` in `text-[10px] font-semibold text-muted-foreground uppercase tracking-wide`
   - Each row: district name (left, `min-w-0 truncate`) + flex-1 mini bar + `"{count} · {pct}%"` (right, `shrink-0`)
   - Bar color: `bg-emerald-200` (lighter than province bars to visually subordinate)
   - Top 3 districts: slightly brighter `bg-emerald-300`
   - Empty state: `"No district data available."` in muted text
   - Animated open/close: `overflow-hidden` with a smooth height transition using a wrapper div and CSS `transition-all duration-200`

3. **Chevron animation**: `transition-transform duration-150` + `rotate-90` class toggled when expanded

### District percentage label context

Show `"{count} · {pct}%"` (not just `{pct}%`) on each district row. The small header label explains the denominator ("% of province total") so users are not confused comparing province-level percentages to district-level ones.

### Mobile

- District name: `min-w-0 truncate flex-1`
- Count/percentage: `shrink-0 text-right`
- Progress bar: `flex-1` with a max-width on desktop (`sm:max-w-[120px]`)

---

## Visual Design

| Element | Class / Value |
|---|---|
| Province row hover | `hover:bg-muted/40 transition-colors duration-150` |
| Expanded province border | `border-emerald-200` |
| Expanded province header bg | `bg-emerald-50/50` |
| Chevron (collapsed) | `ChevronRight` lucide, `text-muted-foreground` |
| Chevron (expanded) | rotate 90° → points down, `text-emerald-600` |
| District bar (top 3) | `bg-emerald-300` |
| District bar (rest) | `bg-emerald-200` |
| District sub-section label | `text-[10px] uppercase tracking-wide text-muted-foreground` |

---

## Scope

This change is limited to the public dashboard. No auth-required pages are affected. No database schema changes — `district` already exists on `public.applications` and is already JOINed in the dashboard SQL query.

---

## Files Touched

| File | Change |
|---|---|
| `app/api/public/water-use-dashboard/route.ts` | Add `permitsByDistrict` aggregation and include in response |
| `hooks/usePublicWaterUseDashboardQuery.ts` | Add `permitsByDistrict` to `PublicWaterUseDashboardResponse.snapshot` |
| `app/water-use-dashboard/page.tsx` | Replace province card with expandable accordion, add `expandedProvince` state |

No new files. No new dependencies.
