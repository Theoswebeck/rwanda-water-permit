# RWB Permit Data API — Design for Government Agency Access

> Status: PROPOSED (design only, not yet implemented)
> Date: 2026-08-31
> Author: Menlo Ltd (subcontractor to QT Global Software Ltd, for Rwanda Water Board)

---

## 1. Purpose

Enable other government agencies to programmatically access **permit-related data only**
from the RWB water permit system, through a controlled, auditable, time-boxed API.

Core properties:

- **Request-then-grant workflow.** Agencies apply via a public form; RWB admin reviews
  and grants. No self-service keys.
- **API-key authentication only.** No network-level (IP allowlist) step is required —
  the application is already served over public HTTPS, so the key *is* the credential.
  A static-IP field is collected on the form purely to give RWB IT the *option* to
  allowlist later without re-contacting the agency.
- **Scope-limited.** An agency is granted access only to the endpoint groups it
  explicitly requested on the form — never more.
- **Time-boxed.** Every grant has `valid_from` / `valid_until`; expired keys stop
  working immediately and can be extended or reissued by an admin.
- **Read-only, permit data only.** No write operations, no applicant-account data,
  no documents, no payment records.

### Contract mapping (QT–MENLO subcontract, May 2025)

| Deliverable | Contract requirement | Satisfied by |
|---|---|---|
| D2 — System Modules | "API module" | `/api/v1` read-only permit API + key management |
| D3 — SysAdmin & Integration | Admin tools, audit trails, logs | Admin "API Access" tab + `api_access_logs` |
| D5 — Training & Capacity | "User manuals, technical documentation, and API guides" | Public developer docs page (`/api-access/docs`) + `docs/api/API-GUIDE.md` |

The subcontract prescribes no endpoint-level spec; the API surface below is our design.
D3's other integrations (NID/TIN validation, IremboPay, SMS/email) are outbound and
already exist in the system; this document covers the **inbound** half.

---

## 2. Architecture

```
Landing page ──> /api-access (public request form) ──> api_access_requests
                                                             │
Admin /admin "API Access" tab ── approve / reject /          │
                                 extend / revoke ────────────┴──> api_access_grants
                                                                       │
Agency server ──> GET /api/v1/*  +  X-API-Key header ──────────────────┴──> api_access_logs
                        │
                        └─ reuses the existing public query layer:
                           · lib/permit/public-permit-query.ts  (permit lookup incl.
                             registry fallback + child permits — same as the QR page)
                           · app/api/public/permit-registry route  (filtered list query)
                           · app/api/public/water-use-dashboard route  (cached aggregates)
```

**Principle: the API never invents new data exposure.** Every endpoint returns exactly
what an existing public page already shows (permit QR-verification page, public permit
registry, public Water Use Dashboard). The API is a *machine interface over data that is
already public* — the control is *who* can bulk-query it, at what rate, and for how long.

---

## 3. Scope catalogue (what an agency can request)

The request form presents **exactly these endpoint groups** as a multi-select dropdown
(checkbox items). The agency's selection is stored on the request as `requested_scopes`
and is the **upper bound** of what an admin may grant: `grant.scopes ⊆ request.requested_scopes`.

| # | Label on form | Scope string | Endpoints | What it returns |
|---|---|---|---|---|
| 1 | **Permit verification** | `permits:verify` | `GET /api/v1/permits/verify` | Validity yes/no + core permit fields for one permit number |
| 2 | **Permit records** | `permits:read` | `GET /api/v1/permits` · `GET /api/v1/permits/{permit_number}` | Public registry search/list; full public record for one permit |
| 3 | **Aggregate statistics** | `stats:read` | `GET /api/v1/statistics/summary` | Water Use Dashboard payload: totals, permits by activity / by district / by catchment |

Scopes map 1:1 to endpoint groups, so per-endpoint authorisation is a single string
comparison inside `requireApiKey()`. Grants default to *all requested scopes*; the admin
can un-tick some at approval time (grant less than requested is allowed; grant more is
structurally impossible because the approval UI only renders the requested checkboxes).

Enforcement: each `/api/v1` route declares its required scope; a key without it gets
`403 SCOPE_NOT_GRANTED`.

---

## 4. API specification

### 4.1 Transport & authentication

- Base URL: `https://waterpermit.rwb.rw/api/v1` (same origin as the app; UAT keys are
  issued against the UAT host and tagged `uat` — see §6.2).
- Auth header (either accepted):

  ```
  X-API-Key: rwb_live_<48 hex chars>
  Authorization: Bearer rwb_live_<48 hex chars>
  ```

- All endpoints are **GET only**. No CORS-restricted origins for v1 (keys gate access;
  server-to-server callers are unaffected by CORS either way).

### 4.2 Response envelope

Success:

```json
{
  "data": { ... },
  "meta": { "request_id": "req_01J9...", "cached": true }
}
```

Error (consistent shape; `code` is machine-readable, `message` is safe to log/display):

```json
{
  "error": {
    "code": "GRANT_EXPIRED",
    "message": "This API key's validity period ended on 2026-12-31. Contact RWB to renew."
  }
}
```

| HTTP | code | Meaning |
|---|---|---|
| 400 | `INVALID_PARAMS` | Missing/invalid query parameters (zod-validated) |
| 401 | `INVALID_KEY` | Header missing or key not recognised |
| 403 | `GRANT_EXPIRED` | Key recognised but past `valid_until` |
| 403 | `GRANT_REVOKED` | Key recognised but revoked by RWB |
| 403 | `SCOPE_NOT_GRANTED` | Key valid but this endpoint group was not granted |
| 429 | `RATE_LIMITED` | Over the key's `rate_limit_per_min`; response includes `Retry-After` |
| 500 | `INTERNAL_ERROR` | Never leaks DB error text (same rule as existing public routes) |

### 4.3 Rate limiting

- Default **60 requests/minute/key**, configurable per grant (`rate_limit_per_min`).
- In-memory sliding window per key. The production app runs as a single on-prem
  instance, so in-memory is correct and costs nothing; note counters reset on restart
  (acceptable — the DB-side `total_requests` counter on the grant is the durable tally).
- The statistics endpoint additionally sits behind the existing **5-minute cache**,
  so even a rate-limit-respecting bulk poller cannot exhaust the connection pool.

### 4.4 Endpoints

#### `GET /api/v1/permits/verify?permit_number=RWB-2024-00123`  *(scope `permits:verify`)*

The verification API. Deliberately minimal — designed for "is this permit real and
currently valid?" checks by e.g. a licensing desk.

```json
{
  "data": {
    "permit_number": "RWB-2024-00123",
    "valid": true,
    "status": "active",
    "holder_name": "ACME Water Ltd",
    "permit_type": "water_use_permit",
    "water_source": "borehole",
    "issued_date": "2024-03-15",
    "expiry_date": "2027-03-14",
    "location": { "province": "Kigali City", "district": "Gasabo", "sector": "Ndera" },
    "verified_at": "2026-08-31T10:20:30Z"
  }
}
```

- `valid` is a computed convenience field (`status` is in the issued/operational bucket
  and `expiry_date` is in the future).
- Unknown permit number → `200` with `"valid": false, "status": "not_found"` (a
  verification "no" is a valid answer, not an error).
- Implementation delegates to `findPublicPermitByNumber()` (`lib/permit/public-permit-query.ts`),
  which already handles permit-registry fallback, child permits of bulk parents, and
  coordinate extraction — identical behaviour to the public QR-verification page.
- Holder name included (it is already public on the QR verification page); **no**
  contact details, no coordinates.

#### `GET /api/v1/permits/{permit_number}`  *(scope `permits:read`)*

Full public record for one permit — same shape the public registry page shows:
identification, status, validity window, water source, authorised activity, location,
parent/child permit links. 404 (`NOT_FOUND`) when neither `permits` nor `permit_registry`
has it.

#### `GET /api/v1/permits?q=&province=&district=&sector=&water_source=&purpose=&status=&limit=&offset=`  *(scope `permits:read`)*

Registry search. Reuses the zod filter set from `app/api/public/permit-registry/route.ts`
(`q, province, district, sector, water_source, purpose, limit≤200, offset`) plus a
`status` filter. Returns `{ data: [...], meta: { total, limit, offset } }`.

#### `GET /api/v1/statistics/summary`  *(scope `stats:read`)*

The machine-readable Water Use Dashboard. Returns the **same cached payload** the public
dashboard page renders (`app/api/public/water-use-dashboard/route.ts` → `getCachedDashboard()`),
guaranteeing agency numbers always reconcile with the public dashboard:

```json
{
  "data": {
    "totals": { "total": 4812, "operational": 3901, "expired": 640, "cancelled": 71, "expiringSoon": 200 },
    "byActivity":   [ { "key": "industrial",  "label": "Industrial",  "count": 1204, "percentage": 25.0 }, ... ],
    "byDistrict":   [ { "key": "Gasabo",      "label": "Gasabo",     "count":  512, "percentage": 10.6 }, ... ],
    "byCatchment":  [ { "key": "NYB",         "label": "Nyabarongo", "count": 1830, "percentage": 38.0 }, ... ],
    "catchmentAttribution": { "fromCoordinates": 4410, "estimatedFromLocation": 302, "unattributed": 100 }
  },
  "meta": { "cached": true }
}
```

- Aggregate counts only — no permit holder, permit number, contact, or precise location
  (the dashboard route's own documented guarantee, inherited verbatim).
- Served from the same 5-minute `unstable_cache`; agencies cannot use this endpoint as a
  registry-dumping workaround.
- Convenience variant (same scope, same cached payload, sliced server-side):
  `GET /api/v1/statistics/summary?by=activity|district|catchment` returns only that
  bucket array, for agencies that want one chart's worth of data.

### 4.5 Explicit non-goals (v1)

- No write endpoints. No document/file downloads. No water-use-report or inspection
  data. No per-holder history. No webhooks or OAuth flows (client-credentials can be a
  phase-2 addition if an agency ever needs per-user keys).

---

## 5. Database design

Three new tables. Plain SQL, **no enum types** (compatible with the prod migration
procedure: backup first, run via `sudo -u postgres psql`; statuses are `text` with
`CHECK` constraints). Sketch — final DDL written at implementation:

```sql
-- What agencies submit
CREATE TABLE api_access_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no          text UNIQUE NOT NULL,          -- e.g. APIREQ-2026-0001
  institution_name      text NOT NULL,
  institution_type      text NOT NULL,                 -- ministry | district | agency | parastatal | other
  tin                   text,
  contact_name          text NOT NULL,
  contact_email         text NOT NULL,                 -- official institutional email
  contact_phone         text,
  technical_email       text NOT NULL,                 -- who receives the key / expiry warnings
  purpose               text NOT NULL,                 -- free-text use case
  requested_scopes      text[] NOT NULL,               -- subset of the 3 scope strings; upper bound for grants
  requested_period_months int NOT NULL,                -- agency's ask; admin decides actual
  static_ip             text,                          -- optional, for possible future allowlisting
  accepted_terms_at     timestamptz NOT NULL DEFAULT now(),
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected')),
  review_notes          text,
  reviewed_by           uuid,
  reviewed_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- What RWB issues (credentials live here, never on the request)
CREATE TABLE api_access_grants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES api_access_requests(id),
  api_key_hash        text NOT NULL UNIQUE,            -- SHA-256 hex of the full key
  key_prefix          text NOT NULL,                   -- display/lookup: 'rwb_live_ab12cd34'
  scopes              text[] NOT NULL,                 -- MUST be ⊆ request.requested_scopes (enforced app-side)
  rate_limit_per_min  int NOT NULL DEFAULT 60,
  valid_from          timestamptz NOT NULL DEFAULT now(),
  valid_until         timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','revoked')),   -- expiry is computed, never stored
  granted_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz,
  total_requests      bigint NOT NULL DEFAULT 0
);
CREATE INDEX api_access_grants_key_prefix_idx ON api_access_grants (key_prefix);

-- One row per API call (with retention cleanup)
CREATE TABLE api_access_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grant_id    uuid NOT NULL REFERENCES api_access_grants(id),
  endpoint    text NOT NULL,
  status_code int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_access_logs_grant_created_idx ON api_access_logs (grant_id, created_at DESC);
```

### 5.1 Key handling

- **Format:** `rwb_live_<48 hex>` (prod) / `rwb_uat_<48 hex>` (UAT). The environment tag
  makes cross-environment key confusion impossible (prod-issued keys simply fail on UAT
  and vice versa).
- **Storage:** only the SHA-256 hash + an 8-char `key_prefix`. SHA-256 is the correct
  choice for 256-bit random keys (not human passwords — no bcrypt/argon2 needed).
  Lookup is `WHERE key_prefix = …`, then a constant-time comparison of hashes.
- **Display:** the plaintext key is shown **exactly once**, in the approval confirmation
  modal, with a copy button and a "store this now — it cannot be shown again" warning.
  A lost key = revoke + reissue (new row; old grant stays in the audit trail).

### 5.2 Expiry semantics

- `valid_until` is checked on **every call**: past it → `403 GRANT_EXPIRED`. Zero grace
  period (strict).
- Extension = admin updates `valid_until` (+ audit note). Revocation = `status='revoked'`
  (immediate). Reissue = new grant row linked to the same request; the old one stays
  revoked for history.
- Optional phase 2: 30-day expiry warning email to `technical_email`, plus a warning
  banner on the admin grants table when `valid_until < now() + 30 days`.

---

## 6. Request → review → grant lifecycle

### 6.1 What is exchanged (requestor ↔ grantor)

**The agency provides** (public form):

| Field | Notes |
|---|---|
| Institution name, type | ministry / district / agency / parastatal / other |
| TIN | optional but useful for identity resolution |
| Contact person, official email, phone | free-mail domains flagged in admin review |
| Technical contact email | receives the key + all lifecycle notices |
| Purpose / use case | free text; admin reads this before approving |
| **Endpoints requested** | multi-select from the §3 catalogue — the authoritative scope upper bound |
| Requested period | 6 / 12 / 24 months / custom (months) |
| Static IP | optional, for possible future allowlisting |
| Terms acceptance | data-use terms; mirrors contract Article 23 (Rwanda Law №058/2021 personal data protection) |

**RWB returns** (on approval): the API key (shown once), base URL, granted scopes,
rate limit, validity period, docs link — all in one confirmation screen + automated
email to the technical contact. On rejection: reason via review notes + email.

### 6.2 Flow

```
Agency submits form ──> api_access_requests (pending)   [reference_no returned on screen]
        │
Admin /admin → "API Access" tab → request queue → detail drawer
        ├── Approve: pick period (pre-filled from request, admin-adjustable),
        │            scopes = requested ones (only those are shown/tickable),
        │            rate limit, → key generated → shown once → email sent
        ├── Reject:  notes required → email sent
        └── (later) Extend valid_until · Revoke key · Reissue key · View usage
```

Request statuses are terminal (`pending → approved|rejected`); all post-approval
lifecycle lives on the **grant**, which keeps the audit trail clean (a request is what
was asked; grants are what was given, possibly several over time).

---

## 7. UI specification

### 7.1 Public — landing + `/api-access`

- **Landing page** (`app/page.tsx`): new `components/home/api-access-section.tsx`
  ("For government agencies" band with a "Request API access" CTA), or a link inside the
  existing `CTASection`. Landing page is 15 lines of section composition, so this is a
  purely additive component.
- **`/api-access`** (public page, no session):
  1. Intro band: what the API offers, who may apply (government institutions),
     link to the live docs.
  2. **Docs preview** — endpoint catalogue table (same data as §3) so agencies request
     the right things.
  3. **Request form** — fields per §6.1; the endpoints control is a dropdown whose
     items are checkboxes (each row: scope label + endpoint paths + one-line description);
     ≥1 required; submitting stores `requested_scopes`.
  4. Confirmation screen with the `APIREQ-2026-XXXX` reference number (the handle the
     agency quotes in any correspondence).
- Endpoint: `POST /api/public/api-access-requests` (zod-validated, honeypot field,
  duplicate-email soft-throttle). Route added to `PUBLIC_API_PREFIXES` in `middleware.ts`.

### 7.2 Admin — new "API Access" tab

`app/admin/page.tsx` currently renders 8 tabs in a `grid-cols-8` shadcn `TabsList`;
this becomes **9 columns** with an **"API Access"** tab. Two panels:

1. **Requests queue** — table of `api_access_requests` (status chips: pending /
   approved / rejected), filters by status, row → detail drawer showing the full
   submission (requested scopes highlighted).
   - **Approve** dialog: period selector (6/12/24/custom, pre-filled from the request),
     scope checkboxes — **only the requested scopes render, others cannot be granted**,
     rate-limit input → on confirm, generate key → show-once modal (copy button, base
     URL, docs link) → automated email to `technical_email`.
   - **Reject** dialog: notes required.
2. **Granted keys** — table of `api_access_grants`: key prefix, institution, scopes,
   rate limit, `valid_from → valid_until` (red when < 30 days remain), status,
   `last_used_at`, `total_requests`; row actions: extend, revoke, reissue, view recent
   log tail (from `api_access_logs`).

All admin mutations ride the existing admin session + activity-log machinery.

---

## 8. Middleware & auth integration

`middleware.ts` gates **every** `/api/*` behind a browser session unless the path is in
`PUBLIC_API_PREFIXES`. Middleware runs on the edge runtime (no `pg`), so it cannot do
the key DB-lookup itself. The integration:

- Add a new category alongside `PUBLIC_API_PREFIXES` / `STAFF_API_PREFIXES` /
  `ADMIN_API_PREFIXES`:

  ```ts
  // Server-to-server API with key auth. The session gate is skipped; the key
  // check happens in-route (edge middleware has no DB access).
  const KEY_API_PREFIXES = ['/api/v1/']
  ```

- Paths under `/api/v1/` skip the session gate but are **not** world-readable: every
  `/api/v1` route must call `requireApiKey(req, 'scope:string')` from
  `lib/api/api-key-auth.ts` (new) **before any other logic** — default-deny at the route
  level. The helper: extract key → prefix lookup → hash compare (constant-time) →
  status/expiry/scope checks → rate-limit window → return the grant or a typed error.
  It also updates `last_used_at` / `total_requests` (batched/throttled writes) and
  appends to `api_access_logs`.
- `/api/public/api-access-requests` joins `PUBLIC_API_PREFIXES` (the form is
  pre-account by definition); it is POST-only by route shape.

---

## 9. Security considerations

1. **Least data.** Endpoint payloads are frozen to §4.4 shapes; no contact details, no
   coordinates in `verify`; statistics are aggregate-only by construction.
2. **Scoped grants.** `grant.scopes ⊆ request.requested_scopes`, enforced in the
   approval UI and validated server-side at approval time.
3. **Hashed keys, show-once, prefix lookup, constant-time compare.**
4. **Rate limits per key** + the 5-minute statistics cache (pool protection).
5. **Audit:** every API call logged (grant, endpoint, status); every admin action
   (approve/reject/extend/revoke) goes through the existing activity-log machinery.
   `api_access_logs` retention job (e.g. delete > 90 days) keeps on-prem disk bounded.
6. **No error leakage:** API error messages never embed DB/schema text (same rule the
   existing public routes already follow).
7. **Abuse response:** revoke is immediate; the grants table shows `last_used_at` so a
   leaked key is visible and killable in one click.
8. **Residual risk accepted for v1:** no IP allowlisting (collected but unenforced);
   no key rotation endpoint (reissue covers it). Both are cheap phase-2 additions if
   RWB IT wants them.

---

## 10. Rollout plan

1. **Branch:** feature branch off the **UAT branch**, per the project's
   cherry-pick-between-prod-and-UAT rule (never merge across — the branches carry
   intentional differences).
2. **Migration:** `sql/api_access.sql` — backup first, run via `sudo -u postgres psql`
   on the prod host; plain tables only (no enums → no transaction restriction issues).
3. **Build order** (each independently testable):
   1. `lib/api/api-key-auth.ts` + `requireApiKey` + the 3 `/api/v1` endpoints
      (testable immediately with a manually-inserted grant row).
   2. `/api/public/api-access-requests` + `/api-access` page + landing section.
   3. Admin "API Access" tab (queue, approve/reject, grants table, extend/revoke/reissue).
   4. Docs page `/api-access/docs` + `docs/api/API-GUIDE.md` (single source, contract
      Deliverable 5).
   5. `api_access_logs` retention job (cron/pg_cron or piggyback on an existing keep-alive).
4. **Verify on UAT:** full lifecycle — submit form → approve → call all 3 endpoint
   groups with the key → confirm scope trimming, expiry (set a 1-day grant), revocation,
   rate limit → then cherry-pick to **prod** (auto-deploys within ~2 min of push).

### Phase 2 (optional, later)

Expiry-warning emails (30/7 days) · usage analytics chart on the admin tab · IP
allowlisting for select agencies · OAuth2 client-credentials · a self-service portal
where agencies renew their own keys within admin-set bounds.

---

## 11. Open decisions (for RWB sign-off)

1. **List-endpoint data scope** — default: mirror the public permit registry exactly
   (same rows, same filters). Confirm nothing beyond it (e.g. only operational permits)
   is wanted.
2. **Period presets** — 6 / 12 / 24 months + custom: acceptable?
3. **Approval email** — reuse the existing Pindo/email notification infra for
   approve/reject notices to `technical_email`?
4. **Holder name in `verify`** — included by default (already public on the QR page);
   confirm RWB is comfortable with it being available to verified agencies.
