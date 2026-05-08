export const ORGANISATION_ACCOUNT_TYPES = [
  "company",
  "cooperative",
  "organization",
  "institution",
  "ngo_association",
] as const;

export type OrganisationAccountType = (typeof ORGANISATION_ACCOUNT_TYPES)[number];
export type SignupAccountType = "individual" | OrganisationAccountType;

export function isOrganisationAccountType(value: unknown): value is OrganisationAccountType {
  return (
    typeof value === "string" &&
    (ORGANISATION_ACCOUNT_TYPES as readonly string[]).includes(value)
  );
}

export function normalizeSignupAccountType(value: unknown): SignupAccountType | null {
  if (value === "individual") return "individual";
  if (isOrganisationAccountType(value)) return value;
  return null;
}
