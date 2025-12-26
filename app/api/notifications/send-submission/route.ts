import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthedClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { notifyOnApplicationSubmitted } from '@/lib/notifications/submission'

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const applicationId = body?.applicationId as string

    if (!isNonEmptyString(applicationId)) {
      return NextResponse.json({ success: false, message: 'Invalid request: applicationId is required' }, { status: 400 })
    }

    // Require auth to prevent abuse/spam
    const supabaseAuthed = await createAuthedClient()
    const {
      data: { user },
    } = await supabaseAuthed.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    // Only the applicant can trigger their own submission notification from the client.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json(
        { success: false, message: 'Server misconfiguration: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      )
    }

    const supabaseAdmin = createAdminClient(url, serviceKey)
    const { data: appRow, error: appErr } = await supabaseAdmin
      .from('applications')
      .select('id, applicant_id')
      .eq('id', applicationId)
      .single()

    if (appErr || !appRow) {
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 })
    }

    if (appRow.applicant_id !== user.id) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })
    }

    const result = await notifyOnApplicationSubmitted(applicationId)
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: result.status })
  } catch (err) {
    console.error('❌ send-submission error', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}




