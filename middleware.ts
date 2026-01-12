import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/middleware'
import type { User } from '@supabase/supabase-js'

const SUPERUSER_EMAILS = new Set(['nizzogentl1@gmail.com', 'nshutidavy@gmail.com'])

function getUserEmail(user: User | null | undefined): string {
  // Supabase User objects can surface email in different places depending on provider/session.
  // We normalize and check multiple sources so allowlists work reliably in middleware (Edge).
  const direct = String(user?.email ?? '').trim().toLowerCase()
  if (direct) return direct

  const meta = String((user as any)?.user_metadata?.email ?? '').trim().toLowerCase()
  if (meta) return meta

  const identities = (user as any)?.identities as Array<any> | undefined
  const fromIdentities =
    identities
      ?.map((i) => String(i?.identity_data?.email ?? '').trim().toLowerCase())
      .find(Boolean) ?? ''
  return fromIdentities
}

// Normalize roles coming from JWT/DB (case, whitespace, aliases).
// This prevents accidental fallbacks to `/dashboard` when role strings differ (e.g. "Approver", " assessor ").
function normalizeRole(input: unknown): string {
  const raw = String(input ?? '').trim().toLowerCase()
  if (!raw) return 'applicant'

  // Backward/forward compatibility aliases
  // - Inspector role may still exist in legacy data; treat it as part of the assessment workflow.
  // - Note: assessor and reviewer are now separate roles with different dashboards
  const aliases: Record<string, string> = {
    // Common typo / confusion: "application" (role) vs "applicant" (role)
    application: 'applicant',
  }

  return aliases[raw] ?? raw
}

// ⚡ PERFORMANCE: Define protected routes statically to avoid repeated checks
// NOTE: Keep this in sync with role dashboards/routes (e.g. verifier -> /verification).
const PROTECTED_ROUTES = [
  '/dashboard',
  '/admin',
  '/approver',
  '/inspection',
  '/inspector',
  '/review',
  '/assessment',
  '/verification',
  '/verifier',
  '/technical-assessment',
  '/management',
  '/apply',
]
const AUTH_PAGES = ['/login', '/register']

// ⚡ PERFORMANCE: Role-based route access defined statically
const ROLE_ROUTES: Record<string, string[]> = {
  // Admins can access all protected routes.
  // IMPORTANT: the middleware also treats `admin` as "allow all" to avoid accidental lockouts.
  admin: PROTECTED_ROUTES,
  approver: ['/approver', '/review', '/assessment', '/verification', '/dashboard/profile', '/management'],
  inspector: ['/inspection', '/inspector', '/dashboard/profile', '/management'],
  reviewer: ['/review', '/assessment', '/dashboard/profile', '/management'],
  assessor: ['/assessment', '/review', '/technical-assessment', '/dashboard/profile', '/management'],
  verifier: ['/verification', '/verifier', '/dashboard/profile', '/management'],
  applicant: ['/dashboard', '/apply']
}

// ⚡ PERFORMANCE: Role dashboard mapping
const ROLE_DASHBOARDS: Record<string, string> = {
  admin: '/admin',
  approver: '/approver',
  inspector: '/inspection',
  reviewer: '/review',
  assessor: '/assessment',
  verifier: '/verification',
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
    // If we can't validate auth, do NOT allow protected pages to render (some pages may not have a client guard).
    // Redirect to login with a redirect back to the originally requested path.
    console.warn('⚠️ Middleware auth check failed; redirecting to login');
    if (isProtectedRoute) {
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('redirect', pathname)
      redirectUrl.searchParams.set('error', 'auth_check_failed')
      return NextResponse.redirect(redirectUrl)
    }
    return NextResponse.next()
  }

  // If it's a protected route and no user, redirect to login
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If user exists, check role-based access
  if (user && isProtectedRoute) {
    const userEmail = getUserEmail(user)
    const isSuperuser = SUPERUSER_EMAILS.has(userEmail)

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

    // Superusers can access all protected pages regardless of role.
    if (isSuperuser) {
      return response
    }

    // ⚡ PERFORMANCE: Simplified role-based access check
    const normalizedRole = normalizeRole(userRole)

    // Admins can access all protected pages.
    if (normalizedRole === 'admin') {
      return response
    }

    const allowedRoutes = ROLE_ROUTES[normalizedRole] || []
    const hasAccess = allowedRoutes.some(route => pathname.startsWith(route))

    // If no access, redirect to appropriate dashboard
    if (!hasAccess) {
      const redirectPath = ROLE_DASHBOARDS[normalizedRole] || '/dashboard'
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
      const userRole = normalizeRole(user.user_metadata?.role)
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
    '/technical-assessment/:path*',
    '/verification/:path*',
    '/verifier/:path*',
    '/management/:path*',
    '/apply/:path*',
    '/login',
    '/register'
  ],
}
