import { NextRequest } from 'next/server'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

export function normalizeEmail(raw: unknown): string {
  return String(raw || '').trim().toLowerCase()
}

/**
 * Normalize phone into a stable matching key for Rwanda numbers.
 * We match by the last 9 digits (e.g., 781234567), which works for:
 * - +250781234567
 * - 0781234567
 * - 781234567
 */
export function normalizeRwandaPhoneKey(raw: unknown): string {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length <= 9) return digits
  return digits.slice(-9)
}

export async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = readSessionTokenFromRequest(req)
  const claims = token ? await verifySessionToken(token) : null
  return claims?.sub || null
}

export function isMissingTransferRequestsTable(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  const message = String((err as { message?: unknown } | null)?.message || '')
  return (
    code === '42P01' ||
    message.includes('relation "public.transfer_requests" does not exist') ||
    message.includes('relation "transfer_requests" does not exist')
  )
}
