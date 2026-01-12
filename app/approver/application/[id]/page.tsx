"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Loader2,
  XCircle,
  ClipboardCheck,
  FileText
} from "lucide-react";
import Link from "next/link";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { supabase } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";
import { geometryToCoordinatePolygons } from "@/lib/geoUtils";
import type { Application, ApplicationStatus, User as UserType, Document, Review } from "@/types/database";
import { ApplicationComments } from "@/components/shared/ApplicationComments";
import { DocumentVerificationComponent, VerificationStatus } from "@/components/inspection/document-verification";
import { FieldReportUpload, FieldReportFile } from "@/components/inspection/field-report-upload";
import type { RecommendationData } from "@/components/inspection/verification-summary";
import { AssessmentReportForm } from "@/components/inspection/assessment-report-form";
import type { AssessmentReportData, ReportType } from "@/lib/assessment-report-utils";
import { determineReportType, mergeAssessmentReportData, normalizeAssessmentReportData, prefillAssessmentReportFromApplication } from "@/lib/assessment-report-utils";

// Lazy load the ApplicationForm component
const ApplicationForm = dynamic(
  () => import("@/components/dashboard/application-form-new").then(mod => ({ default: mod.ApplicationForm })),
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

interface ApplicationWithRelations extends Application {
  applicant?: UserType;
  documents?: Document[];
  reviews?: Review[];
}

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
    if (Array.isArray((application as any).intended_activities) && (application as any).intended_activities.length > 0) {
      formData.intendedActivities = (application as any).intended_activities;
    } else {
      const mappedActivity = purposeToActivity[application.water_purpose] || 'water_supply';
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
  
  // Assessment State
  const [documentVerifications, setDocumentVerifications] = useState<Record<string, { status: VerificationStatus; notes: string }>>({});
  
  // Field Report State
  const [fieldReportFiles, setFieldReportFiles] = useState<FieldReportFile[]>([]);
  const [fieldReportSummary, setFieldReportSummary] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  
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

  // Assessment Report State (template-backed)
  const [assessmentReportData, setAssessmentReportData] = useState<Partial<AssessmentReportData>>({});
  
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
          setDocumentVerifications(existingAssessment.document_verifications || {});
          setFieldReportSummary(existingAssessment.field_report_summary || "");
          setInspectorName(existingAssessment.inspector_name || "");
          setInspectionDate(existingAssessment.inspection_date || "");
          
          setChecklist({
            locationVerified: existingAssessment.location_verified || false,
            waterSourceAccessible: existingAssessment.water_source_accessible || false,
            environmentalImpactAssessed: existingAssessment.environmental_impact_assessed || false,
            technicalFeasibilityConfirmed: existingAssessment.technical_feasibility_confirmed || false,
            infrastructureAdequate: existingAssessment.infrastructure_adequate || false
          });
          
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
          console.log('⚠️ No existing assessment found for application');
        }

        // Transform application data to form format
        const formData = mapApplicationToFormData(appData, null);
        setInitialFormData(formData);

        // Prefill the official assessment report template from application data and merge saved assessor inputs
        const prefilledReport = prefillAssessmentReportFromApplication(appData, formData, appData.documents || []);
        const mergedReport = mergeAssessmentReportData(prefilledReport, savedAssessmentReportData || null);
        console.log('🔄 Merged assessment report data:', mergedReport);
        setAssessmentReportData(mergedReport);

          // Process documents for form
        const documentMap: Record<string, { url: string; name: string }> = {};
        if (appData.documents && Array.isArray(appData.documents)) {
          for (const doc of appData.documents) {
              if (doc.file_path && doc.name) {
              const publicUrl = getDocumentUrl(doc.file_path);
              if (publicUrl) {
                const pathParts = doc.file_path.split('/');
                const fileName = pathParts[pathParts.length - 1];
                const fieldNameMatch = fileName.match(/^([a-zA-Z]+(?:[A-Z][a-zA-Z]*)*)-\d+\./);
                if (fieldNameMatch) {
                  const fieldName = fieldNameMatch[1];
                  if (!fieldName.startsWith('additional_')) {
                    documentMap[fieldName] = { url: publicUrl, name: doc.name };
                  }
                } else {
                  documentMap[doc.type] = { url: publicUrl, name: doc.name };
                }
              }
            }
          }
        }
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
            
            <Link href={`/approver?id=${application.id}`}>
              <Button size="sm" className="bg-black hover:bg-gray-800 text-white gap-2">
                <FileText className="h-4 w-4" />
                Make Final Decision
              </Button>
            </Link>
        </div>

          {/* Main Content with Tabs */}
          <Tabs defaultValue="application_details" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 h-auto p-1 bg-muted/80">
              <TabsTrigger value="application_details" className="py-2.5">Application Details</TabsTrigger>
              <TabsTrigger value="doc_verification" className="py-2.5">Document Verification</TabsTrigger>
              <TabsTrigger value="field_report" className="py-2.5">Field Report</TabsTrigger>
              <TabsTrigger value="internal_notes" className="py-2.5">History & Notes</TabsTrigger>
        </TabsList>

            <TabsContent value="application_details" className="space-y-6 focus-visible:outline-none">
              {initialFormData && (
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
              isStaffView={true}
            />
          )}
        </TabsContent>

            <TabsContent value="doc_verification" className="space-y-6 focus-visible:outline-none">
              <DocumentVerificationComponent
                documents={application.documents || []}
                verifications={documentVerifications}
                onVerificationsChange={() => {}}
                readOnly={true}
              />
            </TabsContent>

            <TabsContent value="field_report" className="space-y-6 focus-visible:outline-none">
              {(() => {
                const intended = (application as any)?.intended_activities as string[] | null | undefined;
                const rt: ReportType = determineReportType(intended || null, application.water_purpose || null);
                return (
                  <FieldReportUpload
                    applicationId={application.id}
                    existingFiles={fieldReportFiles}
                    summary={fieldReportSummary}
                    inspectorName={inspectorName}
                    inspectionDate={inspectionDate}
                    onFilesChange={() => {}}
                    onSummaryChange={() => {}}
                    onInspectorNameChange={() => {}}
                    onInspectionDateChange={() => {}}
                    inspectorNameReadOnly={true}
                    readOnly={true}
                    hideSummary={true}
                    showInlineValidation={false}
                    betweenDetailsAndDocuments={
                      <AssessmentReportForm
                        reportData={assessmentReportData}
                        onReportDataChange={() => {}}
                        reportType={rt}
                        readOnly={true}
                        inspectionDate={inspectionDate}
                        recommendation={recommendation}
                        onRecommendationChange={() => {}}
                      />
                    }
                  />
                );
              })()}
        </TabsContent>

            <TabsContent value="internal_notes" className="space-y-6 focus-visible:outline-none">
          {application.id && <ApplicationComments applicationId={application.id} />}
        </TabsContent>
      </Tabs>
        </motion.div>
    </div>
    </DashboardLayout>
  );
} 
