import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { verifyPassword } from '@/lib/auth/password'
import { createSessionToken, setSessionCookie } from '@/lib/auth/session'
import type { AccountType, UserRole, UserStatus } from '@/types/database'

type UserRow = {
  id: string
  email: string
  password_hash: string
  role: UserRole
  status: UserStatus
  account_type: AccountType
  must_change_password: boolean
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const email = String(body?.email ?? '')
      .trim()
      .toLowerCase()
    const password = String(body?.password ?? '')

    if (!email || !password) {
      return NextResponse.json({ success: false, message: 'Email and password are required' }, { status: 400 })
    }

    const result = await query<UserRow>(
      `
      select id, email, password_hash, role, status, account_type, must_change_password
      from public.users
      where lower(email) = $1
      limit 1
      `,
      [email]
    )
    const user = result.rows[0]

    if (!user) {
      return NextResponse.json({ success: false, message: 'Invalid email or password' }, { status: 401 })
    }

    const validPassword = await verifyPassword(password, user.password_hash)
    if (!validPassword) {
      return NextResponse.json({ success: false, message: 'Invalid email or password' }, { status: 401 })
    }

    if (user.status === 'suspended') {
      return NextResponse.json(
        { success: false, message: 'Your account has been suspended. Please contact support for assistance.' },
        { status: 403 }
      )
    }
    if (user.status === 'inactive') {
      return NextResponse.json(
        { success: false, message: 'Your account is inactive. Please contact support to reactivate your account.' },
        { status: 403 }
      )
    }

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      accountType: user.account_type,
    })

    await query(`update public.users set last_login_at = now(), updated_at = now() where id = $1`, [user.id])

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: {
          role: user.role,
          status: user.status,
          account_type: user.account_type,
        },
      },
      mustChangePassword: Boolean(user.must_change_password),
    })
    setSessionCookie(response, token)
    return response
  } catch (err) {
    console.error('❌ login server error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
