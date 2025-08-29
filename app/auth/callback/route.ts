import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (!error && data.user) {
        // Check if user profile exists and is active
        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single()

        if (profileError || !userProfile) {
          console.error('❌ User profile not found:', profileError)
          return NextResponse.redirect(`${origin}/login?error=profile_not_found`)
        }

        // Check user status
        if (userProfile.status === 'suspended') {
          console.warn('🚫 Suspended user attempted OAuth login:', data.user.email)
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/login?error=suspended`)
        }

        if (userProfile.status === 'inactive') {
          console.warn('⚠️ Inactive user attempted OAuth login:', data.user.email)
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/login?error=inactive`)
        }

        // Update last login timestamp
        await supabase
          .from('users')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', data.user.id)

        console.log('✅ OAuth authentication successful for:', data.user.email)
        
        // Redirect based on user role
        let redirectPath = next
        switch (userProfile.role) {
          case 'admin':
            redirectPath = '/admin'
            break
          case 'approver':
            redirectPath = '/approver'
            break
          case 'inspector':
            redirectPath = '/inspection'
            break
          case 'reviewer':
            redirectPath = '/review'
            break
          case 'applicant':
          default:
            redirectPath = '/dashboard'
            break
        }

        return NextResponse.redirect(`${origin}${redirectPath}`)
      }
    } catch (error) {
      console.error('❌ OAuth callback error:', error)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
