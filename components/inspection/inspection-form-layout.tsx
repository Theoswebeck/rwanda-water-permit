"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { InspectionDocumentsUpload, type InspectionDocumentFile } from "@/components/inspection/inspection-documents-upload";
import {
  INSPECTION_RECOMMENDATION_OPTIONS,
  normalizeInspectionRecommendation,
} from "@/lib/inspection-recommendations";

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

export interface InspectionLockedData {
  permitHolderName?: string;
  permitHolderId?: string;
  residence?: string;

  permitNumber?: string;
  facilityProjectName?: string;
  issuanceDate?: string;
  expirationDate?: string;

  operatorName?: string;
  operatorIdTin?: string;
  operatorResidence?: string;

  permitLocationProvince?: string;
  permitLocationDistrict?: string;
  permitLocationSector?: string;
  permitLocationCell?: string;
  permitLocationVillage?: string;
  waterSourceType?: string;
  waterPurpose?: string;
  waterSourceName?: string;
  waterSourceLocation?: string;
  waterSourceLatitude?: string;
  waterSourceLongitude?: string;
  waterAllowance?: number;
  allowanceUnit?: string;
  abstractionMethod?: string;
  flowRate?: number;
  activityType?: string;
  activityStartingDate?: string;
  catchmentLevel1?: string;
  catchmentLevel2?: string;
}

export interface InspectionFormState {
  activity_type?: string;
  activity_starting_date?: string;

  allowed_quantity?: number;
  allowed_unit?: string;
  authorized_abstraction_method?: string;

  actual_quantity?: number;
  actual_unit?: string;
  actual_abstraction_method?: string;
  measurement_device_type?: string;

  wastewater_system_type?: string;
  wastewater_system_effectiveness?: string;

  authorized_surface_area_ha?: number;
  actual_surface_area_ha?: number;
  authorized_concession_boundaries?: BoundaryRow[];
  actual_concession_boundaries?: BoundaryRow[];

  employment_gender_breakdown?: EmploymentBreakdown;
  ohs_gender_sensitive?: OhsGenderSensitive;

  fees_payment_amount?: number;
  fees_payment_proof?: string;

  reports_submission_date?: string;
  reports_reference_number?: string;
  reports_proof?: string;

  water_use_conflicts?: string;
  catchment_protection_initiatives?: string;
  general_conclusion?: string;
  recommendations?: string;

  // Documents
  inspection_documents?: InspectionDocumentFile[];
}

function toNumberOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toFiniteNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function computeEmploymentTotal(male: unknown, female: unknown): number | null {
  const m = toFiniteNumberOrNull(male);
  const f = toFiniteNumberOrNull(female);
  if (m === null && f === null) return null;
  return (m ?? 0) + (f ?? 0);
}

function SectionShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white/60 dark:bg-slate-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function ReadonlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <Input disabled value={value || "N/A"} className="h-11 bg-muted/30 border-slate-200 dark:border-slate-800" />
    </div>
  );
}

function TextField({
  label,
  value,
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  value?: string | null;
  disabled: boolean;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <Input
        value={value || ""}
        disabled={disabled}
        placeholder={placeholder}
        className="h-11 bg-white/70 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  disabled,
  onChange,
  suffix,
}: {
  label: string;
  value?: number | null;
  disabled: boolean;
  onChange: (v: number | null) => void;
  suffix?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={value ?? ""}
          disabled={disabled}
          className="h-11 bg-white/70 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800"
          onChange={(e) => onChange(toNumberOrNull(e.target.value))}
        />
        {suffix ? <span className="text-sm text-muted-foreground whitespace-nowrap">{suffix}</span> : null}
      </div>
    </div>
  );
}

function YesNoRemarks({
  label,
  value,
  remarks,
  disabled,
  onChange,
}: {
  label: string;
  value?: boolean | null;
  remarks?: string | null;
  disabled: boolean;
  onChange: (next: { value: boolean | null; remarks: string }) => void;
}) {
  const v = value === true ? "yes" : value === false ? "no" : "";
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-white/60 dark:bg-slate-950/10">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="font-medium text-sm">{label}</div>
        <div className="flex items-center gap-4">
          <RadioGroup
            value={v}
            onValueChange={(next) => onChange({ value: next === "yes" ? true : next === "no" ? false : null, remarks: remarks || "" })}
            className="flex items-center gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem disabled={disabled} value="yes" id={`${label}-yes`} />
              <Label htmlFor={`${label}-yes`} className="text-sm">
                Yes
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem disabled={disabled} value="no" id={`${label}-no`} />
              <Label htmlFor={`${label}-no`} className="text-sm">
                No
              </Label>
            </div>
          </RadioGroup>
          <Input
            disabled={disabled}
            value={remarks || ""}
            placeholder="Remarks"
            className="h-10 w-full lg:w-[380px] bg-white/70 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800"
            onChange={(e) => onChange({ value: value ?? null, remarks: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

export function InspectionFormLayout({
  template,
  locked,
  form,
  canEdit,
  applicationId,
  setField,
}: {
  template: InspectionTemplate;
  locked: InspectionLockedData;
  form: InspectionFormState;
  canEdit: boolean;
  applicationId: string;
  setField: <K extends keyof InspectionFormState>(key: K, value: InspectionFormState[K]) => void;
}) {
  const employment = form.employment_gender_breakdown || {};
  const ohs = form.ohs_gender_sensitive || {};

  const authBoundaries = useMemo<BoundaryRow[]>(
    () => (Array.isArray(form.authorized_concession_boundaries) && form.authorized_concession_boundaries.length > 0 ? form.authorized_concession_boundaries : [{ beacon: "B1", latitude: null, longitude: null }]),
    [form.authorized_concession_boundaries]
  );
  const actualBoundaries = useMemo<BoundaryRow[]>(
    () => (Array.isArray(form.actual_concession_boundaries) && form.actual_concession_boundaries.length > 0 ? form.actual_concession_boundaries : [{ beacon: "B1", latitude: null, longitude: null }]),
    [form.actual_concession_boundaries]
  );

  const setBoundary = (key: "authorized_concession_boundaries" | "actual_concession_boundaries", idx: number, patch: Partial<BoundaryRow>) => {
    const current = (key === "authorized_concession_boundaries" ? authBoundaries : actualBoundaries).slice();
    current[idx] = { ...current[idx], ...patch };
    setField(key, current);
  };

  return (
    <Card className="border-gray-200 dark:border-gray-800">
      <CardHeader>
        <CardTitle>Inspection Checklist</CardTitle>
        <CardDescription>
          Fill the inspection form following Rwanda Water Resources Board checklist requirements. Locked values are auto-filled from the permit/application.
        </CardDescription>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline">{template === "authorization" ? "Authorization" : "Concession"}</Badge>
          {!canEdit ? <Badge variant="secondary">Read-only</Badge> : <Badge variant="secondary">Editable</Badge>}
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="identification" className="w-full">
          {/* Sticky tabs so "Documents" is always reachable while scrolling */}
          <div className="sticky top-2 z-20">
            <TabsList className="grid w-full grid-cols-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 border border-slate-200 dark:border-slate-800 shadow-sm">
            <TabsTrigger value="identification">Identification</TabsTrigger>
            <TabsTrigger value="specifics">Permit specifics</TabsTrigger>
            <TabsTrigger value="social">Social & OHS</TabsTrigger>
            <TabsTrigger value="fees">Fees & Reports</TabsTrigger>
            <TabsTrigger value="findings">Findings</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="identification" className="pt-6 space-y-6">
            <SectionShell title="1. Permit Holder Identification">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ReadonlyField label="Name" value={locked.permitHolderName} />
                <ReadonlyField label="ID/TIN" value={locked.permitHolderId} />
                <ReadonlyField label="Residence" value={locked.residence} />
              </div>
            </SectionShell>

            <SectionShell title="2. Permit Particulars">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ReadonlyField label="Number" value={locked.permitNumber} />
                <ReadonlyField label="Name of Facility/Project" value={locked.facilityProjectName} />
                <ReadonlyField label="Issuance date" value={locked.issuanceDate || ""} />
                <ReadonlyField label="Expiration date" value={locked.expirationDate || ""} />
              </div>
            </SectionShell>

            <SectionShell title="2.1 Permit Location">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <ReadonlyField label="Province / City of Kigali" value={locked.permitLocationProvince} />
                <ReadonlyField label="District" value={locked.permitLocationDistrict} />
                <ReadonlyField label="Sector" value={locked.permitLocationSector} />
                <ReadonlyField label="Cell" value={locked.permitLocationCell} />
                <ReadonlyField label="Village" value={locked.permitLocationVillage} />
              </div>
            </SectionShell>

            <SectionShell title="2.2 Water Source & Purpose">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ReadonlyField label="Water Source Type" value={locked.waterSourceType} />
                <ReadonlyField label="Water Source Name" value={locked.waterSourceName} />
                <ReadonlyField label="Water Use / Purpose" value={locked.waterPurpose} />
                <ReadonlyField label="Location" value={locked.waterSourceLocation} />
              </div>
            </SectionShell>

            <SectionShell title="2.3 Abstraction & Volume">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <ReadonlyField label="Water Allowance" value={locked.waterAllowance !== undefined ? String(locked.waterAllowance) : undefined} />
                <ReadonlyField label="Allowance Unit" value={locked.allowanceUnit} />
                <ReadonlyField label="Method of Abstraction" value={locked.abstractionMethod} />
                <ReadonlyField label="Flow Rate (m³/s)" value={locked.flowRate !== undefined ? String(locked.flowRate) : undefined} />
              </div>
            </SectionShell>

            <SectionShell title="2.4 Water Source Coordinates">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ReadonlyField label="Latitude" value={locked.waterSourceLatitude} />
                <ReadonlyField label="Longitude" value={locked.waterSourceLongitude} />
              </div>
            </SectionShell>

            <SectionShell title="3. Operator">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ReadonlyField label="Name" value={locked.operatorName} />
                <ReadonlyField label="ID/TIN" value={locked.operatorIdTin} />
                <ReadonlyField label="Residence" value={locked.operatorResidence} />
              </div>
            </SectionShell>

            <SectionShell title="4. Water source">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ReadonlyField label="Name" value={locked.waterSourceName} />
                <ReadonlyField label="Location" value={locked.waterSourceLocation} />
                <ReadonlyField label="Level I Catchment" value={locked.catchmentLevel1} />
                <ReadonlyField label="Level II Catchment" value={locked.catchmentLevel2} />
              </div>
            </SectionShell>
          </TabsContent>

          <TabsContent value="specifics" className="pt-6 space-y-6">
            {template === "authorization" ? (
              <SectionShell title="5–6. Water abstraction (Authorization)" description="As per the official RWB checklist.">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <ReadonlyField label="Allowed quantity" value={form.allowed_quantity !== undefined && form.allowed_quantity !== null ? String(form.allowed_quantity) : undefined} />
                  <ReadonlyField label="Allowed unit" value={form.allowed_unit ?? ""} />
                  <ReadonlyField label="Authorized abstraction method" value={form.authorized_abstraction_method ?? ""} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <NumberField label="Actual quantity" value={form.actual_quantity ?? null} disabled={!canEdit} onChange={(v) => setField("actual_quantity", (v ?? undefined) as any)} />
                  <div className="space-y-2">
                    <Label className="text-sm">Actual unit</Label>
                    <Select value={form.actual_unit ?? ""} onValueChange={(v) => setField("actual_unit", v as any)} disabled={!canEdit}>
                      <SelectTrigger className="h-11 bg-white/70 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="m³/year">m³/year</SelectItem>
                        <SelectItem value="m³/month">m³/month</SelectItem>
                        <SelectItem value="m³/day">m³/day</SelectItem>
                        <SelectItem value="l/s">l/s</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <TextField label="Actual method" value={form.actual_abstraction_method ?? ""} disabled={!canEdit} onChange={(v) => setField("actual_abstraction_method", v as any)} />
                </div>

                <div className="mt-6">
                  <TextField
                    label="Type of water measurement device in place (Add pictures)"
                    value={form.measurement_device_type ?? ""}
                    disabled={!canEdit}
                    onChange={(v) => setField("measurement_device_type", v as any)}
                  />
                </div>
              </SectionShell>
            ) : (
              <SectionShell title="5–6. Concession (Surface area & boundaries)" description="As per the official RWB concession checklist.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <NumberField label="Authorized surface area" value={form.authorized_surface_area_ha ?? null} disabled={!canEdit} onChange={(v) => setField("authorized_surface_area_ha", (v ?? undefined) as any)} suffix="Ha" />
                  <NumberField label="Actual surface area covered" value={form.actual_surface_area_ha ?? null} disabled={!canEdit} onChange={(v) => setField("actual_surface_area_ha", (v ?? undefined) as any)} suffix="Ha" />
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6">
                  <Card className="border-slate-200 dark:border-slate-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Authorized concession boundaries</CardTitle>
                      <CardDescription>Beacon / Latitude / Longitude</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <div>Beacon</div>
                        <div>Latitude</div>
                        <div>Longitude</div>
                      </div>
                      {authBoundaries.map((r, idx) => (
                        <div key={`ab-${idx}`} className="grid grid-cols-3 gap-3">
                          <Input disabled={!canEdit} className="h-11" value={r.beacon} onChange={(e) => setBoundary("authorized_concession_boundaries", idx, { beacon: e.target.value })} />
                          <Input disabled={!canEdit} className="h-11" value={r.latitude ?? ""} onChange={(e) => setBoundary("authorized_concession_boundaries", idx, { latitude: toNumberOrNull(e.target.value) })} />
                          <Input disabled={!canEdit} className="h-11" value={r.longitude ?? ""} onChange={(e) => setBoundary("authorized_concession_boundaries", idx, { longitude: toNumberOrNull(e.target.value) })} />
                        </div>
                      ))}
                      {canEdit ? (
                        <button
                          type="button"
                          className="text-sm text-primary hover:underline"
                          onClick={() => setField("authorized_concession_boundaries", [...authBoundaries, { beacon: `B${authBoundaries.length + 1}`, latitude: null, longitude: null }] as any)}
                        >
                          + Add others (if any)
                        </button>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 dark:border-slate-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Actual concession boundaries</CardTitle>
                      <CardDescription>Beacon / Latitude / Longitude</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <div>Beacon</div>
                        <div>Latitude</div>
                        <div>Longitude</div>
                      </div>
                      {actualBoundaries.map((r, idx) => (
                        <div key={`ac-${idx}`} className="grid grid-cols-3 gap-3">
                          <Input disabled={!canEdit} className="h-11" value={r.beacon} onChange={(e) => setBoundary("actual_concession_boundaries", idx, { beacon: e.target.value })} />
                          <Input disabled={!canEdit} className="h-11" value={r.latitude ?? ""} onChange={(e) => setBoundary("actual_concession_boundaries", idx, { latitude: toNumberOrNull(e.target.value) })} />
                          <Input disabled={!canEdit} className="h-11" value={r.longitude ?? ""} onChange={(e) => setBoundary("actual_concession_boundaries", idx, { longitude: toNumberOrNull(e.target.value) })} />
                        </div>
                      ))}
                      {canEdit ? (
                        <button
                          type="button"
                          className="text-sm text-primary hover:underline"
                          onClick={() => setField("actual_concession_boundaries", [...actualBoundaries, { beacon: `B${actualBoundaries.length + 1}`, latitude: null, longitude: null }] as any)}
                        >
                          + Add others (if any)
                        </button>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              </SectionShell>
            )}

            <SectionShell title="7. Activity in which water is used">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ReadonlyField label="Type of activity" value={locked.activityType} />
                <ReadonlyField label="Starting date" value={locked.activityStartingDate} />
              </div>
            </SectionShell>

            <SectionShell title="8. Wastewater management system">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <TextField label="Type of the system" value={form.wastewater_system_type ?? ""} disabled={!canEdit} onChange={(v) => setField("wastewater_system_type", v as any)} />
                <TextField label="Effectiveness of the system (Add pictures)" value={form.wastewater_system_effectiveness ?? ""} disabled={!canEdit} onChange={(v) => setField("wastewater_system_effectiveness", v as any)} />
              </div>
            </SectionShell>
          </TabsContent>

          <TabsContent value="social" className="pt-6 space-y-6">
            <SectionShell title="9. Social and Gender-Disaggregated Information">
              <div className="space-y-6">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 font-medium">
                    9.1 Employment Related to Water Use Activity
                  </div>
                  <div className="grid grid-cols-[1fr_120px_120px_120px] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-slate-200 dark:border-slate-800">
                    <div>Category</div>
                    <div>Male</div>
                    <div>Female</div>
                    <div>Total</div>
                  </div>

                  {(
                    [
                      ["permanentEmployees", "Permanent Employees"],
                      ["temporarySeasonalWorkers", "Temporary / Seasonal Workers"],
                      ["technicalSkilledStaff", "Technical / Skilled Staff"],
                      ["unskilledSupportStaff", "Unskilled / Support Staff"],
                      ["totalWorkforce", "Total Workforce"],
                    ] as const
                  ).map(([key, label]) => {
                    const row = (employment as any)[key] || {};
                    const computedTotal = computeEmploymentTotal(row.male, row.female);
                    return (
                      <div key={key} className="grid grid-cols-[1fr_120px_120px_120px] gap-3 px-4 py-3 border-b last:border-b-0 border-slate-200 dark:border-slate-800">
                        <div className={cn("text-sm font-medium", key === "totalWorkforce" ? "font-semibold" : "")}>{label}</div>
                        <Input
                          disabled={!canEdit}
                          value={row.male ?? ""}
                          className="h-10"
                          onChange={(e) => {
                            const next = { ...(employment as any) };
                            const male = toNumberOrNull(e.target.value);
                            const female = (next[key] || {})?.female;
                            next[key] = { ...(next[key] || {}), male, total: computeEmploymentTotal(male, female) };
                            setField("employment_gender_breakdown", next as any);
                          }}
                        />
                        <Input
                          disabled={!canEdit}
                          value={row.female ?? ""}
                          className="h-10"
                          onChange={(e) => {
                            const next = { ...(employment as any) };
                            const female = toNumberOrNull(e.target.value);
                            const male = (next[key] || {})?.male;
                            next[key] = { ...(next[key] || {}), female, total: computeEmploymentTotal(male, female) };
                            setField("employment_gender_breakdown", next as any);
                          }}
                        />
                        <Input
                          disabled
                          value={computedTotal ?? ""}
                          className="h-10 bg-muted/30"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <div className="font-medium">9.2 Occupational Health and Safety (Gender-Sensitive)</div>
                  <YesNoRemarks
                    label="Gender-inclusive safety measures are in place"
                    value={(ohs as any).genderInclusiveSafetyMeasures?.value}
                    remarks={(ohs as any).genderInclusiveSafetyMeasures?.remarks}
                    disabled={!canEdit}
                    onChange={(next) => {
                      const updated = { ...(ohs as any), genderInclusiveSafetyMeasures: next };
                      setField("ohs_gender_sensitive", updated as any);
                    }}
                  />
                  <YesNoRemarks
                    label="Separate Sanitation Facilities"
                    value={(ohs as any).separateSanitationFacilities?.value}
                    remarks={(ohs as any).separateSanitationFacilities?.remarks}
                    disabled={!canEdit}
                    onChange={(next) => {
                      const updated = { ...(ohs as any), separateSanitationFacilities: next };
                      setField("ohs_gender_sensitive", updated as any);
                    }}
                  />
                  <YesNoRemarks
                    label="Gender-responsive Grievance Mechanism"
                    value={(ohs as any).genderResponsiveGrievanceMechanism?.value}
                    remarks={(ohs as any).genderResponsiveGrievanceMechanism?.remarks}
                    disabled={!canEdit}
                    onChange={(next) => {
                      const updated = { ...(ohs as any), genderResponsiveGrievanceMechanism: next };
                      setField("ohs_gender_sensitive", updated as any);
                    }}
                  />
                </div>
              </div>
            </SectionShell>
          </TabsContent>

          <TabsContent value="fees" className="pt-6 space-y-6">
            <SectionShell title="10. Pending fees">
              <div className="grid grid-cols-1 gap-6">
                <NumberField label="Amount" value={form.fees_payment_amount ?? null} disabled={!canEdit} onChange={(v) => setField("fees_payment_amount", (v ?? undefined) as any)} />
              </div>
            </SectionShell>

            <SectionShell title="11. Reports">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <TextField label="Submission date" value={form.reports_submission_date ?? ""} disabled={!canEdit} onChange={(v) => setField("reports_submission_date", v as any)} placeholder="YYYY-MM-DD" />
                <TextField label="Reference number" value={form.reports_reference_number ?? ""} disabled={!canEdit} onChange={(v) => setField("reports_reference_number", v as any)} />
                <div className="md:col-span-2">
                  <TextField label="Proof of reception" value={form.reports_proof ?? ""} disabled={!canEdit} onChange={(v) => setField("reports_proof", v as any)} placeholder="URL or reference" />
                </div>
              </div>
            </SectionShell>
          </TabsContent>

          <TabsContent value="documents" className="pt-6 space-y-6">
            <InspectionDocumentsUpload
              applicationId={applicationId}
              readOnly={!canEdit}
              files={(form.inspection_documents || []) as InspectionDocumentFile[]}
              onFilesChange={(next) => setField("inspection_documents", next as any)}
            />
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tip</CardTitle>
                <CardDescription>
                  Use this section to upload the pictures and any proof documents referenced in the checklist (e.g. wastewater photos, proof of fees payment, proof of reports reception).
                </CardDescription>
              </CardHeader>
            </Card>
          </TabsContent>

          <TabsContent value="findings" className="pt-6 space-y-6">
            <SectionShell title="12. Water use conflicts">
              <div className="space-y-2">
                <Label>Description of any water use conflict in the area related to the permit</Label>
                <Textarea
                  disabled={!canEdit}
                  className="min-h-[140px] bg-white/70 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800"
                  value={form.water_use_conflicts ?? ""}
                  onChange={(e) => setField("water_use_conflicts", e.target.value as any)}
                />
              </div>
            </SectionShell>

            <SectionShell title="13. Catchment protection initiatives">
              <div className="space-y-2">
                <Label>Description of any initiative by the water user to protect the catchment (Add pictures)</Label>
                <Textarea
                  disabled={!canEdit}
                  className="min-h-[140px] bg-white/70 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800"
                  value={form.catchment_protection_initiatives ?? ""}
                  onChange={(e) => setField("catchment_protection_initiatives", e.target.value as any)}
                />
              </div>
            </SectionShell>

            <SectionShell title="14. Conclusion and recommendations">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>General conclusion</Label>
                  <Textarea
                    disabled={!canEdit}
                    className="min-h-[160px] bg-white/70 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800"
                    value={form.general_conclusion ?? ""}
                    onChange={(e) => setField("general_conclusion", e.target.value as any)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Recommendations from Assessor</Label>
                  {canEdit ? (
                    <Select
                      value={normalizeInspectionRecommendation(form.recommendations) ?? ""}
                      onValueChange={(value) => setField("recommendations", value as any)}
                    >
                      <SelectTrigger className="bg-white/70 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800">
                        <SelectValue placeholder="Select recommendation" />
                      </SelectTrigger>
                      <SelectContent>
                        {INSPECTION_RECOMMENDATION_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="min-h-[48px] rounded-md border border-slate-200 bg-white/70 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/20">
                      {form.recommendations || "N/A"}
                    </div>
                  )}
                </div>
              </div>
            </SectionShell>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}


