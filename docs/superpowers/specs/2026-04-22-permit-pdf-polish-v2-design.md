# Permit PDF Polish v2 — Design

**Date:** 2026-04-22
**Status:** Approved
**Scope:** `lib/pdf-permit-server.ts` only. All 4 variants (`concession_individual`, `concession_organization`, `abstraction_individual`, `abstraction_organization`), in both preview (`skipQr: true`) and final (`skipQr: false`) renders.

## Goal

Tighten the visual presentation of the water-use permit PDF so it matches the printed RWB sample: centered branding, more visible national emblem, no draft overlay clutter, slimmer draft banner, simpler signoff, and breathable typography — all still on a single landscape page.

## Changes

### A. Header (logo + title) — centered

- Center the RWB logo at the very top (~32pt × 34pt, slightly larger than today's 22 × 24).
- Place the title `WATER USE PERMIT / URUHUSHYA RWO GUKORESHA AMAZI N° {permitNo}` centered immediately below the logo.
- Keep the divider line under the title.
- `MODIFIED` badge keeps its position (right of title row) when `isModified`.

### B. Rwanda emblem watermark — 50% more visible

- Opacity: `0.08 → 0.12` (+50%).
- Size: enlarge by ~50% (use a width ≈ 1.5× current target so the emblem reads cleanly behind text).
- Stays grayscale, stays centered, stays behind text.

### C. Remove diagonal "DRAFT" overlay

- Stop calling `drawDraftOverlay()` from every renderer.
- Function definition stays in the file (dead but ready for future re-use).

### D. Slim "DRAFT — NOT YET ISSUED" banner

- Replace the ~80pt tall amber box (with two text lines) by:
  - 22pt tall single-line amber strip pinned flush to the very bottom (above only the page-number footer).
  - Single line, bold 10pt: `DRAFT — NOT YET ISSUED`.
- Drop the secondary "This digital permit is only valid if…" line.
- Net effect: ~60pt of vertical space recovered for body text above.

### E. Closing block — single centered line

Remove these 4 lines entirely:
- `Signature/Umukono: …………………`
- `Done at Kigali/Bikorewe i Kigali, On/kuwa {date}`
- `Dr. Emmanuel RUKUNDO`
- `Director General / Umuyobozi Mukuru`

Replace with one centered, bold, 11pt line ~14pt below the last Kinyarwanda paragraph:
- `Director General of RWB / Umuyobozi Mukuru wa RWB`

### F. Paragraph + inter-section spacing

- Body: `lineGap: 1.4 → 2.6`, `paraGap: 5 → 9`.
- Between English and Kinyarwanda blocks: `8pt → 18pt` above the separator line and `8pt → 18pt` below it.
- Same body font size (11pt) and font family (Segoe UI / configured fallback).

### G. Single-page-fit guardrail

- Math: removed lines (~50pt) + slimmed banner (~60pt) = ~110pt freed.
- Added: looser spacing across ~14 paragraphs (~50pt) + EN/RW gap (~20pt) = ~70pt added.
- Net: ~40pt headroom recovered → all 4 variants must continue to render on exactly **one landscape page**.
- Verify with the existing `/api/test/permit-pdf` 16-scenario smoke test (covers each variant × preview/final × normal/modified).

## Out of scope

- Page border, page-number footer, document-overrides editor, contract preview.
- Final-issuance footer (QR code area) — only the preview banner is changing.
- `lib/pdf-generator.ts` (no longer renders permits).

## Validation

1. `npx tsc --noEmit` shows no new errors in `lib/pdf-permit-server.ts`.
2. All 16 fixtures from `app/api/test/permit-pdf/route.ts` return exactly 1 page; pdftotext output contains the new closing line and no longer contains `Dr. Emmanuel RUKUNDO`, `Signature/Umukono`, or the secondary draft body line.
3. Visual spot-check of a representative preview vs. final render confirms centered logo, stronger watermark, slim bottom banner, and absence of diagonal "DRAFT" text.
