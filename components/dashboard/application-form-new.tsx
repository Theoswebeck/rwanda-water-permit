"use client";

import { Fragment, cloneElement, isValidElement, useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Card,
  CardContent,
  CardDescription as BaseCardDescription,
  CardHeader,
  CardTitle as BaseCardTitle 
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger as BaseTabsTrigger } from "@/components/ui/tabs";
import { Input as BaseInput } from "@/components/ui/input";
import { Label as BaseLabel } from "@/components/ui/label";
import { Button as BaseButton } from "@/components/ui/button";
import { Textarea as BaseTextarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  Select, 
  SelectContent, 
  SelectItem as BaseSelectItem, 
  SelectTrigger, 
  SelectValue as BaseSelectValue 
} from "@/components/ui/select";
import { 
  Form,
  FormControl,
  FormDescription as BaseFormDescription,
  FormField,
  FormItem,
  FormLabel as BaseFormLabel,
  useFormField
} from "@/components/ui/form";
import { Alert, AlertDescription as BaseAlertDescription, AlertTitle as BaseAlertTitle } from "@/components/ui/alert";
import { Upload, X, FileText, FileEdit, Check, AlertCircle, Save, Send, User, Globe, Factory, Droplet, CheckCircle, XCircle, Eye, CreditCard, Loader2, Map, Edit3, Building } from "lucide-react";
import { BulkNetworksTable, emptyBulkRow } from "@/components/dashboard/bulk-networks-table";
import type { BulkNetworkRow } from "@/types/database";
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
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import enMessages from "@/messages/en.json";
import rwMessages from "@/messages/rw.json";

const getTranslationMaps = (locale: AppLanguage) => {
  const source = locale === "rw" ? rwMessages : enMessages;
  const appForm = source.applicationForm ?? {};
  return {
    literal: (appForm.literal ?? {}) as Record<string, string>,
    words: (appForm.words ?? {}) as Record<string, string>,
  };
};

const translateWordByWord = (text: string, words: Record<string, string>) =>
  text.replace(/\b[A-Za-z][A-Za-z/-]*\b/g, (word) => words[word] ?? word);

const localizeText = (
  value: string,
  locale: AppLanguage,
  literalMap: Record<string, string>,
  wordMap: Record<string, string>
) => {
  if (locale === "en" || !value) return value;
  const direct = literalMap[value];
  if (direct) return direct;

  const trimmed = value.trim();
  if (trimmed && literalMap[trimmed]) {
    const prefix = value.slice(0, value.indexOf(trimmed));
    const suffix = value.slice(value.indexOf(trimmed) + trimmed.length);
    return `${prefix}${literalMap[trimmed]}${suffix}`;
  }

  return translateWordByWord(value, wordMap);
};

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

const PaymentConfirmationPanel = dynamic(
  () => import("@/components/payments/payment-confirmation-panel").then((mod) => ({ default: mod.PaymentConfirmationPanel })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Loading payment info…
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

const AbstractionPointMap = dynamic(
  () =>
    import("@/components/maps/AbstractionPointMap").then((mod) => ({
      default: mod.AbstractionPointMap,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] w-full flex items-center justify-center bg-gray-100 rounded text-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  }
);

const optionalNumberField = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().optional()) as z.ZodType<number | undefined>;

// Form schema based on the exact structure from NEW_WATER_PERMIT_APPLICATION_FORM.md
const applicationFormSchema = z.object({
  // SECTION 1: IDENTIFICATION AND ADDRESS OF THE APPLICANT
  fullNameApplicant: z.string().min(2, { message: "Full name is required" }),
  categoryApplicant: z.enum(["individual", "company", "cooperative", "organization", "institution", "ngo_association", "other"]),
  categoryApplicantOther: z.string().optional(),
  nameRepresentative: z.string().optional(),
  representativePosition: z.string().optional(),
  
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
  nameSourceWater: z.string(),
  tributaryToMain: z.string().optional(),

  // Location of water source
  // min(1) requirements are enforced in superRefine for non-bulk applicants
  // (bulk applicants hide these fields and use network-level location data instead)
  waterSourceProvince: z.string(),
  waterSourceDistrict: z.string(),
  waterSourceSector: z.string(),
  waterSourceCell: z.string(),
  waterSourceVillage: z.string().optional(),
  
  // Water abstraction point (LAT/LONG) - used for non-concession activities
  waterSourceLatitude: z.string().optional(),
  waterSourceLongitude: z.string().optional(),
  
  // Water activity polygons (multiple polygons, variable points) - optional, required only for fish farming.
  // Individual coordinate strings are intentionally permissive here (allow empty) because the form
  // initialises a default 4-point placeholder with empty strings.  Real validation is handled in the
  // Activity tab validator and superRefine — not at the base schema level.
  waterSourcePolygons: z.array(
    z.array(
      z.object({
        latitude: z.string(),
        longitude: z.string()
      })
    )
  ).optional(),
  
  // Reliability
  waterReliability: z.enum(["water_always_available", "frequently_dry", "dry_during_certain_season"]),
  
  // Permit Length (1-15 years)
  permitLengthYears: z.number().min(1).max(15).optional(),

  // Hidden flag: set to true for bulk applicants so superRefine can skip water-source field checks
  _isBulk: z.boolean().optional(),
  
  // SECTION 3: INTENDED ACTIVITY
  intendedActivities: z.array(z.string()).min(1, { message: "Select an activity" }).max(1, { message: "Only one activity can be selected per application" }),
  intendedActivityOther: z.string().optional(),
  
  // Water Abstraction - optional, required only for abstraction activities
  waterAbstractionDetails: z.array(z.object({
    flowRate: optionalNumberField,
    flowRateUnit: z.string().optional(),
    maxAverageYearly: optionalNumberField,
    abstractionMethod: z.string().optional(),
  })).optional(),
  
  // Water use category – "abstraction" or "concession".
  // Fish farming in lakes and recreational activities are always concession;
  // all other activities let the user choose (default: abstraction).
  waterUseCategory: z.enum(["abstraction", "concession"]).optional(),

  // Water Concession (for Aquaculture)
  concessionArea: optionalNumberField,
  concessionAreaUnit: z.string().optional(),
  permitPeriod: z.string().optional(),
  
  // SECTION 4: OWNERSHIP OF ADJOINING LAND
  ownsAllLand: z.boolean().nullable(),
  hasLandAccess: z.boolean().nullable().optional(),
  
  // SECTION 5: PAYMENT INFORMATION (removed per RWB request)
  
  // Water Supply Details (structured fields)
  waterSupplyPopulation: optionalNumberField,
  waterSupplyPerCapitaDemand: optionalNumberField,
  waterSupplyTotalDailyDemand: optionalNumberField,
  waterSupplyDailyAbstraction: optionalNumberField,
  waterSupplyStorageCapacity: optionalNumberField,

  // ANNEXES
  annexA_irrigationDetails: z.string().optional(),
  annexB_waterSupplyDetails: z.string().optional(),
  annexC_aquacultureDetails: z.string().optional(),
  annexD_coffeeWashingDetails: z.string().optional(),
  annexE_industryDetails: z.string().optional(),
  // Industry table data (structured)
  industryDetails: z.array(z.object({
    industryType: z.string(),
    dailyQuantity: optionalNumberField,
    monthlyQuantity: optionalNumberField,
  })).optional(),
  annexF_electricityDetails: z.string().optional(),
  annexG_miningDetails: z.string().optional(),
  annexH_constructionDetails: z.string().optional(),
  annexI_navigationDetails: z.string().optional(),
  annexJ_recreationDetails: z.string().optional(),
  annexK_otherDetails: z.string().optional(),
  // ANNEX G (Mining) structured fields
  miningQuantityPerDay: optionalNumberField,
  miningQuantityPerMonth: optionalNumberField,
  miningMineralsType: z.string().optional(),
  miningProductionCapacityTonsPerYear: optionalNumberField,

  // Fish farming (replacing Aquaculture)
  fishLakeAreaHectares: optionalNumberField,
  fishLakeNumberOfCages: optionalNumberField,
  fishLakeCageCapacity: optionalNumberField,
  fishPondsSurfaceAreaM2: optionalNumberField,
  fishPondsCapacityM3: optionalNumberField,
  fishPondsRefillFrequency: z.string().optional(),
  fishPondsDiscardWaterQuantityM3PerDay: optionalNumberField,
  
  // Coffee washing specific fields
  coffeeWashingQuantityPerDay: optionalNumberField,
  coffeeWashingQuantityPerMonth: optionalNumberField,
  coffeeWashingCapacityTonsPerYear: optionalNumberField,
  
  // Hydropower/Electricity specific fields
  hydropowerQuantityPerYear: optionalNumberField,
  hydropowerIntakeToPowerhouseDistanceM: optionalNumberField,
  hydropowerHasDownstreamUsers: z.enum(["yes", "no"]).optional(),
  hydropowerPlantCapacityMw: optionalNumberField,
  
  // Construction of dam fields
  constructionDamPurpose: z.string().optional(),
  constructionDamDescription: z.string().optional(),
  constructionDamExpectedDuration: z.string().optional(),
  constructionDamAlterationPlans: z.string().optional(),
  
  // Construction of infrastructure fields
  infrastructurePurpose: z.string().optional(),
  infrastructureDescription: z.string().optional(),
  infrastructureExpectedDuration: z.string().optional(),
  infrastructureAlterationPlans: z.string().optional(),
  
  // Recreation fields
  recreationType: z.string().optional(),
  recreationProjectDescription: z.string().optional(),
  recreationConcessionAreaM2: optionalNumberField,
  
  // Irrigation specific fields
  irrigationCropType: z.string().optional(),
  irrigationGrowingSeasonFrom: z.string().optional(),
  irrigationGrowingSeasonTo: z.string().optional(),
  irrigationProductionSystem: z.string().optional(),
  irrigationMethod: z.string().optional(),
  irrigationTotalArea: optionalNumberField,
  irrigationWaterDemand: optionalNumberField,
  irrigationStorageFacilities: z.string().optional(),
  irrigationStorageCapacity: optionalNumberField,
  
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
  
  // Modification reason (required when modifying an existing permit)
  modificationReason: z.string().optional(),

  // CERTIFICATION
  certificationAgreement: z.boolean().refine((val) => val === true, {
    message: "You must certify the information is accurate"
  }),
}).superRefine((data, ctx) => {
  // Representative name is required for Company, Cooperative, Organization, Institution
  const companyTypes = ["company", "cooperative", "organization", "institution"];
  if (companyTypes.includes(data.categoryApplicant ?? "")) {
    const repName = String(data.nameRepresentative ?? "").trim();
    if (repName === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nameRepresentative"],
        message: "Name of the Representative is required for Company, Cooperative, Organization, or Institution.",
      });
    }

    const repPosition = String(data.representativePosition ?? "").trim();
    if (repPosition === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["representativePosition"],
        message: "Representative position/title is required for Company, Cooperative, Organization, or Institution.",
      });
    }
  }

  const isFilled = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (typeof value === "number") return Number.isFinite(value);
    return true;
  };
  const isValidNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
  const requireText = (value: unknown, path: (string | number)[], message: string) => {
    if (String(value ?? "").trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    }
  };
  const requireNumber = (value: unknown, path: (string | number)[], message: string, min = 0) => {
    if (!isValidNumber(value) || value <= min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    }
  };

  // Conditional validation based on activity type
  // Note: This validation only runs on form submission, not on individual tab validation
  const selectedActivities = Array.isArray(data.intendedActivities) ? data.intendedActivities : [];
  if (!selectedActivities.length) return; // No validation if no activity selected

  // Water source fields (name, province, district, sector, cell) are required for every
  // activity EXCEPT District Water Supply, which hides those fields and uses network-level
  // location data instead. Keyed on the selected activity, not the bulk profile flag.
  const isDistrictWaterSupplySubmit = selectedActivities[0] === "district_water_supply";
  if (!isDistrictWaterSupplySubmit) {
    if (!String(data.nameSourceWater ?? "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nameSourceWater"], message: "Water source name is required." });
    }
    if (!String(data.waterSourceProvince ?? "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["waterSourceProvince"], message: "Water source province is required." });
    }
    if (!String(data.waterSourceDistrict ?? "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["waterSourceDistrict"], message: "Water source district is required." });
    }
    if (!String(data.waterSourceSector ?? "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["waterSourceSector"], message: "Water source sector is required." });
    }
    if (!String(data.waterSourceCell ?? "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["waterSourceCell"], message: "Water source cell is required." });
    }
  }

  // Single activity selection is enforced by schema (.max(1))
  // No need to check for mixing concession and abstraction activities

  // District water supply has its own validation path (district + networks); skip abstraction/concession checks.
  if (selectedActivities[0] === "district_water_supply") {
    // The block above is skipped for district, so validate the district selection here (for everyone).
    if (!String(data.waterSourceDistrict ?? "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["waterSourceDistrict"], message: "District is required for District Water Supply." });
    }
    return;
  }

  const pureConcessionActs = ["fish_farming_lakes", "recreation_activities"];
  const isPureConcessionAct = selectedActivities.some((a) => pureConcessionActs.includes(a));
  const effectiveCategory = isPureConcessionAct ? "concession" : (data.waterUseCategory ?? "abstraction");

  if (effectiveCategory === "concession") {
    if (data.waterSourcePolygons && data.waterSourcePolygons.length > 0) {
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

  if (effectiveCategory === "abstraction") {
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

    const abstractionDetails = Array.isArray(data.waterAbstractionDetails) ? data.waterAbstractionDetails : [];
    if (!abstractionDetails.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["waterAbstractionDetails"],
        message: "Water abstraction details are required for abstraction activities."
      });
      return;
    }

    abstractionDetails.forEach((detail, index) => {
      if (!isFilled(detail?.flowRate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["waterAbstractionDetails", index, "flowRate"],
          message: "Flow rate is required."
        });
      }

      if (!isFilled(detail?.maxAverageYearly)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["waterAbstractionDetails", index, "maxAverageYearly"],
          message: "Maximum average yearly abstraction is required."
        });
      }

      if (!isFilled(detail?.abstractionMethod)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["waterAbstractionDetails", index, "abstractionMethod"],
          message: "Method of water abstraction is required."
        });
      }
    });
  }

  const hasRecreationActivity = selectedActivities.includes("recreation_activities");
  if (hasRecreationActivity) {
    if (!String(data.recreationProjectDescription ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recreationProjectDescription"],
        message: "Recreational activities details are required."
      });
    }

    if (!isValidNumber(data.recreationConcessionAreaM2) || data.recreationConcessionAreaM2 <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recreationConcessionAreaM2"],
        message: "Concession area (m²) must be a number greater than 0 for recreational activities."
      });
    }
  }

  const selectedActivity = selectedActivities[0];
  switch (selectedActivity) {
    case "other":
      requireText(data.intendedActivityOther, ["intendedActivityOther"], "Please specify the 'Other' intended activity.");
      break;
    case "irrigation":
      requireText(data.irrigationCropType, ["irrigationCropType"], "Crop type is required for irrigation.");
      requireText(data.irrigationGrowingSeasonFrom, ["irrigationGrowingSeasonFrom"], "Growing season start month is required.");
      requireText(data.irrigationGrowingSeasonTo, ["irrigationGrowingSeasonTo"], "Growing season end month is required.");
      requireText(data.irrigationProductionSystem, ["irrigationProductionSystem"], "Production system is required for irrigation.");
      requireText(data.irrigationMethod, ["irrigationMethod"], "Irrigation method is required.");
      requireNumber(data.irrigationTotalArea, ["irrigationTotalArea"], "Total irrigated area must be a number greater than 0.");
      requireNumber(data.irrigationWaterDemand, ["irrigationWaterDemand"], "Irrigation water demand must be a number greater than 0.");
      break;
    case "water_supply":
      requireNumber(data.waterSupplyPopulation, ["waterSupplyPopulation"], "Population to be served must be a number greater than 0.");
      requireNumber(data.waterSupplyPerCapitaDemand, ["waterSupplyPerCapitaDemand"], "Per-capita demand must be a number greater than 0.");
      requireNumber(data.waterSupplyTotalDailyDemand, ["waterSupplyTotalDailyDemand"], "Total daily demand must be a number greater than 0.");
      requireNumber(data.waterSupplyDailyAbstraction, ["waterSupplyDailyAbstraction"], "Daily abstraction must be a number greater than 0.");
      requireNumber(data.waterSupplyStorageCapacity, ["waterSupplyStorageCapacity"], "Storage capacity must be a number greater than 0.");
      break;
    case "mining":
      requireNumber(data.miningQuantityPerDay, ["miningQuantityPerDay"], "Mining daily abstraction must be a number greater than 0.");
      requireNumber(data.miningQuantityPerMonth, ["miningQuantityPerMonth"], "Mining monthly abstraction must be a number greater than 0.");
      requireText(data.miningMineralsType, ["miningMineralsType"], "Type of minerals is required for mining.");
      requireNumber(
        data.miningProductionCapacityTonsPerYear,
        ["miningProductionCapacityTonsPerYear"],
        "Mining production capacity (tons/year) must be a number greater than 0."
      );
      break;
    case "fish_farming_lakes":
      requireNumber(data.fishLakeNumberOfCages, ["fishLakeNumberOfCages"], "Number of cages must be a number greater than 0.");
      requireNumber(data.fishLakeCageCapacity, ["fishLakeCageCapacity"], "Cage capacity must be a number greater than 0.");
      requireNumber(data.fishLakeAreaHectares, ["fishLakeAreaHectares"], "Concession area must be a number greater than 0.");
      break;
    case "fish_farming_ponds":
      requireNumber(data.fishPondsSurfaceAreaM2, ["fishPondsSurfaceAreaM2"], "Pond surface area must be a number greater than 0.");
      requireNumber(data.fishPondsCapacityM3, ["fishPondsCapacityM3"], "Pond capacity must be a number greater than 0.");
      requireText(data.fishPondsRefillFrequency, ["fishPondsRefillFrequency"], "Refill frequency is required.");
      requireNumber(
        data.fishPondsDiscardWaterQuantityM3PerDay,
        ["fishPondsDiscardWaterQuantityM3PerDay"],
        "Amount of water used must be a number greater than 0."
      );
      break;
    case "industry":
      requireText(data.industryDetails?.[0]?.industryType, ["industryDetails", 0, "industryType"], "Type of industry is required.");
      requireNumber(data.industryDetails?.[0]?.dailyQuantity, ["industryDetails", 0, "dailyQuantity"], "Industry daily abstraction must be a number greater than 0.");
      requireNumber(data.industryDetails?.[0]?.monthlyQuantity, ["industryDetails", 0, "monthlyQuantity"], "Industry monthly abstraction must be a number greater than 0.");
      break;
    case "electricity_generation":
      requireNumber(data.hydropowerQuantityPerYear, ["hydropowerQuantityPerYear"], "Hydropower abstraction quantity must be a number greater than 0.");
      requireNumber(
        data.hydropowerIntakeToPowerhouseDistanceM,
        ["hydropowerIntakeToPowerhouseDistanceM"],
        "Distance from intake to powerhouse must be a number greater than 0."
      );
      requireText(data.hydropowerHasDownstreamUsers, ["hydropowerHasDownstreamUsers"], "Please specify if there are downstream users.");
      requireNumber(data.hydropowerPlantCapacityMw, ["hydropowerPlantCapacityMw"], "Power plant capacity must be a number greater than 0.");
      break;
    case "construction_of_dam":
      requireText(data.constructionDamPurpose, ["constructionDamPurpose"], "Purpose of construction is required.");
      requireText(data.constructionDamDescription, ["constructionDamDescription"], "Construction project description is required.");
      requireText(data.constructionDamExpectedDuration, ["constructionDamExpectedDuration"], "Expected construction duration is required.");
      requireText(data.constructionDamAlterationPlans, ["constructionDamAlterationPlans"], "Construction alteration plans are required.");
      break;
    case "construction_of_infrastructures":
      requireText(data.infrastructurePurpose, ["infrastructurePurpose"], "Purpose of construction/installation is required.");
      requireText(data.infrastructureDescription, ["infrastructureDescription"], "Project description is required.");
      requireText(data.infrastructureExpectedDuration, ["infrastructureExpectedDuration"], "Expected duration is required.");
      requireText(data.infrastructureAlterationPlans, ["infrastructureAlterationPlans"], "Alteration plans are required.");
      requireText(data.waterSourceLatitude, ["waterSourceLatitude"], "Latitude is required for construction/installation sites.");
      requireText(data.waterSourceLongitude, ["waterSourceLongitude"], "Longitude is required for construction/installation sites.");
      break;
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
  
  // Fields to compare (excluding files, computed fields, and nested array fields handled separately below)
  const fieldsToCompare: (keyof FormValues)[] = [
    // Applicant details
    'fullNameApplicant',
    'categoryApplicant',
    'nameRepresentative',
    'representativePosition',
    // Office address
    'officeProvince',
    'officeDistrict',
    'officeSector',
    'officeCell',
    'officeVillage',
    // Contact
    'telephoneContact',
    'telephoneContactOffice',
    'emailAddress',
    'nationalIdNumber',
    // Water source
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
    // Permit
    'permitLengthYears',
    'intendedActivities',
    'intendedActivityOther',
    // Concession
    'concessionArea',
    'concessionAreaUnit',
    'permitPeriod',
    // Land
    'ownsAllLand',
    'hasLandAccess',
    // Water supply
    'waterSupplyPopulation',
    'waterSupplyPerCapitaDemand',
    'waterSupplyTotalDailyDemand',
    'waterSupplyDailyAbstraction',
    'waterSupplyStorageCapacity',
    // Irrigation
    'irrigationTotalArea',
    'irrigationCropType',
    'irrigationWaterDemand',
    'irrigationMethod',
    'irrigationStorageCapacity',
    'irrigationGrowingSeasonFrom',
    'irrigationGrowingSeasonTo',
    'irrigationProductionSystem',
    'irrigationStorageFacilities',
    // Hydropower / Electricity
    'hydropowerQuantityPerYear',
    'hydropowerIntakeToPowerhouseDistanceM',
    'hydropowerHasDownstreamUsers',
    'hydropowerPlantCapacityMw',
    // Fish farming
    'fishLakeAreaHectares',
    'fishLakeNumberOfCages',
    'fishLakeCageCapacity',
    'fishPondsSurfaceAreaM2',
    'fishPondsCapacityM3',
    'fishPondsRefillFrequency',
    'fishPondsDiscardWaterQuantityM3PerDay',
    // Coffee washing
    'coffeeWashingQuantityPerDay',
    'coffeeWashingQuantityPerMonth',
    'coffeeWashingCapacityTonsPerYear',
    // Mining
    'miningQuantityPerDay',
    'miningQuantityPerMonth',
    'miningMineralsType',
    'miningProductionCapacityTonsPerYear',
    // Construction of dam
    'constructionDamPurpose',
    'constructionDamDescription',
    'constructionDamExpectedDuration',
    'constructionDamAlterationPlans',
    // Construction of infrastructure
    'infrastructurePurpose',
    'infrastructureDescription',
    'infrastructureExpectedDuration',
    'infrastructureAlterationPlans',
    // Recreation
    'recreationType',
    'recreationProjectDescription',
    'recreationConcessionAreaM2',
  ];
  
  for (const field of fieldsToCompare) {
    const originalValue = originalData[field];
    const currentValue = currentData[field];
    
    const originalStr = JSON.stringify(originalValue ?? '');
    const currentStr = JSON.stringify(currentValue ?? '');
    
    if (originalStr !== currentStr) {
      changes[field] = {
        previous: originalValue !== undefined ? originalValue : null,
        current: currentValue !== undefined ? currentValue : null,
      };
    }
  }

  // Flatten waterAbstractionDetails (array of objects) into individual sub-field comparisons
  const abstractionSubFields = ['flowRate', 'maxAverageYearly', 'abstractionMethod'] as const;
  const origAbstraction = ((originalData.waterAbstractionDetails as any[]) || [])[0] || {};
  const currAbstraction = ((currentData.waterAbstractionDetails as any[]) || [])[0] || {};
  for (const subField of abstractionSubFields) {
    const origVal = origAbstraction[subField];
    const currVal = currAbstraction[subField];
    if (JSON.stringify(origVal ?? '') !== JSON.stringify(currVal ?? '')) {
      changes[`waterAbstraction_${subField}`] = {
        previous: origVal ?? null,
        current: currVal ?? null,
      };
    }
  }

  // Flatten industryDetails (array of objects) – compare row-by-row
  const origIndustry = (originalData.industryDetails as any[]) || [];
  const currIndustry = (currentData.industryDetails as any[]) || [];
  const industryLen = Math.max(origIndustry.length, currIndustry.length);
  for (let i = 0; i < industryLen; i++) {
    const origRow = origIndustry[i] || {};
    const currRow = currIndustry[i] || {};
    for (const key of ['industryType', 'dailyQuantity', 'monthlyQuantity'] as const) {
      const origVal = origRow[key];
      const currVal = currRow[key];
      if (JSON.stringify(origVal ?? '') !== JSON.stringify(currVal ?? '')) {
        changes[`industry_${key}_${i}`] = {
          previous: origVal ?? null,
          current: currVal ?? null,
        };
      }
    }
  }
  
  return changes;
}

// Field labels for display in modification markers
const FIELD_LABELS: Record<string, string> = {
  // Applicant
  fullNameApplicant: 'Full Name',
  categoryApplicant: 'Applicant Category',
  nameRepresentative: 'Representative Name',
  representativePosition: 'Representative Position/Title',
  // Office address
  officeProvince: 'Office Province',
  officeDistrict: 'Office District',
  officeSector: 'Office Sector',
  officeCell: 'Office Cell',
  officeVillage: 'Office Village',
  // Contact
  telephoneContact: 'Telephone',
  telephoneContactOffice: 'Office Telephone',
  emailAddress: 'Email Address',
  nationalIdNumber: 'National ID',
  // Water source
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
  // Permit
  permitLengthYears: 'Permit Duration',
  intendedActivities: 'Intended Activities',
  intendedActivityOther: 'Other Activity Details',
  // Concession
  concessionArea: 'Concession Area',
  concessionAreaUnit: 'Concession Area Unit',
  permitPeriod: 'Permit Period',
  // Land
  ownsAllLand: 'Owns All Land',
  hasLandAccess: 'Has Land Access',
  // Water supply
  waterSupplyPopulation: 'Population Served',
  waterSupplyPerCapitaDemand: 'Per Capita Demand',
  waterSupplyTotalDailyDemand: 'Total Daily Demand',
  waterSupplyDailyAbstraction: 'Daily Abstraction',
  waterSupplyStorageCapacity: 'Water Supply Storage Capacity',
  // Irrigation
  irrigationTotalArea: 'Total Irrigation Area',
  irrigationCropType: 'Crop Type',
  irrigationWaterDemand: 'Irrigation Water Demand',
  irrigationMethod: 'Irrigation Method',
  irrigationStorageCapacity: 'Irrigation Storage Capacity',
  irrigationGrowingSeasonFrom: 'Growing Season From',
  irrigationGrowingSeasonTo: 'Growing Season To',
  irrigationProductionSystem: 'Production System',
  irrigationStorageFacilities: 'Storage Facilities',
  // Water abstraction (flattened sub-fields)
  waterAbstraction_flowRate: 'Flow Rate (m³/s)',
  waterAbstraction_maxAverageYearly: 'Maximum Average Yearly (m³/year)',
  waterAbstraction_abstractionMethod: 'Method of Water Abstraction',
  // Hydropower / Electricity
  hydropowerQuantityPerYear: 'Quantity of Abstracted Water (m³/year)',
  hydropowerIntakeToPowerhouseDistanceM: 'Distance Intake to Powerhouse (m)',
  hydropowerHasDownstreamUsers: 'Downstream Water Users',
  hydropowerPlantCapacityMw: 'Power Plant Capacity (MW)',
  // Fish farming
  fishLakeAreaHectares: 'Lake Area (ha)',
  fishLakeNumberOfCages: 'Number of Cages',
  fishLakeCageCapacity: 'Cage Capacity',
  fishPondsSurfaceAreaM2: 'Ponds Surface Area (m²)',
  fishPondsCapacityM3: 'Ponds Capacity (m³)',
  fishPondsRefillFrequency: 'Ponds Refill Frequency',
  fishPondsDiscardWaterQuantityM3PerDay: 'Discard Water Quantity (m³/day)',
  // Coffee washing
  coffeeWashingQuantityPerDay: 'Coffee Washing Quantity/Day',
  coffeeWashingQuantityPerMonth: 'Coffee Washing Quantity/Month',
  coffeeWashingCapacityTonsPerYear: 'Coffee Washing Capacity (tons/year)',
  // Mining
  miningQuantityPerDay: 'Mining Water Quantity/Day',
  miningQuantityPerMonth: 'Mining Water Quantity/Month',
  miningMineralsType: 'Minerals Type',
  miningProductionCapacityTonsPerYear: 'Mining Production Capacity (tons/year)',
  // Construction of dam
  constructionDamPurpose: 'Dam Purpose',
  constructionDamDescription: 'Dam Description',
  constructionDamExpectedDuration: 'Dam Expected Duration',
  constructionDamAlterationPlans: 'Dam Alteration Plans',
  // Construction of infrastructure
  infrastructurePurpose: 'Infrastructure Purpose',
  infrastructureDescription: 'Infrastructure Description',
  infrastructureExpectedDuration: 'Infrastructure Expected Duration',
  infrastructureAlterationPlans: 'Infrastructure Alteration Plans',
  // Recreation
  recreationType: 'Recreation Type',
  recreationProjectDescription: 'Recreation Project Description',
  recreationConcessionAreaM2: 'Recreation Concession Area (m²)',
};

// Industry sub-field base labels (row index is dynamic)
const INDUSTRY_SUB_LABELS: Record<string, string> = {
  industryType: 'Industry Type',
  dailyQuantity: 'Industry Daily Quantity',
  monthlyQuantity: 'Industry Monthly Quantity',
};

function getFieldLabel(fieldName: string): string {
  if (FIELD_LABELS[fieldName]) return FIELD_LABELS[fieldName];
  const industryMatch = fieldName.match(/^industry_(\w+)_(\d+)$/);
  if (industryMatch) {
    const [, subKey, rowIdx] = industryMatch;
    const base = INDUSTRY_SUB_LABELS[subKey] || subKey;
    return Number(rowIdx) > 0 ? `${base} (Row ${Number(rowIdx) + 1})` : base;
  }
  return fieldName;
}

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
  excludeApplicationIds?: string[]; // Parent application IDs to exclude from polygon duplicate check (modification/renewal/transfer)
  editableFields?: string[]; // Field names that remain editable even when readOnly is true
  isBulkApplicant?: boolean; // True for bulk applicants (water utilities) — simplifies Water Source tab
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
  isModification: isModificationProp = false,
  originalApplicationData,
  modificationChanges,
  excludeApplicationIds = [],
  editableFields = [],
  isBulkApplicant = false,
}: ApplicationFormProps) {
  const router = useRouter();
  const { userProfile, isApplicant } = useAuth();
  const [activeTab, setActiveTab] = useState("applicant-info");
  const hasMountedRef = useRef(false);
  const [bulkNetworks, setBulkNetworks] = useState<BulkNetworkRow[]>(() => {
    const saved = (initialData as any)?.bulk_networks ?? (currentApplication as any)?.bulk_networks;
    if (Array.isArray(saved) && saved.length > 0) return saved as BulkNetworkRow[];
    return [];
  });
  // Seeding of empty rows happens once the District Water Supply activity is selected;
  // see the isDistrictWaterSupply-driven effect below (declared after isDistrictWaterSupply).
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  const [paymentPrepError, setPaymentPrepError] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [uploadedFileUrls, setUploadedFileUrls] = useState<Record<string, string>>({});
  const [locale, setLocale] = useState<AppLanguage>("en");

  useEffect(() => {
    setLocale(getPreferredLanguage());
  }, []);

  useEffect(() => {
    return subscribeToLanguageChanges((language) => setLocale(language));
  }, []);

  const translationMaps = useMemo(() => getTranslationMaps(locale), [locale]);
  const tx = useCallback(
    (value: string) => localizeText(value, locale, translationMaps.literal, translationMaps.words),
    [locale, translationMaps.literal, translationMaps.words]
  );
  const localizedFieldLabels = useMemo(() => {
    const base = Object.fromEntries(
      Object.entries(FIELD_LABELS).map(([field, label]) => [field, tx(label)])
    ) as Record<string, string>;
    if (modificationChanges) {
      for (const key of Object.keys(modificationChanges)) {
        if (!base[key]) {
          base[key] = tx(getFieldLabel(key));
        }
      }
    }
    return base;
  }, [tx, modificationChanges]);

  const localizeNode = useCallback(
    (node: React.ReactNode): React.ReactNode => {
      if (typeof node === "string") return tx(node);
      if (Array.isArray(node)) return node.map((child, idx) => <Fragment key={idx}>{localizeNode(child)}</Fragment>);
      if (!node || typeof node !== "object") return node;
      if (isValidElement(node)) {
        const element = node as React.ReactElement<any>;
        const nextProps: Record<string, unknown> = {};
        if (typeof element.props.children !== "undefined") {
          nextProps.children = localizeNode(element.props.children);
        }
        if (typeof element.props.placeholder === "string") {
          nextProps.placeholder = tx(element.props.placeholder);
        }
        if (typeof element.props.title === "string") {
          nextProps.title = tx(element.props.title);
        }
        if (typeof element.props["aria-label"] === "string") {
          nextProps["aria-label"] = tx(element.props["aria-label"]);
        }
        return cloneElement(element, nextProps);
      }
      return node;
    },
    [tx]
  );

  const Label = ({ children, ...props }: React.ComponentProps<typeof BaseLabel>) => (
    <BaseLabel {...props}>{localizeNode(children)}</BaseLabel>
  );
  const Button = ({ children, ...props }: React.ComponentProps<typeof BaseButton>) => (
    <BaseButton {...props}>{localizeNode(children)}</BaseButton>
  );
  const Input = useCallback(
    ({ placeholder, ...props }: React.ComponentProps<typeof BaseInput>) => (
      <BaseInput
        {...props}
        placeholder={typeof placeholder === "string" ? tx(placeholder) : placeholder}
      />
    ),
    [tx]
  );
  const Textarea = useCallback(
    ({ placeholder, children, ...props }: React.ComponentProps<typeof BaseTextarea>) => (
      <BaseTextarea
        {...props}
        placeholder={typeof placeholder === "string" ? tx(placeholder) : placeholder}
      >
        {localizeNode(children)}
      </BaseTextarea>
    ),
    [tx, localizeNode]
  );
  const FormLabel = ({ children, ...props }: React.ComponentProps<typeof BaseFormLabel>) => (
    <BaseFormLabel {...props}>{localizeNode(children)}</BaseFormLabel>
  );
  const FormDescription = ({ children, ...props }: React.ComponentProps<typeof BaseFormDescription>) => (
    <BaseFormDescription {...props}>{localizeNode(children)}</BaseFormDescription>
  );
  const CardTitle = ({ children, ...props }: React.ComponentProps<typeof BaseCardTitle>) => (
    <BaseCardTitle {...props}>{localizeNode(children)}</BaseCardTitle>
  );
  const CardDescription = ({ children, ...props }: React.ComponentProps<typeof BaseCardDescription>) => (
    <BaseCardDescription {...props}>{localizeNode(children)}</BaseCardDescription>
  );
  const AlertTitle = ({ children, ...props }: React.ComponentProps<typeof BaseAlertTitle>) => (
    <BaseAlertTitle {...props}>{localizeNode(children)}</BaseAlertTitle>
  );
  const AlertDescription = ({ children, ...props }: React.ComponentProps<typeof BaseAlertDescription>) => (
    <BaseAlertDescription {...props}>{localizeNode(children)}</BaseAlertDescription>
  );
  const TabsTrigger = ({ children, ...props }: React.ComponentProps<typeof BaseTabsTrigger>) => (
    <BaseTabsTrigger {...props}>{localizeNode(children)}</BaseTabsTrigger>
  );
  const SelectItem = ({ children, ...props }: React.ComponentProps<typeof BaseSelectItem>) => (
    <BaseSelectItem {...props}>{localizeNode(children)}</BaseSelectItem>
  );
  const SelectValue = ({ placeholder, ...props }: React.ComponentProps<typeof BaseSelectValue>) => (
    <BaseSelectValue
      {...props}
      placeholder={typeof placeholder === "string" ? tx(placeholder) : placeholder}
    />
  );

  const FormMessage = ({ className, ...props }: React.ComponentProps<"p">) => {
    const { error, formMessageId } = useFormField();
    const body = error ? String(error?.message ?? "") : props.children;
    if (!body) return null;
    const localizedBody = typeof body === "string" ? tx(body) : body;
    return (
      <p
        data-slot="form-message"
        id={formMessageId}
        className={`text-destructive text-sm ${className ?? ""}`.trim()}
        {...props}
      >
        {localizedBody}
      </p>
    );
  };

  
  // ⚡ PERFORMANCE: Memoize location states to reduce re-renders
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  
  // Polygon validation state
  const [coordinateValidation, setCoordinateValidation] = useState<ValidationResponse | null>(null);
  const [canSubmit, setCanSubmit] = useState(true);

  // -----------------------------
  // Coordinate parsing helpers
  // Accept common pasted formats like:
  // - "-2.490513°, 28.894413°"
  // - "-2.490513, 28.894413"
  // - "2.490513 S, 28.894413 E"
  // -----------------------------
  const parseSingleCoordinate = useCallback((raw: string): number | null => {
    if (!raw) return null;
    const s = String(raw).trim().toUpperCase();
    const m = s.match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    let n = Number.parseFloat(m[0]);
    if (!Number.isFinite(n)) return null;
    // Direction letters override sign if present
    if (/[SW]/.test(s)) n = -Math.abs(n);
    if (/[NE]/.test(s)) n = Math.abs(n);
    return n;
  }, []);

  const parseLatLngPair = useCallback((raw: string): { lat: string; lng: string } | null => {
    const s = String(raw ?? "").trim();
    if (!s) return null;

    // Prefer comma-separated inputs: "lat, lng"
    if (s.includes(",")) {
      const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const latN = parseSingleCoordinate(parts[0]);
        const lngN = parseSingleCoordinate(parts[1]);
        if (latN === null || lngN === null) return null;
        return { lat: String(latN), lng: String(lngN) };
      }
    }

    // Fallback: extract first 2 numbers from a space-separated string
    const nums = s.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 2) return null;
    const latN = parseSingleCoordinate(nums[0]);
    const lngN = parseSingleCoordinate(nums[1]);
    if (latN === null || lngN === null) return null;
    return { lat: String(latN), lng: String(lngN) };
  }, [parseSingleCoordinate]);

  // Treat the form as a "modification" flow if:
  // - the caller explicitly sets isModification, OR
  // - the loaded application row indicates it's a modification (common when resuming a saved draft).
  // This prevents the payment tab / payment gating from appearing for modification drafts.
  const isModification = Boolean(
    isModificationProp ||
      (currentApplication as any)?.is_modification ||
      (initialData as any)?.is_modification ||
      (initialData as any)?.isModification
  );

  // Payment is never required for permit modifications, and should never appear in the UI for them.
  // For applicants:
  // - editable mode: show payment widget during draft/pending_payment
  // - read-only mode: show payment confirmation details for the saved application
  // For staff: show the payment confirmation panel (read-only) for non-modification apps
  const shouldShowApplicantPaymentWidgetTab =
    !readOnly &&
    !isStaffView &&
    !isModification &&
    !currentApplication?.payment_waived &&
    (!currentApplication?.status || ['draft', 'pending_payment'].includes(currentApplication.status));
  const shouldShowApplicantPaymentDetailsTab =
    readOnly &&
    !isStaffView &&
    !isModification &&
    Boolean((currentApplication as any)?.id ?? (initialData as any)?.id);
  const shouldShowStaffPaymentTab = isStaffView && !isModification;
  const shouldShowPaymentTab =
    shouldShowApplicantPaymentWidgetTab || shouldShowApplicantPaymentDetailsTab || shouldShowStaffPaymentTab;

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  const tabLabels: Record<string, string> = {
    "applicant-info": tx("Applicant"),
    "water-source": tx("Water Source"),
    "intended-activity": tx("Activity"),
    "land-ownership": tx("Land"),
    payment: tx("Payment"),
  };

  const validateAllTabsBeforeSubmit = async (): Promise<boolean> => {
    const tabs = getTabs();
    const validateByTab: Record<string, (() => Promise<boolean>) | undefined> = {
      // Wrap in lambdas to avoid temporal-dead-zone issues with const-declared validators.
      "applicant-info": () => validateApplicantTab(),
      "water-source": () => validateWaterSourceTab(),
      "intended-activity": () => validateIntendedActivityTab(),
      "land-ownership": () => validateLandOwnershipTab(),
    };

    setValidationError(null);
    for (const tab of tabs) {
      if (tab === "payment") continue;
      const validate = validateByTab[tab];
      if (!validate) continue;

      const ok = await validate();
      if (!ok) {
        setActiveTab(tab);
        // Preserve the more specific validator error when present.
        setValidationError((prev) =>
          prev || tx(`Please complete all required fields in ${tabLabels[tab] || "this"} section before submitting.`)
        );
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return false;
      }
    }
    return true;
  };
  
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
      representativePosition: "",
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
      waterAbstractionDetails: [{ flowRate: undefined, flowRateUnit: "m3_per_second", maxAverageYearly: undefined, abstractionMethod: "" }],
      intendedActivities: [],
      intendedActivityOther: "",
      ownsAllLand: null,
      hasLandAccess: null,
      certificationAgreement: false,
      waterSupplyPopulation: undefined,
      waterSupplyPerCapitaDemand: undefined,
      waterSupplyTotalDailyDemand: undefined,
      waterSupplyDailyAbstraction: undefined,
      waterSupplyStorageCapacity: undefined,
      miningQuantityPerDay: undefined,
      miningQuantityPerMonth: undefined,
      miningMineralsType: "",
      miningProductionCapacityTonsPerYear: undefined,
      fishLakeAreaHectares: undefined,
      fishLakeNumberOfCages: undefined,
      fishLakeCageCapacity: undefined,
      fishPondsSurfaceAreaM2: undefined,
      fishPondsCapacityM3: undefined,
      fishPondsRefillFrequency: "",
      fishPondsDiscardWaterQuantityM3PerDay: undefined,
      coffeeWashingQuantityPerDay: undefined,
      coffeeWashingQuantityPerMonth: undefined,
      coffeeWashingCapacityTonsPerYear: undefined,
      hydropowerQuantityPerYear: undefined,
      hydropowerIntakeToPowerhouseDistanceM: undefined,
      hydropowerHasDownstreamUsers: undefined,
      hydropowerPlantCapacityMw: undefined,
      constructionDamPurpose: "",
      constructionDamDescription: "",
      constructionDamExpectedDuration: "",
      constructionDamAlterationPlans: "",
      infrastructurePurpose: "",
      infrastructureDescription: "",
      infrastructureExpectedDuration: "",
      infrastructureAlterationPlans: "",
      recreationType: "",
      recreationProjectDescription: "",
      recreationConcessionAreaM2: undefined,
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
      // Hidden flag read by superRefine to skip water-source field checks for bulk applicants.
      // Initialised here to avoid a race window before the useEffect fires.
      _isBulk: isBulkApplicant,
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
      
      // Set ID information (national ID or TIN, for both individuals and companies)
      if (userProfile.id_number) {
        defaults.nationalIdNumber = userProfile.id_number;
      } else if (userProfile.company_tin) {
        defaults.nationalIdNumber = userProfile.company_tin;
      }
    }

    // Override with any provided initial data
    const merged = { ...defaults, ...initialData };

    // fullNameApplicant always comes from the logged-in user's profile
    if (userProfile) {
      if (userProfile.account_type === 'individual') {
        merged.fullNameApplicant = `${userProfile.first_name || ""} ${userProfile.last_name || ""}`.trim() || merged.fullNameApplicant;
      } else if (userProfile.account_type === 'company') {
        merged.fullNameApplicant = userProfile.company_name || merged.fullNameApplicant;
      }
    }

    return merged;
  }, [initialData, userProfile, isBulkApplicant]);

  const form = useForm<FormValues>({
    // Skip validation resolver in read-only mode - not needed and can cause initialization issues
    resolver: readOnly ? undefined : zodResolver(applicationFormSchema),
    defaultValues: getDefaultValues,
    // Keep conditional activity fields in form state when their UI unmounts between tabs.
    shouldUnregister: false,
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

  const editableFieldSet = useMemo(() => new Set(editableFields), [editableFields]);

  // Helper function to get input props based on readOnly state
  const getInputProps = (baseProps: any = {}, fieldName?: string) => {
    const localizedProps = {
      ...baseProps,
      placeholder:
        typeof baseProps.placeholder === "string"
          ? tx(baseProps.placeholder)
          : baseProps.placeholder,
    };
    if (readOnly && !(fieldName && editableFieldSet.has(fieldName))) {
      return {
        ...localizedProps,
        readOnly: true,
        disabled: true,
        className: `${baseProps.className || ''} bg-gray-50 border-gray-200 cursor-default`.trim()
      };
    }
    return localizedProps;
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
  const watchedWaterUseCategory = form.watch("waterUseCategory");
  const watchedOwnsAllLand = form.watch("ownsAllLand");
  const watchedCertificationAgreement = form.watch("certificationAgreement");
  const watchedIrrigationTotalArea = form.watch("irrigationTotalArea");

  // Derived: effective water use category.
  // Fish farming in lakes & recreational activities → always concession.
  // All other activities → user-selectable, defaulting to abstraction.
  const pureConcessionActivities = ["fish_farming_lakes", "recreation_activities"];
  const isPureConcession = watchedIntendedActivities?.some((a: string) => pureConcessionActivities.includes(a)) ?? false;
  const effectiveWaterUseCategory: "abstraction" | "concession" = isPureConcession
    ? "concession"
    : (watchedWaterUseCategory ?? "abstraction");

  const isDistrictWaterSupply = watchedIntendedActivities?.includes("district_water_supply") ?? false;

  // Seed 5 empty network rows when District Water Supply is selected and the table is empty.
  // Keyed on the selected activity (not the bulk profile flag) so any user gets the rows.
  useEffect(() => {
    if (isDistrictWaterSupply && bulkNetworks.length === 0 && !readOnly) {
      setBulkNetworks(Array.from({ length: 5 }, (_, i) => emptyBulkRow(i + 1)));
    }
  }, [isDistrictWaterSupply]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-set waterUseCategory based on selected activity — concession activities lock to "concession",
  // all others lock to "abstraction". No manual override allowed.
  useEffect(() => {
    if (isPureConcession) {
      form.setValue('waterUseCategory', 'concession', { shouldDirty: false, shouldTouch: false, shouldValidate: false });
    } else if (form.getValues('waterUseCategory') === 'concession') {
      form.setValue('waterUseCategory', 'abstraction', { shouldDirty: false, shouldTouch: false, shouldValidate: false });
    }
  }, [isPureConcession, form]);

  const [additionalDocuments, setAdditionalDocuments] = useState<Array<{
    id: string;
    name: string;
    category: string;
    description?: string;
    file?: File | null;
    url?: string;
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

  const isFilled = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (typeof value === "number") return Number.isFinite(value);
    return true;
  };

  const hasCompleteWaterAbstractionDetails = (details: any[]): boolean => {
    if (!Array.isArray(details) || details.length === 0) return false;
    return details.every((detail) => {
      return (
        isFilled(detail?.flowRate) &&
        isFilled(detail?.maxAverageYearly) &&
        isFilled(detail?.abstractionMethod)
      );
    });
  };

  // Tab validation functions
  const validateApplicantTab = async () => {
    const categoryApplicant = String(form.getValues('categoryApplicant') ?? '').trim().toLowerCase();
    const requiresRepresentativeFields = ["company", "cooperative", "organization", "institution"].includes(categoryApplicant);
    const fields = [
      'fullNameApplicant', 'categoryApplicant', 'officeProvince', 
      'officeDistrict', 'officeSector', 'officeCell', 'telephoneContact', 'emailAddress'
    ];
    if (requiresRepresentativeFields) {
      fields.push('nameRepresentative', 'representativePosition');
    }
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
    // District Water Supply only shows permit duration on this tab — skip all other water source fields.
    if (isDistrictWaterSupply) {
      return form.trigger(['permitLengthYears'] as any);
    }
    // Sector/cell are not shown for district water supply — skip their validation.
    const fields = isDistrictWaterSupply
      ? ['waterSourceType', 'nameSourceWater', 'waterSourceProvince', 'waterSourceDistrict', 'waterReliability', 'permitLengthYears']
      : ['waterSourceType', 'nameSourceWater', 'waterSourceProvince', 'waterSourceDistrict', 'waterSourceSector', 'waterSourceCell', 'waterReliability', 'permitLengthYears'];

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

    const intended = form.getValues('intendedActivities') || [];
    const selectedActivity = intended[0];
    const pureConcessionActs = ['fish_farming_lakes', 'recreation_activities'];
    const isPureConcessionAct = intended.some((a: string) => pureConcessionActs.includes(a));
    const savedCategory = form.getValues('waterUseCategory');
    const effectiveCat = isPureConcessionAct ? 'concession' : (savedCategory ?? 'abstraction');
    const requiresConcessionPolygons = effectiveCat === 'concession';
    const requiresAbstractionDetails = effectiveCat === 'abstraction' && selectedActivity !== 'district_water_supply';
    const requiresRecreationDetails = intended.includes('recreation_activities');

    const hasText = (value: unknown) => String(value ?? '').trim() !== '';
    const isPositiveNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;
    const requireTextField = (path: string, value: unknown, message: string): boolean => {
      if (!hasText(value)) {
        form.setError(path as any, { type: 'manual', message });
        return false;
      }
      form.clearErrors(path as any);
      return true;
    };
    const requireNumberField = (path: string, value: unknown, message: string): boolean => {
      if (!isPositiveNumber(value)) {
        form.setError(path as any, { type: 'manual', message });
        return false;
      }
      form.clearErrors(path as any);
      return true;
    };

    let hasMissingActivityFields = false;
    switch (selectedActivity) {
      case 'other':
        hasMissingActivityFields = !requireTextField('intendedActivityOther', form.getValues('intendedActivityOther'), "Please specify the 'Other' intended activity.");
        break;
      case 'irrigation':
        hasMissingActivityFields =
          !requireTextField('irrigationCropType', form.getValues('irrigationCropType'), 'Crop type is required for irrigation.') ||
          !requireTextField('irrigationGrowingSeasonFrom', form.getValues('irrigationGrowingSeasonFrom'), 'Growing season start month is required.') ||
          !requireTextField('irrigationGrowingSeasonTo', form.getValues('irrigationGrowingSeasonTo'), 'Growing season end month is required.') ||
          !requireTextField('irrigationProductionSystem', form.getValues('irrigationProductionSystem'), 'Production system is required for irrigation.') ||
          !requireTextField('irrigationMethod', form.getValues('irrigationMethod'), 'Irrigation method is required.') ||
          !requireNumberField('irrigationTotalArea', form.getValues('irrigationTotalArea'), 'Total irrigated area must be a number greater than 0.') ||
          !requireNumberField('irrigationWaterDemand', form.getValues('irrigationWaterDemand'), 'Irrigation water demand must be a number greater than 0.');
        break;
      case 'district_water_supply':
        // No activity-specific numeric fields — district + networks are validated below.
        break;
      case 'water_supply':
        hasMissingActivityFields =
          !requireNumberField('waterSupplyPopulation', form.getValues('waterSupplyPopulation'), 'Population to be served must be a number greater than 0.') ||
          !requireNumberField('waterSupplyPerCapitaDemand', form.getValues('waterSupplyPerCapitaDemand'), 'Per-capita demand must be a number greater than 0.') ||
          !requireNumberField('waterSupplyTotalDailyDemand', form.getValues('waterSupplyTotalDailyDemand'), 'Total daily demand must be a number greater than 0.') ||
          !requireNumberField('waterSupplyDailyAbstraction', form.getValues('waterSupplyDailyAbstraction'), 'Daily abstraction must be a number greater than 0.') ||
          !requireNumberField('waterSupplyStorageCapacity', form.getValues('waterSupplyStorageCapacity'), 'Storage capacity must be a number greater than 0.');
        break;
      case 'mining':
        hasMissingActivityFields =
          !requireNumberField('miningQuantityPerDay', form.getValues('miningQuantityPerDay'), 'Mining daily abstraction must be a number greater than 0.') ||
          !requireNumberField('miningQuantityPerMonth', form.getValues('miningQuantityPerMonth'), 'Mining monthly abstraction must be a number greater than 0.') ||
          !requireTextField('miningMineralsType', form.getValues('miningMineralsType'), 'Type of minerals is required for mining.') ||
          !requireNumberField('miningProductionCapacityTonsPerYear', form.getValues('miningProductionCapacityTonsPerYear'), 'Mining production capacity (tons/year) must be a number greater than 0.');
        break;
      case 'fish_farming_lakes':
        hasMissingActivityFields =
          !requireNumberField('fishLakeNumberOfCages', form.getValues('fishLakeNumberOfCages'), 'Number of cages must be a number greater than 0.') ||
          !requireNumberField('fishLakeCageCapacity', form.getValues('fishLakeCageCapacity'), 'Cage capacity must be a number greater than 0.') ||
          !requireNumberField('fishLakeAreaHectares', form.getValues('fishLakeAreaHectares'), 'Concession area must be a number greater than 0.');
        break;
      case 'fish_farming_ponds':
        hasMissingActivityFields =
          !requireNumberField('fishPondsSurfaceAreaM2', form.getValues('fishPondsSurfaceAreaM2'), 'Pond surface area must be a number greater than 0.') ||
          !requireNumberField('fishPondsCapacityM3', form.getValues('fishPondsCapacityM3'), 'Pond capacity must be a number greater than 0.') ||
          !requireTextField('fishPondsRefillFrequency', form.getValues('fishPondsRefillFrequency'), 'Refill frequency is required.') ||
          !requireNumberField('fishPondsDiscardWaterQuantityM3PerDay', form.getValues('fishPondsDiscardWaterQuantityM3PerDay'), 'Amount of water used must be a number greater than 0.');
        break;
      case 'industry': {
        const firstIndustry = form.getValues('industryDetails')?.[0];
        hasMissingActivityFields =
          !requireTextField('industryDetails.0.industryType', firstIndustry?.industryType, 'Type of industry is required.') ||
          !requireNumberField('industryDetails.0.dailyQuantity', firstIndustry?.dailyQuantity, 'Industry daily abstraction must be a number greater than 0.') ||
          !requireNumberField('industryDetails.0.monthlyQuantity', firstIndustry?.monthlyQuantity, 'Industry monthly abstraction must be a number greater than 0.');
        break;
      }
      case 'electricity_generation':
        hasMissingActivityFields =
          !requireNumberField('hydropowerQuantityPerYear', form.getValues('hydropowerQuantityPerYear'), 'Hydropower abstraction quantity must be a number greater than 0.') ||
          !requireNumberField('hydropowerIntakeToPowerhouseDistanceM', form.getValues('hydropowerIntakeToPowerhouseDistanceM'), 'Distance from intake to powerhouse must be a number greater than 0.') ||
          !requireTextField('hydropowerHasDownstreamUsers', form.getValues('hydropowerHasDownstreamUsers'), 'Please specify if there are downstream users.') ||
          !requireNumberField('hydropowerPlantCapacityMw', form.getValues('hydropowerPlantCapacityMw'), 'Power plant capacity must be a number greater than 0.');
        break;
      case 'construction_of_dam':
        hasMissingActivityFields =
          !requireTextField('constructionDamPurpose', form.getValues('constructionDamPurpose'), 'Purpose of construction is required.') ||
          !requireTextField('constructionDamDescription', form.getValues('constructionDamDescription'), 'Construction project description is required.') ||
          !requireTextField('constructionDamExpectedDuration', form.getValues('constructionDamExpectedDuration'), 'Expected construction duration is required.') ||
          !requireTextField('constructionDamAlterationPlans', form.getValues('constructionDamAlterationPlans'), 'Construction alteration plans are required.');
        break;
      case 'construction_of_infrastructures':
        hasMissingActivityFields =
          !requireTextField('infrastructurePurpose', form.getValues('infrastructurePurpose'), 'Purpose of construction/installation is required.') ||
          !requireTextField('infrastructureDescription', form.getValues('infrastructureDescription'), 'Project description is required.') ||
          !requireTextField('infrastructureExpectedDuration', form.getValues('infrastructureExpectedDuration'), 'Expected duration is required.') ||
          !requireTextField('infrastructureAlterationPlans', form.getValues('infrastructureAlterationPlans'), 'Alteration plans are required.') ||
          !requireTextField('waterSourceLatitude', form.getValues('waterSourceLatitude'), 'Latitude is required for construction/installation sites.') ||
          !requireTextField('waterSourceLongitude', form.getValues('waterSourceLongitude'), 'Longitude is required for construction/installation sites.');
        break;
      case 'coffee_washing':
        hasMissingActivityFields =
          !requireNumberField('coffeeWashingQuantityPerDay', form.getValues('coffeeWashingQuantityPerDay'), 'Coffee washing daily abstraction must be a number greater than 0.') ||
          !requireNumberField('coffeeWashingQuantityPerMonth', form.getValues('coffeeWashingQuantityPerMonth'), 'Coffee washing monthly abstraction must be a number greater than 0.') ||
          !requireNumberField('coffeeWashingCapacityTonsPerYear', form.getValues('coffeeWashingCapacityTonsPerYear'), 'Coffee washing capacity (tons/year) must be a number greater than 0.');
        break;
      default:
        break;
    }

    if (hasMissingActivityFields) {
      setValidationError('Please complete all required fields for the selected activity before proceeding.');
      return false;
    }

    if (selectedActivity === 'district_water_supply') {
      const district = form.getValues('waterSourceDistrict') || '';
      if (!district.trim()) {
        setValidationError('Please select a district for the water supply networks.');
        return false;
      }
      const nonEmptyRows = bulkNetworks.filter((r) =>
        r.network_name?.trim() || r.sector?.trim() || r.cell?.trim() ||
        r.coordinates?.trim() || r.capacity_m3_day || r.abstraction_method?.trim()
      );
      if (nonEmptyRows.length === 0) {
        setValidationError('Please add at least one network with all required fields filled.');
        return false;
      }
      const incompleteRows = nonEmptyRows.filter((r) =>
        !r.network_name?.trim() || !r.sector?.trim() || !r.cell?.trim() ||
        !r.coordinates?.trim() || !r.capacity_m3_day || !r.abstraction_method?.trim()
      );
      if (incompleteRows.length > 0) {
        setValidationError('Each network row must have Network Name, Sector, Cell, Coordinates, Capacity, and Abstraction Method filled in.');
        return false;
      }
      if (!checkRequiredDocuments()) {
        setValidationError("Please upload all required documents for your selected activities before proceeding.");
        return false;
      }
      return true;
    }

    if (requiresRecreationDetails) {
      const recreationProjectDescription = String(form.getValues('recreationProjectDescription') ?? '').trim();
      const recreationConcessionAreaM2 = form.getValues('recreationConcessionAreaM2');

      if (!recreationProjectDescription) {
        form.setError('recreationProjectDescription', {
          type: 'manual',
          message: 'Recreational activities details are required.'
        });
      } else {
        form.clearErrors('recreationProjectDescription');
      }

      if (!(typeof recreationConcessionAreaM2 === 'number' && Number.isFinite(recreationConcessionAreaM2) && recreationConcessionAreaM2 > 0)) {
        form.setError('recreationConcessionAreaM2', {
          type: 'manual',
          message: 'Concession area (m²) must be a number greater than 0.'
        });
      } else {
        form.clearErrors('recreationConcessionAreaM2');
      }

      if (!recreationProjectDescription || !(typeof recreationConcessionAreaM2 === 'number' && Number.isFinite(recreationConcessionAreaM2) && recreationConcessionAreaM2 > 0)) {
        setValidationError("Please fill in Recreational Activities Details and Concession area (m²) before proceeding.");
        return false;
      }
    }
    
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
        if (!hasCompleteWaterAbstractionDetails(details)) {
          details.forEach((detail: any, index: number) => {
            if (!isFilled(detail?.flowRate)) {
              form.setError(`waterAbstractionDetails.${index}.flowRate` as any, {
                type: "manual",
                message: "Flow rate is required."
              });
            }
            if (!isFilled(detail?.maxAverageYearly)) {
              form.setError(`waterAbstractionDetails.${index}.maxAverageYearly` as any, {
                type: "manual",
                message: "Maximum average yearly abstraction is required."
              });
            }
            if (!isFilled(detail?.abstractionMethod)) {
              form.setError(`waterAbstractionDetails.${index}.abstractionMethod` as any, {
                type: "manual",
                message: "Method of water abstraction is required."
              });
            }
          });
          setValidationError("Complete all required Water Abstraction Details before proceeding.");
          return false;
        }
        details.forEach((_: any, index: number) => {
          form.clearErrors(`waterAbstractionDetails.${index}.flowRate` as any);
          form.clearErrors(`waterAbstractionDetails.${index}.maxAverageYearly` as any);
          form.clearErrors(`waterAbstractionDetails.${index}.abstractionMethod` as any);
        });
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
          applicationId: currentApplication?.id,
          excludeApplicationIds
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
    const hasLandAccess = form.getValues('hasLandAccess');

    if (ownsAllLand === undefined || ownsAllLand === null) {
      form.setError('ownsAllLand' as any, {
        type: 'manual',
        message: 'Please indicate whether you own all required land.'
      });
      setValidationError("Please indicate whether you own all required land before proceeding.");
      return false;
    }
    
    // Check land ownership document if user owns all land
    if (ownsAllLand === true) {
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
    
    // When user doesn't own all land: must answer Q17 (hasLandAccess)
    if (ownsAllLand === false) {
      if (hasLandAccess === undefined || hasLandAccess === null) {
        form.setError('hasLandAccess' as any, {
          type: 'manual',
          message: 'Please indicate whether you have access to the land.'
        });
        setValidationError("Please indicate whether you have access to the land before proceeding.");
        return false;
      }
      if (hasLandAccess === false) {
        form.setError('hasLandAccess' as any, {
          type: 'manual',
          message: 'You cannot proceed without access to the land. Please obtain land access before applying for a water permit.'
        });
        setValidationError("You cannot proceed without access to the land. Please obtain land access before applying.");
        return false;
      }
      form.clearErrors('hasLandAccess' as any);
      
      // Only require land access documents when user has indicated they have access
      if (!checkLandAccessDocuments()) {
        form.setError('landAccessDocuments' as any, {
          type: 'manual',
          message: 'Proof of land access is required when you do not own all the required land.'
        });
        setValidationError("Please upload the required land access documents before proceeding.");
        return false;
      }
      form.clearErrors('landAccessDocuments' as any);
    }
    
    return errors;
  };

  const getTabs = () => {
    // District Water Supply skips the land-ownership tab entirely
    if (isDistrictWaterSupply) {
      return shouldShowPaymentTab
        ? ["applicant-info", "intended-activity", "water-source", "payment"]
        : ["applicant-info", "intended-activity", "water-source"];
    }
    return shouldShowPaymentTab
      ? ["applicant-info", "intended-activity", "water-source", "land-ownership", "payment"]
      : ["applicant-info", "intended-activity", "water-source", "land-ownership"];
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
        const normalizedCategoryApplicant = String(categoryApplicant).trim().toLowerCase();
        const requiresRepresentativeFields = ["company", "cooperative", "organization", "institution"].includes(normalizedCategoryApplicant);
        const nameRepresentative = String(form.watch('nameRepresentative') || form.getValues('nameRepresentative') || '').trim();
        const representativePosition = String(form.watch('representativePosition') || form.getValues('representativePosition') || '').trim();
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
        const hasRepresentativeFields =
          !requiresRepresentativeFields ||
          (nameRepresentative !== '' && representativePosition !== '');
          
        // Check identification document
        const hasIdentificationDoc = files.identificationDoc || uploadedFileUrls.identificationDoc;
        return !hasApplicantFields || !hasRepresentativeFields || !hasIdentificationDoc;
      }
        
      case "water-source": {
        const permitLength = form.watch('permitLengthYears') ?? form.getValues('permitLengthYears');
        const hasPermitLength = typeof permitLength === 'number' && permitLength >= 1 && permitLength <= 15;

        // District Water Supply only shows permit duration — that's the only gate.
        if (isDistrictWaterSupply) return !hasPermitLength;

        // Non-district: check all visible water source fields.
        const waterSourceType = form.watch('waterSourceType') || form.getValues('waterSourceType') || '';
        const waterReliability = form.watch('waterReliability') || form.getValues('waterReliability') || 'water_always_available';
        const nameSourceWater = form.watch('nameSourceWater') || form.getValues('nameSourceWater') || '';
        const waterSourceProvince = form.watch('waterSourceProvince') || form.getValues('waterSourceProvince') || '';
        const waterSourceDistrict = form.watch('waterSourceDistrict') || form.getValues('waterSourceDistrict') || '';
        const waterSourceSector = form.watch('waterSourceSector') || form.getValues('waterSourceSector') || '';
        const waterSourceCell = form.watch('waterSourceCell') || form.getValues('waterSourceCell') || '';

        const hasWaterSourceFields = isDistrictWaterSupply
          ? waterSourceType.trim() !== '' &&
            nameSourceWater.trim() !== '' &&
            waterSourceProvince.trim() !== '' &&
            waterSourceDistrict.trim() !== '' &&
            waterReliability.trim() !== ''
          : waterSourceType.trim() !== '' &&
            nameSourceWater.trim() !== '' &&
            waterSourceProvince.trim() !== '' &&
            waterSourceDistrict.trim() !== '' &&
            waterSourceSector.trim() !== '' &&
            waterSourceCell.trim() !== '' &&
            waterReliability.trim() !== '';

        return !hasWaterSourceFields || !hasPermitLength;
      }
        
      case "intended-activity": {
        // Check required fields and documents for intended activity tab
        // Use form.watch() to ensure reactive updates when fields change
        const intendedActivities = form.watch('intendedActivities') || form.getValues('intendedActivities') || [];
        const waterAbstractionDetails = form.watch('waterAbstractionDetails') || form.getValues('waterAbstractionDetails') || [];
        const recreationProjectDescription = String(form.watch('recreationProjectDescription') || form.getValues('recreationProjectDescription') || '').trim();
        const recreationConcessionAreaM2 = form.watch('recreationConcessionAreaM2') ?? form.getValues('recreationConcessionAreaM2');
        const hasRequiredDocs = checkRequiredDocuments();
        
        // Must have at least one activity selected
        if (intendedActivities.length === 0) {
          return true; // Disable Next button
        }
        
        const selectedActivity = intendedActivities[0];
        const hasText = (v: unknown) => String(v ?? '').trim() !== '';
        const isPositiveNumber = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
        
        // Activity-specific required field checks - Next button stays disabled until all are filled
        let hasActivityFields = true;
        switch (selectedActivity) {
          case 'other':
            hasActivityFields = hasText(form.watch('intendedActivityOther') ?? form.getValues('intendedActivityOther'));
            break;
          case 'irrigation':
            hasActivityFields =
              hasText(form.watch('irrigationCropType') ?? form.getValues('irrigationCropType')) &&
              hasText(form.watch('irrigationGrowingSeasonFrom') ?? form.getValues('irrigationGrowingSeasonFrom')) &&
              hasText(form.watch('irrigationGrowingSeasonTo') ?? form.getValues('irrigationGrowingSeasonTo')) &&
              hasText(form.watch('irrigationProductionSystem') ?? form.getValues('irrigationProductionSystem')) &&
              hasText(form.watch('irrigationMethod') ?? form.getValues('irrigationMethod')) &&
              isPositiveNumber(form.watch('irrigationTotalArea') ?? form.getValues('irrigationTotalArea')) &&
              isPositiveNumber(form.watch('irrigationWaterDemand') ?? form.getValues('irrigationWaterDemand'));
            break;
          case 'water_supply':
            hasActivityFields =
              isPositiveNumber(form.watch('waterSupplyPopulation') ?? form.getValues('waterSupplyPopulation')) &&
              isPositiveNumber(form.watch('waterSupplyPerCapitaDemand') ?? form.getValues('waterSupplyPerCapitaDemand')) &&
              isPositiveNumber(form.watch('waterSupplyTotalDailyDemand') ?? form.getValues('waterSupplyTotalDailyDemand')) &&
              isPositiveNumber(form.watch('waterSupplyDailyAbstraction') ?? form.getValues('waterSupplyDailyAbstraction')) &&
              isPositiveNumber(form.watch('waterSupplyStorageCapacity') ?? form.getValues('waterSupplyStorageCapacity'));
            break;
          case 'mining':
            hasActivityFields =
              isPositiveNumber(form.watch('miningQuantityPerDay') ?? form.getValues('miningQuantityPerDay')) &&
              isPositiveNumber(form.watch('miningQuantityPerMonth') ?? form.getValues('miningQuantityPerMonth')) &&
              hasText(form.watch('miningMineralsType') ?? form.getValues('miningMineralsType')) &&
              isPositiveNumber(form.watch('miningProductionCapacityTonsPerYear') ?? form.getValues('miningProductionCapacityTonsPerYear'));
            break;
          case 'fish_farming_lakes':
            hasActivityFields =
              isPositiveNumber(form.watch('fishLakeNumberOfCages') ?? form.getValues('fishLakeNumberOfCages')) &&
              isPositiveNumber(form.watch('fishLakeCageCapacity') ?? form.getValues('fishLakeCageCapacity')) &&
              isPositiveNumber(form.watch('fishLakeAreaHectares') ?? form.getValues('fishLakeAreaHectares'));
            break;
          case 'fish_farming_ponds':
            hasActivityFields =
              isPositiveNumber(form.watch('fishPondsSurfaceAreaM2') ?? form.getValues('fishPondsSurfaceAreaM2')) &&
              isPositiveNumber(form.watch('fishPondsCapacityM3') ?? form.getValues('fishPondsCapacityM3')) &&
              hasText(form.watch('fishPondsRefillFrequency') ?? form.getValues('fishPondsRefillFrequency')) &&
              isPositiveNumber(form.watch('fishPondsDiscardWaterQuantityM3PerDay') ?? form.getValues('fishPondsDiscardWaterQuantityM3PerDay'));
            break;
          case 'industry': {
            const firstIndustry = form.watch('industryDetails')?.[0] ?? form.getValues('industryDetails')?.[0];
            hasActivityFields =
              hasText(firstIndustry?.industryType) &&
              isPositiveNumber(firstIndustry?.dailyQuantity) &&
              isPositiveNumber(firstIndustry?.monthlyQuantity);
            break;
          }
          case 'electricity_generation':
            hasActivityFields =
              isPositiveNumber(form.watch('hydropowerQuantityPerYear') ?? form.getValues('hydropowerQuantityPerYear')) &&
              isPositiveNumber(form.watch('hydropowerIntakeToPowerhouseDistanceM') ?? form.getValues('hydropowerIntakeToPowerhouseDistanceM')) &&
              hasText(form.watch('hydropowerHasDownstreamUsers') ?? form.getValues('hydropowerHasDownstreamUsers')) &&
              isPositiveNumber(form.watch('hydropowerPlantCapacityMw') ?? form.getValues('hydropowerPlantCapacityMw'));
            break;
          case 'construction_of_dam':
            hasActivityFields =
              hasText(form.watch('constructionDamPurpose') ?? form.getValues('constructionDamPurpose')) &&
              hasText(form.watch('constructionDamDescription') ?? form.getValues('constructionDamDescription')) &&
              hasText(form.watch('constructionDamExpectedDuration') ?? form.getValues('constructionDamExpectedDuration')) &&
              hasText(form.watch('constructionDamAlterationPlans') ?? form.getValues('constructionDamAlterationPlans'));
            break;
          case 'construction_of_infrastructures':
            hasActivityFields =
              hasText(form.watch('infrastructurePurpose') ?? form.getValues('infrastructurePurpose')) &&
              hasText(form.watch('infrastructureDescription') ?? form.getValues('infrastructureDescription')) &&
              hasText(form.watch('infrastructureExpectedDuration') ?? form.getValues('infrastructureExpectedDuration')) &&
              hasText(form.watch('infrastructureAlterationPlans') ?? form.getValues('infrastructureAlterationPlans')) &&
              hasText(form.watch('waterSourceLatitude') ?? form.getValues('waterSourceLatitude')) &&
              hasText(form.watch('waterSourceLongitude') ?? form.getValues('waterSourceLongitude'));
            break;
          case 'coffee_washing':
            hasActivityFields =
              isPositiveNumber(form.watch('coffeeWashingQuantityPerDay') ?? form.getValues('coffeeWashingQuantityPerDay')) &&
              isPositiveNumber(form.watch('coffeeWashingQuantityPerMonth') ?? form.getValues('coffeeWashingQuantityPerMonth')) &&
              isPositiveNumber(form.watch('coffeeWashingCapacityTonsPerYear') ?? form.getValues('coffeeWashingCapacityTonsPerYear'));
            break;
          default:
            break;
        }
        
        if (!hasActivityFields) return true;

        if (isDistrictWaterSupply) {
          const district = form.watch('waterSourceDistrict') || form.getValues('waterSourceDistrict') || '';
          if (!district.trim()) return true;
          const nonEmptyRows = bulkNetworks.filter((r) =>
            r.network_name?.trim() || r.sector?.trim() || r.cell?.trim() ||
            r.coordinates?.trim() || r.capacity_m3_day || r.abstraction_method?.trim()
          );
          if (nonEmptyRows.length === 0) return true;
          const allComplete = nonEmptyRows.every((r) =>
            r.network_name?.trim() && r.sector?.trim() && r.cell?.trim() &&
            r.coordinates?.trim() && r.capacity_m3_day && r.abstraction_method?.trim()
          );
          if (!allComplete) return true;
          return !hasRequiredDocs;
        }

        const pureConcessionActs = ['fish_farming_lakes', 'recreation_activities'];
        const isPureConcessionAct = intendedActivities.some((a: string) => pureConcessionActs.includes(a));
        const savedCat = form.getValues('waterUseCategory');
        const effectiveCat = isPureConcessionAct ? 'concession' : (savedCat ?? 'abstraction');
        const isConcessionActivity = effectiveCat === 'concession';
        const isAbstractionActivity = effectiveCat === 'abstraction';
        
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
          const hasRecreationActivity = intendedActivities.includes('recreation_activities');
          const hasRecreationDetails =
            !hasRecreationActivity ||
            (recreationProjectDescription !== '' &&
              typeof recreationConcessionAreaM2 === 'number' &&
              Number.isFinite(recreationConcessionAreaM2) &&
              recreationConcessionAreaM2 > 0);
          return !hasRequiredDocs || !hasValidPolygons || !hasRecreationDetails;
        }
        
        // For abstraction activities, water abstraction details and LAT/LONG are required
        if (isAbstractionActivity) {
          const hasAbstractionDetails = hasCompleteWaterAbstractionDetails(waterAbstractionDetails);
          const lat = String(form.watch('waterSourceLatitude') ?? form.getValues('waterSourceLatitude') ?? '').trim();
          const lng = String(form.watch('waterSourceLongitude') ?? form.getValues('waterSourceLongitude') ?? '').trim();
          const hasLatLng = lat !== '' && lng !== '';
          return !hasAbstractionDetails || !hasLatLng || !hasRequiredDocs;
        }
        
        return !hasRequiredDocs;
      }
        
      case "land-ownership": {
        const ownsAllLand = form.watch('ownsAllLand') ?? form.getValues('ownsAllLand');
        const hasLandAccess = form.watch('hasLandAccess') ?? form.getValues('hasLandAccess');
        const hasCertified = Boolean(form.watch('certificationAgreement') ?? form.getValues('certificationAgreement'));
        
        if (ownsAllLand === undefined || ownsAllLand === null) return true;
        if (!hasCertified) return true;
        
        // Cannot proceed without land access when user doesn't own all land
        if (ownsAllLand === false && hasLandAccess === false) return true;
        if (ownsAllLand === false && (hasLandAccess === undefined || hasLandAccess === null)) return true;
        
        if (ownsAllLand === true) {
          const hasLandOwnershipDoc = Boolean(files.landOwnershipDoc || uploadedFileUrls.landOwnershipDoc);
          if (!hasLandOwnershipDoc) return true;
        } else {
          if (!checkLandAccessDocuments()) return true;
        }
        return false;
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
          flowRate: undefined,
          flowRateUnit: "m³/s",
          maxAverageYearly: undefined,
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
          { industryType: "", dailyQuantity: undefined, monthlyQuantity: undefined },
        ],
        annexF_electricityDetails: "",
        annexG_miningDetails: "",
        annexH_constructionDetails: "",
        annexI_navigationDetails: "",
        annexJ_recreationDetails: "",
        annexK_otherDetails: "",
        miningQuantityPerDay: undefined,
        miningQuantityPerMonth: undefined,
        miningMineralsType: "",
        miningProductionCapacityTonsPerYear: undefined,
        fishLakeAreaHectares: undefined,
        fishLakeNumberOfCages: undefined,
        fishLakeCageCapacity: undefined,
        fishPondsSurfaceAreaM2: undefined,
        fishPondsCapacityM3: undefined,
        fishPondsRefillFrequency: "",
        fishPondsDiscardWaterQuantityM3PerDay: undefined,
        coffeeWashingQuantityPerDay: undefined,
        coffeeWashingQuantityPerMonth: undefined,
        coffeeWashingCapacityTonsPerYear: undefined,
        hydropowerQuantityPerYear: undefined,
        hydropowerIntakeToPowerhouseDistanceM: undefined,
        hydropowerHasDownstreamUsers: undefined,
        hydropowerPlantCapacityMw: undefined,
        constructionDamPurpose: "",
        constructionDamDescription: "",
        constructionDamExpectedDuration: "",
        constructionDamAlterationPlans: "",
        infrastructurePurpose: "",
        infrastructureDescription: "",
        infrastructureExpectedDuration: "",
        infrastructureAlterationPlans: "",
        recreationType: "",
        recreationProjectDescription: "",
        recreationConcessionAreaM2: undefined,
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
      
      // Normalize industryDetails: keep only the first entry with data (dropdown selection model)
      const savedIndustryDetails = form.getValues('industryDetails');
      if (savedIndustryDetails && Array.isArray(savedIndustryDetails)) {
        const firstWithType = savedIndustryDetails.find((d: any) => d?.industryType);
        form.setValue('industryDetails', [firstWithType || { industryType: "", dailyQuantity: undefined, monthlyQuantity: undefined }], {
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
      
      // Initialize/merge additional documents from initialData.
      // Preserve richer in-memory entries (File/url) so links stay viewable right after save.
      if (initialData.additionalDocuments && Array.isArray(initialData.additionalDocuments)) {
        console.log('📎 Initializing additionalDocuments from initialData:', initialData.additionalDocuments.length, initialData.additionalDocuments);
        setAdditionalDocuments((prev) => {
          type AdditionalDocumentEntry = {
            id?: string;
            name?: string;
            category?: string;
            description?: string;
            file?: File | null;
            url?: string;
          };
          const incoming = initialData.additionalDocuments as AdditionalDocumentEntry[];
          const byId = new globalThis.Map<string, AdditionalDocumentEntry>();
          const byName = new globalThis.Map<string, AdditionalDocumentEntry>();
          for (const doc of prev) {
            if (doc?.id) byId.set(String(doc.id), doc);
            if (doc?.name) byName.set(String(doc.name), doc);
          }

          const merged = incoming.map((doc) => {
            const existing =
              (doc?.id ? byId.get(String(doc.id)) : undefined) ||
              (doc?.name ? byName.get(String(doc.name)) : undefined);
            return {
              ...existing,
              ...doc,
              id: String(doc?.id || existing?.id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`),
              name: String(doc?.name || existing?.name || "Document"),
              category: String(doc?.category || existing?.category || "additional"),
              // Keep URL/file from existing state when incoming payload does not have them.
              url: doc?.url || existing?.url,
              file: doc?.file || existing?.file || null,
            };
          });

          return merged;
        });
      } else {
        console.log('📎 No additionalDocuments in initialData:', { has: !!initialData.additionalDocuments, isArray: Array.isArray(initialData.additionalDocuments) });
      }
    }
  }, [initialData, form]);

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

  const FEASIBILITY_STUDY_MAX_MB = 25;
  const DEFAULT_MAX_MB = 10;
  const isFeasibilityStudyField = (name: string) =>
    name === 'feasibilityStudy' || name.endsWith('FeasibilityStudy');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    console.log(`📎 File change detected for field: ${fieldName}`);
    const file = event.target.files?.[0];
    if (file) {
      console.log(`📎 File selected: ${file.name} (${file.size} bytes) for field: ${fieldName}`);
      const maxBytes = isFeasibilityStudyField(fieldName)
        ? FEASIBILITY_STUDY_MAX_MB * 1024 * 1024
        : DEFAULT_MAX_MB * 1024 * 1024;
      if (file.size > maxBytes) {
        alert(
          isFeasibilityStudyField(fieldName)
            ? `File size must be less than ${FEASIBILITY_STUDY_MAX_MB}MB`
            : 'File size must be less than 10MB'
        );
        return;
      }
      
      setFiles(prev => {
        const newFiles = { ...prev, [fieldName]: file };
        console.log(`📎 Updated files state:`, Object.keys(newFiles).filter(key => newFiles[key]));
        return newFiles;
      });
      // Revalidate this field immediately so stale manual errors clear as soon as user selects a valid file.
      form.setValue(fieldName as any, file, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      form.clearErrors(fieldName as any);
      if (validationError && /(upload|document)/i.test(validationError)) {
        setValidationError(null);
      }
      console.log(`📎 Form value set for ${fieldName}`);
    } else {
      console.log(`📎 No file selected for field: ${fieldName}`);
    }
  };

  const removeFile = (fieldName: string) => {
    setFiles(prev => ({ ...prev, [fieldName]: null }));
    form.setValue(fieldName as any, null, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
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
                PDF, JPG, PNG, DOC (max {isFeasibilityStudyField(fieldName) ? '25MB' : '10MB'})
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
                          {doc.file?.name || doc.name}
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

  // Manual save only - no auto-save functionality
  const [validationError, setValidationError] = useState<string | null>(null);
  const [, forceUpdate] = useState({});

  // Force re-render when files change to update button state
  useEffect(() => {
    forceUpdate({});
  }, [files, uploadedFileUrls]);

  const handleFormSubmit = async (values: FormValues) => {
    try {
      // Hard rule: for payment-required applications (new/renewal/transfer), the application must NOT be
      // submitted via form submit. Users should complete payment first (the payment flow will submit).
      // This also closes the "press Enter to submit" loophole.
      if (!isStaffView && shouldShowApplicantPaymentWidgetTab) {
        setValidationError("Payment is required before submission. Please continue to the Payment tab to complete payment.");
        setActiveTab("payment");
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => setValidationError(null), 7000);
        return;
      }

      // Validate modification reason if in modification mode
      if (isModification && !isStaffView && (!values.modificationReason || values.modificationReason.trim().length < 10)) {
        setValidationError("Please provide a detailed reason for your modification request (at least 10 characters).");
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => setValidationError(null), 5000);
        return;
      }

      // Compute modification changes if in modification mode
      let modificationChangesData: Record<string, { previous: any; current: any }> | undefined;
      if (isModification && originalApplicationData) {
        modificationChangesData = computeModificationChanges(originalApplicationData, values);
        console.log('📝 Modification changes detected:', modificationChangesData);
      }
      
      // Include additionalDocuments and modification data in the submission.
      // Strip _isBulk — it's a client-side superRefine flag only, not a DB field.
      const { _isBulk: _stripped, ...valuesWithoutInternalFlags } = values;
      const submissionData = {
        ...valuesWithoutInternalFlags,
        ...files,
        additionalDocuments,
        ...(isDistrictWaterSupply && { bulk_networks: bulkNetworks, bulk_district: form.getValues("waterSourceDistrict"), is_bulk: true }),
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
              {tx("WATER USE PERMIT APPLICATION FORM")}
            </CardTitle>
            <CardDescription className="space-y-2 text-blue-800">
              <p><strong>{tx("Contact Email:")}</strong> info@rwb.rw</p>
              <p><strong>{tx("Legal Reference:")}</strong> {tx("REFER TO THE LAW N°49/2018 OF 13/08/2018 DETERMINING THE USE AND MANAGEMENT OF WATER RESOURCES IN RWANDA")}</p>
              <p><strong>{tx("Ministerial Order:")}</strong> {tx("MINISTERIAL ORDER NO 001/MOE/24 OF 02/04/2024 RELATING TO WATER RESOURCES USE PERMIT")}</p>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="border-gray-200 dark:border-gray-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{tx("Water Permit Application Form")}</CardTitle>
            {/* Show modification badge for staff viewing modification applications */}
            {isStaffView && modificationChanges && Object.keys(modificationChanges).length > 0 && (
              <ModificationBadge changesCount={Object.keys(modificationChanges).length} />
            )}
          </div>
          <CardDescription>
            {readOnly 
              ? tx("Review the submitted water permit application details below.")
              : tx("Fill out all required fields to submit your water permit application. Fields marked with * are required.")
            }
          </CardDescription>
          
          {/* Manual save only - no auto-save */}
          {!readOnly && (
            <div className="flex items-center gap-2 mt-4">
              <div className="flex items-center gap-2 text-blue-600 text-sm">
                <Save className="h-4 w-4" />
                {tx("💾 Manual save only - use \"Save as Draft\" button or \"Next\" to save progress")}
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
                  {validationError ? tx(validationError) : validationError}
                </AlertDescription>
              </Alert>
            )}

            {/* Show modification changes summary for staff viewing modification applications */}
            {isStaffView && modificationChanges && Object.keys(modificationChanges).length > 0 && (
              <ModificationChangesSummary 
                changes={modificationChanges} 
                fieldLabels={localizedFieldLabels}
              />
            )}

            {/* Show modification reason for staff viewing, or editable field for applicant */}
            {isModification && isStaffView && currentApplication?.modification_reason && (
              <Alert className="border-blue-200 bg-blue-50">
                <FileText className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-800 font-semibold">{tx("Reason for Modification")}</AlertTitle>
                <AlertDescription className="text-blue-700 whitespace-pre-line mt-1">
                  {currentApplication.modification_reason}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
              {/* Modification Reason field - shown at the top for applicants in modification mode */}
              {isModification && !isStaffView && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <FileEdit className="h-5 w-5 text-amber-600" />
                    <h3 className="text-base font-semibold text-amber-800">
                      {tx("Reason for Modification")}
                    </h3>
                    <span className="text-xs text-red-500 font-medium">{tx("* Required")}</span>
                  </div>
                  <p className="text-sm text-amber-700">
                    {tx("Please provide a clear justification for why you are requesting this permit modification. This will be reviewed by RWB staff.")}
                  </p>
                  <FormField
                    control={form.control}
                    name="modificationReason"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder={tx("Explain the reason for your modification request (e.g., change in water usage requirements, updated project scope, change of location, etc.)")}
                            className="min-h-[100px] bg-white border-amber-200 focus:border-amber-400 focus:ring-amber-400"
                            disabled={readOnly}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
              <Tabs
                defaultValue="applicant-info"
                value={activeTab}
                onValueChange={(value) => {
                  void handleTabChange(value);
                }}
              >
                <TabsList className={`grid w-full ${shouldShowPaymentTab ? 'grid-cols-5 md:grid-cols-5' : 'grid-cols-4 md:grid-cols-4'}`}>
                  <TabsTrigger value="applicant-info" className="flex items-center gap-1 text-xs">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">{tx("Applicant")}</span>
                  </TabsTrigger>
                  <TabsTrigger value="intended-activity" className="flex items-center gap-1 text-xs">
                    <Factory className="h-4 w-4" />
                    <span className="hidden sm:inline">{tx("Activity")}</span>
                  </TabsTrigger>
                  <TabsTrigger value="water-source" className="flex items-center gap-1 text-xs">
                    <Droplet className="h-4 w-4" />
                    <span className="hidden sm:inline">{tx("Water Source")}</span>
                  </TabsTrigger>
                  {!isDistrictWaterSupply && (
                    <TabsTrigger value="land-ownership" className="flex items-center gap-1 text-xs">
                      <Globe className="h-4 w-4" />
                      <span className="hidden sm:inline">{tx("Land")}</span>
                    </TabsTrigger>
                  )}
                  {/* Show payment tab for editable applicant payment flow, and read-only payment details for applicant/staff views. */}
                  {shouldShowPaymentTab && (
                    <TabsTrigger value="payment" className="flex items-center gap-1 text-xs">
                      <CreditCard className="h-4 w-4" />
                      <span className="hidden sm:inline">{tx("Payment")}</span>
                    </TabsTrigger>
                  )}
                </TabsList>
                
                {/* IDENTIFICATION AND ADDRESS OF THE APPLICANT */}
                <TabsContent value="applicant-info" className="pt-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <User className="h-5 w-5" />
                      {tx("Identification and Address of the Applicant")}
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      {tx("Provide complete identification and address information for the applicant.")}
                    </p>
                  </div>

                  {/* 1. Full Name of Applicant */}
                  <FormField
                    control={form.control}
                    name="fullNameApplicant"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          {tx("1. Full Name of the Applicant *")}
                          <span className="text-sm font-normal text-muted-foreground block">
                            {tx("(Individual, Company, Cooperative, Organization, etc)")}
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} disabled className="bg-gray-100 border-gray-300 cursor-not-allowed" />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          {tx("This information is pulled from your account profile and cannot be edited here.")}
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
                          {tx("2. Category of the Applicant *")}
                        </FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} value={field.value || ""} disabled>
                            <SelectTrigger className="bg-gray-100 border-gray-300 cursor-not-allowed">
                              <SelectValue placeholder={tx("Category is set from your account")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="individual">{tx("Individual")}</SelectItem>
                              <SelectItem value="company">{tx("Company")}</SelectItem>
                              <SelectItem value="cooperative">{tx("Cooperative")}</SelectItem>
                              <SelectItem value="organization">{tx("Organization")}</SelectItem>
                              <SelectItem value="institution">{tx("Institution")}</SelectItem>
                              <SelectItem value="ngo_association">{tx("NGO / Association")}</SelectItem>
                              <SelectItem value="other">{tx("Other (specify)")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          {tx("This information is pulled from your account profile and cannot be edited here.")}
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
                          <FormLabel>{tx("Please specify category")}</FormLabel>
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
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="nameRepresentative"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-medium">
                              {tx("3. Name of the Representative *")}
                              <span className="text-sm font-normal text-muted-foreground block">
                                {tx("(for Company, Cooperative, Organization, Institution)")}
                              </span>
                            </FormLabel>
                            <FormControl>
                              <Input {...field} {...getInputProps({ value: field.value || "", placeholder: "Enter representative name" })} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="representativePosition"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-medium">
                              {tx("3a. Representative Position / Title *")}
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                {...getInputProps({ value: field.value || "", placeholder: "Enter representative position or title" })}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* 4. Documents */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium">
                      {tx("4. Documents *")}
                    </Label>
                    <div className="text-sm text-muted-foreground space-y-1">
                      {watchedCategoryApplicant === "individual" ? (
                        <p>{tx("• Please upload a copy of your National ID (NID)")}</p>
                      ) : (
                        <p>{tx("• Please upload a copy of your registration certificate")}</p>
                      )}
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
                                    {tx("Choose File")}
                                  </Button>
                                </div>
                                <p className="text-xs text-gray-500">
                                  {tx("PDF, JPG, PNG, DOC (max 10MB)")}
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
                                          return urlPath.split('/').pop() || tx("Identification document");
                                        } catch {
                                          return tx("Identification document");
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
                      {tx("5. Office Address * (Province, District, Sector, Cell, Village)")}
                    </Label>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="officeProvince"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{tx("Province *")}</FormLabel>
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
                                  <SelectValue placeholder={tx("Select province")} />
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
                            <FormLabel>{tx("District *")}</FormLabel>
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
                                  <SelectValue placeholder={selectedOfficeProvince ? tx("Select district") : tx("Select province first")} />
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
                            <FormLabel>{tx("Sector *")}</FormLabel>
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
                                  <SelectValue placeholder={(selectedOfficeDistrict || officeDistrict) ? tx("Select sector") : tx("Select district first")} />
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
                            <FormLabel>{tx("Cell *")}</FormLabel>
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
                                  <SelectValue placeholder={(selectedOfficeSector || officeSector) ? tx("Select cell") : tx("Select sector first")} />
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
                            <FormLabel>{tx("Village")}</FormLabel>
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
                                  <SelectValue placeholder={(selectedOfficeCell || officeCell) ? tx("Select village (optional)") : tx("Select cell first")} />
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
                      {tx("6. Contact Information *")}
                    </Label>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="telephoneContact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{tx("Telephone Contact *")}</FormLabel>
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
                            <FormLabel>{tx("Email Address *")}</FormLabel>
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
                      {tx("Source of Water")}
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      {tx("Provide details about the water source you intend to use.")}
                    </p>
                  </div>

                  {/* Fields 10-14 hidden for District Water Supply — it uses network-level data instead */}
                  {!isDistrictWaterSupply && (<>

                  {/* 10. Source of Water */}
                  <FormField
                    control={form.control}
                    name="waterSourceType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          {tx("10. Source of Water *")}
                        </FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} value={field.value || undefined} {...getSelectProps()}>
                            <SelectTrigger className={`bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200 focus:border-blue-400 ${readOnly ? 'cursor-default' : ''}`}>
                              <SelectValue placeholder={tx("Select water source type")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lake">{tx("Lake")}</SelectItem>
                              <SelectItem value="dam">{tx("Dam")}</SelectItem>
                              <SelectItem value="spring">{tx("Spring")}</SelectItem>
                              <SelectItem value="borehole">{tx("Borehole")}</SelectItem>
                              <SelectItem value="stream_river">{tx("Stream/River")}</SelectItem>
                              <SelectItem value="other">{tx("Other (specify)")}</SelectItem>
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
                          <FormLabel>{tx("Please specify water source")}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder={tx("Specify water source")} disabled={readOnly} readOnly={readOnly} className={readOnly ? "bg-gray-50 cursor-default opacity-60" : ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* 11. Name of the source of water */}
                  <FormField
                    control={form.control}
                    name="nameSourceWater"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          {tx("11. Name of the source of water *")}
                        </FormLabel>
                        <FormControl>
                          <Input {...field} {...getInputProps({ value: field.value || "", placeholder: "Enter name of water source" }, "nameSourceWater")} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 12. Tributary to (main river/lake) */}
                  <FormField
                    control={form.control}
                    name="tributaryToMain"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          {tx("12. Tributary to (main river/lake)")}
                        </FormLabel>
                        <FormControl>
                          <Input {...field} {...getInputProps({ value: field.value || "", placeholder: "Enter main river/lake (if applicable)" })} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 13. Location of water source */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium">
                      {tx("13. Location of water source * (Province, District, Sector, Cell, Village)")}
                    </Label>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="waterSourceProvince"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {tx("Province *")}
                              {isDistrictWaterSupply && <span className="ml-2 text-xs text-muted-foreground font-normal">(set in Water Supply Networks)</span>}
                            </FormLabel>
                            <FormControl>
                              <Select
                                onValueChange={readOnly || isDistrictWaterSupply ? undefined : (value) => {
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
                                disabled={readOnly || isDistrictWaterSupply}
                              >
                                <SelectTrigger className={`bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-200 focus:border-cyan-400 ${(readOnly || isDistrictWaterSupply) ? 'cursor-default opacity-60' : ''}`}>
                                  <SelectValue placeholder={tx("Select province")} />
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
                            <FormLabel>
                              {tx("District *")}
                              {isDistrictWaterSupply && <span className="ml-2 text-xs text-muted-foreground font-normal">(set in Water Supply Networks)</span>}
                            </FormLabel>
                            <FormControl>
                              <Select
                                onValueChange={readOnly || isDistrictWaterSupply ? undefined : (value) => {
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
                                disabled={readOnly || isDistrictWaterSupply || !selectedWaterSourceProvince}
                              >
                                <SelectTrigger className={`bg-gradient-to-r from-teal-50 to-emerald-50 border-teal-200 focus:border-teal-400 ${(readOnly || isDistrictWaterSupply) ? 'cursor-default opacity-60' : ''}`}>
                                  <SelectValue placeholder={selectedWaterSourceProvince ? tx("Select district") : tx("Select province first")} />
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
                      
                      {!isDistrictWaterSupply && (
                        <FormField
                          control={form.control}
                          name="waterSourceSector"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{tx("Sector *")}</FormLabel>
                              <FormControl>
                                <Select
                                  onValueChange={readOnly ? undefined : (value) => {
                                    field.onChange(value);
                                    setSelectedWaterSourceSector(value);
                                    form.setValue("waterSourceCell", "");
                                    form.setValue("waterSourceVillage", "");
                                    form.clearErrors(["waterSourceSector", "waterSourceCell"]);
                                  }}
                                  value={field.value}
                                  disabled={readOnly || !selectedWaterSourceDistrict}
                                >
                                  <SelectTrigger className={`bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200 focus:border-indigo-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                                    <SelectValue placeholder={selectedWaterSourceDistrict ? tx("Select sector") : tx("Select district first")} />
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
                      )}

                      {!isDistrictWaterSupply && (
                        <FormField
                          control={form.control}
                          name="waterSourceCell"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{tx("Cell *")}</FormLabel>
                              <FormControl>
                                <Select
                                  onValueChange={readOnly ? undefined : (value) => {
                                    field.onChange(value);
                                    setSelectedWaterSourceCell(value);
                                    form.setValue("waterSourceVillage", "");
                                    setSelectedWaterSourceVillage("");
                                    form.clearErrors("waterSourceCell");
                                  }}
                                  value={field.value}
                                  disabled={readOnly || !selectedWaterSourceSector}
                                >
                                  <SelectTrigger className={`bg-gradient-to-r from-rose-50 to-pink-50 border-rose-200 focus:border-rose-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                                    <SelectValue placeholder={selectedWaterSourceSector ? tx("Select cell") : tx("Select sector first")} />
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
                      )}

                      {!isDistrictWaterSupply && (
                        <FormField
                          control={form.control}
                          name="waterSourceVillage"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{tx("Village")}</FormLabel>
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
                                    <SelectValue placeholder={(selectedWaterSourceCell || waterSourceCell) ? tx("Select village (optional)") : tx("Select cell first")} />
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
                      )}
                    </div>
                  </div>

                  {/* Reliability of water source */}
                  <FormField
                    control={form.control}
                    name="waterReliability"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          {tx("14. Reliability of water source *")}
                        </FormLabel>
                        <FormControl>
                          <Select onValueChange={readOnly ? undefined : field.onChange} value={field.value || ""} disabled={readOnly}>
                            <SelectTrigger className={`bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200 focus:border-emerald-400 ${readOnly ? 'cursor-default opacity-60' : ''}`}>
                              <SelectValue placeholder={tx("Select water source reliability")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="water_always_available">{tx("Water always available")}</SelectItem>
                              <SelectItem value="frequently_dry">{tx("Frequently dry")}</SelectItem>
                              <SelectItem value="dry_during_certain_season">{tx("Dry during certain season")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  </>)}
                  {/* Requested Permit Duration */}
                  <FormField
                    control={form.control}
                    name="permitLengthYears"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          {tx(isDistrictWaterSupply ? "10. Requested Permit Duration (Years) *" : "15. Requested Permit Duration (Years) *")}
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
                              <SelectValue placeholder={tx("Select permit duration")} />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 15 }, (_, i) => i + 1).map((year) => (
                                <SelectItem key={year} value={year.toString()}>
                                  {year} {year === 1 ? tx("year") : tx("years")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          {tx("Select the duration for which you are requesting the water permit (1-15 years). This may be adjusted by the assessor based on your use case.")}
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
                      {tx("Intended Activity")}
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      {tx("Specify the activities for which you intend to use water.")}
                    </p>
                  </div>

                  {/* 7. Activity Type - Single Selection */}
                  <FormField
                    control={form.control}
                    name="intendedActivities"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          {tx("7. Intended Activity * (Select one activity)")}
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
                              { value: "coffee_washing", label: tx("Coffee washing") },
                              { value: "construction_of_dam", label: tx("Construction of a dam") },
                              { value: "construction_of_infrastructures", label: tx("Construction or installation of infrastructure") },
                              { value: "electricity_generation", label: tx("Electricity generation (Hydropower)") },
                              { value: "fish_farming_lakes", label: tx("Fish farming in lakes") },
                              { value: "fish_farming_ponds", label: tx("Fish farming in ponds") },
                              { value: "gaz_extraction", label: tx("Gaz extraction") },
                              { value: "industry", label: tx("Industry") },
                              { value: "irrigation", label: tx("Irrigation") },
                              { value: "livestock", label: tx("Livestock") },
                              { value: "mining", label: tx("Mining") },
                              { value: "recreation_activities", label: tx("Recreational activities") },
                              { value: "water_supply", label: tx("Water supply") },
                              { value: "district_water_supply", label: tx("District Water Supply") },
                              { value: "other", label: tx("Other (specify)") },
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

                  {/* Water Use Category – auto-derived from selected activity, read-only. Hidden for District Water Supply. */}
                  {watchedIntendedActivities && watchedIntendedActivities.length > 0 && !isDistrictWaterSupply && (
                    <div className="space-y-1">
                      <p className="text-base font-medium">{tx("Water Use Category")}</p>
                      <p className="text-sm text-muted-foreground mb-2">
                        {tx("Automatically determined by the selected activity.")}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                          effectiveWaterUseCategory === "concession"
                            ? "bg-teal-100 text-teal-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {effectiveWaterUseCategory === "concession" ? tx("Concession") : tx("Abstraction")}
                      </span>
                    </div>
                  )}

                  {/* Water Abstraction Point (LAT, LONG) - shown for abstraction water use category, not for district water supply */}
                  {effectiveWaterUseCategory === "abstraction" && watchedIntendedActivities && watchedIntendedActivities.length > 0 && !isDistrictWaterSupply && (
                  <div className="space-y-4">
                        <Label className="text-base font-medium">
                          {tx("8. Water Abstraction Point * (LAT, LONG)")}
                        </Label>

                        <Tabs defaultValue="manual" className="w-full">
                          <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="manual" className="flex items-center gap-2">
                              <Edit3 className="h-4 w-4" />
                              {tx("Manual Entry")}
                            </TabsTrigger>
                            <TabsTrigger value="map" className="flex items-center gap-2">
                              <Map className="h-4 w-4" />
                              {tx("Map View")}
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="manual" className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name="waterSourceLatitude"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>{tx("Latitude *")}</FormLabel>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        type="text"
                                        value={(field.value ?? "").toString()}
                                        placeholder={tx("e.g., -1.9441")}
                                        disabled={readOnly}
                                        onChange={(e) => {
                                          if (readOnly) return;
                                          const value = e.target.value;

                                          // If the user pasted a full pair "lat, lng", split and populate both fields.
                                          const pair = parseLatLngPair(value);
                                          if (pair) {
                                            form.setValue("waterSourceLatitude", pair.lat, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                                            form.setValue("waterSourceLongitude", pair.lng, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                                          } else {
                                            // Allow freeform input; schema validation will normalize/check on blur/submit.
                                            field.onChange(value);
                                          }

                                          // Trigger validation after input
                                          setTimeout(() => {
                                            form.trigger("waterSourceLatitude");
                                            form.trigger("waterSourceLongitude");
                                          }, 100);
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
                                    <FormLabel>{tx("Longitude *")}</FormLabel>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        type="text"
                                        value={(field.value ?? "").toString()}
                                        placeholder={tx("e.g., 29.8739")}
                                        disabled={readOnly}
                                        onChange={(e) => {
                                          if (readOnly) return;
                                          const value = e.target.value;

                                          // Support pasting "lat, lng" into either field.
                                          const pair = parseLatLngPair(value);
                                          if (pair) {
                                            form.setValue("waterSourceLatitude", pair.lat, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                                            form.setValue("waterSourceLongitude", pair.lng, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                                          } else {
                                            field.onChange(value);
                                          }

                                          setTimeout(() => {
                                            form.trigger("waterSourceLatitude");
                                            form.trigger("waterSourceLongitude");
                                          }, 100);
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
                          </TabsContent>

                          <TabsContent value="map" className="space-y-4">
                            <AbstractionPointMap
                              latitude={form.watch("waterSourceLatitude")}
                              longitude={form.watch("waterSourceLongitude")}
                              onPointChange={(lat, lng) => {
                                form.setValue("waterSourceLatitude", lat, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                                form.setValue("waterSourceLongitude", lng, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                                form.trigger("waterSourceLatitude");
                                form.trigger("waterSourceLongitude");
                              }}
                              readOnly={readOnly}
                              height="400px"
                            />
                          </TabsContent>
                        </Tabs>

                        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-950/30 dark:border-blue-800">
                          <p className="text-sm text-blue-800 dark:text-blue-200">
                            <strong>{tx("Note:")}</strong> {tx("For water abstraction activities, only a single point is required (LAT/LONG).")}
                            {!readOnly && ` ${tx("Use the Map View tab to click on the map to set your abstraction location.")}`}
                          </p>
                        </div>
                      </div>
                  )}

                  {/* Other activity specification */}
                  {watchedIntendedActivities?.includes("other") && (
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="intendedActivityOther"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{tx("Please specify other activity")}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder={tx("Specify other activity")} disabled={readOnly} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Other activity attachments (multiple, dynamic) */}
                      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                        <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-2 text-lg border-b pb-2">
                          {tx("Other Activity Attachments")}
                        </h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          {tx("Upload any supporting documents for your other activity. You can add multiple attachments.")}
                        </p>

                        <AdditionalDocumentsSection category="other" activityType="other" />
                      </div>
                    </div>
                  )}

                  {/* Water Concession Area - shown for concession water use category */}
                  {watchedIntendedActivities && watchedIntendedActivities.length > 0 &&
                   effectiveWaterUseCategory === "concession" && (
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
                              excludeApplicationIds={excludeApplicationIds}
                              disabled={Boolean(readOnly)}
                              showValidation={true}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Activity-specific sections */}
                  {watchedIntendedActivities && watchedIntendedActivities.length > 0 && (
                    <div className="space-y-6 mt-8">

                      {/* Irrigation Details */}
                      {watchedIntendedActivities?.includes("irrigation") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            {tx("Irrigation Details")}
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
                                        <FormItem>
                                          <FormControl>
                                            <Input 
                                              {...field}
                                              placeholder="Type of crops" 
                                              className="border-0 bg-transparent"
                                              disabled={readOnly}
                                            />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <div className="flex gap-1 items-center">
                                      <FormField
                                        control={form.control}
                                        name="irrigationGrowingSeasonFrom"
                                        render={({ field }) => (
                                          <FormItem>
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
                                          <FormMessage />
                                        </FormItem>
                                        )}
                                      />
                                      <span className="self-center text-xs">-</span>
                                      <FormField
                                        control={form.control}
                                        name="irrigationGrowingSeasonTo"
                                        render={({ field }) => (
                                          <FormItem>
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
                                          <FormMessage />
                                        </FormItem>
                                        )}
                                      />
                                    </div>
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="irrigationProductionSystem"
                                      render={({ field }) => (
                                        <FormItem>
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
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="irrigationMethod"
                                      render={({ field }) => (
                                        <FormItem>
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
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="irrigationTotalArea"
                                      render={({ field }) => (
                                        <FormItem>
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
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="irrigationWaterDemand"
                                      render={({ field }) => (
                                        <FormItem>
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
                                          <FormMessage />
                                        </FormItem>
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
                                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
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
                                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
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
                                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
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
                                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
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
                                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
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
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={field.value ?? ""}
                                      onChange={(e) => {
                                        if (readOnly) return;
                                        const v = e.target.value;
                                        field.onChange(v === "" ? undefined : Number(v));
                                      }}
                                      placeholder="e.g., 120"
                                      disabled={readOnly}
                                      readOnly={readOnly}
                                      className={readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}
                                    />
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
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={field.value ?? ""}
                                      onChange={(e) => {
                                        if (readOnly) return;
                                        const v = e.target.value;
                                        field.onChange(v === "" ? undefined : Number(v));
                                      }}
                                      placeholder="e.g., 3500"
                                      disabled={readOnly}
                                      readOnly={readOnly}
                                      className={readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}
                                    />
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
                                    <Input {...field} placeholder="e.g., Tin, Coltan, Wolfram" disabled={readOnly} readOnly={readOnly} className={readOnly ? "bg-gray-50 cursor-default opacity-60" : ""} />
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
                                      value={field.value ?? ""}
                                      onChange={(e) => !readOnly && field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                      placeholder="e.g., 10000"
                                      disabled={readOnly}
                                      readOnly={readOnly}
                                      className={readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}
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
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Concession area (Ha)</th>
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
                                              <BaseInput
                                                {...field}
                                                value={field.value ?? ""}
                                                onChange={(e) => field.onChange(e.target.value)}
                                                placeholder="Lake name"
                                                className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                                disabled={readOnly}
                                                readOnly={readOnly}
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
                                              <BaseInput
                                                type="number"
                                                value={field.value ?? ""}
                                                onChange={(e) => {
                                                  if (readOnly) return;
                                                  const v = e.target.value;
                                                  field.onChange(v === "" ? undefined : Number(v));
                                                }}
                                                placeholder="Number of cages"
                                                className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                                disabled={readOnly}
                                                readOnly={readOnly}
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
                                              <BaseInput
                                                type="number"
                                                value={field.value ?? ""}
                                                onChange={(e) => {
                                                  if (readOnly) return;
                                                  const v = e.target.value;
                                                  field.onChange(v === "" ? undefined : Number(v));
                                                }}
                                                placeholder="Fishes per cage"
                                                className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                                disabled={readOnly}
                                                readOnly={readOnly}
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
                                <BaseInput 
                                  type="number"
                                  value={field.value ?? ""}
                                  onChange={(e) => {
                                    if (readOnly) return;
                                    const v = e.target.value;
                                    field.onChange(v === "" ? undefined : Number(v));
                                  }}
                                  placeholder="Area" 
                                  className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                  disabled={readOnly}
                                  readOnly={readOnly}
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
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Pond Surface (m²)</th>
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Pond Capacity (m³)</th>
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Frequency of refilling water in ponds (number / month)</th>
                                      <th className="border border-gray-300 dark:border-gray-600 p-2 text-left text-sm font-medium">Amount of water to be used (m³/month)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <FormField
                                          control={form.control}
                                          name="fishPondsSurfaceAreaM2"
                                          render={({ field }) => (
                                            <FormControl>
                                              <Input
                                                type="number"
                                                value={field.value ?? ""}
                                                onChange={(e) => {
                                                  if (readOnly) return;
                                                  const v = e.target.value;
                                                  field.onChange(v === "" ? undefined : Number(v));
                                                }}
                                                placeholder="Surface area"
                                                className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                                disabled={readOnly}
                                                readOnly={readOnly}
                                              />
                                            </FormControl>
                                          )}
                                        />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <FormField
                                          control={form.control}
                                          name="fishPondsCapacityM3"
                                          render={({ field }) => (
                                            <FormControl>
                                              <Input
                                                type="number"
                                                value={field.value ?? ""}
                                                onChange={(e) => {
                                                  if (readOnly) return;
                                                  const v = e.target.value;
                                                  field.onChange(v === "" ? undefined : Number(v));
                                                }}
                                                placeholder="Capacity (m³)"
                                                className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                                disabled={readOnly}
                                                readOnly={readOnly}
                                              />
                                            </FormControl>
                                          )}
                                        />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <FormField
                                          control={form.control}
                                          name="fishPondsRefillFrequency"
                                          render={({ field }) => (
                                            <FormControl>
                                              <Select onValueChange={readOnly ? undefined : field.onChange} value={field.value || ""} disabled={readOnly}>
                                                <SelectTrigger className={`border-0 bg-transparent h-8 ${readOnly ? "cursor-default opacity-60" : ""}`}>
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
                                            </FormControl>
                                          )}
                                        />
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
                                    if (readOnly) return;
                                    const v = e.target.value;
                                    field.onChange(v === "" ? undefined : Number(v));
                                  }}
                                  placeholder="Monthly usage (m³)" 
                                  className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                  disabled={readOnly}
                                  readOnly={readOnly}
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
                                    <FormField
                                      control={form.control}
                                      name="coffeeWashingQuantityPerDay"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input
                                            type="number"
                                            value={field.value ?? ""}
                                            onChange={(e) => {
                                              if (readOnly) return;
                                              const v = e.target.value;
                                              field.onChange(v === "" ? undefined : Number(v));
                                            }}
                                            placeholder="Daily quantity (m³)"
                                            className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="coffeeWashingQuantityPerMonth"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input
                                            type="number"
                                            value={field.value ?? ""}
                                            onChange={(e) => {
                                              if (readOnly) return;
                                              const v = e.target.value;
                                              field.onChange(v === "" ? undefined : Number(v));
                                            }}
                                            placeholder="Monthly quantity (m³)"
                                            className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm">Washing capacity (tons/year)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2" colSpan={2}>
                                    <FormField
                                      control={form.control}
                                      name="coffeeWashingCapacityTonsPerYear"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input
                                            type="number"
                                            value={field.value ?? ""}
                                            onChange={(e) => {
                                              if (readOnly) return;
                                              const v = e.target.value;
                                              field.onChange(v === "" ? undefined : Number(v));
                                            }}
                                            placeholder="Annual washing capacity"
                                            className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
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
                          
                          <div className="space-y-4 mb-6">
                            <FormField
                              control={form.control}
                              name="industryDetails.0.industryType"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Type of Industry *</FormLabel>
                                  <Select
                                    onValueChange={(val) => {
                                      field.onChange(val);
                                      const details = form.getValues('industryDetails') || [];
                                      if (details.length > 0) {
                                        form.setValue('industryDetails', [{ industryType: val, dailyQuantity: details[0]?.dailyQuantity, monthlyQuantity: details[0]?.monthlyQuantity }]);
                                      }
                                    }}
                                    value={field.value || ""}
                                    disabled={readOnly}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select type of industry" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="Food Processing">Food Processing</SelectItem>
                                      <SelectItem value="Horticultural Packaging">Horticultural Packaging</SelectItem>
                                      <SelectItem value="Chemical Manufacturing">Chemical Manufacturing</SelectItem>
                                      <SelectItem value="Mineral water">Mineral water</SelectItem>
                                      <SelectItem value="Brewing/Beverage manufacturing">Brewing/Beverage manufacturing</SelectItem>
                                      <SelectItem value="Fruit and vegetable canning or pickling">Fruit and vegetable canning or pickling</SelectItem>
                                      <SelectItem value="Others (Specify)">Others (Specify)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {form.watch('industryDetails.0.industryType') && (
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                                  <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-700">
                                      <th className="border border-gray-300 dark:border-gray-600 p-3 text-left text-sm font-medium">Selected Industry</th>
                                      <th className="border border-gray-300 dark:border-gray-600 p-3 text-left text-sm font-medium">Quantity of abstracted water (m³/day)</th>
                                      <th className="border border-gray-300 dark:border-gray-600 p-3 text-left text-sm font-medium">(m³/month)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr>
                                      <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">
                                        {form.watch('industryDetails.0.industryType')}
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <FormField
                                          control={form.control}
                                          name="industryDetails.0.dailyQuantity"
                                          render={({ field }) => (
                                            <FormItem>
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
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <FormField
                                          control={form.control}
                                          name="industryDetails.0.monthlyQuantity"
                                          render={({ field }) => (
                                            <FormItem>
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
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            )}
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
                                    <FormField
                                      control={form.control}
                                      name="hydropowerQuantityPerYear"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input
                                            type="number"
                                            value={field.value ?? ""}
                                            onChange={(e) => {
                                              if (readOnly) return;
                                              const v = e.target.value;
                                              field.onChange(v === "" ? undefined : Number(v));
                                            }}
                                            placeholder="Annual quantity (m³)"
                                            className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Distance between intake and Power House (m)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="hydropowerIntakeToPowerhouseDistanceM"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input
                                            type="number"
                                            value={field.value ?? ""}
                                            onChange={(e) => {
                                              if (readOnly) return;
                                              const v = e.target.value;
                                              field.onChange(v === "" ? undefined : Number(v));
                                            }}
                                            placeholder="Distance"
                                            className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Is there any water user along this distance?</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="hydropowerHasDownstreamUsers"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Select onValueChange={readOnly ? undefined : field.onChange} value={field.value || ""} disabled={readOnly}>
                                            <SelectTrigger className={`border-0 bg-transparent ${readOnly ? "cursor-default opacity-60" : ""}`}>
                                              <SelectValue placeholder="Select" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="yes">Yes</SelectItem>
                                              <SelectItem value="no">No</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Capacity of Power Plant (Megawatt)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="hydropowerPlantCapacityMw"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={field.value ?? ""}
                                            onChange={(e) => {
                                              if (readOnly) return;
                                              const v = e.target.value;
                                              field.onChange(v === "" ? undefined : Number(v));
                                            }}
                                            placeholder="Capacity in MW"
                                            className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
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
                                    <FormField
                                      control={form.control}
                                      name="constructionDamPurpose"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Textarea
                                            {...field}
                                            placeholder="Describe purpose of construction"
                                            className={`border-0 bg-transparent min-h-[60px] ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Brief description of the construction project (Materials, construction methods, temporary facilities, impact on water flow, impact on water quality, etc.)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="constructionDamDescription"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Textarea
                                            {...field}
                                            placeholder="Detailed project description..."
                                            className={`border-0 bg-transparent min-h-[120px] ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Expected period of time required for construction</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="constructionDamExpectedDuration"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Select onValueChange={readOnly ? undefined : field.onChange} value={field.value || ""} disabled={readOnly}>
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
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Plans or maps showing proposed alterations and/or constructions at the end of construction works</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="constructionDamAlterationPlans"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Textarea
                                            {...field}
                                            placeholder="Describe plans and alterations..."
                                            className={`border-0 bg-transparent min-h-[80px] ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
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

                      {/* Construction or Installation of Infrastructure Details */}
                      {watchedIntendedActivities?.includes("construction_of_infrastructures") && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border shadow-sm">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 text-lg border-b pb-2">
                            Construction or Installation of Infrastructure Details
                          </h4>

                          <div className="mb-6 space-y-4">
                            <Label className="text-base font-medium">Construction or Installation Site</Label>
                            <p className="text-sm text-muted-foreground">
                              Provide the location of the construction or installation site. You can provide a single point (LAT/LONG) or use the polygon input in the Water Source tab for multi-point areas.
                            </p>
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
                                          if (readOnly) return;
                                          field.onChange(e.target.value);
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
                                          if (readOnly) return;
                                          field.onChange(e.target.value);
                                        }}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-6">
                              <tbody>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Purpose of construction or installation</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="infrastructurePurpose"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Textarea
                                            {...field}
                                            placeholder="Describe purpose of construction or installation"
                                            className={`border-0 bg-transparent min-h-[60px] ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Brief description of the project (Materials, construction methods, temporary facilities, impact on water flow, impact on water quality, etc.)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="infrastructureDescription"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Textarea
                                            {...field}
                                            placeholder="Detailed project description..."
                                            className={`border-0 bg-transparent min-h-[120px] ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Expected period of time required for construction or installation</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="infrastructureExpectedDuration"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Select onValueChange={readOnly ? undefined : field.onChange} value={field.value || ""} disabled={readOnly}>
                                            <SelectTrigger className={`border-0 bg-transparent h-8 ${readOnly ? "cursor-default opacity-60" : ""}`}>
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
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Plans or maps showing proposed alterations and/or constructions at the end of construction works</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="infrastructureAlterationPlans"
                                      render={({ field }) => (
                                        <FormControl>
                                          <Textarea
                                            {...field}
                                            placeholder="Describe plans and alterations..."
                                            className={`border-0 bg-transparent min-h-[80px] ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
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
                                    <FormField
                                      control={form.control}
                                      name="recreationType"
                                      render={({ field }) => (
                                        <FormControl>
                                          <BaseInput
                                            {...field}
                                            value={field.value ?? ""}
                                            onChange={(e) => field.onChange(e.target.value)}
                                            placeholder="Specify recreation type"
                                            className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Recreational Activities Details <span className="text-red-500">*</span></td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="recreationProjectDescription"
                                      render={({ field }) => (
                                        <FormControl>
                                          <BaseTextarea
                                            {...field}
                                            value={field.value ?? ""}
                                            onChange={(e) => field.onChange(e.target.value)}
                                            placeholder="Describe the recreational project..."
                                            className={`border-0 bg-transparent min-h-[120px] ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                            required
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm font-medium">Concession area (m²) <span className="text-red-500">*</span></td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <FormField
                                      control={form.control}
                                      name="recreationConcessionAreaM2"
                                      render={({ field }) => (
                                        <FormControl>
                                          <BaseInput
                                            {...field}
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={field.value ?? ""}
                                            onChange={(e) => {
                                              if (readOnly) return;
                                              const v = e.target.value;
                                              field.onChange(v === "" ? undefined : Number(v));
                                            }}
                                            placeholder="Enter concession area in m²"
                                            className={`border-0 bg-transparent ${readOnly ? "bg-gray-50 cursor-default opacity-60" : ""}`}
                                            disabled={readOnly}
                                            readOnly={readOnly}
                                            required
                                          />
                                        </FormControl>
                                      )}
                                    />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {renderRequiredAttachmentsForActivity("recreation_activities")}

                          <AdditionalDocumentsSection 
                            category="recreation" 
                            activityType="recreation_activities" 
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

                  {/* 9. Water Abstraction Details - show when effective category is abstraction */}
                  {(() => {
                    const selected = watchedIntendedActivities || [];
                    const hasActivity = selected.some((a) => a && a.trim() !== "");
                    return hasActivity && effectiveWaterUseCategory === "abstraction" && !isDistrictWaterSupply ? (
                      <div className="space-y-4">
                        <Label className="text-base font-medium">
                          9. Water Abstraction Details *
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
                                        value={field.value ?? ""}
                                        onChange={(e) => !readOnly && field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                        placeholder="Enter flow rate (m³/s)"
                                        disabled={readOnly}
                                        readOnly={readOnly}
                                        className={readOnly ? "bg-gray-50 border-gray-200 cursor-default opacity-60" : ""}
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
                                        value={field.value || ""}
                                        onChange={(e) => !readOnly && field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                        placeholder="Yearly average"
                                        disabled={readOnly}
                                        readOnly={readOnly}
                                        className={readOnly ? "bg-gray-50 border-gray-200 cursor-default opacity-60" : ""}
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
                                    <Select onValueChange={readOnly ? undefined : field.onChange} value={field.value || ""} disabled={readOnly}>
                                      <FormControl>
                                        <SelectTrigger className={readOnly ? "cursor-default opacity-60" : ""}>
                                          <SelectValue placeholder="Select abstraction method" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="Pumping">Pumping</SelectItem>
                                        <SelectItem value="Gravity">Gravity</SelectItem>
                                        <SelectItem value="Diversion Channel">Diversion Channel</SelectItem>
                                        <SelectItem value="Dam/Reservoir">Dam/Reservoir</SelectItem>
                                        <SelectItem value="Borehole">Borehole</SelectItem>
                                        <SelectItem value="Spring Capture">Spring Capture</SelectItem>
                                        <SelectItem value="Hand Dug Well">Hand Dug Well</SelectItem>
                                        <SelectItem value="Other">Other</SelectItem>
                                      </SelectContent>
                                    </Select>
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

                  {/* 9. Fish farming specific fields are shown above in respective sections */}

                  {/* District Water Supply: district + distribution networks */}
                  {isDistrictWaterSupply && (
                    <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 p-6 rounded-xl border border-violet-200 dark:border-violet-800 space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-violet-100 dark:bg-violet-900/40 rounded-lg">
                          <Building className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-violet-900 dark:text-violet-100">Water Supply Networks</h3>
                          <p className="text-sm text-violet-700 dark:text-violet-300">Select the district for all networks, then fill in each network&apos;s details below.</p>
                        </div>
                      </div>

                      {/* Province + District selectors — drive Q13 inheritance and row dropdowns */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-violet-900 dark:text-violet-100">
                            Province *
                          </label>
                          <Select
                            value={selectedWaterSourceProvince}
                            onValueChange={readOnly ? undefined : (value) => {
                              setSelectedWaterSourceProvince(value);
                              setSelectedWaterSourceDistrict("");
                              form.setValue("waterSourceProvince", value);
                              form.setValue("waterSourceDistrict", "");
                              form.setValue("waterSourceSector", "");
                              form.setValue("waterSourceCell", "");
                              form.setValue("waterSourceVillage", "");
                              // Reset all row sector/cell/village when district changes
                              setBulkNetworks((prev) => prev.map((r) => ({ ...r, sector: "", cell: "", village: "" })));
                            }}
                            disabled={readOnly}
                          >
                            <SelectTrigger className="bg-white/70 border-violet-200 focus:border-violet-400">
                              <SelectValue placeholder="Select province" />
                            </SelectTrigger>
                            <SelectContent>
                              {getFormattedProvinceOptions().map((p) => (
                                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-violet-900 dark:text-violet-100">
                            District *
                          </label>
                          <Select
                            value={selectedWaterSourceDistrict}
                            onValueChange={readOnly ? undefined : (value) => {
                              setSelectedWaterSourceDistrict(value);
                              form.setValue("waterSourceDistrict", value);
                              form.setValue("waterSourceSector", "");
                              form.setValue("waterSourceCell", "");
                              form.setValue("waterSourceVillage", "");
                              // Reset all row sector/cell/village when district changes
                              setBulkNetworks((prev) => prev.map((r) => ({ ...r, sector: "", cell: "", village: "" })));
                            }}
                            disabled={readOnly || !selectedWaterSourceProvince}
                          >
                            <SelectTrigger className="bg-white/70 border-violet-200 focus:border-violet-400">
                              <SelectValue placeholder={selectedWaterSourceProvince ? "Select district" : "Select province first"} />
                            </SelectTrigger>
                            <SelectContent>
                              {getFormattedDistrictOptions(selectedWaterSourceProvince).map((d) => (
                                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <BulkNetworksTable
                        rows={bulkNetworks}
                        onChange={readOnly ? undefined : setBulkNetworks}
                        mode={readOnly ? "readonly" : "editable"}
                        province={selectedWaterSourceProvince}
                        district={selectedWaterSourceDistrict}
                      />

                      {renderRequiredAttachmentsForActivity("district_water_supply")}
                    </div>
                  )}
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
                            value={field.value === null || field.value === undefined ? undefined : (field.value ? "yes" : "no")}
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
                  {watchedOwnsAllLand === true && (
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
                  {watchedOwnsAllLand === false && (
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
                                onValueChange={readOnly ? undefined : (value) => {
                                  const hasAccess = value === "yes";
                                  field.onChange(hasAccess);
                                  form.clearErrors('hasLandAccess');
                                  if (hasAccess) {
                                    // If user now has access and adds docs, uploader will clear any remaining doc error.
                                    if (validationError && /access to the land|land access/i.test(validationError)) {
                                      setValidationError(null);
                                    }
                                  } else {
                                    form.clearErrors('landAccessDocuments' as any);
                                  }
                                }}
                                value={field.value === null || field.value === undefined ? undefined : (field.value ? "yes" : "no")}
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

                      {form.watch('hasLandAccess') === false && (
                        <Alert variant="destructive" className="mt-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Cannot proceed</AlertTitle>
                          <AlertDescription>
                            You cannot proceed with this application without access to the land. Please obtain legal access to the land (easement, consent, lease, etc.) before applying for a water permit.
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Land access documents - only shown when user has indicated they have access */}
                      {form.watch('hasLandAccess') === true && (
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
                      )}
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

                {/* PAYMENT TAB - For applicants: payment widget; For staff: payment confirmation panel */}
                {shouldShowPaymentTab && (
                  <TabsContent value="payment" className="pt-6 space-y-6">
                    {shouldShowStaffPaymentTab ? (
                      <PaymentConfirmationPanel
                        applicationId={(currentApplication as any)?.id ?? (initialData as any)?.id ?? ""}
                        applicationStatus={(currentApplication as any)?.status}
                        applicationNumber={(currentApplication as any)?.application_number}
                        applicantName={(userData as any)?.name}
                        applicantEmail={(userData as any)?.email}
                        applicantPhone={(userData as any)?.phone}
                        viewerRole="staff"
                      />
                    ) : shouldShowApplicantPaymentDetailsTab && currentApplication?.status === 'pending_payment' ? (
                      <PaymentTab
                        application={currentApplication}
                        autoRedirectOnCompletion={true}
                        completionRedirectPath="/dashboard?tab=applications"
                      />
                    ) : shouldShowApplicantPaymentDetailsTab ? (
                      <PaymentConfirmationPanel
                        applicationId={(currentApplication as any)?.id ?? (initialData as any)?.id ?? ""}
                        applicationStatus={(currentApplication as any)?.status}
                        applicationNumber={(currentApplication as any)?.application_number}
                        applicantName={(userData as any)?.name}
                        applicantEmail={(userData as any)?.email}
                        applicantPhone={(userData as any)?.phone}
                        viewerRole="applicant"
                      />
                    ) : (
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
                        autoRedirectOnCompletion={!readOnly && mode !== "view"}
                        completionRedirectPath={mode === "create" && !isModification ? "/dashboard" : "/dashboard?tab=applications"}
                        onRetrySave={() => {
                          setPaymentPrepError(null);
                          // Compute modification changes if in modification mode
                          let modificationChangesData: Record<string, { previous: any; current: any }> | undefined;
                          if (isModification && originalApplicationData) {
                            modificationChangesData = computeModificationChanges(originalApplicationData, form.getValues());
                          }
                          const { _isBulk: _s1, ...draftValues1 } = form.getValues();
                          const draftData = {
                            ...draftValues1,
                            ...files,
                            additionalDocuments,
                            ...(isDistrictWaterSupply && { bulk_networks: bulkNetworks, bulk_district: form.getValues("waterSourceDistrict"), is_bulk: true }),
                            ...(isModification ? {
                              isModification: true,
                              modificationChanges: modificationChangesData,
                            } : {}),
                          };
                          void onSaveAsDraft(draftData, 'draft').catch((error) => {
                            console.error('Error saving application:', error);
                            setPaymentPrepError('Please try saving your application again before proceeding to payment.');
                          });
                        }}
                        onBack={() => setActiveTab('land-ownership')}
                      />
                    )}
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
                          
                          // Include additionalDocuments and modification data in the draft save.
                          // Strip _isBulk — it's a client-side superRefine flag only, not a DB field.
                          const { _isBulk: _s2, ...draftValues2 } = form.getValues();
                          const draftData = {
                            ...draftValues2,
                            ...files,
                            additionalDocuments,
                            ...(isDistrictWaterSupply && { bulk_networks: bulkNetworks, bulk_district: form.getValues("waterSourceDistrict"), is_bulk: true }),
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
                        const tabs = getTabs();
                        const currentIndex = tabs.indexOf(activeTab);
                        if (currentIndex > 0) {
                          setActiveTab(tabs[currentIndex - 1]);
                        }
                      }}
                      disabled={activeTab === "applicant-info"}
                    >
                      Previous
                    </Button>
                    
                    {activeTab !== "land-ownership" && activeTab !== "payment" && (
                      <Button
                        type="button"
                        onClick={readOnly ? () => {
                          const tabs = getTabs();
                          const currentIndex = tabs.indexOf(activeTab);
                          if (currentIndex < tabs.length - 1) {
                            setActiveTab(tabs[currentIndex + 1]);
                          }
                        } : handleNextTab}
                        disabled={!readOnly && isNextButtonDisabled()}
                        className={(!readOnly && isNextButtonDisabled()) ? "opacity-50 cursor-not-allowed" : ""}
                      >
                        Next
                      </Button>
                    )}
                    
                    {activeTab === "land-ownership" && !readOnly && (
                      shouldShowPaymentTab ? (
                        <Button 
                          type="button"
                          onClick={async () => {
                            try {
                              // Enforce all form requirements before proceeding to payment
                              const ok = await validateAllTabsBeforeSubmit();
                              if (!ok) {
                                return;
                              }

                              // Compute modification changes if in modification mode
                              let modificationChangesData: Record<string, { previous: any; current: any }> | undefined;
                              if (isModification && originalApplicationData) {
                                modificationChangesData = computeModificationChanges(originalApplicationData, form.getValues());
                              }

                              // Automatically save as draft (like airline booking).
                              // Strip _isBulk — it's a client-side superRefine flag only, not a DB field.
                              const { _isBulk: _s3, ...draftValues3 } = form.getValues();
                              const draftData = {
                                ...draftValues3,
                                ...files,
                                additionalDocuments,
                                ...(isDistrictWaterSupply && { bulk_networks: bulkNetworks, bulk_district: form.getValues("waterSourceDistrict"), is_bulk: true }),
                                ...(isModification ? {
                                  isModification: true,
                                  modificationChanges: modificationChangesData,
                                } : {}),
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
                          disabled={isLoading || isNextButtonDisabled()}
                          className={(isLoading || isNextButtonDisabled()) ? "opacity-50 cursor-not-allowed" : ""}
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          {isLoading ? 'Saving…' : 'Continue to Payment'}
                          {isNextButtonDisabled() && (
                            <span className="ml-2 text-xs">(Complete required fields above)</span>
                          )}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={async () => {
                            // Enforce all form requirements before submission
                            const ok = await validateAllTabsBeforeSubmit();
                            if (!ok) {
                              return;
                            }

                            // Call the submit handler directly.
                            // We already validated every tab above, so we bypass
                            // form.handleSubmit() / Zod schema validation which can
                            // silently reject empty optional polygon defaults.
                            await handleFormSubmit(form.getValues());
                          }}
                          disabled={isLoading || isNextButtonDisabled()}
                          className={(isLoading || isNextButtonDisabled()) ? "opacity-50 cursor-not-allowed" : ""}
                        >
                          Submit {isModification ? 'Modification Request' : 'Application'}
                          {isNextButtonDisabled() && (
                            <span className="ml-2 text-xs">(Complete required fields above)</span>
                          )}
                        </Button>
                      )
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
