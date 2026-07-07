# Staff Review Panels — Real Back Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Back" button on every staff review-panel detail page return the user to the exact originating dashboard tab and list, robustly on both in-app navigation and cold loads (refresh / new tab / direct link).

**Architecture:** Two coordinated changes. (1) Each of the 4 staff dashboards derives its active tab from a `?tab=` URL param via a shared `useTabParam` hook, so a return to the dashboard restores the tab/list instead of snapping to the primary tab. (2) A shared `SmartBackButton` replaces the inconsistent back buttons on the 12 detail pages: it uses real browser-back when the user came from an in-app page (preserving scroll), otherwise navigates to an explicit `fallbackHref` computed by the pure `staffListHref(panel, section)` helper.

**Tech Stack:** Next.js 15 App Router (client components), React, TypeScript, Tailwind, lucide-react, shadcn `Button`. Unit tests run on Node's built-in test runner (`node --test`) with a TypeScript transpile loader (existing pattern: `scripts/test-account-types.mjs`).

## Global Constraints

- Branch: work on `chore/stage-unstaged-2026-03-01-uat` (STAGING). After verification, cherry-pick to prod `chore/stage-unstaged-2026-03-01` — never merge (branches have intentional differences).
- The 4 staff panels are the URL segments: `review`, `assessment`, `approver`, `verification`. These segments are used verbatim as dashboard paths (`/review`, `/assessment`, `/approver`, `/verification`).
- Tab param values (already used by these pages): `inspections`, `water-reports`, `permit-registry`, and the per-panel primary (`review` | `assessment` | `approval` | `verification`).
- OUT OF SCOPE — do not touch: public `/permit/view`, the "View permit" action, `/review/permit/[id]`, the Permit Registry tab, and non-staff flows (`/inspection/*`, `/dashboard/*`, `/verifier/*`, `/water-use-report/*`). Leave the existing `BackButton` export intact — non-staff pages (`app/water-use-report/[id]/page.tsx`, `app/inspection/[id]/page.tsx`) still use it.
- Preserve each page's existing button styling (`variant="ghost"`, sizing) when swapping in `SmartBackButton`.

---

## File Structure

- **Create** `lib/staff-nav.ts` — pure helper `staffListHref(panel, section)` + exported types. One source of truth for back-destination URLs.
- **Create** `scripts/test-staff-nav.mjs` — `node --test` unit tests for `staffListHref`.
- **Create** `hooks/use-tab-param.ts` — `useTabParam` hook (URL-backed tab state).
- **Modify** `components/ui/back-button.tsx` — add `SmartBackButton` export (keep `BackButton`).
- **Modify** dashboards (tab-in-URL): `app/{review,assessment,approver,verification}/page.tsx`
- **Modify** inspection detail (SmartBackButton): `app/{review,assessment,approver,verification}/inspection/permit/[id]/page.tsx`
- **Modify** application detail (SmartBackButton): `app/{review,assessment,approver,verification}/application/[id]/page.tsx`
- **Modify** water-use-report detail (SmartBackButton): `app/{review,assessment,approver,verification}/water-use-report/[id]/page.tsx`

---

## Task 1: Pure back-destination helper (`staffListHref`)

**Files:**
- Create: `lib/staff-nav.ts`
- Test: `scripts/test-staff-nav.mjs`

**Interfaces:**
- Produces:
  - `type StaffPanel = "review" | "assessment" | "approver" | "verification"`
  - `type ListSection = "primary" | "inspections" | "water-reports"`
  - `staffListHref(panel: StaffPanel, section: ListSection): string`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-staff-nav.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const repoRoot = process.cwd();
const source = fs.readFileSync(path.join(repoRoot, "lib/staff-nav.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function("exports", "module", compiled)(module.exports, module);
const { staffListHref } = module.exports;

test("primary section returns the bare dashboard path", () => {
  assert.equal(staffListHref("review", "primary"), "/review");
  assert.equal(staffListHref("approver", "primary"), "/approver");
});

test("inspections section returns the inspections tab URL", () => {
  assert.equal(staffListHref("review", "inspections"), "/review?tab=inspections");
  assert.equal(staffListHref("verification", "inspections"), "/verification?tab=inspections");
});

test("water-reports section returns the water-reports tab URL", () => {
  assert.equal(staffListHref("assessment", "water-reports"), "/assessment?tab=water-reports");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test-staff-nav.mjs`
Expected: FAIL — cannot read `lib/staff-nav.ts` (file not found) / `staffListHref is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/staff-nav.ts`:

```ts
export type StaffPanel = "review" | "assessment" | "approver" | "verification";
export type ListSection = "primary" | "inspections" | "water-reports";

/**
 * Canonical URL of the dashboard list a staff detail page should return to.
 * `primary` = the panel's default tab (loads with no ?tab= param).
 */
export function staffListHref(panel: StaffPanel, section: ListSection): string {
  if (section === "primary") return `/${panel}`;
  return `/${panel}?tab=${section}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test-staff-nav.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/staff-nav.ts scripts/test-staff-nav.mjs
git commit -m "feat: add staffListHref back-destination helper"
```

---

## Task 2: `SmartBackButton` component

**Files:**
- Modify: `components/ui/back-button.tsx`

**Interfaces:**
- Consumes: none.
- Produces: `SmartBackButton` React component with props:
  - `fallbackHref: string` (required) — where to go on a cold load
  - `label?: string` (default `"Back"`)
  - `className?: string`
  - `variant?: "ghost" | "outline" | "default" | "secondary" | "link" | "destructive"` (default `"ghost"`)
  - `size?: "default" | "sm" | "lg" | "icon"` (default `"default"`)

- [ ] **Step 1: Add the `SmartBackButton` export**

Edit `components/ui/back-button.tsx`. Keep the existing `BackButton` export unchanged. Add these imports and the new component. The file currently begins:

```tsx
"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
```

Replace that import block with:

```tsx
"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
```

Then append this component at the end of the file (after the existing `BackButton`):

```tsx
interface SmartBackButtonProps {
  /** Where to navigate when there is no safe in-app history to return to. */
  fallbackHref: string
  label?: string
  className?: string
  variant?: "ghost" | "outline" | "default" | "secondary" | "link" | "destructive"
  size?: "default" | "sm" | "lg" | "icon"
}

export function SmartBackButton({
  fallbackHref,
  label = "Back",
  className,
  variant = "ghost",
  size = "default",
}: SmartBackButtonProps) {
  const router = useRouter()

  const handleBack = () => {
    if (typeof window !== "undefined") {
      const ref = document.referrer
      let sameOrigin = false
      try {
        sameOrigin = !!ref && new URL(ref).origin === window.location.origin
      } catch {
        sameOrigin = false
      }
      // Real browser-back only when we came from an in-app page AND this tab
      // has a prior history entry to return to. A cmd-click "open in new tab"
      // sets a same-origin referrer but has no usable history, so it must fall
      // through to the fallback rather than dead-ending on router.back().
      if (sameOrigin && window.history.length > 1) {
        router.back()
        return
      }
    }
    // Cold load (direct link / new tab / external referrer) → deterministic list URL.
    router.push(fallbackHref)
  }

  return (
    <Button variant={variant} size={size} onClick={handleBack} className={className}>
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  )
}
```

- [ ] **Step 2: Type-check the component**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "back-button" || echo "no back-button type errors"`
Expected: `no back-button type errors`.

- [ ] **Step 3: Commit**

```bash
git add components/ui/back-button.tsx
git commit -m "feat: add SmartBackButton with history-or-fallback navigation"
```

---

## Task 3: `useTabParam` hook

**Files:**
- Create: `hooks/use-tab-param.ts`

**Interfaces:**
- Consumes: none.
- Produces:
  `useTabParam<T extends string>(defaultTab: T, validTabs: readonly T[]): [T, (t: T) => void]`
  - Returns the current tab (read from `?tab=`, validated against `validTabs`, else `defaultTab`) and a setter that writes `?tab=` via `router.replace(..., { scroll: false })`.

- [ ] **Step 1: Create the hook**

Create `hooks/use-tab-param.ts`:

```ts
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * URL-backed tab state. The URL (`?tab=`) is the single source of truth, so
 * returning to this page (browser-back or a direct link) restores the tab.
 */
export function useTabParam<T extends string>(
  defaultTab: T,
  validTabs: readonly T[]
): [T, (t: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get("tab");
  const tab = raw && (validTabs as readonly string[]).includes(raw) ? (raw as T) : defaultTab;

  const setTab = useCallback(
    (next: T) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("tab", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return [tab, setTab];
}
```

- [ ] **Step 2: Type-check the hook**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "use-tab-param" || echo "no hook type errors"`
Expected: `no hook type errors`.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-tab-param.ts
git commit -m "feat: add useTabParam URL-backed tab hook"
```

---

## Task 4: Wire tab-in-URL into the 4 dashboards

Each dashboard currently holds `topTab` in `useState` with the panel's primary default. Replace that with `useTabParam`. Because `useSearchParams` triggers a static-prerender bailout, the page's default export must wrap the content in a `<Suspense>` boundary — **`export const dynamic = "force-dynamic"` alone is NOT sufficient** (Next 15 still throws "useSearchParams() should be wrapped in a suspense boundary" during export). Implementation applied: rename the page function to `XDashboardContent`, and add a new default export `XDashboard` that renders `<Suspense fallback={<centered Loader2 />}><XDashboardContent /></Suspense>`. `force-dynamic` is kept (harmless) but the Suspense wrapper is what fixes the build.

**Files:**
- Modify: `app/review/page.tsx`
- Modify: `app/assessment/page.tsx`
- Modify: `app/approver/page.tsx`
- Modify: `app/verification/page.tsx`

**Interfaces:**
- Consumes: `useTabParam` (Task 3).

- [ ] **Step 1: `app/review/page.tsx`**

Add the import near the other imports (after the `StaffTopTabs` import at line 51):

```tsx
import { useTabParam } from "@/hooks/use-tab-param";
```

Add at the top of the module (just below the imports, before `export default function ReviewerDashboard()`):

```tsx
export const dynamic = "force-dynamic";
```

Replace line 120:

```tsx
  const [topTab, setTopTab] = useState<"review" | "inspections" | "water-reports" | "permit-registry">("review");
```

with:

```tsx
  const [topTab, setTopTab] = useTabParam<"review" | "inspections" | "water-reports" | "permit-registry">(
    "review",
    ["review", "inspections", "water-reports", "permit-registry"]
  );
```

Leave the existing `StaffTopTabs` `onValueChange={(v) => setTopTab(v as any)}` unchanged (the setter signature is compatible).

- [ ] **Step 2: `app/assessment/page.tsx`**

Add import after the `StaffTopTabs` import (line 28):

```tsx
import { useTabParam } from "@/hooks/use-tab-param";
```

Add below the imports (before the component):

```tsx
export const dynamic = "force-dynamic";
```

Replace line 66:

```tsx
  const [topTab, setTopTab] = useState<"assessment" | "inspections" | "water-reports" | "permit-registry">("assessment");
```

with:

```tsx
  const [topTab, setTopTab] = useTabParam<"assessment" | "inspections" | "water-reports" | "permit-registry">(
    "assessment",
    ["assessment", "inspections", "water-reports", "permit-registry"]
  );
```

Leave `onValueChange={(v) => setTopTab(v as any)}` (line 379) unchanged.

- [ ] **Step 3: `app/approver/page.tsx`**

Add import after the `StaffTopTabs` import (line 16):

```tsx
import { useTabParam } from "@/hooks/use-tab-param";
```

Add below the imports (before the component):

```tsx
export const dynamic = "force-dynamic";
```

Replace line 38:

```tsx
  const [topTab, setTopTab] = useState<"approval" | "inspections" | "water-reports" | "permit-registry">("approval");
```

with:

```tsx
  const [topTab, setTopTab] = useTabParam<"approval" | "inspections" | "water-reports" | "permit-registry">(
    "approval",
    ["approval", "inspections", "water-reports", "permit-registry"]
  );
```

Leave the existing `onValueChange={(v) => { if (isTopTab(v)) setTopTab(v); }}` and the `isTopTab` guard unchanged.

- [ ] **Step 4: `app/verification/page.tsx`**

Add import after the `StaffTopTabs` import (line 19):

```tsx
import { useTabParam } from "@/hooks/use-tab-param";
```

Add below the imports (before the component):

```tsx
export const dynamic = "force-dynamic";
```

Replace line 55:

```tsx
  const [topTab, setTopTab] = useState<"verification" | "inspections" | "water-reports" | "permit-registry">("verification");
```

with:

```tsx
  const [topTab, setTopTab] = useTabParam<"verification" | "inspections" | "water-reports" | "permit-registry">(
    "verification",
    ["verification", "inspections", "water-reports", "permit-registry"]
  );
```

Leave `onValueChange={(v) => setTopTab(v as any)}` (line 320) unchanged.

- [ ] **Step 5: Remove now-unused `useState` imports if the linter flags them**

Only if a dashboard no longer references `useState` anywhere else, remove `useState` from its `react` import. Check each file:

Run: `for f in review assessment approver verification; do echo "== $f =="; grep -c "useState" app/$f/page.tsx; done`
If a count is `1` (the import line only), remove `useState` from that file's `import { ... } from "react"`. Otherwise leave it.

- [ ] **Step 6: Build**

Run: `npm run build 2>&1 | tail -25`
Expected: build completes with no errors; no "useSearchParams() should be wrapped in a suspense boundary" message.

- [ ] **Step 7: Commit**

```bash
git add app/review/page.tsx app/assessment/page.tsx app/approver/page.tsx app/verification/page.tsx
git commit -m "feat: drive staff dashboard tabs from ?tab= URL param"
```

---

## Task 5: SmartBackButton on the 4 inspection detail pages

All four currently render an identical ghost button calling `router.back()`. Replace it with `SmartBackButton` whose fallback is the panel's Inspections tab.

**Files:**
- Modify: `app/review/inspection/permit/[id]/page.tsx` (back button ~line 592–600)
- Modify: `app/assessment/inspection/permit/[id]/page.tsx` (~629–637)
- Modify: `app/approver/inspection/permit/[id]/page.tsx` (~582–590)
- Modify: `app/verification/inspection/permit/[id]/page.tsx` (~592–600)

**Interfaces:**
- Consumes: `SmartBackButton` (Task 2).

- [ ] **Step 1: Add the imports in each file**

In each of the 4 files, add after the existing `Button` import (the `ArrowLeft` icon import on line 19 stays — it is still used elsewhere in these pages):

```tsx
import { SmartBackButton } from "@/components/ui/back-button";
import { staffListHref } from "@/lib/staff-nav";
```

- [ ] **Step 2: Replace the back button JSX in each file**

In every one of the 4 files, replace this block:

```tsx
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
        onClick={() => router.back()}
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
```

with the panel-appropriate `SmartBackButton` (the `staffListHref` call is the single source of truth for the URL shape):

- `app/review/inspection/permit/[id]/page.tsx`:

```tsx
      <SmartBackButton
        fallbackHref={staffListHref("review", "inspections")}
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
      />
```

- `app/assessment/inspection/permit/[id]/page.tsx`:

```tsx
      <SmartBackButton
        fallbackHref={staffListHref("assessment", "inspections")}
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
      />
```

- `app/approver/inspection/permit/[id]/page.tsx`:

```tsx
      <SmartBackButton
        fallbackHref={staffListHref("approver", "inspections")}
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
      />
```

- `app/verification/inspection/permit/[id]/page.tsx`:

```tsx
      <SmartBackButton
        fallbackHref={staffListHref("verification", "inspections")}
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
      />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "inspection/permit" || echo "no inspection detail type errors"`
Expected: `no inspection detail type errors`.

(If `router` becomes unused in any file, leave it — these pages use `router` elsewhere for save/submit navigation. Verify with `grep -c "router\." app/<panel>/inspection/permit/[id]/page.tsx`; do not remove if count > 0.)

- [ ] **Step 4: Commit**

```bash
git add "app/review/inspection/permit/[id]/page.tsx" "app/assessment/inspection/permit/[id]/page.tsx" "app/approver/inspection/permit/[id]/page.tsx" "app/verification/inspection/permit/[id]/page.tsx"
git commit -m "feat: smart back to Inspections list on inspection detail pages"
```

---

## Task 6: SmartBackButton on the 4 application detail pages

Replace the primary header back button (`<Link href="/{panel}"><Button ...>Back to Dashboard</Button></Link>`) with `SmartBackButton`. Fallback = panel primary tab. Leave the error-state fallback button (which uses `window.location.href` inside an error branch) unchanged — it already navigates to the dashboard and is rarely seen.

**Files:**
- Modify: `app/review/application/[id]/page.tsx` (header back ~1150–1155)
- Modify: `app/assessment/application/[id]/page.tsx` (~2347–2352)
- Modify: `app/approver/application/[id]/page.tsx` (~910–915)
- Modify: `app/verification/application/[id]/page.tsx` (~845–850)

**Interfaces:**
- Consumes: `SmartBackButton` (Task 2).

- [ ] **Step 1: Add the imports in each file**

Add after the existing `Button` import in each of the 4 files:

```tsx
import { SmartBackButton } from "@/components/ui/back-button";
import { staffListHref } from "@/lib/staff-nav";
```

- [ ] **Step 2: Replace the header back block in each file**

- `app/review/application/[id]/page.tsx` — replace:

```tsx
              <Link href="/review">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
                </Button>
              </Link>
```

with:

```tsx
              <SmartBackButton fallbackHref={staffListHref("review", "primary")} label="Back to Dashboard" size="sm" className="gap-2" />
```

- `app/assessment/application/[id]/page.tsx` — replace:

```tsx
              <Link href="/assessment">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
                </Button>
              </Link>
```

with:

```tsx
              <SmartBackButton fallbackHref={staffListHref("assessment", "primary")} label="Back to Dashboard" size="sm" className="gap-2" />
```

- `app/approver/application/[id]/page.tsx` — replace (note this file's irregular indentation):

```tsx
        <Link href="/approver">
                <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
          </Button>
        </Link>
```

with:

```tsx
        <SmartBackButton fallbackHref={staffListHref("approver", "primary")} label="Back to Dashboard" size="sm" className="gap-2" />
```

- `app/verification/application/[id]/page.tsx` — replace:

```tsx
                <Link href="/verification">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Dashboard
                  </Button>
                </Link>
```

with:

```tsx
                <SmartBackButton fallbackHref={staffListHref("verification", "primary")} label="Back to Dashboard" size="sm" className="gap-2" />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "application/\[id\]" || echo "no application detail type errors"`
Expected: `no application detail type errors`. (`Link` and `ArrowLeft` remain imported/used elsewhere in these large files; do not remove them.)

- [ ] **Step 4: Commit**

```bash
git add "app/review/application/[id]/page.tsx" "app/assessment/application/[id]/page.tsx" "app/approver/application/[id]/page.tsx" "app/verification/application/[id]/page.tsx"
git commit -m "feat: smart back to dashboard on application detail pages"
```

---

## Task 7: SmartBackButton on the 4 water-use-report detail pages

All four render `<BackButton />` (no props, `history.back()`). Swap to `SmartBackButton` with the panel's Water Use Reports tab as fallback.

**Files:**
- Modify: `app/review/water-use-report/[id]/page.tsx` (line 7 import, line 21 usage)
- Modify: `app/assessment/water-use-report/[id]/page.tsx`
- Modify: `app/approver/water-use-report/[id]/page.tsx`
- Modify: `app/verification/water-use-report/[id]/page.tsx`

**Interfaces:**
- Consumes: `SmartBackButton` (Task 2).

- [ ] **Step 1: Update imports in each file**

In each file, replace:

```tsx
import { BackButton } from "@/components/ui/back-button";
```

with:

```tsx
import { SmartBackButton } from "@/components/ui/back-button";
import { staffListHref } from "@/lib/staff-nav";
```

- [ ] **Step 2: Replace the usage in each file**

Replace `<BackButton />` with the panel-appropriate button:

- `app/review/water-use-report/[id]/page.tsx`:

```tsx
          <SmartBackButton fallbackHref={staffListHref("review", "water-reports")} label="Go Back" variant="outline" />
```

- `app/assessment/water-use-report/[id]/page.tsx`:

```tsx
          <SmartBackButton fallbackHref={staffListHref("assessment", "water-reports")} label="Go Back" variant="outline" />
```

- `app/approver/water-use-report/[id]/page.tsx`:

```tsx
          <SmartBackButton fallbackHref={staffListHref("approver", "water-reports")} label="Go Back" variant="outline" />
```

- `app/verification/water-use-report/[id]/page.tsx`:

```tsx
          <SmartBackButton fallbackHref={staffListHref("verification", "water-reports")} label="Go Back" variant="outline" />
```

(`variant="outline"` + `label="Go Back"` preserves the current `BackButton` look, which defaulted to outline/"Go Back".)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "water-use-report/\[id\]" || echo "no water-use-report detail type errors"`
Expected: `no water-use-report detail type errors`.

- [ ] **Step 4: Commit**

```bash
git add "app/review/water-use-report/[id]/page.tsx" "app/assessment/water-use-report/[id]/page.tsx" "app/approver/water-use-report/[id]/page.tsx" "app/verification/water-use-report/[id]/page.tsx"
git commit -m "feat: smart back to Water Use Reports list on report detail pages"
```

---

## Task 8: Full build + manual verification

**Files:** none (verification only).

- [ ] **Step 1: Unit tests pass**

Run: `node --test scripts/test-staff-nav.mjs`
Expected: PASS (3 tests).

- [ ] **Step 2: Production build is clean**

Run: `npm run build 2>&1 | tail -30`
Expected: "Compiled successfully" / no type errors, no Suspense/useSearchParams errors.

- [ ] **Step 3: Manual verification (dev server)**

Run: `npm run dev` and sign in as a reviewer. For the `/review` panel, verify each flow (then spot-check `/assessment`, `/approver`, `/verification`):

Inspections:
1. `/review` → click **Inspections** tab. URL becomes `/review?tab=inspections`, list shows.
2. Click a row → **View inspection** → detail opens. Click **Back** → returns to `/review?tab=inspections` with the Inspections list (not Permitting).
3. Open the inspection detail URL directly in a new tab → **Back** → lands on `/review?tab=inspections` (fallback).

Applications:
4. `/review` (Permitting) → open an application (Image #1 page) → **Back to Dashboard** → returns to `/review` Permitting.
5. Open the application detail URL in a new tab → **Back to Dashboard** → lands on `/review`.

Water Use Reports:
6. `/review` → **Water Use Reports** tab → open a report → **Go Back** → returns to `/review?tab=water-reports`.
7. New tab directly on the report detail → **Go Back** → lands on `/review?tab=water-reports`.

- [ ] **Step 4: Verify out-of-scope untouched**

Confirm the "View permit" action still opens the public `/permit/view` page and the Permit Registry tab is unchanged.

Run: `git diff --name-only chore/stage-unstaged-2026-03-01-uat` (against the pre-work commit) and confirm no files under `app/permit/`, `app/review/permit/`, or the public/non-staff routes were modified.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore: verification fixes for staff back navigation"
```

---

## Self-Review Notes

- **Spec coverage:** Piece 1 (tab-in-URL) → Tasks 3, 4. Piece 2 (SmartBackButton) → Task 2 + Tasks 5–7. Piece 3 (`staffListHref`) → Task 1, imported and called by every detail page in Tasks 5–7 (single source of truth; no unused code). Out-of-scope items excluded and verified in Task 8 Step 4.
- **Type consistency:** `SmartBackButton` prop names (`fallbackHref`, `label`, `variant`, `size`, `className`) are identical across Tasks 2, 5, 6, 7. `useTabParam(defaultTab, validTabs)` signature identical across Task 3 and all Task 4 call sites. `staffListHref(panel, section)` is called with `panel ∈ {review, assessment, approver, verification}` and `section ∈ {primary, inspections, water-reports}` across Tasks 5–7, matching its Task 1 signature.
- **No placeholders:** every step has concrete code and exact commands.
