/**
 * Notes-only resolution of the four fields the permit renderers care about:
 *   - permitNumber   (original number for renewal/modification/transfer)
 *   - issueDate      (validity start — preserved for modifications)
 *   - expiryDate     (validity end   — preserved for modifications/transfers)
 *   - signingDate    ("Done at … On" — approval date or today in preview)
 *
 * Pure, synchronous, no DB access. This is the *editor-preview flavour*: it
 * uses only what the application already carries in `internal_notes` so the
 * assessor's document-text editor can render the correct snapshot without an
 * extra round-trip. The permit-preview PDF route uses a richer async version
 * that additionally consults `public.permits` and `public.permit_registry`
 * for fidelity; both surfaces agree on the shared cases here.
 *
 * Kept separate from `resolve-modification-validity` so the async preview
 * route can still layer DB sources on top without duplication.
 */
import { addPermitExpiry } from "@/lib/date-math";
import {
  parsePermitDate,
  resolveModificationValidity,
  type ValiditySource,
} from "@/lib/permit/resolve-modification-validity";
import { resolvePreviewPermitNumber } from "@/lib/permit/resolve-preview-permit-number";

export type NotesBasedRenderDates = {
  permitNumber: string;
  /** Undefined when no source could supply a value — caller falls back to today. */
  issueDate?: Date;
  /** Undefined when no source could supply a value — caller falls back to today+duration. */
  expiryDate?: Date;
  /** Populated for renewals inheriting the original permit's total duration. */
  permitValidityYears?: number;
  /** Always defined: approval date if approved, otherwise today. */
  signingDate: Date;
};

export function resolvePermitRenderDatesFromNotes(opts: {
  notes: Record<string, any> | null;
  approvedAt?: string | Date | null;
  isModification: boolean;
  isRenewal: boolean;
  isTransfer: boolean;
}): NotesBasedRenderDates {
  const { notes, approvedAt, isModification, isRenewal, isTransfer } = opts;

  const permitNumber = resolvePreviewPermitNumber(notes);
  const signingDate = parsePermitDate(approvedAt) ?? new Date();

  let issueDate: Date | undefined;
  let expiryDate: Date | undefined;
  let permitValidityYears: number | undefined;

  if (isModification) {
    // Priority order mirrors the preview route (minus DB sources): the
    // registry snapshot captured at creation, then legacy transferFormData.
    const sources: ValiditySource[] = [
      {
        issued: notes?.permitReference?.registrySnapshot?.issued_date,
        expiry: notes?.permitReference?.registrySnapshot?.expiry_date,
      },
      {
        issued: notes?.transferFormData?.effectiveDate,
        expiry: notes?.transferFormData?.expirationDate,
      },
    ];
    const resolved = resolveModificationValidity(sources);
    if (resolved.issuedDate) issueDate = resolved.issuedDate;
    if (resolved.expiryDate) expiryDate = resolved.expiryDate;
  } else if (isRenewal || isTransfer) {
    const expiryFromNotes = parsePermitDate(notes?.transferFormData?.expirationDate);
    const issueFromNotes = parsePermitDate(notes?.transferFormData?.effectiveDate);

    if (expiryFromNotes) {
      if (isTransfer) {
        // Transfer: preserve the exact original expiry date.
        expiryDate = expiryFromNotes;
      } else if (isRenewal && issueFromNotes) {
        // Renewal: same total duration as the original, restarting today.
        const totalYears = Math.round(
          (expiryFromNotes.getTime() - issueFromNotes.getTime()) /
            (365.25 * 24 * 3600 * 1000),
        );
        if (totalYears >= 1 && totalYears <= 15) {
          permitValidityYears = totalYears;
          expiryDate = addPermitExpiry(new Date(), totalYears);
        }
      }
    }

    // Renewal fallback: PermitRenewalForm may store manual-registry dates
    // under `permitDetails` instead of `transferFormData`.
    if (isRenewal && !expiryDate) {
      const expiryFromDetails = parsePermitDate(notes?.permitDetails?.expiryDate);
      const issueFromDetails = parsePermitDate(notes?.permitDetails?.issuedDate);
      if (expiryFromDetails && issueFromDetails) {
        const totalYears = Math.round(
          (expiryFromDetails.getTime() - issueFromDetails.getTime()) /
            (365.25 * 24 * 3600 * 1000),
        );
        if (totalYears >= 1 && totalYears <= 15) {
          permitValidityYears = totalYears;
          expiryDate = addPermitExpiry(new Date(), totalYears);
        }
      }
    }
  }

  return { permitNumber, issueDate, expiryDate, permitValidityYears, signingDate };
}
