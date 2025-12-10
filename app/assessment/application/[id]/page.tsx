"use client";

import { useState, useEffect } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { 
  ArrowLeft, 
  X, 
  Send, 
  AlertTriangle,
  Loader2,
  XCircle,
  ClipboardCheck
} from "lucide-react";
import Link from "next/link";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { supabase } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";
import type { Application, ApplicationStatus, User as UserType, Document, Review } from "@/types/database";
import { ApplicationComments } from "@/components/shared/ApplicationComments";
import { DocumentVerificationComponent, VerificationStatus } from "@/components/inspection/document-verification";
import { FieldReportUpload, FieldReportFile } from "@/components/inspection/field-report-upload";
import { VerificationSummary, VerificationChecklist, RecommendationData } from "@/components/inspection/verification-summary";

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

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  email: string;
}

// Transform Application data back to form format for viewing (copied from main application page)
function mapApplicationToFormData(application: Application, userProfile?: any): any {
  const formData: any = {};
  
  // Parse internal notes to extract form-specific data
  let storedFormData: any = {};
  let legacyNotesMap: Record<string, string> = {};
  
  const notes = application.internal_notes || '';
  
  try {
    storedFormData = JSON.parse(notes);
  } catch (error) {
    // Fallback to legacy format parsing
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
  } else {
    // Legacy format
    formData.fullNameApplicant = application.project_title?.replace(' Water Permit Application', '') || 'Draft Application';
    formData.categoryApplicant = legacyNotesMap['Category']?.toLowerCase() || 'individual';
    formData.nameSourceWater = application.water_body_name || '';
    formData.tributaryToMain = application.tributary_name || '';
    formData.waterSourceType = 'stream_river';
  }
  
  return formData;
}

export default function AssessmentApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  
  // ApplicationForm state
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});
  
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
        setInitialFormData(formData);
        
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
                  // Use document type as fallback key
                  documentMap[doc.type] = { url: publicUrl, name: doc.name };
                }
              }
            }
          }
        }
        
        setInitialDocuments(documentMap);
        
        // Fetch staff members for transfer functionality
        const { data: staffData } = await supabase
          .from('users')
          .select('id, first_name, last_name, role, email')
          .in('role', ['reviewer', 'inspector', 'admin', 'approver'])
          .eq('status', 'active');
          
        setStaff(staffData || []);

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

  const saveAssessment = async (status: 'draft' | 'submitted' | 'forwarded_to_approver' | 'returned_for_revision' = 'draft') => {
    if (!application) return;
    
    try {
      setSubmitLoading(true);
      
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
      
      if (assessmentId) {
        // Update existing
        result = await supabase
          .from('technical_assessments')
          .update(assessmentData)
          .eq('id', assessmentId)
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
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleForwardToApprover = async () => {
    if (!application) return;
    
    // Validation
    if (!recommendation.recommendation) {
      alert("Please select a recommendation (Yes/No) before forwarding.");
      return;
    }
    
    if (recommendation.recommendation === "no" && !recommendation.explanationText) {
      alert("Please provide an explanation for rejection.");
      return;
    }

    try {
      setSubmitLoading(true);
      
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
      
      // 3. Create workflow history
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('workflow_history').insert({
        application_id: application.id,
        from_status: application.status,
        to_status: 'pending_final_approval',
        action: 'assessment_completed',
        comment: `Assessment completed. Recommendation: ${recommendation.recommendation === 'yes' ? 'Approve' : 'Reject'}.`,
        user_id: user?.id
      });
      
      // Redirect to assessment dashboard
      router.push('/assessment');
      
    } catch (err) {
      console.error('Error forwarding application:', err);
      alert('Failed to forward application. Please try again.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleReturnForRevision = async () => {
    if (!application || !revisionNotes.trim()) return;
    
    try {
      setSubmitLoading(true);
      
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
      
      // 3. Create workflow history
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('workflow_history').insert({
        application_id: application.id,
        from_status: application.status,
        to_status: 'revision_required',
        action: 'returned_for_revision',
        comment: `Returned for revision: ${revisionNotes}`,
        user_id: user?.id
      });
      
      setShowRevisionDialog(false);
      setRevisionNotes("");
      alert("Application returned to applicant for revision.");
      // ⚡ PERFORMANCE: Use router.refresh() instead of full page reload
      router.refresh();
      
    } catch (err) {
      console.error('Error returning application:', err);
      alert('Failed to return application. Please try again.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleTransferApplication = async () => {
    if (!selectedAction || !application) return;
    
    try {
      setTransferLoading(true);
      
      const selectedStaff = staff.find(s => s.id === selectedAction);
      if (!selectedStaff) return;
      
      const { error: updateError } = await supabase
        .from('applications')
        .update({
          assigned_inspector_id: selectedAction,
          updated_at: new Date().toISOString()
        })
        .eq('id', application.id);
        
      if (updateError) throw updateError;
      
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('workflow_history').insert({
        application_id: application.id,
        from_status: application.status,
        to_status: application.status,
        action: 'transfer',
        comment: `Transferred to ${selectedStaff.first_name} ${selectedStaff.last_name}`,
        user_id: user?.id
      });
      
      alert(`Application successfully transferred to ${selectedStaff.first_name} ${selectedStaff.last_name}`);
      setSelectedAction('');
      // ⚡ PERFORMANCE: Use router.refresh() instead of full page reload
      router.refresh();
      
    } catch (error) {
      console.error('Error transferring application:', error);
      alert('Failed to transfer application.');
    } finally {
      setTransferLoading(false);
    }
  };

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
              <Link href="/assessment">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
                </Button>
              </Link>
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
              <Badge variant="outline" className="h-7 px-3 text-sm font-normal bg-blue-50 text-blue-700 border-blue-200">
                <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                Assessment Mode
              </Badge>
            </div>
            
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
            
            <Button 
              size="sm" 
              onClick={handleForwardToApprover}
              disabled={submitLoading || !recommendation.recommendation}
              className="gap-2 bg-black hover:bg-gray-800 text-white"
            >
              {submitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send for Final Approval
            </Button>
          </div>

          {/* Inspector Actions / Transfer */}
          <div className="flex items-center gap-3 p-4 bg-muted/30 border rounded-lg">
            <span className="text-sm font-medium">Transfer ownership:</span>
            <Select value={selectedAction} onValueChange={setSelectedAction}>
              <SelectTrigger className="w-[220px] h-9">
                <SelectValue placeholder="Select inspector..." />
              </SelectTrigger>
              <SelectContent>
                {staff.filter(s => s.role === 'inspector').map((staffMember) => (
                  <SelectItem key={staffMember.id} value={staffMember.id}>
                    {staffMember.first_name} {staffMember.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button 
              onClick={handleTransferApplication}
              variant="secondary"
              size="sm"
              disabled={!selectedAction || transferLoading}
            >
              {transferLoading ? 'Transferring...' : 'Transfer'}
            </Button>
          </div>

          {/* Main Content with Tabs */}
          <Tabs defaultValue="doc_verification" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5 h-auto p-1 bg-muted/80">
              <TabsTrigger value="application_details" className="py-2.5">Application Details</TabsTrigger>
              <TabsTrigger value="doc_verification" className="py-2.5">Document Verification</TabsTrigger>
              <TabsTrigger value="field_report" className="py-2.5">Field Report</TabsTrigger>
              <TabsTrigger value="summary" className="py-2.5">Final Recommendation</TabsTrigger>
              <TabsTrigger value="internal_notes" className="py-2.5">History & Notes</TabsTrigger>
            </TabsList>

            {/* Application Details Tab */}
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

            {/* Document Verification Tab */}
            <TabsContent value="doc_verification" className="space-y-6 focus-visible:outline-none">
              <DocumentVerificationComponent
                documents={application.documents || []}
                verifications={documentVerifications}
                onVerificationsChange={setDocumentVerifications}
              />
            </TabsContent>

            {/* Field Report Tab */}
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
            
            {/* Verification Summary Tab */}
            <TabsContent value="summary" className="space-y-6 focus-visible:outline-none">
              <VerificationSummary
                checklist={checklist}
                recommendation={recommendation}
                onChecklistChange={setChecklist}
                onRecommendationChange={setRecommendation}
              />
            </TabsContent>

            {/* Internal Notes Tab */}
            <TabsContent value="internal_notes" className="space-y-6 focus-visible:outline-none">
              {application.id && <ApplicationComments applicationId={application.id} />}
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
    </DashboardLayout>
  );
}
