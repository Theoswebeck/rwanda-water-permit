/**
 * Server-side loader for everything the inspection-report PDF needs.
 *
 * The inspection editor pages resolve their locked (permit-derived) fields in
 * the browser via `fetchInspectionData`, which talks to the self-hosted
 * Supabase shim and therefore cannot run on the server. Rather than restate
 * that derivation — hundreds of lines of fallbacks the RWB feedback rounds
 * shaped — this module fetches the same rows with plain SQL and hands them to
 * the SAME pure mappers the editor uses (`prepareInspectionData` /
 * `prepareRegistryInspectionData`). What ends up in the PDF is what the page
 * shows.
 *
 * Node-only (API routes).
 */
import { query } from "@/lib/db/postgres";
import {
  prepareInspectionData,
  prepareRegistryInspectionData,
} from "@/lib/inspection-utils";
import type {
  InspectionReportForm,
  InspectionReportLocked,
  InspectionReportTemplate,
} from "@/lib/pdf-inspection-report-server";

export interface InspectionReportContext {
  inspectionId: string;
  inspectionNumber: string | null;
  workflowStatus: string | null;
  template: InspectionReportTemplate;
  manualInspection: boolean;
  permitNumber: string | null;
  inspectorName: string | null;
  inspectionDate: string | null;
  approvedAt: string | null;
  form: InspectionReportForm;
  locked: InspectionReportLocked | null;
}

function parseNotes(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      // ignore malformed JSON — same tolerance as the editor
    }
  }
  return null;
}

function toDateOnly(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.trim()) {
    return value.includes("T") ? value.split("T")[0] : value.trim();
  }
  return null;
}

/**
 * Same rule as the inspection pages (`templateFromPermit`): a concession regime
 * or a lake fish-farming activity gets the concession form, everything else the
 * authorization form.
 */
function deriveTemplate(intendedActivities: unknown, purpose?: string | null): InspectionReportTemplate {
  const activities = Array.isArray(intendedActivities) ? intendedActivities.map(String) : [];
  const primary = (activities[0] || purpose || "").toLowerCase();
  if (
    primary === "fish_farming_lakes" ||
    primary === "fish farming in lakes" ||
    primary.includes("aquaculture")
  ) {
    return "concession";
  }
  return "authorization";
}

/** Columns of `public.inspections` the report renders. */
const INSPECTION_SELECT = `
  i.id,
  i.inspection_number,
  i.application_id,
  i.owner_kind,
  i.owner_id,
  i.inspector_id,
  i.inspection_template,
  i.workflow_status,
  i.status::text AS status,
  i.scheduled_date,
  i.completed_date,
  i.reviewed_at,
  i.created_at,
  i.catchment_level1,
  i.catchment_level2,
  i.manual_inspection_subject,
  i.manual_inspection_reason,
  i.manual_contact_name,
  i.manual_contact_phone,
  i.manual_site_notes,
  i.project_latitude,
  i.project_longitude,
  i.activity_type,
  i.activity_starting_date,
  i.wastewater_system_type,
  i.wastewater_system_effectiveness,
  i.fees_payment_amount,
  i.fees_payment_details,
  i.reports_submission_date,
  i.reports_reference_number,
  i.reports_proof,
  i.water_use_conflicts,
  i.catchment_protection_initiatives,
  i.general_conclusion,
  i.recommendations,
  i.recommendation_details,
  i.employment_gender_breakdown,
  i.ohs_gender_sensitive,
  i.inspection_documents,
  i.locked_field_overrides,
  i.allowed_quantity,
  i.allowed_unit,
  i.authorized_abstraction_method,
  i.actual_quantity,
  i.actual_unit,
  i.actual_abstraction_method,
  i.measurement_device_type,
  i.authorized_surface_area_ha,
  i.actual_surface_area_ha,
  i.authorized_concession_boundaries,
  i.actual_concession_boundaries
`;

/**
 * Load an inspection and its permit context.
 * Returns null when the inspection does not exist.
 */
export async function loadInspectionReportContext(
  inspectionId: string,
): Promise<InspectionReportContext | null> {
  const res = await query<Record<string, any>>(
    `
    SELECT ${INSPECTION_SELECT},
           insp.first_name AS inspector_first_name,
           insp.last_name  AS inspector_last_name,
           insp.email      AS inspector_email
    FROM public.inspections i
    LEFT JOIN public.users insp ON insp.id = i.inspector_id
    WHERE i.id = $1
    LIMIT 1
    `,
    [inspectionId],
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];

  const form: InspectionReportForm = {
    activity_type: row.activity_type,
    activity_starting_date: toDateOnly(row.activity_starting_date),
    project_latitude: row.project_latitude,
    project_longitude: row.project_longitude,
    wastewater_system_type: row.wastewater_system_type,
    wastewater_system_effectiveness: row.wastewater_system_effectiveness,
    fees_payment_amount: row.fees_payment_amount,
    fees_payment_details: row.fees_payment_details,
    reports_submission_date: toDateOnly(row.reports_submission_date),
    reports_reference_number: row.reports_reference_number,
    reports_proof: row.reports_proof,
    water_use_conflicts: row.water_use_conflicts,
    catchment_protection_initiatives: row.catchment_protection_initiatives,
    general_conclusion: row.general_conclusion,
    recommendations: row.recommendations,
    recommendation_details: row.recommendation_details,
    allowed_quantity: row.allowed_quantity,
    allowed_unit: row.allowed_unit,
    authorized_abstraction_method: row.authorized_abstraction_method,
    actual_quantity: row.actual_quantity,
    actual_unit: row.actual_unit,
    actual_abstraction_method: row.actual_abstraction_method,
    measurement_device_type: row.measurement_device_type,
    authorized_surface_area_ha: row.authorized_surface_area_ha,
    actual_surface_area_ha: row.actual_surface_area_ha,
    authorized_concession_boundaries: row.authorized_concession_boundaries,
    actual_concession_boundaries: row.actual_concession_boundaries,
    catchment_level1: row.catchment_level1,
    catchment_level2: row.catchment_level2,
    manual_inspection_subject: row.manual_inspection_subject,
    manual_inspection_reason: row.manual_inspection_reason,
    manual_contact_name: row.manual_contact_name,
    manual_contact_phone: row.manual_contact_phone,
    manual_site_notes: row.manual_site_notes,
    employment_gender_breakdown: row.employment_gender_breakdown,
    ohs_gender_sensitive: row.ohs_gender_sensitive,
    inspection_documents: row.inspection_documents,
    locked_field_overrides: row.locked_field_overrides,
  };

  const overrides = (row.locked_field_overrides || {}) as Record<string, string>;
  const inspectorName =
    [row.inspector_first_name, row.inspector_last_name].filter(Boolean).join(" ").trim() ||
    row.inspector_email ||
    null;

  const base = {
    inspectionId: String(row.id),
    inspectionNumber: row.inspection_number ? String(row.inspection_number) : null,
    workflowStatus: row.workflow_status ? String(row.workflow_status) : null,
    inspectorName,
    inspectionDate: toDateOnly(row.completed_date) || toDateOnly(row.scheduled_date) || toDateOnly(row.created_at),
    approvedAt: toDateOnly(row.reviewed_at),
    form,
  };

  // ── No-permit inspection: everything lives on the inspection row ──────────
  if (row.owner_kind === "manual_unpermitted") {
    return {
      ...base,
      template: (row.inspection_template as InspectionReportTemplate) || "authorization",
      manualInspection: true,
      permitNumber: overrides.permitNumber || null,
      locked: null,
    };
  }

  // ── Registry-only permit: locked fields come from permit_registry ─────────
  if (row.owner_kind === "permit_registry" && row.owner_id) {
    const regRes = await query<Record<string, any>>(
      `SELECT * FROM public.permit_registry WHERE id = $1 LIMIT 1`,
      [String(row.owner_id)],
    );
    const registry = regRes.rows[0] || null;
    const prepopulated = registry ? prepareRegistryInspectionData(registry) : null;
    return {
      ...base,
      template:
        (row.inspection_template as InspectionReportTemplate) ||
        deriveTemplate(null, registry?.authorized_activity),
      manualInspection: false,
      permitNumber: overrides.permitNumber || registry?.permit_number || null,
      locked: (prepopulated as unknown as InspectionReportLocked) || null,
    };
  }

  // ── Application-linked inspection: application + permit + registry coords ─
  if (!row.application_id) {
    return {
      ...base,
      template: (row.inspection_template as InspectionReportTemplate) || "authorization",
      manualInspection: false,
      permitNumber: overrides.permitNumber || null,
      locked: null,
    };
  }

  const appRes = await query<Record<string, any>>(
    `
    SELECT
      a.id,
      a.application_number,
      a.status::text AS status,
      a.water_source,
      a.water_purpose,
      a.water_body_name,
      a.intended_activities,
      a.province,
      a.district,
      a.sector,
      a.cell,
      a.village,
      a.concession_area,
      a.assessor_recommended_volume_m3,
      a.water_taking_method,
      a.flow_rate_m3_per_second,
      a.internal_notes::text AS internal_notes,
      ST_AsGeoJSON(a.coordinates)::json AS coordinates,
      u.first_name,
      u.last_name,
      u.email,
      u.phone,
      u.address,
      u.account_type,
      u.id_number,
      u.company_name,
      u.company_tin,
      u.company_address,
      u.company_phone
    FROM public.applications a
    LEFT JOIN public.users u ON u.id = a.applicant_id
    WHERE a.id = $1
    LIMIT 1
    `,
    [String(row.application_id)],
  );
  const appRow = appRes.rows[0] || null;

  const permitRes = await query<Record<string, any>>(
    `
    SELECT permit_number, purpose, water_source, water_allowance, allowance_unit,
           issued_date::text AS issued_date, expiry_date::text AS expiry_date,
           ST_AsGeoJSON(coordinates)::json AS coordinates
    FROM public.permits
    WHERE application_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [String(row.application_id)],
  );
  const permit = permitRes.rows[0] || null;

  let locked: InspectionReportLocked | null = null;
  if (appRow) {
    // `prepareInspectionData` expects the applicant nested under `applicant`,
    // the way the Supabase join delivers it to the editor pages.
    const application = {
      ...appRow,
      internal_notes: appRow.internal_notes,
      applicant: {
        first_name: appRow.first_name,
        last_name: appRow.last_name,
        email: appRow.email,
        phone: appRow.phone,
        address: appRow.address,
        account_type: appRow.account_type,
        id_number: appRow.id_number,
        company_name: appRow.company_name,
        company_tin: appRow.company_tin,
        company_address: appRow.company_address,
        company_phone: appRow.company_phone,
      },
    };

    // Coordinate fallback from the registry, same best-effort lookup as the editor.
    let registryCoords: { latitude?: number | null; longitude?: number | null } | undefined;
    const lookupNumber = permit?.permit_number || appRow.application_number;
    if (lookupNumber) {
      try {
        const regRes = await query<Record<string, any>>(
          `
          SELECT latitude, longitude
          FROM public.permit_registry
          WHERE permit_number = $1
          ORDER BY row_index DESC NULLS LAST
          LIMIT 1
          `,
          [String(lookupNumber)],
        );
        const reg = regRes.rows[0];
        if (reg && (reg.latitude != null || reg.longitude != null)) {
          registryCoords = { latitude: reg.latitude, longitude: reg.longitude };
        }
      } catch {
        // permit_registry may have no matching entry — ignore
      }
    }

    locked = prepareInspectionData(
      application,
      (permit as any) || null,
      [], // payment history is not part of the inspection report
      [],
      registryCoords,
    ) as unknown as InspectionReportLocked;
  }

  const notes = parseNotes(appRow?.internal_notes);
  const regime = typeof notes?.regime === "string" ? notes.regime : null;
  const template: InspectionReportTemplate =
    (row.inspection_template as InspectionReportTemplate) ||
    (regime?.toLowerCase() === "concession"
      ? "concession"
      : deriveTemplate(appRow?.intended_activities, permit?.purpose || appRow?.water_purpose));

  return {
    ...base,
    template,
    manualInspection: false,
    permitNumber: overrides.permitNumber || permit?.permit_number || null,
    locked,
  };
}
