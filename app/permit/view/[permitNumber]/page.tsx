import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db/postgres";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PermitStatus } from "@/types/database";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function statusBadgeVariant(status: PermitStatus): { label: string; className: string } {
  switch (status) {
    case "active":
      return { label: "Active", className: "bg-green-100 text-green-700 border-green-200" };
    case "expired":
      return { label: "Expired", className: "bg-red-100 text-red-700 border-red-200" };
    case "expiring_soon":
      return { label: "Expiring soon", className: "bg-amber-100 text-amber-700 border-amber-200" };
    case "suspended":
      return { label: "Suspended", className: "bg-slate-100 text-slate-700 border-slate-200" };
    case "revoked":
      return { label: "Revoked", className: "bg-slate-100 text-slate-700 border-slate-200" };
    default:
      return { label: status, className: "bg-slate-100 text-slate-700 border-slate-200" };
  }
}

function normalizePermitNumber(raw: string): string | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  })();

  if (!decoded) return null;
  const trimmed = decoded.trim();
  if (trimmed.length < 3 || trimmed.length > 64) return null;
  return trimmed;
}

export default async function PublicPermitViewPage({
  params,
}: {
  params: Promise<{ permitNumber: string }>;
}) {
  const { permitNumber: permitNumberParam } = await params;
  const permitNumber = normalizePermitNumber(permitNumberParam);

  if (!permitNumber) notFound();

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
      row_to_json(a) as application,
      row_to_json(u) as applicant
    from public.permits p
    left join public.applications a on a.id = p.application_id
    left join public.users u on u.id = a.applicant_id
    where p.permit_number = $1
    limit 1
    `,
    [permitNumber]
  );
  const row = permitRes.rows[0] as (Record<string, unknown> & { application?: Record<string, unknown> | null; applicant?: Record<string, unknown> | null }) | undefined;
  const permit = row
    ? {
        ...row,
        application: row.application
          ? {
              ...row.application,
              applicant: row.applicant || null,
            }
          : null,
      }
    : null;
  const error = !permit;

  if (error || !permit) {
    // Likely either not found, or RLS blocks public access. Keep the response generic.
    return (
      <div className="container mx-auto px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Permit verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              We couldn’t load this permit. It may not exist, may be inactive, or may not be publicly accessible.
            </p>
            <p className="text-sm">
              Permit number: <span className="font-mono">{permitNumber}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              If you believe this is an error, please contact support from the portal.
            </p>
            <Link className="text-sm underline" href="/">
              Back to portal
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const applicantName = (() => {
    const a = permit.application?.applicant;
    if (!a) return "N/A";
    if (a.account_type === "individual") {
      return `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "N/A";
    }
    return a.company_name ?? "N/A";
  })();

  const location = (() => {
    const app = permit.application;
    if (!app) return "N/A";
    const parts = [app.village, app.cell, app.sector, app.district, app.province].filter(Boolean);
    return parts.length ? parts.join(", ") : "N/A";
  })();

  const badge = statusBadgeVariant(permit.status as PermitStatus);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="px-8 pt-8">
              <div className="flex items-start justify-between gap-6">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 overflow-hidden rounded-full border bg-white">
                    <Image
                      src="/assets/rwanda_water_board_Logo.png"
                      alt="Rwanda Water Resources Board"
                      fill
                      sizes="40px"
                      className="object-contain p-1"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Rwanda Water Resources Board</div>
                    <div className="text-xs text-slate-500">Permit verification</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500">Permit number</div>
                  <div className="mt-1 rounded-lg border bg-slate-50 px-3 py-2 font-mono text-sm">
                    {permit.permit_number}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-slate-900">Water Permit Certificate</h1>
                  <p className="mt-1 text-sm text-slate-600">This page is a read-only verification view.</p>
                </div>
                <Badge variant="outline" className={badge.className}>
                  {badge.label}
                </Badge>
              </div>
            </div>

            <div className="px-8 pb-10 pt-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">Permit holder</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{applicantName}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">Issuing authority</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{permit.issuing_authority}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">Issue date</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{formatDate(permit.issued_date)}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">Expiry date</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{formatDate(permit.expiry_date)}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">Water source</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{permit.water_source}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-slate-500">Purpose</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{permit.purpose}</div>
                </div>
                <div className="rounded-xl border p-4 md:col-span-2">
                  <div className="text-xs text-slate-500">Authorized volume</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {permit.water_allowance} {permit.allowance_unit}
                  </div>
                </div>
                <div className="rounded-xl border p-4 md:col-span-2">
                  <div className="text-xs text-slate-500">Location</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{location}</div>
                </div>
                {permit.application?.project_title ? (
                  <div className="rounded-xl border p-4 md:col-span-2">
                    <div className="text-xs text-slate-500">Project title</div>
                    <div className="mt-1 text-sm font-medium text-slate-900">{permit.application.project_title}</div>
                  </div>
                ) : null}
              </div>

              <div className="mt-8 border-t pt-6 text-xs text-slate-500">
                If you received this link from a QR code on a permit, compare the permit number above with the printed
                certificate.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}






