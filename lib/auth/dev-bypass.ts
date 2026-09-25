// Local-development login bypass.
//
// Lets a developer run `npm run dev` and open any page without signing in.
// Three conditions must ALL hold, so it can never switch on in a deployed app:
//   1. DEV_AUTH_BYPASS=true in the env file,
//   2. NODE_ENV is 'development' (`next dev`; `next build`/`next start` force 'production'),
//   3. the request is addressed to localhost / 127.0.0.1.
// The bypass signs the browser in as a real user (DEV_AUTH_EMAIL, or the first
// active admin) holding every staff role, via /api/dev/login.

export const DEV_LOGIN_PATH = '/api/dev/login'

export const DEV_ALL_ROLES = ['admin', 'approver', 'reviewer', 'verifier', 'assessor', 'inspector', 'applicant']

export function isDevAuthBypass(host: string | null | undefined): boolean {
  if (process.env.NODE_ENV !== 'development') return false
  if (process.env.DEV_AUTH_BYPASS?.trim().toLowerCase() !== 'true') return false
  const hostname = String(host ?? '').split(':')[0].toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1'
}
