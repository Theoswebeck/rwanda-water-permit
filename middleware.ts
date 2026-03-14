import { NextRequest, NextResponse } from 'next/server'
import { getAuthCookieName, verifySessionToken, clearSessionCookie } from '@/lib/auth/session'

const SUPERUSER_EMAILS = new Set(['nizzogentl1@gmail.com', 'nshutidavy@gmail.com'])

function normalizeRole(input: unknown): string {
  const raw = String(input ?? '').trim().toLowerCase()
  if (!raw) return 'applicant'
  const aliases: Record<string, string> = { application: 'applicant' }
  return aliases[raw] ?? raw
}

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

const ROLE_ROUTES: Record<string, string[]> = {
  admin: PROTECTED_ROUTES,
  approver: ['/approver', '/dashboard/profile', '/dashboard/settings', '/management'],
  inspector: ['/inspection', '/inspector', '/dashboard/profile', '/dashboard/settings', '/management'],
  reviewer: ['/review', '/dashboard/profile', '/dashboard/settings', '/management'],
  assessor: ['/assessment', '/review', '/technical-assessment', '/dashboard/profile', '/dashboard/settings', '/management'],
  verifier: ['/verification', '/verifier', '/dashboard/profile', '/dashboard/settings', '/management'],
  applicant: ['/dashboard', '/apply'],
}

const ROLE_DASHBOARDS: Record<string, string> = {
  admin: '/admin',
  approver: '/approver',
  inspector: '/inspection',
  reviewer: '/review',
  assessor: '/assessment',
  verifier: '/verification',
  applicant: '/dashboard',
}

function loginRedirect(request: NextRequest, pathname: string) {
  const redirectUrl = new URL('/login', request.url)
  redirectUrl.searchParams.set('redirect', pathname)
  return NextResponse.redirect(redirectUrl)
}

function resolveEffectiveRolesFromClaims(
  claims: { effectiveRoles?: unknown; role?: unknown },
  baseRole: string
): Set<string> {
  if (Array.isArray(claims.effectiveRoles) && claims.effectiveRoles.length > 0) {
    const roles = new Set(
      claims.effectiveRoles
        .map((role: unknown) => normalizeRole(role))
        .filter(Boolean)
    )
    if (roles.size > 0) return roles
  }
  return new Set([baseRole].filter(Boolean))
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isProtectedRoute = PROTECTED_ROUTES.some((route) => pathname.startsWith(route))
  const isAuthPage = AUTH_PAGES.includes(pathname)

  if (!isProtectedRoute && !isAuthPage) {
    return NextResponse.next()
  }

  const token = request.cookies.get(getAuthCookieName())?.value
  if (!token) {
    if (isProtectedRoute) return loginRedirect(request, pathname)
    return NextResponse.next()
  }

  const claims = await verifySessionToken(token)
  if (!claims) {
    if (!isProtectedRoute) {
      const res = NextResponse.next()
      clearSessionCookie(res)
      return res
    }
    const res = loginRedirect(request, pathname)
    clearSessionCookie(res)
    return res
  }

  const userEmail = String(claims.email || '').trim().toLowerCase()
  const isSuperuser = SUPERUSER_EMAILS.has(userEmail)
  const userStatus = String(claims.status || '')
  const normalizedRole = normalizeRole(claims.role)

  if (userStatus === 'suspended' || userStatus === 'inactive') {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('error', userStatus)
    const res = NextResponse.redirect(redirectUrl)
    clearSessionCookie(res)
    return res
  }

  if (isProtectedRoute) {
    if (isSuperuser || normalizedRole === 'admin') {
      return NextResponse.next()
    }

    const effectiveRoles = resolveEffectiveRolesFromClaims(claims, normalizedRole)

    if (
      pathname.startsWith('/dashboard') &&
      !pathname.startsWith('/dashboard/profile') &&
      !pathname.startsWith('/dashboard/settings') &&
      normalizedRole !== 'applicant'
    ) {
      return NextResponse.redirect(new URL(ROLE_DASHBOARDS[normalizedRole] || '/dashboard', request.url))
    }

    if (!isSuperuser && normalizedRole !== 'admin') {
      const hasAccess = Array.from(effectiveRoles).some((role) => {
        const allowedRoutes = ROLE_ROUTES[role] || []
        return allowedRoutes.some((route) => pathname.startsWith(route))
      })
      if (!hasAccess) {
        return NextResponse.redirect(new URL(ROLE_DASHBOARDS[normalizedRole] || '/dashboard', request.url))
      }
    }
  }

  if (isAuthPage) {
    const hasRscParam = request.nextUrl.searchParams.has('_rsc')
    const hasRedirectParam = request.nextUrl.searchParams.has('redirect')
    if (!hasRscParam && !hasRedirectParam) {
      const redirectPath = ROLE_DASHBOARDS[normalizedRole] || '/dashboard'
      return NextResponse.redirect(new URL(redirectPath, request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/admin',
    '/admin/:path*',
    '/review',
    '/review/:path*',
    '/inspection',
    '/inspection/:path*',
    '/inspector',
    '/inspector/:path*',
    '/approver',
    '/approver/:path*',
    '/assessment',
    '/assessment/:path*',
    '/technical-assessment',
    '/technical-assessment/:path*',
    '/verification',
    '/verification/:path*',
    '/verifier',
    '/verifier/:path*',
    '/management',
    '/management/:path*',
    '/apply',
    '/apply/:path*',
    '/login',
    '/register',
  ],
}
