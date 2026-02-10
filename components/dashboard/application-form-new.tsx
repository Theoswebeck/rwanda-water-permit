"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Card,
  CardContent,
  CardDescription,
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
import { Upload, X, FileText, Check, AlertCircle, Save, Send, User, Globe, Factory, Droplet, CheckCircle, XCircle, Eye, CreditCard, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  getFormattedProvinceOptions,
  getFormattedDistrictOptions,
  getFormattedSectorOptions,
  getFormattedCellOptions,
  getFormattedVillageOptions
} from '@/lib/rwanda-administrative-data';
import { validatePolygons, type ValidationResponse } from '@/lib/polygonValidation';
import { isValidCoordinate, isWithinRwanda } from "@/lib/geoUtils";
import { getAnnexRequirementForActivity, getAnnexRequirementsForSelection } from "@/lib/annex-requirements";
import { ModificationBadge, ModificationChangesSummary } from "@/components/dashboard/modified-field-marker";

// Lazy-load heavy tab components to avoid module-eval crashes on pages that never render them (e.g. view-only / terms acceptance).
const PaymentTab = dynamic(
  () => import("@/components/dashboard/payment-tab").then((mod) => ({ default: mod.PaymentTab })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Loading payment…
      </div>
    ),
  }
);

const MultiPolygonInputWithValidation = dynamic(
  () =>
    import("@/components/forms/MultiPolygonInputWithValidation").then((mod) => ({
      default: mod.MultiPolygonInputWithValidation,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  }
);

// Form schema based on the exact structure from NEW_WATER_PERMIT_APPLICATION_FORM.md
const applicationFormSchema = z.object({
  // SECTION 1: IDENTIFICATION AND ADDRESS OF THE APPLICANT
  fullNameApplicant: z.string().min(2, { message: "Full name is required" }),
  categoryApplicant: z.enum(["individual", "company", "cooperative", "organization", "institution", "ngo_association", "other"]),
  categoryApplicantOther: z.string().optional(),
  nameRepresentative: z.string().optional(),
  
  // Office Address
  officeProvince: z.string().min(1, { message: "Province is required" }),
  officeDistrict: z.string().min(1, { message: "District is required" }),
  officeSector: z.string().min(1, { message: "Sector is required" }),
  officeCell: z.string().min(1, { message: "Cell is required" }),
  officeVillage: z.string().optional(),
  officeCountry: z.string().optional(),
  officePostalAddress: z.string().optional(),
  
  // Contact Information
  telephoneContact: z.string().min(10, { message: "Telephone is required" }),
  telephoneContactOffice: z.string().optional(),
  emailAddress: z.string().email({ message: "Valid email is required" }),
  nationalIdNumber: z.string().optional(),
  
  // SECTION 2: SOURCE OF WATER
  waterSourceType: z.enum(["lake", "dam", "spring", "borehole", "stream_river", "other"]).or(z.literal("")),
  waterSourceOther: z.string().optional(),
  nameSourceWater: z.string().min(1, { message: "Water source name is required" }),
  tributaryToMain: z.string().optional(),
  
  // Location of water source
  waterSourceProvince: z.string().min(1, { message: "Water source province is required" }),
  waterSourceDistrict: z.string().min(1, { message: "Water source district is required" }),
  waterSourceSector: z.string().min(1, { message: "Water source sector is required" }),
  waterSourceCell: z.string().min(1, { message: "Water source cell is required" }),
  waterSourceVillage: z.string().optional(),
  
  // Water abstraction point (LAT/LONG) - used for non-concession activities
  waterSourceLatitude: z.string().optional(),
  waterSourceLongitude: z.string().optional(),
  
  // Water activity polygons (multiple polygons, variable points) - optional, required only for fish farming
  waterSourcePolygons: z.array(
    z.array(
      z.object({
        latitude: z.string().min(1, { message: "Latitude is required" }),
        longitude: z.string().min(1, { message: "Longitude is required" })
      })
    ).min(4, { message: "Each polygon must have at least 4 coordinate points" })
  ).optional(),
  
  // Reliability
  waterReliability: z.enum(["water_always_available", "frequently_dry", "dry_during_certain_season"]),
  
  // Permit Length (1-15 years)
  permitLengthYears: z.number().min(1).max(15).optional(),
  
  // SECTION 3: INTENDED ACTIVITY
  intendedActivities: z.array(z.string()).min(1, { message: "Select an activity" }).max(1, { message: "Only one activity can be selected per application" }),
  intendedActivityOther: z.string().optional(),
  
  // Water Abstraction - optional, required only for abstraction activities
  waterAbstractionDetails: z.array(z.object({
    flowRate: z.string().optional(),
    flowRateUnit: z.string().optional(),
    maxAverageYearly: z.number().optional(),
    abstractionMethod: z.string().optional(),
  })).optional(),
  
  // Water Concession (for Aquaculture)
  concessionArea: z.number().optional(),
  concessionAreaUnit: z.string().optional(),
  permitPeriod: z.string().optional(),
  
  // SECTION 4: OWNERSHIP OF ADJOINING LAND
  ownsAllLand: z.boolean(),
  hasLandAccess: z.boolean().optional(),
  
  // SECTION 5: PAYMENT INFORMATION (removed per RWB request)
  
  // Water Supply Details (structured fields)
  waterSupplyPopulation: z.number().optional(),
  waterSupplyPerCapitaDemand: z.number().optional(),
  waterSupplyTotalDailyDemand: z.number().optional(),
  waterSupplyDailyAbstraction: z.number().optional(),
  waterSupplyStorageCapacity: z.number().optional(),

  // ANNEXES
  annexA_irrigationDetails: z.string().optional(),
  annexB_waterSupplyDetails: z.string().optional(),
  annexC_aquacultureDetails: z.string().optional(),
  annexD_coffeeWashingDetails: z.string().optional(),
  annexE_industryDetails: z.string().optional(),
  // Industry table data (structured)
  industryDetails: z.array(z.object({
    industryType: z.string(),
    dailyQuantity: z.number().optional(),
    monthlyQuantity: z.number().optional(),
  })).optional(),
  annexF_electricityDetails: z.string().optional(),
  annexG_miningDetails: z.string().optional(),
  annexH_constructionDetails: z.string().optional(),
  annexI_navigationDetails: z.string().optional(),
  annexJ_recreationDetails: z.string().optional(),
  annexK_otherDetails: z.string().optional(),
  // ANNEX G (Mining) structured fields
  miningQuantityPerDay: z.string().optional(),
  miningQuantityPerMonth: z.string().optional(),
  miningMineralsType: z.string().optional(),
  miningProductionCapacityTonsPerYear: z.number().optional(),

  // Fish farming (replacing Aquaculture)
  fishLakeAreaHectares: z.number().optional(),
  fishLakeNumberOfCages: z.number().optional(),
  fishLakeCageCapacity: z.number().optional(),
  fishLakeConcessionCoordinates: z.string().optional(),
  fishPondsDiscardWaterQuantityM3PerDay: z.number().optional(),
  
  // Irrigation specific fields
  irrigationCropType: z.string().optional(),
  irrigationGrowingSeasonFrom: z.string().optional(),
  irrigationGrowingSeasonTo: z.string().optional(),
  irrigationProductionSystem: z.string().optional(),
  irrigationMethod: z.string().optional(),
  irrigationTotalArea: z.number().optional(),
  irrigationWaterDemand: z.number().optional(),
  irrigationStorageFacilities: z.string().optional(),
  irrigationStorageCapacity: z.number().optional(),
  
  // Core application documents
  identificationDoc: z.any().optional(),
  paymentProof: z.any().optional(),
  landOwnershipDoc: z.any().optional(),
  technicalDrawings: z.any().optional(),
  environmentalImpactDoc: z.any().optional(),
  feasibilityStudy: z.any().optional(),
  intakeDischargeMap: z.any().optional(),
  
  // Activity-specific documents
  // Irrigation
  irrigationGeneralRequirements: z.any().optional(),
  irrigationEIA: z.any().optional(),
  irrigationFeasibilityStudy: z.any().optional(),
  
  // Water Supply
  waterSupplyGeneralRequirements: z.any().optional(),
  waterSupplyFeasibilityStudy: z.any().optional(),
  
  // Mining
  miningGeneralRequirements: z.any().optional(),
  miningLicense: z.any().optional(),
  miningEIA: z.any().optional(),
  miningHydrologicalReport: z.any().optional(),
  
  // Aquaculture
  aquacultureGeneralRequirements: z.any().optional(),
  aquacultureEIA: z.any().optional(),
  aquacultureManagementPlan: z.any().optional(),
  aquacultureRecommendationLetter: z.any().optional(),
  aquaculturePolygonAreaMap: z.any().optional(),
  aquacultureHydrologicalReport: z.any().optional(),
  
  // Coffee Washing
  coffeeWashingGeneralRequirements: z.any().optional(),
  coffeeWashingEIA: z.any().optional(),
  coffeeWashingHydrologicalReport: z.any().optional(),
  
  // Industrial
  industrialGeneralRequirements: z.any().optional(),
  industrialEIA: z.any().optional(),
  industrialWasteManagementPlan: z.any().optional(),
  industrialHydrologicalReport: z.any().optional(),
  
  // Hydropower/Electricity
  hydropowerGeneralRequirements: z.any().optional(),
  hydropowerEIA: z.any().optional(),
  hydropowerFeasibilityStudy: z.any().optional(),
  
  // Construction Dam
  constructionDamGeneralRequirements: z.any().optional(),
  constructionDamEIA: z.any().optional(),
  constructionDamEngineeringPlans: z.any().optional(),
  constructionDamFeasibilityStudy: z.any().optional(),
  
  // Infrastructure
  infrastructureGeneralRequirements: z.any().optional(),
  infrastructureEIA: z.any().optional(),
  infrastructureEngineeringPlans: z.any().optional(),
  infrastructureFeasibilityStudy: z.any().optional(),
  
  // Navigation
  navigationGeneralRequirements: z.any().optional(),
  navigationEIA: z.any().optional(),
  navigationManagementPlan: z.any().optional(),
  
  // Recreation
  recreationGeneralRequirements: z.any().optional(),
  recreationEIA: z.any().optional(),
  recreationManagementPlan: z.any().optional(),
  recreationPolygonAreaMap: z.any().optional(),

  // Gaz extraction
  gazExtractionGeneralRequirements: z.any().optional(),
  gazExtractionEIA: z.any().optional(),
  gazExtractionFeasibilityStudy: z.any().optional(),

  // Livestock
  livestockGeneralRequirements: z.any().optional(),
  livestockFeasibilityStudy: z.any().optional(),
  
  // Additional/Custom documents (extensible)
  additionalDocuments: z.array(z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    description: z.string().optional(),
    file: z.any().optional()
  })).optional(),
  
  // CERTIFICATION
  certificationAgreement: z.boolean().refine((val) => val === true, {
    message: "You must certify the information is accurate"
  }),
}).superRefine((data, ctx) => {
  // Conditional validation based on activity type
  // Note: This validation only runs on form submission, not on individual tab validation
  const selectedActivities = Array.isArray(data.intendedActivities) ? data.intendedActivities : [];
  if (!selectedActivities.length) return; // No validation if no activity selected
  
  // Single activity selection is enforced by schema (.max(1))
  // No need to check for mixing concession and abstraction activities

  const hasFishFarming =
    selectedActivities.includes("fish_farming_lakes") || selectedActivities.includes("fish_farming_ponds");
  
  if (hasFishFarming) {
    // For fish farming, polygons are required (but only validated on Activity tab or final submission)
    // Don't block if polygons are empty - let tab-specific validation handle it
    if (data.waterSourcePolygons && data.waterSourcePolygons.length > 0) {
      // Only validate format if polygons are provided
      const hasValidPolygons = data.waterSourcePolygons.every((poly: any) => {
        return (
          Array.isArray(poly) &&
          poly.length >= 4 &&
          poly.every((coord: any) => 
            coord?.latitude?.toString().trim() !== "" && 
            coord?.longitude?.toString().trim() !== ""
          )
        );
      });
      
      if (!hasValidPolygons) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["waterSourcePolygons"],
          message: "Each polygon must have at least 4 complete coordinate points."
        });
      }
    }
  }

    // For abstraction activities, validate LAT/LONG format if provided (but don't require them here)
  // (Any non-fish-farming activity implies abstraction point can be required by tab validation.)
  const hasNonFishActivity = selectedActivities.some((a) => a && a !== "fish_farming_lakes" && a !== "fish_farming_ponds");
  if (hasNonFishActivity) {
    // Tab-specific validation will handle the requirement
    const latitude = String(data.waterSourceLatitude ?? "").trim();
    const longitude = String(data.waterSourceLongitude ?? "").trim();
    
    // Only validate format if values are provided
    if (latitude && longitude) {
      // First check if values are valid numbers
      const latNum = parseFloat(latitude);
      const lngNum = parseFloat(longitude);
      
      if (isNaN(latNum) || isNaN(lngNum)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["waterSourceLatitude"],
          message: "Latitude must be a valid number."
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["waterSourceLongitude"],
          message: "Longitude must be a valid number."
        });
        return;
      }
      
      const point = { latitude, longitude };
      if (!isValidCoordinate(point)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["waterSourceLatitude"],
          message: `Invalid latitude. Must be between -90 and 90. Current value: ${latNum.toFixed(6)}`
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["waterSourceLongitude"],
          message: `Invalid longitude. Must be between -180 and 180. Current value: ${lngNum.toFixed(6)}`
        });
        return;
      }
      
      // Check if within Rwanda boundaries using existing polygon verification
      if (!isWithinRwanda(point)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["waterSourceLatitude"],
          message: `Coordinates (${latNum.toFixed(6)}, ${lngNum.toFixed(6)}) are outside Rwanda boundaries. Please enter coordinates within Rwanda.`
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["waterSourceLongitude"],
          message: `Coordinates (${latNum.toFixed(6)}, ${lngNum.toFixed(6)}) are outside Rwanda boundaries. Please enter coordinates within Rwanda.`
        });
      }
    }
  }
});

type FormValues = z.infer<typeof applicationFormSchema>;

// Utility function to compute modification changes between original and current form data
function computeModificationChanges(
  originalData: Partial<FormValues> | undefined,
  currentData: FormValues
): Record<string, { previous: any; current: any }> {
  if (!originalData) return {};
  
  const changes: Record<string, { previous: any; current: any }> = {};
  
  // Fields to compare (excluding files and computed fields)
  const fieldsToCompare: (keyof FormValues)[] = [
    'fullNameApplicant',
    'categoryApplicant',
    'nameRepresentative',
    'officeProvince',
    'officeDistrict',
    'officeSector',
    'officeCell',
    'officeVillage',
    'telephoneContact',
    'telephoneContactOffice',
    'emailAddress',
    'nationalIdNumber',
    'waterSourceType',
    'nameSourceWater',
    'tributaryToMain',
    'waterSourceProvince',
    'waterSourceDistrict',
    'waterSourceSector',
    'waterSourceCell',
    'waterSourceVillage',
    'waterSourceLatitude',
    'waterSourceLongitude',
    'waterReliability',
    'permitLengthYears',
    'intendedActivities',
    'concessionArea',
    'ownsAllLand',
    'hasLandAccess',
    'waterSupplyPopulation',
    'waterSupplyPerCapitaDemand',
    'waterSupplyTotalDailyDemand',
    'waterSupplyDailyAbstraction',
    'waterSupplyStorageCapacity',
    'irrigationTotalArea',
    'irrigationCropType',
    'irrigationWaterDemand',
    'irrigationMethod',
    'irrigationStorageCapacity',
  ];
  
  for (const field of fieldsToCompare) {
    const originalValue = originalData[field];
    const currentValue = currentData[field];
    
    // Deep comparison for arrays and objects
    const originalStr = JSON.stringify(originalValue ?? '');
    const currentStr = JSON.stringify(currentValue ?? '');
    
    if (originalStr !== currentStr) {
      changes[field] = {
        previous: originalValue,
        current: currentValue
      };
    }
  }
  
  return changes;
}

// Field labels for display in modification markers
const FIELD_LABELS: Record<string, string> = {
  fullNameApplicant: 'Full Name',
  categoryApplicant: 'Applicant Category',
  nameRepresentative: 'Representative Name',
  officeProvince: 'Office Province',
  officeDistrict: 'Office District',
  officeSector: 'Office Sector',
  officeCell: 'Office Cell',
  officeVillage: 'Office Village',
  telephoneContact: 'Telephone',
  telephoneContactOffice: 'Office Telephone',
  emailAddress: 'Email Address',
  nationalIdNumber: 'National ID',
  waterSourceType: 'Water Source Type',
  nameSourceWater: 'Water Source Name',
  tributaryToMain: 'Tributary',
  waterSourceProvince: 'Water Source Province',
  waterSourceDistrict: 'Water Source District',
  waterSourceSector: 'Water Source Sector',
  waterSourceCell: 'Water Source Cell',
  waterSourceVillage: 'Water Source Village',
  waterSourceLatitude: 'Latitude',
  waterSourceLongitude: 'Longitude',
  waterReliability: 'Water Reliability',
  permitLengthYears: 'Permit Duration',
  intendedActivities: 'Intended Activities',
  concessionArea: 'Concession Area',
  ownsAllLand: 'Owns All Land',
  hasLandAccess: 'Has Land Access',
  waterSupplyPopulation: 'Population Served',
  waterSupplyPerCapitaDemand: 'Per Capita Demand',
  waterSupplyTotalDailyDemand: 'Total Daily Demand',
  waterSupplyDailyAbstraction: 'Daily Abstraction',
  waterSupplyStorageCapacity: 'Storage Capacity',
  irrigationTotalArea: 'Total Irrigation Area',
  irrigationCropType: 'Crop Type',
  irrigationWaterDemand: 'Water Demand',
  irrigationMethod: 'Irrigation Method',
  irrigationStorageCapacity: 'Storage Capacity',
};

interface ApplicationFormProps {
  userData: any;
  onSubmit: (data: FormValues, status: 'submitted') => void | Promise<void>;
  onSaveAsDraft: (data: FormValues, status: 'draft', draftId?: string | null) => Promise<any>;
  isLoading: boolean;
  initialData?: Partial<FormValues>;
  initialDocuments?: Record<string, { url: string; name: string }>;
  mode?: 'create' | 'edit' | 'view';
  readOnly?: boolean;
  currentApplication?: any; // The saved application object (needed for payment tab)
  isStaffView?: boolean; // True for review/assessment/approver views - hides payment tab
  isModification?: boolean; // True when modifying an existing permit
  originalApplicationData?: Partial<FormValues>; // Original data for comparison (modification mode)
  modificationChanges?: Record<string, { previous: any; current: any }>; // Stored changes from DB (staff view)
}

export function ApplicationForm({ 
  userData, 
  onSubmit, 
  onSaveAsDraft, 
  isLoading, 
  initialData, 
  initialDocuments = {},
  mode = 'create',
  readOnly = false,
  currentApplication,
  isStaffView = false,
  isModification = false,
  originalApplicationData,
  modificationChanges
}: ApplicationFormProps) {
  const router = useRouter();
  const { userProfile, isApplicant } = useAuth();
  const [activeTab, setActiveTab] = useState("applicant-info");
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  const [paymentPrepError, setPaymentPrepError] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [uploadedFileUrls, setUploadedFileUrls] = useState<Record<string, string>>({});

  const formatPolygonCoordinatesForDisplay = useCallback((coords?: Array<{ latitude: string; longitude: string }>) => {
    if (!coords || !Array.isArray(coords) || coords.length === 0) return "";
    const pairs = coords
      .filter((c) => c && typeof c.latitude === "string" && typeof c.longitude === "string")
      .map((c) => `${c.latitude},${c.longitude}`)
      .filter(Boolean);
    return pairs.join("; ");
  }, []);
  
  // ⚡ PERFORMANCE: Memoize location states to reduce re-renders
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  
  // Polygon validation state
  const [coordinateValidation, setCoordinateValidation] = useState<ValidationResponse | null>(null);
  const [canSubmit, setCanSubmit] = useState(true);
  
  const fileInputRefs = {
    identificationDoc: useRef<HTMLInputElement>(null),
    landOwnershipDoc: useRef<HTMLInputElement>(null),
    landAccessDocuments: useRef<HTMLInputElement>(null),
    technicalDrawings: useRef<HTMLInputElement>(null),
    environmentalImpactDoc: useRef<HTMLInputElement>(null),
    feasibilityStudy: useRef<HTMLInputElement>(null),
    miningLicense: useRef<HTMLInputElement>(null),
    miningEIA: useRef<HTMLInputElement>(null),
    miningHydrologicalReport: useRef<HTMLInputElement>(null),
    miningGeneralRequirements: useRef<HTMLInputElement>(null),
    // Irrigation documents
    irrigationGeneralRequirements: useRef<HTMLInputElement>(null),
    irrigationEIA: useRef<HTMLInputElement>(null),
    irrigationFeasibilityStudy: useRef<HTMLInputElement>(null),
    // Water Supply documents
    waterSupplyGeneralRequirements: useRef<HTMLInputElement>(null),
    waterSupplyFeasibilityStudy: useRef<HTMLInputElement>(null),
    // Aquaculture documents
    aquacultureGeneralRequirements: useRef<HTMLInputElement>(null),
    aquacultureEIA: useRef<HTMLInputElement>(null),
    aquacultureManagementPlan: useRef<HTMLInputElement>(null),
    aquacultureRecommendationLetter: useRef<HTMLInputElement>(null),
    aquaculturePolygonAreaMap: useRef<HTMLInputElement>(null),
    aquacultureHydrologicalReport: useRef<HTMLInputElement>(null),
    // Coffee Washing documents
    coffeeWashingGeneralRequirements: useRef<HTMLInputElement>(null),
    coffeeWashingEIA: useRef<HTMLInputElement>(null),
    coffeeWashingHydrologicalReport: useRef<HTMLInputElement>(null),
    // Industrial documents
    industrialGeneralRequirements: useRef<HTMLInputElement>(null),
    industrialEIA: useRef<HTMLInputElement>(null),
    industrialWasteManagementPlan: useRef<HTMLInputElement>(null),
    industrialHydrologicalReport: useRef<HTMLInputElement>(null),
    // Hydropower documents
    hydropowerGeneralRequirements: useRef<HTMLInputElement>(null),
    hydropowerEIA: useRef<HTMLInputElement>(null),
    hydropowerFeasibilityStudy: useRef<HTMLInputElement>(null),
    // Construction of Dam documents
    constructionDamGeneralRequirements: useRef<HTMLInputElement>(null),
    constructionDamEIA: useRef<HTMLInputElement>(null),
    constructionDamEngineeringPlans: useRef<HTMLInputElement>(null),
    constructionDamFeasibilityStudy: useRef<HTMLInputElement>(null),
    // Infrastructure Construction documents
    infrastructureGeneralRequirements: useRef<HTMLInputElement>(null),
    infrastructureEIA: useRef<HTMLInputElement>(null),
    infrastructureEngineeringPlans: useRef<HTMLInputElement>(null),
    infrastructureFeasibilityStudy: useRef<HTMLInputElement>(null),
    // Recreation documents
    recreationGeneralRequirements: useRef<HTMLInputElement>(null),
    recreationEIA: useRef<HTMLInputElement>(null),
    recreationManagementPlan: useRef<HTMLInputElement>(null),
    recreationPolygonAreaMap: useRef<HTMLInputElement>(null),
    // Navigation documents
    navigationGeneralRequirements: useRef<HTMLInputElement>(null),
    navigationEIA: useRef<HTMLInputElement>(null),
    navigationManagementPlan: useRef<HTMLInputElement>(null),
    // Gaz extraction documents
    gazExtractionGeneralRequirements: useRef<HTMLInputElement>(null),
    gazExtractionEIA: useRef<HTMLInputElement>(null),
    gazExtractionFeasibilityStudy: useRef<HTMLInputElement>(null),
    // Livestock documents
    livestockGeneralRequirements: useRef<HTMLInputElement>(null),
    livestockFeasibilityStudy: useRef<HTMLInputElement>(null),
  };

  // State for cascading dropdowns
  const [selectedOfficeProvince, setSelectedOfficeProvince] = useState("");
  const [selectedOfficeDistrict, setSelectedOfficeDistrict] = useState("");
  const [selectedOfficeSector, setSelectedOfficeSector] = useState("");
  const [selectedOfficeCell, setSelectedOfficeCell] = useState("");
  const [selectedWaterSourceProvince, setSelectedWaterSourceProvince] = useState("");
  const [selectedWaterSourceDistrict, setSelectedWaterSourceDistrict] = useState("");
  const [selectedWaterSourceSector, setSelectedWaterSourceSector] = useState("");
  const [selectedWaterSourceCell, setSelectedWaterSourceCell] = useState("");
  const [selectedOfficeVillage, setSelectedOfficeVillage] = useState("");
  const [selectedWaterSourceVillage, setSelectedWaterSourceVillage] = useState("");

  // ⚡ PERFORMANCE: Memoize default values to prevent recalculation
  const getDefaultValues = useMemo(() => {
    const defaults: Partial<FormValues> = {
      // Ensure all form fields have default values to prevent controlled/uncontrolled errors
      fullNameApplicant: "",
      categoryApplicant: "individual",
      categoryApplicantOther: "",
      nameRepresentative: "",
      officeProvince: "",
      officeDistrict: "",
      officeSector: "",
      officeCell: "",
      officeVillage: "",
      officeCountry: "Rwanda",
      officePostalAddress: "",
      telephoneContact: "",
      telephoneContactOffice: "",
      emailAddress: "",
      nationalIdNumber: "",
      waterSourceType: "",
      waterSourceOther: "",
      nameSourceWater: "",
      tributaryToMain: "",
      waterSourceProvince: "",
      waterSourceDistrict: "",
      waterSourceSector: "",
      waterSourceCell: "",
      waterSourceVillage: "",
      waterSourceLatitude: "",
      waterSourceLongitude: "",
      waterReliability: "water_always_available",
      permitLengthYears: undefined,
      waterAbstractionDetails: [{ flowRate: "", flowRateUnit: "m3_per_second", maxAverageYearly: 0, abstractionMethod: "" }],
      intendedActivities: [],
      intendedActivityOther: "",
      ownsAllLand: false,
      hasLandAccess: false,
      certificationAgreement: false,
      waterSupplyPopulation: 0,
      waterSupplyPerCapitaDemand: 0,
      waterSupplyTotalDailyDemand: 0,
      waterSupplyDailyAbstraction: 0,
      waterSupplyStorageCapacity: 0,
      miningQuantityPerDay: "",
      miningQuantityPerMonth: "",
      miningMineralsType: "",
      miningProductionCapacityTonsPerYear: 0,
      fishLakeAreaHectares: undefined,
      fishLakeNumberOfCages: undefined,
      fishLakeCageCapacity: undefined,
      fishLakeConcessionCoordinates: "",
      fishPondsDiscardWaterQuantityM3PerDay: undefined,
      irrigationCropType: "",
      irrigationGrowingSeasonFrom: "",
      irrigationGrowingSeasonTo: "",
      irrigationProductionSystem: "",
      irrigationMethod: "",
      irrigationTotalArea: 0,
      irrigationWaterDemand: undefined,
      irrigationStorageFacilities: "",
      irrigationStorageCapacity: undefined,
      additionalDocuments: [],
      // Start with a 4-point polygon placeholder to match schema min(4) when polygons are used.
      waterSourcePolygons: [[
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" },
      ]],
    };

    // Auto-fill from current user profile if available
    if (userProfile) {
      if (userProfile.account_type === 'individual') {
        defaults.fullNameApplicant = `${userProfile.first_name || ""} ${userProfile.last_name || ""}`.trim();
        defaults.categoryApplicant = "individual";
      } else if (userProfile.account_type === 'company') {
        defaults.fullNameApplicant = userProfile.company_name || "";
        defaults.categoryApplicant = "company";
        defaults.officeCountry = "Rwanda";
        defaults.officePostalAddress = userProfile.company_address || "";
        defaults.telephoneContactOffice = userProfile.company_phone || "";
      }
      
      defaults.emailAddress = userProfile.email || "";
      defaults.telephoneContact = userProfile.phone || userProfile.company_phone || "";
      
      // Set ID information
      if (userProfile.id_type && userProfile.id_number) {
        if (userProfile.id_type === 'national_id') {
          defaults.nationalIdNumber = userProfile.id_number;
        }
      }
    }

    // Override with any provided initial data
    return { ...defaults, ...initialData };
  }, [initialData, userProfile]);

  const form = useForm<FormValues>({
    // Skip validation resolver in read-only mode - not needed and can cause initialization issues
    resolver: readOnly ? undefined : zodResolver(applicationFormSchema),
    defaultValues: getDefaultValues,
    // Validate when the user leaves a field (click outside / tab away), and re-validate to clear errors.
    mode: "onBlur",
    reValidateMode: "onChange"
  });

  /**
   * Handle payment completion - save application after successful payment
   */
  const handlePaymentComplete = async (paymentId: string) => {
    try {
      console.log('💾 Saving application after payment success...');
      
      // Prepare complete form data
      const formData = {
        ...form.getValues(),
        ...files,
        additionalDocuments
      };
      
      // Call API to save application and link to payment
      const response = await fetch(`/api/payments/${paymentId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ formData }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete payment and save application');
      }

      const result = await response.json();
      console.log('✅ Application saved and linked to payment:', result.application);
      
      return result.application;
    } catch (error) {
      console.error('❌ Failed to complete payment:', error);
      throw error;
    }
  };

  // Helper function to get input props based on readOnly state
  const getInputProps = (baseProps: any = {}) => {
    if (readOnly) {
      return {
        ...baseProps,
        readOnly: true,
        disabled: true,
        className: `${baseProps.className || ''} bg-gray-50 border-gray-200 cursor-default`.trim()
      };
    }
    return baseProps;
  };

  // Helper function to get select props based on readOnly state
  const getSelectProps = (baseProps: any = {}) => {
    if (readOnly) {
      return {
        ...baseProps,
        disabled: true,
        onValueChange: undefined, // Disable value changes in read-only mode
        className: `${baseProps.className || ''} bg-gray-50 border-gray-200 cursor-default opacity-60`.trim()
      };
    }
    return baseProps;
  };

  // Helper functions for dropdown options
  const getOfficeDistrictOptions = () => {
    // Use selected state or fall back to form values for initialization
    const province = selectedOfficeProvince || officeProvince;
    if (!province) return [];
    return getFormattedDistrictOptions(province);
  };

  const getOfficeSectorOptions = () => {
    // Use selected state or fall back to form values for initialization
    const province = selectedOfficeProvince || officeProvince;
    const district = selectedOfficeDistrict || officeDistrict;
    if (!province || !district) return [];
    return getFormattedSectorOptions(province, district);
  };

  const getOfficeCellOptions = () => {
    // Use selected state or fall back to form values for initialization
    const province = selectedOfficeProvince || officeProvince;
    const district = selectedOfficeDistrict || officeDistrict;
    const sector = selectedOfficeSector || officeSector;
    if (!province || !district || !sector) return [];
    return getFormattedCellOptions(province, district, sector);
  };

  const getOfficeVillageOptions = () => {
    // Use selected state or fall back to form values for initialization
    const province = selectedOfficeProvince || officeProvince;
    const district = selectedOfficeDistrict || officeDistrict;
    const sector = selectedOfficeSector || officeSector;
    const cell = selectedOfficeCell || officeCell;
    if (!province || !district || !sector || !cell) return [];
    return getFormattedVillageOptions(province, district, sector, cell);
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

  const getWaterSourceVillageOptions = () => {
    const cell = selectedWaterSourceCell || waterSourceCell;
    if (!selectedWaterSourceProvince || !selectedWaterSourceDistrict || !selectedWaterSourceSector || !cell) return [];
    return getFormattedVillageOptions(selectedWaterSourceProvince, selectedWaterSourceDistrict, selectedWaterSourceSector, cell);
  };

  const watchedCategoryApplicant = form.watch("categoryApplicant");
  const watchedWaterSourceType = form.watch("waterSourceType");
  const watchedIntendedActivities = form.watch("intendedActivities");
  const watchedOwnsAllLand = form.watch("ownsAllLand");
  const watchedCertificationAgreement = form.watch("certificationAgreement");
  const watchedIrrigationTotalArea = form.watch("irrigationTotalArea");
  const [additionalDocuments, setAdditionalDocuments] = useState<Array<{
    id: string;
    name: string;
    category: string;
    description?: string;
    file?: File | null;
  }>>([]);



  // Get form values for cascading dropdowns
  const officeProvince = form.watch('officeProvince');
  const officeDistrict = form.watch('officeDistrict');
  const officeSector = form.watch('officeSector');
  const officeCell = form.watch('officeCell');
  const waterSourceProvince = form.watch('waterSourceProvince');
  const waterSourceDistrict = form.watch('waterSourceDistrict');
  const waterSourceSector = form.watch('waterSourceSector');
  const waterSourceCell = form.watch('waterSourceCell');
  const officeVillage = form.watch('officeVillage');
  const waterSourceVillage = form.watch('waterSourceVillage');

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
    if (officeCell !== selectedOfficeCell) {
      setSelectedOfficeCell(officeCell || "");
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
    if (waterSourceCell !== selectedWaterSourceCell) {
      setSelectedWaterSourceCell(waterSourceCell || "");
    }
    if (officeVillage !== selectedOfficeVillage) {
      setSelectedOfficeVillage(officeVillage || "");
    }
    if (waterSourceVillage !== selectedWaterSourceVillage) {
      setSelectedWaterSourceVillage(waterSourceVillage || "");
    }
  }, [officeProvince, officeDistrict, officeSector, officeCell, officeVillage, waterSourceProvince, waterSourceDistrict, waterSourceSector, waterSourceCell, waterSourceVillage]);

  // Helper function to check if required documents are uploaded
  const checkRequiredDocuments = () => {
    // Always require identification document
    const hasIdentificationDoc = files.identificationDoc || uploadedFileUrls.identificationDoc;
    if (!hasIdentificationDoc) return false;

    const intendedActivities = form.getValues("intendedActivities") || [];
    const irrigationArea = form.getValues("irrigationTotalArea") || 0;

    const requirements = getAnnexRequirementsForSelection(intendedActivities, { irrigationTotalArea: irrigationArea });
    for (const { requirement } of requirements) {
      for (const att of requirement.attachments) {
        const hasFile = Boolean(files[att.fieldName] || uploadedFileUrls[att.fieldName]);
        if (!hasFile) return false;
      }
    }

    return true;
  };

  // Helper function to check land access documents
  const checkLandAccessDocuments = () => {
    const ownsAllLand = form.getValues('ownsAllLand');
    
    // If user does NOT own all required land, proof of access is required.
    if (ownsAllLand === false) {
      return Boolean(files.landAccessDocuments || uploadedFileUrls.landAccessDocuments);
    }
    
    return true;
  };

  // Tab validation functions
  const validateApplicantTab = async () => {
    const fields = [
      'fullNameApplicant', 'categoryApplicant', 'officeProvince', 
      'officeDistrict', 'officeSector', 'officeCell', 'telephoneContact', 'emailAddress'
    ];
    const errors = await form.trigger(fields as any);
    
    // Check if identification document is uploaded
    const hasIdentificationDoc = files.identificationDoc || uploadedFileUrls.identificationDoc;
    if (!hasIdentificationDoc) {
      setValidationError("Please upload the required identification document before proceeding.");
      return false;
    }
    
    return errors;
  };

  const validateWaterSourceTab = async () => {
    // Only validate Water Source tab fields - LAT/LONG are validated in Activity tab
    const fields = [
      'waterSourceType', 'nameSourceWater', 'waterSourceProvince',
      'waterSourceDistrict', 'waterSourceSector', 'waterSourceCell', 'waterReliability',
      'permitLengthYears'
    ];
    
    const errors = await form.trigger(fields as any);
    return errors;
  };

  const validateIntendedActivityTab = async () => {
    const fields = ['intendedActivities'];
    const errors = await form.trigger(fields as any);
    
    // Check if activity-specific required documents are uploaded
    if (!checkRequiredDocuments()) {
      setValidationError("Please upload all required documents for your selected activities before proceeding.");
      return false;
    }

    // For concession activities (fish farming), polygons are required and should be validated here
    const intended = form.getValues('intendedActivities') || [];
    const requiresConcessionPolygons = intended.includes('fish_farming_lakes') || intended.includes('fish_farming_ponds');
    const requiresAbstractionDetails = intended.some((a: string) => a && a !== 'fish_farming_lakes' && a !== 'fish_farming_ponds');
    
    // For abstraction activities, LAT/LONG and water abstraction details are required
    if (requiresAbstractionDetails) {
      // Validate LAT/LONG
      const latLngErrors = await form.trigger(['waterSourceLatitude', 'waterSourceLongitude'] as any);
      if (!latLngErrors) {
        const lat = String(form.getValues('waterSourceLatitude') ?? '').trim();
        const lng = String(form.getValues('waterSourceLongitude') ?? '').trim();
        if (!lat || !lng) {
          setValidationError("Water abstraction point (LAT/LONG) is required for abstraction activities.");
          return false;
        }
      }
      
      // Validate water abstraction details
      const abstractionErrors = await form.trigger('waterAbstractionDetails' as any);
      if (!abstractionErrors) {
        const details = form.getValues('waterAbstractionDetails') || [];
        if (!details || details.length === 0) {
          setValidationError("Water abstraction details are required for abstraction activities.");
          return false;
        }
      }
    }
    
    if (requiresConcessionPolygons) {
      const polygons = form.getValues('waterSourcePolygons') || [];
      const hasValidPolygons =
        Array.isArray(polygons) &&
        polygons.length > 0 &&
        polygons.every((poly: any) => {
          return (
            Array.isArray(poly) &&
            poly.length >= 4 &&
            poly.every((coord: any) => coord.latitude?.toString().trim() !== '' && coord.longitude?.toString().trim() !== '')
          );
        });

      if (!hasValidPolygons) {
        setValidationError('Please provide at least one concession polygon with 4+ coordinate points before proceeding.');
        return false;
      }

      try {
        const validation = await validatePolygons({
          polygons,
          applicationId: currentApplication?.id
        });

        setCoordinateValidation(validation);

        if (!validation.isValid) {
          const msg = validation.errors?.[0] || 'Polygon validation failed. Please review your coordinates.';
          setValidationError(msg);
          return false;
        }
      } catch (e) {
        setValidationError(`Polygon validation failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
        return false;
      }
    }
    
    return errors;
  };

  const validateLandOwnershipTab = async () => {
    const fields = ['ownsAllLand', 'certificationAgreement'];
    const errors = await form.trigger(fields as any);
    
    const ownsAllLand = form.getValues('ownsAllLand');
    
    // Check land ownership document if user owns all land
    if (ownsAllLand) {
      const hasLandOwnershipDoc = Boolean(files.landOwnershipDoc || uploadedFileUrls.landOwnershipDoc);
      if (!hasLandOwnershipDoc) {
        form.setError('landOwnershipDoc' as any, {
          type: 'manual',
          message: 'Proof of land ownership is required when you own all the required land.'
        });
        setValidationError("Please upload the land ownership document before proceeding.");
        return false;
      }
      form.clearErrors('landOwnershipDoc' as any);
    }
    
    // Check land access documents if user doesn't own all land
    if (!ownsAllLand && !checkLandAccessDocuments()) {
      form.setError('landAccessDocuments' as any, {
        type: 'manual',
        message: 'Proof of land access is required when you do not own all the required land.'
      });
      setValidationError("Please upload the required land access documents before proceeding.");
      return false;
    }
    form.clearErrors('landAccessDocuments' as any);
    
    return errors;
  };

  const getTabs = () => {
    // Payment tab should only be available for draft/pending_payment AND never for staff views (review/assessment/approver)
    const shouldShowPayment =
      !isStaffView && (!currentApplication?.status || ['draft', 'pending_payment'].includes(currentApplication.status));

    return shouldShowPayment
      ? ["applicant-info", "water-source", "intended-activity", "land-ownership", "payment"]
      : ["applicant-info", "water-source", "intended-activity", "land-ownership"];
  };

  const handleTabChange = async (nextTab: string) => {
    if (readOnly) {
      setActiveTab(nextTab);
      return;
    }

    const tabs = getTabs();
    const currentIndex = tabs.indexOf(activeTab);
    const nextIndex = tabs.indexOf(nextTab);

    if (nextIndex === -1) return;

    // Always allow going backwards (or re-selecting the same tab)
    if (nextIndex <= currentIndex) {
      setValidationError(null);
      setActiveTab(nextTab);
      return;
    }

    if (isTabSwitching) return;
    setIsTabSwitching(true);

    const tabLabels: Record<string, string> = {
      "applicant-info": "Applicant",
      "water-source": "Water Source",
      "intended-activity": "Activity",
      "land-ownership": "Land",
      payment: "Payment",
    };

    const validateByTab: Record<string, (() => Promise<boolean>) | undefined> = {
      "applicant-info": validateApplicantTab,
      "water-source": validateWaterSourceTab,
      "intended-activity": validateIntendedActivityTab,
      "land-ownership": validateLandOwnershipTab,
    };

    try {
      setValidationError(null);

      // Validate all prerequisite tabs before allowing forward navigation
      for (let i = 0; i < nextIndex; i += 1) {
        const tab = tabs[i];
        const validate = validateByTab[tab];
        if (!validate) continue;

        const ok = await validate();
        if (!ok) {
          // Keep the user on (or move them to) the first invalid section to make fixes obvious
          setActiveTab(tab);
          // IMPORTANT: preserve any more specific error set by the tab validator (e.g. polygon outside Rwanda),
          // and only fall back to the generic message if none was set.
          setValidationError((prev) => prev || `Please complete all required fields in ${tabLabels[tab] || 'this'} section before proceeding.`);
          setTimeout(() => setValidationError(null), 5000);
          return;
        }
      }

      setActiveTab(nextTab);
    } finally {
      setIsTabSwitching(false);
    }
  };

  // Function to check if Next button should be disabled
  const isNextButtonDisabled = () => {
    switch (activeTab) {
      case "applicant-info": {
        // Check required fields for applicant tab
        // Note: categoryApplicant has a default value of 'individual', so use form.watch() to ensure we get current values
        const fullNameApplicant = form.watch('fullNameApplicant') || form.getValues('fullNameApplicant') || '';
        const categoryApplicant = form.watch('categoryApplicant') || form.getValues('categoryApplicant') || 'individual';
        const officeProvince = form.watch('officeProvince') || form.getValues('officeProvince') || '';
        const officeDistrict = form.watch('officeDistrict') || form.getValues('officeDistrict') || '';
        const officeSector = form.watch('officeSector') || form.getValues('officeSector') || '';
        const officeCell = form.watch('officeCell') || form.getValues('officeCell') || '';
        const telephoneContact = form.watch('telephoneContact') || form.getValues('telephoneContact') || '';
        const emailAddress = form.watch('emailAddress') || form.getValues('emailAddress') || '';
        
        const hasApplicantFields = 
          fullNameApplicant.trim() !== '' &&
          categoryApplicant.trim() !== '' &&
          officeProvince.trim() !== '' &&
          officeDistrict.trim() !== '' &&
          officeSector.trim() !== '' &&
          officeCell.trim() !== '' &&
          telephoneContact.trim() !== '' &&
          emailAddress.trim() !== '';
          
        // Check identification document
        const hasIdentificationDoc = files.identificationDoc || uploadedFileUrls.identificationDoc;
        return !hasApplicantFields || !hasIdentificationDoc;
      }
        
      case "water-source": {
        // Check required fields for water source tab only
        // LAT/LONG are validated in Activity tab, not here
        // Note: waterSourceType must be explicitly selected (no default), waterReliability has a default
        const waterSourceType = form.watch('waterSourceType') || form.getValues('waterSourceType') || '';
        const waterReliability = form.watch('waterReliability') || form.getValues('waterReliability') || 'water_always_available';
        const nameSourceWater = form.watch('nameSourceWater') || form.getValues('nameSourceWater') || '';
        const waterSourceProvince = form.watch('waterSourceProvince') || form.getValues('waterSourceProvince') || '';
        const waterSourceDistrict = form.watch('waterSourceDistrict') || form.getValues('waterSourceDistrict') || '';
        const waterSourceSector = form.watch('waterSourceSector') || form.getValues('waterSourceSector') || '';
        const waterSourceCell = form.watch('waterSourceCell') || form.getValues('waterSourceCell') || '';
        
        const hasWaterSourceFields = 
          waterSourceType.trim() !== '' &&
          nameSourceWater.trim() !== '' &&
          waterSourceProvince.trim() !== '' &&
          waterSourceDistrict.trim() !== '' &&
          waterSourceSector.trim() !== '' &&
          waterSourceCell.trim() !== '' &&
          waterReliability.trim() !== '';
          
        // Check permit length (required for submission)
        const permitLength = form.watch('permitLengthYears') ?? form.getValues('permitLengthYears');
        const hasPermitLength = typeof permitLength === 'number' && permitLength >= 1 && permitLength <= 15;

        return !hasWaterSourceFields || !hasPermitLength;
      }
        
      case "intended-activity": {
        // Check required fields and documents for intended activity tab
        // Use form.watch() to ensure reactive updates when fields change
        const intendedActivities = form.watch('intendedActivities') || form.getValues('intendedActivities') || [];
        const waterAbstractionDetails = form.watch('waterAbstractionDetails') || form.getValues('waterAbstractionDetails') || [];
        const hasRequiredDocs = checkRequiredDocuments();
        
        // Must have at least one activity selected
        if (intendedActivities.length === 0) {
          return true; // Disable Next button
        }
        
        // Determine if this is a concession (fish farming) or abstraction activity
        const isConcessionActivity = intendedActivities.includes('fish_farming_lakes') || intendedActivities.includes('fish_farming_ponds');
        const isAbstractionActivity = intendedActivities.some((a: string) => a && a !== 'fish_farming_lakes' && a !== 'fish_farming_ponds');
        
        // For concession activities (fish farming), polygons are required but NOT water abstraction details
        if (isConcessionActivity) {
          const polygons = form.watch('waterSourcePolygons') || form.getValues('waterSourcePolygons') || [];
          const hasValidPolygons =
            Array.isArray(polygons) &&
            polygons.length > 0 &&
            polygons.every((poly: any) => {
              return (
                Array.isArray(poly) &&
                poly.length >= 4 &&
                poly.every((coord: any) => coord.latitude?.toString().trim() !== '' && coord.longitude?.toString().trim() !== '')
              );
            });
          return !hasRequiredDocs || !hasValidPolygons;
        }
        
        // For abstraction activities, water abstraction details and LAT/LONG are required
        if (isAbstractionActivity) {
          const hasAbstractionDetails = waterAbstractionDetails.length > 0;
          const lat = String(form.watch('waterSourceLatitude') ?? form.getValues('waterSourceLatitude') ?? '').trim();
          const lng = String(form.watch('waterSourceLongitude') ?? form.getValues('waterSourceLongitude') ?? '').trim();
          const hasLatLng = lat !== '' && lng !== '';
          return !hasAbstractionDetails || !hasLatLng || !hasRequiredDocs;
        }
        
        return !hasRequiredDocs;
      }
        
      case "land-ownership": {
        // Check required fields and documents for land ownership tab
        // Use form.watch() to ensure reactive updates when fields change
        const ownsAllLand = form.watch('ownsAllLand') ?? form.getValues('ownsAllLand');
        const hasLandDocs = checkLandAccessDocuments();
        const hasCertified = Boolean(form.watch('certificationAgreement') ?? form.getValues('certificationAgreement'));
        return ownsAllLand === undefined || !hasLandDocs || !hasCertified;
      }
        
      default:
        return false;
    }
  };

  const handleNextTab = async () => {
    const tabs = getTabs();
    const currentIndex = tabs.indexOf(activeTab);
    
    if (currentIndex >= tabs.length - 1) return;

    let isValid = false;
    
    // Validate current tab before proceeding
    switch (activeTab) {
      case "applicant-info":
        isValid = await validateApplicantTab();
        break;
      case "water-source":
        isValid = await validateWaterSourceTab();
        break;
      case "intended-activity":
        isValid = await validateIntendedActivityTab();
        break;
      case "land-ownership":
        isValid = await validateLandOwnershipTab();
        break;
      default:
        isValid = true;
    }

    if (isValid) {
      setValidationError(null);
      setActiveTab(tabs[currentIndex + 1]);
    } else {
      // Error message is set in individual validation functions
      setTimeout(() => setValidationError(null), 5000); // Clear error after 5 seconds
    }
  };

  // Reset form with initial data when it becomes available
  useEffect(() => {
    if (initialData) {
      const normalizedInitialData: Partial<FormValues> = { ...initialData };
      // Normalize legacy activity values (older drafts) to current select values
      if (Array.isArray(normalizedInitialData.intendedActivities)) {
        normalizedInitialData.intendedActivities = normalizedInitialData.intendedActivities.map((a) => {
          if (a === "aquaculture") return "fish_farming_lakes";
          if (a === "recreation") return "recreation_activities";
          if (a === "electricity") return "electricity_generation";
          return a;
        });
      }
      if (
        (!normalizedInitialData.fishLakeConcessionCoordinates || normalizedInitialData.fishLakeConcessionCoordinates.trim() === "") &&
        (Array.isArray((normalizedInitialData as any).waterSourcePolygons) || Array.isArray((normalizedInitialData as any).waterSourceCoordinates))
      ) {
        const firstPoly =
          Array.isArray((normalizedInitialData as any).waterSourcePolygons) && (normalizedInitialData as any).waterSourcePolygons?.[0]
            ? (normalizedInitialData as any).waterSourcePolygons[0]
            : (normalizedInitialData as any).waterSourceCoordinates;
        if (Array.isArray(firstPoly)) {
          normalizedInitialData.fishLakeConcessionCoordinates = formatPolygonCoordinatesForDisplay(firstPoly);
        }
      }

      form.reset({
        // Start with defaults
        fullNameApplicant: "",
        categoryApplicant: "individual",
        officeProvince: "",
        officeDistrict: "",
        officeSector: "",
        officeCell: "",
        officeVillage: "",
        telephoneContact: "",
        emailAddress: "",
        waterSourceType: "",
        waterSourceOther: "",
        nameSourceWater: "",
        tributaryToMain: "",
        waterSourceProvince: "",
        waterSourceDistrict: "",
        waterSourceSector: "",
        waterSourceCell: "",
        waterSourceVillage: "",
        waterSourceLatitude: "",
        waterSourceLongitude: "",
        waterSourcePolygons: [
          [
            { latitude: "", longitude: "" },
            { latitude: "", longitude: "" },
            { latitude: "", longitude: "" }
          ]
        ],
        waterReliability: "water_always_available",
        permitLengthYears: 5,
        intendedActivities: ["water_supply"],
        intendedActivityOther: "",
        waterAbstractionDetails: [{
          flowRate: "",
          flowRateUnit: "m³/s",
          maxAverageYearly: 0,
          abstractionMethod: "pump"
        }],
        concessionArea: undefined,
        concessionAreaUnit: undefined,
        permitPeriod: undefined,
        ownsAllLand: true,
        hasLandAccess: undefined,
        annexA_irrigationDetails: "",
        annexB_waterSupplyDetails: "",
        annexC_aquacultureDetails: "",
        annexD_coffeeWashingDetails: "",
        annexE_industryDetails: "",
        industryDetails: [
          { industryType: "Food Processing", dailyQuantity: undefined, monthlyQuantity: undefined },
          { industryType: "Horticultural Packaging", dailyQuantity: undefined, monthlyQuantity: undefined },
          { industryType: "Chemical Manufacturing", dailyQuantity: undefined, monthlyQuantity: undefined },
          { industryType: "Mineral water", dailyQuantity: undefined, monthlyQuantity: undefined },
          { industryType: "Brewing/Beverage manufacturing", dailyQuantity: undefined, monthlyQuantity: undefined },
          { industryType: "Fruit and vegetable canning or pickling", dailyQuantity: undefined, monthlyQuantity: undefined },
          { industryType: "Others (Specify)", dailyQuantity: undefined, monthlyQuantity: undefined },
        ],
        annexF_electricityDetails: "",
        annexG_miningDetails: "",
        annexH_constructionDetails: "",
        annexI_navigationDetails: "",
        annexJ_recreationDetails: "",
        annexK_otherDetails: "",
        miningQuantityPerDay: "",
        miningQuantityPerMonth: "",
        miningMineralsType: "",
        miningProductionCapacityTonsPerYear: undefined,
        fishLakeAreaHectares: undefined,
        fishLakeNumberOfCages: undefined,
        fishLakeCageCapacity: undefined,
        fishLakeConcessionCoordinates: "",
        fishPondsDiscardWaterQuantityM3PerDay: undefined,
        irrigationCropType: "",
        irrigationGrowingSeasonFrom: "",
        irrigationGrowingSeasonTo: "",
        irrigationProductionSystem: "",
        irrigationMethod: "",
        irrigationTotalArea: undefined,
        irrigationWaterDemand: undefined,
        irrigationStorageFacilities: "",
        irrigationStorageCapacity: undefined,
        certificationAgreement: true,
        // Override with loaded data
        ...normalizedInitialData
      });

      // Backwards compatibility: if older data only has waterSourceCoordinates (single polygon),
      // normalize it into the new waterSourcePolygons field.
      const currentPolys = form.getValues('waterSourcePolygons');
      if (
        (!currentPolys || !Array.isArray(currentPolys) || currentPolys.length === 0) &&
        Array.isArray((normalizedInitialData as any).waterSourceCoordinates)
      ) {
        form.setValue('waterSourcePolygons', [(normalizedInitialData as any).waterSourceCoordinates as any], {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false
        } as any);
      }
      
      // Ensure industryDetails always has all 7 industry types, merging saved values where they exist
      const savedIndustryDetails = form.getValues('industryDetails');
      const defaultIndustryTypes = [
        "Food Processing",
        "Horticultural Packaging",
        "Chemical Manufacturing",
        "Mineral water",
        "Brewing/Beverage manufacturing",
        "Fruit and vegetable canning or pickling",
        "Others (Specify)"
      ];
      if (!savedIndustryDetails || !Array.isArray(savedIndustryDetails) || savedIndustryDetails.length !== defaultIndustryTypes.length) {
        const mergedIndustryDetails = defaultIndustryTypes.map((industryType, index) => {
          const saved = savedIndustryDetails?.[index];
          return saved && saved.industryType === industryType
            ? saved
            : { industryType, dailyQuantity: undefined, monthlyQuantity: undefined };
        });
        form.setValue('industryDetails', mergedIndustryDetails, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false
        });
      }
      
      // Update dropdown selection states to enable cascading
      if (initialData.officeProvince) {
        setSelectedOfficeProvince(initialData.officeProvince);
      }
      if (initialData.officeDistrict) {
        setSelectedOfficeDistrict(initialData.officeDistrict);
      }
      if (initialData.officeSector) {
        setSelectedOfficeSector(initialData.officeSector);
      }
      if (initialData.officeCell) {
        setSelectedOfficeCell(initialData.officeCell);
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
      
      // Initialize additionalDocuments if they exist in initialData
      if (initialData.additionalDocuments && Array.isArray(initialData.additionalDocuments)) {
        console.log('📎 Initializing additionalDocuments from initialData:', initialData.additionalDocuments.length, initialData.additionalDocuments);
        setAdditionalDocuments(initialData.additionalDocuments);
      } else {
        console.log('📎 No additionalDocuments in initialData:', { has: !!initialData.additionalDocuments, isArray: Array.isArray(initialData.additionalDocuments) });
      }
    }
  }, [initialData, form, formatPolygonCoordinatesForDisplay]);

  // Load initial documents when provided
  useEffect(() => {
    if (initialDocuments && Object.keys(initialDocuments).length > 0) {
      // Convert the new document structure to the old format for uploadedFileUrls
      const urlMap: Record<string, string> = {};
      Object.entries(initialDocuments).forEach(([key, doc]) => {
        if (typeof doc === 'string') {
          // Handle legacy format (just URL)
          urlMap[key] = doc;
        } else {
          // Handle new format (object with url and name)
          urlMap[key] = doc.url;
        }
      });
      setUploadedFileUrls(urlMap);
    }
  }, [initialDocuments]);

  // Rwanda Administrative Divisions Data
  // Old administrative data removed - now using comprehensive Rwanda data

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    console.log(`📎 File change detected for field: ${fieldName}`);
    const file = event.target.files?.[0];
    if (file) {
      console.log(`📎 File selected: ${file.name} (${file.size} bytes) for field: ${fieldName}`);
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }
      
      setFiles(prev => {
        const newFiles = { ...prev, [fieldName]: file };
        console.log(`📎 Updated files state:`, Object.keys(newFiles).filter(key => newFiles[key]));
        return newFiles;
      });
      form.setValue(fieldName as any, file);
      console.log(`📎 Form value set for ${fieldName}`);
    } else {
      console.log(`📎 No file selected for field: ${fieldName}`);
    }
  };

  const removeFile = (fieldName: string) => {
    setFiles(prev => ({ ...prev, [fieldName]: null }));
    form.setValue(fieldName as any, null);
    if (fileInputRefs[fieldName as keyof typeof fileInputRefs]?.current) {
      fileInputRefs[fieldName as keyof typeof fileInputRefs].current!.value = '';
    }
  };

  // Reusable Document Upload Component
  const DocumentUploadField = ({ 
    fieldName, 
    label, 
    required = false,
    accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    multiple = false 
  }: { 
    fieldName: string; 
    label: string; 
    required?: boolean;
    accept?: string;
    multiple?: boolean;
  }) => {
    const currentFile = files[fieldName];
    const currentUploadedUrl = uploadedFileUrls[fieldName];
    
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
          <input
            type="file"
            ref={fileInputRefs[fieldName as keyof typeof fileInputRefs]}
            onChange={(e) => handleFileChange(e, fieldName)}
            accept={accept}
            multiple={multiple}
            className="hidden"
          />
          
          {!currentFile && !currentUploadedUrl && (
            <div className="space-y-2">
              <Upload className="h-6 w-6 mx-auto text-gray-400" />
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={readOnly ? undefined : () => fileInputRefs[fieldName as keyof typeof fileInputRefs]?.current?.click()}
                  disabled={readOnly}
                >
                  Choose File
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                PDF, JPG, PNG, DOC (max 10MB)
              </p>
            </div>
          )}
          
          {/* Show newly uploaded file */}
          {currentFile && (
            <div className="flex items-center justify-center gap-2 text-sm text-green-600">
              <Check className="h-4 w-4" />
              <span className="truncate max-w-xs">{currentFile.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={readOnly ? undefined : () => removeFile(fieldName)}
                className="h-6 w-6 p-0"
                disabled={readOnly}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          {/* Show previously uploaded file */}
          {!currentFile && currentUploadedUrl && (
            <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
              <FileText className="h-4 w-4" />
              <a 
                href={currentUploadedUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:underline truncate max-w-xs"
              >
                {(() => {
                  // Try to get document name from initialDocuments
                  const docInfo = Object.entries(initialDocuments || {}).find(([key, doc]) => {
                    const url = typeof doc === 'string' ? doc : doc.url;
                    return url === currentUploadedUrl;
                  });
                  if (docInfo && typeof docInfo[1] === 'object') {
                    return docInfo[1].name;
                  }
                  // Fallback: extract filename from URL
                  try {
                    const urlPath = new URL(currentUploadedUrl).pathname;
                    return urlPath.split('/').pop() || 'Uploaded document';
                  } catch {
                    return 'Uploaded document';
                  }
                })()}
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={readOnly ? undefined : () => fileInputRefs[fieldName as keyof typeof fileInputRefs]?.current?.click()}
                className="h-6 w-6 p-0"
                disabled={readOnly}
              >
                <Upload className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRequiredAttachmentsForActivity = (activity: string) => {
    const req = getAnnexRequirementForActivity(activity, { irrigationTotalArea: watchedIrrigationTotalArea });
    if (!req.attachments.length) return null;

    return (
      <div className="mt-6 space-y-4">
        {req.annexTitle ? (
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{req.annexTitle}</div>
        ) : null}

        <DocumentRequirementsInfo documents={req.attachments.map((a) => a.label)} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {req.attachments.map((a) => (
            <DocumentUploadField key={a.fieldName} fieldName={a.fieldName} label={a.label} required={a.required} />
          ))}
        </div>
      </div>
    );
  };

  // Add Document Button Component with Dialog
  const AddDocumentButton = ({ 
    category, 
    activityType 
  }: { 
    category: string; 
    activityType: string; 
  }) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [docName, setDocName] = useState("");
    const [docDescription, setDocDescription] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleAddDocument = () => {
      if (docName.trim() && selectedFile) {
        const newDoc = {
          id: `${activityType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: docName.trim(),
          category: category || activityType || 'additional',
          description: docDescription.trim(),
          file: selectedFile
        };
        
        setAdditionalDocuments(prev => [...prev, newDoc]);
        
        // Reset dialog state
        setDocName("");
        setDocDescription("");
        setSelectedFile(null);
        setIsDialogOpen(false);
        
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    const resetDialog = () => {
      setDocName("");
      setDocDescription("");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
          className="border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400"
          disabled={readOnly}
        >
          <Upload className="h-4 w-4 mr-2" />
          + Add Document
        </Button>

        {isDialogOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Add Additional Document</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetDialog();
                  }}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="doc-name">Document Name *</Label>
                  <Input
                    id="doc-name"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder="e.g., Site Plan, Water Quality Report"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doc-description">Description (Optional)</Label>
                  <Textarea
                    id="doc-description"
                    value={docDescription}
                    onChange={(e) => setDocDescription(e.target.value)}
                    placeholder="Brief description of the document..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Upload File *</Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      className="hidden"
                    />
                    
                    {!selectedFile ? (
                      <div className="text-center space-y-2">
                        <Upload className="h-8 w-8 mx-auto text-gray-400" />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Choose File
                        </Button>
                        <p className="text-xs text-gray-500">PDF, JPG, PNG, DOC (max 10MB)</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                        <Check className="h-4 w-4" />
                        <span className="truncate">{selectedFile.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedFile(null)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetDialog();
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleAddDocument}
                  disabled={!docName.trim() || !selectedFile}
                  className="flex-1"
                >
                  Add Document
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  // Additional Documents Display Component
  const AdditionalDocumentsSection = ({ 
    category, 
    activityType 
  }: { 
    category: string; 
    activityType: string; 
  }) => {
    const categoryDocs = additionalDocuments.filter(doc => 
      doc.category === category || doc.category === activityType
    );

    const removeAdditionalDocument = (id: string) => {
      setAdditionalDocuments(prev => prev.filter(doc => doc.id !== id));
    };

    const handleViewDocument = (doc: any) => {
      // Check if we have a stored URL (from Supabase)
      if (doc.url) {
        // Open the Supabase CDN URL directly
        const newWindow = window.open(doc.url, '_blank');
        if (newWindow) {
          newWindow.focus();
        } else {
          // Fallback: navigate to URL if popup blocked
          window.location.href = doc.url;
        }
      } else if (doc.file && doc.file instanceof File) {
        // Fallback: Create a blob URL for local files (newly uploaded)
        const blob = new Blob([doc.file], { type: doc.file.type });
        const url = URL.createObjectURL(blob);
        
        // Open in new tab/window
        const newWindow = window.open(url, '_blank');
        if (newWindow) {
          newWindow.focus();
          // Clean up the blob URL after a delay
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
          // Fallback: trigger download if popup blocked
          const link = document.createElement('a');
          link.href = url;
          link.download = doc.file.name || 'document';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      } else {
        console.warn('No URL or file available for document:', doc);
      }
    };

    return (
      <div className="space-y-4">
        {categoryDocs.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Additional Documents ({categoryDocs.length})
            </h4>
            <div className="grid gap-3">
              {categoryDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="border border-gray-200 rounded-lg p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-sm truncate">
                          {doc.name}
                        </span>
                      </div>
                      {doc.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                          {doc.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Check className="h-3 w-3 text-green-600" />
                        <button
                          type="button"
                          onClick={() => handleViewDocument(doc)}
                          className="text-xs text-blue-600 hover:text-blue-800 underline truncate cursor-pointer"
                        >
                          {doc.file?.name}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDocument(doc)}
                        className="h-6 w-6 p-0 text-blue-500 hover:text-blue-700"
                        title="View document"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAdditionalDocument(doc.id)}
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                          title="Remove document"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <AddDocumentButton category={category} activityType={activityType} />
      </div>
    );
  };

  // Document Requirements Info Component
  const DocumentRequirementsInfo = ({ documents }: { documents: string[] }) => (
    <Alert className="mb-4 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
      <AlertCircle className="h-4 w-4 text-blue-600" />
      <AlertDescription className="text-blue-800 dark:text-blue-200">
        <span className="font-medium">Required documents for this section:</span>
        <ul className="mt-1 ml-4 space-y-1">
          {documents.map((doc, index) => (
            <li key={index} className="text-sm list-disc">{doc}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );

  // Manual save only - no auto-save functionality
  const [validationError, setValidationError] = useState<string | null>(null);
  const [, forceUpdate] = useState({});

  // Force re-render when files change to update button state
  useEffect(() => {
    forceUpdate({});
  }, [files, uploadedFileUrls]);

  const handleFormSubmit = async (values: FormValues) => {
    try {
      // Compute modification changes if in modification mode
      let modificationChangesData: Record<string, { previous: any; current: any }> | undefined;
      if (isModification && originalApplicationData) {
        modificationChangesData = computeModificationChanges(originalApplicationData, values);
        console.log('📝 Modification changes detected:', modificationChangesData);
      }
      
      // Include additionalDocuments and modification data in the submission
      const submissionData = { 
        ...values, 
        ...files, 
        additionalDocuments,
        // Include modification-specific data
        ...(isModification && {
          isModification: true,
          modificationChanges: modificationChangesData,
        }),
      };
      console.log('📎 additionalDocuments being submitted:', additionalDocuments.length, additionalDocuments.map(d => ({ id: d.id, name: d.name, hasFile: !!d.file, fileIsFile: d.file instanceof File })));
      await onSubmit(submissionData, 'submitted');
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header with legal references - hide for staff views */}
      {!isStaffView && (
        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <FileText className="h-5 w-5" />
              WATER USE PERMIT APPLICATION FORM
            </CardTitle>
            <CardDescription className="space-y-2 text-blue-800">
              <p><strong>Contact Email:</strong> info@rwb.rw</p>
              <p><strong>Legal Reference:</strong> REFER TO THE LAW N°49/2018 OF 13/08/2018 DETERMINING THE USE AND MANAGEMENT OF WATER RESOURCES IN RWANDA</p>
              <p><strong>Ministerial Order:</strong> MINISTERIAL ORDER NO 001/MOE/24 OF 02/04/2024 RELATING TO WATER RESOURCES USE PERMIT</p>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="border-gray-200 dark:border-gray-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Water Permit Application Form</CardTitle>
            {/* Show modification badge for staff viewing modification applications */}
            {isStaffView && modificationChanges && Object.keys(modificationChanges).length > 0 && (
              <ModificationBadge changesCount={Object.keys(modificationChanges).length} />
            )}
          </div>
          <CardDescription>
            {readOnly 
              ? "Review the submitted water permit application details below."
              : "Fill out all required fields to submit your water permit application. Fields marked with * are required."
            }
          </CardDescription>
          
          {/* Manual save only - no auto-save */}
          {!readOnly && (
            <div className="flex items-center gap-2 mt-4">
              <div className="flex items-center gap-2 text-blue-600 text-sm">
                <Save className="h-4 w-4" />
                💾 Manual save only - use "Save as Draft" button or "Next" to save progress
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <Form {...form}>
            {validationError && (
              <Alert className="mb-4 border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {validationError}
                </AlertDescription>
              </Alert>
            )}

            {/* Show modification changes summary for staff viewing modification applications */}
            {isStaffView && modificationChanges && Object.keys(modificationChanges).length > 0 && (
              <ModificationChangesSummary 
                changes={modificationChanges} 
                fieldLabels={FIELD_LABELS}
              />
            )}

            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
              <Tabs
                defaultValue="applicant-info"
                value={activeTab}
                onValueChange={(value) => {
                  void handleTabChange(value);
                }}
              >
                <TabsList className={`grid w-full ${isStaffView || (currentApplication?.status && !['draft', 'pending_payment'].includes(currentApplication.status)) ? 'grid-cols-4 md:grid-cols-4' : 'grid-cols-5 md:grid-cols-5'}`}>
                  <TabsTrigger value="applicant-info" className="flex items-center gap-1 text-xs">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">Applicant</span>
                  </TabsTrigger>
                  <TabsTrigger value="water-source" className="flex items-center gap-1 text-xs">
                    <Droplet className="h-4 w-4" />
                    <span className="hidden sm:inline">Water Source</span>
                  </TabsTrigger>
                  <TabsTrigger value="intended-activity" className="flex items-center gap-1 text-xs">
                    <Factory className="h-4 w-4" />
                    <span className="hidden sm:inline">Activity</span>
                  </TabsTrigger>
                  <TabsTrigger value="land-ownership" className="flex items-center gap-1 text-xs">
                    <Globe className="h-4 w-4" />
                    <span className="hidden sm:inline">Land</span>
                  </TabsTrigger>
                  {/* Only show payment tab for draft or pending_payment status AND not for staff views (review/assessment/approver) */}
                  {!isStaffView && (!currentApplication?.status || ['draft', 'pending_payment'].includes(currentApplication.status)) && (
                    <TabsTrigger value="payment" className="flex items-center gap-1 text-xs">
                      <CreditCard className="h-4 w-4" />
                      <span className="hidden sm:inline">Payment</span>
                    </TabsTrigger>
                  )}
                </TabsList>
                
                {/* IDENTIFICATION AND ADDRESS OF THE APPLICANT */}
                <TabsContent value="applicant-info" className="pt-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Identification and Address of the Applicant
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Provide complete identification and address information for the applicant.
                    </p>
                  </div>

                  {/* 1. Full Name of Applicant */}
                  <FormField
                    control={form.control}
                    name="fullNameApplicant"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          1. Full Name of the Applicant *
                          <span className="text-sm font-normal text-muted-foreground block">
                            (Individual, Company, Cooperative, Organization, etc)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} disabled className="bg-gray-100 border-gray-300 cursor-not-allowed" />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          This information is pulled from your account profile and cannot be edited here.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 2. Category of Applicant */}
                  <FormField
                    control={form.control}
                    name="categoryApplicant"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          2. Category of the Applicant *
                        </FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} value={field.value || ""} disabled>
                            <SelectTrigger className="bg-gray-100 border-gray-300 cursor-not-allowed">
                              <SelectValue placeholder="Category is set from your account" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="individual">Individual</SelectItem>
                              <SelectItem value="company">Company</SelectItem>
                              <SelectItem value="cooperative">Cooperative</SelectItem>
                              <SelectItem value="organization">Organization</SelectItem>
                              <SelectItem value="institution">Institution</SelectItem>
                              <SelectItem value="ngo_association">NGO / Association</SelectItem>
                              <SelectItem value="other">Other (specify)</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          This information is pulled from your account profile and cannot be edited here.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Other category specification */}
                  {watchedCategoryApplicant === "other" && (
                    <FormField
                      control={form.control}
                      name="categoryApplicantOther"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Please specify category</FormLabel>
                          <FormControl>
                            <Input {...field} {...getInputProps({ value: field.value || "", placeholder: "Specify category" })} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* 3. Name of Representative */}
                  {["company", "cooperative", "organization", "institution"].includes(watchedCategoryApplicant) && (
                    <FormField
                      control={form.control}
                      name="nameRepresentative"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-medium">
                            3. Name of the Representative
                            <span className="text-sm font-normal text-muted-foreground block">
                              (for Company, Cooperative, Organization, Institution)
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Input {...field} {...getInputProps({ value: field.value || "", placeholder: "Enter representative name" })} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* 4. Documents */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium">
                      4. Documents *
                    </Label>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>• For Individual: copy of National ID (NID)</p>
                      <p>• For Company/Cooperative/Organization: copy of registration certificate</p>
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="identificationDoc"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                              <input
                                type="file"
                                ref={fileInputRefs.identificationDoc}
                                onChange={(e) => handleFileChange(e, "identificationDoc")}
                                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                className="hidden"
                              />
                              <div className="space-y-2">
                                <Upload className="h-8 w-8 mx-auto text-gray-400" />
                                <div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={readOnly ? undefined : () => fileInputRefs.identificationDoc.current?.click()}
                                    disabled={readOnly}
                                  >
                                    Choose File
                                  </Button>
                                </div>
                                <p className="text-xs text-gray-500">
                                  PDF, JPG, PNG, DOC (max 10MB)
                                </p>
                                {/* Show newly uploaded file */}
                                {files.identificationDoc && (
                                  <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                                    <Check className="h-4 w-4" />
                                    {files.identificationDoc.name}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={readOnly ? undefined : () => removeFile("identificationDoc")}
                                      disabled={readOnly}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                                
                                {/* Show previously uploaded file */}
                                {!files.identificationDoc && uploadedFileUrls.identificationDoc && (
                                  <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
                                    <FileText className="h-4 w-4" />
                                    <a 
                                      href={uploadedFileUrls.identificationDoc} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="hover:underline"
                                    >
                                      {(() => {
                                        // Try to get document name from initialDocuments
                                        const docInfo = initialDocuments?.identificationDoc;
                                        if (docInfo && typeof docInfo === 'object') {
                                          return docInfo.name;
                                        }
                                        // Fallback: extract filename from URL
                                        try {
                                          const urlPath = new URL(uploadedFileUrls.identificationDoc).pathname;
                                          return urlPath.split('/').pop() || 'Identification document';
                                        } catch {
                                          return 'Identification document';
                                        }
                                      })()}
                                    </a>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={readOnly ? undefined : () => {
                                        setUploadedFileUrls(prev => {
                                          const { identificationDoc, ...rest } = prev;
                                          return rest;
                                        });
                                      }}
                                      disabled={readOnly}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* 5. Office Address */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium">
                      5. Office Address * (Province, District, Sector, Cell, Village)
                    </Label>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="officeProvince"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Province *</FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={readOnly ? undefined : (value) => {
                                  field.onChange(value);
                                  setSelectedOfficeProvince(value);
                                  // Reset dependent fields
                                  form.setValue("officeDistrict", "");
                                  form.setValue("officeSector", "");
                                  form.setValue("officeCell", "");
                                  form.setValue("officeVillage", "");
                                  // Clear stale errors that may have been set on Next/previous validation runs
                                  form.clearErrors(["officeProvince", "officeDistrict", "officeSector", "officeCell"]);
                                  setSelectedOfficeDistrict("");
                                  setSelectedOfficeSector("");
                                }} 
                                value={field.value}
                                disabled={readOnly}
                              >
                                <SelectTrigger className={`bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 focus:border-blue-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                                  <SelectValue placeholder="Select province" />
                                </SelectTrigger>
                                <SelectContent>
                                  {getFormattedProvinceOptions().map((province) => (
                                    <SelectItem key={province.value} value={province.value}>
                                      {province.label}
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
                        name="officeDistrict"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>District *</FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={readOnly ? undefined : (value) => {
                                  field.onChange(value);
                                  setSelectedOfficeDistrict(value);
                                  // Reset dependent fields
                                  form.setValue("officeSector", "");
                                  form.setValue("officeCell", "");
                                  form.setValue("officeVillage", "");
                                  form.clearErrors(["officeDistrict", "officeSector", "officeCell"]);
                                  setSelectedOfficeSector("");
                                }}
                                value={field.value}
                                disabled={readOnly || !selectedOfficeProvince}
                              >
                                <SelectTrigger className={`bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 focus:border-green-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                                  <SelectValue placeholder={selectedOfficeProvince ? "Select district" : "Select province first"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {getOfficeDistrictOptions().map((district) => (
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
                        name="officeSector"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sector *</FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={readOnly ? undefined : (value) => {
                                  field.onChange(value);
                                  setSelectedOfficeSector(value);
                                  // Reset cell field and state
                                  form.setValue("officeCell", "");
                                  form.setValue("officeVillage", "");
                                  setSelectedOfficeCell("");
                                  form.clearErrors(["officeSector", "officeCell"]);
                                }}
                                value={field.value}
                                disabled={readOnly || (!selectedOfficeDistrict && !officeDistrict)}
                              >
                                <SelectTrigger className={`bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200 focus:border-purple-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                                  <SelectValue placeholder={(selectedOfficeDistrict || officeDistrict) ? "Select sector" : "Select district first"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {getOfficeSectorOptions().map((sector) => (
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
                        name="officeCell"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cell *</FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={readOnly ? undefined : (value) => {
                                  field.onChange(value);
                                  setSelectedOfficeCell(value);
                                  // Reset village when cell changes to avoid invalid combos
                                  form.setValue("officeVillage", "");
                                  form.clearErrors("officeCell");
                                  // Reset village when cell changes
                                  form.setValue("officeVillage", "");
                                  setSelectedOfficeVillage("");
                                }}
                                value={field.value}
                                disabled={readOnly || (!selectedOfficeSector && !officeSector)}
                              >
                                <SelectTrigger className={`bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200 focus:border-orange-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                                  <SelectValue placeholder={(selectedOfficeSector || officeSector) ? "Select cell" : "Select sector first"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {getOfficeCellOptions().map((cell) => (
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
                        name="officeVillage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Village</FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={readOnly ? undefined : (value) => {
                                  field.onChange(value);
                                  setSelectedOfficeVillage(value);
                                }}
                                value={field.value || ""}
                                disabled={readOnly || (!selectedOfficeCell && !officeCell)}
                              >
                                <SelectTrigger className={`bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200 focus:border-gray-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                                  <SelectValue placeholder={(selectedOfficeCell || officeCell) ? "Select village (optional)" : "Select cell first"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {getOfficeVillageOptions().map((village) => (
                                    <SelectItem key={village.value} value={village.value}>
                                      {village.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* 6. Contact Information */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium">
                      6. Contact Information *
                    </Label>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="telephoneContact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Telephone Contact *</FormLabel>
                            <FormControl>
                              <Input {...field} disabled className="bg-gray-100 border-gray-300 cursor-not-allowed" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="emailAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email Address *</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" disabled className="bg-gray-100 border-gray-300 cursor-not-allowed" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </TabsContent>

{/* SOURCE OF WATER */}
                <TabsContent value="water-source" className="pt-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <Droplet className="h-5 w-5" />
                      Source of Water
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Provide details about the water source you intend to use.
                    </p>
                  </div>

                  {/* 7. Source of Water */}
                  <FormField
                    control={form.control}
                    name="waterSourceType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          7. Source of Water *
                        </FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} value={field.value || undefined} {...getSelectProps()}>
                            <SelectTrigger className={`bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200 focus:border-blue-400 ${readOnly ? 'cursor-default' : ''}`}>
                              <SelectValue placeholder="Select water source type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lake">Lake</SelectItem>
                              <SelectItem value="dam">Dam</SelectItem>
                              <SelectItem value="spring">Spring</SelectItem>
                              <SelectItem value="borehole">Borehole</SelectItem>
                              <SelectItem value="stream_river">Stream/River</SelectItem>
                              <SelectItem value="other">Other (specify)</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Other water source specification */}
                  {watchedWaterSourceType === "other" && (
                    <FormField
                      control={form.control}
                      name="waterSourceOther"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Please specify water source</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Specify water source" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* 8. Name of the source of water */}
                  <FormField
                    control={form.control}
                    name="nameSourceWater"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          8. Name of the source of water *
                        </FormLabel>
                        <FormControl>
                          <Input {...field} {...getInputProps({ value: field.value || "", placeholder: "Enter name of water source" })} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 9. Tributary to (main river/lake) */}
                  <FormField
                    control={form.control}
                    name="tributaryToMain"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          9. Tributary to (main river/lake)
                        </FormLabel>
                        <FormControl>
                          <Input {...field} {...getInputProps({ value: field.value || "", placeholder: "Enter main river/lake (if applicable)" })} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 10. Location of water source */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium">
                      10. Location of water source * (Province, District, Sector, Cell, Village)
                    </Label>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="waterSourceProvince"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Province *</FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={readOnly ? undefined : (value) => {
                                  field.onChange(value);
                                  setSelectedWaterSourceProvince(value);
                                  // Reset dependent fields
                                  form.setValue("waterSourceDistrict", "");
                                  form.setValue("waterSourceSector", "");
                                  form.setValue("waterSourceCell", "");
                                  form.setValue("waterSourceVillage", "");
                                  form.clearErrors(["waterSourceProvince", "waterSourceDistrict", "waterSourceSector", "waterSourceCell"]);
                                  setSelectedWaterSourceDistrict("");
                                  setSelectedWaterSourceSector("");
                                }} 
                                value={field.value}
                                disabled={readOnly}
                              >
                                <SelectTrigger className={`bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-200 focus:border-cyan-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                                  <SelectValue placeholder="Select province" />
                                </SelectTrigger>
                                <SelectContent>
                                  {getFormattedProvinceOptions().map((province) => (
                                    <SelectItem key={province.value} value={province.value}>
                                      {province.label}
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
                        name="waterSourceDistrict"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>District *</FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={readOnly ? undefined : (value) => {
                                  field.onChange(value);
                                  setSelectedWaterSourceDistrict(value);
                                  // Reset dependent fields
                                  form.setValue("waterSourceSector", "");
                                  form.setValue("waterSourceCell", "");
                                  form.setValue("waterSourceVillage", "");
                                  form.clearErrors(["waterSourceDistrict", "waterSourceSector", "waterSourceCell"]);
                                  setSelectedWaterSourceSector("");
                                }}
                                value={field.value}
                                disabled={readOnly || !selectedWaterSourceProvince}
                              >
                                <SelectTrigger className={`bg-gradient-to-r from-teal-50 to-emerald-50 border-teal-200 focus:border-teal-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                                  <SelectValue placeholder={selectedWaterSourceProvince ? "Select district" : "Select province first"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {getWaterSourceDistrictOptions().map((district) => (
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
                        name="waterSourceSector"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sector *</FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={readOnly ? undefined : (value) => {
                                  field.onChange(value);
                                  setSelectedWaterSourceSector(value);
                                  // Reset cell field
                                  form.setValue("waterSourceCell", "");
                                  form.setValue("waterSourceVillage", "");
                                  form.clearErrors(["waterSourceSector", "waterSourceCell"]);
                                }}
                                value={field.value}
                                disabled={readOnly || !selectedWaterSourceDistrict}
                              >
                                <SelectTrigger className={`bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200 focus:border-indigo-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                                  <SelectValue placeholder={selectedWaterSourceDistrict ? "Select sector" : "Select district first"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {getWaterSourceSectorOptions().map((sector) => (
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
                        name="waterSourceCell"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cell *</FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={readOnly ? undefined : (value) => {
                                  field.onChange(value);
                                  setSelectedWaterSourceCell(value);
                                  // Reset village when cell changes to avoid invalid combos
                                  form.setValue("waterSourceVillage", "");
                                  setSelectedWaterSourceVillage("");
                                  form.clearErrors("waterSourceCell");
                                }}
                                value={field.value}
                                disabled={readOnly || !selectedWaterSourceSector}
                              >
                                <SelectTrigger className={`bg-gradient-to-r from-rose-50 to-pink-50 border-rose-200 focus:border-rose-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                                  <SelectValue placeholder={selectedWaterSourceSector ? "Select cell" : "Select sector first"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {getWaterSourceCellOptions().map((cell) => (
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
                        name="waterSourceVillage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Village</FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={readOnly ? undefined : (value) => {
                                  field.onChange(value);
                                  setSelectedWaterSourceVillage(value);
                                }}
                                value={field.value || ""}
                                disabled={readOnly || (!selectedWaterSourceCell && !waterSourceCell)}
                              >
                                <SelectTrigger className={`bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200 focus:border-gray-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                                  <SelectValue placeholder={(selectedWaterSourceCell || waterSourceCell) ? "Select village (optional)" : "Select cell first"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {getWaterSourceVillageOptions().map((village) => (
                                    <SelectItem key={village.value} value={village.value}>
                                      {village.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Reliability of water source */}
                  <FormField
                    control={form.control}
                    name="waterReliability"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          12. Reliability of water source *
                        </FormLabel>
                        <FormControl>
                          <Select onValueChange={readOnly ? undefined : field.onChange} value={field.value || ""} disabled={readOnly}>
                            <SelectTrigger className={`bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200 focus:border-emerald-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                              <SelectValue placeholder="Select water source reliability" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="water_always_available">Water always available</SelectItem>
                              <SelectItem value="frequently_dry">Frequently dry</SelectItem>
                              <SelectItem value="dry_during_certain_season">Dry during certain season</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Requested Permit Duration */}
                  <FormField
                    control={form.control}
                    name="permitLengthYears"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          13. Requested Permit Duration (Years) *
                        </FormLabel>
                        <FormControl>
                          <Select 
                            onValueChange={(value) => {
                              if (!readOnly) {
                                field.onChange(parseInt(value, 10));
                              }
                            }} 
                            value={field.value?.toString() || ""} 
                            disabled={readOnly}
                          >
                            <SelectTrigger className={`bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 focus:border-amber-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                              <SelectValue placeholder="Select permit duration" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 15 }, (_, i) => i + 1).map((year) => (
                                <SelectItem key={year} value={year.toString()}>
                                  {year} {year === 1 ? 'year' : 'years'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          Select the duration for which you are requesting the water permit (1-15 years). This may be adjusted by the assessor based on your use case.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Activity-specific details moved to Intended Activity section per spec */}
                </TabsContent>

                {/* INTENDED ACTIVITY */}
                <TabsContent value="intended-activity" className="pt-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <Factory className="h-5 w-5" />
                      Intended Activity
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Specify the activities for which you intend to use water.
                    </p>
                  </div>

                  {/* 13. Activity Type - Single Selection */}
                  <FormField
                    control={form.control}
                    name="intendedActivities"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          13. Intended Activity * (Select one activity)
                        </FormLabel>
                        <FormControl>
                          <RadioGroup
                            value={Array.isArray(field.value) && field.value.length > 0 ? field.value[0] : ""}
                            onValueChange={(value) => {
                              if (readOnly) return;
                              field.onChange([value]);
                            }}
                            disabled={readOnly}
                            className={`grid grid-cols-1 gap-3 rounded-lg border bg-gradient-to-r from-indigo-50 to-purple-50 p-4 ${
                              readOnly ? "cursor-default opacity-60" : ""
                            }`}
                          >
                            {[
                              { value: "irrigation", label: "Irrigation" },
                              { value: "construction_of_dam", label: "Construction of a dam" },
                              { value: "fish_farming_lakes", label: "Fish farming in lakes" },
                              { value: "fish_farming_ponds", label: "Fish farming in ponds" },
                              { value: "mining", label: "Mining" },
                              { value: "industry", label: "Industry" },
                              { value: "water_supply", label: "Water supply" },
                              { value: "coffee_washing", label: "Coffee washing" },
                              { value: "electricity_generation", label: "Electricity generation (Hydropower)" },
                              { value: "navigation", label: "Navigation" },
                              { value: "recreation_activities", label: "Recreational activities" },
                              { value: "construction_of_infrastructures", label: "Construction of infrastructures" },
                              { value: "gaz_extraction", label: "Gaz extraction" },
                              { value: "livestock", label: "Livestock" },
                              { value: "other", label: "Other (specify)" },
                            ].map((opt) => (
                              <div key={opt.value} className="flex items-center gap-3">
                                <RadioGroupItem value={opt.value} id={`activity-${opt.value}`} />
                                <Label htmlFor={`activity-${opt.value}`} className="text-sm leading-5 text-slate-800 cursor-pointer">
                                  {opt.label}
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Water Abstraction Point (LAT, LONG) - only for abstraction activities, right after Q13 */}
                  {(() => {
                    const selected = watchedIntendedActivities || [];
                    const hasFishFarming = selected.includes("fish_farming_lakes") || selected.includes("fish_farming_ponds");
                    const hasNonFishActivity = selected.some((a) => a && a.trim() !== "" && a !== "fish_farming_lakes" && a !== "fish_farming_ponds");
                    // Show for any non-fish-farming activity
                    return hasNonFishActivity ? (
                      <div className="space-y-4">
                        <Label className="text-base font-medium">
                          14. Water Abstraction Point * (LAT, LONG)
                        </Label>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="waterSourceLatitude"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Latitude *</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="text"
                                    value={(field.value ?? "").toString()}
                                    placeholder="e.g., -1.9441"
                                    disabled={readOnly}
                                    onChange={(e) => {
                                      // Only allow numbers, decimal point, and minus sign
                                      const value = e.target.value;
                                      // Allow: numbers, single decimal point, minus sign at start
                                      const validPattern = /^-?\d*\.?\d*$/;
                                      if (value === "" || validPattern.test(value)) {
                                        field.onChange(value);
                                        // Trigger validation after input
                                        setTimeout(() => {
                                          form.trigger("waterSourceLatitude");
                                          form.trigger("waterSourceLongitude");
                                        }, 100);
                                      }
                                    }}
                                    onBlur={() => {
                                      // Validate on blur
                                      form.trigger("waterSourceLatitude");
                                      form.trigger("waterSourceLongitude");
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="waterSourceLongitude"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Longitude *</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="text"
                                    value={(field.value ?? "").toString()}
                                    placeholder="e.g., 29.8739"
                                    disabled={readOnly}
                                    onChange={(e) => {
                                      // Only allow numbers, decimal point, and minus sign
                                      const value = e.target.value;
                                      // Allow: numbers, single decimal point, minus sign at start
                                      const validPattern = /^-?\d*\.?\d*$/;
                                      if (value === "" || validPattern.test(value)) {
                                        field.onChange(value);
                                        // Trigger validation after input
                                        setTimeout(() => {
                                          form.trigger("waterSourceLatitude");
                                          form.trigger("waterSourceLongitude");
                                        }, 100);
                                      }
                                    }}
                                    onBlur={() => {
                                      // Validate on blur
                                      form.trigger("waterSourceLatitude");
                                      form.trigger("waterSourceLongitude");
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm text-blue-800">
                            <strong>Note:</strong> For water abstraction activities, only a single point is required (LAT/LONG).
                          </p>
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* Other activity specification */}
                  {watchedIntendedActivities?.includes("other") && (
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="intendedActivityOther"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Please specify other activity</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Specify other activity" disabled={readOnly} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Other activity attachments (multiple, dynamic) */}
                      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                        <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-2 text-lg border-b pb-2">
                          Other Activity Attachments
                        </h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          Upload any supporting documents for your other activity. You can add multiple attachments.
                        </p>

                        <AdditionalDocumentsSection category="other" activityType="other" />
                      </div>
                    </div>
                  )}

                  {/* Water Concession Area (Multiple Polygons) - only for fish farming, after Q13 selection */}
                  {watchedIntendedActivities && watchedIntendedActivities.length > 0 && 
                   (watchedIntendedActivities.includes("fish_farming_lakes") || watchedIntendedActivities.includes("fish_farming_ponds")) && (
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="waterSourcePolygons"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <MultiPolygonInputWithValidation
                                polygons={
                                  field.value?.length
                                    ? field.value
                                    : [
                                        [
                                          { latitude: "", longitude: "" },
                                          { latitude: "", longitude: "" },
                                          { latitude: "", longitude: "" }
                                        ]
                                      ]
                                }
                                onPolygonsChange={(polygons) => field.onChange(polygons)}
                                onValidationChange={(validation) => {
                                  setCoordinateValidation(validation);
                                  setCanSubmit(true);
                                }}
                                applicationId={currentApplication?.id}
                                disabled={Boolean(readOnly)}
                                showValidation={true}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          <strong>Note:</strong> This concession area is required for fish farming. Each polygon needs at least 4 points.
                          If you have multiple separate areas, add multiple polygons.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Activity-specific sections */}
                  {watchedIntendedActivities && watchedIntendedActivities.length > 0 && (
                    <div className="space-y-6 mt-8">

                      {/* Irrigation Details */}
                      {watchedIntendedActivities?.includes("irrigation") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Irrigation Details
                          </h4>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-6">
                              <thead>
                                <tr className="bg-gray-50 dark:bg-gray-700">
                                  <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Type of Crops</th>
                                  <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Growing season (months)</th>
                                  <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Type of Production System</th>
                                  <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Type of irrigation technology/method</th>
                                  <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Total irrigated area (ha)</th>
                                  <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Total Water demand until harvesting time (m³)</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="irrigationCropType"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input 
                                            {...field}
                                            placeholder="Type of crops" 
                                            className="border-0 bg-transparent"
                                            disabled={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <div className="flex gap-1 items-center">
                                      <FormField
                                        control={form.control}
                                        name="irrigationGrowingSeasonFrom"
                                        render={({ field }) => (
                                          <FormControl>
                                            <Select onValueChange={readOnly ? undefined : field.onChange} value={field.value || ""} disabled={readOnly}>
                                              <SelectTrigger className="border-0 bg-transparent h-8 text-xs">
                                                <SelectValue placeholder="From" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="january">January</SelectItem>
                                                <SelectItem value="february">February</SelectItem>
                                                <SelectItem value="march">March</SelectItem>
                                                <SelectItem value="april">April</SelectItem>
                                                <SelectItem value="may">May</SelectItem>
                                                <SelectItem value="june">June</SelectItem>
                                                <SelectItem value="july">July</SelectItem>
                                                <SelectItem value="august">August</SelectItem>
                                                <SelectItem value="september">September</SelectItem>
                                                <SelectItem value="october">October</SelectItem>
                                                <SelectItem value="november">November</SelectItem>
                                                <SelectItem value="december">December</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </FormControl>
                                        )}
                                      />
                                      <span className="self-center text-xs">-</span>
                                      <FormField
                                        control={form.control}
                                        name="irrigationGrowingSeasonTo"
                                        render={({ field }) => (
                                          <FormControl>
                                            <Select onValueChange={readOnly ? undefined : field.onChange} value={field.value || ""} disabled={readOnly}>
                                              <SelectTrigger className="border-0 bg-transparent h-8 text-xs">
                                                <SelectValue placeholder="To" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="january">January</SelectItem>
                                                <SelectItem value="february">February</SelectItem>
                                                <SelectItem value="march">March</SelectItem>
                                                <SelectItem value="april">April</SelectItem>
                                                <SelectItem value="may">May</SelectItem>
                                                <SelectItem value="june">June</SelectItem>
                                                <SelectItem value="july">July</SelectItem>
                                                <SelectItem value="august">August</SelectItem>
                                                <SelectItem value="september">September</SelectItem>
                                                <SelectItem value="october">October</SelectItem>
                                                <SelectItem value="november">November</SelectItem>
                                                <SelectItem value="december">December</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </FormControl>
                                        )}
                                      />
                                    </div>
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="irrigationProductionSystem"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Select onValueChange={readOnly ? undefined : field.onChange} value={field.value || ""} disabled={readOnly}>
                                            <SelectTrigger className="border-0 bg-transparent h-8">
                                              <SelectValue placeholder="Select system" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="outdoor">Outdoor</SelectItem>
                                              <SelectItem value="greenhouse">Green House</SelectItem>
                                              <SelectItem value="hydroponics">Hydroponics</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="irrigationMethod"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Select onValueChange={readOnly ? undefined : field.onChange} value={field.value || ""} disabled={readOnly}>
                                            <SelectTrigger className="border-0 bg-transparent h-8">
                                              <SelectValue placeholder="Select method" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="surface">Surface</SelectItem>
                                              <SelectItem value="sprinkler">Sprinkler</SelectItem>
                                              <SelectItem value="drip">Drip</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="irrigationTotalArea"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input 
                                            type="number"
                                            step="0.01"
                                            {...field}
                                            value={field.value || ""}
                                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                            placeholder="Area in ha" 
                                            className="border-0 bg-transparent"
                                            disabled={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="irrigationWaterDemand"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input 
                                            type="number"
                                            step="0.01"
                                            {...field}
                                            value={field.value || ""}
                                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                            placeholder="Water demand (m³)" 
                                            className="border-0 bg-transparent"
                                            disabled={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <FormField
                              control={form.control}
                              name="irrigationStorageFacilities"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Storage facilities (if any): Reservoirs, Tanks, etc.</FormLabel>
                                  <FormControl>
                                    <Textarea 
                                      {...field}
                                      placeholder="Describe storage facilities..." 
                                      className="min-h-[80px]"
                                      disabled={readOnly}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="irrigationStorageCapacity"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Storage capacity (m³)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number"
                                      step="0.01"
                                      {...field}
                                      value={field.value || ""}
                                      onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                      placeholder="Enter storage capacity (m³)"
                                      disabled={readOnly}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>

                          {renderRequiredAttachmentsForActivity("irrigation")}

                          <AdditionalDocumentsSection 
                            category="irrigation" 
                            activityType="irrigation" 
                          />
                        </div>
                      )}

                      {/* Water Supply Details */}
                      {watchedIntendedActivities?.includes("water_supply") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Water Supply Details
                          </h4>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-6">
                              <thead>
                                <tr className="bg-gray-50 dark:bg-gray-700">
                                  <th className="border border-gray-300 dark:border-gray-600 p-3 text-left text-sm font-medium">Description</th>
                                  <th className="border border-gray-300 dark:border-gray-600 p-3 text-left text-sm font-medium">Quantity</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm">Population to be served (number of people/number of dwellings)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="waterSupplyPopulation"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input 
                                            type="number"
                                            {...getInputProps({ 
                                              value: field.value?.toString() || "", 
                                              placeholder: "Enter population",
                                              className: "border-0 bg-transparent"
                                            })}
                                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 0)}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm">Water demand per capita per day (m³/day)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="waterSupplyPerCapitaDemand"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input 
                                            type="number"
                                            step="0.001"
                                            {...getInputProps({ 
                                              value: field.value?.toString() || "", 
                                              placeholder: "Enter per capita demand",
                                              className: "border-0 bg-transparent"
                                            })}
                                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 0)}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm">Water Demand per day (number of person*m³/day)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="waterSupplyTotalDailyDemand"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input 
                                            type="number"
                                            step="0.001"
                                            {...getInputProps({ 
                                              value: field.value?.toString() || "", 
                                              placeholder: "Total daily demand (m³)",
                                              className: "border-0 bg-transparent"
                                            })}
                                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 0)}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm">How much water will be abstracted per day? (m³/day)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="waterSupplyDailyAbstraction"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input 
                                            type="number"
                                            step="0.001"
                                            {...getInputProps({ 
                                              value: field.value?.toString() || "", 
                                              placeholder: "Daily abstraction (m³)",
                                              className: "border-0 bg-transparent"
                                            })}
                                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 0)}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm">Storage capacity (m³)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="waterSupplyStorageCapacity"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input 
                                            type="number"
                                            step="0.001"
                                            {...getInputProps({ 
                                              value: field.value?.toString() || "", 
                                              placeholder: "Storage capacity (m³)",
                                              className: "border-0 bg-transparent"
                                            })}
                                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 0)}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {renderRequiredAttachmentsForActivity("water_supply")}

                          <AdditionalDocumentsSection 
                            category="water_supply" 
                            activityType="water_supply" 
                          />
                        </div>
                      )}

                      {/* Mining Details */}
                      {watchedIntendedActivities?.includes("mining") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Mining Details
                          </h4>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="miningQuantityPerDay"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Quantity of abstracted water (m³/day)</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="e.g., 120" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="miningQuantityPerMonth"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Quantity of abstracted water (m³/month)</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="e.g., 3500" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="miningMineralsType"
                              render={({ field }) => (
                                <FormItem className="md:col-span-2">
                                  <FormLabel>Type of minerals</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="e.g., Tin, Coltan, Wolfram" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="miningProductionCapacityTonsPerYear"
                              render={({ field }) => (
                                <FormItem className="md:col-span-2">
                                  <FormLabel>Production capacity (tons/year)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      {...field}
                                      onChange={(e) => field.onChange(Number(e.target.value))}
                                      placeholder="e.g., 10000"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {renderRequiredAttachmentsForActivity("mining")}

                            <AdditionalDocumentsSection 
                              category="mining" 
                              activityType="mining" 
                            />
                        </div>
                      )}

                      {/* Aquaculture Details */}
                      {(watchedIntendedActivities?.includes("fish_farming_lakes") || watchedIntendedActivities?.includes("fish_farming_ponds")) && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Aquaculture Details
                          </h4>
                          
                          {watchedIntendedActivities?.includes("fish_farming_lakes") && (
                            <div className="mb-6">
                              <h5 className="font-medium text-slate-700 dark:text-slate-200 mb-3">Aquaculture in lakes</h5>
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-4">
                                  <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-700">
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Name of the lake</th>
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Number of cages</th>
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Capacity of each cage</th>
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Concession area (m² or ha)</th>
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Coordinates of concession area</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <FormField
                                          control={form.control}
                                          name="nameSourceWater"
                                          render={({ field }) => (
                                            <FormControl>
                                              <Input
                                                {...field}
                                                value={field.value ?? ""}
                                                placeholder="Lake name"
                                                className="border-0 bg-transparent"
                                              />
                                            </FormControl>
                                          )}
                                        />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <FormField
                                          control={form.control}
                                          name="fishLakeNumberOfCages"
                                          render={({ field }) => (
                                            <FormControl>
                                              <Input
                                                type="number"
                                                value={field.value ?? ""}
                                                onChange={(e) => {
                                                  const v = e.target.value;
                                                  field.onChange(v === "" ? undefined : Number(v));
                                                }}
                                                placeholder="Number of cages"
                                                className="border-0 bg-transparent"
                                              />
                                            </FormControl>
                                          )}
                                        />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <FormField
                                          control={form.control}
                                          name="fishLakeCageCapacity"
                                          render={({ field }) => (
                                            <FormControl>
                                              <Input
                                                type="number"
                                                value={field.value ?? ""}
                                                onChange={(e) => {
                                                  const v = e.target.value;
                                                  field.onChange(v === "" ? undefined : Number(v));
                                                }}
                                                placeholder="Fishes per cage"
                                                className="border-0 bg-transparent"
                                              />
                                            </FormControl>
                                          )}
                                        />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                          <FormField
                            control={form.control}
                            name="fishLakeAreaHectares"
                            render={({ field }) => (
                              <FormControl>
                                <Input 
                                  type="number"
                                  value={field.value ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    field.onChange(v === "" ? undefined : Number(v));
                                  }}
                                  placeholder="Area" 
                                  className="border-0 bg-transparent" 
                                />
                              </FormControl>
                                          )}
                                        />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <FormField
                                          control={form.control}
                                          name="fishLakeConcessionCoordinates"
                                          render={({ field }) => (
                                            <FormControl>
                                              <Input
                                                {...field}
                                                value={field.value ?? ""}
                                                placeholder="Coordinates"
                                                className="border-0 bg-transparent"
                                              />
                                            </FormControl>
                                          )}
                                        />
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                        </div>
                      )}

                      {watchedIntendedActivities?.includes("fish_farming_ponds") && (
                            <div className="mb-6">
                              <h5 className="font-medium text-slate-700 dark:text-slate-200 mb-3">Aquaculture in ponds</h5>
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-4">
                                  <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-700">
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Pond Surface (m² or ha)</th>
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Pond Capacity (m³)</th>
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Frequency of refilling water in ponds (number / month)</th>
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Amount of water to be used (m³/month)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <Input placeholder="Surface area" className="border-0 bg-transparent" />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <Input placeholder="Capacity (m³)" className="border-0 bg-transparent" />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <Select>
                                          <SelectTrigger className="border-0 bg-transparent h-8">
                                            <SelectValue placeholder="Select frequency" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="daily">Daily</SelectItem>
                                            <SelectItem value="weekly">Weekly</SelectItem>
                                            <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                                            <SelectItem value="monthly">Monthly</SelectItem>
                                            <SelectItem value="quarterly">Quarterly</SelectItem>
                                            <SelectItem value="semi-annually">Semi-annually</SelectItem>
                                            <SelectItem value="annually">Annually</SelectItem>
                                            <SelectItem value="as-needed">As needed</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                          <FormField
                            control={form.control}
                            name="fishPondsDiscardWaterQuantityM3PerDay"
                            render={({ field }) => (
                              <FormControl>
                                <Input 
                                  type="number"
                                  value={field.value ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    field.onChange(v === "" ? undefined : Number(v));
                                  }}
                                  placeholder="Monthly usage (m³)" 
                                  className="border-0 bg-transparent" 
                                />
                              </FormControl>
                                          )}
                                        />
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {watchedIntendedActivities?.includes("fish_farming_lakes")
                            ? renderRequiredAttachmentsForActivity("fish_farming_lakes")
                            : null}

                          {watchedIntendedActivities?.includes("fish_farming_ponds")
                            ? renderRequiredAttachmentsForActivity("fish_farming_ponds")
                            : null}

                          <AdditionalDocumentsSection 
                            category="aquaculture" 
                            activityType="aquaculture" 
                          />
                        </div>
                      )}

                      {/* Coffee Washing Details */}
                      {watchedIntendedActivities?.includes("coffee_washing") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Coffee Washing Details
                          </h4>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-6">
                              <thead>
                                <tr className="bg-gray-50 dark:bg-gray-700">
                                  <th className="border border-gray-300 dark:border-gray-600 p-3 text-left text-sm font-medium">Quantity of abstracted water</th>
                                  <th className="border border-gray-300 dark:border-gray-600 p-3 text-left text-sm font-medium">(m³/day)</th>
                                  <th className="border border-gray-300 dark:border-gray-600 p-3 text-left text-sm font-medium">(m³/month)</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm">Quantity of abstracted water</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Daily quantity (m³)" className="border-0 bg-transparent" />
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Monthly quantity (m³)" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm">Washing capacity (tons/year)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2" colSpan={2}>
                                    <Input placeholder="Annual washing capacity" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {renderRequiredAttachmentsForActivity("coffee_washing")}

                          <AdditionalDocumentsSection 
                            category="coffee_washing" 
                            activityType="coffee_washing" 
                          />
                        </div>
                      )}

                      {/* Industrial Water Use Details */}
                      {watchedIntendedActivities?.includes("industry") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Industrial Water Use Details
                          </h4>
                          
                          <div className="overflow-x-auto mb-6">
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                              <thead>
                                <tr className="bg-gray-50 dark:bg-gray-700">
                                  <th className="border border-gray-300 dark:border-gray-600 p-3 text-left text-sm font-medium">INDUSTRIES (Type of industry)</th>
                                  <th className="border border-gray-300 dark:border-gray-600 p-3 text-left text-sm font-medium">Quantity of abstracted water (m³/day)</th>
                                  <th className="border border-gray-300 dark:border-gray-600 p-3 text-left text-sm font-medium">(m³/month)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  'Food Processing',
                                  'Horticultural Packaging', 
                                  'Chemical Manufacturing',
                                  'Mineral water',
                                  'Brewing/Beverage manufacturing',
                                  'Fruit and vegetable canning or pickling',
                                  'Others (Specify)'
                                ].map((industry, index) => (
                                  <tr key={index}>
                                    <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm">{industry}</td>
                                    <td className="border border-gray-300 dark:border-gray-600 p-2">
                                      <FormField
                                        control={form.control}
                                        name={`industryDetails.${index}.dailyQuantity`}
                                        render={({ field }) => (
                                          <FormControl>
                                            <Input
                                              {...field}
                                              type="number"
                                              step="0.01"
                                              placeholder="Daily (m³)"
                                              className="border-0 bg-transparent"
                                              value={field.value ?? ""}
                                              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                              disabled={readOnly}
                                            />
                                          </FormControl>
                                        )}
                                      />
                                    </td>
                                    <td className="border border-gray-300 dark:border-gray-600 p-2">
                                      <FormField
                                        control={form.control}
                                        name={`industryDetails.${index}.monthlyQuantity`}
                                        render={({ field }) => (
                                          <FormControl>
                                            <Input
                                              {...field}
                                              type="number"
                                              step="0.01"
                                              placeholder="Monthly (m³)"
                                              className="border-0 bg-transparent"
                                              value={field.value ?? ""}
                                              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                              disabled={readOnly}
                                            />
                                          </FormControl>
                                        )}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {renderRequiredAttachmentsForActivity("industry")}

                          <AdditionalDocumentsSection 
                            category="industrial" 
                            activityType="industry" 
                          />
                        </div>
                      )}

                      {/* Hydropower Details */}
                      {watchedIntendedActivities?.includes("electricity_generation") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Hydropower Details
                          </h4>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-6">
                              <tbody>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Quantity of abstracted water (m³/year)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Annual quantity (m³)" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Distance between intake and Power House (m or km)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Distance" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Is there any water user along this distance?</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Select>
                                      <SelectTrigger className="border-0 bg-transparent">
                                        <SelectValue placeholder="Select" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="yes">Yes</SelectItem>
                                        <SelectItem value="no">No</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Capacity of Power Plant (Megawatt)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Capacity in MW" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {renderRequiredAttachmentsForActivity("electricity_generation")}

                          <AdditionalDocumentsSection 
                            category="hydropower" 
                            activityType="electricity_generation" 
                          />
                        </div>
                      )}

                      {/* Construction of Dam Details */}
                      {watchedIntendedActivities?.includes("construction_of_dam") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Construction of Dam Details
                          </h4>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-6">
                              <tbody>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Purpose of construction</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Textarea placeholder="Describe purpose of construction" className="border-0 bg-transparent min-h-[60px]" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Brief description of the construction project (Materials, construction methods, temporary facilities, impact on water flow, impact on water quality, etc.)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Textarea placeholder="Detailed project description..." className="border-0 bg-transparent min-h-[120px]" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Expected period of time required for construction</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Select>
                                      <SelectTrigger className="border-0 bg-transparent h-8">
                                        <SelectValue placeholder="Select duration" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="1-month">1 month</SelectItem>
                                        <SelectItem value="3-months">3 months</SelectItem>
                                        <SelectItem value="6-months">6 months</SelectItem>
                                        <SelectItem value="12-months">12 months</SelectItem>
                                        <SelectItem value="18-months">18 months</SelectItem>
                                        <SelectItem value="24-months">24 months</SelectItem>
                                        <SelectItem value="36-months">36 months</SelectItem>
                                        <SelectItem value="48-months">48 months</SelectItem>
                                        <SelectItem value="60-months">60 months (5 years)</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Plans or maps showing proposed alterations and/or constructions at the end of construction works</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Textarea placeholder="Describe plans and alterations..." className="border-0 bg-transparent min-h-[80px]" />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {renderRequiredAttachmentsForActivity("construction_of_dam")}

                          <AdditionalDocumentsSection 
                            category="construction_dam" 
                            activityType="construction_of_dam" 
                          />
                        </div>
                      )}

                      {/* Infrastructure Construction Details */}
                      {watchedIntendedActivities?.includes("construction_of_infrastructures") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Infrastructure Construction Details
                          </h4>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-6">
                              <tbody>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Purpose of construction</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Textarea placeholder="Describe purpose of construction" className="border-0 bg-transparent min-h-[60px]" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Brief description of the construction project (Materials, construction methods, temporary facilities, impact on water flow, impact on water quality, etc.)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Textarea placeholder="Detailed project description..." className="border-0 bg-transparent min-h-[120px]" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Expected period of time required for construction</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Select>
                                      <SelectTrigger className="border-0 bg-transparent h-8">
                                        <SelectValue placeholder="Select duration" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="1-month">1 month</SelectItem>
                                        <SelectItem value="3-months">3 months</SelectItem>
                                        <SelectItem value="6-months">6 months</SelectItem>
                                        <SelectItem value="12-months">12 months</SelectItem>
                                        <SelectItem value="18-months">18 months</SelectItem>
                                        <SelectItem value="24-months">24 months</SelectItem>
                                        <SelectItem value="36-months">36 months</SelectItem>
                                        <SelectItem value="48-months">48 months</SelectItem>
                                        <SelectItem value="60-months">60 months (5 years)</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Plans or maps showing proposed alterations and/or constructions at the end of construction works</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Textarea placeholder="Describe plans and alterations..." className="border-0 bg-transparent min-h-[80px]" />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {renderRequiredAttachmentsForActivity("construction_of_infrastructures")}

                          <AdditionalDocumentsSection 
                            category="infrastructure" 
                            activityType="construction_of_infrastructures" 
                          />
                        </div>
                      )}

                      {/* Navigation Details */}
                      {watchedIntendedActivities?.includes("navigation") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Navigation Details
                          </h4>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-6">
                              <tbody>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Type of navigation activity</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Specify navigation type" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Brief description of the project</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Textarea placeholder="Describe the navigation project..." className="border-0 bg-transparent min-h-[120px]" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Coordinates of the navigation area</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Enter coordinates" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Expected duration of navigation activities</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Select>
                                      <SelectTrigger className="border-0 bg-transparent h-8">
                                        <SelectValue placeholder="Select duration type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="permanent">Permanent</SelectItem>
                                        <SelectItem value="seasonal">Seasonal</SelectItem>
                                        <SelectItem value="temporary">Temporary</SelectItem>
                                        <SelectItem value="annual">Annual</SelectItem>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                        <SelectItem value="weekly">Weekly</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* No specific annex/required attachments defined for Navigation in the original annex list */}
                          <AdditionalDocumentsSection category="navigation" activityType="navigation" />
                        </div>
                      )}

                      {/* Recreational Activities Details */}
                      {watchedIntendedActivities?.includes("recreation_activities") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Recreational Activities Details
                          </h4>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-6">
                              <tbody>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Type of recreation</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Specify recreation type" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Brief description of the project</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Textarea placeholder="Describe the recreational project..." className="border-0 bg-transparent min-h-[120px]" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Coordinates of the recreation area</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Enter coordinates" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {renderRequiredAttachmentsForActivity("recreation_activities")}

                          <AdditionalDocumentsSection 
                            category="recreation" 
                            activityType="recreation" 
                          />
                        </div>
                      )}

                      {/* Gaz extraction Details */}
                      {watchedIntendedActivities?.includes("gaz_extraction") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Gaz Extraction Details
                          </h4>

                          {renderRequiredAttachmentsForActivity("gaz_extraction")}

                          <AdditionalDocumentsSection category="gaz_extraction" activityType="gaz_extraction" />
                        </div>
                      )}

                      {/* Livestock Details */}
                      {watchedIntendedActivities?.includes("livestock") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Livestock Details
                          </h4>

                          {renderRequiredAttachmentsForActivity("livestock")}

                          <AdditionalDocumentsSection category="livestock" activityType="livestock" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* 15. Water Abstraction Details - only show for abstraction activities (not fish farming) */}
                  {(() => {
                    const selected = watchedIntendedActivities || [];
                    const hasNonFishActivity = selected.some((a) => a && a.trim() !== "" && a !== "fish_farming_lakes" && a !== "fish_farming_ponds");
                    // Show if the selected activity is a non-fish-farming activity
                    return hasNonFishActivity ? (
                      <div className="space-y-4">
                        <Label className="text-base font-medium">
                          15. Water Abstraction Details *
                        </Label>
                        
                        <div className="space-y-4">
                          <div className="border rounded-lg p-4 space-y-4">
                            <h4 className="font-medium">Water Use Details</h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name="waterAbstractionDetails.0.flowRate"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Flow Rate (m³/s)</FormLabel>
                                    <FormControl>
                                      <Input 
                                        type="number"
                                        step="0.001"
                                        {...field} 
                                        {...getInputProps({ value: field.value || "", placeholder: "Enter flow rate (m³/s)" })} 
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={form.control}
                                name="waterAbstractionDetails.0.maxAverageYearly"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Maximum Average Yearly (m³/year)</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        {...field}
                                        onChange={(e) => field.onChange(Number(e.target.value))}
                                        placeholder="Yearly average"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={form.control}
                                name="waterAbstractionDetails.0.abstractionMethod"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Method of Water Abstraction</FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Abstraction method" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* 15. Fish farming specific fields are shown above in respective sections */}
                </TabsContent>

                {/* OWNERSHIP OF ADJOINING LAND */}
                <TabsContent value="land-ownership" className="pt-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Ownership of Adjoining Land
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Provide information about land ownership and access rights.
                    </p>
                  </div>

                  {/* 16. Do you own all the land required? */}
                  <FormField
                    control={form.control}
                    name="ownsAllLand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          16. Do you own all the land required for this water use? *
                        </FormLabel>
                        <FormControl>
                          <Select 
                            onValueChange={readOnly ? undefined : (value) => field.onChange(value === "yes")} 
                            value={field.value ? "yes" : "no"}
                            disabled={readOnly}
                          >
                            <SelectTrigger className={`bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 focus:border-green-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                              <SelectValue placeholder="Do you own all the required land?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes">Yes, I own all the required land</SelectItem>
                              <SelectItem value="no">No, I do not own all the required land</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Land ownership document - shown when user owns all land */}
                  {watchedOwnsAllLand && (
                    <FormField
                      control={form.control}
                      name={"landOwnershipDoc" as any}
                      render={() => (
                        <FormItem className="space-y-4">
                          <FormLabel className="text-base font-medium">
                            Attach proof of land ownership (land title, certificate, etc.) <span className="text-red-500">*</span>
                          </FormLabel>

                          <div>
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                              <input
                                type="file"
                                ref={fileInputRefs.landOwnershipDoc}
                                onChange={(e) => handleFileChange(e, "landOwnershipDoc")}
                                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                className="hidden"
                              />
                              <div className="space-y-2">
                                <Upload className="h-8 w-8 mx-auto text-gray-400" />
                                <div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={readOnly ? undefined : () => fileInputRefs.landOwnershipDoc.current?.click()}
                                    disabled={readOnly}
                                  >
                                    Choose File
                                  </Button>
                                </div>
                                <p className="text-xs text-gray-500">
                                  PDF, JPG, PNG, DOC (max 10MB)
                                </p>
                                {/* Show newly uploaded file */}
                                {files.landOwnershipDoc && (
                                  <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                                    <Check className="h-4 w-4" />
                                    {files.landOwnershipDoc.name}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={readOnly ? undefined : () => removeFile("landOwnershipDoc")}
                                      disabled={readOnly}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}

                                {/* Show previously uploaded file */}
                                {!files.landOwnershipDoc && uploadedFileUrls.landOwnershipDoc && (
                                  <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
                                    <FileText className="h-4 w-4" />
                                    <a
                                      href={uploadedFileUrls.landOwnershipDoc}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:underline"
                                    >
                                      {(() => {
                                        const docInfo = initialDocuments?.landOwnershipDoc;
                                        if (docInfo && typeof docInfo === 'object') {
                                          return docInfo.name;
                                        }
                                        try {
                                          const urlPath = new URL(uploadedFileUrls.landOwnershipDoc).pathname;
                                          return urlPath.split('/').pop() || 'Land ownership document';
                                        } catch {
                                          return 'Land ownership document';
                                        }
                                      })()}
                                    </a>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={readOnly ? undefined : () => {
                                        setUploadedFileUrls(prev => {
                                          const { landOwnershipDoc, ...rest } = prev;
                                          return rest;
                                        });
                                      }}
                                      disabled={readOnly}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* 17. If no, do you have access to the land? */}
                  {!watchedOwnsAllLand && (
                    <>
                      <FormField
                        control={form.control}
                        name="hasLandAccess"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-medium">
                              17. If no, do you have access to the land?
                            </FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={readOnly ? undefined : (value) => field.onChange(value === "yes")} 
                                value={field.value ? "yes" : "no"}
                                disabled={readOnly}
                              >
                                <SelectTrigger className={`bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 focus:border-amber-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                                  <SelectValue placeholder="Do you have access to the land?" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="yes">Yes, I have legal access to the land</SelectItem>
                                  <SelectItem value="no">No, I do not have access to the land</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Land access documents */}
                      <FormField
                        control={form.control}
                        name={"landAccessDocuments" as any}
                        render={() => (
                          <FormItem className="space-y-4">
                            <FormLabel className="text-base font-medium">
                              18. Attach proof of land access (easement, consent, lease, etc.) <span className="text-red-500">*</span>
                            </FormLabel>

                            <div>
                              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                                <input
                                  type="file"
                                  ref={fileInputRefs.landAccessDocuments}
                                  onChange={(e) => handleFileChange(e, "landAccessDocuments")}
                                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                  multiple
                                  className="hidden"
                                />
                                <div className="space-y-2">
                                  <Upload className="h-8 w-8 mx-auto text-gray-400" />
                                  <div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={readOnly ? undefined : () => fileInputRefs.landAccessDocuments.current?.click()}
                                      disabled={readOnly}
                                    >
                                      Choose Files
                                    </Button>
                                  </div>
                                  <p className="text-xs text-gray-500">
                                    PDF, JPG, PNG, DOC (max 10MB each)
                                  </p>
                                  {/* Show newly uploaded file */}
                                  {files.landAccessDocuments && (
                                    <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                                      <Check className="h-4 w-4" />
                                      {files.landAccessDocuments.name}
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={readOnly ? undefined : () => removeFile("landAccessDocuments")}
                                        disabled={readOnly}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}

                                  {/* Show previously uploaded file */}
                                  {!files.landAccessDocuments && uploadedFileUrls.landAccessDocuments && (
                                    <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
                                      <FileText className="h-4 w-4" />
                                      <a
                                        href={uploadedFileUrls.landAccessDocuments}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:underline"
                                      >
                                        {(() => {
                                          // Try to get document name from initialDocuments
                                          const docInfo = initialDocuments?.landAccessDocuments;
                                          if (docInfo && typeof docInfo === 'object') {
                                            return docInfo.name;
                                          }
                                          // Fallback: extract filename from URL
                                          try {
                                            const urlPath = new URL(uploadedFileUrls.landAccessDocuments).pathname;
                                            return urlPath.split('/').pop() || 'Land access document';
                                          } catch {
                                            return 'Land access document';
                                          }
                                        })()}
                                      </a>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={readOnly ? undefined : () => {
                                          setUploadedFileUrls(prev => {
                                            const { landAccessDocuments, ...rest } = prev;
                                            return rest;
                                          });
                                        }}
                                        disabled={readOnly}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  {/* CERTIFICATION */}
                <div className="pt-6 space-y-6">
                  <div className="space-y-4 p-6 border rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
                    <Label className="text-base font-medium text-green-900 dark:text-green-100">
                      CERTIFICATION
                    </Label>
                    <FormField
                      control={form.control}
                      name="certificationAgreement"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="border-green-400 data-[state=checked]:bg-green-600"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm text-green-800 dark:text-green-200">
                              I certify that the information provided in this application is true and accurate to the best of my knowledge. *
                            </FormLabel>
                            <FormDescription className="text-xs text-green-700 dark:text-green-300">
                              I understand that providing false information may result in the rejection of this application and/or legal consequences.
                            </FormDescription>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                </TabsContent>

                {/* PAYMENT TAB - Only show for draft or pending_payment AND not for staff views */}
                {!isStaffView && (!currentApplication?.status || ['draft', 'pending_payment'].includes(currentApplication.status)) && (
                  <TabsContent value="payment" className="pt-6 space-y-6">
                    <PaymentTab
                      application={currentApplication}
                      formData={!currentApplication?.id ? {
                        ...form.getValues(),
                        ...files,
                        additionalDocuments
                      } : undefined}
                      onPaymentComplete={!currentApplication?.id ? handlePaymentComplete : undefined}
                      isSavingApplication={isLoading}
                      saveError={paymentPrepError}
                      onRetrySave={() => {
                        setPaymentPrepError(null);
                        // Compute modification changes if in modification mode
                        let modificationChangesData: Record<string, { previous: any; current: any }> | undefined;
                        if (isModification && originalApplicationData) {
                          modificationChangesData = computeModificationChanges(originalApplicationData, form.getValues());
                        }
                        const draftData = {
                          ...form.getValues(),
                          ...files,
                          additionalDocuments,
                          ...(isModification && {
                            isModification: true,
                            modificationChanges: modificationChangesData,
                          }),
                        };
                        void onSaveAsDraft(draftData, 'draft').catch((error) => {
                          console.error('Error saving application:', error);
                          setPaymentPrepError('Please try saving your application again before proceeding to payment.');
                        });
                      }}
                      onBack={() => setActiveTab('land-ownership')}
                    />
                  </TabsContent>
                )}
                {/* Form Actions */}
                <div className="flex justify-between pt-6">
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        try {
                          // Compute modification changes if in modification mode
                          let modificationChangesData: Record<string, { previous: any; current: any }> | undefined;
                          if (isModification && originalApplicationData) {
                            modificationChangesData = computeModificationChanges(originalApplicationData, form.getValues());
                          }
                          
                          // Include additionalDocuments and modification data in the draft save
                          const draftData = { 
                            ...form.getValues(), 
                            ...files, 
                            additionalDocuments,
                            ...(isModification && {
                              isModification: true,
                              modificationChanges: modificationChangesData,
                            }),
                          };
                          console.log('📎 Files being saved:', Object.keys(files).filter(k => files[k]));
                          console.log('📎 additionalDocuments being saved:', additionalDocuments.length, additionalDocuments.map(d => ({ id: d.id, name: d.name, hasFile: !!d.file, fileIsFile: d.file instanceof File })));
                          const result = await onSaveAsDraft(draftData, 'draft');
                          
                          // After successful save, clear the files state so the UI shows uploaded versions
                          if (result) {
                            // Clear all successfully uploaded files from state
                            const uploadedFieldNames = Object.keys(files).filter(k => files[k] instanceof File);
                            if (uploadedFieldNames.length > 0) {
                              setFiles({});
                              // Clear file input refs to allow re-upload
                              uploadedFieldNames.forEach(fieldName => {
                                const ref = fileInputRefs[fieldName as keyof typeof fileInputRefs];
                                if (ref?.current) {
                                  ref.current.value = '';
                                }
                              });
                              console.log('📎 Cleared files state after successful upload:', uploadedFieldNames);
                            }
                          }
                        } catch (error) {
                          console.error('Draft save error:', error);
                        }
                      }}
                      disabled={isLoading}
                      className="hover:bg-gray-100"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {isLoading ? 'Saving...' : 'Save as Draft'}
                    </Button>
                  )}
                  {readOnly && <div />}
                  
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const shouldShowPayment = !isStaffView && (!currentApplication?.status || ['draft', 'pending_payment'].includes(currentApplication.status));
                        const tabs = shouldShowPayment 
                          ? ["applicant-info", "water-source", "intended-activity", "land-ownership", "payment"]
                          : ["applicant-info", "water-source", "intended-activity", "land-ownership"];
                        const currentIndex = tabs.indexOf(activeTab);
                        if (currentIndex > 0) {
                          setActiveTab(tabs[currentIndex - 1]);
                        }
                      }}
                      disabled={activeTab === "applicant-info"}
                    >
                      Previous
                    </Button>
                    
                    {activeTab !== "land-ownership" && (
                      <Button
                        type="button"
                        onClick={readOnly ? () => {
                          // In view mode, show payment tab only if not staff view and status is draft/pending_payment
                          const shouldShowPayment = !isStaffView && (!currentApplication?.status || ['draft', 'pending_payment'].includes(currentApplication.status));
                          const tabs = shouldShowPayment 
                            ? ["applicant-info", "water-source", "intended-activity", "land-ownership", "payment"]
                            : ["applicant-info", "water-source", "intended-activity", "land-ownership"];
                          const currentIndex = tabs.indexOf(activeTab);
                          if (currentIndex < tabs.length - 1) {
                            setActiveTab(tabs[currentIndex + 1]);
                          }
                        } : handleNextTab}
                        disabled={(!readOnly && activeTab === "payment") || (!readOnly && isNextButtonDisabled())}
                        className={(!readOnly && isNextButtonDisabled()) ? "opacity-50 cursor-not-allowed" : ""}
                      >
                        Next
                      </Button>
                    )}
                    
                    {activeTab === "land-ownership" && !readOnly && (
                      <Button 
                        type="button"
                        onClick={async (e) => {
                          try {
                            // Enforce Land tab requirements before proceeding to payment
                            const ok = await validateLandOwnershipTab();
                            if (!ok) {
                              setTimeout(() => setValidationError(null), 5000);
                              return;
                            }

                            // Compute modification changes if in modification mode
                            let modificationChangesData: Record<string, { previous: any; current: any }> | undefined;
                            if (isModification && originalApplicationData) {
                              modificationChangesData = computeModificationChanges(originalApplicationData, form.getValues());
                            }

                            // Automatically save as draft (like airline booking)
                            const draftData = { 
                              ...form.getValues(), 
                              ...files, 
                              additionalDocuments,
                              ...(isModification && {
                                isModification: true,
                                modificationChanges: modificationChangesData,
                              }),
                            };

                            // Navigate to payment tab immediately; save happens in the background
                            setPaymentPrepError(null);
                            setActiveTab('payment');
                            
                            // Scroll to top for better UX
                            window.scrollTo({ top: 0, behavior: 'smooth' });

                            // Save in background (do not block navigation)
                            void onSaveAsDraft(draftData, 'draft').catch((error) => {
                              console.error('Error saving application:', error);
                              setPaymentPrepError('Please try saving your application again before proceeding to payment.');
                            });
                          } catch (error) {
                            console.error('Error saving application:', error);
                            alert('Please try saving your application again before proceeding to payment.');
                          }
                        }}
                        disabled={isLoading || !canSubmit}
                        className={(isLoading || !canSubmit) ? "opacity-50 cursor-not-allowed" : ""}
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        {isLoading ? 'Saving…' : 'Continue to Payment'}
                        {!canSubmit && coordinateValidation && !coordinateValidation.isValid && (
                          <span className="ml-2 text-xs">(Fix polygon validation first)</span>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </Tabs>
            </form>
          </Form>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Also export as default for dynamic() compatibility
export default ApplicationForm;
