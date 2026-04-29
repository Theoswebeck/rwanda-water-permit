# Issuance date locks on approver approval (not on terms acceptance)

Author: assessor / permit team
Status: approved
Supersedes: prior `terms_accepted_at`-based rule shipped in commit `f9b2851`
(see `lib/permit/resolve-issue-date.ts`)

---

## TL;DR

The "issuance date" we render on the permit and the contract is the **legal
effective date** of the permit. The Director General (approver) signing the
application is the legal moment that anchors that date. Once the approver
signs (`applications.approved_at` is set), every subsequent render — assessor
preview, applicant preview, transferee preview, final PDF, public permit view
page, registry sync — must show that exact same calendar day, regardless of
when the user later clicks "Accept Terms".

Same rule for **all** application types (new / renewal / modification /
transfer). No per-type branching.

---

## Why the previous design was wrong

Commit `f9b2851` (shipped 2026-04-29 morning) used `terms_accepted_at` as
the locking date. That rule mis-models the contract:

- **Article 18/19** of the contract template (`lib/contract-terms.ts`) says
  the permit becomes effective when "issued by the Director General". That
  is the approver-signs event, not the terms-accept event.
- For permit transfers in particular, the transferee may delay clicking
  "Accept Terms" for days/weeks after the approver signs. With the old rule,
  every render in between showed today's date, but the moment the
  transferee clicked accept, the date suddenly snapped to that day —
  potentially a date later than the contract's "Done at Kigali, On …" line
  on the previously-approved preview the assessor had reviewed.
- The old rule also created a window where preview-PDF and final-PDF could
  legally disagree by hours or days for the *same* application, just based
  on which one was rendered first.

`approved_at` removes both anomalies: it's set exactly once, when the
approver clicks approve, and it's the date the contract itself names.

---

## Canonical resolver

```ts
// lib/permit/resolve-issue-date.ts
export type IssueDateInputs = {
  permitIssuedDate?: string | Date | null | undefined;  // permits.issued_date
  approvedAt?: string | Date | null | undefined;        // applications.approved_at
  now?: () => Date;                                      // tests only
};

export function resolvePermitIssueDate(input: IssueDateInputs): Date {
  // 1. permits.issued_date wins                  → already-issued permit
  // 2. else applications.approved_at             → approver has signed
  // 3. else today                                → still pending approval
}
```

The resolver is the **only** place this priority lives. Every read path
imports it. Every write path (terms acceptance, transfer issuance) reads
`approved_at` from the application row and writes that exact date to
`permits.issued_date` and `permit_registry.issuance_date`.

`terms_accepted_at` is dropped from the date chain entirely. It remains in
the schema and remains a workflow gate (the user must accept terms before
the permit row is created), but it never feeds into the issuance date.

---

## Rule applied per stage

| Stage / status                        | What `permits.issued_date` is | What every render shows |
|---------------------------------------|-------------------------------|--------------------------|
| `pending_assessment`                  | not yet issued (`null`)       | today                    |
| `under_review`                        | not yet issued (`null`)       | today                    |
| `returned_to_assessment`              | not yet issued (`null`)       | today                    |
| `approved_pending_permit`             | not yet issued (`null`)       | `approved_at` ← LOCKED   |
| `approved` (post terms acceptance)    | `approved_at` (date-only)     | `permits.issued_date`    |
| `active`                              | `approved_at` (date-only)     | `permits.issued_date`    |

The "approved" rule applies identically to renewals, modifications, and
transfers. It applies identically to digital and manual transfers. There
is no per-type code path.

---

## Date-bearing slot policy (unchanged)

The free-text slot editor lets assessors override most paragraph text on
the contract and permit. Date-bearing slots (`structuredField` of
`"issue_date"` or `"expiry_date"`) are **excluded** from override — the
resolver always re-renders them from the live `ctx.permit.issuedDate`, the
API rejects writes to them, and the editor UI marks them read-only with an
"Auto from system date" badge. This part of `f9b2851` is preserved
verbatim.

---

## Read paths (must read `approved_at`)

| Path                                                                | Behaviour                                                                  |
|---------------------------------------------------------------------|----------------------------------------------------------------------------|
| `app/api/staff/applications/[id]/permit-preview/route.ts`           | Selects `a.approved_at`. Calls `resolvePermitIssueDate({ approvedAt })`.   |
| `app/api/public/permits/pdf/[...permitNumber]/route.ts`             | Reads `application.approved_at` from the joined row. Calls resolver.       |
| `app/permit/view/[...permitNumber]/page.tsx`                        | `getCanonicalIssueDate` falls back to `application.approved_at`.           |
| `lib/permit/permit-text-data.ts` (issuance-date line in PDF)        | Already reads `permit.issuedDate` — unchanged. Caller now feeds approved.  |

## Write paths (must write `approved_at` to `permits.issued_date`)

| Path                                                                | Behaviour                                                                                  |
|---------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| `app/dashboard/application/[id]/terms/page.tsx`                     | Reads `applications.approved_at` for this application; writes that date to `permits.issued_date` and uses it as the base for `expiry_date = approved_at + duration`. Falls back to today only if the application row is missing `approved_at` (defensive). |
| `app/api/transfers/issue/route.ts`                                  | Reads `applications.approved_at`. Caller may still pass `issuedDate` explicitly; if it does, that wins for backward compatibility. Otherwise the route uses `approved_at`, falling back to today as last resort. |
| Registry sync calls (`syncPermitToRegistry`)                        | Use the same date-only string as the permits row.                                          |

`terms_accepted_at` continues to be set on the application row when the
user accepts (separate field, separate purpose: workflow tracking, audit,
notifications). It just doesn't feed into the date chain anymore.

---

## Rendering edge cases

- **Approver approves at 23:50 UTC, terms accepted at 00:10 UTC the next
  day.** The contract shows the approval date (the day the DG signed). It
  doesn't shift to the user's accept day. ✅
- **Assessor saves a preview override on day N for a date-bearing slot.**
  Override is rejected by API and ignored by resolver — same as today. ✅
- **Transferee accepts terms 30 days after approver signs.** Permit issue
  date is the day the approver signed, not the day the transferee clicked.
  ✅ (This is the case that triggered the redesign.)
- **Permit already issued, assessor regenerates preview.** Renderer reads
  `permits.issued_date` directly (priority 1), no recomputation. ✅
- **Application is pending and the resolver runs.** Falls through to today.
  Every render shows the current calendar day, no stale frozen date. ✅

---

## Backfill

None. Existing permits keep their current `issued_date`. The new rule only
affects:
- previews of permits that have not yet been issued, and
- writes that happen at terms-acceptance / transfer-issuance after this
  ships.

We do not retroactively rewrite any `permits.issued_date` row.

---

## UI copy update

The "Auto from system date" hint under the date-bearing slot editor used to
read:

> Once the relevant party signs the terms, this date locks to the signing
> date and never moves again.

It now reads:

> Once the approver signs the application, this date locks to the approval
> date and never moves again.

Same intent — just names the legally correct event.

---

## Tests

- `scripts/check-resolve-issue-date.ts` — priority order, date parsing,
  application-type agnosticism. Updated to use `approvedAt` everywhere.
- `scripts/check-permit-slots-parity.ts` — date-bearing slots ignore
  overrides. Unchanged.
- `scripts/smoke-permit-pdf-variants.ts` — every variant renders to one
  page with the live ISSUE_DATE/EXPIRY_DATE. Unchanged.

All three are runtime scripts (no Jest dependency). All three must pass
before merge.

---

## Out of scope

- No changes to the application-status workflow. The approver still hits
  the same approve button, which still flips status from `under_review` to
  `approved_pending_permit` and stamps `approved_at`.
- No changes to the contract template text in `lib/contract-terms.ts`.
- No changes to `terms_accepted_at` semantics outside of the date chain.
