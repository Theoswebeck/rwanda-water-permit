# Fix Document Loss on Payment Submission — Design Spec

**Date:** 2026-06-03
**Status:** Approved (user authorized autonomous implementation)
**Scope:** `components/dashboard/application-form-new.tsx` only. Transfer/renewal forms are
separate files and out of scope.

---

## Problem

A district (and in fact any) application submitted through the payment flow saves with
**0 documents** — the National ID, Annex B letter, etc. are dropped. The `is_bulk`/networks
data now persists (plain JSON), but uploaded files do not.

### Root cause

`PaymentTab.handleInitiatePayment` builds its request two ways:
- `application_id` — when a saved application exists → backend links to it (documents kept).
- `application_data` — a **JSON** snapshot of the form when no saved app exists → backend
  **creates the application from JSON**. JSON cannot carry `File` objects, so the created
  application has **no documents**.

The form reaches the payment tab without a saved application in scope, so PaymentTab falls
into the `application_data` path:

1. **District apps** skip the land-ownership tab, so they reach payment via the **"Next"**
   button → `handleNextTab`, which only validates and `setActiveTab('payment')` — **no save**.
   (The earlier "await onSaveAsDraft before payment" fix lives in the *Continue to Payment*
   button, which only renders on the land-ownership tab — a tab district apps never see.)
2. **Non-district apps** reach payment via *Continue to Payment*, which does await a save,
   but the resulting application is stored in the **page's** `currentApplication` state; that
   prop hasn't propagated down to `PaymentTab` by the time payment initiates, so PaymentTab
   still sees no application and uses `application_data`.

Either way: `application_data` JSON path → documents lost.

### Evidence (UAT DB)

All **drafts** have their documents (2–4 each); all **payment-submitted** apps have **0**.
`RWB-2026-000146` (submitted): `is_bulk=true`, 5 networks, **0 documents**.

---

## Solution

Guarantee that, whenever the form enters the payment tab in an applicant payment-widget flow,
the draft is **saved first** (which uploads the documents) and the saved application is fed
directly to `PaymentTab` from the form's **own** state — eliminating the prop-propagation lag
and the `application_data` fallback.

### Changes (all in `application-form-new.tsx`)

1. **New local state:** `const [paymentApplication, setPaymentApplication] = useState<any>(null)`.

2. **Save-before-payment on the "Next" path:** in `handleNextTab`, when the next tab is
   `payment` and it's an applicant payment-widget flow (`shouldShowApplicantPaymentWidgetTab`
   && `!readOnly`), build the draft payload, `await onSaveAsDraft(...)`, capture the returned
   app via `setPaymentApplication(saved)`, and only then navigate. If the save throws, show an
   error and do **not** navigate.

3. **Capture on the "Continue to Payment" button:** the existing land-ownership → payment
   handler already awaits the save; capture its return value into `paymentApplication` too.

4. **Effective application:** define
   `const effectivePaymentApplication = currentApplication ?? paymentApplication;`
   and use it for the `PaymentTab` `application` prop and the two
   `!currentApplication?.id` gates (`formData`, `onPaymentComplete`), plus the `onRetrySave`
   handler. When a real application exists (current or just-saved), `formData` is `undefined`,
   so PaymentTab uses `application_id` and never the JSON path.

### Why this does not harm existing flows

- **Transfer / renewal**: separate components (`permit-transfer-form.tsx`,
  `permit-renewal-form.tsx`) — untouched.
- **Staff / read-only / view**: `handleNextTab`'s save-before-payment is gated on
  `shouldShowApplicantPaymentWidgetTab && !readOnly`; those modes are unaffected.
- **Modification**: `currentApplication` is already set (modifying an existing app), so
  `effectivePaymentApplication === currentApplication` — unchanged.
- **Reopening a draft**: `currentApplication`/`draftId` already set; `?? paymentApplication`
  only adds a value when `currentApplication` is null, so it never overrides existing behavior.
- **Non-district new app**: same path improves — the saved app is now used instead of the JSON
  fallback, so its documents are kept too.

---

## Use cases verified

1. **District new app** → fills form, uploads annex + NID, clicks Next on Water Source →
   draft saved (docs uploaded) → `paymentApplication` set → PaymentTab uses `application_id`
   → pays → submitted app **keeps documents + networks**.
2. **Non-district new app** (land-ownership → Continue to Payment) → saved app captured →
   documents kept.
3. **Modification / reopened draft** → `currentApplication` already set → behavior unchanged.
4. **Transfer / renewal** → separate forms → unchanged.
5. **Save fails before payment** → error shown, navigation blocked (can't pay without a saved
   application).

## Verification

- `npm run build` must pass.
- After deploy, submit a district app through payment and confirm via DB that the `documents`
  rows exist for the submitted application (not 0), alongside `is_bulk=true` + networks.

## Follow-up (not in this change)

The draft payload is assembled in ~5 places; centralizing it in one builder would prevent
future divergence. Transfer/renewal forms likely share the same `application_data` document-loss
risk and should get the same treatment. Tracked as a follow-up, not required for this fix.
