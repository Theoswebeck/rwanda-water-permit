"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { fetchInspectionData, capUnitForVarchar20 } from "@/lib/inspection-utils";

import type { Inspection } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertCircle, Save, Send, Eye } from "lucide-react";
import { SmartBackButton } from "@/components/ui/back-button";
import { staffListHref } from "@/lib/staff-nav";
import { InspectionFormLayout } from "@/components/inspection/inspection-form-layout";
import { InspectionOwnerBadge } from "@/components/inspection/inspection-owner-badge";
import { InspectionWorkflowActions } from "@/components/inspection/inspection-workflow-actions";
import { DownloadInspectionButton } from "@/components/inspection/download-inspection-button";
import { isAssessorOwnedWorkflow } from "@/lib/inspection-workflow";
import type { InspectionWorkflowStatus } from "@/types/inspection-workflow";
import { assertInspectionPayloadKeys } from "@/lib/inspections/payload-columns";
import { runInspectionSaveWithSafetyNet } from "@/lib/inspections/safe-payload-retry";

type InspectionTemplate = "authorization" | "concession";

type BoundaryRow = { beacon: string; latitude?: number | null; longitude?: number | null };
type EmploymentRow = { male?: number | null; female?: number | null; total?: number | null };

type EmploymentBreakdown = {
  skilledPermanentWorkers?: EmploymentRow;
  unskilledPermanentWorkers?: EmploymentRow;
  skilledTemporaryWorkers?: EmploymentRow;
  unskilledTemporaryWorkers?: EmploymentRow;
  totalWorkers?: EmploymentRow;
};

type OhsItem = { value?: boolean | null; remarks?: string | null };
type OhsGenderSensitive = {
  genderInclusiveSafetyMeasures?: OhsItem;
  separateSanitationFacilities?: OhsItem;
  genderResponsiveGrievanceMechanism?: OhsItem;
};

interface FormState {
  // Shared sections
  activity_type?: string;
  activity_starting_date?: string;

  wastewater_system_type?: string;
  wastewater_system_effectiveness?: string;

  fees_payment_amount?: number;
  fees_payment_details?: string;
  fees_payment_proof?: string;

  reports_submission_date?: string;
  reports_reference_number?: string;
  reports_proof?: string;

  water_use_conflicts?: string;
  catchment_protection_initiatives?: string;
  general_conclusion?: string;
  recommendations?: string;
  recommendation_details?: string;

  // Authorization-specific
  allowed_quantity?: number;
  allowed_unit?: string;
  authorized_abstraction_method?: string;
  actual_quantity?: number;
  actual_unit?: string;
  actual_abstraction_method?: string;
  measurement_device_type?: string;

  // Concession-specific
  authorized_surface_area_ha?: number;
  actual_surface_area_ha?: number;
  authorized_concession_boundaries?: BoundaryRow[];
  actual_concession_boundaries?: BoundaryRow[];

  // Social/OHS
  employment_gender_breakdown?: EmploymentBreakdown;
  ohs_gender_sensitive?: OhsGenderSensitive;

  // Project (activity site) coordinates — Section 2.1
  project_latitude?: number;
  project_longitude?: number;

  // No-permit inspection metadata
  manual_inspection_subject?: string;
  manual_inspection_reason?: string;
  manual_contact_name?: string;
  manual_contact_phone?: string;
  manual_site_notes?: string;

  // Documents (stored as JSONB in DB)
  inspection_documents?: any[];

  // Inspector-provided overrides for locked fields that are N/A
  locked_field_overrides?: Record<string, string>;
}

function toNumberOrUndefined(v: string): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function templateFromPermit(intendedActivities?: unknown, purpose?: string, regime?: string): InspectionTemplate {
  if (regime?.toLowerCase() === "concession") return "concession";
  const activities = Array.isArray(intendedActivities) ? intendedActivities.map(String) : [];
  const primary = (activities[0] || purpose || "").toLowerCase();
  if (primary === "fish_farming_lakes" || primary === "fish farming in lakes" || primary.includes("aquaculture")) return "concession";
  return "authorization";
}

function normalizeBoundaryRows(value: any): BoundaryRow[] {
  if (!Array.isArray(value)) return [{ beacon: "B1", latitude: null, longitude: null }];
  return value
    .map((r: any) => ({
      beacon: String(r?.beacon ?? "").trim() || "B1",
      latitude: r?.latitude === undefined || r?.latitude === null ? null : Number(r.latitude),
      longitude: r?.longitude === undefined || r?.longitude === null ? null : Number(r.longitude),
    }))
    .filter(r => r.beacon);
}

function defaultEmployment(): EmploymentBreakdown {
  return {
    skilledPermanentWorkers: { male: null, female: null, total: null },
    unskilledPermanentWorkers: { male: null, female: null, total: null },
    skilledTemporaryWorkers: { male: null, female: null, total: null },
    unskilledTemporaryWorkers: { male: null, female: null, total: null },
    totalWorkers: { male: null, female: null, total: null },
  };
}

function defaultOhs(): OhsGenderSensitive {
  return {
    genderInclusiveSafetyMeasures: { value: null, remarks: "" },
    separateSanitationFacilities: { value: null, remarks: "" },
    genderResponsiveGrievanceMechanism: { value: null, remarks: "" },
  };
}

async function fetchNoPermitInspectionDocuments(inspectionId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, name, file_path, file_size, mime_type, created_at")
    .eq("owner_kind", "inspection")
    .eq("owner_id", inspectionId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("⚠️ Failed to load no-permit inspection documents:", error);
    return [];
  }

  return ((data || []) as any[])
    .filter((row) => row.file_path)
    .map((row) => ({
      id: String(row.id),
      name: String(row.name || "Document"),
      path: String(row.file_path),
      size: Number(row.file_size || 0),
      type: String(row.mime_type || "application/octet-stream"),
      uploadedAt: String(row.created_at || new Date().toISOString()),
    }));
}

function YesNoSelect({
  value,
  onChange,
}: {
  value?: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div className="flex gap-2">
      <Button type="button" size="sm" variant={value === true ? "default" : "outline"} onClick={() => onChange(true)}>
        Yes
      </Button>
      <Button type="button" size="sm" variant={value === false ? "default" : "outline"} onClick={() => onChange(false)}>
        No
      </Button>
      <Button type="button" size="sm" variant={value === null || value === undefined ? "default" : "outline"} onClick={() => onChange(null)}>
        N/A
      </Button>
    </div>
  );
}

export default function PermitInspectionUnifiedPage() {
  const params = useParams();
  const router = useRouter();
  const { user, userProfile, loading: authLoading } = useAuth();
  // Allow assessors, inspectors, reviewers, and admins to create/edit inspections
  const effectiveRole =
    (userProfile?.role as any) ||
    ((user?.user_metadata as any)?.role as any) ||
    "";
  const canCreateInspection = ["assessor", "inspector", "reviewer", "admin"].includes(effectiveRole);

  const rawId = params.id as string | undefined;
  const applicationNumber = rawId ? decodeURIComponent(rawId) : undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [inspectionRecord, setInspectionRecord] = useState<Inspection | null>(null);
  const [inspectionData, setInspectionData] = useState<any>(null);
  const [template, setTemplate] = useState<InspectionTemplate>("authorization");
  const [activeTab, setActiveTab] = useState("locked");
  const [canEditForm, setCanEditForm] = useState(false);

  const locked = useMemo(() => {
    if (!inspectionData) return null;
    return inspectionData.prepopulatedData;
  }, [inspectionData]);

  const [form, setForm] = useState<FormState>({
    authorized_concession_boundaries: [{ beacon: "B1", latitude: null, longitude: null }],
    actual_concession_boundaries: [{ beacon: "B1", latitude: null, longitude: null }],
    employment_gender_breakdown: defaultEmployment(),
    ohs_gender_sensitive: defaultOhs(),
    inspection_documents: [],
    locked_field_overrides: {},
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        if (authLoading) return;
        if (!applicationNumber) {
          setError("Missing application number");
          return;
        }

        const data = await fetchInspectionData(applicationNumber);
        if (!data) {
          setError("Permit not found");
          return;
        }

        const tpl = templateFromPermit(data?.application?.intended_activities, data?.permit?.purpose, data?.registryEntry?.regime);
        setTemplate(tpl);

        // Registry permits keep data.source === "permit_registry" and
        // data.registryEntry.id as their owner reference. No stub applications
        // row is created — inspections and documents attach to the registry
        // row via the polymorphic (owner_kind, owner_id) pair.
        setInspectionData(data);

        // Look up the most recent inspection for this subject. Real applications
        // use application_id; legacy permit_registry inspections use the
        // polymorphic (owner_kind, owner_id) pair.
        {
          const lookup = supabase
            .from("inspections")
            .select("*")
            .order("created_at", { ascending: false });

          const scoped = data.source === "manual_unpermitted"
            ? data.manualInspectionId
              ? lookup.eq("id", data.manualInspectionId).eq("owner_kind", "manual_unpermitted")
              : null
            : data.source === "permit_registry"
              ? lookup.eq("owner_kind", "permit_registry").eq("owner_id", data.registryEntry?.id as string)
              : lookup.eq("application_id", data.application.id);

          const { data: latest, error: latestError } = scoped
            ? await scoped.limit(1)
            : { data: null, error: null };

          if (latestError) throw latestError;
          const existing = (latest && latest[0]) as Inspection | undefined;

          // Always bind the latest inspection for this permit and display it.
          // A terminal (approved/rejected) inspection is not assessor-owned, so
          // isAssessorOwnedWorkflow returns false and the form loads read-only —
          // the assessor sees the completed data instead of a blank form, the
          // same way the reviewer page shows it.
          const existingWorkflowStatus = (existing as { workflow_status?: string | null } | undefined)?.workflow_status;

          if (existing) {
            setInspectionId(existing.id);
            const isOwner = existing.inspector_id === user?.id;
            const isAssessorOwned = isAssessorOwnedWorkflow(existingWorkflowStatus);
            setCanEditForm(canCreateInspection && isOwner && isAssessorOwned);
            setInspectionRecord(existing);
            const noPermitDocuments = data.source === "manual_unpermitted"
              ? await fetchNoPermitInspectionDocuments(existing.id)
              : [];

            setForm(prev => ({
              ...prev,
              ...existing,
              activity_type: (existing as any).activity_type ?? data?.prepopulatedData?.activityType ?? prev.activity_type,
              activity_starting_date: (existing as any).activity_starting_date ?? data?.prepopulatedData?.activityStartingDate ?? prev.activity_starting_date,
              // Explicit rehydrate for new project-coordinate columns so that a
              // future narrowing of the select list can never silently drop them.
              project_latitude: (existing as any).project_latitude ?? prev.project_latitude,
              project_longitude: (existing as any).project_longitude ?? prev.project_longitude,
              allowed_quantity: (existing as any).allowed_quantity ?? data?.permit?.water_allowance ?? prev.allowed_quantity,
              allowed_unit: (existing as any).allowed_unit ?? data?.permit?.allowance_unit ?? prev.allowed_unit,
              authorized_abstraction_method:
                (existing as any).authorized_abstraction_method ?? data?.prepopulatedData?.authorizedMethod ?? prev.authorized_abstraction_method,
              authorized_surface_area_ha: (existing as any).authorized_surface_area_ha ?? data?.prepopulatedData?.concessionAreaHa ?? prev.authorized_surface_area_ha,
              authorized_concession_boundaries: normalizeBoundaryRows((existing as any).authorized_concession_boundaries).length > 0
                ? normalizeBoundaryRows((existing as any).authorized_concession_boundaries)
                : data?.prepopulatedData?.concessionBoundaries ?? normalizeBoundaryRows((existing as any).authorized_concession_boundaries),
              actual_concession_boundaries: normalizeBoundaryRows((existing as any).actual_concession_boundaries),
              employment_gender_breakdown: ((existing as any).employment_gender_breakdown as any) || prev.employment_gender_breakdown,
              ohs_gender_sensitive: ((existing as any).ohs_gender_sensitive as any) || prev.ohs_gender_sensitive,
              inspection_documents: noPermitDocuments.length > 0
                ? noPermitDocuments
                : ((existing as any).inspection_documents as any[]) || prev.inspection_documents,
              locked_field_overrides: ((existing as any).locked_field_overrides as Record<string, string>) || prev.locked_field_overrides,
            }));
            setTemplate(tpl);
            return;
          }
        }

        if (data.source === "manual_unpermitted" && data.manualInspectionId) {
          setError("No permit inspection not found.");
          return;
        }

        // New inspection -- prefill from prepopulated data
        setForm(prev => ({
          ...prev,
          inspection_template: tpl as any,
          allowed_quantity: data?.prepopulatedData?.allowedQuantity ?? data?.permit?.water_allowance,
          allowed_unit: data?.prepopulatedData?.allowedUnit ?? data?.permit?.allowance_unit,
          authorized_abstraction_method: data?.prepopulatedData?.authorizedMethod,
          activity_type: data?.prepopulatedData?.activityType,
          activity_starting_date: data?.prepopulatedData?.activityStartingDate,
          authorized_surface_area_ha: data?.prepopulatedData?.concessionAreaHa,
          authorized_concession_boundaries: data?.prepopulatedData?.concessionBoundaries ?? prev.authorized_concession_boundaries,
        }));
        setCanEditForm(canCreateInspection);
      } catch (e: any) {
        console.error("❌ Failed to load unified inspection:", e);
        setError(e?.message || "Failed to load inspection data");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [applicationNumber, canCreateInspection, userProfile?.id, authLoading, router, user?.id]);

  const canEdit = !!userProfile?.id && canEditForm;

  const setField = (key: keyof FormState, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const save = async (mode: "draft" | "submit") => {
    if (!canEdit) {
      alert("You do not have permission to edit this inspection.");
      return;
    }

    const isManualSourceForSave = inspectionData?.source === "manual_unpermitted";
    if (!inspectionData?.application?.id && !isManualSourceForSave) {
      alert("⚠️ Permit data not loaded.");
      return;
    }

    // Ensure we have a valid session; otherwise Supabase requests will run as anon and RLS will block.
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const sessionUserId = sessionData?.session?.user?.id;

    if (sessionError || !sessionUserId) {
      console.error("❌ Session check failed:", sessionError || "No session user");
      alert("⚠️ Your session is missing or expired. Please log in again, then retry.");
      return;
    }

    try {
      setSaving(true);

      // Real applications attach via application_id. Legacy permit_registry
      // inspections leave application_id NULL and attach via the polymorphic
      // (owner_kind, owner_id) pair — no stub `applications` row is created.
      const isManualSource = inspectionData.source === "manual_unpermitted";
      const isRegistrySource = inspectionData.source === "permit_registry";
      const registryOwnerId = isRegistrySource
        ? (inspectionData.registryEntry?.id as string | undefined)
        : undefined;

      if (isRegistrySource && !registryOwnerId) {
        throw new Error("Registry permit is missing an internal id; cannot save inspection.");
      }

      const applicationId = isRegistrySource || isManualSource ? null : inspectionData.application.id;

      const nowIso = new Date().toISOString();
      const base = {
        application_id: applicationId,
        owner_kind: isManualSource ? "manual_unpermitted" : isRegistrySource ? "permit_registry" : null,
        owner_id: isRegistrySource ? registryOwnerId : null,
        // CRITICAL: use the session user id (same as auth.uid() in Postgres RLS)
        inspector_id: sessionUserId,
        type: "annual",
        inspection_template: template,
        status: mode === "submit" ? "completed" : "in_progress",
        workflow_status:
          mode === "submit"
            ? "pending_review"
            : (() => {
                const current = (inspectionRecord?.workflow_status as string) || "draft";
                return current === "pending_assessment" || current === "returned_to_assessment"
                  ? current
                  : "draft";
              })(),
        scheduled_date: nowIso,
        completed_date: mode === "submit" ? nowIso : null,
        review_status: mode === "submit" ? "pending" : null,
        review_notes: null,
        reviewed_by: null,
        reviewed_at: null,

        // Catchment: prefer the inspector's override (catchment dropdowns) over the
        // permit's locked value so an override wins even when a value already exists.
        catchment_level1: form.locked_field_overrides?.catchmentLevel1 ?? locked?.catchmentLevel1 ?? null,
        catchment_level2: form.locked_field_overrides?.catchmentLevel2 ?? locked?.catchmentLevel2 ?? null,
      };

      const payload: any = {
        ...base,
        // Shared
        activity_type: locked?.activityType ?? form.activity_type ?? null,
        activity_starting_date: locked?.activityStartingDate ?? form.activity_starting_date ?? null,

        wastewater_system_type: form.wastewater_system_type ?? null,
        wastewater_system_effectiveness: form.wastewater_system_effectiveness ?? null,

        fees_payment_amount: form.fees_payment_amount ?? null,
        fees_payment_details: form.fees_payment_details ?? null,
        fees_payment_proof: null,

        reports_submission_date: form.reports_submission_date ?? null,
        reports_reference_number: form.reports_reference_number ?? null,
        reports_proof: form.reports_proof ?? null,

        water_use_conflicts: form.water_use_conflicts ?? null,
        catchment_protection_initiatives: form.catchment_protection_initiatives ?? null,
        general_conclusion: form.general_conclusion ?? null,
        recommendations: form.recommendations ?? null,
        recommendation_details: form.recommendation_details ?? null,

        manual_inspection_subject: form.manual_inspection_subject ?? null,
        manual_inspection_reason: form.manual_inspection_reason ?? null,
        manual_contact_name: form.manual_contact_name ?? null,
        manual_contact_phone: form.manual_contact_phone ?? null,
        manual_site_notes: form.manual_site_notes ?? null,

        // Project (activity site) coordinates — Section 2.1
        project_latitude: form.project_latitude ?? null,
        project_longitude: form.project_longitude ?? null,

        // Social/OHS
        employment_gender_breakdown: form.employment_gender_breakdown ?? null,
        ohs_gender_sensitive: form.ohs_gender_sensitive ?? null,

        // Documents
        inspection_documents: form.inspection_documents ?? null,

        // Inspector-provided overrides for locked fields that were N/A.
        // For registry inspections, always persist the permit number so the
        // inspection can be re-linked if the registry is replaced (TRUNCATE+INSERT).
        locked_field_overrides: isRegistrySource
          ? {
              ...(form.locked_field_overrides ?? {}),
              permitNumber: (inspectionData.registryEntry as any)?.permit_number
                ?? (inspectionData as any).prepopulatedData?.permitNumber
                ?? (form.locked_field_overrides as any)?.permitNumber
                ?? "",
            }
          : (form.locked_field_overrides ?? null),
      };

      if (template === "authorization") {
        Object.assign(payload, {
          allowed_quantity: form.allowed_quantity ?? locked?.allowedQuantity ?? null,
          allowed_unit: capUnitForVarchar20(form.allowed_unit ?? locked?.allowedUnit ?? null),
          authorized_abstraction_method: form.authorized_abstraction_method ?? locked?.authorizedMethod ?? null,
          actual_quantity: form.actual_quantity ?? null,
          actual_unit: capUnitForVarchar20(form.actual_unit ?? null),
          actual_abstraction_method: form.actual_abstraction_method ?? null,
          measurement_device_type: form.measurement_device_type ?? null,
        });
      } else {
        Object.assign(payload, {
          authorized_surface_area_ha: locked?.concessionAreaHa ?? form.authorized_surface_area_ha ?? null,
          actual_surface_area_ha: form.actual_surface_area_ha ?? null,
          authorized_concession_boundaries: locked?.concessionBoundaries ?? form.authorized_concession_boundaries ?? null,
          actual_concession_boundaries: form.actual_concession_boundaries ?? null,
        });
      }

      assertInspectionPayloadKeys(payload);

      if (inspectionId) {
        const { data, error: upErr } = await runInspectionSaveWithSafetyNet<{ id: string }>(
          (p) => supabase.from("inspections").update(p).eq("id", inspectionId).select("id").single(),
          payload,
        );
        if (upErr) throw upErr;
        setInspectionRecord((prev) => ({
          ...(prev || ({} as Inspection)),
          ...(payload as Partial<Inspection>),
          id: data!.id,
        }));
        if (mode === "submit") {
          setCanEditForm(false);
          fetch('/api/notifications/staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventType: 'inspection_forwarded_to_review',
              entityType: 'inspection',
              entityId: inspectionId,
            }),
          }).then(r => r.json()).then(j => console.log('[NOTIFY] staff result:', j)).catch(e => console.error('[NOTIFY] staff error:', e))
          alert("✅ Inspection submitted. You can now use workflow actions below.");
        } else {
          alert("✅ Draft saved");
        }
      } else {
        const { data, error: insErr } = await runInspectionSaveWithSafetyNet<{ id: string }>(
          (p) => supabase.from("inspections").insert(p).select("id").single(),
          payload,
        );
        if (insErr) throw insErr;
        setInspectionId(data!.id);
        setInspectionRecord({
          ...(payload as Partial<Inspection>),
          id: data!.id,
        } as Inspection);
        if (isManualSource) {
          router.replace(`/assessment/inspection/permit/manual-${data!.id}`);
        }
        if (mode === "submit") {
          setCanEditForm(false);
          fetch('/api/notifications/staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventType: 'inspection_forwarded_to_review',
              entityType: 'inspection',
              entityId: data!.id,
            }),
          }).then(r => r.json()).then(j => console.log('[NOTIFY] staff result (insert):', j)).catch(e => console.error('[NOTIFY] staff error (insert):', e))
          alert("✅ Inspection submitted. You can now use workflow actions below.");
        } else {
          alert("✅ Draft created");
        }
      }
    } catch (e: any) {
      console.error("❌ Failed to save inspection:", e);
      alert(e?.message || "Failed to save inspection");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto py-8">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-[#0072bc]" />
            <span>Loading inspection…</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  const currentWorkflowStatus: InspectionWorkflowStatus =
    ((inspectionRecord?.workflow_status as InspectionWorkflowStatus | undefined) || "draft");
  const currentInspectionStatus = inspectionRecord?.status || (inspectionId ? "in_progress" : "scheduled");

  const handleWorkflowStatusChange = (newStatus: InspectionWorkflowStatus) => {
    setInspectionRecord((prev) =>
      prev
        ? ({
            ...prev,
            workflow_status: newStatus,
          } as Inspection)
        : prev
    );
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-8 space-y-6">
        <SmartBackButton
          fallbackHref={staffListHref("assessment", "inspections")}
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
        />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {inspectionData?.source === "manual_unpermitted" ? "No Permit Inspection" : "Permit inspection"}
          </h1>
          <p className="text-muted-foreground">
            {inspectionData?.source === "manual_unpermitted" ? (
              <>No water permit linked</>
            ) : (
              <>Permit: <span className="font-medium">{inspectionData?.permit?.permit_number || inspectionData?.prepopulatedData?.permitNumber || "N/A"}</span></>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">Template: {template}</Badge>
            {inspectionId ? <Badge variant="secondary">Draft/Record: {inspectionId.slice(0, 8)}…</Badge> : <Badge variant="secondary">New</Badge>}
            <InspectionOwnerBadge inspectorId={inspectionRecord?.inspector_id} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(() => {
            const isManual = inspectionData?.source === "manual_unpermitted";
            const isRegistryOnly = inspectionData?.source === "permit_registry";
            const hasRealApplication = !!inspectionData?.application?.id && !isRegistryOnly;
            if (hasRealApplication && !isManual) {
              return (
                <Link href={`/dashboard/application/${inspectionData.application.id}`}>
                  <Button variant="outline" className="gap-2">
                    <Eye className="h-4 w-4" />
                    View application
                  </Button>
                </Link>
              );
            }
            return (
              <Button
                variant="outline"
                className="gap-2"
                disabled
                title={isManual ? "No application linked — no-permit inspection" : "No application linked — registry-only permit"}
              >
                <Eye className="h-4 w-4" />
                View application
              </Button>
            );
          })()}

          <DownloadInspectionButton
            inspectionId={inspectionId}
            workflowStatus={currentWorkflowStatus}
          />

          {canEdit ? (
            <>
              <Button disabled={saving} variant="outline" className="gap-2" onClick={() => save("draft")}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save draft
              </Button>
              <Button disabled={saving} className="gap-2" onClick={() => save("submit")}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {inspectionId && inspectionRecord ? (
        <InspectionWorkflowActions
          inspectionId={inspectionId}
          workflowStatus={currentWorkflowStatus}
          inspectionStatus={currentInspectionStatus}
          inspection={inspectionRecord as unknown as Record<string, unknown>}
          roleContext="assessor"
          onStatusChange={handleWorkflowStatusChange}
        />
      ) : null}

      <div className="mt-6">
        <InspectionFormLayout
          template={template}
          locked={{
            permitHolderName: locked?.permitHolderName,
            permitHolderId: locked?.permitHolderId,
            residence: locked?.residence,
            permitNumber: locked?.permitNumber,
            issuanceDate: locked?.issuanceDate,
            expirationDate: locked?.expirationDate,
            permitLocationProvince: locked?.province,
            permitLocationDistrict: locked?.district,
            permitLocationSector: locked?.sector,
            permitLocationCell: locked?.cell,
            permitLocationVillage: locked?.village,
            waterSourceType: locked?.waterSourceType,
            waterPurpose: locked?.waterPurpose,
            waterSourceName: locked?.waterSourceName,
            waterSourceLocation: locked?.waterSourceLocation,
            waterSourceLatitude: locked?.waterSourceLatitude,
            waterSourceLongitude: locked?.waterSourceLongitude,
            waterAllowance: locked?.allowedQuantity,
            allowanceUnit: locked?.allowedUnit,
            abstractionMethod: locked?.authorizedMethod,
            flowRate: locked?.flowRate,
            activityType: locked?.activityType,
            activityStartingDate: locked?.activityStartingDate,
            catchmentLevel1: locked?.catchmentLevel1,
            catchmentLevel2: locked?.catchmentLevel2,
            concessionAreaHa: locked?.concessionAreaHa,
            concessionBoundaries: locked?.concessionBoundaries,
          }}
          form={form as any}
          canEdit={canEdit}
          applicationId={inspectionData?.source === "manual_unpermitted" ? (inspectionId || "manual-unpermitted") : inspectionData?.application?.id}
          documentOwner={
            inspectionData?.source === "manual_unpermitted" && inspectionId
              ? { kind: "inspection", id: inspectionId }
              : inspectionData?.source === "permit_registry" && inspectionData?.registryEntry?.id
              ? { kind: "permit_registry", id: inspectionData.registryEntry.id as string }
              : undefined
          }
          manualInspection={inspectionData?.source === "manual_unpermitted"}
          setField={(k, v) => setField(k as any, v as any)}
        />
      </div>
      </div>
    </DashboardLayout>
  );
}
