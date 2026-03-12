import { NextRequest, NextResponse } from 'next/server'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

type PgErrorLike = {
  code?: string
}

function isRoleDelegateSchemaCompatibilityError(error: unknown): boolean {
  const pgError = error as PgErrorLike
  // 42703 => undefined_column, 22P02 => invalid_text_representation (enum mismatch), 42883 => undefined_function/operator
  return ['42703', '22P02', '42883'].includes(pgError?.code || '')
}

async function getUserId(request: NextRequest): Promise<string | null> {
  const token = readSessionTokenFromRequest(request)
  const claims = token ? await verifySessionToken(token) : null
  return claims?.sub || null
}

// GET /api/role-delegations/eligible-delegates - Get staff users eligible to receive delegations
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request)
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify user is staff
    const currentUserRes = await query<{ role: string }>(
      `
      select role
      from public.users
      where id = $1
      limit 1
      `,
      [userId]
    )
    const currentUser = currentUserRes.rows[0]
    if (!currentUser) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      )
    }

    const staffRoles = ['reviewer', 'verifier', 'approver', 'assessor', 'inspector', 'admin']
    if (!staffRoles.includes(currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Only staff members can access this endpoint' },
        { status: 403 }
      )
    }

    // Get all eligible staff users except the current user.
    // Compatibility fallback avoids 500s when prod schema drifts (e.g. status column/enum differences).
    let eligibleDelegates
    try {
      eligibleDelegates = await query(
        `
        select id, email, first_name, last_name, role
        from public.users
        where role::text = any($1::text[])
          and status::text = 'active'
          and id <> $2
        order by first_name asc nulls last, last_name asc nulls last
        `,
        [staffRoles, userId]
      )
    } catch (error) {
      if (!isRoleDelegateSchemaCompatibilityError(error)) {
        throw error
      }
      console.warn(
        '⚠️ Falling back to compatible delegate query without status filter:',
        error
      )
      eligibleDelegates = await query(
        `
        select id, email, first_name, last_name, role
        from public.users
        where role::text = any($1::text[])
          and id <> $2
        order by first_name asc nulls last, last_name asc nulls last
        `,
        [staffRoles, userId]
      )
    }

    return NextResponse.json({
      success: true,
      data: eligibleDelegates.rows || [],
    })
  } catch (error) {
    console.error('❌ Unexpected error in GET /api/role-delegations/eligible-delegates:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
