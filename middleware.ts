import { NextRequest, NextResponse } from 'next/server'
import { getAuthCookieName, verifySessionToken, clearSessionCookie } from '@/lib/auth/session'
import { DEV_LOGIN_PATH, isDevAuthBypass } from '@/lib/auth/dev-bypass'

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

// ─────────────────────────────────────────────────────────────────────────────
// API access control
//
// Every /api/* route requires a valid session UNLESS its prefix appears below.
// The middleware previously did not match /api/* at all, which left routes such
// as /api/staff/permit-registry (the whole permit registry, with holder names
// and contacts) and /api/admin/users/delete answerable by anyone.
//
// The allowlist is deliberately short and prefix-based. Anything added here is
// world-readable, so it needs a reason.
// ─────────────────────────────────────────────────────────────────────────────
const PUBLIC_API_PREFIXES = [
  // Data behind the public Water Use Dashboard. Aggregate counts only.
  '/api/public/water-use-dashboard',
  // Site chrome (contact details, guideline links) rendered on public pages.
  '/api/public/site-content',
  // Government-agency API access request form (design: docs/api-access-DESIGN.md).
  // POST-only by route shape; zod-validated, honeypot + IP throttle in-route.
  '/api/public/api-access-requests',
  // One-time API-key claim from the emailed link (token-authenticated in-route).
  '/api/public/api-access-claim',
  // Public permit verification: the /permit/view/<number> page reached by
  // scanning a permit's QR code lets anyone download that permit's PDF.
  '/api/public/permits/pdf/',
  // The sign-in surface itself — login, signup, logout, OTP codes, password
  // reset, phone verification. These routes enforce their own rules; they
  // cannot require a session because they are how a session is obtained.
  '/api/auth/',
  // Identity lookups used by the signup form before an account exists.
  '/api/nida/',
  '/api/rra/',
  // Server-to-server callback from IremboPay; authenticated by the provider,
  // not by a browser session.
  '/api/payments/webhook',
  // Infrastructure probes used by the deployment.
  '/api/health',
  '/api/warmup',
]

// Server-to-server API for government agencies, authenticated by API key
// (rwb_<env>_… in the X-API-Key header) instead of a browser session. The
// edge middleware has no DB access, so the key check itself happens in-route:
// EVERY route under /api/v1/ must call requireApiKey() before any other
// logic — default-deny at the route level (docs/api-access-DESIGN.md §8).
const KEY_API_PREFIXES = ['/api/v1/']

/** Routes only staff may call. Applicants get 403 even when signed in. */
const STAFF_API_PREFIXES = ['/api/staff/', '/api/management/', '/api/approver/']
const ADMIN_API_PREFIXES = ['/api/admin/']

const STAFF_ROLES = new Set([
  'admin',
  'approver',
  'reviewer',
  'verifier',
  'assessor',
  'inspector',
])

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  )
}

function jsonError(message: string, status: number) {
  return new NextResponse(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const ROLE_ROUTES: Record<string, string[]> = {
  admin: PROTECTED_ROUTES,
  approver: ['/approver', '/dashboard/profile', '/dashboard/settings', '/management'],
  inspector: ['/inspection', '/inspector', '/dashboard/profile', '/dashboard/settings', '/management'],
  reviewer: ['/review', '/dashboard/profile', '/dashboard/settings', '/management'],
  assessor: ['/assessment', '/technical-assessment', '/inspection', '/dashboard/profile', '/dashboard/settings', '/management'],
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

/**
 * Gate for /api/* requests. Returns a response to short-circuit with, or null
 * to let the request through.
 */
async function guardApiRequest(request: NextRequest, pathname: string) {
  if (isPublicApiPath(pathname)) return null

  // /api/v1/* authenticates by API key in-route, not by browser session here.
  if (KEY_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null

  const token = request.cookies.get(getAuthCookieName())?.value
  if (!token) return jsonError('Authentication required', 401)

  const claims = await verifySessionToken(token)
  if (!claims) {
    const res = jsonError('Authentication required', 401)
    clearSessionCookie(res)
    return res
  }

  const status = String(claims.status || '')
  if (status === 'suspended' || status === 'inactive') {
    return jsonError('Account is not active', 403)
  }

  const role = normalizeRole(claims.role)
  const email = String(claims.email || '').trim().toLowerCase()
  const isSuperuser = SUPERUSER_EMAILS.has(email)
  const effectiveRoles = resolveEffectiveRolesFromClaims(claims, role)

  if (ADMIN_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    if (!isSuperuser && role !== 'admin' && !effectiveRoles.has('admin')) {
      return jsonError('Forbidden', 403)
    }
    return null
  }

  if (STAFF_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const isStaff =
      isSuperuser || Array.from(effectiveRoles).some((r) => STAFF_ROLES.has(r))
    if (!isStaff) return jsonError('Forbidden', 403)
  }

  return null
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Local dev only: sign in automatically instead of showing /login (lib/auth/dev-bypass.ts).
  if (isDevAuthBypass(request.headers.get('host'))) {
    if (pathname === DEV_LOGIN_PATH) return NextResponse.next()
    const token = request.cookies.get(getAuthCookieName())?.value
    if (!pathname.startsWith('/api/') && !(token && (await verifySessionToken(token)))) {
      const url = new URL(DEV_LOGIN_PATH, request.url)
      url.searchParams.set('next', AUTH_PAGES.includes(pathname) ? '/' : pathname + request.nextUrl.search)
      return NextResponse.redirect(url)
    }
  }

  if (pathname.startsWith('/api/')) {
    const blocked = await guardApiRequest(request, pathname)
    return blocked ?? NextResponse.next()
  }

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
    // Every API route passes through the allowlist gate above.
    '/api/:path*',
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
