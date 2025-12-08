import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/middleware'
import type { User } from '@supabase/supabase-js'

export async function middleware(request: NextRequest) {
  let supabase, response;
  let user: User | null = null;
  
  try {
    const client = await createClient(request);
    supabase = client.supabase;
    response = client.response;
    user = client.user;
  } catch (error) {
    // If there's a fetch error (network issue), allow the request to continue
    console.warn('⚠️ Middleware auth check failed (network issue), allowing request:', error);
    return NextResponse.next();
  }

  // Define protected routes
  const protectedRoutes = [
    '/dashboard',
    '/apply', 
    // '/admin', // TEMPORARY: Disabled for testing
    // '/approver', // TEMPORARY: Disabled for testing
    // '/inspection', // TEMPORARY: Disabled for testing
    // '/inspector', // TEMPORARY: Disabled for testing
    // '/review', // TEMPORARY: Disabled for testing
    // '/assessment' // TEMPORARY: Disabled for testing
  ]

  // Define role-based route access
  const roleRoutes = {
    admin: ['/admin'],
    approver: ['/approver'],
    inspector: ['/inspection', '/inspector', '/assessment'],
    reviewer: ['/review', '/assessment'],
    applicant: ['/dashboard', '/apply']
  }

  const pathname = request.nextUrl.pathname

  // Check if the route is protected
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route)
  )

  // If it's a protected route and no user, redirect to login
  if (isProtectedRoute && !user) {
    console.log('🚫 Unauthorized access attempt to:', pathname)
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If user exists, check role-based access
  if (user && isProtectedRoute) {
    try {
      // Get user profile from metadata if available to avoid DB call
      // If metadata is missing (old users), fallback to DB
      let userRole = user.user_metadata?.role;
      let userStatus = user.user_metadata?.status;

      if (!userRole || !userStatus) {
        // Get user profile to check role and status
        const { data: data, error } = await supabase
          .from('users')
          .select('role, status, account_type')
          .eq('id', user.id)
          .single()

        const userProfile = data as any;

        if (error || !userProfile) {
          console.error('❌ Error fetching user profile in middleware:', error)
          return NextResponse.redirect(new URL('/login', request.url))
        }
        
        userRole = userProfile.role;
        userStatus = userProfile.status;
      }

      // Check if user is suspended or inactive
      if (userStatus === 'suspended') {
        console.warn('🚫 Suspended user attempted access:', user.email)
        // Clear session and redirect to login with error
        await supabase.auth.signOut()
        const redirectUrl = new URL('/login', request.url)
        redirectUrl.searchParams.set('error', 'suspended')
        return NextResponse.redirect(redirectUrl)
      }

      if (userStatus === 'inactive') {
        console.warn('⚠️ Inactive user attempted access:', user.email)
        await supabase.auth.signOut()
        const redirectUrl = new URL('/login', request.url)
        redirectUrl.searchParams.set('error', 'inactive')
        return NextResponse.redirect(redirectUrl)
      }

      // Check role-based access
      let hasAccess = false

      // Check if user's role has access to this route
      for (const [role, routes] of Object.entries(roleRoutes)) {
        if (userRole === role) {
          hasAccess = routes.some(route => pathname.startsWith(route))
          break
        }
      }

      // Special case: applicants can access dashboard and application pages
      if (userRole === 'applicant') {
        const applicantAllowedRoutes = ['/dashboard', '/apply']
        hasAccess = applicantAllowedRoutes.some(route => pathname.startsWith(route))
      }

      // If no access based on role, redirect to appropriate dashboard
      if (!hasAccess) {
        console.warn(`🚫 Role-based access denied for ${userRole} to ${pathname}`)
        
        // Redirect to appropriate dashboard based on role
        switch (userRole) {
          case 'admin':
            return NextResponse.redirect(new URL('/admin', request.url))
          case 'approver':
            return NextResponse.redirect(new URL('/approver', request.url))
          case 'inspector':
            return NextResponse.redirect(new URL('/inspection', request.url))
          case 'reviewer':
            return NextResponse.redirect(new URL('/review', request.url))
          case 'applicant':
          default:
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }
      }

      console.log(`✅ Access granted for ${userRole} to ${pathname}`)
    } catch (error) {
      console.error('❌ Middleware error:', error)
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // For auth pages, redirect authenticated users to their dashboard
  const authPages = ['/login', '/register']
  if (authPages.includes(pathname) && user) {
    try {
      let userRole = user.user_metadata?.role;
      
      if (!userRole) {
        const { data: data } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()
        
        const userProfile = data as any;
        
        if (userProfile) {
          userRole = userProfile.role;
        }
      }

      if (userRole) {
        // Redirect to appropriate dashboard based on role
        switch (userRole) {
          case 'admin':
            return NextResponse.redirect(new URL('/admin', request.url))
          case 'approver':
            return NextResponse.redirect(new URL('/approver', request.url))
          case 'inspector':
            return NextResponse.redirect(new URL('/inspection', request.url))
          case 'reviewer':
            return NextResponse.redirect(new URL('/review', request.url))
          case 'applicant':
          default:
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }
      }
    } catch (error) {
      console.error('❌ Error in auth page redirect:', error)
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|assets).*)',
  ],
}
