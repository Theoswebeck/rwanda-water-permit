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
  FileText, 
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  XCircle,
  ClipboardCheck,
  MapPin,
  Droplets,
  Factory,
  Leaf,
  Shield,
  AlertTriangle,
  Info,
  Building,
  Zap,
  Settings
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Application, ApplicationStatus, User, Document } from "@/types/database";
import { ApplicationDocuments } from "@/components/shared/ApplicationDocuments";

interface ApplicationWithRelations extends Application {
  applicant?: User;
  documents?: Document[];
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

        const applicationNumber = params.id as string;
        
        // Fetch application with related data
        const { data: appData, error: appError } = await supabase
          .from('applications')
          .select(`
            *,
            applicant:users!applicant_id(*),
            documents(*)
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

  const handleSubmitAssessment = async () => {
    if (!application || !validateAssessment()) {
      return;
    }
    
    try {
      setSubmitting(true);
      
      // Get current user (inspector)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('User not authenticated');
        return;
      }

      // Create assessment record
      const { error: assessmentError } = await supabase
        .from('assessments')
        .insert({
          application_id: application.id,
          inspector_id: user.id,
          assessment_stage: 'technical',
          status: 'completed',
          technical_feasibility: assessmentForm.technicalFeasibility,
          technical_comments: assessmentForm.technicalComments,
          site_accessibility: assessmentForm.siteAccessibility,
          infrastructure_adequacy: assessmentForm.infrastructureAdequacy,
          environmental_impact_level: assessmentForm.environmentalImpactLevel,
          environmental_comments: assessmentForm.environmentalComments,
          mitigation_required: assessmentForm.mitigationRequired,
          source_reliability: assessmentForm.sourceReliability,
          source_capacity_adequate: assessmentForm.sourceCapacityAdequate,
          source_quality_acceptable: assessmentForm.sourceQualityAcceptable,
          water_rights_clear: assessmentForm.waterRightsClear,
          overall_recommendation: assessmentForm.overallRecommendation,
          conditions_required: assessmentForm.conditionsRequired ? { conditions: assessmentForm.conditionsRequired } : null,
          overall_comments: assessmentForm.overallComments,
          field_visit_required: assessmentForm.fieldVisitRequired,
          field_visit_completed: assessmentForm.fieldVisitCompleted,
          field_visit_date: assessmentForm.fieldVisitDate || null,
          completed_at: new Date().toISOString()
        });

      if (assessmentError) throw assessmentError;

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

      const { error: appError } = await supabase
        .from('applications')
        .update(updateData)
        .eq('id', application.id);

      if (appError) throw appError;

      const messages = {
        approve: "✅ Application approved for final approval",
        reject: "❌ Application rejected",
        require_revision: "📝 Application returned for revision"
      };

      alert(messages[assessmentForm.overallRecommendation]);
      router.push('/inspection');
    } catch (err) {
      console.error('Error submitting assessment:', err);
      alert('Failed to submit assessment');
    } finally {
      setSubmitting(false);
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
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="application_overview">Application Overview</TabsTrigger>
              <TabsTrigger value="technical_details">Technical Details</TabsTrigger>
              <TabsTrigger value="documents">Documents & Evidence</TabsTrigger>
              <TabsTrigger value="assessment">Technical Assessment</TabsTrigger>
            </TabsList>

            {/* Application Overview Tab */}
            <TabsContent value="application_overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Applicant Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building className="h-5 w-5" />
                      Applicant Information
                    </CardTitle>
                    <CardDescription>
                      Details about the applicant and contact information
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Name/Organization</Label>
                        <p className="text-sm font-medium">
                          {application.applicant?.company_name || 
                           (application.applicant?.first_name && application.applicant?.last_name ? 
                            `${application.applicant.first_name} ${application.applicant.last_name}` : 
                            'Unknown Applicant')}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Email</Label>
                          <p className="text-sm">{application.applicant?.email || 'N/A'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Phone</Label>
                          <p className="text-sm">{application.applicant?.phone || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Account Type</Label>
                        <p className="text-sm capitalize">{application.applicant?.account_type?.replace('_', ' ') || 'N/A'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Address</Label>
                        <p className="text-sm">{application.applicant?.address || `${application.province}, ${application.district}, ${application.sector}`}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Project Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Factory className="h-5 w-5" />
                      Project Overview
                    </CardTitle>
                    <CardDescription>
                      Basic project information and intended use
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Project Title</Label>
                        <p className="text-sm font-medium">{application.project_title}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Project Description</Label>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {application.project_description || 'No description provided'}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Application Type</Label>
                          <p className="text-sm capitalize">{application.application_type?.replace('_', ' ')}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Project Value</Label>
                          <p className="text-sm">{application.project_value ? `$${application.project_value.toLocaleString()}` : 'Not specified'}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Water Source Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Droplets className="h-5 w-5" />
                      Water Source Details
                    </CardTitle>
                    <CardDescription>
                      Information about the water source and location
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Water Source Type</Label>
                          <p className="text-sm capitalize">{application.water_source?.replace('_', ' ')}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Water Purpose</Label>
                          <p className="text-sm capitalize">{application.water_purpose?.replace('_', ' ')}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Water Body Name</Label>
                        <p className="text-sm">{application.water_body_name || 'Not specified'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Tributary Name</Label>
                        <p className="text-sm">{application.tributary_name || 'Not applicable'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Water Reliability</Label>
                        <p className="text-sm capitalize">{application.water_reliability?.replace('_', ' ') || 'Not specified'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Location Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Location Details
                    </CardTitle>
                    <CardDescription>
                      Geographic location and administrative boundaries
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Province</Label>
                          <p className="text-sm">{application.province}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">District</Label>
                          <p className="text-sm">{application.district}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Sector</Label>
                          <p className="text-sm">{application.sector}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Cell</Label>
                          <p className="text-sm">{application.cell}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Village</Label>
                        <p className="text-sm">{application.village || 'Not specified'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Location Description</Label>
                        <p className="text-sm text-muted-foreground">{application.location_description || 'No additional location details'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Technical Details Tab */}
            <TabsContent value="technical_details" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Water Usage Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Droplets className="h-5 w-5" />
                      Water Usage Specifications
                    </CardTitle>
                    <CardDescription>
                      Detailed water usage breakdown and requirements
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Daily Volume (m³)</Label>
                          <p className="text-sm font-medium">{application.max_daily_volume_m3 || 'Not specified'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Monthly Volume (m³)</Label>
                          <p className="text-sm font-medium">{application.max_monthly_volume_m3 || 'Not specified'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Yearly Volume (m³)</Label>
                          <p className="text-sm font-medium">{application.max_yearly_volume_m3 || 'Not specified'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Flow Rate (m³/s)</Label>
                          <p className="text-sm font-medium">{application.flow_rate_m3_per_second || 'Not specified'}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Pumping Hours/Day</Label>
                        <p className="text-sm">{application.pumping_hours_per_day || 'Not specified'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Proposed Duration</Label>
                        <p className="text-sm">
                          {application.proposed_duration_years ? `${application.proposed_duration_years} years` : ''}
                          {application.proposed_duration_months ? `, ${application.proposed_duration_months} months` : ''}
                          {!application.proposed_duration_years && !application.proposed_duration_months ? 'Not specified' : ''}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Infrastructure Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Infrastructure & Facilities
                    </CardTitle>
                    <CardDescription>
                      Technical infrastructure and abstraction methods
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Water Taking Method</Label>
                        <p className="text-sm">{application.water_taking_method || 'Not specified'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Water Measuring Method</Label>
                        <p className="text-sm">{application.water_measuring_method || 'Not specified'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Abstraction Facilities</Label>
                        <p className="text-sm text-muted-foreground leading-relaxed">{application.abstraction_facilities_description || 'No description provided'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Storage Facilities</Label>
                        <p className="text-sm text-muted-foreground leading-relaxed">{application.storage_facilities || 'No storage facilities described'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Infrastructure Components</Label>
                        <div className="text-sm space-y-1">
                          <p><strong>Pipes:</strong> {application.infrastructure_pipes || 'Not specified'}</p>
                          <p><strong>Pumps:</strong> {application.infrastructure_pumps || 'Not specified'}</p>
                          <p><strong>Valves:</strong> {application.infrastructure_valves || 'Not specified'}</p>
                          <p><strong>Meters:</strong> {application.infrastructure_meters || 'Not specified'}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Return Flow & Discharge */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Droplets className="h-5 w-5" />
                      Return Flow & Discharge
                    </CardTitle>
                    <CardDescription>
                      Water return and discharge information
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Return Flow Location</Label>
                        <p className="text-sm">{application.return_flow_location || 'Not specified'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Return Flow Volume (m³)</Label>
                        <p className="text-sm font-medium">{application.return_flow_volume_m3 || 'Not specified'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Return Flow Description</Label>
                        <p className="text-sm text-muted-foreground leading-relaxed">{application.return_flow_description || 'No return flow description'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Environmental Considerations */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Leaf className="h-5 w-5" />
                      Environmental Considerations
                    </CardTitle>
                    <CardDescription>
                      Environmental impact and mitigation measures
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Environmental Assessment</Label>
                        <p className="text-sm text-muted-foreground leading-relaxed">{application.environmental_assessment || 'No environmental assessment provided'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Mitigation Actions</Label>
                        <p className="text-sm text-muted-foreground leading-relaxed">{application.mitigation_actions || 'No mitigation actions specified'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Land Ownership */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Land Ownership & Access
                    </CardTitle>
                    <CardDescription>
                      Land ownership status and access rights
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Owns All Required Land</Label>
                        <p className="text-sm">
                          {application.owns_all_required_land === true ? '✅ Yes' : 
                           application.owns_all_required_land === false ? '❌ No' : 'Not specified'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Land Ownership Status</Label>
                        <p className="text-sm capitalize">{application.land_ownership_status?.replace('_', ' ') || 'Not specified'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Easement Details</Label>
                        <p className="text-sm text-muted-foreground">{application.easement_details || 'No easement details'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Written Consent Details</Label>
                        <p className="text-sm text-muted-foreground">{application.written_consent_details || 'No written consent details'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Special Industry Fields */}
                {(application.electricity_generation_capacity || application.mining_operations_type) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        Industry-Specific Details
                      </CardTitle>
                      <CardDescription>
                        Specialized information for specific industries
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 gap-4">
                        {application.electricity_generation_capacity && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">Electricity Generation Capacity</Label>
                            <p className="text-sm font-medium">{application.electricity_generation_capacity}</p>
                          </div>
                        )}
                        {application.mining_operations_type && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">Mining Operations Type</Label>
                            <p className="text-sm">{application.mining_operations_type}</p>
                          </div>
                        )}
                        {application.water_diversion_details && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">Water Diversion Details</Label>
                            <p className="text-sm text-muted-foreground">{application.water_diversion_details}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Application Documents & Evidence
                  </CardTitle>
                  <CardDescription>
                    Review all submitted documents for completeness and authenticity
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ApplicationDocuments 
                    applicationId={application.id}
                    userRole="inspector"
                    allowDownload={true}
                    allowView={true}
                    showStatus={true}
                    showRefresh={true}
                  />
                </CardContent>
              </Card>
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
