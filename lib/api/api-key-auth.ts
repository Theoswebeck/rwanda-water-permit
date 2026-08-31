import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

/**
 * API-key authentication for /api/v1 (government agency access).
 *
 * Design: docs/api-access-DESIGN.md §4, §8.
 *
 * Keys look like `rwb_<env>_<48 hex>`. Only the SHA-256 hash and an 8-char
 * prefix are stored; the plaintext is shown once at approval time. Middleware
 * skips the browser-session gate for /api/v1/*, so EVERY route under it must
 * call requireApiKey() before any other logic — default-deny at the route
 * level.
 */

export type ApiScope = "permits:verify" | "permits:read" | "stats:read";

export type ApiGrant = {
  id: string;
  scopes: string[];
  rateLimitPerMin: number;
  validFrom: Date;
  validUntil: Date;
  status: string;
  keyPrefix: string;
};

type GrantRow = {
  id: string;
  scopes: string[];
  rate_limit_per_min: number;
  valid_from: Date;
  valid_until: Date;
  status: string;
  key_prefix: string;
};

export type ApiKeyResult =
  | { ok: true; grant: ApiGrant }
  | { ok: false; response: NextResponse };

/** Standard error envelope for /api/v1 (design §4.2). */
export function apiError(
  code: string,
  message: string,
  status: number,
  extraHeaders?: Record<string, string>
) {
  return NextResponse.json({ error: { code, message } }, { status, headers: extraHeaders });
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function extractApiKey(req: NextRequest): string | null {
  const header = req.headers.get("x-api-key")?.trim();
  if (header) return header;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

/**
 * Environment tag baked into issued keys (`rwb_live_…` / `rwb_uat_…`) so a
 * prod-issued key can never be mistaken for a UAT one. Prod deployments must
 * set API_KEY_ENV_TAG=live; it defaults to "uat" everywhere else.
 */
export function apiKeyEnvTag(): string {
  return process.env.API_KEY_ENV_TAG === "live" ? "live" : "uat";
}

/** 96-bit random key: `rwb_<env>_<24 hex><40 hex>` (48 hex chars total). */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `rwb_${apiKeyEnvTag()}_${randomBytes(24).toString("hex")}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 17) };
}

// ─── Rate limiting (in-memory sliding window; single on-prem instance) ───────
const WINDOW_MS = 60_000;
const hitWindows = new Map<string, number[]>();

function isRateLimited(keyHash: string, limitPerMin: number): boolean {
  const now = Date.now();
  const recent = (hitWindows.get(keyHash) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limitPerMin) {
    hitWindows.set(keyHash, recent);
    return true;
  }
  recent.push(now);
  hitWindows.set(keyHash, recent);
  // Bound the map so long-lived processes don't accumulate dead keys.
  if (hitWindows.size > 10_000) {
    for (const [k, ts] of hitWindows) {
      if (ts.every((t) => now - t >= WINDOW_MS)) hitWindows.delete(k);
      if (hitWindows.size <= 5_000) break;
    }
  }
  return false;
}

/**
 * Validate the caller's API key against the required scope. On failure the
 * result carries a ready-to-return NextResponse with the standard envelope.
 */
export async function requireApiKey(
  req: NextRequest,
  requiredScope: ApiScope
): Promise<ApiKeyResult> {
  const key = extractApiKey(req);
  if (!key || !key.startsWith(`rwb_${apiKeyEnvTag()}_`)) {
    return {
      ok: false,
      response: apiError(
        "INVALID_KEY",
        "A valid API key must be supplied in the X-API-Key header.",
        401
      ),
    };
  }

  const keyHash = hashApiKey(key);

  let rows;
  try {
    rows = await query<GrantRow>(
      `select id, scopes, rate_limit_per_min, valid_from, valid_until, status, key_prefix
       from api_access_grants
       where api_key_hash = $1
       limit 1`,
      [keyHash]
    );
  } catch (e) {
    console.error("[api-key-auth] grant lookup failed:", e);
    return {
      ok: false,
      response: apiError("INTERNAL_ERROR", "Authentication is temporarily unavailable.", 500),
    };
  }

  const row = rows.rows[0];
  // The prefix check is a cheap sanity tie-break: a stored row whose prefix
  // doesn't match the presented key's environment/format section is treated
  // as not recognised (e.g. a UAT hash somehow copied into the prod table).
  if (!row || row.key_prefix !== key.slice(0, row.key_prefix.length)) {
    return { ok: false, response: apiError("INVALID_KEY", "API key not recognised.", 401) };
  }

  if (row.status === "revoked") {
    return {
      ok: false,
      response: apiError("GRANT_REVOKED", "This API key has been revoked by RWB.", 403),
    };
  }

  const now = new Date();
  if (now < new Date(row.valid_from)) {
    return {
      ok: false,
      response: apiError("GRANT_EXPIRED", "This API key is not active yet.", 403),
    };
  }
  if (now > new Date(row.valid_until)) {
    return {
      ok: false,
      response: apiError(
        "GRANT_EXPIRED",
        `This API key's validity period ended on ${new Date(row.valid_until)
          .toISOString()
          .slice(0, 10)}. Contact RWB to renew.`,
        403
      ),
    };
  }

  if (!Array.isArray(row.scopes) || !row.scopes.includes(requiredScope)) {
    return {
      ok: false,
      response: apiError(
        "SCOPE_NOT_GRANTED",
        `This key was not granted the "${requiredScope}" scope.`,
        403
      ),
    };
  }

  if (isRateLimited(keyHash, row.rate_limit_per_min)) {
    return {
      ok: false,
      response: apiError(
        "RATE_LIMITED",
        `Rate limit of ${row.rate_limit_per_min} requests/minute exceeded.`,
        429,
        { "Retry-After": "60" }
      ),
    };
  }

  const grant: ApiGrant = {
    id: row.id,
    scopes: row.scopes,
    rateLimitPerMin: row.rate_limit_per_min,
    validFrom: new Date(row.valid_from),
    validUntil: new Date(row.valid_until),
    status: row.status,
    keyPrefix: row.key_prefix,
  };

  // Usage tally + audit log. Never let bookkeeping failures fail the request;
  // calls are rate-limit-bounded so this stays a trivial per-call cost.
  void recordUsage(grant.id, req.nextUrl.pathname).catch((e) =>
    console.error("[api-key-auth] usage record failed:", e)
  );

  return { ok: true, grant };
}

async function recordUsage(grantId: string, endpoint: string) {
  await query(
    `update api_access_grants set last_used_at = now(), total_requests = total_requests + 1
     where id = $1`,
    [grantId]
  );
  await query(`insert into api_access_logs (grant_id, endpoint, status_code) values ($1, $2, 200)`, [
    grantId,
    endpoint,
  ]);
}
