import { NextRequest, NextResponse } from 'next/server'

import { readSessionTokenFromRequest, verifySessionToken, type SessionClaims } from './session'

/**
 * Route-handler authorization guard.
 *
 * `middleware.ts` already gates `/api/admin/*` and `/api/staff/*`, but that is
 * a single choke point governed by a matcher config: a matcher edit or a route
 * that moves out of the guarded prefix silently loses its protection. Handlers
 * that do something privileged should therefore assert their own requirement
 * as well. The check is cheap — verifying the signed session cookie, no DB hit.
 *
 * Roles come from the JWT, which is signed with `AUTH_JWT_SECRET` server-side
 * and stored in an httpOnly cookie, so the client cannot forge or edit them.
 */

const SUPERUSER_EMAILS = new Set(['nizzogentl1@gmail.com', 'nshutidavy@gmail.com'])

export interface RequireRoleFailure {
  ok: false
  response: NextResponse
}

export interface RequireRoleSuccess {
  ok: true
  claims: SessionClaims
  userId: string
  email: string
}

function normalizeRole(input: unknown): string {
  return String(input ?? '').trim().toLowerCase()
}

/**
 * Usage:
 * ```ts
 * const auth = await requireRole(req, ['admin'])
 * if (!auth.ok) return auth.response
 * // auth.userId is a verified admin
 * ```
 */
export async function requireRole(
  req: NextRequest,
  allowedRoles: readonly string[]
): Promise<RequireRoleSuccess | RequireRoleFailure> {
  const token = readSessionTokenFromRequest(req)
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 }),
    }
  }

  const claims = await verifySessionToken(token)
  if (!claims?.sub) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 }),
    }
  }

  const status = normalizeRole(claims.status)
  if (status === 'suspended' || status === 'inactive') {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: 'Your account is not active.' }, { status: 403 }),
    }
  }

  const email = String(claims.email ?? '').trim().toLowerCase()
  const allowed = allowedRoles.map(normalizeRole)

  const roles = new Set<string>([normalizeRole(claims.role)])
  for (const role of claims.effectiveRoles ?? []) {
    roles.add(normalizeRole(role))
  }

  const permitted =
    SUPERUSER_EMAILS.has(email) || allowed.some((role) => roles.has(role))

  if (!permitted) {
    // Deliberately terse: do not disclose which role would have been required.
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ok: true, claims, userId: claims.sub, email }
}
