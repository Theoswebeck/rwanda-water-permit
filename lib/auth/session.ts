import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import type { NextRequest, NextResponse } from 'next/server'
import type { AccountType, UserRole, UserStatus } from '@/types/database'

export type SessionClaims = JWTPayload & {
  sub: string
  email: string
  role: UserRole
  status: UserStatus
  accountType?: AccountType
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
}): Promise<string> {
  const ttlSeconds = getSessionTtlSeconds()
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({
    email: input.email,
    role: input.role,
    status: input.status,
    accountType: input.accountType,
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
    secure: process.env.NODE_ENV === 'production',
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
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}
