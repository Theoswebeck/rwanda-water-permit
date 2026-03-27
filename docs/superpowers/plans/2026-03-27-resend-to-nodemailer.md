# Resend → Nodemailer (Gmail SMTP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all Resend API calls with Nodemailer connecting to Gmail SMTP (`smtp.gmail.com:587`) using an RWB Gmail App Password, preserving all existing email behaviour.

**Architecture:** A single new file `lib/notifications/smtp-email.ts` exports `sendSmtpEmail()` and `renderAppEmailHtml()` as drop-in replacements for the old `resend-email.ts`. Four files that imported `sendResendEmail` are updated to import `sendSmtpEmail`. Two files that called the Resend HTTP API inline are refactored to use `sendSmtpEmail`. The old `resend-email.ts` is deleted.

**Tech Stack:** Next.js 14 (TypeScript), Nodemailer 6.x, Gmail SMTP with App Password, existing PostgreSQL notification lock pattern.

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| **Create** | `lib/notifications/smtp-email.ts` | New mailer — Nodemailer transport, exports `sendSmtpEmail` + `renderAppEmailHtml` |
| **Delete** | `lib/notifications/resend-email.ts` | Replaced entirely |
| **Modify** | `lib/notifications/submission.ts` | Import swap: `sendResendEmail` → `sendSmtpEmail` |
| **Modify** | `lib/notifications/transfer-pending-terms.ts` | Import swap: `sendResendEmail` → `sendSmtpEmail` |
| **Modify** | `app/api/approver/final-decision/route.ts` | Import swap: `sendResendEmail` → `sendSmtpEmail` |
| **Modify** | `app/api/transfers/create/route.ts` | Import swap: `sendResendEmail` → `sendSmtpEmail` |
| **Modify** | `app/api/auth/email/send-code/route.ts` | Remove inline Resend fetch, use `sendSmtpEmail` |
| **Modify** | `app/api/admin/users/create/route.ts` | Remove inline Resend fetch, use `sendSmtpEmail` |
| **Modify** | `env.template` | Swap Resend vars for SMTP vars |
| **Modify** | `package.json` | Add `nodemailer` + `@types/nodemailer` |

---

## Task 1: Install Nodemailer

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
cd /Users/nourumuneza/go/src/waterpermit
npm install nodemailer
npm install --save-dev @types/nodemailer
```

Expected output: lines containing `added ... packages` with no errors.

- [ ] **Step 2: Verify types are available**

```bash
node -e "const nm = require('nodemailer'); console.log('ok', typeof nm.createTransport)"
```

Expected output: `ok function`

---

## Task 2: Create `lib/notifications/smtp-email.ts`

**Files:**
- Create: `lib/notifications/smtp-email.ts`

- [ ] **Step 1: Create the file**

Create `/Users/nourumuneza/go/src/waterpermit/lib/notifications/smtp-email.ts` with this exact content:

```typescript
import nodemailer from 'nodemailer'

type SendSmtpEmailParams = {
  to: string
  subject: string
  title: string
  text: string
}

export function renderAppEmailHtml(params: { title: string; text: string }) {
  const escaped = params.text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')

  const orgName = process.env.ORG_NAME || 'Rwanda Water Resources Board'

  return `
    <div style="font-family:Inter,system-ui,Arial,sans-serif;line-height:1.6;max-width:680px;margin:0 auto;padding:24px">
      <div style="text-align:center;margin-bottom:20px">
        <h1 style="color:#111827;margin:0">${orgName}</h1>
        <h2 style="color:#374151;margin:10px 0">${params.title}</h2>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:18px;color:#111827">
        ${escaped}
      </div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#6b7280;font-size:12px;text-align:center;margin:0">${orgName} - Water Permit Application System</p>
    </div>
  `
}

export async function sendSmtpEmail(params: SendSmtpEmailParams) {
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10)
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const fromEmail = process.env.EMAIL_FROM || smtpUser || ''
  const replyTo = process.env.EMAIL_REPLY_TO
  const isDev = process.env.NODE_ENV !== 'production' || process.env.EMAIL_DEV_MODE === 'true'

  if (!smtpUser || !smtpPass) {
    if (isDev) {
      console.warn('⚠️ SMTP not configured; skipping email send in dev mode.')
      return { delivered: false as const, skipped: true as const }
    }
    throw new Error('Email provider not configured. Set SMTP_USER and SMTP_PASS.')
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost || 'smtp.gmail.com',
    port: smtpPort,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  })

  const html = renderAppEmailHtml({ title: params.title, text: params.text })

  await transporter.sendMail({
    from: fromEmail,
    replyTo: replyTo || undefined,
    to: params.to,
    subject: params.subject,
    html,
  })

  return { delivered: true as const, skipped: false as const }
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/nourumuneza/go/src/waterpermit
npx tsc --noEmit --project tsconfig.json 2>&1 | grep smtp-email
```

Expected: no output (no errors in the new file).

---

## Task 3: Migrate `lib/notifications/submission.ts`

**Files:**
- Modify: `lib/notifications/submission.ts:4`

- [ ] **Step 1: Swap the import**

In `lib/notifications/submission.ts`, replace line 4:

```typescript
import { sendResendEmail } from '@/lib/notifications/resend-email'
```

with:

```typescript
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'
```

- [ ] **Step 2: Update the call site (line ~147)**

In the same file, replace:

```typescript
      const res = await sendResendEmail({
```

with:

```typescript
      const res = await sendSmtpEmail({
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/nourumuneza/go/src/waterpermit
npx tsc --noEmit 2>&1 | grep submission
```

Expected: no output.

---

## Task 4: Migrate `lib/notifications/transfer-pending-terms.ts`

**Files:**
- Modify: `lib/notifications/transfer-pending-terms.ts:3`

- [ ] **Step 1: Swap the import**

In `lib/notifications/transfer-pending-terms.ts`, replace line 3:

```typescript
import { sendResendEmail } from '@/lib/notifications/resend-email'
```

with:

```typescript
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'
```

- [ ] **Step 2: Update the call site (~line 354)**

In the same file, replace:

```typescript
        const emailRes = await sendResendEmail({ to: transfereeEmail, subject, title, text })
```

with:

```typescript
        const emailRes = await sendSmtpEmail({ to: transfereeEmail, subject, title, text })
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/nourumuneza/go/src/waterpermit
npx tsc --noEmit 2>&1 | grep transfer-pending
```

Expected: no output.

---

## Task 5: Migrate `app/api/approver/final-decision/route.ts`

**Files:**
- Modify: `app/api/approver/final-decision/route.ts:5`

- [ ] **Step 1: Swap the import**

In `app/api/approver/final-decision/route.ts`, replace:

```typescript
import { sendResendEmail } from '@/lib/notifications/resend-email'
```

with:

```typescript
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'
```

- [ ] **Step 2: Update all call sites**

In the same file, replace every occurrence of `sendResendEmail(` with `sendSmtpEmail(`:

```bash
grep -n "sendResendEmail" /Users/nourumuneza/go/src/waterpermit/app/api/approver/final-decision/route.ts
```

For each line found, change `sendResendEmail` → `sendSmtpEmail`. The function signatures are identical so no other changes are needed.

- [ ] **Step 3: Type-check**

```bash
cd /Users/nourumuneza/go/src/waterpermit
npx tsc --noEmit 2>&1 | grep final-decision
```

Expected: no output.

---

## Task 6: Migrate `app/api/transfers/create/route.ts`

**Files:**
- Modify: `app/api/transfers/create/route.ts:3`

- [ ] **Step 1: Swap the import**

In `app/api/transfers/create/route.ts`, replace:

```typescript
import { sendResendEmail } from '@/lib/notifications/resend-email'
```

with:

```typescript
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'
```

- [ ] **Step 2: Update the call site (~line 157)**

In the same file, replace:

```typescript
          await sendResendEmail({ to: transferorEmail, subject, title, text })
```

with:

```typescript
          await sendSmtpEmail({ to: transferorEmail, subject, title, text })
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/nourumuneza/go/src/waterpermit
npx tsc --noEmit 2>&1 | grep transfers
```

Expected: no output.

---

## Task 7: Migrate `app/api/auth/email/send-code/route.ts`

This file calls Resend inline — no shared helper. Replace with `sendSmtpEmail`.

**Files:**
- Modify: `app/api/auth/email/send-code/route.ts`

- [ ] **Step 1: Add import at top of file**

Add this import after the existing imports (after `import { setDevEmailCode } from '../dev-store'`):

```typescript
import { sendSmtpEmail } from '@/lib/notifications/smtp-email'
```

- [ ] **Step 2: Replace the Resend block**

Remove this entire block (lines ~51–136):

```typescript
    // Send the email via Resend if configured
    const resendKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.EMAIL_FROM || 'nouru@menlohq.com'

    if (resendKey) {
      const isPasswordReset = String(purpose) === 'password_reset'
      // ... all the way through ...
    }

    // No provider configured
    if (isDev) {
      return NextResponse.json({ ... deliveryProvider: 'none' ... })
    }
    return NextResponse.json({ success: false, message: 'Email provider not configured. Set RESEND_API_KEY.' }, { status: 500 })
```

Replace with:

```typescript
    const isPasswordReset = String(purpose) === 'password_reset'
    const subject = isPasswordReset
      ? 'Your password reset code - Rwanda Water Resources Board'
      : 'Your verification code - Rwanda Water Resources Board'
    const heading = isPasswordReset ? 'Password Reset' : 'Email Verification'
    const bodyText = isPasswordReset
      ? 'Use this code to reset your password:'
      : 'Use this code to verify your email address:'
    const ignoreText = isPasswordReset
      ? "If you didn't request a password reset, you can safely ignore this email."
      : "If you didn't request this verification, you can safely ignore this email."

    const orgName = process.env.ORG_NAME || 'Rwanda Water Resources Board'
    const html = `
      <div style="font-family:Inter,system-ui,Arial,sans-serif;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">
        <div style="text-align:center;margin-bottom:30px">
          <h1 style="color:#1f2937;margin:0">${orgName}</h1>
          <h2 style="color:#4b5563;margin:10px 0">${heading}</h2>
        </div>
        <p style="font-size:16px;color:#374151">${bodyText}</p>
        <div style="text-align:center;margin:30px 0">
          <div style="font-size:36px;font-weight:700;letter-spacing:8px;background:#f3f4f6;color:#1f2937;padding:20px;border-radius:12px;display:inline-block;border:2px solid #e5e7eb">${code}</div>
        </div>
        <p style="color:#6b7280;font-size:14px;margin:20px 0">This code expires in 15 minutes.</p>
        <p style="color:#6b7280;font-size:14px">${ignoreText}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0">
        <p style="color:#9ca3af;font-size:12px;text-align:center">${orgName} - Water Permit Application System</p>
      </div>`

    try {
      const smtpUser = process.env.SMTP_USER
      if (!smtpUser && isDev) {
        return NextResponse.json({
          success: true,
          message: 'SMTP not configured. Use dev code printed to server terminal.',
          delivered: false,
          deliveryProvider: 'none',
          devCode: code,
        })
      }

      // sendSmtpEmail uses renderAppEmailHtml internally, but this route needs
      // its own OTP-specific HTML, so we use nodemailer directly via the helper
      // by passing title/text — however the OTP display requires custom HTML.
      // Instead, call nodemailer directly here.
      const nodemailer = await import('nodemailer')
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false,
        auth: { user: smtpUser, pass: process.env.SMTP_PASS },
      })
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || smtpUser,
        replyTo: process.env.EMAIL_REPLY_TO || undefined,
        to: email,
        subject,
        html,
      })

      return NextResponse.json({
        success: true,
        message: 'Verification email sent successfully!',
        delivered: true,
        deliveryProvider: 'smtp',
        devCode: isDev ? code : undefined,
      })
    } catch (emailErr) {
      console.error('❌ SMTP send failed:', emailErr)
      return NextResponse.json({
        success: true,
        message: `Email sending failed but code created. ${isDev ? 'Use devCode below.' : 'Try resending.'}`,
        delivered: false,
        deliveryProvider: 'smtp',
        devCode: isDev ? code : undefined,
      })
    }
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/nourumuneza/go/src/waterpermit
npx tsc --noEmit 2>&1 | grep send-code
```

Expected: no output.

---

## Task 8: Migrate `app/api/admin/users/create/route.ts`

This file calls Resend inline with custom staff-invite HTML.

**Files:**
- Modify: `app/api/admin/users/create/route.ts`

- [ ] **Step 1: Remove the Resend env var reads and replace the block**

Find and remove these lines near the top of the `POST` handler (~line 158):

```typescript
    // Send invite email via Resend
    const resendKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.EMAIL_FROM || 'nouru@menlohq.com'
    const loginUrl = 'https://waterpermit.rwb.rw/'
    const isDev = process.env.NODE_ENV !== 'production'
```

Replace with:

```typescript
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://waterpermit.rwb.rw/'
    const isDev = process.env.NODE_ENV !== 'production'
```

- [ ] **Step 2: Replace the Resend send block**

Remove the `if (resendKey) { ... } else { emailError = 'RESEND_API_KEY not configured' }` block (~lines 166–248) and replace with:

```typescript
    try {
      const smtpUser = process.env.SMTP_USER
      const smtpPass = process.env.SMTP_PASS
      if (!smtpUser || !smtpPass) {
        emailError = 'SMTP not configured'
        console.warn('⚠️ SMTP_USER/SMTP_PASS not configured, skipping invite email')
      } else {
        const displayName = first_name ? `${first_name}` : 'Staff Member'
        const rolePretty = role.charAt(0).toUpperCase() + role.slice(1)
        const orgName = process.env.ORG_NAME || 'Rwanda Water Resources Board'

        const html = `
          <div style="font-family:Inter,system-ui,Arial,sans-serif;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">
            <div style="text-align:center;margin-bottom:30px">
              <h1 style="color:#1f2937;margin:0">${orgName}</h1>
              <h2 style="color:#4b5563;margin:10px 0">Staff Account Created</h2>
            </div>
            <p style="font-size:16px;color:#374151">Hello ${displayName},</p>
            <p style="font-size:16px;color:#374151">
              An account has been created for you on the Rwanda Water Permit Portal as a <strong>${rolePretty}</strong>.
            </p>
            <div style="background:#f3f4f6;border-radius:12px;padding:20px;margin:20px 0;border:2px solid #e5e7eb">
              <p style="margin:0 0 10px 0;font-size:14px;color:#6b7280"><strong>Your Login Credentials:</strong></p>
              <p style="margin:5px 0;font-size:16px;color:#1f2937"><strong>Email:</strong> ${emailLower}</p>
              <p style="margin:5px 0;font-size:16px;color:#1f2937"><strong>Temporary Password:</strong></p>
              <div style="font-size:18px;font-weight:700;letter-spacing:2px;background:#fff;color:#1f2937;padding:15px;border-radius:8px;text-align:center;font-family:monospace;margin-top:10px">
                ${tempPassword}
              </div>
            </div>
            <div style="text-align:center;margin:30px 0">
              <a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
                Login to Portal
              </a>
            </div>
            <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:15px;margin:20px 0">
              <p style="margin:0;font-size:14px;color:#92400e">
                ⚠️ <strong>Important:</strong> You will be required to change your password on first login. Please choose a strong, unique password.
              </p>
            </div>
            <p style="color:#6b7280;font-size:14px">
              If you did not expect this account, please contact the RWB administrator.
            </p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0">
            <p style="color:#9ca3af;font-size:12px;text-align:center">${orgName} - Water Permit Application System</p>
          </div>`

        console.log('📤 Sending invite email to:', emailLower)
        const nodemailer = await import('nodemailer')
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          secure: false,
          auth: { user: smtpUser, pass: smtpPass },
        })
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || smtpUser,
          replyTo: process.env.EMAIL_REPLY_TO || undefined,
          to: emailLower,
          subject: `Your ${orgName} Staff Account`,
          html,
        })
        emailSent = true
        console.log('✅ Invite email sent successfully')
      }
    } catch (fetchErr) {
      emailError = String(fetchErr)
      console.error('❌ SMTP send failed:', fetchErr)
    }
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/nourumuneza/go/src/waterpermit
npx tsc --noEmit 2>&1 | grep "users/create"
```

Expected: no output.

---

## Task 9: Delete `resend-email.ts` and full type-check

**Files:**
- Delete: `lib/notifications/resend-email.ts`

- [ ] **Step 1: Verify no remaining imports of resend-email**

```bash
grep -r "resend-email\|sendResendEmail\|RESEND_API_KEY\|api.resend.com" \
  /Users/nourumuneza/go/src/waterpermit \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules
```

Expected: no output. If any files still import from `resend-email`, fix them before deleting.

- [ ] **Step 2: Delete the file**

```bash
rm /Users/nourumuneza/go/src/waterpermit/lib/notifications/resend-email.ts
```

- [ ] **Step 3: Full type-check**

```bash
cd /Users/nourumuneza/go/src/waterpermit
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Build check**

```bash
cd /Users/nourumuneza/go/src/waterpermit
npm run build 2>&1 | tail -20
```

Expected: build completes with no errors (warnings about `any` are acceptable).

---

## Task 10: Update `env.template`

**Files:**
- Modify: `env.template`

- [ ] **Step 1: Replace Resend block**

In `env.template`, find:

```
# Email (Resend) - used for application status updates & verification emails
RESEND_API_KEY=your_resend_api_key_here
EMAIL_FROM=nouru@menlohq.com
SUPPORT_EMAIL=contact@rwb.rw
```

Replace with:

```
# Email (Nodemailer / Gmail SMTP) - used for application status updates & verification emails
# Interim: uses RWB Gmail account. Future: swap SMTP_HOST/PORT to on-prem Postfix once DNS is ready.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=nizzogentl1@gmail.com
SMTP_PASS=your_gmail_app_password_here
EMAIL_FROM=Rwanda Water Resources Board <nizzogentl1@gmail.com>
EMAIL_REPLY_TO=notification.permit@rwb.rw
SUPPORT_EMAIL=info@rwb.rw
ORG_NAME=Rwanda Water Resources Board
```

---

## Task 11: Commit

- [ ] **Step 1: Stage all changes**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add \
  lib/notifications/smtp-email.ts \
  lib/notifications/submission.ts \
  lib/notifications/transfer-pending-terms.ts \
  app/api/approver/final-decision/route.ts \
  app/api/transfers/create/route.ts \
  app/api/auth/email/send-code/route.ts \
  app/api/admin/users/create/route.ts \
  env.template \
  package.json \
  package-lock.json \
  docs/superpowers/plans/2026-03-27-resend-to-nodemailer.md
git rm lib/notifications/resend-email.ts
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: replace Resend with Nodemailer + Gmail SMTP

Data sovereignty requirement: RWB is a government institution and must
not route transactional email through third-party SaaS providers.

- Create lib/notifications/smtp-email.ts (Nodemailer transport, drops
  in as replacement for resend-email.ts — same exported API)
- Delete lib/notifications/resend-email.ts
- Migrate all callers: submission, transfer-pending-terms,
  final-decision, transfers/create
- Refactor inline Resend fetches in send-code and admin/users/create
  to use Nodemailer directly (these routes have custom HTML)
- Update env.template: RESEND_API_KEY → SMTP_HOST/PORT/USER/PASS +
  EMAIL_FROM/EMAIL_REPLY_TO
- Sender: nizzogentl1@gmail.com (RWB Gmail), reply-to: notification.permit@rwb.rw
- Migration path: swap SMTP_HOST=localhost when on-prem Postfix is ready

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push**

```bash
git push origin chore/stage-unstaged-2026-03-01
```

---

## Manual Smoke Tests (post-deploy)

After deploying with the new env vars set on the server:

1. **OTP email:** Go to the signup page, enter a real email, click Send Code — confirm the 6-digit code email arrives.
2. **Submission notification:** Submit a test application — confirm the applicant receives the "Application Submitted" email.
3. **Staff invite:** Create a staff user via Admin → confirm the invite email with temp password arrives.
4. **Approval notification:** Approve a test application — confirm the "Application Approved" email + SMS arrive.

---

## Future: Switch to On-Prem Postfix

When `rwb.rw` DNS records (SPF + PTR + DKIM) are configured, update env vars on `10.10.82.199`:

```env
SMTP_HOST=localhost
SMTP_PORT=25
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=Rwanda Water Resources Board <notification.permit@rwb.rw>
EMAIL_REPLY_TO=notification.permit@rwb.rw
```

No code changes required.
