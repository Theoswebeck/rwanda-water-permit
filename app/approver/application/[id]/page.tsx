"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractTermsPreview } from "@/components/contract/contract-terms-preview";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  Loader2,
  XCircle,
  ClipboardCheck,
  FileText,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ChevronDown
} from "lucide-react";
import Link from "next/link";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { supabase } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";
import { resolveDocumentFieldToken } from "@/lib/documents/upload-mapping";
import { mergeAdditionalDocumentUrls } from "@/lib/documents/additional-documents";
import { buildSyntheticPermitFromNotes } from "@/lib/permit/build-synthetic-permit";
import { enrichModificationChanges } from "@/lib/application-utils";
import { getApplicationWorkflowKind } from "@/lib/application-workflow";
import { geometryToCoordinatePolygons } from "@/lib/geoUtils";
import type { Application, ApplicationStatus, User as UserType, Document, Review } from "@/types/database";
import { ApplicationComments } from "@/components/shared/ApplicationComments";
import { RegistryPermitComparisonCard } from "@/components/inspection/registry-permit-comparison-card";
import { FieldReportUpload, FieldReportFile } from "@/components/inspection/field-report-upload";
import type { RecommendationData } from "@/components/inspection/verification-summary";
import { AssessmentReportForm } from "@/components/inspection/assessment-report-form";
import type { AssessmentReportData, ReportType } from "@/lib/assessment-report-utils";
import { determineReportType, mergeAssessmentReportData, normalizeAssessmentReportData, prefillAssessmentReportFromApplication } from "@/lib/assessment-report-utils";
import { AssessorRecommendations } from "@/components/inspection/assessor-recommendations";
import { type PermitWithApplication } from "@/components/dashboard/permit-select-for-renewal";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { PermitPreviewFrame } from "@/components/staff/permit-preview-frame";
import { ApproverChangedSlotsPane } from "@/components/approver/changed-slots-pane";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
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

type DecisionType = "approve" | "reject" | "return_to_assessment";

// Transform Application data back to form format for viewing
function mapApplicationToFormData(application: Application, userProfile?: any): any {
  const formData: any = {};
  
  // Parse internal notes to extract form-specific data
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
    Object.assign(formData, storedFormData);
    
    if (userProfile) {
      formData.telephoneContact = userProfile.phone || userProfile.company_phone || formData.telephoneContact;
      formData.emailAddress = userProfile.email || formData.emailAddress;
    }
    
    if (Array.isArray(formData.waterSourcePolygons) && formData.waterSourcePolygons.length > 0) {
      // ok
    } else if (Array.isArray(formData.waterSourceCoordinates)) {
      formData.waterSourcePolygons = [formData.waterSourceCoordinates];
    } else {
      formData.waterSourcePolygons = [[{ latitude: "", longitude: "" }, { latitude: "", longitude: "" }, { latitude: "", longitude: "" }]];
    }
  } else {
    // Legacy format
    formData.fullNameApplicant = application.project_title?.replace(' Water Permit Application', '') || 'Draft Application';
    formData.categoryApplicant = legacyNotesMap['Category']?.toLowerCase() || 'individual';
  
    const provinceReverseMap: Record<string, string> = {
      'Kigali': 'Kigali', 'Northern': 'North', 'Southern': 'South', 'Eastern': 'East', 'Western': 'West'
    };
    formData.officeProvince = provinceReverseMap[application.province] || application.province || '';
    formData.officeDistrict = application.district || '';
    formData.officeSector = application.sector || '';
    formData.officeCell = application.cell || '';
    formData.officeVillage = application.village || '';
    
    formData.telephoneContact = userProfile?.phone || userProfile?.company_phone || '';
    formData.emailAddress = userProfile?.email || legacyNotesMap['Contact']?.replace('Not provided', '') || '';
  
    const waterSourceMap: Record<string, string> = { 'surface_water': 'stream_river', 'groundwater': 'borehole' };
    formData.waterSourceType = waterSourceMap[application.water_source] || 'stream_river';
    formData.nameSourceWater = application.water_body_name || '';
    formData.tributaryToMain = application.tributary_name || '';
    
    formData.waterSourceProvince = provinceReverseMap[application.province] || application.province || '';
    formData.waterSourceDistrict = application.district || '';
    formData.waterSourceSector = application.sector || '';
    formData.waterSourceCell = application.cell || '';
    formData.waterSourceVillage = application.village || '';
  
    try {
      const polys = geometryToCoordinatePolygons(application.coordinates);
      formData.waterSourcePolygons = polys && polys.length > 0 ? polys : [[{ latitude: "", longitude: "" }, { latitude: "", longitude: "" }, { latitude: "", longitude: "" }]];
    } catch (error) {
      formData.waterSourcePolygons = [[{ latitude: "", longitude: "" }, { latitude: "", longitude: "" }, { latitude: "", longitude: "" }]];
    }
  
    formData.waterReliability = 'water_always_available';
    const purposeToActivity: Record<string, string> = {
      'domestic': 'water_supply', 'irrigation': 'irrigation', 'fish_farming_lakes': 'fish_farming_lakes',
      'fish_farming_ponds': 'fish_farming_ponds', 'industrial': 'industry', 'electricity_generation': 'electricity_generation',
      'mining': 'mining', 'recreation': 'recreation_activities', 'livestock': 'livestock'
    };
    let mappedActivity = purposeToActivity[application.water_purpose] || 'water_supply';
    if (Array.isArray((application as any).intended_activities) && (application as any).intended_activities.length > 0) {
      formData.intendedActivities = (application as any).intended_activities;
      mappedActivity = (application as any).intended_activities[0] || mappedActivity;
    } else {
      formData.intendedActivities = [mappedActivity];
    }
    formData.waterAbstractionDetails = [{
      activity: mappedActivity, flowRate: '', flowRateUnit: 'm³/s',
      maxAverageYearly: application.estimated_usage_volume || 0,
      abstractionMethod: application.water_taking_method || 'pump'
    }];
    formData.ownsAllLand = true;
    formData.hasLandAccess = true;
    formData.certificationAgreement = true;
  }

  return formData;
}

export default function ApproverApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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
  
  // Field Report State
  const [fieldReportFiles, setFieldReportFiles] = useState<FieldReportFile[]>([]);
  const [fieldReportSummary, setFieldReportSummary] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  const [assessmentSubmittedDate, setAssessmentSubmittedDate] = useState("");
  
  // Recommendation State
  const [recommendation, setRecommendation] = useState<RecommendationData>({
    recommendation: null,
    explanationText: ""
  });
  
  // Assessor Recommendations State (read-only for approvers)
  const [requestedDurationYears, setRequestedDurationYears] = useState<number | undefined>(undefined);
  const [requestedVolumeM3, setRequestedVolumeM3] = useState<number | undefined>(undefined);
  const [recommendedDurationYears, setRecommendedDurationYears] = useState<number | undefined>(undefined);
  const [recommendedVolumeM3, setRecommendedVolumeM3] = useState<number | undefined>(undefined);

  // Assessment Report State (template-backed)
  const [assessmentReportData, setAssessmentReportData] = useState<Partial<AssessmentReportData>>({});
  const [isDecisionDialogOpen, setIsDecisionDialogOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<DecisionType>("approve");
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionReasonPreset, setDecisionReasonPreset] = useState<string>("");
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  // Free-text override review gate: when the assessor has rewritten any
  // permit/contract slot, the approver MUST acknowledge the diff before they
  // can approve. The pane below the permit preview owns the checkbox; it
  // pushes its current state up via `onAcknowledgementChange`.
  const [overrideReview, setOverrideReview] = useState<{
    count: number;
    acknowledged: boolean;
    version: number | null;
  }>({
    count: 0,
    acknowledged: false,
    version: null,
  });
  const [decisionSuccess, setDecisionSuccess] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchApplicationDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        const applicationNumber = params.id as string;

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
        setApplication(appData);

        // Fetch existing assessment
        const { data: existingAssessment } = await supabase
          .from('technical_assessments')
          .select('*')
          .eq('application_id', appData.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        let savedAssessmentReportData: Partial<AssessmentReportData> | null | undefined = null;

        if (existingAssessment) {
          setFieldReportSummary(existingAssessment.field_report_summary || "");
          setInspectorName(existingAssessment.inspector_name || "");
          setInspectionDate(existingAssessment.inspection_date || "");
          setAssessmentSubmittedDate(
            toDateInputValue(
              existingAssessment.forwarded_at ||
              existingAssessment.updated_at ||
              existingAssessment.created_at
            )
          );
          
          setRecommendation({
            recommendation: existingAssessment.recommendation as "yes" | "no" | null,
            explanationText: existingAssessment.explanation_text || ""
          });

          savedAssessmentReportData = normalizeAssessmentReportData(
            (existingAssessment as any)?.assessment_report_data
          );
          if (savedAssessmentReportData) {
            console.log("✅ Loaded saved assessment report data:", savedAssessmentReportData);
          } else {
            console.log("⚠️ No usable assessment_report_data found in existing assessment");
          }

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
                size: 0,
                type: name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
                uploadedAt: uploadedAt
              };
            });
            setFieldReportFiles(files);
          }
        } else {
          setAssessmentSubmittedDate("");
          console.log('⚠️ No existing assessment found for application');
        }

        // Transform application data to form format
        const formData = mapApplicationToFormData(appData, null);

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

        // Prefill the official assessment report template from application data and merge saved assessor inputs
        const prefilledReport = prefillAssessmentReportFromApplication(appData, formData, appData.documents || []);
        const mergedReport = mergeAssessmentReportData(prefilledReport, savedAssessmentReportData || null);
        console.log('🔄 Merged assessment report data:', mergedReport);
        setAssessmentReportData(mergedReport);
        
        // Initialize Assessor Recommendations values (read-only for approvers)
        // IMPORTANT: Only use _assessorAdjustments if an assessment actually exists for THIS application.
        // For modification applications, the form_data may carry stale _assessorAdjustments from the
        // previous submission cycle. We must NOT pre-fill recommended values from those stale adjustments.
        const hasAssessmentForThisApp = !!existingAssessment;
        const assessorAdjustments = hasAssessmentForThisApp ? (formData._assessorAdjustments || {}) : {};
        const originalRequestedValues = formData._originalRequestedValues || {};
        
        // REQUESTED VALUES for assessor comparison (always current submission values)
        const currentRequestedDuration = formData.permitLengthYears;
        if (typeof currentRequestedDuration === 'number' && currentRequestedDuration >= 1 && currentRequestedDuration <= 15) {
          setRequestedDurationYears(currentRequestedDuration);
        }
        const isConcessionApp = determineReportType(
          (appData as any)?.intended_activities as string[] | null,
          appData.water_purpose || null,
          formData?.waterUseCategory ?? null
        ) === "concession";
        const currentRequestedVolume = (() => {
          if (isConcessionApp) {
            const dbArea = Number((appData as any).concession_area);
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

        // ASSESSOR RECOMMENDED VALUES (from assessor adjustments — only when assessment exists)
        if (hasAssessmentForThisApp) {
          const assessorDuration = assessorAdjustments.permitLengthYears 
            || (typeof currentRequestedDuration === 'number' ? currentRequestedDuration : undefined);
          if (typeof assessorDuration === 'number' && assessorDuration >= 1 && assessorDuration <= 15) {
            setRecommendedDurationYears(assessorDuration);
          }
          const assessorVolume = assessorAdjustments.recommendedVolumeM3 
            || (typeof currentRequestedVolume === 'number' ? currentRequestedVolume : undefined);
          if (typeof assessorVolume === 'number' && Number.isFinite(assessorVolume)) {
            setRecommendedVolumeM3(assessorVolume);
          }
        } else {
          console.log('⚠️ No assessment filed yet for this application — skipping assessor recommended values');
        }

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

            const fieldName = resolveDocumentFieldToken(doc.file_path, doc.type);
            if (!fieldName.startsWith('additional_') && !documentMap[fieldName]) {
              documentMap[fieldName] = { url: publicUrl, name: doc.name };
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
          console.error('Error loading renewal permit:', permitError);
        } else {
          const typedPermit = permit as PermitWithApplication;
          setRenewalPermit(typedPermit);

          // For renewal workflows, derive read-only assessor recommended values from
          // the previous permit application to keep all staff pages in sync.
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
            } else {
              setRenewalRecommendedDurationYears(undefined);
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
            } else {
              setRenewalRecommendedVolumeM3(undefined);
            }
          } catch (e) {
            console.warn("⚠️ Failed to derive renewal assessor recommendations for approver page:", e);
            setRenewalRecommendedDurationYears(undefined);
            setRenewalRecommendedVolumeM3(undefined);
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

  const getStatusBadge = (status: ApplicationStatus) => {
    const statusConfig: Record<string, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
      draft: { label: "Draft", variant: "outline" },
      submitted: { label: "Submitted", variant: "secondary" },
      under_review: { label: "Under Review", variant: "default" },
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

  const getApplicantName = (app: ApplicationWithRelations) => {
    if (app.applicant?.account_type === "individual") {
      return `${app.applicant.first_name || ""} ${app.applicant.last_name || ""}`.trim() || "Unknown Applicant";
    }
    return app.applicant?.company_name || "Unknown Applicant";
  };

  const openDecisionDialog = (nextDecisionType: DecisionType) => {
    setDecisionType(nextDecisionType);
    setDecisionReason("");
    setDecisionReasonPreset("");
    setDecisionError(null);
    setIsDecisionDialogOpen(true);
  };

  const handleFinalDecision = async () => {
    if (!application) return;

    try {
      setSubmittingDecision(true);
      setDecisionError(null);

      const resp = await fetch("/api/approver/final-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: application.id,
          decision: decisionType,
          reason: decisionReason.trim(),
          // Server-side issuance gate: when overrides exist on the
          // application, the API requires this to equal the current envelope
          // version, otherwise approval is rejected with 409.
          acknowledgedOverrideVersion:
            decisionType === "approve" && overrideReview.count > 0 && overrideReview.acknowledged
              ? overrideReview.version
              : undefined,
        }),
      });

      const result = await resp.json();
      if (!resp.ok || !result?.success) {
        throw new Error(result?.message || "Failed to process decision");
      }

      const actionText =
        decisionType === "approve"
          ? "approved"
          : decisionType === "reject"
            ? "rejected"
            : "returned to verification";

      const nextStatus: ApplicationStatus =
        decisionType === "approve"
          ? "approved_pending_permit"
          : decisionType === "reject"
            ? "rejected"
            : "returned_to_verification";

      setApplication((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      setDecisionSuccess(`Application ${actionText} successfully.`);
      setIsDecisionDialogOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to process decision";
      setDecisionError(message);
    } finally {
      setSubmittingDecision(false);
    }
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
  
  if (error || !application) {
    return (
      <DashboardLayout>
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive font-medium">Error loading application</p>
              <p className="text-muted-foreground text-sm mt-1">{error || "Application not found"}</p>
              <Button onClick={() => router.push('/approver')} className="mt-4" variant="outline">
                Back to Approver Dashboard
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }
  
  return (
    <ProtectedRoute allowedRoles={['approver', 'admin']} requireProfile={true}>
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
        <Link href="/approver">
                <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
          </Button>
        </Link>
      </div>
      
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-primary text-3xl font-semibold tracking-tight">
                  Executive Review: {application.application_number}
                </h1>
                {getStatusBadge(application.status)}
              </div>
              <p className="text-muted-foreground">
                Review complete assessment and field evidence for final decision
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 p-4 bg-background border rounded-lg shadow-sm">
            <div className="flex items-center gap-2 mr-auto">
              <Badge variant="outline" className="h-7 px-3 text-sm font-normal bg-gray-50 text-gray-700 border-gray-200">
                <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                Executive View-Only
              </Badge>
            </div>

            {application.status === "pending_final_approval" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="bg-black hover:bg-gray-800 text-white gap-2">
                    <FileText className="h-4 w-4" />
                    Make Final Decision
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => openDecisionDialog("approve")}
                    className="flex items-center gap-2 cursor-pointer text-green-600 focus:text-green-600"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => openDecisionDialog("reject")}
                    className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-600"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => openDecisionDialog("return_to_assessment")}
                    className="flex items-center gap-2 cursor-pointer text-orange-600 focus:text-orange-600"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Return to Verification
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
        </div>

          {decisionSuccess && (
            <Alert className="border-green-200 bg-green-50 text-green-800">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>{decisionSuccess}</AlertDescription>
            </Alert>
          )}

          {decisionError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{decisionError}</AlertDescription>
            </Alert>
          )}

          {/* Main Content with Tabs */}
          <Tabs defaultValue="application_details" className="space-y-6">
          <TabsList className={`grid w-full ${isTransferApp ? 'grid-cols-4' : 'grid-cols-5'} h-auto p-1 bg-muted/80`}>
              <TabsTrigger value="application_details" className="py-2.5">Application Details</TabsTrigger>
              {!isTransferApp && (
                <TabsTrigger value="field_report" className="py-2.5">Assessment Report</TabsTrigger>
              )}
              <TabsTrigger value="contract_preview" className="py-2.5">Contract Preview</TabsTrigger>
              <TabsTrigger value="permit_preview" className="py-2.5">Permit Preview</TabsTrigger>
              <TabsTrigger value="internal_notes" className="py-2.5">History & Notes</TabsTrigger>
        </TabsList>

            <TabsContent value="application_details" className="space-y-6 focus-visible:outline-none">
              {application && <RegistryPermitComparisonCard application={application} />}
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
            />
              ) : null}
        </TabsContent>

            {/* Assessment Report Tab - Hidden for transfer applications */}
            {!isTransferApp && (
            <TabsContent value="field_report" className="space-y-6 focus-visible:outline-none">
              {(() => {
                const intended = (application as any)?.intended_activities as string[] | null | undefined;
                let wuc: string | null = null;
                try {
                  const notes = application?.internal_notes;
                  if (typeof notes === "string") { const p = JSON.parse(notes); wuc = p?.waterUseCategory ?? null; }
                  else if (notes && typeof notes === "object") { wuc = (notes as any)?.waterUseCategory ?? null; }
                } catch {}
                const rt: ReportType = determineReportType(intended || null, application.water_purpose || null, wuc);
                return (
                  <FieldReportUpload
                    applicationId={application.id}
                    existingFiles={fieldReportFiles}
                    summary={fieldReportSummary}
                    inspectorName={inspectorName}
                    inspectionDate={inspectionDate}
                    assessmentSubmittedDate={assessmentSubmittedDate}
                    onFilesChange={() => {}}
                    onSummaryChange={() => {}}
                    onInspectorNameChange={() => {}}
                    onInspectionDateChange={() => {}}
                    inspectorNameReadOnly={true}
                    readOnly={true}
                    hideSummary={true}
                    showInlineValidation={false}
                    betweenDetailsAndDocuments={
                      <div className="space-y-6">
                        {/* Assessor Recommendations - Read-only for approvers */}
                        <AssessorRecommendations
                          requestedDurationYears={requestedDurationYears}
                          requestedVolumeM3={requestedVolumeM3}
                          recommendedDurationYears={(application as any).is_renewal ? renewalRecommendedDurationYears : recommendedDurationYears}
                          recommendedVolumeM3={(application as any).is_renewal ? renewalRecommendedVolumeM3 : recommendedVolumeM3}
                          readOnly={true}
                          isConcession={rt === "concession"}
                        />
                        
                        {/* Assessment Report Form */}
                        <AssessmentReportForm
                          reportData={assessmentReportData}
                          onReportDataChange={() => {}}
                          reportType={rt}
                          readOnly={true}
                          inspectionDate={inspectionDate}
                          assessmentSubmittedDate={assessmentSubmittedDate}
                          recommendation={recommendation}
                          onRecommendationChange={() => {}}
                        />
                      </div>
                    }
                  />
                );
              })()}
        </TabsContent>
            )}


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
            <TabsContent value="permit_preview" className="space-y-4 focus-visible:outline-none">
              {application.id && (
                <ApproverChangedSlotsPane
                  applicationId={application.id}
                  onAcknowledgementChange={setOverrideReview}
                />
              )}
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
            </TabsContent>

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
      <Dialog open={isDecisionDialogOpen} onOpenChange={setIsDecisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionType === "approve"
                ? "Approve Application"
                : decisionType === "reject"
                  ? "Reject Application"
                  : "Return Application to Verification"}
            </DialogTitle>
            <DialogDescription>
              {decisionType === "approve"
                ? "You are about to approve this water permit application. This decision is final."
                : decisionType === "reject"
                  ? "You are about to reject this water permit application. Please provide a reason."
                  : "You are about to return this application to the verification stage. Please provide a reason."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm bg-muted/50 p-4 rounded-lg">
              <div>
                <span className="font-medium text-muted-foreground">Application ID:</span>
                <p className="mt-1 font-medium">{application.application_number || application.id}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Applicant:</span>
                <p className="mt-1 font-medium">{getApplicantName(application)}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Type:</span>
                <p className="mt-1 font-medium">{application.water_purpose || "N/A"}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Current Status:</span>
                <p className="mt-1 font-medium">{application.status.replaceAll("_", " ")}</p>
              </div>
            </div>

            {decisionType === "approve" && overrideReview.count > 0 && !overrideReview.acknowledged ? (
              <Alert variant="destructive">
                <AlertDescription>
                  This application has {overrideReview.count} assessor text edit
                  {overrideReview.count === 1 ? "" : "s"} on the permit/contract.
                  Please open the <strong>Permit Preview</strong> tab, review the diffs,
                  and tick the acknowledgement before approving.
                </AlertDescription>
              </Alert>
            ) : null}

            {decisionType === "reject" || decisionType === "return_to_assessment" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {decisionType === "reject" ? "Rejection Reason (Required)" : "Reason for Return to Verification (Required)"}
                </label>
                <div className="space-y-2">
                  <Select
                    value={decisionReasonPreset}
                    onValueChange={(value) => {
                      setDecisionReasonPreset(value);
                      setDecisionReason(value === "other" ? "" : value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {decisionType === "reject" ? (
                        <>
                          <SelectItem value="Incomplete documentation">Incomplete documentation</SelectItem>
                          <SelectItem value="Non-compliance with requirements">Non-compliance with requirements</SelectItem>
                          <SelectItem value="Inconsistent information provided">Inconsistent information provided</SelectItem>
                          <SelectItem value="Does not meet technical requirements">Does not meet technical requirements</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="Missing or incomplete supporting documents">Missing or incomplete supporting documents</SelectItem>
                          <SelectItem value="Verification details require clarification">Verification details require clarification</SelectItem>
                          <SelectItem value="Field assessment requires correction">Field assessment requires correction</SelectItem>
                          <SelectItem value="Additional technical review is required">Additional technical review is required</SelectItem>
                        </>
                      )}
                      <SelectItem value="other">Other...</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    placeholder={
                      decisionReasonPreset === "other" || decisionReasonPreset === ""
                        ? decisionType === "reject"
                          ? "Type rejection reason..."
                          : "Type reason for returning to verification..."
                        : "Add details (optional)"
                    }
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 pt-6">
            <Button variant="outline" onClick={() => setIsDecisionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleFinalDecision}
              disabled={
                submittingDecision ||
                (decisionType !== "approve" && !decisionReason.trim()) ||
                (decisionType === "approve" &&
                  overrideReview.count > 0 &&
                  !overrideReview.acknowledged)
              }
              variant={
                decisionType === "approve"
                  ? "default"
                  : decisionType === "reject"
                    ? "destructive"
                    : "outline"
              }
              className={decisionType === "approve" ? "bg-green-600 hover:bg-green-700" : ""}
              title={
                decisionType === "approve" &&
                overrideReview.count > 0 &&
                !overrideReview.acknowledged
                  ? "Open the Permit Preview tab and acknowledge the assessor text edits before approving"
                  : undefined
              }
            >
              {submittingDecision ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : decisionType === "approve" ? (
                "Approve Application"
              ) : decisionType === "reject" ? (
                "Reject Application"
              ) : (
                "Return to Verification"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </DashboardLayout>
    </ProtectedRoute>
  );
} 
