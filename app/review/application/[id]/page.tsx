"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
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
  XCircle
} from "lucide-react";
import Link from "next/link";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { supabase } from "@/lib/supabase";
import type { Application, ApplicationStatus, User, Document, Review } from "@/types/database";
import { ApplicationComments } from "@/components/shared/ApplicationComments";

interface ApplicationWithRelations extends Application {
  applicant?: User;
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

export default function ReviewApplicationPage() {
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

        setApplication(appData);

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

  const handleApproveForInspection = async () => {
    if (!application) return;
    
    try {
      const { error } = await supabase
        .from('applications')
        .update({ status: 'pending_inspection' })
        .eq('id', application.id);

      if (error) throw error;

    alert("Application approved for inspection");
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

  const handleTransferApplication = () => {
    // Handle transfer application logic
    alert("Application transferred");
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    const statusConfig: Record<ApplicationStatus, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
      draft: { label: "Draft", variant: "outline" },
      submitted: { label: "Submitted", variant: "secondary" },
      under_review: { label: "Under Review", variant: "default" },
      pending_inspection: { label: "Pending Inspection", variant: "outline" },
      pending_final_approval: { label: "Pending Approval", variant: "default" },
      approved: { label: "Approved", variant: "default" },
      rejected: { label: "Rejected", variant: "destructive" },
      revision_required: { label: "Needs Revision", variant: "secondary" },
      cancelled: { label: "Cancelled", variant: "outline" },
    };
    
    const config = statusConfig[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const shouldShowReviewActions = (status: ApplicationStatus): boolean => {
    const reviewableStatuses: ApplicationStatus[] = ['submitted', 'under_review'];
    return reviewableStatuses.includes(status);
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
              <div className="flex items-center gap-3">
                <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
                  Application Review: {application.application_number}
                </h1>
                {getStatusBadge(application.status)}
              </div>

              <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base leading-relaxed [&:not(:first-child)]:mt-6">
                Technical review and assessment of water permit application
              </p>
            </div>
          </div>

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

          {/* Revision Notes Alert */}
          {application.status === 'revision_required' && application.revision_notes && (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium text-orange-800">Application Returned for Revision</p>
                  <p className="text-orange-700">{application.revision_notes}</p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Main Content with Tabs */}
          <Tabs defaultValue="application_details" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="application_details">Application Details</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="internal_notes">Internal Notes & History</TabsTrigger>
            </TabsList>

            {/* Application Details Tab */}
            <TabsContent value="application_details" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Application Information */}
                <div className="lg:col-span-2 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Applicant Information</CardTitle>
                      <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
                        Details about the applicant submitting this water permit request
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Name</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">
                            {application.applicant?.company_name || 
                             (application.applicant?.first_name && application.applicant?.last_name ? 
                              `${application.applicant.first_name} ${application.applicant.last_name}` : 
                              'Unknown Applicant')}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Email</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.applicant?.email || 'N/A'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Phone</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.applicant?.phone || 'N/A'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Address</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.applicant?.address || 'N/A'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Permit Details */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Permit Details</CardTitle>
                      <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
                        Basic permit information and water usage specifications
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Application Type</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.application_type}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Water Source</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.water_source}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Water Purpose</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.water_purpose}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Estimated Usage</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm font-medium">
                            {application.estimated_usage_volume} {application.usage_unit}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Location Details */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Location Details</CardTitle>
                      <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
                        Geographic location and administrative boundaries
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Province</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.province}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">District</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.district}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Sector</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.sector}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Cell</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.cell}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Project Information */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Project Information</CardTitle>
                      <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
                        Detailed project description and objectives
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Project Title</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm font-medium">{application.project_title}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Project Description</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm leading-6">{application.project_description || 'No description provided'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Technical Specifications */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Technical Specifications</CardTitle>
                      <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
                        Water extraction, measurement, and storage details
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">Water Taking Method</Label>
                            <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.water_taking_method || 'N/A'}</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">Water Measuring Method</Label>
                            <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.water_measuring_method || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Storage Facilities</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.storage_facilities || 'N/A'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Return Flow Description</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">{application.return_flow_description || 'N/A'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Environmental Impact */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Environmental Impact Assessment</CardTitle>
                      <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
                        Potential effects and mitigation measures
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Environmental Assessment</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm leading-6">{application.environmental_assessment || 'No assessment provided'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Mitigation Actions</Label>
                          <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm leading-6">{application.mitigation_actions || 'No mitigation actions specified'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Action Panel */}
                <div className="space-y-6">
                  {/* Only show Review Actions if application is in reviewable state */}
                  {(application.status === 'submitted' || application.status === 'under_review') && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Review Actions</CardTitle>
                        <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
                        Take action on this application
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-3">
                        <Button 
                          onClick={handleApproveForInspection}
                          className="w-full gap-2"
                        >
                          <Check className="h-4 w-4" />
                          Approve for Inspection
                        </Button>
                        
                        <Button 
                            onClick={() => setShowRevisionDialog(true)}
                          variant="outline"
                          className="w-full gap-2"
                        >
                          <X className="h-4 w-4" />
                          Return for Revision
                        </Button>
                      </div>

                      <Separator />

                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Transfer Application</Label>
                        <Select value={selectedAction} onValueChange={setSelectedAction}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select reviewer..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="reviewer1">John Smith</SelectItem>
                            <SelectItem value="reviewer2">Sarah Johnson</SelectItem>
                            <SelectItem value="reviewer3">Michael Brown</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button 
                          onClick={handleTransferApplication}
                          variant="secondary"
                          className="w-full"
                          disabled={!selectedAction}
                        >
                          Transfer Application
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle>Application Timeline</CardTitle>
                      <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
                        Progress through review stages
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Submitted Stage */}
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <CheckCircle className="h-4 w-4" />
                          </div>
                          <div className="flex-1 space-y-1">
                            <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm font-medium">Submitted</p>
                            <p className="text-xs text-muted-foreground">{application.submitted_at ? new Date(application.submitted_at).toLocaleDateString() : application.created_at ? new Date(application.created_at).toLocaleDateString() : 'N/A'}</p>
                          </div>
                        </div>
                        
                        {/* Under Review Stage */}
                        <div className="flex items-start gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                            ['under_review', 'pending_inspection', 'approved', 'rejected'].includes(application.status) 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-muted'
                          }`}>
                            {['under_review', 'pending_inspection', 'approved', 'rejected'].includes(application.status) ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 space-y-1">
                            <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">
                              {application.reviewed_at || ['pending_inspection', 'approved', 'rejected'].includes(application.status) 
                                ? 'Reviewed' 
                                : application.status === 'under_review' 
                                  ? 'Under Review'
                                  : 'Review'
                              }
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {application.reviewed_at 
                                ? new Date(application.reviewed_at).toLocaleDateString()
                                : application.status === 'under_review' 
                                  ? 'In Progress' 
                                  : ['pending_inspection', 'approved', 'rejected'].includes(application.status)
                                    ? (application.updated_at ? new Date(application.updated_at).toLocaleDateString() : 'Completed')
                                    : 'Pending'
                              }
                            </p>
                          </div>
                        </div>
                        
                        {/* Inspection Stage */}
                        <div className="flex items-start gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                            application.status === 'pending_inspection' 
                              ? 'bg-yellow-100 border-2 border-yellow-400' 
                              : ['pending_final_approval', 'approved', 'rejected'].includes(application.status)
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                          }`}>
                            {application.status === 'pending_inspection' ? (
                              <Clock className="h-4 w-4 text-yellow-600" />
                            ) : ['pending_final_approval', 'approved', 'rejected'].includes(application.status) ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 space-y-1">
                            <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">Inspection</p>
                            <p className="text-xs text-muted-foreground">
                              {application.inspected_at 
                                ? new Date(application.inspected_at).toLocaleDateString()
                                : application.status === 'pending_inspection' 
                                  ? 'Scheduled'
                                  : 'Pending'
                              }
                            </p>
                          </div>
                        </div>
                        
                        {/* Final Approval Stage */}
                        <div className="flex items-start gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                            application.status === 'pending_final_approval' 
                              ? 'bg-yellow-100 border-2 border-yellow-400' 
                              : ['approved', 'rejected'].includes(application.status)
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                          }`}>
                            {application.status === 'pending_final_approval' ? (
                              <Clock className="h-4 w-4 text-yellow-600" />
                            ) : ['approved', 'rejected'].includes(application.status) ? (
                              application.status === 'approved' ? (
                                <CheckCircle className="h-4 w-4" />
                              ) : (
                                <XCircle className="h-4 w-4" />
                              )
                            ) : (
                              <Clock className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 space-y-1">
                            <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm">
                              {application.status === 'pending_final_approval' 
                                ? 'Pending Approval' 
                                : application.status === 'approved' 
                                  ? 'Approved' 
                                  : application.status === 'rejected'
                                    ? 'Rejected'
                                    : 'Final Approval'
                              }
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {application.status === 'pending_final_approval' 
                                ? 'Awaiting final decision' 
                                : application.status === 'approved' || application.status === 'rejected'
                                  ? (application.approved_at ? new Date(application.approved_at).toLocaleDateString() : 'Completed')
                                  : 'Pending'
                              }
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Review Actions Sidebar */}
                <div className="lg:col-span-1 space-y-6">


                  <Card>
                    <CardHeader>
                      <CardTitle>Transfer Application</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <Select value={selectedAction} onValueChange={setSelectedAction}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select reviewer..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="reviewer1">Sarah Johnson</SelectItem>
                            <SelectItem value="reviewer2">Michael Brown</SelectItem>
                            <SelectItem value="reviewer3">Emma Wilson</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button 
                          onClick={handleTransferApplication}
                          variant="outline" 
                          className="w-full" 
                          disabled={!selectedAction}
                        >
                          Transfer Application
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Uploaded Documents</CardTitle>
                  <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
                    Documents submitted with this application
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {application.documents && application.documents.length > 0 ? (
                      application.documents.map((doc, index) => (
                      <div key={index} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                            <FileText className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="space-y-1">
                              <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm font-medium">{doc.name}</p>
                              <p className="text-xs text-muted-foreground">{doc.type} • {doc.file_size ? `${(doc.file_size / 1024 / 1024).toFixed(1)} MB` : 'Size unknown'} • Uploaded {doc.upload_date ? new Date(doc.upload_date).toLocaleDateString() : 'N/A'}</p>
                            </div>
                        </div>
                        <Button size="sm" variant="outline" className="gap-2">
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                      </div>
                      ))
                    ) : (
                      <div className="text-center py-8">
                        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No documents uploaded yet</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
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