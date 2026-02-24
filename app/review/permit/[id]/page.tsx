"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Download, FileCheck, Loader2, Shield } from "lucide-react";
import { downloadFromDocumentsBucket, uploadPermitPdf, uploadTermsPdf } from "@/lib/supabase-storage";
import { generateDigitalWaterPermitBlob, generateTermsConditionsPdfBlob } from "@/lib/pdf-generator";
import { contractTermsByVariant } from "@/lib/contract-terms";
import { buildContractPlaceholderContext, fillContractText } from "@/lib/contract-placeholders";
import { selectPermitVariant } from "@/lib/permit-variant";

type StaffPermitResponse =
  | { success: true; permit: any }
  | { success: false; message: string };

export default function StaffPermitDetailPage() {
  const params = useParams();
  const permitId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permit, setPermit] = useState<any | null>(null);
  const [busy, setBusy] = useState<"permit_pdf" | "terms_pdf" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setLoading(true);
        setError(null);
        setPermit(null);
        const res = await fetch(`/api/staff/permits/${encodeURIComponent(permitId)}`, { method: "GET" });
        const json = (await res.json().catch(() => null)) as StaffPermitResponse | null;
        if (!res.ok || !json || json.success !== true) {
          throw new Error((json as any)?.message || res.statusText || "Failed to load permit");
        }
        if (!cancelled) setPermit((json as any).permit);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load permit");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [permitId]);

  const title = useMemo(() => {
    const appTitle = permit?.application?.project_title;
    return appTitle ? `Permit — ${appTitle}` : "Permit Details";
  }, [permit]);

  const statusBadge = useMemo(() => {
    const status = String(permit?.status || "").toLowerCase();
    if (status === "active") return <Badge className="bg-green-600 text-white">Active</Badge>;
    if (status === "revoked") return <Badge variant="destructive">Revoked</Badge>;
    if (status === "suspended") return <Badge className="bg-amber-600 text-white">Suspended</Badge>;
    if (status === "expired") return <Badge className="bg-slate-600 text-white">Expired</Badge>;
    return <Badge variant="outline">{permit?.status || "Unknown"}</Badge>;
  }, [permit]);

  const openBlobInNewTab = async (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleOpenPermitPdf = async () => {
    if (!permit?.id) return;
    if (busy) return;
    setBusy("permit_pdf");
    try {
      const existing = permit?.permit_pdf_url;
      if (existing) {
        const blob = await downloadFromDocumentsBucket(existing);
        if (blob) {
          await openBlobInNewTab(blob);
          return;
        }
      }

      // Generate on-demand + persist
      const applicationData = permit?.application;
      if (!applicationData) throw new Error("Application data not found for this permit");

      const conditionsForPdf: string[] = (() => {
        const c = permit?.conditions?.conditions;
        if (Array.isArray(c)) return c;
        return [
          "Comply with all environmental regulations",
          "Submit quarterly usage reports",
          "Allow inspections as required",
        ];
      })();

      const pdfBlob = await generateDigitalWaterPermitBlob(
        applicationData,
        permit.permit_number,
        conditionsForPdf,
        5,
        permit.is_modification === true,
        { issuedDate: permit.issued_date, expiryDate: permit.expiry_date }
      );

      const upload = await uploadPermitPdf({
        permitId: permit.id,
        permitNumber: permit.permit_number,
        pdfBlob,
      });

      if (upload?.path) {
        await fetch(`/api/staff/permits/${encodeURIComponent(permit.id)}`, { method: "GET" }).catch(() => null);
      }

      await openBlobInNewTab(pdfBlob);
    } catch (e) {
      console.error("❌ Failed to open/generate permit PDF:", e);
      alert("Failed to open permit PDF. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleOpenTermsPdf = async () => {
    if (!permit?.id) return;
    if (busy) return;
    setBusy("terms_pdf");
    try {
      const applicationData = permit?.application;
      if (!applicationData) throw new Error("Application data not found for this permit");

      const notes = (() => {
        const s = applicationData?.internal_notes;
        if (typeof s !== "string" || !s.trim()) return {};
        try {
          const v = JSON.parse(s);
          if (v && typeof v === "object" && !Array.isArray(v)) return v;
          return {};
        } catch {
          return {};
        }
      })();

      const existing = typeof notes.accepted_terms_pdf_url === "string" ? notes.accepted_terms_pdf_url : null;
      if (existing) {
        const blob = await downloadFromDocumentsBucket(existing);
        if (blob) {
          await openBlobInNewTab(blob);
          return;
        }
      }

      const variant = selectPermitVariant(applicationData as any);
      const resolvedTerms = (contractTermsByVariant as any)[variant] ?? null;
      if (!resolvedTerms) throw new Error("No contract terms configured for this permit type.");

      const placeholderCtx = buildContractPlaceholderContext(applicationData as any, applicationData?.application_number || "");
      const filledSections = resolvedTerms.sections.map((section: any) => ({
        title: section.title,
        paragraphs: section.paragraphs.map((p: string) => fillContractText(p, placeholderCtx)),
      }));

      const applicantName = (() => {
        const applicant = applicationData?.applicant;
        if (!applicant) return "N/A";
        if (applicant.account_type === "individual") {
          return `${applicant.first_name || ""} ${applicant.last_name || ""}`.trim() || "N/A";
        }
        return applicant.company_name || "N/A";
      })();

      const contractNumber = String(permit.permit_number || "").replace(/^WP-/, "") || "N/A";
      const postAcceptanceNoticeBody =
        "You have already acknowledged that these terms, you acknowledge that you have read, understood, and agree to comply with all conditions. Violation of any condition may result in permit suspension or revocation.";

      const blob = await generateTermsConditionsPdfBlob({
        applicationNumber: applicationData?.application_number || "N/A",
        projectTitle: applicationData?.project_title || "N/A",
        applicantName,
        contractNumber,
        termsHeading: resolvedTerms.heading,
        termsSections: filledSections,
        importantNotice: resolvedTerms.importantNotice
          ? { ...resolvedTerms.importantNotice, body: postAcceptanceNoticeBody }
          : null,
      });

      const upload = await uploadTermsPdf({
        permitId: permit.id,
        contractNumber,
        pdfBlob: blob,
      });

      if (upload?.path) {
        const merged = { ...notes, accepted_terms_pdf_url: upload.path, accepted_terms_pdf_updated_at: new Date().toISOString() };
        // best-effort: persist to application internal_notes
        await fetch(`/api/staff/permits/${encodeURIComponent(permit.id)}`, { method: "GET" }).catch(() => null);
        // We can’t safely update via admin here without an API; the review actions already persist it.
        // This page still opens the generated blob immediately.
      }

      await openBlobInNewTab(blob);
    } catch (e) {
      console.error("❌ Failed to open/generate terms PDF:", e);
      alert("Failed to open terms PDF. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button asChild variant="ghost" className="gap-2">
              <Link href="/review">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-semibold truncate">{title}</h1>
                {permit ? statusBadge : null}
              </div>
              <div className="text-sm text-muted-foreground">
                {permit?.permit_number ? `Permit No: ${permit.permit_number}` : "—"}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="py-10 flex items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading permit…
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="py-10 text-center">
              <div className="text-sm font-medium text-destructive">Failed to load permit</div>
              <div className="mt-2 text-sm text-muted-foreground">{error}</div>
            </CardContent>
          </Card>
        ) : !permit ? (
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="py-10 text-center">
              <div className="text-sm font-medium">Permit not found</div>
              <div className="mt-2 text-sm text-muted-foreground">
                The permit you are looking for does not exist or has been removed.
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5" />
                  Permit summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Issued</div>
                    <div className="font-medium">{permit.issued_date || "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Expires</div>
                    <div className="font-medium">{permit.expiry_date || "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Water source</div>
                    <div className="font-medium">{permit.water_source || "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Purpose</div>
                    <div className="font-medium">{permit.purpose || "—"}</div>
                  </div>
                </div>

                <Separator />

                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleOpenPermitPdf} disabled={!!busy} className="gap-2">
                    {busy === "permit_pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {busy === "permit_pdf" ? "Generating Permit PDF…" : "Open Permit PDF"}
                  </Button>
                  <Button onClick={handleOpenTermsPdf} disabled={!!busy} variant="outline" className="gap-2">
                    {busy === "terms_pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                    {busy === "terms_pdf" ? "Generating Terms PDF…" : "Open Terms PDF"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

