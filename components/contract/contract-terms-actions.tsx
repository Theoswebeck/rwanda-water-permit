"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Printer, ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateTermsConditionsPdfBlob } from "@/lib/pdf-generator";
import { getResolvedContractTerms } from "@/lib/document-slots";
import { selectPermitVariant, type PermitVariant } from "@/lib/permit-variant";

interface ContractTermsActionsProps {
  application: Record<string, any> | null;
  permitNumber: string;
  variantOverride?: PermitVariant | null;
}

export function ContractTermsActions({
  application,
  permitNumber,
  variantOverride = null,
}: ContractTermsActionsProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    if (isDownloading) return;
    setIsDownloading(true);

    try {
      const variant =
        variantOverride || (application ? selectPermitVariant(application as any) : "fallback_generic");
      const resolvedTerms = application
        ? getResolvedContractTerms({
            application: application as any,
            applicationNumber: application.application_number || "",
            permitNumber,
            variantOverride: variant,
          })
        : null;

      if (!resolvedTerms) {
        window.print();
        return;
      }

      const filledSections = resolvedTerms.sections.map((section) => ({
        title: section.title,
        paragraphs: section.paragraphs,
      }));

      const applicantName = (() => {
        const applicant = application?.applicant;
        if (!applicant) return "N/A";
        if (applicant.account_type === "individual") {
          return `${applicant.first_name || ""} ${applicant.last_name || ""}`.trim() || "N/A";
        }
        return applicant.company_name || `${applicant.first_name || ""} ${applicant.last_name || ""}`.trim() || "N/A";
      })();

      const contractNumber = String(permitNumber).replace(/^WP-/, "");
      const postAcceptanceNoticeBody =
        "You have already acknowledged these terms. You confirm that you have read, understood, and agree to comply with all conditions. Violation of any condition may result in permit suspension or revocation.";

      const blob = await generateTermsConditionsPdfBlob({
        applicationNumber: application?.application_number || "N/A",
        projectTitle: application?.project_title || "N/A",
        applicantName,
        contractNumber,
        termsHeading: resolvedTerms.heading,
        termsSections: filledSections,
        importantNotice: resolvedTerms.importantNotice
          ? { ...resolvedTerms.importantNotice, body: postAcceptanceNoticeBody }
          : null,
      });

      const cleanFilename = `terms-and-conditions-${permitNumber.replace(/\//g, "-")}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = cleanFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error("Failed to generate terms PDF:", err);
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="print:hidden rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign("/dashboard")}
            className="text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <Link
            href={`/permit/view/${encodeURIComponent(permitNumber)}`}
            className="inline-flex items-center text-xs text-[#0072bc] hover:underline ml-2"
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            View Official Permit
          </Link>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <Printer className="mr-1.5 h-4 w-4 text-slate-500" />
            Print
          </Button>

          <Button
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="bg-[#0072bc] hover:bg-[#005fa0] text-white font-medium"
          >
            {isDownloading ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="mr-1.5 h-4 w-4" />
                Download Terms PDF
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

