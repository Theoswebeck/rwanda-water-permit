import { query } from '@/lib/db/postgres'
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'
import { buildPortalLink } from '@/lib/notifications/portal-url'

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

// ---------------------------------------------------------------------------
// Staff user resolution
// ---------------------------------------------------------------------------

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
    }>(
      `select id, application_number, assigned_assessor_id, assigned_reviewer_id,
              assigned_verifier_id, assigned_approver_id
       from public.applications where id = $1 limit 1`,
      [entityId]
    )
    return res.rows[0] || null
  }

  if (entityType === 'water_use_report') {
    const res = await query<{
      id: string
      assigned_assessor_id: string | null
      assigned_reviewer_id: string | null
      assigned_verifier_id: string | null
    }>(
      `select id, assigned_assessor_id, assigned_reviewer_id, assigned_verifier_id
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
    }>(
      `select id, assigned_assessor_id, assigned_reviewer_id, assigned_verifier_id
       from public.inspections where id = $1 limit 1`,
      [entityId]
    )
    return res.rows[0] || null
  }

  return null
}

const ASSIGNMENT_COLUMN: Record<TargetRole, string> = {
  assessor: 'assigned_assessor_id',
  reviewer: 'assigned_reviewer_id',
  verifier: 'assigned_verifier_id',
  approver: 'assigned_approver_id',
}

async function resolveStaffUser(
  targetRole: TargetRole,
  entity: Record<string, unknown>,
): Promise<StaffUser | null> {
  const col = ASSIGNMENT_COLUMN[targetRole]
  const assignedUserId = entity[col] as string | null

  if (assignedUserId) {
    const res = await query<StaffUser>(
      `select id, email, first_name, last_name, role
       from public.users where id = $1 limit 1`,
      [assignedUserId],
    )
    if (res.rows[0]) return res.rows[0]
  }

  const res = await query<StaffUser>(
    `select id, email, first_name, last_name, role
     from public.users where lower(role) = $1 limit 1`,
    [targetRole],
  )
  return res.rows[0] || null
}

// ---------------------------------------------------------------------------
// Email copy builder
// ---------------------------------------------------------------------------

function getEntityReference(entity: Record<string, unknown>): string {
  if (typeof entity.application_number === 'string' && entity.application_number) {
    return entity.application_number
  }
  return String(entity.id || '').slice(0, 8)
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

// ---------------------------------------------------------------------------
// Main entry point (idempotent)
// ---------------------------------------------------------------------------

type StaffNotifyResult =
  | { ok: true; status: 'sent' | 'skipped_already_sent' | 'skipped_no_staff' }
  | { ok: false; status: 'error'; message: string }

export async function notifyStaffOnEvent(
  eventType: string,
  entityType: string,
  entityId: string,
): Promise<StaffNotifyResult> {
  try {
    const config = EVENT_REGISTRY[eventType as StaffEventType]
    if (!config) {
      return { ok: false, status: 'error', message: `Unknown event type: ${eventType}` }
    }

    if (config.entityType !== entityType) {
      return { ok: false, status: 'error', message: `Event ${eventType} expects entity type ${config.entityType}, got ${entityType}` }
    }

    console.log(`📧 [STAFF-NOTIFY] Processing ${eventType} for ${entityType}/${entityId}`)

    let entity: Record<string, unknown> | null = null
    try {
      entity = await fetchEntity(config.entityType, entityId) as Record<string, unknown> | null
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
      console.error(`❌ [STAFF-NOTIFY] fetchEntity failed: ${msg}`)
      return { ok: false, status: 'error', message: `DB error fetching entity: ${msg}` }
    }

    if (!entity) {
      return { ok: false, status: 'error', message: `Entity not found: ${entityType}/${entityId}` }
    }

    let staffUser: StaffUser | null = null
    try {
      staffUser = await resolveStaffUser(config.targetRole, entity)
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
      console.error(`❌ [STAFF-NOTIFY] resolveStaffUser failed: ${msg}`)
      return { ok: false, status: 'error', message: `DB error resolving staff: ${msg}` }
    }

    if (!staffUser || !staffUser.email) {
      console.warn(`⚠️ [STAFF-NOTIFY] No staff user found for role=${config.targetRole}, event=${eventType}`)
      return { ok: true, status: 'skipped_no_staff' }
    }

    console.log(`📧 [STAFF-NOTIFY] Target: ${staffUser.email} (${staffUser.first_name} ${staffUser.last_name})`)

    const notifIdCol = config.entityType === 'application' ? 'application_id' : 'assessment_id'

    let existing: { id: string; email_sent: boolean | null } | undefined
    try {
      const existingRes = await query<{ id: string; email_sent: boolean | null }>(
        `select id, email_sent from public.notifications
         where ${notifIdCol} = $1 and title = $2 and user_id = $3
         order by created_at desc limit 1`,
        [entityId, config.title, staffUser.id],
      )
      existing = existingRes.rows[0]
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
      console.error(`❌ [STAFF-NOTIFY] idempotency check failed: ${msg}`)
      return { ok: false, status: 'error', message: `DB error checking existing: ${msg}` }
    }

    if (existing?.email_sent) {
      return { ok: true, status: 'skipped_already_sent' }
    }

    let lockId = existing?.id || null
    if (!lockId) {
      try {
        const lockRes = await query<{ id: string }>(
          `insert into public.notifications (
            user_id, title, message, type, ${notifIdCol}, email_sent, sms_sent, created_at, updated_at
          ) values ($1, $2, $3, 'info', $4, false, false, now(), now())
          returning id`,
          [staffUser.id, config.title, 'Staff notification dispatch started.', entityId],
        )
        lockId = lockRes.rows[0]?.id || null
      } catch (dbErr) {
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
        console.error(`❌ [STAFF-NOTIFY] lock row insert failed: ${msg}`)
        return { ok: false, status: 'error', message: `DB error creating lock: ${msg}` }
      }
    }
    if (!lockId) {
      return { ok: false, status: 'error', message: 'Failed to create notification lock row' }
    }

    try {
      const copy = buildStaffEmailCopy(config, staffUser, entity, entityId)

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
        [lockId, copy.text, emailSent],
      )

      if (emailSent) {
        console.log(`✅ [STAFF-NOTIFY] Email sent to ${staffUser.email} for ${eventType} on ${entityId}`)
        return { ok: true, status: 'sent' }
      }

      return { ok: false, status: 'error', message: 'Email delivery failed (skipped or not delivered)' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`❌ [STAFF-NOTIFY] Email send error: ${msg}`)
      await query(`delete from public.notifications where id = $1`, [lockId]).catch(() => undefined)
      return { ok: false, status: 'error', message: `Email error: ${msg}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`❌ [STAFF-NOTIFY] Unexpected error: ${message}`)
    return { ok: false, status: 'error', message: `Unexpected error: ${message}` }
  }
}
