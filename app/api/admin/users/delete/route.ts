import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { requireRole } from '@/lib/auth/require-role'

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

export async function POST(req: NextRequest) {
  try {
    // This endpoint destroys accounts. `middleware.ts` already gates
    // /api/admin/*, but a matcher change or a route move would silently drop
    // that; assert the requirement here too.
    const auth = await requireRole(req, ['admin'])
    if (!auth.ok) return auth.response

    const body = await req.json().catch(() => null)
    const userId = String(body?.userId || '').trim()

    if (!userId || !isUuid(userId)) {
      return NextResponse.json({ success: false, message: 'Invalid userId' }, { status: 400 })
    }

    // Deleting your own account leaves the caller in a broken session and can
    // orphan the last admin.
    if (userId === auth.userId) {
      return NextResponse.json(
        { success: false, message: 'You cannot delete your own account.' },
        { status: 400 }
      )
    }

    // Fetch profile for context + email-based cleanup
    const profileRes = await query<{ id: string; email: string | null }>(
      `select id, email from public.users where id = $1 limit 1`,
      [userId]
    )
    const profile = profileRes.rows[0]

    const email = (profile?.email ? String(profile.email) : '').trim()

    // Best-effort app-level cleanup
    if (email) {
      // Email verification codes table (if present)
      try {
        await query(`delete from public.email_verification_codes where lower(email) = lower($1)`, [email])
      } catch {
        // ignore
      }
    }

    // Delete profile row (FK cascades / SET NULL will take care of dependents if configured)
    try {
      await query(`delete from public.users where id = $1`, [userId])
    } catch (deleteProfileErr: any) {
      return NextResponse.json(
        {
          success: false,
          message:
            `Failed to delete public.users row: ${deleteProfileErr?.message}. ` +
            `If this is a FK constraint, you may need to delete dependent rows first.`,
          details: deleteProfileErr?.details,
          code: deleteProfileErr?.code,
        },
        { status: 409 }
      )
    }

    // Log the user deletion action
    try {
      await query(
        `
        insert into public.audit_logs (
          action, entity_type, table_name, record_id, user_id, old_values, description, severity, status, request_id, created_at
        ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, now())
        `,
        [
          'user.deleted',
          'user',
          'users',
          userId,
          auth.userId,
          JSON.stringify({ email: email || null }),
          `Deleted user account ${email || userId} (by ${auth.email})`,
          'critical',
          'success',
          crypto.randomUUID(),
        ]
      )
      console.log('📝 Audit log created for user deletion')
    } catch (auditErr) {
      console.warn('⚠️ Failed to create audit log:', auditErr)
    }

    return NextResponse.json({ success: true, userId, email: email || null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, message: msg || 'Server error' }, { status: 500 })
  }
}




