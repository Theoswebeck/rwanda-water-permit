import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import type { NextRequest, NextResponse } from 'next/server'
import type { AccountType, UserRole, UserStatus } from '@/types/database'

export type SessionClaims = JWTPayload & {
  sub: string
  email: string
  role: UserRole
  status: UserStatus
  accountType?: AccountType
  effectiveRoles?: string[]
}

export function getAuthCookieName(): string {
  return process.env.AUTH_COOKIE_NAME?.trim() || 'wp_session'
}

export function getSessionTtlSeconds(): number {
  const raw = process.env.AUTH_SESSION_TTL_SECONDS
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return 60 * 60 * 24 * 30
}

function getAuthCookieSecure(): boolean {
  const raw = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase()
  if (raw === 'true' || raw === '1' || raw === 'yes') return true
  if (raw === 'false' || raw === '0' || raw === 'no') return false

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().toLowerCase()
  if (appUrl?.startsWith('http://')) return false

  return process.env.NODE_ENV === 'production'
}

function getJwtSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET?.trim()
  if (!secret) {
    throw new Error('AUTH_JWT_SECRET is required')
  }
  return secret
}

function getJwtKey(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret())
}

export async function createSessionToken(input: {
  userId: string
  email: string
  role: UserRole
  status: UserStatus
  accountType?: AccountType
  effectiveRoles?: string[]
}): Promise<string> {
  const ttlSeconds = getSessionTtlSeconds()
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({
    email: input.email,
    role: input.role,
    status: input.status,
    accountType: input.accountType,
    effectiveRoles: input.effectiveRoles,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(input.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(getJwtKey())
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtKey())
    if (!payload.sub || !payload.email || !payload.role || !payload.status) {
      return null
    }
    return payload as SessionClaims
  } catch {
    return null
  }
}

export function readSessionTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get(getAuthCookieName())?.value || null
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: getAuthCookieName(),
    value: token,
    httpOnly: true,
    secure: getAuthCookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: getSessionTtlSeconds(),
  })
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: getAuthCookieName(),
    value: '',
    httpOnly: true,
    secure: getAuthCookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending two-factor step
//
// RWB staff sign-in is two steps: password, then an emailed code. Between them
// the browser holds this short-lived token INSTEAD of a session — it proves the
// password was accepted for one specific user and nothing more, so a stolen
// copy cannot read or write anything on its own.
// ─────────────────────────────────────────────────────────────────────────────

const PENDING_2FA_COOKIE = 'wp_2fa'
const PENDING_2FA_TTL_SECONDS = 10 * 60

export async function createPendingTwoFactorToken(userId: string, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ email, purpose: 'pending_2fa' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + PENDING_2FA_TTL_SECONDS)
    .sign(getJwtKey())
}

export async function verifyPendingTwoFactorToken(
  token: string
): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtKey())
    if (payload.purpose !== 'pending_2fa' || !payload.sub || !payload.email) return null
    return { userId: String(payload.sub), email: String(payload.email) }
  } catch {
    return null
  }
}

export function readPendingTwoFactorToken(request: NextRequest): string | null {
  return request.cookies.get(PENDING_2FA_COOKIE)?.value || null
}

export function setPendingTwoFactorCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: PENDING_2FA_COOKIE,
    value: token,
    httpOnly: true,
    secure: getAuthCookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_2FA_TTL_SECONDS,
  })
}

export function clearPendingTwoFactorCookie(response: NextResponse): void {
  response.cookies.set({
    name: PENDING_2FA_COOKIE,
    value: '',
    httpOnly: true,
    secure: getAuthCookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}
