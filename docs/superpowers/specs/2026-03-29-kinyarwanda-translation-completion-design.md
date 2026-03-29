# Kinyarwanda Translation Completion — Design Spec

**Date:** 2026-03-29
**Project:** Rwanda Water Permit Portal (waterpermit.rwb.rw)
**Scope:** All applicant-facing pages

---

## Problem

The app has a working custom i18n system (`/messages/rw.json` + `translateText()` + `<Tx>`) and a `<LanguageSwitcher>` component. However:

1. The language toggle only appears on dashboard pages — not on home, login, register, or any public page.
2. The home page (hero, features, process, CTA sections) is entirely hardcoded in English.
3. The login, register (signup, phone verification, email verification, success), forgot password, and reset password pages are entirely hardcoded in English.
4. The profile/dashboard page has gaps.
5. The permit verification page is not translated.

---

## Goals

- Every applicant-facing page shows the language toggle (🇬🇧 EN / 🇷🇼 RW) in the top-right of the header.
- Every string visible to applicants has a high-quality Kinyarwanda translation.
- No half-word or mixed-language translations (e.g. "Click kugirango usubize" is forbidden).
- All translations follow natural, complete Kinyarwanda phrasing.
- Zero new dependencies. Zero new files beyond the spec doc.

---

## Architecture

### What Does NOT Change

- The custom i18n engine (`/lib/i18n/translator.ts`, `/lib/i18n/language.ts`)
- The `<LanguageSwitcher>` component itself
- The `<Tx>` component
- The `en.json` structure
- Any backend/API code

### What Changes

| File | Change |
|------|--------|
| `/messages/rw.json` | Add all missing `literal` phrase translations |
| `/components/layout/header.tsx` | Remove dashboard-only guard on `<LanguageSwitcher>`; expose it on all pages |
| `/components/home/hero-section.tsx` | Wire up `translateText()` for all hardcoded strings |
| `/components/home/features-section.tsx` | Same |
| `/components/home/process-section.tsx` | Same |
| `/components/home/cta-section.tsx` | Same |
| `/components/auth/login-form.tsx` | Wire up `translateText()` for all hardcoded strings |
| `/components/auth/sign-up-form.tsx` | Same |
| `/components/auth/phone-verification.tsx` | Same |
| `/components/auth/email-verification-step.tsx` | Same |
| `/app/(auth)/register/page.tsx` | Translate any hardcoded text (success confirmation) |
| `/app/forgot-password/page.tsx` | Wire up translations |
| `/app/reset-password/page.tsx` | Wire up translations |
| `/app/dashboard/profile/page.tsx` + profile component | Fill gaps |
| `/app/verify-permit/` or similar | Translate all text |

---

## Translation Strategy

All new translations are added to the **`applicationForm.literal`** section of `/messages/rw.json` as exact-match phrase keys. This is consistent with the existing pattern.

**Quality rules:**
- Translations must be complete natural Kinyarwanda sentences or phrases.
- Names of institutions (Rwanda Water Resources Board) use their established Kinyarwanda form: "Ikigo cy'Igihugu gishinzwe umutungo kamere w'amazi mu Rwanda".
- Technical terms that have no Kinyarwanda equivalent (e.g. "NIDA", "TIN") are kept in their original form.
- Button labels use imperative verb forms (e.g. "Injira" for Login, "Iyandikishe" for Register).

---

## Key Translations (Home Page)

| English | Kinyarwanda |
|---------|-------------|
| "Rwanda Water Permit Portal" | "Urubuga rw'u Rwanda rw'impushya z'amazi" *(already exists)* |
| "Welcome to the official Rwanda Water Resources Board permit application portal. Apply, track, and manage your water concession permits through our secure digital platform for sustainable water resource management in Rwanda." | "Murakaza neza ku rubuga rw'ubutegetsi rw'Ikigo cy'Igihugu gishinzwe umutungo kamere w'amazi mu Rwanda. Saba, gukurikirana, no gucunga impushya z'amazi zawe binyuze ku rubuga rwacu rw'ikoranabuhanga rufite umutekano, kugira ngo amazi mu Rwanda acungwe neza." |
| "APPLY NOW" | "SABA UBU" |
| "SECURITY" | "UMUTEKANO" |
| "PRIVACY" | "IBANGA" |
| "SERVICE FEATURES" | "SERIVISI ZITURWA" |
| "Rwanda Water Resources Board Portal Services" | "Serivisi z'urubuga rw'Ikigo cy'Igihugu gishinzwe umutungo kamere w'amazi mu Rwanda" |
| "Application Tracking" | "Gukurikirana ubusabe" |
| "Secure Processing" | "Gutunganya buri mwanya" |
| "Efficient Service" | "Serivisi zinoze" |
| "HOW IT WORKS" | "UBURYO BIKORWA" |
| "The Application Process" | "Inzira yo gusaba" |
| "Create Account" | "Fungura konti" |
| "Submit Application" | "Ohereza ubusabe" |
| "Provide Documentation" | "Tanga inyandiko" |
| "Receive Decision" | "Akira icyemezo" |
| "Get Started Today" | "Tangira Ubu" |
| "Start New Application" | "Tangira ubusabe bushya" |
| "Track Existing Application" | "Kurikirana ubusabe busanzwe" |

---

## Key Translations (Auth Pages)

| English | Kinyarwanda |
|---------|-------------|
| "Sign in to your account" | "Injira muri konti yawe" |
| "Email address" | "Aderesi ya imeyili" |
| "Password" | "Ijambo ry'ibanga" |
| "Forgot password?" | "Wibagiwe ijambo ry'ibanga?" |
| "Don't have an account? Register" | "Nta konti ufite? Iyandikishe" |
| "Signing in…" | "Kwinjira mu nzira…" |
| "Sign In" | "Injira" |
| "Your account has been suspended." | "Konti yawe hagaritswe." |
| "Invalid email or password." | "Imeyili cyangwa ijambo ry'ibanga ntabwo ari byo." |
| "Create your account" | "Fungura konti yawe" |
| "Individual" | "Umuntu ku giti cye" |
| "Company" | "Ikigo" |
| "First Name" | "Izina ry'ibanze" |
| "Last Name" | "Izina ry'umuryango" |
| "Date of Birth" | "Itariki y'amavuko" |
| "National ID Number" | "Nomero y'indangamuntu" |
| "Phone Number" | "Nomero ya telefoni" |
| "Confirm Password" | "Emeza ijambo ry'ibanga" |
| "Already have an account? Sign in" | "Usanzwe ufite konti? Injira" |
| "Verify your phone number" | "Emeza nomero ya telefoni yawe" |
| "Enter the 6-digit code sent to" | "Injiza kode y'imibare 6 yoherejwe kuri" |
| "Verify" | "Emeza" |
| "Resend code" | "Ohereza kode bundi bushye" |
| "Verify your email" | "Emeza imeyili yawe" |
| "Registration complete!" | "Kwiyandikisha byarangiye!" |
| "Reset your password" | "Hindura ijambo ry'ibanga" |
| "Send reset code" | "Ohereza kode yo gusubiza" |
| "New password" | "Ijambo ry'ibanga rishya" |
| "Confirm new password" | "Emeza ijambo ry'ibanga rishya" |

---

## Language Toggle Placement

The `<LanguageSwitcher>` is currently conditionally rendered only when on a dashboard path. The fix is to remove that condition so it renders on all pages in the header. The component already handles language persistence via `localStorage`.

---

## Out of Scope

- Email / SMS notification templates (server-side, not applicant-facing UI)
- Staff/admin/approver/inspector pages
- Date formatting with locale-aware date-fns (separate concern)
- Zod schema-level validation message i18n (complex, separate task)
- Migration to next-intl

---

## Success Criteria

1. Switching to Kinyarwanda on the home page translates all visible text.
2. The language toggle is visible and functional on home, login, register, forgot-password, and reset-password pages.
3. Login form, register form, and all auth sub-steps are fully translated.
4. Profile page has no remaining English-only strings.
5. No "mixed language" strings anywhere (e.g. English verb + Kinyarwanda object).
