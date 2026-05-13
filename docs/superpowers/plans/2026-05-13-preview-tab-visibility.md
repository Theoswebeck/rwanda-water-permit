# Preview Tab Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide Contract Preview and Permit Preview tabs on the review, verification, and approver pages until the assessment has been forwarded (i.e. application status is past the assessment stage).

**Architecture:** Add a single `isAssessmentComplete(status)` utility to `lib/application-workflow.ts`. Import it in the three non-assessor pages and use it to conditionally render the two tab triggers, their content blocks, and adjust the `grid-cols` on `TabsList`. The assessment page (`app/assessment/`) is not touched — the assessor always sees both tabs.

**Tech Stack:** Next.js App Router, TypeScript, Radix UI Tabs (via shadcn `@/components/ui/tabs`)

---

## Files Changed

| File | Change |
|------|--------|
| `lib/application-workflow.ts` | Add `isAssessmentComplete()` export |
| `app/review/application/[id]/page.tsx` | Conditional preview tabs |
| `app/verification/application/[id]/page.tsx` | Conditional preview tabs |
| `app/approver/application/[id]/page.tsx` | Conditional preview tabs |

---

### Task 1: Add `isAssessmentComplete` utility

**Files:**
- Modify: `lib/application-workflow.ts`

The file currently exports only `getApplicationWorkflowKind`. We add `isAssessmentComplete` after it.

- [ ] **Step 1: Open `lib/application-workflow.ts` and append the function**

Add this at the bottom of the file (after the closing brace of `getApplicationWorkflowKind`):

```ts
import type { ApplicationStatus } from "@/types/database";

const ASSESSMENT_INCOMPLETE_STATUSES = new Set<ApplicationStatus>([
  "submitted",
  "pending_assessment",
  "returned_to_assessment",
  "rejected",
]);

export function isAssessmentComplete(status: ApplicationStatus): boolean {
  return !ASSESSMENT_INCOMPLETE_STATUSES.has(status);
}
```

Note: `ApplicationStatus` is already defined in `@/types/database` — no new types needed.

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /Users/nourumuneza/go/src/waterpermit && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors referencing `application-workflow.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/application-workflow.ts
git commit -m "feat: add isAssessmentComplete utility to application-workflow"
```

---

### Task 2: Apply conditional tabs to the Review page

**Files:**
- Modify: `app/review/application/[id]/page.tsx`

The review page already imports `getApplicationWorkflowKind` from `@/lib/application-workflow` — add `isAssessmentComplete` to that import. Then derive `showPreviews` and conditionally render.

- [ ] **Step 1: Add `isAssessmentComplete` to the import**

Find the existing import (around line 43):
```ts
import { getApplicationWorkflowKind } from "@/lib/application-workflow";
```
Replace with:
```ts
import { getApplicationWorkflowKind, isAssessmentComplete } from "@/lib/application-workflow";
```

- [ ] **Step 2: Derive `showPreviews` just before the return statement**

Find this line (around line 1102):
```ts
const showReviewActions = shouldShowReviewActions(application.status);
```
Add one line after it:
```ts
const showPreviews = isAssessmentComplete(application.status);
```

- [ ] **Step 3: Update `TabsList` grid-cols**

Find (around line 1298):
```tsx
<TabsList className={`grid w-full ${isTransferApp ? 'grid-cols-4' : 'grid-cols-5'} h-auto p-1 bg-muted/80`}>
```
Replace with:
```tsx
<TabsList className={`grid w-full ${isTransferApp ? (showPreviews ? 'grid-cols-4' : 'grid-cols-2') : (showPreviews ? 'grid-cols-5' : 'grid-cols-3')} h-auto p-1 bg-muted/80`}>
```

- [ ] **Step 4: Conditionally render the two tab triggers**

Find (around line 1303–1304):
```tsx
              <TabsTrigger value="contract_preview">Contract Preview</TabsTrigger>
              <TabsTrigger value="permit_preview">Permit Preview</TabsTrigger>
```
Replace with:
```tsx
              {showPreviews && <TabsTrigger value="contract_preview">Contract Preview</TabsTrigger>}
              {showPreviews && <TabsTrigger value="permit_preview">Permit Preview</TabsTrigger>}
```

- [ ] **Step 5: Conditionally render the Contract Preview tab content**

Find (around line 1477):
```tsx
            {/* Contract Preview Tab */}
            <TabsContent value="contract_preview" className="space-y-6 focus-visible:outline-none">
              <ContractTermsPreview
                application={application}
                mode="staff-preview"
                showChrome
                transferPermit={transferPermit ?? (renewalPermit ? {
                  permit_number: renewalPermit.permit_number,
                  issue_date: (renewalPermit as any).issued_date,
                  expiry_date: renewalPermit.expiry_date,
                  concession_area: (renewalPermit as any).application?.concession_area,
                } : null)}
              />
            </TabsContent>
```
Replace with:
```tsx
            {/* Contract Preview Tab */}
            {showPreviews && (
            <TabsContent value="contract_preview" className="space-y-6 focus-visible:outline-none">
              <ContractTermsPreview
                application={application}
                mode="staff-preview"
                showChrome
                transferPermit={transferPermit ?? (renewalPermit ? {
                  permit_number: renewalPermit.permit_number,
                  issue_date: (renewalPermit as any).issued_date,
                  expiry_date: renewalPermit.expiry_date,
                  concession_area: (renewalPermit as any).application?.concession_area,
                } : null)}
              />
            </TabsContent>
            )}
```

- [ ] **Step 6: Conditionally render the Permit Preview tab content**

Find (around line 1492):
```tsx
            {/* Permit Preview Tab */}
            <TabsContent value="permit_preview" className="focus-visible:outline-none">
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
            </TabsContent>
```
Replace with:
```tsx
            {/* Permit Preview Tab */}
            {showPreviews && (
            <TabsContent value="permit_preview" className="focus-visible:outline-none">
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
            </TabsContent>
            )}
```

- [ ] **Step 7: Type-check**

```bash
cd /Users/nourumuneza/go/src/waterpermit && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add app/review/application/\[id\]/page.tsx
git commit -m "feat: hide preview tabs on review page until assessment is complete"
```

---

### Task 3: Apply conditional tabs to the Verification page

**Files:**
- Modify: `app/verification/application/[id]/page.tsx`

- [ ] **Step 1: Add `isAssessmentComplete` to the import**

Find the existing import for `application-workflow` in the file. If it doesn't exist, add a new import after the other `@/lib` imports:
```ts
import { isAssessmentComplete } from "@/lib/application-workflow";
```

- [ ] **Step 2: Derive `showPreviews` before the return**

Find where `application` is guaranteed to be non-null (just before the `return` that renders the full page JSX). Add:
```ts
const showPreviews = isAssessmentComplete(application.status);
```

- [ ] **Step 3: Update `TabsList` grid-cols**

Find (around line 871):
```tsx
<TabsList className={`grid w-full ${isTransferApp ? 'grid-cols-4' : 'grid-cols-5'} h-auto p-1 bg-muted/80`}>
```
Replace with:
```tsx
<TabsList className={`grid w-full ${isTransferApp ? (showPreviews ? 'grid-cols-4' : 'grid-cols-2') : (showPreviews ? 'grid-cols-5' : 'grid-cols-3')} h-auto p-1 bg-muted/80`}>
```

- [ ] **Step 4: Conditionally render the two tab triggers**

Find (around line 880–884):
```tsx
                <TabsTrigger value="contract_preview" className="py-2.5">
                  Contract Preview
                </TabsTrigger>
                <TabsTrigger value="permit_preview" className="py-2.5">
                  Permit Preview
                </TabsTrigger>
```
Replace with:
```tsx
                {showPreviews && (
                <TabsTrigger value="contract_preview" className="py-2.5">
                  Contract Preview
                </TabsTrigger>
                )}
                {showPreviews && (
                <TabsTrigger value="permit_preview" className="py-2.5">
                  Permit Preview
                </TabsTrigger>
                )}
```

- [ ] **Step 5: Conditionally render the Contract Preview tab content**

Find (around line 1067):
```tsx
            <TabsContent value="contract_preview" className="space-y-6 focus-visible:outline-none">
              <ContractTermsPreview
                application={application}
                mode="staff-preview"
                showChrome
                transferPermit={transferPermit ?? (renewalPermit ? {
                  permit_number: renewalPermit.permit_number,
                  issue_date: (renewalPermit as any).issued_date,
                  expiry_date: renewalPermit.expiry_date,
                  concession_area: (renewalPermit as any).application?.concession_area,
                } : null)}
              />
            </TabsContent>
```
Replace with:
```tsx
            {showPreviews && (
            <TabsContent value="contract_preview" className="space-y-6 focus-visible:outline-none">
              <ContractTermsPreview
                application={application}
                mode="staff-preview"
                showChrome
                transferPermit={transferPermit ?? (renewalPermit ? {
                  permit_number: renewalPermit.permit_number,
                  issue_date: (renewalPermit as any).issued_date,
                  expiry_date: renewalPermit.expiry_date,
                  concession_area: (renewalPermit as any).application?.concession_area,
                } : null)}
              />
            </TabsContent>
            )}
```

- [ ] **Step 6: Conditionally render the Permit Preview tab content**

Find (around line 1082):
```tsx
            {/* Permit Preview Tab */}
            <TabsContent value="permit_preview" className="focus-visible:outline-none">
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
            </TabsContent>
```
Replace with:
```tsx
            {/* Permit Preview Tab */}
            {showPreviews && (
            <TabsContent value="permit_preview" className="focus-visible:outline-none">
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
            </TabsContent>
            )}
```

- [ ] **Step 7: Type-check**

```bash
cd /Users/nourumuneza/go/src/waterpermit && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add app/verification/application/\[id\]/page.tsx
git commit -m "feat: hide preview tabs on verification page until assessment is complete"
```

---

### Task 4: Apply conditional tabs to the Approver page

**Files:**
- Modify: `app/approver/application/[id]/page.tsx`

The approver's Permit Preview tab has an extra component (`ApproverChangedSlotsPane`) that gates the approve button. This component is inside `TabsContent` and will simply not render when `showPreviews` is false (which only happens when the application is still in an assessment stage — an approver would never legitimately see such an application anyway).

- [ ] **Step 1: Add `isAssessmentComplete` to the import**

Find the existing import for `application-workflow`. If present, add `isAssessmentComplete` to it; otherwise add:
```ts
import { isAssessmentComplete } from "@/lib/application-workflow";
```

- [ ] **Step 2: Derive `showPreviews` before the return**

Before the `return` that renders the full page JSX:
```ts
const showPreviews = isAssessmentComplete(application.status);
```

- [ ] **Step 3: Update `TabsList` grid-cols**

Find (around line 959):
```tsx
          <TabsList className={`grid w-full ${isTransferApp ? 'grid-cols-4' : 'grid-cols-5'} h-auto p-1 bg-muted/80`}>
```
Replace with:
```tsx
          <TabsList className={`grid w-full ${isTransferApp ? (showPreviews ? 'grid-cols-4' : 'grid-cols-2') : (showPreviews ? 'grid-cols-5' : 'grid-cols-3')} h-auto p-1 bg-muted/80`}>
```

- [ ] **Step 4: Conditionally render the two tab triggers**

Find (around line 964–965):
```tsx
              <TabsTrigger value="contract_preview" className="py-2.5">Contract Preview</TabsTrigger>
              <TabsTrigger value="permit_preview" className="py-2.5">Permit Preview</TabsTrigger>
```
Replace with:
```tsx
              {showPreviews && <TabsTrigger value="contract_preview" className="py-2.5">Contract Preview</TabsTrigger>}
              {showPreviews && <TabsTrigger value="permit_preview" className="py-2.5">Permit Preview</TabsTrigger>}
```

- [ ] **Step 5: Conditionally render the Contract Preview tab content**

Find (around line 1149):
```tsx
            <TabsContent value="contract_preview" className="space-y-6 focus-visible:outline-none">
              <ContractTermsPreview
                application={application}
                mode="staff-preview"
                showChrome
                transferPermit={transferPermit ?? (renewalPermit ? {
                  permit_number: renewalPermit.permit_number,
                  issue_date: (renewalPermit as any).issued_date,
                  expiry_date: renewalPermit.expiry_date,
                  concession_area: (renewalPermit as any).application?.concession_area,
                } : null)}
              />
            </TabsContent>
```
Replace with:
```tsx
            {showPreviews && (
            <TabsContent value="contract_preview" className="space-y-6 focus-visible:outline-none">
              <ContractTermsPreview
                application={application}
                mode="staff-preview"
                showChrome
                transferPermit={transferPermit ?? (renewalPermit ? {
                  permit_number: renewalPermit.permit_number,
                  issue_date: (renewalPermit as any).issued_date,
                  expiry_date: renewalPermit.expiry_date,
                  concession_area: (renewalPermit as any).application?.concession_area,
                } : null)}
              />
            </TabsContent>
            )}
```

- [ ] **Step 6: Conditionally render the Permit Preview tab content**

Find (around line 1164):
```tsx
            {/* Permit Preview Tab */}
            <TabsContent value="permit_preview" className="space-y-4 focus-visible:outline-none">
              {application.id && (
                <ApproverChangedSlotsPane
                  applicationId={application.id}
                  onAcknowledgementChange={setOverrideReview}
                />
              )}
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
            </TabsContent>
```
Replace with:
```tsx
            {/* Permit Preview Tab */}
            {showPreviews && (
            <TabsContent value="permit_preview" className="space-y-4 focus-visible:outline-none">
              {application.id && (
                <ApproverChangedSlotsPane
                  applicationId={application.id}
                  onAcknowledgementChange={setOverrideReview}
                />
              )}
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
            </TabsContent>
            )}
```

- [ ] **Step 7: Type-check**

```bash
cd /Users/nourumuneza/go/src/waterpermit && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add app/approver/application/\[id\]/page.tsx
git commit -m "feat: hide preview tabs on approver page until assessment is complete"
```

---

### Task 5: Cherry-pick to production branch

The project uses two active branches:
- `chore/stage-unstaged-2026-03-01-uat` → staging (current branch)
- `chore/stage-unstaged-2026-03-01` → production

- [ ] **Step 1: Get the commit SHAs from the last 4 commits**

```bash
git log --oneline -4
```

Note the 4 SHAs (Tasks 1–4 commits).

- [ ] **Step 2: Push staging branch**

```bash
git push origin chore/stage-unstaged-2026-03-01-uat
```

- [ ] **Step 3: Cherry-pick all 4 commits onto production**

```bash
git fetch origin chore/stage-unstaged-2026-03-01
git checkout chore/stage-unstaged-2026-03-01
git cherry-pick <sha-task1> <sha-task2> <sha-task3> <sha-task4>
git push origin chore/stage-unstaged-2026-03-01
git checkout chore/stage-unstaged-2026-03-01-uat
```

---

## Manual Verification Checklist

After deployment:

1. **Assessor** — open any application in `pending_assessment` / `under_review` / `returned_to_assessment` on `/assessment/` → Contract Preview and Permit Preview tabs visible ✓
2. **Reviewer** — open an application in `submitted` / `pending_assessment` on `/review/` → tabs hidden ✓
3. **Reviewer** — open an application in `pending_review` / `returned_to_review` → tabs visible ✓
4. **Verifier** — open an application in `pending_verification` / `returned_to_verification` → tabs visible ✓
5. **Approver** — open an application in `pending_final_approval` → tabs visible ✓
6. **Any role** — `rejected` application → tabs hidden ✓
7. Grid layout looks correct (no collapsed/empty columns) in each scenario above ✓
