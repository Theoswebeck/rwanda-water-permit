# Staff Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send email notifications to staff (assessors, reviewers, verifiers, approvers) when workflow events occur on applications, water use reports, and inspections.

**Architecture:** A single `POST /api/notifications/staff` endpoint backed by a core module `lib/notifications/staff-notify.ts`. Client-side pages fire-and-forget a POST after each Supabase workflow transition. The module resolves the target staff user (by assignment column or role fallback), composes the email, and sends it idempotently using the existing `public.notifications` lock-row pattern.

**Tech Stack:** Next.js API routes, PostgreSQL (via `lib/db/postgres.ts`), Nodemailer SMTP (via `lib/notifications/smtp-email.ts`)

**Spec:** `docs/superpowers/specs/2026-04-06-staff-email-notifications-design.md`

---

### File Structure

**New files:**
- `lib/notifications/staff-notify.ts` — Event registry, staff resolution, email copy builder, idempotent send
- `app/api/notifications/staff/route.ts` — Thin POST handler with auth check

**Modified files:**
- `app/review/page.tsx` — Add notification after assessor assignment (line ~625)
- `app/assessment/application/[id]/page.tsx` — Add notification after forward to review (line ~1599)
- `app/review/application/[id]/page.tsx` — Add notification after forward to verification (line ~848) and return to assessment (line ~910)
- `app/verification/application/[id]/page.tsx` — Add notification after forward to approval (line ~645) and return to review (line ~690)
- `app/api/approver/final-decision/route.ts` — Add notification for return_to_verification (line ~356)
- `lib/notifications/submission.ts` — Add reviewer notification inside `notifyOnApplicationSubmitted` (line ~166)
- `components/water-use-reports/water-use-reports-list.tsx` — Add notification after assessor assignment (line ~172)
- `components/water-use-reports/water-use-report-workflow-actions.tsx` — Add notification after each transition (line ~244)
- `components/inspection/staff-inspections-tab.tsx` — Add notification after assessor assignment (line ~259)
- `components/inspection/inspection-workflow-actions.tsx` — Add notification after each transition (line ~285)

---

### Task 1: Create the core staff notification module

**Files:**
- Create: `lib/notifications/staff-notify.ts`

- [ ] **Step 1: Create the event type registry and types**

```typescript
// lib/notifications/staff-notify.ts
import { query } from '@/lib/db/postgres'
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'
import { getPortalUrl, buildPortalLink } from '@/lib/notifications/portal-url'

type StaffEventType =
  | 'application_submitted'
  | 'application_assigned_to_assessor'
  | 'application_forwarded_to_review'
  | 'application_forwarded_to_verification'
  | 'application_forwarded_to_approval'
  | 'application_returned_to_assessment'
  | 'application_returned_to_review'
  | 'application_returned_to_verification'
  | 'wur_assigned_to_assessor'
  | 'wur_forwarded_to_review'
  | 'wur_forwarded_to_verification'
  | 'wur_forwarded_to_approval'
  | 'wur_returned_to_assessment'
  | 'wur_returned_to_review'
  | 'wur_returned_to_verification'
  | 'inspection_assigned_to_assessor'
  | 'inspection_forwarded_to_review'
  | 'inspection_returned_to_assessment'

type EntityType = 'application' | 'water_use_report' | 'inspection'

type TargetRole = 'assessor' | 'reviewer' | 'verifier' | 'approver'

interface EventConfig {
  targetRole: TargetRole
  entityType: EntityType
  title: string
  emailSubjectPrefix: string
  emailBody: string
  dashboardPath: (id: string) => string
}

const EVENT_REGISTRY: Record<StaffEventType, EventConfig> = {
  application_submitted: {
    targetRole: 'reviewer',
    entityType: 'application',
    title: 'Staff: New Application Submitted',
    emailSubjectPrefix: 'New Application Submitted',
    emailBody: 'A new water permit application has been submitted and is awaiting your review.',
    dashboardPath: (id) => `/review/application/${id}`,
  },
  application_assigned_to_assessor: {
    targetRole: 'assessor',
    entityType: 'application',
    title: 'Staff: Application Assigned to Assessor',
    emailSubjectPrefix: 'Application Assigned for Assessment',
    emailBody: 'A water permit application has been assigned to you for assessment.',
    dashboardPath: (id) => `/assessment/application/${id}`,
  },
  application_forwarded_to_review: {
    targetRole: 'reviewer',
    entityType: 'application',
    title: 'Staff: Application Forwarded to Review',
    emailSubjectPrefix: 'Application Ready for Review',
    emailBody: 'A water permit application has been forwarded to you for review. The assessment has been completed.',
    dashboardPath: (id) => `/review/application/${id}`,
  },
  application_forwarded_to_verification: {
    targetRole: 'verifier',
    entityType: 'application',
    title: 'Staff: Application Forwarded to Verification',
    emailSubjectPrefix: 'Application Ready for Verification',
    emailBody: 'A water permit application has been forwarded to you for verification.',
    dashboardPath: (id) => `/verification/application/${id}`,
  },
  application_forwarded_to_approval: {
    targetRole: 'approver',
    entityType: 'application',
    title: 'Staff: Application Forwarded to Approval',
    emailSubjectPrefix: 'Application Ready for Final Approval',
    emailBody: 'A water permit application has been forwarded to you for final approval.',
    dashboardPath: (id) => `/approver/application/${id}`,
  },
  application_returned_to_assessment: {
    targetRole: 'assessor',
    entityType: 'application',
    title: 'Staff: Application Returned to Assessment',
    emailSubjectPrefix: 'Application Returned for Re-assessment',
    emailBody: 'A water permit application has been returned to you for re-assessment. Please review the comments and update your assessment.',
    dashboardPath: (id) => `/assessment/application/${id}`,
  },
  application_returned_to_review: {
    targetRole: 'reviewer',
    entityType: 'application',
    title: 'Staff: Application Returned to Review',
    emailSubjectPrefix: 'Application Returned for Review',
    emailBody: 'A water permit application has been returned to you for further review. Please review the verifier comments.',
    dashboardPath: (id) => `/review/application/${id}`,
  },
  application_returned_to_verification: {
    targetRole: 'verifier',
    entityType: 'application',
    title: 'Staff: Application Returned to Verification',
    emailSubjectPrefix: 'Application Returned for Verification',
    emailBody: 'A water permit application has been returned to you for further verification. Please review the approver comments.',
    dashboardPath: (id) => `/verification/application/${id}`,
  },
  wur_assigned_to_assessor: {
    targetRole: 'assessor',
    entityType: 'water_use_report',
    title: 'Staff: Water Use Report Assigned to Assessor',
    emailSubjectPrefix: 'Water Use Report Assigned for Assessment',
    emailBody: 'A water use report has been assigned to you for assessment.',
    dashboardPath: (id) => `/assessment/water-use-report/${id}`,
  },
  wur_forwarded_to_review: {
    targetRole: 'reviewer',
    entityType: 'water_use_report',
    title: 'Staff: Water Use Report Forwarded to Review',
    emailSubjectPrefix: 'Water Use Report Ready for Review',
    emailBody: 'A water use report has been forwarded to you for review.',
    dashboardPath: (id) => `/review/water-use-report/${id}`,
  },
  wur_forwarded_to_verification: {
    targetRole: 'verifier',
    entityType: 'water_use_report',
    title: 'Staff: Water Use Report Forwarded to Verification',
    emailSubjectPrefix: 'Water Use Report Ready for Verification',
    emailBody: 'A water use report has been forwarded to you for verification.',
    dashboardPath: (id) => `/verification/water-use-report/${id}`,
  },
  wur_forwarded_to_approval: {
    targetRole: 'approver',
    entityType: 'water_use_report',
    title: 'Staff: Water Use Report Forwarded to Approval',
    emailSubjectPrefix: 'Water Use Report Ready for Approval',
    emailBody: 'A water use report has been forwarded to you for approval.',
    dashboardPath: (id) => `/approver/water-use-report/${id}`,
  },
  wur_returned_to_assessment: {
    targetRole: 'assessor',
    entityType: 'water_use_report',
    title: 'Staff: Water Use Report Returned to Assessment',
    emailSubjectPrefix: 'Water Use Report Returned for Re-assessment',
    emailBody: 'A water use report has been returned to you for re-assessment.',
    dashboardPath: (id) => `/assessment/water-use-report/${id}`,
  },
  wur_returned_to_review: {
    targetRole: 'reviewer',
    entityType: 'water_use_report',
    title: 'Staff: Water Use Report Returned to Review',
    emailSubjectPrefix: 'Water Use Report Returned for Review',
    emailBody: 'A water use report has been returned to you for further review.',
    dashboardPath: (id) => `/review/water-use-report/${id}`,
  },
  wur_returned_to_verification: {
    targetRole: 'verifier',
    entityType: 'water_use_report',
    title: 'Staff: Water Use Report Returned to Verification',
    emailSubjectPrefix: 'Water Use Report Returned for Verification',
    emailBody: 'A water use report has been returned to you for further verification.',
    dashboardPath: (id) => `/verification/water-use-report/${id}`,
  },
  inspection_assigned_to_assessor: {
    targetRole: 'assessor',
    entityType: 'inspection',
    title: 'Staff: Inspection Assigned to Assessor',
    emailSubjectPrefix: 'Inspection Assigned for Assessment',
    emailBody: 'An inspection has been assigned to you for assessment.',
    dashboardPath: (id) => `/inspection/assessment/${id}`,
  },
  inspection_forwarded_to_review: {
    targetRole: 'reviewer',
    entityType: 'inspection',
    title: 'Staff: Inspection Forwarded to Review',
    emailSubjectPrefix: 'Inspection Ready for Review',
    emailBody: 'An inspection has been forwarded to you for review.',
    dashboardPath: (id) => `/review/inspection/permit/${id}`,
  },
  inspection_returned_to_assessment: {
    targetRole: 'assessor',
    entityType: 'inspection',
    title: 'Staff: Inspection Returned to Assessment',
    emailSubjectPrefix: 'Inspection Returned for Re-assessment',
    emailBody: 'An inspection has been returned to you for re-assessment.',
    dashboardPath: (id) => `/inspection/assessment/${id}`,
  },
}
```

- [ ] **Step 2: Add the staff resolution function**

Append to `lib/notifications/staff-notify.ts`:

```typescript
interface StaffUser {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: string
}

async function fetchEntity(entityType: EntityType, entityId: string) {
  if (entityType === 'application') {
    const res = await query<{
      id: string
      application_number: string | null
      assigned_assessor_id: string | null
      assigned_reviewer_id: string | null
      assigned_verifier_id: string | null
      assigned_approver_id: string | null
      applicant_id: string | null
    }>(
      `select id, application_number, assigned_assessor_id, assigned_reviewer_id,
              assigned_verifier_id, assigned_approver_id, applicant_id
       from public.applications where id = $1 limit 1`,
      [entityId]
    )
    return res.rows[0] || null
  }

  if (entityType === 'water_use_report') {
    const res = await query<{
      id: string
      report_number: string | null
      assigned_assessor_id: string | null
      assigned_reviewer_id: string | null
      assigned_verifier_id: string | null
      assigned_approver_id: string | null
      permit_holder_id: string | null
    }>(
      `select id, report_number, assigned_assessor_id, assigned_reviewer_id,
              assigned_verifier_id, assigned_approver_id, permit_holder_id
       from public.water_use_reports where id = $1 limit 1`,
      [entityId]
    )
    return res.rows[0] || null
  }

  if (entityType === 'inspection') {
    const res = await query<{
      id: string
      assigned_assessor_id: string | null
      assigned_reviewer_id: string | null
      assigned_verifier_id: string | null
      assigned_approver_id: string | null
    }>(
      `select id, assigned_assessor_id, assigned_reviewer_id,
              assigned_verifier_id, assigned_approver_id
       from public.inspections where id = $1 limit 1`,
      [entityId]
    )
    return res.rows[0] || null
  }

  return null
}

async function resolveStaffUser(
  targetRole: TargetRole,
  entity: Record<string, unknown>
): Promise<StaffUser | null> {
  const assignmentColumnMap: Record<TargetRole, string> = {
    assessor: 'assigned_assessor_id',
    reviewer: 'assigned_reviewer_id',
    verifier: 'assigned_verifier_id',
    approver: 'assigned_approver_id',
  }

  const col = assignmentColumnMap[targetRole]
  const assignedUserId = entity[col] as string | null

  if (assignedUserId) {
    const res = await query<StaffUser>(
      `select id, email, first_name, last_name, role
       from public.users where id = $1 limit 1`,
      [assignedUserId]
    )
    if (res.rows[0]) return res.rows[0]
  }

  const res = await query<StaffUser>(
    `select id, email, first_name, last_name, role
     from public.users where lower(role) = $1 limit 1`,
    [targetRole]
  )
  return res.rows[0] || null
}
```

- [ ] **Step 3: Add the email copy builder and main entry point**

Append to `lib/notifications/staff-notify.ts`:

```typescript
function getEntityReference(entity: Record<string, unknown>): string {
  return (entity.application_number as string)
    || (entity.report_number as string)
    || (entity.id as string).slice(0, 8)
}

function buildStaffEmailCopy(
  config: EventConfig,
  staffUser: StaffUser,
  entity: Record<string, unknown>,
  entityId: string,
) {
  const orgName = process.env.ORG_NAME || 'Rwanda Water Resources Board'
  const supportEmail = process.env.SUPPORT_EMAIL || 'info@rwb.rw'
  const ref = getEntityReference(entity)
  const link = buildPortalLink(config.dashboardPath(entityId))
  const staffName = `${staffUser.first_name || ''} ${staffUser.last_name || ''}`.trim() || 'Staff'

  const subject = `[RWB] ${config.emailSubjectPrefix} — ${ref}`
  const title = config.emailSubjectPrefix

  const text = [
    `Dear ${staffName},`,
    ``,
    config.emailBody,
    ``,
    `Reference: ${ref}`,
    ``,
    `Please review and process this in your dashboard:`,
    link,
    ``,
    `Support: ${supportEmail}`,
    ``,
    orgName,
  ].join('\n')

  return { subject, title, text }
}

type StaffNotifyResult =
  | { ok: true; status: 'sent' | 'skipped_already_sent' | 'skipped_no_staff' }
  | { ok: false; status: 'error'; message: string }

export async function notifyStaffOnEvent(
  eventType: string,
  entityType: string,
  entityId: string,
): Promise<StaffNotifyResult> {
  const config = EVENT_REGISTRY[eventType as StaffEventType]
  if (!config) {
    return { ok: false, status: 'error', message: `Unknown event type: ${eventType}` }
  }

  if (config.entityType !== entityType) {
    return { ok: false, status: 'error', message: `Event ${eventType} expects entity type ${config.entityType}, got ${entityType}` }
  }

  const entity = await fetchEntity(config.entityType, entityId)
  if (!entity) {
    return { ok: false, status: 'error', message: `Entity not found: ${entityType}/${entityId}` }
  }

  const staffUser = await resolveStaffUser(config.targetRole, entity as Record<string, unknown>)
  if (!staffUser || !staffUser.email) {
    console.warn(`⚠️ [STAFF-NOTIFY] No staff user found for role=${config.targetRole}, event=${eventType}`)
    return { ok: true, status: 'skipped_no_staff' }
  }

  const notifIdCol = config.entityType === 'application' ? 'application_id' : 'assessment_id'

  const existingRes = await query<{ id: string; email_sent: boolean | null }>(
    `select id, email_sent from public.notifications
     where ${notifIdCol} = $1 and title = $2 and user_id = $3
     order by created_at desc limit 1`,
    [entityId, config.title, staffUser.id]
  )
  const existing = existingRes.rows[0]
  if (existing?.email_sent) {
    return { ok: true, status: 'skipped_already_sent' }
  }

  let lockId = existing?.id || null
  if (!lockId) {
    const lockRes = await query<{ id: string }>(
      `insert into public.notifications (
        user_id, title, message, type, ${notifIdCol}, email_sent, sms_sent, created_at, updated_at
      ) values ($1, $2, $3, 'info', $4, false, false, now(), now())
      returning id`,
      [staffUser.id, config.title, 'Staff notification dispatch started.', entityId]
    )
    lockId = lockRes.rows[0]?.id || null
  }
  if (!lockId) {
    return { ok: false, status: 'error', message: 'Failed to create notification lock row' }
  }

  try {
    const copy = buildStaffEmailCopy(config, staffUser, entity as Record<string, unknown>, entityId)

    const emailResult = await sendSmtpEmail({
      to: staffUser.email,
      subject: copy.subject,
      title: copy.title,
      text: copy.text,
    })

    const emailSent = Boolean(emailResult.delivered)

    await query(
      `update public.notifications
       set message = $2, email_sent = $3, sms_sent = false, updated_at = now()
       where id = $1`,
      [lockId, copy.text, emailSent]
    )

    if (emailSent) {
      console.log(`✅ [STAFF-NOTIFY] Email sent to ${staffUser.email} for ${eventType} on ${entityId}`)
      return { ok: true, status: 'sent' }
    }

    return { ok: false, status: 'error', message: 'Email delivery failed' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`❌ [STAFF-NOTIFY] Error: ${message}`)
    await query(`delete from public.notifications where id = $1`, [lockId]).catch(() => undefined)
    return { ok: false, status: 'error', message }
  }
}
```

- [ ] **Step 4: Verify the file compiles**

Run: `npx tsc --noEmit lib/notifications/staff-notify.ts 2>&1 | head -20`

Expected: No errors (or only unrelated pre-existing errors)

---

### Task 2: Create the API route

**Files:**
- Create: `app/api/notifications/staff/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
// app/api/notifications/staff/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { notifyStaffOnEvent } from '@/lib/notifications/staff-notify'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { eventType, entityType, entityId } = body

    if (!eventType || !entityType || !entityId) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: eventType, entityType, entityId' },
        { status: 400 }
      )
    }

    const result = await notifyStaffOnEvent(eventType, entityType, entityId)

    if (!result.ok) {
      console.error(`❌ [STAFF-NOTIFY-API] ${result.message}`)
      return NextResponse.json({ success: false, message: result.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: result.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('❌ [STAFF-NOTIFY-API] Unhandled error:', err)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify the route compiles**

Run: `npx tsc --noEmit app/api/notifications/staff/route.ts 2>&1 | head -20`

Expected: No errors

- [ ] **Step 3: Commit Task 1 and Task 2**

```bash
git add lib/notifications/staff-notify.ts app/api/notifications/staff/route.ts
git commit -m "feat: add staff email notification module and API route"
```

---

### Task 3: Wire up application workflow notifications

**Files:**
- Modify: `app/review/page.tsx` (line ~625)
- Modify: `app/assessment/application/[id]/page.tsx` (line ~1599)
- Modify: `app/review/application/[id]/page.tsx` (lines ~848, ~910)
- Modify: `app/verification/application/[id]/page.tsx` (lines ~645, ~690)
- Modify: `app/api/approver/final-decision/route.ts` (line ~356)
- Modify: `lib/notifications/submission.ts` (line ~166)

- [ ] **Step 1: Add notification after assessor assignment in `app/review/page.tsx`**

After line 625 (after the audit log try/catch and the console.log success line), add:

```typescript
      // Notify assigned assessor via email
      fetch('/api/notifications/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'application_assigned_to_assessor',
          entityType: 'application',
          entityId: selectedAppForAssignment.id,
        }),
      }).catch(() => null)
```

Insert this right after line 625:
```
console.log(`✅ Application ${selectedAppForAssignment.application_number} ${isReassign ? 'reassigned' : 'assigned'} to ${selectedAssessor.first_name} ${selectedAssessor.last_name}`);
```

And right before line 627:
```
setReviewApplications(prev =>
```

- [ ] **Step 2: Add notification after forward to review in `app/assessment/application/[id]/page.tsx`**

After line 1598 (after the audit log try/catch block), add before `setShowSendToReviewDialog(false)`:

```typescript
      // Notify reviewer via email
      fetch('/api/notifications/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'application_forwarded_to_review',
          entityType: 'application',
          entityId: application.id,
        }),
      }).catch(() => null)
```

Insert after line 1598 (`}`) and before line 1600 (`setShowSendToReviewDialog(false)`).

- [ ] **Step 3: Add notification after forward to verification in `app/review/application/[id]/page.tsx`**

After line 847 (after the audit log try/catch block), add before `setShowSendToVerificationDialog(false)`:

```typescript
      // Notify verifier via email
      fetch('/api/notifications/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'application_forwarded_to_verification',
          entityType: 'application',
          entityId: application.id,
        }),
      }).catch(() => null)
```

Insert after line 847 (`console.warn(...)` / `}`) and before line 849 (`setShowSendToVerificationDialog(false)`).

- [ ] **Step 4: Add notification after return to assessment in `app/review/application/[id]/page.tsx`**

After line 908 (after the audit log try/catch block), add before `setShowRevisionDialog(false)`:

```typescript
      // Notify assessor of returned application
      fetch('/api/notifications/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'application_returned_to_assessment',
          entityType: 'application',
          entityId: application.id,
        }),
      }).catch(() => null)
```

Insert after line 909 (`}`) and before line 911 (`setShowRevisionDialog(false)`).

- [ ] **Step 5: Add notification after forward to approval in `app/verification/application/[id]/page.tsx`**

After line 636 (after the workflow_history insert), add before `setShowSendToApproverDialog(false)`:

```typescript
      // Notify approver via email
      fetch('/api/notifications/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'application_forwarded_to_approval',
          entityType: 'application',
          entityId: application.id,
        }),
      }).catch(() => null)
```

Insert after line 636 (`});`) and before line 638 (`setShowSendToApproverDialog(false)`).

- [ ] **Step 6: Add notification after return to review in `app/verification/application/[id]/page.tsx`**

After line 679 (after the reviews insert), add before `setShowReturnDialog(false)`:

```typescript
      // Notify reviewer of returned application
      fetch('/api/notifications/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'application_returned_to_review',
          entityType: 'application',
          entityId: application.id,
        }),
      }).catch(() => null)
```

Insert after line 679 (`}]);`) and before line 681 (`setShowReturnDialog(false)`).

- [ ] **Step 7: Add notification for return_to_verification in `app/api/approver/final-decision/route.ts`**

After line 355 (after the log for "application returned to verification"), add:

```typescript
    // Notify verifier of returned application (server-side, direct call)
    try {
      const { notifyStaffOnEvent } = await import('@/lib/notifications/staff-notify')
      await notifyStaffOnEvent('application_returned_to_verification', 'application', applicationId)
    } catch (notifErr) {
      console.warn('⚠️ [FINAL-DECISION] Failed to send staff notification:', notifErr)
    }
```

Insert after line 355 (`})`) and before line 357 (`}`). This is inside the `else` branch for the return_to_verification decision.

- [ ] **Step 8: Add reviewer notification on application submission in `lib/notifications/submission.ts`**

At the end of `notifyOnApplicationSubmitted`, after the successful return on line 166 (`if (smsSent && emailSent) return ...`), add a fire-and-forget staff notification. Modify the function so that after the applicant notification succeeds, it also notifies the reviewer:

After the final `await query(...)` that updates the notification row (around line 163) and before the return statements, add:

```typescript
    // Fire-and-forget: notify reviewer of new submission
    import('@/lib/notifications/staff-notify')
      .then(({ notifyStaffOnEvent }) =>
        notifyStaffOnEvent('application_submitted', 'application', applicationId)
      )
      .catch(() => undefined)
```

Insert this after line 163 (`[lockId, copy.email.text, smsSent, emailSent]`) / line 164 (`)`) and before line 166 (`if (smsSent && emailSent)`).

- [ ] **Step 9: Commit application workflow notifications**

```bash
git add app/review/page.tsx \
  app/assessment/application/[id]/page.tsx \
  app/review/application/[id]/page.tsx \
  app/verification/application/[id]/page.tsx \
  app/api/approver/final-decision/route.ts \
  lib/notifications/submission.ts
git commit -m "feat: wire up staff email notifications for application workflow events"
```

---

### Task 4: Wire up water use report notifications

**Files:**
- Modify: `components/water-use-reports/water-use-reports-list.tsx` (line ~172)
- Modify: `components/water-use-reports/water-use-report-workflow-actions.tsx` (line ~244)

- [ ] **Step 1: Add notification after WUR assessor assignment in `components/water-use-reports/water-use-reports-list.tsx`**

After line 172 (after the console.log success line), add before `setAssignDialogOpen(false)`:

```typescript
      // Notify assigned assessor via email
      fetch('/api/notifications/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'wur_assigned_to_assessor',
          entityType: 'water_use_report',
          entityId: selectedReport.id,
        }),
      }).catch(() => null)
```

Insert after line 172 (`console.log(...)`) and before line 174 (`setAssignDialogOpen(false)`).

- [ ] **Step 2: Add notification after WUR workflow transitions in `components/water-use-reports/water-use-report-workflow-actions.tsx`**

After line 240 (after the workflow history error check), add before `setNotes("")`:

```typescript
        // Notify target staff member via email
        const wurEventMap: Record<string, string> = {
          'submit_for_review': 'wur_forwarded_to_review',
          'forward_to_review': 'wur_forwarded_to_review',
          'forward_to_verification': 'wur_forwarded_to_verification',
          'forward_to_approval': 'wur_forwarded_to_approval',
          'return_to_assessment': 'wur_returned_to_assessment',
          'return_to_review': 'wur_returned_to_review',
          'return_to_verification': 'wur_returned_to_verification',
        }
        const staffEventType = wurEventMap[transition.action]
        if (staffEventType) {
          fetch('/api/notifications/staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventType: staffEventType,
              entityType: 'water_use_report',
              entityId: reportId,
            }),
          }).catch(() => null)
        }
```

Insert after line 240 (`}`) and before line 242 (`setNotes("")`).

- [ ] **Step 3: Commit water use report notifications**

```bash
git add components/water-use-reports/water-use-reports-list.tsx \
  components/water-use-reports/water-use-report-workflow-actions.tsx
git commit -m "feat: wire up staff email notifications for water use report workflow events"
```

---

### Task 5: Wire up inspection notifications

**Files:**
- Modify: `components/inspection/staff-inspections-tab.tsx` (line ~259)
- Modify: `components/inspection/inspection-workflow-actions.tsx` (line ~285)

- [ ] **Step 1: Add notification after inspection assessor assignment in `components/inspection/staff-inspections-tab.tsx`**

After line 259 (after the console.log success line), add before `setInspections(prev =>`:

```typescript
      // Notify assigned assessor via email
      fetch('/api/notifications/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'inspection_assigned_to_assessor',
          entityType: 'inspection',
          entityId: selectedInspection.id,
        }),
      }).catch(() => null)
```

Insert after line 259 (`console.log(...)`) and before line 261 (`setInspections(prev =>`).

- [ ] **Step 2: Add notification after inspection workflow transitions in `components/inspection/inspection-workflow-actions.tsx`**

After line 281 (after the workflow history error check), add before `setNotes("")`:

```typescript
        // Notify target staff member via email
        const inspEventMap: Record<string, string> = {
          'submit_for_review': 'inspection_forwarded_to_review',
          'forward_to_review': 'inspection_forwarded_to_review',
          'return_to_assessment': 'inspection_returned_to_assessment',
        }
        const staffEventType = inspEventMap[transition.action]
        if (staffEventType) {
          fetch('/api/notifications/staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventType: staffEventType,
              entityType: 'inspection',
              entityId: inspectionId,
            }),
          }).catch(() => null)
        }
```

Insert after line 281 (`}`) and before line 283 (`setNotes("")`).

- [ ] **Step 3: Commit inspection notifications**

```bash
git add components/inspection/staff-inspections-tab.tsx \
  components/inspection/inspection-workflow-actions.tsx
git commit -m "feat: wire up staff email notifications for inspection workflow events"
```

---

### Task 6: Manual testing

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test application assigned to assessor**

1. Log in as reviewer
2. Go to the review dashboard
3. Assign an assessor to a submitted application
4. Verify the assessor receives an email with subject `[RWB] Application Assigned for Assessment — APP-XXXX`

- [ ] **Step 3: Test application forwarded to review**

1. Log in as assessor
2. Complete an assessment and forward to review
3. Verify the reviewer receives an email

- [ ] **Step 4: Test remaining workflow events**

Work through each event type to verify emails are sent correctly. Check `public.notifications` table to verify idempotency (no duplicate rows for same event + entity + user).

- [ ] **Step 5: Test idempotency**

1. Trigger any event twice (e.g., call the API endpoint manually with the same payload)
2. Verify only one email is sent (second call returns `skipped_already_sent`)
3. Verify only one notification row exists in the database
