import { z } from "zod";

const nullableString = z.union([z.string(), z.null()]).transform((value) => {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
});


/**
 * Compliance is normally derived from the recorded action at read time
 * (see app/api/staff/inspection-registry/route.ts), so an explicit value is
 * only accepted in its two canonical forms. `null` clears the stored value
 * and hands the status back to the read-time derivation.
 */
const nullableCompliance = z.union([z.string(), z.null()]).transform((value, ctx) => {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "complying") return "Complying";
  if (lower === "not complying") return "Not complying";
  ctx.addIssue({
    code: "custom",
    message: "Compliance must be 'Complying' or 'Not complying' (or empty to derive from the action)",
  });
  return z.NEVER;
});

export const inspectionRegistryEditableSchema = z.object({
  permit_holder: nullableString,
  permit_number: nullableString,
  activity: nullableString,
  district: nullableString,
  compliance_status: nullableCompliance,
  observation: nullableString,
  action: nullableString,
  // Free text: the imported register records date RANGES ("13th -17th June 2022").
  inspection_date_text: z
    .union([z.string().max(100, "Inspection date is too long"), z.null()])
    .pipe(nullableString),
});

export const inspectionRegistryPatchSchema = inspectionRegistryEditableSchema.partial().strict();

export const inspectionRegistryVersionSchema = z
  .string()
  .trim()
  .min(1, "expected_updated_at is required")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "expected_updated_at must be a valid date-time");

export type InspectionRegistryPatchInput = z.infer<typeof inspectionRegistryPatchSchema>;
