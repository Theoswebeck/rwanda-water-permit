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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  CheckSquare,
  ClipboardList,
} from "lucide-react";
import { PaymentTab } from "@/components/dashboard/payment-tab";
import { PaymentConfirmationPanel } from "@/components/payments/payment-confirmation-panel";
import { WaterUseReportForm } from "@/components/dashboard/water-use-report-form";
import type { PermitWithApplication } from "@/components/dashboard/permit-select-for-renewal";
import type { Application, WaterUseReportTemplate, WaterUseReport } from "@/types/database";
import { supabase } from "@/lib/supabase";
import { getDocumentUrl } from "@/lib/supabase-storage";
import { getApplicationFee } from "@/lib/payment-utils";
import {
  getProvinces,
  getDistricts,
  getSectors,
  getCells,
  getVillages,
} from "@/lib/rwanda-administrative-data";

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
  isStaffView?: boolean;
}

const formatDate = (dateString?: string) => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const RENEWAL_FEE = getApplicationFee();

const WATER_SOURCE_OPTIONS = [
  { value: "lake", label: "Lake" },
  { value: "dam", label: "Dam" },
  { value: "spring", label: "Spring" },
  { value: "borehole", label: "Borehole" },
  { value: "stream_river", label: "Stream/River" },
  { value: "other", label: "Other" },
];

const WATER_PURPOSE_OPTIONS = [
  { value: "domestic", label: "Domestic" },
  { value: "irrigation", label: "Irrigation" },
  { value: "industrial", label: "Industrial" },
  { value: "hydropower", label: "Hydropower" },
  { value: "mining", label: "Mining" },
  { value: "construction", label: "Construction" },
  { value: "recreation", label: "Recreation" },
  { value: "fisheries", label: "Fisheries" },
  { value: "other", label: "Other" },
];

const INTENDED_ACTIVITY_OPTIONS = [
  { value: "water_supply", label: "Water Supply" },
  { value: "irrigation", label: "Irrigation" },
  { value: "fish_farming_lakes", label: "Fish Farming (Lakes)" },
  { value: "fish_farming_ponds", label: "Fish Farming (Ponds)" },
  { value: "recreation_activities", label: "Recreation Activities" },
  { value: "industrial_use", label: "Industrial Use" },
  { value: "hydropower_generation", label: "Hydropower Generation" },
  { value: "mining_operations", label: "Mining Operations" },
  { value: "construction_of_infrastructures", label: "Construction of Infrastructures" },
  { value: "other", label: "Other" },
];

const ABSTRACTION_METHOD_OPTIONS = [
  { value: "pumping", label: "Pumping" },
  { value: "gravity", label: "Gravity" },
  { value: "diversion_channel", label: "Diversion Channel" },
  { value: "dam_reservoir", label: "Dam/Reservoir" },
  { value: "borehole", label: "Borehole" },
  { value: "spring_capture", label: "Spring Capture" },
  { value: "hand_dug_well", label: "Hand Dug Well" },
  { value: "other", label: "Other" },
];

const ALLOWANCE_UNIT_OPTIONS = [
  { value: "m³/year", label: "m³/year" },
  { value: "m³/day", label: "m³/day" },
  { value: "m³/month", label: "m³/month" },
  { value: "l/s", label: "l/s" },
];

const CONCESSION_ACTIVITIES = ["fish_farming_lakes", "recreation_activities"];

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
  const [activeTab, setActiveTab] = useState("overview");
  const hasMountedRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tabValidationError, setTabValidationError] = useState<string | null>(null);
  const [draftSavedMessage, setDraftSavedMessage] = useState<string | null>(null);

  const isManualPermit = permit.id?.startsWith("manual-");

  // ── Permit detail state ──
  const [permitProvince, setPermitProvince] = useState("");
  const [permitDistrict, setPermitDistrict] = useState("");
  const [permitSector, setPermitSector] = useState("");
  const [permitCell, setPermitCell] = useState("");
  const [permitVillage, setPermitVillage] = useState("");
  const [waterSourceType, setWaterSourceType] = useState("");
  const [waterSourceName, setWaterSourceName] = useState("");
  const [waterPurpose, setWaterPurpose] = useState("");
  const [intendedActivity, setIntendedActivity] = useState("");
  const [waterAllowance, setWaterAllowance] = useState("");
  const [allowanceUnit, setAllowanceUnit] = useState("m³/year");
  const [maxDailyVolume, setMaxDailyVolume] = useState("");
  const [maxYearlyVolume, setMaxYearlyVolume] = useState("");
  const [abstractionMethod, setAbstractionMethod] = useState("");
  const [flowRate, setFlowRate] = useState("");
  const [waterSourceLatitude, setWaterSourceLatitude] = useState("");
  const [waterSourceLongitude, setWaterSourceLongitude] = useState("");
  const [concessionArea, setConcessionArea] = useState("");

  const isConcessionActivity = CONCESSION_ACTIVITIES.includes(intendedActivity);

  // Initialize permit details from permit object (system permits) or currentApplication (editing draft)
  const hasInitializedPermitDetails = useRef(false);
  useEffect(() => {
    if (hasInitializedPermitDetails.current) return;
    hasInitializedPermitDetails.current = true;

    // Priority 1: Restore from currentApplication + internal_notes (draft/staff view)
    if (currentApplication) {
      let notes: any = null;
      try {
        notes = typeof currentApplication.internal_notes === "string"
          ? JSON.parse(currentApplication.internal_notes)
          : currentApplication.internal_notes;
      } catch { /* ignore */ }

      const pd = notes?.permitDetails;
      if (pd) {
        setPermitProvince(pd.province || currentApplication.province || "");
        setPermitDistrict(pd.district || currentApplication.district || "");
        setPermitSector(pd.sector || currentApplication.sector || "");
        setPermitCell(pd.cell || currentApplication.cell || "");
        setPermitVillage(pd.village || currentApplication.village || "");
        setWaterSourceType(pd.waterSourceType || currentApplication.water_source || "");
        setWaterSourceName(pd.waterSourceName || currentApplication.water_body_name || "");
        setWaterPurpose(pd.waterPurpose || currentApplication.water_purpose || "");
        setIntendedActivity(pd.intendedActivity || (currentApplication.intended_activities as string[] | undefined)?.[0] || "");
        setWaterAllowance(pd.waterAllowance?.toString() || "");
        setAllowanceUnit(pd.allowanceUnit || "m³/year");
        setMaxDailyVolume(pd.maxDailyVolume?.toString() || "");
        setMaxYearlyVolume(pd.maxYearlyVolume?.toString() || "");
        setAbstractionMethod(pd.abstractionMethod || currentApplication.water_taking_method || "");
        setFlowRate(pd.flowRate?.toString() || currentApplication.flow_rate_m3_per_second?.toString() || "");
        setWaterSourceLatitude(pd.waterSourceLatitude || "");
        setWaterSourceLongitude(pd.waterSourceLongitude || "");
        setConcessionArea(pd.concessionArea?.toString() || "");
        return;
      }

      // Fallback: restore from application fields directly
      setPermitProvince(currentApplication.province || "");
      setPermitDistrict(currentApplication.district || "");
      setPermitSector(currentApplication.sector || "");
      setPermitCell(currentApplication.cell || "");
      setPermitVillage(currentApplication.village || "");
      setWaterSourceType(currentApplication.water_source || "");
      setWaterSourceName(currentApplication.water_body_name || "");
      setWaterPurpose(currentApplication.water_purpose || "");
      setIntendedActivity((currentApplication.intended_activities as string[] | undefined)?.[0] || "");
      setAbstractionMethod(currentApplication.water_taking_method || "");
      setFlowRate(currentApplication.flow_rate_m3_per_second?.toString() || "");
      return;
    }

    // Priority 2: Fill from permit object (system permits)
    if (!isManualPermit) {
      const app = permit.application;
      let appNotes: any = null;
      try {
        appNotes = typeof app?.internal_notes === "string"
          ? JSON.parse(app.internal_notes)
          : app?.internal_notes;
      } catch {
        appNotes = null;
      }
      const permitDetails = appNotes?.permitDetails;
      const sourceProvince =
        appNotes?.waterSourceProvince ||
        permitDetails?.waterSourceProvince ||
        permitDetails?.province ||
        app?.province ||
        "";
      const sourceDistrict =
        appNotes?.waterSourceDistrict ||
        permitDetails?.waterSourceDistrict ||
        permitDetails?.district ||
        app?.district ||
        "";
      const sourceSector =
        appNotes?.waterSourceSector ||
        permitDetails?.waterSourceSector ||
        permitDetails?.sector ||
        app?.sector ||
        "";
      const sourceCell =
        appNotes?.waterSourceCell ||
        permitDetails?.waterSourceCell ||
        permitDetails?.cell ||
        app?.cell ||
        "";
      const sourceVillage =
        appNotes?.waterSourceVillage ||
        permitDetails?.waterSourceVillage ||
        permitDetails?.village ||
        app?.village ||
        "";
      const primaryIntendedActivity = (
        (Array.isArray(app?.intended_activities) ? app.intended_activities : [])
          .find((activity): activity is string => typeof activity === "string" && activity.trim().length > 0)
      ) || "";

      setPermitProvince(sourceProvince);
      setPermitDistrict(sourceDistrict);
      setPermitSector(sourceSector);
      setPermitCell(sourceCell);
      setPermitVillage(sourceVillage);
      setWaterSourceType(permit.water_source || "");
      setWaterSourceName(app?.water_body_name || "");
      setWaterPurpose(primaryIntendedActivity || app?.water_purpose || permit.purpose || "");
      setIntendedActivity(primaryIntendedActivity);
      setWaterAllowance(permit.water_allowance?.toString() || "");
      setAllowanceUnit(permit.allowance_unit || "m³/year");
      setMaxDailyVolume(app?.max_daily_volume_m3?.toString() || "");
      setMaxYearlyVolume(app?.max_yearly_volume_m3?.toString() || "");
      setAbstractionMethod(app?.water_taking_method || "");
      setFlowRate(app?.flow_rate_m3_per_second?.toString() || "");

      // Try to get coordinates from internal_notes
      setWaterSourceLatitude(appNotes?.waterSourceLatitude || "");
      setWaterSourceLongitude(appNotes?.waterSourceLongitude || "");
      setConcessionArea(app?.concession_area?.toString() || "");
    }
  }, [permit, currentApplication, isManualPermit]);

  // Cascading location data
  const provinces = useMemo(() => getProvinces(), []);
  const districts = useMemo(() => (permitProvince ? getDistricts(permitProvince) : []), [permitProvince]);
  const sectors = useMemo(() => (permitProvince && permitDistrict ? getSectors(permitProvince, permitDistrict) : []), [permitProvince, permitDistrict]);
  const cells = useMemo(() => (permitProvince && permitDistrict && permitSector ? getCells(permitProvince, permitDistrict, permitSector) : []), [permitProvince, permitDistrict, permitSector]);
  const villages = useMemo(() => (permitProvince && permitDistrict && permitSector && permitCell ? getVillages(permitProvince, permitDistrict, permitSector, permitCell) : []), [permitProvince, permitDistrict, permitSector, permitCell]);

  // Water use report state
  const [waterUseReportData, setWaterUseReportData] = useState<any>(null);
  const [waterUseReportSubmitted, setWaterUseReportSubmitted] = useState(false);
  const [existingWaterUseReport, setExistingWaterUseReport] = useState<WaterUseReport | null>(null);

  const waterUseTemplate: WaterUseReportTemplate = useMemo(() => {
    const act = intendedActivity || (permit.application?.intended_activities as string[] | undefined)?.[0] || "";
    if (act === "fish_farming_lakes" || act === "aquaculture") return "concession";
    return "abstraction";
  }, [intendedActivity, permit.application?.intended_activities]);
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
          .from("documents")
          .select("file_path")
          .eq("application_id", currentApplication.id)
          .eq("type", "renewal_request_letter")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (byTypeError) console.error("❌ Error loading renewal letter by type:", byTypeError);
        if (byType?.file_path) {
          setExistingRenewalLetterUrl(getDocumentUrl(byType.file_path));
          return;
        }

        const { data: byPath, error: byPathError } = await supabase
          .from("documents")
          .select("file_path")
          .eq("application_id", currentApplication.id)
          .ilike("file_path", `%applications/${currentApplication.id}/renewalRequestLetter-%`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (byPathError) console.error("❌ Error loading renewal letter by file path:", byPathError);
        setExistingRenewalLetterUrl(getDocumentUrl(byPath?.file_path || null));
      } catch (err) {
        console.error("❌ Failed to load existing renewal letter:", err);
        setExistingRenewalLetterUrl(null);
      }
    };
    loadExistingRenewalLetter();
  }, [currentApplication?.id]);

  // ── Tab validation ──
  const permitDetailsComplete = useMemo(() => {
    if (!isManualPermit) return true;
    return !!(waterSourceType && waterPurpose && permitDistrict);
  }, [isManualPermit, waterSourceType, waterPurpose, permitDistrict]);

  const [tabsCompleted, setTabsCompleted] = useState({
    overview: true,
    "permit-details": false,
    "water-use-report": false,
    attachments: false,
    payment: false,
  });

  useEffect(() => {
    setTabsCompleted((prev) => ({ ...prev, "permit-details": permitDetailsComplete }));
  }, [permitDetailsComplete]);

  useEffect(() => {
    setTabsCompleted((prev) => ({ ...prev, "water-use-report": waterUseReportSubmitted }));
  }, [waterUseReportSubmitted]);

  useEffect(() => {
    const hasRenewalLetter = renewalLetter !== null || existingRenewalLetterUrl !== null;
    setTabsCompleted((prev) => ({ ...prev, attachments: hasRenewalLetter }));
  }, [renewalLetter, existingRenewalLetterUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
      if (!allowedTypes.includes(file.type)) {
        alert("Please upload a PDF or image file (JPEG, PNG)");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert("File size must be less than 10MB");
        return;
      }
      setRenewalLetter(file);
    }
  };

  const handleRemoveFile = () => {
    setRenewalLetter(null);
    if (renewalLetterInputRef.current) renewalLetterInputRef.current.value = "";
  };

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  const TAB_ORDER = ["overview", "permit-details", "water-use-report", "attachments", "payment"];
  const TAB_LABELS: Record<string, string> = {
    overview: "Overview",
    "permit-details": "Permit Details",
    "water-use-report": "Water Use Report",
    attachments: "Attachments",
    payment: "Payment",
  };

  const canProceedToPayment =
    tabsCompleted["permit-details"] &&
    tabsCompleted["water-use-report"] &&
    tabsCompleted.attachments;

  const getTabProgressError = useCallback((tabId: string): string | null => {
    if (tabId === "permit-details" && !tabsCompleted["permit-details"]) {
      return "Complete all required Permit Details fields before moving to Water Use Report.";
    }
    if (tabId === "water-use-report" && !waterUseReportSubmitted) {
      return "Complete and submit the Water Use Report before moving to Attachments.";
    }
    if (tabId === "attachments" && !tabsCompleted.attachments) {
      return "Upload the required renewal request letter before moving to Payment.";
    }
    return null;
  }, [tabsCompleted, waterUseReportSubmitted]);

  const attemptTabChange = useCallback((targetTab: string) => {
    if (readOnly || isStaffView) {
      setActiveTab(targetTab);
      return true;
    }

    const currentIndex = TAB_ORDER.indexOf(activeTab);
    const targetIndex = TAB_ORDER.indexOf(targetTab);
    if (currentIndex === -1 || targetIndex === -1) return false;

    if (targetIndex <= currentIndex) {
      setTabValidationError(null);
      setActiveTab(targetTab);
      return true;
    }

    if (targetIndex !== currentIndex + 1) {
      setTabValidationError(`Complete ${TAB_LABELS[activeTab]} before moving to the next tab.`);
      return false;
    }

    const progressError = getTabProgressError(TAB_ORDER[currentIndex]);
    if (progressError) {
      setTabValidationError(progressError);
      return false;
    }

    if (targetTab === "payment" && !canProceedToPayment) {
      setTabValidationError(
        "Complete Permit Details, Water Use Report, and Attachments before opening Payment.",
      );
      return false;
    }

    setTabValidationError(null);
    setActiveTab(targetTab);
    return true;
  }, [
    TAB_LABELS,
    TAB_ORDER,
    activeTab,
    canProceedToPayment,
    getTabProgressError,
    isStaffView,
    readOnly,
  ]);

  const handleTabChange = useCallback((value: string) => {
    attemptTabChange(value);
  }, [attemptTabChange]);

  const handleNext = () => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx < TAB_ORDER.length - 1) {
      attemptTabChange(TAB_ORDER[idx + 1]);
    }
  };

  const handleBack = () => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx > 0) {
      setTabValidationError(null);
      setActiveTab(TAB_ORDER[idx - 1]);
    }
  };

  const getPermitHolderName = () => {
    const applicant = permit.application?.applicant;
    if (!applicant) return userData?.company_name || `${userData?.first_name || ""} ${userData?.last_name || ""}`.trim() || "Unknown";
    if (applicant.company_name) return applicant.company_name;
    return `${applicant.first_name || ""} ${applicant.last_name || ""}`.trim() || "Unknown";
  };

  const getDaysUntilExpiry = () => {
    if (!permit.expiry_date) return null;
    const expiry = new Date(permit.expiry_date);
    const today = new Date();
    return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const daysUntilExpiry = getDaysUntilExpiry();

  // ── Enriched permit for WaterUseReportForm ──
  const enrichedPermit = useMemo(() => {
    if (!isManualPermit) return permit;
    return {
      ...permit,
      water_source: waterSourceType || permit.water_source,
      purpose: waterPurpose || permit.purpose,
      water_allowance: waterAllowance ? parseFloat(waterAllowance) : permit.water_allowance,
      allowance_unit: allowanceUnit || permit.allowance_unit,
      application: {
        ...permit.application,
        province: permitProvince || permit.application?.province,
        district: permitDistrict || permit.application?.district,
        sector: permitSector || permit.application?.sector,
        cell: permitCell || permit.application?.cell,
        village: permitVillage || permit.application?.village,
        water_body_name: waterSourceName || permit.application?.water_body_name,
        intended_activities: intendedActivity ? [intendedActivity] : permit.application?.intended_activities,
        flow_rate_m3_per_second: flowRate ? parseFloat(flowRate) : permit.application?.flow_rate_m3_per_second,
        water_taking_method: abstractionMethod || permit.application?.water_taking_method,
        max_daily_volume_m3: maxDailyVolume ? parseFloat(maxDailyVolume) : permit.application?.max_daily_volume_m3,
        max_yearly_volume_m3: maxYearlyVolume ? parseFloat(maxYearlyVolume) : permit.application?.max_yearly_volume_m3,
        concession_area: concessionArea ? parseFloat(concessionArea) : permit.application?.concession_area,
      },
    };
  }, [
    isManualPermit, permit,
    waterSourceType, waterPurpose, waterAllowance, allowanceUnit,
    permitProvince, permitDistrict, permitSector, permitCell, permitVillage,
    waterSourceName, intendedActivity, flowRate, abstractionMethod,
    maxDailyVolume, maxYearlyVolume, concessionArea,
  ]);

  // ── Build form data ──
  const buildFormData = useCallback(() => {
    return {
      permitId: permit.id,
      permitNumber: permit.permit_number,
      originalApplicationId: permit.application_id,
      originalApplicationType: permit.application?.application_type,
      applicationType: "renewal",
      isRenewal: true,
      renewed_from_permit_id: permit.id,

      waterUseReport: waterUseReportData,
      waterUseReportId: existingWaterUseReport?.id,

      renewalLetter,

      permitHolder: getPermitHolderName(),
      projectTitle: permit.application?.project_title,
      waterSource: waterSourceType || permit.water_source,
      waterPurpose: waterPurpose || permit.purpose,
      intendedActivities: intendedActivity ? [intendedActivity] : permit.application?.intended_activities,

      province: permitProvince || permit.application?.province,
      district: permitDistrict || permit.application?.district,
      sector: permitSector || permit.application?.sector,
      cell: permitCell || permit.application?.cell,
      village: permitVillage || permit.application?.village,

      permitDetails: {
        province: permitProvince,
        district: permitDistrict,
        sector: permitSector,
        cell: permitCell,
        village: permitVillage,
        waterSourceType,
        waterSourceName,
        waterPurpose,
        intendedActivity,
        waterAllowance: waterAllowance ? parseFloat(waterAllowance) : null,
        allowanceUnit,
        maxDailyVolume: maxDailyVolume ? parseFloat(maxDailyVolume) : null,
        maxYearlyVolume: maxYearlyVolume ? parseFloat(maxYearlyVolume) : null,
        abstractionMethod,
        flowRate: flowRate ? parseFloat(flowRate) : null,
        waterSourceLatitude,
        waterSourceLongitude,
        concessionArea: concessionArea ? parseFloat(concessionArea) : null,
      },
    };
  }, [
    permit, waterUseReportData, renewalLetter, existingWaterUseReport?.id,
    permitProvince, permitDistrict, permitSector, permitCell, permitVillage,
    waterSourceType, waterSourceName, waterPurpose, intendedActivity,
    waterAllowance, allowanceUnit, maxDailyVolume, maxYearlyVolume,
    abstractionMethod, flowRate, waterSourceLatitude, waterSourceLongitude,
    concessionArea,
  ]);

  // ── Load existing water use report ──
  useEffect(() => {
    const loadExistingWaterUseReport = async () => {
      if (!permit?.id) {
        setExistingWaterUseReport(null);
        setWaterUseReportData(null);
        setWaterUseReportSubmitted(false);
        return;
      }
      if (!readOnly && !currentApplication?.id) {
        setExistingWaterUseReport(null);
        setWaterUseReportData(null);
        setWaterUseReportSubmitted(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("water_use_reports")
          .select("*")
          .eq("permit_id", permit.id)
          .eq("reporting_year", reportYear)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          console.error("❌ Error loading renewal water use report:", error);
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
          const hasReportData = !!(data.section3 || data.section4 || data.section5_monitoring || data.section6_employment || data.section7 || data.section8 || data.section9_declaration);
          setWaterUseReportSubmitted(data.status === "submitted" || hasReportData);
        }
      } catch (err) {
        console.error("❌ Failed to load renewal water use report:", err);
      }
    };
    loadExistingWaterUseReport();
  }, [permit?.id, reportYear, currentApplication?.id, readOnly]);

  const persistWaterUseReport = useCallback(
    async (reportData: any, nextStatus: "draft" | "submitted") => {
      const applicantId = userData?.id || permit.application?.applicant?.id || currentApplication?.applicant_id;
      if (!applicantId) throw new Error("Missing applicant information for water use report");

      const payload = {
        permit_id: permit.id,
        application_id: permit.application_id,
        applicant_id: applicantId,
        reporting_year: reportData?.reportingYear || reportYear,
        template: waterUseTemplate,
        status: existingWaterUseReport?.status === "submitted" ? "submitted" : nextStatus,
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
          existingWaterUseReport?.status === "submitted" || nextStatus === "submitted"
            ? existingWaterUseReport?.submitted_at || new Date().toISOString()
            : null,
        updated_at: new Date().toISOString(),
      } as const;

      if (existingWaterUseReport?.id) {
        const { data, error } = await supabase
          .from("water_use_reports")
          .update(payload)
          .eq("id", existingWaterUseReport.id)
          .select("*")
          .single();
        if (error) { console.error("❌ Failed to update water use report:", error); throw error; }
        console.log("✅ Water use report updated:", data?.id);
        setExistingWaterUseReport(data as WaterUseReport);
        return data as WaterUseReport;
      }

      const { data: insertedData, error: insertError } = await supabase
        .from("water_use_reports")
        .insert(payload)
        .select("*")
        .single();

      if (!insertError) {
        console.log("✅ Water use report inserted:", insertedData?.id);
        setExistingWaterUseReport(insertedData as WaterUseReport);
        return insertedData as WaterUseReport;
      }

      // Self-hosted client does not support `.upsert()`. If a unique conflict occurs,
      // update the existing report identified by permit + reporting year.
      const insertErrorMessage = insertError instanceof Error
        ? insertError.message
        : String((insertError as { message?: unknown } | null)?.message || "");
      const isUniqueConflict =
        insertErrorMessage.includes("duplicate key value") ||
        insertErrorMessage.includes("water_use_reports_unique_permit_year");

      if (!isUniqueConflict) {
        console.error("❌ Failed to insert water use report:", insertError);
        throw insertError;
      }

      const { data: conflictedData, error: conflictUpdateError } = await supabase
        .from("water_use_reports")
        .update(payload)
        .eq("permit_id", payload.permit_id)
        .eq("reporting_year", payload.reporting_year)
        .select("*")
        .single();

      if (conflictUpdateError) {
        console.error("❌ Failed to update conflicted water use report:", conflictUpdateError);
        throw conflictUpdateError;
      }

      console.log("✅ Water use report updated after unique conflict:", conflictedData?.id);
      setExistingWaterUseReport(conflictedData as WaterUseReport);
      return conflictedData as WaterUseReport;
    },
    [userData?.id, permit.id, permit.application_id, permit.application?.applicant?.id, currentApplication?.applicant_id, reportYear, waterUseTemplate, existingWaterUseReport?.id, existingWaterUseReport?.status, existingWaterUseReport?.submitted_at],
  );

  const handleSaveDraft = async (waterUseReportOverride?: any) => {
    try {
      setIsSaving(true);
      setSaveError(null);
      setDraftSavedMessage(null);
      const formData = {
        ...buildFormData(),
        ...(waterUseReportOverride !== undefined ? { waterUseReport: waterUseReportOverride } : {}),
      };
      console.log("📤 handleSaveDraft: calling onSaveAsDraft (renewal application)…");
      await onSaveAsDraft(formData, "draft");
      console.log("✅ handleSaveDraft: renewal application saved — redirecting to dashboard");
      router.push("/dashboard?tab=applications");
    } catch (err) {
      console.error("❌ handleSaveDraft: failed to save renewal draft:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setIsSaving(false);
    }
  };

  const handleContinueToPayment = async () => {
    if (readOnly) return;
    if (!tabsCompleted.attachments) {
      setTabValidationError("Upload the required renewal request letter before continuing to payment.");
      return;
    }
    if (!waterUseReportSubmitted) {
      setTabValidationError("Complete and submit the Water Use Report before continuing to payment.");
      return;
    }

    try {
      setIsSaving(true);
      setSaveError(null);
      await onSaveAsDraft(buildFormData(), "draft");
      setTabValidationError(null);
      setActiveTab("payment");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to prepare renewal application for payment");
    } finally {
      setIsSaving(false);
    }
  };

  // Editable only for manual permits in non-read-only mode
  const detailsEditable = isManualPermit && !readOnly;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      {/* Header Card */}
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
                <Badge className={daysUntilExpiry < 0 ? "bg-red-100 text-red-800" : daysUntilExpiry <= 30 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}>
                  <Clock className="h-3 w-3 mr-1" />
                  {daysUntilExpiry < 0 ? `Expired ${Math.abs(daysUntilExpiry)} days ago` : `Expires in ${daysUntilExpiry} days`}
                </Badge>
              )}
              <Badge className="bg-blue-100 text-blue-800">Fee: {RENEWAL_FEE.toLocaleString()} RWF</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {saveError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}
      {tabValidationError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{tabValidationError}</AlertDescription>
        </Alert>
      )}
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
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview" className="flex items-center gap-1 text-xs">
                <Info className="h-4 w-4" />
                <span className="hidden sm:inline">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="permit-details" className="flex items-center gap-1 text-xs">
                <ClipboardList className="h-4 w-4" />
                <span className="hidden sm:inline">Permit Details</span>
                {tabsCompleted["permit-details"] && <CheckCircle className="h-3 w-3 text-green-600 ml-1" />}
              </TabsTrigger>
              <TabsTrigger value="water-use-report" className="flex items-center gap-1 text-xs">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Water Use Report</span>
                {tabsCompleted["water-use-report"] && <CheckCircle className="h-3 w-3 text-green-600 ml-1" />}
              </TabsTrigger>
              <TabsTrigger value="attachments" className="flex items-center gap-1 text-xs">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Attachments</span>
                {tabsCompleted.attachments && <CheckCircle className="h-3 w-3 text-green-600 ml-1" />}
              </TabsTrigger>
              <TabsTrigger value="payment" className="flex items-center gap-1 text-xs" disabled={!isStaffView && !canProceedToPayment}>
                <CreditCard className="h-4 w-4" />
                <span className="hidden sm:inline">Payment</span>
              </TabsTrigger>
            </TabsList>

            {/* ═══════════════ TAB 1: Overview ═══════════════ */}
            <TabsContent value="overview" className="mt-6">
              <div className="space-y-6">
                <Card className="border-blue-200 bg-blue-50/30">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-800">
                      <Info className="h-5 w-5" />
                      Welcome to the Permit Renewal Process
                    </CardTitle>
                    <CardDescription>Here&apos;s what you need to know about renewing your water use permit</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <h3 className="font-semibold text-gray-900">Renewal Steps</h3>
                      <div className="grid gap-4">
                        {[
                          { step: 1, title: "Enter Permit Details", description: "Confirm or enter your permit details including location, water source, and abstraction information.", icon: ClipboardList },
                          { step: 2, title: "Submit Water Use Report", description: "Provide details about your water usage during the permit period.", icon: BarChart3 },
                          { step: 3, title: "Upload Renewal Request Letter", description: "Submit a formal letter requesting the renewal of your water use permit.", icon: FileText },
                          { step: 4, title: "Pay Renewal Fee", description: `Pay the renewal fee of ${RENEWAL_FEE.toLocaleString()} RWF through IremboPay.`, icon: CreditCard },
                          { step: 5, title: "Application Review", description: "Your renewal application will go through the standard review process.", icon: CheckSquare },
                        ].map((item) => (
                          <div key={item.step} className="flex gap-4 p-4 bg-white rounded-lg border">
                            <div className="flex-shrink-0">
                              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                <item.icon className="h-5 w-5 text-green-600" />
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">Step {item.step}</Badge>
                                <h4 className="font-medium">{item.title}</h4>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <h3 className="font-semibold text-gray-900">Important Notes</h3>
                      <div className="space-y-2">
                        {!isManualPermit && (
                          <Alert className="border-amber-200 bg-amber-50">
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                            <AlertDescription className="text-amber-800">
                              <strong>No Changes to Permit Details:</strong> Renewal extends the validity period only. All existing permit details (water source, usage volumes, location) will remain unchanged.
                            </AlertDescription>
                          </Alert>
                        )}
                        {isManualPermit && (
                          <Alert className="border-indigo-200 bg-indigo-50">
                            <Info className="h-4 w-4 text-indigo-600" />
                            <AlertDescription className="text-indigo-800">
                              <strong>Manual Permit:</strong> This permit is not linked in the system. Please enter all permit details in the next tab. Staff will verify against registry records.
                            </AlertDescription>
                          </Alert>
                        )}
                        <Alert className="border-green-200 bg-green-50">
                          <Info className="h-4 w-4 text-green-600" />
                          <AlertDescription className="text-green-800">
                            <strong>Validity Period:</strong> Upon approval, your permit will be renewed for another 5 years from the renewal approval date.
                          </AlertDescription>
                        </Alert>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {!readOnly && (
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving} className="gap-2">
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                      Save as Draft
                    </Button>
                    <Button onClick={handleNext} className="bg-green-600 hover:bg-green-700 gap-2">
                      Continue to Permit Details
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ═══════════════ TAB 2: Permit Details ═══════════════ */}
            <TabsContent value="permit-details" className="mt-6">
              <div className="space-y-6">
                {isManualPermit && !readOnly && (
                  <Alert className="border-indigo-200 bg-indigo-50">
                    <ClipboardList className="h-4 w-4 text-indigo-700" />
                    <AlertDescription className="text-indigo-800">
                      Enter all permit details below. These will be used for the water use report and staff review.
                    </AlertDescription>
                  </Alert>
                )}
                {!isManualPermit && (
                  <Alert className="border-blue-200 bg-blue-50">
                    <Info className="h-4 w-4 text-blue-700" />
                    <AlertDescription className="text-blue-800">
                      These details are pre-filled from the selected permit and cannot be modified.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Location */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MapPin className="h-5 w-5" />
                      Location
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Province *</Label>
                        {detailsEditable ? (
                          <Select value={permitProvince} onValueChange={(v) => { setPermitProvince(v); setPermitDistrict(""); setPermitSector(""); setPermitCell(""); setPermitVillage(""); }}>
                            <SelectTrigger><SelectValue placeholder="Select province" /></SelectTrigger>
                            <SelectContent>{provinces.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Input value={permitProvince || "N/A"} disabled className="bg-gray-100" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>District *</Label>
                        {detailsEditable ? (
                          <Select value={permitDistrict} onValueChange={(v) => { setPermitDistrict(v); setPermitSector(""); setPermitCell(""); setPermitVillage(""); }} disabled={!permitProvince}>
                            <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                            <SelectContent>{districts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Input value={permitDistrict || "N/A"} disabled className="bg-gray-100" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Sector</Label>
                        {detailsEditable ? (
                          <Select value={permitSector} onValueChange={(v) => { setPermitSector(v); setPermitCell(""); setPermitVillage(""); }} disabled={!permitDistrict}>
                            <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                            <SelectContent>{sectors.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Input value={permitSector || "N/A"} disabled className="bg-gray-100" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Cell</Label>
                        {detailsEditable ? (
                          <Select value={permitCell} onValueChange={(v) => { setPermitCell(v); setPermitVillage(""); }} disabled={!permitSector}>
                            <SelectTrigger><SelectValue placeholder="Select cell" /></SelectTrigger>
                            <SelectContent>{cells.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Input value={permitCell || "N/A"} disabled className="bg-gray-100" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Village</Label>
                        {detailsEditable ? (
                          <Select value={permitVillage} onValueChange={setPermitVillage} disabled={!permitCell}>
                            <SelectTrigger><SelectValue placeholder="Select village" /></SelectTrigger>
                            <SelectContent>{villages.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Input value={permitVillage || "N/A"} disabled className="bg-gray-100" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Water Source & Purpose */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Droplet className="h-5 w-5" />
                      Water Source &amp; Purpose
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Water Source Type *</Label>
                        {detailsEditable ? (
                          <Select value={waterSourceType} onValueChange={setWaterSourceType}>
                            <SelectTrigger><SelectValue placeholder="Select water source" /></SelectTrigger>
                            <SelectContent>{WATER_SOURCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Input value={waterSourceType ? WATER_SOURCE_OPTIONS.find((o) => o.value === waterSourceType)?.label || waterSourceType : "N/A"} disabled className="bg-gray-100" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Name of Water Body</Label>
                        <Input value={waterSourceName} onChange={(e) => setWaterSourceName(e.target.value)} disabled={!detailsEditable} className={!detailsEditable ? "bg-gray-100" : ""} placeholder="e.g. Lake Kivu" />
                      </div>
                      <div className="space-y-2">
                        <Label>Water Purpose *</Label>
                        {detailsEditable ? (
                          <Select value={waterPurpose} onValueChange={setWaterPurpose}>
                            <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
                            <SelectContent>{WATER_PURPOSE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Input value={waterPurpose ? WATER_PURPOSE_OPTIONS.find((o) => o.value === waterPurpose)?.label || waterPurpose : "N/A"} disabled className="bg-gray-100" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Intended Activity</Label>
                        {detailsEditable ? (
                          <Select value={intendedActivity} onValueChange={setIntendedActivity}>
                            <SelectTrigger><SelectValue placeholder="Select activity" /></SelectTrigger>
                            <SelectContent>{INTENDED_ACTIVITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Input value={intendedActivity ? INTENDED_ACTIVITY_OPTIONS.find((o) => o.value === intendedActivity)?.label || intendedActivity : "N/A"} disabled className="bg-gray-100" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Volume & Allowance */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 className="h-5 w-5" />
                      Volume &amp; Allowance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Water Allowance</Label>
                        <Input type="number" value={waterAllowance} onChange={(e) => setWaterAllowance(e.target.value)} disabled={!detailsEditable} className={!detailsEditable ? "bg-gray-100" : ""} placeholder="e.g. 2446" />
                      </div>
                      <div className="space-y-2">
                        <Label>Allowance Unit</Label>
                        {detailsEditable ? (
                          <Select value={allowanceUnit} onValueChange={setAllowanceUnit}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{ALLOWANCE_UNIT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Input value={allowanceUnit || "N/A"} disabled className="bg-gray-100" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Max Daily Volume (m³/day)</Label>
                        <Input type="number" value={maxDailyVolume} onChange={(e) => setMaxDailyVolume(e.target.value)} disabled={!detailsEditable} className={!detailsEditable ? "bg-gray-100" : ""} placeholder="e.g. 6.7" />
                      </div>
                      <div className="space-y-2">
                        <Label>Max Yearly Volume (m³/year)</Label>
                        <Input type="number" value={maxYearlyVolume} onChange={(e) => setMaxYearlyVolume(e.target.value)} disabled={!detailsEditable} className={!detailsEditable ? "bg-gray-100" : ""} placeholder="e.g. 2446" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Abstraction Details (non-concession) */}
                {!isConcessionActivity && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Droplet className="h-5 w-5" />
                        Abstraction Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Method of Abstraction</Label>
                          {detailsEditable ? (
                            <Select value={abstractionMethod} onValueChange={setAbstractionMethod}>
                              <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                              <SelectContent>{ABSTRACTION_METHOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : (
                            <Input value={abstractionMethod ? ABSTRACTION_METHOD_OPTIONS.find((o) => o.value === abstractionMethod)?.label || abstractionMethod : "N/A"} disabled className="bg-gray-100" />
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Flow Rate (m³/s)</Label>
                          <Input type="number" step="0.001" value={flowRate} onChange={(e) => setFlowRate(e.target.value)} disabled={!detailsEditable} className={!detailsEditable ? "bg-gray-100" : ""} placeholder="e.g. 0.005" />
                        </div>
                        <div className="space-y-2">
                          <Label>Water Source Latitude</Label>
                          <Input value={waterSourceLatitude} onChange={(e) => setWaterSourceLatitude(e.target.value)} disabled={!detailsEditable} className={!detailsEditable ? "bg-gray-100" : ""} placeholder="e.g. -1.9403" />
                        </div>
                        <div className="space-y-2">
                          <Label>Water Source Longitude</Label>
                          <Input value={waterSourceLongitude} onChange={(e) => setWaterSourceLongitude(e.target.value)} disabled={!detailsEditable} className={!detailsEditable ? "bg-gray-100" : ""} placeholder="e.g. 29.8739" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Concession Details */}
                {isConcessionActivity && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <MapPin className="h-5 w-5" />
                        Concession Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Concession Area (hectares)</Label>
                          <Input type="number" step="0.01" value={concessionArea} onChange={(e) => setConcessionArea(e.target.value)} disabled={!detailsEditable} className={!detailsEditable ? "bg-gray-100" : ""} placeholder="e.g. 5.0" />
                        </div>
                        <div className="space-y-2">
                          <Label>Latitude (reference point)</Label>
                          <Input value={waterSourceLatitude} onChange={(e) => setWaterSourceLatitude(e.target.value)} disabled={!detailsEditable} className={!detailsEditable ? "bg-gray-100" : ""} placeholder="e.g. -1.9403" />
                        </div>
                        <div className="space-y-2">
                          <Label>Longitude (reference point)</Label>
                          <Input value={waterSourceLongitude} onChange={(e) => setWaterSourceLongitude(e.target.value)} disabled={!detailsEditable} className={!detailsEditable ? "bg-gray-100" : ""} placeholder="e.g. 29.8739" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Navigation */}
                {!readOnly && (
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={handleBack} className="gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Back to Overview
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving} className="gap-2">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                        Save as Draft
                      </Button>
                      <Button onClick={handleNext} className="bg-green-600 hover:bg-green-700 gap-2" disabled={!permitDetailsComplete}>
                        Continue to Water Use Report
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ═══════════════ TAB 3: Water Use Report ═══════════════ */}
            <TabsContent value="water-use-report" className="mt-6">
              <div className="space-y-6">
                <WaterUseReportForm
                  permit={enrichedPermit as any}
                  template={waterUseTemplate}
                  reportingYear={reportYear}
                  existingReport={existingWaterUseReport}
                  onSaveAsDraft={async (data) => {
                    if (readOnly) return;
                    setSaveError(null);
                    try {
                      await persistWaterUseReport(data, "draft");
                      setWaterUseReportData(data);
                      console.log("✅ Water use report draft saved");
                      await handleSaveDraft(data);
                    } catch (err) {
                      console.error("❌ Failed to save draft (WUR + renewal app):", err);
                      setSaveError(err instanceof Error ? err.message : "Failed to save draft");
                      throw err;
                    }
                  }}
                  onSubmit={async (data) => {
                    if (readOnly) return;
                    setSaveError(null);
                    try {
                      await persistWaterUseReport(data, "draft");
                      setWaterUseReportData(data);
                      setWaterUseReportSubmitted(true);
                      console.log("✅ Water use report submitted (renewal flow)");
                      setActiveTab("attachments");
                    } catch (err) {
                      console.error("❌ Failed to submit water use report:", err);
                      setSaveError(err instanceof Error ? err.message : "Failed to save water use report");
                      throw err;
                    }
                  }}
                  isLoading={isSaving}
                  isReadOnly={readOnly}
                />

                {!readOnly && (
                  <div className="flex justify-between pt-4 border-t">
                    <Button variant="outline" onClick={handleBack} className="gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Back to Permit Details
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving} className="gap-2">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                        Save as Draft
                      </Button>
                      {waterUseReportSubmitted && (
                        <Button onClick={handleNext} className="bg-green-600 hover:bg-green-700 gap-2">
                          Continue to Attachments
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ═══════════════ TAB 4: Attachments ═══════════════ */}
            <TabsContent value="attachments" className="mt-6">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Required Attachments
                    </CardTitle>
                    <CardDescription>Upload the required documents for your renewal application.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-base font-semibold">Letter Requesting Renewal *</Label>
                        <p className="text-sm text-muted-foreground mt-1">Upload a formal letter requesting the renewal of your water use permit.</p>
                      </div>
                      <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${renewalLetter || existingRenewalLetterUrl ? "border-green-300 bg-green-50" : "border-gray-300 hover:border-gray-400"}`}>
                        {renewalLetter ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-center gap-2 text-green-600">
                              <CheckCircle className="h-8 w-8" />
                              <span className="font-medium">File Selected</span>
                            </div>
                            <div className="flex items-center justify-center gap-2 text-sm">
                              <FileText className="h-4 w-4" />
                              <span className="font-medium">{renewalLetter.name}</span>
                              <span className="text-muted-foreground">({(renewalLetter.size / 1024).toFixed(1)} KB)</span>
                            </div>
                            {!readOnly && (
                              <Button variant="outline" size="sm" onClick={handleRemoveFile} className="text-red-600 hover:text-red-700">
                                <X className="h-4 w-4 mr-1" />Remove
                              </Button>
                            )}
                          </div>
                        ) : existingRenewalLetterUrl ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-center gap-2 text-green-600">
                              <CheckCircle className="h-8 w-8" />
                              <span className="font-medium">Document Uploaded</span>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => window.open(existingRenewalLetterUrl, "_blank")}>
                              <Eye className="h-4 w-4 mr-1" />View Document
                            </Button>
                            {!readOnly && (
                              <div className="pt-2">
                                <Button variant="ghost" size="sm" onClick={() => renewalLetterInputRef.current?.click()}>
                                  <Upload className="h-4 w-4 mr-1" />Replace Document
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : readOnly ? (
                          <div className="space-y-3">
                            <FileText className="h-12 w-12 mx-auto text-gray-400" />
                            <p className="text-sm text-muted-foreground">No renewal letter uploaded</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <Upload className="h-12 w-12 mx-auto text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-700">Click to upload or drag and drop</p>
                              <p className="text-sm text-muted-foreground">PDF, JPEG, or PNG (max 10MB)</p>
                            </div>
                            <Button variant="outline" onClick={() => renewalLetterInputRef.current?.click()}>
                              <FileUp className="h-4 w-4 mr-2" />Select File
                            </Button>
                          </div>
                        )}
                        {!readOnly && (
                          <input ref={renewalLetterInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} />
                        )}
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-4">
                      <div>
                        <Label className="text-base font-semibold">Existing Permit Documents</Label>
                        <p className="text-sm text-muted-foreground mt-1">These are the documents from your original application. They are preserved and cannot be modified during renewal.</p>
                      </div>
                      <Alert className="border-slate-200 bg-slate-50">
                        <Info className="h-4 w-4" />
                        <AlertDescription>All existing documents from your original permit application will be retained.</AlertDescription>
                      </Alert>
                    </div>
                  </CardContent>
                </Card>

                {!readOnly && (
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={handleBack} className="gap-2">
                      <ArrowLeft className="h-4 w-4" />Back
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving} className="gap-2">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                        Save as Draft
                      </Button>
                      <Button onClick={handleContinueToPayment} className="bg-green-600 hover:bg-green-700 gap-2" disabled={!tabsCompleted.attachments || isSaving}>
                        Continue to Payment
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ═══════════════ TAB 5: Payment ═══════════════ */}
            <TabsContent value="payment" className="mt-6">
              <div className="space-y-6">
                {isStaffView ? (
                  <PaymentConfirmationPanel
                    applicationId={currentApplication?.id ?? ""}
                    applicationStatus={(currentApplication as any)?.status}
                    applicationNumber={(currentApplication as any)?.application_number}
                    applicantName={getPermitHolderName()}
                    applicantEmail={userData?.email}
                    applicantPhone={userData?.phone}
                  />
                ) : readOnly ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />Payment Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
                          <span className="font-medium">Renewal Fee</span>
                          <span className="text-lg font-bold text-green-600">{RENEWAL_FEE.toLocaleString()} RWF</span>
                        </div>
                        {currentApplication?.payment_status === "paid" ? (
                          <Alert className="border-green-200 bg-green-50">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-800">Payment has been completed for this renewal application.</AlertDescription>
                          </Alert>
                        ) : (
                          <Alert className="border-amber-200 bg-amber-50">
                            <Clock className="h-4 w-4 text-amber-600" />
                            <AlertDescription className="text-amber-800">Payment is pending for this renewal application.</AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : !canProceedToPayment ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Cannot Proceed to Payment</AlertTitle>
                    <AlertDescription>Please complete the Permit Details, Water Use Report, and upload the required Renewal Letter before proceeding to payment.</AlertDescription>
                  </Alert>
                ) : (
                  <PaymentTab
                    application={currentApplication as Application}
                    formData={{ emailAddress: userData?.email, telephoneContact: userData?.phone, fullNameApplicant: getPermitHolderName(), ...buildFormData() }}
                    onBack={handleBack}
                    isSavingApplication={isSaving}
                    saveError={saveError}
                    onRetrySave={handleSaveDraft}
                  />
                )}
                {!readOnly && !isStaffView && !canProceedToPayment && (
                  <div className="flex justify-start">
                    <Button variant="outline" onClick={handleBack} className="gap-2">
                      <ArrowLeft className="h-4 w-4" />Back to Attachments
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
