"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { geometryToCoordinatePolygons } from "@/lib/geoUtils";
import { getApplicationWorkflowKind } from "@/lib/application-workflow";
import { cn } from "@/lib/utils";
import { 
  ArrowLeft, 
  Check, 
  X, 
  Send, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  XCircle,
  ClipboardList,
  FileCheck,
  MapPin,
  ClipboardCheck,
  Save,
  User2
} from "lucide-react";
import Link from "next/link";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { supabase } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";
import { resolveDocumentFieldToken } from "@/lib/documents/upload-mapping";
import { mergeAdditionalDocumentUrls } from "@/lib/documents/additional-documents";
import { buildSyntheticPermitFromNotes, buildSyntheticRenewalPermit } from "@/lib/permit/build-synthetic-permit";
import { enrichModificationChanges } from "@/lib/application-utils";
import type { Application, ApplicationStatus, User as UserType, Document, Review } from "@/types/database";
import { ApplicationComments } from "@/components/shared/ApplicationComments";
import { VerificationStatus } from "@/components/inspection/document-verification";
import { FieldReportUpload, FieldReportFile } from "@/components/inspection/field-report-upload";
import { VerificationSummary, VerificationChecklist, RecommendationData } from "@/components/inspection/verification-summary";
import { RegistryPermitComparisonCard } from "@/components/inspection/registry-permit-comparison-card";
import { type PermitWithApplication } from "@/components/dashboard/permit-select-for-renewal";

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
    
  } else {
    // Legacy format: reconstruct from basic database fields and legacy notes
    console.log('🔄 Restoring form data from legacy format');
    
    // Basic applicant information (using internal notes and project title)
    formData.fullNameApplicant = application.project_title?.replace(' Water Permit Application', '') || 'Draft Application';
    formData.categoryApplicant = legacyNotesMap['Category']?.toLowerCase() || 'individual';
  
    // Office address (from application location) - reverse the province mapping
    // Map database province names to Rwanda administrative data keys
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
    
    // Contact information - use profile data if available, otherwise try to extract from notes
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
    
    // Water source location (same as office for now) - reverse the province mapping
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
    formData.waterReliability = 'water_always_available'; // Default
    
    // Intended activities - reverse map from application_type and water_purpose
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
      'gaz_extraction': 'gaz_extraction',
      'other_concession': 'other_concession',
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
    if (application.estimated_usage_volume) {
      formData.waterAbstractionDetails = [{
        activity: mappedActivity,
        flowRate: '',
        flowRateUnit: 'm³/s',
        maxAverageYearly: application.estimated_usage_volume,
        abstractionMethod: application.water_taking_method || 'pump'
      }];
    } else {
      formData.waterAbstractionDetails = [{
        activity: mappedActivity,
        flowRate: '',
        flowRateUnit: 'm³/s',
        maxAverageYearly: 0,
        abstractionMethod: 'pump'
      }];
    }
    
    // Land ownership
    formData.ownsAllLand = true; // Default
    formData.hasLandAccess = true; // Default
    
    // Annexes - extract from specific fields
    if (application.electricity_generation_capacity) {
      formData.annexF_electricityDetails = application.electricity_generation_capacity;
    }
    if (application.mining_operations_type) {
      formData.annexG_miningDetails = application.mining_operations_type;
    }
  
    // Certification
    formData.certificationAgreement = true; // Must be true for saved applications
  }
  
  return formData;
}

export default function InspectorApplicationView() {
  const params = useParams();
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [showSendToApproverDialog, setShowSendToApproverDialog] = useState(false);
  
  // ApplicationForm state
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});
  
  // Renewal permit state (for renewal applications)
  const [renewalPermit, setRenewalPermit] = useState<PermitWithApplication | null>(null);
  const [loadingRenewalPermit, setLoadingRenewalPermit] = useState(false);

  // Transfer permit state (for transfer applications)
  const [transferPermit, setTransferPermit] = useState<PermitWithApplication | null>(null);
  const [loadingTransferPermit, setLoadingTransferPermit] = useState(false);
  const [transferFormData, setTransferFormData] = useState<any>(null);
  const [isTransferApp, setIsTransferApp] = useState(false);
  const [isModificationApp, setIsModificationApp] = useState(false);
  const [originalModificationApp, setOriginalModificationApp] = useState<any>(null);
  
  // Assessment State
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [documentVerifications, setDocumentVerifications] = useState<Record<string, { status: VerificationStatus; notes: string }>>({});
  
  // Field Report State
  const [fieldReportFiles, setFieldReportFiles] = useState<FieldReportFile[]>([]);
  const [fieldReportSummary, setFieldReportSummary] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);
  
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

  // Tab navigation state
  const [activeTab, setActiveTab] = useState("application_details");
  const tabTouchedRef = useRef(false);

  // Prevent accidental double-submits / re-entrancy (fast double-clicks, etc.)
  const actionInFlightRef = useRef(false);

  const isAssessable = application
    ? ['pending_assessment', 'under_review'].includes(application.status)
    : false;
  
  useEffect(() => {
    const fetchApplicationDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        const applicationNumber = decodeURIComponent(params.id as string);
        
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
        if (appData.assigned_inspector_id) {
          const { data: assignedUserData } = await supabase
            .from('users')
            .select('first_name, last_name, role')
            .eq('id', appData.assigned_inspector_id)
            .single();
            
          if (assignedUserData) {
            (appData as any).assigned_to_user = assignedUserData;
            
            // Pre-fill inspector name if not set
            if (!inspectorName) {
              setInspectorName(`${assignedUserData.first_name} ${assignedUserData.last_name}`);
            }
          }
        }

        setApplication(appData);

        // Fetch existing assessment if any
        const { data: existingAssessment } = await supabase
          .from('technical_assessments')
          .select('*')
          .eq('application_id', appData.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingAssessment) {
          setAssessmentId(existingAssessment.id);
          setDocumentVerifications(existingAssessment.document_verifications || {});
          
          // Restore field report data
          setFieldReportSummary(existingAssessment.field_report_summary || "");
          setInspectorName(existingAssessment.inspector_name || inspectorName);
          if (existingAssessment.inspection_date) {
            setInspectionDate(existingAssessment.inspection_date);
          }
          
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

          // Fetch files if needed (paths are stored in existingAssessment.field_report_files)
          // For now we'll rely on the uploaded files component to manage its state or fetch separately if needed
          // A real implementation would map file paths back to objects
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
                      company_name,
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
          setRenewalPermit(permit as PermitWithApplication);
        }
      } catch (err) {
        console.error('Error loading renewal permit:', err);
      } finally {
        setLoadingRenewalPermit(false);
      }
    };

    loadRenewalPermit();
  }, [application]);

  const saveAssessment = async (status: 'draft' | 'submitted' | 'forwarded_to_approver' | 'returned_for_revision' = 'draft') => {
    if (!application) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const assessmentData = {
        application_id: application.id,
        assessor_id: user.id,
        document_verifications: documentVerifications,
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
        status: status,
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
      }

      return result.data;
    } catch (err) {
      console.error('Error saving assessment:', err);
      throw err;
    }
  };

  const handleOpenSendToApproverDialog = () => {
    if (!application) return;

    if (fieldReportFiles.length === 0 || !fieldReportSummary.trim()) {
      alert("⚠️ Assessment Report Documents and Assessment Report Summary are required before sending for final approval.");
      tabTouchedRef.current = true;
      setActiveTab("field_report");
      return;
    }
    
    // Validation
    if (!recommendation.recommendation) {
      alert("Please select a recommendation (Yes/No) before forwarding.");
      return;
    }
    
    if (recommendation.recommendation === "no" && !recommendation.explanationText) {
      alert("Please provide an explanation for rejection.");
      return;
    }

    // All validations passed, show confirmation dialog
    setShowSendToApproverDialog(true);
  };

  const handleForwardToApprover = async () => {
    if (!application) return;

    if (actionInFlightRef.current) return;

    try {
      setSubmitLoading(true);
      actionInFlightRef.current = true;
      
      // 1. Save assessment with forwarded status
      await saveAssessment('forwarded_to_approver');
      
      // 2. Update application status
      const { error: appError } = await supabase
        .from('applications')
        .update({ 
          status: 'pending_final_approval',
          updated_at: new Date().toISOString()
        })
        .eq('id', application.id);
        
      if (appError) throw appError;
      
      setShowSendToApproverDialog(false);
      alert("Assessment submitted and application forwarded to approver.");
      // ⚡ PERFORMANCE: Use router.refresh() instead of full page reload
      router.refresh();
      
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
    
    try {
      setSubmitLoading(true);
      actionInFlightRef.current = true;

      // 1. Move the application to revision_required FIRST — this is the transition
      // that unlocks the applicant's edit flow. If it fails, abort before touching
      // the assessment so the two records can never disagree.
      const { data: updatedApp, error: appError } = await supabase
        .from('applications')
        .update({
          status: 'revision_required',
          revision_notes: revisionNotes,
          updated_at: new Date().toISOString()
        })
        .eq('id', application.id);

      if (appError) throw appError;
      if (!updatedApp || (Array.isArray(updatedApp) && updatedApp.length === 0)) {
        throw new Error('Application status update did not apply. Please refresh and try again.');
      }

      // Fire-and-forget: email the applicant that revision is required
      // (idempotent per revision cycle server-side).
      try {
        fetch('/api/notifications/send-revision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ applicationId: application.id }),
        }).catch(() => null);
      } catch {}

      // 2. Save assessment with revision status. If this fails the applicant can
      // already revise; re-running "Return for revision" will retry this save.
      await saveAssessment('returned_for_revision');
      
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
    const statusConfig: Record<string, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
      draft: { label: "Draft", variant: "outline" },
      submitted: { label: "Submitted", variant: "secondary" },
      under_review: { label: "Under Review", variant: "default" },
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
      returned_to_assessment: { label: "🔄 Returned to Assessor", variant: "secondary" },
      returned_to_review: { label: "🔄 Returned to Reviewer", variant: "secondary" },
      returned_to_verification: { label: "🔄 Returned to Verifier", variant: "secondary" },
    };
    
    const config = statusConfig[status] || { label: status, variant: "outline" as const };
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
              <Button onClick={() => window.location.href = '/inspection'} className="mt-4" variant="outline">
                Back to Inspection Dashboard
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
              <Link href="/inspection">
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
                  Assigned to: {(application as any).assigned_to_user.first_name} {(application as any).assigned_to_user.last_name}
                </p>
              )}
            </div>
          </div>

          {/* Revision Requirements - Prominent Notice.
              Kept visible after the applicant resubmits (revision_notes is no
              longer cleared on resubmission) so staff retain the reason that
              was sent to the applicant. */}
          {application.revision_notes && (
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
                      <h3 className="font-semibold text-orange-900 text-lg">
                        {application.status === 'revision_required' ? '⚠️ Revision Required' : '⚠️ Previously Returned for Revision'}
                      </h3>
                      <Badge className="border border-orange-300 text-orange-700 bg-orange-100">
                        {application.status === 'revision_required' ? 'Awaiting Applicant' : 'Resubmitted'}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium text-orange-800">
                        {application.status === 'revision_required' ? 'Required Changes:' : 'Reason sent to the applicant on the last return:'}
                      </p>
                      <div className="bg-white/50 rounded-md p-3 border border-orange-200">
                        <p className="text-orange-900 leading-relaxed whitespace-pre-wrap">{application.revision_notes}</p>
                      </div>
                      {application.status === 'revision_required' && (
                        <p className="text-sm text-orange-700 mt-2">
                          <strong>Note:</strong> The applicant has been asked to make these changes and resubmit.
                        </p>
                      )}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Rejection Reason Alert */}
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

          {/* Action Buttons Bar — only in assessment mode */}
          {isAssessable && (
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
                    Assessment Actions
                  </Badge>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => saveAssessment('draft')}
                  disabled={submitLoading}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save Draft
                </Button>

                <Button 
                  size="sm" 
                  onClick={handleOpenSendToApproverDialog}
                  disabled={submitLoading || !recommendation.recommendation}
                  className="bg-black hover:bg-gray-800 text-white gap-2"
                >
                  {submitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Submit to Approver
                </Button>

                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowRevisionDialog(true)}
                  disabled={submitLoading} 
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Return for Revision
                </Button>
              </div>
            </motion.div>
          )}

          {/* Main Content with Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className={`grid w-full ${isTransferApp ? 'grid-cols-2' : 'grid-cols-4'} h-auto p-1 bg-muted/80`}>
              <TabsTrigger value="application_details">Application Details</TabsTrigger>
              {!isTransferApp && (
                <TabsTrigger value="field_report">Assessment Report</TabsTrigger>
              )}
              {!isTransferApp && (
                <TabsTrigger value="summary">Final Recommendation</TabsTrigger>
              )}
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
                    onSubmit={async () => {}} 
                    onSaveAsDraft={async () => {}}
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
                  onSubmit={async () => {}} 
                  onSaveAsDraft={async () => {}}
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

            {/* Assessment Report Tab - Hidden for transfer applications */}
            {!isTransferApp && (
            <TabsContent value="field_report" className="space-y-6 focus-visible:outline-none">
              <FieldReportUpload
                applicationId={application.id}
                existingFiles={fieldReportFiles}
                summary={fieldReportSummary}
                inspectorName={inspectorName}
                inspectionDate={inspectionDate}
                onFilesChange={setFieldReportFiles}
                onSummaryChange={setFieldReportSummary}
                onInspectorNameChange={setInspectorName}
                onInspectionDateChange={setInspectionDate}
              />
            </TabsContent>
            )}
            
            {/* Verification Summary Tab - Hidden for transfer applications */}
            {!isTransferApp && (
            <TabsContent value="summary" className="space-y-6 focus-visible:outline-none">
              <VerificationSummary
                checklist={checklist}
                recommendation={recommendation}
                onChecklistChange={setChecklist}
                onRecommendationChange={setRecommendation}
              />
            </TabsContent>
            )}

            {/* Internal Notes Tab */}
            <TabsContent value="internal_notes" className="space-y-6 focus-visible:outline-none">
              {application.id && (
                <ApplicationComments 
                  applicationId={application.id}
                  applicationStatus={application.status}
                  applicationSubmittedAt={((application as any).resubmitted_at || application.submitted_at) ?? undefined}
                  revisionNotes={(application as any).revision_notes ?? null}
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

      {/* Submit to Approver Confirmation Dialog */}
      <Dialog open={showSendToApproverDialog} onOpenChange={setShowSendToApproverDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Action
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to submit this application to the approver? This action will change the application status and send it for final approval.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowSendToApproverDialog(false)}
              disabled={submitLoading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleForwardToApprover}
              disabled={submitLoading}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              {submitLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Yes, Submit to Approver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
