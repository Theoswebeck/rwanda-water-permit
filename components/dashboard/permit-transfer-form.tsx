"use client";

import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
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
import { 
  Upload, 
  X, 
  FileText, 
  Check, 
  AlertCircle, 
  Save, 
  Send, 
  User, 
  Globe, 
  ArrowLeftRight,
  Loader2,
  Building2,
  FileCheck,
  Calendar,
  CreditCard,
  CheckCircle
} from "lucide-react";
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
import { PaymentTab } from '@/components/dashboard/payment-tab';
import type { Permit, Application } from "@/types/database";

// Transfer form schema
const transferFormSchema = z.object({
  // PART 1: PARTICULARS OF THE PERMIT (pre-filled, read-only)
  permitNumber: z.string().min(1, "Permit number is required"),
  effectiveDate: z.string().min(1, "Effective date is required"),
  expirationDate: z.string().min(1, "Expiration date is required"),
  facilityProjectName: z.string().min(1, "Facility/Project name is required"),
  permitLocationSector: z.string().min(1, "Sector is required"),
  permitLocationDistrict: z.string().min(1, "District is required"),
  permitLocationProvince: z.string().min(1, "Province is required"),

  // PART 2: PERMIT HOLDER/TRANSFEROR (current owner - pre-filled)
  transferorName: z.string().min(1, "Transferor name is required"),
  transferorRepresentativeName: z.string().optional(),
  transferorRepresentativePosition: z.string().optional(),
  transferorAddressProvince: z.string().optional(),
  transferorAddressDistrict: z.string().optional(),
  transferorAddressSector: z.string().optional(),
  transferorAddressCell: z.string().optional(),
  transferorAddressVillage: z.string().optional(),
  transferorEmail: z.string().email("Valid email required").optional().or(z.literal("")),
  transferorPhone: z.string().optional(),
  transferorCertification: z.boolean().refine(val => val === true, {
    message: "Transferor certification is required"
  }),
  transferorTitlePosition: z.string().optional(),
  transferorSignatureDate: z.string().min(1, "Date is required"),

  // PART 3: NEW OWNER/TRANSFEREE (the new owner receiving the permit)
  transfereeName: z.string().min(2, "Transferee name is required"),
  transfereeRepresentativeName: z.string().optional(),
  transfereeRepresentativePosition: z.string().optional(),
  transfereeAddressProvince: z.string().min(1, "Province is required"),
  transfereeAddressDistrict: z.string().min(1, "District is required"),
  transfereeAddressSector: z.string().min(1, "Sector is required"),
  transfereeAddressCell: z.string().min(1, "Cell is required"),
  transfereeAddressVillage: z.string().optional(),
  transfereeEmail: z.string().email("Valid email is required"),
  transfereePhone: z.string().min(10, "Valid phone number is required"),
  transfereeCertification: z.boolean().refine(val => val === true, {
    message: "You must acknowledge full responsibility for the permit terms"
  }),
  transfereeTitlePosition: z.string().optional(),
  transfereeSignatureDate: z.string().min(1, "Date is required"),

  // Documents (paymentProof removed - using IremboPay instead)
  certifiedLetter: z.any().optional(),
  registrationCertificate: z.any().optional(),
  existingPermitCopy: z.any().optional(),
});

type TransferFormValues = z.infer<typeof transferFormSchema>;

export interface PermitWithApplication extends Permit {
  application?: Application & {
    applicant?: {
      id: string;
      email?: string;
      phone?: string;
      first_name?: string;
      last_name?: string;
      company_name?: string;
      company_address?: string;
      company_phone?: string;
      account_type?: string;
    };
  };
}

interface PermitTransferFormProps {
  permit: PermitWithApplication;
  userData: {
    email: string;
    name: string;
    phone: string;
    address?: string;
    account_type?: string;
  };
  onSubmit: (data: TransferFormValues, status: 'submitted') => void | Promise<void>;
  onSaveAsDraft: (data: TransferFormValues, status: 'draft') => Promise<any>;
  isLoading: boolean;
  initialData?: Partial<TransferFormValues>;
  initialDocuments?: Record<string, { url: string; name: string }>;
  mode?: 'create' | 'edit' | 'view';
  readOnly?: boolean;
  currentApplication?: Application | null; // The saved application object (needed for payment tab)
  isStaffView?: boolean; // When true, hides payment/submit actions (staff only views the form)
}

export const PermitTransferForm = memo(function PermitTransferForm({ 
  permit,
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
}: PermitTransferFormProps) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("permit-info");
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [uploadedFileUrls, setUploadedFileUrls] = useState<Record<string, string>>({});
  const [paymentPrepError, setPaymentPrepError] = useState<string | null>(null);

  const fileInputRefs = {
    certifiedLetter: useRef<HTMLInputElement>(null),
    registrationCertificate: useRef<HTMLInputElement>(null),
    existingPermitCopy: useRef<HTMLInputElement>(null),
  };

  // State for cascading dropdowns - Transferee Address
  const [selectedTransfereeProvince, setSelectedTransfereeProvince] = useState("");
  const [selectedTransfereeDistrict, setSelectedTransfereeDistrict] = useState("");
  const [selectedTransfereeSector, setSelectedTransfereeSector] = useState("");
  const [selectedTransfereeCell, setSelectedTransfereeCell] = useState("");
  const [selectedTransfereeVillage, setSelectedTransfereeVillage] = useState("");

  // Get default form values pre-filled from permit
  // IMPORTANT: The logged-in user is the TRANSFEROR (current owner transferring their permit)
  // The TRANSFEREE is the new owner who will receive the permit (needs to be filled in)
  const getDefaultValues = useMemo((): Partial<TransferFormValues> => {
    const today = new Date().toISOString().split('T')[0];
    
    const defaults: Partial<TransferFormValues> = {
      // Part 1: Permit Particulars (from permit)
      permitNumber: permit.permit_number || '',
      effectiveDate: permit.issued_date?.split('T')[0] || '',
      expirationDate: permit.expiry_date?.split('T')[0] || '',
      facilityProjectName: permit.application?.project_title || '',
      permitLocationProvince: permit.application?.province || '',
      permitLocationDistrict: permit.application?.district || '',
      permitLocationSector: permit.application?.sector || '',

      // Part 2: Transferor (current owner = logged-in user who owns the permit)
      transferorName: userData.name || '',
      transferorEmail: userData.email || '',
      transferorPhone: userData.phone || '',
      transferorAddressProvince: permit.application?.province || '',
      transferorAddressDistrict: permit.application?.district || '',
      transferorAddressSector: permit.application?.sector || '',
      transferorAddressCell: permit.application?.cell || '',
      transferorAddressVillage: permit.application?.village || '',
      transferorCertification: false,
      transferorSignatureDate: today,

      // Part 3: Transferee (new owner - needs to be filled in by the user)
      transfereeName: '',
      transfereeEmail: '',
      transfereePhone: '',
      transfereeAddressProvince: '',
      transfereeAddressDistrict: '',
      transfereeAddressSector: '',
      transfereeAddressCell: '',
      transfereeAddressVillage: '',
      transfereeCertification: false,
      transfereeSignatureDate: today,
    };

    return { ...defaults, ...initialData };
  }, [permit, userData, initialData]);

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: getDefaultValues,
    mode: "onBlur",
    reValidateMode: "onChange"
  });

  // Get form values for cascading dropdowns
  const transfereeProvince = form.watch('transfereeAddressProvince');
  const transfereeDistrict = form.watch('transfereeAddressDistrict');
  const transfereeSector = form.watch('transfereeAddressSector');
  const transfereeCell = form.watch('transfereeAddressCell');
  const transfereeVillage = form.watch('transfereeAddressVillage');

  // Update dropdown states when form values change
  useEffect(() => {
    if (transfereeProvince !== selectedTransfereeProvince) {
      setSelectedTransfereeProvince(transfereeProvince || "");
    }
    if (transfereeDistrict !== selectedTransfereeDistrict) {
      setSelectedTransfereeDistrict(transfereeDistrict || "");
    }
    if (transfereeSector !== selectedTransfereeSector) {
      setSelectedTransfereeSector(transfereeSector || "");
    }
    if (transfereeCell !== selectedTransfereeCell) {
      setSelectedTransfereeCell(transfereeCell || "");
    }
    if (transfereeVillage !== selectedTransfereeVillage) {
      setSelectedTransfereeVillage(transfereeVillage || "");
    }
  }, [transfereeProvince, transfereeDistrict, transfereeSector, transfereeCell, transfereeVillage]);

  // Helper functions for dropdown options
  const getTransfereeDistrictOptions = () => {
    if (!selectedTransfereeProvince) return [];
    return getFormattedDistrictOptions(selectedTransfereeProvince);
  };

  const getTransfereeSectorOptions = () => {
    if (!selectedTransfereeProvince || !selectedTransfereeDistrict) return [];
    return getFormattedSectorOptions(selectedTransfereeProvince, selectedTransfereeDistrict);
  };

  const getTransfereeCellOptions = () => {
    if (!selectedTransfereeProvince || !selectedTransfereeDistrict || !selectedTransfereeSector) return [];
    return getFormattedCellOptions(selectedTransfereeProvince, selectedTransfereeDistrict, selectedTransfereeSector);
  };

  const getTransfereeVillageOptions = () => {
    if (!selectedTransfereeProvince || !selectedTransfereeDistrict || !selectedTransfereeSector || !selectedTransfereeCell) return [];
    return getFormattedVillageOptions(selectedTransfereeProvince, selectedTransfereeDistrict, selectedTransfereeSector, selectedTransfereeCell);
  };

  // Load initial documents
  useEffect(() => {
    if (initialDocuments && Object.keys(initialDocuments).length > 0) {
      const urlMap: Record<string, string> = {};
      Object.entries(initialDocuments).forEach(([key, doc]) => {
        if (typeof doc === 'string') {
          urlMap[key] = doc;
        } else {
          urlMap[key] = doc.url;
        }
      });
      setUploadedFileUrls(urlMap);
    }
  }, [initialDocuments]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = event.target.files?.[0];
    if (file) {
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

  // Document Upload Component
  const DocumentUploadField = ({ 
    fieldName, 
    label, 
    required = false,
    description = "",
  }: { 
    fieldName: string; 
    label: string; 
    required?: boolean;
    description?: string;
  }) => {
    const currentFile = files[fieldName];
    const currentUploadedUrl = uploadedFileUrls[fieldName];
    
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
          <input
            type="file"
            ref={fileInputRefs[fieldName as keyof typeof fileInputRefs]}
            onChange={(e) => handleFileChange(e, fieldName)}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
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
              <p className="text-xs text-gray-500">PDF, JPG, PNG, DOC (max 10MB)</p>
            </div>
          )}
          
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
          
          {!currentFile && currentUploadedUrl && (
            <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
              <FileText className="h-4 w-4" />
              <a 
                href={currentUploadedUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:underline truncate max-w-xs"
              >
                View uploaded document
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

  // Tab validation functions
  const validatePermitInfoTab = async () => {
    const fields = ['permitNumber', 'effectiveDate', 'expirationDate', 'facilityProjectName', 'permitLocationProvince', 'permitLocationDistrict', 'permitLocationSector'];
    return await form.trigger(fields as any);
  };

  const validateTransferorTab = async () => {
    const fields = ['transferorName', 'transferorCertification', 'transferorSignatureDate'];
    const valid = await form.trigger(fields as any);
    if (!valid) return false;

    const cert = form.getValues('transferorCertification');
    if (!cert) {
      setValidationError("Transferor must certify the transfer.");
      return false;
    }
    return true;
  };

  const validateTransfereeTab = async () => {
    const fields = [
      'transfereeName', 'transfereeEmail', 'transfereePhone',
      'transfereeAddressProvince', 'transfereeAddressDistrict', 'transfereeAddressSector', 'transfereeAddressCell',
      'transfereeCertification', 'transfereeSignatureDate'
    ];
    const valid = await form.trigger(fields as any);
    if (!valid) return false;

    const cert = form.getValues('transfereeCertification');
    if (!cert) {
      setValidationError("You must confirm the new owner has agreed to accept this transfer.");
      return false;
    }
    return true;
  };

  const validateDocumentsTab = async () => {
    // Check required documents (paymentProof removed - using IremboPay instead)
    const hasCertifiedLetter = files.certifiedLetter || uploadedFileUrls.certifiedLetter;
    const hasRegistration = files.registrationCertificate || uploadedFileUrls.registrationCertificate;
    const hasExistingPermit = files.existingPermitCopy || uploadedFileUrls.existingPermitCopy;

    if (!hasCertifiedLetter) {
      setValidationError("Certified letter is required.");
      return false;
    }
    if (!hasRegistration) {
      setValidationError("Registration certificate is required.");
      return false;
    }
    if (!hasExistingPermit) {
      setValidationError("Copy of existing permit is required.");
      return false;
    }

    return true;
  };

  // Include payment tab for transfers
  const tabs = ["permit-info", "transferor", "transferee", "documents", "payment"];

  const handleTabChange = async (nextTab: string) => {
    if (readOnly) {
      setActiveTab(nextTab);
      return;
    }

    const currentIndex = tabs.indexOf(activeTab);
    const nextIndex = tabs.indexOf(nextTab);

    if (nextIndex === -1) return;

    // Always allow going backwards
    if (nextIndex <= currentIndex) {
      setValidationError(null);
      setActiveTab(nextTab);
      return;
    }

    if (isTabSwitching) return;
    setIsTabSwitching(true);

    const validateByTab: Record<string, (() => Promise<boolean>) | undefined> = {
      "permit-info": validatePermitInfoTab,
      "transferor": validateTransferorTab,
      "transferee": validateTransfereeTab,
      "documents": validateDocumentsTab,
    };

    try {
      setValidationError(null);

      // Validate all prerequisite tabs
      for (let i = 0; i < nextIndex; i++) {
        const tab = tabs[i];
        const validate = validateByTab[tab];
        if (!validate) continue;

        const ok = await validate();
        if (!ok) {
          setActiveTab(tab);
          setValidationError(prev => prev || `Please complete all required fields in this section.`);
          setTimeout(() => setValidationError(null), 5000);
          return;
        }
      }

      setActiveTab(nextTab);
    } finally {
      setIsTabSwitching(false);
    }
  };

  const handleNextTab = async () => {
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex >= tabs.length - 1) return;

    let isValid = false;
    
    switch (activeTab) {
      case "permit-info":
        isValid = await validatePermitInfoTab();
        break;
      case "transferor":
        isValid = await validateTransferorTab();
        break;
      case "transferee":
        isValid = await validateTransfereeTab();
        break;
      case "documents":
        isValid = await validateDocumentsTab();
        break;
      default:
        isValid = true;
    }

    if (isValid) {
      setValidationError(null);
      setActiveTab(tabs[currentIndex + 1]);
    } else {
      setTimeout(() => setValidationError(null), 5000);
    }
  };

  const handleFormSubmit = async (values: TransferFormValues) => {
    try {
      const submissionData = { ...values, ...files };
      await onSubmit(submissionData, 'submitted');
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSavedMessage, setDraftSavedMessage] = useState<string | null>(null);

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    setValidationError(null);
    setDraftSavedMessage(null);
    try {
      const values = form.getValues();
      const draftData = { ...values, ...files };
      await onSaveAsDraft(draftData, 'draft');
      setDraftSavedMessage('Draft saved successfully.');
      setTimeout(() => setDraftSavedMessage(null), 3000);
    } catch (error) {
      console.error('Save draft error:', error);
      setValidationError(error instanceof Error ? error.message : 'Failed to save draft. Please try again.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <Card className="mb-6 border-blue-200 bg-blue-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <ArrowLeftRight className="h-5 w-5" />
            TRANSFER OF WATER USE PERMIT AND RELATED CONTRACT
          </CardTitle>
          <CardDescription className="space-y-2 text-blue-800">
            <p><strong>Contact Email:</strong> info@rwb.rw</p>
            <p><strong>Legal Reference:</strong> LAW N°49/2018 OF 13/08/2018 DETERMINING THE USE AND MANAGEMENT OF WATER RESOURCES IN RWANDA</p>
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-gray-200 dark:border-gray-800">
        <CardHeader>
          <CardTitle>Permit Transfer Application</CardTitle>
          <CardDescription>
            {readOnly 
              ? "Review the permit transfer application details below."
              : "Complete all sections to transfer this water use permit. Fields marked with * are required."
            }
          </CardDescription>
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
            {draftSavedMessage && (
              <Alert className="mb-4 border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  {draftSavedMessage}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
              <Tabs
                defaultValue="permit-info"
                value={activeTab}
                onValueChange={(value) => void handleTabChange(value)}
              >
                <TabsList className={`grid w-full ${isStaffView ? 'grid-cols-4' : 'grid-cols-5'}`}>
                  <TabsTrigger value="permit-info" className="flex items-center gap-1 text-xs">
                    <FileCheck className="h-4 w-4" />
                    <span className="hidden sm:inline">Permit</span>
                  </TabsTrigger>
                  <TabsTrigger value="transferor" className="flex items-center gap-1 text-xs">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">Transferor</span>
                  </TabsTrigger>
                  <TabsTrigger value="transferee" className="flex items-center gap-1 text-xs">
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Transferee</span>
                  </TabsTrigger>
                  <TabsTrigger value="documents" className="flex items-center gap-1 text-xs">
                    <FileText className="h-4 w-4" />
                    <span className="hidden sm:inline">Documents</span>
                  </TabsTrigger>
                  {/* Payment is applicant-only; never show on staff pages (review/assessment/verification/approver/inspection). */}
                  {!isStaffView && (
                    <TabsTrigger value="payment" className="flex items-center gap-1 text-xs">
                      <CreditCard className="h-4 w-4" />
                      <span className="hidden sm:inline">Payment</span>
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* PART 1: PARTICULARS OF THE PERMIT */}
                <TabsContent value="permit-info" className="pt-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <FileCheck className="h-5 w-5" />
                      Part 1: Particulars of the Permit
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Information about the permit being transferred.
                    </p>
                  </div>

                  <Alert className="border-blue-200 bg-blue-50">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                      These details are pre-filled from the selected permit and cannot be modified.
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="permitNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Permit Number</FormLabel>
                          <FormControl>
                            <Input {...field} disabled className="bg-gray-100" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="facilityProjectName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name of Facility/Project</FormLabel>
                          <FormControl>
                            <Input {...field} disabled className="bg-gray-100" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="effectiveDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Effective Date</FormLabel>
                          <FormControl>
                            <Input {...field} type="date" disabled className="bg-gray-100" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="expirationDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expiration Date</FormLabel>
                          <FormControl>
                            <Input {...field} type="date" disabled className="bg-gray-100" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Location</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="permitLocationProvince"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Province / City of Kigali</FormLabel>
                            <FormControl>
                              <Input {...field} disabled className="bg-gray-100" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="permitLocationDistrict"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>District</FormLabel>
                            <FormControl>
                              <Input {...field} disabled className="bg-gray-100" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="permitLocationSector"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sector</FormLabel>
                            <FormControl>
                              <Input {...field} disabled className="bg-gray-100" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Navigation */}
                  <div className="flex justify-between pt-6 border-t">
                    <div />
                    <Button
                      type="button"
                      onClick={handleNextTab}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Next: Transferor Details
                    </Button>
                  </div>
                </TabsContent>

                {/* PART 2: PERMIT HOLDER/TRANSFEROR (YOU - the logged-in user) */}
                <TabsContent value="transferor" className="pt-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Part 2: Your Information (Transferor)
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Your information as the current permit holder who is transferring the permit.
                    </p>
                  </div>

                  <Alert className="border-blue-200 bg-blue-50">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                      Your details are pre-filled from your account profile. You must sign the physical transfer form.
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="transferorName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Name *</FormLabel>
                          <FormControl>
                            <Input {...field} disabled className="bg-gray-100" />
                          </FormControl>
                          <FormDescription>From your account profile</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="transferorRepresentativeName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Representative Name</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} disabled className="bg-gray-100" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="transferorRepresentativePosition"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Position</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} disabled className="bg-gray-100" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Office Address</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="transferorAddressProvince"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Province / City of Kigali</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} disabled className="bg-gray-100" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="transferorAddressDistrict"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>District</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} disabled className="bg-gray-100" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="transferorAddressSector"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sector</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} disabled className="bg-gray-100" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="transferorAddressCell"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cell</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} disabled className="bg-gray-100" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="transferorAddressVillage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Village</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} disabled className="bg-gray-100" />
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
                      name="transferorEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} disabled className="bg-gray-100" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="transferorPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telephone Number</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} disabled className="bg-gray-100" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Certification */}
                  <Card className="border-gray-200 bg-gray-50">
                    <CardHeader>
                      <CardTitle className="text-base">Transferor Certification</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-4 bg-white rounded-md border text-sm">
                        <p className="font-medium mb-2">CERTIFICATION:</p>
                        <p>
                          This is to certify that ownership and operation for facility identified in Part 1 of this form 
                          was transferred to <strong>{form.watch('transfereeName') || '[Transferee Name]'}</strong> (Transferee). 
                          I affirm that this transfer includes rights and obligations of the permit and related contract.
                        </p>
                      </div>

                      <FormField
                        control={form.control}
                        name="transferorCertification"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={readOnly}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>
                                I certify that I am transferring this permit and its obligations *
                              </FormLabel>
                              <FormDescription>
                                You must also sign the physical transfer form.
                              </FormDescription>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="transferorTitlePosition"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Title/Position</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ""} placeholder="e.g., Director, Owner" disabled={readOnly} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="transferorSignatureDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Date *</FormLabel>
                              <FormControl>
                                <Input {...field} type="date" disabled={readOnly} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Navigation */}
                  <div className="flex justify-between pt-6 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveTab("permit-info")}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      onClick={handleNextTab}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Next: Transferee Details
                    </Button>
                  </div>
                </TabsContent>

                {/* PART 3: NEW OWNER (TRANSFEREE) - the person receiving the permit */}
                <TabsContent value="transferee" className="pt-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Part 3: New Owner (Transferee)
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Enter the information of the person or organization who will receive this permit.
                    </p>
                  </div>

                  <Alert className="border-green-200 bg-green-50 mb-4">
                    <AlertCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      Enter the details of the new owner who will take over this permit.
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="transfereeName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name of New Owner *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Full name or company name" disabled={readOnly} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="transfereeRepresentativeName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Representative Name</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} placeholder="If applicable" disabled={readOnly} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="transfereeRepresentativePosition"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Position</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} placeholder="e.g., Manager" disabled={readOnly} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Office Address *</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="transfereeAddressProvince"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Province / City of Kigali *</FormLabel>
                            <Select 
                              onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedTransfereeProvince(value);
                                form.setValue('transfereeAddressDistrict', '');
                                form.setValue('transfereeAddressSector', '');
                                form.setValue('transfereeAddressCell', '');
                                form.setValue('transfereeAddressVillage', '');
                                setSelectedTransfereeDistrict('');
                                setSelectedTransfereeSector('');
                                setSelectedTransfereeCell('');
                                setSelectedTransfereeVillage('');
                              }} 
                              value={field.value || ""}
                              disabled={readOnly}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select Province" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {getFormattedProvinceOptions().map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="transfereeAddressDistrict"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>District *</FormLabel>
                            <Select 
                              onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedTransfereeDistrict(value);
                                form.setValue('transfereeAddressSector', '');
                                form.setValue('transfereeAddressCell', '');
                                form.setValue('transfereeAddressVillage', '');
                                setSelectedTransfereeSector('');
                                setSelectedTransfereeCell('');
                                setSelectedTransfereeVillage('');
                              }} 
                              value={field.value || ""}
                              disabled={!selectedTransfereeProvince || readOnly}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select District" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {getTransfereeDistrictOptions().map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="transfereeAddressSector"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sector *</FormLabel>
                            <Select 
                              onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedTransfereeSector(value);
                                form.setValue('transfereeAddressCell', '');
                                form.setValue('transfereeAddressVillage', '');
                                setSelectedTransfereeCell('');
                                setSelectedTransfereeVillage('');
                              }} 
                              value={field.value || ""}
                              disabled={!selectedTransfereeDistrict || readOnly}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select Sector" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {getTransfereeSectorOptions().map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="transfereeAddressCell"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cell *</FormLabel>
                            <Select 
                              onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedTransfereeCell(value);
                                form.setValue('transfereeAddressVillage', '');
                                setSelectedTransfereeVillage('');
                              }} 
                              value={field.value || ""}
                              disabled={!selectedTransfereeSector || readOnly}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select Cell" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {getTransfereeCellOptions().map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="transfereeAddressVillage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Village</FormLabel>
                            <Select 
                              onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedTransfereeVillage(value);
                              }} 
                              value={field.value || ""}
                              disabled={!selectedTransfereeCell || readOnly}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select Village (optional)" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {getTransfereeVillageOptions().map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="transfereeEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email *</FormLabel>
                          <FormControl>
                            <Input {...field} type="email" placeholder="transferee@example.com" disabled={readOnly} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="transfereePhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telephone Number *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="+250788123456" disabled={readOnly} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Certification - Note: The new owner must acknowledge, but this is being filled by the transferor */}
                  <Card className="border-amber-200 bg-amber-50">
                    <CardHeader>
                      <CardTitle className="text-base text-amber-900">Transferee Acknowledgement</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-4 bg-white rounded-md border text-sm">
                        <p className="font-medium mb-2">TRANSFEREE CERTIFICATION:</p>
                        <p>
                          The new owner acknowledges full responsibility for complying with the terms and conditions of the Permit and 
                          related contract transferred from <strong>{form.watch('transferorName') || '[Your Name]'}</strong> (Transferor) 
                          and any applicable standards and requirements. The operations/project will remain the same as authorized 
                          and any modification will require approval of the Director General of Rwanda Water Resources Board.
                        </p>
                      </div>

                      <FormField
                        control={form.control}
                        name="transfereeCertification"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={readOnly}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-amber-900">
                                I confirm the new owner has agreed to accept this transfer *
                              </FormLabel>
                              <FormDescription>
                                The transferee must sign the physical transfer form to confirm acceptance.
                              </FormDescription>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="transfereeTitlePosition"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Title/Position</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ""} placeholder="e.g., Director, Owner" disabled={readOnly} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="transfereeSignatureDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Date *</FormLabel>
                              <FormControl>
                                <Input {...field} type="date" disabled={readOnly} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Navigation */}
                  <div className="flex justify-between pt-6 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveTab("transferor")}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      onClick={handleNextTab}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Next: Required Documents
                    </Button>
                  </div>
                </TabsContent>

                {/* PART 4: REQUIRED DOCUMENTS */}
                <TabsContent value="documents" className="pt-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Part 4: Required Documents
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Upload all required documents for the permit transfer.
                    </p>
                  </div>

                  <Alert className="border-blue-200 bg-blue-50 mb-6">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-900">Required Documents for Water Permit Transfer</AlertTitle>
                    <AlertDescription className="text-blue-800">
                      <ul className="mt-2 space-y-1 list-disc list-inside">
                        <li>Application Letter (stating reasons for transfer and the names of the new holder)</li>
                        <li>A well-filled and signed transfer form</li>
                        <li>Registration Certificate of Transferee (New Owner)</li>
                        <li>Copy of existing water use permit and its corresponding contract</li>
                      </ul>
                      <p className="mt-2 text-sm italic">Note: Transfer fee payment is handled in the next step via IremboPay.</p>
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <DocumentUploadField
                      fieldName="certifiedLetter"
                      label="Certified Letter"
                      required
                      description="A notarized transfer agreement"
                    />

                    <DocumentUploadField
                      fieldName="registrationCertificate"
                      label="Registration Certificate of Transferee"
                      required
                      description="New owner's registration certificate or ID"
                    />

                    <DocumentUploadField
                      fieldName="existingPermitCopy"
                      label="Copy of Existing Permit and Contract"
                      required
                      description="The current water use permit and corresponding contract"
                    />
                  </div>

                  {/* Navigation to Payment */}
                  <div className="flex justify-between pt-6 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveTab("transferee")}
                    >
                      Previous
                    </Button>

                    <div className="flex gap-3">
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleSaveDraft}
                          disabled={isLoading || isSavingDraft}
                          className="gap-2"
                        >
                          {isSavingDraft ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          {isSavingDraft ? 'Saving...' : 'Save as Draft'}
                        </Button>
                      )}
                      {!isStaffView && (
                        <Button
                          type="button"
                          onClick={async () => {
                            try {
                              // Validate documents tab before proceeding to payment
                              const isValid = await validateDocumentsTab();
                              if (!isValid) {
                                setTimeout(() => setValidationError(null), 5000);
                                return;
                              }

                              // Navigate to payment tab immediately (like airline booking flow)
                              setPaymentPrepError(null);
                              setActiveTab('payment');
                              
                              // Scroll to top for better UX
                              window.scrollTo({ top: 0, behavior: 'smooth' });

                              // Save in background (do not block navigation)
                              const draftData = { ...form.getValues(), ...files };
                              void onSaveAsDraft(draftData, 'draft').catch((error) => {
                                console.error('Error saving transfer application:', error);
                                setPaymentPrepError('Please try saving your application again before proceeding to payment.');
                              });
                            } catch (error) {
                              console.error('Error validating documents tab:', error);
                            }
                          }}
                          className="bg-blue-600 hover:bg-blue-700"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            'Proceed to Payment'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* PART 5: PAYMENT (applicant-only) */}
                {!isStaffView && (
                  <TabsContent value="payment" className="pt-6 space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Part 5: Transfer Application Fee Payment
                      </h3>
                      <p className="text-muted-foreground mb-6">
                        Pay the non-refundable transfer application fee to complete your submission.
                      </p>
                    </div>

                    <PaymentTab
                      application={currentApplication ?? undefined}
                      formData={
                        !currentApplication?.id
                          ? {
                              ...form.getValues(),
                              ...files,
                              // Customer info for payment - use transferor (the one paying)
                              emailAddress: form.getValues("transferorEmail"),
                              telephoneContact: form.getValues("transferorPhone"),
                              fullNameApplicant: form.getValues("transferorName"),
                              // Transfer-specific metadata
                              isTransfer: true,
                              permitId: permit.id,
                              permitNumber: form.getValues("permitNumber"),
                            }
                          : undefined
                      }
                      isSavingApplication={isLoading}
                      saveError={paymentPrepError}
                      onRetrySave={() => {
                        setPaymentPrepError(null);
                        const draftData = { ...form.getValues(), ...files };
                        void onSaveAsDraft(draftData, "draft").catch((error) => {
                          console.error("Error saving transfer application:", error);
                          setPaymentPrepError("Please try saving your application again before proceeding to payment.");
                        });
                      }}
                      onBack={() => setActiveTab("documents")}
                    />
                  </TabsContent>
                )}
              </Tabs>
            </form>
          </Form>
        </CardContent>
      </Card>
    </motion.div>
  );
});

export default PermitTransferForm;
