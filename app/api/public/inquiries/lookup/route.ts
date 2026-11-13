import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { ensureInquiriesSchema, type InquiryMessageRecord, type InquiryRecord } from '@/lib/inquiries/schema'
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'
import { SITE_CONTENT_DEFAULTS } from '@/lib/site-content'

export const runtime = 'nodejs'

async function findInquiryForCitizen(inquiryNumber: string, email: string) {
  const res = await query<InquiryRecord>(
    `
    SELECT
      i.*,
      u.email AS assigned_to_email,
      NULLIF(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '') AS assigned_to_name
    FROM public.inquiries i
    LEFT JOIN public.users u ON u.id = i.assigned_to_user_id
    WHERE upper(i.inquiry_number) = upper($1)
      AND lower(i.sender_email) = lower($2)
    LIMIT 1
    `,
    [inquiryNumber.trim(), email.trim()]
  )
  return res.rows[0] ?? null
}

/**
 * POST /api/public/inquiries/lookup
 * - With `{ inquiryNumber, email }`: fetches the inquiry and public chat thread.
 * - With `{ inquiryNumber, email, message }`: appends a citizen reply to the thread.
 */
export async function POST(req: NextRequest) {
  try {
    await ensureInquiriesSchema()

    const body = await req.json().catch(() => null)
    const inquiryNumber = String(body?.inquiryNumber ?? '').trim()
    const email = String(body?.email ?? '').trim()
    const replyMessage = typeof body?.message === 'string' ? body.message.trim() : ''

    if (!inquiryNumber || !email) {
      return NextResponse.json(
        { success: false, message: 'Inquiry number and email address are required.' },
        { status: 400 }
      )
    }

    const inquiry = await findInquiryForCitizen(inquiryNumber, email)
    if (!inquiry) {
      return NextResponse.json(
        { success: false, message: 'No inquiry found matching that tracking number and email.' },
        { status: 404 }
      )
    }

    if (replyMessage) {
      if (inquiry.status === 'closed') {
        return NextResponse.json(
          { success: false, message: 'This inquiry is closed. Please open a new inquiry.' },
          { status: 400 }
        )
      }

      await query(
        `
        INSERT INTO public.inquiry_messages (
          inquiry_id, sender_type, sender_user_id, sender_name, sender_role, message, is_internal_note, created_at
        ) VALUES ($1, 'citizen', $2, $3, 'applicant', $4, false, now())
        `,
        [inquiry.id, inquiry.user_id, inquiry.sender_name, replyMessage]
      )

      const nextStatus = inquiry.assigned_to_user_id ? 'in_progress' : 'open'
      await query(
        `UPDATE public.inquiries SET status = $2, updated_at = now() WHERE id = $1`,
        [inquiry.id, nextStatus]
      )
      inquiry.status = nextStatus

      // Notify assigned officer (or office email) best-effort
      const notifyTo = inquiry.assigned_to_email || process.env.CONTACT_EMAIL || SITE_CONTENT_DEFAULTS.office.email
      try {
        await sendSmtpEmail({
          to: notifyTo,
          subject: `[${inquiry.inquiry_number}] New follow-up reply from ${inquiry.sender_name}`,
          title: `Follow-up Reply on ${inquiry.inquiry_number}`,
          text: [
            `Citizen: ${inquiry.sender_name} <${inquiry.sender_email}>`,
            `Subject: ${inquiry.subject}`,
            ``,
            `Reply:`,
            replyMessage,
          ].join('\n'),
        })
      } catch {
        // non-fatal
      }
    }

    const messagesRes = await query<InquiryMessageRecord>(
      `
      SELECT id, inquiry_id, sender_type, sender_user_id, sender_name, sender_role, message, is_internal_note, created_at
      FROM public.inquiry_messages
      WHERE inquiry_id = $1 AND is_internal_note = false
      ORDER BY created_at ASC
      `,
      [inquiry.id]
    )

    return NextResponse.json({
      success: true,
      inquiry,
      messages: messagesRes.rows,
    })
  } catch (error) {
    console.error('❌ Public inquiry lookup error:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to load inquiry thread.' },
      { status: 500 }
    )
  }
}

