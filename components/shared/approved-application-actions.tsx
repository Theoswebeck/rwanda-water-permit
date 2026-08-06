"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Eye, Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { downloadFromDocumentsBucket, uploadTermsPdf } from "@/lib/supabase-storage";
import { buildContractPlaceholderContext } from "@/lib/contract-placeholders";
import { getResolvedContractTerms } from "@/lib/document-slots";
import { selectPermitVariant } from "@/lib/permit-variant";
import { generateTermsConditionsPdfBlob } from "@/lib/pdf-generator";
import type { LinkedPermitLite } from "@/lib/linked-permits";

type ApprovedApp = {
  id: string;
  application_number?: string | null;
  project_title?: string | null;
  terms_status?: string | null;
  internal_notes?: string | null;
};

type BusyKind = "permit_pdf" | "terms_pdf";

export type ApprovedApplicationActionsProps = {
  app: ApprovedApp;
  /** Permit backing this approved application, from fetchLinkedPermitsForApprovedApps. */
  permit: LinkedPermitLite | undefined;
  /** Destination for "View Application" — differs per dashboard (/review vs /assessment). */
  viewApplicationHref: string;
  /**
   * Called after a freshly generated Terms PDF is persisted, so the parent
   * list can cache the stored path and skip regeneration next time.
   */
  onInternalNotesUpdated?: (appId: string, internalNotes: string) => void;
};

function parseNotes(s: unknown): Record<string, any> {
  if (typeof s !== "string" || !s.trim()) return {};
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
    return {};
  } catch {
    return {};
  }
}

/**
 * Actions menu for an approved application: View Application, View Permit
 * Page, View Terms PDF.
 *
 * Shared by the reviewer (/review) and assessor (/assessment) dashboards so
 * both roles get the same three actions on approved rows.
 */
export function ApprovedApplicationActions({
  app,
  permit,
  viewApplicationHref,
  onInternalNotesUpdated,
}: ApprovedApplicationActionsProps) {
  const [busy, setBusy] = useState<BusyKind | null>(null);

  const openPermitPdf = async () => {
    if (!permit?.id || !permit?.permit_number) {
      alert("No linked permit found for this approved application.");
      return;
    }
    if (busy) return;
    setBusy("permit_pdf");
    try {
      const verificationUrl = `https://waterpermit.rwb.rw/permit/view/${encodeURIComponent(permit.permit_number)}`;
      window.open(verificationUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("❌ Failed to open permit page:", e);
      alert("Failed to open permit page. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const openTermsPdf = async () => {
    if (busy) return;
    if (app.terms_status && app.terms_status !== "accepted") {
      alert("Terms have not been accepted for this application yet.");
      return;
    }

    if (!permit?.id || !permit?.permit_number) {
      alert("No linked permit found for this approved application.");
      return;
    }

    setBusy("terms_pdf");

    const notes = parseNotes(app.internal_notes);
    const existingPath = typeof notes.accepted_terms_pdf_url === "string" ? notes.accepted_terms_pdf_url : null;
    if (existingPath) {
      const blob = await downloadFromDocumentsBucket(existingPath);
      if (!blob) {
        alert("Failed to open Terms PDF. Please try again.");
        setBusy(null);
        return;
      }
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setBusy(null);
      return;
    }

    try {
      // Fetch enough application data to render the exact contract terms + placeholders.
      const { data: applicationData, error: appErr } = await supabase
        .from("applications")
        .select(
          `
          id,
          internal_notes,
          water_source,
          water_body_name,
          max_daily_volume_m3,
          max_yearly_volume_m3,
          estimated_usage_volume,
          usage_unit,
          proposed_duration_years,
          concession_area,
          intended_activities,
          province,
          district,
          sector,
          cell,
          village,
          coordinates,
          applicant:users!applicant_id(account_type, first_name, last_name, company_name, id_number)
        `
        )
        .eq("id", app.id)
        .single();

      if (appErr || !applicationData) throw appErr ?? new Error("Application not found");

      const variant = selectPermitVariant(applicationData as any);
      // getResolvedContractTerms applies any assessor text overrides on top
      // of the variant template + placeholder substitution; returns null
      // when the variant has no template.
      const resolvedTerms = getResolvedContractTerms({
        application: applicationData as any,
        applicationNumber: app.application_number || "",
        variantOverride: variant,
      });
      if (!resolvedTerms) throw new Error("No contract terms configured for this application type.");

      // placeholderCtx is no longer needed for filling text (resolver did it)
      // but a couple of downstream callers still want it for derived labels.
      const placeholderCtx = buildContractPlaceholderContext(
        applicationData as any,
        app.application_number || "",
      );
      void placeholderCtx;
      const filledSections = resolvedTerms.sections.map((section) => ({
        title: section.title,
        paragraphs: section.paragraphs,
      }));

      const applicantName = (() => {
        const applicant = (applicationData as any).applicant;
        if (!applicant) return "N/A";
        if (applicant.account_type === "individual") {
          return `${applicant.first_name || ""} ${applicant.last_name || ""}`.trim() || "N/A";
        }
        return applicant.company_name || "N/A";
      })();

      const contractNumber = String(permit.permit_number).replace(/^WP-/, "");
      const postAcceptanceNoticeBody =
        "You have already acknowledged that these terms, you acknowledge that you have read, understood, and agree to comply with all conditions. Violation of any condition may result in permit suspension or revocation.";

      const termsBlob = await generateTermsConditionsPdfBlob({
        applicationNumber: app.application_number || "N/A",
        projectTitle: app.project_title || "N/A",
        applicantName,
        contractNumber,
        termsHeading: resolvedTerms.heading,
        termsSections: filledSections,
        importantNotice: resolvedTerms.importantNotice
          ? { ...resolvedTerms.importantNotice, body: postAcceptanceNoticeBody }
          : null,
      });

      // Upload + persist path in internal_notes (best-effort).
      const upload = await uploadTermsPdf({
        permitId: permit.id,
        contractNumber,
        pdfBlob: termsBlob,
      });

      if (upload?.path) {
        const mergedPatch = {
          accepted_terms_pdf_url: upload.path,
          accepted_terms_pdf_updated_at: new Date().toISOString(),
        };

        // Persist via staff API (service role) to avoid RLS issues.
        await fetch(`/api/staff/applications/${encodeURIComponent(app.id)}/internal-notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patch: mergedPatch }),
        }).catch(() => null);

        const merged = { ...notes, ...mergedPatch };
        onInternalNotesUpdated?.(app.id, JSON.stringify(merged));
      }

      const url = URL.createObjectURL(termsBlob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error("❌ Failed to generate/open terms PDF:", e);
      alert("Failed to generate Terms PDF. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {busy ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-[92vw] max-w-md rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/90">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-3 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {busy === "permit_pdf" ? "Opening Permit Page" : "Preparing Terms PDF"}
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  This can take a few seconds. Please keep this tab open.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 min-w-[72px] justify-center px-2">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={viewApplicationHref} className="flex items-center">
            <Eye className="h-4 w-4 mr-2" />
            View Application
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await openPermitPdf();
          }}
          disabled={!!busy}
          className="flex items-center cursor-pointer"
        >
          {busy === "permit_pdf" ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Eye className="h-4 w-4 mr-2" />
          )}
          {busy === "permit_pdf" ? "Opening Permit Page…" : "View Permit Page"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await openTermsPdf();
          }}
          disabled={!!busy}
          className="flex items-center cursor-pointer"
        >
          {busy === "terms_pdf" ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {busy === "terms_pdf" ? "Generating Terms PDF…" : "View Terms PDF"}
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
