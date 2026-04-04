/**
 * Reconstructs a PermitWithApplication-shaped object from internal_notes for
 * manual/legacy permits that were never in the permits table.
 *
 * When an applicant enters a legacy permit number via ManualPermitEntryCard,
 * new-application/page.tsx synthesizes an in-memory permit with
 * id: `manual-${permitNumber}` and saves originalPermitId as that sentinel
 * into internal_notes. This helper reconstructs the same shape so that
 * PermitTransferForm can render correctly in staff review pages.
 *
 * PermitTransferForm already handles this via:
 *   const isManualPermit = permit.id?.startsWith("manual-")
 * and initialData (from transferFormData) overrides all form defaults,
 * so this object is mainly structural scaffolding.
 */
export function buildSyntheticPermitFromNotes(
  parsedNotes: Record<string, unknown> | null
) {
  const permitNumber = (parsedNotes?.originalPermitNumber as string) || "";
  const id =
    (parsedNotes?.originalPermitId as string) || `manual-${permitNumber}`;
  const tf =
    (parsedNotes?.transferFormData as Record<string, unknown>) || {};
  const now = new Date().toISOString();

  return {
    id,
    application_id: "",
    permit_number: permitNumber,
    status: "active" as const,
    water_source: (tf.waterSourceType as string) || "other",
    purpose: (tf.waterPurpose as string) || "other",
    water_allowance: tf.waterAllowance ? Number(tf.waterAllowance) : 0,
    allowance_unit: (tf.allowanceUnit as string) || "m³/year",
    issuing_authority: "Rwanda Water Resources Board",
    issued_date: (tf.effectiveDate as string) || now.split("T")[0],
    expiry_date: (tf.expirationDate as string) || "",
    is_renewal: false,
    is_transfer: false,
    is_modification: false,
    created_at: now,
    updated_at: now,
    application: {
      id: "",
      project_title: (tf.facilityProjectName as string) || "Legacy Permit",
      province: (tf.permitLocationProvince as string) || "",
      district: (tf.permitLocationDistrict as string) || "",
      sector: (tf.permitLocationSector as string) || "",
      cell: (tf.permitLocationCell as string) || "",
      water_source: (tf.waterSourceType as string) || "",
      water_purpose: (tf.waterPurpose as string) || "",
    },
  };
}
