# Self-Hosted Email — Design Spec
**Date:** 2026-03-27
**Project:** waterpermit (Rwanda Water Resources Board)
**Status:** Approved — ready for implementation

---

## Context

RWB is a government institution. Data sovereignty requires that transactional email notifications not depend on third-party SaaS providers (Resend was in use). All email must be sent through RWB-controlled infrastructure.

**Immediate solution:** Replace Resend with Nodemailer connected to an RWB-owned Gmail account via Gmail SMTP App Password. This is the interim approach while DNS coordination for `rwb.rw` is in progress.

**Future migration path:** Once SPF/DKIM/PTR DNS records are configured for `rwb.rw`, swap Nodemailer to point at a self-hosted Postfix instance on `10.10.82.199` — the same Linux server hosting `waterpermit.rwb.rw`. Only env vars change; no code changes required.

---

## Confirmed Details

| Item | Value |
|------|-------|
| RWB Gmail sender account | `nizzogentl1@gmail.com` |
| Display name | `Rwanda Water Resources Board` |
| Reply-To | `notification.permit@rwb.rw` |
| Gmail App Password | configured via `SMTP_PASS` env var |
| SMTP Host | `smtp.gmail.com` |
| SMTP Port | `587` (STARTTLS) |
| RWB on-prem server | `qtgentil@10.10.82.199` (serves `waterpermit.rwb.rw`) |
| Test verified | Email delivered to `nourumuneza@gmail.com` ✓ |

---

## Architecture

All email sending routes through a single helper `lib/notifications/smtp-email.ts` (replacing `resend-email.ts`). Callers that previously imported `sendResendEmail` import `sendSmtpEmail` instead — same signature, no logic changes in callers.

```
Callers                                         Transport
──────────────────────────────────────          ──────────────────────────
app/api/auth/email/send-code/route.ts  ──┐
app/api/approver/final-decision/route.ts─┤
lib/notifications/submission.ts        ─┤──▶  lib/notifications/smtp-email.ts
lib/notifications/transfer-pending-    ─┤         └── Nodemailer
  terms.ts                              ─┤              └── smtp.gmail.com:587
app/api/transfers/create/route.ts      ─┤                    └── nizzogentl1@gmail.com
app/api/admin/users/create/route.ts    ─┘                         (App Password)
```

---

## Environment Variables

**Remove:**
```
RESEND_API_KEY
EMAIL_FROM   (repurposed — see below)
```

**Add:**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=nizzogentl1@gmail.com
SMTP_PASS=<google-app-password>
EMAIL_FROM=Rwanda Water Resources Board <nizzogentl1@gmail.com>
EMAIL_REPLY_TO=notification.permit@rwb.rw
```

> `EMAIL_FROM` is reused but its value changes from the old personal address to the RWB Gmail account with display name.

---

## File Changes

| File | Action |
|------|--------|
| `lib/notifications/smtp-email.ts` | **Create** — Nodemailer transport, exports `sendSmtpEmail()` and `renderAppEmailHtml()` |
| `lib/notifications/resend-email.ts` | **Delete** — replaced by smtp-email.ts |
| `app/api/auth/email/send-code/route.ts` | **Modify** — remove inline Resend fetch, import `sendSmtpEmail` |
| `app/api/approver/final-decision/route.ts` | **Modify** — swap `sendResendEmail` → `sendSmtpEmail` |
| `lib/notifications/submission.ts` | **Modify** — swap `sendResendEmail` → `sendSmtpEmail` |
| `lib/notifications/transfer-pending-terms.ts` | **Modify** — swap `sendResendEmail` → `sendSmtpEmail` |
| `app/api/transfers/create/route.ts` | **Modify** — swap `sendResendEmail` → `sendSmtpEmail` |
| `package.json` | **Modify** — add `nodemailer`, `@types/nodemailer`; remove `resend` if present |
| `env.template` | **Modify** — replace Resend vars with SMTP vars |

---

## `smtp-email.ts` Behaviour

```typescript
// Exported API (drop-in replacement for resend-email.ts)
export function renderAppEmailHtml(params: { title: string; text: string }): string
export async function sendSmtpEmail(params: {
  to: string
  subject: string
  title: string
  text: string
}): Promise<{ delivered: boolean; skipped: boolean }>
```

- Reads `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_REPLY_TO` from env
- If `SMTP_USER` is not set and `NODE_ENV !== 'production'`, logs a warning and returns `{ delivered: false, skipped: true }` (same dev-mode behaviour as the old Resend helper)
- In production with no SMTP config, throws `Error('Email provider not configured.')`
- Sets `replyTo: EMAIL_REPLY_TO` on every outbound message
- Reuses `renderAppEmailHtml` — the HTML template is unchanged

---

## `send-code/route.ts` Behaviour

This route currently calls Resend inline (not via the shared helper). After the change:
- Import `sendSmtpEmail` from `smtp-email.ts`
- Remove the raw `fetch('https://api.resend.com/emails', ...)` block
- The verification code OTP email uses the same HTML template structure
- Dev mode fallback (`devCode` in response) is preserved

---

## Future Migration to On-Prem Postfix

When the DNS team has configured SPF + PTR + DKIM for `rwb.rw`:

1. Install Postfix on `10.10.82.199`
2. Update env vars on the server:
   ```
   SMTP_HOST=localhost
   SMTP_PORT=25
   SMTP_USER=   (empty — Postfix on localhost needs no auth)
   SMTP_PASS=   (empty)
   EMAIL_FROM=Rwanda Water Resources Board <notification.permit@rwb.rw>
   EMAIL_REPLY_TO=notification.permit@rwb.rw
   ```
3. No code changes required.

---

## Testing Plan

1. Unit: mock Nodemailer transport, assert `sendSmtpEmail` calls `transporter.sendMail` with correct fields
2. Integration (dev): set `EMAIL_DEV_MODE=true`, confirm `skipped: true` returned without network call
3. Manual smoke test: trigger signup OTP email, confirm delivery to real inbox
4. Manual smoke test: submit a test application, confirm submission notification delivered

---

## Out of Scope

- Inbound email (receiving) — not needed
- Email queuing / retry beyond existing notification lock pattern
- HTML template redesign
- Moving away from Gmail SMTP (deferred until DNS is ready)
