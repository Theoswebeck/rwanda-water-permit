/**
 * Terminate an application because it falls under an EXEMPTED water use
 * (RWB point 12) — e.g. irrigation on land <= 1 ha needs no permit.
 *
 * This is a TERMINAL status, clearly distinguished from return-for-revision:
 * the applicant is told no permit is required and nothing needs correcting.
 *
 * POST body: { reason: string, outcome?: 'exempted' | 'rejected' }
 *   reason  — mandatory staff-provided reason.
 *   outcome — 'exempted' (default): status 'terminated', no permit required.
 *             'rejected': status 'rejected' (rejection_reason/rejected_at),
 *             the applicant is told the application was refused.
 *
 * Mirrors the existing status-change route pattern
 * (app/api/approver/final-decision/route.ts): session-gated, role-checked,
 * status update + notification row + audit log, applicant email sent AFTER
 * the DB mutation (via lib/notifications/termination.ts, idempotent).
 *
 * AUTHORIZATION: holding a staff role is not sufficient. The caller must own
 * the application at its CURRENT status (STAGE_OWNERS below), and an assessor
 * must additionally be the application's assigned_assessor_id (or hold an
 * ACTIVE assessor delegation from that assigned assessor) — assessors can
 * see/track the whole pipeline but may only act on their own assignments.
 * Admins and superusers keep the override.
 *
 * MIGRATION ORDER: the status write refuses cleanly with 503/MIGRATION_PENDING
 * (nothing written) when database/add-terminated-status.sql has not been
 * applied yet — see the comment on the update below for why no fallback status
 * is stored here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { hasAnyRole, resolveEffectiveRoles } from '@/lib/auth/effective-roles'
import { getInvalidEnumFallbackFromError } from '@/lib/db/application-enum-sanitizer'
import { notifyOnApplicationTerminated, type ClosureOutcome } from '@/lib/notifications/termination'

export const runtime = 'nodejs'

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const SUPERUSER_EMAILS = new Set(['nizzogentl1@gmail.com', 'nshutidavy@gmail.com'])

// Exemption is established during assessment/review, but verifiers and
// approvers may also catch it downstream. Inspectors are excluded.
// NOTE: this is only the *coarse* gate — the authoritative check is the
// stage-ownership matrix below (STAGE_OWNERS + the assigned-assessor rule).
const TERMINATE_ROLES = ['assessor', 'reviewer', 'verifier', 'approver', 'admin'] as const

/**
 * Which role owns an application at each pipeline status — i.e. who is the
 * current actor and therefore may take a terminal action on it.
 *
 * Mirrors the existing per-stage UI gates:
 *   - assessment detail page: pending_assessment | under_review | returned_to_assessment
 *   - review detail page:     pending_review | under_review | returned_to_review
 *   - verification page:      pending_verification | returned_to_verification
 *   - approver final-decision: pending_final_approval
 *
 * A status that is not listed here has no staff owner (e.g. revision_required,
 * where the application sits with the applicant), so only an admin/superuser
 * may terminate it.
 */
const STAGE_OWNERS: Record<string, ReadonlyArray<(typeof TERMINATE_ROLES)[number]>> = {
  submitted: ['reviewer'],
  pending_assessment: ['assessor'],
  under_review: ['assessor', 'reviewer'],
  returned_to_assessment: ['assessor'],
  pending_review: ['reviewer'],
  returned_to_review: ['reviewer'],
  pending_verification: ['verifier'],
  returned_to_verification: ['verifier'],
  pending_final_approval: ['approver'],
}

// Never terminate an application that already reached a terminal or
// post-approval state — this action only applies to in-flight applications.
const NON_TERMINATABLE_STATUSES = new Set([
  'approved',
  'approved_pending_permit',
  'rejected',
  'cancelled',
  'expired',
  'terminated',
])

/**
 * True when `actorUserId` is currently covering for `assignedAssessorId` via an
 * active assessor role delegation (same window predicate as
 * lib/auth/effective-roles.ts). effective-roles only reports WHICH roles the
 * delegate holds, not WHO delegated them, so the delegator link is read here.
 */
async function isActiveAssessorDelegate(actorUserId: string, assignedAssessorId: string): Promise<boolean> {
  try {
    const res = await query<{ id: string }>(
      `
      select id
      from public.role_delegations
      where delegate_id = $1
        and delegator_id = $2
        and delegated_role::text = 'assessor'
        and status = 'active'
        and start_date <= now()
        and (end_date is null or end_date > now())
      limit 1
      `,
      [actorUserId, assignedAssessorId]
    )
    return res.rows.length > 0
  } catch {
    // Fail CLOSED: a delegation lookup error must never grant entitlement.
    return false
  }
}

/**
 * Columns/enum value that only exist once database/add-terminated-status.sql
 * has been applied. The on-prem box rebuilds from a push within ~2 minutes
 * while this migration is applied by hand, so the code can genuinely run
 * against a database that does not know 'terminated' yet.
 */
const TERMINATED_MIGRATION = 'database/add-terminated-status.sql'
const TERMINATED_MIGRATION_COLUMNS = ['termination_reason', 'terminated_at']

const MISSING_COLUMN_PATTERN = /column "?([a-z0-9_]+)"?.*does not exist/i

/** SQLSTATE 42703 on one of the columns this migration adds. */
function isTerminatedMigrationMissingColumn(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  if ((err as { code?: unknown }).code !== '42703') return false
  const message = typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message : ''
  const match = message.match(MISSING_COLUMN_PATTERN)
  return !!match && TERMINATED_MIGRATION_COLUMNS.includes(match[1].toLowerCase())
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await ctx.params
    if (!isNonEmptyString(applicationId)) {
      return NextResponse.json({ success: false, message: 'Invalid application id' }, { status: 400 })
    }

    const token = readSessionTokenFromRequest(req)
    const claims = token ? await verifySessionToken(token) : null
    const actorUserId = claims?.sub
    if (!actorUserId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const resolvedRoles = await resolveEffectiveRoles({
      userId: actorUserId,
      claimsRole: claims?.role,
    })
    const actorEmail = String(claims?.email || '').trim().toLowerCase()
    const isSuperuser = SUPERUSER_EMAILS.has(actorEmail)
    const isAdmin = hasAnyRole(resolvedRoles.effectiveRoles, ['admin'])
    if (!isSuperuser && !hasAnyRole(resolvedRoles.effectiveRoles, [...TERMINATE_ROLES])) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const reason = String((body?.reason as string | undefined) || '').trim()
    const outcome: ClosureOutcome = body?.outcome === 'rejected' ? 'rejected' : 'exempted'
    if (body?.outcome !== undefined && body.outcome !== 'rejected' && body.outcome !== 'exempted') {
      return NextResponse.json({ success: false, message: 'Invalid outcome.' }, { status: 400 })
    }
    if (!isNonEmptyString(reason)) {
      return NextResponse.json(
        {
          success: false,
          message:
            outcome === 'rejected'
              ? 'A rejection reason is required.'
              : 'A termination reason is required (why the water use is exempted).',
        },
        { status: 400 }
      )
    }

    const appRes = await query<{
      id: string
      application_number: string | null
      applicant_id: string
      status: string
      assigned_assessor_id: string | null
    }>(
      `select id, application_number, applicant_id, status::text as status, assigned_assessor_id
       from public.applications where id = $1 limit 1`,
      [applicationId]
    )
    const application = appRes.rows[0]
    if (!application) {
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 })
    }
    if (NON_TERMINATABLE_STATUSES.has(application.status)) {
      return NextResponse.json(
        { success: false, message: `Application cannot be terminated from status "${application.status}".` },
        { status: 409 }
      )
    }
    // ── Stage-ownership authorization ────────────────────────────────────────
    // A staff role alone is NOT enough: the caller must be the actor who owns
    // this application AT ITS CURRENT STATUS. Admins/superusers keep the
    // override (same precedent as app/api/approver/final-decision/route.ts).
    if (!isAdmin && !isSuperuser) {
      const owners = STAGE_OWNERS[application.status] || []
      const heldOwnerRoles = owners.filter((role) => hasAnyRole(resolvedRoles.effectiveRoles, [role]))
      // Assessors are assigned per application (assigned_assessor_id, set by the
      // reviewer on /review). Tracking every application read-only is allowed,
      // but acting on one is not: an unassigned application, or one assigned to
      // a different assessor, is never terminatable by this assessor. The other
      // stage roles are not per-application assigned anywhere in the codebase,
      // so they authorize by stage + role only — the same precedent as
      // app/api/approver/final-decision/route.ts.
      // An assessor who is out of office can delegate their role
      // (public.role_delegations). resolveEffectiveRoles() already grants the
      // delegate the 'assessor' role, but the assignment still names the
      // absent assessor, so the delegate must also be recognised HERE or they
      // are locked out of every application they are covering. Only an ACTIVE,
      // in-window delegation FROM THIS APPLICATION'S assigned assessor counts —
      // it never widens access to applications the delegator was not assigned.
      const isAssessorDelegate =
        isNonEmptyString(application.assigned_assessor_id) &&
        application.assigned_assessor_id !== actorUserId &&
        heldOwnerRoles.includes('assessor')
          ? await isActiveAssessorDelegate(actorUserId, application.assigned_assessor_id)
          : false

      const isEntitled = heldOwnerRoles.some(
        (role) =>
          role !== 'assessor' || application.assigned_assessor_id === actorUserId || isAssessorDelegate
      )
      if (!isEntitled) {
        const assessorOnly = heldOwnerRoles.length > 0 && heldOwnerRoles.every((role) => role === 'assessor')
        return NextResponse.json(
          {
            success: false,
            message: assessorOnly
              ? application.assigned_assessor_id
                ? 'This application is assigned to another assessor. Only the assigned assessor can terminate it.'
                : 'This application has not been assigned to you. Ask a reviewer to assign it before acting on it.'
              : `You are not the current actor on this application (status "${application.status}"), so you cannot terminate it.`,
          },
          { status: 403 }
        )
      }
    }

    const applicationNumber = application.application_number || application.id
    const previousStatus = application.status
    const newStatus = outcome === 'rejected' ? 'rejected' : 'terminated'

    // ── Migration-order tolerance ────────────────────────────────────────────
    // The whole feature (enum value + both columns) ships in ONE manually
    // applied migration, so on a box that has the new code but not the
    // migration this single statement fails atomically — nothing is written.
    //
    // Unlike the applicant write paths (which fall back to the legacy terminal
    // status 'cancelled' so an applicant is never blocked from submitting), we
    // deliberately DO NOT store a fallback status here:
    //   * the mandatory termination reason has nowhere to go (its column is
    //     missing too), so the applicant email would say "(not specified)";
    //   * notifyOnApplicationTerminated() only fires for status='terminated',
    //     so a 'cancelled' row would silently notify nobody;
    //   * 'cancelled' is a different, misleading outcome for the applicant.
    // Refusing cleanly leaves the application untouched at its current status
    // (never an editable draft, nothing half-written) and tells staff exactly
    // what to do. The action succeeds on retry the moment the SQL is applied,
    // with no redeploy.
    try {
      if (outcome === 'rejected') {
        // 'rejected' + rejection_reason/rejected_at predate this route (approver
        // final-decision uses them), so no migration-order concern here.
        await query(
          `
          update public.applications
          set status = 'rejected', rejection_reason = $2, rejected_at = now(), updated_at = now()
          where id = $1
          `,
          [applicationId, reason]
        )
      } else {
        await query(
          `
          update public.applications
          set
            status = 'terminated',
            termination_reason = $2,
            terminated_at = now(),
            updated_at = now()
          where id = $1
          `,
          [applicationId, reason]
        )
      }
    } catch (writeErr) {
      const enumFallback = getInvalidEnumFallbackFromError(writeErr, { status: 'terminated' })
      const missingColumn = isTerminatedMigrationMissingColumn(writeErr)
      if (enumFallback?.from === 'terminated' || missingColumn) {
        const migration = enumFallback?.migration || TERMINATED_MIGRATION
        console.error(
          `❌ [terminate] database is missing the terminated-status migration (${migration}); refusing to write a misleading fallback status.`,
          writeErr
        )
        return NextResponse.json(
          {
            success: false,
            code: 'MIGRATION_PENDING',
            message:
              'Termination is not enabled on this database yet: the "terminated" status migration has not been applied. ' +
              `Nothing was changed — ask an administrator to run ${migration}, then terminate again.`,
          },
          { status: 503 }
        )
      }
      throw writeErr
    }

    // Applicant email AFTER the DB mutation (idempotent server-side).
    // The status change is already COMMITTED here, so a notification failure
    // must never fail this request — it is reported back instead.
    const notifyResult = await notifyOnApplicationTerminated(applicationId, outcome).catch((err) => {
      console.error('❌ [terminate] termination notification threw:', err)
      return {
        ok: false as const,
        status: 'error' as const,
        applicationId,
        message: err instanceof Error ? err.message : String(err),
        emailSent: false as const,
        notificationRecorded: false,
      }
    })
    if (!notifyResult.ok) {
      console.warn('⚠️ [terminate] applicant termination email did not complete:', notifyResult.message)
    }

    // Audit log (best-effort, mirrors final-decision route).
    await query(
      `
      insert into public.audit_logs (
        user_id, action, entity_type, table_name, record_id, old_values, new_values, description, severity, status, created_at
      ) values ($1, $6, 'application', 'applications', $2, $3::jsonb, $4::jsonb, $5, 'warning', 'success', now())
      `,
      [
        actorUserId,
        applicationId,
        JSON.stringify({ status: previousStatus }),
        JSON.stringify(
          outcome === 'rejected' ? { status: newStatus, rejection_reason: reason } : { status: newStatus, termination_reason: reason }
        ),
        outcome === 'rejected'
          ? `Rejected application ${applicationNumber}. Reason: ${reason}`
          : `Terminated application ${applicationNumber} — exempted water use. Reason: ${reason}`,
        outcome === 'rejected' ? 'application.rejected' : 'application.terminated',
      ]
    ).catch(() => undefined)

    // Honest reporting: the termination itself succeeded, but the UI must not
    // claim the applicant was emailed when they were not.
    const emailSent = notifyResult.emailSent
    const notificationRecorded = notifyResult.notificationRecorded
    const done = outcome === 'rejected' ? 'rejected' : 'terminated'
    return NextResponse.json({
      success: true,
      status: newStatus,
      emailSent,
      applicantNotified: emailSent,
      notificationRecorded,
      warning: emailSent
        ? undefined
        : notificationRecorded
          ? `The application was ${done}, but the email to the applicant could not be delivered. They will still see it in their portal — follow up manually if needed.`
          : `The application was ${done}, but the applicant could NOT be notified (no email and no in-portal notification). Please contact them directly.`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ terminate error:', err)
    return NextResponse.json({ success: false, message: 'Failed to terminate application. Please try again.' }, { status: 500 })
  }
}
