"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

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

export interface RwbLockedData {
  permitHolderName?: string;
  permitHolderId?: string;
  residence?: string;

  permitNumber?: string;
  issuanceDate?: string;
  expirationDate?: string;

  operatorName?: string;
  operatorIdTin?: string;
  operatorResidence?: string;

  waterSourceName?: string;
  waterSourceLocation?: string;
  catchmentLevel1?: string;
  catchmentLevel2?: string;
}

export interface RwbInspectionFormState {
  // Section 5/6/7/8/10/11/12/13/14
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
}

function fmtDate(value?: string | null): string {
  if (!value) return "";
  // keep raw YYYY-MM-DD if provided; otherwise best-effort
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}

function toNumberOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="font-semibold text-sm uppercase tracking-wide text-slate-700 dark:text-slate-200">{children}</div>;
}

function CellLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{children}</div>;
}

function ReadonlyCell({ value }: { value?: string | null }) {
  return <Input value={value || ""} disabled className="h-10 bg-white/60 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800" />;
}

function TextCell({
  value,
  disabled,
  onChange,
  placeholder,
}: {
  value?: string | null;
  disabled: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value || ""}
      disabled={disabled}
      placeholder={placeholder}
      className="h-10 bg-white/80 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function TableFrame({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white/60 dark:bg-slate-950/20">{children}</div>;
}

function GridRow({
  left,
  right,
  className,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[260px_1fr] md:grid-cols-[320px_1fr] border-t border-slate-200 dark:border-slate-800", className)}>
      <div className="px-4 py-3 bg-slate-50/60 dark:bg-slate-900/30 border-r border-slate-200 dark:border-slate-800 flex items-center">
        {left}
      </div>
      <div className="px-4 py-3">{right}</div>
    </div>
  );
}

function SectionBlock({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-slate-200 dark:border-slate-800">
      <div className="grid grid-cols-[54px_1fr] border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 py-3 bg-slate-100/60 dark:bg-slate-900/40 font-semibold text-slate-800 dark:text-slate-100">{number}</div>
        <div className="px-4 py-3 bg-slate-100/40 dark:bg-slate-900/30">
          <SectionTitle>{title}</SectionTitle>
        </div>
      </div>
      {children}
    </div>
  );
}

function YesNo({
  value,
  disabled,
  onChange,
}: {
  value?: boolean | null;
  disabled: boolean;
  onChange: (v: boolean | null) => void;
}) {
  const v = value === true ? "yes" : value === false ? "no" : "";
  return (
    <div className="flex items-center gap-4">
      <RadioGroup
        value={v}
        onValueChange={(next) => onChange(next === "yes" ? true : next === "no" ? false : null)}
        className="flex items-center gap-6"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem disabled={disabled} value="yes" id="yes" />
          <Label className="text-sm" htmlFor="yes">
            Yes
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem disabled={disabled} value="no" id="no" />
          <Label className="text-sm" htmlFor="no">
            No
          </Label>
        </div>
      </RadioGroup>
    </div>
  );
}

export function RwbInspectionChecklist({
  template,
  locked,
  form,
  canEdit,
  setField,
}: {
  template: InspectionTemplate;
  locked: RwbLockedData;
  form: RwbInspectionFormState;
  canEdit: boolean;
  setField: <K extends keyof RwbInspectionFormState>(key: K, value: RwbInspectionFormState[K]) => void;
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
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white/50 dark:bg-slate-950/10">
      <CardContent className="p-0">
        <TableFrame>
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/20">
            <div className="text-center font-semibold text-sm tracking-wide uppercase text-slate-800 dark:text-slate-100">
              Checklist for Water Users’ Inspection ({template === "authorization" ? "Authorization" : "Concession"})
            </div>
          </div>

          <SectionBlock number="1" title="Permit Holder Identification">
            <GridRow left={<CellLabel>Name</CellLabel>} right={<ReadonlyCell value={locked.permitHolderName || "N/A"} />} />
            <GridRow left={<CellLabel>ID/TIN</CellLabel>} right={<ReadonlyCell value={locked.permitHolderId || "N/A"} />} />
            <GridRow left={<CellLabel>Residence</CellLabel>} right={<ReadonlyCell value={locked.residence || "N/A"} />} />
          </SectionBlock>

          <SectionBlock number="2" title="Permit Particulars">
            <GridRow left={<CellLabel>Number</CellLabel>} right={<ReadonlyCell value={locked.permitNumber || "N/A"} />} />
            <GridRow left={<CellLabel>Issuance date</CellLabel>} right={<ReadonlyCell value={fmtDate(locked.issuanceDate)} />} />
            <GridRow left={<CellLabel>Expiration date</CellLabel>} right={<ReadonlyCell value={fmtDate(locked.expirationDate)} />} />
          </SectionBlock>

          <SectionBlock number="3" title="Operator">
            <GridRow left={<CellLabel>Name</CellLabel>} right={<ReadonlyCell value={locked.operatorName || "N/A"} />} />
            <GridRow left={<CellLabel>ID/TIN</CellLabel>} right={<ReadonlyCell value={locked.operatorIdTin || "N/A"} />} />
            <GridRow left={<CellLabel>Residence</CellLabel>} right={<ReadonlyCell value={locked.operatorResidence || "N/A"} />} />
          </SectionBlock>

          <SectionBlock number="4" title="Water source">
            <GridRow left={<CellLabel>Name</CellLabel>} right={<ReadonlyCell value={locked.waterSourceName || "N/A"} />} />
            <GridRow
              left={<CellLabel>Location</CellLabel>}
              right={
                <ReadonlyCell value={locked.waterSourceLocation || "N/A"} />
              }
            />
            <GridRow left={<CellLabel>Level I Catchment</CellLabel>} right={<ReadonlyCell value={locked.catchmentLevel1 || "N/A"} />} />
            <GridRow left={<CellLabel>Level II Catchment</CellLabel>} right={<ReadonlyCell value={locked.catchmentLevel2 || "N/A"} />} />
          </SectionBlock>

          {template === "authorization" ? (
            <>
              <SectionBlock number="5" title="Water to be abstracted as per the permit">
                <GridRow
                  left={<CellLabel>Quantity (m³/day, m³/year)</CellLabel>}
                  right={
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        disabled={!canEdit}
                        value={form.allowed_quantity ?? ""}
                        className="h-10"
                        onChange={(e) => setField("allowed_quantity", toNumberOrNull(e.target.value) as any)}
                        placeholder=""
                      />
                      <Input disabled={!canEdit} value={form.allowed_unit ?? ""} className="h-10" onChange={(e) => setField("allowed_unit", e.target.value as any)} placeholder="" />
                    </div>
                  }
                />
                <GridRow
                  left={<CellLabel>Authorized abstraction method</CellLabel>}
                  right={<TextCell disabled={!canEdit} value={form.authorized_abstraction_method ?? ""} onChange={(v) => setField("authorized_abstraction_method", v as any)} />}
                />
              </SectionBlock>

              <SectionBlock number="6" title="Actual water abstracted">
                <GridRow
                  left={<CellLabel>Quantity</CellLabel>}
                  right={
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        disabled={!canEdit}
                        value={form.actual_quantity ?? ""}
                        className="h-10"
                        onChange={(e) => setField("actual_quantity", toNumberOrNull(e.target.value) as any)}
                        placeholder=""
                      />
                      <Input disabled={!canEdit} value={form.actual_unit ?? ""} className="h-10" onChange={(e) => setField("actual_unit", e.target.value as any)} placeholder="" />
                    </div>
                  }
                />
                <GridRow left={<CellLabel>Method</CellLabel>} right={<TextCell disabled={!canEdit} value={form.actual_abstraction_method ?? ""} onChange={(v) => setField("actual_abstraction_method", v as any)} />} />
                <GridRow
                  left={<CellLabel>Type of water measurement device in place (Add pictures)</CellLabel>}
                  right={<TextCell disabled={!canEdit} value={form.measurement_device_type ?? ""} onChange={(v) => setField("measurement_device_type", v as any)} />}
                />
              </SectionBlock>
            </>
          ) : (
            <>
              <SectionBlock number="5" title="Surface area to be covered as per the permit">
                <GridRow
                  left={<CellLabel>Authorized surface area</CellLabel>}
                  right={
                    <div className="flex items-center gap-3">
                      <Input
                        disabled={!canEdit}
                        value={form.authorized_surface_area_ha ?? ""}
                        className="h-10 max-w-[220px]"
                        onChange={(e) => setField("authorized_surface_area_ha", toNumberOrNull(e.target.value) as any)}
                        placeholder=""
                      />
                      <span className="text-sm text-muted-foreground">Ha</span>
                    </div>
                  }
                />
                <div className="border-t border-slate-200 dark:border-slate-800 grid grid-cols-[320px_1fr]">
                  <div className="px-4 py-3 bg-slate-50/60 dark:bg-slate-900/30 border-r border-slate-200 dark:border-slate-800 flex items-start">
                    <CellLabel>Concession boundaries</CellLabel>
                  </div>
                  <div className="px-4 py-3">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="grid grid-cols-3 bg-slate-50/60 dark:bg-slate-900/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <div>Beacon</div>
                        <div>Latitude</div>
                        <div>Longitude</div>
                      </div>
                      {authBoundaries.map((r, idx) => (
                        <div key={`ab-${idx}`} className="grid grid-cols-3 gap-2 px-3 py-2 border-t border-slate-200 dark:border-slate-800">
                          <Input disabled={!canEdit} value={r.beacon} className="h-9" onChange={(e) => setBoundary("authorized_concession_boundaries", idx, { beacon: e.target.value })} />
                          <Input
                            disabled={!canEdit}
                            value={r.latitude ?? ""}
                            className="h-9"
                            onChange={(e) => setBoundary("authorized_concession_boundaries", idx, { latitude: toNumberOrNull(e.target.value) })}
                          />
                          <Input
                            disabled={!canEdit}
                            value={r.longitude ?? ""}
                            className="h-9"
                            onChange={(e) => setBoundary("authorized_concession_boundaries", idx, { longitude: toNumberOrNull(e.target.value) })}
                          />
                        </div>
                      ))}
                      {canEdit ? (
                        <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setField("authorized_concession_boundaries", [...authBoundaries, { beacon: `B${authBoundaries.length + 1}`, latitude: null, longitude: null }] as any)}
                          >
                            Add others (if any)
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </SectionBlock>

              <SectionBlock number="6" title="Actual surface area covered">
                <GridRow
                  left={<CellLabel>Area (Ha)</CellLabel>}
                  right={
                    <div className="flex items-center gap-3">
                      <Input
                        disabled={!canEdit}
                        value={form.actual_surface_area_ha ?? ""}
                        className="h-10 max-w-[220px]"
                        onChange={(e) => setField("actual_surface_area_ha", toNumberOrNull(e.target.value) as any)}
                        placeholder=""
                      />
                      <span className="text-sm text-muted-foreground">Ha</span>
                    </div>
                  }
                />
                <div className="border-t border-slate-200 dark:border-slate-800 grid grid-cols-[320px_1fr]">
                  <div className="px-4 py-3 bg-slate-50/60 dark:bg-slate-900/30 border-r border-slate-200 dark:border-slate-800 flex items-start">
                    <CellLabel>Concession boundaries</CellLabel>
                  </div>
                  <div className="px-4 py-3">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="grid grid-cols-3 bg-slate-50/60 dark:bg-slate-900/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <div>Beacon</div>
                        <div>Latitude</div>
                        <div>Longitude</div>
                      </div>
                      {actualBoundaries.map((r, idx) => (
                        <div key={`ac-${idx}`} className="grid grid-cols-3 gap-2 px-3 py-2 border-t border-slate-200 dark:border-slate-800">
                          <Input disabled={!canEdit} value={r.beacon} className="h-9" onChange={(e) => setBoundary("actual_concession_boundaries", idx, { beacon: e.target.value })} />
                          <Input
                            disabled={!canEdit}
                            value={r.latitude ?? ""}
                            className="h-9"
                            onChange={(e) => setBoundary("actual_concession_boundaries", idx, { latitude: toNumberOrNull(e.target.value) })}
                          />
                          <Input
                            disabled={!canEdit}
                            value={r.longitude ?? ""}
                            className="h-9"
                            onChange={(e) => setBoundary("actual_concession_boundaries", idx, { longitude: toNumberOrNull(e.target.value) })}
                          />
                        </div>
                      ))}
                      {canEdit ? (
                        <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setField("actual_concession_boundaries", [...actualBoundaries, { beacon: `B${actualBoundaries.length + 1}`, latitude: null, longitude: null }] as any)}
                          >
                            Add others (if any)
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </SectionBlock>
            </>
          )}

          <SectionBlock number="7" title="Activity in which water is used">
            <GridRow left={<CellLabel>Type of activity</CellLabel>} right={<TextCell disabled={!canEdit} value={form.activity_type ?? ""} onChange={(v) => setField("activity_type", v as any)} />} />
            <GridRow left={<CellLabel>Starting date</CellLabel>} right={<TextCell disabled={!canEdit} value={form.activity_starting_date ?? ""} onChange={(v) => setField("activity_starting_date", v as any)} placeholder="YYYY-MM-DD" />} />
          </SectionBlock>

          <SectionBlock number="8" title="Wastewater management system">
            <GridRow left={<CellLabel>Type of the system</CellLabel>} right={<TextCell disabled={!canEdit} value={form.wastewater_system_type ?? ""} onChange={(v) => setField("wastewater_system_type", v as any)} />} />
            <GridRow
              left={<CellLabel>Effectiveness of the system (Add pictures)</CellLabel>}
              right={<TextCell disabled={!canEdit} value={form.wastewater_system_effectiveness ?? ""} onChange={(v) => setField("wastewater_system_effectiveness", v as any)} />}
            />
          </SectionBlock>

          <SectionBlock number="9" title="Social and Gender-Disaggregated Information">
            <div className="border-t border-slate-200 dark:border-slate-800">
              <div className="px-4 py-3 bg-slate-50/60 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 font-semibold text-sm text-slate-800 dark:text-slate-100">
                9.1 Employment Related to Water Use Activity
              </div>
              <div className="grid grid-cols-[320px_1fr_1fr_1fr] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-white/70 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800">
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
                return (
                  <div key={key} className="grid grid-cols-[320px_1fr_1fr_1fr] gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-800 last:border-b-0">
                    <div className="flex items-center text-sm font-medium text-slate-800 dark:text-slate-100">{label}</div>
                    <Input
                      disabled={!canEdit}
                      value={row.male ?? ""}
                      className="h-9"
                      onChange={(e) => {
                        const next = { ...(employment as any) };
                        next[key] = { ...(next[key] || {}), male: toNumberOrNull(e.target.value) };
                        setField("employment_gender_breakdown", next as any);
                      }}
                    />
                    <Input
                      disabled={!canEdit}
                      value={row.female ?? ""}
                      className="h-9"
                      onChange={(e) => {
                        const next = { ...(employment as any) };
                        next[key] = { ...(next[key] || {}), female: toNumberOrNull(e.target.value) };
                        setField("employment_gender_breakdown", next as any);
                      }}
                    />
                    <Input
                      disabled={!canEdit}
                      value={row.total ?? ""}
                      className="h-9"
                      onChange={(e) => {
                        const next = { ...(employment as any) };
                        next[key] = { ...(next[key] || {}), total: toNumberOrNull(e.target.value) };
                        setField("employment_gender_breakdown", next as any);
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800">
              <div className="px-4 py-3 bg-slate-50/60 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 font-semibold text-sm text-slate-800 dark:text-slate-100">
                9.2 Occupational Health and Safety (Gender-Sensitive)
              </div>
              <div className="grid grid-cols-[1fr_220px_1fr] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-white/70 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800">
                <div>Item</div>
                <div>Yes / No</div>
                <div>Remarks</div>
              </div>

              {(
                [
                  ["genderInclusiveSafetyMeasures", "Gender-inclusive safety measures are in place"],
                  ["separateSanitationFacilities", "Separate Sanitation Facilities"],
                  ["genderResponsiveGrievanceMechanism", "Gender-responsive Grievance Mechanism"],
                ] as const
              ).map(([key, label]) => {
                const item = (ohs as any)[key] || {};
                return (
                  <div key={key} className="grid grid-cols-[1fr_220px_1fr] gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 last:border-b-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center">{label}</div>
                    <div className="flex items-center">
                      <YesNo
                        disabled={!canEdit}
                        value={item.value}
                        onChange={(v) => {
                          const next = { ...(ohs as any) };
                          next[key] = { ...(next[key] || {}), value: v };
                          setField("ohs_gender_sensitive", next as any);
                        }}
                      />
                    </div>
                    <Input
                      disabled={!canEdit}
                      value={item.remarks ?? ""}
                      className="h-9"
                      onChange={(e) => {
                        const next = { ...(ohs as any) };
                        next[key] = { ...(next[key] || {}), remarks: e.target.value };
                        setField("ohs_gender_sensitive", next as any);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </SectionBlock>

          <SectionBlock number="10" title="Fees paid">
            <GridRow
              left={<CellLabel>Amount</CellLabel>}
              right={
                <Input
                  disabled={!canEdit}
                  value={form.fees_payment_amount ?? ""}
                  className="h-10 max-w-[260px]"
                  onChange={(e) => setField("fees_payment_amount", toNumberOrNull(e.target.value) as any)}
                />
              }
            />
            <GridRow
              left={<CellLabel>Proof</CellLabel>}
              right={<TextCell disabled={!canEdit} value={form.fees_payment_proof ?? ""} onChange={(v) => setField("fees_payment_proof", v as any)} placeholder="URL or reference" />}
            />
          </SectionBlock>

          <SectionBlock number="11" title="Reports">
            <GridRow
              left={<CellLabel>Submission date and reference number</CellLabel>}
              right={
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <TextCell disabled={!canEdit} value={form.reports_submission_date ?? ""} onChange={(v) => setField("reports_submission_date", v as any)} placeholder="YYYY-MM-DD" />
                  <TextCell disabled={!canEdit} value={form.reports_reference_number ?? ""} onChange={(v) => setField("reports_reference_number", v as any)} placeholder="Reference number" />
                </div>
              }
            />
            <GridRow
              left={<CellLabel>Proof of reception</CellLabel>}
              right={<TextCell disabled={!canEdit} value={form.reports_proof ?? ""} onChange={(v) => setField("reports_proof", v as any)} placeholder="URL or reference" />}
            />
          </SectionBlock>

          <SectionBlock number="12" title="Description of any water use conflict in the area related to the permit">
            <div className="p-4">
              <Textarea disabled={!canEdit} value={form.water_use_conflicts ?? ""} onChange={(e) => setField("water_use_conflicts", e.target.value as any)} className="min-h-[120px]" />
            </div>
          </SectionBlock>

          <SectionBlock number="13" title="Description of any initiative by the water user to protect the catchment (Add pictures)">
            <div className="p-4">
              <Textarea
                disabled={!canEdit}
                value={form.catchment_protection_initiatives ?? ""}
                onChange={(e) => setField("catchment_protection_initiatives", e.target.value as any)}
                className="min-h-[120px]"
              />
            </div>
          </SectionBlock>

          <SectionBlock number="14" title="Provide a general conclusion and recommendations">
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>General conclusion</Label>
                <Textarea disabled={!canEdit} value={form.general_conclusion ?? ""} onChange={(e) => setField("general_conclusion", e.target.value as any)} className="min-h-[140px]" />
              </div>
              <div className="space-y-2">
                <Label>Recommendations</Label>
                <Textarea disabled={!canEdit} value={form.recommendations ?? ""} onChange={(e) => setField("recommendations", e.target.value as any)} className="min-h-[140px]" />
              </div>
            </div>
          </SectionBlock>
        </TableFrame>
      </CardContent>
    </Card>
  );
}


