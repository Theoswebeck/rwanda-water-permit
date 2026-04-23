# Implementation Plan — Free-text Slot Editor for Permit & Contract

**Spec:** `docs/superpowers/specs/2026-04-23-document-text-editor-design.md`
**Branches:** `chore/stage-unstaged-2026-03-01` (prod) and `chore/stage-unstaged-2026-03-01-uat` (staging) — push to both when each phase is verified.
**Owner:** AI agent + RWB engineer review.

---

## Phase ordering

The work is split into 4 phases, each independently shippable. **Phases 1 and 2 can be merged to staging on their own without breaking existing behaviour** because the new editor is feature-flagged off until Phase 3 mounts it.

| Phase | Deliverable | Ship-able alone? |
|-------|-------------|------------------|
| 1 | Foundation: types, slot catalogue scaffolding, envelope helpers, resolver, unit tests | yes (no UI/API surface) |
| 2 | Permit slot catalogue (all 4 variants) + renderer wiring + golden-file parity test | yes (renderer behaviour unchanged when no overrides) |
| 3 | API routes (GET + POST) + editor UI + diff modal + assessment-page mount + structured-field cross-update prompt | yes (feature flag controls visibility) |
| 4 | Contract slot catalogue + contract renderer wiring + contract preview integration + approver pane | yes |

---

## Phase 1 — Foundation

**Goal:** types, helpers, resolver, tests. Zero changes to renderers, APIs, or UI.

### Tasks

1. **Create `lib/document-slots/types.ts`**
   - Export `DocumentTextSlot`, `SlotResolverContext`, `DocumentTextOverridesEnvelope`, `DocumentTextOverrideEntry`, `PermitVariant`, `DocumentKind`, `SlotLanguage`.
   - `SlotResolverContext` carries the same shape `lib/pdf-permit-server.ts` already builds (application row, applicant row, effective notes, formatted dates, water source, etc.). Define it as a stable type so renderers and resolvers share it.

2. **Create `lib/document-slots/envelope.ts`**
   - `getDocumentTextOverridesEnvelope(internalNotesString | null): DocumentTextOverridesEnvelope` — empty envelope when notes are missing/invalid; uses `parseInternalNotesStrict` semantics from `lib/document-overrides.ts`.
   - `setDocumentTextOverridesEnvelope(internalNotesObject, env): newInternalNotesObject` — pure, returns a new object.
   - `applyPatches(env, patches: Array<{slotId, text: string | null}>, editor: EditorClaims): DocumentTextOverridesEnvelope` — returns a new envelope with patches applied; deletes key when `text === null`; bumps `version`; updates `updatedAt`/`updatedBy`.
   - `EMPTY_ENVELOPE` constant.

3. **Create `lib/document-slots/index.ts`**
   - `registerSlots(slots: DocumentTextSlot[])` — internal slot registry by id (Map<string, DocumentTextSlot>).
   - `findSlot(id)` returns slot or `undefined`.
   - `getSlotsForDocument(kind, variant?)` returns slot list ordered by `(group, language, declared order)`.
   - Initially registry is empty (catalogues plug in during phases 2 + 4).

4. **Create `lib/document-slots/resolver.ts`**
   - `resolveSlotText(slotId, ctx): string` — pulls envelope from `ctx.application.internal_notes`, returns override.text when present and non-empty, else `slot.defaultResolver(ctx)`.
   - `resolveSlotsForEditor(documentKind, variant, ctx)` — the helper the GET API uses. Returns `Array<{ slot, defaultText, overrideText | null, editedAt, editedBy }>`.

5. **Runtime invariant script `scripts/check-document-slots.ts`** (the repo has no test framework today; follow-up plan should land vitest, but this gets us coverage now)
   - Imports `lib/document-slots/*` directly via `tsx` and runs assertions: empty envelope on null/garbage, strict-vs-best-effort read paths, `applyPatches` purity + null patch deletes key + version increments + over-cap rejected, `registerSlots` rejects duplicates, `resolveSlotText` precedence rules, unknown slot throws, editor list shape.
   - Exits non-zero on failure; 44 invariants in v1.

### Verification

```bash
npx tsc --noEmit
npx tsx scripts/check-document-slots.ts
```

All green; no other code touched yet.

### Commit

```
feat(document-slots): foundation types, envelope, resolver, registry

Adds the lib/document-slots module that future phases will plug
permit + contract slot catalogues into. No renderer or API changes
yet.
```

Push to both branches.

---

## Phase 2 — Permit slot catalogue + renderer wiring

**Goal:** Every text emission in `lib/pdf-permit-server.ts` now goes through `resolveSlotText`. Output is byte-equivalent when no overrides exist.

### Tasks

1. **Create `lib/document-slots/permit-slots.ts`**

   Helper:

   ```ts
   function permitSlot(args: { variant: PermitVariant; language: "en" | "rw"; group: string; key: string; label: string; resolver: (ctx) => string; structuredField?: ...; softMaxLength?: number }): DocumentTextSlot
   ```

   Generates id `permit.<variant>.<language>.<key>`. Define one constant array per variant by composing from a shared helper that takes the variant-specific authorization paragraph.

   For each of the 4 variants enumerate all slots from spec §7.1. Each `defaultResolver` lifts the **exact** template literal currently in the renderer — no logic changes, only relocation.

   Call `registerSlots(permitSlots)` at module top.

2. **Refactor `lib/pdf-permit-server.ts`**
   - For each variant renderer (`renderAbstractionIndividual`, `renderAbstractionOrganization`, `renderConcessionIndividual`, `renderConcessionOrganization`):
     - Build a `SlotResolverContext` once at the top.
     - Replace every literal text emission with `resolveSlotText("...", ctx)`.
   - Closing block date slot reuses the existing `fmtDMY(new Date())` resolver (today, Rwanda format) — fixes the original ask.
   - Header / footer / QR caption / draft banner all routed through slots.
   - **Do not** change geometry (x, y, width, alignment), font choice, font size, color, or any `doc.text(...)` options.

3. **Slot label review**
   - Group names: `Header`, `Authorization`, `Validity`, `Contract reference`, `Closing block`, `Footer`. (Bilingual variant adds `Authorization (Kinyarwanda)`, etc.)
   - Labels must be human-meaningful in the editor (e.g. "Header — Permit title (English)" not just `title.en`).

4. **Golden-file parity test** (`__tests__/pdf-permit-server.parity.test.ts`)
   - Build a fixture application per variant.
   - Render PDF on `main` (pre-change) → extract text per page with `pdf-parse` → store as snapshot in `__tests__/__snapshots__/permit-<variant>.txt`.
   - Render PDF on this branch → extract text per page → assert deep-equal to snapshot.
   - **If the snapshot files don't exist yet** the test should fail loudly so we generate them deliberately from the pre-change branch (not from the changed branch).

   Procedure to generate snapshots:
   ```bash
   git stash
   git checkout chore/stage-unstaged-2026-03-01 -- lib/pdf-permit-server.ts
   npx vitest run __tests__/pdf-permit-server.parity.test.ts -u
   git checkout HEAD -- lib/pdf-permit-server.ts
   git stash pop
   ```

5. **Override-applies test**
   - Same fixtures, but apply one slot override per variant and assert the new string appears in the extracted text and the surrounding paragraphs are unchanged.

### Verification

```bash
npx vitest run __tests__/pdf-permit-server.parity.test.ts
npx vitest run __tests__/document-slots
npx tsc --noEmit
npm run lint
```

All green. Manual sanity: hit `/api/permit/[id]/preview` for one of each variant, eyeball the PDF — must look identical to today.

### Commit

```
feat(permit-pdf): route every text emission through document-slots resolver

Catalogues all editable text positions for the 4 permit variants and
swaps every literal in lib/pdf-permit-server.ts for resolveSlotText().
Golden-file parity test confirms byte-identical output when no
overrides exist; one-slot override test confirms the resolver wins.

No editor UI or API surface yet — that lands in phase 3.
```

Push to both branches.

---

## Phase 3 — API + editor UI + assessment-page mount

**Goal:** Assessors can edit permit slots end-to-end with diff confirmation. Contract still uses old editor.

### Tasks

1. **Create `app/api/staff/applications/[id]/document-text-overrides/route.ts`**
   - `GET` handler: auth via `requireStaffSession(["assessor", "admin"], { allowSuperuser: true })`. Loads application + applicant. Builds resolver ctx. Returns the spec §4.6 payload, filtered to `?documentKind=...`.
   - `POST` handler: same auth. Body validated with Zod (`patchSchema`). Inside `withTransaction`:
     - `SET LOCAL lock_timeout = '5s'`, `statement_timeout = '15s'`.
     - `SELECT internal_notes ... FOR UPDATE`.
     - `parseInternalNotesStrict` → 409 `corrupt_notes` on parse failure.
     - Pull current envelope; check `expectedVersion` → 409 with current envelope on mismatch.
     - Validate every patch against catalogue (slot exists, variant matches, length).
     - Apply patches via `applyPatches`.
     - `UPDATE applications SET internal_notes = $2, updated_at = now()`.
     - Commit, return `{ envelope, previousEnvelope }`.
   - On lock timeout → 503 with `Retry-After: 3` (existing pattern).
   - **No `DELETE` route in v1** — reset uses `POST` with `text: null`.

2. **Reset endpoint?**
   - Decision: do **not** add a separate route. The POST handler already accepts `text: null`. One endpoint, one transaction model.

3. **Create `components/staff/document-text-editor.tsx`**
   - Props: `applicationId`, `documentKind: "permit" | "contract"`, `onSaved: () => void` (caller bumps preview refresh key).
   - State: `slots` (from GET), `drafts` (Map<slotId, string>), `pendingReset` (Set<slotId>), `dirtyCount` derived, `saving`, `error`, `confirmOpen`.
   - On mount: GET `/api/staff/applications/[id]/document-text-overrides?documentKind=permit`. Renders one row per slot with prefilled value (`overrideText ?? defaultText`). Group sticky headers per `slot.group`. Language tabs at top of body (EN | RW) when both languages exist for the variant.
   - Dirty row indicator + "Reset to default" link when `overrideText !== null`.
   - **Save** opens confirmation modal:
     - Lists each dirty slot: `Label`, before (`defaultText` or previous `overrideText`), after (current draft).
     - Per-row `structuredField` heads-up when applicable.
     - Confirm → POST patches with `expectedVersion = envelope.version` → on success call `onSaved()` and close.
   - **Discard** clears local state.
   - 409 handler: re-fetch GET, merge drafts on top, show banner.
   - Tailwind + existing shadcn primitives only; no new dependencies.

4. **Assessment-page integration**
   - Locate the page that currently renders `<DocumentValuesEditor />` (search confirmed: `components/staff/permit-preview-frame.tsx` and `app/staff/applications/[id]/assessment` route components).
   - Behind feature flag `NEXT_PUBLIC_DOCUMENT_TEXT_EDITOR_ENABLED` (default `true` after phase 3 verification, `false` until then), conditionally render `<DocumentTextEditor documentKind="permit" .../>` instead of `<DocumentValuesEditor />`.
   - Editor visibility scope rule unchanged: only show on Permit Preview / Contract tabs.
   - `onSaved` bumps the existing `previewRefreshKey` so `PermitPreviewFrame` re-fetches.

5. **Cross-update prompt for structured fields**
   - For slots with `structuredField` set whose entire override matches a parseable single value (digits + optional unit), the modal renders the heads-up row and a button that POSTs to `/api/staff/applications/[id]/assessor-adjustments` (existing route).
   - v1 ships with cross-update wired only for slots where the override is unambiguously a single value (volume only, since paragraph slots are multi-value). Other slots show the heads-up but no button — text-only.

6. **Backend integration tests** (`__tests__/api/document-text-overrides.test.ts`)
   - Happy path: GET → POST with patches → GET reflects them.
   - Stale version → 409 with envelope.
   - Unknown slot id → 400.
   - Reset (`text: null`) removes the key.
   - Lock contention test: spawn two transactions, second waits then completes against incremented version.

7. **Component test** (`__tests__/components/document-text-editor.test.tsx`)
   - Renders rows from a mocked GET.
   - Edit triggers dirty count.
   - Save opens modal with diff; confirm calls POST.
   - Reset link sends `text: null`.

### Verification

```bash
npx vitest run __tests__/api/document-text-overrides.test.ts __tests__/components/document-text-editor.test.tsx
npx tsc --noEmit
npm run lint
```

Manual E2E (spec §10):
1. As assessor on staging, open an application with each variant, edit one slot, confirm modal shows correct diff, save, see preview update.
2. Open same app in a second browser as admin → reset slot → preview returns to default.
3. Open same app as approver → confirm "Document edits" pane lists changed slots (lands in Phase 4 strictly, but a stub list can ship in 3 to validate plumbing).

### Commit (single commit at end of phase)

```
feat(staff): free-text editor for permit document slots

- New API: GET/POST /api/staff/applications/[id]/document-text-overrides
- New component: components/staff/document-text-editor.tsx
- Mounts on Permit Preview tab in assessment page when feature flag is on
- Confirmation modal renders per-slot diff before save
- Optimistic version locking + transactional save (parity with our
  document-overrides hardening from April)
- Cross-update prompt links to assessor-adjustments for volume slot
- Unit + integration tests
```

Push to both branches.

---

## Phase 4 — Contract slots + contract renderer wiring + approver pane

**Goal:** Same coverage for the Contract document. Approver review pane lists changed slots.

### Tasks

1. **Create `lib/document-slots/contract-slots.ts`**
   - Iterate the per-variant arrays exported from `lib/contract-terms.ts`. For each `(section, paragraph_index, language)`, generate a slot with id `contract.<variant>.section_<section_index>.paragraph_<paragraph_index>.<lang>` plus `contract.<variant>.section_<section_index>.title.<lang>`.
   - Default resolvers re-run the placeholder substitution from `lib/contract-placeholders.ts` so the editor sees fully-rendered text.
   - Group label = section title in English (falls back to RW when EN missing).
   - `language` derived via `getContractSectionLanguage`.

2. **Wire contract renderer**
   - In `lib/pdf-generator.ts` `generateTermsConditionsPdfBlob`, replace `section.paragraphs[i]` reads with `resolveSlotText("contract.<variant>...paragraph_<i>.<lang>", ctx)` and similar for title.
   - This file is browser-side (`jsPDF`). Resolver context must be self-contained (no Node-only imports). Build a lightweight `ctx` from the props the function already receives.
   - Confirm preview iframe (`components/contract-preview-frame.tsx` or equivalent) regenerates on save.

3. **Editor UI**
   - The component already accepts `documentKind` — extend the assessment page to render a tabbed editor with two tabs (Permit / Contract). Saving inside Contract tab calls the same POST with `documentKind: "contract"`.

4. **Approver pane**
   - New component `components/staff/document-edits-summary.tsx`. Renders read-only diff list of every overridden slot for both permit and contract.
   - Mounted on the approver review page above the decision buttons.

5. **Tests**
   - Contract parity test analogous to phase 2 — render with no overrides and assert text-stream snapshot match.
   - Override test confirming a contract paragraph swap appears in the regenerated PDF.

### Verification

```bash
npx vitest run __tests__/document-slots __tests__/pdf-permit-server.parity.test.ts __tests__/contract-pdf.parity.test.ts __tests__/api/document-text-overrides.test.ts
npx tsc --noEmit
npm run lint
```

Manual E2E:
- Edit a contract paragraph → modal diff → confirm → contract preview updates → download PDF and verify text changed.
- Approver opens application → sees both permit and contract slot diffs in summary pane.

### Commit

```
feat(contract-pdf): free-text slot editor for contract + approver review pane

- Contract slot catalogue covers every section/paragraph for all 4 variants
- jsPDF contract renderer routes text through resolveSlotText
- Editor mounts in Contract tab with same diff-confirm UX
- Approver review page shows read-only summary of every overridden slot
- Contract parity tests added
```

Push to both branches.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Renderer parity breaks because a `defaultResolver` accidentally uses a different code path than the original literal | Golden-file parity test with text-stream snapshots is the gate; CI must run it. |
| Slot id renames between releases lose existing overrides | Slot ids are stable across phases; renames require an explicit migration helper added to `envelope.ts` (out of scope for v1). |
| Two assessors editing the same slot simultaneously | Optimistic version check in POST handler; UI 409 banner. |
| `parseInternalNotesStrict` throws on legacy garbage in `internal_notes` | Already handled by 409 `corrupt_notes` response; admin runbook unchanged. |
| Editor list too long to scroll comfortably (~100+ slots on contract) | Sticky group headers + collapse-by-group affordance; if we run out of time in v1, ship without collapse and add it as a polish PR. |
| Feature flag forgotten | Default flag remains `false` until Phase 3 staging E2E passes; production flip is a separate one-line PR. |

---

## Done definition

- All 4 phases merged.
- All listed tests green in CI.
- Manual E2E checklist in spec §10 executed on staging by an RWB engineer.
- Feature flag flipped to `true` in production env.
- Old `DocumentValuesEditor` component file kept on disk but unimported; remove in the release after.
