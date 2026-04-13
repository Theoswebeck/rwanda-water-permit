import { notFound } from "next/navigation";
import { findPublicPermitByNumber } from "@/lib/permit/public-permit-query";
import { ContractTermsPreview } from "@/components/contract/contract-terms-preview";
import type { PermitVariant } from "@/lib/permit-variant";

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
  params: Promise<{ permitNumber: string[] }>;
  searchParams?: Promise<{ variant?: string }>;
}) {
  const { permitNumber: segments } = await params;
  const permitNumberParam = decodeURIComponent(segments.join("/"));
  const { inputPermitNumber, permit } = await findPublicPermitByNumber(permitNumberParam, {
    includeRegistryFallback: false,
  });
  if (!inputPermitNumber) notFound();
  const permitNumber = inputPermitNumber;

  const sp = (await searchParams) ?? {};
  const variantOverride = isPermitVariant(sp.variant) ? (sp.variant as PermitVariant) : null;

  const application = (permit as Record<string, unknown> | null)?.application ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <ContractTermsPreview
            application={application as Record<string, any> | null}
            permitNumber={permitNumber}
            variantOverride={variantOverride}
            mode="public"
          />
        </div>
      </div>
    </div>
  );
}
