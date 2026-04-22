import { z } from "zod";

const nullableString = z.union([z.string(), z.null()]).transform((value) => {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
});

const nullableDateString = z.union([z.string(), z.null()]).transform((value, ctx) => {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    ctx.addIssue({ code: "custom", message: "Invalid date value" });
    return z.NEVER;
  }
  return parsed.toISOString().slice(0, 10);
});

export const permitRegistryEditableSchema = z.object({
  permit_holder: nullableString,
  permit_number: nullableString,
  regime: nullableString,
  water_source: nullableString,
  volume_or_area: nullableString,
  method_of_water_taking: nullableString,
  authorized_activity: nullableString,
  location: nullableString,
  latitude: z.union([z.number().min(-90).max(90), z.null()]),
  longitude: z.union([z.number().min(-180).max(180), z.null()]),
  issuance_date: nullableDateString,
  duration: nullableString,
  expiration_date: nullableDateString,
  status: nullableString,
  contact: nullableString,
});

export const permitRegistryPatchSchema = permitRegistryEditableSchema.partial().strict();

export const permitRegistryVersionSchema = z
  .string()
  .trim()
  .min(1, "expected_updated_at is required")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "expected_updated_at must be a valid date-time");

export type PermitRegistryPatchInput = z.infer<typeof permitRegistryPatchSchema>;
