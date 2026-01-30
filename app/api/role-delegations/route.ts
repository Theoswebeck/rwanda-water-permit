import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { DelegatableRole } from '@/types/database'

// GET /api/role-delegations - Get all role delegations
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's role to check permissions
    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userError || !currentUser) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      )
    }

    // First, expire any ended delegations
    const now = new Date().toISOString()
    await supabase
      .from('role_delegations')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .not('end_date', 'is', null)
      .lt('end_date', now)

    // Parse query params for filtering
    const searchParams = request.nextUrl.searchParams
    const filterType = searchParams.get('filter') // 'all', 'my', 'active'
    const statusFilter = searchParams.get('status') // 'active', 'revoked', 'expired'

    let query = supabase
      .from('role_delegations')
      .select(`
        *,
        delegator:users!delegator_id(
          id,
          email,
          first_name,
          last_name,
          role
        ),
        delegate:users!delegate_id(
          id,
          email,
          first_name,
          last_name,
          role
        ),
        revoker:users!revoked_by(
          id,
          email,
          first_name,
          last_name
        )
      `)
      .order('created_at', { ascending: false })

    // Apply filters based on user role
    if (currentUser.role !== 'admin') {
      // Non-admins can only see delegations they're involved in
      query = query.or(`delegator_id.eq.${user.id},delegate_id.eq.${user.id}`)
    } else if (filterType === 'my') {
      query = query.or(`delegator_id.eq.${user.id},delegate_id.eq.${user.id}`)
    }

    // Apply status filter
    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    // Apply active filter (only currently active delegations)
    if (filterType === 'active') {
      query = query
        .eq('status', 'active')
        .lte('start_date', now)
        .or(`end_date.is.null,end_date.gt.${now}`)
    }

    const { data, error } = await query

    if (error) {
      console.error('❌ Error fetching role delegations:', error)
      return NextResponse.json(
        { success: false, message: 'Failed to fetch delegations' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
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
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
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
    if (delegate_id === user.id) {
      return NextResponse.json(
        { success: false, message: 'You cannot delegate a role to yourself' },
        { status: 400 }
      )
    }

    // Get delegator's role
    const { data: delegator, error: delegatorError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (delegatorError || !delegator) {
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
    const { data: delegate, error: delegateError } = await supabase
      .from('users')
      .select('id, status, role')
      .eq('id', delegate_id)
      .single()

    if (delegateError || !delegate) {
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
    const { data: existingDelegation } = await supabase
      .from('role_delegations')
      .select('id')
      .eq('delegator_id', user.id)
      .eq('delegated_role', delegated_role)
      .eq('status', 'active')
      .single()

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
    const { data: delegation, error: createError } = await supabase
      .from('role_delegations')
      .insert([{
        delegator_id: user.id,
        delegate_id,
        delegated_role,
        reason: reason || null,
        start_date: startDateTime.toISOString(),
        end_date: endDateTime?.toISOString() || null,
        status: 'active',
      }])
      .select(`
        *,
        delegator:users!delegator_id(
          id,
          email,
          first_name,
          last_name,
          role
        ),
        delegate:users!delegate_id(
          id,
          email,
          first_name,
          last_name,
          role
        )
      `)
      .single()

    if (createError) {
      console.error('❌ Error creating delegation:', createError)
      return NextResponse.json(
        { success: false, message: `Failed to create delegation: ${createError.message}` },
        { status: 500 }
      )
    }

    // Create audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'role_delegation.created',
      entity_type: 'user',
      table_name: 'role_delegations',
      record_id: delegation.id,
      new_values: {
        delegate_id,
        delegated_role,
        reason,
        start_date: startDateTime.toISOString(),
        end_date: endDateTime?.toISOString() || null,
      },
      description: `Role ${delegated_role} delegated to user`,
      severity: 'warning',
      status: 'success',
    })

    console.log('✅ Role delegation created successfully:', delegation.id)

    return NextResponse.json({
      success: true,
      message: 'Delegation created successfully',
      data: delegation,
    }, { status: 201 })

  } catch (error) {
    console.error('❌ Unexpected error in POST /api/role-delegations:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
