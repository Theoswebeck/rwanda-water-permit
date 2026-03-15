import { query } from "@/lib/db/postgres";
import { buildPermitLookupCandidates, normalizePermitLookupInput } from "@/lib/permit-number-utils";

type JsonRecord = Record<string, unknown>;

export type PublicPermitSource = "permits" | "permit_registry";

export type PublicPermitRecord = JsonRecord & {
  source: PublicPermitSource;
  permit_number: string;
  status: string;
  issued_date: string | null;
  expiry_date: string | null;
  application: JsonRecord | null;
  latitude: number | null;
  longitude: number | null;
};

function extractCoordinateFromNotes(
  application: JsonRecord | null | undefined,
  key: "waterSourceLatitude" | "waterSourceLongitude"
): number | null {
  if (!application) return null;
  const raw = application.internal_notes;
  if (!raw) return null;
  try {
    const notes = typeof raw === "string" ? JSON.parse(raw) : typeof raw === "object" ? raw : null;
    if (!notes || typeof notes !== "object") return null;
    const value = (notes as Record<string, unknown>)[key];
    const num = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

export async function findPublicPermitByNumber(
  rawPermitNumber: string,
  opts?: { includeRegistryFallback?: boolean }
): Promise<{ inputPermitNumber: string | null; permit: PublicPermitRecord | null }> {
  const normalizedInput = normalizePermitLookupInput(rawPermitNumber);
  if (!normalizedInput) {
    return { inputPermitNumber: null, permit: null };
  }

  const lookup = buildPermitLookupCandidates(normalizedInput);
  const permitRes = await query(
    `
    select
      p.id,
      p.permit_number,
      p.status::text as status,
      p.water_source::text as water_source,
      p.purpose::text as purpose,
      p.water_allowance,
      p.allowance_unit,
      p.issuing_authority,
      p.issued_date::text as issued_date,
      p.expiry_date::text as expiry_date,
      p.permit_pdf_url,
      p.conditions,
      p.is_modification,
      p.is_transfer,
      p.modification_count,
      row_to_json(a) as application,
      row_to_json(u) as applicant,
      coalesce(
        case when a.coordinates is not null then st_y(a.coordinates) end,
        case when oa.coordinates is not null then st_y(oa.coordinates) end
      ) as latitude,
      coalesce(
        case when a.coordinates is not null then st_x(a.coordinates) end,
        case when oa.coordinates is not null then st_x(oa.coordinates) end
      ) as longitude
    from public.permits p
    left join public.applications a on a.id = p.application_id
    left join public.users u on u.id = a.applicant_id
    left join public.permits op on op.id = p.original_permit_id
    left join public.applications oa on oa.id = op.application_id
    where regexp_replace(upper(trim(p.permit_number)), '[^A-Z0-9]', '', 'g') = any($1::text[])
    order by
      case
        when trim(p.permit_number) = $2 then 0
        when upper(trim(p.permit_number)) = upper($2) then 1
        else 2
      end,
      p.updated_at desc nulls last,
      p.created_at desc nulls last
    limit 1
    `,
    [lookup.candidateKeys, lookup.raw]
  );

  const permitRow = permitRes.rows[0] as (JsonRecord & { application?: JsonRecord | null; applicant?: JsonRecord | null }) | undefined;
  if (permitRow) {
    const application = permitRow.application
      ? {
          ...permitRow.application,
          applicant: permitRow.applicant || null,
        }
      : null;

    const latitude = (typeof permitRow.latitude === "number" ? permitRow.latitude : null)
      ?? extractCoordinateFromNotes(application, "waterSourceLatitude");
    const longitude = (typeof permitRow.longitude === "number" ? permitRow.longitude : null)
      ?? extractCoordinateFromNotes(application, "waterSourceLongitude");

    return {
      inputPermitNumber: lookup.raw,
      permit: {
        ...permitRow,
        source: "permits",
        application,
        latitude,
        longitude,
      } as PublicPermitRecord,
    };
  }

  if (!opts?.includeRegistryFallback) {
    return { inputPermitNumber: lookup.raw, permit: null };
  }

  const registryRes = await query(
    `
    select
      pr.id as registry_id,
      pr.permit_number,
      coalesce(pr.status, 'active')::text as status,
      pr.water_source::text as water_source,
      pr.authorized_activity::text as purpose,
      pr.volume_or_area::text as water_allowance,
      ''::text as allowance_unit,
      'Rwanda Water Resources Board'::text as issuing_authority,
      pr.issuance_date::text as issued_date,
      pr.expiration_date::text as expiry_date,
      pr.permit_holder::text as permit_holder,
      pr.location::text as registry_location,
      pr.latitude,
      pr.longitude
    from public.permit_registry pr
    where regexp_replace(upper(trim(pr.permit_number)), '[^A-Z0-9]', '', 'g') = any($1::text[])
    order by
      case
        when trim(pr.permit_number) = $2 then 0
        when upper(trim(pr.permit_number)) = upper($2) then 1
        else 2
      end,
      pr.updated_at desc nulls last,
      pr.created_at desc nulls last
    limit 1
    `,
    [lookup.candidateKeys, lookup.raw]
  );

  const registryRow = registryRes.rows[0] as JsonRecord | undefined;
  if (!registryRow) {
    return { inputPermitNumber: lookup.raw, permit: null };
  }

  return {
    inputPermitNumber: lookup.raw,
    permit: {
      ...registryRow,
      source: "permit_registry",
      application: null,
    } as PublicPermitRecord,
  };
}

