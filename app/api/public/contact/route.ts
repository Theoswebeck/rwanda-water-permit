import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { ensureInquiriesSchema, generateInquiryNumber } from '@/lib/inquiries/schema'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    await ensureInquiriesSchema()

    const body = await req.json().catch(() => null)
    const name = String(body?.name ?? '').trim()
    const email = String(body?.email ?? '').trim()
    const phone = String(body?.phone ?? '').trim()
    const organization = String(body?.organization ?? '').trim()
    const category = String(body?.category ?? 'general_inquiry').trim() || 'general_inquiry'
    const priority = String(body?.priority ?? 'normal').trim() || 'normal'
    const subject = String(body?.subject ?? '').trim()
    const message = String(body?.message ?? '').trim()

    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { success: false, message: 'Please fill in all required fields.' },
        { status: 400 }
      )
    }

    // Optionally link authenticated user
    let userId: string | null = null
    try {
      const token = readSessionTokenFromRequest(req)
      if (token) {
        const claims = await verifySessionToken(token)
        if (claims?.sub) userId = String(claims.sub)
      }
    } catch {
      userId = null
    }

    const inquiryNumber = await generateInquiryNumber()

    const insertRes = await query<{ id: string; inquiry_number: string }>(
      `
      INSERT INTO public.inquiries (
        inquiry_number, user_id, sender_name, sender_email, sender_phone,
        organization, category, priority, subject, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', now(), now())
      RETURNING id, inquiry_number
      `,
      [
        inquiryNumber,
        userId,
        name,
        email,
        phone || null,
        organization || null,
        category,
        priority,
        subject,
      ]
    )

    const inquiryId = insertRes.rows[0]?.id
    if (!inquiryId) {
      throw new Error('Failed to create inquiry record')
    }

    await query(
      `
      INSERT INTO public.inquiry_messages (
        inquiry_id, sender_type, sender_user_id, sender_name, sender_role, message, is_internal_note, created_at
      ) VALUES ($1, 'citizen', $2, $3, 'applicant', $4, false, now())
      `,
      [inquiryId, userId, name, message]
    )

    return NextResponse.json({
      success: true,
      inquiryId,
      inquiryNumber,
      message: `Your inquiry (${inquiryNumber}) has been received by Rwanda Water Resources Board.`,
    })
  } catch (error) {
    console.error('❌ Contact inquiry error:', error)
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to send message. Please try again or email info@rwb.rw directly.',
      },
      { status: 500 }
    )
  }
}
