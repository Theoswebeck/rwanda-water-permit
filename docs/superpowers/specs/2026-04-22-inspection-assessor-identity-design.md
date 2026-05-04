# Inspection — Show Assessor Identity in Header

Date: 2026-04-22
Status: Draft (awaiting user approval)

## Problem

The inspection detail header (rendered on the four role-specific permit-inspection pages) shows `Permit`, `Template`, and `Draft/Record` metadata, but it does not show **who** the inspection belongs to (the assessor / inspector who created or owns it). Reviewers, verifiers, and approvers must currently leave the page or open the database to know who submitted the inspection.

## Goal

Display the inspection owner's **full name** and **email** in the header, neatly, with no layout regression and no extra round trips per render.

## Non-Goals

- No avatars/initials chip.
- No "owner card" section.
- No edit / re-assign UI.
- No changes to RLS or `inspections` schema.
- Public/applicant-facing pages are unchanged.

## Affected Files

The same JSX header block exists in all four role pages and must be updated identically:

- `app/assessment/inspection/permit/[id]/page.tsx`
- `app/review/inspection/permit/[id]/page.tsx`
- `app/verification/inspection/permit/[id]/page.tsx`
- `app/approver/inspection/permit/[id]/page.tsx`

To avoid drift, the inline display will be extracted into a small shared component:

- `components/inspection/inspection-owner-badge.tsx` (new)

## Data Source

- `inspections.inspector_id` is already loaded into `inspectionRecord` in each page.
- The `users` table provides `id`, `first_name`, `last_name`, `email`, `role`.
- Fetch the assessor row once (alongside the existing inspection lookup) using the already-initialized `supabase` client.

## UI Spec

In the existing header row that contains `Template: <tpl>` and `Draft/Record: <id…>` badges, append a new badge:

```
Assessor: <First Last> · <email>
```

Rules:
- Render only when `inspectionRecord?.inspector_id` resolves to a known user.
- Render nothing (no placeholder) when:
  - `inspectionRecord` is missing, or
  - `inspector_id` is missing, or
  - the lookup fails (silent — log warning to console).
- Email is rendered as a `mailto:` link inside the badge so it is clickable but inherits badge styling.
- Truncate long names with `max-w-[260px] truncate` to keep the header on one line on common widths.
- Wraps to a new line on small screens via the existing `flex flex-wrap` (already in place).

## Behavior

- One additional `users` query per page load: `select id, first_name, last_name, email from users where id = :inspector_id`.
- Cache result in component state (`assessor`); refetched only when `inspector_id` changes (rarely, after submit).
- No optimistic / no polling.
- Error handling: on query error, log warning, do not render the badge, do not block the page.

## Edge Cases

- `inspector_id` belongs to a deactivated user → still display from `users` (we only filter on id, no active flag).
- Individual user without `first_name`/`last_name` → fall back to email only: `Assessor: <email>`.
- Anonymous / null inspector → omit badge entirely (back-compat for any legacy rows).

## Testing / Verification

- Manual smoke on all 4 role pages with:
  - inspection that has a real inspector_id
  - inspection with null inspector_id (legacy)
  - long name (truncation)
- Lint: `npx eslint <changed files>` clean for new code.
- Type check: file passes `tsc`.

## Risk

Low. Read-only, single-table, already authorized via RLS (users are readable to staff).
