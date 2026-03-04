"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Download,
  Eye,
  FileCheck,
  Loader2,
  MapPin,
  MoreHorizontal,
  Search,
  Send,
  UserPlus,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { supabase, createAuditLog } from "@/lib/supabase";
import type { Application } from "@/types/database";
import { WaterConcessionMap } from "@/components/shared/water-concession-map";
import { StaffTopTabs } from "@/components/shared/staff-top-tabs";
import { InspectionsWorkbench } from "@/components/inspection/inspections-workbench";
import { WaterUseReportsList } from "@/components/water-use-reports/water-use-reports-list";
import { PermitRegistryList } from "@/components/permit-registry/permit-registry-list";
import { sortBySubmissionDateDescending } from "@/lib/application-sorting";
import { calculateDaysRemainingTo90DayDeadline } from "@/lib/utils";
import { StatusFilterChips, type StatusChipDef } from "@/components/shared/status-filter-chips";
import { WorkflowDatesCell } from "@/components/shared/workflow-dates-cell";
import { batchFetchWorkflowDates, type WorkflowDates } from "@/lib/workflow-dates";
import { downloadFromDocumentsBucket, uploadPermitPdf, uploadTermsPdf } from "@/lib/supabase-storage";
import { contractTermsByVariant } from "@/lib/contract-terms";
import { buildContractPlaceholderContext, fillContractText } from "@/lib/contract-placeholders";
import { selectPermitVariant } from "@/lib/permit-variant";
import { generateTermsConditionsPdfBlob } from "@/lib/pdf-generator";
import { getActivityLabel } from "@/lib/assessment-report-utils";

interface ReviewApplication extends Application {
  applicant_name?: string;
  sla_days_remaining?: number;
  deadline_90_days_remaining?: number;
  assigned_assessor_name?: string;
  assigned_assessor?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
}

type LinkedPermitLite = {
  id: string;
  permit_number: string;
  permit_pdf_url: string | null;
};

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  email: string;
}

// ─── Chip definitions per RWB spec ────────────────────────────────────────────
const REVIEWER_CHIPS: StatusChipDef[] = [
  { id: "all_applications", label: "All Applications", statuses: [], priority: "primary" },
  { id: "new_submissions", label: "New Submissions", statuses: ["submitted"], priority: "primary" },
  { id: "with_assessors", label: "With Assessors", statuses: ["pending_assessment", "under_review"], priority: "secondary" },
  { id: "pending_review", label: "Pending Review", statuses: ["pending_review"], priority: "primary" },
  { id: "returned_to_assessor", label: "Returned to Assessor", statuses: ["returned_to_assessment"], priority: "secondary" },
  { id: "pending_verification", label: "Pending Verification", statuses: ["pending_verification"], priority: "downstream" },
  { id: "pending_approver", label: "Pending Approver", statuses: ["pending_final_approval"], priority: "downstream" },
  { id: "re_review", label: "Returned for Review", statuses: ["returned_to_review"], priority: "primary" },
  { id: "awaiting_terms", label: "Awaiting Terms", statuses: ["approved_pending_permit"], priority: "downstream" },
  { id: "issued", label: "Approved", statuses: ["approved"], priority: "downstream" },
  { id: "rejected", label: "Rejected", statuses: ["rejected"], priority: "downstream" },
];

export default function ReviewerDashboard() {
  const router = useRouter();
  const [topTab, setTopTab] = useState<"review" | "inspections" | "water-reports" | "permit-registry">("review");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [reviewApplications, setReviewApplications] = useState<ReviewApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingReview, setStartingReview] = useState<string | null>(null);
  const [activeChipId, setActiveChipId] = useState(REVIEWER_CHIPS[0].id);
  const [activeInnerTab, setActiveInnerTab] = useState<string>("all_applications");
  const [workflowDatesMap, setWorkflowDatesMap] = useState<Record<string, WorkflowDates>>({});
  const [permitByApplicationId, setPermitByApplicationId] = useState<Record<string, LinkedPermitLite>>({});
  const [busyAction, setBusyAction] = useState<{ appId: string; kind: "permit_pdf" | "terms_pdf" } | null>(null);

  // Assessor assignment state
  const [assessors, setAssessors] = useState<StaffMember[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedAppForAssignment, setSelectedAppForAssignment] = useState<ReviewApplication | null>(null);
  const [selectedAssessorId, setSelectedAssessorId] = useState<string>("");
  const [assignLoading, setAssignLoading] = useState(false);

  const isFinalizedStatus = (status: string | null | undefined) => {
    return status === "approved" || status === "rejected";
  };

  const canAssignOrReassignFromReviewDashboard = (status: string | null | undefined) => {
    return (
      status === "submitted" ||
      status === "pending_assessment" ||
      status === "under_review" ||
      status === "returned_to_review" ||
      status === "returned_to_assessment"
    );
  };

  const getAssessorLabelForApp = (app: ReviewApplication) => {
    return app.assigned_assessor_name || "Unknown assessor";
  };

  const getAssignActionLabel = (app: ReviewApplication) => {
    if (app.assigned_assessor_id) {
      return `Reassign Assessor (from ${getAssessorLabelForApp(app)})`;
    }
    return "Assign to Assessor";
  };

  // Fetch applications for review
  useEffect(() => {
    const fetchReviewApplications = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
           .from('applications')
           .select(`
             *,
             applicant:users!applicant_id(first_name, last_name, company_name),
             assigned_assessor:users!assigned_assessor_id(first_name, last_name, email)
           `)
           .order('submitted_at', { ascending: false, nullsFirst: false })
           .order('created_at', { ascending: false });

        if (error) throw error;

        const processedApplications: ReviewApplication[] = data.map(app => {
           const applicant = app.applicant as any;
           const applicantName = applicant?.company_name || 
                                (applicant?.first_name && applicant?.last_name ? 
                                 `${applicant.first_name} ${applicant.last_name}` : 
                                 'Unknown Applicant');

           const assignedAssessor = (app as any).assigned_assessor as ReviewApplication["assigned_assessor"];
           const assignedAssessorName =
             assignedAssessor?.first_name && assignedAssessor?.last_name
               ? `${assignedAssessor.first_name} ${assignedAssessor.last_name}`
               : assignedAssessor?.email || null;

           let slaRemaining: number | null = null;
           if (app.due_date) {
             const dueDate = new Date(app.due_date);
             const now = new Date();
             const diffTime = dueDate.getTime() - now.getTime();
             const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
             slaRemaining = diffDays;
           }

           const deadline90Remaining = calculateDaysRemainingTo90DayDeadline({
             completenessConfirmedAt: app.completeness_confirmed_at,
           });

           return {
             ...app,
             applicant_name: applicantName,
             sla_days_remaining: slaRemaining,
             deadline_90_days_remaining: deadline90Remaining,
             assigned_assessor: assignedAssessor ?? null,
             assigned_assessor_name: assignedAssessorName ?? undefined
           };
         });

        setReviewApplications(processedApplications);

        // Fetch linked permits for approved applications (for Actions: View Permit / View PDF)
        try {
          const approvedApps = processedApplications.filter((a) => a.status === "approved");
          if (approvedApps.length === 0) {
            setPermitByApplicationId({});
          } else {
            const appIdSet = new Set<string>(approvedApps.map((a) => a.id));
            const appToPermitId: Record<string, string> = {};
            const permitIdsToFetch = new Set<string>();

            for (const app of approvedApps) {
              // Renewals: permit id is directly referenced
              if ((app as any).is_renewal === true && (app as any).renewed_from_permit_id) {
                const pid = String((app as any).renewed_from_permit_id);
                appToPermitId[app.id] = pid;
                permitIdsToFetch.add(pid);
                continue;
              }

              // Modifications: permit id lives in internal_notes.originalPermitId
              if ((app as any).is_modification === true && (app as any).internal_notes) {
                try {
                  const parsed = JSON.parse(String((app as any).internal_notes));
                  const pid = parsed?.originalPermitId;
                  if (typeof pid === "string" && pid.trim()) {
                    appToPermitId[app.id] = pid;
                    permitIdsToFetch.add(pid);
                    continue;
                  }
                } catch {
                  // ignore parse errors
                }
              }
            }

            // 1) Permits that are directly linked via `permits.application_id` (new permits + transfers)
            const { data: permitsByApp, error: permitsByAppError } = await supabase
              .from("permits")
              .select("id, application_id, permit_number, permit_pdf_url")
              .in("application_id", Array.from(appIdSet));
            if (permitsByAppError) throw permitsByAppError;

            // 2) Permits referenced via renewal/modification permit IDs
            let permitsById: any[] = [];
            if (permitIdsToFetch.size > 0) {
              const { data: permits, error: permitsByIdError } = await supabase
                .from("permits")
                .select("id, application_id, permit_number, permit_pdf_url")
                .in("id", Array.from(permitIdsToFetch));
              if (permitsByIdError) throw permitsByIdError;
              permitsById = permits || [];
            }

            const permitById = new Map<string, LinkedPermitLite>();
            for (const p of permitsById as any[]) {
              if (p?.id && p?.permit_number) {
                permitById.set(String(p.id), {
                  id: String(p.id),
                  permit_number: String(p.permit_number),
                  permit_pdf_url: (p as any).permit_pdf_url ?? null,
                });
              }
            }

            const linked: Record<string, LinkedPermitLite> = {};

            for (const p of (permitsByApp || []) as any[]) {
              const applicationId = String(p.application_id);
              if (!appIdSet.has(applicationId)) continue;
              if (!p?.id || !p?.permit_number) continue;
              linked[applicationId] = {
                id: String(p.id),
                permit_number: String(p.permit_number),
                permit_pdf_url: (p as any).permit_pdf_url ?? null,
              };
            }

            for (const [appId, pid] of Object.entries(appToPermitId)) {
              const permit = permitById.get(pid);
              if (permit) linked[appId] = permit;
            }

            setPermitByApplicationId(linked);
          }
        } catch (e) {
          console.warn("⚠️ Failed to load linked permits for approved apps:", e);
          setPermitByApplicationId({});
        }

        // Batch-fetch workflow dates
        const submittedAtMap: Record<string, string | null> = {};
        for (const app of processedApplications) {
          submittedAtMap[app.id] = app.submitted_at || app.created_at;
        }
        const dates = await batchFetchWorkflowDates(
          processedApplications.map((a) => a.id),
          submittedAtMap
        );
        setWorkflowDatesMap(dates);
      } catch (err) {
        let errorMsg = 'Failed to fetch applications';
        if (err instanceof Error) {
          errorMsg = err.message;
          console.error('❌ Error fetching review applications:', err);
        } else if (typeof err === 'object' && err !== null) {
          const maybeMsg = (err as { message?: string; details?: string });
          errorMsg = maybeMsg.message || maybeMsg.details || JSON.stringify(err);
          console.error('❌ Error fetching review applications:', JSON.stringify(err, null, 2));
        } else {
          console.error('❌ Error fetching review applications:', err);
        }
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    fetchReviewApplications();
  }, []);

  const openPermitPdf = async (app: ReviewApplication) => {
    const permit = permitByApplicationId[app.id];
    if (!permit?.id) {
      alert("No linked permit found for this approved application.");
      return;
    }
    if (busyAction) return;
    setBusyAction({ appId: app.id, kind: "permit_pdf" });

    // If we already have a stored PDF path/URL, open it.
    if (permit.permit_pdf_url) {
      const blob = await downloadFromDocumentsBucket(permit.permit_pdf_url);
      if (!blob) {
        alert("Failed to open permit PDF. Please try again.");
        setBusyAction(null);
        return;
      }
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setBusyAction(null);
      return;
    }

    // Otherwise, generate & persist a PDF on-demand, then open it.
    try {
      const { data: permitRow, error: permitError } = await supabase
        .from("permits")
        .select(
          `
          id,
          permit_number,
          issued_date,
          expiry_date,
          conditions,
          is_modification,
          application_id,
          application:applications!application_id(
            *,
            applicant:users!applicant_id(*)
          )
        `
        )
        .eq("id", permit.id)
        .single();

      if (permitError || !permitRow) throw permitError ?? new Error("Permit not found");
      const applicationData = (permitRow as any).application;
      if (!applicationData) throw new Error("Application data not found for this permit");

      const conditionsForPdf: string[] = (() => {
        const c = (permitRow as any)?.conditions?.conditions;
        if (Array.isArray(c)) return c;
        return [
          "Comply with all environmental regulations",
          "Submit quarterly usage reports",
          "Allow inspections as required",
        ];
      })();

      const issuedDate = (permitRow as any).issued_date ?? null;
      const expiryDate = (permitRow as any).expiry_date ?? null;
      const durationYears = (() => {
        try {
          if (!issuedDate || !expiryDate) return 5;
          const di = new Date(issuedDate).getTime();
          const de = new Date(expiryDate).getTime();
          if (!Number.isFinite(di) || !Number.isFinite(de) || de <= di) return 5;
          const years = (de - di) / (365.25 * 24 * 60 * 60 * 1000);
          const rounded = Math.round(years);
          return rounded >= 1 && rounded <= 15 ? rounded : 5;
        } catch {
          return 5;
        }
      })();

      const { generateDigitalWaterPermitBlob } = await import("@/lib/pdf-generator");
      const pdfBlob = await generateDigitalWaterPermitBlob(
        applicationData,
        (permitRow as any).permit_number,
        conditionsForPdf,
        durationYears,
        (permitRow as any).is_modification === true,
        {
          issuedDate,
          expiryDate,
        }
      );

      const upload = await uploadPermitPdf({
        permitId: (permitRow as any).id,
        permitNumber: (permitRow as any).permit_number,
        pdfBlob,
      });

      if (upload?.path) {
        // Persist via staff API (service role) to avoid RLS issues.
        await fetch(`/api/staff/permits/${encodeURIComponent(String((permitRow as any).id))}/pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: upload.path }),
        }).catch(() => null);

        setPermitByApplicationId((prev) => ({
          ...prev,
          [app.id]: {
            id: String((permitRow as any).id),
            permit_number: String((permitRow as any).permit_number),
            permit_pdf_url: upload.path,
          },
        }));
      }

      const url = URL.createObjectURL(pdfBlob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error("❌ Failed to generate/open permit PDF:", e);
      alert("Failed to generate permit PDF. Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  const openTermsPdf = async (app: ReviewApplication) => {
    if (busyAction) return;
    if (app.terms_status && app.terms_status !== "accepted") {
      alert("Terms have not been accepted for this application yet.");
      return;
    }

    const permit = permitByApplicationId[app.id];
    if (!permit?.id || !permit?.permit_number) {
      alert("No linked permit found for this approved application.");
      return;
    }

    setBusyAction({ appId: app.id, kind: "terms_pdf" });

    const parseNotes = (s: unknown): Record<string, any> => {
      if (typeof s !== "string" || !s.trim()) return {};
      try {
        const v = JSON.parse(s);
        if (v && typeof v === "object" && !Array.isArray(v)) return v;
        return {};
      } catch {
        return {};
      }
    };

    const notes = parseNotes(app.internal_notes);
    const existingPath = typeof notes.accepted_terms_pdf_url === "string" ? notes.accepted_terms_pdf_url : null;
    if (existingPath) {
      const blob = await downloadFromDocumentsBucket(existingPath);
      if (!blob) {
        alert("Failed to open Terms PDF. Please try again.");
        setBusyAction(null);
        return;
      }
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setBusyAction(null);
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
      const resolvedTerms = (contractTermsByVariant as any)[variant] ?? null;
      if (!resolvedTerms) throw new Error("No contract terms configured for this application type.");

      const placeholderCtx = buildContractPlaceholderContext(applicationData as any, app.application_number || "");
      const filledSections = resolvedTerms.sections.map((section: any) => ({
        title: section.title,
        paragraphs: section.paragraphs.map((p: string) => fillContractText(p, placeholderCtx)),
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
        setReviewApplications((prev) => prev.map((a) => (a.id === app.id ? ({ ...a, internal_notes: JSON.stringify(merged) } as any) : a)));
      }

      const url = URL.createObjectURL(termsBlob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error("❌ Failed to generate/open terms PDF:", e);
      alert("Failed to generate Terms PDF. Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  // Fetch assessors for assignment dropdown
  useEffect(() => {
    const fetchAssessors = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, first_name, last_name, role, email')
          .in('role', ['assessor'])
          .eq('status', 'active')
          .order('first_name', { ascending: true });

        if (error) throw error;
        setAssessors(data || []);
      } catch (err) {
        console.error('❌ Error fetching assessors:', err);
      }
    };

    fetchAssessors();
  }, []);

  const handleStartReview = async (application: ReviewApplication) => {
    try {
      setStartingReview(application.id);
      router.push(`/review/application/${application.application_number}`);
    } catch (err) {
      console.error('Error starting review:', err);
      alert('Failed to start review. Please try again.');
      setStartingReview(null);
    }
  };

  const openAssignDialog = (application: ReviewApplication) => {
    setSelectedAppForAssignment(application);
    setSelectedAssessorId(application.assigned_assessor_id || "");
    setAssignDialogOpen(true);
  };

  const handleAssignToAssessor = async () => {
    if (!selectedAppForAssignment || !selectedAssessorId) return;

    try {
      setAssignLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      const selectedAssessor = assessors.find(a => a.id === selectedAssessorId);
      if (!selectedAssessor) {
        alert('Please select a valid assessor');
        return;
      }

      const previousAssessorId = selectedAppForAssignment.assigned_assessor_id || null;
      const previousAssessorLabel = selectedAppForAssignment.assigned_assessor_id
        ? getAssessorLabelForApp(selectedAppForAssignment)
        : null;

      if (previousAssessorId && previousAssessorId === selectedAssessorId) {
        alert('Please choose a different assessor to reassign this application.');
        return;
      }

      const updatePayload = {
        assigned_assessor_id: selectedAssessorId,
        status: 'pending_assessment',
        updated_at: new Date().toISOString()
      };

      let updateQuery = supabase
        .from('applications')
        .update(updatePayload)
        .eq('id', selectedAppForAssignment.id);

      if (previousAssessorId) {
        updateQuery = updateQuery.eq('assigned_assessor_id', previousAssessorId);
      } else {
        updateQuery = updateQuery.is('assigned_assessor_id', null);
      }

      const { data: updatedRows, error: updateError } = await updateQuery.select('id, assigned_assessor_id, status');
      if (updateError) throw updateError;
      if (!updatedRows || updatedRows.length === 0) {
        alert('This application was updated by someone else (assignment changed). Please refresh and try again.');
        return;
      }

      const isReassign = !!previousAssessorId;
      const action = isReassign ? 'reassigned_assessor' : 'assigned_to_assessor';
      const comment = isReassign
        ? `Assessor reassigned from ${previousAssessorLabel || 'Unknown assessor'} to ${selectedAssessor.first_name} ${selectedAssessor.last_name} for assessment`
        : `Application assigned to ${selectedAssessor.first_name} ${selectedAssessor.last_name} for assessment`;

      const { error: workflowError } = await supabase
        .from('workflow_history')
        .insert({
          application_id: selectedAppForAssignment.id,
          from_status: selectedAppForAssignment.status,
          to_status: 'pending_assessment',
          action,
          comment,
          user_id: user?.id
        });

      if (workflowError) {
        console.error('❌ Workflow history error:', workflowError);
      }

      try {
        await createAuditLog({
          action: isReassign ? 'application.reassigned' : 'application.assigned',
          entity_type: 'application',
          table_name: 'applications',
          record_id: selectedAppForAssignment.id,
          old_values: { 
            assigned_assessor_id: previousAssessorId, 
            status: selectedAppForAssignment.status 
          },
          new_values: { 
            assigned_assessor_id: selectedAssessorId, 
            status: 'pending_assessment' 
          },
          description: comment,
          severity: 'info',
          status: 'success',
        });
      } catch (auditErr) {
        console.warn('⚠️ Failed to create audit log:', auditErr);
      }

      console.log(`✅ Application ${selectedAppForAssignment.application_number} ${isReassign ? 'reassigned' : 'assigned'} to ${selectedAssessor.first_name} ${selectedAssessor.last_name}`);

      setReviewApplications(prev =>
        prev.map(app =>
          app.id === selectedAppForAssignment.id
            ? {
                ...app,
                status: 'pending_assessment',
                assigned_assessor_id: selectedAssessorId,
                assigned_assessor: {
                  first_name: selectedAssessor.first_name,
                  last_name: selectedAssessor.last_name,
                  email: selectedAssessor.email
                },
                assigned_assessor_name: `${selectedAssessor.first_name} ${selectedAssessor.last_name}`
              }
            : app
        )
      );

      setAssignDialogOpen(false);
      setSelectedAppForAssignment(null);
      setSelectedAssessorId("");
    } catch (err) {
      console.error('❌ Error assigning application:', err);
      alert('Failed to assign application. Please try again.');
    } finally {
      setAssignLoading(false);
    }
  };

  // Derive active statuses from chip selection
  const activeStatuses = useMemo(() => {
    const chip = REVIEWER_CHIPS.find((c) => c.id === activeChipId);
    return chip?.statuses ?? [];
  }, [activeChipId]);

  const filterApplications = useCallback(
    (applications: ReviewApplication[]) => {
    return applications.filter(app => {
      const matchesSearch = app.application_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           app.applicant_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           app.project_title?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = filterType === "all" || 
                         app.water_source?.toLowerCase().includes(filterType.toLowerCase()) ||
                         app.application_type?.toLowerCase().includes(filterType.toLowerCase());
      
        const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(app.status);
      
      return matchesSearch && matchesType && matchesStatus;
    });
    },
    [searchTerm, filterType, activeStatuses]
  );

  const getReviewStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      submitted: { label: "Submitted", className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800" },
      under_review: { label: "Under Review", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800" },
      pending_assessment: { label: "Pending Assessment", className: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800" },
      pending_review: { label: "Pending Review", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800" },
      pending_verification: { label: "Pending Verification", className: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-400 dark:border-indigo-800" },
      pending_final_approval: { label: "Pending Approval", className: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-800" },
      revision_required: { label: "Revision Required", className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800" },
      approved: { label: "Approved", className: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800" },
      approved_pending_permit: { label: "Pending Terms", className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800" },
      rejected: { label: "Rejected", className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800" },
      returned_to_assessment: { label: "🔄 Returned to Assessor", className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800" },
      returned_to_review: { label: "🔄 Returned for Review", className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800" },
      returned_to_verification: { label: "🔄 Returned to Verifier", className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800" },
    };
    const config = statusConfig[status] || { label: status, className: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/50 dark:text-gray-400 dark:border-gray-800" };
    return (
      <Badge variant="outline" className={`${config.className} text-xs font-medium px-1.5 py-0.5 rounded-full border backdrop-blur-sm whitespace-nowrap`}>
        {config.label}
      </Badge>
    );
  };

    const getApplicationTypeBadge = (app: ReviewApplication) => {
      const appType = app.application_type;
      const isModification = appType === 'modification' || (app as any).is_modification === true;
      const isTransfer = appType === 'transfer';
      const isRenewal = appType === 'renewal' || (app as any).is_renewal === true;
    if (isRenewal) return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap">Renewal</Badge>;
    if (isModification) return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap">Modification</Badge>;
    if (isTransfer) return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap">Transfer</Badge>;
    return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap">New Application</Badge>;
  };

  const getApplicationWaterActivityLabel = (app: ReviewApplication) => {
    const activities = Array.isArray((app as any).intended_activities)
      ? ((app as any).intended_activities as unknown[])
          .filter((activity): activity is string => typeof activity === "string" && activity.trim().length > 0)
      : [];

    if (activities.length > 0) {
      return getActivityLabel(activities[0]);
    }

    if (typeof app.water_purpose === "string" && app.water_purpose.trim().length > 0) {
      return getActivityLabel(app.water_purpose);
    }

    return "N/A";
  };

  const ApplicationTable = ({ applications, emptyMessage }: { applications: ReviewApplication[]; emptyMessage: string }) => {
    const filteredApps = filterApplications(applications);
    const sortedApps = sortBySubmissionDateDescending(filteredApps, (app) => app.submitted_at || app.created_at);

    return (
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border-b border-slate-200 dark:border-slate-800 py-3">
          <CardTitle className="text-slate-900 dark:text-slate-100 font-semibold text-base">
            {emptyMessage} ({filteredApps.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-hidden">
            <Table className="w-full table-fixed">
          <TableHeader>
                <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Dates</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Application</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Applicant</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Type</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Status</TableHead>
                  <TableHead className="text-right text-slate-700 dark:text-slate-300 font-medium">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
                {sortedApps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <div className="text-muted-foreground/50 text-lg">
                          {applications.length === 0 ? "No applications found" : "No applications match your filters"}
                        </div>
                        <div className="text-sm text-muted-foreground/70">
                          {applications.length === 0 ? "Applications will appear here once submitted" : "Try adjusting your search or filter criteria"}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedApps.map((app) => (
                    <TableRow 
                      key={app.id} 
                      className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors duration-150"
                    >
                      <TableCell className="p-2 sm:p-3">
                        <WorkflowDatesCell dates={workflowDatesMap[app.id]} />
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">{app.application_number}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          Water Activity: {getApplicationWaterActivityLabel(app)}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="text-xs text-slate-700 dark:text-slate-300 truncate">
                          {app.applicant_name || "Unknown Applicant"}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">{getApplicationTypeBadge(app)}</TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="flex justify-center">{getReviewStatusBadge(app.status)}</div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3 text-right">
                        <div className="flex items-center justify-end">
                        {app.status === "approved" ? (
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
                                <Link
                                  href={`/review/application/${app.application_number}`}
                                  className="flex items-center"
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Application
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  await openPermitPdf(app);
                                }}
                                disabled={!!busyAction}
                                className="flex items-center cursor-pointer"
                              >
                                {busyAction?.appId === app.id && busyAction.kind === "permit_pdf" ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4 mr-2" />
                                )}
                                {busyAction?.appId === app.id && busyAction.kind === "permit_pdf"
                                  ? "Generating Permit PDF…"
                                  : "View Permit PDF"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  await openTermsPdf(app);
                                }}
                                disabled={!!busyAction}
                                className="flex items-center cursor-pointer"
                              >
                                {busyAction?.appId === app.id && busyAction.kind === "terms_pdf" ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4 mr-2" />
                                )}
                                {busyAction?.appId === app.id && busyAction.kind === "terms_pdf"
                                  ? "Generating Terms PDF…"
                                  : "View Terms PDF"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : canAssignOrReassignFromReviewDashboard(app.status) && !isFinalizedStatus(app.status) ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 min-w-[72px] justify-center px-2">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link href={`/review/application/${app.application_number}`} className="flex items-center">
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => openAssignDialog(app)}
                                className="flex items-center cursor-pointer"
                              >
                                <UserPlus className="h-4 w-4 mr-2" />
                                {getAssignActionLabel(app)}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <Link href={`/review/application/${app.application_number}`}>
                            <Button 
                              size="sm" 
                              className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-sm hover:shadow-md transition-all duration-200 rounded-lg px-2 py-1 text-xs font-medium"
                            >
                              <Eye className="h-3 w-3" />
                              <span className="hidden sm:inline">View</span>
                            </Button>
                          </Link>
                        )}
                        </div>
                      </TableCell>
              </TableRow>
                  ))
                )}
          </TableBody>
        </Table>
      </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-muted-foreground">Loading applications...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive font-medium">Error loading applications</p>
              <p className="text-muted-foreground text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const activeChipLabel = REVIEWER_CHIPS.find((c) => c.id === activeChipId)?.label ?? "All Applications";

  return (
    <ProtectedRoute allowedRoles={['reviewer', 'admin', 'approver']} requireProfile={true}>
      <DashboardLayout>
        {busyAction ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="w-[92vw] max-w-md rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/90">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-slate-100 p-3 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {busyAction.kind === "permit_pdf" ? "Preparing Permit PDF" : "Preparing Terms PDF"}
                  </div>
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    This can take a few seconds. Please keep this tab open.
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="container mx-auto px-4 py-6"
        >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
                Application Review Dashboard
              </h1>
              <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base leading-relaxed [&:not(:first-child)]:mt-6">
                Review and assess water permit applications for technical compliance
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/management">
                <Button variant="outline">Management Dashboard</Button>
              </Link>
            </div>
          </div>

            {/* Status Filter Chips */}
            <StatusFilterChips
              chips={REVIEWER_CHIPS}
              activeChipId={activeChipId}
              onChipChange={setActiveChipId}
              applications={reviewApplications}
          />

          {/* Main Content */}
          <StaffTopTabs
            value={topTab}
            onValueChange={(v) => setTopTab(v as any)}
            tabs={[
              { value: "review", label: "Review" },
              { value: "inspections", label: "Inspections" },
              { value: "water-reports", label: "Water Use Reports" },
              { value: "permit-registry", label: "Permit Registry" },
            ]}
          />

          {topTab === "review" ? (
            <Card>
                <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5" />
                  Review Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={activeInnerTab} onValueChange={setActiveInnerTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="all_applications">Applications</TabsTrigger>
                    <TabsTrigger value="map" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Concession Map
                    </TabsTrigger>
                  </TabsList>

                    <TabsContent value="all_applications" className="space-y-4 mt-4">
                      <div className="flex flex-col md:flex-row gap-4 p-4 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                      <Input
                        placeholder="Search by applicant name, application number, or project title..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 rounded-lg"
                      />
                    </div>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="w-full md:w-48 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg">
                        <SelectValue placeholder="Filter by type" />
                      </SelectTrigger>
                      <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="surface">Surface Water</SelectItem>
                        <SelectItem value="groundwater">Groundwater</SelectItem>
                        <SelectItem value="industrial">Industrial</SelectItem>
                        <SelectItem value="agricultural">Agricultural</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <ApplicationTable 
                    applications={reviewApplications}
                        emptyMessage={activeChipLabel}
                  />
            </TabsContent>

                    <TabsContent value="map" className="space-y-4 mt-4">
              <WaterConcessionMap />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : topTab === "inspections" ? (
            <div className="space-y-6">
              <InspectionsWorkbench />
            </div>
          ) : topTab === "water-reports" ? (
            <WaterUseReportsList />
          ) : (
            <PermitRegistryList />
          )}
        </div>
      </motion.div>

        {/* Assign to Assessor Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-blue-600" />
                {selectedAppForAssignment?.assigned_assessor_id ? "Reassign Assessor" : "Assign to Assessor"}
              </DialogTitle>
              <DialogDescription>
                {selectedAppForAssignment?.assigned_assessor_id ? (
                  <>
                    Reassign application{" "}
                    <span className="font-medium">{selectedAppForAssignment?.application_number}</span> from{" "}
                    <span className="font-medium">{getAssessorLabelForApp(selectedAppForAssignment)}</span> to another assessor.
                  </>
                ) : (
                  <>
                    Assign application <span className="font-medium">{selectedAppForAssignment?.application_number}</span> to an assessor for review.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Assessor</label>
                <Select value={selectedAssessorId} onValueChange={setSelectedAssessorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an assessor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assessors.length === 0 ? (
                      <SelectItem value="no-assessors" disabled>
                        No assessors available
                      </SelectItem>
                    ) : (
                      assessors.map((assessor) => (
                        <SelectItem key={assessor.id} value={assessor.id}>
                          {assessor.first_name} {assessor.last_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              {selectedAssessorId && assessors.find(a => a.id === selectedAssessorId) && (
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {assessors.find(a => a.id === selectedAssessorId)?.first_name}{" "}
                      {assessors.find(a => a.id === selectedAssessorId)?.last_name}
                    </span>
                    {" "}will be notified and the application will appear in their assessment queue.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setAssignDialogOpen(false);
                  setSelectedAppForAssignment(null);
                  setSelectedAssessorId("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssignToAssessor}
                disabled={
                  !selectedAssessorId ||
                  assignLoading ||
                  selectedAssessorId === "no-assessors" ||
                  (selectedAppForAssignment?.assigned_assessor_id
                    ? selectedAssessorId === selectedAppForAssignment.assigned_assessor_id
                    : false)
                }
                className="gap-2"
              >
                {assignLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {selectedAppForAssignment?.assigned_assessor_id ? "Reassigning..." : "Assigning..."}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {selectedAppForAssignment?.assigned_assessor_id ? "Reassign" : "Assign"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </ProtectedRoute>
  );
} 
