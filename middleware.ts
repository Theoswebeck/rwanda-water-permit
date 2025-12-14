import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/middleware'
import type { User } from '@supabase/supabase-js'

// ⚡ PERFORMANCE: Define protected routes statically to avoid repeated checks
const PROTECTED_ROUTES = ['/dashboard', '/admin', '/approver', '/inspection', '/inspector', '/review', '/assessment']
const AUTH_PAGES = ['/login', '/register']

// ⚡ PERFORMANCE: Role-based route access defined statically
const ROLE_ROUTES: Record<string, string[]> = {
  admin: ['/admin'],
  approver: ['/approver'],
  inspector: ['/inspection', '/inspector', '/assessment'],
  reviewer: ['/review', '/assessment'],
  applicant: ['/dashboard', '/apply']
}

// ⚡ PERFORMANCE: Role dashboard mapping
const ROLE_DASHBOARDS: Record<string, string> = {
  admin: '/admin',
  approver: '/approver',
  inspector: '/inspection',
  reviewer: '/review',
  applicant: '/dashboard'
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  
  // ⚡ PERFORMANCE: Early exit for non-protected routes
  const isProtectedRoute = PROTECTED_ROUTES.some(route => pathname.startsWith(route))
  const isAuthPage = AUTH_PAGES.includes(pathname)
  
  // If neither protected nor auth page, skip middleware entirely
  if (!isProtectedRoute && !isAuthPage) {
    return NextResponse.next()
  }

  let supabase, response;
  let user: User | null = null;
  
  try {
    const client = await createClient(request);
    supabase = client.supabase;
    response = client.response;
    user = client.user;
  } catch (error) {
    // If there's a fetch error (network issue), allow the request to continue
    console.warn('⚠️ Middleware auth check failed (network issue), allowing request');
    return NextResponse.next();
  }

  // If it's a protected route and no user, redirect to login
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If user exists, check role-based access
  if (user && isProtectedRoute) {
    // ⚡ PERFORMANCE: Get role from JWT metadata first (no DB call needed)
    let userRole = user.user_metadata?.role;
    let userStatus = user.user_metadata?.status;

    // Only fetch from DB if metadata is missing (legacy users)
    if (!userRole || !userStatus) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('role, status')
          .eq('id', user.id)
          .single()

        if (error || !data) {
          console.error('❌ Error fetching user profile in middleware')
          return NextResponse.redirect(new URL('/login', request.url))
        }
        
        // Type assertion for the profile data
        const profile = data as { role: string; status: string };
        userRole = profile.role;
        userStatus = profile.status;
      } catch (error) {
        console.error('❌ Middleware error:', error)
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }

    // Check if user is suspended or inactive
    if (userStatus === 'suspended' || userStatus === 'inactive') {
      await supabase.auth.signOut()
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('error', userStatus)
      return NextResponse.redirect(redirectUrl)
    }

    // ⚡ PERFORMANCE: Simplified role-based access check
    const allowedRoutes = ROLE_ROUTES[userRole] || []
    const hasAccess = allowedRoutes.some(route => pathname.startsWith(route))

    // If no access, redirect to appropriate dashboard
    if (!hasAccess) {
      const redirectPath = ROLE_DASHBOARDS[userRole] || '/dashboard'
      return NextResponse.redirect(new URL(redirectPath, request.url))
    }
  }

  // For auth pages, redirect authenticated users to their dashboard
  if (isAuthPage && user) {
    // IMPORTANT:
    // Next.js App Router uses RSC navigation requests (`?_rsc=...`). If we redirect those,
    // and the browser-side auth validation is timing out, it can cause an infinite loop:
    // dashboard -> client redirects to /login -> middleware redirects back to /dashboard -> repeat.
    // Also, when `redirect=` is present, the user was explicitly sent to login from a protected route.
    // In both cases, allow the login/register page to render instead of forcing a redirect.
    const hasRscParam = request.nextUrl.searchParams.has('_rsc')
    const hasRedirectParam = request.nextUrl.searchParams.has('redirect')
    if (!hasRscParam && !hasRedirectParam) {
      const userRole = user.user_metadata?.role || 'applicant'
      const redirectPath = ROLE_DASHBOARDS[userRole] || '/dashboard'
      return NextResponse.redirect(new URL(redirectPath, request.url))
    }
  }

  return response
}

// ⚡ PERFORMANCE: Narrow matcher to only protected routes
// This prevents middleware from running on every single request
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/review/:path*',
    '/inspection/:path*',
    '/inspector/:path*',
    '/approver/:path*',
    '/assessment/:path*',
    '/apply/:path*',
    '/login',
    '/register'
  ],
}
