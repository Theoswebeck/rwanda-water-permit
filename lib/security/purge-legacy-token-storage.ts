/**
 * Removes Supabase session tokens from `localStorage` / `sessionStorage`.
 *
 * Earlier builds of this app persisted the session in web storage (the
 * `@supabase/supabase-js` default). Sessions now live in cookies, but browsers
 * that used an older build still hold those entries — `localStorage` has no
 * expiry, so a token written months ago is still sitting there readable by any
 * script on the origin. This clears them on boot.
 *
 * Safe to call repeatedly; it is a no-op once storage is clean.
 */

const LEGACY_KEY_PATTERNS = [
  /^sb-.*-auth-token(\.\d+)?$/i,
  /^supabase\.auth\.token$/i,
  /^sb-.*-auth-token-code-verifier$/i,
]

function looksLikeAuthToken(key: string): boolean {
  return LEGACY_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

function purgeStore(store: Storage | undefined): number {
  if (!store) return 0

  let removed = 0
  try {
    // Snapshot the keys first: removing while iterating re-indexes the store.
    const keys = Object.keys(store)
    for (const key of keys) {
      if (looksLikeAuthToken(key)) {
        store.removeItem(key)
        removed++
      }
    }
  } catch {
    // Storage can throw in private-browsing / partitioned contexts.
  }
  return removed
}

export function purgeLegacyTokenStorage(): void {
  if (typeof window === 'undefined') return

  const removed = purgeStore(window.localStorage) + purgeStore(window.sessionStorage)
  if (removed > 0) {
    console.warn(
      `🔒 Removed ${removed} legacy Supabase auth entr${removed === 1 ? 'y' : 'ies'} from web storage. Sessions are stored in cookies.`
    )
  }
}
