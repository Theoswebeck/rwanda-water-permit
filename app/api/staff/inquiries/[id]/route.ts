import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { resolveEffectiveRoles } from '@/lib/auth/effective-roles'
import {
  ensureInquiriesSchema,
  type InquiryMessageRecord,
  type InquiryRecord,
  type InquiryStatus,
} from '@/lib/inquiries/schema'
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'

export const runtime = 'nodejs'

const ALLOWED_STAFF_ROLES = new Set([
  'admin',
  'reviewer',
  'assessor',
  'inspector',
  'approver',
  'verifier',
])

const VALID_STATUSES = new Set<InquiryStatus>([
  'open',
  'assigned',
  'in_progress',
  'answered',
  'closed',
])

async function getStaffActor(req: NextRequest) {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  const claims = await verifySessionToken(token)
  if (!claims?.sub) return null

  const userId = String(claims.sub)
  const resolved = await resolveEffectiveRoles({ userId, claimsRole: claims.role })
  const effectiveRoles = resolved.effectiveRoles.map((r) => String(r).toLowerCase())
  const primaryRole = String(resolved.baseRole || claims.role || '').toLowerCase()
  const hasStaffAccess =
    effectiveRoles.some((r) => ALLOWED_STAFF_ROLES.has(r)) || ALLOWED_STAFF_ROLES.has(primaryRole)
  if (!hasStaffAccess) return null

  const userRes = await query<{ first_name: string | null; last_name: string | null; email: string }>(
    `SELECT first_name, last_name, email FROM public.users WHERE id = $1 LIMIT 1`,
    [userId]
  )
  const u = userRes.rows[0]
  const displayName =
    `${u?.first_name || ''} ${u?.last_name || ''}`.trim() || u?.email || 'RWB Officer'

  const canAssign =
    effectiveRoles.includes('admin') ||
    effectiveRoles.includes('reviewer') ||
    effectiveRoles.includes('approver') ||
    primaryRole === 'admin' ||
    primaryRole === 'reviewer' ||
    primaryRole === 'approver'

  return {
    userId,
    primaryRole,
    displayName,
    email: u?.email || '',
    canAssign,
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getStaffActor(req)
    if (!actor) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    await ensureInquiriesSchema()
    const { id } = await context.params

    const inquiryRes = await query<InquiryRecord>(
      `
      SELECT
        i.*,
        u.email AS assigned_to_email,
        NULLIF(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '') AS assigned_to_name
      FROM public.inquiries i
      LEFT JOIN public.users u ON u.id = i.assigned_to_user_id
      WHERE i.id = $1
      LIMIT 1
      `,
      [id]
    )
    const inquiry = inquiryRes.rows[0]
    if (!inquiry) {
      return NextResponse.json({ success: false, message: 'Inquiry not found' }, { status: 404 })
    }

    const messagesRes = await query<InquiryMessageRecord>(
      `
      SELECT id, inquiry_id, sender_type, sender_user_id, sender_name, sender_role, message, is_internal_note, created_at
      FROM public.inquiry_messages
      WHERE inquiry_id = $1
      ORDER BY created_at ASC
      `,
      [id]
    )

    return NextResponse.json({
      success: true,
      inquiry,
      messages: messagesRes.rows,
    })
  } catch (error) {
    console.error('❌ GET /api/staff/inquiries/[id] error:', error)
    return NextResponse.json({ success: false, message: 'Failed to load inquiry.' }, { status: 500 })
  }
}

/**
 * PATCH /api/staff/inquiries/[id]
 * Assigns an inquiry to an Assessor / Inspector (Reviewer/Admin) or updates status.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getStaffActor(req)
    if (!actor) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    await ensureInquiriesSchema()
    const { id } = await context.params
    const body = await req.json().catch(() => null)

    const existingRes = await query<InquiryRecord>(
      `SELECT * FROM public.inquiries WHERE id = $1 LIMIT 1`,
      [id]
    )
    const existing = existingRes.rows[0]
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Inquiry not found' }, { status: 404 })
    }

    if (body?.assignedToUserId !== undefined) {
      if (!actor.canAssign) {
        return NextResponse.json(
          { success: false, message: 'Only Reviewers or Admins can assign inquiries.' },
          { status: 403 }
        )
      }

      const targetUserId = body.assignedToUserId ? String(body.assignedToUserId).trim() : null
      const handoffNote = typeof body?.handoffNote === 'string' ? body.handoffNote.trim() : ''

      if (targetUserId) {
        const targetRes = await query<{
          id: string
          first_name: string | null
          last_name: string | null
          email: string
          role: string
        }>(
          `SELECT id, first_name, last_name, email, role::text AS role FROM public.users WHERE id = $1 LIMIT 1`,
          [targetUserId]
        )
        const target = targetRes.rows[0]
        if (!target) {
          return NextResponse.json({ success: false, message: 'Target staff user not found.' }, { status: 404 })
        }
        const targetName =
          `${target.first_name || ''} ${target.last_name || ''}`.trim() || target.email
        const targetRole = String(target.role || '').toLowerCase()

        await query(
          `
          UPDATE public.inquiries
          SET
            assigned_to_user_id = $2,
            assigned_role = $3,
            assigned_by_user_id = $4,
            assigned_at = now(),
            status = 'assigned',
            updated_at = now()
          WHERE id = $1
          `,
          [id, target.id, targetRole, actor.userId]
        )

        await query(
          `
          INSERT INTO public.inquiry_messages (
            inquiry_id, sender_type, sender_user_id, sender_name, sender_role, message, is_internal_note, created_at
          ) VALUES ($1, 'system', $2, $3, $4, $5, true, now())
          `,
          [
            id,
            actor.userId,
            actor.displayName,
            actor.primaryRole,
            `Assigned to ${targetRole.toUpperCase()} (${targetName}) by ${actor.displayName}.`,
          ]
        )

        if (handoffNote) {
          await query(
            `
            INSERT INTO public.inquiry_messages (
              inquiry_id, sender_type, sender_user_id, sender_name, sender_role, message, is_internal_note, created_at
            ) VALUES ($1, 'staff', $2, $3, $4, $5, true, now())
            `,
            [id, actor.userId, actor.displayName, actor.primaryRole, handoffNote]
          )
        }

        // Notify assigned officer by email (best-effort)
        try {
          await sendSmtpEmail({
            to: target.email,
            subject: `[${existing.inquiry_number}] Inquiry Assigned to You: ${existing.subject}`,
            title: `Inquiry Assigned (${existing.inquiry_number})`,
            text: [
              `Hello ${targetName},`,
              ``,
              `${actor.displayName} (${actor.primaryRole}) has assigned citizen inquiry ${existing.inquiry_number} to you.`,
              `Subject: ${existing.subject}`,
              `From: ${existing.sender_name} <${existing.sender_email}>`,
              handoffNote ? `Internal Note: ${handoffNote}` : null,
              ``,
              `Please open the Inquiries tab in your RWB Portal workbench to review and respond.`,
            ]
              .filter((l): l is string => l !== null)
              .join('\n'),
          })
        } catch {
          // non-fatal
        }
      } else {
        await query(
          `
          UPDATE public.inquiries
          SET assigned_to_user_id = NULL, assigned_role = NULL, status = 'open', updated_at = now()
          WHERE id = $1
          `,
          [id]
        )
      }
    }

    if (body?.status !== undefined) {
      const nextStatus = String(body.status).trim().toLowerCase() as InquiryStatus
      if (!VALID_STATUSES.has(nextStatus)) {
        return NextResponse.json({ success: false, message: 'Invalid status' }, { status: 400 })
      }
      await query(
        `
        UPDATE public.inquiries
        SET
          status = $2,
          resolved_at = CASE WHEN $2 IN ('answered', 'closed') THEN now() ELSE resolved_at END,
          updated_at = now()
        WHERE id = $1
        `,
        [id, nextStatus]
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ PATCH /api/staff/inquiries/[id] error:', error)
    return NextResponse.json({ success: false, message: 'Failed to update inquiry.' }, { status: 500 })
  }
}

/**
 * POST /api/staff/inquiries/[id]
 * Appends a staff reply (public) or internal note to the inquiry thread.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getStaffActor(req)
    if (!actor) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    await ensureInquiriesSchema()
    const { id } = await context.params
    const body = await req.json().catch(() => null)
    const message = String(body?.message ?? '').trim()
    const isInternalNote = Boolean(body?.isInternalNote)

    if (!message) {
      return NextResponse.json({ success: false, message: 'Message cannot be empty.' }, { status: 400 })
    }

    const inquiryRes = await query<InquiryRecord>(
      `SELECT * FROM public.inquiries WHERE id = $1 LIMIT 1`,
      [id]
    )
    const inquiry = inquiryRes.rows[0]
    if (!inquiry) {
      return NextResponse.json({ success: false, message: 'Inquiry not found' }, { status: 404 })
    }

    const msgRes = await query<InquiryMessageRecord>(
      `
      INSERT INTO public.inquiry_messages (
        inquiry_id, sender_type, sender_user_id, sender_name, sender_role, message, is_internal_note, created_at
      ) VALUES ($1, 'staff', $2, $3, $4, $5, $6, now())
      RETURNING *
      `,
      [id, actor.userId, actor.displayName, actor.primaryRole, message, isInternalNote]
    )

    if (!isInternalNote && inquiry.status !== 'closed') {
      await query(
        `UPDATE public.inquiries SET status = 'answered', resolved_at = now(), updated_at = now() WHERE id = $1`,
        [id]
      )

      // Email the citizen with the response + tracking number so they can reply in the chat widget
      try {
        await sendSmtpEmail({
          to: inquiry.sender_email,
          subject: `Re: [${inquiry.inquiry_number}] ${inquiry.subject}`,
          title: `Response from Rwanda Water Resources Board (${inquiry.inquiry_number})`,
          text: [
            `Dear ${inquiry.sender_name},`,
            ``,
            `An RWB officer (${actor.displayName}) has replied to your inquiry (${inquiry.inquiry_number}):`,
            ``,
            message,
            ``,
            `---`,
            `To continue this conversation, open the "Ask RWB" chat panel on the Rwanda Water Permit System home page and enter your Tracking Number (${inquiry.inquiry_number}) and email (${inquiry.sender_email}).`,
          ].join('\n'),
        })
      } catch (smtpErr) {
        console.warn('⚠️ Staff reply saved to DB, but email to citizen failed:', smtpErr)
      }
    } else {
      await query(`UPDATE public.inquiries SET updated_at = now() WHERE id = $1`, [id])
    }

    return NextResponse.json({
      success: true,
      messageRecord: msgRes.rows[0],
    })
  } catch (error) {
    console.error('❌ POST /api/staff/inquiries/[id] error:', error)
    return NextResponse.json({ success: false, message: 'Failed to send reply.' }, { status: 500 })
  }
}

