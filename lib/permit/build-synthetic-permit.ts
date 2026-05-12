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

/**
 * Reconstructs a PermitWithApplication-shaped object for a **renewal** from
 * a manual/legacy registry permit that has no row in the permits table.
 *
 * PermitRenewalForm stores the original permit's details in
 * internal_notes.permitDetails and the registry lookup result in
 * internal_notes.permitReference. This function merges both sources so
 * PermitRenewalForm renders correctly on the applicant dashboard and staff
 * review pages.
 *
 * @param parsedNotes   Parsed internal_notes from the renewal application.
 * @param applicant     The application's applicant object (from the DB join).
 * @param applicationId The renewal application's own ID (used for application.id).
 */
export function buildSyntheticRenewalPermit(
  parsedNotes: Record<string, unknown> | null,
  applicant?: Record<string, unknown> | null,
  applicationId?: string,
) {
  const permitNumber = (parsedNotes?.originalPermitNumber as string) || "";
  const permitId =
    (parsedNotes?.originalPermitId as string) || `manual-${permitNumber}`;
  const pd = (parsedNotes?.permitDetails as Record<string, unknown>) || {};
  const permitRef = parsedNotes?.permitReference as Record<string, unknown> | null | undefined;
  const snap = (permitRef?.registrySnapshot as Record<string, unknown>) || {};
  const now = new Date().toISOString();

  return {
    id: permitId,
    application_id: "",
    permit_number: permitNumber || (permitRef?.inputPermitNumber as string) || "",
    status: "active" as const,
    water_source: (pd.waterSourceType as string) || (snap.water_source as string) || "other",
    purpose: (pd.waterPurpose as string) || (snap.purpose as string) || "other",
    water_allowance: pd.waterAllowance ? Number(pd.waterAllowance) : 0,
    allowance_unit: (pd.allowanceUnit as string) || "m³/year",
    issuing_authority: (snap.issuing_authority as string) || "Rwanda Water Resources Board",
    issued_date: (pd.issuedDate as string) || (snap.issued_date as string) || "",
    expiry_date: (pd.expiryDate as string) || (snap.expiry_date as string) || "",
    is_renewal: false,
    is_transfer: false,
    is_modification: false,
    created_at: now,
    updated_at: now,
    application: {
      id: applicationId || "",
      project_title: "",
      province: (pd.province as string) || "",
      district: (pd.district as string) || "",
      sector: (pd.sector as string) || "",
      cell: (pd.cell as string) || "",
      village: (pd.village as string) || "",
      water_body_name: (pd.waterSourceName as string) || "",
      water_purpose: (pd.waterPurpose as string) || "",
      water_source: (pd.waterSourceType as string) || "",
      water_taking_method: (pd.abstractionMethod as string) || "",
      flow_rate_m3_per_second: pd.flowRate ? Number(pd.flowRate) : null,
      max_daily_volume_m3: pd.maxDailyVolume ? Number(pd.maxDailyVolume) : null,
      max_yearly_volume_m3: pd.maxYearlyVolume ? Number(pd.maxYearlyVolume) : null,
      concession_area: pd.concessionArea ? Number(pd.concessionArea) : null,
      intended_activities: pd.intendedActivity ? [(pd.intendedActivity as string)] : [],
      applicant: {
        id: (applicant?.id as string) || "",
        email: (applicant?.email as string) || "",
        first_name: (applicant?.first_name as string) || "",
        last_name: (applicant?.last_name as string) || "",
        company_name: (applicant?.company_name as string) || "",
        account_type: (applicant?.account_type as string) || "individual",
      },
    },
    permitReference: permitRef,
  };
}
