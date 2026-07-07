/**
 * Build a {@link SlotResolverContext} from an application + applicant row.
 *
 * Two construction sites use this:
 *   1. The PDF renderer (`lib/pdf-permit-server.ts`), which already builds its
 *      own context inline because it needs renderer-specific extras
 *      (skipQr, isModified). That stays as-is.
 *   2. The new editor API (`/api/staff/applications/[id]/document-text-overrides`),
 *      which calls this helper to produce the same context shape so the
 *      editor preview text matches what the PDF will emit.
 *
 * Spec: docs/superpowers/specs/2026-04-23-document-text-editor-design.md §4.4
 */

import { addPermitExpiry } from "@/lib/date-math";
import { getEffectiveInternalNotes } from "@/lib/document-overrides";
import {
  resolvePermitDuration,
  type PermitApplication,
} from "@/lib/permit/permit-text-data";
import { selectPermitVariant } from "@/lib/permit-variant";
import type {
  PermitSlotContextExtras,
  SlotResolverContext,
} from "./types";

export type BuildPermitContextInput = {
  application: PermitApplication;
  /** When omitted, defaults to a date placeholder for unissued previews. */
  permitNumber?: string;
  /** When omitted, defaults to "today" — only meaningful for previews. */
  issueDate?: Date;
  /** When omitted, computed from issueDate + resolvePermitDuration. */
  expiryDate?: Date;
  /** Signing date for "Done at … On". When omitted, defaults to issueDate. */
  signingDate?: Date;
  /** When omitted, derived from application_type / notes flags. */
  isModified?: boolean;
  /** Always true for editor previews (no QR is generated). */
  skipQr?: boolean;
};

function resolveTimeZoneYear(d: Date): number {
  return new Date(
    d.toLocaleString("en-US", { timeZone: "Africa/Kigali" }),
  ).getFullYear();
}

/**
 * Build the full SlotResolverContext for a permit. All fields the slot
 * resolvers might read are populated. `internal_notes` is *not* mutated —
 * the resolver chain reads `effectiveNotes` (with overrides flattened) for
 * dynamic values, and `application.internal_notes` (raw) for the override
 * envelope.
 */
export function buildPermitSlotContext(
  input: BuildPermitContextInput,
): SlotResolverContext {
  const { application } = input;
  const issueDate = input.issueDate ?? new Date();
  const expiryDate =
    input.expiryDate ??
    addPermitExpiry(issueDate, resolvePermitDuration(application));
  const headerYear = resolveTimeZoneYear(issueDate);

  const permit: PermitSlotContextExtras = {
    permitNumber: input.permitNumber ?? `XXXX/RWB/${headerYear}`,
    issueDate,
    expiryDate,
    signingDate: input.signingDate ?? issueDate,
    isModified: Boolean(input.isModified),
    skipQr: input.skipQr ?? true,
    headerYear,
  };

  const variant = selectPermitVariant(
    application as Parameters<typeof selectPermitVariant>[0],
  );

  return {
    application: application as unknown as SlotResolverContext["application"],
    applicant:
      (application.applicant as unknown as Record<string, unknown>) ?? null,
    effectiveNotes: getEffectiveInternalNotes(application.internal_notes),
    variant,
    permit,
  };
}

/**
 * Build a context for the contract document. Contract slots don't use the
 * `permit` namespace (no permit number / issue date in the contract today),
 * but they do consume `applicant`, `effectiveNotes`, and `variant`. Same
 * helper, sans the permit-specific extras.
 */
export function buildContractSlotContext(
  application: PermitApplication,
  opts?: { permitNumber?: string },
): SlotResolverContext {
  const variant = selectPermitVariant(
    application as Parameters<typeof selectPermitVariant>[0],
  );
  const ctx: SlotResolverContext = {
    application: application as unknown as SlotResolverContext["application"],
    applicant:
      (application.applicant as unknown as Record<string, unknown>) ?? null,
    effectiveNotes: getEffectiveInternalNotes(application.internal_notes),
    variant,
  };
  if (opts?.permitNumber) {
    ctx.permit = {
      permitNumber: opts.permitNumber,
      issueDate: new Date(),
      expiryDate: new Date(),
      signingDate: new Date(),
      isModified: false,
      skipQr: true,
      headerYear: new Date().getFullYear(),
    };
  }
  return ctx;
}
