# Free-text Slot Editor for Permit & Contract — Design Spec

**Date:** 2026-04-23
**Status:** Approved
**Audience:** Engineers implementing this feature.

---

## 1. Goal

Let RWB staff (assessor, admin, superuser) freely edit every English and Kinyarwanda text string that appears on the issued **Water Use Permit** and **Contract** for a single application — without changing the visual layout, fonts, logos, watermark, QR code, or page structure of either document. After saving, the change is shown back to the editor as a labelled diff for explicit confirmation, and once confirmed the next regenerated PDF and on-screen preview reflect the new text.

This replaces the structured `DocumentValuesEditor` (which only knew about a fixed 19-key whitelist) with a comprehensive "every text emission is editable" model.

---

## 2. Non-goals

- Editing structured fields that flow into databases or the public verification page (volume, duration, applicant name, dates) directly through this editor. Those keep flowing through `AssessorRecommendations` and the application form. The free-text editor only changes what the **PDFs** display; if a slot's underlying value is structured (e.g. the volume that appears in Article 4), the editor optionally offers a one-click "apply to structured field too" prompt — but the structured edit is a separate write to a separate column.
- Adding new sections / paragraphs to the permit or contract that don't exist today. The slot catalogue is fixed in code per release; v1 only allows editing existing slots.
- Editing template defaults (i.e. changing the wording for *all* future permits). v1 is per-application override only.
- Rich-text formatting (bold, italics, lists, tables). The text in each slot is plain text. The PDF renderer's existing fonts and styling for that slot are preserved.
- A full version-history table. v1 stores `editedAt` and `editedBy` per slot in the override envelope, which is enough for "who changed what last". A dedicated audit table can be added later if compliance requires it.

---

## 3. Constraints

- **PDF visual layout must remain pixel-equivalent** to today's output when no slots have been overridden. This is a hard test gate — if `output_with_no_overrides != output_today`, the change is wrong.
- **No race conditions / no session conflicts.** Save path uses the same row-lock + `parseInternalNotesStrict` + JSON re-stringify pattern we hardened on `document-overrides` in April.
- **Government data sovereignty.** Edits live in `applications.internal_notes` (already on RWB Postgres). No third-party storage.
- **Permit certificate has 4 layout variants** (`abstraction_individual`, `abstraction_organization`, `concession_individual`, `concession_organization`). The slot catalogue must be variant-aware.

---

## 4. Architecture overview

### 4.1 Slot catalogue (in code, not DB)

A "slot" is one named position in a document where the renderer emits text. Each slot has:

```ts
type DocumentTextSlot = {
  id: string;                              // stable, dotted id e.g. "permit.abstraction_individual.en.para_2"
  documentKind: "permit" | "contract";
  variant?: PermitVariant;                 // when present, slot only applies to this variant
  language: "en" | "rw";
  group: string;                           // editor section header e.g. "Authorization paragraphs"
  label: string;                           // editor row label e.g. "Paragraph 2 — Authorization"
  /**
   * Returns the text the renderer would emit today (with all dynamic values
   * resolved). Snapshot semantics — value frozen at edit time.
   */
  defaultResolver: (ctx: SlotResolverContext) => string;
  /**
   * When set, identifies the structured field this slot's value mirrors. The
   * editor offers a "also update the structured field?" prompt on save when
   * the override differs from the resolved structured value.
   */
  structuredField?: "volume_m3" | "duration_years" | "applicant_name" | "issue_date" | "expiry_date";
  softMaxLength?: number;                  // editor warning threshold; default 4000
};
```

Catalogue location:

- `lib/document-slots/permit-slots.ts`   — exports `permitSlots: DocumentTextSlot[]`
- `lib/document-slots/contract-slots.ts` — exports `contractSlots: DocumentTextSlot[]`
- `lib/document-slots/index.ts`           — `getSlotsForDocument(kind, variant)` and `findSlot(id)`

### 4.2 Storage envelope

Edits are stored in `applications.internal_notes.document_text_overrides`:

```ts
type DocumentTextOverridesEnvelope = {
  version: number;                         // monotonic, optimistic-locking token
  updatedAt: string;                       // ISO timestamp of latest save
  updatedBy: { id: string; name: string; email: string; role: string };
  values: {
    [slotId: string]: {
      text: string;                        // empty string == "no override, use default"
      editedAt: string;
      editedBy: { id: string; name: string; email: string; role: string };
    };
  };
};
```

Single flat `values` map keyed by slot id (vs nested by document/language) — keeps the schema simple, makes lookups O(1), and the slot id already encodes document + variant + language.

### 4.3 Resolution at read time

Renderer-facing helper in `lib/document-slots/resolver.ts`:

```ts
function resolveSlotText(slotId: string, ctx: SlotResolverContext): string {
  const slot = findSlot(slotId);
  if (!slot) throw new Error(`Unknown slot: ${slotId}`);
  const env = getDocumentTextOverridesEnvelope(ctx.application.internal_notes);
  const override = env.values[slotId];
  if (override && override.text !== "") return override.text;
  return slot.defaultResolver(ctx);
}
```

Empty string means "no override, render default". To delete-back-to-default the editor calls a dedicated reset endpoint that removes the slot key from `values`, never sets `""`.

### 4.4 Renderer integration

Every place the existing PDF renderer emits a literal string or inline-resolved value gets replaced with `resolveSlotText("...")`. This is mechanical and per-string. The four `render*` functions in `lib/pdf-permit-server.ts` and `generateTermsConditionsPdfBlob` in `lib/pdf-generator.ts` all change the same way:

Before:

```ts
doc.text(`This water use permit is valid from ${fmtDMY(issueDate)} to ${fmtDMY(expiryDate)}.`, ...);
```

After:

```ts
doc.text(resolveSlotText("permit.abstraction_individual.en.para_3.validity", ctx), ...);
```

The `defaultResolver` for that slot is the same template literal moved out of the renderer.

### 4.5 Save flow (server)

`POST /api/staff/applications/[id]/document-text-overrides`

Request body:

```ts
{
  documentKind: "permit" | "contract";
  variant?: PermitVariant;                 // for sanity-check
  expectedVersion: number;                 // for optimistic locking
  patches: Array<{ slotId: string; text: string | null }>; // null == reset to default
}
```

Server flow inside `withTransaction`:

1. `SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '15s';`
2. `SELECT internal_notes FROM applications WHERE id = $1 FOR UPDATE`.
3. `parseInternalNotesStrict(notes)` — fail with 409 + diagnostic if non-empty unparseable.
4. Get current envelope. If `envelope.version !== expectedVersion` → 409 with current envelope.
5. Validate every patch: slot must exist in the catalogue, text length ≤ slot's `softMaxLength` (cap 8000 chars hard limit), variant matches if present.
6. Apply patches: for `text === null` delete `values[slotId]`; otherwise upsert `{ text, editedAt: now, editedBy: claims }`.
7. Bump `envelope.version`, set `envelope.updatedAt`, `envelope.updatedBy`.
8. Re-stringify `internal_notes`, `UPDATE applications SET internal_notes = $2, updated_at = now() WHERE id = $1`.
9. Return new envelope + the pre-edit envelope so the client can render the diff modal.

### 4.6 Read flow (server)

`GET /api/staff/applications/[id]/document-text-overrides?documentKind=permit`

Returns:

```ts
{
  variant: PermitVariant;
  envelope: DocumentTextOverridesEnvelope;  // current overrides
  slots: Array<{
    id: string;
    group: string;
    label: string;
    language: "en" | "rw";
    defaultText: string;                    // resolved default (snapshot)
    overrideText: string | null;            // null == not overridden
    structuredField?: string;
    softMaxLength: number;
    editedAt?: string;
    editedBy?: { id: string; name: string; email: string };
  }>;
}
```

The server does the slot resolution because `defaultResolver` needs the full application context (notes, applicant, etc.) — keeping it server-side avoids shipping all that to the browser.

### 4.7 Editor UX

Component path: `components/staff/document-text-editor.tsx`.

- One screen with two tabs: **Permit** and **Contract**.
- Inside each tab: vertical scroll list. EN slots grouped first (with sticky group headers), RW slots second.
- Each slot is one row containing:
  - Group label + slot label.
  - Single-line text input for short slots (≤ 120 chars default), `<textarea>` for longer.
  - Pre-filled with `overrideText ?? defaultText`.
  - "Reset to default" button when an override is present (visible only then; sends `text: null`).
  - Edited indicator (small badge "Edited by Jane Doe · 2h ago") when overridden.
- Top of tab: **Save changes** button (disabled until at least one slot dirty), **Discard** button.
- On save click: collect dirty slots → open confirmation modal with a per-slot diff (Field: old → new). User confirms → POST patches.
- On 409 conflict: re-fetch the latest envelope, merge user's drafts on top, show a yellow banner ("Someone else edited slots X and Y while you were typing — your text wins on save"). User explicitly re-saves.
- On 400 validation error: highlight the offending row.
- After successful save: refresh `PermitPreviewFrame` / contract preview via existing `refreshKey` mechanism so the assessor sees the change reflected immediately.

The editor is mounted on the existing assessment page, replacing `DocumentValuesEditor`, and is **only rendered when the active tab is "Contract" or "Permit Preview"** (same scope rule the team requested earlier).

### 4.8 Assessor recommendations stay structured

`AssessorRecommendations` (volume m³/year, duration years) keeps its own UI and database writes (`proposed_duration_years`, `_assessorAdjustments.recommendedVolumeM3`). When a free-text slot whose `structuredField` matches one of these is saved with a different value, the confirmation modal adds an extra row:

> **Heads-up: Article 4 mentions "50 m³/year" but the structured volume is still 47 m³/year.**
> [ Apply to structured volume too ]   [ Keep text-only ]

Clicking "Apply to structured volume too" pipes through the existing `assessor-adjustments` route. This keeps the public verification page in sync.

---

## 5. Approver visibility

When an application moves to approver review:

- The approver's UI shows a "Document edits" pane that lists every slot with `overrideText !== null`, shown as "Default text → Override text" diff rows.
- Approver decision (approve / reject / return) operates on the application as it is today; no extra signoff per slot. The pane is informational + audit, not a gate.
- Approvers cannot edit the slots themselves in v1. (Add later if needed.)

---

## 6. Edge cases & failure modes

| Case | Behaviour |
|------|-----------|
| Empty textarea (slot saved with `""`) | Treated as `null` (reset). To intentionally render blank, the team must edit one space. v1 simplification. |
| Slot id from older catalogue missing in new release | Renderer falls back to default. Override stays in `values` (forwards-compat); editor shows it under a "Legacy / unknown slot" group with reset-only action. |
| Concurrent save (2 assessors, same application) | Optimistic version check → 409 with current envelope; client merges and re-prompts. |
| Lock contention (>5s) | 503 with `Retry-After: 3` (existing pattern). |
| Malformed `internal_notes` | `parseInternalNotesStrict` returns `409 corrupt_notes` with raw preview; admin must triage. |
| Override text exceeds 8000 chars | 400 with `validation_error` and per-slot reason. |
| Slot `structuredField` set but the structured value can't be parsed from the override (e.g. user wrote "fifty" instead of "50") | The "apply to structured field" prompt does not appear; text saves normally. |
| Variant misclassified later (rare) | Slot ids include the variant in the path, so a previously-saved override only applies if variant matches; renderer falls back to default if the application is regenerated under a different variant. |

---

## 7. Slot catalogue scope (v1)

### 7.1 Permit slots

The current renderer emits these strings; each becomes one slot.

**Cross-variant (4 variants × these slots):**
- `permit.<variant>.title.en` — e.g. "WATER USE PERMIT N° 000026/RWB/2026" (or bilingual title for `abstraction_organization`).
- `permit.<variant>.modified_badge.en` — "MODIFIED PERMIT" (only emitted when `isModified`).
- `permit.<variant>.en.para_1.law_basis` — "Pursuant to Law N°49/2018 of 13/08/2018..."
- `permit.<variant>.en.para_2.authorization` — the long authorization sentence.
- `permit.<variant>.en.para_3.validity` — "This water use permit is valid from X to Y."
- `permit.<variant>.en.para_4.contract_ref` — "In addition to the conditions specified in the Law mentioned above..."
- `permit.<variant>.closing.signatory.bilingual` — "Director General of RWB / Umuyobozi Mukuru wa RWB" (left column).
- `permit.<variant>.closing.date.bilingual` — "Done at Kigali / Bikorewe i Kigali, On/kuwa DD/MM/YYYY" (right column).
- `permit.<variant>.footer.qr_disclaimer.en` — "Scan to verify. This digital permit is only valid if..."
- `permit.<variant>.footer.draft_banner.en` — "DRAFT — NOT YET ISSUED" (preview only).

**Additionally for `abstraction_organization` (bilingual variant):**
- `permit.abstraction_organization.rw.para_1.law_basis` — "Hashingiwe ku Itegeko..."
- `permit.abstraction_organization.rw.para_2.authorization` — long Kinyarwanda authorization sentence.
- `permit.abstraction_organization.rw.para_3.validity` — "Uru ruhushya rufite agaciro kuva..."
- `permit.abstraction_organization.rw.para_4.contract_ref` — "Uretse ibiteganywa..."

**Slot count totals:** ~10 slots × 4 variants + 4 RW slots for organization variant = **~44 permit slots** (with significant template-literal overlap; default resolvers can be shared via helper functions).

`structuredField` mappings in v1:
- `permit.*.en.para_2.authorization` → no single structured field (multi-value); skip prompt.
- `permit.*.en.para_3.validity` → `expiry_date` (parsing the second date in the sentence is doable, but v1 skips and just shows the text-only prompt).

For v1 the cross-update prompt is **wired only for slots whose entire content is a single structured value**; the multi-value paragraphs above don't trigger it. This is the safe default.

### 7.2 Contract slots

The contract is already structured as `ContractTermsSection[]` per variant in `lib/contract-terms.ts`. Each `(section, paragraph_index)` becomes one slot:

- `contract.<variant>.section_<index>.title.<lang>`
- `contract.<variant>.section_<index>.paragraph_<paragraph_index>.<lang>`

Language is derived from section title via the existing `getContractSectionLanguage` heuristic. Slots are emitted in section order.

**Slot count totals:** ~25 sections × ~2 paragraphs avg × 2 languages = **~100 contract slots** per variant. Across 4 variants this is ~400 slots, but contract-terms.ts uses heavy text reuse — implementations should iterate the variant's actual `sections` array, not duplicate.

### 7.3 What is NOT a slot in v1

- The RWB logo, watermark, QR code (binary assets, not text).
- Page borders, lines, separators.
- Page numbers and `Document ID:` line — these are pure metadata, not editorial copy. Out of scope.
- The "MODIFIED PERMIT" badge styling (red box) — only the badge text is editable.

---

## 8. Permission model

| Role | Read editor | Save | Approver pane (read-only) |
|------|-------------|------|---------------------------|
| `assessor` (own application) | ✅ | ✅ | n/a |
| `admin` | ✅ | ✅ | ✅ |
| `superuser` (env list) | ✅ | ✅ | ✅ |
| `approver` | ✅ | ❌ | ✅ |
| Anyone else | ❌ | ❌ | ❌ |

Reuses `ALLOWED_STAFF_ROLES = ["assessor", "admin"]` plus `SUPERUSER_EMAILS` bypass that we already added on the `document-overrides` and `assessor-adjustments` routes.

---

## 9. Migration & rollout

- No DB migration required — `document_text_overrides` lives inside the existing `internal_notes` TEXT column.
- Existing `document_overrides` envelope (the structured 19-key version) stays in place. v1 reads it for backwards-compatibility but the editor UI no longer writes to it. Existing overrides keep flowing through the renderer via `getEffectiveInternalNotes`.
- `DocumentValuesEditor` component is removed from the assessment page when the new editor is enabled. The component itself is kept on disk for one release in case we need to revert.
- Feature flag: `NEXT_PUBLIC_DOCUMENT_TEXT_EDITOR_ENABLED` (default `true` once Phase 1 lands; set `false` to fall back to old editor while debugging).

---

## 10. Test plan

**Unit tests (`__tests__/document-slots/`):**
- `resolver.test.ts` — default vs override precedence, missing slot id, empty-string override = default, invalid envelope = empty.
- `permit-slots.test.ts` — every slot in catalogue has unique id, language matches id pattern, variant present implies variant matches id pattern.
- `contract-slots.test.ts` — same invariants.
- `envelope.test.ts` — version monotonicity, patch application, reset (`null` removes key), unknown slot rejected.

**Integration tests (`__tests__/api/document-text-overrides/`):**
- POST with valid patches → envelope.version increments, `values` updated.
- POST with stale `expectedVersion` → 409 with current envelope.
- POST with unknown slot id → 400.
- Concurrent POSTs serialise correctly (lock test using two pg clients).
- POST with `text: null` removes the key.
- GET returns full slot list with defaults + overrides resolved.

**Renderer parity test (`__tests__/pdf-permit-server.test.ts`):**
- For each variant: render PDF with no overrides → assert byte-equal to a golden file generated from the pre-change branch.
  - Implementation: snapshot test using `pdf-parse` to extract text streams (avoids font-rendering differences from PDFKit metadata). The text content per page must equal the snapshot.
- For each variant: render PDF with one slot overridden → assert exactly that string appears and the surrounding strings don't change.

**E2E (manual checklist before push):**
1. Open assessment page on a real application → Permit Preview tab.
2. Edit `permit.abstraction_individual.en.para_3.validity` to "TEST validity sentence."
3. Confirm in modal → save → preview re-renders → see "TEST validity sentence."
4. Reload page → text persists.
5. Open same application as a second user → see the override → click reset → preview returns to default.
6. Approver opens application → "Document edits" pane shows the diff.

---

## 11. Out-of-scope follow-ups (recorded for next plan)

- **Approver-side editing.** Currently approvers can only see edits, not change them.
- **Template-level editing.** Currently every override is per-application. A future "edit defaults for variant X" admin tool would store defaults in a new `document_text_templates` table.
- **Rich text** (bold/italic/lists). Significant change to renderer; not requested.
- **Per-slot version history.** Today only the latest edit is retained per slot. A `document_text_overrides_history` table can be added if compliance requires full audit.
- **"Defaults changed since you last edited"** banner per slot when downstream structured values change. Recorded in the brainstorm; deferred from v1 because it requires a comparison helper between snapshot text and current default per slot.
- **Cross-update prompt for multi-value paragraphs.** v1 only prompts when an override is a single structured value (e.g. just "47 m³/year"). Multi-value paragraphs need NLP-style extraction; deferred.
