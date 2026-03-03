import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db/postgres";
import { contractTermsByVariant } from "@/lib/contract-terms";
import { selectPermitVariant, type PermitVariant } from "@/lib/permit-variant";
import { buildContractPlaceholderContext, fillContractText } from "@/lib/contract-placeholders";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

function isPermitVariant(v: string | undefined | null): v is PermitVariant {
  return (
    v === "abstraction_individual" ||
    v === "abstraction_organization" ||
    v === "concession_individual" ||
    v === "concession_organization" ||
    v === "fallback_generic"
  );
}

function formatVariantLabel(v: PermitVariant): string {
  return v.replaceAll("_", " ");
}

export default async function PublicContractTermsPage({
  params,
  searchParams,
}: {
  params: Promise<{ permitNumber: string }>;
  searchParams?: Promise<{ variant?: string }>;
}) {
  const { permitNumber: permitNumberParam } = await params;
  const permitNumber = normalizePermitNumber(permitNumberParam);
  if (!permitNumber) notFound();

  const sp = (await searchParams) ?? {};
  const variantOverride = isPermitVariant(sp.variant) ? (sp.variant as PermitVariant) : null;

  const permitRes = await query(
    `
    select
      p.permit_number,
      p.issued_date::text as issued_date,
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

  const application = (permit as Record<string, unknown> | null)?.application ?? null;

  const inferredVariant: PermitVariant | null = application ? selectPermitVariant(application) : null;
  const variant: PermitVariant =
    variantOverride ?? inferredVariant ?? "abstraction_individual";

  const terms = contractTermsByVariant[variant] ?? null;

  const placeholderCtx = application
    ? buildContractPlaceholderContext(application, application.application_number)
    : null;

  const filledSections = terms?.sections?.map((section) => ({
    title: section.title,
    paragraphs: section.paragraphs.map((p) => (placeholderCtx ? fillContractText(p, placeholderCtx) : p)),
  })) ?? [];

  const importantNotice = terms?.importantNotice
    ? {
        title: terms.importantNotice.title,
        // This page is intended to be accessed from the QR code on the downloaded contract,
        // so we use the post-acceptance wording.
        body:
          "You have already acknowledged that these terms, you acknowledge that you have read, understood, and agree to comply with all conditions. Violation of any condition may result in permit suspension or revocation.",
      }
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-6">
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
                    <div className="text-xs text-slate-500">Hosted Terms & Conditions (Contract)</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500">Permit number</div>
                  <div className="mt-1 rounded-lg border bg-slate-50 px-3 py-2 font-mono text-sm">
                    {permitNumber}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-slate-900">Terms & Conditions</h1>
                  <p className="mt-1 text-sm text-slate-600">
                    This is the hosted terms page intended for QR codes printed on downloaded contracts.
                  </p>
                </div>
                <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200">
                  Variant: {formatVariantLabel(variant)}
                </Badge>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <Link className="underline text-slate-700" href={`/permit/view/${encodeURIComponent(permitNumber)}`}>
                  Verify permit
                </Link>
                <span className="text-slate-300">|</span>
                <Link className="underline text-slate-700" href="/">
                  Back to portal
                </Link>
              </div>
            </div>

            <div className="px-8 pb-10 pt-6">
              {error || !permit ? (
                <Card className="mb-6 border-amber-200 bg-amber-50">
                  <CardHeader>
                    <CardTitle className="text-base">Limited view</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-amber-900">
                    <p>
                      We couldn’t load the exact application context for this permit (it may not exist or may not be publicly
                      accessible). You can still view the standard Terms & Conditions template below.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-2">
                      {(
                        [
                          "abstraction_individual",
                          "abstraction_organization",
                          "concession_individual",
                          "concession_organization",
                        ] as PermitVariant[]
                      ).map((v) => (
                        <Link
                          key={v}
                          className="rounded-md border bg-white px-3 py-1 text-xs underline"
                          href={`/contract/terms/${encodeURIComponent(permitNumber)}?variant=${encodeURIComponent(v)}`}
                        >
                          {formatVariantLabel(v)}
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {terms ? (
                <div className="space-y-6">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{terms.heading}</div>
                    {terms.subheading ? <div className="mt-1 text-sm text-slate-600">{terms.subheading}</div> : null}
                    {application?.project_title ? (
                      <div className="mt-3 text-sm text-slate-600">
                        Project: <span className="font-medium text-slate-900">{application.project_title}</span>
                      </div>
                    ) : null}
                  </div>

                  {filledSections.map((section, idx) => (
                    <div key={`${section.title}-${idx}`} className="space-y-2">
                      <h2 className="text-sm font-semibold text-slate-900">{section.title}</h2>
                      <div className="space-y-2 text-sm text-slate-700">
                        {section.paragraphs.map((p, pIdx) => (
                          <p key={pIdx} className="whitespace-pre-wrap leading-relaxed">
                            {p}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}

                  {importantNotice ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <div className="text-sm font-semibold text-amber-900">{importantNotice.title}</div>
                      <div className="mt-2 text-sm text-amber-900 whitespace-pre-wrap">{importantNotice.body}</div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Card className="border-red-200 bg-red-50">
                  <CardHeader>
                    <CardTitle className="text-base">Terms not available</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-red-900">
                    This Terms & Conditions variant isn’t available.
                  </CardContent>
                </Card>
              )}

              <div className="mt-10 border-t pt-6 text-xs text-slate-500">
                If you reached this page by scanning a QR code on a contract PDF, confirm the permit number above matches the
                printed document.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

