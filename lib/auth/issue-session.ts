import { NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { createSessionToken, setSessionCookie } from '@/lib/auth/session'
import { resolveEffectiveRoles } from '@/lib/auth/effective-roles'
import type { AccountType, UserRole, UserStatus } from '@/types/database'

export type SessionUser = {
  id: string
  email: string
  role: UserRole
  status: UserStatus
  account_type: AccountType
  must_change_password: boolean
}

/**
 * Sign the user in: resolve delegated roles, mint the session cookie and return
 * the payload the client expects. Shared by the one-step applicant login and
 * the second step of staff two-factor sign-in so both produce the same session.
 */
export async function issueSessionResponse(user: SessionUser): Promise<NextResponse> {
  const resolved = await resolveEffectiveRoles({ userId: user.id, claimsRole: user.role })

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    accountType: user.account_type,
    effectiveRoles: resolved.effectiveRoles,
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
        base_role: resolved.baseRole,
        delegated_roles: resolved.delegatedRoles,
        effective_roles: resolved.effectiveRoles,
      },
    },
    mustChangePassword: Boolean(user.must_change_password),
  })
  setSessionCookie(response, token)
  return response
}
