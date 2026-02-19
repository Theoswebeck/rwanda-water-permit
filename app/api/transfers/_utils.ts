import type { Database } from '@/types/database'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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

export function getSupabaseServerAuth(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  let supabaseResponse = NextResponse.next({ request: { headers: req.headers } })
  const supabaseAuth = createServerClient<Database>(url, anonKey, {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value
      },
      set(name: string, value: string, options: object) {
        supabaseResponse = NextResponse.next({ request: { headers: req.headers } })
        supabaseResponse.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: object) {
        supabaseResponse = NextResponse.next({ request: { headers: req.headers } })
        supabaseResponse.cookies.set({ name, value: '', ...options })
      },
    },
  })

  return { supabaseAuth, supabaseResponse }
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient<Database>(url, serviceKey)
}

