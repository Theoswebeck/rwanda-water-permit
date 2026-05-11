"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractTermsPreview } from "@/components/contract/contract-terms-preview";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FieldReportUpload, FieldReportFile } from "@/components/inspection/field-report-upload";
import { AssessmentReportForm } from "@/components/inspection/assessment-report-form";
import type { AssessmentReportData, ReportType } from "@/lib/assessment-report-utils";
import { determineReportType, mergeAssessmentReportData, normalizeAssessmentReportData, prefillAssessmentReportFromApplication } from "@/lib/assessment-report-utils";
import { AssessorRecommendations } from "@/components/inspection/assessor-recommendations";
import type { RecommendationData } from "@/components/inspection/verification-summary";
import { cn } from "@/lib/utils";
import { 
  ArrowLeft, 
  Check, 
  X, 
  FileText, 
  AlertTriangle,
  CheckCircle,
  Loader2,
  XCircle,
  ClipboardCheck,
  User2,
  Mail
} from "lucide-react";
import Link from "next/link";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { supabase, createAuditLog } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";
import { enrichModificationChanges } from "@/lib/application-utils";
import { getApplicationWorkflowKind } from "@/lib/application-workflow";
import { resolveDocumentFieldToken } from "@/lib/documents/upload-mapping";
import { mergeAdditionalDocumentUrls } from "@/lib/documents/additional-documents";
import { buildSyntheticPermitFromNotes } from "@/lib/permit/build-synthetic-permit";
import type { Application, ApplicationStatus, User as UserType, Document, Review } from "@/types/database";
import { ApplicationComments } from "@/components/shared/ApplicationComments";
import { RegistryPermitComparisonCard } from "@/components/inspection/registry-permit-comparison-card";
import { type PermitWithApplication } from "@/components/dashboard/permit-select-for-renewal";
import { PermitPreviewFrame } from "@/components/staff/permit-preview-frame";

type BannerKind = "success" | "error" | "info";
type UIBanner = {
  scope: string;
  kind: BannerKind;
  title: string;
  description?: string;
};

const BANNER_STORAGE_KEY = "waterpermit:uiBanner";

function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function persistBanner(banner: UIBanner) {
  try {
    sessionStorage.setItem(BANNER_STORAGE_KEY, JSON.stringify({ ...banner, ts: Date.now() }));
  } catch {
    // ignore (storage may be unavailable)
  }
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

interface Comment {
  id: string;
  author: string;
  role: string;
  avatar: string;
  content: string;
  timestamp: string;
  created_at: string;
}

// Transform Application data back to form format for viewing (copied from main application page)
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
    
    console.log('🔍 Key fields restored:', {
      nameSourceWater: formData.nameSourceWater,
      tributaryToMain: formData.tributaryToMain,
      waterSourceType: formData.waterSourceType,
      fullNameApplicant: formData.fullNameApplicant
    });
    
  } else {
    // Legacy format: reconstruct from basic database fields and legacy notes
    console.log('🔄 Restoring form data from legacy format');
    
    // Basic applicant information (using internal notes and project title)
    formData.fullNameApplicant = application.project_title?.replace(' Water Permit Application', '') || 'Draft Application';
    formData.categoryApplicant = legacyNotesMap['Category']?.toLowerCase() || 'individual';
    
    // Set default values for required fields
    formData.nameSourceWater = application.water_body_name || '';
    formData.tributaryToMain = application.tributary_name || '';
    formData.waterSourceType = 'stream_river'; // Default
  }
  
  return formData;
}

export default function ReviewApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSendToVerificationDialog, setShowSendToVerificationDialog] = useState(false);
  const [sendToVerificationLoading, setSendToVerificationLoading] = useState(false);
  
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

  // Assessment evidence (read-only) - matches Assessment/Approver UX
  const [fieldReportFiles, setFieldReportFiles] = useState<FieldReportFile[]>([]);
  const [fieldReportSummary, setFieldReportSummary] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  const [assessmentSubmittedDate, setAssessmentSubmittedDate] = useState("");
  const [assessmentReportData, setAssessmentReportData] = useState<Partial<AssessmentReportData>>({});
  const [recommendation, setRecommendation] = useState<RecommendationData>({ recommendation: null, explanationText: "" });
  const [reportType, setReportType] = useState<ReportType>("abstraction");
  const [banner, setBanner] = useState<Omit<UIBanner, "scope"> | null>(null);
  
  // Assigned assessor info (for Return to Assessment dialog)
  const [assignedAssessor, setAssignedAssessor] = useState<{ firstName: string; lastName: string; email: string } | null>(null);

  // Assessor Recommendations State (read-only for reviewers)
  const [requestedDurationYears, setRequestedDurationYears] = useState<number | undefined>(undefined);
  const [requestedVolumeM3, setRequestedVolumeM3] = useState<number | undefined>(undefined);
  const [recommendedDurationYears, setRecommendedDurationYears] = useState<number | undefined>(undefined);
  const [recommendedVolumeM3, setRecommendedVolumeM3] = useState<number | undefined>(undefined);

  useEffect(() => {
    // Restore any persisted banner after a router.refresh()
    try {
      const raw = sessionStorage.getItem(BANNER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UIBanner> & { ts?: number };
        if (parsed && parsed.scope && parsed.scope === (params.id as string) && parsed.kind && parsed.title) {
          setBanner({ kind: parsed.kind, title: parsed.title, description: parsed.description });
          sessionStorage.removeItem(BANNER_STORAGE_KEY);
        }
      }
    } catch {
      // ignore
    }
  }, [params.id]);

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

        if (appError) {
          if (appError.code === 'PGRST116') {
            setError('Application not found');
          } else {
            throw appError;
          }
          return;
        }

        // If there's an assigned reviewer, fetch the assigned user information
        if (appData.assigned_reviewer_id) {
          const { data: assignedUserData, error: assignedUserError } = await supabase
            .from('users')
            .select('first_name, last_name, role')
            .eq('id', appData.assigned_reviewer_id)
            .single();
            
          if (!assignedUserError && assignedUserData) {
            (appData as any).assigned_to_user = assignedUserData;
          }
        }

        // Fetch assigned assessor info (for Return to Assessment dialog)
        if (appData.assigned_assessor_id) {
          const { data: assessorData } = await supabase
            .from('users')
            .select('first_name, last_name, email')
            .eq('id', appData.assigned_assessor_id)
            .single();

          if (assessorData) {
            setAssignedAssessor({
              firstName: assessorData.first_name || '',
              lastName: assessorData.last_name || '',
              email: assessorData.email || '',
            });
          }
        }

        setApplication(appData);

        // Transform application data to form format
        const formData = mapApplicationToFormData(appData, null);
        console.log('✅ Form data mapped:', formData);

        // Handle transfer applications: load transfer data and original permit details
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
            // PermitTransferForm handles this via isManualPermit check.
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
        
        // Process documents for form
        const documentMap: Record<string, { url: string; name: string }> = {};
        const currentDocuments = (appData as { documents?: unknown }).documents;
        const documentsForAdditionalLinks = Array.isArray(currentDocuments)
          ? [...currentDocuments]
          : [];
        // Helper: process a list of document rows into the documentMap
        const processDocumentsIntoMap = (docs: any[], label: string) => {
          console.log(`🔍 [${label}] Processing ${docs.length} documents`);
          for (const doc of docs) {
            if (doc.file_path && doc.name) {
              const publicUrl = getDocumentUrl(doc.file_path);
              if (publicUrl) {
                const fieldName = resolveDocumentFieldToken(doc.file_path, doc.type);
                if (fieldName.startsWith('additional_')) {
                  // Skip additional documents for now
                } else if (!documentMap[fieldName]) {
                  // Only set if not already mapped (modification's own docs take priority)
                  documentMap[fieldName] = { url: publicUrl, name: doc.name };
                  console.log(`✅ [${label}] Mapped document:`, fieldName, '→', doc.name);
                }
              }
            }
          }
        };

        // Collect ALL document rows for Document Verification tab
        // 1. Process documents from this application first (they take priority)
        if (appData.documents && Array.isArray(appData.documents)) {
          processDocumentsIntoMap(appData.documents, 'Current App');
        }

        // 2. For modification applications: also load documents from the original application
        //    so pre-existing attachments that weren't re-uploaded are still visible.
        if (modificationDetected) {
          const originalAppId = (appData as any).modified_from_application_id || parsedNotes?.originalApplicationId;
          if (originalAppId) {
            console.log('📎 [Modification] Loading documents from original application:', originalAppId);
            try {
              const { data: originalDocs, error: origDocsError } = await supabase
                .from('documents')
                .select('*')
                .eq('application_id', originalAppId)
                .order('created_at', { ascending: false });

              if (!origDocsError && Array.isArray(originalDocs) && originalDocs.length > 0) {
                documentsForAdditionalLinks.push(...originalDocs);
                processDocumentsIntoMap(originalDocs, 'Original App');
              } else if (origDocsError) {
                console.error('❌ Error fetching original application documents:', origDocsError);
              } else {
                console.log('⚠️ No documents found in original application');
              }
            } catch (origErr) {
              console.error('❌ Error loading original application documents:', origErr);
            }
          }
        }
        
        setInitialFormData(mergeAdditionalDocumentUrls(formData, documentsForAdditionalLinks, getDocumentUrl));
        setInitialDocuments(documentMap);
        console.log('📄 Final document map:', documentMap);

        // Fetch existing assessment evidence (read-only)
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
          setInspectionDate(
            existingAssessment.inspection_date ||
            toDateInputValue(existingAssessment.created_at)
          );
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
                path,
                size: 0,
                type: name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
                uploadedAt
              };
            });
            setFieldReportFiles(files);
          }
        } else {
          setAssessmentSubmittedDate("");
          console.log('⚠️ No existing assessment found for application');
        }

        // Prefill assessment report template from current application + merge saved assessor inputs
        const rt: ReportType = determineReportType((appData as any)?.intended_activities as string[] | null, appData.water_purpose || null, formData?.waterUseCategory ?? null);
        setReportType(rt);
        const prefilledReport = prefillAssessmentReportFromApplication(appData, formData, appData.documents || []);
        const mergedReport = mergeAssessmentReportData(prefilledReport, savedAssessmentReportData || null);
        console.log('🔄 Merged assessment report data:', mergedReport);
        setAssessmentReportData(mergedReport);
        
        // Initialize Assessor Recommendations values (read-only for reviewers)
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
        const isConcessionApp = rt === "concession";
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

        // Fetch comments from reviews table
        const { data: reviewData, error: reviewError } = await supabase
          .from('reviews')
          .select(`
            *,
            reviewer:users!reviewer_id(first_name, last_name, role)
          `)
          .eq('application_id', appData.id)
          .order('created_at', { ascending: false });

        if (!reviewError && reviewData) {
          const formattedComments: Comment[] = reviewData.map(review => {
            const reviewer = review.reviewer as any;
            const name = reviewer ? `${reviewer.first_name} ${reviewer.last_name}` : 'Unknown User';
            const initials = reviewer ? `${reviewer.first_name?.[0] || ''}${reviewer.last_name?.[0] || ''}`.toUpperCase() : 'UU';
            
            return {
              id: review.id,
              author: name,
              role: reviewer?.role || 'reviewer',
              avatar: initials,
              content: review.overall_comments || review.technical_review || 'No comments',
              timestamp: new Date(review.created_at).toLocaleString(),
              created_at: review.created_at
            };
          });
          setComments(formattedComments);
        }
        
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
        
        const selectClause = `
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
          `;
        let permitQuery = supabase.from('permits').select(selectClause);
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

          // For renewal workflows, read assessor recommended values from the previous
          // permit's source application so all staff stages show the same locked values.
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
            console.warn("⚠️ Failed to derive renewal assessor recommendations for review page:", e);
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

  const handleAddComment = async () => {
    if (!newComment.trim() || !application) return;

    try {
      // For now, use a default reviewer ID until authentication is implemented
      // In sample data, we have reviewer with ID from users table
      const { data: reviewerData, error: reviewerError } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'reviewer')
        .limit(1)
        .single();

      if (reviewerError) {
        alert('Failed to find reviewer account');
        return;
      }

      const { data, error } = await supabase
        .from('reviews')
        .insert([{
          application_id: application.id,
          reviewer_id: reviewerData.id,
          review_stage: 'internal',
          overall_comments: newComment,
          status: 'completed'
        }])
        .select()
        .single();

      if (error) throw error;

      // Add to local comments
      const newCommentObj: Comment = {
        id: data.id,
        author: "Current Reviewer",
        role: "Reviewer",
        avatar: "CR",
        content: newComment,
        timestamp: "Just now",
        created_at: new Date().toISOString()
      };
      setComments([newCommentObj, ...comments]);
      setNewComment("");
    } catch (err) {
      console.error('Error adding comment:', err);
      alert('Failed to add comment');
    }
  };

  const handleRecommendForVerification = async () => {
    if (!application) return;
    
    try {
      setSendToVerificationLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      const previousStatus = application.status;

      const { error } = await supabase
        .from('applications')
        .update({ status: 'pending_verification', updated_at: new Date().toISOString() })
        .eq('id', application.id);

      if (error) throw error;

      // Create audit log entry
      try {
        await createAuditLog({
          action: 'application.status_changed',
          entity_type: 'application',
          table_name: 'applications',
          record_id: application.id,
          old_values: { status: previousStatus },
          new_values: { status: 'pending_verification' },
          description: `Application ${application.application_number} forwarded to verification`,
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
          eventType: 'application_forwarded_to_verification',
          entityType: 'application',
          entityId: application.id,
        }),
      }).catch(() => null)

      setShowSendToVerificationDialog(false);
      persistBanner({
        scope: params.id as string,
        kind: "success",
        title: "Sent to verification",
        description: "Application recommended and forwarded to verification.",
      });
      // Navigate back to dashboard to confirm action was successful
      router.push('/review');
    } catch (err) {
      console.error('Error updating application:', err);
      setBanner({ kind: "error", title: "Action failed", description: "Failed to update application. Please try again." });
    } finally {
      setSendToVerificationLoading(false);
    }
  };

  const handleReturnToAssessment = async () => {
    if (!application || !revisionNotes.trim()) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const previousStatus = application.status;
      
      const { error } = await supabase
        .from('applications')
        .update({ 
          status: 'returned_to_assessment',
          updated_at: new Date().toISOString()
        })
        .eq('id', application.id);

      if (error) throw error;

      // Persist the return reason as a review record so it shows up in ApplicationComments.
      await supabase
        .from('reviews')
        .insert([{
          application_id: application.id,
          reviewer_id: user?.id,
          review_stage: 'review',
          overall_comments: revisionNotes.trim(),
          status: 'returned'
        }]);

      // Create audit log entry
      try {
        await createAuditLog({
          action: 'application.returned_to_assessment',
          entity_type: 'application',
          table_name: 'applications',
          record_id: application.id,
          old_values: { status: previousStatus },
          new_values: { status: 'returned_to_assessment', revision_notes: revisionNotes.trim() },
          description: `Application ${application.application_number} returned to assessor for corrections`,
          severity: 'warning',
          status: 'success',
        });
      } catch (auditErr) {
        console.warn('⚠️ Failed to create audit log:', auditErr);
      }

      fetch('/api/notifications/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'application_returned_to_assessment',
          entityType: 'application',
          entityId: application.id,
        }),
      }).catch(() => null)

      setShowRevisionDialog(false);
      setRevisionNotes("");
      setShowConfirmDialog(true);
    } catch (err) {
      console.error('Error updating application:', err);
      alert('Failed to update application');
    }
  };

  const handleConfirmClose = () => {
    setShowConfirmDialog(false);
    // Navigate back to dashboard to confirm action was successful
    router.push('/review');
  };

  // Get application type badge for display - shows New, Modification, Transfer, or Renewal
  const getApplicationTypeBadge = () => {
    if (!application) return null;
    
    const workflowKind = getApplicationWorkflowKind(application as any);

    let displayType: 'new' | 'modification' | 'transfer' | 'renewal' = 'new';
    if (workflowKind === "renewal") displayType = "renewal";
    else if (workflowKind === "modification") displayType = "modification";
    else if (workflowKind === "transfer") displayType = "transfer";
    
    const typeConfig = {
      'new': { 
        label: 'New Application', 
        className: 'bg-blue-100 text-blue-700 border-blue-300' 
      },
      'modification': { 
        label: 'Modification', 
        className: 'bg-amber-100 text-amber-700 border-amber-300' 
      },
      'transfer': { 
        label: 'Transfer', 
        className: 'bg-purple-100 text-purple-700 border-purple-300' 
      },
      'renewal': { 
        label: 'Renewal', 
        className: 'bg-green-100 text-green-700 border-green-300' 
      },
    };
    
    const config = typeConfig[displayType];
    
    return (
      <Badge variant="outline" className={`${config.className} text-xs font-medium px-2 py-0.5 rounded-full border`}>
        {config.label}
      </Badge>
    );
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    // Keep flexible to avoid runtime issues if DB gains new statuses.
    const statusConfig: Record<string, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
      draft: { label: "Draft", variant: "outline" },
      submitted: { label: "Submitted", variant: "secondary" },
      under_review: { label: "Under Assessment", variant: "default" },
      pending_assessment: { label: "Pending Assessment", variant: "outline" },
      pending_review: { label: "Pending Review", variant: "default" },
      pending_verification: { label: "Pending Verification", variant: "outline" },
      pending_final_approval: { label: "Pending Approval", variant: "default" },
      pending_payment: { label: "Pending Payment", variant: "secondary" },
      approved: { label: "Approved", variant: "default" },
      approved_pending_permit: { label: "Approved - Permit Pending", variant: "default" },
      expired: { label: "Expired", variant: "outline" },
      rejected: { label: "Rejected", variant: "destructive" },
      revision_required: { label: "Needs Revision", variant: "secondary" },
      cancelled: { label: "Cancelled", variant: "outline" },
      // Returned statuses
      returned_to_assessment: { label: "🔄 Returned to Assessor", variant: "secondary" },
      returned_to_review: { label: "🔄 Returned to Reviewer", variant: "secondary" },
      returned_to_verification: { label: "🔄 Returned to Verifier", variant: "secondary" },
    };
    
    const config = statusConfig[status] || { label: status, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const shouldShowReviewActions = (status: ApplicationStatus): boolean => {
    // Only show review actions for applications that haven't been finalized
    const reviewableStatuses: ApplicationStatus[] = ['pending_review', 'under_review'];
    const finalizedStatuses: ApplicationStatus[] = ['approved', 'rejected'];
    return reviewableStatuses.includes(status) && !finalizedStatuses.includes(status);
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
              <Button 
                onClick={() => window.location.href = '/review'} 
                className="mt-4"
                variant="outline"
              >
                Back to Review Dashboard
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!application) {
    return null;
  }

  // Calculate this once to avoid any re-evaluation issues
  const showReviewActions = shouldShowReviewActions(application.status);

  return (
    <ProtectedRoute allowedRoles={['reviewer', 'admin']} requireProfile={true}>
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
              <Link href="/review">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
                </Button>
              </Link>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
                  Application Review: {application.application_number}
                </h1>
                {getApplicationTypeBadge()}
                {getStatusBadge(application.status)}
              </div>

              <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base leading-relaxed [&:not(:first-child)]:mt-6">
                Technical review and assessment of water permit application
              </p>
              {(application as any)?.assigned_to_user && (
                <p className="text-sm text-muted-foreground">
                  Assigned to: {(application as any).assigned_to_user.first_name} {(application as any).assigned_to_user.last_name} ({(application as any).assigned_to_user.role})
                </p>
              )}
            </div>
          </div>

          {/* Revision Requirements - Prominent Notice */}
          {application.status === 'revision_required' && application.revision_notes && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-6"
            >
              <Alert className="border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50 shadow-md">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <AlertDescription>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-orange-900 text-lg">⚠️ Revision Required</h3>
                      <Badge className="border border-orange-300 text-orange-700 bg-orange-100">
                        Action Needed
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium text-orange-800">Required Changes:</p>
                      <div className="bg-white/50 rounded-md p-3 border border-orange-200">
                        <p className="text-orange-900 leading-relaxed whitespace-pre-wrap">{application.revision_notes}</p>
                      </div>
                      <p className="text-sm text-orange-700 mt-2">
                        <strong>Note:</strong> Please review the specific requirements above and make the necessary changes before resubmitting your application.
                      </p>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Rejection Reason Alert — distinguish between RWB rejection and applicant T&C rejection */}
          {application.status === 'rejected' && (
            <Alert className={cn(
              "border shadow-sm",
              (application as any).terms_status === 'rejected'
                ? "border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50"
                : "border-red-200 bg-red-50"
            )}>
              {(application as any).terms_status === 'rejected' ? (
                <User2 className="h-5 w-5 text-orange-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
              <AlertDescription>
                <div className="space-y-2">
                  {(application as any).terms_status === 'rejected' ? (
                    <>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-orange-900 text-base">Rejected by Applicant</p>
                        <Badge variant="outline" className="border-orange-300 text-orange-700 bg-orange-100 text-xs">
                          Terms Declined
                        </Badge>
                      </div>
                      <p className="text-orange-800">
                        The applicant declined the Terms and Conditions for this approved application. The application has been moved to rejected status.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-red-900 text-base">Rejected by RWB</p>
                        <Badge variant="destructive" className="text-xs">
                          RWB Decision
                        </Badge>
                      </div>
                      {application.rejection_reason && (
                        <p className="text-red-700">{application.rejection_reason}</p>
                      )}
                    </>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Review Actions (aligned with Assessment/Approver UX) */}
          {(application.status === 'pending_review' || application.status === 'under_review' || application.status === 'returned_to_review') && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center gap-3 p-4 bg-background border rounded-lg shadow-sm">
                <div className="flex items-center gap-2 mr-auto">
                  <Badge variant="outline" className="h-7 px-3 text-sm font-normal bg-gray-50 text-gray-700 border-gray-200">
                    <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                    Review Actions
                  </Badge>
                </div>

                <Button
                  size="sm"
                  className="bg-black hover:bg-gray-800 text-white gap-2"
                  onClick={() => setShowSendToVerificationDialog(true)}
                >
                  <Check className="h-4 w-4" />
                  Send to Verification
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowRevisionDialog(true)}
                >
                  <X className="h-4 w-4" />
                  Return to Assessment
                </Button>
              </div>

            </motion.div>
          )}

          {/* Success/Error Banner */}
          {banner && (
            <Alert
              className={cn(
                "flex items-start justify-between gap-4 border shadow-sm",
                banner.kind === "success" && "border-green-200 bg-green-50/60",
                banner.kind === "error" && "border-red-200 bg-red-50/60",
                banner.kind === "info" && "border-slate-200 bg-slate-50/60"
              )}
            >
              <CheckCircle
                className={cn(
                  "h-4 w-4",
                  banner.kind === "success" && "text-green-700",
                  banner.kind === "error" && "text-red-700",
                  banner.kind === "info" && "text-slate-700"
                )}
              />
              <div className="flex-1">
                <AlertTitle className={cn(banner.kind === "success" && "text-green-900", banner.kind === "error" && "text-red-900")}>
                  {banner.title}
                </AlertTitle>
                {banner.description ? <AlertDescription>{banner.description}</AlertDescription> : null}
              </div>
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setBanner(null)}>
                Dismiss
              </Button>
            </Alert>
          )}

          {/* Main Content with Tabs */}
          <Tabs defaultValue="application_details" className="space-y-6">
            <TabsList className={`grid w-full ${isTransferApp ? 'grid-cols-4' : 'grid-cols-5'} h-auto p-1 bg-muted/80`}>
              <TabsTrigger value="application_details">Application Details</TabsTrigger>
              {!isTransferApp && (
                <TabsTrigger value="field_report">Assessment Report</TabsTrigger>
              )}
              <TabsTrigger value="contract_preview">Contract Preview</TabsTrigger>
              <TabsTrigger value="permit_preview">Permit Preview</TabsTrigger>
              <TabsTrigger value="internal_notes">History & Notes</TabsTrigger>
            </TabsList>

            {/* Application Details Tab */}
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
                    isBulkApplicant={!!(application as any)?.is_bulk}
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
                  onSubmit={async () => {}} // Dummy handler for read-only form
                  onSaveAsDraft={async () => {}} // Dummy handler for read-only form
                  isLoading={false}
                  initialData={initialFormData}
                  initialDocuments={initialDocuments}
                  mode="view"
                  readOnly={true}
                  currentApplication={application}
                  isBulkApplicant={!!(application as any)?.is_bulk}
                  isStaffView={true}
                />
              ) : null}
            </TabsContent>

            {/* Assessment Report Tab (read-only) - Hidden for transfer applications */}
            {!isTransferApp && (
            <TabsContent value="field_report" className="space-y-6 focus-visible:outline-none">
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
                    {/* Assessor Recommendations - Read-only for reviewers */}
                    <AssessorRecommendations
                      requestedDurationYears={requestedDurationYears}
                      requestedVolumeM3={requestedVolumeM3}
                      recommendedDurationYears={(application as any).is_renewal ? renewalRecommendedDurationYears : recommendedDurationYears}
                      recommendedVolumeM3={(application as any).is_renewal ? renewalRecommendedVolumeM3 : recommendedVolumeM3}
                      readOnly={true}
                      isConcession={reportType === "concession"}
                    />
                    
                    {/* Assessment Report Form */}
                    <AssessmentReportForm
                      reportData={assessmentReportData}
                      onReportDataChange={() => {}}
                      reportType={reportType}
                      readOnly={true}
                      inspectionDate={inspectionDate}
                      assessmentSubmittedDate={assessmentSubmittedDate}
                      recommendation={recommendation}
                      onRecommendationChange={() => {}}
                    />
                  </div>
                }
              />
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
              {application.id && <PermitPreviewFrame applicationId={application.id} />}
            </TabsContent>

            {/* Internal Notes Tab */}
            <TabsContent value="internal_notes" className="space-y-6 focus-visible:outline-none">
              {application.id && (
                <ApplicationComments
                  applicationId={application.id}
                  applicationStatus={application.status}
                  applicationSubmittedAt={application.submitted_at ?? undefined}
                  applicationCreatedAt={application.created_at}
                  applicantName={(application as any).applicant?.first_name && (application as any).applicant?.last_name 
                    ? `${(application as any).applicant.first_name} ${(application as any).applicant.last_name}`
                    : (application as any).applicant?.company_name || application.project_title?.replace(' Water Permit Application', '') || undefined}
                />
              )}
            </TabsContent>
          </Tabs>
          </motion.div>
        </div>

      {/* Success Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Application Returned to Assessment
            </DialogTitle>
            <DialogDescription>
              The application has been successfully returned to the assessor team with your notes for correction.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleConfirmClose} className="w-full">
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revision Notes Dialog */}
      <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Return Application to Assessment</DialogTitle>
            <DialogDescription>
              Please provide a clear explanation of what needs to be corrected by the assessor before re-review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Assigned Assessor Info */}
            {assignedAssessor && (
              <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3.5 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <User2 className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 leading-tight">
                    {`${assignedAssessor.firstName} ${assignedAssessor.lastName}`.trim() || 'Assessor'}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-gray-500 truncate leading-tight mt-0.5">
                    <Mail className="h-3 w-3 shrink-0" />
                    {assignedAssessor.email}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px] font-medium border-blue-200 text-blue-700 bg-white">
                  Assessor
                </Badge>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="revision-notes">Revision Notes *</Label>
              <Textarea
                id="revision-notes"
                placeholder="Please specify what needs to be corrected or updated..."
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                rows={4}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowRevisionDialog(false);
                setRevisionNotes("");
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleReturnToAssessment}
              disabled={!revisionNotes.trim()}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Return to Assessment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send to Verification Confirmation Dialog */}
      <Dialog open={showSendToVerificationDialog} onOpenChange={setShowSendToVerificationDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Action
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to send this application to verification? This action will change the application status and notify the verification team.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowSendToVerificationDialog(false)}
              disabled={sendToVerificationLoading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleRecommendForVerification}
              disabled={sendToVerificationLoading}
              className="bg-black hover:bg-gray-800 text-white gap-2"
            >
              {sendToVerificationLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Yes, Send to Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </DashboardLayout>
    </ProtectedRoute>
  );
} 