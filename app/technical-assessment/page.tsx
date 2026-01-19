"use client";

import { useState, useEffect, Suspense } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Upload, 
  FileText, 
  Camera, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Loader2,
  Save,
  Send,
  MapPin,
  Droplets,
  User
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Application, User as UserType } from "@/types/database";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// Technical Assessment Form Schema
const technicalAssessmentSchema = z.object({
  applicationId: z.string().min(1, "Application ID is required"),
  
  // Field Report Section
  fieldReportSummary: z.string().min(10, "Field report summary must be at least 10 characters"),
  
  // Detailed Report Files
  detailedReportFiles: z.array(z.any()).optional(),
  
  // Recommendation
  recommendation: z.enum(["yes", "no"], {
    required_error: "Please select a recommendation"
  }),
  
  // Explanation (required if recommendation is "no")
  explanationText: z.string().optional(),
  
  // Additional Assessment Fields
  locationVerified: z.boolean().optional(),
  waterSourceAccessible: z.boolean().optional(),
  environmentalImpactAssessed: z.boolean().optional(),
  technicalFeasibilityConfirmed: z.boolean().optional(),
  
  // Inspector Details
  inspectorName: z.string().min(1, "Inspector name is required"),
  inspectionDate: z.string().min(1, "Inspection date is required"),
  
}).refine((data) => {
  // If recommendation is "no", explanation is required
  if (data.recommendation === "no" && (!data.explanationText || data.explanationText.trim().length === 0)) {
    return false;
  }
  return true;
}, {
  message: "Explanation is required when recommendation is 'No'",
  path: ["explanationText"]
});

type TechnicalAssessmentFormData = z.infer<typeof technicalAssessmentSchema>;

interface ApplicationWithApplicant extends Application {
  applicant?: UserType;
}

function TechnicalAssessmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get('applicationId');
  
  const [application, setApplication] = useState<ApplicationWithApplicant | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const form = useForm<TechnicalAssessmentFormData>({
    resolver: zodResolver(technicalAssessmentSchema),
    defaultValues: {
      applicationId: applicationId || "",
      fieldReportSummary: "",
      recommendation: undefined,
      explanationText: "",
      locationVerified: false,
      waterSourceAccessible: false,
      environmentalImpactAssessed: false,
      technicalFeasibilityConfirmed: false,
      inspectorName: "",
      inspectionDate: new Date().toISOString().split('T')[0],
    }
  });

  // Fetch application details
  useEffect(() => {
    const fetchApplication = async () => {
      if (!applicationId) {
        setError("No application ID provided");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('applications')
          .select(`
            *,
            applicant:users!applicant_id(*)
          `)
          .eq('id', applicationId)
          .single();

        if (fetchError) throw fetchError;

        setApplication(data);
        form.setValue('applicationId', data.id);
      } catch (err) {
        console.error('Error fetching application:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch application');
      } finally {
        setLoading(false);
      }
    };

    fetchApplication();
  }, [applicationId, form]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newFiles = Array.from(files);
    const validFiles = newFiles.filter(file => {
      // Validate file types (PDF and images)
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      return validTypes.includes(file.type) && file.size <= 10 * 1024 * 1024; // 10MB limit
    });

    if (validFiles.length !== newFiles.length) {
      alert('Some files were rejected. Only PDF and image files under 10MB are allowed.');
    }

    setUploadedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: TechnicalAssessmentFormData) => {
    try {
      setSubmitting(true);
      setError(null);

      // Upload files first if any
      const uploadedFileUrls: string[] = [];
      
      for (const file of uploadedFiles) {
        const fileName = `technical-assessment/${applicationId}/${Date.now()}-${file.name}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(fileName, file);

        if (uploadError) throw uploadError;
        
        uploadedFileUrls.push(uploadData.path);
      }

      // Create technical assessment record
      const assessmentData = {
        application_id: data.applicationId,
        field_report_summary: data.fieldReportSummary,
        recommendation: data.recommendation,
        explanation_text: data.explanationText || null,
        location_verified: data.locationVerified || false,
        water_source_accessible: data.waterSourceAccessible || false,
        environmental_impact_assessed: data.environmentalImpactAssessed || false,
        technical_feasibility_confirmed: data.technicalFeasibilityConfirmed || false,
        inspector_name: data.inspectorName,
        inspection_date: data.inspectionDate,
        uploaded_files: uploadedFileUrls,
        created_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from('technical_assessments')
        .insert([assessmentData]);

      if (insertError) throw insertError;

      // Update application status based on recommendation
      const newStatus = data.recommendation === 'yes' ? 'pending_final_approval' : 'revision_required';
      
      const { error: updateError } = await supabase
        .from('applications')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.applicationId);

      if (updateError) throw updateError;

      // Success - redirect back to assessment dashboard
      router.push('/assessment?success=technical-assessment-submitted');

    } catch (err) {
      console.error('Error submitting technical assessment:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit assessment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-muted-foreground">Loading application...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !application) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive font-medium">Error loading application</p>
              <p className="text-muted-foreground text-sm mt-1">{error}</p>
              <Button 
                onClick={() => router.push('/assessment')} 
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

  const getApplicantName = () => {
    const applicant = application.applicant;
    if (!applicant) return 'Unknown Applicant';
    
    if (applicant.account_type === 'individual') {
      return `${applicant.first_name || ''} ${applicant.last_name || ''}`.trim() || 'Unknown Individual';
    } else {
      return applicant.company_name || 'Unknown Company';
    }
  };

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="container mx-auto px-4 py-6"
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center">
            <Link href="/assessment">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Assessment Dashboard
              </Button>
            </Link>
          </div>

          <div className="space-y-2">
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
              Technical Assessment
            </h1>
            <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base leading-relaxed">
              Conduct field assessment and provide technical recommendation for water permit application
            </p>
          </div>

          {/* Application Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Application Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Application Number</Label>
                  <p className="font-medium">{application.application_number}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Applicant</Label>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{getApplicantName()}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Project Title</Label>
                  <p className="font-medium">{application.project_title || 'No project title'}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Water Source</Label>
                  <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{application.water_source || 'Not specified'}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Location</Label>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{application.district}, {application.sector}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Water Purpose</Label>
                  <p className="font-medium">{application.water_purpose || 'Not specified'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Technical Assessment Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Assessment Report Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Assessment Report
                  </CardTitle>
                  <CardDescription>
                    Provide a summary of your field visit and observations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="fieldReportSummary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Field Report Summary *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe your field visit findings, site conditions, water source accessibility, environmental observations, and any technical concerns..."
                            className="min-h-[120px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Assessment Checkboxes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="locationVerified"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="mt-1"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Location Verified</FormLabel>
                            <p className="text-sm text-muted-foreground">
                              Coordinates and site location confirmed
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="waterSourceAccessible"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="mt-1"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Water Source Accessible</FormLabel>
                            <p className="text-sm text-muted-foreground">
                              Water source is accessible and viable
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="environmentalImpactAssessed"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="mt-1"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Environmental Impact Assessed</FormLabel>
                            <p className="text-sm text-muted-foreground">
                              Environmental impact evaluation completed
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="technicalFeasibilityConfirmed"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="mt-1"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Technical Feasibility Confirmed</FormLabel>
                            <p className="text-sm text-muted-foreground">
                              Technical implementation is feasible
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* File Upload Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Detailed Report & Evidence
                  </CardTitle>
                  <CardDescription>
                    Upload detailed assessment reports, photos, and supporting documents
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6">
                    <div className="text-center">
                      <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground mb-2">
                        Upload PDF reports and image files (max 10MB each)
                      </p>
                      <Input
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFileUpload}
                        className="max-w-xs mx-auto"
                      />
                    </div>
                  </div>

                  {/* Uploaded Files List */}
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Uploaded Files</Label>
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                          <div className="flex items-center gap-2">
                            {file.type.startsWith('image/') ? (
                              <Camera className="h-4 w-4" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                            <span className="text-sm">{file.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {(file.size / 1024 / 1024).toFixed(1)} MB
                            </Badge>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Assessment Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Assessment Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="inspectorName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assessment Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter assessment name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="inspectionDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assessment Date *</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Recommendation Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    Technical Recommendation
                  </CardTitle>
                  <CardDescription>
                    Provide your technical recommendation based on the field assessment
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="recommendation"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Recommendation *</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex flex-col space-y-2"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="yes" id="yes" />
                              <Label htmlFor="yes" className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                Yes - Recommend for approval
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="no" id="no" />
                              <Label htmlFor="no" className="flex items-center gap-2">
                                <XCircle className="h-4 w-4 text-red-600" />
                                No - Do not recommend for approval
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch('recommendation') === 'no' && (
                    <FormField
                      control={form.control}
                      name="explanationText"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Explanation *</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Please provide detailed explanation for why you do not recommend this application for approval..."
                              className="min-h-[100px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Error Display */}
              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Submit Actions */}
              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/assessment')}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting Assessment...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Submit Technical Assessment
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}

// Loading fallback
function TechnicalAssessmentLoading() {
  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3">Loading...</span>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Main export with Suspense
export default function TechnicalAssessmentPage() {
  return (
    <Suspense fallback={<TechnicalAssessmentLoading />}>
      <TechnicalAssessmentContent />
    </Suspense>
  );
}
