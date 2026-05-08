import { isOrganisationAccountType } from "@/lib/auth/account-types";

type ApplicantProfile = {
  account_type?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
};

type ApplicantFields = {
  fullNameApplicant?: string;
  categoryApplicant?: string;
};

export function applyLockedApplicantProfileFields<T extends ApplicantFields>(
  values: T,
  profile?: ApplicantProfile | null
): T {
  if (!profile) return values;

  if (profile.account_type === "individual") {
    const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
    return {
      ...values,
      fullNameApplicant: fullName || values.fullNameApplicant,
      categoryApplicant: "individual",
    };
  }

  if (isOrganisationAccountType(profile.account_type)) {
    return {
      ...values,
      fullNameApplicant: profile.company_name || values.fullNameApplicant,
      categoryApplicant: profile.account_type,
    };
  }

  return values;
}
