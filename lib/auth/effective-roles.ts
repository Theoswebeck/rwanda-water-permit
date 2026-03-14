import { query } from '@/lib/db/postgres'

const DELEGATED_STAFF_ROLES = ['reviewer', 'verifier', 'approver', 'assessor', 'inspector'] as const
const STAFF_ROLES = ['admin', ...DELEGATED_STAFF_ROLES] as const

export type DelegatedStaffRole = (typeof DELEGATED_STAFF_ROLES)[number]
export type StaffRole = (typeof STAFF_ROLES)[number]

type RoleRow = {
  role: string | null
}

type DelegationRow = {
  delegated_role: string | null
}

function asSet(values: string[]): Set<string> {
  return new Set(values.filter(Boolean))
}

export function normalizeRole(input: unknown): string {
  const raw = String(input ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (raw === 'application') return 'applicant'
  return raw
}

export function getStaffRoles(): readonly StaffRole[] {
  return STAFF_ROLES
}

export type EffectiveRolesResult = {
  baseRole: string
  delegatedRoles: string[]
  effectiveRoles: string[]
}

export async function resolveEffectiveRoles(params: {
  userId: string
  claimsRole?: unknown
}): Promise<EffectiveRolesResult> {
  const roleRes = await query<RoleRow>(
    `
    select role
    from public.users
    where id = $1
    limit 1
    `,
    [params.userId]
  )

  const roleFromDb = normalizeRole(roleRes.rows[0]?.role)
  const roleFromClaims = normalizeRole(params.claimsRole)
  const baseRole = roleFromDb || roleFromClaims

  let delegatedRoles: string[] = []
  try {
    const delegatedRes = await query<DelegationRow>(
      `
      select delegated_role::text as delegated_role
      from public.role_delegations
      where delegate_id = $1
        and status = 'active'
        and start_date <= now()
        and (end_date is null or end_date > now())
      `,
      [params.userId]
    )

    delegatedRoles = Array.from(
      asSet(
        delegatedRes.rows
          .map((row) => normalizeRole(row.delegated_role))
          .filter((role) => DELEGATED_STAFF_ROLES.includes(role as DelegatedStaffRole))
      )
    )
  } catch {
    // Keep base-role fallback if delegation lookup fails.
    delegatedRoles = []
  }

  const effectiveRoles = Array.from(asSet([baseRole, ...delegatedRoles].filter(Boolean)))

  return { baseRole, delegatedRoles, effectiveRoles }
}

export function hasAnyRole(effectiveRoles: Iterable<string>, allowedRoles: Iterable<string>): boolean {
  const roles = asSet(Array.from(effectiveRoles, (role) => normalizeRole(role)))
  for (const candidate of allowedRoles) {
    if (roles.has(normalizeRole(candidate))) {
      return true
    }
  }
  return false
}

export function isEffectiveStaffUser(effectiveRoles: Iterable<string>): boolean {
  return hasAnyRole(effectiveRoles, STAFF_ROLES)
}
