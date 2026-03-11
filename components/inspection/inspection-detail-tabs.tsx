"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getInspectionById } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Eye, Loader2, Save } from "lucide-react";
import { InspectionDetail } from "@/components/inspection/inspection-detail";

type PermitLite = {
  id: string;
  permit_number: string;
  status: string;
  water_source?: string;
  purpose?: string;
  water_allowance?: number;
  allowance_unit?: string;
  issued_date?: string;
  expiry_date?: string;
};

function fmtDate(dateString?: string | null): string {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function applicantName(applicant: any): string {
  if (!applicant) return "—";
  return applicant.company_name || `${applicant.first_name ?? ""} ${applicant.last_name ?? ""}`.trim() || "—";
}

function statusBadge(status: string) {
  const cfg: Record<string, { label: string; className: string }> = {
    submitted: {
      label: "Submitted",
      className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
    },
    under_review: {
      label: "Under review",
      className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
    },
    scheduled: {
      label: "Scheduled",
      className: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/50 dark:text-slate-300 dark:border-slate-800",
    },
    in_progress: {
      label: "Ongoing",
      className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
    },
    completed: {
      label: "Completed",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
    },
  };
  const c = cfg[status] || {
    label: status,
    className: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/50 dark:text-slate-300 dark:border-slate-800",
  };
  return (
    <Badge variant="outline" className={`${c.className} text-xs font-medium px-2 py-1 rounded-full border whitespace-nowrap`}>
      {c.label}
    </Badge>
  );
}

function workflowStatus(inspection: any): string {
  if (!inspection) return "—";
  if (inspection.status !== "completed") return inspection.status;
  if (inspection.review_status === "reviewed") return "completed";
  const hasReviewActivity = Boolean(inspection.reviewed_at || inspection.review_notes || inspection.review_status === "changes_requested");
  return hasReviewActivity ? "under_review" : "submitted";
}

export function InspectionDetailTabs({ inspectionId }: { inspectionId: string }) {
  const { userProfile } = useAuth();
  const canReview = userProfile?.role === "reviewer" || userProfile?.role === "admin" || userProfile?.role === "approver";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<any>(null);
  const [permit, setPermit] = useState<PermitLite | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"pending" | "reviewed" | "changes_requested">("pending");
  const [reviewNotes, setReviewNotes] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await getInspectionById(inspectionId);
        setInspection(data);
        setReviewStatus((data?.review_status as any) || "pending");
        setReviewNotes((data?.review_notes as string) || "");

        const applicationId = data?.application?.id;
        if (!applicationId) {
          setPermit(null);
          return;
        }

        const { data: permitData, error: permitError } = await supabase
          .from("permits")
          .select("id, permit_number, status, water_source, purpose, water_allowance, allowance_unit, issued_date, expiry_date")
          .eq("application_id", applicationId)
          .maybeSingle();

        if (permitError) throw permitError;
        setPermit((permitData as any) || null);
      } catch (e: any) {
        console.error("❌ Failed to load inspection detail tabs:", e);
        setError(e?.message || "Failed to load inspection details");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [inspectionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <AlertCircle className="h-5 w-5" />
        <span>{error}</span>
      </div>
    );
  }

  const app = inspection?.application;
  const applicant = app?.applicant;
  const isSubmitted = inspection?.status === "completed";

  const saveReview = async () => {
    if (!canReview) return;
    if (!userProfile?.id) return;
    try {
      setSavingReview(true);
      const nowIso = new Date().toISOString();
      const { data, error: upErr } = await supabase
        .from("inspections")
        .update({
          review_status: reviewStatus,
          review_notes: reviewNotes || null,
          reviewed_by: userProfile.id,
          reviewed_at: nowIso,
        })
        .eq("id", inspectionId)
        .select("*")
        .single();
      if (upErr) throw upErr;
      setInspection(data);
    } catch (e: any) {
      console.error("❌ Failed to save inspection review:", e);
      alert(e?.message || "Failed to save review");
    } finally {
      setSavingReview(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Inspection {inspectionId.slice(0, 8)}…</h2>
          <div className="mt-2 flex items-center gap-2">
            {statusBadge(workflowStatus(inspection))}
            <Badge variant="outline" className="text-xs">
              Review: {(inspection?.review_status as string) || "pending"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Date: {fmtDate(inspection?.completed_date || inspection?.scheduled_date || inspection?.created_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {app?.application_number ? (
            <Link href={`/inspection/application/${encodeURIComponent(app.application_number)}`}>
              <Button variant="outline" className="gap-2">
                <Eye className="h-4 w-4" />
                Application
              </Button>
            </Link>
          ) : null}
          {permit?.permit_number ? (
            <Link href={`/permit/view/${encodeURIComponent(permit.permit_number)}`}>
              <Button variant="outline" className="gap-2">
                <Eye className="h-4 w-4" />
                Permit
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      {canReview && isSubmitted ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reviewer sign-off</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={reviewStatus === "reviewed" ? "default" : "outline"}
                onClick={() => setReviewStatus("reviewed")}
              >
                Mark reviewed
              </Button>
              <Button
                type="button"
                size="sm"
                variant={reviewStatus === "changes_requested" ? "default" : "outline"}
                onClick={() => setReviewStatus("changes_requested")}
              >
                Request changes
              </Button>
              <Button
                type="button"
                size="sm"
                variant={reviewStatus === "pending" ? "default" : "outline"}
                onClick={() => setReviewStatus("pending")}
              >
                Pending
              </Button>
              <div className="flex-1" />
              <Button type="button" size="sm" className="gap-2" disabled={savingReview} onClick={saveReview}>
                {savingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save review
              </Button>
            </div>

            <div>
              <Textarea
                placeholder="Reviewer notes (optional)…"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="report" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="application">Application</TabsTrigger>
          <TabsTrigger value="permit">Permit</TabsTrigger>
          <TabsTrigger value="report">Inspection report</TabsTrigger>
        </TabsList>

        <TabsContent value="application" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Application summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Application #</p>
                  <p className="font-medium">{app?.application_number || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Applicant</p>
                  <p className="font-medium">{applicantName(applicant)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Project</p>
                  <p className="font-medium">{app?.project_title || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Location</p>
                  <p className="font-medium">{[app?.district, app?.sector, app?.cell].filter(Boolean).join(", ") || "—"}</p>
                </div>
              </div>
              <Separator />
              {app?.application_number ? (
                <Link href={`/inspection/application/${encodeURIComponent(app.application_number)}`}>
                  <Button variant="default">Open full application</Button>
                </Link>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permit" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Permit details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {permit ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Permit #</p>
                      <p className="font-medium">{permit.permit_number}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Status</p>
                      <p className="font-medium capitalize">{permit.status}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Issued</p>
                      <p className="font-medium">{fmtDate(permit.issued_date)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Expiry</p>
                      <p className="font-medium">{fmtDate(permit.expiry_date)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Purpose</p>
                      <p className="font-medium">{permit.purpose || "—"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Allowance</p>
                      <p className="font-medium">
                        {permit.water_allowance != null ? `${permit.water_allowance} ${permit.allowance_unit || ""}` : "—"}
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <Link href={`/permit/view/${encodeURIComponent(permit.permit_number)}`}>
                    <Button variant="default">Open full permit</Button>
                  </Link>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No permit found for this application.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report" className="mt-6">
          <InspectionDetail inspectionId={inspectionId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}


