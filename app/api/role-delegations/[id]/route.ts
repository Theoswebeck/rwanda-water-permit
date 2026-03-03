import { NextRequest, NextResponse } from 'next/server'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

interface RouteParams {
  params: Promise<{ id: string }>
}

async function authUserId(request: NextRequest): Promise<string | null> {
  const token = readSessionTokenFromRequest(request)
  const claims = token ? await verifySessionToken(token) : null
  return claims?.sub || null
}

// GET /api/role-delegations/[id] - Get a specific delegation
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const userId = await authUserId(request)
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's role
    const currentUserRes = await query<{ role: string }>(
      `select role from public.users where id = $1 limit 1`,
      [userId]
    )
    const currentUser = currentUserRes.rows[0]

    const delegationRes = await query(
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
      where rd.id = $1
      limit 1
      `,
      [id]
    )
    const delegation = delegationRes.rows[0] as Record<string, unknown> | undefined

    if (!delegation) {
      return NextResponse.json(
        { success: false, message: 'Delegation not found' },
        { status: 404 }
      )
    }

    // Check authorization: only admin or involved parties can view
    if (currentUser?.role !== 'admin' && 
        delegation.delegator_id !== userId && 
        delegation.delegate_id !== userId) {
      return NextResponse.json(
        { success: false, message: 'Not authorized to view this delegation' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      data: delegation,
    })
  } catch (error) {
    console.error('❌ Unexpected error in GET /api/role-delegations/[id]:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/role-delegations/[id] - Revoke a delegation
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const userId = await authUserId(request)
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { action, reason } = body as { action: string; reason?: string }

    if (action !== 'revoke') {
      return NextResponse.json(
        { success: false, message: 'Invalid action. Only "revoke" is supported.' },
        { status: 400 }
      )
    }

    // Get user's role
    const currentUserRes = await query<{ role: string }>(
      `select role from public.users where id = $1 limit 1`,
      [userId]
    )
    const currentUser = currentUserRes.rows[0]

    // Get the delegation
    const delegationRes = await query(
      `select * from public.role_delegations where id = $1 limit 1`,
      [id]
    )
    const delegation = delegationRes.rows[0] as Record<string, unknown> | undefined
    if (!delegation) {
      return NextResponse.json(
        { success: false, message: 'Delegation not found' },
        { status: 404 }
      )
    }

    // Check authorization: only delegator or admin can revoke
    if (currentUser?.role !== 'admin' && delegation.delegator_id !== userId) {
      return NextResponse.json(
        { success: false, message: 'Not authorized to revoke this delegation' },
        { status: 403 }
      )
    }

    // Check if already revoked
    if (delegation.status === 'revoked') {
      return NextResponse.json(
        { success: false, message: 'This delegation is already revoked' },
        { status: 400 }
      )
    }

    if (delegation.status === 'expired') {
      return NextResponse.json(
        { success: false, message: 'This delegation has expired' },
        { status: 400 }
      )
    }

    // Revoke the delegation
    const updateRes = await query(
      `
      update public.role_delegations
      set
        status = 'revoked',
        revoked_at = now(),
        revoked_by = $2,
        revocation_reason = $3,
        updated_at = now()
      where id = $1
      returning *
      `,
      [id, userId, reason || null]
    )
    const updatedDelegation = updateRes.rows[0] as Record<string, unknown> | undefined
    if (!updatedDelegation) {
      return NextResponse.json(
        { success: false, message: 'Failed to revoke delegation' },
        { status: 500 }
      )
    }
    const [delegatorUser, delegateUser, revokerUser] = await Promise.all([
      query(`select id, email, first_name, last_name, role from public.users where id = $1 limit 1`, [updatedDelegation.delegator_id]),
      query(`select id, email, first_name, last_name, role from public.users where id = $1 limit 1`, [updatedDelegation.delegate_id]),
      updatedDelegation.revoked_by
        ? query(`select id, email, first_name, last_name from public.users where id = $1 limit 1`, [updatedDelegation.revoked_by])
        : Promise.resolve({ rows: [] }),
    ])
    const updatedOut = {
      ...updatedDelegation,
      delegator: delegatorUser.rows[0] || null,
      delegate: delegateUser.rows[0] || null,
      revoker: revokerUser.rows[0] || null,
    }

    // Create audit log
    await query(
      `
      insert into public.audit_logs (
        user_id, action, entity_type, table_name, record_id, old_values, new_values, description, severity, status, created_at
      ) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,now())
      `,
      [
        userId,
        'role_delegation.revoked',
        'user',
        'role_delegations',
        id,
        JSON.stringify({ status: 'active' }),
        JSON.stringify({
          status: 'revoked',
          revoked_at: updatedDelegation.revoked_at,
          revocation_reason: reason || null,
        }),
        `Role delegation revoked${reason ? `: ${reason}` : ''}`,
        'warning',
        'success',
      ]
    ).catch(() => undefined)

    console.log('✅ Role delegation revoked successfully:', id)

    return NextResponse.json({
      success: true,
      message: 'Delegation revoked successfully',
      data: updatedOut,
    })

  } catch (error) {
    console.error('❌ Unexpected error in PATCH /api/role-delegations/[id]:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/role-delegations/[id] - Delete a delegation (admin only, or delegator before start)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const userId = await authUserId(request)
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's role
    const currentUserRes = await query<{ role: string }>(
      `select role from public.users where id = $1 limit 1`,
      [userId]
    )
    const currentUser = currentUserRes.rows[0]

    // Get the delegation
    const delegationRes = await query(
      `select * from public.role_delegations where id = $1 limit 1`,
      [id]
    )
    const delegation = delegationRes.rows[0] as Record<string, unknown> | undefined
    if (!delegation) {
      return NextResponse.json(
        { success: false, message: 'Delegation not found' },
        { status: 404 }
      )
    }

    const now = new Date()
    const startDate = new Date(delegation.start_date)
    const canDeleteBeforeStart = delegation.delegator_id === userId && startDate > now

    // Check authorization: admin can delete any, delegator can delete before start
    if (currentUser?.role !== 'admin' && !canDeleteBeforeStart) {
      return NextResponse.json(
        { success: false, message: 'Not authorized to delete this delegation. Only admin can delete active delegations, or delegator can delete before start date.' },
        { status: 403 }
      )
    }

    // Delete the delegation
    const deleteRes = await query(
      `delete from public.role_delegations where id = $1`,
      [id]
    )

    if (!deleteRes.rowCount) {
      console.error('❌ Error deleting delegation: not deleted')
      return NextResponse.json(
        { success: false, message: 'Failed to delete delegation' },
        { status: 500 }
      )
    }

    // Create audit log
    await query(
      `
      insert into public.audit_logs (
        user_id, action, entity_type, table_name, record_id, old_values, description, severity, status, created_at
      ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,now())
      `,
      [
        userId,
        'role_delegation.deleted',
        'user',
        'role_delegations',
        id,
        JSON.stringify(delegation),
        'Role delegation deleted',
        'warning',
        'success',
      ]
    ).catch(() => undefined)

    console.log('✅ Role delegation deleted successfully:', id)

    return NextResponse.json({
      success: true,
      message: 'Delegation deleted successfully',
    })

  } catch (error) {
    console.error('❌ Unexpected error in DELETE /api/role-delegations/[id]:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
