"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  ArrowLeft, 
  Check, 
  X, 
  Send, 
  FileText, 
  MessageSquare, 
  Download,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  User as UserIcon,
  Loader2,
  XCircle,
  User,
  MapPin,
  Droplets
} from "lucide-react";
import Link from "next/link";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { supabase } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";
import type { Application, ApplicationStatus, User as UserType, Document, Review } from "@/types/database";
import { ApplicationComments } from "@/components/shared/ApplicationComments";

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

export default function AssessmentApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedAction, setSelectedAction] = useState("");
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  
  // ApplicationForm state
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});

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

        setApplication(appData);

        // Transform application data to form format
        const formData = mapApplicationToFormData(appData, null);
        setInitialFormData(formData);
        console.log('✅ Form data mapped:', formData);
        
        // Process documents for form
        const documentMap: Record<string, { url: string; name: string }> = {};
        const typeMapping: Record<string, string> = {
          'identification_doc': 'identificationDoc',
          'land_ownership_doc': 'landOwnershipDoc', 
          'technical_drawings': 'technicalDrawings',
          'environmental_impact_doc': 'environmentalImpactDoc',
          'payment_proof': 'paymentProof',
          'intake_discharge_map': 'intakeDischargeMap',
          'other': 'generalRequirements',
          'business_license': 'miningLicense',
          'geological_survey': 'miningHydrologicalReport',
          'water_quality_report': 'waterQualityReport'
        };
        
        // Process documents from appData.documents using smart classification (copied from edit-application page)
        console.log('🔍 Raw documents from database:', appData.documents);
        if (appData.documents && Array.isArray(appData.documents)) {
          for (const doc of appData.documents) {
            console.log('📋 Processing document:', doc.name, 'type:', doc.type, 'path:', doc.file_path);
            
            if (doc.file_path && doc.name) {
              const publicUrl = getDocumentUrl(doc.file_path);
              if (publicUrl) {
                // Extract field name from file path if it follows our naming convention
                const pathParts = doc.file_path.split('/');
                const fileName = pathParts[pathParts.length - 1];
                const fieldNameMatch = fileName.match(/^([a-zA-Z]+(?:[A-Z][a-zA-Z]*)*)-\d+\./);

                if (fieldNameMatch) {
                  // This is a structured document with field name in path
                  const fieldName = fieldNameMatch[1];
                  console.log('🎯 Identified field name from path:', fieldName);
                  
                  // Check if it's an additional document
                  if (fieldName.startsWith('additional_')) {
                    console.log('📎 Skipping additional document for now:', fieldName);
                    // Skip additional documents for now since ApplicationForm handles them differently
                  } else {
                    // This is a standard/activity-specific document
                    documentMap[fieldName] = {
                      url: publicUrl,
                      name: doc.name
                    };
                    console.log('✅ Mapped document:', fieldName, '→', doc.name);
                  }
                } else {
                  // Fallback to old type-based mapping
                  const fieldName = typeMapping[doc.type] || doc.type;
                  documentMap[fieldName] = {
                    url: publicUrl,
                    name: doc.name
                  };
                  console.log('✅ Mapped document (fallback):', fieldName, '→', doc.name);
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
        
        // Fetch staff members for transfer functionality
        const { data: staffData, error: staffError } = await supabase
          .from('users')
          .select('id, first_name, last_name, role, email')
          .in('role', ['reviewer', 'inspector', 'admin', 'approver'])
          .eq('status', 'active')
          .order('role', { ascending: true })
          .order('first_name', { ascending: true });
          
        if (staffError) {
          console.error('Error fetching staff:', staffError);
        } else {
          setStaff(staffData || []);
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

  const handleApproveForAssessment = async () => {
    if (!application) return;
    
    try {
      const { error } = await supabase
        .from('applications')
        .update({ status: 'pending_assessment' })
        .eq('id', application.id);

      if (error) throw error;

    alert("Application approved for technical assessment");
      // Refresh the application data
      window.location.reload();
    } catch (err) {
      console.error('Error updating application:', err);
      alert('Failed to update application');
    }
  };

  const handleReturnForRevision = async () => {
    if (!application || !revisionNotes.trim()) return;
    
    try {
      const { error } = await supabase
        .from('applications')
        .update({ 
          status: 'revision_required',
          revision_notes: revisionNotes.trim()
        })
        .eq('id', application.id);

      if (error) throw error;

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
    // Refresh the application data
    window.location.reload();
  };

  const handleTransferApplication = async () => {
    if (!selectedAction || !application) return;
    
    try {
      setTransferLoading(true);
      
      // Find the selected staff member
      const selectedStaff = staff.find(s => s.id === selectedAction);
      if (!selectedStaff) {
        alert('Please select a valid reviewer');
        return;
      }
      
      // Update application assignment in the database
      const { error: updateError } = await supabase
        .from('applications')
        .update({
          assigned_reviewer_id: selectedAction,
          status: 'under_review',
          updated_at: new Date().toISOString()
        })
        .eq('id', application.id);
        
      if (updateError) throw updateError;
      
      // Create a workflow record for the transfer
      const { error: workflowError } = await supabase
        .from('workflow_history')
        .insert({
          application_id: application.id,
          from_status: application.status,
          to_status: 'under_review',
          action: 'transfer',
          comment: `Application transferred to ${selectedStaff.first_name} ${selectedStaff.last_name} (${selectedStaff.role})`,
          user_id: selectedAction
        });
        
      if (workflowError) throw workflowError;
      
      alert(`Application successfully transferred to ${selectedStaff.first_name} ${selectedStaff.last_name}`);
      setSelectedAction('');
      
      // Refresh the page to show updated data
      window.location.reload();
      
    } catch (error) {
      console.error('Error transferring application:', error);
      alert('Failed to transfer application. Please try again.');
    } finally {
      setTransferLoading(false);
    }
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    const statusConfig: Record<ApplicationStatus, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
      draft: { label: "Draft", variant: "outline" },
      submitted: { label: "Submitted", variant: "secondary" },
      under_review: { label: "Under Review", variant: "default" },
      pending_assessment: { label: "Pending Assessment", variant: "outline" },
      pending_final_approval: { label: "Pending Approval", variant: "default" },
      approved: { label: "Approved", variant: "default" },
      approved_pending_permit: { label: "Approved - Permit Pending", variant: "default" },
      rejected: { label: "Rejected", variant: "destructive" },
      revision_required: { label: "Needs Revision", variant: "secondary" },
      cancelled: { label: "Cancelled", variant: "outline" },
    };
    
    const config = statusConfig[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const shouldShowReviewActions = (status: ApplicationStatus): boolean => {
    // Only show review actions for applications that haven't been finalized
    const reviewableStatuses: ApplicationStatus[] = ['submitted', 'under_review'];
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
                onClick={() => window.location.href = '/assessment'} 
                className="mt-4"
                variant="outline"
              >
                Back to Assessment Dashboard
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
                <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
                  Application Assessment: {application.application_number}
                </h1>
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

          {/* Rejection Reason Alert */}
          {application.status === 'rejected' && application.rejection_reason && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="font-medium text-red-800">Application Rejected</p>
                    <p className="text-red-700">{application.rejection_reason}</p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Review Actions Section - Compact */}
          {(application.status === 'submitted' || application.status === 'under_review') && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="mb-6"
            >
              <Card className="border border-border bg-background">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4" />
                      Review Actions:
                    </div>
                    
                    <Button 
                      onClick={handleApproveForAssessment}
                      size="sm"
                      className="gap-1"
                    >
                      <Check className="h-3 w-3" />
                      Approve for Assessment
                    </Button>
                    
                    <Button 
                      onClick={() => setShowRevisionDialog(true)}
                      variant="outline"
                      size="sm"
                      className="gap-1"
                    >
                      <X className="h-3 w-3" />
                      Return for Revision
                    </Button>

                    <div className="flex items-center gap-2">
                      <Select value={selectedAction} onValueChange={setSelectedAction}>
                        <SelectTrigger className="w-[180px] h-8">
                          <SelectValue placeholder="Transfer to..." />
                        </SelectTrigger>
                        <SelectContent>
                          {staff.map((staffMember) => (
                            <SelectItem key={staffMember.id} value={staffMember.id}>
                              {staffMember.first_name} {staffMember.last_name} ({staffMember.role})
                            </SelectItem>
                          ))}
                          {staff.length === 0 && (
                            <SelectItem value="no-staff" disabled>
                              No staff members available
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>

                      <Button 
                        onClick={handleTransferApplication}
                        variant="secondary"
                        size="sm"
                        disabled={!selectedAction || transferLoading || selectedAction === 'no-staff'}
                        className="gap-1"
                      >
                        {transferLoading ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Transferring...
                          </>
                        ) : (
                          <>
                            <Send className="h-3 w-3" />
                            Transfer
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Main Content with Tabs */}
          <Tabs defaultValue="application_details" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="application_details">Application Details</TabsTrigger>
              <TabsTrigger value="internal_notes">Internal Notes & History</TabsTrigger>
            </TabsList>

            {/* Application Details Tab */}
            <TabsContent value="application_details" className="space-y-6">
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

            {/* Internal Notes Tab */}
            <TabsContent value="internal_notes" className="space-y-6">
              {application.id && <ApplicationComments applicationId={application.id} />}
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
              Application Returned for Revision
            </DialogTitle>
            <DialogDescription>
              The application has been successfully returned to the applicant with your revision notes. 
              They will be notified and can resubmit once the required changes are made.
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
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Return Application for Revision</DialogTitle>
            <DialogDescription>
              Please provide detailed notes about what needs to be corrected or updated in this application.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
              onClick={handleReturnForRevision}
              disabled={!revisionNotes.trim()}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Return for Revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
} 