import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/role-delegations/[id] - Get a specific delegation
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's role
    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const { data: delegation, error } = await supabase
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
      .eq('id', id)
      .single()

    if (error || !delegation) {
      return NextResponse.json(
        { success: false, message: 'Delegation not found' },
        { status: 404 }
      )
    }

    // Check authorization: only admin or involved parties can view
    if (currentUser?.role !== 'admin' && 
        delegation.delegator_id !== user.id && 
        delegation.delegate_id !== user.id) {
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
    const { action, reason } = body as { action: string; reason?: string }

    if (action !== 'revoke') {
      return NextResponse.json(
        { success: false, message: 'Invalid action. Only "revoke" is supported.' },
        { status: 400 }
      )
    }

    // Get user's role
    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    // Get the delegation
    const { data: delegation, error: fetchError } = await supabase
      .from('role_delegations')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !delegation) {
      return NextResponse.json(
        { success: false, message: 'Delegation not found' },
        { status: 404 }
      )
    }

    // Check authorization: only delegator or admin can revoke
    if (currentUser?.role !== 'admin' && delegation.delegator_id !== user.id) {
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
    const { data: updatedDelegation, error: updateError } = await supabase
      .from('role_delegations')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: user.id,
        revocation_reason: reason || null,
      })
      .eq('id', id)
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
      .single()

    if (updateError) {
      console.error('❌ Error revoking delegation:', updateError)
      return NextResponse.json(
        { success: false, message: `Failed to revoke delegation: ${updateError.message}` },
        { status: 500 }
      )
    }

    // Create audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'role_delegation.revoked',
      entity_type: 'user',
      table_name: 'role_delegations',
      record_id: id,
      old_values: { status: 'active' },
      new_values: { 
        status: 'revoked',
        revoked_at: updatedDelegation.revoked_at,
        revocation_reason: reason || null,
      },
      description: `Role delegation revoked${reason ? `: ${reason}` : ''}`,
      severity: 'warning',
      status: 'success',
    })

    console.log('✅ Role delegation revoked successfully:', id)

    return NextResponse.json({
      success: true,
      message: 'Delegation revoked successfully',
      data: updatedDelegation,
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
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's role
    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    // Get the delegation
    const { data: delegation, error: fetchError } = await supabase
      .from('role_delegations')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !delegation) {
      return NextResponse.json(
        { success: false, message: 'Delegation not found' },
        { status: 404 }
      )
    }

    const now = new Date()
    const startDate = new Date(delegation.start_date)
    const canDeleteBeforeStart = delegation.delegator_id === user.id && startDate > now

    // Check authorization: admin can delete any, delegator can delete before start
    if (currentUser?.role !== 'admin' && !canDeleteBeforeStart) {
      return NextResponse.json(
        { success: false, message: 'Not authorized to delete this delegation. Only admin can delete active delegations, or delegator can delete before start date.' },
        { status: 403 }
      )
    }

    // Delete the delegation
    const { error: deleteError } = await supabase
      .from('role_delegations')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('❌ Error deleting delegation:', deleteError)
      return NextResponse.json(
        { success: false, message: `Failed to delete delegation: ${deleteError.message}` },
        { status: 500 }
      )
    }

    // Create audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'role_delegation.deleted',
      entity_type: 'user',
      table_name: 'role_delegations',
      record_id: id,
      old_values: delegation,
      description: `Role delegation deleted`,
      severity: 'warning',
      status: 'success',
    })

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
