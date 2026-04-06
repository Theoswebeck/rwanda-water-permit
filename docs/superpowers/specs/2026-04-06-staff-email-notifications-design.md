# Staff Email Notifications Design

**Date:** 2026-04-06
**Status:** Approved
**Scope:** Email notifications for staff (assessors, reviewers, verifiers, approvers) on workflow events

---

## Problem

Staff members receive no email notifications when applications, water use reports, or inspections are assigned to them or forwarded through the workflow. They must manually check their dashboards to discover new work items. This causes delays in processing.

## Solution

A single unified `POST /api/notifications/staff` endpoint that the client calls after each workflow transition. A server-side module (`lib/notifications/staff-notify.ts`) handles staff resolution, email composition, and idempotent delivery using the existing `public.notifications` lock-row pattern.

## Constraints

- One reviewer, one verifier, one approver in the system (one person per role)
- Multiple assessors possible
- Reviewer/verifier/approver identified by assignment column first, then role lookup fallback
- Follows existing idempotent notification pattern from `submission.ts`
- Email only (no SMS for staff notifications)
- Fire-and-forget from client (`.catch(() => null)`)

---

## Event Map

### Application Events

| Event Type | Trigger | Notify | Status Change |
|---|---|---|---|
| `application_submitted` | Applicant submits | Reviewer | `submitted` |
| `application_assigned_to_assessor` | Reviewer assigns assessor | Assigned assessor | `pending_assessment` |
| `application_forwarded_to_review` | Assessor completes assessment | Reviewer | `pending_review` |
| `application_forwarded_to_verification` | Reviewer forwards | Verifier | `pending_verification` |
| `application_forwarded_to_approval` | Verifier forwards | Approver | `pending_final_approval` |
| `application_returned_to_assessment` | Reviewer returns | Assigned assessor | `returned_to_assessment` |
| `application_returned_to_review` | Verifier returns | Reviewer | `returned_to_review` |
| `application_returned_to_verification` | Approver returns | Verifier | `returned_to_verification` |

### Water Use Report Events

| Event Type | Trigger | Notify | Status Change |
|---|---|---|---|
| `wur_assigned_to_assessor` | Reviewer assigns assessor | Assigned assessor | `pending_assessment` |
| `wur_forwarded_to_review` | Assessor completes | Reviewer | `pending_review` |
| `wur_forwarded_to_verification` | Reviewer forwards | Verifier | `pending_verification` |
| `wur_forwarded_to_approval` | Verifier forwards | Approver | `pending_approval` |
| `wur_returned_to_assessment` | Reviewer returns | Assigned assessor | `returned_to_assessment` |
| `wur_returned_to_review` | Verifier returns | Reviewer | `returned_to_review` |
| `wur_returned_to_verification` | Approver returns | Verifier | `returned_to_verification` |

### Inspection Events

| Event Type | Trigger | Notify | Status Change |
|---|---|---|---|
| `inspection_assigned_to_assessor` | Reviewer assigns assessor | Assigned assessor | `pending_assessment` |
| `inspection_forwarded_to_review` | Assessor completes | Reviewer | `pending_review` |
| `inspection_returned_to_assessment` | Reviewer returns | Assigned assessor | `returned_to_assessment` |

---

## Architecture

### New Files

**`lib/notifications/staff-notify.ts`** — Core module:
- Event type registry (maps event type to: target role, email template, entity type)
- `resolveStaffUser(targetRole, entityId, entityType)` — finds the staff user to notify
- `buildStaffEmailCopy(event, entity, staffUser)` — composes subject/title/body
- `notifyStaffOnEvent(eventType, entityType, entityId)` — main entry point (idempotent)

**`app/api/notifications/staff/route.ts`** — Thin POST handler:
- Auth check (must be logged-in staff)
- Validate payload: `{ eventType, entityType, entityId }`
- Delegate to `notifyStaffOnEvent()`
- Return `{ success, status }`

### Modified Files

Client-side pages where workflow transitions happen — add fire-and-forget fetch after each Supabase `.update()`:
- `app/review/page.tsx` (assessor assignment)
- `app/assessment/application/[id]/page.tsx` (forward to review)
- `app/review/application/[id]/page.tsx` (forward to verification, return to assessment)
- `app/verification/application/[id]/page.tsx` (forward to approval, return to review)
- `app/api/approver/final-decision/route.ts` (return to verification — server-side, direct call)
- `lib/notifications/submission.ts` (add reviewer notification on application submitted)
- `components/water-use-reports/water-use-reports-list.tsx` (assessor assignment)
- `components/water-use-reports/water-use-report-workflow-actions.tsx` (all WUR transitions)
- `components/inspection/staff-inspections-tab.tsx` (assessor assignment)
- `components/inspection/inspection-workflow-actions.tsx` (inspection transitions)

---

## Staff Resolution Logic

```
function resolveStaffUser(targetRole, entityId, entityType):
  entity = fetch entity by entityId from the appropriate table

  if targetRole == 'assessor':
    return fetch user by entity.assigned_assessor_id
  
  if targetRole == 'reviewer':
    if entity.assigned_reviewer_id:
      return fetch user by entity.assigned_reviewer_id
    return fetch user WHERE role = 'reviewer' LIMIT 1
  
  if targetRole == 'verifier':
    if entity.assigned_verifier_id:
      return fetch user by entity.assigned_verifier_id
    return fetch user WHERE role = 'verifier' LIMIT 1
  
  if targetRole == 'approver':
    if entity.assigned_approver_id:
      return fetch user by entity.assigned_approver_id
    return fetch user WHERE role = 'approver' LIMIT 1
```

---

## Email Template

**Subject:** `[RWB] {Action Title} — {Reference}`
**Title:** `{Action Title}`
**Body:**

```
Dear {Staff First Name} {Staff Last Name},

{Action description sentence}.

{Entity Type} Reference: {reference_number or ID}
{Applicant line if applicable}

Please review and process this in your dashboard.

Portal: {portal_url}/{dashboard_path}/{entity_id}

Rwanda Water Resources Board
```

Dashboard paths per role and entity type:
- Assessor + Application: `/assessment/application/{id}`
- Assessor + WUR: `/assessment/water-use-report/{id}`
- Assessor + Inspection: `/inspection/assessment/{id}`
- Reviewer + Application: `/review/application/{id}`
- Reviewer + WUR: `/review/water-use-report/{id}`
- Reviewer + Inspection: `/review/inspection/permit/{id}`
- Verifier + Application: `/verification/application/{id}`
- Verifier + WUR: `/verification/water-use-report/{id}`
- Approver + Application: `/approver/application/{id}`
- Approver + WUR: `/approver/water-use-report/{id}`

Example for assessor assignment:
- Subject: `[RWB] Application Assigned for Assessment — APP-2024-001`
- Body: "A water permit application has been assigned to you for assessment."

Example for forward to verification:
- Subject: `[RWB] Application Ready for Verification — APP-2024-001`
- Body: "A water permit application has been forwarded to you for verification."

Example for return to assessment:
- Subject: `[RWB] Application Returned for Re-assessment — APP-2024-001`
- Body: "A water permit application has been returned to you for re-assessment. Please review the comments and update your assessment."

---

## Idempotency

Each staff notification is keyed by `(user_id, application_id, title)` in `public.notifications`.

Title format: `"Staff: {Event Action Title}"` (e.g., `"Staff: Application Assigned to Assessor"`).

The flow follows the existing pattern from `submission.ts`:
1. Check if notification already sent (query by `application_id` + `title` + `user_id`)
2. If `email_sent = true`, skip (return `skipped_already_sent`)
3. Insert lock row with `email_sent = false`
4. Send email via `sendSmtpEmail()`
5. Update lock row with `email_sent = true`
6. On error, delete the lock row

Entity ID storage in `public.notifications`:
- **Applications:** use `application_id` column
- **Water Use Reports:** use `assessment_id` column to store the WUR UUID (the table has no `water_use_report_id` column; `assessment_id` serves as a generic secondary FK)
- **Inspections:** use `assessment_id` column to store the inspection UUID

The `title` string already disambiguates the entity type (e.g., "Staff: WUR Assigned to Assessor" vs "Staff: Application Assigned to Assessor"), so there is no collision risk.

---

## Client Integration Pattern

After each successful Supabase `.update()`:

```typescript
fetch('/api/notifications/staff', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventType: 'application_assigned_to_assessor',
    entityType: 'application',
    entityId: application.id,
  }),
}).catch(() => null)
```

This is the same fire-and-forget pattern used in `app/dashboard/edit-application/[id]/page.tsx` for submission notifications.

---

## API Route Contract

**`POST /api/notifications/staff`**

Request body:
```json
{
  "eventType": "application_assigned_to_assessor",
  "entityType": "application",
  "entityId": "uuid"
}
```

Response (200):
```json
{
  "success": true,
  "status": "sent" | "skipped_already_sent" | "skipped_no_staff"
}
```

Response (400/500):
```json
{
  "success": false,
  "message": "error description"
}
```

---

## Error Handling

- If staff user cannot be found (no user with the target role, or assignment column is null): return `skipped_no_staff` — do not throw
- If email send fails: delete lock row, return error (allows retry)
- If entity not found: return error with message
- Invalid event type: return 400
- Unauthenticated: return 401

---

## What This Does NOT Cover

- SMS notifications for staff (only email)
- In-app notification bell/badge (the `public.notifications` rows will appear there if the app already reads them)
- Notifications for applicants (those already exist)
- Notifications for admin users
