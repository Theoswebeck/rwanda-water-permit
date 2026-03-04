const DEFAULT_PORTAL_URL = 'https://rwandawaterpermit.com/'

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return DEFAULT_PORTAL_URL

  // Ensure it has a protocol so URL() parsing works reliably.
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withProtocol)
  // Always normalize to a trailing slash (good for display + URL joins).
  url.pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  return url.toString()
}

export function getPortalUrl(): string {
  const envUrl = typeof process.env.NEXT_PUBLIC_APP_URL === 'string' ? process.env.NEXT_PUBLIC_APP_URL : ''
  const normalized = normalizeBaseUrl(envUrl)

  // Guardrail: in production, never send emails pointing to localhost even if misconfigured.
  const isProd = process.env.NODE_ENV === 'production'
  if (isProd && /localhost|127\.0\.0\.1/i.test(normalized)) return DEFAULT_PORTAL_URL

  return normalized
}

export function buildPortalLink(pathname: string): string {
  return new URL(pathname, getPortalUrl()).toString()
}


