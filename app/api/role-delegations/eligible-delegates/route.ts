import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/role-delegations/eligible-delegates - Get staff users eligible to receive delegations
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

    // Verify user is staff
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

    const staffRoles = ['reviewer', 'verifier', 'approver', 'assessor', 'inspector', 'admin']
    if (!staffRoles.includes(currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Only staff members can access this endpoint' },
        { status: 403 }
      )
    }

    // Get all active staff users except the current user
    const { data: eligibleDelegates, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, role')
      .in('role', staffRoles)
      .eq('status', 'active')
      .neq('id', user.id)
      .order('first_name', { ascending: true })

    if (error) {
      console.error('❌ Error fetching eligible delegates:', error)
      return NextResponse.json(
        { success: false, message: 'Failed to fetch eligible delegates' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: eligibleDelegates || [],
    })
  } catch (error) {
    console.error('❌ Unexpected error in GET /api/role-delegations/eligible-delegates:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
