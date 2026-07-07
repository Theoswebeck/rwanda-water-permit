"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractTermsPreview } from "@/components/contract/contract-terms-preview";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { geometryToCoordinatePolygons } from "@/lib/geoUtils";
import { getApplicationWorkflowKind } from "@/lib/application-workflow";
import { 
  ArrowLeft, 
  X, 
  Send, 
  AlertTriangle,
  Loader2,
  XCircle,
  ClipboardCheck,
  CheckCircle,
  Check
} from "lucide-react";
import Link from "next/link";
import { SmartBackButton } from "@/components/ui/back-button";
import { staffListHref } from "@/lib/staff-nav";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { supabase, createAuditLog } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";
import { enrichModificationChanges } from "@/lib/application-utils";
import { resolveDocumentFieldToken } from "@/lib/documents/upload-mapping";
import { mergeAdditionalDocumentUrls } from "@/lib/documents/additional-documents";
import { buildSyntheticPermitFromNotes, buildSyntheticRenewalPermit } from "@/lib/permit/build-synthetic-permit";
import type { Application, ApplicationStatus, User as UserType, Document, Review } from "@/types/database";
import { ApplicationComments } from "@/components/shared/ApplicationComments";
import { RegistryPermitComparisonCard } from "@/components/inspection/registry-permit-comparison-card";
import { getPermitReferenceFromApplication } from "@/lib/permit/permit-reference";
import { VerificationStatus } from "@/components/inspection/document-verification";
import { FieldReportUpload, FieldReportFile } from "@/components/inspection/field-report-upload";
import type { VerificationChecklist, RecommendationData } from "@/components/inspection/verification-summary";
import { AssessmentReportForm } from "@/components/inspection/assessment-report-form";
import type { AssessmentReportData, ReportType } from "@/lib/assessment-report-utils";
import {
  determineReportType,
  mergeAssessmentReportData,
  normalizeAssessmentReportData,
  prefillAssessmentReportFromApplication,
} from "@/lib/assessment-report-utils";
import {
  getFormattedCellOptions,
  getFormattedDistrictOptions,
  getFormattedProvinceOptions,
  getFormattedSectorOptions,
  getFormattedVillageOptions,
} from "@/lib/rwanda-administrative-data";
import { AssessorRecommendations } from "@/components/inspection/assessor-recommendations";
import { type PermitWithApplication } from "@/components/dashboard/permit-select-for-renewal";
import { PermitPreviewFrame } from "@/components/staff/permit-preview-frame";
import { DocumentTextEditor } from "@/components/staff/document-text-editor";

function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function parseResidenceParts(residence?: string) {
  const parts = String(residence || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    province: parts.at(-1) || "",
    district: parts.at(-2) || "",
    sector: parts.at(-3) || "",
    cell: parts.at(-4) || "",
    village: parts.length > 4 ? parts.slice(0, -4).join(", ") : "",
  };
}

function optionExists(options: Array<{ value: string; label: string }>, value: string) {
  return options.some((option) => option.value === value);
}

function isValidRwandaResidence(residence?: string) {
  const parsed = parseResidenceParts(residence);
  if (!optionExists(getFormattedProvinceOptions(), parsed.province)) return false;
  if (!optionExists(getFormattedDistrictOptions(parsed.province), parsed.district)) return false;
  if (!optionExists(getFormattedSectorOptions(parsed.province, parsed.district), parsed.sector)) return false;
  if (!optionExists(getFormattedCellOptions(parsed.province, parsed.district, parsed.sector), parsed.cell)) return false;
  // Village is optional: applicants may leave the office-address village blank, so it isn't always
  // present to prefill here. Only validate it when a value is provided.
  if (parsed.village && !optionExists(getFormattedVillageOptions(parsed.province, parsed.district, parsed.sector, parsed.cell), parsed.village)) {
    return false;
  }
  return true;
}

function hasInvalidPhoneCharacters(value?: string) {
  const text = String(value || "").trim();
  return text.length > 0 && /[^0-9+\-()\s]/.test(text);
}

function isNumericText(value?: string) {
  const text = String(value || "").trim();
  return text.length > 0 && Number.isFinite(Number(text));
}

function isVolumeRateUnit(value: unknown) {
  return value === "m3/day" || value === "m3/year";
}

function withDefaultVolumeRateUnits(data: Partial<AssessmentReportData>) {
  const next: Partial<AssessmentReportData> = { ...data };
  if (!next.sourceFlowValue && next.sourceFlowM3Day) {
    next.sourceFlowValue = next.sourceFlowM3Day;
  }
  if ((next.sourceFlowValue || next.sourceFlowM3Day) && !isVolumeRateUnit(next.sourceFlowUnit)) {
    next.sourceFlowUnit = "m3/day";
  }
  if (next.flowRateM3Day && !isVolumeRateUnit(next.flowRateM3DayUnit)) {
    next.flowRateM3DayUnit = "m3/year";
  }
  if (next.flowRateLps && !isVolumeRateUnit(next.flowRateUnit)) {
    next.flowRateUnit = "m3/day";
  }
  if (next.availableWaterQ && !isVolumeRateUnit(next.availableWaterQUnit)) {
    next.availableWaterQUnit = "m3/day";
  }
  if (next.waterDemandD && !isVolumeRateUnit(next.waterDemandDUnit)) {
    next.waterDemandDUnit = "m3/day";
  }
  if (next.existingDemandED && !isVolumeRateUnit(next.existingDemandEDUnit)) {
    next.existingDemandEDUnit = "m3/day";
  }
  if (next.remainingWater && !isVolumeRateUnit(next.remainingWaterUnit)) {
    next.remainingWaterUnit = "m3/day";
  }
  return next;
}

// Lazy load the ApplicationForm component
const ApplicationForm = dynamic(
  () => import("@/components/dashboard/application-form-new"),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-sm text-muted-foreground">Loading application form...</span>
      </div>
    ),
    ssr: false
  }
);

// Lazy load the PermitRenewalForm component for renewal applications
const PermitRenewalForm = dynamic(
  () => import("@/components/dashboard/permit-renewal-form").then(mod => ({ default: mod.PermitRenewalForm })),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        <span className="ml-3 text-sm text-muted-foreground">Loading renewal form...</span>
      </div>
    ),
    ssr: false
  }
);

// Lazy load the PermitTransferForm component for transfer applications
const PermitTransferForm = dynamic(
  () => import("@/components/dashboard/permit-transfer-form").then(mod => ({ default: mod.PermitTransferForm })),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span className="ml-3 text-sm text-muted-foreground">Loading transfer details...</span>
      </div>
    ),
    ssr: false
  }
);

interface ApplicationWithRelations extends Application {
  applicant?: UserType;
  documents?: Document[];
  reviews?: Review[];
}

type DocReviewMeta = {
  eligibilityConfirmed: boolean;
  eligibilityConfirmedAt?: string;
  completenessConfirmed: boolean;
  completenessConfirmedAt?: string;
  registryPermitAcknowledged?: boolean;
  registryPermitAcknowledgedAt?: string;
};

// Transform Application data back to form format for viewing
function mapApplicationToFormData(application: Application, userProfile?: any): any {
  const formData: any = {};
  
  // Parse internal notes to extract form-specific data
  // Try to parse as JSON first (new format), fallback to legacy format
  let storedFormData: any = {};
  let legacyNotesMap: Record<string, string> = {};
  
  const notes = application.internal_notes || '';
  
  try {
    // Try parsing as JSON (new comprehensive format)
    storedFormData = JSON.parse(notes);
    console.log('✅ Successfully parsed stored form data from JSON');
  } catch (error) {
    // Fallback to legacy format parsing
    console.log('📄 Using legacy notes format parsing');
    const notesParts = notes.split(' | ');
    notesParts.forEach(part => {
      const [key, value] = part.split(': ');
      if (key && value) {
        legacyNotesMap[key] = value;
      }
    });
  }
  
  // If we have comprehensive stored data, use it directly
  if (Object.keys(storedFormData).length > 0 && storedFormData.fullNameApplicant !== undefined) {
    // New format: restore all form fields directly from stored data
    console.log('🔄 Restoring form data from comprehensive JSON storage');
    
    // Copy all stored form data
    Object.assign(formData, storedFormData);
    
    // Override with profile data for contact information if available
    if (userProfile) {
      formData.telephoneContact = userProfile.phone || userProfile.company_phone || formData.telephoneContact;
      formData.emailAddress = userProfile.email || formData.emailAddress;
    }
    
    // Ensure polygons are properly formatted (back-compat with legacy waterSourceCoordinates)
    if (Array.isArray(formData.waterSourcePolygons) && formData.waterSourcePolygons.length > 0) {
      // ok
    } else if (Array.isArray(formData.waterSourceCoordinates)) {
      formData.waterSourcePolygons = [formData.waterSourceCoordinates];
    } else {
      formData.waterSourcePolygons = [
        [
          { latitude: "", longitude: "" },
          { latitude: "", longitude: "" },
          { latitude: "", longitude: "" }
        ]
      ];
    }

    // Backfill critical fields from top-level application columns when internal_notes is incomplete
    const provinceReverseMap: Record<string, string> = {
      'Kigali': 'Kigali',
      'Northern': 'North',
      'Southern': 'South',
      'Eastern': 'East',
      'Western': 'West'
    };

    // Office address (fallback)
    if (!formData.officeProvince) formData.officeProvince = provinceReverseMap[application.province] || application.province || '';
    if (!formData.officeDistrict) formData.officeDistrict = application.district || '';
    if (!formData.officeSector) formData.officeSector = application.sector || '';
    if (!formData.officeCell) formData.officeCell = application.cell || '';
    if (!formData.officeVillage) formData.officeVillage = application.village || '';

    // Water source basics (fallback)
    if (!formData.nameSourceWater) formData.nameSourceWater = application.water_body_name || '';
    if (!formData.tributaryToMain) formData.tributaryToMain = application.tributary_name || '';

    // Water source location (fallback)
    if (!formData.waterSourceProvince) formData.waterSourceProvince = provinceReverseMap[application.province] || application.province || '';
    if (!formData.waterSourceDistrict) formData.waterSourceDistrict = application.district || '';
    if (!formData.waterSourceSector) formData.waterSourceSector = application.sector || '';
    if (!formData.waterSourceCell) formData.waterSourceCell = application.cell || '';
    if (!formData.waterSourceVillage) formData.waterSourceVillage = application.village || '';

    // Abstraction point (fallback) — derive from Point geometry when present
    try {
      const geom: any = (application as any).coordinates;
      if ((!formData.waterSourceLatitude || !formData.waterSourceLongitude) && geom?.type === 'Point' && Array.isArray(geom.coordinates)) {
        const [lng, lat] = geom.coordinates as [number, number];
        if (!formData.waterSourceLatitude) formData.waterSourceLatitude = String(lat);
        if (!formData.waterSourceLongitude) formData.waterSourceLongitude = String(lng);
      }
    } catch {}
    
  } else {
    // Legacy format: reconstruct from basic database fields and legacy notes
    console.log('🔄 Restoring form data from legacy format');
    
    // Basic applicant information (using internal notes and project title)
    formData.fullNameApplicant = application.project_title?.replace(' Water Permit Application', '') || 'Draft Application';
    formData.categoryApplicant = legacyNotesMap['Category']?.toLowerCase() || 'individual';
  
    // Office address (from application location) - reverse the province mapping
    const provinceReverseMap: Record<string, string> = {
      'Kigali': 'Kigali',
      'Northern': 'North',
      'Southern': 'South',
      'Eastern': 'East',
      'Western': 'West'
    };
    formData.officeProvince = provinceReverseMap[application.province] || application.province || '';
    formData.officeDistrict = application.district || '';
    formData.officeSector = application.sector || '';
    formData.officeCell = application.cell || '';
    formData.officeVillage = application.village || '';
    
    // Contact information
    formData.telephoneContact = userProfile?.phone || userProfile?.company_phone || '';
    formData.emailAddress = userProfile?.email || legacyNotesMap['Contact']?.replace('Not provided', '') || '';
  
    // Water source information
    const waterSourceMap: Record<string, string> = {
      'surface_water': 'stream_river',
      'groundwater': 'borehole'
    };
    formData.waterSourceType = waterSourceMap[application.water_source] || 'stream_river';
    formData.nameSourceWater = application.water_body_name || '';
    formData.tributaryToMain = application.tributary_name || '';
    
    // Water source location
    formData.waterSourceProvince = provinceReverseMap[application.province] || application.province || '';
    formData.waterSourceDistrict = application.district || '';
    formData.waterSourceSector = application.sector || '';
    formData.waterSourceCell = application.cell || '';
    formData.waterSourceVillage = application.village || '';
  
    // Coordinates - normalize Polygon/MultiPolygon/Point into waterSourcePolygons
    try {
      const polys = geometryToCoordinatePolygons(application.coordinates);
      formData.waterSourcePolygons =
        polys && polys.length > 0
          ? polys
          : [
              [
                { latitude: "", longitude: "" },
                { latitude: "", longitude: "" },
                { latitude: "", longitude: "" }
              ]
            ];
    } catch (error) {
      console.warn('Error parsing coordinates:', error);
      formData.waterSourcePolygons = [
        [
          { latitude: "", longitude: "" },
          { latitude: "", longitude: "" },
          { latitude: "", longitude: "" }
        ]
      ];
    }
  
    // Water reliability
    formData.waterReliability = 'water_always_available';
    
    // Intended activities - reverse map from water_purpose
    const purposeToActivity: Record<string, string> = {
      'domestic': 'water_supply',
      'irrigation': 'irrigation',
      'fish_farming_lakes': 'fish_farming_lakes',
      'fish_farming_ponds': 'fish_farming_ponds',
      'industrial': 'industry',
      'electricity_generation': 'electricity_generation',
      'mining': 'mining',
      'recreation': 'recreation_activities',
      'port_construction': 'port_construction',
      'livestock': 'livestock'
    };
    
    let mappedActivity = purposeToActivity[application.water_purpose] || 'water_supply';
    if (Array.isArray((application as any).intended_activities) && (application as any).intended_activities.length > 0) {
      formData.intendedActivities = (application as any).intended_activities;
      mappedActivity = (application as any).intended_activities[0] || mappedActivity;
    } else {
      formData.intendedActivities = [mappedActivity];
    }
    
    // Water abstraction details
    formData.waterAbstractionDetails = [{
      activity: mappedActivity,
      flowRate: '',
      flowRateUnit: 'm³/s',
      maxAverageYearly: application.estimated_usage_volume || 0,
      abstractionMethod: application.water_taking_method || 'pump'
    }];
    
    // Land ownership
    formData.ownsAllLand = true;
    formData.hasLandAccess = true;
    
    // Annexes
    if (application.electricity_generation_capacity) {
      formData.annexF_electricityDetails = application.electricity_generation_capacity;
    }
    if (application.mining_operations_type) {
      formData.annexG_miningDetails = application.mining_operations_type;
    }
  
    // Certification
    formData.certificationAgreement = true;
  }

  // Backfill applicant category from the account profile when the stored form
  // value is missing/empty/invalid. Some older submissions persisted an empty
  // categoryApplicant in internal_notes (save-time race before the profile
  // loaded), which fails the form's enum validation. The applicant's
  // account_type is the source of truth, so trust it over a blank stored value.
  const VALID_CATEGORIES = [
    "individual",
    "company",
    "cooperative",
    "organization",
    "institution",
    "ngo_association",
    "other",
  ];
  const storedCategory = String(formData.categoryApplicant ?? "").trim();
  if (!VALID_CATEGORIES.includes(storedCategory)) {
    const accountType = String(application.applicant?.account_type ?? "").trim();
    if (VALID_CATEGORIES.includes(accountType)) {
      formData.categoryApplicant = accountType;
    }
  }

  return formData;
}

export default function AssessmentApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [showSendToReviewDialog, setShowSendToReviewDialog] = useState(false);
  
  // ApplicationForm state
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});
  
  // Renewal permit state (for renewal applications)
  const [renewalPermit, setRenewalPermit] = useState<PermitWithApplication | null>(null);
  const [loadingRenewalPermit, setLoadingRenewalPermit] = useState(false);
  const [renewalRecommendedDurationYears, setRenewalRecommendedDurationYears] = useState<number | undefined>(undefined);
  const [renewalRecommendedVolumeM3, setRenewalRecommendedVolumeM3] = useState<number | undefined>(undefined);

  // Transfer permit state (for transfer applications)
  const [transferPermit, setTransferPermit] = useState<PermitWithApplication | null>(null);
  const [loadingTransferPermit, setLoadingTransferPermit] = useState(false);
  const [transferFormData, setTransferFormData] = useState<any>(null);
  const [isTransferApp, setIsTransferApp] = useState(false);
  const [isModificationApp, setIsModificationApp] = useState(false);
  const [originalModificationApp, setOriginalModificationApp] = useState<any>(null);

  // Gate flag: did the type-specific permit-length seeder run yet?
  const [permitLengthSeeded, setPermitLengthSeeded] = useState(false);
  // Current permit dates for modification/transfer apps — used by the
  // permit-length seeder to compute "remaining validity" defaults.
  const [currentPermitDates, setCurrentPermitDates] = useState<{
    issued_date: string | null;
    expiry_date: string | null;
  } | null>(null);
  const [currentPermitLoaded, setCurrentPermitLoaded] = useState(false);

  // Assessment State
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [documentVerifications, setDocumentVerifications] = useState<Record<string, { status: VerificationStatus; notes: string }>>({});
  const [docReviewMeta, setDocReviewMeta] = useState<DocReviewMeta>({
    eligibilityConfirmed: false,
    completenessConfirmed: false,
  });
  
  // Field Report State
  const [fieldReportFiles, setFieldReportFiles] = useState<FieldReportFile[]>([]);
  const [fieldReportSummary, setFieldReportSummary] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [assessmentSubmittedDate, setAssessmentSubmittedDate] = useState("");
  
  // Verification Checklist State
  const [checklist, setChecklist] = useState<VerificationChecklist>({
    locationVerified: false,
    waterSourceAccessible: false,
    environmentalImpactAssessed: false,
    technicalFeasibilityConfirmed: false,
    infrastructureAdequate: false
  });
  
  // Recommendation State
  const [recommendation, setRecommendation] = useState<RecommendationData>({
    recommendation: null,
    explanationText: ""
  });

  // Assessor Adjustments State
  const [assessorPermitLength, setAssessorPermitLength] = useState<number | undefined>(undefined);
  const [permitLengthSaving, setPermitLengthSaving] = useState(false);
  const [assessorRecommendedVolume, setAssessorRecommendedVolume] = useState<number | undefined>(undefined);
  const [volumeSaving, setVolumeSaving] = useState(false);
  const [assessorRecommendedPumpingRateM3Day, setAssessorRecommendedPumpingRateM3Day] = useState<number | undefined>(undefined);
  const [pumpingRateSaving, setPumpingRateSaving] = useState(false);
  const [coordinatesSaving, setCoordinatesSaving] = useState(false);
  const [bulkNetworksSaving, setBulkNetworksSaving] = useState(false);
  // Bumped after each successful assessor save (document-overrides, duration,
  // or volume) so the permit preview iframe refetches the latest PDF.
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const bumpPreviewRefresh = useCallback(() => {
    setPreviewRefreshKey((k) => k + 1);
  }, []);
  
  // Original requested values (from applicant submission - read-only)
  const [requestedDurationYears, setRequestedDurationYears] = useState<number | undefined>(undefined);
  const [requestedVolumeM3, setRequestedVolumeM3] = useState<number | undefined>(undefined);
  const [requestedPumpingRateM3Day, setRequestedPumpingRateM3Day] = useState<number | undefined>(undefined);

  // Assessment Report State (template-backed)
  const [assessmentReportData, setAssessmentReportData] = useState<Partial<AssessmentReportData>>({});
  // Bulk water supply network rows (assessor can edit values only)
  const [assessorBulkNetworks, setAssessorBulkNetworks] = useState<import("@/types/database").BulkNetworkRow[]>([]);

  // Registry permit verification state
  const [registryPermitAcknowledged, setRegistryPermitAcknowledged] = useState(false);

  // Prevent accidental double-submits / re-entrancy (fast double-clicks, etc.)
  const actionInFlightRef = useRef(false);
  // Autosave control (prevents losing Field Report inputs on refresh)
  const hasHydratedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const lastAutoSavedSnapshotRef = useRef<string>("");
  const [activeTab, setActiveTab] = useState<string>("");
  const tabTouchedRef = useRef(false);

  // Allow assessment edits while the application is actively under assessment.
  // Once it's forwarded to the next stage (pending_review or beyond) it must be view-only.
  const isEditableAssessment =
    application?.status === "pending_assessment" ||
    application?.status === "under_review" ||
    application?.status === "returned_to_assessment";
  const isReadOnly = application ? !isEditableAssessment : true;

  const permitRef = application ? getPermitReferenceFromApplication(application) : null;
  const isUnlinkedPermit = permitRef?.source === "registry_unlinked";

  // Groundwater detection: derived from the loaded application's internal_notes.
  const isGroundwater = (() => {
    try {
      const raw = application?.internal_notes;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw && typeof raw === "object" ? raw : null);
      return (parsed as any)?.methodOfWaterAbstraction === "groundwater";
    } catch {
      return false;
    }
  })();

  const defaultTabValue = "application_details";
  const docReviewLocked = !!docReviewMeta.completenessConfirmed;
  const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const reportTypeForAssessment: ReportType = (() => {
    let wuc: string | null = null;
    try {
      const notes = application?.internal_notes;
      if (typeof notes === "string") {
        const parsed = JSON.parse(notes);
        wuc = parsed?.waterUseCategory ?? null;
      } else if (notes && typeof notes === "object") {
        wuc = (notes as any)?.waterUseCategory ?? null;
      }
    } catch {}
    return determineReportType(
      ((application as any)?.intended_activities as string[] | null | undefined) || null,
      application?.water_purpose || null,
      wuc
    );
  })();
  const missingFieldReportRequirements = (() => {
    if (isReadOnly || isTransferApp) return [] as string[];
    const missing: string[] = [];
    // District Water Supply (is_bulk) hides assessment sections 2–5, so the fields in those
    // sections are not required to complete the report.
    const isBulk = !!(application as any)?.is_bulk;

    if (!inspectionDate) missing.push("Field Visit Details: Assessment date is required");

    if (!isBulk) {
    if (reportTypeForAssessment === "abstraction") {
      const sourceFlowValue = assessmentReportData.sourceFlowValue ?? assessmentReportData.sourceFlowM3Day;
      const sourceFlowUnit = assessmentReportData.sourceFlowUnit ?? "m3/day";
      if (!isNumericText(sourceFlowValue)) missing.push("Section 2: Flow of the water source value (number)");
      if (!isVolumeRateUnit(sourceFlowUnit)) {
        missing.push("Section 2: Flow of the water source unit (m3/day or m3/year)");
      }
      // "Amount of water to be abstracted" (Section 3) is removed from the groundwater assessment
      // report, so its fields are not rendered and must not be required for groundwater.
      if (!isGroundwater) {
        if (!isNumericText(assessmentReportData.flowRateM3Day)) missing.push("Section 4: Amount of water to be abstracted value (number)");
        if (!isVolumeRateUnit(assessmentReportData.flowRateM3DayUnit ?? "m3/year")) {
          missing.push("Section 4: Amount of water to be abstracted unit (m3/day or m3/year)");
        }
        if (!isNumericText(assessmentReportData.flowRateLps)) missing.push("Section 4: Flow rate value (number)");
        if (!isVolumeRateUnit(assessmentReportData.flowRateUnit ?? "m3/day")) {
          missing.push("Section 4: Flow rate unit (m3/day or m3/year)");
        }
      }
      if (!hasText(assessmentReportData.waterBalanceDescription)) missing.push("Section 5: Description of the water balance");
      if (!isNumericText(assessmentReportData.availableWaterQ)) missing.push("Section 5: Available water (Q) value (number)");
      if (!isVolumeRateUnit(assessmentReportData.availableWaterQUnit ?? "m3/day")) missing.push("Section 5: Available water (Q) unit (m3/day or m3/year)");
      if (!isNumericText(assessmentReportData.waterDemandD)) missing.push("Section 5: Water demand (D) value (number)");
      if (!isVolumeRateUnit(assessmentReportData.waterDemandDUnit ?? "m3/day")) missing.push("Section 5: Water demand (D) unit (m3/day or m3/year)");
      if (!isNumericText(assessmentReportData.existingDemandED)) missing.push("Section 5: Existing demand (ED) value (number)");
      if (!isVolumeRateUnit(assessmentReportData.existingDemandEDUnit ?? "m3/day")) missing.push("Section 5: Existing demand (ED) unit (m3/day or m3/year)");
      if (!isNumericText(assessmentReportData.remainingWater)) missing.push("Section 5: Remaining Water (Q-D-ED) value (number)");
      if (!isVolumeRateUnit(assessmentReportData.remainingWaterUnit ?? "m3/day")) missing.push("Section 5: Remaining Water (Q-D-ED) unit (m3/day or m3/year)");
      if (!isNumericText(assessmentReportData.waterStorage)) missing.push("Section 5: Water Storage (m3)");
      if (!hasText(assessmentReportData.waterUseConflict)) missing.push("Section 5: Water use conflict");
    } else {
      if (!hasText(assessmentReportData.surfaceAreaHa)) missing.push("Section 4: Surface area");
      if (!hasText(assessmentReportData.existingWaterUses)) missing.push("Section 5: Existing water uses");
      if (!hasText(assessmentReportData.waterUseConflict)) missing.push("Section 5: Water use conflict");
    }

    if (!hasText(assessmentReportData.wastewaterSystemDescription)) {
      missing.push("Section 6: Wastewater system description");
    }
    if (!hasText(assessmentReportData.pollutionDescription)) {
      missing.push("Section 6: Pollution description");
    }
    } // end !isBulk: assessment sections 2–5 are hidden for District Water Supply
    if (hasInvalidPhoneCharacters(assessmentReportData.contactTel)) {
      missing.push("Section 1: Contact telephone must not contain letters or other text");
    }
    if (!isValidRwandaResidence(assessmentReportData.residence)) {
      missing.push("Section 1: Residence must use valid Rwanda Province, District, Sector, and Cell values (Village optional)");
    }
    if (!recommendation.recommendation) {
      missing.push("Section 8: Assessor recommendation");
    }
    if (recommendation.recommendation === "no" && !hasText(recommendation.explanationText)) {
      missing.push("Section 8: Explanation for recommendation");
    }
    // Groundwater applications require the assessor to explicitly set a recommended pumping rate.
    // Renewals are exempt: their recommended values are inherited from the source permit and the
    // pumping-rate save handler is disabled for renewals (requiring it here would deadlock).
    if (isGroundwater && !(application as any).is_renewal) {
      const hasPumpingRate =
        typeof assessorRecommendedPumpingRateM3Day === 'number' &&
        Number.isFinite(assessorRecommendedPumpingRateM3Day) &&
        assessorRecommendedPumpingRateM3Day > 0;
      if (!hasPumpingRate) {
        missing.push("Assessor Recommendations: Recommended pumping rate (m³/day) is required for groundwater applications");
      }
    }
    return missing;
  })();
  // Send-for-review gate: non-modification apps must have an assessor-set
  // permit duration. Modifications inherit their duration from the current
  // permit so no explicit value is required.
  const appTypeForGate = (application?.application_type || "").toLowerCase();
  const durationRequired = appTypeForGate !== "" && appTypeForGate !== "modification";
  const hasValidDuration =
    typeof assessorPermitLength === "number" &&
    Number.isFinite(assessorPermitLength) &&
    assessorPermitLength >= 1 &&
    assessorPermitLength <= 15;
  const durationOk = !durationRequired || hasValidDuration;
  const canSendForReview =
    isReadOnly ||
    ((isTransferApp || missingFieldReportRequirements.length === 0) && durationOk);

  useEffect(() => {
    if (tabTouchedRef.current) return;
    setActiveTab(defaultTabValue);
  }, [defaultTabValue]);

  // Seed `assessorPermitLength` with a type-specific default when the assessor
  // has not yet set one. Runs once per application load; waits for old-permit
  // context to arrive before computing renewal/transfer/modification defaults.
  //
  // Defaults:
  //   new          → no seed; assessor must enter a value manually
  //   renewal      → original term (expiry − issued, in years)
  //   transfer     → remaining validity (old expiry − today, in years)
  //   modification → original term from the current permit
  useEffect(() => {
    if (!application || permitLengthSeeded) return;
    if (hasValidDuration) {
      setPermitLengthSeeded(true);
      return;
    }

    const appTypeLower = (application.application_type || "").toLowerCase();

    if (appTypeLower === "new" || appTypeLower === "") {
      setPermitLengthSeeded(true);
      return;
    }

    // Wait for old-permit context to arrive.
    if (appTypeLower === "transfer" && loadingTransferPermit) return;
    if (appTypeLower === "renewal" && loadingRenewalPermit) return;
    if (appTypeLower === "modification" && !currentPermitLoaded) return;

    const yearsFromRange = (issued?: string | null, expiry?: string | null): number | null => {
      if (!issued || !expiry) return null;
      const s = new Date(`${issued}T00:00:00Z`);
      const e = new Date(`${expiry}T00:00:00Z`);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return null;
      const years = Math.round((e.getTime() - s.getTime()) / (365.25 * 24 * 3600 * 1000));
      return years >= 1 && years <= 15 ? years : null;
    };

    const yearsFromNowUntil = (expiry?: string | null): number | null => {
      if (!expiry) return null;
      const now = new Date();
      const e = new Date(`${expiry}T00:00:00Z`);
      if (Number.isNaN(e.getTime()) || e <= now) return null;
      const years = Math.ceil((e.getTime() - now.getTime()) / (365.25 * 24 * 3600 * 1000));
      return years >= 1 && years <= 15 ? years : null;
    };

    let seededYears: number | null = null;
    if (appTypeLower === "renewal" && renewalPermit) {
      seededYears = yearsFromRange(
        (renewalPermit as any).issued_date,
        (renewalPermit as any).expiry_date,
      );
    } else if (appTypeLower === "transfer" && transferPermit) {
      seededYears = yearsFromNowUntil((transferPermit as any).expiry_date);
    } else if (appTypeLower === "modification" && currentPermitDates) {
      seededYears = yearsFromRange(
        currentPermitDates.issued_date,
        currentPermitDates.expiry_date,
      );
    }

    setPermitLengthSeeded(true);
    if (seededYears !== null) {
      // Persist via the existing adjustment helper so the write path is
      // consistent with manual edits (and keeps proposed_duration_years in sync).
      void savePermitLengthAdjustment(seededYears);
    }
    // savePermitLengthAdjustment is declared later in this component and is
    // stable across renders; intentionally not in the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    application,
    permitLengthSeeded,
    hasValidDuration,
    transferPermit,
    renewalPermit,
    currentPermitDates,
    currentPermitLoaded,
    loadingTransferPermit,
    loadingRenewalPermit,
  ]);

  // Transfer applications do not have an assessment report in staff workflows.
  // If a user somehow lands on the hidden tab (e.g. back/forward nav), force them back to details.
  useEffect(() => {
    if (!isTransferApp) return;
    if (activeTab === "field_report") {
      setActiveTab(defaultTabValue);
    }
  }, [isTransferApp, activeTab, defaultTabValue]);
  
  useEffect(() => {
    const fetchApplicationDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        const applicationNumber = params.id as string;

        const formatFullName = (u?: { first_name?: string | null; last_name?: string | null }) => {
          const first = (u?.first_name || "").trim();
          const last = (u?.last_name || "").trim();
          const full = `${first} ${last}`.trim();
          return full;
        };

        // Current logged-in user (assessor)
        const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        
        // Fetch application with related data
        const { data: appData, error: appError } = await supabase
          .from('applications')
          .select(`
            *,
            applicant:users!applicant_id(*),
            documents(*),
            reviews:reviews!application_id(*)
          `)
          .neq('status', 'draft')
          .neq('status', 'pending_payment')
          .eq('application_number', applicationNumber)
          .single();

        if (appError) throw appError;

        // If there's an assigned inspector, fetch the assigned user information
        let assignedInspectorName = "";
        if (appData.assigned_inspector_id) {
          const { data: assignedUserData } = await supabase
            .from('users')
            .select('first_name, last_name, role')
            .eq('id', appData.assigned_inspector_id)
            .single();
            
          if (assignedUserData) {
            (appData as any).assigned_to_user = assignedUserData;
            assignedInspectorName = formatFullName(assignedUserData);
          }
        }

        setApplication(appData);
        // Reset the permit-length seeder flag so a fresh load re-evaluates
        // type-specific defaults.
        setPermitLengthSeeded(false);

        // Fetch existing assessment if any
        const { data: existingAssessment } = await supabase
          .from('technical_assessments')
          .select('*')
          .eq('application_id', appData.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Keep saved report data for merge later (prefill always wins for app-derived read-only fields)
        const savedAssessmentReportData = normalizeAssessmentReportData(
          (existingAssessment as any)?.assessment_report_data
        );

        // Compute default inspector name (priority: saved assessment -> current logged-in user -> assigned inspector)
        let currentAssessorName = "";
        if (authUser?.id) {
          const { data: currentUserData } = await supabase
            .from('users')
            .select('first_name, last_name')
            .eq('id', authUser.id)
            .maybeSingle();
          currentAssessorName =
            formatFullName(currentUserData || undefined) ||
            (typeof (authUser.user_metadata as any)?.full_name === "string"
              ? String((authUser.user_metadata as any).full_name).trim()
              : "") ||
            (authUser.email || "");
        }

        // If the current user IS the assigned assessor, always use their name
        // (handles reassignment: old assessment may still carry the previous assessor's name)
        const currentUserIsAssignedAssessor =
          !!authUser?.id && !!appData.assigned_assessor_id && authUser.id === appData.assigned_assessor_id;

        const defaultInspectorName = currentUserIsAssignedAssessor
          ? currentAssessorName ||
            (existingAssessment?.inspector_name || "").trim() ||
            assignedInspectorName
          : (existingAssessment?.inspector_name || "").trim() ||
            currentAssessorName ||
            assignedInspectorName;

        // When the assessor was reassigned, force-update even if a previous value exists
        if (defaultInspectorName) {
          if (currentUserIsAssignedAssessor) {
            setInspectorName(defaultInspectorName);
          } else {
            setInspectorName((prev) => (prev ? prev : defaultInspectorName));
          }
        }

        setAssessmentSubmittedDate("");
        if (existingAssessment) {
          setAssessmentId(existingAssessment.id);
          // document_verifications may contain metadata under "__meta"
          const rawDocVerifications: any = existingAssessment.document_verifications || {};
          const meta: any =
            rawDocVerifications && typeof rawDocVerifications === "object"
              ? (rawDocVerifications.__meta as any)
              : undefined;
          const cleaned: Record<string, { status: VerificationStatus; notes: string }> = {
            ...(rawDocVerifications && typeof rawDocVerifications === "object" ? rawDocVerifications : {}),
          };
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete (cleaned as any).__meta;
          setDocumentVerifications(cleaned);
          if (meta && typeof meta === "object") {
            setDocReviewMeta({
              eligibilityConfirmed: !!meta.eligibilityConfirmed,
              eligibilityConfirmedAt: typeof meta.eligibilityConfirmedAt === "string" ? meta.eligibilityConfirmedAt : undefined,
              completenessConfirmed: !!meta.completenessConfirmed,
              completenessConfirmedAt: typeof meta.completenessConfirmedAt === "string" ? meta.completenessConfirmedAt : undefined,
              registryPermitAcknowledged: !!meta.registryPermitAcknowledged,
              registryPermitAcknowledgedAt: typeof meta.registryPermitAcknowledgedAt === "string" ? meta.registryPermitAcknowledgedAt : undefined,
            });
            if (meta.registryPermitAcknowledged) {
              setRegistryPermitAcknowledged(true);
            }
          }
          
          // Restore field report data
          setFieldReportSummary(existingAssessment.field_report_summary || "");
          if (existingAssessment.inspection_date) {
            setInspectionDate(existingAssessment.inspection_date);
          }
          setAssessmentSubmittedDate(
            toDateInputValue(
              existingAssessment.forwarded_at ||
              existingAssessment.updated_at ||
              existingAssessment.created_at
            )
          );
          
          // Restore checklist
          setChecklist({
            locationVerified: existingAssessment.location_verified || false,
            waterSourceAccessible: existingAssessment.water_source_accessible || false,
            environmentalImpactAssessed: existingAssessment.environmental_impact_assessed || false,
            technicalFeasibilityConfirmed: existingAssessment.technical_feasibility_confirmed || false,
            infrastructureAdequate: existingAssessment.infrastructure_adequate || false
          });
          
          // Restore recommendation
          setRecommendation({
            recommendation: existingAssessment.recommendation as "yes" | "no" | null,
            explanationText: existingAssessment.explanation_text || ""
          });

          // Restore field report files
          if (existingAssessment.field_report_files && Array.isArray(existingAssessment.field_report_files)) {
            const files = existingAssessment.field_report_files.map((path: string) => {
              const name = path.split('/').pop() || 'File';
              const timestampMatch = name.match(/^(\d+)-/);
              const uploadedAt = timestampMatch 
                ? new Date(parseInt(timestampMatch[1])).toISOString() 
                : existingAssessment.created_at;
                
              return {
                id: Math.random().toString(36).substr(2, 9),
                name: name.replace(/^\d+-/, ''),
                path: path,
                size: 0, // Size is not stored, but could be fetched if needed
                type: name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', // Approximation
                uploadedAt: uploadedAt
              };
            });
            setFieldReportFiles(files);
          }
        }

        // Transform application data to form format
        const formData = mapApplicationToFormData(appData, null);

        // Pass bulk networks from DB column (not stored in internal_notes)
        if ((appData as any).is_bulk) {
          formData.bulk_networks = (appData as any).bulk_networks ?? formData.bulk_networks ?? [];
          formData.bulk_district = (appData as any).bulk_district ?? formData.bulk_district ?? '';
        }

        // Handle transfer/modification applications: load transfer data and original permit details
        const parsedNotes = (() => {
          try {
            return appData.internal_notes ? JSON.parse(appData.internal_notes) : null;
          } catch {
            return null;
          }
        })();
        const workflowKind = getApplicationWorkflowKind(appData as any);
        const transferDetected = workflowKind === "transfer";
        const modificationDetected = workflowKind === "modification";
        setIsTransferApp(transferDetected);
        setIsModificationApp(modificationDetected);

        // For modification apps: fetch the original application to reconstruct missing previous values
        if (modificationDetected) {
          const origAppId = (appData as any).modified_from_application_id || parsedNotes?.originalApplicationId;
          if (!origAppId) {
            setCurrentPermitLoaded(true);
          }
          if (origAppId) {
            try {
              const { data: origApp } = await supabase
                .from('applications')
                .select('internal_notes, proposed_duration_years, intended_activities')
                .eq('id', origAppId)
                .maybeSingle();
              setOriginalModificationApp(origApp || null);
            } catch (err) {
              console.error('⚠️ Could not fetch original application for modification enrichment:', err);
            }
            // Also fetch the current permit dates so the permit-length seeder
            // can inherit the current permit's term for modifications.
            try {
              const { data: currentPermit } = await supabase
                .from('permits')
                .select('issued_date, expiry_date')
                .eq('application_id', origAppId)
                .maybeSingle();
              if (currentPermit) {
                setCurrentPermitDates({
                  issued_date: (currentPermit as any).issued_date ?? null,
                  expiry_date: (currentPermit as any).expiry_date ?? null,
                });
              }
            } catch (err) {
              console.error('⚠️ Could not fetch current permit for modification:', err);
            } finally {
              setCurrentPermitLoaded(true);
            }
          }
        }

        if (transferDetected) {
          setTransferFormData(parsedNotes?.transferFormData || null);
          const originalPermitId = parsedNotes?.originalPermitId;
          const originalPermitNumber = parsedNotes?.originalPermitNumber;

          if (originalPermitId?.startsWith('manual-')) {
            // Legacy permit not in the permits table — reconstruct from notes.
            setTransferPermit(buildSyntheticPermitFromNotes(parsedNotes) as unknown as PermitWithApplication);
            setLoadingTransferPermit(false);
          } else if (originalPermitId || originalPermitNumber) {
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            setLoadingTransferPermit(true);
            try {
              let permitQuery = supabase
                .from('permits')
                .select(`
                  *,
                  application:applications!application_id (
                    id,
                    project_title,
                    province,
                    district,
                    sector,
                    cell,
                    water_source,
                    water_purpose,
                    applicant:users!applicant_id (
                      id,
                      email,
                      phone,
                      first_name,
                      last_name,
                      id_number,
                      company_name,
                      company_tin,
                      company_address,
                      company_phone,
                      account_type
                    )
                  )
                `);

              if (originalPermitId && UUID_RE.test(originalPermitId)) {
                permitQuery = permitQuery.eq('id', originalPermitId);
              } else if (originalPermitNumber) {
                permitQuery = permitQuery.eq('permit_number', originalPermitNumber);
              }

              const { data: permitData, error: permitError } = await permitQuery.maybeSingle();
              if (permitError) throw permitError;
              setTransferPermit((permitData as PermitWithApplication) || null);
            } catch (permitErr) {
              console.error('Error fetching original permit for transfer:', permitErr);
              setTransferPermit(null);
            } finally {
              setLoadingTransferPermit(false);
            }
          }
        }
        
        // Initialize assessor adjustments
        // IMPORTANT: Only use _assessorAdjustments if an assessment actually exists for THIS application.
        // For modification applications, the form_data may carry stale _assessorAdjustments from the
        // previous submission cycle. We must NOT pre-fill recommended values from those stale adjustments.
        const hasAssessmentForThisApp = !!existingAssessment;
        const assessorAdjustments = hasAssessmentForThisApp ? (formData._assessorAdjustments || {}) : {};
        
        // REQUESTED VALUES for assessor comparison (always current submission values)
        let originalRequestedValues = formData._originalRequestedValues || {};
        
        const currentRequestedDuration = formData.permitLengthYears;
        if (typeof currentRequestedDuration === 'number' && currentRequestedDuration >= 1 && currentRequestedDuration <= 15) {
          setRequestedDurationYears(currentRequestedDuration);
        }
        
        const isConcessionApp = determineReportType(
          appData.intended_activities as string[] | null,
          appData.water_purpose || null,
          formData?.waterUseCategory ?? null
        ) === "concession";
        const currentRequestedVolume = (() => {
          if (isConcessionApp) {
            const dbArea = Number(appData.concession_area);
            if (Number.isFinite(dbArea) && dbArea > 0) return dbArea;
            const genericArea = Number(formData.concessionArea);
            if (Number.isFinite(genericArea) && genericArea > 0) return genericArea;
            const fishHa = Number(formData.fishLakeAreaHectares);
            if (Number.isFinite(fishHa) && fishHa > 0) return fishHa;
            const recM2 = Number(formData.recreationConcessionAreaM2);
            if (Number.isFinite(recM2) && recM2 > 0) return Number((recM2 / 10000).toFixed(4));
            return undefined;
          }
          return formData.waterAbstractionDetails?.[0]?.maxAverageYearly
            || appData.max_yearly_volume_m3
            || appData.estimated_usage_volume;
        })();
        if (typeof currentRequestedVolume === 'number' && Number.isFinite(currentRequestedVolume) && currentRequestedVolume > 0) {
          setRequestedVolumeM3(currentRequestedVolume);
        }

        // Requested pumping rate (groundwater only): flowRate on waterAbstractionDetails[0]
        const currentRequestedPumpingRate = (() => {
          const n = Number(formData.waterAbstractionDetails?.[0]?.flowRate);
          return Number.isFinite(n) && n > 0 ? n : undefined;
        })();
        if (currentRequestedPumpingRate !== undefined) {
          setRequestedPumpingRateM3Day(currentRequestedPumpingRate);
        }

        // ASSESSOR RECOMMENDED VALUES (can be modified by assessor — only pre-fill when assessment exists)
        if (hasAssessmentForThisApp) {
          // Assessor permit length: use adjustment if available, otherwise default to original
          const assessorDuration = assessorAdjustments.permitLengthYears
            || (typeof currentRequestedDuration === 'number' ? currentRequestedDuration : undefined);
          if (typeof assessorDuration === 'number' && assessorDuration >= 1 && assessorDuration <= 15) {
            setAssessorPermitLength(assessorDuration);
          }

          // Assessor recommended volume: use adjustment if available, otherwise default to original
          const assessorVolume = assessorAdjustments.recommendedVolumeM3
            || (typeof currentRequestedVolume === 'number' ? currentRequestedVolume : undefined);
          if (typeof assessorVolume === 'number' && Number.isFinite(assessorVolume)) {
            setAssessorRecommendedVolume(assessorVolume);
          }

          // Assessor recommended pumping rate: ONLY seed from a previously-saved assessor adjustment.
          // Do NOT fall back to the applicant's requested rate — the assessor must explicitly set
          // this value (it appears on the permit & contract). Without an explicit save, the gate
          // at approval-check time must remain blocked.
          const assessorPumpingRate = assessorAdjustments.recommendedPumpingRateM3Day;
          if (typeof assessorPumpingRate === 'number' && Number.isFinite(assessorPumpingRate) && assessorPumpingRate > 0) {
            setAssessorRecommendedPumpingRateM3Day(assessorPumpingRate);
          }
        } else {
          console.log('⚠️ No assessment filed yet for this application — assessor recommended values start fresh');
          // Default to requested values for new assessment (assessor can then adjust)
          if (typeof currentRequestedDuration === 'number' && currentRequestedDuration >= 1 && currentRequestedDuration <= 15) {
            setAssessorPermitLength(currentRequestedDuration);
          }
          if (typeof currentRequestedVolume === 'number' && Number.isFinite(currentRequestedVolume)) {
            setAssessorRecommendedVolume(currentRequestedVolume);
          }
          // Recommended pumping rate intentionally NOT pre-seeded from the requested value.
          // The assessor must explicitly enter & save it before approval is allowed.
        }
        
        // Bulk network rows: prefer assessor adjustments, fall back to application's bulk_networks
        if ((appData as any).is_bulk) {
          const adjNetworks = Array.isArray(assessorAdjustments.bulkNetworks) ? assessorAdjustments.bulkNetworks : null;
          const appNetworks = Array.isArray((appData as any).bulk_networks) ? (appData as any).bulk_networks : [];
          setAssessorBulkNetworks(adjNetworks ?? appNetworks);
        }

        // Store original values if not already stored (first time assessor views this)
        if (!formData._originalRequestedValues && (currentRequestedDuration || currentRequestedVolume)) {
          const originals = {
            permitLengthYears: currentRequestedDuration,
            volumeM3: currentRequestedVolume,
            storedAt: new Date().toISOString()
          };
          // We'll save this when assessor makes any adjustment
          formData._originalRequestedValues = originals;
        }

        // Prefill the official assessment report template.
        // For renewals, the read-only assessment source fields must come from the underlying
        // permit application (the one the permit was issued from), not from the renewal wrapper.
        let reportSourceApplication: ApplicationWithRelations = appData as ApplicationWithRelations;
        let reportSourceFormData: any = formData;
        let reportSourceDocuments: Document[] = Array.isArray(appData.documents) ? appData.documents : [];
        let renewalSurfaceAreaFallback: { value: string; unit: string } | null = null;
        const renewalPermitId = (appData as any).renewed_from_permit_id as string | undefined;
        if ((appData as any).is_renewal === true && renewalPermitId) {
          try {
            const { data: renewedFromPermitRaw, error: renewedFromPermitError } = await supabase
              .from("permits")
              .select("application_id, water_allowance, allowance_unit")
              .eq("id", renewalPermitId)
              .maybeSingle();
            const renewedFromPermit = renewedFromPermitRaw as
              | { application_id?: string; water_allowance?: number; allowance_unit?: string }
              | null;

            if (renewedFromPermitError) {
              console.error("❌ Failed to resolve source permit for renewal report prefill:", renewedFromPermitError);
            } else if (renewedFromPermit?.application_id) {
              const allowanceValue =
                typeof renewedFromPermit.water_allowance === "number" && Number.isFinite(renewedFromPermit.water_allowance)
                  ? renewedFromPermit.water_allowance
                  : undefined;
              const allowanceUnit = typeof renewedFromPermit.allowance_unit === "string"
                ? renewedFromPermit.allowance_unit.trim().toLowerCase()
                : "";
              if (typeof allowanceValue === "number" && allowanceValue > 0) {
                const isAreaUnit =
                  allowanceUnit.includes("ha") ||
                  allowanceUnit.includes("hectare") ||
                  allowanceUnit.includes("m2") ||
                  allowanceUnit.includes("m²") ||
                  allowanceUnit.includes("square");
                if (isAreaUnit) {
                  renewalSurfaceAreaFallback = {
                    value: String(allowanceValue),
                    unit:
                      allowanceUnit.includes("m2") || allowanceUnit.includes("m²") || allowanceUnit.includes("square")
                        ? "m²"
                        : "Ha",
                  };
                }
              }

              const { data: sourceApplication, error: sourceApplicationError } = await supabase
                .from("applications")
                .select(`
                  *,
                  applicant:users!applicant_id(*),
                  documents(*)
                `)
                .eq("id", renewedFromPermit.application_id)
                .maybeSingle();

              if (sourceApplicationError) {
                console.error("❌ Failed to load source application for renewal report prefill:", sourceApplicationError);
              } else if (sourceApplication) {
                reportSourceApplication = sourceApplication as ApplicationWithRelations;
                reportSourceFormData = mapApplicationToFormData(
                  reportSourceApplication,
                  (reportSourceApplication as any).applicant
                );
                reportSourceDocuments = Array.isArray((reportSourceApplication as any).documents)
                  ? ((reportSourceApplication as any).documents as Document[])
                  : [];
                console.log("✅ Renewal assessment report prefill uses source permit application:", renewedFromPermit.application_id);
              } else {
                console.warn("⚠️ Renewal source application not found; using current renewal application for report prefill.");
              }
            }
          } catch (renewalPrefillError) {
            console.error("❌ Unexpected error while loading renewal source application for report prefill:", renewalPrefillError);
          }
        }

        const prefilledReport = prefillAssessmentReportFromApplication(
          reportSourceApplication,
          reportSourceFormData,
          reportSourceDocuments
        );
        if (
          (appData as any).is_renewal === true &&
          (!prefilledReport.surfaceAreaHa || String(prefilledReport.surfaceAreaHa).trim() === "") &&
          renewalSurfaceAreaFallback
        ) {
          prefilledReport.surfaceAreaHa = renewalSurfaceAreaFallback.value;
          prefilledReport.surfaceAreaUnit = renewalSurfaceAreaFallback.unit;
        }
        const mergedReport = mergeAssessmentReportData(prefilledReport, savedAssessmentReportData || null);
        setAssessmentReportData(mergedReport);
        
        // Process documents for form
        const documentMap: Record<string, { url: string; name: string }> = {};
        const currentDocuments = (appData as { documents?: unknown }).documents;
        const documentsForAdditionalLinks = Array.isArray(currentDocuments)
          ? [...currentDocuments]
          : [];
        const processDocsIntoMap = (docs: any[]) => {
          for (const doc of docs) {
            if (!doc.file_path || !doc.name) continue;
            const publicUrl = getDocumentUrl(doc.file_path);
            if (!publicUrl) continue;

            const inferredKey = resolveDocumentFieldToken(String(doc.file_path), String(doc.type || ""));
            if (inferredKey && !String(inferredKey).startsWith("additional_") && !documentMap[inferredKey]) {
              documentMap[inferredKey] = { url: publicUrl, name: doc.name };
            }
          }
        };

        // 1. Process this application's own documents first
        if (appData.documents && Array.isArray(appData.documents)) {
          processDocsIntoMap(appData.documents);
        }

        // 2. For modifications: also load documents from the original application
        if (modificationDetected) {
          const originalAppId = (appData as any).modified_from_application_id || parsedNotes?.originalApplicationId;
          if (originalAppId) {
            try {
              const { data: originalDocs } = await supabase
                .from('documents')
                .select('*')
                .eq('application_id', originalAppId)
                .order('created_at', { ascending: false });
              if (Array.isArray(originalDocs)) {
                documentsForAdditionalLinks.push(...originalDocs);
                processDocsIntoMap(originalDocs);
              }
            } catch (e) {
              console.error('⚠️ Failed to load original application documents:', e);
            }
          }
        }
        
        setInitialFormData(mergeAdditionalDocumentUrls(formData, documentsForAdditionalLinks, getDocumentUrl));
        setInitialDocuments(documentMap);

        // Mark hydrated + seed autosave snapshot so we don't autosave immediately on initial load
        hasHydratedRef.current = true;
        lastAutoSavedSnapshotRef.current = JSON.stringify({
          assessmentReportData: mergedReport,
          fieldReportSummary: existingAssessment?.field_report_summary || "",
          fieldReportFiles: Array.isArray(existingAssessment?.field_report_files)
            ? (existingAssessment?.field_report_files as any[])
            : [],
          checklist: existingAssessment
            ? {
                locationVerified: !!existingAssessment.location_verified,
                waterSourceAccessible: !!existingAssessment.water_source_accessible,
                environmentalImpactAssessed: !!existingAssessment.environmental_impact_assessed,
                technicalFeasibilityConfirmed: !!existingAssessment.technical_feasibility_confirmed,
                infrastructureAdequate: !!existingAssessment.infrastructure_adequate,
              }
            : null,
          recommendation: existingAssessment
            ? {
                recommendation: (existingAssessment.recommendation as any) || null,
                explanationText: existingAssessment.explanation_text || "",
              }
            : null,
          inspectorName: (existingAssessment?.inspector_name || "").trim(),
          inspectionDate: existingAssessment?.inspection_date || "",
        });

      } catch (err) {
        console.error('Error fetching application:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch application');
      } finally {
        setLoading(false);
      }
    };
    
    if (params.id) {
      fetchApplicationDetails();
    }
  }, [params.id]);

  // Load renewal permit data if this is a renewal application
  useEffect(() => {
    const loadRenewalPermit = async () => {
      if (!application) return;
      
      let parsedNotesForRenewal: any = {};
      try {
        const raw = (application as any).internal_notes;
        parsedNotesForRenewal = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
      } catch { /* ignore */ }
      const isRenewal =
        (application as any).is_renewal ||
        (application as any).application_type?.toLowerCase() === "renewal" ||
        parsedNotesForRenewal?.isRenewal === true;
      const permitId = (application as any).renewed_from_permit_id || parsedNotesForRenewal?.originalPermitId;
      const originalPermitNumber = parsedNotesForRenewal?.originalPermitNumber as string | undefined;

      if (!isRenewal || (!permitId && !originalPermitNumber)) {
        setRenewalPermit(null);
        setRenewalRecommendedDurationYears(undefined);
        setRenewalRecommendedVolumeM3(undefined);
        return;
      }
      
      try {
        setLoadingRenewalPermit(true);
        
        let permitQuery = supabase
          .from('permits')
          .select(`
            *,
            application:applications!application_id (
              id,
              application_number,
              project_title,
              province,
              district,
              sector,
              cell,
              village,
              water_source,
              water_purpose,
              water_body_name,
              max_daily_volume_m3,
              max_yearly_volume_m3,
              proposed_duration_years,
              assessor_recommended_volume_m3,
              concession_area,
              internal_notes,
              intended_activities,
              applicant:users!applicant_id (
                id,
                email,
                phone,
                first_name,
                last_name,
                id_number,
                company_name,
                company_tin,
                company_address,
                company_phone,
                account_type
              )
            )
          `);
        if (permitId) {
          permitQuery = permitQuery.eq('id', permitId) as typeof permitQuery;
        } else {
          permitQuery = permitQuery.eq('permit_number', originalPermitNumber!) as typeof permitQuery;
        }
        const { data: permit, error: permitError } = await permitQuery.single();

        if (permitError) {
          // Manual registry permits have no row in the permits table.
          // Reconstruct a synthetic permit from internal_notes using the shared helper.
          const isManualId = typeof permitId === "string" && permitId.startsWith("manual-");
          const permitRef = parsedNotesForRenewal?.permitReference;
          if (isManualId || permitRef) {
            const appApplicant = (application as any)?.applicant || null;
            const syntheticPermit = buildSyntheticRenewalPermit(
              parsedNotesForRenewal as Record<string, unknown>,
              appApplicant,
              (application as any).id,
            );
            setRenewalPermit(syntheticPermit as unknown as PermitWithApplication);
          } else {
            console.error('Error loading renewal permit:', permitError);
          }
        } else {
          const typedPermit = permit as PermitWithApplication;
          setRenewalPermit(typedPermit);

          // Derive renewal assessor recommendations from the previous permit's application.
          // These MUST be shown (and locked) for renewals.
          try {
            const prevApp: any = (typedPermit as any)?.application;
            const prevNotesRaw = prevApp?.internal_notes;
            let prevNotes: any = {};
            if (typeof prevNotesRaw === "string" && prevNotesRaw.trim()) {
              try {
                prevNotes = JSON.parse(prevNotesRaw);
              } catch {
                prevNotes = {};
              }
            }

            const prevAdjustments = prevNotes?._assessorAdjustments || {};
            const durCandidate =
              (typeof prevAdjustments.permitLengthYears === "number" && Number.isFinite(prevAdjustments.permitLengthYears)
                ? prevAdjustments.permitLengthYears
                : undefined) ??
              (typeof prevApp?.proposed_duration_years === "number" && Number.isFinite(prevApp.proposed_duration_years)
                ? prevApp.proposed_duration_years
                : undefined);
            if (typeof durCandidate === "number" && durCandidate >= 1 && durCandidate <= 15) {
              setRenewalRecommendedDurationYears(durCandidate);
            }

            const volCandidate =
              (typeof prevAdjustments.recommendedVolumeM3 === "number" && Number.isFinite(prevAdjustments.recommendedVolumeM3)
                ? prevAdjustments.recommendedVolumeM3
                : undefined) ??
              (typeof prevApp?.assessor_recommended_volume_m3 === "number" && Number.isFinite(prevApp.assessor_recommended_volume_m3)
                ? prevApp.assessor_recommended_volume_m3
                : undefined) ??
              (typeof prevApp?.max_yearly_volume_m3 === "number" && Number.isFinite(prevApp.max_yearly_volume_m3)
                ? prevApp.max_yearly_volume_m3
                : undefined);
            if (typeof volCandidate === "number" && Number.isFinite(volCandidate)) {
              setRenewalRecommendedVolumeM3(volCandidate);
            }
          } catch (e) {
            console.warn("⚠️ Failed to derive renewal assessor recommendations from previous permit:", e);
          }
        }
      } catch (err) {
        console.error('Error loading renewal permit:', err);
      } finally {
        setLoadingRenewalPermit(false);
      }
    };
    
    loadRenewalPermit();
  }, [application]);

  // Debounced autosave for Field Report + Assessment Report inputs so refresh doesn't wipe in-progress work.
  useEffect(() => {
    if (!application) return;
    if (isReadOnly) return;
    if (!hasHydratedRef.current) return;

    const snapshot = JSON.stringify({
      assessmentReportData,
      fieldReportSummary,
      fieldReportFiles: fieldReportFiles.map((f) => f.path),
      checklist,
      recommendation,
      inspectorName,
      inspectionDate,
    });

    // No changes since last autosave/hydration
    if (snapshot === lastAutoSavedSnapshotRef.current) return;

    // Debounce
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      // Prevent overlapping autosaves
      if (autoSaveInFlightRef.current) return;
      autoSaveInFlightRef.current = true;
      try {
        await saveAssessment("draft");
        lastAutoSavedSnapshotRef.current = snapshot;
      } catch (e) {
        // Non-blocking: user can still submit; we just don't want refresh to wipe if possible.
        console.error("⚠️ Autosave failed:", e);
      } finally {
        autoSaveInFlightRef.current = false;
      }
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    application?.id,
    isReadOnly,
    assessmentReportData,
    fieldReportSummary,
    fieldReportFiles,
    checklist,
    recommendation,
    inspectorName,
    inspectionDate,
  ]);

  /**
   * Persist a single assessor adjustment ({@link patch}) via the dedicated
   * server endpoint. The endpoint uses `jsonb_set` so concurrent writes to
   * other paths in `internal_notes` (e.g. `document_overrides` from the
   * autosaving editor) are not clobbered. After a successful save we patch
   * only the `_assessorAdjustments` and (if backfilled) `_originalRequestedValues`
   * paths in local state — the rest of `internal_notes` is left as the editor
   * may have already updated it.
   */
  const persistAssessorAdjustment = useCallback(
    async (
      appId: string,
      patch: {
        permitLengthYears?: number;
        recommendedVolumeM3?: number;
        recommendedPumpingRateM3Day?: number;
        waterSourceLatitude?: number;
        waterSourceLongitude?: number;
        waterSourcePolygonPoints?: Array<{ latitude: number; longitude: number }>;
      },
    ): Promise<{
      assessorAdjustments: Record<string, unknown>;
      originalRequestedValues: Record<string, unknown> | null;
      proposedDurationYears: number | null;
    }> => {
      const res = await fetch(
        `/api/staff/applications/${appId}/assessor-adjustments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ...patch,
            requestedValues: {
              permitLengthYears: requestedDurationYears,
              volumeM3: requestedVolumeM3,
            },
          }),
        },
      );
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.success) {
        const msg = typeof json?.message === "string" ? json.message : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const adjustments =
        json.assessor_adjustments && typeof json.assessor_adjustments === "object"
          ? (json.assessor_adjustments as Record<string, unknown>)
          : {};
      const originals =
        json.original_requested_values && typeof json.original_requested_values === "object"
          ? (json.original_requested_values as Record<string, unknown>)
          : null;
      const proposed =
        typeof json.proposed_duration_years === "number" ? json.proposed_duration_years : null;
      return {
        assessorAdjustments: adjustments,
        originalRequestedValues: originals,
        proposedDurationYears: proposed,
      };
    },
    [requestedDurationYears, requestedVolumeM3],
  );

  // Save assessor's permit length adjustment via the race-safe endpoint.
  const savePermitLengthAdjustment = async (newPermitLength: number) => {
    if (!application) return;
    if ((application as any).is_renewal) {
      alert("⚠️ Renewal applications inherit assessor recommendations from the previous permit and they cannot be edited.");
      return;
    }

    try {
      setPermitLengthSaving(true);
      const { assessorAdjustments, originalRequestedValues, proposedDurationYears } =
        await persistAssessorAdjustment(application.id, {
          permitLengthYears: newPermitLength,
        });

      // Patch only the JSON paths the server actually wrote, so any in-flight
      // editor save reflected in our current local state survives.
      setApplication((prev) => {
        if (!prev) return prev;
        let parsed: Record<string, unknown> = {};
        try {
          parsed = prev.internal_notes ? JSON.parse(prev.internal_notes) : {};
        } catch {
          parsed = {};
        }
        parsed._assessorAdjustments = assessorAdjustments;
        if (originalRequestedValues) parsed._originalRequestedValues = originalRequestedValues;
        return {
          ...prev,
          internal_notes: JSON.stringify(parsed),
          proposed_duration_years:
            proposedDurationYears ?? (prev as any).proposed_duration_years ?? null,
        } as any;
      });
      setAssessorPermitLength(newPermitLength);

      console.log('✅ Permit length adjusted to', newPermitLength, 'years');
      bumpPreviewRefresh();
    } catch (err) {
      console.error('❌ Error saving permit length adjustment:', err);
      alert('Failed to save permit length adjustment. Please try again.');
    } finally {
      setPermitLengthSaving(false);
    }
  };

  // Save assessor's volume adjustment via the race-safe endpoint.
  const saveVolumeAdjustment = async (newVolume: number) => {
    if (!application) return;
    if ((application as any).is_renewal) {
      alert("⚠️ Renewal applications inherit assessor recommendations from the previous permit and they cannot be edited.");
      return;
    }

    try {
      setVolumeSaving(true);
      const { assessorAdjustments, originalRequestedValues } = await persistAssessorAdjustment(
        application.id,
        { recommendedVolumeM3: newVolume },
      );

      setApplication((prev) => {
        if (!prev) return prev;
        let parsed: Record<string, unknown> = {};
        try {
          parsed = prev.internal_notes ? JSON.parse(prev.internal_notes) : {};
        } catch {
          parsed = {};
        }
        parsed._assessorAdjustments = assessorAdjustments;
        if (originalRequestedValues) parsed._originalRequestedValues = originalRequestedValues;
        return {
          ...prev,
          internal_notes: JSON.stringify(parsed),
        } as any;
      });
      setAssessorRecommendedVolume(newVolume);

      console.log('✅ Volume adjusted to', newVolume, 'm³/year');
      bumpPreviewRefresh();
    } catch (err) {
      console.error('❌ Error saving volume adjustment:', err);
      alert('Failed to save volume adjustment. Please try again.');
    } finally {
      setVolumeSaving(false);
    }
  };

  // Save assessor's recommended pumping rate adjustment via the race-safe endpoint.
  const savePumpingRateAdjustment = async (newRate: number) => {
    if (!application) return;
    if ((application as any).is_renewal) {
      alert("⚠️ Renewal applications inherit assessor recommendations from the previous permit and they cannot be edited.");
      return;
    }

    try {
      setPumpingRateSaving(true);
      const { assessorAdjustments, originalRequestedValues } = await persistAssessorAdjustment(
        application.id,
        { recommendedPumpingRateM3Day: newRate },
      );

      setApplication((prev) => {
        if (!prev) return prev;
        let parsed: Record<string, unknown> = {};
        try {
          parsed = prev.internal_notes ? JSON.parse(prev.internal_notes) : {};
        } catch {
          parsed = {};
        }
        parsed._assessorAdjustments = assessorAdjustments;
        if (originalRequestedValues) parsed._originalRequestedValues = originalRequestedValues;
        return {
          ...prev,
          internal_notes: JSON.stringify(parsed),
        } as any;
      });
      setAssessorRecommendedPumpingRateM3Day(newRate);

      console.log('✅ Pumping rate adjusted to', newRate, 'm³/day');
      bumpPreviewRefresh();
    } catch (err) {
      console.error('❌ Error saving pumping rate adjustment:', err);
      alert('Failed to save pumping rate adjustment. Please try again.');
    } finally {
      setPumpingRateSaving(false);
    }
  };

  const patchAssessorAdjustmentsIntoApplication = (
    assessorAdjustments: Record<string, unknown>,
    originalRequestedValues: Record<string, unknown> | null,
  ) => {
    setApplication((prev) => {
      if (!prev) return prev;
      let parsed: Record<string, unknown> = {};
      try {
        parsed = prev.internal_notes ? JSON.parse(prev.internal_notes) : {};
      } catch {
        parsed = {};
      }
      parsed._assessorAdjustments = assessorAdjustments;
      if (originalRequestedValues) parsed._originalRequestedValues = originalRequestedValues;
      return {
        ...prev,
        internal_notes: JSON.stringify(parsed),
      } as any;
    });
  };

  const saveSourceCoordinatesAdjustment = async (coords: { latitude: string; longitude: string }) => {
    if (!application) return;
    if ((application as any).is_renewal) {
      alert("⚠️ Renewal applications inherit assessor recommendations from the previous permit and they cannot be edited.");
      return;
    }

    const latitude = Number.parseFloat(coords.latitude);
    const longitude = Number.parseFloat(coords.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      alert("Latitude and longitude must both be valid numbers.");
      return;
    }

    try {
      setCoordinatesSaving(true);
      const { assessorAdjustments, originalRequestedValues } = await persistAssessorAdjustment(
        application.id,
        {
          waterSourceLatitude: latitude,
          waterSourceLongitude: longitude,
        },
      );

      patchAssessorAdjustmentsIntoApplication(assessorAdjustments, originalRequestedValues);
      setAssessmentReportData((prev) => ({
        ...prev,
        sourceLatitude: String(assessorAdjustments.waterSourceLatitude ?? latitude),
        sourceLongitude: String(assessorAdjustments.waterSourceLongitude ?? longitude),
      }));

      console.log("✅ Water source coordinates adjusted", { latitude, longitude });
      bumpPreviewRefresh();
    } catch (err) {
      console.error("❌ Error saving water source coordinates:", err);
      alert("Failed to save water source coordinates. Please try again.");
    } finally {
      setCoordinatesSaving(false);
    }
  };

  const saveSourcePolygonAdjustment = async (
    points: Array<{ latitude: string; longitude: string }>,
  ) => {
    if (!application) return;
    if ((application as any).is_renewal) {
      alert("⚠️ Renewal applications inherit assessor recommendations from the previous permit and they cannot be edited.");
      return;
    }

    const parsedPoints = points.map((point) => ({
      latitude: Number.parseFloat(point.latitude),
      longitude: Number.parseFloat(point.longitude),
    }));
    if (
      parsedPoints.length === 0 ||
      parsedPoints.some((point) => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))
    ) {
      alert("Every polygon point must have a valid latitude and longitude.");
      return;
    }

    try {
      setCoordinatesSaving(true);
      const { assessorAdjustments, originalRequestedValues } = await persistAssessorAdjustment(
        application.id,
        { waterSourcePolygonPoints: parsedPoints },
      );

      patchAssessorAdjustmentsIntoApplication(assessorAdjustments, originalRequestedValues);
      const savedPoints = Array.isArray(assessorAdjustments.waterSourcePolygonPoints)
        ? assessorAdjustments.waterSourcePolygonPoints
        : parsedPoints;
      const stringPoints = savedPoints
        .map((point) => {
          if (!point || typeof point !== "object") return null;
          const raw = point as { latitude?: unknown; longitude?: unknown };
          return {
            latitude: String(raw.latitude ?? ""),
            longitude: String(raw.longitude ?? ""),
          };
        })
        .filter((point): point is { latitude: string; longitude: string } => Boolean(point));
      setAssessmentReportData((prev) => ({
        ...prev,
        sourcePolygonPoints: stringPoints,
        beacons: stringPoints.map((point, index) => ({
          id: `B${index + 1}`,
          latitude: point.latitude,
          longitude: point.longitude,
        })),
      }));

      console.log("✅ Water source polygon adjusted", { points: stringPoints.length });
      bumpPreviewRefresh();
    } catch (err) {
      console.error("❌ Error saving water source polygon:", err);
      alert("Failed to save water source polygon. Please try again.");
    } finally {
      setCoordinatesSaving(false);
    }
  };

  const saveBulkNetworksAdjustment = async (networks: import("@/types/database").BulkNetworkRow[]) => {
    if (!application) return;
    try {
      setBulkNetworksSaving(true);
      const { assessorAdjustments, originalRequestedValues } = await persistAssessorAdjustment(
        application.id,
        { bulkNetworks: networks },
      );
      patchAssessorAdjustmentsIntoApplication(assessorAdjustments, originalRequestedValues);
      const saved = Array.isArray(assessorAdjustments.bulkNetworks) ? assessorAdjustments.bulkNetworks : networks;
      setAssessorBulkNetworks(saved as import("@/types/database").BulkNetworkRow[]);
      console.log("✅ Bulk network rows adjusted", { count: saved.length });
      bumpPreviewRefresh();
    } catch (err) {
      console.error("❌ Error saving bulk network adjustments:", err);
      alert("Failed to save network adjustments. Please try again.");
    } finally {
      setBulkNetworksSaving(false);
    }
  };

  const handleRegistryPermitAcknowledge = async () => {
    setRegistryPermitAcknowledged(true);
    const updatedMeta: DocReviewMeta = {
      ...docReviewMeta,
      registryPermitAcknowledged: true,
      registryPermitAcknowledgedAt: new Date().toISOString(),
    };
    setDocReviewMeta(updatedMeta);
    await saveAssessment("draft", { docReviewMeta: updatedMeta });
  };

  const saveAssessment = async (
    status: 'draft' | 'submitted' | 'forwarded_to_approver' | 'returned_for_revision' = 'draft',
    overrides?: {
      documentVerifications?: Record<string, { status: VerificationStatus; notes: string }>;
      docReviewMeta?: DocReviewMeta;
    }
  ) => {
    if (!application) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const mergedDocVerifications = overrides?.documentVerifications ?? documentVerifications;
      const mergedDocReviewMeta = overrides?.docReviewMeta ?? docReviewMeta;

      // Log assessment report data before saving
      console.log('💾 Saving assessment report data:', assessmentReportData);
      const hasReportData = assessmentReportData && typeof assessmentReportData === 'object' && Object.keys(assessmentReportData).length > 0;
      console.log('📊 Assessment report data has content:', hasReportData);
      const assessmentReportDataForSave = withDefaultVolumeRateUnits(assessmentReportData);

      const assessmentData = {
        application_id: application.id,
        assessor_id: user.id,
        document_verifications: {
          ...mergedDocVerifications,
          __meta: mergedDocReviewMeta,
        },
        field_report_summary: fieldReportSummary,
        field_report_files: fieldReportFiles.map(f => f.path),
        location_verified: checklist.locationVerified,
        water_source_accessible: checklist.waterSourceAccessible,
        environmental_impact_assessed: checklist.environmentalImpactAssessed,
        technical_feasibility_confirmed: checklist.technicalFeasibilityConfirmed,
        infrastructure_adequate: checklist.infrastructureAdequate,
        recommendation: recommendation.recommendation,
        explanation_text: recommendation.explanationText,
        inspector_name: inspectorName,
        inspection_date: inspectionDate,
        assessment_report_data: assessmentReportDataForSave,
        status: status,
        ...(status === "forwarded_to_approver" ? { forwarded_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString()
      };

      let result;

      // If state wasn't hydrated (or a previous save happened in another tab),
      // re-check for an existing assessment before inserting a new one.
      let existingId = assessmentId;
      if (!existingId) {
        const { data: existingAssessment, error: existingErr } = await supabase
          .from('technical_assessments')
          .select('id')
          .eq('application_id', application.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingErr) throw existingErr;
        if (existingAssessment?.id) {
          existingId = existingAssessment.id;
          setAssessmentId(existingAssessment.id);
        }
      }

      if (existingId) {
        // Update existing
        result = await supabase
          .from('technical_assessments')
          .update(assessmentData)
          .eq('id', existingId)
          .select()
          .single();
      } else {
        // Create new
        result = await supabase
          .from('technical_assessments')
          .insert(assessmentData)
          .select()
          .single();
      }

      if (result.error) throw result.error;
      
      if (result.data) {
        setAssessmentId(result.data.id);
        setAssessmentReportData(assessmentReportDataForSave);
        // Verify that assessment_report_data was saved correctly
        const savedData = (result.data as any)?.assessment_report_data;
        console.log('✅ Assessment saved successfully. Saved assessment_report_data:', savedData);
        if (!savedData || (typeof savedData === 'object' && Object.keys(savedData).length === 0)) {
          console.warn('⚠️ Warning: assessment_report_data appears to be empty or missing after save');
        }
      }

      // Keep assessor recommendations in sync on the application record for this cycle.
      // This prevents modification flows from reusing stale _assessorAdjustments from previous cycles.
      if (!(application as any).is_renewal) {
        let existingFormData: any = {};
        try {
          existingFormData = JSON.parse(application.internal_notes || '{}');
        } catch {
          existingFormData = {};
        }

        const resolvedDuration =
          typeof assessorPermitLength === 'number' && Number.isFinite(assessorPermitLength) && assessorPermitLength >= 1 && assessorPermitLength <= 15
            ? assessorPermitLength
            : (typeof requestedDurationYears === 'number' && Number.isFinite(requestedDurationYears) && requestedDurationYears >= 1 && requestedDurationYears <= 15
              ? requestedDurationYears
              : undefined);

        const resolvedVolume =
          typeof assessorRecommendedVolume === 'number' && Number.isFinite(assessorRecommendedVolume) && assessorRecommendedVolume > 0
            ? assessorRecommendedVolume
            : (typeof requestedVolumeM3 === 'number' && Number.isFinite(requestedVolumeM3) && requestedVolumeM3 > 0
              ? requestedVolumeM3
              : undefined);

        if (!existingFormData._originalRequestedValues) {
          existingFormData._originalRequestedValues = {
            permitLengthYears: requestedDurationYears,
            volumeM3: requestedVolumeM3,
            storedAt: new Date().toISOString(),
          };
        }

        const previousAdjustments = existingFormData._assessorAdjustments || {};
        const nextAdjustments = {
          ...previousAdjustments,
        };

        if (typeof resolvedDuration === 'number') {
          nextAdjustments.permitLengthYears = resolvedDuration;
          nextAdjustments.adjustedAt = new Date().toISOString();
        }
        if (typeof resolvedVolume === 'number') {
          nextAdjustments.recommendedVolumeM3 = resolvedVolume;
          nextAdjustments.volumeAdjustedAt = new Date().toISOString();
        }

        existingFormData._assessorAdjustments = nextAdjustments;

        const durationChanged = nextAdjustments.permitLengthYears !== previousAdjustments.permitLengthYears;
        const volumeChanged = nextAdjustments.recommendedVolumeM3 !== previousAdjustments.recommendedVolumeM3;
        const needsAppSync = durationChanged || volumeChanged;

        if (needsAppSync) {
          const appUpdateData: any = {
            internal_notes: JSON.stringify(existingFormData),
          };
          if (typeof resolvedDuration === 'number') {
            appUpdateData.proposed_duration_years = resolvedDuration;
          }
          if (typeof resolvedVolume === 'number') {
            appUpdateData.assessor_recommended_volume_m3 = resolvedVolume;
          }

          const { error: appSyncError } = await supabase
            .from('applications')
            .update(appUpdateData)
            .eq('id', application.id);

          if (appSyncError) throw appSyncError;

          setApplication({
            ...application,
            ...appUpdateData,
          } as any);
        }
      }

      return result.data;
    } catch (err) {
      console.error('Error saving assessment:', err);
      throw err;
    }
  };

  const handleOpenSendToReviewDialog = () => {
    if (!application) return;

    // Transfer applications do not require an assessment report – skip field-report validation.
    if (!isTransferApp) {
      const missing = missingFieldReportRequirements;

      if (missing.length > 0) {
        alert(`⚠️ Please complete the following before sending for final approval:\n\n${missing.map((m) => `- ${m}`).join("\n")}`);
        tabTouchedRef.current = true;
        setActiveTab("field_report");
        return;
      }
    }

    // All validations passed, show confirmation dialog
    setShowSendToReviewDialog(true);
  };

  const handleForwardToApprover = async () => {
    if (!application) return;

    if (actionInFlightRef.current) return;

    try {
      setSubmitLoading(true);
      actionInFlightRef.current = true;
      const previousStatus = application.status;
      
      // 1. Save assessment with forwarded status
      await saveAssessment('forwarded_to_approver');
      
      // 2. Update application status
      const { error: appError } = await supabase
        .from('applications')
        .update({ 
          status: 'pending_review',
          updated_at: new Date().toISOString()
        })
        .eq('id', application.id);
        
      if (appError) throw appError;

      // Create audit log entry
      try {
        await createAuditLog({
          action: 'assessment.completed',
          entity_type: 'application',
          table_name: 'applications',
          record_id: application.id,
          old_values: { status: previousStatus },
          new_values: { status: 'pending_review' },
          description: `Assessment completed for application ${application.application_number}, forwarded to review`,
          severity: 'info',
          status: 'success',
        });
      } catch (auditErr) {
        console.warn('⚠️ Failed to create audit log:', auditErr);
      }

      fetch('/api/notifications/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'application_forwarded_to_review',
          entityType: 'application',
          entityId: application.id,
        }),
      }).catch(() => null)
      
      setShowSendToReviewDialog(false);
      // Redirect to assessment dashboard
      router.push('/assessment');
      
    } catch (err) {
      console.error('Error forwarding application:', err);
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as any).message === "string"
          ? (err as any).message
          : "Failed to forward application. Please try again.";
      alert(msg);
    } finally {
      setSubmitLoading(false);
      actionInFlightRef.current = false;
    }
  };

  const handleReturnForRevision = async () => {
    if (!application || !revisionNotes.trim()) return;

    if (actionInFlightRef.current) return;

    if (docReviewLocked) {
      alert("⚠️ This application has already been confirmed complete and can no longer be returned for revision.");
      return;
    }
    
    try {
      setSubmitLoading(true);
      actionInFlightRef.current = true;
      const previousStatus = application.status;
      
      // 1. Save assessment with revision status
      await saveAssessment('returned_for_revision');
      
      // 2. Update application status
      const { error: appError } = await supabase
        .from('applications')
        .update({ 
          status: 'revision_required',
          revision_notes: revisionNotes,
          updated_at: new Date().toISOString()
        })
        .eq('id', application.id);
        
      if (appError) throw appError;

      // Create audit log entry
      try {
        await createAuditLog({
          action: 'application.revision_requested',
          entity_type: 'application',
          table_name: 'applications',
          record_id: application.id,
          old_values: { status: previousStatus },
          new_values: { status: 'revision_required', revision_notes: revisionNotes },
          description: `Application ${application.application_number} returned to applicant for revision`,
          severity: 'warning',
          status: 'success',
        });
      } catch (auditErr) {
        console.warn('⚠️ Failed to create audit log:', auditErr);
      }
      
      setShowRevisionDialog(false);
      setRevisionNotes("");
      alert("Application returned to applicant for revision.");
      // ⚡ PERFORMANCE: Use router.refresh() instead of full page reload
      router.refresh();
      
    } catch (err) {
      console.error('Error returning application:', err);
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as any).message === "string"
          ? (err as any).message
          : "Failed to return application. Please try again.";
      alert(msg);
    } finally {
      setSubmitLoading(false);
      actionInFlightRef.current = false;
    }
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    const statusConfig: Record<string, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
      draft: { label: "Draft", variant: "outline" },
      submitted: { label: "Submitted", variant: "secondary" },
      under_review: { label: "Under Assessment", variant: "default" },
      pending_assessment: { label: "Pending Assessment", variant: "outline" },
      pending_final_approval: { label: "Pending Approval", variant: "default" },
      pending_payment: { label: "Pending Payment", variant: "secondary" },
      approved: { label: "Approved", variant: "default" },
      approved_pending_permit: { label: "Approved - Permit Pending", variant: "default" },
      rejected: { label: "Rejected", variant: "destructive" },
      revision_required: { label: "Needs Revision", variant: "secondary" },
      cancelled: { label: "Cancelled", variant: "outline" },
    };
    
    const config = statusConfig[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading application details...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive font-medium">Error loading application</p>
              <p className="text-muted-foreground text-sm mt-1">{error}</p>
              <Button onClick={() => window.location.href = '/assessment'} className="mt-4" variant="outline">
                Back to Assessment Dashboard
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }
  
  if (!application) return null;
  
  return (
    <DashboardLayout>
      <div className="flex justify-end p-6">
        <UserProfileButton />
      </div>
      
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6 pb-8"
        >
          {/* Header */}
          <div className="space-y-6">
            <div className="flex items-center">
              <SmartBackButton fallbackHref={staffListHref("assessment", "primary")} label="Back to Dashboard" size="sm" className="gap-2" />
            </div>
      
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-primary text-3xl font-semibold tracking-tight">
                  Assessment: {application.application_number}
                </h1>
                {getStatusBadge(application.status)}
              </div>

              <p className="text-muted-foreground">
                Perform field assessment and verification for water permit application
              </p>
              
              {(application as any)?.assigned_to_user && (
                <p className="text-sm text-muted-foreground">
                  Assigned to: {(application as any).assigned_to_user.first_name} {(application as any).assigned_to_user.last_name}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons Bar */}
          <div className="flex flex-wrap items-center gap-3 p-4 bg-background border rounded-lg shadow-sm">
            <div className="flex items-center gap-2 mr-auto">
              <Badge
                variant="outline"
                className={
                  isReadOnly
                    ? "h-7 px-3 text-sm font-normal bg-gray-50 text-gray-700 border-gray-200"
                    : "h-7 px-3 text-sm font-normal bg-blue-50 text-blue-700 border-blue-200"
                }
              >
                <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                {isReadOnly ? "View Only" : "Assessment Mode"}
              </Badge>
            </div>

            {!isReadOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRevisionDialog(true)}
                disabled={submitLoading || docReviewLocked}
                className="gap-2"
                title={docReviewLocked ? "This application has already been confirmed complete and can no longer be returned for revision." : undefined}
              >
                <X className="h-4 w-4" />
                Return for Revision
              </Button>
            )}

            {!isReadOnly && (
              <Button
                size="sm"
                onClick={handleOpenSendToReviewDialog}
                disabled={submitLoading || !canSendForReview}
                className="gap-2 bg-black hover:bg-gray-800 text-white"
              >
                {submitLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send for review
              </Button>
            )}
          </div>

          {/* Main Content with Tabs */}
          <Tabs
            value={activeTab || defaultTabValue}
            onValueChange={(next) => {
              tabTouchedRef.current = true;
              setActiveTab(next);
            }}
            className="space-y-6"
          >
            <TabsList
              className={`grid w-full ${isTransferApp ? "grid-cols-4" : "grid-cols-5"} h-auto p-1 bg-muted/80`}
            >
              <TabsTrigger value="application_details" className="py-2.5">Application Details</TabsTrigger>
              {!isTransferApp && (
                <TabsTrigger value="field_report" className="py-2.5">
                  Assessment Report
                </TabsTrigger>
              )}
              <TabsTrigger value="contract_preview" className="py-2.5">Contract Preview</TabsTrigger>
              <TabsTrigger value="permit_preview" className="py-2.5">Permit Preview</TabsTrigger>
              <TabsTrigger value="internal_notes" className="py-2.5">History & Notes</TabsTrigger>
            </TabsList>

            {/*
              Free-text editor for every editable string in the Permit and
              Contract documents. Only meaningful while the assessor is
              actually reviewing one of those previews — hidden via CSS on
              other tabs so in-progress drafts are preserved when the
              assessor flips between tabs (re-rendering would discard them).
            */}
            {application?.id && (
              <div
                className={
                  activeTab === "contract_preview" || activeTab === "permit_preview"
                    ? ""
                    : "hidden"
                }
              >
                <DocumentTextEditor
                  applicationId={application.id}
                  refreshKey={previewRefreshKey}
                  readOnly={isReadOnly}
                  onSaved={bumpPreviewRefresh}
                />
              </div>
            )}

            {/* Application Details Tab */}
            <TabsContent value="application_details" className="space-y-6 focus-visible:outline-none">
              {/* Transfer apps have no Assessment Report tab, so the assessor
                  needs a duration control here. Seeder defaults it to the
                  remaining validity of the old permit. */}
              {isTransferApp && application && (
                <Card className="border-blue-200 bg-blue-50/40">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Permit Duration</CardTitle>
                    <CardDescription>
                      Number of years the new permit will be valid. Defaults to
                      the remaining validity of the permit being transferred.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3 max-w-sm">
                      <Input
                        id="transfer-permit-length"
                        type="number"
                        min={1}
                        max={15}
                        step={1}
                        disabled={isReadOnly || permitLengthSaving}
                        value={
                          typeof assessorPermitLength === "number"
                            ? String(assessorPermitLength)
                            : ""
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") {
                            setAssessorPermitLength(undefined);
                            return;
                          }
                          const parsed = parseInt(v, 10);
                          if (!Number.isNaN(parsed)) {
                            setAssessorPermitLength(parsed);
                          }
                        }}
                        onBlur={() => {
                          if (
                            typeof assessorPermitLength === "number" &&
                            assessorPermitLength >= 1 &&
                            assessorPermitLength <= 15
                          ) {
                            void savePermitLengthAdjustment(assessorPermitLength);
                          }
                        }}
                      />
                      <span className="text-sm text-muted-foreground">years</span>
                    </div>
                    {!hasValidDuration && !isReadOnly && (
                      <Alert className="border-amber-200 bg-amber-50 py-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-amber-800 text-sm">
                          Set the permit duration (1–15 years) before sending
                          for review.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              )}
              {application && (
                <RegistryPermitComparisonCard
                  application={application}
                  onAcknowledge={isEditableAssessment ? handleRegistryPermitAcknowledge : undefined}
                  acknowledged={registryPermitAcknowledged}
                />
              )}
              {/* Show Transfer Form for transfer applications */}
              {isTransferApp ? (
                loadingTransferPermit ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    <span className="ml-3 text-sm text-muted-foreground">Loading transfer details...</span>
                  </div>
                ) : transferPermit ? (
                  <PermitTransferForm
                    permit={transferPermit}
                    userData={{
                      email: application.applicant?.email || "",
                      name: application.applicant?.company_name || 
                        (application.applicant?.first_name && application.applicant?.last_name ? 
                          `${application.applicant.first_name} ${application.applicant.last_name}` : ""),
                      phone: application.applicant?.phone || application.applicant?.company_phone || "",
                      address: application.applicant?.company_address || "",
                      account_type: application.applicant?.account_type || 'individual',
                    }}
                    onSubmit={async () => {}}
                    onSaveAsDraft={async () => {}}
                    isLoading={false}
                    initialData={transferFormData || undefined}
                    initialDocuments={initialDocuments}
                    mode="view"
                    readOnly={true}
                    currentApplication={application}
                    isStaffView={true}
                  />
                ) : (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription>
                      Original permit details could not be loaded for this transfer.
                    </AlertDescription>
                  </Alert>
                )
              ) : isModificationApp ? (
                initialFormData ? (
                  <ApplicationForm
                    userData={{
                      email: application.applicant?.email || "",
                      name: application.applicant?.company_name ||
                            (application.applicant?.first_name && application.applicant?.last_name ?
                             `${application.applicant.first_name} ${application.applicant.last_name}` : ""),
                      phone: application.applicant?.phone || "",
                      address: application.applicant?.address || "",
                      idNumber: "",
                      account_type: 'individual' as const,
                      id_number: "",
                      company_tin: "",
                    }}
                    onSubmit={async () => {}} // Dummy handler for read-only form
                    onSaveAsDraft={async () => {}} // Dummy handler for read-only form
                    isLoading={false}
                    initialData={initialFormData}
                    initialDocuments={initialDocuments}
                    mode="view"
                    readOnly={true}
                    currentApplication={application}
                    isStaffView={true}
                    isModification={true}
                    modificationChanges={enrichModificationChanges((application as any).modification_changes, originalModificationApp)}
                    editableFields={["nameSourceWater"]}
                    isBulkApplicant={!!(application as any)?.is_bulk}
                  />
                ) : null
              ) : (application as any).is_renewal && renewalPermit ? (
                <PermitRenewalForm 
                  permit={renewalPermit}
                  userData={{
                    id: application.applicant?.id,
                    email: application.applicant?.email || "",
                    phone: application.applicant?.phone || "",
                    first_name: application.applicant?.first_name,
                    last_name: application.applicant?.last_name,
                    company_name: application.applicant?.company_name,
                    account_type: application.applicant?.account_type || 'individual',
                  }}
                  onSubmit={async () => {}}
                  onSaveAsDraft={async () => {}}
                  isLoading={false}
                  currentApplication={application}
                  readOnly={true}
                  isStaffView={true}
                />
              ) : loadingRenewalPermit && (application as any).is_renewal ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                  <span className="ml-3 text-sm text-muted-foreground">Loading renewal details...</span>
                </div>
              ) : initialFormData ? (
                <ApplicationForm
                  userData={{
                    email: application.applicant?.email || "",
                    name: application.applicant?.company_name ||
                          (application.applicant?.first_name && application.applicant?.last_name ?
                           `${application.applicant.first_name} ${application.applicant.last_name}` : ""),
                    phone: application.applicant?.phone || "",
                    address: application.applicant?.address || "",
                    idNumber: "",
                    account_type: 'individual' as const,
                    id_number: "",
                    company_tin: "",
                  }}
                  onSubmit={async () => {}}
                  onSaveAsDraft={async () => {}}
                  isLoading={false}
                  initialData={initialFormData}
                  initialDocuments={initialDocuments}
                  mode="view"
                  readOnly={true}
                  currentApplication={application}
                  isStaffView={true}
                  editableFields={["nameSourceWater"]}
                  isBulkApplicant={!!(application as any)?.is_bulk}
                />
              ) : null}
              
            </TabsContent>

            {/* Assessment Report Tab - Hidden for transfer applications */}
            {!isTransferApp && (
              <TabsContent value="field_report" className="space-y-6 focus-visible:outline-none">
                {isUnlinkedPermit && !registryPermitAcknowledged ? (
                  <Card className="border-amber-200 bg-amber-50/60">
                    <CardContent className="pt-6 space-y-4">
                      <Alert className="border-amber-300 bg-amber-100">
                        <AlertTriangle className="h-5 w-5 text-amber-700" />
                        <AlertDescription className="text-amber-900">
                          <p className="font-semibold mb-1">Assessment Blocked</p>
                          <p>
                            This application references a manually-entered permit that is not linked in the system.
                            Please review the permit details in the <strong>Application Details</strong> tab and
                            acknowledge verification before proceeding with the assessment report.
                          </p>
                        </AlertDescription>
                      </Alert>
                      <Button
                        variant="outline"
                        onClick={() => setActiveTab("application_details")}
                        className="gap-2"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Go to Application Details
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                (() => {
                  const rt: ReportType = reportTypeForAssessment;
                  return (
                    <FieldReportUpload
                      applicationId={application.id}
                      existingFiles={fieldReportFiles}
                      summary={fieldReportSummary}
                      inspectorName={inspectorName}
                      inspectionDate={inspectionDate}
                      assessmentSubmittedDate={assessmentSubmittedDate}
                      onFilesChange={setFieldReportFiles}
                      onSummaryChange={setFieldReportSummary}
                      onInspectorNameChange={setInspectorName}
                      onInspectionDateChange={setInspectionDate}
                      documentsTitle="Supporting Documents"
                      documentsRequired={false}
                      documentsDescription="Upload any supporting documents (optional): PDFs, Word docs, and photos"
                      inspectorNameReadOnly={true}
                      readOnly={isReadOnly}
                      hideSummary={true}
                      showInlineValidation={false}
                      betweenDetailsAndDocuments={
                        <div className="space-y-6">
                          {/* Assessor Recommendations - Requested vs Recommended comparison */}
                          <AssessorRecommendations
                            requestedDurationYears={requestedDurationYears}
                            requestedVolumeM3={requestedVolumeM3}
                            recommendedDurationYears={(application as any).is_renewal ? renewalRecommendedDurationYears : assessorPermitLength}
                            recommendedVolumeM3={(application as any).is_renewal ? renewalRecommendedVolumeM3 : assessorRecommendedVolume}
                            onDurationChange={(application as any).is_renewal ? undefined : savePermitLengthAdjustment}
                            onVolumeChange={(application as any).is_renewal ? undefined : saveVolumeAdjustment}
                            readOnly={isReadOnly || (application as any).is_renewal}
                            durationSaving={permitLengthSaving}
                            volumeSaving={volumeSaving}
                            isConcession={rt === "concession"}
                            isBulk={!!(application as any)?.is_bulk}
                            isGroundwater={isGroundwater}
                            requestedPumpingRateM3Day={requestedPumpingRateM3Day}
                            recommendedPumpingRateM3Day={assessorRecommendedPumpingRateM3Day}
                            onPumpingRateSave={(application as any).is_renewal ? undefined : savePumpingRateAdjustment}
                            pumpingRateSaving={pumpingRateSaving}
                          />
                          
                          {/* Assessment Report Form */}
                          <AssessmentReportForm
                            reportData={assessmentReportData}
                            onReportDataChange={setAssessmentReportData}
                            reportType={rt}
                            readOnly={isReadOnly}
                            onSourceCoordinatesSave={(application as any).is_renewal ? undefined : saveSourceCoordinatesAdjustment}
                            onSourcePolygonSave={(application as any).is_renewal ? undefined : saveSourcePolygonAdjustment}
                            coordinatesSaving={coordinatesSaving}
                            inspectionDate={inspectionDate}
                            assessmentSubmittedDate={assessmentSubmittedDate}
                            recommendation={recommendation}
                            onRecommendationChange={setRecommendation}
                            isBulkApplication={!!(application as any).is_bulk}
                            bulkNetworks={assessorBulkNetworks}
                            onBulkNetworksSave={(application as any).is_renewal ? undefined : saveBulkNetworksAdjustment}
                            bulkNetworksSaving={bulkNetworksSaving}
                            bulkProvince={initialFormData?.waterSourceProvince ?? ""}
                            bulkDistrict={initialFormData?.waterSourceDistrict ?? ""}
                            isGroundwater={isGroundwater}
                          />
                        </div>
                      }
                      afterDocuments={
                        isReadOnly ? null : (() => {
                          return (
                            <div className="flex flex-col items-end gap-2">
                              {!canSendForReview && missingFieldReportRequirements.length > 0 && (
                                <div className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                  <p className="font-medium mb-1">Complete the following before sending for review:</p>
                                  <ul className="list-disc pl-5 space-y-0.5">
                                    {missingFieldReportRequirements.map((m) => (
                                      <li key={m}>{m}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              <Button
                                size="lg"
                                onClick={handleOpenSendToReviewDialog}
                                disabled={submitLoading || !canSendForReview}
                                className="gap-2 bg-black hover:bg-gray-800 text-white"
                              >
                                {submitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                Send for review
                              </Button>
                            </div>
                          );
                        })()
                      }
                    />
                  );
                })()
                )}
              </TabsContent>

            )}

            {/* Contract Preview Tab */}
            <TabsContent value="contract_preview" className="space-y-6 focus-visible:outline-none">
              <ContractTermsPreview
                application={application}
                mode="staff-preview"
                showChrome
                transferPermit={transferPermit ?? (renewalPermit ? {
                  permit_number: renewalPermit.permit_number,
                  issue_date: (renewalPermit as any).issued_date,
                  expiry_date: renewalPermit.expiry_date,
                  concession_area: (renewalPermit as any).application?.concession_area,
                } : null)}
              />
            </TabsContent>

            {/* Permit Preview Tab */}
            <TabsContent value="permit_preview" className="focus-visible:outline-none">
              {application.id && (
                <PermitPreviewFrame
                  applicationId={application.id}
                  refreshKey={previewRefreshKey}
                />
              )}
            </TabsContent>

            {/* Internal Notes Tab */}
            <TabsContent value="internal_notes" className="space-y-6 focus-visible:outline-none">
              {application.id && (
                <ApplicationComments
                  applicationId={application.id}
                  applicationStatus={application.status}
                  applicationSubmittedAt={application.submitted_at ?? undefined}
                  applicationCreatedAt={application.created_at}
                  applicantName={application.applicant?.first_name && application.applicant?.last_name
                    ? `${application.applicant.first_name} ${application.applicant.last_name}`
                    : application.applicant?.company_name || application.project_title?.replace(' Water Permit Application', '') || undefined}
                />
              )}
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>

      {/* Revision Dialog */}
      <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Return Application for Revision
            </DialogTitle>
            <DialogDescription>
              Provide detailed instructions on what needs to be corrected. The applicant will be notified to make changes and resubmit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="revision-notes">Revision Instructions *</Label>
              <Textarea
                id="revision-notes"
                placeholder="E.g., The site plan does not match the coordinates provided. Please update..."
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                rows={5}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevisionDialog(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleReturnForRevision}
              disabled={!revisionNotes.trim() || submitLoading}
            >
              {submitLoading ? 'Returning...' : 'Return for Revision'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send to Review Confirmation Dialog */}
      <Dialog open={showSendToReviewDialog} onOpenChange={setShowSendToReviewDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Action
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to send this application for review? This action will change the application status and move it to the next stage.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowSendToReviewDialog(false)}
              disabled={submitLoading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleForwardToApprover}
              disabled={submitLoading}
              className="bg-black hover:bg-gray-800 text-white gap-2"
            >
              {submitLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Yes, Send for Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
