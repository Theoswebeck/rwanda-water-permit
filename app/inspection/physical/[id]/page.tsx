"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft, 
  Loader2,
  AlertCircle,
  AlertTriangle,
  ClipboardCheck,
  Save
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fetchInspectionData, isInspectionComplete, type PermitInspectionData } from "@/lib/inspection-utils";

// Import section components
import { PermitHolderSection } from "@/components/inspection/checklist/section-permit-holder";
import { ActivityPermitSection } from "@/components/inspection/checklist/section-activity-permit";
import { WaterSourceSection } from "@/components/inspection/checklist/section-water-source";
import { AllowedAbstractionSection } from "@/components/inspection/checklist/section-allowed-abstraction";
import { ActualAbstractionSection } from "@/components/inspection/checklist/section-actual-abstraction";
import { WastewaterSection } from "@/components/inspection/checklist/section-wastewater";
import { FeesPaymentSection } from "@/components/inspection/checklist/section-fees-payment";
import { ReportsSection } from "@/components/inspection/checklist/section-reports";
import { ConflictsInitiativesSection } from "@/components/inspection/checklist/section-conflicts-initiatives";
import { OverallAssessmentSection } from "@/components/inspection/checklist/section-overall-assessment";

interface InspectionFormData {
  // Section 2: Activity Details
  activityType?: string;
  activityStartingDate?: string;
  
  // Section 5: Allowed Water Abstraction (pre-populated)
  allowedQuantity?: number;
  allowedUnit?: string;
  authorizedAbstractionMethod?: string;
  
  // Section 6: Actual Water Abstraction
  actualQuantity?: number;
  actualUnit?: string;
  actualAbstractionMethod?: string;
  measurementDeviceType?: string;
  measurementDeviceNotes?: string;
  measurementDevicePhotoTaken?: boolean;
  
  // Section 7: Wastewater Management
  wastewaterSystemType?: string;
  wastewaterSystemEffectiveness?: string;
  wastewaterSystemPhotosTaken?: boolean;
  wastewaterNotes?: string;
  
  // Section 8: Fees Payment
  feesPaymentVerified?: boolean;
  feesPaymentAmount?: number;
  feesPaymentProof?: string;
  feesOutstandingAmount?: number;
  
  // Section 9: Reports
  reportsSubmitted?: boolean;
  reportsSubmissionDate?: string;
  reportsReferenceNumber?: string;
  reportsProof?: string;
  
  // Section 10: Water Use Conflicts
  waterUseConflicts?: string;
  conflictSeverity?: string;
  
  // Section 11: Catchment Protection
  catchmentProtectionInitiatives?: string;
  protectionPhotosTaken?: boolean;
  
  // Section 12: Overall Assessment
  complianceStatus?: string;
  generalConclusion?: string;
  recommendations?: string;
}

export default function PermitInspectionPage() {
  const params = useParams();
  const router = useRouter();
  
  const [inspectionData, setInspectionData] = useState<PermitInspectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("basic-info");
  
  const [formData, setFormData] = useState<InspectionFormData>({});

  // Fetch inspection data
  useEffect(() => {
    const loadInspectionData = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!params.id) {
          setError('No application ID provided');
          return;
        }

        const data = await fetchInspectionData(decodeURIComponent(params.id as string));
        
        if (!data) {
          setError('Application not found');
          return;
        }

        setInspectionData(data);
        
        // Pre-populate allowed abstraction data from permit
        if (data.permit) {
          setFormData(prev => ({
            ...prev,
            allowedQuantity: data.permit?.water_allowance,
            allowedUnit: data.permit?.allowance_unit,
            authorizedAbstractionMethod: data.prepopulatedData.authorizedMethod,
            activityType: data.prepopulatedData.activityType,
            activityStartingDate: data.prepopulatedData.activityStartingDate
          }));
        }
      } catch (err) {
        console.error('Error loading inspection data:', err);
        setError('Failed to load inspection data');
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      loadInspectionData();
    }
  }, [params.id]);

  const updateFormData = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!formData.actualQuantity) {
      errors.push('Actual water abstraction quantity is required');
    }
    if (!formData.measurementDeviceType) {
      errors.push('Measurement device type is required');
    }
    if (formData.feesPaymentVerified === undefined) {
      errors.push('Fees payment verification is required');
    }
    if (formData.reportsSubmitted === undefined) {
      errors.push('Reports submission status is required');
    }
    if (!formData.waterUseConflicts?.trim()) {
      errors.push('Water use conflicts description is required (write "None" if no conflicts)');
    }
    if (!formData.complianceStatus) {
      errors.push('Overall compliance status is required');
    }
    if (!formData.generalConclusion?.trim()) {
      errors.push('General conclusion is required');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const handleSubmit = async () => {
    const validation = validateForm();
    
    if (!validation.isValid) {
      alert('⚠️ Please complete all required fields:\n\n' + validation.errors.join('\n'));
      return;
    }
    
    if (!inspectionData?.application) {
      alert('Application data not loaded');
      return;
    }
    
    try {
      setSubmitting(true);
      
      // Get current user (inspector) - use getSession for the actual auth.uid() value
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      
      if (sessionError || !user?.id) {
        console.error('❌ Session check failed:', sessionError || 'No session user');
        alert('⚠️ Your session is missing or expired. Please log in again, then retry.');
        return;
      }

      const extractMissingColumnFromError = (err: any): string | null => {
        const msg = String(err?.message || "");

        let m = msg.match(/Could not find the '([^']+)' column of '([^']+)' in the schema cache/i);
        if (m && (m[2] === "inspections" || m[2] === "public.inspections")) return m[1];

        m = msg.match(/column ["']?([^"']+)["']? of relation ["']?([^"']+)["']? does not exist/i);
        if (m && (m[2] === "inspections" || m[2] === "public.inspections")) return m[1];

        return null;
      };

      const omitKey = (p: any, key: string) => {
        const { [key]: _omitted, ...rest } = p || {};
        return rest;
      };

      const runWithMissingColumnRetries = async (
        run: (p: any) => Promise<{ error: any }>,
        initialPayload: any
      ) => {
        let cur = initialPayload;
        const removed = new Set<string>();
        let lastErr: any = null;

        for (let attempt = 0; attempt < 25; attempt++) {
          const { error } = await run(cur);
          if (!error) return { error: null };

          lastErr = error;
          const missingCol = extractMissingColumnFromError(error);
          if (missingCol && missingCol in cur && !removed.has(missingCol)) {
            removed.add(missingCol);
            cur = omitKey(cur, missingCol);
            console.warn(`⚠️ Inspections schema missing column '${missingCol}'. Retrying without it.`);
            continue;
          }

          return { error };
        }

        return { error: lastErr };
      };

      // Create comprehensive inspection record
      const inspectionPayload = {
          application_id: inspectionData.application.id,
          inspector_id: user.id,
          type: 'annual', // or 'follow_up', 'initial', etc.
          status: 'completed',
          workflow_status: 'pending_review',
          scheduled_date: new Date().toISOString(),
          completed_date: new Date().toISOString(),
          
          // Activity details
          activity_type: formData.activityType,
          activity_starting_date: formData.activityStartingDate,
          
          // Allowed abstraction (from permit)
          allowed_quantity: formData.allowedQuantity,
          allowed_unit: formData.allowedUnit,
          authorized_abstraction_method: formData.authorizedAbstractionMethod,
          
          // Actual abstraction (inspector input)
          actual_quantity: formData.actualQuantity,
          actual_unit: formData.actualUnit,
          actual_abstraction_method: formData.actualAbstractionMethod,
          measurement_device_type: formData.measurementDeviceType,
          measurement_device_notes: formData.measurementDeviceNotes,
          measurement_device_photo_taken: formData.measurementDevicePhotoTaken,
          
          // Wastewater management
          wastewater_system_type: formData.wastewaterSystemType,
          wastewater_system_effectiveness: formData.wastewaterSystemEffectiveness,
          wastewater_system_photos_taken: formData.wastewaterSystemPhotosTaken,
          wastewater_notes: formData.wastewaterNotes,
          
          // Fees payment
          fees_payment_verified: formData.feesPaymentVerified,
          fees_payment_amount: formData.feesPaymentAmount,
          fees_payment_proof: formData.feesPaymentProof,
          fees_outstanding_amount: formData.feesOutstandingAmount,
          
          // Reports
          reports_submitted: formData.reportsSubmitted,
          reports_submission_date: formData.reportsSubmissionDate,
          reports_reference_number: formData.reportsReferenceNumber,
          reports_proof: formData.reportsProof,
          
          // Conflicts and initiatives
          water_use_conflicts: formData.waterUseConflicts,
          conflict_severity: formData.conflictSeverity,
          catchment_protection_initiatives: formData.catchmentProtectionInitiatives,
          protection_photos_taken: formData.protectionPhotosTaken,
          
          // Overall assessment
          compliance_status: formData.complianceStatus,
          general_conclusion: formData.generalConclusion,
          recommendations: formData.recommendations,
          
          // Calculate if usage is within limits
          volume_limits_respected: formData.allowedQuantity 
            ? (formData.actualQuantity || 0) <= formData.allowedQuantity
            : null,
          regulatory_compliance: formData.complianceStatus === 'compliant'
        };

      const { error: inspectionError } = await runWithMissingColumnRetries(
        p => supabase.from('inspections').insert(p),
        inspectionPayload
      );

      if (inspectionError) throw inspectionError;

      // Update application inspection timestamp
      const { error: appError } = await supabase
        .from('applications')
        .update({ 
          inspected_at: new Date().toISOString()
        })
        .eq('id', inspectionData.application.id);

      if (appError) throw appError;

      const message = formData.complianceStatus === 'non_compliant' 
        ? "🚫 Inspection completed - Non-compliant status recorded" 
        : "✅ Permit inspection completed successfully";

      alert(message);
      router.push('/inspection');
    } catch (err) {
      console.error('Error submitting inspection:', err);
      alert('Failed to submit inspection. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate form completion progress
  const calculateProgress = (): number => {
    const fields = [
      formData.actualQuantity,
      formData.measurementDeviceType,
      formData.feesPaymentVerified !== undefined,
      formData.reportsSubmitted !== undefined,
      formData.waterUseConflicts,
      formData.complianceStatus,
      formData.generalConclusion
    ];
    
    const completed = fields.filter(Boolean).length;
    return Math.round((completed / fields.length) * 100);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading inspection data...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !inspectionData) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-6 w-6" />
            <span>{error || 'Inspection data not found'}</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const progress = calculateProgress();
  const { prepopulatedData, paymentHistory } = inspectionData;

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
                  Permit Holder Inspection
                </h1>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-lg font-semibold text-blue-600">
                    {inspectionData.application.application_number}
                  </span>
                  <Badge>{prepopulatedData.permitNumber}</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Indicator */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Form Completion</span>
                  <span className="text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Complete all required fields (*) to submit the inspection
                </p>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Main Form Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic-info">Basic Info</TabsTrigger>
              <TabsTrigger value="water-usage">Water Usage</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
              <TabsTrigger value="assessment">Assessment</TabsTrigger>
            </TabsList>

            {/* Tab 1: Basic Information */}
            <TabsContent value="basic-info" className="space-y-6">
              <PermitHolderSection data={prepopulatedData} />
              <ActivityPermitSection data={prepopulatedData} />
              <WaterSourceSection data={prepopulatedData} />
            </TabsContent>

            {/* Tab 2: Water Usage */}
            <TabsContent value="water-usage" className="space-y-6">
              <AllowedAbstractionSection 
                data={{
                  allowedQuantity: formData.allowedQuantity,
                  allowedUnit: formData.allowedUnit,
                  authorizedMethod: formData.authorizedAbstractionMethod
                }}
              />
              <ActualAbstractionSection
                data={{
                  actualQuantity: formData.actualQuantity,
                  actualUnit: formData.actualUnit,
                  actualAbstractionMethod: formData.actualAbstractionMethod,
                  measurementDeviceType: formData.measurementDeviceType,
                  measurementDeviceNotes: formData.measurementDeviceNotes,
                  measurementDevicePhotoTaken: formData.measurementDevicePhotoTaken
                }}
                allowedQuantity={formData.allowedQuantity}
                allowedUnit={formData.allowedUnit}
                onChange={updateFormData}
              />
              <WastewaterSection
                data={{
                  wastewaterSystemType: formData.wastewaterSystemType,
                  wastewaterSystemEffectiveness: formData.wastewaterSystemEffectiveness,
                  wastewaterSystemPhotosTaken: formData.wastewaterSystemPhotosTaken,
                  wastewaterNotes: formData.wastewaterNotes
                }}
                onChange={updateFormData}
              />
            </TabsContent>

            {/* Tab 3: Compliance */}
            <TabsContent value="compliance" className="space-y-6">
              <FeesPaymentSection
                data={{
                  feesPaymentVerified: formData.feesPaymentVerified,
                  feesPaymentAmount: formData.feesPaymentAmount,
                  feesPaymentProof: formData.feesPaymentProof,
                  feesOutstandingAmount: formData.feesOutstandingAmount
                }}
                paymentHistory={paymentHistory}
                totalPaymentAmount={prepopulatedData.totalPaymentAmount}
                lastPaymentDate={prepopulatedData.lastPaymentDate}
                paymentStatus={prepopulatedData.paymentStatus}
                onChange={updateFormData}
              />
              <ReportsSection
                data={{
                  reportsSubmitted: formData.reportsSubmitted,
                  reportsSubmissionDate: formData.reportsSubmissionDate,
                  reportsReferenceNumber: formData.reportsReferenceNumber,
                  reportsProof: formData.reportsProof
                }}
                onChange={updateFormData}
              />
            </TabsContent>

            {/* Tab 4: Assessment */}
            <TabsContent value="assessment" className="space-y-6">
              <ConflictsInitiativesSection
                data={{
                  waterUseConflicts: formData.waterUseConflicts,
                  conflictSeverity: formData.conflictSeverity,
                  catchmentProtectionInitiatives: formData.catchmentProtectionInitiatives,
                  protectionPhotosTaken: formData.protectionPhotosTaken
                }}
                onChange={updateFormData}
              />
              <OverallAssessmentSection
                data={{
                  complianceStatus: formData.complianceStatus,
                  generalConclusion: formData.generalConclusion,
                  recommendations: formData.recommendations
                }}
                onChange={updateFormData}
              />
            </TabsContent>
          </Tabs>

          {/* Submit Section */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <div className="flex-1">
                  {progress < 100 && (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-sm text-amber-800">
                        Please complete all required fields before submitting the inspection report.
                      </div>
                    </div>
                  )}
                </div>
                
                <Button 
                  onClick={handleSubmit}
                  disabled={submitting || progress < 100}
                  className="gap-2 ml-4"
                  size="lg"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <ClipboardCheck className="h-4 w-4" />
                      Submit Inspection Report
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}




