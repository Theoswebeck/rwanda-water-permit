# Bulk Water Supply — Contract & Permit Template Design

**Goal:** Fix the "Terms not available" error for bulk applications and implement the correct bilingual contract + permit PDF templates with annex table showing child permit numbers.

**Architecture:** Four targeted fixes — contract terms registration, permit PDF paragraph text, contract preview UI annex column, child permit PDF redirect. No schema changes. No new API routes. Non-bulk applications are entirely unaffected.

**Tech Stack:** Next.js, PDFKit (pdf-permit-server.ts), React (contract-terms-preview.tsx), TypeScript

---

## Context: what already exists

- `PermitVariant` already includes `"bulk_water_supply"` and `selectPermitVariant()` returns it for `is_bulk` applications
- `contractTermsByVariant` in `lib/contract-terms.ts` has no entry for `bulk_water_supply` → `undefined` → "Terms not available"
- `renderBulkWaterSupply()` in `lib/pdf-permit-server.ts` exists but uses wrong authorization sentence (reuses `abstraction_organization` para_2 which includes specific coordinates/sector/cell) and annex is missing Permit Number + Village columns
- `ContractTermsPreview` already has an annex table rendering bulk networks but first column is `#` (row index) not child permit numbers
- `buildChildPermitNumber(parent, index)` utility already exists in `lib/permit-number-utils.ts`
- Child permits are already created in DB when applicant accepts T&C
- Public PDF route exists at `app/api/public/permits/pdf/[...permitNumber]/route.ts`

---

## Fix 1 — Contract template (`lib/contract-terms.ts`)

Add `bulk_water_supply` key to `contractTermsByVariant`. Structure is identical to `abstraction_organization` (Parts I–IV, Kinyarwanda sections, signature block, important notice) **except Article 4**.

**Article 4 — English:**
> "The Water User is authorized to abstract water from the water supply networks located in {{DISTRICT}} District as specified in the attached annex. Water abstracted will be used for water supply."
> "The Water User understands and acknowledges that the water resources are multi-purpose and may be subject to other plans as long as that will not affect the use to which water will be put."
> "The Director General makes no guarantee as to the availability, suitability, purity, portability, or fitness of the water to meet Water User's activities."

**Article 4 — Kinyarwanda:**
> "Ukoresha amazi yemerewe gukoresha amazi y'imiyoboro iherereye mu Akarere ka {{DISTRICT}} nk'uko bigaragara ku mugereka. Aya mazi yemerewe gukoreshwa mu bikorwa byo gukwirakwiza amazi."
> (etc. — mirror paragraphs 2 and 3 of org template)

All other articles (1–3, 5–18), signature block, and important notice are copied verbatim from `abstraction_organization`.

## Fix 2 — Permit PDF authorization sentence + annex columns (`lib/pdf-permit-server.ts`)

**`para_2` (authorization sentence):**

Replace `resolveSlotText("permit.abstraction_organization.en.para_2", ctx)` with a bulk-specific builder that reads from the slot context:

```
"{{ORG_NAME}}" with its registered office address as follows: {{ORG_ADDR}}; represented by {{REP_NAME}} "{{REP_TITLE}}", is authorized to abstract water from {{NETWORK_COUNT}} water supply network(s) located in {{DISTRICT}} District as described in the attached annex. Water abstracted will be used for water supply.
```

And the Kinyarwanda equivalent:
```
"{{ORG_NAME}}" ifite ibiro biherereye mu {{ORG_ADDR}}; ihagarariwe na {{REP_NAME}} "{{REP_TITLE}}", yemerewe gukoresha amazi y'imiyoboro {{NETWORK_COUNT}} iherereye mu Akarere ka {{DISTRICT}} nk'uko bigaragara ku mugereka. Aya mazi yemerewe gukoreshwa mu bikorwa byo gukwirakwiza amazi.
```

These strings are built from values already available on the `PermitApplication` object: `applicant.company_name`, internal_notes `officeAddress`/`officeSector`/`officeDistrict`, representative name/title from notes, `bulk_networks.length`, and `district`.

**Annex table columns** (updated from current 7 to 8):

| Col | Label | Width |
|-----|-------|-------|
| 1 | Permit Number | 72pt |
| 2 | Network Name | 60pt |
| 3 | Sector | 40pt |
| 4 | Cell | 40pt |
| 5 | Village | 40pt |
| 6 | Coordinates | 52pt |
| 7 | Capacity (m³/d) | 40pt |
| 8 | Method | 40pt |

Permit number for row `i` (0-based): `buildChildPermitNumber(permitNumber, i + 1)`.

## Fix 3 — Contract preview UI annex (`components/contract/contract-terms-preview.tsx`)

Add "Permit Number" as the first column in the annex table.

Derive child number:
```ts
const year = new Date().getFullYear();
const childNum = permitNumber
  ? buildChildPermitNumber(permitNumber, i + 1)
  : `———_${i + 1}/RWB/${year}`;
```

Import `buildChildPermitNumber` from `@/lib/permit-number-utils`.

## Fix 4 — Child permit PDF redirect (`app/api/public/permits/pdf/[...permitNumber]/route.ts`)

When the requested permit number is a child (detected via `parseChildPermitNumber()`), query the DB for a permit where `permit_number` matches the parent (`parentSeq/RWB/year`) or use the existing `parent_permit_id` FK, then serve that parent permit's PDF using the same generation path.

Lookup: `SELECT * FROM permits WHERE permit_number = $parentPermitNumber LIMIT 1`, then proceed with normal PDF generation for that parent permit record.

---

## Non-bulk guarantee

- All changes behind `is_bulk` check or `bulk_water_supply` variant switch
- No existing variant renderers, contract templates, or public routes are modified for the non-bulk path
- Existing `abstraction_organization`, `abstraction_individual`, `concession_*` flows unchanged

---

## Files changed

| File | Change |
|------|--------|
| `lib/contract-terms.ts` | Add `bulk_water_supply` contract terms object |
| `lib/pdf-permit-server.ts` | Fix `para_2` authorization text; add Permit Number + Village columns to annex |
| `components/contract/contract-terms-preview.tsx` | Add Permit Number column to annex table |
| `app/api/public/permits/pdf/[...permitNumber]/route.ts` | Redirect child permit requests to parent PDF |
