type NotesLike = Record<string, unknown>;

export type ApplicationWorkflowKind =
  | "renewal"
  | "modification"
  | "transfer"
  | "standard";

export type ApplicationWorkflowInput = {
  application_type?: unknown;
  is_renewal?: unknown;
  is_modification?: unknown;
  internal_notes?: unknown;
};

function parseNotes(raw: unknown): NotesLike {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as NotesLike;
  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as NotesLike;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function getApplicationWorkflowKind(
  input: ApplicationWorkflowInput
): ApplicationWorkflowKind {
  const notes = parseNotes(input.internal_notes);
  const isRenewal = input.is_renewal === true || notes.isRenewal === true;
  const isModification =
    input.is_modification === true || notes.isModification === true;

  // Renewal/modification represent the current request and must take precedence
  // over transfer ancestry markers preserved in internal_notes.
  if (isRenewal) return "renewal";
  if (isModification) return "modification";

  const isTransfer =
    input.application_type === "transfer" || notes.isTransfer === true;
  if (isTransfer) return "transfer";

  return "standard";
}
