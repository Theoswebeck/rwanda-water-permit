"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, XCircle, AlertCircle, Loader2, AlertTriangle, FileText, ExternalLink } from "lucide-react"
import { getInspectionById } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { normalizeInspectionRecommendation } from "@/lib/inspection-recommendations";

interface InspectionDetailProps {
  inspectionId: string
  permitNumber?: string
}

type EmploymentRow = { male?: number | null; female?: number | null; total?: number | null };
type EmploymentBreakdown = {
  skilledPermanentWorkers?: EmploymentRow;
  unskilledPermanentWorkers?: EmploymentRow;
  skilledTemporaryWorkers?: EmploymentRow;
  unskilledTemporaryWorkers?: EmploymentRow;
  totalWorkers?: EmploymentRow;
  // Legacy keys for reading old inspection records
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
type BoundaryRow = { beacon: string; latitude?: number | null; longitude?: number | null };

interface Inspection {
  id: string
  inspection_number: string
  type: string
  status: string
  result?: string
  scheduled_date: string
  completed_date?: string
  inspection_template?: string
  operator_name?: string
  operator_id_tin?: string
  operator_residence?: string
  catchment_level1?: string
  catchment_level2?: string
  allowed_quantity?: number
  allowed_unit?: string
  authorized_abstraction_method?: string
  actual_quantity?: number
  actual_unit?: string
  actual_abstraction_method?: string
  measurement_device_type?: string
  authorized_surface_area_ha?: number
  actual_surface_area_ha?: number
  authorized_concession_boundaries?: BoundaryRow[]
  actual_concession_boundaries?: BoundaryRow[]
  employment_gender_breakdown?: EmploymentBreakdown
  ohs_gender_sensitive?: OhsGenderSensitive
  water_use_conflicts?: string
  catchment_protection_initiatives?: string
  general_conclusion?: string
  recommendations?: string
  activity_type?: string
  activity_starting_date?: string
  wastewater_system_type?: string
  wastewater_system_effectiveness?: string
  fees_payment_amount?: number
  fees_payment_proof?: string
  fees_payment_verified?: boolean
  reports_submission_date?: string
  reports_reference_number?: string
  reports_proof?: string
  reports_submitted?: boolean
  compliance_status?: string
  location_verified?: boolean
  coordinates_verified?: boolean
  site_plan_compliance?: boolean
  location_notes?: string
  water_source_verified?: boolean
  extraction_method_verified?: boolean
  infrastructure_condition?: string
  technical_compliance?: boolean
  technical_notes?: string
  environmental_impact_assessed?: boolean
  mitigation_measures_implemented?: boolean
  environmental_compliance?: boolean
  environmental_notes?: string
  permit_conditions_met?: boolean
  volume_limits_respected?: boolean
  reporting_up_to_date?: boolean
  fees_paid?: boolean
  regulatory_compliance?: boolean
  regulatory_notes?: string
  photos_taken?: number
  samples_collected?: number
  overall_score?: number
  follow_up_required?: boolean
  follow_up_date?: string
  locked_field_overrides?: Record<string, string>
  inspection_documents?: Array<{
    id?: string
    name?: string
    fileName?: string
    url?: string
    category?: string
    size?: number
    uploadedAt?: string
  }>
  application?: {
    id: string
    application_number: string
    project_title: string
    project_description: string
    water_source: string
    water_purpose: string
    province: string
    district: string
    sector: string
    cell: string
    applicant?: {
      first_name: string
      last_name: string
      company_name?: string
      email: string
      phone: string
      address?: string
    }
  }
  inspector: {
    first_name: string
    last_name: string
    email: string
  }
}

function ReadonlyField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <Input disabled value={value ?? "N/A"} className="h-11 bg-muted/30 border-slate-200 dark:border-slate-800" />
    </div>
  );
}

function OverridableReadonlyField({
  label,
  value,
  overrideKey,
  overrides,
}: {
  label: string;
  value?: string | number | null;
  overrideKey: string;
  overrides?: Record<string, string>;
}) {
  const isEmpty = value === null || value === undefined || (typeof value === "string" && (value.trim() === "" || value.trim().toLowerCase() === "n/a"));
  const overrideValue = overrides?.[overrideKey];
  const displayValue = isEmpty && overrideValue ? overrideValue : value;
  const isOverridden = isEmpty && !!overrideValue;

  return (
    <div className="space-y-2">
      <Label className="text-sm text-muted-foreground">
        {label}
        {isOverridden && <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">(inspector-provided)</span>}
      </Label>
      <Input disabled value={displayValue ?? "N/A"} className="h-11 bg-muted/30 border-slate-200 dark:border-slate-800" />
    </div>
  );
}

// Section shell component for consistent card styling
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

// Yes/No display component
function YesNoDisplay({ label, value, remarks }: { label: string; value?: boolean | null; remarks?: string | null }) {
  const displayValue = value === true ? "Yes" : value === false ? "No" : "Not specified";
  const icon = value === true ? (
    <CheckCircle2 className="h-4 w-4 text-green-500" />
  ) : value === false ? (
    <XCircle className="h-4 w-4 text-red-500" />
  ) : (
    <AlertCircle className="h-4 w-4 text-yellow-500" />
  );

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-white/60 dark:bg-slate-950/10">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="font-medium text-sm">{label}</div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm">{displayValue}</span>
          </div>
          {remarks && (
            <span className="text-sm text-muted-foreground">Remarks: {remarks}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function InspectionDetail({ inspectionId, permitNumber }: InspectionDetailProps) {
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [loading, setLoading] = useState(true)
  
  const { handleErrorWithBack } = useErrorHandler();

  useEffect(() => {
    const fetchInspection = async () => {
      try {
        setLoading(true)
        const data = (await getInspectionById(inspectionId)) as Inspection | null
        console.log("📋 Fetched inspection data:", data)
        console.log("📊 Employment data:", data?.employment_gender_breakdown)
        console.log("🏥 OHS data:", data?.ohs_gender_sensitive)
        setInspection(data)
      } catch (err) {
        handleErrorWithBack(err, 'load inspection details');
      } finally {
        setLoading(false)
      }
    }

    fetchInspection()
  }, [inspectionId])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "passed":
      case "compliant":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case "failed":
      case "non_compliant":
        return <XCircle className="h-5 w-5 text-red-500" />
      case "conditional":
      case "partially_compliant":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "passed":
      case "compliant":
        return <Badge variant="default">Compliant</Badge>
      case "failed":
      case "non_compliant":
        return <Badge variant="destructive">Non-Compliant</Badge>
      case "conditional":
      case "partially_compliant":
        return <Badge variant="secondary">Partially Compliant</Badge>
      default:
        return <Badge variant="outline">{status || "Pending"}</Badge>
    }
  }

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "N/A"
    const d = new Date(dateString)
    if (isNaN(d.getTime())) return "N/A"
    return d.toLocaleDateString()
  }

  const formatNum = (n: any) => {
    const v = Number(n)
    if (!Number.isFinite(v)) return "N/A"
    return v.toLocaleString()
  }

  const getApplicantName = (applicant: NonNullable<Inspection["application"]>["applicant"] | undefined) => {
    if (!applicant) return "Unknown Applicant"
    const company = applicant.company_name?.trim()
    if (company) return company
    const fullName = `${applicant.first_name || ""} ${applicant.last_name || ""}`.trim()
    return fullName || "Unknown Applicant"
  }

  const getLocationString = (application: Inspection["application"] | undefined) => {
    if (!application) return "N/A"
    return `${application.district}, ${application.sector}, ${application.cell}`
  }

  const getWaterSourceLabel = (waterSource: string) => {
    const labels: Record<string, string> = {
      'surface_water': 'Surface Water',
      'groundwater': 'Groundwater',
      'borehole': 'Borehole',
      'river': 'River',
      'lake': 'Lake',
      'spring': 'Spring',
      'other': 'Other'
    }
    return labels[waterSource] || waterSource
  }

  // Get employment data
  const getEmploymentData = () => {
    const b = inspection?.employment_gender_breakdown || {};
    return {
      skilledPermanentWorkers: b.skilledPermanentWorkers || b.technicalSkilledStaff || {},
      unskilledPermanentWorkers: b.unskilledPermanentWorkers || b.unskilledSupportStaff || {},
      skilledTemporaryWorkers: b.skilledTemporaryWorkers || b.temporarySeasonalWorkers || {},
      unskilledTemporaryWorkers: b.unskilledTemporaryWorkers || {},
      totalWorkers: b.totalWorkers || b.totalWorkforce || {},
      // Legacy fallback: if old record has permanentEmployees but no new keys, show it
      permanentEmployees: b.permanentEmployees || {},
    };
  };

  // Get OHS data
  const getOhsData = () => {
    const ohs = inspection?.ohs_gender_sensitive || {};
    return {
      genderInclusiveSafetyMeasures: ohs.genderInclusiveSafetyMeasures || {},
      separateSanitationFacilities: ohs.separateSanitationFacilities || {},
      genderResponsiveGrievanceMechanism: ohs.genderResponsiveGrievanceMechanism || {},
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading inspection details...</span>
        </div>
      </div>
    )
  }

  if (!inspection) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertTriangle className="h-6 w-6" />
          <span>Inspection not found</span>
        </div>
      </div>
    )
  }

  const employment = getEmploymentData();
  const ohs = getOhsData();
  const isConcession = inspection.inspection_template === "concession";

  // Section II "permitted vs actual". The permitted activity comes from the
  // permit; the override is only a fallback for permits that carry no purpose.
  // Actual activity and the concession area units live in locked_field_overrides
  // (see docs/superpowers/specs/2026-07-21-inspection-permitted-vs-actual-design.md §3.3).
  const overrides = inspection.locked_field_overrides || {};
  const permittedActivity = inspection.application?.water_purpose || overrides.waterPurpose || null;
  const actualActivity = overrides.actualActivity || null;
  const permittedAreaUnit = overrides.permittedConcessionAreaUnit || "ha";
  const actualAreaUnit = overrides.actualConcessionAreaUnit || "ha";
  const complianceStatus = inspection.compliance_status || inspection.result;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{inspection.inspection_number || `Inspection ${inspectionId.slice(0, 8)}...`}</h2>
          <p className="text-muted-foreground">
            Permit: {permitNumber || "N/A"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {complianceStatus && getStatusIcon(complianceStatus)}
          {complianceStatus && getStatusBadge(complianceStatus)}
        </div>
      </div>

      {/* Permit holder / operator */}
      <SectionShell title="Permit holder / operator">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <OverridableReadonlyField label="Operator name" value={inspection.operator_name} overrideKey="permitHolderName" overrides={inspection.locked_field_overrides} />
          <OverridableReadonlyField label="Operator ID/TIN" value={inspection.operator_id_tin} overrideKey="permitHolderId" overrides={inspection.locked_field_overrides} />
          <OverridableReadonlyField label="Operator residence" value={inspection.operator_residence} overrideKey="residence" overrides={inspection.locked_field_overrides} />
          <OverridableReadonlyField label="Catchment Level I" value={inspection.catchment_level1} overrideKey="catchmentLevel1" overrides={inspection.locked_field_overrides} />
          <OverridableReadonlyField label="Catchment Level II" value={inspection.catchment_level2} overrideKey="catchmentLevel2" overrides={inspection.locked_field_overrides} />
        </div>
      </SectionShell>

      {/* Permit specifics */}
      <SectionShell
        title="Permit specifics (permitted vs actual)"
        description={isConcession ? "Permitted vs actual concession area, plus boundaries" : "Permitted vs actual water abstraction"}
      >
        {isConcession ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <ReadonlyField label="Permitted activity" value={permittedActivity} />
              <ReadonlyField label="Actual activity" value={actualActivity} />
              <ReadonlyField
                label={`Permitted concession area (${permittedAreaUnit})`}
                value={inspection.authorized_surface_area_ha != null ? formatNum(inspection.authorized_surface_area_ha) : overrides.concessionAreaHa ?? null}
              />
              <ReadonlyField
                label={`Actual concession area (${actualAreaUnit})`}
                value={inspection.actual_surface_area_ha != null ? formatNum(inspection.actual_surface_area_ha) : null}
              />
            </div>

            {/* Authorized boundaries */}
            {Array.isArray(inspection.authorized_concession_boundaries) && inspection.authorized_concession_boundaries.length > 0 && (
              <Card className="border-slate-200 dark:border-slate-800 mb-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Authorized concession boundaries</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    <div>Beacon</div>
                    <div>Latitude</div>
                    <div>Longitude</div>
                  </div>
                  {inspection.authorized_concession_boundaries.map((r, idx) => (
                    <div key={`ab-${idx}`} className="grid grid-cols-3 gap-3 mb-2">
                      <Input disabled className="h-11 bg-muted/30" value={r.beacon || `B${idx + 1}`} />
                      <Input disabled className="h-11 bg-muted/30" value={r.latitude ?? "N/A"} />
                      <Input disabled className="h-11 bg-muted/30" value={r.longitude ?? "N/A"} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            
            {/* Actual boundaries */}
            {Array.isArray(inspection.actual_concession_boundaries) && inspection.actual_concession_boundaries.length > 0 && (
              <Card className="border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Actual concession boundaries</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    <div>Beacon</div>
                    <div>Latitude</div>
                    <div>Longitude</div>
                  </div>
                  {inspection.actual_concession_boundaries.map((r, idx) => (
                    <div key={`ac-${idx}`} className="grid grid-cols-3 gap-3 mb-2">
                      <Input disabled className="h-11 bg-muted/30" value={r.beacon || `B${idx + 1}`} />
                      <Input disabled className="h-11 bg-muted/30" value={r.latitude ?? "N/A"} />
                      <Input disabled className="h-11 bg-muted/30" value={r.longitude ?? "N/A"} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ReadonlyField label="Permitted activity" value={permittedActivity} />
              <ReadonlyField label="Actual activity" value={actualActivity} />
              <ReadonlyField
                label="Permitted abstraction quantity"
                value={inspection.allowed_quantity != null ? `${formatNum(inspection.allowed_quantity)} ${inspection.allowed_unit || 'm³/year'}` : null}
              />
              <ReadonlyField
                label="Actual abstraction quantity"
                value={inspection.actual_quantity != null ? `${formatNum(inspection.actual_quantity)} ${inspection.actual_unit || 'm³/year'}` : null}
              />
              <ReadonlyField label="Permitted abstraction method" value={inspection.authorized_abstraction_method} />
              <ReadonlyField label="Actual abstraction method" value={inspection.actual_abstraction_method} />
            </div>
            <div className="mt-4">
              <ReadonlyField label="Measurement device type" value={inspection.measurement_device_type} />
            </div>
          </>
        )}
      </SectionShell>

      {/* Activity Details */}
      {(inspection.activity_type || inspection.activity_starting_date) && (
        <SectionShell title="Activity in which water is used">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ReadonlyField label="Type of activity" value={inspection.activity_type} />
            <ReadonlyField label="Starting date" value={inspection.activity_starting_date} />
          </div>
        </SectionShell>
      )}

      {/* Social & OHS - Employment */}
      <SectionShell title="Social and Gender-Disaggregated Information">
        <div className="space-y-6">
          {/* Check if employment data exists */}
          {!inspection.employment_gender_breakdown && !inspection.ohs_gender_sensitive ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800 dark:text-amber-300">
                  <p className="font-medium">Social & OHS data was not collected for this inspection.</p>
                  <p className="mt-1 text-amber-700 dark:text-amber-400">
                    This may happen if the inspection was created using a different form flow, or if the database migration 
                    <code className="mx-1 px-1 py-0.5 bg-amber-100 dark:bg-amber-900/50 rounded text-xs">20260108000000_extend_inspections_schema.sql</code> 
                    has not been applied.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Employment Table */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 font-medium">
                  Employment Related to Water Use Activity
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
                  return (
                    <div key={key} className="grid grid-cols-[1fr_120px_120px_120px] gap-3 px-4 py-3 border-b last:border-b-0 border-slate-200 dark:border-slate-800">
                      <div className={`text-sm font-medium ${key === "totalWorkers" ? "font-semibold" : ""}`}>{label}</div>
                      <Input disabled value={row.male ?? ""} className="h-10 bg-muted/30" />
                      <Input disabled value={row.female ?? ""} className="h-10 bg-muted/30" />
                      <Input disabled value={row.total ?? ""} className="h-10 bg-muted/30" />
                    </div>
                  );
                })}
              </div>

              {/* OHS Gender Sensitive */}
              <div className="space-y-3">
                <div className="font-medium">Occupational Health and Safety (Gender-Sensitive)</div>
                <YesNoDisplay
                  label="Gender-inclusive safety measures are in place"
                  value={ohs.genderInclusiveSafetyMeasures?.value}
                  remarks={ohs.genderInclusiveSafetyMeasures?.remarks}
                />
                <YesNoDisplay
                  label="Separate Sanitation Facilities"
                  value={ohs.separateSanitationFacilities?.value}
                  remarks={ohs.separateSanitationFacilities?.remarks}
                />
                <YesNoDisplay
                  label="Gender-responsive Grievance Mechanism"
                  value={ohs.genderResponsiveGrievanceMechanism?.value}
                  remarks={ohs.genderResponsiveGrievanceMechanism?.remarks}
                />
              </div>
            </>
          )}
        </div>
      </SectionShell>

      {/* Fees & Reports */}
      <SectionShell title="Fees & Reports">
        <div className="space-y-6">
          {/* Fees */}
          <div>
            <h4 className="font-medium mb-4">Fees Payment</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ReadonlyField label="Payment Verified" value={inspection.fees_payment_verified === true ? "Yes" : inspection.fees_payment_verified === false ? "No" : null} />
              <ReadonlyField label="Amount" value={inspection.fees_payment_amount != null ? formatNum(inspection.fees_payment_amount) : null} />
              <div className="md:col-span-2">
                <ReadonlyField label="Proof of Payment" value={inspection.fees_payment_proof} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Reports */}
          <div>
            <h4 className="font-medium mb-4">Reports</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ReadonlyField label="Reports Submitted" value={inspection.reports_submitted === true ? "Yes" : inspection.reports_submitted === false ? "No" : null} />
              <ReadonlyField label="Submission Date" value={inspection.reports_submission_date} />
              <ReadonlyField label="Reference Number" value={inspection.reports_reference_number} />
              <ReadonlyField label="Proof of Reception" value={inspection.reports_proof} />
            </div>
          </div>
        </div>
      </SectionShell>

      {/* General observations — wastewater (moved out of Permit specifics) */}
      {(inspection.wastewater_system_type || inspection.wastewater_system_effectiveness) && (
        <SectionShell title="General observations — Wastewater management system">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ReadonlyField label="Type of the system" value={inspection.wastewater_system_type} />
            <ReadonlyField label="Effectiveness of the system" value={inspection.wastewater_system_effectiveness} />
          </div>
        </SectionShell>
      )}

      {/* Conclusion & recommendations */}
      <SectionShell title="Conclusion & recommendations">
        <div className="space-y-6">
          <div>
            <Label className="text-sm text-muted-foreground">Water use conflicts</Label>
            <div className="mt-2 p-4 bg-muted/30 rounded-lg border border-slate-200 dark:border-slate-800 min-h-[100px] whitespace-pre-wrap">
              {inspection.water_use_conflicts || "N/A"}
            </div>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">Initiatives to protect environment/catchment</Label>
            <div className="mt-2 p-4 bg-muted/30 rounded-lg border border-slate-200 dark:border-slate-800 min-h-[100px] whitespace-pre-wrap">
              {inspection.catchment_protection_initiatives || "N/A"}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-sm text-muted-foreground">General conclusion</Label>
              <div className="mt-2 p-4 bg-muted/30 rounded-lg border border-slate-200 dark:border-slate-800 min-h-[120px] whitespace-pre-wrap">
                {inspection.general_conclusion || "N/A"}
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Recommendations from Assessor</Label>
              <div className="mt-2 p-4 bg-muted/30 rounded-lg border border-slate-200 dark:border-slate-800 min-h-[120px] whitespace-pre-wrap">
                {normalizeInspectionRecommendation(inspection.recommendations) ||
                  inspection.recommendations ||
                  "N/A"}
              </div>
            </div>
          </div>
        </div>
      </SectionShell>

      {/* Documents Section */}
      <SectionShell title="Documents" description="Uploaded inspection documents and evidence">
        {Array.isArray(inspection.inspection_documents) && inspection.inspection_documents.length > 0 ? (
          <div className="space-y-3">
            {inspection.inspection_documents.map((doc: any, idx: number) => {
              const resolvedUrl: string | null =
                (typeof doc?.url === "string" && doc.url ? doc.url : null) ||
                (typeof doc?.path === "string" && doc.path ? getDocumentUrl(doc.path) : null);

              const Shell = ({ children }: { children: React.ReactNode }) =>
                resolvedUrl ? (
                  <a
                    href={resolvedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer group"
                  >
                    {children}
                  </a>
                ) : (
                  <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/10 opacity-70">
                    {children}
                  </div>
                );

              return (
                <Shell key={doc.id || idx}>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 transition-colors">
                      <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {doc.name || doc.fileName || `Document ${idx + 1}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {doc.category ? <span className="capitalize">{String(doc.category).replace(/_/g, " ")}</span> : null}
                        {doc.size ? <span className="ml-2">• {(Number(doc.size) / 1024).toFixed(1)} KB</span> : null}
                        {doc.uploadedAt ? <span className="ml-2">• {formatDate(doc.uploadedAt)}</span> : null}
                      </p>
                      {!resolvedUrl ? <p className="text-xs text-muted-foreground mt-1">No file URL available</p> : null}
                    </div>
                  </div>
                  {resolvedUrl ? (
                    <div className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink className="h-4 w-4" />
                      <span>Open</span>
                    </div>
                  ) : null}
                </Shell>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No documents uploaded for this inspection</p>
          </div>
        )}
      </SectionShell>

      {/* Follow-up Information */}
      {inspection.follow_up_required && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="text-amber-800 dark:text-amber-300">Follow-up Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-amber-700 dark:text-amber-400">
              This inspection requires follow-up action.
              {inspection.follow_up_date && (
                <span className="font-medium"> Due: {formatDate(inspection.follow_up_date)}</span>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Overall Compliance Status */}
      {complianceStatus && (
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle>Overall Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {getStatusIcon(complianceStatus)}
              {getStatusBadge(complianceStatus)}
              <span className="text-sm text-muted-foreground capitalize">
                {complianceStatus.replace(/_/g, ' ')}
              </span>
            </div>
            {inspection.overall_score && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-muted-foreground">Score:</span>
                  <span className="text-lg font-bold">{inspection.overall_score}/10</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all" 
                    style={{ width: `${(inspection.overall_score / 10) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
} 