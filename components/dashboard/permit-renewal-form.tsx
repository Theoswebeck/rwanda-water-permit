"use client";

import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  RefreshCw,
  Info,
  FileText,
  CreditCard,
  Upload,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  MapPin,
  Droplet,
  ArrowRight,
  ArrowLeft,
  Loader2,
  FileUp,
  X,
  Eye,
  BarChart3,
  CheckSquare
} from "lucide-react";
import { PaymentTab } from "@/components/dashboard/payment-tab";
import { WaterUseReportForm } from "@/components/dashboard/water-use-report-form";
import type { PermitWithApplication } from "@/components/dashboard/permit-select-for-renewal";
import type { Application, WaterUseReportTemplate, WaterUseReport } from "@/types/database";
import { supabase } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";

interface PermitRenewalFormProps {
  permit: PermitWithApplication;
  userData?: {
    id?: string;
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    company_name?: string;
    account_type?: string;
  };
  onSubmit: (formData: any) => Promise<void>;
  onSaveAsDraft: (formData: any, status: string) => Promise<void>;
  isLoading?: boolean;
  currentApplication?: Application | null;
  readOnly?: boolean;
  isStaffView?: boolean; // True for review/assessment/approver/inspector views - hides payment tab
}

// Helper to format date
const formatDate = (dateString?: string) => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const RENEWAL_FEE = 35000; // 35,000 RWF

// (debug instrumentation removed)

export const PermitRenewalForm = memo(function PermitRenewalForm({
  permit,
  userData,
  onSubmit,
  onSaveAsDraft,
  isLoading = false,
  currentApplication,
  readOnly = false,
  isStaffView = false,
}: PermitRenewalFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("how-it-works");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftSavedMessage, setDraftSavedMessage] = useState<string | null>(null);
  
  // Water use report state - full report data from WaterUseReportForm
  const [waterUseReportData, setWaterUseReportData] = useState<any>(null);
  const [waterUseReportSubmitted, setWaterUseReportSubmitted] = useState(false);
  const [existingWaterUseReport, setExistingWaterUseReport] = useState<WaterUseReport | null>(null);
  
  // Determine template type based on permit's intended activities
  const waterUseTemplate: WaterUseReportTemplate = useMemo(() => {
    const activities = permit.application?.intended_activities || [];
    // Fish farming activities use 'concession' template
    if (activities.some((a: string) => 
      a?.toLowerCase().includes('fish') || 
      a?.toLowerCase().includes('aquaculture')
    )) {
      return 'concession';
    }
    return 'abstraction';
  }, [permit.application?.intended_activities]);
  const reportYear = useMemo(() => new Date().getFullYear() - 1, []);
  
  // Attachment state
  const [renewalLetter, setRenewalLetter] = useState<File | null>(null);
  const [existingRenewalLetterUrl, setExistingRenewalLetterUrl] = useState<string | null>(null);
  const renewalLetterInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadExistingRenewalLetter = async () => {
      if (!currentApplication?.id) {
        setExistingRenewalLetterUrl(null);
        return;
      }

      try {
        const { data: byType, error: byTypeError } = await supabase
          .from('documents')
          .select('file_path')
          .eq('application_id', currentApplication.id)
          .eq('type', 'renewal_request_letter')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (byTypeError) {
          console.error('❌ Error loading renewal letter by type:', byTypeError);
        }

        if (byType?.file_path) {
          setExistingRenewalLetterUrl(getDocumentUrl(byType.file_path));
          return;
        }

        // Fallback for any legacy rows where type was not normalized correctly.
        const { data: byPath, error: byPathError } = await supabase
          .from('documents')
          .select('file_path')
          .eq('application_id', currentApplication.id)
          .ilike('file_path', `%applications/${currentApplication.id}/renewalRequestLetter-%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (byPathError) {
          console.error('❌ Error loading renewal letter by file path:', byPathError);
        }

        setExistingRenewalLetterUrl(getDocumentUrl(byPath?.file_path || null));
      } catch (err) {
        console.error('❌ Failed to load existing renewal letter:', err);
        setExistingRenewalLetterUrl(null);
      }
    };

    loadExistingRenewalLetter();
  }, [currentApplication?.id]);
  
  // Tab validation state
  const [tabsCompleted, setTabsCompleted] = useState({
    "how-it-works": true, // Always completed (informational)
    "water-use-report": false,
    attachments: false,
    payment: false,
  });

  // Check if water use report is complete (submitted)
  useEffect(() => {
    setTabsCompleted(prev => ({
      ...prev,
      "water-use-report": waterUseReportSubmitted,
    }));
  }, [waterUseReportSubmitted]);

  // Check if attachments are complete
  useEffect(() => {
    const hasRenewalLetter = renewalLetter !== null || existingRenewalLetterUrl !== null;
    
    setTabsCompleted(prev => ({
      ...prev,
      attachments: hasRenewalLetter,
    }));
  }, [renewalLetter, existingRenewalLetterUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        alert('Please upload a PDF or image file (JPEG, PNG)');
        return;
      }
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }
      setRenewalLetter(file);
    }
  };

  const handleRemoveFile = () => {
    setRenewalLetter(null);
    if (renewalLetterInputRef.current) {
      renewalLetterInputRef.current.value = '';
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  const handleNext = () => {
    const tabs = isStaffView 
      ? ["how-it-works", "water-use-report", "attachments"]
      : ["how-it-works", "water-use-report", "attachments", "payment"];
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const tabs = isStaffView 
      ? ["how-it-works", "water-use-report", "attachments"]
      : ["how-it-works", "water-use-report", "attachments", "payment"];
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1]);
    }
  };

  const canProceedToPayment = tabsCompleted["water-use-report"] && tabsCompleted.attachments;

  const getPermitHolderName = () => {
    const applicant = permit.application?.applicant;
    if (!applicant) return userData?.company_name || `${userData?.first_name || ''} ${userData?.last_name || ''}`.trim() || 'Unknown';
    if (applicant.company_name) return applicant.company_name;
    return `${applicant.first_name || ''} ${applicant.last_name || ''}`.trim() || 'Unknown';
  };

  const getDaysUntilExpiry = () => {
    if (!permit.expiry_date) return null;
    const expiry = new Date(permit.expiry_date);
    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysUntilExpiry = getDaysUntilExpiry();

  // Build form data for save/submit
  const buildFormData = useCallback(() => {
    return {
      // Core renewal data
      permitId: permit.id,
      permitNumber: permit.permit_number,
      originalApplicationId: permit.application_id,
      originalApplicationType: permit.application?.application_type,
      applicationType: 'renewal',
      isRenewal: true,
      renewed_from_permit_id: permit.id,
      
      // Water use report data
      waterUseReport: waterUseReportData,
      waterUseReportId: existingWaterUseReport?.id,
      
      // Renewal letter file
      renewalLetter,
      
      // Permit holder info (read-only reference)
      permitHolder: getPermitHolderName(),
      projectTitle: permit.application?.project_title,
      waterSource: permit.water_source,
      waterPurpose: permit.purpose,
      intendedActivities: permit.application?.intended_activities,
      
      // Location (read-only reference)
      province: permit.application?.province,
      district: permit.application?.district,
      sector: permit.application?.sector,
      cell: permit.application?.cell,
    };
  }, [permit, waterUseReportData, renewalLetter, existingWaterUseReport?.id]);

  useEffect(() => {
    const loadExistingWaterUseReport = async () => {
      if (!permit?.id) {
        setExistingWaterUseReport(null);
        setWaterUseReportData(null);
        setWaterUseReportSubmitted(false);
        return;
      }

      // IMPORTANT UX: A brand-new renewal should start with a blank annual report.
      // Only load previously-saved report data when we're editing an existing saved
      // renewal application (draft/submitted) or viewing in read-only mode.
      if (!readOnly && !currentApplication?.id) {
        setExistingWaterUseReport(null);
        setWaterUseReportData(null);
        setWaterUseReportSubmitted(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('water_use_reports')
          .select('*')
          .eq('permit_id', permit.id)
          .eq('reporting_year', reportYear)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('❌ Error loading renewal water use report:', error);
          return;
        }

        setExistingWaterUseReport((data as WaterUseReport | null) ?? null);
        if (data?.section3 || data?.section4 || data?.section5_monitoring || data?.section6_employment || data?.section7 || data?.section8 || data?.section9_declaration) {
          setWaterUseReportData({
            reportingYear: data.reporting_year,
            section3: data.section3,
            section3_quarterly: data.section3_quarterly,
            section4: data.section4,
            section5_monitoring: data.section5_monitoring,
            section5_incidents: data.section5_incidents,
            section6_employment: data.section6_employment,
            section6_ohs: data.section6_ohs,
            section7: data.section7,
            section8: data.section8,
            section9_declaration: data.section9_declaration,
          });
          // In the renewal flow the report is intentionally persisted with
          // status 'draft' (final renewal submission governs the lifecycle).
          // So we treat the report as "submitted" for the payment gate
          // whenever it contains meaningful section data — not just when
          // the DB status happens to be 'submitted'.
          const hasReportData = !!(
            data.section3 || data.section4 || data.section5_monitoring ||
            data.section6_employment || data.section7 || data.section8 ||
            data.section9_declaration
          );
          setWaterUseReportSubmitted(data.status === 'submitted' || hasReportData);
        }
      } catch (err) {
        console.error('❌ Failed to load renewal water use report:', err);
      }
    };

    loadExistingWaterUseReport();
  }, [permit?.id, reportYear, currentApplication?.id, readOnly]);

  const persistWaterUseReport = useCallback(async (reportData: any, nextStatus: 'draft' | 'submitted') => {
    const applicantId =
      userData?.id ||
      permit.application?.applicant?.id ||
      currentApplication?.applicant_id;

    if (!applicantId) {
      throw new Error('Missing applicant information for water use report');
    }

    const payload = {
      permit_id: permit.id,
      application_id: permit.application_id,
      applicant_id: applicantId,
      reporting_year: reportData?.reportingYear || reportYear,
      template: waterUseTemplate,
      // Keep draft if row already submitted and viewed in readonly contexts.
      status: existingWaterUseReport?.status === 'submitted' ? 'submitted' : nextStatus,
      section3: reportData?.section3 || null,
      section3_quarterly: reportData?.section3_quarterly || null,
      section4: reportData?.section4 || null,
      section5_monitoring: reportData?.section5_monitoring || null,
      section5_incidents: reportData?.section5_incidents || null,
      section6_employment: reportData?.section6_employment || null,
      section6_ohs: reportData?.section6_ohs || null,
      section7: reportData?.section7 || null,
      section8: reportData?.section8 || null,
      section9_declaration: reportData?.section9_declaration || null,
      submitted_at:
        (existingWaterUseReport?.status === 'submitted' || nextStatus === 'submitted')
          ? (existingWaterUseReport?.submitted_at || new Date().toISOString())
          : null,
      updated_at: new Date().toISOString(),
    } as const;

    if (existingWaterUseReport?.id) {
      const { data, error } = await supabase
        .from('water_use_reports')
        .update(payload)
        .eq('id', existingWaterUseReport.id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Failed to update water use report:', error);
        throw error;
      }
      console.log('✅ Water use report updated:', data?.id);
      setExistingWaterUseReport(data as WaterUseReport);
      return data as WaterUseReport;
    }

    // Use upsert with the unique constraint (permit_id, reporting_year) to
    // safely handle re-submits and race conditions where the row may already exist.
    const { data, error } = await supabase
      .from('water_use_reports')
      .upsert(payload, { onConflict: 'permit_id,reporting_year' })
      .select('*')
      .single();

    if (error) {
      console.error('❌ Failed to upsert water use report:', error);
      throw error;
    }
    console.log('✅ Water use report upserted:', data?.id);
    setExistingWaterUseReport(data as WaterUseReport);
    return data as WaterUseReport;
  }, [
    userData?.id,
    permit.id,
    permit.application_id,
    permit.application?.applicant?.id,
    currentApplication?.applicant_id,
    reportYear,
    waterUseTemplate,
    existingWaterUseReport?.id,
    existingWaterUseReport?.status,
    existingWaterUseReport?.submitted_at,
  ]);

  /**
   * Unified "Save as Draft" handler used by ALL save-as-draft buttons in the
   * renewal form — both the outer navigation buttons AND the inner
   * WaterUseReportForm button.
   *
   * @param waterUseReportOverride  Pass the latest WUR data when the save
   *   originates from inside the WaterUseReportForm (so the form data object
   *   includes it even though React state hasn't batched yet).
   */
  const handleSaveDraft = async (waterUseReportOverride?: any) => {
    try {
      setIsSaving(true);
      setSaveError(null);
      setDraftSavedMessage(null);

      // Build the payload — merge override WUR data so the caller doesn't
      // have to wait for React state to flush.
      const formData = {
        ...buildFormData(),
        ...(waterUseReportOverride !== undefined
          ? { waterUseReport: waterUseReportOverride }
          : {}),
      };

      console.log('📤 handleSaveDraft: calling onSaveAsDraft (renewal application)…');
      await onSaveAsDraft(formData, 'draft');
      console.log('✅ handleSaveDraft: renewal application saved — redirecting to dashboard');

      // ✅ Redirect to dashboard "Your Applications" after successful save
      router.push('/dashboard?tab=applications');
    } catch (err) {
      console.error('❌ handleSaveDraft: failed to save renewal draft:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  };

  const handleContinueToPayment = async () => {
    if (readOnly) return;

    // ALWAYS save before moving to payment — this ensures the renewal letter
    // file gets uploaded even when a draft application already exists.
    try {
      setIsSaving(true);
      setSaveError(null);
      await onSaveAsDraft(buildFormData(), 'draft');
      setActiveTab("payment");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to prepare renewal application for payment');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header Card with Permit Info */}
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-green-600" />
                <h2 className="text-xl font-semibold text-green-800">Permit Renewal</h2>
              </div>
              <p className="text-sm text-green-700">
                Renewing permit <span className="font-mono font-semibold">{permit.permit_number}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {daysUntilExpiry !== null && (
                <Badge 
                  className={
                    daysUntilExpiry < 0 
                      ? "bg-red-100 text-red-800" 
                      : daysUntilExpiry <= 30 
                        ? "bg-amber-100 text-amber-800"
                        : "bg-green-100 text-green-800"
                  }
                >
                  <Clock className="h-3 w-3 mr-1" />
                  {daysUntilExpiry < 0 
                    ? `Expired ${Math.abs(daysUntilExpiry)} days ago`
                    : `Expires in ${daysUntilExpiry} days`
                  }
                </Badge>
              )}
              <Badge className="bg-blue-100 text-blue-800">
                Fee: {RENEWAL_FEE.toLocaleString()} RWF
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Error */}
      {saveError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}
      {/* Save Success */}
      {draftSavedMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{draftSavedMessage}</AlertDescription>
        </Alert>
      )}

      {/* Main Form Tabs */}
      <Card>
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className={`grid w-full ${isStaffView ? 'grid-cols-3' : 'grid-cols-4'}`}>
              <TabsTrigger value="how-it-works" className="flex items-center gap-1 text-xs">
                <Info className="h-4 w-4" />
                <span className="hidden sm:inline">How It Works</span>
              </TabsTrigger>
              <TabsTrigger value="water-use-report" className="flex items-center gap-1 text-xs">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Water Use Report</span>
                {tabsCompleted["water-use-report"] && (
                  <CheckCircle className="h-3 w-3 text-green-600 ml-1" />
                )}
              </TabsTrigger>
              <TabsTrigger value="attachments" className="flex items-center gap-1 text-xs">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Attachments</span>
                {tabsCompleted.attachments && (
                  <CheckCircle className="h-3 w-3 text-green-600 ml-1" />
                )}
              </TabsTrigger>
              {!isStaffView && (
                <TabsTrigger 
                  value="payment" 
                  className="flex items-center gap-1 text-xs"
                  disabled={!canProceedToPayment}
                >
                  <CreditCard className="h-4 w-4" />
                  <span className="hidden sm:inline">Payment</span>
                </TabsTrigger>
              )}
            </TabsList>

            {/* TAB 1: How Renewal Works */}
            <TabsContent value="how-it-works" className="mt-6">
              <div className="space-y-6">
                <Card className="border-blue-200 bg-blue-50/30">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-800">
                      <Info className="h-5 w-5" />
                      Welcome to the Permit Renewal Process
                    </CardTitle>
                    <CardDescription>
                      Here&apos;s what you need to know about renewing your water use permit
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Step by Step Process */}
                    <div className="space-y-4">
                      <h3 className="font-semibold text-gray-900">Renewal Steps</h3>
                      <div className="grid gap-4">
                        {[
                          {
                            step: 1,
                            title: "Submit Water Use Report",
                            description: "Provide details about your water usage during the permit period. This helps us understand your actual consumption patterns.",
                            icon: BarChart3,
                          },
                          {
                            step: 2,
                            title: "Upload Renewal Request Letter",
                            description: "Submit a formal letter requesting the renewal of your water use permit. This should explain why you need to continue water usage.",
                            icon: FileText,
                          },
                          {
                            step: 3,
                            title: "Pay Renewal Fee",
                            description: `Pay the renewal fee of ${RENEWAL_FEE.toLocaleString()} RWF through IremboPay to complete your application.`,
                            icon: CreditCard,
                          },
                          {
                            step: 4,
                            title: "Application Review",
                            description: "Your renewal application will go through the standard review process. You'll be notified of any updates.",
                            icon: CheckSquare,
                          },
                        ].map((item) => (
                          <div
                            key={item.step}
                            className="flex gap-4 p-4 bg-white rounded-lg border"
                          >
                            <div className="flex-shrink-0">
                              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                <item.icon className="h-5 w-5 text-green-600" />
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  Step {item.step}
                                </Badge>
                                <h4 className="font-medium">{item.title}</h4>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {item.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Important Notes */}
                    <div className="space-y-3">
                      <h3 className="font-semibold text-gray-900">Important Notes</h3>
                      <div className="space-y-2">
                        <Alert className="border-amber-200 bg-amber-50">
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                          <AlertDescription className="text-amber-800">
                            <strong>No Changes to Permit Details:</strong> Renewal extends the validity period only. 
                            All existing permit details (water source, usage volumes, location) will remain unchanged.
                          </AlertDescription>
                        </Alert>
                        <Alert className="border-green-200 bg-green-50">
                          <Info className="h-4 w-4 text-green-600" />
                          <AlertDescription className="text-green-800">
                            <strong>Validity Period:</strong> Upon approval, your permit will be renewed for another 5 years 
                            from the renewal approval date.
                          </AlertDescription>
                        </Alert>
                      </div>
                    </div>

                    <Separator />

                    {/* Current Permit Summary */}
                    <div className="space-y-3">
                      <h3 className="font-semibold text-gray-900">Current Permit Details</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border">
                        <div>
                          <Label className="text-xs text-muted-foreground">Permit Number</Label>
                          <p className="font-mono font-semibold">{permit.permit_number}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Permit Holder</Label>
                          <p className="font-medium">{getPermitHolderName()}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Project Title</Label>
                          <p>{permit.application?.project_title || "N/A"}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Water Purpose</Label>
                          <p className="capitalize">{permit.purpose?.replace(/_/g, " ") || "N/A"}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Issue Date</Label>
                          <p>{formatDate(permit.issued_date)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Expiry Date</Label>
                          <p className={daysUntilExpiry !== null && daysUntilExpiry < 0 ? "text-red-600 font-semibold" : ""}>
                            {formatDate(permit.expiry_date)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Location</Label>
                          <p>{permit.application?.district}, {permit.application?.province}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Water Allowance</Label>
                          <p>{permit.water_allowance?.toLocaleString()} {permit.allowance_unit || "m³"}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Navigation - hidden in read-only mode */}
                {!readOnly && (
                  <div className="flex justify-between">
                    <Button
                      variant="outline"
                      onClick={handleSaveDraft}
                      disabled={isSaving}
                      className="gap-2"
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                      Save as Draft
                    </Button>
                    <Button onClick={handleNext} className="bg-green-600 hover:bg-green-700 gap-2">
                      Continue to Water Use Report
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 2: Water Use Report - Full Form */}
            <TabsContent value="water-use-report" className="mt-6">
              <div className="space-y-6">
                {/* Embedded Full Water Use Report Form */}
                <WaterUseReportForm
                  permit={permit as any}
                  template={waterUseTemplate}
                  reportingYear={reportYear}
                  existingReport={existingWaterUseReport}
                  onSaveAsDraft={async (data) => {
                    if (readOnly) return;
                    setSaveError(null);
                    try {
                      // Step 1: persist the water use report row
                      await persistWaterUseReport(data, 'draft');
                      setWaterUseReportData(data);
                      console.log('✅ Water use report draft saved');

                      // Step 2: save the renewal APPLICATION as a draft so it
                      // appears in the applicant dashboard list, then redirect.
                      // Uses the unified handleSaveDraft with override data so
                      // the latest WUR data is included even though React state
                      // hasn't flushed yet.
                      await handleSaveDraft(data);
                    } catch (err) {
                      console.error('❌ Failed to save draft (WUR + renewal app):', err);
                      setSaveError(err instanceof Error ? err.message : 'Failed to save draft');
                      throw err; // re-throw so WaterUseReportForm shows its own error
                    }
                  }}
                  onSubmit={async (data) => {
                    if (readOnly) return;
                    setSaveError(null);
                    try {
                      // Keep persisted status as draft in renewal flow; final renewal submission governs lifecycle.
                      await persistWaterUseReport(data, 'draft');
                      setWaterUseReportData(data);
                      setWaterUseReportSubmitted(true);
                      console.log('✅ Water use report submitted (renewal flow)');
                      // Auto-advance to next tab
                      setActiveTab("attachments");
                    } catch (err) {
                      console.error('❌ Failed to submit water use report:', err);
                      setSaveError(err instanceof Error ? err.message : 'Failed to save water use report');
                      throw err; // re-throw so caller knows it failed
                    }
                  }}
                  isLoading={isSaving}
                  isReadOnly={readOnly}
                />

                {/* Navigation - hidden in read-only mode */}
                {!readOnly && (
                  <div className="flex justify-between pt-4 border-t">
                    <Button variant="outline" onClick={handleBack} className="gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Back to Overview
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={handleSaveDraft}
                        disabled={isSaving}
                        className="gap-2"
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                        Save as Draft
                      </Button>
                      {waterUseReportSubmitted && (
                        <Button 
                          onClick={handleNext} 
                          className="bg-green-600 hover:bg-green-700 gap-2"
                        >
                          Continue to Attachments
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 3: Attachments */}
            <TabsContent value="attachments" className="mt-6">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Required Attachments
                    </CardTitle>
                    <CardDescription>
                      Upload the required documents for your renewal application. 
                      Note that existing permit details cannot be changed through renewal.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Renewal Letter Upload */}
                    <div className="space-y-4">
                      <div>
                        <Label className="text-base font-semibold">
                          Letter Requesting Renewal *
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Upload a formal letter requesting the renewal of your water use permit. 
                          This should explain why you need to continue water usage.
                        </p>
                      </div>

                      {/* File Upload Area */}
                      <div
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                          renewalLetter || existingRenewalLetterUrl
                            ? "border-green-300 bg-green-50"
                            : "border-gray-300 hover:border-gray-400"
                        }`}
                      >
                        {renewalLetter ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-center gap-2 text-green-600">
                              <CheckCircle className="h-8 w-8" />
                              <span className="font-medium">File Selected</span>
                            </div>
                            <div className="flex items-center justify-center gap-2 text-sm">
                              <FileText className="h-4 w-4" />
                              <span className="font-medium">{renewalLetter.name}</span>
                              <span className="text-muted-foreground">
                                ({(renewalLetter.size / 1024).toFixed(1)} KB)
                              </span>
                            </div>
                            {!readOnly && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleRemoveFile}
                                className="text-red-600 hover:text-red-700"
                              >
                                <X className="h-4 w-4 mr-1" />
                                Remove
                              </Button>
                            )}
                          </div>
                        ) : existingRenewalLetterUrl ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-center gap-2 text-green-600">
                              <CheckCircle className="h-8 w-8" />
                              <span className="font-medium">Document Uploaded</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(existingRenewalLetterUrl, '_blank')}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View Document
                            </Button>
                            {!readOnly && (
                              <div className="pt-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => renewalLetterInputRef.current?.click()}
                                >
                                  <Upload className="h-4 w-4 mr-1" />
                                  Replace Document
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : readOnly ? (
                          <div className="space-y-3">
                            <FileText className="h-12 w-12 mx-auto text-gray-400" />
                            <p className="text-sm text-muted-foreground">
                              No renewal letter uploaded
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <Upload className="h-12 w-12 mx-auto text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-700">
                                Click to upload or drag and drop
                              </p>
                              <p className="text-sm text-muted-foreground">
                                PDF, JPEG, or PNG (max 10MB)
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              onClick={() => renewalLetterInputRef.current?.click()}
                            >
                              <FileUp className="h-4 w-4 mr-2" />
                              Select File
                            </Button>
                          </div>
                        )}
                        {!readOnly && (
                          <input
                            ref={renewalLetterInputRef}
                            type="file"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={handleFileChange}
                          />
                        )}
                      </div>
                    </div>

                    <Separator />

                    {/* Existing Permit Documents (Read-only) */}
                    <div className="space-y-4">
                      <div>
                        <Label className="text-base font-semibold">
                          Existing Permit Documents
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          These are the documents from your original application. They are preserved and cannot be modified during renewal.
                        </p>
                      </div>
                      
                      <Alert className="border-slate-200 bg-slate-50">
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          All existing documents from your original permit application will be retained. 
                          If you need to update any permit details beyond renewal, please submit a Modification request instead.
                        </AlertDescription>
                      </Alert>
                    </div>
                  </CardContent>
                </Card>

                {/* Navigation - hidden in read-only mode */}
                {!readOnly && (
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={handleBack} className="gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        onClick={handleSaveDraft}
                        disabled={isSaving}
                        className="gap-2"
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                        Save as Draft
                      </Button>
                      <Button 
                        onClick={handleContinueToPayment}
                        className="bg-green-600 hover:bg-green-700 gap-2"
                        disabled={!tabsCompleted.attachments || isSaving}
                      >
                        Continue to Payment
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 4: Payment - Hidden for staff views */}
            {!isStaffView && (
              <TabsContent value="payment" className="mt-6">
                <div className="space-y-6">
                  {readOnly ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CreditCard className="h-5 w-5" />
                          Payment Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
                            <span className="font-medium">Renewal Fee</span>
                            <span className="text-lg font-bold text-green-600">{RENEWAL_FEE.toLocaleString()} RWF</span>
                          </div>
                          {currentApplication?.payment_status === 'paid' ? (
                            <Alert className="border-green-200 bg-green-50">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <AlertDescription className="text-green-800">
                                Payment has been completed for this renewal application.
                              </AlertDescription>
                            </Alert>
                          ) : (
                            <Alert className="border-amber-200 bg-amber-50">
                              <Clock className="h-4 w-4 text-amber-600" />
                              <AlertDescription className="text-amber-800">
                                Payment is pending for this renewal application.
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ) : !canProceedToPayment ? (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Cannot Proceed to Payment</AlertTitle>
                      <AlertDescription>
                        Please complete the Water Use Report and upload the required Renewal Letter before proceeding to payment.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <PaymentTab
                      application={currentApplication as Application}
                      formData={{
                        emailAddress: userData?.email,
                        telephoneContact: userData?.phone,
                        fullNameApplicant: getPermitHolderName(),
                        ...buildFormData(),
                      }}
                      onBack={handleBack}
                      isSavingApplication={isSaving}
                      saveError={saveError}
                      onRetrySave={handleSaveDraft}
                    />
                  )}
                  
                  {/* Back button if payment tab has issues - hidden in read-only mode */}
                  {!readOnly && !canProceedToPayment && (
                    <div className="flex justify-start">
                      <Button variant="outline" onClick={handleBack} className="gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Attachments
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
});

export default PermitRenewalForm;
