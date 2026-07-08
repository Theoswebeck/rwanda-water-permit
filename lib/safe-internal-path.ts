/**
 * Returns `value` only if it is a safe same-origin internal path, else null.
 *
 * Guards against open redirects: a value must start with a single "/" and must
 * NOT be protocol-relative. Browsers normalize both "//host" and "/\host" (and
 * "/\/host" etc.) to an external origin, so we reject any value whose second
 * character is "/" or "\". Used by both the client SmartBackButton and the
 * public permit page for the threaded `?back=` return target.
 */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (value.length >= 2 && (value[1] === "/" || value[1] === "\\")) return null;
  return value;
}
