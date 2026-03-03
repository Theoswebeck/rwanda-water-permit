export type CurrentUser = {
  id: string
  email?: string | null
  role?: string | null
}

export async function getCurrentUserClient(): Promise<CurrentUser | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (!res.ok) return null
    const json = (await res.json()) as { user?: Record<string, unknown> | null }
    const u = json.user
    if (!u || typeof u.id !== 'string') return null
    return {
      id: u.id,
      email: typeof u.email === 'string' ? u.email : null,
      role: typeof u.role === 'string' ? u.role : null,
    }
  } catch {
    return null
  }
}
