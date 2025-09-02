import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { newPassword } = await req.json()
    
    if (!newPassword) {
      return NextResponse.json({ 
        success: false, 
        message: 'New password is required' 
      }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ 
        success: false, 
        message: 'New password must be at least 6 characters long' 
      }, { status: 400 })
    }

    // Get the user's session token from the Authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ 
        success: false, 
        message: 'Authentication required' 
      }, { status: 401 })
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix
    
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(url, serviceKey)

    // Get user from the service role client using the token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    
    if (userError || !user) {
      return NextResponse.json({ 
        success: false, 
        message: 'Invalid session' 
      }, { status: 401 })
    }

    // Since user is already authenticated, directly update password using admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    )

    if (updateError) {
      console.error('Password update error:', updateError)
      return NextResponse.json({ 
        success: false, 
        message: 'Failed to update password' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Password updated successfully' 
    })

  } catch (err) {
    console.error('Change password server error:', err)
    return NextResponse.json({ 
      success: false, 
      message: 'Server error' 
    }, { status: 500 })
  }
}
