"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle 
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { MapPin, Upload, X, FileText, Check, AlertCircle, XCircle, CheckCircle, Droplet, Building, Zap, Mountain, Save, Send, User, Globe, Factory } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { 
  getFormattedProvinceOptions,
  getFormattedDistrictOptions,
  getFormattedSectorOptions,
  getFormattedCellOptions,
  getFormattedVillageOptions
} from '@/lib/rwanda-administrative-data';

import { BulkNetworksTable, emptyBulkRow } from "@/components/dashboard/bulk-networks-table";
import type { BulkNetworkRow } from "@/types/database";

// Form schema based on NEW_WATER_PERMIT_APPLICATION_FORM.md structure
const formSchema = z.object({
  // SECTION 1: IDENTIFICATION AND ADDRESS OF THE APPLICANT
  fullNameApplicant: z.string().min(2, { message: "Full name of applicant is required" }),
  categoryApplicant: z.enum(["individual", "company", "cooperative", "organization", "institution", "other"], {
    required_error: "Please select applicant category"
  }),
  categoryApplicantOther: z.string().optional(),
  nameRepresentative: z.string().optional(), // For Company, Cooperative, Organization, Institution
  identificationDoc: z.any().optional(), // For Individual: copy of ID/Passport, For Company: registration certificate
  
  // Office Address (Province, District, Sector, Cell, Village)
  officeProvince: z.string().min(1, { message: "Office province is required" }),
  officeDistrict: z.string().min(1, { message: "Office district is required" }),
  officeSector: z.string().min(1, { message: "Office sector is required" }),
  officeCell: z.string().min(1, { message: "Office cell is required" }),
  officeVillage: z.string().optional(),
  
  // Contact Information
  telephoneContact: z.string().min(10, { message: "Telephone contact is required" }),
  emailAddress: z.string().email({ message: "Valid email address is required" }),
  
  // SECTION 2: SOURCE OF WATER
  waterSourceType: z.enum(["lake", "dam", "spring", "borehole", "stream_river", "other"], {
    required_error: "Please select a water source type"
  }),
  waterSourceOther: z.string().optional(), // If "Other" is selected
  nameSourceWater: z.string().min(1, { message: "Name of water source is required" }),
  tributaryToMain: z.string().optional(), // Tributary to (main river/lake)
  
  // Location of water source (Province, District, Sector, Cell, Village)
  waterSourceProvince: z.string().min(1, { message: "Water source province is required" }),
  waterSourceDistrict: z.string().min(1, { message: "Water source district is required" }),
  waterSourceSector: z.string().min(1, { message: "Water source sector is required" }),
  waterSourceCell: z.string().min(1, { message: "Water source cell is required" }),
  waterSourceVillage: z.string().optional(),
  
  // Coordinates of water source
  waterSourceLatitude: z.string().min(1, { message: "Water source latitude is required" }),
  waterSourceLongitude: z.string().min(1, { message: "Water source longitude is required" }),
  
  // Reliability of water source
  waterReliability: z.enum(["water_always_available", "frequently_dry", "dry_during_certain_season"], {
    required_error: "Please select water reliability"
  }),
  
  // SECTION 3: INTENDED ACTIVITY
  // Activity Types (multiple selection possible)
  intendedActivities: z.array(z.enum([
    "irrigation", "construction_of_dam", "aquaculture", "mining", "industry",
    "water_supply", "coffee_washing", "electricity_generation",
    "recreation_activities", "construction_of_infrastructures", "other"
  ])).min(1, { message: "Please select at least one intended activity" }),
  intendedActivityOther: z.string().optional(), // If "Other" is selected
  
  // Water Abstraction Table
  waterAbstractionDetails: z.array(z.object({
    activity: z.string().min(1, { message: "Activity is required" }),
    flowRate: z.string().optional(), // Flow rate (m³/s or m³/day)
    flowRateUnit: z.enum(["m3_per_second", "m3_per_day"]).optional(),
    maxAverageYearly: z.coerce.number().optional(), // Maximum average yearly (m³/year)
    abstractionMethod: z.string().optional(), // Method of water abstraction
  })).min(1, { message: "At least one water abstraction detail is required" }),
  
  // Water Concession (for Aquaculture)
  concessionArea: z.coerce.number().optional(), // Total area (m² or ha)
  concessionAreaUnit: z.enum(["m2", "ha"]).optional(),
  permitPeriod: z.string().optional(), // Period for which permit is required
  
  // SECTION 4: OWNERSHIP OF ADJOINING LAND
  ownsAllLand: z.boolean({ required_error: "Please specify if you own all required land" }),
  hasLandAccess: z.boolean().optional(), // If ownsAllLand is false
  landAccessDocuments: z.any().optional(), // Easement/consent/lease documents
  
  // SECTION 5: PAYMENT INFORMATION
  paymentProof: z.any({ required_error: "Payment proof is required for submission" }),
  
  // ANNEXES - Activity-specific additional information
  // Note: Fill only the annex corresponding to the intended use of water
  
  // ANNEX A: Irrigation
  annexA_irrigationDetails: z.string().optional(),
  
  // ANNEX B: Water Supply  
  annexB_waterSupplyDetails: z.string().optional(),
  
  // ANNEX C: Aquaculture
  annexC_aquacultureDetails: z.string().optional(),
  
  // ANNEX D: Coffee Washing
  annexD_coffeeWashingDetails: z.string().optional(),
  
  // ANNEX E: Industries
  annexE_industryDetails: z.string().optional(),
  
  // ANNEX F: Electricity Generation
  annexF_electricityDetails: z.string().optional(),
  
  // ANNEX G: Mining
  annexG_miningDetails: z.string().optional(),
  
  // ANNEX H: Construction of infrastructures
  annexH_constructionDetails: z.string().optional(),
  
  // ANNEX I: Navigation
  annexI_navigationDetails: z.string().optional(),
  
  // ANNEX J: Recreation activities
  annexJ_recreationDetails: z.string().optional(),
  
  // ANNEX K: Other activities
  annexK_otherDetails: z.string().optional(),
  
  // Additional documents based on activity
  technicalDrawings: z.any().optional(),
  environmentalImpactDoc: z.any().optional(),
  feasibilityStudy: z.any().optional(),
  
  // CERTIFICATION SECTION
  certificationAgreement: z.boolean().refine((value) => value === true, {
    message: "You must certify that the information provided is true and accurate.",
  }),
}).superRefine((values, ctx) => {
  const requiresRepresentative = values.categoryApplicant === "organization";

  if (requiresRepresentative && !values.nameRepresentative?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["nameRepresentative"],
      message: "Organization representative name is required",
    });
  }
});

// Draft schema - all fields optional for saving drafts
const draftSchema = z.object({
  // Make all form schema fields optional for drafts
  fullNameApplicant: z.string().optional(),
  categoryApplicant: z.string().optional(),
  categoryApplicantOther: z.string().optional(),
  nameRepresentative: z.string().optional(),
  identificationDoc: z.any().optional(),
  
  // Office Address
  officeProvince: z.string().optional(),
  officeDistrict: z.string().optional(),
  officeSector: z.string().optional(),
  officeCell: z.string().optional(),
  officeVillage: z.string().optional(),
  
  // Contact Information
  telephoneContact: z.string().optional(),
  emailAddress: z.string().optional(),
  
  // SECTION 2: SOURCE OF WATER
  waterSourceType: z.string().optional(),
  waterSourceOther: z.string().optional(),
  nameSourceWater: z.string().optional(),
  tributaryToMain: z.string().optional(),
  
  // Location of water source
  waterSourceProvince: z.string().optional(),
  waterSourceDistrict: z.string().optional(),
  waterSourceSector: z.string().optional(),
  waterSourceCell: z.string().optional(),
  waterSourceVillage: z.string().optional(),
  
  // Coordinates of water source
  waterSourceLatitude: z.string().optional(),
  waterSourceLongitude: z.string().optional(),
  
  // Reliability of water source
  waterReliability: z.string().optional(),
  
  // SECTION 3: INTENDED ACTIVITY
  intendedActivities: z.array(z.string()).optional(),
  intendedActivityOther: z.string().optional(),
  
  // Water abstraction details
  waterAbstractionDetails: z.array(z.object({
    activity: z.string(),
    flowRate: z.string().optional(),
    flowRateUnit: z.string().optional(),
    maxAverageYearly: z.coerce.number().optional(),
    abstractionMethod: z.string().optional(),
  })).optional(),
  
  // Water concession
  concessionArea: z.coerce.number().optional(),
  concessionAreaUnit: z.string().optional(),
  permitPeriod: z.string().optional(),
  
  // SECTION 4: OWNERSHIP OF ADJOINING LAND
  ownsAllLand: z.boolean().optional(),
  hasLandAccess: z.boolean().optional(),
  landAccessDocuments: z.any().optional(),
  
  // SECTION 5: PAYMENT INFORMATION
  paymentProof: z.any().optional(),
  
  // ANNEXES
  annexA_irrigationDetails: z.string().optional(),
  annexB_waterSupplyDetails: z.string().optional(),
  annexC_aquacultureDetails: z.string().optional(),
  annexD_coffeeWashingDetails: z.string().optional(),
  annexE_industryDetails: z.string().optional(),
  annexF_electricityDetails: z.string().optional(),
  annexG_miningDetails: z.string().optional(),
  annexH_constructionDetails: z.string().optional(),
  annexI_navigationDetails: z.string().optional(),
  annexJ_recreationDetails: z.string().optional(),
  annexK_otherDetails: z.string().optional(),
  
  // Additional documents
  technicalDrawings: z.any().optional(),
  environmentalImpactDoc: z.any().optional(),
  feasibilityStudy: z.any().optional(),
  
  // CERTIFICATION SECTION
  certificationAgreement: z.boolean().optional(),
});

type FormValues = z.infer<typeof formSchema>;
type DraftFormValues = z.infer<typeof draftSchema>;

interface UserData {
  email: string;
  name: string;
  phone: string;
  address: string;
  idNumber?: string;
  account_type?: 'individual' | 'company' | 'cooperative' | 'organization' | 'institution';
  company_tin?: string;
  id_number?: string;
}

interface ApplicationFormProps {
  userData: UserData;
  onSubmit: (data: FormValues, status: 'submitted') => void | Promise<void>;
  onSaveAsDraft: (data: FormValues, status: 'draft', isAutoSave?: boolean) => void | Promise<void>;
  isLoading: boolean;
  initialData?: Partial<FormValues>;
  mode?: 'create' | 'edit';
  isBulkApplicant?: boolean;
  currentApplication?: any;
  initialDocuments?: any[];
}

export function ApplicationForm({
  userData,
  onSubmit,
  onSaveAsDraft,
  isLoading,
  initialData,
  mode = 'create',
  isBulkApplicant = false,
  currentApplication,
  initialDocuments,
}: ApplicationFormProps) {
  const [activeTab, setActiveTab] = useState("personal");
  const [bulkNetworks, setBulkNetworks] = useState<BulkNetworkRow[]>(() => {
    const saved = (initialData as any)?.bulk_networks;
    if (Array.isArray(saved) && saved.length > 0) return saved;
    if (!isBulkApplicant) return [];
    return Array.from({ length: 5 }, (_, i) => emptyBulkRow(i + 1));
  });
  const [bulkDistrict, setBulkDistrict] = useState<string>(
    (initialData as any)?.bulk_district ?? ""
  );
  // Profile may load after mount — seed default rows when flag becomes true
  useEffect(() => {
    if (isBulkApplicant && bulkNetworks.length === 0) {
      setBulkNetworks(Array.from({ length: 5 }, (_, i) => emptyBulkRow(i + 1)));
    }
  }, [isBulkApplicant]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasMountedRef = useRef(false);
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedPurpose, setSelectedPurpose] = useState("");
  const [selectedWaterTaking, setSelectedWaterTaking] = useState("");
  const [validationError, setValidationError] = useState<{
    show: boolean;
    message: string;
    missingFields: string[];
    tab: string;
  } | null>(null);
  const [files, setFiles] = useState<Record<string, File | null>>({
    paymentProof: null,
    identificationDoc: null,
    landOwnershipDoc: null,
    technicalDrawings: null,
    environmentalImpactDoc: null,
    intakeDischargeMap: null,
  });
  
  const fileInputRefs = {
    paymentProof: useRef<HTMLInputElement>(null),
    identificationDoc: useRef<HTMLInputElement>(null),
    landOwnershipDoc: useRef<HTMLInputElement>(null),
    technicalDrawings: useRef<HTMLInputElement>(null),
    environmentalImpactDoc: useRef<HTMLInputElement>(null),
    intakeDischargeMap: useRef<HTMLInputElement>(null),
  };
  
  // Initialize form with default values based on new schema structure
  const defaultValues = {
    // SECTION 1: IDENTIFICATION AND ADDRESS OF THE APPLICANT
    fullNameApplicant: userData?.name || "",
    categoryApplicant: userData?.account_type || "",
    categoryApplicantOther: "",
    nameRepresentative: "",
    identificationDoc: undefined,
    
    // Office Address
    officeProvince: "",
    officeDistrict: "",
    officeSector: "",
    officeCell: "",
    officeVillage: "",
    
    // Contact Information
    telephoneContact: userData?.phone || "",
    emailAddress: userData?.email || "",
    
    // SECTION 2: SOURCE OF WATER
    waterSourceType: "",
    waterSourceOther: "",
    nameSourceWater: "",
    tributaryToMain: "",
    
    // Location of water source
    waterSourceProvince: "",
    waterSourceDistrict: "",
    waterSourceSector: "",
    waterSourceCell: "",
    waterSourceVillage: "",
    
    // Coordinates of water source
    waterSourceLatitude: "",
    waterSourceLongitude: "",
    
    // Reliability of water source
    waterReliability: "",
    
    // SECTION 3: INTENDED ACTIVITY
    intendedActivities: [],
    intendedActivityOther: "",
    
    // Water abstraction details
    waterAbstractionDetails: [{
      activity: "",
      flowRate: "",
      flowRateUnit: "",
      maxAverageYearly: undefined,
      abstractionMethod: "",
    }],
    
    // Water concession
    concessionArea: undefined,
    concessionAreaUnit: "",
    permitPeriod: "",
    
    // SECTION 4: OWNERSHIP OF ADJOINING LAND
    ownsAllLand: false,
    hasLandAccess: false,
    landAccessDocuments: undefined,
    
    // SECTION 5: PAYMENT INFORMATION
    paymentProof: undefined,
    
    // ANNEXES - Activity-specific details
    annexA_irrigationDetails: "",
    annexB_waterSupplyDetails: "",
    annexC_aquacultureDetails: "",
    annexD_coffeeWashingDetails: "",
    annexE_industryDetails: "",
    annexF_electricityDetails: "",
    annexG_miningDetails: "",
    annexH_constructionDetails: "",
    annexI_navigationDetails: "",
    annexJ_recreationDetails: "",
    annexK_otherDetails: "",
    
    // Additional documents
    technicalDrawings: undefined,
    environmentalImpactDoc: undefined,
    feasibilityStudy: undefined,
    
    // CERTIFICATION SECTION
    certificationAgreement: false,
  };

  // Merge with initial data if editing
  const mergedDefaultValues = initialData ? { ...defaultValues, ...initialData } : defaultValues;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: mergedDefaultValues,
    // Preserve values for conditionally rendered activity fields across tab navigation.
    shouldUnregister: false,
  });

  // Watch for activity changes to show/hide conditional fields
  const watchedIntendedActivities = form.watch("intendedActivities");
  const watchedWaterSourceType = form.watch("waterSourceType");
  const watchedWaterSourceDistrict = form.watch("waterSourceDistrict");
  const watchedWaterSourceProvince = form.watch("waterSourceProvince");

  // Auto-save state
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Auto-save functionality - runs every 30 seconds
  useEffect(() => {
    const autoSaveInterval = setInterval(async () => {
      try {
        setAutoSaveStatus('saving');
        
        // Get current form values without validation
        const currentValues = form.getValues();
        
        // Validate with draft schema (relaxed validation)
        const validatedData = draftSchema.parse(currentValues);
        
        // Add files to the form data
        const formData = {
          ...validatedData,
          ...files,
        };
        
        // Save as draft (auto-save)
        await onSaveAsDraft(
          isBulkApplicant ? { ...formData, bulk_networks: bulkNetworks, bulk_district: bulkDistrict } as any : formData as any,
          'draft',
          true
        );

        setLastAutoSave(new Date());
        setAutoSaveStatus('saved');

        // Reset status after 2 seconds
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      } catch (error) {
        console.error('Auto-save failed:', error);
        setAutoSaveStatus('error');
        setTimeout(() => setAutoSaveStatus('idle'), 3000);
      }
    }, 30000); // 30 seconds

    // Cleanup interval on unmount
    return () => clearInterval(autoSaveInterval);
  }, [form, files, onSaveAsDraft]);

  // Manual auto-save trigger (can be called immediately)
  const triggerAutoSave = async () => {
    try {
      setAutoSaveStatus('saving');
      
      const currentValues = form.getValues();
      const validatedData = draftSchema.parse(currentValues);
      
      const formData = {
        ...validatedData,
        ...files,
      };
      
      await onSaveAsDraft(
        isBulkApplicant ? { ...formData, bulk_networks: bulkNetworks, bulk_district: bulkDistrict } as any : formData as any,
        'draft',
        true
      );

      setLastAutoSave(new Date());
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Manual auto-save failed:', error);
      setAutoSaveStatus('error');
      setTimeout(() => setAutoSaveStatus('idle'), 3000);
    }
  };

  // Initialize state with initial data on mount and reset form when data changes
  useEffect(() => {
    if (initialData) {
      console.log('🔄 ApplicationForm - Initializing with data:', {
        waterSourceProvince: initialData.waterSourceProvince,
        waterSourceDistrict: initialData.waterSourceDistrict,
        waterSourceSector: initialData.waterSourceSector,
        waterSourceCell: initialData.waterSourceCell
      });
      
      // Reset form with new data
      const mergedData = { ...defaultValues, ...initialData };
      form.reset(mergedData);
      
      // Update state variables
      if (initialData.waterSourceProvince) setSelectedProvince(initialData.waterSourceProvince);
      if (initialData.waterSourceDistrict) setSelectedDistrict(initialData.waterSourceDistrict);
      if (initialData.intendedActivities) setSelectedPurpose(initialData.intendedActivities.join(','));
      if (initialData.waterSourceType) setSelectedWaterTaking(initialData.waterSourceType);
      
      console.log('✅ Form reset with merged data:', mergedData);
      
      // Debug: Check form values after reset
      setTimeout(() => {
        const formValues = form.getValues();
        console.log('🔍 Form values after reset:', {
          waterSourceProvince: formValues.waterSourceProvince,
          waterSourceDistrict: formValues.waterSourceDistrict,
          waterSourceSector: formValues.waterSourceSector,
          waterSourceCell: formValues.waterSourceCell
        });
      }, 100);
    }
  }, [initialData, form]);

  useEffect(() => {
    setSelectedPurpose(watchedIntendedActivities?.join(',') || '');
  }, [watchedIntendedActivities]);

  useEffect(() => {
    setSelectedProvince(watchedWaterSourceProvince || '');
  }, [watchedWaterSourceProvince]);

  useEffect(() => {
    setSelectedWaterTaking(watchedWaterSourceType || '');
  }, [watchedWaterSourceType]);

  useEffect(() => {
    setSelectedDistrict(watchedWaterSourceDistrict || '');
  }, [watchedWaterSourceDistrict]);

  // Auto-dismiss error when user switches tabs (shows they're working on it)
  useEffect(() => {
    if (validationError?.show) {
      // Auto-dismiss after 10 seconds, or when user actively changes tabs
      const timer = setTimeout(() => {
        setValidationError(null);
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [activeTab, validationError?.show]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  // Helper function to check if industrial fields should be shown
  const shouldShowIndustryFields = () => {
    return selectedPurpose === "industrial";
  };

  // Helper function to check if electricity generation fields should be shown
  const shouldShowElectricityFields = () => {
    return selectedPurpose === "hydropower" || selectedPurpose === "electricity_generation";
  };

  // Helper function to check if mining fields should be shown
  const shouldShowMiningFields = () => {
    return selectedPurpose === "mining";
  };

  // Helper function to check if water flow diversion fields should be shown
  const shouldShowDiversionFields = () => {
    return selectedWaterTaking === "diversion" || selectedWaterTaking === "water_flow_diversion";
  };

  // Helper function to check if storage fields should be shown
  const shouldShowStorageFields = () => {
    return selectedWaterTaking === "pumping_system" || selectedWaterTaking === "dam" || selectedWaterTaking === "reservoir";
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileType: string) => {
    if (e.target.files && e.target.files[0]) {
      setFiles(prevFiles => ({
        ...prevFiles,
        [fileType]: e.target.files![0],
      }));
    }
  };
  
  const removeFile = (fileType: string) => {
    setFiles(prevFiles => ({
      ...prevFiles,
      [fileType]: null,
    }));
    
    // Reset the file input
    if (fileInputRefs[fileType as keyof typeof fileInputRefs].current) {
      fileInputRefs[fileType as keyof typeof fileInputRefs].current!.value = "";
    }
  };
  
  const handleFormSubmit = async (values: FormValues) => {
    try {
      // Clear any validation errors on successful submit
      setValidationError(null);
      
      // Add files to the form data
      const formData = {
        ...values,
        ...files,
      };
      
      // Await the async submit operation
      await onSubmit(
        isBulkApplicant ? { ...formData, bulk_networks: bulkNetworks, bulk_district: bulkDistrict } as any : formData,
        'submitted'
      );
    } catch (error) {
      console.error('❌ Error submitting application:', error);
    }
  };

  // Manual Save as Draft handler - bypasses strict validation, uses draft schema
  const handleSaveAsDraft = async () => {
    try {
      // Clear any validation errors
      setValidationError(null);
      
      // Get current form values without strict validation
      const currentValues = form.getValues();
      
      // Validate with draft schema (relaxed validation)
      const validatedData = draftSchema.parse(currentValues);
      
      // Add files to the form data
      const formData = {
        ...validatedData,
        ...files,
      };
      
      // Await the async save operation (manual save, will redirect)
      await onSaveAsDraft(
        isBulkApplicant ? { ...formData, bulk_networks: bulkNetworks, bulk_district: bulkDistrict } as any : formData as any,
        'draft',
        false
      );
    } catch (error) {
      console.error('❌ Error saving draft:', error);
      // You could show a toast notification or error message here
    }
  };

  // Helper function to get user-friendly field names
  const getFieldLabel = (fieldName: string): string => {
    const fieldLabels: Record<string, string> = {
      fullName: "Full Name",
      nameRepresentative: "Organization Representative Name",
      email: "Email Address",
      phone: "Phone Number",
      address: "Address",
      
      // Enhanced contact information
      poBox: "P.O. Box",
      mobilePhone: "Mobile Phone",
      landlinePhone: "Landline Phone",
      certificateNumber: "Certificate Number",
      certificateType: "Certificate Type",
      alternativeContactName: "Alternative Contact Name",
      alternativeContactIdNumber: "Alternative Contact ID Number",
      alternativeContactProvince: "Alternative Contact Province",
      alternativeContactDistrict: "Alternative Contact District",
      alternativeContactSector: "Alternative Contact Sector",
      alternativeContactCell: "Alternative Contact Cell",
      alternativeContactVillage: "Alternative Contact Village",
      alternativeContactMobilePhone: "Alternative Contact Mobile Phone",
      alternativeContactLandlinePhone: "Alternative Contact Landline Phone",
      alternativeContactEmail: "Alternative Contact Email",
      
      permitType: "Permit Type",
      applicantType: "Applicant Type",
      waterSource: "Water Source",
      purpose: "Purpose",
      waterUsage: "Water Usage Amount",
      waterUsageUnit: "Unit",
      
      // Water Source Details
      waterBodyName: "Water Body Name",
      tributaryTo: "Tributary Name",
      catchmentNameLevel1: "Catchment Name (Level 1)",
      catchmentNameLevel2: "Catchment Name (Level 2)",
      waterReliability: "Water Reliability",
      waterVolumeDischarge: "Natural Discharge Volume (m³)",
      
      // Water Usage Breakdown
      concessionArea: "Concession Area (hectares)",
      concessionAreaUnit: "Unit",
      maxDailyVolume: "Max Daily Volume (m³)",
      maxMonthlyVolume: "Max Monthly Volume (m³)",
      maxYearlyVolume: "Max Yearly Volume (m³)",
      flowRatePerSecond: "Flow Rate (m³/s)",
      abstractingFacilitiesType: "Abstraction Facilities Description",
      abstractingFacilitiesDimensions: "Abstraction Facilities Dimensions",
      systemCapacityPerSecond: "System Capacity (m³/s)",
      returnFlowLocation: "Return Flow Location",
      returnFlowVolume: "Return Flow Volume (m³)",
      proposedDurationMonths: "Proposed Duration (Months)",
      proposedDurationYears: "Proposed Duration (Years)",
      pumpingHoursPerDay: "Pumping Hours per Day",
      
      // Project Details
      facilityDescriptions: "Proposed Facilities Description",
      constructionType: "Construction Type",
      operationalOverview: "Operational Overview",
      methodOfWaterUse: "Method of Water Use",
      
      // Land Ownership Information
      ownsAllRequiredLand: "Owns All Required Land",
      landOwnershipStatus: "Land Ownership Status",
      hasRecordedEasement: "Easement Details",
      hasWrittenConsent: "Written Consent Details",
      hasLeaseAgreement: "Lease Agreement Details",
      affectedLandowners: "Affected Landowners",
      accessAcquisitionSteps: "Land Access Steps",
      
      province: "Province",
      district: "District",
      sector: "Sector",
      cell: "Cell",
      village: "Village",
      latitude: "Latitude",
      longitude: "Longitude",
      projectTitle: "Project Title",
      projectDescription: "Project Description",
      storageFacilities: "Storage Facilities",
      storageCapacity: "Storage Capacity",
      waterTakingMethod: "Water Taking Method",
      waterMeasuringMethod: "Water Measuring Method",
      returnFlowQuantity: "Return Flow Quantity",
      returnFlowQuality: "Return Flow Quality",
      potentialEffects: "Potential Environmental Effects",
      mitigationActions: "Mitigation Actions",
      concessionDuration: "Concession Duration",
      termsAccepted: "Terms and Conditions",
      industryType: "Industry Type",
      industryDetails: "Industry Details",
      powerGenerationType: "Power Generation Type",
      installedCapacity: "Installed Capacity",
      turbineType: "Turbine Type",
      headHeight: "Head Height",
      miningType: "Mining Type",
      miningMethod: "Mining Method",
      mineralType: "Mineral Type",
      miningArea: "Mining Area",
      intakeLocation: "Intake Location",
      intakeFlow: "Intake Flow",
      intakeLatitude: "Intake Latitude",
      intakeLongitude: "Intake Longitude",
      intakeElevation: "Intake Elevation",
      dischargeLocation: "Discharge Location",
      dischargeFlow: "Discharge Flow",
      dischargeLatitude: "Discharge Latitude",
      dischargeLongitude: "Discharge Longitude",
      dischargeElevation: "Discharge Elevation",
      streamLevelVariations: "Stream Level Variations",
      diversionStructureConfig: "Diversion Structure Configuration",
      pipeDetails: "Pipe Details",
      pumpCapacity: "Pump Capacity",
      valveDetails: "Valve Details",
      meterDetails: "Meter Details",
      backflowControlDevices: "Backflow Control Devices"
    };
    return fieldLabels[fieldName] || fieldName;
  };

  const handleFormError = (errors: any) => {
    // Find which tab has the first error and switch to it
    const errorFields = Object.keys(errors);
    
    if (errorFields.length > 0) {
      // Personal info fields
      const personalFields = ['fullName', 'nameRepresentative', 'email', 'phone', 'address'];
      // Permit details fields
      const detailsFields = ['permitType', 'applicantType', 'waterSource', 'purpose', 'waterUsage', 'waterUsageUnit', 'industryType', 'industryDetails', 'powerGenerationType', 'installedCapacity', 'turbineType', 'headHeight', 'miningType', 'miningMethod', 'mineralType', 'miningArea'];
      // Location fields  
      const locationFields = ['province', 'district', 'sector', 'cell', 'latitude', 'longitude'];
      // Project fields
      const projectFields = ['projectTitle', 'projectDescription'];
      // Technical fields
      const technicalFields = ['storageFacilities', 'storageCapacity', 'waterTakingMethod', 'waterMeasuringMethod', 'returnFlowQuantity', 'returnFlowQuality', 'potentialEffects', 'mitigationActions', 'concessionDuration', 'intakeLocation', 'intakeFlow', 'intakeLatitude', 'intakeLongitude', 'intakeElevation', 'dischargeLocation', 'dischargeFlow', 'dischargeLatitude', 'dischargeLongitude', 'dischargeElevation', 'streamLevelVariations', 'diversionStructureConfig', 'pipeDetails', 'pumpCapacity', 'valveDetails', 'meterDetails', 'backflowControlDevices'];
      // Document fields
      const documentFields = ['termsAccepted'];
      
      // Find errors in each tab
      const personalErrors = errorFields.filter(field => personalFields.includes(field));
      const detailsErrors = errorFields.filter(field => detailsFields.includes(field));
      const locationErrors = errorFields.filter(field => locationFields.includes(field));
      const projectErrors = errorFields.filter(field => projectFields.includes(field));
      const technicalErrors = errorFields.filter(field => technicalFields.includes(field));
      const documentErrors = errorFields.filter(field => documentFields.includes(field));
      
      let targetTab = 'personal';
      let tabName = 'Personal Info';
      let missingFields: string[] = [];
      
      // Determine which tab to show first (in order of form flow)
      if (personalErrors.length > 0) {
        targetTab = 'personal';
        tabName = 'Personal Info';
        missingFields = personalErrors.map(getFieldLabel);
      } else if (detailsErrors.length > 0) {
        targetTab = 'details';
        tabName = 'Permit Details';
        missingFields = detailsErrors.map(getFieldLabel);
      } else if (locationErrors.length > 0) {
        targetTab = 'location';
        tabName = 'Location';
        missingFields = locationErrors.map(getFieldLabel);
      } else if (projectErrors.length > 0) {
        targetTab = 'project';
        tabName = 'Project Info';
        missingFields = projectErrors.map(getFieldLabel);
      } else if (technicalErrors.length > 0) {
        targetTab = 'technical';
        tabName = 'Technical Details';
        missingFields = technicalErrors.map(getFieldLabel);
      } else if (documentErrors.length > 0) {
        targetTab = 'documents';
        tabName = 'Documents & Terms';
        missingFields = ['Accept terms and conditions'];
      }
      
      // Set the error state for the banner
      setValidationError({
        show: true,
        message: `Please complete the required fields in the ${tabName} tab`,
        missingFields,
        tab: tabName
      });
      
      // Switch to the tab with errors
      setActiveTab(targetTab);
      
      // Scroll to top to show the error banner
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  
  // Validation functions for tab navigation
  const validatePersonalInfo = () => {
    const values = form.getValues();
    const errors = [];

    if (!values.fullName || values.fullName.length < 2) errors.push("Full Name (minimum 2 characters)");
    if (userData?.account_type === 'organization' && !values.nameRepresentative?.trim()) {
      errors.push("Organization Representative Name");
    }
    if (!values.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.push("Valid Email Address");
    if (!values.phone || values.phone.length < 10) errors.push("Phone Number (minimum 10 characters)");
    if (!values.address || values.address.length < 5) errors.push("Address (minimum 5 characters)");

    if (errors.length > 0) {
      setValidationError({
        show: true,
        message: "Please complete all required fields in Personal Info",
        missingFields: errors,
        tab: "Personal Info"
      });
      // Scroll to top to show the error banner
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }
    return true;
  };

  const validatePermitDetails = () => {
    const values = form.getValues();
    const errors = [];

    if (!values.permitType) errors.push("Permit Type");
    if (!values.applicantType) errors.push("Applicant Type");
    if (!values.waterSource) errors.push("Water Source");
    if (!values.purpose) errors.push("Purpose of Water Use");
    if (!values.waterUsage || values.waterUsage <= 0) errors.push("Water Usage Amount");
    if (!values.waterUsageUnit || values.waterUsageUnit.trim() === "") errors.push("Unit");

    if (errors.length > 0) {
      setValidationError({
        show: true,
        message: "Please complete all required fields in Permit Details",
        missingFields: errors,
        tab: "Permit Details"
      });
      // Scroll to top to show the error banner
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }
    return true;
  };

  const validateLocation = () => {
    const values = form.getValues();
    const errors = [];

    // Add debug logging
    console.log('🔍 Location validation - current values:', {
      province: values.province,
      district: values.district,
      sector: values.sector,
      cell: values.cell,
      latitude: values.latitude,
      longitude: values.longitude
    });

    // Check for empty, null, or undefined values
    if (!values.province || values.province.trim() === '') {
      errors.push("Province");
      console.log('❌ Province validation failed:', values.province);
    }
    if (!values.district || values.district.trim() === '') {
      errors.push("District");
      console.log('❌ District validation failed:', values.district);
    }
    if (!values.sector || values.sector.trim() === '') {
      errors.push("Sector");
      console.log('❌ Sector validation failed:', values.sector);
    }
    if (!values.cell || values.cell.trim() === '') {
      errors.push("Cell");
      console.log('❌ Cell validation failed:', values.cell);
    }
    if (!values.latitude || values.latitude.trim() === '') {
      errors.push("Latitude");
      console.log('❌ Latitude validation failed:', values.latitude);
    }
    if (!values.longitude || values.longitude.trim() === '') {
      errors.push("Longitude");
      console.log('❌ Longitude validation failed:', values.longitude);
    }

    if (errors.length > 0) {
      console.log('❌ Location validation failed. Missing fields:', errors);
      setValidationError({
        show: true,
        message: "Please complete all required fields in Location",
        missingFields: errors,
        tab: "Location"
      });
      // Scroll to top to show the error banner
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }
    console.log('✅ Location validation passed');
    return true;
  };

  const validateProject = () => {
    const values = form.getValues();
    const errors = [];

    if (!values.projectTitle || values.projectTitle.length < 5) errors.push("Project Title (minimum 5 characters)");
    if (!values.projectDescription || values.projectDescription.length < 20) errors.push("Project Description (minimum 20 characters)");

    if (errors.length > 0) {
      setValidationError({
        show: true,
        message: "Please complete all required fields in Project Info",
        missingFields: errors,
        tab: "Project Info"
      });
      // Scroll to top to show the error banner
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }
    return true;
  };

  const validateTechnical = () => {
    const values = form.getValues();
    const errors = [];

    if (!values.waterTakingMethod) errors.push("Method of Water Taking");
    if (!values.waterMeasuringMethod) errors.push("Method of Measurement");
    if (!values.potentialEffects || values.potentialEffects.length < 20) errors.push("Potential Effects (minimum 20 characters)");
    if (!values.mitigationActions || values.mitigationActions.length < 20) errors.push("Mitigation Actions (minimum 20 characters)");
    if (!values.concessionDuration) errors.push("Proposed Duration");

    if (errors.length > 0) {
      setValidationError({
        show: true,
        message: "Please complete all required fields in Technical Details",
        missingFields: errors,
        tab: "Technical Details"
      });
      // Scroll to top to show the error banner
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }
    return true;
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setValidationError({
        show: true,
        message: "Location Service Not Available",
        missingFields: ["Geolocation is not supported by this browser. Please enter coordinates manually."],
        tab: "Location"
      });
      return;
    }

      navigator.geolocation.getCurrentPosition(
        (position) => {
        const latitude = position.coords.latitude.toFixed(6);
        const longitude = position.coords.longitude.toFixed(6);
        form.setValue("latitude", latitude);
        form.setValue("longitude", longitude);
        
        // Clear any existing error if location was successfully retrieved
        if (validationError?.show) {
          setValidationError(null);
        }
        },
        (error) => {
        let errorMessage = "Unable to get your location";
        let details = "";
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location Access Denied";
            details = "Please allow location access or enter coordinates manually.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location Information Unavailable";
            details = "Your location could not be determined. Please enter coordinates manually.";
            break;
          case error.TIMEOUT:
            errorMessage = "Location Request Timed Out";
            details = "The location request took too long. Please try again or enter coordinates manually.";
            break;
        }
        
        setValidationError({
          show: true,
          message: errorMessage,
          missingFields: [details],
          tab: "Location"
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };
  
  // District options based on province
  const getDistrictOptions = () => {
    switch (selectedProvince) {
      case "kigali":
        return [
          { value: "gasabo", label: "Gasabo" },
          { value: "kicukiro", label: "Kicukiro" },
          { value: "nyarugenge", label: "Nyarugenge" }
        ];
      case "northern":
        return [
          { value: "burera", label: "Burera" },
          { value: "gakenke", label: "Gakenke" },
          { value: "gicumbi", label: "Gicumbi" },
          { value: "musanze", label: "Musanze" },
          { value: "rulindo", label: "Rulindo" }
        ];
      case "eastern":
        return [
          { value: "bugesera", label: "Bugesera" },
          { value: "gatsibo", label: "Gatsibo" },
          { value: "kayonza", label: "Kayonza" },
          { value: "kirehe", label: "Kirehe" },
          { value: "ngoma", label: "Ngoma" },
          { value: "nyagatare", label: "Nyagatare" },
          { value: "rwamagana", label: "Rwamagana" }
        ];
      case "southern":
        return [
          { value: "gisagara", label: "Gisagara" },
          { value: "huye", label: "Huye" },
          { value: "kamonyi", label: "Kamonyi" },
          { value: "muhanga", label: "Muhanga" },
          { value: "nyamagabe", label: "Nyamagabe" },
          { value: "nyanza", label: "Nyanza" },
          { value: "nyaruguru", label: "Nyaruguru" },
          { value: "ruhango", label: "Ruhango" }
        ];
      case "western":
        return [
          { value: "karongi", label: "Karongi" },
          { value: "ngororero", label: "Ngororero" },
          { value: "nyabihu", label: "Nyabihu" },
          { value: "nyamasheke", label: "Nyamasheke" },
          { value: "rubavu", label: "Rubavu" },
          { value: "rusizi", label: "Rusizi" },
          { value: "rutsiro", label: "Rutsiro" }
        ];
      default:
        return [];
    }
  };
  
  // State for cascading dropdowns
  const [selectedOfficeProvince, setSelectedOfficeProvince] = useState("");
  const [selectedOfficeDistrict, setSelectedOfficeDistrict] = useState("");
  const [selectedOfficeSector, setSelectedOfficeSector] = useState("");
  const [selectedWaterSourceProvince, setSelectedWaterSourceProvince] = useState("");
  const [selectedWaterSourceDistrict, setSelectedWaterSourceDistrict] = useState("");
  const [selectedWaterSourceSector, setSelectedWaterSourceSector] = useState("");

  // Watch form values to keep dropdown states in sync
  const officeProvince = form.watch("officeProvince");
  const officeDistrict = form.watch("officeDistrict");
  const officeSector = form.watch("officeSector");
  const waterSourceProvince = form.watch("waterSourceProvince");
  const waterSourceDistrict = form.watch("waterSourceDistrict");
  const waterSourceSector = form.watch("waterSourceSector");

  // Update dropdown states when form values change
  useEffect(() => {
    if (officeProvince !== selectedOfficeProvince) {
      setSelectedOfficeProvince(officeProvince || "");
    }
    if (officeDistrict !== selectedOfficeDistrict) {
      setSelectedOfficeDistrict(officeDistrict || "");
    }
    if (officeSector !== selectedOfficeSector) {
      setSelectedOfficeSector(officeSector || "");
    }
    if (waterSourceProvince !== selectedWaterSourceProvince) {
      setSelectedWaterSourceProvince(waterSourceProvince || "");
    }
    if (waterSourceDistrict !== selectedWaterSourceDistrict) {
      setSelectedWaterSourceDistrict(waterSourceDistrict || "");
    }
    if (waterSourceSector !== selectedWaterSourceSector) {
      setSelectedWaterSourceSector(waterSourceSector || "");
    }
  }, [officeProvince, officeDistrict, officeSector, waterSourceProvince, waterSourceDistrict, waterSourceSector, 
      selectedOfficeProvince, selectedOfficeDistrict, selectedOfficeSector, 
      selectedWaterSourceProvince, selectedWaterSourceDistrict, selectedWaterSourceSector]);

  // Initialize states from initialData
  useEffect(() => {
    if (initialData) {
      if (initialData.officeProvince) {
        setSelectedOfficeProvince(initialData.officeProvince);
      }
      if (initialData.officeDistrict) {
        setSelectedOfficeDistrict(initialData.officeDistrict);
      }
      if (initialData.officeSector) {
        setSelectedOfficeSector(initialData.officeSector);
      }
      if (initialData.waterSourceProvince) {
        setSelectedWaterSourceProvince(initialData.waterSourceProvince);
      }
      if (initialData.waterSourceDistrict) {
        setSelectedWaterSourceDistrict(initialData.waterSourceDistrict);
      }
      if (initialData.waterSourceSector) {
        setSelectedWaterSourceSector(initialData.waterSourceSector);
      }
    }
  }, [initialData]);

  // Helper functions for dropdown options
  const getOfficeDistrictOptions = () => {
    if (!selectedOfficeProvince) return [];
    return getFormattedDistrictOptions(selectedOfficeProvince);
  };

  const getOfficeSectorOptions = () => {
    if (!selectedOfficeProvince || !selectedOfficeDistrict) return [];
    return getFormattedSectorOptions(selectedOfficeProvince, selectedOfficeDistrict);
  };

  const getOfficeCellOptions = () => {
    if (!selectedOfficeProvince || !selectedOfficeDistrict || !selectedOfficeSector) return [];
    return getFormattedCellOptions(selectedOfficeProvince, selectedOfficeDistrict, selectedOfficeSector);
  };

  const getWaterSourceDistrictOptions = () => {
    if (!selectedWaterSourceProvince) return [];
    return getFormattedDistrictOptions(selectedWaterSourceProvince);
  };

  const getWaterSourceSectorOptions = () => {
    if (!selectedWaterSourceProvince || !selectedWaterSourceDistrict) return [];
    return getFormattedSectorOptions(selectedWaterSourceProvince, selectedWaterSourceDistrict);
  };

  const getWaterSourceCellOptions = () => {
    if (!selectedWaterSourceProvince || !selectedWaterSourceDistrict || !selectedWaterSourceSector) return [];
    return getFormattedCellOptions(selectedWaterSourceProvince, selectedWaterSourceDistrict, selectedWaterSourceSector);
  };

  // Rwanda administrative divisions data (using new comprehensive data)
  const rwandaAdministrativeDivisions = {
    gasabo: {
      sectors: [
        { value: "bumbogo", label: "Bumbogo", cells: ["bumbogo", "gahanga", "gataraga", "gitega", "rutunga"] },
        { value: "gatsata", label: "Gatsata", cells: ["gatsata", "gisozi", "jabana", "jali", "kinyinya"] },
        { value: "jali", label: "Jali", cells: ["gahanga", "gasanze", "jali", "kinyinya", "rusororo"] },
        { value: "kinyinya", label: "Kinyinya", cells: ["gahanga", "gasanze", "jali", "kinyinya", "rusororo"] },
        { value: "ndera", label: "Ndera", cells: ["gahanga", "masaka", "ndera", "rusororo", "shyorongi"] },
        { value: "nduba", label: "Nduba", cells: ["gisozi", "jabana", "jali", "nduba", "rutunga"] },
        { value: "rusororo", label: "Rusororo", cells: ["gahanga", "gasanze", "jali", "kinyinya", "rusororo"] },
        { value: "rutunga", label: "Rutunga", cells: ["bumbogo", "gahanga", "gataraga", "gitega", "rutunga"] }
      ]
    },
    kicukiro: {
      sectors: [
        { value: "gahanga", label: "Gahanga", cells: ["gahanga", "kabuye", "kimisagara", "nyarugunga", "ruhango"] },
        { value: "gatenga", label: "Gatenga", cells: ["gatenga", "kagarama", "kimisagara", "nyarugunga", "rebero"] },
        { value: "gikondo", label: "Gikondo", cells: ["gikondo", "kagarama", "kimisagara", "nyarugunga", "rebero"] },
        { value: "kanombe", label: "Kanombe", cells: ["gahanga", "kanombe", "kabuye", "nyarugunga", "ruhango"] },
        { value: "kicukiro", label: "Kicukiro", cells: ["gahanga", "gatenga", "kagarama", "kicukiro", "nyarugunga"] },
        { value: "niboye", label: "Niboye", cells: ["gatenga", "kagarama", "kicukiro", "niboye", "nyarugunga"] }
      ]
    },
    nyarugenge: {
      sectors: [
        { value: "gitega", label: "Gitega", cells: ["gitega", "kanyinya", "kigali", "kimisagara", "nyarugenge"] },
        { value: "kanyinya", label: "Kanyinya", cells: ["gitega", "kanyinya", "kigali", "kimisagara", "nyarugenge"] },
        { value: "kigali", label: "Kigali", cells: ["gitega", "kanyinya", "kigali", "kimisagara", "nyarugenge"] },
        { value: "kimisagara", label: "Kimisagara", cells: ["gitega", "kanyinya", "kigali", "kimisagara", "nyarugenge"] },
        { value: "mageragere", label: "Mageragere", cells: ["gitega", "kanyinya", "kigali", "kimisagara", "nyarugenge"] },
        { value: "nyakabanda", label: "Nyakabanda", cells: ["gitega", "kanyinya", "kigali", "kimisagara", "nyarugenge"] },
        { value: "nyamirambo", label: "Nyamirambo", cells: ["gitega", "kanyinya", "kigali", "kimisagara", "nyarugenge"] },
        { value: "nyarugenge", label: "Nyarugenge", cells: ["gitega", "kanyinya", "kigali", "kimisagara", "nyarugenge"] },
        { value: "rwezamenyo", label: "Rwezamenyo", cells: ["gitega", "kanyinya", "kigali", "kimisagara", "nyarugenge"] }
      ]
    },
    burera: {
      sectors: [
        { value: "bungwe", label: "Bungwe", cells: ["bungwe", "cyeru", "gaseke", "gitovu", "rugeshi"] },
        { value: "butaro", label: "Butaro", cells: ["butaro", "cyanzarwe", "gaseke", "rugeshi", "ruhunde"] },
        { value: "cyanika", label: "Cyanika", cells: ["cyanika", "cyeru", "gaseke", "gitovu", "rugeshi"] },
        { value: "cyeru", label: "Cyeru", cells: ["bungwe", "cyeru", "gaseke", "gitovu", "rugeshi"] },
        { value: "gahunga", label: "Gahunga", cells: ["gahunga", "gaseke", "gitovu", "rugeshi", "ruhunde"] },
        { value: "gatebe", label: "Gatebe", cells: ["gatebe", "gaseke", "gitovu", "rugeshi", "ruhunde"] },
        { value: "gitovu", label: "Gitovu", cells: ["bungwe", "cyeru", "gaseke", "gitovu", "rugeshi"] },
        { value: "kagogo", label: "Kagogo", cells: ["kagogo", "gaseke", "gitovu", "rugeshi", "ruhunde"] },
        { value: "kinoni", label: "Kinoni", cells: ["kinoni", "gaseke", "gitovu", "rugeshi", "ruhunde"] },
        { value: "kinyababa", label: "Kinyababa", cells: ["kinyababa", "gaseke", "gitovu", "rugeshi", "ruhunde"] },
        { value: "kivuye", label: "Kivuye", cells: ["kivuye", "gaseke", "gitovu", "rugeshi", "ruhunde"] },
        { value: "nemba", label: "Nemba", cells: ["nemba", "gaseke", "gitovu", "rugeshi", "ruhunde"] },
        { value: "rugarama", label: "Rugarama", cells: ["rugarama", "gaseke", "gitovu", "rugeshi", "ruhunde"] },
        { value: "rugeshi", label: "Rugeshi", cells: ["bungwe", "cyeru", "gaseke", "gitovu", "rugeshi"] },
        { value: "ruhunde", label: "Ruhunde", cells: ["butaro", "cyanzarwe", "gaseke", "rugeshi", "ruhunde"] },
        { value: "rusarabuye", label: "Rusarabuye", cells: ["rusarabuye", "gaseke", "gitovu", "rugeshi", "ruhunde"] }
      ]
    },
    gakenke: {
      sectors: [
        { value: "busengo", label: "Busengo", cells: ["busengo", "cyabingo", "gaseke", "mugunga", "ruli"] },
        { value: "cyabingo", label: "Cyabingo", cells: ["busengo", "cyabingo", "gaseke", "mugunga", "ruli"] },
        { value: "gakenke", label: "Gakenke", cells: ["gakenke", "gaseke", "mugunga", "ruli", "rusasa"] },
        { value: "gaseke", label: "Gaseke", cells: ["busengo", "cyabingo", "gaseke", "mugunga", "ruli"] },
        { value: "janja", label: "Janja", cells: ["janja", "gaseke", "mugunga", "ruli", "rusasa"] },
        { value: "karambo", label: "Karambo", cells: ["karambo", "gaseke", "mugunga", "ruli", "rusasa"] },
        { value: "kivuruga", label: "Kivuruga", cells: ["kivuruga", "gaseke", "mugunga", "ruli", "rusasa"] },
        { value: "mataba", label: "Mataba", cells: ["mataba", "gaseke", "mugunga", "ruli", "rusasa"] },
        { value: "minazi", label: "Minazi", cells: ["minazi", "gaseke", "mugunga", "ruli", "rusasa"] },
        { value: "mugunga", label: "Mugunga", cells: ["busengo", "cyabingo", "gaseke", "mugunga", "ruli"] },
        { value: "muyongwe", label: "Muyongwe", cells: ["muyongwe", "gaseke", "mugunga", "ruli", "rusasa"] },
        { value: "nemba", label: "Nemba", cells: ["nemba", "gaseke", "mugunga", "ruli", "rusasa"] },
        { value: "ruli", label: "Ruli", cells: ["busengo", "cyabingo", "gaseke", "mugunga", "ruli"] },
        { value: "rusasa", label: "Rusasa", cells: ["gakenke", "gaseke", "mugunga", "ruli", "rusasa"] }
      ]
    },
    gicumbi: {
      sectors: [
        { value: "bukure", label: "Bukure", cells: ["bukure", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "bwisige", label: "Bwisige", cells: ["bwisige", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "byumba", label: "Byumba", cells: ["byumba", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "cyumba", label: "Cyumba", cells: ["cyumba", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "gicumbi", label: "Gicumbi", cells: ["gicumbi", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "kaniga", label: "Kaniga", cells: ["kaniga", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "manyagiro", label: "Manyagiro", cells: ["manyagiro", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "miyove", label: "Miyove", cells: ["miyove", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "mukarange", label: "Mukarange", cells: ["bukure", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "muko", label: "Muko", cells: ["muko", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "mutete", label: "Mutete", cells: ["mutete", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "nyankenke", label: "Nyankenke", cells: ["nyankenke", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "nyarutovu", label: "Nyarutovu", cells: ["nyarutovu", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "rubaya", label: "Rubaya", cells: ["bukure", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "rukomo", label: "Rukomo", cells: ["rukomo", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "rushaki", label: "Rushaki", cells: ["bukure", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "rutare", label: "Rutare", cells: ["rutare", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "rwamiko", label: "Rwamiko", cells: ["rwamiko", "gaseke", "mukarange", "rubaya", "rushaki"] },
        { value: "shangasha", label: "Shangasha", cells: ["shangasha", "gaseke", "mukarange", "rubaya", "rushaki"] }
      ]
    },
    musanze: {
      sectors: [
        { value: "busogo", label: "Busogo", cells: ["busogo", "cyuve", "gashaki", "kimonyi", "muhoza"] },
        { value: "cyuve", label: "Cyuve", cells: ["busogo", "cyuve", "gashaki", "kimonyi", "muhoza"] },
        { value: "gacaca", label: "Gacaca", cells: ["gacaca", "gashaki", "kimonyi", "muhoza", "nyange"] },
        { value: "gashaki", label: "Gashaki", cells: ["busogo", "cyuve", "gashaki", "kimonyi", "muhoza"] },
        { value: "gataraga", label: "Gataraga", cells: ["gataraga", "gashaki", "kimonyi", "muhoza", "nyange"] },
        { value: "kimonyi", label: "Kimonyi", cells: ["busogo", "cyuve", "gashaki", "kimonyi", "muhoza"] },
        { value: "kinigi", label: "Kinigi", cells: ["kinigi", "gashaki", "kimonyi", "muhoza", "nyange"] },
        { value: "muhoza", label: "Muhoza", cells: ["busogo", "cyuve", "gashaki", "kimonyi", "muhoza"] },
        { value: "muko", label: "Muko", cells: ["muko", "gashaki", "kimonyi", "muhoza", "nyange"] },
        { value: "musanze", label: "Musanze", cells: ["musanze", "gashaki", "kimonyi", "muhoza", "nyange"] },
        { value: "nkotsi", label: "Nkotsi", cells: ["nkotsi", "gashaki", "kimonyi", "muhoza", "nyange"] },
        { value: "nyange", label: "Nyange", cells: ["gacaca", "gashaki", "kimonyi", "muhoza", "nyange"] },
        { value: "remera", label: "Remera", cells: ["remera", "gashaki", "kimonyi", "muhoza", "nyange"] },
        { value: "rwaza", label: "Rwaza", cells: ["rwaza", "gashaki", "kimonyi", "muhoza", "nyange"] },
        { value: "shingiro", label: "Shingiro", cells: ["shingiro", "gashaki", "kimonyi", "muhoza", "nyange"] }
      ]
    },
    rulindo: {
      sectors: [
        { value: "base", label: "Base", cells: ["base", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "burega", label: "Burega", cells: ["burega", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "buyoga", label: "Buyoga", cells: ["buyoga", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "cyinzuzi", label: "Cyinzuzi", cells: ["cyinzuzi", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "cyungo", label: "Cyungo", cells: ["cyungo", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "kinihira", label: "Kinihira", cells: ["base", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "kisaro", label: "Kisaro", cells: ["kisaro", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "mbogo", label: "Mbogo", cells: ["mbogo", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "murambi", label: "Murambi", cells: ["base", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "ngoma", label: "Ngoma", cells: ["ngoma", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "ntarabana", label: "Ntarabana", cells: ["ntarabana", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "rukozo", label: "Rukozo", cells: ["rukozo", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "rusiga", label: "Rusiga", cells: ["base", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "shyorongi", label: "Shyorongi", cells: ["shyorongi", "gaseke", "kinihira", "murambi", "rusiga"] },
        { value: "tumba", label: "Tumba", cells: ["tumba", "gaseke", "kinihira", "murambi", "rusiga"] }
      ]
    },
    // Add more districts as needed - this is a sample to demonstrate the structure
    // For brevity, I'll add a few more key districts
    huye: {
      sectors: [
        { value: "gishamvu", label: "Gishamvu", cells: ["gishamvu", "karama", "kigoma", "mukura", "rusatira"] },
        { value: "karama", label: "Karama", cells: ["gishamvu", "karama", "kigoma", "mukura", "rusatira"] },
        { value: "kigoma", label: "Kigoma", cells: ["gishamvu", "karama", "kigoma", "mukura", "rusatira"] },
        { value: "kinazi", label: "Kinazi", cells: ["kinazi", "karama", "kigoma", "mukura", "rusatira"] },
        { value: "maraba", label: "Maraba", cells: ["maraba", "karama", "kigoma", "mukura", "rusatira"] },
        { value: "mbazi", label: "Mbazi", cells: ["mbazi", "karama", "kigoma", "mukura", "rusatira"] },
        { value: "mukura", label: "Mukura", cells: ["gishamvu", "karama", "kigoma", "mukura", "rusatira"] },
        { value: "ngoma", label: "Ngoma", cells: ["ngoma", "karama", "kigoma", "mukura", "rusatira"] },
        { value: "ruhashya", label: "Ruhashya", cells: ["ruhashya", "karama", "kigoma", "mukura", "rusatira"] },
        { value: "rusatira", label: "Rusatira", cells: ["gishamvu", "karama", "kigoma", "mukura", "rusatira"] },
        { value: "rwaniro", label: "Rwaniro", cells: ["rwaniro", "karama", "kigoma", "mukura", "rusatira"] },
        { value: "simbi", label: "Simbi", cells: ["simbi", "karama", "kigoma", "mukura", "rusatira"] },
        { value: "tumba", label: "Tumba", cells: ["tumba", "karama", "kigoma", "mukura", "rusatira"] }
      ]
    },
    rubavu: {
      sectors: [
        { value: "bugeshi", label: "Bugeshi", cells: ["bugeshi", "gisenyi", "kanama", "mudende", "rugerero"] },
        { value: "busasamana", label: "Busasamana", cells: ["busasamana", "gisenyi", "kanama", "mudende", "rugerero"] },
        { value: "cyanzarwe", label: "Cyanzarwe", cells: ["cyanzarwe", "gisenyi", "kanama", "mudende", "rugerero"] },
        { value: "gisenyi", label: "Gisenyi", cells: ["bugeshi", "gisenyi", "kanama", "mudende", "rugerero"] },
        { value: "kanama", label: "Kanama", cells: ["bugeshi", "gisenyi", "kanama", "mudende", "rugerero"] },
        { value: "kanzenze", label: "Kanzenze", cells: ["kanzenze", "gisenyi", "kanama", "mudende", "rugerero"] },
        { value: "mudende", label: "Mudende", cells: ["bugeshi", "gisenyi", "kanama", "mudende", "rugerero"] },
        { value: "nyakiliba", label: "Nyakiliba", cells: ["nyakiliba", "gisenyi", "kanama", "mudende", "rugerero"] },
        { value: "nyamyumba", label: "Nyamyumba", cells: ["nyamyumba", "gisenyi", "kanama", "mudende", "rugerero"] },
        { value: "rubavu", label: "Rubavu", cells: ["rubavu", "gisenyi", "kanama", "mudende", "rugerero"] },
        { value: "rugerero", label: "Rugerero", cells: ["bugeshi", "gisenyi", "kanama", "mudende", "rugerero"] }
      ]
    },
         nyagatare: {
       sectors: [
         { value: "gatunda", label: "Gatunda", cells: ["gatunda", "karama", "kiyombe", "matimba", "rukomo"] },
         { value: "karama", label: "Karama", cells: ["gatunda", "karama", "kiyombe", "matimba", "rukomo"] },
         { value: "karangazi", label: "Karangazi", cells: ["karangazi", "karama", "kiyombe", "matimba", "rukomo"] },
         { value: "katabagemu", label: "Katabagemu", cells: ["katabagemu", "karama", "kiyombe", "matimba", "rukomo"] },
         { value: "kiyombe", label: "Kiyombe", cells: ["gatunda", "karama", "kiyombe", "matimba", "rukomo"] },
         { value: "matimba", label: "Matimba", cells: ["gatunda", "karama", "kiyombe", "matimba", "rukomo"] },
         { value: "mimuli", label: "Mimuli", cells: ["mimuli", "karama", "kiyombe", "matimba", "rukomo"] },
         { value: "mukama", label: "Mukama", cells: ["mukama", "karama", "kiyombe", "matimba", "rukomo"] },
         { value: "musheri", label: "Musheri", cells: ["musheri", "karama", "kiyombe", "matimba", "rukomo"] },
         { value: "nyagatare", label: "Nyagatare", cells: ["nyagatare", "karama", "kiyombe", "matimba", "rukomo"] },
         { value: "rukomo", label: "Rukomo", cells: ["gatunda", "karama", "kiyombe", "matimba", "rukomo"] },
         { value: "rwempasha", label: "Rwempasha", cells: ["rwempasha", "karama", "kiyombe", "matimba", "rukomo"] },
         { value: "rwimiyaga", label: "Rwimiyaga", cells: ["rwimiyaga", "karama", "kiyombe", "matimba", "rukomo"] },
         { value: "tabagwe", label: "Tabagwe", cells: ["tabagwe", "karama", "kiyombe", "matimba", "rukomo"] }
       ]
     },
     // Add remaining districts for completeness
     bugesera: {
       sectors: [
         { value: "gashora", label: "Gashora", cells: ["gashora", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "juru", label: "Juru", cells: ["juru", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "kamabuye", label: "Kamabuye", cells: ["gashora", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "mareba", label: "Mareba", cells: ["gashora", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "mayange", label: "Mayange", cells: ["mayange", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "musenyi", label: "Musenyi", cells: ["musenyi", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "mwogo", label: "Mwogo", cells: ["mwogo", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "ngeruka", label: "Ngeruka", cells: ["ngeruka", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "ntarama", label: "Ntarama", cells: ["gashora", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "nyamata", label: "Nyamata", cells: ["nyamata", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "nyarugenge", label: "Nyarugenge", cells: ["nyarugenge", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "rilima", label: "Rilima", cells: ["gashora", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "ruhuha", label: "Ruhuha", cells: ["ruhuha", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "rweru", label: "Rweru", cells: ["rweru", "kamabuye", "mareba", "ntarama", "rilima"] },
         { value: "shyara", label: "Shyara", cells: ["shyara", "kamabuye", "mareba", "ntarama", "rilima"] }
       ]
     },
     gatsibo: {
       sectors: [
         { value: "gasange", label: "Gasange", cells: ["gasange", "kageyo", "kiramuruzi", "muhura", "remera"] },
         { value: "gitoki", label: "Gitoki", cells: ["gitoki", "kageyo", "kiramuruzi", "muhura", "remera"] },
         { value: "kageyo", label: "Kageyo", cells: ["gasange", "kageyo", "kiramuruzi", "muhura", "remera"] },
         { value: "kabarore", label: "Kabarore", cells: ["kabarore", "kageyo", "kiramuruzi", "muhura", "remera"] },
         { value: "kiramuruzi", label: "Kiramuruzi", cells: ["gasange", "kageyo", "kiramuruzi", "muhura", "remera"] },
         { value: "kiziguro", label: "Kiziguro", cells: ["kiziguro", "kageyo", "kiramuruzi", "muhura", "remera"] },
         { value: "muhura", label: "Muhura", cells: ["gasange", "kageyo", "kiramuruzi", "muhura", "remera"] },
         { value: "murambi", label: "Murambi", cells: ["murambi", "kageyo", "kiramuruzi", "muhura", "remera"] },
         { value: "ngarama", label: "Ngarama", cells: ["ngarama", "kageyo", "kiramuruzi", "muhura", "remera"] },
         { value: "nyagihanga", label: "Nyagihanga", cells: ["nyagihanga", "kageyo", "kiramuruzi", "muhura", "remera"] },
         { value: "remera", label: "Remera", cells: ["gasange", "kageyo", "kiramuruzi", "muhura", "remera"] },
         { value: "rugarama", label: "Rugarama", cells: ["rugarama", "kageyo", "kiramuruzi", "muhura", "remera"] },
         { value: "rwimbogo", label: "Rwimbogo", cells: ["rwimbogo", "kageyo", "kiramuruzi", "muhura", "remera"] }
       ]
     },
     kayonza: {
       sectors: [
         { value: "gahini", label: "Gahini", cells: ["gahini", "kabare", "murundi", "ndego", "rwinkwavu"] },
         { value: "kabare", label: "Kabare", cells: ["gahini", "kabare", "murundi", "ndego", "rwinkwavu"] },
         { value: "kabarondo", label: "Kabarondo", cells: ["kabarondo", "kabare", "murundi", "ndego", "rwinkwavu"] },
         { value: "mukarange", label: "Mukarange", cells: ["mukarange", "kabare", "murundi", "ndego", "rwinkwavu"] },
         { value: "murama", label: "Murama", cells: ["murama", "kabare", "murundi", "ndego", "rwinkwavu"] },
         { value: "murundi", label: "Murundi", cells: ["gahini", "kabare", "murundi", "ndego", "rwinkwavu"] },
         { value: "mwiri", label: "Mwiri", cells: ["mwiri", "kabare", "murundi", "ndego", "rwinkwavu"] },
         { value: "ndego", label: "Ndego", cells: ["gahini", "kabare", "murundi", "ndego", "rwinkwavu"] },
         { value: "nyamirama", label: "Nyamirama", cells: ["nyamirama", "kabare", "murundi", "ndego", "rwinkwavu"] },
         { value: "rukara", label: "Rukara", cells: ["rukara", "kabare", "murundi", "ndego", "rwinkwavu"] },
         { value: "ruramira", label: "Ruramira", cells: ["ruramira", "kabare", "murundi", "ndego", "rwinkwavu"] },
         { value: "rwinkwavu", label: "Rwinkwavu", cells: ["gahini", "kabare", "murundi", "ndego", "rwinkwavu"] }
       ]
     },
     kirehe: {
       sectors: [
         { value: "gatore", label: "Gatore", cells: ["gatore", "kigarama", "mahama", "mpanga", "nasho"] },
         { value: "kigarama", label: "Kigarama", cells: ["gatore", "kigarama", "mahama", "mpanga", "nasho"] },
         { value: "kirehe", label: "Kirehe", cells: ["kirehe", "kigarama", "mahama", "mpanga", "nasho"] },
         { value: "mahama", label: "Mahama", cells: ["gatore", "kigarama", "mahama", "mpanga", "nasho"] },
         { value: "mpanga", label: "Mpanga", cells: ["gatore", "kigarama", "mahama", "mpanga", "nasho"] },
         { value: "mushikiri", label: "Mushikiri", cells: ["mushikiri", "kigarama", "mahama", "mpanga", "nasho"] },
         { value: "musaza", label: "Musaza", cells: ["musaza", "kigarama", "mahama", "mpanga", "nasho"] },
         { value: "nasho", label: "Nasho", cells: ["gatore", "kigarama", "mahama", "mpanga", "nasho"] },
         { value: "nyamugari", label: "Nyamugari", cells: ["nyamugari", "kigarama", "mahama", "mpanga", "nasho"] }
       ]
     },
     ngoma: {
       sectors: [
         { value: "gashanda", label: "Gashanda", cells: ["gashanda", "jarama", "karembo", "mugesera", "sake"] },
         { value: "jarama", label: "Jarama", cells: ["gashanda", "jarama", "karembo", "mugesera", "sake"] },
         { value: "karembo", label: "Karembo", cells: ["gashanda", "jarama", "karembo", "mugesera", "sake"] },
         { value: "kibungo", label: "Kibungo", cells: ["kibungo", "jarama", "karembo", "mugesera", "sake"] },
         { value: "mugesera", label: "Mugesera", cells: ["gashanda", "jarama", "karembo", "mugesera", "sake"] },
         { value: "mutenderi", label: "Mutenderi", cells: ["mutenderi", "jarama", "karembo", "mugesera", "sake"] },
         { value: "remera", label: "Remera", cells: ["remera", "jarama", "karembo", "mugesera", "sake"] },
         { value: "rukira", label: "Rukira", cells: ["rukira", "jarama", "karembo", "mugesera", "sake"] },
         { value: "rukumberi", label: "Rukumberi", cells: ["rukumberi", "jarama", "karembo", "mugesera", "sake"] },
         { value: "sake", label: "Sake", cells: ["gashanda", "jarama", "karembo", "mugesera", "sake"] },
         { value: "zaza", label: "Zaza", cells: ["zaza", "jarama", "karembo", "mugesera", "sake"] }
       ]
     },
     rwamagana: {
       sectors: [
         { value: "fumbwe", label: "Fumbwe", cells: ["fumbwe", "gahengeri", "kigabiro", "muhazi", "rubona"] },
         { value: "gahengeri", label: "Gahengeri", cells: ["fumbwe", "gahengeri", "kigabiro", "muhazi", "rubona"] },
         { value: "gishari", label: "Gishari", cells: ["gishari", "gahengeri", "kigabiro", "muhazi", "rubona"] },
         { value: "karenge", label: "Karenge", cells: ["karenge", "gahengeri", "kigabiro", "muhazi", "rubona"] },
         { value: "kigabiro", label: "Kigabiro", cells: ["fumbwe", "gahengeri", "kigabiro", "muhazi", "rubona"] },
         { value: "kigali", label: "Kigali", cells: ["kigali", "gahengeri", "kigabiro", "muhazi", "rubona"] },
         { value: "muhazi", label: "Muhazi", cells: ["fumbwe", "gahengeri", "kigabiro", "muhazi", "rubona"] },
         { value: "munyaga", label: "Munyaga", cells: ["munyaga", "gahengeri", "kigabiro", "muhazi", "rubona"] },
         { value: "munyiginya", label: "Munyiginya", cells: ["munyiginya", "gahengeri", "kigabiro", "muhazi", "rubona"] },
         { value: "musha", label: "Musha", cells: ["musha", "gahengeri", "kigabiro", "muhazi", "rubona"] },
         { value: "muyumbu", label: "Muyumbu", cells: ["muyumbu", "gahengeri", "kigabiro", "muhazi", "rubona"] },
         { value: "nyakariro", label: "Nyakariro", cells: ["nyakariro", "gahengeri", "kigabiro", "muhazi", "rubona"] },
         { value: "nzige", label: "Nzige", cells: ["nzige", "gahengeri", "kigabiro", "muhazi", "rubona"] },
                  { value: "rubona", label: "Rubona", cells: ["fumbwe", "gahengeri", "kigabiro", "muhazi", "rubona"] }
       ]
     },
     // Southern Province districts
     gisagara: {
       sectors: [
         { value: "gishubi", label: "Gishubi", cells: ["gishubi", "kansi", "kigembe", "mamba", "muganza"] },
         { value: "kansi", label: "Kansi", cells: ["gishubi", "kansi", "kigembe", "mamba", "muganza"] },
         { value: "kibirizi", label: "Kibirizi", cells: ["kibirizi", "kansi", "kigembe", "mamba", "muganza"] },
         { value: "kigembe", label: "Kigembe", cells: ["gishubi", "kansi", "kigembe", "mamba", "muganza"] },
         { value: "mamba", label: "Mamba", cells: ["gishubi", "kansi", "kigembe", "mamba", "muganza"] },
         { value: "muganza", label: "Muganza", cells: ["gishubi", "kansi", "kigembe", "mamba", "muganza"] },
         { value: "mukindo", label: "Mukindo", cells: ["mukindo", "kansi", "kigembe", "mamba", "muganza"] },
         { value: "ndora", label: "Ndora", cells: ["ndora", "kansi", "kigembe", "mamba", "muganza"] },
         { value: "nyanza", label: "Nyanza", cells: ["nyanza", "kansi", "kigembe", "mamba", "muganza"] },
         { value: "save", label: "Save", cells: ["save", "kansi", "kigembe", "mamba", "muganza"] }
       ]
     },
     kamonyi: {
       sectors: [
         { value: "gacurabwenge", label: "Gacurabwenge", cells: ["gacurabwenge", "karama", "mugina", "musambira", "ruzo"] },
         { value: "karama", label: "Karama", cells: ["gacurabwenge", "karama", "mugina", "musambira", "ruzo"] },
         { value: "kayenzi", label: "Kayenzi", cells: ["kayenzi", "karama", "mugina", "musambira", "ruzo"] },
         { value: "kayumbu", label: "Kayumbu", cells: ["kayumbu", "karama", "mugina", "musambira", "ruzo"] },
         { value: "mugina", label: "Mugina", cells: ["gacurabwenge", "karama", "mugina", "musambira", "ruzo"] },
         { value: "musambira", label: "Musambira", cells: ["gacurabwenge", "karama", "mugina", "musambira", "ruzo"] },
         { value: "nyamiyaga", label: "Nyamiyaga", cells: ["nyamiyaga", "karama", "mugina", "musambira", "ruzo"] },
         { value: "nyarubaka", label: "Nyarubaka", cells: ["nyarubaka", "karama", "mugina", "musambira", "ruzo"] },
         { value: "runda", label: "Runda", cells: ["runda", "karama", "mugina", "musambira", "ruzo"] },
         { value: "ruzo", label: "Ruzo", cells: ["gacurabwenge", "karama", "mugina", "musambira", "ruzo"] }
       ]
     },
     muhanga: {
       sectors: [
         { value: "cyeza", label: "Cyeza", cells: ["cyeza", "kiyumba", "muhanga", "nyamabuye", "shyogwe"] },
         { value: "kiyumba", label: "Kiyumba", cells: ["cyeza", "kiyumba", "muhanga", "nyamabuye", "shyogwe"] },
         { value: "muhanga", label: "Muhanga", cells: ["cyeza", "kiyumba", "muhanga", "nyamabuye", "shyogwe"] },
         { value: "mukura", label: "Mukura", cells: ["mukura", "kiyumba", "muhanga", "nyamabuye", "shyogwe"] },
         { value: "nyabinoni", label: "Nyabinoni", cells: ["nyabinoni", "kiyumba", "muhanga", "nyamabuye", "shyogwe"] },
         { value: "nyamabuye", label: "Nyamabuye", cells: ["cyeza", "kiyumba", "muhanga", "nyamabuye", "shyogwe"] },
         { value: "rongi", label: "Rongi", cells: ["rongi", "kiyumba", "muhanga", "nyamabuye", "shyogwe"] },
         { value: "rugendabari", label: "Rugendabari", cells: ["rugendabari", "kiyumba", "muhanga", "nyamabuye", "shyogwe"] },
         { value: "ruyenzi", label: "Ruyenzi", cells: ["ruyenzi", "kiyumba", "muhanga", "nyamabuye", "shyogwe"] },
         { value: "shyogwe", label: "Shyogwe", cells: ["cyeza", "kiyumba", "muhanga", "nyamabuye", "shyogwe"] }
       ]
     },
     nyamagabe: {
       sectors: [
         { value: "buruhukiro", label: "Buruhukiro", cells: ["buruhukiro", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "cyanika", label: "Cyanika", cells: ["cyanika", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "gasaka", label: "Gasaka", cells: ["buruhukiro", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "kaduha", label: "Kaduha", cells: ["kaduha", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "kamegeri", label: "Kamegeri", cells: ["kamegeri", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "kibirizi", label: "Kibirizi", cells: ["buruhukiro", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "kibumbwe", label: "Kibumbwe", cells: ["kibumbwe", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "kitabi", label: "Kitabi", cells: ["kitabi", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "mbazi", label: "Mbazi", cells: ["mbazi", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "mugano", label: "Mugano", cells: ["buruhukiro", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "mushubi", label: "Mushubi", cells: ["mushubi", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "musange", label: "Musange", cells: ["musange", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "nkomane", label: "Nkomane", cells: ["nkomane", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "tare", label: "Tare", cells: ["buruhukiro", "gasaka", "kibirizi", "mugano", "tare"] },
         { value: "uwinkingi", label: "Uwinkingi", cells: ["uwinkingi", "gasaka", "kibirizi", "mugano", "tare"] }
       ]
     },
     nyanza: {
       sectors: [
         { value: "busasamana", label: "Busasamana", cells: ["busasamana", "kibirizi", "mukingo", "nyagisozi", "rwabicuma"] },
         { value: "busoro", label: "Busoro", cells: ["busoro", "kibirizi", "mukingo", "nyagisozi", "rwabicuma"] },
         { value: "cyabakamyi", label: "Cyabakamyi", cells: ["cyabakamyi", "kibirizi", "mukingo", "nyagisozi", "rwabicuma"] },
         { value: "kibirizi", label: "Kibirizi", cells: ["busasamana", "kibirizi", "mukingo", "nyagisozi", "rwabicuma"] },
         { value: "kigoma", label: "Kigoma", cells: ["kigoma", "kibirizi", "mukingo", "nyagisozi", "rwabicuma"] },
         { value: "mukingo", label: "Mukingo", cells: ["busasamana", "kibirizi", "mukingo", "nyagisozi", "rwabicuma"] },
         { value: "ntyazo", label: "Ntyazo", cells: ["ntyazo", "kibirizi", "mukingo", "nyagisozi", "rwabicuma"] },
         { value: "nyagisozi", label: "Nyagisozi", cells: ["busasamana", "kibirizi", "mukingo", "nyagisozi", "rwabicuma"] },
         { value: "rwabicuma", label: "Rwabicuma", cells: ["busasamana", "kibirizi", "mukingo", "nyagisozi", "rwabicuma"] }
       ]
     },
     nyaruguru: {
       sectors: [
         { value: "cyahinda", label: "Cyahinda", cells: ["cyahinda", "kibeho", "mata", "munini", "ruheru"] },
         { value: "kibeho", label: "Kibeho", cells: ["cyahinda", "kibeho", "mata", "munini", "ruheru"] },
         { value: "mata", label: "Mata", cells: ["cyahinda", "kibeho", "mata", "munini", "ruheru"] },
         { value: "munini", label: "Munini", cells: ["cyahinda", "kibeho", "mata", "munini", "ruheru"] },
         { value: "ngera", label: "Ngera", cells: ["ngera", "kibeho", "mata", "munini", "ruheru"] },
         { value: "ngoma", label: "Ngoma", cells: ["ngoma", "kibeho", "mata", "munini", "ruheru"] },
         { value: "nyabimata", label: "Nyabimata", cells: ["nyabimata", "kibeho", "mata", "munini", "ruheru"] },
         { value: "ruheru", label: "Ruheru", cells: ["cyahinda", "kibeho", "mata", "munini", "ruheru"] },
         { value: "rusenge", label: "Rusenge", cells: ["rusenge", "kibeho", "mata", "munini", "ruheru"] },
         { value: "rwabicuma", label: "Rwabicuma", cells: ["rwabicuma", "kibeho", "mata", "munini", "ruheru"] }
       ]
     },
     ruhango: {
       sectors: [
         { value: "bweramana", label: "Bweramana", cells: ["bweramana", "kabagali", "kinazi", "mbuye", "ntongwe"] },
         { value: "byimana", label: "Byimana", cells: ["byimana", "kabagali", "kinazi", "mbuye", "ntongwe"] },
         { value: "kabagali", label: "Kabagali", cells: ["bweramana", "kabagali", "kinazi", "mbuye", "ntongwe"] },
         { value: "kinazi", label: "Kinazi", cells: ["bweramana", "kabagali", "kinazi", "mbuye", "ntongwe"] },
         { value: "kinihira", label: "Kinihira", cells: ["kinihira", "kabagali", "kinazi", "mbuye", "ntongwe"] },
         { value: "mbuye", label: "Mbuye", cells: ["bweramana", "kabagali", "kinazi", "mbuye", "ntongwe"] },
         { value: "ntongwe", label: "Ntongwe", cells: ["bweramana", "kabagali", "kinazi", "mbuye", "ntongwe"] },
         { value: "ruhango", label: "Ruhango", cells: ["ruhango", "kabagali", "kinazi", "mbuye", "ntongwe"] }
       ]
     },
     // Western Province districts
     karongi: {
       sectors: [
         { value: "bwishyura", label: "Bwishyura", cells: ["bwishyura", "gashari", "mutuntu", "rugabano", "rwankuba"] },
         { value: "gashari", label: "Gashari", cells: ["bwishyura", "gashari", "mutuntu", "rugabano", "rwankuba"] },
         { value: "gitesi", label: "Gitesi", cells: ["gitesi", "gashari", "mutuntu", "rugabano", "rwankuba"] },
         { value: "murambi", label: "Murambi", cells: ["murambi", "gashari", "mutuntu", "rugabano", "rwankuba"] },
         { value: "mutuntu", label: "Mutuntu", cells: ["bwishyura", "gashari", "mutuntu", "rugabano", "rwankuba"] },
         { value: "rugabano", label: "Rugabano", cells: ["bwishyura", "gashari", "mutuntu", "rugabano", "rwankuba"] },
         { value: "ruganda", label: "Ruganda", cells: ["ruganda", "gashari", "mutuntu", "rugabano", "rwankuba"] },
         { value: "rwankuba", label: "Rwankuba", cells: ["bwishyura", "gashari", "mutuntu", "rugabano", "rwankuba"] }
       ]
     },
     ngororero: {
       sectors: [
         { value: "bwira", label: "Bwira", cells: ["bwira", "gaseke", "hindiro", "kageyo", "sovu"] },
         { value: "gaseke", label: "Gaseke", cells: ["bwira", "gaseke", "hindiro", "kageyo", "sovu"] },
         { value: "hindiro", label: "Hindiro", cells: ["bwira", "gaseke", "hindiro", "kageyo", "sovu"] },
         { value: "kageyo", label: "Kageyo", cells: ["bwira", "gaseke", "hindiro", "kageyo", "sovu"] },
         { value: "kavumu", label: "Kavumu", cells: ["kavumu", "gaseke", "hindiro", "kageyo", "sovu"] },
         { value: "matyazo", label: "Matyazo", cells: ["matyazo", "gaseke", "hindiro", "kageyo", "sovu"] },
         { value: "muhororo", label: "Muhororo", cells: ["muhororo", "gaseke", "hindiro", "kageyo", "sovu"] },
         { value: "ndaro", label: "Ndaro", cells: ["ndaro", "gaseke", "hindiro", "kageyo", "sovu"] },
         { value: "nyange", label: "Nyange", cells: ["nyange", "gaseke", "hindiro", "kageyo", "sovu"] },
         { value: "sovu", label: "Sovu", cells: ["bwira", "gaseke", "hindiro", "kageyo", "sovu"] }
       ]
     },
     nyabihu: {
       sectors: [
         { value: "bigogwe", label: "Bigogwe", cells: ["bigogwe", "jenda", "karago", "mukamira", "rambura"] },
         { value: "jenda", label: "Jenda", cells: ["bigogwe", "jenda", "karago", "mukamira", "rambura"] },
         { value: "jomba", label: "Jomba", cells: ["jomba", "jenda", "karago", "mukamira", "rambura"] },
         { value: "karago", label: "Karago", cells: ["bigogwe", "jenda", "karago", "mukamira", "rambura"] },
         { value: "kintobo", label: "Kintobo", cells: ["kintobo", "jenda", "karago", "mukamira", "rambura"] },
         { value: "mukamira", label: "Mukamira", cells: ["bigogwe", "jenda", "karago", "mukamira", "rambura"] },
         { value: "musasa", label: "Musasa", cells: ["musasa", "jenda", "karago", "mukamira", "rambura"] },
         { value: "rambura", label: "Rambura", cells: ["bigogwe", "jenda", "karago", "mukamira", "rambura"] },
         { value: "rugera", label: "Rugera", cells: ["rugera", "jenda", "karago", "mukamira", "rambura"] },
         { value: "shyira", label: "Shyira", cells: ["shyira", "jenda", "karago", "mukamira", "rambura"] }
       ]
     },
     nyamasheke: {
       sectors: [
         { value: "bushekeri", label: "Bushekeri", cells: ["bushekeri", "cyato", "gihombo", "kanjongo", "ruharambuga"] },
         { value: "bushenge", label: "Bushenge", cells: ["bushenge", "cyato", "gihombo", "kanjongo", "ruharambuga"] },
         { value: "cyato", label: "Cyato", cells: ["bushekeri", "cyato", "gihombo", "kanjongo", "ruharambuga"] },
         { value: "gihombo", label: "Gihombo", cells: ["bushekeri", "cyato", "gihombo", "kanjongo", "ruharambuga"] },
         { value: "kagano", label: "Kagano", cells: ["kagano", "cyato", "gihombo", "kanjongo", "ruharambuga"] },
         { value: "kanjongo", label: "Kanjongo", cells: ["bushekeri", "cyato", "gihombo", "kanjongo", "ruharambuga"] },
         { value: "karambi", label: "Karambi", cells: ["karambi", "cyato", "gihombo", "kanjongo", "ruharambuga"] },
         { value: "karengera", label: "Karengera", cells: ["karengera", "cyato", "gihombo", "kanjongo", "ruharambuga"] },
         { value: "kirimbi", label: "Kirimbi", cells: ["kirimbi", "cyato", "gihombo", "kanjongo", "ruharambuga"] },
         { value: "macuba", label: "Macuba", cells: ["macuba", "cyato", "gihombo", "kanjongo", "ruharambuga"] },
         { value: "mahembe", label: "Mahembe", cells: ["mahembe", "cyato", "gihombo", "kanjongo", "ruharambuga"] },
         { value: "rangiro", label: "Rangiro", cells: ["rangiro", "cyato", "gihombo", "kanjongo", "ruharambuga"] },
         { value: "ruharambuga", label: "Ruharambuga", cells: ["bushekeri", "cyato", "gihombo", "kanjongo", "ruharambuga"] }
       ]
     },
     rusizi: {
       sectors: [
         { value: "butare", label: "Butare", cells: ["butare", "gashonga", "kamembe", "muganza", "nzahaha"] },
         { value: "bugarama", label: "Bugarama", cells: ["bugarama", "gashonga", "kamembe", "muganza", "nzahaha"] },
         { value: "gashonga", label: "Gashonga", cells: ["butare", "gashonga", "kamembe", "muganza", "nzahaha"] },
         { value: "gikundamvura", label: "Gikundamvura", cells: ["gikundamvura", "gashonga", "kamembe", "muganza", "nzahaha"] },
         { value: "gisuma", label: "Gisuma", cells: ["gisuma", "gashonga", "kamembe", "muganza", "nzahaha"] },
         { value: "kamembe", label: "Kamembe", cells: ["butare", "gashonga", "kamembe", "muganza", "nzahaha"] },
         { value: "muganza", label: "Muganza", cells: ["butare", "gashonga", "kamembe", "muganza", "nzahaha"] },
         { value: "mururu", label: "Mururu", cells: ["mururu", "gashonga", "kamembe", "muganza", "nzahaha"] },
         { value: "nkombo", label: "Nkombo", cells: ["nkombo", "gashonga", "kamembe", "muganza", "nzahaha"] },
         { value: "nkungu", label: "Nkungu", cells: ["nkungu", "gashonga", "kamembe", "muganza", "nzahaha"] },
         { value: "nyakabuye", label: "Nyakabuye", cells: ["nyakabuye", "gashonga", "kamembe", "muganza", "nzahaha"] },
         { value: "nyakarenzo", label: "Nyakarenzo", cells: ["nyakarenzo", "gashonga", "kamembe", "muganza", "nzahaha"] },
         { value: "nzahaha", label: "Nzahaha", cells: ["butare", "gashonga", "kamembe", "muganza", "nzahaha"] },
         { value: "rwimbogo", label: "Rwimbogo", cells: ["rwimbogo", "gashonga", "kamembe", "muganza", "nzahaha"] }
       ]
     },
     rutsiro: {
       sectors: [
         { value: "boneza", label: "Boneza", cells: ["boneza", "gihango", "kigeyo", "manihira", "ruhango"] },
         { value: "gihango", label: "Gihango", cells: ["boneza", "gihango", "kigeyo", "manihira", "ruhango"] },
         { value: "kigeyo", label: "Kigeyo", cells: ["boneza", "gihango", "kigeyo", "manihira", "ruhango"] },
         { value: "kivumu", label: "Kivumu", cells: ["kivumu", "gihango", "kigeyo", "manihira", "ruhango"] },
         { value: "manihira", label: "Manihira", cells: ["boneza", "gihango", "kigeyo", "manihira", "ruhango"] },
         { value: "mushonyi", label: "Mushonyi", cells: ["mushonyi", "gihango", "kigeyo", "manihira", "ruhango"] },
         { value: "mushubati", label: "Mushubati", cells: ["mushubati", "gihango", "kigeyo", "manihira", "ruhango"] },
         { value: "nyabirasi", label: "Nyabirasi", cells: ["nyabirasi", "gihango", "kigeyo", "manihira", "ruhango"] },
         { value: "ruhango", label: "Ruhango", cells: ["boneza", "gihango", "kigeyo", "manihira", "ruhango"] }
       ]
     }
   };

  // Remove old administrative division functions - using new comprehensive data now

  // File upload handler
  const handleFileUpload = (documentType: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (file) {
      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        alert('File size must be less than 10MB');
        return;
      }

      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        alert('Only PDF, JPG, PNG, DOC, and DOCX files are allowed');
        return;
      }

      setFiles(prev => ({
        ...prev,
        [documentType]: file
      }));

      // Update form value
      form.setValue(documentType as any, file);
    }
  };

  // Remove file handler
  const handleFileRemove = (documentType: string) => {
    setFiles(prev => ({
      ...prev,
      [documentType]: null
    }));
    form.setValue(documentType as any, null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="border-gray-200 dark:border-gray-800">
        <CardHeader>
          <CardTitle>Water Permit Application Form</CardTitle>
          <CardDescription>
            Fill out all required fields to submit your water permit application. Your progress is automatically saved every 30 seconds as a draft.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Beautiful Error Banner */}
          {validationError?.show && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6"
            >
              <Alert className="border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <AlertTitle className="text-red-800 dark:text-red-200 font-semibold">
                  {validationError.message}
                </AlertTitle>
                <AlertDescription className="text-red-700 dark:text-red-300 mt-2">
                  <div className="space-y-2">
                    <p className="text-sm">
                      Please complete the following required fields in the <strong>{validationError.tab}</strong> tab:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-2">
                      {validationError.missingFields.map((field, index) => (
                        <li key={index} className="text-red-600 dark:text-red-400">
                          {field}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setValidationError(null)}
                    className="mt-3 h-8 text-red-700 hover:text-red-800 hover:bg-red-100 dark:text-red-300 dark:hover:text-red-200 dark:hover:bg-red-900"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Dismiss
                  </Button>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Auto-save Status Indicator */}
          <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                {autoSaveStatus === 'saving' && (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-blue-600">Auto-saving...</span>
                  </>
                )}
                {autoSaveStatus === 'saved' && (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-600">Auto-saved</span>
                  </>
                )}
                {autoSaveStatus === 'error' && (
                  <>
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm text-red-600">Auto-save failed</span>
                  </>
                )}
                {autoSaveStatus === 'idle' && lastAutoSave && (
                  <>
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-500">
                      Last saved: {lastAutoSave.toLocaleTimeString()}
                    </span>
                  </>
                )}
                {autoSaveStatus === 'idle' && !lastAutoSave && (
                  <>
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-500">Auto-save enabled (every 30s)</span>
                  </>
                )}
              </div>
            </div>
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={triggerAutoSave}
              disabled={autoSaveStatus === 'saving'}
              className="text-xs"
            >
              Save Now
            </Button>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit, handleFormError)} className="space-y-6">
              <Tabs defaultValue="personal" value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="personal">Personal</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="location">Location</TabsTrigger>
                  <TabsTrigger value="project">Project</TabsTrigger>
                  <TabsTrigger value="technical">Technical</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                </TabsList>
                
                <TabsContent value="personal" className="pt-6">
                  <CardTitle className="text-lg mb-2">Applicant Information</CardTitle>
                  <CardDescription className="mb-6">
                    Your personal information is populated from your profile. To update these details, please visit your profile settings.
                  </CardDescription>
                  
                  {/* Basic Contact Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                      <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                              <Input {...field} disabled />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                          <FormLabel>Email Address</FormLabel>
                            <FormControl>
                            <Input type="email" {...field} disabled />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone Number</FormLabel>
                            <FormControl>
                              <Input {...field} disabled />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address</FormLabel>
                            <FormControl>
                              <Input {...field} disabled />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                  {userData?.account_type === 'organization' && (
                    <div className="mb-8">
                      <FormField
                        control={form.control}
                        name="nameRepresentative"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organization Representative Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter representative's full name" />
                            </FormControl>
                            <FormDescription>
                              Required for organization applications.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                    
                  {/* Enhanced Contact Information */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg space-y-6 mb-8">
                    <h4 className="text-lg font-medium text-blue-800 dark:text-blue-200">
                      Enhanced Contact Information
                    </h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Additional contact details for official correspondence and alternative contact person.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="poBox"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>P.O. Box (Optional)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="P.O. Box number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="mobilePhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mobile Phone (Optional)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="+250 xxx xxx xxx" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="landlinePhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Landline Phone (Optional)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="+250 xxx xxx xxx" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {/* TIN/NID Display (Read-only from Account) */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          {userData?.account_type === 'individual' ? 'National ID Number' : 'TIN (Tax Identification Number)'}
                        </Label>
                        <div className="flex items-center space-x-2">
                          <Input
                            value={userData?.account_type === 'individual' ? userData?.id_number || 'Not provided' : userData?.company_tin || 'Not provided'}
                            disabled
                            className="bg-muted"
                          />
                          <Badge variant="secondary" className="text-xs">
                            Verified
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          This information was verified during account registration and cannot be changed here.
                        </p>
                      </div>
                    </div>
                    
                    {/* Certificate Information (for Legal Entities) */}
                    {userData?.account_type !== 'individual' && (
                      <div className="bg-white dark:bg-gray-800 p-4 rounded border border-blue-200 dark:border-blue-800 mb-4">
                        <h5 className="font-medium text-blue-800 dark:text-blue-200 mb-4">Legal Certificate Information</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="certificateType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Certificate Type (Optional)</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select certificate type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="business_registration">Business Registration Certificate</SelectItem>
                                    <SelectItem value="cooperative_certificate">Cooperative Certificate</SelectItem>
                                    <SelectItem value="ngo_certificate">NGO Registration Certificate</SelectItem>
                                    <SelectItem value="institution_license">Institution License</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="certificateNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Certificate Number (Optional)</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Certificate/license number" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Alternative Contact Person */}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded border border-blue-200 dark:border-blue-800">
                      <h5 className="font-medium text-blue-800 dark:text-blue-200 mb-4">Alternative Contact Person</h5>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
                        Provide details of an alternative contact person who can be reached regarding this application.
                      </p>
                      
                      <div className="space-y-6">
                        {/* Basic Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="alternativeContactName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Full Name (Optional)</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Alternative contact person" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                            name="alternativeContactIdNumber"
                          render={({ field }) => (
                            <FormItem>
                                <FormLabel>ID Number (Optional)</FormLabel>
                              <FormControl>
                                  <Input {...field} placeholder="National ID number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        </div>
                        
                        {/* Contact Information */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                            name="alternativeContactMobilePhone"
                          render={({ field }) => (
                            <FormItem>
                                <FormLabel>Mobile Phone (Optional)</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="+250 xxx xxx xxx" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                          
                          <FormField
                            control={form.control}
                            name="alternativeContactLandlinePhone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Landline Phone (Optional)</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="+250 xxx xxx xxx" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="alternativeContactEmail"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email (Optional)</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="email@example.com" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Address Information */}
                        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded">
                          <h6 className="font-medium text-gray-800 dark:text-gray-200 mb-3">Address Information</h6>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <FormField
                              control={form.control}
                              name="alternativeContactProvince"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Province (Optional)</FormLabel>
                                  <Select value={field.value} onValueChange={field.onChange}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select province" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="kigali">Kigali</SelectItem>
                                      <SelectItem value="northern">Northern</SelectItem>
                                      <SelectItem value="southern">Southern</SelectItem>
                                      <SelectItem value="eastern">Eastern</SelectItem>
                                      <SelectItem value="western">Western</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="alternativeContactDistrict"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>District (Optional)</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="District" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="alternativeContactSector"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Sector (Optional)</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Sector" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="alternativeContactCell"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Cell (Optional)</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Cell" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="alternativeContactVillage"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Village (Optional)</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Village" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                    
                  <div className="flex justify-between pt-6">
                    <Button 
                      type="button" 
                      variant="outline" 
                      disabled={isLoading}
                      onClick={handleSaveAsDraft}
                      className="flex items-center gap-2 px-6"
                    >
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          Save as Draft
                        </>
                      )}
                    </Button>
                    <Button type="button" onClick={() => {
                      if (validatePersonalInfo()) {
                        setValidationError(null);
                        setActiveTab("details");
                      }
                    }} className="px-6">
                      Next: Permit Details
                    </Button>
                  </div>
                </TabsContent>
                
                <TabsContent value="details" className="pt-6">
                  <div className="space-y-8">
                    {/* Main Header */}
                    <div className="text-center pb-2">
                      <CardTitle className="text-2xl mb-2">Permit & Water Details</CardTitle>
                      <CardDescription className="text-base">
                        Provide comprehensive details about your water permit application and usage requirements.
                      </CardDescription>
                    </div>

                    {/* Permit Information Section */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-6 rounded-xl border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                          <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">Permit Information</h3>
                          <p className="text-sm text-blue-700 dark:text-blue-300">Basic permit application details</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="permitType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-blue-900 dark:text-blue-100">Permit Type</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger className="bg-white dark:bg-gray-800">
                                    <SelectValue placeholder="Select a permit type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="new">New Permit</SelectItem>
                                  <SelectItem value="renewal">Renewal</SelectItem>
                                  <SelectItem value="modification">Modification</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="applicantType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-blue-900 dark:text-blue-100">Applicant Type</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger className="bg-white dark:bg-gray-800">
                                    <SelectValue placeholder="Select an applicant type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="domestic">Domestic</SelectItem>
                                  <SelectItem value="commercial">Commercial</SelectItem>
                                  <SelectItem value="industrial">Industrial</SelectItem>
                                  <SelectItem value="agricultural">Agricultural</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Water Source & Usage Section */}
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-6 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg">
                          <Droplet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">Water Source & Usage</h3>
                          <p className="text-sm text-emerald-700 dark:text-emerald-300">Water source identification and usage requirements</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="waterSource"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-emerald-900 dark:text-emerald-100">Water Source</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger className="bg-white dark:bg-gray-800">
                                    <SelectValue placeholder="Select water source" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="groundwater">Groundwater</SelectItem>
                                  <SelectItem value="surface_water">Surface Water</SelectItem>
                                  <SelectItem value="river">River</SelectItem>
                                  <SelectItem value="lake">Lake</SelectItem>
                                  <SelectItem value="stream">Stream</SelectItem>
                                  <SelectItem value="spring">Spring</SelectItem>
                                  <SelectItem value="borehole">Borehole</SelectItem>
                                  <SelectItem value="dam">Dam</SelectItem>
                                  <SelectItem value="reservoir">Reservoir</SelectItem>
                                  <SelectItem value="wetland">Wetland</SelectItem>
                                  <SelectItem value="swamp">Swamp</SelectItem>
                                  <SelectItem value="hydropower_source">Hydropower Source</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="purpose"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-emerald-900 dark:text-emerald-100">Purpose of Water Use</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger className="bg-white dark:bg-gray-800">
                                    <SelectValue placeholder="Select a purpose" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="irrigation">Irrigation</SelectItem>
                                  <SelectItem value="livestock">Livestock</SelectItem>
                                  <SelectItem value="fish_farming_lakes">Aquaculture</SelectItem>
                                  <SelectItem value="hydropower">Hydropower</SelectItem>
                                  <SelectItem value="electricity_generation">Electricity Generation</SelectItem>
                                  <SelectItem value="industrial">Industrial Use</SelectItem>
                                  <SelectItem value="mining">Mining</SelectItem>
                                  <SelectItem value="domestic">Water Supply</SelectItem>
                                  <SelectItem value="commercial">Commercial Use</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription className="text-emerald-700 dark:text-emerald-300">
                                Refer to the checklist and provide all required information corresponding to the proposed use.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="waterUsage"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-emerald-900 dark:text-emerald-100">Water Usage Amount</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  className="bg-white dark:bg-gray-800"
                                  placeholder="Enter amount"
                                  {...field}
                                  onChange={e => field.onChange(parseInt(e.target.value, 10))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="waterUsageUnit"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-emerald-900 dark:text-emerald-100">Unit</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger className="bg-white dark:bg-gray-800">
                                    <SelectValue placeholder="Select a unit" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="m3_per_day">m³/day</SelectItem>
                                  <SelectItem value="m3_per_hour">m³/hour</SelectItem>
                                  <SelectItem value="liters_per_sec">liters/sec</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="mt-4 p-3 bg-emerald-100/50 dark:bg-emerald-900/20 rounded-lg">
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">
                          💧 <strong>Note:</strong> Specify the quantity of water to be taken if for consumptive use.
                        </p>
                      </div>
                    </div>

                    {/* Conditional Specialized Fields */}
                    {shouldShowIndustryFields() && (
                      <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 p-6 rounded-xl border border-orange-200 dark:border-orange-800">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-lg">
                            <Building className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100">Industrial Specifications</h3>
                            <p className="text-sm text-orange-700 dark:text-orange-300">Specific requirements for industrial water use</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="industryType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-orange-900 dark:text-orange-100">Type of Industry</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ""}>
                                  <FormControl>
                                    <SelectTrigger className="bg-white dark:bg-gray-800">
                                      <SelectValue placeholder="Select industry type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="manufacturing">Manufacturing</SelectItem>
                                    <SelectItem value="food_processing">Food Processing</SelectItem>
                                    <SelectItem value="textile">Textile</SelectItem>
                                    <SelectItem value="chemical">Chemical</SelectItem>
                                    <SelectItem value="pharmaceutical">Pharmaceutical</SelectItem>
                                    <SelectItem value="cement">Cement</SelectItem>
                                    <SelectItem value="paper_pulp">Paper & Pulp</SelectItem>
                                    <SelectItem value="steel">Steel</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    )}

                    {shouldShowElectricityFields() && (
                      <div className="bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 p-6 rounded-xl border border-purple-200 dark:border-purple-800">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                            <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">Power Generation Specifications</h3>
                            <p className="text-sm text-purple-700 dark:text-purple-300">Hydropower and electricity generation details</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="powerGenerationType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-purple-900 dark:text-purple-100">Power Generation Type</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ""}>
                                  <FormControl>
                                    <SelectTrigger className="bg-white dark:bg-gray-800">
                                      <SelectValue placeholder="Select generation type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="run_of_river">Run-of-River</SelectItem>
                                    <SelectItem value="reservoir">Reservoir</SelectItem>
                                    <SelectItem value="pumped_storage">Pumped Storage</SelectItem>
                                    <SelectItem value="micro_hydro">Micro Hydro</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="installedCapacity"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-purple-900 dark:text-purple-100">Installed Capacity (MW)</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    className="bg-white dark:bg-gray-800"
                                    placeholder="e.g., 10.5"
                                    value={field.value || ""}
                                    onChange={e => {
                                      const value = e.target.value;
                                      field.onChange(value === "" ? undefined : parseFloat(value));
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    )}

                    {shouldShowMiningFields() && (
                      <div className="bg-gradient-to-r from-stone-50 to-gray-50 dark:from-stone-900/20 dark:to-gray-900/20 p-6 rounded-xl border border-stone-200 dark:border-stone-800">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="p-2 bg-stone-100 dark:bg-stone-900/40 rounded-lg">
                            <Mountain className="h-5 w-5 text-stone-600 dark:text-stone-400" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Mining Operations</h3>
                            <p className="text-sm text-stone-700 dark:text-stone-300">Mining and extraction operation details</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="miningType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-stone-900 dark:text-stone-100">Mining Type</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ""}>
                                  <FormControl>
                                    <SelectTrigger className="bg-white dark:bg-gray-800">
                                      <SelectValue placeholder="Select mining type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="surface">Surface Mining</SelectItem>
                                    <SelectItem value="underground">Underground Mining</SelectItem>
                                    <SelectItem value="placer">Placer Mining</SelectItem>
                                    <SelectItem value="quarrying">Quarrying</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="mineralType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-stone-900 dark:text-stone-100">Mineral Type</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ""}>
                                  <FormControl>
                                    <SelectTrigger className="bg-white dark:bg-gray-800">
                                      <SelectValue placeholder="Select mineral type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="gold">Gold</SelectItem>
                                    <SelectItem value="tin">Tin</SelectItem>
                                    <SelectItem value="tungsten">Tungsten</SelectItem>
                                    <SelectItem value="tantalum">Tantalum</SelectItem>
                                    <SelectItem value="limestone">Limestone</SelectItem>
                                    <SelectItem value="clay">Clay</SelectItem>
                                    <SelectItem value="sand">Sand</SelectItem>
                                    <SelectItem value="gravel">Gravel</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    )}
                    {/* Water Source Details Section */}
                    <div className="bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 p-6 rounded-xl border border-cyan-200 dark:border-cyan-800">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-cyan-100 dark:bg-cyan-900/40 rounded-lg">
                          <MapPin className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-cyan-900 dark:text-cyan-100">Water Source Details</h3>
                          <p className="text-sm text-cyan-700 dark:text-cyan-300">Detailed information about the water source and its characteristics</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="waterBodyName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-cyan-900 dark:text-cyan-100">Water Body Name (Optional)</FormLabel>
                              <FormControl>
                                <Input {...field} className="bg-white dark:bg-gray-800" placeholder="Name of river, lake, stream, etc." />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="tributaryTo"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-cyan-900 dark:text-cyan-100">Tributary Name (Optional)</FormLabel>
                              <FormControl>
                                <Input {...field} className="bg-white dark:bg-gray-800" placeholder="Name of tributary if applicable" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="catchmentNameLevel1"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-cyan-900 dark:text-cyan-100">Catchment Level 1 (Optional)</FormLabel>
                              <FormControl>
                                <Input {...field} className="bg-white dark:bg-gray-800" placeholder="Primary catchment area" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="catchmentNameLevel2"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-cyan-900 dark:text-cyan-100">Catchment Level 2 (Optional)</FormLabel>
                              <FormControl>
                                <Input {...field} className="bg-white dark:bg-gray-800" placeholder="Secondary catchment area" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="waterReliability"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-cyan-900 dark:text-cyan-100">Water Reliability (Optional)</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger className="bg-white dark:bg-gray-800">
                                    <SelectValue placeholder="Select water reliability" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="always_available">Always Available</SelectItem>
                                  <SelectItem value="frequently_dry">Frequently Dry</SelectItem>
                                  <SelectItem value="seasonal_dry">Seasonal Dry</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="waterVolumeDischarge"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-cyan-900 dark:text-cyan-100">Natural Discharge Volume (m³) (Optional)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="0.01"
                                  className="bg-white dark:bg-gray-800"
                                  placeholder="Natural flow volume"
                                  value={field.value || ""}
                                  onChange={e => {
                                    const value = e.target.value;
                                    field.onChange(value === "" ? undefined : parseFloat(value));
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center pt-6">
                    <Button 
                      type="button" 
                      variant="outline" 
                      disabled={isLoading}
                      onClick={handleSaveAsDraft}
                      className="flex items-center gap-2 px-6"
                    >
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          Save as Draft
                        </>
                      )}
                    </Button>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => setActiveTab("personal")} className="px-6">
                        Previous: Personal Info
                      </Button>
                      <Button type="button" onClick={() => {
                        if (validatePermitDetails()) {
                          setValidationError(null);
                          setActiveTab("location");
                        }
                      }} className="px-6">
                        Next: Location
                      </Button>
                    </div>
                  </div>

                  {/* Bulk applicants only: district + network rows */}
                  {isBulkApplicant && (
                    <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 p-6 rounded-xl border border-violet-200 dark:border-violet-800 space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-violet-100 dark:bg-violet-900/40 rounded-lg">
                          <Building className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-violet-900 dark:text-violet-100">Water Supply Networks</h3>
                          <p className="text-sm text-violet-700 dark:text-violet-300">All networks share the selected district</p>
                        </div>
                      </div>
                      <div className="max-w-xs">
                        <label className="block text-sm font-medium text-violet-900 dark:text-violet-100 mb-2">
                          District <span className="text-red-500">*</span>
                        </label>
                        <Select value={bulkDistrict} onValueChange={setBulkDistrict}>
                          <SelectTrigger className="bg-white dark:bg-gray-800">
                            <SelectValue placeholder="Select district" />
                          </SelectTrigger>
                          <SelectContent>
                            {getFormattedDistrictOptions("").map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <BulkNetworksTable rows={bulkNetworks} onChange={setBulkNetworks} mode="editable" />
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="location" className="pt-6">
                  <CardTitle className="text-lg mb-2">Project Location</CardTitle>
                  <CardDescription className="mb-6">
                    Provide the location details for your project.
                  </CardDescription>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="province"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Province</FormLabel>
                            <FormControl>
                              <Select 
                                key={`province-${field.value || 'empty'}`}
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  setSelectedProvince(value);
                                // Reset dependent fields when province changes
                                  form.setValue("district", "");
                                  form.setValue("sector", "");
                                  form.setValue("cell", "");
                                }} 
                                value={field.value || ""}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select province" />
                                </SelectTrigger>
                                <SelectContent>
                                <SelectItem value="kigali">Kigali</SelectItem>
                                  <SelectItem value="northern">Northern Province</SelectItem>
                                  <SelectItem value="southern">Southern Province</SelectItem>
                                <SelectItem value="eastern">Eastern Province</SelectItem>
                                <SelectItem value="western">Western Province</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="district"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>District</FormLabel>
                            <FormControl>
                              <Select 
                                key={`district-${field.value || 'empty'}`}
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  setSelectedDistrict(value);
                                  // Reset dependent fields when district changes
                                  form.setValue("sector", "");
                                  form.setValue("cell", "");
                                }} 
                                value={field.value || ""}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select district" />
                                </SelectTrigger>
                                <SelectContent>
                                {getDistrictOptions().map((district) => (
                                    <SelectItem key={district.value} value={district.value}>
                                      {district.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="sector"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sector</FormLabel>
                            <FormControl>
                              <Select 
                                key={`sector-${field.value || 'empty'}`}
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  // Reset cell field when sector changes
                                  form.setValue("cell", "");
                                }} 
                                value={field.value || ""}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select sector" />
                                </SelectTrigger>
                                <SelectContent>
                                  {getSectorOptions().map((sector) => (
                                    <SelectItem key={sector.value} value={sector.value}>
                                      {sector.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="cell"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cell</FormLabel>
                            <FormControl>
                              <Select 
                                key={`cell-${field.value || 'empty'}`}
                                onValueChange={field.onChange} 
                                value={field.value || ""}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select cell" />
                                </SelectTrigger>
                                <SelectContent>
                                  {getCellOptions().map((cell) => (
                                    <SelectItem key={cell.value} value={cell.value}>
                                      {cell.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    
                        <FormField
                          control={form.control}
                          name="latitude"
                          render={({ field }) => (
                            <FormItem>
                          <FormLabel>Latitude</FormLabel>
                              <FormControl>
                            <Input {...field} placeholder="e.g., -1.9441" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="longitude"
                          render={({ field }) => (
                            <FormItem>
                          <FormLabel>Longitude</FormLabel>
                              <FormControl>
                            <Input {...field} placeholder="e.g., 30.0619" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                  <div className="mt-6">
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2"
                      onClick={handleGetLocation}
                    >
                      <MapPin className="h-4 w-4" />
                      Get Current Location
                    </Button>
                  </div>
                  
                  <div className="flex justify-between items-center pt-6">
                    <Button 
                      type="button" 
                      variant="outline" 
                      disabled={isLoading}
                      onClick={handleSaveAsDraft}
                      className="flex items-center gap-2 px-6"
                    >
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          Save as Draft
                        </>
                      )}
                    </Button>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => setActiveTab("details")} className="px-6">
                        Previous: Permit Details
                      </Button>
                      <Button type="button" onClick={() => {
                        if (validateLocation()) {
                          setValidationError(null);
                          setActiveTab("project");
                        }
                      }} className="px-6">
                        Next: Project Info
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="project" className="pt-6">
                  <CardTitle className="text-lg mb-2">Project Information</CardTitle>
                  <CardDescription className="mb-6">
                    Describe your project in detail.
                  </CardDescription>
                  <div className="space-y-6">
                    <FormField
                      control={form.control}
                      name="projectTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Project Title</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="projectDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Project Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              rows={5}
                              placeholder="Provide a detailed description of your project and how you plan to use the water resources"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="flex justify-between items-center pt-6">
                    <Button 
                      type="button" 
                      variant="outline" 
                      disabled={isLoading}
                      onClick={handleSaveAsDraft}
                      className="flex items-center gap-2 px-6"
                    >
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          Save as Draft
                        </>
                      )}
                    </Button>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => setActiveTab("location")} className="px-6">
                        Previous: Location
                      </Button>
                      <Button type="button" onClick={() => {
                        if (validateProject()) {
                          setValidationError(null);
                          setActiveTab("technical");
                        }
                      }} className="px-6">
                        Next: Technical Details
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="technical" className="pt-6">
                  <CardTitle className="text-lg mb-2">Technical Details</CardTitle>
                  <CardDescription className="mb-6">
                    Provide the technical specifications for your water usage plan.
                  </CardDescription>
                  <div className="space-y-6">
                    <FormField
                      control={form.control}
                      name="concessionDuration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Proposed Duration of Concession</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select duration" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1_year">1 Year</SelectItem>
                              <SelectItem value="2_years">2 Years</SelectItem>
                              <SelectItem value="3_years">3 Years</SelectItem>
                              <SelectItem value="5_years">5 Years</SelectItem>
                              <SelectItem value="10_years">10 Years</SelectItem>
                              <SelectItem value="15_years">15 Years</SelectItem>
                              <SelectItem value="20_years">20 Years</SelectItem>
                              <SelectItem value="25_years">25 Years</SelectItem>
                              <SelectItem value="other">Other (specify in project description)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="waterTakingMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Method of Water Taking</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select method of water taking" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="pumping_system">Abstraction by Pumping System</SelectItem>
                              <SelectItem value="diversion">Diversion</SelectItem>
                              <SelectItem value="water_flow_diversion">Water Flow Diversion</SelectItem>
                              <SelectItem value="gravity_flow">Gravity Flow</SelectItem>
                              <SelectItem value="borehole">Borehole/Well</SelectItem>
                              <SelectItem value="dam">Dam</SelectItem>
                              <SelectItem value="weir">Weir</SelectItem>
                              <SelectItem value="intake_structure">Intake Structure</SelectItem>
                              <SelectItem value="other">Other (specify in project description)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* Water Flow Diversion Specific Fields */}
                    {shouldShowDiversionFields() && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg space-y-6">
                        <h4 className="text-lg font-medium text-blue-800 dark:text-blue-200">
                          Water Flow Diversion Details
                        </h4>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          Required for water flow diversion only - Maps showing location of intake and discharges
                        </p>
                        
                        {/* Intake Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <FormField
                            control={form.control}
                            name="intakeLocation"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Intake Location</FormLabel>
                                <FormControl>
                                  <Input placeholder="Point of diversion" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="intakeFlow"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Intake Flow (m³/s)</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    step="0.01"
                                    placeholder="Flow rate"
                                    value={field.value || ""}
                                    onChange={e => {
                                      const value = e.target.value;
                                      field.onChange(value === "" ? undefined : parseFloat(value));
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="intakeLatitude"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Intake Latitude</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g., -1.9441" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="intakeLongitude"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Intake Longitude</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g., 30.0619" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="intakeElevation"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Intake Elevation (m)</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number"
                                    placeholder="Elevation"
                                    value={field.value || ""}
                                    onChange={e => {
                                      const value = e.target.value;
                                      field.onChange(value === "" ? undefined : parseFloat(value));
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                      </div>
                      
                        {/* Discharge Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <FormField
                            control={form.control}
                            name="dischargeLocation"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Discharge Location</FormLabel>
                                <FormControl>
                                  <Input placeholder="Point of discharge" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="dischargeFlow"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Discharge Flow (m³/s)</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    step="0.01"
                                    placeholder="Flow rate"
                                    value={field.value || ""}
                                    onChange={e => {
                                      const value = e.target.value;
                                      field.onChange(value === "" ? undefined : parseFloat(value));
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="dischargeLatitude"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Discharge Latitude</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g., -1.9441" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="dischargeLongitude"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Discharge Longitude</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g., 30.0619" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="dischargeElevation"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Discharge Elevation (m)</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number"
                                    placeholder="Elevation"
                                    value={field.value || ""}
                                    onChange={e => {
                                      const value = e.target.value;
                                      field.onChange(value === "" ? undefined : parseFloat(value));
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        {/* Stream Level and Structure Configuration */}
                        <FormField
                          control={form.control}
                          name="streamLevelVariations"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Stream Level at Different Seasonal Flows</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Describe stream level variations during different seasons and flow conditions"
                                  {...field}
                                  rows={3}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="diversionStructureConfig"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Diversion Structure Configuration</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Show direction, velocities, detailed sizes and configuration of diversion structures"
                                  {...field}
                                  rows={3}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name="waterMeasuringMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Method of Measuring Water Quantity</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select measuring method" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="flow_meter">Flow Meter</SelectItem>
                              <SelectItem value="water_meter">Water Meter</SelectItem>
                              <SelectItem value="weir_measurement">Weir Measurement</SelectItem>
                              <SelectItem value="pump_capacity">Pump Capacity Calculation</SelectItem>
                              <SelectItem value="tank_volume">Tank Volume Measurement</SelectItem>
                              <SelectItem value="manual_gauge">Manual Gauge Reading</SelectItem>
                              <SelectItem value="automated_monitoring">Automated Monitoring System</SelectItem>
                              <SelectItem value="other">Other (specify in project description)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="storageFacilities"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Storage Facilities (if proposed)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select storage facility type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">No Storage Facilities</SelectItem>
                                <SelectItem value="reservoir">Reservoir</SelectItem>
                                <SelectItem value="tanks">Tanks</SelectItem>
                                <SelectItem value="pond">Pond</SelectItem>
                                <SelectItem value="dam">Dam</SelectItem>
                                <SelectItem value="underground_storage">Underground Storage</SelectItem>
                                <SelectItem value="multiple">Multiple Storage Types</SelectItem>
                                <SelectItem value="other">Other (specify in project description)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {shouldShowStorageFields() && (
                        <FormField
                          control={form.control}
                          name="storageCapacity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Storage Capacity (m³)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  placeholder="Total capacity"
                                  value={field.value || ""}
                                  onChange={e => {
                                    const value = e.target.value;
                                    field.onChange(value === "" ? undefined : parseFloat(value));
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    {/* Pipes, Materials, and Fixtures Section */}
                    <div className="bg-gray-50 dark:bg-gray-900/20 p-6 rounded-lg space-y-6">
                      <h4 className="text-lg font-medium">Pipes, Materials, and Fixtures</h4>
                          <p className="text-sm text-muted-foreground">
                        Submit drawings/plans including sizes, materials, pipes and fixtures. Include pump capacity and water storage facilities.
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="pipeDetails"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Pipe Details</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Describe pipe sizes, materials, and routing"
                                  {...field}
                                  rows={3}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="pumpCapacity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Pump Capacity (if applicable)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  placeholder="Pump capacity in m³/h"
                                  value={field.value || ""}
                                  onChange={e => {
                                    const value = e.target.value;
                                    field.onChange(value === "" ? undefined : parseFloat(value));
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="valveDetails"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Valve Specifications</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Describe valves, types, and locations"
                                  {...field}
                                  rows={2}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="meterDetails"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Meter Specifications</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Describe meters, types, and accuracy"
                                  {...field}
                                  rows={2}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="backflowControlDevices"
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Backflow Control Devices</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Describe backflow prevention devices and their specifications"
                                  {...field}
                                  rows={2}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                          />
                        </div>
                        </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="returnFlowQuantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Return Flow Quantity</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                placeholder="e.g., 50 (in m³/day)" 
                                value={field.value || ""}
                                onChange={e => {
                                  const value = e.target.value;
                                  field.onChange(value === "" ? undefined : parseInt(value, 10));
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="returnFlowQuality"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Return Flow Quality</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select quality" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">No Return Flow</SelectItem>
                                <SelectItem value="untreated">Untreated</SelectItem>
                                <SelectItem value="primary_treated">Primary Treated</SelectItem>
                                <SelectItem value="secondary_treated">Secondary Treated</SelectItem>
                                <SelectItem value="tertiary_treated">Tertiary Treated</SelectItem>
                                <SelectItem value="fully_treated">Fully Treated</SelectItem>
                                <SelectItem value="other">Other (specify in project description)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="potentialEffects"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Potential Effects of Proposed Activity</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe any potential positive or adverse effects on the environment, water resources, or community"
                              {...field}
                              rows={4}
                            />
                          </FormControl>
                          <FormDescription>
                            Consider effects on water quality, quantity, ecosystem, downstream users, etc.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="mitigationActions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mitigation Actions</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe specific actions to avoid, remedy, or mitigate any adverse effects identified above"
                              {...field}
                              rows={4}
                            />
                          </FormControl>
                          <FormDescription>
                            Include monitoring plans, treatment measures, restoration activities, etc.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="flex justify-between items-center pt-6">
                    <Button 
                      type="button" 
                      variant="outline" 
                      disabled={isLoading}
                      onClick={handleSaveAsDraft}
                      className="flex items-center gap-2 px-6"
                    >
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          Save as Draft
                        </>
                      )}
                    </Button>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => setActiveTab("project")} className="px-6">
                        Previous: Project Info
                      </Button>
                      <Button type="button" onClick={() => {
                        if (validateTechnical()) {
                          setValidationError(null);
                          setActiveTab("documents");
                        }
                      }} className="px-6">
                        Next: Documents
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="documents" className="pt-6">
                  <CardTitle className="text-lg mb-2">Required Documents</CardTitle>
                  <CardDescription className="mb-6">
                    Upload all required documents for your application. All documents must be in PDF, JPG, PNG, DOC, or DOCX format and under 10MB.
                  </CardDescription>
                  
                  <div className="space-y-6">
                    {/* Payment Proof */}
                    <div className="space-y-3">
                      <Label htmlFor="paymentProof" className="text-base font-medium text-emerald-900 dark:text-emerald-100">
                        Proof of Payment <span className="text-red-500">*</span>
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Upload proof of application fee payment (bank receipt, mobile money receipt, etc.)
                      </p>
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 hover:border-emerald-400 transition-colors">
                        {files.paymentProof ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <FileText className="h-8 w-8 text-emerald-600" />
                              <div>
                                <p className="font-medium">{files.paymentProof.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {(files.paymentProof.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleFileRemove('paymentProof')}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <label htmlFor="paymentProof" className="cursor-pointer block">
                            <div className="text-center">
                              <Upload className="mx-auto h-12 w-12 text-gray-400" />
                              <div className="mt-4">
                                <span className="mt-2 block text-sm font-medium text-gray-900 dark:text-gray-100">
                                  Click to upload payment proof
                                </span>
                              </div>
                            </div>
                            <input
                              id="paymentProof"
                              type="file"
                              className="hidden"
                              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                              onChange={handleFileUpload('paymentProof')}
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Identification Document */}
                    <div className="space-y-3">
                      <Label htmlFor="identificationDoc" className="text-base font-medium text-emerald-900 dark:text-emerald-100">
                        Identification Document <span className="text-red-500">*</span>
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Upload a copy of your National ID
                      </p>
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 hover:border-emerald-400 transition-colors">
                        {files.identificationDoc ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <FileText className="h-8 w-8 text-emerald-600" />
                              <div>
                                <p className="font-medium">{files.identificationDoc.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {(files.identificationDoc.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleFileRemove('identificationDoc')}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <label htmlFor="identificationDoc" className="cursor-pointer block">
                            <div className="text-center">
                              <Upload className="mx-auto h-12 w-12 text-gray-400" />
                              <div className="mt-4">
                                <span className="mt-2 block text-sm font-medium text-gray-900 dark:text-gray-100">
                                  Click to upload identification document
                                </span>
                              </div>
                            </div>
                            <input
                              id="identificationDoc"
                              type="file"
                              className="hidden"
                              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                              onChange={handleFileUpload('identificationDoc')}
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {!isBulkApplicant && (
                    <>{/* Land Ownership Document */}
                    <div className="space-y-3">
                      <Label htmlFor="landOwnershipDoc" className="text-base font-medium text-emerald-900 dark:text-emerald-100">
                        Land Ownership Document
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Upload land title, lease agreement, or permission letter from land owner
                      </p>
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 hover:border-emerald-400 transition-colors">
                        {files.landOwnershipDoc ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <FileText className="h-8 w-8 text-emerald-600" />
                              <div>
                                <p className="font-medium">{files.landOwnershipDoc.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {(files.landOwnershipDoc.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleFileRemove('landOwnershipDoc')}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <label htmlFor="landOwnershipDoc" className="cursor-pointer block">
                            <div className="text-center">
                              <Upload className="mx-auto h-12 w-12 text-gray-400" />
                              <div className="mt-4">
                                <span className="mt-2 block text-sm font-medium text-gray-900 dark:text-gray-100">
                                  Click to upload land ownership document
                                </span>
                              </div>
                            </div>
                            <input
                              id="landOwnershipDoc"
                              type="file"
                              className="hidden"
                              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                              onChange={handleFileUpload('landOwnershipDoc')}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                    </>)}

                    {/* Technical Drawings */}
                    <div className="space-y-3">
                      <Label htmlFor="technicalDrawings" className="text-base font-medium text-emerald-900 dark:text-emerald-100">
                        Technical Drawings/Plans
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Upload project plans, technical drawings, or engineering designs
                      </p>
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 hover:border-emerald-400 transition-colors">
                        {files.technicalDrawings ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <FileText className="h-8 w-8 text-emerald-600" />
                              <div>
                                <p className="font-medium">{files.technicalDrawings.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {(files.technicalDrawings.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleFileRemove('technicalDrawings')}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <label htmlFor="technicalDrawings" className="cursor-pointer block">
                            <div className="text-center">
                              <Upload className="mx-auto h-12 w-12 text-gray-400" />
                              <div className="mt-4">
                                <span className="mt-2 block text-sm font-medium text-gray-900 dark:text-gray-100">
                                  Click to upload technical drawings
                                </span>
                              </div>
                            </div>
                            <input
                              id="technicalDrawings"
                              type="file"
                              className="hidden"
                              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                              onChange={handleFileUpload('technicalDrawings')}
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Environmental Impact Document */}
                    <div className="space-y-3">
                      <Label htmlFor="environmentalImpactDoc" className="text-base font-medium text-emerald-900 dark:text-emerald-100">
                        Environmental Impact Assessment
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Upload environmental impact assessment or environmental management plan (if applicable)
                      </p>
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 hover:border-emerald-400 transition-colors">
                        {files.environmentalImpactDoc ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <FileText className="h-8 w-8 text-emerald-600" />
                              <div>
                                <p className="font-medium">{files.environmentalImpactDoc.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {(files.environmentalImpactDoc.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleFileRemove('environmentalImpactDoc')}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <label htmlFor="environmentalImpactDoc" className="cursor-pointer block">
                            <div className="text-center">
                              <Upload className="mx-auto h-12 w-12 text-gray-400" />
                              <div className="mt-4">
                                <span className="mt-2 block text-sm font-medium text-gray-900 dark:text-gray-100">
                                  Click to upload environmental impact document
                                </span>
                              </div>
                            </div>
                            <input
                              id="environmentalImpactDoc"
                              type="file"
                              className="hidden"
                              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                              onChange={handleFileUpload('environmentalImpactDoc')}
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Intake/Discharge Map (for water flow diversion) */}
                    {shouldShowDiversionFields() && (
                      <div className="space-y-3">
                        <Label htmlFor="intakeDischargeMap" className="text-base font-medium text-emerald-900 dark:text-emerald-100">
                          Intake/Discharge Location Map <span className="text-red-500">*</span>
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Upload map showing intake and discharge locations (Required for water flow diversion projects)
                        </p>
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 hover:border-emerald-400 transition-colors">
                          {files.intakeDischargeMap ? (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <FileText className="h-8 w-8 text-emerald-600" />
                                <div>
                                  <p className="font-medium">{files.intakeDischargeMap.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {(files.intakeDischargeMap.size / 1024 / 1024).toFixed(2)} MB
                                  </p>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleFileRemove('intakeDischargeMap')}
                                className="text-red-600 hover:text-red-700"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                                                     ) : (
                             <label htmlFor="intakeDischargeMap" className="cursor-pointer block">
                               <div className="text-center">
                                 <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                 <div className="mt-4">
                                   <span className="mt-2 block text-sm font-medium text-gray-900 dark:text-gray-100">
                                     Click to upload intake/discharge map
                                   </span>
                                 </div>
                               </div>
                               <input
                                 id="intakeDischargeMap"
                                 type="file"
                                 className="hidden"
                                 accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                 onChange={handleFileUpload('intakeDischargeMap')}
                               />
                             </label>
                           )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-6">
                    <Button 
                      type="button" 
                      variant="outline" 
                      disabled={isLoading}
                      onClick={handleSaveAsDraft}
                      className="flex items-center gap-2 px-6"
                    >
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          Save as Draft
                        </>
                      )}
                    </Button>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => setActiveTab("technical")} className="px-6">
                        Previous: Technical Details
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={isLoading}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-8"
                      >
                        {isLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Submit Application
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </form>
          </Form>
        </CardContent>
      </Card>
    </motion.div>
  );
} 