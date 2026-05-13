# Design: Preview Tab Visibility by Assessment Stage

**Date:** 2026-05-13  
**Scope:** Contract Preview and Permit Preview tabs across all staff application pages

---

## Problem

Contract Preview and Permit Preview tabs are currently visible on all staff pages regardless of whether the assessment report has been completed. Non-assessor staff (reviewer, verifier, approver) should not see these tabs while the assessment is still in progress, as the preview documents are not yet meaningful.

---

## Rules

### Assessor page (`/assessment/application/[id]`)
No change. The assessor always sees both preview tabs — while working, after saving, and in read-only (forwarded) state.

### Review, Verification, Approver pages
Show Contract Preview and Permit Preview tabs **only when assessment is complete** (i.e. the application has been forwarded past the assessment stage).

Assessment is considered **incomplete** when `application.status` is any of:
- `submitted`
- `pending_assessment`
- `returned_to_assessment`
- `rejected`

Note: `under_review` is intentionally excluded — on non-assessor pages it means a later-stage staff member has picked up the application (assessment is already done). Including it would incorrectly hide tabs for active reviewers.

Assessment is **complete** (tabs visible) for all other statuses, including:
- `pending_review`, `returned_to_review`
- `pending_verification`, `returned_to_verification`
- `pending_final_approval`
- `approved`, `approved_pending_permit`

---

## Implementation

### 1. Utility — `lib/application-workflow.ts`

Add one exported function alongside the existing `getApplicationWorkflowKind`:

```ts
const ASSESSMENT_INCOMPLETE_STATUSES = new Set<ApplicationStatus>([
  'submitted',
  'pending_assessment',
  'returned_to_assessment',
  'rejected',
]);

export function isAssessmentComplete(status: ApplicationStatus): boolean {
  return !ASSESSMENT_INCOMPLETE_STATUSES.has(status);
}
```

### 2. Three pages — review, verification, approver

In each page's JSX, after `application` is loaded, derive:

```ts
const showPreviews = isAssessmentComplete(application.status);
```

Then:

**TabsList grid-cols:** Each page uses `grid-cols-5` (or `grid-cols-4` for transfer apps). When `!showPreviews`, reduce by 2:
- Normal: `grid-cols-5` → `grid-cols-3`
- Transfer: `grid-cols-4` → `grid-cols-2`

**TabsTriggers:** Wrap both Contract Preview and Permit Preview triggers:
```tsx
{showPreviews && <TabsTrigger value="contract_preview">Contract Preview</TabsTrigger>}
{showPreviews && <TabsTrigger value="permit_preview">Permit Preview</TabsTrigger>}
```

**TabsContent:** Wrap both content blocks the same way:
```tsx
{showPreviews && (
  <TabsContent value="contract_preview">...</TabsContent>
)}
{showPreviews && (
  <TabsContent value="permit_preview">...</TabsContent>
)}
```

### 3. Assessment page — no changes

---

## Files Changed

| File | Change |
|------|--------|
| `lib/application-workflow.ts` | Add `isAssessmentComplete()` |
| `app/review/application/[id]/page.tsx` | Conditional preview tabs |
| `app/verification/application/[id]/page.tsx` | Conditional preview tabs |
| `app/approver/application/[id]/page.tsx` | Conditional preview tabs |

`app/assessment/application/[id]/page.tsx` — **untouched**

---

## No database or API changes required.
