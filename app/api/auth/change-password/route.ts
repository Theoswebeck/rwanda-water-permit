import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

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

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    // Prefer cookie-based auth (no client-sent token needed).
    // We still support Bearer token auth as a fallback for older clients.
    let supabaseResponse = NextResponse.next({ request: { headers: req.headers } })
    const supabaseAuth = createServerClient<Database>(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return req.cookies.get(name)?.value
          },
          set(name: string, value: string, options: object) {
            supabaseResponse = NextResponse.next({ request: { headers: req.headers } })
            supabaseResponse.cookies.set({ name, value, ...options })
          },
          remove(name: string, options: object) {
            supabaseResponse = NextResponse.next({ request: { headers: req.headers } })
            supabaseResponse.cookies.set({ name, value: '', ...options })
          },
        },
      }
    )

    // ✅ Verified user (recommended by Supabase)
    let user = (await supabaseAuth.auth.getUser()).data.user

    // Fallback: Bearer token (backward compatibility)
    if (!user) {
      const authHeader = req.headers.get('authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const tmp = createClient(url, serviceKey)
        user = (await tmp.auth.getUser(token)).data.user
      }
    }
    
    if (!user) {
      return NextResponse.json({
        success: false, 
        message: 'Authentication required' 
      }, { status: 401 })
    }

    const supabaseAdmin = createClient(url, serviceKey)

    // Since user is already authenticated, directly update password using admin API
    // Also clear the must_change_password flag in user_metadata
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { 
        password: newPassword,
        user_metadata: {
          ...user.user_metadata,
          must_change_password: false
        }
      }
    )

    if (updateError) {
      console.error('Password update error:', updateError)
      return NextResponse.json({ 
        success: false, 
        message: 'Failed to update password' 
      }, { status: 500 })
    }

    // Update public.users to mark account as confirmed and clear must_change_password flag
    const { error: profileUpdateError } = await supabaseAdmin
      .from('users')
      .update({
        must_change_password: false,
        account_confirmed: true,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (profileUpdateError) {
      // Log but don't fail - password was already updated successfully
      console.warn('⚠️ Failed to update user profile flags:', profileUpdateError)
    } else {
      console.log('✅ User profile flags updated (must_change_password=false, account_confirmed=true)')
    }

    const res = NextResponse.json({ 
      success: true, 
      message: 'Password updated successfully' 
    })

    // Propagate any auth cookies that were refreshed.
    supabaseResponse.cookies.getAll().forEach(cookie => res.cookies.set(cookie))
    return res

  } catch (err) {
    console.error('Change password server error:', err)
    return NextResponse.json({ 
      success: false, 
      message: 'Server error' 
    }, { status: 500 })
  }
}
