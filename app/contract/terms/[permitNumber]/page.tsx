import Image from "next/image";
import { notFound } from "next/navigation";
import { contractTermsByVariant, splitContractSectionsByLanguage, parseSectionHeading } from "@/lib/contract-terms";
import { selectPermitVariant, type PermitVariant } from "@/lib/permit-variant";
import { buildContractPlaceholderContext, fillContractText } from "@/lib/contract-placeholders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { findPublicPermitByNumber } from "@/lib/permit/public-permit-query";

function isPermitVariant(v: string | undefined | null): v is PermitVariant {
  return (
    v === "abstraction_individual" ||
    v === "abstraction_organization" ||
    v === "concession_individual" ||
    v === "concession_organization" ||
    v === "fallback_generic"
  );
}

export default async function PublicContractTermsPage({
  params,
  searchParams,
}: {
  params: Promise<{ permitNumber: string }>;
  searchParams?: Promise<{ variant?: string }>;
}) {
  const { permitNumber: permitNumberParam } = await params;
  const { inputPermitNumber, permit } = await findPublicPermitByNumber(permitNumberParam, {
    includeRegistryFallback: false,
  });
  if (!inputPermitNumber) notFound();
  const permitNumber = inputPermitNumber;

  const sp = (await searchParams) ?? {};
  const variantOverride = isPermitVariant(sp.variant) ? (sp.variant as PermitVariant) : null;
  const error = !permit;

  const application = (permit as Record<string, unknown> | null)?.application ?? null;
  const termsStatusRaw = typeof application?.terms_status === "string" ? application.terms_status : "";
  const termsStatus = termsStatusRaw.trim().toLowerCase();
  const isTermsRejected = termsStatus === "rejected";

  const inferredVariant: PermitVariant | null = application ? selectPermitVariant(application) : null;
  const variant: PermitVariant =
    variantOverride ?? inferredVariant ?? "abstraction_individual";

  const terms = contractTermsByVariant[variant] ?? null;
  const isSignatureSection = (title: string) => {
    const normalized = title.trim().toLowerCase();
    return normalized.includes("signature") || normalized.includes("imikono");
  };
  const displaySectionGroups = terms
    ? (() => {
        const { englishSections, kinyarwandaSections } = splitContractSectionsByLanguage(terms.sections);
        return [
          {
            key: "en",
            label: "English Version",
            sections: englishSections.filter((section) => !isSignatureSection(section.title)),
          },
          {
            key: "rw",
            label: "Kinyarwanda Version",
            sections: kinyarwandaSections.filter((section) => !isSignatureSection(section.title)),
          },
        ].filter((group) => group.sections.length > 0);
      })()
    : [];

  const placeholderCtx = application
    ? buildContractPlaceholderContext(application, application.application_number)
    : null;

  const filledSectionGroups = displaySectionGroups.map((group) => ({
    ...group,
    sections: group.sections.map((section) => ({
      title: section.title,
      paragraphs: section.paragraphs.map((p) => {
        const filled = placeholderCtx ? fillContractText(p, placeholderCtx) : p;
        if (!isTermsRejected || !placeholderCtx || placeholderCtx.contractNumber === "N/A") return filled;
        return filled.replaceAll(placeholderCtx.contractNumber, "[Hidden until terms are accepted]");
      }),
    })),
  }));

  const importantNotice = terms?.importantNotice
    ? {
        title: terms.importantNotice.title,
        body: isTermsRejected
          ? "You have rejected these terms and conditions. The permit number remains hidden until terms are accepted."
          : "You have already acknowledged these terms. You confirm that you have read, understood, and agree to comply with all conditions. Violation of any condition may result in permit suspension or revocation.",
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
                    <div className="text-base font-bold text-slate-900">Rwanda Water Resources Board</div>
                    <div className="text-sm text-slate-500">Terms & Conditions Contract</div>
                  </div>
                </div>

                {!isTermsRejected ? (
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Permit number</div>
                    <div className="mt-1 rounded-lg border bg-slate-50 px-3 py-2 font-mono text-sm">
                      {permitNumber}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-slate-900">Terms & Conditions</h1>
                </div>
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
                  </CardContent>
                </Card>
              ) : null}

              {terms ? (
                <div className="space-y-6">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{terms.heading}</div>
                    {application?.project_title ? (
                      <div className="mt-3 text-sm text-slate-600">
                        Project: <span className="font-medium text-slate-900">{application.project_title}</span>
                      </div>
                    ) : null}
                  </div>

                  {filledSectionGroups.map((group) => (
                    <div key={group.key} className="space-y-4">
                      {filledSectionGroups.length > 1 ? (
                        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                          {group.label}
                        </div>
                      ) : null}

                      {group.sections.map((section, idx) => {
                        const { partHeading, articleHeading } = parseSectionHeading(section.title);
                        const previousPartHeading =
                          idx > 0 ? parseSectionHeading(group.sections[idx - 1].title).partHeading : null;
                        const showPartHeading = Boolean(partHeading && partHeading !== previousPartHeading);

                        return (
                          <div key={`${group.key}-${section.title}-${idx}`} className="space-y-2">
                            {showPartHeading && (
                              <h2 className="text-sm font-bold text-slate-900 pt-2">{partHeading}</h2>
                            )}
                            <h3 className="text-sm font-semibold text-slate-900">
                              {partHeading ? articleHeading : section.title}
                            </h3>
                            <div className="space-y-2 text-sm text-slate-700">
                              {section.paragraphs.map((p, pIdx) => (
                                <p key={pIdx} className="whitespace-pre-wrap leading-relaxed">
                                  {p}
                                </p>
                              ))}
                            </div>
                          </div>
                        );
                      })}
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

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

