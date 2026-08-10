import { NextRequest, NextResponse } from 'next/server'

/**
 * Lightweight, dependency-free rate limiter for authentication endpoints.
 *
 * NOTE (deployment): this is an in-process store, so limits are enforced *per
 * server instance*. Railway/Vercel deployments currently run a single replica
 * (see `railway.toml` -> numReplicas = 1), so this is effective today. If we
 * ever scale horizontally, swap `hits`/`blocks` for a shared store (Redis /
 * Supabase table) — the exported API below is intentionally storage-agnostic
 * so only this file needs to change.
 */

export interface RateLimitRule {
  /** Maximum number of attempts allowed inside the window. */
  limit: number
  /** Sliding window length in milliseconds. */
  windowMs: number
  /**
   * How long to keep rejecting once the limit is exceeded. Defaults to
   * `windowMs`. Use a longer value for credential endpoints so an attacker
   * cannot simply retry as soon as the oldest attempt ages out.
   */
  blockMs?: number
}

export interface RateLimitResult {
  allowed: boolean
  /** Attempts left in the current window (0 when blocked). */
  remaining: number
  /** Seconds the caller must wait before retrying (0 when allowed). */
  retryAfterSeconds: number
}

interface Bucket {
  /** Timestamps (ms) of recorded attempts, oldest first. */
  hits: number[]
  /** Epoch ms until which the key is hard-blocked. */
  blockedUntil: number
}

const buckets = new Map<string, Bucket>()

/** Entries untouched for this long are dropped so the map cannot grow forever. */
const IDLE_EVICTION_MS = 60 * 60 * 1000
let lastSweep = 0

function sweep(now: number) {
  if (now - lastSweep < 5 * 60 * 1000) return
  lastSweep = now

  for (const [key, bucket] of buckets) {
    const newestHit = bucket.hits.length ? bucket.hits[bucket.hits.length - 1] : 0
    const lastTouched = Math.max(newestHit, bucket.blockedUntil)
    if (now - lastTouched > IDLE_EVICTION_MS) {
      buckets.delete(key)
    }
  }
}

function getBucket(key: string, now: number): Bucket {
  sweep(now)
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { hits: [], blockedUntil: 0 }
    buckets.set(key, bucket)
  }
  return bucket
}

/**
 * Records an attempt against `key` and reports whether it is allowed.
 *
 * Call this *before* doing the expensive/sensitive work. For endpoints where
 * only failures should count (e.g. login), pair it with `resetRateLimit(key)`
 * on success.
 */
export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now()
  const bucket = getBucket(key, now)

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    }
  }

  const windowStart = now - rule.windowMs
  bucket.hits = bucket.hits.filter((ts) => ts > windowStart)
  bucket.hits.push(now)

  if (bucket.hits.length > rule.limit) {
    bucket.blockedUntil = now + (rule.blockMs ?? rule.windowMs)
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, rule.limit - bucket.hits.length),
    retryAfterSeconds: 0,
  }
}

/** Clears the counters for `key` — call on a successful authentication. */
export function resetRateLimit(key: string) {
  buckets.delete(key)
}

/**
 * Best-effort client IP. Railway/Vercel both terminate TLS upstream, so the
 * socket address is a proxy; `x-forwarded-for` holds the real client first.
 */
export function getClientIp(req: NextRequest | Request): string {
  const headers = req.headers
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    headers.get('x-vercel-forwarded-for') ||
    'unknown'
  )
}

/** Normalizes an email so `A@B.com` and `a@b.com ` share a rate-limit bucket. */
export function emailKey(email: unknown): string {
  return String(email ?? '')
    .trim()
    .toLowerCase()
}

/** Standard 429 response with a `Retry-After` header. */
export function tooManyRequests(result: RateLimitResult, message?: string) {
  const retryAfter = Math.max(1, result.retryAfterSeconds)
  return NextResponse.json(
    {
      success: false,
      message:
        message ??
        `Too many attempts. Please wait ${Math.ceil(retryAfter / 60)} minute(s) before trying again.`,
      retryAfterSeconds: retryAfter,
    },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  )
}

/**
 * Shared rules for the auth surface. Kept here so the thresholds are reviewable
 * in one place rather than scattered across route handlers.
 */
export const AUTH_RATE_LIMITS = {
  /** Failed sign-ins from one IP (covers credential stuffing across accounts). */
  loginPerIp: { limit: 20, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
  /** Failed sign-ins against one account (covers password guessing). */
  loginPerAccount: { limit: 5, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
  /** Reset/verification codes sent to one address. */
  passwordResetRequestPerAccount: { limit: 3, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
  /** Reset/verification codes requested from one IP. */
  passwordResetRequestPerIp: { limit: 10, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
  /** OTP guesses against one account (the code is only 6 digits). */
  passwordResetVerifyPerAccount: { limit: 5, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 },
  /** OTP guesses from one IP. */
  passwordResetVerifyPerIp: { limit: 20, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
  /** Reset-token redemptions from one IP. */
  passwordResetConfirmPerIp: { limit: 10, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
  /** Authenticated password changes per user. */
  changePasswordPerUser: { limit: 5, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>
