"use client";

import { useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { InspectionDocumentsUpload, type InspectionDocumentFile } from "@/components/inspection/inspection-documents-upload";
import {
  INSPECTION_RECOMMENDATION_OPTIONS,
  RECOMMENDATION_DETAIL_HINTS,
  normalizeInspectionRecommendation,
} from "@/lib/inspection-recommendations";

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

export interface InspectionLockedData {
  permitHolderName?: string;
  permitHolderId?: string;
  residence?: string;

  permitNumber?: string;
  facilityProjectName?: string;
  issuanceDate?: string;
  expirationDate?: string;

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

  concessionAreaHa?: number;
  concessionBoundaries?: BoundaryRow[];
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

  // Documents
  inspection_documents?: InspectionDocumentFile[];

  // Inspector-provided overrides for locked fields that are N/A
  locked_field_overrides?: Record<string, string>;
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

function isFieldEmpty(value?: string | number | null): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && (value.trim() === "" || value.trim().toLowerCase() === "n/a")) return true;
  return false;
}

function EditableLockedField({
  label,
  lockedValue,
  overrideKey,
  overrides,
  canEdit,
  onOverride,
}: {
  label: string;
  lockedValue?: string | null;
  overrideKey: string;
  overrides?: Record<string, string>;
  canEdit: boolean;
  onOverride: (key: string, value: string) => void;
}) {
  const hasRealValue = !isFieldEmpty(lockedValue);
  const overrideValue = overrides?.[overrideKey];

  if (hasRealValue) {
    return <ReadonlyField label={label} value={lockedValue} />;
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm">
        {label}
        {canEdit && (
          <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400 font-normal">(missing — editable)</span>
        )}
      </Label>
      <Input
        disabled={!canEdit}
        value={overrideValue ?? ""}
        placeholder={canEdit ? `Enter ${label.toLowerCase()}…` : "N/A"}
        className={cn(
          "h-11 border-slate-200 dark:border-slate-800",
          canEdit
            ? "bg-amber-50/50 dark:bg-amber-950/10 border-amber-300 dark:border-amber-800 focus:border-amber-500 focus:ring-amber-500/20"
            : "bg-muted/30"
        )}
        onChange={(e) => onOverride(overrideKey, e.target.value)}
      />
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

function ReportsSection({
  form,
  canEdit,
  setField,
}: {
  form: InspectionFormState;
  canEdit: boolean;
  setField: <K extends keyof InspectionFormState>(key: K, value: InspectionFormState[K]) => void;
}) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const selectedDate = form.reports_submission_date
    ? parse(form.reports_submission_date, "yyyy-MM-dd", new Date())
    : undefined;
  const isDateValid = selectedDate && isValid(selectedDate);

  const errors: Record<string, string | null> = {
    reports_submission_date:
      touched.reports_submission_date && !form.reports_submission_date
        ? "Submission date is required"
        : touched.reports_submission_date && form.reports_submission_date && !isDateValid
          ? "Invalid date format"
          : null,
    reports_reference_number:
      touched.reports_reference_number && !form.reports_reference_number?.trim()
        ? "Reference number is required"
        : null,
    reports_proof: null,
  };

  return (
    <SectionShell title="11. Water User Annual Report">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label className="text-sm">Recent Submission Date</Label>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                disabled={!canEdit}
                className={cn(
                  "w-full h-11 justify-start text-left font-normal bg-white/70 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800",
                  !form.reports_submission_date && "text-muted-foreground",
                  errors.reports_submission_date && "border-red-500 ring-1 ring-red-500"
                )}
                onBlur={() => markTouched("reports_submission_date")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {isDateValid
                  ? format(selectedDate, "PPP")
                  : "Select a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={isDateValid ? selectedDate : undefined}
                onSelect={(date) => {
                  if (date) {
                    setField("reports_submission_date", format(date, "yyyy-MM-dd"));
                  } else {
                    setField("reports_submission_date", undefined);
                  }
                  markTouched("reports_submission_date");
                  setCalendarOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {errors.reports_submission_date && (
            <p className="text-sm text-red-500 mt-1">{errors.reports_submission_date}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Reference number</Label>
          <Input
            value={form.reports_reference_number ?? ""}
            disabled={!canEdit}
            className={cn(
              "h-11 bg-white/70 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800",
              errors.reports_reference_number && "border-red-500 ring-1 ring-red-500"
            )}
            onChange={(e) => setField("reports_reference_number", e.target.value)}
            onBlur={() => markTouched("reports_reference_number")}
          />
          {errors.reports_reference_number && (
            <p className="text-sm text-red-500 mt-1">{errors.reports_reference_number}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Report Submitted</Label>
          <RadioGroup
            value={form.reports_proof === "Yes" ? "yes" : form.reports_proof === "No" ? "no" : ""}
            onValueChange={(v) => setField("reports_proof", v === "yes" ? "Yes" : "No")}
            className="flex items-center gap-6 h-11"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem disabled={!canEdit} value="yes" id="report-submitted-yes" />
              <Label htmlFor="report-submitted-yes" className="text-sm">Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem disabled={!canEdit} value="no" id="report-submitted-no" />
              <Label htmlFor="report-submitted-no" className="text-sm">No</Label>
            </div>
          </RadioGroup>
        </div>
      </div>
    </SectionShell>
  );
}

export function InspectionFormLayout({
  template,
  locked,
  form,
  canEdit,
  applicationId,
  documentOwner,
  setField,
}: {
  template: InspectionTemplate;
  locked: InspectionLockedData;
  form: InspectionFormState;
  canEdit: boolean;
  applicationId: string;
  documentOwner?: { kind: "permit_registry"; id: string };
  setField: <K extends keyof InspectionFormState>(key: K, value: InspectionFormState[K]) => void;
}) {
  const employment = form.employment_gender_breakdown || {};
  const ohs = form.ohs_gender_sensitive || {};
  const overrides = form.locked_field_overrides || {};

  const handleOverride = useCallback(
    (key: string, value: string) => {
      setField("locked_field_overrides", { ...overrides, [key]: value } as any);
    },
    [overrides, setField]
  );

  const authBoundaries = useMemo<BoundaryRow[]>(
    () => {
      if (Array.isArray(locked.concessionBoundaries) && locked.concessionBoundaries.length > 0) {
        return locked.concessionBoundaries;
      }
      if (Array.isArray(form.authorized_concession_boundaries) && form.authorized_concession_boundaries.length > 0) {
        return form.authorized_concession_boundaries;
      }
      return [{ beacon: "B1", latitude: null, longitude: null }];
    },
    [locked.concessionBoundaries, form.authorized_concession_boundaries]
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
                <EditableLockedField label="Name" lockedValue={locked.permitHolderName} overrideKey="permitHolderName" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <EditableLockedField label="ID/TIN" lockedValue={locked.permitHolderId} overrideKey="permitHolderId" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <EditableLockedField label="Residence" lockedValue={locked.residence} overrideKey="residence" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
              </div>
            </SectionShell>

            <SectionShell title="2. Permit Particulars">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ReadonlyField label="Number" value={locked.permitNumber} />
                <EditableLockedField label="Name of Facility/Project" lockedValue={locked.facilityProjectName} overrideKey="facilityProjectName" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <ReadonlyField label="Issuance date" value={locked.issuanceDate || ""} />
                <ReadonlyField label="Expiration date" value={locked.expirationDate || ""} />
              </div>
            </SectionShell>

            <SectionShell title="2.1 Permit Location">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <EditableLockedField label="Province / City of Kigali" lockedValue={locked.permitLocationProvince} overrideKey="permitLocationProvince" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <EditableLockedField label="District" lockedValue={locked.permitLocationDistrict} overrideKey="permitLocationDistrict" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <EditableLockedField label="Sector" lockedValue={locked.permitLocationSector} overrideKey="permitLocationSector" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <EditableLockedField label="Cell" lockedValue={locked.permitLocationCell} overrideKey="permitLocationCell" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <EditableLockedField label="Village" lockedValue={locked.permitLocationVillage} overrideKey="permitLocationVillage" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
              </div>
            </SectionShell>

            <SectionShell title="2.2 Water Source & Purpose">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <EditableLockedField label="Water Source Type" lockedValue={locked.waterSourceType} overrideKey="waterSourceType" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <EditableLockedField label="Water Source Name" lockedValue={locked.waterSourceName} overrideKey="waterSourceName" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <EditableLockedField label="Water Use / Purpose" lockedValue={locked.waterPurpose} overrideKey="waterPurpose" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <EditableLockedField label="Location" lockedValue={locked.waterSourceLocation} overrideKey="waterSourceLocation" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <EditableLockedField label="Level I Catchment" lockedValue={locked.catchmentLevel1} overrideKey="catchmentLevel1" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <EditableLockedField label="Level II Catchment" lockedValue={locked.catchmentLevel2} overrideKey="catchmentLevel2" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
              </div>
            </SectionShell>

            {template === "concession" ? (
              <SectionShell title="2.3 Concession Area">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <EditableLockedField label="Concession Area (Ha)" lockedValue={locked.concessionAreaHa !== undefined ? String(locked.concessionAreaHa) : undefined} overrideKey="concessionAreaHa" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                  <EditableLockedField label="Boundary Points" lockedValue={locked.concessionBoundaries && locked.concessionBoundaries.length > 0 ? `${locked.concessionBoundaries.length} points defined` : undefined} overrideKey="concessionBoundaryPoints" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                </div>
              </SectionShell>
            ) : (
              <SectionShell title="2.3 Abstraction & Volume">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <EditableLockedField label="Water Allowance" lockedValue={locked.waterAllowance !== undefined ? String(locked.waterAllowance) : undefined} overrideKey="waterAllowance" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                  <EditableLockedField label="Allowance Unit" lockedValue={locked.allowanceUnit} overrideKey="allowanceUnit" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                  <EditableLockedField label="Method of Abstraction" lockedValue={locked.abstractionMethod} overrideKey="abstractionMethod" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                  <EditableLockedField label="Flow Rate (m³/s)" lockedValue={locked.flowRate !== undefined ? String(locked.flowRate) : undefined} overrideKey="flowRate" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                </div>
              </SectionShell>
            )}

            <SectionShell title="2.4 Water Source Coordinates">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <EditableLockedField label="Latitude" lockedValue={locked.waterSourceLatitude} overrideKey="waterSourceLatitude" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <EditableLockedField label="Longitude" lockedValue={locked.waterSourceLongitude} overrideKey="waterSourceLongitude" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
              </div>
            </SectionShell>
          </TabsContent>

          <TabsContent value="specifics" className="pt-6 space-y-6">
            {template === "authorization" ? (
              <SectionShell title="5–6. Water abstraction (Authorization)" description="As per the official RWB checklist.">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <EditableLockedField label="Allowed quantity" lockedValue={form.allowed_quantity !== undefined && form.allowed_quantity !== null ? String(form.allowed_quantity) : undefined} overrideKey="allowedQuantity" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                  <EditableLockedField label="Allowed unit" lockedValue={form.allowed_unit} overrideKey="allowedUnit" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                  <EditableLockedField label="Authorized abstraction method" lockedValue={form.authorized_abstraction_method} overrideKey="authorizedAbstractionMethod" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
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
                  <div className="space-y-2">
                    <Label className="text-sm">Actual method</Label>
                    <Select value={form.actual_abstraction_method ?? ""} onValueChange={(v) => setField("actual_abstraction_method", v as any)} disabled={!canEdit}>
                      <SelectTrigger className="h-11 bg-white/70 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pumping">Pumping</SelectItem>
                        <SelectItem value="Gravity">Gravity</SelectItem>
                        <SelectItem value="Diversion Channel">Diversion Channel</SelectItem>
                        <SelectItem value="Dam/Reservoir">Dam/Reservoir</SelectItem>
                        <SelectItem value="Borehole">Borehole</SelectItem>
                        <SelectItem value="Spring Capture">Spring Capture</SelectItem>
                        <SelectItem value="Hand Dug Well">Hand Dug Well</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                  <EditableLockedField label="Authorized surface area" lockedValue={locked.concessionAreaHa !== undefined ? `${locked.concessionAreaHa} Ha` : undefined} overrideKey="authorizedSurfaceArea" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                  <NumberField label="Actual surface area covered" value={form.actual_surface_area_ha ?? null} disabled={!canEdit} onChange={(v) => setField("actual_surface_area_ha", (v ?? undefined) as any)} suffix="Ha" />
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6">
                  <Card className="border-slate-200 dark:border-slate-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Authorized concession boundaries</CardTitle>
                      <CardDescription>Beacon / Latitude / Longitude (from application)</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <div>Beacon</div>
                        <div>Latitude</div>
                        <div>Longitude</div>
                      </div>
                      {authBoundaries.map((r, idx) => (
                        <div key={`ab-${idx}`} className="grid grid-cols-3 gap-3">
                          <Input disabled className="h-11 bg-muted/30 border-slate-200 dark:border-slate-800" value={r.beacon} />
                          <Input disabled className="h-11 bg-muted/30 border-slate-200 dark:border-slate-800" value={r.latitude ?? ""} />
                          <Input disabled className="h-11 bg-muted/30 border-slate-200 dark:border-slate-800" value={r.longitude ?? ""} />
                        </div>
                      ))}
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
                <EditableLockedField label="Type of activity" lockedValue={locked.activityType} overrideKey="activityType" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
                <EditableLockedField label="Starting date" lockedValue={locked.activityStartingDate} overrideKey="activityStartingDate" overrides={overrides} canEdit={canEdit} onOverride={handleOverride} />
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
                      ["skilledPermanentWorkers", "Skilled Permanent Workers"],
                      ["unskilledPermanentWorkers", "Unskilled Permanent Workers"],
                      ["skilledTemporaryWorkers", "Skilled Temporary Workers"],
                      ["unskilledTemporaryWorkers", "Unskilled Temporary Workers"],
                      ["totalWorkers", "Total Workers"],
                    ] as const
                  ).map(([key, label]) => {
                    const row = (employment as any)[key] || {};
                    const computedTotal = computeEmploymentTotal(row.male, row.female);
                    return (
                      <div key={key} className="grid grid-cols-[1fr_120px_120px_120px] gap-3 px-4 py-3 border-b last:border-b-0 border-slate-200 dark:border-slate-800">
                        <div className={cn("text-sm font-medium", key === "totalWorkers" ? "font-semibold" : "")}>{label}</div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <NumberField label="Amount" value={form.fees_payment_amount ?? null} disabled={!canEdit} onChange={(v) => setField("fees_payment_amount", (v ?? undefined) as any)} />
              </div>
              <div className="mt-4 space-y-2">
                <Label className="text-sm">Details and relevance of pending fees</Label>
                <Textarea
                  disabled={!canEdit}
                  className="min-h-[100px] bg-white/70 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800"
                  placeholder="Describe the nature of the pending fees, payment history, and relevance..."
                  value={form.fees_payment_details ?? ""}
                  onChange={(e) => setField("fees_payment_details", e.target.value as any)}
                />
              </div>
            </SectionShell>

            <ReportsSection
              form={form}
              canEdit={canEdit}
              setField={setField}
            />
          </TabsContent>

          <TabsContent value="documents" className="pt-6 space-y-6">
            <InspectionDocumentsUpload
              applicationId={applicationId}
              owner={documentOwner}
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
              <div className="space-y-6">
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
                {form.recommendations && (
                  <div className="space-y-2">
                    <Label>Details</Label>
                    <Textarea
                      disabled={!canEdit}
                      className="min-h-[120px] bg-white/70 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800"
                      placeholder={RECOMMENDATION_DETAIL_HINTS[form.recommendations] || "Provide details..."}
                      value={form.recommendation_details ?? ""}
                      onChange={(e) => setField("recommendation_details", e.target.value as any)}
                    />
                  </div>
                )}
              </div>
            </SectionShell>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}


