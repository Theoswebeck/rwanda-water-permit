"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
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
import { Upload, X, FileText, Check, AlertCircle, Save, Send, User, Globe, Factory, Droplet, CheckCircle, XCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// Form schema based on the exact structure from NEW_WATER_PERMIT_APPLICATION_FORM.md
const applicationFormSchema = z.object({
  // SECTION 1: IDENTIFICATION AND ADDRESS OF THE APPLICANT
  fullNameApplicant: z.string().min(2, { message: "Full name is required" }),
  categoryApplicant: z.enum(["individual", "company", "cooperative", "organization", "institution", "ngo_association", "other"]),
  categoryApplicantOther: z.string().optional(),
  nameRepresentative: z.string().optional(),
  identificationDoc: z.any().optional(),
  
  // Office Address
  officeProvince: z.string().min(1, { message: "Province is required" }),
  officeDistrict: z.string().min(1, { message: "District is required" }),
  officeSector: z.string().min(1, { message: "Sector is required" }),
  officeCell: z.string().min(1, { message: "Cell is required" }),
  officeVillage: z.string().optional(),
  
  // Contact Information
  telephoneContact: z.string().min(10, { message: "Telephone is required" }),
  emailAddress: z.string().email({ message: "Valid email is required" }),
  
  // SECTION 2: SOURCE OF WATER
  waterSourceType: z.enum(["lake", "dam", "spring", "borehole", "stream_river", "other"]),
  waterSourceOther: z.string().optional(),
  nameSourceWater: z.string().min(1, { message: "Water source name is required" }),
  tributaryToMain: z.string().optional(),
  
  // Location of water source
  waterSourceProvince: z.string().min(1, { message: "Water source province is required" }),
  waterSourceDistrict: z.string().min(1, { message: "Water source district is required" }),
  waterSourceSector: z.string().min(1, { message: "Water source sector is required" }),
  waterSourceCell: z.string().min(1, { message: "Water source cell is required" }),
  waterSourceVillage: z.string().optional(),
  
  // Coordinates of water source
  waterSourceLatitude: z.string().optional(),
  waterSourceLongitude: z.string().optional(),
  
  // Reliability
  waterReliability: z.enum(["water_always_available", "frequently_dry", "dry_during_certain_season"]),
  
  // SECTION 3: INTENDED ACTIVITY
  intendedActivities: z.array(z.string()).min(1, { message: "Select at least one activity" }),
  intendedActivityOther: z.string().optional(),
  
  // Water Abstraction
  waterAbstractionDetails: z.array(z.object({
    activity: z.string(),
    flowRate: z.string().optional(),
    flowRateUnit: z.string().optional(),
    maxAverageYearly: z.number().optional(),
    abstractionMethod: z.string().optional(),
  })).min(1),
  
  // Water Concession (for Aquaculture)
  concessionArea: z.number().optional(),
  concessionAreaUnit: z.string().optional(),
  permitPeriod: z.string().optional(),
  
  // SECTION 4: OWNERSHIP OF ADJOINING LAND
  ownsAllLand: z.boolean(),
  hasLandAccess: z.boolean().optional(),
  
  // SECTION 5: PAYMENT INFORMATION (removed per RWB request)
  
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
  // ANNEX G (Mining) structured fields
  miningQuantityPerDay: z.string().optional(),
  miningQuantityPerMonth: z.string().optional(),
  miningMineralsType: z.string().optional(),
  miningProductionCapacityTonsPerYear: z.number().optional(),

  // Fish farming (replacing Aquaculture)
  fishLakeAreaHectares: z.number().optional(),
  fishPondsDiscardWaterQuantityM3PerDay: z.number().optional(),
  
  // Additional documents
  technicalDrawings: z.any().optional(),
  environmentalImpactDoc: z.any().optional(),
  feasibilityStudy: z.any().optional(),
  // Mining attachments
  miningLicense: z.any().optional(),
  miningEIA: z.any().optional(),
  miningHydrologicalReport: z.any().optional(),
  miningGeneralRequirements: z.any().optional(),
  
  // CERTIFICATION
  certificationAgreement: z.boolean().refine((val) => val === true, {
    message: "You must certify the information is accurate"
  }),
});

type FormValues = z.infer<typeof applicationFormSchema>;

interface ApplicationFormProps {
  userData: any;
  onSubmit: (data: FormValues, status: 'submitted') => void | Promise<void>;
  onSaveAsDraft: (data: FormValues, status: 'draft', isAutoSave?: boolean, draftId?: string | null) => Promise<any>;
  isLoading: boolean;
  initialData?: Partial<FormValues>;
  initialDocuments?: Record<string, string>;
  mode?: 'create' | 'edit';
}

export function ApplicationForm({ 
  userData, 
  onSubmit, 
  onSaveAsDraft, 
  isLoading, 
  initialData, 
  initialDocuments = {},
  mode = 'create' 
}: ApplicationFormProps) {
  const [activeTab, setActiveTab] = useState("applicant-info");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [uploadedFileUrls, setUploadedFileUrls] = useState<Record<string, string>>({});
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedWaterSourceProvince, setSelectedWaterSourceProvince] = useState("");
  const [selectedWaterSourceDistrict, setSelectedWaterSourceDistrict] = useState("");
  
  const fileInputRefs = {
    identificationDoc: useRef<HTMLInputElement>(null),
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
    // Coffee Washing documents
    coffeeWashingGeneralRequirements: useRef<HTMLInputElement>(null),
    coffeeWashingEIA: useRef<HTMLInputElement>(null),
    // Industrial documents
    industrialGeneralRequirements: useRef<HTMLInputElement>(null),
    industrialEIA: useRef<HTMLInputElement>(null),
    industrialWasteManagementPlan: useRef<HTMLInputElement>(null),
    // Hydropower documents
    hydropowerGeneralRequirements: useRef<HTMLInputElement>(null),
    hydropowerEIA: useRef<HTMLInputElement>(null),
    hydropowerFeasibilityStudy: useRef<HTMLInputElement>(null),
    // Construction of Dam documents
    constructionDamGeneralRequirements: useRef<HTMLInputElement>(null),
    constructionDamEIA: useRef<HTMLInputElement>(null),
    constructionDamEngineeringPlans: useRef<HTMLInputElement>(null),
    // Infrastructure Construction documents
    infrastructureGeneralRequirements: useRef<HTMLInputElement>(null),
    infrastructureEIA: useRef<HTMLInputElement>(null),
    infrastructureEngineeringPlans: useRef<HTMLInputElement>(null),
    // Recreation documents
    recreationGeneralRequirements: useRef<HTMLInputElement>(null),
    recreationEIA: useRef<HTMLInputElement>(null),
    recreationManagementPlan: useRef<HTMLInputElement>(null),
    // Navigation documents
    navigationGeneralRequirements: useRef<HTMLInputElement>(null),
    navigationEIA: useRef<HTMLInputElement>(null),
    navigationManagementPlan: useRef<HTMLInputElement>(null),
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: {
      fullNameApplicant: userData?.name || "",
      categoryApplicant: "individual",
      telephoneContact: userData?.phone || "",
      emailAddress: userData?.email || "",
      waterAbstractionDetails: [{ activity: "", flowRate: "", flowRateUnit: "m3_per_second", maxAverageYearly: 0, abstractionMethod: "" }],
      intendedActivities: [],
      ownsAllLand: false,
      certificationAgreement: false,
      miningQuantityPerDay: "",
      miningQuantityPerMonth: "",
      miningMineralsType: "",
      miningProductionCapacityTonsPerYear: 0,
      fishLakeAreaHectares: undefined,
      fishPondsDiscardWaterQuantityM3PerDay: undefined,
      waterSourceLatitude: "",
      waterSourceLongitude: "",
      ...initialData
    }
  });

  const watchedCategoryApplicant = form.watch("categoryApplicant");
  const watchedWaterSourceType = form.watch("waterSourceType");
  const watchedIntendedActivities = form.watch("intendedActivities");
  const watchedOwnsAllLand = form.watch("ownsAllLand");

  // Tab validation functions
  const validateApplicantTab = async () => {
    const fields = [
      'fullNameApplicant', 'categoryApplicant', 'officeProvince', 
      'officeDistrict', 'officeSector', 'officeCell', 'telephoneContact', 'emailAddress'
    ];
    const errors = await form.trigger(fields as any);
    return errors;
  };

  const validateWaterSourceTab = async () => {
    const fields = [
      'waterSourceType', 'nameSourceWater', 'waterSourceProvince',
      'waterSourceDistrict', 'waterSourceSector', 'waterSourceCell', 'waterReliability'
    ];
    const errors = await form.trigger(fields as any);
    return errors;
  };

  const validateIntendedActivityTab = async () => {
    const fields = ['intendedActivities', 'waterAbstractionDetails'];
    const errors = await form.trigger(fields as any);
    return errors;
  };

  const handleNextTab = async () => {
    const tabs = ["applicant-info", "water-source", "intended-activity", "land-ownership"];
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
      default:
        isValid = true;
    }

    if (isValid) {
      setValidationError(null);
      setActiveTab(tabs[currentIndex + 1]);
    } else {
      // Show error message
      setValidationError("Please fill in all required fields before proceeding to the next section.");
      setTimeout(() => setValidationError(null), 5000); // Clear error after 5 seconds
    }
  };

  // Reset form with initial data when it becomes available
  useEffect(() => {
    if (initialData) {
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
        waterSourceType: "stream_river",
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
        intendedActivities: ["water_supply"],
        intendedActivityOther: "",
        waterAbstractionDetails: [{
          activity: "water_supply",
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
        fishPondsDiscardWaterQuantityM3PerDay: undefined,
        certificationAgreement: true,
        // Override with loaded data (exclude nameSourceWater to prevent auto-population)
        ...(({ nameSourceWater, ...rest }) => rest)(initialData)
      });
      
      // Update dropdown selection states to enable cascading
      if (initialData.officeProvince) {
        setSelectedProvince(initialData.officeProvince);
      }
      if (initialData.officeDistrict) {
        setSelectedDistrict(initialData.officeDistrict);
      }
      if (initialData.waterSourceProvince) {
        setSelectedWaterSourceProvince(initialData.waterSourceProvince);
      }
      if (initialData.waterSourceDistrict) {
        setSelectedWaterSourceDistrict(initialData.waterSourceDistrict);
      }
    }
  }, [initialData, form]);

  // Load initial documents when provided
  useEffect(() => {
    if (initialDocuments && Object.keys(initialDocuments).length > 0) {
      setUploadedFileUrls(initialDocuments);
    }
  }, [initialDocuments]);

  // Rwanda Administrative Divisions Data
  const rwandaAdministrativeDivisions = {
    kigali: {
      sectors: [
        { value: "gasabo", label: "Gasabo", cells: ["bumbogo", "gatsata", "jali", "kacyiru", "kimihurura"] },
        { value: "kicukiro", label: "Kicukiro", cells: ["gahanga", "gatenga", "gikondo", "kanombe", "kigarama"] },
        { value: "nyarugenge", label: "Nyarugenge", cells: ["gitega", "kanyinya", "kigali", "kimisagara", "mageragere"] }
      ]
    },
    northern: {
      sectors: [
        { value: "burera", label: "Burera", cells: ["bungwe", "butaro", "cyanika", "cyeru", "gahunga"] },
        { value: "gicumbi", label: "Gicumbi", cells: ["bukure", "bwisige", "cyumba", "gicumbi", "kageyo"] },
        { value: "musanze", label: "Musanze", cells: ["busogo", "cyuve", "gacaca", "gashaki", "gataraga"] },
        { value: "rulindo", label: "Rulindo", cells: ["base", "burega", "buyoga", "cyinzuzi", "cyungo"] },
        { value: "gakenke", label: "Gakenke", cells: ["cyabingo", "gakenke", "gashenyi", "mugunga", "janja"] }
      ]
    },
    southern: {
      sectors: [
        { value: "gisagara", label: "Gisagara", cells: ["gishubi", "kansi", "kigembe", "mukingo", "musha"] },
        { value: "huye", label: "Huye", cells: ["gishamvu", "karama", "kigoma", "kinazi", "maraba"] },
        { value: "kamonyi", label: "Kamonyi", cells: ["gacurabwenge", "karama", "kayenzi", "kayumbu", "mugina"] },
        { value: "muhanga", label: "Muhanga", cells: ["cyeza", "kibangu", "kiyumba", "muhanga", "mukura"] },
        { value: "nyamagabe", label: "Nyamagabe", cells: ["buruhukiro", "cyanika", "gasaka", "gatare", "kaduha"] },
        { value: "nyanza", label: "Nyanza", cells: ["busasamana", "busoro", "cyabakamyi", "kibirizi", "kigoma"] },
        { value: "nyaruguru", label: "Nyaruguru", cells: ["cyahinda", "gitwe", "kibeho", "mata", "munini"] },
        { value: "ruhango", label: "Ruhango", cells: ["bweramana", "byimana", "kabagari", "kinazi", "kinihira"] }
      ]
    },
    eastern: {
      sectors: [
        { value: "bugesera", label: "Bugesera", cells: ["gashora", "juru", "kamabuye", "mareba", "mayange"] },
        { value: "gatsibo", label: "Gatsibo", cells: ["gasange", "gatsibo", "kageyo", "kiramuruzi", "kiziguro"] },
        { value: "kayonza", label: "Kayonza", cells: ["gahini", "kabare", "mukarange", "murama", "mwiri"] },
        { value: "kirehe", label: "Kirehe", cells: ["gatore", "kigarama", "kirehe", "mahama", "mpanga"] },
        { value: "ngoma", label: "Ngoma", cells: ["jarama", "karembo", "kibungo", "mugesera", "mutenderi"] },
        { value: "nyagatare", label: "Nyagatare", cells: ["gatunda", "karangazi", "katabagemu", "kiyombe", "matimba"] },
        { value: "rwamagana", label: "Rwamagana", cells: ["fumbwe", "gahengeri", "gishari", "karenge", "kigabiro"] }
      ]
    },
    western: {
      sectors: [
        { value: "karongi", label: "Karongi", cells: ["bwishyura", "gashari", "gitesi", "murambi", "rugabano"] },
        { value: "ngororero", label: "Ngororero", cells: ["bwira", "gaseke", "hindiro", "kageyo", "sovu"] },
        { value: "nyabihu", label: "Nyabihu", cells: ["bigogwe", "jenda", "karago", "mukamira", "rambura"] },
        { value: "nyamasheke", label: "Nyamasheke", cells: ["bushekeri", "cyato", "gihombo", "kanjongo", "ruharambuga"] },
        { value: "rusizi", label: "Rusizi", cells: ["butare", "gashonga", "kamembe", "muganza", "nzahaha"] },
        { value: "rutsiro", label: "Rutsiro", cells: ["boneza", "gihango", "kigeyo", "manihira", "ruhango"] }
      ]
    }
  };

  const getDistrictOptions = () => {
    if (!selectedProvince) return [];
    const province = rwandaAdministrativeDivisions[selectedProvince as keyof typeof rwandaAdministrativeDivisions];
    return province ? province.sectors : [];
  };

  const getSectorOptions = () => {
    if (!selectedDistrict) return [];
    const province = rwandaAdministrativeDivisions[selectedProvince as keyof typeof rwandaAdministrativeDivisions];
    if (!province) return [];
    const district = province.sectors.find(s => s.value === selectedDistrict);
    return district ? district.cells.map(cell => ({ value: cell, label: cell.charAt(0).toUpperCase() + cell.slice(1) })) : [];
  };

  const getWaterSourceDistrictOptions = () => {
    if (!selectedWaterSourceProvince) return [];
    const province = rwandaAdministrativeDivisions[selectedWaterSourceProvince as keyof typeof rwandaAdministrativeDivisions];
    return province ? province.sectors : [];
  };

  const getWaterSourceSectorOptions = () => {
    if (!selectedWaterSourceDistrict) return [];
    const province = rwandaAdministrativeDivisions[selectedWaterSourceProvince as keyof typeof rwandaAdministrativeDivisions];
    if (!province) return [];
    const district = province.sectors.find(s => s.value === selectedWaterSourceDistrict);
    return district ? district.cells.map(cell => ({ value: cell, label: cell.charAt(0).toUpperCase() + cell.slice(1) })) : [];
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }
      
      setFiles(prev => ({ ...prev, [fieldName]: file }));
      form.setValue(fieldName as any, file);
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
                  onClick={() => fileInputRefs[fieldName as keyof typeof fileInputRefs]?.current?.click()}
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
                onClick={() => removeFile(fieldName)}
                className="h-6 w-6 p-0"
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
                Previously uploaded document
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRefs[fieldName as keyof typeof fileInputRefs]?.current?.click()}
                className="h-6 w-6 p-0"
              >
                <Upload className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
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

  // Auto-save functionality
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);

  const triggerAutoSave = async () => {
    try {
      setAutoSaveStatus('saving');
      const formData = form.getValues();
      
      // Call the draft save function with auto-save flag
      const result = await onSaveAsDraft(formData, 'draft', true);
      
      setLastAutoSave(new Date());
      setAutoSaveStatus('saved');
      
      // Reset to idle after 3 seconds
      setTimeout(() => {
        setAutoSaveStatus('idle');
      }, 3000);
    } catch (error) {
      console.error('Auto-save failed:', error);
      
      setAutoSaveStatus('error');
      setTimeout(() => {
        setAutoSaveStatus('idle');
      }, 3000);
    }
  };

  // Auto-save every 30 seconds when form data changes
  useEffect(() => {
    const timer = setInterval(() => {
      if (form.formState.isDirty) {
        triggerAutoSave();
      }
    }, 30000); // 30 seconds

    return () => clearInterval(timer);
  }, [form.formState.isDirty]);

  // Auto-save when switching tabs
  useEffect(() => {
    if (form.formState.isDirty) {
      triggerAutoSave();
    }
  }, [activeTab]);

  const handleFormSubmit = async (values: FormValues) => {
    try {
      await onSubmit({ ...values, ...files }, 'submitted');
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
      {/* Header with legal references */}
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

      <Card className="border-gray-200 dark:border-gray-800">
        <CardHeader>
          <CardTitle>Water Permit Application Form</CardTitle>
          <CardDescription>
            Fill out all required fields to submit your water permit application. Fields marked with * are required.
          </CardDescription>
          
          {/* Auto-save status */}
          <div className="flex items-center gap-2 mt-4">
            {autoSaveStatus === 'saving' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 text-amber-600 text-sm"
              >
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-amber-600"></div>
                Saving draft...
              </motion.div>
            )}
            {autoSaveStatus === 'saved' && lastAutoSave && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 text-green-600 text-sm"
              >
                <CheckCircle className="h-4 w-4" />
                ✅ Draft saved at {lastAutoSave.toLocaleTimeString()}
              </motion.div>
            )}
            {autoSaveStatus === 'error' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 text-red-600 text-sm"
              >
                <XCircle className="h-4 w-4" />
                ❌ Error saving draft - check browser console for details
              </motion.div>
            )}
          </div>
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
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
              <Tabs defaultValue="applicant-info" value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-5">
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
                            <Input {...field} value={field.value || ""} placeholder="Specify category" />
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
                            <Input {...field} value={field.value || ""} placeholder="Enter representative name" />
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
                                    onClick={() => fileInputRefs.identificationDoc.current?.click()}
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
                                      onClick={() => removeFile("identificationDoc")}
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
                                      Previously uploaded document
                                    </a>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setUploadedFileUrls(prev => {
                                          const { identificationDoc, ...rest } = prev;
                                          return rest;
                                        });
                                      }}
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
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  setSelectedProvince(value);
                                  // Reset dependent fields
                                  form.setValue("officeDistrict", "");
                                  form.setValue("officeSector", "");
                                  form.setValue("officeCell", "");
                                }} 
                                value={field.value}
                              >
                                <SelectTrigger className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 focus:border-blue-400">
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
                        name="officeDistrict"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>District *</FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  setSelectedDistrict(value);
                                  // Reset dependent fields
                                  form.setValue("officeSector", "");
                                  form.setValue("officeCell", "");
                                }}
                                value={field.value}
                                disabled={!selectedProvince}
                              >
                                <SelectTrigger className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 focus:border-green-400">
                                  <SelectValue placeholder={selectedProvince ? "Select district" : "Select province first"} />
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
                        name="officeSector"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sector *</FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  // Reset cell field
                                  form.setValue("officeCell", "");
                                }}
                                value={field.value}
                                disabled={!selectedDistrict}
                              >
                                <SelectTrigger className="bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200 focus:border-purple-400">
                                  <SelectValue placeholder={selectedDistrict ? "Select sector" : "Select district first"} />
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
                        name="officeCell"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cell *</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                value={field.value || ""}
                                placeholder="Enter cell"
                                className="bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200 focus:border-orange-400"
                              />
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
                              <Input 
                                {...field} 
                                placeholder="Enter village (optional)"
                                className="bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200 focus:border-gray-400"
                              />
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
                            <FormDescription className="text-xs text-gray-500">
                              From your account profile
                            </FormDescription>
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
                            <FormDescription className="text-xs text-gray-500">
                              From your account profile
                            </FormDescription>
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
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <SelectTrigger className="bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200 focus:border-blue-400">
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
                          <Input {...field} value={field.value || ""} placeholder="Enter name of water source" />
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
                          <Input {...field} value={field.value || ""} placeholder="Enter main river/lake (if applicable)" />
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
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  setSelectedWaterSourceProvince(value);
                                  // Reset dependent fields
                                  form.setValue("waterSourceDistrict", "");
                                  form.setValue("waterSourceSector", "");
                                  form.setValue("waterSourceCell", "");
                                }} 
                                value={field.value}
                              >
                                <SelectTrigger className="bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-200 focus:border-cyan-400">
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
                        name="waterSourceDistrict"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>District *</FormLabel>
                            <FormControl>
                              <Select 
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  setSelectedWaterSourceDistrict(value);
                                  // Reset dependent fields
                                  form.setValue("waterSourceSector", "");
                                  form.setValue("waterSourceCell", "");
                                }}
                                value={field.value}
                                disabled={!selectedWaterSourceProvince}
                              >
                                <SelectTrigger className="bg-gradient-to-r from-teal-50 to-emerald-50 border-teal-200 focus:border-teal-400">
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
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  // Reset cell field
                                  form.setValue("waterSourceCell", "");
                                }}
                                value={field.value}
                                disabled={!selectedWaterSourceDistrict}
                              >
                                <SelectTrigger className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200 focus:border-indigo-400">
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
                              <Input 
                                {...field} 
                                placeholder="Enter cell"
                                className="bg-gradient-to-r from-rose-50 to-pink-50 border-rose-200 focus:border-rose-400"
                              />
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
                              <Input 
                                {...field} 
                                placeholder="Enter village (optional)"
                                className="bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200 focus:border-gray-400"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* 11. Coordinates of water source */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium">
                      11. Coordinates of water source (Latitude, Longitude)
                    </Label>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="waterSourceLatitude"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Latitude</FormLabel>
                            <FormControl>
                              <Input 
                                {...field}
                                value={field.value || ""}
                                type="text"
                                placeholder="e.g., -1.9441"
                                className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 focus:border-blue-400"
                              />
                            </FormControl>
                            <FormDescription>
                              Enter latitude in decimal degrees (e.g., -1.9441)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="waterSourceLongitude"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Longitude</FormLabel>
                            <FormControl>
                              <Input 
                                {...field}
                                value={field.value || ""}
                                type="text"
                                placeholder="e.g., 29.8739"
                                className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 focus:border-blue-400"
                              />
                            </FormControl>
                            <FormDescription>
                              Enter longitude in decimal degrees (e.g., 29.8739)
                            </FormDescription>
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
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <SelectTrigger className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200 focus:border-emerald-400">
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

                  {/* 13. Activity Type */}
                  <FormField
                    control={form.control}
                    name="intendedActivities"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">
                          13. Intended Activity * (Select the primary activity)
                        </FormLabel>
                        <FormControl>
                          <Select onValueChange={(value) => field.onChange([value])} value={field.value?.[0] || ""}>
                            <SelectTrigger className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200 focus:border-indigo-400">
                              <SelectValue placeholder="Select primary water use activity" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="irrigation">Irrigation</SelectItem>
                              <SelectItem value="construction_of_dam">Construction of dam</SelectItem>
                              {/* Aquaculture removed per RWB feedback; replaced with fish farming options below */}
                              <SelectItem value="fish_farming_lakes">Fish farming in lakes</SelectItem>
                              <SelectItem value="fish_farming_ponds">Fish farming in ponds</SelectItem>
                              <SelectItem value="mining">Mining</SelectItem>
                              <SelectItem value="industry">Industry</SelectItem>
                              <SelectItem value="water_supply">Water Supply</SelectItem>
                              <SelectItem value="coffee_washing">Coffee washing</SelectItem>
                              <SelectItem value="electricity_generation">Electricity generation</SelectItem>
                              <SelectItem value="navigation">Navigation</SelectItem>
                              <SelectItem value="recreation_activities">Recreation activities</SelectItem>
                              <SelectItem value="construction_of_infrastructures">Construction of infrastructures</SelectItem>
                              <SelectItem value="other">Other (specify)</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Other activity specification */}
                  {watchedIntendedActivities?.includes("other") && (
                    <FormField
                      control={form.control}
                      name="intendedActivityOther"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Please specify other activity</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Specify other activity" />
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
                                    <Input placeholder="Type of crops" className="border-0 bg-transparent" />
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <div className="flex gap-1">
                                      <Input placeholder="From" className="border-0 bg-transparent text-xs" />
                                      <span className="self-center text-xs">-</span>
                                      <Input placeholder="To" className="border-0 bg-transparent text-xs" />
                                    </div>
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Select>
                                      <SelectTrigger className="border-0 bg-transparent h-8">
                                        <SelectValue placeholder="Select system" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="outdoor">Outdoor</SelectItem>
                                        <SelectItem value="greenhouse">Green House</SelectItem>
                                        <SelectItem value="hydroponics">Hydroponics</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Select>
                                      <SelectTrigger className="border-0 bg-transparent h-8">
                                        <SelectValue placeholder="Select method" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="surface">Surface</SelectItem>
                                        <SelectItem value="sprinkler">Sprinkler</SelectItem>
                                        <SelectItem value="drip">Drip</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Area in ha" className="border-0 bg-transparent" />
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Water demand" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="block text-sm font-medium mb-2">Storage facilities (if any): Reservoirs, Tanks, etc.</label>
                              <Textarea placeholder="Describe storage facilities..." className="min-h-[80px]" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-2">Storage capacity (m³)</label>
                              <Input placeholder="Enter storage capacity" />
                            </div>
                          </div>

                          <DocumentRequirementsInfo documents={[
                            "General requirements document",
                            "Environmental Impact Assessment certificate (for large scale > 10 ha)",
                            "Feasibility study (for large scale > 10 ha)"
                          ]} />
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DocumentUploadField
                              fieldName="irrigationGeneralRequirements"
                              label="General requirements"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="irrigationEIA"
                              label="Environmental Impact Assessment certificate"
                              required={false}
                            />
                            
                            <DocumentUploadField
                              fieldName="irrigationFeasibilityStudy"
                              label="Feasibility study"
                              required={false}
                            />
                          </div>
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
                                    <Input placeholder="Enter population" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm">Water demand per capita per day (m³/day)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Enter per capita demand" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm">Water Demand per day (number of person*m³/day)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Total daily demand" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm">How much water will be abstracted per day? (m³/day)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Daily abstraction" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 dark:border-gray-600 p-3 text-sm">Storage capacity (m³)</td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Storage capacity" className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <DocumentRequirementsInfo documents={[
                            "General requirements document",
                            "Feasibility study"
                          ]} />
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DocumentUploadField
                              fieldName="waterSupplyGeneralRequirements"
                              label="General requirements"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="waterSupplyFeasibilityStudy"
                              label="Feasibility study"
                              required={true}
                            />
                          </div>
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

                          {/* Mining Attachments (same page) */}
                          <div className="mt-6 space-y-4">
                            <DocumentRequirementsInfo documents={[
                              "General requirements document",
                              "Valid mining license",
                              "Environmental Impact Assessment certificate", 
                              "Hydrological report"
                            ]} />
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <DocumentUploadField
                                fieldName="miningGeneralRequirements"
                                label="General requirements"
                                required={true}
                              />
                              
                              <DocumentUploadField
                                fieldName="miningLicense"
                                label="Mining license"
                                required={true}
                              />
                              
                              <DocumentUploadField
                                fieldName="miningEIA"
                                label="Environmental Impact Assessment certificate"
                                required={true}
                              />
                              
                              <DocumentUploadField
                                fieldName="miningHydrologicalReport"
                                label="Hydrological report"
                                required={true}
                              />
                            </div>
                          </div>
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
                                        <Input placeholder="Lake name" className="border-0 bg-transparent" />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <Input placeholder="Number of cages" className="border-0 bg-transparent" />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <Input placeholder="Fishes per cage" className="border-0 bg-transparent" />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                          <FormField
                            control={form.control}
                            name="fishLakeAreaHectares"
                            render={({ field }) => (
                                            <Input 
                                              type="number" 
                                              {...field} 
                                              onChange={(e) => field.onChange(Number(e.target.value))}
                                              placeholder="Area" 
                                              className="border-0 bg-transparent" 
                                            />
                                          )}
                                        />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <Input placeholder="Coordinates" className="border-0 bg-transparent" />
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
                                        <Input placeholder="Capacity" className="border-0 bg-transparent" />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                                        <Input placeholder="Refilling frequency" className="border-0 bg-transparent" />
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                          <FormField
                            control={form.control}
                            name="fishPondsDiscardWaterQuantityM3PerDay"
                            render={({ field }) => (
                                            <Input 
                                              type="number" 
                                              {...field} 
                                              onChange={(e) => field.onChange(Number(e.target.value))}
                                              placeholder="Monthly usage" 
                                              className="border-0 bg-transparent" 
                                            />
                                          )}
                                        />
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          <DocumentRequirementsInfo documents={[
                            "General requirements document",
                            "Recommendation Letter from MINAGRI/RAB",
                            "Environmental Impact Assessment certificate",
                            "Management plan for aquaculture operations"
                          ]} />
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DocumentUploadField
                              fieldName="aquacultureGeneralRequirements"
                              label="General requirements"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="aquacultureEIA"
                              label="Environmental Impact Assessment certificate"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="aquacultureManagementPlan"
                              label="Management plan for aquaculture operations"
                              required={true}
                            />
                          </div>
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
                                    <Input placeholder="Daily quantity" className="border-0 bg-transparent" />
                                  </td>
                                  <td className="border border-gray-300 dark:border-gray-600 p-2">
                                    <Input placeholder="Monthly quantity" className="border-0 bg-transparent" />
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

                          <DocumentRequirementsInfo documents={[
                            "General requirements document",
                            "Environmental Impact Assessment certificate"
                          ]} />
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DocumentUploadField
                              fieldName="coffeeWashingGeneralRequirements"
                              label="General requirements"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="coffeeWashingEIA"
                              label="Environmental Impact Assessment certificate"
                              required={true}
                            />
                          </div>
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
                                      <Input placeholder="Daily" className="border-0 bg-transparent" />
                                    </td>
                                    <td className="border border-gray-300 dark:border-gray-600 p-2">
                                      <Input placeholder="Monthly" className="border-0 bg-transparent" />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <DocumentRequirementsInfo documents={[
                            "General requirements document",
                            "Environmental Impact Assessment certificate",
                            "Waste management plan"
                          ]} />
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DocumentUploadField
                              fieldName="industrialGeneralRequirements"
                              label="General requirements"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="industrialEIA"
                              label="Environmental Impact Assessment certificate"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="industrialWasteManagementPlan"
                              label="Waste management plan"
                              required={true}
                            />
                          </div>
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
                                    <Input placeholder="Annual quantity" className="border-0 bg-transparent" />
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

                          <DocumentRequirementsInfo documents={[
                            "General requirements document",
                            "Environmental Impact Assessment certificate",
                            "Feasibility study (Hydrological assessment)"
                          ]} />
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DocumentUploadField
                              fieldName="hydropowerGeneralRequirements"
                              label="General requirements"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="hydropowerEIA"
                              label="Environmental Impact Assessment certificate"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="hydropowerFeasibilityStudy"
                              label="Feasibility study (Hydrological assessment)"
                              required={true}
                            />
                          </div>
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
                                    <Input placeholder="e.g., 24 months" className="border-0 bg-transparent" />
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

                          <DocumentRequirementsInfo documents={[
                            "General requirements document",
                            "Environmental Impact Assessment certificate",
                            "Engineering plans and drawings"
                          ]} />
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DocumentUploadField
                              fieldName="constructionDamGeneralRequirements"
                              label="General requirements"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="constructionDamEIA"
                              label="Environmental Impact Assessment certificate"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="constructionDamEngineeringPlans"
                              label="Engineering plans and drawings"
                              required={true}
                            />
                          </div>
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
                                    <Input placeholder="e.g., 24 months" className="border-0 bg-transparent" />
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

                          <DocumentRequirementsInfo documents={[
                            "General requirements document",
                            "Environmental Impact Assessment certificate",
                            "Engineering plans and drawings"
                          ]} />
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DocumentUploadField
                              fieldName="infrastructureGeneralRequirements"
                              label="General requirements"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="infrastructureEIA"
                              label="Environmental Impact Assessment certificate"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="infrastructureEngineeringPlans"
                              label="Engineering plans and drawings"
                              required={true}
                            />
                          </div>
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
                                    <Input placeholder="e.g., Permanent, Seasonal, etc." className="border-0 bg-transparent" />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <DocumentRequirementsInfo documents={[
                            "General requirements document",
                            "Environmental Impact Assessment certificate",
                            "Navigation management plan"
                          ]} />
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DocumentUploadField
                              fieldName="navigationGeneralRequirements"
                              label="General requirements"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="navigationEIA"
                              label="Environmental Impact Assessment certificate"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="navigationManagementPlan"
                              label="Navigation management plan"
                              required={true}
                            />
                          </div>
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

                          <DocumentRequirementsInfo documents={[
                            "General requirements document",
                            "Environmental Impact Assessment certificate",
                            "Management plan for recreational activities"
                          ]} />
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DocumentUploadField
                              fieldName="recreationGeneralRequirements"
                              label="General requirements"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="recreationEIA"
                              label="Environmental Impact Assessment certificate"
                              required={true}
                            />
                            
                            <DocumentUploadField
                              fieldName="recreationManagementPlan"
                              label="Management plan for recreational activities"
                              required={true}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 14. Water Abstraction Table */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium">
                      14. Water Abstraction Details *
                    </Label>
                    
                    <div className="space-y-4">
                      <div className="border rounded-lg p-4 space-y-4">
                        <h4 className="font-medium">Water Use Details</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="waterAbstractionDetails.0.activity"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Activity *</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Enter activity" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="waterAbstractionDetails.0.flowRate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Flow Rate</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Enter flow rate" />
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
                            onValueChange={(value) => field.onChange(value === "yes")} 
                            value={field.value ? "yes" : "no"}
                          >
                            <SelectTrigger className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 focus:border-green-400">
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
                                onValueChange={(value) => field.onChange(value === "yes")} 
                                value={field.value ? "yes" : "no"}
                              >
                                <SelectTrigger className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 focus:border-amber-400">
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
                      <div className="space-y-4">
                        <Label className="text-base font-medium">
                          18. Attach proof of land access (easement, consent, lease, etc.)
                        </Label>
                        
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
                                onClick={() => fileInputRefs.landAccessDocuments.current?.click()}
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
                                  onClick={() => removeFile("landAccessDocuments")}
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
                                  Previously uploaded document
                                </a>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setUploadedFileUrls(prev => {
                                      const { landAccessDocuments, ...rest } = prev;
                                      return rest;
                                    });
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      </div>
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



                {/* Form Actions */}
                <div className="flex justify-between pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      await onSaveAsDraft(form.getValues(), 'draft', false);
                    }}
                    disabled={isLoading}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save as Draft
                  </Button>
                  
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const tabs = ["applicant-info", "water-source", "intended-activity", "land-ownership"];
                        const currentIndex = tabs.indexOf(activeTab);
                        if (currentIndex > 0) {
                          setActiveTab(tabs[currentIndex - 1]);
                        }
                      }}
                      disabled={activeTab === "applicant-info"}
                    >
                      Previous
                    </Button>
                    
                    <Button
                      type="button"
                      onClick={handleNextTab}
                      disabled={activeTab === "land-ownership"}
                    >
                      Next
                    </Button>
                    
                    {activeTab === "land-ownership" && (
                      <Button type="submit" disabled={isLoading}>
                        <Send className="h-4 w-4 mr-2" />
                        Submit Application
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
