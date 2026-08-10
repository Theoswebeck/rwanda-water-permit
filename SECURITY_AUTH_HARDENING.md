# Authentication & Authorization Hardening

Fixes for five reported security issues. No database migration or environment
variable change is required — this is a code-only deployment.

---

## 1. Rate limiting on login and password reset

New: `lib/security/rate-limit.ts` — sliding-window limiter keyed by IP and by
account. Thresholds live in one place, `AUTH_RATE_LIMITS`.

| Endpoint | Limit |
| --- | --- |
| `POST /api/auth/login` | 5 failed attempts / account / 15 min, 20 / IP / 15 min |
| `POST /api/auth/email/send-code` | 3 / account / 15 min, 10 / IP / 15 min |
| `POST /api/auth/password-reset/verify` | 5 code guesses / account / 15 min (30 min block), 20 / IP |
| `POST /api/auth/password-reset/confirm` | 10 / IP / 15 min |
| `POST /api/auth/change-password` | 5 / user / 15 min |
| `POST /api/auth/signup` | 10 / IP / 15 min |

Exceeding a limit returns `429` with a `Retry-After` header. A successful login
or a correct reset code clears that account's counter, so a legitimate user who
mistypes their password a few times is not locked out afterwards.

On login the check runs *before* the bcrypt comparison, so a flood cannot burn
CPU either.

Also fixed here: `/api/auth/email/send-code` generated its six-digit OTP with
`Math.random()`. That is a predictable PRNG — an attacker who observes one code
can derive others. Codes that grant a password reset now come from
`crypto.randomInt`.

> **Scaling note:** counters are held in process. `railway.toml` runs a single
> replica, so this is effective today. If replicas are ever increased, swap the
> store in `lib/security/rate-limit.ts` for Redis or a Postgres table — nothing
> else needs to change.

## 2. Password strength

New: `lib/security/password.ts`, the single source of truth, imported by both
the API routes and the forms so the UI can't accept what the server rejects.

Policy: at least 12 characters, upper + lower + digit + special, no character
repeated four times in a row, no `1234`/`abcd`/`qwerty` runs, not on the
common-password blocklist, and must not contain the user's own name or email.
The previous rule was a bare 6-character minimum.

Enforced server-side in `signup`, `password-reset/confirm` and
`change-password`; validated client-side in the sign-up form, forgot-password,
reset-password, change-password-required and profile pages. A live strength
meter and requirement checklist ship in
`components/auth/password-strength.tsx` (translated via the existing
`translateText` helper).

Admin-generated temporary passwords now use `crypto.randomInt` and a
Fisher-Yates shuffle instead of `Math.random()` and `sort()` with a random
comparator, and are regenerated until they satisfy the policy. The signup route
no longer logs the plaintext password to the server console.

## 3. Robots disallowed

`app/robots.ts` serves `Disallow: /` for all user agents. Because robots.txt is
advisory, `next.config.ts` also sets
`X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex` on every
response, alongside `X-Content-Type-Options`, `X-Frame-Options: DENY` and
`Referrer-Policy`.

HSTS is deliberately **not** set: the portal is served over
`http://waterpermit.rwb.rw/`, and an HSTS header would make browsers refuse the
site. Add it when the deployment moves to HTTPS.

## 4. Session token storage

Already correct on this branch and left unchanged: the session is a signed JWT
in a **httpOnly** cookie (`lib/auth/session.ts` — `httpOnly: true`,
`sameSite: 'lax'`, `secure` derived from the app URL). JavaScript cannot read
it.

What was still outstanding is history: browsers that ran the older
Supabase-based build may still hold `sb-*-auth-token` entries in
`localStorage`, which never expire and are readable by any script on the
origin. `lib/security/purge-legacy-token-storage.ts` now runs on `AuthProvider`
mount and deletes them, rather than waiting for the user to press the "Clear
saved session" link on the login page.

## 5. Admin check on the server

Authorization on this branch is already server-side: `middleware.ts` gates
`/api/admin/*` to the `admin` role using the signed session JWT, which the
client cannot forge or edit.

What was missing is defence in depth. `/api/admin/users/create` (which can mint
an account with any staff role, including `admin`) and
`/api/admin/users/delete` (which destroys accounts) had no check of their own —
they relied entirely on the middleware matcher. A matcher edit or a route
moving out of the `/api/admin/` prefix would have silently dropped their
protection. Both now call `requireRole(req, ['admin'])`
(`lib/auth/require-role.ts`), which verifies the session cookie directly — no
extra database hit.

Also added: both actions are attributed to the acting admin in `audit_logs`
(the delete route previously logged no actor), and deleting your own account is
rejected so an admin cannot orphan the last admin or break their own session.

`/api/auth/me` already whitelists which profile columns a user may update, so
there is no self-promotion path through the profile editor.

---

## Known gap

The common-password blocklist is a short in-repo list, not a breach-corpus
check. A Have-I-Been-Pwned range lookup would be a reasonable follow-up.
