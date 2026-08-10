/**
 * Shared password policy.
 *
 * Imported by both client forms and API routes so the rules can never drift:
 * the UI shows the same requirements the server actually enforces. Keep this
 * file free of Node-only imports.
 */

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

export interface PasswordContext {
  email?: string | null
  firstName?: string | null
  lastName?: string | null
}

export interface PasswordValidationResult {
  valid: boolean
  /** Human-readable reasons the password was rejected (empty when valid). */
  errors: string[]
  /** 0-4, for the strength meter only — never used to accept/reject. */
  score: number
  label: 'Very weak' | 'Weak' | 'Fair' | 'Strong' | 'Very strong'
}

/**
 * Small blocklist of passwords that show up at the top of every breach corpus.
 * Not a substitute for a full HIBP check, but it stops the worst offenders
 * without shipping a megabyte of wordlist to the browser.
 */
const COMMON_PASSWORDS = new Set([
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwerty',
  'qwerty123',
  'qwertyuiop',
  'abc123',
  'iloveyou',
  'admin',
  'admin123',
  'administrator',
  'welcome',
  'welcome1',
  'welcome123',
  'letmein',
  'monkey',
  'dragon',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'superman',
  'trustno1',
  'changeme',
  'default',
  'secret',
  'rwanda',
  'rwanda123',
  'waterpermit',
  'water123',
  'rwb2024',
  'rwb2025',
])

const SEQUENCES = [
  'abcdefghijklmnopqrstuvwxyz',
  '01234567890',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
]

function hasSequentialRun(lower: string, runLength = 4): boolean {
  for (const seq of SEQUENCES) {
    const reversed = [...seq].reverse().join('')
    for (const source of [seq, reversed]) {
      for (let i = 0; i + runLength <= source.length; i++) {
        if (lower.includes(source.slice(i, i + runLength))) return true
      }
    }
  }
  return false
}

/** Tokens from the user's identity that must not appear inside the password. */
function personalTokens(context: PasswordContext | undefined): string[] {
  if (!context) return []
  const tokens: string[] = []
  const email = String(context.email ?? '').trim().toLowerCase()
  if (email) {
    const local = email.split('@')[0] ?? ''
    // Split on separators so "jean.baptiste" also yields "jean" and "baptiste".
    tokens.push(local, ...local.split(/[._\-+0-9]+/))
    const domain = email.split('@')[1]?.split('.')[0]
    if (domain) tokens.push(domain)
  }
  tokens.push(String(context.firstName ?? ''), String(context.lastName ?? ''))
  return tokens.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3)
}

export function validatePassword(
  password: string,
  context?: PasswordContext
): PasswordValidationResult {
  const errors: string[] = []
  const value = String(password ?? '')
  const lower = value.toLowerCase()

  if (value.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`)
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`)
  }
  if (!/[a-z]/.test(value)) {
    errors.push('Password must contain at least one lowercase letter.')
  }
  if (!/[A-Z]/.test(value)) {
    errors.push('Password must contain at least one uppercase letter.')
  }
  if (!/[0-9]/.test(value)) {
    errors.push('Password must contain at least one number.')
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    errors.push('Password must contain at least one special character (e.g. ! @ # $ %).')
  }
  if (/(.)\1{3,}/.test(value)) {
    errors.push('Password must not repeat the same character four or more times in a row.')
  }
  if (value.length >= PASSWORD_MIN_LENGTH && hasSequentialRun(lower)) {
    errors.push('Password must not contain sequences like "1234", "abcd" or "qwerty".')
  }

  // Strip trailing digits/symbols so "Password123!" is still caught.
  const alphaCore = lower.replace(/[^a-z]/g, '')
  if (COMMON_PASSWORDS.has(lower) || (alphaCore.length >= 5 && COMMON_PASSWORDS.has(alphaCore))) {
    errors.push('This password is too common. Please choose something less predictable.')
  }

  for (const token of personalTokens(context)) {
    if (lower.includes(token)) {
      errors.push('Password must not contain your name or email address.')
      break
    }
  }

  return { valid: errors.length === 0, errors, ...scorePassword(value) }
}

/**
 * Rough strength estimate used purely to drive the UI meter. Deliberately
 * simple — `validatePassword` is what decides whether a password is accepted.
 */
export function scorePassword(password: string): {
  score: number
  label: PasswordValidationResult['label']
} {
  const value = String(password ?? '')
  const labels: PasswordValidationResult['label'][] = [
    'Very weak',
    'Weak',
    'Fair',
    'Strong',
    'Very strong',
  ]

  if (!value) return { score: 0, label: labels[0] }

  let points = 0
  if (value.length >= 8) points++
  if (value.length >= PASSWORD_MIN_LENGTH) points++
  if (value.length >= 16) points++

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length
  points += classes - 1

  const uniqueRatio = new Set(value).size / value.length
  if (uniqueRatio < 0.5) points -= 1
  if (COMMON_PASSWORDS.has(value.toLowerCase())) points = 0

  const score = Math.max(0, Math.min(4, points - 1))
  return { score, label: labels[score] }
}

/** The requirement list rendered next to password inputs. */
export const PASSWORD_REQUIREMENTS: { label: string; test: (v: string) => boolean }[] = [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (v) => v.length >= PASSWORD_MIN_LENGTH },
  { label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'One number', test: (v) => /[0-9]/.test(v) },
  { label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
]

/**
 * Single place that turns a policy failure into an API response body, so every
 * endpoint reports the same shape.
 */
export function passwordPolicyError(result: PasswordValidationResult) {
  return {
    success: false,
    message: result.errors[0] ?? 'Password does not meet the security requirements.',
    errors: result.errors,
  }
}
