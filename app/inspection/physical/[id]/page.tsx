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
  Settings,
  Camera,
  FileImage
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Application, ApplicationStatus, User, Document } from "@/types/database";
import { ApplicationDocuments } from "@/components/shared/ApplicationDocuments";

interface ApplicationWithRelations extends Application {
  applicant?: User;
  documents?: Document[];
}

interface InspectionForm {
  // Site Inspection
  siteCondition: "excellent" | "good" | "fair" | "poor" | null;
  siteAccessible: boolean | null;
  locationAccurate: boolean | null;
  
  // Infrastructure Inspection
  infrastructureInstalled: boolean | null;
  infrastructureCondition: "excellent" | "good" | "fair" | "poor" | null;
  equipmentFunctional: boolean | null;
  safetyMeasuresAdequate: boolean | null;
  
  // Water Source Inspection
  waterSourceCondition: "excellent" | "good" | "fair" | "poor" | null;
  waterQualityAcceptable: boolean | null;
  abstractionRateCompliant: boolean | null;
  environmentalImpactMinimal: boolean | null;
  
  // Compliance Check
  permitDisplayed: boolean | null;
  operationsCompliant: boolean | null;
  recordsAccurate: boolean | null;
  wasteManagementAdequate: boolean | null;
  
  // Overall Inspection
  overallCompliance: "compliant" | "minor_issues" | "major_issues" | "non_compliant" | null;
  recommendedActions: string;
  inspectionNotes: string;
  
  // Photos and Evidence
  photosRequired: boolean;
  photosTaken: boolean;
  evidenceNotes: string;
}

export default function PhysicalInspectionPage() {
  const params = useParams();
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [inspectionForm, setInspectionForm] = useState<InspectionForm>({
    siteCondition: null,
    siteAccessible: null,
    locationAccurate: null,
    infrastructureInstalled: null,
    infrastructureCondition: null,
    equipmentFunctional: null,
    safetyMeasuresAdequate: null,
    waterSourceCondition: null,
    waterQualityAcceptable: null,
    abstractionRateCompliant: null,
    environmentalImpactMinimal: null,
    permitDisplayed: null,
    operationsCompliant: null,
    recordsAccurate: null,
    wasteManagementAdequate: null,
    overallCompliance: null,
    recommendedActions: "",
    inspectionNotes: "",
    photosRequired: false,
    photosTaken: false,
    evidenceNotes: ""
  });

  useEffect(() => {
    const fetchApplicationDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!params.id) {
          setError('No application ID provided');
          return;
        }

        const { data, error } = await supabase
          .from('applications')
          .select(`
            *,
            applicant:users!applicant_id(first_name, last_name, email, phone, company_name, account_type, address),
            documents(*)
          `)
          .eq('application_number', params.id)
          .single();

        if (error) {
          console.error('Error fetching application:', error);
          setError('Failed to load application details');
          return;
        }

        if (!data) {
          setError('Application not found');
          return;
        }

        setApplication(data);
      } catch (err) {
        console.error('Error in fetchApplicationDetails:', err);
        setError('Failed to load application details');
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchApplicationDetails();
    }
  }, [params.id]);

  const updateInspectionForm = (field: keyof InspectionForm, value: any) => {
    setInspectionForm(prev => ({ ...prev, [field]: value }));
  };

  const validateInspection = (): boolean => {
    if (!inspectionForm.overallCompliance) {
      alert('Please provide an overall compliance assessment');
      return false;
    }
    if (!inspectionForm.inspectionNotes.trim()) {
      alert('Please provide inspection notes');
      return false;
    }
    if (inspectionForm.siteAccessible === null) {
      alert('Please confirm if the site is accessible');
      return false;
    }
    return true;
  };

  const handleSubmitInspection = async () => {
    if (!application || !validateInspection()) {
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

      // Create inspection record
      const { error: inspectionError } = await supabase
        .from('inspections')
        .insert({
          application_id: application.id,
          inspector_id: user.id,
          inspection_type: 'post_permit',
          site_condition: inspectionForm.siteCondition,
          site_accessible: inspectionForm.siteAccessible,
          location_accurate: inspectionForm.locationAccurate,
          infrastructure_installed: inspectionForm.infrastructureInstalled,
          infrastructure_condition: inspectionForm.infrastructureCondition,
          equipment_functional: inspectionForm.equipmentFunctional,
          safety_measures_adequate: inspectionForm.safetyMeasuresAdequate,
          water_source_condition: inspectionForm.waterSourceCondition,
          water_quality_acceptable: inspectionForm.waterQualityAcceptable,
          abstraction_rate_compliant: inspectionForm.abstractionRateCompliant,
          environmental_impact_minimal: inspectionForm.environmentalImpactMinimal,
          permit_displayed: inspectionForm.permitDisplayed,
          operations_compliant: inspectionForm.operationsCompliant,
          records_accurate: inspectionForm.recordsAccurate,
          waste_management_adequate: inspectionForm.wasteManagementAdequate,
          overall_compliance: inspectionForm.overallCompliance,
          recommended_actions: inspectionForm.recommendedActions || null,
          inspection_notes: inspectionForm.inspectionNotes,
          photos_required: inspectionForm.photosRequired,
          photos_taken: inspectionForm.photosTaken,
          evidence_notes: inspectionForm.evidenceNotes || null,
          inspection_date: new Date().toISOString(),
          status: 'completed'
        });

      if (inspectionError) throw inspectionError;

      // Update application with inspection completion
      const { error: appError } = await supabase
        .from('applications')
        .update({ 
          inspected_at: new Date().toISOString(),
          // Status could remain 'approved' or be updated based on compliance
          ...(inspectionForm.overallCompliance === 'non_compliant' && {
            status: 'rejected',
            rejection_reason: `Post-permit inspection failed: ${inspectionForm.inspectionNotes}`
          })
        })
        .eq('id', application.id);

      if (appError) throw appError;

      const message = inspectionForm.overallCompliance === 'non_compliant' 
        ? "🚫 Inspection completed - Non-compliant, permit revoked" 
        : "✅ Physical inspection completed successfully";

      alert(message);
      router.push('/inspection');
    } catch (err) {
      console.error('Error submitting inspection:', err);
      alert('Failed to submit inspection');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    const statusConfig: Record<ApplicationStatus, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
      draft: { label: "Draft", variant: "outline" },
      submitted: { label: "Submitted", variant: "secondary" },
      under_review: { label: "Under Review", variant: "outline" },
      pending_assessment: { label: "Pending Assessment", variant: "outline" },
      pending_final_approval: { label: "Pending Approval", variant: "outline" },
      approved: { label: "Approved", variant: "default" },
      approved_pending_permit: { label: "Pending Permit Issue", variant: "outline" },
      rejected: { label: "Rejected", variant: "destructive" },
      revision_required: { label: "Revision Required", variant: "destructive" },
      cancelled: { label: "Cancelled", variant: "outline" }
    };

    const config = statusConfig[status] || { label: status, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading application details...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !application) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-6 w-6" />
            <span>{error || 'Application not found'}</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/inspection">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Physical Inspection
                </h1>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-lg font-semibold text-blue-600">
                    {application.application_number}
                  </span>
                  {getStatusBadge(application.status)}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Brief Application Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Application Summary
              </CardTitle>
              <CardDescription>
                Quick overview of the application details for inspection context
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Applicant</Label>
                  <p className="text-sm font-medium">
                    {application.applicant?.company_name || 
                     `${application.applicant?.first_name} ${application.applicant?.last_name}`}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Project</Label>
                  <p className="text-sm">{application.project_title}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Location</Label>
                  <p className="text-sm">{application.district}, {application.sector}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Water Source</Label>
                  <p className="text-sm capitalize">{application.water_source?.replace('_', ' ')}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Purpose</Label>
                  <p className="text-sm capitalize">{application.water_purpose?.replace('_', ' ')}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Usage Volume</Label>
                  <p className="text-sm">{application.estimated_usage_volume} {application.usage_unit}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Inspection Form */}
          <Tabs defaultValue="inspection" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="inspection">Physical Inspection</TabsTrigger>
              <TabsTrigger value="compliance">Compliance Check</TabsTrigger>
              <TabsTrigger value="evidence">Photos & Evidence</TabsTrigger>
            </TabsList>

            {/* Physical Inspection Tab */}
            <TabsContent value="inspection" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Site Inspection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Site Inspection
                    </CardTitle>
                    <CardDescription>
                      Assess the physical site conditions and accessibility
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Site Accessible *</Label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.siteAccessible === true}
                            onCheckedChange={(checked) => updateInspectionForm('siteAccessible', checked ? true : null)}
                          />
                          <span className="text-sm">✅ Accessible</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.siteAccessible === false}
                            onCheckedChange={(checked) => updateInspectionForm('siteAccessible', checked ? false : null)}
                          />
                          <span className="text-sm">❌ Not Accessible</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Location Accurate</Label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.locationAccurate === true}
                            onCheckedChange={(checked) => updateInspectionForm('locationAccurate', checked ? true : null)}
                          />
                          <span className="text-sm">✅ Accurate</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.locationAccurate === false}
                            onCheckedChange={(checked) => updateInspectionForm('locationAccurate', checked ? false : null)}
                          />
                          <span className="text-sm">❌ Inaccurate</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Site Condition</Label>
                      <Select value={inspectionForm.siteCondition || ""} onValueChange={(value) => updateInspectionForm('siteCondition', value || null)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select site condition" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="excellent">🟢 Excellent</SelectItem>
                          <SelectItem value="good">🟡 Good</SelectItem>
                          <SelectItem value="fair">🟠 Fair</SelectItem>
                          <SelectItem value="poor">🔴 Poor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Infrastructure Inspection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Infrastructure Inspection
                    </CardTitle>
                    <CardDescription>
                      Evaluate installed infrastructure and equipment
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Infrastructure Installed</Label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.infrastructureInstalled === true}
                            onCheckedChange={(checked) => updateInspectionForm('infrastructureInstalled', checked ? true : null)}
                          />
                          <span className="text-sm">✅ As Planned</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.infrastructureInstalled === false}
                            onCheckedChange={(checked) => updateInspectionForm('infrastructureInstalled', checked ? false : null)}
                          />
                          <span className="text-sm">❌ Not as Planned</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Equipment Functional</Label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.equipmentFunctional === true}
                            onCheckedChange={(checked) => updateInspectionForm('equipmentFunctional', checked ? true : null)}
                          />
                          <span className="text-sm">✅ Functional</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.equipmentFunctional === false}
                            onCheckedChange={(checked) => updateInspectionForm('equipmentFunctional', checked ? false : null)}
                          />
                          <span className="text-sm">❌ Non-functional</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Infrastructure Condition</Label>
                      <Select value={inspectionForm.infrastructureCondition || ""} onValueChange={(value) => updateInspectionForm('infrastructureCondition', value || null)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select condition" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="excellent">🟢 Excellent</SelectItem>
                          <SelectItem value="good">🟡 Good</SelectItem>
                          <SelectItem value="fair">🟠 Fair</SelectItem>
                          <SelectItem value="poor">🔴 Poor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Safety Measures Adequate</Label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.safetyMeasuresAdequate === true}
                            onCheckedChange={(checked) => updateInspectionForm('safetyMeasuresAdequate', checked ? true : null)}
                          />
                          <span className="text-sm">✅ Adequate</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.safetyMeasuresAdequate === false}
                            onCheckedChange={(checked) => updateInspectionForm('safetyMeasuresAdequate', checked ? false : null)}
                          />
                          <span className="text-sm">❌ Inadequate</span>
                        </label>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Water Source Inspection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Droplets className="h-5 w-5" />
                      Water Source Inspection
                    </CardTitle>
                    <CardDescription>
                      Assess water source conditions and usage compliance
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Water Source Condition</Label>
                      <Select value={inspectionForm.waterSourceCondition || ""} onValueChange={(value) => updateInspectionForm('waterSourceCondition', value || null)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select condition" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="excellent">🟢 Excellent</SelectItem>
                          <SelectItem value="good">🟡 Good</SelectItem>
                          <SelectItem value="fair">🟠 Fair</SelectItem>
                          <SelectItem value="poor">🔴 Poor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Water Quality Acceptable</Label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.waterQualityAcceptable === true}
                            onCheckedChange={(checked) => updateInspectionForm('waterQualityAcceptable', checked ? true : null)}
                          />
                          <span className="text-sm">✅ Acceptable</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.waterQualityAcceptable === false}
                            onCheckedChange={(checked) => updateInspectionForm('waterQualityAcceptable', checked ? false : null)}
                          />
                          <span className="text-sm">❌ Poor Quality</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Abstraction Rate Compliant</Label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.abstractionRateCompliant === true}
                            onCheckedChange={(checked) => updateInspectionForm('abstractionRateCompliant', checked ? true : null)}
                          />
                          <span className="text-sm">✅ Compliant</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.abstractionRateCompliant === false}
                            onCheckedChange={(checked) => updateInspectionForm('abstractionRateCompliant', checked ? false : null)}
                          />
                          <span className="text-sm">❌ Non-compliant</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Environmental Impact Minimal</Label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.environmentalImpactMinimal === true}
                            onCheckedChange={(checked) => updateInspectionForm('environmentalImpactMinimal', checked ? true : null)}
                          />
                          <span className="text-sm">✅ Minimal Impact</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.environmentalImpactMinimal === false}
                            onCheckedChange={(checked) => updateInspectionForm('environmentalImpactMinimal', checked ? false : null)}
                          />
                          <span className="text-sm">❌ Significant Impact</span>
                        </label>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Inspection Notes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardCheck className="h-5 w-5" />
                      Inspection Notes
                    </CardTitle>
                    <CardDescription>
                      Detailed observations and findings
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="inspection-notes">Detailed Inspection Notes *</Label>
                      <Textarea
                        id="inspection-notes"
                        placeholder="Provide comprehensive inspection findings, observations, measurements, and any issues identified..."
                        value={inspectionForm.inspectionNotes}
                        onChange={(e) => updateInspectionForm('inspectionNotes', e.target.value)}
                        rows={6}
                        required
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Compliance Check Tab */}
            <TabsContent value="compliance" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Permit Compliance
                    </CardTitle>
                    <CardDescription>
                      Verify permit conditions and regulatory compliance
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Permit Displayed</Label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.permitDisplayed === true}
                            onCheckedChange={(checked) => updateInspectionForm('permitDisplayed', checked ? true : null)}
                          />
                          <span className="text-sm">✅ Displayed</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.permitDisplayed === false}
                            onCheckedChange={(checked) => updateInspectionForm('permitDisplayed', checked ? false : null)}
                          />
                          <span className="text-sm">❌ Not Displayed</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Operations Compliant</Label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.operationsCompliant === true}
                            onCheckedChange={(checked) => updateInspectionForm('operationsCompliant', checked ? true : null)}
                          />
                          <span className="text-sm">✅ Compliant</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.operationsCompliant === false}
                            onCheckedChange={(checked) => updateInspectionForm('operationsCompliant', checked ? false : null)}
                          />
                          <span className="text-sm">❌ Non-compliant</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Records Accurate</Label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.recordsAccurate === true}
                            onCheckedChange={(checked) => updateInspectionForm('recordsAccurate', checked ? true : null)}
                          />
                          <span className="text-sm">✅ Accurate</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.recordsAccurate === false}
                            onCheckedChange={(checked) => updateInspectionForm('recordsAccurate', checked ? false : null)}
                          />
                          <span className="text-sm">❌ Inaccurate</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Waste Management Adequate</Label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.wasteManagementAdequate === true}
                            onCheckedChange={(checked) => updateInspectionForm('wasteManagementAdequate', checked ? true : null)}
                          />
                          <span className="text-sm">✅ Adequate</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <Checkbox 
                            checked={inspectionForm.wasteManagementAdequate === false}
                            onCheckedChange={(checked) => updateInspectionForm('wasteManagementAdequate', checked ? false : null)}
                          />
                          <span className="text-sm">❌ Inadequate</span>
                        </label>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardCheck className="h-5 w-5" />
                      Overall Assessment
                    </CardTitle>
                    <CardDescription>
                      Final compliance determination and recommendations
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Overall Compliance *</Label>
                      <Select value={inspectionForm.overallCompliance || ""} onValueChange={(value) => updateInspectionForm('overallCompliance', value || null)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select compliance status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="compliant">✅ Fully Compliant</SelectItem>
                          <SelectItem value="minor_issues">🟡 Minor Issues</SelectItem>
                          <SelectItem value="major_issues">🟠 Major Issues</SelectItem>
                          <SelectItem value="non_compliant">🔴 Non-Compliant</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="recommended-actions">Recommended Actions</Label>
                      <Textarea
                        id="recommended-actions"
                        placeholder="Specify any required corrective actions, follow-up inspections, or compliance measures..."
                        value={inspectionForm.recommendedActions}
                        onChange={(e) => updateInspectionForm('recommendedActions', e.target.value)}
                        rows={4}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Photos & Evidence Tab */}
            <TabsContent value="evidence" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="h-5 w-5" />
                    Photos & Evidence Collection
                  </CardTitle>
                  <CardDescription>
                    Document inspection findings with photographic evidence
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        checked={inspectionForm.photosRequired}
                        onCheckedChange={(checked) => updateInspectionForm('photosRequired', checked)}
                      />
                      <Label className="text-sm font-medium">Photos Required for this Inspection</Label>
                    </div>
                  </div>

                  {inspectionForm.photosRequired && (
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          checked={inspectionForm.photosTaken}
                          onCheckedChange={(checked) => updateInspectionForm('photosTaken', checked)}
                        />
                        <Label className="text-sm font-medium">Photos Taken During Inspection</Label>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="evidence-notes">Evidence & Photo Notes</Label>
                    <Textarea
                      id="evidence-notes"
                      placeholder="Describe photos taken, evidence collected, and any additional documentation..."
                      value={inspectionForm.evidenceNotes}
                      onChange={(e) => updateInspectionForm('evidenceNotes', e.target.value)}
                      rows={4}
                    />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                      <div className="text-sm text-blue-800">
                        <p className="font-medium">Photo Requirements:</p>
                        <ul className="mt-1 space-y-1 text-xs">
                          <li>• Infrastructure and equipment overview</li>
                          <li>• Water source conditions</li>
                          <li>• Safety measures implementation</li>
                          <li>• Any non-compliance issues identified</li>
                          <li>• Permit display (if applicable)</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Submit Button */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <div className="flex items-start gap-2">
                  {(!inspectionForm.overallCompliance || !inspectionForm.inspectionNotes.trim()) && (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-sm text-amber-800">
                        Please complete the overall compliance assessment and inspection notes before submitting.
                      </div>
                    </div>
                  )}
                </div>
                
                <Button 
                  onClick={handleSubmitInspection}
                  disabled={submitting || !inspectionForm.overallCompliance || !inspectionForm.inspectionNotes.trim()}
                  className="gap-2"
                  size="lg"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ClipboardCheck className="h-4 w-4" />
                  )}
                  Submit Inspection Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}




