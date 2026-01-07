"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { fetchInspectionData } from "@/lib/inspection-utils";

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

type InspectionTemplate = "authorization" | "concession";

type BoundaryRow = { beacon: string; latitude?: number | null; longitude?: number | null };
type EmploymentRow = { male?: number | null; female?: number | null; total?: number | null };

type EmploymentBreakdown = {
  permanentEmployees?: EmploymentRow;
  temporarySeasonalWorkers?: EmploymentRow;
  technicalSkilledStaff?: EmploymentRow;
  unskilledSupportStaff?: EmploymentRow;
  totalWorkforce?: EmploymentRow;
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
  fees_payment_proof?: string;

  reports_submission_date?: string;
  reports_reference_number?: string;
  reports_proof?: string;

  water_use_conflicts?: string;
  catchment_protection_initiatives?: string;
  general_conclusion?: string;
  recommendations?: string;

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
}

function toNumberOrUndefined(v: string): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function templateFromPermit(purpose?: string): InspectionTemplate {
  const p = (purpose || "").toLowerCase();
  // Concession aligns with fish farming / aquaculture use cases
  if (p.includes("fish") || p.includes("aquaculture")) return "concession";
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
    permanentEmployees: { male: null, female: null, total: null },
    temporarySeasonalWorkers: { male: null, female: null, total: null },
    technicalSkilledStaff: { male: null, female: null, total: null },
    unskilledSupportStaff: { male: null, female: null, total: null },
    totalWorkforce: { male: null, female: null, total: null },
  };
}

function defaultOhs(): OhsGenderSensitive {
  return {
    genderInclusiveSafetyMeasures: { value: null, remarks: "" },
    separateSanitationFacilities: { value: null, remarks: "" },
    genderResponsiveGrievanceMechanism: { value: null, remarks: "" },
  };
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
  const { userProfile, loading: authLoading } = useAuth();
  const isAssessor = userProfile?.role === "assessor";

  const applicationNumber = params.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [inspectionData, setInspectionData] = useState<any>(null);
  const [template, setTemplate] = useState<InspectionTemplate>("authorization");
  const [activeTab, setActiveTab] = useState("locked");

  const locked = useMemo(() => {
    if (!inspectionData) return null;
    return inspectionData.prepopulatedData;
  }, [inspectionData]);

  const [form, setForm] = useState<FormState>({
    authorized_concession_boundaries: [{ beacon: "B1", latitude: null, longitude: null }],
    actual_concession_boundaries: [{ beacon: "B1", latitude: null, longitude: null }],
    employment_gender_breakdown: defaultEmployment(),
    ohs_gender_sensitive: defaultOhs(),
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
          setError("Application not found");
          return;
        }

        setInspectionData(data);
        const tpl = templateFromPermit(data?.permit?.purpose);
        setTemplate(tpl);

        // Find latest inspection for this application
        const { data: latest, error: latestError } = await supabase
          .from("inspections")
          .select("*")
          .eq("application_id", data.application.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (latestError) throw latestError;
        const existing = (latest && latest[0]) as Inspection | undefined;

        if (existing) {
          setInspectionId(existing.id);

          // Non-assessors can view submitted inspections, but should not edit
          if (!isAssessor) {
            router.replace(`/inspection/${existing.id}`);
            return;
          }

          // Assessors can only edit their own draft/in-progress
          const isDraft = existing.status === "scheduled" || existing.status === "in_progress";
          const isOwner = existing.inspector_id === userProfile?.id;
          if (!isOwner || !isDraft) {
            router.replace(`/inspection/${existing.id}`);
            return;
          }

          // Load existing values into form
          setForm(prev => ({
            ...prev,
            ...existing,
            authorized_concession_boundaries: normalizeBoundaryRows((existing as any).authorized_concession_boundaries),
            actual_concession_boundaries: normalizeBoundaryRows((existing as any).actual_concession_boundaries),
            employment_gender_breakdown: ((existing as any).employment_gender_breakdown as any) || prev.employment_gender_breakdown,
            ohs_gender_sensitive: ((existing as any).ohs_gender_sensitive as any) || prev.ohs_gender_sensitive,
          }));
          setTemplate(((existing as any).inspection_template as InspectionTemplate) || tpl);
        } else {
          // No existing inspection: only assessors can start
          if (!isAssessor) {
            setError("No inspection exists yet for this permit.");
            return;
          }

          // Prefill allowed quantities from permit for authorization template
          setForm(prev => ({
            ...prev,
            inspection_template: tpl as any,
            allowed_quantity: data?.permit?.water_allowance,
            allowed_unit: data?.permit?.allowance_unit,
            authorized_abstraction_method: data?.prepopulatedData?.authorizedMethod,
            activity_type: data?.prepopulatedData?.activityType,
            activity_starting_date: data?.prepopulatedData?.activityStartingDate,
          }));
        }
      } catch (e: any) {
        console.error("❌ Failed to load unified inspection:", e);
        setError(e?.message || "Failed to load inspection data");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [applicationNumber, isAssessor, userProfile?.id, authLoading, router]);

  const canEdit = isAssessor && !!userProfile?.id;

  const setField = (key: keyof FormState, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const save = async (mode: "draft" | "submit") => {
    if (!inspectionData?.application?.id) return;
    if (!isAssessor) {
      alert("You are not allowed to save inspections.");
      return;
    }
    if (!userProfile?.id) {
      alert("Missing user profile.");
      return;
    }

    try {
      setSaving(true);

      const nowIso = new Date().toISOString();
      const base = {
        application_id: inspectionData.application.id,
        inspector_id: userProfile.id,
        type: "annual",
        inspection_template: template,
        status: mode === "submit" ? "completed" : "in_progress",
        scheduled_date: nowIso,
        completed_date: mode === "submit" ? nowIso : null,

        // Locked fields (stored but not editable)
        operator_name: locked?.operatorName ?? null,
        operator_id_tin: locked?.operatorIdTin ?? null,
        operator_residence: locked?.operatorResidence ?? null,
        catchment_level1: locked?.catchmentLevel1 ?? null,
        catchment_level2: locked?.catchmentLevel2 ?? null,
      };

      const payload: any = {
        ...base,
        // Shared
        activity_type: form.activity_type ?? null,
        activity_starting_date: form.activity_starting_date ?? null,

        wastewater_system_type: form.wastewater_system_type ?? null,
        wastewater_system_effectiveness: form.wastewater_system_effectiveness ?? null,

        fees_payment_amount: form.fees_payment_amount ?? null,
        fees_payment_proof: form.fees_payment_proof ?? null,

        reports_submission_date: form.reports_submission_date ?? null,
        reports_reference_number: form.reports_reference_number ?? null,
        reports_proof: form.reports_proof ?? null,

        water_use_conflicts: form.water_use_conflicts ?? null,
        catchment_protection_initiatives: form.catchment_protection_initiatives ?? null,
        general_conclusion: form.general_conclusion ?? null,
        recommendations: form.recommendations ?? null,

        // Social/OHS
        employment_gender_breakdown: form.employment_gender_breakdown ?? null,
        ohs_gender_sensitive: form.ohs_gender_sensitive ?? null,
      };

      if (template === "authorization") {
        Object.assign(payload, {
          allowed_quantity: form.allowed_quantity ?? null,
          allowed_unit: form.allowed_unit ?? null,
          authorized_abstraction_method: form.authorized_abstraction_method ?? null,
          actual_quantity: form.actual_quantity ?? null,
          actual_unit: form.actual_unit ?? null,
          actual_abstraction_method: form.actual_abstraction_method ?? null,
          measurement_device_type: form.measurement_device_type ?? null,
        });
      } else {
        Object.assign(payload, {
          authorized_surface_area_ha: form.authorized_surface_area_ha ?? null,
          actual_surface_area_ha: form.actual_surface_area_ha ?? null,
          authorized_concession_boundaries: form.authorized_concession_boundaries ?? null,
          actual_concession_boundaries: form.actual_concession_boundaries ?? null,
        });
      }

      if (inspectionId) {
        const { data, error: upErr } = await supabase.from("inspections").update(payload).eq("id", inspectionId).select("id").single();
        if (upErr) throw upErr;
        if (mode === "submit") router.push(`/inspection/${data.id}`);
        else alert("✅ Draft saved");
      } else {
        const { data, error: insErr } = await supabase.from("inspections").insert(payload).select("id").single();
        if (insErr) throw insErr;
        setInspectionId(data.id);
        if (mode === "submit") router.push(`/inspection/${data.id}`);
        else alert("✅ Draft created");
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
      <div className="container mx-auto py-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading inspection…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Permit inspection</h1>
          <p className="text-muted-foreground">
            Application: <span className="font-medium">{inspectionData?.application?.application_number}</span>
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline">Template: {template}</Badge>
            {inspectionId ? <Badge variant="secondary">Draft/Record: {inspectionId.slice(0, 8)}…</Badge> : <Badge variant="secondary">New</Badge>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {inspectionData?.application?.id ? (
            <Link href={`/dashboard/application/${inspectionData.application.id}`}>
              <Button variant="outline" className="gap-2">
                <Eye className="h-4 w-4" />
                View application
              </Button>
            </Link>
          ) : null}

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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="locked">Locked info</TabsTrigger>
          <TabsTrigger value="permit">Permit specifics</TabsTrigger>
          <TabsTrigger value="social">Social & OHS</TabsTrigger>
          <TabsTrigger value="notes">Findings</TabsTrigger>
        </TabsList>

        <TabsContent value="locked" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Auto-filled (locked)</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Permit holder name</Label>
                <Input disabled value={locked?.permitHolderName || "N/A"} />
              </div>
              <div>
                <Label>ID/TIN</Label>
                <Input disabled value={locked?.permitHolderId || "N/A"} />
              </div>
              <div>
                <Label>Residence</Label>
                <Input disabled value={locked?.residence || "N/A"} />
              </div>
              <div>
                <Label>Contacts</Label>
                <Input disabled value={locked?.contacts || "N/A"} />
              </div>
              <div>
                <Label>Operator name</Label>
                <Input disabled value={locked?.operatorName || "N/A"} />
              </div>
              <div>
                <Label>Operator ID/TIN</Label>
                <Input disabled value={locked?.operatorIdTin || "N/A"} />
              </div>
              <div>
                <Label>Operator residence</Label>
                <Input disabled value={locked?.operatorResidence || "N/A"} />
              </div>
              <div>
                <Label>Coordinates</Label>
                <Input disabled value={locked?.coordinates || "N/A"} />
              </div>
              <div>
                <Label>Catchment Level I</Label>
                <Input disabled value={locked?.catchmentLevel1 || "N/A"} />
              </div>
              <div>
                <Label>Catchment Level II</Label>
                <Input disabled value={locked?.catchmentLevel2 || "N/A"} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permit" className="mt-6 space-y-4">
          {template === "authorization" ? (
            <Card>
              <CardHeader>
                <CardTitle>Authorization (Abstraction)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Allowed quantity</Label>
                    <Input
                      disabled={!canEdit}
                      value={form.allowed_quantity ?? ""}
                      onChange={e => setField("allowed_quantity", toNumberOrUndefined(e.target.value))}
                      placeholder="e.g. 120"
                    />
                  </div>
                  <div>
                    <Label>Allowed unit</Label>
                    <Input disabled={!canEdit} value={form.allowed_unit ?? ""} onChange={e => setField("allowed_unit", e.target.value)} placeholder="m³/day, m³/year" />
                  </div>
                  <div>
                    <Label>Authorized method</Label>
                    <Input
                      disabled={!canEdit}
                      value={form.authorized_abstraction_method ?? ""}
                      onChange={e => setField("authorized_abstraction_method", e.target.value)}
                      placeholder="Pump, gravity, ..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Actual quantity</Label>
                    <Input
                      disabled={!canEdit}
                      value={form.actual_quantity ?? ""}
                      onChange={e => setField("actual_quantity", toNumberOrUndefined(e.target.value))}
                      placeholder="Observed quantity"
                    />
                  </div>
                  <div>
                    <Label>Actual unit</Label>
                    <Input disabled={!canEdit} value={form.actual_unit ?? ""} onChange={e => setField("actual_unit", e.target.value)} placeholder="m³/day" />
                  </div>
                  <div>
                    <Label>Actual method</Label>
                    <Input disabled={!canEdit} value={form.actual_abstraction_method ?? ""} onChange={e => setField("actual_abstraction_method", e.target.value)} placeholder="Observed method" />
                  </div>
                </div>

                <div>
                  <Label>Measurement device type (pictures handled separately)</Label>
                  <Input disabled={!canEdit} value={form.measurement_device_type ?? ""} onChange={e => setField("measurement_device_type", e.target.value)} placeholder="Flow meter, weir, ..." />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Concession</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Authorized surface area (Ha)</Label>
                    <Input
                      disabled={!canEdit}
                      value={form.authorized_surface_area_ha ?? ""}
                      onChange={e => setField("authorized_surface_area_ha", toNumberOrUndefined(e.target.value))}
                      placeholder="Ha"
                    />
                  </div>
                  <div>
                    <Label>Actual surface area (Ha)</Label>
                    <Input disabled={!canEdit} value={form.actual_surface_area_ha ?? ""} onChange={e => setField("actual_surface_area_ha", toNumberOrUndefined(e.target.value))} placeholder="Ha" />
                  </div>
                </div>

                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle className="text-base">Authorized boundaries</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(form.authorized_concession_boundaries || []).map((row, idx) => (
                      <div key={`ab-${idx}`} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label>Beacon</Label>
                          <Input
                            disabled={!canEdit}
                            value={row.beacon}
                            onChange={e => {
                              const next = [...(form.authorized_concession_boundaries || [])];
                              next[idx] = { ...next[idx], beacon: e.target.value };
                              setField("authorized_concession_boundaries", next);
                            }}
                          />
                        </div>
                        <div>
                          <Label>Latitude</Label>
                          <Input
                            disabled={!canEdit}
                            value={row.latitude ?? ""}
                            onChange={e => {
                              const next = [...(form.authorized_concession_boundaries || [])];
                              next[idx] = { ...next[idx], latitude: e.target.value === "" ? null : Number(e.target.value) };
                              setField("authorized_concession_boundaries", next);
                            }}
                          />
                        </div>
                        <div>
                          <Label>Longitude</Label>
                          <Input
                            disabled={!canEdit}
                            value={row.longitude ?? ""}
                            onChange={e => {
                              const next = [...(form.authorized_concession_boundaries || [])];
                              next[idx] = { ...next[idx], longitude: e.target.value === "" ? null : Number(e.target.value) };
                              setField("authorized_concession_boundaries", next);
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setField("authorized_concession_boundaries", [...(form.authorized_concession_boundaries || []), { beacon: `B${(form.authorized_concession_boundaries || []).length + 1}`, latitude: null, longitude: null }])
                        }
                      >
                        Add boundary row
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle className="text-base">Actual boundaries</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(form.actual_concession_boundaries || []).map((row, idx) => (
                      <div key={`ac-${idx}`} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label>Beacon</Label>
                          <Input
                            disabled={!canEdit}
                            value={row.beacon}
                            onChange={e => {
                              const next = [...(form.actual_concession_boundaries || [])];
                              next[idx] = { ...next[idx], beacon: e.target.value };
                              setField("actual_concession_boundaries", next);
                            }}
                          />
                        </div>
                        <div>
                          <Label>Latitude</Label>
                          <Input
                            disabled={!canEdit}
                            value={row.latitude ?? ""}
                            onChange={e => {
                              const next = [...(form.actual_concession_boundaries || [])];
                              next[idx] = { ...next[idx], latitude: e.target.value === "" ? null : Number(e.target.value) };
                              setField("actual_concession_boundaries", next);
                            }}
                          />
                        </div>
                        <div>
                          <Label>Longitude</Label>
                          <Input
                            disabled={!canEdit}
                            value={row.longitude ?? ""}
                            onChange={e => {
                              const next = [...(form.actual_concession_boundaries || [])];
                              next[idx] = { ...next[idx], longitude: e.target.value === "" ? null : Number(e.target.value) };
                              setField("actual_concession_boundaries", next);
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setField("actual_concession_boundaries", [...(form.actual_concession_boundaries || []), { beacon: `B${(form.actual_concession_boundaries || []).length + 1}`, latitude: null, longitude: null }])
                        }
                      >
                        Add boundary row
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="social" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Employment (gender-disaggregated)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(
                [
                  ["permanentEmployees", "Permanent Employees"],
                  ["temporarySeasonalWorkers", "Temporary / Seasonal Workers"],
                  ["technicalSkilledStaff", "Technical / Skilled Staff"],
                  ["unskilledSupportStaff", "Unskilled / Support Staff"],
                  ["totalWorkforce", "Total Workforce"],
                ] as const
              ).map(([key, label]) => {
                const row = form.employment_gender_breakdown?.[key] || {};
                return (
                  <div key={key} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-1">
                      <Label>{label}</Label>
                    </div>
                    <div>
                      <Input
                        disabled={!canEdit}
                        placeholder="Male"
                        value={row.male ?? ""}
                        onChange={e => {
                          const next = { ...(form.employment_gender_breakdown || defaultEmployment()) };
                          (next as any)[key] = { ...(next as any)[key], male: e.target.value === "" ? null : Number(e.target.value) };
                          setField("employment_gender_breakdown", next);
                        }}
                      />
                    </div>
                    <div>
                      <Input
                        disabled={!canEdit}
                        placeholder="Female"
                        value={row.female ?? ""}
                        onChange={e => {
                          const next = { ...(form.employment_gender_breakdown || defaultEmployment()) };
                          (next as any)[key] = { ...(next as any)[key], female: e.target.value === "" ? null : Number(e.target.value) };
                          setField("employment_gender_breakdown", next);
                        }}
                      />
                    </div>
                    <div>
                      <Input
                        disabled={!canEdit}
                        placeholder="Total"
                        value={row.total ?? ""}
                        onChange={e => {
                          const next = { ...(form.employment_gender_breakdown || defaultEmployment()) };
                          (next as any)[key] = { ...(next as any)[key], total: e.target.value === "" ? null : Number(e.target.value) };
                          setField("employment_gender_breakdown", next);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Occupational Health & Safety (gender-sensitive)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {(
                [
                  ["genderInclusiveSafetyMeasures", "Gender-inclusive safety measures are in place"],
                  ["separateSanitationFacilities", "Separate sanitation facilities"],
                  ["genderResponsiveGrievanceMechanism", "Gender-responsive grievance mechanism"],
                ] as const
              ).map(([key, label]) => {
                const item = form.ohs_gender_sensitive?.[key] || {};
                return (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      <YesNoSelect
                        value={item.value}
                        onChange={v => {
                          const next = { ...(form.ohs_gender_sensitive || defaultOhs()) };
                          (next as any)[key] = { ...(next as any)[key], value: v };
                          setField("ohs_gender_sensitive", next);
                        }}
                      />
                      <Input
                        disabled={!canEdit}
                        placeholder="Remarks"
                        value={item.remarks ?? ""}
                        onChange={e => {
                          const next = { ...(form.ohs_gender_sensitive || defaultOhs()) };
                          (next as any)[key] = { ...(next as any)[key], remarks: e.target.value };
                          setField("ohs_gender_sensitive", next);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Findings & recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Activity type</Label>
                <Input disabled={!canEdit} value={form.activity_type ?? ""} onChange={e => setField("activity_type", e.target.value)} />
              </div>
              <div>
                <Label>Wastewater system type</Label>
                <Input disabled={!canEdit} value={form.wastewater_system_type ?? ""} onChange={e => setField("wastewater_system_type", e.target.value)} />
              </div>
              <div>
                <Label>Water use conflicts</Label>
                <Textarea disabled={!canEdit} value={form.water_use_conflicts ?? ""} onChange={e => setField("water_use_conflicts", e.target.value)} />
              </div>
              <div>
                <Label>Environmental / catchment protection initiatives</Label>
                <Textarea
                  disabled={!canEdit}
                  value={form.catchment_protection_initiatives ?? ""}
                  onChange={e => setField("catchment_protection_initiatives", e.target.value)}
                />
              </div>
              <div>
                <Label>General conclusion</Label>
                <Textarea disabled={!canEdit} value={form.general_conclusion ?? ""} onChange={e => setField("general_conclusion", e.target.value)} />
              </div>
              <div>
                <Label>Recommendations</Label>
                <Textarea disabled={!canEdit} value={form.recommendations ?? ""} onChange={e => setField("recommendations", e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


