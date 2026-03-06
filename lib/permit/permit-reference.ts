import type { Application } from "@/types/database";

export type PermitReferenceSource = "linked_system" | "registry_unlinked";
export type PermitLookupStatus = "found" | "not_found";

export interface PermitRegistrySnapshot {
  source: "permit_registry";
  registry_id?: string | null;
  permit_number: string;
  status?: string | null;
  water_source?: string | null;
  purpose?: string | null;
  permit_holder?: string | null;
  registry_location?: string | null;
  issued_date?: string | null;
  expiry_date?: string | null;
  water_allowance?: string | null;
  allowance_unit?: string | null;
  issuing_authority?: string | null;
}

export interface PermitReference {
  source: PermitReferenceSource;
  inputPermitNumber: string;
  normalizedPermitNumber: string;
  lookupStatus: PermitLookupStatus;
  registrySnapshot?: PermitRegistrySnapshot | null;
  // Applicant-provided fields used when permit is not linked in-system.
  manualHolderName?: string;
  manualLocation?: string;
  manualActivity?: string;
  manualHolderType?: "individual" | "company_org";
}

export interface ManualPermitSelectionPayload {
  permitReference: PermitReference;
  identityProofFile: File | null;
}

type ParsedNotes = {
  permitReference?: PermitReference;
  [key: string]: unknown;
};

export function parseInternalNotes(input?: string | null): ParsedNotes {
  if (!input || !input.trim()) return {};
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === "object") {
      return parsed as ParsedNotes;
    }
  } catch {
    return {};
  }
  return {};
}

export function getPermitReferenceFromApplication(application?: Application | null): PermitReference | null {
  if (!application) return null;
  const notes = parseInternalNotes(application.internal_notes);
  const reference = notes.permitReference;
  if (!reference || typeof reference !== "object") return null;
  return reference;
}

