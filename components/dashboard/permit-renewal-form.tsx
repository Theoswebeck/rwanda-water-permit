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
import type { PermitWithApplication } from "@/components/dashboard/permit-select-for-renewal";
import type { Application } from "@/types/database";
import { supabase } from "@/lib/supabase";

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

export const PermitRenewalForm = memo(function PermitRenewalForm({
  permit,
  userData,
  onSubmit,
  onSaveAsDraft,
  isLoading = false,
  currentApplication,
}: PermitRenewalFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("how-it-works");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  // Water use report state
  const [waterUseReportData, setWaterUseReportData] = useState<any>({
    reportingYear: new Date().getFullYear() - 1,
    operationalStatus: "",
    actualUsageVolume: "",
    usageUnit: "m³/year",
    waterQualityStatus: "",
    complianceNotes: "",
  });
  
  // Attachment state
  const [renewalLetter, setRenewalLetter] = useState<File | null>(null);
  const [existingRenewalLetterUrl, setExistingRenewalLetterUrl] = useState<string | null>(null);
  const renewalLetterInputRef = useRef<HTMLInputElement>(null);
  
  // Tab validation state
  const [tabsCompleted, setTabsCompleted] = useState({
    "how-it-works": true, // Always completed (informational)
    "water-use-report": false,
    attachments: false,
    payment: false,
  });

  // Check if water use report is complete
  useEffect(() => {
    const isReportComplete = 
      waterUseReportData.operationalStatus &&
      waterUseReportData.actualUsageVolume;
    
    setTabsCompleted(prev => ({
      ...prev,
      "water-use-report": isReportComplete,
    }));
  }, [waterUseReportData]);

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
    const tabs = ["how-it-works", "water-use-report", "attachments", "payment"];
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const tabs = ["how-it-works", "water-use-report", "attachments", "payment"];
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
      applicationType: 'renewal',
      
      // Water use report data
      waterUseReport: waterUseReportData,
      
      // Renewal letter file
      renewalLetter,
      
      // Permit holder info (read-only reference)
      permitHolder: getPermitHolderName(),
      projectTitle: permit.application?.project_title,
      
      // Location (read-only reference)
      province: permit.application?.province,
      district: permit.application?.district,
      sector: permit.application?.sector,
      cell: permit.application?.cell,
    };
  }, [permit, waterUseReportData, renewalLetter]);

  const handleSaveDraft = async () => {
    try {
      setIsSaving(true);
      setSaveError(null);
      const formData = buildFormData();
      await onSaveAsDraft(formData, 'draft');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save draft');
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

      {/* Main Form Tabs */}
      <Card>
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-4">
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
              <TabsTrigger 
                value="payment" 
                className="flex items-center gap-1 text-xs"
                disabled={!canProceedToPayment}
              >
                <CreditCard className="h-4 w-4" />
                <span className="hidden sm:inline">Payment</span>
              </TabsTrigger>
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

                    {/* Required Documents */}
                    <div className="space-y-3">
                      <h3 className="font-semibold text-gray-900">Required Documents</h3>
                      <ul className="space-y-2">
                        <li className="flex items-center gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          Letter requesting permit renewal (PDF or image)
                        </li>
                        <li className="flex items-center gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          Water use report for the permit period
                        </li>
                        <li className="flex items-center gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          IremboPay payment of {RENEWAL_FEE.toLocaleString()} RWF
                        </li>
                      </ul>
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

                {/* Navigation */}
                <div className="flex justify-end">
                  <Button onClick={handleNext} className="bg-green-600 hover:bg-green-700 gap-2">
                    Continue to Water Use Report
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: Water Use Report */}
            <TabsContent value="water-use-report" className="mt-6">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Annual Water Use Report
                    </CardTitle>
                    <CardDescription>
                      Provide information about your water usage during the permit period. 
                      This report helps track compliance and informs the renewal decision.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Reporting Year */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="reportingYear">Reporting Year *</Label>
                        <Input
                          id="reportingYear"
                          type="number"
                          min={2020}
                          max={new Date().getFullYear()}
                          value={waterUseReportData.reportingYear}
                          onChange={(e) =>
                            setWaterUseReportData((prev: any) => ({
                              ...prev,
                              reportingYear: parseInt(e.target.value) || new Date().getFullYear() - 1,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="operationalStatus">Operational Status *</Label>
                        <select
                          id="operationalStatus"
                          className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                          value={waterUseReportData.operationalStatus}
                          onChange={(e) =>
                            setWaterUseReportData((prev: any) => ({
                              ...prev,
                              operationalStatus: e.target.value,
                            }))
                          }
                        >
                          <option value="">Select status...</option>
                          <option value="fully_operational">Fully Operational</option>
                          <option value="partially_operational">Partially Operational</option>
                          <option value="temporarily_suspended">Temporarily Suspended</option>
                          <option value="not_operational">Not Operational</option>
                        </select>
                      </div>
                    </div>

                    {/* Actual Usage */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="actualUsageVolume">Actual Water Usage Volume *</Label>
                        <Input
                          id="actualUsageVolume"
                          type="number"
                          placeholder="e.g., 50000"
                          value={waterUseReportData.actualUsageVolume}
                          onChange={(e) =>
                            setWaterUseReportData((prev: any) => ({
                              ...prev,
                              actualUsageVolume: e.target.value,
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Total water volume used during the reporting year
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="usageUnit">Usage Unit</Label>
                        <select
                          id="usageUnit"
                          className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                          value={waterUseReportData.usageUnit}
                          onChange={(e) =>
                            setWaterUseReportData((prev: any) => ({
                              ...prev,
                              usageUnit: e.target.value,
                            }))
                          }
                        >
                          <option value="m³/year">m³/year (Cubic meters per year)</option>
                          <option value="m³/day">m³/day (Cubic meters per day)</option>
                          <option value="liters/day">Liters/day</option>
                        </select>
                      </div>
                    </div>

                    {/* Comparison with permitted */}
                    <div className="p-4 bg-slate-50 rounded-lg border">
                      <h4 className="font-medium mb-3">Usage Comparison</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Permitted Allowance:</span>
                          <p className="font-semibold">{permit.water_allowance?.toLocaleString() || "N/A"} {permit.allowance_unit}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Reported Usage:</span>
                          <p className="font-semibold">
                            {waterUseReportData.actualUsageVolume 
                              ? `${parseFloat(waterUseReportData.actualUsageVolume).toLocaleString()} ${waterUseReportData.usageUnit}`
                              : "Not entered"
                            }
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Water Quality */}
                    <div className="space-y-2">
                      <Label htmlFor="waterQualityStatus">Water Quality Status</Label>
                      <select
                        id="waterQualityStatus"
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                        value={waterUseReportData.waterQualityStatus}
                        onChange={(e) =>
                          setWaterUseReportData((prev: any) => ({
                            ...prev,
                            waterQualityStatus: e.target.value,
                          }))
                        }
                      >
                        <option value="">Select quality status...</option>
                        <option value="good">Good - Meets all standards</option>
                        <option value="acceptable">Acceptable - Minor issues</option>
                        <option value="needs_improvement">Needs Improvement</option>
                        <option value="not_tested">Not Tested</option>
                      </select>
                    </div>

                    {/* Compliance Notes */}
                    <div className="space-y-2">
                      <Label htmlFor="complianceNotes">Additional Notes / Compliance Information</Label>
                      <Textarea
                        id="complianceNotes"
                        placeholder="Provide any additional information about your water usage, challenges faced, or compliance measures taken..."
                        rows={4}
                        value={waterUseReportData.complianceNotes}
                        onChange={(e) =>
                          setWaterUseReportData((prev: any) => ({
                            ...prev,
                            complianceNotes: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Navigation */}
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
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Save Draft
                    </Button>
                    <Button 
                      onClick={handleNext} 
                      className="bg-green-600 hover:bg-green-700 gap-2"
                      disabled={!tabsCompleted["water-use-report"]}
                    >
                      Continue to Attachments
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleRemoveFile}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
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
                        <input
                          ref={renewalLetterInputRef}
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={handleFileChange}
                        />
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

                {/* Navigation */}
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
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Save Draft
                    </Button>
                    <Button 
                      onClick={handleNext} 
                      className="bg-green-600 hover:bg-green-700 gap-2"
                      disabled={!tabsCompleted.attachments}
                    >
                      Continue to Payment
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 4: Payment */}
            <TabsContent value="payment" className="mt-6">
              <div className="space-y-6">
                {!canProceedToPayment ? (
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
                
                {/* Back button if payment tab has issues */}
                {!canProceedToPayment && (
                  <div className="flex justify-start">
                    <Button variant="outline" onClick={handleBack} className="gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Back to Attachments
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
});

export default PermitRenewalForm;
