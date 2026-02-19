import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, getSupabaseServerAuth } from '../_utils'

const isMissingTransferRequestsTable = (err: unknown): boolean => {
  const code = (err as { code?: unknown } | null)?.code
  const message = String((err as { message?: unknown } | null)?.message || '')
  return (
    code === '42P01' ||
    message.includes('relation "public.transfer_requests" does not exist') ||
    message.includes('relation "transfer_requests" does not exist')
  )
}

const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const auth = getSupabaseServerAuth(req)
    if (!supabaseAdmin || !auth) {
      return NextResponse.json(
        { success: false, message: 'Server misconfiguration: missing Supabase env vars' },
        { status: 500 }
      )
    }

    const { supabaseAuth } = auth
    const user = (await supabaseAuth.auth.getUser()).data.user
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 })
    }

    const body = await req.json()
    const applicationId = body?.applicationId as string
    const oldPermitId = body?.oldPermitId as string

    if (!isNonEmpty(applicationId) || !isNonEmpty(oldPermitId)) {
      return NextResponse.json({ success: false, message: 'applicationId and oldPermitId are required' }, { status: 400 })
    }

    // Validate the current user is the transferee who approved this transfer request.
    const { data: tr, error: trErr } = await supabaseAdmin
      .from('transfer_requests')
      .select('id, status, approved_by_user_id, original_permit_id')
      .eq('application_id', applicationId)
      .single()

    if (trErr || !tr) {
      if (isMissingTransferRequestsTable(trErr)) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Permit transfer requests are not available yet (missing transfer_requests table). Please apply the transfer requests migration to your database.',
          },
          { status: 503 }
        )
      }
      return NextResponse.json({ success: false, message: 'Transfer request not found for application' }, { status: 404 })
    }
    if (tr.status !== 'approved' || tr.approved_by_user_id !== user.id) {
      return NextResponse.json({ success: false, message: 'Forbidden: transfer not approved by current user' }, { status: 403 })
    }
    if (tr.original_permit_id !== oldPermitId) {
      return NextResponse.json({ success: false, message: 'Invalid oldPermitId for this transfer' }, { status: 400 })
    }

    // Fetch application number for a clearer audit note.
    const { data: app, error: appErr } = await supabaseAdmin
      .from('applications')
      .select('id, application_number, application_type, status')
      .eq('id', applicationId)
      .single()
    if (appErr || !app) {
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 })
    }
    if (app.application_type !== 'transfer') {
      return NextResponse.json({ success: false, message: 'Not a transfer application' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const appNumber = app.application_number || app.id

    const { error: updErr } = await supabaseAdmin
      .from('permits')
      .update({
        status: 'revoked',
        transfer_reason: `Transferred via application ${appNumber}`,
        updated_at: now,
      })
      .eq('id', oldPermitId)

    if (updErr) {
      console.error('❌ Failed to revoke old permit:', updErr)
      return NextResponse.json({ success: false, message: 'Failed to revoke old permit' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('❌ transfers/revoke-old-permit error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

