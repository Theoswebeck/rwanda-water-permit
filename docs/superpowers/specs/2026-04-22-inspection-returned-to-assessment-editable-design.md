# Make returned-to-assessment inspections editable by the owning assessor

**Date:** 2026-04-22
**Owner:** Inspections module
**Files:** `lib/inspection-workflow.ts`, `app/{assessment,review,verification,approver}/inspection/permit/[id]/page.tsx`

---

## Problem

When a reviewer returns an inspection to the assessor, the assessor cannot edit any fields. The Workflow Actions card still offers "Resubmit for Review", but the form is read-only, making the action useless. The same is true for inspections sitting in `pending_assessment`.

## Root cause

The four role-specific inspection editor pages gate editability on `inspections.status` rather than `inspections.workflow_status`:

```ts
// app/<role>/inspection/permit/[id]/page.tsx
const isDraft = existing.status === "scheduled" || existing.status === "in_progress";
const isOwner = existing.inspector_id === user?.id;
setCanEditForm(canCreateInspection && isOwner && isDraft);
```

Submitting an inspection writes `status="completed"`, `workflow_status="pending_review"`. The reviewer's "Return to Assessor" transition (in `components/inspection/inspection-workflow-actions.tsx`) only updates `workflow_status` to `returned_to_assessment` — `status` stays `"completed"`. Therefore `isDraft` is `false`, the form locks, and the assessor cannot revise their own work.

`status` and `workflow_status` model two different things:

- `status` — record lifecycle (`scheduled` / `in_progress` / `completed` / `cancelled`).
- `workflow_status` — pipeline ownership (`draft` / `pending_assessment` / `pending_review` / `returned_to_assessment` / …).

Editability should be governed by ownership (`workflow_status`), not lifecycle (`status`).

## Fix

### 1. Helper in `lib/inspection-workflow.ts`

```ts
const ASSESSOR_OWNED_WORKFLOW = new Set([
  "draft",
  "pending_assessment",
  "returned_to_assessment",
]);

export function isAssessorOwnedWorkflow(ws: string | null | undefined): boolean {
  return ASSESSOR_OWNED_WORKFLOW.has((ws || "draft").trim());
}
```

Null/empty `workflow_status` is treated as `"draft"` so legacy rows behave correctly.

### 2. Editor gate (4 files)

In every `app/<role>/inspection/permit/[id]/page.tsx`, replace the `isDraft` check:

```ts
const isOwner = existing.inspector_id === user?.id;
const isAssessorOwned = isAssessorOwnedWorkflow(existing.workflow_status);
setCanEditForm(canCreateInspection && isOwner && isAssessorOwned);
```

Only the assessor is ever the inspector_id owner in practice, so the reviewer/verifier/approver pages remain effectively read-only — the change only really unlocks the assessment page, but applying it uniformly keeps the four near-clones honest.

### 3. Save behaviour (4 files)

In each `save()`, do not silently rewrite `workflow_status` back to `"draft"` when the inspection is currently owned by the assessor in a non-draft workflow state:

```ts
const currentWorkflow = (inspectionRecord?.workflow_status as string) || "draft";
const preserveWorkflow =
  currentWorkflow === "pending_assessment" || currentWorkflow === "returned_to_assessment";

// in the payload:
status: mode === "submit" ? "completed" : "in_progress",
workflow_status:
  mode === "submit"
    ? <existing-submit-target>          // "pending_review" or "submitted" per page
    : preserveWorkflow ? currentWorkflow : "draft",
```

Each page keeps its existing submit target (`assessment` → `pending_review`; `review`/`verification`/`approver` → `submitted`).

Net effect:

- Brand-new draft → unchanged (`draft` ↔ `pending_review`/`submitted`).
- `returned_to_assessment` → **Save draft** keeps it `returned_to_assessment` (the chip stays correct, reviewer's "Returned to Assessor" filter still finds it). **Submit** advances to `pending_review`/`submitted`.
- `pending_assessment` → same.

No `inspection_workflow_history` row is needed for a draft save: there's no transition. History continues to be written exclusively by the Workflow Actions card.

## Out of scope

- DB migration: none.
- RLS: unchanged. Assessor RLS already allows updates to rows where `inspector_id = auth.uid()`.
- Workflow Actions card "Resubmit for Review": kept as-is. The inline `Submit` button now reaches the same target — both routes are valid.

## Manual test plan (staging)

1. Assessor creates inspection → submits → reviewer returns. Owner-assessor opens the row: form fields are editable, edits persist, **Save draft** keeps `workflow_status = returned_to_assessment`.
2. Owner-assessor clicks **Submit**: row advances to `pending_review`, fields lock again on reload.
3. Different assessor opens the same returned row: fields locked (not owner).
4. Reviewer / verifier / approver open a `returned_to_assessment` row: fields locked.
5. Brand-new draft: save/submit cycle works exactly as before (no regression).
