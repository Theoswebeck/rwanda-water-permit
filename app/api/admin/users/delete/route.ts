import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

export async function POST(req: NextRequest) {
  // NOTE: This endpoint is powerful (service role). In production it must be protected by admin auth.
  // The admin UI is currently intentionally unprotected for testing; keep this dev-focused.
  try {
    const body = await req.json().catch(() => null)
    const userId = String(body?.userId || '').trim()

    if (!userId || !isUuid(userId)) {
      return NextResponse.json({ success: false, message: 'Invalid userId' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json(
        { success: false, message: 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is missing' },
        { status: 500 }
      )
    }

    const supabase = createClient(url, serviceKey)

    // Fetch profile for context + email-based cleanup
    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .select('id,email')
      .eq('id', userId)
      .maybeSingle()

    if (profileErr) {
      return NextResponse.json(
        { success: false, message: `Failed to look up user profile: ${profileErr.message}` },
        { status: 500 }
      )
    }

    const email = (profile?.email ? String(profile.email) : '').trim()

    // Best-effort app-level cleanup
    if (email) {
      // Email verification codes table (if present)
      try {
        // If table doesn't exist, PostgREST returns 404 - ignore.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const res = await supabase.from('email_verification_codes').delete().ilike('email', email)
      } catch {
        // ignore
      }
    }

    // Delete profile row (FK cascades / SET NULL will take care of dependents if configured)
    const { error: deleteProfileErr } = await supabase.from('users').delete().eq('id', userId)
    if (deleteProfileErr) {
      return NextResponse.json(
        {
          success: false,
          message:
            `Failed to delete public.users row: ${deleteProfileErr.message}. ` +
            `If this is a FK constraint, you may need to delete dependent rows first.`,
          details: (deleteProfileErr as any)?.details,
          code: (deleteProfileErr as any)?.code,
        },
        { status: 409 }
      )
    }

    // Delete auth user (if present). If it's already gone, ignore.
    try {
      const { error: authDelErr } = await supabase.auth.admin.deleteUser(userId)
      if (authDelErr) {
        // Not fatal for app state if profile is gone; return warning details
        return NextResponse.json(
          {
            success: true,
            message: 'Deleted profile, but failed to delete auth user',
            userId,
            email: email || null,
            warning: authDelErr.message,
          },
          { status: 200 }
        )
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true, userId, email: email || null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, message: msg || 'Server error' }, { status: 500 })
  }
}




