"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  Check, 
  X, 
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  XCircle,
  ClipboardCheck,
  MapPin,
  Droplets,
  Leaf,
  Shield,
  AlertTriangle,
  Info,
  Settings,
  Download,
  FileText
} from "lucide-react";
import { geometryToCoordinatePolygons } from "@/lib/geoUtils";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Application, ApplicationStatus, User, Document } from "@/types/database";
import dynamic from "next/dynamic";
import { getDocumentUrl } from "@/lib/supabase-storage";
import { resolveDocumentFieldToken } from "@/lib/documents/upload-mapping";
import { generateFieldReportPdf, FieldReportAssessment, FieldReportApplicationData } from "@/lib/pdf-generator";

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

interface ApplicationWithRelations extends Application {
  applicant?: User;
  documents?: Document[];
}

// Transform Application data back to form format for viewing (copied from review page)
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
    const noteLines = notes.split('\n');
    noteLines.forEach(line => {
      const match = line.match(/^(.+?):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        legacyNotesMap[key.trim()] = value.trim();
      }
    });
  }

  // Base application data mapping
  formData.fullNameApplicant = userProfile?.company_name || 
                              (userProfile?.first_name && userProfile?.last_name ? 
                               `${userProfile.first_name} ${userProfile.last_name}` : '') || '';
  formData.categoryApplicant = userProfile?.account_type || 'individual';
  formData.emailAddress = userProfile?.email || '';
  formData.telephoneContact = userProfile?.phone || '';
  
  // Project information
  formData.projectTitle = application.project_title || '';
  formData.projectDescription = application.project_description || '';
  formData.projectValue = application.project_value || 0;
  
  // Water source information
  formData.waterSourceType = application.water_source || 'stream_river';
  formData.nameSourceWater = storedFormData.nameSourceWater || legacyNotesMap['Water Source Name'] || '';
  formData.tributaryToMain = application.tributary_name || storedFormData.tributaryToMain || '';
  
  // Location information
  formData.waterSourceProvince = application.province || '';
  formData.waterSourceDistrict = application.district || '';
  formData.waterSourceSector = application.sector || '';
  formData.waterSourceCell = application.cell || '';
  formData.waterSourceVillage = application.village || '';
  
  // Applicant location
  formData.officeProvince = application.province || '';
  formData.officeDistrict = application.district || '';
  formData.officeSector = application.sector || '';
  formData.officeCell = application.cell || '';
  formData.officeVillage = application.village || '';
  formData.officeCountry = 'Rwanda';
  
  // Water usage details
  formData.waterSupplyPopulation = application.max_daily_volume_m3 || 0;
  formData.waterSupplyPerCapitaDemand = 0;
  formData.waterSupplyTotalDailyDemand = application.max_daily_volume_m3 || 0;
  formData.waterSupplyDailyAbstraction = application.max_daily_volume_m3 || 0;
  formData.waterSupplyStorageCapacity = 0;
  
  // Water abstraction details
  formData.waterAbstractionDetails = [{
    flowRate: application.flow_rate_m3_per_second?.toString() || '',
    flowRateUnit: 'm3_per_second',
    maxAverageYearly: application.max_yearly_volume_m3 || 0,
    abstractionMethod: application.water_taking_method || ''
  }];
  
  // Intended activities (try to extract from stored data or use water purpose)
  const activities = storedFormData.intendedActivities || [];
  if (activities.length === 0 && application.water_purpose) {
    formData.intendedActivities = [application.water_purpose];
  } else {
    formData.intendedActivities = activities;
  }
  
  // Land ownership
  formData.ownsAllLand = application.owns_all_required_land || false;
  formData.hasLandAccess = true;
  formData.certificationAgreement = true;
  
  // Polygons (prefer storedFormData, fallback to DB geometry, fallback to empty)
  if (Array.isArray(storedFormData.waterSourcePolygons) && storedFormData.waterSourcePolygons.length > 0) {
    formData.waterSourcePolygons = storedFormData.waterSourcePolygons;
  } else if (Array.isArray(storedFormData.waterSourceCoordinates)) {
    formData.waterSourcePolygons = [storedFormData.waterSourceCoordinates];
  } else {
    const polys = geometryToCoordinatePolygons((application as any).coordinates);
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
  }
  
  // Additional form fields from stored data
  Object.keys(storedFormData).forEach(key => {
    if (!formData[key] && storedFormData[key] !== undefined) {
      formData[key] = storedFormData[key];
    }
  });
  
  // Mining specific fields
  formData.miningQuantityPerDay = application.mining_quantity_per_day || '';
  formData.miningQuantityPerMonth = application.mining_quantity_per_month || '';
  formData.miningMineralsType = application.mining_minerals_type || '';
  formData.miningProductionCapacityTonsPerYear = application.mining_production_capacity_tons_per_year || 0;
  
  // Irrigation fields
  formData.irrigationTotalArea = application.irrigation_total_area || 0;
  
  // Fish farming fields
  formData.fishLakeAreaHectares = application.fish_lake_area_hectares || 0;
  formData.fishPondsDiscardWaterQuantityM3PerDay = application.fish_ponds_discard_water_quantity_m3_per_day || 0;
  
  console.log('🔄 Mapped application to form data:', formData);
  return formData;
}

interface AssessmentForm {
  // Technical Feasibility
  technicalFeasibility: boolean | null;
  technicalComments: string;
  siteAccessibility: boolean | null;
  infrastructureAdequacy: boolean | null;
  
  // Environmental Assessment
  environmentalImpactLevel: "low" | "medium" | "high" | null;
  environmentalComments: string;
  mitigationRequired: boolean | null;
  
  // Water Source Assessment
  sourceReliability: boolean | null;
  sourceCapacityAdequate: boolean | null;
  sourceQualityAcceptable: boolean | null;
  waterRightsClear: boolean | null;
  
  // Overall Assessment
  overallRecommendation: "approve" | "reject" | "require_revision" | null;
  conditionsRequired: string;
  overallComments: string;
  
  // Field Visit
  fieldVisitRequired: boolean;
  fieldVisitCompleted: boolean;
  fieldVisitDate: string;
}

export default function AssessmentPage() {
  const params = useParams();
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Application form data for read-only display
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({})
  
  const [assessmentForm, setAssessmentForm] = useState<AssessmentForm>({
    technicalFeasibility: null,
    technicalComments: "",
    siteAccessibility: null,
    infrastructureAdequacy: null,
    environmentalImpactLevel: null,
    environmentalComments: "",
    mitigationRequired: null,
    sourceReliability: null,
    sourceCapacityAdequate: null,
    sourceQualityAcceptable: null,
    waterRightsClear: null,
    overallRecommendation: null,
    conditionsRequired: "",
    overallComments: "",
    fieldVisitRequired: false,
    fieldVisitCompleted: false,
    fieldVisitDate: ""
  });

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
            documents(*)
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

        setApplication(appData);

        // Process application data for form display
        const formData = mapApplicationToFormData(appData, appData.applicant);
        setInitialFormData(formData);
        
        // Process documents using smart classification (copied from review page)
        const documentMap: Record<string, { url: string; name: string }> = {};
        
        console.log('🔍 Raw documents from database:', appData.documents);
        if (appData.documents && Array.isArray(appData.documents)) {
          for (const doc of appData.documents) {
            console.log('📋 Processing document:', doc.name, 'type:', doc.type, 'path:', doc.file_path);

            if (doc.file_path && doc.name) {
              const publicUrl = getDocumentUrl(doc.file_path);
              if (publicUrl) {
                const fieldName = resolveDocumentFieldToken(doc.file_path, doc.type);
                console.log('🎯 Resolved field name:', fieldName);

                if (fieldName.startsWith('additional_')) {
                  console.log('📎 Skipping additional document for now:', fieldName);
                } else {
                  documentMap[fieldName] = {
                    url: publicUrl,
                    name: doc.name
                  };
                  console.log('✅ Mapped document:', fieldName, '→', doc.name);
                }
              } else {
                console.log('❌ Failed to get public URL for:', doc.file_path);
              }
            } else {
              console.log('❌ Missing file_path or name for document:', doc);
            }
          }
        }
        setInitialDocuments(documentMap);
        console.log('📄 Final document map:', documentMap);
        console.log('📄 Documents found:', appData.documents?.length || 0, 'documents');

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

  const updateAssessmentForm = (field: keyof AssessmentForm, value: any) => {
    setAssessmentForm(prev => ({ ...prev, [field]: value }));
  };

  const validateAssessment = (): boolean => {
    if (!assessmentForm.overallRecommendation) {
      alert('Please provide an overall recommendation');
      return false;
    }
    if (!assessmentForm.overallComments.trim()) {
      alert('Please provide overall assessment comments');
      return false;
    }
    if (assessmentForm.technicalFeasibility === null) {
      alert('Please assess technical feasibility');
      return false;
    }
    if (assessmentForm.sourceReliability === null) {
      alert('Please assess water source reliability');
      return false;
    }
    return true;
  };

  // Validate if all required fields are filled for PDF download
  const canDownloadFieldReport = (): boolean => {
    if (assessmentForm.technicalFeasibility === null) return false;
    if (assessmentForm.sourceReliability === null) return false;
    if (!assessmentForm.overallRecommendation) return false;
    if (!assessmentForm.overallComments.trim()) return false;
    if (assessmentForm.fieldVisitRequired) {
      if (!assessmentForm.fieldVisitCompleted) return false;
      if (!assessmentForm.fieldVisitDate) return false;
    }
    return true;
  };

  // Handle PDF download
  const handleDownloadFieldReport = async () => {
    if (!application || !canDownloadFieldReport()) return;

    const assessmentData: FieldReportAssessment = {
      technicalFeasibility: assessmentForm.technicalFeasibility,
      technicalComments: assessmentForm.technicalComments,
      siteAccessibility: assessmentForm.siteAccessibility,
      infrastructureAdequacy: assessmentForm.infrastructureAdequacy,
      environmentalImpactLevel: assessmentForm.environmentalImpactLevel,
      environmentalComments: assessmentForm.environmentalComments,
      mitigationRequired: assessmentForm.mitigationRequired,
      sourceReliability: assessmentForm.sourceReliability,
      sourceCapacityAdequate: assessmentForm.sourceCapacityAdequate,
      sourceQualityAcceptable: assessmentForm.sourceQualityAcceptable,
      waterRightsClear: assessmentForm.waterRightsClear,
      overallRecommendation: assessmentForm.overallRecommendation,
      conditionsRequired: assessmentForm.conditionsRequired,
      overallComments: assessmentForm.overallComments,
      fieldVisitRequired: assessmentForm.fieldVisitRequired,
      fieldVisitCompleted: assessmentForm.fieldVisitCompleted,
      fieldVisitDate: assessmentForm.fieldVisitDate
    };

    const applicantName = application.applicant?.account_type === 'individual'
      ? `${application.applicant?.first_name || ''} ${application.applicant?.last_name || ''}`.trim()
      : application.applicant?.company_name || 'Unknown';

    const applicationData: FieldReportApplicationData = {
      applicationNumber: application.application_number || '',
      projectTitle: application.project_title || '',
      applicantName: applicantName,
      applicantType: application.applicant?.account_type || 'individual',
      province: application.province || '',
      district: application.district || '',
      sector: application.sector || '',
      cell: application.cell || '',
      village: application.village || '',
      waterSource: application.water_source || '',
      waterPurpose: application.water_purpose || ''
    };

    try {
      await generateFieldReportPdf(assessmentData, applicationData);
      console.log('✅ Field report PDF generated successfully');
    } catch (error) {
      console.error('❌ Error generating field report PDF:', error);
      alert('Failed to generate field report PDF. Please try again.');
    }
  };

  const handleSubmitAssessment = async () => {
    if (!application || !validateAssessment()) {
      setSubmitting(false);
      return;
    }
    
    try {
      setSubmitting(true);
      console.log('🚀 Starting assessment submission...');
      
      // Get current user (inspector)
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('❌ Auth error:', userError);
        alert('Authentication error: ' + userError.message);
        setSubmitting(false);
        return;
      }
      
      if (!user) {
        console.error('❌ No user found');
        alert('User not authenticated');
        setSubmitting(false);
        return;
      }

      console.log('✅ User authenticated:', user.id);

      // First, let's check what columns exist in the assessments table
      console.log('🔍 Checking assessments table structure...');
      const { data: existingAssessments, error: tableCheckError } = await supabase
        .from('assessments')
        .select('*')
        .limit(1);

      if (tableCheckError) {
        console.error('❌ Table check error:', tableCheckError);
        // If assessments table doesn't exist, let's just update the application status
        console.log('⚠️ Assessments table not accessible, updating application status only...');
      } else {
        console.log('✅ Assessments table accessible, sample data:', existingAssessments);
        
        // Try a very minimal insert
        try {
          const { error: assessmentError, data: assessmentResult } = await supabase
        .from('assessments')
        .insert({
          application_id: application.id,
          inspector_id: user.id,
              overall_comments: assessmentForm.overallComments || 'Assessment completed'
            })
            .select();

          if (assessmentError) {
            console.error('❌ Assessment insert error:', {
              message: assessmentError?.message || 'Unknown error',
              details: assessmentError?.details || 'No details',
              hint: assessmentError?.hint || 'No hint',
              code: assessmentError?.code || 'No code'
            });
            console.log('⚠️ Assessment creation failed, proceeding with application update only...');
          } else {
            console.log('✅ Assessment created successfully:', assessmentResult);
          }
        } catch (insertErr) {
          console.error('❌ Assessment insert exception:', insertErr);
          console.log('⚠️ Assessment creation failed, proceeding with application update only...');
        }
      }

      // Update application status based on recommendation
      let newStatus: ApplicationStatus;
      let updateData: any = { assessed_at: new Date().toISOString() };

      switch (assessmentForm.overallRecommendation) {
        case 'approve':
          newStatus = 'pending_final_approval';
          break;
        case 'reject':
          newStatus = 'rejected';
          updateData.rejection_reason = assessmentForm.overallComments;
          break;
        case 'require_revision':
          newStatus = 'revision_required';
          updateData.revision_notes = assessmentForm.overallComments;
          break;
        default:
          throw new Error('Invalid recommendation');
      }

      updateData.status = newStatus;
      console.log('📊 Updating application with:', updateData);

      const { error: appError, data: appResult } = await supabase
        .from('applications')
        .update(updateData)
        .eq('id', application.id)
        .select();

      if (appError) {
        console.error('❌ Application update error:', appError);
        console.error('Update data:', updateData);
        console.error('Error details:', {
          message: appError.message,
          details: appError.details,
          hint: appError.hint,
          code: appError.code
        });
        throw new Error(`Application update failed: ${appError.message}`);
      }

      console.log('✅ Application updated:', appResult);

      const messages = {
        approve: "✅ Application approved for final approval",
        reject: "❌ Application rejected",
        require_revision: "📝 Application returned for revision"
      };

      alert(messages[assessmentForm.overallRecommendation]);
      console.log('✅ Assessment submission completed successfully');
      router.push('/inspection');
    } catch (err) {
      console.error('💥 Error submitting assessment:', err);
      alert(`Failed to submit assessment: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      console.log('🔄 Resetting submitting state');
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    // Keep flexible to avoid runtime issues if DB gains new statuses.
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
              <p className="text-muted-foreground">Loading application for assessment...</p>
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
                onClick={() => router.push('/inspection')} 
                className="mt-4"
                variant="outline"
              >
                Back to Inspector Dashboard
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

  return (
    <DashboardLayout>
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
                  Back to Inspector Dashboard
                </Button>
              </Link>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
                  Technical Assessment: {application.application_number}
                </h1>
                {getStatusBadge(application.status)}
              </div>

              <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base leading-relaxed [&:not(:first-child)]:mt-6">
                Conduct technical assessment of water permit application for feasibility and compliance
              </p>
            </div>
          </div>

          {/* Main Content with Tabs */}
          <Tabs defaultValue="application_overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="application_overview">Application Overview</TabsTrigger>
              <TabsTrigger value="assessment">Technical Assessment</TabsTrigger>
            </TabsList>

            {/* Application Overview Tab */}
            <TabsContent value="application_overview" className="space-y-6">
              {/* Application Form in Read-only Mode */}
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
                  onSubmit={async () => {}} // Dummy handler for read-only form
                  onSaveAsDraft={async () => {}} // Dummy handler for read-only form
                  isLoading={false}
                  initialData={initialFormData}
                  initialDocuments={initialDocuments}
                  mode="view"
                  readOnly={true}
                />
              )}
            </TabsContent>



            {/* Technical Assessment Tab */}
            <TabsContent value="assessment" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  {/* Technical Feasibility Assessment */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Technical Feasibility Assessment
                      </CardTitle>
                      <CardDescription>
                        Evaluate the technical aspects and infrastructure adequacy
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Technical Feasibility *</Label>
                            <div className="flex items-center space-x-4">
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.technicalFeasibility === true}
                                  onCheckedChange={(checked) => updateAssessmentForm('technicalFeasibility', checked ? true : null)}
                                />
                                <span className="text-sm">✅ Feasible</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.technicalFeasibility === false}
                                  onCheckedChange={(checked) => updateAssessmentForm('technicalFeasibility', checked ? false : null)}
                                />
                                <span className="text-sm">❌ Not Feasible</span>
                              </label>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Site Accessibility</Label>
                            <div className="flex items-center space-x-4">
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.siteAccessibility === true}
                                  onCheckedChange={(checked) => updateAssessmentForm('siteAccessibility', checked ? true : null)}
                                />
                                <span className="text-sm">✅ Accessible</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.siteAccessibility === false}
                                  onCheckedChange={(checked) => updateAssessmentForm('siteAccessibility', checked ? false : null)}
                                />
                                <span className="text-sm">❌ Limited Access</span>
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Infrastructure Adequacy</Label>
                            <div className="flex items-center space-x-4">
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.infrastructureAdequacy === true}
                                  onCheckedChange={(checked) => updateAssessmentForm('infrastructureAdequacy', checked ? true : null)}
                                />
                                <span className="text-sm">✅ Adequate</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.infrastructureAdequacy === false}
                                  onCheckedChange={(checked) => updateAssessmentForm('infrastructureAdequacy', checked ? false : null)}
                                />
                                <span className="text-sm">❌ Inadequate</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="technical-comments">Technical Comments</Label>
                        <Textarea
                          id="technical-comments"
                          placeholder="Detailed technical assessment comments, infrastructure evaluation, equipment adequacy..."
                          value={assessmentForm.technicalComments}
                          onChange={(e) => updateAssessmentForm('technicalComments', e.target.value)}
                          rows={4}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Environmental Impact Assessment */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Leaf className="h-5 w-5" />
                        Environmental Impact Assessment
                      </CardTitle>
                      <CardDescription>
                        Evaluate environmental impacts and mitigation requirements
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Environmental Impact Level</Label>
                            <Select value={assessmentForm.environmentalImpactLevel || ""} onValueChange={(value) => updateAssessmentForm('environmentalImpactLevel', value || null)}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select impact level" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="low">🟢 Low Impact</SelectItem>
                                <SelectItem value="medium">🟡 Medium Impact</SelectItem>
                                <SelectItem value="high">🔴 High Impact</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Mitigation Required</Label>
                            <div className="flex items-center space-x-4">
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.mitigationRequired === true}
                                  onCheckedChange={(checked) => updateAssessmentForm('mitigationRequired', checked ? true : null)}
                                />
                                <span className="text-sm">✅ Required</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.mitigationRequired === false}
                                  onCheckedChange={(checked) => updateAssessmentForm('mitigationRequired', checked ? false : null)}
                                />
                                <span className="text-sm">❌ Not Required</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="environmental-comments">Environmental Comments</Label>
                        <Textarea
                          id="environmental-comments"
                          placeholder="Environmental impact assessment, ecosystem effects, biodiversity concerns, mitigation measures..."
                          value={assessmentForm.environmentalComments}
                          onChange={(e) => updateAssessmentForm('environmentalComments', e.target.value)}
                          rows={4}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Water Source Assessment */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Droplets className="h-5 w-5" />
                        Water Source Assessment
                      </CardTitle>
                      <CardDescription>
                        Evaluate water source characteristics and sustainability
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Source Reliability *</Label>
                            <div className="flex items-center space-x-4">
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.sourceReliability === true}
                                  onCheckedChange={(checked) => updateAssessmentForm('sourceReliability', checked ? true : null)}
                                />
                                <span className="text-sm">✅ Reliable</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.sourceReliability === false}
                                  onCheckedChange={(checked) => updateAssessmentForm('sourceReliability', checked ? false : null)}
                                />
                                <span className="text-sm">❌ Unreliable</span>
                              </label>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Source Capacity Adequate</Label>
                            <div className="flex items-center space-x-4">
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.sourceCapacityAdequate === true}
                                  onCheckedChange={(checked) => updateAssessmentForm('sourceCapacityAdequate', checked ? true : null)}
                                />
                                <span className="text-sm">✅ Adequate</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.sourceCapacityAdequate === false}
                                  onCheckedChange={(checked) => updateAssessmentForm('sourceCapacityAdequate', checked ? false : null)}
                                />
                                <span className="text-sm">❌ Insufficient</span>
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Source Quality Acceptable</Label>
                            <div className="flex items-center space-x-4">
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.sourceQualityAcceptable === true}
                                  onCheckedChange={(checked) => updateAssessmentForm('sourceQualityAcceptable', checked ? true : null)}
                                />
                                <span className="text-sm">✅ Acceptable</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.sourceQualityAcceptable === false}
                                  onCheckedChange={(checked) => updateAssessmentForm('sourceQualityAcceptable', checked ? false : null)}
                                />
                                <span className="text-sm">❌ Poor Quality</span>
                              </label>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Water Rights Clear</Label>
                            <div className="flex items-center space-x-4">
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.waterRightsClear === true}
                                  onCheckedChange={(checked) => updateAssessmentForm('waterRightsClear', checked ? true : null)}
                                />
                                <span className="text-sm">✅ Clear</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.waterRightsClear === false}
                                  onCheckedChange={(checked) => updateAssessmentForm('waterRightsClear', checked ? false : null)}
                                />
                                <span className="text-sm">❌ Disputed</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Field Visit Section */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        Field Visit Information
                      </CardTitle>
                      <CardDescription>
                        Field visit requirements and completion status
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                              <Checkbox 
                                checked={assessmentForm.fieldVisitRequired}
                                onCheckedChange={(checked) => updateAssessmentForm('fieldVisitRequired', checked)}
                              />
                              <Label className="text-sm font-medium">Field Visit Required</Label>
                            </div>
                          </div>

                          {assessmentForm.fieldVisitRequired && (
                            <div className="space-y-3">
                              <div className="flex items-center space-x-2">
                                <Checkbox 
                                  checked={assessmentForm.fieldVisitCompleted}
                                  onCheckedChange={(checked) => updateAssessmentForm('fieldVisitCompleted', checked)}
                                />
                                <Label className="text-sm font-medium">Field Visit Completed</Label>
                              </div>
                            </div>
                          )}
                        </div>

                        {assessmentForm.fieldVisitRequired && (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="field-visit-date">Field Visit Date</Label>
                              <input
                                type="date"
                                id="field-visit-date"
                                value={assessmentForm.fieldVisitDate}
                                onChange={(e) => updateAssessmentForm('fieldVisitDate', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-input rounded-md"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Overall Assessment */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ClipboardCheck className="h-5 w-5" />
                        Overall Assessment & Recommendation
                      </CardTitle>
                      <CardDescription>
                        Provide your final assessment and recommendation
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Overall Recommendation *</Label>
                          <Select value={assessmentForm.overallRecommendation || ""} onValueChange={(value) => updateAssessmentForm('overallRecommendation', value || null)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select recommendation" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="approve">✅ Approve for Final Review</SelectItem>
                              <SelectItem value="require_revision">📝 Require Revision</SelectItem>
                              <SelectItem value="reject">❌ Reject Application</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="conditions-required">Conditions Required</Label>
                          <Textarea
                            id="conditions-required"
                            placeholder="Specify any conditions or requirements for approval (if applicable)..."
                            value={assessmentForm.conditionsRequired}
                            onChange={(e) => updateAssessmentForm('conditionsRequired', e.target.value)}
                            rows={3}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="overall-comments">Overall Assessment Comments *</Label>
                          <Textarea
                            id="overall-comments"
                            placeholder="Provide comprehensive assessment summary, key findings, and detailed justification for your recommendation..."
                            value={assessmentForm.overallComments}
                            onChange={(e) => updateAssessmentForm('overallComments', e.target.value)}
                            rows={6}
                            required
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Assessment Actions Sidebar */}
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Assessment Status
                      </CardTitle>
                      <CardDescription>
                        Current assessment progress
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        <div className="flex items-center gap-2">
                          {assessmentForm.technicalFeasibility !== null ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-amber-600" />
                          )}
                          <span>Technical feasibility</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {assessmentForm.environmentalImpactLevel ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-amber-600" />
                          )}
                          <span>Environmental impact</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {assessmentForm.sourceReliability !== null ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-amber-600" />
                          )}
                          <span>Water source assessment</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {assessmentForm.overallRecommendation ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-amber-600" />
                          )}
                          <span>Overall recommendation</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {assessmentForm.overallComments.trim() ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-amber-600" />
                          )}
                          <span>Assessment comments</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Field Report
                      </CardTitle>
                      <CardDescription>
                        Download assessment as PDF
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Button
                        onClick={handleDownloadFieldReport}
                        disabled={!canDownloadFieldReport()}
                        variant="outline"
                        className="w-full gap-2"
                        size="lg"
                      >
                        <Download className="h-4 w-4" />
                        Download Field Report
                      </Button>
                      
                      {!canDownloadFieldReport() && (
                        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                          <div className="text-sm text-blue-800">
                            Complete all required fields to enable PDF download:
                            <ul className="mt-1 ml-4 list-disc text-xs">
                              {assessmentForm.technicalFeasibility === null && <li>Technical feasibility</li>}
                              {assessmentForm.sourceReliability === null && <li>Source reliability</li>}
                              {!assessmentForm.overallRecommendation && <li>Overall recommendation</li>}
                              {!assessmentForm.overallComments.trim() && <li>Assessment comments</li>}
                              {assessmentForm.fieldVisitRequired && !assessmentForm.fieldVisitCompleted && <li>Field visit completed</li>}
                              {assessmentForm.fieldVisitRequired && !assessmentForm.fieldVisitDate && <li>Field visit date</li>}
                            </ul>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Submit Assessment</CardTitle>
                      <CardDescription>
                        Complete your technical assessment
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Button 
                        onClick={handleSubmitAssessment}
                        disabled={submitting || !assessmentForm.overallRecommendation || !assessmentForm.overallComments.trim()}
                        className="w-full gap-2"
                        size="lg"
                      >
                        {submitting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ClipboardCheck className="h-4 w-4" />
                        )}
                        Submit Assessment
                      </Button>
                      
                      {(!assessmentForm.overallRecommendation || !assessmentForm.overallComments.trim()) && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                          <div className="text-sm text-amber-800">
                            Please complete the overall recommendation and assessment comments before submitting.
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Info className="h-5 w-5" />
                        Assessment Guidelines
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm text-muted-foreground">
                        <p><strong>Technical Assessment:</strong> Evaluate infrastructure, accessibility, and feasibility</p>
                        <p><strong>Environmental:</strong> Assess ecological impact and mitigation needs</p>
                        <p><strong>Water Source:</strong> Verify availability, quality, and sustainability</p>
                        <p><strong>Field Visit:</strong> Recommend if on-site verification is needed</p>
                        <p><strong>Documentation:</strong> Ensure all required documents are complete</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
