"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import type { AppLanguage } from "@/lib/i18n/language";
import { getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { 
  useExistingReportCheck, 
  useCreateWaterUseReportMutation, 
  useUpdateWaterUseReportMutation,
  useSubmitWaterUseReportMutation,
  getReportTemplate,
  type WaterUseReportWithRelations
} from "@/hooks/useWaterUseReports";
import type { PermitWithApplication } from "@/hooks/usePermitsQuery";
import type { WaterUseReportTemplate } from "@/types/database";

// Lazy load the form component
const WaterUseReportForm = dynamic(
  () => import("@/components/dashboard/water-use-report-form").then(mod => ({ default: mod.WaterUseReportForm })),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-sm text-muted-foreground">Loading form...</span>
      </div>
    ),
    ssr: false
  }
);

function WaterUseReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const permitId = searchParams.get('permit_id');
  const reportId = searchParams.get('id');
  const { userProfile } = useAuth();
  const [language, setLanguage] = useState<AppLanguage>("en");
  const tx = useCallback((value: string) => translateText(value, language), [language]);
  useEffect(() => { setLanguage(getPreferredLanguage()); return subscribeToLanguageChanges(setLanguage); }, []);

  const [permit, setPermit] = useState<PermitWithApplication | null>(null);
  const [existingReport, setExistingReport] = useState<WaterUseReportWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  const reportingYear = new Date().getFullYear() - 1;

  // Mutations
  const createMutation = useCreateWaterUseReportMutation();
  const updateMutation = useUpdateWaterUseReportMutation();
  const submitMutation = useSubmitWaterUseReportMutation();

  // Check for existing report for this permit and year
  const { data: existingReportForYear } = useExistingReportCheck(
    permitId || '', 
    reportingYear, 
    !!permitId && !reportId
  );

  // Load permit data
  useEffect(() => {
    const loadPermitData = async () => {
      if (!permitId) {
        setError('No permit specified');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch permit with application data
        const { data: permitData, error: permitError } = await supabase
          .from('permits')
          .select(`
            *,
            application:applications!application_id(
              id, application_number, project_title, intended_activities, 
              province, district, sector, cell, village, water_body_name,
              max_daily_volume_m3, max_yearly_volume_m3, concession_area,
              water_source, water_purpose,
              applicant:users!applicant_id(
                id, first_name, last_name, company_name, email
              )
            )
          `)
          .eq('id', permitId)
          .single();

        if (permitError) throw permitError;
        if (!permitData) throw new Error('Permit not found');

        setPermit(permitData);

        // If we have a reportId, fetch the existing report
        if (reportId) {
          const { data: reportData, error: reportError } = await supabase
            .from('water_use_reports')
            .select('*')
            .eq('id', reportId)
            .single();

          if (reportError) throw reportError;
          setExistingReport(reportData);
        }

      } catch (err) {
        console.error('Error loading permit data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load permit data');
      } finally {
        setLoading(false);
      }
    };

    loadPermitData();
  }, [permitId, reportId]);

  // Redirect to existing report if one exists for this year
  useEffect(() => {
    if (existingReportForYear && !reportId) {
      router.replace(`/dashboard/water-use-report?permit_id=${permitId}&id=${existingReportForYear.id}`);
    }
  }, [existingReportForYear, permitId, reportId, router]);

  // Handle save as draft
  const handleSaveAsDraft = async (
    formData: any,
    options: { syncUrl?: boolean; showDraftFeedback?: boolean } = {}
  ): Promise<string | null> => {
    if (!permit || !userProfile?.id) return null;

    try {
      const { syncUrl = true, showDraftFeedback = true } = options;
      // An existing report keeps the template it was created with; only a new
      // report resolves one from the permit.
      const template =
        (existingReport?.template as WaterUseReportTemplate | undefined) ??
        getReportTemplate(permit.application?.intended_activities, permit.purpose);
      
      const reportPayload = {
        permit_id: permit.id,
        application_id: permit.application_id,
        applicant_id: userProfile.id,
        reporting_year: formData.reportingYear || reportingYear,
        template,
        status: 'draft' as const,
        section3: formData.section3 || null,
        section3_quarterly: formData.section3_quarterly || null,
        section4: formData.section4 || null,
        section5_monitoring: formData.section5_monitoring || null,
        section5_incidents: formData.section5_incidents || null,
        section6_employment: formData.section6_employment || null,
        section6_ohs: formData.section6_ohs || null,
        section7: formData.section7 || null,
        section8: formData.section8 || null,
        section9_declaration: formData.section9_declaration || null,
      };

      let persistedId: string;
      if (existingReport?.id || reportId) {
        persistedId = existingReport?.id || reportId!;
        await updateMutation.mutateAsync({
          id: persistedId,
          ...reportPayload,
        });
      } else {
        const result = await createMutation.mutateAsync(reportPayload);
        setExistingReport(result);
        persistedId = result.id;
        if (syncUrl) {
          // Keep URL/report state in sync for draft workflows.
          router.replace(`/dashboard/water-use-report?permit_id=${permitId}&id=${result.id}`);
        }
      }

      if (showDraftFeedback) {
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 3000);
      }
      return persistedId;
    } catch (err) {
      console.error('Error saving draft:', err);
      setError(err instanceof Error ? err.message : 'Failed to save draft');
      return null;
    }
    return null;
  };

  // Handle submit
  const handleSubmit = async (formData: any) => {
    if (!permit || !userProfile?.id) return;

    try {
      // First save the data
      const savedReportId = await handleSaveAsDraft(formData, {
        syncUrl: false,
        showDraftFeedback: false,
      });

      // Then submit
      const idToSubmit = savedReportId || existingReport?.id || reportId;
      if (idToSubmit) {
        await submitMutation.mutateAsync(idToSubmit);
        setSubmitSuccess(true);
      }
    } catch (err) {
      console.error('Error submitting report:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit report');
    }
  };

  // Redirect after successful submit
  useEffect(() => {
    if (submitSuccess) {
      const timer = setTimeout(() => {
        router.push("/dashboard?tab=permits&success=report-submitted");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [submitSuccess, router]);

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['applicant']} requireProfile={true}>
        <DashboardLayout>
          <div className="container mx-auto px-4 py-6">
            <div className="space-y-6">
              <div className="flex items-center mb-6">
                <div className="h-9 w-32 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="space-y-4">
                <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-6 w-3/4 bg-gray-100 rounded animate-pulse"></div>
              </div>
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  if (submitSuccess) {
    return (
      <ProtectedRoute allowedRoles={['applicant']} requireProfile={true}>
        <DashboardLayout>
          <div className="container mx-auto px-4 py-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="max-w-md mx-auto text-center py-12"
            >
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-medium text-green-900 mb-2">{tx("Report Submitted!")}</h2>
              <p className="text-green-700 mb-4">
                {tx("Your annual water use report has been submitted successfully.")}
              </p>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {tx("Redirecting to dashboard...")}
              </p>
            </motion.div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  if (!permit) {
    return (
      <ProtectedRoute allowedRoles={['applicant']} requireProfile={true}>
        <DashboardLayout>
          <div className="container mx-auto px-4 py-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error || tx('Permit not found. Please select a valid permit.')}
              </AlertDescription>
            </Alert>
            <Link href="/dashboard" className="mt-4 inline-block">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {tx("Back to Dashboard")}
              </Button>
            </Link>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  const template =
    (existingReport?.template as WaterUseReportTemplate | undefined) ??
    getReportTemplate(permit.application?.intended_activities, permit.purpose);

  return (
    <ProtectedRoute allowedRoles={['applicant']} requireProfile={true}>
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center mb-6">
            <Link href="/dashboard">
              <Button variant="ghost" className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                {tx("Back to Dashboard")}
              </Button>
            </Link>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-8"
          >
            <div>
              <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
                {tx("Annual Water Use Report")}
              </h1>
              <p className="text-muted-foreground mt-2">
                {tx("Submit your annual water resources use report as required by Ministerial Order No 001/MoE/24 of 02/04/2024.")}
              </p>
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <span className="font-medium">{tx("Permit:")}</span> {permit.permit_number} •
                  <span className="font-medium ml-2">{tx("Reporting Year:")}</span> {reportingYear} •
                  <span className="font-medium ml-2">{tx("Template:")}</span> {template === 'abstraction' ? tx('Abstraction Uses') : tx('Concession Uses')}
                </p>
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Draft Saved Alert */}
            {draftSaved && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  {tx("Draft saved successfully.")}
                </AlertDescription>
              </Alert>
            )}

            {/* Existing Report Warning */}
            {existingReport?.status === 'submitted' && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  {tx("This report has already been submitted. You can view it but cannot make changes.")}
                </AlertDescription>
              </Alert>
            )}

            <WaterUseReportForm
              permit={permit}
              template={template}
              reportingYear={reportingYear}
              existingReport={existingReport}
              onSaveAsDraft={handleSaveAsDraft}
              onSubmit={handleSubmit}
              isLoading={createMutation.isPending || updateMutation.isPending || submitMutation.isPending}
              isReadOnly={existingReport?.status === 'submitted'}
            />
          </motion.div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

// Loading fallback
function WaterUseReportLoading() {
  return (
    <ProtectedRoute allowedRoles={['applicant']} requireProfile={true}>
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-3">{translateText("Loading report form...", getPreferredLanguage())}</span>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

// Main export with Suspense
export default function WaterUseReportPage() {
  return (
    <Suspense fallback={<WaterUseReportLoading />}>
      <WaterUseReportContent />
    </Suspense>
  );
}
