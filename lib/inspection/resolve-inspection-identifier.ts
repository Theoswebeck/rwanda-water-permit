import { query } from "@/lib/db/postgres";

type InspectionIdentifierRow = {
  application_number: string | null;
  permit_number: string | null;
};

function extractRegistryPermitNumber(applicationNumber: string): string | null {
  if (!applicationNumber.startsWith("REG-")) return null;
  const permitNumber = applicationNumber.replace(/^REG-/, "").trim();
  return permitNumber.length > 0 ? permitNumber : null;
}

export async function resolveInspectionIdentifier(
  inspectionId: string
): Promise<string | null> {
  const res = await query<InspectionIdentifierRow>(
    `
      select
        a.application_number,
        max(p.permit_number)::text as permit_number
      from public.inspections i
      left join public.applications a on a.id = i.application_id
      left join public.permits p on p.application_id = i.application_id
      where i.id = $1
      group by a.application_number
      limit 1
    `,
    [inspectionId]
  );

  const row = res.rows[0];
  if (!row) return null;

  const permitNumber = (row.permit_number || "").trim();
  if (permitNumber) return permitNumber;

  const applicationNumber = (row.application_number || "").trim();
  if (!applicationNumber) return null;

  const registryPermitNumber = extractRegistryPermitNumber(applicationNumber);
  if (registryPermitNumber) return registryPermitNumber;

  return applicationNumber;
}
