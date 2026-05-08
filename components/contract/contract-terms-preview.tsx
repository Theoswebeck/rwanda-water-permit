import Image from "next/image";
import {
  splitContractSectionsByLanguage,
  parseSectionHeading,
} from "@/lib/contract-terms";
import type { PermitVariant } from "@/lib/permit-variant";
import {
  buildContractPlaceholderContext,
  type ApplicationForContract,
  type TransferPermitContext,
} from "@/lib/contract-placeholders";
import { getResolvedContractTerms } from "@/lib/document-slots";
import type { PermitApplication } from "@/lib/permit/permit-text-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ABSTRACTION_METHODS } from "@/components/dashboard/bulk-networks-table";
import type { BulkNetworkRow } from "@/types/database";

function resolveBulkNetworks(application: ApplicationForContract | null): BulkNetworkRow[] | null {
  if (!application) return null;
  const app = application as Record<string, unknown>;
  if (!app.is_bulk) return null;
  const notes = app.internal_notes as Record<string, unknown> | null | undefined;
  if (notes && typeof notes === "object") {
    const adj = (notes as Record<string, unknown>)._assessorAdjustments as Record<string, unknown> | null | undefined;
    if (adj && Array.isArray(adj.bulkNetworks) && adj.bulkNetworks.length > 0) {
      return adj.bulkNetworks as BulkNetworkRow[];
    }
  }
  if (Array.isArray(app.bulk_networks) && (app.bulk_networks as unknown[]).length > 0) {
    return app.bulk_networks as BulkNetworkRow[];
  }
  return null;
}

type Mode = "public" | "staff-preview";

type ContractTermsPreviewProps = {
  application: ApplicationForContract | null;
  permitNumber?: string | null;
  variantOverride?: PermitVariant | null;
  mode?: Mode;
  showChrome?: boolean;
  transferPermit?: TransferPermitContext | null;
};

function isSignatureSection(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return normalized.includes("signature") || normalized.includes("imikono");
}

export function ContractTermsPreview({
  application,
  permitNumber,
  variantOverride = null,
  mode = "public",
  showChrome = true,
  transferPermit = null,
}: ContractTermsPreviewProps) {
  const error = !application;

  const termsStatusRaw =
    typeof application?.terms_status === "string" ? application.terms_status : "";
  const termsStatus = termsStatusRaw.trim().toLowerCase();
  const isTermsRejected = termsStatus === "rejected";

  // Slot-aware resolution: assessor overrides win, otherwise the placeholder
  // context fills `{{...}}` tokens in the template. `getResolvedContractTerms`
  // returns a fresh ContractTerms with each paragraph already-rendered, so
  // the React side just walks the array.
  const terms = application
    ? getResolvedContractTerms({
        application: application as ApplicationForContract & PermitApplication,
        applicationNumber: application.application_number ?? undefined,
        transferPermit,
        variantOverride: variantOverride ?? null,
      })
    : null;

  const placeholderCtx = application
    ? buildContractPlaceholderContext(
        application,
        application.application_number ?? undefined,
        transferPermit,
      )
    : null;

  const displaySectionGroups = terms
    ? (() => {
        const { englishSections, kinyarwandaSections } =
          splitContractSectionsByLanguage(terms.sections);
        return [
          {
            key: "en",
            label: "English Version",
            sections: englishSections.filter((s) => !isSignatureSection(s.title)),
          },
          {
            key: "rw",
            label: "Kinyarwanda Version",
            sections: kinyarwandaSections.filter((s) => !isSignatureSection(s.title)),
          },
        ].filter((group) => group.sections.length > 0);
      })()
    : [];

  const filledSectionGroups = displaySectionGroups.map((group) => ({
    ...group,
    sections: group.sections.map((section) => ({
      title: section.title,
      paragraphs: section.paragraphs.map((p) => {
        // The slot resolver already filled placeholders; we still apply the
        // "hide contract number" rewrite for the public terms-rejected view.
        if (!isTermsRejected || !placeholderCtx || placeholderCtx.contractNumber === "N/A")
          return p;
        return p.replaceAll(
          placeholderCtx.contractNumber,
          "[Hidden until terms are accepted]",
        );
      }),
    })),
  }));

  const importantNotice = terms?.importantNotice
    ? {
        title: terms.importantNotice.title,
        body:
          mode === "staff-preview"
            ? "This is a preview of the contract that will be issued if the application is approved. Dynamic values are editable in staff mode and saved as draft overrides."
            : isTermsRejected
              ? "You have rejected these terms and conditions. The permit number remains hidden until terms are accepted."
              : "You have already acknowledged these terms. You confirm that you have read, understood, and agree to comply with all conditions. Violation of any condition may result in permit suspension or revocation.",
      }
    : null;

  const displayPermitNumber =
    permitNumber ??
    (placeholderCtx && placeholderCtx.contractNumber !== "N/A"
      ? placeholderCtx.contractNumber
      : null);

  const header = (
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
            <div className="text-base font-bold text-slate-900">
              Rwanda Water Resources Board
            </div>
            <div className="text-sm text-slate-500">Terms &amp; Conditions Contract</div>
          </div>
        </div>

        {!isTermsRejected && displayPermitNumber ? (
          <div className="text-right">
            <div className="text-xs text-slate-500">Permit number</div>
            <div className="mt-1 rounded-lg border bg-slate-50 px-3 py-2 font-mono text-sm">
              {displayPermitNumber}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Terms &amp; Conditions
          </h1>
        </div>
      </div>
    </div>
  );

  const bulkNetworks = resolveBulkNetworks(application);

  const body = (
    <div className="px-8 pb-10 pt-6">
      {error && mode === "public" ? (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-base">Limited view</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-amber-900">
            <p>
              We couldn&rsquo;t load the exact application context for this permit (it may
              not exist or may not be publicly accessible). You can still view the standard
              Terms &amp; Conditions template below.
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
                Project:{" "}
                <span className="font-medium text-slate-900">{application.project_title}</span>
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
                  idx > 0
                    ? parseSectionHeading(group.sections[idx - 1].title).partHeading
                    : null;
                const showPartHeading = Boolean(
                  partHeading && partHeading !== previousPartHeading
                );

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
              <div className="mt-2 text-sm text-amber-900 whitespace-pre-wrap">
                {importantNotice.body}
              </div>
            </div>
          ) : null}

          {bulkNetworks && bulkNetworks.length > 0 ? (
            <div className="space-y-3 pt-2">
              <div className="border-t pt-4">
                <div className="text-sm font-bold text-slate-900 mb-1">Annex — Distribution Networks</div>
                <div className="text-xs text-slate-500 mb-3">
                  The following water distribution networks are covered under this permit.
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-700 w-8">#</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-700">Network Name</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-700">Sector</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-700">Cell</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-700">Village</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-700">Coordinates</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-700">Capacity (m³/day)</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-700">Abstraction Method</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkNetworks.map((row, i) => (
                        <tr key={i} className="border-t border-gray-200">
                          <td className="px-3 py-2 text-gray-500 font-mono">{row.number}</td>
                          <td className="px-3 py-2">{row.network_name}</td>
                          <td className="px-3 py-2">{row.sector}</td>
                          <td className="px-3 py-2">{row.cell}</td>
                          <td className="px-3 py-2">{row.village ?? ""}</td>
                          <td className="px-3 py-2 font-mono">{row.coordinates ?? ""}</td>
                          <td className="px-3 py-2">{row.capacity_m3_day ?? ""}</td>
                          <td className="px-3 py-2">
                            {ABSTRACTION_METHODS.find((m) => m.value === row.abstraction_method)?.label ?? row.abstraction_method ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-base">Terms not available</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-red-900">
            This Terms &amp; Conditions variant isn&rsquo;t available.
          </CardContent>
        </Card>
      )}
    </div>
  );

  if (!showChrome) {
    return (
      <div className="space-y-6">
        {header}
        {body}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      {header}
      {body}
    </div>
  );
}
