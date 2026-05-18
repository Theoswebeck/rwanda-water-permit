# CLAUDE.md — waterpermit (Rwanda Water Resources Board)

This file provides persistent context for Claude Code sessions working on this project.

---

## Session Start Protocol

Before grepping or reading files, always search claude-mem for prior context using relevant keywords:

```
mcp__plugin_claude-mem_mcp-search__search(query="<keywords>", limit=15)
```

Use the same 3-step workflow: search → timeline (if needed) → get_observations for relevant IDs. Only then proceed to grep/read files. This surfaces past decisions, bugs, and architecture notes that would otherwise require re-discovery.

---

## Project Overview

**Name:** Water Permit Application System
**Client:** Rwanda Water Resources Board (RWB)
**Stack:** Next.js (TypeScript), PostgreSQL (self-hosted), Supabase (auth/storage), Railway (deployment)
**Live URL:** http://waterpermit.rwb.rw/
**Server:** `qtgentil@10.10.82.199` (Linux, on-premise RWB infrastructure)
**Payment:** IremboPay (Rwandan payment gateway)
**SMS:** Pindo (`PINDO_API_KEY`, sender name `RWB`)

---

## Architecture Summary

- `app/` — Next.js App Router pages and API routes
- `lib/` — shared server-side logic (auth, db, notifications, PDF, etc.)
- `lib/notifications/` — all email + SMS notification helpers
- `lib/db/postgres.ts` — PostgreSQL query helper
- `lib/auth/` — session, password, roles
- `database/` — migration SQL files
- `supabase/` — Supabase config

---

## Email — Current Implementation (as of 2026-03-27)

### Decision
Resend (third-party SaaS) was removed due to **data sovereignty requirements** — RWB is a government institution and must control all data flows.

### Chosen Approach: Nodemailer + Gmail SMTP
- **File:** `lib/notifications/smtp-email.ts` (replaces `resend-email.ts`)
- **Transport:** `smtp.gmail.com:587` (STARTTLS)
- **Sender account:** `rwandawaterresourcesboard@gmail.com` (RWB-owned Gmail account)
- **Display name:** `Rwanda Water Resources Board`
- **Reply-To:** `notification.permit@rwb.rw`
- **App Password:** stored in `SMTP_PASS` env var

### Environment Variables (email)
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=rwandawaterresourcesboard@gmail.com
SMTP_PASS=<google-app-password>
EMAIL_FROM=Rwanda Water Resources Board <rwandawaterresourcesboard@gmail.com>
EMAIL_REPLY_TO=notification.permit@rwb.rw
```

### Files that send email
| File | Purpose |
|------|---------|
| `lib/notifications/smtp-email.ts` | Core mailer — `sendSmtpEmail()` |
| `app/api/auth/email/send-code/route.ts` | OTP codes for signup / password reset |
| `app/api/approver/final-decision/route.ts` | Approve / reject / return notifications |
| `lib/notifications/submission.ts` | Application submitted notification |
| `lib/notifications/transfer-pending-terms.ts` | Transfer pending terms notification |
| `app/api/transfers/create/route.ts` | Transfer creation notification |
| `app/api/admin/users/create/route.ts` | Staff account welcome email |

### Future migration to on-prem Postfix
When DNS is ready (SPF + PTR + DKIM for `rwb.rw`):
1. Install Postfix on `10.10.82.199`
2. Change env vars only — no code changes:
   ```
   SMTP_HOST=localhost
   SMTP_PORT=25
   SMTP_USER=
   SMTP_PASS=
   EMAIL_FROM=Rwanda Water Resources Board <notification.permit@rwb.rw>
   EMAIL_REPLY_TO=notification.permit@rwb.rw
   ```

### Design spec
Full spec: `docs/superpowers/specs/2026-03-27-self-hosted-email-design.md`

---

## SMS — Current Implementation

- **Provider:** Pindo (Rwandan SMS gateway — data stays in Rwanda)
- **Client:** `lib/pindo-client.ts`
- **Env vars:** `PINDO_API_KEY`, `PINDO_SENDER_NAME` (default: `RWB`)
- **Dev mode:** `PINDO_DEVELOPMENT_MODE=true` skips actual SMS sends
- **Phone validation:** only valid Rwandan numbers (`+250...`) are sent SMS
- SMS is sent alongside email for every major notification event

---

## Notifications Pattern

Every notification follows this pattern (idempotent):
1. Check if notification already sent (query `public.notifications` by `application_id` + `title`)
2. Insert a lock row (`email_sent=false, sms_sent=false`)
3. Send email via `sendSmtpEmail()`
4. Send SMS via `PindoClient.sendSMS()`
5. Update lock row with delivery results

This prevents duplicate sends on retries.

---

## Key Environment Variables

```
# Database
DATABASE_URL=

# Auth
SESSION_SECRET=
NEXT_PUBLIC_APP_URL=

# Email (Nodemailer/Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=nizzogentl1@gmail.com
SMTP_PASS=
EMAIL_FROM=Rwanda Water Resources Board <nizzogentl1@gmail.com>
EMAIL_REPLY_TO=notification.permit@rwb.rw
SUPPORT_EMAIL=info@rwb.rw
ORG_NAME=Rwanda Water Resources Board

# SMS (Pindo)
PINDO_API_KEY=
PINDO_SENDER_NAME=RWB
PINDO_DEVELOPMENT_MODE=false

# Payment (IremboPay)
IREMBOPAY_API_KEY=
IREMBOPAY_SECRET=

# Dev overrides
NODE_ENV=production
EMAIL_DEV_MODE=false
```

---

## Deployment

- **Platform:** Railway (`railway.toml`)
- **Server:** Also runs on `qtgentil@10.10.82.199` (on-prem RWB Linux server)
- **Health check:** `GET /api/health`
- **Build:** Nixpacks

### Branch → environment mapping

| Branch                                     | Environment |
|--------------------------------------------|-------------|
| `chore/stage-unstaged-2026-03-01`          | **production** |
| `chore/stage-unstaged-2026-03-01-uat`      | **staging**    |

Despite the names, `-uat` is staging and the non-`-uat` branch is prod. Push fixes that need to reach production to **both** branches.

**Updating staging (UAT):** The two branches diverge over time, so a direct push from prod to UAT will be rejected (non-fast-forward). Always cherry-pick onto UAT:

```bash
git push origin chore/stage-unstaged-2026-03-01          # push prod first
git fetch origin chore/stage-unstaged-2026-03-01-uat
git checkout chore/stage-unstaged-2026-03-01-uat
git cherry-pick <commit-sha>
git push origin chore/stage-unstaged-2026-03-01-uat
git checkout chore/stage-unstaged-2026-03-01              # return to prod branch
```

---

## Important Constraints

- RWB is a **government institution** — data sovereignty is a hard requirement
- All data must remain on RWB-controlled infrastructure where possible
- Third-party SaaS (Resend, etc.) is not acceptable for production
- DNS changes require coordination with multiple stakeholders — factor this into any work involving DNS records
- Pindo is the approved SMS provider (Rwandan, data stays in Rwanda)
