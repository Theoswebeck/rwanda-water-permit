# Staff Review Panels — Real Back Navigation

**Date:** 2026-07-07
**Branch:** `chore/stage-unstaged-2026-03-01-uat` (STAGING). Build here, then cherry-pick to prod (`chore/stage-unstaged-2026-03-01`) — never merge (branches have intentional differences).

## Problem

Across the four staff dashboards — `/review`, `/assessment`, `/approver`, `/verification` — the "Back" button on detail pages does not return the user to where they came from:

- Each dashboard keeps its active tab (**primary** / Inspections / Water Use Reports / Permit Registry) in React `useState`, **not in the URL**. Any return to the dashboard remounts it and snaps to the default primary tab, discarding whichever list the user was on.
- Back buttons are inconsistent across pages: some use `router.back()`, some a hardcoded `<Link href="/review">`, some `window.history.back()`, some `window.location.href`.

Result: from an Inspections-tab detail page, "Back" lands on the **Permitting/primary** tab with the inspection list lost. The user wants Back to return to the exact originating list — robustly, with **no bugs** on refresh / new-tab / direct-link.

## Goal

Every staff detail page's Back button returns to the exact originating dashboard **tab and list**, preserving scroll/filters when the user navigated in-app, and always landing on the correct list even on a cold load (refresh, new tab, direct link, external referrer).

## Scope

**In scope — the 4 staff dashboards and their detail pages:**

Dashboards (add tab-in-URL):
- `app/review/page.tsx` (primary tab: `review`)
- `app/assessment/page.tsx` (primary tab: `assessment`)
- `app/approver/page.tsx` (primary tab: `approval`)
- `app/verification/page.tsx` (primary tab: `verification`)

Detail pages (swap in `SmartBackButton`) — 12 total:
- Inspection detail (currently `router.back()`):
  `app/{review,assessment,approver,verification}/inspection/permit/[id]/page.tsx`
- Application detail (currently hardcoded `<Link>` / `window.location.href`):
  `app/{review,assessment,approver,verification}/application/[id]/page.tsx`
- Water-use-report detail (currently `BackButton`/history / mixed):
  `app/{review,assessment,approver,verification}/water-use-report/[id]/page.tsx`

**Out of scope (explicit decisions):**
- The public `/permit/view/[...permitNumber]` page, the **"View permit"** action, `/review/permit/[id]`, and everything in the **Permit Registry** tab — left untouched. (Registry-only permits have no internal page; touching this flow adds bug surface for no benefit to the user's request.)
- Non-staff flows: `/inspection/*` (inspector), `/dashboard/*` (applicant), `/verifier/*`. Not part of the reviewed panels.

## Design

### Piece 1 — Tab state in the URL (`?tab=`)

A shared hook drives each dashboard's active tab from a `?tab=` search param.

```
// hooks/use-tab-param.ts (new)
useTabParam(defaultTab: string): [tab: string, setTab: (t: string) => void]
```

- **Read:** initialize the tab from `?tab=` on mount; if absent/invalid, use `defaultTab` (the role's primary tab).
- **Write:** `setTab` updates local state AND calls `router.replace(pathname?tab=<t>, { scroll: false })` so the URL always reflects the visible tab.

Wiring in each dashboard: replace
`const [topTab, setTopTab] = useState<...>("<primary>")`
with
`const [topTab, setTopTab] = useTabParam("<primary>")` (typed via the existing union),
and point `StaffTopTabs` `onValueChange` at the returned setter.

Tab value strings (already used by these pages): `inspections`, `water-reports`, `permit-registry`, and the per-role primary (`review` | `assessment` | `approval` | `verification`).

**Why write-on-change matters:** it ensures that when the user clicks a row into a detail page, the dashboard URL in browser history already carries `?tab=inspections`. So a later `router.back()` restores the correct list, and the explicit fallback (Piece 2) points at the same URL. History-back and fallback stay consistent.

### Piece 2 — `SmartBackButton`

Evolve `components/ui/back-button.tsx` into a smart button (keep the existing `BackButton` export as a thin wrapper for backward compatibility, or update its 1 current call site).

```
// components/ui/back-button.tsx
interface SmartBackButtonProps {
  fallbackHref: string;   // where to go on a cold load
  label?: string;         // default "Back"
  className?: string;
  variant?: ButtonVariant; // to match each page's existing styling (ghost/outline)
}
```

Click logic:
```
const ref = document.referrer;
const sameOrigin = !!ref && new URL(ref).origin === window.location.origin;
if (sameOrigin) router.back();      // in-app nav → preserve scroll & filters
else router.push(fallbackHref);     // cold load → land on correct list
```

- `document.referrer` is populated for same-origin SPA navigations under Next's default referrer policy, so the common in-app path uses real history-back (natural, scroll-preserving).
- Direct link / new tab / hard external referrer → empty or cross-origin referrer → deterministic `fallbackHref`. No blank pages, no wrong tab.

### Piece 3 — Computing `fallbackHref` (no link/list changes)

Each detail page computes its own `fallbackHref` from its route — **no changes to any list or `<Link>` code**, minimizing risk. A small helper:

```
// lib/inspection-workflow.ts (co-located with getInspectionBasePath) or a new lib/staff-nav.ts
staffDashboardBase(role): "/review" | "/assessment" | "/approver" | "/verification"
staffListHref(role, section): string
```

Mapping by detail-page family:
- `…/inspection/permit/[id]` → `{dashboardBase}?tab=inspections`
- `…/application/[id]`       → `{dashboardBase}` (primary tab — its origin)
- `…/water-use-report/[id]`  → `{dashboardBase}?tab=water-reports`

Role is derived the same way the pages already derive `basePath` today (from the route prefix / `userProfile.role`). Each page passes the computed string as `fallbackHref`.

## Data flow (example: Inspections)

1. User on `/review`, clicks **Inspections** tab → `useTabParam` sets URL to `/review?tab=inspections`, list renders.
2. Clicks a row's "View inspection" → navigates to `/review/inspection/permit/<id>`. Browser history now holds `/review?tab=inspections`.
3. Clicks **Back**:
   - In-app (referrer same-origin) → `router.back()` → returns to `/review?tab=inspections`, Inspections list restored with prior scroll. ✅
   - Cold load (opened link directly / refreshed into detail) → `router.push("/review?tab=inspections")` → Inspections list loads fresh. ✅

## Edge cases / correctness

- **Cold load into a detail page:** no usable history → fallback URL used. Correct tab guaranteed.
- **Refresh on a detail page then Back:** hard refresh preserves the browser history stack, so `router.back()` still works; if referrer was stripped, fallback covers it.
- **Deep chains (list → inspection → application):** `router.back()` walks one step at a time (expected browser semantics); the fallback still resolves to a valid list if history is unavailable.
- **`?tab=` with an unknown value:** hook validates against the allowed set and falls back to the primary tab.
- **`router.replace` on tab change:** uses `{ scroll: false }` to avoid scroll jumps; replace (not push) so tab toggles don't pollute the history stack.

## Testing

- **Manual (primary):** for each of the 4 dashboards × 3 detail families:
  1. From tab → open detail → Back → lands on the same tab with the list. 
  2. Open the detail URL directly in a new tab → Back → lands on the correct list.
  3. Refresh on the detail page → Back → correct list.
- **Unit:** `useTabParam` (read default, read from param, invalid param → default, setTab writes URL); `staffListHref` mapping table.
- **Build/type check:** `npm run build` clean (no type errors from the union-typed tab state).

## Non-goals

- No redesign of the dashboards, tabs, or detail pages.
- No change to "View permit", the public permit view, `/review/permit/[id]`, or the Permit Registry tab.
- No change to non-staff (`/inspection`, `/dashboard`, `/verifier`) flows.

## Deployment

Implement on `…-uat`. After verification, cherry-pick the commits to prod `chore/stage-unstaged-2026-03-01`. On-prem server auto-pulls/builds/restarts within ~2 min of a prod-branch push.
