# Management Dashboard — Abstraction Transparency Design

**Date:** 2026-04-30
**Author:** Engineering
**Scope:** `/management` page, Abstraction & Allocation tab
**Status:** Approved (chat)

## Problem

The "Total permitted abstraction" cards on the Abstraction & Allocation tab show
`~70 billion m³/day` (e.g. `69,577,495,67…`). The number is computed by summing
each `permit_registry.volume_or_area` row through `parseRegistryVolume` +
`convertToM3PerDay` in `lib/permit/registry-counts.ts`.

Two things are wrong from the user's perspective:

1. **Some rows are silently skipped.** The current parser drops any row whose
   `volume_or_area` lacks a recognized unit (e.g. `"500 L/day"`, `"500 m3"`
   without a time component, `"500 m3/h"`). Many real registry rows have these
   formats, so the displayed total is a partial sum and the user doesn't know it.
2. **No transparency.** Even if the sum is mathematically correct given the
   inputs, the UI gives no clue how many rows actually contributed. If the sum
   looks wrong, the user has no way to tell whether the cause is a missing unit
   in the parser, an outlier in the data, or both.

The user explicitly asked us **not** to cap or filter outliers — the dashboard
must reflect what's in the registry. The fix is therefore (a) widen the parser
so fewer legitimate rows fall through, and (b) tell the user how many rows
contributed.

## Non-goals

- Capping or excluding outlier rows (explicitly out of scope per user)
- Changing the `/permit-registry` page in any way
- Reworking the Abstraction tab layout, the pressure-per-catchment card, or the
  shared application/feedback KPI rows above the tab content
- Touching application-side abstraction data

## Design

### Parser extension

Extend `convertToM3PerDay` in `lib/permit/registry-counts.ts` to recognize the
following additional unit formats (in addition to the existing m3/day, m3/year,
m3/month, L/s, m3/s):

| Unit string (case-insensitive, whitespace-stripped) | Conversion to m³/day |
|---|---|
| `l/day`, `lpd`, `litre/day`, `liter/day` | × 0.001 |
| `l/min`, `lpm`, `litre/min`, `liter/min` | × 0.001 × 1440 |
| `l/h`, `l/hr`, `l/hour`, `lph`, `litre/hour`, `liter/hour` | × 0.001 × 24 |
| `m3/h`, `m3/hr`, `m3/hour`, `m³/h`, `m³/hr`, `m³/hour` | × 24 |
| `m3/week`, `m3/wk`, `m³/week`, `m³/wk` | ÷ 7 |

Existing checks remain unchanged. Order matters; the new checks are inserted
before the more permissive `l/s` and `m3/s` checks so that, e.g., `l/h` doesn't
fall through to `l/s`'s `includes` check (it wouldn't anyway since `l/h` does
not contain `l/s`, but order is kept defensive).

### API shape change

`fetchRegistryAbstraction` returns:

```ts
type RegistryAbstraction = {
  totalPermittedM3PerDay: number;
  totalPermittedM3PerYear: number;
  parsedCount: number;       // rows that contributed to the sum
  totalRows: number;         // every registry row matching the active filters
};
```

`app/api/management/dashboard/route.ts` passes both new fields through inside
the `abstraction` object of the response.

`lib/management-dashboard.ts` updates the `ManagementDashboardData['abstraction']`
TypeScript type to include `parsedCount` and `totalRows`.

### UI change

Under the two abstraction cards on the Allocation tab, render a single small
muted line:

> *Sum of **X** of **Y** permits with a recognizable volume unit.*
> *(**Z** permits omitted because their volume_or_area field could not be parsed.)*

Where:
- `X = data.abstraction.parsedCount`
- `Y = data.abstraction.totalRows`
- `Z = Y − X`

If `X === Y`, render only the first sentence. If `Y === 0` (no permits in scope),
render nothing.

The note uses `text-xs text-muted-foreground` to match the existing
`permitsScopeNote` paragraph style on the Portfolio Overview tab.

## Risk assessment

- **Behavior change:** the displayed total will only ever stay the same or grow
  (rows that were silently dropped may now contribute). No previously-counted row
  will be excluded.
- **No data writes:** read-only changes to a SELECT path.
- **No new SQL:** the volume_or_area SELECT remains identical; only the JS
  post-processing changes.
- **Backward-compat:** the API response gains two fields; the UI renders nothing
  if they're missing (defensive `??` fallbacks).

## Verification

1. TypeScript compiles for the changed files (`tsc --noEmit`).
2. ESLint clean for the changed files.
3. Manual: load `/management` → Abstraction & Allocation tab → confirm the new
   transparency line renders, and the X / Y values are sensible (X ≤ Y, Y =
   total registry rows under the active filters).
