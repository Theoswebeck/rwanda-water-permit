/**
 * Contract document slot catalogue.
 *
 * Generated programmatically from {@link contractTermsByVariant} so the slot
 * list always tracks the contract template. Per spec §4.1 we register one
 * slot per editable string; for the contract that means:
 *
 *   - `contract.<variant>.heading`              — top heading (inline)
 *   - `contract.<variant>.subheading`           — optional subheading (inline)
 *   - `contract.<variant>.section.<idx>.title`  — section title (inline)
 *   - `contract.<variant>.section.<idx>.body`   — joined paragraphs (textarea)
 *   - `contract.<variant>.notice.title`         — important notice title (inline)
 *   - `contract.<variant>.notice.body`          — important notice body (textarea)
 *
 * Section indices come from the **original** position inside `terms.sections`
 * for the variant, so they are stable across language splits and re-orderings
 * by the editor / preview. The body slot's default text is the section's
 * paragraphs joined with `\n\n` and run through {@link fillContractText} so
 * the assessor sees the exact text the renderer would emit. Override text is
 * stored verbatim — placeholders inside an override are NOT re-substituted
 * (snapshot semantics, spec §4.4).
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md §4
 */

import {
  contractTermsByVariant,
  getContractSectionLanguage,
  parseSectionHeading,
  type ContractTerms,
} from "@/lib/contract-terms";
import {
  buildContractPlaceholderContext,
  fillContractText,
  type ApplicationForContract,
  type ContractPlaceholderContext,
  type TransferPermitContext,
} from "@/lib/contract-placeholders";
import type { PermitVariant } from "@/lib/permit-variant";

import { registerSlots } from "./registry";
import type {
  DocumentTextSlot,
  SlotLanguage,
  SlotResolverContext,
} from "./types";

/** Joins paragraphs with the same separator the React preview / jsPDF
 *  renderer use between paragraphs. Kept as a constant so the resolver and
 *  the renderer agree on the split character if either side ever changes. */
export const CONTRACT_PARAGRAPH_SEPARATOR = "\n\n";

/** Read-or-build the placeholder context once per resolver invocation. The
 *  context is derived purely from the application + applicationNumber +
 *  transferPermit; we cache it on `ctx.extras.contractPlaceholderCache` so a
 *  single PDF render that resolves dozens of contract slots only pays the
 *  build cost once. */
function getPlaceholderCtx(ctx: SlotResolverContext): ContractPlaceholderContext {
  const extras = (ctx.extras ?? {}) as Record<string, unknown>;
  const cached = extras.contractPlaceholderCache as
    | { ctx: ContractPlaceholderContext; appId: string }
    | undefined;
  const appId = String(ctx.application.id ?? "");
  if (cached && cached.appId === appId) return cached.ctx;

  const application = ctx.application as unknown as ApplicationForContract;
  const applicationNumber =
    typeof (ctx.application as { application_number?: unknown }).application_number === "string"
      ? ((ctx.application as { application_number?: string }).application_number ?? "")
      : "";
  const transferPermit =
    (extras.transferPermit as TransferPermitContext | null | undefined) ?? null;

  const built = buildContractPlaceholderContext(
    application,
    applicationNumber,
    transferPermit,
  );

  // Cache on extras for the rest of this resolution pass. Renderers that
  // build a fresh ctx per render get a cold cache; that's intentional — we
  // never reuse a stale placeholder ctx across applications.
  if (ctx.extras) {
    (ctx.extras as Record<string, unknown>).contractPlaceholderCache = {
      ctx: built,
      appId,
    };
  }
  return built;
}

function fill(text: string, ctx: SlotResolverContext): string {
  return fillContractText(text, getPlaceholderCtx(ctx));
}

function joinParagraphs(paragraphs: readonly string[]): string {
  return paragraphs.join(CONTRACT_PARAGRAPH_SEPARATOR);
}

/** Pick a stable per-section group label for the editor UI. We surface the
 *  PART heading when present (so all "PART I" sections cluster), otherwise
 *  the article heading. Never throws — defaults to the raw title. */
function groupForSection(title: string): string {
  const { partHeading, articleHeading } = parseSectionHeading(title);
  return partHeading || articleHeading || title;
}

function languageOf(title: string): SlotLanguage {
  return getContractSectionLanguage(title);
}

/** Build all slots for one variant. Pure; the registry call lives below. */
function buildVariantSlots(
  variant: PermitVariant,
  terms: ContractTerms,
): DocumentTextSlot[] {
  const out: DocumentTextSlot[] = [];

  out.push({
    id: `contract.${variant}.heading`,
    documentKind: "contract",
    variant,
    language: "en",
    group: "Document header",
    label: "Contract heading",
    inline: true,
    softMaxLength: 200,
    defaultResolver: (ctx) => fill(terms.heading, ctx),
  });

  if (terms.subheading) {
    out.push({
      id: `contract.${variant}.subheading`,
      documentKind: "contract",
      variant,
      language: "en",
      group: "Document header",
      label: "Contract subheading",
      inline: false,
      softMaxLength: 600,
      defaultResolver: (ctx) =>
        // Subheading is informational text shown in the React preview only.
        // Rendered identically in both languages today.
        fill(terms.subheading ?? "", ctx),
    });
  }

  terms.sections.forEach((section, idx) => {
    const lang = languageOf(section.title);
    const group = groupForSection(section.title);

    out.push({
      id: `contract.${variant}.section.${idx}.title`,
      documentKind: "contract",
      variant,
      language: lang,
      group,
      label: `Section ${idx + 1} — title`,
      inline: true,
      softMaxLength: 300,
      defaultResolver: (ctx) => fill(section.title, ctx),
    });

    out.push({
      id: `contract.${variant}.section.${idx}.body`,
      documentKind: "contract",
      variant,
      language: lang,
      group,
      label: `Section ${idx + 1} — body`,
      inline: false,
      softMaxLength: 4000,
      defaultResolver: (ctx) =>
        fill(joinParagraphs(section.paragraphs), ctx),
    });
  });

  if (terms.importantNotice) {
    out.push({
      id: `contract.${variant}.notice.title`,
      documentKind: "contract",
      variant,
      language: "en",
      group: "Important notice",
      label: "Important notice — title",
      inline: true,
      softMaxLength: 200,
      defaultResolver: (ctx) => fill(terms.importantNotice?.title ?? "", ctx),
    });
    out.push({
      id: `contract.${variant}.notice.body`,
      documentKind: "contract",
      variant,
      language: "en",
      group: "Important notice",
      label: "Important notice — body",
      inline: false,
      softMaxLength: 1500,
      defaultResolver: (ctx) => fill(terms.importantNotice?.body ?? "", ctx),
    });
  }

  return out;
}

// ── Registration (module load side-effect) ────────────────────────────────
const ALL_SLOTS: DocumentTextSlot[] = [];
for (const [variant, terms] of Object.entries(contractTermsByVariant) as [
  PermitVariant,
  ContractTerms | null,
][]) {
  if (!terms) continue;
  ALL_SLOTS.push(...buildVariantSlots(variant, terms));
}
registerSlots(ALL_SLOTS);

/** Exposed for the parity test only — production code reads slots through
 *  `getSlotsForDocument("contract", variant)`. */
export const __INTERNAL_contractSlotsForTests = ALL_SLOTS;
