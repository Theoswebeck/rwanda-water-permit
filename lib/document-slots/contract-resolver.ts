/**
 * Returns a {@link ContractTerms} value with every editable string replaced
 * by its assessor override (when present) or the placeholder-filled default.
 *
 * Two consumers:
 *   - `<ContractTermsPreview>` (React) — replaces its own filling logic.
 *   - jsPDF callers in `app/review/page.tsx` and `app/review/permit/[id]/page.tsx`
 *     — pre-resolve sections before calling `generateTermsConditionsPdfBlob`.
 *
 * Both callers pre-import `@/lib/document-slots` (the index) so the contract
 * catalogue side-effect has fired before this function runs.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md §6.5
 */

import {
  contractTermsByVariant,
  type ContractTerms,
  type ContractTermsSection,
} from "@/lib/contract-terms";
import {
  type ApplicationForContract,
  type TransferPermitContext,
} from "@/lib/contract-placeholders";
import { selectPermitVariant, type PermitVariant } from "@/lib/permit-variant";

import { CONTRACT_PARAGRAPH_SEPARATOR } from "./contract-slots";
import { findSlot } from "./registry";
import { resolveSlotText } from "./resolver";
import { buildContractSlotContext } from "./build-context";
import type { PermitApplication } from "@/lib/permit/permit-text-data";

export type GetResolvedContractTermsInput = {
  application: ApplicationForContract & PermitApplication;
  /** Forwarded to `buildContractPlaceholderContext`. Optional — when omitted
   *  we fall back to `application.application_number ?? ""`. */
  applicationNumber?: string;
  transferPermit?: TransferPermitContext | null;
  /** Override the inferred variant (rare — used by dev/preview tooling). */
  variantOverride?: PermitVariant | null;
};

/**
 * Returns a fully-resolved ContractTerms value, or `null` when the variant
 * has no template defined. The returned object is a fresh structure — the
 * input `contractTermsByVariant` is never mutated.
 */
export function getResolvedContractTerms(
  input: GetResolvedContractTermsInput,
): ContractTerms | null {
  const variant: PermitVariant =
    input.variantOverride ??
    selectPermitVariant(
      input.application as Parameters<typeof selectPermitVariant>[0],
    );
  const template = contractTermsByVariant[variant];
  if (!template) return null;

  const ctx = buildContractSlotContext(input.application);
  // Surface transferPermit + applicationNumber to the placeholder cache used
  // by the slot resolver. We funnel them through `extras` rather than
  // mutating the application so the resolver path stays pure.
  ctx.extras = {
    ...(ctx.extras ?? {}),
    transferPermit: input.transferPermit ?? null,
  };
  if (input.applicationNumber !== undefined) {
    (ctx.application as { application_number?: string }).application_number =
      input.applicationNumber;
  }

  const resolveOptional = (slotId: string, fallback: string): string => {
    return findSlot(slotId) ? resolveSlotText(slotId, ctx) : fallback;
  };

  const headingId = `contract.${variant}.heading`;
  const subheadingId = `contract.${variant}.subheading`;
  const noticeTitleId = `contract.${variant}.notice.title`;
  const noticeBodyId = `contract.${variant}.notice.body`;

  const heading = resolveOptional(headingId, template.heading);
  const subheading = template.subheading
    ? resolveOptional(subheadingId, template.subheading)
    : undefined;

  const sections: ContractTermsSection[] = template.sections.map(
    (section, idx) => {
      const titleId = `contract.${variant}.section.${idx}.title`;
      const bodyId = `contract.${variant}.section.${idx}.body`;

      const title = resolveOptional(titleId, section.title);
      const body = resolveOptional(
        bodyId,
        section.paragraphs.join(CONTRACT_PARAGRAPH_SEPARATOR),
      );
      // Split back into paragraphs for renderers that walk the array. Empty
      // segments preserved so an assessor who deliberately puts a blank line
      // (e.g. spacing in the Signatures block) keeps it.
      const paragraphs = body.split(CONTRACT_PARAGRAPH_SEPARATOR);
      return { title, paragraphs };
    },
  );

  const importantNotice = template.importantNotice
    ? {
        title: resolveOptional(noticeTitleId, template.importantNotice.title),
        body: resolveOptional(noticeBodyId, template.importantNotice.body),
      }
    : undefined;

  const out: ContractTerms = {
    heading,
    sections,
    ...(subheading !== undefined ? { subheading } : {}),
    ...(importantNotice ? { importantNotice } : {}),
  };
  return out;
}
