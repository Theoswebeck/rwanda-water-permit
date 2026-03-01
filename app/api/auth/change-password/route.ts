import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { hashPassword } from '@/lib/auth/password'
import { readSessionTokenFromRequest, verifySessionToken, clearSessionCookie } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  try {
    const { newPassword } = await req.json()
    
    if (!newPassword) {
      return NextResponse.json({ 
        success: false, 
        message: 'New password is required' 
      }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ 
        success: false, 
        message: 'New password must be at least 6 characters long' 
      }, { status: 400 })
    }

    const token = readSessionTokenFromRequest(req)
    if (!token) {
      return NextResponse.json({
        success: false, 
        message: 'Authentication required' 
      }, { status: 401 })
    }

    const claims = await verifySessionToken(token)
    if (!claims?.sub) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }

    const passwordHash = await hashPassword(newPassword)

    const update = await query(
      `
      update public.users
      set
        password_hash = $2,
        must_change_password = false,
        account_confirmed = true,
        confirmed_at = coalesce(confirmed_at, now()),
        updated_at = now()
      where id = $1
      `,
      [claims.sub, passwordHash]
    )

    if (!update.rowCount) {
      return NextResponse.json({ 
        success: false, 
        message: 'User not found' 
      }, { status: 404 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Password updated successfully' 
    })

  } catch (err) {
    console.error('Change password server error:', err)
    return NextResponse.json({ 
      success: false, 
      message: 'Server error' 
    }, { status: 500 })
  }
}
