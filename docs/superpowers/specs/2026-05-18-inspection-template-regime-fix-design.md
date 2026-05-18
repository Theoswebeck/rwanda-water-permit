# Inspection Template Regime Fix

**Date:** 2026-05-18  
**Status:** Approved

## Problem

For registry-only permits (source = `permit_registry`), inspection pages always show the "authorization" template — even when the permit's regime is "Concession". The culprit is `templateFromPermit`, which checks `intended_activities[0]` for `"fish_farming_lakes"` or `"aquaculture"`. But for registry permits, `intended_activities` is populated from `registryEntry.authorized_activity`, which stores the human-readable label `"Fish farming in lakes"` — it never matches the snake_case code.

The `permit_registry` table has a `regime` column that directly says `"Concession"` or `"Authorization"`. This is the canonical source of truth and was never consulted.

## Affected Files

Same `templateFromPermit` function is duplicated in all 4 inspection role pages:
- `app/assessment/inspection/permit/[id]/page.tsx`
- `app/approver/inspection/permit/[id]/page.tsx`
- `app/review/inspection/permit/[id]/page.tsx`
- `app/verification/inspection/permit/[id]/page.tsx`

## Fix

### 1. `templateFromPermit` — add `regime` parameter

```ts
function templateFromPermit(
  intendedActivities?: unknown,
  purpose?: string,
  regime?: string
): InspectionTemplate {
  if (regime?.toLowerCase() === "concession") return "concession";
  const activities = Array.isArray(intendedActivities) ? intendedActivities.map(String) : [];
  const primary = (activities[0] || purpose || "").toLowerCase();
  if (
    primary === "fish_farming_lakes" ||
    primary.includes("fish farming") ||
    primary.includes("aquaculture")
  ) return "concession";
  return "authorization";
}
```

### 2. Call site — pass `registryEntry.regime`

```ts
const tpl = templateFromPermit(
  data?.application?.intended_activities,
  data?.permit?.purpose,
  data?.registryEntry?.regime
);
setTemplate(tpl);
```

### 3. Force-correct saved drafts

Remove the `|| existing.inspection_template` fallback so the derived template always wins:

```ts
// Before
setTemplate(((existing as any).inspection_template as InspectionTemplate) || tpl);
// After
setTemplate(tpl);
```

## Why force-correct

The saved `inspection_template` in existing draft rows may be `"authorization"` due to this bug. Keeping it would perpetuate wrong sections for inspectors reopening a draft. Force-correcting on load is safe: the template only controls which UI sections render, not what data is stored.
