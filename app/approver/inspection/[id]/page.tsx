import { redirect } from "next/navigation";
import { query } from "@/lib/db/postgres";

type LookupRow = {
  application_id: string | null;
  owner_kind: string | null;
  owner_id: string | null;
  permit_number_from_permits: string | null;
  permit_number_from_registry: string | null;
};

export default async function ApproverInspectionByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    redirect(`/inspection/${encodeURIComponent(id)}`);
  }

  try {
    const { rows } = await query<LookupRow>(
      `
      select
        i.application_id,
        i.owner_kind,
        i.owner_id,
        (
          select p.permit_number
          from public.permits p
          where p.application_id = i.application_id
          order by p.issued_date desc nulls last, p.created_at desc nulls last
          limit 1
        ) as permit_number_from_permits,
        (
          select pr.permit_number
          from public.permit_registry pr
          where i.owner_kind = 'permit_registry' and pr.id = i.owner_id
          limit 1
        ) as permit_number_from_registry
      from public.inspections i
      where i.id = $1
      limit 1
      `,
      [id]
    );

    const row = rows[0];
    const permitNumber = row?.permit_number_from_permits || row?.permit_number_from_registry;
    if (permitNumber) {
      redirect(`/approver/inspection/permit/${encodeURIComponent(permitNumber)}`);
    }
  } catch (err) {
    console.error("❌ /approver/inspection/[id] lookup failed:", err);
  }

  redirect(`/inspection/${encodeURIComponent(id)}`);
}
