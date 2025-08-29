import { createClient } from './supabase/client'

export const debugAuth = async () => {
  const supabase = createClient()
  
  try {
    // Test 1: Check current auth user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('🔍 Current auth user:', user?.email || 'None')
    
    if (user) {
      // Test 2: Check if profile exists
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()
      
      if (profileError) {
        console.log('❌ Profile error:', profileError.code, profileError.message)
        
        if (profileError.code === 'PGRST116') {
          console.log('📝 No profile found - this is the issue!')
        }
      } else {
        console.log('✅ Profile found:', profile.email, profile.role, profile.status)
      }
    }
    
    // Test 3: Check users table structure
    const { data: sampleUsers, error: usersError } = await supabase
      .from('users')
      .select('id, email, role, status')
      .limit(1)
    
    if (usersError) {
      console.log('❌ Users table error:', usersError.message)
    } else {
      console.log('✅ Users table accessible, sample count:', sampleUsers?.length || 0)
    }
    
  } catch (error) {
    console.error('❌ Debug error:', error)
  }
}

// Export for console testing
if (typeof window !== 'undefined') {
  (window as any).debugAuth = debugAuth
}
