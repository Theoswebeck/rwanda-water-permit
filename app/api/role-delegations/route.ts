import { NextRequest, NextResponse } from 'next/server'
import type { DelegatableRole } from '@/types/database'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

async function getCurrentUserId(request: NextRequest): Promise<string | null> {
  const token = readSessionTokenFromRequest(request)
  const claims = token ? await verifySessionToken(token) : null
  return claims?.sub || null
}

// GET /api/role-delegations - Get all role delegations
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId(request)
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

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

    // First, expire any ended delegations
    const now = new Date().toISOString()
    await query(
      `
      update public.role_delegations
      set status = 'expired', updated_at = now()
      where status = 'active'
        and end_date is not null
        and end_date < $1
      `,
      [now]
    ).catch(() => undefined)

    // Parse query params for filtering
    const searchParams = request.nextUrl.searchParams
    const filterType = searchParams.get('filter') // 'all', 'my', 'active'
    const statusFilter = searchParams.get('status') // 'active', 'revoked', 'expired'

    const values: unknown[] = []
    const where: string[] = []
    const nextParam = (value: unknown) => {
      values.push(value)
      return `$${values.length}`
    }

    if (currentUser.role !== 'admin' || filterType === 'my') {
      const p = nextParam(userId)
      where.push(`(rd.delegator_id = ${p} or rd.delegate_id = ${p})`)
    }
    if (statusFilter && statusFilter !== 'all') {
      const p = nextParam(statusFilter)
      where.push(`rd.status = ${p}`)
    }
    if (filterType === 'active') {
      const p = nextParam(now)
      where.push(`rd.status = 'active' and rd.start_date <= ${p} and (rd.end_date is null or rd.end_date > ${p})`)
    }

    const rows = await query(
      `
      select
        rd.*,
        row_to_json(dg) as delegator,
        row_to_json(dd) as delegate,
        row_to_json(rv) as revoker
      from public.role_delegations rd
      left join lateral (
        select id, email, first_name, last_name, role
        from public.users
        where id = rd.delegator_id
        limit 1
      ) dg on true
      left join lateral (
        select id, email, first_name, last_name, role
        from public.users
        where id = rd.delegate_id
        limit 1
      ) dd on true
      left join lateral (
        select id, email, first_name, last_name
        from public.users
        where id = rd.revoked_by
        limit 1
      ) rv on true
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by rd.created_at desc nulls last
      `,
      values
    )

    return NextResponse.json({
      success: true,
      data: rows.rows || [],
    })
  } catch (error) {
    console.error('❌ Unexpected error in GET /api/role-delegations:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/role-delegations - Create a new role delegation
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId(request)
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { 
      delegate_id, 
      delegated_role, 
      reason, 
      start_date, 
      end_date 
    } = body as {
      delegate_id: string
      delegated_role: DelegatableRole
      reason?: string
      start_date?: string
      end_date?: string | null
    }

    // Validate required fields
    if (!delegate_id || !delegated_role) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: delegate_id and delegated_role' },
        { status: 400 }
      )
    }

    // Validate delegated_role
    const validRoles: DelegatableRole[] = ['reviewer', 'verifier', 'approver', 'assessor', 'inspector']
    if (!validRoles.includes(delegated_role)) {
      return NextResponse.json(
        { success: false, message: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate delegate is not self
    if (delegate_id === userId) {
      return NextResponse.json(
        { success: false, message: 'You cannot delegate a role to yourself' },
        { status: 400 }
      )
    }

    // Get delegator's role
    const delegatorRes = await query<{ role: string }>(
      `select role from public.users where id = $1 limit 1`,
      [userId]
    )
    const delegator = delegatorRes.rows[0]
    if (!delegator) {
      return NextResponse.json(
        { success: false, message: 'Could not verify your user information' },
        { status: 404 }
      )
    }

    // Verify authorization: user can only delegate their own role (or admin can delegate any)
    if (delegator.role !== 'admin' && delegator.role !== delegated_role) {
      return NextResponse.json(
        { success: false, message: `You can only delegate your own role (${delegator.role})` },
        { status: 403 }
      )
    }

    // Verify delegate exists and is active staff
    const delegateRes = await query<{ id: string; status: string; role: string }>(
      `
      select id, status, role
      from public.users
      where id = $1
      limit 1
      `,
      [delegate_id]
    )
    const delegate = delegateRes.rows[0]
    if (!delegate) {
      return NextResponse.json(
        { success: false, message: 'Selected delegate user not found' },
        { status: 404 }
      )
    }

    if (delegate.status !== 'active') {
      return NextResponse.json(
        { success: false, message: 'Cannot delegate to an inactive user' },
        { status: 400 }
      )
    }

    // Verify delegate is staff (not applicant)
    const staffRoles = ['reviewer', 'verifier', 'approver', 'assessor', 'inspector', 'admin']
    if (!staffRoles.includes(delegate.role)) {
      return NextResponse.json(
        { success: false, message: 'Delegate must be a staff member' },
        { status: 400 }
      )
    }

    // Check for existing active delegation for this role from this user
    const existingRes = await query<{ id: string }>(
      `
      select id
      from public.role_delegations
      where delegator_id = $1
        and delegated_role = $2
        and status = 'active'
      limit 1
      `,
      [userId, delegated_role]
    )
    const existingDelegation = existingRes.rows[0]

    if (existingDelegation) {
      return NextResponse.json(
        { success: false, message: `You already have an active delegation for the ${delegated_role} role. Please revoke it first.` },
        { status: 409 }
      )
    }

    // Validate dates
    const startDateTime = start_date ? new Date(start_date) : new Date()
    const endDateTime = end_date ? new Date(end_date) : null

    if (endDateTime && endDateTime <= startDateTime) {
      return NextResponse.json(
        { success: false, message: 'End date must be after start date' },
        { status: 400 }
      )
    }

    // Create the delegation
    const inserted = await query(
      `
      insert into public.role_delegations (
        delegator_id,
        delegate_id,
        delegated_role,
        reason,
        start_date,
        end_date,
        status,
        created_at,
        updated_at
      ) values ($1,$2,$3,$4,$5,$6,'active',now(),now())
      returning *
      `,
      [
        userId,
        delegate_id,
        delegated_role,
        reason || null,
        startDateTime.toISOString(),
        endDateTime?.toISOString() || null,
      ]
    )
    const delegation = inserted.rows[0]
    if (!delegation) {
      return NextResponse.json(
        { success: false, message: 'Failed to create delegation' },
        { status: 500 }
      )
    }
    const [delegatorUser, delegateUser] = await Promise.all([
      query(`select id, email, first_name, last_name, role from public.users where id = $1 limit 1`, [delegation.delegator_id]),
      query(`select id, email, first_name, last_name, role from public.users where id = $1 limit 1`, [delegation.delegate_id]),
    ])
    const delegationOut = {
      ...delegation,
      delegator: delegatorUser.rows[0] || null,
      delegate: delegateUser.rows[0] || null,
    }

    // Create audit log
    await query(
      `
      insert into public.audit_logs (
        user_id, action, entity_type, table_name, record_id, new_values, description, severity, status, created_at
      ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,now())
      `,
      [
        userId,
        'role_delegation.created',
        'user',
        'role_delegations',
        delegation.id,
        JSON.stringify({
          delegate_id,
          delegated_role,
          reason,
          start_date: startDateTime.toISOString(),
          end_date: endDateTime?.toISOString() || null,
        }),
        `Role ${delegated_role} delegated to user`,
        'warning',
        'success',
      ]
    ).catch(() => undefined)

    console.log('✅ Role delegation created successfully:', delegation.id)

    return NextResponse.json({
      success: true,
      message: 'Delegation created successfully',
      data: delegationOut,
    }, { status: 201 })

  } catch (error) {
    console.error('❌ Unexpected error in POST /api/role-delegations:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
