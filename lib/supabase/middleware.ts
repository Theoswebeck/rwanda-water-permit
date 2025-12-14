import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export async function createClient(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const clearSupabaseCookies = () => {
    // When Supabase sees a broken refresh token it can throw `refresh_token_not_found`.
    // Clearing cookies lets the user sign in again instead of crashing middleware.
    const all = request.cookies.getAll()
    for (const c of all) {
      if (c.name.startsWith('sb-')) {
        supabaseResponse.cookies.set({
          name: c.name,
          value: '',
          path: '/',
          expires: new Date(0),
        })
      }
    }
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: object) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          supabaseResponse.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: object) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          supabaseResponse.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // SECURITY: Do not trust user objects from getSession()/storage.
  // getUser() validates with Supabase Auth and is the recommended approach.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return { supabase, response: supabaseResponse, user: user || null }
  } catch (err: any) {
    const code = err?.code
    const status = err?.status
    const msg = err?.message || ''

    const isRefreshTokenNotFound =
      code === 'refresh_token_not_found' || msg.includes('Refresh Token Not Found')

    if (isRefreshTokenNotFound || status === 400) {
      console.warn('⚠️ Supabase session invalid in middleware; clearing cookies.', { code, status })
      clearSupabaseCookies()
      return { supabase, response: supabaseResponse, user: null }
    }

    throw err
  }
}
