import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'
import { SITE_CONTENT_DEFAULTS, mergeSiteContent } from '@/lib/site-content'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const name = String(body?.name ?? '').trim()
    const email = String(body?.email ?? '').trim()
    const phone = String(body?.phone ?? '').trim()
    const organization = String(body?.organization ?? '').trim()
    const category = String(body?.category ?? '').trim()
    const priority = String(body?.priority ?? 'normal').trim()
    const subject = String(body?.subject ?? '').trim()
    const message = String(body?.message ?? '').trim()

    if (!name || !email || !category || !subject || !message) {
      return NextResponse.json(
        { success: false, message: 'Please fill in all required fields.' },
        { status: 400 }
      )
    }

    // Resolve recipient email from Admin Website Content (`site_content.office.email`), defaulting to info@rwb.rw
    let recipientEmail = process.env.CONTACT_EMAIL || SITE_CONTENT_DEFAULTS.office.email
    try {
      const res = await query<{ key: string; value: unknown }>(
        `select key, value from public.site_content where key = 'office' limit 1`
      )
      if (res.rows.length > 0) {
        const merged = mergeSiteContent(res.rows)
        if (merged.office?.email) {
          recipientEmail = merged.office.email
        }
      }
    } catch {
      // Fallback to default if site_content table is unavailable
    }

    const emailBody = [
      `New inquiry submitted via Rwanda Water Permit System:`,
      ``,
      `From: ${name} <${email}>`,
      phone ? `Phone: ${phone}` : null,
      organization ? `Organization: ${organization}` : null,
      `Category: ${category}`,
      `Priority: ${priority.toUpperCase()}`,
      `Subject: ${subject}`,
      ``,
      `Message:`,
      message,
    ]
      .filter((line): line is string => line !== null)
      .join('\n')

    await sendSmtpEmail({
      to: recipientEmail,
      subject: `[RWB Inquiry - ${priority.toUpperCase()}] ${subject}`,
      title: 'New Contact Inquiry',
      text: emailBody,
    })

    return NextResponse.json({
      success: true,
      recipient: recipientEmail,
      message: 'Your inquiry has been sent to Rwanda Water Resources Board.',
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
