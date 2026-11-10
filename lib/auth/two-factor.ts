import { randomInt } from 'crypto'
import { query } from '@/lib/db/postgres'
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'

/**
 * Email second factor for RWB staff sign-in.
 *
 * Applicants are deliberately exempt (RWB's requirement): the extra step would
 * sit between the public and the application form. Codes reuse the existing
 * `email_verification_codes` table under a purpose of their own, so nothing a
 * signup or password-reset code touches can be replayed here.
 */
export const TWO_FACTOR_PURPOSE = 'login_2fa'
const CODE_TTL_MINUTES = 10

/**
 * Domains whose accounts are RWB staff. A staff role alone is not enough: the
 * portal also carries staff-role accounts on outside addresses (support and
 * test accounts), and challenging those sends a code to a mailbox RWB does not
 * control. Override with STAFF_2FA_EMAIL_DOMAINS as a comma-separated list.
 */
function staffEmailDomains(): string[] {
  const raw = process.env.STAFF_2FA_EMAIL_DOMAINS?.trim()
  return (raw ? raw.split(',') : ['rwb.rw'])
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
}

/** An RWB mailbox — the account belongs to the institution. */
export function isRwbStaffEmail(email: string | null | undefined): boolean {
  const normalized = String(email ?? '').trim().toLowerCase()
  const domains = staffEmailDomains()
  if (domains.includes('*') || domains.includes('all')) return true
  const at = normalized.lastIndexOf('@')
  if (at < 0) return false
  const domain = normalized.slice(at + 1)
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`))
}

/**
 * RWB staff carry a second factor; applicants do not.
 *
 * Both tests must pass: a staff role AND an RWB mailbox. Role alone challenged
 * staff-role accounts on personal addresses, which RWB flagged.
 *
 * `STAFF_2FA_ENABLED=false` is the break-glass switch: if RWB's mail server is
 * down, every staff account is locked out until it comes back, and an admin
 * with server access must be able to turn the step off without a deploy.
 */
export function requiresTwoFactor(role: string | null | undefined, email?: string | null): boolean {
  if (String(process.env.STAFF_2FA_ENABLED ?? '').trim().toLowerCase() === 'false') return false
  const normalized = String(role ?? '').trim().toLowerCase()
  if (!normalized) return false
  if (normalized === 'applicant' || normalized === 'application') return false
  return isRwbStaffEmail(email)
}

/** Generate, store and email a fresh sign-in code. Returns it only in dev. */
export async function sendTwoFactorCode(email: string): Promise<{ devCode?: string }> {
  const lower = email.toLowerCase()
  const code = String(randomInt(100000, 1000000))
  const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString()

  // Any earlier unused code is spent, so only the newest one can sign in.
  await query(
    `update public.email_verification_codes
     set consumed_at = now(), updated_at = now()
     where lower(email) = $1 and purpose = $2 and consumed_at is null`,
    [lower, TWO_FACTOR_PURPOSE]
  ).catch(() => undefined)

  await query(
    `insert into public.email_verification_codes (email, code, purpose, expires_at, created_at, updated_at)
     values ($1, $2, $3, $4, now(), now())`,
    [lower, code, TWO_FACTOR_PURPOSE, expires]
  )

  await sendSmtpEmail({
    to: email,
    subject: 'Your sign-in code - Rwanda Water Resources Board',
    title: 'Staff sign-in verification',
    text:
      `Your sign-in code is ${code}\n\n` +
      `It expires in ${CODE_TTL_MINUTES} minutes and can be used once.\n\n` +
      `If you did not try to sign in, change your password and tell the system administrator.`,
  })

  const isDev = process.env.NODE_ENV !== 'production' || process.env.EMAIL_DEV_MODE === 'true'
  return { devCode: isDev ? code : undefined }
}

/** Consume a sign-in code. A code is valid once, for ten minutes. */
export async function consumeTwoFactorCode(email: string, code: string): Promise<boolean> {
  const { rows } = await query<{ id: string; expires_at: string; consumed_at: string | null }>(
    `select id, expires_at, consumed_at
     from public.email_verification_codes
     where lower(email) = lower($1) and purpose = $2 and code = $3
     order by created_at desc
     limit 1`,
    [email, TWO_FACTOR_PURPOSE, code]
  )
  const rec = rows[0]
  if (!rec || rec.consumed_at || new Date(String(rec.expires_at)).getTime() <= Date.now()) {
    return false
  }
  await query(
    `update public.email_verification_codes set consumed_at = now(), updated_at = now() where id = $1`,
    [rec.id]
  )
  return true
}
